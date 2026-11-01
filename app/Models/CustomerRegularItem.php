<?php

namespace App\Models;

use Illuminate\Database\Eloquent\Model;

class CustomerRegularItem extends Model
{
    protected $fillable = [
        'customer_id',
        'product_id',
        'pack_quantity',
        'unit_quantity',
        'dosage_notes',
    ];

    protected $casts = [
        'customer_id'   => 'integer',
        'product_id'    => 'integer',
        'pack_quantity' => 'integer',
        'unit_quantity' => 'integer',
    ];

    public function customer()
    {
        return $this->belongsTo(Customer::class);
    }

    public function product()
    {
        return $this->belongsTo(Product::class);
    }
}

