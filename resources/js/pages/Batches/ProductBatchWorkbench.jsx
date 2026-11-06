import React, { useState, useEffect, useRef, useMemo, useCallback } from "react";
import { useNavigate, useSearchParams } from "react-router-dom";
import axios from "axios";
import toast from "react-hot-toast";
import Select from "react-select";
import { useTheme } from "@/context/ThemeContext.jsx";
import { getThemeButtonClasses } from "@/utils/buttonStyles.js";
import { usePermissions } from "@/api/usePermissions.js";
import ProductSearchInput from "@/components/ProductSearchInput.jsx";
import {
  MoveBatchLocationModal,
  ManageStorageLocationsModal,
  getLocationTypeMeta,
} from "@/components/StorageLocationsModal.jsx";
import {
  CubeIcon,
  ClockIcon,
  PlusIcon,
  PencilSquareIcon,
  TrashIcon,
  MagnifyingGlassIcon,
  ArrowPathIcon,
  CheckCircleIcon,
  ExclamationTriangleIcon,
  ShieldExclamationIcon,
  BuildingStorefrontIcon,
  ArrowsRightLeftIcon,
  XMarkIcon,
  BoltIcon,
  SparklesIcon,
} from "@heroicons/react/24/outline";

export default function ProductBatchWorkbench() {
  const navigate = useNavigate();
  const [searchParams] = useSearchParams();
  const { isDark, theme } = useTheme();
  const { loading: permsLoading, has } = usePermissions();

  const canCreateOrUpdateBatch =
    !permsLoading &&
    (has("product.update") || has("product.create") || has("batch-expiry.update"));

  // Theme colors & button classes
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
    }),
    [theme]
  );

  const buttonStyle = theme?.button_style || "modern";
  const btnClasses = useMemo(
    () => getThemeButtonClasses(buttonStyle, themeColors, isDark),
    [buttonStyle, themeColors, isDark]
  );
  const btnPrimary = btnClasses.primary;
  const btnSecondary = btnClasses.secondary;

  // Refs for Keyboard Intelligence & Enter-key progression
  const productSearchInputRef = useRef(null);
  const productModalTriggerRef = useRef(null);
  const batchNumberRef = useRef(null);
  const expiryDateRef = useRef(null);
  const quantityRef = useRef(null);
  const unitCostRef = useRef(null);
  const unitMrpRef = useRef(null);
  const locationSelectRef = useRef(null);
  const rackRef = useRef(null);
  const saveBtnRef = useRef(null);
  const globalSearchInputRef = useRef(null);

  // Fast inline product combobox state
  const [productQuery, setProductQuery] = useState("");
  const [productResults, setProductResults] = useState([]);
  const [productDropdownOpen, setProductDropdownOpen] = useState(false);
  const [productHighlightIdx, setProductHighlightIdx] = useState(0);
  const [searchingProducts, setSearchingProducts] = useState(false);
  const productDropdownContainerRef = useRef(null);
  const productDropdownListRef = useRef(null);
  const productRowRefs = useRef([]);

  // Selected Product & Its Batches State
  const [selectedProduct, setSelectedProduct] = useState(null);
  const [loadingProductBatches, setLoadingProductBatches] = useState(false);
  const [productBatches, setProductBatches] = useState([]);
  const [stockStats, setStockStats] = useState({
    total: 0,
    batched: 0,
    unbatched: 0,
  });

  // Storage Locations
  const [storageLocations, setStorageLocations] = useState([]);
  const [manageLocationsOpen, setManageLocationsOpen] = useState(false);
  const [moveModalBatch, setMoveModalBatch] = useState(null);

  // Batch Editor Form State (Add / Edit)
  const [editingBatchId, setEditingBatchId] = useState(null);
  const [savingBatch, setSavingBatch] = useState(false);
  const [batchForm, setBatchForm] = useState({
    batch_number: "",
    expiry_date: "",
    quantity: "",
    unit_purchase_price: "",
    unit_sale_price: "",
    storage_location_id: "",
    rack: "",
  });

  // Global All-Products Batch Directory State (bottom table)
  const [globalLoading, setGlobalLoading] = useState(false);
  const [globalRows, setGlobalRows] = useState([]);
  const [globalTotal, setGlobalTotal] = useState(0);
  const [globalSummary, setGlobalSummary] = useState({
    total_batches_tracked: 0,
    total_expired_batches: 0,
    total_critical_batches: 0,
    total_warning_batches: 0,
  });
  const [globalStatus, setGlobalStatus] = useState("all");
  const [globalSearch, setGlobalSearch] = useState("");
  const [globalLocationId, setGlobalLocationId] = useState("");
  const [includeZeroQty, setIncludeZeroQty] = useState(true);
  const [globalPage, setGlobalPage] = useState(1);
  const [globalPerPage] = useState(20);

  // Load storage locations
  const fetchStorageLocations = useCallback(async () => {
    try {
      const { data } = await axios.get("/api/storage-locations");
      setStorageLocations(Array.isArray(data) ? data : []);
    } catch {
      /* ignore */
    }
  }, []);

  useEffect(() => {
    fetchStorageLocations();
  }, [fetchStorageLocations]);

  const defaultLocationId = useMemo(() => {
    const def = storageLocations.find((l) => l.is_default);
    return def ? String(def.id) : storageLocations[0] ? String(storageLocations[0].id) : "";
  }, [storageLocations]);

  // Search products for inline keyboard combobox & modal
  const fetchProductsList = useCallback(async (q = "") => {
    setSearchingProducts(true);
    try {
      const { data } = await axios.get("/api/products/search", {
        params: { q: q.trim(), limit: 25 },
      });
      const list = Array.isArray(data) ? data : Array.isArray(data?.data) ? data.data : [];
      setProductResults(list);
      setProductHighlightIdx(0);
    } catch {
      /* ignore */
    } finally {
      setSearchingProducts(false);
    }
  }, []);

  useEffect(() => {
    const timer = setTimeout(() => {
      fetchProductsList(productQuery);
    }, 140);
    return () => clearTimeout(timer);
  }, [productQuery, fetchProductsList]);

  // Close inline product dropdown on outside click
  useEffect(() => {
    const handleOutside = (e) => {
      if (
        productDropdownContainerRef.current &&
        !productDropdownContainerRef.current.contains(e.target)
      ) {
        setProductDropdownOpen(false);
      }
    };
    document.addEventListener("mousedown", handleOutside);
    return () => document.removeEventListener("mousedown", handleOutside);
  }, []);

  // Reset row refs when product search results change
  useEffect(() => {
    productRowRefs.current = [];
  }, [productResults.length]);

  // Keep highlighted product row scrolled into view when navigating with Up/Down arrow keys
  useEffect(() => {
    if (!productDropdownOpen || productHighlightIdx < 0) return;
    const rowEl = productRowRefs.current[productHighlightIdx];
    const containerEl = productDropdownListRef.current;
    if (rowEl && containerEl) {
      const rowTop = rowEl.offsetTop;
      const rowBottom = rowTop + rowEl.offsetHeight;
      const viewTop = containerEl.scrollTop;
      const viewBottom = viewTop + containerEl.clientHeight;
      if (rowTop < viewTop) {
        containerEl.scrollTop = rowTop;
      } else if (rowBottom > viewBottom) {
        containerEl.scrollTop = rowBottom - containerEl.clientHeight;
      }
    } else if (rowEl) {
      rowEl.scrollIntoView({ block: "nearest" });
    }
  }, [productHighlightIdx, productDropdownOpen, productResults.length]);

  // Load batches for a given product
  const loadProductAndBatches = useCallback(
    async (productObjOrId, { focusBatchInput = true, batchIdToEdit = null } = {}) => {
      if (!productObjOrId) return;
      const productId =
        typeof productObjOrId === "object" ? productObjOrId.id : Number(productObjOrId);
      if (!productId) return;

      setLoadingProductBatches(true);
      try {
        const [prodRes, batchesRes] = await Promise.all([
          axios.get(`/api/products/${productId}`),
          axios.get(`/api/products/${productId}/batches`),
        ]);

        const fullProduct = prodRes.data;
        const batchList = Array.isArray(batchesRes.data)
          ? batchesRes.data.filter((b) => !b.is_unbatched)
          : [];

        const totalUnits = Number(
          batchesRes.headers?.["x-total-units"] ?? fullProduct?.quantity ?? 0
        );
        const batchedUnits = Number(
          batchesRes.headers?.["x-batched-units"] ??
            batchList.reduce((acc, b) => acc + Number(b.quantity || 0), 0)
        );
        const unbatchedUnits = Number(
          batchesRes.headers?.["x-unbatched-units"] ?? Math.max(0, totalUnits - batchedUnits)
        );

        setSelectedProduct(fullProduct);
        setProductQuery(fullProduct.name || "");
        setProductDropdownOpen(false);
        setProductBatches(batchList);
        setStockStats({
          total: totalUnits,
          batched: batchedUnits,
          unbatched: unbatchedUnits,
        });

        const targetEditBatch = batchIdToEdit
          ? batchList.find((b) => Number(b.id) === Number(batchIdToEdit))
          : null;

        if (targetEditBatch) {
          setEditingBatchId(targetEditBatch.id);
          setBatchForm({
            batch_number: targetEditBatch.batch_number || "",
            expiry_date: (targetEditBatch.expiry_date || "").slice(0, 10),
            quantity: String(targetEditBatch.quantity ?? 0),
            unit_purchase_price:
              targetEditBatch.unit_purchase_price != null
                ? String(targetEditBatch.unit_purchase_price)
                : fullProduct.unit_purchase_price != null
                ? String(fullProduct.unit_purchase_price)
                : "",
            unit_sale_price:
              targetEditBatch.unit_sale_price != null
                ? String(targetEditBatch.unit_sale_price)
                : fullProduct.unit_sale_price != null
                ? String(fullProduct.unit_sale_price)
                : "",
            storage_location_id: String(
              targetEditBatch.storage_location_id ||
                fullProduct.storage_location_id ||
                defaultLocationId ||
                ""
            ),
            rack: targetEditBatch.rack || fullProduct.rack || "",
          });
        } else {
          setEditingBatchId(null);
          setBatchForm({
            batch_number: "",
            expiry_date: "",
            quantity: unbatchedUnits > 0 ? String(unbatchedUnits) : "",
            unit_purchase_price:
              fullProduct.unit_purchase_price != null
                ? String(fullProduct.unit_purchase_price)
                : "",
            unit_sale_price:
              fullProduct.unit_sale_price != null ? String(fullProduct.unit_sale_price) : "",
            storage_location_id: String(
              fullProduct.storage_location_id || defaultLocationId || ""
            ),
            rack: fullProduct.rack || "",
          });
        }

        if (focusBatchInput) {
          setTimeout(() => {
            batchNumberRef.current?.focus();
            batchNumberRef.current?.select?.();
          }, 40);
        }
      } catch (err) {
        console.error(err);
        toast.error("Failed to load product batches.");
      } finally {
        setLoadingProductBatches(false);
      }
    },
    [defaultLocationId]
  );

  // Auto-load product if ?product_id= is in URL, otherwise focus Product Search on initial mount
  useEffect(() => {
    const pid = searchParams.get("product_id");
    const bid = searchParams.get("batch_id");
    if (pid) {
      loadProductAndBatches(pid, { focusBatchInput: true, batchIdToEdit: bid });
    } else {
      setTimeout(() => {
        productSearchInputRef.current?.focus();
      }, 60);
    }
  }, [searchParams, loadProductAndBatches]);

  // Fetch Global Batch Directory (bottom section)
  const fetchGlobalBatches = useCallback(async () => {
    setGlobalLoading(true);
    try {
      const { data } = await axios.get("/api/batch-expiry", {
        params: {
          status: globalStatus,
          search: globalSearch.trim() || undefined,
          storage_location_id: globalLocationId || undefined,
          include_zero_qty: includeZeroQty ? 1 : 0,
          page: globalPage,
          per_page: globalPerPage,
        },
      });
      setGlobalRows(Array.isArray(data?.rows) ? data.rows : []);
      setGlobalTotal(Number(data?.total || 0));
      if (data?.summary) {
        setGlobalSummary(data.summary);
      }
    } catch {
      /* ignore */
    } finally {
      setGlobalLoading(false);
    }
  }, [globalStatus, globalSearch, globalLocationId, includeZeroQty, globalPage, globalPerPage]);

  useEffect(() => {
    fetchGlobalBatches();
  }, [fetchGlobalBatches]);

  // Reset form to New Batch Mode for the currently selected product
  const handleResetToNewBatch = useCallback(
    (focusBatchField = true) => {
      setEditingBatchId(null);
      setBatchForm({
        batch_number: "",
        expiry_date: "",
        quantity: stockStats.unbatched > 0 ? String(stockStats.unbatched) : "",
        unit_purchase_price:
          selectedProduct?.unit_purchase_price != null
            ? String(selectedProduct.unit_purchase_price)
            : "",
        unit_sale_price:
          selectedProduct?.unit_sale_price != null
            ? String(selectedProduct.unit_sale_price)
            : "",
        storage_location_id: String(
          selectedProduct?.storage_location_id || defaultLocationId || ""
        ),
        rack: selectedProduct?.rack || "",
      });
      if (focusBatchField) {
        setTimeout(() => {
          batchNumberRef.current?.focus();
          batchNumberRef.current?.select?.();
        }, 30);
      }
    },
    [selectedProduct, stockStats.unbatched, defaultLocationId]
  );

  // Start editing a batch from the selected product's batch list
  const handleStartEditBatch = useCallback(
    (batch) => {
      if (!batch) return;
      setEditingBatchId(batch.id);
      setBatchForm({
        batch_number: batch.batch_number || "",
        expiry_date: (batch.expiry_date || "").slice(0, 10),
        quantity: String(batch.quantity ?? 0),
        unit_purchase_price:
          batch.unit_purchase_price != null
            ? String(batch.unit_purchase_price)
            : selectedProduct?.unit_purchase_price != null
            ? String(selectedProduct.unit_purchase_price)
            : "",
        unit_sale_price:
          batch.unit_sale_price != null
            ? String(batch.unit_sale_price)
            : selectedProduct?.unit_sale_price != null
            ? String(selectedProduct.unit_sale_price)
            : "",
        storage_location_id: String(
          batch.storage_location_id ||
            selectedProduct?.storage_location_id ||
            defaultLocationId ||
            ""
        ),
        rack: batch.rack || selectedProduct?.rack || "",
      });
      setTimeout(() => {
        batchNumberRef.current?.focus();
        batchNumberRef.current?.select?.();
      }, 30);
    },
    [selectedProduct, defaultLocationId]
  );

  // Detect if typed batch_number matches an existing batch of the selected product
  const matchingExistingBatch = useMemo(() => {
    if (editingBatchId || !batchForm.batch_number.trim()) return null;
    const typed = batchForm.batch_number.trim().toLowerCase();
    const locId = Number(batchForm.storage_location_id || 0);
    return (
      productBatches.find(
        (b) =>
          (b.batch_number || "").trim().toLowerCase() === typed &&
          (!locId || Number(b.storage_location_id || 0) === locId)
      ) || null
    );
  }, [editingBatchId, batchForm.batch_number, batchForm.storage_location_id, productBatches]);

  const editingBatchObj = useMemo(
    () =>
      editingBatchId
        ? productBatches.find((b) => Number(b.id) === Number(editingBatchId)) || null
        : null,
    [editingBatchId, productBatches]
  );

  // Strict maximum assignable quantity from unassigned stock (plus current batch's own units if editing/matching)
  const maxAssignableQty = useMemo(() => {
    if (editingBatchObj) {
      return Math.max(0, Number(stockStats.unbatched || 0) + Number(editingBatchObj.quantity || 0));
    }
    if (matchingExistingBatch) {
      return Math.max(
        0,
        Number(stockStats.unbatched || 0) + Number(matchingExistingBatch.quantity || 0)
      );
    }
    return Math.max(0, Number(stockStats.unbatched || 0));
  }, [editingBatchObj, matchingExistingBatch, stockStats.unbatched]);

  const isNewBatchBlockedByZeroUnassigned =
    Boolean(selectedProduct) &&
    !editingBatchId &&
    !matchingExistingBatch &&
    maxAssignableQty <= 0;

  // Quick Expiry Date Adder (+3M, +6M, +1Y, +2Y)
  const applyQuickExpiryMonths = (monthsToAdd) => {
    const d = new Date();
    d.setMonth(d.getMonth() + monthsToAdd);
    const iso = d.toISOString().slice(0, 10);
    setBatchForm((prev) => ({ ...prev, expiry_date: iso }));
    setTimeout(() => {
      quantityRef.current?.focus();
      quantityRef.current?.select?.();
    }, 20);
  };

  // Save or Update Batch (Alt+S or Enter on last field / form submit)
  const handleSaveBatch = useCallback(
    async (e) => {
      if (e?.preventDefault) e.preventDefault();
      if (savingBatch) return;

      if (!selectedProduct?.id) {
        toast.error("Please select a product first (Alt+F).");
        productSearchInputRef.current?.focus();
        return;
      }

      const trimmedBatchNo = (batchForm.batch_number || "").trim();
      if (!trimmedBatchNo) {
        toast.error("Batch Number is required.");
        batchNumberRef.current?.focus();
        return;
      }

      if (!batchForm.expiry_date) {
        toast.error("Expiry Date is required.");
        expiryDateRef.current?.focus();
        return;
      }

      const qtyVal = batchForm.quantity === "" ? 0 : parseInt(batchForm.quantity, 10);
      if (isNaN(qtyVal) || qtyVal < 0) {
        toast.error("Batch quantity must be 0 or greater.");
        quantityRef.current?.focus();
        return;
      }

      if (!editingBatchId && !matchingExistingBatch) {
        if (maxAssignableQty <= 0) {
          toast.error(
            "Cannot add a new batch because this product has 0 unassigned stock available. Select an existing batch to edit or add stock via Purchase Invoice / Stock Adjustment."
          );
          return;
        }
        if (qtyVal <= 0) {
          toast.error(
            `Batch quantity must be between 1 and ${maxAssignableQty} unassigned units.`
          );
          quantityRef.current?.focus();
          return;
        }
      }

      if (qtyVal > maxAssignableQty) {
        toast.error(
          `Cannot assign ${qtyVal} units. Only ${maxAssignableQty} unassigned units are available for this batch.`
        );
        quantityRef.current?.focus();
        return;
      }

      const packSize = Math.max(1, Number(selectedProduct.pack_size || 1));
      const unitCost =
        batchForm.unit_purchase_price !== "" ? Number(batchForm.unit_purchase_price) : null;
      const unitMrp =
        batchForm.unit_sale_price !== "" ? Number(batchForm.unit_sale_price) : null;

      const payload = {
        batch_number: trimmedBatchNo,
        expiry_date: batchForm.expiry_date,
        quantity: qtyVal,
        storage_location_id: batchForm.storage_location_id
          ? Number(batchForm.storage_location_id)
          : null,
        rack: (batchForm.rack || "").trim() || null,
        unit_purchase_price: unitCost,
        pack_purchase_price:
          unitCost !== null ? Number((unitCost * packSize).toFixed(2)) : null,
        unit_sale_price: unitMrp,
        pack_sale_price: unitMrp !== null ? Number((unitMrp * packSize).toFixed(2)) : null,
      };

      setSavingBatch(true);
      try {
        if (editingBatchId) {
          await axios.put(`/api/batches/${editingBatchId}`, payload);
          toast.success(`Updated batch "${trimmedBatchNo}" for ${selectedProduct.name}`);
        } else {
          await axios.post(`/api/products/${selectedProduct.id}/batches`, payload);
          toast.success(`Saved batch "${trimmedBatchNo}" (${qtyVal} units) for ${selectedProduct.name}`);
        }

        window.dispatchEvent(new CustomEvent("notifications-changed"));
        await Promise.all([
          loadProductAndBatches(selectedProduct.id, { focusBatchInput: true }),
          fetchGlobalBatches(),
          fetchProductsList(productQuery),
        ]);
      } catch (err) {
        const msg =
          err?.response?.data?.errors?.quantity?.[0] ||
          err?.response?.data?.errors?.batch_number?.[0] ||
          err?.response?.data?.errors?.expiry_date?.[0] ||
          err?.response?.data?.message ||
          "Failed to save batch.";
        toast.error(msg);
      } finally {
        setSavingBatch(false);
      }
    },
    [
      savingBatch,
      selectedProduct,
      batchForm,
      editingBatchId,
      matchingExistingBatch,
      maxAssignableQty,
      loadProductAndBatches,
      fetchGlobalBatches,
      fetchProductsList,
      productQuery,
    ]
  );

  // Delete a batch
  const handleDeleteBatch = async (batch) => {
    if (!batch?.id) return;
    if (!window.confirm(`Delete batch "${batch.batch_number}"? (Allocated units will return to unassigned stock)`)) return;
    try {
      await axios.delete(`/api/batches/${batch.id}`);
      toast.success(`Deleted batch "${batch.batch_number}" (units returned to unassigned stock)`);
      if (Number(editingBatchId) === Number(batch.id)) {
        setEditingBatchId(null);
      }
      window.dispatchEvent(new CustomEvent("notifications-changed"));
      await Promise.all([
        loadProductAndBatches(selectedProduct.id, { focusBatchInput: true }),
        fetchGlobalBatches(),
        fetchProductsList(productQuery),
      ]);
    } catch (err) {
      const msg =
        err?.response?.data?.errors?.batch?.[0] ||
        err?.response?.data?.message ||
        "Could not delete batch.";
      toast.error(msg);
    }
  };

  // Global Keyboard Shortcuts Listener
  useEffect(() => {
    const onKeyDown = (e) => {
      // Alt + S -> Save / Update Batch
      if (e.altKey && (e.key === "s" || e.key === "S")) {
        e.preventDefault();
        handleSaveBatch();
        return;
      }
      // Alt + F or F2 -> Focus Product Search Input
      if ((e.altKey && (e.key === "f" || e.key === "F")) || e.key === "F2") {
        e.preventDefault();
        setProductDropdownOpen(true);
        productSearchInputRef.current?.focus();
        productSearchInputRef.current?.select?.();
        return;
      }
      // Alt + B -> Focus Batch Number Input
      if (e.altKey && (e.key === "b" || e.key === "B")) {
        e.preventDefault();
        batchNumberRef.current?.focus();
        batchNumberRef.current?.select?.();
        return;
      }
      // Alt + N -> Reset to New Batch Mode
      if (e.altKey && (e.key === "n" || e.key === "N")) {
        e.preventDefault();
        handleResetToNewBatch(true);
        return;
      }
      // Alt + R -> Refresh
      if (e.altKey && (e.key === "r" || e.key === "R")) {
        e.preventDefault();
        if (selectedProduct?.id) {
          loadProductAndBatches(selectedProduct.id, { focusBatchInput: false });
        }
        fetchGlobalBatches();
        toast.success("Refreshed batches");
        return;
      }
      // Escape -> If editing a batch, cancel edit mode
      if (e.key === "Escape" && editingBatchId && !productDropdownOpen) {
        e.preventDefault();
        handleResetToNewBatch(true);
      }
    };
    window.addEventListener("keydown", onKeyDown);
    return () => window.removeEventListener("keydown", onKeyDown);
  }, [
    handleSaveBatch,
    handleResetToNewBatch,
    selectedProduct,
    loadProductAndBatches,
    fetchGlobalBatches,
    editingBatchId,
    productDropdownOpen,
  ]);

  // Handle Quantity input with smart "2p" (packs -> units) conversion and unassigned cap
  const handleQuantityChange = (rawVal) => {
    const packSize = Math.max(1, Number(selectedProduct?.pack_size || 1));
    if (typeof rawVal === "string" && /^\d+(\.\d+)?p$/i.test(rawVal.trim())) {
      const packs = parseFloat(rawVal.trim().slice(0, -1));
      if (!isNaN(packs)) {
        const calcUnits = Math.round(packs * packSize);
        if (selectedProduct && calcUnits > maxAssignableQty) {
          setBatchForm((prev) => ({
            ...prev,
            quantity: String(maxAssignableQty),
          }));
          toast.error(
            `${calcUnits} units exceeds available unassigned stock. Capped to ${maxAssignableQty} units.`,
            { id: "pack-convert-toast", duration: 2500 }
          );
          return;
        }
        setBatchForm((prev) => ({
          ...prev,
          quantity: String(calcUnits),
        }));
        toast.success(`${packs} pack(s) × ${packSize} = ${calcUnits} units`, {
          id: "pack-convert-toast",
          duration: 1800,
        });
        return;
      }
    }
    setBatchForm((prev) => ({ ...prev, quantity: rawVal }));
  };

  // Select styles
  const selectStyles = useMemo(
    () => ({
      control: (base, state) => ({
        ...base,
        minHeight: "38px",
        height: "38px",
        borderRadius: "0.75rem",
        backgroundColor: isDark ? "rgba(30, 41, 59, 0.85)" : "#ffffff",
        borderColor: state.isFocused
          ? themeColors.primary
          : isDark
          ? "rgba(71, 85, 105, 0.8)"
          : "rgba(203, 213, 225, 0.9)",
        boxShadow: state.isFocused ? `0 0 0 2px ${themeColors.primary}33` : "none",
        fontSize: "0.8125rem",
      }),
      valueContainer: (base) => ({ ...base, padding: "0 10px" }),
      singleValue: (base) => ({
        ...base,
        color: isDark ? "#f8fafc" : "#0f172a",
        fontWeight: 500,
      }),
      input: (base) => ({ ...base, color: isDark ? "#f8fafc" : "#0f172a", margin: 0, padding: 0 }),
      menuPortal: (base) => ({ ...base, zIndex: 99999 }),
      menu: (base) => ({
        ...base,
        backgroundColor: isDark ? "#0f172a" : "#ffffff",
        borderRadius: "0.75rem",
        border: isDark ? "1px solid #334155" : "1px solid #e2e8f0",
        zIndex: 99999,
      }),
      option: (base, state) => ({
        ...base,
        fontSize: "0.8125rem",
        backgroundColor: state.isSelected
          ? themeColors.primary
          : state.isFocused
          ? isDark
            ? "#1e293b"
            : "#eff6ff"
          : "transparent",
        color: state.isSelected ? "#ffffff" : isDark ? "#f8fafc" : "#0f172a",
        cursor: "pointer",
      }),
    }),
    [isDark, themeColors.primary]
  );

  const locationOptions = useMemo(
    () =>
      storageLocations.map((loc) => ({
        value: String(loc.id),
        label: `${loc.name} (${loc.code})`,
        location: loc,
      })),
    [storageLocations]
  );

  const fmtCurrency = (v) =>
    Number(v || 0).toLocaleString(undefined, {
      minimumFractionDigits: 2,
      maximumFractionDigits: 2,
    });

  return (
    <div
      className={`p-3 md:p-5 min-h-screen space-y-4 ${
        isDark ? "bg-slate-900 text-slate-100" : "bg-slate-50 text-slate-800"
      }`}
    >
      {/* Top Header & Keyboard Shortcuts */}
      <div className="flex flex-col xl:flex-row xl:items-center justify-between gap-3 bg-white dark:bg-slate-800/90 border border-slate-200/80 dark:border-slate-700/80 rounded-2xl p-3.5 shadow-xs">
        <div className="flex items-center gap-3">
          <div className="p-2.5 rounded-xl bg-blue-500/10 text-blue-600 dark:text-blue-400 border border-blue-500/20">
            <CubeIcon className="w-6 h-6" />
          </div>
          <div>
            <h1 className="text-lg md:text-xl font-bold tracking-tight">
              Product Batches
            </h1>
            <p className="text-xs text-slate-500 dark:text-slate-400">
              Manage product batch numbers, expiry dates, and stock locations.
            </p>
          </div>
        </div>

        {/* Keyboard Shortcut Keycaps */}
        <div className="hidden lg:flex items-center flex-wrap gap-1.5 text-[11px]">
          {[
            { keys: "Alt + F / F2", label: "Search Product" },
            { keys: "Alt + B", label: "Batch #" },
            { keys: "Enter ↵", label: "Next Field" },
            { keys: "Alt + S", label: "Save Batch" },
            { keys: "Alt + N", label: "Clear / New" },
            { keys: "Alt + R", label: "Refresh" },
          ].map((sc) => (
            <div
              key={sc.keys}
              className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-lg bg-slate-100 dark:bg-slate-700/70 border border-slate-200 dark:border-slate-600 text-slate-700 dark:text-slate-200"
            >
              <kbd className="px-1.5 py-0.5 text-[10px] font-mono font-bold rounded bg-white dark:bg-slate-800 border border-slate-300 dark:border-slate-500 text-blue-600 dark:text-blue-400 shadow-2xs">
                {sc.keys}
              </kbd>
              <span className="font-medium">{sc.label}</span>
            </div>
          ))}

          <button
            type="button"
            onClick={() => setManageLocationsOpen(true)}
            className={`inline-flex items-center gap-1.5 px-3 py-1.5 text-xs font-semibold rounded-xl theme-btn-secondary ${btnSecondary.className}`}
            style={btnSecondary.style}
          >
            <BuildingStorefrontIcon className="w-4 h-4 text-indigo-500" />
            <span>Locations</span>
          </button>
        </div>
      </div>

      {/* Main Split Workbench: Left = Product Search + Batch Form | Right = Selected Product's Batches */}
      <div className="grid grid-cols-1 lg:grid-cols-12 gap-4 items-start">
        {/* LEFT COLUMN (7 cols): Product Selector + Keyboard-First Add/Edit Batch Form */}
        <div className="lg:col-span-7 bg-white dark:bg-slate-800/90 border border-slate-200/80 dark:border-slate-700/80 rounded-2xl p-4 shadow-xs space-y-4">
          {/* Step 1: Fast Keyboard Product Search */}
          <div ref={productDropdownContainerRef} className="relative">
            <div className="flex items-center justify-between mb-1.5">
              <label
                htmlFor="wb-product-search"
                className="text-xs font-bold uppercase tracking-wider text-slate-700 dark:text-slate-200 flex items-center gap-1.5"
              >
                <span className="inline-flex items-center justify-center w-5 h-5 rounded-full bg-blue-600 text-white text-[11px] font-bold">
                  1
                </span>
                <span>Select Product</span>
                <kbd className="ml-1 px-1.5 py-0.5 text-[10px] font-mono rounded bg-slate-100 dark:bg-slate-700 border border-slate-300 dark:border-slate-600 text-slate-600 dark:text-slate-300">
                  Alt + F
                </kbd>
              </label>

              <div className="flex items-center gap-2">
                <button
                  type="button"
                  onClick={() => productModalTriggerRef.current?.openMenu?.()}
                  className="text-[11px] font-semibold text-blue-600 dark:text-blue-400 hover:underline cursor-pointer flex items-center gap-1"
                  title="Open Advanced Product Search Modal"
                >
                  <SparklesIcon className="w-3.5 h-3.5" />
                  <span>Full Search Modal</span>
                </button>
                {selectedProduct && (
                  <button
                    type="button"
                    onClick={() =>
                      navigate(`/products/${selectedProduct.id}/edit`)
                    }
                    className="text-[11px] font-semibold text-slate-500 hover:text-slate-800 dark:text-slate-400 dark:hover:text-slate-200 cursor-pointer"
                  >
                    Open Product Edit
                  </button>
                )}
              </div>
            </div>

            {/* Hidden ProductSearchInput for Full Modal support */}
            <div className="hidden">
              <ProductSearchInput
                ref={productModalTriggerRef}
                value={selectedProduct}
                products={productResults}
                onRefreshProducts={fetchProductsList}
                onChange={(prod) => {
                  if (prod?.id) {
                    loadProductAndBatches(prod, { focusBatchInput: true });
                  }
                }}
              />
            </div>

            <div className="relative">
              <MagnifyingGlassIcon className="w-4 h-4 text-slate-400 absolute left-3.5 top-1/2 -translate-y-1/2 pointer-events-none" />
              <input
                ref={productSearchInputRef}
                id="wb-product-search"
                type="text"
                autoComplete="off"
                value={productQuery}
                onFocus={() => setProductDropdownOpen(true)}
                onChange={(e) => {
                  setProductQuery(e.target.value);
                  setProductDropdownOpen(true);
                  setProductHighlightIdx(0);
                }}
                onKeyDown={(e) => {
                  if (e.key === "ArrowDown") {
                    e.preventDefault();
                    setProductDropdownOpen(true);
                    setProductHighlightIdx((prev) =>
                      productResults.length > 0 ? (prev + 1) % productResults.length : 0
                    );
                  } else if (e.key === "ArrowUp") {
                    e.preventDefault();
                    setProductDropdownOpen(true);
                    setProductHighlightIdx((prev) =>
                      productResults.length > 0
                        ? prev <= 0
                          ? productResults.length - 1
                          : prev - 1
                        : 0
                    );
                  } else if (e.key === "Enter") {
                    e.preventDefault();
                    if (productDropdownOpen && productResults[productHighlightIdx]) {
                      loadProductAndBatches(productResults[productHighlightIdx], {
                        focusBatchInput: true,
                      });
                    } else if (selectedProduct) {
                      batchNumberRef.current?.focus();
                      batchNumberRef.current?.select?.();
                    }
                  } else if (e.key === "Escape") {
                    setProductDropdownOpen(false);
                  }
                }}
                placeholder="Type product name, code, or scan barcode and press Enter ↵..."
                className="w-full h-10 pl-10 pr-9 rounded-xl border border-slate-300 dark:border-slate-600 bg-slate-50/70 dark:bg-slate-900/70 text-sm font-medium text-slate-900 dark:text-slate-100 placeholder:text-slate-400 focus:outline-hidden focus:ring-2 focus:ring-blue-500 focus:border-blue-500 transition-all"
              />
              {productQuery && (
                <button
                  type="button"
                  onClick={() => {
                    setProductQuery("");
                    setProductDropdownOpen(true);
                    productSearchInputRef.current?.focus();
                  }}
                  className="absolute right-2.5 top-1/2 -translate-y-1/2 p-1 rounded-lg text-slate-400 hover:text-slate-600 dark:hover:text-slate-200 cursor-pointer"
                  title="Clear product search"
                >
                  <XMarkIcon className="w-4 h-4" />
                </button>
              )}
            </div>

            {/* Instant Keyboard Dropdown Results */}
            {productDropdownOpen && (
              <div
                ref={productDropdownListRef}
                className="absolute left-0 right-0 mt-1.5 max-h-72 overflow-y-auto rounded-2xl bg-white dark:bg-slate-800 border border-slate-200 dark:border-slate-700 shadow-2xl z-50 divide-y divide-slate-100 dark:divide-slate-700/60"
              >
                {searchingProducts && productResults.length === 0 ? (
                  <div className="p-4 text-center text-xs text-slate-400">
                    Searching products...
                  </div>
                ) : productResults.length === 0 ? (
                  <div className="p-4 text-center text-xs text-slate-400">
                    No matching products found.
                  </div>
                ) : (
                  productResults.map((p, idx) => {
                    const isHighlighted = idx === productHighlightIdx;
                    const isCurrent = Number(selectedProduct?.id) === Number(p.id);
                    return (
                      <button
                        key={p.id}
                        ref={(el) => (productRowRefs.current[idx] = el)}
                        type="button"
                        onMouseMove={() => {
                          if (productHighlightIdx !== idx) {
                            setProductHighlightIdx(idx);
                          }
                        }}
                        onClick={() =>
                          loadProductAndBatches(p, { focusBatchInput: true })
                        }
                        className={`w-full px-3.5 py-2.5 text-left flex flex-col sm:flex-row sm:items-center justify-between gap-3 transition-colors cursor-pointer ${
                          isHighlighted
                            ? "bg-blue-50 dark:bg-blue-950/60"
                            : isCurrent
                            ? "bg-emerald-50/50 dark:bg-emerald-950/30"
                            : "hover:bg-slate-50 dark:hover:bg-slate-700/40"
                        }`}
                      >
                        <div className="min-w-0">
                          <div className="flex items-center gap-2">
                            <span className="text-sm font-bold text-slate-900 dark:text-slate-100 truncate">
                              {p.name}
                            </span>
                            {p.product_code && (
                              <span className="font-mono text-[11px] px-1.5 py-0.5 rounded bg-slate-100 dark:bg-slate-700 text-slate-600 dark:text-slate-300">
                                {p.product_code}
                              </span>
                            )}
                            {p.rack && (
                              <span className="font-mono text-[10px] px-1.5 py-0.5 rounded bg-indigo-50 dark:bg-indigo-950/60 text-indigo-600 dark:text-indigo-300">
                                Rack: {p.rack}
                              </span>
                            )}
                          </div>
                          <div className="text-[11px] text-slate-500 dark:text-slate-400 flex items-center gap-3 mt-0.5">
                            <span>Pack Size: {p.pack_size || 1}</span>
                            <span>
                              Unit Cost: {fmtCurrency(p.unit_purchase_price || 0)}
                            </span>
                            <span>
                              Unit MRP: {fmtCurrency(p.unit_sale_price || 0)}
                            </span>
                          </div>
                        </div>
                        <div className="text-right shrink-0">
                          <div className="flex items-center justify-end gap-1.5">
                            <span className="inline-block font-mono text-[11px] font-bold px-2 py-0.5 rounded-lg bg-slate-100 dark:bg-slate-700 text-slate-800 dark:text-slate-200">
                              Total: {p.quantity ?? 0}
                            </span>
                            {(() => {
                              const unbatchedInRow = Math.max(
                                0,
                                Number(p.quantity || 0) - Number(p.batches_sum_quantity || 0)
                              );
                              return (
                                <span
                                  className={`inline-block font-mono text-[11px] font-bold px-2 py-0.5 rounded-lg ${
                                    unbatchedInRow > 0
                                      ? "bg-emerald-500/15 text-emerald-700 dark:text-emerald-300 border border-emerald-500/30"
                                      : "bg-amber-500/15 text-amber-700 dark:text-amber-300 border border-amber-500/30"
                                  }`}
                                >
                                  Unassigned: {unbatchedInRow}
                                </span>
                              );
                            })()}
                          </div>
                          <div className="text-[10px] text-blue-600 dark:text-blue-400 font-semibold mt-0.5">
                            Press Enter ↵
                          </div>
                        </div>
                      </button>
                    );
                  })
                )}
              </div>
            )}
          </div>

          {/* Active Product Summary Banner */}
          {selectedProduct ? (
            <div className="p-3 rounded-xl bg-slate-50 dark:bg-slate-900/60 border border-slate-200/80 dark:border-slate-700/80 flex flex-col sm:flex-row sm:items-center justify-between gap-3">
              <div className="min-w-0">
                <div className="flex items-center gap-2 flex-wrap">
                  <CubeIcon className="w-4 h-4 text-blue-500 shrink-0" />
                  <span className="text-sm font-bold text-slate-900 dark:text-white truncate">
                    {selectedProduct.name}
                  </span>
                  {selectedProduct.product_code && (
                    <span className="font-mono text-[11px] px-2 py-0.5 rounded-md bg-blue-500/10 text-blue-600 dark:text-blue-400 font-semibold">
                      {selectedProduct.product_code}
                    </span>
                  )}
                  <span className="text-[11px] text-slate-500 dark:text-slate-400">
                    Pack: <strong>{selectedProduct.pack_size || 1}</strong>
                  </span>
                </div>
                <div className="text-[11px] text-slate-500 dark:text-slate-400 mt-1 flex items-center gap-3 flex-wrap">
                  <span>
                    Default Cost:{" "}
                    <strong className="text-slate-700 dark:text-slate-200">
                      {fmtCurrency(selectedProduct.unit_purchase_price || 0)}
                    </strong>
                  </span>
                  <span>
                    Default MRP:{" "}
                    <strong className="text-slate-700 dark:text-slate-200">
                      {fmtCurrency(selectedProduct.unit_sale_price || 0)}
                    </strong>
                  </span>
                  {selectedProduct.rack && (
                    <span>
                      Default Rack:{" "}
                      <strong className="font-mono text-slate-700 dark:text-slate-200">
                        {selectedProduct.rack}
                      </strong>
                    </span>
                  )}
                </div>
              </div>

              {/* Stock Counters */}
              <div className="grid grid-cols-3 gap-2 shrink-0">
                <div className="px-2.5 py-1.5 rounded-lg bg-white dark:bg-slate-800 border border-slate-200 dark:border-slate-700 text-center">
                  <span className="block text-[9px] uppercase font-bold text-slate-400">
                    Total Stock
                  </span>
                  <span className="font-mono text-sm font-bold text-slate-900 dark:text-white">
                    {stockStats.total}
                  </span>
                </div>
                <div className="px-2.5 py-1.5 rounded-lg bg-blue-50/70 dark:bg-blue-950/40 border border-blue-200/60 dark:border-blue-800/60 text-center">
                  <span className="block text-[9px] uppercase font-bold text-blue-600 dark:text-blue-400">
                    Batched
                  </span>
                  <span className="font-mono text-sm font-bold text-blue-700 dark:text-blue-300">
                    {stockStats.batched}
                  </span>
                </div>
                <div className="px-2.5 py-1.5 rounded-lg bg-emerald-50/70 dark:bg-emerald-950/40 border border-emerald-200/60 dark:border-emerald-800/60 text-center">
                  <span className="block text-[9px] uppercase font-bold text-emerald-600 dark:text-emerald-400">
                    Unassigned
                  </span>
                  <span className="font-mono text-sm font-bold text-emerald-700 dark:text-emerald-300">
                    {stockStats.unbatched}
                  </span>
                </div>
              </div>
            </div>
          ) : (
            <div className="p-3 rounded-xl bg-blue-50/60 dark:bg-blue-950/25 border border-blue-200/60 dark:border-blue-900/50 text-xs text-blue-700 dark:text-blue-300 flex items-center justify-between">
              <span>
                Search and select a product above (or click any row in the directory below) to immediately focus the Batch Number field.
              </span>
              <kbd className="px-2 py-0.5 font-mono text-[10px] font-bold rounded bg-white dark:bg-slate-800 border border-blue-300 dark:border-blue-700">
                Alt + F
              </kbd>
            </div>
          )}

          {/* Step 2: Keyboard-Driven Batch Add / Edit Form */}
          <form onSubmit={handleSaveBatch} className="space-y-3.5 pt-1">
            <div className="flex flex-wrap items-center justify-between gap-2 pb-2 border-b border-slate-200/70 dark:border-slate-700/70">
              <div className="flex items-center gap-2">
                <span
                  className={`inline-flex items-center justify-center w-5 h-5 rounded-full text-white text-[11px] font-bold ${
                    editingBatchId ? "bg-amber-500" : "bg-emerald-600"
                  }`}
                >
                  2
                </span>
                <span className="text-xs font-bold uppercase tracking-wider text-slate-700 dark:text-slate-200">
                  {editingBatchId
                    ? `Edit Batch #${batchForm.batch_number}`
                    : "Add Batch"}
                </span>
                {editingBatchId && (
                  <span className="px-2 py-0.5 rounded-full text-[10px] font-bold bg-amber-500/15 text-amber-600 dark:text-amber-400 border border-amber-500/30">
                    Edit Mode (Esc to Cancel)
                  </span>
                )}
                {matchingExistingBatch && !editingBatchId && (
                  <button
                    type="button"
                    onClick={() => handleStartEditBatch(matchingExistingBatch)}
                    className="px-2 py-0.5 rounded-full text-[10px] font-bold bg-blue-500/15 text-blue-600 dark:text-blue-400 border border-blue-500/30 cursor-pointer hover:underline"
                  >
                    Matches existing batch ({matchingExistingBatch.quantity} units) — Click to Edit
                  </button>
                )}
              </div>

              {selectedProduct && (
                <div className="flex items-center gap-2">
                  <span
                    className={`px-2.5 py-1 rounded-lg text-[11px] font-bold font-mono border ${
                      maxAssignableQty > 0
                        ? "bg-emerald-500/15 text-emerald-700 dark:text-emerald-300 border-emerald-500/30"
                        : "bg-amber-500/15 text-amber-700 dark:text-amber-300 border-amber-500/30"
                    }`}
                  >
                    Max Assignable: {maxAssignableQty} units
                  </span>
                </div>
              )}
            </div>

            {isNewBatchBlockedByZeroUnassigned && (
              <div className="p-3 rounded-xl bg-amber-50 dark:bg-amber-950/35 border border-amber-300/70 dark:border-amber-800/70 flex items-start gap-2.5 text-xs text-amber-800 dark:text-amber-200">
                <ExclamationTriangleIcon className="w-4 h-4 text-amber-600 dark:text-amber-400 shrink-0 mt-0.5" />
                <div>
                  <span className="font-bold">0 Unassigned Stock Available:</span> All{" "}
                  <strong className="font-mono">{stockStats.total}</strong> on-hand units of{" "}
                  <strong>{selectedProduct?.name}</strong> are already allocated to batches. You
                  cannot add quantity to a new batch without unassigned stock. Click any existing
                  batch on the right to edit it, or add stock via Purchase Invoice / Stock
                  Adjustment.
                </div>
              </div>
            )}

            {/* Row 1: Batch Number, Expiry Date, Quantity */}
            <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
              {/* Field 1: Batch Number */}
              <div>
                <div className="flex items-center justify-between mb-1">
                  <label
                    htmlFor="wb-batch-number"
                    className="text-xs font-semibold text-slate-700 dark:text-slate-200"
                  >
                    Batch Number *
                  </label>
                  <kbd className="text-[10px] font-mono px-1 rounded bg-slate-100 dark:bg-slate-700 text-slate-500 dark:text-slate-400">
                    Alt+B
                  </kbd>
                </div>
                <input
                  ref={batchNumberRef}
                  id="wb-batch-number"
                  type="text"
                  autoComplete="off"
                  placeholder="e.g. B-2026-01"
                  value={batchForm.batch_number}
                  onChange={(e) =>
                    setBatchForm((prev) => ({ ...prev, batch_number: e.target.value }))
                  }
                  onKeyDown={(e) => {
                    if (e.key === "Enter") {
                      e.preventDefault();
                      expiryDateRef.current?.focus();
                    }
                  }}
                  className="w-full h-[38px] px-3 rounded-xl border border-slate-300 dark:border-slate-600 bg-white dark:bg-slate-900/80 text-sm font-mono font-semibold text-slate-900 dark:text-slate-100 focus:outline-hidden focus:ring-2 focus:ring-blue-500"
                />
              </div>

              {/* Field 2: Expiry Date + Quick Pills */}
              <div>
                <div className="flex items-center justify-between mb-1">
                  <label
                    htmlFor="wb-expiry-date"
                    className="text-xs font-semibold text-slate-700 dark:text-slate-200"
                  >
                    Expiry Date *
                  </label>
                  <div className="flex items-center gap-1">
                    {[
                      { label: "+6M", months: 6 },
                      { label: "+1Y", months: 12 },
                      { label: "+2Y", months: 24 },
                    ].map((q) => (
                      <button
                        key={q.label}
                        type="button"
                        tabIndex={-1}
                        onClick={() => applyQuickExpiryMonths(q.months)}
                        className="px-1.5 py-0.5 rounded text-[10px] font-bold bg-blue-50 dark:bg-blue-950/60 text-blue-600 dark:text-blue-400 hover:bg-blue-100 cursor-pointer"
                        title={`Set expiry to ${q.label} from today`}
                      >
                        {q.label}
                      </button>
                    ))}
                  </div>
                </div>
                <input
                  ref={expiryDateRef}
                  id="wb-expiry-date"
                  type="date"
                  value={batchForm.expiry_date}
                  onChange={(e) =>
                    setBatchForm((prev) => ({ ...prev, expiry_date: e.target.value }))
                  }
                  onKeyDown={(e) => {
                    if (e.key === "Enter") {
                      e.preventDefault();
                      quantityRef.current?.focus();
                      quantityRef.current?.select?.();
                    }
                  }}
                  className="w-full h-[38px] px-3 rounded-xl border border-slate-300 dark:border-slate-600 bg-white dark:bg-slate-900/80 text-sm font-mono text-slate-900 dark:text-slate-100 focus:outline-hidden focus:ring-2 focus:ring-blue-500"
                />
              </div>

              {/* Field 3: Batch Quantity (supports "2p" for packs, capped to maxAssignableQty) */}
              <div>
                <div className="flex items-center justify-between mb-1">
                  <label
                    htmlFor="wb-quantity"
                    className="text-xs font-semibold text-slate-700 dark:text-slate-200"
                  >
                    Quantity (Max: {maxAssignableQty}) *
                  </label>
                  <div className="flex items-center gap-1">
                    {selectedProduct?.pack_size > 1 && maxAssignableQty > 0 && (
                      <button
                        type="button"
                        tabIndex={-1}
                        onClick={() =>
                          setBatchForm((prev) => {
                            const nextVal =
                              Number(prev.quantity || 0) + Number(selectedProduct.pack_size || 1);
                            const capped = Math.min(maxAssignableQty, nextVal);
                            if (nextVal > maxAssignableQty) {
                              toast.error(
                                `Capped to maximum available unassigned stock (${maxAssignableQty} units).`
                              );
                            }
                            return {
                              ...prev,
                              quantity: String(capped),
                            };
                          })
                        }
                        className="px-1.5 py-0.5 rounded text-[10px] font-bold bg-indigo-50 dark:bg-indigo-950/60 text-indigo-600 dark:text-indigo-400 hover:bg-indigo-100 cursor-pointer"
                        title={`Add 1 pack (${selectedProduct.pack_size} units), capped to ${maxAssignableQty}`}
                      >
                        +1P ({selectedProduct.pack_size})
                      </button>
                    )}
                    {maxAssignableQty > 0 && (
                      <button
                        type="button"
                        tabIndex={-1}
                        onClick={() =>
                          setBatchForm((prev) => ({
                            ...prev,
                            quantity: String(maxAssignableQty),
                          }))
                        }
                        className="px-1.5 py-0.5 rounded text-[10px] font-bold bg-emerald-50 dark:bg-emerald-950/60 text-emerald-600 dark:text-emerald-400 hover:bg-emerald-100 cursor-pointer"
                        title="Fill maximum assignable stock"
                      >
                        Max ({maxAssignableQty})
                      </button>
                    )}
                  </div>
                </div>
                <input
                  ref={quantityRef}
                  id="wb-quantity"
                  type="text"
                  inputMode="numeric"
                  autoComplete="off"
                  placeholder={
                    maxAssignableQty > 0
                      ? selectedProduct?.pack_size > 1
                        ? `Max ${maxAssignableQty} (or e.g. 1p)`
                        : `Max ${maxAssignableQty}`
                      : "0 (No unassigned stock)"
                  }
                  value={batchForm.quantity}
                  onChange={(e) => handleQuantityChange(e.target.value)}
                  onKeyDown={(e) => {
                    if (e.key === "Enter") {
                      e.preventDefault();
                      unitCostRef.current?.focus();
                      unitCostRef.current?.select?.();
                    }
                  }}
                  className="w-full h-[38px] px-3 rounded-xl border border-slate-300 dark:border-slate-600 bg-white dark:bg-slate-900/80 text-sm font-mono font-bold text-slate-900 dark:text-slate-100 focus:outline-hidden focus:ring-2 focus:ring-blue-500"
                />
              </div>
            </div>

            {/* Row 2: Unit Cost, Unit MRP, Storage Location, Rack */}
            <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-3">
              {/* Field 4: Unit Purchase Cost */}
              <div>
                <label
                  htmlFor="wb-unit-cost"
                  className="block text-xs font-semibold text-slate-700 dark:text-slate-200 mb-1"
                >
                  Unit Cost (Purchase)
                </label>
                <input
                  ref={unitCostRef}
                  id="wb-unit-cost"
                  type="number"
                  step="any"
                  min="0"
                  placeholder={
                    selectedProduct?.unit_purchase_price
                      ? `Default: ${selectedProduct.unit_purchase_price}`
                      : "0.00"
                  }
                  value={batchForm.unit_purchase_price}
                  onChange={(e) =>
                    setBatchForm((prev) => ({
                      ...prev,
                      unit_purchase_price: e.target.value,
                    }))
                  }
                  onKeyDown={(e) => {
                    if (e.key === "Enter") {
                      e.preventDefault();
                      unitMrpRef.current?.focus();
                      unitMrpRef.current?.select?.();
                    }
                  }}
                  className="w-full h-[38px] px-3 rounded-xl border border-slate-300 dark:border-slate-600 bg-white dark:bg-slate-900/80 text-sm font-mono text-slate-900 dark:text-slate-100 focus:outline-hidden focus:ring-2 focus:ring-blue-500"
                />
              </div>

              {/* Field 5: Unit Sale Price (MRP) */}
              <div>
                <label
                  htmlFor="wb-unit-mrp"
                  className="block text-xs font-semibold text-slate-700 dark:text-slate-200 mb-1"
                >
                  Unit MRP (Sale Price)
                </label>
                <input
                  ref={unitMrpRef}
                  id="wb-unit-mrp"
                  type="number"
                  step="any"
                  min="0"
                  placeholder={
                    selectedProduct?.unit_sale_price
                      ? `Default: ${selectedProduct.unit_sale_price}`
                      : "0.00"
                  }
                  value={batchForm.unit_sale_price}
                  onChange={(e) =>
                    setBatchForm((prev) => ({ ...prev, unit_sale_price: e.target.value }))
                  }
                  onKeyDown={(e) => {
                    if (e.key === "Enter") {
                      e.preventDefault();
                      rackRef.current?.focus();
                      rackRef.current?.select?.();
                    }
                  }}
                  className="w-full h-[38px] px-3 rounded-xl border border-slate-300 dark:border-slate-600 bg-white dark:bg-slate-900/80 text-sm font-mono text-slate-900 dark:text-slate-100 focus:outline-hidden focus:ring-2 focus:ring-blue-500"
                />
              </div>

              {/* Field 6: Storage Location */}
              <div>
                <label
                  htmlFor="wb-location-select"
                  className="block text-xs font-semibold text-slate-700 dark:text-slate-200 mb-1"
                >
                  Storage Location
                </label>
                <Select
                  ref={locationSelectRef}
                  inputId="wb-location-select"
                  options={locationOptions}
                  value={
                    locationOptions.find(
                      (o) => o.value === String(batchForm.storage_location_id || "")
                    ) || null
                  }
                  onChange={(opt) => {
                    setBatchForm((prev) => ({
                      ...prev,
                      storage_location_id: opt?.value || "",
                      rack: prev.rack || opt?.location?.default_rack || "",
                    }));
                    setTimeout(() => {
                      rackRef.current?.focus();
                      rackRef.current?.select?.();
                    }, 20);
                  }}
                  styles={selectStyles}
                  menuPortalTarget={typeof document !== "undefined" ? document.body : null}
                  placeholder="Select location..."
                />
              </div>

              {/* Field 7: Rack / Shelf (Pressing Enter saves the batch!) */}
              <div>
                <div className="flex items-center justify-between mb-1">
                  <label
                    htmlFor="wb-rack"
                    className="text-xs font-semibold text-slate-700 dark:text-slate-200"
                  >
                    Rack / Shelf
                  </label>
                  <span className="text-[10px] text-emerald-600 dark:text-emerald-400 font-semibold">
                    Enter ↵ Saves
                  </span>
                </div>
                <input
                  ref={rackRef}
                  id="wb-rack"
                  type="text"
                  autoComplete="off"
                  placeholder={selectedProduct?.rack || "e.g. R-01 / S-2"}
                  value={batchForm.rack}
                  onChange={(e) =>
                    setBatchForm((prev) => ({ ...prev, rack: e.target.value }))
                  }
                  onKeyDown={(e) => {
                    if (e.key === "Enter") {
                      e.preventDefault();
                      handleSaveBatch();
                    }
                  }}
                  className="w-full h-[38px] px-3 rounded-xl border border-slate-300 dark:border-slate-600 bg-white dark:bg-slate-900/80 text-sm font-mono text-slate-900 dark:text-slate-100 focus:outline-hidden focus:ring-2 focus:ring-blue-500"
                />
              </div>
            </div>

            {/* Submit & Reset Actions */}
            <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 pt-2 border-t border-slate-200/60 dark:border-slate-700/60">
              <div className="text-[11px] text-slate-500 dark:text-slate-400">
                Tip: In Quantity, type <code className="font-mono font-bold">2p</code> to auto-calculate{" "}
                <code className="font-mono">2 × pack size</code>. Press{" "}
                <kbd className="font-mono font-bold">Alt + S</kbd> anywhere to save.
              </div>

              <div className="flex items-center gap-2">
                <button
                  type="button"
                  onClick={() => handleResetToNewBatch(true)}
                  className="px-3.5 py-2 rounded-xl text-xs font-semibold border border-slate-300 dark:border-slate-600 text-slate-700 dark:text-slate-200 hover:bg-slate-100 dark:hover:bg-slate-700 transition-colors cursor-pointer"
                  title="Clear / Reset to New Batch (Alt+N)"
                >
                  {editingBatchId ? "Cancel Edit (Esc)" : "Clear (Alt+N)"}
                </button>

                <button
                  ref={saveBtnRef}
                  type="submit"
                  disabled={savingBatch || !canCreateOrUpdateBatch || isNewBatchBlockedByZeroUnassigned}
                  className={`inline-flex items-center gap-2 px-4 py-2 rounded-xl text-xs font-bold theme-btn-primary cursor-pointer disabled:opacity-50 ${btnPrimary.className}`}
                  style={btnPrimary.style}
                  title={
                    isNewBatchBlockedByZeroUnassigned
                      ? "No unassigned stock available to create a new batch"
                      : "Save Batch (Alt+S)"
                  }
                >
                  {editingBatchId ? (
                    <PencilSquareIcon className="w-4 h-4" />
                  ) : (
                    <PlusIcon className="w-4 h-4" />
                  )}
                  <span>
                    {savingBatch
                      ? "Saving..."
                      : editingBatchId
                      ? "Update Batch (Alt+S)"
                      : "Save Batch (Alt+S)"}
                  </span>
                </button>
              </div>
            </div>
          </form>
        </div>

        {/* RIGHT COLUMN (5 cols): Selected Product's Batches (FEFO Queue) */}
        <div className="lg:col-span-5 bg-white dark:bg-slate-800/90 border border-slate-200/80 dark:border-slate-700/80 rounded-2xl p-4 shadow-xs flex flex-col">
          <div className="flex items-center justify-between pb-3 border-b border-slate-200/80 dark:border-slate-700/80">
            <div>
              <h2 className="text-sm font-bold text-slate-900 dark:text-white flex items-center gap-2">
                <ClockIcon className="w-4 h-4 text-blue-500" />
                <span>
                  {selectedProduct
                    ? `Batches for ${selectedProduct.name}`
                    : "Selected Product Batches"}
                </span>
              </h2>
              <p className="text-[11px] text-slate-500 dark:text-slate-400">
                Click any batch row to load it into the editor on the left.
              </p>
            </div>
            {selectedProduct && (
              <span className="px-2.5 py-0.5 rounded-full text-xs font-bold bg-blue-500/10 text-blue-600 dark:text-blue-400">
                {productBatches.length} {productBatches.length === 1 ? "Batch" : "Batches"}
              </span>
            )}
          </div>

          <div className="mt-3 overflow-x-auto max-h-[360px] overflow-y-auto">
            {!selectedProduct ? (
              <div className="py-14 text-center text-xs text-slate-400 dark:text-slate-500">
                <CubeIcon className="w-8 h-8 mx-auto mb-2 opacity-40" />
                Select a product on the left (<kbd className="font-mono">Alt + F</kbd>) to view and manage its batches.
              </div>
            ) : loadingProductBatches ? (
              <div className="py-14 text-center text-xs text-slate-400">
                <ArrowPathIcon className="w-5 h-5 animate-spin mx-auto mb-2 text-blue-500" />
                Loading product batches...
              </div>
            ) : productBatches.length === 0 ? (
              <div className="py-12 text-center text-xs text-slate-500 dark:text-slate-400">
                No batches recorded for <strong>{selectedProduct.name}</strong> yet.
                <div className="mt-1 text-[11px] text-emerald-600 dark:text-emerald-400">
                  Enter a Batch Number on the left and press <strong>Alt + S</strong> to create the first batch!
                </div>
              </div>
            ) : (
              <table className="w-full text-left border-collapse text-xs">
                <thead>
                  <tr className="border-b border-slate-200 dark:border-slate-700 text-slate-500 dark:text-slate-400">
                    <th className="py-2 px-2.5 font-semibold">Batch & Exp</th>
                    <th className="py-2 px-2.5 font-semibold">Location</th>
                    <th className="py-2 px-2.5 font-semibold text-right">Qty</th>
                    <th className="py-2 px-2.5 font-semibold text-right">Cost / MRP</th>
                    <th className="py-2 px-2.5 font-semibold text-right">Actions</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-100 dark:divide-slate-700/60">
                  {productBatches.map((b) => {
                    const isEditing = Number(editingBatchId) === Number(b.id);
                    const locObj =
                      b.storage_location ||
                      storageLocations.find(
                        (l) => Number(l.id) === Number(b.storage_location_id)
                      );
                    const locMeta = getLocationTypeMeta(locObj?.type || "shop");
                    const rackTxt = b.rack || selectedProduct.rack || "";

                    return (
                      <tr
                        key={b.id}
                        onClick={() => handleStartEditBatch(b)}
                        className={`cursor-pointer transition-colors ${
                          isEditing
                            ? "bg-amber-50 dark:bg-amber-950/35 ring-1 ring-amber-400"
                            : "hover:bg-blue-50/50 dark:hover:bg-slate-700/40"
                        }`}
                      >
                        <td className="py-2.5 px-2.5">
                          <div className="flex items-center gap-1.5 flex-wrap">
                            <span className="font-mono font-bold text-slate-900 dark:text-slate-100">
                              {b.batch_number}
                            </span>
                            {b.is_fefo_recommended && (
                              <span className="px-1.5 py-0.2 rounded text-[9px] font-bold bg-emerald-500/15 text-emerald-700 dark:text-emerald-300">
                                FEFO
                              </span>
                            )}
                            {b.is_expired && (
                              <span className="px-1.5 py-0.2 rounded text-[9px] font-bold bg-red-500/15 text-red-600 dark:text-red-300">
                                EXP
                              </span>
                            )}
                          </div>
                          <div className="text-[11px] font-mono text-slate-500 dark:text-slate-400">
                            {(b.expiry_date || "").slice(0, 10)}
                          </div>
                        </td>

                        <td className="py-2.5 px-2.5">
                          <span
                            className={`inline-flex items-center px-2 py-0.5 rounded-full text-[10px] font-semibold border ${locMeta.badgeClass}`}
                          >
                            {locObj?.name || "Shop Counter"}
                          </span>
                          {rackTxt && (
                            <div className="text-[10px] font-mono text-slate-500 mt-0.5">
                              Rack: {rackTxt}
                            </div>
                          )}
                        </td>

                        <td className="py-2.5 px-2.5 text-right font-mono font-bold text-slate-900 dark:text-white">
                          {b.quantity}
                        </td>

                        <td className="py-2.5 px-2.5 text-right font-mono text-[11px]">
                          <div className="text-slate-500 dark:text-slate-400">
                            C: {fmtCurrency(b.unit_purchase_price ?? selectedProduct.unit_purchase_price)}
                          </div>
                          <div className="font-semibold text-emerald-600 dark:text-emerald-400">
                            S: {fmtCurrency(b.unit_sale_price ?? selectedProduct.unit_sale_price)}
                          </div>
                        </td>

                        <td
                          className="py-2.5 px-2.5 text-right"
                          onClick={(e) => e.stopPropagation()}
                        >
                          <div className="inline-flex items-center gap-1">
                            <button
                              type="button"
                              onClick={() => handleStartEditBatch(b)}
                              className="p-1.5 rounded-lg text-blue-600 hover:bg-blue-50 dark:text-blue-400 dark:hover:bg-blue-950/60 cursor-pointer"
                              title="Edit Batch"
                            >
                              <PencilSquareIcon className="w-4 h-4" />
                            </button>
                            <button
                              type="button"
                              onClick={() =>
                                setMoveModalBatch({
                                  ...b,
                                  product_name: selectedProduct.name,
                                })
                              }
                              className="p-1.5 rounded-lg text-indigo-600 hover:bg-indigo-50 dark:text-indigo-400 dark:hover:bg-indigo-950/60 cursor-pointer"
                              title="Move / Split Location"
                            >
                              <ArrowsRightLeftIcon className="w-4 h-4" />
                            </button>
                            <button
                              type="button"
                              onClick={() => handleDeleteBatch(b)}
                              className="p-1.5 rounded-lg text-rose-600 hover:bg-rose-50 dark:text-rose-400 dark:hover:bg-rose-950/60 cursor-pointer"
                              title="Delete Batch"
                            >
                              <TrashIcon className="w-4 h-4" />
                            </button>
                          </div>
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            )}
          </div>
        </div>
      </div>

      {/* BOTTOM FULL-WIDTH CARD: All Product Batches */}
      <div className="bg-white dark:bg-slate-800/90 border border-slate-200/80 dark:border-slate-700/80 rounded-2xl shadow-xs overflow-hidden">
        <div className="p-3.5 border-b border-slate-200/80 dark:border-slate-700/80 flex flex-col md:flex-row md:items-center justify-between gap-3">
          <div>
            <h2 className="text-sm font-bold text-slate-900 dark:text-white flex items-center gap-2">
              <CubeIcon className="w-4 h-4 text-indigo-500" />
              <span>All Product Batches</span>
              <span className="px-2 py-0.5 rounded-full text-[11px] font-bold bg-slate-100 dark:bg-slate-700 text-slate-700 dark:text-slate-300">
                {globalTotal} Batches
              </span>
            </h2>
            <p className="text-xs text-slate-500 dark:text-slate-400">
              Click any row to edit its batch details or add a new batch above.
            </p>
          </div>

          {/* Status Filter Pills */}
          <div className="flex items-center flex-wrap gap-1.5">
            {[
              { id: "all", label: "All", count: globalSummary.total_batches_tracked, dot: null },
              { id: "expired", label: "Expired", count: globalSummary.total_expired_batches, dot: "bg-red-500" },
              { id: "critical", label: "Critical ≤30d", count: globalSummary.total_critical_batches, dot: "bg-orange-500" },
              { id: "warning", label: "Warning", count: globalSummary.total_warning_batches, dot: "bg-amber-400" },
              { id: "safe", label: "Safe", count: Math.max(0, globalSummary.total_batches_tracked - globalSummary.total_warning_batches), dot: "bg-emerald-500" },
            ].map((tab) => {
              const active = globalStatus === tab.id;
              return (
                <button
                  key={tab.id}
                  type="button"
                  onClick={() => {
                    setGlobalStatus(tab.id);
                    setGlobalPage(1);
                  }}
                  className={`inline-flex items-center gap-1.5 px-3 py-1.5 rounded-xl text-xs font-semibold transition-all cursor-pointer ${
                    active
                      ? "bg-blue-600 text-white shadow-xs"
                      : "bg-slate-100 dark:bg-slate-700/70 text-slate-700 dark:text-slate-300 hover:bg-slate-200 dark:hover:bg-slate-700"
                  }`}
                >
                  {tab.dot && <span className={`w-2 h-2 rounded-full shrink-0 ${tab.dot}`} />}
                  <span>{tab.label}</span>
                  <span className="ml-1.5 opacity-80 font-mono">({tab.count || 0})</span>
                </button>
              );
            })}
          </div>
        </div>

        {/* Search & Location Filter Bar */}
        <div className="p-3 bg-slate-50/60 dark:bg-slate-800/40 border-b border-slate-200/70 dark:border-slate-700/70 grid grid-cols-1 sm:grid-cols-3 gap-3 items-center">
          <div className="relative">
            <MagnifyingGlassIcon className="w-4 h-4 text-slate-400 absolute left-3 top-1/2 -translate-y-1/2 pointer-events-none" />
            <input
              ref={globalSearchInputRef}
              type="text"
              value={globalSearch}
              onChange={(e) => {
                setGlobalSearch(e.target.value);
                setGlobalPage(1);
              }}
              placeholder="Filter directory by product, batch #, barcode, rack..."
              className="w-full h-[38px] pl-9 pr-3 rounded-xl border border-slate-300 dark:border-slate-600 bg-white dark:bg-slate-900 text-xs text-slate-900 dark:text-slate-100 focus:outline-hidden focus:ring-2 focus:ring-blue-500"
            />
          </div>

          <div>
            <Select
              options={[
                { value: "", label: "All Storage Locations" },
                ...locationOptions,
              ]}
              value={
                [
                  { value: "", label: "All Storage Locations" },
                  ...locationOptions,
                ].find((o) => o.value === String(globalLocationId)) || {
                  value: "",
                  label: "All Storage Locations",
                }
              }
              onChange={(opt) => {
                setGlobalLocationId(opt?.value || "");
                setGlobalPage(1);
              }}
              styles={selectStyles}
              menuPortalTarget={typeof document !== "undefined" ? document.body : null}
            />
          </div>

          <div className="flex items-center justify-between gap-2">
            <label className="inline-flex items-center gap-2 text-xs font-medium text-slate-600 dark:text-slate-300 cursor-pointer select-none">
              <input
                type="checkbox"
                checked={includeZeroQty}
                onChange={(e) => {
                  setIncludeZeroQty(e.target.checked);
                  setGlobalPage(1);
                }}
                className="rounded border-slate-300 text-blue-600 focus:ring-blue-500"
              />
              <span>Include 0-Qty Batches</span>
            </label>

            <button
              type="button"
              onClick={() => navigate("/batch-expiry")}
              className="text-xs font-semibold text-blue-600 dark:text-blue-400 hover:underline cursor-pointer"
            >
              Expiry Risk Dashboard →
            </button>
          </div>
        </div>

        {/* Global Batches Table */}
        <div className="overflow-x-auto">
          <table className="w-full text-left border-collapse text-xs">
            <thead>
              <tr className="border-b border-slate-200 dark:border-slate-700 bg-slate-50 dark:bg-slate-800 text-slate-500 dark:text-slate-400">
                <th className="py-2.5 px-3.5 font-semibold">Product</th>
                <th className="py-2.5 px-3.5 font-semibold">Batch #</th>
                <th className="py-2.5 px-3.5 font-semibold">Expiry Date</th>
                <th className="py-2.5 px-3.5 font-semibold">Status</th>
                <th className="py-2.5 px-3.5 font-semibold">Location & Rack</th>
                <th className="py-2.5 px-3.5 font-semibold text-right">Batch Qty</th>
                <th className="py-2.5 px-3.5 font-semibold text-right">Unit Cost</th>
                <th className="py-2.5 px-3.5 font-semibold text-right">Unit MRP</th>
                <th className="py-2.5 px-3.5 font-semibold text-right">Actions</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-200/70 dark:divide-slate-700/60">
              {globalLoading ? (
                <tr>
                  <td colSpan={9} className="py-10 text-center text-slate-400">
                    <ArrowPathIcon className="w-5 h-5 animate-spin mx-auto mb-1.5 text-blue-500" />
                    Loading batches directory...
                  </td>
                </tr>
              ) : globalRows.length === 0 ? (
                <tr>
                  <td colSpan={9} className="py-10 text-center text-slate-500 dark:text-slate-400">
                    <CheckCircleIcon className="w-6 h-6 mx-auto mb-1 text-emerald-500" />
                    No batches match your filter.
                  </td>
                </tr>
              ) : (
                globalRows.map((row) => {
                  const isExp = row.days_remaining < 0;
                  const isCrit = !isExp && row.days_remaining <= 30;
                  const locMeta = getLocationTypeMeta(row.storage_location_type || "shop");
                  const rackCode = row.batch_rack || row.product_rack || "";
                  const isLoadedBatch = Number(editingBatchId) === Number(row.batch_id);

                  return (
                    <tr
                      key={row.batch_id}
                      onClick={() => {
                        loadProductAndBatches(row.product_id, {
                          focusBatchInput: true,
                          batchIdToEdit: row.batch_id,
                        });
                        window.scrollTo({ top: 0, behavior: "smooth" });
                      }}
                      className={`cursor-pointer transition-colors ${
                        isLoadedBatch
                          ? "bg-amber-50/90 dark:bg-amber-950/40"
                          : "hover:bg-blue-50/40 dark:hover:bg-slate-700/40"
                      }`}
                    >
                      <td className="py-2.5 px-3.5">
                        <div className="font-bold text-slate-900 dark:text-slate-100">
                          {row.product_name}
                        </div>
                        <div className="text-[11px] text-slate-500 dark:text-slate-400">
                          Code: {row.product_code || "—"} • Pack: {row.pack_size || 1}
                        </div>
                      </td>

                      <td className="py-2.5 px-3.5 font-mono font-bold text-slate-800 dark:text-slate-200">
                        {row.batch_number}
                      </td>

                      <td className="py-2.5 px-3.5 font-mono text-slate-700 dark:text-slate-300">
                        {row.expiry_date}
                      </td>

                      <td className="py-2.5 px-3.5">
                        {isExp ? (
                          <span className="px-2 py-0.5 rounded-full text-[10px] font-bold bg-red-100 text-red-700 dark:bg-red-950/60 dark:text-red-300">
                            Expired ({Math.abs(row.days_remaining)}d ago)
                          </span>
                        ) : isCrit ? (
                          <span className="px-2 py-0.5 rounded-full text-[10px] font-bold bg-orange-100 text-orange-700 dark:bg-orange-950/60 dark:text-orange-300">
                            {row.days_remaining}d left
                          </span>
                        ) : (
                          <span className="px-2 py-0.5 rounded-full text-[10px] font-bold bg-emerald-100 text-emerald-700 dark:bg-emerald-950/60 dark:text-emerald-300">
                            {row.days_remaining}d left
                          </span>
                        )}
                      </td>

                      <td className="py-2.5 px-3.5">
                        <div className="flex items-center gap-1.5 flex-wrap">
                          <span
                            className={`px-2 py-0.5 rounded-full text-[10px] font-semibold border ${locMeta.badgeClass}`}
                          >
                            {row.storage_location_name || "Shop Counter"}
                          </span>
                          {rackCode && (
                            <span className="font-mono text-[10px] px-1.5 py-0.5 rounded bg-slate-100 dark:bg-slate-700">
                              {rackCode}
                            </span>
                          )}
                        </div>
                      </td>

                      <td className="py-2.5 px-3.5 text-right font-mono font-bold text-slate-900 dark:text-white">
                        {row.quantity}
                      </td>

                      <td className="py-2.5 px-3.5 text-right font-mono">
                        {fmtCurrency(row.batch_unit_purchase_price ?? row.unit_cost)}
                      </td>

                      <td className="py-2.5 px-3.5 text-right font-mono font-semibold text-emerald-600 dark:text-emerald-400">
                        {fmtCurrency(row.batch_unit_sale_price ?? row.unit_sale_price)}
                      </td>

                      <td
                        className="py-2.5 px-3.5 text-right"
                        onClick={(e) => e.stopPropagation()}
                      >
                        <div className="inline-flex items-center gap-1.5">
                          <button
                            type="button"
                            onClick={() => {
                              loadProductAndBatches(row.product_id, {
                                focusBatchInput: true,
                                batchIdToEdit: row.batch_id,
                              });
                              window.scrollTo({ top: 0, behavior: "smooth" });
                            }}
                            className="inline-flex items-center gap-1 px-2.5 py-1 rounded-lg text-[11px] font-semibold bg-amber-500/15 text-amber-700 dark:text-amber-300 hover:bg-amber-500/25 cursor-pointer"
                            title="Load this batch into top workbench editor"
                          >
                            <PencilSquareIcon className="w-3.5 h-3.5" />
                            <span>Edit Batch</span>
                          </button>

                          <button
                            type="button"
                            onClick={() => {
                              loadProductAndBatches(row.product_id, {
                                focusBatchInput: true,
                                batchIdToEdit: null,
                              });
                              window.scrollTo({ top: 0, behavior: "smooth" });
                            }}
                            className="inline-flex items-center gap-1 px-2.5 py-1 rounded-lg text-[11px] font-semibold bg-blue-500/15 text-blue-700 dark:text-blue-300 hover:bg-blue-500/25 cursor-pointer"
                            title="Select this product to add a new batch"
                          >
                            <PlusIcon className="w-3.5 h-3.5" />
                            <span>+ Batch</span>
                          </button>
                        </div>
                      </td>
                    </tr>
                  );
                })
              )}
            </tbody>
          </table>
        </div>
      </div>

      {/* Move / Split Batch Location Modal */}
      <MoveBatchLocationModal
        isOpen={Boolean(moveModalBatch)}
        onClose={() => setMoveModalBatch(null)}
        batch={moveModalBatch}
        storageLocations={storageLocations}
        isDark={isDark}
        selectStyles={selectStyles}
        onMoved={async () => {
          if (selectedProduct?.id) {
            await loadProductAndBatches(selectedProduct.id, { focusBatchInput: false });
          }
          await fetchGlobalBatches();
        }}
      />

      {/* Manage Storage Locations Modal */}
      <ManageStorageLocationsModal
        isOpen={manageLocationsOpen}
        onClose={() => setManageLocationsOpen(false)}
        storageLocations={storageLocations}
        onChanged={fetchStorageLocations}
        isDark={isDark}
        selectStyles={selectStyles}
      />
    </div>
  );
}

