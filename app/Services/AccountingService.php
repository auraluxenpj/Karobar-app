<?php

namespace App\Services;

use App\Models\Account;
use App\Models\ChartOfAccount;
use App\Models\JournalEntry;
use App\Models\JournalEntryLine;
use App\Models\TaxRate;
use App\Models\User;
use Carbon\Carbon;
use Illuminate\Support\Facades\DB;
use Illuminate\Support\Facades\Schema;
use Illuminate\Validation\ValidationException;

class AccountingService
{
    protected AccountService $accountService;
    protected $lastTreasuryAccounts = null;

    public function __construct(AccountService $accountService)
    {
        $this->accountService = $accountService;
    }

    /**
     * Ensure standard Chart of Accounts and Tax Rates exist (safe for fresh/test DBs).
     */
    public function ensureDefaults(): void
    {
        if (!Schema::hasTable('chart_of_accounts')) {
            return;
        }

        if (ChartOfAccount::count() === 0) {
            $migration = include database_path('migrations/2026_10_29_000001_create_accounting_and_tax_engine_tables.php');
            if (is_object($migration) && method_exists($migration, 'up')) {
                $migration->up();
            }
        }
    }

    /**
     * Get all Chart of Accounts ordered by code.
     */
    public function getChartOfAccounts(bool $activeOnly = false)
    {
        $this->ensureDefaults();
        $query = ChartOfAccount::orderBy('code');
        if ($activeOnly) {
            $query->where('is_active', true);
        }
        return $query->get();
    }

    /**
     * Get all Tax Rates ordered by rate desc.
     */
    public function getTaxRates(bool $activeOnly = false)
    {
        $this->ensureDefaults();
        if (!Schema::hasTable('tax_rates')) {
            return collect();
        }
        $query = TaxRate::orderByDesc('is_default')->orderByDesc('rate')->orderBy('name');
        if ($activeOnly) {
            $query->where('is_active', true);
        }
        return $query->get();
    }

    /**
     * Create a balanced Double-Entry Journal Voucher (JV).
     */
    public function createJournalEntry(array $data, ?User $user = null): JournalEntry
    {
        $this->ensureDefaults();

        $lines = $data['lines'] ?? [];
        if (!is_array($lines) || count($lines) < 2) {
            throw ValidationException::withMessages([
                'lines' => 'A double-entry journal voucher requires at least 2 lines (Debit and Credit).',
            ]);
        }

        $normalizedLines = [];
        $totalDebit = 0.0;
        $totalCredit = 0.0;

        foreach ($lines as $idx => $line) {
            $accountId = (int) ($line['chart_of_account_id'] ?? 0);
            $debit = round(max(0.0, (float) ($line['debit'] ?? 0)), 2);
            $credit = round(max(0.0, (float) ($line['credit'] ?? 0)), 2);

            if ($accountId <= 0) {
                throw ValidationException::withMessages([
                    "lines.{$idx}.chart_of_account_id" => 'Please select a valid account for each journal line.',
                ]);
            }
            if ($debit <= 0 && $credit <= 0) {
                continue;
            }
            if ($debit > 0 && $credit > 0) {
                throw ValidationException::withMessages([
                    "lines.{$idx}.debit" => 'A single journal line cannot have both Debit and Credit amounts.',
                ]);
            }

            $totalDebit = round($totalDebit + $debit, 2);
            $totalCredit = round($totalCredit + $credit, 2);

            $normalizedLines[] = [
                'chart_of_account_id' => $accountId,
                'party_type'          => $line['party_type'] ?? null,
                'party_id'            => !empty($line['party_id']) ? (int) $line['party_id'] : null,
                'description'         => trim((string) ($line['description'] ?? '')) ?: null,
                'debit'               => $debit,
                'credit'              => $credit,
            ];
        }

        if (count($normalizedLines) < 2) {
            throw ValidationException::withMessages([
                'lines' => 'At least two non-zero journal lines are required.',
            ]);
        }

        if ($totalDebit <= 0 || abs($totalDebit - $totalCredit) > 0.009) {
            throw ValidationException::withMessages([
                'total_debit' => sprintf(
                    'Journal entry is unbalanced: Total Debit (%s) must equal Total Credit (%s).',
                    number_format($totalDebit, 2),
                    number_format($totalCredit, 2)
                ),
            ]);
        }

        return DB::transaction(function () use ($data, $normalizedLines, $totalDebit, $totalCredit, $user) {
            $entryDate = !empty($data['entry_date'])
                ? Carbon::parse($data['entry_date'])->toDateString()
                : Carbon::today()->toDateString();

            $entryNumber = !empty($data['entry_number'])
                ? trim((string) $data['entry_number'])
                : JournalEntry::generateEntryNumber($entryDate);

            $treasuryAccountId = !empty($data['account_id']) ? (int) $data['account_id'] : null;

            $entry = JournalEntry::create([
                'entry_number'     => $entryNumber,
                'entry_date'       => $entryDate,
                'reference_type'   => $data['reference_type'] ?? 'manual',
                'reference_number' => $data['reference_number'] ?? null,
                'account_id'       => $treasuryAccountId,
                'description'      => trim((string) ($data['description'] ?? 'Manual Journal Entry')),
                'total_debit'      => $totalDebit,
                'total_credit'     => $totalCredit,
                'status'           => 'posted',
                'created_by'       => $user?->id,
            ]);

            $cashBankCoaIds = ChartOfAccount::where('sub_type', 'cash_bank')
                ->orWhere('system_key', 'cash_and_banks')
                ->pluck('id')
                ->map(fn ($id) => (int) $id)
                ->all();

            $netCashDelta = 0.0;

            foreach ($normalizedLines as $lineData) {
                $entry->lines()->create($lineData);
                if (in_array((int) $lineData['chart_of_account_id'], $cashBankCoaIds, true)) {
                    $netCashDelta = round($netCashDelta + ($lineData['debit'] - $lineData['credit']), 2);
                }
            }

            // If a specific Treasury Account was selected and Cash/Bank COA was debited/credited, sync the treasury account balance
            if ($treasuryAccountId && abs($netCashDelta) > 0.009) {
                $treasuryAcc = Account::find($treasuryAccountId);
                if ($treasuryAcc) {
                    if ($netCashDelta > 0) {
                        $this->accountService->deposit(
                            $treasuryAcc,
                            $netCashDelta,
                            'journal_entry',
                            $entry->id,
                            "JV {$entry->entry_number}: {$entry->description}",
                            $user
                        );
                    } else {
                        $this->accountService->withdraw(
                            $treasuryAcc,
                            abs($netCashDelta),
                            'journal_entry',
                            $entry->id,
                            "JV {$entry->entry_number}: {$entry->description}",
                            $user
                        );
                    }
                }
            }

            return $entry->load(['lines.account', 'creator:id,name', 'treasuryAccount:id,name,type']);
        });
    }

    /**
     * Reverse a posted Journal Entry.
     */
    public function reverseJournalEntry(JournalEntry $entry, string $reason, ?User $user = null): JournalEntry
    {
        if ($entry->status === 'reversed') {
            throw ValidationException::withMessages([
                'status' => 'This journal entry has already been reversed.',
            ]);
        }

        return DB::transaction(function () use ($entry, $reason, $user) {
            $entry->load('lines.account');

            if ($entry->account_id) {
                $treasuryAcc = Account::find($entry->account_id);
                if ($treasuryAcc) {
                    $cashBankCoaIds = ChartOfAccount::where('sub_type', 'cash_bank')
                        ->orWhere('system_key', 'cash_and_banks')
                        ->pluck('id')
                        ->map(fn ($id) => (int) $id)
                        ->all();

                    $netCashDelta = 0.0;
                    foreach ($entry->lines as $line) {
                        if (in_array((int) $line->chart_of_account_id, $cashBankCoaIds, true)) {
                            $netCashDelta = round($netCashDelta + ((float) $line->debit - (float) $line->credit), 2);
                        }
                    }

                    if (abs($netCashDelta) > 0.009) {
                        if ($netCashDelta > 0) {
                            $this->accountService->withdraw(
                                $treasuryAcc,
                                $netCashDelta,
                                'journal_entry_reversal',
                                $entry->id,
                                "Reversal of JV {$entry->entry_number}: {$reason}",
                                $user
                            );
                        } else {
                            $this->accountService->deposit(
                                $treasuryAcc,
                                abs($netCashDelta),
                                'journal_entry_reversal',
                                $entry->id,
                                "Reversal of JV {$entry->entry_number}: {$reason}",
                                $user
                            );
                        }
                    }
                }
            }

            $entry->update([
                'status'          => 'reversed',
                'reversed_by'     => $user?->id,
                'reversed_at'     => now(),
                'reversal_reason' => trim($reason),
            ]);

            return $entry->fresh(['lines.account', 'creator:id,name', 'reversedByUser:id,name', 'treasuryAccount:id,name,type']);
        });
    }

    /**
     * Compute live operational sub-ledger balances as of a given date and period range.
     */
    protected function computeOperationalMetrics(string $fromDate, string $toDate): array
    {
        $from = Carbon::parse($fromDate)->toDateString();
        $to = Carbon::parse($toDate)->toDateString();

        // 1. Treasury Cash & Bank Balances
        $this->accountService->syncCashDrawerBalance();
        $treasuryAccounts = Schema::hasTable('accounts')
            ? Account::where('is_active', true)->orderBy('type')->orderBy('name')->get()
            : collect();
        $totalCashAndBanks = round((float) $treasuryAccounts->sum('current_balance'), 2);

        // 2. Accounts Receivable (Customer Net Balances)
        $totalReceivables = \App\Support\SchemaCache::hasTable('customer_ledgers')
            ? \App\Models\CustomerLedger::getTotalReceivablesBalance()
            : 0.0;

        // 3. Accounts Payable (Supplier Net Balances)
        $totalPayables = 0.0;
        if (Schema::hasTable('supplier_ledgers')) {
            $invRows = DB::table('supplier_ledgers')
                ->whereIn('entry_type', ['invoice', 'manual'])
                ->selectRaw('supplier_id, SUM(COALESCE(invoice_total, 0)) as total_inv, SUM(CASE WHEN COALESCE(total_paid, 0) < COALESCE(invoice_total, 0) THEN COALESCE(total_paid, 0) ELSE COALESCE(invoice_total, 0) END) as paid_on_inv')
                ->groupBy('supplier_id')
                ->get()
                ->keyBy('supplier_id');

            $payRows = DB::table('supplier_ledgers')
                ->where('entry_type', 'payment')
                ->selectRaw('supplier_id, SUM(COALESCE(debited_amount, 0)) as total_debited')
                ->groupBy('supplier_id')
                ->get()
                ->keyBy('supplier_id');

            $allSupIds = $invRows->keys()->merge($payRows->keys())->unique();
            foreach ($allSupIds as $sid) {
                $inv = $invRows->get($sid);
                $pay = $payRows->get($sid);
                $net = (($inv->total_inv ?? 0) - ($inv->paid_on_inv ?? 0)) - ($pay->total_debited ?? 0);
                if ($net > 0) {
                    $totalPayables += $net;
                }
            }
        }
        $totalPayables = round($totalPayables, 2);

        // 4. Merchandise Inventory Valuation (On-Hand Stock at Weighted Average / Unit Purchase Cost)
        $inventoryValuation = (float) DB::table('products')
            ->where('quantity', '>', 0)
            ->sum(DB::raw('COALESCE(quantity, 0) * CASE WHEN avg_price IS NULL OR avg_price <= 0 THEN COALESCE(unit_purchase_price, 0) ELSE avg_price END'));
        $inventoryValuation = round(max(0.0, $inventoryValuation), 2);

        // 5. Period & Cumulative Sales / Output Tax / Discounts
        $periodSales = DB::table('sale_invoices')
            ->whereBetween('date', [$from, $to])
            ->where(fn ($q) => $q->whereNull('status')->orWhere('status', '!=', 'reversed'))
            ->selectRaw('
                SUM(COALESCE(gross_amount, total - COALESCE(tax_amount, 0) + COALESCE(discount_amount, 0))) as gross_sales,
                SUM(COALESCE(discount_amount, 0)) as discount_amount,
                SUM(COALESCE(tax_amount, 0)) as tax_amount,
                SUM(COALESCE(total, 0)) as net_total
            ')
            ->first();

        $cumulativeSalesTax = (float) DB::table('sale_invoices')
            ->where('date', '<=', $to)
            ->where(fn ($q) => $q->whereNull('status')->orWhere('status', '!=', 'reversed'))
            ->sum(DB::raw('COALESCE(tax_amount, 0)'));

        $periodSaleReturns = DB::table('sale_returns')
            ->whereBetween('date', [$from, $to])
            ->selectRaw('
                SUM(COALESCE(total, 0) - COALESCE(tax_amount, 0)) as net_returns,
                SUM(COALESCE(tax_amount, 0)) as tax_amount,
                SUM(COALESCE(total, 0)) as total_returns
            ')
            ->first();

        $cumulativeSaleReturnTax = (float) DB::table('sale_returns')
            ->where('date', '<=', $to)
            ->sum(DB::raw('COALESCE(tax_amount, 0)'));

        // 6. Period & Cumulative Purchases / Input Tax
        $periodPurchases = DB::table('purchase_invoices')
            ->whereBetween(DB::raw('DATE(posted_date)'), [$from, $to])
            ->where(fn ($q) => $q->whereNull('status')->orWhere('status', '!=', 'reversed'))
            ->selectRaw('
                SUM(COALESCE(tax_amount, 0)) as tax_amount,
                SUM(COALESCE(total_amount, 0)) as total_amount
            ')
            ->first();

        $cumulativePurchaseTax = (float) DB::table('purchase_invoices')
            ->where(DB::raw('DATE(posted_date)'), '<=', $to)
            ->where(fn ($q) => $q->whereNull('status')->orWhere('status', '!=', 'reversed'))
            ->sum(DB::raw('COALESCE(tax_amount, 0)'));

        $cumulativePurchaseReturnTax = (float) DB::table('purchase_returns')
            ->where(DB::raw('DATE(date)'), '<=', $to)
            ->sum(DB::raw('COALESCE(tax_amount, 0)'));

        // 7. Period COGS
        $hasBonusCol = Schema::hasColumn('sale_invoice_items', 'bonus');
        $saleUnitsExpr = $hasBonusCol
            ? '(COALESCE(sii.quantity, 0) + COALESCE(sii.bonus, 0))'
            : 'COALESCE(sii.quantity, 0)';
        $cogsSales = (float) DB::table('sale_invoice_items as sii')
            ->join('sale_invoices as si', 'si.id', '=', 'sii.sale_invoice_id')
            ->join('products as p', 'p.id', '=', 'sii.product_id')
            ->whereBetween('si.date', [$from, $to])
            ->where(fn ($q) => $q->whereNull('si.status')->orWhere('si.status', '!=', 'reversed'))
            ->sum(DB::raw("{$saleUnitsExpr} * COALESCE(sii.cost_price_snapshot, CASE WHEN p.avg_price IS NULL OR p.avg_price <= 0 THEN COALESCE(p.unit_purchase_price, 0) ELSE p.avg_price END)"));

        $cogsReturns = (float) DB::table('sale_return_items as sri')
            ->join('sale_returns as sr', 'sr.id', '=', 'sri.sale_return_id')
            ->join('products as p', 'p.id', '=', 'sri.product_id')
            ->whereBetween('sr.date', [$from, $to])
            ->sum(DB::raw('COALESCE(sri.unit_return_quantity, 0) * COALESCE(sri.cost_price_snapshot, CASE WHEN p.avg_price IS NULL OR p.avg_price <= 0 THEN COALESCE(p.unit_purchase_price, 0) ELSE p.avg_price END)'));

        $periodCogs = round(max(0.0, $cogsSales - $cogsReturns), 2);

        // 8. Period Inventory Shrinkage / Disposals (COA 5200)
        $disposalLoss = 0.0;
        if (Schema::hasTable('stock_disposals')) {
            $costCol = Schema::hasColumn('stock_disposals', 'total_cost_value') ? 'total_cost_value' : 'total_cost';
            if (Schema::hasColumn('stock_disposals', $costCol)) {
                $disposalLoss += (float) DB::table('stock_disposals')
                    ->whereBetween(DB::raw('COALESCE(DATE(disposed_at), DATE(disposal_date))'), [$from, $to])
                    ->where('status', 'disposed')
                    ->sum(DB::raw("COALESCE({$costCol}, 0)"));
            }
        }
        if (Schema::hasTable('expenses') && Schema::hasTable('expense_categories')) {
            $shrinkageQuery = DB::table('expenses as e')
                ->join('expense_categories as ec', 'ec.id', '=', 'e.expense_category_id')
                ->whereBetween('e.date', [$from, $to])
                ->whereNull('e.deleted_at')
                ->whereIn('ec.code', ['stock_disposal_writeoff', 'stock_shrinkage_writeoff']);

            if (Schema::hasTable('stock_disposals') && Schema::hasColumn('stock_disposals', 'expense_id')) {
                $shrinkageQuery->whereNotExists(function ($sub) {
                    $sub->select(DB::raw(1))
                        ->from('stock_disposals as sd')
                        ->whereColumn('sd.expense_id', 'e.id')
                        ->where('sd.status', 'disposed');
                });
            }

            $disposalLoss += (float) $shrinkageQuery->sum('e.amount');
        }
        $periodShrinkage = round(max(0.0, $disposalLoss), 2);

        // 9. Period Operating Expenses (COA 5300 — excluding non-cash inventory disposal/shrinkage write-offs already in 5200)
        $periodExpenses = 0.0;
        if (Schema::hasTable('expenses')) {
            $expQuery = DB::table('expenses as e')
                ->leftJoin('expense_categories as ec', 'ec.id', '=', 'e.expense_category_id')
                ->whereBetween('e.date', [$from, $to])
                ->whereNull('e.deleted_at')
                ->where(function ($q) {
                    $q->whereNull('ec.code')
                      ->orWhereNotIn('ec.code', ['stock_disposal_writeoff', 'stock_shrinkage_writeoff']);
                });
            $periodExpenses = round((float) $expQuery->sum('e.amount'), 2);
        }

        return [
            'treasury_accounts'   => $treasuryAccounts,
            'cash_and_banks'      => $totalCashAndBanks,
            'accounts_receivable' => $totalReceivables,
            'accounts_payable'    => $totalPayables,
            'inventory_valuation' => $inventoryValuation,
            'output_tax_payable'  => round(max(0.0, $cumulativeSalesTax - $cumulativeSaleReturnTax), 2),
            'input_tax_receivable'=> round(max(0.0, $cumulativePurchaseTax - $cumulativePurchaseReturnTax), 2),
            'gross_sales'         => round((float) ($periodSales->gross_sales ?? 0), 2),
            'sales_discounts'     => round((float) ($periodSales->discount_amount ?? 0), 2),
            'sales_returns'       => round(max(0.0, (float) ($periodSaleReturns->net_returns ?? 0)), 2),
            'period_cogs'         => $periodCogs,
            'period_shrinkage'    => $periodShrinkage,
            'period_expenses'     => $periodExpenses,
            'period_output_tax'   => round((float) ($periodSales->tax_amount ?? 0) - (float) ($periodSaleReturns->tax_amount ?? 0), 2),
            'period_input_tax'    => round((float) ($periodPurchases->tax_amount ?? 0), 2),
        ];
    }

    /**
     * Generate a mathematically balanced Double-Entry Trial Balance for the given period.
     */
    public function getTrialBalance(string $fromDate, string $toDate): array
    {
        $this->ensureDefaults();
        $from = Carbon::parse($fromDate)->toDateString();
        $to = Carbon::parse($toDate)->toDateString();

        $ops = $this->computeOperationalMetrics($from, $to);
        $this->lastTreasuryAccounts = $ops['treasury_accounts'] ?? collect();
        $accounts = ChartOfAccount::where('is_active', true)->orderBy('code')->get();

        // Aggregate manual JournalEntryLine amounts up to $to (excluding lines already synced to Treasury Account if system_key === cash_and_banks)
        $manualTotals = DB::table('journal_entry_lines as jel')
            ->join('journal_entries as je', 'je.id', '=', 'jel.journal_entry_id')
            ->where('je.status', 'posted')
            ->where('je.entry_date', '<=', $to)
            ->selectRaw('
                jel.chart_of_account_id,
                SUM(CASE WHEN je.account_id IS NOT NULL THEN 0 ELSE jel.debit END) as unsynced_debit,
                SUM(CASE WHEN je.account_id IS NOT NULL THEN 0 ELSE jel.credit END) as unsynced_credit,
                SUM(jel.debit) as total_debit,
                SUM(jel.credit) as total_credit
            ')
            ->groupBy('jel.chart_of_account_id')
            ->get()
            ->keyBy('chart_of_account_id');

        $rows = [];
        $sumDebit = 0.0;
        $sumCredit = 0.0;
        $capitalRowIndex = null;

        foreach ($accounts as $acc) {
            $m = $manualTotals->get($acc->id);
            $manDebit = round((float) ($m->total_debit ?? 0), 2);
            $manCredit = round((float) ($m->total_credit ?? 0), 2);
            $opening = round((float) ($acc->opening_balance ?? 0), 2);

            $baseDebit = 0.0;
            $baseCredit = 0.0;

            switch ($acc->system_key) {
                case 'cash_and_banks':
                    // Treasury accounts already include synced journal entries, so only add unsynced manual journal deltas
                    $unsyncedDelta = round((float) ($m->unsynced_debit ?? 0) - (float) ($m->unsynced_credit ?? 0), 2);
                    $val = round($ops['cash_and_banks'] + $unsyncedDelta + $opening, 2);
                    if ($val >= 0) {
                        $baseDebit = $val;
                    } else {
                        $baseCredit = abs($val);
                    }
                    $manDebit = 0.0;
                    $manCredit = 0.0;
                    break;

                case 'accounts_receivable':
                    $baseDebit = round($ops['accounts_receivable'] + $opening, 2);
                    break;

                case 'merchandise_inventory':
                    $baseDebit = round($ops['inventory_valuation'] + $opening, 2);
                    break;

                case 'input_tax_receivable':
                    $baseDebit = round($ops['input_tax_receivable'] + $opening, 2);
                    break;

                case 'accounts_payable':
                    $baseCredit = round($ops['accounts_payable'] + $opening, 2);
                    break;

                case 'output_tax_payable':
                    $baseCredit = round($ops['output_tax_payable'] + $opening, 2);
                    break;

                case 'gross_sales_revenue':
                    $baseCredit = round($ops['gross_sales'] + $opening, 2);
                    break;

                case 'sales_returns':
                    $baseDebit = round($ops['sales_returns'] + $opening, 2);
                    break;

                case 'sales_discounts':
                    $baseDebit = round($ops['sales_discounts'] + $opening, 2);
                    break;

                case 'cost_of_goods_sold':
                    $baseDebit = round($ops['period_cogs'] + $opening, 2);
                    break;

                case 'inventory_shrinkage':
                    $baseDebit = round($ops['period_shrinkage'] + $opening, 2);
                    break;

                case 'operating_expenses':
                    $baseDebit = round($ops['period_expenses'] + $opening, 2);
                    break;

                default:
                    if ($acc->normal_balance === 'debit') {
                        $baseDebit = $opening;
                    } else {
                        $baseCredit = $opening;
                    }
                    break;
            }

            $net = round(($baseDebit + $manDebit) - ($baseCredit + $manCredit), 2);
            $rowDebit = $net > 0 ? $net : 0.0;
            $rowCredit = $net < 0 ? abs($net) : 0.0;

            if ($acc->system_key === 'owners_capital') {
                $capitalRowIndex = count($rows);
            }

            $sumDebit = round($sumDebit + $rowDebit, 2);
            $sumCredit = round($sumCredit + $rowCredit, 2);

            $rows[] = [
                'id'              => $acc->id,
                'code'            => $acc->code,
                'name'            => $acc->name,
                'account_type'    => $acc->account_type,
                'sub_type'        => $acc->sub_type,
                'normal_balance'  => $acc->normal_balance,
                'system_key'      => $acc->system_key,
                'is_system'       => (bool) $acc->is_system,
                'opening_balance' => $opening,
                'manual_debit'    => round((float) ($m->total_debit ?? 0), 2),
                'manual_credit'   => round((float) ($m->total_credit ?? 0), 2),
                'debit'           => $rowDebit,
                'credit'          => $rowCredit,
                'net_balance'     => $rowDebit > 0 ? $rowDebit : $rowCredit,
                'balance_side'    => $rowDebit > 0 ? 'Dr' : ($rowCredit > 0 ? 'Cr' : '—'),
            ];
        }

        // Balance Opening Equity / Capital Reserve (3100) so single-entry historical opening stock/treasury is automatically balanced in double-entry
        if ($capitalRowIndex !== null && abs($sumDebit - $sumCredit) > 0.001) {
            $diff = round($sumDebit - $sumCredit, 2); // positive means Debits > Credits, so Equity is credited
            $capRow = $rows[$capitalRowIndex];
            $sumDebit = round($sumDebit - $capRow['debit'], 2);
            $sumCredit = round($sumCredit - $capRow['credit'], 2);

            $currentCapNet = round($capRow['credit'] - $capRow['debit'] + $diff, 2);
            if ($currentCapNet >= 0) {
                $rows[$capitalRowIndex]['credit'] = $currentCapNet;
                $rows[$capitalRowIndex]['debit'] = 0.0;
                $rows[$capitalRowIndex]['net_balance'] = $currentCapNet;
                $rows[$capitalRowIndex]['balance_side'] = $currentCapNet > 0 ? 'Cr' : '—';
            } else {
                $rows[$capitalRowIndex]['debit'] = abs($currentCapNet);
                $rows[$capitalRowIndex]['credit'] = 0.0;
                $rows[$capitalRowIndex]['net_balance'] = abs($currentCapNet);
                $rows[$capitalRowIndex]['balance_side'] = 'Dr';
            }

            $sumDebit = round($sumDebit + $rows[$capitalRowIndex]['debit'], 2);
            $sumCredit = round($sumCredit + $rows[$capitalRowIndex]['credit'], 2);
        }

        $byClass = [
            'asset'     => ['debit' => 0.0, 'credit' => 0.0],
            'liability' => ['debit' => 0.0, 'credit' => 0.0],
            'equity'    => ['debit' => 0.0, 'credit' => 0.0],
            'revenue'   => ['debit' => 0.0, 'credit' => 0.0],
            'expense'   => ['debit' => 0.0, 'credit' => 0.0],
        ];
        foreach ($rows as $r) {
            $type = $r['account_type'];
            if (isset($byClass[$type])) {
                $byClass[$type]['debit'] = round($byClass[$type]['debit'] + $r['debit'], 2);
                $byClass[$type]['credit'] = round($byClass[$type]['credit'] + $r['credit'], 2);
            }
        }

        return [
            'period' => [
                'from' => $from,
                'to'   => $to,
            ],
            'rows'        => $rows,
            'by_class'    => $byClass,
            'total_debit' => $sumDebit,
            'total_credit'=> $sumCredit,
            'difference'  => round(abs($sumDebit - $sumCredit), 2),
            'is_balanced' => abs($sumDebit - $sumCredit) < 0.01,
        ];
    }

    /**
     * Generate Statement of Financial Position (Balance Sheet) as of a date.
     */
    public function getBalanceSheet(string $asOfDate): array
    {
        $asOf = Carbon::parse($asOfDate)->toDateString();
        $yearStart = substr($asOf, 0, 4) . '-01-01';
        $tb = $this->getTrialBalance($yearStart, $asOf);
        $treasuryAccounts = $this->lastTreasuryAccounts ?? collect();

        $assets = [];
        $liabilities = [];
        $equity = [];

        $totalAssets = 0.0;
        $totalLiabilities = 0.0;
        $totalRevenue = 0.0;
        $totalExpenses = 0.0;

        foreach ($tb['rows'] as $row) {
            if ($row['account_type'] === 'asset') {
                $amount = round($row['debit'] - $row['credit'], 2);
                $totalAssets = round($totalAssets + $amount, 2);
                $assets[] = array_merge($row, [
                    'amount'       => $amount,
                    'sub_accounts' => $row['system_key'] === 'cash_and_banks'
                        ? $treasuryAccounts->map(fn ($a) => [
                            'id'      => $a->id,
                            'name'    => $a->name,
                            'type'    => $a->type,
                            'balance' => round((float) $a->current_balance, 2),
                        ])->values()->all()
                        : [],
                ]);
            } elseif ($row['account_type'] === 'liability') {
                $amount = round($row['credit'] - $row['debit'], 2);
                $totalLiabilities = round($totalLiabilities + $amount, 2);
                $liabilities[] = array_merge($row, ['amount' => $amount]);
            } elseif ($row['account_type'] === 'revenue') {
                $totalRevenue = round($totalRevenue + ($row['credit'] - $row['debit']), 2);
            } elseif ($row['account_type'] === 'expense') {
                $totalExpenses = round($totalExpenses + ($row['debit'] - $row['credit']), 2);
            } elseif ($row['account_type'] === 'equity') {
                $amount = round($row['credit'] - $row['debit'], 2);
                $equity[] = array_merge($row, ['amount' => $amount]);
            }
        }

        $periodNetIncome = round($totalRevenue - $totalExpenses, 2);

        // Attach YTD Net Income into Retained Earnings (3300)
        $totalEquity = 0.0;
        foreach ($equity as &$eqRow) {
            if ($eqRow['system_key'] === 'retained_earnings') {
                $eqRow['amount'] = round($eqRow['amount'] + $periodNetIncome, 2);
                $eqRow['includes_net_income'] = $periodNetIncome;
            }
            $totalEquity = round($totalEquity + $eqRow['amount'], 2);
        }
        unset($eqRow);

        $totalLiabilitiesAndEquity = round($totalLiabilities + $totalEquity, 2);

        return [
            'as_of'                        => $asOf,
            'assets'                       => $assets,
            'liabilities'                  => $liabilities,
            'equity'                       => $equity,
            'total_assets'                 => $totalAssets,
            'total_liabilities'            => $totalLiabilities,
            'period_net_income'            => $periodNetIncome,
            'total_equity'                 => $totalEquity,
            'total_liabilities_and_equity' => $totalLiabilitiesAndEquity,
            'is_balanced'                  => abs($totalAssets - $totalLiabilitiesAndEquity) < 0.01,
        ];
    }

    /**
     * Generate Cash Flow Statement for the given period.
     */
    public function getCashFlowStatement(string $fromDate, string $toDate): array
    {
        $from = Carbon::parse($fromDate)->toDateString();
        $to = Carbon::parse($toDate)->toDateString();

        // 1. Operating Cash Inflows: Direct tender received on Sale Invoices (excluding allocations) + Cash/Bank Customer Payment Vouchers
        $rawCashOnSales = (float) DB::table('sale_invoices')
            ->whereBetween('date', [$from, $to])
            ->where(fn ($q) => $q->whereNull('status')->orWhere('status', '!=', 'reversed'))
            ->sum(DB::raw("CASE WHEN COALESCE(invoice_type, 'debit') = 'debit' AND COALESCE(total_receive, 0) <= 0 THEN COALESCE(total, 0) ELSE COALESCE(total_receive, 0) END"));

        $allocatedOnPeriodSales = 0.0;
        if (Schema::hasTable('payment_allocations') && Schema::hasTable('payments')) {
            $allocatedOnPeriodSales = (float) DB::table('payment_allocations as pa')
                ->join('sale_invoices as si', function ($join) {
                    $join->on('si.id', '=', 'pa.invoice_id')
                         ->where('pa.invoice_type', '=', 'sale_invoice');
                })
                ->join('payments as p', 'p.id', '=', 'pa.payment_id')
                ->whereBetween('si.date', [$from, $to])
                ->where(fn ($q) => $q->whereNull('si.status')->orWhere('si.status', '!=', 'reversed'))
                ->where('p.status', 'posted')
                ->sum('pa.amount');
        }
        $cashOnSales = max(0.0, round($rawCashOnSales - $allocatedOnPeriodSales, 2));

        $customerPaymentReceipts = 0.0;
        if (Schema::hasTable('payments')) {
            $custPayQuery = DB::table('payments')
                ->where('party_type', 'customer')
                ->whereBetween(DB::raw('DATE(payment_date)'), [$from, $to])
                ->where(fn ($q) => $q->whereNull('status')->orWhere('status', '!=', 'reversed'))
                ->where(fn ($q) => $q->whereNull('payment_method')->orWhere('payment_method', '!=', 'credit_note'));
            if (Schema::hasColumn('payments', 'cheque_status')) {
                $custPayQuery->where(fn ($q) => $q->whereNull('cheque_status')->orWhere('cheque_status', 'cleared'));
            }
            $customerPaymentReceipts = (float) $custPayQuery->sum('amount');
        }

        $purchaseReturnCashRefunds = (float) DB::table('purchase_returns')
            ->whereBetween(DB::raw('DATE(date)'), [$from, $to])
            ->where('settlement_mode', 'cash_refund')
            ->sum('total');

        // 2. Operating Cash Outflows: Direct tender paid on Purchase Invoices (excluding allocations) + Cash/Bank Supplier Payment Vouchers + Cash Operating Expenses + Sale Return Refunds
        $rawCashOnPurchases = (float) DB::table('purchase_invoices')
            ->whereBetween(DB::raw('DATE(posted_date)'), [$from, $to])
            ->where(fn ($q) => $q->whereNull('status')->orWhere('status', '!=', 'reversed'))
            ->sum(DB::raw('COALESCE(total_paid, 0)'));

        $allocatedOnPeriodPurchases = 0.0;
        if (Schema::hasTable('payment_allocations') && Schema::hasTable('payments')) {
            $allocatedOnPeriodPurchases = (float) DB::table('payment_allocations as pa')
                ->join('purchase_invoices as pi', function ($join) {
                    $join->on('pi.id', '=', 'pa.invoice_id')
                         ->where('pa.invoice_type', '=', 'purchase_invoice');
                })
                ->join('payments as p', 'p.id', '=', 'pa.payment_id')
                ->whereBetween(DB::raw('DATE(pi.posted_date)'), [$from, $to])
                ->where(fn ($q) => $q->whereNull('pi.status')->orWhere('pi.status', '!=', 'reversed'))
                ->where('p.status', 'posted')
                ->sum('pa.amount');
        }
        $cashOnPurchases = max(0.0, round($rawCashOnPurchases - $allocatedOnPeriodPurchases, 2));

        $supplierPayments = 0.0;
        if (Schema::hasTable('payments')) {
            $suppPayQuery = DB::table('payments')
                ->where('party_type', 'supplier')
                ->whereBetween(DB::raw('DATE(payment_date)'), [$from, $to])
                ->where(fn ($q) => $q->whereNull('status')->orWhere('status', '!=', 'reversed'))
                ->where(fn ($q) => $q->whereNull('payment_method')->orWhere('payment_method', '!=', 'credit_note'));
            if (Schema::hasColumn('payments', 'cheque_status')) {
                $suppPayQuery->where(fn ($q) => $q->whereNull('cheque_status')->orWhere('cheque_status', 'cleared'));
            }
            $supplierPayments = (float) $suppPayQuery->sum('amount');
        }

        $saleReturnCashRefunds = (float) DB::table('sale_returns')
            ->whereBetween('date', [$from, $to])
            ->where('settlement_mode', 'cash_refund')
            ->sum('total');

        $operatingExpensesPaid = 0.0;
        if (Schema::hasTable('expenses')) {
            $operatingExpensesPaid = (float) DB::table('expenses as e')
                ->leftJoin('expense_categories as ec', 'ec.id', '=', 'e.expense_category_id')
                ->whereBetween('e.date', [$from, $to])
                ->whereNull('e.deleted_at')
                ->where(function ($q) {
                    $q->whereNull('ec.code')
                      ->orWhereNotIn('ec.code', ['stock_disposal_writeoff', 'stock_shrinkage_writeoff']);
                })
                ->sum('e.amount');
        }

        // 3. Investing & Financing from Journal Entries
        $investingOutflows = (float) DB::table('journal_entry_lines as jel')
            ->join('journal_entries as je', 'je.id', '=', 'jel.journal_entry_id')
            ->join('chart_of_accounts as coa', 'coa.id', '=', 'jel.chart_of_account_id')
            ->where('je.status', 'posted')
            ->whereBetween('je.entry_date', [$from, $to])
            ->where('coa.sub_type', 'fixed_asset')
            ->sum(DB::raw('jel.debit - jel.credit'));

        $capitalInjected = (float) DB::table('journal_entry_lines as jel')
            ->join('journal_entries as je', 'je.id', '=', 'jel.journal_entry_id')
            ->join('chart_of_accounts as coa', 'coa.id', '=', 'jel.chart_of_account_id')
            ->where('je.status', 'posted')
            ->whereBetween('je.entry_date', [$from, $to])
            ->where('coa.system_key', 'owners_capital')
            ->sum(DB::raw('jel.credit - jel.debit'));

        $ownerDrawings = (float) DB::table('journal_entry_lines as jel')
            ->join('journal_entries as je', 'je.id', '=', 'jel.journal_entry_id')
            ->join('chart_of_accounts as coa', 'coa.id', '=', 'jel.chart_of_account_id')
            ->where('je.status', 'posted')
            ->whereBetween('je.entry_date', [$from, $to])
            ->where('coa.system_key', 'owners_drawings')
            ->sum(DB::raw('jel.debit - jel.credit'));

        $totalOperatingIn = round($cashOnSales + $customerPaymentReceipts + $purchaseReturnCashRefunds, 2);
        $totalOperatingOut = round($cashOnPurchases + $supplierPayments + $saleReturnCashRefunds + $operatingExpensesPaid, 2);
        $netOperatingCashFlow = round($totalOperatingIn - $totalOperatingOut, 2);
        $netInvestingCashFlow = round(-$investingOutflows, 2);
        $netFinancingCashFlow = round($capitalInjected - $ownerDrawings, 2);
        $netCashChange = round($netOperatingCashFlow + $netInvestingCashFlow + $netFinancingCashFlow, 2);

        $this->accountService->syncCashDrawerBalance();
        $closingCashAndBank = Schema::hasTable('accounts')
            ? round((float) Account::where('is_active', true)->sum('current_balance'), 2)
            : 0.0;

        return [
            'period' => ['from' => $from, 'to' => $to],
            'operating' => [
                'cash_from_sales'            => round($cashOnSales, 2),
                'customer_payment_vouchers'  => round($customerPaymentReceipts, 2),
                'purchase_return_refunds'    => round($purchaseReturnCashRefunds, 2),
                'cash_paid_for_purchases'    => round($cashOnPurchases, 2),
                'supplier_payment_vouchers'  => round($supplierPayments, 2),
                'sale_return_refunds'        => round($saleReturnCashRefunds, 2),
                'operating_expenses_paid'    => round($operatingExpensesPaid, 2),
                'net_operating_cash_flow'    => $netOperatingCashFlow,
            ],
            'investing' => [
                'fixed_asset_acquisitions'   => round($investingOutflows, 2),
                'net_investing_cash_flow'    => $netInvestingCashFlow,
            ],
            'financing' => [
                'owner_capital_contributions'=> round($capitalInjected, 2),
                'owner_drawings'             => round($ownerDrawings, 2),
                'net_financing_cash_flow'    => $netFinancingCashFlow,
            ],
            'net_cash_change'       => $netCashChange,
            'closing_cash_and_bank' => $closingCashAndBank,
        ];
    }

    /**
     * Get Unified Double-Entry General Ledger / Journal Stream (Manual JVs + System Auto-Postings).
     */
    public function getGeneralLedger(array $filters = []): array
    {
        $this->ensureDefaults();
        $from = !empty($filters['from']) ? Carbon::parse($filters['from'])->toDateString() : Carbon::now()->startOfMonth()->toDateString();
        $to = !empty($filters['to']) ? Carbon::parse($filters['to'])->toDateString() : Carbon::now()->toDateString();
        $sourceFilter = $filters['source'] ?? 'all'; // all, manual, sale, purchase, payment, expense
        $search = strtolower(trim((string) ($filters['q'] ?? '')));

        $entries = [];

        // 1. Manual Journal Entries
        if (in_array($sourceFilter, ['all', 'manual'], true)) {
            $manualQuery = JournalEntry::with(['lines.account', 'creator:id,name', 'treasuryAccount:id,name'])
                ->whereBetween('entry_date', [$from, $to])
                ->orderByDesc('entry_date')
                ->orderByDesc('id');

            foreach ($manualQuery->get() as $je) {
                $entries[] = [
                    'id'               => 'JV-' . $je->id,
                    'raw_id'           => $je->id,
                    'is_manual'        => true,
                    'entry_number'     => $je->entry_number,
                    'entry_date'       => $je->entry_date instanceof Carbon ? $je->entry_date->toDateString() : (string) $je->entry_date,
                    'source_type'      => $je->reference_type ?: 'manual',
                    'source_label'     => strtoupper(str_replace('_', ' ', $je->reference_type ?: 'Manual JV')),
                    'reference_number' => $je->reference_number,
                    'description'      => $je->description,
                    'total_debit'      => round((float) $je->total_debit, 2),
                    'total_credit'     => round((float) $je->total_credit, 2),
                    'status'           => $je->status,
                    'created_by_name'  => $je->creator?->name ?? 'System',
                    'lines'            => $je->lines->map(fn ($l) => [
                        'account_code' => $l->account?->code ?? '—',
                        'account_name' => $l->account?->name ?? 'Account',
                        'description'  => $l->description,
                        'debit'        => round((float) $l->debit, 2),
                        'credit'       => round((float) $l->credit, 2),
                    ])->values()->all(),
                ];
            }
        }

        // 2. System Auto-Generated Double-Entry Postings from Sale Invoices
        if (in_array($sourceFilter, ['all', 'sale'], true)) {
            $sales = DB::table('sale_invoices as si')
                ->leftJoin('customers as c', 'c.id', '=', 'si.customer_id')
                ->whereBetween('si.date', [$from, $to])
                ->where(fn ($q) => $q->whereNull('si.status')->orWhere('si.status', '!=', 'reversed'))
                ->select('si.*', 'c.name as customer_name')
                ->orderByDesc('si.date')
                ->orderByDesc('si.id')
                ->limit(150)
                ->get();

            foreach ($sales as $s) {
                $total = round((float) ($s->total ?? 0), 2);
                $tax = round((float) ($s->tax_amount ?? 0), 2);
                $disc = round((float) ($s->discount_amount ?? 0), 2);
                $gross = round((float) ($s->gross_amount ?? ($total - $tax + $disc)), 2);
                $received = ($s->invoice_type ?? 'debit') === 'debit' && (float) ($s->total_receive ?? 0) <= 0
                    ? $total
                    : min($total, round((float) ($s->total_receive ?? 0), 2));
                $arPortion = round(max(0.0, $total - $received), 2);

                $lines = [];
                if ($received > 0) {
                    $lines[] = ['account_code' => '1010', 'account_name' => 'Cash & Bank Equivalents', 'description' => 'Payment received on sale', 'debit' => $received, 'credit' => 0.0];
                }
                if ($arPortion > 0) {
                    $lines[] = ['account_code' => '1200', 'account_name' => 'Accounts Receivable', 'description' => $s->customer_name ?: 'Customer Receivable', 'debit' => $arPortion, 'credit' => 0.0];
                }
                if ($disc > 0) {
                    $lines[] = ['account_code' => '4300', 'account_name' => 'Sales Discounts Allowed', 'description' => 'Invoice discount', 'debit' => $disc, 'credit' => 0.0];
                }
                $lines[] = ['account_code' => '4100', 'account_name' => 'Gross Sales Revenue', 'description' => ucfirst($s->sale_type ?? 'retail') . ' sale', 'debit' => 0.0, 'credit' => round($total + $disc - $tax, 2)];
                if ($tax > 0) {
                    $lines[] = ['account_code' => '2200', 'account_name' => 'Output Tax Payable (GST/VAT)', 'description' => "Output tax ({$s->tax_percentage}%)", 'debit' => 0.0, 'credit' => $tax];
                }

                $sumDr = round(collect($lines)->sum('debit'), 2);
                $entries[] = [
                    'id'               => 'SI-' . $s->id,
                    'raw_id'           => $s->id,
                    'is_manual'        => false,
                    'entry_number'     => $s->posted_number ?: ('SI-' . $s->id),
                    'entry_date'       => substr((string) $s->date, 0, 10),
                    'source_type'      => 'sale',
                    'source_label'     => 'SALE INVOICE',
                    'reference_number' => $s->posted_number,
                    'description'      => 'Sale Invoice to ' . ($s->customer_name ?: 'Walk-in Customer'),
                    'total_debit'      => $sumDr,
                    'total_credit'     => $sumDr,
                    'status'           => 'posted',
                    'created_by_name'  => 'Auto-Posted',
                    'lines'            => $lines,
                ];
            }
        }

        // 3. System Auto-Generated Double-Entry Postings from Purchase Invoices
        if (in_array($sourceFilter, ['all', 'purchase'], true)) {
            $purchases = DB::table('purchase_invoices as pi')
                ->leftJoin('suppliers as s', 's.id', '=', 'pi.supplier_id')
                ->whereBetween(DB::raw('DATE(pi.posted_date)'), [$from, $to])
                ->where(fn ($q) => $q->whereNull('pi.status')->orWhere('pi.status', '!=', 'reversed'))
                ->select('pi.*', 's.name as supplier_name')
                ->orderByDesc('pi.posted_date')
                ->orderByDesc('pi.id')
                ->limit(150)
                ->get();

            foreach ($purchases as $p) {
                $total = round((float) ($p->total_amount ?? 0), 2);
                $tax = round((float) ($p->tax_amount ?? 0), 2);
                $invValue = round(max(0.0, $total - $tax), 2);
                $paid = min($total, round((float) ($p->total_paid ?? 0), 2));
                $apPortion = round(max(0.0, $total - $paid), 2);

                $lines = [
                    ['account_code' => '1300', 'account_name' => 'Merchandise Inventory', 'description' => 'Stock receipt', 'debit' => $invValue, 'credit' => 0.0],
                ];
                if ($tax > 0) {
                    $lines[] = ['account_code' => '1400', 'account_name' => 'Input Tax Receivable (GST/VAT)', 'description' => "Input tax ({$p->tax_percentage}%)", 'debit' => $tax, 'credit' => 0.0];
                }
                if ($paid > 0) {
                    $lines[] = ['account_code' => '1010', 'account_name' => 'Cash & Bank Equivalents', 'description' => 'Paid on purchase', 'debit' => 0.0, 'credit' => $paid];
                }
                if ($apPortion > 0) {
                    $lines[] = ['account_code' => '2100', 'account_name' => 'Accounts Payable', 'description' => $p->supplier_name ?: 'Supplier Payable', 'debit' => 0.0, 'credit' => $apPortion];
                }

                $entries[] = [
                    'id'               => 'PI-' . $p->id,
                    'raw_id'           => $p->id,
                    'is_manual'        => false,
                    'entry_number'     => $p->posted_number ?: ('PI-' . $p->id),
                    'entry_date'       => substr((string) $p->posted_date, 0, 10),
                    'source_type'      => 'purchase',
                    'source_label'     => 'PURCHASE INVOICE',
                    'reference_number' => $p->invoice_number ?: $p->posted_number,
                    'description'      => 'Purchase from ' . ($p->supplier_name ?: 'Supplier'),
                    'total_debit'      => $total,
                    'total_credit'     => $total,
                    'status'           => 'posted',
                    'created_by_name'  => 'Auto-Posted',
                    'lines'            => $lines,
                ];
            }
        }

        // 4. System Auto-Generated Double-Entry Postings from Operating Expenses
        if (in_array($sourceFilter, ['all', 'expense'], true) && Schema::hasTable('expenses')) {
            $expenses = DB::table('expenses as e')
                ->leftJoin('expense_categories as ec', 'ec.id', '=', 'e.expense_category_id')
                ->whereBetween('e.date', [$from, $to])
                ->whereNull('e.deleted_at')
                ->select('e.*', 'ec.name as category_name', 'ec.code as category_code')
                ->orderByDesc('e.date')
                ->orderByDesc('e.id')
                ->limit(100)
                ->get();

            foreach ($expenses as $exp) {
                $amt = round((float) $exp->amount, 2);
                $isWriteOff = in_array($exp->category_code ?? '', ['stock_disposal_writeoff', 'stock_shrinkage_writeoff'], true);
                $entries[] = [
                    'id'               => 'EXP-' . $exp->id,
                    'raw_id'           => $exp->id,
                    'is_manual'        => false,
                    'entry_number'     => $exp->expense_number ?: ('EXP-' . $exp->id),
                    'entry_date'       => substr((string) $exp->date, 0, 10),
                    'source_type'      => 'expense',
                    'source_label'     => $isWriteOff ? 'INVENTORY WRITE-OFF' : 'OPERATING EXPENSE',
                    'reference_number' => $exp->reference_number,
                    'description'      => ($exp->category_name ?: 'Expense') . ($exp->payee ? " — {$exp->payee}" : ''),
                    'total_debit'      => $amt,
                    'total_credit'     => $amt,
                    'status'           => 'posted',
                    'created_by_name'  => 'Auto-Posted',
                    'lines'            => $isWriteOff
                        ? [
                            ['account_code' => '5200', 'account_name' => 'Inventory Shrinkage, Expiry & Damage Write-Off', 'description' => $exp->category_name ?: 'Inventory Write-Off', 'debit' => $amt, 'credit' => 0.0],
                            ['account_code' => '1300', 'account_name' => 'Merchandise Inventory', 'description' => $exp->reference_number ?: 'Stock Write-Off', 'debit' => 0.0, 'credit' => $amt],
                        ]
                        : [
                            ['account_code' => '5300', 'account_name' => 'Store Operating Expenses', 'description' => $exp->category_name ?: 'Operating Expense', 'debit' => $amt, 'credit' => 0.0],
                            ['account_code' => '1010', 'account_name' => 'Cash & Bank Equivalents', 'description' => ucfirst($exp->payment_method ?: 'cash'), 'debit' => 0.0, 'credit' => $amt],
                        ],
                ];
            }
        }

        // 5. System Auto-Generated Double-Entry Postings from Payment Vouchers
        if (in_array($sourceFilter, ['all', 'payment'], true) && Schema::hasTable('payments')) {
            $payments = DB::table('payments as p')
                ->leftJoin('customers as c', function ($join) {
                    $join->on('c.id', '=', 'p.party_id')->where('p.party_type', '=', 'customer');
                })
                ->leftJoin('suppliers as s', function ($join) {
                    $join->on('s.id', '=', 'p.party_id')->where('p.party_type', '=', 'supplier');
                })
                ->whereBetween(DB::raw('DATE(p.payment_date)'), [$from, $to])
                ->where(fn ($q) => $q->whereNull('p.status')->orWhere('p.status', '!=', 'reversed'))
                ->where(fn ($q) => $q->whereNull('p.payment_method')->orWhere('p.payment_method', '!=', 'credit_note'))
                ->select('p.*', 'c.name as customer_name', 's.name as supplier_name')
                ->orderByDesc('p.payment_date')
                ->orderByDesc('p.id')
                ->limit(100)
                ->get();

            foreach ($payments as $pay) {
                $amt = round((float) $pay->amount, 2);
                $isCust = $pay->party_type === 'customer';
                $partyName = $isCust ? ($pay->customer_name ?: 'Customer') : ($pay->supplier_name ?: 'Supplier');
                $entries[] = [
                    'id'               => 'PAY-' . $pay->id,
                    'raw_id'           => $pay->id,
                    'is_manual'        => false,
                    'entry_number'     => $pay->payment_number ?: ('PAY-' . $pay->id),
                    'entry_date'       => substr((string) $pay->payment_date, 0, 10),
                    'source_type'      => 'payment',
                    'source_label'     => $isCust ? 'CUSTOMER RECEIPT' : 'SUPPLIER PAYMENT',
                    'reference_number' => $pay->reference,
                    'description'      => ($isCust ? "Receipt from {$partyName}" : "Payment to {$partyName}") . ($pay->notes ? " — {$pay->notes}" : ''),
                    'total_debit'      => $amt,
                    'total_credit'     => $amt,
                    'status'           => 'posted',
                    'created_by_name'  => 'Auto-Posted',
                    'lines'            => $isCust
                        ? [
                            ['account_code' => '1010', 'account_name' => 'Cash & Bank Equivalents', 'description' => ucfirst(str_replace('_', ' ', $pay->payment_method ?: 'cash')), 'debit' => $amt, 'credit' => 0.0],
                            ['account_code' => '1200', 'account_name' => 'Accounts Receivable', 'description' => $partyName, 'debit' => 0.0, 'credit' => $amt],
                        ]
                        : [
                            ['account_code' => '2100', 'account_name' => 'Accounts Payable', 'description' => $partyName, 'debit' => $amt, 'credit' => 0.0],
                            ['account_code' => '1010', 'account_name' => 'Cash & Bank Equivalents', 'description' => ucfirst(str_replace('_', ' ', $pay->payment_method ?: 'cash')), 'debit' => 0.0, 'credit' => $amt],
                        ],
                ];
            }
        }

        if ($search !== '') {
            $entries = array_values(array_filter($entries, function ($e) use ($search) {
                return str_contains(strtolower((string) $e['entry_number']), $search)
                    || str_contains(strtolower((string) $e['description']), $search)
                    || str_contains(strtolower((string) ($e['reference_number'] ?? '')), $search);
            }));
        }

        usort($entries, fn ($a, $b) => strcmp($b['entry_date'], $a['entry_date']));

        return [
            'period'  => ['from' => $from, 'to' => $to],
            'entries' => $entries,
            'summary' => [
                'total_vouchers' => count($entries),
                'manual_count'   => count(array_filter($entries, fn ($e) => $e['is_manual'])),
                'total_debit'    => round(collect($entries)->where('status', 'posted')->sum('total_debit'), 2),
                'total_credit'   => round(collect($entries)->where('status', 'posted')->sum('total_credit'), 2),
            ],
        ];
    }

    /**
     * Comprehensive Statutory Tax Return & GST/VAT Report (Output Tax vs. Input Tax Credit).
     */
    public function getTaxReport(string $fromDate, string $toDate, array $filters = []): array
    {
        $this->ensureDefaults();
        $from = Carbon::parse($fromDate)->toDateString();
        $to = Carbon::parse($toDate)->toDateString();
        $taxScope = $filters['tax_scope'] ?? 'all'; // 'all' or 'taxable_only'

        $hasCustomerTaxCols = Schema::hasColumn('customers', 'tax_number');
        $hasSupplierTaxCols = Schema::hasColumn('suppliers', 'tax_number');

        // 1. Sales Output Tax Register (Sale Invoices + Sale Returns)
        $salesQuery = DB::table('sale_invoices as si')
            ->leftJoin('customers as c', 'c.id', '=', 'si.customer_id')
            ->whereBetween('si.date', [$from, $to])
            ->where(fn ($q) => $q->whereNull('si.status')->orWhere('si.status', '!=', 'reversed'))
            ->select([
                'si.id',
                'si.posted_number',
                'si.date',
                'si.sale_type',
                'si.invoice_type',
                'si.gross_amount',
                'si.discount_amount',
                'si.tax_percentage',
                'si.tax_amount',
                'si.total',
                'si.customer_id',
                DB::raw("COALESCE(c.name, 'Walk-in Customer') as party_name"),
                DB::raw($hasCustomerTaxCols ? "COALESCE(c.tax_number, '') as party_tax_number" : "'' as party_tax_number"),
                DB::raw($hasCustomerTaxCols ? "COALESCE(c.tax_status, 'unregistered') as party_tax_status" : "'unregistered' as party_tax_status"),
            ])
            ->orderBy('si.date')
            ->orderBy('si.id')
            ->get();

        $saleReturnsQuery = DB::table('sale_returns as sr')
            ->leftJoin('customers as c', 'c.id', '=', 'sr.customer_id')
            ->whereBetween('sr.date', [$from, $to])
            ->select([
                'sr.id',
                'sr.posted_number',
                'sr.date',
                'sr.gross_total',
                'sr.discount_amount',
                'sr.tax_percentage',
                'sr.tax_amount',
                'sr.total',
                'sr.customer_id',
                DB::raw("COALESCE(c.name, 'Walk-in Customer') as party_name"),
                DB::raw($hasCustomerTaxCols ? "COALESCE(c.tax_number, '') as party_tax_number" : "'' as party_tax_number"),
                DB::raw($hasCustomerTaxCols ? "COALESCE(c.tax_status, 'unregistered') as party_tax_status" : "'unregistered' as party_tax_status"),
            ])
            ->orderBy('sr.date')
            ->orderBy('sr.id')
            ->get();

        $outputRegister = [];
        $taxableSalesBase = 0.0;
        $exemptSalesBase = 0.0;
        $outputTaxCollected = 0.0;
        $taxableSalesCount = 0;
        $exemptSalesCount = 0;

        foreach ($salesQuery as $s) {
            $taxAmt = round((float) ($s->tax_amount ?? 0), 2);
            $taxPct = round((float) ($s->tax_percentage ?? 0), 2);
            $total = round((float) ($s->total ?? 0), 2);
            $taxableValue = round(max(0.0, $total - $taxAmt), 2);

            if ($taxAmt > 0 || $taxPct > 0) {
                $taxableSalesBase = round($taxableSalesBase + $taxableValue, 2);
                $outputTaxCollected = round($outputTaxCollected + $taxAmt, 2);
                $taxableSalesCount++;
            } else {
                $exemptSalesBase = round($exemptSalesBase + $taxableValue, 2);
                $exemptSalesCount++;
            }

            if ($taxScope === 'taxable_only' && $taxAmt <= 0 && $taxPct <= 0) {
                continue;
            }

            $outputRegister[] = [
                'id'               => 'SI-' . $s->id,
                'doc_type'         => 'sale_invoice',
                'doc_type_label'   => 'Sale Invoice',
                'posted_number'    => $s->posted_number,
                'date'             => substr((string) $s->date, 0, 10),
                'sale_type'        => $s->sale_type ?: 'retail',
                'party_id'         => $s->customer_id,
                'party_name'       => $s->party_name,
                'party_tax_number' => $s->party_tax_number ?: '—',
                'party_tax_status' => $s->party_tax_status ?: 'unregistered',
                'taxable_amount'   => $taxableValue,
                'tax_percentage'   => $taxPct,
                'tax_amount'       => $taxAmt,
                'invoice_total'    => $total,
            ];
        }

        $saleReturnsBase = 0.0;
        $saleReturnsTaxReversed = 0.0;

        foreach ($saleReturnsQuery as $sr) {
            $taxAmt = round((float) ($sr->tax_amount ?? 0), 2);
            $taxPct = round((float) ($sr->tax_percentage ?? 0), 2);
            $total = round((float) ($sr->total ?? 0), 2);
            $baseVal = round(max(0.0, $total - $taxAmt), 2);

            $saleReturnsBase = round($saleReturnsBase + $baseVal, 2);
            $saleReturnsTaxReversed = round($saleReturnsTaxReversed + $taxAmt, 2);

            if ($taxScope === 'taxable_only' && $taxAmt <= 0 && $taxPct <= 0) {
                continue;
            }

            $outputRegister[] = [
                'id'               => 'SR-' . $sr->id,
                'doc_type'         => 'sale_return',
                'doc_type_label'   => 'Sale Return (Credit Note)',
                'posted_number'    => $sr->posted_number,
                'date'             => substr((string) $sr->date, 0, 10),
                'sale_type'        => 'return',
                'party_id'         => $sr->customer_id,
                'party_name'       => $sr->party_name,
                'party_tax_number' => $sr->party_tax_number ?: '—',
                'party_tax_status' => $sr->party_tax_status ?: 'unregistered',
                'taxable_amount'   => -$baseVal,
                'tax_percentage'   => $taxPct,
                'tax_amount'       => -$taxAmt,
                'invoice_total'    => -$total,
            ];
        }

        // 2. Purchase Input Tax Register (Purchase Invoices + Purchase Returns)
        $purchasesQuery = DB::table('purchase_invoices as pi')
            ->leftJoin('suppliers as s', 's.id', '=', 'pi.supplier_id')
            ->whereBetween(DB::raw('DATE(pi.posted_date)'), [$from, $to])
            ->where(fn ($q) => $q->whereNull('pi.status')->orWhere('pi.status', '!=', 'reversed'))
            ->select([
                'pi.id',
                'pi.posted_number',
                'pi.invoice_number',
                'pi.posted_date',
                'pi.invoice_amount',
                'pi.discount_amount',
                'pi.tax_percentage',
                'pi.tax_amount',
                'pi.total_amount',
                'pi.supplier_id',
                DB::raw("COALESCE(s.name, 'Supplier') as party_name"),
                DB::raw($hasSupplierTaxCols ? "COALESCE(s.tax_number, '') as party_tax_number" : "'' as party_tax_number"),
                DB::raw($hasSupplierTaxCols ? "COALESCE(s.tax_status, 'registered') as party_tax_status" : "'registered' as party_tax_status"),
            ])
            ->orderBy('pi.posted_date')
            ->orderBy('pi.id')
            ->get();

        $purchaseReturnsQuery = DB::table('purchase_returns as pr')
            ->leftJoin('suppliers as s', 's.id', '=', 'pr.supplier_id')
            ->whereBetween(DB::raw('DATE(pr.date)'), [$from, $to])
            ->select([
                'pr.id',
                'pr.posted_number',
                'pr.date',
                'pr.gross_total',
                'pr.discount_amount',
                'pr.tax_percentage',
                'pr.tax_amount',
                'pr.total',
                'pr.supplier_id',
                DB::raw("COALESCE(s.name, 'Supplier') as party_name"),
                DB::raw($hasSupplierTaxCols ? "COALESCE(s.tax_number, '') as party_tax_number" : "'' as party_tax_number"),
                DB::raw($hasSupplierTaxCols ? "COALESCE(s.tax_status, 'registered') as party_tax_status" : "'registered' as party_tax_status"),
            ])
            ->orderBy('pr.date')
            ->orderBy('pr.id')
            ->get();

        $inputRegister = [];
        $taxablePurchasesBase = 0.0;
        $exemptPurchasesBase = 0.0;
        $inputTaxPaid = 0.0;
        $taxablePurchasesCount = 0;
        $exemptPurchasesCount = 0;

        foreach ($purchasesQuery as $p) {
            $taxAmt = round((float) ($p->tax_amount ?? 0), 2);
            $taxPct = round((float) ($p->tax_percentage ?? 0), 2);
            $total = round((float) ($p->total_amount ?? 0), 2);
            $taxableValue = round(max(0.0, $total - $taxAmt), 2);

            if ($taxAmt > 0 || $taxPct > 0) {
                $taxablePurchasesBase = round($taxablePurchasesBase + $taxableValue, 2);
                $inputTaxPaid = round($inputTaxPaid + $taxAmt, 2);
                $taxablePurchasesCount++;
            } else {
                $exemptPurchasesBase = round($exemptPurchasesBase + $taxableValue, 2);
                $exemptPurchasesCount++;
            }

            if ($taxScope === 'taxable_only' && $taxAmt <= 0 && $taxPct <= 0) {
                continue;
            }

            $inputRegister[] = [
                'id'               => 'PI-' . $p->id,
                'doc_type'         => 'purchase_invoice',
                'doc_type_label'   => 'Purchase Invoice',
                'posted_number'    => $p->posted_number,
                'supplier_inv_no'  => $p->invoice_number ?: '—',
                'date'             => substr((string) $p->posted_date, 0, 10),
                'party_id'         => $p->supplier_id,
                'party_name'       => $p->party_name,
                'party_tax_number' => $p->party_tax_number ?: '—',
                'party_tax_status' => $p->party_tax_status ?: 'registered',
                'taxable_amount'   => $taxableValue,
                'tax_percentage'   => $taxPct,
                'tax_amount'       => $taxAmt,
                'invoice_total'    => $total,
            ];
        }

        $purchaseReturnsBase = 0.0;
        $purchaseReturnsTaxReversed = 0.0;

        foreach ($purchaseReturnsQuery as $pr) {
            $taxAmt = round((float) ($pr->tax_amount ?? 0), 2);
            $taxPct = round((float) ($pr->tax_percentage ?? 0), 2);
            $total = round((float) ($pr->total ?? 0), 2);
            $baseVal = round(max(0.0, $total - $taxAmt), 2);

            $purchaseReturnsBase = round($purchaseReturnsBase + $baseVal, 2);
            $purchaseReturnsTaxReversed = round($purchaseReturnsTaxReversed + $taxAmt, 2);

            if ($taxScope === 'taxable_only' && $taxAmt <= 0 && $taxPct <= 0) {
                continue;
            }

            $inputRegister[] = [
                'id'               => 'PR-' . $pr->id,
                'doc_type'         => 'purchase_return',
                'doc_type_label'   => 'Purchase Return (Debit Note)',
                'posted_number'    => $pr->posted_number,
                'supplier_inv_no'  => '—',
                'date'             => substr((string) $pr->date, 0, 10),
                'party_id'         => $pr->supplier_id,
                'party_name'       => $pr->party_name,
                'party_tax_number' => $pr->party_tax_number ?: '—',
                'party_tax_status' => $pr->party_tax_status ?: 'registered',
                'taxable_amount'   => -$baseVal,
                'tax_percentage'   => $taxPct,
                'tax_amount'       => -$taxAmt,
                'invoice_total'    => -$total,
            ];
        }

        // 3. Party-Wise Tax Annexures (Customer Output Tax & Supplier Input Tax)
        $customerAnnexureMap = [];
        foreach ($outputRegister as $row) {
            $key = ($row['party_id'] ?: 0) . ':' . $row['party_name'];
            if (!isset($customerAnnexureMap[$key])) {
                $customerAnnexureMap[$key] = [
                    'party_id'         => $row['party_id'],
                    'party_name'       => $row['party_name'],
                    'party_tax_number' => $row['party_tax_number'],
                    'party_tax_status' => $row['party_tax_status'],
                    'doc_count'        => 0,
                    'taxable_amount'   => 0.0,
                    'tax_amount'       => 0.0,
                    'invoice_total'    => 0.0,
                ];
            }
            $customerAnnexureMap[$key]['doc_count']++;
            $customerAnnexureMap[$key]['taxable_amount'] = round($customerAnnexureMap[$key]['taxable_amount'] + $row['taxable_amount'], 2);
            $customerAnnexureMap[$key]['tax_amount'] = round($customerAnnexureMap[$key]['tax_amount'] + $row['tax_amount'], 2);
            $customerAnnexureMap[$key]['invoice_total'] = round($customerAnnexureMap[$key]['invoice_total'] + $row['invoice_total'], 2);
        }

        $supplierAnnexureMap = [];
        foreach ($inputRegister as $row) {
            $key = ($row['party_id'] ?: 0) . ':' . $row['party_name'];
            if (!isset($supplierAnnexureMap[$key])) {
                $supplierAnnexureMap[$key] = [
                    'party_id'         => $row['party_id'],
                    'party_name'       => $row['party_name'],
                    'party_tax_number' => $row['party_tax_number'],
                    'party_tax_status' => $row['party_tax_status'],
                    'doc_count'        => 0,
                    'taxable_amount'   => 0.0,
                    'tax_amount'       => 0.0,
                    'invoice_total'    => 0.0,
                ];
            }
            $supplierAnnexureMap[$key]['doc_count']++;
            $supplierAnnexureMap[$key]['taxable_amount'] = round($supplierAnnexureMap[$key]['taxable_amount'] + $row['taxable_amount'], 2);
            $supplierAnnexureMap[$key]['tax_amount'] = round($supplierAnnexureMap[$key]['tax_amount'] + $row['tax_amount'], 2);
            $supplierAnnexureMap[$key]['invoice_total'] = round($supplierAnnexureMap[$key]['invoice_total'] + $row['invoice_total'], 2);
        }

        // 4. Tax Rate Tier Breakdown
        $rateTiers = [];
        foreach ($outputRegister as $row) {
            $rateKey = number_format((float) $row['tax_percentage'], 2);
            if (!isset($rateTiers[$rateKey])) {
                $rateTiers[$rateKey] = [
                    'rate'            => (float) $row['tax_percentage'],
                    'sales_docs'      => 0,
                    'sales_base'      => 0.0,
                    'output_tax'      => 0.0,
                    'purchase_docs'   => 0,
                    'purchase_base'   => 0.0,
                    'input_tax'       => 0.0,
                ];
            }
            $rateTiers[$rateKey]['sales_docs']++;
            $rateTiers[$rateKey]['sales_base'] = round($rateTiers[$rateKey]['sales_base'] + $row['taxable_amount'], 2);
            $rateTiers[$rateKey]['output_tax'] = round($rateTiers[$rateKey]['output_tax'] + $row['tax_amount'], 2);
        }
        foreach ($inputRegister as $row) {
            $rateKey = number_format((float) $row['tax_percentage'], 2);
            if (!isset($rateTiers[$rateKey])) {
                $rateTiers[$rateKey] = [
                    'rate'            => (float) $row['tax_percentage'],
                    'sales_docs'      => 0,
                    'sales_base'      => 0.0,
                    'output_tax'      => 0.0,
                    'purchase_docs'   => 0,
                    'purchase_base'   => 0.0,
                    'input_tax'       => 0.0,
                ];
            }
            $rateTiers[$rateKey]['purchase_docs']++;
            $rateTiers[$rateKey]['purchase_base'] = round($rateTiers[$rateKey]['purchase_base'] + $row['taxable_amount'], 2);
            $rateTiers[$rateKey]['input_tax'] = round($rateTiers[$rateKey]['input_tax'] + $row['tax_amount'], 2);
        }
        ksort($rateTiers);

        // 5. Tax Challans Paid / Manual Tax Adjustments via Journal Entries
        $taxPaymentsMade = 0.0;
        if (Schema::hasTable('journal_entry_lines')) {
            $taxPaymentsMade = (float) DB::table('journal_entry_lines as jel')
                ->join('journal_entries as je', 'je.id', '=', 'jel.journal_entry_id')
                ->join('chart_of_accounts as coa', 'coa.id', '=', 'jel.chart_of_account_id')
                ->where('je.status', 'posted')
                ->whereBetween('je.entry_date', [$from, $to])
                ->whereIn('coa.system_key', ['output_tax_payable', 'withholding_tax_payable'])
                ->sum(DB::raw('jel.debit - jel.credit'));
        }
        $taxPaymentsMade = round($taxPaymentsMade, 2);

        $netOutputTax = round($outputTaxCollected - $saleReturnsTaxReversed, 2);
        $netInputTax = round($inputTaxPaid - $purchaseReturnsTaxReversed, 2);
        $netTaxBeforeChallan = round($netOutputTax - $netInputTax, 2);
        $netTaxPayable = round($netTaxBeforeChallan - $taxPaymentsMade, 2);

        return [
            'period' => [
                'from' => $from,
                'to'   => $to,
            ],
            'summary' => [
                'taxable_sales_count'           => $taxableSalesCount,
                'exempt_sales_count'            => $exemptSalesCount,
                'taxable_sales_base'            => $taxableSalesBase,
                'exempt_sales_base'             => $exemptSalesBase,
                'output_tax_collected'          => $outputTaxCollected,
                'sale_returns_base'             => $saleReturnsBase,
                'sale_returns_tax_reversed'     => $saleReturnsTaxReversed,
                'net_output_tax'                => $netOutputTax,
                'taxable_purchases_count'       => $taxablePurchasesCount,
                'exempt_purchases_count'        => $exemptPurchasesCount,
                'taxable_purchases_base'        => $taxablePurchasesBase,
                'exempt_purchases_base'         => $exemptPurchasesBase,
                'input_tax_paid'                => $inputTaxPaid,
                'purchase_returns_base'         => $purchaseReturnsBase,
                'purchase_returns_tax_reversed' => $purchaseReturnsTaxReversed,
                'net_input_tax'                 => $netInputTax,
                'tax_challans_paid'             => $taxPaymentsMade,
                'net_tax_before_challan'        => $netTaxBeforeChallan,
                'net_tax_payable'               => $netTaxPayable,
                'status'                        => $netTaxPayable > 0 ? 'payable' : ($netTaxPayable < 0 ? 'refundable_credit' : 'settled'),
            ],
            'output_register'   => $outputRegister,
            'input_register'    => $inputRegister,
            'customer_annexure' => array_values($customerAnnexureMap),
            'supplier_annexure' => array_values($supplierAnnexureMap),
            'rate_breakdown'    => array_values($rateTiers),
            'tax_rates'         => $this->getTaxRates(true),
        ];
    }
}
