<?php

namespace App\Models;

use Illuminate\Database\Eloquent\Model;

class PurchaseOrder extends Model
{
    protected $fillable = ['date', 'expected_received_date', 'supplier_id', 'status', 'reference', 'notes', 'created_by', 'updated_by', 'received_by', 'received_at'];

    protected $casts = ['received_at' => 'datetime', 'total_amount' => 'float'];

    protected $appends = ['number'];

    public function getNumberAttribute(): string
    {
        return 'PO-' . str_pad((string) $this->id, 5, '0', STR_PAD_LEFT);
    }

    public function supplier()
    {
        return $this->belongsTo(Supplier::class);
    }

    public function items()
    {
        return $this->hasMany(PurchaseOrderItem::class)->orderBy('id');
    }

    public function invoices()
    {
        return $this->hasMany(PurchaseInvoice::class);
    }

    public static function expectedAmountBetween(string $from, string $to): float
    {
        return (float) static::query()
            ->where('status', 'ordered')
            ->whereDoesntHave('invoices')
            ->whereBetween('expected_received_date', [$from, $to])
            ->join('purchase_order_items as lines', 'lines.purchase_order_id', '=', 'purchase_orders.id')
            ->selectRaw('COALESCE(SUM(lines.ordered_quantity * lines.unit_purchase_price * (1 - COALESCE(lines.item_discount_percentage, 0) / 100.0)), 0) as amount')
            ->value('amount');
    }
}
