// /src/pages/purchase-invoices/Show.jsx
import { Fragment, useEffect, useRef, useState, useMemo } from "react";
import { useParams, useNavigate } from "react-router-dom";
import axios from "axios";
import { DocumentTextIcon, MagnifyingGlassIcon, PencilSquareIcon, TrashIcon, PlusIcon, ArrowLeftIcon, ClockIcon, ArrowUturnLeftIcon, BanknotesIcon, PrinterIcon, ShareIcon } from "@heroicons/react/24/outline";
import toast from "react-hot-toast";
import { usePermissions, Guard } from "@/api/usePermissions.js";
import PageSkeleton from "@/components/PageSkeleton.jsx";
import { useTheme } from "@/context/ThemeContext";
import { getThemeButtonClasses } from "@/utils/buttonStyles";
import PurchaseInvoiceSearch from "@/components/PurchaseInvoiceSearch.jsx";
import DocumentHistoryModal from "@/components/DocumentHistoryModal.jsx";
import VoidInvoiceModal from "@/components/VoidInvoiceModal.jsx";
import RecordPaymentModal from "@/components/RecordPaymentModal.jsx";
import InvoiceDraftsModal from "@/components/InvoiceDraftsModal.jsx";
import ShareDocumentModal from "@/components/ShareDocumentModal.jsx";

// Helper to determine text color based on background brightness
const getContrastText = (hexColor) => {
  hexColor = hexColor.replace('#', '');
  const r = parseInt(hexColor.substring(0, 2), 16);
  const g = parseInt(hexColor.substring(2, 4), 16);
  const b = parseInt(hexColor.substring(4, 6), 16);
  const luminance = (0.299 * r + 0.587 * g + 0.114 * b) / 255;
  return luminance > 0.5 ? '#1f2937' : '#ffffff';
};

const getButtonTextColor = (primaryColor, primaryHoverColor) => {
  return getContrastText(primaryHoverColor || primaryColor);
};

const to2 = (n) => Number(parseFloat(n || 0).toFixed(2));

export default function PurchaseInvoiceShow() {
  const { id } = useParams();
  const navigate = useNavigate();

  const [inv, setInv] = useState(null);
  const [loading, setLoading] = useState(true);
  const [deleting, setDeleting] = useState(false);
  const [deleteModalOpen, setDeleteModalOpen] = useState(false);
  const [deleteStep, setDeleteStep] = useState(1);
  const [password, setPassword] = useState("");
  const [searchOpen, setSearchOpen] = useState(false);

  // History, Void, Share and Payment modal states
  const [historyModalOpen, setHistoryModalOpen] = useState(false);
  const [voidModalOpen, setVoidModalOpen] = useState(false);
  const [paymentModalOpen, setPaymentModalOpen] = useState(false);
  const [shareModalOpen, setShareModalOpen] = useState(false);
  const [isReversing, setIsReversing] = useState(false);

  // Held Invoices & Drafts state
  const [isDraftsOpen, setIsDraftsOpen] = useState(false);
  const [draftsList, setDraftsList] = useState([]);

  const fetchDrafts = async () => {
    try {
      const res = await axios.get("/api/invoice-drafts", { params: { status: "draft" } });
      const purchaseDrafts = (res.data || []).filter((d) => d.type === "purchase");
      setDraftsList(purchaseDrafts);
    } catch {}
  };

  useEffect(() => {
    fetchDrafts();
  }, []);

  const handleConfirmVoid = async (reason) => {
    try {
      setIsReversing(true);
      await axios.post(`/api/purchase-invoices/${id}/reverse`, { reason });
      toast.success(`Purchase Invoice ${inv?.posted_number || inv?.invoice_number || ""} reversed successfully`);
      if (typeof window !== "undefined") {
        window.dispatchEvent(new CustomEvent("cash-drawer-changed"));
      }
      setVoidModalOpen(false);
      const { data } = await axios.get(`/api/purchase-invoices/${id}`);
      setInv(data);
    } catch (err) {
      toast.error(err?.response?.data?.message || "Failed to reverse invoice");
    } finally {
      setIsReversing(false);
    }
  };

  // Get theme colors
  const { isDark, theme } = useTheme();

  // Memoize theme colors for performance
  const themeColors = useMemo(() => {
    if (!theme) {
      return {
        primary: '#3b82f6',
        primaryHover: '#2563eb',
        primaryLight: '#dbeafe',
        secondary: '#8b5cf6',
        secondaryHover: '#7c3aed',
        secondaryLight: '#ede9fe',
        danger: '#ef4444',
        dangerHover: '#dc2626',
        dangerLight: '#fee2e2',
        tertiary: '#06b6d4',
        tertiaryHover: '#0891b2',
      };
    }
    return {
      primary: theme.primary_color || '#3b82f6',
      primaryHover: theme.primary_hover || '#2563eb',
      primaryLight: theme.primary_light || '#dbeafe',
      secondary: theme.secondary_color || '#8b5cf6',
      secondaryHover: theme.secondary_hover || '#7c3aed',
      secondaryLight: theme.secondary_light || '#ede9fe',
      tertiary: theme.tertiary_color || '#06b6d4',
      tertiaryHover: theme.tertiary_hover || '#0891b2',
      tertiaryLight: theme.tertiary_light || '#cffafe',
      danger: theme.danger_color || '#ef4444',
      dangerHover: '#dc2626',
      dangerLight: '#fee2e2',
    };
  }, [theme]);

  // Calculate text colors based on background brightness
  const primaryTextColor = useMemo(() => 
    getButtonTextColor(themeColors.primary, themeColors.primaryHover), 
    [themeColors.primary, themeColors.primaryHover]
  );
  
  const secondaryTextColor = useMemo(() => 
    getButtonTextColor(themeColors.secondary, themeColors.secondaryHover), 
    [themeColors.secondary, themeColors.secondaryHover]
  );
  
  const dangerTextColor = useMemo(() => 
    getButtonTextColor(themeColors.danger, themeColors.dangerHover), 
    [themeColors.danger, themeColors.dangerHover]
  );

  // Get button style from theme
  const buttonStyle = theme?.button_style || 'modern';
  
  // Get button style classes and styles based on theme button_style
  const getButtonClasses = useMemo(
    () => getThemeButtonClasses(buttonStyle, themeColors, isDark),
    [buttonStyle, themeColors, isDark]
  );

  const btnPrimary = getButtonClasses.primary;
  const btnSecondary = getButtonClasses.secondary;
  const btnDanger = getButtonClasses.danger;
  const btnGlass = getButtonClasses.glass;

  const chip =
    "px-1 py-0.5 border rounded-sm bg-gray-50 dark:bg-slate-700 text-[10px] leading-none text-gray-700 dark:text-gray-300";

  // 🔒 permissions
  const { loading: permsLoading, canFor } = usePermissions?.() || {};
  const can = useMemo(
    () =>
      (typeof canFor === "function"
        ? canFor("purchase-invoice")
        : { view: false, create: false, update: false, delete: false, import: false, export: false }),
    [canFor]
  );

  // Fetch invoice
  useEffect(() => {
    (async () => {
      try {
        const { data } = await axios.get(`/api/purchase-invoices/${id}`);
        setInv(data);
      } catch {
        toast.error("Failed to load invoice");
      } finally {
        setLoading(false);
      }
    })();
  }, [id]);

  // Calculate totals
  const totalAmount = useMemo(() => to2(inv?.total_amount), [inv]);
  const totalPaid = useMemo(() => to2(inv?.total_paid), [inv]);
  const remainingAmount = useMemo(() => Math.max(totalAmount - totalPaid, 0), [totalAmount, totalPaid]);
  const invoiceAmount = useMemo(() => Number(inv?.invoice_amount || 0), [inv]);
  const difference = useMemo(() => invoiceAmount - totalAmount, [invoiceAmount, totalAmount]);

  // After delete, go to previous or index
  const goToPrevOrIndex = async (deletedId) => {
    try {
      const res = await axios.get("/api/purchase-invoices", { params: { per_page: 100 } });
      const list = Array.isArray(res.data?.data) ? res.data.data : Array.isArray(res.data) ? res.data : [];
      const prev = list
        .filter((x) => Number(x?.id) < Number(deletedId))
        .sort((a, b) => Number(b?.id) - Number(a?.id))[0];

      if (prev?.id) navigate(`/purchase-invoices/${prev.id}`);
      else navigate("/purchase-invoices");
    } catch {
      navigate("/purchase-invoices");
    }
  };

  // ===== Delete flow =====
  const openDeleteModal = () => {
    if (!can.delete) return toast.error("You don't have permission to delete purchase invoices.");
    setPassword("");
    setDeleteStep(1);
    setDeleteModalOpen(true);
  };
  const closeDeleteModal = () => {
    if (deleting) return;
    setDeleteModalOpen(false);
    setDeleteStep(1);
    setPassword("");
  };

  const confirmAndDelete = async () => {
    if (!id) return;
    if (!can.delete) return toast.error("You don't have permission to delete purchase invoices.");
    try {
      setDeleting(true);
      await axios.post("/api/auth/confirm-password", { password });
      await axios.delete(`/api/purchase-invoices/${id}`);
      toast.success("Purchase invoice deleted");
      if (typeof window !== "undefined") {
        window.dispatchEvent(new CustomEvent("cash-drawer-changed"));
      }
      await goToPrevOrIndex(id);
      closeDeleteModal();
    } catch (e) {
      const msg =
        e?.response?.data?.message ||
        (e?.response?.status === 422 ? "Incorrect password" : "Failed to delete invoice");
      toast.error(msg);
    } finally {
      setDeleting(false);
    }
  };

  // Keyboard shortcuts
  useEffect(() => {
    const onKey = (e) => {
      if (!e.altKey) return;
      const k = (e.key || "").toLowerCase();
      if (k === "b") { e.preventDefault(); navigate(-1); }
      if (k === "f") { 
        e.preventDefault(); 
        setSearchOpen(true); 
      }
      if (k === "e") {
        if (!can.update) return;
        e.preventDefault();
        navigate(`/purchase-invoices/${id}/edit`);
      }
      if (k === "d") {
        if (!can.delete) return;
        e.preventDefault();
        openDeleteModal();
      }
      if (k === "n") {
        if (!can.create) return;
        e.preventDefault();
        navigate("/purchase-invoices/create");
      }
      if (k === "h") {
        e.preventDefault();
        setIsDraftsOpen((prev) => !prev);
      }
    };
    document.addEventListener("keydown", onKey);
    return () => document.removeEventListener("keydown", onKey);
  }, [navigate, id, can]);

  if (loading || permsLoading) return <PageSkeleton />;
  if (!inv) return <div className="p-4 text-sm dark:text-gray-400">Invoice not found.</div>;

  const fmt = (v) => ((v ?? "") === "" ? "" : String(v));

return (
    <div
      className="purchase-show flex flex-col h-auto lg:h-[calc(100dvh-130px)]"
      autoComplete="off"
    >
      {inv.purchase_order && <div className="g-toolbar p-3">Source Purchase Order: <a className="underline" href={`/purchase-orders/${inv.purchase_order.id}`}>{inv.purchase_order.number}</a></div>}
      {/* ================= HEADER SECTION ================= */}
      <div className="purchase-show-header sticky top-0 z-10" autoComplete="off">
        {/* ---- Branded Title Banner ---- */}
        <div className="purchase-show-banner px-4 py-3 flex items-center justify-between">
          <div className="flex items-center gap-3">
            <div className="purchase-show-icon"><DocumentTextIcon aria-hidden="true" /></div>
            <div>
              <h2 className="purchase-show-title">
                Purchase Invoice
              </h2>
              <p className="purchase-show-shortcuts mt-1">
                Alt+E Edit · Alt+D Delete · Alt+N New · Alt+B Back
              </p>
            </div>
          </div>

          <div className="flex items-center gap-2">
            {inv.status === 'reversed' && (
              <span className="px-2.5 py-1 rounded text-[10px] font-extrabold uppercase bg-rose-600 text-white tracking-wider border border-rose-400 shadow-xs">
                REVERSED
              </span>
            )}
            <span className="purchase-show-type">{inv.invoice_type === "credit" ? "Credit" : "Debit"}</span>
          </div>
        </div>

        {/* ---- Fields Card ---- */}
        <div className="purchase-show-details px-3 py-2.5">
          <div className="overflow-x-auto">
            <table className="w-full border-collapse text-xs">
              <thead>
                <tr className="bg-gray-100 dark:bg-slate-700">
                  {["Posted Number", "Posted Date", "Supplier", "Invoice #", "Amount", "Difference"].map((label) => (
                    <th key={label} scope="col" className="border px-2 py-1 text-left font-medium text-gray-600 dark:border-slate-600 dark:text-gray-300">{label}</th>
                  ))}
                </tr>
              </thead>
              <tbody>
                <tr className="text-gray-900 dark:text-gray-100">
                  <td className="border px-2 py-1 dark:border-slate-600">{fmt(inv.posted_number)}</td>
                  <td className="border px-2 py-1 dark:border-slate-600">{fmt(inv.posted_date)}</td>
                  <td className="border px-2 py-1 dark:border-slate-600">{inv.supplier?.name ?? inv.supplier_id ?? "—"}</td>
                  <td className="border px-2 py-1 dark:border-slate-600">{fmt(inv.invoice_number)}</td>
                  <td className="border px-2 py-1 dark:border-slate-600">{fmt(inv.invoice_amount)}</td>
                  <td className={`border px-2 py-1 font-bold dark:border-slate-600 ${difference !== 0 ? "text-red-600 dark:text-red-400" : ""}`}>{difference.toFixed(2)}</td>
                </tr>
                <tr>
                  <th scope="row" className="border px-2 py-1 text-left font-medium text-gray-600 dark:border-slate-600 dark:text-gray-300">Remarks</th>
                  <td colSpan={5} className="border px-2 py-1 text-gray-900 dark:border-slate-600 dark:text-gray-100">{fmt(inv.remarks)}</td>
                </tr>
              </tbody>
            </table>
          </div>

          {/* Action Buttons */}
          <div className="purchase-show-remarks mt-2 flex justify-end">
            <div className="flex flex-wrap items-center gap-2">
              <button
                type="button"
                onClick={() => setSearchOpen(true)}
                className={`px-3 py-1 rounded-lg text-xs font-semibold transition-all duration-200 ${btnSecondary.className}`}
                style={btnSecondary.style}
                title="Alt+F"
              >
                <MagnifyingGlassIcon className="w-4 h-4" aria-hidden="true" />
                <span>Search</span>
              </button>
              {remainingAmount > 0.01 && inv.status !== 'reversed' && (
                <button
                  type="button"
                  onClick={() => setPaymentModalOpen(true)}
                  className="px-3 py-1 rounded-lg text-xs font-semibold transition-all duration-200 bg-emerald-600 hover:bg-emerald-500 text-white shadow-sm flex items-center gap-1"
                  title="Record payment to supplier against this invoice"
                >
                  <BanknotesIcon className="w-4 h-4" aria-hidden="true" />
                  <span>Pay Supplier</span>
                </button>
              )}
              <button
                type="button"
                onClick={() => window.print()}
                className={`px-3 py-1 rounded-lg text-xs font-semibold transition-all duration-200 ${btnSecondary.className}`}
                style={btnSecondary.style}
                title="Print GRN / Purchase Invoice"
              >
                <PrinterIcon className="w-4 h-4" aria-hidden="true" />
                <span>Print</span>
              </button>
              <button
                type="button"
                onClick={() => setShareModalOpen(true)}
                className={`px-3 py-1 rounded-lg text-xs font-semibold transition-all duration-200 ${btnSecondary.className}`}
                style={btnSecondary.style}
                title="Download PDF or Share via WhatsApp / Email"
              >
                <ShareIcon className="w-4 h-4" aria-hidden="true" />
                <span>PDF / Share</span>
              </button>
              <button
                type="button"
                onClick={() => setHistoryModalOpen(true)}
                className={`px-3 py-1 rounded-lg text-xs font-semibold transition-all duration-200 ${btnSecondary.className}`}
                style={btnSecondary.style}
                title="View audit history"
              >
                <ClockIcon className="w-4 h-4" aria-hidden="true" />
                <span>History</span>
              </button>
              <button
                type="button"
                onClick={() => {
                  fetchDrafts();
                  setIsDraftsOpen(true);
                }}
                className={`px-3 py-1 rounded-lg text-xs font-semibold transition-all duration-200 ${btnSecondary.className} relative flex items-center gap-1.5`}
                style={btnSecondary.style}
                title="Open Held Invoices (Alt+H)"
              >
                <ClockIcon className="w-4 h-4 text-amber-400" aria-hidden="true" />
                <span>Held Invoices</span>
                {draftsList.length > 0 && (
                  <span className="inline-flex items-center justify-center px-1.5 py-0.2 text-[10px] font-bold leading-none text-white bg-amber-500 rounded-full">
                    {draftsList.length}
                  </span>
                )}
              </button>
              <Guard when={can.delete}>
                {inv.status !== 'reversed' && (
                  <button
                    type="button"
                    onClick={() => setVoidModalOpen(true)}
                    className="px-3 py-1 rounded-lg text-xs font-semibold transition-all duration-200 bg-amber-500 hover:bg-amber-600 text-white shadow-sm flex items-center gap-1"
                    title="Void / Reverse this invoice safely"
                  >
                    <ArrowUturnLeftIcon className="w-4 h-4" aria-hidden="true" />
                    <span>Void</span>
                  </button>
                )}
              </Guard>
              <Guard when={can.update}>
                {inv.status !== 'reversed' ? (
                  <button
                    type="button"
                    onClick={() => navigate(`/purchase-invoices/${id}/edit`)}
                    className={`px-3 py-1 rounded-lg text-xs font-semibold transition-all duration-200 ${btnSecondary.className}`}
                    style={btnSecondary.style}
                    title="Alt+E"
                  >
                    <PencilSquareIcon className="w-4 h-4" aria-hidden="true" />
                    <span>Edit</span>
                  </button>
                ) : (
                  <span
                    className="px-3 py-1 rounded-lg text-xs font-semibold opacity-40 cursor-not-allowed bg-gray-200 dark:bg-slate-700 text-gray-500 flex items-center gap-1"
                    title="Reversed invoices cannot be edited"
                  >
                    <PencilSquareIcon className="w-4 h-4" aria-hidden="true" />
                    <span>Edit</span>
                  </span>
                )}
              </Guard>
              <Guard when={can.delete}>
                <button
                  type="button"
                  onClick={openDeleteModal}
                  className={`px-3 py-1 rounded-lg text-xs font-semibold transition-all duration-200 ${btnDanger.className}`}
                  style={btnDanger.style}
                  title="Alt+D"
                >
                  <TrashIcon className="w-4 h-4" aria-hidden="true" />
                  <span>Delete</span>
                </button>
              </Guard>
              <Guard when={can.create}>
                <button
                  type="button"
                  onClick={() => navigate("/purchase-invoices/create")}
                  className={`px-3 py-1 rounded-lg text-xs font-semibold transition-all duration-200 ${btnPrimary.className}`}
                  style={btnPrimary.style}
                  title="Alt+N"
                >
                  <PlusIcon className="w-4 h-4" aria-hidden="true" />
                  <span>New</span>
                </button>
              </Guard>
              <button
                type="button"
                onClick={() => navigate(-1)}
                className={`px-3 py-1 rounded-lg text-xs font-medium transition-all duration-200 ${btnGlass.className}`}
                style={btnGlass.style}
                title="Alt+B"
              >
                <ArrowLeftIcon className="w-4 h-4" aria-hidden="true" />
                <span>Back</span>
              </button>
            </div>
          </div>
        </div>
      </div>

{/* ================= ITEMS SECTION ================= */}
      <div className="purchase-show-items purchase-entry-items flex-1 min-h-0 overflow-auto p-1" autoComplete="off">
        <h2 className="text-xs font-bold mb-1 dark:text-gray-200">Items</h2>

        <table className="invoice-repeater-table w-full border-collapse text-[11px]">
          <thead className="sticky top-0 bg-gray-100 dark:bg-slate-700 z-5">
            <tr>
              <th rowSpan={2} className="border w-6 dark:border-slate-600 dark:text-gray-200">#</th>
              <th rowSpan={2} colSpan={1} className="border w-[80px] dark:border-slate-600 dark:text-gray-200">Product</th>
              <th colSpan={3} className="border dark:border-slate-600 dark:text-gray-200">Pack Size / Batch / Expiry</th>
              <th colSpan={2} className="border dark:border-slate-600 dark:text-gray-200">Qty (Pack / Unit)</th>
              <th colSpan={2} className="border dark:border-slate-600 dark:text-gray-200">Purchase Price (P / U)</th>
              <th colSpan={3} className="border dark:border-slate-600 dark:text-gray-200">Disc % / Bonus (P / U)</th>
              <th colSpan={2} className="border dark:border-slate-600 dark:text-gray-200">Sale Price (P / U)</th>
              <th colSpan={3} className="border dark:border-slate-600 dark:text-gray-200">Wholesale Price (P / U)</th>
              <th colSpan={4} className="border dark:border-slate-600 dark:text-gray-200">Margin % / W.S.Mrg% / Avg / Sub Total</th>
            </tr>

            <tr>
              <th className="border w-14 dark:border-slate-600 dark:text-gray-200">PSize</th>
              <th className="border w-16 dark:border-slate-600 dark:text-gray-200">Batch</th>
              <th className="border w-20 dark:border-slate-600 dark:text-gray-200">Exp</th>
              <th className="border w-12 dark:border-slate-600 dark:text-gray-200">Pack.Q</th>
              <th className="border w-12 dark:border-slate-600 dark:text-gray-200">Unit.Q</th>
              <th className="border w-14 dark:border-slate-600 dark:text-gray-200">Pack.P</th>
              <th className="border w-14 dark:border-slate-600 dark:text-gray-200">Unit.P</th>
              <th className="border w-14 dark:border-slate-600 dark:text-gray-200">Disc%</th>
              <th className="border w-14 dark:border-slate-600 dark:text-gray-200">PBonus</th>
              <th className="border w-14 dark:border-slate-600 dark:text-gray-200">UBonus</th>
              <th className="border w-14 dark:border-slate-600 dark:text-gray-200">Pack.S</th>
              <th className="border w-14 dark:border-slate-600 dark:text-gray-200">Unit.S</th>
              <th className="border w-14 dark:border-slate-600 dark:text-gray-200">W.S.Pack</th>
              <th className="border w-14 dark:border-slate-600 dark:text-gray-200">W.S.Unit</th>
              <th className="border w-14 dark:border-slate-600 dark:text-gray-200">Margin%</th>
              <th className="border w-14 dark:border-slate-600 dark:text-gray-200">W.S.Mrg%</th>
              <th className="border w-16 dark:border-slate-600 dark:text-gray-200">Avg</th>
              <th className="border w-20 dark:border-slate-600 dark:text-gray-200">Sub Total</th>
            </tr>
          </thead>

          <tbody>
            {(inv.items || []).map((item, i) => {
              const brand = item.product?.brand?.name || item.product?.brand_name || "";
              const previousBrand = inv.items[i - 1]?.product?.brand?.name || inv.items[i - 1]?.product?.brand_name || "";

              return (
                <Fragment key={item.id || i}>
                  {(i === 0 || previousBrand !== brand) && (
                    <tr className="purchase-invoice-brand-heading">
                      <th colSpan={20} scope="rowgroup">{brand || "No Brand"}</th>
                    </tr>
                  )}
                  <tr className="invoice-repeater-row text-center dark:text-gray-300">
                    <td data-label="Item #" className="invoice-cell-index-only border px-1 dark:border-slate-600">{i + 1}</td>
                    <td data-label="Product" className="invoice-cell-product border px-1 text-left dark:border-slate-600">{fmt(item.product?.name ?? item.product_id)}</td>
                    <td data-label="Pack Size" className="border px-1 dark:border-slate-600">{fmt(item.pack_size)}</td>
                    <td data-label="Batch" className="border px-1 dark:border-slate-600">{fmt(item.batch)}</td>
                    <td data-label="Expiry" className="border px-1 dark:border-slate-600">{fmt(item.expiry)}</td>
                    <td data-label="Pack Qty" className="border px-1 dark:border-slate-600">{fmt(item.pack_quantity)}</td>
                    <td data-label="Unit Qty" className="border px-1 dark:border-slate-600">{fmt(item.unit_quantity)}</td>
                    <td data-label="Pack Cost" className="border px-1 dark:border-slate-600">{fmt(item.pack_purchase_price)}</td>
                    <td data-label="Unit Cost" className="border px-1 dark:border-slate-600">{fmt(item.unit_purchase_price)}</td>
                    <td data-label="Disc %" className="border px-1 dark:border-slate-600">{fmt(item.item_discount_percentage)}</td>
                    <td data-label="Pack Bonus" className="border px-1 dark:border-slate-600">{fmt(item.pack_bonus)}</td>
                    <td data-label="Unit Bonus" className="border px-1 dark:border-slate-600">{fmt(item.unit_bonus)}</td>
                    <td data-label="Pack Sale" className="border px-1 dark:border-slate-600">{fmt(item.pack_sale_price)}</td>
                    <td data-label="Unit Sale" className="border px-1 dark:border-slate-600">{fmt(item.unit_sale_price)}</td>
                    <td data-label="W.S. Pack" className="border px-1 dark:border-slate-600">{fmt(item.whole_sale_pack_price)}</td>
                    <td data-label="W.S. Unit" className="border px-1 dark:border-slate-600">{fmt(item.whole_sale_unit_price)}</td>
                    <td data-label="Margin %" className="border px-1 dark:border-slate-600">{fmt(item.margin)}</td>
                    <td data-label="W.S. Mrg %" className="border px-1 dark:border-slate-600">{fmt(item.whole_sale_margin)}</td>
                    <td data-label="Avg Cost" className="border px-1 dark:border-slate-600">{fmt(item.avg_price)}</td>
                    <td data-label="Sub Total" className="invoice-cell-subtotal border px-1 dark:border-slate-600">{fmt(item.sub_total)}</td>
                  </tr>
                </Fragment>
              );
            })}
          </tbody>
        </table>
      </div>

      {/* ================= FOOTER SECTION ================= */}
      <div className="purchase-show-footer sticky bottom-0 p-2 z-10" autoComplete="off">
        <div className="flex items-end gap-2 overflow-x-auto">
          <table className="min-w-[700px] flex-1 border-collapse text-xs">
            <thead>
              <tr className="bg-gray-100 dark:bg-slate-700">
                {["Tax %", "Tax Amount", "Discount %", "Discount Amount", "Total Amount", "Total Paid", "Remaining"].map((label) => (
                  <th key={label} scope="col" className="border p-1 text-left font-medium text-gray-600 dark:border-slate-600 dark:text-gray-300">{label}</th>
                ))}
              </tr>
            </thead>
            <tbody>
              <tr className="text-gray-900 dark:text-gray-100">
                <td className="border p-1 dark:border-slate-600">{fmt(inv.tax_percentage)}</td>
                <td className="border p-1 dark:border-slate-600">{fmt(inv.tax_amount)}</td>
                <td className="border p-1 dark:border-slate-600">{fmt(inv.discount_percentage)}</td>
                <td className="border p-1 dark:border-slate-600">{fmt(inv.discount_amount)}</td>
                <td className="border p-1 font-bold dark:border-slate-600">{totalAmount.toFixed(2)}</td>
                <td className="border p-1 dark:border-slate-600">{totalPaid.toFixed(2)}</td>
                <td className="border p-1 dark:border-slate-600">{remainingAmount.toFixed(2)}</td>
              </tr>
            </tbody>
          </table>
          <div className="flex shrink-0 gap-2">
            <button
              type="button"
              onClick={() => navigate(`/purchase-invoices/${id}/edit`)}
              className={`px-3 py-2 rounded-sm text-xs font-semibold transition-all duration-200 ${btnSecondary.className}`}
              style={btnSecondary.style}
            >
              <PencilSquareIcon className="w-4 h-4" aria-hidden="true" />
              <span>Edit</span>
            </button>
            <button
              type="button"
              onClick={() => navigate("/purchase-invoices/create")}
              className={`px-3 py-2 rounded-sm text-xs font-semibold transition-all duration-200 ${btnPrimary.className}`}
              style={btnPrimary.style}
            >
              <PlusIcon className="w-4 h-4" aria-hidden="true" />
              <span>New Invoice</span>
            </button>
          </div>
        </div>
      </div>

      {/* ===== Delete Modal ===== */}
      {deleteModalOpen && (
        <div
          className="fixed inset-0 z-50 flex items-center justify-center bg-black/40"
          onClick={(e) => { if (e.target === e.currentTarget) closeDeleteModal(); }}
        >
          <div className="purchase-show-delete w-full max-w-md p-5" role="dialog" aria-modal="true" aria-label="Delete purchase invoice">
            {deleteStep === 1 && (
              <div>
                <h2 className="text-lg font-semibold mb-2 dark:text-gray-200">Delete purchase invoice?</h2>
                <div className="text-xs text-gray-600 dark:text-gray-400 mb-2">
                  <div><b className="dark:text-gray-300">Posted #:</b> {fmt(inv?.posted_number)}</div>
                  <div><b className="dark:text-gray-300">Invoice No:</b> {fmt(inv?.invoice_number)}</div>
                  <div><b className="dark:text-gray-300">Supplier:</b> {fmt(inv.supplier?.name ?? "N/A")}</div>
                  <div><b className="dark:text-gray-300">Total:</b> {totalAmount.toLocaleString()}</div>
                  <div><b className="dark:text-gray-300">Paid:</b> {totalPaid.toLocaleString()}</div>
                  <div><b className="dark:text-gray-300">Remaining:</b> {remainingAmount.toLocaleString()}</div>
                </div>
                <p className="text-sm text-gray-600 dark:text-gray-400">This action cannot be undone.</p>
                <div className="mt-4 flex justify-end gap-2">
                  <button 
                    className={`px-3 py-1.5 text-xs font-semibold transition-all duration-200 ${btnGlass.className}`}
                    style={btnGlass.style}
                    onClick={closeDeleteModal}
                  >
                    Cancel
                  </button>
                  <button
                    className={`px-3 py-1.5 text-xs font-semibold transition-all duration-200 ${btnDanger.className}`}
                    style={btnDanger.style}
                    onClick={() => setDeleteStep(2)}
                  >
                    Yes, continue
                  </button>
                </div>
              </div>
            )}

            {deleteStep === 2 && (
              <div>
                <h2 className="text-lg font-semibold mb-2 dark:text-gray-200">Confirm with password</h2>
                <p className="text-sm text-gray-600 dark:text-gray-400">
                  For security, please re-enter your password to delete this purchase invoice.
                </p>
                <input
                  type="password"
                  autoFocus
                  value={password}
                  onChange={(e) => setPassword(e.target.value)}
                  placeholder="Your password"
                  className="mt-3 w-full border rounded-sm px-3 py-2 focus:outline-hidden focus:ring-2 focus:ring-blue-500 dark:bg-slate-700 dark:border-slate-600 dark:text-gray-200 dark:placeholder-gray-500"
                  onKeyDown={(e) => {
                    if (e.key === "Enter") confirmAndDelete();
                    if (e.key === "Escape") closeDeleteModal();
                  }}
                />
                <div className="mt-4 flex justify-between">
                  <button
                    className={`px-3 py-1.5 text-xs font-semibold transition-all duration-200 ${btnGlass.className}`}
                    style={btnGlass.style}
                    onClick={() => setDeleteStep(1)}
                    disabled={deleting}
                  >
                    <ArrowLeftIcon className="w-4 h-4" aria-hidden="true" />
                    <span>Back</span>
                  </button>
                  <div className="flex gap-2">
                    <button 
                      className={`px-3 py-1.5 text-xs font-semibold transition-all duration-200 ${btnGlass.className}`}
                      style={btnGlass.style}
                      onClick={closeDeleteModal} 
                      disabled={deleting}
                    >
                      Cancel
                    </button>
                    <button
                      className={`px-3 py-1.5 text-xs font-semibold transition-all duration-200 disabled:opacity-60 ${btnDanger.className}`}
                      style={btnDanger.style}
                      onClick={confirmAndDelete}
                      disabled={deleting || password.trim() === ""}
                    >
                      {deleting ? "Deleting…" : "Confirm & Delete"}
                    </button>
                  </div>
                </div>
              </div>
            )}
          </div>
        </div>
      )}

      {/* ===== Search Modal ===== */}
      <PurchaseInvoiceSearch
        isOpen={searchOpen}
        onClose={() => setSearchOpen(false)}
        onSelect={(invoice) => {
          navigate(`/purchase-invoices/${invoice.id}`);
        }}
      />

      {/* Audit History Modal */}
      <DocumentHistoryModal
        isOpen={historyModalOpen}
        onClose={() => setHistoryModalOpen(false)}
        entityType="purchase_invoice"
        entityId={id}
        entityNumber={inv?.posted_number || inv?.invoice_number || `#${id}`}
      />

      {/* Outbound Document Share / PDF Modal */}
      <ShareDocumentModal
        isOpen={shareModalOpen}
        onClose={() => setShareModalOpen(false)}
        documentType="purchase_invoice"
        documentId={inv?.id || id}
      />

      {/* Void / Reversal Modal */}
      <VoidInvoiceModal
        isOpen={voidModalOpen}
        onClose={() => setVoidModalOpen(false)}
        onConfirm={handleConfirmVoid}
        invoice={inv}
        isReversing={isReversing}
      />

      {/* Record Payment Modal */}
      <RecordPaymentModal
        isOpen={paymentModalOpen}
        onClose={() => setPaymentModalOpen(false)}
        partyType="supplier"
        partyId={inv?.supplier_id}
        partyName={inv?.supplier?.name || ""}
        preselectedInvoiceId={id}
        onPaymentSuccess={async () => {
          const { data } = await axios.get(`/api/purchase-invoices/${id}`);
          setInv(data);
        }}
      />

      {/* Held Invoices Modal */}
      <InvoiceDraftsModal
        isOpen={isDraftsOpen}
        onClose={() => setIsDraftsOpen(false)}
        drafts={draftsList}
        onResumeDraft={(draftId) => {
          navigate(`/purchase-invoices/create?draft_id=${draftId}`);
        }}
        onDiscardDraft={async (draftId) => {
          try {
            await axios.delete(`/api/invoice-drafts/${draftId}`);
            toast.success("Draft discarded");
            fetchDrafts();
          } catch {
            toast.error("Failed to discard draft");
          }
        }}
        onStartBlank={() => {
          navigate("/purchase-invoices/create");
        }}
        type="purchase"
      />
    </div>
  );
}
