import { useState, useEffect, useMemo, useCallback } from "react";
import { useNavigate } from "react-router-dom";
import axios from "axios";
import toast from "react-hot-toast";
import Select from "react-select";
import { useTheme } from "@/context/ThemeContext.jsx";
import { getThemeButtonClasses } from "@/utils/buttonStyles.js";
import { usePermissions } from "@/api/usePermissions.js";
import SupplierSearch from "@/components/SupplierSearch.jsx";
import BrandSearch from "@/components/BrandSearch.jsx";
import {
  ClockIcon,
  ExclamationTriangleIcon,
  ShieldExclamationIcon,
  CheckCircleIcon,
  ArrowPathIcon,
  MagnifyingGlassIcon,
  ArrowUturnDownIcon,
  Cog6ToothIcon,
  PencilSquareIcon,
  XMarkIcon,
  CurrencyDollarIcon,
  BuildingStorefrontIcon,
  TagIcon,
  ArrowsRightLeftIcon,
} from "@heroicons/react/24/outline";
import {
  MoveBatchLocationModal,
  ManageStorageLocationsModal,
  getLocationTypeMeta,
} from "@/components/StorageLocationsModal.jsx";

export default function BatchExpiryTracking() {
  const navigate = useNavigate();
  const { isDark, theme } = useTheme();
  const { loading: permsLoading, has } = usePermissions();
  const canUpdateExpiry = !permsLoading && has("batch-expiry.update");
  const canCreatePurchaseReturn = !permsLoading && has("purchase-return.create");
  const canCreateStockDisposal = !permsLoading && has("stock-disposal.create");

  // Dynamic Button styles matching Settings and app design system
  const themeColors = useMemo(
    () => ({
      primary: theme?.primary_color || "#3b82f6",
      primaryHover: theme?.primary_hover || "#2563eb",
      primaryLight: theme?.primary_light || "#dbeafe",
      secondary: theme?.secondary_color || "#8b5cf6",
      secondaryHover: theme?.secondary_hover || "#7c3aed",
      secondaryLight: theme?.secondary_light || "#ede9fe",
      tertiary: theme?.tertiary_color || "#06b6d4",
      tertiaryHover: theme?.tertiary_hover || "#0891b2",
      danger: theme?.danger_color || "#ef4444",
      dangerHover: "#dc2626",
    }),
    [theme]
  );

  const buttonStyle = theme?.button_style || "modern";
  const getButtonClasses = useMemo(
    () => getThemeButtonClasses(buttonStyle, themeColors, isDark),
    [buttonStyle, themeColors, isDark]
  );

  const btnPrimary = getButtonClasses.primary;
  const btnSecondary = getButtonClasses.secondary;

  // React-Select custom styles matching GeneralSetting & Expenses
  const selectStyles = useMemo(
    () => ({
      control: (base, state) => ({
        ...base,
        minHeight: "38px",
        height: "38px",
        borderRadius: "0.75rem",
        backgroundColor: isDark ? "rgba(30, 41, 59, 0.75)" : "rgba(255, 255, 255, 0.9)",
        borderColor: state.isFocused
          ? theme?.primary_color || "#3b82f6"
          : isDark
          ? "rgba(71, 85, 105, 0.7)"
          : "rgba(209, 213, 219, 0.8)",
        boxShadow: state.isFocused ? `0 0 0 2px ${theme?.primary_color || "#3b82f6"}33` : "none",
        fontSize: "0.8125rem",
        color: isDark ? "#f8fafc" : "#1e293b",
        backdropFilter: "blur(8px)",
        transition: "all 0.15s ease",
        "&:hover": {
          borderColor: theme?.primary_color || "#3b82f6",
        },
      }),
      valueContainer: (base) => ({
        ...base,
        padding: "0 10px",
      }),
      input: (base) => ({
        ...base,
        color: isDark ? "#f8fafc" : "#1e293b",
        margin: 0,
        padding: 0,
      }),
      placeholder: (base) => ({
        ...base,
        color: isDark ? "rgba(148, 163, 184, 0.7)" : "rgba(156, 163, 175, 0.8)",
        fontSize: "0.8125rem",
      }),
      singleValue: (base) => ({
        ...base,
        color: isDark ? "#f8fafc" : "#1e293b",
        fontSize: "0.8125rem",
        fontWeight: "500",
      }),
      indicatorsContainer: (base) => ({
        ...base,
        height: "38px",
      }),
      dropdownIndicator: (base) => ({
        ...base,
        padding: "4px 8px",
        color: isDark ? "rgba(148, 163, 184, 0.7)" : "rgba(156, 163, 175, 0.8)",
        "&:hover": {
          color: theme?.primary_color || "#3b82f6",
        },
      }),
      clearIndicator: (base) => ({
        ...base,
        padding: "4px",
        color: isDark ? "rgba(148, 163, 184, 0.7)" : "rgba(156, 163, 175, 0.8)",
      }),
      menuPortal: (base) => ({ ...base, zIndex: 99999 }),
      menu: (base) => ({
        ...base,
        backgroundColor: isDark ? "rgba(15, 23, 42, 0.98)" : "rgba(255, 255, 255, 0.98)",
        border: isDark ? "1px solid rgba(51, 65, 85, 0.8)" : "1px solid rgba(226, 232, 240, 0.9)",
        boxShadow: "0 20px 25px -5px rgba(0, 0, 0, 0.25), 0 8px 10px -6px rgba(0, 0, 0, 0.15)",
        borderRadius: "0.75rem",
        overflow: "hidden",
        backdropFilter: "blur(16px)",
        zIndex: 99999,
      }),
      option: (base, state) => ({
        ...base,
        backgroundColor: state.isSelected
          ? theme?.primary_color || "#3b82f6"
          : state.isFocused
          ? isDark
            ? "rgba(51, 65, 85, 0.8)"
            : "rgba(239, 246, 255, 1)"
          : "transparent",
        color: state.isSelected ? "#ffffff" : isDark ? "#f8fafc" : "#1e293b",
        fontSize: "0.8125rem",
        cursor: "pointer",
        padding: "8px 12px",
        transition: "background-color 0.1s ease",
      }),
    }),
    [isDark, theme]
  );

  // Compact select styles for the pagination control
  const compactSelectStyles = useMemo(
    () => ({
      ...selectStyles,
      control: (base, state) => ({
        ...selectStyles.control(base, state),
        minHeight: "32px",
        height: "32px",
        borderRadius: "0.5rem",
        fontSize: "0.75rem",
      }),
      indicatorsContainer: (base) => ({
        ...base,
        height: "32px",
      }),
      dropdownIndicator: (base) => ({
        ...base,
        padding: "2px 6px",
      }),
      singleValue: (base) => ({
        ...base,
        color: isDark ? "#f8fafc" : "#1e293b",
        fontSize: "0.75rem",
      }),
    }),
    [selectStyles, isDark]
  );

  // State
  const [loading, setLoading] = useState(false);
  const [rows, setRows] = useState([]);
  const [total, setTotal] = useState(0);
  const [page, setPage] = useState(1);
  const [perPage, setPerPage] = useState(25);
  const [summary, setSummary] = useState({
    total_batches_tracked: 0,
    total_expired_batches: 0,
    total_expired_qty: 0,
    total_expired_value: 0,
    total_critical_batches: 0,
    total_critical_qty: 0,
    total_critical_value: 0,
    total_warning_batches: 0,
    total_warning_qty: 0,
    total_warning_value: 0,
    total_stock_value_at_risk: 0,
    global_warning_days: 90,
  });

  // Filters
  const [statusFilter, setStatusFilter] = useState("all"); // all, expired, critical, warning, safe
  const [search, setSearch] = useState("");
  const [supplierId, setSupplierId] = useState("");
  const [selectedSupplier, setSelectedSupplier] = useState(null);
  const [brandId, setBrandId] = useState("");
  const [selectedBrand, setSelectedBrand] = useState(null);
  const [categoryId, setCategoryId] = useState("");
  const [storageLocationId, setStorageLocationId] = useState("");
  const [sortBy, setSortBy] = useState("expiry_date");
  const [sortDir, setSortDir] = useState("asc");

  // Search Modals State
  const [supplierSearchOpen, setSupplierSearchOpen] = useState(false);
  const [brandSearchOpen, setBrandSearchOpen] = useState(false);

  // Categories & Storage Locations metadata for select
  const [categories, setCategories] = useState([]);
  const [storageLocations, setStorageLocations] = useState([]);
  const [moveModalBatch, setMoveModalBatch] = useState(null);
  const [manageLocationsOpen, setManageLocationsOpen] = useState(false);

  const fetchStorageLocations = useCallback(async () => {
    try {
      const locRes = await axios.get("/api/storage-locations");
      setStorageLocations(Array.isArray(locRes.data) ? locRes.data : []);
    } catch {
      // ignore
    }
  }, []);

  // Load categories & storage locations metadata once
  useEffect(() => {
    (async () => {
      try {
        const [catRes] = await Promise.all([
          axios.get("/api/categories"),
          fetchStorageLocations(),
        ]);
        setCategories(Array.isArray(catRes.data) ? catRes.data : []);
      } catch (err) {
        console.error("Failed to load categories:", err);
      }
    })();
  }, [fetchStorageLocations]);

  // Fetch batches with filters
  const fetchData = useCallback(async () => {
    setLoading(true);
    try {
      const params = {
        status: statusFilter,
        search: search.trim() || undefined,
        supplier_id: supplierId || undefined,
        brand_id: brandId || undefined,
        category_id: categoryId || undefined,
        storage_location_id: storageLocationId || undefined,
        sort_by: sortBy,
        sort_dir: sortDir,
        page,
        per_page: perPage,
      };

      const { data } = await axios.get("/api/batch-expiry", { params });
      setRows(data.rows || []);
      setTotal(data.total || 0);
      if (data.summary) {
        setSummary(data.summary);
        setNewGlobalDays(data.summary.global_warning_days || 90);
      }
    } catch (err) {
      console.error("Failed to fetch batch expiry tracking data:", err);
      toast.error("Failed to load batch expiry data.");
    } finally {
      setLoading(false);
    }
  }, [statusFilter, search, supplierId, brandId, categoryId, storageLocationId, sortBy, sortDir, page, perPage]);

  // Modals for warning configuration
  const [globalModalOpen, setGlobalModalOpen] = useState(false);
  const [newGlobalDays, setNewGlobalDays] = useState(90);
  const [savingGlobal, setSavingGlobal] = useState(false);

  const [productModalOpen, setProductModalOpen] = useState(false);
  const [selectedProduct, setSelectedProduct] = useState(null);
  const [productDaysInput, setProductDaysInput] = useState("");
  const [useDefaultChecked, setUseDefaultChecked] = useState(true);
  const [savingProduct, setSavingProduct] = useState(false);

  useEffect(() => {
    fetchData();
  }, [fetchData]);

  // Ctrl+R quick refresh
  useEffect(() => {
    const onKey = (e) => {
      if ((e.ctrlKey || e.metaKey) && !e.altKey && !e.shiftKey && (e.key === "r" || e.key === "R")) {
        e.preventDefault();
        fetchData();
      }
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [fetchData]);

  // Handle supplier select from SupplierSearch modal
  const handleSupplierSelect = (supplier) => {
    if (!supplier) {
      setSelectedSupplier(null);
      setSupplierId("");
    } else {
      setSelectedSupplier(supplier);
      setSupplierId(String(supplier.id));
    }
    setSupplierSearchOpen(false);
    setPage(1);
  };

  // Handle brand select from BrandSearch modal
  const handleBrandSelect = (brand) => {
    if (!brand) {
      setSelectedBrand(null);
      setBrandId("");
    } else {
      setSelectedBrand(brand);
      setBrandId(String(brand.id));
    }
    setBrandSearchOpen(false);
    setPage(1);
  };

  // Handle Save Global Warning Days
  const handleSaveGlobalDays = async (e) => {
    e.preventDefault();
    const val = parseInt(newGlobalDays, 10);
    if (isNaN(val) || val < 1 || val > 3650) {
      toast.error("Please enter a valid number of days between 1 and 3650.");
      return;
    }
    setSavingGlobal(true);
    try {
      await axios.put("/api/batch-expiry/global-warning", { expiry_warning_days: val });
      toast.success("Global expiry warning window updated!");
      setGlobalModalOpen(false);
      window.dispatchEvent(new CustomEvent("notifications-changed"));
      fetchData();
    } catch (err) {
      console.error(err);
      toast.error("Failed to update global warning window.");
    } finally {
      setSavingGlobal(false);
    }
  };

  // Open Product Override Modal
  const openProductModal = (row) => {
    setSelectedProduct({
      id: row.product_id,
      name: row.product_name,
      code: row.product_code,
      customDays: row.product_warning_days,
      effectiveDays: row.effective_warning_days,
    });
    if (row.product_warning_days !== null && row.product_warning_days !== undefined) {
      setUseDefaultChecked(false);
      setProductDaysInput(String(row.product_warning_days));
    } else {
      setUseDefaultChecked(true);
      setProductDaysInput(String(summary.global_warning_days || 90));
    }
    setProductModalOpen(true);
  };

  // Handle Save Product Warning Days
  const handleSaveProductDays = async (e) => {
    e.preventDefault();
    if (!selectedProduct) return;

    let payloadDays = null;
    if (!useDefaultChecked) {
      const val = parseInt(productDaysInput, 10);
      if (isNaN(val) || val < 1 || val > 3650) {
        toast.error("Please enter a valid number of days between 1 and 3650.");
        return;
      }
      payloadDays = val;
    }

    setSavingProduct(true);
    try {
      await axios.put(`/api/batch-expiry/product-warning/${selectedProduct.id}`, {
        expiry_warning_days: payloadDays,
      });
      toast.success(
        payloadDays
          ? `Warning window for "${selectedProduct.name}" set to ${payloadDays} days!`
          : `"${selectedProduct.name}" reset to global default (${summary.global_warning_days} days).`
      );
      setProductModalOpen(false);
      window.dispatchEvent(new CustomEvent("notifications-changed"));
      fetchData();
    } catch (err) {
      console.error(err);
      toast.error("Failed to update product warning threshold.");
    } finally {
      setSavingProduct(false);
    }
  };

  // Action: Initiate Return to Supplier
  const handleReturnToSupplier = (row) => {
    if (!row.supplier_id) {
      toast.error("This product does not have an assigned supplier. Please assign a supplier first.");
      return;
    }

    // Pre-populate Purchase Return state
    navigate("/purchase-returns/create", {
      state: {
        initialData: {
          supplier_id: row.supplier_id,
          remarks: `Expiry return: Batch ${row.batch_number} (Expires ${row.expiry_date})`,
          items: [
            {
              product_id: row.product_id,
              batch: row.batch_number,
              expiry: row.expiry_date,
              pack_size: row.pack_size,
              pack_quantity: row.packs_count || 1,
              return_pack_quantity: row.packs_count || 1,
              return_unit_quantity: row.quantity,
              pack_purchase_price: row.pack_purchase_price || 0,
              unit_purchase_price: row.unit_cost || 0,
              available_units: row.quantity,
              sub_total: row.value_at_risk,
              is_unbatched: false,
            },
          ],
        },
      },
    });
  };

  // Navigate to Quarantine / Stock Disposal creation with prefilled batch data
  const handleDisposeBatch = (row) => {
    const params = new URLSearchParams({
      product_id: String(row.product_id || ""),
      batch_id: String(row.batch_id || ""),
      batch_number: String(row.batch_number || ""),
      expiry_date: String(row.expiry_date || ""),
      qty: String(row.quantity || 1),
      unit_cost: String(row.unit_cost || 0),
      cause: "shelf_expiry",
    });
    navigate(`/stock-disposals/create?${params.toString()}`);
  };

  const fmtCurrency = (v) =>
    Number(v || 0).toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 });
  const fmtNumber = (v) =>
    Number(v || 0).toLocaleString(undefined, { maximumFractionDigits: 0 });

  // React-select options for Category, Storage Location, Sort, and Per Page
  const categoryOptions = useMemo(
    () => [
      { value: "", label: "All Categories" },
      ...categories.map((c) => ({ value: String(c.id), label: c.name })),
    ],
    [categories]
  );

  const locationFilterOptions = useMemo(
    () => [
      { value: "", label: "All Locations" },
      ...storageLocations.map((loc) => ({
        value: String(loc.id),
        label: `${loc.name} (${loc.code})`,
      })),
    ],
    [storageLocations]
  );

  const sortOptions = useMemo(
    () => [
      { value: "expiry_date", label: "Sort: Expiry Date" },
      { value: "days_remaining", label: "Sort: Days Remaining" },
      { value: "quantity", label: "Sort: Quantity" },
      { value: "value_at_risk", label: "Sort: Cost at Risk" },
    ],
    []
  );

  const perPageOptions = useMemo(
    () => [
      { value: 15, label: "15 / page" },
      { value: 25, label: "25 / page" },
      { value: 50, label: "50 / page" },
      { value: 100, label: "100 / page" },
    ],
    []
  );

  return (
    <div className={`p-4 md:p-6 min-h-screen ${isDark ? "bg-slate-900 text-slate-100" : "bg-slate-50 text-slate-800"}`}>
      {/* Top Header */}
      <div className="flex flex-col md:flex-row md:items-center justify-between gap-4 mb-6">
        <div>
          <div className="flex items-center gap-3">
            <div className="p-2.5 rounded-xl bg-amber-500/10 text-amber-500 border border-amber-500/20">
              <ClockIcon className="w-6 h-6" />
            </div>
            <div>
              <h1 className="text-xl md:text-2xl font-bold tracking-tight">Batch Expiry & Tracking</h1>
              <p className="text-xs md:text-sm text-slate-500 dark:text-slate-400">
                Monitor shelf-life, set custom warning windows, track cost at risk, and initiate returns to suppliers.
              </p>
            </div>
          </div>
        </div>

        {/* Global Warning Window Pill & Quick Actions with Theme Button Styles */}
        <div className="flex items-center flex-wrap gap-2.5">
          {canUpdateExpiry ? (
            <button
              type="button"
              onClick={() => setGlobalModalOpen(true)}
              className={`inline-flex items-center gap-2 px-3.5 py-2 text-xs font-semibold theme-btn-secondary ${btnSecondary.className}`}
              style={btnSecondary.style}
              title="Edit Store Default Warning Window"
            >
              <ClockIcon className="w-4 h-4 text-amber-500" />
              <span>Store Default:</span>
              <span className="font-bold text-amber-600 dark:text-amber-400">{summary.global_warning_days} Days</span>
              <Cog6ToothIcon className="w-3.5 h-3.5 opacity-70" />
            </button>
          ) : (
            <div
              className={`inline-flex items-center gap-2 px-3.5 py-2 text-xs font-semibold rounded-xl border ${
                isDark ? "border-slate-700 bg-slate-800/80 text-slate-300" : "border-slate-200 bg-white text-slate-700"
              }`}
            >
              <ClockIcon className="w-4 h-4 text-amber-500" />
              <span>Store Default:</span>
              <span className="font-bold text-amber-600 dark:text-amber-400">{summary.global_warning_days} Days</span>
            </div>
          )}

          <button
            type="button"
            onClick={() => navigate("/product-batches")}
            className={`inline-flex items-center gap-1.5 px-3.5 py-2 text-xs font-semibold theme-btn-primary ${btnPrimary.className}`}
            style={btnPrimary.style}
            title="Open Keyboard-Driven Quick Batch Workbench to Add or Edit Batches"
          >
            <PencilSquareIcon className="w-4 h-4" />
            <span>Quick Add / Edit Batches</span>
          </button>

          <button
            type="button"
            onClick={() => setManageLocationsOpen(true)}
            className={`inline-flex items-center gap-1.5 px-3.5 py-2 text-xs font-semibold theme-btn-secondary ${btnSecondary.className}`}
            style={btnSecondary.style}
            title="Manage Storage Locations (Shop, Godown, Fridge)"
          >
            <BuildingStorefrontIcon className="w-4 h-4 text-indigo-500" />
            <span>Manage Locations</span>
          </button>

          <button
            type="button"
            onClick={fetchData}
            disabled={loading}
            className={`inline-flex items-center gap-1.5 px-3.5 py-2 text-xs font-semibold theme-btn-secondary ${btnSecondary.className}`}
            style={btnSecondary.style}
            title="Refresh (Ctrl+R)"
          >
            <ArrowPathIcon className={`w-3.5 h-3.5 ${loading ? "animate-spin" : ""}`} />
            <span>Refresh</span>
          </button>
        </div>
      </div>

      {/* KPI Metric Summary Cards */}
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-4 mb-6">
        {/* Card 1: Expired Stock */}
        <div
          onClick={() => setStatusFilter("expired")}
          className={`cursor-pointer p-4 rounded-xl border transition-all hover:scale-[1.01] ${
            statusFilter === "expired" ? "ring-2 ring-red-500" : ""
          } ${isDark ? "bg-red-950/20 border-red-900/40" : "bg-red-50/70 border-red-200"}`}
        >
          <div className="flex items-center justify-between mb-2">
            <span className="text-xs font-bold uppercase tracking-wider text-red-600 dark:text-red-400">
              Expired Stock
            </span>
            <div className="p-1.5 rounded-lg bg-red-500/10 text-red-600 dark:text-red-400">
              <ShieldExclamationIcon className="w-4 h-4" />
            </div>
          </div>
          <div className="text-2xl font-black text-red-600 dark:text-red-400 mb-1">
            {fmtNumber(summary.total_expired_batches)} <span className="text-xs font-normal text-slate-500">Batches</span>
          </div>
          <div className="flex items-center justify-between text-xs text-slate-600 dark:text-slate-400">
            <span>{fmtNumber(summary.total_expired_qty)} Units</span>
            <span className="font-semibold text-red-700 dark:text-red-300">
              Rs. {fmtCurrency(summary.total_expired_value)}
            </span>
          </div>
        </div>

        {/* Card 2: Critical (<= 30 Days) */}
        <div
          onClick={() => setStatusFilter("critical")}
          className={`cursor-pointer p-4 rounded-xl border transition-all hover:scale-[1.01] ${
            statusFilter === "critical" ? "ring-2 ring-orange-500" : ""
          } ${isDark ? "bg-orange-950/20 border-orange-900/40" : "bg-orange-50/70 border-orange-200"}`}
        >
          <div className="flex items-center justify-between mb-2">
            <span className="text-xs font-bold uppercase tracking-wider text-orange-600 dark:text-orange-400">
              Critical (≤ 30 Days)
            </span>
            <div className="p-1.5 rounded-lg bg-orange-500/10 text-orange-600 dark:text-orange-400">
              <ExclamationTriangleIcon className="w-4 h-4" />
            </div>
          </div>
          <div className="text-2xl font-black text-orange-600 dark:text-orange-400 mb-1">
            {fmtNumber(summary.total_critical_batches)} <span className="text-xs font-normal text-slate-500">Batches</span>
          </div>
          <div className="flex items-center justify-between text-xs text-slate-600 dark:text-slate-400">
            <span>{fmtNumber(summary.total_critical_qty)} Units</span>
            <span className="font-semibold text-orange-700 dark:text-orange-300">
              Rs. {fmtCurrency(summary.total_critical_value)}
            </span>
          </div>
        </div>

        {/* Card 3: Warning Window */}
        <div
          onClick={() => setStatusFilter("warning")}
          className={`cursor-pointer p-4 rounded-xl border transition-all hover:scale-[1.01] ${
            statusFilter === "warning" ? "ring-2 ring-amber-500" : ""
          } ${isDark ? "bg-amber-950/20 border-amber-900/40" : "bg-amber-50/70 border-amber-200"}`}
        >
          <div className="flex items-center justify-between mb-2">
            <span className="text-xs font-bold uppercase tracking-wider text-amber-600 dark:text-amber-400">
              In Warning Window
            </span>
            <div className="p-1.5 rounded-lg bg-amber-500/10 text-amber-600 dark:text-amber-400">
              <ClockIcon className="w-4 h-4" />
            </div>
          </div>
          <div className="text-2xl font-black text-amber-600 dark:text-amber-400 mb-1">
            {fmtNumber(summary.total_warning_batches)} <span className="text-xs font-normal text-slate-500">Batches</span>
          </div>
          <div className="flex items-center justify-between text-xs text-slate-600 dark:text-slate-400">
            <span>{fmtNumber(summary.total_warning_qty)} Units</span>
            <span className="font-semibold text-amber-700 dark:text-amber-300">
              Rs. {fmtCurrency(summary.total_warning_value)}
            </span>
          </div>
        </div>

        {/* Card 4: Total Value At Risk */}
        <div
          className={`p-4 rounded-xl border ${
            isDark ? "bg-slate-800/60 border-slate-700" : "bg-white border-slate-200 shadow-xs"
          }`}
        >
          <div className="flex items-center justify-between mb-2">
            <span className="text-xs font-bold uppercase tracking-wider text-slate-500 dark:text-slate-400">
              Total Stock Value at Risk
            </span>
            <div className="p-1.5 rounded-lg bg-blue-500/10 text-blue-600 dark:text-blue-400">
              <CurrencyDollarIcon className="w-4 h-4" />
            </div>
          </div>
          <div className="text-2xl font-black text-blue-600 dark:text-blue-400 mb-1">
            Rs. {fmtCurrency(summary.total_stock_value_at_risk)}
          </div>
          <div className="text-xs text-slate-500 dark:text-slate-400">
            Across {fmtNumber(summary.total_batches_tracked)} tracked active batches
          </div>
        </div>
      </div>

      {/* Main Content Workspace */}
      <div className={`rounded-2xl border overflow-hidden ${isDark ? "bg-slate-800/80 border-slate-700" : "bg-white border-slate-200 shadow-xs"}`}>
        {/* Status Filter Tabs styled as Theme Buttons */}
        <div className={`flex overflow-x-auto whitespace-nowrap no-scrollbar sm:flex-wrap items-center gap-2 p-3.5 pb-2.5 sm:pb-3.5 border-b text-xs font-semibold ${isDark ? "border-slate-700 bg-slate-800/60" : "border-slate-200 bg-slate-50/70"}`}>
          {[
            { id: "all", label: "All Active Batches", count: summary.total_batches_tracked, dot: null },
            { id: "expired", label: "Expired", count: summary.total_expired_batches, dot: "bg-red-500" },
            { id: "critical", label: "Critical (≤30 Days)", count: summary.total_critical_batches, dot: "bg-orange-500" },
            { id: "warning", label: "In Warning Window", count: summary.total_warning_batches, dot: "bg-amber-400" },
            { id: "safe", label: "Safe Shelf-Life", count: Math.max(0, summary.total_batches_tracked - summary.total_warning_batches), dot: "bg-emerald-500" },
          ].map((tab) => {
            const isActive = statusFilter === tab.id;
            return (
              <button
                key={tab.id}
                type="button"
                onClick={() => {
                  setStatusFilter(tab.id);
                  setPage(1);
                }}
                className={`px-3.5 py-2 flex items-center gap-2 text-xs font-semibold transition-all ${
                  isActive
                    ? `theme-btn-primary ${btnPrimary.className}`
                    : `theme-btn-secondary ${btnSecondary.className}`
                }`}
                style={isActive ? btnPrimary.style : btnSecondary.style}
              >
                {tab.dot && <span className={`w-2 h-2 rounded-full shrink-0 ${tab.dot}`} />}
                <span>{tab.label}</span>
                <span
                  className={`text-[10px] px-1.5 py-0.5 rounded-full font-bold ${
                    isActive
                      ? "bg-white/20 text-white"
                      : isDark
                      ? "bg-slate-700 text-slate-300"
                      : "bg-slate-200 text-slate-700"
                  }`}
                >
                  {fmtNumber(tab.count)}
                </span>
              </button>
            );
          })}
        </div>

        {/* Filter Controls Bar with Search, Location, SupplierSearch, BrandSearch, Category & Sort */}
        <div className={`p-3.5 border-b grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-6 gap-3 items-center ${isDark ? "border-slate-700 bg-slate-800/40" : "border-slate-200 bg-white"}`}>
          {/* Search */}
          <div className="relative">
            <MagnifyingGlassIcon className="w-4 h-4 absolute left-3 top-2.5 text-slate-400 pointer-events-none" />
            <input
              type="text"
              value={search}
              onChange={(e) => {
                setSearch(e.target.value);
                setPage(1);
              }}
              placeholder="Search product, batch, rack..."
              className={`w-full h-[38px] pl-9 pr-3 rounded-xl border text-xs focus:ring-2 focus:ring-blue-500/20 focus:outline-hidden transition-all ${
                isDark
                  ? "bg-slate-800/80 border-slate-700 text-slate-200 placeholder-slate-400 focus:border-blue-500"
                  : "bg-white border-slate-200 text-slate-800 placeholder-slate-400 focus:border-blue-500"
              }`}
            />
          </div>

          {/* Storage Location React-Select */}
          <div>
            <Select
              value={
                locationFilterOptions.find((o) => o.value === String(storageLocationId)) ||
                locationFilterOptions[0]
              }
              onChange={(opt) => {
                setStorageLocationId(opt?.value || "");
                setPage(1);
              }}
              options={locationFilterOptions}
              styles={selectStyles}
              menuPortalTarget={typeof document !== "undefined" ? document.body : null}
              menuPosition="fixed"
              placeholder="All Locations"
              isSearchable={true}
              aria-label="Filter by Storage Location"
            />
          </div>

          {/* Supplier Select (Opens SupplierSearch modal) */}
          <div className="relative">
            <button
              type="button"
              onClick={() => setSupplierSearchOpen(true)}
              className={`w-full h-[38px] px-3 rounded-xl border text-xs font-medium flex items-center justify-between text-left transition-all ${
                isDark
                  ? "bg-slate-800/80 border-slate-700 text-slate-200 hover:border-slate-500"
                  : "bg-white border-slate-200 text-slate-800 hover:border-slate-400"
              }`}
              title={selectedSupplier ? `Selected: ${selectedSupplier.name}` : "Search and select a supplier"}
            >
              <div className="flex items-center gap-2 min-w-0 pr-1">
                <BuildingStorefrontIcon className="w-4 h-4 shrink-0 text-slate-400" />
                <span className={`truncate ${selectedSupplier ? "font-semibold text-slate-900 dark:text-slate-100" : "text-slate-400"}`}>
                  {selectedSupplier ? selectedSupplier.name : "All Suppliers"}
                </span>
              </div>
              <div className="flex items-center gap-1 shrink-0">
                {selectedSupplier ? (
                  <span
                    role="button"
                    tabIndex={0}
                    onClick={(e) => {
                      e.stopPropagation();
                      setSelectedSupplier(null);
                      setSupplierId("");
                      setPage(1);
                    }}
                    className="p-1 rounded-full hover:bg-slate-200 dark:hover:bg-slate-700 text-slate-400 hover:text-slate-600 dark:hover:text-slate-200 transition-colors"
                    title="Clear supplier"
                  >
                    <XMarkIcon className="w-3.5 h-3.5" />
                  </span>
                ) : (
                  <MagnifyingGlassIcon className="w-3.5 h-3.5 text-slate-400" />
                )}
              </div>
            </button>
          </div>

          {/* Brand Select (Opens BrandSearch modal) */}
          <div className="relative">
            <button
              type="button"
              onClick={() => setBrandSearchOpen(true)}
              className={`w-full h-[38px] px-3 rounded-xl border text-xs font-medium flex items-center justify-between text-left transition-all ${
                isDark
                  ? "bg-slate-800/80 border-slate-700 text-slate-200 hover:border-slate-500"
                  : "bg-white border-slate-200 text-slate-800 hover:border-slate-400"
              }`}
              title={selectedBrand ? `Selected: ${selectedBrand.name}` : "Search and select a brand"}
            >
              <div className="flex items-center gap-2 min-w-0 pr-1">
                <TagIcon className="w-4 h-4 shrink-0 text-slate-400" />
                <span className={`truncate ${selectedBrand ? "font-semibold text-slate-900 dark:text-slate-100" : "text-slate-400"}`}>
                  {selectedBrand ? selectedBrand.name : "All Brands"}
                </span>
              </div>
              <div className="flex items-center gap-1 shrink-0">
                {selectedBrand ? (
                  <span
                    role="button"
                    tabIndex={0}
                    onClick={(e) => {
                      e.stopPropagation();
                      setSelectedBrand(null);
                      setBrandId("");
                      setPage(1);
                    }}
                    className="p-1 rounded-full hover:bg-slate-200 dark:hover:bg-slate-700 text-slate-400 hover:text-slate-600 dark:hover:text-slate-200 transition-colors"
                    title="Clear brand"
                  >
                    <XMarkIcon className="w-3.5 h-3.5" />
                  </span>
                ) : (
                  <MagnifyingGlassIcon className="w-3.5 h-3.5 text-slate-400" />
                )}
              </div>
            </button>
          </div>

          {/* Category React-Select */}
          <div>
            <Select
              value={categoryOptions.find((o) => o.value === String(categoryId)) || categoryOptions[0]}
              onChange={(opt) => {
                setCategoryId(opt?.value || "");
                setPage(1);
              }}
              options={categoryOptions}
              styles={selectStyles}
              menuPortalTarget={typeof document !== "undefined" ? document.body : null}
              menuPosition="fixed"
              placeholder="All Categories"
              isSearchable={true}
              aria-label="Filter by Category"
            />
          </div>

          {/* Sort By React-Select & Sort Direction Toggle Button */}
          <div className="flex items-center gap-1.5">
            <div className="flex-1 min-w-0">
              <Select
                value={sortOptions.find((o) => o.value === sortBy) || sortOptions[0]}
                onChange={(opt) => {
                  setSortBy(opt?.value || "expiry_date");
                  setPage(1);
                }}
                options={sortOptions}
                styles={selectStyles}
                menuPortalTarget={typeof document !== "undefined" ? document.body : null}
                menuPosition="fixed"
                isSearchable={false}
                aria-label="Sort Batches By"
              />
            </div>
            <button
              type="button"
              onClick={() => setSortDir((prev) => (prev === "asc" ? "desc" : "asc"))}
              className={`h-[38px] px-3.5 text-xs font-semibold theme-btn-secondary shrink-0 ${btnSecondary.className}`}
              style={btnSecondary.style}
              title="Toggle sort direction"
            >
              {sortDir === "asc" ? "ASC ↑" : "DESC ↓"}
            </button>
          </div>
        </div>

        {/* Batches Table */}
        <div className="overflow-x-auto min-h-[350px]">
          <table className="w-full text-left border-collapse text-xs">
            <thead>
              <tr className={`border-b ${isDark ? "bg-slate-800 text-slate-400 border-slate-700" : "bg-slate-50 text-slate-600 border-slate-200"}`}>
                <th className="py-3 px-3.5 font-semibold">#</th>
                <th className="py-3 px-3.5 font-semibold">Product</th>
                <th className="py-3 px-3.5 font-semibold">Batch & Expiry</th>
                <th className="py-3 px-3.5 font-semibold">Location & Rack</th>
                <th className="py-3 px-3.5 font-semibold text-center">Remaining Days</th>
                <th className="py-3 px-3.5 font-semibold text-center">Quantity on Hand</th>
                <th className="py-3 px-3.5 font-semibold">Supplier</th>
                <th className="py-3 px-3.5 font-semibold text-right">Cost Value at Risk</th>
                <th className="py-3 px-3.5 font-semibold text-center">Warning Window</th>
                <th className="py-3 px-3.5 font-semibold text-center">Action</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-200 dark:divide-slate-700/60">
              {loading ? (
                <tr>
                  <td colSpan={10} className="py-12 text-center text-slate-400">
                    <ArrowPathIcon className="w-6 h-6 animate-spin mx-auto mb-2 text-blue-500" />
                    Loading batches...
                  </td>
                </tr>
              ) : rows.length === 0 ? (
                <tr>
                  <td colSpan={10} className="py-12 text-center text-slate-500 dark:text-slate-400">
                    <CheckCircleIcon className="w-8 h-8 mx-auto mb-2 text-emerald-500" />
                    No batches match the selected criteria.
                  </td>
                </tr>
              ) : (
                rows.map((row, index) => {
                  const isExpired = row.days_remaining < 0;
                  const isCritical = !isExpired && row.days_remaining <= 30;
                  const isWarning = !isExpired && !isCritical && row.days_remaining <= row.effective_warning_days;
                  const locMeta = getLocationTypeMeta(row.storage_location_type || "shop");
                  const rackCode = row.batch_rack || row.product_rack || "";

                  return (
                    <tr
                      key={row.batch_id}
                      className={`transition-colors ${
                        isExpired
                          ? isDark ? "bg-red-950/15 hover:bg-red-950/25" : "bg-red-50/40 hover:bg-red-50/80"
                          : isCritical
                          ? isDark ? "bg-orange-950/10 hover:bg-orange-950/20" : "bg-orange-50/30 hover:bg-orange-50/60"
                          : isDark ? "hover:bg-slate-700/30" : "hover:bg-slate-50"
                      }`}
                    >
                      <td className="py-3 px-3.5 text-slate-400">{(page - 1) * perPage + index + 1}</td>

                      {/* Product Name & Code */}
                      <td className="py-3 px-3.5">
                        <div className="font-semibold text-slate-900 dark:text-slate-100">{row.product_name}</div>
                        <div className="text-[11px] text-slate-500 dark:text-slate-400 flex items-center gap-2">
                          <span>Code: {row.product_code}</span>
                          {row.pack_size > 1 && (
                            <span className="text-slate-400">• Pack: {row.pack_size}</span>
                          )}
                          {row.brand_name && (
                            <span className="text-slate-400">• {row.brand_name}</span>
                          )}
                        </div>
                      </td>

                      {/* Batch Number & Expiry */}
                      <td className="py-3 px-3.5">
                        <div className="font-mono font-medium text-slate-800 dark:text-slate-200">
                          {row.batch_number || "—"}
                        </div>
                        <div className="text-[11px] text-slate-500 dark:text-slate-400">
                          Exp: <span className="font-medium text-slate-700 dark:text-slate-300">{row.expiry_date}</span>
                        </div>
                      </td>

                      {/* Storage Location & Rack */}
                      <td className="py-3 px-3.5">
                        <div className="flex items-center gap-1.5 flex-wrap">
                          <span
                            className={`inline-flex items-center px-2 py-0.5 rounded-full text-[11px] font-semibold border ${locMeta.badgeClass}`}
                          >
                            {row.storage_location_name || "Shop Counter"}
                          </span>
                          {rackCode && (
                            <span className="font-mono text-[11px] px-1.5 py-0.5 rounded bg-slate-100 dark:bg-slate-700 text-slate-700 dark:text-slate-300">
                              {rackCode}
                            </span>
                          )}
                        </div>
                      </td>

                      {/* Remaining Days Countdown Pill */}
                      <td className="py-3 px-3.5 text-center">
                        {isExpired ? (
                          <span className="inline-flex items-center gap-1 px-2.5 py-0.5 rounded-full text-[11px] font-bold bg-red-100 text-red-800 dark:bg-red-900/40 dark:text-red-300">
                            Expired ({Math.abs(row.days_remaining)}d ago)
                          </span>
                        ) : isCritical ? (
                          <span className="inline-flex items-center gap-1 px-2.5 py-0.5 rounded-full text-[11px] font-bold bg-orange-100 text-orange-800 dark:bg-orange-900/40 dark:text-orange-300">
                            {row.days_remaining} Days Left
                          </span>
                        ) : isWarning ? (
                          <span className="inline-flex items-center gap-1 px-2.5 py-0.5 rounded-full text-[11px] font-bold bg-amber-100 text-amber-800 dark:bg-amber-900/40 dark:text-amber-300">
                            {row.days_remaining} Days Left
                          </span>
                        ) : (
                          <span className="inline-flex items-center gap-1 px-2.5 py-0.5 rounded-full text-[11px] font-medium bg-emerald-100 text-emerald-800 dark:bg-emerald-900/40 dark:text-emerald-300">
                            {row.days_remaining} Days Left
                          </span>
                        )}
                      </td>

                      {/* Quantity on Hand */}
                      <td className="py-3 px-3.5 text-center">
                        <span className="font-bold text-slate-900 dark:text-slate-100">{fmtNumber(row.quantity)}</span>{" "}
                        <span className="text-[11px] text-slate-500">Units</span>
                        {row.pack_size > 1 && (
                          <div className="text-[10px] text-slate-400">
                            {row.packs_count} packs {row.loose_units ? `+ ${row.loose_units} loose` : ""}
                          </div>
                        )}
                      </td>

                      {/* Supplier */}
                      <td className="py-3 px-3.5">
                        <div className="font-medium text-slate-800 dark:text-slate-200">
                          {row.supplier_name || <span className="text-slate-400 italic">No supplier</span>}
                        </div>
                        {row.supplier_phone && (
                          <div className="text-[10px] text-slate-400">{row.supplier_phone}</div>
                        )}
                      </td>

                      {/* Financial Value at Risk */}
                      <td className="py-3 px-3.5 text-right">
                        <div className="font-bold text-slate-900 dark:text-slate-100">
                          Rs. {fmtCurrency(row.value_at_risk)}
                        </div>
                        <div className="text-[10px] text-slate-400">
                          @ Rs. {fmtCurrency(row.unit_cost)} / unit
                        </div>
                      </td>

                      {/* Configured Warning Window */}
                      <td className="py-3 px-3.5 text-center">
                        <div className="inline-flex items-center gap-1">
                          <span
                            className={`text-[11px] font-medium ${
                              row.has_custom_warning
                                ? "text-purple-600 dark:text-purple-400 font-bold"
                                : "text-slate-500 dark:text-slate-400"
                            }`}
                          >
                            {row.effective_warning_days} Days {row.has_custom_warning ? "(Custom)" : "(Default)"}
                          </span>
                          {canUpdateExpiry && (
                            <button
                              type="button"
                              onClick={() => openProductModal(row)}
                              className="p-1 rounded-md text-slate-400 hover:text-blue-600 dark:hover:text-blue-400 hover:bg-slate-100 dark:hover:bg-slate-700/50 transition-colors"
                              title="Configure alert window for this product"
                            >
                              <PencilSquareIcon className="w-3.5 h-3.5" />
                            </button>
                          )}
                        </div>
                      </td>

                      {/* Actions: Edit, Move Location, Return & Quarantine/Dispose Buttons */}
                      <td className="py-3 px-3.5 text-center">
                        <div className="inline-flex items-center justify-center gap-1.5">
                          <button
                            type="button"
                            onClick={() =>
                              navigate(
                                `/product-batches?product_id=${row.product_id}&batch_id=${row.batch_id}`
                              )
                            }
                            className={`inline-flex items-center gap-1.5 px-2.5 py-1.5 text-[11px] font-semibold theme-btn-secondary ${btnSecondary.className}`}
                            style={btnSecondary.style}
                            title="Edit this batch in Quick Batch Workbench"
                          >
                            <PencilSquareIcon className="w-3.5 h-3.5 text-blue-500" />
                            <span>Edit</span>
                          </button>
                          <button
                            type="button"
                            onClick={() => setMoveModalBatch(row)}
                            className={`inline-flex items-center gap-1.5 px-2.5 py-1.5 text-[11px] font-semibold theme-btn-secondary ${btnSecondary.className}`}
                            style={btnSecondary.style}
                            title="Move or split stock to another location (e.g. Godown to Shop)"
                          >
                            <ArrowsRightLeftIcon className="w-3.5 h-3.5 text-indigo-500" />
                            <span>Move</span>
                          </button>
                          {canCreatePurchaseReturn && (
                            <button
                              type="button"
                              onClick={() => handleReturnToSupplier(row)}
                              className={`inline-flex items-center gap-1.5 px-3 py-1.5 text-[11px] font-semibold theme-btn-primary ${btnPrimary.className}`}
                              style={btnPrimary.style}
                              title="Create purchase return for this batch"
                            >
                              <ArrowUturnDownIcon className="w-3 h-3" />
                              <span>Return</span>
                            </button>
                          )}
                          {canCreateStockDisposal && (
                            <button
                              type="button"
                              onClick={() => handleDisposeBatch(row)}
                              className={`inline-flex items-center gap-1.5 px-3 py-1.5 text-[11px] font-semibold theme-btn-secondary ${btnSecondary.className}`}
                              style={btnSecondary.style}
                              title="Quarantine or dispose of this expired/near-expiry batch"
                            >
                              <ShieldExclamationIcon className="w-3.5 h-3.5 text-rose-500" />
                              <span>Quarantine / Dispose</span>
                            </button>
                          )}
                        </div>
                      </td>
                    </tr>
                  );
                })
              )}
            </tbody>
          </table>
        </div>

        {/* Pagination Bar with React-Select and Theme Buttons */}
        <div className={`p-3.5 border-t flex flex-col sm:flex-row items-center justify-between gap-3 text-xs ${isDark ? "border-slate-700 bg-slate-800" : "border-slate-200 bg-slate-50"}`}>
          <div className="text-slate-500 dark:text-slate-400 font-medium">
            Showing {rows.length ? (page - 1) * perPage + 1 : 0} to {Math.min(page * perPage, total)} of {fmtNumber(total)} batches
          </div>

          <div className="flex items-center gap-2.5">
            <div className="w-28">
              <Select
                value={perPageOptions.find((o) => o.value === perPage) || perPageOptions[1]}
                onChange={(opt) => {
                  setPerPage(Number(opt?.value || 25));
                  setPage(1);
                }}
                options={perPageOptions}
                styles={compactSelectStyles}
                menuPortalTarget={typeof document !== "undefined" ? document.body : null}
                menuPosition="fixed"
                isSearchable={false}
                aria-label="Batches per page"
              />
            </div>

            <button
              type="button"
              disabled={page <= 1}
              onClick={() => setPage((p) => Math.max(1, p - 1))}
              className={`px-3 py-1.5 text-xs font-semibold theme-btn-secondary ${btnSecondary.className} disabled:opacity-40 disabled:cursor-not-allowed`}
              style={btnSecondary.style}
            >
              Previous
            </button>
            <span className="text-slate-600 dark:text-slate-300 font-semibold px-1">
              Page {page} of {Math.max(1, Math.ceil(total / perPage))}
            </span>
            <button
              type="button"
              disabled={page >= Math.ceil(total / perPage)}
              onClick={() => setPage((p) => p + 1)}
              className={`px-3 py-1.5 text-xs font-semibold theme-btn-secondary ${btnSecondary.className} disabled:opacity-40 disabled:cursor-not-allowed`}
              style={btnSecondary.style}
            >
              Next
            </button>
          </div>
        </div>
      </div>

      {/* MODAL 1: Store Global Default Warning Days */}
      {globalModalOpen && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/60 backdrop-blur-xs">
          <div className={`w-full max-w-md rounded-2xl p-6 border shadow-2xl ${isDark ? "bg-slate-800 border-slate-700 text-slate-100" : "bg-white border-slate-200 text-slate-800"}`}>
            <div className="flex items-center justify-between mb-4">
              <div className="flex items-center gap-2.5">
                <div className="p-2 rounded-xl bg-amber-500/10 text-amber-500">
                  <Cog6ToothIcon className="w-5 h-5" />
                </div>
                <h3 className="font-bold text-base">Store Default Expiry Warning</h3>
              </div>
              <button
                type="button"
                onClick={() => setGlobalModalOpen(false)}
                className="p-1 rounded-lg text-slate-400 hover:text-slate-600 dark:hover:text-slate-200 hover:bg-slate-100 dark:hover:bg-slate-700 transition-colors"
              >
                <XMarkIcon className="w-5 h-5" />
              </button>
            </div>

            <p className="text-xs text-slate-500 dark:text-slate-400 mb-5 leading-relaxed">
              All products that do not have an individual override will trigger near-expiry warnings and notifications this many days before their expiration date.
            </p>

            <form onSubmit={handleSaveGlobalDays}>
              <div className="mb-5">
                <label className="block text-xs font-semibold uppercase tracking-wider text-slate-600 dark:text-slate-300 mb-2">
                  Warning Window (Days before expiry)
                </label>
                <div className="relative">
                  <input
                    type="number"
                    min={1}
                    max={3650}
                    value={newGlobalDays}
                    onChange={(e) => setNewGlobalDays(e.target.value)}
                    required
                    className={`w-full h-11 px-3.5 pr-14 rounded-xl border text-sm font-semibold focus:ring-2 focus:ring-blue-500/20 focus:outline-hidden transition-all ${
                      isDark
                        ? "bg-slate-700/80 border-slate-600 text-white focus:border-blue-500"
                        : "bg-white border-slate-300 text-slate-800 focus:border-blue-500"
                    }`}
                  />
                  <span className="absolute right-3.5 top-3 text-xs text-slate-400 font-medium">Days</span>
                </div>
                <div className="flex flex-wrap gap-2 mt-3">
                  {[30, 60, 90, 120, 180].map((preset) => {
                    const isSelected = Number(newGlobalDays) === preset;
                    return (
                      <button
                        key={preset}
                        type="button"
                        onClick={() => setNewGlobalDays(preset)}
                        className={`px-3 py-1 text-xs font-semibold transition-all ${
                          isSelected
                            ? `theme-btn-primary ${btnPrimary.className}`
                            : `theme-btn-secondary ${btnSecondary.className}`
                        }`}
                        style={isSelected ? btnPrimary.style : btnSecondary.style}
                      >
                        {preset}d
                      </button>
                    );
                  })}
                </div>
              </div>

              <div className="flex justify-end gap-2.5 pt-2 border-t border-slate-100 dark:border-slate-700/60">
                <button
                  type="button"
                  onClick={() => setGlobalModalOpen(false)}
                  className={`px-4 py-2 text-xs font-semibold theme-btn-secondary ${btnSecondary.className}`}
                  style={btnSecondary.style}
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  disabled={savingGlobal}
                  className={`px-4 py-2 text-xs font-semibold theme-btn-primary ${btnPrimary.className} disabled:opacity-50`}
                  style={btnPrimary.style}
                >
                  {savingGlobal ? "Saving..." : "Save Default Window"}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* MODAL 2: Product Warning Threshold Override */}
      {productModalOpen && selectedProduct && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/60 backdrop-blur-xs">
          <div className={`w-full max-w-md rounded-2xl p-6 border shadow-2xl ${isDark ? "bg-slate-800 border-slate-700 text-slate-100" : "bg-white border-slate-200 text-slate-800"}`}>
            <div className="flex items-center justify-between mb-4">
              <div className="flex items-center gap-2.5">
                <div className="p-2 rounded-xl bg-blue-500/10 text-blue-500">
                  <PencilSquareIcon className="w-5 h-5" />
                </div>
                <h3 className="font-bold text-base truncate">Configure Product Alert</h3>
              </div>
              <button
                type="button"
                onClick={() => setProductModalOpen(false)}
                className="p-1 rounded-lg text-slate-400 hover:text-slate-600 dark:hover:text-slate-200 hover:bg-slate-100 dark:hover:bg-slate-700 transition-colors"
              >
                <XMarkIcon className="w-5 h-5" />
              </button>
            </div>

            <div className="mb-4 p-3.5 rounded-xl bg-slate-100 dark:bg-slate-700/50 text-xs">
              <div className="font-bold text-slate-900 dark:text-slate-100">{selectedProduct.name}</div>
              <div className="text-slate-500 dark:text-slate-400 mt-0.5">Code: {selectedProduct.code}</div>
            </div>

            <form onSubmit={handleSaveProductDays}>
              <div className="mb-5 space-y-4">
                <label className="flex items-center gap-2.5 text-xs font-semibold cursor-pointer select-none">
                  <input
                    type="checkbox"
                    checked={useDefaultChecked}
                    onChange={(e) => {
                      setUseDefaultChecked(e.target.checked);
                      if (e.target.checked) {
                        setProductDaysInput(String(summary.global_warning_days || 90));
                      }
                    }}
                    className="w-4 h-4 rounded border-slate-300 text-blue-600 focus:ring-blue-500 cursor-pointer"
                  />
                  <span>Use Store Default ({summary.global_warning_days} Days)</span>
                </label>

                {!useDefaultChecked && (
                  <div>
                    <label className="block text-xs font-semibold uppercase tracking-wider text-slate-600 dark:text-slate-300 mb-2">
                      Custom Warning Window (Days before expiry)
                    </label>
                    <div className="relative">
                      <input
                        type="number"
                        min={1}
                        max={3650}
                        value={productDaysInput}
                        onChange={(e) => setProductDaysInput(e.target.value)}
                        required
                        className={`w-full h-11 px-3.5 pr-14 rounded-xl border text-sm font-semibold focus:ring-2 focus:ring-blue-500/20 focus:outline-hidden transition-all ${
                          isDark
                            ? "bg-slate-700/80 border-slate-600 text-white focus:border-blue-500"
                            : "bg-white border-slate-300 text-slate-800 focus:border-blue-500"
                        }`}
                      />
                      <span className="absolute right-3.5 top-3 text-xs text-slate-400 font-medium">Days</span>
                    </div>

                    <div className="flex flex-wrap gap-2 mt-3">
                      {[15, 30, 45, 60, 90, 180].map((preset) => {
                        const isSelected = Number(productDaysInput) === preset;
                        return (
                          <button
                            key={preset}
                            type="button"
                            onClick={() => setProductDaysInput(String(preset))}
                            className={`px-3 py-1 text-xs font-semibold transition-all ${
                              isSelected
                                ? `theme-btn-primary ${btnPrimary.className}`
                                : `theme-btn-secondary ${btnSecondary.className}`
                            }`}
                            style={isSelected ? btnPrimary.style : btnSecondary.style}
                          >
                            {preset}d
                          </button>
                        );
                      })}
                    </div>
                  </div>
                )}
              </div>

              <div className="flex justify-end gap-2.5 pt-2 border-t border-slate-100 dark:border-slate-700/60">
                <button
                  type="button"
                  onClick={() => setProductModalOpen(false)}
                  className={`px-4 py-2 text-xs font-semibold theme-btn-secondary ${btnSecondary.className}`}
                  style={btnSecondary.style}
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  disabled={savingProduct}
                  className={`px-4 py-2 text-xs font-semibold theme-btn-primary ${btnPrimary.className} disabled:opacity-50`}
                  style={btnPrimary.style}
                >
                  {savingProduct ? "Saving..." : "Save Setting"}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* MODAL 3: Dedicated Supplier Search Modal */}
      <SupplierSearch
        isOpen={supplierSearchOpen}
        onClose={() => setSupplierSearchOpen(false)}
        onSelect={handleSupplierSelect}
        title="Select Supplier"
      />

      {/* MODAL 4: Dedicated Brand Search Modal */}
      <BrandSearch
        isOpen={brandSearchOpen}
        onClose={() => setBrandSearchOpen(false)}
        onSelect={handleBrandSelect}
      />

      {/* MODAL 5: Move / Split Batch Location */}
      <MoveBatchLocationModal
        isOpen={Boolean(moveModalBatch)}
        onClose={() => setMoveModalBatch(null)}
        batch={moveModalBatch}
        storageLocations={storageLocations}
        onMoved={fetchData}
        isDark={isDark}
        selectStyles={selectStyles}
        packSize={moveModalBatch?.pack_size || 1}
      />

      {/* MODAL 6: Manage Storage Locations */}
      <ManageStorageLocationsModal
        isOpen={manageLocationsOpen}
        onClose={() => setManageLocationsOpen(false)}
        storageLocations={storageLocations}
        onChanged={async () => {
          await fetchStorageLocations();
          await fetchData();
        }}
        isDark={isDark}
        selectStyles={selectStyles}
      />
    </div>
  );
}
