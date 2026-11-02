<?php

namespace App\Services;

use App\Models\Account;
use App\Models\Employee;
use App\Models\EmployeeAdvance;
use App\Models\EmployeeAttendance;
use App\Models\ExpenseCategory;
use App\Models\PayrollItem;
use App\Models\PayrollRun;
use App\Models\SaleInvoice;
use App\Models\User;
use Carbon\Carbon;
use Illuminate\Support\Facades\DB;
use Illuminate\Support\Facades\Schema;
use Illuminate\Validation\ValidationException;

class HrPayrollService
{
    protected AccountService $accountService;
    protected CashDrawerService $cashDrawerService;
    protected ExpenseService $expenseService;

    public function __construct(
        AccountService $accountService,
        CashDrawerService $cashDrawerService,
        ExpenseService $expenseService
    ) {
        $this->accountService = $accountService;
        $this->cashDrawerService = $cashDrawerService;
        $this->expenseService = $expenseService;
    }

    /**
     * Ensure HR & Payroll tables exist (helpful for in-memory test setups).
     */
    public function ensureTables(): void
    {
        if (!Schema::hasTable('employees')) {
            $migration = include database_path('migrations/2026_10_29_000002_create_hr_payroll_and_commissions_tables.php');
            if (is_object($migration) && method_exists($migration, 'up')) {
                $migration->up();
            }
        }
    }

    /**
     * Get Executive HR, Payroll & Commissions Overview for a given YYYY-MM month.
     */
    public function getOverview(?string $periodMonth = null, ?string $attendanceDate = null): array
    {
        $this->ensureTables();

        $month = $periodMonth && preg_match('/^\d{4}-\d{2}$/', $periodMonth)
            ? $periodMonth
            : Carbon::today()->format('Y-m');
        $attDate = $attendanceDate ?: Carbon::today()->toDateString();

        $startDate = Carbon::createFromFormat('Y-m-d', $month . '-01')->startOfMonth()->toDateString();
        $endDate = Carbon::createFromFormat('Y-m-d', $month . '-01')->endOfMonth()->toDateString();

        $employees = Employee::orderBy('name')->get();
        $activeEmployees = $employees->whereIn('status', ['active', 'on_leave']);

        $todayAttendances = EmployeeAttendance::where('date', $attDate)->get()->keyBy('employee_id');
        $presentCount = 0;
        $lateCount = 0;
        $absentCount = 0;
        $leaveCount = 0;
        $unmarkedCount = 0;

        foreach ($activeEmployees as $emp) {
            $rec = $todayAttendances->get($emp->id);
            if (!$rec) {
                $unmarkedCount++;
            } elseif ($rec->status === 'present') {
                $presentCount++;
            } elseif ($rec->status === 'late') {
                $lateCount++;
            } elseif ($rec->status === 'absent') {
                $absentCount++;
            } elseif (in_array($rec->status, ['paid_leave', 'half_day', 'holiday'], true)) {
                $leaveCount++;
            }
        }

        $commissionsReport = $this->getCommissionsReport($startDate, $endDate);
        $currentRun = PayrollRun::with(['items.employee'])->where('period_month', $month)->first();

        return [
            'period_month'               => $month,
            'attendance_date'            => $attDate,
            'total_employees'            => $employees->count(),
            'active_employees'           => $employees->where('status', 'active')->count(),
            'on_leave_employees'         => $employees->where('status', 'on_leave')->count(),
            'inactive_employees'         => $employees->where('status', 'inactive')->count(),
            'monthly_fixed_payroll_pool' => round((float) $activeEmployees->sum(fn ($e) => (float) $e->basic_salary + (float) $e->default_allowances), 2),
            'total_outstanding_advances' => round((float) $employees->sum('advance_balance'), 2),
            'monthly_commissions_total'  => $commissionsReport['summary']['total_incentives'] ?? 0.0,
            'monthly_net_sales_attributed' => $commissionsReport['summary']['total_net_sales'] ?? 0.0,
            'today_attendance'           => [
                'date'     => $attDate,
                'present'  => $presentCount,
                'late'     => $lateCount,
                'absent'   => $absentCount,
                'leave'    => $leaveCount,
                'unmarked' => $unmarkedCount,
            ],
            'current_payroll_run'        => $currentRun,
        ];
    }

    /**
     * Calculate sales metrics, earned commission, and target bonus for a single employee over a date range.
     */
    public function calculateEmployeeCommission(Employee $employee, string $fromDate, string $toDate): array
    {
        $this->ensureTables();

        $from = Carbon::parse($fromDate)->toDateString();
        $to = Carbon::parse($toDate)->toDateString();

        $hasSalesmanCol = Schema::hasColumn('sale_invoices', 'salesman_id');

        $invoicesQuery = SaleInvoice::query()
            ->whereBetween('date', [$from, $to])
            ->where(function ($q) {
                $q->whereNull('status')->orWhere('status', '!=', 'reversed');
            });

        $invoicesQuery->where(function ($q) use ($employee, $hasSalesmanCol) {
            if ($hasSalesmanCol) {
                $q->where('salesman_id', $employee->id);
                if (!empty($employee->user_id)) {
                    $q->orWhere(function ($sub) use ($employee) {
                        $sub->whereNull('salesman_id')
                            ->where('user_id', $employee->user_id);
                    });
                }
            } elseif (!empty($employee->user_id)) {
                $q->where('user_id', $employee->user_id);
            } else {
                $q->whereRaw('1 = 0');
            }
        });

        $invoices = $invoicesQuery->get(['id', 'gross_amount', 'discount_amount', 'item_discount', 'tax_amount', 'total']);
        $invoicesCount = $invoices->count();
        $grossSales = round((float) $invoices->sum('gross_amount'), 2);
        $netSales = round((float) $invoices->sum(function ($inv) {
            return max(0.0, (float) $inv->total - (float) ($inv->tax_amount ?? 0));
        }), 2);

        $cogsTotal = 0.0;
        if ($invoicesCount > 0) {
            $invoiceIds = $invoices->pluck('id')->all();
            $hasBonusCol = Schema::hasColumn('sale_invoice_items', 'bonus');
            $saleUnitsExpr = $hasBonusCol
                ? '(COALESCE(sii.quantity, 0) + COALESCE(sii.bonus, 0))'
                : 'COALESCE(sii.quantity, 0)';
            $cogsAccum = 0.0;
            foreach (array_chunk($invoiceIds, 500) as $chunkIds) {
                $cogsRow = DB::table('sale_invoice_items as sii')
                    ->leftJoin('products as p', 'p.id', '=', 'sii.product_id')
                    ->whereIn('sii.sale_invoice_id', $chunkIds)
                    ->selectRaw("COALESCE(SUM(COALESCE(sii.cost_price_snapshot, p.avg_price, p.unit_purchase_price, 0) * {$saleUnitsExpr}), 0) as total_cogs")
                    ->first();
                $cogsAccum += (float) ($cogsRow->total_cogs ?? 0);
            }
            $cogsTotal = round($cogsAccum, 2);
        }

        $grossProfit = round(max(0.0, $netSales - $cogsTotal), 2);

        $commType = $employee->commission_type ?: 'none';
        $commRate = max(0.0, (float) ($employee->commission_rate ?? 0));
        $earnedCommission = 0.0;

        if ($commType === 'net_sales_percent' && $commRate > 0) {
            $earnedCommission = round($netSales * ($commRate / 100.0), 2);
        } elseif ($commType === 'gross_profit_percent' && $commRate > 0) {
            $earnedCommission = round($grossProfit * ($commRate / 100.0), 2);
        } elseif ($commType === 'fixed_per_invoice' && $commRate > 0) {
            $earnedCommission = round($invoicesCount * $commRate, 2);
        }

        $target = max(0.0, (float) ($employee->monthly_sales_target ?? 0));
        $targetBonusConfig = max(0.0, (float) ($employee->target_bonus_amount ?? 0));
        $targetAchieved = $target > 0 && $netSales >= $target;
        $targetProgressPct = $target > 0 ? round(min(999.9, ($netSales / $target) * 100.0), 1) : 0.0;
        $targetBonus = $targetAchieved ? round($targetBonusConfig, 2) : 0.0;
        $totalIncentive = round($earnedCommission + $targetBonus, 2);

        return [
            'employee_id'          => $employee->id,
            'employee_code'        => $employee->employee_code,
            'employee_name'        => $employee->name,
            'department'           => $employee->department,
            'designation'          => $employee->designation,
            'user_id'              => $employee->user_id,
            'commission_type'      => $commType,
            'commission_rate'      => $commRate,
            'invoices_count'       => $invoicesCount,
            'gross_sales'          => $grossSales,
            'net_sales'            => $netSales,
            'cogs_total'           => $cogsTotal,
            'gross_profit'         => $grossProfit,
            'commission_earned'    => $earnedCommission,
            'monthly_sales_target' => $target,
            'target_achieved'      => $targetAchieved,
            'target_progress_pct'  => $targetProgressPct,
            'target_bonus'         => $targetBonus,
            'total_incentive'      => $totalIncentive,
        ];
    }

    /**
     * Get Salesman & Cashier Commission Leaderboard & Report for a date range.
     */
    public function getCommissionsReport(string $fromDate, string $toDate): array
    {
        $this->ensureTables();

        $from = Carbon::parse($fromDate)->toDateString();
        $to = Carbon::parse($toDate)->toDateString();

        $employees = Employee::with('user:id,name,email')
            ->whereIn('status', ['active', 'on_leave'])
            ->orderBy('name')
            ->get();

        $rows = [];
        $totalInvoices = 0;
        $totalGrossSales = 0.0;
        $totalNetSales = 0.0;
        $totalGrossProfit = 0.0;
        $totalCommissions = 0.0;
        $totalTargetBonuses = 0.0;
        $totalIncentives = 0.0;

        foreach ($employees as $emp) {
            $metrics = $this->calculateEmployeeCommission($emp, $from, $to);
            $metrics['user_name'] = $emp->user?->name;
            $rows[] = $metrics;

            $totalInvoices += $metrics['invoices_count'];
            $totalGrossSales = round($totalGrossSales + $metrics['gross_sales'], 2);
            $totalNetSales = round($totalNetSales + $metrics['net_sales'], 2);
            $totalGrossProfit = round($totalGrossProfit + $metrics['gross_profit'], 2);
            $totalCommissions = round($totalCommissions + $metrics['commission_earned'], 2);
            $totalTargetBonuses = round($totalTargetBonuses + $metrics['target_bonus'], 2);
            $totalIncentives = round($totalIncentives + $metrics['total_incentive'], 2);
        }

        usort($rows, function ($a, $b) {
            if ($b['total_incentive'] !== $a['total_incentive']) {
                return $b['total_incentive'] <=> $a['total_incentive'];
            }
            return $b['net_sales'] <=> $a['net_sales'];
        });

        return [
            'period'  => [
                'from' => $from,
                'to'   => $to,
            ],
            'summary' => [
                'total_invoices'       => $totalInvoices,
                'total_gross_sales'    => $totalGrossSales,
                'total_net_sales'      => $totalNetSales,
                'total_gross_profit'   => $totalGrossProfit,
                'total_commissions'    => $totalCommissions,
                'total_target_bonuses' => $totalTargetBonuses,
                'total_incentives'     => $totalIncentives,
            ],
            'rows'    => $rows,
        ];
    }

    /**
     * Record a Staff Salary Advance ("Kharcha" / Loan disbursement) or Advance Repayment.
     */
    public function recordAdvanceTransaction(array $data, ?User $user = null): EmployeeAdvance
    {
        $this->ensureTables();

        return DB::transaction(function () use ($data, $user) {
            $employee = Employee::lockForUpdate()->findOrFail($data['employee_id']);
            $type = $data['type'] ?? 'advance'; // advance, repayment
            if (!in_array($type, ['advance', 'repayment'], true)) {
                throw ValidationException::withMessages([
                    'type' => 'Transaction type must be either advance or repayment.',
                ]);
            }

            $amount = round((float) ($data['amount'] ?? 0), 2);
            if ($amount <= 0) {
                throw ValidationException::withMessages([
                    'amount' => 'Amount must be greater than zero.',
                ]);
            }

            $currentBalance = round((float) ($employee->advance_balance ?? 0), 2);
            if ($type === 'repayment' && $amount > $currentBalance + 0.009) {
                throw ValidationException::withMessages([
                    'amount' => "Repayment amount ({$amount}) cannot exceed employee's outstanding advance balance ({$currentBalance}).",
                ]);
            }

            $newBalance = $type === 'advance'
                ? round($currentBalance + $amount, 2)
                : round(max(0.0, $currentBalance - $amount), 2);

            $dateStr = !empty($data['date'])
                ? Carbon::parse($data['date'])->toDateString()
                : Carbon::today()->toDateString();
            $paymentMethod = $data['payment_method'] ?? 'cash';

            // Resolve Treasury Account
            $account = null;
            if (!empty($data['account_id'])) {
                $account = Account::find($data['account_id']);
            }
            if (!$account) {
                $account = $this->accountService->getDefaultAccount($paymentMethod === 'bank_transfer' ? 'bank' : $paymentMethod);
            }

            $advanceNumber = EmployeeAdvance::generateAdvanceNumber($dateStr);

            $advance = EmployeeAdvance::create([
                'advance_number'   => $advanceNumber,
                'employee_id'      => $employee->id,
                'type'             => $type,
                'amount'           => $amount,
                'balance_after'    => $newBalance,
                'date'             => $dateStr,
                'payment_method'   => $paymentMethod,
                'account_id'       => $account?->id,
                'reference_number' => $data['reference_number'] ?? null,
                'description'      => $data['description'] ?? ($type === 'advance' ? "Salary advance to {$employee->name}" : "Advance repayment from {$employee->name}"),
                'created_by'       => $user?->id,
            ]);

            $employee->advance_balance = $newBalance;
            $employee->save();

            // Sync with Treasury Account & Cash Drawer
            if ($account) {
                if ($type === 'advance') {
                    $this->accountService->withdraw(
                        $account,
                        $amount,
                        EmployeeAdvance::class,
                        $advance->id,
                        "Staff Advance {$advanceNumber} - {$employee->name}",
                        $user
                    );
                } else {
                    $this->accountService->deposit(
                        $account,
                        $amount,
                        EmployeeAdvance::class,
                        $advance->id,
                        "Staff Advance Repayment {$advanceNumber} - {$employee->name}",
                        $user
                    );
                }
            }

            if ($paymentMethod === 'cash') {
                $drawerSession = $this->cashDrawerService->getCurrentSession($user);
                if ($drawerSession) {
                    $this->cashDrawerService->recordTransaction(
                        $drawerSession,
                        $type === 'advance' ? 'cash_out' : 'cash_in',
                        $amount,
                        EmployeeAdvance::class,
                        $advance->id,
                        ($type === 'advance' ? "Staff Advance: " : "Staff Advance Repayment: ") . $employee->name,
                        $user
                    );
                    $this->accountService->syncCashDrawerBalance($drawerSession);
                }
            }

            return $advance->load(['employee', 'account']);
        });
    }

    /**
     * Generate or refresh a Monthly Payroll Run (YYYY-MM).
     * Automatically pulls attendance, absences, fines, overtime, sales commissions, target bonuses, and advance deductions.
     */
    public function generateOrRefreshPayrollRun(string $periodMonth, array $options = [], ?User $user = null): PayrollRun
    {
        $this->ensureTables();

        if (!preg_match('/^\d{4}-\d{2}$/', $periodMonth)) {
            throw ValidationException::withMessages([
                'period_month' => 'Payroll period must be in YYYY-MM format (e.g. 2026-10).',
            ]);
        }

        $startDate = Carbon::createFromFormat('Y-m-d', $periodMonth . '-01')->startOfMonth()->toDateString();
        $endDate = Carbon::createFromFormat('Y-m-d', $periodMonth . '-01')->endOfMonth()->toDateString();
        $autoDeductAdvances = array_key_exists('auto_deduct_advances', $options)
            ? (bool) $options['auto_deduct_advances']
            : true;

        return DB::transaction(function () use ($periodMonth, $startDate, $endDate, $autoDeductAdvances, $options, $user) {
            $run = PayrollRun::lockForUpdate()->where('period_month', $periodMonth)->first();

            if (!$run) {
                $run = PayrollRun::create([
                    'run_number'   => 'PAY-' . $periodMonth,
                    'period_month' => $periodMonth,
                    'start_date'   => $startDate,
                    'end_date'     => $endDate,
                    'status'       => 'draft',
                    'notes'        => $options['notes'] ?? "Monthly payroll & sales commissions for {$periodMonth}",
                    'generated_by' => $user?->id,
                ]);
            } elseif (!empty($options['notes'])) {
                $run->notes = $options['notes'];
                $run->save();
            }

            $employees = Employee::whereIn('status', ['active', 'on_leave'])
                ->orderBy('id')
                ->get();

            foreach ($employees as $employee) {
                $existingItem = PayrollItem::where('payroll_run_id', $run->id)
                    ->where('employee_id', $employee->id)
                    ->first();

                // Never overwrite an already-paid payslip
                if ($existingItem && $existingItem->payment_status === 'paid') {
                    continue;
                }

                $attendances = EmployeeAttendance::where('employee_id', $employee->id)
                    ->whereBetween('date', [$startDate, $endDate])
                    ->get();

                $presentDays = $attendances->where('status', 'present')->count();
                $lateDays = $attendances->where('status', 'late')->count();
                $absentDays = $attendances->where('status', 'absent')->count();
                $halfDays = $attendances->where('status', 'half_day')->count();
                $leaveDays = $attendances->whereIn('status', ['paid_leave', 'holiday'])->count();
                $overtimeHours = round((float) $attendances->sum('overtime_hours'), 2);
                $totalFines = round((float) $attendances->sum('fine_amount'), 2);

                $workingDays = max(1, (int) ($employee->working_days_per_month ?: 26));
                $basicSalary = round((float) ($employee->basic_salary ?? 0), 2);
                $allowances = round((float) ($employee->default_allowances ?? 0), 2);
                $dailyRate = $workingDays > 0 ? ($basicSalary / $workingDays) : 0.0;

                $absenceDeduction = round(($absentDays * $dailyRate) + ($halfDays * ($dailyRate * 0.5)), 2);
                $lateOrFineDeduction = round($totalFines, 2);
                $overtimePay = round($overtimeHours * (float) ($employee->hourly_overtime_rate ?? 0), 2);

                // Calculate Sales Commission & Target Bonus
                $commData = $this->calculateEmployeeCommission($employee, $startDate, $endDate);
                $salesInvoicesCount = (int) $commData['invoices_count'];
                $salesVolume = round((float) $commData['net_sales'], 2);
                $salesGrossProfit = round((float) $commData['gross_profit'], 2);
                $salesCommission = round((float) $commData['commission_earned'], 2);
                $targetBonus = round((float) $commData['target_bonus'], 2);
                $otherBonus = $existingItem ? round((float) $existingItem->other_bonus, 2) : 0.0;
                $otherDeduction = $existingItem ? round((float) $existingItem->other_deduction, 2) : 0.0;

                $grossEarnings = round(
                    $basicSalary + $allowances + $overtimePay + $salesCommission + $targetBonus + $otherBonus,
                    2
                );

                $preAdvanceNet = max(0.0, $grossEarnings - ($absenceDeduction + $lateOrFineDeduction + $otherDeduction));
                $advanceDeduction = $autoDeductAdvances
                    ? round(min((float) ($employee->advance_balance ?? 0), $preAdvanceNet), 2)
                    : 0.0;

                $totalDeductions = round(
                    $absenceDeduction + $lateOrFineDeduction + $advanceDeduction + $otherDeduction,
                    2
                );
                $netPayable = round(max(0.0, $grossEarnings - $totalDeductions), 2);

                $itemPayload = [
                    'working_days'           => $workingDays,
                    'present_days'           => $presentDays + $lateDays,
                    'absent_days'            => $absentDays,
                    'late_days'              => $lateDays,
                    'half_days'              => $halfDays,
                    'leave_days'             => $leaveDays,
                    'overtime_hours'         => $overtimeHours,
                    'basic_salary'           => $basicSalary,
                    'allowances'             => $allowances,
                    'overtime_pay'           => $overtimePay,
                    'sales_invoices_count'   => $salesInvoicesCount,
                    'sales_volume'           => $salesVolume,
                    'sales_gross_profit'     => $salesGrossProfit,
                    'sales_commission'       => $salesCommission,
                    'target_bonus'           => $targetBonus,
                    'other_bonus'            => $otherBonus,
                    'gross_earnings'         => $grossEarnings,
                    'absence_deduction'      => $absenceDeduction,
                    'late_or_fine_deduction' => $lateOrFineDeduction,
                    'advance_deduction'      => $advanceDeduction,
                    'other_deduction'        => $otherDeduction,
                    'total_deductions'       => $totalDeductions,
                    'net_payable'            => $netPayable,
                    'payment_method'         => $existingItem?->payment_method ?: $employee->payment_method,
                ];

                if ($existingItem) {
                    $existingItem->update($itemPayload);
                } else {
                    PayrollItem::create(array_merge($itemPayload, [
                        'payroll_run_id' => $run->id,
                        'employee_id'    => $employee->id,
                        'payment_status' => 'unpaid',
                    ]));
                }
            }

            return $this->recalculateRunTotals($run);
        });
    }

    /**
     * Update an unpaid PayrollItem (adjust bonuses, overtime, deductions, or advance recovery).
     */
    public function updatePayrollItem(PayrollItem $item, array $data): PayrollItem
    {
        $this->ensureTables();

        return DB::transaction(function () use ($item, $data) {
            $item = PayrollItem::lockForUpdate()->with('employee')->findOrFail($item->id);
            if ($item->payment_status === 'paid') {
                throw ValidationException::withMessages([
                    'payment_status' => 'Cannot modify a payslip that has already been paid.',
                ]);
            }

            $employee = $item->employee;
            $basicSalary = array_key_exists('basic_salary', $data) ? round((float) $data['basic_salary'], 2) : (float) $item->basic_salary;
            $allowances = array_key_exists('allowances', $data) ? round((float) $data['allowances'], 2) : (float) $item->allowances;
            $overtimePay = array_key_exists('overtime_pay', $data) ? round((float) $data['overtime_pay'], 2) : (float) $item->overtime_pay;
            $salesCommission = array_key_exists('sales_commission', $data) ? round((float) $data['sales_commission'], 2) : (float) $item->sales_commission;
            $targetBonus = array_key_exists('target_bonus', $data) ? round((float) $data['target_bonus'], 2) : (float) $item->target_bonus;
            $otherBonus = array_key_exists('other_bonus', $data) ? round((float) $data['other_bonus'], 2) : (float) $item->other_bonus;

            $absenceDeduction = array_key_exists('absence_deduction', $data) ? round((float) $data['absence_deduction'], 2) : (float) $item->absence_deduction;
            $lateOrFineDeduction = array_key_exists('late_or_fine_deduction', $data) ? round((float) $data['late_or_fine_deduction'], 2) : (float) $item->late_or_fine_deduction;
            $advanceDeduction = array_key_exists('advance_deduction', $data) ? round((float) $data['advance_deduction'], 2) : (float) $item->advance_deduction;
            $otherDeduction = array_key_exists('other_deduction', $data) ? round((float) $data['other_deduction'], 2) : (float) $item->other_deduction;

            if ($advanceDeduction > (float) ($employee->advance_balance ?? 0) + 0.009) {
                throw ValidationException::withMessages([
                    'advance_deduction' => "Advance deduction ({$advanceDeduction}) cannot exceed employee's outstanding advance balance ({$employee->advance_balance}).",
                ]);
            }

            $grossEarnings = round(
                $basicSalary + $allowances + $overtimePay + $salesCommission + $targetBonus + $otherBonus,
                2
            );
            $totalDeductions = round(
                $absenceDeduction + $lateOrFineDeduction + $advanceDeduction + $otherDeduction,
                2
            );
            $netPayable = round(max(0.0, $grossEarnings - $totalDeductions), 2);

            $item->update([
                'basic_salary'           => $basicSalary,
                'allowances'             => $allowances,
                'overtime_pay'           => $overtimePay,
                'sales_commission'       => $salesCommission,
                'target_bonus'           => $targetBonus,
                'other_bonus'            => $otherBonus,
                'gross_earnings'         => $grossEarnings,
                'absence_deduction'      => $absenceDeduction,
                'late_or_fine_deduction' => $lateOrFineDeduction,
                'advance_deduction'      => $advanceDeduction,
                'other_deduction'        => $otherDeduction,
                'total_deductions'       => $totalDeductions,
                'net_payable'            => $netPayable,
                'notes'                  => array_key_exists('notes', $data) ? $data['notes'] : $item->notes,
            ]);

            $this->recalculateRunTotals($item->payrollRun);

            return $item->fresh(['employee', 'payrollRun']);
        });
    }

    /**
     * Pay a single PayrollItem (Payslip):
     * - Deducts advance_deduction from Employee's advance_balance and logs an EmployeeAdvance ('payroll_deduction')
     * - Records an official Operating Expense for net_payable (which updates Treasury Account, Cash Drawer & P&L / GL)
     */
    public function payPayrollItem(PayrollItem $item, array $paymentData = [], ?User $user = null): PayrollItem
    {
        $this->ensureTables();

        return DB::transaction(function () use ($item, $paymentData, $user) {
            $item = PayrollItem::lockForUpdate()->with(['employee', 'payrollRun'])->findOrFail($item->id);
            if ($item->payment_status === 'paid') {
                throw ValidationException::withMessages([
                    'payment_status' => 'This payslip has already been paid.',
                ]);
            }

            $employee = Employee::lockForUpdate()->findOrFail($item->employee_id);
            $run = $item->payrollRun;
            $paymentMethod = $paymentData['payment_method'] ?? $item->payment_method ?? $employee->payment_method ?? 'cash';
            // Map bank_transfer to 'bank' for ExpenseService compatibility
            $expensePaymentMethod = $paymentMethod === 'bank_transfer' ? 'bank' : $paymentMethod;
            $accountId = !empty($paymentData['account_id']) ? (int) $paymentData['account_id'] : null;
            $paymentDate = !empty($paymentData['date'])
                ? Carbon::parse($paymentData['date'])->toDateString()
                : Carbon::today()->toDateString();

            // 1. Recover staff advance deduction if applicable
            $advDeduct = round((float) ($item->advance_deduction ?? 0), 2);
            if ($advDeduct > 0) {
                $currentAdv = round((float) ($employee->advance_balance ?? 0), 2);
                $actualDeduct = min($advDeduct, $currentAdv);
                if ($actualDeduct > 0) {
                    $newAdvBalance = round(max(0.0, $currentAdv - $actualDeduct), 2);
                    EmployeeAdvance::create([
                        'advance_number'   => EmployeeAdvance::generateAdvanceNumber($paymentDate),
                        'employee_id'      => $employee->id,
                        'type'             => 'payroll_deduction',
                        'amount'           => $actualDeduct,
                        'balance_after'    => $newAdvBalance,
                        'date'             => $paymentDate,
                        'payment_method'   => 'payroll_deduction',
                        'payroll_item_id'  => $item->id,
                        'reference_number' => $run->run_number,
                        'description'      => "Payroll advance deduction ({$run->period_month}) for {$employee->name}",
                        'created_by'       => $user?->id,
                    ]);
                    $employee->advance_balance = $newAdvBalance;
                    $employee->save();
                }
            }

            // 2. Disburse net_payable via ExpenseService (links to Treasury, Cash Drawer & P&L / GL)
            $expense = null;
            $netPayable = round((float) ($item->net_payable ?? 0), 2);
            if ($netPayable > 0) {
                $category = ExpenseCategory::firstOrCreate(
                    ['name' => 'Staff Salaries, Payroll & Commissions'],
                    ['description' => 'Monthly employee payroll, overtime, and salesman/cashier commissions']
                );

                $expense = $this->expenseService->createExpense([
                    'expense_category_id' => $category->id,
                    'account_id'          => $accountId,
                    'amount'              => $netPayable,
                    'date'                => $paymentDate,
                    'payment_method'      => $expensePaymentMethod,
                    'reference_number'    => $run->run_number . '-' . $employee->employee_code,
                    'payee'               => $employee->name,
                    'description'         => "Payroll ({$run->period_month}) for {$employee->name} ({$employee->employee_code})",
                ], $user);
            }

            $item->payment_status = 'paid';
            $item->payment_method = $paymentMethod;
            $item->account_id = $expense?->account_id ?? $accountId;
            $item->expense_id = $expense?->id;
            $item->paid_at = now();
            $item->save();

            $this->recalculateRunTotals($run);

            return $item->fresh(['employee', 'payrollRun', 'account', 'expense']);
        });
    }

    /**
     * Pay all unpaid items in a PayrollRun in one click.
     */
    public function payAllInRun(PayrollRun $run, array $paymentData = [], ?User $user = null): PayrollRun
    {
        $this->ensureTables();

        return DB::transaction(function () use ($run, $paymentData, $user) {
            $unpaidItems = PayrollItem::where('payroll_run_id', $run->id)
                ->where('payment_status', '!=', 'paid')
                ->get();

            foreach ($unpaidItems as $item) {
                $this->payPayrollItem($item, $paymentData, $user);
            }

            return $this->recalculateRunTotals($run->fresh());
        });
    }

    /**
     * Recalculate aggregate totals and status on a PayrollRun.
     */
    public function recalculateRunTotals(PayrollRun $run): PayrollRun
    {
        $items = PayrollItem::where('payroll_run_id', $run->id)->get();

        $totalBasic = round((float) $items->sum('basic_salary'), 2);
        $totalAllowances = round((float) $items->sum('allowances'), 2);
        $totalOvertime = round((float) $items->sum('overtime_pay'), 2);
        $totalCommissions = round((float) $items->sum('sales_commission'), 2);
        $totalBonuses = round((float) $items->sum(fn ($i) => (float) $i->target_bonus + (float) $i->other_bonus), 2);
        $totalAdvanceDeductions = round((float) $items->sum('advance_deduction'), 2);
        $totalDeductions = round((float) $items->sum('total_deductions'), 2);
        $totalNetPayable = round((float) $items->sum('net_payable'), 2);
        $totalPaid = round((float) $items->where('payment_status', 'paid')->sum('net_payable'), 2);

        $allPaid = $items->count() > 0 && $items->every(fn ($i) => $i->payment_status === 'paid');
        $anyPaid = $items->contains(fn ($i) => $i->payment_status === 'paid');

        $status = $allPaid ? 'paid' : ($anyPaid ? 'partial' : 'draft');

        $run->update([
            'status'                   => $status,
            'total_basic'              => $totalBasic,
            'total_allowances'         => $totalAllowances,
            'total_overtime'           => $totalOvertime,
            'total_commissions'        => $totalCommissions,
            'total_bonuses'            => $totalBonuses,
            'total_deductions'         => $totalDeductions,
            'total_advance_deductions' => $totalAdvanceDeductions,
            'total_net_payable'        => $totalNetPayable,
            'total_paid'               => $totalPaid,
            'paid_at'                  => $allPaid ? ($run->paid_at ?? now()) : null,
        ]);

        return $run->fresh(['items.employee', 'items.account']);
    }
}

