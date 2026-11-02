<?php

namespace App\Models;

use Illuminate\Database\Eloquent\Factories\HasFactory;
use Illuminate\Database\Eloquent\Model;

class PurchaseReturn extends Model
{
    use HasFactory;

    protected $fillable = [
        'supplier_id',
        'purchase_invoice_id',
        'posted_number',
        'date',
        'remarks',
        'gross_total',
        'discount_percentage',
        'discount_amount',
        'tax_percentage',
        'tax_amount',
        'total',
        'settlement_mode',
        'payment_method',
        'account_id',
        'credited_amount',
    ];

    public function account()
    {
        return $this->belongsTo(Account::class);
    }

    public function supplierLedgerEntry()
    {
        return $this->hasOne(SupplierLedger::class, 'purchase_return_id');
    }

    protected $casts = [
        'date' => 'date',
    ];

    public function supplier()
    {
        return $this->belongsTo(Supplier::class);
    }

    public function purchaseInvoice()
    {
        return $this->belongsTo(PurchaseInvoice::class);
    }

    public function items()
    {
        return $this->hasMany(PurchaseReturnItem::class)->orderBy('id');
    }
}
