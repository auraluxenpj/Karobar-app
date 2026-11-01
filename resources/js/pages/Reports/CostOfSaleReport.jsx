// resources/js/pages/CostOfSaleReport.jsx
import { useMemo, useState } from "react";
import axios from "axios";
import toast from "react-hot-toast";
import { usePermissions, Guard } from "@/api/usePermissions";
import { useTheme } from "@/context/ThemeContext";
import {
  ArrowPathIcon,
  ArrowTrendingDownIcon,
  ArrowTrendingUpIcon,
  ArrowDownOnSquareIcon,
  ChartBarIcon,
  ChartPieIcon,
  CurrencyDollarIcon,
  DocumentChartBarIcon,
  TagIcon,
} from "@heroicons/react/24/solid";

// Helper to determine text color based on background brightness
const getContrastText = (hexColor) => {
  hexColor = hexColor.replace('#', '');
  const r = parseInt(hexColor.substring(0, 2), 16);
  const g = parseInt(hexColor.substring(2, 4), 16);
  const b = parseInt(hexColor.substring(4, 6), 16);
  const luminance = (0.299 * r + 0.587 * g + 0.114 * b) / 255;
  return luminance > 0.5 ? '#1f2937' : '#ffffff';
};

/* ========== Helpers ========== */
const todayStr = () => new Date().toISOString().split("T")[0];
const yesterdayStr = () => {
  const d = new Date();
  d.setDate(d.getDate() - 1);
  return d.toISOString().split("T")[0];
};
const n = (v) => (isFinite(Number(v)) ? Number(v) : 0);
const fmtCurrency = (v) =>
  n(v).toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 });
const fmtPct = (v) =>
  n(v).toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 }) + "%";

export default function CostOfSaleReport() {
  // Default from = yesterday, to = today
  const [fromDate, setFromDate] = useState(yesterdayStr());
  const [toDate, setToDate] = useState(todayStr());
  const [invoiceType, setInvoiceType] = useState("all"); // all, credit, debit
  const [rows, setRows] = useState([]);
  const [loading, setLoading] = useState(false);
  const [pdfLoading, setPdfLoading] = useState(false);

  // permissions
  const { loading: permsLoading, canFor } = usePermissions();
  const can = useMemo(
    () =>
      (typeof canFor === "function" ? canFor("report.cost-of-sale") : {
        view: false,
        export: false,
      }),
    [canFor]
  );

  // Active theme colors
  const { theme } = useTheme();

  const themeColors = useMemo(() => {
    if (!theme) {
      return {
        primary: '#2563eb',
        secondary: '#0f766e',
        success: '#15803d',
        warning: '#b45309',
        danger: '#dc2626',
      };
    }
    return {
      primary: theme.primary_color || '#2563eb',
      secondary: theme.secondary_color || '#0f766e',
      success: theme.success_color || '#15803d',
      warning: theme.warning_color || '#b45309',
      danger: theme.danger_color || '#dc2626',
    };
  }, [theme]);

  const primaryTextColor = useMemo(
    () => getContrastText(themeColors.primary),
    [themeColors.primary]
  );

  // === Fetch report only when user clicks Apply/Load ===
  const fetchReport = async () => {
    if (!can.view) {
      toast.error("You don't have permission to view this report.");
      return;
    }
    if (!fromDate || !toDate) return toast.error("Please select both dates.");
    if (fromDate > toDate) return toast.error("From Date cannot be after To Date.");

    setLoading(true);
    try {
      const res = await axios.get("/api/reports/cost-of-sale", {
        params: { from: fromDate, to: toDate, invoice_type: invoiceType },
      });
      const data = Array.isArray(res.data)
        ? res.data
        : Array.isArray(res.data?.data)
        ? res.data.data
        : [];
      setRows(
        data.map((r) => ({
          sale_date: r.sale_date || r.date || "",
          gross_sale: n(r.gross_sale),
          item_discount: n(r.item_discount),
          discount_amount: n(r.discount_amount),
          tax_amount: n(r.tax_amount),
          total_sales: n(r.total_sales),
          sale_return: n(r.sale_return),
          cost_of_sales: n(r.cost_of_sales),
          cost_is_estimated: Boolean(r.cost_is_estimated),
        }))
      );
    } catch (err) {
      console.error(err);
      toast.error("Failed to load Cost of Sale report");
      setRows([]);
    } finally {
      setLoading(false);
    }
  };

  const computed = useMemo(() => {
    const withDerived = rows.map((r) => {
      const net_sale = n(r.total_sales) - n(r.sale_return);
      const gp_amount = net_sale - n(r.cost_of_sales);
      const gp_pct = net_sale > 0 ? (gp_amount / net_sale) * 100 : 0;
      return { ...r, net_sale, gp_amount, gp_pct };
    });

    const totals = withDerived.reduce(
      (acc, r) => {
        acc.gross_sale += r.gross_sale;
        acc.item_discount += r.item_discount;
        acc.discount_amount += r.discount_amount;
        acc.tax_amount += r.tax_amount;
        acc.total_sales += r.total_sales;
        acc.sale_return += r.sale_return;
        acc.net_sale += r.net_sale;
        acc.cost_of_sales += r.cost_of_sales;
        acc.gp_amount += r.gp_amount;
        return acc;
      },
      {
        gross_sale: 0,
        item_discount: 0,
        discount_amount: 0,
        tax_amount: 0,
        total_sales: 0,
        sale_return: 0,
        net_sale: 0,
        cost_of_sales: 0,
        gp_amount: 0,
      }
    );
    const totals_gp_pct = totals.net_sale > 0 ? (totals.gp_amount / totals.net_sale) * 100 : 0;

    return { withDerived, totals, totals_gp_pct };
  }, [rows]);

  const exportPdf = async () => {
    if (!can.export) {
      toast.error("You don't have permission to export this report.");
      return;
    }
    if (!computed.withDerived.length) return;

    const pdfWindow = window.open("", "_blank");
    setPdfLoading(true);
    try {
      const response = await axios.get("/api/reports/cost-of-sale/pdf", {
        params: { from: fromDate, to: toDate, invoice_type: invoiceType },
        responseType: "blob",
      });
      const url = URL.createObjectURL(new Blob([response.data], { type: "application/pdf" }));
      if (pdfWindow) {
        pdfWindow.location.href = url;
      } else {
        const a = document.createElement("a");
        a.href = url;
        a.download = `cost-of-sale-${fromDate || "report"}.pdf`;
        document.body.appendChild(a);
        a.click();
        document.body.removeChild(a);
      }
      setTimeout(() => URL.revokeObjectURL(url), 10000);
    } catch (error) {
      console.error(error);
      if (pdfWindow) pdfWindow.close();
      toast.error("Failed to generate Cost of Sale PDF.");
    } finally {
      setPdfLoading(false);
    }
  };

  // Permission gating
  if (permsLoading) {
    return (
      <div className="report-page">
        <section className="products-panel">
          <p className="report-state">Checking permissions…</p>
        </section>
      </div>
    );
  }

  if (!can.view) {
    return (
      <div className="report-page">
        <section className="products-panel">
          <p className="report-state">You don't have permission to view this report.</p>
        </section>
      </div>
    );
  }

  return (
    <div className="report-page">
      {/* ===== Glass overview: title, actions, filters ===== */}
      <section className="products-panel">
        <div className="products-heading">
          <div className="flex items-center gap-3 min-w-0">
            <div className="products-identity-icon">
              <DocumentChartBarIcon className="w-6 h-6" />
            </div>
            <div className="min-w-0">
              <h1 className="products-title">Cost of Sale Report</h1>
              <p className="products-subtitle">
                <DocumentChartBarIcon className="w-3.5 h-3.5 shrink-0" />
                <span className="truncate">{computed.withDerived.length} entries</span>
              </p>
            </div>
          </div>

          <div className="flex flex-wrap items-center gap-2">
            <Guard when={can.export}>
              <button
                type="button"
                onClick={exportPdf}
                disabled={!computed.withDerived.length || pdfLoading}
                title="Open loaded report as PDF in a new tab"
                className="products-action theme-btn-secondary"
              >
                <ArrowDownOnSquareIcon className="w-4 h-4" />
                <span>{pdfLoading ? "Generating…" : "Export PDF"}</span>
              </button>
            </Guard>
            <button
              type="button"
              title="Reset to default (yesterday → today)"
              onClick={() => {
                setFromDate(yesterdayStr());
                setToDate(todayStr());
                setRows([]);
              }}
              className="products-action theme-btn-tertiary"
            >
              <ArrowPathIcon className="w-4 h-4" />
              <span>Reset</span>
            </button>

            <Guard when={can.view}>
              <button
                type="button"
                title="Load / refresh the report"
                onClick={fetchReport}
                disabled={loading}
                className="products-action products-action-primary theme-btn-primary"
              >
                <ArrowPathIcon className={`w-4 h-4 ${loading ? "animate-spin" : ""}`} />
                <span>{loading ? "Loading…" : "Load Report"}</span>
              </button>
            </Guard>
          </div>
        </div>

        <div className="products-filter-panel">
          <div className="report-filters">
            <label className="products-filter">
              <span className="products-filter-label">From Date</span>
              <input
                type="date"
                value={fromDate}
                onChange={(e) => setFromDate(e.target.value)}
                className="report-input"
              />
            </label>

            <label className="products-filter">
              <span className="products-filter-label">To Date</span>
              <input
                type="date"
                value={toDate}
                onChange={(e) => setToDate(e.target.value)}
                className="report-input"
              />
            </label>

            <label className="products-filter">
              <span className="products-filter-label">Sale Type</span>
              <select
                value={invoiceType}
                onChange={(e) => setInvoiceType(e.target.value)}
                className="report-input cursor-pointer"
              >
                <option value="all">All Sales</option>
                <option value="credit">Credit Sales</option>
                <option value="debit">Debit Sales</option>
              </select>
            </label>

            <div className="products-filter report-span-all">
              <span className="products-filter-label">Quick range</span>
              <div className="report-quick">
                <button
                  type="button"
                  className="products-action theme-btn-tertiary"
                  onClick={() => {
                    const end = new Date();
                    const start = new Date();
                    start.setDate(end.getDate() - 1);
                    setFromDate(start.toISOString().slice(0, 10));
                    setToDate(end.toISOString().slice(0, 10));
                  }}
                >
                  Today
                </button>

                <button
                  type="button"
                  className="products-action theme-btn-tertiary"
                  onClick={() => {
                    const end = new Date();
                    const start = new Date();
                    start.setDate(end.getDate() - 3);
                    setFromDate(start.toISOString().slice(0, 10));
                    setToDate(end.toISOString().slice(0, 10));
                  }}
                >
                  3 Days
                </button>

                <button
                  type="button"
                  className="products-action theme-btn-tertiary"
                  onClick={() => {
                    const end = new Date();
                    const start = new Date();
                    start.setDate(end.getDate() - 7);
                    setFromDate(start.toISOString().slice(0, 10));
                    setToDate(end.toISOString().slice(0, 10));
                  }}
                >
                  7 Days
                </button>
              </div>
            </div>
          </div>
        </div>
      </section>

      {rows.some(row => row.cost_is_estimated) && <p role="note" className="text-xs px-3 py-2">Estimated historical profit: some sales or returns have no saved original cost and use the existing current-cost calculation.</p>}
      {/* ===== Summary KPIs ===== */}
      <div className="report-kpis report-kpis-6">
        <KpiCard
          label="Net Sale"
          value={fmtCurrency(computed.totals.net_sale)}
          note="Total sales − returns"
          icon={CurrencyDollarIcon}
          accent={themeColors.primary}
        />
        <KpiCard
          label="Cost of Sales"
          value={fmtCurrency(computed.totals.cost_of_sales)}
          note="Cost of goods sold"
          icon={ArrowTrendingDownIcon}
          accent={themeColors.danger}
        />
        <KpiCard
          label="Gross Profit"
          value={fmtCurrency(computed.totals.gp_amount)}
          note="Net sale − cost"
          icon={ArrowTrendingUpIcon}
          accent={themeColors.success}
        />
        <KpiCard
          label="GP %"
          value={fmtPct(computed.totals_gp_pct)}
          note="Gross margin"
          icon={ChartPieIcon}
          accent={themeColors.secondary}
        />
        <KpiCard
          label="Gross Sale"
          value={fmtCurrency(computed.totals.gross_sale)}
          note="Before discounts"
          icon={TagIcon}
          accent={themeColors.warning}
        />
        <KpiCard
          label="Total Sales"
          value={fmtCurrency(computed.totals.total_sales)}
          note="After discounts & tax"
          icon={ChartBarIcon}
          accent={themeColors.secondary}
        />
      </div>

      {/* ===== Data table ===== */}
      <section className="products-panel products-catalog">
        <div className="products-catalog-heading">
          <div className="flex items-center gap-3">
            <div className="report-section-icon">
              <DocumentChartBarIcon />
            </div>
            <div>
              <h2 className="products-section-title">Daily Cost of Sale</h2>
              <p className="products-subtitle">
                {loading ? (
                  <span className="inline-flex items-center gap-1.5">
                    <ArrowPathIcon className="h-3 w-3 animate-spin" />
                    Loading…
                  </span>
                ) : (
                  `${computed.withDerived.length} entries`
                )}
              </p>
            </div>
          </div>
        </div>

        <div
          className="report-table-scroll"
          tabIndex={0}
          role="region"
          aria-label="Cost of sale by day"
          aria-busy={loading}
        >
          <table className="report-table report-table-medium">
            <thead>
              <tr>
                <th scope="col">Date</th>
                <th scope="col" className="report-num">Gross Sale</th>
                <th scope="col" className="report-num">Item Disc.</th>
                <th scope="col" className="report-num">Flat Disc.</th>
                <th scope="col" className="report-num">Tax</th>
                <th scope="col" className="report-num">Total Sales</th>
                <th scope="col" className="report-num">Sale Return</th>
                <th scope="col" className="report-num">Net Sale</th>
                <th scope="col" className="report-num">Cost of Sales</th>
                <th scope="col" className="report-num">GP (Amt)</th>
                <th scope="col" className="report-num">GP %</th>
              </tr>
            </thead>

            <tbody>
              {computed.withDerived.length === 0 && !loading && (
                <tr>
                  <td colSpan={11} className="report-muted">
                    No data for the selected date range.
                  </td>
                </tr>
              )}

              {computed.withDerived.map((r, idx) => (
                <tr key={r.sale_date + "_" + idx}>
                  <td>{r.sale_date}{r.cost_is_estimated && <span className="block text-[10px] opacity-70">Estimated profit</span>}</td>
                  <td className="report-num">{fmtCurrency(r.gross_sale)}</td>
                  <td className="report-num">{fmtCurrency(r.item_discount)}</td>
                  <td className="report-num">{fmtCurrency(r.discount_amount)}</td>
                  <td className="report-num">{fmtCurrency(r.tax_amount)}</td>
                  <td className="report-num">{fmtCurrency(r.total_sales)}</td>
                  <td className="report-num">{fmtCurrency(r.sale_return)}</td>
                  <td className="report-num report-strong">{fmtCurrency(r.net_sale)}</td>
                  <td className="report-num">{fmtCurrency(r.cost_of_sales)}</td>
                  <td className="report-num report-amount-up">{fmtCurrency(r.gp_amount)}</td>
                  <td className="report-num">{fmtPct(r.gp_pct)}</td>
                </tr>
              ))}
            </tbody>

            <tfoot>
              <tr className="report-total-row">
                <td className="report-num">Totals</td>
                <td className="report-num">{fmtCurrency(computed.totals.gross_sale)}</td>
                <td className="report-num">{fmtCurrency(computed.totals.item_discount)}</td>
                <td className="report-num">{fmtCurrency(computed.totals.discount_amount)}</td>
                <td className="report-num">{fmtCurrency(computed.totals.tax_amount)}</td>
                <td className="report-num">{fmtCurrency(computed.totals.total_sales)}</td>
                <td className="report-num">{fmtCurrency(computed.totals.sale_return)}</td>
                <td className="report-num report-strong">{fmtCurrency(computed.totals.net_sale)}</td>
                <td className="report-num">{fmtCurrency(computed.totals.cost_of_sales)}</td>
                <td className="report-num report-amount-up report-strong">
                  {fmtCurrency(computed.totals.gp_amount)}
                </td>
                <td className="report-num">{fmtPct(computed.totals_gp_pct)}</td>
              </tr>
            </tfoot>
          </table>
        </div>
      </section>
    </div>
  );
}

/* ===== KPI Card Component ===== */
function KpiCard({ label, value, note, icon: Icon, accent }) {
  return (
    <div className="report-kpi" style={accent ? { "--report-accent": accent } : undefined}>
      <div className="report-kpi-head">
        <span className="report-kpi-icon">
          <Icon />
        </span>
        <span>{label}</span>
      </div>
      <div className="report-kpi-value">{value}</div>
      {note && <div className="report-kpi-note">{note}</div>}
    </div>
  );
}
