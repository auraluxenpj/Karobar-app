// resources/js/pages/Reports/NearExpiryProductReport.jsx
import { useMemo, useState } from "react";
import axios from "axios";
import toast from "react-hot-toast";
import { usePermissions, Guard } from "@/api/usePermissions";
import { useTheme } from "@/context/ThemeContext.jsx";

import {
  ArrowDownOnSquareIcon,
  ArrowPathIcon,
  BuildingStorefrontIcon,
  CalendarIcon,
  ClipboardDocumentListIcon,
  ClockIcon,
  TagIcon,
  XMarkIcon,
} from "@heroicons/react/24/solid";
import SupplierSearch from "@/components/SupplierSearch.jsx";
import BrandSearch from "@/components/BrandSearch.jsx";
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

const localISODate = (d = new Date()) => {
  const tzOffsetMs = d.getTimezoneOffset() * 60000;
  return new Date(d.getTime() - tzOffsetMs).toISOString().slice(0, 10);
};

export default function NearExpiryProductReport() {
  // Filters - Date range (from/to for expiry date)
  const today = localISODate();
  const defaultToDate = localISODate(new Date(Date.now() + 90 * 24 * 60 * 60 * 1000)); // 3 months ahead

  const [fromDate, setFromDate] = useState(today);
  const [toDate, setToDate] = useState(defaultToDate);

  const [supplierValue, setSupplierValue] = useState(null);
  const [supplierId, setSupplierId] = useState("");
  const [brandValue, setBrandValue] = useState(null);
  const [brandId, setBrandId] = useState("");
  const [productValue, setProductValue] = useState(null);
  const [productId, setProductId] = useState("");
  const [supplierSearchOpen, setSupplierSearchOpen] = useState(false);
  const [brandSearchOpen, setBrandSearchOpen] = useState(false);
  const [products, setProducts] = useState([]);

  // Data + States
  const [data, setData] = useState({ rows: [], summary: {} });
  const [loading, setLoading] = useState(false);
  const [pdfLoading, setPdfLoading] = useState(false);

  // permissions
  const { loading: permsLoading, canFor } = usePermissions();
  const can = useMemo(
    () =>
      (typeof canFor === "function" ? canFor("report.near-expiry-product") : {
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
        warning: '#b45309',
        danger: '#dc2626',
      };
    }
    return {
      primary: theme.primary_color || '#2563eb',
      secondary: theme.secondary_color || '#0f766e',
      warning: theme.warning_color || '#b45309',
      danger: theme.danger_color || '#dc2626',
    };
  }, [theme]);

  const primaryTextColor = useMemo(
    () => getContrastText(themeColors.primary),
    [themeColors.primary]
  );

  /* ============ Product fetch (for ProductSearchInput) ============ */
  const fetchProducts = async (q = "") => {
    try {
      const { data } = await axios.get("/api/products/search", { params: { q, limit: 30 } });
      setProducts(Array.isArray(data) ? data : []);
    } catch {
      setProducts([]);
    }
  };

  /* ============ Supplier selected from modal ============ */
  const handleSupplierSelect = (supplier) => {
    if (!supplier?.id) return;
    setSupplierValue(supplier);
    setSupplierId(String(supplier.id));
    setSupplierSearchOpen(false);
  };

  const handleBrandSelect = (brand) => {
    if (!brand?.id) return;
    setBrandValue(brand);
    setBrandId(String(brand.id));
    setBrandSearchOpen(false);
  };

  /* ============ Fetch report ============ */
  const fetchReport = async () => {
    if (!can.view) return toast.error("You don't have permission to view this report.");

    setLoading(true);
    try {
      const res = await axios.get("/api/reports/near-expiry-product", {
        params: {
          from: fromDate,
          to: toDate,
          supplier_id: supplierId || undefined,
          brand_id: brandId || undefined,
          product_id: productId || undefined,
        },
      });

      const responseData = res.data || {};
      const rows = Array.isArray(responseData.rows) ? responseData.rows : [];
      const summary = responseData.summary || {};

      setData({ rows, summary });
      if (!rows.length) toast("No near expiry products found.", { icon: "ℹ️" });
    } catch (err) {
      console.error(err);
      toast.error("Failed to fetch Near Expiry Product report");
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
      const res = await axios.get("/api/reports/near-expiry-product/pdf", {
        params: {
          from: fromDate,
          to: toDate,
          supplier_id: supplierId || undefined,
          brand_id: brandId || undefined,
          product_id: productId || undefined,
        },
        responseType: "blob",
      });
      const blob = new Blob([res.data], { type: "application/pdf" });
      const url = URL.createObjectURL(blob);
      const win = window.open(url, "_blank");
      if (!win) {
        const a = document.createElement("a");
        a.href = url;
        a.download = `near-expiry-products-${fromDate || "report"}.pdf`;
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
    setFromDate(today);
    setToDate(defaultToDate);
    setSupplierValue(null);
    setSupplierId("");
    setBrandValue(null);
    setBrandId("");
    setProductValue(null);
    setProductId("");
    setData({ rows: [], summary: {} });
  };

  // Computed values
  const { rows, summary } = data;

  return (
    <div className="report-page">
      {/* ===== Glass overview: title, actions, filters ===== */}
      <section className="products-panel">
        <div className="products-heading">
          <div className="flex items-center gap-3 min-w-0">
            <div className="products-identity-icon">
              <ClockIcon className="w-6 h-6" />
            </div>
            <div className="min-w-0">
              <h1 className="products-title">Near Expiry Product Report</h1>
              <p className="products-subtitle">
                <ClockIcon className="w-3.5 h-3.5 shrink-0" />
                <span className="truncate">{rows.length} items expiring</span>
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
              title="Reset filters"
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
                title="Load the near expiry product report"
                className="products-action products-action-primary theme-btn-primary"
              >
                {loading ? (
                  <ArrowPathIcon className="w-4 h-4 animate-spin" />
                ) : (
                  <ClockIcon className="w-4 h-4" />
                )}
                <span>{loading ? "Loading…" : "Load Report"}</span>
              </button>
            </Guard>
          </div>
        </div>

        <div className="products-filter-panel">
          <div className="report-filters">
            <label className="products-filter">
              <span className="products-filter-label">
                <CalendarIcon className="w-3.5 h-3.5 inline mr-1" /> From (Expiry)
              </span>
              <input
                type="date"
                value={fromDate}
                onChange={(e) => setFromDate(e.target.value)}
                className="report-input"
              />
            </label>

            <label className="products-filter">
              <span className="products-filter-label">
                <CalendarIcon className="w-3.5 h-3.5 inline mr-1" /> To (Expiry)
              </span>
              <input
                type="date"
                value={toDate}
                onChange={(e) => setToDate(e.target.value)}
                className="report-input"
              />
            </label>

            <div className="products-filter">
              <span className="products-filter-label">Supplier</span>
              <div className="flex items-center gap-2">
                <button
                  type="button"
                  onClick={() => setSupplierSearchOpen(true)}
                  title="Search and select a supplier"
                  className="report-input flex items-center gap-2 text-left cursor-pointer"
                >
                  <BuildingStorefrontIcon className="w-4 h-4 shrink-0 text-[var(--workspace-muted)]" />
                  <span className={`truncate ${supplierValue ? "" : "text-[var(--workspace-muted)]"}`}>
                    {supplierValue?.name || "All Suppliers"}
                  </span>
                </button>
                {supplierValue && (
                  <button
                    type="button"
                    onClick={() => {
                      setSupplierValue(null);
                      setSupplierId("");
                    }}
                    className="report-icon-btn"
                    aria-label="Clear supplier"
                    title="Clear supplier"
                  >
                    <XMarkIcon />
                  </button>
                )}
              </div>
            </div>

            <div className="products-filter">
              <span className="products-filter-label">Brand</span>
              <div className="flex items-center gap-2">
                <button
                  type="button"
                  onClick={() => setBrandSearchOpen(true)}
                  title="Search and select a brand"
                  className="report-input flex items-center gap-2 text-left cursor-pointer"
                >
                  <TagIcon className="w-4 h-4 shrink-0 text-[var(--workspace-muted)]" />
                  <span className={`truncate ${brandValue ? "" : "text-[var(--workspace-muted)]"}`}>
                    {brandValue?.name || "All Brands"}
                  </span>
                </button>
                {brandValue && (
                  <button
                    type="button"
                    onClick={() => {
                      setBrandValue(null);
                      setBrandId("");
                    }}
                    className="report-icon-btn"
                    aria-label="Clear brand"
                    title="Clear brand"
                  >
                    <XMarkIcon />
                  </button>
                )}
              </div>
            </div>

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

      {/* ===== Permission states ===== */}
      {permsLoading && (
        <section className="products-panel">
          <p className="report-state">Checking permissions…</p>
        </section>
      )}
      {!permsLoading && !can.view && (
        <section className="products-panel">
          <p className="report-state">You don't have permission to view this report.</p>
        </section>
      )}

      {/* ===== Results ===== */}
      {!permsLoading && can.view && (
        <>
          {rows.length === 0 && !loading && (
            <section className="products-panel">
              <p className="report-state">
                No near expiry products found. Apply filters and click "Load Report".
              </p>
            </section>
          )}

          {rows.length > 0 && (
            <>
              {/* ===== Summary KPIs ===== */}
              <div className="report-kpis report-kpis-2">
                <KpiCard
                  label="Total Batches"
                  value={fmtNumber(summary.total_batches)}
                  note="Batches nearing expiry"
                  icon={ClipboardDocumentListIcon}
                  accent={themeColors.warning}
                />
                <KpiCard
                  label="Total Quantity"
                  value={fmtNumber(summary.total_quantity)}
                  note="Units expiring"
                  icon={ClockIcon}
                  accent={themeColors.secondary}
                />
              </div>

              {/* ===== Data table ===== */}
              <section className="products-panel products-catalog">
                <div className="products-catalog-heading">
                  <div className="flex items-center gap-3">
                    <div className="report-section-icon">
                      <ClockIcon />
                    </div>
                    <div>
                      <h2 className="products-section-title">Near Expiry Products</h2>
                      <p className="products-subtitle">{rows.length} items</p>
                    </div>
                  </div>
                </div>

                <div
                  className="report-table-scroll"
                  tabIndex={0}
                  role="region"
                  aria-label="Near expiry products"
                  aria-busy={loading}
                >
                  <table className="report-table">
                    <thead>
                      <tr>
                        <th scope="col">#</th>
                        <th scope="col">Product</th>
                        <th scope="col">Supplier</th>
                        <th scope="col">Brand</th>
                        <th scope="col">Batch #</th>
                        <th scope="col">Expiry Date</th>
                        <th scope="col" className="report-num">Quantity</th>
                      </tr>
                    </thead>

                    <tbody>
                      {rows.map((row, idx) => {
                        const close = isExpiryClose(row.expiry_date);
                        return (
                          <tr key={row.batch_id ?? idx}>
                            <td className="report-muted">{idx + 1}</td>

                            <td className="report-product">
                              {row.product_name || "-"}
                              <div className="report-meta">{row.product_code || ""}</div>
                            </td>

                            <td>
                              <span className="report-badge">{row.supplier_name || "—"}</span>
                            </td>

                            <td>
                              <span className="report-badge">{row.brand_name || "—"}</span>
                            </td>

                            <td className="report-mono">{row.batch_number || "—"}</td>

                            <td>
                              <span
                                className={`report-status ${close ? "report-status-danger" : "report-status-warning"}`}
                              >
                                {close ? "Expiring soon" : "Upcoming"} · {formatDate(row.expiry_date)}
                              </span>
                            </td>

                            <td className="report-num">
                              <span className="report-badge report-strong">
                                {fmtNumber(row.quantity)}
                              </span>
                            </td>
                          </tr>
                        );
                      })}
                    </tbody>

                    <tfoot>
                      <tr className="report-total-row">
                        <td colSpan={6} className="report-num">Totals</td>
                        <td className="report-num report-strong">{fmtNumber(summary.total_quantity)}</td>
                      </tr>
                    </tfoot>
                  </table>
                </div>
              </section>
            </>
          )}
        </>
      )}

      {/* Search modals */}
      <SupplierSearch
        isOpen={supplierSearchOpen}
        onClose={() => setSupplierSearchOpen(false)}
        onSelect={handleSupplierSelect}
      />
      <BrandSearch
        isOpen={brandSearchOpen}
        onClose={() => setBrandSearchOpen(false)}
        onSelect={handleBrandSelect}
      />
    </div>
  );
}

// Helper function to format date
function formatDate(dateStr) {
  if (!dateStr) return "—";
  if (dateStr instanceof Date) {
    return dateStr.toISOString().slice(0, 10);
  }
  if (typeof dateStr === 'string') {
    return dateStr.slice(0, 10);
  }
  return dateStr;
}

// Helper function to check if expiry is close (within 30 days)
function isExpiryClose(dateStr) {
  if (!dateStr) return false;
  const expiryDate = new Date(formatDate(dateStr));
  const today = new Date();
  const diffTime = expiryDate - today;
  const diffDays = Math.ceil(diffTime / (1000 * 60 * 60 * 24));
  return diffDays <= 30;
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
