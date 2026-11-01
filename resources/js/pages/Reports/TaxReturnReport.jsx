import React, { useState, useEffect, useCallback, useMemo } from "react";
import axios from "axios";
import toast from "react-hot-toast";
import Select from "react-select";
import { Link } from "react-router-dom";
import {
  ReceiptPercentIcon,
  ArrowDownTrayIcon,
  PrinterIcon,
  ArrowPathIcon,
  CalendarDaysIcon,
  BanknotesIcon,
  ScaleIcon,
  CheckCircleIcon,
  XMarkIcon,
} from "@heroicons/react/24/outline";
import { useTheme } from "@/context/ThemeContext";
import { useCurrency } from "@/context/CurrencyContext";
import { getThemeButtonClasses } from "@/utils/buttonStyles";

const today = () => new Date().toISOString().slice(0, 10);
const monthStart = () => `${today().slice(0, 7)}-01`;

const VIEW_MODE_OPTIONS = [
  { value: "summary", label: "1. Statutory GST / VAT Return Summary & Rate Tiers" },
  { value: "output_register", label: "2. Output Tax Register (Sales & Credit Notes)" },
  { value: "input_register", label: "3. Input Tax Register (Purchases & Debit Notes)" },
  { value: "party_annexure", label: "4. Party-Wise Tax Annexure (Customer & Supplier NTN/STRN)" },
];

const TAX_SCOPE_OPTIONS = [
  { value: "all", label: "All Invoices (Taxable + Zero-Rated/Exempt)" },
  { value: "taxable_only", label: "Taxable Invoices Only (Tax > 0)" },
];

export default function TaxReturnReport() {
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

  const [from, setFrom] = useState(monthStart());
  const [to, setTo] = useState(today());
  const [viewMode, setViewMode] = useState(VIEW_MODE_OPTIONS[0]);
  const [taxScope, setTaxScope] = useState(TAX_SCOPE_OPTIONS[0]);
  const [loading, setLoading] = useState(true);
  const [report, setReport] = useState(null);
  const [exportingPdf, setExportingPdf] = useState(false);

  // Record Tax Challan Modal
  const [challanModalOpen, setChallanModalOpen] = useState(false);
  const [challanAmount, setChallanAmount] = useState("");
  const [challanRef, setChallanRef] = useState("");
  const [challanAccount, setChallanAccount] = useState(null);
  const [treasuryAccounts, setTreasuryAccounts] = useState([]);
  const [coaList, setCoaList] = useState([]);
  const [savingChallan, setSavingChallan] = useState(false);

  const fetchReport = useCallback(async () => {
    setLoading(true);
    try {
      const { data } = await axios.get("/api/reports/tax-return", {
        params: { from, to, tax_scope: taxScope.value },
      });
      setReport(data);
    } catch (err) {
      toast.error(err?.response?.data?.message || "Failed to load Statutory Tax Return report.");
    } finally {
      setLoading(false);
    }
  }, [from, to, taxScope.value]);

  useEffect(() => {
    fetchReport();
  }, [fetchReport]);

  const openChallanModal = async () => {
    const netPayable = Math.max(0, Number(report?.summary?.net_tax_payable || 0));
    setChallanAmount(netPayable > 0 ? String(netPayable) : "");
    setChallanModalOpen(true);
    try {
      const [accRes, coaRes] = await Promise.all([
        axios.get("/api/accounts?active_only=1"),
        axios.get("/api/accounting/chart-of-accounts?active_only=1"),
      ]);
      const accs = Array.isArray(accRes.data?.accounts) ? accRes.data.accounts : [];
      setTreasuryAccounts(accs);
      setCoaList(Array.isArray(coaRes.data) ? coaRes.data : []);
      if (accs.length > 0 && !challanAccount) {
        const def = accs.find((a) => a.is_default) || accs[0];
        setChallanAccount({
          value: def.id,
          label: `${def.name} (${def.type.toUpperCase()} — Bal: ${formatCurrency(def.current_balance)})`,
        });
      }
    } catch {
      /* ignore */
    }
  };

  const handlePostChallan = async (e) => {
    e.preventDefault();
    const amt = parseFloat(challanAmount);
    if (!amt || amt <= 0) {
      toast.error("Enter a valid tax challan amount.");
      return;
    }
    const outputTaxCoa = coaList.find((c) => c.system_key === "output_tax_payable");
    const cashBankCoa = coaList.find((c) => c.system_key === "cash_and_banks");
    if (!outputTaxCoa || !cashBankCoa) {
      toast.error("Chart of Accounts not initialized.");
      return;
    }

    setSavingChallan(true);
    try {
      await axios.post("/api/accounting/journal-entries", {
        entry_date: today(),
        reference_type: "tax_payment",
        reference_number: challanRef || null,
        account_id: challanAccount?.value || null,
        description: `Statutory Tax / GST Challan Payment (${from} to ${to})`,
        lines: [
          {
            chart_of_account_id: outputTaxCoa.id,
            description: `Tax Challan Settlement ${challanRef ? `#${challanRef}` : ""}`,
            debit: amt,
            credit: 0,
          },
          {
            chart_of_account_id: cashBankCoa.id,
            description: "Paid from Treasury Account",
            debit: 0,
            credit: amt,
          },
        ],
      });
      toast.success("Statutory Tax Challan payment recorded in General Ledger & Treasury!");
      setChallanModalOpen(false);
      setChallanRef("");
      fetchReport();
    } catch (err) {
      toast.error(err?.response?.data?.message || "Failed to record tax challan.");
    } finally {
      setSavingChallan(false);
    }
  };

  const setQuickRange = (type) => {
    const t = today();
    if (type === "today") {
      setFrom(t);
      setTo(t);
    } else if (type === "this_month") {
      setFrom(monthStart());
      setTo(t);
    } else if (type === "last_month") {
      const d = new Date();
      d.setMonth(d.getMonth() - 1);
      const lmStr = d.toISOString().slice(0, 7);
      const lastDay = new Date(d.getFullYear(), d.getMonth() + 1, 0).getDate();
      setFrom(`${lmStr}-01`);
      setTo(`${lmStr}-${lastDay}`);
    } else if (type === "this_year") {
      setFrom(`${t.slice(0, 4)}-01-01`);
      setTo(t);
    }
  };

  const handleExportPdf = async () => {
    setExportingPdf(true);
    try {
      const res = await axios.get("/api/reports/tax-return/pdf", {
        params: { from, to, tax_scope: taxScope.value, download: 1 },
        responseType: "blob",
      });
      const url = URL.createObjectURL(new Blob([res.data], { type: "application/pdf" }));
      const a = document.createElement("a");
      a.href = url;
      a.download = `statutory-tax-return-${from}-to-${to}.pdf`;
      a.click();
      setTimeout(() => URL.revokeObjectURL(url), 5000);
      toast.success("Downloaded Statutory Tax Return PDF");
    } catch {
      toast.error("Failed to generate Tax Return PDF");
    } finally {
      setExportingPdf(false);
    }
  };

  const handleExportCsv = () => {
    if (!report) return;
    const s = report.summary || {};
    const rows = [
      ["Statutory Tax & GST Return Report"],
      [`Period: ${report.period.from} to ${report.period.to}`],
      [],
      ["Metric", "Value"],
      ["Taxable Sales Base", s.taxable_sales_base],
      ["Exempt / Zero-Rated Sales Base", s.exempt_sales_base],
      ["Output Tax Collected on Sales", s.output_tax_collected],
      ["Less: Output Tax Reversed on Sale Returns", s.sale_returns_tax_reversed],
      ["Net Output Tax (A)", s.net_output_tax],
      ["Taxable Purchases Base", s.taxable_purchases_base],
      ["Input Tax Paid on Purchases", s.input_tax_paid],
      ["Less: Input Tax Reversed on Purchase Returns", s.purchase_returns_tax_reversed],
      ["Net Input Tax Credit (B)", s.net_input_tax],
      ["Tax Challans Paid via GL", s.tax_challans_paid],
      ["Net Tax Payable / (Refundable)", s.net_tax_payable],
      [],
      ["Output Tax Register (Sales)"],
      ["Date", "Invoice #", "Type", "Customer", "Tax ID (NTN/STRN)", "Taxable Value", "Tax %", "Output Tax", "Total"],
      ...(report.output_register || []).map((r) => [
        r.date,
        r.posted_number,
        r.doc_type_label,
        r.party_name,
        r.party_tax_number,
        r.taxable_amount,
        `${r.tax_percentage}%`,
        r.tax_amount,
        r.invoice_total,
      ]),
      [],
      ["Input Tax Register (Purchases)"],
      ["Date", "Posted #", "Supplier Inv #", "Supplier", "Tax ID (NTN/STRN)", "Taxable Value", "Tax %", "Input Tax", "Total"],
      ...(report.input_register || []).map((r) => [
        r.date,
        r.posted_number,
        r.supplier_inv_no,
        r.party_name,
        r.party_tax_number,
        r.taxable_amount,
        `${r.tax_percentage}%`,
        r.tax_amount,
        r.invoice_total,
      ]),
    ];

    const csv =
      "data:text/csv;charset=utf-8," +
      rows.map((r) => r.map((v) => `"${String(v ?? "").replaceAll('"', '""')}"`).join(",")).join("\n");
    const link = document.createElement("a");
    link.href = encodeURI(csv);
    link.download = `statutory-tax-return-${from}-to-${to}.csv`;
    link.click();
  };

  const s = report?.summary;

  return (
    <div className="w-full max-w-full space-y-5 pb-16">
      {/* Header */}
      <div className="flex flex-col lg:flex-row lg:items-center justify-between gap-3">
        <div>
          <h1 className="text-xl sm:text-2xl font-bold text-gray-900 dark:text-white flex items-center gap-2.5">
            <ReceiptPercentIcon className="w-7 h-7 text-emerald-600 dark:text-emerald-400 shrink-0" />
            <span>Statutory Tax & GST / VAT Return Report</span>
          </h1>
          <p className="text-xs sm:text-sm text-gray-500 dark:text-slate-400 mt-0.5">
            Output Sales Tax vs. Input Purchase Tax Credit, Invoice Registers, Party NTN/STRN Annexures, and Tax Settlement
          </p>
        </div>

        <div className="flex flex-wrap items-center gap-2">
          <Link
            to="/accounting"
            className="inline-flex items-center gap-1.5 px-3.5 py-2 rounded-xl text-xs font-semibold bg-blue-50 text-blue-700 border border-blue-200 hover:bg-blue-100 dark:bg-blue-950/50 dark:text-blue-300 dark:border-blue-800"
          >
            <ScaleIcon className="w-4 h-4" />
            <span>Double-Entry GL</span>
          </Link>
          <button
            type="button"
            onClick={openChallanModal}
            className="inline-flex items-center gap-1.5 px-3.5 py-2 rounded-xl text-xs font-semibold bg-emerald-600 text-white hover:bg-emerald-700 cursor-pointer"
          >
            <BanknotesIcon className="w-4 h-4" />
            <span>Record Tax Challan Payment</span>
          </button>
          <button
            type="button"
            onClick={handleExportCsv}
            disabled={!report}
            className={`inline-flex items-center gap-1.5 px-3.5 py-2 text-xs font-semibold ${buttonClasses.secondary.className}`}
            style={buttonClasses.secondary.style}
          >
            <ArrowDownTrayIcon className="w-4 h-4" />
            <span>Export CSV</span>
          </button>
          <button
            type="button"
            onClick={handleExportPdf}
            disabled={!report || exportingPdf}
            className={`inline-flex items-center gap-1.5 px-3.5 py-2 text-xs font-semibold ${buttonClasses.primary.className}`}
            style={buttonClasses.primary.style}
          >
            <ArrowDownTrayIcon className="w-4 h-4" />
            <span>{exportingPdf ? "Building PDF…" : "Export Return PDF"}</span>
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
        </div>
      </div>

      {/* Filter Bar with react-select */}
      <div className="p-4 rounded-2xl bg-white/85 dark:bg-slate-900/85 border border-gray-200/80 dark:border-slate-800 flex flex-wrap items-center justify-between gap-3">
        <div className="flex flex-wrap items-center gap-3 w-full sm:w-auto">
          <div className="w-full sm:w-80">
            <label className="block text-[10px] font-bold uppercase text-gray-400 mb-1">
              Report Section (react-select)
            </label>
            <Select
              options={VIEW_MODE_OPTIONS}
              value={viewMode}
              onChange={(opt) => opt && setViewMode(opt)}
              styles={selectStyles}
              isSearchable={false}
              menuPortalTarget={typeof document !== "undefined" ? document.body : null}
            />
          </div>

          <div className="w-full sm:w-64">
            <label className="block text-[10px] font-bold uppercase text-gray-400 mb-1">
              Invoice Tax Filter (react-select)
            </label>
            <Select
              options={TAX_SCOPE_OPTIONS}
              value={taxScope}
              onChange={(opt) => opt && setTaxScope(opt)}
              styles={selectStyles}
              isSearchable={false}
              menuPortalTarget={typeof document !== "undefined" ? document.body : null}
            />
          </div>
        </div>

        <div className="flex flex-wrap items-end gap-2">
          <div>
            <label className="block text-[10px] font-bold uppercase text-gray-400 mb-1">From</label>
            <input
              type="date"
              value={from}
              onChange={(e) => setFrom(e.target.value)}
              className="h-9 px-2.5 text-xs rounded-xl border border-gray-200 dark:border-slate-700 bg-white dark:bg-slate-800 text-gray-900 dark:text-white"
            />
          </div>
          <div>
            <label className="block text-[10px] font-bold uppercase text-gray-400 mb-1">To</label>
            <input
              type="date"
              value={to}
              onChange={(e) => setTo(e.target.value)}
              className="h-9 px-2.5 text-xs rounded-xl border border-gray-200 dark:border-slate-700 bg-white dark:bg-slate-800 text-gray-900 dark:text-white"
            />
          </div>
          <div className="flex flex-wrap items-center gap-1">
            {[
              ["today", "Today"],
              ["this_month", "This Month"],
              ["last_month", "Last Month"],
              ["this_year", "This Year"],
            ].map(([k, lbl]) => (
              <button
                key={k}
                type="button"
                onClick={() => setQuickRange(k)}
                className="h-9 px-2.5 rounded-xl text-xs font-medium border border-gray-200 dark:border-slate-700 hover:bg-gray-100 dark:hover:bg-slate-800"
              >
                {lbl}
              </button>
            ))}
            <button
              type="button"
              onClick={fetchReport}
              className="h-9 px-2.5 rounded-xl border border-gray-200 dark:border-slate-700 hover:bg-gray-100 dark:hover:bg-slate-800"
            >
              <ArrowPathIcon className={`w-4 h-4 ${loading ? "animate-spin" : ""}`} />
            </button>
          </div>
        </div>
      </div>

      {/* Executive KPI Cards */}
      {s && (
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
          <div className="p-4 rounded-2xl bg-white/85 dark:bg-slate-900/85 border border-gray-200/80 dark:border-slate-800 shadow-xs">
            <div className="text-xs font-bold uppercase text-amber-600 dark:text-amber-400">
              Net Output Tax (Sales)
            </div>
            <div className="text-2xl font-black font-mono text-gray-900 dark:text-white mt-1.5">
              {formatCurrency(s.net_output_tax)}
            </div>
            <div className="text-[11px] text-gray-500 dark:text-slate-400 mt-1">
              Taxable Sales: {formatCurrency(s.taxable_sales_base)} ({s.taxable_sales_count} inv)
            </div>
          </div>

          <div className="p-4 rounded-2xl bg-white/85 dark:bg-slate-900/85 border border-gray-200/80 dark:border-slate-800 shadow-xs">
            <div className="text-xs font-bold uppercase text-blue-600 dark:text-blue-400">
              Net Input Tax Credit (Purchases)
            </div>
            <div className="text-2xl font-black font-mono text-blue-600 dark:text-blue-400 mt-1.5">
              {formatCurrency(s.net_input_tax)}
            </div>
            <div className="text-[11px] text-gray-500 dark:text-slate-400 mt-1">
              Taxable Purchases: {formatCurrency(s.taxable_purchases_base)} ({s.taxable_purchases_count} inv)
            </div>
          </div>

          <div className="p-4 rounded-2xl bg-white/85 dark:bg-slate-900/85 border border-gray-200/80 dark:border-slate-800 shadow-xs">
            <div className="text-xs font-bold uppercase text-purple-600 dark:text-purple-400">
              Tax Challans Settled
            </div>
            <div className="text-2xl font-black font-mono text-purple-600 dark:text-purple-400 mt-1.5">
              {formatCurrency(s.tax_challans_paid)}
            </div>
            <div className="text-[11px] text-gray-500 dark:text-slate-400 mt-1">
              Exempt Sales Turnover: {formatCurrency(s.exempt_sales_base)}
            </div>
          </div>

          <div className="p-4 rounded-2xl bg-white/85 dark:bg-slate-900/85 border border-gray-200/80 dark:border-slate-800 shadow-xs">
            <div className="flex items-center justify-between text-xs font-bold uppercase text-gray-500 dark:text-slate-400">
              <span>Net GST / Tax Liability</span>
              <span
                className={`px-2 py-0.5 rounded-full text-[10px] font-bold ${
                  s.net_tax_payable > 0
                    ? "bg-amber-100 text-amber-800"
                    : "bg-emerald-100 text-emerald-800"
                }`}
              >
                {s.net_tax_payable > 0
                  ? "PAYABLE"
                  : s.net_tax_payable < 0
                  ? "REFUND CREDIT"
                  : "SETTLED"}
              </span>
            </div>
            <div
              className={`text-2xl font-black font-mono mt-1.5 ${
                s.net_tax_payable > 0
                  ? "text-amber-600 dark:text-amber-400"
                  : "text-emerald-600 dark:text-emerald-400"
              }`}
            >
              {formatCurrency(s.net_tax_payable)}
            </div>
            <div className="text-[11px] text-gray-500 dark:text-slate-400 mt-1">
              Output ({formatCurrency(s.net_output_tax)}) − Input ({formatCurrency(s.net_input_tax)})
            </div>
          </div>
        </div>
      )}

      {/* VIEW 1: STATUTORY RETURN SUMMARY & RATE TIERS */}
      {viewMode.value === "summary" && s && (
        <div className="space-y-5">
          <div className="rounded-2xl bg-white/85 dark:bg-slate-900/85 border border-gray-200/80 dark:border-slate-800 overflow-hidden shadow-xs">
            <div className="px-5 py-3.5 border-b border-gray-200/70 dark:border-slate-800 bg-gray-50/70 dark:bg-slate-800/50">
              <h2 className="text-sm font-bold uppercase tracking-wider text-gray-900 dark:text-white">
                Statutory GST / VAT Return Worksheet ({report.period.from} to {report.period.to})
              </h2>
            </div>

            <div className="overflow-x-auto">
              <table className="w-full text-xs sm:text-sm border-collapse min-w-[580px]">
                <thead>
                  <tr className="bg-gray-50/60 dark:bg-slate-800/40 border-b border-gray-200/60 dark:border-slate-800 text-[11px] font-bold uppercase text-gray-500">
                    <th className="py-3 px-5 text-left">Return Box & Statutory Description</th>
                    <th className="py-3 px-5 text-right">Invoices</th>
                    <th className="py-3 px-5 text-right">Taxable / Exempt Base</th>
                    <th className="py-3 px-5 text-right">Tax Amount</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-gray-100 dark:divide-slate-800">
                  <tr>
                    <td className="py-3 px-5 font-medium">
                      Box 1 — Taxable Sales Supplies (Retail & Wholesale)
                    </td>
                    <td className="py-3 px-5 text-right font-mono">{s.taxable_sales_count}</td>
                    <td className="py-3 px-5 text-right font-mono">{formatCurrency(s.taxable_sales_base)}</td>
                    <td className="py-3 px-5 text-right font-mono font-bold text-amber-600">
                      {formatCurrency(s.output_tax_collected)}
                    </td>
                  </tr>
                  <tr>
                    <td className="py-3 px-5 font-medium">
                      Box 2 — Zero-Rated / Exempt Supplies (Essential Medicines & Non-Taxable)
                    </td>
                    <td className="py-3 px-5 text-right font-mono">{s.exempt_sales_count}</td>
                    <td className="py-3 px-5 text-right font-mono">{formatCurrency(s.exempt_sales_base)}</td>
                    <td className="py-3 px-5 text-right font-mono">{formatCurrency(0)}</td>
                  </tr>
                  <tr>
                    <td className="py-3 px-5 font-medium">
                      Box 3 — Less: Sales Returns / Credit Notes Issued
                    </td>
                    <td className="py-3 px-5 text-right font-mono">—</td>
                    <td className="py-3 px-5 text-right font-mono">-{formatCurrency(s.sale_returns_base)}</td>
                    <td className="py-3 px-5 text-right font-mono text-emerald-600">
                      -{formatCurrency(s.sale_returns_tax_reversed)}
                    </td>
                  </tr>
                  <tr className="bg-amber-50/50 dark:bg-amber-950/20 font-bold">
                    <td colSpan={3} className="py-3 px-5">
                      Total Net Output Tax Payable on Sales (A)
                    </td>
                    <td className="py-3 px-5 text-right font-mono">{formatCurrency(s.net_output_tax)}</td>
                  </tr>
                  <tr>
                    <td className="py-3 px-5 font-medium">
                      Box 4 — Taxable Purchases from Registered Suppliers (Input Tax Credit)
                    </td>
                    <td className="py-3 px-5 text-right font-mono">{s.taxable_purchases_count}</td>
                    <td className="py-3 px-5 text-right font-mono">{formatCurrency(s.taxable_purchases_base)}</td>
                    <td className="py-3 px-5 text-right font-mono font-bold text-blue-600">
                      {formatCurrency(s.input_tax_paid)}
                    </td>
                  </tr>
                  <tr>
                    <td className="py-3 px-5 font-medium">
                      Box 5 — Less: Purchase Returns / Debit Notes Issued to Suppliers
                    </td>
                    <td className="py-3 px-5 text-right font-mono">—</td>
                    <td className="py-3 px-5 text-right font-mono">-{formatCurrency(s.purchase_returns_base)}</td>
                    <td className="py-3 px-5 text-right font-mono text-rose-600">
                      -{formatCurrency(s.purchase_returns_tax_reversed)}
                    </td>
                  </tr>
                  <tr className="bg-blue-50/50 dark:bg-blue-950/20 font-bold">
                    <td colSpan={3} className="py-3 px-5">
                      Total Net Input Tax Credit Claimable (B)
                    </td>
                    <td className="py-3 px-5 text-right font-mono">{formatCurrency(s.net_input_tax)}</td>
                  </tr>
                  <tr>
                    <td colSpan={3} className="py-3 px-5 font-medium">
                      Box 6 — Less: Statutory Tax Challans Paid in Period (C)
                    </td>
                    <td className="py-3 px-5 text-right font-mono">-{formatCurrency(s.tax_challans_paid)}</td>
                  </tr>
                  <tr className="bg-slate-900 text-white font-bold">
                    <td colSpan={3} className="py-3.5 px-5">
                      NET STATUTORY TAX PAYABLE / (CARRY-FORWARD CREDIT) (A − B − C)
                    </td>
                    <td className="py-3.5 px-5 text-right font-mono text-base">
                      {formatCurrency(s.net_tax_payable)}
                    </td>
                  </tr>
                </tbody>
              </table>
            </div>
          </div>

          {/* Tax Rate Tier Breakdown */}
          {report?.rate_breakdown?.length > 0 && (
            <div className="rounded-2xl bg-white/85 dark:bg-slate-900/85 border border-gray-200/80 dark:border-slate-800 overflow-hidden shadow-xs">
              <div className="px-5 py-3.5 border-b border-gray-200/70 dark:border-slate-800">
                <h3 className="text-sm font-bold text-gray-900 dark:text-white">
                  Breakdown by Statutory Tax Rate (%)
                </h3>
              </div>
              <div className="overflow-x-auto">
                <table className="w-full text-xs border-collapse min-w-[600px]">
                  <thead>
                    <tr className="bg-gray-50 dark:bg-slate-800/50 text-[10px] font-bold uppercase text-gray-500">
                      <th className="py-2.5 px-4 text-left">Tax Rate Tier</th>
                      <th className="py-2.5 px-4 text-right">Sales Docs</th>
                      <th className="py-2.5 px-4 text-right">Sales Base</th>
                      <th className="py-2.5 px-4 text-right">Output Tax</th>
                      <th className="py-2.5 px-4 text-right">Purchase Docs</th>
                      <th className="py-2.5 px-4 text-right">Purchase Base</th>
                      <th className="py-2.5 px-4 text-right">Input Tax</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-gray-100 dark:divide-slate-800">
                    {report.rate_breakdown.map((tier, idx) => (
                      <tr key={idx}>
                        <td className="py-2.5 px-4 font-mono font-bold">
                          {Number(tier.rate).toFixed(2)}%
                        </td>
                        <td className="py-2.5 px-4 text-right font-mono">{tier.sales_docs}</td>
                        <td className="py-2.5 px-4 text-right font-mono">{formatCurrency(tier.sales_base)}</td>
                        <td className="py-2.5 px-4 text-right font-mono font-semibold text-amber-600">
                          {formatCurrency(tier.output_tax)}
                        </td>
                        <td className="py-2.5 px-4 text-right font-mono">{tier.purchase_docs}</td>
                        <td className="py-2.5 px-4 text-right font-mono">{formatCurrency(tier.purchase_base)}</td>
                        <td className="py-2.5 px-4 text-right font-mono font-semibold text-blue-600">
                          {formatCurrency(tier.input_tax)}
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </div>
          )}
        </div>
      )}

      {/* VIEW 2: OUTPUT TAX REGISTER */}
      {viewMode.value === "output_register" && (
        <div className="rounded-2xl bg-white/85 dark:bg-slate-900/85 border border-gray-200/80 dark:border-slate-800 overflow-hidden shadow-xs">
          <div className="px-5 py-3.5 border-b border-gray-200/70 dark:border-slate-800 flex items-center justify-between">
            <h2 className="text-sm font-bold text-gray-900 dark:text-white">
              Output Tax Register — Sales & Credit Notes ({report?.output_register?.length || 0} records)
            </h2>
          </div>
          <div className="overflow-x-auto">
            <table className="w-full text-xs border-collapse">
              <thead>
                <tr className="bg-gray-50 dark:bg-slate-800/50 text-[10px] font-bold uppercase text-gray-500">
                  <th className="py-2.5 px-4 text-left">Date</th>
                  <th className="py-2.5 px-4 text-left">Document #</th>
                  <th className="py-2.5 px-4 text-left">Type</th>
                  <th className="py-2.5 px-4 text-left">Customer</th>
                  <th className="py-2.5 px-4 text-left">Tax ID (NTN/STRN)</th>
                  <th className="py-2.5 px-4 text-right">Taxable Value</th>
                  <th className="py-2.5 px-4 text-right">Tax %</th>
                  <th className="py-2.5 px-4 text-right">Output Tax</th>
                  <th className="py-2.5 px-4 text-right">Invoice Total</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-gray-100 dark:divide-slate-800">
                {(report?.output_register || []).map((row) => (
                  <tr key={row.id} className="hover:bg-gray-50/60 dark:hover:bg-slate-800/40">
                    <td className="py-2.5 px-4 font-mono">{row.date}</td>
                    <td className="py-2.5 px-4 font-mono font-bold text-blue-600">{row.posted_number}</td>
                    <td className="py-2.5 px-4">{row.doc_type_label}</td>
                    <td className="py-2.5 px-4 font-medium text-gray-900 dark:text-white">{row.party_name}</td>
                    <td className="py-2.5 px-4 font-mono text-gray-500">{row.party_tax_number}</td>
                    <td className="py-2.5 px-4 text-right font-mono">{formatCurrency(row.taxable_amount)}</td>
                    <td className="py-2.5 px-4 text-right font-mono">{Number(row.tax_percentage).toFixed(2)}%</td>
                    <td className="py-2.5 px-4 text-right font-mono font-bold text-amber-600">
                      {formatCurrency(row.tax_amount)}
                    </td>
                    <td className="py-2.5 px-4 text-right font-mono font-semibold">
                      {formatCurrency(row.invoice_total)}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      )}

      {/* VIEW 3: INPUT TAX REGISTER */}
      {viewMode.value === "input_register" && (
        <div className="rounded-2xl bg-white/85 dark:bg-slate-900/85 border border-gray-200/80 dark:border-slate-800 overflow-hidden shadow-xs">
          <div className="px-5 py-3.5 border-b border-gray-200/70 dark:border-slate-800 flex items-center justify-between">
            <h2 className="text-sm font-bold text-gray-900 dark:text-white">
              Input Tax Register — Purchases & Debit Notes ({report?.input_register?.length || 0} records)
            </h2>
          </div>
          <div className="overflow-x-auto">
            <table className="w-full text-xs border-collapse">
              <thead>
                <tr className="bg-gray-50 dark:bg-slate-800/50 text-[10px] font-bold uppercase text-gray-500">
                  <th className="py-2.5 px-4 text-left">Date</th>
                  <th className="py-2.5 px-4 text-left">Posted #</th>
                  <th className="py-2.5 px-4 text-left">Supplier Inv #</th>
                  <th className="py-2.5 px-4 text-left">Supplier</th>
                  <th className="py-2.5 px-4 text-left">Tax ID (NTN/STRN)</th>
                  <th className="py-2.5 px-4 text-right">Taxable Value</th>
                  <th className="py-2.5 px-4 text-right">Tax %</th>
                  <th className="py-2.5 px-4 text-right">Input Tax Credit</th>
                  <th className="py-2.5 px-4 text-right">Total</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-gray-100 dark:divide-slate-800">
                {(report?.input_register || []).map((row) => (
                  <tr key={row.id} className="hover:bg-gray-50/60 dark:hover:bg-slate-800/40">
                    <td className="py-2.5 px-4 font-mono">{row.date}</td>
                    <td className="py-2.5 px-4 font-mono font-bold text-blue-600">{row.posted_number}</td>
                    <td className="py-2.5 px-4 font-mono">{row.supplier_inv_no}</td>
                    <td className="py-2.5 px-4 font-medium text-gray-900 dark:text-white">{row.party_name}</td>
                    <td className="py-2.5 px-4 font-mono text-gray-500">{row.party_tax_number}</td>
                    <td className="py-2.5 px-4 text-right font-mono">{formatCurrency(row.taxable_amount)}</td>
                    <td className="py-2.5 px-4 text-right font-mono">{Number(row.tax_percentage).toFixed(2)}%</td>
                    <td className="py-2.5 px-4 text-right font-mono font-bold text-blue-600">
                      {formatCurrency(row.tax_amount)}
                    </td>
                    <td className="py-2.5 px-4 text-right font-mono font-semibold">
                      {formatCurrency(row.invoice_total)}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      )}

      {/* VIEW 4: PARTY-WISE TAX ANNEXURE */}
      {viewMode.value === "party_annexure" && (
        <div className="grid grid-cols-1 lg:grid-cols-2 gap-5">
          <div className="rounded-2xl bg-white/85 dark:bg-slate-900/85 border border-gray-200/80 dark:border-slate-800 overflow-hidden shadow-xs">
            <div className="px-5 py-3.5 border-b border-gray-200/70 dark:border-slate-800">
              <h3 className="text-sm font-bold text-gray-900 dark:text-white">
                Customer-Wise Output Tax Annexure (Annex-C)
              </h3>
            </div>
            <div className="overflow-x-auto">
              <table className="w-full text-xs border-collapse min-w-[480px]">
                <thead>
                  <tr className="bg-gray-50 dark:bg-slate-800/50 text-[10px] font-bold uppercase text-gray-500">
                    <th className="py-2.5 px-4 text-left">Customer</th>
                    <th className="py-2.5 px-4 text-left">Tax ID</th>
                    <th className="py-2.5 px-4 text-right">Docs</th>
                    <th className="py-2.5 px-4 text-right">Taxable Base</th>
                    <th className="py-2.5 px-4 text-right">Output Tax</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-gray-100 dark:divide-slate-800">
                  {(report?.customer_annexure || []).map((row, idx) => (
                    <tr key={idx}>
                      <td className="py-2.5 px-4 font-medium">{row.party_name}</td>
                      <td className="py-2.5 px-4 font-mono">{row.party_tax_number}</td>
                      <td className="py-2.5 px-4 text-right font-mono">{row.doc_count}</td>
                      <td className="py-2.5 px-4 text-right font-mono">{formatCurrency(row.taxable_amount)}</td>
                      <td className="py-2.5 px-4 text-right font-mono font-bold text-amber-600">
                        {formatCurrency(row.tax_amount)}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </div>

          <div className="rounded-2xl bg-white/85 dark:bg-slate-900/85 border border-gray-200/80 dark:border-slate-800 overflow-hidden shadow-xs">
            <div className="px-5 py-3.5 border-b border-gray-200/70 dark:border-slate-800">
              <h3 className="text-sm font-bold text-gray-900 dark:text-white">
                Supplier-Wise Input Tax Annexure (Annex-A)
              </h3>
            </div>
            <div className="overflow-x-auto">
              <table className="w-full text-xs border-collapse min-w-[480px]">
                <thead>
                  <tr className="bg-gray-50 dark:bg-slate-800/50 text-[10px] font-bold uppercase text-gray-500">
                    <th className="py-2.5 px-4 text-left">Supplier</th>
                    <th className="py-2.5 px-4 text-left">Tax ID</th>
                    <th className="py-2.5 px-4 text-right">Docs</th>
                    <th className="py-2.5 px-4 text-right">Taxable Base</th>
                    <th className="py-2.5 px-4 text-right">Input Tax</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-gray-100 dark:divide-slate-800">
                  {(report?.supplier_annexure || []).map((row, idx) => (
                    <tr key={idx}>
                      <td className="py-2.5 px-4 font-medium">{row.party_name}</td>
                      <td className="py-2.5 px-4 font-mono">{row.party_tax_number}</td>
                      <td className="py-2.5 px-4 text-right font-mono">{row.doc_count}</td>
                      <td className="py-2.5 px-4 text-right font-mono">{formatCurrency(row.taxable_amount)}</td>
                      <td className="py-2.5 px-4 text-right font-mono font-bold text-blue-600">
                        {formatCurrency(row.tax_amount)}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </div>
        </div>
      )}

      {/* MODAL: RECORD TAX CHALLAN PAYMENT */}
      {challanModalOpen && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 backdrop-blur-xs p-4">
          <div className="w-full max-w-md rounded-2xl bg-white dark:bg-slate-900 border border-gray-200 dark:border-slate-800 shadow-2xl overflow-hidden">
            <div className="px-5 py-4 border-b border-gray-200 dark:border-slate-800 flex items-center justify-between">
              <div>
                <h3 className="text-base font-bold text-gray-900 dark:text-white">
                  Record Statutory Tax Challan Payment
                </h3>
                <p className="text-xs text-gray-500 dark:text-slate-400">
                  Posts Dr Output Tax Payable (2200) / Cr Cash & Bank (1010)
                </p>
              </div>
              <button
                type="button"
                onClick={() => setChallanModalOpen(false)}
                className="p-1.5 rounded-lg text-gray-400 hover:text-gray-600"
              >
                <XMarkIcon className="w-5 h-5" />
              </button>
            </div>

            <form onSubmit={handlePostChallan} className="p-5 space-y-3.5">
              <div>
                <label className="block text-xs font-medium mb-1">Challan Amount *</label>
                <input
                  type="number"
                  step="any"
                  value={challanAmount}
                  onChange={(e) => setChallanAmount(e.target.value)}
                  placeholder="0.00"
                  className="w-full h-9 px-3 text-xs font-mono rounded-xl border border-gray-200 dark:border-slate-700 bg-white dark:bg-slate-800"
                />
              </div>
              <div>
                <label className="block text-xs font-medium mb-1">
                  Pay From Treasury Account (react-select)
                </label>
                <Select
                  options={treasuryAccounts.map((a) => ({
                    value: a.id,
                    label: `${a.name} (${a.type.toUpperCase()} — Bal: ${formatCurrency(a.current_balance)})`,
                  }))}
                  value={challanAccount}
                  onChange={(opt) => setChallanAccount(opt)}
                  styles={selectStyles}
                  menuPortalTarget={typeof document !== "undefined" ? document.body : null}
                />
              </div>
              <div>
                <label className="block text-xs font-medium mb-1">CPR / Challan Reference #</label>
                <input
                  type="text"
                  value={challanRef}
                  onChange={(e) => setChallanRef(e.target.value)}
                  placeholder="e.g. CPR-202610-9912"
                  className="w-full h-9 px-3 text-xs rounded-xl border border-gray-200 dark:border-slate-700 bg-white dark:bg-slate-800"
                />
              </div>

              <div className="flex justify-end gap-2 pt-2">
                <button
                  type="button"
                  onClick={() => setChallanModalOpen(false)}
                  className="px-4 py-2 rounded-xl text-xs font-semibold border border-gray-200 dark:border-slate-700"
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  disabled={savingChallan}
                  className="px-4 py-2 rounded-xl text-xs font-semibold bg-emerald-600 text-white hover:bg-emerald-700"
                >
                  {savingChallan ? "Posting…" : "Post Tax Challan JV"}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  );
}

