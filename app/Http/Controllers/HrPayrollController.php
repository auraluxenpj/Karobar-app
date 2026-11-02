<?php

namespace App\Http\Controllers;

use App\Models\Employee;
use App\Models\EmployeeAdvance;
use App\Models\EmployeeAttendance;
use App\Models\PayrollItem;
use App\Models\PayrollRun;
use App\Services\HrPayrollService;
use Carbon\Carbon;
use Illuminate\Http\Request;
use Illuminate\Support\Facades\DB;
use Illuminate\Validation\Rule;
use Illuminate\Validation\ValidationException;

class HrPayrollController extends Controller
{
    protected HrPayrollService $hrService;

    public function __construct(HrPayrollService $hrService)
    {
        $this->hrService = $hrService;
    }

    protected function canViewHr($user): bool
    {
        return (bool) (
            $user && (
                $user->hasRole(['Admin', 'admin', 'super-admin'])
                || $user->can('hr.view')
                || $user->can('hr.manage')
                || $user->can('user.manage')
                || ($user->can('user.view') && $user->can('account.view'))
            )
        );
    }

    protected function authorizeView(Request $request): void
    {
        $user = $request->user();
        if (!$this->canViewHr($user)) {
            abort(403, 'Unauthorized to view HR & Payroll.');
        }
    }

    protected function authorizeManage(Request $request): void
    {
        $user = $request->user();
        if (
            !$user
            || (
                !$user->hasRole(['Admin', 'admin', 'super-admin'])
                && !$user->can('hr.manage')
                && !$user->can('user.manage')
                && !$user->can('account.manage')
                && !($user->can('user.update') && $user->can('account.update'))
            )
        ) {
            abort(403, 'Unauthorized to manage HR & Payroll.');
        }
    }

    /**
     * GET /api/hr/overview
     */
    public function overview(Request $request)
    {
        $this->authorizeView($request);

        return response()->json(
            $this->hrService->getOverview(
                $request->query('month'),
                $request->query('attendance_date')
            )
        );
    }

    /**
     * GET /api/hr/employees/new-code
     */
    public function newEmployeeCode(Request $request)
    {
        $this->authorizeView($request);
        $this->hrService->ensureTables();

        return response()->json([
            'employee_code' => Employee::generateEmployeeCode(),
        ]);
    }

    /**
     * GET /api/hr/employees
     */
    public function employees(Request $request)
    {
        $user = $request->user();
        $hasFullHrAccess = $this->canViewHr($user);

        if (!$hasFullHrAccess) {
            $canLookupActiveSalesmen = $user && $request->query('status') === 'active' && (
                $user->can('sale-invoice.view')
                || $user->can('sale-invoice.create')
                || $user->can('barcode-pos.view')
                || $user->can('barcode-pos.create')
            );
            if (!$canLookupActiveSalesmen) {
                abort(403, 'Unauthorized to view HR & Payroll.');
            }
            $this->hrService->ensureTables();
            return response()->json(
                Employee::query()
                    ->where('status', 'active')
                    ->orderBy('name')
                    ->get(['id', 'employee_code', 'name', 'designation', 'department', 'status', 'commission_rate'])
            );
        }

        $this->hrService->ensureTables();

        $query = Employee::with('user:id,name,email')->orderBy('name');

        if ($request->filled('status') && $request->query('status') !== 'all') {
            $query->where('status', $request->query('status'));
        }
        if ($request->filled('department') && $request->query('department') !== 'all') {
            $query->where('department', $request->query('department'));
        }
        if ($request->filled('search')) {
            $s = trim((string) $request->query('search'));
            $query->where(function ($q) use ($s) {
                $q->where('name', 'like', "%{$s}%")
                    ->orWhere('employee_code', 'like', "%{$s}%")
                    ->orWhere('phone', 'like', "%{$s}%")
                    ->orWhere('designation', 'like', "%{$s}%");
            });
        }

        return response()->json($query->get());
    }

    /**
     * POST /api/hr/employees
     */
    public function storeEmployee(Request $request)
    {
        $this->authorizeManage($request);
        $this->hrService->ensureTables();

        $validated = $request->validate([
            'employee_code'          => ['nullable', 'string', 'max:40', 'unique:employees,employee_code'],
            'user_id'                => ['nullable', 'integer', 'exists:users,id'],
            'name'                   => ['required', 'string', 'max:150'],
            'phone'                  => ['nullable', 'string', 'max:50'],
            'email'                  => ['nullable', 'email', 'max:150'],
            'cnic'                   => ['nullable', 'string', 'max:50'],
            'address'                => ['nullable', 'string', 'max:500'],
            'department'             => ['nullable', 'string', 'max:100'],
            'designation'            => ['nullable', 'string', 'max:100'],
            'employment_type'        => ['nullable', 'string', Rule::in(['full_time', 'part_time', 'commission_only', 'contract'])],
            'joining_date'           => ['nullable', 'date'],
            'shift_name'             => ['nullable', 'string', 'max:80'],
            'shift_start'            => ['nullable', 'string', 'max:10'],
            'shift_end'              => ['nullable', 'string', 'max:10'],
            'working_days_per_month' => ['nullable', 'integer', 'min:1', 'max:31'],
            'basic_salary'           => ['nullable', 'numeric', 'min:0'],
            'default_allowances'     => ['nullable', 'numeric', 'min:0'],
            'hourly_overtime_rate'   => ['nullable', 'numeric', 'min:0'],
            'commission_type'        => ['nullable', 'string', Rule::in(['none', 'net_sales_percent', 'gross_profit_percent', 'fixed_per_invoice'])],
            'commission_rate'        => ['nullable', 'numeric', 'min:0'],
            'monthly_sales_target'   => ['nullable', 'numeric', 'min:0'],
            'target_bonus_amount'    => ['nullable', 'numeric', 'min:0'],
            'payment_method'         => ['nullable', 'string', Rule::in(['cash', 'bank_transfer', 'wallet', 'cheque'])],
            'bank_name'              => ['nullable', 'string', 'max:120'],
            'bank_account_number'    => ['nullable', 'string', 'max:100'],
            'status'                 => ['nullable', 'string', Rule::in(['active', 'on_leave', 'inactive'])],
            'notes'                  => ['nullable', 'string'],
        ]);

        if (empty($validated['employee_code'])) {
            $validated['employee_code'] = Employee::generateEmployeeCode();
        }

        $employee = Employee::create([
            'employee_code'          => trim($validated['employee_code']),
            'user_id'                => $validated['user_id'] ?? null,
            'name'                   => trim($validated['name']),
            'phone'                  => $validated['phone'] ?? null,
            'email'                  => $validated['email'] ?? null,
            'cnic'                   => $validated['cnic'] ?? null,
            'address'                => $validated['address'] ?? null,
            'department'             => $validated['department'] ?? 'Sales & Counter',
            'designation'            => $validated['designation'] ?? 'Sales Associate',
            'employment_type'        => $validated['employment_type'] ?? 'full_time',
            'joining_date'           => $validated['joining_date'] ?? Carbon::today()->toDateString(),
            'shift_name'             => $validated['shift_name'] ?? 'Regular Shift',
            'shift_start'            => $validated['shift_start'] ?? '09:00',
            'shift_end'              => $validated['shift_end'] ?? '18:00',
            'working_days_per_month' => (int) ($validated['working_days_per_month'] ?? 26),
            'basic_salary'           => (float) ($validated['basic_salary'] ?? 0),
            'default_allowances'     => (float) ($validated['default_allowances'] ?? 0),
            'hourly_overtime_rate'   => (float) ($validated['hourly_overtime_rate'] ?? 0),
            'commission_type'        => $validated['commission_type'] ?? 'none',
            'commission_rate'        => (float) ($validated['commission_rate'] ?? 0),
            'monthly_sales_target'   => (float) ($validated['monthly_sales_target'] ?? 0),
            'target_bonus_amount'    => (float) ($validated['target_bonus_amount'] ?? 0),
            'payment_method'         => $validated['payment_method'] ?? 'cash',
            'bank_name'              => $validated['bank_name'] ?? null,
            'bank_account_number'    => $validated['bank_account_number'] ?? null,
            'status'                 => $validated['status'] ?? 'active',
            'notes'                  => $validated['notes'] ?? null,
        ]);

        return response()->json($employee->load('user:id,name,email'), 201);
    }

    /**
     * PUT /api/hr/employees/{employee}
     */
    public function updateEmployee(Request $request, Employee $employee)
    {
        $this->authorizeManage($request);

        $validated = $request->validate([
            'employee_code'          => ['required', 'string', 'max:40', Rule::unique('employees', 'employee_code')->ignore($employee->id)],
            'user_id'                => ['nullable', 'integer', 'exists:users,id'],
            'name'                   => ['required', 'string', 'max:150'],
            'phone'                  => ['nullable', 'string', 'max:50'],
            'email'                  => ['nullable', 'email', 'max:150'],
            'cnic'                   => ['nullable', 'string', 'max:50'],
            'address'                => ['nullable', 'string', 'max:500'],
            'department'             => ['nullable', 'string', 'max:100'],
            'designation'            => ['nullable', 'string', 'max:100'],
            'employment_type'        => ['nullable', 'string', Rule::in(['full_time', 'part_time', 'commission_only', 'contract'])],
            'joining_date'           => ['nullable', 'date'],
            'shift_name'             => ['nullable', 'string', 'max:80'],
            'shift_start'            => ['nullable', 'string', 'max:10'],
            'shift_end'              => ['nullable', 'string', 'max:10'],
            'working_days_per_month' => ['nullable', 'integer', 'min:1', 'max:31'],
            'basic_salary'           => ['nullable', 'numeric', 'min:0'],
            'default_allowances'     => ['nullable', 'numeric', 'min:0'],
            'hourly_overtime_rate'   => ['nullable', 'numeric', 'min:0'],
            'commission_type'        => ['nullable', 'string', Rule::in(['none', 'net_sales_percent', 'gross_profit_percent', 'fixed_per_invoice'])],
            'commission_rate'        => ['nullable', 'numeric', 'min:0'],
            'monthly_sales_target'   => ['nullable', 'numeric', 'min:0'],
            'target_bonus_amount'    => ['nullable', 'numeric', 'min:0'],
            'payment_method'         => ['nullable', 'string', Rule::in(['cash', 'bank_transfer', 'wallet', 'cheque'])],
            'bank_name'              => ['nullable', 'string', 'max:120'],
            'bank_account_number'    => ['nullable', 'string', 'max:100'],
            'status'                 => ['nullable', 'string', Rule::in(['active', 'on_leave', 'inactive'])],
            'notes'                  => ['nullable', 'string'],
        ]);

        $employee->update($validated);

        return response()->json($employee->fresh()->load('user:id,name,email'));
    }

    /**
     * DELETE /api/hr/employees/{employee}
     */
    public function destroyEmployee(Request $request, Employee $employee)
    {
        $this->authorizeManage($request);

        if ((float) $employee->advance_balance > 0) {
            throw ValidationException::withMessages([
                'employee' => 'Cannot delete employee with an outstanding salary advance balance. Recover the advance or mark the employee as Inactive.',
            ]);
        }

        if ($employee->payrollItems()->where('payment_status', 'paid')->exists()) {
            throw ValidationException::withMessages([
                'employee' => 'Cannot delete employee with historical paid payslips. Mark the employee as Inactive instead.',
            ]);
        }

        $employee->delete();

        return response()->json(['message' => 'Employee deleted successfully.']);
    }

    /**
     * GET /api/hr/attendance
     * Returns daily attendance sheet for ?date=YYYY-MM-DD
     */
    public function attendance(Request $request)
    {
        $this->authorizeView($request);
        $this->hrService->ensureTables();

        $date = $request->query('date')
            ? Carbon::parse($request->query('date'))->toDateString()
            : Carbon::today()->toDateString();

        $employees = Employee::whereIn('status', ['active', 'on_leave'])
            ->orderBy('name')
            ->get();

        $records = EmployeeAttendance::where('date', $date)
            ->get()
            ->keyBy('employee_id');

        $sheet = $employees->map(function (Employee $emp) use ($records, $date) {
            $att = $records->get($emp->id);
            return [
                'employee_id'    => $emp->id,
                'employee_code'  => $emp->employee_code,
                'employee_name'  => $emp->name,
                'department'     => $emp->department,
                'designation'    => $emp->designation,
                'shift_name'     => $emp->shift_name,
                'shift_start'    => $emp->shift_start,
                'shift_end'      => $emp->shift_end,
                'date'           => $date,
                'attendance_id'  => $att?->id,
                'status'         => $att?->status ?? 'present',
                'is_marked'      => $att !== null,
                'check_in'       => $att?->check_in ?? $emp->shift_start,
                'check_out'      => $att?->check_out ?? $emp->shift_end,
                'late_minutes'   => (int) ($att?->late_minutes ?? 0),
                'overtime_hours' => (float) ($att?->overtime_hours ?? 0),
                'fine_amount'    => (float) ($att?->fine_amount ?? 0),
                'notes'          => $att?->notes ?? '',
            ];
        })->values();

        return response()->json([
            'date'  => $date,
            'sheet' => $sheet,
        ]);
    }

    /**
     * POST /api/hr/attendance
     * Save or update a single employee's attendance for a date.
     */
    public function saveAttendance(Request $request)
    {
        $this->authorizeManage($request);
        $this->hrService->ensureTables();

        $validated = $request->validate([
            'employee_id'    => ['required', 'integer', 'exists:employees,id'],
            'date'           => ['required', 'date'],
            'status'         => ['required', 'string', Rule::in(['present', 'absent', 'late', 'half_day', 'paid_leave', 'holiday'])],
            'check_in'       => ['nullable', 'string', 'max:10'],
            'check_out'      => ['nullable', 'string', 'max:10'],
            'late_minutes'   => ['nullable', 'integer', 'min:0'],
            'overtime_hours' => ['nullable', 'numeric', 'min:0'],
            'fine_amount'    => ['nullable', 'numeric', 'min:0'],
            'notes'          => ['nullable', 'string', 'max:300'],
        ]);

        $dateStr = Carbon::parse($validated['date'])->toDateString();

        $attendance = EmployeeAttendance::updateOrCreate(
            [
                'employee_id' => (int) $validated['employee_id'],
                'date'        => $dateStr,
            ],
            [
                'status'         => $validated['status'],
                'check_in'       => $validated['check_in'] ?? null,
                'check_out'      => $validated['check_out'] ?? null,
                'late_minutes'   => (int) ($validated['late_minutes'] ?? 0),
                'overtime_hours' => (float) ($validated['overtime_hours'] ?? 0),
                'fine_amount'    => (float) ($validated['fine_amount'] ?? 0),
                'notes'          => $validated['notes'] ?? null,
                'recorded_by'    => $request->user()?->id,
            ]
        );

        return response()->json($attendance->load('employee'));
    }

    /**
     * POST /api/hr/attendance/bulk
     * Save an entire daily attendance sheet in one click.
     */
    public function saveBulkAttendance(Request $request)
    {
        $this->authorizeManage($request);
        $this->hrService->ensureTables();

        $validated = $request->validate([
            'date'                     => ['required', 'date'],
            'entries'                  => ['required', 'array', 'min:1'],
            'entries.*.employee_id'    => ['required', 'integer', 'exists:employees,id'],
            'entries.*.status'         => ['required', 'string', Rule::in(['present', 'absent', 'late', 'half_day', 'paid_leave', 'holiday'])],
            'entries.*.check_in'       => ['nullable', 'string', 'max:10'],
            'entries.*.check_out'      => ['nullable', 'string', 'max:10'],
            'entries.*.late_minutes'   => ['nullable', 'integer', 'min:0'],
            'entries.*.overtime_hours' => ['nullable', 'numeric', 'min:0'],
            'entries.*.fine_amount'    => ['nullable', 'numeric', 'min:0'],
            'entries.*.notes'          => ['nullable', 'string', 'max:300'],
        ]);

        $dateStr = Carbon::parse($validated['date'])->toDateString();
        $userId = $request->user()?->id;

        DB::transaction(function () use ($validated, $dateStr, $userId) {
            foreach ($validated['entries'] as $row) {
                EmployeeAttendance::updateOrCreate(
                    [
                        'employee_id' => (int) $row['employee_id'],
                        'date'        => $dateStr,
                    ],
                    [
                        'status'         => $row['status'],
                        'check_in'       => $row['check_in'] ?? null,
                        'check_out'      => $row['check_out'] ?? null,
                        'late_minutes'   => (int) ($row['late_minutes'] ?? 0),
                        'overtime_hours' => (float) ($row['overtime_hours'] ?? 0),
                        'fine_amount'    => (float) ($row['fine_amount'] ?? 0),
                        'notes'          => $row['notes'] ?? null,
                        'recorded_by'    => $userId,
                    ]
                );
            }
        });

        return response()->json([
            'message' => "Saved attendance for " . count($validated['entries']) . " employees on {$dateStr}.",
            'date'    => $dateStr,
        ]);
    }

    /**
     * GET /api/hr/advances
     */
    public function advances(Request $request)
    {
        $this->authorizeView($request);
        $this->hrService->ensureTables();

        $query = EmployeeAdvance::with(['employee:id,employee_code,name,department,designation,advance_balance', 'account:id,name,code,type'])
            ->orderByDesc('date')
            ->orderByDesc('id');

        if ($request->filled('employee_id')) {
            $query->where('employee_id', (int) $request->query('employee_id'));
        }
        if ($request->filled('type') && $request->query('type') !== 'all') {
            $query->where('type', $request->query('type'));
        }

        return response()->json($query->limit(200)->get());
    }

    /**
     * POST /api/hr/advances
     */
    public function storeAdvance(Request $request)
    {
        $this->authorizeManage($request);

        $validated = $request->validate([
            'employee_id'      => ['required', 'integer', 'exists:employees,id'],
            'type'             => ['required', 'string', Rule::in(['advance', 'repayment'])],
            'amount'           => ['required', 'numeric', 'min:0.01'],
            'date'             => ['nullable', 'date'],
            'payment_method'   => ['nullable', 'string', Rule::in(['cash', 'bank_transfer', 'wallet', 'cheque'])],
            'account_id'       => ['nullable', 'integer', 'exists:accounts,id'],
            'reference_number' => ['nullable', 'string', 'max:100'],
            'description'      => ['nullable', 'string', 'max:400'],
        ]);

        $advance = $this->hrService->recordAdvanceTransaction($validated, $request->user());

        return response()->json($advance, 201);
    }

    /**
     * GET /api/hr/commissions
     */
    public function commissions(Request $request)
    {
        $this->authorizeView($request);

        $from = $request->query('from')
            ? Carbon::parse($request->query('from'))->toDateString()
            : Carbon::today()->startOfMonth()->toDateString();
        $to = $request->query('to')
            ? Carbon::parse($request->query('to'))->toDateString()
            : Carbon::today()->endOfMonth()->toDateString();

        return response()->json($this->hrService->getCommissionsReport($from, $to));
    }

    /**
     * GET /api/hr/payroll-runs
     */
    public function payrollRuns(Request $request)
    {
        $this->authorizeView($request);
        $this->hrService->ensureTables();

        $runs = PayrollRun::with(['items.employee', 'items.account', 'generatedByUser:id,name'])
            ->orderByDesc('period_month')
            ->get();

        return response()->json($runs);
    }

    /**
     * POST /api/hr/payroll-runs/generate
     */
    public function generatePayrollRun(Request $request)
    {
        $this->authorizeManage($request);

        $validated = $request->validate([
            'period_month'         => ['required', 'string', 'regex:/^\d{4}-\d{2}$/'],
            'auto_deduct_advances' => ['nullable', 'boolean'],
            'notes'                => ['nullable', 'string', 'max:500'],
        ]);

        $run = $this->hrService->generateOrRefreshPayrollRun(
            $validated['period_month'],
            $validated,
            $request->user()
        );

        return response()->json($run, 201);
    }

    /**
     * PUT /api/hr/payroll-items/{payrollItem}
     */
    public function updatePayrollItem(Request $request, PayrollItem $payrollItem)
    {
        $this->authorizeManage($request);

        $validated = $request->validate([
            'basic_salary'           => ['nullable', 'numeric', 'min:0'],
            'allowances'             => ['nullable', 'numeric', 'min:0'],
            'overtime_pay'           => ['nullable', 'numeric', 'min:0'],
            'sales_commission'       => ['nullable', 'numeric', 'min:0'],
            'target_bonus'           => ['nullable', 'numeric', 'min:0'],
            'other_bonus'            => ['nullable', 'numeric', 'min:0'],
            'absence_deduction'      => ['nullable', 'numeric', 'min:0'],
            'late_or_fine_deduction' => ['nullable', 'numeric', 'min:0'],
            'advance_deduction'      => ['nullable', 'numeric', 'min:0'],
            'other_deduction'        => ['nullable', 'numeric', 'min:0'],
            'notes'                  => ['nullable', 'string', 'max:400'],
        ]);

        $updated = $this->hrService->updatePayrollItem($payrollItem, $validated);

        return response()->json($updated);
    }

    /**
     * POST /api/hr/payroll-items/{payrollItem}/pay
     */
    public function payPayrollItem(Request $request, PayrollItem $payrollItem)
    {
        $this->authorizeManage($request);

        $validated = $request->validate([
            'payment_method' => ['nullable', 'string', Rule::in(['cash', 'bank_transfer', 'wallet', 'cheque'])],
            'account_id'     => ['nullable', 'integer', 'exists:accounts,id'],
            'date'           => ['nullable', 'date'],
        ]);

        $paid = $this->hrService->payPayrollItem($payrollItem, $validated, $request->user());

        return response()->json($paid);
    }

    /**
     * POST /api/hr/payroll-runs/{payrollRun}/pay-all
     */
    public function payAllInRun(Request $request, PayrollRun $payrollRun)
    {
        $this->authorizeManage($request);

        $validated = $request->validate([
            'payment_method' => ['nullable', 'string', Rule::in(['cash', 'bank_transfer', 'wallet', 'cheque'])],
            'account_id'     => ['nullable', 'integer', 'exists:accounts,id'],
            'date'           => ['nullable', 'date'],
        ]);

        $run = $this->hrService->payAllInRun($payrollRun, $validated, $request->user());

        return response()->json($run);
    }
}

