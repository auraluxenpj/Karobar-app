<?php

namespace App\Services;

use App\Models\Batch;
use App\Models\Product;
use App\Models\User;
use Illuminate\Support\Collection;
use Illuminate\Validation\ValidationException;

class SaleStockAvailability
{
    /**
     * Check if a user has permission to override expired stock locks.
     */
    public function canOverrideExpired(?User $user): bool
    {
        if (!$user) {
            return false;
        }

        if (method_exists($user, 'hasRole')) {
            if ($user->hasRole(['Admin', 'admin', 'super-admin'])) {
                return true;
            }
        }

        if (method_exists($user, 'hasPermissionTo')) {
            try {
                if ($user->hasPermissionTo('sale-invoice.expired-override', 'sanctum') ||
                    $user->hasPermissionTo('sale-invoice.expired-override')) {
                    return true;
                }
            } catch (\Throwable $e) {
                // fall through
            }
        }

        if (method_exists($user, 'can') && $user->can('sale-invoice.expired-override')) {
            return true;
        }

        return false;
    }

    // Called inside the sale transaction. Lock products and batches in ID order.
    public function validate(
        array $items,
        ?Collection $originalItems = null,
        ?User $user = null,
        bool $expiredOverride = false,
        array $overrideCredentials = []
    ): void {
        if ($expiredOverride && !empty($overrideCredentials)) {
            $user = app(InvoiceCalculationService::class)->resolveAuthorizingUser($user, $overrideCredentials, 'sale-invoice.expired-override');
        }
        $originalItems ??= collect();
        $ids = collect($items)->pluck('product_id')->merge($originalItems->pluck('product_id'))->unique()->sort()->values();
        $products = Product::whereIn('id', $ids)->orderBy('id')->lockForUpdate()->get()->keyBy('id');
        $batches = Batch::whereIn('product_id', $ids)->orderBy('id')->lockForUpdate()->get();
        $requested = [];
        $batchRequested = [];
        $unbatchedRequested = [];
        $restored = $originalItems->groupBy('product_id')->map(
            fn ($rows) => $rows->sum(fn ($r) => (int) ($r->quantity ?? 0) + max(0, (int) ($r->bonus ?? 0)))
        );
        $batchRestored = [];
        $unbatchedRestored = [];

        foreach ($originalItems as $old) {
            $oldTotalUnits = (int) ($old->quantity ?? 0) + max(0, (int) ($old->bonus ?? 0));
            $batch = $this->matchBatch($batches, $old->toArray());
            if ($batch) {
                $batchRestored[$batch->id] = ($batchRestored[$batch->id] ?? 0) + $oldTotalUnits;
            } else {
                $unbatchedRestored[$old->product_id] = ($unbatchedRestored[$old->product_id] ?? 0) + $oldTotalUnits;
            }
        }

        $seenAllocations = [];

        foreach ($items as $index => $row) {
            $product = $products->get($row['product_id']);
            if (! $product) {
                throw ValidationException::withMessages(["items.$index.product_id" => 'This product is no longer available.']);
            }
            $rowUnits = (int) ($row['quantity'] ?? 0) + max(0, (int) ($row['bonus'] ?? 0));
            $requested[$product->id] = ($requested[$product->id] ?? 0) + $rowUnits;
            $available = (int) $product->quantity + (int) ($restored[$product->id] ?? 0);
            if ($requested[$product->id] > $available) {
                throw ValidationException::withMessages(["items.$index.quantity" => "Insufficient stock for {$product->name}. Available: $available units; requested: {$requested[$product->id]} units."]);
            }

            $batchNo = trim((string) ($row['batch_number'] ?? $row['batch'] ?? ''));
            $allocationKey = ($batchNo !== '' && $batchNo !== '__unbatched__')
                ? "batch:{$batchNo}"
                : "unbatched";

            if (isset($seenAllocations[$product->id][$allocationKey])) {
                if ($allocationKey === 'unbatched') {
                    throw ValidationException::withMessages([
                        "items.$index.quantity" => "Unassigned stock for {$product->name} can only be added once per invoice.",
                    ]);
                } else {
                    throw ValidationException::withMessages([
                        "items.$index.batch_number" => "Duplicate batch '{$batchNo}' for {$product->name}. Each batch can only be selected once per invoice.",
                    ]);
                }
            }
            $seenAllocations[$product->id][$allocationKey] = true;

            if ($batchNo !== '' && $batchNo !== '__unbatched__') {
                $batch = $this->matchBatch($batches, $row);
                if (! $batch) {
                    throw ValidationException::withMessages(["items.$index.batch_number" => "The selected batch for {$product->name} is unavailable or ambiguous. Select a valid batch and expiry."]);
                }

                // FEFO Expired Stock Selling Lock
                if ($batch->is_expired) {
                    if (!$expiredOverride) {
                        throw new \Illuminate\Http\Exceptions\HttpResponseException(response()->json([
                            'message' => "Batch '{$batch->batch_number}' for '{$product->name}' expired on {$batch->expiry_date} and cannot be sold without supervisor override.",
                            'requires_expired_override' => true,
                            'product_id' => $product->id,
                            'product_name' => $product->name,
                            'batch_number' => $batch->batch_number,
                            'expiry_date' => (string) $batch->expiry_date,
                            'errors' => [
                                "items.{$index}.batch_number" => ["Batch '{$batch->batch_number}' for '{$product->name}' expired on {$batch->expiry_date} and cannot be sold without supervisor override."],
                            ],
                        ], 422));
                    }

                    if (!$this->canOverrideExpired($user)) {
                        throw new \Illuminate\Http\Exceptions\HttpResponseException(response()->json([
                            'message' => 'You do not have permission to sell expired stock.',
                            'code' => 'EXPIRED_STOCK_UNAUTHORIZED',
                        ], 403));
                    }
                }

                $matchingBatches = $this->matchingBatches($batches, $row);
                $batchGroupKey = $product->id . ':' . $batch->batch_number;
                $batchRequested[$batchGroupKey] = ($batchRequested[$batchGroupKey] ?? 0) + $rowUnits;
                $availableBatchQty = (int) $matchingBatches->sum('quantity') + (int) $matchingBatches->sum(fn ($b) => $batchRestored[$b->id] ?? 0);
                if ($batchRequested[$batchGroupKey] > $availableBatchQty) {
                    throw ValidationException::withMessages(["items.$index.quantity" => "Insufficient stock in batch {$batch->batch_number} for {$product->name}. Available: $availableBatchQty units; requested: {$batchRequested[$batchGroupKey]} units."]);
                }
            } else {
                // Selling unbatched stock
                $productBatches = $batches->where('product_id', $product->id);
                if ($productBatches->isNotEmpty()) {
                    $totalBatched = (int) $productBatches->sum('quantity');
                    $unbatchedAvailable = max(0, ((int) $product->quantity + (int) ($unbatchedRestored[$product->id] ?? 0)) - $totalBatched);

                    $unbatchedRequested[$product->id] = ($unbatchedRequested[$product->id] ?? 0) + $rowUnits;

                    if ($unbatchedRequested[$product->id] > $unbatchedAvailable) {
                        // If unbatched stock is 0 and all batches are expired, trigger expired stock lock
                        $allBatchesExpired = $productBatches->every(fn ($b) => $b->is_expired);
                        if ($unbatchedAvailable === 0 && $allBatchesExpired) {
                            $earliestExpired = $productBatches->sortBy('expiry_date')->first();
                            $expiryStr = $earliestExpired ? $earliestExpired->expiry_date : 'already';

                            if (!$expiredOverride) {
                                throw new \Illuminate\Http\Exceptions\HttpResponseException(response()->json([
                                    'message' => "Stock for '{$product->name}' has expired ({$expiryStr}) and cannot be sold without supervisor override.",
                                    'requires_expired_override' => true,
                                    'product_id' => $product->id,
                                    'product_name' => $product->name,
                                    'expiry_date' => (string) $expiryStr,
                                    'errors' => [
                                        "items.{$index}.quantity" => ["Stock for '{$product->name}' has expired ({$expiryStr}) and cannot be sold without supervisor override."],
                                    ],
                                ], 422));
                            }

                            if (!$this->canOverrideExpired($user)) {
                                throw new \Illuminate\Http\Exceptions\HttpResponseException(response()->json([
                                    'message' => 'You do not have permission to sell expired stock.',
                                    'code' => 'EXPIRED_STOCK_UNAUTHORIZED',
                                ], 403));
                            }
                        }

                        throw ValidationException::withMessages([
                            "items.$index.quantity" => "Insufficient unbatched stock for {$product->name}. Available unbatched: {$unbatchedAvailable} units ({$totalBatched} units are assigned to batches). Please select a batch.",
                        ]);
                    }
                }
            }
        }
    }

    public function matchingBatches(Collection $batches, array $row): Collection
    {
        $number = trim((string) ($row['batch_number'] ?? $row['batch'] ?? ''));
        if ($number === '' || $number === '__unbatched__') {
            return collect();
        }
        $expiry = substr(trim((string) ($row['expiry'] ?? $row['expiry_date'] ?? '')), 0, 10);
        $matches = $batches->filter(fn ($batch) => (int) $batch->product_id === (int) $row['product_id']
            && trim((string) $batch->batch_number) === $number
            && ($expiry === '' || substr((string) $batch->expiry_date, 0, 10) === $expiry));

        return $matches
            ->sortByDesc(fn ($b) => ((int) $b->quantity > 0 ? 1000000 : 0) + (int) $b->quantity - (int) $b->id)
            ->values();
    }

    public function matchBatch(Collection $batches, array $row): ?Batch
    {
        $number = trim((string) ($row['batch_number'] ?? $row['batch'] ?? ''));
        if ($number === '' || $number === '__unbatched__') {
            return null;
        }
        if (!empty($row['batch_id'])) {
            $byId = $batches->first(fn ($b) => (int) $b->id === (int) $row['batch_id'] && (int) $b->product_id === (int) $row['product_id']);
            if ($byId) {
                return $byId;
            }
        }
        $matches = $this->matchingBatches($batches, $row);
        if ($matches->isEmpty()) {
            return null;
        }
        if ($matches->count() === 1) {
            return $matches->first();
        }

        if (!empty($row['storage_location_id'])) {
            $byLoc = $matches->first(fn ($b) => (int) $b->storage_location_id === (int) $row['storage_location_id']);
            if ($byLoc) {
                return $byLoc;
            }
        }

        return $matches->first();
    }
}
