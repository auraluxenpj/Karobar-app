<?php

namespace App\Services;

use App\Models\Product;
use App\Models\PurchaseOrder;
use App\Models\UserDemand;
use Illuminate\Support\Facades\Auth;
use Illuminate\Validation\ValidationException;

class PurchaseOrderReceiving
{
    // Must run inside the invoice transaction. Serializes competing receipts/edits.
    public function validateReceipt(PurchaseOrder $order, array &$data): void
    {
        $items = $order->items()->get()->keyBy('product_id');
        $totalReceivedUnits = 0;
        foreach ($data['items'] as $i => &$row) {
            $line = $items->get($row['product_id']);
            $row['purchase_order_item_id'] = $line?->id;
            foreach (['pack_quantity', 'pack_bonus', 'unit_quantity', 'unit_bonus', 'quantity', 'unit_purchase_price', 'pack_purchase_price', 'unit_sale_price', 'pack_sale_price', 'whole_sale_unit_price', 'whole_sale_pack_price'] as $field) {
                if (($row[$field] ?? 0) < 0) {
                    throw ValidationException::withMessages(["items.$i.$field" => 'The value cannot be negative.']);
                }
            }
            if (isset($row['pack_size']) && $row['pack_size'] < 1) {
                throw ValidationException::withMessages(["items.$i.pack_size" => 'Pack size must be positive.']);
            }
            if (($row['item_discount_percentage'] ?? 0) > 100) {
                throw ValidationException::withMessages(["items.$i.item_discount_percentage" => 'Discount cannot exceed 100%.']);
            }
            if ((int) $row['quantity'] !== (int) $row['unit_quantity'] + (int) ($row['unit_bonus'] ?? 0)) {
                throw ValidationException::withMessages(["items.$i.quantity" => 'Stock quantity must equal paid units plus bonus units.']);
            }
            $totalReceivedUnits += (int) ($row['quantity'] ?? 0);
        }
        unset($row);
        if ($totalReceivedUnits <= 0) {
            throw ValidationException::withMessages(['items' => 'Receive at least one unit.']);
        }
    }

    public function sync(PurchaseOrder $order): void
    {
        $order->load('items.product', 'items.invoiceItems', 'invoices');
        $activeInvoices = $order->invoices
            ->filter(fn ($inv) => ($inv->status ?? null) !== 'reversed')
            ->values();
        $activeInvoiceIds = $activeInvoices->pluck('id')->map(fn ($id) => (int) $id)->all();
        $hasInvoices = $activeInvoices->isNotEmpty();
        $complete = $order->items->every(function ($line) use ($activeInvoiceIds) {
            $activeQty = $line->invoiceItems
                ->filter(fn ($ii) => in_array((int) $ii->purchase_invoice_id, $activeInvoiceIds, true))
                ->sum('unit_quantity');
            return $activeQty >= $line->ordered_quantity;
        });
        $status = $hasInvoices ? ($complete ? 'received' : 'partially_received') : 'ordered';
        $latestSupplierId = $hasInvoices
            ? ($activeInvoices->last()?->supplier_id ?? $order->supplier_id)
            : $order->supplier_id;

        $order->update([
            'supplier_id' => $latestSupplierId,
            'status' => $status,
            'received_by' => $hasInvoices ? ($order->received_by ?? Auth::id()) : null,
            'updated_by' => Auth::id(),
            'received_at' => $hasInvoices ? ($order->received_at ?? now()) : null,
        ]);

        $this->syncUndeliveredUserDemands($order, $status, $activeInvoiceIds);
    }

    private function syncUndeliveredUserDemands(PurchaseOrder $order, string $status, array $activeInvoiceIds = []): void
    {
        $orderNumber = $order->number ?: ('PO-' . str_pad((string) $order->id, 5, '0', STR_PAD_LEFT));
        $note = "Undelivered from Purchase Order {$orderNumber}";

        if ($status !== 'partially_received') {
            UserDemand::where('notes', $note)
                ->where('status', 'pending')
                ->delete();
            return;
        }

        foreach ($order->items as $line) {
            $receivedUnits = (int) $line->invoiceItems
                ->filter(fn ($ii) => in_array((int) $ii->purchase_invoice_id, $activeInvoiceIds, true))
                ->sum('unit_quantity');
            $remainingUnits = max(0, (int) $line->ordered_quantity - $receivedUnits);

            if ($remainingUnits <= 0) {
                UserDemand::where('product_id', $line->product_id)
                    ->where('notes', $note)
                    ->where('status', 'pending')
                    ->delete();
                continue;
            }

            // Mark any pre-existing pending demands for this product as ordered
            // so the undelivered balance from this PO is the single active pending demand.
            UserDemand::where('product_id', $line->product_id)
                ->where('status', 'pending')
                ->where(function ($query) use ($note) {
                    $query->whereNull('notes')->orWhere('notes', '!=', $note);
                })
                ->update(['status' => 'ordered']);

            $productName = $line->product?->name
                ?? Product::whereKey($line->product_id)->value('name')
                ?? (string) $line->product_id;

            $existing = UserDemand::where('product_id', $line->product_id)
                ->where('notes', $note)
                ->first();

            if ($existing) {
                $existing->update([
                    'requested_name' => $productName,
                    'requested_quantity' => $remainingUnits,
                    'status' => 'pending',
                ]);
            } else {
                UserDemand::create([
                    'product_id' => $line->product_id,
                    'requested_by' => Auth::id() ?? $order->created_by,
                    'requested_name' => $productName,
                    'requested_quantity' => $remainingUnits,
                    'notes' => $note,
                    'status' => 'pending',
                ]);
            }
        }
    }
}
