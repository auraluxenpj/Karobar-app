// src/pages/stock-adjustments/index.jsx
import React, { useEffect, useMemo, useState, useRef, useCallback } from "react";
import { Link, useNavigate } from "react-router-dom";
import axios from "axios";
import toast from "react-hot-toast";
import {
  MagnifyingGlassIcon,
  PlusCircleIcon,
  TrashIcon,
  ArrowPathIcon,
  DocumentTextIcon,
  CalendarIcon,
  ClipboardDocumentListIcon,
  CurrencyDollarIcon,
  ChevronLeftIcon,
  ChevronRightIcon,
  ChevronDoubleLeftIcon,
  ChevronDoubleRightIcon,
  EyeIcon,
} from "@heroicons/react/24/solid";
import { usePermissions, Guard } from "@/api/usePermissions.js";

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
const SECTION_CONFIG = {
  core: {
    key: 'primary',
  },
  management: {
    key: 'secondary',
  },
};

// Helper to get color value from theme
const getThemeColor = (theme, colorKey, variant = 'color') => {
  if (!theme) return '#3b82f6';
  const key = `${colorKey}_${variant}`;
  return theme[key] || '#3b82f6';
};

// Helper to generate section styles from theme
const getSectionStyles = (theme, colorKey) => {
  const baseColor = getThemeColor(theme, colorKey, 'color');
  const hoverColor = getThemeColor(theme, colorKey, 'hover');
  const lightColor = getThemeColor(theme, colorKey, 'light');
  
  return {
    gradient: `from-[${baseColor}] to-[${hoverColor}]`,
    bgLight: `bg-[${lightColor}]`,
    bgDark: `dark:bg-[${lightColor}]`,
    borderColor: `border-[${baseColor}]/30 dark:border-[${baseColor}]/30`,
    iconColor: `text-[${baseColor}] dark:text-[${baseColor}]`,
    ringColor: `ring-[${baseColor}]/30`,
  };
};

export default function StockAdjustmentsIndex() {
  const [rows, setRows] = useState([]);
  const [loading, setLoading] = useState(true);

  // search + pagination
  const [q, setQ] = useState("");
  const [page, setPage] = useState(1);
  const [pageSize, setPageSize] = useState(10);
  const [total, setTotal] = useState(0);

  // Delete modal state
  const [deleteModalOpen, setDeleteModalOpen] = useState(false);
  const [deletingAdjustment, setDeletingAdjustment] = useState(null);
  const [deleting, setDeleting] = useState(false);

  const navigate = useNavigate();

  // AbortController for fetches
  const controllerRef = useRef(null);

  // permissions
  const { loading: permsLoading, canFor } = usePermissions();
  const can = useMemo(
    () =>
      (typeof canFor === "function" ? canFor("stock-adjustment") : {
        view: false, create: false, update: false, delete: false, import: false, export: false
      }),
    [canFor]
  );

  // Get dark mode state and theme colors
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
        tertiary: '#06b6d4',
        tertiaryHover: '#0891b2',
        tertiaryLight: '#cffafe',
        danger: '#ef4444',
        dangerHover: '#dc2626',
        dangerLight: '#fee2e2',
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

  const getButtonClasses = useMemo(
    () => getThemeButtonClasses(buttonStyle, themeColors, isDark, primaryTextColor),
    [buttonStyle, themeColors, isDark, primaryTextColor]
  );

  const btnPrimary = getButtonClasses.primary;
  const btnSecondary = getButtonClasses.secondary;
  const btnDanger = getButtonClasses.danger;

  // Get section styles for management (secondary)
  const managementStyles = useMemo(() => getSectionStyles(themeColors, 'secondary'), [themeColors]);

  // Fetch stock adjustments
  const fetchAdjustments = useCallback(async (signal) => {
    if (permsLoading || !can.view) {
      setRows([]);
      setLoading(false);
      return;
    }
    try {
      setLoading(true);
      const { data } = await axios.get("/api/stock-adjustments", { params: { per_page: 1000 }, signal });
      const items = Array.isArray(data?.data) ? data.data : data;
      setRows(items);
      setTotal(items.length);
    } catch (e) {
      if (axios.isCancel?.(e)) return;
      const status = e?.response?.status;
      if (status === 403) toast.error("You don't have permission to view stock adjustments.");
      else toast.error("Failed to fetch stock adjustments");
      setRows([]);
    } finally {
      setLoading(false);
    }
  }, [permsLoading, can.view]);

  // Initial fetch
  useEffect(() => {
    if (permsLoading || !can.view) return;
    const ctrl = new AbortController();
    controllerRef.current = ctrl;
    fetchAdjustments(ctrl.signal);
    return () => ctrl.abort();
  }, [fetchAdjustments, permsLoading, can.view]);

  // Ctrl+N -> create
  useEffect(() => {
    const onKeyDown = (e) => {
      if (e.defaultPrevented) return;
      if (!(e.ctrlKey || e.metaKey) || e.altKey || e.shiftKey) return;
      const key = (e.key || "").toLowerCase();
      if (key !== "n") return;
      if (!can.create) return;
      e.preventDefault();
      navigate("/stock-adjustments/create");
    };
    window.addEventListener("keydown", onKeyDown);
    return () => window.removeEventListener("keydown", onKeyDown);
  }, [navigate, can.create]);

  // ===== search + pagination =====
  const filtered = useMemo(() => {
    const n = (v) => (v ?? "").toString().toLowerCase().trim();
    const qn = n(q);
    return (rows || []).filter(r => n(r.posted_number).includes(qn) || n(r.note).includes(qn));
  }, [rows, q]);

  useEffect(() => { setPage(1); }, [q]);

  const start = (page - 1) * pageSize;
  const paged = filtered.slice(start, start + pageSize);
  const pageCount = Math.max(1, Math.ceil(filtered.length / pageSize));

  // ===== delete modal handlers =====
  const openDeleteModal = (adj) => {
    if (!can.delete) return toast.error("You don't have permission to delete stock adjustments.");
    setDeletingAdjustment({ id: adj.id, name: adj.posted_number });
    setDeleteModalOpen(true);
  };

  const closeDeleteModal = () => {
    setDeleteModalOpen(false);
    setDeletingAdjustment(null);
  };

  const handleConfirmDelete = async (password) => {
    if (!deletingAdjustment?.id) return;
    if (!can.delete) return toast.error("You don't have permission to delete stock adjustments.");

    try {
      await axios.post("/api/auth/confirm-password", { password });
      await axios.delete(`/api/stock-adjustments/${deletingAdjustment.id}`);
      toast.success("Stock adjustment deleted");
      setRows((prev) => prev.filter((r) => r.id !== deletingAdjustment.id));
      closeDeleteModal();

      if (controllerRef.current) controllerRef.current.abort();
      const ctrl = new AbortController();
      controllerRef.current = ctrl;
      fetchAdjustments(ctrl.signal);
    } catch (err) {
      const status = err?.response?.status;
      const apiMsg =
        err?.response?.data?.message ||
        (status === 422 ? "Incorrect password" : status === 403 ? "You don't have permission to delete stock adjustments." : "Delete failed");
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

  // Check if has actions (edit disabled - adjustments are immutable audit records)
  const hasActions = can.view || can.delete;

  if (permsLoading) return <div className="p-6">Loading…</div>;
  if (!can.view) return <div className="p-6 text-sm text-gray-700">You don't have permission to view stock adjustments.</div>;

  return (
    <div className="stock-adjustments-page space-y-4">
      {/* ===== Premium Hero Header ===== */}
      <div
        className="stock-adjustments-header products-panel"
      >
        {/* Decorative blurred blobs */}

        {/* Top row */}
        <div className="relative px-6 pt-5 pb-4 flex flex-col lg:flex-row lg:items-center justify-between gap-4">
          <div className="flex items-center gap-4">
            <div className="products-identity-icon">
              <ClipboardDocumentListIcon className="w-6 h-6 text-white" />
            </div>
            <div>
              <h1 className="products-title">Stock Adjustments</h1>
              <p className="products-subtitle">
                <ClipboardDocumentListIcon className="w-3.5 h-3.5" />
                {total} adjustments
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
                fetchAdjustments(ctrl.signal);
              }}
              title="Refresh"
              className="products-action theme-btn-tertiary"
              disabled={loading}
              aria-label="Refresh adjustments"
            >
              <ArrowPathIcon className="w-3.5 h-3.5" />
              <span>Refresh</span>
            </button>

            <Guard when={can.create}>
              <Link
                to="/stock-adjustments/create"
                title="Add (Ctrl+N)"
                aria-keyshortcuts="Control+N"
                className="products-action products-action-primary theme-btn-primary"
              >
                <PlusCircleIcon className="w-4 h-4" />
                <span>Add adjustment</span>
              </Link>
            </Guard>
          </div>
        </div>

        {/* Filter bar integrated in hero */}
        <div className="relative px-6 pt-2 pb-5">
          <div className="stock-adjustments-filters flex items-center gap-3 rounded-xl p-3">
            <div className="flex-1 flex items-center gap-2">
              <MagnifyingGlassIcon className="w-4 h-4 text-white/80 shrink-0" />
              <GlassInput
                value={q}
                onChange={(e) => { setQ(e.target.value); setPage(1); }}
                placeholder="Search by posted number or note…"
                aria-label="Search stock adjustments"
                className="w-full"
              />
            </div>
            {/* Stats + Page Size */}
            <div className="flex items-center gap-3 shrink-0">
              <span className="text-xs text-white/85 whitespace-nowrap hidden md:inline">
                {loading ? (
                  <span className="inline-flex items-center gap-1">
                    <ArrowPathIcon className="w-3.5 h-3.5 animate-spin" />
                    Loading...
                  </span>
                ) : (
                  `${filtered.length === 0 ? 0 : start + 1}-${Math.min(filtered.length, start + pageSize)} of ${total}`
                )}
              </span>

              {/* Page Size Selector */}
              <div className="flex items-center gap-1.5 px-2 py-1 rounded-lg bg-white/20 backdrop-blur-sm border border-white/25">
                <label className="text-xs font-medium text-white/85">Show</label>
                <select
                  value={pageSize}
                  aria-label="Adjustments per page"
                  onChange={(e) => setPageSize(Number(e.target.value))}
                  className="h-7 px-2 rounded-sm bg-white dark:bg-slate-700 text-xs font-medium text-gray-700 dark:text-gray-200 focus:ring-2 focus:ring-white/50 focus:border-transparent cursor-pointer"
                >
                  <option value={10}>10</option>
                  <option value={25}>25</option>
                  <option value={50}>50</option>
                  <option value={100}>100</option>
                </select>
              </div>
            </div>
          </div>
        </div>
      </div>

{/* ===== Stock Adjustments Table ===== */}
      <div className="stock-adjustments-table sale-list-table products-panel overflow-hidden">
        {/* Table Header */}
        <div className="flex items-center justify-between px-4 py-3 border-b border-gray-100 dark:border-slate-700">
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
              <span className="text-sm font-semibold text-gray-700 dark:text-gray-200">Adjustment List</span>
              <p className="text-[11px] text-gray-400 dark:text-gray-500">{paged.length} items</p>
            </div>
          </div>
        </div>

        <div className="max-h-[65vh] overflow-auto" role="region" aria-label="Stock adjustment list" tabIndex={0}>
          <table className="w-full text-sm">
            <thead className="sticky top-0 bg-white dark:bg-slate-800 z-10 shadow-xs">
              <tr className="text-left">
                <th className="px-3 py-2 font-semibold text-gray-600 dark:text-gray-300 text-xs uppercase tracking-wider">#</th>
                <th className="px-3 py-2 font-semibold text-gray-600 dark:text-gray-300 text-xs uppercase tracking-wider">Posted No</th>
                <th className="px-3 py-2 font-semibold text-gray-600 dark:text-gray-300 text-xs uppercase tracking-wider">Date</th>
                <th className="px-3 py-2 font-semibold text-gray-600 dark:text-gray-300 text-xs uppercase tracking-wider">Note</th>
                <th className="px-3 py-2 font-semibold text-right text-gray-600 dark:text-gray-300 text-xs uppercase tracking-wider">Items</th>
                <th className="px-3 py-2 font-semibold text-right text-gray-600 dark:text-gray-300 text-xs uppercase tracking-wider">Total Worth</th>
                {hasActions && (
                  <th className="px-3 py-2 font-semibold text-center text-gray-600 dark:text-gray-300 text-xs uppercase tracking-wider w-40">Actions</th>
                )}
              </tr>
            </thead>

            <tbody>
              {paged.length === 0 && !loading && (
                <tr>
                  <td className="px-3 py-12 text-center" colSpan={hasActions ? 7 : 6}>
                    <div className="flex flex-col items-center gap-2">
                      <ClipboardDocumentListIcon className="w-8 h-8 text-gray-400" />
                      <p className="text-sm text-gray-500 dark:text-gray-400">No stock adjustments found</p>
                    </div>
                  </td>
                </tr>
              )}

              {loading && (
                <tr>
                  <td className="px-3 py-12 text-center" colSpan={hasActions ? 7 : 6}>
                    <div className="flex flex-col items-center gap-2">
                      <ArrowPathIcon className="w-6 h-6 text-gray-400 animate-spin" />
                      <p className="text-sm text-gray-500 dark:text-gray-400">Loading...</p>
                    </div>
                  </td>
                </tr>
              )}

              {paged.map((r, idx) => {
                const itemsCount = r.items_count ?? r.items?.length ?? 0;
                const totalWorth = Number(r.total_worth || 0);

                return (
                  <tr
                    key={r.id}
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
                      <div className="flex flex-col items-start gap-1">
                        <Link
                          to={`/stock-adjustments/${r.id}`}
                          className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-lg bg-slate-100 dark:bg-slate-700/50 hover:bg-blue-100 dark:hover:bg-blue-900/40 text-slate-700 dark:text-slate-200 hover:text-blue-700 dark:hover:text-blue-300 text-xs font-mono font-semibold transition-colors"
                          title="View stock adjustment details"
                        >
                          <DocumentTextIcon className="w-3.5 h-3.5" />
                          {r.posted_number || "-"}
                        </Link>
                        {r.stocktake_session && (
                          <Link
                            to={`/stocktake-sessions/${r.stocktake_session.id}`}
                            className="text-[10px] font-medium text-emerald-600 dark:text-emerald-400 hover:underline"
                          >
                            Stocktake: {r.stocktake_session.reference_no}
                          </Link>
                        )}
                        {r.stock_disposal && (
                          <Link
                            to="/stock-disposals"
                            className="text-[10px] font-medium text-rose-600 dark:text-rose-400 hover:underline"
                          >
                            Disposal: {r.stock_disposal.disposal_number}
                          </Link>
                        )}
                      </div>
                    </td>
                    <td className="px-3 py-3">
                      <div className="flex items-center gap-2">
                        <CalendarIcon className="w-4 h-4 text-gray-400" />
                        <span className="text-gray-800 dark:text-gray-200">{formatDate(r.posted_date)}</span>
                      </div>
                      {r.user?.name && (
                        <div className="text-[11px] text-gray-400 dark:text-gray-500 mt-0.5">
                          by {r.user.name}
                        </div>
                      )}
                    </td>
                    <td className="px-3 py-3">
                      <span className="text-gray-600 dark:text-gray-300 max-w-[240px] truncate block" title={r.note || ""}>
                        {r.note || "-"}
                      </span>
                      {r.expense && (
                        <span className="mt-0.5 inline-flex items-center px-1.5 py-0.5 rounded text-[10px] font-mono font-semibold bg-amber-100 text-amber-800 dark:bg-amber-900/40 dark:text-amber-300">
                          P&amp;L: {r.expense.expense_number}
                        </span>
                      )}
                    </td>
                    <td className="px-3 py-3 text-right">
                      <span className="inline-flex items-center justify-center min-w-10 px-2 py-0.5 rounded-full text-xs font-bold bg-blue-100 dark:bg-blue-900/30 text-blue-700 dark:text-blue-300">
                        {itemsCount}
                      </span>
                    </td>
                    <td className="px-3 py-3 text-right">
                      <div className="flex items-center justify-end gap-1">
                        <CurrencyDollarIcon className="w-4 h-4 text-emerald-500" />
                        <span className="font-semibold text-gray-800 dark:text-gray-200">
                          {totalWorth.toLocaleString()}
                        </span>
                      </div>
                    </td>
                    {hasActions && (
                      <td className="px-3 py-3">
                        <div className="flex items-center gap-1.5 justify-center">
                          {/* View Action */}
                          <Guard when={can.view}>
                            <Link
                              to={`/stock-adjustments/${r.id}`}
                              className="products-row-action"
                              aria-label={`View adjustment ${r.posted_number}`}
                              title="View adjustment details"
                            >
                              <EyeIcon className="w-3.5 h-3.5 transition-transform group-hover:scale-110" />
                            </Link>
                          </Guard>

                          {/* Delete Action */}
                          <Guard when={can.delete}>
                            <button
                              onClick={() => openDeleteModal(r)}
                              className="products-row-action products-row-action-danger"
                              aria-label={`Delete adjustment ${r.posted_number}`}
                              title="Delete"
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
        <div className="stock-adjustments-pagination px-3 py-2 flex items-center justify-between border-t text-xs">
          <span className="text-gray-500 dark:text-gray-400">
            Page {page} of {pageCount} ({filtered.length} total)
          </span>

          <div className="flex items-center gap-1">
            <button aria-label="First page"
              onClick={() => setPage(1)}
              disabled={page === 1}
              className={`p-1.5 rounded-sm hover:bg-gray-200 dark:hover:bg-slate-700 ${page === 1 ? 'opacity-40' : ''}`}
            >
              <ChevronDoubleLeftIcon className="w-4 h-4" aria-hidden="true" />
            </button>
            <button aria-label="Previous page"
              onClick={() => setPage((p) => Math.max(1, p - 1))}
              disabled={page === 1}
              className={`p-1.5 rounded-sm hover:bg-gray-200 dark:hover:bg-slate-700 ${page === 1 ? 'opacity-40' : ''}`}
            >
              <ChevronLeftIcon className="w-4 h-4" aria-hidden="true" />
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
                      w-7 h-7 rounded text-xs font-medium transition-colors
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

            <button aria-label="Next page"
              onClick={() => setPage((p) => Math.min(pageCount, p + 1))}
              disabled={page === pageCount}
              className={`p-1.5 rounded-sm hover:bg-gray-200 dark:hover:bg-slate-700 ${page === pageCount ? 'opacity-40' : ''}`}
            >
              <ChevronRightIcon className="w-4 h-4" aria-hidden="true" />
            </button>
            <button aria-label="Last page"
              onClick={() => setPage(pageCount)}
              disabled={page === pageCount}
              className={`p-1.5 rounded-sm hover:bg-gray-200 dark:hover:bg-slate-700 ${page === pageCount ? 'opacity-40' : ''}`}
            >
              <ChevronDoubleRightIcon className="w-4 h-4" aria-hidden="true" />
            </button>
          </div>
        </div>
      </div>

      {/* Delete Confirmation Modal */}
      <DeleteConfirmationModal
        isOpen={deleteModalOpen}
        onClose={closeDeleteModal}
        onConfirm={handleConfirmDelete}
        itemName={deletingAdjustment?.name || "this adjustment"}
        title="Delete stock adjustment"
        isDeleting={deleting}
        setIsDeleting={setDeleting}
        tintClasses={{ 
          red: btnDanger.className,
          redStyle: btnDanger.style,
        }}
      />
    </div>
  );
}

