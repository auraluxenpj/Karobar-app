<?php

namespace App\Http\Controllers;

use App\Models\Customer;
use App\Models\CustomerLedger;
use App\Models\CustomerRegularItem;
use App\Services\DocumentShareService;
use Carbon\Carbon;
use Illuminate\Database\Schema\Blueprint;
use Illuminate\Http\Request;
use Illuminate\Support\Facades\DB;
use Illuminate\Support\Facades\Schema;
use Symfony\Component\HttpFoundation\StreamedResponse;

class CustomerController extends Controller
{
    protected static bool $regularSchemaChecked = false;

    public static function ensureRegularCustomerSchema(): void
    {
        if (self::$regularSchemaChecked) {
            return;
        }

        try {
            if (Schema::hasTable('customers')) {
                Schema::table('customers', function (Blueprint $table) {
                    if (!Schema::hasColumn('customers', 'is_regular')) {
                        $table->boolean('is_regular')->default(false)->index();
                    }
                    if (!Schema::hasColumn('customers', 'refill_cycle')) {
                        $table->string('refill_cycle', 20)->nullable()->default('monthly');
                    }
                    if (!Schema::hasColumn('customers', 'refill_custom_days')) {
                        $table->unsignedSmallInteger('refill_custom_days')->nullable();
                    }
                    if (!Schema::hasColumn('customers', 'reminder_lead_days')) {
                        $table->unsignedSmallInteger('reminder_lead_days')->default(2);
                    }
                    if (!Schema::hasColumn('customers', 'next_refill_date')) {
                        $table->date('next_refill_date')->nullable()->index();
                    }
                    if (!Schema::hasColumn('customers', 'last_refill_reminded_at')) {
                        $table->timestamp('last_refill_reminded_at')->nullable();
                    }
                    if (!Schema::hasColumn('customers', 'last_refill_collected_at')) {
                        $table->timestamp('last_refill_collected_at')->nullable();
                    }
                    if (!Schema::hasColumn('customers', 'reminder_language')) {
                        $table->string('reminder_language', 16)->default('english');
                    }
                    if (!Schema::hasColumn('customers', 'regular_notes')) {
                        $table->text('regular_notes')->nullable();
                    }
                });
            }

            if (!Schema::hasTable('customer_regular_items')) {
                Schema::create('customer_regular_items', function (Blueprint $table) {
                    $table->id();
                    $table->foreignId('customer_id')->constrained('customers')->cascadeOnDelete();
                    $table->foreignId('product_id')->constrained('products')->cascadeOnDelete();
                    $table->unsignedInteger('pack_quantity')->default(0);
                    $table->unsignedInteger('unit_quantity')->default(1);
                    $table->string('dosage_notes', 255)->nullable();
                    $table->timestamps();
                    $table->index(['customer_id', 'product_id']);
                });
            } else {
                Schema::table('customer_regular_items', function (Blueprint $table) {
                    if (!Schema::hasColumn('customer_regular_items', 'pack_quantity')) {
                        $table->unsignedInteger('pack_quantity')->default(0);
                    }
                    if (!Schema::hasColumn('customer_regular_items', 'unit_quantity')) {
                        $table->unsignedInteger('unit_quantity')->default(1);
                    }
                    if (!Schema::hasColumn('customer_regular_items', 'dosage_notes')) {
                        $table->string('dosage_notes', 255)->nullable();
                    }
                });
            }

            self::$regularSchemaChecked = true;
        } catch (\Throwable) {
            // Ignore in read-only environments
        }
    }

    public function search(Request $request)
    {
        $this->authorize('lookup', Customer::class);
        $q     = trim((string) $request->query('q', ''));
        $page  = max(1, (int) $request->query('page', 1));
        $limit = min(50, max(5, (int) $request->query('limit', 20)));

        $builder = Customer::query();

        if ($q !== '') {
            $builder->where(function ($w) use ($q) {
                $w->where('name', 'like', "%{$q}%")
                  ->orWhere('phone', 'like', "%{$q}%")
                  ->orWhere('email', 'like', "%{$q}%");
            });
        } else {
            $builder->orderByRaw("CASE WHEN id = 1 OR UPPER(name) LIKE '%WALK-IN%' THEN 0 ELSE 1 END ASC");
        }

        $builder->orderBy('name');

        $paginator = $builder->paginate($limit, ['*'], 'page', $page);

        return response()->json([
            'data'      => $paginator->items(),
            'next_page' => $paginator->hasMorePages() ? ($paginator->currentPage() + 1) : null,
        ]);
    }

    public function index()
    {
        $this->authorize('viewAny', Customer::class);
        self::ensureRegularCustomerSchema();

        $customers = Customer::query()
            ->select('customers.*')
            ->selectSub(
                'SELECT COUNT(*) FROM sale_invoices si WHERE si.customer_id = customers.id',
                'sale_invoices_count'
            )
            ->selectSub(
                'SELECT COUNT(*) FROM sale_returns sr WHERE sr.customer_id = customers.id',
                'sale_returns_count'
            )
            ->with([
                'regularItems.product:id,name,product_code,quantity,pack_size,unit_sale_price,pack_sale_price',
            ])
            ->orderBy('name')
            ->get();

        $customers->transform(function (Customer $c) {
            $c->transactions_count = (int) ($c->sale_invoices_count ?? 0) + (int) ($c->sale_returns_count ?? 0);
            return $this->appendRegularMetadata($c);
        });

        return response()->json($customers);
    }

    public function store(Request $request)
    {
        $this->authorize('create', Customer::class);
        self::ensureRegularCustomerSchema();

        $validated = $request->validate([
            'name'                           => 'required|unique:customers,name',
            'email'                          => 'nullable|email|unique:customers,email',
            'phone'                          => 'nullable|string',
            'tax_number'                     => 'nullable|string|max:60',
            'tax_status'                     => 'nullable|string|in:registered,unregistered,exempt',
            'address'                        => 'nullable|string',
            'credit_limit'                   => 'nullable|numeric|min:0',
            'credit_days'                    => 'nullable|integer|min:0|max:365',
            'credit_status'                  => 'nullable|string|in:active,on_hold,blocked',
            'opening_balance'                => 'nullable|numeric|min:0',
            'is_regular'                     => 'nullable|boolean',
            'refill_cycle'                   => 'nullable|string|in:weekly,biweekly,monthly,custom',
            'refill_custom_days'             => 'nullable|integer|min:1|max:365',
            'reminder_lead_days'             => 'nullable|integer|min:0|max:60',
            'next_refill_date'               => 'nullable|date',
            'reminder_language'              => 'nullable|string|in:english,urdu',
            'regular_notes'                  => 'nullable|string|max:2000',
            'regular_items'                  => 'nullable|array',
            'regular_items.*.product_id'     => 'required_with:regular_items|integer|exists:products,id',
            'regular_items.*.pack_quantity'  => 'nullable|numeric|min:0',
            'regular_items.*.unit_quantity'  => 'nullable|integer|min:0',
            'regular_items.*.dosage_notes'   => 'nullable|string|max:255',
        ]);

        $openingBalance = round((float) ($validated['opening_balance'] ?? 0), 2);
        $regularItems = $validated['regular_items'] ?? null;
        unset($validated['opening_balance'], $validated['regular_items']);

        $validated = $this->normalizeRegularFields($validated);

        $customer = DB::transaction(function () use ($validated, $openingBalance, $regularItems, $request) {
            $customer = Customer::create($validated);

            if (is_array($regularItems)) {
                $this->syncRegularItems($customer, $regularItems);
            }

            if ($openingBalance > 0 && Schema::hasTable('customer_ledgers')) {
                CustomerLedger::create([
                    'customer_id'       => $customer->id,
                    'entry_type'        => 'manual',
                    'is_manual'         => true,
                    'entry_date'        => now()->toDateString(),
                    'posted_number'     => 'OB-' . str_pad((string) $customer->id, 5, '0', STR_PAD_LEFT),
                    'invoice_total'     => $openingBalance,
                    'total_received'    => 0,
                    'balance_remaining' => $openingBalance,
                    'credited_amount'   => 0,
                    'description'       => 'Opening Balance',
                    'created_by'        => $request->user()?->id,
                ]);
            }

            return $customer;
        });

        $customer->load(['regularItems.product:id,name,product_code,quantity,pack_size,unit_sale_price,pack_sale_price']);

        return response()->json($this->appendRegularMetadata($customer), 201);
    }

    public function show(Customer $customer)
    {
        $this->authorize('view', $customer);
        self::ensureRegularCustomerSchema();

        $customer->load([
            'regularItems.product:id,name,product_code,quantity,pack_size,unit_sale_price,pack_sale_price',
        ]);

        return response()->json($this->appendRegularMetadata($customer));
    }

    public function creditSummary(Customer $customer)
    {
        $this->authorize('lookup', $customer);

        $netBalance = CustomerLedger::getCustomerNetBalance($customer->id);
        $creditLimit = $customer->credit_limit !== null ? (float) $customer->credit_limit : null;
        $availableCredit = $creditLimit !== null ? max(0.0, round($creditLimit - $netBalance, 2)) : null;
        $isLimitExceeded = $creditLimit !== null && $creditLimit > 0 && $netBalance > $creditLimit;

        $today = now()->toDateString();
        $openInvoices = app(\App\Services\PaymentService::class)->getOpenInvoicesForCustomer($customer->id);
        $totalOverdue = 0.0;
        $overdueCount = 0;
        $oldestDue = null;

        foreach ($openInvoices as $inv) {
            $dueDate = $inv['due_date'] ?? $inv['date'];
            if ($dueDate < $today) {
                $totalOverdue += (float) $inv['due'];
                $overdueCount++;
                if ($oldestDue === null || $dueDate < $oldestDue) {
                    $oldestDue = $dueDate;
                }
            }
        }

        return response()->json([
            'customer_id'            => $customer->id,
            'name'                   => $customer->name,
            'phone'                  => $customer->phone,
            'credit_status'          => $customer->credit_status ?? 'active',
            'credit_limit'           => $creditLimit,
            'credit_days'            => $customer->credit_days ?? 30,
            'net_balance'            => round($netBalance, 2),
            'current_balance'        => round($netBalance, 2),
            'available_credit'       => $availableCredit,
            'is_limit_exceeded'      => $isLimitExceeded,
            'total_overdue'          => round($totalOverdue, 2),
            'overdue_invoices_count' => $overdueCount,
            'oldest_due_date'        => $oldestDue,
        ]);
    }

    public function update(Request $request, Customer $customer)
    {
        $this->authorize('update', $customer);
        self::ensureRegularCustomerSchema();

        $validated = $request->validate([
            'name'                           => 'required|unique:customers,name,' . $customer->id,
            'email'                          => 'nullable|email|unique:customers,email,' . $customer->id,
            'phone'                          => 'nullable|string',
            'tax_number'                     => 'nullable|string|max:60',
            'tax_status'                     => 'nullable|string|in:registered,unregistered,exempt',
            'address'                        => 'nullable|string',
            'credit_limit'                   => 'nullable|numeric|min:0',
            'credit_days'                    => 'nullable|integer|min:0|max:365',
            'credit_status'                  => 'nullable|string|in:active,on_hold,blocked',
            'is_regular'                     => 'nullable|boolean',
            'refill_cycle'                   => 'nullable|string|in:weekly,biweekly,monthly,custom',
            'refill_custom_days'             => 'nullable|integer|min:1|max:365',
            'reminder_lead_days'             => 'nullable|integer|min:0|max:60',
            'next_refill_date'               => 'nullable|date',
            'reminder_language'              => 'nullable|string|in:english,urdu',
            'regular_notes'                  => 'nullable|string|max:2000',
            'regular_items'                  => 'nullable|array',
            'regular_items.*.product_id'     => 'required_with:regular_items|integer|exists:products,id',
            'regular_items.*.pack_quantity'  => 'nullable|numeric|min:0',
            'regular_items.*.unit_quantity'  => 'nullable|integer|min:0',
            'regular_items.*.dosage_notes'   => 'nullable|string|max:255',
        ]);

        $regularItems = $validated['regular_items'] ?? null;
        unset($validated['regular_items']);

        $validated = $this->normalizeRegularFields($validated, $customer);

        DB::transaction(function () use ($customer, $validated, $regularItems) {
            $customer->update($validated);
            if (is_array($regularItems)) {
                $this->syncRegularItems($customer, $regularItems);
            }
        });

        $customer->load(['regularItems.product:id,name,product_code,quantity,pack_size,unit_sale_price,pack_sale_price']);

        return response()->json($this->appendRegularMetadata($customer));
    }

    /**
     * GET /api/customers/{customer}/refill-reminder-preview
     */
    public function refillReminderPreview(Request $request, Customer $customer, DocumentShareService $shareService)
    {
        $this->authorize('view', $customer);
        self::ensureRegularCustomerSchema();

        $customer->load(['regularItems.product:id,name,product_code,quantity,pack_size,unit_sale_price,pack_sale_price']);
        $this->appendRegularMetadata($customer);

        $lang = $request->query('language') ?: ($customer->reminder_language ?: 'english');
        $templates = $shareService->formatRegularCustomerReminder($customer, (string) $lang);

        return response()->json([
            'customer_id'       => $customer->id,
            'customer_name'     => $customer->name,
            'phone'             => $customer->phone ?? '',
            'normalized_phone'  => $shareService->normalizePhone($customer->phone),
            'refill_cycle'      => $customer->refill_cycle ?? 'monthly',
            'next_refill_date'  => $customer->next_refill_date?->format('Y-m-d'),
            'stock_ready'       => $customer->stock_ready,
            'out_of_stock_count'=> $customer->out_of_stock_count,
            'regular_items'     => $customer->regularItems,
            'templates'         => $templates,
            'whatsapp_enabled'  => $shareService->isWhatsAppApiConfigured(),
            'whatsapp_provider' => $shareService->resolveWhatsAppProvider(),
        ]);
    }

    /**
     * POST /api/customers/{customer}/send-refill-reminder
     */
    public function sendRefillReminder(Request $request, Customer $customer, DocumentShareService $shareService)
    {
        $user = $request->user();
        if (
            !$user
            || (
                !$user->hasRole(['Admin', 'admin', 'super-admin'])
                && !$user->can('customer.update')
                && !$user->can('customer.create')
                && !$user->can('sale-invoice.create')
            )
        ) {
            abort(403, 'This action is unauthorized.');
        }
        self::ensureRegularCustomerSchema();

        $validated = $request->validate([
            'phone'         => 'nullable|string|max:50',
            'language'      => 'nullable|string|in:english,urdu',
            'message'       => 'nullable|string|max:4000',
            'save_phone'    => 'nullable|boolean',
            'advance_cycle' => 'nullable|boolean',
        ]);

        $customer->load(['regularItems.product:id,name,product_code,quantity,pack_size,unit_sale_price,pack_sale_price']);

        $rawPhone = trim((string) ($validated['phone'] ?? $customer->phone ?? ''));
        if ($rawPhone === '') {
            return response()->json([
                'message' => "Customer \"{$customer->name}\" does not have a phone number configured.",
            ], 422);
        }

        if (!empty($validated['save_phone']) && $rawPhone !== (string) $customer->phone) {
            $customer->phone = $rawPhone;
        }

        $language = $validated['language'] ?? $customer->reminder_language ?? 'english';
        $customer->reminder_language = $language;

        $customMessage = trim((string) ($validated['message'] ?? ''));
        if ($customMessage === '') {
            $templates = $shareService->formatRegularCustomerReminder($customer, $language);
            $customMessage = $templates['message'];
        }

        try {
            $sendResult = $shareService->sendWhatsAppTextMessage($rawPhone, $customMessage);
        } catch (\Throwable $e) {
            return response()->json([
                'message' => $e->getMessage(),
            ], 422);
        }

        $customer->last_refill_reminded_at = now();

        if (!empty($validated['advance_cycle'])) {
            $customer->next_refill_date = $this->calculateNextRefillDate($customer);
            $customer->last_refill_collected_at = now();
        }

        $customer->save();

        return response()->json([
            ...$sendResult,
            'customer' => $this->appendRegularMetadata($customer),
        ]);
    }

    /**
     * POST /api/customers/send-bulk-refill-reminders
     */
    public function sendBulkRefillReminders(Request $request, DocumentShareService $shareService)
    {
        $user = $request->user();
        if (
            !$user
            || (
                !$user->hasRole(['Admin', 'admin', 'super-admin'])
                && !$user->can('customer.update')
                && !$user->can('customer.create')
                && !$user->can('sale-invoice.create')
            )
        ) {
            abort(403, 'This action is unauthorized.');
        }
        self::ensureRegularCustomerSchema();

        $validated = $request->validate([
            'customer_ids'   => 'nullable|array',
            'customer_ids.*' => 'integer|exists:customers,id',
            'language'       => 'nullable|string|in:english,urdu',
            'only_stock_ready' => 'nullable|boolean',
        ]);

        $query = Customer::query()
            ->where('is_regular', true)
            ->with(['regularItems.product:id,name,product_code,quantity,pack_size,unit_sale_price,pack_sale_price']);

        if (!empty($validated['customer_ids'])) {
            $query->whereIn('id', $validated['customer_ids']);
        }

        $customers = $query->orderBy('name')->get();

        $sentCount = 0;
        $fallbackCount = 0;
        $skippedCount = 0;
        $results = [];

        foreach ($customers as $customer) {
            $meta = $this->computeRegularMetadata($customer);

            if (empty($validated['customer_ids']) && !$meta['is_due_for_reminder']) {
                continue;
            }

            if (!empty($validated['only_stock_ready']) && !$meta['stock_ready']) {
                $skippedCount++;
                $results[] = [
                    'customer_id'   => $customer->id,
                    'customer_name' => $customer->name,
                    'status'        => 'skipped_out_of_stock',
                    'message'       => 'Skipped because one or more regular items are out of stock.',
                ];
                continue;
            }

            $rawPhone = trim((string) ($customer->phone ?? ''));
            if ($rawPhone === '') {
                $skippedCount++;
                $results[] = [
                    'customer_id'   => $customer->id,
                    'customer_name' => $customer->name,
                    'status'        => 'skipped_no_phone',
                    'message'       => 'Skipped because customer has no phone number.',
                ];
                continue;
            }

            $lang = $validated['language'] ?? $customer->reminder_language ?? 'english';
            $templates = $shareService->formatRegularCustomerReminder($customer, $lang);

            try {
                $res = $shareService->sendWhatsAppTextMessage($rawPhone, $templates['message']);
                $customer->last_refill_reminded_at = now();
                $customer->save();

                if (($res['status'] ?? '') === 'sent_via_api') {
                    $sentCount++;
                } else {
                    $fallbackCount++;
                }

                $results[] = [
                    'customer_id'   => $customer->id,
                    'customer_name' => $customer->name,
                    'phone'         => $rawPhone,
                    ...$res,
                ];
            } catch (\Throwable $e) {
                $skippedCount++;
                $results[] = [
                    'customer_id'   => $customer->id,
                    'customer_name' => $customer->name,
                    'status'        => 'failed',
                    'message'       => $e->getMessage(),
                ];
            }
        }

        return response()->json([
            'sent_count'     => $sentCount,
            'fallback_count' => $fallbackCount,
            'skipped_count'  => $skippedCount,
            'total_processed'=> count($results),
            'results'        => $results,
            'message'        => "Processed " . count($results) . " regular customer reminders ({$sentCount} sent via WhatsApp Agent, {$fallbackCount} prepared via link, {$skippedCount} skipped).",
        ]);
    }

    /**
     * POST /api/customers/{customer}/advance-refill-cycle
     */
    public function advanceRefillCycle(Customer $customer)
    {
        $this->authorize('update', $customer);
        self::ensureRegularCustomerSchema();

        $customer->next_refill_date = $this->calculateNextRefillDate($customer);
        $customer->last_refill_collected_at = now();
        $customer->save();

        $customer->load(['regularItems.product:id,name,product_code,quantity,pack_size,unit_sale_price,pack_sale_price']);

        return response()->json([
            'message'          => "Next refill collection date advanced to {$customer->next_refill_date?->format('d M Y')}.",
            'next_refill_date' => $customer->next_refill_date?->format('Y-m-d'),
            'customer'         => $this->appendRegularMetadata($customer),
        ]);
    }

    public function destroy(Customer $customer)
    {
        $this->authorize('delete', $customer);
        $hasInvoices = DB::table('sale_invoices')->where('customer_id', $customer->id)->exists();
        $hasReturns  = DB::table('sale_returns')->where('customer_id', $customer->id)->exists();

        if ($hasInvoices || $hasReturns) {
            return response()->json([
                'message' => 'Cannot delete: customer has related sale invoices/returns.',
            ], 422);
        }

        $customer->delete();
        return response()->json(null, 204);
    }

    public function export(): StreamedResponse
    {
        $this->authorize('export', Customer::class);
        $file = 'customers_' . now()->format('Y-m-d_H-i-s') . '.csv';

        return response()->streamDownload(function () {
            $out = fopen('php://output', 'w');
            fprintf($out, chr(0xEF) . chr(0xBB) . chr(0xBF));
            fputcsv($out, ['name', 'email', 'phone', 'address', 'is_regular', 'refill_cycle', 'next_refill_date']);

            $sanitizeCsv = static function ($val) {
                $str = (string) ($val ?? '');
                if ($str !== '' && in_array($str[0], ['=', '+', '-', '@', "\t", "\r"], true) && !preg_match('/^[+-]?\d+(\.\d+)?$/', $str)) {
                    return "'" . $str;
                }
                return $str;
            };

            Customer::select('name', 'email', 'phone', 'address', 'is_regular', 'refill_cycle', 'next_refill_date')
                ->orderBy('name')
                ->chunk(1000, function ($chunk) use ($out, $sanitizeCsv) {
                    foreach ($chunk as $c) {
                        fputcsv($out, [
                            $sanitizeCsv($c->name ?? ''),
                            $sanitizeCsv($c->email ?? ''),
                            $sanitizeCsv($c->phone ?? ''),
                            $sanitizeCsv($c->address ?? ''),
                            $c->is_regular ? 'Yes' : 'No',
                            $sanitizeCsv($c->refill_cycle ?? ''),
                            $c->next_refill_date ? Carbon::parse($c->next_refill_date)->format('Y-m-d') : '',
                        ]);
                    }
                });

            fclose($out);
        }, $file, ['Content-Type' => 'text/csv; charset=UTF-8']);
    }

    protected function normalizeRegularFields(array $validated, ?Customer $existing = null): array
    {
        if (array_key_exists('is_regular', $validated)) {
            $validated['is_regular'] = (bool) $validated['is_regular'];
        }

        $isRegular = $validated['is_regular'] ?? $existing?->is_regular ?? false;

        if ($isRegular) {
            $cycle = $validated['refill_cycle'] ?? $existing?->refill_cycle ?? 'monthly';
            $validated['refill_cycle'] = $cycle;
            $validated['reminder_lead_days'] = (int) ($validated['reminder_lead_days'] ?? $existing?->reminder_lead_days ?? 2);
            $validated['reminder_language'] = $validated['reminder_language'] ?? $existing?->reminder_language ?? 'english';

            if (empty($validated['next_refill_date']) && empty($existing?->next_refill_date)) {
                $customDays = (int) ($validated['refill_custom_days'] ?? 30);
                $validated['next_refill_date'] = match ($cycle) {
                    'weekly'   => now()->addDays(7)->toDateString(),
                    'biweekly' => now()->addDays(14)->toDateString(),
                    'custom'   => now()->addDays(max(1, $customDays))->toDateString(),
                    default    => now()->addMonth()->toDateString(),
                };
            }
        }

        return $validated;
    }

    protected function syncRegularItems(Customer $customer, array $items): void
    {
        $customer->regularItems()->delete();

        $productIds = collect($items)->pluck('product_id')->filter()->unique()->values()->all();
        $packSizes = empty($productIds)
            ? []
            : \App\Models\Product::whereIn('id', $productIds)->pluck('pack_size', 'id')->all();

        foreach ($items as $row) {
            $productId = (int) ($row['product_id'] ?? 0);
            if ($productId <= 0) {
                continue;
            }
            $packSize = max(1, (int) ($packSizes[$productId] ?? 1));
            $rawPackQty = max(0, (float) ($row['pack_quantity'] ?? 0));
            $rawUnitQty = max(0, (int) ($row['unit_quantity'] ?? 0));

            if ($rawUnitQty > 0) {
                $unitQty = $rawUnitQty;
                $packQty = (int) floor($unitQty / $packSize);
            } elseif ($rawPackQty > 0) {
                $unitQty = max(1, (int) round($rawPackQty * $packSize));
                $packQty = (int) floor($rawPackQty);
            } else {
                $unitQty = $packSize;
                $packQty = 1;
            }

            CustomerRegularItem::create([
                'customer_id'   => $customer->id,
                'product_id'    => $productId,
                'pack_quantity' => $packQty,
                'unit_quantity' => $unitQty,
                'dosage_notes'  => isset($row['dosage_notes']) ? trim((string) $row['dosage_notes']) : null,
            ]);
        }
    }

    public function calculateNextRefillDate(Customer $customer): string
    {
        $base = $customer->next_refill_date
            ? Carbon::parse($customer->next_refill_date)->startOfDay()
            : now()->startOfDay();

        if ($base->lt(now()->startOfDay())) {
            $base = now()->startOfDay();
        }

        $cycle = strtolower((string) ($customer->refill_cycle ?: 'monthly'));
        $customDays = max(1, (int) ($customer->refill_custom_days ?: 30));

        return match ($cycle) {
            'weekly'   => $base->copy()->addDays(7)->toDateString(),
            'biweekly' => $base->copy()->addDays(14)->toDateString(),
            'custom'   => $base->copy()->addDays($customDays)->toDateString(),
            default    => $base->copy()->addMonth()->toDateString(),
        };
    }

    public function computeRegularMetadata(Customer $customer): array
    {
        $items = $customer->relationLoaded('regularItems') ? $customer->regularItems : collect();
        $outOfStockCount = 0;

        foreach ($items as $item) {
            $prod = $item->product;
            $packSize = max(1, (int) ($prod?->pack_size ?? 1));
            $unitQty = (int) ($item->unit_quantity ?? 0);
            $packQty = (float) ($item->pack_quantity ?? 0);
            $requiredUnits = $unitQty > 0
                ? $unitQty
                : max(1, (int) round($packQty * $packSize));
            $onHandUnits = (int) ($prod?->quantity ?? 0);
            $item->setAttribute('required_total_units', $requiredUnits);
            $item->setAttribute('on_hand_units', $onHandUnits);
            $item->setAttribute('in_stock', $onHandUnits >= $requiredUnits);
            if ($onHandUnits < $requiredUnits) {
                $outOfStockCount++;
            }
        }

        $daysUntilRefill = null;
        $isDueForReminder = false;
        $isOverdueRefill = false;

        if ($customer->is_regular && $customer->next_refill_date) {
            $today = now()->startOfDay();
            $due = Carbon::parse($customer->next_refill_date)->startOfDay();
            $daysUntilRefill = (int) $today->diffInDays($due, false);
            $leadDays = (int) ($customer->reminder_lead_days ?? 2);
            $isDueForReminder = $daysUntilRefill <= $leadDays;
            $isOverdueRefill = $daysUntilRefill < 0;
        }

        return [
            'regular_items_count' => $items->count(),
            'out_of_stock_count'  => $outOfStockCount,
            'stock_ready'         => $outOfStockCount === 0,
            'days_until_refill'   => $daysUntilRefill,
            'is_due_for_reminder' => $isDueForReminder,
            'is_overdue_refill'   => $isOverdueRefill,
        ];
    }

    public function appendRegularMetadata(Customer $customer): Customer
    {
        $meta = $this->computeRegularMetadata($customer);
        foreach ($meta as $key => $val) {
            $customer->setAttribute($key, $val);
        }

        return $customer;
    }
}
