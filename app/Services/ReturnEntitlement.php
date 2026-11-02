<?php

namespace App\Services;

use App\Models\PurchaseInvoice;
use App\Models\SaleInvoice;
use Illuminate\Support\Facades\DB;
use Illuminate\Validation\ValidationException;

class ReturnEntitlement
{
    public function remaining(string $kind, $invoice, ?int $exclude = null): array
    {
        $sale = $kind === 'sale';
        $headers = $sale ? 'sale_returns' : 'purchase_returns';
        $lines = $sale ? 'sale_return_items' : 'purchase_return_items';
        $link = $sale ? 'sale_invoice_id' : 'purchase_invoice_id';
        $parent = $sale ? 'sale_return_id' : 'purchase_return_id';
        $quantity = $sale ? 'unit_return_quantity' : 'return_unit_quantity';
        $batch = $sale ? 'batch_number' : 'batch';
        $original = [];
        foreach ($invoice->items()->get() as $item) {
            $key = $this->key($item->product_id, $item->$batch, $item->expiry);
            $units = (int) $item->quantity + ($sale ? max(0, (int) ($item->bonus ?? 0)) : 0);
            $original[$key] = ($original[$key] ?? 0) + $units;
        }
        $returned = DB::table($lines.' as l')->join($headers.' as h', 'h.id', '=', 'l.'.$parent)
            ->where('h.'.$link, $invoice->id)->when($exclude, fn ($q) => $q->where('h.id', '!=', $exclude))
            ->select('l.product_id', 'l.'.$batch.' as batch', 'l.expiry', 'l.'.$quantity.' as quantity')->get();
        foreach ($returned as $line) {
            $key = $this->key($line->product_id, $line->batch, $line->expiry);
            if (array_key_exists($key, $original) || trim((string) $line->batch) !== '' || trim((string) $line->expiry) !== '') {
                $original[$key] = ($original[$key] ?? 0) - (int) $line->quantity;
            } else {
                // Batchless return against a batched invoice line: deduct across matching product keys
                $remToDeduct = (int) $line->quantity;
                $prefix = '[' . (int) $line->product_id . ',';
                foreach ($original as $oKey => &$oQty) {
                    if ($remToDeduct <= 0) {
                        break;
                    }
                    if (str_starts_with($oKey, $prefix) && $oQty > 0) {
                        $deduct = min($oQty, $remToDeduct);
                        $oQty -= $deduct;
                        $remToDeduct -= $deduct;
                    }
                }
                unset($oQty);
                if ($remToDeduct > 0) {
                    $original[$key] = ($original[$key] ?? 0) - $remToDeduct;
                }
            }
        }

        return $original;
    }

    public function annotate(string $kind, $invoice, ?int $exclude = null): void
    {
        $remaining = $this->remaining($kind, $invoice, $exclude);
        foreach ($invoice->items as $item) {
            $batch = $kind === 'sale' ? $item->batch_number : $item->batch;
            $item->returnable_quantity = max(0, $remaining[$this->key($item->product_id, $batch, $item->expiry)] ?? 0);
        }
    }

    public function validate(string $kind, array $data, $existing = null): void
    {
        $sale = $kind === 'sale';
        $link = $sale ? 'sale_invoice_id' : 'purchase_invoice_id';
        $party = $sale ? 'customer_id' : 'supplier_id';
        $model = $sale ? SaleInvoice::class : PurchaseInvoice::class;
        // Lock old and new sources in the same order when editing/relinking.
        $ids = array_filter([$data[$link] ?? null, $existing?->$link]);
        $sources = $model::whereIn('id', $ids)->orderBy('id')->lockForUpdate()->get()->keyBy('id');
        if ($existing) {
            $fresh = $existing->newQuery()->whereKey($existing->id)->lockForUpdate()->firstOrFail();
            if ((int) $fresh->$link !== (int) $existing->$link) {
                abort(409, 'This return changed. Reload it before editing.');
            }
            $existing->setRawAttributes($fresh->getAttributes(), true);
            $existing->unsetRelations();
        }
        if (empty($data[$link])) {
            return;
        } // Existing unlinked-return workflow is preserved.
        $invoice = $sources->get($data[$link]);
        if (! $invoice || (int) $invoice->$party !== (int) $data[$party]) {
            throw ValidationException::withMessages([$link => 'The selected invoice does not belong to this '.($sale ? 'customer.' : 'supplier.')]);
        }
        $remaining = $this->remaining($kind, $invoice, $existing?->id);
        $totalByProduct = [];
        foreach ($remaining as $rKey => $rQty) {
            $decoded = json_decode($rKey, true);
            $pid = (int) ($decoded[0] ?? 0);
            if ($pid > 0) {
                $totalByProduct[$pid] = ($totalByProduct[$pid] ?? 0) + max(0, (int) $rQty);
            }
        }
        $requested = [];
        $requestedByProduct = [];
        foreach ($data['items'] as $index => $row) {
            $field = $sale ? 'unit_return_quantity' : 'return_unit_quantity';
            $pid = (int) ($row['product_id'] ?? 0);
            $batchVal = trim((string) ($row[$sale ? 'batch_number' : 'batch'] ?? ''));
            $expiryVal = trim((string) ($row['expiry'] ?? ''));
            $key = $this->key($pid, $batchVal, $expiryVal);
            $qty = (int) ($row[$field] ?? 0);
            $requestedByProduct[$pid] = ($requestedByProduct[$pid] ?? 0) + $qty;
            $productAvailable = max(0, $totalByProduct[$pid] ?? 0);

            if ($batchVal === '' && $expiryVal === '' && ! array_key_exists($key, $remaining) && array_key_exists($pid, $totalByProduct)) {
                if ($requestedByProduct[$pid] > $productAvailable) {
                    throw ValidationException::withMessages(["items.$index.$field" => "Only $productAvailable units remain available to return for this product/batch on the selected invoice."]);
                }
                continue;
            }

            $available = max(0, $remaining[$key] ?? 0);
            $requested[$key] = ($requested[$key] ?? 0) + $qty;
            if (! array_key_exists($key, $remaining) || $requested[$key] > $available || $requestedByProduct[$pid] > $productAvailable) {
                throw ValidationException::withMessages(["items.$index.$field" => "Only $available units remain available to return for this product/batch on the selected invoice."]);
            }
        }
    }

    public function lockSource(string $kind, $return): void
    {
        $link = $kind === 'sale' ? 'sale_invoice_id' : 'purchase_invoice_id';
        $model = $kind === 'sale' ? SaleInvoice::class : PurchaseInvoice::class;
        if ($return->$link) {
            $model::whereKey($return->$link)->lockForUpdate()->first();
        }
        $fresh = $return->newQuery()->whereKey($return->id)->lockForUpdate()->firstOrFail();
        if ((int) $fresh->$link !== (int) $return->$link) {
            abort(409, 'This return changed. Reload it before deleting.');
        }
        $return->setRawAttributes($fresh->getAttributes(), true);
        $return->unsetRelations();
    }

    private function key($product, $batch, $expiry): string
    {
        return json_encode([(int) $product, trim((string) $batch), substr(trim((string) $expiry), 0, 10)]);
    }
}
