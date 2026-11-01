<?php

namespace App\Http\Controllers;

use App\Models\Batch;
use App\Models\Product;
use App\Models\PurchaseInvoice;
use App\Models\PurchaseOrder;
use App\Models\Supplier;
use App\Models\SupplierLedger;
use App\Models\UserDemand;
use App\Services\PurchaseOrderReceiving;
use App\Services\SupplierProductSorting;
use Carbon\Carbon;
use Illuminate\Http\Request;
use Illuminate\Support\Facades\Auth;
use Illuminate\Support\Facades\DB;
use Illuminate\Validation\ValidationException;

class PurchaseInvoiceController extends Controller
{
    // (Legacy helper) Generate new invoice code — kept for backward compatibility, but
    // the UI no longer calls this; posted_number is now assigned server-side on SAVE.
    public function generateNewCode()
    {
        $this->authorize('create', PurchaseInvoice::class);
        $lastInvoice = PurchaseInvoice::orderBy('id', 'desc')->first();

        if ($lastInvoice && $lastInvoice->posted_number && preg_match('/PRINV-(\d+)/', $lastInvoice->posted_number, $matches)) {
            $lastCodeNum = (int) $matches[1];
            $newCodeNum = $lastCodeNum + 1;
        } else {
            $newCodeNum = 1;
        }

        $formattedCode = 'PRINV-' . str_pad($newCodeNum, 4, '0', STR_PAD_LEFT);
        return response()->json(['posted_number' => $formattedCode]);
    }

    private function resolveDueDate(array $data): string
    {
        if (!empty($data['due_date'])) {
            return Carbon::parse($data['due_date'])->toDateString();
        }
        $supplier = Supplier::find($data['supplier_id'] ?? null);
        $creditDays = $supplier ? ($supplier->credit_days ?? 30) : 30;
        $baseDate = $data['posted_date'] ?? now()->toDateString();
        return Carbon::parse($baseDate)->addDays($creditDays)->toDateString();
    }

    // List all invoices
    public function index(Request $request)
    {
        $qSupplierId = $request->query('supplier_id');
        if ($qSupplierId) {
            $this->authorize('lookup', PurchaseInvoice::class);
        } else {
            $this->authorize('viewAny', PurchaseInvoice::class);
        }
        
        $qPosted     = trim((string) $request->query('posted'));
        
        // Pagination parameters (capped at 200 to prevent unbounded memory hydration)
        $page     = max(1, (int) $request->query('page', 1));
        $perPage  = max(1, min((int) $request->query('per_page', 10), 200));

        $query = PurchaseInvoice::with(['supplier']);

        if ($qPosted !== '') {
            $query->where('posted_number', 'like', '%' . $qPosted . '%');
        }

        // Filter by supplier_id when provided (for Purchase Return form)
        if ($qSupplierId) {
            $query->where('supplier_id', $qSupplierId);
        }

        // Also filter by supplier name if provided
        $qSupplier = trim((string) $request->query('supplier'));
        if ($qSupplier !== '') {
            $query->whereHas('supplier', function ($q) use ($qSupplier) {
                $q->where('name', 'like', '%' . $qSupplier . '%');
            });
        }

        return $query->orderByDesc('id')->paginate($perPage, ['*'], 'page', $page);
    }

    // Show single invoice
    public function show(PurchaseInvoice $purchaseInvoice)
    {
        $this->authorize('view', $purchaseInvoice);
        $purchaseInvoice->load('supplier', 'items.product.brand', 'purchaseOrder');
        app(\App\Services\ReturnEntitlement::class)->annotate('purchase', $purchaseInvoice, request()->integer('exclude_return_id') ?: null);
        return $purchaseInvoice;
    }

    // Store new invoice — posted_number is assigned HERE (atomic, race-safe)
    public function store(Request $request)
    {
        $this->authorize('create', PurchaseInvoice::class);
        $data = $request->validate([
            'draft_id'             => 'nullable|integer|exists:invoice_drafts,id',
            'purchase_order_id'    => 'nullable|integer|exists:purchase_orders,id',
            'receipt_key' => 'exclude_without:purchase_order_id|required|uuid|unique:purchase_invoices,receipt_key',
            'supplier_id'          => 'required|exists:suppliers,id',
            'invoice_type'         => 'nullable|string|in:credit,debit',
            'payment_method'       => 'nullable|string|in:cash,card,bank_transfer,cheque,mobile_wallet,other',
            'account_id'           => 'nullable|integer|exists:accounts,id',
            // 'posted_number'      => now generated server-side
            'posted_date'          => 'required|date',
            'due_date'             => 'nullable|date',
            'remarks'              => 'nullable|string',
            'invoice_number'       => 'required|string|unique:purchase_invoices,invoice_number',
            'invoice_amount'       => 'required|numeric',
            'tax_percentage'       => 'nullable|numeric',
            'tax_amount'           => 'nullable|numeric',
            'discount_percentage'  => 'nullable|numeric',
            'discount_amount'      => 'nullable|numeric',
            'total_amount'         => 'required|numeric|min:0',
            'total_paid'           => 'nullable|numeric|min:0',
            'update_drawer'              => 'nullable|boolean',
            'update_drawer_if_pre_shift' => 'nullable|boolean',

            'items'                                => 'required|array|min:1',
            'items.*.purchase_order_item_id'        => 'nullable|integer|exists:purchase_order_items,id',
            'items.*.product_id'                   => 'required|exists:products,id',
            'items.*.pack_size'                    => 'nullable|integer',
            'items.*.batch'                        => 'nullable|string',
            'items.*.expiry'                       => 'nullable|date',
            'items.*.pack_quantity'                => 'required|numeric',
            'items.*.unit_quantity'                => 'required|integer',
            'items.*.pack_purchase_price'          => 'required|numeric',
            'items.*.unit_purchase_price'          => 'required|numeric',
            'items.*.pack_sale_price'              => 'required|numeric',
            'items.*.unit_sale_price'              => 'required|numeric',
            'items.*.whole_sale_pack_price'       => 'nullable|numeric',
            'items.*.whole_sale_unit_price'       => 'nullable|numeric',
            'items.*.whole_sale_margin'           => 'nullable|numeric',
            'items.*.item_discount_percentage'     => 'nullable|numeric|min:0',
            'items.*.pack_bonus'                   => 'nullable|numeric|min:0',
            'items.*.unit_bonus'                   => 'nullable|integer|min:0',
            'items.*.margin'                       => 'required|numeric',
            'items.*.sub_total'                    => 'required|numeric',
            'items.*.avg_price'                    => 'required|numeric',
            'items.*.quantity'                     => 'required|integer',
        ]);

        // 🛡️ Server-Authoritative Totals Recalculation
        $calculated = app(\App\Services\InvoiceCalculationService::class)->calculateAndValidatePurchase($data, $request->user());
        $data['invoice_amount']      = $calculated['invoice_amount'];
        $data['discount_percentage'] = $calculated['discount_percentage'];
        $data['discount_amount']     = $calculated['discount_amount'];
        $data['tax_percentage']      = $calculated['tax_percentage'];
        $data['tax_amount']          = $calculated['tax_amount'];
        $data['total_amount']        = $calculated['total_amount'];
        $data['items']               = $calculated['items'];

        $invoiceType = $data['invoice_type'] ?? 'debit';
        if (!array_key_exists('total_paid', $data) || $data['total_paid'] === null || $data['total_paid'] === '') {
            $data['total_paid'] = $invoiceType === 'credit' ? 0 : ($data['total_amount'] ?? 0);
        }

        try {
            return DB::transaction(function () use ($data) {
                $draft = null;
                if (!empty($data['draft_id'])) {
                    $draft = \App\Models\InvoiceDraft::lockForUpdate()->find($data['draft_id']);
                    if ($draft && $draft->status === 'posted') {
                        $postedInv = PurchaseInvoice::with('items.product', 'supplier', 'purchaseOrder')->find($draft->posted_invoice_id);
                        return response()->json($postedInv, 200);
                    }
                }

                $order = null;
                if (!empty($data['purchase_order_id'])) {
                    $order = PurchaseOrder::lockForUpdate()->findOrFail($data['purchase_order_id']);
                    $this->authorize('view', $order);
                    if (!in_array($order->status, ['ordered', 'partially_received'], true)) {
                        throw ValidationException::withMessages(['purchase_order_id' => 'This Purchase Order cannot be received.']);
                    }
                    app(PurchaseOrderReceiving::class)->validateReceipt($order, $data);
                } else {
                    foreach ($data['items'] as &$row) unset($row['purchase_order_item_id']);
                    unset($row);
                }
                // Lock the sequence by selecting last row FOR UPDATE to avoid two requests
                // generating the same posted_number when saving concurrently.
                $prefix = 'PRINV-';
                $lastPosted = DB::table('purchase_invoices')
                    ->whereNotNull('posted_number')
                    ->where('posted_number', 'like', $prefix . '%')
                    ->lockForUpdate()
                    ->orderByDesc('id')
                    ->value('posted_number');

                $nextNum = 1;
                if ($lastPosted && preg_match('/^' . preg_quote($prefix, '/') . '(\d+)$/', $lastPosted, $m)) {
                    $nextNum = (int) $m[1] + 1;
                }
                $nextCode = $prefix . str_pad($nextNum, 4, '0', STR_PAD_LEFT);
                $dueDate = $this->resolveDueDate($data);

                $createPayload = array_merge($data, [
                    'posted_number'  => $nextCode,
                    'invoice_type'   => $data['invoice_type'] ?? 'debit',
                ]);
                if (\App\Support\SchemaCache::hasColumn('purchase_invoices', 'due_date')) {
                    $createPayload['due_date'] = $dueDate;
                }
                if (\App\Support\SchemaCache::hasColumn('purchase_invoices', 'payment_method')) {
                    $createPayload['payment_method'] = $data['payment_method'] ?? 'cash';
                } else {
                    unset($createPayload['payment_method']);
                }

                $invoice = PurchaseInvoice::create($createPayload);

                $this->processInvoiceItems($invoice, $data['items']);

                $this->recalcProductsByIds(
                    collect($data['items'])->pluck('product_id')->unique()->all()
                );

                // Create supplier ledger entry ONLY for credit purchases
                $invoiceType = $data['invoice_type'] ?? 'debit';
                if ($invoiceType === 'credit') {
                    $ledger = new SupplierLedger();
                    $ledger->supplier_id       = $data['supplier_id'];
                    $ledger->purchase_invoice_id = $invoice->id;
                    $ledger->entry_type        = 'invoice';
                    $ledger->is_manual         = false;
                    $ledger->entry_date        = $data['posted_date'];
                    if (\App\Support\SchemaCache::hasColumn('supplier_ledgers', 'due_date')) {
                        $ledger->due_date      = $dueDate;
                    }
                    $ledger->posted_number     = $nextCode;
                    $ledger->invoice_number    = $data['invoice_number'];
                    $ledger->invoice_total     = $data['total_amount'];
                    $ledger->total_paid        = $data['total_paid'] ?? 0;
                    $ledger->debited_amount    = 0;
                    $ledger->credit_remaining  = max((float)$data['total_amount'] - (float)($data['total_paid'] ?? 0), 0);
                    $ledger->payment_ref       = null;
                    $ledger->description       = 'Purchase invoice ' . $nextCode;
                    $ledger->created_by        = optional(Auth::user())->id;
                    $ledger->save();
                }

                if ($order) {
                    app(PurchaseOrderReceiving::class)->sync($order);
                    app(SupplierProductSorting::class)->remember((int) $data['supplier_id'], array_column($data['items'], 'product_id'));
                }

                if ($draft) {
                    $draft->status = 'posted';
                    $draft->posted_invoice_id = $invoice->id;
                    $draft->posted_invoice_type = PurchaseInvoice::class;
                    $draft->save();
                }

                // Account & Cash Drawer recording if money was paid
                $payMethod = $invoice->payment_method ?? 'cash';
                $cashPaid = (float)($invoice->total_paid ?? 0);
                if (($invoice->invoice_type ?? 'debit') === 'debit' && $cashPaid <= 0) {
                    $cashPaid = (float)$invoice->total_amount;
                }
                if ($cashPaid > 0) {
                    $account = app(\App\Services\AccountService::class)->resolveAccount($invoice->account_id, $payMethod);
                    if ($account) {
                        $invoice->account_id = $account->id;
                        $invoice->saveQuietly();

                        app(\App\Services\AccountService::class)->withdraw(
                            $account,
                            $cashPaid,
                            'purchase_invoice',
                            $invoice->id,
                            "Purchase Invoice {$nextCode} ({$account->name})",
                            Auth::user()
                        );
                    }

                    if (($account && $account->type === 'cash') || $payMethod === 'cash') {
                        app(\App\Services\CashDrawerService::class)->recordTransaction(
                            null,
                            'cash_purchase',
                            $cashPaid,
                            'purchase_invoice',
                            $invoice->id,
                            "Cash purchase {$nextCode}",
                            Auth::user()
                        );
                    }
                }

                app(\App\Services\DocumentAuditService::class)->recordCreate($invoice->load('items.product'), Auth::user());

                // Return the created invoice including items and supplier for the client
                return response()->json($invoice->load('items.product', 'supplier', 'purchaseOrder'), 201);
            });
        } catch (\Illuminate\Database\QueryException $e) {
            // Likely unique-constraint violation (invoice_number / posted_number)
            return $this->respondDuplicateError($e);
        } catch (ValidationException $e) {
            throw $e;
        } catch (\Illuminate\Auth\Access\AuthorizationException $e) {
            throw $e;
        } catch (\Exception $e) {
            return response()->json([
                'message' => 'Error creating purchase invoice',
                'error'   => $e->getMessage()
            ], 500);
        }
    }

    // Update invoice (posted_number stays unchanged; do not regenerate)
    public function update(Request $request, PurchaseInvoice $purchaseInvoice)
    {
        $this->authorize('update', $purchaseInvoice);

        if ($purchaseInvoice->status === 'reversed') {
            abort(422, 'Cannot edit an invoice that has been reversed.');
        }

        $auditService = app(\App\Services\DocumentAuditService::class);
        $beforeSnapshot = $auditService->snapshot($purchaseInvoice->load('items.product'));

        $data = $request->validate([
            'reason'               => 'nullable|string|max:500',
            'supplier_id'          => 'required|exists:suppliers,id',
            'invoice_type'         => 'nullable|string|in:credit,debit',
            'payment_method'       => 'nullable|string|in:cash,card,bank_transfer,cheque,mobile_wallet,other',
            'account_id'           => 'nullable|integer|exists:accounts,id',
            // 'posted_number'      => not user-editable on update
            'posted_date'          => 'required|date',
            'due_date'             => 'nullable|date',
            'remarks'              => 'nullable|string',
            'invoice_number'       => 'required|string|unique:purchase_invoices,invoice_number,' . $purchaseInvoice->id,
            'invoice_amount'       => 'required|numeric',
            'tax_percentage'       => 'nullable|numeric',
            'tax_amount'           => 'nullable|numeric',
            'discount_percentage'  => 'nullable|numeric',
            'discount_amount'      => 'nullable|numeric',
            'total_amount'         => 'required|numeric|min:0',
            'total_paid'           => 'nullable|numeric|min:0',
            'update_drawer'              => 'nullable|boolean',
            'update_drawer_if_pre_shift' => 'nullable|boolean',

            'items'                                => 'required|array|min:1',
            'items.*.purchase_order_item_id'        => 'nullable|integer|exists:purchase_order_items,id',
            'items.*.product_id'                   => 'required|exists:products,id',
            'items.*.pack_size'                    => 'nullable|integer',
            'items.*.batch'                        => 'nullable|string',
            'items.*.expiry'                       => 'nullable|date',
            'items.*.pack_quantity'                => 'required|numeric',
            'items.*.unit_quantity'                => 'required|integer',
            'items.*.pack_purchase_price'          => 'required|numeric',
            'items.*.unit_purchase_price'          => 'required|numeric',
            'items.*.pack_sale_price'              => 'required|numeric',
            'items.*.unit_sale_price'              => 'required|numeric',
            'items.*.whole_sale_pack_price'       => 'nullable|numeric',
            'items.*.whole_sale_unit_price'       => 'nullable|numeric',
            'items.*.whole_sale_margin'           => 'nullable|numeric',
            'items.*.item_discount_percentage'     => 'nullable|numeric|min:0',
            'items.*.pack_bonus'                   => 'nullable|numeric|min:0',
            'items.*.unit_bonus'                   => 'nullable|integer|min:0',
            'items.*.margin'                       => 'required|numeric',
            'items.*.sub_total'                    => 'required|numeric',
            'items.*.avg_price'                    => 'required|numeric',
            'items.*.quantity'                     => 'required|integer',
        ]);

        // 🛡️ Server-Authoritative Totals Recalculation
        $calculated = app(\App\Services\InvoiceCalculationService::class)->calculateAndValidatePurchase($data, $request->user());
        $data['invoice_amount']      = $calculated['invoice_amount'];
        $data['discount_percentage'] = $calculated['discount_percentage'];
        $data['discount_amount']     = $calculated['discount_amount'];
        $data['tax_percentage']      = $calculated['tax_percentage'];
        $data['tax_amount']          = $calculated['tax_amount'];
        $data['total_amount']        = $calculated['total_amount'];
        $data['items']               = $calculated['items'];

        try {
            return DB::transaction(function () use ($purchaseInvoice, $data, $auditService, $beforeSnapshot, $request) {
                $order = $purchaseInvoice->purchase_order_id
                    ? PurchaseOrder::lockForUpdate()->findOrFail($purchaseInvoice->purchase_order_id) : null;
                if ($order) {
                    $purchaseInvoice->refresh();
                    app(PurchaseOrderReceiving::class)->validateReceipt($order, $data);
                }
                else {
                    foreach ($data['items'] as &$row) unset($row['purchase_order_item_id']);
                    unset($row);
                }
                // Keep existing posted_number intact
                $data['posted_number'] = $purchaseInvoice->posted_number;

                // Store old invoice type before update (excluding standalone PaymentAllocation amounts)
                $allocatedOnInvoice = app(\App\Services\PaymentService::class)->getAllocatedAmountForInvoice('purchase_invoice', (int) $purchaseInvoice->id);
                $oldAccountId = $purchaseInvoice->account_id;
                $oldInvoiceType = $purchaseInvoice->invoice_type ?? 'debit';
                $oldPayMethod = $purchaseInvoice->payment_method ?? 'cash';
                $oldRawPaid = (float) ($purchaseInvoice->total_paid ?? 0);
                if ($oldInvoiceType === 'debit' && $oldRawPaid <= 0) {
                    $oldRawPaid = (float) $purchaseInvoice->total_amount;
                }
                $oldDirectPaid = max(0.0, round($oldRawPaid - $allocatedOnInvoice, 2));
                $oldCashPaid = ($oldPayMethod === 'cash') ? $oldDirectPaid : 0.0;
                $newInvoiceType = $data['invoice_type'] ?? $oldInvoiceType;

                if (!array_key_exists('total_paid', $data) || $data['total_paid'] === null || $data['total_paid'] === '') {
                    $data['total_paid'] = $newInvoiceType === 'credit' ? $allocatedOnInvoice : ($data['total_amount'] ?? 0);
                } elseif ($newInvoiceType === 'credit' && $allocatedOnInvoice > 0 && (float) $data['total_paid'] < $allocatedOnInvoice) {
                    $data['total_paid'] = round((float) $data['total_paid'] + $allocatedOnInvoice, 2);
                }

                $purchaseInvoice->load('items');
                $oldItemsByKey = $this->groupPurchaseItemsByStockKey(
                    $purchaseInvoice->items->toArray()
                );
                $newItemsByKey = $this->groupPurchaseItemsByStockKey($data['items']);

                $allKeys = array_values(array_unique(array_merge(
                    array_keys($oldItemsByKey),
                    array_keys($newItemsByKey)
                )));

                foreach ($allKeys as $key) {
                    $oldGroup = $oldItemsByKey[$key] ?? null;
                    $newGroup = $newItemsByKey[$key] ?? null;

                    if (!$oldGroup && !$newGroup) {
                        continue;
                    }

                    $productId = (int) ($newGroup['product_id'] ?? $oldGroup['product_id'] ?? 0);
                    if ($productId <= 0) {
                        continue;
                    }

                    $delta = (int) ($newGroup['quantity'] ?? 0) - (int) ($oldGroup['quantity'] ?? 0);
                    $product = Product::find($productId);
                    if (!$product) {
                        continue;
                    }

                    if ($delta > 0) {
                        $payload = $newGroup['source'] ?? [];
                        $payload['quantity'] = $delta;
                        $payload['avg_price'] = $newGroup['avg_price'] ?? ($payload['avg_price'] ?? $payload['unit_purchase_price'] ?? 0);
                        $product->applyPurchaseFromItem($payload);
                    } elseif ($delta < 0) {
                        $payload = $oldGroup['source'] ?? [];
                        $payload['quantity'] = abs($delta);
                        $payload['avg_price'] = $oldGroup['avg_price'] ?? ($payload['avg_price'] ?? $payload['unit_purchase_price'] ?? 0);
                        $product->revertPurchaseFromItem($payload);
                    }

                    $batchSource = $newGroup['source'] ?? $oldGroup['source'] ?? [];
                    $this->adjustBatchQuantity(
                        $productId,
                        $batchSource['batch'] ?? null,
                        $batchSource['expiry'] ?? null,
                        $delta,
                        false,
                        $newGroup ? $batchSource : []
                    );

                    if ($newGroup) {
                        $this->syncProductPricingFromItem($product, $batchSource);
                        $this->syncProductSupplierLink(
                            $productId,
                            (int) ($data['supplier_id'] ?? 0),
                            $batchSource
                        );
                    }
                }

                $dueDate = $this->resolveDueDate($data);

                // Update invoice with explicit invoice_type
                $updatePayload = [
                    'supplier_id'        => $data['supplier_id'],
                    'invoice_type'       => $newInvoiceType,
                    'posted_number'      => $data['posted_number'],
                    'posted_date'        => $data['posted_date'],
                    'remarks'            => $data['remarks'] ?? null,
                    'invoice_number'     => $data['invoice_number'],
                    'invoice_amount'     => $data['invoice_amount'],
                    'tax_percentage'     => $data['tax_percentage'] ?? 0,
                    'tax_amount'         => $data['tax_amount'] ?? 0,
                    'discount_percentage'=> $data['discount_percentage'] ?? 0,
                    'discount_amount'    => $data['discount_amount'] ?? 0,
                    'total_amount'       => $data['total_amount'],
                    'total_paid'         => $data['total_paid'] ?? 0,
                ];
                if (\Illuminate\Support\Facades\Schema::hasColumn('purchase_invoices', 'due_date')) {
                    $updatePayload['due_date'] = $dueDate;
                }
                if (\Illuminate\Support\Facades\Schema::hasColumn('purchase_invoices', 'payment_method')) {
                    $updatePayload['payment_method'] = $data['payment_method'] ?? $purchaseInvoice->payment_method ?? 'cash';
                }
                $purchaseInvoice->update($updatePayload);

                $purchaseInvoice->items()->delete();
                $this->persistInvoiceItems($purchaseInvoice, $data['items']);

                // Mark pending/ordered user demands for these received products as fulfilled
                $productIds = collect($data['items'])
                    ->filter(fn ($row) => ((int) ($row['quantity'] ?? $row['unit_quantity'] ?? 0)) > 0)
                    ->pluck('product_id')
                    ->filter()
                    ->unique()
                    ->all();
                if (\Illuminate\Support\Facades\Schema::hasTable('user_demands') && !empty($productIds)) {
                    UserDemand::whereIn('product_id', $productIds)
                        ->whereIn('status', ['pending', 'ordered'])
                        ->update(['status' => 'fulfilled']);
                }

                // Handle supplier ledger entries
                // If invoice was previously credit but is now debit, delete the ledger entry
                if ($oldInvoiceType === 'credit' && $newInvoiceType !== 'credit') {
                    // Remove existing ledger entry for this invoice
                    SupplierLedger::where('purchase_invoice_id', $purchaseInvoice->id)->delete();
                }
                // If invoice is now credit, create or update ledger entry
                elseif ($newInvoiceType === 'credit') {
                    // Check if a ledger entry already exists for this invoice
                    $existingLedger = SupplierLedger::where('purchase_invoice_id', $purchaseInvoice->id)->first();
                    $invTotalAmount = (float) $data['total_amount'];
                    $rawTotalPaid   = (float) ($data['total_paid'] ?? 0);
                    $directPaidOnInv = max(0.0, min(round($rawTotalPaid - $allocatedOnInvoice, 2), $invTotalAmount));
                    $creditRemainingOnInv = max(0.0, round($invTotalAmount - $directPaidOnInv, 2));

                    if ($existingLedger) {
                        $ledgerUpdates = [
                            'supplier_id'        => $data['supplier_id'],
                            'entry_date'         => $data['posted_date'],
                            'invoice_total'      => $invTotalAmount,
                            'total_paid'         => $directPaidOnInv,
                            'credit_remaining'   => $creditRemainingOnInv,
                            'description'        => 'Purchase invoice ' . $data['posted_number'],
                        ];
                        if (\Illuminate\Support\Facades\Schema::hasColumn('supplier_ledgers', 'due_date')) {
                            $ledgerUpdates['due_date'] = $dueDate;
                        }
                        $existingLedger->update($ledgerUpdates);
                    } else {
                        // Create new ledger entry
                        $ledger = new SupplierLedger();
                        $ledger->supplier_id         = $data['supplier_id'];
                        $ledger->purchase_invoice_id = $purchaseInvoice->id;
                        $ledger->entry_type          = 'invoice';
                        $ledger->is_manual           = false;
                        $ledger->entry_date          = $data['posted_date'];
                        if (\Illuminate\Support\Facades\Schema::hasColumn('supplier_ledgers', 'due_date')) {
                            $ledger->due_date        = $dueDate;
                        }
                        $ledger->posted_number       = $data['posted_number'];
                        $ledger->invoice_number      = $data['invoice_number'];
                        $ledger->invoice_total       = $invTotalAmount;
                        $ledger->total_paid          = $directPaidOnInv;
                        $ledger->debited_amount      = 0;
                        $ledger->credit_remaining    = $creditRemainingOnInv;
                        $ledger->payment_ref         = null;
                        $ledger->description         = 'Purchase invoice ' . $data['posted_number'];
                        $ledger->created_by          = optional(Auth::user())->id;
                        $ledger->save();
                    }
                }

                if ($order) {
                    app(PurchaseOrderReceiving::class)->sync($order);
                    app(SupplierProductSorting::class)->remember((int) $data['supplier_id'], array_column($data['items'], 'product_id'));
                }

                // Sync with active cash drawer if applicable (using direct paid only, excluding allocations)
                $newPayMethod = $data['payment_method'] ?? $purchaseInvoice->payment_method ?? 'cash';
                $newRawPaid = (float) ($data['total_paid'] ?? 0);
                if ($newInvoiceType === 'debit' && $newRawPaid <= 0) {
                    $newRawPaid = (float) $data['total_amount'];
                }
                $newDirectPaid = max(0.0, round($newRawPaid - $allocatedOnInvoice, 2));
                $newCashPaid = ($newPayMethod === 'cash') ? $newDirectPaid : 0.0;
                $updateDrawerFlag = null;
                if ($request->has('update_drawer')) {
                    $updateDrawerFlag = $request->boolean('update_drawer');
                } elseif ($request->has('update_drawer_if_pre_shift')) {
                    $updateDrawerFlag = $request->boolean('update_drawer_if_pre_shift');
                }

                app(\App\Services\CashDrawerService::class)->syncPurchaseInvoiceUpdate(
                    $purchaseInvoice,
                    $oldCashPaid,
                    $newCashPaid,
                    $updateDrawerFlag,
                    Auth::user()
                );

                // Sync with financial accounts
                $newAccountId = array_key_exists('account_id', $data) ? $data['account_id'] : $purchaseInvoice->account_id;
                app(\App\Services\AccountService::class)->syncPurchaseInvoiceUpdate(
                    $purchaseInvoice,
                    $oldAccountId,
                    $oldPayMethod,
                    $oldDirectPaid,
                    $newAccountId,
                    $newPayMethod,
                    $newDirectPaid,
                    Auth::user()
                );

                $auditService->recordUpdate($purchaseInvoice->fresh(['items.product', 'supplier']), $beforeSnapshot, Auth::user(), $data['reason'] ?? 'Purchase invoice updated');

                return response()->json($purchaseInvoice->load('items.product', 'supplier', 'purchaseOrder'));
            });
        } catch (\Illuminate\Database\QueryException $e) {
            // Likely unique-constraint violation (invoice_number / posted_number)
            return $this->respondDuplicateError($e);
        } catch (ValidationException $e) {
            throw $e;
        } catch (\Illuminate\Auth\Access\AuthorizationException $e) {
            throw $e;
        } catch (\Exception $e) {
            return response()->json([
                'message' => 'Failed to update purchase invoice',
                'error'   => $e->getMessage()
            ], 500);
        }
    }

    // Delete invoice
    public function destroy(PurchaseInvoice $purchaseInvoice)
    {
        $this->authorize('delete', $purchaseInvoice);
        try {
            return DB::transaction(function () use ($purchaseInvoice) {
                $order = $purchaseInvoice->purchase_order_id ? PurchaseOrder::lockForUpdate()->findOrFail($purchaseInvoice->purchase_order_id) : null;
                if ($order) $purchaseInvoice->refresh();
                $purchaseInvoice->load('items');

                $affectedIds = $purchaseInvoice->items->pluck('product_id')->unique()->all();

                foreach ($purchaseInvoice->items as $item) {
                    $this->revertItem($item, true, true);
                }

                // Unwind any Payment / Credit Note allocations before deletion so standalone payments
                // and credit notes are restored to supplier unapplied credit and not refunded as cash
                app(\App\Services\PaymentService::class)->detachInvoiceAllocations('purchase_invoice', (int) $purchaseInvoice->id, Auth::user());
                $purchaseInvoice->refresh();

                \App\Models\SupplierLedger::where('purchase_invoice_id', $purchaseInvoice->id)->delete();

                // Adjust cash drawer for deleted purchase invoice
                app(\App\Services\CashDrawerService::class)->handlePurchaseInvoiceDeletion(
                    $purchaseInvoice,
                    Auth::user()
                );

                // Adjust financial accounts for deleted purchase invoice (refund deposited back)
                $delPaid = (float)($purchaseInvoice->total_paid ?? 0);
                if (($purchaseInvoice->invoice_type ?? 'debit') === 'debit' && $delPaid <= 0) {
                    $delPaid = (float)$purchaseInvoice->total_amount;
                }
                if ($delPaid > 0) {
                    $acc = app(\App\Services\AccountService::class)->resolveAccount($purchaseInvoice->account_id, $purchaseInvoice->payment_method ?? 'cash');
                    app(\App\Services\AccountService::class)->deposit(
                        $acc,
                        $delPaid,
                        'purchase_invoice_deletion',
                        $purchaseInvoice->id,
                        "Refund for deleted purchase invoice #{$purchaseInvoice->posted_number}",
                        Auth::user()
                    );
                }

                $purchaseInvoice->items()->delete();
                $purchaseInvoice->delete();
                if ($order) app(PurchaseOrderReceiving::class)->sync($order);

                $this->recalcProductsByIds($affectedIds);

                return response()->json(['message' => 'Invoice and related data deleted successfully']);
            });
        } catch (\Illuminate\Database\QueryException $e) {
            // Likely unique-constraint violation (invoice_number / posted_number)
            return $this->respondDuplicateError($e);
        } catch (ValidationException $e) {
            throw $e;
        } catch (\Illuminate\Auth\Access\AuthorizationException $e) {
            throw $e;
        } catch (\Exception $e) {
            return response()->json([
                'message' => 'Failed to delete invoice',
                'error'   => $e->getMessage()
            ], 500);
        }
    }

    public function reverse(Request $request, $id)
    {
        $purchaseInvoice = PurchaseInvoice::with(['items.product', 'supplier'])->findOrFail($id);
        $this->authorize('reverse', $purchaseInvoice);

        $validated = $request->validate([
            'reason' => 'required|string|min:3|max:500',
        ]);

        if ($purchaseInvoice->status === 'reversed') {
            return response()->json(['message' => 'Invoice has already been reversed.'], 422);
        }

        // Check if any linked purchase return exists
        if (\App\Models\PurchaseReturn::where('purchase_invoice_id', $purchaseInvoice->id)->exists()) {
            return response()->json([
                'message' => 'Cannot reverse this invoice because linked purchase returns exist. Please reverse or remove the returns first.',
            ], 422);
        }

        return DB::transaction(function () use ($purchaseInvoice, $validated, $request) {
            $order = $purchaseInvoice->purchase_order_id ? \App\Models\PurchaseOrder::lockForUpdate()->findOrFail($purchaseInvoice->purchase_order_id) : null;
            if ($order) $purchaseInvoice->refresh();
            $purchaseInvoice->load('items');

            $affectedIds = $purchaseInvoice->items->pluck('product_id')->unique()->all();

            foreach ($purchaseInvoice->items as $item) {
                $this->revertItem($item, true, true);
            }

            if ($order) {
                app(\App\Services\PurchaseOrderReceiving::class)->sync($order);
            }

            $this->recalcProductsByIds($affectedIds);

            // Unwind any Payment / Credit Note allocations before reversing so standalone payments
            // and credit notes are restored to supplier unapplied credit and not refunded as cash
            app(\App\Services\PaymentService::class)->detachInvoiceAllocations('purchase_invoice', (int) $purchaseInvoice->id, $request->user());
            $purchaseInvoice->refresh();

            // Revert supplier ledger entry if credit/invoice entry
            \App\Models\SupplierLedger::where('purchase_invoice_id', $purchaseInvoice->id)->delete();

            $purchaseInvoice->status = 'reversed';
            $purchaseInvoice->reversed_at = now();
            $purchaseInvoice->reversed_by_id = $request->user()?->id;
            $purchaseInvoice->reversal_reason = $validated['reason'];
            $purchaseInvoice->save();

            // Adjust cash drawer for reversed purchase invoice (supplier refund)
            app(\App\Services\CashDrawerService::class)->handlePurchaseInvoiceReversal(
                $purchaseInvoice,
                $validated['reason'],
                $request->user()
            );

            // Adjust financial accounts for reversed purchase invoice (supplier refund deposited back)
            $revPaid = (float)($purchaseInvoice->total_paid ?? 0);
            if (($purchaseInvoice->invoice_type ?? 'debit') === 'debit' && $revPaid <= 0) {
                $revPaid = (float)$purchaseInvoice->total_amount;
            }
            if ($revPaid > 0) {
                $acc = app(\App\Services\AccountService::class)->resolveAccount($purchaseInvoice->account_id, $purchaseInvoice->payment_method ?? 'cash');
                app(\App\Services\AccountService::class)->deposit(
                    $acc,
                    $revPaid,
                    'purchase_invoice_reversal',
                    $purchaseInvoice->id,
                    "Reversal refund for Purchase Invoice #{$purchaseInvoice->posted_number}",
                    $request->user()
                );
            }

            app(\App\Services\DocumentAuditService::class)->recordReversal($purchaseInvoice, $request->user(), $validated['reason']);

            return response()->json([
                'message' => 'Purchase invoice reversed successfully.',
                'invoice' => $purchaseInvoice->fresh(['items.product', 'supplier']),
            ]);
        });
    }

    
    private function respondDuplicateError(\Throwable $e)
    {
        // Try to infer which field caused the duplicate via constraint name/text
        $errorInfo = method_exists($e, 'errorInfo') ? ($e->errorInfo ?? []) : [];
        $message   = $errorInfo[2] ?? ($e->getMessage() ?? '');
        $mLower    = strtolower($message);

        $errors = [];

        if (str_contains($mLower, 'receipt_key')) {
            $errors['receipt_key'][] = 'This receipt has already been saved. Open the Purchase Order to review its invoices.';
        }
        if (str_contains($mLower, 'invoice_number')) {
            $errors['invoice_number'][] = 'Invoice number has already been taken for this supplier or globally.';
        }
        if (str_contains($mLower, 'posted_number')) {
            $errors['posted_number'][] = 'Posted number has already been assigned. Please try again.';
        }

        if (!$errors) {
            $errors['general'][] = 'Duplicate value detected.';
        }

        return response()->json([
            'message' => 'Validation failed. Please correct the highlighted fields.',
            'errors'  => $errors,
        ], 422);
    }

    private function processInvoiceItems(PurchaseInvoice $invoice, array $items): void
    {
        foreach ($items as $item) {
            $invoice->items()->create($item);

            $product = Product::find($item['product_id']);
            if ($product) {
                $product->applyPurchaseFromItem($item); 
            }

            // Mark pending/ordered user demands for this received product as fulfilled
            $receivedQty = (int) ($item['quantity'] ?? $item['unit_quantity'] ?? 0);
            if (!empty($item['product_id']) && $receivedQty > 0 && \Illuminate\Support\Facades\Schema::hasTable('user_demands')) {
                UserDemand::where('product_id', $item['product_id'])
                    ->whereIn('status', ['pending', 'ordered'])
                    ->update(['status' => 'fulfilled']);
            }

            if (!empty($item['batch']) && !empty($item['expiry'])) {
                $batch = \App\Models\Batch::firstOrNew([
                    'product_id'   => $item['product_id'],
                    'batch_number' => $item['batch'],
                    'expiry_date'  => $item['expiry'],
                ]);

                if (!$batch->exists && \Illuminate\Support\Facades\Schema::hasColumn('batches', 'storage_location_id')) {
                    $batch->storage_location_id = $item['storage_location_id'] ?? $product?->storage_location_id;
                    $batch->rack = $item['rack'] ?? $product?->rack;
                }

                $batch->quantity = ($batch->exists ? (int) $batch->quantity : 0) + (int) $item['quantity'];
                $this->applyBatchPricingFromItem($batch, $item, $product);
                $batch->save();
            }

            if (!empty($item['product_id']) && !empty($invoice->supplier_id)) {
                $this->syncProductSupplierLink((int) $item['product_id'], (int) $invoice->supplier_id, $item);
            }
        }
    }

    private function applyBatchPricingFromItem(\App\Models\Batch $batch, array $item, ?Product $product = null): void
    {
        if (!\Illuminate\Support\Facades\Schema::hasColumn('batches', 'unit_sale_price')) {
            return;
        }

        foreach ([
            'pack_purchase_price',
            'unit_purchase_price',
            'pack_sale_price',
            'unit_sale_price',
            'whole_sale_pack_price',
            'whole_sale_unit_price',
        ] as $field) {
            if (array_key_exists($field, $item) && $item[$field] !== null && $item[$field] !== '') {
                $batch->{$field} = (float) $item[$field];
            } elseif ($batch->{$field} === null && $product && $product->{$field} !== null) {
                $batch->{$field} = (float) $product->{$field};
            }
        }
    }

    private function syncProductSupplierLink(int $productId, int $supplierId, array $item = []): void
    {
        if ($productId <= 0 || $supplierId <= 0 || !\Illuminate\Support\Facades\Schema::hasTable('product_suppliers')) {
            return;
        }

        $unitCost = isset($item['unit_purchase_price']) && $item['unit_purchase_price'] !== ''
            ? (float) $item['unit_purchase_price']
            : (isset($item['avg_price']) && $item['avg_price'] !== '' ? (float) $item['avg_price'] : null);

        $existing = \App\Models\ProductSupplier::where('product_id', $productId)
            ->where('supplier_id', $supplierId)
            ->first();

        if ($existing) {
            if ($unitCost !== null && $unitCost > 0) {
                $existing->last_purchase_price = $unitCost;
                $existing->save();
            }
        } else {
            $hasAny = \App\Models\ProductSupplier::where('product_id', $productId)->exists();
            \App\Models\ProductSupplier::create([
                'product_id'          => $productId,
                'supplier_id'         => $supplierId,
                'last_purchase_price' => $unitCost,
                'min_order_qty'       => 1,
                'is_preferred'        => !$hasAny,
            ]);
        }
    }

    private function persistInvoiceItems(PurchaseInvoice $invoice, array $items): void
    {
        foreach ($items as $item) {
            $invoice->items()->create($item);
        }
    }

    private function groupPurchaseItemsByStockKey(array $items): array
    {
        $grouped = [];

        foreach ($items as $item) {
            if (!is_array($item)) {
                continue;
            }

            $key = $this->purchaseItemStockKey($item);
            if (!isset($grouped[$key])) {
                $grouped[$key] = [
                    'product_id' => (int) ($item['product_id'] ?? 0),
                    'quantity'   => 0,
                    'avg_total'  => 0.0,
                    'avg_price'  => 0.0,
                    'source'     => $item,
                ];
            }

            $qty = (int) ($item['quantity'] ?? 0);
            $avg = (float) ($item['avg_price'] ?? $item['unit_purchase_price'] ?? 0.0);

            $grouped[$key]['quantity'] += $qty;
            $grouped[$key]['avg_total'] += ($qty * $avg);

            if (empty($grouped[$key]['source'])) {
                $grouped[$key]['source'] = $item;
            }
        }

        foreach ($grouped as &$group) {
            $group['avg_price'] = $group['quantity'] > 0
                ? round($group['avg_total'] / $group['quantity'], 2)
                : 0.0;
            unset($group['avg_total']);
        }
        unset($group);

        return $grouped;
    }

    private function purchaseItemStockKey(array $item): string
    {
        return implode('|', [
            (int) ($item['product_id'] ?? 0),
            trim((string) ($item['batch'] ?? '')),
            trim((string) ($item['expiry'] ?? '')),
            (int) ($item['pack_size'] ?? 0),
        ]);
    }

    private function adjustBatchQuantity(int $productId, ?string $batch, ?string $expiry, int $delta, bool $allowNegative = false, array $pricingSource = []): void
    {
        $batch = trim((string) $batch);
        $expiry = trim((string) $expiry);

        if ($batch === '' || $expiry === '' || ($delta === 0 && empty($pricingSource))) {
            return;
        }

        $batchModel = Batch::where('product_id', $productId)
            ->where('batch_number', $batch)
            ->where('expiry_date', $expiry)
            ->first();

        if (!$batchModel) {
            if ($delta <= 0) {
                return;
            }

            $batchModel = new Batch([
                'product_id'   => $productId,
                'batch_number' => $batch,
                'expiry_date'  => $expiry,
                'quantity'     => 0,
            ]);
        }

        if ($delta !== 0) {
            $nextQty = (int) $batchModel->quantity + $delta;
            $batchModel->quantity = $allowNegative ? $nextQty : max(0, $nextQty);
        }

        if (!empty($pricingSource)) {
            $this->applyBatchPricingFromItem($batchModel, $pricingSource);
        }

        $batchModel->save();
    }

    private function syncProductPricingFromItem(Product $product, array $item): void
    {
        foreach ([
            'pack_purchase_price',
            'unit_purchase_price',
            'pack_sale_price',
            'unit_sale_price',
            'whole_sale_pack_price',
            'whole_sale_unit_price',
        ] as $field) {
            if (array_key_exists($field, $item)) {
                $product->{$field} = $item[$field];
            }
        }

        $product->save();
        $this->recalcProductAverages($product);
    }

    private function revertItem($item, bool $deleteBatch = false, bool $allowNegative = false): void
    {
        $product = Product::find($item->product_id);
        if ($product) {
            // Pass the item ID to exclude it from the remaining purchase invoices calculation
            $itemId = isset($item->id) ? $item->id : null;
            $product->revertPurchaseFromItem($item, $itemId, $allowNegative); // uses avg_price
        }

        if (!empty($item->batch) && !empty($item->expiry)) {
            $batch = Batch::where('product_id', $item->product_id)
                ->where('batch_number', $item->batch)
                ->where('expiry_date', $item->expiry)
                ->first();

            if ($batch) {
                if ($deleteBatch) {
                    if ($allowNegative) {
                        $batch->quantity = (int) $batch->quantity - (int) $item->quantity;
                        $batch->save();
                    } else {
                        $batch->delete();
                    }
                } else {
                    $batch->quantity = max(0, (int) $batch->quantity - (int) $item->quantity);
                    $batch->save();
                }
            }
        }
    }

    private function recalcProductAverages(Product $product): void
    {
        // Correct moving average logic: use current stock value, NOT full purchase history.
        // This ensures average resets when stock becomes 0.
        
        $currentQty = (int) ($product->quantity ?? 0);
        $currentAvg = (float) ($product->avg_price ?? 0.0);
        
        // If stock is zero or negative, the average is already reset 
        // (handled by applyPurchaseFromItem when stock was sold to zero)
        // We don't need to recalculate from history - just ensure the margins are correct
        
        // Ensure avg_price is rounded properly
        $product->avg_price = round($currentAvg, 2);

        // Retail Margin calculation
        $product->margin = ($product->unit_sale_price > 0 && $product->avg_price > 0)
            ? round((($product->unit_sale_price - $product->avg_price) / $product->unit_sale_price) * 100, 2)
            : 0.0;

        // Wholesale Margin calculation
        if ($product->whole_sale_unit_price > 0) {
            $product->whole_sale_margin = ($product->avg_price > 0)
                ? round((($product->whole_sale_unit_price - $product->avg_price) / $product->whole_sale_unit_price) * 100, 2)
                : 0.0;
        }

        $product->save();
    }

    private function recalcProductsByIds(array $productIds): void
    {
        foreach (array_unique($productIds) as $pid) {
            $product = Product::find($pid);
            if ($product) {
                $this->recalcProductAverages($product);
            }
        }
    }

    // AJAX: unique check per supplier
    public function checkUnique(Request $request)
    {
        $request->validate([
            'supplier_id'    => 'required|integer',
            'invoice_number' => 'required|string',
            'exclude_id'     => 'nullable|integer',
        ]);

        if ($request->filled('exclude_id')) {
            $invoice = PurchaseInvoice::findOrFail($request->input('exclude_id'));
            $this->authorize('update', $invoice);
        } else {
            $this->authorize('create', PurchaseInvoice::class);
        }

        $query = \App\Models\PurchaseInvoice::where('supplier_id', $request->supplier_id)
            ->where('invoice_number', $request->invoice_number);

        if ($request->filled('exclude_id')) {
            $query->where('id', '!=', $request->exclude_id);
        }

        $exists = $query->exists();

        return response()->json([
            'unique' => !$exists,
        ]);
    }

// Search purchase invoices
    public function search(Request $request)
    {
        $this->authorize('lookup', PurchaseInvoice::class);

        $q = trim((string) $request->query('q', ''));
        $supplierId = $request->query('supplier_id');
        
        // Pagination parameters
        $page = (int) $request->query('page', 1);
        $perPage = (int) $request->query('per_page', 20);

        // Base query with optional supplier filter
        $baseQuery = function () use ($supplierId) {
            $query = PurchaseInvoice::with(['supplier']);
            if ($supplierId) {
                $query->where('supplier_id', $supplierId);
            }
            return $query;
        };

        // If no search query, return recent invoices
        if (strlen($q) < 1) {
            $results = $baseQuery()
                ->orderByDesc('id')
                ->paginate($perPage, ['*'], 'page', $page);

            // Add computed fields
            $results->getCollection()->transform(function ($invoice) {
                $invTotal = (float) ($invoice->total_amount ?? $invoice->invoice_amount ?? 0);
                $paid = (float) ($invoice->total_paid ?? 0);
                $invoice->remaining = max($invTotal - $paid, 0);
                $invoice->supplier_name = $invoice->supplier?->name ?? ($invoice->supplier_id ?? 'N/A');
                return $invoice;
            });

            return response()->json($results);
        }

        $query = $baseQuery()
            ->orderByDesc('id');

        // Search by posted_number, invoice_number, or supplier name
        $query->where(function ($sub) use ($q) {
            $sub->where('posted_number', 'like', '%' . $q . '%')
                ->orWhere('invoice_number', 'like', '%' . $q . '%')
                ->orWhereHas('supplier', function ($supplierQuery) use ($q) {
                    $supplierQuery->where('name', 'like', '%' . $q . '%');
                });
        });

        $results = $query->paginate($perPage, ['*'], 'page', $page);

        // Add computed fields
        $results->getCollection()->transform(function ($invoice) {
            $invTotal = (float) ($invoice->total_amount ?? $invoice->invoice_amount ?? 0);
            $paid = (float) ($invoice->total_paid ?? 0);
            $invoice->remaining = max($invTotal - $paid, 0);
            $invoice->supplier_name = $invoice->supplier?->name ?? ($invoice->supplier_id ?? 'N/A');
            return $invoice;
        });

        return response()->json($results);
    }
}
