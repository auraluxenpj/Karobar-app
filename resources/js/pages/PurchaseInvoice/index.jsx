// src/pages/purchase-invoices/index.jsx
import React, { useEffect, useMemo, useRef, useState, useCallback } from "react";
import axios from "axios";
import { Link, useNavigate } from "react-router-dom";
import toast from "react-hot-toast";
import {
  PlusCircleIcon,
  PencilSquareIcon,
  EyeIcon,
  TrashIcon,
  MagnifyingGlassIcon,
  XMarkIcon,
  ArrowPathIcon,
  ShieldExclamationIcon,
  ClipboardDocumentListIcon,
  ClockIcon,
  ArrowUturnLeftIcon,
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
import { useTheme } from "@/context/ThemeContext";
import { getThemeButtonClasses } from "@/utils/buttonStyles";

import {
  GlassCard,
  GlassInput,
  GlassBtn,
} from "@/components/Glass.jsx";

// Section configuration with color schemes - matching sidebar design
const SECTION_CONFIG = {
  invoices: {
    gradient: "from-emerald-500 to-teal-600",
    bgLight: "bg-emerald-50",
    bgDark: "dark:bg-emerald-900/20",
    borderColor: "border-emerald-200 dark:border-emerald-700",
    iconColor: "text-emerald-600 dark:text-emerald-400",
    ringColor: "ring-emerald-300 dark:ring-emerald-700",
  },
};

// Helper function to format date in alphabet format (e.g., "1 Jan 2024", "15 Feb 2023")
const formatDate = (dateStr) => {
  if (!dateStr) return "-";
  const date = new Date(dateStr);
  if (isNaN(date.getTime())) return dateStr;
  const day = date.getDate();
  const month = date.toLocaleString("en", { month: "short" });
  const year = date.getFullYear();
  return `${day} ${month} ${year}`;
};

export default function PurchaseInvoicesIndex() {
  const { formatCurrency } = useCurrency();
  const [rows, setRows] = useState([]);
  const [loading, setLoading] = useState(false);

  // search filters
  const [qPosted, setQPosted] = useState("");
  const [qSupplier, setQSupplier] = useState("");

  // pagination (server-side)
  const [page, setPage] = useState(1);
  const [pageSize, setPageSize] = useState(10);
  const [total, setTotal] = useState(0);
  const [lastPage, setLastPage] = useState(1);

  // History modal state
  const [historyModalOpen, setHistoryModalOpen] = useState(false);
  const [historyTarget, setHistoryTarget] = useState(null);

  // Void/Reversal modal state
  const [voidModalOpen, setVoidModalOpen] = useState(false);
  const [voidingInvoice, setVoidingInvoice] = useState(null);
  const [isReversing, setIsReversing] = useState(false);

  // Share modal state
  const [sharingInvoiceId, setSharingInvoiceId] = useState(null);

  const navigate = useNavigate();

  // AbortController for fetches
  const controllerRef = useRef(null);
  const debounceRef = useRef(null);

  // permissions
  const { loading: permsLoading, canFor } = usePermissions();
  const can = useMemo(
    () =>
      (typeof canFor === "function"
        ? canFor("purchase-invoice")
        : { view: false, create: false, update: false, delete: false, import: false, export: false }),
    [canFor]
  );

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
      };
    }
    return {
      primary: theme.primary_color || '#3b82f6',
      primaryHover: theme.primary_hover || '#2563eb',
      primaryLight: theme.primary_light || '#dbeafe',
      secondary: theme.secondary_color || '#8b5cf6',
      secondaryHover: theme.secondary_hover || '#7c3aed',
      secondaryLight: theme.secondary_light || '#ede9fe',
    };
  }, [theme]);

  // Dynamic Button styles using theme colors
  const buttonStyle = theme?.button_style || 'modern';
  
  const getButtonClasses = useMemo(
    () => getThemeButtonClasses(buttonStyle, themeColors, isDark),
    [buttonStyle, themeColors, isDark]
  );

  const btnPrimary = getButtonClasses.primary;
  const btnSecondary = getButtonClasses.secondary;
  const btnDanger = getButtonClasses.danger;
  const btnGlass = getButtonClasses.glass;

  // Held Drafts state
  const [isDraftsOpen, setIsDraftsOpen] = useState(false);
  const [draftsList, setDraftsList] = useState([]);

  const fetchDrafts = useCallback(async () => {
    try {
      const res = await axios.get("/api/invoice-drafts", { params: { type: "purchase", status: "draft" } });
      setDraftsList(res.data || []);
    } catch {}
  }, []);

  useEffect(() => {
    fetchDrafts();
  }, [fetchDrafts]);

  // Alt+H or Alt+D to open Held Drafts modal
  useEffect(() => {
    const onKeyDown = (e) => {
      if (e.altKey && ["d", "h"].includes((e.key || "").toLowerCase())) {
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
    navigate(`/purchase-invoices/create?draft_id=${draftId}`);
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

  const handleConfirmVoid = async (reason) => {
    if (!voidingInvoice) return;
    try {
      setIsReversing(true);
      await axios.post(`/api/purchase-invoices/${voidingInvoice.id}/reverse`, { reason });
      toast.success(`Purchase Invoice ${voidingInvoice.posted_number || voidingInvoice.invoice_number || ""} reversed successfully`);
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

  useEffect(() => {
    document.title = "Purchase Invoices - Pharmacy ERP";
  }, []);

  // Alt+N => /purchase-invoices/create (only when can.create)
  useEffect(() => {
    const onKeyDown = (e) => {
      if (!e.altKey) return;
      const key = (e.key || "").toLowerCase();
      if (key !== "n") return;
      const tag = (e.target?.tagName || "").toLowerCase();
      const isTyping = ["input", "textarea", "select"].includes(tag) || e.target?.isContentEditable;
      if (isTyping) return;
      if (!can.create) return;
      e.preventDefault();
      navigate("/purchase-invoices/create");
    };
    window.addEventListener("keydown", onKeyDown);
    return () => window.removeEventListener("keydown", onKeyDown);
  }, [navigate, can.create]);

  const fetchInvoices = useCallback(async (signal, options = {}) => {
    const {
      pageArg = page,
      pageSizeArg = pageSize,
      qPostedArg = qPosted,
      qSupplierArg = qSupplier,
    } = options;

    try {
      setLoading(true);
      const { data } = await axios.get("/api/purchase-invoices", {
        params: {
          page: pageArg,
          per_page: pageSizeArg,
          posted: qPostedArg.trim(),
          supplier: qSupplierArg.trim(),
        },
        signal,
      });

      const items = Array.isArray(data?.data) ? data.data : Array.isArray(data) ? data : [];
      setRows(items);
      setTotal(Number(data?.total ?? items.length ?? 0));
      const lp = Number(data?.last_page ?? 1);
      setLastPage(lp);
      if (pageArg > lp) setPage(lp || 1);
    } catch (err) {
      if (axios.isCancel?.(err)) return;
      const status = err?.response?.status;
      if (status === 403)
        toast.error("You don't have permission to view purchase invoices.");
      else toast.error("Failed to load purchase invoices");
    } finally {
      setLoading(false);
    }
  }, [page, pageSize, qPosted, qSupplier]);

  const didMountFiltersRef = useRef(false);

  // Fetch on page or pageSize change
  useEffect(() => {
    if (permsLoading || !can.view) return;
    const ctrl = new AbortController();
    controllerRef.current = ctrl;
    fetchInvoices(ctrl.signal);
    return () => ctrl.abort();
  }, [page, pageSize, permsLoading, can.view]);

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
        qSupplierArg: qSupplier,
      });
    }, 300);
    return () => {
      clearTimeout(debounceRef.current);
      ctrl.abort();
    };
  }, [qPosted, qSupplier, permsLoading, can.view]);

  const start = rows.length ? (page - 1) * pageSize + 1 : 0;
  const end = rows.length ? start + rows.length - 1 : 0;

  // ===== secure delete modal state & handlers =====
  const [deleteModalOpen, setDeleteModalOpen] = useState(false);
  const [deleteStep, setDeleteStep] = useState(1);
  const [deletingInvoice, setDeletingInvoice] = useState(null);
  const [password, setPassword] = useState("");
  const [deleting, setDeleting] = useState(false);

  const openDeleteModal = (inv) => {
    if (!can.delete) return toast.error("You don't have permission to delete invoices.");
    setDeletingInvoice({ id: inv.id, posted_number: inv.posted_number });
    setPassword("");
    setDeleteStep(1);
    setDeleteModalOpen(true);
  };

  const closeDeleteModal = () => {
    if (deleting) return;
    setDeleteModalOpen(false);
    setDeleteStep(1);
    setDeletingInvoice(null);
    setPassword("");
  };

  const proceedToPassword = () => setDeleteStep(2);

  const confirmAndDelete = async () => {
    if (!deletingInvoice?.id) return;
    if (!can.delete) return toast.error("You don't have permission to delete invoices.");
    try {
      setDeleting(true);
      await axios.post("/api/auth/confirm-password", { password });
      await axios.delete(`/api/purchase-invoices/${deletingInvoice.id}`);
      toast.success("Invoice deleted");
      if (typeof window !== "undefined") {
        window.dispatchEvent(new CustomEvent("cash-drawer-changed"));
      }
      closeDeleteModal();

      if (controllerRef.current) controllerRef.current.abort();
      const ctrl = new AbortController();
      controllerRef.current = ctrl;
      fetchInvoices(ctrl.signal);
    } catch (err) {
      const status = err?.response?.status;
      const apiMsg =
        err?.response?.data?.message ||
        (status === 422 ? "Incorrect password" : status === 403 ? "You don't have permission to delete invoices." : "Delete failed");
      toast.error(apiMsg);
    } finally {
      setDeleting(false);
    }
  };

  if (permsLoading) return <div className="p-6">Loading…</div>;
  if (!can.view) return <div className="p-6 text-sm text-gray-700">You don't have permission to view purchase invoices.</div>;

  const hasActions = can.view || can.update || can.delete;

  return (
    <div className="purchase-invoices-page">
      <div className="products-panel">
        {/* Top row */}
        <div className="products-heading">
          <div className="flex items-center gap-4">
            <div className="products-identity-icon">
              <ClipboardDocumentListIcon className="w-6 h-6" />
            </div>
            <div>
              <h1 className="products-title">Purchase Invoices</h1>
              <p className="products-subtitle">
                <ClipboardDocumentListIcon className="w-3.5 h-3.5" />
                {total} invoices
              </p>
            </div>
          </div>

          {/* Actions */}
          <div className="flex items-center gap-2.5 flex-wrap">
            <button
              onClick={() => {
                if (controllerRef.current) controllerRef.current.abort();
                const ctrl = new AbortController();
                controllerRef.current = ctrl;
                fetchInvoices(ctrl.signal);
              }}
              title="Refresh"
              className="products-action theme-btn-tertiary"
            >
              <ArrowPathIcon className="w-3.5 h-3.5" />
              <span>Refresh</span>
            </button>

            <Guard when={can.create}>
              <button
                type="button"
                onClick={() => {
                  fetchDrafts();
                  setIsDraftsOpen(true);
                }}
                title="View Held Invoices & Drafts (Alt+H / Alt+D)"
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

              <Link
                to="/purchase-invoices/create"
                className="products-action products-action-primary theme-btn-primary"
              >
                <PlusCircleIcon className="w-4 h-4" />
                <span>Add Invoice</span>
              </Link>
            </Guard>
          </div>
        </div>

        {/* Filter bar integrated in hero */}
        <div className="purchase-invoice-filters">
          <div className="purchase-invoice-filter-grid">
            <label className="purchase-invoice-filter"><span>Posted number</span><div className="directory-search-field">
              <MagnifyingGlassIcon className="directory-search-icon" />
              <GlassInput
                value={qPosted}
                onChange={(e) => setQPosted(e.target.value)}
                placeholder="Search by Posted No..."
                className="w-full"
              />
            </div></label>
            <label className="purchase-invoice-filter"><span>Supplier</span><div className="directory-search-field">
              <MagnifyingGlassIcon className="directory-search-icon" />
              <GlassInput
                value={qSupplier}
                onChange={(e) => setQSupplier(e.target.value)}
                placeholder="Search by Supplier..."
                className="w-full"
              />
            </div></label>
          </div>
        </div>
      </div>

      {/* ===== Table Card ===== */}
      <div className="products-panel purchase-invoice-catalog">
        {/* Table Header */}
        <div className="products-catalog-heading">
          <div className="flex items-center gap-2.5">
            <div 
              className="p-2 rounded-xl shadow-xs"
              style={{ backgroundColor: themeColors.secondaryLight }}
            >
              <ClipboardDocumentListIcon 
                className="w-4 h-4" 
                style={{ color: themeColors.secondary }} 
              />
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
                  `${rows.length === 0 ? 0 : start}-${end} of ${total}`
                )}
              </p>
            </div>
          </div>

          {/* Page Size Selector */}
          <div className="flex items-center gap-1.5 px-2 py-1 rounded-lg bg-gray-50 dark:bg-slate-700/50 border border-gray-200 dark:border-slate-600">
            <label htmlFor="purchase-invoice-page-size" className="text-xs font-medium">Show</label>
            <select
              id="purchase-invoice-page-size"
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

        <div className="purchase-invoice-table-scroll" tabIndex={0} role="region" aria-label="Purchase invoice list" aria-busy={loading}>
          <table className="w-full text-sm">
            <thead className="sticky top-0 bg-white dark:bg-slate-800 z-10 shadow-xs">
              <tr className="text-left">
                <th className="px-3 py-2 font-semibold text-gray-600 dark:text-gray-300 text-xs uppercase tracking-wider w-12">#</th>
                <th className="px-3 py-2 font-semibold text-gray-600 dark:text-gray-300 text-xs uppercase tracking-wider w-24">Type</th>
                <th className="px-3 py-2 font-semibold text-gray-600 dark:text-gray-300 text-xs uppercase tracking-wider">Posted No</th>
                <th className="px-3 py-2 font-semibold text-gray-600 dark:text-gray-300 text-xs uppercase tracking-wider">Invoice No</th>
                <th className="px-3 py-2 font-semibold text-gray-600 dark:text-gray-300 text-xs uppercase tracking-wider">Supplier</th>
                <th className="px-3 py-2 font-semibold text-gray-600 dark:text-gray-300 text-xs uppercase tracking-wider">Date</th>
                <th className="px-3 py-2 font-semibold text-gray-600 dark:text-gray-300 text-xs uppercase tracking-wider text-right w-24">Amount</th>
                {hasActions && (
                  <th className="px-3 py-2 font-semibold text-gray-600 dark:text-gray-300 text-xs uppercase tracking-wider text-center w-28">Actions</th>
                )}
              </tr>
            </thead>

            <tbody>
              {rows.length === 0 && !loading && (
                <tr>
                  <td className="px-3 py-12 text-center" colSpan={hasActions ? 8 : 7}>
                    <div className="flex flex-col items-center gap-2">
                      <ClipboardDocumentListIcon className="w-8 h-8 text-gray-400" />
                      <p className="text-sm text-gray-500 dark:text-gray-400">No invoices found</p>
                    </div>
                  </td>
                </tr>
              )}

              {rows.map((inv, idx) => (
                <tr
                  key={inv.id}
                  className="odd:bg-white even:bg-gray-50 dark:odd:bg-slate-700/40 dark:even:bg-slate-800/40 hover:bg-blue-50 dark:hover:bg-slate-600/50 transition-colors border-b border-gray-100 dark:border-slate-600/30"
                >
                  <td className="px-3 py-2.5 text-gray-600 dark:text-gray-400">{(page - 1) * pageSize + idx + 1}</td>
                  <td className="px-3 py-2.5">
                    <div className="flex flex-col gap-1 items-start">
                      {inv.invoice_type === 'credit' ? (
                        <span className="inline-flex items-center px-2 py-0.5 rounded-sm text-xs font-medium bg-amber-100 text-amber-800 dark:bg-amber-900/40 dark:text-amber-400">
                          Credit
                        </span>
                      ) : (
                        <span className="inline-flex items-center px-2 py-0.5 rounded-sm text-xs font-medium bg-emerald-100 text-emerald-800 dark:bg-emerald-900/40 dark:text-emerald-400">
                          Debit
                        </span>
                      )}
                      {inv.status === 'reversed' && (
                        <span className="inline-flex items-center px-1.5 py-0.5 rounded text-[10px] font-bold bg-rose-100 text-rose-700 dark:bg-rose-900/40 dark:text-rose-400 border border-rose-200 dark:border-rose-800">
                          Reversed
                        </span>
                      )}
                    </div>
                  </td>
                  <td className="px-3 py-2.5 font-medium text-gray-900 dark:text-gray-100">{inv.posted_number || "-"}</td>
                  <td className="px-3 py-2.5 text-gray-900 dark:text-gray-100">{inv.invoice_number}</td>
                  <td className="px-3 py-2.5">
                    <span className="px-2 py-0.5 rounded-sm bg-emerald-50 dark:bg-emerald-900/30 text-emerald-700 dark:text-emerald-300 text-xs">
                      {inv.supplier?.name || "N/A"}
                    </span>
                  </td>
                  <td className="px-3 py-2.5 text-gray-600 dark:text-gray-400">{formatDate(inv.posted_date)}</td>
                  <td className="px-3 py-2.5 text-right font-medium text-gray-900 dark:text-gray-100">
                    <span className={inv.status === 'reversed' ? 'line-through text-gray-400 dark:text-gray-500' : ''}>
                      {formatCurrency(Number(inv.total_amount ?? 0))}
                    </span>
                  </td>

                  {hasActions && (
                    <td className="px-3 py-2.5">
                      <div className="flex items-center justify-center gap-1.5">
                        {/* View Action */}
                        <Guard when={can.view}>
                          <Link
                            to={`/purchase-invoices/${inv.id}`}
                            className="products-row-action"
                            aria-label={`View invoice ${inv.posted_number || inv.invoice_number}`}
                            title={`View ${inv.posted_number || inv.invoice_number}`}
                          >
                            <EyeIcon aria-hidden="true" className="w-4 h-4" />
                          </Link>
                        </Guard>

                        {/* Share Action */}
                        <Guard when={can.view}>
                          <button
                            type="button"
                            onClick={() => setSharingInvoiceId(inv.id)}
                            className="products-row-action text-emerald-600 hover:text-emerald-700 hover:bg-emerald-50 dark:hover:bg-emerald-900/30"
                            aria-label={`Share invoice ${inv.posted_number || inv.invoice_number}`}
                            title="Share PDF via WhatsApp / Email"
                          >
                            <ShareIcon aria-hidden="true" className="w-4 h-4" />
                          </button>
                        </Guard>

                        {/* Edit Action */}
                        <Guard when={can.update}>
                          {inv.status !== 'reversed' ? (
                            <Link
                              to={`/purchase-invoices/${inv.id}/edit`}
                              className="products-row-action"
                              aria-label={`Edit invoice ${inv.posted_number || inv.invoice_number}`}
                              title={`Edit ${inv.posted_number || inv.invoice_number}`}
                            >
                              <PencilSquareIcon aria-hidden="true" className="w-4 h-4" />
                            </Link>
                          ) : (
                            <span
                              className="products-row-action opacity-30 cursor-not-allowed"
                              title="Reversed invoices cannot be edited"
                              aria-label="Cannot edit reversed invoice"
                            >
                              <PencilSquareIcon aria-hidden="true" className="w-4 h-4" />
                            </span>
                          )}
                        </Guard>

                        {/* Audit History Action */}
                        <button
                          type="button"
                          onClick={() => handleOpenHistory(inv)}
                          className="products-row-action text-blue-600 hover:text-blue-700 hover:bg-blue-50 dark:hover:bg-blue-900/30"
                          title="Audit History"
                          aria-label={`View audit history for invoice ${inv.posted_number || inv.invoice_number}`}
                        >
                          <ClockIcon aria-hidden="true" className="w-4 h-4" />
                        </button>

                        {/* Void / Reversal Action */}
                        <Guard when={can.delete}>
                          {inv.status !== 'reversed' && (
                            <button
                              type="button"
                              onClick={() => handleOpenVoid(inv)}
                              className="products-row-action text-amber-600 hover:text-amber-700 hover:bg-amber-50 dark:hover:bg-amber-900/30"
                              title="Void / Reverse Invoice"
                              aria-label={`Void invoice ${inv.posted_number || inv.invoice_number}`}
                            >
                              <ArrowUturnLeftIcon aria-hidden="true" className="w-4 h-4" />
                            </button>
                          )}
                        </Guard>

                        {/* Delete Action */}
                        <Guard when={can.delete}>
                          <button
                            onClick={() => openDeleteModal(inv)}
                            className="products-row-action products-row-delete"
                            aria-label={`Delete invoice ${inv.posted_number || inv.invoice_number}`}
                            title="Delete invoice"
                          >
                            <TrashIcon aria-hidden="true" className="w-4 h-4" />
                          </button>
                        </Guard>
                      </div>
                    </td>
                  )}
                </tr>
              ))}
            </tbody>
          </table>
        </div>

        {/* Compact Pagination */}
        <div className="products-pagination">
          <span className="text-gray-500 dark:text-gray-400">
            Page {page} of {lastPage} ({total} total)
          </span>
          
          <div className="flex items-center gap-1">
            <button 
              aria-label="First page"
              onClick={() => setPage(1)} 
              disabled={page === 1}
              className={`p-1.5 rounded-sm hover:bg-gray-200 dark:hover:bg-slate-700 ${page === 1 ? 'opacity-40' : ''}`}
            >
              <ChevronDoubleLeftIcon className="w-3.5 h-3.5" />
            </button>
            <button 
              aria-label="Previous page"
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
                        ? "text-white"
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
              aria-label="Next page"
              onClick={() => setPage((p) => Math.min(lastPage, p + 1))} 
              disabled={page === lastPage}
              className={`p-1.5 rounded-sm hover:bg-gray-200 dark:hover:bg-slate-700 ${page === lastPage ? 'opacity-40' : ''}`}
            >
              <ChevronRightIcon className="w-3.5 h-3.5" />
            </button>
            <button 
              aria-label="Last page"
              onClick={() => setPage(lastPage)} 
              disabled={page === lastPage}
              className={`p-1.5 rounded-sm hover:bg-gray-200 dark:hover:bg-slate-700 ${page === lastPage ? 'opacity-40' : ''}`}
            >
              <ChevronDoubleRightIcon className="w-3.5 h-3.5" />
            </button>
          </div>
        </div>
      </div>

      {/* Delete confirmation modal */}
      {deleteModalOpen && (
        <div
          className="fixed inset-0 z-50 flex items-center justify-center"
          onClick={(e) => {
            if (e.target === e.currentTarget) closeDeleteModal();
          }}
        >
          <div className="absolute inset-0 bg-black/40" />
          <div className="relative w-full max-w-md">
            <GlassCard className="purchase-invoice-delete-panel">
              <div className="flex items-center justify-between px-4 py-3 border-b border-gray-200/60 dark:border-gray-700/60">
                <div className="flex items-center gap-2">
                  <div 
                    className="p-1.5 rounded-lg"
                    style={{ backgroundColor: `${themeColors.primaryLight}40` }}
                  >
                    <ShieldExclamationIcon 
                      className="w-5 h-5" 
                      style={{ color: themeColors.primary }} 
                    />
                  </div>
                  <span className="font-semibold">Delete invoice</span>
                </div>
                <button
                  type="button"
                  className="h-8 w-8 inline-flex items-center justify-center rounded-lg text-gray-500 hover:bg-gray-100 dark:text-gray-300 dark:hover:bg-slate-700 transition-colors"
                  onClick={closeDeleteModal}
                  aria-label="Close delete confirmation"
                >
                  <XMarkIcon className="w-4 h-4" />
                </button>
              </div>
              <div className="p-4 space-y-4">
                {deleteStep === 1 && (
                  <>
                    <p className="text-sm text-gray-700 dark:text-gray-300">
                      {deletingInvoice?.posted_number ? (
                        <>Are you sure you want to delete invoice <strong>{deletingInvoice.posted_number}</strong>? </>
                      ) : "Are you sure you want to delete this invoice? "}
                      This action cannot be undone.
                    </p>
                    <div className="flex justify-end gap-2">
                      <GlassBtn 
                        className={`h-9 px-3 ${btnGlass.className}`} 
                        onClick={closeDeleteModal}
                        style={btnGlass.style}
                      >
                        Cancel
                      </GlassBtn>
                      <GlassBtn 
                        className={`h-9 px-4 ${btnDanger.className}`} 
                        onClick={proceedToPassword}
                        style={btnDanger.style}
                      >
                        Yes, continue
                      </GlassBtn>
                    </div>
                  </>
                )}

                {deleteStep === 2 && (
                  <>
                    <p className="text-sm text-gray-700 dark:text-gray-300">
                      For security, please re-enter your password to delete this invoice.
                    </p>
                    <GlassInput
                      type="password"
                      autoFocus
                      value={password}
                      onChange={(e) => setPassword(e.target.value)}
                      placeholder="Your password"
                      onKeyDown={(e) => {
                        if (e.key === "Enter") confirmAndDelete();
                        if (e.key === "Escape") closeDeleteModal();
                      }}
                      className="w-full h-9"
                    />
                    <div className="flex justify-between">
                      <GlassBtn 
                        className={`h-9 px-3 ${btnGlass.className}`} 
                        onClick={() => setDeleteStep(1)} 
                        disabled={deleting}
                        style={btnGlass.style}
                      >
                        ← Back
                      </GlassBtn>
                      <div className="flex gap-2">
                        <GlassBtn 
                          className={`h-9 px-3 ${btnGlass.className}`} 
                          onClick={closeDeleteModal} 
                          disabled={deleting}
                          style={btnGlass.style}
                        >
                          Cancel
                        </GlassBtn>
                        <GlassBtn
                          className={`h-9 px-4 ${btnDanger.className}`}
                          onClick={confirmAndDelete}
                          disabled={deleting || password.trim() === ""}
                          style={(!deleting && password.trim() !== "") ? btnDanger.style : {}}
                        >
                          {deleting ? "Deleting…" : "Confirm & Delete"}
                        </GlassBtn>
                      </div>
                    </div>
                  </>
                )}
              </div>
            </GlassCard>
          </div>
        </div>
      )}

      {/* Held Invoices & Drafts Modal */}
      <InvoiceDraftsModal
        isOpen={isDraftsOpen}
        onClose={() => setIsDraftsOpen(false)}
        drafts={draftsList}
        onResumeDraft={handleResumeDraft}
        onDiscardDraft={handleDiscardDraft}
        onStartBlank={() => navigate("/purchase-invoices/create")}
        type="purchase"
      />

      {/* Audit History Modal */}
      <DocumentHistoryModal
        isOpen={historyModalOpen}
        onClose={() => {
          setHistoryModalOpen(false);
          setHistoryTarget(null);
        }}
        entityType="purchase_invoice"
        entityId={historyTarget?.id}
        entityNumber={historyTarget?.posted_number || historyTarget?.invoice_number || `#${historyTarget?.id || ""}`}
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

      {/* Share Document Modal */}
      <ShareDocumentModal
        isOpen={Boolean(sharingInvoiceId)}
        onClose={() => setSharingInvoiceId(null)}
        documentType="purchase_invoice"
        documentId={sharingInvoiceId}
      />
    </div>
  );
}
