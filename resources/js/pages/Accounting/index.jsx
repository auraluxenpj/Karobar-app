import React, { useState, useEffect, useCallback, useMemo } from "react";
import axios from "axios";
import toast from "react-hot-toast";
import Select from "react-select";
import { Link } from "react-router-dom";
import {
  ScaleIcon,
  BookOpenIcon,
  BanknotesIcon,
  DocumentTextIcon,
  PlusIcon,
  ArrowPathIcon,
  ArrowDownTrayIcon,
  PrinterIcon,
  CheckCircleIcon,
  XMarkIcon,
  ArrowUturnLeftIcon,
  ReceiptPercentIcon,
  Squares2X2Icon,
} from "@heroicons/react/24/outline";
import { useTheme } from "@/context/ThemeContext";
import { useCurrency } from "@/context/CurrencyContext";
import { getThemeButtonClasses } from "@/utils/buttonStyles";

const today = () => new Date().toISOString().slice(0, 10);
const monthStart = () => `${today().slice(0, 7)}-01`;

const ACCOUNT_CLASS_OPTIONS = [
  { value: "all", label: "All Account Classes (1000–5000)" },
  { value: "asset", label: "1000 — Assets" },
  { value: "liability", label: "2000 — Liabilities" },
  { value: "equity", label: "3000 — Owner's Equity" },
  { value: "revenue", label: "4000 — Revenue" },
  { value: "expense", label: "5000 — Expenses & COGS" },
];

const NEW_COA_TYPE_OPTIONS = [
  { value: "asset", label: "Asset (1000 Series — Normal Debit)" },
  { value: "liability", label: "Liability (2000 Series — Normal Credit)" },
  { value: "equity", label: "Equity (3000 Series — Normal Credit)" },
  { value: "revenue", label: "Revenue (4000 Series — Normal Credit)" },
  { value: "expense", label: "Expense (5000 Series — Normal Debit)" },
];

const GL_SOURCE_OPTIONS = [
  { value: "all", label: "All Double-Entry Vouchers" },
  { value: "manual", label: "Manual Journal Vouchers (JV) Only" },
  { value: "sale", label: "Sales Auto-Postings" },
  { value: "purchase", label: "Purchase Auto-Postings" },
  { value: "expense", label: "Expense Auto-Postings" },
];

const JV_TYPE_OPTIONS = [
  { value: "manual", label: "General Journal Adjustment (JV)" },
  { value: "capital", label: "Owner Capital Injection" },
  { value: "drawing", label: "Owner Drawing / Distribution" },
  { value: "tax_payment", label: "Statutory Tax / GST Challan Payment" },
  { value: "fixed_asset", label: "Fixed Asset / Store Equipment Purchase" },
  { value: "depreciation", label: "Monthly Depreciation Entry" },
];

const TAX_TYPE_OPTIONS = [
  { value: "both", label: "Sales & Purchases (Both)" },
  { value: "sales", label: "Sales Output Tax Only" },
  { value: "purchase", label: "Purchase Input Tax Only" },
  { value: "withholding", label: "Withholding / Advance Tax (WHT)" },
];

const CLASS_BADGES = {
  asset: "bg-blue-50 text-blue-700 border-blue-200 dark:bg-blue-950/50 dark:text-blue-300 dark:border-blue-800",
  liability: "bg-amber-50 text-amber-700 border-amber-200 dark:bg-amber-950/50 dark:text-amber-300 dark:border-amber-800",
  equity: "bg-purple-50 text-purple-700 border-purple-200 dark:bg-purple-950/50 dark:text-purple-300 dark:border-purple-800",
  revenue: "bg-emerald-50 text-emerald-700 border-emerald-200 dark:bg-emerald-950/50 dark:text-emerald-300 dark:border-emerald-800",
  expense: "bg-rose-50 text-rose-700 border-rose-200 dark:bg-rose-950/50 dark:text-rose-300 dark:border-rose-800",
};

export default function AccountingPage() {
  const { isDark, theme } = useTheme();
  const { formatCurrency } = useCurrency();

  const themeColors = useMemo(
    () => ({
      primary: theme?.primary_color || "#3b82f6",
      primaryHover: theme?.primary_hover || "#2563eb",
      secondary: theme?.secondary_color || "#8b5cf6",
      secondaryHover: theme?.secondary_hover || "#7c3aed",
      tertiary: theme?.tertiary_color || "#06b6d4",
      tertiaryHover: theme?.tertiary_hover || "#0891b2",
      danger: theme?.danger_color || "#ef4444",
      dangerHover: "#dc2626",
    }),
    [theme]
  );

  const buttonClasses = useMemo(
    () => getThemeButtonClasses(theme?.button_style || "modern", themeColors, isDark),
    [theme, themeColors, isDark]
  );

  const selectStyles = useMemo(
    () => ({
      control: (base, state) => ({
        ...base,
        minHeight: "36px",
        borderRadius: "10px",
        fontSize: "12px",
        backgroundColor: isDark ? "#0f172a" : "#ffffff",
        borderColor: state.isFocused ? themeColors.primary : isDark ? "#334155" : "#e2e8f0",
        boxShadow: "none",
      }),
      menu: (base) => ({
        ...base,
        backgroundColor: isDark ? "#1e293b" : "#ffffff",
        borderRadius: "10px",
        zIndex: 9999,
      }),
      menuPortal: (base) => ({ ...base, zIndex: 9999 }),
      option: (base, state) => ({
        ...base,
        fontSize: "12px",
        backgroundColor: state.isSelected
          ? themeColors.primary
          : state.isFocused
          ? isDark
            ? "#334155"
            : "#f1f5f9"
          : "transparent",
        color: state.isSelected ? "#ffffff" : isDark ? "#f1f5f9" : "#0f172a",
        cursor: "pointer",
      }),
      singleValue: (base) => ({
        ...base,
        color: isDark ? "#f1f5f9" : "#0f172a",
      }),
      input: (base) => ({
        ...base,
        color: isDark ? "#f1f5f9" : "#0f172a",
      }),
    }),
    [isDark, themeColors.primary]
  );

  const [activeTab, setActiveTab] = useState("balance_sheet");
  const [from, setFrom] = useState(monthStart());
  const [to, setTo] = useState(today());
  const [classFilter, setClassFilter] = useState(ACCOUNT_CLASS_OPTIONS[0]);
  const [glSourceFilter, setGlSourceFilter] = useState(GL_SOURCE_OPTIONS[0]);
  const [glSearch, setGlSearch] = useState("");
  const [debouncedGlSearch, setDebouncedGlSearch] = useState("");
  const [loading, setLoading] = useState(true);
  const [overview, setOverview] = useState(null);
  const [treasuryAccounts, setTreasuryAccounts] = useState([]);
  const [exportingPdf, setExportingPdf] = useState(false);

  // New Journal Voucher Modal State
  const [jvModalOpen, setJvModalOpen] = useState(false);
  const [jvSaving, setJvSaving] = useState(false);
  const [jvDate, setJvDate] = useState(today());
  const [jvType, setJvType] = useState(JV_TYPE_OPTIONS[0]);
  const [jvRefNumber, setJvRefNumber] = useState("");
  const [jvTreasuryAccount, setJvTreasuryAccount] = useState(null);
  const [jvDescription, setJvDescription] = useState("");
  const [jvLines, setJvLines] = useState([
    { chart_of_account_id: "", description: "", debit: "", credit: "" },
    { chart_of_account_id: "", description: "", debit: "", credit: "" },
  ]);

  // New Chart of Account Form
  const [coaCode, setCoaCode] = useState("");
  const [coaName, setCoaName] = useState("");
  const [coaType, setCoaType] = useState(NEW_COA_TYPE_OPTIONS[0]);
  const [coaOpening, setCoaOpening] = useState("");
  const [coaDesc, setCoaDesc] = useState("");
  const [savingCoa, setSavingCoa] = useState(false);

  // New Tax Rate Form
  const [taxName, setTaxName] = useState("");
  const [taxCode, setTaxCode] = useState("");
  const [taxRateVal, setTaxRateVal] = useState("");
  const [taxTypeOpt, setTaxTypeOpt] = useState(TAX_TYPE_OPTIONS[0]);
  const [savingTax, setSavingTax] = useState(false);

  useEffect(() => {
    const id = setTimeout(() => setDebouncedGlSearch(glSearch), 300);
    return () => clearTimeout(id);
  }, [glSearch]);

  const fetchOverview = useCallback(async () => {
    setLoading(true);
    try {
      const [ovRes, accRes] = await Promise.all([
        axios.get("/api/accounting/overview", {
          params: {
            from,
            to,
            source: glSourceFilter.value,
            q: debouncedGlSearch || undefined,
          },
        }),
        axios.get("/api/accounts?active_only=1").catch(() => ({ data: { accounts: [] } })),
      ]);
      setOverview(ovRes.data);
      const tList = Array.isArray(accRes.data?.accounts) ? accRes.data.accounts : [];
      setTreasuryAccounts(tList);
    } catch (err) {
      toast.error(err?.response?.data?.message || "Failed to load accounting data.");
    } finally {
      setLoading(false);
    }
  }, [from, to, glSourceFilter.value, debouncedGlSearch]);

  useEffect(() => {
    fetchOverview();
  }, [fetchOverview]);

  const coaOptions = useMemo(
    () =>
      (overview?.chart_of_accounts || []).map((a) => ({
        value: a.id,
        label: `${a.code} — ${a.name} (${a.account_type.toUpperCase()})`,
        account: a,
      })),
    [overview?.chart_of_accounts]
  );

  const treasuryOptions = useMemo(
    () => [
      { value: "", label: "No Linked Treasury Account (GL Only)" },
      ...treasuryAccounts.map((a) => ({
        value: a.id,
        label: `${a.name} (${a.type.toUpperCase()} — Bal: ${formatCurrency(a.current_balance)})`,
      })),
    ],
    [treasuryAccounts, formatCurrency]
  );

  const filteredTrialBalanceRows = useMemo(() => {
    const rows = overview?.trial_balance?.rows || [];
    if (classFilter.value === "all") return rows;
    return rows.filter((r) => r.account_type === classFilter.value);
  }, [overview?.trial_balance?.rows, classFilter.value]);

  const jvTotals = useMemo(() => {
    const debit = jvLines.reduce((s, l) => s + (parseFloat(l.debit) || 0), 0);
    const credit = jvLines.reduce((s, l) => s + (parseFloat(l.credit) || 0), 0);
    const diff = Math.abs(debit - credit);
    return {
      debit: Math.round(debit * 100) / 100,
      credit: Math.round(credit * 100) / 100,
      diff: Math.round(diff * 100) / 100,
      balanced: debit > 0 && diff < 0.01,
    };
  }, [jvLines]);

  const applyQuickJvTemplate = (presetType) => {
    const coas = overview?.chart_of_accounts || [];
    const findByKey = (k) => coas.find((c) => c.system_key === k)?.id || "";
    const cashId = findByKey("cash_and_banks");
    const capId = findByKey("owners_capital");
    const drawId = findByKey("owners_drawings");
    const taxOutId = findByKey("output_tax_payable");
    const fixedId = findByKey("fixed_assets");
    const depId = findByKey("depreciation_expense");

    const opt = JV_TYPE_OPTIONS.find((o) => o.value === presetType) || JV_TYPE_OPTIONS[0];
    setJvType(opt);

    if (presetType === "capital") {
      setJvDescription("Owner capital contribution deposited into business");
      setJvLines([
        { chart_of_account_id: cashId, description: "Cash / Bank deposit received", debit: "", credit: "" },
        { chart_of_account_id: capId, description: "Owner's Capital credited", debit: "", credit: "" },
      ]);
    } else if (presetType === "drawing") {
      setJvDescription("Owner personal withdrawal / profit distribution");
      setJvLines([
        { chart_of_account_id: drawId, description: "Owner's Drawings debited", debit: "", credit: "" },
        { chart_of_account_id: cashId, description: "Cash / Bank paid out", debit: "", credit: "" },
      ]);
    } else if (presetType === "tax_payment") {
      setJvDescription("Statutory Sales Tax / GST Challan paid to Tax Authority");
      setJvLines([
        { chart_of_account_id: taxOutId, description: "Output Tax Payable settled", debit: "", credit: "" },
        { chart_of_account_id: cashId, description: "Paid via Bank / Cash", debit: "", credit: "" },
      ]);
    } else if (presetType === "fixed_asset") {
      setJvDescription("Purchase of store equipment / fixtures");
      setJvLines([
        { chart_of_account_id: fixedId, description: "Store Equipment capitalized", debit: "", credit: "" },
        { chart_of_account_id: cashId, description: "Paid via Bank / Cash", debit: "", credit: "" },
      ]);
    } else if (presetType === "depreciation") {
      setJvDescription("Monthly depreciation of store equipment and fixtures");
      setJvLines([
        { chart_of_account_id: depId, description: "Monthly depreciation expense", debit: "", credit: "" },
        { chart_of_account_id: fixedId, description: "Accumulated depreciation write-down", debit: "", credit: "" },
      ]);
    }
  };

  const handleCreateJv = async (e) => {
    e.preventDefault();
    if (!jvTotals.balanced) {
      toast.error("Journal Voucher must be balanced (Total Debit = Total Credit).");
      return;
    }
    setJvSaving(true);
    try {
      await axios.post("/api/accounting/journal-entries", {
        entry_date: jvDate,
        reference_type: jvType.value,
        reference_number: jvRefNumber || null,
        account_id: jvTreasuryAccount?.value || null,
        description: jvDescription || jvType.label,
        lines: jvLines
          .filter((l) => l.chart_of_account_id && (parseFloat(l.debit) > 0 || parseFloat(l.credit) > 0))
          .map((l) => ({
            chart_of_account_id: Number(l.chart_of_account_id),
            description: l.description || null,
            debit: parseFloat(l.debit) || 0,
            credit: parseFloat(l.credit) || 0,
          })),
      });
      toast.success("Double-Entry Journal Voucher posted!");
      setJvModalOpen(false);
      setJvRefNumber("");
      setJvDescription("");
      setJvLines([
        { chart_of_account_id: "", description: "", debit: "", credit: "" },
        { chart_of_account_id: "", description: "", debit: "", credit: "" },
      ]);
      fetchOverview();
    } catch (err) {
      toast.error(err?.response?.data?.message || "Failed to post Journal Voucher.");
    } finally {
      setJvSaving(false);
    }
  };

  const handleReverseJv = async (rawId, entryNumber) => {
    const reason = window.prompt(`Enter reason for reversing Journal Voucher ${entryNumber}:`);
    if (!reason || reason.trim().length < 3) return;
    try {
      await axios.post(`/api/accounting/journal-entries/${rawId}/reverse`, { reason });
      toast.success(`Reversed ${entryNumber}`);
      fetchOverview();
    } catch (err) {
      toast.error(err?.response?.data?.message || "Failed to reverse voucher.");
    }
  };

  const handleCreateCoa = async (e) => {
    e.preventDefault();
    if (!coaCode.trim() || !coaName.trim()) {
      toast.error("Account code and name are required.");
      return;
    }
    setSavingCoa(true);
    try {
      await axios.post("/api/accounting/chart-of-accounts", {
        code: coaCode.trim(),
        name: coaName.trim(),
        account_type: coaType.value,
        opening_balance: parseFloat(coaOpening) || 0,
        description: coaDesc.trim() || null,
      });
      toast.success("Account added to Chart of Accounts!");
      setCoaCode("");
      setCoaName("");
      setCoaOpening("");
      setCoaDesc("");
      fetchOverview();
    } catch (err) {
      toast.error(err?.response?.data?.message || "Failed to create account.");
    } finally {
      setSavingCoa(false);
    }
  };

  const handleCreateTaxRate = async (e) => {
    e.preventDefault();
    if (!taxName.trim() || !taxCode.trim()) {
      toast.error("Tax name and code are required.");
      return;
    }
    setSavingTax(true);
    try {
      await axios.post("/api/accounting/tax-rates", {
        name: taxName.trim(),
        code: taxCode.trim(),
        rate: parseFloat(taxRateVal) || 0,
        type: taxTypeOpt.value,
      });
      toast.success("Statutory Tax Rate saved!");
      setTaxName("");
      setTaxCode("");
      setTaxRateVal("");
      fetchOverview();
    } catch (err) {
      toast.error(err?.response?.data?.message || "Failed to save tax rate.");
    } finally {
      setSavingTax(false);
    }
  };

  const handleExportPdf = async () => {
    setExportingPdf(true);
    try {
      const res = await axios.get("/api/reports/financial-statements/pdf", {
        params: { from, to, download: 1 },
        responseType: "blob",
      });
      const url = URL.createObjectURL(new Blob([res.data], { type: "application/pdf" }));
      const a = document.createElement("a");
      a.href = url;
      a.download = `financial-statements-${from}-to-${to}.pdf`;
      a.click();
      setTimeout(() => URL.revokeObjectURL(url), 5000);
      toast.success("Downloaded Financial Statements PDF");
    } catch {
      toast.error("Failed to generate PDF");
    } finally {
      setExportingPdf(false);
    }
  };

  const bs = overview?.balance_sheet;
  const tb = overview?.trial_balance;
  const cf = overview?.cash_flow;
  const gl = overview?.general_ledger;

  return (
    <div className="w-full max-w-full space-y-5 pb-16">
      {/* Header */}
      <div className="flex flex-col lg:flex-row lg:items-center justify-between gap-3">
        <div>
          <h1 className="text-xl sm:text-2xl font-bold text-gray-900 dark:text-white flex items-center gap-2.5">
            <ScaleIcon className="w-7 h-7 text-blue-600 dark:text-blue-400 shrink-0" />
            <span>Double-Entry Accounting & Financial Statements</span>
          </h1>
          <p className="text-xs sm:text-sm text-gray-500 dark:text-slate-400 mt-0.5">
            IFRS/GAAP 5-Class Chart of Accounts, Balance Sheet, Trial Balance, Cash Flow, and Balanced Journal Vouchers
          </p>
        </div>

        <div className="flex flex-wrap items-center gap-2">
          <Link
            to="/reports/tax-return"
            className="inline-flex items-center gap-1.5 px-3.5 py-2 rounded-xl text-xs font-semibold bg-emerald-50 text-emerald-700 border border-emerald-200 hover:bg-emerald-100 dark:bg-emerald-950/50 dark:text-emerald-300 dark:border-emerald-800"
          >
            <ReceiptPercentIcon className="w-4 h-4" />
            <span>Statutory Tax Return</span>
          </Link>
          <button
            type="button"
            onClick={handleExportPdf}
            disabled={exportingPdf || loading}
            className={`inline-flex items-center gap-1.5 px-3.5 py-2 text-xs font-semibold ${buttonClasses.secondary.className}`}
            style={buttonClasses.secondary.style}
          >
            <ArrowDownTrayIcon className="w-4 h-4" />
            <span>{exportingPdf ? "Exporting…" : "Export Statements PDF"}</span>
          </button>
          <button
            type="button"
            onClick={() => window.print()}
            className={`inline-flex items-center gap-1.5 px-3.5 py-2 text-xs font-semibold ${buttonClasses.secondary.className}`}
            style={buttonClasses.secondary.style}
          >
            <PrinterIcon className="w-4 h-4" />
            <span>Print</span>
          </button>
          <button
            type="button"
            onClick={() => setJvModalOpen(true)}
            className={`inline-flex items-center gap-1.5 px-4 py-2 text-xs font-semibold ${buttonClasses.primary.className}`}
            style={buttonClasses.primary.style}
          >
            <PlusIcon className="w-4 h-4" />
            <span>New Journal Voucher (JV)</span>
          </button>
        </div>
      </div>

      {/* Executive KPI Strip */}
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-3.5">
        <div className="p-4 rounded-2xl bg-white/80 dark:bg-slate-900/80 border border-gray-200/80 dark:border-slate-800 shadow-xs">
          <div className="flex items-center justify-between text-xs font-semibold text-gray-500 dark:text-slate-400 uppercase">
            <span>Total Assets</span>
            {bs?.is_balanced && (
              <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-[10px] font-bold bg-emerald-100 text-emerald-700 dark:bg-emerald-950/70 dark:text-emerald-300">
                <CheckCircleIcon className="w-3.5 h-3.5" /> Balanced
              </span>
            )}
          </div>
          <div className="text-xl font-black text-gray-900 dark:text-white mt-1.5 font-mono">
            {formatCurrency(bs?.total_assets || 0)}
          </div>
          <div className="text-[11px] text-gray-500 dark:text-slate-400 mt-1">
            Liabilities: {formatCurrency(bs?.total_liabilities || 0)} • Equity: {formatCurrency(bs?.total_equity || 0)}
          </div>
        </div>

        <div className="p-4 rounded-2xl bg-white/80 dark:bg-slate-900/80 border border-gray-200/80 dark:border-slate-800 shadow-xs">
          <div className="flex items-center justify-between text-xs font-semibold text-gray-500 dark:text-slate-400 uppercase">
            <span>Trial Balance (Dr = Cr)</span>
            <span className="font-mono text-emerald-600 dark:text-emerald-400">
              {tb?.is_balanced ? "∑ Dr = ∑ Cr" : `Diff: ${tb?.difference}`}
            </span>
          </div>
          <div className="text-xl font-black text-blue-600 dark:text-blue-400 mt-1.5 font-mono">
            {formatCurrency(tb?.total_debit || 0)}
          </div>
          <div className="text-[11px] text-gray-500 dark:text-slate-400 mt-1">
            Total Credits: {formatCurrency(tb?.total_credit || 0)}
          </div>
        </div>

        <div className="p-4 rounded-2xl bg-white/80 dark:bg-slate-900/80 border border-gray-200/80 dark:border-slate-800 shadow-xs">
          <div className="text-xs font-semibold text-gray-500 dark:text-slate-400 uppercase">
            Operating Cash Flow
          </div>
          <div className="text-xl font-black text-emerald-600 dark:text-emerald-400 mt-1.5 font-mono">
            {formatCurrency(cf?.operating?.net_operating_cash_flow || 0)}
          </div>
          <div className="text-[11px] text-gray-500 dark:text-slate-400 mt-1">
            Closing Cash & Bank: {formatCurrency(cf?.closing_cash_and_bank || 0)}
          </div>
        </div>

        <div className="p-4 rounded-2xl bg-white/80 dark:bg-slate-900/80 border border-gray-200/80 dark:border-slate-800 shadow-xs">
          <div className="text-xs font-semibold text-gray-500 dark:text-slate-400 uppercase">
            YTD Net Income (Retained)
          </div>
          <div
            className={`text-xl font-black mt-1.5 font-mono ${
              (bs?.period_net_income || 0) >= 0
                ? "text-emerald-600 dark:text-emerald-400"
                : "text-rose-600 dark:text-rose-400"
            }`}
          >
            {formatCurrency(bs?.period_net_income || 0)}
          </div>
          <div className="text-[11px] text-gray-500 dark:text-slate-400 mt-1">
            Auto-rolled into Equity (Account 3300)
          </div>
        </div>
      </div>

      {/* Tabs + Period Filter Bar */}
      <div className="p-3.5 rounded-2xl bg-white/80 dark:bg-slate-900/80 border border-gray-200/80 dark:border-slate-800 flex flex-wrap items-center justify-between gap-3">
        <div className="flex items-center gap-1.5 overflow-x-auto no-scrollbar pb-1 w-full lg:w-auto">
          {[
            { id: "balance_sheet", label: "Balance Sheet", icon: ScaleIcon },
            { id: "trial_balance", label: "Trial Balance", icon: BookOpenIcon },
            { id: "general_ledger", label: "General Ledger & JVs", icon: DocumentTextIcon },
            { id: "cash_flow", label: "Cash Flow Statement", icon: BanknotesIcon },
            { id: "coa_tax", label: "Chart of Accounts & Tax Rates", icon: Squares2X2Icon },
          ].map((tab) => {
            const Icon = tab.icon;
            const active = activeTab === tab.id;
            return (
              <button
                key={tab.id}
                type="button"
                onClick={() => setActiveTab(tab.id)}
                className={`inline-flex items-center gap-1.5 px-3.5 py-2 rounded-xl text-xs font-semibold shrink-0 whitespace-nowrap transition-all cursor-pointer ${
                  active
                    ? "bg-blue-600 text-white shadow-xs"
                    : "text-gray-600 dark:text-slate-300 hover:bg-gray-100 dark:hover:bg-slate-800"
                }`}
              >
                <Icon className="w-4 h-4 shrink-0" />
                <span>{tab.label}</span>
              </button>
            );
          })}
        </div>

        <div className="flex flex-wrap items-center gap-2">
          <span className="text-xs font-medium text-gray-500 dark:text-slate-400">Period:</span>
          <input
            type="date"
            value={from}
            onChange={(e) => setFrom(e.target.value)}
            className="h-9 px-2.5 text-xs rounded-xl border border-gray-200 dark:border-slate-700 bg-white dark:bg-slate-800 text-gray-900 dark:text-white"
          />
          <span className="text-xs text-gray-400">to</span>
          <input
            type="date"
            value={to}
            onChange={(e) => setTo(e.target.value)}
            className="h-9 px-2.5 text-xs rounded-xl border border-gray-200 dark:border-slate-700 bg-white dark:bg-slate-800 text-gray-900 dark:text-white"
          />
          <button
            type="button"
            onClick={fetchOverview}
            className="p-2 rounded-xl border border-gray-200 dark:border-slate-700 hover:bg-gray-100 dark:hover:bg-slate-800 text-gray-600 dark:text-slate-300"
            title="Refresh"
          >
            <ArrowPathIcon className={`w-4 h-4 ${loading ? "animate-spin" : ""}`} />
          </button>
        </div>
      </div>

      {/* TAB 1: BALANCE SHEET */}
      {activeTab === "balance_sheet" && bs && (
        <div className="grid grid-cols-1 lg:grid-cols-2 gap-5">
          {/* Assets Column */}
          <div className="rounded-2xl bg-white/85 dark:bg-slate-900/85 border border-gray-200/80 dark:border-slate-800 overflow-hidden shadow-xs flex flex-col justify-between">
            <div>
              <div className="px-5 py-3.5 border-b border-gray-200/70 dark:border-slate-800 bg-blue-50/60 dark:bg-blue-950/30 flex items-center justify-between">
                <div>
                  <h2 className="text-sm font-bold uppercase tracking-wider text-blue-900 dark:text-blue-200">
                    Assets (1000 Series)
                  </h2>
                  <p className="text-[11px] text-gray-500 dark:text-slate-400">
                    As of {bs.as_of}
                  </p>
                </div>
                <span className="text-sm font-black font-mono text-blue-700 dark:text-blue-300">
                  {formatCurrency(bs.total_assets)}
                </span>
              </div>

              <div className="divide-y divide-gray-100 dark:divide-slate-800/80">
                {bs.assets.map((row) => (
                  <div key={row.id} className="px-5 py-3">
                    <div className="flex items-center justify-between gap-2">
                      <div className="flex items-center gap-2.5 min-w-0">
                        <span className="px-2 py-0.5 rounded-md text-[11px] font-mono font-bold shrink-0 bg-gray-100 dark:bg-slate-800 text-gray-700 dark:text-slate-300">
                          {row.code}
                        </span>
                        <span className="text-xs sm:text-sm font-medium truncate text-gray-900 dark:text-white">
                          {row.name}
                        </span>
                      </div>
                      <span className="text-xs sm:text-sm font-bold font-mono shrink-0 text-gray-900 dark:text-white">
                        {formatCurrency(row.amount)}
                      </span>
                    </div>

                    {row.sub_accounts?.length > 0 && (
                      <div className="mt-2 ml-4 sm:ml-9 pl-2 sm:pl-3 border-l-2 border-blue-200 dark:border-blue-800 space-y-1">
                        {row.sub_accounts.map((sub) => (
                          <div
                            key={sub.id}
                            className="flex items-center justify-between gap-2 text-xs text-gray-500 dark:text-slate-400"
                          >
                            <span className="min-w-0 truncate">
                              {sub.name} ({sub.type.toUpperCase()})
                            </span>
                            <span className="font-mono shrink-0">{formatCurrency(sub.balance)}</span>
                          </div>
                        ))}
                      </div>
                    )}
                  </div>
                ))}
              </div>
            </div>

            <div className="px-5 py-3.5 bg-blue-50/80 dark:bg-blue-950/40 border-t border-blue-200/60 dark:border-blue-900/50 flex items-center justify-between font-bold text-sm text-blue-950 dark:text-blue-100">
              <span>TOTAL ASSETS</span>
              <span className="font-mono text-base">{formatCurrency(bs.total_assets)}</span>
            </div>
          </div>

          {/* Liabilities & Owner's Equity Column */}
          <div className="rounded-2xl bg-white/85 dark:bg-slate-900/85 border border-gray-200/80 dark:border-slate-800 overflow-hidden shadow-xs flex flex-col justify-between">
            <div>
              {/* Liabilities */}
              <div className="px-5 py-3.5 border-b border-gray-200/70 dark:border-slate-800 bg-amber-50/60 dark:bg-amber-950/30 flex items-center justify-between">
                <div>
                  <h2 className="text-sm font-bold uppercase tracking-wider text-amber-900 dark:text-amber-200">
                    Liabilities (2000 Series)
                  </h2>
                  <p className="text-[11px] text-gray-500 dark:text-slate-400">
                    Payables & Tax Obligations
                  </p>
                </div>
                <span className="text-sm font-black font-mono text-amber-700 dark:text-amber-300">
                  {formatCurrency(bs.total_liabilities)}
                </span>
              </div>

              <div className="divide-y divide-gray-100 dark:divide-slate-800/80">
                {bs.liabilities.map((row) => (
                  <div key={row.id} className="px-5 py-3 flex items-center justify-between gap-2">
                    <div className="flex items-center gap-2.5 min-w-0">
                      <span className="px-2 py-0.5 rounded-md text-[11px] font-mono font-bold shrink-0 bg-gray-100 dark:bg-slate-800 text-gray-700 dark:text-slate-300">
                        {row.code}
                      </span>
                      <span className="text-xs sm:text-sm font-medium truncate text-gray-900 dark:text-white">
                        {row.name}
                      </span>
                    </div>
                    <span className="text-xs sm:text-sm font-bold font-mono shrink-0 text-gray-900 dark:text-white">
                      {formatCurrency(row.amount)}
                    </span>
                  </div>
                ))}
              </div>

              {/* Owner's Equity */}
              <div className="px-5 py-3.5 border-y border-gray-200/70 dark:border-slate-800 bg-purple-50/60 dark:bg-purple-950/30 flex items-center justify-between mt-2">
                <div>
                  <h2 className="text-sm font-bold uppercase tracking-wider text-purple-900 dark:text-purple-200">
                    Owner's Equity (3000 Series)
                  </h2>
                  <p className="text-[11px] text-gray-500 dark:text-slate-400">
                    Capital, Drawings & Retained Earnings
                  </p>
                </div>
                <span className="text-sm font-black font-mono text-purple-700 dark:text-purple-300">
                  {formatCurrency(bs.total_equity)}
                </span>
              </div>

              <div className="divide-y divide-gray-100 dark:divide-slate-800/80">
                {bs.equity.map((row) => (
                  <div key={row.id} className="px-5 py-3 flex items-center justify-between gap-2">
                    <div className="flex items-center gap-2.5 min-w-0">
                      <span className="px-2 py-0.5 rounded-md text-[11px] font-mono font-bold shrink-0 bg-gray-100 dark:bg-slate-800 text-gray-700 dark:text-slate-300">
                        {row.code}
                      </span>
                      <div className="min-w-0">
                        <span className="text-xs sm:text-sm font-medium block truncate text-gray-900 dark:text-white">
                          {row.name}
                        </span>
                        {row.includes_net_income !== undefined && (
                          <div className="text-[11px] text-emerald-600 dark:text-emerald-400">
                            Includes YTD Net Profit: {formatCurrency(row.includes_net_income)}
                          </div>
                        )}
                      </div>
                    </div>
                    <span className="text-xs sm:text-sm font-bold font-mono shrink-0 text-gray-900 dark:text-white">
                      {formatCurrency(row.amount)}
                    </span>
                  </div>
                ))}
              </div>
            </div>

            <div className="px-5 py-3.5 bg-emerald-50/80 dark:bg-emerald-950/40 border-t border-emerald-200/60 dark:border-emerald-900/50 flex items-center justify-between font-bold text-sm text-emerald-950 dark:text-emerald-100">
              <span>TOTAL LIABILITIES + EQUITY</span>
              <span className="font-mono text-base">{formatCurrency(bs.total_liabilities_and_equity)}</span>
            </div>
          </div>
        </div>
      )}

      {/* TAB 2: TRIAL BALANCE */}
      {activeTab === "trial_balance" && tb && (
        <div className="rounded-2xl bg-white/85 dark:bg-slate-900/85 border border-gray-200/80 dark:border-slate-800 overflow-hidden shadow-xs">
          <div className="p-4 border-b border-gray-200/70 dark:border-slate-800 flex flex-wrap items-center justify-between gap-3">
            <div>
              <h2 className="text-sm font-bold text-gray-900 dark:text-white">
                Double-Entry Trial Balance ({tb.period.from} to {tb.period.to})
              </h2>
              <p className="text-xs text-gray-500 dark:text-slate-400">
                Every debit and credit balance across Assets, Liabilities, Equity, Revenue, and Expenses
              </p>
            </div>
            <div className="w-full sm:w-64">
              <Select
                options={ACCOUNT_CLASS_OPTIONS}
                value={classFilter}
                onChange={(opt) => opt && setClassFilter(opt)}
                styles={selectStyles}
                isSearchable={false}
                menuPortalTarget={typeof document !== "undefined" ? document.body : null}
              />
            </div>
          </div>

          <div className="overflow-x-auto">
            <table className="w-full text-left border-collapse min-w-[560px]">
              <thead>
                <tr className="bg-gray-50/80 dark:bg-slate-800/60 border-b border-gray-200/70 dark:border-slate-800 text-[11px] font-bold uppercase text-gray-500 dark:text-slate-400">
                  <th className="py-3 px-4">Code</th>
                  <th className="py-3 px-4">Account Title</th>
                  <th className="py-3 px-4">Class</th>
                  <th className="py-3 px-4 text-right">Debit (Dr)</th>
                  <th className="py-3 px-4 text-right">Credit (Cr)</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-gray-100 dark:divide-slate-800 text-xs sm:text-sm">
                {filteredTrialBalanceRows.map((row) => (
                  <tr key={row.id} className="hover:bg-gray-50/60 dark:hover:bg-slate-800/40">
                    <td className="py-3 px-4 font-mono font-bold text-gray-700 dark:text-slate-300">
                      {row.code}
                    </td>
                    <td className="py-3 px-4 font-medium text-gray-900 dark:text-white">
                      {row.name}
                    </td>
                    <td className="py-3 px-4">
                      <span
                        className={`inline-flex px-2 py-0.5 rounded-md text-[10px] font-bold uppercase border ${
                          CLASS_BADGES[row.account_type] || ""
                        }`}
                      >
                        {row.account_type}
                      </span>
                    </td>
                    <td className="py-3 px-4 text-right font-mono font-semibold text-gray-900 dark:text-white">
                      {row.debit > 0 ? formatCurrency(row.debit) : "—"}
                    </td>
                    <td className="py-3 px-4 text-right font-mono font-semibold text-gray-900 dark:text-white">
                      {row.credit > 0 ? formatCurrency(row.credit) : "—"}
                    </td>
                  </tr>
                ))}
              </tbody>
              <tfoot>
                <tr className="bg-slate-900 text-white font-bold text-xs sm:text-sm">
                  <td colSpan={3} className="py-3.5 px-4">
                    TOTAL TRIAL BALANCE ({tb.is_balanced ? "BALANCED: ∑ DEBITS = ∑ CREDITS" : "UNBALANCED"})
                  </td>
                  <td className="py-3.5 px-4 text-right font-mono">{formatCurrency(tb.total_debit)}</td>
                  <td className="py-3.5 px-4 text-right font-mono">{formatCurrency(tb.total_credit)}</td>
                </tr>
              </tfoot>
            </table>
          </div>
        </div>
      )}

      {/* TAB 3: GENERAL LEDGER & JOURNAL VOUCHERS */}
      {activeTab === "general_ledger" && gl && (
        <div className="space-y-4">
          <div className="p-4 rounded-2xl bg-white/85 dark:bg-slate-900/85 border border-gray-200/80 dark:border-slate-800 flex flex-wrap items-center justify-between gap-3">
            <div className="flex flex-wrap items-center gap-3 flex-1 w-full sm:w-auto">
              <div className="w-full sm:w-72">
                <Select
                  options={GL_SOURCE_OPTIONS}
                  value={glSourceFilter}
                  onChange={(opt) => opt && setGlSourceFilter(opt)}
                  styles={selectStyles}
                  isSearchable={false}
                  menuPortalTarget={typeof document !== "undefined" ? document.body : null}
                />
              </div>
              <input
                type="text"
                value={glSearch}
                onChange={(e) => setGlSearch(e.target.value)}
                placeholder="Search voucher #, reference, description…"
                className="h-9 px-3 text-xs rounded-xl border border-gray-200 dark:border-slate-700 bg-white dark:bg-slate-800 text-gray-900 dark:text-white w-full sm:w-64"
              />
            </div>
            <div className="text-xs text-gray-500 dark:text-slate-400">
              Showing <strong>{gl.entries?.length || 0}</strong> balanced double-entry vouchers
            </div>
          </div>

          <div className="space-y-3">
            {(gl.entries || []).map((entry) => (
              <div
                key={entry.id}
                className={`rounded-2xl bg-white/85 dark:bg-slate-900/85 border border-gray-200/80 dark:border-slate-800 overflow-hidden shadow-xs ${
                  entry.status === "reversed" ? "opacity-60" : ""
                }`}
              >
                <div className="px-4 py-3 bg-gray-50/80 dark:bg-slate-800/60 border-b border-gray-200/60 dark:border-slate-800 flex flex-wrap items-center justify-between gap-2">
                  <div className="flex flex-wrap items-center gap-2.5">
                    <span className="font-mono text-xs font-bold text-blue-600 dark:text-blue-400">
                      {entry.entry_number}
                    </span>
                    <span className="px-2 py-0.5 rounded-md text-[10px] font-bold uppercase bg-blue-50 text-blue-700 dark:bg-blue-950/60 dark:text-blue-300">
                      {entry.source_label}
                    </span>
                    <span className="text-xs text-gray-500 dark:text-slate-400">{entry.entry_date}</span>
                    <span className="text-xs font-medium text-gray-900 dark:text-white">
                      {entry.description}
                    </span>
                  </div>

                  <div className="flex items-center gap-3">
                    <span className="text-xs font-mono font-bold text-gray-700 dark:text-slate-200">
                      Dr/Cr: {formatCurrency(entry.total_debit)}
                    </span>
                    {entry.is_manual && entry.status === "posted" && (
                      <button
                        type="button"
                        onClick={() => handleReverseJv(entry.raw_id, entry.entry_number)}
                        className="inline-flex items-center gap-1 px-2.5 py-1 rounded-lg text-[11px] font-semibold text-rose-600 hover:bg-rose-50 dark:text-rose-400 dark:hover:bg-rose-950/50 cursor-pointer"
                      >
                        <ArrowUturnLeftIcon className="w-3.5 h-3.5" />
                        <span>Reverse JV</span>
                      </button>
                    )}
                    {entry.status === "reversed" && (
                      <span className="px-2 py-0.5 rounded-md text-[10px] font-bold uppercase bg-rose-100 text-rose-700">
                        REVERSED
                      </span>
                    )}
                  </div>
                </div>

                <div className="overflow-x-auto">
                  <table className="w-full text-xs border-collapse min-w-[540px]">
                    <thead>
                      <tr className="text-[10px] uppercase text-gray-400 dark:text-slate-500 border-b border-gray-100 dark:border-slate-800/60">
                        <th className="py-2 px-4 text-left w-24">Code</th>
                        <th className="py-2 px-4 text-left">Account</th>
                        <th className="py-2 px-4 text-left">Line Narration</th>
                        <th className="py-2 px-4 text-right w-36">Debit (Dr)</th>
                        <th className="py-2 px-4 text-right w-36">Credit (Cr)</th>
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-gray-100 dark:divide-slate-800/40">
                      {(entry.lines || []).map((line, i) => (
                        <tr key={i}>
                          <td className="py-2 px-4 font-mono font-bold text-gray-600 dark:text-slate-400">
                            {line.account_code}
                          </td>
                          <td className="py-2 px-4 font-medium text-gray-900 dark:text-white">
                            {line.account_name}
                          </td>
                          <td className="py-2 px-4 text-gray-500 dark:text-slate-400">
                            {line.description || "—"}
                          </td>
                          <td className="py-2 px-4 text-right font-mono text-gray-900 dark:text-white">
                            {line.debit > 0 ? formatCurrency(line.debit) : "—"}
                          </td>
                          <td className="py-2 px-4 text-right font-mono text-gray-900 dark:text-white">
                            {line.credit > 0 ? formatCurrency(line.credit) : "—"}
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              </div>
            ))}
          </div>
        </div>
      )}

      {/* TAB 4: CASH FLOW STATEMENT */}
      {activeTab === "cash_flow" && cf && (
        <div className="rounded-2xl bg-white/85 dark:bg-slate-900/85 border border-gray-200/80 dark:border-slate-800 overflow-hidden shadow-xs p-5 space-y-5">
          <div className="flex items-center justify-between border-b border-gray-200/70 dark:border-slate-800 pb-3">
            <div>
              <h2 className="text-base font-bold text-gray-900 dark:text-white">
                Statement of Cash Flows ({cf.period.from} to {cf.period.to})
              </h2>
              <p className="text-xs text-gray-500 dark:text-slate-400">
                Operating, Investing, and Financing cash movements reconciled with Treasury
              </p>
            </div>
            <div className="text-right">
              <div className="text-[11px] uppercase text-gray-400 font-bold">Closing Cash & Bank</div>
              <div className="text-lg font-black font-mono text-blue-600 dark:text-blue-400">
                {formatCurrency(cf.closing_cash_and_bank)}
              </div>
            </div>
          </div>

          <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
            <div className="p-4 rounded-xl border border-gray-200/70 dark:border-slate-800 space-y-2.5">
              <div className="text-xs font-bold uppercase text-emerald-700 dark:text-emerald-400">
                1. Operating Cash Flows
              </div>
              <div className="flex justify-between text-xs">
                <span>Cash Received on Sales</span>
                <span className="font-mono font-semibold text-emerald-600">
                  +{formatCurrency(cf.operating.cash_from_sales)}
                </span>
              </div>
              <div className="flex justify-between text-xs">
                <span>Customer Payment Vouchers</span>
                <span className="font-mono font-semibold text-emerald-600">
                  +{formatCurrency(cf.operating.customer_payment_vouchers)}
                </span>
              </div>
              <div className="flex justify-between text-xs">
                <span>Purchase Return Refunds</span>
                <span className="font-mono font-semibold text-emerald-600">
                  +{formatCurrency(cf.operating.purchase_return_refunds)}
                </span>
              </div>
              <div className="flex justify-between text-xs">
                <span>Cash Paid on Purchases</span>
                <span className="font-mono font-semibold text-rose-600">
                  -{formatCurrency(cf.operating.cash_paid_for_purchases)}
                </span>
              </div>
              <div className="flex justify-between text-xs">
                <span>Supplier Payment Vouchers</span>
                <span className="font-mono font-semibold text-rose-600">
                  -{formatCurrency(cf.operating.supplier_payment_vouchers)}
                </span>
              </div>
              <div className="flex justify-between text-xs">
                <span>Operating Expenses Paid</span>
                <span className="font-mono font-semibold text-rose-600">
                  -{formatCurrency(cf.operating.operating_expenses_paid)}
                </span>
              </div>
              <div className="pt-2 border-t border-gray-200 dark:border-slate-700 flex justify-between text-xs font-bold">
                <span>Net Operating Cash Flow</span>
                <span className="font-mono">{formatCurrency(cf.operating.net_operating_cash_flow)}</span>
              </div>
            </div>

            <div className="p-4 rounded-xl border border-gray-200/70 dark:border-slate-800 space-y-2.5 flex flex-col justify-between">
              <div className="space-y-2.5">
                <div className="text-xs font-bold uppercase text-blue-700 dark:text-blue-400">
                  2. Investing Cash Flows
                </div>
                <div className="flex justify-between text-xs">
                  <span>Fixed Asset Acquisitions (1600)</span>
                  <span className="font-mono font-semibold">
                    {formatCurrency(-cf.investing.fixed_asset_acquisitions)}
                  </span>
                </div>
              </div>
              <div className="pt-2 border-t border-gray-200 dark:border-slate-700 flex justify-between text-xs font-bold">
                <span>Net Investing Cash Flow</span>
                <span className="font-mono">{formatCurrency(cf.investing.net_investing_cash_flow)}</span>
              </div>
            </div>

            <div className="p-4 rounded-xl border border-gray-200/70 dark:border-slate-800 space-y-2.5 flex flex-col justify-between">
              <div className="space-y-2.5">
                <div className="text-xs font-bold uppercase text-purple-700 dark:text-purple-400">
                  3. Financing Cash Flows
                </div>
                <div className="flex justify-between text-xs">
                  <span>Owner Capital Injections (3100)</span>
                  <span className="font-mono font-semibold text-emerald-600">
                    +{formatCurrency(cf.financing.owner_capital_contributions)}
                  </span>
                </div>
                <div className="flex justify-between text-xs">
                  <span>Owner Drawings (3200)</span>
                  <span className="font-mono font-semibold text-rose-600">
                    -{formatCurrency(cf.financing.owner_drawings)}
                  </span>
                </div>
              </div>
              <div className="pt-2 border-t border-gray-200 dark:border-slate-700 flex justify-between text-xs font-bold">
                <span>Net Financing Cash Flow</span>
                <span className="font-mono">{formatCurrency(cf.financing.net_financing_cash_flow)}</span>
              </div>
            </div>
          </div>
        </div>
      )}

      {/* TAB 5: CHART OF ACCOUNTS & TAX RATES */}
      {activeTab === "coa_tax" && (
        <div className="grid grid-cols-1 lg:grid-cols-2 gap-5">
          {/* Add Chart of Account Card */}
          <div className="rounded-2xl bg-white/85 dark:bg-slate-900/85 border border-gray-200/80 dark:border-slate-800 p-5 space-y-4">
            <div>
              <h3 className="text-sm font-bold text-gray-900 dark:text-white">
                Add Custom Account to Chart of Accounts
              </h3>
              <p className="text-xs text-gray-500 dark:text-slate-400">
                Create custom Asset, Liability, Equity, Revenue, or Expense ledger accounts
              </p>
            </div>

            <form onSubmit={handleCreateCoa} className="grid grid-cols-1 sm:grid-cols-2 gap-3">
              <div>
                <label className="block text-xs font-medium mb-1">Account Code *</label>
                <input
                  type="text"
                  value={coaCode}
                  onChange={(e) => setCoaCode(e.target.value)}
                  placeholder="e.g. 1650 or 5350"
                  className="w-full h-9 px-3 text-xs rounded-xl border border-gray-200 dark:border-slate-700 bg-white dark:bg-slate-800"
                />
              </div>
              <div>
                <label className="block text-xs font-medium mb-1">Account Name *</label>
                <input
                  type="text"
                  value={coaName}
                  onChange={(e) => setCoaName(e.target.value)}
                  placeholder="e.g. Delivery Van / Bank Charges"
                  className="w-full h-9 px-3 text-xs rounded-xl border border-gray-200 dark:border-slate-700 bg-white dark:bg-slate-800"
                />
              </div>
              <div>
                <label className="block text-xs font-medium mb-1">Account Class (react-select)</label>
                <Select
                  options={NEW_COA_TYPE_OPTIONS}
                  value={coaType}
                  onChange={(opt) => opt && setCoaType(opt)}
                  styles={selectStyles}
                  isSearchable={false}
                  menuPortalTarget={typeof document !== "undefined" ? document.body : null}
                />
              </div>
              <div>
                <label className="block text-xs font-medium mb-1">Opening Balance</label>
                <input
                  type="number"
                  step="any"
                  value={coaOpening}
                  onChange={(e) => setCoaOpening(e.target.value)}
                  placeholder="0.00"
                  className="w-full h-9 px-3 text-xs rounded-xl border border-gray-200 dark:border-slate-700 bg-white dark:bg-slate-800"
                />
              </div>
              <div className="sm:col-span-2 flex justify-end">
                <button
                  type="submit"
                  disabled={savingCoa}
                  className={`px-4 py-2 text-xs font-semibold ${buttonClasses.primary.className}`}
                  style={buttonClasses.primary.style}
                >
                  {savingCoa ? "Saving…" : "+ Add Account"}
                </button>
              </div>
            </form>
          </div>

          {/* Statutory Tax Rates Card */}
          <div className="rounded-2xl bg-white/85 dark:bg-slate-900/85 border border-gray-200/80 dark:border-slate-800 p-5 space-y-4">
            <div>
              <h3 className="text-sm font-bold text-gray-900 dark:text-white">
                Statutory Tax Rate Presets (GST / VAT / WHT)
              </h3>
              <p className="text-xs text-gray-500 dark:text-slate-400">
                Standard tax tiers for Sales, Purchases, Further Tax, and Withholding Tax
              </p>
            </div>

            <form onSubmit={handleCreateTaxRate} className="grid grid-cols-1 sm:grid-cols-2 gap-3">
              <div>
                <label className="block text-xs font-medium mb-1">Tax Title *</label>
                <input
                  type="text"
                  value={taxName}
                  onChange={(e) => setTaxName(e.target.value)}
                  placeholder="e.g. Provincial Sales Tax 16%"
                  className="w-full h-9 px-3 text-xs rounded-xl border border-gray-200 dark:border-slate-700 bg-white dark:bg-slate-800"
                />
              </div>
              <div>
                <label className="block text-xs font-medium mb-1">Short Code *</label>
                <input
                  type="text"
                  value={taxCode}
                  onChange={(e) => setTaxCode(e.target.value)}
                  placeholder="e.g. PST-16"
                  className="w-full h-9 px-3 text-xs rounded-xl border border-gray-200 dark:border-slate-700 bg-white dark:bg-slate-800"
                />
              </div>
              <div>
                <label className="block text-xs font-medium mb-1">Rate (%) *</label>
                <input
                  type="number"
                  step="any"
                  value={taxRateVal}
                  onChange={(e) => setTaxRateVal(e.target.value)}
                  placeholder="16.00"
                  className="w-full h-9 px-3 text-xs rounded-xl border border-gray-200 dark:border-slate-700 bg-white dark:bg-slate-800"
                />
              </div>
              <div>
                <label className="block text-xs font-medium mb-1">Tax Scope (react-select)</label>
                <Select
                  options={TAX_TYPE_OPTIONS}
                  value={taxTypeOpt}
                  onChange={(opt) => opt && setTaxTypeOpt(opt)}
                  styles={selectStyles}
                  isSearchable={false}
                  menuPortalTarget={typeof document !== "undefined" ? document.body : null}
                />
              </div>
              <div className="sm:col-span-2 flex justify-end">
                <button
                  type="submit"
                  disabled={savingTax}
                  className={`px-4 py-2 text-xs font-semibold ${buttonClasses.primary.className}`}
                  style={buttonClasses.primary.style}
                >
                  {savingTax ? "Saving…" : "+ Add Tax Rate"}
                </button>
              </div>
            </form>

            <div className="divide-y divide-gray-100 dark:divide-slate-800 text-xs pt-2">
              {(overview?.tax_rates || []).map((tr) => (
                <div key={tr.id} className="py-2 flex items-center justify-between">
                  <div>
                    <span className="font-mono font-bold text-blue-600 dark:text-blue-400 mr-2">
                      {tr.code}
                    </span>
                    <span className="font-medium text-gray-900 dark:text-white">{tr.name}</span>
                  </div>
                  <span className="font-mono font-bold text-gray-800 dark:text-slate-200">
                    {Number(tr.rate).toFixed(2)}%
                  </span>
                </div>
              ))}
            </div>
          </div>
        </div>
      )}

      {/* MODAL: NEW DOUBLE-ENTRY JOURNAL VOUCHER */}
      {jvModalOpen && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 backdrop-blur-xs p-4">
          <div className="w-full max-w-3xl rounded-2xl bg-white dark:bg-slate-900 border border-gray-200 dark:border-slate-800 shadow-2xl overflow-hidden">
            <div className="px-5 py-4 border-b border-gray-200 dark:border-slate-800 flex items-center justify-between">
              <div>
                <h3 className="text-base font-bold text-gray-900 dark:text-white">
                  New Double-Entry Journal Voucher (JV)
                </h3>
                <p className="text-xs text-gray-500 dark:text-slate-400">
                  Enforces ∑ Debits = ∑ Credits across your Chart of Accounts
                </p>
              </div>
              <button
                type="button"
                onClick={() => setJvModalOpen(false)}
                className="p-1.5 rounded-lg text-gray-400 hover:text-gray-600"
              >
                <XMarkIcon className="w-5 h-5" />
              </button>
            </div>

            <form onSubmit={handleCreateJv} className="p-5 space-y-4 max-h-[82vh] overflow-y-auto">
              {/* Quick Template Pills */}
              <div className="flex flex-wrap items-center gap-1.5">
                <span className="text-[11px] font-semibold text-gray-500 mr-1">Quick Templates:</span>
                {[
                  { key: "capital", label: "Capital Injection" },
                  { key: "drawing", label: "Owner Drawing" },
                  { key: "tax_payment", label: "Tax Challan Payment" },
                  { key: "fixed_asset", label: "Fixed Asset Purchase" },
                  { key: "depreciation", label: "Depreciation" },
                ].map((tpl) => (
                  <button
                    key={tpl.key}
                    type="button"
                    onClick={() => applyQuickJvTemplate(tpl.key)}
                    className="px-2.5 py-1 rounded-lg text-[11px] font-semibold bg-blue-50 text-blue-700 hover:bg-blue-100 dark:bg-blue-950/60 dark:text-blue-300 cursor-pointer"
                  >
                    {tpl.label}
                  </button>
                ))}
              </div>

              <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
                <div>
                  <label className="block text-xs font-medium mb-1">Voucher Date *</label>
                  <input
                    type="date"
                    value={jvDate}
                    onChange={(e) => setJvDate(e.target.value)}
                    className="w-full h-9 px-3 text-xs rounded-xl border border-gray-200 dark:border-slate-700 bg-white dark:bg-slate-800"
                  />
                </div>
                <div>
                  <label className="block text-xs font-medium mb-1">Voucher Type</label>
                  <Select
                    options={JV_TYPE_OPTIONS}
                    value={jvType}
                    onChange={(opt) => opt && setJvType(opt)}
                    styles={selectStyles}
                    isSearchable={false}
                    menuPortalTarget={typeof document !== "undefined" ? document.body : null}
                  />
                </div>
                <div>
                  <label className="block text-xs font-medium mb-1">Ref / Challan #</label>
                  <input
                    type="text"
                    value={jvRefNumber}
                    onChange={(e) => setJvRefNumber(e.target.value)}
                    placeholder="Optional ref / CPR #"
                    className="w-full h-9 px-3 text-xs rounded-xl border border-gray-200 dark:border-slate-700 bg-white dark:bg-slate-800"
                  />
                </div>
              </div>

              <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                <div>
                  <label className="block text-xs font-medium mb-1">Narration / Description *</label>
                  <input
                    type="text"
                    value={jvDescription}
                    onChange={(e) => setJvDescription(e.target.value)}
                    placeholder="e.g. Monthly GST Challan Paid / Capital Deposit"
                    className="w-full h-9 px-3 text-xs rounded-xl border border-gray-200 dark:border-slate-700 bg-white dark:bg-slate-800"
                  />
                </div>
                <div>
                  <label className="block text-xs font-medium mb-1">
                    Sync Treasury Bank/Cash Account (Optional)
                  </label>
                  <Select
                    options={treasuryOptions}
                    value={jvTreasuryAccount}
                    onChange={(opt) => setJvTreasuryAccount(opt)}
                    placeholder="Select if Cash/Bank 1010 is used…"
                    styles={selectStyles}
                    menuPortalTarget={typeof document !== "undefined" ? document.body : null}
                  />
                </div>
              </div>

              {/* Journal Lines */}
              <div className="space-y-2">
                <div className="flex items-center justify-between">
                  <span className="text-xs font-bold uppercase text-gray-500">
                    Double-Entry Lines (Select Account via react-select)
                  </span>
                  <button
                    type="button"
                    onClick={() =>
                      setJvLines((prev) => [
                        ...prev,
                        { chart_of_account_id: "", description: "", debit: "", credit: "" },
                      ])
                    }
                    className="text-xs font-semibold text-blue-600 hover:underline cursor-pointer"
                  >
                    + Add Line
                  </button>
                </div>

                {jvLines.map((line, idx) => (
                  <div
                    key={idx}
                    className="grid grid-cols-12 gap-2 items-center p-2.5 sm:p-0 rounded-xl border sm:border-0 border-slate-200 dark:border-slate-700"
                  >
                    <div className="col-span-12 sm:col-span-5">
                      <Select
                        options={coaOptions}
                        value={
                          coaOptions.find((o) => Number(o.value) === Number(line.chart_of_account_id)) ||
                          null
                        }
                        onChange={(opt) => {
                          const next = [...jvLines];
                          next[idx].chart_of_account_id = opt?.value || "";
                          setJvLines(next);
                        }}
                        placeholder="Select Account…"
                        styles={selectStyles}
                        menuPortalTarget={typeof document !== "undefined" ? document.body : null}
                      />
                    </div>
                    <div className="col-span-12 sm:col-span-3">
                      <input
                        type="text"
                        value={line.description}
                        onChange={(e) => {
                          const next = [...jvLines];
                          next[idx].description = e.target.value;
                          setJvLines(next);
                        }}
                        placeholder="Line memo…"
                        className="w-full h-9 px-2.5 text-xs rounded-xl border border-gray-200 dark:border-slate-700 bg-white dark:bg-slate-800"
                      />
                    </div>
                    <div className="col-span-6 sm:col-span-2">
                      <input
                        type="number"
                        step="any"
                        value={line.debit}
                        onChange={(e) => {
                          const next = [...jvLines];
                          next[idx].debit = e.target.value;
                          if (parseFloat(e.target.value) > 0) next[idx].credit = "";
                          setJvLines(next);
                        }}
                        placeholder="Debit"
                        className="w-full h-9 px-2.5 text-xs text-right font-mono rounded-xl border border-gray-200 dark:border-slate-700 bg-white dark:bg-slate-800"
                      />
                    </div>
                    <div className="col-span-6 sm:col-span-2 flex items-center gap-1">
                      <input
                        type="number"
                        step="any"
                        value={line.credit}
                        onChange={(e) => {
                          const next = [...jvLines];
                          next[idx].credit = e.target.value;
                          if (parseFloat(e.target.value) > 0) next[idx].debit = "";
                          setJvLines(next);
                        }}
                        placeholder="Credit"
                        className="w-full h-9 px-2.5 text-xs text-right font-mono rounded-xl border border-gray-200 dark:border-slate-700 bg-white dark:bg-slate-800"
                      />
                      {jvLines.length > 2 && (
                        <button
                          type="button"
                          onClick={() => setJvLines(jvLines.filter((_, i) => i !== idx))}
                          className="text-rose-500 hover:text-rose-700 p-1 shrink-0"
                        >
                          <XMarkIcon className="w-4 h-4" />
                        </button>
                      )}
                    </div>
                  </div>
                ))}
              </div>

              {/* Balance Verification Footer */}
              <div
                className={`p-3 rounded-xl border flex flex-col sm:flex-row items-start sm:items-center justify-between gap-1.5 text-xs font-bold ${
                  jvTotals.balanced
                    ? "bg-emerald-50 border-emerald-200 text-emerald-800 dark:bg-emerald-950/40 dark:border-emerald-800 dark:text-emerald-200"
                    : "bg-amber-50 border-amber-200 text-amber-800 dark:bg-amber-950/40 dark:border-amber-800 dark:text-amber-200"
                }`}
              >
                <span>
                  {jvTotals.balanced
                    ? "✓ Double-Entry Balanced (∑ Debit = ∑ Credit)"
                    : `Unbalanced — Difference: ${formatCurrency(jvTotals.diff)}`}
                </span>
                <span className="font-mono">
                  Dr: {formatCurrency(jvTotals.debit)} | Cr: {formatCurrency(jvTotals.credit)}
                </span>
              </div>

              <div className="flex justify-end gap-2 pt-2">
                <button
                  type="button"
                  onClick={() => setJvModalOpen(false)}
                  className="px-4 py-2 rounded-xl text-xs font-semibold border border-gray-200 dark:border-slate-700"
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  disabled={!jvTotals.balanced || jvSaving}
                  className={`px-5 py-2 text-xs font-semibold ${buttonClasses.primary.className} disabled:opacity-50`}
                  style={buttonClasses.primary.style}
                >
                  {jvSaving ? "Posting JV…" : "Post Journal Voucher"}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  );
}

