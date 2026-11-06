<?php

namespace App\Http\Controllers;

use App\Models\Batch;
use App\Models\Customer;
use App\Models\CustomerLedger;
use App\Models\CustomerWholeSalePrice;
use App\Models\Product;
use App\Models\SaleInvoice;
use App\Models\SaleInvoiceItem;
use App\Models\Setting;
use Carbon\Carbon;
use Illuminate\Http\Request;
use Illuminate\Support\Facades\Auth;
use Illuminate\Support\Facades\DB;
use Illuminate\Validation\ValidationException;

class SaleInvoiceController extends Controller
{
    private function i($v): int   { return (int)($v ?? 0); }
    private function f($v): float { return (float)($v ?? 0.0); }

    private function unitsFromArray(array $item): int
    {
        return $this->i($item['quantity'] ?? 0) + max(0, $this->i($item['bonus'] ?? 0));
    }
    private function unitsFromModel(SaleInvoiceItem $item): int
    {
        return $this->i($item->quantity ?? 0) + max(0, $this->i($item->bonus ?? 0));
    }

    private function applyStockDeltaSmart(int $productId, ?string $batchNo, ?string $expiry, int $deltaUnits): void
    {
        $batchNo = trim((string)($batchNo ?? ''));
        $expiry  = trim((string)($expiry ?? ''));

        $actualApplied = $deltaUnits;

        $matchingBatches = collect();
        if ($batchNo !== '') {
            $matchingBatches = app(\App\Services\SaleStockAvailability::class)->matchingBatches(
                Batch::where('product_id', $productId)->orderBy('id')->lockForUpdate()->get(),
                ['product_id' => $productId, 'batch_number' => $batchNo, 'expiry' => $expiry]
            );
        }

        if ($matchingBatches->isNotEmpty()) {
            if ($deltaUnits < 0) {
                $remainingToDeduct = abs($deltaUnits);
                $totalAvailable = (int) $matchingBatches->sum('quantity');
                if ($totalAvailable < $remainingToDeduct) {
                    throw \Illuminate\Validation\ValidationException::withMessages(['items' => 'Selected batch has insufficient stock.']);
                }
                foreach ($matchingBatches as $batch) {
                    if ($remainingToDeduct <= 0) {
                        break;
                    }
                    $before = $this->i($batch->quantity);
                    $deduct = min($before, $remainingToDeduct);
                    if ($deduct > 0) {
                        $batch->quantity = $before - $deduct;
                        $batch->save();
                        $remainingToDeduct -= $deduct;
                    }
                }
                $actualApplied = $deltaUnits;
            } else {
                $batch = $matchingBatches->first();
                $before = $this->i($batch->quantity);
                $after  = $before + $deltaUnits;
                $actualApplied = $after - $before;
                $batch->quantity = $after;
                $batch->save();
            }
        }

        if ($product = Product::lockForUpdate()->find($productId)) {
            $pBefore = $this->i($product->quantity);
            $pAfter  = $pBefore + $actualApplied;
            if ($pAfter < 0) throw \Illuminate\Validation\ValidationException::withMessages(['items' => 'Product has insufficient stock.']);

            // If an unbatched sale reduces product stock below total batch stock, deduct excess from batches in FEFO order
            if ($batchNo === '' && $deltaUnits < 0 && $matchingBatches->isEmpty()) {
                $activeBatches = Batch::where('product_id', $productId)
                    ->where('quantity', '>', 0)
                    ->orderByRaw('CASE WHEN expiry_date IS NOT NULL AND expiry_date >= ? THEN 0 ELSE 1 END ASC', [now()->toDateString()])
                    ->orderBy('expiry_date', 'asc')
                    ->orderBy('id', 'asc')
                    ->lockForUpdate()
                    ->get();
                $totalBatchQty = (int) $activeBatches->sum('quantity');
                if ($totalBatchQty > $pAfter) {
                    $excessBatchQty = $totalBatchQty - $pAfter;
                    foreach ($activeBatches as $b) {
                        if ($excessBatchQty <= 0) {
                            break;
                        }
                        $bBefore = $this->i($b->quantity);
                        $deduct = min($bBefore, $excessBatchQty);
                        if ($deduct > 0) {
                            $b->quantity = $bBefore - $deduct;
                            $b->save();
                            $excessBatchQty -= $deduct;
                        }
                    }
                }
            }

            $product->quantity = $pAfter;
            
            // If stock becomes zero, reset average price and margins
            // This ensures moving average resets when all stock is sold
            if ($pAfter <= 0) {
                $product->avg_price = 0;
                $product->margin = 0;
                $product->whole_sale_margin = 0;
            }
            
            $product->save();
        }
    }

    private function createItemsAndReduce(SaleInvoice $invoice, array $items, ?\Illuminate\Support\Collection $originalItems = null, ?\Illuminate\Support\Collection $costs = null): void
    {
        $snapshots = app(\App\Services\SaleCostSnapshot::class);
        // Capture every product before any stock depletion can reset its average.
        $costs ??= $snapshots->productCosts($items);
        $legacy = $originalItems !== null && $originalItems->every(fn ($item) => $item->cost_price_snapshot === null);
        $itemColumns = array_flip(\App\Support\SchemaCache::getColumnListing('sale_invoice_items'));
        foreach ($items as $raw) {
            $matches = $originalItems === null ? collect() : $originalItems->where('product_id', $raw['product_id']);
            $cost = $legacy ? null : ($matches->isNotEmpty() ? $snapshots->originalCost($originalItems, $raw) : $costs->get($raw['product_id'], 0));
            $payload = [
                'cost_price_snapshot' => $cost,
                'product_id'               => $raw['product_id'],
                'pack_size'                => $this->i($raw['pack_size'] ?? 0),
                'batch_number'             => $raw['batch_number'] ?? ($raw['batch'] ?? null),
                'expiry'                   => $raw['expiry'] ?? ($raw['expiry_date'] ?? null),
                'current_quantity'         => $this->i($raw['current_quantity'] ?? 0),
                'pack_quantity'            => max(0.0, round($this->f($raw['pack_quantity'] ?? 0), 2)),
                'unit_quantity'            => max(0, $this->i($raw['unit_quantity'] ?? 0)),
                'quantity'                 => $this->i($raw['quantity'] ?? 0),
                'pack_bonus'               => max(0.0, round($this->f($raw['pack_bonus'] ?? 0), 2)),
                'unit_bonus'               => max(0, $this->i($raw['unit_bonus'] ?? 0)),
                'bonus'                    => max(0, $this->i($raw['bonus'] ?? 0)),
                'pack_price'               => $this->f($raw['pack_price'] ?? 0),
                'price'                    => $this->f($raw['price'] ?? 0),
                'item_discount_percentage' => $this->f($raw['item_discount_percentage'] ?? 0),
                'sub_total'                => $this->f($raw['sub_total'] ?? 0),
                'sale_type'                => $raw['sale_type'] ?? ($invoice->sale_type ?? 'retail'),
                'is_custom_price'          => $raw['is_custom_price'] ?? false,
            ];

            $dbPayload = $itemColumns ? array_intersect_key($payload, $itemColumns) : $payload;
            $item = $invoice->items()->create($dbPayload);

            $units = $this->unitsFromArray($payload);
            $this->applyStockDeltaSmart(
                $item->product_id,
                $item->batch_number,
                $item->expiry,
                -$units
            );
        }
    }

    private function revertItems(SaleInvoice $invoice): void
    {
        $invoice->load('items');
        foreach ($invoice->items as $item) {
            $units = $this->unitsFromModel($item);
            $this->applyStockDeltaSmart(
                $item->product_id,
                $item->batch_number ?? null,
                $item->expiry ?? null,
                +$units
            );
        }
    }

    private function validateCreditLimits(array $data, Request $request, ?SaleInvoice $existingInvoice = null): void
    {
        $invoiceType = $data['invoice_type'] ?? ($existingInvoice->invoice_type ?? 'debit');
        $customerId = (int)($data['customer_id'] ?? ($existingInvoice->customer_id ?? 0));
        $customer = $customerId ? Customer::find($customerId) : null;

        $total = round((float) ($data['total'] ?? 0), 2);
        $received = round((float) ($data['total_receive'] ?? 0), 2);
        $creditApplied = round((float) ($data['apply_credit_amount'] ?? 0), 2);
        $unpaidAmount = round(max($total - $received - $creditApplied, 0), 2);
        $clientTotal = $request->has('total') && is_numeric($request->input('total')) && (float) $request->input('total') > 0
            ? round((float) $request->input('total'), 2)
            : $total;
        $cashCheckTarget = min($total, $clientTotal);
        $cashGivenUnderpaid = $request->filled('cash_given')
            && is_numeric($request->input('cash_given'))
            && round((float) $request->input('cash_given') + $creditApplied, 2) < ($cashCheckTarget - 0.009);

        if ($customer && $customer->isWalkIn()) {
            if ($invoiceType === 'credit' || $unpaidAmount > 0.009 || $cashGivenUnderpaid) {
                $walkInMsg = 'Walk-In Customer bills cannot be saved with unpaid credit (Udhar)—select or create a named Customer if the bill is not paid in full.';
                throw new \Illuminate\Http\Exceptions\HttpResponseException(response()->json([
                    'message' => $walkInMsg,
                    'errors' => [
                        'customer_id'   => [$walkInMsg],
                        'total_receive' => [$walkInMsg],
                    ],
                ], 422));
            }
        }

        if ($invoiceType !== 'credit') {
            return;
        }

        if (!$customer) {
            return;
        }

        if (($customer->credit_status ?? 'active') === 'blocked') {
            throw new \Illuminate\Http\Exceptions\HttpResponseException(response()->json([
                'message' => "Customer {$customer->name} is blocked for credit transactions.",
                'credit_status' => 'blocked',
                'errors' => [
                    'customer_id' => ["Customer {$customer->name} is blocked for credit transactions."],
                    'credit_status' => ["Customer {$customer->name} is blocked for credit transactions."],
                ],
            ], 422));
        }

        $override = $request->boolean('credit_override');
        $calcService = app(\App\Services\InvoiceCalculationService::class);
        $authorizingUser = $calcService->resolveAuthorizingUser(
            $request->user(),
            $request->only(['supervisor_email', 'supervisor_password']),
            'sale-invoice.credit-override'
        );

        if (($customer->credit_status ?? 'active') === 'on_hold') {
            if (!$override) {
                throw new \Illuminate\Http\Exceptions\HttpResponseException(response()->json([
                    'message' => "Customer {$customer->name} account is on hold. Requires supervisor override.",
                    'requires_override' => true,
                    'credit_status' => 'on_hold',
                    'errors' => [
                        'credit_status' => ["Customer {$customer->name} account is on hold. Requires supervisor override."],
                    ],
                ], 422));
            }

            if (!$calcService->canOverrideCredit($authorizingUser)) {
                throw new \Illuminate\Http\Exceptions\HttpResponseException(response()->json([
                    'message' => 'You do not have permission to override customer credit holds.',
                    'errors' => [
                        'credit_override' => ['User does not have permission to authorize credit overrides.'],
                    ],
                ], 403));
            }
        }

        if ($customer->credit_limit !== null && (float)$customer->credit_limit > 0) {
            $currentNet = CustomerLedger::getCustomerNetBalance($customerId);

            // If updating an existing credit invoice, subtract its prior unpaid balance
            if ($existingInvoice && $existingInvoice->invoice_type === 'credit') {
                $oldTotal = (float)$existingInvoice->total;
                $oldRecv = min($oldTotal, (float)($existingInvoice->total_receive ?? 0));
                $oldUnpaid = max(0.0, $oldTotal - $oldRecv);
                $currentNet = max(0.0, $currentNet - $oldUnpaid);
            }

            $newTotal = (float)$data['total'];
            $newRecv = min($newTotal, (float)($data['total_receive'] ?? 0));
            $newUnpaid = max(0.0, $newTotal - $newRecv);

            $projected = round($currentNet + $newUnpaid, 2);
            $limit = (float)$customer->credit_limit;

            if ($projected > $limit) {
                if (!$override) {
                    $excess = round($projected - $limit, 2);
                    throw new \Illuminate\Http\Exceptions\HttpResponseException(response()->json([
                        'message' => "Customer credit limit of Rs. " . number_format($limit, 2) . " exceeded by Rs. " . number_format($excess, 2) . " (projected balance: Rs. " . number_format($projected, 2) . "). Requires supervisor override.",
                        'requires_override' => true,
                        'excess_amount' => $excess,
                        'credit_limit' => $limit,
                        'current_balance' => $currentNet,
                        'projected_balance' => $projected,
                        'errors' => [
                            'credit_limit' => ["Customer credit limit of Rs. " . number_format($limit, 2) . " exceeded by Rs. " . number_format($excess, 2) . ". Requires supervisor override."],
                        ],
                    ], 422));
                }

                if (!$calcService->canOverrideCredit($authorizingUser)) {
                    throw new \Illuminate\Http\Exceptions\HttpResponseException(response()->json([
                        'message' => 'You do not have permission to override customer credit limits.',
                        'errors' => [
                            'credit_override' => ['User does not have permission to authorize credit overrides.'],
                        ],
                    ], 403));
                }
            }
        }
    }

    private function resolveDueDate(array $data, ?Customer $customer = null): string
    {
        if (!empty($data['due_date'])) {
            return Carbon::parse($data['due_date'])->toDateString();
        }
        $customer = $customer ?: Customer::find($data['customer_id'] ?? null);
        $creditDays = $customer ? ($customer->credit_days ?? 30) : 30;
        return Carbon::parse($data['date'])->addDays($creditDays)->toDateString();
    }

    public function generateNewCode()
    {
        // kept for compatibility but frontend no longer uses this on load
        $this->authorize('create', SaleInvoice::class);
        $last = SaleInvoice::orderBy('id', 'desc')->first();
        $next = $last ? ($last->id + 1) : 1;
        $code = 'SI-' . str_pad((string)$next, 6, '0', STR_PAD_LEFT);
        return response()->json(['posted_number' => $code]);
    }

    public function index(Request $request)
    {
        $qCustomerId = $request->query('customer_id');
        if ($qCustomerId) {
            $this->authorize('lookup', SaleInvoice::class);
        } else {
            $this->authorize('viewAny', SaleInvoice::class);
        }
        
        $qPosted      = trim((string) $request->query('posted'));
        $qCustomer    = trim((string) $request->query('customer'));
        $qSaleType    = trim((string) $request->query('sale_type'));
        $qInvoiceType = trim((string) $request->query('invoice_type'));

        // Pagination parameters (capped at 200 to prevent unbounded memory hydration)
        $page     = max(1, (int) $request->query('page', 1));
        $perPage  = max(1, min((int) $request->query('per_page', 10), 200));

        $query = SaleInvoice::with(['customer'])->orderByDesc('id');

        if ($qCustomerId) {
            $query->where('customer_id', $qCustomerId);
        }
        if (in_array($qSaleType, ['retail', 'wholesale'], true)) {
            $query->where('sale_type', $qSaleType);
        }
        if (in_array($qInvoiceType, ['credit', 'debit'], true)) {
            $query->where('invoice_type', $qInvoiceType);
        }
        if ($qPosted !== '') {
            $query->where('posted_number', 'like', '%'.$qPosted.'%');
        }
        if ($qCustomer !== '') {
            $query->whereHas('customer', function ($q) use ($qCustomer) {
                $q->where('name', 'like', '%'.$qCustomer.'%');
            });
        }

        return $query->paginate($perPage, ['*'], 'page', $page);
    }

    public function show($id)
    {
        $invoice = SaleInvoice::with(['customer', 'items.product'])->findOrFail($id);
        $this->authorize('view', $invoice);
        app(\App\Services\ReturnEntitlement::class)->annotate('sale', $invoice, request()->integer('exclude_return_id') ?: null);
        return response()->json($invoice);
    }

    public function store(Request $request)
    {
        $this->authorize('create', SaleInvoice::class);
        if (!$request->user()) {
            return response()->json(['message' => 'Unauthenticated'], 401);
        }

        // Auto-fallback to default/walk-in customer if customer_id was not provided for debit (cash) sales
        if (empty($request->input('customer_id')) && $request->input('invoice_type', 'debit') !== 'credit') {
            $defaultCustomer = \App\Models\Customer::orderBy('id', 'asc')->first();
            if ($defaultCustomer) {
                $request->merge(['customer_id' => $defaultCustomer->id]);
            }
        }

        // posted_number is NOT provided by client anymore (server assigns)
        $data = $request->validate([
            'draft_id'            => 'nullable|integer|exists:invoice_drafts,id',
            'customer_id'         => 'required|exists:customers,id',
            'invoice_type'        => 'nullable|string|in:credit,debit',
            'payment_method'      => 'nullable|string|in:cash,card,bank_transfer,cheque,mobile_wallet,other',
            'account_id'          => 'nullable|integer|exists:accounts,id',
            'sale_type'           => 'nullable|string|in:retail,wholesale',
            'wholesale_type'      => 'nullable|string|in:unit,pack',
            'date'                => 'required|date',
            'due_date'            => 'nullable|date',
            'credit_override'     => 'nullable|boolean',
            'discount_override'   => 'nullable|boolean',
            'expired_override'    => 'nullable|boolean',
            'supervisor_email'    => 'nullable|string',
            'supervisor_password' => 'nullable|string',
            'remarks'             => 'nullable|string',
            'doctor_name'         => 'nullable|string',
            'patient_name'        => 'nullable|string',
            'discount_percentage' => 'nullable|numeric',
            'discount_amount'     => 'nullable|numeric',
            'tax_percentage'      => 'nullable|numeric',
            'tax_amount'          => 'nullable|numeric',
            'item_discount'       => 'nullable|numeric',
            'gross_amount'        => 'nullable|numeric',
            'total'               => 'nullable|numeric',
            'total_receive'       => 'nullable|numeric',
            'apply_credit_amount' => 'nullable|numeric|min:0',
            'split_payments'                  => 'nullable|array',
            'split_payments.*.payment_method' => 'required_with:split_payments|string|in:cash,card,bank_transfer,cheque,mobile_wallet,other',
            'split_payments.*.account_id'     => 'nullable|integer|exists:accounts,id',
            'split_payments.*.amount'         => 'required_with:split_payments|numeric|min:0',

            'items'                            => 'required|array|min:1',
            'items.*.product_id'               => 'required|exists:products,id',
            'items.*.pack_size'                => 'nullable|integer|min:0',
            'items.*.batch_number'             => 'nullable|string',
            'items.*.batch'                    => 'nullable|string',
            'items.*.expiry'                   => 'nullable|string',
            'items.*.expiry_date'              => 'nullable|string',
            'items.*.current_quantity'         => 'nullable|integer',
            'items.*.pack_quantity'            => 'nullable|numeric|min:0',
            'items.*.unit_quantity'            => 'nullable|integer|min:0',
            'items.*.quantity'                 => 'nullable|integer|min:0',
            'items.*.pack_bonus'               => 'nullable|numeric|min:0',
            'items.*.unit_bonus'               => 'nullable|integer|min:0',
            'items.*.bonus'                    => 'nullable|integer|min:0',
            'items.*.pack_price'               => 'nullable|numeric|min:0',
            'items.*.price'                    => 'required|numeric|min:0',
            'items.*.item_discount_percentage' => 'nullable|numeric',
            'items.*.sub_total'                => 'nullable|numeric|min:0',
            'items.*.sale_type'                => 'nullable|string|in:retail,wholesale',
            'items.*.is_custom_price'          => 'nullable|boolean',
        ]);

        $clientSubmittedTotal = $request->has('total') && is_numeric($request->input('total'))
            ? round((float) $request->input('total'), 2)
            : null;
        $hasExplicitReceive = $request->has('total_receive') && $request->input('total_receive') !== null && $request->input('total_receive') !== '';
        $clientSubmittedReceive = $hasExplicitReceive && is_numeric($request->input('total_receive'))
            ? round((float) $request->input('total_receive'), 2)
            : null;

        // Server-Authoritative Totals & Discount Controls
        $calculated = app(\App\Services\InvoiceCalculationService::class)->calculateAndValidateSale(
            $data,
            $request->user(),
            $request->boolean('discount_override')
        );
        $data['gross_amount']        = $calculated['gross_amount'];
        $data['item_discount']       = $calculated['item_discount'];
        $data['discount_percentage'] = $calculated['discount_percentage'];
        $data['discount_amount']     = $calculated['discount_amount'];
        $data['tax_percentage']      = $calculated['tax_percentage'];
        $data['tax_amount']          = $calculated['tax_amount'];
        $data['total']               = $calculated['total'];
        $data['items']               = $calculated['items'];

        $applyCreditAmount = round((float) ($data['apply_credit_amount'] ?? 0), 2);
        if ($applyCreditAmount > 0) {
            $data['invoice_type'] = 'credit';
        }
        if (!empty($data['split_payments'])) {
            $splitSum = round(collect($data['split_payments'])->sum(fn($leg) => (float)($leg['amount'] ?? 0)), 2);
            if (!isset($data['total_receive'])) {
                $data['total_receive'] = $splitSum;
            }
        }

        // For debit (cash) sales, sync total_receive to the authoritative server total unless an explicit partial payment was sent
        $effectiveInvoiceType = $data['invoice_type'] ?? 'debit';
        if ($effectiveInvoiceType === 'debit' && empty($data['split_payments'])) {
            $isClientFullDebitReceive = !$hasExplicitReceive
                || ($clientSubmittedReceive !== null && $clientSubmittedTotal !== null && $clientSubmittedReceive >= ($clientSubmittedTotal - 0.009))
                || ($clientSubmittedReceive !== null && abs($clientSubmittedReceive - (float) $data['total']) <= 1.00);

            if ($isClientFullDebitReceive) {
                if ($request->filled('cash_given') && is_numeric($request->input('cash_given'))) {
                    $cashGivenFloat = round((float) $request->input('cash_given'), 2);
                    $isFullCashGiven = ($clientSubmittedTotal !== null && $cashGivenFloat >= ($clientSubmittedTotal - 0.009))
                        || abs($cashGivenFloat - (float) $data['total']) <= 1.00
                        || $cashGivenFloat >= (float) $data['total'];
                    $data['total_receive'] = $isFullCashGiven
                        ? $data['total']
                        : min((float) $data['total'], $cashGivenFloat);
                } else {
                    $data['total_receive'] = $data['total'];
                }
            }
        }

        $this->validateCreditLimits($data, $request);
        $dueDate = $this->resolveDueDate($data);

        return DB::transaction(function () use ($data, $request, $dueDate) {
            $draft = null;
            if (!empty($data['draft_id'])) {
                $draft = \App\Models\InvoiceDraft::lockForUpdate()->find($data['draft_id']);
                if ($draft && $draft->status === 'posted') {
                    $postedInv = SaleInvoice::find($draft->posted_invoice_id);
                    return response()->json([
                        'message'       => 'Sale Invoice already created',
                        'id'            => $draft->posted_invoice_id,
                        'posted_number' => $postedInv?->posted_number,
                    ], 200);
                }
            }

            app(\App\Services\SaleStockAvailability::class)->validate(
                $data['items'],
                null,
                $request->user(),
                $request->boolean('expired_override'),
                $request->only(['supervisor_email', 'supervisor_password'])
            );
            // Concurrency-safe numbering: lock last row, compute next
            $last = SaleInvoice::lockForUpdate()->orderByDesc('id')->first();
            $next = $last ? ($last->id + 1) : 1;
            $posted = 'SI-' . str_pad((string)$next, 6, '0', STR_PAD_LEFT);

            $invoiceData = [
                'user_id'            => $request->user()->id,
                'customer_id'        => $data['customer_id'],
                'invoice_type'       => $data['invoice_type'] ?? 'debit',
                'sale_type'          => $data['sale_type'] ?? 'retail',
                'wholesale_type'     => $data['wholesale_type'] ?? 'unit',
                'posted_number'      => $posted, // assigned on save
                'date'               => $data['date'],
                'remarks'            => $data['remarks'] ?? null,
                'doctor_name'        => $data['doctor_name'] ?? null,
                'patient_name'       => $data['patient_name'] ?? null,
                'discount_percentage'=> $data['discount_percentage'] ?? 0,
                'discount_amount'    => $data['discount_amount'] ?? 0,
                'tax_percentage'     => $data['tax_percentage'] ?? 0,
                'tax_amount'         => $data['tax_amount'] ?? 0,
                'item_discount'      => $data['item_discount'] ?? 0,
                'gross_amount'       => $data['gross_amount'],
                'total'              => $data['total'],
                'total_receive'      => $data['total_receive'] ?? 0,
            ];

            if (\Illuminate\Support\Facades\Schema::hasColumn('sale_invoices', 'due_date')) {
                $invoiceData['due_date'] = $dueDate;
            }

            if (\Illuminate\Support\Facades\Schema::hasColumn('sale_invoices', 'payment_method')) {
                $invoiceData['payment_method'] = $data['payment_method'] ?? 'cash';
            }

            if (\Illuminate\Support\Facades\Schema::hasColumn('sale_invoices', 'salesman_id')) {
                $invoiceData['salesman_id'] = !empty($request->input('salesman_id'))
                    ? (int) $request->input('salesman_id')
                    : (\Illuminate\Support\Facades\Schema::hasTable('employees')
                        ? \App\Models\Employee::where('user_id', $request->user()->id)->value('id')
                        : null);
            }

            $invoice = SaleInvoice::create($invoiceData);

            $this->createItemsAndReduce($invoice, $data['items']);

            // Save customer-specific wholesale prices if any custom prices were used and user is authorized
            $saleType = $data['sale_type'] ?? 'retail';
            $canUpdateWholesalePricing = $request->user()->hasRole(['Admin', 'admin', 'super-admin'])
                || $request->user()->can('customer.update')
                || $request->user()->can('product.update');
            if ($saleType === 'wholesale' && isset($data['items']) && $canUpdateWholesalePricing) {
                foreach ($data['items'] as $raw) {
                    if (isset($raw['is_custom_price']) && $raw['is_custom_price'] === true) {
                        $packSize = max(1, (int)($raw['pack_size'] ?? 1));
                        $packPriceToSave = isset($raw['pack_price']) && (float)$raw['pack_price'] > 0
                            ? round((float)$raw['pack_price'], 2)
                            : round((float)$raw['price'] * $packSize, 2);
                        CustomerWholeSalePrice::updateOrCreate(
                            [
                                'customer_id' => $data['customer_id'],
                                'product_id' => $raw['product_id'],
                            ],
                            [
                                'pack_price' => $packPriceToSave,
                            ]
                        );
                    }
                }
            }

            // Create customer ledger entry ONLY for credit sales
            $invoiceType = $data['invoice_type'] ?? 'debit';
            if ($invoiceType === 'credit') {
                $invTotal = (float)$data['total'];
                $totalRecv = (float)($data['total_receive'] ?? 0);
                $recvOnInv = min($totalRecv, $invTotal);
                $excessRecv = max(0.0, $totalRecv - $invTotal);

                $ledger = new CustomerLedger();
                $ledger->customer_id       = $data['customer_id'];
                $ledger->sale_invoice_id   = $invoice->id;
                $ledger->entry_type        = 'invoice';
                $ledger->is_manual         = false;
                $ledger->entry_date        = $data['date'];
                if (\Illuminate\Support\Facades\Schema::hasColumn('customer_ledgers', 'due_date')) {
                    $ledger->due_date      = $dueDate;
                }
                $ledger->posted_number     = $posted;
                $ledger->invoice_total     = $invTotal;
                $ledger->total_received    = $recvOnInv;
                $ledger->balance_remaining = max($invTotal - $recvOnInv, 0);
                $ledger->credited_amount   = 0;
                $ledger->payment_ref       = null;
                $ledger->description       = 'Sale invoice ' . $posted;
                $ledger->created_by        = $request->user()->id;
                $ledger->save();

                // If customer paid more than invoice total, credit excess to customer ledger as payment received
                if ($excessRecv > 0) {
                    $excessEntry = new CustomerLedger();
                    $excessEntry->customer_id       = $data['customer_id'];
                    $excessEntry->sale_invoice_id   = null;
                    $excessEntry->entry_type        = 'payment';
                    $excessEntry->is_manual         = false;
                    $excessEntry->entry_date        = $data['date'];
                    $excessEntry->posted_number     = $posted;
                    $excessEntry->invoice_total     = 0;
                    $excessEntry->total_received    = 0;
                    $excessEntry->balance_remaining = 0;
                    $excessEntry->credited_amount   = $excessRecv;
                    $excessEntry->payment_ref       = 'Inv #' . $posted;
                    $excessEntry->description       = 'Payment received on invoice ' . $posted;
                    $excessEntry->created_by        = $request->user()->id;
                    $excessEntry->save();
                }
            }

            if ($draft) {
                $draft->status = 'posted';
                $draft->posted_invoice_id = $invoice->id;
                $draft->posted_invoice_type = SaleInvoice::class;
                $draft->save();
            }

            // Account & Cash Drawer recording if money was received
            $splitLegs = collect($data['split_payments'] ?? [])
                ->filter(fn ($leg) => round((float) ($leg['amount'] ?? 0), 2) > 0)
                ->values();

            if ($splitLegs->isNotEmpty()) {
                $firstAccountId = null;
                foreach ($splitLegs as $leg) {
                    $legAmount = round((float) $leg['amount'], 2);
                    $legMethod = $leg['payment_method'] ?? 'cash';
                    $legAccount = app(\App\Services\AccountService::class)->resolveAccount($leg['account_id'] ?? null, $legMethod);
                    if ($legAccount) {
                        if ($firstAccountId === null) {
                            $firstAccountId = $legAccount->id;
                        }
                        app(\App\Services\AccountService::class)->deposit(
                            $legAccount,
                            $legAmount,
                            'sale_invoice',
                            $invoice->id,
                            "Sale invoice {$posted} ({$legAccount->name} - {$legMethod})",
                            $request->user()
                        );
                    }

                    if (app(\App\Services\AccountService::class)->isDefaultCashDrawerAccount($legAccount, $legMethod)) {
                        app(\App\Services\CashDrawerService::class)->recordTransaction(
                            null,
                            'cash_sale',
                            $legAmount,
                            'sale_invoice',
                            $invoice->id,
                            "Cash sale {$posted} (split)",
                            $request->user()
                        );
                    }
                }
                if ($firstAccountId !== null) {
                    $invoice->account_id = $firstAccountId;
                    $invoice->saveQuietly();
                }
            } else {
                $payMethod = $invoice->payment_method ?? 'cash';
                $cashReceived = (float)($invoice->total_receive ?? 0);
                if (($invoice->invoice_type ?? 'debit') === 'debit' && $cashReceived <= 0) {
                    $cashReceived = (float)$invoice->total;
                }
                if ($cashReceived > 0) {
                    $account = app(\App\Services\AccountService::class)->resolveAccount($invoice->account_id, $payMethod);
                    if ($account) {
                        $invoice->account_id = $account->id;
                        $invoice->saveQuietly();

                        app(\App\Services\AccountService::class)->deposit(
                            $account,
                            $cashReceived,
                            'sale_invoice',
                            $invoice->id,
                            "Sale invoice {$posted} ({$account->name})",
                            $request->user()
                        );
                    }

                    if (app(\App\Services\AccountService::class)->isDefaultCashDrawerAccount($account, $payMethod)) {
                        app(\App\Services\CashDrawerService::class)->recordTransaction(
                            null,
                            'cash_sale',
                            $cashReceived,
                            'sale_invoice',
                            $invoice->id,
                            "Cash sale {$posted}",
                            $request->user()
                        );
                    }
                }
            }

            // Apply available customer credit / return credit note if requested at checkout
            $applyCredit = round((float) ($data['apply_credit_amount'] ?? 0), 2);
            if ($applyCredit > 0) {
                $remainingOnInvoice = round(max((float) $invoice->total - (float) ($invoice->total_receive ?? 0), 0), 2);
                $creditToApply = min($applyCredit, $remainingOnInvoice);
                if ($creditToApply > 0) {
                    app(\App\Services\PaymentService::class)->applyPartyCredits(
                        'customer',
                        (int) $invoice->customer_id,
                        [['invoice_id' => $invoice->id, 'amount' => $creditToApply]],
                        $request->user()
                    );
                }
            }

            app(\App\Services\DocumentAuditService::class)->recordCreate($invoice->load('items.product'), $request->user());

            return response()->json(['message' => 'Sale Invoice created', 'id' => $invoice->id, 'posted_number' => $posted], 201);
        });
    }

    public function update(Request $request, $id)
    {
        $invoice = SaleInvoice::with(['items.product', 'customer'])->findOrFail($id);
        $this->authorize('update', $invoice);

        if ($invoice->status === 'reversed') {
            abort(422, 'Cannot edit an invoice that has been reversed.');
        }

        $auditService = app(\App\Services\DocumentAuditService::class);
        $beforeSnapshot = $auditService->snapshot($invoice);

        // Auto-fallback to default/walk-in customer if customer_id was not provided for debit (cash) sales
        if (empty($request->input('customer_id')) && $request->input('invoice_type', $invoice->invoice_type ?? 'debit') !== 'credit') {
            $defaultCustomer = \App\Models\Customer::orderBy('id', 'asc')->first();
            if ($defaultCustomer) {
                $request->merge(['customer_id' => $defaultCustomer->id]);
            }
        }

        // keep posted_number unique on update (user may not change it)
        $data = $request->validate([
            'reason'              => 'nullable|string|max:500',
            'update_drawer'       => 'nullable|boolean',
            'update_drawer_if_pre_shift' => 'nullable|boolean',
            'customer_id'         => 'required|exists:customers,id',
            'invoice_type'        => 'nullable|string|in:credit,debit',
            'payment_method'      => 'nullable|string|in:cash,card,bank_transfer,cheque,mobile_wallet,other',
            'account_id'          => 'nullable|integer|exists:accounts,id',
            'sale_type'           => 'nullable|string|in:retail,wholesale',
            'wholesale_type'      => 'nullable|string|in:unit,pack',
            'posted_number'       => 'required|string|unique:sale_invoices,posted_number,' . $invoice->id,
            'date'                => 'required|date',
            'due_date'            => 'nullable|date',
            'credit_override'     => 'nullable|boolean',
            'discount_override'   => 'nullable|boolean',
            'expired_override'    => 'nullable|boolean',
            'supervisor_email'    => 'nullable|string',
            'supervisor_password' => 'nullable|string',
            'remarks'             => 'nullable|string',
            'doctor_name'         => 'nullable|string',
            'patient_name'        => 'nullable|string',
            'discount_percentage' => 'nullable|numeric',
            'discount_amount'     => 'nullable|numeric',
            'tax_percentage'      => 'nullable|numeric',
            'tax_amount'          => 'nullable|numeric',
            'item_discount'       => 'nullable|numeric',
            'gross_amount'        => 'nullable|numeric',
            'total'               => 'nullable|numeric',
            'total_receive'       => 'nullable|numeric',
            'apply_credit_amount' => 'nullable|numeric|min:0',
            'split_payments'                  => 'nullable|array',
            'split_payments.*.payment_method' => 'required_with:split_payments|string|in:cash,card,bank_transfer,cheque,mobile_wallet,other',
            'split_payments.*.account_id'     => 'nullable|integer|exists:accounts,id',
            'split_payments.*.amount'         => 'required_with:split_payments|numeric|min:0',

            'items'                            => 'required|array|min:1',
            'items.*.id'                       => 'nullable|integer',
            'items.*.product_id'               => 'required|exists:products,id',
            'items.*.pack_size'                => 'nullable|integer|min:0',
            'items.*.batch_number'             => 'nullable|string',
            'items.*.batch'                    => 'nullable|string',
            'items.*.expiry'                   => 'nullable|string',
            'items.*.expiry_date'              => 'nullable|string',
            'items.*.current_quantity'         => 'nullable|integer',
            'items.*.pack_quantity'            => 'nullable|numeric|min:0',
            'items.*.unit_quantity'            => 'nullable|integer|min:0',
            'items.*.quantity'                 => 'nullable|integer|min:0',
            'items.*.pack_bonus'               => 'nullable|numeric|min:0',
            'items.*.unit_bonus'               => 'nullable|integer|min:0',
            'items.*.bonus'                    => 'nullable|integer|min:0',
            'items.*.pack_price'               => 'nullable|numeric|min:0',
            'items.*.price'                    => 'required|numeric|min:0',
            'items.*.item_discount_percentage' => 'nullable|numeric',
            'items.*.sub_total'                => 'nullable|numeric|min:0',
            'items.*.sale_type'                => 'nullable|string|in:retail,wholesale',
            'items.*.is_custom_price'          => 'nullable|boolean',
        ]);

        $clientUpdateTotal = $request->has('total') && is_numeric($request->input('total'))
            ? round((float) $request->input('total'), 2)
            : null;
        $hasExplicitUpdateReceive = $request->has('total_receive') && $request->input('total_receive') !== null && $request->input('total_receive') !== '';
        $clientUpdateReceive = $hasExplicitUpdateReceive && is_numeric($request->input('total_receive'))
            ? round((float) $request->input('total_receive'), 2)
            : null;

        // Server-Authoritative Totals & Discount Controls
        $calculated = app(\App\Services\InvoiceCalculationService::class)->calculateAndValidateSale(
            $data,
            $request->user(),
            $request->boolean('discount_override')
        );
        $data['gross_amount']        = $calculated['gross_amount'];
        $data['item_discount']       = $calculated['item_discount'];
        $data['discount_percentage'] = $calculated['discount_percentage'];
        $data['discount_amount']     = $calculated['discount_amount'];
        $data['tax_percentage']      = $calculated['tax_percentage'];
        $data['tax_amount']          = $calculated['tax_amount'];
        $data['total']               = $calculated['total'];
        $data['items']               = $calculated['items'];

        $effectiveUpdateInvoiceType = $data['invoice_type'] ?? ($invoice->invoice_type ?? 'debit');
        if (!empty($data['split_payments']) && !$hasExplicitUpdateReceive) {
            $data['total_receive'] = round(collect($data['split_payments'])->sum(fn($leg) => (float)($leg['amount'] ?? 0)), 2);
            $hasExplicitUpdateReceive = true;
        }
        if ($effectiveUpdateInvoiceType === 'debit' && empty($data['split_payments'])) {
            $isClientFullDebitUpdateReceive = !$hasExplicitUpdateReceive
                || ($clientUpdateReceive !== null && $clientUpdateTotal !== null && $clientUpdateReceive >= ($clientUpdateTotal - 0.009))
                || ($clientUpdateReceive !== null && abs($clientUpdateReceive - (float) $data['total']) <= 1.00);

            if ($isClientFullDebitUpdateReceive) {
                if ($request->filled('cash_given') && is_numeric($request->input('cash_given'))) {
                    $cashGivenFloat = round((float) $request->input('cash_given'), 2);
                    $isFullCashGiven = ($clientUpdateTotal !== null && $cashGivenFloat >= ($clientUpdateTotal - 0.009))
                        || abs($cashGivenFloat - (float) $data['total']) <= 1.00
                        || $cashGivenFloat >= (float) $data['total'];
                    $data['total_receive'] = $isFullCashGiven
                        ? $data['total']
                        : min((float) $data['total'], $cashGivenFloat);
                } else {
                    $data['total_receive'] = $data['total'];
                }
            }
        }

        $this->validateCreditLimits($data, $request, $invoice);
        $dueDate = $this->resolveDueDate($data);

        return DB::transaction(function () use ($invoice, $data, $request, $auditService, $beforeSnapshot, $dueDate) {
            $invoice = SaleInvoice::lockForUpdate()->findOrFail($invoice->id);
            $allocatedOnInvoice = app(\App\Services\PaymentService::class)->getAllocatedAmountForInvoice('sale_invoice', (int) $invoice->id);
            $oldInvoiceType = $invoice->invoice_type ?? 'debit';
            $newInvoiceType = $data['invoice_type'] ?? $oldInvoiceType;

            if ($allocatedOnInvoice > 0.009 && ($newInvoiceType !== 'credit' || (int) $data['customer_id'] !== (int) $invoice->customer_id)) {
                throw ValidationException::withMessages([
                    'invoice_type' => ['Cannot change customer or convert a credit invoice with active payment/credit allocations to cash/debit. Detach or reverse payments first.'],
                ]);
            }

            $originalItems = $invoice->items()->get();
            app(\App\Services\SaleStockAvailability::class)->validate(
                $data['items'],
                $originalItems,
                $request->user(),
                $request->boolean('expired_override'),
                $request->only(['supervisor_email', 'supervisor_password'])
            );
            $costs = app(\App\Services\SaleCostSnapshot::class)->productCosts($data['items']);
            $this->revertItems($invoice);
            $invoice->items()->delete();

            // Capture old cash state before update (excluding standalone PaymentAllocation amounts)
            $oldAccountId = $invoice->account_id;
            $oldPayMethod = $invoice->payment_method ?? 'cash';
            $oldRawReceived = (float) ($invoice->total_receive ?? 0);
            if ($oldInvoiceType === 'debit' && $oldRawReceived <= 0) {
                $oldRawReceived = (float) $invoice->total;
            }
            $oldDirectReceived = max(0.0, round($oldRawReceived - $allocatedOnInvoice, 2));
            $oldCash = ($oldPayMethod === 'cash') ? $oldDirectReceived : 0.0;

            // Store old invoice type and sale type before update
            $oldSaleType = $invoice->sale_type ?? 'retail';
            $newSaleType = $data['sale_type'] ?? $oldSaleType;

            $submittedTotalReceive = round((float) ($data['total_receive'] ?? 0), 2);
            if ($newInvoiceType === 'credit' && $allocatedOnInvoice > 0 && $submittedTotalReceive < $allocatedOnInvoice) {
                $submittedTotalReceive = round($submittedTotalReceive + $allocatedOnInvoice, 2);
            }

            $updateData = [
                'customer_id'        => $data['customer_id'],
                'invoice_type'       => $newInvoiceType,
                'sale_type'          => $newSaleType,
                'wholesale_type'     => $data['wholesale_type'] ?? $invoice->wholesale_type ?? 'unit',
                'posted_number'      => $data['posted_number'], // keep whatever is on the record
                'date'               => $data['date'],
                'remarks'            => $data['remarks'] ?? null,
                'doctor_name'        => $data['doctor_name'] ?? null,
                'patient_name'       => $data['patient_name'] ?? null,
                'discount_percentage'=> $data['discount_percentage'] ?? 0,
                'discount_amount'    => $data['discount_amount'] ?? 0,
                'tax_percentage'     => $data['tax_percentage'] ?? 0,
                'tax_amount'         => $data['tax_amount'] ?? 0,
                'item_discount'      => $data['item_discount'] ?? 0,
                'gross_amount'       => $data['gross_amount'],
                'total'              => $data['total'],
                'total_receive'      => $submittedTotalReceive,
            ];

            if (\Illuminate\Support\Facades\Schema::hasColumn('sale_invoices', 'due_date')) {
                $updateData['due_date'] = $dueDate;
            }

            if (\Illuminate\Support\Facades\Schema::hasColumn('sale_invoices', 'payment_method')) {
                $updateData['payment_method'] = $data['payment_method'] ?? $invoice->payment_method ?? 'cash';
            }

            $invoice->update($updateData);

            $this->createItemsAndReduce($invoice, $data['items'], $originalItems, $costs);

            // Save customer-specific wholesale prices if any custom prices were used and user is authorized
            $canUpdateWholesalePricing = $request->user()->hasRole(['Admin', 'admin', 'super-admin'])
                || $request->user()->can('customer.update')
                || $request->user()->can('product.update');
            if ($newSaleType === 'wholesale' && isset($data['items']) && $canUpdateWholesalePricing) {
                foreach ($data['items'] as $raw) {
                    if (isset($raw['is_custom_price']) && $raw['is_custom_price'] === true) {
                        $packSize = max(1, (int)($raw['pack_size'] ?? 1));
                        $packPriceToSave = isset($raw['pack_price']) && (float)$raw['pack_price'] > 0
                            ? round((float)$raw['pack_price'], 2)
                            : round((float)$raw['price'] * $packSize, 2);
                        CustomerWholeSalePrice::updateOrCreate(
                            [
                                'customer_id' => $data['customer_id'],
                                'product_id' => $raw['product_id'],
                            ],
                            [
                                'pack_price' => $packPriceToSave,
                            ]
                        );
                    }
                }
            }

            // Handle customer ledger entries
            // If invoice is now debit, ensure no ledger entry remains for this invoice
            if ($newInvoiceType !== 'credit') {
                CustomerLedger::where('sale_invoice_id', $invoice->id)->delete();
                CustomerLedger::where('payment_ref', 'Inv #' . $invoice->posted_number)
                    ->where('entry_type', 'payment')
                    ->delete();
            }
            // If invoice is now credit, create or update ledger entry
            elseif ($newInvoiceType === 'credit') {
                CustomerLedger::where('sale_invoice_id', $invoice->id)->delete();
                CustomerLedger::where('customer_id', $invoice->customer_id)
                    ->where('payment_ref', 'Inv #' . $invoice->posted_number)
                    ->where('entry_type', 'payment')
                    ->delete();

                $invTotal = (float) $data['total'];
                $rawTotalRecv = (float) ($invoice->total_receive ?? 0);
                $directRecv = max(0.0, round($rawTotalRecv - $allocatedOnInvoice, 2));
                $recvOnInv = min($directRecv, $invTotal);
                $excessRecv = max(0.0, round($directRecv - max(0.0, $invTotal - $allocatedOnInvoice), 2));

                $ledger = new CustomerLedger();
                $ledger->customer_id       = $data['customer_id'];
                $ledger->sale_invoice_id   = $invoice->id;
                $ledger->entry_type        = 'invoice';
                $ledger->is_manual         = false;
                $ledger->entry_date        = $data['date'];
                if (\Illuminate\Support\Facades\Schema::hasColumn('customer_ledgers', 'due_date')) {
                    $ledger->due_date      = $dueDate;
                }
                $ledger->posted_number     = $data['posted_number'];
                $ledger->invoice_total     = $invTotal;
                $ledger->total_received    = $recvOnInv;
                $ledger->balance_remaining = max($invTotal - $recvOnInv, 0);
                $ledger->credited_amount   = 0;
                $ledger->payment_ref       = null;
                $ledger->description       = 'Sale invoice ' . $data['posted_number'];
                $ledger->created_by        = optional(Auth::user())->id;
                $ledger->save();

                if ($excessRecv > 0) {
                    $excessEntry = new CustomerLedger();
                    $excessEntry->customer_id       = $data['customer_id'];
                    $excessEntry->sale_invoice_id   = null;
                    $excessEntry->entry_type        = 'payment';
                    $excessEntry->is_manual         = false;
                    $excessEntry->entry_date        = $data['date'];
                    $excessEntry->posted_number     = $data['posted_number'];
                    $excessEntry->invoice_total     = 0;
                    $excessEntry->total_received    = 0;
                    $excessEntry->balance_remaining = 0;
                    $excessEntry->credited_amount   = $excessRecv;
                    $excessEntry->payment_ref       = 'Inv #' . $data['posted_number'];
                    $excessEntry->description       = 'Payment received on invoice ' . $data['posted_number'];
                    $excessEntry->created_by        = optional(Auth::user())->id;
                    $excessEntry->save();
                }
            }

            // Sync with active cash drawer if applicable (using direct tender only, excluding allocations)
            $accountService = app(\App\Services\AccountService::class);
            $newPayMethod = $invoice->payment_method ?? 'cash';
            $newAccountId = array_key_exists('account_id', $data) ? $data['account_id'] : $invoice->account_id;
            if ($newPayMethod !== $oldPayMethod && (int) ($newAccountId ?? 0) === (int) ($oldAccountId ?? 0) && !array_key_exists('account_id', $data)) {
                $newAccountId = null;
            }
            $oldResolvedAcc = $accountService->resolveAccount($oldAccountId, $oldPayMethod);
            $newResolvedAcc = $accountService->resolveAccount($newAccountId, $newPayMethod);

            $newRawReceived = (float) ($invoice->total_receive ?? 0);
            if ($newInvoiceType === 'debit' && $newRawReceived <= 0) {
                $newRawReceived = (float) $invoice->total;
            }
            $newDirectReceived = max(0.0, round($newRawReceived - $allocatedOnInvoice, 2));
            $oldCash = $accountService->isDefaultCashDrawerAccount($oldResolvedAcc, $oldPayMethod) ? $oldDirectReceived : 0.0;
            $newCash = $accountService->isDefaultCashDrawerAccount($newResolvedAcc, $newPayMethod) ? $newDirectReceived : 0.0;
            $updateDrawerFlag = null;
            if (array_key_exists('update_drawer', $data) && $data['update_drawer'] !== null) {
                $updateDrawerFlag = (bool)$data['update_drawer'];
            } elseif (array_key_exists('update_drawer_if_pre_shift', $data) && $data['update_drawer_if_pre_shift'] !== null) {
                $updateDrawerFlag = (bool)$data['update_drawer_if_pre_shift'];
            }

            app(\App\Services\CashDrawerService::class)->syncSaleInvoiceUpdate(
                $invoice,
                $oldCash,
                $newCash,
                $updateDrawerFlag,
                $request->user()
            );

            // Sync with financial accounts
            $accountService->syncSaleInvoiceUpdate(
                $invoice,
                $oldAccountId,
                $oldPayMethod,
                $oldDirectReceived,
                $newAccountId,
                $newPayMethod,
                $newDirectReceived,
                $request->user(),
                $updateDrawerFlag
            );

            $auditService->recordUpdate($invoice->fresh(['items.product', 'customer']), $beforeSnapshot, $request->user(), $data['reason'] ?? 'Sale invoice updated');

            return response()->json(['message' => 'Sale Invoice updated', 'id' => $invoice->id]);
        });
    }

    public function reverse(Request $request, $id)
    {
        $invoice = SaleInvoice::with(['items.product', 'customer'])->findOrFail($id);
        $this->authorize('reverse', $invoice);

        $validated = $request->validate([
            'reason' => 'required|string|min:3|max:500',
        ]);

        if ($invoice->status === 'reversed') {
            return response()->json(['message' => 'Invoice has already been reversed.'], 422);
        }

        // Check if any linked sale return exists
        if (\App\Models\SaleReturn::where('sale_invoice_id', $invoice->id)->exists()) {
            return response()->json([
                'message' => 'Cannot reverse this invoice because linked sale returns exist. Please reverse or remove the returns first.',
            ], 422);
        }

        return DB::transaction(function () use ($invoice, $validated, $request) {
            $invoice = SaleInvoice::lockForUpdate()->findOrFail($invoice->id);
            app(\App\Services\SaleStockAvailability::class)->validate([], $invoice->items()->get());
            
            // Revert inventory stock safely
            $this->revertItems($invoice);

            // Unwind any Payment / Credit Note allocations before reversing so standalone payments
            // and credit notes are restored to customer unapplied credit and not refunded as cash
            app(\App\Services\PaymentService::class)->detachInvoiceAllocations('sale_invoice', (int) $invoice->id, $request->user());
            $invoice->refresh();

            // If credit sale, remove or balance customer ledger entry
            if ($invoice->invoice_type === 'credit') {
                CustomerLedger::where('sale_invoice_id', $invoice->id)->delete();
                CustomerLedger::where('customer_id', $invoice->customer_id)
                    ->where('payment_ref', 'Inv #' . $invoice->posted_number)
                    ->where('entry_type', 'payment')
                    ->delete();
            }

            $invoice->status = 'reversed';
            $invoice->reversed_at = now();
            $invoice->reversed_by_id = $request->user()?->id;
            $invoice->reversal_reason = $validated['reason'];
            $invoice->save();

            // Reversal refund recorded in cash drawer if cash was received directly on the invoice
            app(\App\Services\CashDrawerService::class)->handleSaleInvoiceReversal(
                $invoice,
                $validated['reason'],
                $request->user()
            );

            // Reversal refund recorded in financial account(s) (supporting split payments)
            $revAmount = (float) ($invoice->total_receive ?? 0);
            if (($invoice->invoice_type ?? 'debit') === 'debit' && $revAmount <= 0) {
                $revAmount = (float) $invoice->total;
            }
            if ($revAmount > 0) {
                app(\App\Services\AccountService::class)->refundSaleInvoice(
                    $invoice,
                    $revAmount,
                    'sale_invoice_reversal',
                    "Reversal refund for Sale Invoice #{$invoice->posted_number}",
                    $request->user()
                );
            }

            app(\App\Services\DocumentAuditService::class)->recordReversal($invoice, $request->user(), $validated['reason']);

            return response()->json([
                'message' => 'Sale invoice reversed successfully.',
                'invoice' => $invoice->fresh(['items.product', 'customer']),
            ]);
        });
    }

    public function destroy(Request $request, $id)
    {
        $invoice = SaleInvoice::with(['items', 'customer'])->findOrFail($id);
        $this->authorize('delete', $invoice);

        if (\App\Models\SaleReturn::where('sale_invoice_id', $invoice->id)->exists()) {
            return response()->json([
                'message' => 'Cannot delete this invoice because linked sale returns exist. Please delete the returns first.',
            ], 422);
        }

        $mode = strtolower(trim((string)($request->query('mode', $request->input('mode', 'none')))));
        if (!in_array($mode, ['none', 'credit', 'refund'], true)) {
            $mode = 'none';
        }

        return DB::transaction(function () use ($invoice, $mode, $request) {
            $invoice = SaleInvoice::lockForUpdate()->findOrFail($invoice->id);

            if ($invoice->status !== 'reversed') {
                app(\App\Services\SaleStockAvailability::class)->validate([], $invoice->items()->get());
                $this->revertItems($invoice);

                // Unwind any Payment / Credit Note allocations FIRST so standalone payments
                // and credit notes are restored to customer unapplied credit and not double-credited or refunded as cash
                app(\App\Services\PaymentService::class)->detachInvoiceAllocations('sale_invoice', (int) $invoice->id, $request->user());
                $invoice->refresh();

                $received = (float)($invoice->total_receive ?? $invoice->total_recieve ?? $invoice->received ?? 0);

                // Only handle customer ledger entries for credit invoices
                // Debit invoices (cash sales) are not tracked in customer ledger
                $isCreditInvoice = ($invoice->invoice_type ?? 'debit') === 'credit';

                if ($isCreditInvoice) {
                    // Delete the original ledger entry and any excess payment for this invoice
                    CustomerLedger::where('sale_invoice_id', $invoice->id)->delete();
                    CustomerLedger::where('customer_id', $invoice->customer_id)
                        ->where('payment_ref', 'Inv #' . $invoice->posted_number)
                        ->where('entry_type', 'payment')
                        ->delete();

                    $customerId   = (int)$invoice->customer_id;
                    $postedNumber = $invoice->posted_number;
                    $entryDate    = $invoice->date ?? now()->toDateString();
                    $userId       = optional(Auth::user())->id;

                    // mode 'credit' = Store Credit (create negative entry to credit the customer for direct tender paid on the invoice)
                    if ($mode === 'credit' && $received > 0) {
                        $creditEntry = new CustomerLedger();
                        $creditEntry->customer_id       = $customerId;
                        $creditEntry->entry_type        = 'manual';
                        $creditEntry->is_manual         = true;
                        $creditEntry->entry_date        = $entryDate;
                        $creditEntry->posted_number     = $postedNumber;
                        $creditEntry->invoice_total     = -$received;
                        $creditEntry->total_received    = 0;
                        $creditEntry->balance_remaining = 0;
                        $creditEntry->credited_amount   = 0;
                        $creditEntry->payment_ref       = null;
                        $creditEntry->sale_invoice_id   = null;
                        $creditEntry->description       = 'Store credit for deleted invoice ' . $postedNumber;
                        $creditEntry->created_by        = $userId;
                        $creditEntry->save();
                    }

                    // mode 'refund' / 'none' = Void & Refund (delete ledger entry and unwind cash/account receipt)
                }

                // Adjust cash drawer for deleted invoice
                app(\App\Services\CashDrawerService::class)->handleSaleInvoiceDeletion(
                    $invoice,
                    $mode,
                    $request->user()
                );

                // Adjust financial accounts for deleted invoice unless retained as store credit
                if ($mode !== 'credit') {
                    $delAmount = (float) ($invoice->total_receive ?? 0);
                    if (($invoice->invoice_type ?? 'debit') === 'debit' && $delAmount <= 0) {
                        $delAmount = (float) $invoice->total;
                    }
                    if ($delAmount > 0) {
                        app(\App\Services\AccountService::class)->refundSaleInvoice(
                            $invoice,
                            $delAmount,
                            'sale_invoice_deletion',
                            "Refund for deleted sale invoice #{$invoice->posted_number}",
                            $request->user()
                        );
                    }
                }
            }

            $invoice->items()->delete();
            $invoice->delete();

            return response()->json(['message' => 'Sale Invoice deleted']);
        });
    }

    public function printUrl(Request $request, SaleInvoice $saleInvoice)
    {
        $user = $request->user();
        if (
            !$user
            || (
                !$user->hasRole(['Admin', 'admin', 'super-admin'])
                && !$user->can('sale-invoice.view')
                && !$user->can('sale-invoice.create')
                && !$user->can('barcode-pos.create')
            )
        ) {
            abort(403, 'This action is unauthorized.');
        }

        $params = array_filter([
            'invoice' => $saleInvoice->id,
            'type'    => $request->query('type'),
        ], fn ($v) => $v !== null && $v !== '');

        $url = \Illuminate\Support\Facades\URL::temporarySignedRoute(
            'sale-invoices.print',
            now()->addMinutes(5),
            $params
        );

        return response()->json(['url' => $url]);
    }

    public function print(Request $request, SaleInvoice $invoice)
    {
        $invoice->load(['items.product', 'customer', 'user']);
        $setting = Setting::first();

        $type = strtolower($request->query('type', $setting->printer_type ?? 'a4'));
        if (!in_array($type, ['a4', 'thermal'])) {
            $type = 'a4';
        }

        $gross  = (float) ($invoice->items?->sum('sub_total') ?? 0);
        $disc   = (float) ($invoice->discount_amount ?? 0);
        $tax    = (float) ($invoice->tax_amount ?? 0);
        $total  = (float) ($invoice->total ?? ($gross - $disc + $tax));

        $receivedOnInvoice = (float) ($invoice->total_receive ?? 0);
        $remainThis        = max($total - $receivedOnInvoice, 0);

        $customerId = (int) $invoice->customer_id;

        // Get customer's Total Due from customer ledger (net_balance)
        // This is the correct approach - get the value from the ledger which already calculates it
        // net_balance = (total_invoiced - received_on_invoice) - payments_credited
        $customerTotalDue = \App\Models\CustomerLedger::getCustomerNetBalance($customerId);

        $gross  = (float) ($invoice->items?->sum('sub_total') ?? 0);
        $disc   = (float) ($invoice->discount_amount ?? 0);
        $tax    = (float) ($invoice->tax_amount ?? 0);
        $total  = (float) ($invoice->total ?? ($gross - $disc + $tax));

        $receivedOnInvoice = (float) ($invoice->total_receive ?? 0);
        $remainThis        = max($total - $receivedOnInvoice, 0);

        // Determine which template to use
        if ($type === 'thermal') {
            // For thermal, use the selected thermal template from settings
            $thermalTemplate = $setting->thermal_template ?? 'standard';
            $templateName = "sale_invoice_thermal_{$thermalTemplate}";
        } else {
            // For A4, use the selected A4 template from settings
            $a4Template = $setting->a4_template ?? 'standard';
            $templateName = "sale_invoice_a4_{$a4Template}";
        }

        return view("printer.{$templateName}", [
            'invoice'            => $invoice,
            'setting'            => $setting,
            'printTotal'         => $total,
            'printReceive'       => $receivedOnInvoice,
            'printRemainThis'    => $remainThis,
            'printCustomerTotalDue' => $customerTotalDue,
        ]);
    }


    public function updateMeta(Request $request, SaleInvoice $saleInvoice)
{
    // Permission
    if (! $request->user()->can('report.sale-detail.edit')) {
        abort(403, 'Unauthorized');
    }

    // Safety: allow only doctor/patient
    $data = $request->validate([
        'doctor_name'  => 'nullable|string|max:255',
        'patient_name' => 'nullable|string|max:255',
    ]);

    // Optional: prevent editing cancelled invoices
    if ($saleInvoice->status === 'cancelled') {
        abort(403, 'Cancelled invoice cannot be edited');
    }

    $saleInvoice->update($data);

    return response()->json([
        'success' => true,
        'doctor_name'  => $saleInvoice->doctor_name,
        'patient_name' => $saleInvoice->patient_name,
    ]);
}

    public function search(Request $request)
    {
        $this->authorize('lookup', SaleInvoice::class);

        $q = trim((string) $request->query('q', ''));
        $customerId = $request->query('customer_id');
        
        // Pagination parameters
        $page = (int) $request->query('page', 1);
        $perPage = (int) $request->query('per_page', 20);

        $query = SaleInvoice::with(['customer'])->orderByDesc('id');
        if ($customerId) {
            $query->where('customer_id', $customerId);
        }

        // If no search query, return recent invoices
        if (strlen($q) < 1) {
            $results = $query->paginate($perPage, ['*'], 'page', $page);

            // Add computed fields
            $results->getCollection()->transform(function ($invoice) {
                $invTotal = (float) ($invoice->total ?? 0);
                $received = (float) ($invoice->total_receive ?? 0);
                $invoice->remaining = max($invTotal - $received, 0);
                $invoice->customer_name = $invoice->customer?->name ?? ($invoice->customer_id ?? 'N/A');
                return $invoice;
            });

            return response()->json($results);
        }

        // Search by posted_number or customer name
        $query->where(function ($sub) use ($q) {
            $sub->where('posted_number', 'like', '%' . $q . '%')
                ->orWhereHas('customer', function ($customerQuery) use ($q) {
                    $customerQuery->where('name', 'like', '%' . $q . '%');
                });
        });

        $results = $query->paginate($perPage, ['*'], 'page', $page);

        // Add computed fields
        $results->getCollection()->transform(function ($invoice) {
            $invTotal = (float) ($invoice->total ?? 0);
            $received = (float) ($invoice->total_receive ?? 0);
            $invoice->remaining = max($invTotal - $received, 0);
            $invoice->customer_name = $invoice->customer?->name ?? ($invoice->customer_id ?? 'N/A');
            return $invoice;
        });

        return response()->json($results);
    }
}
