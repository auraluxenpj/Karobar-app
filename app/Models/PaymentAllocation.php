<?php

namespace App\Models;

use Illuminate\Database\Eloquent\Factories\HasFactory;
use Illuminate\Database\Eloquent\Model;
use Illuminate\Database\Eloquent\Relations\BelongsTo;

class PaymentAllocation extends Model
{
    use HasFactory;

    protected $fillable = [
        'payment_id',
        'invoice_type',
        'invoice_id',
        'amount',
    ];

    protected $casts = [
        'amount' => 'float',
    ];

    public function payment(): BelongsTo
    {
        return $this->belongsTo(Payment::class, 'payment_id');
    }

    public function saleInvoice(): BelongsTo
    {
        return $this->belongsTo(SaleInvoice::class, 'invoice_id');
    }

    public function purchaseInvoice(): BelongsTo
    {
        return $this->belongsTo(PurchaseInvoice::class, 'invoice_id');
    }

    /**
     * Sum posted payment allocations by invoice IDs in SQLite-safe chunks (<= 500 variables per query).
     *
     * @param  string  $invoiceType  'sale_invoice'|'purchase_invoice'
     * @param  array<int, int>  $invoiceIds
     * @return \Illuminate\Support\Collection<int, float>
     */
    public static function sumAllocatedByInvoiceIds(string $invoiceType, array $invoiceIds): \Illuminate\Support\Collection
    {
        $ids = array_values(array_unique(array_filter(array_map('intval', $invoiceIds))));
        if (empty($ids) || !\App\Support\SchemaCache::hasTable('payment_allocations') || !\App\Support\SchemaCache::hasTable('payments')) {
            return collect();
        }

        $result = [];
        foreach (array_chunk($ids, 500) as $chunk) {
            $rows = self::query()
                ->where('invoice_type', $invoiceType)
                ->whereIn('invoice_id', $chunk)
                ->whereHas('payment', fn ($q) => $q->where('status', 'posted'))
                ->selectRaw('invoice_id, SUM(amount) as total_allocated')
                ->groupBy('invoice_id')
                ->pluck('total_allocated', 'invoice_id');

            foreach ($rows as $invId => $sum) {
                $result[(int) $invId] = (float) $sum;
            }
        }

        return collect($result);
    }
}

