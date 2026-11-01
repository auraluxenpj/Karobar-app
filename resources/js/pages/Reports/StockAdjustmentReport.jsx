// resources/js/pages/Reports/StockAdjustmentReport.jsx
import { useEffect, useState, useMemo } from "react";
import axios from "axios";
import toast from "react-hot-toast";
import { usePermissions, Guard } from "@/api/usePermissions";
import { useTheme } from "@/context/ThemeContext";

import {
  ArrowDownOnSquareIcon,
  ArrowPathIcon,
  ArrowTrendingUpIcon,
  DocumentTextIcon,
  Squares2X2Icon,
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

/* ======================
   Helpers
   ====================== */

const n = (v) => (isFinite(Number(v)) ? Number(v) : 0);
const fmtCurrency = (v) =>
  n(v).toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 });
const fmtNumber = (v) =>
  n(v).toLocaleString(undefined, { minimumFractionDigits: 0, maximumFractionDigits: 0 });
const fmtDate = (v) => {
  if (!v) return "-";
  if (typeof v === "string") {
    if (/^\d{4}-\d{2}-\d{2}$/.test(v)) return v;
    const d = new Date(v);
    return isNaN(d.getTime()) ? v : d.toISOString().split("T")[0];
  }
  if (v instanceof Date) {
    return v.toISOString().split("T")[0];
  }
  return v;
};

/* ======================
   Main Component
   ====================== */

export default function StockAdjustmentReport() {
  // Filters
  const [fromDate, setFromDate] = useState("");
  const [toDate, setToDate] = useState("");

  // Data + States
  const [data, setData] = useState({ rows: [], summary: {} });
  const [loading, setLoading] = useState(false);
  const [pdfLoading, setPdfLoading] = useState(false);

  // permissions
  const { loading: permsLoading, canFor } = usePermissions();
  const can = useMemo(
    () =>
      (typeof canFor === "function" ? canFor("report.stock-adjustment") : {
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
        danger: '#dc2626',
      };
    }
    return {
      primary: theme.primary_color || '#2563eb',
      secondary: theme.secondary_color || '#0f766e',
      success: theme.success_color || '#15803d',
      danger: theme.danger_color || '#dc2626',
    };
  }, [theme]);

  const primaryTextColor = useMemo(
    () => getContrastText(themeColors.primary),
    [themeColors.primary]
  );

  /* ============ Set default date range on mount ============ */
  useEffect(() => {
    const now = new Date();
    const firstDay = new Date(now.getFullYear(), now.getMonth(), 1);
    const lastDay = new Date(now.getFullYear(), now.getMonth() + 1, 0);
    const formatYMD = (date) => date.toISOString().split("T")[0];

    if (!fromDate) setFromDate(formatYMD(firstDay));
    if (!toDate) setToDate(formatYMD(lastDay));
  }, []);

  /* ============ Fetch report ============ */
  const fetchReport = async () => {
    if (!can.view) return toast.error("You don't have permission to view this report.");

    setLoading(true);
    try {
      const res = await axios.get("/api/reports/stock-adjustment", {
        params: {
          from: fromDate || undefined,
          to: toDate || undefined,
        },
      });

      const responseData = res.data || {};
      const rows = Array.isArray(responseData.rows) ? responseData.rows : [];
      const summary = responseData.summary || {};

      setData({ rows, summary });
      if (!rows.length) toast("No stock adjustments found for the selected date range.", { icon: "ℹ️" });
    } catch (err) {
      console.error(err);
      toast.error("Failed to fetch Stock Adjustment report");
      setData({ rows: [], summary: {} });
    } finally {
      setLoading(false);
    }
  };

  /* ============ Export PDF ============ */
  const exportPdf = async () => {
    if (!can.export) return toast.error("You don't have permission to export PDF.");
    setPdfLoading(true);
    try {
      const res = await axios.get("/api/reports/stock-adjustment/pdf", {
        params: {
          from: fromDate || undefined,
          to: toDate || undefined,
        },
        responseType: "blob",
      });
      const blob = new Blob([res.data], { type: "application/pdf" });
      const url = URL.createObjectURL(blob);
      const win = window.open(url, "_blank");
      if (!win) {
        const a = document.createElement("a");
        a.href = url;
        a.download = `stock-adjustment-${fromDate || "report"}.pdf`;
        document.body.appendChild(a);
        a.click();
        document.body.removeChild(a);
      }
      setTimeout(() => URL.revokeObjectURL(url), 10000);
    } catch (e) {
      console.error(e);
      toast.error("Failed to generate PDF");
    } finally {
      setPdfLoading(false);
    }
  };

  /* ============ Reset filters ============ */
  const resetFilters = () => {
    const now = new Date();
    const firstDay = new Date(now.getFullYear(), now.getMonth(), 1);
    const lastDay = new Date(now.getFullYear(), now.getMonth() + 1, 0);
    const formatYMD = (date) => date.toISOString().split("T")[0];

    setFromDate(formatYMD(firstDay));
    setToDate(formatYMD(lastDay));
    setData({ rows: [], summary: {} });
  };

  // Computed values
  const { rows, summary } = data;

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
      {/* ===== Glass overview: title, actions, date range ===== */}
      <section className="products-panel">
        <div className="products-heading">
          <div className="flex items-center gap-3 min-w-0">
            <div className="products-identity-icon">
              <DocumentTextIcon className="w-6 h-6" />
            </div>
            <div className="min-w-0">
              <h1 className="products-title">Stock Adjustment Report</h1>
              <p className="products-subtitle">
                <Squares2X2Icon className="w-3.5 h-3.5 shrink-0" />
                <span className="truncate">{rows.length} adjustments</span>
              </p>
            </div>
          </div>

          <div className="flex flex-wrap items-center gap-2">
            <Guard when={can.export}>
              <button
                type="button"
                onClick={exportPdf}
                disabled={pdfLoading || rows.length === 0}
                title={
                  rows.length === 0
                    ? "Load the report before exporting"
                    : pdfLoading
                    ? "Generating PDF…"
                    : "Export report as PDF"
                }
                className="products-action theme-btn-secondary"
              >
                <ArrowDownOnSquareIcon className="w-4 h-4" />
                <span>{pdfLoading ? "Generating…" : "Export PDF"}</span>
              </button>
            </Guard>

            <button
              type="button"
              onClick={resetFilters}
              title="Reset the date range and results"
              className="products-action theme-btn-tertiary"
            >
              <ArrowPathIcon className="w-4 h-4" />
              <span>Reset</span>
            </button>

            <Guard when={can.view}>
              <button
                type="button"
                onClick={fetchReport}
                disabled={loading}
                title="Load the stock adjustment report"
                className="products-action products-action-primary theme-btn-primary"
              >
                {loading ? (
                  <ArrowPathIcon className="w-4 h-4 animate-spin" />
                ) : (
                  <DocumentTextIcon className="w-4 h-4" />
                )}
                <span>{loading ? "Loading…" : "Load Report"}</span>
              </button>
            </Guard>
          </div>
        </div>

        <div className="products-filter-panel">
          <div className="report-filters report-filters-pair">
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
          </div>
        </div>
      </section>

      {/* ===== Empty state ===== */}
      {rows.length === 0 && !loading && (
        <section className="products-panel">
          <p className="report-state">
            No stock adjustments found. Adjust filters and click "Load Report".
          </p>
        </section>
      )}

      {/* ===== Results ===== */}
      {rows.length > 0 && (
        <>
          {/* ===== Summary KPIs ===== */}
          <div className="report-kpis">
            <KpiCard
              label="Total Adjustments"
              value={fmtNumber(summary.total_adjustments)}
              note="Adjustment records"
              icon={DocumentTextIcon}
              accent={themeColors.primary}
            />
            <KpiCard
              label="Total Items"
              value={fmtNumber(summary.total_items)}
              note="Lines adjusted"
              icon={Squares2X2Icon}
              accent={themeColors.secondary}
            />
            <KpiCard
              label="Worth Adjusted"
              value={fmtCurrency(summary.total_worth_adjusted)}
              note="Net stock value change"
              icon={ArrowTrendingUpIcon}
              accent={themeColors.primary}
            />
            <KpiCard
              label="Positive Adj."
              value={fmtNumber(summary.positive_adjustments)}
              note="Stock increases"
              icon={ArrowDownOnSquareIcon}
              accent={themeColors.success}
            />
            <KpiCard
              label="Negative Adj."
              value={fmtNumber(summary.negative_adjustments)}
              note="Stock decreases"
              icon={ArrowPathIcon}
              accent={themeColors.danger}
            />
          </div>

          {/* ===== Adjustments table ===== */}
          <section className="products-panel products-catalog">
            <div className="products-catalog-heading">
              <div className="flex items-center gap-3">
                <div className="report-section-icon">
                  <Squares2X2Icon />
                </div>
                <div>
                  <h2 className="products-section-title">Stock Adjustments</h2>
                  <p className="products-subtitle">
                    {loading ? (
                      <span className="inline-flex items-center gap-1.5">
                        <ArrowPathIcon className="h-3 w-3 animate-spin" />
                        Loading…
                      </span>
                    ) : (
                      `${rows.length} adjustments`
                    )}
                  </p>
                </div>
              </div>
            </div>

            <div
              className="report-table-scroll"
              tabIndex={0}
              role="region"
              aria-label="Stock adjustments"
              aria-busy={loading}
            >
              <table className="report-table report-table-wide">
                <thead>
                  <tr>
                    <th scope="col">#</th>
                    <th scope="col">Adjustment #</th>
                    <th scope="col">Date</th>
                    <th scope="col">Product</th>
                    <th scope="col">Batch</th>
                    <th scope="col">Expiry</th>
                    <th scope="col" className="report-num">Prev Qty</th>
                    <th scope="col" className="report-num">Actual Qty</th>
                    <th scope="col" className="report-num">Diff Qty</th>
                    <th scope="col" className="report-num">Unit Price</th>
                    <th scope="col" className="report-num">Worth Adj.</th>
                    <th scope="col">Reason/Note</th>
                    <th scope="col">User</th>
                  </tr>
                </thead>

                <tbody>
                  {rows.map((row, idx) => {
                    const items = row.items || [];
                    if (items.length === 0) {
                      return (
                        <tr key={`row-${row.id || idx}`}>
                          <td colSpan={13} className="report-muted">
                            No items in this adjustment
                          </td>
                        </tr>
                      );
                    }
                    return items.map((item, itemIdx) => {
                      const isPositive = item.diff_qty > 0;
                      const isNegative = item.diff_qty < 0;
                      return (
                        <tr key={`${row.id}-${item.id || itemIdx}`}>
                          <td className="report-muted">{idx + 1}</td>
                          <td className="report-strong">{row.posted_number || "-"}</td>
                          <td>{fmtDate(row.posted_date)}</td>
                          <td className="report-strong">
                            {item.product_name || "-"}
                            <div className="report-meta">{item.product_code}</div>
                          </td>
                          <td>{item.batch_number || "-"}</td>
                          <td>{fmtDate(item.expiry)}</td>
                          <td className="report-num">{fmtNumber(item.previous_qty)}</td>
                          <td className="report-num">{fmtNumber(item.actual_qty)}</td>
                          <td
                            className={`report-num ${
                              isPositive
                                ? "report-diff-up"
                                : isNegative
                                ? "report-diff-down"
                                : ""
                            }`}
                          >
                            {item.diff_qty > 0 ? "+" : ""}
                            {fmtNumber(item.diff_qty)}
                          </td>
                          <td className="report-num">{fmtCurrency(item.unit_purchase_price)}</td>
                          <td
                            className={`report-num ${
                              item.worth_adjusted >= 0 ? "report-amount-up" : "report-amount-down"
                            }`}
                          >
                            {fmtCurrency(item.worth_adjusted)}
                          </td>
                          <td className="report-note" title={row.note}>
                            {row.note || "-"}
                          </td>
                          <td>{row.user_name || "-"}</td>
                        </tr>
                      );
                    });
                  })}

                  {(!rows || rows.length === 0) && (
                    <tr>
                      <td colSpan={13} className="report-muted">
                        No stock adjustments found.
                      </td>
                    </tr>
                  )}
                </tbody>

                <tfoot>
                  <tr className="report-total-row">
                    <td colSpan={6} className="report-num">Totals</td>
                    <td className="report-num report-muted">—</td>
                    <td className="report-num report-muted">—</td>
                    <td className="report-num report-muted">—</td>
                    <td className="report-num report-muted">—</td>
                    <td className="report-num report-amount-up">
                      {fmtCurrency(summary.total_worth_adjusted)}
                    </td>
                    <td colSpan={2}></td>
                  </tr>
                </tfoot>
              </table>
            </div>
          </section>
        </>
      )}
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
