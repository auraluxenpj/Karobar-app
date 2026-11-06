// /src/pages/sales/Show.jsx
import { useEffect, useRef, useState, useMemo } from "react";
import { useParams, useNavigate } from "react-router-dom";
import axios from "axios";
import { MagnifyingGlassIcon, PrinterIcon, PencilSquareIcon, TrashIcon, PlusIcon, ArrowLeftIcon, ClockIcon, ArrowUturnLeftIcon, BanknotesIcon, ShareIcon } from "@heroicons/react/24/outline";
import toast from "react-hot-toast";
// permissions
import { usePermissions, Guard } from "@/api/usePermissions.js";
import PageSkeleton from "@/components/PageSkeleton.jsx";
import { useTheme } from "@/context/ThemeContext";
import { getThemeButtonClasses } from "@/utils/buttonStyles";
// Search modal
import SaleInvoiceSearch from "@/components/SaleInvoiceSearch.jsx";
import DocumentHistoryModal from "@/components/DocumentHistoryModal.jsx";
import VoidInvoiceModal from "@/components/VoidInvoiceModal.jsx";
import RecordPaymentModal from "@/components/RecordPaymentModal.jsx";
import InvoiceDraftsModal from "@/components/InvoiceDraftsModal.jsx";
import ShareDocumentModal from "@/components/ShareDocumentModal.jsx";
import { useSaleSystem } from "@/context/SaleSystemContext.jsx";
import { printUrlViaIframe } from "@/utils/printHelper.js";

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

export default function SaleInvoiceShow({ defaultSaleType = null }) {
  const { id } = useParams();
  const navigate = useNavigate();

  const [inv, setInv] = useState(null);
  const isWholesale = (inv?.sale_type || defaultSaleType) === "wholesale";
  const [loading, setLoading] = useState(true);
  const [deleting, setDeleting] = useState(false);
  const [printerType, setPrinterType] = useState("a4");
  const popupRef = useRef(null);

  // Search modal state
  const [searchOpen, setSearchOpen] = useState(false);

  // History, Void and Payment modal states
  const [historyModalOpen, setHistoryModalOpen] = useState(false);
  const [voidModalOpen, setVoidModalOpen] = useState(false);
  const [paymentModalOpen, setPaymentModalOpen] = useState(false);
  const [shareModalOpen, setShareModalOpen] = useState(false);
  const [challanModalOpen, setChallanModalOpen] = useState(false);
  const [isReversing, setIsReversing] = useState(false);

  // Held Invoices & Drafts state
  const [isDraftsOpen, setIsDraftsOpen] = useState(false);
  const [draftsList, setDraftsList] = useState([]);

  const fetchDrafts = async () => {
    try {
      const res = await axios.get("/api/invoice-drafts", { params: { status: "draft" } });
      const saleDrafts = (res.data || []).filter((d) => ["sale_retail", "sale_wholesale"].includes(d.type));
      setDraftsList(saleDrafts);
    } catch {}
  };

  useEffect(() => {
    fetchDrafts();
  }, []);

  const invoiceDue = useMemo(() => {
    const tot = Number(inv?.total || 0);
    const rec = Number(inv?.total_receive ?? inv?.total_recieve ?? 0);
    return Math.max(tot - rec, 0);
  }, [inv]);

  const handleConfirmVoid = async (reason) => {
    try {
      setIsReversing(true);
      await axios.post(`/api/sale-invoices/${id}/reverse`, { reason });
      toast.success(`Invoice ${inv?.posted_number || ""} reversed successfully`);
      if (typeof window !== "undefined") {
        window.dispatchEvent(new CustomEvent("cash-drawer-changed"));
      }
      setVoidModalOpen(false);
      const { data } = await axios.get(`/api/sale-invoices/${id}`);
      setInv(data);
    } catch (err) {
      toast.error(err?.response?.data?.message || "Failed to reverse invoice");
    } finally {
      setIsReversing(false);
    }
  };

// Get theme colors
  const { theme, isDark } = useTheme();
  const { isPharmacy } = useSaleSystem();

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
        tertiaryLight: '#cffafe',
        success: '#10b981',
        successHover: '#059669',
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
      success: theme.success_color || '#10b981',
      successHover: '#059669',
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
  
  const successTextColor = useMemo(() => 
    getButtonTextColor(themeColors.success, themeColors.successHover), 
    [themeColors.success, themeColors.successHover]
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
  const btnSuccess = getButtonClasses.success;
  const btnGlass = getButtonClasses.glass;

  const chip =
    "px-1 py-0.5 border rounded-sm bg-gray-50 dark:bg-slate-700 text-[10px] leading-none text-gray-700 dark:text-gray-300";

  // permissions
  const { loading: permsLoading, canFor } = usePermissions?.() || {};
  const can = useMemo(
    () =>
      (typeof canFor === "function"
        ? canFor("sale-invoice")
        : { view: false, create: false, update: false, delete: false, import: false, export: false }),
    [canFor]
  );

  // ===== Delete modal state =====
  const [deleteModalOpen, setDeleteModalOpen] = useState(false);
  const [deleteStep, setDeleteStep] = useState(1);
  const [deleteMode, setDeleteMode] = useState("none"); // 'credit' | 'refund' | 'none'
  const [password, setPassword] = useState("");

  // New: items scroller ref (to mimic form table scroll)
  const itemsScrollRef = useRef(null);

  // Fetch invoice + settings
  useEffect(() => {
    (async () => {
      try {
        const [invRes, setRes] = await Promise.all([
          axios.get(`/api/sale-invoices/${id}`),
          axios.get("/api/settings").catch(() => null),
        ]);
        setInv(invRes.data);
        if (setRes?.data?.printer_type) {
          setPrinterType(String(setRes.data.printer_type).toLowerCase());
        }
      } catch {
        toast.error("Failed to load invoice");
      } finally {
        setLoading(false);
      }
    })();
  }, [id]);

  // Derived numbers for summary
  const invTotal = useMemo(
    () => Number(inv?.total ?? inv?.grand_total ?? inv?.gross_amount ?? 0),
    [inv]
  );
  const invReceived = useMemo(
    () => Number(inv?.total_receive ?? inv?.total_recieve ?? inv?.received ?? 0),
    [inv]
  );
  const invRemaining = useMemo(
    () => Math.max(invTotal - invReceived, 0),
    [invTotal, invReceived]
  );
  // Show choice dialog for all credit invoices
  const isCreditInvoice = inv?.invoice_type === 'credit';
  const needsChoice = !!isCreditInvoice;

  // After delete, go to previous or index
  const goToPrevOrIndex = async (deletedId) => {
    const indexPath = isWholesale ? "/wholesale-invoices" : "/sale-invoices";
    try {
      const res = await axios.get("/api/sale-invoices", {
        params: isWholesale ? { sale_type: "wholesale" } : undefined,
      });
      const list = Array.isArray(res.data) ? res.data : [];
      const prev = list
        .filter((x) => Number(x?.id) < Number(deletedId))
        .sort((a, b) => Number(b?.id) - Number(a?.id))[0];

      if (prev?.id) {
        const prevType = prev?.sale_type || (isWholesale ? "wholesale" : "retail");
        navigate(prevType === "wholesale" ? `/wholesale-invoices/${prev.id}` : `/sale-invoices/${prev.id}`);
      } else {
        navigate(indexPath);
      }
    } catch {
      navigate(indexPath);
    }
  };

  // ===== Delete flow =====
  const openDeleteModal = () => {
    if (!can.delete) return toast.error("You don't have permission to delete sale invoices.");
    setDeleteMode("none");
    setPassword("");
    setDeleteStep(1);
    setDeleteModalOpen(true);
  };
  const closeDeleteModal = () => {
    if (deleting) return;
    setDeleteModalOpen(false);
    setDeleteStep(1);
    setDeleteMode("none");
    setPassword("");
  };
  const proceedAfterConfirm = () => {
    if (needsChoice) {
      setDeleteMode("credit");
      setDeleteStep(2);
    } else {
      setDeleteStep(3);
    }
  };
  const proceedToPassword = () => setDeleteStep(3);

  const confirmAndDelete = async () => {
    if (!id) return;
    if (!can.delete) return toast.error("You don't have permission to delete sale invoices.");
    try {
      setDeleting(true);
      await axios.post("/api/auth/confirm-password", { password });
      await axios.delete(`/api/sale-invoices/${id}`, { params: { mode: deleteMode } });
      toast.success("Sale invoice deleted");
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

  // Print popup logic
  const handlePrint = async () => {
    if (!id) return;

    const width = 900;
    const height = 700;
    const left = Math.max(
      0,
      (window.screenX || window.screenLeft || 0) + (window.outerWidth - width) / 2
    );
    const top = Math.max(
      0,
      (window.screenY || window.screenTop || 0) + (window.outerHeight - height) / 2
    );

    const features = [
      `width=${Math.round(width)}`,
      `height=${Math.round(height)}`,
      `left=${Math.round(left)}`,
      `top=${Math.round(top)}`,
      "menubar=no",
      "toolbar=no",
      "location=no",
      "status=no",
      "scrollbars=yes",
      "resizable=yes",
    ].join(",");

    let w = popupRef.current;

    if (!w || w.closed) {
      w = window.open("about:blank", "salePrintWin", features);
      if (w) {
        popupRef.current = w;
      }
    } else {
      try { w.focus(); } catch {}
    }

    try {
      const { data } = await axios.get(`/api/sale-invoices/${id}/print-url`);
      const url = data.url;

      if (!w) {
        await printUrlViaIframe(url);
        return;
      }

      try {
        w.location.replace(url);
      } catch {
        const w2 = window.open(url, "salePrintWin", features);
        if (!w2) {
          await printUrlViaIframe(url);
          return;
        }
        popupRef.current = w2;
        w = w2;
      }

      try {
        w.onload = () => {
          try { w.focus(); w.print(); } catch {}
        };
      } catch {}

      const timer = setInterval(() => {
        try {
          if (w.location?.href !== "about:blank" && w.document?.readyState === "complete") {
            w.focus(); w.print(); clearInterval(timer);
          }
        } catch {}
        if (w.closed) clearInterval(timer);
      }, 400);
    } catch (err) {
      try { if (w) w.close(); } catch {}
      toast.error(err?.response?.data?.message || "Failed to generate print link.");
    }
  };

  // Keyboard shortcuts (mimic form topbar)
  useEffect(() => {
    const onKey = (e) => {
      if (!(e.ctrlKey || e.metaKey) || e.shiftKey || e.altKey) return;
      const k = (e.key || "").toLowerCase();
      if (k === "b" || e.code === "KeyB") { e.preventDefault(); navigate(-1); }
      if (k === "p" || e.code === "KeyP") { e.preventDefault(); handlePrint(); }
      if (k === "e" || e.code === "KeyE") {
        if (!can.update) return;
        e.preventDefault();
        navigate(`/sale-invoices/${id}/edit`);
      }
      if (k === "d" || e.code === "KeyD") {
        if (!can.delete) return;
        e.preventDefault();
        openDeleteModal();
      }
      if (k === "n" || e.code === "KeyN") {
        if (!can.create) return;
        e.preventDefault();
        if (isWholesale) {
          navigate("/sale-invoices/create/wholesale");
        } else {
          navigate("/sale-invoices/create/retail");
        }
      }
      if (k === "f" || e.code === "KeyF") {
        e.preventDefault();
        setSearchOpen(true);
      }
      if (k === "h" || e.code === "KeyH") {
        e.preventDefault();
        setIsDraftsOpen((prev) => !prev);
      }
    };
    document.addEventListener("keydown", onKey);
    return () => document.removeEventListener("keydown", onKey);
  }, [navigate, id, can, inv, isWholesale]);

  const wholesaleTotals = useMemo(() => {
    if (!isWholesale || !inv) return null;
    let totalPacks = 0;
    let billedUnits = 0;
    let bonusPacks = 0;
    let bonusUnits = 0;
    let totalCost = 0;
    let totalSubTotal = 0;

    for (const it of inv?.items || []) {
      const ps = Math.max(1, Number(it.pack_size || 1));
      const qty = Number(it.quantity || 0);
      const pQty =
        it.pack_quantity !== undefined && it.pack_quantity !== null && Number(it.pack_quantity) > 0
          ? Number(it.pack_quantity)
          : Number((qty / ps).toFixed(2));
      const bQty = Number(it.bonus || 0);
      const pBonus =
        it.pack_bonus !== undefined && it.pack_bonus !== null && Number(it.pack_bonus) > 0
          ? Number(it.pack_bonus)
          : Number((bQty / ps).toFixed(2));
      const avgCost = Number(
        it.cost_price_snapshot || it.product?.avg_price || it.product?.unit_purchase_price || 0
      );

      totalPacks += pQty;
      billedUnits += qty;
      bonusPacks += pBonus;
      bonusUnits += bQty;
      totalCost += (qty + bQty) * avgCost;
      totalSubTotal += Number(it.sub_total || 0);
    }

    const totalUnitsOut = billedUnits + bonusUnits;
    const invoiceMarginPct =
      totalCost > 0 ? Number((((totalSubTotal - totalCost) / totalCost) * 100).toFixed(2)) : 0;

    return {
      totalPacks: Number(totalPacks.toFixed(2)),
      billedUnits,
      bonusPacks: Number(bonusPacks.toFixed(2)),
      bonusUnits,
      totalUnitsOut,
      totalCost: Number(totalCost.toFixed(2)),
      invoiceMarginPct,
    };
  }, [inv, isWholesale]);

  if (loading || permsLoading) return <PageSkeleton />;
  if (!inv) return <div className="p-4 text-sm dark:text-gray-400">Invoice not found.</div>;

  const fmt = (v) => ((v ?? "") === "" ? "" : String(v));

  const formatAvailBadge = (units, packSize) => {
    if (units === "" || units === null || units === undefined) return "—";
    const u = Number(units || 0);
    const ps = Math.max(1, Number(packSize || 1));
    if (ps > 1) {
      const p = Math.floor(u / ps);
      const rem = u % ps;
      return rem > 0 ? `${p}P+${rem}U (${u})` : `${p}P (${u})`;
    }
    return String(u);
  };

  const hasClinicalCols = Boolean(isPharmacy || inv?.doctor_name || inv?.patient_name);
  const headerColCount = hasClinicalCols ? 6 : 4;

  return (
    <div
      className={`sale-entry h-[calc(100vh-130px)] flex flex-col ${
        isDark ? "bg-slate-900" : "bg-white"
      }`}
    >
      <style>{`
        @media print {
          .no-print { display: none !important; }
          .print-table th, .print-table td { border: 1px solid #000; }
        }
      `}</style>

      {/* === Header (branded banner, matches Sale Invoice form) === */}
      <div className={`sale-entry-header shrink-0 sticky top-0 z-20 border-b ${isDark ? "border-slate-700" : "border-gray-200"}`}>
        {/* Branded Banner */}
        <div className="sale-entry-banner px-4 py-2.5 flex items-center justify-between gap-3 flex-wrap">
          <div className="flex items-center gap-3">
            <div
              className="w-9 h-9 rounded-xl flex items-center justify-center shadow-inner"
              style={{ backgroundColor: "rgba(255,255,255,0.18)", backdropFilter: "blur(4px)" }}
            >
              {isWholesale ? (
                <svg
                  width="20"
                  height="20"
                  viewBox="0 0 24 24"
                  fill="none"
                  stroke="#ffffff"
                  strokeWidth="1.8"
                  strokeLinecap="round"
                  strokeLinejoin="round"
                >
                  <path d="M21 16V8a2 2 0 0 0-1-1.73l-7-4a2 2 0 0 0-2 0l-7 4A2 2 0 0 0 3 8v8a2 2 0 0 0 1 1.73l7 4a2 2 0 0 0 2 0l7-4A2 2 0 0 0 21 16z" />
                  <polyline points="3.27 6.96 12 12.01 20.73 6.96" />
                  <line x1="12" y1="22.08" x2="12" y2="12" />
                </svg>
              ) : (
                <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="#ffffff" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round">
                  <path d="M4 2v20l2-1 2 1 2-1 2 1 2-1 2 1 2-1 2 1V2l-2 1-2-1-2 1-2-1-2 1-2-1-2 1z" />
                  <line x1="8" y1="7" x2="16" y2="7" />
                  <line x1="8" y1="11" x2="16" y2="11" />
                  <line x1="8" y1="15" x2="13" y2="15" />
                </svg>
              )}
            </div>
            <div>
              <div className="flex items-center gap-2">
                <h2 className="text-lg font-extrabold tracking-wide text-white leading-none">
                  {isWholesale ? "Wholesale Invoice" : "Sale Invoice"}
                </h2>
                <span
                  className="px-2 py-0.5 rounded-md text-[9px] font-bold tracking-widest text-white"
                  style={{ backgroundColor: "rgba(255,255,255,0.22)", backdropFilter: "blur(4px)" }}
                >
                  {isWholesale ? "B2B PACK & UNIT" : (inv?.sale_type || "retail").toUpperCase()}
                </span>
                <span
                  className="px-2 py-0.5 rounded-md text-[9px] font-bold tracking-widest text-white"
                  style={{ backgroundColor: "rgba(255,255,255,0.22)", backdropFilter: "blur(4px)" }}
                >
                  #{fmt(inv.posted_number)}
                </span>
                {inv?.status === "reversed" && (
                  <span className="px-2 py-0.5 rounded-md text-[9px] font-extrabold tracking-widest text-white bg-rose-600 uppercase shadow-xs border border-rose-400">
                    REVERSED
                  </span>
                )}
              </div>
              <p className="text-[10px] text-white/80 mt-0.5">
                Ctrl+F search · Ctrl+E edit · Ctrl+P print · Ctrl+N new · Ctrl+B back
              </p>
            </div>
          </div>

          <div className="flex flex-wrap items-center gap-1.5 no-print">
            {/* Invoice Type Segmented Control (read-only) */}
            <div
              className="flex items-center rounded-lg p-0.5 shadow-inner"
              style={{ backgroundColor: "rgba(0,0,0,0.18)" }}
            >
              {["debit", "credit"].map((type) => {
                const active = inv?.invoice_type === type;
                return (
                  <span
                    key={type}
                    className={`px-3.5 py-1.5 text-[11px] font-semibold rounded-md ${
                      active ? "text-white shadow-sm" : "text-white/70"
                    }`}
                    style={{
                      backgroundColor: active ? "rgba(255,255,255,0.22)" : "transparent",
                      backdropFilter: active ? "blur(4px)" : "none",
                    }}
                  >
                    {type === "debit" ? (isWholesale ? "Debit (Cash)" : "Debit") : (isWholesale ? "Credit (Ledger)" : "Credit")}
                  </span>
                );
              })}
            </div>

            {/* Action buttons */}
            <button
              type="button"
              onClick={() => setSearchOpen(true)}
              className={`px-3 py-2 text-[11px] font-bold transition-all duration-200 ${btnSecondary.className}`}
              style={btnSecondary.style}
            >
              <MagnifyingGlassIcon className="w-4 h-4" aria-hidden="true" />
              <span>Search</span>
            </button>
            <button
              type="button"
              onClick={handlePrint}
              className={`px-3 py-2 text-[11px] font-bold transition-all duration-200 ${btnSuccess.className}`}
              style={btnSuccess.style}
            >
              <PrinterIcon className="w-4 h-4" aria-hidden="true" />
              <span>Print</span>
            </button>
            <button
              type="button"
              onClick={() => setShareModalOpen(true)}
              className={`px-3 py-2 text-[11px] font-bold transition-all duration-200 ${btnPrimary.className}`}
              style={btnPrimary.style}
              title="Share via WhatsApp, Email PDF, or Download PDF"
            >
              <ShareIcon className="w-4 h-4" aria-hidden="true" />
              <span>Share / PDF</span>
            </button>
            <button
              type="button"
              onClick={() => setChallanModalOpen(true)}
              className={`px-3 py-2 text-[11px] font-bold transition-all duration-200 ${btnSecondary.className}`}
              style={btnSecondary.style}
              title="Print / Share Delivery Challan (Gate Pass without prices)"
            >
              <PrinterIcon className="w-4 h-4" aria-hidden="true" />
              <span>Delivery Challan</span>
            </button>
            {invoiceDue > 0.01 && inv?.status !== "reversed" && (
              <button
                type="button"
                onClick={() => setPaymentModalOpen(true)}
                className="px-3 py-2 text-[11px] font-bold rounded-xl transition-all duration-200 bg-emerald-600 hover:bg-emerald-500 text-white shadow-sm flex items-center gap-1"
                title="Receive payment against this invoice"
              >
                <BanknotesIcon className="w-4 h-4" aria-hidden="true" />
                <span>Receive Payment</span>
              </button>
            )}
            <button
              type="button"
              onClick={() => setHistoryModalOpen(true)}
              className={`px-3 py-2 text-[11px] font-bold transition-all duration-200 ${btnSecondary.className}`}
              style={btnSecondary.style}
              title="View change history and reversal logs"
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
              className={`px-3 py-2 text-[11px] font-bold transition-all duration-200 ${btnSecondary.className} relative flex items-center gap-1.5`}
              style={btnSecondary.style}
              title="Open Held Invoices (Ctrl+H)"
            >
              <ClockIcon className="w-4 h-4 text-amber-400" aria-hidden="true" />
              <span>Held Invoices</span>
              {draftsList.length > 0 && (
                <span className="px-1.5 py-0.2 text-[10px] font-bold rounded-full bg-amber-500 text-white">
                  {draftsList.length}
                </span>
              )}
            </button>
            <Guard when={can.delete}>
              {inv?.status !== "reversed" && (
                <button
                  type="button"
                  onClick={() => setVoidModalOpen(true)}
                  className="px-3 py-2 text-[11px] font-bold rounded-xl transition-all duration-200 bg-amber-500 hover:bg-amber-600 text-white shadow-sm flex items-center gap-1"
                  title="Void / Reverse this invoice safely"
                >
                  <ArrowUturnLeftIcon className="w-4 h-4" aria-hidden="true" />
                  <span>Void</span>
                </button>
              )}
            </Guard>
            <Guard when={can.update}>
              {inv?.status !== "reversed" ? (
                <button
                  type="button"
                  onClick={() => navigate(`/sale-invoices/${id}/edit`)}
                  className={`px-3 py-2 text-[11px] font-bold transition-all duration-200 ${btnSecondary.className}`}
                  style={btnSecondary.style}
                >
                  <PencilSquareIcon className="w-4 h-4" aria-hidden="true" />
                  <span>Edit</span>
                </button>
              ) : (
                <span
                  className="px-3 py-2 text-[11px] font-bold rounded-xl opacity-40 cursor-not-allowed bg-gray-200 dark:bg-slate-700 text-gray-500 flex items-center gap-1"
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
                className={`px-3 py-2 text-[11px] font-bold transition-all duration-200 ${btnDanger.className}`}
                style={btnDanger.style}
              >
                <TrashIcon className="w-4 h-4" aria-hidden="true" />
                <span>Delete</span>
              </button>
            </Guard>
            <Guard when={can.create}>
              <button
                type="button"
                onClick={() => {
                  if (isWholesale) navigate("/sale-invoices/create/wholesale");
                  else navigate("/sale-invoices/create/retail");
                }}
                className={`px-3 py-2 text-[11px] font-bold transition-all duration-200 ${btnPrimary.className}`}
                style={btnPrimary.style}
              >
                <PlusIcon className="w-4 h-4" aria-hidden="true" />
                <span>New</span>
              </button>
            </Guard>
            <button
              type="button"
              onClick={() => navigate(-1)}
              className={`px-3 py-2 text-[11px] font-bold transition-all duration-200 ${btnGlass.className}`}
              style={btnGlass.style}
            >
              <ArrowLeftIcon className="w-4 h-4" aria-hidden="true" />
              <span>Back</span>
            </button>
          </div>
        </div>

        {/* Retail Fields Card (only for non-wholesale) */}
        {!isWholesale && (
          <div className="sale-entry-details px-3 py-2">
            <div className={`overflow-x-auto rounded-lg border ${isDark ? "border-slate-700" : "border-gray-200"}`}>
              <table className="w-full text-[11px] border-collapse">
                <thead>
                  <tr className={`border-b text-[9.5px] font-semibold uppercase tracking-wide ${isDark ? "bg-slate-800/90 text-slate-400 border-slate-700" : "bg-gray-50 text-gray-500 border-gray-200"}`}>
                    <th className={`px-3 py-1 text-left border-r w-36 ${isDark ? "border-slate-700" : "border-gray-200"}`}>Posted #</th>
                    <th className={`px-3 py-1 text-left border-r w-36 ${isDark ? "border-slate-700" : "border-gray-200"}`}>Date</th>
                    <th className={`px-3 py-1 text-left border-r ${isDark ? "border-slate-700" : "border-gray-200"}`}>Customer</th>
                    {hasClinicalCols && (
                      <>
                        <th className={`px-3 py-1 text-left border-r w-44 ${isDark ? "border-slate-700" : "border-gray-200"}`}>Doctor</th>
                        <th className={`px-3 py-1 text-left border-r w-44 ${isDark ? "border-slate-700" : "border-gray-200"}`}>Patient</th>
                      </>
                    )}
                    <th className="px-3 py-1 text-center w-24">Items</th>
                  </tr>
                </thead>
                <tbody>
                  <tr className={`border-b ${isDark ? "bg-slate-800/60 text-slate-200 border-slate-700" : "bg-white text-gray-800 border-gray-200"}`}>
                    <td className={`px-3 py-1.5 font-mono font-semibold border-r ${isDark ? "border-slate-700" : "border-gray-200"}`}>
                      {fmt(inv.posted_number) || "—"}
                    </td>
                    <td className={`px-3 py-1.5 font-mono border-r ${isDark ? "border-slate-700" : "border-gray-200"}`}>
                      {fmt(inv.date) || "—"}
                    </td>
                    <td className={`px-3 py-1.5 font-medium border-r ${isDark ? "border-slate-700 text-blue-300" : "border-gray-200 text-blue-700"}`}>
                      <span className="inline-flex flex-wrap items-center gap-1.5">
                        <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" className="shrink-0">
                          <path d="M20 21v-2a4 4 0 0 0-4-4H8a4 4 0 0 0-4 4v2" />
                          <circle cx="12" cy="7" r="4" />
                        </svg>
                        <span>{inv.customer?.name ?? inv.customer_id ?? "Walk-in Customer"}</span>
                      </span>
                    </td>
                    {hasClinicalCols && (
                      <>
                        <td className={`px-3 py-1.5 border-r ${isDark ? "border-slate-700" : "border-gray-200"}`}>
                          {fmt(inv.doctor_name) || "—"}
                        </td>
                        <td className={`px-3 py-1.5 border-r ${isDark ? "border-slate-700" : "border-gray-200"}`}>
                          {fmt(inv.patient_name) || "—"}
                        </td>
                      </>
                    )}
                    <td className="px-3 py-1.5 text-center font-mono font-bold">
                      {(inv.items || []).length}
                    </td>
                  </tr>
                  <tr className={`border-b text-[9.5px] font-semibold uppercase tracking-wide ${isDark ? "bg-slate-800/90 text-slate-400 border-slate-700" : "bg-gray-50 text-gray-500 border-gray-200"}`}>
                    <th colSpan={headerColCount} className="px-3 py-1 text-left">Remarks</th>
                  </tr>
                  <tr className={isDark ? "bg-slate-800/60 text-slate-200" : "bg-white text-gray-800"}>
                    <td colSpan={headerColCount} className="px-3 py-1.5">
                      {fmt(inv.remarks) || "—"}
                    </td>
                  </tr>
                </tbody>
              </table>
            </div>
          </div>
        )}
      </div>

      {isWholesale ? (
        /* === WHOLESALE WORKSPACE (Wholesale layout: Full-width Top Details + Full-width Items + Bottom Summary Footer, using Retail Show table style) === */
        <div
          className={`sale-entry-workspace flex-1 min-h-0 flex flex-col gap-2 p-2 overflow-visible lg:overflow-hidden ${
            isDark ? "bg-slate-900" : "bg-white"
          }`}
        >
          {/* FULL-WIDTH TOP + ITEMS SECTION */}
          <div className="flex flex-col min-h-0 flex-1 gap-2 overflow-hidden">
            {/* Top Banner Details Card (Table style like Retail Show) */}
            <div className="sale-entry-details shrink-0">
              <div
                className={`overflow-x-auto rounded-lg border ${
                  isDark ? "border-slate-700" : "border-gray-200"
                }`}
              >
                <table className="w-full text-[11px] border-collapse">
                  <thead>
                    <tr
                      className={`border-b text-[9.5px] font-semibold uppercase tracking-wide ${
                        isDark
                          ? "bg-slate-800/90 text-slate-400 border-slate-700"
                          : "bg-gray-50 text-gray-500 border-gray-200"
                      }`}
                    >
                      <th
                        className={`px-3 py-1 text-left border-r w-36 ${
                          isDark ? "border-slate-700" : "border-gray-200"
                        }`}
                      >
                        Posted #
                      </th>
                      <th
                        className={`px-3 py-1 text-left border-r w-36 ${
                          isDark ? "border-slate-700" : "border-gray-200"
                        }`}
                      >
                        Date
                      </th>
                      <th
                        className={`px-3 py-1 text-left border-r ${
                          isDark ? "border-slate-700" : "border-gray-200"
                        }`}
                      >
                        Wholesale Customer
                      </th>
                      {hasClinicalCols && (
                        <>
                          <th
                            className={`px-3 py-1 text-left border-r w-44 ${
                              isDark ? "border-slate-700" : "border-gray-200"
                            }`}
                          >
                            Doctor
                          </th>
                          <th
                            className={`px-3 py-1 text-left border-r w-44 ${
                              isDark ? "border-slate-700" : "border-gray-200"
                            }`}
                          >
                            Patient
                          </th>
                        </>
                      )}
                      <th className="px-3 py-1 text-center w-64">Order Breakdown</th>
                    </tr>
                  </thead>
                  <tbody>
                    <tr
                      className={`border-b ${
                        isDark
                          ? "bg-slate-800/60 text-slate-200 border-slate-700"
                          : "bg-white text-gray-800 border-gray-200"
                      }`}
                    >
                      <td
                        className={`px-3 py-1.5 font-mono font-semibold border-r ${
                          isDark ? "border-slate-700" : "border-gray-200"
                        }`}
                      >
                        {fmt(inv.posted_number) || "—"}
                      </td>
                      <td
                        className={`px-3 py-1.5 font-mono border-r ${
                          isDark ? "border-slate-700" : "border-gray-200"
                        }`}
                      >
                        {fmt(inv.date) || "—"}
                      </td>
                      <td
                        className={`px-3 py-1.5 font-medium border-r ${
                          isDark
                            ? "border-slate-700 text-blue-300"
                            : "border-gray-200 text-blue-700"
                        }`}
                      >
                        <div className="flex flex-wrap items-center justify-between gap-2">
                          <span className="inline-flex flex-wrap items-center gap-1.5">
                            <svg
                              width="13"
                              height="13"
                              viewBox="0 0 24 24"
                              fill="none"
                              stroke="currentColor"
                              strokeWidth="1.8"
                              strokeLinecap="round"
                              strokeLinejoin="round"
                              className="shrink-0"
                            >
                              <path d="M20 21v-2a4 4 0 0 0-4-4H8a4 4 0 0 0-4 4v2" />
                              <circle cx="12" cy="7" r="4" />
                            </svg>
                            <span>
                              {inv.customer?.name ?? inv.customer_id ?? "Walk-in Customer"}
                            </span>
                          </span>
                          {(inv.customer?.phone || inv.customer?.address) && (
                            <span className="text-[10px] font-mono opacity-80">
                              {[inv.customer?.phone, inv.customer?.address]
                                .filter(Boolean)
                                .join(" · ")}
                            </span>
                          )}
                        </div>
                      </td>
                      {hasClinicalCols && (
                        <>
                          <td
                            className={`px-3 py-1.5 border-r ${
                              isDark ? "border-slate-700" : "border-gray-200"
                            }`}
                          >
                            {fmt(inv.doctor_name) || "—"}
                          </td>
                          <td
                            className={`px-3 py-1.5 border-r ${
                              isDark ? "border-slate-700" : "border-gray-200"
                            }`}
                          >
                            {fmt(inv.patient_name) || "—"}
                          </td>
                        </>
                      )}
                      <td className="px-3 py-1.5 text-center font-mono font-bold">
                        <span>
                          {(inv.items || []).length}{" "}
                          {(inv.items || []).length === 1 ? "line" : "lines"}
                        </span>
                        {wholesaleTotals && (
                          <span className="ml-2 text-blue-600 dark:text-blue-400">
                            · {wholesaleTotals.totalPacks}P ({wholesaleTotals.billedUnits}U)
                            {wholesaleTotals.bonusUnits > 0
                              ? ` +${wholesaleTotals.bonusPacks}PB (${wholesaleTotals.bonusUnits}B)`
                              : ""}
                          </span>
                        )}
                      </td>
                    </tr>
                    <tr
                      className={`border-b text-[9.5px] font-semibold uppercase tracking-wide ${
                        isDark
                          ? "bg-slate-800/90 text-slate-400 border-slate-700"
                          : "bg-gray-50 text-gray-500 border-gray-200"
                      }`}
                    >
                      <th colSpan={headerColCount} className="px-3 py-1 text-left">
                        Remarks / Delivery Note
                      </th>
                    </tr>
                    <tr
                      className={
                        isDark
                          ? "bg-slate-800/60 text-slate-200"
                          : "bg-white text-gray-800"
                      }
                    >
                      <td colSpan={headerColCount} className="px-3 py-1.5">
                        {fmt(inv.remarks) || "—"}
                      </td>
                    </tr>
                  </tbody>
                </table>
              </div>
            </div>

            {/* Items Table Card (Retail Show table style with Wholesale columns) */}
            <div className="flex flex-col min-h-0 flex-1">
              <div className="flex items-center justify-between mb-1 px-0.5">
                <div
                  className={`text-[11px] font-semibold ${
                    isDark ? "text-slate-300" : "text-gray-700"
                  }`}
                >
                  Wholesale Line Items (Packs + Loose Units + Bonus Scheme)
                </div>
                {wholesaleTotals && (
                  <div className="flex items-center gap-3 text-[10.5px] font-mono">
                    <span className="text-gray-500 dark:text-slate-400">
                      Total Stock Out:{" "}
                      <strong className={isDark ? "text-slate-200" : "text-gray-800"}>
                        {wholesaleTotals.totalUnitsOut} units
                      </strong>
                    </span>
                    <span className="text-gray-500 dark:text-slate-400">
                      Est. Cost:{" "}
                      <strong className={isDark ? "text-slate-200" : "text-gray-800"}>
                        {wholesaleTotals.totalCost.toFixed(2)}
                      </strong>
                    </span>
                  </div>
                )}
              </div>

              <div
                ref={itemsScrollRef}
                className={`sale-entry-items flex-1 overflow-auto border-2 rounded-sm relative ${
                  isDark ? "border-slate-700 bg-slate-800" : "border-gray-200 bg-white"
                }`}
              >
                <table className="invoice-repeater-table w-full min-w-[960px] text-[11px] lg:table-fixed border-collapse print-table">
                  <thead
                    className={`sticky top-0 z-20 ${
                      isDark
                        ? "bg-slate-800/90 backdrop-blur-xs border-slate-700"
                        : "bg-white/80 backdrop-blur-xs border-gray-200/70"
                    } border-b`}
                  >
                    <tr className="[&>th]:py-1.5 [&>th]:px-1.5 [&>th]:text-left">
                      <th
                        className={`w-7 text-center border-r ${
                          isDark
                            ? "text-slate-400 border-slate-700"
                            : "text-gray-500 border-gray-200"
                        }`}
                      >
                        #
                      </th>
                      <th
                        className={`w-[24%] min-w-[200px] border-r ${
                          isDark
                            ? "text-slate-300 border-slate-700"
                            : "text-gray-700 border-gray-200"
                        }`}
                      >
                        Product
                      </th>
                      <th
                        className={`w-11 text-center border-r ${
                          isDark
                            ? "text-slate-400 border-slate-700"
                            : "text-gray-600 border-gray-200"
                        }`}
                        title="Pack Size"
                      >
                        PSize
                      </th>
                      <th
                        className={`w-18 border-r ${
                          isDark
                            ? "text-slate-300 border-slate-700"
                            : "text-gray-700 border-gray-200"
                        }`}
                      >
                        Batch
                      </th>
                      <th
                        className={`w-[74px] text-center border-r ${
                          isDark
                            ? "text-slate-400 border-slate-700"
                            : "text-gray-600 border-gray-200"
                        }`}
                        title="Expiry Date"
                      >
                        Expiry
                      </th>
                      <th
                        className={`w-18 text-center border-r ${
                          isDark
                            ? "text-slate-400 border-slate-700"
                            : "text-gray-600 border-gray-200"
                        }`}
                        title="Available Stock (Packs / Units)"
                      >
                        Avail (P/U)
                      </th>
                      <th
                        className={`w-13 text-right border-r ${
                          isDark
                            ? "text-slate-300 border-slate-700"
                            : "text-gray-700 border-gray-200"
                        }`}
                        title="Number of Packs"
                      >
                        Pack.Q
                      </th>
                      <th
                        className={`w-13 text-right border-r ${
                          isDark
                            ? "text-slate-300 border-slate-700"
                            : "text-gray-700 border-gray-200"
                        }`}
                        title="Number of Units"
                      >
                        Unit.Q
                      </th>
                      <th
                        className={`w-12 text-right border-r ${
                          isDark
                            ? "text-slate-400 border-slate-700"
                            : "text-gray-600 border-gray-200"
                        }`}
                        title="Item Discount %"
                      >
                        Disc%
                      </th>
                      <th
                        className={`w-12 text-right border-r ${
                          isDark
                            ? "text-slate-400 border-slate-700"
                            : "text-gray-600 border-gray-200"
                        }`}
                        title="Bonus Packs"
                      >
                        Pack.B
                      </th>
                      <th
                        className={`w-12 text-right border-r ${
                          isDark
                            ? "text-slate-400 border-slate-700"
                            : "text-gray-600 border-gray-200"
                        }`}
                        title="Bonus Units"
                      >
                        Unit.B
                      </th>
                      <th
                        className={`w-14 text-right border-r ${
                          isDark
                            ? "text-slate-400 border-slate-700"
                            : "text-gray-600 border-gray-200"
                        }`}
                        title="Total Units Out"
                      >
                        Tot.U
                      </th>
                      <th
                        className={`w-17 text-right border-r ${
                          isDark
                            ? "text-slate-300 border-slate-700"
                            : "text-gray-700 border-gray-200"
                        }`}
                        title="Wholesale Pack Price"
                      >
                        Pack.P
                      </th>
                      <th
                        className={`w-17 text-right border-r ${
                          isDark
                            ? "text-slate-300 border-slate-700"
                            : "text-gray-700 border-gray-200"
                        }`}
                        title="Wholesale Unit Price"
                      >
                        Unit.P
                      </th>
                      <th
                        className={`w-15 text-right border-r no-print ${
                          isDark
                            ? "text-slate-400 border-slate-700"
                            : "text-gray-600 border-gray-200"
                        }`}
                        title="Margin % from Average Cost"
                      >
                        Margin%
                      </th>
                      <th
                        className={`w-20 text-right ${
                          isDark ? "text-slate-300" : "text-gray-700"
                        }`}
                        title="Row Sub Total"
                      >
                        Sub Total
                      </th>
                    </tr>
                  </thead>
                  <tbody
                    className={`[&>tr>td]:py-1.5 [&>tr>td]:px-2 ${
                      isDark
                        ? "[&>tr]:border-slate-700 [&>tr>td]:text-slate-200"
                        : "[&>tr]:border-gray-200 [&>tr>td]:text-gray-800"
                    }`}
                  >
                    {(inv.items || []).map((it, i) => {
                      const ps = Math.max(1, Number(it.pack_size || 1));
                      const totalUnits = Number(it.quantity || 0);
                      const packQty =
                        it.pack_quantity !== undefined &&
                        it.pack_quantity !== null &&
                        Number(it.pack_quantity) > 0
                          ? Number(it.pack_quantity)
                          : Number((totalUnits / ps).toFixed(2));
                      const unitQty = totalUnits;
                      const bonusQty = Number(it.bonus || 0);
                      const packBonus =
                        it.pack_bonus !== undefined &&
                        it.pack_bonus !== null &&
                        Number(it.pack_bonus) > 0
                          ? Number(it.pack_bonus)
                          : Number((bonusQty / ps).toFixed(2));
                      const unitBonus = bonusQty;
                      const unitPrice = Number(it.price || 0);
                      const packPrice =
                        it.pack_price !== undefined &&
                        it.pack_price !== null &&
                        Number(it.pack_price) > 0
                          ? Number(it.pack_price)
                          : Number((unitPrice * ps).toFixed(2));
                      const avgCost = Number(
                        it.cost_price_snapshot ||
                          it.product?.avg_price ||
                          it.product?.unit_purchase_price ||
                          0
                      );
                      const subTotal = Number(it.sub_total || 0);
                      const totalUnitsOut = totalUnits + bonusQty;
                      const totalRowCost = totalUnitsOut * avgCost;
                      const discPct = Number(it.item_discount_percentage || 0);
                      const effUnitPrice = unitPrice * (1 - discPct / 100);
                      const rowMarginPct =
                        avgCost > 0
                          ? totalRowCost > 0
                            ? ((subTotal - totalRowCost) / totalRowCost) * 100
                            : ((effUnitPrice - avgCost) / avgCost) * 100
                          : 0;
                      const isNeg = rowMarginPct < 0;

                      return (
                        <tr
                          key={i}
                          className={`invoice-repeater-row border-b ${
                            isDark
                              ? "border-slate-700 hover:bg-slate-700/40"
                              : "border-gray-200 hover:bg-gray-50"
                          }`}
                        >
                          <td
                            data-label="Item #"
                            className={`invoice-cell-index-only text-center font-mono border-r ${
                              isDark
                                ? "border-slate-700 text-slate-400"
                                : "border-gray-200 text-gray-500"
                            }`}
                          >
                            {i + 1}
                          </td>
                          <td
                            data-label="Product"
                            title={it.product?.name ?? String(it.product_id)}
                            className={`invoice-cell-product text-left font-medium lg:truncate border-r ${
                              isDark ? "border-slate-700" : "border-gray-200"
                            }`}
                          >
                            {it.product?.name ?? it.product_id}
                          </td>
                          <td
                            data-label="Pack Size"
                            className={`text-center font-mono border-r ${
                              isDark ? "border-slate-700" : "border-gray-200"
                            }`}
                          >
                            {fmt(it.pack_size) || "—"}
                          </td>
                          <td
                            data-label="Batch"
                            className={`text-left font-mono lg:truncate border-r ${
                              isDark ? "border-slate-700" : "border-gray-200"
                            }`}
                          >
                            {fmt(it.batch_number) || "—"}
                          </td>
                          <td
                            data-label="Expiry"
                            title={
                              it.expiry ? String(it.expiry).trim().slice(0, 10) : undefined
                            }
                            className={`text-center font-mono border-r ${
                              isDark ? "border-slate-700" : "border-gray-200"
                            }`}
                          >
                            {it.expiry
                              ? String(it.expiry)
                                  .trim()
                                  .slice(0, 10)
                                  .replace(/^(\d{4})-(\d{2})(?:-\d{2})?$/, "$2/$1")
                              : "—"}
                          </td>
                          <td
                            data-label="Avail (P/U)"
                            className={`text-center font-mono text-[10.5px] border-r ${
                              isDark ? "border-slate-700" : "border-gray-200"
                            }`}
                          >
                            {formatAvailBadge(it.current_quantity, it.pack_size)}
                          </td>
                          <td
                            data-label="Pack Qty"
                            className={`text-right font-mono font-bold border-r ${
                              isDark ? "border-slate-700" : "border-gray-200"
                            }`}
                          >
                            {packQty}
                          </td>
                          <td
                            data-label="Unit Qty"
                            className={`text-right font-mono font-bold border-r ${
                              isDark ? "border-slate-700" : "border-gray-200"
                            }`}
                          >
                            {unitQty}
                          </td>
                          <td
                            data-label="Disc %"
                            className={`text-right font-mono border-r ${
                              isDark ? "border-slate-700" : "border-gray-200"
                            }`}
                          >
                            {fmt(it.item_discount_percentage) || "0"}
                          </td>
                          <td
                            data-label="Pack Bonus"
                            className={`text-right font-mono font-semibold border-r ${
                              packBonus > 0
                                ? isDark
                                  ? "text-emerald-400 border-slate-700"
                                  : "text-emerald-600 border-gray-200"
                                : isDark
                                ? "border-slate-700"
                                : "border-gray-200"
                            }`}
                          >
                            {packBonus}
                          </td>
                          <td
                            data-label="Unit Bonus"
                            className={`text-right font-mono font-semibold border-r ${
                              unitBonus > 0
                                ? isDark
                                  ? "text-emerald-400 border-slate-700"
                                  : "text-emerald-600 border-gray-200"
                                : isDark
                                ? "border-slate-700"
                                : "border-gray-200"
                            }`}
                          >
                            {unitBonus}
                          </td>
                          <td
                            data-label="Total Units"
                            className={`text-right font-mono font-bold border-r ${
                              isDark ? "border-slate-700" : "border-gray-200"
                            }`}
                          >
                            {totalUnits}
                            {bonusQty > 0 ? `+${bonusQty}` : ""}
                          </td>
                          <td
                            data-label="Pack Price"
                            className={`text-right font-mono font-semibold border-r ${
                              isDark ? "border-slate-700" : "border-gray-200"
                            }`}
                          >
                            {packPrice.toFixed(2)}
                          </td>
                          <td
                            data-label="Unit Price"
                            className={`text-right font-mono border-r ${
                              isDark ? "border-slate-700" : "border-gray-200"
                            }`}
                          >
                            {unitPrice.toFixed(2)}
                          </td>
                          <td
                            data-label="Margin %"
                            title={`Avg Cost: ${avgCost.toFixed(2)}/unit`}
                            className={`text-right font-mono font-bold border-r no-print ${
                              isNeg
                                ? isDark
                                  ? "text-red-400 border-slate-700"
                                  : "text-red-600 border-gray-200"
                                : isDark
                                ? "text-emerald-400 border-slate-700"
                                : "text-emerald-600 border-gray-200"
                            }`}
                          >
                            {rowMarginPct.toFixed(2)}%
                          </td>
                          <td
                            data-label="Sub Total"
                            className="invoice-cell-subtotal text-right font-mono font-bold"
                          >
                            {fmt(it.sub_total) || "0.00"}
                          </td>
                        </tr>
                      );
                    })}
                  </tbody>
                </table>
              </div>
            </div>
          </div>

          {/* BOTTOM: Wholesale Summary Footer (Wholesale 12-col footer layout with Retail Show table style) */}
          <div id="wholesale-summary-footer" className="shrink-0 lg:sticky lg:bottom-0 z-10">
            <div
              className={`sale-entry-summary rounded-xl overflow-hidden border shadow-[0_-4px_16px_-6px_rgba(0,0,0,0.14)] ${
                isDark
                  ? "bg-slate-800 border-slate-700"
                  : "bg-white border-gray-200"
              }`}
            >
              <div className="px-3 py-2 text-xs">
                <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-12 gap-3 items-center">
                  {/* Col 1 (lg:4): Adjustments & Invoice Margin (Table style like Retail Show) */}
                  <div className="lg:col-span-4 flex flex-col gap-1.5">
                    <div className="flex items-center justify-between">
                      <span className="text-[10px] font-bold uppercase tracking-wider text-gray-500 dark:text-slate-400">
                        Wholesale Summary & Adjustments
                      </span>
                      <div className="flex items-center gap-2">
                        <span
                          className="text-xs font-extrabold uppercase tracking-wide"
                          style={{ color: "#dc2626" }}
                        >
                          Margin %:
                        </span>
                        <span
                          className="px-2 py-0.5 rounded-md text-sm font-black font-mono border border-red-500 bg-red-50 dark:bg-red-950/60"
                          style={{ color: isDark ? "#f87171" : "#dc2626" }}
                        >
                          {wholesaleTotals ? `${wholesaleTotals.invoiceMarginPct.toFixed(2)}%` : "—"}
                        </span>
                      </div>
                    </div>

                    <div
                      className={`overflow-hidden rounded-lg border ${
                        isDark ? "border-slate-700" : "border-gray-200"
                      }`}
                    >
                      <table className="w-full text-[11px] border-collapse">
                        <tbody>
                          <tr
                            className={`border-b ${
                              isDark ? "border-slate-700" : "border-gray-200"
                            }`}
                          >
                            <th
                              className={`px-2.5 py-1.5 text-left font-semibold border-r w-1/4 ${
                                isDark
                                  ? "bg-slate-800/90 text-slate-400 border-slate-700"
                                  : "bg-gray-50 text-gray-600 border-gray-200"
                              }`}
                            >
                              Disc %
                            </th>
                            <td
                              className={`px-2.5 py-1.5 text-right font-mono border-r w-1/4 ${
                                isDark
                                  ? "bg-slate-800/40 text-slate-200 border-slate-700"
                                  : "bg-white text-gray-800 border-gray-200"
                              }`}
                            >
                              {fmt(inv.discount_percentage) || "0"}%
                            </td>
                            <th
                              className={`px-2.5 py-1.5 text-left font-semibold border-r w-1/4 ${
                                isDark
                                  ? "bg-slate-800/90 text-slate-400 border-slate-700"
                                  : "bg-gray-50 text-gray-600 border-gray-200"
                              }`}
                            >
                              Disc Amt
                            </th>
                            <td
                              className={`px-2.5 py-1.5 text-right font-mono font-semibold w-1/4 ${
                                isDark
                                  ? "bg-slate-800/40 text-slate-200"
                                  : "bg-white text-gray-800"
                              }`}
                            >
                              {fmt(inv.discount_amount) || "0.00"}
                            </td>
                          </tr>
                          <tr>
                            <th
                              className={`px-2.5 py-1.5 text-left font-semibold border-r ${
                                isDark
                                  ? "bg-slate-800/90 text-slate-400 border-slate-700"
                                  : "bg-gray-50 text-gray-600 border-gray-200"
                              }`}
                            >
                              Tax %
                            </th>
                            <td
                              className={`px-2.5 py-1.5 text-right font-mono border-r ${
                                isDark
                                  ? "bg-slate-800/40 text-slate-200 border-slate-700"
                                  : "bg-white text-gray-800 border-gray-200"
                              }`}
                            >
                              {fmt(inv.tax_percentage) || "0"}%
                            </td>
                            <th
                              className={`px-2.5 py-1.5 text-left font-semibold border-r ${
                                isDark
                                  ? "bg-slate-800/90 text-slate-400 border-slate-700"
                                  : "bg-gray-50 text-gray-600 border-gray-200"
                              }`}
                            >
                              Tax Amt
                            </th>
                            <td
                              className={`px-2.5 py-1.5 text-right font-mono font-semibold ${
                                isDark
                                  ? "bg-slate-800/40 text-slate-200"
                                  : "bg-white text-gray-800"
                              }`}
                            >
                              {fmt(inv.tax_amount) || "0.00"}
                            </td>
                          </tr>
                        </tbody>
                      </table>
                    </div>
                  </div>

                  {/* Col 2 (lg:3): Totals Breakdown Banner */}
                  <div className="lg:col-span-3">
                    <div
                      className="px-4 py-2.5 rounded-xl"
                      style={{
                        background: `linear-gradient(135deg, ${themeColors.primary}1a, ${themeColors.primaryHover}26)`,
                      }}
                    >
                      <div className="flex items-center justify-between mb-1">
                        <span
                          className={`text-[10px] font-medium uppercase tracking-wide ${
                            isDark ? "text-slate-400" : "text-gray-500"
                          }`}
                        >
                          Gross Amount
                        </span>
                        <span
                          className={`text-[13px] font-bold font-mono ${
                            isDark ? "text-slate-200" : "text-gray-800"
                          }`}
                        >
                          {fmt(inv.gross_amount) ?? 0}
                        </span>
                      </div>
                      <div
                        className="flex items-center justify-between border-t border-dashed pt-1.5"
                        style={{ borderColor: `${themeColors.primary}33` }}
                      >
                        <span
                          className={`text-[13px] font-bold ${
                            isDark ? "text-slate-200" : "text-gray-800"
                          }`}
                        >
                          Net Total
                        </span>
                        <span
                          className={`text-xl font-extrabold font-mono ${
                            isDark ? "text-red-400" : "text-red-600"
                          }`}
                        >
                          {fmt(inv.total) ?? 0}
                        </span>
                      </div>
                    </div>
                  </div>

                  {/* Col 3 (lg:3): Payment & Printer Info (Table style like Retail Show) */}
                  <div className="lg:col-span-3">
                    <div
                      className={`overflow-hidden rounded-lg border ${
                        isDark ? "border-slate-700" : "border-gray-200"
                      }`}
                    >
                      <table className="w-full text-[11px] border-collapse">
                        <tbody>
                          <tr
                            className={`border-b ${
                              isDark ? "border-slate-700" : "border-gray-200"
                            }`}
                          >
                            <th
                              className={`px-2.5 py-1.5 text-left font-semibold border-r w-1/4 ${
                                isDark
                                  ? "bg-slate-800/90 text-slate-400 border-slate-700"
                                  : "bg-gray-50 text-gray-600 border-gray-200"
                              }`}
                            >
                              Method
                            </th>
                            <td
                              className={`px-2.5 py-1.5 text-right font-mono font-bold uppercase border-r w-1/4 ${
                                isDark
                                  ? "bg-slate-800/40 text-slate-200 border-slate-700"
                                  : "bg-white text-gray-800 border-gray-200"
                              }`}
                            >
                              {inv.payment_method || "CASH"}
                            </td>
                            <th
                              className={`px-2.5 py-1.5 text-left font-semibold border-r w-1/4 ${
                                isDark
                                  ? "bg-slate-800/90 text-slate-400 border-slate-700"
                                  : "bg-gray-50 text-gray-600 border-gray-200"
                              }`}
                            >
                              Printer
                            </th>
                            <td
                              className={`px-2.5 py-1.5 text-right font-mono font-bold uppercase w-1/4 ${
                                isDark
                                  ? "bg-slate-800/40 text-slate-300"
                                  : "bg-white text-gray-700"
                              }`}
                            >
                              {(printerType || "a4").toUpperCase()}
                            </td>
                          </tr>
                          <tr>
                            <th
                              className={`px-2.5 py-1.5 text-left font-semibold border-r ${
                                isDark
                                  ? "bg-slate-800/90 text-slate-400 border-slate-700"
                                  : "bg-gray-50 text-gray-600 border-gray-200"
                              }`}
                            >
                              Received
                            </th>
                            <td
                              className={`px-2.5 py-1.5 text-right font-mono font-semibold border-r ${
                                isDark
                                  ? "bg-slate-800/40 text-slate-200 border-slate-700"
                                  : "bg-white text-gray-800 border-gray-200"
                              }`}
                            >
                              {invReceived.toLocaleString()}
                            </td>
                            <th
                              className={`px-2.5 py-1.5 text-left font-semibold border-r ${
                                isDark
                                  ? "bg-slate-800/90 text-slate-400 border-slate-700"
                                  : "bg-gray-50 text-gray-600 border-gray-200"
                              }`}
                            >
                              Remaining
                            </th>
                            <td
                              className={`px-2.5 py-1.5 text-right font-mono font-extrabold ${
                                invRemaining > 0
                                  ? "text-amber-500"
                                  : isDark
                                  ? "text-emerald-400"
                                  : "text-emerald-600"
                              } ${isDark ? "bg-slate-800/40" : "bg-white"}`}
                            >
                              {invRemaining.toLocaleString()}
                            </td>
                          </tr>
                        </tbody>
                      </table>
                    </div>
                  </div>

                  {/* Col 4 (lg:2): Quick Action Buttons */}
                  <div className="lg:col-span-2 flex flex-col gap-1.5 no-print">
                    <div className="grid grid-cols-2 gap-1.5">
                      <button
                        type="button"
                        onClick={handlePrint}
                        className={`h-8 rounded-lg text-[11px] font-semibold transition-all duration-200 ${btnSuccess.className}`}
                        style={btnSuccess.style}
                        title="Ctrl+P"
                      >
                        <PrinterIcon className="w-4 h-4" aria-hidden="true" />
                        <span>Print</span>
                      </button>
                      <Guard when={can.update}>
                        <button
                          type="button"
                          onClick={() => navigate(`/sale-invoices/${id}/edit`)}
                          className={`h-8 rounded-lg text-[11px] font-semibold transition-all duration-200 ${btnSecondary.className}`}
                          style={btnSecondary.style}
                          title="Ctrl+E"
                        >
                          <PencilSquareIcon className="w-4 h-4" aria-hidden="true" />
                          <span>Edit</span>
                        </button>
                      </Guard>
                    </div>
                    <div className="flex gap-1.5">
                      <Guard when={can.create}>
                        <button
                          type="button"
                          onClick={() => navigate("/sale-invoices/create/wholesale")}
                          className={`flex-1 h-8 rounded-lg text-[11px] font-semibold transition-all duration-200 ${btnPrimary.className}`}
                          style={btnPrimary.style}
                        >
                          <PlusIcon className="w-4 h-4" aria-hidden="true" />
                          <span>New</span>
                        </button>
                      </Guard>
                      <Guard when={can.delete}>
                        <button
                          type="button"
                          onClick={openDeleteModal}
                          className={`flex-1 h-8 rounded-lg text-[11px] font-semibold transition-all duration-200 ${btnDanger.className}`}
                          style={btnDanger.style}
                        >
                          <TrashIcon className="w-4 h-4" aria-hidden="true" />
                          <span>Delete</span>
                        </button>
                      </Guard>
                      <button
                        type="button"
                        onClick={() => navigate(-1)}
                        className={`flex-1 h-8 rounded-lg text-[11px] font-semibold transition-all duration-200 ${btnGlass.className}`}
                        style={btnGlass.style}
                      >
                        <ArrowLeftIcon className="w-4 h-4" aria-hidden="true" />
                        <span>Back</span>
                      </button>
                    </div>
                  </div>
                </div>
              </div>
            </div>
          </div>
        </div>
      ) : (
        /* === RETAIL WORKSPACE: Items (fluid) + Summary (280px) === */
        <div className={`sale-entry-workspace flex-1 flex flex-col lg:grid lg:grid-cols-[1fr_280px] gap-2 px-2 py-2 overflow-visible lg:overflow-hidden ${isDark ? "bg-slate-900" : "bg-white"}`}>
          {/* LEFT: Items */}
          <div className="flex flex-col min-h-0">
            <div className={`text-[11px] font-semibold mb-1 ${isDark ? "text-slate-300" : "text-gray-700"}`}>Items</div>
            <div ref={itemsScrollRef} className={`sale-entry-items flex-1 overflow-auto border-2 rounded-sm relative ${isDark ? "border-slate-700 bg-slate-800" : "border-gray-200 bg-white"}`}>
              <table className="invoice-repeater-table w-full text-[11px] lg:table-fixed border-collapse print-table">
                <thead className={`sticky top-0 z-20 ${isDark ? "bg-slate-800/90 backdrop-blur-xs" : "bg-white/80 backdrop-blur-xs"} border-b ${isDark ? "border-slate-700" : "border-gray-200/70"}`}>
                  <tr className="[&>th]:py-1.5 [&>th]:px-1.5 [&>th]:text-left">
                    <th className={`w-7 text-center border-r ${isDark ? "text-slate-400 border-slate-700" : "text-gray-500 border-gray-200"}`}>#</th>
                    <th className={`w-[30%] min-w-[220px] border-r ${isDark ? "text-slate-300 border-slate-700" : "text-gray-700 border-gray-200"}`}>Product</th>
                    <th className={`w-11 text-center border-r ${isDark ? "text-slate-400 border-slate-700" : "text-gray-600 border-gray-200"}`}>PSize</th>
                    <th className={`w-18 border-r ${isDark ? "text-slate-300 border-slate-700" : "text-gray-700 border-gray-200"}`}>Batch</th>
                    <th className={`w-[74px] text-center border-r ${isDark ? "text-slate-400 border-slate-700" : "text-gray-600 border-gray-200"}`}>Expiry</th>
                    <th className={`w-14 text-right border-r ${isDark ? "text-slate-400 border-slate-700" : "text-gray-600 border-gray-200"}`}>Avail</th>
                    <th className={`w-14 text-right border-r ${isDark ? "text-slate-300 border-slate-700" : "text-gray-700 border-gray-200"}`}>Qty</th>
                    <th className={`w-18 text-right border-r ${isDark ? "text-slate-400 border-slate-700" : "text-gray-600 border-gray-200"}`}>Price</th>
                    <th className={`w-13 text-right border-r ${isDark ? "text-slate-400 border-slate-700" : "text-gray-600 border-gray-200"}`}>Disc%</th>
                    <th className={`w-20 text-right ${isDark ? "text-slate-300" : "text-gray-700"}`}>Sub Total</th>
                  </tr>
                </thead>
                <tbody className={`[&>tr>td]:py-1.5 [&>tr>td]:px-2 ${isDark ? "[&>tr]:border-slate-700 [&>tr>td]:text-slate-200" : "[&>tr]:border-gray-200 [&>tr>td]:text-gray-800"}`}>
                  {(inv.items || []).map((it, i) => (
                    <tr key={i} className={`invoice-repeater-row border-b ${isDark ? "border-slate-700 hover:bg-slate-700/40" : "border-gray-200 hover:bg-gray-50"}`}>
                      <td data-label="Item #" className={`invoice-cell-index-only text-center font-mono border-r ${isDark ? "border-slate-700 text-slate-400" : "border-gray-200 text-gray-500"}`}>{i + 1}</td>
                      <td data-label="Product" className={`invoice-cell-product text-left font-medium lg:truncate border-r ${isDark ? "border-slate-700" : "border-gray-200"}`}>{it.product?.name ?? it.product_id}</td>
                      <td data-label="Pack Size" className={`text-center font-mono border-r ${isDark ? "border-slate-700" : "border-gray-200"}`}>{fmt(it.pack_size) || "—"}</td>
                      <td data-label="Batch" className={`text-left font-mono lg:truncate border-r ${isDark ? "border-slate-700" : "border-gray-200"}`}>{fmt(it.batch_number) || "—"}</td>
                      <td data-label="Expiry" title={it.expiry ? String(it.expiry).trim().slice(0, 10) : undefined} className={`text-center font-mono border-r ${isDark ? "border-slate-700" : "border-gray-200"}`}>{it.expiry ? String(it.expiry).trim().slice(0, 10).replace(/^(\d{4})-(\d{2})(?:-\d{2})?$/, "$2/$1") : "—"}</td>
                      <td data-label="Available" className={`text-right font-mono border-r ${isDark ? "border-slate-700" : "border-gray-200"}`}>{fmt(it.current_quantity) || "0"}</td>
                      <td data-label="Qty" className={`text-right font-mono font-bold border-r ${isDark ? "border-slate-700" : "border-gray-200"}`}>{fmt(it.quantity) || "0"}</td>
                      <td data-label="Unit Price" className={`text-right font-mono border-r ${isDark ? "border-slate-700" : "border-gray-200"}`}>{fmt(it.price) || "0.00"}</td>
                      <td data-label="Disc %" className={`text-right font-mono border-r ${isDark ? "border-slate-700" : "border-gray-200"}`}>{fmt(it.item_discount_percentage) || "0"}</td>
                      <td data-label="Sub Total" className="invoice-cell-subtotal text-right font-mono font-bold">{fmt(it.sub_total) || "0.00"}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </div>

          {/* RIGHT: Summary panel (mirrors form layout, with table cells instead of inputs) */}
          <div className="min-h-0">
            <div className={`sale-entry-summary h-full flex flex-col rounded-2xl overflow-hidden ${isDark ? "bg-slate-800" : "bg-white"}`}>
              {/* Panel Header */}
              <div
                className="sale-entry-summary-heading px-4 py-3 flex items-center justify-between shrink-0"
                style={{ background: `linear-gradient(135deg, ${themeColors.primary}, ${themeColors.primaryHover})` }}
              >
                <span className="text-white font-bold text-sm tracking-wide">Invoice Summary</span>
                <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="#ffffff" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                  <line x1="18" y1="20" x2="18" y2="10" />
                  <line x1="12" y1="20" x2="12" y2="4" />
                  <line x1="6" y1="20" x2="6" y2="14" />
                </svg>
              </div>

              {/* Content (Table Style instead of Form Inputs) */}
              <div className="flex-1 flex flex-col min-h-0 px-3 py-3 text-[12px] overflow-y-auto">
                <div className={`overflow-hidden rounded-xl border ${isDark ? "border-slate-700" : "border-gray-200"}`}>
                  <table className="w-full text-[11.5px] border-collapse">
                    <tbody>
                      <tr className={`border-b ${isDark ? "border-slate-700" : "border-gray-200"}`}>
                        <th className={`px-3 py-2 text-left font-semibold border-r w-1/2 ${isDark ? "bg-slate-800/90 text-slate-400 border-slate-700" : "bg-gray-50 text-gray-600 border-gray-200"}`}>
                          Tax %
                        </th>
                        <td className={`px-3 py-2 text-right font-mono ${isDark ? "bg-slate-800/40 text-slate-200" : "bg-white text-gray-800"}`}>
                          {fmt(inv.tax_percentage) || "0"}%
                        </td>
                      </tr>
                      <tr className={`border-b ${isDark ? "border-slate-700" : "border-gray-200"}`}>
                        <th className={`px-3 py-2 text-left font-semibold border-r ${isDark ? "bg-slate-800/90 text-slate-400 border-slate-700" : "bg-gray-50 text-gray-600 border-gray-200"}`}>
                          Tax Amt
                        </th>
                        <td className={`px-3 py-2 text-right font-mono font-semibold ${isDark ? "bg-slate-800/40 text-slate-200" : "bg-white text-gray-800"}`}>
                          {fmt(inv.tax_amount) || "0.00"}
                        </td>
                      </tr>
                      <tr className={`border-b ${isDark ? "border-slate-700" : "border-gray-200"}`}>
                        <th className={`px-3 py-2 text-left font-semibold border-r ${isDark ? "bg-slate-800/90 text-slate-400 border-slate-700" : "bg-gray-50 text-gray-600 border-gray-200"}`}>
                          Disc %
                        </th>
                        <td className={`px-3 py-2 text-right font-mono ${isDark ? "bg-slate-800/40 text-slate-200" : "bg-white text-gray-800"}`}>
                          {fmt(inv.discount_percentage) || "0"}%
                        </td>
                      </tr>
                      <tr>
                        <th className={`px-3 py-2 text-left font-semibold border-r ${isDark ? "bg-slate-800/90 text-slate-400 border-slate-700" : "bg-gray-50 text-gray-600 border-gray-200"}`}>
                          Disc Amt
                        </th>
                        <td className={`px-3 py-2 text-right font-mono font-semibold ${isDark ? "bg-slate-800/40 text-slate-200" : "bg-white text-gray-800"}`}>
                          {fmt(inv.discount_amount) || "0.00"}
                        </td>
                      </tr>
                    </tbody>
                  </table>
                </div>

                {/* Totals */}
                <div
                  className="mt-3 px-4 py-3 rounded-xl"
                  style={{ background: `linear-gradient(135deg, ${themeColors.primary}1a, ${themeColors.primaryHover}26)` }}
                >
                  <div className="flex items-center justify-between mb-1">
                    <span className={`text-[10px] font-medium uppercase tracking-wide ${isDark ? "text-slate-400" : "text-gray-500"}`}>Gross</span>
                    <span className={`text-[13px] font-bold font-mono ${isDark ? "text-slate-200" : "text-gray-800"}`}>{fmt(inv.gross_amount) ?? 0}</span>
                  </div>
                  <div className="flex items-center justify-between border-t border-dashed pt-2" style={{ borderColor: `${themeColors.primary}33` }}>
                    <span className={`text-[13px] font-bold ${isDark ? "text-slate-200" : "text-gray-800"}`}>Total</span>
                    <span className={`text-2xl font-extrabold font-mono ${isDark ? "text-red-400" : "text-red-600"}`}>{fmt(inv.total) ?? 0}</span>
                  </div>
                </div>

                {/* Payment & Printer Table */}
                <div className={`mt-3 overflow-hidden rounded-xl border ${isDark ? "border-slate-700" : "border-gray-200"}`}>
                  <table className="w-full text-[11.5px] border-collapse">
                    <tbody>
                      <tr className={`border-b ${isDark ? "border-slate-700" : "border-gray-200"}`}>
                        <th className={`px-3 py-2 text-left font-semibold border-r w-1/2 ${isDark ? "bg-slate-800/90 text-slate-400 border-slate-700" : "bg-gray-50 text-gray-600 border-gray-200"}`}>
                          Received
                        </th>
                        <td className={`px-3 py-2 text-right font-mono font-semibold ${isDark ? "bg-slate-800/40 text-slate-200" : "bg-white text-gray-800"}`}>
                          {invReceived.toLocaleString()}
                        </td>
                      </tr>
                      <tr className={`border-b ${isDark ? "border-slate-700" : "border-gray-200"}`}>
                        <th className={`px-3 py-2 text-left font-semibold border-r ${isDark ? "bg-slate-800/90 text-slate-400 border-slate-700" : "bg-gray-50 text-gray-600 border-gray-200"}`}>
                          Remaining
                        </th>
                        <td className={`px-3 py-2 text-right font-mono font-extrabold ${
                          invRemaining > 0 ? "text-amber-500" : (isDark ? "text-emerald-400" : "text-emerald-600")
                        } ${isDark ? "bg-slate-800/40" : "bg-white"}`}>
                          {invRemaining.toLocaleString()}
                        </td>
                      </tr>
                      <tr>
                        <th className={`px-3 py-1.5 text-left font-semibold border-r ${isDark ? "bg-slate-800/90 text-slate-400 border-slate-700" : "bg-gray-50 text-gray-600 border-gray-200"}`}>
                          Printer
                        </th>
                        <td className={`px-3 py-1.5 text-right font-mono font-bold uppercase ${isDark ? "bg-slate-800/40 text-slate-300" : "bg-white text-gray-700"}`}>
                          {(printerType || "a4").toUpperCase()}
                        </td>
                      </tr>
                    </tbody>
                  </table>
                </div>
              </div>

              {/* Actions (compact) */}
              <div className="px-3 py-2 shrink-0 border-t space-y-1.5" style={{ borderColor: isDark ? "rgba(71,85,105,0.5)" : "rgba(229,231,235,0.8)" }}>
                <div className="grid grid-cols-2 gap-1.5 no-print">
                  <button
                    type="button"
                    onClick={handlePrint}
                    className={`h-8 rounded-lg text-[11px] font-semibold transition-all duration-200 ${btnSuccess.className}`}
                    style={btnSuccess.style}
                    title="Ctrl+P"
                  >
                    <PrinterIcon className="w-4 h-4" aria-hidden="true" />
                    <span>Print</span>
                  </button>
                  <Guard when={can.update}>
                    <button
                      type="button"
                      onClick={() => navigate(`/sale-invoices/${id}/edit`)}
                      className={`h-8 rounded-lg text-[11px] font-semibold transition-all duration-200 ${btnSecondary.className}`}
                      style={btnSecondary.style}
                      title="Ctrl+E"
                    >
                      <PencilSquareIcon className="w-4 h-4" aria-hidden="true" />
                      <span>Edit</span>
                    </button>
                  </Guard>
                </div>
                <div className="flex gap-1.5 no-print">
                  <Guard when={can.create}>
                    <button
                      type="button"
                      onClick={() => navigate("/sale-invoices/create/retail")}
                      className={`flex-1 h-8 rounded-lg text-[11px] font-semibold transition-all duration-200 ${btnPrimary.className}`}
                      style={btnPrimary.style}
                    >
                      <PlusIcon className="w-4 h-4" aria-hidden="true" />
                      <span>New</span>
                    </button>
                  </Guard>
                  <Guard when={can.delete}>
                    <button
                      type="button"
                      onClick={openDeleteModal}
                      className={`flex-1 h-8 rounded-lg text-[11px] font-semibold transition-all duration-200 ${btnDanger.className}`}
                      style={btnDanger.style}
                    >
                      <TrashIcon className="w-4 h-4" aria-hidden="true" />
                      <span>Delete</span>
                    </button>
                  </Guard>
                  <button
                    type="button"
                    onClick={() => navigate(-1)}
                    className={`flex-1 h-8 rounded-lg text-[11px] font-semibold transition-all duration-200 ${btnGlass.className}`}
                    style={btnGlass.style}
                  >
                    <ArrowLeftIcon className="w-4 h-4" aria-hidden="true" />
                    <span>Back</span>
                  </button>
                </div>
              </div>
            </div>
          </div>
        </div>
      )}

      {/* ===== Delete confirmation / choice / password modal ===== */}
      {deleteModalOpen && (
        <div
          className="fixed inset-0 z-50 flex items-center justify-center bg-black/40"
          onClick={(e) => { if (e.target === e.currentTarget) closeDeleteModal(); }}
        >
          <div className="bg-white dark:bg-slate-800 rounded-xl shadow-xl w-full max-w-md p-5">
            {/* Step 1: Confirm delete */}
            {deleteStep === 1 && (
              <div>
                <h2 className="text-lg font-semibold mb-2 dark:text-gray-200">Delete sale invoice?</h2>
                <div className="text-xs text-gray-600 dark:text-gray-400 mb-2">
                  <div><b className="dark:text-gray-300">Posted #:</b> {inv?.posted_number}</div>
                  <div><b className="dark:text-gray-300">Total:</b> {invTotal.toLocaleString()}</div>
                  <div><b className="dark:text-gray-300">Received:</b> {invReceived.toLocaleString()}</div>
                  <div><b className="dark:text-gray-300">Remaining:</b> {invRemaining.toLocaleString()}</div>
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
                    onClick={proceedAfterConfirm}
                  >
                    Yes, continue
                  </button>
                </div>
              </div>
            )}

            {/* Step 2: Choose Store Credit or Refund */}
            {deleteStep === 2 && (
              <div>
                <h2 className="text-lg font-semibold mb-2 dark:text-gray-200">Store Credit or Refund?</h2>
                <p className="text-sm text-gray-600 dark:text-gray-400 mb-3">
                  Choose how to handle this invoice:
                </p>
                <div className="space-y-2 text-sm dark:text-gray-300">
                  <label className="flex items-start gap-2">
                    <input
                      type="radio"
                      className="mt-1"
                      checked={deleteMode === "credit"}
                      onChange={() => setDeleteMode("credit")}
                    />
                    <span>
                      <b>Store Credit (recommended)</b><br />
                      Create a negative entry in customer's ledger (credit them).
                    </span>
                  </label>
                  <label className="flex items-start gap-2">
                    <input
                      type="radio"
                      className="mt-1"
                      checked={deleteMode === "refund"}
                      onChange={() => setDeleteMode("refund")}
                    />
                    <span>
                      <b>Refund</b><br />
                      Delete all ledger entries (no credit recorded).
                    </span>
                  </label>
                </div>
                <div className="mt-4 flex justify-between">
                  <button
                    className={`px-3 py-1.5 text-xs font-semibold transition-all duration-200 ${btnGlass.className}`}
                    style={btnGlass.style}
                    onClick={() => setDeleteStep(1)}
                  >
                    <ArrowLeftIcon className="w-4 h-4" aria-hidden="true" />
                    <span>Back</span>
                  </button>
                  <button
                    className={`px-3 py-1.5 text-xs font-semibold transition-all duration-200 ${btnPrimary.className}`}
                    style={btnPrimary.style}
                    onClick={proceedToPassword}
                  >
                    Continue
                  </button>
                </div>
              </div>
            )}

            {/* Step 3: Password confirm */}
            {deleteStep === 3 && (
              <div>
                <h2 className="text-lg font-semibold mb-2 dark:text-gray-200">Confirm with password</h2>
                <p className="text-sm text-gray-600 dark:text-gray-400">
                  For security, please re-enter your password to delete this sale invoice.
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
                    onClick={() => setDeleteStep(needsChoice ? 2 : 1)}
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

      {/* ===== Search Invoice Modal ===== */}
      <SaleInvoiceSearch 
        isOpen={searchOpen} 
        onClose={() => setSearchOpen(false)} 
        onSelect={(invoice) => {
          if (invoice?.id) {
            const targetType = invoice?.sale_type || (isWholesale ? "wholesale" : "retail");
            navigate(
              targetType === "wholesale"
                ? `/wholesale-invoices/${invoice.id}`
                : `/sale-invoices/${invoice.id}`
            );
          }
        }}
      />

      {/* Audit History Modal */}
      <DocumentHistoryModal
        isOpen={historyModalOpen}
        onClose={() => setHistoryModalOpen(false)}
        entityType="sale_invoice"
        entityId={id}
        entityNumber={inv?.posted_number || `#${id}`}
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
        partyType="customer"
        partyId={inv?.customer_id}
        partyName={inv?.customer?.name || ""}
        preselectedInvoiceId={id}
        onPaymentSuccess={async () => {
          const { data } = await axios.get(`/api/sale-invoices/${id}`);
          setInv(data);
        }}
      />

      {/* Held Invoices & Drafts Modal */}
      <InvoiceDraftsModal
        isOpen={isDraftsOpen}
        onClose={() => setIsDraftsOpen(false)}
        drafts={draftsList}
        onResumeDraft={(draftId) => {
          if (typeof window !== "undefined") {
            window.__isResumingInvoiceDraft = true;
          }
          const draft = draftsList.find((d) => d.id === draftId);
          if (draft?.type === "sale_wholesale") {
            navigate(`/sale-invoices/create/wholesale?draft_id=${draftId}`);
          } else {
            navigate(`/sale-invoices/create/retail?draft_id=${draftId}`);
          }
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
        onStartBlank={() =>
          navigate(isWholesale ? "/sale-invoices/create/wholesale" : "/sale-invoices/create/retail")
        }
        type={isWholesale ? "sale_wholesale" : "sale_retail"}
      />

      {/* Outbound Document Share Modal (WhatsApp / Email PDF) */}
      <ShareDocumentModal
        isOpen={shareModalOpen}
        onClose={() => setShareModalOpen(false)}
        documentType="sale_invoice"
        documentId={id}
      />

      {/* Delivery Challan / Gate Pass Share & Print Modal */}
      <ShareDocumentModal
        isOpen={challanModalOpen}
        onClose={() => setChallanModalOpen(false)}
        documentType="delivery_challan"
        documentId={id}
      />
    </div>
  );
}

