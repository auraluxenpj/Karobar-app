import { useInvoiceErrors, InvoiceErrorSummary, InvoiceRowError } from "../../components/InvoiceErrors";
import { useState, useEffect, useRef, useMemo } from "react";
import { useNavigate } from "react-router-dom";
import axios from "axios";
import { TrashIcon, PlusIcon, ArrowUturnLeftIcon } from "@heroicons/react/24/outline";
import toast from "react-hot-toast";

import ProductSearchInput from "../../components/ProductSearchInput.jsx";
import BatchSearchInput from "../../components/BatchSearchInput.jsx";
import CustomerSearch from "../../components/CustomerSearch.jsx";
import SaleInvoiceSearch from "../../components/SaleInvoiceSearch.jsx";
import PreShiftDrawerPromptModal from "@/components/PreShiftDrawerPromptModal.jsx";
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

// ===== helpers =====
const toNum = (v) => (v === undefined || v === null || v === "" ? 0 : Number(v));
const round2 = (n) => (Number.isFinite(Number(n)) ? Number(Number(n).toFixed(2)) : 0);
const eqId = (a, b) => String(a ?? "") === String(b ?? "");

// try multiple possible keys for unit price
const extractUnitPrice = (obj) => {
  if (!obj) return 0;
  const candidates = [
    obj.unit_sale_price,
    obj.unit_price,
    obj.sale_price,
    obj.unit_selling_price,
    obj.price,
    obj.unitRate,
  ];
  const packPrice = obj.pack_sale_price ?? obj.pack_price;
  const packSize = obj.pack_size ?? obj.size ?? obj.units_per_pack;
  if ((packPrice ?? null) !== null && toNum(packPrice) > 0 && toNum(packSize) > 0) {
    candidates.push(toNum(packPrice) / toNum(packSize));
  }
  for (const c of candidates) {
    const n = toNum(c);
    if (n > 0) return n;
  }
  return 0;
};

const extractItemDiscPct = (obj) => {
  if (!obj) return 0;
  const candidates = [
    obj.item_discount_percentage,
    obj.discount_percentage,
    obj.line_discount_percentage,
    obj.item_discount,
    obj.discount,
  ];
  for (const c of candidates) {
    const n = toNum(c);
    if (n > 0) return n;
  }
  return 0;
};

const extractUnitSaleQty = (obj) => {
  if (!obj) return 0;
  const candidates = [obj.returnable_quantity, obj.unit_sale_quantity, obj.unit_quantity, obj.quantity, obj.units];
  for (const c of candidates) {
    const n = toNum(c);
    if (n > 0) return n;
  }
  return 0;
};

const extractBatchQty = (b) =>
  toNum(
    b?.available_quantity ?? b?.quantity_available ?? b?.available_units ?? b?.on_hand ?? b?.stock ?? b?.balance ?? b?.qty ?? b?.quantity
  );

// subtotal = qty * unit_price - (line discount %)
function recalcItem(item) {
  const qty = toNum(item.unit_return_quantity);
  const price = toNum(item.unit_sale_price);
  const discPct = toNum(item.item_discount_percentage);
  const gross = qty * price;
  const discAmt = (gross * discPct) / 100;
  return { ...item, sub_total: round2(gross - discAmt) };
}

/**
 * Recalculate footer totals.
 * `source` controls which side is authoritative for discount/tax ("pct" or "amt").
 */
function recalcFooter(form, source = {}) {
  const items = Array.isArray(form.items) ? form.items : [];
  const gross = items.reduce((s, it) => s + toNum(it.sub_total), 0);

  let discPct = toNum(form.discount_percentage);
  let discAmt = toNum(form.discount_amount);

  if (source.disc === "pct") {
    discAmt = (gross * discPct) / 100;
  } else if (source.disc === "amt") {
    discPct = gross > 0 ? (discAmt / gross) * 100 : 0;
  } else {
    if (discPct !== 0) discAmt = (gross * discPct) / 100;
    else discPct = gross > 0 ? (discAmt / gross) * 100 : 0;
  }

  const taxable = gross - discAmt;

  let taxPct = toNum(form.tax_percentage);
  let taxAmt = toNum(form.tax_amount);

  if (source.tax === "pct") {
    taxAmt = (taxable * taxPct) / 100;
  } else if (source.tax === "amt") {
    taxPct = taxable > 0 ? (taxAmt / taxable) * 100 : 0;
  } else {
    if (taxPct !== 0) taxAmt = (taxable * taxPct) / 100;
    else taxPct = taxable > 0 ? (taxAmt / taxable) * 100 : 0;
  }

  return {
    ...form,
    gross_total: round2(gross),
    discount_percentage: round2(discPct),
    discount_amount: round2(discAmt),
    tax_percentage: round2(taxPct),
    tax_amount: round2(taxAmt),
    total: round2(taxable + taxAmt),
  };
}

export default function SaleReturnForm({ returnId, initialData, onSuccess }) {
  const defaultItem = {
    id: Date.now() + Math.random(),
    product_id: "",
    batch_number: "",
    expiry: "",
    is_unbatched: false,
    unit_sale_quantity: 0, // READONLY, from invoice; available qty in open return
    unit_sale_price: 0, // READONLY, from invoice OR product
    unit_return_quantity: 0,
    item_discount_percentage: 0,
    sub_total: 0,
  };

  const [form, setForm] = useState({
    posted_number: "",
    date: new Date().toISOString().slice(0, 10),
    customer_id: "",
    sale_invoice_id: "", // optional
    settlement_mode: "cash_refund",
    payment_method: "cash",
    account_id: "",
    items: [{ ...defaultItem }],
    discount_percentage: 0,
    discount_amount: 0,
    tax_percentage: 0,
    tax_amount: 0,
    gross_total: 0,
    total: 0,
  });
  const [accounts, setAccounts] = useState([]);
  const [drawerPrompt, setDrawerPrompt] = useState(null);
  const originalReturnMetaRef = useRef(null);
  const invoiceErrors = useInvoiceErrors(form.items);

  const [customers, setCustomers] = useState([]);
  const refreshProducts = async (q = "") => {
    // If a sale invoice is selected, keep products limited to invoice items
    if (form.sale_invoice_id) return;
    try {
      const { data } = await axios.get("/api/products/search", { params: { q, limit: 30 } });
      setProducts(Array.isArray(data?.data) ? data.data : Array.isArray(data) ? data : []);
    } catch (e) {}
  };

  const [catalogProducts, setCatalogProducts] = useState([]);
  const [products, setProducts] = useState([]);
const [saleInvoices, setSaleInvoices] = useState([]);
  const [invoiceItems, setInvoiceItems] = useState([]);
  const [rowBatches, setRowBatches] = useState([]);
  const [selectedInvoiceObj, setSelectedInvoiceObj] = useState(null);

  const [invoiceMenuOpen, setInvoiceMenuOpen] = useState(false);
  const [customerSearchOpen, setCustomerSearchOpen] = useState(false);
  const [invoiceSearchOpen, setInvoiceSearchOpen] = useState(false);

  const customerSelectRef = useRef(null);
  const saleInvoiceRef = useRef(null);
  const productRefs = useRef([]);
  const batchRefs = useRef([]);
  const qtyRefs = useRef([]);
  const discRefs = useRef([]);

  const productBatchCache = useRef(new Map()); // productId -> [{batch_number, expiry}]

  // Get dark mode state
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
      };
    }
    return {
      primary: theme.primary_color || '#3b82f6',
      primaryHover: theme.primary_hover || '#2563eb',
      primaryLight: theme.primary_light || '#dbeafe',
      secondary: theme.secondary_color || '#8b5cf6',
      secondaryHover: theme.secondary_hover || '#7c3aed',
      secondaryLight: theme.secondary_light || '#ede9fe',
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
  const btnGlass = getButtonClasses.glass;

  useEffect(() => {
    productRefs.current = productRefs.current.slice(0, form.items.length);
    batchRefs.current = batchRefs.current.slice(0, form.items.length);
    qtyRefs.current = qtyRefs.current.slice(0, form.items.length);
    discRefs.current = discRefs.current.slice(0, form.items.length);
    setRowBatches((prev) => {
      const next = prev.slice(0, form.items.length);
      while (next.length < form.items.length) next.push([]);
      return next;
    });
  }, [form.items.length]);

  // Init loads
  useEffect(() => {
    (async () => {
      try {
        const [custRes, prodRes, accRes] = await Promise.all([
          axios.get("/api/customers/search", { params: { limit: 50 } }),
          axios.get("/api/products/search", { params: { q: "", limit: 30 } }),
          axios.get("/api/accounts", { params: { active_only: 1 } }).catch(() => ({ data: [] })),
        ]);
        const customersArr = Array.isArray(custRes.data) ? custRes.data : custRes.data?.data || [];
        setCustomers(customersArr);
        const accountsArr = Array.isArray(accRes?.data?.data) ? accRes.data.data : Array.isArray(accRes?.data) ? accRes.data : [];
        setAccounts(accountsArr);

        const catalog = Array.isArray(prodRes?.data?.data) ? prodRes.data.data : Array.isArray(prodRes?.data) ? prodRes.data : [];
        setCatalogProducts(catalog);
        setProducts(catalog);


        if (!returnId && customersArr.length) {
          // Select customer with lowest ID (not highest) only for new return
          const sortedCustomers = [...customersArr].sort((a, b) => a.id - b.id);
          const firstId = sortedCustomers[0]?.id;
          setForm((prev) => (prev.customer_id ? prev : { ...prev, customer_id: firstId }));
          if (firstId) await fetchSaleInvoices(firstId);
        }

        if (!returnId) setTimeout(() => saleInvoiceRef.current?.focus?.(), 50);
      } catch (e) {
        console.error(e);
      }
    })();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // If editing, normalize incoming data to unit-based fields
  useEffect(() => {
    if (!returnId) return;
    (async () => {
      try {
        const res = await axios.get(`/api/sale-returns/${returnId}`);
        const data = res.data || {};
        const items = Array.isArray(data.items) ? data.items : [];

        // Fetch products for any product_ids that might not be in the catalog
        const productIds = [...new Set(items.map((it) => it.product_id).filter(Boolean))];
        if (productIds.length > 0) {
          try {
            const prodRes = await axios.get("/api/products/search", {
              params: { ids: productIds.join(",") },
            });
            const fetchedProducts = Array.isArray(prodRes?.data?.data)
              ? prodRes.data.data
              : Array.isArray(prodRes?.data)
                ? prodRes.data
                : [];
            if (fetchedProducts.length > 0) {
              setProducts((prev) => {
                const seen = new Set(prev.map((p) => String(p.id)));
                const newProds = fetchedProducts.filter((p) => !seen.has(String(p.id)));
                return [...newProds, ...prev];
              });
              setCatalogProducts((prev) => {
                const seen = new Set(prev.map((p) => String(p.id)));
                const newProds = fetchedProducts.filter((p) => !seen.has(String(p.id)));
                return [...newProds, ...prev];
              });
            }
          } catch (e) {
            console.error("Failed to fetch products for edit:", e);
          }
        }

        const normalized = {
          posted_number: data.posted_number || "",
          date: data.date || new Date().toISOString().slice(0, 10),
          customer_id: data.customer_id || "",
          sale_invoice_id: data.sale_invoice_id || "",
          settlement_mode:
            data.settlement_mode ||
            (data.sale_invoice?.invoice_type === "credit" ? "credit_note" : "cash_refund"),
          payment_method: data.payment_method || "cash",
          account_id: data.account_id || "",
          items: items.length
            ? items.map((it) => {
                const b = it.batch_number || it.batch || "";
                const isUnb = Boolean(it.is_unbatched || (!b && String(b).trim() === ""));
                return {
                  ...defaultItem,
                  product_id: it.product_id,
                  batch_number: isUnb ? "" : b,
                  expiry: isUnb ? "" : (it.expiry || ""),
                  is_unbatched: isUnb,
                  unit_sale_quantity: toNum(it.unit_sale_quantity),
                  unit_sale_price: toNum(it.unit_sale_price),
                  unit_return_quantity: toNum(it.unit_return_quantity),
                  item_discount_percentage: toNum(it.item_discount_percentage),
                  sub_total: toNum(it.sub_total),
                  id: Date.now() + Math.random(),
                };
              })
            : [{ ...defaultItem }],
          discount_percentage: toNum(data.discount_percentage),
          discount_amount: toNum(data.discount_amount),
          tax_percentage: toNum(data.tax_percentage),
          tax_amount: toNum(data.tax_amount),
          gross_total: toNum(data.gross_total),
          total: toNum(data.total),
        };

        originalReturnMetaRef.current = {
          created_at: data.created_at,
          date: data.date,
          total: toNum(data.total),
          settlement_mode:
            data.settlement_mode ||
            (data.sale_invoice?.invoice_type === "credit" ? "credit_note" : "cash_refund"),
          payment_method: data.payment_method || "cash",
        };

        setForm((prev) => recalcFooter({ ...prev, ...normalized }));

        if (normalized.customer_id) await fetchSaleInvoices(normalized.customer_id);
        let currentInvItems = [];
        if (normalized.sale_invoice_id) {
          currentInvItems = await loadInvoice(normalized.sale_invoice_id);
        }

        // Populate rowBatches for edit mode
        const batchesList = await Promise.all(
          normalized.items.map(async (it) => {
            if (!it.product_id) return [];
            if (normalized.sale_invoice_id && Array.isArray(currentInvItems) && currentInvItems.length) {
              const itemsForProduct = currentInvItems.filter((x) => eqId(x.product_id, it.product_id));
              return buildBatchOptionsForInvoice(itemsForProduct);
            }
            return fetchBatchesForOpenReturn(it.product_id);
          })
        );
        setRowBatches(batchesList);
      } catch (e) {
        console.error(e);
      }
    })();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [returnId]);

  // Alt+S quick save
  useEffect(() => {
    const onKey = (e) => {
      if (e.altKey && (e.key === "s" || e.key === "S")) {
        e.preventDefault();
        handleSubmit();
      }
    };
    document.addEventListener("keydown", onKey);
    return () => document.removeEventListener("keydown", onKey);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [form]);

  const fetchSaleInvoices = async (customerId) => {
    if (!customerId) {
      setSaleInvoices([]);
      return;
    }
    try {
      const res = await axios.get(`/api/sale-invoices?customer_id=${customerId}`);
      setSaleInvoices(Array.isArray(res.data) ? res.data : []);
    } catch (e) {
      setSaleInvoices([]);
    }
  };

  const buildBatchOptionsForInvoice = (itemsForProduct) => {
    const seen = new Set();
    const opts = [];
    for (const it of itemsForProduct) {
      const b = (it.batch_number ?? it.batch ?? "").toString().trim();
      const isUnbatched = Boolean(it.is_unbatched || (!b && String(b).trim() === ""));
      if (isUnbatched) {
        if (!seen.has("__unbatched__")) {
          seen.add("__unbatched__");
          opts.push({
            batch_number: "",
            expiry: "",
            unit_sale_quantity: extractUnitSaleQty(it),
            available_units: extractUnitSaleQty(it),
            unit_sale_price: extractUnitPrice(it),
            item_discount_percentage: extractItemDiscPct(it),
            is_unbatched: true,
            label: `[Unbatched Stock] (${extractUnitSaleQty(it)} units)`,
          });
        }
      } else if (b && !seen.has(b)) {
        seen.add(b);
        opts.push({
          batch_number: b,
          expiry: it.expiry || "",
          unit_sale_quantity: extractUnitSaleQty(it),
          available_units: extractUnitSaleQty(it),
          unit_sale_price: extractUnitPrice(it),
          item_discount_percentage: extractItemDiscPct(it),
          is_unbatched: false,
        });
      }
    }
    return opts;
  };

  const loadInvoice = async (invoiceId) => {
    try {
      const res = await axios.get(`/api/sale-invoices/${invoiceId}`, { params: { exclude_return_id: returnId || undefined } });
      const data = res.data || {};
      setSelectedInvoiceObj(data);
      if (data.customer_id) {
        setForm((prev) => ({ ...prev, customer_id: data.customer_id, sale_invoice_id: invoiceId }));
        fetchSaleInvoices(data.customer_id);
      }
      const items = Array.isArray(data?.items) ? data.items : [];
      setInvoiceItems(items);

      // Reduce product list to only invoice items, merging with full catalog product object.
      const byId = new Map();
      for (const it of items) {
        const pid = Number(it?.product_id || it?.product?.id || it?.id);
        if (!pid) continue;
        const name = it?.product?.name || it?.product_name || it?.name || `#${pid}`;
        const unit_sale_price = extractUnitPrice(it);
        const item_discount_percentage = extractItemDiscPct(it);
        const unit_sale_quantity = extractUnitSaleQty(it);
        byId.set(pid, { id: pid, name, unit_sale_price, item_discount_percentage, unit_sale_quantity });
      }
      const invoiceProductsLite = Array.from(byId.values());

      const catalogById = new Map(
        (catalogProducts || []).map((p) => [String(p.id ?? p.value ?? p.product_id ?? p?.data?.id), p])
      );
      const merged = invoiceProductsLite.map((p) => {
        const base = catalogById.get(String(p.id)) || {};
        return {
          ...base,
          id: p.id,
          name: base.name ?? p.name,
          unit_sale_price: p.unit_sale_price ?? extractUnitPrice(base),
          item_discount_percentage: p.item_discount_percentage ?? extractItemDiscPct(base),
          unit_sale_quantity: p.unit_sale_quantity, // from invoice
        };
      });

      setProducts(merged.length ? merged : catalogProducts);
      return items;
    } catch (e) {
      console.error(e);
      setInvoiceItems([]);
      setProducts(catalogProducts);
      return [];
    }
  };

  const normalizeOpenBatch = (src) => ({
    batch_number: String(src?.batch_number ?? src?.batch ?? src?.code ?? "").trim(),
    expiry: String(src?.expiry ?? src?.expiry_date ?? "").trim(),
    available_units: extractBatchQty(src),
    is_unbatched: Boolean(src?.is_unbatched),
  });

  const fetchBatchesForOpenReturn = async (productId) => {
    try {
      const res = await axios.get(`/api/products/${productId}/batches?include_unbatched=1`);
      const rows = Array.isArray(res.data) ? res.data : [];
      const normalized = rows
        .map(normalizeOpenBatch)
        .filter((b) => b.batch_number || b.is_unbatched);
      productBatchCache.current.set(String(productId), normalized);
      return normalized;
    } catch (e) {
      productBatchCache.current.set(String(productId), []);
      return [];
    }
  };

  const fetchProductUnitPrice = async (pid) => {
    try {
      const res = await axios.get(`/api/products/${pid}`);
      const data = res.data || {};
      const fromApi = extractUnitPrice(data);
      if (fromApi > 0) return fromApi;
    } catch (e) {
      // ignore
    }
    const local =
      extractUnitPrice(products.find((p) => String(p.id ?? p.value) === String(pid))) ||
      extractUnitPrice(catalogProducts.find((p) => String(p.id ?? p.value) === String(pid)));
    return toNum(local);
  };

  // available qty (best-effort): try product API, then sum batches, then local cache
  const fetchProductAvailableQty = async (pid) => {
    try {
      const res = await axios.get(`/api/products/${pid}`);
      const d = res.data || {};
      const cands = [
        d.available_quantity,
        d.quantity_available,
        d.available_units,
        d.on_hand,
        d.stock,
        d.inventory,
        d.balance,
        d.qty,
        d.quantity,
      ];
      for (const c of cands) {
        const n = toNum(c);
        if (n > 0) return n;
      }
    } catch (e) {}
    try {
      const res = await axios.get(`/api/products/${pid}/batches`);
      const rows = Array.isArray(res.data) ? res.data : [];
      const total = rows.reduce((s, b) => s + extractBatchQty(b), 0);
      if (total > 0) return total;
    } catch (e) {}
    const local =
      products.find((p) => String(p.id ?? p.value) === String(pid)) ||
      catalogProducts.find((p) => String(p.id ?? p.value) === String(pid));
    const localCands = [
      local?.available_quantity,
      local?.quantity_available,
      local?.available_units,
      local?.on_hand,
      local?.stock,
      local?.inventory,
      local?.balance,
      local?.qty,
      local?.quantity,
    ];
    for (const c of localCands) {
      const n = toNum(c);
      if (n > 0) return n;
    }
    return 0;
  };

const handleSelectChange = async (field, value) => {
    const v = value?.value ?? value ?? "";
    if (field === "customer_id") {
      setForm((prev) => ({ ...prev, customer_id: v, sale_invoice_id: "" }));
      setSelectedInvoiceObj(null);
      await fetchSaleInvoices(v);
      setInvoiceItems([]);
      setProducts(catalogProducts);
      productBatchCache.current = new Map();
      setRowBatches([]);
      setForm((prev) =>
        recalcFooter({ ...prev, items: prev.items.map((it) => ({ ...defaultItem, id: it.id })) })
      );
      setTimeout(() => saleInvoiceRef.current?.focus?.(), 50);
      return;
    }
    if (field === "sale_invoice_id") {
      const invCustomerId = value?.customer_id;
      setForm((prev) => ({
        ...prev,
        sale_invoice_id: v,
        ...(invCustomerId ? { customer_id: invCustomerId } : {}),
      }));
      if (v) {
        await loadInvoice(v);
        // Fetch the full invoice to display its number and sync customer
        try {
          const invRes = await axios.get(`/api/sale-invoices/${v}`);
          const inv = invRes.data || {};
          setSelectedInvoiceObj(inv);
          // Keep the invoice's customer in sync so the form is consistent
          const autoSettlementMode = inv.invoice_type === "credit" ? "credit_note" : "cash_refund";
          setForm((prev) => ({
            ...prev,
            ...(inv.customer_id ? { customer_id: inv.customer_id } : {}),
            sale_invoice_id: v,
            settlement_mode: autoSettlementMode,
          }));
        } catch (e) {
          setSelectedInvoiceObj(null);
        }
      } else {
        setSelectedInvoiceObj(null);
        setInvoiceItems([]);
        setProducts(catalogProducts);
        setForm((prev) => ({ ...prev, settlement_mode: "cash_refund" }));
      }
      productBatchCache.current = new Map();
      setRowBatches([]);
      setForm((prev) =>
        recalcFooter({ ...prev, items: prev.items.map((it) => ({ ...defaultItem, id: it.id })) })
      );
      setTimeout(() => productRefs.current[0]?.querySelector("input")?.focus?.(), 50);
    }
  };

  const resolveProductId = (obj) => {
    if (obj === null || obj === undefined) return "";
    if (typeof obj === "number") return obj;
    if (typeof obj === "string") return obj.trim();
    if (typeof obj === "object") {
      return obj.product_id ?? obj.id ?? obj.value ?? obj?.product?.id ?? obj?.data?.id ?? "";
    }
    return "";
  };

  const resetRow = (row) => {
    setForm((prev) => {
      const items = [...prev.items];
      items[row] = { ...defaultItem, id: items[row].id };
      return recalcFooter({ ...prev, items });
    });
  };

  const productNameById = (pid) => {
    const p = products.find((x) => eqId(x.id ?? x.value, pid)) || catalogProducts.find((x) => eqId(x.id ?? x.value, pid));
    return p?.name || (pid ? `#${pid}` : "");
  };

  const findDuplicateProductIndex = (pid, exceptIndex = -1) =>
    form.items.findIndex((it, idx) => idx !== exceptIndex && eqId(it?.product_id, pid));

  const findDuplicateProductBatchIndex = (pid, batch, exceptIndex = -1, isUnbatched = false) =>
    form.items.findIndex(
      (it, idx) =>
        idx !== exceptIndex &&
        eqId(it?.product_id, pid) &&
        (isUnbatched
          ? Boolean(it?.is_unbatched || (!it?.batch_number && String(it?.batch_number ?? "").trim() === ""))
          : String(it?.batch_number ?? "").trim() === String(batch ?? "").trim() && !it?.is_unbatched)
    );

  const handleProductSelect = async (row, productObj) => {
    const pid = resolveProductId(productObj);
    if (!pid) return;

    const newItems = [...form.items];
    let unit_sale_price = 0;
    let item_discount_percentage = 0;
    let unit_sale_quantity = 0;

    const isInvoiceMode = !!form.sale_invoice_id;

    if (isInvoiceMode) {
      const candidates = invoiceItems.filter((it) => eqId(it.product_id, pid));
      const batchOptsInvoice = buildBatchOptionsForInvoice(candidates);
      const assignedBatchesInv = batchOptsInvoice.filter(
        (b) => !b.is_unbatched && b.batch_number && String(b.batch_number).trim() !== ""
      );
      const usedOnOtherRows = form.items
        .filter((it, idx) => idx !== row && eqId(it.product_id, pid))
        .map((it) => (it.batch_number ? String(it.batch_number).trim() : (it.is_unbatched ? "__unbatched__" : "")));

      if (batchOptsInvoice.length === 0 || assignedBatchesInv.length === 0) {
        if (usedOnOtherRows.length > 0) {
          invoiceErrors.showMessage(`Product "${productNameById(pid)}" already used in row ${findDuplicateProductIndex(pid, row) + 1}.`);
          resetRow(row);
          setTimeout(() => productRefs.current[row]?.querySelector("input")?.focus?.(), 40);
          return;
        }

        const unbatchedCandidate = candidates.find((c) => c.is_unbatched || !c.batch_number);
        unit_sale_price = unbatchedCandidate
          ? extractUnitPrice(unbatchedCandidate)
          : (candidates.length ? extractUnitPrice(candidates[0]) : await fetchProductUnitPrice(pid));
        item_discount_percentage = unbatchedCandidate
          ? extractItemDiscPct(unbatchedCandidate)
          : (candidates.length ? extractItemDiscPct(candidates[0]) : 0);
        unit_sale_quantity = candidates.reduce((s, c) => s + extractUnitSaleQty(c), 0);

        newItems[row] = recalcItem({
          ...newItems[row],
          product_id: pid,
          unit_sale_price,
          item_discount_percentage,
          unit_sale_quantity,
          batch_number: "",
          expiry: "",
          is_unbatched: true,
          unit_return_quantity: 0,
        });
        setForm((prev) => recalcFooter({ ...prev, items: newItems }));
        setRowBatches((prev) => {
          const next = prev.slice();
          next[row] = batchOptsInvoice;
          return next;
        });
        setTimeout(() => qtyRefs.current[row]?.focus?.(), 60);
        return;
      }

      const availableBatches = batchOptsInvoice.filter((b) => {
        const key = b.is_unbatched ? "__unbatched__" : String(b.batch_number).trim();
        return !usedOnOtherRows.includes(key);
      });

      if (availableBatches.length === 0 && usedOnOtherRows.length > 0) {
        invoiceErrors.showMessage(`All batches and unassigned stock for "${productNameById(pid)}" on this invoice are already added on earlier rows.`);
        resetRow(row);
        setTimeout(() => productRefs.current[row]?.querySelector("input")?.focus?.(), 40);
        return;
      }

      setRowBatches((prev) => {
        const next = prev.slice();
        next[row] = batchOptsInvoice;
        return next;
      });

      if (availableBatches.length === 1) {
        const b = availableBatches[0];
        const isUnb = Boolean(b.is_unbatched);
        newItems[row] = recalcItem({
          ...newItems[row],
          product_id: pid,
          batch_number: isUnb ? "" : b.batch_number,
          expiry: isUnb ? "" : (b.expiry || ""),
          is_unbatched: isUnb,
          unit_sale_price: b.unit_sale_price ?? (candidates.length ? extractUnitPrice(candidates[0]) : 0),
          item_discount_percentage: b.item_discount_percentage ?? (candidates.length ? extractItemDiscPct(candidates[0]) : 0),
          unit_sale_quantity: b.unit_sale_quantity ?? 0,
          unit_return_quantity: 0,
        });
        setForm((prev) => recalcFooter({ ...prev, items: newItems }));
        setTimeout(() => qtyRefs.current[row]?.focus?.(), 60);
        return;
      }

      // Multiple batches available
      unit_sale_price = candidates.length ? extractUnitPrice(candidates[0]) : await fetchProductUnitPrice(pid);
      item_discount_percentage = candidates.length ? extractItemDiscPct(candidates[0]) : 0;
      newItems[row] = recalcItem({
        ...newItems[row],
        product_id: pid,
        unit_sale_price,
        item_discount_percentage,
        unit_sale_quantity: 0,
        batch_number: "",
        expiry: "",
        is_unbatched: false,
        unit_return_quantity: 0,
      });
      setForm((prev) => recalcFooter({ ...prev, items: newItems }));
      setTimeout(() => batchRefs.current[row]?.querySelector("input")?.focus?.(), 60);
      return;
    }

    // OPEN MODE (No invoice selected)
    unit_sale_price = await fetchProductUnitPrice(pid);
    item_discount_percentage = toNum(newItems[row]?.item_discount_percentage);

    const openBatches = await fetchBatchesForOpenReturn(pid);
    const assignedBatchesOpen = (openBatches || []).filter(
      (b) => !b.is_unbatched && b.batch_number && String(b.batch_number).trim() !== ""
    );
    const usedOnOtherRows = form.items
      .filter((it, idx) => idx !== row && eqId(it.product_id, pid))
      .map((it) => (it.batch_number ? String(it.batch_number).trim() : (it.is_unbatched ? "__unbatched__" : "")));

    if (openBatches.length === 0 || assignedBatchesOpen.length === 0) {
      if (usedOnOtherRows.length > 0) {
        invoiceErrors.showMessage(`Product "${productNameById(pid)}" already used in row ${findDuplicateProductIndex(pid, row) + 1}.`);
        resetRow(row);
        setTimeout(() => productRefs.current[row]?.querySelector("input")?.focus?.(), 40);
        return;
      }

      const unbatchedItem = (openBatches || []).find((b) => b.is_unbatched);
      unit_sale_quantity = unbatchedItem?.available_units != null
        ? Number(unbatchedItem.available_units)
        : await fetchProductAvailableQty(pid);

      newItems[row] = recalcItem({
        ...newItems[row],
        product_id: pid,
        unit_sale_price,
        item_discount_percentage,
        unit_sale_quantity,
        batch_number: "",
        expiry: "",
        is_unbatched: true,
        unit_return_quantity: 0,
      });
      setForm((prev) => recalcFooter({ ...prev, items: newItems }));
      setRowBatches((prev) => {
        const next = prev.slice();
        next[row] = openBatches;
        return next;
      });
      setTimeout(() => qtyRefs.current[row]?.focus?.(), 60);
      return;
    }

    const availableBatches = openBatches.filter((b) => {
      const key = b.is_unbatched ? "__unbatched__" : String(b.batch_number).trim();
      return !usedOnOtherRows.includes(key);
    });

    if (availableBatches.length === 0 && usedOnOtherRows.length > 0) {
      invoiceErrors.showMessage(`All batches and unassigned stock for "${productNameById(pid)}" are already added on earlier rows.`);
      resetRow(row);
      setTimeout(() => productRefs.current[row]?.querySelector("input")?.focus?.(), 40);
      return;
    }

    setRowBatches((prev) => {
      const next = prev.slice();
      next[row] = openBatches;
      return next;
    });

    if (availableBatches.length === 1) {
      const b = availableBatches[0];
      const isUnb = Boolean(b.is_unbatched);
      newItems[row] = recalcItem({
        ...newItems[row],
        product_id: pid,
        batch_number: isUnb ? "" : b.batch_number,
        expiry: isUnb ? "" : (b.expiry || ""),
        is_unbatched: isUnb,
        unit_sale_price,
        item_discount_percentage,
        unit_sale_quantity: toNum(b.available_units),
        unit_return_quantity: 0,
      });
      setForm((prev) => recalcFooter({ ...prev, items: newItems }));
      setTimeout(() => qtyRefs.current[row]?.focus?.(), 60);
      return;
    }

    // Multiple batches in open mode
    newItems[row] = recalcItem({
      ...newItems[row],
      product_id: pid,
      unit_sale_price,
      item_discount_percentage,
      unit_sale_quantity: 0,
      batch_number: "",
      expiry: "",
      is_unbatched: false,
      unit_return_quantity: 0,
    });
    setForm((prev) => recalcFooter({ ...prev, items: newItems }));
    setTimeout(() => batchRefs.current[row]?.querySelector("input")?.focus?.(), 60);
  };

  const handleBatchSelect = (row, batchVal, batchObj = null) => {
    const isUnbatched = Boolean(
      batchObj?.is_unbatched ||
      batchVal === "__unbatched__" ||
      batchVal === "[Unbatched Stock]" ||
      batchVal?.is_unbatched
    );
    const rawVal = typeof batchVal === "string" ? batchVal : batchVal?.value ?? batchVal?.batch_number ?? batchObj?.batch_number ?? "";
    const bn = isUnbatched ? "" : String(rawVal).trim();
    const pid = form.items[row].product_id;

    if (pid) {
      const duplicate = findDuplicateProductBatchIndex(pid, bn, row, isUnbatched);
      if (duplicate !== -1) {
        invoiceErrors.showMessage(
          isUnbatched
            ? `Row ${duplicate + 1} already has unassigned stock for "${productNameById(pid)}". Each batch (or unassigned stock) can only be selected once per product.`
            : `Same Product & Batch already used in row ${duplicate + 1}. Use a unique batch for the same product.`
        );
        setForm((prev) => {
          const items = [...prev.items];
          items[row] = { ...items[row], batch_number: "", expiry: "", is_unbatched: false };
          return recalcFooter({ ...prev, items });
        });
        setTimeout(() => batchRefs.current[row]?.querySelector("input")?.focus?.(), 40);
        return;
      }
    }

    const newItems = [...form.items];
    let expiry = "";
    let unit_sale_quantity = newItems[row].unit_sale_quantity || 0;
    let unit_sale_price = newItems[row].unit_sale_price || 0;
    let item_discount_percentage = newItems[row].item_discount_percentage || 0;

    if (form.sale_invoice_id) {
      const matchedInv = invoiceItems.find(
        (it) =>
          eqId(it.product_id, pid) &&
          (isUnbatched
            ? Boolean(it.is_unbatched || (!it.batch_number && !it.batch))
            : String(it.batch_number ?? it.batch ?? "").trim() === bn)
      );
      if (matchedInv) {
        expiry = isUnbatched ? "" : (matchedInv.expiry || "");
        unit_sale_quantity = extractUnitSaleQty(matchedInv);
        unit_sale_price = extractUnitPrice(matchedInv) || unit_sale_price;
        item_discount_percentage = extractItemDiscPct(matchedInv);
      }
    } else {
      // open mode
      const cached = productBatchCache.current.get(String(pid)) || [];
      const matchedOpen = cached.find((b) => (isUnbatched ? b.is_unbatched : b.batch_number === bn));
      if (matchedOpen) {
        expiry = isUnbatched ? "" : (matchedOpen.expiry || "");
        if (toNum(matchedOpen.available_units) > 0) {
          unit_sale_quantity = toNum(matchedOpen.available_units);
        }
      }
    }

    newItems[row] = recalcItem({
      ...newItems[row],
      batch_number: bn,
      expiry,
      is_unbatched: isUnbatched,
      unit_sale_quantity,
      unit_sale_price,
      item_discount_percentage,
    });
    setForm((prev) => recalcFooter({ ...prev, items: newItems }));
    setTimeout(() => qtyRefs.current[row]?.focus?.(), 40);
  };

  const handleItemChange = (row, field, raw) => {
    const v = raw === "" ? "" : Number(raw);
    const newItems = [...form.items];

    // Only enforce cap in invoice-based returns
    if (field === "unit_return_quantity" && form.sale_invoice_id) {
      const allowed = toNum(newItems[row].unit_sale_quantity);
      const prevQty = toNum(newItems[row].unit_return_quantity);
      const nextQty = toNum(v);
      if (nextQty > allowed && prevQty <= allowed) {
        invoiceErrors.showMessage(`Row ${row + 1}: Return qty exceeds allowed (${allowed}).`);
      }
    }

    newItems[row] = recalcItem({ ...newItems[row], [field]: v });
    setForm((prev) => recalcFooter({ ...prev, items: newItems }));
  };

  const addItem = () => {
    setForm((prev) => ({
      ...prev,
      items: [...prev.items, { ...defaultItem, id: Date.now() + Math.random() }],
    }));
    setRowBatches((prev) => [...prev, []]);
    setTimeout(
      () => productRefs.current[form.items.length]?.querySelector("input")?.focus?.(),
      50
    );
  };

  const removeItem = (row) => {
    if (form.items.length <= 1) return;
    const next = form.items.filter((_, i) => i !== row);
    setRowBatches((prev) => prev.filter((_, i) => i !== row));
    setForm((prev) => recalcFooter({ ...prev, items: next }));
  };

  // Header footer field handlers (bi-directional)
  const onDiscountPctChange = (val) =>
    setForm((prev) => recalcFooter({ ...prev, discount_percentage: val }, { disc: "pct" }));
  const onDiscountAmtChange = (val) =>
    setForm((prev) => recalcFooter({ ...prev, discount_amount: val }, { disc: "amt" }));
  const onTaxPctChange = (val) =>
    setForm((prev) => recalcFooter({ ...prev, tax_percentage: val }, { tax: "pct" }));
  const onTaxAmtChange = (val) =>
    setForm((prev) => recalcFooter({ ...prev, tax_amount: val }, { tax: "amt" }));

  const handleSubmit = async () => {
    invoiceErrors.clear();
    try {
      if (!form.customer_id) {
        invoiceErrors.showMessage("Please select a customer");
        customerSelectRef.current?.focus?.();
        return;
      }

      // Validations: duplicates & qty (qty cap only for invoice-based returns)
      const seenPairs = new Set();
      for (let i = 0; i < form.items.length; i++) {
        const it = form.items[i];
        if (!it.product_id) continue; // skip empty rows

        const keyP = String(it.product_id);
        const isUnb = Boolean(it.is_unbatched || (!it.batch_number && String(it.batch_number || "").trim() === ""));
        const batchKey = isUnb ? "__unbatched__" : String(it.batch_number || "").trim();
        const keyPB = `${keyP}::${batchKey}`;

        if (seenPairs.has(keyPB)) {
          invoiceErrors.showMessage(
            isUnb
              ? `Row ${i + 1}: Unassigned stock for product "${productNameById(it.product_id)}" is already added on another row.`
              : `Row ${i + 1}: Duplicate product + batch "${it.batch_number}". Each batch can be selected only once.`
          );
          return;
        }
        seenPairs.add(keyPB);

        // Batch selection check: if row has batches options, require batch or unbatched
        const rowBatchesForThis = rowBatches[i] || [];
        if (rowBatchesForThis.length > 0 && !it.batch_number && !it.is_unbatched) {
          invoiceErrors.showMessage(`Row ${i + 1}: Please select a batch or unbatched stock.`);
          return;
        }

        if (toNum(it.unit_return_quantity) <= 0) {
          invoiceErrors.showMessage(`Row ${i + 1}: Return quantity must be greater than 0.`);
          return;
        }

        // qty > allowed — enforce only for invoice mode
        if (form.sale_invoice_id) {
          const allowed = toNum(it.unit_sale_quantity);
          if (toNum(it.unit_return_quantity) > allowed) {
            invoiceErrors.showMessage(`Row ${i + 1}: Return qty exceeds allowed (${allowed}).`);
            return;
          }
        }
      }

      // If an invoice is linked, ensure effective customer ID matches the invoice
      const effectiveCustomerId =
        form.sale_invoice_id &&
        (selectedInvoiceObj?.customer_id ||
          (saleInvoices || []).find((inv) => String(inv.id) === String(form.sale_invoice_id))?.customer_id)
          ? selectedInvoiceObj?.customer_id ||
            (saleInvoices || []).find((inv) => String(inv.id) === String(form.sale_invoice_id))?.customer_id
          : form.customer_id;

      // Build payload - on CREATE: don't send posted_number (let server generate)
      // On UPDATE: send posted_number (preserve existing)
      const payloadToSend = returnId
        ? {
            posted_number: form.posted_number,
            date: form.date,
            customer_id: effectiveCustomerId,
            sale_invoice_id: form.sale_invoice_id || null,
            settlement_mode: form.settlement_mode || "cash_refund",
            payment_method: form.payment_method || "cash",
            account_id: form.account_id ? Number(form.account_id) : null,
            discount_percentage: toNum(form.discount_percentage),
            discount_amount: toNum(form.discount_amount),
            tax_percentage: toNum(form.tax_percentage),
            tax_amount: toNum(form.tax_amount),
            gross_total: toNum(form.gross_total),
            total: toNum(form.total),
            items: form.items
              .filter((it) => it.product_id)
              .map((it) => ({
                product_id: it.product_id,
                batch_number: it.is_unbatched ? null : (it.batch_number || null),
                expiry: it.is_unbatched ? null : (it.expiry || null),
                is_unbatched: Boolean(it.is_unbatched),
                unit_sale_quantity: toNum(it.unit_sale_quantity),
                unit_sale_price: toNum(it.unit_sale_price),
                unit_return_quantity: toNum(it.unit_return_quantity),
                item_discount_percentage: toNum(it.item_discount_percentage),
                sub_total: toNum(it.sub_total),
              })),
          }
        : {
            // Exclude posted_number on create - let server assign it
            date: form.date,
            customer_id: effectiveCustomerId,
            sale_invoice_id: form.sale_invoice_id || null,
            settlement_mode: form.settlement_mode || "cash_refund",
            payment_method: form.payment_method || "cash",
            account_id: form.account_id ? Number(form.account_id) : null,
            discount_percentage: toNum(form.discount_percentage),
            discount_amount: toNum(form.discount_amount),
            tax_percentage: toNum(form.tax_percentage),
            tax_amount: toNum(form.tax_amount),
            gross_total: toNum(form.gross_total),
            total: toNum(form.total),
            items: form.items
              .filter((it) => it.product_id)
              .map((it) => ({
                product_id: it.product_id,
                batch_number: it.is_unbatched ? null : (it.batch_number || null),
                expiry: it.is_unbatched ? null : (it.expiry || null),
                is_unbatched: Boolean(it.is_unbatched),
                unit_sale_quantity: toNum(it.unit_sale_quantity),
                unit_sale_price: toNum(it.unit_sale_price),
                unit_return_quantity: toNum(it.unit_return_quantity),
                item_discount_percentage: toNum(it.item_discount_percentage),
                sub_total: toNum(it.sub_total),
              })),
          };

      const doSave = async (dataPayload) => {
        try {
          if (returnId) {
            await axios.put(`/api/sale-returns/${returnId}`, dataPayload);
            window.dispatchEvent(new CustomEvent("cash-drawer-changed"));
            window.dispatchEvent(new CustomEvent("accounts-changed"));
            try { localStorage.setItem("cash_drawer_sync", String(Date.now())); } catch {}
            try { localStorage.setItem("accounts_sync", String(Date.now())); } catch {}
            toast.success("Sale return updated");
            onSuccess?.(returnId);
          } else {
            const { data: saved } = await axios.post(`/api/sale-returns`, dataPayload);
            window.dispatchEvent(new CustomEvent("cash-drawer-changed"));
            window.dispatchEvent(new CustomEvent("accounts-changed"));
            try { localStorage.setItem("cash_drawer_sync", String(Date.now())); } catch {}
            try { localStorage.setItem("accounts_sync", String(Date.now())); } catch {}
            setForm((prev) => ({ ...prev, posted_number: saved?.posted_number || prev.posted_number }));
            toast.success(`Sale return created: ${saved?.posted_number || ""}`);
            if (saved?.id) {
              onSuccess?.(saved.id);
            } else {
              onSuccess?.();
            }
          }
        } catch (e) {
          console.error(e);
          invoiceErrors.showError(e);
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
    } catch (e) {
      console.error(e);
      invoiceErrors.showError(e);
    }
  };

  const navigate = useNavigate();
  const handleCancel = () => navigate("/sale-returns");

  // ---------- Keyboard Navigation (similar to SaleInvoiceForm) ----------
  const COLS = ["product", "batch", "quantity", "disc"];

  const focusCell = (row, col) => {
    const map = {
      product: productRefs,
      batch: batchRefs,
      quantity: { current: qtyRefs.current },
      disc: { current: discRefs.current },
    };
    const ref = map[col]?.current?.[row];
    if (!ref) return;
    const input = ref.querySelector?.("input");
    if (input) {
      input.focus();
      input.select?.();
    } else if (ref.focus) {
      ref.focus();
    }
  };

  const moveSameCol = (row, col, dir) => {
    const lastIdx = form.items.length - 1;
    if (dir === 1) {
      if (row === lastIdx) {
        addItem();
        setTimeout(() => {
          const targetCol = col === "quantity" || col === "disc" ? "product" : col;
          focusCell(row + 1, targetCol);
        }, 60);
      } else {
        focusCell(row + 1, col);
      }
    } else {
      if (row > 0) focusCell(row - 1, col);
    }
  };

  const moveNextCol = (row, col) => {
    const i = COLS.indexOf(col);
    if (i < 0) return;
    if (i < COLS.length - 1) {
      focusCell(row, COLS[i + 1]);
    } else {
      const lastIdx = form.items.length - 1;
      if (row === lastIdx) {
        addItem();
        setTimeout(() => focusCell(row + 1, COLS[0]), 60);
      } else {
        focusCell(row + 1, COLS[0]);
      }
    }
  };

  const onKeyNav = (e, row, col) => {
    // Allow Batch dropdown to handle its own Arrow keys (if it opens a menu)
    if (col === "batch" && (e.key === "ArrowDown" || e.key === "ArrowUp")) return;
    switch (e.key) {
      case "ArrowDown":
        e.preventDefault();
        moveSameCol(row, col, 1);
        break;
      case "ArrowUp":
        e.preventDefault();
        moveSameCol(row, col, -1);
        break;
      case "Enter":
        e.preventDefault();
        if (col === "quantity") {
          focusCell(row, "disc");
        } else {
          moveNextCol(row, col);
        }
        break;
      default:
        break;
    }
  };

// ===== Render =====
  const selectedCustomer = (customers || []).find(
    (c) => String(c.id) === String(form.customer_id)
  );
  const selectedInvoice =
    selectedInvoiceObj ||
    (saleInvoices || []).find(
      (inv) => String(inv.id) === String(form.sale_invoice_id)
    );

  return (
    <div className="relative">
      <form className={`sale-entry sale-entry-form sale-return-form h-auto lg:h-[calc(100dvh-130px)] flex flex-col ${isDark ? "bg-slate-900" : "bg-white"}`} autoComplete="off" autoCapitalize="off" autoCorrect="off" spellCheck={false}>
        <InvoiceErrorSummary errors={invoiceErrors} />
        {/* ===== HEADER ===== */}
        <div className={`sale-entry-header shrink-0 sticky top-0 z-20 border-b ${isDark ? "border-slate-700" : "border-gray-200"}`}>
          {/* Branded Banner */}
          <div
            className="sale-entry-banner px-3 sm:px-4 py-2.5 flex flex-wrap items-center justify-between gap-x-3 gap-y-2"

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
                  <h2 className="text-lg font-extrabold tracking-wide text-white leading-none">Sale Return</h2>
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
              {returnId ? "Edit (Alt+S)" : "Create (Alt+S)"}
            </button>
          </div>

          {/* Fields Card */}
          <div className="sale-entry-details px-3 py-2">
            <div className="grid grid-cols-12 gap-2 items-end">
              {/* Posted Number */}
              <div className="col-span-6 sm:col-span-3 lg:col-span-2">
                <label className="block text-[9px] font-medium uppercase tracking-wide text-gray-500 dark:text-gray-400 mb-1">Posted #</label>
                <input
                  type="text"
                  readOnly
                  value={form.posted_number || ""}
                  placeholder={returnId ? "" : "Auto on Save"}
                  autoComplete="off"
                  className={`w-full h-8 border border-gray-200 dark:border-slate-600 rounded-md px-2 text-[11px] ${
                    isDark ? "bg-slate-700 text-slate-200 placeholder-slate-500" : "bg-gray-100 text-gray-800"
                  }`}
                />
              </div>

              {/* Date */}
              <div className="col-span-6 sm:col-span-3 lg:col-span-2">
                <label className="block text-[9px] font-medium uppercase tracking-wide text-gray-500 dark:text-gray-400 mb-1">Date</label>
                <input
                  type="date"
                  name="date"
                  value={form.date || ""}
                  onChange={(e) => setForm({ ...form, date: e.target.value })}
                  autoComplete="off"
                  className="w-full h-8 border border-gray-200 dark:border-slate-600 rounded-md px-2 text-[11px] bg-white dark:bg-slate-700 text-gray-900 dark:text-slate-200"
                />
              </div>

              {/* Customer trigger button */}
              <div className="col-span-12 sm:col-span-6 lg:col-span-4">
                <label className="block text-[9px] font-medium uppercase tracking-wide text-gray-500 dark:text-gray-400 mb-1">Customer *</label>
                <button
                  type="button"
                  onClick={() => setCustomerSearchOpen(true)}
                  className={`w-full h-9 px-3 rounded-lg border text-left text-sm flex items-center gap-2 transition-all ${
                    selectedCustomer
                      ? "border-blue-500 bg-blue-50 dark:bg-blue-900/30 text-blue-700 dark:text-blue-200"
                      : "border-gray-300 dark:border-slate-600 bg-white dark:bg-slate-700 text-gray-500 dark:text-gray-400 hover:border-blue-400"
                  }`}
                  title={selectedCustomer?.name || "Click to search customer..."}
                >
                  <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" className="shrink-0">
                    <path d="M20 21v-2a4 4 0 0 0-4-4H8a4 4 0 0 0-4 4v2" />
                    <circle cx="12" cy="7" r="4" />
                  </svg>
                  {selectedCustomer ? (
                    <span className="truncate font-medium">{selectedCustomer.name}</span>
                  ) : (
                    <span className="truncate">Click to search customer...</span>
                  )}
                </button>
              </div>

              {/* Sale Invoice trigger button */}
              <div className="col-span-12 sm:col-span-6 lg:col-span-4">
                <label className="block text-[9px] font-medium uppercase tracking-wide text-gray-500 dark:text-gray-400 mb-1">Sale Invoice (optional)</label>
                <button
                  type="button"
                  onClick={() => setInvoiceSearchOpen(true)}
                  className={`w-full h-9 px-3 rounded-lg border text-left text-sm flex items-center gap-2 transition-all ${
                    selectedInvoice
                      ? "border-blue-500 bg-blue-50 dark:bg-blue-900/30 text-blue-700 dark:text-blue-200"
                      : "border-gray-300 dark:border-slate-600 bg-white dark:bg-slate-700 text-gray-500 dark:text-gray-400 hover:border-blue-400"
                  }`}
                  title={selectedInvoice?.posted_number || "Click to search invoice..."}
                >
                  <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" className="shrink-0">
                    <path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z" />
                    <polyline points="14 2 14 8 20 8" />
                  </svg>
                  {selectedInvoice ? (
                    <span className="truncate font-medium">{selectedInvoice.posted_number}</span>
                  ) : (
                    <span className="truncate">Click to search invoice...</span>
                  )}
                </button>
              </div>
            </div>
          </div>
        </div>

        <div className={`sale-entry-workspace flex-1 min-h-0 flex flex-col lg:grid lg:grid-cols-[minmax(0,1fr)_280px] gap-2 px-2 py-2 overflow-visible lg:overflow-hidden ${isDark ? "bg-slate-900" : "bg-white"}`}>
        {/* ITEMS */}
        <div className={`sale-entry-items flex-1 min-h-0 overflow-auto border-2 rounded-sm relative ${isDark ? "border-slate-700 bg-slate-800" : "border-gray-200 bg-white"}`}>
          <h2 className={`text-xs font-bold mb-1 ${isDark ? "text-slate-300" : "text-gray-700"}`}>Items</h2>
          <table className="invoice-repeater-table w-full min-w-[560px] text-[11px] lg:table-fixed border-collapse" autoComplete="off">
              <thead className={`sticky top-0 z-20 ${isDark ? "bg-slate-800/90 backdrop-blur-xs border-slate-700" : "bg-white/80 backdrop-blur-xs border-gray-200/70"} border-b`}>
                <tr className="[&>th]:py-1 [&>th]:px-1 [&>th]:text-left">
                  <th className={`w-6 text-center ${isDark ? "text-rose-400" : "text-red-600"}`}>DEL</th>
                  <th className={`w-6 text-center ${isDark ? "text-slate-400" : "text-gray-600"}`}>#</th>
                  <th className={`w-[32%] min-w-[220px] ${isDark ? "text-slate-400" : "text-gray-600"}`}>Product</th>
                  <th className={`w-11 text-center ${isDark ? "text-slate-400" : "text-gray-600"}`}>PSize</th>
                  <th className={`w-18 ${isDark ? "text-slate-400" : "text-gray-600"}`}>Batch</th>
                  <th className={`w-[74px] text-center ${isDark ? "text-slate-400" : "text-gray-600"}`}>Expiry</th>
                  <th className={`w-15 text-center ${isDark ? "text-slate-400" : "text-gray-600"}`}>{form.sale_invoice_id ? "Returnable" : "Avail"}</th>
                  <th className={`w-18 text-center ${isDark ? "text-slate-400" : "text-gray-600"}`}>Return Qty</th>
                  <th className={`w-18 text-center ${isDark ? "text-slate-400" : "text-gray-600"}`}>Price</th>
                  <th className={`w-14 text-center ${isDark ? "text-slate-400" : "text-gray-600"}`}>Disc%</th>
                  <th className={`w-22 text-center ${isDark ? "text-slate-400" : "text-gray-600"}`}>Sub Total</th>
                  <th className="w-6 text-center">+</th>
                </tr>
              </thead>
            <tbody className="[&>tr>td]:py-1 [&>tr>td]:px-0.2">
              {form.items.map((item, i) => {
                const exceeds = form.sale_invoice_id
                  ? toNum(item.unit_return_quantity) > toNum(item.unit_sale_quantity)
                  : false;
                return (
                  <tr key={item.id} id={invoiceErrors.rowId(i)} aria-invalid={invoiceErrors.rowMessages(i).length > 0 || undefined} className={`invoice-repeater-row ${invoiceErrors.rowMessages(i).length ? "invoice-row-invalid" : ""} text-center ${isDark ? "hover:bg-slate-700/50" : "hover:bg-gray-50"}`}>
                    <td className="invoice-cell-del text-center">
                      <button
                        type="button"
                        onClick={() => removeItem(i)} aria-label="Remove item" title="Remove item"
                        className="sale-item-action sale-item-remove"
                      >
                        <TrashIcon aria-hidden="true" />
                      </button>
                    </td>
                    <td data-label="Item #" className="invoice-cell-index text-center">{i + 1}</td>
                    <td data-label="Product *" className="invoice-cell-product">
                      <InvoiceRowError messages={invoiceErrors.rowMessages(i)} />
                    <div ref={(el) => (productRefs.current[i] = el)}>
                        <ProductSearchInput
                          value={products.find((p) => eqId(p.id, item.product_id)) || item.product_id}
                          onChange={(val) => handleProductSelect(i, val)}
                          onRefreshProducts={refreshProducts}
                          products={products}
                          onKeyDown={(e) => onKeyNav(e, i, "product")}
                        />
                      </div>
                    </td>
                    <td data-label="Pack Size" className="text-center"><input type="text" readOnly value={products.find(p => eqId(p.id, item.product_id))?.pack_size ?? ""} className={`w-full h-6 border rounded px-1 text-center ${isDark ? "border-slate-600 bg-slate-700 text-slate-300" : "border-gray-200 bg-gray-100 text-gray-700"}`} /></td>
                    <td data-label="Batch" className="text-center">
                      <div ref={(el) => (batchRefs.current[i] = el)}>
                        <BatchSearchInput
                          value={item.batch_number ? item.batch_number : (item.is_unbatched ? "[Unbatched Stock]" : "")}
                          batches={(rowBatches[i] || []).map(b => ({ ...b, batch_number: b.batch_number || b.batch }))}
                          usedBatches={form.items
                            .filter((row, index) => index !== i && eqId(row.product_id, item.product_id))
                            .map((row) => (row.batch_number ? String(row.batch_number).trim() : (row.is_unbatched ? "__unbatched__" : "")))
                            .filter(Boolean)}
                          inputProps={{ autoComplete: "off", autoCapitalize: "off", autoCorrect: "off", spellCheck: false }}
                          onChange={(v, obj) => handleBatchSelect(i, v, obj)}
                          onKeyDown={(e) => onKeyNav(e, i, "batch")}
                        />
                      </div>
                    </td>
                    <td data-label="Expiry" className="text-center">
                      <input
                        type="text"
                        readOnly
                        size={1}
                        placeholder="—"
                        title={item.expiry ? String(item.expiry).trim().slice(0, 10) : undefined}
                        value={item.expiry ? String(item.expiry).trim().slice(0, 10).replace(/^(\d{4})-(\d{2})(?:-\d{2})?$/, "$2/$1") : ""}
                        className={`w-full min-w-0 h-6 border rounded px-0.5 text-center font-mono text-[10.5px] ${
                          isDark
                            ? "border-slate-600 bg-slate-700 text-slate-300"
                            : "border-gray-200 bg-gray-100 text-gray-700"
                        }`}
                      />
                    </td>
                    <td data-label={form.sale_invoice_id ? "Returnable" : "Available"} className="text-center">
                      <input
                        type="number"
                        readOnly
                        value={item.unit_sale_quantity || 0}
                        className={`w-full h-6 border rounded px-1 text-center text-[11px] ${
                          isDark
                            ? "border-slate-600 bg-slate-700 text-slate-300"
                            : "border-gray-200 bg-gray-100 text-gray-700"
                        }`}
                      />
                    </td>
                    <td data-label="Return Qty *" className="text-center">
                      <input
                        ref={(el) => (qtyRefs.current[i] = el)}
                        type="text"
                        value={item.unit_return_quantity === 0 ? "" : item.unit_return_quantity}
                        onChange={(e) => handleItemChange(i, "unit_return_quantity", e.target.value)}
                        className={
                          `w-full h-6 border rounded px-1 text-center text-[11px] ` +
                          (exceeds
                            ? "border-red-500 ring-1 ring-red-400"
                            : isDark
                              ? "bg-slate-700 border-slate-600 text-slate-200"
                              : "bg-white border-gray-300 text-gray-800"
                          )
                        }
                        onKeyDown={(e) => onKeyNav(e, i, "quantity")}
                      />
                    </td>
                    <td data-label="Unit Price" className="text-center">
                      <input
                        type="number"
                        readOnly
                        value={item.unit_sale_price || 0}
                        className={`w-full h-6 border rounded px-1 text-center text-[11px] ${
                          isDark
                            ? "border-slate-600 bg-slate-700 text-slate-300"
                            : "border-gray-200 bg-gray-100 text-gray-700"
                        }`}
                      />
                    </td>
                    <td data-label="Disc %" className="text-center">
                      <input
                        ref={(el) => (discRefs.current[i] = el)}
                        type="text"
                        value={item.item_discount_percentage === 0 ? "" : item.item_discount_percentage}
                        onChange={(e) => handleItemChange(i, "item_discount_percentage", e.target.value)}
                        className={`w-full h-6 border rounded px-1 text-center text-[11px] ${
                          isDark
                            ? "bg-slate-700 border-slate-600 text-slate-200"
                            : "bg-white border-gray-300 text-gray-800"
                        }`}
                        onKeyDown={(e) => onKeyNav(e, i, "disc")}
                      />
                    </td>
                    <td data-label="Sub Total" className="invoice-cell-subtotal text-center">
                      <input
                        type="number"
                        readOnly
                        value={(Number(item.sub_total) || 0).toFixed(2)}
                        className={`w-full h-6 border rounded px-1 text-center text-[11px] ${
                          isDark
                            ? "border-slate-600 bg-slate-700 text-slate-300"
                            : "border-gray-200 bg-gray-100 text-gray-700"
                        }`}
                      />
                    </td>
                    <td className="invoice-cell-add text-center">
                      <button
                        type="button"
                        onClick={addItem} aria-label="Add item" title="Add item"
                        className="sale-item-action sale-item-add"
                      >
                        <PlusIcon aria-hidden="true" />
                      </button>
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>

        {/* FOOTER */}
        <div className={`sale-entry-summary sale-return-summary h-full min-h-0 flex flex-col rounded-2xl overflow-hidden ${isDark ? "bg-slate-800" : "bg-white"}`}>
          <div className="sale-entry-summary-heading px-4 py-3 shrink-0"><span className="font-bold text-sm">Return Summary</span></div>
          <div className="sale-summary-body flex-1 min-h-0 px-4 py-3 overflow-y-auto">
          <table className="w-full border-collapse text-xs">
            <tbody>
              <tr>
                <td colSpan={6} className={`border p-2 ${isDark ? "border-slate-700" : "border-gray-200"}`}>
                  <div className="grid grid-cols-2 gap-2">
                    <div>
                      <label className={`block text-[10px] mb-0.5 ${isDark ? "text-slate-400" : "text-gray-600"}`}>Gross Total</label>
                      <input
                        type="number"
                        readOnly
                        value={(Number(form.gross_total) || 0).toFixed(2)}
                        className={`border rounded w-full p-1 h-7 text-xs ${
                          isDark
                            ? "border-slate-600 bg-slate-700 text-slate-300"
                            : "border-gray-300 bg-gray-100 text-gray-700"
                        }`}
                      />
                    </div>
                    <div>
                      <label className={`block text-[10px] mb-0.5 ${isDark ? "text-slate-400" : "text-gray-600"}`}>Discount %</label>
                      <input
                        type="number"
                        value={form.discount_percentage === 0 ? "" : form.discount_percentage}
                        onChange={(e) => onDiscountPctChange(e.target.value)}
                        className={`border rounded w-full p-1 h-7 text-xs ${
                          isDark
                            ? "border-slate-600 bg-slate-700 text-slate-200"
                            : "border-gray-300 text-gray-800"
                        }`}
                      />
                    </div>
                    <div>
                      <label className={`block text-[10px] mb-0.5 ${isDark ? "text-slate-400" : "text-gray-600"}`}>Discount Amount</label>
                      <input
                        type="number"
                        value={form.discount_amount === 0 ? "" : form.discount_amount}
                        onChange={(e) => onDiscountAmtChange(e.target.value)}
                        className={`border rounded w-full p-1 h-7 text-xs ${
                          isDark
                            ? "border-slate-600 bg-slate-700 text-slate-200"
                            : "border-gray-300 text-gray-800"
                        }`}
                      />
                    </div>
                    <div>
                      <label className={`block text-[10px] mb-0.5 ${isDark ? "text-slate-400" : "text-gray-600"}`}>Tax %</label>
                      <input
                        type="number"
                        value={form.tax_percentage === 0 ? "" : form.tax_percentage}
                        onChange={(e) => onTaxPctChange(e.target.value)}
                        className={`border rounded w-full p-1 h-7 text-xs ${
                          isDark
                            ? "border-slate-600 bg-slate-700 text-slate-200"
                            : "border-gray-300 text-gray-800"
                        }`}
                      />
                    </div>
                    <div>
                      <label className={`block text-[10px] mb-0.5 ${isDark ? "text-slate-400" : "text-gray-600"}`}>Tax Amount</label>
                      <input
                        type="number"
                        value={form.tax_amount === 0 ? "" : form.tax_amount}
                        onChange={(e) => onTaxAmtChange(e.target.value)}
                        className={`border rounded w-full p-1 h-7 text-xs ${
                          isDark
                            ? "border-slate-600 bg-slate-700 text-slate-200"
                            : "border-gray-300 text-gray-800"
                        }`}
                      />
                    </div>
                    <div>
                      <label className={`block text-[10px] mb-0.5 ${isDark ? "text-slate-400" : "text-gray-600"}`}>Total</label>
                      <input
                        type="number"
                        readOnly
                        value={(Number(form.total) || 0).toFixed(2)}
                        className={`border rounded w-full p-1 h-7 text-xs font-bold ${
                          isDark
                            ? "border-slate-600 bg-slate-700 text-rose-400"
                            : "border-gray-300 bg-gray-100 text-red-600"
                        }`}
                      />
                    </div>
                  </div>
                </td>
              </tr>
              <tr>
                <td colSpan={6} className={`p-2 border ${isDark ? "border-slate-700 bg-slate-800/80" : "border-gray-200 bg-gray-50/80"}`}>
                  <div className="space-y-2">
                    <div className="flex items-center justify-between">
                      <label className={`text-[10px] font-bold uppercase tracking-wider ${isDark ? "text-slate-300" : "text-gray-700"}`}>
                        Settlement Outcome
                      </label>
                      {selectedInvoice?.invoice_type === "credit" && (
                        <span className="px-1.5 py-0.5 rounded text-[9px] font-semibold bg-amber-500/20 text-amber-600 dark:text-amber-300">
                          Credit Invoice
                        </span>
                      )}
                    </div>
                    <div className="grid grid-cols-1 gap-1.5">
                      <button
                        type="button"
                        onClick={() => setForm((prev) => ({ ...prev, settlement_mode: "credit_note" }))}
                        className={`w-full px-2.5 py-1.5 rounded-lg border text-left text-[11px] font-semibold transition-all ${
                          form.settlement_mode === "credit_note" || form.settlement_mode === "invoice_offset"
                            ? "border-indigo-500 bg-indigo-50 dark:bg-indigo-900/40 text-indigo-700 dark:text-indigo-200 ring-1 ring-indigo-500/40"
                            : isDark
                              ? "border-slate-600 bg-slate-700/60 text-slate-300 hover:border-slate-500"
                              : "border-gray-200 bg-white text-gray-700 hover:border-gray-300"
                        }`}
                      >
                        <div className="flex items-center justify-between">
                          <span>Adjust Customer Ledger (Credit Note)</span>
                          {(form.settlement_mode === "credit_note" || form.settlement_mode === "invoice_offset") && (
                            <span className="text-[9px] font-bold uppercase">Active</span>
                          )}
                        </div>
                        <p className={`text-[9px] font-normal mt-0.5 ${isDark ? "text-slate-400" : "text-gray-500"}`}>
                          Reduces customer credit balance — no cash leaves drawer
                        </p>
                      </button>

                      <button
                        type="button"
                        onClick={() => setForm((prev) => ({ ...prev, settlement_mode: "cash_refund" }))}
                        className={`w-full px-2.5 py-1.5 rounded-lg border text-left text-[11px] font-semibold transition-all ${
                          form.settlement_mode === "cash_refund"
                            ? "border-emerald-500 bg-emerald-50 dark:bg-emerald-900/40 text-emerald-700 dark:text-emerald-200 ring-1 ring-emerald-500/40"
                            : isDark
                              ? "border-slate-600 bg-slate-700/60 text-slate-300 hover:border-slate-500"
                              : "border-gray-200 bg-white text-gray-700 hover:border-gray-300"
                        }`}
                      >
                        <div className="flex items-center justify-between">
                          <span>Instant Refund (Cash / Bank / Wallet)</span>
                          {form.settlement_mode === "cash_refund" && (
                            <span className="text-[9px] font-bold uppercase">Active</span>
                          )}
                        </div>
                        <p className={`text-[9px] font-normal mt-0.5 ${isDark ? "text-slate-400" : "text-gray-500"}`}>
                          Refunds money immediately via selected payment method
                        </p>
                      </button>
                    </div>

                    {form.settlement_mode === "cash_refund" && (
                      <div className="grid grid-cols-2 gap-1.5 pt-1">
                        <div>
                          <label className={`block text-[9px] font-medium mb-0.5 ${isDark ? "text-slate-400" : "text-gray-600"}`}>
                            Refund Method
                          </label>
                          <select
                            value={form.payment_method || "cash"}
                            onChange={(e) => setForm((prev) => ({ ...prev, payment_method: e.target.value, account_id: "" }))}
                            className={`w-full h-7 rounded border px-1.5 text-[11px] ${
                              isDark ? "border-slate-600 bg-slate-700 text-slate-200" : "border-gray-300 bg-white text-gray-800"
                            }`}
                          >
                            <option value="cash">Cash (Drawer)</option>
                            <option value="bank_transfer">Bank Transfer</option>
                            <option value="card">Card / POS</option>
                            <option value="mobile_wallet">Mobile Wallet</option>
                          </select>
                        </div>
                        <div>
                          <label className={`block text-[9px] font-medium mb-0.5 ${isDark ? "text-slate-400" : "text-gray-600"}`}>
                            Account
                          </label>
                          <select
                            value={form.account_id || ""}
                            onChange={(e) => setForm((prev) => ({ ...prev, account_id: e.target.value }))}
                            className={`w-full h-7 rounded border px-1.5 text-[11px] ${
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
                        </div>
                      </div>
                    )}
                  </div>
                </td>
              </tr>
              <tr>
                <td colSpan={6} className={`p-2 ${isDark ? "bg-slate-800" : "bg-white"}`}>
                  <div className="flex justify-end gap-2">
                    <button
                      type="button"
                      onClick={handleCancel}
                      className={`px-6 py-3 text-sm font-medium transition-all duration-200 ${btnGlass.className}`}
                      style={btnGlass.style}
                    >
                      Cancel
                    </button>
<button
                      type="button"
                      onClick={handleSubmit}
                      className={`px-8 py-3 text-sm font-semibold transition-all duration-200 ${btnPrimary.className}`}
                      style={btnPrimary.style}
                    >
                      {returnId ? "Update Return" : "Create Return"}
                    </button>
                  </div>
                </td>
              </tr>
            </tbody>
          </table>
        </div>

          </div>
        </div>
        {/* Customer Search Modal */}
        <CustomerSearch
          isOpen={customerSearchOpen}
          onClose={() => setCustomerSearchOpen(false)}
          onSelect={(customer) => {
            handleSelectChange("customer_id", { value: customer?.id });
          }}
        />

        {/* Sale Invoice Search Modal */}
        <SaleInvoiceSearch
          isOpen={invoiceSearchOpen}
          onClose={() => setInvoiceSearchOpen(false)}
          customerId={form.customer_id || undefined}
          onSelect={(invoice) => {
            handleSelectChange("sale_invoice_id", { value: invoice?.id, customer_id: invoice?.customer_id });
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
