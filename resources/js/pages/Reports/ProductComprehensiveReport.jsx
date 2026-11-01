// resources/js/pages/Reports/ProductComprehensiveReport.jsx
import { useEffect, useMemo, useState } from "react";
import axios from "axios";
import toast from "react-hot-toast";
import { usePermissions, Guard } from "@/api/usePermissions";
import { useTheme } from "@/context/ThemeContext";

import {
  ArrowDownOnSquareIcon,
  ArrowPathIcon,
  ArrowTrendingDownIcon,
  ArrowTrendingUpIcon,
  CubeIcon,
  CurrencyDollarIcon,
  DocumentTextIcon,
  Squares2X2Icon,
  XMarkIcon,
} from "@heroicons/react/24/solid";
import ProductSearchInput from "@/components/ProductSearchInput.jsx";

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

export default function ProductComprehensiveReport() {
  // Filters
  const [fromDate, setFromDate] = useState("");
  const [toDate, setToDate] = useState("");
  const [productValue, setProductValue] = useState(null);
  const [productId, setProductId] = useState("");
  const [products, setProducts] = useState([]);

  // Data + States
  const [data, setData] = useState({ product: null, transactions: [], summary: {} });
  const [loading, setLoading] = useState(false);
  const [pdfLoading, setPdfLoading] = useState(false);

  // permissions
  const { loading: permsLoading, canFor } = usePermissions();
  const can = useMemo(
    () =>
      (typeof canFor === "function" ? canFor("report.product-comprehensive") : {
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

  /* ============ Set default date range on mount ============ */
  useEffect(() => {
    const now = new Date();
    const firstDay = new Date(now.getFullYear(), now.getMonth(), 1);
    const lastDay = new Date(now.getFullYear(), now.getMonth() + 1, 0);

    const formatYMD = (date) => date.toISOString().split("T")[0];

    if (!fromDate) setFromDate(formatYMD(firstDay));
    if (!toDate) setToDate(formatYMD(lastDay));
  }, []);

  /* ============ Product fetch (for ProductSearchInput) ============ */
  const fetchProducts = async (q = "") => {
    try {
      const { data } = await axios.get("/api/products/search", { params: { q, limit: 30 } });
      setProducts(Array.isArray(data) ? data : []);
    } catch {
      setProducts([]);
    }
  };

  /* ============ Fetch report ============ */
  const fetchReport = async () => {
    if (!can.view) return toast.error("You don't have permission to view this report.");

    if (!productId) {
      return toast.error("Please select a product first.");
    }

    setLoading(true);
    try {
      const res = await axios.get("/api/reports/product-comprehensive", {
        params: {
          from: fromDate || undefined,
          to: toDate || undefined,
          product_id: productId,
        },
      });

      const responseData = res.data || {};
      setData({
        product: responseData.product || null,
        transactions: Array.isArray(responseData.transactions) ? responseData.transactions : [],
        summary: responseData.summary || {},
      });

      if (!responseData.transactions?.length) {
        toast("No transactions found for this product.", { icon: "ℹ️" });
      }
    } catch (err) {
      console.error(err);
      const msg = err.response?.data?.message || "Failed to fetch Product Comprehensive report";
      toast.error(msg);
      setData({ product: null, transactions: [], summary: {} });
    } finally {
      setLoading(false);
    }
  };

  /* ============ Export PDF ============ */
  const exportPdf = async () => {
    if (!can.export) return toast.error("You don't have permission to export PDF.");
    if (!productId) return toast.error("Please select a product first.");

    setPdfLoading(true);
    try {
      const res = await axios.get("/api/reports/product-comprehensive/pdf", {
        params: {
          from: fromDate || undefined,
          to: toDate || undefined,
          product_id: productId,
        },
        responseType: "blob",
      });
      const blob = new Blob([res.data], { type: "application/pdf" });
      const url = URL.createObjectURL(blob);
      const win = window.open(url, "_blank");
      if (!win) {
        const a = document.createElement("a");
        a.href = url;
        a.download = `product-comprehensive-${productId || "report"}.pdf`;
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
    setProductValue(null);
    setProductId("");
    setData({ product: null, transactions: [], summary: {} });
  };

  // Computed values
  const { product, transactions, summary } = data;

  const getTypeBadge = (type) => {
    switch (type) {
      case "purchase":
        return <span className="report-type report-type-in">PURCHASE</span>;
      case "sale":
        return <span className="report-type report-type-out">SALE</span>;
      case "purchase_return":
        return <span className="report-type report-status-warning">P.RETURN</span>;
      case "sale_return":
        return <span className="report-type report-badge">S.RETURN</span>;
      default:
        return null;
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
              <DocumentTextIcon className="w-6 h-6" />
            </div>
            <div className="min-w-0">
              <h1 className="products-title">Product Comprehensive Report</h1>
              <p className="products-subtitle">
                <Squares2X2Icon className="w-3.5 h-3.5 shrink-0" />
                <span className="truncate">{transactions.length} transactions</span>
              </p>
            </div>
          </div>

          <div className="flex flex-wrap items-center gap-2">
            <Guard when={can.export}>
              <button
                type="button"
                onClick={exportPdf}
                disabled={pdfLoading || transactions.length === 0}
                title={
                  transactions.length === 0
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
                title="Load the product comprehensive report"
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
              <span className="products-filter-label">Product</span>
              <div className="flex items-center gap-2">
                <div className="flex-1 min-w-0">
                  <ProductSearchInput
                    className="h-9 text-xs px-3 rounded-lg"
                    value={productValue || productId}
                    onChange={(val) => {
                      const selected = val && typeof val === "object" ? val : null;
                      setProductValue(selected);
                      setProductId(selected?.id ? String(selected.id) : "");
                    }}
                    products={products}
                    onRefreshProducts={fetchProducts}
                  />
                </div>
                {productValue && (
                  <button
                    type="button"
                    onClick={() => {
                      setProductValue(null);
                      setProductId("");
                    }}
                    className="report-icon-btn"
                    aria-label="Clear product"
                    title="Clear product"
                  >
                    <XMarkIcon />
                  </button>
                )}
              </div>
            </div>
          </div>
        </div>
      </section>

      {/* ===== Empty state ===== */}
      {transactions.length === 0 && !loading && (
        <section className="products-panel">
          <p className="report-state">
            {product
              ? "No transactions found for this product in the selected date range."
              : "Select a product and click \"Load Report\" to view the report."}
          </p>
        </section>
      )}

      {/* ===== Product summary ===== */}
      {product && (
        <div className="report-product-summary">
          <div className="min-w-0">
            <h2 className="report-product-title">{product.name}</h2>
            <div className="report-product-meta">
              {product.product_code && (
                <span>Code: <strong>{product.product_code}</strong></span>
              )}
              {product.category_name && (
                <span>Category: <strong>{product.category_name}</strong></span>
              )}
              {product.brand_name && (
                <span>Brand: <strong>{product.brand_name}</strong></span>
              )}
              {product.pack_size && (
                <span>Pack Size: <strong>{product.pack_size}</strong></span>
              )}
            </div>
          </div>
          <div className="report-stock-tile">
            <div className="report-stock-label">Current Stock</div>
            <div className="report-stock-value">{fmtNumber(product.current_quantity)}</div>
          </div>
        </div>
      )}

      {transactions.length > 0 && (
        <>
          {/* ===== Summary KPIs ===== */}
          <div className="report-kpis report-kpis-6">
            <KpiCard
              label="Total Purchase"
              value={fmtCurrency(summary.total_purchases)}
              note="Purchases in range"
              icon={ArrowDownOnSquareIcon}
              accent={themeColors.secondary}
            />
            <KpiCard
              label="Purchase Returns"
              value={fmtCurrency(summary.total_purchase_returns)}
              note="Returned to supplier"
              icon={ArrowPathIcon}
              accent={themeColors.warning}
            />
            <KpiCard
              label="Net Purchase"
              value={fmtCurrency(summary.net_purchases)}
              note="Purchases − returns"
              icon={CubeIcon}
              accent={themeColors.primary}
            />
            <KpiCard
              label="Total Sale"
              value={fmtCurrency(summary.total_sales)}
              note="Sales in range"
              icon={CurrencyDollarIcon}
              accent={themeColors.primary}
            />
            <KpiCard
              label="Sale Returns"
              value={fmtCurrency(summary.total_sale_returns)}
              note="Returned by customer"
              icon={ArrowPathIcon}
              accent={themeColors.warning}
            />
            <KpiCard
              label="Net Sale"
              value={fmtCurrency(summary.net_sales)}
              note="Sales − returns"
              icon={ArrowTrendingUpIcon}
              accent={themeColors.success}
            />
          </div>

          {/* ===== Quantity summary ===== */}
          <div className="report-kpis report-kpis-2">
            <KpiCard
              label="Total In"
              value={fmtNumber(summary.total_quantity_in)}
              note="Units received"
              icon={ArrowTrendingUpIcon}
              accent={themeColors.success}
            />
            <KpiCard
              label="Total Out"
              value={fmtNumber(summary.total_quantity_out)}
              note="Units issued"
              icon={ArrowTrendingDownIcon}
              accent={themeColors.danger}
            />
          </div>

          {/* ===== Transactions table ===== */}
          <section className="products-panel products-catalog">
            <div className="products-catalog-heading">
              <div className="flex items-center gap-3">
                <div className="report-section-icon">
                  <Squares2X2Icon />
                </div>
                <div>
                  <h2 className="products-section-title">Transactions</h2>
                  <p className="products-subtitle">
                    {loading ? (
                      <span className="inline-flex items-center gap-1.5">
                        <ArrowPathIcon className="h-3 w-3 animate-spin" />
                        Loading…
                      </span>
                    ) : (
                      `${transactions.length} entries`
                    )}
                  </p>
                </div>
              </div>
            </div>

            <div
              className="report-table-scroll"
              tabIndex={0}
              role="region"
              aria-label="Product transactions"
              aria-busy={loading}
            >
              <table className="report-table report-table-medium">
                <thead>
                  <tr>
                    <th scope="col">#</th>
                    <th scope="col">Date</th>
                    <th scope="col">Type</th>
                    <th scope="col">Ref #</th>
                    <th scope="col">Supplier/Customer</th>
                    <th scope="col">Batch</th>
                    <th scope="col">Expiry</th>
                    <th scope="col" className="report-num">Qty In</th>
                    <th scope="col" className="report-num">Qty Out</th>
                    <th scope="col" className="report-num">Unit Price</th>
                    <th scope="col" className="report-num">Subtotal</th>
                  </tr>
                </thead>

                <tbody>
                  {transactions.map((txn, idx) => (
                    <tr key={idx}>
                      <td className="report-muted">{idx + 1}</td>
                      <td>{fmtDate(txn.date)}</td>
                      <td>{getTypeBadge(txn.type)}</td>
                      <td className="report-strong">{txn.reference_number || "-"}</td>
                      <td>{txn.counter_party || "-"}</td>
                      <td className="report-mono">{txn.batch || "-"}</td>
                      <td>{fmtDate(txn.expiry)}</td>
                      <td className="report-num report-amount-up">
                        {txn.quantity_in > 0 ? fmtNumber(txn.quantity_in) : "-"}
                      </td>
                      <td className="report-num report-amount-down">
                        {txn.quantity_out > 0 ? fmtNumber(txn.quantity_out) : "-"}
                      </td>
                      <td className="report-num">{fmtCurrency(txn.unit_price)}</td>
                      <td className="report-num report-strong">{fmtCurrency(txn.sub_total)}</td>
                    </tr>
                  ))}

                  {transactions.length === 0 && (
                    <tr>
                      <td colSpan={11} className="report-muted">
                        No transactions found.
                      </td>
                    </tr>
                  )}
                </tbody>

                <tfoot>
                  <tr className="report-total-row">
                    <td colSpan={7} className="report-num">Totals</td>
                    <td className="report-num report-amount-up">
                      {fmtNumber(summary.total_quantity_in)}
                    </td>
                    <td className="report-num report-amount-down">
                      {fmtNumber(summary.total_quantity_out)}
                    </td>
                    <td className="report-num report-muted">—</td>
                    <td className="report-num report-muted">—</td>
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
