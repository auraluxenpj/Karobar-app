<?php

namespace App\Console\Commands;

use App\Models\Customer;
use App\Models\CustomerLedger;
use App\Models\SaleInvoice;
use Illuminate\Console\Command;
use Illuminate\Support\Facades\DB;
use Illuminate\Support\Facades\Schema;

class FlushWalkInCreditCommand extends Command
{
    /**
     * The name and signature of the console command.
     *
     * @var string
     */
    protected $signature = 'karobar:flush-walkin-credit
                            {--dry-run : Preview what Walk-In Customer unpaid credit (Udhar) will be flushed without modifying the database}';

    /**
     * The console command aliases.
     *
     * @var array<int, string>
     */
    protected $aliases = [
        'walkin:flush-credit',
        'customers:flush-walkin-credit',
    ];

    /**
     * The console command description.
     *
     * @var string
     */
    protected $description = 'Flush all unpaid credit (Udhar) invoices and ledger entries belonging to Walk-In Customers.';

    /**
     * Execute the console command.
     */
    public function handle(): int
    {
        $dryRun = (bool) $this->option('dry-run');

        $result = self::flush($dryRun);

        if (empty($result['walk_in_customers'])) {
            $this->warn('No Walk-In Customer records found in the database.');
        } else {
            $this->info('Walk-In Customer(s) matched:');
            $this->table(
                ['Customer ID', 'Customer Name'],
                array_map(fn ($c) => [$c['id'], $c['name']], $result['walk_in_customers'])
            );
        }

        $modeLabel = $dryRun ? '[DRY RUN] Would flush' : 'Flushed';

        $this->line('');
        $this->info("{$modeLabel} Walk-In Customer Unpaid Credit (Udhar) Summary:");
        $this->table(
            ['Metric', 'Value'],
            [
                ['Sale Invoices Normalized (Credit/Unpaid -> Paid Debit)', $result['invoices_flushed_count']],
                ['Total Unpaid Invoice Credit (Udhar) Flushed', number_format($result['unpaid_amount_flushed'], 2)],
                ['Customer Ledger Entries Removed', $result['ledger_rows_deleted_count']],
            ]
        );

        if ($dryRun) {
            $this->comment('Dry run completed. Re-run without --dry-run to apply changes.');
        } else {
            $this->info('All Walk-In Customer unpaid credit (Udhar) has been flushed from the database.');
        }

        return self::SUCCESS;
    }

    /**
     * Flush all unpaid credit (Udhar) from sale_invoices and customer_ledgers for Walk-In Customers.
     *
     * @return array{
     *     walk_in_customers: array<int, array{id: int, name: string}>,
     *     invoices_flushed_count: int,
     *     unpaid_amount_flushed: float,
     *     ledger_rows_deleted_count: int
     * }
     */
    public static function flush(bool $dryRun = false): array
    {
        if (!Schema::hasTable('customers')) {
            return [
                'walk_in_customers'         => [],
                'invoices_flushed_count'    => 0,
                'unpaid_amount_flushed'     => 0.0,
                'ledger_rows_deleted_count' => 0,
            ];
        }

        $walkInIds = Customer::walkInIds();
        $walkInCustomers = empty($walkInIds)
            ? []
            : Customer::whereIn('id', $walkInIds)
                ->orderBy('id')
                ->get(['id', 'name'])
                ->map(fn ($c) => ['id' => (int) $c->id, 'name' => (string) $c->name])
                ->all();

        return DB::transaction(function () use ($walkInIds, $walkInCustomers, $dryRun) {
            $invoicesFlushedCount = 0;
            $unpaidAmountFlushed = 0.0;
            $flushedInvoiceIds = [];

            if (Schema::hasTable('sale_invoices')) {
                $invoiceQuery = SaleInvoice::query()
                    ->where(function ($q) use ($walkInIds) {
                        $q->whereNull('customer_id');
                        if (!empty($walkInIds)) {
                            $q->orWhereIn('customer_id', $walkInIds);
                        }
                    })
                    ->where(function ($q) {
                        $q->where('invoice_type', 'credit')
                          ->orWhereRaw('COALESCE(total_receive, 0) < COALESCE(total, 0)');
                    });

                $invoices = $invoiceQuery->lockForUpdate()->get();
                $hasDueDateCol = Schema::hasColumn('sale_invoices', 'due_date');

                foreach ($invoices as $invoice) {
                    $invTotal = round((float) ($invoice->total ?? 0), 2);
                    $invRecv = round((float) ($invoice->total_receive ?? 0), 2);
                    $isReversed = ($invoice->status ?? null) === 'reversed';

                    $unpaid = $isReversed ? 0.0 : round(max(0.0, $invTotal - $invRecv), 2);
                    $unpaidAmountFlushed = round($unpaidAmountFlushed + $unpaid, 2);
                    $invoicesFlushedCount++;
                    $flushedInvoiceIds[] = (int) $invoice->id;

                    if (!$dryRun) {
                        $updates = [
                            'invoice_type'  => 'debit',
                            'total_receive' => $isReversed ? 0 : $invTotal,
                        ];
                        if ($hasDueDateCol) {
                            $updates['due_date'] = null;
                        }
                        DB::table('sale_invoices')
                            ->where('id', $invoice->id)
                            ->update($updates);
                    }
                }
            }

            $ledgerRowsDeletedCount = 0;
            if (!$dryRun && !empty($flushedInvoiceIds) && Schema::hasTable('payment_allocations')) {
                $allocs = \App\Models\PaymentAllocation::where('invoice_type', 'sale_invoice')
                    ->whereIn('invoice_id', $flushedInvoiceIds)
                    ->get();
                $paymentIds = $allocs->pluck('payment_id')->filter()->unique()->all();
                \App\Models\PaymentAllocation::where('invoice_type', 'sale_invoice')
                    ->whereIn('invoice_id', $flushedInvoiceIds)
                    ->delete();
                if (!empty($paymentIds) && Schema::hasTable('payments')) {
                    foreach (\App\Models\Payment::whereIn('id', $paymentIds)->get() as $pay) {
                        $newAlloc = (float) \App\Models\PaymentAllocation::where('payment_id', $pay->id)->sum('amount');
                        $pay->allocated_amount = round($newAlloc, 2);
                        $pay->unapplied_amount = round(max(0.0, (float) $pay->amount - $newAlloc), 2);
                        $pay->save();
                    }
                }
            }
            if (Schema::hasTable('customer_ledgers')) {
                $ledgerQuery = CustomerLedger::query()
                    ->where(function ($q) use ($walkInIds, $flushedInvoiceIds) {
                        $q->whereNull('customer_id');
                        if (!empty($walkInIds)) {
                            $q->orWhereIn('customer_id', $walkInIds);
                        }
                        if (!empty($flushedInvoiceIds)) {
                            $q->orWhereIn('sale_invoice_id', $flushedInvoiceIds);
                        }
                    });

                $ledgerRowsDeletedCount = (int) $ledgerQuery->count();
                if (!$dryRun && $ledgerRowsDeletedCount > 0) {
                    $ledgerQuery->delete();
                }
            }

            return [
                'walk_in_customers'         => $walkInCustomers,
                'invoices_flushed_count'    => $invoicesFlushedCount,
                'unpaid_amount_flushed'     => $unpaidAmountFlushed,
                'ledger_rows_deleted_count' => $ledgerRowsDeletedCount,
            ];
        });
    }
}

