import React, { useState, useEffect, useMemo, useCallback } from "react";
import { useSearchParams } from "react-router-dom";
import axios from "axios";
import toast from "react-hot-toast";
import { useTheme } from "@/context/ThemeContext.jsx";
import { getThemeButtonClasses } from "@/utils/buttonStyles.js";
import { printCurrentView } from "@/utils/printHelper.js";
import {
  UserGroupIcon,
  ClockIcon,
  BanknotesIcon,
  TrophyIcon,
  PlusIcon,
  PencilSquareIcon,
  TrashIcon,
  CheckCircleIcon,
  ArrowPathIcon,
  PrinterIcon,
  DocumentTextIcon,
  CalendarDaysIcon,
  SparklesIcon,
  XMarkIcon,
  CheckBadgeIcon,
  ExclamationTriangleIcon,
  ArrowsRightLeftIcon,
} from "@heroicons/react/24/outline";

const DEPARTMENTS = [
  "Sales & Counter",
  "Pharmacy",
  "Wholesale Distribution",
  "Warehouse & Godown",
  "Accounts & Admin",
  "Delivery & Logistics",
];

const COMMISSION_TYPES = [
  { value: "none", label: "No Commission" },
  { value: "net_sales_percent", label: "% of Net Sales Revenue" },
  { value: "gross_profit_percent", label: "% of Gross Profit Margin" },
  { value: "fixed_per_invoice", label: "Fixed Amount per Invoice" },
];

const ATTENDANCE_STATUSES = [
  { value: "present", label: "Present", badge: "bg-emerald-500/15 text-emerald-700 dark:text-emerald-300 border-emerald-500/30" },
  { value: "late", label: "Late", badge: "bg-amber-500/15 text-amber-700 dark:text-amber-300 border-amber-500/30" },
  { value: "half_day", label: "Half Day", badge: "bg-orange-500/15 text-orange-700 dark:text-orange-300 border-orange-500/30" },
  { value: "absent", label: "Absent", badge: "bg-rose-500/15 text-rose-700 dark:text-rose-300 border-rose-500/30" },
  { value: "paid_leave", label: "Paid Leave", badge: "bg-blue-500/15 text-blue-700 dark:text-blue-300 border-blue-500/30" },
  { value: "holiday", label: "Holiday / Off", badge: "bg-slate-500/15 text-slate-700 dark:text-slate-300 border-slate-500/30" },
];

export default function HrPayrollCenter() {
  const [searchParams, setSearchParams] = useSearchParams();
  const { isDark, theme } = useTheme();

  const initialTab = searchParams.get("tab") || "directory";
  const [activeTab, setActiveTab] = useState(initialTab);

  useEffect(() => {
    const t = searchParams.get("tab");
    if (t && ["directory", "attendance", "payroll", "commissions"].includes(t)) {
      setActiveTab(t);
    }
  }, [searchParams]);

  const switchTab = (tabKey) => {
    setActiveTab(tabKey);
    setSearchParams({ tab: tabKey });
  };

  // Theme colors
  const themeColors = useMemo(
    () => ({
      primary: theme?.primary_color || "#3b82f6",
      primaryHover: theme?.primary_hover || "#2563eb",
      primaryLight: theme?.primary_light || "#dbeafe",
      secondary: theme?.secondary_color || "#8b5cf6",
      secondaryHover: theme?.secondary_hover || "#7c3aed",
      secondaryLight: theme?.secondary_light || "#ede9fe",
      tertiary: theme?.tertiary_color || "#06b6d4",
      tertiaryHover: theme?.tertiary_hover || "#0891b2",
      danger: theme?.danger_color || "#ef4444",
    }),
    [theme]
  );

  const buttonStyle = theme?.button_style || "modern";
  const btnClasses = useMemo(
    () => getThemeButtonClasses(buttonStyle, themeColors, isDark),
    [buttonStyle, themeColors, isDark]
  );
  const btnPrimary = btnClasses.primary;
  const btnSecondary = btnClasses.secondary;

  const todayIso = useMemo(() => new Date().toISOString().slice(0, 10), []);
  const currentMonthIso = useMemo(() => new Date().toISOString().slice(0, 7), []);

  // Shared Data State
  const [overview, setOverview] = useState(null);
  const [employees, setEmployees] = useState([]);
  const [systemUsers, setSystemUsers] = useState([]);
  const [treasuryAccounts, setTreasuryAccounts] = useState([]);
  const [loading, setLoading] = useState(false);

  // Tab 1: Directory Filters & Employee Modal
  const [empSearch, setEmpSearch] = useState("");
  const [empDeptFilter, setEmpDeptFilter] = useState("all");
  const [empStatusFilter, setEmpStatusFilter] = useState("all");
  const [employeeModalOpen, setEmployeeModalOpen] = useState(false);
  const [editingEmployee, setEditingEmployee] = useState(null);
  const [savingEmployee, setSavingEmployee] = useState(false);
  const [empForm, setEmpForm] = useState({
    employee_code: "",
    user_id: "",
    name: "",
    phone: "",
    email: "",
    cnic: "",
    address: "",
    department: "Sales & Counter",
    designation: "Sales Associate",
    employment_type: "full_time",
    joining_date: todayIso,
    shift_name: "Morning Shift",
    shift_start: "09:00",
    shift_end: "18:00",
    working_days_per_month: "26",
    basic_salary: "0",
    default_allowances: "0",
    hourly_overtime_rate: "0",
    commission_type: "none",
    commission_rate: "0",
    monthly_sales_target: "0",
    target_bonus_amount: "0",
    payment_method: "cash",
    bank_name: "",
    bank_account_number: "",
    status: "active",
    notes: "",
  });

  // Tab 2: Attendance Sheet State
  const [attendanceDate, setAttendanceDate] = useState(todayIso);
  const [attendanceSheet, setAttendanceSheet] = useState([]);
  const [loadingAttendance, setLoadingAttendance] = useState(false);
  const [savingAttendance, setSavingAttendance] = useState(false);

  // Tab 3: Payroll & Advances State
  const [selectedPayrollMonth, setSelectedPayrollMonth] = useState(currentMonthIso);
  const [autoDeductAdvances, setAutoDeductAdvances] = useState(true);
  const [payrollRuns, setPayrollRuns] = useState([]);
  const [activeRunId, setActiveRunId] = useState(null);
  const [generatingPayroll, setGeneratingPayroll] = useState(false);
  const [advances, setAdvances] = useState([]);
  const [advanceModalOpen, setAdvanceModalOpen] = useState(false);
  const [savingAdvance, setSavingAdvance] = useState(false);
  const [advanceForm, setAdvanceForm] = useState({
    employee_id: "",
    type: "advance",
    amount: "",
    date: todayIso,
    payment_method: "cash",
    account_id: "",
    reference_number: "",
    description: "",
  });

  // Edit Payslip & Pay Payslip & Print Payslip Modals
  const [editingPayslip, setEditingPayslip] = useState(null);
  const [payslipForm, setPayslipForm] = useState({
    basic_salary: "0",
    allowances: "0",
    overtime_pay: "0",
    sales_commission: "0",
    target_bonus: "0",
    other_bonus: "0",
    absence_deduction: "0",
    late_or_fine_deduction: "0",
    advance_deduction: "0",
    other_deduction: "0",
    notes: "",
  });
  const [savingPayslip, setSavingPayslip] = useState(false);

  const [payingPayslip, setPayingPayslip] = useState(null);
  const [payAllRunModal, setPayAllRunModal] = useState(null);
  const [payForm, setPayForm] = useState({
    payment_method: "cash",
    account_id: "",
    date: todayIso,
  });
  const [processingPayment, setProcessingPayment] = useState(false);
  const [printingPayslip, setPrintingPayslip] = useState(null);

  // Tab 4: Sales Commissions State
  const [commFrom, setCommFrom] = useState(() => `${currentMonthIso}-01`);
  const [commTo, setCommTo] = useState(todayIso);
  const [commReport, setCommReport] = useState({
    summary: {
      total_invoices: 0,
      total_gross_sales: 0,
      total_net_sales: 0,
      total_gross_profit: 0,
      total_commissions: 0,
      total_target_bonuses: 0,
      total_incentives: 0,
    },
    rows: [],
  });
  const [loadingCommissions, setLoadingCommissions] = useState(false);

  const fmtCurrency = (val) =>
    Number(val || 0).toLocaleString(undefined, {
      minimumFractionDigits: 2,
      maximumFractionDigits: 2,
    });

  // Fetch core data
  const fetchCoreData = useCallback(async () => {
    setLoading(true);
    try {
      const [ovRes, empRes, usrRes, accRes] = await Promise.all([
        axios.get("/api/hr/overview", {
          params: { month: selectedPayrollMonth, attendance_date: attendanceDate },
        }),
        axios.get("/api/hr/employees"),
        axios.get("/api/users", { params: { per_page: 200 } }).catch(() => ({ data: [] })),
        axios.get("/api/accounts").catch(() => ({ data: [] })),
      ]);

      setOverview(ovRes.data);
      setEmployees(Array.isArray(empRes.data) ? empRes.data : []);
      const uList = Array.isArray(usrRes.data)
        ? usrRes.data
        : Array.isArray(usrRes.data?.data)
        ? usrRes.data.data
        : [];
      setSystemUsers(uList);
      setTreasuryAccounts(
        Array.isArray(accRes.data)
          ? accRes.data
          : Array.isArray(accRes.data?.accounts)
          ? accRes.data.accounts
          : []
      );
    } catch (err) {
      console.error(err);
      toast.error("Failed to load HR & Payroll data.");
    } finally {
      setLoading(false);
    }
  }, [selectedPayrollMonth, attendanceDate]);

  const fetchAttendanceSheet = useCallback(async (dateToLoad) => {
    setLoadingAttendance(true);
    try {
      const { data } = await axios.get("/api/hr/attendance", {
        params: { date: dateToLoad },
      });
      setAttendanceSheet(Array.isArray(data?.sheet) ? data.sheet : []);
    } catch {
      toast.error("Failed to load daily attendance sheet.");
    } finally {
      setLoadingAttendance(false);
    }
  }, []);

  const fetchPayrollAndAdvances = useCallback(async () => {
    try {
      const [runsRes, advRes] = await Promise.all([
        axios.get("/api/hr/payroll-runs"),
        axios.get("/api/hr/advances"),
      ]);
      const runs = Array.isArray(runsRes.data) ? runsRes.data : [];
      setPayrollRuns(runs);
      setAdvances(Array.isArray(advRes.data) ? advRes.data : []);
      if (runs.length > 0 && !activeRunId) {
        setActiveRunId(runs[0].id);
      }
    } catch {
      /* ignore */
    }
  }, [activeRunId]);

  const fetchCommissions = useCallback(async () => {
    setLoadingCommissions(true);
    try {
      const { data } = await axios.get("/api/hr/commissions", {
        params: { from: commFrom, to: commTo },
      });
      if (data) setCommReport(data);
    } catch {
      toast.error("Failed to load sales commission report.");
    } finally {
      setLoadingCommissions(false);
    }
  }, [commFrom, commTo]);

  useEffect(() => {
    fetchCoreData();
  }, [fetchCoreData]);

  useEffect(() => {
    if (activeTab !== "attendance") return;
    fetchAttendanceSheet(attendanceDate);
  }, [activeTab, attendanceDate, fetchAttendanceSheet]);

  useEffect(() => {
    if (activeTab !== "payroll") return;
    fetchPayrollAndAdvances();
  }, [activeTab, fetchPayrollAndAdvances]);

  useEffect(() => {
    if (activeTab !== "commissions") return;
    fetchCommissions();
  }, [activeTab, fetchCommissions]);

  // Filtered employees for Tab 1
  const filteredEmployees = useMemo(() => {
    const q = empSearch.trim().toLowerCase();
    return employees.filter((e) => {
      if (empDeptFilter !== "all" && e.department !== empDeptFilter) return false;
      if (empStatusFilter !== "all" && e.status !== empStatusFilter) return false;
      if (
        q &&
        !String(e.name || "").toLowerCase().includes(q) &&
        !String(e.employee_code || "").toLowerCase().includes(q) &&
        !String(e.phone || "").toLowerCase().includes(q) &&
        !String(e.designation || "").toLowerCase().includes(q)
      ) {
        return false;
      }
      return true;
    });
  }, [employees, empSearch, empDeptFilter, empStatusFilter]);

  // Open Add Employee Modal
  const handleOpenAddEmployee = async () => {
    let nextCode = "EMP-0001";
    try {
      const { data } = await axios.get("/api/hr/employees/new-code");
      if (data?.employee_code) nextCode = data.employee_code;
    } catch {
      /* ignore */
    }
    setEditingEmployee(null);
    setEmpForm({
      employee_code: nextCode,
      user_id: "",
      name: "",
      phone: "",
      email: "",
      cnic: "",
      address: "",
      department: "Sales & Counter",
      designation: "Sales Associate",
      employment_type: "full_time",
      joining_date: todayIso,
      shift_name: "Morning Shift",
      shift_start: "09:00",
      shift_end: "18:00",
      working_days_per_month: "26",
      basic_salary: "0",
      default_allowances: "0",
      hourly_overtime_rate: "0",
      commission_type: "none",
      commission_rate: "0",
      monthly_sales_target: "0",
      target_bonus_amount: "0",
      payment_method: "cash",
      bank_name: "",
      bank_account_number: "",
      status: "active",
      notes: "",
    });
    setEmployeeModalOpen(true);
  };

  // Open Edit Employee Modal
  const handleOpenEditEmployee = (emp) => {
    setEditingEmployee(emp);
    setEmpForm({
      employee_code: emp.employee_code || "",
      user_id: emp.user_id ? String(emp.user_id) : "",
      name: emp.name || "",
      phone: emp.phone || "",
      email: emp.email || "",
      cnic: emp.cnic || "",
      address: emp.address || "",
      department: emp.department || "Sales & Counter",
      designation: emp.designation || "Sales Associate",
      employment_type: emp.employment_type || "full_time",
      joining_date: (emp.joining_date || todayIso).slice(0, 10),
      shift_name: emp.shift_name || "Morning Shift",
      shift_start: emp.shift_start || "09:00",
      shift_end: emp.shift_end || "18:00",
      working_days_per_month: String(emp.working_days_per_month ?? 26),
      basic_salary: String(emp.basic_salary ?? 0),
      default_allowances: String(emp.default_allowances ?? 0),
      hourly_overtime_rate: String(emp.hourly_overtime_rate ?? 0),
      commission_type: emp.commission_type || "none",
      commission_rate: String(emp.commission_rate ?? 0),
      monthly_sales_target: String(emp.monthly_sales_target ?? 0),
      target_bonus_amount: String(emp.target_bonus_amount ?? 0),
      payment_method: emp.payment_method || "cash",
      bank_name: emp.bank_name || "",
      bank_account_number: emp.bank_account_number || "",
      status: emp.status || "active",
      notes: emp.notes || "",
    });
    setEmployeeModalOpen(true);
  };

  // Save Employee
  const handleSaveEmployee = async (e) => {
    e.preventDefault();
    if (!empForm.name.trim()) {
      toast.error("Employee name is required.");
      return;
    }
    setSavingEmployee(true);
    try {
      const payload = {
        ...empForm,
        user_id: empForm.user_id ? Number(empForm.user_id) : null,
        working_days_per_month: Number(empForm.working_days_per_month || 26),
        basic_salary: Number(empForm.basic_salary || 0),
        default_allowances: Number(empForm.default_allowances || 0),
        hourly_overtime_rate: Number(empForm.hourly_overtime_rate || 0),
        commission_rate: Number(empForm.commission_rate || 0),
        monthly_sales_target: Number(empForm.monthly_sales_target || 0),
        target_bonus_amount: Number(empForm.target_bonus_amount || 0),
      };

      if (editingEmployee) {
        await axios.put(`/api/hr/employees/${editingEmployee.id}`, payload);
        toast.success(`Updated employee ${empForm.name}`);
      } else {
        await axios.post("/api/hr/employees", payload);
        toast.success(`Added employee ${empForm.name}`);
      }
      setEmployeeModalOpen(false);
      await Promise.all([
        fetchCoreData(),
        fetchAttendanceSheet(attendanceDate),
        fetchCommissions(),
      ]);
    } catch (err) {
      const msg =
        err?.response?.data?.errors?.employee_code?.[0] ||
        err?.response?.data?.errors?.name?.[0] ||
        err?.response?.data?.message ||
        "Failed to save employee.";
      toast.error(msg);
    } finally {
      setSavingEmployee(false);
    }
  };

  // Delete Employee
  const handleDeleteEmployee = async (emp) => {
    if (!window.confirm(`Delete employee "${emp.name}" (${emp.employee_code})?`)) return;
    try {
      await axios.delete(`/api/hr/employees/${emp.id}`);
      toast.success(`Deleted ${emp.name}`);
      await Promise.all([fetchCoreData(), fetchAttendanceSheet(attendanceDate)]);
    } catch (err) {
      const msg =
        err?.response?.data?.errors?.employee?.[0] ||
        err?.response?.data?.message ||
        "Cannot delete employee.";
      toast.error(msg);
    }
  };

  // Attendance Sheet Handlers
  const updateAttendanceRow = (employeeId, field, value) => {
    setAttendanceSheet((prev) =>
      prev.map((row) =>
        Number(row.employee_id) === Number(employeeId) ? { ...row, [field]: value } : row
      )
    );
  };

  const handleMarkAllPresent = () => {
    setAttendanceSheet((prev) =>
      prev.map((row) => ({
        ...row,
        status: "present",
        late_minutes: 0,
        fine_amount: 0,
      }))
    );
    toast.success("Marked all staff as Present — click Save Sheet to persist.");
  };

  const handleSaveBulkAttendance = async () => {
    if (attendanceSheet.length === 0) {
      toast.error("No active employees to save attendance for.");
      return;
    }
    setSavingAttendance(true);
    try {
      await axios.post("/api/hr/attendance/bulk", {
        date: attendanceDate,
        entries: attendanceSheet.map((r) => ({
          employee_id: r.employee_id,
          status: r.status,
          check_in: r.check_in || null,
          check_out: r.check_out || null,
          late_minutes: Number(r.late_minutes || 0),
          overtime_hours: Number(r.overtime_hours || 0),
          fine_amount: Number(r.fine_amount || 0),
          notes: r.notes || null,
        })),
      });
      toast.success(`Saved attendance sheet for ${attendanceDate}`);
      await Promise.all([fetchAttendanceSheet(attendanceDate), fetchCoreData()]);
    } catch (err) {
      toast.error(err?.response?.data?.message || "Failed to save attendance sheet.");
    } finally {
      setSavingAttendance(false);
    }
  };

  // Staff Advance / Repayment Modal Handlers
  const handleOpenAdvanceModal = (preselectedEmp = null, type = "advance") => {
    const defAcc = treasuryAccounts[0]?.id ? String(treasuryAccounts[0].id) : "";
    setAdvanceForm({
      employee_id: preselectedEmp ? String(preselectedEmp.id) : employees[0]?.id ? String(employees[0].id) : "",
      type,
      amount: "",
      date: todayIso,
      payment_method: "cash",
      account_id: defAcc,
      reference_number: "",
      description: "",
    });
    setAdvanceModalOpen(true);
  };

  const handleSaveAdvance = async (e) => {
    e.preventDefault();
    if (!advanceForm.employee_id || !advanceForm.amount || Number(advanceForm.amount) <= 0) {
      toast.error("Please select an employee and enter a valid amount.");
      return;
    }
    setSavingAdvance(true);
    try {
      await axios.post("/api/hr/advances", {
        ...advanceForm,
        employee_id: Number(advanceForm.employee_id),
        amount: Number(advanceForm.amount),
        account_id: advanceForm.account_id ? Number(advanceForm.account_id) : null,
      });
      toast.success(
        advanceForm.type === "advance"
          ? "Staff salary advance disbursed & recorded in Treasury"
          : "Staff advance repayment recorded"
      );
      setAdvanceModalOpen(false);
      await Promise.all([fetchCoreData(), fetchPayrollAndAdvances()]);
    } catch (err) {
      const msg =
        err?.response?.data?.errors?.amount?.[0] ||
        err?.response?.data?.message ||
        "Failed to record advance transaction.";
      toast.error(msg);
    } finally {
      setSavingAdvance(false);
    }
  };

  // Generate / Refresh Monthly Payroll
  const handleGeneratePayroll = async () => {
    setGeneratingPayroll(true);
    try {
      const { data } = await axios.post("/api/hr/payroll-runs/generate", {
        period_month: selectedPayrollMonth,
        auto_deduct_advances: autoDeductAdvances,
      });
      toast.success(`Generated / refreshed payroll for ${selectedPayrollMonth}`);
      await Promise.all([fetchPayrollAndAdvances(), fetchCoreData()]);
      if (data?.id) {
        setActiveRunId(data.id);
      }
    } catch (err) {
      toast.error(
        err?.response?.data?.errors?.period_month?.[0] ||
          err?.response?.data?.message ||
          "Failed to generate payroll."
      );
    } finally {
      setGeneratingPayroll(false);
    }
  };

  const activePayrollRun = useMemo(() => {
    if (activeRunId) {
      const found = payrollRuns.find((r) => Number(r.id) === Number(activeRunId));
      if (found) return found;
    }
    return payrollRuns.find((r) => r.period_month === selectedPayrollMonth) || payrollRuns[0] || null;
  }, [payrollRuns, activeRunId, selectedPayrollMonth]);

  // Edit Payslip Modal
  const handleOpenEditPayslip = (item) => {
    setEditingPayslip(item);
    setPayslipForm({
      basic_salary: String(item.basic_salary ?? 0),
      allowances: String(item.allowances ?? 0),
      overtime_pay: String(item.overtime_pay ?? 0),
      sales_commission: String(item.sales_commission ?? 0),
      target_bonus: String(item.target_bonus ?? 0),
      other_bonus: String(item.other_bonus ?? 0),
      absence_deduction: String(item.absence_deduction ?? 0),
      late_or_fine_deduction: String(item.late_or_fine_deduction ?? 0),
      advance_deduction: String(item.advance_deduction ?? 0),
      other_deduction: String(item.other_deduction ?? 0),
      notes: item.notes || "",
    });
  };

  const handleSavePayslipEdit = async (e) => {
    e.preventDefault();
    if (!editingPayslip) return;
    setSavingPayslip(true);
    try {
      await axios.put(`/api/hr/payroll-items/${editingPayslip.id}`, {
        basic_salary: Number(payslipForm.basic_salary || 0),
        allowances: Number(payslipForm.allowances || 0),
        overtime_pay: Number(payslipForm.overtime_pay || 0),
        sales_commission: Number(payslipForm.sales_commission || 0),
        target_bonus: Number(payslipForm.target_bonus || 0),
        other_bonus: Number(payslipForm.other_bonus || 0),
        absence_deduction: Number(payslipForm.absence_deduction || 0),
        late_or_fine_deduction: Number(payslipForm.late_or_fine_deduction || 0),
        advance_deduction: Number(payslipForm.advance_deduction || 0),
        other_deduction: Number(payslipForm.other_deduction || 0),
        notes: payslipForm.notes,
      });
      toast.success(`Updated payslip for ${editingPayslip.employee?.name}`);
      setEditingPayslip(null);
      await Promise.all([fetchPayrollAndAdvances(), fetchCoreData()]);
    } catch (err) {
      const msg =
        err?.response?.data?.errors?.advance_deduction?.[0] ||
        err?.response?.data?.message ||
        "Failed to update payslip.";
      toast.error(msg);
    } finally {
      setSavingPayslip(false);
    }
  };

  // Pay Single Payslip
  const handleConfirmPayPayslip = async (e) => {
    e.preventDefault();
    if (!payingPayslip) return;
    setProcessingPayment(true);
    try {
      await axios.post(`/api/hr/payroll-items/${payingPayslip.id}/pay`, {
        payment_method: payForm.payment_method,
        account_id: payForm.account_id ? Number(payForm.account_id) : null,
        date: payForm.date || todayIso,
      });
      toast.success(`Paid payslip for ${payingPayslip.employee?.name} & recorded Operating Expense!`);
      setPayingPayslip(null);
      await Promise.all([fetchPayrollAndAdvances(), fetchCoreData()]);
    } catch (err) {
      toast.error(err?.response?.data?.message || "Failed to disburse payslip.");
    } finally {
      setProcessingPayment(false);
    }
  };

  // Pay All Unpaid in Run
  const handleConfirmPayAllRun = async (e) => {
    e.preventDefault();
    if (!payAllRunModal) return;
    setProcessingPayment(true);
    try {
      await axios.post(`/api/hr/payroll-runs/${payAllRunModal.id}/pay-all`, {
        payment_method: payForm.payment_method,
        account_id: payForm.account_id ? Number(payForm.account_id) : null,
        date: payForm.date || todayIso,
      });
      toast.success(`Disbursed all unpaid payslips for ${payAllRunModal.period_month}!`);
      setPayAllRunModal(null);
      await Promise.all([fetchPayrollAndAdvances(), fetchCoreData()]);
    } catch (err) {
      toast.error(err?.response?.data?.message || "Failed to disburse payroll run.");
    } finally {
      setProcessingPayment(false);
    }
  };

  return (
    <div
      className={`p-3 md:p-5 min-h-screen space-y-4 ${
        isDark ? "bg-slate-900 text-slate-100" : "bg-slate-50 text-slate-800"
      }`}
    >
      {/* Top Header */}
      <div className="flex flex-col lg:flex-row lg:items-center justify-between gap-3 bg-white dark:bg-slate-800/90 border border-slate-200/80 dark:border-slate-700/80 rounded-2xl p-4 shadow-xs">
        <div className="flex items-center gap-3">
          <div className="p-2.5 rounded-xl bg-indigo-500/10 text-indigo-600 dark:text-indigo-400 border border-indigo-500/20">
            <UserGroupIcon className="w-6 h-6" />
          </div>
          <div>
            <div className="flex items-center gap-2 flex-wrap">
              <h1 className="text-lg md:text-xl font-bold tracking-tight">
                HR, Attendance, Payroll & Sales Commissions
              </h1>
              <span className="px-2.5 py-0.5 rounded-full text-[11px] font-bold bg-indigo-500/15 text-indigo-700 dark:text-indigo-300 border border-indigo-500/30">
                ERP Module 3.6
              </span>
            </div>
            <p className="text-xs text-slate-500 dark:text-slate-400">
              Manage staff profiles, shift schedules, daily attendance, salary advances ("Kharcha"), automated salesman/cashier commissions, and monthly payslips.
            </p>
          </div>
        </div>

        <div className="flex items-center flex-wrap gap-2">
          <button
            type="button"
            onClick={() => handleOpenAdvanceModal(null, "advance")}
            className={`inline-flex items-center gap-1.5 px-3 py-2 text-xs font-semibold rounded-xl theme-btn-secondary cursor-pointer ${btnSecondary.className}`}
            style={btnSecondary.style}
          >
            <BanknotesIcon className="w-4 h-4 text-amber-500" />
            <span>Disburse Staff Advance</span>
          </button>

          <button
            type="button"
            onClick={handleOpenAddEmployee}
            className={`inline-flex items-center gap-1.5 px-3.5 py-2 text-xs font-bold rounded-xl theme-btn-primary cursor-pointer ${btnPrimary.className}`}
            style={btnPrimary.style}
          >
            <PlusIcon className="w-4 h-4" />
            <span>Add Employee</span>
          </button>
        </div>
      </div>

      {/* Top Executive KPI Cards */}
      <div className="grid grid-cols-2 sm:grid-cols-3 xl:grid-cols-5 gap-3">
        <div className="bg-white dark:bg-slate-800/90 border border-slate-200/80 dark:border-slate-700/80 rounded-2xl p-3.5 shadow-xs min-w-0">
          <span className="text-[11px] font-bold uppercase tracking-wider text-slate-400 block truncate">
            Active Staff
          </span>
          <div className="flex items-baseline justify-between gap-1 mt-1">
            <span className="text-lg sm:text-2xl font-bold font-mono text-slate-900 dark:text-white truncate">
              {overview?.active_employees ?? employees.filter((e) => e.status === "active").length}
            </span>
            <span className="text-xs text-slate-500 shrink-0">
              Total: {overview?.total_employees ?? employees.length}
            </span>
          </div>
          <p className="text-[11px] text-slate-500 dark:text-slate-400 mt-1 truncate">
            On Leave: {overview?.on_leave_employees ?? 0}
          </p>
        </div>

        <div className="bg-white dark:bg-slate-800/90 border border-slate-200/80 dark:border-slate-700/80 rounded-2xl p-3.5 shadow-xs min-w-0">
          <span className="text-[11px] font-bold uppercase tracking-wider text-emerald-600 dark:text-emerald-400 block truncate">
            Attendance ({attendanceDate})
          </span>
          <div className="flex flex-wrap items-baseline gap-2 sm:gap-3 mt-1 font-mono">
            <span className="text-base sm:text-lg font-bold text-emerald-600 dark:text-emerald-400">
              P: {overview?.today_attendance?.present ?? 0}
            </span>
            <span className="text-xs sm:text-sm font-bold text-amber-600 dark:text-amber-400">
              L: {overview?.today_attendance?.late ?? 0}
            </span>
            <span className="text-xs sm:text-sm font-bold text-rose-600 dark:text-rose-400">
              A: {overview?.today_attendance?.absent ?? 0}
            </span>
          </div>
          <p className="text-[11px] text-slate-500 dark:text-slate-400 mt-1 truncate">
            Unmarked: {overview?.today_attendance?.unmarked ?? 0}
          </p>
        </div>

        <div className="bg-white dark:bg-slate-800/90 border border-slate-200/80 dark:border-slate-700/80 rounded-2xl p-3.5 shadow-xs min-w-0">
          <span className="text-[11px] font-bold uppercase tracking-wider text-blue-600 dark:text-blue-400 block truncate">
            Fixed Monthly Salary Pool
          </span>
          <div className="text-base sm:text-xl font-bold font-mono text-slate-900 dark:text-white mt-1 truncate">
            {fmtCurrency(overview?.monthly_fixed_payroll_pool ?? 0)}
          </div>
          <p className="text-[11px] text-slate-500 dark:text-slate-400 mt-1 truncate">
            Base Salaries + Fixed Allowances
          </p>
        </div>

        <div className="bg-white dark:bg-slate-800/90 border border-slate-200/80 dark:border-slate-700/80 rounded-2xl p-3.5 shadow-xs min-w-0">
          <span className="text-[11px] font-bold uppercase tracking-wider text-purple-600 dark:text-purple-400 block truncate">
            Sales Commissions ({selectedPayrollMonth})
          </span>
          <div className="text-base sm:text-xl font-bold font-mono text-purple-600 dark:text-purple-400 mt-1 truncate">
            {fmtCurrency(overview?.monthly_commissions_total ?? 0)}
          </div>
          <p className="text-[11px] text-slate-500 dark:text-slate-400 mt-1 truncate">
            Attributed Net Sales: {fmtCurrency(overview?.monthly_net_sales_attributed ?? 0)}
          </p>
        </div>

        <div className="bg-white dark:bg-slate-800/90 border border-slate-200/80 dark:border-slate-700/80 rounded-2xl p-3.5 shadow-xs min-w-0 col-span-2 sm:col-span-1">
          <span className="text-[11px] font-bold uppercase tracking-wider text-amber-600 dark:text-amber-400 block truncate">
            Outstanding Staff Advances
          </span>
          <div className="text-base sm:text-xl font-bold font-mono text-amber-600 dark:text-amber-400 mt-1 truncate">
            {fmtCurrency(overview?.total_outstanding_advances ?? 0)}
          </div>
          <p className="text-[11px] text-slate-500 dark:text-slate-400 mt-1 truncate">
            Recoverable from monthly payroll
          </p>
        </div>
      </div>

      {/* Navigation Tabs */}
      <div className="flex items-center gap-2 overflow-x-auto pb-1">
        {[
          {
            key: "directory",
            label: "1. Employee Directory & Shifts",
            icon: UserGroupIcon,
            badge: employees.length,
          },
          {
            key: "attendance",
            label: "2. Daily Attendance & Overtime",
            icon: ClockIcon,
            badge: attendanceDate,
          },
          {
            key: "payroll",
            label: "3. Monthly Payroll, Advances & Payslips",
            icon: BanknotesIcon,
            badge: selectedPayrollMonth,
          },
          {
            key: "commissions",
            label: "4. Salesman & Cashier Commissions",
            icon: TrophyIcon,
            badge: fmtCurrency(commReport?.summary?.total_incentives || 0),
          },
        ].map((tab) => {
          const Icon = tab.icon;
          const isActive = activeTab === tab.key;
          return (
            <button
              key={tab.key}
              type="button"
              onClick={() => switchTab(tab.key)}
              className={`inline-flex items-center gap-2 px-4 py-2.5 rounded-xl text-xs font-bold whitespace-nowrap transition-all cursor-pointer border ${
                isActive
                  ? "bg-blue-600 text-white border-blue-600 shadow-sm"
                  : "bg-white dark:bg-slate-800 text-slate-700 dark:text-slate-200 border-slate-200 dark:border-slate-700 hover:bg-slate-100 dark:hover:bg-slate-700"
              }`}
            >
              <Icon className="w-4 h-4" />
              <span>{tab.label}</span>
              <span
                className={`px-1.5 py-0.5 rounded-full text-[10px] font-mono ${
                  isActive
                    ? "bg-white/20 text-white"
                    : "bg-slate-100 dark:bg-slate-700 text-slate-600 dark:text-slate-300"
                }`}
              >
                {tab.badge}
              </span>
            </button>
          );
        })}
      </div>

      {/* TAB 1: EMPLOYEE DIRECTORY & SHIFTS */}
      {activeTab === "directory" && (
        <div className="bg-white dark:bg-slate-800/90 border border-slate-200/80 dark:border-slate-700/80 rounded-2xl p-4 shadow-xs space-y-4">
          <div className="flex flex-col md:flex-row md:items-center justify-between gap-3">
            <div className="flex flex-wrap items-center gap-2">
              <input
                type="text"
                placeholder="Search by name, code, phone, or designation..."
                value={empSearch}
                onChange={(e) => setEmpSearch(e.target.value)}
                className="h-9 px-3 rounded-xl border border-slate-300 dark:border-slate-600 bg-slate-50 dark:bg-slate-900 text-xs w-full sm:w-64"
              />
              <select
                value={empDeptFilter}
                onChange={(e) => setEmpDeptFilter(e.target.value)}
                className="h-9 px-3 rounded-xl border border-slate-300 dark:border-slate-600 bg-slate-50 dark:bg-slate-900 text-xs"
              >
                <option value="all">All Departments</option>
                {DEPARTMENTS.map((d) => (
                  <option key={d} value={d}>
                    {d}
                  </option>
                ))}
              </select>
              <select
                value={empStatusFilter}
                onChange={(e) => setEmpStatusFilter(e.target.value)}
                className="h-9 px-3 rounded-xl border border-slate-300 dark:border-slate-600 bg-slate-50 dark:bg-slate-900 text-xs"
              >
                <option value="all">All Statuses</option>
                <option value="active">Active</option>
                <option value="on_leave">On Leave</option>
                <option value="inactive">Inactive</option>
              </select>
            </div>

            <button
              type="button"
              onClick={handleOpenAddEmployee}
              className={`inline-flex items-center gap-1.5 px-3.5 py-2 text-xs font-bold rounded-xl theme-btn-primary cursor-pointer ${btnPrimary.className}`}
              style={btnPrimary.style}
            >
              <PlusIcon className="w-4 h-4" />
              <span>New Employee</span>
            </button>
          </div>

          <div className="overflow-x-auto rounded-xl border border-slate-200 dark:border-slate-700">
            <table className="w-full text-xs text-left">
              <thead className="bg-slate-50 dark:bg-slate-900/80 text-slate-500 dark:text-slate-400 uppercase text-[10px] tracking-wider border-b border-slate-200 dark:border-slate-700">
                <tr>
                  <th className="py-2.5 px-3">Employee</th>
                  <th className="py-2.5 px-3">Dept & Designation</th>
                  <th className="py-2.5 px-3">Shift & Days</th>
                  <th className="py-2.5 px-3 text-right">Basic + Allow.</th>
                  <th className="py-2.5 px-3">Commission Rule & Target</th>
                  <th className="py-2.5 px-3 text-right">Advance Bal.</th>
                  <th className="py-2.5 px-3 text-center">Status</th>
                  <th className="py-2.5 px-3 text-right">Actions</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100 dark:divide-slate-700/60">
                {filteredEmployees.length === 0 ? (
                  <tr>
                    <td colSpan={8} className="py-8 text-center text-slate-400">
                      No employees found. Click "+ Add Employee" to create your first staff record.
                    </td>
                  </tr>
                ) : (
                  filteredEmployees.map((emp) => (
                    <tr
                      key={emp.id}
                      className="hover:bg-slate-50/80 dark:hover:bg-slate-700/30 transition-colors"
                    >
                      <td className="py-2.5 px-3">
                        <div className="font-bold text-slate-900 dark:text-white flex items-center gap-1.5">
                          <span>{emp.name}</span>
                          <span className="font-mono text-[10px] px-1.5 py-0.5 rounded bg-slate-100 dark:bg-slate-700 text-slate-600 dark:text-slate-300">
                            {emp.employee_code}
                          </span>
                        </div>
                        <div className="text-[11px] text-slate-500 dark:text-slate-400 flex items-center gap-2 mt-0.5">
                          {emp.phone && <span>{emp.phone}</span>}
                          {emp.user && (
                            <span className="px-1.5 py-0.5 rounded bg-blue-500/10 text-blue-600 dark:text-blue-400 text-[10px] font-semibold">
                              Login: {emp.user.name}
                            </span>
                          )}
                        </div>
                      </td>
                      <td className="py-2.5 px-3">
                        <div className="font-semibold text-slate-800 dark:text-slate-200">
                          {emp.designation}
                        </div>
                        <div className="text-[11px] text-slate-500">{emp.department}</div>
                      </td>
                      <td className="py-2.5 px-3">
                        <div className="font-medium">{emp.shift_name}</div>
                        <div className="text-[11px] font-mono text-slate-500">
                          {emp.shift_start}–{emp.shift_end} ({emp.working_days_per_month}d/mo)
                        </div>
                      </td>
                      <td className="py-2.5 px-3 text-right font-mono">
                        <div className="font-bold text-slate-900 dark:text-white">
                          {fmtCurrency(Number(emp.basic_salary || 0) + Number(emp.default_allowances || 0))}
                        </div>
                        <div className="text-[10px] text-slate-500">
                          Basic: {fmtCurrency(emp.basic_salary)} | OT: {fmtCurrency(emp.hourly_overtime_rate)}/h
                        </div>
                      </td>
                      <td className="py-2.5 px-3">
                        {emp.commission_type === "none" ? (
                          <span className="text-slate-400">None</span>
                        ) : (
                          <div>
                            <span className="px-2 py-0.5 rounded-full text-[10px] font-bold bg-purple-500/15 text-purple-700 dark:text-purple-300 border border-purple-500/30">
                              {emp.commission_type === "net_sales_percent"
                                ? `${emp.commission_rate}% Net Sales`
                                : emp.commission_type === "gross_profit_percent"
                                ? `${emp.commission_rate}% Gross Profit`
                                : `${fmtCurrency(emp.commission_rate)} / Invoice`}
                            </span>
                            {Number(emp.monthly_sales_target) > 0 && (
                              <div className="text-[10px] text-slate-500 mt-0.5 font-mono">
                                Target: {fmtCurrency(emp.monthly_sales_target)} (+{fmtCurrency(emp.target_bonus_amount)})
                              </div>
                            )}
                          </div>
                        )}
                      </td>
                      <td className="py-2.5 px-3 text-right font-mono">
                        <span
                          className={`font-bold ${
                            Number(emp.advance_balance) > 0
                              ? "text-amber-600 dark:text-amber-400"
                              : "text-slate-400"
                          }`}
                        >
                          {fmtCurrency(emp.advance_balance)}
                        </span>
                      </td>
                      <td className="py-2.5 px-3 text-center">
                        <span
                          className={`px-2 py-0.5 rounded-full text-[10px] font-bold uppercase ${
                            emp.status === "active"
                              ? "bg-emerald-500/15 text-emerald-700 dark:text-emerald-300"
                              : emp.status === "on_leave"
                              ? "bg-amber-500/15 text-amber-700 dark:text-amber-300"
                              : "bg-slate-500/15 text-slate-600 dark:text-slate-400"
                          }`}
                        >
                          {emp.status}
                        </span>
                      </td>
                      <td className="py-2.5 px-3 text-right">
                        <div className="inline-flex items-center gap-1">
                          <button
                            type="button"
                            onClick={() => handleOpenAdvanceModal(emp, "advance")}
                            className="p-1.5 rounded-lg text-amber-600 hover:bg-amber-50 dark:hover:bg-amber-950/50 cursor-pointer"
                            title="Disburse Salary Advance"
                          >
                            <BanknotesIcon className="w-4 h-4" />
                          </button>
                          <button
                            type="button"
                            onClick={() => handleOpenEditEmployee(emp)}
                            className="p-1.5 rounded-lg text-blue-600 hover:bg-blue-50 dark:hover:bg-blue-950/50 cursor-pointer"
                            title="Edit Employee"
                          >
                            <PencilSquareIcon className="w-4 h-4" />
                          </button>
                          <button
                            type="button"
                            onClick={() => handleDeleteEmployee(emp)}
                            className="p-1.5 rounded-lg text-rose-600 hover:bg-rose-50 dark:hover:bg-rose-950/50 cursor-pointer"
                            title="Delete Employee"
                          >
                            <TrashIcon className="w-4 h-4" />
                          </button>
                        </div>
                      </td>
                    </tr>
                  ))
                )}
              </tbody>
            </table>
          </div>
        </div>
      )}

      {/* TAB 2: DAILY ATTENDANCE & OVERTIME SHEET */}
      {activeTab === "attendance" && (
        <div className="bg-white dark:bg-slate-800/90 border border-slate-200/80 dark:border-slate-700/80 rounded-2xl p-4 shadow-xs space-y-4">
          <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3">
            <div className="flex items-center gap-3 flex-wrap">
              <div>
                <label className="block text-[10px] font-bold uppercase text-slate-400 mb-0.5">
                  Attendance Date
                </label>
                <input
                  type="date"
                  value={attendanceDate}
                  onChange={(e) => setAttendanceDate(e.target.value)}
                  className="h-9 px-3 rounded-xl border border-slate-300 dark:border-slate-600 bg-slate-50 dark:bg-slate-900 text-xs font-mono font-bold"
                />
              </div>

              <button
                type="button"
                onClick={handleMarkAllPresent}
                className="mt-4 px-3 py-2 rounded-xl text-xs font-semibold bg-emerald-50 dark:bg-emerald-950/60 text-emerald-700 dark:text-emerald-300 border border-emerald-200 dark:border-emerald-800 hover:bg-emerald-100 cursor-pointer"
              >
                ✓ Mark All Present
              </button>
            </div>

            <button
              type="button"
              disabled={savingAttendance}
              onClick={handleSaveBulkAttendance}
              className={`inline-flex items-center gap-1.5 px-4 py-2 text-xs font-bold rounded-xl theme-btn-primary cursor-pointer disabled:opacity-50 ${btnPrimary.className}`}
              style={btnPrimary.style}
            >
              <CheckCircleIcon className="w-4 h-4" />
              <span>
                {savingAttendance ? "Saving Attendance..." : `Save Attendance Sheet (${attendanceDate})`}
              </span>
            </button>
          </div>

          {/* Mobile Attendance Card List (< md) */}
          <div className="md:hidden space-y-2.5">
            {loadingAttendance ? (
              <div className="py-8 text-center text-xs text-slate-400">
                Loading attendance sheet...
              </div>
            ) : attendanceSheet.length === 0 ? (
              <div className="py-8 text-center text-xs text-slate-400">
                No active employees found. Add employees in Tab 1 first.
              </div>
            ) : (
              attendanceSheet.map((row) => (
                <div
                  key={row.employee_id}
                  className="p-3 rounded-xl border border-slate-200 dark:border-slate-700 bg-slate-50/60 dark:bg-slate-900/50 space-y-2.5"
                >
                  <div className="flex items-start justify-between gap-2">
                    <div className="min-w-0">
                      <div className="font-bold text-xs text-slate-900 dark:text-white flex items-center gap-1.5 flex-wrap">
                        <span className="truncate">{row.employee_name}</span>
                        {row.is_marked && (
                          <span className="px-1.5 py-0.5 rounded-full text-[9px] font-bold bg-emerald-500/15 text-emerald-600">
                            Saved
                          </span>
                        )}
                      </div>
                      <div className="text-[10px] text-slate-500 truncate">
                        {row.designation} • {row.shift_name} ({row.shift_start}–{row.shift_end})
                      </div>
                    </div>
                  </div>

                  {/* 1-Click Status Pills */}
                  <div className="flex flex-wrap items-center gap-1.5">
                    {ATTENDANCE_STATUSES.map((st) => {
                      const active = row.status === st.value;
                      return (
                        <button
                          key={st.value}
                          type="button"
                          onClick={() => updateAttendanceRow(row.employee_id, "status", st.value)}
                          className={`px-2.5 py-1 rounded-lg text-[11px] font-bold border transition-all cursor-pointer ${
                            active
                              ? st.badge
                              : "bg-white dark:bg-slate-800 text-slate-600 dark:text-slate-400 border-slate-200 dark:border-slate-700"
                          }`}
                        >
                          {st.label}
                        </button>
                      );
                    })}
                  </div>

                  {/* Compact Expandable Row for Check-In / Out / OT / Fine */}
                  <details className="group pt-1 border-t border-slate-200/70 dark:border-slate-700/70">
                    <summary className="text-[11px] font-semibold text-blue-600 dark:text-blue-400 cursor-pointer select-none flex items-center justify-between">
                      <span>
                        Check-In / Out / OT / Fine
                        {(Number(row.late_minutes) > 0 ||
                          Number(row.overtime_hours) > 0 ||
                          Number(row.fine_amount) > 0) && (
                          <span className="ml-1.5 text-[10px] font-mono text-slate-500">
                            ({row.check_in || "—"}–{row.check_out || "—"} | OT:{row.overtime_hours}h)
                          </span>
                        )}
                      </span>
                      <span className="text-[10px] text-slate-400 group-open:rotate-180 transition-transform">
                        ▼
                      </span>
                    </summary>
                    <div className="grid grid-cols-2 gap-2 pt-2 text-[11px]">
                      <div>
                        <label className="block text-[10px] text-slate-500 mb-0.5">Check In</label>
                        <input
                          type="time"
                          value={row.check_in || ""}
                          onChange={(e) =>
                            updateAttendanceRow(row.employee_id, "check_in", e.target.value)
                          }
                          className="w-full h-8 px-2 rounded-lg border border-slate-300 dark:border-slate-600 bg-white dark:bg-slate-900 text-xs font-mono"
                        />
                      </div>
                      <div>
                        <label className="block text-[10px] text-slate-500 mb-0.5">Check Out</label>
                        <input
                          type="time"
                          value={row.check_out || ""}
                          onChange={(e) =>
                            updateAttendanceRow(row.employee_id, "check_out", e.target.value)
                          }
                          className="w-full h-8 px-2 rounded-lg border border-slate-300 dark:border-slate-600 bg-white dark:bg-slate-900 text-xs font-mono"
                        />
                      </div>
                      <div>
                        <label className="block text-[10px] text-slate-500 mb-0.5">Late (Mins)</label>
                        <input
                          type="number"
                          min="0"
                          value={row.late_minutes}
                          onChange={(e) =>
                            updateAttendanceRow(row.employee_id, "late_minutes", e.target.value)
                          }
                          className="w-full h-8 px-2 rounded-lg border border-slate-300 dark:border-slate-600 bg-white dark:bg-slate-900 text-xs font-mono"
                        />
                      </div>
                      <div>
                        <label className="block text-[10px] text-slate-500 mb-0.5">Overtime (Hrs)</label>
                        <input
                          type="number"
                          step="0.5"
                          min="0"
                          value={row.overtime_hours}
                          onChange={(e) =>
                            updateAttendanceRow(row.employee_id, "overtime_hours", e.target.value)
                          }
                          className="w-full h-8 px-2 rounded-lg border border-slate-300 dark:border-slate-600 bg-white dark:bg-slate-900 text-xs font-mono"
                        />
                      </div>
                      <div>
                        <label className="block text-[10px] text-slate-500 mb-0.5">Fine / Deduction</label>
                        <input
                          type="number"
                          step="any"
                          min="0"
                          value={row.fine_amount}
                          onChange={(e) =>
                            updateAttendanceRow(row.employee_id, "fine_amount", e.target.value)
                          }
                          className="w-full h-8 px-2 rounded-lg border border-slate-300 dark:border-slate-600 bg-white dark:bg-slate-900 text-xs font-mono"
                        />
                      </div>
                      <div>
                        <label className="block text-[10px] text-slate-500 mb-0.5">Notes</label>
                        <input
                          type="text"
                          placeholder="Remark..."
                          value={row.notes || ""}
                          onChange={(e) =>
                            updateAttendanceRow(row.employee_id, "notes", e.target.value)
                          }
                          className="w-full h-8 px-2 rounded-lg border border-slate-300 dark:border-slate-600 bg-white dark:bg-slate-900 text-xs"
                        />
                      </div>
                    </div>
                  </details>
                </div>
              ))
            )}
          </div>

          <div className="hidden md:block overflow-x-auto rounded-xl border border-slate-200 dark:border-slate-700">
            <table className="w-full text-xs text-left">
              <thead className="bg-slate-50 dark:bg-slate-900/80 text-slate-500 dark:text-slate-400 uppercase text-[10px] tracking-wider border-b border-slate-200 dark:border-slate-700">
                <tr>
                  <th className="py-2.5 px-3">Employee & Shift</th>
                  <th className="py-2.5 px-3">Status</th>
                  <th className="py-2.5 px-3">Check In</th>
                  <th className="py-2.5 px-3">Check Out</th>
                  <th className="py-2.5 px-3">Late (Mins)</th>
                  <th className="py-2.5 px-3">Overtime (Hrs)</th>
                  <th className="py-2.5 px-3">Fine / Deduction</th>
                  <th className="py-2.5 px-3">Notes</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100 dark:divide-slate-700/60">
                {loadingAttendance ? (
                  <tr>
                    <td colSpan={8} className="py-8 text-center text-slate-400">
                      Loading attendance sheet...
                    </td>
                  </tr>
                ) : attendanceSheet.length === 0 ? (
                  <tr>
                    <td colSpan={8} className="py-8 text-center text-slate-400">
                      No active employees found. Add employees in Tab 1 first.
                    </td>
                  </tr>
                ) : (
                  attendanceSheet.map((row) => (
                    <tr
                      key={row.employee_id}
                      className="hover:bg-slate-50/80 dark:hover:bg-slate-700/30"
                    >
                      <td className="py-2 px-3">
                        <div className="font-bold text-slate-900 dark:text-white flex items-center gap-1.5">
                          <span>{row.employee_name}</span>
                          {row.is_marked && (
                            <span className="px-1.5 py-0.5 rounded-full text-[9px] font-bold bg-emerald-500/15 text-emerald-600">
                              Saved
                            </span>
                          )}
                        </div>
                        <div className="text-[10px] text-slate-500">
                          {row.designation} • {row.shift_name} ({row.shift_start}–{row.shift_end})
                        </div>
                      </td>
                      <td className="py-2 px-3">
                        <select
                          value={row.status}
                          onChange={(e) =>
                            updateAttendanceRow(row.employee_id, "status", e.target.value)
                          }
                          className="h-8 px-2.5 rounded-lg border border-slate-300 dark:border-slate-600 bg-white dark:bg-slate-900 text-xs font-semibold"
                        >
                          {ATTENDANCE_STATUSES.map((st) => (
                            <option key={st.value} value={st.value}>
                              {st.label}
                            </option>
                          ))}
                        </select>
                      </td>
                      <td className="py-2 px-3">
                        <input
                          type="time"
                          value={row.check_in || ""}
                          onChange={(e) =>
                            updateAttendanceRow(row.employee_id, "check_in", e.target.value)
                          }
                          className="h-8 px-2 rounded-lg border border-slate-300 dark:border-slate-600 bg-white dark:bg-slate-900 text-xs font-mono"
                        />
                      </td>
                      <td className="py-2 px-3">
                        <input
                          type="time"
                          value={row.check_out || ""}
                          onChange={(e) =>
                            updateAttendanceRow(row.employee_id, "check_out", e.target.value)
                          }
                          className="h-8 px-2 rounded-lg border border-slate-300 dark:border-slate-600 bg-white dark:bg-slate-900 text-xs font-mono"
                        />
                      </td>
                      <td className="py-2 px-3">
                        <input
                          type="number"
                          min="0"
                          value={row.late_minutes}
                          onChange={(e) =>
                            updateAttendanceRow(row.employee_id, "late_minutes", e.target.value)
                          }
                          className="w-20 h-8 px-2 rounded-lg border border-slate-300 dark:border-slate-600 bg-white dark:bg-slate-900 text-xs font-mono"
                        />
                      </td>
                      <td className="py-2 px-3">
                        <input
                          type="number"
                          step="0.5"
                          min="0"
                          value={row.overtime_hours}
                          onChange={(e) =>
                            updateAttendanceRow(row.employee_id, "overtime_hours", e.target.value)
                          }
                          className="w-20 h-8 px-2 rounded-lg border border-slate-300 dark:border-slate-600 bg-white dark:bg-slate-900 text-xs font-mono"
                        />
                      </td>
                      <td className="py-2 px-3">
                        <input
                          type="number"
                          step="any"
                          min="0"
                          value={row.fine_amount}
                          onChange={(e) =>
                            updateAttendanceRow(row.employee_id, "fine_amount", e.target.value)
                          }
                          className="w-24 h-8 px-2 rounded-lg border border-slate-300 dark:border-slate-600 bg-white dark:bg-slate-900 text-xs font-mono"
                        />
                      </td>
                      <td className="py-2 px-3">
                        <input
                          type="text"
                          placeholder="Remark..."
                          value={row.notes || ""}
                          onChange={(e) =>
                            updateAttendanceRow(row.employee_id, "notes", e.target.value)
                          }
                          className="w-40 h-8 px-2 rounded-lg border border-slate-300 dark:border-slate-600 bg-white dark:bg-slate-900 text-xs"
                        />
                      </td>
                    </tr>
                  ))
                )}
              </tbody>
            </table>
          </div>
        </div>
      )}

      {/* TAB 3: MONTHLY PAYROLL, STAFF ADVANCES & PAYSLIPS */}
      {activeTab === "payroll" && (
        <div className="space-y-4">
          {/* Monthly Payroll Generator & Run Selector */}
          <div className="bg-white dark:bg-slate-800/90 border border-slate-200/80 dark:border-slate-700/80 rounded-2xl p-4 shadow-xs space-y-4">
            <div className="flex flex-col lg:flex-row lg:items-center justify-between gap-3 pb-3 border-b border-slate-200 dark:border-slate-700">
              <div className="flex flex-wrap items-center gap-3">
                <div>
                  <label className="block text-[10px] font-bold uppercase text-slate-400 mb-0.5">
                    Payroll Period (Month)
                  </label>
                  <input
                    type="month"
                    value={selectedPayrollMonth}
                    onChange={(e) => setSelectedPayrollMonth(e.target.value)}
                    className="h-9 px-3 rounded-xl border border-slate-300 dark:border-slate-600 bg-slate-50 dark:bg-slate-900 text-xs font-mono font-bold"
                  />
                </div>

                <label className="inline-flex items-center gap-2 text-xs mt-4 cursor-pointer select-none">
                  <input
                    type="checkbox"
                    checked={autoDeductAdvances}
                    onChange={(e) => setAutoDeductAdvances(e.target.checked)}
                    className="rounded border-slate-300 text-blue-600"
                  />
                  <span>Auto-deduct outstanding Staff Advances from net salary</span>
                </label>
              </div>

              <div className="flex flex-wrap items-center gap-2">
                <button
                  type="button"
                  disabled={generatingPayroll}
                  onClick={handleGeneratePayroll}
                  className={`inline-flex items-center gap-1.5 px-4 py-2 text-xs font-bold rounded-xl theme-btn-primary cursor-pointer disabled:opacity-50 ${btnPrimary.className}`}
                  style={btnPrimary.style}
                >
                  <ArrowPathIcon className={`w-4 h-4 ${generatingPayroll ? "animate-spin" : ""}`} />
                  <span>
                    {generatingPayroll
                      ? "Calculating Payroll..."
                      : `Generate / Refresh Payroll (${selectedPayrollMonth})`}
                  </span>
                </button>

                {activePayrollRun && activePayrollRun.status !== "paid" && (
                  <button
                    type="button"
                    onClick={() => {
                      setPayForm({
                        payment_method: "cash",
                        account_id: treasuryAccounts[0]?.id ? String(treasuryAccounts[0].id) : "",
                        date: todayIso,
                      });
                      setPayAllRunModal(activePayrollRun);
                    }}
                    className="inline-flex items-center gap-1.5 px-4 py-2 text-xs font-bold rounded-xl bg-emerald-600 hover:bg-emerald-700 text-white cursor-pointer"
                  >
                    <CheckBadgeIcon className="w-4 h-4" />
                    <span>Pay All Unpaid Payslips</span>
                  </button>
                )}
              </div>
            </div>

            {activePayrollRun ? (
              <div className="space-y-3">
                {/* Run Summary Strip */}
                <div className="grid grid-cols-2 sm:grid-cols-4 lg:grid-cols-7 gap-2.5">
                  <div className="p-2.5 rounded-xl bg-slate-50 dark:bg-slate-900/60 border border-slate-200 dark:border-slate-700">
                    <span className="text-[10px] uppercase font-bold text-slate-400">Run #</span>
                    <div className="font-mono font-bold text-xs mt-0.5">
                      {activePayrollRun.run_number}
                    </div>
                  </div>
                  <div className="p-2.5 rounded-xl bg-slate-50 dark:bg-slate-900/60 border border-slate-200 dark:border-slate-700">
                    <span className="text-[10px] uppercase font-bold text-slate-400">
                      Basic + Allow.
                    </span>
                    <div className="font-mono font-bold text-xs mt-0.5">
                      {fmtCurrency(
                        Number(activePayrollRun.total_basic || 0) +
                          Number(activePayrollRun.total_allowances || 0)
                      )}
                    </div>
                  </div>
                  <div className="p-2.5 rounded-xl bg-purple-50/60 dark:bg-purple-950/30 border border-purple-200/60 dark:border-purple-800/60">
                    <span className="text-[10px] uppercase font-bold text-purple-600 dark:text-purple-400">
                      Commissions + Bonus
                    </span>
                    <div className="font-mono font-bold text-xs text-purple-700 dark:text-purple-300 mt-0.5">
                      {fmtCurrency(
                        Number(activePayrollRun.total_commissions || 0) +
                          Number(activePayrollRun.total_bonuses || 0) +
                          Number(activePayrollRun.total_overtime || 0)
                      )}
                    </div>
                  </div>
                  <div className="p-2.5 rounded-xl bg-amber-50/60 dark:bg-amber-950/30 border border-amber-200/60 dark:border-amber-800/60">
                    <span className="text-[10px] uppercase font-bold text-amber-600 dark:text-amber-400">
                      Advance Recovered
                    </span>
                    <div className="font-mono font-bold text-xs text-amber-700 dark:text-amber-300 mt-0.5">
                      {fmtCurrency(activePayrollRun.total_advance_deductions)}
                    </div>
                  </div>
                  <div className="p-2.5 rounded-xl bg-rose-50/60 dark:bg-rose-950/30 border border-rose-200/60 dark:border-rose-800/60">
                    <span className="text-[10px] uppercase font-bold text-rose-600 dark:text-rose-400">
                      Total Deductions
                    </span>
                    <div className="font-mono font-bold text-xs text-rose-700 dark:text-rose-300 mt-0.5">
                      {fmtCurrency(activePayrollRun.total_deductions)}
                    </div>
                  </div>
                  <div className="p-2.5 rounded-xl bg-blue-50/60 dark:bg-blue-950/30 border border-blue-200/60 dark:border-blue-800/60">
                    <span className="text-[10px] uppercase font-bold text-blue-600 dark:text-blue-400">
                      Net Payable
                    </span>
                    <div className="font-mono font-bold text-sm text-blue-700 dark:text-blue-300 mt-0.5">
                      {fmtCurrency(activePayrollRun.total_net_payable)}
                    </div>
                  </div>
                  <div className="p-2.5 rounded-xl bg-emerald-50/60 dark:bg-emerald-950/30 border border-emerald-200/60 dark:border-emerald-800/60">
                    <span className="text-[10px] uppercase font-bold text-emerald-600 dark:text-emerald-400">
                      Paid Disbursed
                    </span>
                    <div className="font-mono font-bold text-sm text-emerald-700 dark:text-emerald-300 mt-0.5">
                      {fmtCurrency(activePayrollRun.total_paid)}
                    </div>
                  </div>
                </div>

                {/* Payslips Table */}
                <div className="overflow-x-auto rounded-xl border border-slate-200 dark:border-slate-700">
                  <table className="w-full text-xs text-left">
                    <thead className="bg-slate-50 dark:bg-slate-900/80 text-slate-500 dark:text-slate-400 uppercase text-[10px] tracking-wider border-b border-slate-200 dark:border-slate-700">
                      <tr>
                        <th className="py-2.5 px-3">Employee</th>
                        <th className="py-2.5 px-3 text-center">Attendance</th>
                        <th className="py-2.5 px-3 text-right">Basic + Allow.</th>
                        <th className="py-2.5 px-3 text-right">OT + Bonus</th>
                        <th className="py-2.5 px-3 text-right">Sales Comm.</th>
                        <th className="py-2.5 px-3 text-right">Abs./Fine Ded.</th>
                        <th className="py-2.5 px-3 text-right">Advance Ded.</th>
                        <th className="py-2.5 px-3 text-right">Net Payable</th>
                        <th className="py-2.5 px-3 text-center">Status</th>
                        <th className="py-2.5 px-3 text-right">Actions</th>
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-slate-100 dark:divide-slate-700/60">
                      {(activePayrollRun.items || []).map((item) => (
                        <tr
                          key={item.id}
                          className="hover:bg-slate-50/80 dark:hover:bg-slate-700/30"
                        >
                          <td className="py-2.5 px-3">
                            <div className="font-bold text-slate-900 dark:text-white">
                              {item.employee?.name}
                            </div>
                            <div className="text-[10px] text-slate-500">
                              {item.employee?.employee_code} • {item.employee?.designation}
                            </div>
                          </td>
                          <td className="py-2.5 px-3 text-center font-mono text-[11px]">
                            <span className="text-emerald-600 font-bold">
                              P:{item.present_days}
                            </span>{" "}
                            /{" "}
                            <span className="text-rose-600 font-bold">
                              A:{item.absent_days}
                            </span>{" "}
                            /{" "}
                            <span className="text-blue-600">OT:{item.overtime_hours}h</span>
                          </td>
                          <td className="py-2.5 px-3 text-right font-mono">
                            {fmtCurrency(Number(item.basic_salary || 0) + Number(item.allowances || 0))}
                          </td>
                          <td className="py-2.5 px-3 text-right font-mono">
                            {fmtCurrency(
                              Number(item.overtime_pay || 0) +
                                Number(item.target_bonus || 0) +
                                Number(item.other_bonus || 0)
                            )}
                          </td>
                          <td className="py-2.5 px-3 text-right font-mono text-purple-600 dark:text-purple-400 font-semibold">
                            {fmtCurrency(item.sales_commission)}
                            {Number(item.sales_invoices_count) > 0 && (
                              <div className="text-[10px] text-slate-400">
                                {item.sales_invoices_count} inv ({fmtCurrency(item.sales_volume)})
                              </div>
                            )}
                          </td>
                          <td className="py-2.5 px-3 text-right font-mono text-rose-600">
                            {fmtCurrency(
                              Number(item.absence_deduction || 0) +
                                Number(item.late_or_fine_deduction || 0) +
                                Number(item.other_deduction || 0)
                            )}
                          </td>
                          <td className="py-2.5 px-3 text-right font-mono text-amber-600 font-semibold">
                            {fmtCurrency(item.advance_deduction)}
                          </td>
                          <td className="py-2.5 px-3 text-right font-mono font-bold text-slate-900 dark:text-white text-sm">
                            {fmtCurrency(item.net_payable)}
                          </td>
                          <td className="py-2.5 px-3 text-center">
                            <span
                              className={`px-2 py-0.5 rounded-full text-[10px] font-bold uppercase ${
                                item.payment_status === "paid"
                                  ? "bg-emerald-500/15 text-emerald-700 dark:text-emerald-300"
                                  : "bg-amber-500/15 text-amber-700 dark:text-amber-300"
                              }`}
                            >
                              {item.payment_status}
                            </span>
                          </td>
                          <td className="py-2.5 px-3 text-right">
                            <div className="inline-flex items-center gap-1">
                              {item.payment_status !== "paid" && (
                                <>
                                  <button
                                    type="button"
                                    onClick={() => handleOpenEditPayslip(item)}
                                    className="px-2 py-1 rounded-lg text-[11px] font-semibold bg-slate-100 dark:bg-slate-700 text-slate-700 dark:text-slate-200 hover:bg-slate-200 cursor-pointer"
                                    title="Adjust Payslip"
                                  >
                                    Adjust
                                  </button>
                                  <button
                                    type="button"
                                    onClick={() => {
                                      setPayForm({
                                        payment_method: item.payment_method || "cash",
                                        account_id: treasuryAccounts[0]?.id
                                          ? String(treasuryAccounts[0].id)
                                          : "",
                                        date: todayIso,
                                      });
                                      setPayingPayslip(item);
                                    }}
                                    className="px-2.5 py-1 rounded-lg text-[11px] font-bold bg-emerald-600 text-white hover:bg-emerald-700 cursor-pointer"
                                    title="Pay Payslip Now"
                                  >
                                    Pay
                                  </button>
                                </>
                              )}
                              <button
                                type="button"
                                onClick={() =>
                                  setPrintingPayslip({
                                    ...item,
                                    period_month: activePayrollRun.period_month,
                                    run_number: activePayrollRun.run_number,
                                  })
                                }
                                className="p-1.5 rounded-lg text-blue-600 hover:bg-blue-50 dark:hover:bg-blue-950/50 cursor-pointer"
                                title="View / Print Payslip"
                              >
                                <PrinterIcon className="w-4 h-4" />
                              </button>
                            </div>
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              </div>
            ) : (
              <div className="py-8 text-center text-xs text-slate-400">
                No payroll run generated for {selectedPayrollMonth} yet. Click{" "}
                <strong>"Generate / Refresh Payroll ({selectedPayrollMonth})"</strong> above to
                automatically compute salaries, attendance, commissions, and advance recoveries.
              </div>
            )}
          </div>

          {/* Staff Loans & Salary Advances Ledger ("Kharcha") */}
          <div className="bg-white dark:bg-slate-800/90 border border-slate-200/80 dark:border-slate-700/80 rounded-2xl p-4 shadow-xs space-y-3">
            <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-2">
              <div>
                <h2 className="text-sm font-bold text-slate-900 dark:text-white">
                  Staff Salary Advances & Loan Ledger ("Kharcha")
                </h2>
                <p className="text-[11px] text-slate-500">
                  Tracks cash/bank advances given to employees, direct repayments, and automatic monthly payroll deductions.
                </p>
              </div>
              <div className="flex flex-wrap items-center gap-2">
                <button
                  type="button"
                  onClick={() => handleOpenAdvanceModal(null, "repayment")}
                  className="px-3 py-1.5 rounded-xl text-xs font-semibold border border-emerald-300 dark:border-emerald-700 text-emerald-700 dark:text-emerald-300 hover:bg-emerald-50 cursor-pointer"
                >
                  + Record Repayment
                </button>
                <button
                  type="button"
                  onClick={() => handleOpenAdvanceModal(null, "advance")}
                  className="px-3 py-1.5 rounded-xl text-xs font-bold bg-amber-500 hover:bg-amber-600 text-white cursor-pointer"
                >
                  + Disburse Advance
                </button>
              </div>
            </div>

            <div className="overflow-x-auto rounded-xl border border-slate-200 dark:border-slate-700">
              <table className="w-full text-xs text-left">
                <thead className="bg-slate-50 dark:bg-slate-900/80 text-slate-500 dark:text-slate-400 uppercase text-[10px] tracking-wider border-b border-slate-200 dark:border-slate-700">
                  <tr>
                    <th className="py-2 px-3">Voucher #</th>
                    <th className="py-2 px-3">Date</th>
                    <th className="py-2 px-3">Employee</th>
                    <th className="py-2 px-3">Type</th>
                    <th className="py-2 px-3">Method / Account</th>
                    <th className="py-2 px-3 text-right">Amount</th>
                    <th className="py-2 px-3 text-right">Balance After</th>
                    <th className="py-2 px-3">Description</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-100 dark:divide-slate-700/60">
                  {advances.length === 0 ? (
                    <tr>
                      <td colSpan={8} className="py-6 text-center text-slate-400">
                        No staff advance transactions recorded yet.
                      </td>
                    </tr>
                  ) : (
                    advances.map((adv) => (
                      <tr key={adv.id} className="hover:bg-slate-50/80 dark:hover:bg-slate-700/30">
                        <td className="py-2 px-3 font-mono font-semibold">{adv.advance_number}</td>
                        <td className="py-2 px-3 font-mono">{(adv.date || "").slice(0, 10)}</td>
                        <td className="py-2 px-3 font-bold">
                          {adv.employee?.name}{" "}
                          <span className="font-mono text-[10px] text-slate-400">
                            ({adv.employee?.employee_code})
                          </span>
                        </td>
                        <td className="py-2 px-3">
                          <span
                            className={`px-2 py-0.5 rounded-full text-[10px] font-bold uppercase ${
                              adv.type === "advance"
                                ? "bg-amber-500/15 text-amber-700 dark:text-amber-300"
                                : "bg-emerald-500/15 text-emerald-700 dark:text-emerald-300"
                            }`}
                          >
                            {adv.type === "advance"
                              ? "Advance Disbursed"
                              : adv.type === "payroll_deduction"
                              ? "Payroll Recovery"
                              : "Cash Repayment"}
                          </span>
                        </td>
                        <td className="py-2 px-3">
                          {adv.account?.name || adv.payment_method}
                        </td>
                        <td
                          className={`py-2 px-3 text-right font-mono font-bold ${
                            adv.type === "advance" ? "text-amber-600" : "text-emerald-600"
                          }`}
                        >
                          {adv.type === "advance" ? "+" : "-"}
                          {fmtCurrency(adv.amount)}
                        </td>
                        <td className="py-2 px-3 text-right font-mono font-semibold">
                          {fmtCurrency(adv.balance_after)}
                        </td>
                        <td className="py-2 px-3 text-slate-500">{adv.description}</td>
                      </tr>
                    ))
                  )}
                </tbody>
              </table>
            </div>
          </div>
        </div>
      )}

      {/* TAB 4: SALESMAN & CASHIER COMMISSION ENGINE */}
      {activeTab === "commissions" && (
        <div className="bg-white dark:bg-slate-800/90 border border-slate-200/80 dark:border-slate-700/80 rounded-2xl p-4 shadow-xs space-y-4">
          <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3">
            <div className="flex flex-wrap items-center gap-3">
              <div>
                <label className="block text-[10px] font-bold uppercase text-slate-400 mb-0.5">
                  From Date
                </label>
                <input
                  type="date"
                  value={commFrom}
                  onChange={(e) => setCommFrom(e.target.value)}
                  className="h-9 px-3 rounded-xl border border-slate-300 dark:border-slate-600 bg-slate-50 dark:bg-slate-900 text-xs font-mono"
                />
              </div>
              <div>
                <label className="block text-[10px] font-bold uppercase text-slate-400 mb-0.5">
                  To Date
                </label>
                <input
                  type="date"
                  value={commTo}
                  onChange={(e) => setCommTo(e.target.value)}
                  className="h-9 px-3 rounded-xl border border-slate-300 dark:border-slate-600 bg-slate-50 dark:bg-slate-900 text-xs font-mono"
                />
              </div>
              <button
                type="button"
                onClick={fetchCommissions}
                className="mt-4 px-3.5 py-2 rounded-xl text-xs font-bold bg-blue-600 text-white hover:bg-blue-700 cursor-pointer"
              >
                Calculate Commissions
              </button>
            </div>

            <div className="flex flex-wrap items-center gap-2 sm:gap-3 text-xs font-mono">
              <div className="px-3 py-1.5 rounded-xl bg-slate-100 dark:bg-slate-700">
                Net Sales: <strong>{fmtCurrency(commReport?.summary?.total_net_sales)}</strong>
              </div>
              <div className="px-3 py-1.5 rounded-xl bg-emerald-500/15 text-emerald-700 dark:text-emerald-300 font-bold">
                Gross Profit: {fmtCurrency(commReport?.summary?.total_gross_profit)}
              </div>
              <div className="px-3 py-1.5 rounded-xl bg-purple-500/15 text-purple-700 dark:text-purple-300 font-bold">
                Total Incentives: {fmtCurrency(commReport?.summary?.total_incentives)}
              </div>
            </div>
          </div>

          <div className="overflow-x-auto rounded-xl border border-slate-200 dark:border-slate-700">
            <table className="w-full text-xs text-left">
              <thead className="bg-slate-50 dark:bg-slate-900/80 text-slate-500 dark:text-slate-400 uppercase text-[10px] tracking-wider border-b border-slate-200 dark:border-slate-700">
                <tr>
                  <th className="py-2.5 px-3">Salesman / Cashier</th>
                  <th className="py-2.5 px-3">Commission Rule</th>
                  <th className="py-2.5 px-3 text-center">Invoices</th>
                  <th className="py-2.5 px-3 text-right">Net Sales</th>
                  <th className="py-2.5 px-3 text-right">Gross Profit</th>
                  <th className="py-2.5 px-3">Monthly Target Progress</th>
                  <th className="py-2.5 px-3 text-right">Commission</th>
                  <th className="py-2.5 px-3 text-right">Target Bonus</th>
                  <th className="py-2.5 px-3 text-right">Total Incentive</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100 dark:divide-slate-700/60">
                {loadingCommissions ? (
                  <tr>
                    <td colSpan={9} className="py-8 text-center text-slate-400">
                      Calculating sales commissions...
                    </td>
                  </tr>
                ) : (commReport?.rows || []).length === 0 ? (
                  <tr>
                    <td colSpan={9} className="py-8 text-center text-slate-400">
                      No active employees found.
                    </td>
                  </tr>
                ) : (
                  (commReport.rows || []).map((row) => (
                    <tr
                      key={row.employee_id}
                      className="hover:bg-slate-50/80 dark:hover:bg-slate-700/30"
                    >
                      <td className="py-2.5 px-3">
                        <div className="font-bold text-slate-900 dark:text-white">
                          {row.employee_name}
                        </div>
                        <div className="text-[10px] text-slate-500">
                          {row.employee_code} • {row.designation}
                          {row.user_name ? ` (User: ${row.user_name})` : ""}
                        </div>
                      </td>
                      <td className="py-2.5 px-3">
                        {row.commission_type === "none" ? (
                          <span className="text-slate-400">None</span>
                        ) : row.commission_type === "net_sales_percent" ? (
                          <span className="font-semibold text-purple-600 dark:text-purple-400">
                            {row.commission_rate}% of Net Sales
                          </span>
                        ) : row.commission_type === "gross_profit_percent" ? (
                          <span className="font-semibold text-indigo-600 dark:text-indigo-400">
                            {row.commission_rate}% of Gross Profit
                          </span>
                        ) : (
                          <span className="font-semibold text-blue-600 dark:text-blue-400">
                            {fmtCurrency(row.commission_rate)} / Invoice
                          </span>
                        )}
                      </td>
                      <td className="py-2.5 px-3 text-center font-mono font-bold">
                        {row.invoices_count}
                      </td>
                      <td className="py-2.5 px-3 text-right font-mono font-bold">
                        {fmtCurrency(row.net_sales)}
                      </td>
                      <td className="py-2.5 px-3 text-right font-mono text-emerald-600 dark:text-emerald-400 font-semibold">
                        {fmtCurrency(row.gross_profit)}
                      </td>
                      <td className="py-2.5 px-3 w-52">
                        {Number(row.monthly_sales_target) > 0 ? (
                          <div>
                            <div className="flex items-center justify-between text-[10px] font-mono mb-1">
                              <span>
                                {row.target_progress_pct}% of {fmtCurrency(row.monthly_sales_target)}
                              </span>
                              {row.target_achieved && (
                                <span className="text-emerald-600 font-bold">★ Achieved!</span>
                              )}
                            </div>
                            <div className="w-full h-2 rounded-full bg-slate-200 dark:bg-slate-700 overflow-hidden">
                              <div
                                className={`h-full rounded-full ${
                                  row.target_achieved ? "bg-emerald-500" : "bg-blue-500"
                                }`}
                                style={{
                                  width: `${Math.min(100, Number(row.target_progress_pct || 0))}%`,
                                }}
                              />
                            </div>
                          </div>
                        ) : (
                          <span className="text-[11px] text-slate-400">No target set</span>
                        )}
                      </td>
                      <td className="py-2.5 px-3 text-right font-mono font-semibold text-purple-600 dark:text-purple-400">
                        {fmtCurrency(row.commission_earned)}
                      </td>
                      <td className="py-2.5 px-3 text-right font-mono font-semibold text-emerald-600 dark:text-emerald-400">
                        {fmtCurrency(row.target_bonus)}
                      </td>
                      <td className="py-2.5 px-3 text-right font-mono font-bold text-sm text-slate-900 dark:text-white">
                        {fmtCurrency(row.total_incentive)}
                      </td>
                    </tr>
                  ))
                )}
              </tbody>
            </table>
          </div>
        </div>
      )}

      {/* MODAL 1: ADD / EDIT EMPLOYEE */}
      {employeeModalOpen && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 backdrop-blur-xs p-4 overflow-y-auto">
          <div className="bg-white dark:bg-slate-800 border border-slate-200 dark:border-slate-700 rounded-2xl max-w-3xl w-full max-h-[90dvh] overflow-y-auto p-4 sm:p-6 shadow-2xl space-y-4 my-4">
            <div className="flex items-center justify-between border-b border-slate-200 dark:border-slate-700 pb-3">
              <h3 className="text-base font-bold text-slate-900 dark:text-white">
                {editingEmployee
                  ? `Edit Employee — ${editingEmployee.name}`
                  : "Add New Employee Profile"}
              </h3>
              <button
                type="button"
                onClick={() => setEmployeeModalOpen(false)}
                className="p-1 rounded-lg text-slate-400 hover:text-slate-600 cursor-pointer"
              >
                <XMarkIcon className="w-5 h-5" />
              </button>
            </div>

            <form onSubmit={handleSaveEmployee} className="space-y-4 text-xs">
              <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
                <div>
                  <label className="block font-semibold mb-1">Employee Code *</label>
                  <input
                    type="text"
                    required
                    value={empForm.employee_code}
                    onChange={(e) => setEmpForm((p) => ({ ...p, employee_code: e.target.value }))}
                    className="w-full h-9 px-3 rounded-xl border border-slate-300 dark:border-slate-600 bg-slate-50 dark:bg-slate-900 font-mono"
                  />
                </div>
                <div>
                  <label className="block font-semibold mb-1">Full Name *</label>
                  <input
                    type="text"
                    required
                    value={empForm.name}
                    onChange={(e) => setEmpForm((p) => ({ ...p, name: e.target.value }))}
                    className="w-full h-9 px-3 rounded-xl border border-slate-300 dark:border-slate-600 bg-slate-50 dark:bg-slate-900"
                  />
                </div>
                <div>
                  <label className="block font-semibold mb-1">Link System Login (Optional)</label>
                  <select
                    value={empForm.user_id}
                    onChange={(e) => setEmpForm((p) => ({ ...p, user_id: e.target.value }))}
                    className="w-full h-9 px-3 rounded-xl border border-slate-300 dark:border-slate-600 bg-slate-50 dark:bg-slate-900"
                  >
                    <option value="">-- Not Linked to User --</option>
                    {systemUsers.map((u) => (
                      <option key={u.id} value={u.id}>
                        {u.name} ({u.email})
                      </option>
                    ))}
                  </select>
                </div>
              </div>

              <div className="grid grid-cols-1 sm:grid-cols-4 gap-3">
                <div>
                  <label className="block font-semibold mb-1">Phone</label>
                  <input
                    type="text"
                    value={empForm.phone}
                    onChange={(e) => setEmpForm((p) => ({ ...p, phone: e.target.value }))}
                    className="w-full h-9 px-3 rounded-xl border border-slate-300 dark:border-slate-600 bg-slate-50 dark:bg-slate-900"
                  />
                </div>
                <div>
                  <label className="block font-semibold mb-1">CNIC / National ID</label>
                  <input
                    type="text"
                    placeholder="35202-xxxxxxx-x"
                    value={empForm.cnic}
                    onChange={(e) => setEmpForm((p) => ({ ...p, cnic: e.target.value }))}
                    className="w-full h-9 px-3 rounded-xl border border-slate-300 dark:border-slate-600 bg-slate-50 dark:bg-slate-900 font-mono"
                  />
                </div>
                <div>
                  <label className="block font-semibold mb-1">Department</label>
                  <select
                    value={empForm.department}
                    onChange={(e) => setEmpForm((p) => ({ ...p, department: e.target.value }))}
                    className="w-full h-9 px-3 rounded-xl border border-slate-300 dark:border-slate-600 bg-slate-50 dark:bg-slate-900"
                  >
                    {DEPARTMENTS.map((d) => (
                      <option key={d} value={d}>
                        {d}
                      </option>
                    ))}
                  </select>
                </div>
                <div>
                  <label className="block font-semibold mb-1">Designation</label>
                  <input
                    type="text"
                    placeholder="e.g. Pharmacist / Order Booker"
                    value={empForm.designation}
                    onChange={(e) => setEmpForm((p) => ({ ...p, designation: e.target.value }))}
                    className="w-full h-9 px-3 rounded-xl border border-slate-300 dark:border-slate-600 bg-slate-50 dark:bg-slate-900"
                  />
                </div>
              </div>

              <div className="grid grid-cols-1 sm:grid-cols-4 gap-3">
                <div>
                  <label className="block font-semibold mb-1">Shift Name</label>
                  <input
                    type="text"
                    value={empForm.shift_name}
                    onChange={(e) => setEmpForm((p) => ({ ...p, shift_name: e.target.value }))}
                    className="w-full h-9 px-3 rounded-xl border border-slate-300 dark:border-slate-600 bg-slate-50 dark:bg-slate-900"
                  />
                </div>
                <div>
                  <label className="block font-semibold mb-1">Shift Start</label>
                  <input
                    type="time"
                    value={empForm.shift_start}
                    onChange={(e) => setEmpForm((p) => ({ ...p, shift_start: e.target.value }))}
                    className="w-full h-9 px-3 rounded-xl border border-slate-300 dark:border-slate-600 bg-slate-50 dark:bg-slate-900 font-mono"
                  />
                </div>
                <div>
                  <label className="block font-semibold mb-1">Shift End</label>
                  <input
                    type="time"
                    value={empForm.shift_end}
                    onChange={(e) => setEmpForm((p) => ({ ...p, shift_end: e.target.value }))}
                    className="w-full h-9 px-3 rounded-xl border border-slate-300 dark:border-slate-600 bg-slate-50 dark:bg-slate-900 font-mono"
                  />
                </div>
                <div>
                  <label className="block font-semibold mb-1">Working Days / Month</label>
                  <input
                    type="number"
                    min="1"
                    max="31"
                    value={empForm.working_days_per_month}
                    onChange={(e) =>
                      setEmpForm((p) => ({ ...p, working_days_per_month: e.target.value }))
                    }
                    className="w-full h-9 px-3 rounded-xl border border-slate-300 dark:border-slate-600 bg-slate-50 dark:bg-slate-900 font-mono"
                  />
                </div>
              </div>

              {/* Compensation & Commission Section */}
              <div className="p-3.5 rounded-xl bg-slate-50 dark:bg-slate-900/70 border border-slate-200 dark:border-slate-700 space-y-3">
                <div className="font-bold text-slate-700 dark:text-slate-200 uppercase text-[10px] tracking-wider">
                  Salary, Overtime & Sales Commission Rules
                </div>
                <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
                  <div>
                    <label className="block font-semibold mb-1">Basic Monthly Salary</label>
                    <input
                      type="number"
                      step="any"
                      min="0"
                      value={empForm.basic_salary}
                      onChange={(e) => setEmpForm((p) => ({ ...p, basic_salary: e.target.value }))}
                      className="w-full h-9 px-3 rounded-xl border border-slate-300 dark:border-slate-600 bg-white dark:bg-slate-800 font-mono font-bold"
                    />
                  </div>
                  <div>
                    <label className="block font-semibold mb-1">Monthly Fixed Allowances</label>
                    <input
                      type="number"
                      step="any"
                      min="0"
                      value={empForm.default_allowances}
                      onChange={(e) =>
                        setEmpForm((p) => ({ ...p, default_allowances: e.target.value }))
                      }
                      className="w-full h-9 px-3 rounded-xl border border-slate-300 dark:border-slate-600 bg-white dark:bg-slate-800 font-mono"
                    />
                  </div>
                  <div>
                    <label className="block font-semibold mb-1">Overtime Rate (Per Hour)</label>
                    <input
                      type="number"
                      step="any"
                      min="0"
                      value={empForm.hourly_overtime_rate}
                      onChange={(e) =>
                        setEmpForm((p) => ({ ...p, hourly_overtime_rate: e.target.value }))
                      }
                      className="w-full h-9 px-3 rounded-xl border border-slate-300 dark:border-slate-600 bg-white dark:bg-slate-800 font-mono"
                    />
                  </div>
                </div>

                <div className="grid grid-cols-1 sm:grid-cols-4 gap-3">
                  <div>
                    <label className="block font-semibold mb-1">Commission Structure</label>
                    <select
                      value={empForm.commission_type}
                      onChange={(e) =>
                        setEmpForm((p) => ({ ...p, commission_type: e.target.value }))
                      }
                      className="w-full h-9 px-3 rounded-xl border border-slate-300 dark:border-slate-600 bg-white dark:bg-slate-800"
                    >
                      {COMMISSION_TYPES.map((ct) => (
                        <option key={ct.value} value={ct.value}>
                          {ct.label}
                        </option>
                      ))}
                    </select>
                  </div>
                  <div>
                    <label className="block font-semibold mb-1">
                      {empForm.commission_type === "fixed_per_invoice"
                        ? "Amount per Invoice"
                        : "Commission % Rate"}
                    </label>
                    <input
                      type="number"
                      step="any"
                      min="0"
                      value={empForm.commission_rate}
                      onChange={(e) =>
                        setEmpForm((p) => ({ ...p, commission_rate: e.target.value }))
                      }
                      className="w-full h-9 px-3 rounded-xl border border-slate-300 dark:border-slate-600 bg-white dark:bg-slate-800 font-mono"
                    />
                  </div>
                  <div>
                    <label className="block font-semibold mb-1">Monthly Sales Target</label>
                    <input
                      type="number"
                      step="any"
                      min="0"
                      value={empForm.monthly_sales_target}
                      onChange={(e) =>
                        setEmpForm((p) => ({ ...p, monthly_sales_target: e.target.value }))
                      }
                      className="w-full h-9 px-3 rounded-xl border border-slate-300 dark:border-slate-600 bg-white dark:bg-slate-800 font-mono"
                    />
                  </div>
                  <div>
                    <label className="block font-semibold mb-1">Target Achievement Bonus</label>
                    <input
                      type="number"
                      step="any"
                      min="0"
                      value={empForm.target_bonus_amount}
                      onChange={(e) =>
                        setEmpForm((p) => ({ ...p, target_bonus_amount: e.target.value }))
                      }
                      className="w-full h-9 px-3 rounded-xl border border-slate-300 dark:border-slate-600 bg-white dark:bg-slate-800 font-mono"
                    />
                  </div>
                </div>
              </div>

              <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
                <div>
                  <label className="block font-semibold mb-1">Preferred Payout Method</label>
                  <select
                    value={empForm.payment_method}
                    onChange={(e) => setEmpForm((p) => ({ ...p, payment_method: e.target.value }))}
                    className="w-full h-9 px-3 rounded-xl border border-slate-300 dark:border-slate-600 bg-slate-50 dark:bg-slate-900"
                  >
                    <option value="cash">Cash</option>
                    <option value="bank_transfer">Bank Transfer</option>
                    <option value="wallet">Mobile Wallet (JazzCash / Easypaisa)</option>
                    <option value="cheque">Cheque</option>
                  </select>
                </div>
                <div>
                  <label className="block font-semibold mb-1">Bank / Wallet Name</label>
                  <input
                    type="text"
                    value={empForm.bank_name}
                    onChange={(e) => setEmpForm((p) => ({ ...p, bank_name: e.target.value }))}
                    className="w-full h-9 px-3 rounded-xl border border-slate-300 dark:border-slate-600 bg-slate-50 dark:bg-slate-900"
                  />
                </div>
                <div>
                  <label className="block font-semibold mb-1">Employment Status</label>
                  <select
                    value={empForm.status}
                    onChange={(e) => setEmpForm((p) => ({ ...p, status: e.target.value }))}
                    className="w-full h-9 px-3 rounded-xl border border-slate-300 dark:border-slate-600 bg-slate-50 dark:bg-slate-900"
                  >
                    <option value="active">Active</option>
                    <option value="on_leave">On Leave</option>
                    <option value="inactive">Inactive</option>
                  </select>
                </div>
              </div>

              <div className="flex items-center justify-end gap-2 pt-3 border-t border-slate-200 dark:border-slate-700">
                <button
                  type="button"
                  onClick={() => setEmployeeModalOpen(false)}
                  className="px-4 py-2 rounded-xl border border-slate-300 dark:border-slate-600 font-semibold cursor-pointer"
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  disabled={savingEmployee}
                  className="px-5 py-2 rounded-xl bg-blue-600 hover:bg-blue-700 text-white font-bold cursor-pointer disabled:opacity-50"
                >
                  {savingEmployee
                    ? "Saving..."
                    : editingEmployee
                    ? "Update Employee"
                    : "Create Employee"}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* MODAL 2: STAFF ADVANCE / REPAYMENT */}
      {advanceModalOpen && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 backdrop-blur-xs p-4">
          <div className="bg-white dark:bg-slate-800 border border-slate-200 dark:border-slate-700 rounded-2xl max-w-md w-full max-h-[90dvh] overflow-y-auto p-4 sm:p-6 shadow-2xl space-y-4">
            <div className="flex items-center justify-between border-b border-slate-200 dark:border-slate-700 pb-3">
              <h3 className="text-base font-bold text-slate-900 dark:text-white">
                {advanceForm.type === "advance"
                  ? "Disburse Staff Salary Advance (Kharcha)"
                  : "Record Staff Advance Repayment"}
              </h3>
              <button
                type="button"
                onClick={() => setAdvanceModalOpen(false)}
                className="p-1 rounded-lg text-slate-400 hover:text-slate-600 cursor-pointer"
              >
                <XMarkIcon className="w-5 h-5" />
              </button>
            </div>

            <form onSubmit={handleSaveAdvance} className="space-y-3 text-xs">
              <div>
                <label className="block font-semibold mb-1">Transaction Type</label>
                <select
                  value={advanceForm.type}
                  onChange={(e) => setAdvanceForm((p) => ({ ...p, type: e.target.value }))}
                  className="w-full h-9 px-3 rounded-xl border border-slate-300 dark:border-slate-600 bg-slate-50 dark:bg-slate-900 font-semibold"
                >
                  <option value="advance">Disburse Salary Advance / Loan to Staff</option>
                  <option value="repayment">Receive Direct Cash/Bank Repayment from Staff</option>
                </select>
              </div>

              <div>
                <label className="block font-semibold mb-1">Employee *</label>
                <select
                  required
                  value={advanceForm.employee_id}
                  onChange={(e) => setAdvanceForm((p) => ({ ...p, employee_id: e.target.value }))}
                  className="w-full h-9 px-3 rounded-xl border border-slate-300 dark:border-slate-600 bg-slate-50 dark:bg-slate-900"
                >
                  <option value="">-- Select Employee --</option>
                  {employees.map((emp) => (
                    <option key={emp.id} value={emp.id}>
                      {emp.name} ({emp.employee_code}) — Current Advance: {fmtCurrency(emp.advance_balance)}
                    </option>
                  ))}
                </select>
              </div>

              <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                <div>
                  <label className="block font-semibold mb-1">Amount *</label>
                  <input
                    type="number"
                    step="any"
                    min="1"
                    required
                    value={advanceForm.amount}
                    onChange={(e) => setAdvanceForm((p) => ({ ...p, amount: e.target.value }))}
                    className="w-full h-9 px-3 rounded-xl border border-slate-300 dark:border-slate-600 bg-slate-50 dark:bg-slate-900 font-mono font-bold"
                  />
                </div>
                <div>
                  <label className="block font-semibold mb-1">Date</label>
                  <input
                    type="date"
                    value={advanceForm.date}
                    onChange={(e) => setAdvanceForm((p) => ({ ...p, date: e.target.value }))}
                    className="w-full h-9 px-3 rounded-xl border border-slate-300 dark:border-slate-600 bg-slate-50 dark:bg-slate-900 font-mono"
                  />
                </div>
              </div>

              <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                <div>
                  <label className="block font-semibold mb-1">Payment Method</label>
                  <select
                    value={advanceForm.payment_method}
                    onChange={(e) =>
                      setAdvanceForm((p) => ({ ...p, payment_method: e.target.value }))
                    }
                    className="w-full h-9 px-3 rounded-xl border border-slate-300 dark:border-slate-600 bg-slate-50 dark:bg-slate-900"
                  >
                    <option value="cash">Cash</option>
                    <option value="bank_transfer">Bank Transfer</option>
                    <option value="wallet">Mobile Wallet</option>
                    <option value="cheque">Cheque</option>
                  </select>
                </div>
                <div>
                  <label className="block font-semibold mb-1">Treasury Account</label>
                  <select
                    value={advanceForm.account_id}
                    onChange={(e) => setAdvanceForm((p) => ({ ...p, account_id: e.target.value }))}
                    className="w-full h-9 px-3 rounded-xl border border-slate-300 dark:border-slate-600 bg-slate-50 dark:bg-slate-900"
                  >
                    <option value="">Default Account</option>
                    {treasuryAccounts.map((acc) => (
                      <option key={acc.id} value={acc.id}>
                        {acc.name} ({fmtCurrency(acc.current_balance)})
                      </option>
                    ))}
                  </select>
                </div>
              </div>

              <div>
                <label className="block font-semibold mb-1">Description / Remarks</label>
                <input
                  type="text"
                  placeholder="e.g. Mid-month salary advance"
                  value={advanceForm.description}
                  onChange={(e) => setAdvanceForm((p) => ({ ...p, description: e.target.value }))}
                  className="w-full h-9 px-3 rounded-xl border border-slate-300 dark:border-slate-600 bg-slate-50 dark:bg-slate-900"
                />
              </div>

              <div className="flex items-center justify-end gap-2 pt-3 border-t border-slate-200 dark:border-slate-700">
                <button
                  type="button"
                  onClick={() => setAdvanceModalOpen(false)}
                  className="px-4 py-2 rounded-xl border border-slate-300 dark:border-slate-600 font-semibold cursor-pointer"
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  disabled={savingAdvance}
                  className="px-4 py-2 rounded-xl bg-amber-500 hover:bg-amber-600 text-white font-bold cursor-pointer disabled:opacity-50"
                >
                  {savingAdvance ? "Saving..." : "Save Transaction"}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* MODAL 3: ADJUST UNPAID PAYSLIP */}
      {editingPayslip && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 backdrop-blur-xs p-4">
          <div className="bg-white dark:bg-slate-800 border border-slate-200 dark:border-slate-700 rounded-2xl max-w-lg w-full max-h-[90dvh] overflow-y-auto p-4 sm:p-6 shadow-2xl space-y-4">
            <div className="flex items-center justify-between border-b border-slate-200 dark:border-slate-700 pb-3">
              <div>
                <h3 className="text-base font-bold text-slate-900 dark:text-white">
                  Adjust Payslip — {editingPayslip.employee?.name}
                </h3>
                <p className="text-[11px] text-slate-500">
                  Outstanding Advance Balance: {fmtCurrency(editingPayslip.employee?.advance_balance)}
                </p>
              </div>
              <button
                type="button"
                onClick={() => setEditingPayslip(null)}
                className="p-1 rounded-lg text-slate-400 hover:text-slate-600 cursor-pointer"
              >
                <XMarkIcon className="w-5 h-5" />
              </button>
            </div>

            <form onSubmit={handleSavePayslipEdit} className="space-y-3 text-xs">
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                <div>
                  <label className="block font-semibold mb-1">Basic Salary</label>
                  <input
                    type="number"
                    step="any"
                    min="0"
                    value={payslipForm.basic_salary}
                    onChange={(e) =>
                      setPayslipForm((p) => ({ ...p, basic_salary: e.target.value }))
                    }
                    className="w-full h-9 px-3 rounded-xl border border-slate-300 dark:border-slate-600 bg-slate-50 dark:bg-slate-900 font-mono"
                  />
                </div>
                <div>
                  <label className="block font-semibold mb-1">Allowances</label>
                  <input
                    type="number"
                    step="any"
                    min="0"
                    value={payslipForm.allowances}
                    onChange={(e) =>
                      setPayslipForm((p) => ({ ...p, allowances: e.target.value }))
                    }
                    className="w-full h-9 px-3 rounded-xl border border-slate-300 dark:border-slate-600 bg-slate-50 dark:bg-slate-900 font-mono"
                  />
                </div>
                <div>
                  <label className="block font-semibold mb-1">Overtime Pay</label>
                  <input
                    type="number"
                    step="any"
                    min="0"
                    value={payslipForm.overtime_pay}
                    onChange={(e) =>
                      setPayslipForm((p) => ({ ...p, overtime_pay: e.target.value }))
                    }
                    className="w-full h-9 px-3 rounded-xl border border-slate-300 dark:border-slate-600 bg-slate-50 dark:bg-slate-900 font-mono"
                  />
                </div>
                <div>
                  <label className="block font-semibold mb-1">Sales Commission</label>
                  <input
                    type="number"
                    step="any"
                    min="0"
                    value={payslipForm.sales_commission}
                    onChange={(e) =>
                      setPayslipForm((p) => ({ ...p, sales_commission: e.target.value }))
                    }
                    className="w-full h-9 px-3 rounded-xl border border-slate-300 dark:border-slate-600 bg-slate-50 dark:bg-slate-900 font-mono"
                  />
                </div>
                <div>
                  <label className="block font-semibold mb-1">Target Bonus</label>
                  <input
                    type="number"
                    step="any"
                    min="0"
                    value={payslipForm.target_bonus}
                    onChange={(e) =>
                      setPayslipForm((p) => ({ ...p, target_bonus: e.target.value }))
                    }
                    className="w-full h-9 px-3 rounded-xl border border-slate-300 dark:border-slate-600 bg-slate-50 dark:bg-slate-900 font-mono"
                  />
                </div>
                <div>
                  <label className="block font-semibold mb-1">Other Special Bonus</label>
                  <input
                    type="number"
                    step="any"
                    min="0"
                    value={payslipForm.other_bonus}
                    onChange={(e) =>
                      setPayslipForm((p) => ({ ...p, other_bonus: e.target.value }))
                    }
                    className="w-full h-9 px-3 rounded-xl border border-slate-300 dark:border-slate-600 bg-slate-50 dark:bg-slate-900 font-mono"
                  />
                </div>
                <div>
                  <label className="block font-semibold mb-1 text-rose-600">
                    Absence Deduction
                  </label>
                  <input
                    type="number"
                    step="any"
                    min="0"
                    value={payslipForm.absence_deduction}
                    onChange={(e) =>
                      setPayslipForm((p) => ({ ...p, absence_deduction: e.target.value }))
                    }
                    className="w-full h-9 px-3 rounded-xl border border-slate-300 dark:border-slate-600 bg-slate-50 dark:bg-slate-900 font-mono"
                  />
                </div>
                <div>
                  <label className="block font-semibold mb-1 text-amber-600">
                    Advance Recovery Deduction
                  </label>
                  <input
                    type="number"
                    step="any"
                    min="0"
                    max={editingPayslip.employee?.advance_balance ?? undefined}
                    value={payslipForm.advance_deduction}
                    onChange={(e) =>
                      setPayslipForm((p) => ({ ...p, advance_deduction: e.target.value }))
                    }
                    className="w-full h-9 px-3 rounded-xl border border-slate-300 dark:border-slate-600 bg-slate-50 dark:bg-slate-900 font-mono"
                  />
                </div>
              </div>

              <div>
                <label className="block font-semibold mb-1">Payslip Notes</label>
                <input
                  type="text"
                  value={payslipForm.notes}
                  onChange={(e) => setPayslipForm((p) => ({ ...p, notes: e.target.value }))}
                  className="w-full h-9 px-3 rounded-xl border border-slate-300 dark:border-slate-600 bg-slate-50 dark:bg-slate-900"
                />
              </div>

              <div className="flex items-center justify-end gap-2 pt-3 border-t border-slate-200 dark:border-slate-700">
                <button
                  type="button"
                  onClick={() => setEditingPayslip(null)}
                  className="px-4 py-2 rounded-xl border border-slate-300 dark:border-slate-600 font-semibold cursor-pointer"
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  disabled={savingPayslip}
                  className="px-4 py-2 rounded-xl bg-blue-600 hover:bg-blue-700 text-white font-bold cursor-pointer disabled:opacity-50"
                >
                  {savingPayslip ? "Saving..." : "Update Payslip"}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* MODAL 4: PAY SINGLE PAYSLIP OR PAY ALL RUN */}
      {(payingPayslip || payAllRunModal) && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 backdrop-blur-xs p-4">
          <div className="bg-white dark:bg-slate-800 border border-slate-200 dark:border-slate-700 rounded-2xl max-w-md w-full max-h-[90dvh] overflow-y-auto p-4 sm:p-6 shadow-2xl space-y-4">
            <div className="flex items-center justify-between border-b border-slate-200 dark:border-slate-700 pb-3">
              <h3 className="text-base font-bold text-slate-900 dark:text-white">
                {payingPayslip
                  ? `Disburse Payslip — ${payingPayslip.employee?.name}`
                  : `Disburse All Unpaid Payslips (${payAllRunModal?.period_month})`}
              </h3>
              <button
                type="button"
                onClick={() => {
                  setPayingPayslip(null);
                  setPayAllRunModal(null);
                }}
                className="p-1 rounded-lg text-slate-400 hover:text-slate-600 cursor-pointer"
              >
                <XMarkIcon className="w-5 h-5" />
              </button>
            </div>

            <form
              onSubmit={payingPayslip ? handleConfirmPayPayslip : handleConfirmPayAllRun}
              className="space-y-3 text-xs"
            >
              {payingPayslip && (
                <div className="p-3 rounded-xl bg-emerald-50 dark:bg-emerald-950/40 border border-emerald-200 dark:border-emerald-800 space-y-1">
                  <div className="flex justify-between">
                    <span>Gross Earnings:</span>
                    <strong className="font-mono">{fmtCurrency(payingPayslip.gross_earnings)}</strong>
                  </div>
                  <div className="flex justify-between text-amber-600">
                    <span>Staff Advance Recovery:</span>
                    <strong className="font-mono">-{fmtCurrency(payingPayslip.advance_deduction)}</strong>
                  </div>
                  <div className="flex justify-between text-sm font-bold text-emerald-700 dark:text-emerald-300 pt-1 border-t border-emerald-200 dark:border-emerald-800">
                    <span>Net Salary Payout:</span>
                    <span className="font-mono">{fmtCurrency(payingPayslip.net_payable)}</span>
                  </div>
                </div>
              )}

              <div>
                <label className="block font-semibold mb-1">Disbursement Method</label>
                <select
                  value={payForm.payment_method}
                  onChange={(e) => setPayForm((p) => ({ ...p, payment_method: e.target.value }))}
                  className="w-full h-9 px-3 rounded-xl border border-slate-300 dark:border-slate-600 bg-slate-50 dark:bg-slate-900"
                >
                  <option value="cash">Cash (Deducts from Cash in Hand / Drawer)</option>
                  <option value="bank_transfer">Bank Transfer</option>
                  <option value="wallet">Mobile Wallet</option>
                  <option value="cheque">Cheque</option>
                </select>
              </div>

              <div>
                <label className="block font-semibold mb-1">Treasury Account</label>
                <select
                  value={payForm.account_id}
                  onChange={(e) => setPayForm((p) => ({ ...p, account_id: e.target.value }))}
                  className="w-full h-9 px-3 rounded-xl border border-slate-300 dark:border-slate-600 bg-slate-50 dark:bg-slate-900"
                >
                  <option value="">Default Account</option>
                  {treasuryAccounts.map((acc) => (
                    <option key={acc.id} value={acc.id}>
                      {acc.name} ({fmtCurrency(acc.current_balance)})
                    </option>
                  ))}
                </select>
              </div>

              <div>
                <label className="block font-semibold mb-1">Payment Date</label>
                <input
                  type="date"
                  value={payForm.date}
                  onChange={(e) => setPayForm((p) => ({ ...p, date: e.target.value }))}
                  className="w-full h-9 px-3 rounded-xl border border-slate-300 dark:border-slate-600 bg-slate-50 dark:bg-slate-900 font-mono"
                />
              </div>

              <div className="flex items-center justify-end gap-2 pt-3 border-t border-slate-200 dark:border-slate-700">
                <button
                  type="button"
                  onClick={() => {
                    setPayingPayslip(null);
                    setPayAllRunModal(null);
                  }}
                  className="px-4 py-2 rounded-xl border border-slate-300 dark:border-slate-600 font-semibold cursor-pointer"
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  disabled={processingPayment}
                  className="px-4 py-2 rounded-xl bg-emerald-600 hover:bg-emerald-700 text-white font-bold cursor-pointer disabled:opacity-50"
                >
                  {processingPayment ? "Processing..." : "Confirm & Disburse Salary"}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* MODAL 5: PRINTABLE PAYSLIP VIEW */}
      {printingPayslip && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 backdrop-blur-xs p-4">
          <div className="bg-white text-slate-900 rounded-2xl max-w-xl w-full max-h-[90dvh] overflow-y-auto p-4 sm:p-6 shadow-2xl space-y-4">
            <div className="flex flex-wrap items-center justify-between gap-2 border-b border-slate-200 pb-3 print:hidden">
              <h3 className="text-base font-bold">Employee Payslip ({printingPayslip.period_month})</h3>
              <div className="flex items-center gap-2">
                <button
                  type="button"
                  onClick={() => printCurrentView()}
                  className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-xl bg-blue-600 text-white text-xs font-bold cursor-pointer"
                >
                  <PrinterIcon className="w-4 h-4" />
                  <span>Print Payslip</span>
                </button>
                <button
                  type="button"
                  onClick={() => setPrintingPayslip(null)}
                  className="p-1 rounded-lg text-slate-400 hover:text-slate-600 cursor-pointer"
                >
                  <XMarkIcon className="w-5 h-5" />
                </button>
              </div>
            </div>

            <div className="border border-slate-300 rounded-xl p-4 sm:p-5 space-y-4 text-xs">
              <div className="flex flex-wrap justify-between items-start gap-2 border-b border-slate-200 pb-3">
                <div>
                  <h2 className="text-lg font-extrabold tracking-tight">SALARY & COMMISSION SLIP</h2>
                  <p className="text-slate-500">
                    Payroll Run: <strong>{printingPayslip.run_number}</strong> • Period:{" "}
                    <strong>{printingPayslip.period_month}</strong>
                  </p>
                </div>
                <span
                  className={`px-2.5 py-1 rounded-full text-[11px] font-bold uppercase ${
                    printingPayslip.payment_status === "paid"
                      ? "bg-emerald-100 text-emerald-800"
                      : "bg-amber-100 text-amber-800"
                  }`}
                >
                  {printingPayslip.payment_status}
                </span>
              </div>

              <div className="grid grid-cols-1 sm:grid-cols-2 gap-2 bg-slate-50 p-3 rounded-lg">
                <div>
                  <span className="text-slate-500">Employee:</span>{" "}
                  <strong>{printingPayslip.employee?.name}</strong>
                </div>
                <div>
                  <span className="text-slate-500">Code:</span>{" "}
                  <strong className="font-mono">{printingPayslip.employee?.employee_code}</strong>
                </div>
                <div>
                  <span className="text-slate-500">Designation:</span>{" "}
                  <strong>{printingPayslip.employee?.designation}</strong>
                </div>
                <div>
                  <span className="text-slate-500">Attendance:</span>{" "}
                  <strong>
                    {printingPayslip.present_days} Present / {printingPayslip.absent_days} Absent /{" "}
                    {printingPayslip.overtime_hours}h OT
                  </strong>
                </div>
              </div>

              <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                <div className="space-y-1.5">
                  <div className="font-bold uppercase text-[10px] text-emerald-700 border-b pb-1">
                    Earnings & Incentives
                  </div>
                  <div className="flex justify-between">
                    <span>Basic Salary</span>
                    <span className="font-mono">{fmtCurrency(printingPayslip.basic_salary)}</span>
                  </div>
                  <div className="flex justify-between">
                    <span>Fixed Allowances</span>
                    <span className="font-mono">{fmtCurrency(printingPayslip.allowances)}</span>
                  </div>
                  <div className="flex justify-between">
                    <span>Overtime Pay</span>
                    <span className="font-mono">{fmtCurrency(printingPayslip.overtime_pay)}</span>
                  </div>
                  <div className="flex justify-between">
                    <span>Sales Commission</span>
                    <span className="font-mono">{fmtCurrency(printingPayslip.sales_commission)}</span>
                  </div>
                  <div className="flex justify-between">
                    <span>Target & Special Bonus</span>
                    <span className="font-mono">
                      {fmtCurrency(
                        Number(printingPayslip.target_bonus || 0) +
                          Number(printingPayslip.other_bonus || 0)
                      )}
                    </span>
                  </div>
                  <div className="flex justify-between font-bold border-t pt-1">
                    <span>Gross Earnings</span>
                    <span className="font-mono">{fmtCurrency(printingPayslip.gross_earnings)}</span>
                  </div>
                </div>

                <div className="space-y-1.5">
                  <div className="font-bold uppercase text-[10px] text-rose-700 border-b pb-1">
                    Deductions & Recoveries
                  </div>
                  <div className="flex justify-between">
                    <span>Absence Deduction</span>
                    <span className="font-mono">
                      {fmtCurrency(printingPayslip.absence_deduction)}
                    </span>
                  </div>
                  <div className="flex justify-between">
                    <span>Late / Fine Deduction</span>
                    <span className="font-mono">
                      {fmtCurrency(printingPayslip.late_or_fine_deduction)}
                    </span>
                  </div>
                  <div className="flex justify-between">
                    <span>Advance Loan Recovery</span>
                    <span className="font-mono">
                      {fmtCurrency(printingPayslip.advance_deduction)}
                    </span>
                  </div>
                  <div className="flex justify-between">
                    <span>Other Deduction</span>
                    <span className="font-mono">{fmtCurrency(printingPayslip.other_deduction)}</span>
                  </div>
                  <div className="flex justify-between font-bold border-t pt-1">
                    <span>Total Deductions</span>
                    <span className="font-mono">
                      {fmtCurrency(printingPayslip.total_deductions)}
                    </span>
                  </div>
                </div>
              </div>

              <div className="flex items-center justify-between p-3 rounded-xl bg-slate-900 text-white text-sm font-bold">
                <span>NET TAKE-HOME PAYABLE</span>
                <span className="font-mono text-base">
                  {fmtCurrency(printingPayslip.net_payable)}
                </span>
              </div>

              <div className="grid grid-cols-2 gap-8 pt-6 text-center text-[11px] text-slate-500">
                <div className="border-t border-slate-300 pt-1">Employer / Manager Signature</div>
                <div className="border-t border-slate-300 pt-1">Employee Signature</div>
              </div>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

