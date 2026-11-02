<?php

namespace App\Services;

use App\Models\Account;
use App\Models\CashDrawerSession;
use App\Models\CashDrawerTransaction;
use App\Models\Expense;
use App\Models\ExpenseCategory;
use App\Models\User;
use Carbon\Carbon;
use Illuminate\Support\Facades\DB;
use Illuminate\Support\Facades\Storage;
use Illuminate\Validation\ValidationException;

class ExpenseService
{
    protected AccountService $accountService;
    protected CashDrawerService $cashDrawerService;

    public function __construct(
        AccountService $accountService,
        CashDrawerService $cashDrawerService
    ) {
        $this->accountService = $accountService;
        $this->cashDrawerService = $cashDrawerService;
    }

    /**
     * Create a new expense with transactional account and drawer deductions.
     */
    public function createExpense(array $data, ?User $user = null): Expense
    {
        return DB::transaction(function () use ($data, $user) {
            $amount = round((float) ($data['amount'] ?? 0), 2);
            if ($amount <= 0) {
                throw ValidationException::withMessages(['amount' => 'Expense amount must be greater than zero.']);
            }

            $dateStr = $data['date'] ?? Carbon::today()->toDateString();
            $expenseNumber = Expense::generateExpenseNumber($dateStr);
            $paymentMethod = $data['payment_method'] ?? 'cash';
            $category = ExpenseCategory::findOrFail($data['expense_category_id']);

            // Resolve target account
            $account = null;
            if (!empty($data['account_id'])) {
                $account = Account::find($data['account_id']);
            }
            if (!$account) {
                $account = $this->accountService->getDefaultAccount($paymentMethod);
            }

            $drawerSession = null;
            if ($paymentMethod === 'cash') {
                // If cashier has an active open session, link to it
                $drawerSession = $this->cashDrawerService->getCurrentSession($user);
            }

            $isRecurring = !empty($data['is_recurring']) && filter_var($data['is_recurring'], FILTER_VALIDATE_BOOLEAN);

            $expense = Expense::create([
                'expense_number'         => $expenseNumber,
                'expense_category_id'    => $category->id,
                'account_id'             => $account?->id,
                'user_id'                => $user?->id,
                'cash_drawer_session_id' => $drawerSession?->id,
                'amount'                 => $amount,
                'date'                   => $dateStr,
                'payment_method'         => $paymentMethod,
                'reference_number'       => $data['reference_number'] ?? null,
                'payee'                  => $data['payee'] ?? null,
                'description'            => $data['description'] ?? null,
                'receipt_path'           => $data['receipt_path'] ?? null,
                'is_recurring'           => $isRecurring,
                'recurring_frequency'    => $isRecurring ? ($data['recurring_frequency'] ?? null) : null,
            ]);

            // Apply financial deductions
            if ($account) {
                $this->accountService->withdraw(
                    $account,
                    $amount,
                    Expense::class,
                    $expense->id,
                    "Expense: {$category->name} - {$expense->expense_number}" . ($expense->payee ? " ({$expense->payee})" : ""),
                    $user
                );
            }
            if ($paymentMethod === 'cash' && $drawerSession) {
                $this->cashDrawerService->recordTransaction(
                    $drawerSession,
                    'cash_out',
                    $amount,
                    Expense::class,
                    $expense->id,
                    "Expense: {$category->name}" . ($expense->payee ? " ({$expense->payee})" : ""),
                    $user
                );
                $this->accountService->syncCashDrawerBalance($drawerSession);
            }

            return $expense->load(['category', 'account', 'user', 'drawerSession']);
        });
    }

    /**
     * Update an existing expense and adjust financial balance deltas.
     */
    public function updateExpense(Expense $expense, array $data, ?User $user = null): Expense
    {
        return DB::transaction(function () use ($expense, $data, $user) {
            $oldAmount = (float) $expense->amount;
            $oldMethod = $expense->payment_method;
            $oldAccountId = $expense->account_id;
            $oldSessionId = $expense->cash_drawer_session_id;

            $newAmount = round((float) ($data['amount'] ?? $oldAmount), 2);
            if ($newAmount <= 0) {
                throw ValidationException::withMessages(['amount' => 'Expense amount must be greater than zero.']);
            }

            $newMethod = $data['payment_method'] ?? $oldMethod;
            $newAccountId = array_key_exists('account_id', $data) ? $data['account_id'] : $oldAccountId;
            $category = array_key_exists('expense_category_id', $data) 
                ? ExpenseCategory::findOrFail($data['expense_category_id']) 
                : $expense->category;

            $newAccount = null;
            if ($newMethod === 'cash') {
                $newAccount = $this->accountService->getDefaultAccount('cash');
            } elseif ($newAccountId) {
                $newAccount = Account::find($newAccountId);
            }
            if (!$newAccount) {
                $newAccount = $this->accountService->getDefaultAccount($newMethod);
            }

            // 1. Unwind old financial effects
            $oldAcc = $oldAccountId ? Account::find($oldAccountId) : ($oldMethod === 'cash' ? $this->accountService->getDefaultAccount('cash') : null);
            if ($oldAcc) {
                $this->accountService->deposit(
                    $oldAcc,
                    $oldAmount,
                    Expense::class,
                    $expense->id,
                    "Adjustment / Reversal of prior expense {$expense->expense_number}",
                    $user
                );
            }
            // 2. Resolve new drawer session if cash
            $newSession = null;
            if ($newMethod === 'cash') {
                $newSession = $this->cashDrawerService->getCurrentSession($user);
            }

            $existingDrawerTx = null;
            if ($oldMethod === 'cash' && $oldSessionId) {
                $oldTx = CashDrawerTransaction::where('session_id', $oldSessionId)
                    ->where('reference_type', Expense::class)
                    ->where('reference_id', $expense->id)
                    ->first();
                if ($oldTx) {
                    $session = CashDrawerSession::find($oldSessionId);
                    if ($newMethod === 'cash' && $newSession && (int) $oldSessionId === (int) $newSession->id && $session && $session->status === 'open') {
                        // Preserve original chronological position in the drawer log
                        $existingDrawerTx = $oldTx;
                    } else {
                        $oldTx->delete();
                        if ($session && $session->status === 'open') {
                            $this->cashDrawerService->recalculateExpectedBalance($session);
                            $this->accountService->syncCashDrawerBalance($session);
                        }
                    }
                }
            }

            // 3. Update expense fields
            $isRecurring = array_key_exists('is_recurring', $data)
                ? (!empty($data['is_recurring']) && filter_var($data['is_recurring'], FILTER_VALIDATE_BOOLEAN))
                : $expense->is_recurring;
            $recurringFrequency = $isRecurring
                ? (array_key_exists('recurring_frequency', $data) ? $data['recurring_frequency'] : $expense->recurring_frequency)
                : null;

            $expense->update([
                'expense_category_id'    => $category->id,
                'account_id'             => $newAccount?->id,
                'cash_drawer_session_id' => $newSession?->id,
                'amount'                 => $newAmount,
                'date'                   => $data['date'] ?? $expense->date,
                'payment_method'         => $newMethod,
                'reference_number'       => array_key_exists('reference_number', $data) ? $data['reference_number'] : $expense->reference_number,
                'payee'                  => array_key_exists('payee', $data) ? $data['payee'] : $expense->payee,
                'description'            => array_key_exists('description', $data) ? $data['description'] : $expense->description,
                'receipt_path'           => array_key_exists('receipt_path', $data) ? $data['receipt_path'] : $expense->receipt_path,
                'is_recurring'           => $isRecurring,
                'recurring_frequency'    => $recurringFrequency,
            ]);

            // 4. Apply new financial effects
            if ($newAccount) {
                $this->accountService->withdraw(
                    $newAccount,
                    $newAmount,
                    Expense::class,
                    $expense->id,
                    "Expense: {$category->name} - {$expense->expense_number}" . ($expense->payee ? " ({$expense->payee})" : ""),
                    $user
                );
            }
            if ($newMethod === 'cash' && $newSession) {
                $drawerNote = "Expense: {$category->name}" . ($expense->payee ? " ({$expense->payee})" : "");
                if ($existingDrawerTx) {
                    $existingDrawerTx->update([
                        'amount' => $newAmount,
                        'notes'  => $drawerNote,
                    ]);
                    $this->cashDrawerService->recalculateExpectedBalance($newSession);
                } else {
                    $this->cashDrawerService->recordTransaction(
                        $newSession,
                        'cash_out',
                        $newAmount,
                        Expense::class,
                        $expense->id,
                        $drawerNote,
                        $user
                    );
                }
                $this->accountService->syncCashDrawerBalance($newSession);
            }

            return $expense->load(['category', 'account', 'user', 'drawerSession']);
        });
    }

    /**
     * Delete an expense and safely restore balances.
     */
    public function deleteExpense(Expense $expense, ?User $user = null): bool
    {
        return DB::transaction(function () use ($expense, $user) {
            // Restore account balance
            $acc = $expense->account_id ? Account::find($expense->account_id) : ($expense->payment_method === 'cash' ? $this->accountService->getDefaultAccount('cash') : null);
            if ($acc) {
                $this->accountService->deposit(
                    $acc,
                    (float) $expense->amount,
                    Expense::class,
                    $expense->id,
                    "Reversal of deleted expense {$expense->expense_number}",
                    $user
                );
            }

            // Restore drawer balance if applicable
            if ($expense->payment_method === 'cash' && $expense->cash_drawer_session_id) {
                $tx = CashDrawerTransaction::where('session_id', $expense->cash_drawer_session_id)
                    ->where('reference_type', Expense::class)
                    ->where('reference_id', $expense->id)
                    ->first();
                if ($tx) {
                    $session = CashDrawerSession::find($expense->cash_drawer_session_id);
                    $tx->delete();
                    if ($session && $session->status === 'open') {
                        $this->cashDrawerService->recalculateExpectedBalance($session);
                        $this->accountService->syncCashDrawerBalance($session);
                    } else {
                        // Prior shift was already closed; record cash in reimbursement to active drawer if open
                        $activeSession = $this->cashDrawerService->getCurrentSession($user);
                        if ($activeSession) {
                            $this->cashDrawerService->recordTransaction(
                                $activeSession,
                                'cash_in',
                                (float) $expense->amount,
                                Expense::class,
                                $expense->id,
                                "Expense Reversal: {$expense->expense_number} reimbursement",
                                $user
                            );
                            $this->accountService->syncCashDrawerBalance($activeSession);
                        }
                    }
                }
            }

            if ($expense->receipt_path) {
                $sharedReceiptCount = Expense::where('id', '!=', $expense->id)
                    ->where('receipt_path', $expense->receipt_path)
                    ->count();
                if ($sharedReceiptCount === 0 && Storage::disk('public')->exists($expense->receipt_path)) {
                    Storage::disk('public')->delete($expense->receipt_path);
                }
            }

            return (bool) $expense->delete();
        });
    }

    /**
     * Process all due recurring expenses up to the given target date.
     *
     * Each active recurring expense (`is_recurring = true`) whose next cycle date is
     * on or before `$asOfDate` spawns a new Expense record for that cycle date (which
     * becomes the new active recurring head) and marks the prior occurrence `is_recurring = false`.
     */
    public function processRecurringExpenses(?Carbon $asOfDate = null, ?User $actor = null): array
    {
        $targetDate = ($asOfDate ? $asOfDate->copy() : Carbon::today())->startOfDay();
        $createdExpenses = [];

        $recurringHeads = Expense::where('is_recurring', true)
            ->whereIn('recurring_frequency', ['weekly', 'monthly', 'yearly'])
            ->orderBy('date')
            ->orderBy('id')
            ->get();

        foreach ($recurringHeads as $head) {
            $current = $head;
            $nextDate = $current->getNextRecurringDate();
            $iterations = 0;

            while ($nextDate !== null && $nextDate->lte($targetDate) && $iterations < 12) {
                $iterations++;

                $newExpense = DB::transaction(function () use ($current, $nextDate, $actor) {
                    $expenseOwner = $actor ?? ($current->user_id ? User::find($current->user_id) : null);

                    $spawned = $this->createExpense([
                        'expense_category_id' => $current->expense_category_id,
                        'account_id'          => $current->account_id,
                        'amount'              => (float) $current->amount,
                        'date'                => $nextDate->toDateString(),
                        'payment_method'      => $current->payment_method,
                        'reference_number'    => $current->reference_number,
                        'payee'               => $current->payee,
                        'description'         => $current->description,
                        'is_recurring'        => true,
                        'recurring_frequency' => $current->recurring_frequency,
                    ], $expenseOwner);

                    $current->update([
                        'is_recurring' => false,
                    ]);

                    return $spawned;
                });

                $createdExpenses[] = $newExpense;
                $current = $newExpense;
                $nextDate = $current->getNextRecurringDate();
            }
        }

        return [
            'processed_count'  => count($createdExpenses),
            'created_expenses' => $createdExpenses,
        ];
    }

    /**
     * Compute Executive Net Profit (P&L) Statement for a date range.
     */
    public function getNetProfitReport(string $fromDate, string $toDate): array
    {
        $from = Carbon::parse($fromDate)->toDateString();
        $to   = Carbon::parse($toDate)->toDateString();

        // 1. Sales Totals (excluding reversed invoices)
        $salesData = DB::table('sale_invoices as si')
            ->whereBetween('si.date', [$from, $to])
            ->where(fn ($q) => $q->whereNull('si.status')->orWhere('si.status', '!=', 'reversed'))
            ->selectRaw('
                COUNT(si.id) as total_invoices,
                SUM(COALESCE(si.gross_amount, 0)) as gross_sales,
                SUM(COALESCE(si.discount_amount, 0)) as total_discounts,
                SUM(COALESCE(si.tax_amount, 0)) as total_taxes,
                SUM(COALESCE(si.total, 0)) as net_invoiced_sales
            ')
            ->first();

        // 2. Sale Returns
        $returnsData = DB::table('sale_returns as sr')
            ->whereBetween('sr.date', [$from, $to])
            ->selectRaw('
                COUNT(sr.id) as total_returns,
                SUM(COALESCE(sr.total, 0)) as total_returns_amount
            ')
            ->first();

        $grossSales = round((float) ($salesData->gross_sales ?? 0), 2);
        $totalSales = round((float) ($salesData->net_invoiced_sales ?? 0), 2);
        $totalReturns = round((float) ($returnsData->total_returns_amount ?? 0), 2);
        $netSales = round(max(0.0, $totalSales - $totalReturns), 2);

        // 3. Cost of Goods Sold (COGS) (excluding reversed invoices)
        $hasBonusCol = \Illuminate\Support\Facades\Schema::hasColumn('sale_invoice_items', 'bonus');
        $saleUnitsExpr = $hasBonusCol
            ? '(COALESCE(sii.quantity, 0) + COALESCE(sii.bonus, 0))'
            : 'COALESCE(sii.quantity, 0)';
        $cogsSales = (float) DB::table('sale_invoice_items as sii')
            ->join('sale_invoices as si', 'si.id', '=', 'sii.sale_invoice_id')
            ->join('products as p', 'p.id', '=', 'sii.product_id')
            ->whereBetween('si.date', [$from, $to])
            ->where(fn ($q) => $q->whereNull('si.status')->orWhere('si.status', '!=', 'reversed'))
            ->sum(DB::raw("{$saleUnitsExpr} * COALESCE(sii.cost_price_snapshot, CASE WHEN p.avg_price IS NULL OR p.avg_price = 0 THEN COALESCE(p.unit_purchase_price, 0) ELSE p.avg_price END)"));

        $cogsReturns = (float) DB::table('sale_return_items as sri')
            ->join('sale_returns as sr', 'sr.id', '=', 'sri.sale_return_id')
            ->join('products as p', 'p.id', '=', 'sri.product_id')
            ->whereBetween('sr.date', [$from, $to])
            ->sum(DB::raw('COALESCE(sri.unit_return_quantity, 0) * COALESCE(sri.cost_price_snapshot, CASE WHEN p.avg_price IS NULL OR p.avg_price = 0 THEN COALESCE(p.unit_purchase_price, 0) ELSE p.avg_price END)'));

        $cogs = round(max(0.0, $cogsSales - $cogsReturns), 2);
        $grossProfit = round($netSales - $cogs, 2);
        $grossMarginPct = $netSales > 0 ? round(($grossProfit / $netSales) * 100, 2) : 0.0;

        // 4. Operating Expenses
        $expensesQuery = DB::table('expenses as e')
            ->join('expense_categories as ec', 'ec.id', '=', 'e.expense_category_id')
            ->whereBetween('e.date', [Carbon::parse($fromDate)->toDateString(), Carbon::parse($toDate)->toDateString()])
            ->whereNull('e.deleted_at');

        $totalExpenses = round((float) $expensesQuery->sum('e.amount'), 2);

        // Expenses breakdown by category
        $byCategory = DB::table('expenses as e')
            ->join('expense_categories as ec', 'ec.id', '=', 'e.expense_category_id')
            ->whereBetween('e.date', [Carbon::parse($fromDate)->toDateString(), Carbon::parse($toDate)->toDateString()])
            ->whereNull('e.deleted_at')
            ->selectRaw('
                ec.id as category_id,
                ec.name as category_name,
                ec.code as category_code,
                COUNT(e.id) as count,
                SUM(e.amount) as total_amount
            ')
            ->groupBy('ec.id', 'ec.name', 'ec.code')
            ->orderByDesc('total_amount')
            ->get()
            ->map(function ($row) use ($totalExpenses) {
                $amt = round((float) $row->total_amount, 2);
                return [
                    'category_id'   => $row->category_id,
                    'category_name' => $row->category_name,
                    'category_code' => $row->category_code,
                    'count'         => (int) $row->count,
                    'total_amount'  => $amt,
                    'percentage'    => $totalExpenses > 0 ? round(($amt / $totalExpenses) * 100, 1) : 0.0,
                ];
            });

        // 5. Net Operating Profit
        $netProfit = round($grossProfit - $totalExpenses, 2);
        $netMarginPct = $netSales > 0 ? round(($netProfit / $netSales) * 100, 2) : 0.0;

        return [
            'date_range' => [
                'from' => Carbon::parse($fromDate)->toDateString(),
                'to'   => Carbon::parse($toDate)->toDateString(),
            ],
            'kpis' => [
                'gross_sales'        => $grossSales,
                'total_discounts'    => round((float) ($salesData->total_discounts ?? 0), 2),
                'total_taxes'        => round((float) ($salesData->total_taxes ?? 0), 2),
                'invoiced_sales'     => $totalSales,
                'returns_amount'     => $totalReturns,
                'net_sales'          => $netSales,
                'cost_of_goods_sold' => $cogs,
                'gross_profit'       => $grossProfit,
                'gross_margin_pct'   => $grossMarginPct,
                'total_expenses'     => $totalExpenses,
                'net_profit'         => $netProfit,
                'net_margin_pct'     => $netMarginPct,
                'is_profitable'      => $netProfit >= 0,
            ],
            'expenses_by_category' => $byCategory,
        ];
    }
}
