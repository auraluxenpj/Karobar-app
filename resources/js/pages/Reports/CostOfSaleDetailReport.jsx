// resources/js/pages/Reports/CostOfSaleDetailReport.jsx
import { useMemo, useState } from "react";
import axios from "axios";
import toast from "react-hot-toast";
import { usePermissions, Guard } from "@/api/usePermissions";
import { useTheme } from "@/context/ThemeContext";

// Search modal
import SaleInvoiceSearch from "@/components/SaleInvoiceSearch.jsx";

import {
  ArrowDownOnSquareIcon,
  ArrowPathIcon,
  ArrowTrendingDownIcon,
  ArrowTrendingUpIcon,
  ChartPieIcon,
  CurrencyDollarIcon,
  DocumentTextIcon,
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
const todayStr = () => new Date().toISOString().split("T")[0];
const n = (v) => (isFinite(Number(v)) ? Number(v) : 0);
const fmtCurrency = (v) =>
  n(v).toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 });

export default function CostOfSaleDetailReport() {
  // Default date range: Current month
  const [fromDate, setFromDate] = useState(() => {
    const d = new Date();
    d.setDate(1);
    return d.toISOString().split("T")[0];
  });
  const [toDate, setToDate] = useState(todayStr());

  // Search modal state
  const [searchOpen, setSearchOpen] = useState(false);
  const [selectedInvoice, setSelectedInvoice] = useState(null);

  // Data + States
  const [data, setData] = useState({ invoices: [], summary: {} });
  const [loading, setLoading] = useState(false);
  const [pdfLoading, setPdfLoading] = useState(false);

  // permissions
  const { loading: permsLoading, canFor } = usePermissions();
  const can = useMemo(
    () =>
      (typeof canFor === "function" ? canFor("report.cost-of-sale-detail") : {
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

  // Handle invoice selection from search modal
  const handleInvoiceSelect = (invoice) => {
    setSelectedInvoice(invoice);
    setSearchOpen(false);
  };

  /* ============ Fetch report ============ */
  const fetchReport = async () => {
    if (!can.view) return toast.error("You don't have permission to view this report.");
    if (fromDate > toDate) return toast.error("'From' date cannot be after 'To' date.");

    setLoading(true);
    try {
      const res = await axios.get("/api/reports/cost-of-sale-detail", {
        params: {
          invoice_id: selectedInvoice?.id || undefined,
          from: fromDate || undefined,
          to: toDate || undefined,
        },
      });

      const responseData = res.data || { invoices: [], summary: {} };
      setData(responseData);

      if (!responseData.invoices?.length) {
        toast("No data found for selected filters.");
      }
    } catch (err) {
      console.error(err);
      toast.error("Failed to fetch Cost of Sale Detail report");
      setData({ invoices: [], summary: {} });
    } finally {
      setLoading(false);
    }
  };

  /* ============ Export PDF ============ */
  const exportPdf = async () => {
    if (!can.export) return toast.error("You don't have permission to export PDF.");
    if (!data.invoices?.length) return toast.error("No data to export.");

    setPdfLoading(true);
    try {
      const res = await axios.get("/api/reports/cost-of-sale-detail/pdf", {
        params: {
          invoice_id: selectedInvoice?.id || undefined,
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
        a.download = `cost-of-sale-detail-${fromDate || "report"}.pdf`;
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

  const resetFilters = () => {
    setFromDate(() => {
      const d = new Date();
      d.setDate(1);
      return d.toISOString().split("T")[0];
    });
    setToDate(todayStr());
    setSelectedInvoice(null);
    setData({ invoices: [], summary: {} });
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

  const { invoices, summary } = data;

  return (
    <div className="report-page">
      {/* ===== Glass overview: title, actions, filters ===== */}
      <section className="products-panel">
        <div className="products-heading">
          <div className="flex items-center gap-3 min-w-0">
            <div className="products-identity-icon">
              <DocumentTextIcon className="w-6 h-6" />
            </div>
            <div className="min-w-0">
              <h1 className="products-title">Cost of Sale Detail Report</h1>
              <p className="products-subtitle">
                <DocumentTextIcon className="w-3.5 h-3.5 shrink-0" />
                <span className="truncate">
                  {invoices.length} invoice(s) • {summary.total_items || 0} items
                </span>
              </p>
            </div>
          </div>

          <div className="flex flex-wrap items-center gap-2">
            <Guard when={can.export}>
              <button
                type="button"
                onClick={exportPdf}
                disabled={pdfLoading || invoices.length === 0}
                title={
                  invoices.length === 0
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
              title="Reset the filters and results"
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
                title="Load the cost of sale detail report"
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

            <div className="products-filter">
              <span className="products-filter-label">Invoice</span>
              <button
                type="button"
                onClick={() => setSearchOpen(true)}
                title="Search and select an invoice"
                className="report-input flex items-center gap-2 text-left cursor-pointer"
              >
                <DocumentTextIcon className="w-5 h-5 shrink-0 text-[var(--workspace-muted)]" />
                {selectedInvoice ? (
                  <span className="truncate">
                    {selectedInvoice.posted_number || `#${selectedInvoice.id}`} - {selectedInvoice.customer_name || 'Walk-in'}
                  </span>
                ) : (
                  <span className="truncate text-[var(--workspace-muted)]">All invoices — click to select…</span>
                )}
              </button>
            </div>

            <div className="products-filter report-span-all">
              <span className="products-filter-label">Quick range</span>
              <div className="report-quick">
                <button
                  type="button"
                  className="products-action theme-btn-tertiary"
                  onClick={() => {
                    const end = new Date();
                    const start = new Date();
                    start.setDate(1);
                    setFromDate(start.toISOString().slice(0, 10));
                    setToDate(end.toISOString().slice(0, 10));
                    fetchReport();
                  }}
                >
                  This Month
                </button>

                <button
                  type="button"
                  className="products-action theme-btn-tertiary"
                  onClick={() => {
                    const end = new Date();
                    const start = new Date();
                    start.setMonth(start.getMonth() - 1);
                    start.setDate(1);
                    setFromDate(start.toISOString().slice(0, 10));
                    setToDate(end.toISOString().slice(0, 10));
                    fetchReport();
                  }}
                >
                  Last Month
                </button>
              </div>
            </div>
          </div>
        </div>
      </section>

      {invoices.some(invoice => invoice.cost_is_estimated) && <p role="note" className="text-xs px-3 py-2">Estimated historical profit: some items have no saved original cost and use the existing current-cost calculation.</p>}
      {/* ===== Summary KPIs ===== */}
      {invoices.length > 0 && (
        <div className="report-kpis">
          <KpiCard
            label="Total Invoices"
            value={summary.total_invoices || 0}
            note="Invoices in range"
            icon={DocumentTextIcon}
            accent={themeColors.primary}
          />
          <KpiCard
            label="Total Sales"
            value={`Rs. ${fmtCurrency(summary.total_sales || 0)}`}
            note="Invoice sales value"
            icon={CurrencyDollarIcon}
            accent={themeColors.secondary}
          />
          <KpiCard
            label="Total Cost"
            value={`Rs. ${fmtCurrency(summary.total_cost || 0)}`}
            note="Cost of goods sold"
            icon={ArrowTrendingDownIcon}
            accent={themeColors.warning}
          />
          <KpiCard
            label="Total Profit"
            value={`Rs. ${fmtCurrency(summary.total_profit || 0)}`}
            note="Sales − cost"
            icon={ArrowTrendingUpIcon}
            accent={themeColors.success}
          />
          <KpiCard
            label="Profit Margin"
            value={`${summary.profit_margin || 0}%`}
            note="Profit / sales"
            icon={ChartPieIcon}
            accent={themeColors.secondary}
          />
        </div>
      )}

      {/* ===== No data ===== */}
      {invoices.length === 0 && !loading && (
        <section className="products-panel">
          <p className="report-state">
            No data found. Select an invoice or date range and click "Load Report".
          </p>
        </section>
      )}

      {/* ===== Invoice detail cards ===== */}
      {invoices.length > 0 && (
        <div className="report-detail-list">
          {invoices.map((inv, idxInv) => (
            <section
              key={idxInv + "-" + (inv.invoice_id ?? inv.posted_number ?? "")}
              className="products-panel report-invoice"
            >
              {/* Invoice header */}
              <div className="report-invoice-head">
                <div className="min-w-0">
                  <span className="report-invoice-number">
                    {inv.posted_number || `INV-${inv.invoice_id}`}
                  </span>
                  <div className="report-invoice-meta">
                    <span>{inv.date || '-'}</span>
                    <span>
                      Customer: <strong>{inv.customer_name || 'WALK-IN-CUSTOMER'}</strong>
                    </span>
                  </div>
                </div>
                <div className="report-invoice-chips">
                  <span className="report-badge">{inv.cost_is_estimated ? "Includes estimated profit" : "Saved sale costs"}</span>
                  <span className="report-badge">{inv.invoice_type?.toUpperCase() || 'DEBIT'}</span>
                  <span className="report-badge">{inv.sale_type?.toUpperCase() || 'RETAIL'}</span>
                </div>
              </div>

              {/* Items table */}
              <div className="report-invoice-table-scroll">
                <table className="report-table">
                  <thead>
                    <tr>
                      <th scope="col">#</th>
                      <th scope="col">Product Name</th>
                      <th scope="col">Code</th>
                      <th scope="col" className="report-num">Pack Size</th>
                      <th scope="col" className="report-num">Qty</th>
                      <th scope="col" className="report-num">Cost Price</th>
                      <th scope="col" className="report-num">Sale Price</th>
                      <th scope="col" className="report-num">Disc %</th>
                      <th scope="col" className="report-num">Total Cost</th>
                      <th scope="col" className="report-num">Total Sale</th>
                      <th scope="col" className="report-num">Profit</th>
                    </tr>
                  </thead>

                  <tbody>
                    {(inv.items || []).map((it, idx) => (
                      <tr key={(it.id ?? idx) + "-" + (it.product_id ?? "p") + "-" + idx}>
                        <td className="report-muted">{idx + 1}</td>
                        <td className="report-product">{it.product_name || "-"}</td>
                        <td className="report-meta">{it.product_code || "-"}</td>
                        <td className="report-num">{it.pack_size ?? 0}</td>
                        <td className="report-num">{it.quantity ?? 0}</td>
                        <td className="report-num">Rs. {fmtCurrency(it.cost_price)}</td>
                        <td className="report-num">Rs. {fmtCurrency(it.sale_price)}</td>
                        <td className={`report-num ${(it.item_discount_percentage ?? 0) > 0 ? "report-amount-down" : ""}`}>
                          {(it.item_discount_percentage ?? 0) > 0 ? `${it.item_discount_percentage}%` : '-'}
                        </td>
                        <td className="report-num">Rs. {fmtCurrency(it.total_cost)}</td>
                        <td className="report-num">Rs. {fmtCurrency(it.total_sale)}</td>
                        <td className={`report-num report-strong ${(it.profit ?? 0) >= 0 ? "report-amount-up" : "report-amount-down"}`}>
                          Rs. {fmtCurrency(it.profit)}
                        </td>
                      </tr>
                    ))}

                    {(!inv.items || !inv.items.length) && (
                      <tr>
                        <td colSpan={11} className="report-muted">
                          No items in this invoice.
                        </td>
                      </tr>
                    )}
                  </tbody>

                  <tfoot>
                    <tr className="report-total-row">
                      <td colSpan={8} className="report-num">Total</td>
                      <td className="report-num">Rs. {fmtCurrency(inv.total_cost)}</td>
                      <td className="report-num">Rs. {fmtCurrency(inv.total_sale)}</td>
                      <td className={`report-num ${(inv.profit ?? 0) >= 0 ? "report-amount-up" : "report-amount-down"}`}>
                        Rs. {fmtCurrency(inv.profit)}
                      </td>
                    </tr>
                  </tfoot>
                </table>
              </div>

              {/* Invoice footer totals */}
              <div className="report-invoice-footer">
                <div>
                  <span>Gross Amount:</span>
                  <strong>Rs. {fmtCurrency(inv.gross_amount)}</strong>
                </div>

                {(inv.discount_percentage > 0 || inv.discount_amount > 0) && (
                  <div>
                    <span>Disc {inv.discount_percentage ? `(${inv.discount_percentage}%)` : ''}:</span>
                    <strong className="report-amount-down">-Rs. {fmtCurrency(inv.discount_amount)}</strong>
                  </div>
                )}

                {(inv.tax_percentage > 0 || inv.tax_amount > 0) && (
                  <div>
                    <span>Tax {inv.tax_percentage ? `(${inv.tax_percentage}%)` : ''}:</span>
                    <strong>+Rs. {fmtCurrency(inv.tax_amount)}</strong>
                  </div>
                )}

                <div>
                  <span>Invoice Total:</span>
                  <strong className="report-strong">Rs. {fmtCurrency(inv.total)}</strong>
                </div>

                <div>
                  <span>Cost:</span>
                  <strong>Rs. {fmtCurrency(inv.total_cost)}</strong>
                </div>

                <div>
                  <span>Profit:</span>
                  <strong className={(inv.profit ?? 0) >= 0 ? "report-amount-up" : "report-amount-down"}>
                    Rs. {fmtCurrency(inv.profit)}
                  </strong>
                  <span>({inv.profit_margin || 0}%)</span>
                </div>
              </div>
            </section>
          ))}
        </div>
      )}

      {/* ===== Search invoice modal ===== */}
      <SaleInvoiceSearch
        isOpen={searchOpen}
        onClose={() => setSearchOpen(false)}
        onSelect={handleInvoiceSelect}
      />
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
