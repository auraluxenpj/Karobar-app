<?php

namespace App\Models;

use Illuminate\Database\Eloquent\Model;

class Customer extends Model
{
    protected $fillable = [
        'name',
        'email',
        'phone',
        'tax_number',
        'tax_status',
        'address',
        'credit_limit',
        'credit_days',
        'credit_status',
        'is_regular',
        'refill_cycle',
        'refill_custom_days',
        'reminder_lead_days',
        'next_refill_date',
        'last_refill_reminded_at',
        'last_refill_collected_at',
        'reminder_language',
        'regular_notes',
    ];

    protected $casts = [
        'credit_limit'             => 'decimal:2',
        'credit_days'              => 'integer',
        'is_regular'               => 'boolean',
        'refill_custom_days'       => 'integer',
        'reminder_lead_days'       => 'integer',
        'next_refill_date'         => 'date:Y-m-d',
        'last_refill_reminded_at'  => 'datetime',
        'last_refill_collected_at' => 'datetime',
    ];

    public static function isWalkInName(?string $name): bool
    {
        if ($name === null) {
            return false;
        }
        return (bool) preg_match('/walk[\s\-_]*in/i', trim($name));
    }

    public function isWalkIn(): bool
    {
        return self::isWalkInName($this->name);
    }

    /**
     * Return all Customer IDs that match Walk-In Customer naming.
     *
     * @return array<int>
     */
    public static function walkInIds(): array
    {
        return static::query()
            ->where(function ($q) {
                $q->whereRaw("UPPER(name) LIKE '%WALK-IN%'")
                  ->orWhereRaw("UPPER(name) LIKE '%WALK IN%'")
                  ->orWhereRaw("UPPER(name) LIKE '%WALK_IN%'")
                  ->orWhereRaw("UPPER(name) LIKE '%WALKIN%'");
            })
            ->pluck('id')
            ->map(fn ($id) => (int) $id)
            ->all();
    }

    public function getNetBalance(): float
    {
        if ($this->isWalkIn()) {
            return 0.0;
        }
        return CustomerLedger::getCustomerNetBalance($this->id);
    }

    public function getAvailableCredit(): ?float
    {
        if ($this->credit_limit === null || (float)$this->credit_limit <= 0) {
            return null; // Unlimited
        }
        $net = $this->getNetBalance();
        return round(max(0.0, (float)$this->credit_limit - $net), 2);
    }

    public function isCreditLimitExceeded(): bool
    {
        if ($this->credit_limit === null || (float)$this->credit_limit <= 0) {
            return false;
        }
        return $this->getNetBalance() > (float)$this->credit_limit;
    }
    public function saleInvoices()
    {
        return $this->hasMany(\App\Models\SaleInvoice::class);
    }

    public function saleReturns()
    {
        return $this->hasMany(\App\Models\SaleReturn::class);
    }

    public function wholeSalePrices()
    {
        return $this->hasMany(\App\Models\CustomerWholeSalePrice::class);
    }

    public function regularItems()
    {
        return $this->hasMany(\App\Models\CustomerRegularItem::class);
    }
}
