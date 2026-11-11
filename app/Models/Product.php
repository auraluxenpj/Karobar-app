<?php

namespace App\Models;

use Illuminate\Database\Eloquent\Model;
use Illuminate\Database\Eloquent\Factories\HasFactory;
use Illuminate\Support\Facades\DB;

class Product extends Model
{
    use HasFactory;

    protected $fillable = [
        'product_code',
        'name',
        'image',
        'formulation',
        'description',
        'pack_size',
        'quantity',
        'pack_purchase_price',
        'pack_sale_price',
        'unit_purchase_price',
        'unit_sale_price',
        'whole_sale_pack_price',
        'whole_sale_unit_price',
        'whole_sale_margin',
        'avg_price',
        'margin',
        'narcotic',
        'max_discount',
        'expiry_warning_days',
        'expiry_critical_days',
        'category_id',
        'brand_id',
        'supplier_id',
        'rack',
        'storage_location_id',
        'barcode',
    ];

    public function storageLocation()
    {
        return $this->belongsTo(StorageLocation::class, 'storage_location_id');
    }

    public function brand()
    {
        return $this->belongsTo(Brand::class);
    }

    public function category()
    {
        return $this->belongsTo(Category::class);
    }

    public function supplier()
    {
        return $this->belongsTo(Supplier::class);
    }

    public function productSuppliers()
    {
        return $this->hasMany(ProductSupplier::class);
    }

    public function suppliers()
    {
        return $this->belongsToMany(Supplier::class, 'product_suppliers')
            ->withPivot([
                'id',
                'supplier_sku',
                'last_purchase_price',
                'lead_time_days',
                'min_order_qty',
                'is_preferred',
                'notes',
            ])
            ->withTimestamps();
    }

    public function batches()
    {
        return $this->hasMany(Batch::class);
    }

    private function refreshMargins(): void
    {
        $avg = (float) ($this->avg_price ?? 0.0);
        $retailSalePrice = (float) ($this->unit_sale_price ?? 0.0);
        $wholesaleSalePrice = (float) ($this->whole_sale_unit_price ?? 0.0);

        $this->margin = ($retailSalePrice > 0 && $avg > 0)
            ? round((($retailSalePrice - $avg) / $retailSalePrice) * 100, 2)
            : 0.0;

        $this->whole_sale_margin = ($wholesaleSalePrice > 0 && $avg > 0)
            ? round((($wholesaleSalePrice - $avg) / $wholesaleSalePrice) * 100, 2)
            : 0.0;
    }

    /**
     * Apply a purchase item using moving weighted-average on CURRENT ON-HAND stock only.
     * IMPORTANT: use line-level avg_price (effective cost) so bonuses/discounts are included.
     *
     * $item keys expected:
     * - quantity (units), avg_price
     * - unit_purchase_price/pack_purchase_price/pack_sale_price/unit_sale_price (optional passthroughs)
     */
    public function applyPurchaseFromItem(array $item): void
    {
        $currentQty = (int) ($this->quantity ?? 0);
        $oldAvg  = (float) ($this->avg_price ?? 0.0);
        $newQty  = max(0, (int) ($item['quantity'] ?? 0));
        $effCost = (float) ($item['avg_price'] ?? $item['unit_purchase_price'] ?? 0.0);

        $totalQty = $currentQty + $newQty;

        if ($currentQty < 0) {
            $this->quantity = $totalQty;

            if ($totalQty <= 0) {
                $this->avg_price = 0;
                $this->refreshMargins();
                $this->save();
                return;
            }

            $this->avg_price = round(max($effCost, 0), 2);
            $this->refreshMargins();
            $this->save();
            return;
        }

        $oldQty = max(0, $currentQty);
        $oldValue = $oldQty * $oldAvg;
        $newValue = $newQty * $effCost;

        $weightedAvg = $totalQty > 0
            ? (($oldValue + $newValue) / $totalQty)
            : 0.0;

        // Update live fields (latest prices kept if provided)
        $this->quantity = $totalQty;

        if (array_key_exists('pack_purchase_price', $item)) {
            $this->pack_purchase_price = $item['pack_purchase_price'];
        }
        if (array_key_exists('unit_purchase_price', $item)) {
            $this->unit_purchase_price = $item['unit_purchase_price'];
        }
        if (array_key_exists('pack_sale_price', $item)) {
            $this->pack_sale_price = $item['pack_sale_price'];
        }
        if (array_key_exists('unit_sale_price', $item)) {
            $this->unit_sale_price = $item['unit_sale_price'];
        }

        if (array_key_exists('whole_sale_pack_price', $item)) {
            $this->whole_sale_pack_price = $item['whole_sale_pack_price'];
        }
        if (array_key_exists('whole_sale_unit_price', $item)) {
            $this->whole_sale_unit_price = $item['whole_sale_unit_price'];
        }

        $this->avg_price = round(max($weightedAvg, 0), 2);
        $this->refreshMargins();

        $this->save();
    }

    /**
     * Revert a purchase item using the exact inverse weighted-average math
     * against CURRENT ON-HAND inventory value.
     *
     * This is critical when some of the older purchased stock was already sold:
     * we must not rebuild avg_price from full purchase history, otherwise sold stock
     * gets counted again and the moving average becomes artificially high.
     *
     * $item may be array or PurchaseInvoiceItem model:
     * - quantity (units), avg_price
     *
     * @param mixed $item The item to revert (array or model)
     * @param int|null $excludeItemId Kept for backward compatibility; no longer needed.
     */
    public function revertPurchaseFromItem($item, ?int $excludeItemId = null, bool $allowNegative = false): void
    {
        $currentQty = (int) ($this->quantity ?? 0);
        $currentAvg = (float) ($this->avg_price ?? 0.0);
        $qtyToRemove = max(0, (int) (is_array($item) ? ($item['quantity'] ?? 0) : $item->quantity));
        $effCost = (float) (is_array($item)
            ? ($item['avg_price'] ?? $item['unit_purchase_price'] ?? 0.0)
            : ($item->avg_price ?? $item->unit_purchase_price ?? 0.0));

        $remainingQty = $currentQty - $qtyToRemove;

        if ($remainingQty <= 0) {
            $this->quantity = $allowNegative ? $remainingQty : 0;
            $this->avg_price = 0;
            $this->refreshMargins();
            $this->save();
            return;
        }

        $currentValue = $currentQty * $currentAvg;
        $removedValue = $qtyToRemove * $effCost;
        $remainingValue = $currentValue - $removedValue;

        // Protect against rounding drift and historical bad data.
        if ($remainingValue < 0) {
            $remainingValue = 0;
        }

        $this->quantity = $remainingQty;
        $this->avg_price = round($remainingValue / $remainingQty, 2);
        $this->refreshMargins();

        $this->save();
    }

}
