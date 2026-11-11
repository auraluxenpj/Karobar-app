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
  FunnelIcon,
  BellAlertIcon,
  BellSlashIcon,
  CalendarDaysIcon,
} from "@heroicons/react/24/outline";
import {
  MoveBatchLocationModal,
  ManageStorageLocationsModal,
  getLocationTypeMeta,
} from "@/components/StorageLocationsModal.jsx";

const QUICK_MONTH_PILLS = [1, 2, 3, 4, 5, 6, 7, 8, 9, 12];

function formatDaysAsMonthsShort(days) {
  const d = Number(days || 0);
  if (d <= 0) return "0d";
  if (d % 365 === 0) {
    const yrs = d / 365;
    return `${yrs}Y (${d}d)`;
  }
  if (d >= 30 && d % 30 === 0) {
    return `${d / 30}M (${d}d)`;
  }
  if (d > 45) {
    return `~${Math.round(d / 30.4375)}M (${d}d)`;
  }
  return `${d}d`;
}

export default function BatchExpiryTracking() {
  const navigate = useNavigate();
  const { isDark, theme } = useTheme();
  const { loading: permsLoading, has } = usePermissions();
  const canUpdateExpiry = !permsLoading && has("batch-expiry.update");
  const canCreatePurchaseReturn = !permsLoading && has("purchase-return.create");
  const canCreateStockDisposal = !permsLoading && has("stock-disposal.create");

  // Dynamic Button styles matching Settings and app design system (guidelines/Design.md)
  const themeColors = useMemo(
    () => ({
      primary: theme?.primary_color || (isDark ? "#60A5FA" : "#2563EB"),
      primaryHover: theme?.primary_hover || (isDark ? "#93C5FD" : "#1D4ED8"),
      primaryLight: theme?.primary_light || (isDark ? "#172E50" : "#E8F0FF"),
      secondary: theme?.secondary_color || (isDark ? "#2DD4BF" : "#0F766E"),
      secondaryHover: theme?.secondary_hover || (isDark ? "#5EEAD4" : "#115E59"),
      secondaryLight: theme?.secondary_light || (isDark ? "#133632" : "#E3F5F1"),
      tertiary: theme?.tertiary_color || (isDark ? "#A78BFA" : "#7C3AED"),
      tertiaryHover: theme?.tertiary_hover || (isDark ? "#C4B5FD" : "#6D28D9"),
      tertiaryLight: theme?.tertiary_light || (isDark ? "#2D2448" : "#F0EAFF"),
      warning: theme?.warning_color || (isDark ? "#FBBF24" : "#B45309"),
      danger: theme?.danger_color || (isDark ? "#F87171" : "#DC2626"),
      dangerHover: isDark ? "#FCA5A5" : "#B91C1C",
      success: theme?.success_color || (isDark ? "#4ADE80" : "#15803D"),
    }),
    [theme, isDark]
  );

  const buttonStyle = theme?.button_style || "modern";
  const getButtonClasses = useMemo(
    () => getThemeButtonClasses(buttonStyle, themeColors, isDark),
    [buttonStyle, themeColors, isDark]
  );

  const btnPrimary = getButtonClasses.primary;
  const btnSecondary = getButtonClasses.secondary;

  // React-Select custom styles
  const selectStyles = useMemo(
    () => ({
      control: (base, state) => ({
        ...base,
        minHeight: "36px",
        height: "36px",
        borderRadius: "0.75rem",
        backgroundColor: isDark ? "rgba(30, 41, 59, 0.75)" : "rgba(255, 255, 255, 0.9)",
        borderColor: state.isFocused
          ? themeColors.primary
          : isDark
          ? "rgba(71, 85, 105, 0.7)"
          : "rgba(209, 213, 219, 0.8)",
        boxShadow: state.isFocused ? `0 0 0 2px ${themeColors.primary}33` : "none",
        fontSize: "0.8125rem",
        color: isDark ? "#f8fafc" : "#1e293b",
        backdropFilter: "blur(8px)",
        transition: "all 0.15s ease",
        "&:hover": {
          borderColor: themeColors.primary,
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
        height: "36px",
      }),
      dropdownIndicator: (base) => ({
        ...base,
        padding: "4px 8px",
        color: isDark ? "rgba(148, 163, 184, 0.7)" : "rgba(156, 163, 175, 0.8)",
        "&:hover": {
          color: themeColors.primary,
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
          ? themeColors.primary
          : state.isFocused
          ? isDark
            ? "rgba(51, 65, 85, 0.8)"
            : `${themeColors.primary}14`
          : "transparent",
        color: state.isSelected ? "#ffffff" : isDark ? "#f8fafc" : "#1e293b",
        fontSize: "0.8125rem",
        cursor: "pointer",
        padding: "8px 12px",
        transition: "background-color 0.1s ease",
      }),
    }),
    [isDark, themeColors]
  );

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
    global_critical_days: 30,
    daily_flash_limit: 5,
    month_buckets: {},
  });

  // Filters
  const [statusFilter, setStatusFilter] = useState("all"); // all, expired, critical, warning, safe
  const [monthsFilter, setMonthsFilter] = useState(""); // "" or month number e.g. "7"
  const [monthsMode, setMonthsMode] = useState("exact"); // "exact" (e.g. 7 months left) or "within" (<= 7 months)
  const [search, setSearch] = useState("");
  const [supplierId, setSupplierId] = useState("");
  const [selectedSupplier, setSelectedSupplier] = useState(null);
  const [brandId, setBrandId] = useState("");
  const [selectedBrand, setSelectedBrand] = useState(null);
  const [categoryId, setCategoryId] = useState("");
  const [storageLocationId, setStorageLocationId] = useState("");
  const [sortBy, setSortBy] = useState("expiry_date");
  const [sortDir, setSortDir] = useState("asc");
  const [moreFiltersOpen, setMoreFiltersOpen] = useState(false);

  // Daily 5x Warning Flash State
  const todayStr = useMemo(() => new Date().toISOString().slice(0, 10), []);
  const pageFlashKey = `karobar_batch_expiry_page_flash_${todayStr}`;
  const [flashWaveActive, setFlashWaveActive] = useState(false);
  const [flashKeyCounter, setFlashKeyCounter] = useState(0);
  const [dailyFlashCount, setDailyFlashCount] = useState(0);
  const [flashPausedToday, setFlashPausedToday] = useState(() => {
    try {
      const saved = JSON.parse(localStorage.getItem(pageFlashKey) || "{}");
      return Boolean(saved.paused);
    } catch {
      return false;
    }
  });

  // Search Modals State
  const [supplierSearchOpen, setSupplierSearchOpen] = useState(false);
  const [brandSearchOpen, setBrandSearchOpen] = useState(false);

  // Categories & Storage Locations metadata
  const [categories, setCategories] = useState([]);
  const [storageLocations, setStorageLocations] = useState([]);
  const [moveModalBatch, setMoveModalBatch] = useState(null);
  const [manageLocationsOpen, setManageLocationsOpen] = useState(false);

  // Modals for Global & Product warning/critical configuration
  const [globalModalOpen, setGlobalModalOpen] = useState(false);
  const [newGlobalDays, setNewGlobalDays] = useState(90);
  const [newCriticalDays, setNewCriticalDays] = useState(30);
  const [newDailyFlashLimit, setNewDailyFlashLimit] = useState(5);
  const [savingGlobal, setSavingGlobal] = useState(false);

  const [productModalOpen, setProductModalOpen] = useState(false);
  const [selectedProduct, setSelectedProduct] = useState(null);
  const [productDaysInput, setProductDaysInput] = useState("");
  const [productCriticalDaysInput, setProductCriticalDaysInput] = useState("");
  const [useDefaultChecked, setUseDefaultChecked] = useState(true);
  const [savingProduct, setSavingProduct] = useState(false);

  const fetchStorageLocations = useCallback(async () => {
    try {
      const locRes = await axios.get("/api/storage-locations");
      setStorageLocations(Array.isArray(locRes.data) ? locRes.data : []);
    } catch {
      // ignore
    }
  }, []);

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

  // Trigger a gentle 3-pulse warning flash wave (up to at least 5x/day automatically, or on manual replay)
  const triggerFlashWave = useCallback(
    (force = false, limitOverride = 5) => {
      try {
        const saved = JSON.parse(localStorage.getItem(pageFlashKey) || "{}");
        const count = Number(saved.count || 0);
        const paused = Boolean(saved.paused);
        const targetLimit = Math.max(5, Number(limitOverride || 5));

        if (!force && (paused || count >= targetLimit)) {
          setDailyFlashCount(count);
          return;
        }

        const nextCount = force ? Math.max(1, count) : count + 1;
        localStorage.setItem(
          pageFlashKey,
          JSON.stringify({
            count: nextCount,
            lastAt: Date.now(),
            paused: force ? false : paused,
          })
        );
        if (force) setFlashPausedToday(false);
        setDailyFlashCount(nextCount);
        setFlashWaveActive(true);
        setFlashKeyCounter((c) => c + 1);
      } catch {
        setFlashWaveActive(true);
      }
    },
    [pageFlashKey]
  );

  const togglePauseFlashToday = () => {
    const nextPaused = !flashPausedToday;
    setFlashPausedToday(nextPaused);
    if (nextPaused) {
      setFlashWaveActive(false);
    } else {
      setFlashWaveActive(true);
      setFlashKeyCounter((c) => c + 1);
    }
    try {
      const saved = JSON.parse(localStorage.getItem(pageFlashKey) || "{}");
      localStorage.setItem(
        pageFlashKey,
        JSON.stringify({
          ...saved,
          paused: nextPaused,
        })
      );
    } catch {
      // ignore
    }
  };

  // Listen to Topbar scheduled expiry-flash-wave events
  useEffect(() => {
    const onWave = (e) => {
      if (!flashPausedToday) {
        setFlashWaveActive(true);
        setFlashKeyCounter((c) => c + 1);
        if (e?.detail?.wave) {
          setDailyFlashCount(Number(e.detail.wave));
        }
      }
    };
    window.addEventListener("expiry-flash-wave", onWave);
    return () => window.removeEventListener("expiry-flash-wave", onWave);
  }, [flashPausedToday]);

  // Fetch batches with filters
  const fetchData = useCallback(async () => {
    setLoading(true);
    try {
      const params = {
        status: statusFilter,
        months: monthsFilter !== "" ? Number(monthsFilter) : undefined,
        months_mode: monthsFilter !== "" ? monthsMode : undefined,
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
      const fetchedRows = data.rows || [];
      setRows(fetchedRows);
      setTotal(data.total || 0);
      if (data.summary) {
        setSummary(data.summary);
        setNewGlobalDays(data.summary.global_warning_days || 90);
        setNewCriticalDays(data.summary.global_critical_days || 30);
        setNewDailyFlashLimit(data.summary.daily_flash_limit || 5);

        const hasWarnRows = fetchedRows.some(
          (r) => r.days_remaining <= (r.effective_warning_days || data.summary.global_warning_days || 90)
        );
        if (hasWarnRows) {
          triggerFlashWave(false, data.summary.daily_flash_limit || 5);
        }
      }
    } catch (err) {
      console.error("Failed to fetch batch expiry tracking data:", err);
      toast.error("Failed to load batch expiry data.");
    } finally {
      setLoading(false);
    }
  }, [
    statusFilter,
    monthsFilter,
    monthsMode,
    search,
    supplierId,
    brandId,
    categoryId,
    storageLocationId,
    sortBy,
    sortDir,
    page,
    perPage,
    triggerFlashWave,
  ]);

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

  // Save Global Warning + Critical Days + Daily Flash Limit
  const handleSaveGlobalDays = async (e) => {
    e.preventDefault();
    const warnVal = parseInt(newGlobalDays, 10);
    const critVal = parseInt(newCriticalDays, 10);
    const flashVal = parseInt(newDailyFlashLimit, 10);

    if (isNaN(warnVal) || warnVal < 1 || warnVal > 3650) {
      toast.error("Please enter a valid warning window between 1 and 3650 days.");
      return;
    }
    if (isNaN(critVal) || critVal < 1 || critVal > 3650) {
      toast.error("Please enter a valid critical window between 1 and 3650 days.");
      return;
    }
    if (critVal > warnVal) {
      toast.error("Critical expiry time cannot be greater than the Near-Expiry warning window.");
      return;
    }

    setSavingGlobal(true);
    try {
      await axios.put("/api/batch-expiry/global-warning", {
        expiry_warning_days: warnVal,
        expiry_critical_days: critVal,
        expiry_daily_flash_limit: isNaN(flashVal) ? 5 : Math.max(1, Math.min(20, flashVal)),
      });
      toast.success("Store expiry alert rules updated!");
      setGlobalModalOpen(false);
      window.dispatchEvent(new CustomEvent("notifications-changed"));
      fetchData();
      triggerFlashWave(true, isNaN(flashVal) ? 5 : flashVal);
    } catch (err) {
      console.error(err);
      toast.error("Failed to update global expiry alert rules.");
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
      customCriticalDays: row.product_critical_days,
      effectiveDays: row.effective_warning_days,
      effectiveCriticalDays: row.effective_critical_days,
    });
    const hasCustom =
      (row.product_warning_days !== null && row.product_warning_days !== undefined) ||
      (row.product_critical_days !== null && row.product_critical_days !== undefined);

    if (hasCustom) {
      setUseDefaultChecked(false);
      setProductDaysInput(String(row.product_warning_days ?? summary.global_warning_days ?? 90));
      setProductCriticalDaysInput(
        String(row.product_critical_days ?? summary.global_critical_days ?? 30)
      );
    } else {
      setUseDefaultChecked(true);
      setProductDaysInput(String(summary.global_warning_days || 90));
      setProductCriticalDaysInput(String(summary.global_critical_days || 30));
    }
    setProductModalOpen(true);
  };

  // Save Product Warning & Critical Days
  const handleSaveProductDays = async (e) => {
    e.preventDefault();
    if (!selectedProduct) return;

    let payloadWarningDays = null;
    let payloadCriticalDays = null;

    if (!useDefaultChecked) {
      const warnVal = parseInt(productDaysInput, 10);
      const critVal = parseInt(productCriticalDaysInput, 10);
      if (isNaN(warnVal) || warnVal < 1 || warnVal > 3650) {
        toast.error("Please enter a valid warning window between 1 and 3650 days.");
        return;
      }
      if (isNaN(critVal) || critVal < 1 || critVal > 3650) {
        toast.error("Please enter a valid critical window between 1 and 3650 days.");
        return;
      }
      if (critVal > warnVal) {
        toast.error("Critical threshold cannot exceed the warning threshold.");
        return;
      }
      payloadWarningDays = warnVal;
      payloadCriticalDays = critVal;
    }

    setSavingProduct(true);
    try {
      await axios.put(`/api/batch-expiry/product-warning/${selectedProduct.id}`, {
        expiry_warning_days: payloadWarningDays,
        expiry_critical_days: payloadCriticalDays,
      });
      toast.success(
        payloadWarningDays
          ? `Alert rules for "${selectedProduct.name}" updated (Warning: ${payloadWarningDays}d, Critical: ${payloadCriticalDays}d)!`
          : `"${selectedProduct.name}" reset to store defaults.`
      );
      setProductModalOpen(false);
      window.dispatchEvent(new CustomEvent("notifications-changed"));
      fetchData();
    } catch (err) {
      console.error(err);
      toast.error("Failed to update product alert rules.");
    } finally {
      setSavingProduct(false);
    }
  };

  // Initiate Return to Supplier
  const handleReturnToSupplier = (row) => {
    if (!row.supplier_id) {
      toast.error("This product does not have an assigned supplier. Please assign a supplier first.");
      return;
    }

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

  // Navigate to Quarantine / Stock Disposal creation
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
      { value: "days_remaining", label: "Sort: Remaining Time" },
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

  const activeSecondaryFilterCount =
    (storageLocationId ? 1 : 0) + (brandId ? 1 : 0) + (categoryId ? 1 : 0);

  const criticalThresholdLabel = formatDaysAsMonthsShort(summary.global_critical_days || 30);
  const warningThresholdLabel = formatDaysAsMonthsShort(summary.global_warning_days || 90);
  const targetFlashLimit = Math.max(5, Number(summary.daily_flash_limit || 5));

  return (
    <div
      className={`p-4 md:p-5 min-h-screen ${
        isDark ? "bg-slate-900 text-slate-100" : "bg-slate-50 text-slate-800"
      }`}
    >
      {/* Top Header */}
      <div className="flex flex-col lg:flex-row lg:items-center justify-between gap-3 mb-5">
        <div className="flex items-center gap-3">
          <div
            className="p-2.5 rounded-xl shrink-0 border"
            style={{
              backgroundColor: `${themeColors.warning}1A`,
              color: themeColors.warning,
              borderColor: `${themeColors.warning}33`,
            }}
          >
            <ClockIcon className="w-6 h-6" />
          </div>
          <div>
            <h1 className="text-xl font-bold tracking-tight">Batch Expiry &amp; Shelf-Life Radar</h1>
            <p className="text-xs text-slate-500 dark:text-slate-400">
              Filter by remaining months, customize critical &amp; warning windows, and manage supplier returns.
            </p>
          </div>
        </div>

        {/* Unified Alert Rules Button & Quick Actions */}
        <div className="flex items-center flex-wrap gap-2">
          {canUpdateExpiry ? (
            <button
              type="button"
              onClick={() => setGlobalModalOpen(true)}
              className={`inline-flex items-center gap-2 px-3 py-2 text-xs font-semibold theme-btn-secondary ${btnSecondary.className}`}
              style={btnSecondary.style}
              title="Configure Warning Window, Critical Time & Daily Flash Frequency"
            >
              <Cog6ToothIcon className="w-4 h-4" style={{ color: themeColors.warning }} />
              <span>
                Warn: <strong style={{ color: themeColors.warning }}>{warningThresholdLabel}</strong>
              </span>
              <span className="opacity-40">•</span>
              <span>
                Critical: <strong style={{ color: themeColors.danger }}>{criticalThresholdLabel}</strong>
              </span>
              <span className="opacity-40">•</span>
              <span>{targetFlashLimit}×/day</span>
            </button>
          ) : (
            <div
              className={`inline-flex items-center gap-2 px-3 py-2 text-xs font-semibold rounded-xl border ${
                isDark
                  ? "border-slate-700 bg-slate-800/80 text-slate-300"
                  : "border-slate-200 bg-white text-slate-700"
              }`}
            >
              <ClockIcon className="w-4 h-4" style={{ color: themeColors.warning }} />
              <span>Warn: {warningThresholdLabel}</span>
              <span>•</span>
              <span>Critical: {criticalThresholdLabel}</span>
            </div>
          )}

          {/* Daily Flash Control (Replay / Pause) */}
          <div
            className={`inline-flex items-center rounded-xl border text-xs font-semibold overflow-hidden ${
              isDark ? "border-slate-700 bg-slate-800/80" : "border-slate-200 bg-white"
            }`}
          >
            <button
              type="button"
              onClick={() => triggerFlashWave(true, targetFlashLimit)}
              className="inline-flex items-center gap-1.5 px-2.5 py-2 transition-opacity hover:opacity-80"
              style={{ color: themeColors.warning }}
              title="Trigger gentle warning flash on near-expiry products now"
            >
              <BellAlertIcon className="w-4 h-4" />
              <span>
                Flash ({Math.min(dailyFlashCount, targetFlashLimit)}/{targetFlashLimit})
              </span>
            </button>
            <button
              type="button"
              onClick={togglePauseFlashToday}
              className="px-2 py-2 border-l text-[11px] transition-colors"
              style={
                flashPausedToday
                  ? { color: themeColors.danger, fontWeight: "bold" }
                  : { color: isDark ? "#94a3b8" : "#64748b" }
              }
              title={flashPausedToday ? "Resume daily warning flash" : "Pause warning flash for today"}
            >
              {flashPausedToday ? "Paused" : "Mute"}
            </button>
          </div>

          <button
            type="button"
            onClick={() => navigate("/product-batches")}
            className={`inline-flex items-center gap-1.5 px-3 py-2 text-xs font-semibold theme-btn-primary ${btnPrimary.className}`}
            style={btnPrimary.style}
            title="Open Quick Batch Workbench"
          >
            <PencilSquareIcon className="w-4 h-4" />
            <span>Batch Workbench</span>
          </button>

          <button
            type="button"
            onClick={() => setManageLocationsOpen(true)}
            className={`inline-flex items-center gap-1.5 px-3 py-2 text-xs font-semibold theme-btn-secondary ${btnSecondary.className}`}
            style={btnSecondary.style}
            title="Manage Storage Locations (Shop, Godown, Fridge)"
          >
            <BuildingStorefrontIcon className="w-4 h-4" style={{ color: themeColors.secondary }} />
            <span className="hidden sm:inline">Locations</span>
          </button>

          <button
            type="button"
            onClick={fetchData}
            disabled={loading}
            className={`inline-flex items-center gap-1.5 px-2.5 py-2 text-xs font-semibold theme-btn-secondary ${btnSecondary.className}`}
            style={btnSecondary.style}
            title="Refresh (Ctrl+R)"
          >
            <ArrowPathIcon className={`w-4 h-4 ${loading ? "animate-spin" : ""}`} />
          </button>
        </div>
      </div>

      {/* 4 Interactive KPI Filter Cards */}
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-3 mb-4">
        {/* Card 1: All Tracked Batches */}
        <button
          type="button"
          onClick={() => {
            setStatusFilter("all");
            setPage(1);
          }}
          className={`text-left p-3.5 rounded-xl border transition-all cursor-pointer ${
            isDark ? "bg-slate-800/70 border-slate-700" : "bg-white border-slate-200"
          }`}
          style={
            statusFilter === "all" && monthsFilter === ""
              ? {
                  boxShadow: `0 0 0 2px ${themeColors.primary}`,
                  borderColor: themeColors.primary,
                }
              : {}
          }
        >
          <div className="flex items-center justify-between mb-1">
            <span
              className="text-[11px] font-bold uppercase tracking-wider"
              style={{ color: themeColors.primary }}
            >
              All Active Batches
            </span>
            <CurrencyDollarIcon className="w-4 h-4" style={{ color: themeColors.primary }} />
          </div>
          <div className="text-xl font-black" style={{ color: themeColors.primary }}>
            {fmtNumber(summary.total_batches_tracked)}{" "}
            <span className="text-xs font-normal text-slate-500">Batches</span>
          </div>
          <div className="text-[11px] text-slate-500 dark:text-slate-400 mt-0.5 truncate">
            Total Risk: <strong className="text-slate-700 dark:text-slate-200">Rs. {fmtCurrency(summary.total_stock_value_at_risk)}</strong>
          </div>
        </button>

        {/* Card 2: Expired Stock */}
        <button
          type="button"
          onClick={() => {
            setStatusFilter(statusFilter === "expired" ? "all" : "expired");
            setMonthsFilter("");
            setPage(1);
          }}
          className="text-left p-3.5 rounded-xl border transition-all cursor-pointer"
          style={{
            backgroundColor: isDark ? "rgba(220, 38, 38, 0.12)" : "rgba(220, 38, 38, 0.05)",
            borderColor:
              statusFilter === "expired" ? themeColors.danger : `${themeColors.danger}33`,
            boxShadow:
              statusFilter === "expired" ? `0 0 0 2px ${themeColors.danger}` : "none",
          }}
        >
          <div className="flex items-center justify-between mb-1">
            <span
              className="text-[11px] font-bold uppercase tracking-wider"
              style={{ color: themeColors.danger }}
            >
              Expired Stock
            </span>
            <ShieldExclamationIcon className="w-4 h-4" style={{ color: themeColors.danger }} />
          </div>
          <div className="text-xl font-black" style={{ color: themeColors.danger }}>
            {fmtNumber(summary.total_expired_batches)}{" "}
            <span className="text-xs font-normal text-slate-500">({fmtNumber(summary.total_expired_qty)} units)</span>
          </div>
          <div className="text-[11px] font-semibold mt-0.5" style={{ color: themeColors.danger }}>
            Rs. {fmtCurrency(summary.total_expired_value)}
          </div>
        </button>

        {/* Card 3: Critical (User Selected Threshold) */}
        <button
          type="button"
          onClick={() => {
            setStatusFilter(statusFilter === "critical" ? "all" : "critical");
            setMonthsFilter("");
            setPage(1);
          }}
          className="text-left p-3.5 rounded-xl border transition-all cursor-pointer"
          style={{
            backgroundColor: isDark ? "rgba(220, 38, 38, 0.08)" : "rgba(220, 38, 38, 0.03)",
            borderColor:
              statusFilter === "critical" ? themeColors.danger : `${themeColors.danger}26`,
            boxShadow:
              statusFilter === "critical" ? `0 0 0 2px ${themeColors.danger}` : "none",
          }}
        >
          <div className="flex items-center justify-between mb-1">
            <span
              className="text-[11px] font-bold uppercase tracking-wider"
              style={{ color: themeColors.danger }}
            >
              Critical (≤ {criticalThresholdLabel})
            </span>
            <ExclamationTriangleIcon className="w-4 h-4" style={{ color: themeColors.danger }} />
          </div>
          <div className="text-xl font-black" style={{ color: themeColors.danger }}>
            {fmtNumber(summary.total_critical_batches)}{" "}
            <span className="text-xs font-normal text-slate-500">({fmtNumber(summary.total_critical_qty)} units)</span>
          </div>
          <div className="text-[11px] font-semibold mt-0.5" style={{ color: themeColors.danger }}>
            Rs. {fmtCurrency(summary.total_critical_value)}
          </div>
        </button>

        {/* Card 4: Near-Expiry Warning Window */}
        <button
          type="button"
          onClick={() => {
            setStatusFilter(statusFilter === "warning" ? "all" : "warning");
            setMonthsFilter("");
            setPage(1);
          }}
          className="text-left p-3.5 rounded-xl border transition-all cursor-pointer"
          style={{
            backgroundColor: isDark ? "rgba(180, 83, 9, 0.12)" : "rgba(180, 83, 9, 0.05)",
            borderColor:
              statusFilter === "warning" ? themeColors.warning : `${themeColors.warning}33`,
            boxShadow:
              statusFilter === "warning" ? `0 0 0 2px ${themeColors.warning}` : "none",
          }}
        >
          <div className="flex items-center justify-between mb-1">
            <span
              className="text-[11px] font-bold uppercase tracking-wider"
              style={{ color: themeColors.warning }}
            >
              Near-Expiry (≤ {warningThresholdLabel})
            </span>
            <ClockIcon className="w-4 h-4" style={{ color: themeColors.warning }} />
          </div>
          <div className="text-xl font-black" style={{ color: themeColors.warning }}>
            {fmtNumber(summary.total_warning_batches)}{" "}
            <span className="text-xs font-normal text-slate-500">({fmtNumber(summary.total_warning_qty)} units)</span>
          </div>
          <div className="text-[11px] font-semibold mt-0.5" style={{ color: themeColors.warning }}>
            Rs. {fmtCurrency(summary.total_warning_value)}
          </div>
        </button>
      </div>

      {/* Main Content Workspace */}
      <div
        className={`rounded-2xl border overflow-hidden ${
          isDark ? "bg-slate-800/80 border-slate-700" : "bg-white border-slate-200 shadow-xs"
        }`}
      >
        {/* Months Remaining Filter Strip */}
        <div
          className={`px-3.5 py-2.5 border-b flex flex-wrap items-center justify-between gap-2.5 ${
            isDark ? "border-slate-700 bg-slate-800/70" : "border-slate-200 bg-slate-50/80"
          }`}
        >
          <div className="flex items-center flex-wrap gap-1.5">
            <span className="inline-flex items-center gap-1 text-xs font-bold text-slate-600 dark:text-slate-300 mr-1">
              <CalendarDaysIcon className="w-4 h-4" style={{ color: themeColors.primary }} />
              <span>Filter by Months Left:</span>
            </span>

            <button
              type="button"
              onClick={() => {
                setMonthsFilter("");
                setPage(1);
              }}
              className={`px-2.5 py-1 rounded-lg text-xs font-semibold transition-all ${
                monthsFilter === ""
                  ? "text-white shadow-xs"
                  : isDark
                  ? "bg-slate-700/70 text-slate-300 hover:bg-slate-700"
                  : "bg-white border border-slate-200 text-slate-700 hover:bg-slate-100"
              }`}
              style={monthsFilter === "" ? { backgroundColor: themeColors.primary, color: "#ffffff" } : {}}
            >
              All
            </button>

            {QUICK_MONTH_PILLS.map((m) => {
              const isSelected = Number(monthsFilter) === m;
              const bucketCount = Number(summary.month_buckets?.[String(m)] || 0);
              return (
                <button
                  key={m}
                  type="button"
                  onClick={() => {
                    if (isSelected) {
                      setMonthsFilter("");
                    } else {
                      setMonthsFilter(String(m));
                      if (statusFilter === "expired") setStatusFilter("all");
                    }
                    setPage(1);
                  }}
                  className={`inline-flex items-center gap-1 px-2.5 py-1 rounded-lg text-xs font-semibold transition-all ${
                    isSelected
                      ? "text-white shadow-xs"
                      : isDark
                      ? "bg-slate-700/70 text-slate-300 hover:bg-slate-700"
                      : "bg-white border border-slate-200 text-slate-700 hover:bg-slate-100"
                  }`}
                  style={isSelected ? { backgroundColor: themeColors.primary, color: "#ffffff" } : {}}
                  title={
                    monthsMode === "exact"
                      ? `Show products with ~${m} month${m > 1 ? "s" : ""} remaining`
                      : `Show products expiring within ≤ ${m} month${m > 1 ? "s" : ""}`
                  }
                >
                  <span>{m}M</span>
                  {bucketCount > 0 && (
                    <span
                      className={`text-[10px] px-1 rounded-full font-bold ${
                        isSelected
                          ? "bg-white/25 text-white"
                          : isDark
                          ? "bg-slate-600 text-slate-200"
                          : "bg-slate-100 text-slate-600"
                      }`}
                    >
                      {bucketCount}
                    </span>
                  )}
                </button>
              );
            })}

            {/* Custom Month Number Input (e.g. type 7, 10, 15 months) */}
            <div className="inline-flex items-center gap-1 ml-1">
              <input
                type="number"
                min={1}
                max={120}
                value={monthsFilter}
                onChange={(e) => {
                  const val = e.target.value;
                  setMonthsFilter(val);
                  if (val !== "" && statusFilter === "expired") {
                    setStatusFilter("all");
                  }
                  setPage(1);
                }}
                placeholder="Custom M"
                aria-label="Custom months remaining filter"
                className={`w-20 h-7 px-2 rounded-lg border text-xs font-semibold focus:outline-hidden ${
                  isDark
                    ? "bg-slate-900 border-slate-700 text-slate-100 placeholder-slate-500"
                    : "bg-white border-slate-200 text-slate-800 placeholder-slate-400"
                }`}
                style={
                  monthsFilter !== ""
                    ? { borderColor: themeColors.primary }
                    : {}
                }
              />
              {monthsFilter !== "" && (
                <button
                  type="button"
                  onClick={() => {
                    setMonthsFilter("");
                    setPage(1);
                  }}
                  className="p-1 rounded-md transition-opacity hover:opacity-80"
                  style={{ color: themeColors.danger }}
                  title="Clear month filter"
                >
                  <XMarkIcon className="w-3.5 h-3.5" />
                </button>
              )}
            </div>
          </div>

          {/* Exact Month vs Within <= Months Toggle */}
          <div className="flex items-center gap-2">
            <div
              className={`inline-flex items-center rounded-lg p-0.5 border text-[11px] font-semibold ${
                isDark ? "bg-slate-900/70 border-slate-700" : "bg-slate-100 border-slate-200"
              }`}
              role="group"
              aria-label="Months filter mode"
            >
              <button
                type="button"
                onClick={() => {
                  setMonthsMode("exact");
                  setPage(1);
                }}
                className={`px-2 py-0.5 rounded-md transition-all ${
                  monthsMode === "exact"
                    ? "text-white"
                    : "text-slate-500 dark:text-slate-400"
                }`}
                style={monthsMode === "exact" ? { backgroundColor: themeColors.primary, color: "#ffffff" } : {}}
                title="Show products expiring specifically in the selected month (e.g. 7 months remaining)"
              >
                Exact Month (e.g. 7M Left)
              </button>
              <button
                type="button"
                onClick={() => {
                  setMonthsMode("within");
                  setPage(1);
                }}
                className={`px-2 py-0.5 rounded-md transition-all ${
                  monthsMode === "within"
                    ? "text-white"
                    : "text-slate-500 dark:text-slate-400"
                }`}
                style={monthsMode === "within" ? { backgroundColor: themeColors.primary, color: "#ffffff" } : {}}
                title="Show all products expiring within up to the selected months (≤ X Months)"
              >
                Within ≤ Months
              </button>
            </div>
          </div>
        </div>

        {/* Streamlined Primary Search & Filter Bar */}
        <div
          className={`p-3 border-b flex flex-wrap items-center gap-2.5 ${
            isDark ? "border-slate-700 bg-slate-800/40" : "border-slate-200 bg-white"
          }`}
        >
          {/* Search Input */}
          <div className="relative flex-1 min-w-[210px]">
            <MagnifyingGlassIcon className="w-4 h-4 absolute left-3 top-2.5 text-slate-400 pointer-events-none" />
            <input
              type="text"
              value={search}
              onChange={(e) => {
                setSearch(e.target.value);
                setPage(1);
              }}
              placeholder="Search product name, code, batch #, rack..."
              className={`w-full h-9 pl-9 pr-8 rounded-xl border text-xs focus:outline-hidden transition-all ${
                isDark
                  ? "bg-slate-800/80 border-slate-700 text-slate-200 placeholder-slate-400"
                  : "bg-white border-slate-200 text-slate-800 placeholder-slate-400"
              }`}
            />
            {search && (
              <button
                type="button"
                onClick={() => {
                  setSearch("");
                  setPage(1);
                }}
                className="absolute right-2.5 top-2.5 text-slate-400 hover:text-slate-600"
              >
                <XMarkIcon className="w-4 h-4" />
              </button>
            )}
          </div>

          {/* Supplier Filter */}
          <button
            type="button"
            onClick={() => setSupplierSearchOpen(true)}
            className={`h-9 px-3 rounded-xl border text-xs font-medium flex items-center justify-between gap-2 min-w-[165px] transition-all ${
              isDark
                ? "bg-slate-800/80 border-slate-700 text-slate-200 hover:border-slate-500"
                : "bg-white border-slate-200 text-slate-800 hover:border-slate-400"
            }`}
            title={selectedSupplier ? `Selected Supplier: ${selectedSupplier.name}` : "Filter by Supplier"}
          >
            <div className="flex items-center gap-1.5 min-w-0">
              <BuildingStorefrontIcon className="w-4 h-4 shrink-0 text-slate-400" />
              <span
                className={`truncate ${
                  selectedSupplier ? "font-semibold text-slate-900 dark:text-slate-100" : "text-slate-400"
                }`}
              >
                {selectedSupplier ? selectedSupplier.name : "All Suppliers"}
              </span>
            </div>
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
                className="p-0.5 rounded-full hover:bg-slate-200 dark:hover:bg-slate-700 text-slate-400"
                title="Clear supplier"
              >
                <XMarkIcon className="w-3.5 h-3.5" />
              </span>
            ) : (
              <MagnifyingGlassIcon className="w-3.5 h-3.5 text-slate-400 shrink-0" />
            )}
          </button>

          {/* Brand Filter */}
          <button
            type="button"
            onClick={() => setBrandSearchOpen(true)}
            className={`h-9 px-3 rounded-xl border text-xs font-medium flex items-center justify-between gap-2 min-w-[165px] transition-all ${
              isDark
                ? "bg-slate-800/80 border-slate-700 text-slate-200 hover:border-slate-500"
                : "bg-white border-slate-200 text-slate-800 hover:border-slate-400"
            }`}
            title={selectedBrand ? `Selected Brand: ${selectedBrand.name}` : "Filter by Brand"}
          >
            <div className="flex items-center gap-1.5 min-w-0">
              <TagIcon className="w-4 h-4 shrink-0 text-slate-400" />
              <span
                className={`truncate ${
                  selectedBrand ? "font-semibold text-slate-900 dark:text-slate-100" : "text-slate-400"
                }`}
              >
                {selectedBrand ? selectedBrand.name : "All Brands"}
              </span>
            </div>
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
                className="p-0.5 rounded-full hover:bg-slate-200 dark:hover:bg-slate-700 text-slate-400"
                title="Clear brand"
              >
                <XMarkIcon className="w-3.5 h-3.5" />
              </span>
            ) : (
              <MagnifyingGlassIcon className="w-3.5 h-3.5 text-slate-400 shrink-0" />
            )}
          </button>

          {/* Sort By & Direction */}
          <div className="flex items-center gap-1.5">
            <div className="w-44">
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
              className={`h-9 px-3 text-xs font-semibold theme-btn-secondary shrink-0 ${btnSecondary.className}`}
              style={btnSecondary.style}
              title="Toggle sort direction"
            >
              {sortDir === "asc" ? "ASC ↑" : "DESC ↓"}
            </button>
          </div>

          {/* Collapsible More Filters Toggle */}
          <button
            type="button"
            onClick={() => setMoreFiltersOpen((v) => !v)}
            className={`h-9 px-3 rounded-xl border text-xs font-semibold inline-flex items-center gap-1.5 transition-all ${
              isDark
                ? "border-slate-700 bg-slate-800 text-slate-300 hover:bg-slate-700"
                : "border-slate-200 bg-slate-50 text-slate-700 hover:bg-slate-100"
            }`}
            style={
              moreFiltersOpen || activeSecondaryFilterCount > 0
                ? {
                    borderColor: `${themeColors.primary}80`,
                    backgroundColor: `${themeColors.primary}1A`,
                    color: themeColors.primary,
                  }
                : {}
            }
          >
            <FunnelIcon className="w-3.5 h-3.5" />
            <span>Filters</span>
            {activeSecondaryFilterCount > 0 && (
              <span
                className="px-1.5 py-0.2 rounded-full text-[10px] text-white font-bold"
                style={{ backgroundColor: themeColors.primary }}
              >
                {activeSecondaryFilterCount}
              </span>
            )}
          </button>
        </div>

        {/* Collapsible Secondary Filters (Location, Category, Safe Filter) */}
        {moreFiltersOpen && (
          <div
            className={`px-3.5 py-2.5 border-b grid grid-cols-1 sm:grid-cols-3 gap-2.5 items-center ${
              isDark ? "border-slate-700 bg-slate-900/40" : "border-slate-200 bg-slate-50/60"
            }`}
          >
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

            <div className="flex items-center justify-between gap-2">
              <button
                type="button"
                onClick={() => {
                  setStatusFilter(statusFilter === "safe" ? "all" : "safe");
                  setPage(1);
                }}
                className={`flex-1 h-9 px-3 rounded-xl border text-xs font-semibold transition-all ${
                  isDark
                    ? "border-slate-700 bg-slate-800 text-slate-300"
                    : "border-slate-200 bg-white text-slate-700"
                }`}
                style={
                  statusFilter === "safe"
                    ? {
                        borderColor: themeColors.success,
                        backgroundColor: `${themeColors.success}1A`,
                        color: themeColors.success,
                      }
                    : {}
                }
              >
                Safe Shelf-Life Only
              </button>
              {(storageLocationId || brandId || categoryId || statusFilter !== "all" || monthsFilter !== "") && (
                <button
                  type="button"
                  onClick={() => {
                    setStorageLocationId("");
                    setBrandId("");
                    setSelectedBrand(null);
                    setCategoryId("");
                    setStatusFilter("all");
                    setMonthsFilter("");
                    setPage(1);
                  }}
                  className="text-xs font-semibold hover:underline px-2 transition-opacity hover:opacity-80"
                  style={{ color: themeColors.danger }}
                >
                  Reset
                </button>
              )}
            </div>
          </div>
        )}

        {/* Active Filter Pill Banner when Months Filter is applied */}
        {monthsFilter !== "" && (
          <div
            className="px-4 py-2 border-b flex items-center justify-between text-xs"
            style={{
              backgroundColor: `${themeColors.primary}14`,
              borderColor: `${themeColors.primary}2E`,
              color: themeColors.primary,
            }}
          >
            <div className="flex items-center gap-2">
              <CalendarDaysIcon className="w-4 h-4" style={{ color: themeColors.primary }} />
              <span>
                Showing products with{" "}
                <strong>
                  {monthsMode === "exact"
                    ? `${monthsFilter} Month${Number(monthsFilter) > 1 ? "s" : ""} Remaining`
                    : `≤ ${monthsFilter} Month${Number(monthsFilter) > 1 ? "s" : ""} Remaining`}
                </strong>{" "}
                ({fmtNumber(total)} matching batch{total === 1 ? "" : "es"})
              </span>
            </div>
            <button
              type="button"
              onClick={() => {
                setMonthsFilter("");
                setPage(1);
              }}
              className="font-bold hover:underline"
            >
              Show All Months
            </button>
          </div>
        )}

        {/* Decluttered 7-Column Responsive Table */}
        <div
          tabIndex={0}
          role="region"
          aria-labelledby="batch-expiry-table-caption"
          className="batch-expiry-table-region min-h-[340px]"
        >
          <table className="batch-expiry-table text-left text-xs">
            <caption id="batch-expiry-table-caption" className="sr-only">
              Batch expiry and shelf-life tracking table
            </caption>
            <thead>
              <tr
                className={`border-b ${
                  isDark
                    ? "bg-slate-800 text-slate-400 border-slate-700"
                    : "bg-slate-50 text-slate-600 border-slate-200"
                }`}
              >
                <th scope="col" className="py-3 px-3.5 font-semibold">
                  Product
                </th>
                <th scope="col" className="py-3 px-3.5 font-semibold">
                  Batch &amp; Location
                </th>
                <th scope="col" className="py-3 px-3.5 font-semibold text-center">
                  Remaining Time
                </th>
                <th scope="col" className="py-3 px-3.5 font-semibold text-center">
                  On-Hand Stock
                </th>
                <th scope="col" className="py-3 px-3.5 font-semibold">
                  Supplier
                </th>
                <th scope="col" className="py-3 px-3.5 font-semibold text-right">
                  Cost at Risk
                </th>
                <th scope="col" className="py-3 px-3.5 font-semibold text-right">
                  Actions
                </th>
              </tr>
            </thead>
            <tbody key={flashKeyCounter} className="divide-y divide-slate-200 dark:divide-slate-700/60">
              {loading ? (
                <tr>
                  <td colSpan={7} className="py-12 text-center text-slate-400">
                    <ArrowPathIcon className="w-6 h-6 animate-spin mx-auto mb-2" style={{ color: themeColors.primary }} />
                    Loading batches...
                  </td>
                </tr>
              ) : rows.length === 0 ? (
                <tr>
                  <td colSpan={7} className="py-12 text-center text-slate-500 dark:text-slate-400">
                    <CheckCircleIcon className="w-8 h-8 mx-auto mb-2" style={{ color: themeColors.success }} />
                    No batches match the selected filter criteria.
                  </td>
                </tr>
              ) : (
                rows.map((row) => {
                  const effectiveCritical =
                    row.effective_critical_days || summary.global_critical_days || 30;
                  const effectiveWarning =
                    row.effective_warning_days || summary.global_warning_days || 90;

                  const isExpired = row.days_remaining < 0;
                  const isCritical = !isExpired && row.days_remaining <= effectiveCritical;
                  const isWarning =
                    !isExpired && !isCritical && row.days_remaining <= effectiveWarning;

                  const shouldFlashRow =
                    flashWaveActive &&
                    !flashPausedToday &&
                    (isExpired || isCritical || isWarning);

                  const flashRowClass = shouldFlashRow
                    ? isExpired || isCritical
                      ? "expiry-critical-flash-active"
                      : "expiry-warning-flash-active"
                    : "";

                  const locMeta = getLocationTypeMeta(row.storage_location_type || "shop");
                  const rackCode = row.batch_rack || row.product_rack || "";
                  const monthsLabel =
                    row.months_remaining_label ||
                    (isExpired
                      ? "Expired"
                      : `${Math.max(1, Math.ceil(row.days_remaining / 30.4375))} Months Left`);

                  return (
                    <tr
                      key={row.batch_id}
                      className={`transition-colors ${flashRowClass} ${
                        isExpired
                          ? isDark
                            ? "bg-red-950/15 hover:bg-red-950/25"
                            : "bg-red-50/40 hover:bg-red-50/80"
                          : isCritical
                          ? isDark
                            ? "bg-red-950/10 hover:bg-red-950/20"
                            : "bg-red-50/30 hover:bg-red-50/60"
                          : isWarning
                          ? isDark
                            ? "bg-amber-950/10 hover:bg-amber-950/20"
                            : "bg-amber-50/25 hover:bg-amber-50/50"
                          : isDark
                          ? "hover:bg-slate-700/30"
                          : "hover:bg-slate-50"
                      }`}
                    >
                      {/* 1. Product Name, Code & Brand */}
                      <th
                        scope="row"
                        className={`py-3 px-3.5 font-normal ${
                          isDark ? "bg-slate-800/95" : "bg-white/95"
                        }`}
                      >
                        <div className="font-semibold text-slate-900 dark:text-slate-100">
                          {row.product_name}
                        </div>
                        <div className="text-[11px] text-slate-500 dark:text-slate-400 flex items-center flex-wrap gap-1.5 mt-0.5">
                          <span>{row.product_code}</span>
                          {row.pack_size > 1 && <span>• Pack {row.pack_size}</span>}
                          {row.brand_name && (
                            <span className="px-1.5 py-0.2 rounded bg-slate-100 dark:bg-slate-700 text-slate-600 dark:text-slate-300 font-medium">
                              {row.brand_name}
                            </span>
                          )}
                        </div>
                      </th>

                      {/* 2. Batch, Expiry Date & Storage Location */}
                      <td data-label="Batch & Location" className="py-3 px-3.5">
                        <div className="flex items-center gap-2 flex-wrap">
                          <span className="font-mono font-bold text-slate-800 dark:text-slate-200">
                            {row.batch_number || "—"}
                          </span>
                          <span
                            className={`inline-flex items-center px-2 py-0.5 rounded-full text-[10px] font-semibold border ${locMeta.badgeClass}`}
                          >
                            {row.storage_location_name || "Shop"}
                            {rackCode ? ` · ${rackCode}` : ""}
                          </span>
                        </div>
                        <div className="text-[11px] text-slate-500 dark:text-slate-400 mt-0.5">
                          Exp:{" "}
                          <span className="font-semibold text-slate-700 dark:text-slate-300">
                            {row.expiry_date}
                          </span>
                        </div>
                      </td>

                      {/* 3. Remaining Time (Months + Days + Threshold Rule) */}
                      <td data-label="Remaining Time" className="py-3 px-3.5 text-center">
                        <div className="inline-flex flex-col items-center gap-0.5">
                          {isExpired ? (
                            <span
                              className={`inline-flex items-center gap-1 px-2.5 py-0.5 rounded-full text-[11px] font-bold border ${
                                shouldFlashRow ? "expiry-badge-flash-active" : ""
                              }`}
                              style={{
                                backgroundColor: `${themeColors.danger}20`,
                                color: themeColors.danger,
                                borderColor: `${themeColors.danger}40`,
                              }}
                            >
                              Expired ({Math.abs(row.days_remaining)}d ago)
                            </span>
                          ) : isCritical ? (
                            <span
                              className={`inline-flex items-center gap-1 px-2.5 py-0.5 rounded-full text-[11px] font-bold border ${
                                shouldFlashRow ? "expiry-badge-flash-active" : ""
                              }`}
                              style={{
                                backgroundColor: `${themeColors.danger}18`,
                                color: themeColors.danger,
                                borderColor: `${themeColors.danger}35`,
                              }}
                            >
                              {monthsLabel} ({row.days_remaining}d)
                            </span>
                          ) : isWarning ? (
                            <span
                              className={`inline-flex items-center gap-1 px-2.5 py-0.5 rounded-full text-[11px] font-bold border ${
                                shouldFlashRow ? "expiry-badge-flash-active" : ""
                              }`}
                              style={{
                                backgroundColor: `${themeColors.warning}20`,
                                color: themeColors.warning,
                                borderColor: `${themeColors.warning}40`,
                              }}
                            >
                              {monthsLabel} ({row.days_remaining}d)
                            </span>
                          ) : (
                            <span
                              className="inline-flex items-center gap-1 px-2.5 py-0.5 rounded-full text-[11px] font-semibold border"
                              style={{
                                backgroundColor: `${themeColors.success}1A`,
                                color: themeColors.success,
                                borderColor: `${themeColors.success}35`,
                              }}
                            >
                              {monthsLabel} ({row.days_remaining}d)
                            </span>
                          )}

                          <div className="text-[10px] text-slate-400 flex items-center gap-1">
                            <span>
                              Warn ≤ {formatDaysAsMonthsShort(effectiveWarning)} · Crit ≤{" "}
                              {formatDaysAsMonthsShort(effectiveCritical)}
                            </span>
                            {row.has_custom_warning && (
                              <span className="font-bold" style={{ color: themeColors.secondary }}>
                                (Custom)
                              </span>
                            )}
                          </div>
                        </div>
                      </td>

                      {/* 4. On-Hand Stock */}
                      <td data-label="On-Hand Stock" className="py-3 px-3.5 text-center">
                        <div>
                          <span className="font-bold text-slate-900 dark:text-slate-100">
                            {fmtNumber(row.quantity)}
                          </span>{" "}
                          <span className="text-[11px] text-slate-500">Units</span>
                        </div>
                        {row.pack_size > 1 && (
                          <div className="text-[10px] text-slate-400">
                            {row.packs_count} pk{" "}
                            {row.loose_units ? `+ ${row.loose_units} loose` : ""}
                          </div>
                        )}
                      </td>

                      {/* 5. Supplier */}
                      <td data-label="Supplier" className="py-3 px-3.5">
                        <div className="font-medium text-slate-800 dark:text-slate-200 truncate max-w-[160px]">
                          {row.supplier_name || (
                            <span className="text-slate-400 italic">No supplier</span>
                          )}
                        </div>
                        {row.expiry_policy_label && (
                          <div className="text-[10px] text-slate-400 truncate max-w-[160px]">
                            Policy: {row.expiry_policy_label}
                          </div>
                        )}
                      </td>

                      {/* 6. Cost Value at Risk */}
                      <td data-label="Cost at Risk" className="py-3 px-3.5 text-right">
                        <div className="font-bold text-slate-900 dark:text-slate-100">
                          Rs. {fmtCurrency(row.value_at_risk)}
                        </div>
                        <div className="text-[10px] text-slate-400">
                          @ Rs. {fmtCurrency(row.unit_cost)}/u
                        </div>
                      </td>

                      {/* 7. Decluttered Compact Actions */}
                      <td data-label="Actions" className="py-3 px-3.5 text-right">
                        <div className="inline-flex items-center justify-end gap-1">
                          {canCreatePurchaseReturn && (
                            <button
                              type="button"
                              onClick={() => handleReturnToSupplier(row)}
                              className={`inline-flex items-center gap-1 px-2.5 py-1.5 text-[11px] font-semibold theme-btn-primary ${btnPrimary.className}`}
                              style={btnPrimary.style}
                              title="Initiate Purchase Return to Supplier"
                            >
                              <ArrowUturnDownIcon className="w-3.5 h-3.5" />
                              <span>Return</span>
                            </button>
                          )}

                          <button
                            type="button"
                            onClick={() =>
                              navigate(
                                `/product-batches?product_id=${row.product_id}&batch_id=${row.batch_id}`
                              )
                            }
                            className="p-1.5 rounded-lg border border-slate-200 dark:border-slate-700 hover:bg-slate-100 dark:hover:bg-slate-700 transition-colors"
                            style={{ color: themeColors.primary }}
                            title="Edit Batch in Workbench"
                            aria-label="Edit Batch in Workbench"
                          >
                            <PencilSquareIcon className="w-4 h-4" />
                          </button>

                          <button
                            type="button"
                            onClick={() => setMoveModalBatch(row)}
                            className="p-1.5 rounded-lg border border-slate-200 dark:border-slate-700 hover:bg-slate-100 dark:hover:bg-slate-700 transition-colors"
                            style={{ color: themeColors.secondary }}
                            title="Move / Split Storage Location"
                            aria-label="Move or Split Storage Location"
                          >
                            <ArrowsRightLeftIcon className="w-4 h-4" />
                          </button>

                          {canUpdateExpiry && (
                            <button
                              type="button"
                              onClick={() => openProductModal(row)}
                              className="p-1.5 rounded-lg border border-slate-200 dark:border-slate-700 hover:bg-slate-100 dark:hover:bg-slate-700 transition-colors"
                              style={{ color: themeColors.warning }}
                              title="Configure Product Warning & Critical Time"
                              aria-label="Configure Product Warning and Critical Time"
                            >
                              <Cog6ToothIcon className="w-4 h-4" />
                            </button>
                          )}

                          {canCreateStockDisposal && (
                            <button
                              type="button"
                              onClick={() => handleDisposeBatch(row)}
                              className="p-1.5 rounded-lg border border-slate-200 dark:border-slate-700 hover:bg-slate-100 dark:hover:bg-slate-700 transition-colors"
                              style={{ color: themeColors.danger }}
                              title="Quarantine / Dispose Batch"
                              aria-label="Quarantine or Dispose Batch"
                            >
                              <ShieldExclamationIcon className="w-4 h-4" />
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

        {/* Pagination Bar */}
        <div
          className={`p-3 border-t flex flex-col sm:flex-row items-center justify-between gap-3 text-xs ${
            isDark ? "border-slate-700 bg-slate-800" : "border-slate-200 bg-slate-50"
          }`}
        >
          <div className="text-slate-500 dark:text-slate-400 font-medium">
            Showing {rows.length ? (page - 1) * perPage + 1 : 0} to{" "}
            {Math.min(page * perPage, total)} of {fmtNumber(total)} batches
          </div>

          <div className="flex items-center gap-2">
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

      {/* MODAL 1: Store Global Default Warning, Critical & Daily Flash Settings */}
      {globalModalOpen && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/60 backdrop-blur-xs">
          <div
            className={`w-full max-w-lg rounded-2xl p-6 border shadow-2xl ${
              isDark
                ? "bg-slate-800 border-slate-700 text-slate-100"
                : "bg-white border-slate-200 text-slate-800"
            }`}
          >
            <div className="flex items-center justify-between mb-4">
              <div className="flex items-center gap-2.5">
                <div
                  className="p-2 rounded-xl shrink-0 border"
                  style={{
                    backgroundColor: `${themeColors.warning}1A`,
                    color: themeColors.warning,
                    borderColor: `${themeColors.warning}33`,
                  }}
                >
                  <Cog6ToothIcon className="w-5 h-5" />
                </div>
                <div>
                  <h3 className="font-bold text-base">
                    Expiry Warning, Critical Time &amp; Daily Flash Rules
                  </h3>
                  <p className="text-[11px] text-slate-400">
                    Customize when products enter Near-Expiry Warning and Critical Expiry
                  </p>
                </div>
              </div>
              <button
                type="button"
                onClick={() => setGlobalModalOpen(false)}
                className="p-1 rounded-lg text-slate-400 hover:text-slate-600 dark:hover:text-slate-200"
              >
                <XMarkIcon className="w-5 h-5" />
              </button>
            </div>

            <form onSubmit={handleSaveGlobalDays} className="space-y-4">
              {/* 1. Near-Expiry Warning Window */}
              <div
                className="p-3.5 rounded-xl border"
                style={{
                  borderColor: `${themeColors.warning}33`,
                  backgroundColor: `${themeColors.warning}0A`,
                }}
              >
                <label
                  className="block text-xs font-bold uppercase tracking-wider mb-1.5"
                  style={{ color: themeColors.warning }}
                >
                  1. Near-Expiry Warning Window (Months / Days)
                </label>
                <div className="relative">
                  <input
                    type="number"
                    min={1}
                    max={3650}
                    value={newGlobalDays}
                    onChange={(e) => setNewGlobalDays(e.target.value)}
                    required
                    className={`w-full h-10 px-3.5 pr-20 rounded-xl border text-sm font-semibold focus:outline-hidden ${
                      isDark
                        ? "bg-slate-800 border-slate-600 text-white"
                        : "bg-white border-slate-300 text-slate-800"
                    }`}
                  />
                  <span className="absolute right-3.5 top-2.5 text-xs text-slate-400 font-medium">
                    Days (~{Math.max(1, Math.round(Number(newGlobalDays || 0) / 30))}M)
                  </span>
                </div>
                <div className="flex flex-wrap gap-1.5 mt-2">
                  {[
                    { days: 60, label: "2 Months (60d)" },
                    { days: 90, label: "3 Months (90d)" },
                    { days: 180, label: "6 Months (180d)" },
                    { days: 210, label: "7 Months (210d)" },
                    { days: 270, label: "9 Months (270d)" },
                    { days: 365, label: "12 Months (365d)" },
                  ].map((p) => {
                    const active = Number(newGlobalDays) === p.days;
                    return (
                      <button
                        key={p.days}
                        type="button"
                        onClick={() => setNewGlobalDays(p.days)}
                        className={`px-2.5 py-1 rounded-lg text-[11px] font-semibold transition-all ${
                          active
                            ? "text-white shadow-xs"
                            : isDark
                            ? "bg-slate-700 text-slate-300 hover:bg-slate-600"
                            : "bg-white border border-slate-200 text-slate-700 hover:bg-slate-100"
                        }`}
                        style={active ? { backgroundColor: themeColors.warning, color: "#ffffff" } : {}}
                      >
                        {p.label}
                      </button>
                    );
                  })}
                </div>
              </div>

              {/* 2. Critical Expiry Time (User Selectable, Not Hard-Coded) */}
              <div
                className="p-3.5 rounded-xl border"
                style={{
                  borderColor: `${themeColors.danger}33`,
                  backgroundColor: `${themeColors.danger}0A`,
                }}
              >
                <label
                  className="block text-xs font-bold uppercase tracking-wider mb-1.5"
                  style={{ color: themeColors.danger }}
                >
                  2. Critical Expiry Threshold (User Selected)
                </label>
                <div className="relative">
                  <input
                    type="number"
                    min={1}
                    max={3650}
                    value={newCriticalDays}
                    onChange={(e) => setNewCriticalDays(e.target.value)}
                    required
                    className={`w-full h-10 px-3.5 pr-20 rounded-xl border text-sm font-semibold focus:outline-hidden ${
                      isDark
                        ? "bg-slate-800 border-slate-600 text-white"
                        : "bg-white border-slate-300 text-slate-800"
                    }`}
                  />
                  <span className="absolute right-3.5 top-2.5 text-xs text-slate-400 font-medium">
                    Days (~{Math.max(1, Math.round(Number(newCriticalDays || 0) / 30))}M)
                  </span>
                </div>
                <div className="flex flex-wrap gap-1.5 mt-2">
                  {[
                    { days: 15, label: "15 Days" },
                    { days: 30, label: "1 Month (30d)" },
                    { days: 60, label: "2 Months (60d)" },
                    { days: 90, label: "3 Months (90d)" },
                    { days: 120, label: "4 Months (120d)" },
                  ].map((p) => {
                    const active = Number(newCriticalDays) === p.days;
                    return (
                      <button
                        key={p.days}
                        type="button"
                        onClick={() => setNewCriticalDays(p.days)}
                        className={`px-2.5 py-1 rounded-lg text-[11px] font-semibold transition-all ${
                          active
                            ? "text-white shadow-xs"
                            : isDark
                            ? "bg-slate-700 text-slate-300 hover:bg-slate-600"
                            : "bg-white border border-slate-200 text-slate-700 hover:bg-slate-100"
                        }`}
                        style={active ? { backgroundColor: themeColors.danger, color: "#ffffff" } : {}}
                      >
                        {p.label}
                      </button>
                    );
                  })}
                </div>
              </div>

              {/* 3. Daily Flash Warning Frequency */}
              <div
                className="p-3.5 rounded-xl border"
                style={{
                  borderColor: `${themeColors.primary}33`,
                  backgroundColor: `${themeColors.primary}0A`,
                }}
              >
                <label
                  className="block text-xs font-bold uppercase tracking-wider mb-1"
                  style={{ color: themeColors.primary }}
                >
                  3. Daily Near-Expiry Warning Flash Frequency
                </label>
                <p className="text-[11px] text-slate-500 dark:text-slate-400 mb-2">
                  How many times per day the app gently flashes near-expiry product warnings (recommended: at least 5 times daily).
                </p>
                <div className="flex items-center gap-2">
                  {[3, 5, 7, 10].map((cnt) => (
                    <button
                      key={cnt}
                      type="button"
                      onClick={() => setNewDailyFlashLimit(cnt)}
                      className={`px-3 py-1.5 rounded-lg text-xs font-semibold transition-all ${
                        Number(newDailyFlashLimit) === cnt
                          ? "text-white shadow-xs"
                          : isDark
                          ? "bg-slate-700 text-slate-300"
                          : "bg-white border border-slate-200 text-slate-700"
                      }`}
                      style={Number(newDailyFlashLimit) === cnt ? { backgroundColor: themeColors.primary, color: "#ffffff" } : {}}
                    >
                      {cnt}× / day
                    </button>
                  ))}
                  <input
                    type="number"
                    min={1}
                    max={20}
                    value={newDailyFlashLimit}
                    onChange={(e) => setNewDailyFlashLimit(e.target.value)}
                    className={`w-20 h-8 px-2.5 rounded-lg border text-xs font-bold ${
                      isDark
                        ? "bg-slate-800 border-slate-600 text-white"
                        : "bg-white border-slate-300 text-slate-800"
                    }`}
                  />
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
                  {savingGlobal ? "Saving..." : "Save Alert Rules"}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* MODAL 2: Product Warning & Critical Threshold Override */}
      {productModalOpen && selectedProduct && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/60 backdrop-blur-xs">
          <div
            className={`w-full max-w-md rounded-2xl p-6 border shadow-2xl ${
              isDark
                ? "bg-slate-800 border-slate-700 text-slate-100"
                : "bg-white border-slate-200 text-slate-800"
            }`}
          >
            <div className="flex items-center justify-between mb-4">
              <div className="flex items-center gap-2.5">
                <div
                  className="p-2 rounded-xl shrink-0 border"
                  style={{
                    backgroundColor: `${themeColors.primary}1A`,
                    color: themeColors.primary,
                    borderColor: `${themeColors.primary}33`,
                  }}
                >
                  <Cog6ToothIcon className="w-5 h-5" />
                </div>
                <h3 className="font-bold text-base truncate">Configure Product Expiry Rules</h3>
              </div>
              <button
                type="button"
                onClick={() => setProductModalOpen(false)}
                className="p-1 rounded-lg text-slate-400 hover:text-slate-600 dark:hover:text-slate-200"
              >
                <XMarkIcon className="w-5 h-5" />
              </button>
            </div>

            <div className="mb-4 p-3 rounded-xl bg-slate-100 dark:bg-slate-700/50 text-xs">
              <div className="font-bold text-slate-900 dark:text-slate-100">
                {selectedProduct.name}
              </div>
              <div className="text-slate-500 dark:text-slate-400 mt-0.5">
                Code: {selectedProduct.code}
              </div>
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
                        setProductCriticalDaysInput(String(summary.global_critical_days || 30));
                      }
                    }}
                    style={{ accentColor: themeColors.primary }}
                    className="w-4 h-4 rounded border-slate-300 cursor-pointer"
                  />
                  <span>
                    Use Store Defaults (Warn: {warningThresholdLabel}, Critical:{" "}
                    {criticalThresholdLabel})
                  </span>
                </label>

                {!useDefaultChecked && (
                  <div className="space-y-3">
                    <div>
                      <label
                        className="block text-xs font-semibold uppercase tracking-wider mb-1.5"
                        style={{ color: themeColors.warning }}
                      >
                        Custom Warning Window (Days)
                      </label>
                      <input
                        type="number"
                        min={1}
                        max={3650}
                        value={productDaysInput}
                        onChange={(e) => setProductDaysInput(e.target.value)}
                        required
                        className={`w-full h-10 px-3.5 rounded-xl border text-sm font-semibold ${
                          isDark
                            ? "bg-slate-700/80 border-slate-600 text-white"
                            : "bg-white border-slate-300 text-slate-800"
                        }`}
                      />
                      <div className="flex flex-wrap gap-1.5 mt-2">
                        {[
                          { d: 60, l: "2M (60d)" },
                          { d: 90, l: "3M (90d)" },
                          { d: 180, l: "6M (180d)" },
                          { d: 210, l: "7M (210d)" },
                          { d: 365, l: "12M (365d)" },
                        ].map((p) => (
                          <button
                            key={p.d}
                            type="button"
                            onClick={() => setProductDaysInput(String(p.d))}
                            className={`px-2.5 py-1 rounded-lg text-[11px] font-semibold transition-all ${
                              Number(productDaysInput) === p.d
                                ? "text-white shadow-xs"
                                : isDark
                                ? "bg-slate-700 text-slate-300 hover:bg-slate-600"
                                : "bg-slate-100 text-slate-700 hover:bg-slate-200"
                            }`}
                            style={Number(productDaysInput) === p.d ? { backgroundColor: themeColors.warning, color: "#ffffff" } : {}}
                          >
                            {p.l}
                          </button>
                        ))}
                      </div>
                    </div>

                    <div>
                      <label
                        className="block text-xs font-semibold uppercase tracking-wider mb-1.5"
                        style={{ color: themeColors.danger }}
                      >
                        Custom Critical Expiry Threshold (Days)
                      </label>
                      <input
                        type="number"
                        min={1}
                        max={3650}
                        value={productCriticalDaysInput}
                        onChange={(e) => setProductCriticalDaysInput(e.target.value)}
                        required
                        className={`w-full h-10 px-3.5 rounded-xl border text-sm font-semibold ${
                          isDark
                            ? "bg-slate-700/80 border-slate-600 text-white"
                            : "bg-white border-slate-300 text-slate-800"
                        }`}
                      />
                      <div className="flex flex-wrap gap-1.5 mt-2">
                        {[
                          { d: 15, l: "15d" },
                          { d: 30, l: "1M (30d)" },
                          { d: 60, l: "2M (60d)" },
                          { d: 90, l: "3M (90d)" },
                        ].map((p) => (
                          <button
                            key={p.d}
                            type="button"
                            onClick={() => setProductCriticalDaysInput(String(p.d))}
                            className={`px-2.5 py-1 rounded-lg text-[11px] font-semibold transition-all ${
                              Number(productCriticalDaysInput) === p.d
                                ? "text-white shadow-xs"
                                : isDark
                                ? "bg-slate-700 text-slate-300 hover:bg-slate-600"
                                : "bg-slate-100 text-slate-700 hover:bg-slate-200"
                            }`}
                            style={Number(productCriticalDaysInput) === p.d ? { backgroundColor: themeColors.danger, color: "#ffffff" } : {}}
                          >
                            {p.l}
                          </button>
                        ))}
                      </div>
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
                  {savingProduct ? "Saving..." : "Save Rule"}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* MODAL 3: Supplier Search Modal */}
      <SupplierSearch
        isOpen={supplierSearchOpen}
        onClose={() => setSupplierSearchOpen(false)}
        onSelect={handleSupplierSelect}
        title="Select Supplier"
      />

      {/* MODAL 4: Brand Search Modal */}
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
