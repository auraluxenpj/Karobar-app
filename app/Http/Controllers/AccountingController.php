<?php

namespace App\Http\Controllers;

use App\Models\ChartOfAccount;
use App\Models\JournalEntry;
use App\Models\TaxRate;
use App\Services\AccountingService;
use Carbon\Carbon;
use Illuminate\Http\JsonResponse;
use Illuminate\Http\Request;
use Illuminate\Validation\Rule;

class AccountingController extends Controller
{
    protected AccountingService $accountingService;

    public function __construct(AccountingService $accountingService)
    {
        $this->accountingService = $accountingService;
    }

    private function authorizeAccountingAction(string|array $permissions = ['account.view', 'report.net-profit.view']): void
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
     * GET /api/accounting/overview
     * Returns Trial Balance, Balance Sheet, Cash Flow, General Ledger, Chart of Accounts, and Tax Rates.
     */
    public function overview(Request $request): JsonResponse
    {
        $this->authorizeAccountingAction(['account.view', 'report.net-profit.view']);

        $from = $request->query('from', Carbon::now()->startOfMonth()->toDateString());
        $to = $request->query('to', Carbon::now()->toDateString());
        if ($from > $to) {
            [$from, $to] = [$to, $from];
        }

        $source = $request->query('source', 'all');
        $q = $request->query('q', '');

        return response()->json([
            'period'            => ['from' => $from, 'to' => $to],
            'trial_balance'     => $this->accountingService->getTrialBalance($from, $to),
            'balance_sheet'     => $this->accountingService->getBalanceSheet($to),
            'cash_flow'         => $this->accountingService->getCashFlowStatement($from, $to),
            'general_ledger'    => $this->accountingService->getGeneralLedger([
                'from'   => $from,
                'to'     => $to,
                'source' => $source,
                'q'      => $q,
            ]),
            'chart_of_accounts' => $this->accountingService->getChartOfAccounts(),
            'tax_rates'         => $this->accountingService->getTaxRates(),
        ]);
    }

    /**
     * GET /api/accounting/chart-of-accounts
     */
    public function chartOfAccounts(Request $request): JsonResponse
    {
        $this->authorizeAccountingAction(['account.view', 'report.net-profit.view']);
        return response()->json($this->accountingService->getChartOfAccounts($request->boolean('active_only')));
    }

    /**
     * POST /api/accounting/chart-of-accounts
     */
    public function storeAccount(Request $request): JsonResponse
    {
        $this->authorizeAccountingAction(['account.create', 'account.update']);

        $validated = $request->validate([
            'code'            => 'required|string|max:30|unique:chart_of_accounts,code',
            'name'            => 'required|string|max:150',
            'account_type'    => ['required', Rule::in(['asset', 'liability', 'equity', 'revenue', 'expense'])],
            'sub_type'        => 'nullable|string|max:50',
            'normal_balance'  => ['nullable', Rule::in(['debit', 'credit'])],
            'opening_balance' => 'nullable|numeric',
            'description'     => 'nullable|string|max:500',
        ]);

        $normalBalance = $validated['normal_balance']
            ?? (in_array($validated['account_type'], ['asset', 'expense'], true) ? 'debit' : 'credit');

        $account = ChartOfAccount::create([
            'code'            => strtoupper(trim($validated['code'])),
            'name'            => trim($validated['name']),
            'account_type'    => $validated['account_type'],
            'sub_type'        => $validated['sub_type'] ?? $validated['account_type'],
            'normal_balance'  => $normalBalance,
            'opening_balance' => round((float) ($validated['opening_balance'] ?? 0), 2),
            'is_system'       => false,
            'is_active'       => true,
            'description'     => $validated['description'] ?? null,
        ]);

        return response()->json($account, 201);
    }

    /**
     * PUT /api/accounting/chart-of-accounts/{chartOfAccount}
     */
    public function updateAccount(Request $request, ChartOfAccount $chartOfAccount): JsonResponse
    {
        $this->authorizeAccountingAction(['account.update', 'account.create']);

        $validated = $request->validate([
            'code'            => ['required', 'string', 'max:30', Rule::unique('chart_of_accounts', 'code')->ignore($chartOfAccount->id)],
            'name'            => 'required|string|max:150',
            'opening_balance' => 'nullable|numeric',
            'is_active'       => 'nullable|boolean',
            'description'     => 'nullable|string|max:500',
        ]);

        $chartOfAccount->update([
            'code'            => strtoupper(trim($validated['code'])),
            'name'            => trim($validated['name']),
            'opening_balance' => array_key_exists('opening_balance', $validated)
                ? round((float) $validated['opening_balance'], 2)
                : $chartOfAccount->opening_balance,
            'is_active'       => array_key_exists('is_active', $validated)
                ? (bool) $validated['is_active']
                : $chartOfAccount->is_active,
            'description'     => $validated['description'] ?? $chartOfAccount->description,
        ]);

        return response()->json($chartOfAccount);
    }

    /**
     * GET /api/accounting/journal-entries
     */
    public function journalEntries(Request $request): JsonResponse
    {
        $this->authorizeAccountingAction(['account.view', 'report.net-profit.view']);

        $from = $request->query('from', Carbon::now()->startOfMonth()->toDateString());
        $to = $request->query('to', Carbon::now()->toDateString());
        $source = $request->query('source', 'all');
        $q = $request->query('q', '');

        return response()->json($this->accountingService->getGeneralLedger([
            'from'   => $from,
            'to'     => $to,
            'source' => $source,
            'q'      => $q,
        ]));
    }

    /**
     * POST /api/accounting/journal-entries
     */
    public function storeJournalEntry(Request $request): JsonResponse
    {
        $this->authorizeAccountingAction(['account.create', 'account.update', 'payment.create', 'expense.create']);

        $validated = $request->validate([
            'entry_date'                   => 'required|date',
            'reference_type'               => 'nullable|string|max:50',
            'reference_number'             => 'nullable|string|max:100',
            'account_id'                   => 'nullable|integer|exists:accounts,id',
            'description'                  => 'required|string|max:500',
            'lines'                        => 'required|array|min:2',
            'lines.*.chart_of_account_id'  => 'required|integer|exists:chart_of_accounts,id',
            'lines.*.description'          => 'nullable|string|max:300',
            'lines.*.debit'                => 'nullable|numeric|min:0',
            'lines.*.credit'               => 'nullable|numeric|min:0',
        ]);

        $entry = $this->accountingService->createJournalEntry($validated, $request->user());

        return response()->json([
            'message' => "Journal Voucher {$entry->entry_number} posted successfully.",
            'entry'   => $entry,
        ], 201);
    }

    /**
     * POST /api/accounting/journal-entries/{journalEntry}/reverse
     */
    public function reverseJournalEntry(Request $request, JournalEntry $journalEntry): JsonResponse
    {
        $this->authorizeAccountingAction(['account.update', 'account.delete']);

        $validated = $request->validate([
            'reason' => 'required|string|min:3|max:500',
        ]);

        $reversed = $this->accountingService->reverseJournalEntry($journalEntry, $validated['reason'], $request->user());

        return response()->json([
            'message' => "Journal Voucher {$reversed->entry_number} reversed.",
            'entry'   => $reversed,
        ]);
    }

    /**
     * GET /api/accounting/tax-rates
     */
    public function taxRates(Request $request): JsonResponse
    {
        $this->authorizeAccountingAction([
            'account.view',
            'tax.view',
            'report.net-profit.view',
            'report.tax-return.view',
            'sale-invoice.view',
            'sale-invoice.create',
            'purchase-invoice.view',
            'purchase-invoice.create',
            'barcode-pos.view',
            'barcode-pos.create',
        ]);

        return response()->json($this->accountingService->getTaxRates($request->boolean('active_only')));
    }

    /**
     * POST /api/accounting/tax-rates
     */
    public function storeTaxRate(Request $request): JsonResponse
    {
        $this->authorizeAccountingAction(['account.create', 'account.update']);

        $validated = $request->validate([
            'name'        => 'required|string|max:120',
            'code'        => 'required|string|max:40|unique:tax_rates,code',
            'rate'        => 'required|numeric|min:0|max:100',
            'type'        => ['required', Rule::in(['both', 'sales', 'purchase', 'withholding'])],
            'is_default'  => 'nullable|boolean',
            'description' => 'nullable|string|max:300',
        ]);

        if (!empty($validated['is_default'])) {
            TaxRate::query()->update(['is_default' => false]);
        }

        $taxRate = TaxRate::create([
            'name'        => trim($validated['name']),
            'code'        => strtoupper(trim($validated['code'])),
            'rate'        => round((float) $validated['rate'], 2),
            'type'        => $validated['type'],
            'is_default'  => !empty($validated['is_default']),
            'is_active'   => true,
            'description' => $validated['description'] ?? null,
        ]);

        return response()->json($taxRate, 201);
    }

    /**
     * PUT /api/accounting/tax-rates/{taxRate}
     */
    public function updateTaxRate(Request $request, TaxRate $taxRate): JsonResponse
    {
        $this->authorizeAccountingAction(['account.update', 'account.create']);

        $validated = $request->validate([
            'name'        => 'required|string|max:120',
            'code'        => ['required', 'string', 'max:40', Rule::unique('tax_rates', 'code')->ignore($taxRate->id)],
            'rate'        => 'required|numeric|min:0|max:100',
            'type'        => ['required', Rule::in(['both', 'sales', 'purchase', 'withholding'])],
            'is_default'  => 'nullable|boolean',
            'is_active'   => 'nullable|boolean',
            'description' => 'nullable|string|max:300',
        ]);

        if (!empty($validated['is_default'])) {
            TaxRate::where('id', '!=', $taxRate->id)->update(['is_default' => false]);
        }

        $taxRate->update([
            'name'        => trim($validated['name']),
            'code'        => strtoupper(trim($validated['code'])),
            'rate'        => round((float) $validated['rate'], 2),
            'type'        => $validated['type'],
            'is_default'  => array_key_exists('is_default', $validated) ? (bool) $validated['is_default'] : $taxRate->is_default,
            'is_active'   => array_key_exists('is_active', $validated) ? (bool) $validated['is_active'] : $taxRate->is_active,
            'description' => $validated['description'] ?? null,
        ]);

        return response()->json($taxRate);
    }

    /**
     * DELETE /api/accounting/tax-rates/{taxRate}
     */
    public function destroyTaxRate(TaxRate $taxRate): JsonResponse
    {
        $this->authorizeAccountingAction(['account.delete', 'account.update']);
        $taxRate->delete();
        return response()->json(['message' => 'Tax rate deleted.']);
    }
}

