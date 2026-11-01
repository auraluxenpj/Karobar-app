import { useInvoiceErrors, InvoiceErrorSummary, InvoiceRowError } from "../../components/InvoiceErrors";
// PurchaseReturnForm.jsx
import { useState, useEffect, useRef, useMemo } from "react";
import { useNavigate } from "react-router-dom";
import axios from "axios";
import { TrashIcon, PlusIcon, ArrowUturnLeftIcon } from "@heroicons/react/24/outline";
import toast from "react-hot-toast";
import Select from "react-select";

import ProductSearchInput from "../../components/ProductSearchInput.jsx";
import BatchSearchInput from "../../components/BatchSearchInput.jsx";
import SupplierSearch from "../../components/SupplierSearch.jsx";
import PurchaseInvoiceSearch from "../../components/PurchaseInvoiceSearch.jsx";
import PreShiftDrawerPromptModal from "@/components/PreShiftDrawerPromptModal.jsx";
import { recalcItem, recalcFooter } from "../../Formula/PurchaseReturn.js";
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

export default function PurchaseReturnForm({ returnId, initialData, onSuccess }) {
  // ===== defaults =====
  const defaultItem = {
    id: Date.now() + Math.random(),
    product_id: "",
    batch: "",
    expiry: "",
    pack_size: 0,
    // kept for reference; not used in validation
    pack_purchased_quantity: 0,
    // used for display/validation
    available_units: 0,
    return_pack_quantity: 0,
    return_unit_quantity: 0,
    pack_purchase_price: 0,
    unit_purchase_price: 0,
    item_discount_percentage: 0,
    sub_total: 0,
  };

  // ===== state =====
  const [form, setForm] = useState({
    posted_number: "",
    date: new Date().toISOString().slice(0, 10),
    supplier_id: "",
    purchase_invoice_id: "",
    settlement_mode: "cash_refund",
    payment_method: "cash",
    account_id: "",
    remarks: "",
    items: [{ ...defaultItem }],
    gross_total: 0,
    discount_percentage: 0,
    discount_amount: 0,
    tax_percentage: 0,
    tax_amount: 0,
    total: 0,
  });
  const [accounts, setAccounts] = useState([]);
  const [drawerPrompt, setDrawerPrompt] = useState(null);
  const originalReturnMetaRef = useRef(null);
  const invoiceErrors = useInvoiceErrors(form.items);

  const [suppliers, setSuppliers] = useState([]);
  const refreshProducts = async (q = "") => {
    // In invoice mode, do not override the restricted product list
    if (form.purchase_invoice_id) return;
    try {
      const { data } = await axios.get("/api/products/search", { params: { q, limit: 30 } });
      setProducts(Array.isArray(data?.data) ? data.data : Array.isArray(data) ? data : []);
    } catch (e) {}
  };

  const [catalogProducts, setCatalogProducts] = useState([]);
  const [products, setProducts] = useState([]);
  const [purchaseInvoices, setPurchaseInvoices] = useState([]);

  const [invoiceItems, setInvoiceItems] = useState([]);
  // Per-row batch options to avoid cross-row interference
  const [rowBatches, setRowBatches] = useState([]);

  const [currentField, setCurrentField] = useState(null);
  const [currentRowIndex, setCurrentRowIndex] = useState(0);

  // per-row validation flags
  const [rowErrors, setRowErrors] = useState([]); // [{ product: false, batch: false }]

  // Track react-select menu state to mimic SaleReturn behavior
  const [invoiceMenuOpen, setInvoiceMenuOpen] = useState(false);

// Track when edit mode data is fully loaded
  const [isEditModeLoaded, setIsEditModeLoaded] = useState(false);

  // Modal + selected-object state for header search
  const [supplierSearchOpen, setSupplierSearchOpen] = useState(false);
  useEffect(() => {
    // Match purchase invoice entry: select the supplier first on a new form.
    if (returnId || initialData) return;
    const timer = setTimeout(() => setSupplierSearchOpen(true), 150);
    return () => clearTimeout(timer);
  }, [returnId, initialData]);
  const [invoiceSearchOpen, setInvoiceSearchOpen] = useState(false);
  const [selectedSupplierObj, setSelectedSupplierObj] = useState(null);
  const [selectedInvoiceObj, setSelectedInvoiceObj] = useState(null);

  // ===== refs =====
  const supplierSelectRef = useRef(null);
  const purchaseInvoiceRef = useRef(null);
  const productSearchRefs = useRef([]);
  const packQuantityRefs = useRef([]);
  const packPurchasePriceRefs = useRef([]);
  const itemDiscountRefs = useRef([]);

  // OPEN RETURN: cache of product → list of batches fetched from server
  const productBatchCache = useRef(new Map()); // Map<string(productId), Array<{batch_number, expiry, available_units, pack_size?}>

  useEffect(() => {
    productSearchRefs.current = productSearchRefs.current.slice(0, form.items.length);
    packQuantityRefs.current = packQuantityRefs.current.slice(0, form.items.length);
    packPurchasePriceRefs.current = packPurchasePriceRefs.current.slice(0, form.items.length);
    itemDiscountRefs.current = itemDiscountRefs.current.slice(0, form.items.length);
  }, [form.items.length]);

  // keep rowErrors aligned with items length
  useEffect(() => {
    setRowErrors((prev) => {
      const next = prev.slice(0, form.items.length);
      while (next.length < form.items.length) next.push({ product: false, batch: false });
      return next;
    });
  }, [form.items.length]);

  // keep rowBatches aligned with items length
  useEffect(() => {
    setRowBatches((prev) => {
      const next = prev.slice(0, form.items.length);
      while (next.length < form.items.length) next.push([]);
      return next;
    });
  }, [form.items.length]);

  // ===== helpers =====
  const toNum = (v) => (v === undefined || v === null || v === "" ? 0 : Number(v));
  const firstDefined = (...vals) => vals.find((v) => v !== undefined && v !== null);
  const eqPid = (a, b) => String(a ?? "") === String(b ?? "");

  const setBatchesForRow = (rowIndex, list) => {
    setRowBatches((prev) => {
      const next = prev.slice();
      next[rowIndex] = Array.isArray(list) ? list : [];
      return next;
    });
  };

  const setRowError = (idx, field) => {
    setRowErrors((prev) => {
      const next = prev.slice();
      if (!next[idx]) next[idx] = { product: false, batch: false };
      next[idx][field] = true;
      return next;
    });
  };
  const clearRowError = (idx, field) => {
    setRowErrors((prev) => {
      const next = prev.slice();
      if (!next[idx]) next[idx] = { product: false, batch: false };
      next[idx][field] = false;
      return next;
    });
  };

  // === duplicate helpers ===
  const findDuplicateProductIndex = (pid, exceptIndex = -1) =>
    form.items.findIndex((it, idx) => idx !== exceptIndex && eqPid(it?.product_id, pid));

  const findDuplicateProductBatchIndex = (pid, batch, exceptIndex = -1, isUnbatched = false) =>
    form.items.findIndex(
      (it, idx) =>
        idx !== exceptIndex &&
        eqPid(it?.product_id, pid) &&
        (isUnbatched
          ? Boolean(it?.is_unbatched || (!it?.batch && String(it?.batch ?? "").trim() === ""))
          : String(it?.batch ?? "").trim() === String(batch ?? "").trim() && !it?.is_unbatched)
    );

  const sumBy = (rows, get) => rows.reduce((s, r) => s + toNum(get(r)), 0);
  const weightedAvg = (rows, valueKey, weightKey = "pack_quantity") => {
    const wSum = sumBy(rows, (r) => r[weightKey]);
    if (!wSum) return 0;
    const vSum = rows.reduce((s, r) => s + toNum(r[valueKey]) * toNum(r[weightKey]), 0);
    return vSum / wSum;
  };
  const mostCommon = (rows, key) => {
    const map = new Map();
    rows.forEach((r) => {
      const k = r[key];
      if (k === undefined || k === null || k === "") return;
      map.set(k, (map.get(k) || 0) + 1);
    });
    let maxK, maxC = -1;
    map.forEach((c, k) => { if (c > maxC) { maxC = c; maxK = k; } });
    return maxK;
  };

  // --- normalize product (richer for ProductSearchInput picker)
  const normalizeProduct = (src) => ({
    id: Number(firstDefined(src?.id, src?.product_id, src?.ProductId, src?.product?.id)),
    name: firstDefined(src?.name, src?.product_name, src?.product?.name, src?.title, src?.label),

    // purchase size / prices
    pack_size: toNum(firstDefined(src?.pack_size, src?.product?.pack_size)),
    pack_purchase_price: toNum(firstDefined(src?.pack_purchase_price, src?.product?.pack_purchase_price)),
    unit_purchase_price: toNum(firstDefined(src?.unit_purchase_price, src?.product?.unit_purchase_price)),

    // sale prices + stock + margin + avg price
    pack_sale_price: toNum(firstDefined(src?.pack_sale_price, src?.product?.pack_sale_price)),
    unit_sale_price: toNum(firstDefined(src?.unit_sale_price, src?.product?.unit_sale_price)),
    quantity: toNum(firstDefined(src?.quantity, src?.product?.quantity)),
    margin: toNum(firstDefined(src?.margin, src?.margin_percentage, src?.product?.margin)),

    avg_price: toNum(
      firstDefined(
        src?.avg_price,
        src?.average_unit_cost,
        src?.average_price,
        src?.avg_unit_price,
        src?.product?.avg_price
      )
    ),

    // relations (for picker columns)
    brand_id: firstDefined(src?.brand_id, src?.product?.brand_id),
    supplier_id: firstDefined(src?.supplier_id, src?.product?.supplier_id),
    brand: firstDefined(src?.brand, src?.product?.brand) || null,
    supplier: firstDefined(src?.supplier, src?.product?.supplier) || null,

    // open-return support
    available_units: toNum(firstDefined(src?.available_units, src?.available_quantity, src?.stock_units, src?.quantity, src?.stock)),
  });

  const productNameById = (pid) => {
    const p =
      products.find((p) => eqPid(firstDefined(p.id, p.value), pid)) ||
      catalogProducts.find((p) => eqPid(firstDefined(p.id, p.value), pid));
    return p?.name || `#${pid}`;
  };

  // Robustly resolve a product id from various shapes
  const resolveProductId = (obj) => {
    if (obj === null || obj === undefined) return "";
    if (typeof obj === "number") return obj;
    if (typeof obj === "string") return obj.trim();
    if (typeof obj === "object") {
      const cand = [
        obj.product_id, obj.id, obj.value, obj.ProductId, obj.productId,
        obj.product?.id, obj.product?.ProductId, obj?.data?.id
      ].find((v) => v !== undefined && v !== null && String(v).trim() !== "");
      return cand ?? "";
    }
    return "";
  };

  const invoiceItemsForProduct = (productId) =>
    invoiceItems.filter((it) => eqPid(it.product_id, productId));

  const buildBatchOptions = (itemsForProduct) => {
    const seen = new Set();
    const opts = [];
    for (const it of itemsForProduct) {
      const b = (it.batch ?? "").toString().trim();
      if (b && !seen.has(b)) {
        seen.add(b);
        opts.push({
          batch_number: b,
          expiry: it.expiry || "",
          pack_quantity: toNum(it.pack_quantity),
          pack_size: toNum(it.pack_size),
          pack_purchase_price: toNum(it.pack_purchase_price),
          unit_purchase_price: toNum(it.unit_purchase_price),
          item_discount_percentage: toNum(it.item_discount_percentage),
          available_units: unitsFromInvoiceItem(it),
        });
      } else if (!b && !seen.has("__unbatched__")) {
        seen.add("__unbatched__");
        opts.push({
          batch_number: "",
          is_unbatched: true,
          display_label: "Unassigned Stock",
          expiry: "",
          pack_quantity: toNum(it.pack_quantity),
          pack_size: toNum(it.pack_size),
          pack_purchase_price: toNum(it.pack_purchase_price),
          unit_purchase_price: toNum(it.unit_purchase_price),
          item_discount_percentage: toNum(it.item_discount_percentage),
          available_units: unitsFromInvoiceItem(it),
        });
      }
    }
    return opts;
  };

  // productHasBatches must work in both modes
  const productHasBatches = (pid) => {
    if (form.purchase_invoice_id) {
      const opts = buildBatchOptions(invoiceItemsForProduct(pid));
      return opts.length > 0;
    }
    const cached = productBatchCache.current.get(String(pid));
    return Array.isArray(cached) && cached.length > 0;
  };

  const focusProductSearch = (row) => {
    setTimeout(() => {
      productSearchRefs.current[row]?.querySelector("input")?.focus?.();
      setCurrentField("product");
      setCurrentRowIndex(row);
    }, 50);
  };
  const focusOnField = (key, row) => {
    setTimeout(() => {
      if (key === "pack_quantity" && packQuantityRefs.current[row]) packQuantityRefs.current[row].focus();
      else if (key === "pack_purchase_price" && packPurchasePriceRefs.current[row]) packPurchasePriceRefs.current[row].focus();
      else if (key === "item_discount" && itemDiscountRefs.current[row]) itemDiscountRefs.current[row].focus();
      setCurrentField(key);
      setCurrentRowIndex(row);
    }, 50);
  };

  // Helper: advance focus to first product field
  const advanceToFirstProduct = () => {
    setTimeout(() => {
      const el = productSearchRefs.current?.[0]?.querySelector?.("input");
      if (el) {
        el.focus();
        if (typeof el.select === "function") el.select();
      }
      setCurrentField("product");
      setCurrentRowIndex(0);
    }, 0);
  };

  
  // Helper: hydrate Avail.Q for OPEN-RETURN edit (live product available + original Unit.Q)
  const hydrateOpenEditAvail = async (items) => {
    const ids = Array.from(new Set(items.map((it) => it.product_id).filter(Boolean)));
    const liveMap = new Map();

    // Try batch fetch via /products/search first
    try {
      const map = await fetchProductDetailsForIds(ids);
      ids.forEach((id) => {
        const d = map.get(String(id));
        const live = Number(d?.available_units ?? d?.quantity ?? 0);
        liveMap.set(String(id), isNaN(live) ? 0 : live);
      });
    } catch (e) {
      // ignore, we'll fill below
    }

    // Fill any missing via /available-quantity
    await Promise.all(ids.map(async (id) => {
      if (liveMap.has(String(id))) return;
      try {
        const res = await axios.get("/api/products/available-quantity", { params: { product_id: id } });
        const live = Number(res?.data?.available_units ?? res?.data?.available_quantity ?? res?.data?.quantity ?? 0);
        liveMap.set(String(id), isNaN(live) ? 0 : live);
      } catch (e) {
        liveMap.set(String(id), 0);
      }
    }));

    return items.map((row) => {
      if (!row?.product_id) return row;
      const live = Number(liveMap.get(String(row.product_id)) ?? 0);
      const returnedUnitsAtCreation = Number(row.return_unit_quantity ?? 0);
      return recalcItem({ ...row, available_units: live + returnedUnitsAtCreation }, "open_edit_inline_hydrate");
    });
  };

  // ===== initial loads =====
  useEffect(() => {
    (async () => {
      try {
        const requests = [
          axios.get("/api/suppliers/search", { params: { limit: 50 } }),
          axios.get("/api/products/search", { params: { q: "", limit: 30 } }),
          axios.get("/api/accounts", { params: { active_only: 1 } }).catch(() => ({ data: [] })),
        ];
        
        
        const results = await Promise.all(requests);
        setSuppliers(Array.isArray(results[0].data) ? results[0].data : results[0].data?.data || []);
        const catalog = Array.isArray(results[1]?.data?.data) ? results[1].data.data : Array.isArray(results[1]?.data) ? results[1].data : [];
        setCatalogProducts(catalog);
        setProducts(catalog); // until an invoice is chosen
        const accountsArr = Array.isArray(results[2]?.data?.data) ? results[2].data.data : Array.isArray(results[2]?.data) ? results[2].data : [];
        setAccounts(accountsArr);
        
      } catch (err) { console.error(err); }
    })();
  }, []);

  const mergeProductsIntoLists = (arr) => {
    if (!Array.isArray(arr) || !arr.length) return;
    setProducts((prev) => {
      const seen = new Set(prev.map((p) => String(p.id)));
      const extra = arr.filter((p) => !seen.has(String(p.id)));
      return [...extra, ...prev];
    });
    setCatalogProducts((prev) => {
      const seen = new Set(prev.map((p) => String(p.id)));
      const extra = arr.filter((p) => !seen.has(String(p.id)));
      return [...extra, ...prev];
    });
  };

  useEffect(() => {
    if (!returnId) {
      if (initialData) {
        (async () => {
          try {
            const rawItems = Array.isArray(initialData.items) && initialData.items.length
              ? initialData.items
              : [{ ...defaultItem }];
            const items = rawItems.map((it) => ({
              ...defaultItem,
              ...it,
              is_unbatched: Boolean(it.is_unbatched || !it.batch || String(it.batch).trim() === ""),
            }));

            const normalized = {
              posted_number: "",
              date: initialData.date || new Date().toISOString().slice(0, 10),
              supplier_id: initialData.supplier_id || "",
              purchase_invoice_id: initialData.purchase_invoice_id || "",
              remarks: initialData.remarks || "",
              items,
              gross_total: toNum(initialData.gross_total),
              discount_percentage: toNum(initialData.discount_percentage),
              discount_amount: toNum(initialData.discount_amount),
              tax_percentage: toNum(initialData.tax_percentage),
              tax_amount: toNum(initialData.tax_amount),
              total: toNum(initialData.total),
            };

            if (normalized.supplier_id) {
              await fetchInvoices(normalized.supplier_id);
              try {
                const sRes = await axios.get(`/api/suppliers/${normalized.supplier_id}`);
                setSelectedSupplierObj(sRes.data || null);
              } catch (e) {}
            }

            const batchesArray = await Promise.all(
              normalized.items.map(async (it) => {
                if (!it.product_id) return [];
                return fetchBatchesForOpenReturn(it.product_id);
              })
            );
            setRowBatches(batchesArray);

            setForm((prev) => recalcFooter({ ...prev, ...normalized }, "init"));
          } catch (e) {
            console.error(e);
          } finally {
            setIsEditModeLoaded(true);
          }
        })();
        return;
      }
      setIsEditModeLoaded(true);
      return;
    }
    (async () => {
      try {
        const res = await axios.get(`/api/purchase-returns/${returnId}`);
        const data = res.data || {};
        const items = Array.isArray(data.items) && data.items.length ? data.items : [{ ...defaultItem }];
        const normalized = {
          posted_number: data.posted_number || data.code || "",
          date: data.date || new Date().toISOString().slice(0, 10),
          supplier_id: data.supplier_id || "",
          purchase_invoice_id: data.purchase_invoice_id || "",
          settlement_mode:
            data.settlement_mode ||
            (data.purchase_invoice?.invoice_type === "credit" ? "credit_note" : "cash_refund"),
          payment_method: data.payment_method || "cash",
          account_id: data.account_id || "",
          remarks: data.remarks || "",
          items: items.map((it) => ({
            ...defaultItem,
            ...it,
            is_unbatched: Boolean(it.is_unbatched || !it.batch || String(it.batch).trim() === ""),
          })),
          gross_total: toNum(data.gross_total),
          discount_percentage: toNum(data.discount_percentage),
          discount_amount: toNum(data.discount_amount),
          tax_percentage: toNum(data.tax_percentage),
          tax_amount: toNum(data.tax_amount),
          total: toNum(data.total),
        };
        originalReturnMetaRef.current = {
          created_at: data.created_at,
          date: data.date,
          total: toNum(data.total),
          settlement_mode:
            data.settlement_mode ||
            (data.purchase_invoice?.invoice_type === "credit" ? "credit_note" : "cash_refund"),
          payment_method: data.payment_method || "cash",
        };
        setForm((prev) => recalcFooter({ ...prev, ...normalized }, "init"));
        if (normalized.supplier_id) {
          await fetchPurchaseInvoices(normalized.supplier_id);
          const supplierObj = (suppliers || []).find((s) => String(s.id) === String(normalized.supplier_id)) || null;
          setSelectedSupplierObj(supplierObj);
        }
        if (normalized.purchase_invoice_id) {
          await loadInvoice(normalized.purchase_invoice_id);
        } else {
          // ===== OPEN-RETURN EDIT MODE =====
          // 1) Ensure product names exist in lists for ProductSearchInput
          const ids = Array.from(new Set((normalized.items || []).map((it) => it.product_id).filter((x) => x)));
          if (ids.length) {
            const map = await fetchProductDetailsForIds(ids);
            const arr = Array.from(map.values());
            mergeProductsIntoLists(arr);
          }
          // 2) Hydrate Avail.Q (Units) = live stock + original Unit.Q from this return
          const hydratedItems = await hydrateOpenEditAvail(normalized.items);
          setForm((prev) => recalcFooter({ ...prev, ...normalized, items: hydratedItems }, "open_edit_inline_hydrate_footer"));
        }
        // Mark edit mode as loaded
        setIsEditModeLoaded(true);
      } catch (err) {
        console.error(err);
        setIsEditModeLoaded(true);
      }
    })();
  }, [returnId]);

  // Focus Supplier first when creating a new return (NOT in edit mode)
  useEffect(() => {
    // Only focus supplier in create mode after data is loaded
    if (!returnId && isEditModeLoaded) {
      supplierSelectRef.current?.focus?.();
    }
  }, [returnId, isEditModeLoaded]);

  // Alt+S to save
  useEffect(() => {
    const keyHandler = (e) => {
      if (e.altKey && (e.key === "s" || e.key === "S")) {
        e.preventDefault();
        handleSubmit();
      }
    };
    document.addEventListener("keydown", keyHandler);
    return () => document.removeEventListener("keydown", keyHandler);
  }, [form, purchaseInvoices, products, invoiceItems]);

  // ===== fetchers =====
  const fetchPurchaseInvoices = async (supplierId) => {
    if (!supplierId) { setPurchaseInvoices([]); return; }
    try {
      const res = await axios.get(`/api/purchase-invoices?supplier_id=${supplierId}`);
      // API returns paginated response with 'data' property containing the array
      setPurchaseInvoices(Array.isArray(res.data?.data) ? res.data.data : Array.isArray(res.data) ? res.data : []);
    } catch (err) { console.error(err); }
  };

  const fetchProductDetailsForIds = async (ids) => {
    if (!ids?.length) return new Map();
    try {
      const { data } = await axios.get("/api/products/search", {
        params: { ids: ids.join(",") },
      });
      const arr = Array.isArray(data?.data) ? data.data : Array.isArray(data) ? data : [];
      const map = new Map();
      for (const row of arr) {
        const n = normalizeProduct(row);
        if (n.quantity && !n.available_units) n.available_units = n.quantity;
        map.set(String(n.id), n);
      }
      if (map.size) return map;
    } catch (e) {}
    const map = new Map();
    await Promise.all(ids.map(async (id) => {
      try {
        const res = await axios.get("/api/products/available-quantity", { params: { product_id: id } });
        const units = Number(res?.data?.available_units ?? 0);
        map.set(String(id), { id, quantity: units, available_units: units, name: `#${id}` });
      } catch (e) {
        map.set(String(id), { id, quantity: 0, available_units: 0, name: `#${id}` });
      }
    }));
    return map;
  };

const loadInvoice = async (invoiceId) => {
    try {
      const res = await axios.get(`/api/purchase-invoices/${invoiceId}`, { params: { exclude_return_id: returnId || undefined } });
      const data = res.data || {};
      setSelectedInvoiceObj(data);
      const items = Array.isArray(data?.items) ? data.items : [];
      setInvoiceItems(items);

      // Build unique product list from invoice (keep invoice prices)
      const byId = new Map();
      for (const it of items) {
        let p = normalizeProduct(it.product || it);
        if (!p.id || !p.name) continue;
        p.pack_size           = toNum(firstDefined(it.pack_size, p.pack_size));
        p.pack_purchase_price = toNum(firstDefined(it.pack_purchase_price, p.pack_purchase_price));
        p.unit_purchase_price = toNum(firstDefined(it.unit_purchase_price, p.unit_purchase_price));
        if (!byId.has(p.id)) byId.set(p.id, p);
      }
      const invoiceProducts = Array.from(byId.values());
      const ids = invoiceProducts.map(p => p.id);

      // fetch extra details
      const detailsMap = await fetchProductDetailsForIds(ids);
      const merged = invoiceProducts.map((p) => {
        const d = detailsMap.get(String(p.id));
        if (!d) return p;
        return {
          ...p,
          quantity: toNum(firstDefined(p.quantity, d.quantity)),
          available_units: toNum(firstDefined(p.available_units, d.available_units, d.quantity)),
          pack_sale_price: toNum(firstDefined(p.pack_sale_price, d.pack_sale_price)),
          unit_sale_price: toNum(firstDefined(p.unit_sale_price, d.unit_sale_price)),
          margin: toNum(firstDefined(p.margin, d.margin)),
          avg_price: toNum(firstDefined(p.avg_price, d.avg_price)),
          brand_id: firstDefined(p.brand_id, d.brand_id),
          supplier_id: firstDefined(p.supplier_id, d.supplier_id),
          brand: p.brand || d.brand || null,
          supplier: p.supplier || d.supplier || null,
        };
      });
      setProducts(merged.length ? merged : catalogProducts);
    } catch (err) {
      console.error(err);
      setInvoiceItems([]);
      setProducts(catalogProducts);
    }
  };

  // ===== OPEN RETURN: batch fetcher =====
  const normalizeOpenBatch = (src) => ({
    ...src,
    batch_number: String(firstDefined(src?.batch_number, src?.batch, src?.code, src?.number, "")).trim(),
    expiry: firstDefined(src?.expiry, src?.expiration_date, src?.expiry_date, "") || "",
    available_units: toNum(firstDefined(src?.available_units, src?.quantity, src?.available_quantity, src?.units)),
    pack_size: toNum(firstDefined(src?.pack_size, src?.product?.pack_size, 0)),
    is_unbatched: Boolean(src?.is_unbatched),
  });

  const fetchBatchesForOpenReturn = async (productId) => {
    try {
      const res = await axios.get(`/api/products/${productId}/batches?include_unbatched=1`);
      const list = Array.isArray(res.data) ? res.data.map(normalizeOpenBatch).filter(b => b.batch_number || b.is_unbatched) : [];
      productBatchCache.current.set(String(productId), list);
      return list;
    } catch (e) {
      productBatchCache.current.set(String(productId), []);
      return [];
    }
  };

  // -------- availability lookups --------
  const availabilityCache = useRef(new Map()); // key = `${productId}::${batch|ALL}` → units
  const fetchAvailableUnits = async (productId, batchOrNull, fallbackFromCatalog = true) => {
    const key = `${productId}::${batchOrNull ? String(batchOrNull) : "ALL"}`;
    if (availabilityCache.current.has(key)) return availabilityCache.current.get(key);

    if (fallbackFromCatalog && !batchOrNull) {
      const prod =
        products.find((p) => eqPid(firstDefined(p.id, p.value), productId)) ||
        catalogProducts.find((p) => eqPid(firstDefined(p.id, p.value), productId));
      if (prod?.available_units || prod?.available_units === 0) {
        const units = toNum(prod.available_units);
        availabilityCache.current.set(key, units);
        return units;
      }
    }

    try {
      const params = batchOrNull ? { product_id: productId, batch: batchOrNull } : { product_id: productId };
      const res = await axios.get("/api/products/available-quantity", { params });
      const units = toNum(res?.data?.available_units);
      availabilityCache.current.set(key, units);
      return units;
    } catch (e) {
      availabilityCache.current.set(key, 0);
      return 0;
    }
  };

  // Prefer batch list -> fallback to /available-quantity (usable in both modes)
  const getBatchAvailability = async (productId, batchNumber) => {
    const pid = String(productId);
    let list = productBatchCache.current.get(pid);

    if (!Array.isArray(list)) {
      list = await fetchBatchesForOpenReturn(productId);
    }

    const found = Array.isArray(list)
      ? list.find((b) => String(b.batch_number) === String(batchNumber))
      : null;

    if (found && (found.available_units || found.available_units === 0)) {
      return toNum(found.available_units);
    }

    return await fetchAvailableUnits(productId, batchNumber);
  };

  // ===== handlers =====
  const handleChange = (e) => {
    const { name, value } = e.target;
    let next = { ...form, [name]: value };
    if (name === "discount_percentage" || name === "tax_percentage") {
      next = recalcFooter(next, name);
    }
    setForm(next);
  };

const handleSelectChange = async (field, value) => {
    const v = value?.value ?? value ?? "";
    if (field === "supplier_id") {
      setForm((prev) => ({ ...prev, supplier_id: v, purchase_invoice_id: "" }));
      const supplierObj = (suppliers || []).find((s) => String(s.id) === String(v)) || null;
      setSelectedSupplierObj(supplierObj);
      setSelectedInvoiceObj(null);
      await fetchPurchaseInvoices(v);
      setInvoiceItems([]);
      setRowErrors([]);
      productBatchCache.current = new Map(); // reset open-mode cache
      setRowBatches([]);
      setProducts(catalogProducts);
      setForm((prev) => {
        const items = prev.items.map((it) => ({
          ...it,
          product_id: "",
          batch: "",
          expiry: "",
          pack_size: 0,
          pack_purchased_quantity: 0,
          available_units: 0,
          return_pack_quantity: 0,
          return_unit_quantity: 0,
          pack_purchase_price: 0,
          unit_purchase_price: 0,
          item_discount_percentage: 0,
        }));
        return recalcFooter({ ...prev, items }, "supplier_change");
      });
      setTimeout(() => purchaseInvoiceRef.current?.focus?.(), 50);
      return;
    }

    if (field === "purchase_invoice_id") {
      const id = v;
      setForm((prev) => ({ ...prev, purchase_invoice_id: id }));
      if (id) {
        await loadInvoice(id);
        // Sync the supplier to the invoice's supplier for consistency
        try {
          const invRes = await axios.get(`/api/purchase-invoices/${id}`);
          const inv = invRes.data || {};
          setSelectedInvoiceObj(inv);
          const autoSettlementMode = inv.invoice_type === "credit" ? "credit_note" : "cash_refund";
          setForm((prev) => ({
            ...prev,
            ...(inv.supplier_id ? { supplier_id: inv.supplier_id } : {}),
            purchase_invoice_id: id,
            settlement_mode: autoSettlementMode,
          }));
          if (inv.supplier_id) {
            const supplierObj = (suppliers || []).find((s) => String(s.id) === String(inv.supplier_id)) || null;
            setSelectedSupplierObj(supplierObj);
          }
        } catch (e) {
          setSelectedInvoiceObj(null);
        }
      } else {
        setSelectedInvoiceObj(null);
        setInvoiceItems([]);
        setProducts(catalogProducts);
        setForm((prev) => ({ ...prev, settlement_mode: "cash_refund" }));
      }
      setRowErrors([]);
      productBatchCache.current = new Map();
      setRowBatches([]);
      setForm((prev) => {
        const items = prev.items.map((it) => ({
          ...it,
          batch: "",
          expiry: "",
          pack_purchased_quantity: 0,
          available_units: 0,
          return_pack_quantity: 0,
          return_unit_quantity: 0,
          item_discount_percentage: 0,
        }));
        return recalcFooter({ ...prev, items }, "invoice_change");
      });

      // After selecting an invoice, go to the first Product search
      setTimeout(() => {
        const el = productSearchRefs.current?.[0]?.querySelector?.("input");
        if (el) {
          el.focus();
          if (typeof el.select === "function") el.select();
        }
        setCurrentField("product");
        setCurrentRowIndex(0);
      }, 50);

      return;
    }
  };

  const handleProductSelect = async (index, productIdOrObj) => {
    const pidRaw = resolveProductId(productIdOrObj);
    const pidStr = String(pidRaw || "").trim();
    if (!pidStr) return;

    const selFrom = (arr, id) =>
      arr.find((p) => String(p.id ?? p.value ?? "") === id);
    const selected =
      selFrom(products, pidStr) || selFrom(catalogProducts, pidStr) || productIdOrObj;
    const selectedId = resolveProductId(selected);

    const isInvoiceMode = !!form.purchase_invoice_id;
    const itemsForProduct = isInvoiceMode ? invoiceItemsForProduct(selectedId) : [];
    const batchOptsInvoice = isInvoiceMode ? buildBatchOptions(itemsForProduct) : [];

    // Set product early and reset dependent fields
    const newItems = [...form.items];
    const base = {
      ...newItems[index],
      product_id: selectedId,
      batch: "",
      expiry: "",
      pack_size: toNum(firstDefined(selected?.pack_size, newItems[index].pack_size)),
      pack_purchase_price: toNum(firstDefined(selected?.pack_purchase_price, newItems[index].pack_purchase_price)),
      unit_purchase_price: toNum(firstDefined(selected?.unit_purchase_price, newItems[index].unit_purchase_price)),
      pack_purchased_quantity: 0,
      available_units: 0,
      return_pack_quantity: 0,
      return_unit_quantity: 0,
      item_discount_percentage: 0,
    };

    let updated = recalcItem(base, "product_id");
    updated.product_id = selectedId;
    newItems[index] = updated;
    setForm((prev) => recalcFooter({ ...prev, items: newItems }, "items"));

    if (!isInvoiceMode) {
      // OPEN RETURN
      const openBatches = await fetchBatchesForOpenReturn(selectedId);
      const assignedBatchesOpen = (openBatches || []).filter(
        (b) => !b.is_unbatched && b.batch_number && String(b.batch_number).trim() !== ""
      );
      const usedOnOtherRows = form.items
        .filter((it, idx) => idx !== index && eqPid(it.product_id, selectedId))
        .map((it) => (it.batch ? String(it.batch).trim() : (it.is_unbatched ? "__unbatched__" : "")));

      if (openBatches.length === 0 || assignedBatchesOpen.length === 0) {
        if (usedOnOtherRows.length > 0) {
          invoiceErrors.showMessage(`Duplicate product "${productNameById(selectedId)}" already used in row ${findDuplicateProductIndex(selectedId, index) + 1}.`);
          setRowError(index, "product");
          focusProductSearch(index);
          return;
        } else {
          clearRowError(index, "product");
        }

        // No assigned batches → auto-select unassigned and use available stock
        const unbatchedItem = (openBatches || []).find((b) => b.is_unbatched);
        const totalAvail = unbatchedItem?.available_units != null
          ? Number(unbatchedItem.available_units)
          : await fetchAvailableUnits(selectedId, null);
        newItems[index] = recalcItem(
          { ...newItems[index], batch: "", expiry: "", is_unbatched: true, available_units: toNum(totalAvail) },
          "set_available_units_no_batch_open"
        );
        clearRowError(index, "batch");
        setBatchesForRow(index, openBatches || []);
        setForm((prev) => recalcFooter({ ...prev, items: newItems }, "items"));
        focusOnField("pack_quantity", index);
        return;
      }

      // Has batches in open mode
      const availableBatches = openBatches.filter((b) => {
        const key = b.is_unbatched ? "__unbatched__" : String(b.batch_number).trim();
        return !usedOnOtherRows.includes(key);
      });

      if (availableBatches.length === 0 && usedOnOtherRows.length > 0) {
        invoiceErrors.showMessage(`All batches and unassigned stock for "${productNameById(selectedId)}" are already added on earlier rows.`);
        setRowError(index, "product");
        focusProductSearch(index);
        return;
      }

      clearRowError(index, "product");
      setBatchesForRow(index, openBatches);
      if (availableBatches.length === 1) {
        const b = availableBatches[0];
        const isUnb = Boolean(b.is_unbatched);
        const availUnits = isUnb
          ? toNum(firstDefined(b.available_units, await fetchAvailableUnits(selectedId, null)))
          : toNum(firstDefined(b.available_units, await fetchAvailableUnits(selectedId, b.batch_number)));
        newItems[index] = recalcItem(
          {
            ...newItems[index],
            product_id: selectedId,
            batch: isUnb ? "" : b.batch_number,
            expiry: isUnb ? "" : (b.expiry || ""),
            is_unbatched: isUnb,
            pack_size: toNum(firstDefined(newItems[index].pack_size, b.pack_size, 0)),
            available_units: availUnits,
          },
          "open_batch_auto_apply"
        );
        clearRowError(index, "batch");
        setForm((prev) => recalcFooter({ ...prev, items: newItems }, "items"));
        focusOnField("pack_quantity", index);
        return;
      }

      // Multiple batches → require a batch; show 0 until picked
      newItems[index] = recalcItem({ ...newItems[index], available_units: 0 }, "open_multi_batches_wait");
      setForm((prev) => recalcFooter({ ...prev, items: newItems }, "items"));
      setCurrentField("batch");
      setCurrentRowIndex(index);
      return;
    }

    // INVOICE MODE
    const assignedBatchesInv = batchOptsInvoice.filter(
      (b) => !b.is_unbatched && b.batch_number && String(b.batch_number).trim() !== ""
    );
    const usedOnOtherRowsInv = form.items
      .filter((it, idx) => idx !== index && eqPid(it.product_id, selectedId))
      .map((it) => (it.batch ? String(it.batch).trim() : (it.is_unbatched ? "__unbatched__" : "")));

    if (batchOptsInvoice.length === 0 || assignedBatchesInv.length === 0) {
      if (usedOnOtherRowsInv.length > 0) {
        invoiceErrors.showMessage(`Duplicate product "${productNameById(selectedId)}" already used in row ${findDuplicateProductIndex(selectedId, index) + 1}.`);
        setRowError(index, "product");
        focusProductSearch(index);
        return;
      } else {
        clearRowError(index, "product");
      }

      // No assigned batches for this product on invoice → use unassigned units purchased on that invoice
      const unbatchedOpt = batchOptsInvoice.find((b) => b.is_unbatched);
      const totalUnits = unbatchedOpt
        ? unitsOnInvoiceForProductBatch(selectedId, "")
        : unitsOnInvoiceForProduct(selectedId);
      newItems[index] = recalcItem(
        {
          ...newItems[index],
          batch: "",
          expiry: "",
          is_unbatched: true,
          available_units: toNum(totalUnits),
          pack_size: toNum(firstDefined(unbatchedOpt?.pack_size, newItems[index].pack_size)),
          pack_purchased_quantity: toNum(unbatchedOpt?.pack_quantity),
          pack_purchase_price: toNum(firstDefined(unbatchedOpt?.pack_purchase_price, newItems[index].pack_purchase_price)),
          unit_purchase_price: toNum(firstDefined(unbatchedOpt?.unit_purchase_price, newItems[index].unit_purchase_price)),
          item_discount_percentage: toNum(unbatchedOpt?.item_discount_percentage),
        },
        "set_available_units_no_batch_invoice_unitsPurchased"
      );
      clearRowError(index, "batch");
      setBatchesForRow(index, batchOptsInvoice);
      setForm((prev) => recalcFooter({ ...prev, items: newItems }, "items"));
      focusOnField("pack_quantity", index);
      return;
    }

    const availableBatchesInv = batchOptsInvoice.filter((b) => {
      const key = b.is_unbatched ? "__unbatched__" : String(b.batch_number).trim();
      return !usedOnOtherRowsInv.includes(key);
    });

    if (availableBatchesInv.length === 0 && usedOnOtherRowsInv.length > 0) {
      invoiceErrors.showMessage(`All batches and unassigned stock for "${productNameById(selectedId)}" on this invoice are already added on earlier rows.`);
      setRowError(index, "product");
      focusProductSearch(index);
      return;
    }

    setBatchesForRow(index, batchOptsInvoice);
    clearRowError(index, "product");

    if (availableBatchesInv.length === 1) {
      const b = availableBatchesInv[0];
      const isUnb = Boolean(b.is_unbatched);
      const avail = unitsOnInvoiceForProductBatch(selectedId, isUnb ? "" : b.batch_number);
      const upd3 = [...form.items];
      upd3[index] = recalcItem(
        {
          ...upd3[index],
          product_id: selectedId,
          batch: isUnb ? "" : b.batch_number,
          expiry: isUnb ? "" : (b.expiry || ""),
          is_unbatched: isUnb,
          pack_size: toNum(firstDefined(b.pack_size, upd3[index].pack_size)),
          pack_purchased_quantity: toNum(b.pack_quantity), // reference only
          available_units: toNum(avail),                   // used for validation
          pack_purchase_price: toNum(firstDefined(b.pack_purchase_price, upd3[index].pack_purchase_price)),
          unit_purchase_price: toNum(firstDefined(b.unit_purchase_price, upd3[index].unit_purchase_price)),
          item_discount_percentage: toNum(b.item_discount_percentage),
        },
        "batch_auto_apply_invoice"
      );
      clearRowError(index, "batch");
      setForm((prev) => recalcFooter({ ...prev, items: upd3 }, "items"));
      focusOnField("pack_quantity", index);
      return;
    }

    // Multiple batches on invoice → require batch; show 0 until picked
    newItems[index] = recalcItem({ ...newItems[index], available_units: 0 }, "invoice_multi_batches_wait");
    setForm((prev) => recalcFooter({ ...prev, items: newItems }, "items"));
    setCurrentField("batch");
    setCurrentRowIndex(index);
  };

  const handleBatchSelect = async (index, val, batchObj = null) => {
    const rowItem = form.items[index];
    let ensurePid = rowItem?.product_id;

    const isUnbatched = Boolean(
      batchObj?.is_unbatched ||
      val === "__unbatched__" ||
      val === "[Unassigned Stock]" ||
      val === "[Unbatched Stock]"
    );

    const batchNumber = isUnbatched ? "" : (
      typeof val === "string"
        ? val
        : val?.value ?? val?.batch ?? val?.batch_number ?? batchObj?.batch_number ?? ""
    );

    const bn = isUnbatched ? "" : String(batchNumber ?? "").trim();

    if ((!ensurePid || String(ensurePid).trim() === "") && form.purchase_invoice_id) {
      const matches = isUnbatched
        ? invoiceItems.filter((it) => !String(it.batch ?? "").trim())
        : invoiceItems.filter((it) => String(it.batch ?? "") === bn);
      const uniquePids = Array.from(new Set(matches.map((m) => m.product_id))).filter((x) => x !== undefined && x !== null);
      if (uniquePids.length === 1) { ensurePid = uniquePids[0]; }
    }

    if (ensurePid) {
      const dupIndex2 = findDuplicateProductBatchIndex(ensurePid, bn, index, isUnbatched);
      if (dupIndex2 !== -1) {
        invoiceErrors.showMessage(
          isUnbatched
            ? `Row ${dupIndex2 + 1} already has unassigned stock for "${productNameById(ensurePid)}". Each batch (or unassigned stock) can only be selected once per product.`
            : `Duplicate (product + batch) in row ${dupIndex2 + 1}. Use a unique batch for the same product.`
        );
        setRowError(index, "batch");
        const updDup = [...form.items];
        updDup[index] = recalcItem(
          { ...updDup[index], batch: "", expiry: "", is_unbatched: false, available_units: 0 },
          "duplicate_product_batch_from_batch"
        );
        setForm((prev) => recalcFooter({ ...prev, items: updDup }, "items"));
        setCurrentField("batch");
        setCurrentRowIndex(index);
        return;
      }
    }

    if (isUnbatched) {
      clearRowError(index, "batch");
      const upd = [...form.items];
      if (form.purchase_invoice_id) {
        const matched = invoiceItems.find(
          (it) => eqPid(it.product_id, ensurePid) && !String(it.batch ?? "").trim()
        );
        const avail = unitsOnInvoiceForProductBatch(ensurePid, "");
        upd[index] = recalcItem(
          {
            ...upd[index],
            product_id: ensurePid,
            batch: "",
            expiry: "",
            is_unbatched: true,
            pack_size: toNum(firstDefined(matched?.pack_size, upd[index].pack_size)),
            pack_purchased_quantity: toNum(matched?.pack_quantity),
            available_units: toNum(avail),
            pack_purchase_price: toNum(firstDefined(matched?.pack_purchase_price, upd[index].pack_purchase_price)),
            unit_purchase_price: toNum(firstDefined(matched?.unit_purchase_price, upd[index].unit_purchase_price)),
            item_discount_percentage: toNum(firstDefined(matched?.item_discount_percentage, 0)),
          },
          "unbatched_selected_invoice"
        );
      } else {
        const totalAvail = toNum(firstDefined(batchObj?.available_units, await fetchAvailableUnits(ensurePid, null)));
        upd[index] = recalcItem(
          {
            ...upd[index],
            product_id: ensurePid,
            batch: "",
            expiry: "",
            is_unbatched: true,
            available_units: totalAvail,
          },
          "unbatched_selected_open"
        );
      }
      setForm((prev) => recalcFooter({ ...prev, items: upd }, "items"));
      focusOnField("pack_quantity", index);
      return;
    }

    if (!bn) {
      // Clearing batch
      clearRowError(index, "batch");
      const upd = [...form.items];
      if (form.purchase_invoice_id) {
        const hasB = productHasBatches(ensurePid);
        if (hasB) {
          upd[index] = recalcItem({ ...upd[index], batch: "", expiry: "", is_unbatched: false, available_units: 0 }, "batch_cleared_invoice_has_batches");
        } else {
          const totalAvail = await fetchAvailableUnits(ensurePid, null);
          upd[index] = recalcItem({ ...upd[index], batch: "", expiry: "", is_unbatched: true, available_units: toNum(totalAvail) }, "batch_cleared_invoice_no_batches");
        }
      } else {
        const cached = productBatchCache.current.get(String(ensurePid)) || [];
        if (cached.length > 0) {
          upd[index] = recalcItem({ ...upd[index], batch: "", expiry: "", is_unbatched: false, available_units: 0 }, "batch_cleared_open_has_batches");
        } else {
          const totalAvail = await fetchAvailableUnits(ensurePid, null);
          upd[index] = recalcItem({ ...upd[index], batch: "", expiry: "", is_unbatched: true, available_units: toNum(totalAvail) }, "batch_cleared_open_no_batches");
        }
      }
      setForm((prev) => recalcFooter({ ...prev, items: upd }, "items"));
      return;
    }

    // ===== After picking a batch: always show batch-level availability =====
    const upd = [...form.items];
    if (form.purchase_invoice_id) {
      const matched = invoiceItems.find(
        (it) => eqPid(it.product_id, ensurePid) && String(it.batch ?? "") === bn
      );
      if (!matched) {
        invoiceErrors.showMessage("Selected batch not found on this invoice.");
        return;
      }
      const avail = unitsOnInvoiceForProductBatch(ensurePid, bn);
      clearRowError(index, "batch");
      upd[index] = recalcItem(
        {
          ...upd[index],
          product_id: ensurePid,
          batch: bn,
          expiry: matched.expiry || "",
          is_unbatched: false,
          pack_size: toNum(firstDefined(matched.pack_size, upd[index].pack_size)),
          pack_purchased_quantity: toNum(matched.pack_quantity),
          available_units: toNum(avail), // ✅ units purchased (qty + bonus) for that batch
          pack_purchase_price: toNum(firstDefined(matched.pack_purchase_price, upd[index].pack_purchase_price)),
          unit_purchase_price: toNum(firstDefined(matched.unit_purchase_price, upd[index].unit_purchase_price)),
          item_discount_percentage: toNum(firstDefined(matched.item_discount_percentage, 0)),
        },
        "batch_selected_invoice"
      );
    } else {
      // open mode — prefer batch list's available_units
      const cached = productBatchCache.current.get(String(ensurePid)) || [];
      const matchedOpen = cached.find((b) => String(b.batch_number) === bn) || null;
      if (!matchedOpen) {
        invoiceErrors.showMessage("Selected batch not found for this product.");
        return;
      }
      const avail = toNum(firstDefined(matchedOpen.available_units, await fetchAvailableUnits(ensurePid, bn)));
      clearRowError(index, "batch");
      upd[index] = recalcItem(
        {
          ...upd[index],
          product_id: ensurePid,
          batch: bn,
          expiry: matchedOpen.expiry || "",
          is_unbatched: false,
          pack_size: toNum(firstDefined(upd[index]?.pack_size, matchedOpen.pack_size, 0)),
          available_units: avail,
        },
        "batch_selected_open"
      );
    }
    setForm((prev) => recalcFooter({ ...prev, items: upd }, "items"));
    focusOnField("pack_quantity", index);
  };

  const handleItemChange = (rowIndex, field, rawVal) => {
    const value = rawVal === "" ? "" : Number(rawVal);
    const newItems = [...form.items];
    newItems[rowIndex] = recalcItem({ ...newItems[rowIndex], [field]: value }, field);
    const newForm = recalcFooter({ ...form, items: newItems }, "items");
    setForm(newForm);
  };

  const handleProductKeyDown = (e, rowIndex) => {
    if (e.key === "Enter") {
      e.preventDefault();
      if (currentField === "batch") setCurrentRowIndex(rowIndex);
      else focusOnField("pack_quantity", rowIndex);
    }
    if (e.key === "ArrowDown") {
      e.preventDefault();
      if (rowIndex === form.items.length - 1) {
        addItem();
        setTimeout(() => focusProductSearch(rowIndex + 1), 150);
      } else {
        focusProductSearch(rowIndex + 1);
      }
    }
    if (e.key === "ArrowUp") {
      e.preventDefault();
      const prevRow = Math.max(0, rowIndex - 1);
      focusProductSearch(prevRow);
    }
  };

  const handleKeyDown = (e, field, rowIndex) => {
    if (e.key === "Enter") {
      e.preventDefault();
      if (field === "pack_quantity") focusOnField("pack_purchase_price", rowIndex);
      else if (field === "pack_purchase_price") focusOnField("item_discount", rowIndex);
      else if (field === "item_discount") {
        if (rowIndex === form.items.length - 1) {
          addItem();
          focusProductSearch(form.items.length);
        } else {
          focusProductSearch(rowIndex + 1);
        }
      }
    }
    if (e.key === "ArrowDown") {
      e.preventDefault();
      if (rowIndex === form.items.length - 1) {
        addItem();
        setTimeout(() => focusProductSearch(rowIndex + 1), 150);
      } else {
        const nextRow = Math.min(form.items.length - 1, rowIndex + 1);
        focusOnField(field, nextRow);
      }
    }
    if (e.key === "ArrowUp") {
      e.preventDefault();
      const prevRow = Math.max(0, rowIndex - 1);
      focusOnField(field, prevRow);
    }
  };

  const addItem = () => {
    const newItem = { ...defaultItem, id: Date.now() + Math.random() };
    setForm((prev) => ({ ...prev, items: [...prev.items, newItem] }));
    setCurrentRowIndex(form.items.length);
  };

  const removeItem = (index) => {
    if (form.items.length <= 1) return;
    const newItems = form.items.filter((_, i) => i !== index);
    const newForm = recalcFooter({ ...form, items: newItems }, "items");
    setForm(newForm);
    setRowErrors((prev) => {
      const next = prev.slice();
      next.splice(index, 1);
      return next;
    });
  };

  // -------- submit with validations --------
  const handleSubmit = async () => {
    invoiceErrors.clear();
    try {
      if (!form.supplier_id) {
        invoiceErrors.showMessage("Please select a supplier");
        supplierSelectRef.current?.focus?.();
        return;
      }

      // Uniqueness validation
      {
        const seen = new Map(); // key → row
        for (let i = 0; i < form.items.length; i++) {
          const it = form.items[i];
          const pid = it?.product_id;
          if (!pid) continue;
          const batchKey = it.batch && String(it.batch).trim() !== "" ? `batch:${String(it.batch).trim()}` : "unbatched";
          const key = `${pid}::${batchKey}`;
          if (seen.has(key)) {
            const firstRow = seen.get(key);
            const pName = productNameById(pid);
            if (batchKey === "unbatched") {
              invoiceErrors.showMessage(`Unassigned stock for "${pName}" is selected on both row ${firstRow + 1} and row ${i + 1}. Unassigned stock can only be added once.`);
            } else {
              invoiceErrors.showMessage(`Duplicate batch "${it.batch}" for "${pName}" on rows ${firstRow + 1} and ${i + 1}. Each batch can only be selected once per return.`);
            }
            setRowError(i, "batch");
            setCurrentField("batch"); setCurrentRowIndex(i);
            return;
          }
          seen.set(key, i);
        }
      }

      // Unified quantity validation (Returned units = Unit.Q)
      for (let i = 0; i < form.items.length; i++) {
        const it = form.items[i];
        if (!it.product_id) continue;

        const returnedUnits = toNum(it.return_unit_quantity);
        const isUnbatched = Boolean(it.is_unbatched || (!it.batch && String(it.batch ?? "").trim() === ""));

        let available = toNum(it.available_units);
        if (productHasBatches(it.product_id)) {
          if (!it.batch && !isUnbatched) {
            invoiceErrors.showMessage(`Row ${i + 1}: Please pick a batch or unassigned stock for this product.`);
            setRowError(i, "batch");
            setCurrentField("batch"); setCurrentRowIndex(i);
            return;
          }
          if (!available) {
            available = isUnbatched
              ? await fetchAvailableUnits(it.product_id, null)
              : await getBatchAvailability(it.product_id, it.batch);
          }
        } else {
          if (!available) {
            available = await fetchAvailableUnits(it.product_id, null);
          }
        }
        // Block saving if availability is zero
        if (toNum(available) <= 0) {
          invoiceErrors.showMessage(`Row ${i + 1}: "${productNameById(it.product_id)}" has Avail.Q (Units) of 0.`);
          if (productHasBatches(it.product_id)) {
            setCurrentField("batch"); setCurrentRowIndex(i);
          } else {
            focusProductSearch(i);
          }
          return;
        }

        if (returnedUnits > toNum(available)) {
          invoiceErrors.showMessage(`Row ${i + 1}: Returned units (${returnedUnits}) exceed available (${available}).`);
          return;
        }
      }

      // Build payload and save
      // On CREATE: don't send posted_number (let server generate)
      // On UPDATE: send posted_number (preserve existing)
      const payloadToSend = returnId
        ? {
            ...form,
            settlement_mode: form.settlement_mode || "cash_refund",
            payment_method: form.payment_method || "cash",
            account_id: form.account_id ? Number(form.account_id) : null,
            purchase_invoice_id:
              form.purchase_invoice_id && String(form.purchase_invoice_id).trim() !== "" ? form.purchase_invoice_id : null,
            items: form.items
              .filter((it) => it.product_id)
              .map((it) => ({
                ...it,
                pack_size: toNum(it.pack_size),
                pack_purchased_quantity: toNum(it.pack_purchased_quantity),
                available_units: toNum(it.available_units),
                return_pack_quantity: toNum(it.return_pack_quantity),
                return_unit_quantity: toNum(it.return_unit_quantity),
                pack_purchase_price: toNum(it.pack_purchase_price),
                unit_purchase_price: toNum(it.unit_purchase_price),
                item_discount_percentage: toNum(it.item_discount_percentage),
                sub_total: toNum(it.sub_total),
              })),
          }
        : {
            // Exclude posted_number on create - let server assign it
            date: form.date,
            supplier_id: form.supplier_id,
            purchase_invoice_id:
              form.purchase_invoice_id && String(form.purchase_invoice_id).trim() !== "" ? form.purchase_invoice_id : null,
            settlement_mode: form.settlement_mode || "cash_refund",
            payment_method: form.payment_method || "cash",
            account_id: form.account_id ? Number(form.account_id) : null,
            remarks: form.remarks,
            gross_total: form.gross_total,
            discount_percentage: form.discount_percentage,
            discount_amount: form.discount_amount,
            tax_percentage: form.tax_percentage,
            tax_amount: form.tax_amount,
            total: form.total,
            items: form.items
              .filter((it) => it.product_id)
              .map((it) => ({
                product_id: it.product_id,
                batch: it.batch,
                expiry: it.expiry,
                pack_size: toNum(it.pack_size),
                pack_purchased_quantity: toNum(it.pack_purchased_quantity),
                available_units: toNum(it.available_units),
                return_pack_quantity: toNum(it.return_pack_quantity),
                return_unit_quantity: toNum(it.return_unit_quantity),
                pack_purchase_price: toNum(it.pack_purchase_price),
                unit_purchase_price: toNum(it.unit_purchase_price),
                item_discount_percentage: toNum(it.item_discount_percentage),
                sub_total: toNum(it.sub_total),
              })),
          };

      const doSave = async (dataPayload) => {
        try {
          if (returnId) {
            await axios.put(`/api/purchase-returns/${returnId}`, dataPayload);
            window.dispatchEvent(new CustomEvent("cash-drawer-changed"));
            window.dispatchEvent(new CustomEvent("accounts-changed"));
            try { localStorage.setItem("cash_drawer_sync", String(Date.now())); } catch {}
            try { localStorage.setItem("accounts_sync", String(Date.now())); } catch {}
            toast.success("Purchase return updated");
            onSuccess?.(returnId);
          } else {
            const { data: saved } = await axios.post(`/api/purchase-returns`, dataPayload);
            window.dispatchEvent(new CustomEvent("cash-drawer-changed"));
            window.dispatchEvent(new CustomEvent("accounts-changed"));
            try { localStorage.setItem("cash_drawer_sync", String(Date.now())); } catch {}
            try { localStorage.setItem("accounts_sync", String(Date.now())); } catch {}
            setForm((prev) => ({ ...prev, posted_number: saved?.posted_number || prev.posted_number }));
            toast.success(`Purchase return created: ${saved?.posted_number || ""}`);
            if (saved?.id) {
              onSuccess?.(saved.id);
            } else {
              onSuccess?.();
            }
          }
        } catch (err) {
          console.error(err);
          invoiceErrors.showError(err);
        }
      };

      if (returnId) {
        const orig = originalReturnMetaRef.current || {};
        const origIsCashDrawer =
          (orig.settlement_mode || "cash_refund") === "cash_refund" &&
          (orig.payment_method || "cash") === "cash";
        const newIsCashDrawer =
          (form.settlement_mode || "cash_refund") === "cash_refund" &&
          (form.payment_method || "cash") === "cash";
        const oldCash = origIsCashDrawer ? Number(orig.total ?? 0) : 0;
        const newCash = newIsCashDrawer ? toNum(form.total) : 0;
        const cashDelta = Math.round((newCash - oldCash) * 100) / 100;

        if (Math.abs(cashDelta) > 0.001) {
          try {
            const drawerRes = await axios.get("/api/cash-drawer/current");
            if (drawerRes.data?.is_open && drawerRes.data?.session) {
              const returnTime = new Date(orig.created_at || orig.date).getTime();
              const shiftTime = new Date(drawerRes.data.session.opened_at).getTime();

              if (returnTime < shiftTime) {
                setDrawerPrompt({
                  isOpen: true,
                  oldCash,
                  newCash,
                  cashDelta,
                  execute: (updateDrawer) => doSave({ ...payloadToSend, update_drawer_if_pre_shift: updateDrawer }),
                });
                return;
              }
            }
          } catch (e) {}
        }
      }

      await doSave(payloadToSend);
    } catch (err) {
      console.error(err);
      invoiceErrors.showError(err);
    }
  };

  // ===== router (Cancel) =====
  const navigate = useNavigate();
  const INDEX_ROUTE = "/purchase-returns";
  const handleCancel = () => navigate(INDEX_ROUTE);

  // Build invoiceOptions once
  const invoiceOptions = purchaseInvoices.map((inv) => ({
    value: inv.id,
    label: inv.posted_number,
  }));

  // ========== Helpers for invoice-based units ==========
  const unitsFromInvoiceItem = (it) => {
    if (it.returnable_quantity != null) return toNum(it.returnable_quantity);
    const uq = toNum(firstDefined(it?.unit_quantity, it?.unit_qty, it?.units, it?.quantity_units, 0));
    const ub = toNum(firstDefined(it?.unit_bonus, it?.bonus_units, it?.free_units, 0));
    return uq + ub; // ✅ units purchased on that invoice line (qty + bonus)
  };

  const unitsOnInvoiceForProduct = (productId) => {
    const seen = new Set();
    return invoiceItemsForProduct(productId).reduce((sum, it) => {
      const key = JSON.stringify([it.batch || '', it.expiry || '']);
      if (it.returnable_quantity != null && seen.has(key)) return sum;
      seen.add(key);
      return sum + unitsFromInvoiceItem(it);
    }, 0);
  };

  const unitsOnInvoiceForProductBatch = (productId, batchNumber) => {
    const m = invoiceItems.find(
      (it) => eqPid(it.product_id, productId) && String(it.batch ?? "") === String(batchNumber ?? "")
    );
    return m ? unitsFromInvoiceItem(m) : 0;
  };

  // Get dark mode state
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
  
  // Get button style classes and styles based on theme button_style
  const getButtonClasses = useMemo(
    () => getThemeButtonClasses(buttonStyle, themeColors, isDark),
    [buttonStyle, themeColors, isDark]
  );

  const btnPrimary = getButtonClasses.primary;
  const btnSecondary = getButtonClasses.secondary;
  const btnDanger = getButtonClasses.danger;
  const btnTertiary = getButtonClasses.tertiary;

  // Helper to get react-select styles based on dark mode
  const getSelectStyles = (isDarkMode = false) => ({
    control: (base) => ({
      ...base,
      minHeight: "28px",
      height: "28px",
      fontSize: "12px",
      borderColor: isDarkMode ? "rgba(71,85,105,0.8)" : "rgba(229,231,235,0.8)",
      backgroundColor: isDarkMode ? "rgba(51,65,85,0.7)" : "rgba(255,255,255,0.7)",
      backdropFilter: "blur(6px)",
      boxShadow: isDarkMode ? "0 1px 2px rgba(0,0,0,0.2)" : "0 1px 2px rgba(15,23,42,0.06)",
      borderRadius: 8,
      color: isDarkMode ? "#f1f5f9" : "#111827",
    }),
    valueContainer: (base) => ({
      ...base,
      height: "28px",
      padding: "0 4px",
    }),
    input: (base) => ({
      ...base,
      margin: 0,
      padding: 0,
      color: isDarkMode ? "#f1f5f9" : "#111827",
    }),
    singleValue: (base) => ({
      ...base,
      color: isDarkMode ? "#f1f5f9" : "#111827",
    }),
    placeholder: (base) => ({
      ...base,
      color: isDarkMode ? "#64748b" : "#9ca3af",
    }),
    menu: (base) => ({
      ...base,
      borderRadius: 8,
      overflow: "hidden",
      backgroundColor: isDarkMode ? "rgba(30,41,59,0.95)" : "rgba(255,255,255,0.95)",
      backdropFilter: "blur(10px)",
      boxShadow: isDarkMode ? "0 10px 30px -10px rgba(0,0,0,0.4)" : "0 10px 30px -10px rgba(30,64,175,0.18)",
      border: isDarkMode ? "1px solid rgba(71,85,105,0.5)" : "none",
    }),
    option: (base, state) => ({
      ...base,
      backgroundColor: isDarkMode
        ? state.isFocused
          ? "rgba(71,85,105,1)"
          : "rgba(51,65,85,1)"
        : state.isFocused
          ? "rgba(241,245,249,1)"
          : "rgba(255,255,255,1)",
      color: isDarkMode ? "#f1f5f9" : "#111827",
      cursor: "pointer",
    }),
    menuPortal: (base) => ({ ...base, zIndex: 9999 }),
  });

  useEffect(() => {
    // Only when editing AND invoice-based
    if (!returnId || !form.purchase_invoice_id || !invoiceItems?.length) return;

    setForm((prev) => {
      const items = prev.items.map((row) => {
        if (!row?.product_id) return row;

        // If a batch is selected, use that batch's units; otherwise sum across the product on invoice
        const u = row.batch
          ? unitsOnInvoiceForProductBatch(row.product_id, row.batch)
          : unitsOnInvoiceForProduct(row.product_id);

        return recalcItem({ ...row, available_units: toNum(u) }, "hydrate_available_units_invoice_edit");
      });
      return recalcFooter({ ...prev, items }, "hydrate_available_units_invoice_edit_footer");
    });
  }, [returnId, form.purchase_invoice_id, invoiceItems]);


// ===== render =====
  return (
    <div className="relative w-full h-full">
      <form className={`purchase-entry purchase-return-form h-auto lg:h-[calc(100dvh-130px)] flex flex-col ${isDark ? "bg-slate-900" : "bg-white"}`} autoComplete="off" autoCapitalize="off" autoCorrect="off" spellCheck={false}>
        <InvoiceErrorSummary errors={invoiceErrors} />
{/* ================= HEADER ================= */}
        <div className="purchase-entry-header sticky top-0 z-20">
          {/* Branded Banner */}
          <div
            className="purchase-entry-banner px-4 py-2.5 flex flex-wrap items-center justify-between gap-3"

          >
            <div className="flex items-center gap-3">
              <div
                className="w-9 h-9 rounded-xl flex items-center justify-center shadow-inner"
                style={{ backgroundColor: "rgba(255,255,255,0.18)", backdropFilter: "blur(4px)" }}
              >
                <ArrowUturnLeftIcon aria-hidden="true" className="w-5 h-5" />
              </div>
              <div>
                <div className="flex items-center gap-2">
                  <h2 className="text-lg font-extrabold tracking-wide text-white leading-none">Purchase Return</h2>
                  <span
                    className="px-2 py-0.5 rounded-md text-[9px] font-bold tracking-widest text-white"
                    style={{ backgroundColor: "rgba(255,255,255,0.22)", backdropFilter: "blur(4px)" }}
                  >
                    UNIT-BASED
                  </span>
                  <span
                    className={`px-2 py-0.5 rounded-md text-[9px] font-bold tracking-widest text-white ${
                      returnId ? "bg-amber-400/90" : "bg-emerald-400/90"
                    }`}
                    style={{ color: "#1e293b" }}
                  >
                    {returnId ? "EDIT" : "CREATE"}
                  </span>
                </div>
                <p className="text-[10px] text-white/80 mt-0.5">
                  Alt+S save · Enter=next · ↑/↓ rows
                </p>
              </div>
            </div>

            <button
              type="button"
              onClick={handleSubmit}
              className={`px-4 py-2 text-[11px] font-bold transition-all duration-200 ${btnPrimary.className}`}
              style={btnPrimary.style}
            >
              {returnId ? "Update (Alt+S)" : "Create (Alt+S)"}
            </button>
          </div>

          {/* Fields Card */}
          <div className="purchase-entry-details px-3 py-2">
            <div className="grid grid-cols-12 gap-2 items-end">
              {/* Posted Number */}
              <div className="col-span-6 sm:col-span-3 lg:col-span-2">
                <label className="block text-[9px] font-medium uppercase tracking-wide text-gray-500 dark:text-gray-400 mb-1">Posted #</label>
                <input
                  name="posted_number"
                  type="text"
                  readOnly
                  value={form.posted_number || ""}
                  placeholder={returnId ? "" : "Auto on Save"}
                  className={`w-full h-8 border border-gray-200 dark:border-slate-600 rounded-md px-2 text-[11px] ${
                    isDark ? "bg-slate-700 text-slate-200 placeholder-slate-500" : "bg-gray-100 text-gray-800"
                  }`}
                />
              </div>

              {/* Date */}
              <div className="col-span-6 sm:col-span-3 lg:col-span-2">
                <label className="block text-[9px] font-medium uppercase tracking-wide text-gray-500 dark:text-gray-400 mb-1">Date</label>
                <input
                  name="date"
                  type="date"
                  value={form.date}
                  onChange={handleChange}
                  className="w-full h-8 border border-gray-200 dark:border-slate-600 rounded-md px-2 text-[11px] bg-white dark:bg-slate-700 text-gray-900 dark:text-slate-200"
                />
              </div>

              {/* Supplier trigger button */}
              <div className="col-span-12 sm:col-span-6 lg:col-span-4">
                <label className="block text-[9px] font-medium uppercase tracking-wide text-gray-500 dark:text-gray-400 mb-1">Supplier *</label>
                <button
                  type="button"
                  onClick={() => setSupplierSearchOpen(true)}
                  className={`w-full h-9 px-3 rounded-lg border text-left text-sm flex items-center gap-2 transition-all ${
                    selectedSupplierObj
                      ? "border-blue-500 bg-blue-50 dark:bg-blue-900/30 text-blue-700 dark:text-blue-200"
                      : "border-gray-300 dark:border-slate-600 bg-white dark:bg-slate-700 text-gray-500 dark:text-gray-400 hover:border-blue-400"
                  }`}
                  title={selectedSupplierObj?.name || "Click to search supplier..."}
                >
                  <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" className="shrink-0">
                    <path d="M3 21h18" />
                    <path d="M5 21V7l7-4 7 4v14" />
                    <path d="M9 9h1M9 13h1M14 9h1M14 13h1M9 17h6" />
                  </svg>
                  {selectedSupplierObj ? (
                    <span className="truncate font-medium">{selectedSupplierObj.name}</span>
                  ) : (
                    <span className="truncate">Click to search supplier...</span>
                  )}
                </button>
              </div>

              {/* Purchase Invoice trigger button */}
              <div className="col-span-12 sm:col-span-6 lg:col-span-4">
                <label className="block text-[9px] font-medium uppercase tracking-wide text-gray-500 dark:text-gray-400 mb-1">Purchase Invoice (optional)</label>
                <button
                  type="button"
                  onClick={() => setInvoiceSearchOpen(true)}
                  className={`w-full h-9 px-3 rounded-lg border text-left text-sm flex items-center gap-2 transition-all ${
                    selectedInvoiceObj
                      ? "border-blue-500 bg-blue-50 dark:bg-blue-900/30 text-blue-700 dark:text-blue-200"
                      : "border-gray-300 dark:border-slate-600 bg-white dark:bg-slate-700 text-gray-500 dark:text-gray-400 hover:border-blue-400"
                  }`}
                  title={selectedInvoiceObj?.posted_number || "Click to search invoice..."}
                >
                  <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" className="shrink-0">
                    <path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z" />
                    <polyline points="14 2 14 8 20 8" />
                  </svg>
                  {selectedInvoiceObj ? (
                    <span className="truncate font-medium">{selectedInvoiceObj.posted_number}</span>
                  ) : (
                    <span className="truncate">Click to search invoice...</span>
                  )}
                </button>
              </div>
            </div>

            {/* Remarks */}
            <div className="mt-2">
              <label className="block text-[9px] font-medium uppercase tracking-wide text-gray-500 dark:text-gray-400 mb-1">Remarks</label>
              <input
                name="remarks"
                type="text"
                value={form.remarks}
                onChange={handleChange}
                className="w-full h-8 border border-gray-200 dark:border-slate-600 rounded-md px-2 text-[11px] bg-white dark:bg-slate-700 text-gray-900 dark:text-slate-200"
              />
            </div>
          </div>
        </div>

        {/* ================= ITEMS ================= */}
        <div className="purchase-entry-items flex-1 min-h-0 overflow-auto p-1">
          <h2 className="text-xs font-bold mb-1 text-gray-900 dark:text-gray-100">Items (↑↓ arrows to navigate rows)</h2>

          <table className="invoice-repeater-table w-full lg:table-fixed border-collapse text-[11px]">
            <colgroup>
              <col className="w-6" />
              <col className="w-auto min-w-[230px]" />
              <col className="w-11" />
              <col className="w-[74px]" />
              <col className="w-[74px]" />
              <col className="w-16" />
              <col className="w-12" />
              <col className="w-12" />
              <col className="w-14" />
              <col className="w-14" />
              <col className="w-12" />
              <col className="w-18" />
              <col className="w-6" />
            </colgroup>
            <thead className="sticky top-0 bg-gray-100 dark:bg-slate-700 z-5">
              <tr>
                <th rowSpan={2} className="border w-6 bg-gray-200 dark:bg-slate-600 text-gray-900 dark:text-gray-100">#</th>
                <th rowSpan={2} colSpan={1} className="border w-[30%] min-w-[230px] bg-gray-200 dark:bg-slate-600 text-gray-900 dark:text-gray-100">Product</th>
                <th colSpan={4} className="border bg-gray-200 dark:bg-slate-600 text-gray-900 dark:text-gray-100">Pack Size / Batch / Expiry / Available Qty</th>
                <th colSpan={2} className="border bg-gray-200 dark:bg-slate-600 text-gray-900 dark:text-gray-100">Return Qty (Pack / Unit)</th>
                <th colSpan={2} className="border bg-gray-200 dark:bg-slate-600 text-gray-900 dark:text-gray-100">Purchase Price (P / U)</th>
                <th colSpan={1} className="border bg-gray-200 dark:bg-slate-600 text-gray-900 dark:text-gray-100">Disc %</th>
                <th rowSpan={2} className="border w-18 bg-gray-200 dark:bg-slate-600 text-gray-900 dark:text-gray-100">Sub Total</th>
                <th rowSpan={2} className="border w-6 bg-gray-200 dark:bg-slate-600 text-gray-900 dark:text-gray-100">+</th>
              </tr>
              <tr>
                <th className="border w-11 bg-gray-100 dark:bg-slate-600 text-gray-900 dark:text-gray-100">PSize</th>
                <th className="border w-[74px] bg-gray-100 dark:bg-slate-600 text-gray-900 dark:text-gray-100">Batch</th>
                <th className="border w-[74px] bg-gray-100 dark:bg-slate-600 text-gray-900 dark:text-gray-100">Exp</th>
                <th className="border w-16 bg-gray-100 dark:bg-slate-600 text-gray-900 dark:text-gray-100">{form.purchase_invoice_id ? "Returnable Qty" : "Avail.Q (Units)"}</th>
                <th className="border w-12 bg-gray-100 dark:bg-slate-600 text-gray-900 dark:text-gray-100">Pack.Q</th>
                <th className="border w-12 bg-gray-100 dark:bg-slate-600 text-gray-900 dark:text-gray-100">Unit.Q</th>
                <th className="border w-14 bg-gray-100 dark:bg-slate-600 text-gray-900 dark:text-gray-100">Pack.P</th>
                <th className="border w-14 bg-gray-100 dark:bg-slate-600 text-gray-900 dark:text-gray-100">Unit.P</th>
                <th className="border w-12 bg-gray-100 dark:bg-slate-600 text-gray-900 dark:text-gray-100">Disc%</th>
              </tr>
            </thead>

            <tbody>
              {form.items.map((item, i) => (
                <tr key={item.id} id={invoiceErrors.rowId(i)} aria-invalid={invoiceErrors.rowMessages(i).length > 0 || undefined} className={`invoice-repeater-row text-center odd:bg-white even:bg-gray-50 dark:odd:bg-slate-700/30 dark:even:bg-slate-700/50 ${invoiceErrors.rowMessages(i).length ? "invoice-row-invalid" : ""}`}>
                  {/* Remove */}
                  <td className="invoice-cell-index-actions border">
                    <div className="flex items-center justify-between lg:justify-center gap-1.5">
                      <span className="lg:hidden text-[11px] font-bold uppercase tracking-wider text-slate-500 dark:text-slate-400">Item #{i + 1}</span>
                      <button
                        type="button"
                        onClick={() => removeItem(i)} aria-label="Remove item" title="Remove item"
                        className="products-row-action products-row-delete"
                      >
                        <TrashIcon aria-hidden="true" />
                      </button>
                    </div>
                  </td>

                  {/* Product Search */}
                  <td colSpan={1} data-label="Product *" className="invoice-cell-product border text-left w-[28%] min-w-[220px]">
                    <div
                      ref={(el) => (productSearchRefs.current[i] = el)}
                      onFocusCapture={() => { if (!form.purchase_invoice_id) refreshProducts(""); }}
                      className={rowErrors[i]?.product ? "ring-2 ring-red-500 rounded-sm" : ""}
                    >
                      <ProductSearchInput
                        value={item.product_id}
                        onChange={(val) => handleProductSelect(i, val)}
                        onKeyDown={(e) => handleProductKeyDown(e, i)}
                        products={products}
                        onRefreshProducts={refreshProducts}
                      />
                    </div>
                  </td>

                  {/* Pack Size */}
                  <td data-label="Pack Size" className="border w-11">
                    <input
                      type="number"
                      readOnly
                      value={item.pack_size || ""}
                      className="border bg-gray-100 dark:bg-slate-600 w-full h-6 text-[11px] px-1 appearance-none [&::-webkit-outer-spin-button]:appearance-none [&::-webkit-inner-spin-button]:appearance-none text-gray-900 dark:text-gray-100"
                    />
                  </td>

                  {/* Batch */}
                  <td data-label="Batch" className="border w-[74px]">
                    <div className={rowErrors[i]?.batch ? "ring-2 ring-red-500 rounded-sm" : ""}>
                      <BatchSearchInput
                        ref={(el) => {
                          if (el && currentField === "batch" && currentRowIndex === i) {
                            setTimeout(() => el.focus(), 50);
                          }
                        }}
                        mode="purchase"
                        value={
                          item.batch
                            ? item.batch
                            : item.is_unbatched
                            ? "[Unassigned Stock]"
                            : ""
                        }
                        batches={rowBatches[i] || []}
                        usedBatches={form.items
                          .filter((it, idx) => idx !== i && eqPid(it.product_id, item.product_id))
                          .map((it) => (it.batch ? String(it.batch).trim() : (it.is_unbatched ? "__unbatched__" : "")))
                          .filter(Boolean)}
                        onChange={(val, batchObj) => handleBatchSelect(i, val, batchObj)}
                        onKeyDown={(e) => {
                          if (e.key === "Enter" && (item.batch || item.is_unbatched)) {
                            e.preventDefault();
                            focusOnField("pack_quantity", i);
                          }
                        }}
                      />
                    </div>
                  </td>

                  {/* Expiry */}
                  <td data-label="Expiry" className="border w-[74px]">
                    <input
                      type="text"
                      readOnly
                      size={1}
                      title={item.expiry ? String(item.expiry).trim().slice(0, 10) : undefined}
                      value={item.expiry ? String(item.expiry).trim().slice(0, 10).replace(/^(\d{4})-(\d{2})(?:-\d{2})?$/, "$2/$1") : ""}
                      className="border bg-gray-100 dark:bg-slate-600 w-full min-w-0 h-6 text-[10.5px] px-0.5 text-center font-mono text-gray-900 dark:text-gray-100"
                    />
                  </td>

                  {/* Available Units */}
                  <td data-label={form.purchase_invoice_id ? "Returnable" : "Available (Units)"} className="border w-16">
                    <input
                      type="number"
                      readOnly
                      value={item.available_units || 0}
                      className="border bg-gray-100 dark:bg-slate-600 w-full h-6 text-[11px] px-1 text-gray-900 dark:text-gray-100"
                    />
                  </td>

                  {/* Return Pack Qty */}
                  <td data-label="Return Pack Qty" className="border">
                    <input
                      ref={(el) => (packQuantityRefs.current[i] = el)}
                      type="text"
                      value={item.return_pack_quantity === 0 ? "" : item.return_pack_quantity}
                      onChange={(e) => handleItemChange(i, "return_pack_quantity", e.target.value)}
                      onKeyDown={(e) => handleKeyDown(e, "pack_quantity", i)}
                      className="border w-full h-6 text-[11px] px-1 appearance-none [&::-webkit-outer-spin-button]:appearance-none [&::-webkit-inner-spin-button]:appearance-none bg-white dark:bg-slate-700 text-gray-900 dark:text-gray-100"
                    />
                  </td>

                  {/* Return Unit Qty */}
                  <td data-label="Return Unit Qty" className="border">
                    <input
                      type="text"
                      value={item.return_unit_quantity === 0 ? "" : item.return_unit_quantity}
                      onChange={(e) => handleItemChange(i, "return_unit_quantity", e.target.value)}
                      className="border w-full h-6 text-[11px] px-1 appearance-none [&::-webkit-outer-spin-button]:appearance-none [&::-webkit-inner-spin-button]:appearance-none bg-white dark:bg-slate-700 text-gray-900 dark:text-gray-100"
                    />
                  </td>

                  {/* Pack Purchase Price */}
                  <td data-label="Pack Cost" className="border">
                    <input
                      ref={(el) => (packPurchasePriceRefs.current[i] = el)}
                      type="text"
                      value={item.pack_purchase_price === 0 ? "" : item.pack_purchase_price}
                      onChange={(e) => handleItemChange(i, "pack_purchase_price", e.target.value)}
                      onKeyDown={(e) => handleKeyDown(e, "pack_purchase_price", i)}
                      className="border w-full h-6 text-[11px] px-1 appearance-none [&::-webkit-outer-spin-button]:appearance-none [&::-webkit-inner-spin-button]:appearance-none bg-white dark:bg-slate-700 text-gray-900 dark:text-gray-100"
                    />
                  </td>

                  {/* Unit Purchase Price */}
                  <td data-label="Unit Cost" className="border">
                    <input
                      type="text"
                      value={item.unit_purchase_price === 0 ? "" : item.unit_purchase_price}
                      onChange={(e) => handleItemChange(i, "unit_purchase_price", e.target.value)}
                      className="border w-full h-6 text-[11px] px-1 appearance-none [&::-webkit-outer-spin-button]:appearance-none [&::-webkit-inner-spin-button]:appearance-none bg-white dark:bg-slate-700 text-gray-900 dark:text-gray-100"
                    />
                  </td>

                  {/* Item Discount Percentage */}
                  <td data-label="Disc %" className="border">
                    <input
                      ref={(el) => (itemDiscountRefs.current[i] = el)}
                      type="text"
                      value={item.item_discount_percentage === 0 ? "" : item.item_discount_percentage}
                      onChange={(e) => handleItemChange(i, "item_discount_percentage", e.target.value)}
                      onKeyDown={(e) => handleKeyDown(e, "item_discount", i)}
                      className="border w-full h-6 text-[11px] px-1 appearance-none [&::-webkit-outer-spin-button]:appearance-none [&::-webkit-inner-spin-button]:appearance-none bg-white dark:bg-slate-700 text-gray-900 dark:text-gray-100"
                    />
                  </td>

                  {/* Sub Total */}
                  <td data-label="Sub Total" className="invoice-cell-subtotal border">
                    <input
                      type="number"
                      readOnly
                      value={(Number(item.sub_total) || 0).toFixed(2)}
                      className="border bg-gray-100 dark:bg-slate-600 w-full h-6 text-[11px] px-1 appearance-none [&::-webkit-outer-spin-button]:appearance-none [&::-webkit-inner-spin-button]:appearance-none text-gray-900 dark:text-gray-100"
                    />
                  </td>

                  {/* Add */}
                  <td className="invoice-cell-add border">
                    <button
                      type="button"
                      onClick={addItem} aria-label="Add item" title="Add item"
                      className="products-row-action products-row-add"
                    >
                      <PlusIcon aria-hidden="true" />
                    </button>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>

{/* ================= FOOTER ================= */}
        <div className={`purchase-entry-footer lg:sticky lg:bottom-0 p-2 z-10 ${isDark ? "bg-slate-800 border-t border-slate-700" : "bg-white border-t border-gray-200"}`}>
          <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-6 gap-2 text-xs">
            <div className={`p-1.5 rounded-lg border ${isDark ? "border-slate-700 bg-slate-700/40" : "border-gray-200 bg-gray-50"}`}>
              <label className={`block text-[10px] ${isDark ? "text-slate-400" : "text-gray-600"}`}>Gross Total</label>
              <input
                type="number"
                readOnly
                value={(Number(form.gross_total) || 0).toFixed(2)}
                className={`mt-1 border rounded-md w-full px-2 h-7 text-xs font-medium ${
                  isDark ? "border-slate-600 bg-slate-700 text-slate-300" : "border-gray-300 bg-gray-100 text-gray-700"
                }`}
              />
            </div>

            <div className={`p-1.5 rounded-lg border ${isDark ? "border-slate-700 bg-slate-700/40" : "border-gray-200 bg-gray-50"}`}>
              <label className={`block text-[10px] ${isDark ? "text-slate-400" : "text-gray-600"}`}>Discount %</label>
              <input
                name="discount_percentage"
                type="number"
                value={form.discount_percentage}
                onChange={handleChange}
                className={`mt-1 border rounded-md w-full px-2 h-7 text-xs ${
                  isDark ? "border-slate-600 bg-slate-700 text-slate-200" : "border-gray-300 text-gray-800"
                }`}
              />
            </div>

            <div className={`p-1.5 rounded-lg border ${isDark ? "border-slate-700 bg-slate-700/40" : "border-gray-200 bg-gray-50"}`}>
              <label className={`block text-[10px] ${isDark ? "text-slate-400" : "text-gray-600"}`}>Discount Amount</label>
              <input
                type="number"
                readOnly
                value={(Number(form.discount_amount) || 0).toFixed(2)}
                className={`mt-1 border rounded-md w-full px-2 h-7 text-xs ${
                  isDark ? "border-slate-600 bg-slate-700 text-slate-300" : "border-gray-300 bg-gray-100 text-gray-700"
                }`}
              />
            </div>

            <div className={`p-1.5 rounded-lg border ${isDark ? "border-slate-700 bg-slate-700/40" : "border-gray-200 bg-gray-50"}`}>
              <label className={`block text-[10px] ${isDark ? "text-slate-400" : "text-gray-600"}`}>Tax %</label>
              <input
                name="tax_percentage"
                type="number"
                value={form.tax_percentage}
                onChange={handleChange}
                className={`mt-1 border rounded-md w-full px-2 h-7 text-xs ${
                  isDark ? "border-slate-600 bg-slate-700 text-slate-200" : "border-gray-300 text-gray-800"
                }`}
              />
            </div>

            <div className={`p-1.5 rounded-lg border ${isDark ? "border-slate-700 bg-slate-700/40" : "border-gray-200 bg-gray-50"}`}>
              <label className={`block text-[10px] ${isDark ? "text-slate-400" : "text-gray-600"}`}>Tax Amount</label>
              <input
                type="number"
                readOnly
                value={(Number(form.tax_amount) || 0).toFixed(2)}
                className={`mt-1 border rounded-md w-full px-2 h-7 text-xs ${
                  isDark ? "border-slate-600 bg-slate-700 text-slate-300" : "border-gray-300 bg-gray-100 text-gray-700"
                }`}
              />
            </div>

            <div className={`p-1.5 rounded-lg border ${isDark ? "border-slate-700 bg-slate-700/40" : "border-gray-200 bg-gray-50"}`}>
              <label className={`block text-[10px] ${isDark ? "text-slate-400" : "text-gray-600"}`}>Total</label>
              <input
                type="number"
                readOnly
                value={(Number(form.total) || 0).toFixed(2)}
                className={`mt-1 border rounded-md w-full px-2 h-7 text-xs font-bold ${
                  isDark ? "border-slate-600 bg-slate-700 text-rose-400" : "border-gray-300 bg-gray-100 text-red-600"
                }`}
              />
            </div>
          </div>

          <div className="mt-2 flex flex-wrap items-center justify-between gap-2">
            {/* Settlement Outcome Selector */}
            <div className={`flex flex-wrap items-center gap-2 px-3 py-1.5 rounded-lg border text-xs ${isDark ? "border-slate-700 bg-slate-700/40" : "border-gray-200 bg-gray-50"}`}>
              <span className={`text-[10px] font-bold uppercase tracking-wider ${isDark ? "text-slate-300" : "text-gray-700"}`}>
                Settlement Outcome:
              </span>
              <button
                type="button"
                onClick={() => setForm((prev) => ({ ...prev, settlement_mode: "credit_note" }))}
                className={`px-2.5 py-1 rounded-md border text-[11px] font-semibold transition-all ${
                  form.settlement_mode === "credit_note" || form.settlement_mode === "invoice_offset"
                    ? "border-indigo-500 bg-indigo-50 dark:bg-indigo-900/40 text-indigo-700 dark:text-indigo-200"
                    : isDark
                      ? "border-slate-600 bg-slate-700 text-slate-300"
                      : "border-gray-300 bg-white text-gray-700"
                }`}
              >
                Adjust Supplier Ledger (Debit Note)
              </button>
              <button
                type="button"
                onClick={() => setForm((prev) => ({ ...prev, settlement_mode: "cash_refund" }))}
                className={`px-2.5 py-1 rounded-md border text-[11px] font-semibold transition-all ${
                  form.settlement_mode === "cash_refund"
                    ? "border-emerald-500 bg-emerald-50 dark:bg-emerald-900/40 text-emerald-700 dark:text-emerald-200"
                    : isDark
                      ? "border-slate-600 bg-slate-700 text-slate-300"
                      : "border-gray-300 bg-white text-gray-700"
                }`}
              >
                Instant Refund (Cash / Bank / Wallet)
              </button>

              {form.settlement_mode === "cash_refund" && (
                <>
                  <select
                    value={form.payment_method || "cash"}
                    onChange={(e) => setForm((prev) => ({ ...prev, payment_method: e.target.value, account_id: "" }))}
                    className={`h-7 rounded border px-2 text-[11px] ${
                      isDark ? "border-slate-600 bg-slate-700 text-slate-200" : "border-gray-300 bg-white text-gray-800"
                    }`}
                  >
                    <option value="cash">Cash (Drawer)</option>
                    <option value="bank_transfer">Bank Transfer</option>
                    <option value="card">Card / POS</option>
                    <option value="mobile_wallet">Mobile Wallet</option>
                  </select>
                  <select
                    value={form.account_id || ""}
                    onChange={(e) => setForm((prev) => ({ ...prev, account_id: e.target.value }))}
                    className={`h-7 rounded border px-2 text-[11px] ${
                      isDark ? "border-slate-600 bg-slate-700 text-slate-200" : "border-gray-300 bg-white text-gray-800"
                    }`}
                  >
                    <option value="">Auto ({form.payment_method || "cash"})</option>
                    {accounts.map((acc) => (
                      <option key={acc.id} value={acc.id}>
                        {acc.name}
                      </option>
                    ))}
                  </select>
                </>
              )}
            </div>

            <div className="flex justify-end gap-2">
              <button
                type="button"
                onClick={handleCancel}
                className={`px-6 py-3 text-sm font-medium transition-all duration-200 ${btnTertiary.className}`}
                style={btnTertiary.style}
              >
                Cancel
              </button>
              <button
                type="button"
                onClick={handleSubmit}
                className={`px-8 py-3 text-sm font-semibold transition-all duration-200 ${btnPrimary.className}`}
                style={btnPrimary.style}
              >
                {form.returnId || returnId ? "Update Return" : "Create Return"}
              </button>
            </div>
          </div>
        </div>

        {/* Supplier Search Modal */}
        <SupplierSearch
          isOpen={supplierSearchOpen}
          onClose={() => setSupplierSearchOpen(false)}
          onSelect={(supplier) => {
            handleSelectChange("supplier_id", { value: supplier?.id });
          }}
        />

{/* Purchase Invoice Search Modal */}
        <PurchaseInvoiceSearch
          isOpen={invoiceSearchOpen}
          onClose={() => setInvoiceSearchOpen(false)}
          supplierId={form.supplier_id || selectedSupplierObj?.id || undefined}
          onSelect={(invoice) => {
            handleSelectChange("purchase_invoice_id", { value: invoice?.id });
          }}
        />

        {/* Pre-Shift Edit Cash Drawer Prompt */}
        <PreShiftDrawerPromptModal
          isOpen={!!drawerPrompt?.isOpen}
          onClose={() => setDrawerPrompt(null)}
          onConfirm={(updateDrawer) => {
            const fn = drawerPrompt?.execute;
            setDrawerPrompt(null);
            if (fn) fn(updateDrawer);
          }}
          oldCash={drawerPrompt?.oldCash}
          newCash={drawerPrompt?.newCash}
          cashDelta={drawerPrompt?.cashDelta}
        />
      </form>
    </div>
  );
}
