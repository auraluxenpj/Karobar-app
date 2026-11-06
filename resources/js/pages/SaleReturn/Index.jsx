// src/pages/sale-returns/index.jsx
import React, { useEffect, useMemo, useState, useRef, useCallback } from "react";
import { Link, useNavigate, useParams } from "react-router-dom";
import axios from "axios";
import toast from "react-hot-toast";
import {
  MagnifyingGlassIcon,
  PlusCircleIcon,
  PencilSquareIcon,
  TrashIcon,
  ArrowPathIcon,
  DocumentTextIcon,
  UserIcon,
  CalendarIcon,
  CurrencyDollarIcon,
  EyeIcon,
  XMarkIcon,
  PrinterIcon,
  ClockIcon,
  ShareIcon,
  ChevronDoubleLeftIcon,
  ChevronLeftIcon,
  ChevronRightIcon,
  ChevronDoubleRightIcon,
} from "@heroicons/react/24/solid";
import { usePermissions, Guard } from "@/api/usePermissions.js";
import DocumentHistoryModal from "@/components/DocumentHistoryModal.jsx";
import ShareDocumentModal from "@/components/ShareDocumentModal.jsx";

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

export default function SaleReturnsIndex() {
  const [returns, setReturns] = useState([]);
  const [loading, setLoading] = useState(true);

  // search + pagination
  const [qPosted, setQPosted] = useState("");
  const [qCustomer, setQCustomer] = useState("");
  const [page, setPage] = useState(1);
  const [pageSize, setPageSize] = useState(10);
  const [total, setTotal] = useState(0);

  // Delete modal state
  const [deleteModalOpen, setDeleteModalOpen] = useState(false);
  const [deletingReturn, setDeletingReturn] = useState(null);
  const [deleting, setDeleting] = useState(false);

  // Read-only View modal state
  const [viewingReturn, setViewingReturn] = useState(null);
  const [loadingView, setLoadingView] = useState(false);
  const [historyOpen, setHistoryOpen] = useState(false);
  const [shareOpen, setShareOpen] = useState(false);

  const navigate = useNavigate();
  const { id: routeReturnId } = useParams();

  // AbortController for fetches
  const controllerRef = useRef(null);

  // permissions
  const { loading: permsLoading, canFor } = usePermissions();
  const can = useMemo(
    () =>
      (typeof canFor === "function" ? canFor("sale-return") : {
        view: false, create: false, update: false, delete: false, import: false, export: false
      }),
    [canFor]
  );

  // Get theme colors
  const { theme, isDark } = useTheme();

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

  // Get button style from theme
  const buttonStyle = theme?.button_style || 'modern';

  const getButtonClasses = useMemo(
    () => getThemeButtonClasses(buttonStyle, themeColors, isDark),
    [buttonStyle, themeColors, isDark]
  );

  const btnPrimary = getButtonClasses.primary;
  const btnSecondary = getButtonClasses.secondary;
  const btnDanger = getButtonClasses.danger;
  const btnGlass = getButtonClasses.glass;

  // Fetch returns
  const fetchReturns = useCallback(async (signal) => {
    if (permsLoading || !can.view) {
      setReturns([]);
      setLoading(false);
      return;
    }
    try {
      setLoading(true);
      const res = await axios.get("/api/sale-returns", { signal });
      const data = Array.isArray(res.data) ? res.data : (Array.isArray(res.data?.data) ? res.data.data : []);
      setReturns(data);
      setTotal(res.data?.total ?? data.length);
    } catch (e) {
      if (axios.isCancel?.(e)) return;
      const status = e?.response?.status;
      if (status === 403) toast.error("You don't have permission to view sale returns.");
      else toast.error("Failed to fetch sale returns");
      setReturns([]);
    } finally {
      setLoading(false);
    }
  }, [permsLoading, can.view]);

  // Initial fetch
  useEffect(() => {
    if (permsLoading || !can.view) return;
    const ctrl = new AbortController();
    controllerRef.current = ctrl;
    fetchReturns(ctrl.signal);
    return () => ctrl.abort();
  }, [fetchReturns, permsLoading, can.view]);

  // Alt+N -> create
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
      navigate("/sale-returns/create");
    };
    window.addEventListener("keydown", onKeyDown);
    return () => window.removeEventListener("keydown", onKeyDown);
  }, [navigate, can.create]);

  // ===== search + pagination =====
  const norm = (v) => (v ?? "").toString().toLowerCase().trim();
  const filtered = useMemo(() => {
    const nPosted = norm(qPosted);
    const nCust = norm(qCustomer);
    return returns.filter((r) => {
      const posted = norm(r.posted_number);
      const customer = norm(r.customer?.name);
      return posted.includes(nPosted) && customer.includes(nCust);
    });
  }, [returns, qPosted, qCustomer]);

  useEffect(() => { setPage(1); }, [qPosted, qCustomer]);

  const pageCount = Math.max(1, Math.ceil(filtered.length / pageSize));
  useEffect(() => { if (page > pageCount) setPage(pageCount); }, [page, pageCount]);

  const start = (page - 1) * pageSize;
  const paged = filtered.slice(start, start + pageSize);

  // ===== delete modal handlers =====
  const openDeleteModal = (ret) => {
    if (!can.delete) return toast.error("You don't have permission to delete sale returns.");
    setDeletingReturn({ id: ret.id, name: ret.posted_number });
    setDeleteModalOpen(true);
  };

  const closeDeleteModal = () => {
    setDeleteModalOpen(false);
    setDeletingReturn(null);
  };

  const handleConfirmDelete = async (password) => {
    if (!deletingReturn?.id) return;
    if (!can.delete) return toast.error("You don't have permission to delete sale returns.");

    try {
      await axios.post("/api/auth/confirm-password", { password });
      await axios.delete(`/api/sale-returns/${deletingReturn.id}`);
      toast.success("Sale return deleted");
      if (typeof window !== "undefined") {
        window.dispatchEvent(new CustomEvent("cash-drawer-changed"));
      }
      closeDeleteModal();

      if (controllerRef.current) controllerRef.current.abort();
      const ctrl = new AbortController();
      controllerRef.current = ctrl;
      fetchReturns(ctrl.signal);
    } catch (err) {
      const status = err?.response?.status;
      const apiMsg =
        err?.response?.data?.message ||
        (status === 422 ? "Incorrect password" : status === 403 ? "You don't have permission to delete sale returns." : "Failed to delete sale return");
      toast.error(apiMsg);
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

  // Check if has actions
  const hasActions = can.view || can.update || can.delete;

  const handleOpenView = useCallback(async (returnId) => {
    if (!returnId) return;
    setLoadingView(true);
    try {
      const { data } = await axios.get(`/api/sale-returns/${returnId}`);
      setViewingReturn(data);
    } catch {
      toast.error("Failed to load sale return details");
    } finally {
      setLoadingView(false);
    }
  }, []);

  const handleCloseView = useCallback(() => {
    setViewingReturn(null);
    if (routeReturnId) {
      navigate("/sale-returns", { replace: true });
    }
  }, [routeReturnId, navigate]);

  useEffect(() => {
    if (routeReturnId && !permsLoading && can.view) {
      handleOpenView(routeReturnId);
    }
  }, [routeReturnId, permsLoading, can.view, handleOpenView]);

  if (permsLoading) return <div className="p-6">Loading…</div>;
  if (!can.view) return <div className="p-6 text-sm text-gray-700">You don't have permission to view sale returns.</div>;

  return (
    <div className="p-4 space-y-3">
      {/* ===== Premium Gradient Hero Header ===== */}
      <div
        className="sale-list-header relative overflow-hidden"

      >
        {/* Decorative blurred blobs */}
        <div
          className="absolute -top-16 -right-16 w-64 h-64 rounded-full opacity-30 blur-3xl pointer-events-none"
          style={{ backgroundColor: "#ffffff" }}
        />
        <div
          className="absolute -bottom-20 -left-10 w-72 h-72 rounded-full opacity-20 blur-3xl pointer-events-none"
          style={{ backgroundColor: themeColors.tertiary }}
        />

        {/* Hero Top */}
        <div className="relative flex flex-wrap items-center justify-between gap-2 px-5 py-4">
          <div className="flex items-center gap-3">
            <div
              className="p-2.5 rounded-xl shadow-inner"
              style={{ backgroundColor: "rgba(255,255,255,0.18)", backdropFilter: "blur(4px)" }}
            >
              <DocumentTextIcon className="w-6 h-6 text-white" />
            </div>
            <div>
              <h1 className="text-xl font-extrabold tracking-wide text-white leading-none">Sale Returns</h1>
              <p className="text-xs text-white/80 mt-1">{total} return(s) in records</p>
            </div>
          </div>

          {/* Action Buttons */}
          <div className="flex flex-wrap items-center gap-2">
            <button
              onClick={() => {
                if (controllerRef.current) controllerRef.current.abort();
                const ctrl = new AbortController();
                controllerRef.current = ctrl;
                fetchReturns(ctrl.signal);
              }}
              className="products-action theme-btn-tertiary"
              title="Refresh"
              aria-label="Refresh sale returns"
            >
              <ArrowPathIcon className="w-4 h-4" />
              <span>Refresh</span>
            </button>

            <Guard when={can.create}>
              <Link
                to="/sale-returns/create"
                title="Add Sale Return (Alt+N)"
                aria-keyshortcuts="Alt+N"
                className="products-action products-action-primary theme-btn-primary"
              >
                <PlusCircleIcon className="w-4 h-4" />
                <span>Add Return</span>
              </Link>
            </Guard>
          </div>
        </div>

        {/* Integrated Search Bar */}
        <div className="relative px-5 pb-4">
          <div className="grid grid-cols-1 md:grid-cols-2 gap-3 rounded-xl p-3"
            style={{ backgroundColor: "rgba(255,255,255,0.12)", backdropFilter: "blur(8px)", border: "1px solid rgba(255,255,255,0.15)" }}>
            <div className="relative">
              <div className="absolute inset-y-0 left-3 flex items-center pointer-events-none">
                <DocumentTextIcon className="w-4 h-4 text-white/70" />
              </div>
              <input
                type="text"
                aria-label="Search by posted number"
                value={qPosted}
                onChange={(e) => setQPosted(e.target.value)}
                placeholder="Search by Posted No (e.g., SR-000001 or SRRET-0001)…"
                className="w-full h-10 pl-9 pr-3 rounded-lg text-sm text-white placeholder-white/60 bg-white/15 border border-white/20 backdrop-blur-xs focus:outline-hidden focus:ring-2 focus:ring-white/40"
                autoComplete="off"
              />
            </div>
            <div className="relative">
              <div className="absolute inset-y-0 left-3 flex items-center pointer-events-none">
                <UserIcon className="w-4 h-4 text-white/70" />
              </div>
              <input
                type="text"
                aria-label="Search by customer"
                value={qCustomer}
                onChange={(e) => setQCustomer(e.target.value)}
                placeholder="Search by Customer…"
                className="w-full h-10 pl-9 pr-3 rounded-lg text-sm text-white placeholder-white/60 bg-white/15 border border-white/20 backdrop-blur-xs focus:outline-hidden focus:ring-2 focus:ring-white/40"
                autoComplete="off"
              />
            </div>
          </div>
        </div>
      </div>

      {/* ===== Returns Table Card ===== */}
      <div className="sale-list-table rounded-2xl overflow-hidden">
        {/* Table Header */}
        <div className="flex items-center justify-between px-4 py-3 bg-gray-50/70 dark:bg-slate-800/70 border-b border-gray-200 dark:border-slate-700">
          <div className="flex items-center gap-2">
            <div className="p-1.5 rounded-lg shadow-xs" style={{ background: `linear-gradient(to bottom right, ${themeColors.secondary}, ${themeColors.secondaryHover})` }}>
              <DocumentTextIcon className="w-4 h-4 text-white" />
            </div>
            <div>
              <span className="text-sm font-semibold text-gray-800 dark:text-gray-200">Return List</span>
              <p className="text-[11px] text-gray-400">
                {loading ? "Loading…" : `${start + 1}-${Math.min(filtered.length, start + pageSize)} of ${filtered.length}`}
              </p>
            </div>
          </div>

          {/* Page Size Selector */}
          <div className="flex items-center gap-1.5 px-2 py-1 rounded-lg bg-white/70 dark:bg-slate-700/60 border border-gray-200 dark:border-slate-600/40">
            <label className="text-xs font-medium text-gray-500 dark:text-gray-400">Show</label>
            <select
              value={pageSize}
              onChange={(e) => setPageSize(Number(e.target.value))}
              className="h-7 px-2 rounded-sm border-gray-200 dark:border-slate-600 bg-white dark:bg-slate-700 text-xs font-medium text-gray-700 dark:text-gray-200 focus:ring-2 focus:border-transparent cursor-pointer"
              style={{ '--tw-ring-color': themeColors.primary }}
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
                <th className="px-3 py-2 font-semibold text-gray-600 dark:text-gray-300 text-xs uppercase tracking-wider">Posted No</th>
                <th className="px-3 py-2 font-semibold text-gray-600 dark:text-gray-300 text-xs uppercase tracking-wider">Customer</th>
                <th className="px-3 py-2 font-semibold text-gray-600 dark:text-gray-300 text-xs uppercase tracking-wider">Date</th>
                <th className="px-3 py-2 font-semibold text-right text-gray-600 dark:text-gray-300 text-xs uppercase tracking-wider">Amount</th>
                {hasActions && (
                  <th className="px-3 py-2 font-semibold text-center text-gray-600 dark:text-gray-300 text-xs uppercase tracking-wider w-32">Actions</th>
                )}
              </tr>
            </thead>

            <tbody>
              {paged.length === 0 && !loading && (
                <tr>
                  <td className="px-3 py-12 text-center" colSpan={hasActions ? 6 : 5}>
                    <div className="flex flex-col items-center gap-2">
                      <DocumentTextIcon className="w-8 h-8 text-gray-400" />
                      <p className="text-sm text-gray-500 dark:text-gray-400">No returns found</p>
                    </div>
                  </td>
                </tr>
              )}

              {loading && (
                <tr>
                  <td className="px-3 py-12 text-center" colSpan={hasActions ? 6 : 5}>
                    <div className="flex flex-col items-center gap-2">
                      <ArrowPathIcon className="w-6 h-6 text-gray-400 animate-spin" />
                      <p className="text-sm text-gray-500 dark:text-gray-400">Loading...</p>
                    </div>
                  </td>
                </tr>
              )}

              {paged.map((ret, idx) => {
                const retTotal = Number(ret.total ?? 0);

                return (
                  <tr
                    key={ret.id}
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
                      <button
                        type="button"
                        onClick={() => handleOpenView(ret.id)}
                        className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-lg text-xs font-medium hover:opacity-85 transition-opacity cursor-pointer"
                        style={{
                          backgroundColor: themeColors.secondaryLight,
                          color: themeColors.secondary
                        }}
                        title="View Sale Return Details"
                      >
                        <DocumentTextIcon className="w-3.5 h-3.5" />
                        {ret.posted_number || "-"}
                      </button>
                    </td>
                    <td className="px-3 py-3">
                      <div className="flex items-center gap-2">
                        <UserIcon 
                          className="w-4 h-4" 
                          style={{ color: themeColors.tertiary }}
                        />
                        <span className="text-gray-800 dark:text-gray-200">{ret.customer?.name ?? "N/A"}</span>
                      </div>
                    </td>
                    <td className="px-3 py-3">
                      <div className="flex items-center gap-2">
                        <CalendarIcon 
                          className="w-4 h-4" 
                          style={{ color: themeColors.tertiary }}
                        />
                        <span className="text-gray-800 dark:text-gray-200">{formatDate(ret.date)}</span>
                      </div>
                    </td>
                    <td className="px-3 py-3 text-right">
                      <div className="flex items-center justify-end gap-1">
                        <CurrencyDollarIcon 
                          className="w-4 h-4" 
                          style={{ color: themeColors.primary }}
                        />
                        <span className="font-semibold text-gray-800 dark:text-gray-200">
                          {retTotal.toLocaleString()}
                        </span>
                      </div>
                    </td>
                    {hasActions && (
                      <td className="px-3 py-3">
                        <div className="flex items-center gap-1.5 justify-center">
                          {/* View Action */}
                          <Guard when={can.view}>
                            <button
                              type="button"
                              onClick={() => handleOpenView(ret.id)}
                              className="products-row-action"
                              title="View"
                              aria-label="View sale return"
                            >
                              <EyeIcon className="w-3.5 h-3.5 transition-transform group-hover:scale-110" />
                            </button>
                          </Guard>

                          {/* Edit Action */}
                          <Guard when={can.update}>
                            <Link
                              to={`/sale-returns/${ret.id}/edit`}
                              className="products-row-action"
                              title="Edit" aria-label="Edit sale return"
                            >
                              <PencilSquareIcon className="w-3.5 h-3.5 transition-transform group-hover:scale-110" />

                            </Link>
                          </Guard>

                          {/* Delete Action */}
                          <Guard when={can.delete}>
                            <button
                              onClick={() => openDeleteModal(ret)}
                              className="products-row-action products-row-action-danger"
                              title="Delete" aria-label="Delete sale return"
                            >
                              <TrashIcon className="w-3.5 h-3.5 transition-transform group-hover:scale-110" />

                            </button>
                          </Guard>
                        </div>
                      </td>
                    )}
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>

        {/* Compact Pagination */}
        <div className="px-3 py-2 flex flex-wrap items-center justify-between gap-2 border-t border-gray-200 dark:border-slate-700 bg-gray-50 dark:bg-slate-800/50 text-xs">
          <span className="text-gray-500 dark:text-gray-400">
            Page {page} of {pageCount} ({filtered.length} total)
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
              {Array.from({ length: Math.min(5, pageCount) }, (_, i) => {
                let pageNum;
                if (pageCount <= 5) {
                  pageNum = i + 1;
                } else if (page <= 3) {
                  pageNum = i + 1;
                } else if (page >= pageCount - 2) {
                  pageNum = pageCount - 4 + i;
                } else {
                  pageNum = page - 2 + i;
                }
                return (
                  <button
                    key={pageNum}
                    onClick={() => setPage(pageNum)}
                    className={`
                      w-7 h-7 rounded text-xs font-medium transition-all duration-200
                      ${page === pageNum
                        ? "text-white"
                        : "text-gray-600 dark:text-gray-300 hover:bg-gray-200 dark:hover:bg-slate-700"
                      }
                    `}
                    style={page === pageNum ? { backgroundColor: themeColors.secondary, color: '#fff' } : {}}
                  >
                    {pageNum}
                  </button>
                );
              })}
            </div>

            <button
              onClick={() => setPage((p) => Math.min(pageCount, p + 1))}
              disabled={page === pageCount}
              className={`p-1.5 rounded-sm hover:bg-gray-200 dark:hover:bg-slate-700 ${page === pageCount ? 'opacity-40' : ''}`}
            >
              <ChevronRightIcon className="w-3.5 h-3.5" />
            </button>
            <button
              onClick={() => setPage(pageCount)}
              disabled={page === pageCount}
              className={`p-1.5 rounded-sm hover:bg-gray-200 dark:hover:bg-slate-700 ${page === pageCount ? 'opacity-40' : ''}`}
            >
              <ChevronDoubleRightIcon className="w-3.5 h-3.5" />
            </button>
          </div>
        </div>
      </div>

      {/* Read-Only Sale Return View Modal */}
      {(viewingReturn || loadingView) && (
        <div
          className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/60 backdrop-blur-sm overflow-y-auto"
          onClick={(e) => {
            if (e.target === e.currentTarget) handleCloseView();
          }}
        >
          <GlassCard
            className={`w-full max-w-4xl border shadow-2xl rounded-2xl overflow-hidden my-8 ${
              isDark ? "bg-slate-900 border-slate-700 text-slate-100" : "bg-white border-gray-200 text-gray-900"
            }`}
          >
            <div
              className={`flex flex-wrap items-center justify-between gap-2 px-6 py-4 border-b ${
                isDark ? "border-slate-700 bg-slate-800/60" : "border-gray-200 bg-gray-50"
              }`}
            >
              <div className="flex items-center gap-2.5">
                <DocumentTextIcon className="w-5 h-5" style={{ color: themeColors.secondary }} />
                <div>
                  <h3 className="font-bold text-base">
                    Sale Return Details — {viewingReturn?.posted_number || "Loading…"}
                  </h3>
                  {viewingReturn && (
                    <p className={`text-xs ${isDark ? "text-slate-400" : "text-gray-500"}`}>
                      Date: {formatDate(viewingReturn.date)} · Customer:{" "}
                      <span className="font-semibold">{viewingReturn.customer?.name || "N/A"}</span>
                    </p>
                  )}
                </div>
              </div>
              <div className="flex flex-wrap items-center gap-2">
                {viewingReturn && (
                  <>
                    <button
                      type="button"
                      onClick={() => setHistoryOpen(true)}
                      className={`inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-semibold border transition-colors ${
                        isDark ? "border-slate-600 text-slate-200 hover:bg-slate-700" : "border-gray-300 text-gray-700 hover:bg-gray-100"
                      }`}
                    >
                      <ClockIcon className="w-3.5 h-3.5" />
                      History
                    </button>
                    <button
                      type="button"
                      onClick={() => window.print()}
                      className={`inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-semibold border transition-colors ${
                        isDark ? "border-slate-600 text-slate-200 hover:bg-slate-700" : "border-gray-300 text-gray-700 hover:bg-gray-100"
                      }`}
                    >
                      <PrinterIcon className="w-3.5 h-3.5" />
                      Print
                    </button>
                    <button
                      type="button"
                      onClick={() => setShareOpen(true)}
                      className={`inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-semibold border transition-colors ${
                        isDark ? "border-slate-600 text-slate-200 hover:bg-slate-700" : "border-gray-300 text-gray-700 hover:bg-gray-100"
                      }`}
                    >
                      <ShareIcon className="w-3.5 h-3.5" />
                      PDF / Share
                    </button>
                    {can.update && (
                      <Link
                        to={`/sale-returns/${viewingReturn.id}/edit`}
                        className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-semibold text-white transition-opacity hover:opacity-90"
                        style={{ backgroundColor: themeColors.primary }}
                      >
                        <PencilSquareIcon className="w-3.5 h-3.5" />
                        Edit
                      </Link>
                    )}
                  </>
                )}
                <button
                  type="button"
                  onClick={handleCloseView}
                  className={`p-1.5 rounded-lg transition-colors ${
                    isDark ? "hover:bg-slate-700 text-slate-400" : "hover:bg-gray-200 text-gray-500"
                  }`}
                >
                  <XMarkIcon className="w-5 h-5" />
                </button>
              </div>
            </div>

            {loadingView || !viewingReturn ? (
              <div className="py-16 text-center text-sm text-gray-400">
                <ArrowPathIcon className="w-6 h-6 mx-auto animate-spin mb-2" />
                Loading sale return details…
              </div>
            ) : (
              <div className="p-6 space-y-5">
                <div className="grid grid-cols-2 md:grid-cols-4 gap-3 text-xs">
                  <div className={`p-3 rounded-xl border ${isDark ? "bg-slate-800/50 border-slate-700" : "bg-gray-50 border-gray-200"}`}>
                    <span className="block text-gray-400 uppercase tracking-wider text-[10px]">Customer</span>
                    <span className="font-semibold text-sm">{viewingReturn.customer?.name || "N/A"}</span>
                  </div>
                  <div className={`p-3 rounded-xl border ${isDark ? "bg-slate-800/50 border-slate-700" : "bg-gray-50 border-gray-200"}`}>
                    <span className="block text-gray-400 uppercase tracking-wider text-[10px]">Original Sale Invoice</span>
                    <span className="font-semibold text-sm font-mono">
                      {viewingReturn.sale_invoice?.posted_number || viewingReturn.saleInvoice?.posted_number || "Standalone Return"}
                    </span>
                  </div>
                  <div className={`p-3 rounded-xl border ${isDark ? "bg-slate-800/50 border-slate-700" : "bg-gray-50 border-gray-200"}`}>
                    <span className="block text-gray-400 uppercase tracking-wider text-[10px]">Settlement Mode</span>
                    <span className="font-semibold text-sm capitalize">
                      {(viewingReturn.settlement_mode || "cash_refund").replace("_", " ")}
                    </span>
                  </div>
                  <div className={`p-3 rounded-xl border ${isDark ? "bg-slate-800/50 border-slate-700" : "bg-gray-50 border-gray-200"}`}>
                    <span className="block text-gray-400 uppercase tracking-wider text-[10px]">Remarks</span>
                    <span className="font-medium text-sm">{viewingReturn.remarks || "—"}</span>
                  </div>
                </div>

                <div className={`rounded-xl border overflow-x-auto ${isDark ? "border-slate-700" : "border-gray-200"}`}>
                  <table className="w-full text-xs text-left">
                    <thead className={isDark ? "bg-slate-800 text-slate-300 border-b border-slate-700" : "bg-gray-50 text-gray-600 border-b border-gray-200"}>
                      <tr>
                        <th className="px-3 py-2.5 font-semibold">#</th>
                        <th className="px-3 py-2.5 font-semibold">Product</th>
                        <th className="px-3 py-2.5 font-semibold">Batch</th>
                        <th className="px-3 py-2.5 font-semibold">Expiry</th>
                        <th className="px-3 py-2.5 font-semibold text-right">Sold Qty</th>
                        <th className="px-3 py-2.5 font-semibold text-right">Return Qty</th>
                        <th className="px-3 py-2.5 font-semibold text-right">Unit Price</th>
                        <th className="px-3 py-2.5 font-semibold text-right">Disc %</th>
                        <th className="px-3 py-2.5 font-semibold text-right">Sub Total</th>
                      </tr>
                    </thead>
                    <tbody className={`divide-y ${isDark ? "divide-slate-700/60" : "divide-gray-100"}`}>
                      {(viewingReturn.items || []).map((it, i) => (
                        <tr key={it.id || i}>
                          <td className="px-3 py-2.5">{i + 1}</td>
                          <td className="px-3 py-2.5 font-medium">{it.product?.name || `#${it.product_id}`}</td>
                          <td className="px-3 py-2.5 font-mono">{it.batch_number || "—"}</td>
                          <td className="px-3 py-2.5">{it.expiry ? formatDate(it.expiry) : "—"}</td>
                          <td className="px-3 py-2.5 text-right font-mono">{it.unit_sale_quantity ?? 0}</td>
                          <td className="px-3 py-2.5 text-right font-mono font-bold">{it.unit_return_quantity ?? 0}</td>
                          <td className="px-3 py-2.5 text-right font-mono">{Number(it.unit_sale_price || 0).toLocaleString()}</td>
                          <td className="px-3 py-2.5 text-right font-mono">{Number(it.item_discount_percentage || 0)}%</td>
                          <td className="px-3 py-2.5 text-right font-mono font-semibold">{Number(it.sub_total || 0).toLocaleString()}</td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>

                <div className="flex flex-wrap items-center justify-end gap-6 pt-2 text-xs">
                  <div>
                    <span className="text-gray-400 block uppercase">Gross Total</span>
                    <span className="font-mono font-semibold text-sm">{Number(viewingReturn.gross_total || 0).toLocaleString()}</span>
                  </div>
                  <div>
                    <span className="text-gray-400 block uppercase">Discount</span>
                    <span className="font-mono font-semibold text-sm">{Number(viewingReturn.discount_amount || 0).toLocaleString()}</span>
                  </div>
                  <div>
                    <span className="text-gray-400 block uppercase">Tax</span>
                    <span className="font-mono font-semibold text-sm">{Number(viewingReturn.tax_amount || 0).toLocaleString()}</span>
                  </div>
                  <div>
                    <span className="text-gray-400 block uppercase">Net Return Total</span>
                    <span className="font-mono font-bold text-base" style={{ color: themeColors.primary }}>
                      {Number(viewingReturn.total || 0).toLocaleString()}
                    </span>
                  </div>
                </div>
              </div>
            )}
          </GlassCard>
        </div>
      )}

      {/* Delete Confirmation Modal */}
      <DeleteConfirmationModal
        isOpen={deleteModalOpen}
        onClose={closeDeleteModal}
        onConfirm={handleConfirmDelete}
        itemName={deletingReturn?.name || "this return"}
        title="Delete sale return"
        isDeleting={deleting}
        setIsDeleting={setDeleting}
        tintClasses={{ 
          red: btnDanger.className,
          glass: btnGlass.className
        }}
      />

      <DocumentHistoryModal
        isOpen={historyOpen && Boolean(viewingReturn?.id)}
        onClose={() => setHistoryOpen(false)}
        entityType="sale_return"
        entityId={viewingReturn?.id}
        documentNumber={viewingReturn?.posted_number || ""}
      />

      <ShareDocumentModal
        isOpen={shareOpen && Boolean(viewingReturn?.id)}
        onClose={() => setShareOpen(false)}
        documentType="sale_return"
        documentId={viewingReturn?.id}
      />
    </div>
  );
}

