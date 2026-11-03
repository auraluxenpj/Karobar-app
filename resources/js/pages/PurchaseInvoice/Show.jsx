// /src/pages/purchase-invoices/Show.jsx
import { Fragment, useEffect, useState, useMemo } from "react";
import { useParams, useNavigate } from "react-router-dom";
import axios from "axios";
import {
  DocumentTextIcon,
  MagnifyingGlassIcon,
  PencilSquareIcon,
  TrashIcon,
  PlusIcon,
  ArrowLeftIcon,
  ClockIcon,
  ArrowUturnLeftIcon,
  BanknotesIcon,
  PrinterIcon,
  ShareIcon,
  BuildingStorefrontIcon,
} from "@heroicons/react/24/outline";
import toast from "react-hot-toast";
import { usePermissions, Guard } from "@/api/usePermissions.js";
import PageSkeleton from "@/components/PageSkeleton.jsx";
import { useTheme } from "@/context/ThemeContext";
import { useSaleSystem } from "@/context/SaleSystemContext.jsx";
import { getThemeButtonClasses } from "@/utils/buttonStyles";
import PurchaseInvoiceSearch from "@/components/PurchaseInvoiceSearch.jsx";
import DocumentHistoryModal from "@/components/DocumentHistoryModal.jsx";
import VoidInvoiceModal from "@/components/VoidInvoiceModal.jsx";
import RecordPaymentModal from "@/components/RecordPaymentModal.jsx";
import InvoiceDraftsModal from "@/components/InvoiceDraftsModal.jsx";
import ShareDocumentModal from "@/components/ShareDocumentModal.jsx";

const to2 = (n) => Number(parseFloat(n || 0).toFixed(2));

const PAYMENT_METHOD_LABELS = {
  cash: "Cash",
  card: "Card / POS",
  bank_transfer: "Bank Transfer",
  cheque: "Cheque",
  mobile_wallet: "Mobile Wallet",
  other: "Other",
};

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

  // Sale system setting to conditionally display wholesale fields
  const { hasWholesale } = useSaleSystem();

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
        primary: "#3b82f6",
        primaryHover: "#2563eb",
        primaryLight: "#dbeafe",
        secondary: "#8b5cf6",
        secondaryHover: "#7c3aed",
        secondaryLight: "#ede9fe",
        danger: "#ef4444",
        dangerHover: "#dc2626",
        dangerLight: "#fee2e2",
        tertiary: "#06b6d4",
        tertiaryHover: "#0891b2",
      };
    }
    return {
      primary: theme.primary_color || "#3b82f6",
      primaryHover: theme.primary_hover || "#2563eb",
      primaryLight: theme.primary_light || "#dbeafe",
      secondary: theme.secondary_color || "#8b5cf6",
      secondaryHover: theme.secondary_hover || "#7c3aed",
      secondaryLight: theme.secondary_light || "#ede9fe",
      tertiary: theme.tertiary_color || "#06b6d4",
      tertiaryHover: theme.tertiary_hover || "#0891b2",
      tertiaryLight: theme.tertiary_light || "#cffafe",
      danger: theme.danger_color || "#ef4444",
      dangerHover: "#dc2626",
      dangerLight: "#fee2e2",
    };
  }, [theme]);

  // Get button style from theme
  const buttonStyle = theme?.button_style || "modern";

  // Get button style classes and styles based on theme button_style
  const getButtonClasses = useMemo(
    () => getThemeButtonClasses(buttonStyle, themeColors, isDark),
    [buttonStyle, themeColors, isDark]
  );

  const btnPrimary = getButtonClasses.primary;
  const btnSecondary = getButtonClasses.secondary;
  const btnDanger = getButtonClasses.danger;
  const btnGlass = getButtonClasses.glass;

  // 🔒 permissions
  const { loading: permsLoading, canFor } = usePermissions?.() || {};
  const can = useMemo(
    () =>
      typeof canFor === "function"
        ? canFor("purchase-invoice")
        : { view: false, create: false, update: false, delete: false, import: false, export: false },
    [canFor]
  );

  // Fetch invoice
  useEffect(() => {
    (async () => {
      try {
        setLoading(true);
        const { data } = await axios.get(`/api/purchase-invoices/${id}`);
        setInv(data);
      } catch {
        toast.error("Failed to load invoice");
      } finally {
        setLoading(false);
      }
    })();
  }, [id]);

  // Calculate totals & item metrics
  const totalAmount = useMemo(() => to2(inv?.total_amount), [inv]);
  const totalPaid = useMemo(() => to2(inv?.total_paid), [inv]);
  const remainingAmount = useMemo(() => Math.max(to2(totalAmount - totalPaid), 0), [totalAmount, totalPaid]);
  const invoiceAmount = useMemo(() => to2(inv?.invoice_amount), [inv]);
  const difference = useMemo(() => to2(invoiceAmount - totalAmount), [invoiceAmount, totalAmount]);

  const itemMetrics = useMemo(() => {
    const items = inv?.items || [];
    let rowsTotal = 0;
    let totalPacks = 0;
    let totalUnits = 0;
    let totalBonusPacks = 0;
    let totalBonusUnits = 0;

    for (const it of items) {
      rowsTotal += Number(it.sub_total || 0);
      totalPacks += Number(it.pack_quantity || 0);
      totalUnits += Number(it.unit_quantity || 0);
      totalBonusPacks += Number(it.pack_bonus || 0);
      totalBonusUnits += Number(it.unit_bonus || 0);
    }

    return {
      count: items.length,
      rowsTotal: to2(rowsTotal),
      totalPacks: to2(totalPacks),
      totalUnits: Math.round(totalUnits),
      totalBonusPacks: to2(totalBonusPacks),
      totalBonusUnits: Math.round(totalBonusUnits),
    };
  }, [inv]);

  // Precompute consecutive brand group counts so brand headings show item count like PurchaseInvoiceForm
  const brandGroupStartCounts = useMemo(() => {
    const items = inv?.items || [];
    const counts = new Map();
    let i = 0;
    while (i < items.length) {
      const brand = items[i]?.product?.brand?.name || items[i]?.product?.brand_name || "";
      let j = i + 1;
      while (
        j < items.length &&
        (items[j]?.product?.brand?.name || items[j]?.product?.brand_name || "") === brand
      ) {
        j++;
      }
      counts.set(i, j - i);
      i = j;
    }
    return counts;
  }, [inv]);

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
      if (k === "b" || e.code === "KeyB") {
        e.preventDefault();
        navigate(-1);
      }
      if (k === "f" || e.code === "KeyF") {
        e.preventDefault();
        setSearchOpen(true);
      }
      if (k === "p" || e.code === "KeyP") {
        e.preventDefault();
        window.print();
      }
      if (k === "e" || e.code === "KeyE") {
        if (!can.update || inv?.status === "reversed") return;
        e.preventDefault();
        navigate(`/purchase-invoices/${id}/edit`);
      }
      if (k === "d" || e.code === "KeyD") {
        if (!can.delete) return;
        e.preventDefault();
        openDeleteModal();
      }
      if (k === "n" || e.code === "KeyN") {
        if (!can.create) return;
        e.preventDefault();
        navigate("/purchase-invoices/create");
      }
      if (k === "h" || e.code === "KeyH") {
        e.preventDefault();
        setIsDraftsOpen((prev) => !prev);
      }
    };
    document.addEventListener("keydown", onKey);
    return () => document.removeEventListener("keydown", onKey);
  }, [navigate, id, can, inv?.status]);

  if (loading || permsLoading) return <PageSkeleton />;
  if (!inv) return <div className="p-4 text-sm dark:text-gray-400">Invoice not found.</div>;

  const fmt = (v) => ((v ?? "") === "" ? "" : String(v));
  const fmtMoney = (v) => {
    if (v === null || v === undefined || v === "") return "—";
    const num = Number(v);
    return Number.isFinite(num) ? num.toFixed(2) : String(v);
  };
  const fmtQty = (v) => {
    if (v === null || v === undefined || v === "") return "0";
    const num = Number(v);
    if (!Number.isFinite(num)) return String(v);
    return Number.isInteger(num) ? String(num) : String(Number(num.toFixed(2)));
  };
  const fmtPct = (v) => {
    if (v === null || v === undefined || v === "") return "—";
    const num = Number(v);
    if (!Number.isFinite(num)) return String(v);
    return `${Number(num.toFixed(2))}%`;
  };

  const hasDueDateCol = Boolean(inv.invoice_type === "credit" || inv.due_date);
  const totalCols = hasWholesale ? 20 : 17;
  const paymentMethodLabel =
    PAYMENT_METHOD_LABELS[inv.payment_method] ||
    (inv.payment_method ? String(inv.payment_method).replace(/_/g, " ") : "Cash");

  return (
    <div
      className="purchase-show purchase-entry flex flex-col h-auto lg:h-[calc(100dvh-130px)]"
      autoComplete="off"
    >
      <style>{`
        @media print {
          .no-print { display: none !important; }
        }
      `}</style>

      {inv.purchase_order && (
        <div className="g-toolbar px-3 py-1 text-[11px] flex flex-wrap items-center justify-between gap-2 border-b border-gray-200 dark:border-slate-700">
          <span>
            Source Purchase Order:{" "}
            <a className="underline font-semibold" href={`/purchase-orders/${inv.purchase_order.id}`}>
              {inv.purchase_order.number}
            </a>
          </span>
          {inv.purchase_order.status && (
            <span className="px-2 py-0.5 rounded text-[10px] font-semibold uppercase tracking-wide bg-blue-500/10 text-blue-600 dark:text-blue-300">
              {String(inv.purchase_order.status).replace(/_/g, " ")}
            </span>
          )}
        </div>
      )}

      {/* ================= HEADER SECTION ================= */}
      <div className="purchase-show-header purchase-entry-header sticky top-0 z-10 shadow-sm" autoComplete="off">
        {/* ---- Compact Branded Title Banner ---- */}
        <div className="purchase-show-banner purchase-entry-banner px-3 py-1.5 flex items-center justify-between gap-2 flex-wrap">
          <div className="flex items-center gap-2.5 min-w-0">
            <div className="purchase-show-icon purchase-entry-icon w-8 h-8 rounded-lg flex items-center justify-center shadow-inner shrink-0">
              <DocumentTextIcon aria-hidden="true" className="w-4 h-4" />
            </div>
            <div className="min-w-0">
              <div className="flex items-center gap-2 flex-wrap">
                <h2 className="purchase-show-title purchase-entry-title text-sm font-bold leading-none">
                  Purchase Invoice
                </h2>
                {inv.posted_number && (
                  <span className="px-2 py-0.5 rounded-md text-[10px] font-mono font-bold tracking-wide bg-blue-500/15 text-blue-700 dark:bg-blue-400/20 dark:text-blue-200 border border-blue-500/20">
                    #{fmt(inv.posted_number)}
                  </span>
                )}
                {inv.invoice_number && (
                  <span className="px-2 py-0.5 rounded-md text-[10px] font-mono font-semibold bg-gray-500/10 text-gray-700 dark:bg-slate-700/80 dark:text-slate-300 border border-gray-400/20">
                    Bill #{fmt(inv.invoice_number)}
                  </span>
                )}
                {inv.status === "reversed" && (
                  <span className="px-2 py-0.5 rounded-md text-[10px] font-extrabold uppercase bg-rose-600 text-white tracking-wider border border-rose-400 shadow-xs">
                    REVERSED
                  </span>
                )}
              </div>
              <p className="purchase-show-shortcuts text-[10px] mt-0.5 hidden sm:block truncate">
                Alt+F search · Alt+E edit · Alt+P print · Alt+D delete · Alt+N new · Alt+B back
              </p>
            </div>
          </div>

          <div className="flex flex-wrap items-center gap-1.5 no-print">
            {/* Read-only Debit / Credit Segmented Indicator */}
            <div
              className="purchase-entry-type flex items-center gap-0.5 rounded-md p-0.5 shadow-inner"
              aria-label="Invoice type"
            >
              {["debit", "credit"].map((type) => {
                const active = (inv.invoice_type || "debit") === type;
                return (
                  <span
                    key={type}
                    className={`purchase-entry-type-button inline-flex items-center gap-1 px-2.5 py-0.5 text-[11px] font-semibold rounded ${
                      active ? "is-active theme-btn-primary shadow-xs" : "opacity-60"
                    }`}
                  >
                    <span>{type === "debit" ? "Debit" : "Credit"}</span>
                  </span>
                );
              })}
            </div>

            <button
              type="button"
              onClick={() => setSearchOpen(true)}
              className={`h-7 px-2.5 rounded-md text-[11px] font-semibold transition-all duration-200 ${btnSecondary.className}`}
              style={btnSecondary.style}
              title="Search Purchase Invoices (Alt+F)"
            >
              <MagnifyingGlassIcon className="w-3.5 h-3.5" aria-hidden="true" />
              <span>Search</span>
            </button>

            {remainingAmount > 0.01 && inv.status !== "reversed" && (
              <button
                type="button"
                onClick={() => setPaymentModalOpen(true)}
                className="h-7 px-2.5 rounded-md text-[11px] font-semibold transition-all duration-200 bg-emerald-600 hover:bg-emerald-500 text-white shadow-xs flex items-center gap-1"
                title="Record payment to supplier against this invoice"
              >
                <BanknotesIcon className="w-3.5 h-3.5" aria-hidden="true" />
                <span>Pay Supplier</span>
              </button>
            )}

            <button
              type="button"
              onClick={() => window.print()}
              className={`h-7 px-2.5 rounded-md text-[11px] font-semibold transition-all duration-200 ${btnSecondary.className}`}
              style={btnSecondary.style}
              title="Print GRN / Purchase Invoice (Alt+P)"
            >
              <PrinterIcon className="w-3.5 h-3.5" aria-hidden="true" />
              <span>Print</span>
            </button>

            <button
              type="button"
              onClick={() => setShareModalOpen(true)}
              className={`h-7 px-2.5 rounded-md text-[11px] font-semibold transition-all duration-200 ${btnSecondary.className}`}
              style={btnSecondary.style}
              title="Download PDF or Share via WhatsApp / Email"
            >
              <ShareIcon className="w-3.5 h-3.5" aria-hidden="true" />
              <span>PDF / Share</span>
            </button>

            <button
              type="button"
              onClick={() => setHistoryModalOpen(true)}
              className={`h-7 px-2.5 rounded-md text-[11px] font-semibold transition-all duration-200 ${btnSecondary.className}`}
              style={btnSecondary.style}
              title="View audit history"
            >
              <ClockIcon className="w-3.5 h-3.5" aria-hidden="true" />
              <span>History</span>
            </button>

            <button
              type="button"
              onClick={() => {
                fetchDrafts();
                setIsDraftsOpen(true);
              }}
              className={`h-7 px-2.5 rounded-md text-[11px] font-semibold transition-all duration-200 ${btnSecondary.className} relative flex items-center gap-1.5`}
              style={btnSecondary.style}
              title="Open Held Invoices (Alt+H)"
            >
              <ClockIcon className="w-3.5 h-3.5 text-amber-400" aria-hidden="true" />
              <span>Held</span>
              {draftsList.length > 0 && (
                <span className="inline-flex items-center justify-center px-1.5 py-0.2 text-[10px] font-bold leading-none text-white bg-amber-500 rounded-full">
                  {draftsList.length}
                </span>
              )}
            </button>

            <Guard when={can.delete}>
              {inv.status !== "reversed" && (
                <button
                  type="button"
                  onClick={() => setVoidModalOpen(true)}
                  className="h-7 px-2.5 rounded-md text-[11px] font-semibold transition-all duration-200 bg-amber-500 hover:bg-amber-600 text-white shadow-xs flex items-center gap-1"
                  title="Void / Reverse this invoice safely"
                >
                  <ArrowUturnLeftIcon className="w-3.5 h-3.5" aria-hidden="true" />
                  <span>Void</span>
                </button>
              )}
            </Guard>

            <Guard when={can.update}>
              {inv.status !== "reversed" ? (
                <button
                  type="button"
                  onClick={() => navigate(`/purchase-invoices/${id}/edit`)}
                  className={`h-7 px-2.5 rounded-md text-[11px] font-semibold transition-all duration-200 ${btnSecondary.className}`}
                  style={btnSecondary.style}
                  title="Edit Invoice (Alt+E)"
                >
                  <PencilSquareIcon className="w-3.5 h-3.5" aria-hidden="true" />
                  <span>Edit</span>
                </button>
              ) : (
                <span
                  className="h-7 px-2.5 rounded-md text-[11px] font-semibold opacity-40 cursor-not-allowed bg-gray-200 dark:bg-slate-700 text-gray-500 flex items-center gap-1"
                  title="Reversed invoices cannot be edited"
                >
                  <PencilSquareIcon className="w-3.5 h-3.5" aria-hidden="true" />
                  <span>Edit</span>
                </span>
              )}
            </Guard>

            <Guard when={can.delete}>
              <button
                type="button"
                onClick={openDeleteModal}
                className={`h-7 px-2.5 rounded-md text-[11px] font-semibold transition-all duration-200 ${btnDanger.className}`}
                style={btnDanger.style}
                title="Delete Invoice (Alt+D)"
              >
                <TrashIcon className="w-3.5 h-3.5" aria-hidden="true" />
                <span>Delete</span>
              </button>
            </Guard>

            <Guard when={can.create}>
              <button
                type="button"
                onClick={() => navigate("/purchase-invoices/create")}
                className={`h-7 px-2.5 rounded-md text-[11px] font-semibold transition-all duration-200 ${btnPrimary.className}`}
                style={btnPrimary.style}
                title="New Purchase Invoice (Alt+N)"
              >
                <PlusIcon className="w-3.5 h-3.5" aria-hidden="true" />
                <span>New</span>
              </button>
            </Guard>

            <button
              type="button"
              onClick={() => navigate(-1)}
              className={`h-7 px-2.5 rounded-md text-[11px] font-medium transition-all duration-200 ${btnGlass.className}`}
              style={btnGlass.style}
              title="Back (Alt+B)"
            >
              <ArrowLeftIcon className="w-3.5 h-3.5" aria-hidden="true" />
              <span>Back</span>
            </button>
          </div>
        </div>

        {/* ---- Compact Header Details Table Card (matches SaleInvoice/Show & PurchaseInvoiceForm) ---- */}
        <div className="purchase-show-details purchase-entry-details px-3 py-1.5">
          <div className={`overflow-x-auto rounded-lg border ${isDark ? "border-slate-700" : "border-gray-200"}`}>
            <table className="w-full text-[11px] border-collapse">
              <thead>
                <tr
                  className={`border-b text-[9.5px] font-semibold uppercase tracking-wide ${
                    isDark
                      ? "bg-slate-800/90 text-slate-400 border-slate-700"
                      : "bg-gray-50 text-gray-500 border-gray-200"
                  }`}
                >
                  <th className={`px-2.5 py-1 text-left border-r w-28 ${isDark ? "border-slate-700" : "border-gray-200"}`}>
                    Posted #
                  </th>
                  <th className={`px-2.5 py-1 text-left border-r w-28 ${isDark ? "border-slate-700" : "border-gray-200"}`}>
                    Posted Date
                  </th>
                  <th className={`px-2.5 py-1 text-left border-r min-w-[180px] ${isDark ? "border-slate-700" : "border-gray-200"}`}>
                    Supplier
                  </th>
                  <th className={`px-2.5 py-1 text-left border-r w-28 ${isDark ? "border-slate-700" : "border-gray-200"}`}>
                    Invoice #
                  </th>
                  <th className={`px-2.5 py-1 text-right border-r w-28 ${isDark ? "border-slate-700" : "border-gray-200"}`}>
                    Bill Amount
                  </th>
                  <th className={`px-2.5 py-1 text-right border-r w-24 ${isDark ? "border-slate-700" : "border-gray-200"}`}>
                    Difference
                  </th>
                  {hasDueDateCol && (
                    <th className={`px-2.5 py-1 text-left border-r w-28 ${isDark ? "border-slate-700" : "border-gray-200"}`}>
                      Due Date
                    </th>
                  )}
                  <th className={`px-2.5 py-1 text-center border-r w-28 ${isDark ? "border-slate-700" : "border-gray-200"}`}>
                    Items / Qty
                  </th>
                  <th className="px-2.5 py-1 text-left min-w-[160px]">Remarks</th>
                </tr>
              </thead>
              <tbody>
                <tr className={isDark ? "bg-slate-800/60 text-slate-200" : "bg-white text-gray-800"}>
                  <td className={`px-2.5 py-1.5 font-mono font-semibold border-r ${isDark ? "border-slate-700" : "border-gray-200"}`}>
                    {fmt(inv.posted_number) || "—"}
                  </td>
                  <td className={`px-2.5 py-1.5 font-mono border-r ${isDark ? "border-slate-700" : "border-gray-200"}`}>
                    {fmt(inv.posted_date) || "—"}
                  </td>
                  <td
                    className={`px-2.5 py-1.5 font-semibold border-r ${
                      isDark ? "border-slate-700 text-blue-300" : "border-gray-200 text-blue-700"
                    }`}
                  >
                    <span className="inline-flex items-center gap-1.5">
                      <BuildingStorefrontIcon className="w-3.5 h-3.5 shrink-0 text-blue-500" aria-hidden="true" />
                      <span>{inv.supplier?.name ?? inv.supplier_id ?? "—"}</span>
                    </span>
                  </td>
                  <td className={`px-2.5 py-1.5 font-mono font-medium border-r ${isDark ? "border-slate-700" : "border-gray-200"}`}>
                    {fmt(inv.invoice_number) || "—"}
                  </td>
                  <td className={`px-2.5 py-1.5 font-mono font-semibold text-right border-r ${isDark ? "border-slate-700" : "border-gray-200"}`}>
                    {fmtMoney(inv.invoice_amount)}
                  </td>
                  <td
                    className={`px-2.5 py-1.5 font-mono font-bold text-right border-r ${
                      isDark ? "border-slate-700" : "border-gray-200"
                    } ${
                      Math.abs(difference) > 0.009
                        ? "text-red-600 dark:text-red-400"
                        : "text-emerald-600 dark:text-emerald-400"
                    }`}
                  >
                    {difference.toFixed(2)}
                  </td>
                  {hasDueDateCol && (
                    <td className={`px-2.5 py-1.5 font-mono border-r ${isDark ? "border-slate-700" : "border-gray-200"}`}>
                      {fmt(inv.due_date) || "—"}
                    </td>
                  )}
                  <td className={`px-2.5 py-1.5 text-center font-mono border-r ${isDark ? "border-slate-700" : "border-gray-200"}`}>
                    <span className="font-bold">{itemMetrics.count}</span>
                    <span className="text-[10px] text-gray-500 dark:text-slate-400 ml-1">
                      ({fmtQty(itemMetrics.totalPacks)}P / {itemMetrics.totalUnits}U)
                    </span>
                  </td>
                  <td className="px-2.5 py-1.5 text-gray-700 dark:text-slate-300">
                    {fmt(inv.remarks) || "—"}
                  </td>
                </tr>
              </tbody>
            </table>
          </div>
        </div>
      </div>

      {/* ================= ITEMS SECTION ================= */}
      <div className="purchase-show-items purchase-entry-items flex-1 min-h-0 overflow-auto px-2 py-1.5" autoComplete="off">
        <table
          className={`invoice-repeater-table w-full lg:table-fixed ${
            hasWholesale ? "lg:min-w-[1160px]" : "lg:min-w-[1000px]"
          } border-collapse text-[11px]`}
        >
          <colgroup>
            <col className="w-8" />
            <col className="w-auto min-w-[220px]" />
            <col className="w-11" />
            <col className="w-[78px]" />
            <col className="w-[82px]" />
            <col className="w-12" />
            <col className="w-12" />
            <col className="w-14" />
            <col className="w-14" />
            <col className="w-11" />
            <col className="w-11" />
            <col className="w-11" />
            <col className="w-14" />
            <col className="w-14" />
            {hasWholesale && <col className="w-14" />}
            {hasWholesale && <col className="w-14" />}
            <col className="w-12" />
            {hasWholesale && <col className="w-12" />}
            <col className="w-14" />
            <col className="w-20" />
          </colgroup>
          <thead className="sticky top-0 bg-gray-100 dark:bg-slate-700 z-5">
            <tr>
              <th rowSpan={2} className="border w-8 purchase-th-readonly dark:border-slate-600">
                #
              </th>
              <th rowSpan={2} colSpan={1} className="border w-[25%] min-w-[220px] purchase-th-editable text-left px-2 dark:border-slate-600">
                Product
              </th>
              <th colSpan={3} className="border dark:border-slate-600">
                Pack Size / Batch / Expiry
              </th>
              <th colSpan={2} className="border purchase-th-editable dark:border-slate-600">
                Qty (Pack / Unit)
              </th>
              <th colSpan={2} className="border purchase-th-editable dark:border-slate-600">
                Purchase Price (P / U)
              </th>
              <th colSpan={3} className="border purchase-th-editable dark:border-slate-600">
                Disc % / Bonus (P / U)
              </th>
              <th colSpan={2} className="border purchase-th-editable dark:border-slate-600">
                Sale Price (P / U)
              </th>
              {hasWholesale && (
                <th colSpan={2} className="border purchase-th-editable dark:border-slate-600">
                  Wholesale Price (P / U)
                </th>
              )}
              <th colSpan={hasWholesale ? 4 : 3} className="border purchase-th-readonly dark:border-slate-600">
                Margin % {hasWholesale && "/ W.S.Mrg% "}/ Avg / Sub Total
              </th>
            </tr>

            <tr>
              <th className="border w-11 purchase-th-readonly dark:border-slate-600" title="Pack Size">
                PSize
              </th>
              <th className="border w-[78px] purchase-th-editable dark:border-slate-600">Batch</th>
              <th className="border w-[82px] purchase-th-editable dark:border-slate-600">Exp</th>
              <th className="border w-12 purchase-th-editable dark:border-slate-600">Pack.Q</th>
              <th className="border w-12 purchase-th-editable dark:border-slate-600">Unit.Q</th>
              <th className="border w-14 purchase-th-editable dark:border-slate-600">Pack.P</th>
              <th className="border w-14 purchase-th-editable dark:border-slate-600">Unit.P</th>
              <th className="border w-11 purchase-th-editable dark:border-slate-600">Disc%</th>
              <th className="border w-11 purchase-th-editable dark:border-slate-600">PBonus</th>
              <th className="border w-11 purchase-th-editable dark:border-slate-600">UBonus</th>
              <th className="border w-14 purchase-th-editable dark:border-slate-600">Pack.S</th>
              <th className="border w-14 purchase-th-editable dark:border-slate-600">Unit.S</th>
              {hasWholesale && (
                <th className="border w-14 purchase-th-editable dark:border-slate-600">W.S.Pack</th>
              )}
              {hasWholesale && (
                <th className="border w-14 purchase-th-editable dark:border-slate-600">W.S.Unit</th>
              )}
              <th className="border w-12 purchase-th-readonly dark:border-slate-600" title="Retail Margin %">
                Margin%
              </th>
              {hasWholesale && (
                <th className="border w-12 purchase-th-readonly dark:border-slate-600" title="Wholesale Margin %">
                  W.S.Mrg%
                </th>
              )}
              <th className="border w-14 purchase-th-readonly dark:border-slate-600" title="Average Unit Cost">
                Avg
              </th>
              <th className="border w-20 purchase-th-readonly dark:border-slate-600" title="Row Sub Total">
                Sub Total
              </th>
            </tr>
          </thead>

          <tbody>
            {(inv.items || []).map((item, i) => {
              const brand = item.product?.brand?.name || item.product?.brand_name || "";
              const previousBrand =
                inv.items[i - 1]?.product?.brand?.name || inv.items[i - 1]?.product?.brand_name || "";
              const isBrandGroupStart = i === 0 || previousBrand !== brand;
              const groupCount = brandGroupStartCounts.get(i) || 1;
              const hasDisc = Number(item.item_discount_percentage || 0) > 0;
              const hasPackBonus = Number(item.pack_bonus || 0) > 0;
              const hasUnitBonus = Number(item.unit_bonus || 0) > 0;

              return (
                <Fragment key={item.id || i}>
                  {isBrandGroupStart && (
                    <tr className="purchase-invoice-brand-heading">
                      <th colSpan={totalCols} scope="rowgroup">
                        <span className="inline-flex items-center gap-1.5">
                          <span>{brand || "No Brand"}</span>
                          <span className="font-normal opacity-60">· {groupCount}</span>
                        </span>
                      </th>
                    </tr>
                  )}
                  <tr className="invoice-repeater-row text-center dark:text-gray-200">
                    <td
                      data-label="Item #"
                      className="invoice-cell-index-only border px-1 font-mono text-gray-500 dark:text-slate-400 dark:border-slate-600"
                    >
                      {i + 1}
                    </td>
                    <td
                      data-label="Product"
                      className="invoice-cell-product border px-2 text-left font-medium text-gray-900 dark:text-gray-100 dark:border-slate-600"
                    >
                      <div className="flex items-center justify-between gap-1.5 min-w-0">
                        <span className="truncate">{fmt(item.product?.name ?? item.product_id)}</span>
                        {item.product?.product_code && (
                          <span className="shrink-0 px-1 py-0.2 rounded text-[9.5px] font-mono text-gray-500 dark:text-slate-400 bg-gray-100 dark:bg-slate-700/70">
                            {item.product.product_code}
                          </span>
                        )}
                      </div>
                    </td>
                    <td
                      data-label="Pack Size"
                      className="border px-1 font-mono text-gray-600 dark:text-slate-300 dark:border-slate-600"
                    >
                      {fmt(item.pack_size) || "—"}
                    </td>
                    <td
                      data-label="Batch"
                      className="border px-1 font-mono text-gray-700 dark:text-slate-300 dark:border-slate-600 truncate"
                      title={item.batch || "Unassigned"}
                    >
                      {fmt(item.batch) || "—"}
                    </td>
                    <td
                      data-label="Expiry"
                      title={item.expiry ? String(item.expiry).trim().slice(0, 10) : undefined}
                      className="border px-1 font-mono text-gray-700 dark:text-slate-300 dark:border-slate-600"
                    >
                      {item.expiry
                        ? String(item.expiry)
                            .trim()
                            .slice(0, 10)
                            .replace(/^(\d{4})-(\d{2})(?:-\d{2})?$/, "$2/$1")
                        : "—"}
                    </td>
                    <td
                      data-label="Pack Qty"
                      className="border px-1.5 font-mono font-bold text-gray-900 dark:text-gray-100 dark:border-slate-600"
                    >
                      {fmtQty(item.pack_quantity)}
                    </td>
                    <td
                      data-label="Unit Qty"
                      className="border px-1.5 font-mono font-bold text-gray-900 dark:text-gray-100 dark:border-slate-600"
                    >
                      {fmtQty(item.unit_quantity)}
                    </td>
                    <td
                      data-label="Pack Cost"
                      className="border px-1.5 text-right font-mono dark:border-slate-600"
                    >
                      {fmtMoney(item.pack_purchase_price)}
                    </td>
                    <td
                      data-label="Unit Cost"
                      className="border px-1.5 text-right font-mono dark:border-slate-600"
                    >
                      {fmtMoney(item.unit_purchase_price)}
                    </td>
                    <td
                      data-label="Disc %"
                      className={`border px-1 font-mono dark:border-slate-600 ${
                        hasDisc ? "font-semibold text-rose-600 dark:text-rose-400" : "text-gray-500 dark:text-slate-400"
                      }`}
                    >
                      {hasDisc ? fmtPct(item.item_discount_percentage) : "0"}
                    </td>
                    <td
                      data-label="Pack Bonus"
                      className={`border px-1 font-mono dark:border-slate-600 ${
                        hasPackBonus
                          ? "font-semibold text-emerald-600 dark:text-emerald-400"
                          : "text-gray-500 dark:text-slate-400"
                      }`}
                    >
                      {fmtQty(item.pack_bonus)}
                    </td>
                    <td
                      data-label="Unit Bonus"
                      className={`border px-1 font-mono dark:border-slate-600 ${
                        hasUnitBonus
                          ? "font-semibold text-emerald-600 dark:text-emerald-400"
                          : "text-gray-500 dark:text-slate-400"
                      }`}
                    >
                      {fmtQty(item.unit_bonus)}
                    </td>
                    <td
                      data-label="Pack Sale"
                      className="border px-1.5 text-right font-mono dark:border-slate-600"
                    >
                      {fmtMoney(item.pack_sale_price)}
                    </td>
                    <td
                      data-label="Unit Sale"
                      className="border px-1.5 text-right font-mono dark:border-slate-600"
                    >
                      {fmtMoney(item.unit_sale_price)}
                    </td>
                    {hasWholesale && (
                      <td
                        data-label="W.S. Pack"
                        className="border px-1.5 text-right font-mono dark:border-slate-600"
                      >
                        {fmtMoney(item.whole_sale_pack_price)}
                      </td>
                    )}
                    {hasWholesale && (
                      <td
                        data-label="W.S. Unit"
                        className="border px-1.5 text-right font-mono dark:border-slate-600"
                      >
                        {fmtMoney(item.whole_sale_unit_price)}
                      </td>
                    )}
                    <td
                      data-label="Margin %"
                      className="border px-1 font-mono font-semibold text-blue-600 dark:text-blue-400 dark:border-slate-600"
                    >
                      {fmtPct(item.margin)}
                    </td>
                    {hasWholesale && (
                      <td
                        data-label="W.S. Mrg %"
                        className="border px-1 font-mono font-semibold text-indigo-600 dark:text-indigo-400 dark:border-slate-600"
                      >
                        {fmtPct(item.whole_sale_margin)}
                      </td>
                    )}
                    <td
                      data-label="Avg Cost"
                      className="border px-1.5 text-right font-mono text-gray-600 dark:text-slate-300 dark:border-slate-600"
                    >
                      {fmtMoney(item.avg_price)}
                    </td>
                    <td
                      data-label="Sub Total"
                      className="invoice-cell-subtotal border px-2 text-right font-mono font-bold text-gray-900 dark:text-gray-100 dark:border-slate-600"
                    >
                      {fmtMoney(item.sub_total)}
                    </td>
                  </tr>
                </Fragment>
              );
            })}
          </tbody>
        </table>
      </div>

      {/* ================= COMPACT 2-ROW FOOTER SECTION (matches PurchaseInvoiceForm) ================= */}
      <div
        className="purchase-show-footer purchase-entry-footer lg:sticky lg:bottom-0 z-10 border-t shadow-[0_-4px_16px_-6px_rgba(0,0,0,0.18)]"
        autoComplete="off"
      >
        <div className="px-3 py-1.5 space-y-1">
          {/* ---- Row 1: Adjustments (Disc / Tax) + Computed Totals ---- */}
          <div className="flex flex-wrap items-center justify-between gap-x-4 gap-y-1">
            <div className="flex items-center gap-3 flex-wrap">
              <div className="flex items-center gap-1.5">
                <span className="text-[10px] font-semibold uppercase tracking-wide text-gray-500 dark:text-gray-400 whitespace-nowrap">
                  Disc %
                </span>
                <div className="purchase-readonly-field h-7 min-w-[52px] flex items-center justify-end px-2 rounded-md text-xs font-mono text-gray-900 dark:text-gray-100">
                  {to2(inv.discount_percentage).toFixed(2)}%
                </div>
              </div>
              <div className="flex items-center gap-1.5">
                <span className="text-[10px] font-semibold uppercase tracking-wide text-gray-500 dark:text-gray-400 whitespace-nowrap">
                  Discount
                </span>
                <div className="purchase-readonly-field h-7 min-w-[76px] flex items-center justify-end px-2 rounded-md text-xs font-mono text-gray-900 dark:text-gray-100">
                  {to2(inv.discount_amount).toFixed(2)}
                </div>
              </div>
              <div className="flex items-center gap-1.5">
                <span className="text-[10px] font-semibold uppercase tracking-wide text-gray-500 dark:text-gray-400 whitespace-nowrap">
                  Tax %
                </span>
                <div className="purchase-readonly-field h-7 min-w-[52px] flex items-center justify-end px-2 rounded-md text-xs font-mono text-gray-900 dark:text-gray-100">
                  {to2(inv.tax_percentage).toFixed(2)}%
                </div>
              </div>
              <div className="flex items-center gap-1.5">
                <span className="text-[10px] font-semibold uppercase tracking-wide text-gray-500 dark:text-gray-400 whitespace-nowrap">
                  Tax
                </span>
                <div className="purchase-readonly-field h-7 min-w-[76px] flex items-center justify-end px-2 rounded-md text-xs font-mono text-gray-900 dark:text-gray-100">
                  {to2(inv.tax_amount).toFixed(2)}
                </div>
              </div>
              {(itemMetrics.totalBonusPacks > 0 || itemMetrics.totalBonusUnits > 0) && (
                <div className="flex items-center gap-1.5">
                  <span className="text-[10px] font-semibold uppercase tracking-wide text-emerald-600 dark:text-emerald-400 whitespace-nowrap">
                    Bonus
                  </span>
                  <div className="purchase-readonly-field h-7 flex items-center px-2 rounded-md text-xs font-mono font-semibold !text-emerald-600 dark:!text-emerald-400">
                    {fmtQty(itemMetrics.totalBonusPacks)}P / {itemMetrics.totalBonusUnits}U
                  </div>
                </div>
              )}
            </div>

            <div className="flex items-center gap-3 flex-wrap ml-auto">
              <div className="flex items-center gap-1.5">
                <span className="text-[10px] font-semibold uppercase tracking-wide text-gray-500 dark:text-gray-400 whitespace-nowrap">
                  Items Total
                </span>
                <div className="purchase-readonly-field h-7 flex items-center px-2 rounded-md text-xs font-medium font-mono text-gray-900 dark:text-gray-100">
                  {itemMetrics.rowsTotal.toFixed(2)}
                </div>
              </div>
              {to2(inv.discount_amount) > 0 && (
                <div className="flex items-center gap-1.5">
                  <span className="text-[10px] font-semibold uppercase tracking-wide text-gray-500 dark:text-gray-400 whitespace-nowrap">
                    Disc {inv.discount_percentage ? `(${to2(inv.discount_percentage)}%)` : ""}
                  </span>
                  <div className="purchase-readonly-field h-7 flex items-center px-2 rounded-md text-xs font-medium font-mono !text-red-500 dark:!text-red-400">
                    −{to2(inv.discount_amount).toFixed(2)}
                  </div>
                </div>
              )}
              {to2(inv.tax_amount) > 0 && (
                <div className="flex items-center gap-1.5">
                  <span className="text-[10px] font-semibold uppercase tracking-wide text-gray-500 dark:text-gray-400 whitespace-nowrap">
                    Tax {inv.tax_percentage ? `(${to2(inv.tax_percentage)}%)` : ""}
                  </span>
                  <div className="purchase-readonly-field h-7 flex items-center px-2 rounded-md text-xs font-medium font-mono text-gray-900 dark:text-gray-100">
                    +{to2(inv.tax_amount).toFixed(2)}
                  </div>
                </div>
              )}
              <div className="flex items-center gap-1.5">
                <span
                  className="text-[10px] font-bold uppercase tracking-wide whitespace-nowrap"
                  style={{ color: themeColors.primary }}
                >
                  Total Amount
                </span>
                <div
                  className="h-7 flex items-center px-2.5 rounded-md text-xs font-bold font-mono border"
                  style={{
                    background: `${themeColors.primary}14`,
                    color: themeColors.primary,
                    borderColor: `${themeColors.primary}40`,
                  }}
                >
                  {totalAmount.toFixed(2)}
                </div>
              </div>
            </div>
          </div>

          {/* ---- Row 2: Payment Method & Account + Total Paid + Remaining + Quick Actions ---- */}
          <div className="flex flex-wrap items-center justify-between gap-x-4 gap-y-1 pt-1 border-t border-gray-100 dark:border-slate-700/60">
            <div className="flex items-center gap-3 flex-wrap">
              <div className="flex items-center gap-1.5">
                <span className="text-[10px] font-semibold uppercase tracking-wide text-gray-500 dark:text-gray-400 whitespace-nowrap">
                  Method
                </span>
                <div className="purchase-readonly-field h-7 flex items-center px-2.5 rounded-md text-xs font-semibold text-gray-900 dark:text-gray-100 capitalize">
                  {paymentMethodLabel}
                </div>
              </div>

              {inv.account && (
                <div className="flex items-center gap-1.5">
                  <span className="text-[10px] font-semibold uppercase tracking-wide text-gray-500 dark:text-gray-400 whitespace-nowrap">
                    Account
                  </span>
                  <div className="purchase-readonly-field h-7 flex items-center px-2.5 rounded-md text-xs font-medium text-gray-900 dark:text-gray-100">
                    {inv.account.code ? `${inv.account.code} · ` : ""}
                    {inv.account.name}
                  </div>
                </div>
              )}

              <div className="flex items-center gap-1.5">
                <span className="text-[10px] font-semibold uppercase tracking-wide text-gray-500 dark:text-gray-400 whitespace-nowrap">
                  Total Paid
                </span>
                <div className="purchase-readonly-field h-7 min-w-[84px] flex items-center justify-end px-2 rounded-md text-xs font-bold font-mono text-gray-900 dark:text-gray-100">
                  {totalPaid.toFixed(2)}
                </div>
              </div>

              <div className="flex items-center gap-1.5">
                <span className="text-[10px] font-semibold uppercase tracking-wide text-gray-500 dark:text-gray-400 whitespace-nowrap">
                  Remaining
                </span>
                <div
                  className={`purchase-readonly-field h-7 min-w-[84px] flex items-center justify-end px-2 rounded-md text-xs font-bold font-mono ${
                    remainingAmount > 0.009
                      ? "!text-amber-600 dark:!text-amber-400"
                      : "!text-emerald-600 dark:!text-emerald-400"
                  }`}
                >
                  {remainingAmount.toFixed(2)}
                </div>
              </div>

              {inv.invoice_type === "credit" && to2(totalPaid - totalAmount) > 0.009 && (
                <div className="flex items-center gap-1.5">
                  <span className="text-[10px] font-semibold uppercase tracking-wide text-emerald-600 dark:text-emerald-400 whitespace-nowrap">
                    Ledger Credit
                  </span>
                  <div className="purchase-readonly-field h-7 min-w-[84px] flex items-center justify-end px-2 rounded-md text-xs font-bold font-mono !text-emerald-600 dark:!text-emerald-400">
                    +{to2(totalPaid - totalAmount).toFixed(2)}
                  </div>
                </div>
              )}
            </div>

            <div className="flex items-center gap-2 ml-auto no-print">
              <Guard when={can.update}>
                {inv.status !== "reversed" && (
                  <button
                    type="button"
                    onClick={() => navigate(`/purchase-invoices/${id}/edit`)}
                    className={`h-7 px-3 rounded-md text-xs font-semibold transition-all duration-200 ${btnSecondary.className}`}
                    style={btnSecondary.style}
                  >
                    <PencilSquareIcon className="w-3.5 h-3.5" aria-hidden="true" />
                    <span>Edit</span>
                  </button>
                )}
              </Guard>
              <Guard when={can.create}>
                <button
                  type="button"
                  onClick={() => navigate("/purchase-invoices/create")}
                  className={`h-7 px-3.5 rounded-md text-xs font-semibold transition-all duration-200 ${btnPrimary.className}`}
                  style={btnPrimary.style}
                >
                  <PlusIcon className="w-3.5 h-3.5" aria-hidden="true" />
                  <span>New Invoice</span>
                </button>
              </Guard>
            </div>
          </div>
        </div>
      </div>

      {/* ===== Delete Modal ===== */}
      {deleteModalOpen && (
        <div
          className="fixed inset-0 z-50 flex items-center justify-center bg-black/40"
          onClick={(e) => {
            if (e.target === e.currentTarget) closeDeleteModal();
          }}
        >
          <div
            className="purchase-show-delete w-full max-w-md p-5"
            role="dialog"
            aria-modal="true"
            aria-label="Delete purchase invoice"
          >
            {deleteStep === 1 && (
              <div>
                <h2 className="text-lg font-semibold mb-2 dark:text-gray-200">Delete purchase invoice?</h2>
                <div className="text-xs text-gray-600 dark:text-gray-400 mb-2 space-y-0.5">
                  <div>
                    <b className="dark:text-gray-300">Posted #:</b> {fmt(inv?.posted_number)}
                  </div>
                  <div>
                    <b className="dark:text-gray-300">Invoice No:</b> {fmt(inv?.invoice_number)}
                  </div>
                  <div>
                    <b className="dark:text-gray-300">Supplier:</b> {fmt(inv.supplier?.name ?? "N/A")}
                  </div>
                  <div>
                    <b className="dark:text-gray-300">Total:</b> {totalAmount.toLocaleString()}
                  </div>
                  <div>
                    <b className="dark:text-gray-300">Paid:</b> {totalPaid.toLocaleString()}
                  </div>
                  <div>
                    <b className="dark:text-gray-300">Remaining:</b> {remainingAmount.toLocaleString()}
                  </div>
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
