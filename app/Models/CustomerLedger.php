<?php

namespace App\Models;

use Illuminate\Database\Eloquent\Model;
use Illuminate\Database\Eloquent\Relations\BelongsTo;
use Illuminate\Support\Facades\DB;

class CustomerLedger extends Model
{
    protected $fillable = [
        'customer_id',
        'sale_invoice_id',
        'sale_return_id',
        'payment_id',
        'entry_date',
        'due_date',
        'posted_number',
        'invoice_number',

        'invoice_total',
        'total_received',
        'balance_remaining',

        'entry_type',
        'description',
        'is_manual',

        'credited_amount',
        'payment_ref',

        'created_by',
    ];

    protected $casts = [
        'entry_date' => 'date',
        'due_date'   => 'date',
        'is_manual'  => 'boolean',
    ];

    /**
     * Get the customer's net balance from the ledger.
     * This is the total amount the customer owes.
     * 
     * Formula: net_balance = (total_invoiced - received_on_invoice) - payments_credited
     */
    public static function getCustomerNetBalance(int $customerId): float
    {
        $walkInIds = Customer::walkInIds();
        if (in_array($customerId, $walkInIds, true)) {
            return 0.0;
        }

        $invAgg = DB::table('customer_ledgers as cl')
            ->leftJoin('sale_invoices as si', 'si.id', '=', 'cl.sale_invoice_id')
            ->where('cl.customer_id', $customerId)
            ->whereIn('cl.entry_type', ['invoice', 'manual'])
            ->where(function ($q) {
                $q->whereNull('cl.sale_invoice_id')
                  ->orWhereNull('si.status')
                  ->orWhere('si.status', '!=', 'reversed');
            })
            ->selectRaw('
                COALESCE(SUM(COALESCE(cl.invoice_total, 0)), 0) as total_invoiced,
                COALESCE(SUM(CASE WHEN COALESCE(cl.total_received, 0) < COALESCE(cl.invoice_total, 0) THEN COALESCE(cl.total_received, 0) ELSE COALESCE(cl.invoice_total, 0) END), 0) as received_on_inv
            ')
            ->first();

        $totalInvoiced = (float) ($invAgg->total_invoiced ?? 0);
        $receivedOnInv = (float) ($invAgg->received_on_inv ?? 0);

        // Get payments (money received from customer)
        $paymentsCred = (float) self::where('customer_id', $customerId)
            ->where('entry_type', 'payment')
            ->sum(DB::raw('COALESCE(credited_amount, 0)'));

        // Calculate net balance
        $netBalance = ($totalInvoiced - $receivedOnInv) - $paymentsCred;

        // Return 0 if negative (customer has credit)
        return $netBalance > 0 ? round($netBalance, 2) : 0.0;
    }

    /**
     * Compute total positive customer receivables across all customers in 2 grouped SQL queries.
     */
    public static function getTotalReceivablesBalance(): float
    {
        $walkInIds = Customer::walkInIds();

        $invRows = DB::table('customer_ledgers as cl')
            ->leftJoin('sale_invoices as si', 'si.id', '=', 'cl.sale_invoice_id')
            ->whereNotNull('cl.customer_id')
            ->when(!empty($walkInIds), fn ($q) => $q->whereNotIn('cl.customer_id', $walkInIds))
            ->whereIn('cl.entry_type', ['invoice', 'manual'])
            ->where(function ($q) {
                $q->whereNull('cl.sale_invoice_id')
                  ->orWhereNull('si.status')
                  ->orWhere('si.status', '!=', 'reversed');
            })
            ->selectRaw('
                cl.customer_id,
                SUM(COALESCE(cl.invoice_total, 0)) as total_inv,
                SUM(CASE WHEN COALESCE(cl.total_received, 0) < COALESCE(cl.invoice_total, 0) THEN COALESCE(cl.total_received, 0) ELSE COALESCE(cl.invoice_total, 0) END) as received_on_inv
            ')
            ->groupBy('cl.customer_id')
            ->get()
            ->keyBy('customer_id');

        $payRows = DB::table('customer_ledgers')
            ->whereNotNull('customer_id')
            ->when(!empty($walkInIds), fn ($q) => $q->whereNotIn('customer_id', $walkInIds))
            ->where('entry_type', 'payment')
            ->selectRaw('customer_id, SUM(COALESCE(credited_amount, 0)) as total_credited')
            ->groupBy('customer_id')
            ->get()
            ->keyBy('customer_id');

        $totalReceivables = 0.0;
        $allCustIds = $invRows->keys()->merge($payRows->keys())->unique();
        foreach ($allCustIds as $cid) {
            if (!$cid) {
                continue;
            }
            $inv = $invRows->get($cid);
            $pay = $payRows->get($cid);
            $net = (($inv->total_inv ?? 0) - ($inv->received_on_inv ?? 0)) - ($pay->total_credited ?? 0);
            if ($net > 0) {
                $totalReceivables += round((float) $net, 2);
            }
        }

        return round($totalReceivables, 2);
    }

    public function customer(): BelongsTo
    {
        return $this->belongsTo(Customer::class);
    }

    public function saleInvoice(): BelongsTo
    {
        return $this->belongsTo(SaleInvoice::class);
    }

    public function saleReturn(): BelongsTo
    {
        return $this->belongsTo(SaleReturn::class, 'sale_return_id');
    }
}
