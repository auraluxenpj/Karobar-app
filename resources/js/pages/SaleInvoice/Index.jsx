// src/pages/sale-invoices/index.jsx
import React, { useEffect, useMemo, useState, useRef, useCallback } from "react";
import { Link, useNavigate } from "react-router-dom";
import axios from "axios";
import toast from "react-hot-toast";
import {
  MagnifyingGlassIcon,
  PlusCircleIcon,
  PencilSquareIcon,
  EyeIcon,
  PrinterIcon,
  TrashIcon,
  ArrowPathIcon,
  DocumentTextIcon,
  UserIcon,
  CalendarIcon,
  CurrencyDollarIcon,
  ClockIcon,
  ArrowUturnLeftIcon,
  QrCodeIcon,
  ShareIcon,
  ChevronDoubleLeftIcon,
  ChevronLeftIcon,
  ChevronRightIcon,
  ChevronDoubleRightIcon,
} from "@heroicons/react/24/solid";
import InvoiceDraftsModal from "@/components/InvoiceDraftsModal.jsx";
import DocumentHistoryModal from "@/components/DocumentHistoryModal.jsx";
import VoidInvoiceModal from "@/components/VoidInvoiceModal.jsx";
import ShareDocumentModal from "@/components/ShareDocumentModal.jsx";
import { useCurrency } from "@/context/CurrencyContext.jsx";
import { usePermissions, Guard } from "@/api/usePermissions.js";
import { useSaleSystem } from "@/context/SaleSystemContext.jsx";
import { printUrlViaIframe } from "@/utils/printHelper.js";

// Reusable components
import {
  GlassCard,
  GlassSectionHeader,
  GlassToolbar,
  GlassInput,
  GlassBtn,
  TextSearch,
  DeleteConfirmationModal,
} from "@/components";
import { useTheme } from "@/context/ThemeContext";
import { getThemeButtonClasses } from "@/utils/buttonStyles";

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

// Section configuration with color schemes - will use dynamic theme colors
const getSectionConfig = (theme) => ({
  core: {
    gradient: `from-[${theme.primary_color || '#3b82f6'}] to-[${theme.primary_hover || '#2563eb'}]`,
    bgLight: `bg-[${theme.primary_light || '#dbeafe'}]`,
    bgDark: `dark:bg-[${theme.primary_light || '#1e3a5f'}]/20`,
    borderColor: `border-[${theme.primary_color || '#3b82f6'}]/30 dark:border-[${theme.primary_color || '#3b82f6'}]/30`,
    iconColor: `text-[${theme.primary_color || '#3b82f6'}] dark:text-[${theme.primary_color || '#3b82f6'}]`,
    ringColor: `ring-[${theme.primary_color || '#3b82f6'}]/30`,
  },
  management: {
    gradient: `from-[${theme.secondary_color || '#8b5cf6'}] to-[${theme.secondary_hover || '#7c3aed'}]`,
    bgLight: `bg-[${theme.secondary_light || '#ede9fe'}]`,
    bgDark: `dark:bg-[${theme.secondary_light || '#312e81'}]/20`,
    borderColor: `border-[${theme.secondary_color || '#8b5cf6'}]/30 dark:border-[${theme.secondary_color || '#8b5cf6'}]/30`,
    iconColor: `text-[${theme.secondary_color || '#8b5cf6'}] dark:text-[${theme.secondary_color || '#8b5cf6'}]`,
    ringColor: `ring-[${theme.secondary_color || '#8b5cf6'}]/30`,
  },
});

export default function SaleInvoicesIndex({ defaultSaleType = "" }) {
  const { formatCurrency } = useCurrency();
  const [invoices, setInvoices] = useState([]);
  const [loading, setLoading] = useState(true);

  // search + pagination
  const [qPosted, setQPosted] = useState("");
  const [qCustomer, setQCustomer] = useState("");
  const [saleTypeFilter, setSaleTypeFilter] = useState(defaultSaleType || "");
  const [page, setPage] = useState(1);
  const [pageSize, setPageSize] = useState(10);
  const [total, setTotal] = useState(0);
  const [lastPage, setLastPage] = useState(1);

  useEffect(() => {
    setSaleTypeFilter(defaultSaleType || "");
    setPage(1);
  }, [defaultSaleType]);

  // Delete modal state
  const [deleteModalOpen, setDeleteModalOpen] = useState(false);
  const [deletingInvoice, setDeletingInvoice] = useState(null);
  const [deleting, setDeleting] = useState(false);

  // History modal state
  const [historyModalOpen, setHistoryModalOpen] = useState(false);
  const [historyTarget, setHistoryTarget] = useState(null);

  // Void/Reversal modal state
  const [voidModalOpen, setVoidModalOpen] = useState(false);
  const [voidingInvoice, setVoidingInvoice] = useState(null);
  const [isReversing, setIsReversing] = useState(false);

  // Held Drafts state
  const [isDraftsOpen, setIsDraftsOpen] = useState(false);
  const [draftsList, setDraftsList] = useState([]);

  const fetchDrafts = useCallback(async () => {
    try {
      const res = await axios.get("/api/invoice-drafts", { params: { status: "draft" } });
      const allowedTypes =
        defaultSaleType === "wholesale"
          ? ["sale_wholesale"]
          : ["sale_retail", "sale_wholesale"];
      const saleDrafts = (res.data || []).filter((d) => allowedTypes.includes(d.type));
      setDraftsList(saleDrafts);
    } catch {}
  }, [defaultSaleType]);

  useEffect(() => {
    fetchDrafts();
  }, [fetchDrafts]);

  // Ctrl+H or Ctrl+D to open Held Drafts modal
  useEffect(() => {
    const onKeyDown = (e) => {
      if ((e.ctrlKey || e.metaKey) && !e.shiftKey && !e.altKey && ["d", "h"].includes((e.key || "").toLowerCase())) {
        e.preventDefault();
        fetchDrafts();
        setIsDraftsOpen(true);
      }
    };
    window.addEventListener("keydown", onKeyDown);
    return () => window.removeEventListener("keydown", onKeyDown);
  }, [fetchDrafts]);

  const handleResumeDraft = (draftId) => {
    if (typeof window !== "undefined") {
      window.__isResumingInvoiceDraft = true;
    }
    const draft = draftsList.find((d) => d.id === draftId);
    if (draft?.type === "sale_wholesale") {
      navigate(`/sale-invoices/create/wholesale?draft_id=${draftId}`);
    } else {
      navigate(`/sale-invoices/create/retail?draft_id=${draftId}`);
    }
  };

  const handleDiscardDraft = async (draftId) => {
    try {
      await axios.delete(`/api/invoice-drafts/${draftId}`);
      toast.success("Draft discarded");
      fetchDrafts();
    } catch {
      toast.error("Failed to discard draft");
    }
  };

  const handleOpenHistory = (invoice) => {
    setHistoryTarget(invoice);
    setHistoryModalOpen(true);
  };

  const handleOpenVoid = (invoice) => {
    setVoidingInvoice(invoice);
    setVoidModalOpen(true);
  };

  const [sharingInvoiceId, setSharingInvoiceId] = useState(null);

  const handleConfirmVoid = async (reason) => {
    if (!voidingInvoice) return;
    try {
      setIsReversing(true);
      await axios.post(`/api/sale-invoices/${voidingInvoice.id}/reverse`, { reason });
      toast.success(`Invoice ${voidingInvoice.posted_number || ""} reversed successfully`);
      if (typeof window !== "undefined") {
        window.dispatchEvent(new CustomEvent("cash-drawer-changed"));
      }
      setVoidModalOpen(false);
      setVoidingInvoice(null);
      fetchInvoices();
    } catch (err) {
      toast.error(err?.response?.data?.message || "Failed to reverse invoice");
    } finally {
      setIsReversing(false);
    }
  };

  const navigate = useNavigate();

  // AbortController for fetches
  const controllerRef = useRef(null);
  const debounceRef = useRef(null);

  // permissions
  const { loading: permsLoading, canFor, has } = usePermissions();
  const can = useMemo(
    () => ({
      ...(typeof canFor === "function" ? canFor("sale-invoice") : {
        view: false, create: false, update: false, delete: false, import: false, export: false
      }),
      pos: !permsLoading && (has("barcode-pos.view") || has("barcode-pos.create")),
    }),
    [canFor, permsLoading, has]
  );

  // Modern button palette (matching sidebar design language)
  // Get theme colors
  const { theme } = useTheme();

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

  // Dynamic section config
  const SECTION_CONFIG = useMemo(() => getSectionConfig(themeColors), [themeColors]);

  // Get dark mode state
  const { isDark } = useTheme();

  // Get sale system setting
  const { hasWholesale, loading: saleSystemLoading } = useSaleSystem();

  // Dynamic Button styles using theme colors
  const buttonStyle = theme?.button_style || 'modern';

  const getButtonClasses = useMemo(
    () => getThemeButtonClasses(buttonStyle, themeColors, isDark),
    [buttonStyle, themeColors, isDark]
  );

  const btnPrimary = getButtonClasses.primary;
  const btnSecondary = getButtonClasses.secondary;
  const btnTertiary = getButtonClasses.tertiary;
  const btnDanger = getButtonClasses.danger;
  const btnGlass = getButtonClasses.glass;

  // Disabled state
  const tintDisabled = useMemo(() => `
    bg-gray-200/50 dark:bg-slate-600/50 text-gray-400 dark:text-gray-500 cursor-not-allowed
  `.trim().replace(/\s+/g, ' '), []);

  // Fetch invoices
  const fetchInvoices = useCallback(async (signal, options = {}) => {
    if (permsLoading || !can.view) {
      setInvoices([]);
      setLoading(false);
      return;
    }

    const {
      pageArg = page,
      pageSizeArg = pageSize,
      qPostedArg = qPosted,
      qCustomerArg = qCustomer,
      saleTypeArg = saleTypeFilter,
    } = options;

    try {
      setLoading(true);
      const res = await axios.get("/api/sale-invoices", {
        params: {
          page: pageArg,
          per_page: pageSizeArg,
          posted: qPostedArg.trim(),
          customer: qCustomerArg.trim(),
          ...(saleTypeArg ? { sale_type: saleTypeArg } : {}),
        },
        signal,
      });

      const data = res.data;
      const items = Array.isArray(data?.data) ? data.data : Array.isArray(data) ? data : [];
      setInvoices(items);
      setTotal(Number(data?.total ?? items.length ?? 0));
      const lp = Number(data?.last_page ?? 1);
      setLastPage(lp);
      if (pageArg > lp) setPage(lp || 1);
    } catch (e) {
      if (axios.isCancel?.(e)) return;
      const status = e?.response?.status;
      if (status === 403) toast.error("You don't have permission to view sale invoices.");
      else toast.error("Failed to fetch sale invoices");
    } finally {
      setLoading(false);
    }
  }, [permsLoading, can.view, page, pageSize, qPosted, qCustomer, saleTypeFilter]);

  // Initial fetch and refetch on page/pageSize change
  useEffect(() => {
    if (permsLoading || !can.view) return;
    const ctrl = new AbortController();
    controllerRef.current = ctrl;
    fetchInvoices(ctrl.signal, {
      pageArg: page,
      pageSizeArg: pageSize,
      qPostedArg: qPosted,
      qCustomerArg: qCustomer,
      saleTypeArg: saleTypeFilter,
    });
    return () => ctrl.abort();
  }, [page, pageSize, saleTypeFilter, permsLoading, can.view]);

  // Ctrl+N -> create wholesale (when on wholesale index) or retail, Ctrl+W -> create wholesale
  useEffect(() => {
    const onKeyDown = (e) => {
      if (e.defaultPrevented || isDraftsOpen) return;
      if (!(e.ctrlKey || e.metaKey) || e.shiftKey || e.altKey) return;
      const key = (e.key || "").toLowerCase();
      const code = e.code || "";
      if (!can.create) return;

      if (key === "n" || code === "KeyN") {
        e.preventDefault();
        if (defaultSaleType === "wholesale" || saleTypeFilter === "wholesale") {
          navigate("/sale-invoices/create/wholesale");
        } else {
          navigate("/sale-invoices/create/retail");
        }
      } else if (key === "w" || code === "KeyW") {
        e.preventDefault();
        if (saleSystemLoading) return;
        if (hasWholesale) {
          navigate("/sale-invoices/create/wholesale");
        } else {
          toast.error("Wholesale sales are disabled. Please use Retail sales.");
        }
      }
    };
    window.addEventListener("keydown", onKeyDown);
    return () => window.removeEventListener("keydown", onKeyDown);
  }, [navigate, can.create, hasWholesale, saleSystemLoading, defaultSaleType, saleTypeFilter, isDraftsOpen]);

  // ===== search + pagination =====
  const didMountFiltersRef = useRef(false);
  // Debounce on filter change only (skip initial mount to avoid double-fetch)
  useEffect(() => {
    if (permsLoading || !can.view) return;
    if (!didMountFiltersRef.current) {
      didMountFiltersRef.current = true;
      return;
    }
    if (debounceRef.current) clearTimeout(debounceRef.current);
    const ctrl = new AbortController();
    debounceRef.current = setTimeout(() => {
      setPage(1);
      controllerRef.current = ctrl;
      fetchInvoices(ctrl.signal, {
        pageArg: 1,
        qPostedArg: qPosted,
        qCustomerArg: qCustomer,
      });
    }, 300);
    return () => {
      clearTimeout(debounceRef.current);
      ctrl.abort();
    };
  }, [qPosted, qCustomer, permsLoading, can.view]);

  const start = invoices.length ? (page - 1) * pageSize + 1 : 0;
  const end = invoices.length ? start + invoices.length - 1 : 0;

  // ===== delete modal handlers =====
  const openDeleteModal = (invoice) => {
    if (!can.delete) return toast.error("You don't have permission to delete sale invoices.");
    setDeletingInvoice({ id: invoice.id, name: invoice.posted_number });
    setDeleteModalOpen(true);
  };

  const closeDeleteModal = () => {
    setDeleteModalOpen(false);
    setDeletingInvoice(null);
  };

  const handleConfirmDelete = async (password) => {
    if (!deletingInvoice?.id) return;
    if (!can.delete) return toast.error("You don't have permission to delete sale invoices.");

    try {
      await axios.post("/api/auth/confirm-password", { password });
      await axios.delete(`/api/sale-invoices/${deletingInvoice.id}`);
      toast.success("Sale invoice deleted");
      if (typeof window !== "undefined") {
        window.dispatchEvent(new CustomEvent("cash-drawer-changed"));
      }
      closeDeleteModal();

      if (controllerRef.current) controllerRef.current.abort();
      const ctrl = new AbortController();
      controllerRef.current = ctrl;
      fetchInvoices(ctrl.signal, {
        pageArg: page,
        pageSizeArg: pageSize,
        qPostedArg: qPosted,
        qCustomerArg: qCustomer,
      });
    } catch (err) {
      const status = err?.response?.status;
      const apiMsg =
        err?.response?.data?.message ||
        (status === 422 ? "Incorrect password" : status === 403 ? "You don't have permission to delete sale invoices." : "Delete failed");
      toast.error(apiMsg);
    }
  };

  // Print popup logic
  const handlePrint = async (id) => {
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

    const w = window.open("about:blank", "salePrintWin", features);

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
      }

      w.onload = () => {
        try { w.focus(); w.print(); } catch {}
      };

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

  // Format date with alphabetic month (e.g., "1 Jan 2024" or "15 Feb 2024")
  const formatDate = (dateStr) => {
    if (!dateStr) return "-";
    const date = new Date(dateStr);
    if (isNaN(date.getTime())) return dateStr;

    const months = ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"];
    const day = date.getDate();
    const month = months[date.getMonth()];
    const year = date.getFullYear();

    return `${day} ${month} ${year}`;
  };

  // permissions gates
  if (permsLoading) return <div className="p-6">Loading…</div>;
  if (!can.view) return <div className="p-6 text-sm text-gray-700">You don't have permission to view sale invoices.</div>;

  return (
    <div className="sale-invoice-list space-y-4">
      {/* ===== Premium Hero Header ===== */}
      <div
        className="sale-list-header relative rounded-2xl overflow-hidden"

      >
        {/* Decorative blurred blobs */}
        <div className="absolute -top-10 -right-8 w-64 h-64 rounded-full bg-white/15 blur-3xl pointer-events-none" />
        <div className="absolute -bottom-16 left-1/4 w-72 h-72 rounded-full bg-white/10 blur-3xl pointer-events-none" />

        {/* Top row */}
        <div className="relative px-6 pt-5 pb-4 flex flex-col lg:flex-row lg:items-center justify-between gap-4">
          <div className="flex items-center gap-4">
            <div className="w-12 h-12 rounded-2xl bg-white/20 backdrop-blur-sm shadow-inner flex items-center justify-center">
              <DocumentTextIcon className="w-6 h-6 text-white" />
            </div>
            <div>
              <div className="flex items-center gap-2.5">
                <h1 className="text-2xl font-extrabold tracking-wide text-white leading-none">
                  {defaultSaleType === "wholesale" ? "Wholesale Invoices" : "Sale Invoices"}
                </h1>
                {defaultSaleType === "wholesale" && (
                  <span className="px-2 py-0.5 rounded-md text-[10px] font-bold tracking-widest uppercase bg-white/20 text-white backdrop-blur-xs">
                    B2B Distribution
                  </span>
                )}
              </div>
              <p className="text-xs text-white/85 mt-1.5 flex items-center gap-1.5">
                <DocumentTextIcon className="w-3.5 h-3.5" />
                {total} {defaultSaleType === "wholesale" ? "wholesale " : ""}invoices
              </p>
            </div>
          </div>

          {/* Actions */}
          <div className="flex items-center gap-2.5 flex-wrap">
            {hasWholesale && !defaultSaleType && (
              <div
                className="inline-flex items-center rounded-xl bg-black/20 p-1 backdrop-blur-xs border border-white/15"
                role="radiogroup"
                aria-label="Filter by sale type"
              >
                {[
                  { value: "", label: "All" },
                  { value: "retail", label: "Retail" },
                  { value: "wholesale", label: "Wholesale" },
                ].map((opt) => {
                  const active = saleTypeFilter === opt.value;
                  return (
                    <button
                      key={opt.value || "all"}
                      type="button"
                      role="radio"
                      aria-checked={active}
                      onClick={() => {
                        setSaleTypeFilter(opt.value);
                        setPage(1);
                      }}
                      className={`px-2.5 py-1 rounded-lg text-xs font-bold transition-all cursor-pointer ${
                        active
                          ? "bg-white text-slate-900 shadow-xs"
                          : "text-white/80 hover:text-white hover:bg-white/10"
                      }`}
                    >
                      {opt.label}
                    </button>
                  );
                })}
              </div>
            )}

            <button
              onClick={() => {
                if (controllerRef.current) controllerRef.current.abort();
                const ctrl = new AbortController();
                controllerRef.current = ctrl;
                fetchInvoices(ctrl.signal, {
                  pageArg: page,
                  pageSizeArg: pageSize,
                  qPostedArg: qPosted,
                  qCustomerArg: qCustomer,
                  saleTypeArg: saleTypeFilter,
                });
              }}
              title="Refresh"
              aria-label="Refresh sale invoices"
              className="products-action theme-btn-tertiary"
            >
              <ArrowPathIcon className="w-3.5 h-3.5" />
              <span>Refresh</span>
            </button>

            <Guard when={can.pos && defaultSaleType !== "wholesale"}>
              <Link
                to="/sale-invoices/pos"
                title="Open High-Speed Barcode Scanning POS Mode"
                className="products-action theme-btn-secondary"
              >
                <QrCodeIcon className="w-4 h-4 text-emerald-500" />
                <span>Barcode POS</span>
              </Link>
            </Guard>

            <Guard when={can.create}>
              <button
                type="button"
                onClick={() => {
                  fetchDrafts();
                  setIsDraftsOpen(true);
                }}
                title="View Held Invoices & Drafts (Ctrl+H / Ctrl+D)"
                className="products-action theme-btn-secondary relative"
              >
                <ClockIcon className="w-3.5 h-3.5 shrink-0" />
                <span>Held Drafts</span>
                {draftsList.length > 0 && (
                  <span className="h-4 min-w-[16px] px-1 flex items-center justify-center rounded-full text-[10px] font-bold bg-amber-400 text-slate-900 leading-none">
                    {draftsList.length}
                  </span>
                )}
              </button>

              {defaultSaleType !== "wholesale" && (
                <Link
                  to="/sale-invoices/create/retail"
                  title="Add Retail Sale Invoice"
                  className="products-action products-action-primary theme-btn-primary"
                >
                  <PlusCircleIcon className="w-4 h-4" />
                  <span>Retail Sale</span>
                </Link>
              )}

              {!saleSystemLoading && hasWholesale && (
                <Link
                  to="/sale-invoices/create/wholesale"
                  title="Add Wholesale Sale Invoice"
                  className={
                    defaultSaleType === "wholesale"
                      ? "products-action products-action-primary theme-btn-primary"
                      : "products-action theme-btn-secondary"
                  }
                >
                  <PlusCircleIcon className="w-4 h-4" />
                  <span>{defaultSaleType === "wholesale" ? "New Wholesale Invoice" : "Wholesale Sale"}</span>
                </Link>
              )}
            </Guard>
          </div>
        </div>

        {/* Filter bar integrated in hero */}
        <div className="relative px-6 pt-2 pb-5">
          <div className="grid grid-cols-1 md:grid-cols-2 gap-3 bg-white/15 backdrop-blur-sm border border-white/20 rounded-xl p-3">
            <div className="flex items-center gap-2">
              <DocumentTextIcon className="w-4 h-4 text-white/80 shrink-0" />
              <TextSearch
                aria-label="Search by posted number"
                value={qPosted}
                onChange={setQPosted}
                placeholder="Search by Posted No (e.g., SI-000001)…"
                icon={<DocumentTextIcon className="w-4 h-4 text-white/80" />}
              />
            </div>
            <div className="flex items-center gap-2">
              <UserIcon className="w-4 h-4 text-white/80 shrink-0" />
              <TextSearch
                aria-label="Search by customer"
                value={qCustomer}
                onChange={setQCustomer}
                placeholder="Search by Customer…"
                icon={<UserIcon className="w-4 h-4 text-white/80" />}
              />
            </div>
          </div>
        </div>
      </div>

      {/* ===== Invoices Table ===== */}
      <div className="sale-list-table rounded-2xl overflow-hidden">
        {/* Table Header */}
        <div className="flex items-center justify-between px-4 py-3 border-b border-gray-100 dark:border-slate-700">
          <div className="flex items-center gap-2.5">
            <div 
              className="p-2 rounded-xl shadow-xs"
              style={{ backgroundColor: themeColors.secondaryLight }}
            >
              <DocumentTextIcon className="w-4 h-4" style={{ color: themeColors.secondary }} />
            </div>
            <div>
              <span className="text-sm font-semibold text-gray-700 dark:text-gray-200">Invoice List</span>
              <p className="text-[11px] text-gray-400 dark:text-gray-500">
                {loading ? (
                  <span className="inline-flex items-center gap-1">
                    <ArrowPathIcon className="w-3 h-3 animate-spin" />
                    Loading...
                  </span>
                ) : (
                  `${invoices.length === 0 ? 0 : start}-${end} of ${total}`
                )}
              </p>
            </div>
          </div>

          {/* Page Size Selector */}
          <div className="flex items-center gap-1.5 px-2 py-1 rounded-lg bg-gray-50 dark:bg-slate-700/50 border border-gray-200 dark:border-slate-600">
            <label className="text-xs font-medium text-gray-500 dark:text-gray-400">Show</label>
            <select
              value={pageSize}
              onChange={(e) => setPageSize(Number(e.target.value))}
              className="h-7 px-2 rounded-sm border-gray-200 dark:border-slate-600 bg-white dark:bg-slate-700 text-xs font-medium text-gray-700 dark:text-gray-200 focus:ring-2 focus:border-transparent cursor-pointer"
              style={{
                '--tw-ring-color': themeColors.primary,
                outlineColor: themeColors.primary,
                accentColor: themeColors.primary,
              }}
            >
              <option value={10}>10</option>
              <option value={25}>25</option>
              <option value={50}>50</option>
              <option value={100}>100</option>
            </select>
          </div>
        </div>

        <div className="max-h-[65vh] overflow-auto">
          <table className="w-full text-sm">
            <thead className="sticky top-0 bg-white dark:bg-slate-800 z-10 shadow-xs">
              <tr className="text-left">
                <th className="px-3 py-2 font-semibold text-gray-600 dark:text-gray-300 text-xs uppercase tracking-wider">#</th>
                <th className="px-3 py-2 font-semibold text-gray-600 dark:text-gray-300 text-xs uppercase tracking-wider">Type</th>
                <th className="px-3 py-2 font-semibold text-gray-600 dark:text-gray-300 text-xs uppercase tracking-wider">Posted No</th>
                <th className="px-3 py-2 font-semibold text-gray-600 dark:text-gray-300 text-xs uppercase tracking-wider">Customer</th>
                <th className="px-3 py-2 font-semibold text-gray-600 dark:text-gray-300 text-xs uppercase tracking-wider">Date</th>
                <th className="px-3 py-2 font-semibold text-right text-gray-600 dark:text-gray-300 text-xs uppercase tracking-wider">Total</th>
                <th className="px-3 py-2 font-semibold text-center text-gray-600 dark:text-gray-300 text-xs uppercase tracking-wider w-40">Actions</th>
              </tr>
            </thead>

            <tbody>
              {invoices.length === 0 && !loading && (
                <tr>
                  <td className="px-3 py-12 text-center" colSpan={7}>
                    <div className="flex flex-col items-center gap-2">
                      <DocumentTextIcon className="w-8 h-8 text-gray-400" />
                      <p className="text-sm text-gray-500 dark:text-gray-400">No sale invoices found</p>
                    </div>
                  </td>
                </tr>
              )}

              {loading && (
                <tr>
                  <td className="px-3 py-12 text-center" colSpan={7}>
                    <div className="flex flex-col items-center gap-2">
                      <ArrowPathIcon className="w-6 h-6 text-gray-400 animate-spin" />
                      <p className="text-sm text-gray-500 dark:text-gray-400">Loading...</p>
                    </div>
                  </td>
                </tr>
              )}

              {invoices.map((invoice, idx) => {
                const invTotal = Number(invoice.total ?? 0);
                const invReceived = Number(invoice.total_receive ?? invoice.total_recieve ?? 0);
                const invRemaining = Math.max(invTotal - invReceived, 0);
                const isCredit = invoice.invoice_type === 'credit';

                return (
                  <tr
                    key={invoice.id}
                    className={`
                      transition-colors
                      odd:bg-white even:bg-gray-50 dark:odd:bg-slate-700/40 dark:even:bg-slate-800/40 hover:bg-blue-50 dark:hover:bg-slate-600/50
                      border-b border-gray-100 dark:border-slate-600/30
                    `}
                  >
                    <td className="px-3 py-3 text-gray-600 dark:text-gray-300">
                      {start + idx + 1}
                    </td>
                    <td className="px-3 py-3">
                      <div className="flex flex-wrap gap-1 items-center">
                        {invoice.sale_type === "wholesale" ? (
                          <span className="inline-flex items-center px-2 py-0.5 rounded-sm text-[10.5px] font-bold bg-purple-100 text-purple-800 dark:bg-purple-900/40 dark:text-purple-300 border border-purple-200 dark:border-purple-800">
                            Wholesale
                          </span>
                        ) : (
                          <span className="inline-flex items-center px-2 py-0.5 rounded-sm text-[10.5px] font-semibold bg-blue-100 text-blue-800 dark:bg-blue-900/40 dark:text-blue-300">
                            Retail
                          </span>
                        )}
                        {invoice.invoice_type === 'credit' ? (
                          <span className="inline-flex items-center px-2 py-0.5 rounded-sm text-xs font-medium bg-amber-100 text-amber-800 dark:bg-amber-900/40 dark:text-amber-400">
                            Credit
                          </span>
                        ) : (
                          <span className="inline-flex items-center px-2 py-0.5 rounded-sm text-xs font-medium bg-emerald-100 text-emerald-800 dark:bg-emerald-900/40 dark:text-emerald-400">
                            Debit
                          </span>
                        )}
                        {invoice.status === 'reversed' && (
                          <span className="inline-flex items-center px-1.5 py-0.5 rounded text-[10px] font-bold bg-rose-100 text-rose-700 dark:bg-rose-900/40 dark:text-rose-400 border border-rose-200 dark:border-rose-800">
                            Reversed
                          </span>
                        )}
                      </div>
                    </td>
                    <td className="px-3 py-3">
                      <span className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-lg bg-blue-50 dark:bg-blue-900/30 text-blue-700 dark:text-blue-300 text-xs font-medium">
                        <DocumentTextIcon className="w-3.5 h-3.5" />
                        {invoice.posted_number || "-"}
                      </span>
                    </td>
                    <td className="px-3 py-3">
                      <div className="flex items-center gap-2">
                        <UserIcon className="w-4 h-4 text-gray-400" />
                        <span className="text-gray-800 dark:text-gray-200">{invoice.customer?.name ?? "N/A"}</span>
                      </div>
                    </td>
                    <td className="px-3 py-3">
                      <div className="flex items-center gap-2">
                        <CalendarIcon className="w-4 h-4 text-gray-400" />
                        <span className="text-gray-800 dark:text-gray-200">{formatDate(invoice.date)}</span>
                      </div>
                    </td>
                    <td className="px-3 py-3 text-right">
                      <div className="flex items-center justify-end gap-1">
                        <CurrencyDollarIcon className="w-4 h-4 text-emerald-500" />
                        <span className={`font-semibold ${invoice.status === 'reversed' ? 'line-through text-gray-400 dark:text-gray-500' : 'text-gray-800 dark:text-gray-200'}`}>
                          {formatCurrency(invTotal)}
                        </span>
                      </div>
                      {/* Show remaining if any */}
                      {invRemaining > 0 && invoice.status !== 'reversed' && (
                        <div className="text-xs text-gray-500 dark:text-gray-400 mt-1">
                          Due: {formatCurrency(invRemaining)}
                        </div>
                      )}
                    </td>
                    <td className="px-3 py-3">
                      <div className="flex items-center gap-1.5 justify-center">
                        {/* View Action */}
                        <Link
                          to={
                            invoice.sale_type === "wholesale" || defaultSaleType === "wholesale"
                              ? `/wholesale-invoices/${invoice.id}`
                              : `/sale-invoices/${invoice.id}`
                          }
                          className="products-row-action"
                          title="View" aria-label="View sale invoice"
                        >
                          <EyeIcon className="w-3.5 h-3.5 transition-transform group-hover:scale-110" />
                        </Link>

                        {/* Edit Action */}
                        <Guard when={can.update}>
                          {invoice.status !== 'reversed' ? (
                            <Link
                              to={`/sale-invoices/${invoice.id}/edit`}
                              className="products-row-action"
                              title="Edit" aria-label="Edit sale invoice"
                            >
                              <PencilSquareIcon className="w-3.5 h-3.5 transition-transform group-hover:scale-110" />
                            </Link>
                          ) : (
                            <span
                              className="products-row-action opacity-30 cursor-not-allowed"
                              title="Reversed invoices cannot be edited"
                              aria-label="Cannot edit reversed invoice"
                            >
                              <PencilSquareIcon className="w-3.5 h-3.5" />
                            </span>
                          )}
                        </Guard>

                        {/* Print Action */}
                        <button
                          onClick={() => handlePrint(invoice.id)}
                          className="products-row-action"
                          title="Print" aria-label="Print sale invoice"
                        >
                          <PrinterIcon className="w-3.5 h-3.5 transition-transform group-hover:scale-110" />
                        </button>

                        {/* Share (WhatsApp / Email PDF) Action */}
                        <button
                          onClick={() => setSharingInvoiceId(invoice.id)}
                          className="products-row-action text-emerald-600 hover:text-emerald-700 hover:bg-emerald-50 dark:hover:bg-emerald-900/30"
                          title="Share via WhatsApp or Email PDF"
                          aria-label="Share sale invoice"
                        >
                          <ShareIcon className="w-3.5 h-3.5 transition-transform group-hover:scale-110" />
                        </button>

                        {/* Audit History Action */}
                        <button
                          onClick={() => handleOpenHistory(invoice)}
                          className="products-row-action text-blue-600 hover:text-blue-700 hover:bg-blue-50 dark:hover:bg-blue-900/30"
                          title="Audit History" aria-label="View invoice change history"
                        >
                          <ClockIcon className="w-3.5 h-3.5 transition-transform group-hover:scale-110" />
                        </button>

                        {/* Void / Reversal Action */}
                        <Guard when={can.delete}>
                          {invoice.status !== 'reversed' && (
                            <button
                              onClick={() => handleOpenVoid(invoice)}
                              className="products-row-action text-amber-600 hover:text-amber-700 hover:bg-amber-50 dark:hover:bg-amber-900/30"
                              title="Void / Reverse Invoice" aria-label="Void sale invoice"
                            >
                              <ArrowUturnLeftIcon className="w-3.5 h-3.5 transition-transform group-hover:scale-110" />
                            </button>
                          )}
                        </Guard>

                        {/* Delete Action */}
                        <Guard when={can.delete}>
                          <button
                            onClick={() => openDeleteModal(invoice)}
                            className="products-row-action products-row-action-danger"
                            title="Delete" aria-label="Delete sale invoice"
                          >
                            <TrashIcon className="w-3.5 h-3.5 transition-transform group-hover:scale-110" />
                          </button>
                        </Guard>
                      </div>
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>

        {/* Compact Pagination */}
        <div className="px-3 py-2 flex flex-wrap items-center justify-between gap-2 border-t border-gray-200 dark:border-slate-700 bg-gray-50 dark:bg-slate-800/50 text-xs">
          <span className="text-gray-500 dark:text-gray-400">
            Page {page} of {lastPage} ({total} total)
          </span>

          <div className="flex items-center gap-1">
            <button
              onClick={() => setPage(1)}
              disabled={page === 1}
              className={`p-1.5 rounded-sm hover:bg-gray-200 dark:hover:bg-slate-700 ${page === 1 ? 'opacity-40' : ''}`}
            >
              <ChevronDoubleLeftIcon className="w-3.5 h-3.5" />
            </button>
            <button
              onClick={() => setPage((p) => Math.max(1, p - 1))}
              disabled={page === 1}
              className={`p-1.5 rounded-sm hover:bg-gray-200 dark:hover:bg-slate-700 ${page === 1 ? 'opacity-40' : ''}`}
            >
              <ChevronLeftIcon className="w-3.5 h-3.5" />
            </button>

            {/* Page numbers */}
            <div className="flex items-center gap-0.5 mx-1">
              {Array.from({ length: Math.min(5, lastPage) }, (_, i) => {
                let pageNum;
                if (lastPage <= 5) {
                  pageNum = i + 1;
                } else if (page <= 3) {
                  pageNum = i + 1;
                } else if (page >= lastPage - 2) {
                  pageNum = lastPage - 4 + i;
                } else {
                  pageNum = page - 2 + i;
                }
                return (
                  <button
                    key={pageNum}
                    onClick={() => setPage(pageNum)}
                    className={`
                      w-7 h-7 rounded text-xs font-medium transition-colors
                      ${page === pageNum
                        ? 'text-white'
                        : "text-gray-600 dark:text-gray-300 hover:bg-gray-200 dark:hover:bg-slate-700"
                      }
                    `}
                    style={page === pageNum ? { backgroundColor: themeColors.primary, color: '#fff' } : {}}
                  >
                    {pageNum}
                  </button>
                );
              })}
            </div>

            <button
              onClick={() => setPage((p) => Math.min(lastPage, p + 1))}
              disabled={page === lastPage}
              className={`p-1.5 rounded-sm hover:bg-gray-200 dark:hover:bg-slate-700 ${page === lastPage ? 'opacity-40' : ''}`}
            >
              <ChevronRightIcon className="w-3.5 h-3.5" />
            </button>
            <button
              onClick={() => setPage(lastPage)}
              disabled={page === lastPage}
              className={`p-1.5 rounded-sm hover:bg-gray-200 dark:hover:bg-slate-700 ${page === lastPage ? 'opacity-40' : ''}`}
            >
              <ChevronDoubleRightIcon className="w-3.5 h-3.5" />
            </button>
          </div>
        </div>
      </div>

      {/* Delete Confirmation Modal */}
      <DeleteConfirmationModal
        isOpen={deleteModalOpen}
        onClose={closeDeleteModal}
        onConfirm={handleConfirmDelete}
        itemName={deletingInvoice?.name || "this invoice"}
        title="Delete sale invoice"
        isDeleting={deleting}
        setIsDeleting={setDeleting}
        tintClasses={{ 
          red: btnDanger.className, 
          redStyle: btnDanger.style,
          glass: btnGlass.className 
        }}
        glassStyle={btnGlass.style}
      />

      {/* Held Invoices & Drafts Modal */}
      <InvoiceDraftsModal
        isOpen={isDraftsOpen}
        onClose={() => setIsDraftsOpen(false)}
        drafts={draftsList}
        onResumeDraft={handleResumeDraft}
        onDiscardDraft={handleDiscardDraft}
        onStartBlank={() =>
          navigate(
            defaultSaleType === "wholesale" || saleTypeFilter === "wholesale"
              ? "/sale-invoices/create/wholesale"
              : "/sale-invoices/create/retail"
          )
        }
        type={
          defaultSaleType === "wholesale" || saleTypeFilter === "wholesale"
            ? "sale_wholesale"
            : "sale_retail"
        }
      />

      {/* Audit History Modal */}
      <DocumentHistoryModal
        isOpen={historyModalOpen}
        onClose={() => {
          setHistoryModalOpen(false);
          setHistoryTarget(null);
        }}
        entityType="sale_invoice"
        entityId={historyTarget?.id}
        entityNumber={historyTarget?.posted_number || `#${historyTarget?.id || ""}`}
      />

      {/* Void / Reversal Modal */}
      <VoidInvoiceModal
        isOpen={voidModalOpen}
        onClose={() => {
          setVoidModalOpen(false);
          setVoidingInvoice(null);
        }}
        onConfirm={handleConfirmVoid}
        invoice={voidingInvoice}
        isReversing={isReversing}
      />

      {/* Outbound Document Share Modal (WhatsApp / Email PDF) */}
      <ShareDocumentModal
        isOpen={Boolean(sharingInvoiceId)}
        onClose={() => setSharingInvoiceId(null)}
        documentType="sale_invoice"
        documentId={sharingInvoiceId}
      />
    </div>
  );
}

