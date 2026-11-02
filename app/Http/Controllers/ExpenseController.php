<?php

namespace App\Http\Controllers;

use App\Models\Expense;
use App\Services\ExpenseService;
use Carbon\Carbon;
use Illuminate\Http\JsonResponse;
use Illuminate\Http\Request;
use Illuminate\Support\Facades\Auth;
use Illuminate\Support\Facades\Storage;

class ExpenseController extends Controller
{
    protected ExpenseService $expenseService;

    public function __construct(ExpenseService $expenseService)
    {
        $this->expenseService = $expenseService;
    }

    private function authorizeExpenseAction(string|array $permissions): void
    {
        $user = request()->user();
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

    /**
     * Display a listing of expenses with filtering.
     */
    public function index(Request $request): JsonResponse
    {
        $this->authorizeExpenseAction('expense.view');
        $query = Expense::with(['category', 'account', 'user:id,name', 'drawerSession:id,status'])
            ->orderByDesc('date')
            ->orderByDesc('id');

        if ($request->filled('from')) {
            $query->whereDate('date', '>=', $request->query('from'));
        }
        if ($request->filled('to')) {
            $query->whereDate('date', '<=', $request->query('to'));
        }
        if ($request->filled('category_id')) {
            $query->where('expense_category_id', $request->query('category_id'));
        }
        if ($request->filled('payment_method')) {
            $query->where('payment_method', $request->query('payment_method'));
        }
        if ($request->filled('account_id')) {
            $query->where('account_id', $request->query('account_id'));
        }
        if ($request->filled('is_recurring')) {
            $query->where('is_recurring', filter_var($request->query('is_recurring'), FILTER_VALIDATE_BOOLEAN));
        }
        if ($request->filled('search')) {
            $s = trim($request->query('search'));
            $query->where(function ($q) use ($s) {
                $q->where('expense_number', 'like', "%{$s}%")
                    ->orWhere('payee', 'like', "%{$s}%")
                    ->orWhere('description', 'like', "%{$s}%")
                    ->orWhere('reference_number', 'like', "%{$s}%");
            });
        }

        $perPage = max(5, min(100, (int) $request->query('per_page', 25)));
        $expenses = $query->paginate($perPage);

        // Also calculate aggregated sum of matching filter
        $totalAmount = (float) (clone $query)->getQuery()->sum('amount');

        return response()->json([
            'expenses'     => $expenses,
            'total_amount' => round($totalAmount, 2),
        ]);
    }

    /**
     * Store a newly created expense.
     */
    public function store(Request $request): JsonResponse
    {
        $this->authorizeExpenseAction('expense.create');

        if ($request->has('is_recurring')) {
            $request->merge([
                'is_recurring' => filter_var($request->input('is_recurring'), FILTER_VALIDATE_BOOLEAN),
            ]);
        }

        $validated = $request->validate([
            'expense_category_id' => ['required', 'exists:expense_categories,id'],
            'amount'              => ['required', 'numeric', 'min:0.01'],
            'date'                => ['required', 'date'],
            'payment_method'      => ['required', 'string', 'in:cash,bank_transfer,card,mobile_wallet,cheque,other'],
            'account_id'          => ['nullable', 'exists:accounts,id'],
            'reference_number'    => ['nullable', 'string', 'max:100'],
            'payee'               => ['nullable', 'string', 'max:255'],
            'description'         => ['nullable', 'string', 'max:1000'],
            'receipt'             => ['nullable', 'file', 'mimes:jpg,jpeg,png,webp,pdf', 'max:5120'],
            'is_recurring'        => ['nullable', 'boolean'],
            'recurring_frequency' => ['nullable', 'required_if:is_recurring,true', 'string', 'in:weekly,monthly,yearly'],
        ]);

        if ($request->hasFile('receipt')) {
            $validated['receipt_path'] = $request->file('receipt')->store('expense-receipts', 'public');
        }

        $expense = $this->expenseService->createExpense($validated, Auth::user());

        return response()->json([
            'message' => 'Expense recorded successfully.',
            'expense' => $expense,
        ], 201);
    }

    /**
     * Display the specified expense.
     */
    public function show(Expense $expense): JsonResponse
    {
        $this->authorizeExpenseAction('expense.view');
        return response()->json($expense->load(['category', 'account', 'user:id,name', 'drawerSession']));
    }

    /**
     * Update the specified expense.
     */
    public function update(Request $request, Expense $expense): JsonResponse
    {
        $this->authorizeExpenseAction('expense.update');

        if ($request->has('is_recurring')) {
            $request->merge([
                'is_recurring' => filter_var($request->input('is_recurring'), FILTER_VALIDATE_BOOLEAN),
            ]);
        }
        if ($request->has('remove_receipt')) {
            $request->merge([
                'remove_receipt' => filter_var($request->input('remove_receipt'), FILTER_VALIDATE_BOOLEAN),
            ]);
        }

        $validated = $request->validate([
            'expense_category_id' => ['required', 'exists:expense_categories,id'],
            'amount'              => ['required', 'numeric', 'min:0.01'],
            'date'                => ['required', 'date'],
            'payment_method'      => ['required', 'string', 'in:cash,bank_transfer,card,mobile_wallet,cheque,other'],
            'account_id'          => ['nullable', 'exists:accounts,id'],
            'reference_number'    => ['nullable', 'string', 'max:100'],
            'payee'               => ['nullable', 'string', 'max:255'],
            'description'         => ['nullable', 'string', 'max:1000'],
            'receipt'             => ['nullable', 'file', 'mimes:jpg,jpeg,png,webp,pdf', 'max:5120'],
            'remove_receipt'      => ['nullable', 'boolean'],
            'is_recurring'        => ['nullable', 'boolean'],
            'recurring_frequency' => ['nullable', 'required_if:is_recurring,true', 'string', 'in:weekly,monthly,yearly'],
        ]);

        if ($request->hasFile('receipt')) {
            if ($expense->receipt_path && Storage::disk('public')->exists($expense->receipt_path)) {
                $sharedCount = Expense::where('id', '!=', $expense->id)
                    ->where('receipt_path', $expense->receipt_path)
                    ->count();
                if ($sharedCount === 0) {
                    Storage::disk('public')->delete($expense->receipt_path);
                }
            }
            $validated['receipt_path'] = $request->file('receipt')->store('expense-receipts', 'public');
        } elseif (!empty($validated['remove_receipt'])) {
            if ($expense->receipt_path && Storage::disk('public')->exists($expense->receipt_path)) {
                $sharedCount = Expense::where('id', '!=', $expense->id)
                    ->where('receipt_path', $expense->receipt_path)
                    ->count();
                if ($sharedCount === 0) {
                    Storage::disk('public')->delete($expense->receipt_path);
                }
            }
            $validated['receipt_path'] = null;
        }

        $updated = $this->expenseService->updateExpense($expense, $validated, Auth::user());

        return response()->json([
            'message' => 'Expense updated successfully.',
            'expense' => $updated,
        ]);
    }

    /**
     * Remove the specified expense.
     */
    public function destroy(Expense $expense): JsonResponse
    {
        $this->authorizeExpenseAction('expense.delete');
        $this->expenseService->deleteExpense($expense, Auth::user());

        return response()->json([
            'message' => 'Expense deleted and financial balances reversed successfully.',
        ]);
    }

    /**
     * Summary overview of recent and monthly expenses.
     */
    public function summary(): JsonResponse
    {
        $this->authorizeExpenseAction('expense.view');
        $today = Carbon::today()->toDateString();
        $monthStart = Carbon::today()->startOfMonth()->toDateString();
        $monthEnd = Carbon::today()->endOfMonth()->toDateString();

        $todayTotal = (float) Expense::whereDate('date', $today)->sum('amount');
        $monthTotal = (float) Expense::whereBetween('date', [$monthStart, $monthEnd])->sum('amount');
        $cashTotal = (float) Expense::whereBetween('date', [$monthStart, $monthEnd])->where('payment_method', 'cash')->sum('amount');
        $bankTotal = (float) Expense::whereBetween('date', [$monthStart, $monthEnd])->where('payment_method', '!=', 'cash')->sum('amount');

        $topCategory = Expense::join('expense_categories', 'expense_categories.id', '=', 'expenses.expense_category_id')
            ->whereBetween('expenses.date', [$monthStart, $monthEnd])
            ->selectRaw('expense_categories.name, SUM(expenses.amount) as total')
            ->groupBy('expense_categories.name')
            ->orderByDesc('total')
            ->first();

        $activeRecurring = Expense::where('is_recurring', true)
            ->whereIn('recurring_frequency', ['weekly', 'monthly', 'yearly'])
            ->get(['id', 'date', 'is_recurring', 'recurring_frequency']);

        $todayCarbon = Carbon::today()->startOfDay();
        $dueRecurringCount = $activeRecurring->filter(function (Expense $exp) use ($todayCarbon) {
            $nextDate = $exp->getNextRecurringDate();
            return $nextDate !== null && $nextDate->lte($todayCarbon);
        })->count();

        return response()->json([
            'today_total'            => round($todayTotal, 2),
            'month_total'            => round($monthTotal, 2),
            'cash_total'             => round($cashTotal, 2),
            'bank_total'             => round($bankTotal, 2),
            'top_category_name'      => $topCategory?->name ?? 'None',
            'top_category_sum'       => round((float) ($topCategory?->total ?? 0), 2),
            'recurring_active_count' => $activeRecurring->count(),
            'recurring_due_count'    => $dueRecurringCount,
        ]);
    }

    /**
     * Process all due recurring expenses immediately.
     */
    public function processRecurring(): JsonResponse
    {
        $this->authorizeExpenseAction(['expense.create', 'expense.update']);

        $result = $this->expenseService->processRecurringExpenses(Carbon::today(), Auth::user());

        return response()->json([
            'message'          => $result['processed_count'] > 0
                ? "Generated {$result['processed_count']} due recurring expense(s)."
                : 'No recurring expenses are currently due.',
            'processed_count'  => $result['processed_count'],
            'created_expenses' => $result['created_expenses'],
        ]);
    }

    /**
     * Stream or download an expense receipt attachment.
     */
    public function receipt(Expense $expense)
    {
        $this->authorizeExpenseAction('expense.view');

        $path = ltrim((string) ($expense->receipt_path ?? ''), '/\\');
        if (
            $path === ''
            || !str_starts_with($path, 'expense-receipts/')
            || str_contains($path, '..')
            || !Storage::disk('public')->exists($path)
        ) {
            abort(404, 'Receipt attachment not found.');
        }

        return Storage::disk('public')->response($path);
    }
}

