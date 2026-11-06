// resources/js/pages/Reports/SaleDetailReport.jsx
import { useMemo, useState } from "react";
import axios from "axios";
import toast from "react-hot-toast";
import { usePermissions, Guard } from "@/api/usePermissions";
import { useTheme } from "@/context/ThemeContext";
import { useSaleSystem } from "@/context/SaleSystemContext.jsx";

import {
  ArrowDownOnSquareIcon,
  ArrowPathIcon,
  PencilSquareIcon,
  CheckCircleIcon,
  XCircleIcon,
  DocumentTextIcon,
  UserIcon,
  Squares2X2Icon,
  XMarkIcon,
  CurrencyDollarIcon,
  CubeIcon,
} from "@heroicons/react/24/solid";
import CustomerSearch from "@/components/CustomerSearch.jsx";
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
const todayStr = () => new Date().toISOString().split("T")[0];
const yesterdayStr = () => {
  const d = new Date();
  d.setDate(d.getDate() - 1);
  return d.toISOString().split("T")[0];
};
const n = (v) => (isFinite(Number(v)) ? Number(v) : 0);
const fmtCurrency = (v) =>
  n(v).toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 });

export default function SaleDetailReport() {
  // Default date range: Yesterday → Today
  const [fromDate, setFromDate] = useState(yesterdayStr());
  const [toDate, setToDate] = useState(todayStr());

  // Filters
  const [customerValue, setCustomerValue] = useState(null);
  const [customerId, setCustomerId] = useState("");
  const [productValue, setProductValue] = useState(null);
  const [productId, setProductId] = useState("");
  const [customerSearchOpen, setCustomerSearchOpen] = useState(false);
  const [products, setProducts] = useState([]);

  // Data + States
  const [data, setData] = useState([]);
  const [loading, setLoading] = useState(false);
  const [pdfLoading, setPdfLoading] = useState(false);

  // permissions
  const { loading: permsLoading, canFor } = usePermissions();
  const can = useMemo(
    () =>
      (typeof canFor === "function" ? canFor("report.sale-detail") : {
        view: false,
        export: false,
        edit: false,
      }),
    [canFor]
  );

  // Active theme colors
  const { theme } = useTheme();
  const { isPharmacy } = useSaleSystem();

  const themeColors = useMemo(() => {
    if (!theme) {
      return {
        primary: '#2563eb',
        primaryHover: '#1d4ed8',
        secondary: '#0f766e',
      };
    }
    return {
      primary: theme.primary_color || '#2563eb',
      primaryHover: theme.primary_hover || '#1d4ed8',
      secondary: theme.secondary_color || '#0f766e',
    };
  }, [theme]);

  const primaryTextColor = useMemo(
    () => getContrastText(themeColors.primary),
    [themeColors.primary]
  );

  const summary = useMemo(() => {
    const items = data.flatMap((invoice) => invoice.items || []);

    return {
      invoiceCount: data.length,
      itemCount: items.length,
      quantity: items.reduce((total, item) => total + n(item.quantity), 0),
      saleValue: items.reduce((total, item) => total + n(item.sub_total), 0),
    };
  }, [data]);

  /* ============ Product fetch (for ProductSearchInput) ============ */
  const fetchProducts = async (q = "") => {
    try {
      const { data } = await axios.get("/api/products/search", { params: { q, limit: 30 } });
      setProducts(Array.isArray(data) ? data : []);
    } catch {
      setProducts([]);
    }
  };

  /* ============ Customer selected from modal ============ */
  const handleCustomerSelect = (customer) => {
    if (!customer?.id) return;
    setCustomerValue(customer);
    setCustomerId(String(customer.id));
    setCustomerSearchOpen(false);
  };

  /* ============ Fetch report ============ */
  const fetchReport = async () => {
    if (!can.view) return toast.error("You don't have permission to view this report.");
    if (fromDate > toDate) return toast.error("'From' date cannot be after 'To' date.");

    setLoading(true);
    try {
      const res = await axios.get("/api/reports/sale-detail", {
        params: {
          from: fromDate,
          to: toDate,
          customer_id: customerId || undefined,
          product_id: productId || undefined,
        },
      });
      const rows = Array.isArray(res.data)
        ? res.data
        : Array.isArray(res.data?.data)
        ? res.data.data
        : [];
      setData(rows);
      if (!rows.length) toast("No data found for selected range.");
    } catch (err) {
      console.error(err);
      toast.error("Failed to fetch Sale Detail report");
      setData([]);
    } finally {
      setLoading(false);
    }
  };

  const [editingInvoiceId, setEditingInvoiceId] = useState(null);
  const [editDoctor, setEditDoctor] = useState("");
  const [editPatient, setEditPatient] = useState("");
  const [saving, setSaving] = useState(false);

  const saveInvoiceMeta = (inv) => async () => {
    setSaving(true);
    try {
      const res = await axios.put(
        `/api/sale-invoices/${inv.id}/meta`,
        {
          doctor_name: editDoctor,
          patient_name: editPatient,
        }
      );

      setData((prev) =>
        prev.map((x) =>
          x.id === inv.id
            ? {
                ...x,
                doctor_name: res.data.doctor_name,
                patient_name: res.data.patient_name,
              }
            : x
        )
      );

      toast.success("Updated");
      setEditingInvoiceId(null);
    } catch {
      toast.error("Update failed");
    } finally {
      setSaving(false);
    }
  };

  /* ============ Export PDF ============ */
  const exportPdf = async () => {
    if (!can.export) return toast.error("You don't have permission to export PDF.");
    setPdfLoading(true);
    try {
      const res = await axios.get("/api/reports/sale-detail/pdf", {
        params: {
          from: fromDate,
          to: toDate,
          customer_id: customerId || undefined,
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
        a.download = `sale-detail-${fromDate || "report"}.pdf`;
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
    setFromDate(yesterdayStr());
    setToDate(todayStr());
    setData([]);
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
              <h1 className="products-title">Sale Detail Report</h1>
              <p className="products-subtitle">
                <Squares2X2Icon className="w-3.5 h-3.5 shrink-0" />
                <span className="truncate">{summary.invoiceCount} invoices · {summary.itemCount} item lines</span>
              </p>
            </div>
          </div>

          <div className="flex flex-wrap items-center gap-2">
            <Guard when={can.export}>
              <button
                type="button"
                onClick={exportPdf}
                disabled={pdfLoading || data.length === 0}
                title={
                  data.length === 0
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
                title="Load the sale detail report"
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
              <span className="products-filter-label">Customer</span>
              <div className="flex items-center gap-2">
                <button
                  type="button"
                  onClick={() => setCustomerSearchOpen(true)}
                  title="Search and select a customer"
                  className="report-input flex items-center gap-2 text-left cursor-pointer"
                >
                  <UserIcon className="w-4 h-4 shrink-0 text-[var(--workspace-muted)]" />
                  <span className={`truncate ${customerValue ? "" : "text-[var(--workspace-muted)]"}`}>
                    {customerValue?.name || "All Customers"}
                  </span>
                </button>
                {customerValue && (
                  <button
                    type="button"
                    onClick={() => {
                      setCustomerValue(null);
                      setCustomerId("");
                    }}
                    className="report-icon-btn"
                    aria-label="Clear customer"
                    title="Clear customer"
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
                    fetchReport();
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
                    fetchReport();
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
                    fetchReport();
                  }}
                >
                  7 Days
                </button>
              </div>
            </div>
          </div>
        </div>
      </section>

      {/* ===== Sale summary ===== */}
      {data.length > 0 && (
        <section className="report-kpis report-kpis-4" aria-label="Sale report summary">
          <KpiCard
            label="Total Sale Value"
            value={`Rs. ${fmtCurrency(summary.saleValue)}`}
            note="Value of items in this report"
            icon={CurrencyDollarIcon}
            accent={themeColors.secondary}
          />
          <KpiCard
            label="Invoices"
            value={summary.invoiceCount.toLocaleString()}
            note="Sale invoices in range"
            icon={DocumentTextIcon}
            accent={themeColors.primary}
          />
          <KpiCard
            label="Item Lines"
            value={summary.itemCount.toLocaleString()}
            note="Sold product entries"
            icon={Squares2X2Icon}
            accent={themeColors.primary}
          />
          <KpiCard
            label="Quantity Sold"
            value={summary.quantity.toLocaleString()}
            note="Total quantity across item lines"
            icon={CubeIcon}
            accent={themeColors.secondary}
          />
        </section>
      )}

      {/* ===== Empty state ===== */}
      {data.length === 0 && !loading && (
        <section className="products-panel">
          <p className="report-state">No data found for the selected filters.</p>
        </section>
      )}

      {/* ===== Sale invoice cards ===== */}
      {data.length > 0 && (
        <div className="report-detail-list">
          {data.map((inv, idxInv) => {
            const itemSaleValue = (inv.items || []).reduce(
              (total, item) => total + n(item.sub_total),
              0
            );

            return (
            <section
              key={idxInv + "-" + (inv.posted_number ?? "") + "-" + (inv.invoice_date ?? "")}
              className="products-panel report-invoice"
            >
              {/* Invoice header */}
              <div className="report-invoice-head">
                <div className="min-w-0">
                  <span className="report-invoice-number">
                    {inv.customer_name || "—"}
                  </span>
                  <div className="report-invoice-meta">
                    <span>Posted #: <strong>{inv.posted_number || "-"}</strong></span>
                    <span>{inv.invoice_date || "-"}</span>
                    <span>User: <strong>{inv.user_name || "-"}</strong></span>
                    {(isPharmacy || inv?.doctor_name || inv?.patient_name) && (
                      <>
                        <span>Doctor: <strong>{inv.doctor_name || "-"}</strong></span>
                        <span>Patient: <strong>{inv.patient_name || "-"}</strong></span>
                      </>
                    )}
                  </div>

                  {/* Edit inputs (pharmacy only — doctor/patient are pharmacy fields) */}
                  {isPharmacy && editingInvoiceId === inv.id && (
                    <div className="report-edit-fields">
                      <input
                        className="report-input"
                        placeholder="Doctor"
                        aria-label="Doctor name"
                        value={editDoctor}
                        onChange={(e) => setEditDoctor(e.target.value)}
                      />
                      <input
                        className="report-input"
                        placeholder="Patient"
                        aria-label="Patient name"
                        value={editPatient}
                        onChange={(e) => setEditPatient(e.target.value)}
                      />
                    </div>
                  )}
                </div>

                {isPharmacy && (
                  <Guard when={can.edit}>
                    {editingInvoiceId === inv.id ? (
                      <div className="report-invoice-chips">
                        <button
                          type="button"
                          className="report-icon-btn"
                          disabled={saving}
                          onClick={saveInvoiceMeta(inv)}
                          title="Save doctor and patient"
                          aria-label="Save doctor and patient"
                        >
                          <CheckCircleIcon />
                        </button>
                        <button
                          type="button"
                          className="report-icon-btn"
                          onClick={() => setEditingInvoiceId(null)}
                          title="Cancel editing"
                          aria-label="Cancel editing"
                        >
                          <XCircleIcon />
                        </button>
                      </div>
                    ) : (
                      <button
                        type="button"
                        className="report-icon-btn"
                        onClick={() => {
                          setEditingInvoiceId(inv.id);
                          setEditDoctor(inv.doctor_name || "");
                          setEditPatient(inv.patient_name || "");
                        }}
                        title="Edit doctor and patient"
                        aria-label="Edit doctor and patient"
                      >
                        <PencilSquareIcon />
                      </button>
                    )}
                  </Guard>
                )}
              </div>

              {/* Items table */}
              <div className="report-invoice-table-scroll">
                <table className="report-table">
                  <thead>
                    <tr>
                      <th scope="col">Product Name</th>
                      <th scope="col" className="report-num">Pack Size</th>
                      <th scope="col">Batch #</th>
                      <th scope="col">Expiry</th>
                      <th scope="col" className="report-num">Current Qty</th>
                      <th scope="col" className="report-num">Qty</th>
                      <th scope="col" className="report-num">Price</th>
                      <th scope="col" className="report-num">Disc %</th>
                      <th scope="col" className="report-num">Sub Total</th>
                    </tr>
                  </thead>

                  <tbody>
                    {(inv.items || []).map((it, idx) => (
                      <tr key={(it.id ?? idx) + "-" + (it.product_id ?? "p") + "-" + idx}>
                        <td className="report-product">{it.product_name || "-"}</td>
                        <td className="report-num">{it.pack_size ?? 0}</td>
                        <td className="report-mono">{it.batch_number || "-"}</td>
                        <td>{it.expiry || "-"}</td>
                        <td className="report-num">{it.current_quantity ?? 0}</td>
                        <td className="report-num">{it.quantity ?? 0}</td>
                        <td className="report-num">{fmtCurrency(it.price)}</td>
                        <td className="report-num">{(it.item_discount_percentage ?? 0).toFixed(2)}</td>
                        <td className="report-num">{fmtCurrency(it.sub_total)}</td>
                      </tr>
                    ))}

                    {(!inv.items || !inv.items.length) && (
                      <tr>
                        <td colSpan={9} className="report-muted">
                          No items match this filter in this invoice.
                        </td>
                      </tr>
                    )}
                  </tbody>

                  <tfoot>
                    <tr className="report-total-row">
                      <td colSpan={6} className="report-num">Discount %</td>
                      <td colSpan={1} className="report-num">{(inv.discount_percentage ?? 0).toFixed(2)}</td>
                      <td colSpan={1} className="report-num">Discount Amt</td>
                      <td colSpan={1} className="report-num">{fmtCurrency(inv.discount_amount)}</td>
                    </tr>
                    <tr className="report-total-row">
                      <td colSpan={6} className="report-num">Tax %</td>
                      <td colSpan={1} className="report-num">{(inv.tax_percentage ?? 0).toFixed(2)}</td>
                      <td colSpan={1} className="report-num">Tax Amt</td>
                      <td colSpan={1} className="report-num">{fmtCurrency(inv.tax_amount)}</td>
                    </tr>
                    <tr className="report-total-row">
                      <td colSpan={8} className="report-num">Item Discount</td>
                      <td colSpan={1} className="report-num">{fmtCurrency(inv.item_discount)}</td>
                    </tr>
                    <tr className="report-total-row">
                      <td colSpan={8} className="report-num">Gross Amount</td>
                      <td colSpan={1} className="report-num">{fmtCurrency(inv.gross_amount)}</td>
                    </tr>
                    <tr className="report-total-row">
                      <td colSpan={8} className="report-num">Items Sale Value</td>
                      <td className="report-num report-strong report-value-sale">
                        Rs. {fmtCurrency(itemSaleValue)}
                      </td>
                    </tr>
                    <tr className="report-total-row">
                      <td colSpan={8} className="report-num">Invoice Total</td>
                      <td colSpan={1} className="report-num report-strong report-value-sale">
                        Rs. {fmtCurrency(inv.total)}
                      </td>
                    </tr>
                  </tfoot>
                </table>
              </div>
            </section>
            );
          })}
        </div>
      )}

      {/* Customer search modal */}
      <CustomerSearch
        isOpen={customerSearchOpen}
        onClose={() => setCustomerSearchOpen(false)}
        onSelect={handleCustomerSelect}
      />
    </div>
  );
}

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
