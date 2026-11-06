// resources/js/pages/stocktake/Session.jsx
// The main counting interface for a stocktake session.
import React, { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { useNavigate, useParams, Link } from "react-router-dom";
import axios from "axios";
import toast from "react-hot-toast";
import Select from "react-select";
import {
  ClipboardDocumentListIcon,
  ArrowLeftIcon,
  PlayIcon,
  CheckCircleIcon,
  XMarkIcon,
  ArrowPathIcon,
  QrCodeIcon,
  MagnifyingGlassIcon,
  ChevronDownIcon,
  ExclamationTriangleIcon,
  EyeSlashIcon,
  PlusCircleIcon,
  PrinterIcon,
} from "@heroicons/react/24/solid";
import { useTheme } from "@/context/ThemeContext";
import { getThemeButtonClasses } from "@/utils/buttonStyles";
import { GlassCard } from "@/components";
import ShareDocumentModal from "@/components/ShareDocumentModal.jsx";

const getContrastText = (hex) => {
  hex = (hex || "#3b82f6").replace("#", "");
  const r = parseInt(hex.substring(0, 2), 16);
  const g = parseInt(hex.substring(2, 4), 16);
  const b = parseInt(hex.substring(4, 6), 16);
  return (0.299 * r + 0.587 * g + 0.114 * b) / 255 > 0.5 ? "#1f2937" : "#ffffff";
};

const STATUS_LABELS = {
  draft: "Draft",
  in_progress: "In Progress",
  pending_review: "Pending Review",
  finalized: "Finalized",
  cancelled: "Cancelled",
};

const STATUS_COLORS = {
  draft: "bg-slate-100 text-slate-600 dark:bg-slate-700 dark:text-slate-300",
  in_progress: "bg-blue-100 text-blue-700 dark:bg-blue-900/40 dark:text-blue-300",
  pending_review: "bg-amber-100 text-amber-700 dark:bg-amber-900/40 dark:text-amber-300",
  finalized: "bg-emerald-100 text-emerald-700 dark:bg-emerald-900/40 dark:text-emerald-300",
  cancelled: "bg-red-100 text-red-700 dark:bg-red-900/40 dark:text-red-300",
};

const FILTER_OPTIONS = [
  { value: "all", label: "All Items" },
  { value: "pending", label: "Pending" },
  { value: "counted", label: "Counted" },
];

export default function StocktakeSession() {
  const { id } = useParams();
  const navigate = useNavigate();
  const { isDark, theme } = useTheme();

  const [session, setSession] = useState(null);
  const [items, setItems] = useState([]);
  const [loading, setLoading] = useState(true);
  const [actionLoading, setActionLoading] = useState(false);
  const [filterStatus, setFilterStatus] = useState("all");
  const [searchQ, setSearchQ] = useState("");

  // Per-item count input state: { [itemId]: { value: string, saving: bool } }
  const [countInputs, setCountInputs] = useState({});
  const [savingItem, setSavingItem] = useState(null);

  // Add unexpected found item modal state
  const [showAddItemModal, setShowAddItemModal] = useState(false);
  const [shareOpen, setShareOpen] = useState(false);
  const [productSearchQ, setProductSearchQ] = useState("");
  const [productSearchResults, setProductSearchResults] = useState([]);
  const [searchingProducts, setSearchingProducts] = useState(false);
  const [selectedAddProduct, setSelectedAddProduct] = useState(null);
  const [addBatchNumber, setAddBatchNumber] = useState("");
  const [addExpiryDate, setAddExpiryDate] = useState("");
  const [addCountedQty, setAddCountedQty] = useState("");
  const [addingItem, setAddingItem] = useState(false);

  // Barcode scan state
  const [scanBuffer, setScanBuffer] = useState("");
  const scanTimerRef = useRef(null);
  const highlightedRowRef = useRef(null);
  const inputRefs = useRef({});

  const themeColors = useMemo(() => ({
    primary: theme?.primary_color || "#3b82f6",
    primaryHover: theme?.primary_hover || "#2563eb",
    primaryLight: theme?.primary_light || "#dbeafe",
    secondary: theme?.secondary_color || "#8b5cf6",
    secondaryHover: theme?.secondary_hover || "#7c3aed",
    danger: theme?.danger_color || "#ef4444",
    dangerHover: "#dc2626",
    dangerLight: "#fee2e2",
  }), [theme]);

  const primaryTextColor = useMemo(
    () => getContrastText(themeColors.primaryHover || themeColors.primary),
    [themeColors]
  );
  const buttonStyle = theme?.button_style || "modern";
  const getButtonClasses = useMemo(
    () => getThemeButtonClasses(buttonStyle, themeColors, isDark),
    [buttonStyle, themeColors, isDark]
  );
  const btnPrimary = getButtonClasses.primary;
  const btnDanger = getButtonClasses.danger;

  const selectStyles = useMemo(() => ({
    control: (base) => ({
      ...base,
      backgroundColor: isDark ? "#1e293b" : "#ffffff",
      borderColor: isDark ? "#475569" : "#d1d5db",
      minHeight: "34px",
    }),
    singleValue: (base) => ({ ...base, color: isDark ? "#e2e8f0" : "#111827" }),
    menu: (base) => ({ ...base, backgroundColor: isDark ? "#1e293b" : "#ffffff", zIndex: 50 }),
    option: (base, state) => ({
      ...base,
      backgroundColor: state.isFocused ? (isDark ? "#334155" : "#f1f5f9") : "transparent",
      color: isDark ? "#e2e8f0" : "#111827",
    }),
    input: (base) => ({ ...base, color: isDark ? "#e2e8f0" : "#111827" }),
  }), [isDark]);

  // Load session + items
  const loadSession = useCallback(async () => {
    setLoading(true);
    try {
      const [sessionRes, itemsRes] = await Promise.all([
        axios.get(`/api/stocktake-sessions/${id}`),
        axios.get(`/api/stocktake-sessions/${id}/items`, { params: { per_page: 2000 } }),
      ]);
      setSession(sessionRes.data);
      const itemList = Array.isArray(itemsRes.data?.data) ? itemsRes.data.data : (Array.isArray(itemsRes.data) ? itemsRes.data : []);
      setItems(itemList);

      // Init count inputs from existing counted_qty
      const initInputs = {};
      itemList.forEach((it) => {
        initInputs[it.id] = {
          value: it.counted_qty !== null && it.counted_qty !== undefined ? String(it.counted_qty) : "",
          saved: it.status === "counted",
        };
      });
      setCountInputs(initInputs);
    } catch {
      toast.error("Failed to load session");
    } finally {
      setLoading(false);
    }
  }, [id]);

  useEffect(() => { loadSession(); }, [loadSession]);

  // Barcode scan detection (rapid keystrokes ending in Enter)
  useEffect(() => {
    if (!session || !["in_progress"].includes(session.status)) return;

    const handleKeyDown = (e) => {
      // Ignore if focus is inside a qty input
      if (e.target.tagName === "INPUT" && e.target.type === "number") return;

      if (e.key === "Enter") {
        const barcode = scanBuffer.trim();
        setScanBuffer("");
        if (barcode.length >= 3) {
          // Find matching item
          const match = items.find(
            (it) =>
              it.product?.barcode === barcode ||
              it.product?.product_code === barcode
          );
          if (match) {
            const el = inputRefs.current[match.id];
            if (el) {
              el.focus();
              el.select();
              toast.success(`${match.product?.name}`, { duration: 1500 });
            }
          } else {
            toast.error(`No item found for barcode: ${barcode}`);
          }
        }
        return;
      }

      if (e.key.length === 1 && !e.ctrlKey && !e.altKey && !e.metaKey) {
        setScanBuffer((b) => b + e.key);
        clearTimeout(scanTimerRef.current);
        scanTimerRef.current = setTimeout(() => setScanBuffer(""), 150);
      }
    };

    window.addEventListener("keydown", handleKeyDown);
    return () => {
      window.removeEventListener("keydown", handleKeyDown);
      clearTimeout(scanTimerRef.current);
    };
  }, [session, items, scanBuffer]);

  // Filtered + searched items
  const filteredItems = useMemo(() => {
    let list = items;
    if (filterStatus !== "all") {
      list = list.filter((it) => it.status === filterStatus);
    }
    if (searchQ.trim()) {
      const q = searchQ.toLowerCase();
      list = list.filter(
        (it) =>
          it.product?.name?.toLowerCase().includes(q) ||
          it.product?.barcode?.toLowerCase().includes(q) ||
          it.product?.product_code?.toLowerCase().includes(q) ||
          it.product?.brand?.name?.toLowerCase().includes(q) ||
          it.batch_number?.toLowerCase().includes(q)
      );
    }
    return list;
  }, [items, filterStatus, searchQ]);

  const progress = useMemo(() => {
    const counted = items.filter((it) => it.status === "counted").length;
    return { counted, total: items.length, pct: items.length > 0 ? Math.round((counted / items.length) * 100) : 0 };
  }, [items]);

  // Actions
  const handleStart = async () => {
    setActionLoading(true);
    try {
      await axios.patch(`/api/stocktake-sessions/${id}/start`);
      toast.success("Session started — begin counting!");
      loadSession();
    } catch (err) {
      toast.error(err?.response?.data?.message || "Failed to start session");
    } finally {
      setActionLoading(false);
    }
  };

  const handleCancel = async () => {
    if (!confirm("Cancel this stocktake session? This cannot be undone.")) return;
    setActionLoading(true);
    try {
      await axios.patch(`/api/stocktake-sessions/${id}/cancel`);
      toast.success("Session cancelled");
      navigate("/stocktake-sessions");
    } catch (err) {
      toast.error(err?.response?.data?.message || "Failed to cancel");
    } finally {
      setActionLoading(false);
    }
  };

  const handleSubmitForReview = async () => {
    if (progress.counted < progress.total) {
      toast.error(`${progress.total - progress.counted} items still pending`);
      return;
    }
    setActionLoading(true);
    try {
      await axios.patch(`/api/stocktake-sessions/${id}/submit-review`);
      toast.success("Submitted for review");
      navigate(`/stocktake-sessions/${id}/review`);
    } catch (err) {
      toast.error(err?.response?.data?.message || "Failed to submit");
    } finally {
      setActionLoading(false);
    }
  };

  // Record count for a single item
  const handleSaveCount = async (item) => {
    const rawVal = countInputs[item.id]?.value;
    if (rawVal === "" || rawVal === undefined || rawVal === null) {
      toast.error("Enter a quantity (0 or more)");
      return;
    }
    const qty = parseFloat(rawVal);
    if (isNaN(qty) || qty < 0) {
      toast.error("Invalid quantity");
      return;
    }
    setSavingItem(item.id);
    try {
      const { data } = await axios.patch(`/api/stocktake-items/${item.id}`, {
        counted_qty: qty,
        discrepancy_reason: null,
      });
      // Update local item
      setItems((prev) =>
        prev.map((it) => (it.id === item.id ? { ...it, ...data } : it))
      );
      setCountInputs((prev) => ({
        ...prev,
        [item.id]: { value: String(data.counted_qty ?? qty), saved: true },
      }));
    } catch (err) {
      toast.error(err?.response?.data?.message || "Failed to save count");
    } finally {
      setSavingItem(null);
    }
  };

  // Search products for "+ Add Found Item" modal
  useEffect(() => {
    if (!showAddItemModal) return;
    const trimmed = productSearchQ.trim();
    if (trimmed.length < 1) {
      setProductSearchResults([]);
      return;
    }
    const timer = setTimeout(async () => {
      try {
        setSearchingProducts(true);
        const { data } = await axios.get("/api/products/search", { params: { q: trimmed, limit: 15 } });
        setProductSearchResults(Array.isArray(data?.data) ? data.data : (Array.isArray(data) ? data : []));
      } catch {
        setProductSearchResults([]);
      } finally {
        setSearchingProducts(false);
      }
    }, 250);
    return () => clearTimeout(timer);
  }, [showAddItemModal, productSearchQ]);

  const handleAddItemSubmit = async (e) => {
    e.preventDefault();
    if (!selectedAddProduct) {
      toast.error("Please select a product");
      return;
    }
    setAddingItem(true);
    try {
      const payload = {
        product_id: selectedAddProduct.id,
        batch_number: addBatchNumber.trim() || null,
        expiry_date: addExpiryDate || null,
        counted_qty: addCountedQty !== "" ? parseFloat(addCountedQty) : null,
      };
      const { data } = await axios.post(`/api/stocktake-sessions/${id}/items`, payload);
      toast.success(`Added ${selectedAddProduct.name} to count session`);
      setShowAddItemModal(false);
      setSelectedAddProduct(null);
      setProductSearchQ("");
      setAddBatchNumber("");
      setAddExpiryDate("");
      setAddCountedQty("");
      await loadSession();
      if (data?.id && inputRefs.current[data.id]) {
        inputRefs.current[data.id].focus();
      }
    } catch (err) {
      toast.error(err?.response?.data?.message || "Failed to add item to session");
    } finally {
      setAddingItem(false);
    }
  };

  // Input class helper
  const inputBaseCls = `w-24 text-right text-sm font-mono rounded-lg border px-2 py-1.5 focus:outline-none focus:ring-2 transition-colors ${
    isDark
      ? "bg-slate-800 border-slate-600 text-slate-100 focus:ring-blue-500/40"
      : "bg-white border-slate-300 text-slate-900 focus:ring-blue-500/40"
  }`;

  if (loading) {
    return (
      <div className="flex items-center justify-center h-64">
        <ArrowPathIcon className="w-8 h-8 animate-spin text-slate-400" />
      </div>
    );
  }

  if (!session) return null;

  const isReadonly = !["in_progress"].includes(session.status);

  return (
    <div className="space-y-4 px-1">
      {/* Back */}
      <div className="flex items-center gap-2">
        <Link
          to="/stocktake-sessions"
          className={`p-2 rounded-lg transition-colors ${
            isDark ? "hover:bg-slate-700 text-slate-400" : "hover:bg-slate-100 text-slate-500"
          }`}
        >
          <ArrowLeftIcon className="w-5 h-5" />
        </Link>
        <div className="flex-1 flex flex-wrap items-center gap-3">
          <div>
            <h1 className={`text-lg font-bold font-mono ${isDark ? "text-slate-100" : "text-slate-800"}`}>
              {session.reference_no}
            </h1>
            <p className={`text-xs ${isDark ? "text-slate-400" : "text-slate-500"}`}>
              {session.session_type === "full"
                ? "Full Stocktake"
                : `Cycle Count${session.scope_type ? ` — ${session.scope_type.charAt(0).toUpperCase() + session.scope_type.slice(1)}: ${session.scope_name || "#" + session.scope_id}` : ""}`}
              {session.is_blind && (
                <span className="ml-2 inline-flex items-center gap-0.5 text-orange-500 font-medium">
                  <EyeSlashIcon className="w-3.5 h-3.5" /> Blind Mode
                </span>
              )}
            </p>
          </div>
          <span className={`px-2.5 py-1 rounded-full text-xs font-semibold ${STATUS_COLORS[session.status]}`}>
            {STATUS_LABELS[session.status]}
          </span>
        </div>
      </div>

      {/* Progress Bar */}
      <GlassCard className="p-4">
        <div className="flex flex-col lg:flex-row lg:items-center gap-3.5">
          <div className="flex-1">
            <div className="flex justify-between text-xs font-medium mb-1.5">
              <span className={isDark ? "text-slate-300" : "text-slate-600"}>
                Progress: {progress.counted} / {progress.total} items counted
              </span>
              <span className="font-bold" style={{ color: themeColors.primary }}>
                {progress.pct}%
              </span>
            </div>
            <div className={`h-2.5 rounded-full overflow-hidden ${isDark ? "bg-slate-700" : "bg-slate-200"}`}>
              <div
                className="h-full rounded-full transition-all duration-500"
                style={{ width: `${progress.pct}%`, backgroundColor: themeColors.primary }}
              />
            </div>
          </div>

          {/* Action buttons */}
          <div className="flex flex-wrap items-center gap-2 w-full lg:w-auto">
            <button
              type="button"
              onClick={() => setShareOpen(true)}
              className={`flex items-center gap-1.5 px-3.5 py-2 rounded-lg text-sm font-semibold border transition-colors ${
                isDark
                  ? "bg-slate-800 border-slate-600 text-slate-200 hover:bg-slate-700"
                  : "bg-white border-slate-300 text-slate-700 hover:bg-slate-50"
              }`}
              title="Print or export Count Sheet / Variance PDF"
            >
              <PrinterIcon className="w-4 h-4 text-blue-500" />
              Count Sheet PDF
            </button>
            {session.status === "draft" && (
              <button
                onClick={handleStart}
                disabled={actionLoading}
                className={`flex items-center gap-1.5 px-4 py-2 rounded-lg text-sm font-semibold transition-colors disabled:opacity-60 ${btnPrimary.className}`}
                style={btnPrimary.style}
              >
                <PlayIcon className="w-4 h-4" />
                {actionLoading ? "Starting…" : "Start Session"}
              </button>
            )}

            {session.status === "in_progress" && (
              <>
                <button
                  type="button"
                  onClick={() => {
                    setSelectedAddProduct(null);
                    setProductSearchQ("");
                    setAddBatchNumber("");
                    setAddExpiryDate("");
                    setAddCountedQty("");
                    setShowAddItemModal(true);
                  }}
                  disabled={actionLoading}
                  className={`flex items-center gap-1.5 px-3.5 py-2 rounded-lg text-sm font-semibold border transition-colors ${
                    isDark
                      ? "bg-slate-800 border-slate-600 text-slate-200 hover:bg-slate-700"
                      : "bg-white border-slate-300 text-slate-700 hover:bg-slate-50"
                  }`}
                  title="Add unexpected product or batch found on shelf"
                >
                  <PlusCircleIcon className="w-4 h-4 text-emerald-500" />
                  Add Found Item
                </button>
                <button
                  onClick={handleSubmitForReview}
                  disabled={actionLoading || progress.counted < progress.total}
                  className={`flex items-center gap-1.5 px-4 py-2 rounded-lg text-sm font-semibold transition-colors disabled:opacity-60 ${btnPrimary.className}`}
                  style={btnPrimary.style}
                  title={progress.counted < progress.total ? `${progress.total - progress.counted} items pending` : "Submit for review"}
                >
                  <CheckCircleIcon className="w-4 h-4" />
                  {actionLoading ? "Submitting…" : "Complete Count"}
                </button>
                <button
                  onClick={handleCancel}
                  disabled={actionLoading}
                  className={`flex items-center gap-1.5 px-3 py-2 rounded-lg text-sm font-semibold transition-colors disabled:opacity-60 ${btnDanger.className}`}
                  style={btnDanger.style}
                >
                  <XMarkIcon className="w-4 h-4" />
                  Cancel
                </button>
              </>
            )}

            {session.status === "pending_review" && (
              <Link
                to={`/stocktake-sessions/${id}/review`}
                className={`flex items-center gap-1.5 px-4 py-2 rounded-lg text-sm font-semibold transition-colors ${btnPrimary.className}`}
                style={btnPrimary.style}
              >
                <CheckCircleIcon className="w-4 h-4" />
                Go to Review
              </Link>
            )}

            {session.status === "finalized" && session.stock_adjustment_id && (
              <Link
                to={`/stock-adjustments/${session.stock_adjustment_id}`}
                className={`flex items-center gap-1.5 px-4 py-2 rounded-lg text-sm font-semibold transition-colors ${btnPrimary.className}`}
                style={btnPrimary.style}
              >
                View Adjustment
              </Link>
            )}
          </div>
        </div>
      </GlassCard>

      {/* Blind mode notice */}
      {session.is_blind && session.status === "in_progress" && (
        <div className={`flex items-start gap-3 rounded-xl border px-4 py-3 ${
          isDark ? "border-orange-800/50 bg-orange-900/20 text-orange-300" : "border-orange-200 bg-orange-50 text-orange-700"
        }`}>
          <EyeSlashIcon className="w-5 h-5 mt-0.5 flex-shrink-0" />
          <div>
            <p className="font-semibold text-sm">Blind Count Active</p>
            <p className="text-xs mt-0.5 opacity-80">
              System quantities are hidden. Count each item physically and enter the exact number you see.
            </p>
          </div>
        </div>
      )}

      {/* Filters */}
      {session.status !== "draft" && (
        <div className="flex flex-wrap items-center gap-3">
          {/* Barcode scan hint */}
          <div className={`flex items-center gap-1.5 text-xs px-3 py-1.5 rounded-lg ${
            isDark ? "bg-slate-700/60 text-slate-400" : "bg-slate-100 text-slate-500"
          }`}>
            <QrCodeIcon className="w-3.5 h-3.5" />
            Scan barcode to jump to product
          </div>

          {/* Search */}
          <div className="relative">
            <MagnifyingGlassIcon className="absolute left-2.5 top-2 w-3.5 h-3.5 text-slate-400" />
            <input
              type="text"
              value={searchQ}
              onChange={(e) => setSearchQ(e.target.value)}
              placeholder="Search product / batch…"
              className={`pl-7 pr-3 py-1.5 text-sm rounded-lg border focus:outline-none focus:ring-2 transition-colors ${
                isDark
                  ? "bg-slate-800 border-slate-600 text-slate-100 focus:ring-blue-500/40 placeholder-slate-500"
                  : "bg-white border-slate-300 text-slate-900 focus:ring-blue-500/40 placeholder-slate-400"
              }`}
            />
          </div>

          {/* Status filter */}
          <div className="w-36">
            <Select
              options={FILTER_OPTIONS}
              value={FILTER_OPTIONS.find((o) => o.value === filterStatus)}
              onChange={(opt) => setFilterStatus(opt?.value || "all")}
              styles={selectStyles}
              isSearchable={false}
            />
          </div>

          <span className={`text-xs ml-auto ${isDark ? "text-slate-400" : "text-slate-500"}`}>
            {filteredItems.length} of {items.length} items shown
          </span>
        </div>
      )}

      {/* Items Table */}
      <GlassCard className="overflow-hidden">
        {session.status === "draft" ? (
          <div className={`py-16 text-center ${isDark ? "text-slate-400" : "text-slate-500"}`}>
            <ClipboardDocumentListIcon className="w-12 h-12 mx-auto mb-3 opacity-30" />
            <p className="font-medium">Session is in Draft</p>
            <p className="text-sm mt-1 opacity-70">Click "Start Session" to snapshot inventory and begin counting.</p>
          </div>
        ) : (
          <>
            {/* Mobile Handheld Counting Card List */}
            <div className={`md:hidden divide-y ${isDark ? "divide-slate-800" : "divide-slate-100"}`}>
              {filteredItems.length === 0 ? (
                <div className="py-10 text-center text-slate-400 text-sm">
                  No items match your filter.
                </div>
              ) : (
                filteredItems.map((item, idx) => {
                  const input = countInputs[item.id] || { value: "", saved: false };
                  const isSaving = savingItem === item.id;
                  const isCounted = item.status === "counted";
                  const variance = isCounted
                    ? (parseFloat(item.counted_qty) - parseFloat(item.system_qty)).toFixed(2)
                    : null;
                  const hasVariance = variance !== null && parseFloat(variance) !== 0;

                  return (
                    <div
                      key={item.id}
                      className={`p-4 space-y-3 transition-colors ${
                        isCounted
                          ? isDark
                            ? "bg-emerald-900/10"
                            : "bg-emerald-50/50"
                          : ""
                      }`}
                    >
                      <div className="flex items-start justify-between gap-2">
                        <div className="min-w-0">
                          <div className="flex items-center gap-2">
                            <span className={`text-xs font-mono ${isDark ? "text-slate-500" : "text-slate-400"}`}>
                              #{idx + 1}
                            </span>
                            <span className={`font-semibold text-sm truncate ${isDark ? "text-slate-100" : "text-slate-800"}`}>
                              {item.product?.name || "—"}
                            </span>
                          </div>
                          <div className={`flex flex-wrap items-center gap-x-3 gap-y-1 text-xs mt-1 ${isDark ? "text-slate-400" : "text-slate-500"}`}>
                            {item.product?.rack && (
                              <span className="font-medium">Rack: {item.product.rack}</span>
                            )}
                            <span className="font-mono">
                              Batch: {item.batch_number || "—"}
                            </span>
                            <span>
                              Exp: {item.expiry_date ? new Date(item.expiry_date).toLocaleDateString() : "—"}
                            </span>
                          </div>
                        </div>

                        {isCounted ? (
                          <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-xs font-medium bg-emerald-100 text-emerald-700 dark:bg-emerald-900/40 dark:text-emerald-300 shrink-0">
                            <CheckCircleIcon className="w-3.5 h-3.5" />
                            Counted
                          </span>
                        ) : (
                          <span className={`text-xs px-2 py-0.5 rounded-full shrink-0 ${
                            isDark ? "bg-slate-700 text-slate-400" : "bg-slate-100 text-slate-500"
                          }`}>
                            Pending
                          </span>
                        )}
                      </div>

                      {!session.is_blind && (
                        <div className="flex items-center justify-between text-xs pt-1">
                          <span className={isDark ? "text-slate-400" : "text-slate-500"}>
                            System Qty:{" "}
                            <strong className={`font-mono ${isDark ? "text-slate-200" : "text-slate-700"}`}>
                              {item.system_qty !== null && item.system_qty !== undefined
                                ? Number(item.system_qty).toFixed(2)
                                : "—"}
                            </strong>
                          </span>
                          {isCounted && (
                            <span className={`font-bold font-mono ${
                              hasVariance
                                ? parseFloat(variance) > 0
                                  ? "text-emerald-600 dark:text-emerald-400"
                                  : "text-red-600 dark:text-red-400"
                                : isDark ? "text-slate-400" : "text-slate-500"
                            }`}>
                              Variance: {parseFloat(variance) > 0 ? "+" : ""}{variance}
                            </span>
                          )}
                        </div>
                      )}

                      <div className="flex items-center gap-2 pt-1">
                        <input
                          ref={(el) => {
                            if (el && el.offsetParent !== null) {
                              inputRefs.current[item.id] = el;
                            }
                          }}
                          type="number"
                          min="0"
                          step="1"
                          disabled={isReadonly || isSaving}
                          value={input.value}
                          onChange={(e) =>
                            setCountInputs((prev) => ({
                              ...prev,
                              [item.id]: { value: e.target.value, saved: false },
                            }))
                          }
                          onKeyDown={(e) => {
                            if (e.key === "Enter") {
                              e.preventDefault();
                              handleSaveCount(item);
                            }
                          }}
                          placeholder={session.is_blind ? "Enter physical count…" : "Enter counted qty…"}
                          className={`flex-1 min-h-[44px] text-sm font-mono rounded-xl border px-3 py-2 focus:outline-none focus:ring-2 transition-colors ${
                            isDark
                              ? "bg-slate-800 border-slate-600 text-slate-100 focus:ring-blue-500/40"
                              : "bg-white border-slate-300 text-slate-900 focus:ring-blue-500/40"
                          } ${isReadonly ? "opacity-60 cursor-not-allowed" : ""}`}
                        />
                        {!isReadonly && (
                          <button
                            onClick={() => handleSaveCount(item)}
                            disabled={isSaving || input.value === ""}
                            className={`min-h-[44px] px-4 rounded-xl text-xs font-bold transition-colors disabled:opacity-40 shrink-0 ${
                              isCounted && !isSaving && input.value === String(item.counted_qty)
                                ? isDark
                                  ? "bg-emerald-900/40 text-emerald-400 hover:bg-emerald-900/60"
                                  : "bg-emerald-100 text-emerald-700 hover:bg-emerald-200"
                                : btnPrimary.className
                            }`}
                            style={
                              !(isCounted && !isSaving && input.value === String(item.counted_qty))
                                ? btnPrimary.style
                                : {}
                            }
                          >
                            {isSaving ? "…" : isCounted && input.value === String(item.counted_qty) ? "Saved ✓" : "Save ✓"}
                          </button>
                        )}
                      </div>
                    </div>
                  );
                })
              )}
            </div>

            {/* Desktop Table */}
            <div className="hidden md:block overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr className={`border-b text-xs font-semibold uppercase tracking-wide ${
                  isDark ? "border-slate-700 bg-slate-800/60 text-slate-400" : "border-slate-200 bg-slate-50 text-slate-500"
                }`}>
                  <th className="py-3 px-4 text-left">#</th>
                  <th className="py-3 px-4 text-left">Product</th>
                  <th className="py-3 px-4 text-left">Batch</th>
                  <th className="py-3 px-4 text-left">Expiry</th>
                  {!session.is_blind && (
                    <th className="py-3 px-4 text-right">System Qty</th>
                  )}
                  <th className="py-3 px-4 text-right">Physical Count</th>
                  {!session.is_blind && (
                    <th className="py-3 px-4 text-right">Variance</th>
                  )}
                  <th className="py-3 px-4 text-center">Status</th>
                  {!isReadonly && <th className="py-3 px-4 text-center">Save</th>}
                </tr>
              </thead>
              <tbody className={`divide-y ${isDark ? "divide-slate-800" : "divide-slate-100"}`}>
                {filteredItems.length === 0 ? (
                  <tr>
                    <td colSpan={9} className="py-10 text-center text-slate-400 text-sm">
                      No items match your filter.
                    </td>
                  </tr>
                ) : (
                  filteredItems.map((item, idx) => {
                    const input = countInputs[item.id] || { value: "", saved: false };
                    const isSaving = savingItem === item.id;
                    const isCounted = item.status === "counted";
                    const variance = isCounted
                      ? (parseFloat(item.counted_qty) - parseFloat(item.system_qty)).toFixed(2)
                      : null;
                    const hasVariance = variance !== null && parseFloat(variance) !== 0;

                    return (
                      <tr
                        key={item.id}
                        className={`transition-colors ${
                          isCounted
                            ? (isDark ? "bg-emerald-900/10" : "bg-emerald-50/50")
                            : (isDark ? "hover:bg-slate-800/40" : "hover:bg-slate-50/70")
                        }`}
                      >
                        {/* Row number */}
                        <td className={`py-2.5 px-4 text-xs font-mono ${isDark ? "text-slate-500" : "text-slate-400"}`}>
                          {idx + 1}
                        </td>

                        {/* Product */}
                        <td className="py-2.5 px-4">
                          <div className={`font-medium text-sm ${isDark ? "text-slate-200" : "text-slate-800"}`}>
                            {item.product?.name || "—"}
                          </div>
                          {item.product?.rack && (
                            <div className={`text-xs mt-0.5 ${isDark ? "text-slate-500" : "text-slate-400"}`}>
                              Rack: {item.product.rack}
                            </div>
                          )}
                        </td>

                        {/* Batch */}
                        <td className={`py-2.5 px-4 text-xs font-mono ${isDark ? "text-slate-400" : "text-slate-500"}`}>
                          {item.batch_number || <span className="italic opacity-50">—</span>}
                        </td>

                        {/* Expiry */}
                        <td className={`py-2.5 px-4 text-xs ${isDark ? "text-slate-400" : "text-slate-500"}`}>
                          {item.expiry_date
                            ? new Date(item.expiry_date).toLocaleDateString()
                            : <span className="italic opacity-50">—</span>
                          }
                        </td>

                        {/* System Qty (hidden in blind mode) */}
                        {!session.is_blind && (
                          <td className={`py-2.5 px-4 text-right font-mono text-sm ${isDark ? "text-slate-300" : "text-slate-600"}`}>
                            {item.system_qty !== null && item.system_qty !== undefined ? Number(item.system_qty).toFixed(2) : "—"}
                          </td>
                        )}

                        {/* Physical Count Input */}
                        <td className="py-2.5 px-4 text-right">
                          <input
                            ref={(el) => {
                              if (el && (el.offsetParent !== null || !inputRefs.current[item.id])) {
                                inputRefs.current[item.id] = el;
                              }
                            }}
                            type="number"
                            min="0"
                            step="1"
                            disabled={isReadonly || isSaving}
                            value={input.value}
                            onChange={(e) =>
                              setCountInputs((prev) => ({
                                ...prev,
                                [item.id]: { value: e.target.value, saved: false },
                              }))
                            }
                            onKeyDown={(e) => {
                              if (e.key === "Enter") {
                                e.preventDefault();
                                handleSaveCount(item);
                              }
                            }}
                            placeholder={session.is_blind ? "Count…" : "Enter qty"}
                            className={`${inputBaseCls} ${isReadonly ? "opacity-60 cursor-not-allowed" : ""}`}
                          />
                        </td>

                        {/* Variance (hidden in blind mode) */}
                        {!session.is_blind && (
                          <td className="py-2.5 px-4 text-right">
                            {isCounted ? (
                              <span className={`text-sm font-bold font-mono ${
                                hasVariance
                                  ? parseFloat(variance) > 0
                                    ? "text-emerald-600 dark:text-emerald-400"
                                    : "text-red-600 dark:text-red-400"
                                  : isDark ? "text-slate-400" : "text-slate-500"
                              }`}>
                                {parseFloat(variance) > 0 ? "+" : ""}{variance}
                              </span>
                            ) : (
                              <span className="text-xs text-slate-400">—</span>
                            )}
                          </td>
                        )}

                        {/* Status */}
                        <td className="py-2.5 px-4 text-center">
                          {isCounted ? (
                            <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-xs font-medium bg-emerald-100 text-emerald-700 dark:bg-emerald-900/40 dark:text-emerald-300">
                              <CheckCircleIcon className="w-3.5 h-3.5" />
                              Counted
                            </span>
                          ) : (
                            <span className={`text-xs px-2 py-0.5 rounded-full ${
                              isDark ? "bg-slate-700 text-slate-400" : "bg-slate-100 text-slate-500"
                            }`}>
                              Pending
                            </span>
                          )}
                        </td>

                        {/* Save button */}
                        {!isReadonly && (
                          <td className="py-2.5 px-4 text-center">
                            <button
                              onClick={() => handleSaveCount(item)}
                              disabled={isSaving || input.value === ""}
                              className={`px-3 py-1.5 rounded-lg text-xs font-semibold transition-colors disabled:opacity-40 ${
                                isCounted && !isSaving && input.value === String(item.counted_qty)
                                  ? isDark
                                    ? "bg-emerald-900/40 text-emerald-400 hover:bg-emerald-900/60"
                                    : "bg-emerald-100 text-emerald-700 hover:bg-emerald-200"
                                  : btnPrimary.className
                              }`}
                              style={
                                !(isCounted && !isSaving && input.value === String(item.counted_qty))
                                  ? btnPrimary.style
                                  : {}
                              }
                            >
                              {isSaving ? "…" : isCounted && input.value === String(item.counted_qty) ? "✓" : "Save"}
                            </button>
                          </td>
                        )}
                      </tr>
                    );
                  })
                )}
              </tbody>
            </table>
          </div>
          </>
        )}
      </GlassCard>

      {/* Bottom action bar for in_progress */}
      {session.status === "in_progress" && progress.total > 0 && (
        <div className={`sticky bottom-4 flex items-center justify-between gap-4 px-5 py-3 rounded-2xl shadow-lg ${
          isDark ? "bg-slate-800 border border-slate-700" : "bg-white border border-slate-200"
        }`}>
          <div className="flex items-center gap-3">
            <div className="text-sm font-medium">
              <span style={{ color: themeColors.primary }} className="font-bold text-lg">{progress.counted}</span>
              <span className={isDark ? "text-slate-400" : "text-slate-500"}> / {progress.total} counted</span>
            </div>
            {progress.counted < progress.total && (
              <span className={`text-xs ${isDark ? "text-slate-500" : "text-slate-400"}`}>
                {progress.total - progress.counted} remaining
              </span>
            )}
          </div>
          <button
            onClick={handleSubmitForReview}
            disabled={progress.counted < progress.total || actionLoading}
            title={progress.counted < progress.total ? `${progress.total - progress.counted} items still pending` : "Submit for review"}
            className={`flex items-center gap-2 px-5 py-2 rounded-xl text-sm font-semibold transition-colors disabled:opacity-40 ${btnPrimary.className}`}
            style={btnPrimary.style}
          >
            <CheckCircleIcon className="w-4 h-4" />
            Complete Count
          </button>
        </div>
      )}

      {/* Add Unexpected Found Item Modal */}
      {showAddItemModal && (
        <div
          className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/60 backdrop-blur-sm overflow-y-auto"
          onClick={(e) => {
            if (e.target === e.currentTarget && !addingItem) setShowAddItemModal(false);
          }}
        >
          <GlassCard
            className={`w-full max-w-lg border shadow-2xl rounded-2xl overflow-hidden ${
              isDark ? "bg-slate-900 border-slate-700 text-slate-100" : "bg-white border-slate-200 text-slate-900"
            }`}
          >
            <div
              className={`flex items-center justify-between px-6 py-4 border-b ${
                isDark ? "border-slate-700 bg-slate-800/50" : "border-slate-200 bg-slate-50"
              }`}
            >
              <div className="flex items-center gap-2">
                <PlusCircleIcon className="w-5 h-5 text-emerald-500" />
                <h3 className="font-bold text-base">Add Found Item to Stocktake</h3>
              </div>
              <button
                type="button"
                onClick={() => setShowAddItemModal(false)}
                disabled={addingItem}
                className={`p-1.5 rounded-lg transition-colors ${
                  isDark ? "hover:bg-slate-700 text-slate-400" : "hover:bg-slate-200/70 text-slate-500"
                }`}
              >
                <XMarkIcon className="w-5 h-5" />
              </button>
            </div>

            <form onSubmit={handleAddItemSubmit} className="p-6 space-y-4">
              <div>
                <label className={`block text-xs font-semibold mb-1.5 ${isDark ? "text-slate-300" : "text-slate-700"}`}>
                  Product *
                </label>
                {selectedAddProduct ? (
                  <div
                    className={`flex items-center justify-between px-3 py-2.5 rounded-lg border text-sm ${
                      isDark ? "bg-emerald-900/20 border-emerald-700/60 text-emerald-200" : "bg-emerald-50 border-emerald-200 text-emerald-900"
                    }`}
                  >
                    <div>
                      <p className="font-semibold">{selectedAddProduct.name}</p>
                      <p className="text-xs opacity-75">
                        Code: {selectedAddProduct.product_code || "—"} · Barcode: {selectedAddProduct.barcode || "—"}
                      </p>
                    </div>
                    <button
                      type="button"
                      onClick={() => setSelectedAddProduct(null)}
                      className="text-xs underline font-semibold ml-3"
                    >
                      Change
                    </button>
                  </div>
                ) : (
                  <div className="space-y-2">
                    <input
                      type="text"
                      value={productSearchQ}
                      onChange={(e) => setProductSearchQ(e.target.value)}
                      placeholder="Type product name, code, formula, or barcode…"
                      className={`w-full rounded-lg border px-3 py-2 text-sm focus:outline-none focus:ring-2 ${
                        isDark
                          ? "bg-slate-800 border-slate-600 text-slate-100 focus:ring-blue-500/40"
                          : "bg-white border-slate-300 text-slate-900 focus:ring-blue-500/40"
                      }`}
                    />
                    {searchingProducts && (
                      <p className="text-xs text-slate-400">Searching products…</p>
                    )}
                    {productSearchResults.length > 0 && (
                      <div
                        className={`max-h-44 overflow-y-auto rounded-lg border divide-y text-xs ${
                          isDark ? "border-slate-700 divide-slate-700 bg-slate-800" : "border-slate-200 divide-slate-100 bg-white"
                        }`}
                      >
                        {productSearchResults.map((p) => (
                          <button
                            key={p.id}
                            type="button"
                            onClick={() => setSelectedAddProduct(p)}
                            className={`w-full text-left px-3 py-2 flex items-center justify-between transition-colors ${
                              isDark ? "hover:bg-slate-700" : "hover:bg-slate-50"
                            }`}
                          >
                            <div>
                              <span className="font-semibold">{p.name}</span>
                              {p.formulation && <span className="ml-1.5 opacity-70">({p.formulation})</span>}
                            </div>
                            <span className="font-mono opacity-75">{p.barcode || p.product_code || ""}</span>
                          </button>
                        ))}
                      </div>
                    )}
                  </div>
                )}
              </div>

              <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                <div>
                  <label className={`block text-xs font-semibold mb-1 ${isDark ? "text-slate-300" : "text-slate-700"}`}>
                    Batch Number (Optional)
                  </label>
                  <input
                    type="text"
                    value={addBatchNumber}
                    onChange={(e) => setAddBatchNumber(e.target.value)}
                    placeholder="e.g. B-2026-01"
                    className={`w-full rounded-lg border px-3 py-2 text-sm font-mono focus:outline-none focus:ring-2 ${
                      isDark ? "bg-slate-800 border-slate-600 text-slate-100" : "bg-white border-slate-300 text-slate-900"
                    }`}
                  />
                </div>
                <div>
                  <label className={`block text-xs font-semibold mb-1 ${isDark ? "text-slate-300" : "text-slate-700"}`}>
                    Expiry Date (Optional)
                  </label>
                  <input
                    type="date"
                    value={addExpiryDate}
                    onChange={(e) => setAddExpiryDate(e.target.value)}
                    className={`w-full rounded-lg border px-3 py-2 text-sm focus:outline-none focus:ring-2 ${
                      isDark ? "bg-slate-800 border-slate-600 text-slate-100" : "bg-white border-slate-300 text-slate-900"
                    }`}
                  />
                </div>
              </div>

              <div>
                <label className={`block text-xs font-semibold mb-1 ${isDark ? "text-slate-300" : "text-slate-700"}`}>
                  Physical Count Quantity (Optional — leave blank to count later)
                </label>
                <input
                  type="number"
                  min="0"
                  step="1"
                  value={addCountedQty}
                  onChange={(e) => setAddCountedQty(e.target.value)}
                  placeholder="Enter counted quantity on shelf…"
                  className={`w-full rounded-lg border px-3 py-2 text-sm font-mono focus:outline-none focus:ring-2 ${
                    isDark ? "bg-slate-800 border-slate-600 text-slate-100" : "bg-white border-slate-300 text-slate-900"
                  }`}
                />
              </div>

              <div className="flex justify-end gap-2.5 pt-2">
                <button
                  type="button"
                  onClick={() => setShowAddItemModal(false)}
                  disabled={addingItem}
                  className={`px-4 py-2 rounded-lg text-sm font-semibold border ${
                    isDark ? "border-slate-600 text-slate-300 hover:bg-slate-800" : "border-slate-300 text-slate-700 hover:bg-slate-100"
                  }`}
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  disabled={!selectedAddProduct || addingItem}
                  className={`px-4 py-2 rounded-lg text-sm font-semibold disabled:opacity-50 ${btnPrimary.className}`}
                  style={btnPrimary.style}
                >
                  {addingItem ? "Adding…" : "Add to Session"}
                </button>
              </div>
            </form>
          </GlassCard>
        </div>
      )}

      <ShareDocumentModal
        isOpen={shareOpen && Boolean(session?.id)}
        onClose={() => setShareOpen(false)}
        documentType="stocktake_session"
        documentId={session?.id}
      />
    </div>
  );
}

