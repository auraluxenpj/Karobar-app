// src/pages/products/index.jsx
import React, { useEffect, useMemo, useRef, useState, useCallback } from "react";
import axios from "axios";
import Select from "react-select";
import { Link, useNavigate, useSearchParams } from "react-router-dom";
import toast from "react-hot-toast";
import {
  TrashIcon,
  PencilSquareIcon,
  PlusCircleIcon,
  ArrowUpTrayIcon,
  Squares2X2Icon,
  ArrowPathIcon,
  CubeIcon,
  ExclamationTriangleIcon,
  XMarkIcon,
  QrCodeIcon,
} from "@heroicons/react/24/solid";
import { usePermissions, Guard } from "@/api/usePermissions.js";

// Reusable components
import {
  ProductImportModal,
  DeleteConfirmationModal,
  BulkEditModal,
  BulkDeleteModal,
  TextSearch,
} from "@/components";
import { useTheme } from "@/context/ThemeContext";
import { getThemeButtonClasses } from "@/utils/buttonStyles";

/** ---- helpers ---- */
// Helper to determine text color based on background brightness
// Returns dark text for light backgrounds, light text for dark backgrounds
const getContrastText = (hexColor) => {
  hexColor = hexColor.replace('#', '');
  const r = parseInt(hexColor.substring(0, 2), 16);
  const g = parseInt(hexColor.substring(2, 4), 16);
  const b = parseInt(hexColor.substring(4, 6), 16);
  const luminance = (0.299 * r + 0.587 * g + 0.114 * b) / 255;
  return luminance > 0.5 ? '#1f2937' : '#ffffff';
};

// Helper to get button text color with fallback
const getButtonTextColor = (primaryColor, primaryHoverColor) => {
  return getContrastText(primaryHoverColor || primaryColor);
};

// Monogram initials for the product avatar (e.g. "Basmati Rice 5kg" -> "BR")
const getInitials = (name = "") =>
  name
    .trim()
    .split(/\s+/)
    .filter(Boolean)
    .slice(0, 2)
    .map((word) => word[0])
    .join("")
    .toUpperCase() || "?";

export default function ProductsIndex() {
  const [rows, setRows] = useState([]);
  const [loading, setLoading] = useState(false);

  // Import / Export
  const [importOpen, setImportOpen] = useState(false);
  const [exporting, setExporting] = useState(false);

  // search filters
  const [search, setSearch] = useState("");

  // Low-stock filter (enabled via /products?low_stock=1)
  const [searchParams] = useSearchParams();
  const [lowStockOnly, setLowStockOnly] = useState(() => searchParams.get("low_stock") === "1");

  // pagination (server-side)
  const [page, setPage] = useState(1);
  const [pageSize, setPageSize] = useState(10);
  const [total, setTotal] = useState(0);
  const [lastPage, setLastPage] = useState(1);

  // selection
  const [selectedIds, setSelectedIds] = useState(new Set());
  const [showBulkModal, setShowBulkModal] = useState(false);
  const [showBulkDelete, setShowBulkDelete] = useState(false);

  // Delete modal state
  const [deleteModalOpen, setDeleteModalOpen] = useState(false);
  const [deletingProduct, setDeletingProduct] = useState(null);
  const [deleting, setDeleting] = useState(false);

  const navigate = useNavigate();

  // AbortController + debounce for fetches
  const controllerRef = useRef(null);
  const debounceRef = useRef(null);

  // permissions
  const { loading: permsLoading, canFor, has } = usePermissions();
  const can = useMemo(
    () => ({
      ...(typeof canFor === "function"
        ? canFor("product")
        : { view: false, create: false, update: false, delete: false, import: false, export: false }),
      barcode: !permsLoading && (has("barcode.view") || has("barcode.print")),
    }),
    [canFor, permsLoading, has]
  );

  // Dynamic button palette using theme colors
  // Get dark mode state and theme colors
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

  // Get button style from theme
  const buttonStyle = theme?.button_style || 'modern';

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
    getButtonTextColor('#ef4444', '#dc2626'),
    []
  );

  // Get button style classes and styles based on theme button_style
  const getButtonClasses = useMemo(
    () => getThemeButtonClasses(buttonStyle, themeColors, isDark),
    [buttonStyle, themeColors, isDark]
  );

  // Destructure button classes for easier use
  const btnPrimary = getButtonClasses.primary;
  const btnSecondary = getButtonClasses.secondary;
  const btnTertiary = getButtonClasses.tertiary;
  const btnDanger = getButtonClasses.danger;
  const btnGlass = getButtonClasses.glass;

  // === Alt+N => /products/create (only when can.create) ===
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
      navigate("/products/create");
    };
    window.addEventListener("keydown", onKeyDown);
    return () => window.removeEventListener("keydown", onKeyDown);
  }, [navigate, can.create]);

  const handleExport = async () => {
    if (!can.export) return toast.error("You don't have permission to export products.");
    try {
      setExporting(true);
      const res = await axios.get("/api/products/export", { responseType: "blob" });
      const stamp = new Date().toISOString().slice(0, 19).replace(/[:T]/g, "-");
      const filename = `products_${stamp}.csv`;
      const blob = new Blob([res.data], { type: "text/csv;charset=utf-8" });
      const url = window.URL.createObjectURL(blob);
      const a = document.createElement("a");
      a.href = url; a.download = filename; document.body.appendChild(a); a.click(); a.remove();
      window.URL.revokeObjectURL(url);
    } catch (e) {
      const status = e?.response?.status;
      if (status === 403) toast.error("You don't have permission to export products.");
      else toast.error("Export failed");
    } finally {
      setExporting(false);
    }
  };

  // keep fetchProducts but pass filters as args
  const fetchProducts = useCallback(async (signal, opts = {}) => {
    const { pageArg = page, pageSizeArg = pageSize, searchArg = search } = opts;
    try {
      setLoading(true);
      const { data } = await axios.get("/api/products", {
        params: {
          page: pageArg,
          per_page: pageSizeArg,
          q: searchArg.trim(),
          low_stock: lowStockOnly ? 1 : '',
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
    if (status === 403) toast.error("You don't have permission to view products.");
    else toast.error("Failed to load products");
  } finally {
    setLoading(false);
  }
}, [page, pageSize, search, lowStockOnly]);


// Track initial mount for filter debounce to avoid mount-time double fetch
const didMountFiltersRef = useRef(false);

// Fetch when page or pageSize changes
useEffect(() => {
  if (permsLoading || !can.view) return;
  const ctrl = new AbortController();
  controllerRef.current = ctrl;
  fetchProducts(ctrl.signal);
  return () => ctrl.abort();
}, [page, pageSize, permsLoading, can.view]);

// Auto-refresh products list when Cube AI creates/edits products or finishes a background formulation batch
useEffect(() => {
  if (permsLoading || !can.view) return;
  const handleCubeProductRefresh = () => {
    const ctrl = new AbortController();
    fetchProducts(ctrl.signal);
  };
  window.addEventListener("karobar:products-updated", handleCubeProductRefresh);
  return () => window.removeEventListener("karobar:products-updated", handleCubeProductRefresh);
}, [permsLoading, can.view, fetchProducts]);

// Debounce only when filters change after initial mount (reset to page 1)
useEffect(() => {
  if (permsLoading || !can.view) return;
  if (!didMountFiltersRef.current) {
    didMountFiltersRef.current = true;
    return;
  }
  const ctrl = new AbortController();
  if (debounceRef.current) clearTimeout(debounceRef.current);
  debounceRef.current = setTimeout(() => {
    setPage(1);
    controllerRef.current = ctrl;
    fetchProducts(ctrl.signal, { pageArg: 1 });
  }, 300);
  return () => {
    clearTimeout(debounceRef.current);
    ctrl.abort();
  };
}, [search, lowStockOnly, permsLoading, can.view]);


  const start = rows.length ? (page - 1) * pageSize + 1 : 0;
  const end = rows.length ? start + rows.length - 1 : 0;

  // ===== delete modal handlers =====
  const openDeleteModal = (product) => {
    if (!can.delete) return toast.error("You don't have permission to delete products.");
    const qty = Number(product.quantity || 0);
    const hasBatches = Number(product.batches_count || 0) > 0;

    if (qty > 0 || hasBatches) {
      toast.error(qty > 0 ? "Cannot delete: product has on-hand quantity." : "Cannot delete: product has batch records.");
      return;
    }

    setDeletingProduct({ id: product.id, name: product.name });
    setDeleteModalOpen(true);
  };

  const closeDeleteModal = () => {
    setDeleteModalOpen(false);
    setDeletingProduct(null);
  };

  const handleConfirmDelete = async (password) => {
    if (!deletingProduct?.id) return;
    if (!can.delete) return toast.error("You don't have permission to delete products.");

    try {
      await axios.post("/api/auth/confirm-password", { password });
      await axios.delete(`/api/products/${deletingProduct.id}`);
      toast.success("Product deleted");

      setSelectedIds((prev) => {
        const copy = new Set(prev);
        copy.delete(deletingProduct.id);
        return copy;
      });

      closeDeleteModal();

      if (controllerRef.current) controllerRef.current.abort();
      const ctrl = new AbortController();
      controllerRef.current = ctrl;
      fetchProducts(ctrl.signal);
    } catch (err) {
      const status = err?.response?.status;
      const apiMsg =
        err?.response?.data?.message ||
        (status === 422 ? "Incorrect password" : status === 403 ? "You don't have permission to delete products." : "Delete failed");
      toast.error(apiMsg);
    }
  };

  // selection helpers (operate on current page rows)
  const pageAllChecked = rows.length > 0 && rows.every((p) => selectedIds.has(p.id));
  const allOnPageSelected = pageAllChecked;
  const pageIndeterminate = rows.some((p) => selectedIds.has(p.id)) && !pageAllChecked;

  const togglePageAll = (checkedOrEvent) => {
    const checked = typeof checkedOrEvent === "boolean" ? checkedOrEvent : Boolean(checkedOrEvent?.target?.checked);
    setSelectedIds((prev) => {
      const copy = new Set(prev);
      if (checked) rows.forEach((p) => copy.add(p.id));
      else rows.forEach((p) => copy.delete(p.id));
      return copy;
    });
  };

  const toggleOne = (id, checked) => {
    setSelectedIds((prev) => {
      const copy = new Set(prev);
      if (checked) copy.add(id);
      else copy.delete(id);
      return copy;
    });
  };

  // helper to toggle by clicking product name
  const toggleById = (id) =>
    setSelectedIds((prev) => {
      const copy = new Set(prev);
      copy.has(id) ? copy.delete(id) : copy.add(id);
      return copy;
    });

  const openBulkModal = () => {
    if (!can.update) return toast.error("You don't have permission to update products.");
    setShowBulkModal(true);
  };

  // permissions-driven table layout
  const hasActions = can.update || can.delete;
  const visibleColumns =
    1 /*select*/ + 1 /*name*/ + 1 /*category*/ + 1 /*brand*/ + 1 /*supplier*/ + 1 /*quantity*/ + (hasActions ? 1 : 0);

  if (permsLoading) return <div className="p-6">Loading…</div>;
  if (!can.view) return <div className="p-6 text-sm text-gray-700">You don't have permission to view products.</div>;

  return (
    <div className="products-page">
      <div className="products-panel products-overview">
        {/* Top row */}
        <div className="products-heading">
          {/* Identity */}
          <div className="flex items-center gap-3 min-w-0">
            <div className="products-identity-icon">
              <CubeIcon className="w-6 h-6" />
            </div>
            <div className="min-w-0">
              <h1 className="products-title">Products</h1>
              <p className="products-subtitle">
                <Squares2X2Icon className="w-3.5 h-3.5 shrink-0" />
                <span className="truncate">{total} products in this view</span>
              </p>
            </div>
          </div>

          {/* Actions */}
          <div className="flex flex-wrap items-center gap-2">
            {/* Bulk actions */}
            <Guard when={can.update}>
              <button
                onClick={openBulkModal}
                disabled={selectedIds.size === 0}
                title="Bulk edit"
                className="products-action theme-btn-tertiary"
              >
                <PencilSquareIcon className="w-3.5 h-3.5" />
                <span className="inline-flex items-center gap-1.5">
                  <span>Bulk edit</span>
                  {selectedIds.size > 0 && (
                    <span className="products-selection-count">
                      {selectedIds.size}
                    </span>
                  )}
                </span>
              </button>
            </Guard>

            <Guard when={can.delete}>
              <button
                onClick={() => setShowBulkDelete(true)}
                disabled={selectedIds.size === 0}
                title="Bulk delete"
                className="products-action theme-btn-tertiary"
              >
                <TrashIcon className="w-3.5 h-3.5" />
                <span className="inline-flex items-center gap-1.5">
                  <span>Bulk delete</span>
                  {selectedIds.size > 0 && (
                    <span className="products-selection-count">
                      {selectedIds.size}
                    </span>
                  )}
                </span>
              </button>
            </Guard>


            {/* Import / Export */}
            <Guard when={can.import}>
              <button
                onClick={() => setImportOpen(true)}
                title="Import products"
                className="products-action theme-btn-secondary"
              >
                <ArrowUpTrayIcon className="w-3.5 h-3.5" />
                <span>Import</span>
              </button>
            </Guard>

            <Guard when={can.export}>
              <button
                onClick={handleExport}
                disabled={exporting}
                title="Export products"
                className="products-action theme-btn-secondary"
              >
                <ArrowPathIcon className={`w-3.5 h-3.5 ${exporting ? "animate-spin" : ""}`} />
                <span>{exporting ? "Exporting…" : "Export"}</span>
              </button>
            </Guard>

            {/* Barcode Studio Shortcut */}
            <Guard when={can.barcode}>
              <Link
                to={selectedIds.size > 0 ? `/barcode-labels?product_ids=${Array.from(selectedIds).join(",")}` : "/barcode-labels"}
                title="Print Barcode Labels"
                className="products-action theme-btn-secondary"
              >
                <QrCodeIcon className="w-3.5 h-3.5" />
                <span>{selectedIds.size > 0 ? `Print Labels (${selectedIds.size})` : "Barcode Studio"}</span>
              </Link>
            </Guard>

            {/* Primary action */}
            <Guard when={can.create}>
              <Link
                to="/products/create"
                title="Add product"
                className="products-action products-action-primary theme-btn-primary"
              >
                <PlusCircleIcon className="w-4 h-4" />
                <span>Add Product</span>
              </Link>
            </Guard>
          </div>
        </div>

        {/* Labeled inventory filters */}
        <div className="products-filter-panel">
          <div className="products-filters">
            <label className="products-filter"><span className="products-filter-label">Search inventory</span>
              <TextSearch
                value={search}
                onChange={setSearch}
                placeholder="Search name, generic/formula, barcode, code, rack, brand, or supplier…"
                className="w-full"
                iconClassName="products-search-icon"
                inputClassName="products-search-input"
              />
            </label>
            <button
              type="button"
              onClick={() => {
                const next = !lowStockOnly;
                setLowStockOnly(next);
                const sp = new URLSearchParams(searchParams);
                if (next) sp.set("low_stock", "1");
                else sp.delete("low_stock");
                const qs = sp.toString();
                navigate(`/products${qs ? `?${qs}` : ""}`, { replace: true });
              }}
              title={
                lowStockOnly
                  ? "Low-stock filter is ON — click to clear and show all products"
                  : "Show only products whose quantity is below pack size"
              }
              aria-pressed={lowStockOnly}
              className={`products-action products-low-stock theme-btn-tertiary ${
                lowStockOnly
                  ? "is-active ring-2 ring-offset-2 ring-[var(--color-tertiary)] dark:ring-offset-slate-800"
                  : ""
              }`}
            >
              <ExclamationTriangleIcon className="w-4 h-4" />
              <span className="inline-flex items-center gap-1.5">
                <span>Low stock only</span>
                {lowStockOnly && (
                  <XMarkIcon className="w-3.5 h-3.5 opacity-80" />
                )}
              </span>
            </button>
          </div>
          {lowStockOnly && (
            <div className="products-filter-note">
              <span className="inline-flex items-center gap-1.5">
                <ExclamationTriangleIcon className="w-3.5 h-3.5" />
                Showing only products below pack size (needs reorder)
              </span>
            </div>
          )}
        </div>
      </div>

      {/* ===== Product Table ===== */}
      <div className="products-panel products-catalog">
        {/* Table header bar */}
        <div className="products-catalog-heading">
          <div className="flex items-center gap-3">
            <div
              className="flex h-9 w-9 items-center justify-center rounded-lg bg-slate-100 dark:bg-slate-700/60"
            >
              <Squares2X2Icon className="h-4 w-4" style={{ color: themeColors.primary }} />
            </div>
            <div>
              <h2 className="products-section-title">Inventory</h2>
              <p className="products-subtitle">
                {loading ? (
                  <span className="inline-flex items-center gap-1.5">
                    <ArrowPathIcon className="h-3 w-3 animate-spin" />
                    Loading…
                  </span>
                ) : (
                  `Showing ${rows.length === 0 ? 0 : start}–${end} of ${total}`
                )}
                {selectedIds.size > 0 && ` · ${selectedIds.size} selected`}
              </p>
            </div>
          </div>

          {/* Page size */}
          <div className="flex items-center gap-2">
            <label htmlFor="products-page-size" className="text-xs font-medium text-gray-600 dark:text-slate-300">
              Show
            </label>
            <div className="w-24">
              <Select
                inputId="products-page-size"
                options={[
                  { value: 10, label: "10" },
                  { value: 25, label: "25" },
                  { value: 50, label: "50" },
                  { value: 100, label: "100" },
                ]}
                value={{ value: pageSize, label: String(pageSize) }}
                onChange={(opt) => setPageSize(Number(opt?.value || 25))}
                isSearchable={false}
                classNamePrefix="rs"
                styles={{
                  control: (base) => ({
                    ...base,
                    minHeight: "34px",
                    height: "34px",
                    borderRadius: 10,
                    backgroundColor: "var(--color-surface)",
                    borderColor: "var(--color-border)",
                    fontSize: "12px",
                  }),
                  valueContainer: (base) => ({ ...base, padding: "0 8px" }),
                  indicatorsContainer: (base) => ({ ...base, height: "34px" }),
                  singleValue: (base) => ({ ...base, color: "var(--color-text-primary)" }),
                  menuPortal: (base) => ({ ...base, zIndex: 50 }),
                  menu: (base) => ({
                    ...base,
                    backgroundColor: "var(--color-surface)",
                    borderRadius: 12,
                    border: "1px solid var(--color-border)",
                    overflow: "hidden",
                    fontSize: "12px",
                  }),
                  option: (base, state) => ({
                    ...base,
                    backgroundColor:
                      state.isSelected || state.isFocused
                        ? "color-mix(in srgb, var(--color-primary) 15%, var(--color-surface))"
                        : "var(--color-surface)",
                    color: "var(--color-text-primary)",
                    cursor: "pointer",
                  }),
                }}
                menuPortalTarget={typeof document !== "undefined" ? document.body : null}
              />
            </div>
          </div>
        </div>

        <div className="products-table-scroll" tabIndex={0} role="region" aria-label="Product inventory" aria-busy={loading}>
          <table className="products-table">
            <thead>
              <tr className="text-left">
                <th scope="col" className="w-12 pb-2 pl-3">
                  <input
                    type="checkbox"
                    checked={allOnPageSelected}
                    ref={(el) => {
                      if (el) el.indeterminate = pageIndeterminate;
                    }}
                    onChange={togglePageAll}
                    aria-label="Select all products on page"
                    className="h-4 w-4 cursor-pointer rounded-full border-gray-300"
                    style={{ accentColor: themeColors.primary }}
                  />
                </th>
                <th scope="col" className="pb-2 pl-3">
                  <span className="products-column-label">Product</span>
                </th>
                <th scope="col" className="w-32 pb-2 pl-3">
                  <span className="products-column-label">Category</span>
                </th>
                <th scope="col" className="w-32 pb-2 pl-3">
                  <span className="products-column-label">Brand</span>
                </th>
                <th scope="col" className="w-36 pb-2 pl-3">
                  <span className="products-column-label">Supplier</span>
                </th>
                <th scope="col" className="w-20 pb-2 pl-3">
                  <span className="products-column-label">Stock</span>
                </th>
                {hasActions && (
                  <th scope="col" className="w-24 pb-2 pr-3 text-right">
                    <span className="products-column-label">Actions</span>
                  </th>
                )}
              </tr>
            </thead>

            <tbody>
              {rows.length === 0 && !loading && (
                <tr>
                  <td className="px-5 py-16 text-center" colSpan={visibleColumns}>
                    <div className="flex flex-col items-center gap-3">
                      <div className="flex h-12 w-12 items-center justify-center rounded-full bg-gray-100 dark:bg-slate-700/60">
                        <CubeIcon className="h-6 w-6 text-gray-400" />
                      </div>
                      <div>
                        <p className="text-sm font-medium text-gray-600 dark:text-gray-300">No products found</p>
                        <p className="products-subtitle">Try adjusting your search or filters</p>
                      </div>
                    </div>
                  </td>
                </tr>
              )}

              {rows.map((p) => {
                const qty = Number(p.quantity || 0);
                const hasBatches = Number(p.batches_count || 0) > 0;
                const deleteDisabled = qty > 0 || hasBatches;
                const deleteTitle = deleteDisabled
                  ? qty > 0
                    ? "Cannot delete: has quantity."
                    : "Cannot delete: has batches."
                  : "Delete";
                const isSelected = selectedIds.has(p.id);

                // Stock state drives chip + avatar badge
                const inStock = qty > 0;
                const stockChip = inStock
                  ? "bg-emerald-50 text-emerald-700 ring-emerald-200/80 dark:bg-emerald-500/10 dark:text-emerald-300 dark:ring-emerald-500/30"
                  : "bg-amber-50 text-amber-700 ring-amber-200/80 dark:bg-amber-500/10 dark:text-amber-300 dark:ring-amber-500/30";
                const stockDot = inStock ? "bg-emerald-500" : "bg-amber-500";
                const cellBg = "products-cell";

                return (
                  <tr key={p.id} className={`group align-middle ${isSelected ? "is-selected" : ""}`}>
                    {/* Select — round check node */}
                    <td className={`rounded-l-2xl pl-3 ${cellBg}`}>
                      <input
                        type="checkbox"
                        checked={isSelected}
                        onChange={(e) => toggleOne(p.id, e.target.checked)}
                        aria-label={`Select ${p.name}`}
                        className="h-4 w-4 cursor-pointer rounded-full border-gray-300"
                        style={{ accentColor: themeColors.primary }}
                      />
                    </td>

                    {/* Product — avatar with orbiting stock dot */}
                    <td className={cellBg}>
                      <div className="flex items-center gap-3 pr-2">
                        <span className="relative shrink-0">
                          <span
                            aria-hidden="true"
                            className="flex h-9 w-9 items-center justify-center rounded-full text-[10px] font-black tracking-wider text-white ring-2 ring-white dark:ring-slate-700"
                            style={{
                              background: `linear-gradient(135deg, ${themeColors.primary}, ${themeColors.secondary})`,
                            }}
                          >
                            {getInitials(p.name)}
                          </span>
                          <span
                            aria-hidden="true"
                            className={`absolute -bottom-0.5 -right-0.5 h-3 w-3 rounded-full ring-2 ring-white dark:ring-slate-800 ${stockDot}`}
                          />
                        </span>

                        <div className="min-w-0">
                          <button
                            type="button"
                            onClick={() => toggleById(p.id)}
                            title={p.name}
                            className={`
                              block w-full truncate text-left text-sm font-semibold transition-colors
                              ${isSelected ? "" : "text-gray-800 dark:text-gray-100"}
                            `}
                            style={isSelected ? { color: themeColors.primary } : undefined}
                          >
                            {p.name}
                          </button>
                          {(p.formulation || p.barcode || p.product_code || p.rack) && (
                            <div className="flex flex-wrap items-center gap-1.5 mt-0.5 text-[11px] text-gray-500 dark:text-slate-400">
                              {p.formulation && (
                                <span className="font-medium text-blue-600 dark:text-blue-400 truncate max-w-[220px]" title={p.formulation}>
                                  {p.formulation}
                                </span>
                              )}
                              {(p.barcode || p.product_code) && (
                                <span className="font-mono text-[10px] text-gray-400 dark:text-slate-500">
                                  {p.barcode || p.product_code}
                                </span>
                              )}
                              {p.rack && (
                                <span className="px-1.5 py-0.2 rounded-sm bg-amber-100/80 dark:bg-amber-900/30 text-amber-700 dark:text-amber-300 font-semibold text-[10px]">
                                  Rack: {p.rack}
                                </span>
                              )}
                            </div>
                          )}
                        </div>
                      </div>
                    </td>

                    {/* Category */}
                    <td className={`truncate pl-3 products-meta ${cellBg}`}>
                      {p.category?.name || <span className="text-gray-300 dark:text-slate-600">—</span>}
                    </td>

                    {/* Brand */}
                    <td className={`truncate pl-3 products-meta ${cellBg}`}>
                      {p.brand?.name || <span className="text-gray-300 dark:text-slate-600">—</span>}
                    </td>

                    {/* Supplier */}
                    <td className={`truncate pl-3 products-meta ${cellBg}`}>
                      {p.supplier?.name || <span className="text-gray-300 dark:text-slate-600">—</span>}
                    </td>

                    {/* Stock — notched numberplate chip */}
                    <td className={cellBg}>
                      <span className={`inline-flex items-center gap-1 rounded-md px-2 py-0.5 text-xs font-bold ring-1 ${stockChip}`}>
                        <span className={`h-1.5 w-1.5 rounded-full ${stockDot}`} />
                        <span className="tabular-nums">{qty}</span>
                      </span>
                    </td>

                    {/* Actions */}
                    {hasActions && (
                      <td className={`rounded-r-2xl pr-3 ${cellBg}`}>
                        <div className="flex items-center justify-end gap-1">
                          {/* Print Barcode Label */}
                          <Link
                            to={`/barcode-labels?product_id=${p.id}`}
                            title={`Print Barcode Sticker for ${p.name}`}
                            aria-label={`Print Barcode for ${p.name}`}
                            className="products-row-action text-slate-500 hover:text-blue-600"
                          >
                            <QrCodeIcon className="h-4 w-4" />
                          </Link>

                          {/* Edit */}
                          <Guard when={can.update}>
                            <Link
                              to={`/products/${p.id}/edit`}
                              title="Edit"
                              aria-label={`Edit ${p.name}`}
                              className="products-row-action"
                            >
                              <PencilSquareIcon className="h-4 w-4" />
                            </Link>
                          </Guard>

                          {/* Delete */}
                          <Guard when={can.delete}>
                            <button
                              onClick={() => openDeleteModal(p)}
                              disabled={deleteDisabled}
                              title={deleteTitle}
                              aria-label={`Delete ${p.name}`}
                              className="products-row-action products-row-delete"
                            >
                              <TrashIcon className="h-4 w-4" />
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

        {/* Pagination */}
        <div className="products-pagination flex-wrap justify-center sm:justify-between gap-2">
          <span className="text-xs text-gray-500 dark:text-gray-400">
            Page <span className="font-medium text-gray-700 dark:text-gray-200">{page}</span> of{" "}
            <span className="font-medium text-gray-700 dark:text-gray-200">{lastPage}</span> · {total} total
          </span>

          <div className="flex items-center gap-1">
            <button
              onClick={() => setPage(1)}
              disabled={page === 1}
              title="First page"
              className={`rounded-lg p-2 transition-colors ${page === 1 ? "cursor-not-allowed text-gray-300 dark:text-slate-600" : "text-gray-500 hover:bg-gray-200 hover:text-gray-700 dark:hover:bg-slate-700 dark:hover:text-gray-200"}`}
            >
              <svg className="h-4 w-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M11 19l-7-7 7-7m8 14l-7-7 7-7" />
              </svg>
            </button>
            <button
              onClick={() => setPage((p) => Math.max(1, p - 1))}
              disabled={page === 1}
              title="Previous page"
              className={`rounded-lg p-2 transition-colors ${page === 1 ? "cursor-not-allowed text-gray-300 dark:text-slate-600" : "text-gray-500 hover:bg-gray-200 hover:text-gray-700 dark:hover:bg-slate-700 dark:hover:text-gray-200"}`}
            >
              <svg className="h-4 w-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 19l-7-7 7-7" />
              </svg>
            </button>

            {/* Page numbers */}
            <div className="mx-1 flex items-center gap-0.5">
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
                      h-8 w-8 rounded-lg text-xs font-medium transition-colors
                      ${page === pageNum
                        ? "text-white shadow-sm"
                        : "text-gray-600 hover:bg-gray-200 dark:text-gray-300 dark:hover:bg-slate-700"
                      }
                    `}
                    style={page === pageNum ? { backgroundColor: themeColors.primary } : undefined}
                  >
                    {pageNum}
                  </button>
                );
              })}
            </div>

            <button
              onClick={() => setPage((p) => Math.min(lastPage, p + 1))}
              disabled={page === lastPage}
              title="Next page"
              className={`rounded-lg p-2 transition-colors ${page === lastPage ? "cursor-not-allowed text-gray-300 dark:text-slate-600" : "text-gray-500 hover:bg-gray-200 hover:text-gray-700 dark:hover:bg-slate-700 dark:hover:text-gray-200"}`}
            >
              <svg className="h-4 w-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 5l7 7-7 7" />
              </svg>
            </button>
            <button
              onClick={() => setPage(lastPage)}
              disabled={page === lastPage}
              title="Last page"
              className={`rounded-lg p-2 transition-colors ${page === lastPage ? "cursor-not-allowed text-gray-300 dark:text-slate-600" : "text-gray-500 hover:bg-gray-200 hover:text-gray-700 dark:hover:bg-slate-700 dark:hover:text-gray-200"}`}
            >
              <svg className="h-4 w-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M13 5l7 7-7 7M5 5l7 7-7 7" />
              </svg>
            </button>
          </div>
        </div>
      </div>

      {/* Bulk Edit Modal */}
      {showBulkModal && (
        <BulkEditModal
          isOpen={showBulkModal}
          onClose={() => setShowBulkModal(false)}
          selectedCount={selectedIds.size}
          selectedIds={[...selectedIds]}
          onSaved={async () => {
            if (controllerRef.current) controllerRef.current.abort();
            const ctrl = new AbortController();
            controllerRef.current = ctrl;
            await fetchProducts(ctrl.signal);
            setShowBulkModal(false);
            setSelectedIds(new Set());
          }}
          tintClasses={{
            primary: btnPrimary,
            glass: btnGlass
          }}
        />
      )}

      {/* Import modal */}
      <ProductImportModal open={importOpen} onClose={() => setImportOpen(false)} onImported={fetchProducts} />

      {/* Single Delete confirmation modal */}
      <DeleteConfirmationModal
        isOpen={deleteModalOpen}
        onClose={closeDeleteModal}
        onConfirm={handleConfirmDelete}
        itemName={deletingProduct?.name || "this product"}
        title="Delete product"
        isDeleting={deleting}
        setIsDeleting={setDeleting}
        tintClasses={{
          primary: btnPrimary,
          danger: btnDanger,
          glass: btnGlass
        }}
      />

      {/* Bulk Delete Modal */}
      {showBulkDelete && (
        <BulkDeleteModal
          isOpen={showBulkDelete}
          onClose={() => setShowBulkDelete(false)}
          selectedCount={selectedIds.size}
          selectedIds={[...selectedIds]}
          onDeleted={async (result) => {
            if (result?.deleted) toast.success(`Deleted ${result.deleted} product(s).`);
            if (result?.failed?.length) {
              const firstFew = result.failed.slice(0, 3).map(f => `${f.name ?? `#${f.id}`}: ${f.reason}`);
              toast.error(
                `Couldn't delete ${result.failed.length} item(s).\n` + firstFew.join("\n")
              );
            }
            if (controllerRef.current) controllerRef.current.abort();
            const ctrl = new AbortController();
            controllerRef.current = ctrl;
            await fetchProducts(ctrl.signal);
            setSelectedIds(new Set());
            setShowBulkDelete(false);
          }}
          itemType="product(s)"
          tintClasses={{
            primary: btnPrimary,
            danger: btnDanger,
            glass: btnGlass
          }}
        />
      )}
    </div>
  );
}

