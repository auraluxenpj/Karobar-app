import { useState, useEffect, useCallback, useRef, useMemo } from "react";
import axios from "axios";
import toast from "react-hot-toast";
import { useTheme } from "@/context/ThemeContext";
import { getThemeButtonClasses } from "@/utils/buttonStyles";
import { usePermissions } from "@/api/usePermissions";
import {
  CalculatorIcon,
  ArrowDownTrayIcon,
  PrinterIcon,
  CalendarDaysIcon,
  ArrowPathIcon,
  ChartPieIcon,
  ArrowTrendingUpIcon,
  ArrowTrendingDownIcon,
  BanknotesIcon,
  TagIcon,
} from "@heroicons/react/24/outline";
import { useCurrency } from "@/context/CurrencyContext";

const today = () => new Date().toISOString().slice(0, 10);
const monthStart = () => `${today().slice(0, 7)}-01`;

export default function NetProfitReport() {
  const { formatCurrency } = useCurrency();
  const { isDark, theme } = useTheme();
  const { loading: permsLoading, has } = usePermissions();
  const canView = !permsLoading && has("report.net-profit.view");
  const canExport = !permsLoading && has("report.net-profit.export");
  const printRef = useRef(null);

  // Dynamic Button styles using theme colors (matching ThemeSetting.jsx)
  const themeColors = useMemo(() => ({
    primary: theme?.primary_color || "#3b82f6",
    primaryHover: theme?.primary_hover || "#2563eb",
    primaryLight: theme?.primary_light || "#dbeafe",
    secondary: theme?.secondary_color || "#8b5cf6",
    secondaryHover: theme?.secondary_hover || "#7c3aed",
    secondaryLight: theme?.secondary_light || "#ede9fe",
    tertiary: theme?.tertiary_color || "#06b6d4",
    tertiaryHover: theme?.tertiary_hover || "#0891b2",
    danger: theme?.danger_color || "#ef4444",
    dangerHover: "#dc2626",
    success: theme?.success_color || "#10b981",
    successHover: "#059669",
  }), [theme]);

  const buttonStyle = theme?.button_style || "modern";
  const getButtonClasses = useMemo(
    () => getThemeButtonClasses(buttonStyle, themeColors, isDark),
    [buttonStyle, themeColors, isDark]
  );

  const btnPrimary = getButtonClasses.primary;
  const btnSecondary = getButtonClasses.secondary;
  const btnTertiary = getButtonClasses.tertiary;

  const [from, setFrom] = useState(monthStart());
  const [to, setTo] = useState(today());
  const [loading, setLoading] = useState(true);
  const [report, setReport] = useState(null);

  const fetchReport = useCallback(async () => {
    setLoading(true);
    try {
      const res = await axios.get("/api/reports/net-profit", {
        params: { from, to },
      });
      setReport(res.data);
    } catch (err) {
      toast.error(err?.response?.data?.message || "Failed to load Profit & Loss report.");
    } finally {
      setLoading(false);
    }
  }, [from, to]);

  useEffect(() => {
    if (!permsLoading && canView) {
      fetchReport();
    }
  }, [fetchReport, permsLoading, canView]);

  function setQuickRange(type) {
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
  }

  function handlePrint() {
    window.print();
  }

  const [exportingPdf, setExportingPdf] = useState(false);

  async function exportPdf() {
    if (!report) return;
    setExportingPdf(true);
    try {
      const res = await axios.get("/api/reports/net-profit/pdf", {
        params: { from, to, download: 1 },
        responseType: "blob",
      });
      const blob = new Blob([res.data], { type: "application/pdf" });
      const url = URL.createObjectURL(blob);
      const a = document.createElement("a");
      a.href = url;
      a.download = `profit-and-loss-${from}-to-${to}.pdf`;
      document.body.appendChild(a);
      a.click();
      a.remove();
      setTimeout(() => URL.revokeObjectURL(url), 5000);
      toast.success("Downloaded Profit & Loss PDF");
    } catch (err) {
      toast.error("Failed to generate P&L PDF");
    } finally {
      setExportingPdf(false);
    }
  }

  function exportCsv() {
    if (!report) return;
    const kpis = report.kpis;
    const lines = [
      ["Executive Profit & Loss (P&L) Statement"],
      [`Period: ${report.date_range.from} to ${report.date_range.to}`],
      [],
      ["Financial Metric", "Amount (PKR)"],
      ["Gross Invoiced Sales", kpis.gross_sales],
      ["Discounts Allowed", kpis.total_discounts],
      ["Taxes", kpis.total_taxes],
      ["Invoiced Sales", kpis.invoiced_sales],
      ["Less: Sale Returns", kpis.returns_amount],
      ["Net Invoiced Sales (Revenue)", kpis.net_sales],
      ["Cost of Goods Sold (COGS)", kpis.cost_of_goods_sold],
      ["Gross Profit", kpis.gross_profit],
      ["Gross Profit Margin %", `${kpis.gross_margin_pct}%`],
      ["Total Operating Expenses (OpEx)", kpis.total_expenses],
      ["Net Operating Profit / (Loss)", kpis.net_profit],
      ["Net Margin %", `${kpis.net_margin_pct}%`],
      [],
      ["Operating Expenses by Category"],
      ["Category", "Transactions", "Amount (PKR)", "% of OpEx"],
      ...report.expenses_by_category.map((c) => [
        c.category_name,
        c.count,
        c.total_amount,
        `${c.percentage}%`,
      ]),
    ];

    const csvContent =
      "data:text/csv;charset=utf-8," +
      lines.map((e) => e.map((val) => `"${val}"`).join(",")).join("\n");
    const encodedUri = encodeURI(csvContent);
    const link = document.createElement("a");
    link.setAttribute("href", encodedUri);
    link.setAttribute(
      "download",
      `profit-and-loss-${report.date_range.from}-to-${report.date_range.to}.csv`
    );
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
  }

  const kpis = report?.kpis;

  return (
    <div className="w-full max-w-full overflow-hidden space-y-4 sm:space-y-6 animate-fadeIn pb-16">
      {/* Print Styles */}
      <style>{`
        @media print {
          body * { visibility: hidden; }
          #pnl-printable, #pnl-printable * { visibility: visible; }
          #pnl-printable { position: absolute; left: 0; top: 0; width: 100%; margin: 0; padding: 20px; }
          .no-print { display: none !important; }
        }
      `}</style>

      {/* Screen Header */}
      <div className="flex flex-col sm:flex-row items-start sm:items-center justify-between gap-3 sm:gap-4 no-print">
        <div className="min-w-0">
          <h1 className="text-xl sm:text-2xl font-bold tracking-tight text-gray-900 dark:text-white flex items-center gap-2 sm:gap-2.5 truncate">
            <CalculatorIcon className="w-6 h-6 sm:w-7 sm:h-7 text-emerald-600 dark:text-emerald-400 shrink-0" />
            <span className="truncate">Profit & Loss Statement (P&L)</span>
          </h1>
          <p className="text-xs sm:text-sm text-gray-500 dark:text-slate-400 mt-0.5">
            Complete executive financial income statement showing Gross Revenue, COGS, Operating Expenses, and Net Margin
          </p>
        </div>

        <div className="flex flex-wrap items-center gap-2 w-full sm:w-auto shrink-0">
          {canExport && (
            <>
              <button
                onClick={exportCsv}
                disabled={!report}
                className={`flex-1 sm:flex-none flex items-center justify-center gap-1.5 px-3.5 py-2 text-xs font-semibold theme-btn-secondary ${btnSecondary.className} disabled:opacity-50`}
                style={btnSecondary.style}
              >
                <ArrowDownTrayIcon className="w-4 h-4 text-emerald-500" />
                <span>Export CSV</span>
              </button>
              <button
                onClick={exportPdf}
                disabled={!report || exportingPdf}
                className={`flex-1 sm:flex-none flex items-center justify-center gap-1.5 px-3.5 py-2 text-xs font-semibold theme-btn-secondary ${btnSecondary.className} disabled:opacity-50`}
                style={btnSecondary.style}
              >
                <ArrowDownTrayIcon className="w-4 h-4 text-blue-500" />
                <span>{exportingPdf ? "Building PDF…" : "Export PDF"}</span>
              </button>
              <button
                onClick={handlePrint}
                disabled={!report}
                className={`flex-1 sm:flex-none flex items-center justify-center gap-1.5 px-4 py-2 text-xs font-semibold theme-btn-primary ${btnPrimary.className} disabled:opacity-50`}
                style={btnPrimary.style}
              >
                <PrinterIcon className="w-4 h-4" />
                <span>Print P&L</span>
              </button>
            </>
          )}
        </div>
      </div>

      {/* Date Filter Bar */}
      <div className="p-3.5 sm:p-4 rounded-2xl bg-white/80 dark:bg-slate-900/80 border border-gray-100 dark:border-slate-800 shadow-sm backdrop-blur-xl flex flex-wrap items-center justify-between gap-3 sm:gap-4 no-print">
        <div className="flex flex-wrap items-center gap-2">
          <CalendarDaysIcon className="w-4 h-4 sm:w-5 sm:h-5 text-gray-400 shrink-0" />
          <span className="text-xs font-semibold text-gray-700 dark:text-slate-300">Period:</span>
          <input
            type="date"
            value={from}
            onChange={(e) => setFrom(e.target.value)}
            className="px-2.5 py-1.5 text-xs rounded-xl border border-gray-200 dark:border-slate-700 bg-white/50 dark:bg-slate-800 text-gray-900 dark:text-white focus:outline-none focus:ring-2 focus:ring-blue-500"
          />
          <span className="text-xs text-gray-400">to</span>
          <input
            type="date"
            value={to}
            onChange={(e) => setTo(e.target.value)}
            className="px-2.5 py-1.5 text-xs rounded-xl border border-gray-200 dark:border-slate-700 bg-white/50 dark:bg-slate-800 text-gray-900 dark:text-white focus:outline-none focus:ring-2 focus:ring-blue-500"
          />
          <button
            onClick={fetchReport}
            className={`p-1.5 text-xs theme-btn-tertiary ${btnTertiary.className}`}
            style={btnTertiary.style}
            title="Refresh"
          >
            <ArrowPathIcon className={`w-4 h-4 ${loading ? "animate-spin" : ""}`} />
          </button>
        </div>

        <div className="flex flex-wrap items-center gap-1.5 text-xs">
          <button
            onClick={() => setQuickRange("today")}
            className={`px-2.5 py-1 sm:px-3 sm:py-1.5 text-[11px] sm:text-xs font-medium theme-btn-tertiary ${btnTertiary.className}`}
            style={btnTertiary.style}
          >
            Today
          </button>
          <button
            onClick={() => setQuickRange("this_month")}
            className={`px-2.5 py-1 sm:px-3 sm:py-1.5 text-[11px] sm:text-xs font-medium theme-btn-tertiary ${btnTertiary.className}`}
            style={btnTertiary.style}
          >
            This Month
          </button>
          <button
            onClick={() => setQuickRange("last_month")}
            className={`px-2.5 py-1 sm:px-3 sm:py-1.5 text-[11px] sm:text-xs font-medium theme-btn-tertiary ${btnTertiary.className}`}
            style={btnTertiary.style}
          >
            Last Month
          </button>
          <button
            onClick={() => setQuickRange("this_year")}
            className={`px-2.5 py-1 sm:px-3 sm:py-1.5 text-[11px] sm:text-xs font-medium theme-btn-tertiary ${btnTertiary.className}`}
            style={btnTertiary.style}
          >
            This Year
          </button>
        </div>
      </div>

      {/* Printable P&L Statement Container */}
      <div id="pnl-printable" ref={printRef} className="space-y-6">
        {/* Printable Header */}
        <div className="hidden print:block text-center border-b pb-4 mb-6">
          <h1 className="text-xl font-bold uppercase tracking-wider">Executive Income Statement (P&L)</h1>
          <p className="text-xs text-gray-500 mt-1">
            Reporting Period: {report?.date_range.from} to {report?.date_range.to}
          </p>
        </div>

        {/* Executive KPI Cards */}
        {kpis && (
          <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-4 gap-3 sm:gap-4">
            {/* Net Revenue */}
            <div className="p-4 sm:p-5 rounded-2xl bg-white/80 dark:bg-slate-900/80 border border-gray-100 dark:border-slate-800 shadow-sm backdrop-blur-xl min-w-0">
              <div className="text-xs font-semibold uppercase tracking-wider text-gray-500 dark:text-slate-400 truncate">
                Net Sales Revenue
              </div>
              <div className="text-lg sm:text-2xl font-black text-gray-900 dark:text-white mt-1.5 truncate">
                {formatCurrency(kpis.net_sales)}
              </div>
              <div className="text-[11px] text-gray-400 dark:text-slate-500 mt-1 truncate">
                Invoiced: {formatCurrency(kpis.invoiced_sales)} • Ret: -{formatCurrency(kpis.returns_amount)}
              </div>
            </div>

            {/* Gross Profit */}
            <div className="p-4 sm:p-5 rounded-2xl bg-white/80 dark:bg-slate-900/80 border border-gray-100 dark:border-slate-800 shadow-sm backdrop-blur-xl min-w-0">
              <div className="flex items-center justify-between gap-1 text-xs font-semibold uppercase tracking-wider text-gray-500 dark:text-slate-400">
                <span className="truncate">Gross Profit</span>
                <span className="font-mono text-emerald-600 dark:text-emerald-400 shrink-0">{kpis.gross_margin_pct}%</span>
              </div>
              <div className="text-lg sm:text-2xl font-black text-emerald-600 dark:text-emerald-400 mt-1.5 truncate">
                {formatCurrency(kpis.gross_profit)}
              </div>
              <div className="text-[11px] text-gray-400 dark:text-slate-500 mt-1 truncate">
                COGS: {formatCurrency(kpis.cost_of_goods_sold)}
              </div>
            </div>

            {/* Total Expenses */}
            <div className="p-4 sm:p-5 rounded-2xl bg-white/80 dark:bg-slate-900/80 border border-gray-100 dark:border-slate-800 shadow-sm backdrop-blur-xl min-w-0">
              <div className="text-xs font-semibold uppercase tracking-wider text-gray-500 dark:text-slate-400 truncate">
                Operating Expenses (OpEx)
              </div>
              <div className="text-lg sm:text-2xl font-black text-rose-600 dark:text-rose-400 mt-1.5 truncate">
                {formatCurrency(kpis.total_expenses)}
              </div>
              <div className="text-[11px] text-gray-400 dark:text-slate-500 mt-1 truncate">
                Across {report?.expenses_by_category?.length || 0} categories
              </div>
            </div>

            {/* Net Operating Profit */}
            <div
              className={`p-4 sm:p-5 rounded-2xl border shadow-sm backdrop-blur-xl min-w-0 ${
                kpis.is_profitable
                  ? "bg-emerald-50/50 dark:bg-emerald-950/20 border-emerald-200/80 dark:border-emerald-800/50"
                  : "bg-rose-50/50 dark:bg-rose-950/20 border-rose-200/80 dark:border-rose-800/50"
              }`}
            >
              <div className="flex items-center justify-between gap-1 text-xs font-semibold uppercase tracking-wider">
                <span className={`truncate ${kpis.is_profitable ? "text-emerald-800 dark:text-emerald-300" : "text-rose-800 dark:text-rose-300"}`}>
                  Net Operating Profit
                </span>
                <span className="font-mono font-bold shrink-0">
                  {kpis.is_profitable ? `+${kpis.net_margin_pct}%` : `${kpis.net_margin_pct}%`}
                </span>
              </div>
              <div
                className={`text-lg sm:text-2xl font-black mt-1.5 truncate ${
                  kpis.is_profitable ? "text-emerald-600 dark:text-emerald-400" : "text-rose-600 dark:text-rose-400"
                }`}
              >
                {formatCurrency(kpis.net_profit)}
              </div>
              <div className="text-[11px] opacity-80 mt-1 truncate">
                {kpis.is_profitable ? "Profitable operation" : "Operating at a loss"}
              </div>
            </div>
          </div>
        )}

        {/* Detailed Financial Income Statement Table */}
        {kpis && (
          <div className="p-6 rounded-2xl bg-white/80 dark:bg-slate-900/80 border border-gray-100 dark:border-slate-800 shadow-sm backdrop-blur-xl">
            <h2 className="text-base font-bold text-gray-900 dark:text-white mb-4 flex items-center gap-2">
              <CalculatorIcon className="w-5 h-5 text-blue-500" />
              Itemized Statement of Operations
            </h2>

            <div className="space-y-2 text-sm divide-y divide-gray-100 dark:divide-slate-800">
              {/* Revenue Section */}
              <div className="pt-2">
                <div className="font-bold text-xs uppercase tracking-wider text-gray-400 dark:text-slate-500 mb-2">
                  1. Revenue & Invoiced Sales
                </div>
                <div className="flex justify-between py-1.5 text-gray-700 dark:text-slate-300">
                  <span>Gross Invoiced Sales</span>
                  <span className="font-mono">{formatCurrency(kpis.gross_sales)}</span>
                </div>
                {kpis.total_discounts > 0 && (
                  <div className="flex justify-between py-1 text-gray-500 dark:text-slate-400 text-xs">
                    <span className="pl-4">- Invoice & Item Discounts</span>
                    <span className="font-mono">-{formatCurrency(kpis.total_discounts)}</span>
                  </div>
                )}
                {kpis.returns_amount > 0 && (
                  <div className="flex justify-between py-1 text-rose-600 dark:text-rose-400 text-xs">
                    <span className="pl-4">- Customer Sale Returns & Credits</span>
                    <span className="font-mono">-{formatCurrency(kpis.returns_amount)}</span>
                  </div>
                )}
                <div className="flex justify-between py-2 font-bold text-gray-900 dark:text-white border-t border-dashed border-gray-200 dark:border-slate-700 mt-1">
                  <span>Net Sales Revenue</span>
                  <span className="font-mono text-base">{formatCurrency(kpis.net_sales)}</span>
                </div>
              </div>

              {/* COGS Section */}
              <div className="pt-3">
                <div className="font-bold text-xs uppercase tracking-wider text-gray-400 dark:text-slate-500 mb-2">
                  2. Cost of Goods Sold (COGS)
                </div>
                <div className="flex justify-between py-1.5 text-rose-600 dark:text-rose-400">
                  <span>Cost of Sales (Batch Purchase Costs Deducted)</span>
                  <span className="font-mono">-{formatCurrency(kpis.cost_of_goods_sold)}</span>
                </div>
                <div className="flex justify-between py-2 font-bold text-emerald-600 dark:text-emerald-400 border-t border-dashed border-gray-200 dark:border-slate-700 mt-1">
                  <span>Gross Profit</span>
                  <span className="font-mono text-base">{formatCurrency(kpis.gross_profit)}</span>
                </div>
              </div>

              {/* Operating Expenses Section */}
              <div className="pt-3">
                <div className="font-bold text-xs uppercase tracking-wider text-gray-400 dark:text-slate-500 mb-2">
                  3. Operating Expenses (OpEx)
                </div>
                {report.expenses_by_category?.map((cat) => (
                  <div key={cat.category_id} className="flex justify-between py-1 text-gray-600 dark:text-slate-400 text-xs">
                    <span className="pl-4 flex items-center gap-1.5">
                      <TagIcon className="w-3.5 h-3.5 text-gray-400" />
                      {cat.category_name} ({cat.count} txns)
                    </span>
                    <span className="font-mono text-rose-600 dark:text-rose-400">
                      -{formatCurrency(cat.total_amount)}
                    </span>
                  </div>
                ))}
                <div className="flex justify-between py-2 font-bold text-rose-600 dark:text-rose-400 border-t border-dashed border-gray-200 dark:border-slate-700 mt-1">
                  <span>Total Operating Expenses</span>
                  <span className="font-mono text-base">-{formatCurrency(kpis.total_expenses)}</span>
                </div>
              </div>

              {/* Bottomline Net Profit */}
              <div className="pt-4 pb-2">
                <div
                  className={`flex flex-col sm:flex-row justify-between items-start sm:items-center gap-2 p-4 rounded-xl ${
                    kpis.is_profitable
                      ? "bg-emerald-500/10 text-emerald-700 dark:text-emerald-300 border border-emerald-500/30"
                      : "bg-rose-500/10 text-rose-700 dark:text-rose-300 border border-rose-500/30"
                  }`}
                >
                  <div>
                    <div className="font-black text-lg">Net Operating Profit / (Loss)</div>
                    <div className="text-xs opacity-80">
                      Net Profit Margin: <strong>{kpis.net_margin_pct}%</strong>
                    </div>
                  </div>
                  <div className="font-mono text-2xl font-black">{formatCurrency(kpis.net_profit)}</div>
                </div>
              </div>
            </div>
          </div>
        )}

        {/* Operating Expenses Breakdown Visualization */}
        {report?.expenses_by_category?.length > 0 && (
          <div className="p-6 rounded-2xl bg-white/80 dark:bg-slate-900/80 border border-gray-100 dark:border-slate-800 shadow-sm backdrop-blur-xl">
            <h2 className="text-base font-bold text-gray-900 dark:text-white mb-4 flex items-center gap-2">
              <ChartPieIcon className="w-5 h-5 text-indigo-500" />
              Expense Distribution by Category
            </h2>

            <div className="space-y-3">
              {report.expenses_by_category.map((cat) => (
                <div key={cat.category_id} className="space-y-1">
                  <div className="flex justify-between text-xs font-medium">
                    <span className="text-gray-900 dark:text-white">{cat.category_name}</span>
                    <span className="font-mono text-gray-500 dark:text-slate-400">
                      {formatCurrency(cat.total_amount)} ({cat.percentage}%)
                    </span>
                  </div>
                  <div className="w-full h-2 rounded-full bg-gray-100 dark:bg-slate-800 overflow-hidden">
                    <div
                      className="h-full rounded-full bg-gradient-to-r from-blue-500 to-indigo-600"
                      style={{ width: `${Math.min(100, Math.max(2, cat.percentage))}%` }}
                    />
                  </div>
                </div>
              ))}
            </div>
          </div>
        )}

        {/* Signatures for Print */}
        <div className="hidden print:grid grid-cols-2 gap-20 pt-16 text-center text-xs text-gray-500">
          <div className="border-t border-gray-400 pt-2">Prepared By (Accountant / Manager)</div>
          <div className="border-t border-gray-400 pt-2">Approved By (Proprietor / Director)</div>
        </div>
      </div>
    </div>
  );
}

