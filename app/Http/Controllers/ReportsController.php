<?php

namespace App\Http\Controllers;

use App\Authorizables\CostOfSaleReport;
use App\Authorizables\CurrentStockReport;
use App\Authorizables\NearExpiryProductReport;
use App\Authorizables\ProductComprehensiveReport;
use App\Authorizables\PurchaseDetailReport;
use App\Authorizables\SaleDetailReport;
use App\Authorizables\StockAdjustmentReport;
use App\Models\Product;
use App\Models\PurchaseReturn;
use App\Models\SaleReturn;
use App\Models\CustomerLedger;
use App\Models\SupplierLedger;
use App\Models\PurchaseInvoice;
use App\Models\SaleInvoice;
use App\Models\StockAdjustment;
use App\Models\StockAdjustmentItem;
use Barryvdh\DomPDF\Facade\Pdf;
use Illuminate\Http\Request;
use Illuminate\Support\Facades\DB;
use Carbon\Carbon;

class ReportsController extends Controller
{
    private function authorizeReportAction(string|array $permissions): void
    {
        $user = request()->user() ?? auth()->user();
        if (!$user) {
            abort(401, 'Unauthenticated.');
        }
        if ($user->hasRole(['Admin', 'admin', 'super-admin'])) {
            return;
        }
        foreach ((array) $permissions as $perm) {
            if ($user->can($perm)) {
                return;
            }
        }
        abort(403, 'This action is unauthorized.');
    }

    public function purchaseReturns(Request $req)
    {
        $this->authorizeReportAction('report.purchase-returns.view');

        $filters = $req->validate([
            'from' => 'sometimes|date_format:Y-m-d',
            'to' => 'sometimes|date_format:Y-m-d',
            'supplier_id' => 'sometimes|integer|exists:suppliers,id',
            'product_id' => 'sometimes|integer|exists:products,id',
        ]);
        $from = $filters['from'] ?? Carbon::now()->startOfMonth()->toDateString();
        $to = $filters['to'] ?? Carbon::now()->toDateString();
        abort_if($from > $to, 422, 'The from date must be on or before the to date.');
        $supplierId = $filters['supplier_id'] ?? null;
        $productId = $filters['product_id'] ?? null;

        $query = PurchaseReturn::with([
            'supplier:id,name',
            'purchaseInvoice:id,posted_number,invoice_number',
            'items' => function ($q) use ($productId) {
                $q->when($productId, fn($items) => $items->where('product_id', $productId))
                    ->with('product:id,name,product_code')
                    ->select([
                        'id', 'purchase_return_id', 'product_id', 'batch', 'expiry',
                        'pack_size', 'return_pack_quantity', 'return_unit_quantity',
                        'pack_purchase_price', 'unit_purchase_price',
                        'item_discount_percentage', 'sub_total',
                    ]);
            },
        ])
            ->whereBetween('date', [$from, $to])
            ->when($supplierId, fn($q) => $q->where('supplier_id', $supplierId))
            ->when($productId, fn($q) => $q->whereHas('items', fn($items) => $items->where('product_id', $productId)))
            ->orderBy('date')
            ->orderBy('id')
            ->get();

        $rows = $query->map(fn($return) => [
            'id' => $return->id,
            'posted_number' => $return->posted_number,
            'date' => $return->date ? Carbon::parse($return->date)->toDateString() : null,
            'supplier_name' => $return->supplier->name ?? null,
            'invoice_number' => $return->purchaseInvoice->invoice_number ?? $return->purchaseInvoice->posted_number ?? null,
            'remarks' => $return->remarks,
            'gross_total' => (float) $return->gross_total,
            'discount_amount' => (float) $return->discount_amount,
            'tax_amount' => (float) $return->tax_amount,
            'total' => (float) $return->total,
            'items' => $return->items->map(fn($item) => [
                'id' => $item->id,
                'product_name' => $item->product->name ?? null,
                'product_code' => $item->product->product_code ?? null,
                'batch' => $item->batch,
                'expiry' => $item->expiry,
                'pack_size' => (int) $item->pack_size,
                'return_pack_quantity' => (int) $item->return_pack_quantity,
                'return_unit_quantity' => (int) $item->return_unit_quantity,
                'quantity' => (int) $item->return_unit_quantity,
                'unit_purchase_price' => (float) $item->unit_purchase_price,
                'item_discount_percentage' => (float) $item->item_discount_percentage,
                'sub_total' => (float) $item->sub_total,
            ])->values(),
        ])->values();

        return response()->json([
            'rows' => $rows,
            'summary' => [
                'return_count' => $rows->count(),
                'item_count' => $rows->sum(fn($row) => count($row['items'])),
                'quantity' => $rows->sum(fn($row) => collect($row['items'])->sum('quantity')),
                'total' => round($rows->sum('total'), 2),
            ],
        ]);
    }

    public function saleReturns(Request $req)
    {
        $this->authorizeReportAction('report.sale-returns.view');

        $filters = $req->validate([
            'from' => 'sometimes|date_format:Y-m-d',
            'to' => 'sometimes|date_format:Y-m-d',
            'customer_id' => 'sometimes|integer|exists:customers,id',
            'product_id' => 'sometimes|integer|exists:products,id',
        ]);
        $from = $filters['from'] ?? Carbon::now()->startOfMonth()->toDateString();
        $to = $filters['to'] ?? Carbon::now()->toDateString();
        abort_if($from > $to, 422, 'The from date must be on or before the to date.');
        $customerId = $filters['customer_id'] ?? null;
        $productId = $filters['product_id'] ?? null;

        $query = SaleReturn::with([
            'customer:id,name',
            'user:id,name',
            'saleInvoice:id,posted_number',
            'items' => function ($q) use ($productId) {
                $q->when($productId, fn($items) => $items->where('product_id', $productId))
                    ->with('product:id,name,product_code')
                    ->select([
                        'id', 'sale_return_id', 'product_id', 'batch_number', 'expiry',
                        'unit_sale_quantity', 'unit_return_quantity', 'unit_sale_price',
                        'item_discount_percentage', 'sub_total',
                    ]);
            },
        ])
            ->whereBetween('date', [$from, $to])
            ->when($customerId, fn($q) => $q->where('customer_id', $customerId))
            ->when($productId, fn($q) => $q->whereHas('items', fn($items) => $items->where('product_id', $productId)))
            ->orderBy('date')
            ->orderBy('id')
            ->get();

        $rows = $query->map(fn($return) => [
            'id' => $return->id,
            'posted_number' => $return->posted_number,
            'date' => $return->date ? Carbon::parse($return->date)->toDateString() : null,
            'customer_name' => $return->customer->name ?? null,
            'user_name' => $return->user->name ?? null,
            'invoice_number' => $return->saleInvoice->posted_number ?? null,
            'gross_total' => (float) $return->gross_total,
            'discount_amount' => (float) $return->discount_amount,
            'tax_amount' => (float) $return->tax_amount,
            'total' => (float) $return->total,
            'items' => $return->items->map(fn($item) => [
                'id' => $item->id,
                'product_name' => $item->product->name ?? null,
                'product_code' => $item->product->product_code ?? null,
                'batch' => $item->batch_number,
                'expiry' => $item->expiry,
                'quantity' => (int) $item->unit_return_quantity,
                'sale_price' => (float) $item->unit_sale_price,
                'item_discount_percentage' => (float) $item->item_discount_percentage,
                'sub_total' => (float) $item->sub_total,
            ])->values(),
        ])->values();

        return response()->json([
            'rows' => $rows,
            'summary' => [
                'return_count' => $rows->count(),
                'item_count' => $rows->sum(fn($row) => count($row['items'])),
                'quantity' => $rows->sum(fn($row) => collect($row['items'])->sum('quantity')),
                'total' => round($rows->sum('total'), 2),
            ],
        ]);
    }

    public function purchaseSummary(Request $req)
    {
        $this->authorizeReportAction('report.purchase-summary.view');

        $filters = $req->validate([
            'from' => 'sometimes|date_format:Y-m-d',
            'to' => 'sometimes|date_format:Y-m-d',
            'supplier_id' => 'sometimes|integer|exists:suppliers,id',
            'product_id' => 'sometimes|integer|exists:products,id',
        ]);
        $from = $filters['from'] ?? Carbon::now()->startOfMonth()->toDateString();
        $to = $filters['to'] ?? Carbon::now()->toDateString();
        abort_if($from > $to, 422, 'The from date must be on or before the to date.');
        $supplierId = $filters['supplier_id'] ?? null;
        $productId = $filters['product_id'] ?? null;

        $invoices = PurchaseInvoice::with([
            'supplier:id,name',
            'items' => function ($q) use ($productId) {
                $q->when($productId, fn($items) => $items->where('product_id', $productId))
                    ->with('product:id,name')
                    ->select([
                        'id', 'purchase_invoice_id', 'product_id', 'quantity',
                        'pack_quantity', 'unit_quantity', 'unit_purchase_price', 'sub_total',
                    ]);
            },
        ])
            ->whereBetween('posted_date', [$from, $to])
            ->where(fn ($q) => $q->whereNull('status')->orWhere('status', '!=', 'reversed'))
            ->when($supplierId, fn($q) => $q->where('supplier_id', $supplierId))
            ->when($productId, fn($q) => $q->whereHas('items', fn($items) => $items->where('product_id', $productId)))
            ->orderBy('posted_date')
            ->orderBy('id')
            ->get();

        $rows = $invoices->map(fn($invoice) => [
            'id' => $invoice->id,
            'date' => optional($invoice->posted_date)->format('Y-m-d'),
            'posted_number' => $invoice->posted_number,
            'invoice_number' => $invoice->invoice_number,
            'supplier_name' => $invoice->supplier->name ?? null,
            'item_count' => $invoice->items->count(),
            'quantity' => (int) $invoice->items->sum('quantity'),
            'items_value' => round($invoice->items->sum('sub_total'), 2),
            'invoice_total' => (float) $invoice->total_amount,
            'total_paid' => (float) $invoice->total_paid,
            'items' => $invoice->items->map(fn($item) => [
                'product_name' => $item->product->name ?? null,
                'quantity' => (int) $item->quantity,
                'unit_purchase_price' => (float) $item->unit_purchase_price,
                'sub_total' => (float) $item->sub_total,
            ])->values(),
        ])->values();

        return response()->json([
            'rows' => $rows,
            'summary' => [
                'invoice_count' => $rows->count(),
                'item_count' => $rows->sum('item_count'),
                'quantity' => $rows->sum('quantity'),
                'items_value' => round($rows->sum('items_value'), 2),
                'invoice_total' => round($rows->sum('invoice_total'), 2),
                'total_paid' => round($rows->sum('total_paid'), 2),
            ],
        ]);
    }

    public function outstandingAging(Request $req)
    {
        $this->authorizeReportAction('report.outstanding-aging.view');

        $filters = $req->validate([
            'as_of'    => 'sometimes|date_format:Y-m-d',
            'aging_by' => 'sometimes|string|in:due_date,invoice_date',
        ]);
        $asOf = Carbon::parse($filters['as_of'] ?? Carbon::today()->toDateString())->startOfDay();
        $agingBy = $filters['aging_by'] ?? 'due_date';

        $bucketTotals = fn() => [
            'current'    => 0.0,
            'days_1_30'  => 0.0,
            'days_31_60' => 0.0,
            'days_61_90' => 0.0,
            'over_90'    => 0.0,
            'days_0_30'  => 0.0, // combined current + 1-30 for backward compatibility
        ];

        $bucketForEntry = function ($entryDate, $dueDate) use ($asOf, $agingBy) {
            if ($agingBy === 'due_date') {
                $target = $dueDate ?: $entryDate;
                $targetDate = Carbon::parse($target)->startOfDay();
                if ($targetDate->greaterThanOrEqualTo($asOf)) {
                    return 'current';
                }
                $overdueDays = $targetDate->diffInDays($asOf);
                return match (true) {
                    $overdueDays <= 30 => 'days_1_30',
                    $overdueDays <= 60 => 'days_31_60',
                    $overdueDays <= 90 => 'days_61_90',
                    default => 'over_90',
                };
            } else {
                $days = Carbon::parse($entryDate)->startOfDay()->diffInDays($asOf);
                return match (true) {
                    $days <= 30 => 'days_0_30',
                    $days <= 60 => 'days_31_60',
                    $days <= 90 => 'days_61_90',
                    default => 'over_90',
                };
            }
        };

        $buildPartyAging = function (
            string $ledgerTable,
            string $partyTable,
            string $partyKey,
            string $amountField,
            string $paidField,
            string $paymentField
        ) use ($asOf, $bucketTotals, $bucketForEntry, $agingBy) {
            $selectCols = [
                'l.*',
                'p.name as party_name',
                'p.phone as party_phone',
                'p.credit_limit',
                'p.credit_days',
            ];
            if (\Illuminate\Support\Facades\Schema::hasColumn($partyTable, 'credit_status')) {
                $selectCols[] = 'p.credit_status';
            }

            return DB::table("{$ledgerTable} as l")
                ->join("{$partyTable} as p", "p.id", '=', "l.{$partyKey}")
                ->whereDate('l.entry_date', '<=', $asOf->toDateString())
                ->select($selectCols)
                ->orderBy('l.entry_date')
                ->orderBy('l.id')
                ->get()
                ->groupBy($partyKey)
                ->map(function ($entries) use ($partyKey, $amountField, $paidField, $paymentField, $bucketTotals, $bucketForEntry, $asOf, $agingBy) {
                    $obligations = [];
                    $availableCredit = 0.0;
                    $applyCredit = function () use (&$obligations, &$availableCredit) {
                        foreach ($obligations as &$obligation) {
                            if ($availableCredit <= 0) break;
                            $applied = min($obligation['outstanding'], $availableCredit);
                            $obligation['payments_applied'] = round($obligation['payments_applied'] + $applied, 2);
                            $obligation['outstanding'] = round($obligation['outstanding'] - $applied, 2);
                            $availableCredit = round($availableCredit - $applied, 2);
                        }
                        unset($obligation);
                    };

                    foreach ($entries as $entry) {
                        if (in_array($entry->entry_type, ['invoice', 'manual'], true)) {
                            $invoiceAmount = max((float) $entry->{$amountField}, 0);
                            $paidOnInvoice = min($invoiceAmount, max((float) $entry->{$paidField}, 0));
                            $dueDate = !empty($entry->due_date) ? Carbon::parse($entry->due_date)->toDateString() : Carbon::parse($entry->entry_date)->toDateString();
                            $obligations[] = [
                                'ledger_id' => $entry->id,
                                'reference' => $entry->posted_number
                                    ?: $entry->invoice_number
                                    ?: ($entry->entry_type === 'manual' ? "Manual entry #{$entry->id}" : "Ledger entry #{$entry->id}"),
                                'entry_type' => $entry->entry_type,
                                'date' => Carbon::parse($entry->entry_date)->toDateString(),
                                'due_date' => $dueDate,
                                'invoice_amount' => round($invoiceAmount, 2),
                                'paid_on_invoice' => round($paidOnInvoice, 2),
                                'payments_applied' => 0.0,
                                'outstanding' => round(max($invoiceAmount - $paidOnInvoice, 0), 2),
                            ];
                            $applyCredit();
                        } elseif ($entry->entry_type === 'payment') {
                            $availableCredit += max((float) $entry->{$paymentField}, 0);
                            $applyCredit();
                        }
                    }

                    $buckets = $bucketTotals();
                    $openObligations = collect($obligations)
                        ->filter(fn($obligation) => $obligation['outstanding'] > 0)
                        ->map(function ($obligation) use (&$buckets, $bucketForEntry, $asOf, $agingBy) {
                            $dueDateObj = Carbon::parse($obligation['due_date'])->startOfDay();
                            $obligation['age_days'] = Carbon::parse($obligation['date'])->startOfDay()->diffInDays($asOf);
                            $obligation['is_overdue'] = $dueDateObj->lessThan($asOf);
                            $obligation['days_overdue'] = $obligation['is_overdue'] ? $dueDateObj->diffInDays($asOf) : 0;
                            $obligation['aging_bucket'] = $bucketForEntry($obligation['date'], $obligation['due_date']);
                            $buckets[$obligation['aging_bucket']] += $obligation['outstanding'];
                            return $obligation;
                        })
                        ->values();

                    if ($agingBy === 'due_date') {
                        $buckets['days_0_30'] = round($buckets['current'] + $buckets['days_1_30'], 2);
                        $totalOverdue = round($buckets['days_1_30'] + $buckets['days_31_60'] + $buckets['days_61_90'] + $buckets['over_90'], 2);
                    } else {
                        $buckets['days_1_30'] = $buckets['days_0_30'];
                        $totalOverdue = round($buckets['days_31_60'] + $buckets['days_61_90'] + $buckets['over_90'], 2);
                    }

                    $total = round($openObligations->sum('outstanding'), 2);
                    if ($total <= 0) return null;

                    $first = $entries->first();
                    $creditLimit = $first->credit_limit !== null ? (float)$first->credit_limit : null;

                    return [
                        'party_id'          => $first->{$partyKey},
                        'party_name'        => $first->party_name,
                        'party_phone'       => $first->party_phone ?? null,
                        'credit_limit'      => $creditLimit,
                        'credit_days'       => $first->credit_days ?? 30,
                        'credit_status'     => $first->credit_status ?? 'active',
                        'is_limit_exceeded' => $creditLimit !== null && $creditLimit > 0 && $total > $creditLimit,
                        'total_overdue'     => $totalOverdue,
                        'open_entry_count'  => $openObligations->count(),
                        ...array_map(fn($amount) => round($amount, 2), $buckets),
                        'total'             => $total,
                        'entries'           => $openObligations,
                    ];
                })
                ->filter()
                ->sortByDesc('total')
                ->values();
        };

        $customers = $buildPartyAging('customer_ledgers', 'customers', 'customer_id', 'invoice_total', 'total_received', 'credited_amount');
        $suppliers = $buildPartyAging('supplier_ledgers', 'suppliers', 'supplier_id', 'invoice_total', 'total_paid', 'debited_amount');

        $sumBuckets = function ($parties) {
            return [
                'current'          => round($parties->sum('current'), 2),
                'days_1_30'        => round($parties->sum('days_1_30'), 2),
                'days_0_30'        => round($parties->sum('days_0_30'), 2),
                'days_31_60'       => round($parties->sum('days_31_60'), 2),
                'days_61_90'       => round($parties->sum('days_61_90'), 2),
                'over_90'          => round($parties->sum('over_90'), 2),
                'total_overdue'    => round($parties->sum('total_overdue'), 2),
                'total'            => round($parties->sum('total'), 2),
                'party_count'      => $parties->count(),
                'open_entry_count' => $parties->sum('open_entry_count'),
            ];
        };

        return response()->json([
            'as_of'     => $asOf->toDateString(),
            'aging_by'  => $agingBy,
            'customers' => $customers,
            'suppliers' => $suppliers,
            'summary'   => [
                'customers' => $sumBuckets($customers),
                'suppliers' => $sumBuckets($suppliers),
            ],
        ]);
    }

    public function overdueWorkQueue(Request $req)
    {
        $this->authorizeReportAction('report.outstanding-aging.view');

        $partyType = $req->input('party_type', 'customers');
        abort_unless(in_array($partyType, ['customers', 'suppliers'], true), 422);

        $asOf = Carbon::parse($req->input('as_of', Carbon::today()->toDateString()))->startOfDay();
        $minOverdue = (float)$req->input('min_overdue', 0);
        $search = trim((string)$req->input('q', ''));

        // Request aging data grouped by due_date
        $agingReq = Request::create('/api/reports/outstanding-aging', 'GET', [
            'as_of'    => $asOf->toDateString(),
            'aging_by' => 'due_date',
        ]);
        $agingResponse = $this->outstandingAging($agingReq);
        $data = $agingResponse->getData(true);

        $parties = collect($data[$partyType] ?? [])
            ->filter(function ($party) use ($minOverdue, $search) {
                if (($party['total_overdue'] ?? 0) <= $minOverdue) {
                    return false;
                }
                if ($search !== '') {
                    $nameMatch = stripos($party['party_name'] ?? '', $search) !== false;
                    $phoneMatch = stripos($party['party_phone'] ?? '', $search) !== false;
                    return $nameMatch || $phoneMatch;
                }
                return true;
            })
            ->map(function ($party) {
                $overdueEntries = collect($party['entries'] ?? [])
                    ->filter(fn($e) => ($e['is_overdue'] ?? false) && ($e['outstanding'] ?? 0) > 0)
                    ->sortByDesc('days_overdue')
                    ->values();

                $party['overdue_entries'] = $overdueEntries;
                $party['max_days_overdue'] = $overdueEntries->max('days_overdue') ?? 0;
                return $party;
            })
            ->sortByDesc('total_overdue')
            ->values();

        return response()->json([
            'as_of'             => $asOf->toDateString(),
            'party_type'        => $partyType,
            'total_parties'     => $parties->count(),
            'total_overdue_sum' => round($parties->sum('total_overdue'), 2),
            'parties'           => $parties,
        ]);
    }

    public function reorderReport(Request $req)
    {
        $this->authorizeReportAction('report.reorder.view');
        $filters = $req->validate([
            'supplier_id' => 'required|integer|exists:suppliers,id',
            'brand_id' => 'sometimes|integer|exists:brands,id',
        ]);

        $rows = Product::with(['brand:id,name', 'supplier:id,name', 'category:id,name'])
            ->whereNotNull('quantity')
            ->where('pack_size', '>', 0)
            ->whereColumn('quantity', '<', 'pack_size')
            ->when($filters['supplier_id'] ?? null, fn($q, $id) => $q->where('supplier_id', $id))
            ->when($filters['brand_id'] ?? null, fn($q, $id) => $q->where('brand_id', $id))
            ->orderByRaw('quantity / NULLIF(pack_size, 0) ASC')
            ->orderBy('name')
            ->get()
            ->map(fn($product) => [
                'id' => $product->id,
                'product_code' => $product->product_code,
                'name' => $product->name,
                'category_name' => $product->category->name ?? null,
                'brand_name' => $product->brand->name ?? null,
                'supplier_name' => $product->supplier->name ?? null,
                'quantity' => (int) $product->quantity,
                'pack_size' => (int) $product->pack_size,
                'suggested_reorder_quantity' => max((int) $product->pack_size - (int) $product->quantity, 0),
                'unit_purchase_price' => (float) $product->unit_purchase_price,
                'estimated_reorder_value' => round(max((int) $product->pack_size - (int) $product->quantity, 0) * (float) $product->unit_purchase_price, 2),
            ])->values();

        return response()->json([
            'rows' => $rows,
            'summary' => [
                'product_count' => $rows->count(),
                'total_quantity' => $rows->sum('quantity'),
                'suggested_quantity' => $rows->sum('suggested_reorder_quantity'),
                'estimated_reorder_value' => round($rows->sum('estimated_reorder_value'), 2),
            ],
            'threshold' => 'On-hand quantity below one pack (product pack size)',
        ]);
    }

    /**
     * GET /api/reports/cost-of-sale?from=YYYY-MM-DD&to=YYYY-MM-DD&invoice_type=credit|debit|all
     * Returns rows: sale_date, gross_sale, item_discount, discount_amount, tax_amount,
     * total_sales, sale_return, cost_of_sales
     *
     * Frontend then derives:
     * gp_amount  = net_sale - cost_of_sales
     * gp_pct     = (gp_amount / net_sale) * 100
     */
    public function costOfSale(Request $req)
    {
        $this->authorize('view', CostOfSaleReport::class);
        try {
            $from = $req->query('from');
            $to   = $req->query('to');
            $invoiceType = $req->query('invoice_type', 'all'); // all, credit, or debit

            // Defaults: current month
            $fromDate = $from ? Carbon::parse($from)->startOfDay() : Carbon::now()->startOfMonth();
            $toDate   = $to   ? Carbon::parse($to)->endOfDay()   : Carbon::now()->endOfDay();
            if ($fromDate->gt($toDate)) {
                [$fromDate, $toDate] = [$toDate->copy()->startOfDay(), $fromDate->copy()->endOfDay()];
            }

            // Bind date-only strings: `date` columns store YYYY-MM-DD, and a
            // datetime bound (e.g. '2026-10-08 00:00:00') sorts AFTER '2026-10-08'
            // on SQLite, which silently drops the first day of the range.
            $fromDateStr = $fromDate->toDateString();
            $toDateStr   = $toDate->toDateString();

            // Validate invoice_type
            $validInvoiceTypes = ['all', 'credit', 'debit'];
            if (!in_array($invoiceType, $validInvoiceTypes)) {
                $invoiceType = 'all';
            }

            $hasStatusCol = \Illuminate\Support\Facades\Schema::hasColumn('sale_invoices', 'status');

            // Build base query for sale_invoices
            $saleQuery = DB::table('sale_invoices as si')
                ->whereBetween('si.date', [$fromDateStr, $toDateStr]);
            if ($hasStatusCol) {
                $saleQuery->where(fn ($q) => $q->whereNull('si.status')->orWhere('si.status', '!=', 'reversed'));
            }

            // Apply invoice_type filter if not 'all'
            if ($invoiceType !== 'all') {
                $saleQuery->where('si.invoice_type', $invoiceType);
            }

            // ===== Sales header sums (per day) =====
            // sale_invoices has: date, gross_amount, item_discount, discount_amount, tax_amount, total
            $sales = $saleQuery
                ->selectRaw('DATE(si.date) as sale_date')
                ->selectRaw('SUM(COALESCE(si.gross_amount, 0))      as gross_sale')
                ->selectRaw('SUM(COALESCE(si.item_discount, 0))     as item_discount')
                ->selectRaw('SUM(COALESCE(si.discount_amount, 0))   as discount_amount')
                ->selectRaw('SUM(COALESCE(si.tax_amount, 0))        as tax_amount')
                ->selectRaw('SUM(COALESCE(si.total, 0))             as total_sales')
                ->groupBy('sale_date')
                ->get()
                ->keyBy('sale_date');

            // ===== Sale returns header sums (per day) =====
            // sale_returns has: date, total (also gross_total but we need total for NetSale)
            $returnsQuery = DB::table('sale_returns as sr')
                ->leftJoin('sale_invoices as rsi', 'rsi.id', '=', 'sr.sale_invoice_id')
                ->whereBetween('sr.date', [$fromDateStr, $toDateStr]);
            if ($invoiceType !== 'all') {
                $returnsQuery->where(function ($q) use ($invoiceType) {
                    $q->where('rsi.invoice_type', $invoiceType);
                    if ($invoiceType === 'debit') {
                        $q->orWhereNull('sr.sale_invoice_id');
                    }
                });
            }
            $returns = $returnsQuery
                ->selectRaw('DATE(sr.date) as sale_date')
                ->selectRaw('SUM(COALESCE(sr.total, 0)) as sale_return')
                ->groupBy('sale_date')
                ->get()
                ->keyBy('sale_date');

            // Build base query for COGS (sale_invoice_items joined with sale_invoices)
            $cogsQuery = DB::table('sale_invoice_items as sii')
                ->join('sale_invoices as si', 'si.id', '=', 'sii.sale_invoice_id')
                ->join('products as p', 'p.id', '=', 'sii.product_id')
                ->whereBetween('si.date', [$fromDateStr, $toDateStr]);
            if ($hasStatusCol) {
                $cogsQuery->where(fn ($q) => $q->whereNull('si.status')->orWhere('si.status', '!=', 'reversed'));
            }

            // Apply invoice_type filter if not 'all'
            if ($invoiceType !== 'all') {
                $cogsQuery->where('si.invoice_type', $invoiceType);
            }

            // ===== COGS on sales (per day) =====
            // Calculate cost using products.avg_price * (sale_invoice_items.quantity + bonus)
            // Fallback to unit_purchase_price if avg_price is 0 or NULL
            // Note: We use (quantity + bonus) * cost_price (not sub_total) because cost remains the same regardless of discounts/bonuses
            $hasBonusCol = \Illuminate\Support\Facades\Schema::hasColumn('sale_invoice_items', 'bonus');
            $saleUnitsExpr = $hasBonusCol
                ? '(COALESCE(sii.quantity, 0) + COALESCE(sii.bonus, 0))'
                : 'COALESCE(sii.quantity, 0)';
            $cogsSales = $cogsQuery
                ->selectRaw('DATE(si.date) as sale_date')
                ->selectRaw("SUM({$saleUnitsExpr} * COALESCE(sii.cost_price_snapshot, CASE WHEN p.avg_price IS NULL OR p.avg_price = 0 THEN COALESCE(p.unit_purchase_price, 0) ELSE p.avg_price END)) as cogs_sales")
                ->selectRaw('SUM(CASE WHEN sii.cost_price_snapshot IS NULL THEN 1 ELSE 0 END) as estimated_items')
                ->groupBy('sale_date')
                ->get()
                ->keyBy('sale_date');

            // ===== COGS reversed on returns (per day) =====
            $cogsReturnsQuery = DB::table('sale_return_items as sri')
                ->join('sale_returns as sr', 'sr.id', '=', 'sri.sale_return_id')
                ->leftJoin('sale_invoices as rsi', 'rsi.id', '=', 'sr.sale_invoice_id')
                ->join('products as p', 'p.id', '=', 'sri.product_id')
                ->whereBetween('sr.date', [$fromDateStr, $toDateStr]);
            if ($invoiceType !== 'all') {
                $cogsReturnsQuery->where(function ($q) use ($invoiceType) {
                    $q->where('rsi.invoice_type', $invoiceType);
                    if ($invoiceType === 'debit') {
                        $q->orWhereNull('sr.sale_invoice_id');
                    }
                });
            }
            $cogsReturns = $cogsReturnsQuery
                ->selectRaw('DATE(sr.date) as sale_date')
                ->selectRaw('SUM(COALESCE(sri.unit_return_quantity, 0) * COALESCE(sri.cost_price_snapshot, CASE WHEN p.avg_price IS NULL OR p.avg_price = 0 THEN COALESCE(p.unit_purchase_price, 0) ELSE p.avg_price END)) as cogs_returns')
                ->selectRaw('SUM(CASE WHEN sri.cost_price_snapshot IS NULL THEN 1 ELSE 0 END) as estimated_items')
                ->groupBy('sale_date')
                ->get()
                ->keyBy('sale_date');

            // ===== Merge all days =====
            $allDates = collect(array_unique(array_merge(
                $sales->keys()->all(),
                $returns->keys()->all(),
                $cogsSales->keys()->all(),
                $cogsReturns->keys()->all(),
            )))->sort();

            $rows = [];
            foreach ($allDates as $d) {
                $s  = $sales->get($d);
                $r  = $returns->get($d);
                $cs = $cogsSales->get($d);
                $cr = $cogsReturns->get($d);

                $rows[] = [
                    'sale_date'       => $d,
                    'cost_is_estimated' => (($cs->estimated_items ?? 0) + ($cr->estimated_items ?? 0)) > 0,
                    'gross_sale'      => round(($s->gross_sale ?? 0), 2),
                    'item_discount'   => round(($s->item_discount ?? 0), 2),
                    'discount_amount' => round(($s->discount_amount ?? 0), 2),  // Flat discount
                    'tax_amount'      => round(($s->tax_amount ?? 0), 2),
                    'total_sales'     => round(($s->total_sales ?? 0), 2),
                    'sale_return'     => round(($r->sale_return ?? 0), 2),
                    // Cost of Sales = cost on sales - cost reversed by returns
                    'cost_of_sales'   => round((($cs->cogs_sales ?? 0) - ($cr->cogs_returns ?? 0)), 2),
                ];
            }

            return response()->json($rows);
        } catch (\Throwable $e) {
            // Helpful error for debugging in dev
            return response()->json([
                'message' => 'Failed to build Cost of Sale report',
                'error'   => $e->getMessage(),
                'trace'   => config('app.debug') ? $e->getTrace() : null,
            ], 500);
        }
    }

    public function costOfSalePdf(Request $req)
    {
        $this->authorize('export', CostOfSaleReport::class);

        $response = $this->costOfSale($req);
        if ($response->getStatusCode() >= 400) {
            return $response;
        }

        $rows = collect($response->getData(true))->map(function ($row) {
            $row['net_sale'] = round($row['total_sales'] - $row['sale_return'], 2);
            $row['gp_amount'] = round($row['net_sale'] - $row['cost_of_sales'], 2);
            $row['gp_pct'] = $row['net_sale'] > 0 ? ($row['gp_amount'] / $row['net_sale']) * 100 : 0;
            return $row;
        });

        $totals = [
            'gross_sale' => round($rows->sum('gross_sale'), 2),
            'item_discount' => round($rows->sum('item_discount'), 2),
            'discount_amount' => round($rows->sum('discount_amount'), 2),
            'tax_amount' => round($rows->sum('tax_amount'), 2),
            'total_sales' => round($rows->sum('total_sales'), 2),
            'sale_return' => round($rows->sum('sale_return'), 2),
            'net_sale' => round($rows->sum('net_sale'), 2),
            'cost_of_sales' => round($rows->sum('cost_of_sales'), 2),
            'gp_amount' => round($rows->sum('gp_amount'), 2),
        ];
        $totals['gp_pct'] = $totals['net_sale'] > 0
            ? ($totals['gp_amount'] / $totals['net_sale']) * 100
            : 0;

        return Pdf::loadView('reports.cost_of_sale_pdf', [
            'rows' => $rows,
            'totals' => $totals,
            'from' => $req->query('from', Carbon::now()->startOfMonth()->toDateString()),
            'to' => $req->query('to', Carbon::now()->toDateString()),
            'invoiceType' => $req->query('invoice_type', 'all'),
        ])->setPaper('a4', 'landscape')->stream('cost-of-sale-report.pdf');
    }

    /**
     * GET /api/reports/cost-of-sale-detail
     * Returns detailed cost of sale report for single invoice or multiple invoices by customer
     * 
     * Query params:
     * - invoice_id: specific invoice ID (optional)
     * - customer_id: filter by customer (optional)
     * - from: start date (optional)
     * - to: end date (optional)
     */
    public function costOfSaleDetail(Request $req)
    {
        $this->authorizeReportAction('report.cost-of-sale-detail.view');
        
        try {
            $invoiceId = $req->query('invoice_id');
            $customerId = $req->query('customer_id');
            $from = $req->query('from');
            $to = $req->query('to');

            // Build base query for sale invoices
            $query = SaleInvoice::with(['customer', 'user', 'items.product']);
            if (\Illuminate\Support\Facades\Schema::hasColumn('sale_invoices', 'status')) {
                $query->where(fn ($q) => $q->whereNull('status')->orWhere('status', '!=', 'reversed'));
            }

            // Filter by specific invoice
            if ($invoiceId) {
                $query->where('id', $invoiceId);
            }

            // Filter by customer
            if ($customerId) {
                $query->where('customer_id', $customerId);
            }

            // Filter by date range
            if ($from) {
                $query->where('date', '>=', Carbon::parse($from)->toDateString());
            }
            if ($to) {
                $query->where('date', '<=', Carbon::parse($to)->toDateString());
            }

            $invoices = $query->orderBy('date', 'desc')->orderBy('id', 'desc')->get();

            // Process each invoice to add cost and profit details
            $rows = $invoices->map(function ($invoice) {
                $items = $invoice->items->map(function ($item) {
                    // Get cost price - use avg_price or fallback to unit_purchase_price
                    $costPrice = $item->cost_price_snapshot;
                    if ($costPrice === null) {
                        $costPrice = $item->product->avg_price ?? 0;
                        if ($costPrice == 0) {
                            $costPrice = $item->product->unit_purchase_price ?? 0;
                        }
                    }
                    
                    $quantity = $item->quantity ?? 0;
                    $bonus = (int) ($item->bonus ?? 0);
                    $salePrice = $item->price ?? 0;
                    // Use sub_total (actual sale amount after item-level discounts) instead of quantity * price
                    // Include bonus units in COGS since bonus units leave inventory at zero revenue
                    $totalCost = ($quantity + $bonus) * $costPrice;
                    $totalSale = $item->sub_total ?? 0;
                    $profit = $totalSale - $totalCost;

                    return [
                        'id' => $item->id,
                        'product_id' => $item->product_id,
                        'product_code' => $item->product->product_code ?? null,
                        'product_name' => $item->product->name ?? null,
                        'pack_size' => $item->pack_size ?? 0,
                        'quantity' => $quantity,
                        'bonus' => $bonus,
                        'cost_price' => round($costPrice, 2),
                        'cost_is_estimated' => $item->cost_price_snapshot === null,
                        'sale_price' => round($salePrice, 2),
                        'item_discount_percentage' => round($item->item_discount_percentage ?? 0, 2),
                        'total_cost' => round($totalCost, 2),
                        'total_sale' => round($totalSale, 2),
                        'profit' => round($profit, 2),
                        'batch_number' => $item->batch_number,
                        'expiry' => $item->expiry,
                    ];
                });

                // Calculate invoice totals
                // Use invoice total which already has all discounts and taxes applied
                $totalCost = $items->sum('total_cost');
                $totalSale = $invoice->total ?? 0; // Invoice total includes all discounts and taxes
                $profit = $totalSale - $totalCost;
                $profitMargin = $totalSale > 0 ? round(($profit / $totalSale) * 100, 2) : 0;

                return [
                    'invoice_id' => $invoice->id,
                    'posted_number' => $invoice->posted_number,
                    'date' => $invoice->date instanceof \Carbon\Carbon ? $invoice->date->format('Y-m-d') : $invoice->date,
                    'customer_name' => $invoice->customer->name ?? 'N/A',
                    'invoice_type' => $invoice->invoice_type ?? 'debit',
                    'sale_type' => $invoice->sale_type ?? 'retail',
                    'gross_amount' => round($invoice->gross_amount ?? 0, 2),
                    'discount_percentage' => round($invoice->discount_percentage ?? 0, 2),
                    'discount_amount' => round($invoice->discount_amount ?? 0, 2),
                    'tax_percentage' => round($invoice->tax_percentage ?? 0, 2),
                    'tax_amount' => round($invoice->tax_amount ?? 0, 2),
                    'total' => round($invoice->total ?? 0, 2),
                    'total_cost' => round($totalCost, 2),
                    'total_sale' => round($totalSale, 2),
                    'profit' => round($profit, 2),
                    'profit_margin' => $profitMargin,
                    'cost_is_estimated' => $invoice->items->contains(fn ($item) => $item->cost_price_snapshot === null),
                    'items' => $items,
                ];
            });

            // Calculate summary for all invoices
            $summary = [
                'total_invoices' => $rows->count(),
                'total_sales' => round($rows->sum('total_sale'), 2),
                'total_cost' => round($rows->sum('total_cost'), 2),
                'total_profit' => round($rows->sum('profit'), 2),
                'total_items' => $rows->sum(fn($r) => count($r['items'])),
            ];
            $summary['profit_margin'] = $summary['total_sales'] > 0 
                ? round(($summary['total_profit'] / $summary['total_sales']) * 100, 2) 
                : 0;

            return response()->json([
                'invoices' => $rows,
                'summary' => $summary,
            ]);
        } catch (\Throwable $e) {
            return response()->json([
                'message' => 'Failed to build Cost of Sale Detail report',
                'error'   => $e->getMessage(),
                'trace'   => config('app.debug') ? $e->getTrace() : null,
            ], 500);
        }
    }

    /**
     * GET /api/reports/cost-of-sale-detail/pdf
     * Returns PDF of cost of sale detail report
     */
    public function costOfSaleDetailPdf(Request $req)
    {
        $this->authorizeReportAction('report.cost-of-sale-detail.export');
        
        $invoiceId = $req->query('invoice_id');
        $from = $req->query('from');
        $to = $req->query('to');

        // Build query
        $query = SaleInvoice::with(['customer', 'items.product']);
        if (\Illuminate\Support\Facades\Schema::hasColumn('sale_invoices', 'status')) {
            $query->where(fn ($q) => $q->whereNull('status')->orWhere('status', '!=', 'reversed'));
        }

        if ($invoiceId) {
            $query->where('id', $invoiceId);
        }
        if ($from) {
            $query->where('date', '>=', Carbon::parse($from)->toDateString());
        }
        if ($to) {
            $query->where('date', '<=', Carbon::parse($to)->toDateString());
        }

        $invoices = $query->orderBy('date', 'desc')->orderBy('id', 'desc')->get();

        // Process invoices - ensure all values are properly formatted for PDF
        $rows = [];
        foreach ($invoices as $invoice) {
            $items = [];
            foreach ($invoice->items as $item) {
                $costPrice = $item->cost_price_snapshot;
                if ($costPrice === null) {
                    $costPrice = (float) ($item->product->avg_price ?? 0);
                    if ($costPrice == 0) {
                        $costPrice = (float) ($item->product->unit_purchase_price ?? 0);
                    }
                }
                
                $quantity = (int) ($item->quantity ?? 0);
                $bonus = (int) ($item->bonus ?? 0);
                $salePrice = (float) ($item->price ?? 0);
                // Use sub_total (actual sale amount after item-level discounts) instead of quantity * price
                $totalCost = ($quantity + $bonus) * $costPrice;
                $totalSale = (float) ($item->sub_total ?? 0);
                $profit = $totalSale - $totalCost;

                $items[] = [
                    'product_code' => (string) ($item->product->product_code ?? ''),
                    'product_name' => (string) ($item->product->name ?? ''),
                    'pack_size' => (int) ($item->pack_size ?? 0),
                    'quantity' => (int) $quantity,
                    'bonus' => (int) $bonus,
                    'cost_price' => round($costPrice, 2),
                    'cost_is_estimated' => $item->cost_price_snapshot === null,
                    'sale_price' => round($salePrice, 2),
                    'item_discount_percentage' => round($item->item_discount_percentage ?? 0, 2),
                    'total_cost' => round($totalCost, 2),
                    'total_sale' => round($totalSale, 2),
                    'profit' => round($profit, 2),
                ];
            }

            $totalCost = array_sum(array_column($items, 'total_cost'));
            // Use invoice total which already has all discounts and taxes applied
            $totalSale = (float) ($invoice->total ?? 0);
            $profit = $totalSale - $totalCost;
            $profitMargin = $totalSale > 0 ? round(($profit / $totalSale) * 100, 2) : 0;

            $rows[] = [
                'invoice_id' => (int) $invoice->id,
                'posted_number' => (string) ($invoice->posted_number ?? ''),
                'date' => $invoice->date instanceof \Carbon\Carbon ? $invoice->date->format('Y-m-d') : date('Y-m-d', strtotime($invoice->date ?? 'now')),
                'customer_name' => (string) ($invoice->customer->name ?? 'WALK-IN-CUSTOMER'),
                'invoice_type' => (string) ($invoice->invoice_type ?? 'debit'),
                'sale_type' => (string) ($invoice->sale_type ?? 'retail'),
                'gross_amount' => round((float) ($invoice->gross_amount ?? 0), 2),
                'discount_percentage' => round((float) ($invoice->discount_percentage ?? 0), 2),
                'discount_amount' => round((float) ($invoice->discount_amount ?? 0), 2),
                'tax_percentage' => round((float) ($invoice->tax_percentage ?? 0), 2),
                'tax_amount' => round((float) ($invoice->tax_amount ?? 0), 2),
                'total' => round((float) ($invoice->total ?? 0), 2),
                'total_cost' => round($totalCost, 2),
                'total_sale' => round($totalSale, 2),
                'profit' => round($profit, 2),
                'profit_margin' => $profitMargin,
                'cost_is_estimated' => $invoice->items->contains(fn ($item) => $item->cost_price_snapshot === null),
                'items' => $items,
            ];
        }

        $summary = [
            'total_invoices' => count($rows),
            'total_sales' => round(array_sum(array_column($rows, 'total_sale')), 2),
            'total_cost' => round(array_sum(array_column($rows, 'total_cost')), 2),
            'total_profit' => round(array_sum(array_column($rows, 'profit')), 2),
        ];
        $summary['profit_margin'] = $summary['total_sales'] > 0 
            ? round(($summary['total_profit'] / $summary['total_sales']) * 100, 2) 
            : 0;

        $meta = [
            'from' => $from,
            'to' => $to,
            'invoice_id' => $invoiceId,
            'generatedAt' => now()->format('Y-m-d H:i'),
        ];

        try {
            $pdf = Pdf::loadView('reports.cost_of_sale_detail_pdf', [
                'rows' => $rows,
                'summary' => $summary,
                'meta' => $meta,
            ])->setPaper('a4', 'landscape');

            $filename = 'cost-of-sale-detail-' . ($invoiceId ? 'invoice-' . $invoiceId : 'report') . '.pdf';
            return $pdf->stream($filename);
        } catch (\Throwable $e) {
            return response()->json([
                'message' => 'Failed to generate PDF',
                'error' => $e->getMessage(),
                'trace' => config('app.debug') ? $e->getTrace() : null,
            ], 500);
        }
    }

    public function purchaseDetail(Request $req)
    {
        $this->authorize('view', PurchaseDetailReport::class);
        $from = $req->query('from');
        $to   = $req->query('to');
        $supplierId = $req->query('supplier_id');
        $productId  = $req->query('product_id');

        // Defaults to current month if not provided
        try { $fromDate = $from ? Carbon::parse($from)->startOfDay() : Carbon::now()->startOfMonth(); }
        catch (\Throwable $e) { $fromDate = Carbon::now()->startOfMonth(); }
        try { $toDate = $to ? Carbon::parse($to)->endOfDay() : Carbon::now()->endOfDay(); }
        catch (\Throwable $e) { $toDate = Carbon::now()->endOfDay(); }
        if ($fromDate->gt($toDate)) {
            [$fromDate, $toDate] = [$toDate->copy()->startOfDay(), $fromDate->copy()->endOfDay()];
        }

        $invoices = PurchaseInvoice::with([
                'supplier:id,name',
                'items' => function ($q) use ($productId) {
                    if ($productId) $q->where('product_id', $productId);
                    $q->with('product:id,name')
                      ->select([
                          'id','purchase_invoice_id','product_id',
                          'batch','expiry',
                          'pack_quantity','pack_size','unit_quantity',
                          'pack_purchase_price','unit_purchase_price',
                          'pack_sale_price','unit_sale_price',
                          'pack_bonus','unit_bonus',
                          'item_discount_percentage','margin',
                          'sub_total','quantity',
                      ]);
                },
            ])
            // IMPORTANT: filter by posted_date (not date)
            ->whereBetween('posted_date', [$fromDate, $toDate])
            ->where(fn ($q) => $q->whereNull('status')->orWhere('status', '!=', 'reversed'))
            ->when($supplierId, fn($q) => $q->where('supplier_id', $supplierId))
            // If product filter is set, ensure we only include invoices that have that product
            ->when($productId, fn($q) => $q->whereHas('items', fn($iq) => $iq->where('product_id', $productId)))
            ->orderBy('posted_date', 'asc')
            ->orderBy('id', 'asc')
            ->get();

        $rows = $invoices->map(function ($inv) {
            return [
                'id'             => $inv->id,
                'supplier_id'    => $inv->supplier_id,
                'supplier_name'  => $inv->supplier->name ?? null,
                'posted_number'  => $inv->posted_number ?? null,
                'invoice_number' => $inv->invoice_number ?? null,
                'invoice_date'   => optional($inv->posted_date)->format('Y-m-d')
                                   ?? (is_string($inv->posted_date) ? substr($inv->posted_date,0,10) : null),

                // Footer (header) fields from PurchaseInvoice
                'tax_percentage'      => (float)($inv->tax_percentage ?? 0),
                'tax_amount'          => (float)($inv->tax_amount ?? 0),
                'discount_percentage' => (float)($inv->discount_percentage ?? 0),
                'discount_amount'     => (float)($inv->discount_amount ?? 0),
                'total_amount'        => (float)($inv->total_amount ?? ($inv->total ?? 0)),

                // Items
                'items' => ($inv->items ?? collect())->map(function ($it) {
                    return [
                        'id'                        => $it->id,
                        'product_id'                => $it->product_id,
                        'product_name'              => $it->product->name ?? null,
                        'batch'                     => $it->batch,
                        'expiry'                    => $it->expiry,
                        'pack_quantity'             => (int)($it->pack_quantity ?? 0),
                        'pack_size'                 => (int)($it->pack_size ?? 0),
                        'unit_quantity'             => (int)($it->unit_quantity ?? 0),
                        'pack_purchase_price'       => (float)($it->pack_purchase_price ?? 0),
                        'unit_purchase_price'       => (float)($it->unit_purchase_price ?? 0),
                        'pack_sale_price'           => (float)($it->pack_sale_price ?? 0),
                        'unit_sale_price'           => (float)($it->unit_sale_price ?? 0),
                        'pack_bonus'                => (int)($it->pack_bonus ?? 0),
                        'unit_bonus'                => (int)($it->unit_bonus ?? 0),
                        'item_discount_percentage'  => (float)($it->item_discount_percentage ?? 0),
                        'margin'                    => (float)($it->margin ?? 0),
                        'sub_total'                 => (float)($it->sub_total ?? 0),
                        'quantity'                  => (int)($it->quantity ?? 0),
                    ];
                })->values(),
            ];
        })->values();

        return response()->json($rows);
    }
    private function buildPurchaseDetailRows($from, $to, $supplierId, $productId)
    {
        try { $fromDate = $from ? Carbon::parse($from)->startOfDay() : Carbon::now()->startOfMonth(); }
        catch (\Throwable $e) { $fromDate = Carbon::now()->startOfMonth(); }
        try { $toDate = $to ? Carbon::parse($to)->endOfDay() : Carbon::now()->endOfDay(); }
        catch (\Throwable $e) { $toDate = Carbon::now()->endOfDay(); }
        if ($fromDate->gt($toDate)) {
            [$fromDate, $toDate] = [$toDate->copy()->startOfDay(), $fromDate->copy()->endOfDay()];
        }

        $invoices = PurchaseInvoice::with([
                'supplier:id,name',
                'items' => function ($q) use ($productId) {
                    if ($productId) $q->where('product_id', $productId);
                    $q->with('product:id,name')
                      ->select([
                          'id','purchase_invoice_id','product_id',
                          'batch','expiry',
                          'pack_quantity','pack_size','unit_quantity',
                          'pack_purchase_price','unit_purchase_price',
                          'pack_sale_price','unit_sale_price',
                          'pack_bonus','unit_bonus',
                          'item_discount_percentage','margin',
                          'sub_total','quantity',
                      ]);
                },
            ])
            ->whereBetween('posted_date', [$fromDate, $toDate])
            ->where(fn ($q) => $q->whereNull('status')->orWhere('status', '!=', 'reversed'))
            ->when($supplierId, fn($q) => $q->where('supplier_id', $supplierId))
            ->when($productId, fn($q) => $q->whereHas('items', fn($iq) => $iq->where('product_id', $productId)))
            ->orderBy('posted_date', 'asc')
            ->orderBy('id', 'asc')
            ->get();

        return $invoices->map(function ($inv) {
            return [
                'id'                 => $inv->id,
                'supplier_name'      => $inv->supplier->name ?? null,
                'posted_number'      => $inv->posted_number ?? null,
                'invoice_number'     => $inv->invoice_number ?? null,
                'invoice_date'       => optional($inv->posted_date)->format('Y-m-d')
                                        ?? (is_string($inv->posted_date) ? substr($inv->posted_date,0,10) : null),
                'tax_percentage'      => (float)($inv->tax_percentage ?? 0),
                'tax_amount'          => (float)($inv->tax_amount ?? 0),
                'discount_percentage' => (float)($inv->discount_percentage ?? 0),
                'discount_amount'     => (float)($inv->discount_amount ?? 0),
                'total_amount'        => (float)($inv->total_amount ?? ($inv->total ?? 0)),
                'items' => ($inv->items ?? collect())->map(function ($it) {
                    return [
                        'product_name'             => $it->product->name ?? null,
                        'batch'                    => $it->batch,
                        'expiry'                   => $it->expiry,
                        'pack_quantity'            => (int)($it->pack_quantity ?? 0),
                        'pack_size'                => (int)($it->pack_size ?? 0),
                        'unit_quantity'            => (int)($it->unit_quantity ?? 0),
                        'pack_purchase_price'      => (float)($it->pack_purchase_price ?? 0),
                        'unit_purchase_price'      => (float)($it->unit_purchase_price ?? 0),
                        'pack_sale_price'          => (float)($it->pack_sale_price ?? 0),
                        'unit_sale_price'          => (float)($it->unit_sale_price ?? 0),
                        'pack_bonus'               => (int)($it->pack_bonus ?? 0),
                        'unit_bonus'               => (int)($it->unit_bonus ?? 0),
                        'item_discount_percentage' => (float)($it->item_discount_percentage ?? 0),
                        'margin'                   => (float)($it->margin ?? 0),
                        'sub_total'                => (float)($it->sub_total ?? 0),
                        'quantity'                 => (int)($it->quantity ?? 0),
                    ];
                })->values(),
            ];
        })->values();
    }

    /** GET /api/reports/purchase-detail/pdf */
    public function purchaseDetailPdf(Request $req)
    {
        $this->authorize('export', PurchaseDetailReport::class);
        $rows = $this->buildPurchaseDetailRows(
            $req->query('from'),
            $req->query('to'),
            $req->query('supplier_id'),
            $req->query('product_id'),
        );

        $meta = [
            'from'        => $req->query('from'),
            'to'          => $req->query('to'),
            'generatedAt' => now()->format('Y-m-d H:i'),
        ];

        $pdf = Pdf::loadView('reports.purchase_detail_pdf', [
            'rows' => $rows,
            'meta' => $meta,
        ])->setPaper('a4', 'landscape'); // wide tables fit better

        $filename = 'purchase-detail-' . ($meta['from'] ?: 'start') . '-to-' . ($meta['to'] ?: 'today') . '.pdf';
        return $pdf->stream($filename); // 'inline' disposition -> opens in new tab
    }

    /** GET /api/reports/sale-detail */
    public function saleDetail(Request $req)
    {
        $this->authorize('view', SaleDetailReport::class); 
        $from = $req->query('from');
        $to   = $req->query('to');
        $customerId = $req->query('customer_id');
        $productId  = $req->query('product_id');

        try { $fromDate = $from ? Carbon::parse($from)->startOfDay() : Carbon::now()->startOfMonth(); }
        catch (\Throwable $e) { $fromDate = Carbon::now()->startOfMonth(); }
        try { $toDate = $to ? Carbon::parse($to)->endOfDay() : Carbon::now()->endOfDay(); }
        catch (\Throwable $e) { $toDate = Carbon::now()->endOfDay(); }
        if ($fromDate->gt($toDate)) {
            [$fromDate, $toDate] = [$toDate->copy()->startOfDay(), $fromDate->copy()->endOfDay()];
        }

        $invoices = SaleInvoice::with([
                'customer:id,name',
                'user:id,name',
                'items' => function ($q) use ($productId) {
                    if ($productId) $q->where('product_id', $productId);
                    $cols = [
                        'id','sale_invoice_id','product_id',
                        'pack_size','batch_number','expiry',
                        'current_quantity','quantity','price',
                        'item_discount_percentage','sub_total',
                    ];
                    foreach (['pack_quantity', 'unit_quantity', 'bonus', 'pack_price'] as $col) {
                        if (\Illuminate\Support\Facades\Schema::hasColumn('sale_invoice_items', $col)) {
                            $cols[] = $col;
                        }
                    }
                    $q->with('product:id,name')->select($cols);
                },
            ])
            // Sales filter by `date`
            ->whereBetween('date', [$fromDate, $toDate])
            ->where(fn ($q) => $q->whereNull('status')->orWhere('status', '!=', 'reversed'))
            ->when($customerId, fn($q) => $q->where('customer_id', $customerId))
            ->when($productId, fn($q) => $q->whereHas('items', fn($iq) => $iq->where('product_id', $productId)))
            ->orderBy('date', 'asc')
            ->orderBy('id', 'asc')
            ->get();

        $rows = $invoices->map(function ($inv) {
            return [
                'id'             => $inv->id,
                'posted_number'  => $inv->posted_number ?? null,
                'invoice_date'   => optional($inv->date)->format('Y-m-d')
                                    ?? (is_string($inv->date) ? substr($inv->date,0,10) : null),
                'customer_name'  => $inv->customer->name ?? null,
                'user_name'      => $inv->user->name ?? null,
                'doctor_name'    => $inv->doctor_name ?? null,
                'patient_name'   => $inv->patient_name ?? null,
                'sale_type'      => $inv->sale_type ?? 'retail',

                // Footer (header totals on SaleInvoice)
                'discount_percentage' => (float)($inv->discount_percentage ?? 0),
                'discount_amount'     => (float)($inv->discount_amount ?? 0),
                'tax_percentage'      => (float)($inv->tax_percentage ?? 0),
                'tax_amount'          => (float)($inv->tax_amount ?? 0),
                'item_discount'       => (float)($inv->item_discount ?? 0),
                'gross_amount'        => (float)($inv->gross_amount ?? 0),
                'total'               => (float)($inv->total ?? 0),

                // Items
                'items' => ($inv->items ?? collect())->map(function ($it) {
                    return [
                        'id'                        => $it->id,
                        'product_id'                => $it->product_id,
                        'product_name'              => $it->product->name ?? null,
                        'pack_size'                 => (int)($it->pack_size ?? 0),
                        'batch_number'              => $it->batch_number,
                        'expiry'                    => $it->expiry,
                        'current_quantity'          => (int)($it->current_quantity ?? 0),
                        'pack_quantity'             => (float)($it->pack_quantity ?? 0),
                        'unit_quantity'             => (int)($it->unit_quantity ?? 0),
                        'quantity'                  => (int)($it->quantity ?? 0),
                        'bonus'                     => (int)($it->bonus ?? 0),
                        'price'                     => (float)($it->price ?? 0),
                        'item_discount_percentage'  => (float)($it->item_discount_percentage ?? 0),
                        'sub_total'                 => (float)($it->sub_total ?? 0),
                    ];
                })->values(),
            ];
        })->values();

        return response()->json($rows);
    }

    private function buildSaleDetailRows($from, $to, $customerId, $productId)
    {
        try { $fromDate = $from ? Carbon::parse($from)->startOfDay() : Carbon::now()->startOfMonth(); }
        catch (\Throwable $e) { $fromDate = Carbon::now()->startOfMonth(); }
        try { $toDate = $to ? Carbon::parse($to)->endOfDay() : Carbon::now()->endOfDay(); }
        catch (\Throwable $e) { $toDate = Carbon::now()->endOfDay(); }
        if ($fromDate->gt($toDate)) {
            [$fromDate, $toDate] = [$toDate->copy()->startOfDay(), $fromDate->copy()->endOfDay()];
        }

        $invoices = SaleInvoice::with([
                'customer:id,name',
                'user:id,name',
                'items' => function ($q) use ($productId) {
                    if ($productId) $q->where('product_id', $productId);
                    $cols = [
                        'id','sale_invoice_id','product_id',
                        'pack_size','batch_number','expiry',
                        'current_quantity','quantity','price',
                        'item_discount_percentage','sub_total',
                    ];
                    foreach (['pack_quantity', 'unit_quantity', 'bonus', 'pack_price'] as $col) {
                        if (\Illuminate\Support\Facades\Schema::hasColumn('sale_invoice_items', $col)) {
                            $cols[] = $col;
                        }
                    }
                    $q->with('product:id,name')->select($cols);
                },
            ])
            ->whereBetween('date', [$fromDate, $toDate])
            ->where(fn ($q) => $q->whereNull('status')->orWhere('status', '!=', 'reversed'))
            ->when($customerId, fn($q) => $q->where('customer_id', $customerId))
            ->when($productId, fn($q) => $q->whereHas('items', fn($iq) => $iq->where('product_id', $productId)))
            ->orderBy('date', 'asc')
            ->orderBy('id', 'asc')
            ->get();

        return $invoices->map(function ($inv) {
            return [
                'posted_number'       => $inv->posted_number ?? null,
                'invoice_date'        => optional($inv->date)->format('Y-m-d')
                                         ?? (is_string($inv->date) ? substr($inv->date,0,10) : null),
                'customer_name'       => $inv->customer->name ?? null,
                'user_name'           => $inv->user->name ?? null,
                'doctor_name'         => $inv->doctor_name ?? null,
                'patient_name'        => $inv->patient_name ?? null,
                'sale_type'           => $inv->sale_type ?? 'retail',
                'discount_percentage' => (float)($inv->discount_percentage ?? 0),
                'discount_amount'     => (float)($inv->discount_amount ?? 0),
                'tax_percentage'      => (float)($inv->tax_percentage ?? 0),
                'tax_amount'          => (float)($inv->tax_amount ?? 0),
                'item_discount'       => (float)($inv->item_discount ?? 0),
                'gross_amount'        => (float)($inv->gross_amount ?? 0),
                'total'               => (float)($inv->total ?? 0),
                'items' => ($inv->items ?? collect())->map(function ($it) {
                    return [
                        'product_name'             => $it->product->name ?? null,
                        'pack_size'                => (int)($it->pack_size ?? 0),
                        'batch_number'             => $it->batch_number,
                        'expiry'                   => $it->expiry,
                        'current_quantity'         => (int)($it->current_quantity ?? 0),
                        'pack_quantity'            => (float)($it->pack_quantity ?? 0),
                        'unit_quantity'            => (int)($it->unit_quantity ?? 0),
                        'quantity'                 => (int)($it->quantity ?? 0),
                        'bonus'                    => (int)($it->bonus ?? 0),
                        'price'                    => (float)($it->price ?? 0),
                        'item_discount_percentage' => (float)($it->item_discount_percentage ?? 0),
                        'sub_total'                => (float)($it->sub_total ?? 0),
                    ];
                })->values(),
            ];
        })->values();
    }

    /** GET /api/reports/sale-detail/pdf */
    public function saleDetailPdf(Request $req)
    {
        $this->authorize('export', SaleDetailReport::class);
        $rows = $this->buildSaleDetailRows(
            $req->query('from'),
            $req->query('to'),
            $req->query('customer_id'),
            $req->query('product_id'),
        );

        $meta = [
            'from'        => $req->query('from'),
            'to'          => $req->query('to'),
            'generatedAt' => now()->format('Y-m-d H:i'),
        ];

        $pdf = Pdf::loadView('reports.sale_detail_pdf', [
            'rows' => $rows,
            'meta' => $meta,
        ])->setPaper('a4', 'landscape');

        $filename = 'sale-detail-' . ($meta['from'] ?: 'start') . '-to-' . ($meta['to'] ?: 'today') . '.pdf';
        return $pdf->stream($filename);
    }

    /**
     * GET /api/reports/current-stock
     * Returns products with quantity > 0 (one row per product)
     * Includes: name, pack_size, quantity, pack_purchase_price, pack_sale_price
     * Also returns summary totals at the bottom
     */
    public function currentStock(Request $req)
    {
        $this->authorize('view', CurrentStockReport::class);

        $categoryId = $req->query('category_id');
        $brandId = $req->query('brand_id');
        $supplierId = $req->query('supplier_id');

        // Filter products with quantity > 0 directly in SQL using index
        $products = Product::with(['category:id,name', 'brand:id,name', 'supplier:id,name'])
            ->where('quantity', '>', 0)
            ->when($categoryId, fn($q) => $q->where('category_id', $categoryId))
            ->when($brandId, fn($q) => $q->where('brand_id', $brandId))
            ->when($supplierId, fn($q) => $q->where('supplier_id', $supplierId))
            ->orderBy('name', 'asc')
            ->get();

        // Transform data for frontend
        $rows = $products->map(function ($p) {
            $quantity = (int)($p->quantity ?? 0);
            $packSize = (int)($p->pack_size ?? 1);
            $packPurchasePrice = (float)($p->pack_purchase_price ?? 0);
            $packSalePrice = (float)($p->pack_sale_price ?? 0);
            $unitPurchasePrice = (float)($p->unit_purchase_price ?? 0);
            $unitSalePrice = (float)($p->unit_sale_price ?? 0);
            $avgPrice = (float)($p->avg_price ?? 0);
            $effectiveCost = $avgPrice > 0 ? $avgPrice : ($unitPurchasePrice > 0 ? $unitPurchasePrice : ($packSize > 0 ? ($packPurchasePrice / $packSize) : 0));

            // Calculate values
            $totalPurchaseValue = $quantity * $effectiveCost; // At average cost (with unit/pack cost fallback)
            $totalSaleValue = $quantity * $unitSalePrice; // At retail price

            return [
                'id'                    => $p->id,
                'product_code'          => $p->product_code,
                'name'                  => $p->name,
                'category_name'         => $p->category->name ?? null,
                'brand_name'            => $p->brand->name ?? null,
                'supplier_name'         => $p->supplier->name ?? null,
                'pack_size'             => $packSize,
                'quantity'              => $quantity,
                'pack_purchase_price'   => $packPurchasePrice,
                'pack_sale_price'       => $packSalePrice,
                'unit_purchase_price'   => $unitPurchasePrice,
                'unit_sale_price'       => $unitSalePrice,
                'avg_price'             => $avgPrice,
                'rack'                  => $p->rack ?? null,
                // Calculated values for summary
                'total_purchase_value'  => round($totalPurchaseValue, 2),
                'total_sale_value'      => round($totalSaleValue, 2),
            ];
        })->values();

        // Calculate summary totals
        $summary = [
            'total_items'           => $rows->count(),
            'total_quantity'        => $rows->sum('quantity'),
            'total_purchase_value'  => round($rows->sum('total_purchase_value'), 2),
            'total_sale_value'      => round($rows->sum('total_sale_value'), 2),
            'potential_profit'      => round($rows->sum('total_sale_value') - $rows->sum('total_purchase_value'), 2),
        ];

        return response()->json([
            'rows'    => $rows,
            'summary' => $summary,
        ]);
    }

    /**
     * GET /api/reports/current-stock/pdf
     */
    public function currentStockPdf(Request $req)
    {
        // Increase memory and execution time limits for large reports
        ini_set('memory_limit', '2048M');
        set_time_limit(300); // 5 minutes timeout

        $this->authorize('export', CurrentStockReport::class);

        $categoryId = $req->query('category_id');
        $brandId = $req->query('brand_id');
        $supplierId = $req->query('supplier_id');

        // Build query for products with quantity > 0 directly in SQL
        $query = Product::with(['category:id,name', 'brand:id,name', 'supplier:id,name'])
            ->where('quantity', '>', 0)
            ->when($categoryId, fn($q) => $q->where('category_id', $categoryId))
            ->when($brandId, fn($q) => $q->where('brand_id', $brandId))
            ->when($supplierId, fn($q) => $q->where('supplier_id', $supplierId))
            ->orderBy('name', 'asc');

        // Use chunking for large datasets to reduce memory usage
        // Only include products with quantity > 0
        $rows = [];
        $totalQuantity = 0;
        $totalPurchaseValue = 0;
        $totalSaleValue = 0;
        $itemCount = 0;

        $query->chunk(500, function ($products) use (&$rows, &$totalQuantity, &$totalPurchaseValue, &$totalSaleValue, &$itemCount) {
            foreach ($products as $p) {
                $quantity = (int)($p->quantity ?? 0);
                
                // Only include products with quantity > 0
                if ($quantity <= 0) continue;
                
                $packSize = (int)($p->pack_size ?? 1);
                $packPurchasePrice = (float)($p->pack_purchase_price ?? 0);
                $packSalePrice = (float)($p->pack_sale_price ?? 0);
                $unitPurchasePrice = (float)($p->unit_purchase_price ?? 0);
                $avgPrice = (float)($p->avg_price ?? 0);
                $unitSalePrice = (float)($p->unit_sale_price ?? 0);
                $effectiveCost = $avgPrice > 0 ? $avgPrice : ($unitPurchasePrice > 0 ? $unitPurchasePrice : ($packSize > 0 ? ($packPurchasePrice / $packSize) : 0));

                $rowTotalPurchase = round($quantity * $effectiveCost, 2);
                $rowTotalSale = round($quantity * $unitSalePrice, 2);

                $rows[] = [
                    'product_code'         => $p->product_code,
                    'name'                 => $p->name,
                    'pack_size'            => $packSize,
                    'quantity'             => $quantity,
                    'pack_purchase_price'  => $packPurchasePrice,
                    'pack_sale_price'      => $packSalePrice,
                    'avg_price'            => $avgPrice,
                    'total_purchase_value' => $rowTotalPurchase,
                    'total_sale_value'     => $rowTotalSale,
                ];

                $totalQuantity += $quantity;
                $totalPurchaseValue += $rowTotalPurchase;
                $totalSaleValue += $rowTotalSale;
                $itemCount++;
            }
        });

        $summary = [
            'total_items'          => $itemCount,
            'total_quantity'       => $totalQuantity,
            'total_purchase_value' => round($totalPurchaseValue, 2),
            'total_sale_value'     => round($totalSaleValue, 2),
            'potential_profit'     => round($totalSaleValue - $totalPurchaseValue, 2),
        ];

        $meta = [
            'generatedAt' => now()->format('Y-m-d H:i'),
            'category_id' => $categoryId,
            'brand_id'    => $brandId,
            'supplier_id' => $supplierId,
        ];

        $pdf = Pdf::loadView('reports.current_stock_pdf', [
            'rows'    => $rows,
            'summary' => $summary,
            'meta'    => $meta,
        ])->setPaper('a4', 'landscape');

        return $pdf->stream('current-stock-report.pdf');
    }

    /**
     * GET /api/reports/stock-adjustment
     * Returns stock adjustments with items for the given date range
     */
    public function stockAdjustment(Request $req)
    {
        $this->authorize('view', StockAdjustmentReport::class);

        $from = $req->query('from');
        $to   = $req->query('to');

        // Defaults: current month
        $fromDate = $from ? Carbon::parse($from)->startOfDay() : Carbon::now()->startOfMonth();
        $toDate   = $to   ? Carbon::parse($to)->endOfDay()   : Carbon::now()->endOfDay();
        if ($fromDate->gt($toDate)) {
            [$fromDate, $toDate] = [$toDate->copy()->startOfDay(), $fromDate->copy()->endOfDay()];
        }

        $adjustments = StockAdjustment::with([
                'user:id,name',
                'items' => function ($q) {
                    $q->with('product:id,name,product_code')
                      ->select([
                          'id','stock_adjustment_id','product_id',
                          'batch_number','expiry','pack_size',
                          'previous_qty','actual_qty','diff_qty',
                          'unit_purchase_price','worth_adjusted',
                      ]);
                },
            ])
            ->whereBetween('posted_date', [$fromDate, $toDate])
            ->orderBy('posted_date', 'asc')
            ->orderBy('id', 'asc')
            ->get();

        $rows = $adjustments->map(function ($adj) {
            return [
                'id'            => $adj->id,
                'posted_number' => $adj->posted_number ?? null,
                'posted_date'   => optional($adj->posted_date)->format('Y-m-d')
                                  ?? (is_string($adj->posted_date) ? substr($adj->posted_date,0,10) : null),
                'note'          => $adj->note ?? null,
                'total_worth'   => (float)($adj->total_worth ?? 0),
                'user_name'     => $adj->user->name ?? null,
                'items'         => ($adj->items ?? collect())->map(function ($item) {
                    return [
                        'id'                  => $item->id,
                        'product_id'          => $item->product_id,
                        'product_code'        => $item->product->product_code ?? null,
                        'product_name'        => $item->product->name ?? null,
                        'batch_number'        => $item->batch_number,
                        'expiry'              => $item->expiry ? $item->expiry->format('Y-m-d') : null,
                        'pack_size'            => (float)($item->pack_size ?? 0),
                        'previous_qty'         => (float)($item->previous_qty ?? 0),
                        'actual_qty'           => (float)($item->actual_qty ?? 0),
                        'diff_qty'             => (float)($item->diff_qty ?? 0),
                        'unit_purchase_price'  => (float)($item->unit_purchase_price ?? 0),
                        'worth_adjusted'       => (float)($item->worth_adjusted ?? 0),
                    ];
                })->values(),
            ];
        })->values();

        // Calculate summary totals
        $totalAdjustments = $rows->count();
        $totalItems = $rows->sum(fn($row) => count($row['items']));
        $totalWorthAdjusted = $rows->sum(fn($row) => $row['total_worth']);
        $positiveAdjustments = $rows->sum(fn($row) => collect($row['items'])->sum(fn($item) => $item['diff_qty'] > 0 ? $item['diff_qty'] : 0));
        $negativeAdjustments = $rows->sum(fn($row) => collect($row['items'])->sum(fn($item) => $item['diff_qty'] < 0 ? abs($item['diff_qty']) : 0));

        $summary = [
            'total_adjustments'    => $totalAdjustments,
            'total_items'          => $totalItems,
            'total_worth_adjusted' => round($totalWorthAdjusted, 2),
            'positive_adjustments' => round($positiveAdjustments, 3),
            'negative_adjustments' => round($negativeAdjustments, 3),
        ];

        return response()->json([
            'rows'    => $rows,
            'summary' => $summary,
        ]);
    }

    /**
     * GET /api/reports/stock-adjustment/pdf
     */
    public function stockAdjustmentPdf(Request $req)
    {
        $this->authorize('export', StockAdjustmentReport::class);

        $from = $req->query('from');
        $to   = $req->query('to');

        $fromDate = $from ? Carbon::parse($from)->startOfDay() : Carbon::now()->startOfMonth();
        $toDate   = $to   ? Carbon::parse($to)->endOfDay()   : Carbon::now()->endOfDay();
        if ($fromDate->gt($toDate)) {
            [$fromDate, $toDate] = [$toDate->copy()->startOfDay(), $fromDate->copy()->endOfDay()];
        }

        $adjustments = StockAdjustment::with([
                'user:id,name',
                'items' => function ($q) {
                    $q->with('product:id,name,product_code')
                      ->select([
                          'id','stock_adjustment_id','product_id',
                          'batch_number','expiry','pack_size',
                          'previous_qty','actual_qty','diff_qty',
                          'unit_purchase_price','worth_adjusted',
                      ]);
                },
            ])
            ->whereBetween('posted_date', [$fromDate, $toDate])
            ->orderBy('posted_date', 'asc')
            ->orderBy('id', 'asc')
            ->get();

        $rows = $adjustments->map(function ($adj) {
            return [
                'posted_number' => $adj->posted_number ?? null,
                'posted_date'   => optional($adj->posted_date)->format('Y-m-d')
                                  ?? (is_string($adj->posted_date) ? substr($adj->posted_date,0,10) : null),
                'note'          => $adj->note ?? null,
                'user_name'     => $adj->user->name ?? null,
                'total_worth'   => (float)($adj->total_worth ?? 0),
                'items'         => ($adj->items ?? collect())->map(function ($item) {
                    return [
                        'product_code'       => $item->product->product_code ?? null,
                        'product_name'       => $item->product->name ?? null,
                        'batch_number'       => $item->batch_number,
                        'expiry'             => $item->expiry ? $item->expiry->format('Y-m-d') : null,
                        'previous_qty'       => (float)($item->previous_qty ?? 0),
                        'actual_qty'         => (float)($item->actual_qty ?? 0),
                        'diff_qty'           => (float)($item->diff_qty ?? 0),
                        'unit_purchase_price'=> (float)($item->unit_purchase_price ?? 0),
                        'worth_adjusted'     => (float)($item->worth_adjusted ?? 0),
                    ];
                })->values(),
            ];
        })->values();

        $summary = [
            'total_adjustments'    => $rows->count(),
            'total_items'          => $rows->sum(fn($row) => count($row['items'])),
            'total_worth_adjusted' => round($rows->sum(fn($row) => $row['total_worth']), 2),
        ];

        $meta = [
            'from'        => $from,
            'to'          => $to,
            'generatedAt' => now()->format('Y-m-d H:i'),
        ];

        $pdf = Pdf::loadView('reports.stock_adjustment_pdf', [
            'rows'    => $rows,
            'summary' => $summary,
            'meta'    => $meta,
        ])->setPaper('a4', 'landscape');

        $filename = 'stock-adjustment-' . ($from ?: 'start') . '-to-' . ($to ?: 'today') . '.pdf';
        return $pdf->stream($filename);
    }

    /**
     * GET /api/reports/product-comprehensive
     * Returns a comprehensive report of purchase and sale history for a specific product
     */
    public function productComprehensive(Request $req)
    {
        $this->authorize('view', ProductComprehensiveReport::class);

        $from = $req->query('from');
        $to   = $req->query('to');
        $productId = $req->query('product_id');

        // Validate product_id
        if (!$productId) {
            return response()->json([
                'message' => 'Product ID is required',
            ], 400);
        }

        // Get product details
        $product = Product::find($productId);
        if (!$product) {
            return response()->json([
                'message' => 'Product not found',
            ], 404);
        }

        // Defaults: current month
        $fromDate = $from ? Carbon::parse($from)->startOfDay() : Carbon::now()->startOfMonth();
        $toDate   = $to   ? Carbon::parse($to)->endOfDay()   : Carbon::now()->endOfDay();
        if ($fromDate->gt($toDate)) {
            [$fromDate, $toDate] = [$toDate->copy()->startOfDay(), $fromDate->copy()->endOfDay()];
        }
        $fromDateStr = $fromDate->toDateString();
        $toDateStr = $toDate->toDateString();

        // Get product with related data
        $productData = [
            'id' => $product->id,
            'product_code' => $product->product_code,
            'name' => $product->name,
            'pack_size' => (int)($product->pack_size ?? 1),
            'current_quantity' => (int)($product->quantity ?? 0),
            'category_name' => $product->category->name ?? null,
            'brand_name' => $product->brand->name ?? null,
        ];

        // ===== Purchase Invoices =====
        $purchases = DB::table('purchase_invoice_items as pii')
            ->join('purchase_invoices as pi', 'pi.id', '=', 'pii.purchase_invoice_id')
            ->join('suppliers as s', 's.id', '=', 'pi.supplier_id')
            ->where('pii.product_id', $productId)
            ->whereBetween('pi.posted_date', [$fromDateStr, $toDateStr])
            ->where(fn($q) => $q->whereNull('pi.status')->orWhere('pi.status', '!=', 'reversed'))
            ->select([
                'pi.posted_date as date',
                'pi.posted_number as reference_number',
                'pi.invoice_number',
                's.name as counter_party',
                'pii.batch',
                'pii.expiry',
                'pii.quantity as quantity',
                'pii.unit_purchase_price as unit_price',
                'pii.sub_total',
            ])
            ->orderBy('date', 'asc')
            ->get()
            ->map(function ($item) {
                return [
                    'date' => $item->date instanceof \Carbon\Carbon ? $item->date->format('Y-m-d') : (is_string($item->date) ? substr($item->date, 0, 10) : $item->date),
                    'reference_number' => $item->reference_number,
                    'type' => 'purchase',
                    'type_label' => 'Purchase',
                    'counter_party' => $item->counter_party,
                    'batch' => $item->batch,
                    'expiry' => $item->expiry ? (($item->expiry instanceof \Carbon\Carbon) ? $item->expiry->format('Y-m-d') : (is_string($item->expiry) ? substr($item->expiry, 0, 10) : $item->expiry)) : null,
                    'quantity_in' => (int)($item->quantity ?? 0),
                    'quantity_out' => 0,
                    'unit_price' => (float)($item->unit_price ?? 0),
                    'sub_total' => (float)($item->sub_total ?? 0),
                ];
            });

        // ===== Purchase Returns =====
        $purchaseReturns = DB::table('purchase_return_items as pri')
            ->join('purchase_returns as pr', 'pr.id', '=', 'pri.purchase_return_id')
            ->join('suppliers as s', 's.id', '=', 'pr.supplier_id')
            ->where('pri.product_id', $productId)
            ->whereBetween('pr.date', [$fromDateStr, $toDateStr])
            ->select([
                'pr.date',
                'pr.posted_number as reference_number',
                's.name as counter_party',
                'pri.batch',
                'pri.expiry',
                'pri.return_unit_quantity as quantity',
                'pri.unit_purchase_price as unit_price',
                'pri.sub_total',
            ])
            ->orderBy('date', 'asc')
            ->get()
            ->map(function ($item) {
                return [
                    'date' => $item->date instanceof \Carbon\Carbon ? $item->date->format('Y-m-d') : (is_string($item->date) ? substr($item->date, 0, 10) : $item->date),
                    'reference_number' => $item->reference_number,
                    'type' => 'purchase_return',
                    'type_label' => 'Purchase Return',
                    'counter_party' => $item->counter_party,
                    'batch' => $item->batch,
                    'expiry' => $item->expiry ? (($item->expiry instanceof \Carbon\Carbon) ? $item->expiry->format('Y-m-d') : (is_string($item->expiry) ? substr($item->expiry, 0, 10) : $item->expiry)) : null,
                    'quantity_in' => 0,
                    'quantity_out' => (int)($item->quantity ?? 0),
                    'unit_price' => (float)($item->unit_price ?? 0),
                    'sub_total' => (float)($item->sub_total ?? 0),
                ];
            });

        // ===== Sale Invoices =====
        $saleSelectCols = [
            'si.date',
            'si.posted_number as reference_number',
            'c.name as counter_party',
            'sii.batch_number as batch',
            'sii.expiry',
            'sii.quantity',
            'sii.price as unit_price',
            'sii.sub_total',
        ];
        if (\Illuminate\Support\Facades\Schema::hasColumn('sale_invoice_items', 'bonus')) {
            $saleSelectCols[] = 'sii.bonus';
        }
        $sales = DB::table('sale_invoice_items as sii')
            ->join('sale_invoices as si', 'si.id', '=', 'sii.sale_invoice_id')
            ->join('customers as c', 'c.id', '=', 'si.customer_id')
            ->where('sii.product_id', $productId)
            ->whereBetween('si.date', [$fromDateStr, $toDateStr])
            ->where(fn($q) => $q->whereNull('si.status')->orWhere('si.status', '!=', 'reversed'))
            ->select($saleSelectCols)
            ->orderBy('date', 'asc')
            ->get()
            ->map(function ($item) {
                return [
                    'date' => $item->date instanceof \Carbon\Carbon ? $item->date->format('Y-m-d') : (is_string($item->date) ? substr($item->date, 0, 10) : $item->date),
                    'reference_number' => $item->reference_number,
                    'type' => 'sale',
                    'type_label' => 'Sale',
                    'counter_party' => $item->counter_party,
                    'batch' => $item->batch,
                    'expiry' => $item->expiry ? (($item->expiry instanceof \Carbon\Carbon) ? $item->expiry->format('Y-m-d') : (is_string($item->expiry) ? substr($item->expiry, 0, 10) : $item->expiry)) : null,
                    'quantity_in' => 0,
                    'quantity_out' => (int)($item->quantity ?? 0) + (int)($item->bonus ?? 0),
                    'unit_price' => (float)($item->unit_price ?? 0),
                    'sub_total' => (float)($item->sub_total ?? 0),
                ];
            });

        // ===== Sale Returns =====
        $saleReturns = DB::table('sale_return_items as sri')
            ->join('sale_returns as sr', 'sr.id', '=', 'sri.sale_return_id')
            ->join('customers as c', 'c.id', '=', 'sr.customer_id')
            ->where('sri.product_id', $productId)
            ->whereBetween('sr.date', [$fromDateStr, $toDateStr])
            ->select([
                'sr.date',
                'sr.posted_number as reference_number',
                'c.name as counter_party',
                'sri.batch_number as batch',
                'sri.expiry',
                'sri.unit_return_quantity as quantity',
                'sri.unit_sale_price as unit_price',
                'sri.sub_total',
            ])
            ->orderBy('date', 'asc')
            ->get()
            ->map(function ($item) {
                return [
                    'date' => $item->date instanceof \Carbon\Carbon ? $item->date->format('Y-m-d') : (is_string($item->date) ? substr($item->date, 0, 10) : $item->date),
                    'reference_number' => $item->reference_number,
                    'type' => 'sale_return',
                    'type_label' => 'Sale Return',
                    'counter_party' => $item->counter_party,
                    'batch' => $item->batch,
                    'expiry' => $item->expiry ? (($item->expiry instanceof \Carbon\Carbon) ? $item->expiry->format('Y-m-d') : (is_string($item->expiry) ? substr($item->expiry, 0, 10) : $item->expiry)) : null,
                    'quantity_in' => (int)($item->quantity ?? 0),
                    'quantity_out' => 0,
                    'unit_price' => (float)($item->unit_price ?? 0),
                    'sub_total' => (float)($item->sub_total ?? 0),
                ];
            });

        // ===== Stock Adjustments =====
        $stockAdjustments = DB::table('stock_adjustment_items as sai')
            ->join('stock_adjustments as sa', 'sa.id', '=', 'sai.stock_adjustment_id')
            ->where('sai.product_id', $productId)
            ->whereBetween('sa.posted_date', [$fromDateStr, $toDateStr])
            ->select([
                'sa.posted_date as date',
                'sa.posted_number as reference_number',
                'sai.batch_number as batch',
                'sai.expiry',
                'sai.diff_qty',
                'sai.unit_purchase_price as unit_price',
                'sai.worth_adjusted as sub_total',
            ])
            ->orderBy('date', 'asc')
            ->get()
            ->map(function ($item) {
                $diff = (float)($item->diff_qty ?? 0);
                return [
                    'date' => $item->date instanceof \Carbon\Carbon ? $item->date->format('Y-m-d') : (is_string($item->date) ? substr($item->date, 0, 10) : $item->date),
                    'reference_number' => $item->reference_number,
                    'type' => 'stock_adjustment',
                    'type_label' => 'Stock Adjustment',
                    'counter_party' => 'Inventory Adjustment',
                    'batch' => $item->batch,
                    'expiry' => $item->expiry ? (($item->expiry instanceof \Carbon\Carbon) ? $item->expiry->format('Y-m-d') : (is_string($item->expiry) ? substr($item->expiry, 0, 10) : $item->expiry)) : null,
                    'quantity_in' => $diff > 0 ? (int)$diff : 0,
                    'quantity_out' => $diff < 0 ? (int)abs($diff) : 0,
                    'unit_price' => (float)($item->unit_price ?? 0),
                    'sub_total' => (float)($item->sub_total ?? 0),
                ];
            });

        // Merge all transactions and sort by date
        $allTransactions = $purchases
            ->concat($purchaseReturns)
            ->concat($sales)
            ->concat($saleReturns)
            ->concat($stockAdjustments)
            ->sortBy('date')
            ->values();

        // Calculate summary
        $totalPurchases = $purchases->sum('sub_total');
        $totalPurchaseReturns = $purchaseReturns->sum('sub_total');
        $totalSales = $sales->sum('sub_total');
        $totalSaleReturns = $saleReturns->sum('sub_total');
        $totalQuantityIn = $purchases->sum('quantity_in') + $saleReturns->sum('quantity_in') + $stockAdjustments->sum('quantity_in');
        $totalQuantityOut = $sales->sum('quantity_out') + $purchaseReturns->sum('quantity_out') + $stockAdjustments->sum('quantity_out');

        $summary = [
            'total_purchases' => round($totalPurchases, 2),
            'total_purchase_returns' => round($totalPurchaseReturns, 2),
            'net_purchases' => round($totalPurchases - $totalPurchaseReturns, 2),
            'total_sales' => round($totalSales, 2),
            'total_sale_returns' => round($totalSaleReturns, 2),
            'net_sales' => round($totalSales - $totalSaleReturns, 2),
            'total_quantity_in' => $totalQuantityIn,
            'total_quantity_out' => $totalQuantityOut,
            'current_quantity' => $productData['current_quantity'],
        ];

        return response()->json([
            'product' => $productData,
            'date_range' => [
                'from' => $fromDate->format('Y-m-d'),
                'to' => $toDate->format('Y-m-d'),
            ],
            'transactions' => $allTransactions,
            'summary' => $summary,
        ]);
    }

    /**
     * GET /api/reports/product-comprehensive/pdf
     */
    public function productComprehensivePdf(Request $req)
    {
        $this->authorize('export', ProductComprehensiveReport::class);

        $rows = $this->buildProductComprehensiveRows(
            $req->query('from'),
            $req->query('to'),
            $req->query('product_id'),
        );

        $meta = [
            'from' => $req->query('from'),
            'to' => $req->query('to'),
            'generatedAt' => now()->format('Y-m-d H:i'),
        ];

        $pdf = Pdf::loadView('reports.product_comprehensive_pdf', [
            'product' => $rows['product'],
            'transactions' => $rows['transactions'],
            'summary' => $rows['summary'],
            'meta' => $meta,
        ])->setPaper('a4', 'landscape');

        $filename = 'product-comprehensive-' . ($rows['product']['product_code'] ?? 'product') . '.pdf';
        return $pdf->stream($filename);
    }

    private function buildProductComprehensiveRows($from, $to, $productId)
    {
        // Validate product_id
        if (!$productId) {
            return [
                'product' => null,
                'transactions' => [],
                'summary' => [],
            ];
        }

        // Get product details
        $product = Product::find($productId);
        if (!$product) {
            return [
                'product' => null,
                'transactions' => [],
                'summary' => [],
            ];
        }

        // Defaults: current month
        $fromDate = $from ? Carbon::parse($from)->startOfDay() : Carbon::now()->startOfMonth();
        $toDate = $to ? Carbon::parse($to)->endOfDay() : Carbon::now()->endOfDay();
        if ($fromDate->gt($toDate)) {
            [$fromDate, $toDate] = [$toDate->copy()->startOfDay(), $fromDate->copy()->endOfDay()];
        }
        $fromDateStr = $fromDate->toDateString();
        $toDateStr = $toDate->toDateString();

        // Get product with related data
        $productData = [
            'id' => $product->id,
            'product_code' => $product->product_code,
            'name' => $product->name,
            'pack_size' => (int)($product->pack_size ?? 1),
            'current_quantity' => (int)($product->quantity ?? 0),
            'category_name' => $product->category->name ?? null,
            'brand_name' => $product->brand->name ?? null,
        ];

        // ===== Purchase Invoices =====
        $purchases = DB::table('purchase_invoice_items as pii')
            ->join('purchase_invoices as pi', 'pi.id', '=', 'pii.purchase_invoice_id')
            ->join('suppliers as s', 's.id', '=', 'pi.supplier_id')
            ->where('pii.product_id', $productId)
            ->whereBetween('pi.posted_date', [$fromDateStr, $toDateStr])
            ->where(fn($q) => $q->whereNull('pi.status')->orWhere('pi.status', '!=', 'reversed'))
            ->select([
                'pi.posted_date as date',
                'pi.posted_number as reference_number',
                'pi.invoice_number',
                's.name as counter_party',
                'pii.batch',
                'pii.expiry',
                'pii.quantity as quantity',
                'pii.unit_purchase_price as unit_price',
                'pii.sub_total',
            ])
            ->orderBy('date', 'asc')
            ->get()
            ->map(function ($item) {
                return [
                    'date' => $item->date instanceof \Carbon\Carbon ? $item->date->format('Y-m-d') : (is_string($item->date) ? substr($item->date, 0, 10) : $item->date),
                    'reference_number' => $item->reference_number,
                    'type' => 'purchase',
                    'type_label' => 'Purchase',
                    'counter_party' => $item->counter_party,
                    'batch' => $item->batch,
                    'expiry' => $item->expiry ? (($item->expiry instanceof \Carbon\Carbon) ? $item->expiry->format('Y-m-d') : (is_string($item->expiry) ? substr($item->expiry, 0, 10) : $item->expiry)) : null,
                    'quantity_in' => (int)($item->quantity ?? 0),
                    'quantity_out' => 0,
                    'unit_price' => (float)($item->unit_price ?? 0),
                    'sub_total' => (float)($item->sub_total ?? 0),
                ];
            });

        // ===== Purchase Returns =====
        $purchaseReturns = DB::table('purchase_return_items as pri')
            ->join('purchase_returns as pr', 'pr.id', '=', 'pri.purchase_return_id')
            ->join('suppliers as s', 's.id', '=', 'pr.supplier_id')
            ->where('pri.product_id', $productId)
            ->whereBetween('pr.date', [$fromDateStr, $toDateStr])
            ->select([
                'pr.date',
                'pr.posted_number as reference_number',
                's.name as counter_party',
                'pri.batch',
                'pri.expiry',
                'pri.return_unit_quantity as quantity',
                'pri.unit_purchase_price as unit_price',
                'pri.sub_total',
            ])
            ->orderBy('date', 'asc')
            ->get()
            ->map(function ($item) {
                return [
                    'date' => $item->date instanceof \Carbon\Carbon ? $item->date->format('Y-m-d') : (is_string($item->date) ? substr($item->date, 0, 10) : $item->date),
                    'reference_number' => $item->reference_number,
                    'type' => 'purchase_return',
                    'type_label' => 'Purchase Return',
                    'counter_party' => $item->counter_party,
                    'batch' => $item->batch,
                    'expiry' => $item->expiry ? (($item->expiry instanceof \Carbon\Carbon) ? $item->expiry->format('Y-m-d') : (is_string($item->expiry) ? substr($item->expiry, 0, 10) : $item->expiry)) : null,
                    'quantity_in' => 0,
                    'quantity_out' => (int)($item->quantity ?? 0),
                    'unit_price' => (float)($item->unit_price ?? 0),
                    'sub_total' => (float)($item->sub_total ?? 0),
                ];
            });

        // ===== Sale Invoices =====
        $saleSelectCols = [
            'si.date',
            'si.posted_number as reference_number',
            'c.name as counter_party',
            'sii.batch_number as batch',
            'sii.expiry',
            'sii.quantity',
            'sii.price as unit_price',
            'sii.sub_total',
        ];
        if (\Illuminate\Support\Facades\Schema::hasColumn('sale_invoice_items', 'bonus')) {
            $saleSelectCols[] = 'sii.bonus';
        }
        $sales = DB::table('sale_invoice_items as sii')
            ->join('sale_invoices as si', 'si.id', '=', 'sii.sale_invoice_id')
            ->join('customers as c', 'c.id', '=', 'si.customer_id')
            ->where('sii.product_id', $productId)
            ->whereBetween('si.date', [$fromDateStr, $toDateStr])
            ->where(fn($q) => $q->whereNull('si.status')->orWhere('si.status', '!=', 'reversed'))
            ->select($saleSelectCols)
            ->orderBy('date', 'asc')
            ->get()
            ->map(function ($item) {
                return [
                    'date' => $item->date instanceof \Carbon\Carbon ? $item->date->format('Y-m-d') : (is_string($item->date) ? substr($item->date, 0, 10) : $item->date),
                    'reference_number' => $item->reference_number,
                    'type' => 'sale',
                    'type_label' => 'Sale',
                    'counter_party' => $item->counter_party,
                    'batch' => $item->batch,
                    'expiry' => $item->expiry ? (($item->expiry instanceof \Carbon\Carbon) ? $item->expiry->format('Y-m-d') : (is_string($item->expiry) ? substr($item->expiry, 0, 10) : $item->expiry)) : null,
                    'quantity_in' => 0,
                    'quantity_out' => (int)($item->quantity ?? 0) + (int)($item->bonus ?? 0),
                    'unit_price' => (float)($item->unit_price ?? 0),
                    'sub_total' => (float)($item->sub_total ?? 0),
                ];
            });

        // ===== Sale Returns =====
        $saleReturns = DB::table('sale_return_items as sri')
            ->join('sale_returns as sr', 'sr.id', '=', 'sri.sale_return_id')
            ->join('customers as c', 'c.id', '=', 'sr.customer_id')
            ->where('sri.product_id', $productId)
            ->whereBetween('sr.date', [$fromDateStr, $toDateStr])
            ->select([
                'sr.date',
                'sr.posted_number as reference_number',
                'c.name as counter_party',
                'sri.batch_number as batch',
                'sri.expiry',
                'sri.unit_return_quantity as quantity',
                'sri.unit_sale_price as unit_price',
                'sri.sub_total',
            ])
            ->orderBy('date', 'asc')
            ->get()
            ->map(function ($item) {
                return [
                    'date' => $item->date instanceof \Carbon\Carbon ? $item->date->format('Y-m-d') : (is_string($item->date) ? substr($item->date, 0, 10) : $item->date),
                    'reference_number' => $item->reference_number,
                    'type' => 'sale_return',
                    'type_label' => 'Sale Return',
                    'counter_party' => $item->counter_party,
                    'batch' => $item->batch,
                    'expiry' => $item->expiry ? (($item->expiry instanceof \Carbon\Carbon) ? $item->expiry->format('Y-m-d') : (is_string($item->expiry) ? substr($item->expiry, 0, 10) : $item->expiry)) : null,
                    'quantity_in' => (int)($item->quantity ?? 0),
                    'quantity_out' => 0,
                    'unit_price' => (float)($item->unit_price ?? 0),
                    'sub_total' => (float)($item->sub_total ?? 0),
                ];
            });

        // ===== Stock Adjustments =====
        $stockAdjustments = DB::table('stock_adjustment_items as sai')
            ->join('stock_adjustments as sa', 'sa.id', '=', 'sai.stock_adjustment_id')
            ->where('sai.product_id', $productId)
            ->whereBetween('sa.posted_date', [$fromDateStr, $toDateStr])
            ->select([
                'sa.posted_date as date',
                'sa.posted_number as reference_number',
                'sai.batch_number as batch',
                'sai.expiry',
                'sai.diff_qty',
                'sai.unit_purchase_price as unit_price',
                'sai.worth_adjusted as sub_total',
            ])
            ->orderBy('date', 'asc')
            ->get()
            ->map(function ($item) {
                $diff = (float)($item->diff_qty ?? 0);
                return [
                    'date' => $item->date instanceof \Carbon\Carbon ? $item->date->format('Y-m-d') : (is_string($item->date) ? substr($item->date, 0, 10) : $item->date),
                    'reference_number' => $item->reference_number,
                    'type' => 'stock_adjustment',
                    'type_label' => 'Stock Adjustment',
                    'counter_party' => 'Inventory Adjustment',
                    'batch' => $item->batch,
                    'expiry' => $item->expiry ? (($item->expiry instanceof \Carbon\Carbon) ? $item->expiry->format('Y-m-d') : (is_string($item->expiry) ? substr($item->expiry, 0, 10) : $item->expiry)) : null,
                    'quantity_in' => $diff > 0 ? (int)$diff : 0,
                    'quantity_out' => $diff < 0 ? (int)abs($diff) : 0,
                    'unit_price' => (float)($item->unit_price ?? 0),
                    'sub_total' => (float)($item->sub_total ?? 0),
                ];
            });

        // Merge all transactions and sort by date
        $allTransactions = $purchases
            ->concat($purchaseReturns)
            ->concat($sales)
            ->concat($saleReturns)
            ->concat($stockAdjustments)
            ->sortBy('date')
            ->values();

        // Calculate summary
        $totalPurchases = $purchases->sum('sub_total');
        $totalPurchaseReturns = $purchaseReturns->sum('sub_total');
        $totalSales = $sales->sum('sub_total');
        $totalSaleReturns = $saleReturns->sum('sub_total');
        $totalQuantityIn = $purchases->sum('quantity_in') + $saleReturns->sum('quantity_in') + $stockAdjustments->sum('quantity_in');
        $totalQuantityOut = $sales->sum('quantity_out') + $purchaseReturns->sum('quantity_out') + $stockAdjustments->sum('quantity_out');

        $summary = [
            'total_purchases' => round($totalPurchases, 2),
            'total_purchase_returns' => round($totalPurchaseReturns, 2),
            'net_purchases' => round($totalPurchases - $totalPurchaseReturns, 2),
            'total_sales' => round($totalSales, 2),
            'total_sale_returns' => round($totalSaleReturns, 2),
            'net_sales' => round($totalSales - $totalSaleReturns, 2),
            'total_quantity_in' => $totalQuantityIn,
            'total_quantity_out' => $totalQuantityOut,
            'current_quantity' => $productData['current_quantity'],
        ];

        return [
            'product' => $productData,
            'transactions' => $allTransactions,
            'summary' => $summary,
        ];
    }

    /**
     * GET /api/reports/near-expiry-product
     * Returns products with expiry dates in the future within a date range
     * Query params: from, to, supplier_id, brand_id, product_id
     */
    public function nearExpiryProduct(Request $req)
    {
        $this->authorize('view', NearExpiryProductReport::class);

        $from = $req->query('from');
        $to = $req->query('to');
        $supplierId = $req->query('supplier_id');
        $brandId = $req->query('brand_id');
        $productId = $req->query('product_id');

        // Defaults: today to 3 months ahead if not provided
        $today = now()->toDateString();
        $fromDate = $from ? Carbon::parse($from)->toDateString() : $today;
        $toDate = $to ? Carbon::parse($to)->toDateString() : now()->addMonths(3)->toDateString();

        // Ensure from date is not in the past (for near expiry, we want future expiry)
        if ($fromDate < $today) {
            $fromDate = $today;
        }

        if ($fromDate && $toDate && $fromDate > $toDate) {
            [$fromDate, $toDate] = [$toDate, $fromDate];
        }

        $q = DB::table('batches as b')
            ->join('products as p', 'p.id', '=', 'b.product_id')
            ->leftJoin('suppliers as s', 's.id', '=', 'p.supplier_id')
            ->leftJoin('brands as br', 'br.id', '=', 'p.brand_id')
            ->whereNotNull('b.expiry_date')
            ->whereBetween(DB::raw('DATE(b.expiry_date)'), [$fromDate, $toDate])
            ->where('b.quantity', '>', 0); // Only show products with available quantity > 0

        if (!empty($supplierId)) {
            $q->where('p.supplier_id', $supplierId);
        }
        if (!empty($brandId)) {
            $q->where('p.brand_id', $brandId);
        }
        if (!empty($productId)) {
            $q->where('p.id', $productId);
        }

        $rows = $q->orderBy('b.expiry_date')
            ->orderBy('p.name')
            ->select(
                'b.id as batch_id',
                'b.batch_number',
                'b.expiry_date',
                'b.quantity',
                'p.id as product_id',
                'p.product_code',
                'p.name as product_name',
                'p.supplier_id',
                'p.brand_id',
                DB::raw('COALESCE(s.name, "") as supplier_name'),
                DB::raw('COALESCE(br.name, "") as brand_name')
            )
            ->limit(2000)
            ->get();

        // Calculate summary
        $totalQuantity = $rows->sum('quantity');
        $totalBatches = count($rows);

        return response()->json([
            'rows' => $rows,
            'summary' => [
                'total_batches' => $totalBatches,
                'total_quantity' => $totalQuantity,
            ],
            'filters' => [
                'from' => $fromDate,
                'to' => $toDate,
                'supplier_id' => $supplierId,
                'brand_id' => $brandId,
                'product_id' => $productId,
            ],
        ]);
    }

    /**
     * GET /api/reports/near-expiry-product/pdf
     */
    public function nearExpiryProductPdf(Request $req)
    {
        $this->authorize('export', NearExpiryProductReport::class);

        $from = $req->query('from');
        $to = $req->query('to');
        $supplierId = $req->query('supplier_id');
        $brandId = $req->query('brand_id');
        $productId = $req->query('product_id');

        $today = now()->toDateString();
        $fromDate = $from ? Carbon::parse($from)->toDateString() : $today;
        $toDate = $to ? Carbon::parse($to)->toDateString() : now()->addMonths(3)->toDateString();

        if ($fromDate < $today) {
            $fromDate = $today;
        }

        if ($fromDate && $toDate && $fromDate > $toDate) {
            [$fromDate, $toDate] = [$toDate, $fromDate];
        }

        $q = DB::table('batches as b')
            ->join('products as p', 'p.id', '=', 'b.product_id')
            ->leftJoin('suppliers as s', 's.id', '=', 'p.supplier_id')
            ->leftJoin('brands as br', 'br.id', '=', 'p.brand_id')
            ->whereNotNull('b.expiry_date')
            ->whereBetween(DB::raw('DATE(b.expiry_date)'), [$fromDate, $toDate])
            ->where('b.quantity', '>', 0);

        if (!empty($supplierId)) {
            $q->where('p.supplier_id', $supplierId);
        }
        if (!empty($brandId)) {
            $q->where('p.brand_id', $brandId);
        }
        if (!empty($productId)) {
            $q->where('p.id', $productId);
        }

        $rows = $q->orderBy('b.expiry_date')
            ->orderBy('p.name')
            ->select(
                'b.batch_number',
                'b.expiry_date',
                'b.quantity',
                'p.product_code',
                'p.name as product_name',
                DB::raw('COALESCE(s.name, "") as supplier_name'),
                DB::raw('COALESCE(br.name, "") as brand_name')
            )
            ->limit(2000)
            ->get()
            ->map(function ($row) {
                return [
                    'batch_number' => $row->batch_number,
                    'expiry_date' => $row->expiry_date instanceof \Carbon\Carbon 
                        ? $row->expiry_date->format('Y-m-d') 
                        : (is_string($row->expiry_date) ? substr($row->expiry_date, 0, 10) : $row->expiry_date),
                    'quantity' => (int) $row->quantity,
                    'product_code' => $row->product_code,
                    'product_name' => $row->product_name,
                    'supplier_name' => $row->supplier_name,
                    'brand_name' => $row->brand_name,
                ];
            });

        $summary = [
            'total_batches' => count($rows),
            'total_quantity' => $rows->sum('quantity'),
        ];

        $meta = [
            'from' => $fromDate,
            'to' => $toDate,
            'generatedAt' => now()->format('Y-m-d H:i'),
        ];

        try {
            $pdf = Pdf::loadView('reports.near_expiry_product_pdf', [
                'rows' => $rows,
                'summary' => $summary,
                'meta' => $meta,
            ])->setPaper('a4', 'landscape');

            return $pdf->stream('near-expiry-product-report.pdf');
        } catch (\Throwable $e) {
            return response()->json([
                'message' => 'Failed to generate PDF',
                'error' => $e->getMessage(),
            ], 500);
        }
    }

    /**
     * Executive Net Profit (Profit and Loss) Statement.
     */
    public function netProfit(Request $req, \App\Services\ExpenseService $expenseService)
    {
        $this->authorizeReportAction('report.net-profit.view');

        $filters = $req->validate([
            'from' => 'sometimes|date_format:Y-m-d',
            'to'   => 'sometimes|date_format:Y-m-d',
        ]);

        $from = $filters['from'] ?? Carbon::now()->startOfMonth()->toDateString();
        $to   = $filters['to'] ?? Carbon::now()->toDateString();
        abort_if($from > $to, 422, 'The from date must be on or before the to date.');

        $data = $expenseService->getNetProfitReport($from, $to);

        return response()->json($data);
    }

    public function purchaseReturnsPdf(Request $req)
    {
        $this->authorizeReportAction(['report.purchase-returns.export', 'report.purchase-returns.view']);
        $data = $this->purchaseReturns($req)->getData(true);
        $meta = [
            'from'        => $req->query('from', Carbon::now()->startOfMonth()->toDateString()),
            'to'          => $req->query('to', Carbon::now()->toDateString()),
            'generatedAt' => now()->format('Y-m-d H:i'),
        ];
        $pdf = Pdf::loadView('reports.purchase_returns_pdf', [
            'rows'    => $data['rows'] ?? [],
            'summary' => $data['summary'] ?? [],
            'meta'    => $meta,
        ])->setPaper('a4', 'landscape');

        return $req->boolean('download')
            ? $pdf->download('purchase-returns-report.pdf')
            : $pdf->stream('purchase-returns-report.pdf');
    }

    public function saleReturnsPdf(Request $req)
    {
        $this->authorizeReportAction(['report.sale-returns.export', 'report.sale-returns.view']);
        $data = $this->saleReturns($req)->getData(true);
        $meta = [
            'from'        => $req->query('from', Carbon::now()->startOfMonth()->toDateString()),
            'to'          => $req->query('to', Carbon::now()->toDateString()),
            'generatedAt' => now()->format('Y-m-d H:i'),
        ];
        $pdf = Pdf::loadView('reports.sale_returns_pdf', [
            'rows'    => $data['rows'] ?? [],
            'summary' => $data['summary'] ?? [],
            'meta'    => $meta,
        ])->setPaper('a4', 'landscape');

        return $req->boolean('download')
            ? $pdf->download('sale-returns-report.pdf')
            : $pdf->stream('sale-returns-report.pdf');
    }

    public function purchaseSummaryPdf(Request $req)
    {
        $this->authorizeReportAction(['report.purchase-summary.export', 'report.purchase-summary.view']);
        $data = $this->purchaseSummary($req)->getData(true);
        $meta = [
            'from'        => $req->query('from', Carbon::now()->startOfMonth()->toDateString()),
            'to'          => $req->query('to', Carbon::now()->toDateString()),
            'generatedAt' => now()->format('Y-m-d H:i'),
        ];
        $pdf = Pdf::loadView('reports.purchase_summary_pdf', [
            'rows'    => $data['rows'] ?? [],
            'summary' => $data['summary'] ?? [],
            'meta'    => $meta,
        ])->setPaper('a4', 'landscape');

        return $req->boolean('download')
            ? $pdf->download('purchase-summary-report.pdf')
            : $pdf->stream('purchase-summary-report.pdf');
    }

    public function outstandingAgingPdf(Request $req)
    {
        $this->authorizeReportAction(['report.outstanding-aging.export', 'report.outstanding-aging.view']);
        $data = $this->outstandingAging($req)->getData(true);
        $meta = [
            'as_of'       => $data['as_of'] ?? Carbon::today()->toDateString(),
            'aging_by'    => $data['aging_by'] ?? 'due_date',
            'generatedAt' => now()->format('Y-m-d H:i'),
        ];
        $pdf = Pdf::loadView('reports.outstanding_aging_pdf', [
            'customers' => $data['customers'] ?? [],
            'suppliers' => $data['suppliers'] ?? [],
            'summary'   => $data['summary'] ?? [],
            'meta'      => $meta,
        ])->setPaper('a4', 'landscape');

        return $req->boolean('download')
            ? $pdf->download('outstanding-aging-report.pdf')
            : $pdf->stream('outstanding-aging-report.pdf');
    }

    public function overdueWorkQueuePdf(Request $req)
    {
        $this->authorizeReportAction(['report.outstanding-aging.export', 'report.outstanding-aging.view']);
        $data = $this->overdueWorkQueue($req)->getData(true);
        $meta = [
            'as_of'       => $data['as_of'] ?? Carbon::today()->toDateString(),
            'party_type'  => $data['party_type'] ?? 'customers',
            'generatedAt' => now()->format('Y-m-d H:i'),
        ];
        $pdf = Pdf::loadView('reports.overdue_work_queue_pdf', [
            'parties'           => $data['parties'] ?? [],
            'total_parties'     => $data['total_parties'] ?? 0,
            'total_overdue_sum' => $data['total_overdue_sum'] ?? 0,
            'meta'              => $meta,
        ])->setPaper('a4', 'landscape');

        return $req->boolean('download')
            ? $pdf->download('overdue-work-queue-report.pdf')
            : $pdf->stream('overdue-work-queue-report.pdf');
    }

    public function reorderReportPdf(Request $req)
    {
        $this->authorizeReportAction(['report.reorder.export', 'report.reorder.view']);
        $data = $this->reorderReport($req)->getData(true);
        $meta = [
            'generatedAt' => now()->format('Y-m-d H:i'),
            'threshold'   => $data['threshold'] ?? 'On-hand quantity below one pack',
        ];
        $pdf = Pdf::loadView('reports.reorder_pdf', [
            'rows'    => $data['rows'] ?? [],
            'summary' => $data['summary'] ?? [],
            'meta'    => $meta,
        ])->setPaper('a4', 'landscape');

        return $req->boolean('download')
            ? $pdf->download('reorder-report.pdf')
            : $pdf->stream('reorder-report.pdf');
    }

    public function netProfitPdf(Request $req, \App\Services\ExpenseService $expenseService)
    {
        $this->authorizeReportAction(['report.net-profit.export', 'report.net-profit.view']);
        $data = $this->netProfit($req, $expenseService)->getData(true);
        $meta = [
            'from'        => $data['date_range']['from'] ?? $data['period']['from'] ?? Carbon::now()->startOfMonth()->toDateString(),
            'to'          => $data['date_range']['to'] ?? $data['period']['to'] ?? Carbon::now()->toDateString(),
            'generatedAt' => now()->format('Y-m-d H:i'),
        ];
        $pdf = Pdf::loadView('reports.net_profit_pdf', [
            'data' => $data,
            'meta' => $meta,
        ])->setPaper('a4', 'portrait');

        return $req->boolean('download')
            ? $pdf->download('net-profit-report.pdf')
            : $pdf->stream('net-profit-report.pdf');
    }

    /**
     * GET /api/reports/tax-return
     * Statutory Tax & GST / VAT Return Report (Output Tax vs. Input Tax Credit).
     */
    public function taxReturn(Request $req, \App\Services\AccountingService $accountingService)
    {
        $this->authorizeReportAction([
            'report.net-profit.view',
            'report.sale-detail.view',
            'report.purchase-detail.view',
            'account.view',
        ]);

        $from = $req->query('from', Carbon::now()->startOfMonth()->toDateString());
        $to   = $req->query('to', Carbon::now()->toDateString());
        if ($from > $to) {
            [$from, $to] = [$to, $from];
        }

        $data = $accountingService->getTaxReport($from, $to, [
            'tax_scope' => $req->query('tax_scope', 'all'),
        ]);

        return response()->json($data);
    }

    /**
     * GET /api/reports/tax-return/pdf
     */
    public function taxReturnPdf(Request $req, \App\Services\AccountingService $accountingService)
    {
        $this->authorizeReportAction([
            'report.net-profit.export',
            'report.net-profit.view',
            'report.sale-detail.view',
            'account.view',
        ]);

        $data = $this->taxReturn($req, $accountingService)->getData(true);
        $meta = [
            'from'        => $data['period']['from'] ?? Carbon::now()->startOfMonth()->toDateString(),
            'to'          => $data['period']['to'] ?? Carbon::now()->toDateString(),
            'generatedAt' => now()->format('Y-m-d H:i'),
        ];

        $pdf = Pdf::loadView('reports.tax_return_pdf', [
            'data' => $data,
            'meta' => $meta,
        ])->setPaper('a4', 'portrait');

        return $req->boolean('download')
            ? $pdf->download("statutory-tax-return-{$meta['from']}-to-{$meta['to']}.pdf")
            : $pdf->stream("statutory-tax-return-{$meta['from']}-to-{$meta['to']}.pdf");
    }

    /**
     * GET /api/reports/financial-statements/pdf
     */
    public function financialStatementsPdf(Request $req, \App\Services\AccountingService $accountingService)
    {
        $this->authorizeReportAction(['report.net-profit.export', 'report.net-profit.view', 'account.view']);

        $from = $req->query('from', Carbon::now()->startOfMonth()->toDateString());
        $to   = $req->query('to', Carbon::now()->toDateString());
        if ($from > $to) {
            [$from, $to] = [$to, $from];
        }

        $trialBalance = $accountingService->getTrialBalance($from, $to);
        $balanceSheet = $accountingService->getBalanceSheet($to);
        $meta = [
            'from'        => $from,
            'to'          => $to,
            'generatedAt' => now()->format('Y-m-d H:i'),
        ];

        $pdf = Pdf::loadView('reports.financial_statements_pdf', [
            'trialBalance' => $trialBalance,
            'balanceSheet' => $balanceSheet,
            'meta'         => $meta,
        ])->setPaper('a4', 'portrait');

        return $req->boolean('download')
            ? $pdf->download("financial-statements-{$from}-to-{$to}.pdf")
            : $pdf->stream("financial-statements-{$from}-to-{$to}.pdf");
    }
}
