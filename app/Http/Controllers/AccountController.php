<?php

namespace App\Http\Controllers;

use App\Models\Account;
use App\Models\AccountTransaction;
use App\Services\AccountService;
use Illuminate\Http\JsonResponse;
use Illuminate\Http\Request;
use Illuminate\Validation\Rule;

class AccountController extends Controller
{
    protected AccountService $accountService;

    public function __construct(AccountService $accountService)
    {
        $this->accountService = $accountService;
    }

    private function authorizeAccountAction(string|array $permissions): void
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

    public const PAKISTAN_BANKS = [
        ['code' => 'meezan', 'name' => 'Meezan Bank', 'full_name' => 'Meezan Bank Limited (Islamic)', 'type' => 'bank', 'color' => '#005b41', 'icon' => 'meezan'],
        ['code' => 'hbl', 'name' => 'HBL', 'full_name' => 'Habib Bank Limited', 'type' => 'bank', 'color' => '#00835f', 'icon' => 'hbl'],
        ['code' => 'ubl', 'name' => 'UBL', 'full_name' => 'United Bank Limited', 'type' => 'bank', 'color' => '#00539f', 'icon' => 'ubl'],
        ['code' => 'mcb', 'name' => 'MCB Bank', 'full_name' => 'Muslim Commercial Bank Limited', 'type' => 'bank', 'color' => '#eb6909', 'icon' => 'mcb'],
        ['code' => 'alfalah', 'name' => 'Bank Alfalah', 'full_name' => 'Bank Alfalah Limited', 'type' => 'bank', 'color' => '#dc2626', 'icon' => 'alfalah'],
        ['code' => 'abl', 'name' => 'Allied Bank (ABL)', 'full_name' => 'Allied Bank Limited', 'type' => 'bank', 'color' => '#004b87', 'icon' => 'abl'],
        ['code' => 'faysal', 'name' => 'Faysal Bank', 'full_name' => 'Faysal Bank Limited (Islamic)', 'type' => 'bank', 'color' => '#1a365d', 'icon' => 'faysal'],
        ['code' => 'bop', 'name' => 'Bank of Punjab (BOP)', 'full_name' => 'The Bank of Punjab', 'type' => 'bank', 'color' => '#b91c1c', 'icon' => 'bop'],
        ['code' => 'askari', 'name' => 'Askari Bank', 'full_name' => 'Askari Bank Limited', 'type' => 'bank', 'color' => '#065f46', 'icon' => 'askari'],
        ['code' => 'scb', 'name' => 'Standard Chartered', 'full_name' => 'Standard Chartered Bank (Pakistan)', 'type' => 'bank', 'color' => '#0284c7', 'icon' => 'scb'],
        ['code' => 'nbp', 'name' => 'National Bank (NBP)', 'full_name' => 'National Bank of Pakistan', 'type' => 'bank', 'color' => '#047857', 'icon' => 'nbp'],
        ['code' => 'habibmetro', 'name' => 'Habib Metro', 'full_name' => 'Habib Metropolitan Bank', 'type' => 'bank', 'color' => '#1e40af', 'icon' => 'habibmetro'],
        ['code' => 'soneri', 'name' => 'Soneri Bank', 'full_name' => 'Soneri Bank Limited', 'type' => 'bank', 'color' => '#ca8a04', 'icon' => 'soneri'],
        ['code' => 'bankislami', 'name' => 'BankIslami', 'full_name' => 'BankIslami Pakistan Limited', 'type' => 'bank', 'color' => '#0d9488', 'icon' => 'bankislami'],
        ['code' => 'dib', 'name' => 'Dubai Islamic Bank (DIB)', 'full_name' => 'Dubai Islamic Bank Pakistan', 'type' => 'bank', 'color' => '#854d0e', 'icon' => 'dib'],
        ['code' => 'albaraka', 'name' => 'Al Baraka Bank', 'full_name' => 'Al Baraka Bank (Pakistan) Limited', 'type' => 'bank', 'color' => '#0284c7', 'icon' => 'albaraka'],
        ['code' => 'js', 'name' => 'JS Bank', 'full_name' => 'JS Bank Limited', 'type' => 'bank', 'color' => '#0369a1', 'icon' => 'js'],
        ['code' => 'bok', 'name' => 'Bank of Khyber (BOK)', 'full_name' => 'The Bank of Khyber', 'type' => 'bank', 'color' => '#059669', 'icon' => 'bok'],
        ['code' => 'sindh', 'name' => 'Sindh Bank', 'full_name' => 'Sindh Bank Limited', 'type' => 'bank', 'color' => '#4338ca', 'icon' => 'sindh'],
        ['code' => 'ztbl', 'name' => 'ZTBL', 'full_name' => 'Zarai Taraqiati Bank Limited', 'type' => 'bank', 'color' => '#15803d', 'icon' => 'ztbl'],
        ['code' => 'samba', 'name' => 'Samba Bank', 'full_name' => 'Samba Bank Limited', 'type' => 'bank', 'color' => '#0369a1', 'icon' => 'samba'],
        ['code' => 'silk', 'name' => 'Silkbank', 'full_name' => 'Silkbank Limited', 'type' => 'bank', 'color' => '#831843', 'icon' => 'silk'],
    ];

    public const PAKISTAN_WALLETS = [
        ['code' => 'jazzcash', 'name' => 'JazzCash', 'full_name' => 'JazzCash Mobile Account (Mobilink Bank)', 'type' => 'mobile_wallet', 'color' => '#dc2626', 'icon' => 'jazzcash'],
        ['code' => 'easypaisa', 'name' => 'Easypaisa', 'full_name' => 'Easypaisa Digital Account (Telenor Bank)', 'type' => 'mobile_wallet', 'color' => '#16a34a', 'icon' => 'easypaisa'],
        ['code' => 'sadapay', 'name' => 'SadaPay', 'full_name' => 'SadaPay Business / Personal Wallet', 'type' => 'mobile_wallet', 'color' => '#0d9488', 'icon' => 'sadapay'],
        ['code' => 'nayapay', 'name' => 'NayaPay', 'full_name' => 'NayaPay Arc / Digital Wallet', 'type' => 'mobile_wallet', 'color' => '#ea580c', 'icon' => 'nayapay'],
        ['code' => 'upaisa', 'name' => 'UPaisa', 'full_name' => 'UPaisa (U Microfinance Bank)', 'type' => 'mobile_wallet', 'color' => '#f97316', 'icon' => 'upaisa'],
        ['code' => 'zindigi', 'name' => 'Zindigi', 'full_name' => 'Zindigi Wallet by JS Bank', 'type' => 'mobile_wallet', 'color' => '#7c3aed', 'icon' => 'zindigi'],
        ['code' => 'raast', 'name' => 'Raast P2M', 'full_name' => 'State Bank of Pakistan Raast', 'type' => 'mobile_wallet', 'color' => '#059669', 'icon' => 'raast'],
    ];

    /**
     * Get all accounts and funds summary.
     */
    public function index(Request $request): JsonResponse
    {
        if ($request->boolean('active_only')) {
            $this->authorizeAccountAction([
                'account.view',
                'sale-invoice.create',
                'sale-invoice.update',
                'barcode-pos.view',
                'barcode-pos.create',
                'purchase-invoice.create',
                'purchase-invoice.update',
                'payment.create',
                'expense.create',
                'expense.update',
            ]);
        } else {
            $this->authorizeAccountAction('account.view');
        }
        $summary = $this->accountService->getSummary();
        return response()->json($summary);
    }

    /**
     * Get Pakistani banks and wallets preset directory.
     */
    public function presets(): JsonResponse
    {
        $this->authorizeAccountAction('account.view');
        return response()->json([
            'banks'   => self::PAKISTAN_BANKS,
            'wallets' => self::PAKISTAN_WALLETS,
        ]);
    }

    /**
     * Ensure the default Cash in Hand (Drawer) account is present.
     * Additional bank/wallet accounts are created by the user on demand.
     */
    public function seedDefaults(Request $request): JsonResponse
    {
        $this->authorizeAccountAction('account.create');
        $seeded = [];

        $cashDrawer = $this->accountService->syncCashDrawerBalance();
        if ($cashDrawer && $cashDrawer->wasRecentlyCreated) {
            $seeded[] = $cashDrawer;
        }

        if ($request->boolean('include_presets')) {
            $popular = [
                ['code' => 'meezan', 'name' => 'Meezan Bank', 'bank_name' => 'Meezan Bank Limited', 'type' => 'bank', 'icon' => 'meezan', 'color' => '#005b41', 'notes' => 'Primary Islamic bank account'],
                ['code' => 'hbl', 'name' => 'HBL (Habib Bank)', 'bank_name' => 'Habib Bank Limited', 'type' => 'bank', 'icon' => 'hbl', 'color' => '#00835f', 'notes' => 'Commercial bank account'],
                ['code' => 'jazzcash', 'name' => 'JazzCash Business', 'bank_name' => 'JazzCash', 'type' => 'mobile_wallet', 'icon' => 'jazzcash', 'color' => '#dc2626', 'notes' => 'Mobile wallet for retail customer transfers'],
                ['code' => 'easypaisa', 'name' => 'Easypaisa Business', 'bank_name' => 'Easypaisa', 'type' => 'mobile_wallet', 'icon' => 'easypaisa', 'color' => '#16a34a', 'notes' => 'Mobile wallet for digital payments'],
                ['code' => 'sadapay', 'name' => 'SadaPay Business', 'bank_name' => 'SadaPay', 'type' => 'mobile_wallet', 'icon' => 'sadapay', 'color' => '#0d9488', 'notes' => 'Digital fintech account'],
            ];

            foreach ($popular as $item) {
                $existing = Account::where('code', $item['code'])
                    ->orWhere(function ($q) use ($item) {
                        $q->where('name', $item['name'])->where('type', $item['type']);
                    })->first();

                if (!$existing) {
                    $acc = Account::create([
                        'name'            => $item['name'],
                        'code'            => $item['code'],
                        'icon'            => $item['icon'],
                        'color'           => $item['color'],
                        'type'            => $item['type'],
                        'bank_name'       => $item['bank_name'],
                        'account_number'  => null,
                        'opening_balance' => 0,
                        'current_balance' => 0,
                        'is_active'       => true,
                        'is_default'      => false,
                        'notes'           => $item['notes'],
                    ]);
                    $seeded[] = $acc;
                }
            }
        }

        return response()->json([
            'message' => count($seeded) > 0 ? "Created " . count($seeded) . " default account(s)" : "Default Cash in Hand account is ready",
            'seeded'  => $seeded,
            'summary' => $this->accountService->getSummary(),
        ]);
    }

    /**
     * Create a new financial account.
     */
    public function store(Request $request): JsonResponse
    {
        $this->authorizeAccountAction('account.create');
        $validated = $request->validate([
            'name'            => 'required|string|max:100',
            'type'            => ['required', Rule::in(['cash', 'bank', 'card', 'mobile_wallet', 'other'])],
            'code'            => 'nullable|string|max:50',
            'icon'            => 'nullable|string|max:50',
            'color'           => 'nullable|string|max:50',
            'bank_name'       => 'nullable|string|max:100',
            'account_number'  => 'nullable|string|max:100',
            'opening_balance' => 'nullable|numeric|min:0',
            'notes'           => 'nullable|string|max:500',
            'is_default'      => 'nullable|boolean',
        ]);

        $opening = max(round((float)($validated['opening_balance'] ?? 0), 2), 0);

        $account = Account::create([
            'name'            => $validated['name'],
            'type'            => $validated['type'],
            'code'            => $validated['code'] ?? null,
            'icon'            => $validated['icon'] ?? null,
            'color'           => $validated['color'] ?? null,
            'bank_name'       => $validated['bank_name'] ?? null,
            'account_number'  => $validated['account_number'] ?? null,
            'opening_balance' => $opening,
            'current_balance' => $opening,
            'is_active'       => true,
            'is_default'      => !empty($validated['is_default']),
            'notes'           => $validated['notes'] ?? null,
        ]);

        if ($opening > 0) {
            AccountTransaction::create([
                'account_id'       => $account->id,
                'user_id'          => $request->user()?->id,
                'type'             => 'opening_balance',
                'amount'           => $opening,
                'balance_after'    => $opening,
                'reference_type'   => 'opening_balance',
                'reference_id'     => $account->id,
                'description'      => "Initial opening balance for {$account->name}",
                'transaction_date' => now(),
            ]);
        }

        return response()->json([
            'message' => 'Account created successfully',
            'account' => $account,
        ], 201);
    }

    /**
     * Update an account.
     */
    public function update(Request $request, int $id): JsonResponse
    {
        $this->authorizeAccountAction('account.update');
        $account = Account::findOrFail($id);

        $validated = $request->validate([
            'name'           => 'required|string|max:100',
            'type'           => ['required', Rule::in(['cash', 'bank', 'card', 'mobile_wallet', 'other'])],
            'code'           => 'nullable|string|max:50',
            'icon'           => 'nullable|string|max:50',
            'color'          => 'nullable|string|max:50',
            'bank_name'      => 'nullable|string|max:100',
            'account_number' => 'nullable|string|max:100',
            'is_active'      => 'nullable|boolean',
            'is_default'     => 'nullable|boolean',
            'notes'          => 'nullable|string|max:500',
        ]);

        $account->update([
            'name'           => $validated['name'],
            'type'           => $validated['type'],
            'code'           => array_key_exists('code', $validated) ? $validated['code'] : $account->code,
            'icon'           => array_key_exists('icon', $validated) ? $validated['icon'] : $account->icon,
            'color'          => array_key_exists('color', $validated) ? $validated['color'] : $account->color,
            'bank_name'      => $validated['bank_name'] ?? null,
            'account_number' => $validated['account_number'] ?? null,
            'is_active'      => array_key_exists('is_active', $validated) ? (bool)$validated['is_active'] : $account->is_active,
            'is_default'     => array_key_exists('is_default', $validated) ? (bool)$validated['is_default'] : $account->is_default,
            'notes'          => $validated['notes'] ?? null,
        ]);

        return response()->json([
            'message' => 'Account updated successfully',
            'account' => $account,
        ]);
    }

    /**
     * Delete an account if it is not the primary Cash in Hand (Drawer) account and has a zero balance.
     */
    public function destroy(int $id): JsonResponse
    {
        $this->authorizeAccountAction(['account.delete', 'account.update']);
        $account = Account::findOrFail($id);

        if ($account->code === 'cash_drawer' || ($account->type === 'cash' && $account->is_default)) {
            return response()->json([
                'message' => 'Cannot delete the default Cash in Hand (Drawer) system account.',
            ], 422);
        }

        if (abs((float) $account->current_balance) >= 0.01) {
            return response()->json([
                'message' => 'Cannot delete an account with a non-zero balance (' . number_format((float) $account->current_balance, 2) . '). Transfer or withdraw the remaining balance first.',
            ], 422);
        }

        foreach (['sale_invoices', 'purchase_invoices', 'payments', 'sale_returns', 'purchase_returns', 'expenses'] as $tbl) {
            if (\Illuminate\Support\Facades\Schema::hasTable($tbl) && \Illuminate\Support\Facades\Schema::hasColumn($tbl, 'account_id')) {
                \Illuminate\Support\Facades\DB::table($tbl)->where('account_id', $account->id)->update(['account_id' => null]);
            }
        }

        AccountTransaction::where('account_id', $account->id)->delete();
        $account->delete();

        return response()->json([
            'message' => 'Account deleted successfully.',
        ]);
    }

    /**
     * Get transactions / statement for an account.
     */
    public function transactions(Request $request, int $id): JsonResponse
    {
        $this->authorizeAccountAction('account.view');
        $account = Account::findOrFail($id);

        $query = AccountTransaction::with('user:id,name')
            ->where('account_id', $account->id)
            ->latest('transaction_date')
            ->latest('id');

        if ($request->filled('type')) {
            $query->where('type', $request->query('type'));
        }

        if ($request->filled('from_date')) {
            $query->whereDate('transaction_date', '>=', $request->query('from_date'));
        }

        if ($request->filled('to_date')) {
            $query->whereDate('transaction_date', '<=', $request->query('to_date'));
        }

        $perPage = max((int)$request->query('per_page', 25), 1);
        $transactions = $query->paginate($perPage);

        return response()->json([
            'account'      => $account,
            'transactions' => $transactions,
        ]);
    }

    /**
     * Transfer funds between accounts.
     */
    public function transfer(Request $request): JsonResponse
    {
        $this->authorizeAccountAction(['account.transfer', 'account.update']);
        $validated = $request->validate([
            'from_account_id' => 'required|integer|exists:accounts,id',
            'to_account_id'   => 'required|integer|exists:accounts,id|different:from_account_id',
            'amount'          => 'required|numeric|min:0.01',
            'notes'           => 'nullable|string|max:255',
        ]);

        $from = Account::findOrFail($validated['from_account_id']);
        $to = Account::findOrFail($validated['to_account_id']);

        $res = $this->accountService->transfer(
            $from,
            $to,
            (float)$validated['amount'],
            $validated['notes'] ?? null,
            $request->user()
        );

        return response()->json([
            'message' => "Successfully transferred {$validated['amount']} from {$from->name} to {$to->name}.",
            'result'  => $res,
        ]);
    }

    /**
     * Manual deposit or withdrawal adjustment.
     */
    public function adjust(Request $request, int $id): JsonResponse
    {
        $this->authorizeAccountAction(['account.adjust', 'account.update']);
        $account = Account::findOrFail($id);

        $validated = $request->validate([
            'type'   => ['required', Rule::in(['deposit', 'withdrawal'])],
            'amount' => 'required|numeric|min:0.01',
            'reason' => 'required|string|max:255',
        ]);

        $txn = $this->accountService->adjust(
            $account,
            $validated['type'],
            (float)$validated['amount'],
            $validated['reason'],
            $request->user()
        );

        return response()->json([
            'message'     => 'Account adjusted successfully.',
            'transaction' => $txn,
            'account'     => $account->fresh(),
        ]);
    }
}

