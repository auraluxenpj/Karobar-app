<?php

namespace App\Http\Controllers;

use App\Models\Product;
use App\Models\Supplier;
use Illuminate\Http\Request;
use Illuminate\Support\Facades\DB;
use Illuminate\Support\Facades\Schema;
use Symfony\Component\HttpFoundation\StreamedResponse;

class SupplierController extends Controller
{
    public function search(Request $req)
    {
        $this->authorize('lookup', Supplier::class);

        $q     = trim($req->input('q', ''));
        $limit = max(1, min((int)$req->input('limit', 50), 10000));
        $page  = (int)$req->input('page', 0);

        $query = Supplier::query()->orderBy('name');

        if ($q !== '') {
            $query->where('name', 'like', "%{$q}%");
        }

        if ($page >= 1) {
            $perPage = max(1, min((int)$req->input('per_page', 20), 100));
            return $query->paginate($perPage, ['*'], 'page', $page);
        }

        return $query->limit($limit)->get();
    }

    /**
     * GET /api/suppliers
     */
    public function index()
    {
        $this->authorize('viewAny', Supplier::class);

        $suppliers = Supplier::withCount('products')->orderBy('name')->get();

        $hasLedgerTable = \App\Support\SchemaCache::hasTable('supplier_ledgers');

        if ($suppliers->isNotEmpty()) {
            $supplierIds = $suppliers->pluck('id')->all();
            $batches = collect();
            if (\App\Support\SchemaCache::hasTable('batches')) {
                $batches = DB::table('batches as b')
                    ->join('products as p', 'p.id', '=', 'b.product_id')
                    ->leftJoin('brands as br', 'br.id', '=', 'p.brand_id')
                    ->whereIn('p.supplier_id', $supplierIds)
                    ->whereNotNull('b.expiry_date')
                    ->where('b.quantity', '>', 0)
                    ->select(
                        'p.supplier_id',
                        'b.expiry_date',
                        'b.quantity',
                        'br.expiry_return_policy as brand_policy',
                        'br.expiry_return_months as brand_months',
                        'br.expiry_return_days as brand_days'
                    )
                    ->get()
                    ->groupBy('supplier_id');
            }

            $bulkPayables = $hasLedgerTable
                ? \App\Models\SupplierLedger::getBulkSupplierNetBalances($supplierIds)
                : [];

            foreach ($suppliers as $supplier) {
                $supBatches = $batches->get($supplier->id, collect());
                $dueCount = 0;
                $dueUnits = 0;
                foreach ($supBatches as $bRow) {
                    $policy = (string) ($supplier->expiry_return_policy ?: ($bRow->brand_policy ?: 'before_expiry'));
                    $months = (int) ($supplier->expiry_return_months ?? $bRow->brand_months ?? 3);
                    $days = (int) ($supplier->expiry_return_days ?? $bRow->brand_days ?? 90);

                    $eval = BrandController::evaluateBatchIntimation(
                        $bRow->expiry_date,
                        $policy,
                        $months,
                        $days
                    );
                    if ($eval['is_intimation_due']) {
                        $dueCount++;
                        $dueUnits += (int) $bRow->quantity;
                    }
                }
                $supplier->setAttribute('intimation_due_count', $dueCount);
                $supplier->setAttribute('intimation_due_units', $dueUnits);
                $supplier->setAttribute(
                    'current_payable',
                    $bulkPayables[$supplier->id] ?? 0.0
                );
            }
        }

        return response()->json($suppliers);
    }

    /**
     * POST /api/suppliers
     */
    public function store(Request $request)
    {
        $this->authorize('create', Supplier::class);

        $data = $request->validate([
            'name'                 => 'required|string|max:150|unique:suppliers,name',
            'address'              => 'nullable|string|max:255',
            'phone'                => 'nullable|string|max:50',
            'tax_number'           => 'nullable|string|max:60',
            'tax_status'           => 'nullable|string|in:registered,unregistered,exempt',
            'email'                => 'nullable|email|max:150',
            'credit_limit'         => 'nullable|numeric|min:0',
            'credit_days'          => 'nullable|integer|min:0|max:365',
            'opening_balance'      => 'nullable|numeric|min:0',
            'expiry_return_policy' => 'nullable|string|in:before_expiry,accepts_expired,non_returnable',
            'expiry_return_months' => 'nullable|integer|min:0|max:120',
            'expiry_return_days'   => 'nullable|integer|min:0|max:3650',
            'expiry_return_notes'  => 'nullable|string|max:500',
        ]);

        if (\App\Support\SchemaCache::hasColumn('suppliers', 'expiry_return_policy')) {
            $data = BrandController::normalizeExpiryPolicyPayload($data);
        } else {
            unset(
                $data['expiry_return_policy'],
                $data['expiry_return_months'],
                $data['expiry_return_days'],
                $data['expiry_return_notes']
            );
        }

        $openingBalance = round((float) ($data['opening_balance'] ?? 0), 2);
        unset($data['opening_balance']);

        $supplier = DB::transaction(function () use ($data, $openingBalance, $request) {
            $supplier = Supplier::create($data);

            if ($openingBalance > 0 && Schema::hasTable('supplier_ledgers')) {
                \App\Models\SupplierLedger::create([
                    'supplier_id'      => $supplier->id,
                    'entry_type'       => 'manual',
                    'is_manual'        => true,
                    'entry_date'       => now()->toDateString(),
                    'posted_number'    => 'OB-' . str_pad((string) $supplier->id, 5, '0', STR_PAD_LEFT),
                    'invoice_total'    => $openingBalance,
                    'total_paid'       => 0,
                    'credit_remaining' => $openingBalance,
                    'debited_amount'   => 0,
                    'description'      => 'Opening Balance',
                    'created_by'       => $request->user()?->id,
                ]);
            }

            return $supplier;
        });

        return response()->json($supplier, 201);
    }

    /**
     * GET /api/suppliers/{supplier}
     */
    public function show(Supplier $supplier)
    {
        $this->authorize('view', $supplier);

        $supplier->loadCount('products');

        $intimationBatches = [];
        if (Schema::hasTable('batches')) {
            $rows = DB::table('batches as b')
                ->join('products as p', 'p.id', '=', 'b.product_id')
                ->leftJoin('brands as br', 'br.id', '=', 'p.brand_id')
                ->where('p.supplier_id', $supplier->id)
                ->whereNotNull('b.expiry_date')
                ->where('b.quantity', '>', 0)
                ->select(
                    'b.id as batch_id',
                    'b.batch_number',
                    'b.expiry_date',
                    'b.quantity',
                    'p.id as product_id',
                    'p.name as product_name',
                    'p.product_code',
                    'p.pack_size',
                    DB::raw('COALESCE(br.name, "") as brand_name')
                )
                ->orderBy('b.expiry_date', 'asc')
                ->limit(150)
                ->get();

            foreach ($rows as $r) {
                $eval = BrandController::evaluateBatchIntimation(
                    $r->expiry_date,
                    (string) ($supplier->expiry_return_policy ?: 'before_expiry'),
                    (int) ($supplier->expiry_return_months ?? 3),
                    (int) ($supplier->expiry_return_days ?? 90)
                );
                $intimationBatches[] = array_merge((array) $r, $eval);
            }
        }

        $payload = $supplier->toArray();
        $payload['intimation_batches'] = $intimationBatches;

        return response()->json($payload);
    }

    public function creditSummary(Supplier $supplier)
    {
        $this->authorize('lookup', $supplier);

        $totalOutstanding = Schema::hasTable('supplier_ledgers')
            ? \App\Models\SupplierLedger::getSupplierNetBalance($supplier->id)
            : collect(app(\App\Services\PaymentService::class)->getOpenInvoicesForSupplier($supplier->id))->sum('due');

        $creditLimit = $supplier->credit_limit !== null ? (float)$supplier->credit_limit : null;
        $availableCredit = $creditLimit !== null ? max(0.0, round($creditLimit - $totalOutstanding, 2)) : null;

        $today = now()->toDateString();
        $totalOverdue = 0.0;
        $overdueCount = 0;
        $oldestDue = null;

        $openInvoices = app(\App\Services\PaymentService::class)->getOpenInvoicesForSupplier($supplier->id);
        foreach ($openInvoices as $inv) {
            $dueDate = $inv['due_date'] ?? $inv['date'];
            if ($dueDate && $dueDate < $today) {
                $totalOverdue += (float)$inv['due'];
                $overdueCount++;
                if ($oldestDue === null || $dueDate < $oldestDue) {
                    $oldestDue = $dueDate;
                }
            }
        }

        // Also check standalone manual/opening balance ledger entries for overdue status
        if (Schema::hasTable('supplier_ledgers')) {
            $creditDays = (int) ($supplier->credit_days ?? 30);
            $manualRows = \App\Models\SupplierLedger::where('supplier_id', $supplier->id)
                ->whereNull('purchase_invoice_id')
                ->whereIn('entry_type', ['manual', 'invoice'])
                ->get();

            foreach ($manualRows as $mRow) {
                $mDue = max(0.0, round((float) ($mRow->invoice_total ?? 0) - (float) ($mRow->total_paid ?? 0), 2));
                if ($mDue <= 0.01) {
                    continue;
                }
                $dueDate = $mRow->due_date
                    ? $mRow->due_date->toDateString()
                    : ($mRow->entry_date ? $mRow->entry_date->copy()->addDays($creditDays)->toDateString() : null);

                if ($dueDate && $dueDate < $today) {
                    $totalOverdue += $mDue;
                    $overdueCount++;
                    if ($oldestDue === null || $dueDate < $oldestDue) {
                        $oldestDue = $dueDate;
                    }
                }
            }
        }

        $totalOverdue = min($totalOverdue, $totalOutstanding);
        if ($totalOverdue <= 0.01) {
            $totalOverdue = 0.0;
            $overdueCount = 0;
            $oldestDue = null;
        }

        return response()->json([
            'supplier_id'            => $supplier->id,
            'name'                   => $supplier->name,
            'phone'                  => $supplier->phone,
            'credit_limit'           => $creditLimit,
            'credit_days'            => $supplier->credit_days ?? 30,
            'net_balance'            => round($totalOutstanding, 2),
            'current_balance'        => round($totalOutstanding, 2),
            'available_credit'       => $availableCredit,
            'is_limit_exceeded'      => $creditLimit !== null && $creditLimit > 0 && $totalOutstanding > $creditLimit,
            'total_overdue'          => round($totalOverdue, 2),
            'overdue_invoices_count' => $overdueCount,
            'oldest_due_date'        => $oldestDue,
        ]);
    }

    /**
     * PUT/PATCH /api/suppliers/{supplier}
     */
    public function update(Request $request, Supplier $supplier)
    {
        $this->authorize('update', $supplier);

        $data = $request->validate([
            'name'                 => 'required|string|max:150|unique:suppliers,name,' . $supplier->id,
            'address'              => 'nullable|string|max:255',
            'phone'                => 'nullable|string|max:50',
            'tax_number'           => 'nullable|string|max:60',
            'tax_status'           => 'nullable|string|in:registered,unregistered,exempt',
            'email'                => 'nullable|email|max:150',
            'credit_limit'         => 'nullable|numeric|min:0',
            'credit_days'          => 'nullable|integer|min:0|max:365',
            'expiry_return_policy' => 'nullable|string|in:before_expiry,accepts_expired,non_returnable',
            'expiry_return_months' => 'nullable|integer|min:0|max:120',
            'expiry_return_days'   => 'nullable|integer|min:0|max:3650',
            'expiry_return_notes'  => 'nullable|string|max:500',
        ]);

        if (
            $request->hasAny(['expiry_return_policy', 'expiry_return_months', 'expiry_return_days', 'expiry_return_notes'])
        ) {
            $data = BrandController::normalizeExpiryPolicyPayload(array_merge([
                'expiry_return_policy' => $supplier->expiry_return_policy ?? 'before_expiry',
                'expiry_return_months' => $supplier->expiry_return_months ?? 3,
                'expiry_return_days'   => $supplier->expiry_return_days ?? 90,
                'expiry_return_notes'  => $supplier->expiry_return_notes,
            ], $data));
        }

        $supplier->update($data);

        return response()->json($supplier->fresh());
    }

    /**
     * DELETE /api/suppliers/{supplier}
     */
    public function destroy(Supplier $supplier)
    {
        $this->authorize('delete', $supplier);

        // HARD GUARD: block delete if any product references this supplier
        $inUse = Product::where('supplier_id', $supplier->id)->exists();
        if ($inUse) {
            return response()->json([
                'message' => 'Cannot delete: supplier is used by one or more products.'
            ], 422);
        }

        $supplier->delete();

        return response()->json(null, 204);
    }

    /**
     * GET /api/suppliers/export
     */
    public function export(): StreamedResponse
    {
        $this->authorize('export', Supplier::class);

        $file = 'suppliers_' . now()->format('Y-m-d_H-i-s') . '.csv';

        return response()->streamDownload(function () {
            $out = fopen('php://output', 'w');

            // UTF-8 BOM for Excel
            fprintf($out, chr(0xEF) . chr(0xBB) . chr(0xBF));

            // Header
            fputcsv($out, ['name', 'address', 'phone', 'expiry_return_policy', 'expiry_return_months', 'expiry_return_days', 'expiry_return_notes']);

            $sanitizeCsv = static function ($val) {
                $str = (string) ($val ?? '');
                if ($str !== '' && in_array($str[0], ['=', '+', '-', '@', "\t", "\r"], true) && !preg_match('/^[+-]?\d+(\.\d+)?$/', $str)) {
                    return "'" . $str;
                }
                return $str;
            };

            // Rows (streamed)
            Supplier::select('name', 'address', 'phone', 'expiry_return_policy', 'expiry_return_months', 'expiry_return_days', 'expiry_return_notes')
                ->orderBy('name')
                ->chunk(1000, function ($chunk) use ($out, $sanitizeCsv) {
                    foreach ($chunk as $s) {
                        fputcsv($out, [
                            $sanitizeCsv($s->name ?? ''),
                            $sanitizeCsv($s->address ?? ''),
                            $sanitizeCsv($s->phone ?? ''),
                            $sanitizeCsv($s->expiry_return_policy ?? 'before_expiry'),
                            (string) ($s->expiry_return_months ?? 3),
                            (string) ($s->expiry_return_days ?? 90),
                            $sanitizeCsv($s->expiry_return_notes ?? ''),
                        ]);
                    }
                });

            fclose($out);
        }, $file, ['Content-Type' => 'text/csv; charset=UTF-8']);
    }
}
