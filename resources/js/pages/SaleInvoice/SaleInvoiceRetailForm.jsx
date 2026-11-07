import { useInvoiceErrors, InvoiceErrorSummary, InvoiceRowError } from "../../components/InvoiceErrors";
// /src/pages/sales/SaleInvoiceRetailForm.jsx - Retail Sale Invoice Form (hardcoded retail mode)
import { lazy, Suspense, useEffect, useRef, useState, useMemo } from "react";
import { useNavigate, Link } from "react-router-dom";
import axios from "axios";
import Select from "react-select";
import { TrashIcon, PlusIcon, CubeIcon, HashtagIcon, CheckIcon, QrCodeIcon, ArrowsRightLeftIcon } from "@heroicons/react/24/outline";
import toast from "react-hot-toast";
import ProductSearchInput from "../../components/ProductSearchInput.jsx";
import BatchSearchInput from "../../components/BatchSearchInput.jsx";
import CustomerSearch from "../../components/CustomerSearch.jsx";
import { recalcItem, recalcFooter } from "../../Formula/SaleInvoice.js";
import { useTheme } from "@/context/ThemeContext";
import { getThemeButtonClasses } from "@/utils/buttonStyles";
import { useSaleSystem } from "@/context/SaleSystemContext.jsx";
import { useInvoiceDraft } from "@/hooks/useInvoiceDraft.js";
import { useCurrency } from "@/context/CurrencyContext.jsx";
import { usePermissions } from "@/api/usePermissions.js";
import InvoiceDraftIndicator from "@/components/InvoiceDraftIndicator.jsx";
import PaymentAccountSelector from "../../components/PaymentAccountSelector.jsx";
import { printSlipUrl } from "@/utils/printHelper.js";

const SubstituteProductsModal = lazy(() => import("../../components/SubstituteProductsModal.jsx"));
const InvoiceDraftsModal = lazy(() => import("@/components/InvoiceDraftsModal.jsx"));
const PreShiftDrawerPromptModal = lazy(() => import("@/components/PreShiftDrawerPromptModal.jsx"));
const CreditOverrideModal = lazy(() => import("@/components/CreditOverrideModal.jsx"));
const DiscountOverrideModal = lazy(() => import("@/components/DiscountOverrideModal.jsx"));
const ExpiredStockOverrideModal = lazy(() => import("@/components/ExpiredStockOverrideModal.jsx"));

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

export const PAYMENT_METHOD_OPTIONS = [
  { value: "cash", label: "Cash" },
  { value: "card", label: "Card / POS" },
  { value: "bank_transfer", label: "Bank Transfer" },
  { value: "cheque", label: "Cheque" },
  { value: "mobile_wallet", label: "Mobile Wallet" },
  { value: "other", label: "Other" },
];

/* -------- utils (unchanged) -------- */
const normalizeFormLoaded = (f) => {
  const safe = { ...f };
  safe.invoice_type = safe.invoice_type ?? "debit";
  safe.sale_type = "retail"; // Always retail for this form
  safe.wholesale_type = safe.wholesale_type ?? "unit";
  safe.remarks = safe.remarks ?? "";
  safe.doctor_name = safe.doctor_name ?? "";
  safe.patient_name = safe.patient_name ?? "";
  safe.date = safe.date ?? new Date().toISOString().split("T")[0];
  safe.due_date = safe.due_date ?? "";
  safe.discount_percentage = safe.discount_percentage ?? "";
  safe.discount_amount = safe.discount_amount ?? "";
  safe.tax_percentage = safe.tax_percentage ?? "";
  safe.tax_amount = safe.tax_amount ?? "";
  safe.item_discount = safe.item_discount ?? "";
  safe.gross_amount = safe.gross_amount ?? "";
  safe.total = safe.total ?? "";
  safe.total_receive =
    safe.invoice_type !== "credit" && safe.total !== ""
      ? String(Math.round(Number(safe.total || 0)))
      : (safe.total_receive ?? "");
  safe.cash_given = safe.cash_given ?? "";
  safe.payment_method = safe.payment_method ?? "cash";
  safe.account_id = safe.account_id ?? null;
  safe.items = Array.isArray(safe.items)
    ? safe.items.map((it, idx) => {
        const isUnbatched = Boolean(it?.is_unbatched || (!it?.batch_number && it?.product_id));
        return {
          id: it?.id ?? `row_${Date.now()}_${idx}_${Math.random().toString(36).substr(2, 9)}`,
          product_id: it?.product_id ?? "",
          product_name: it?.product_name ?? it?.product?.name ?? "",
          product: it?.product ?? null,
          pack_size: it?.pack_size ?? "",
          batch_number: it?.batch_number ?? "",
          is_unbatched: isUnbatched,
          expiry: it?.expiry ?? "",
          current_quantity: it?.current_quantity ?? "",
          quantity: it?.quantity ?? "",
          price: it?.price ?? "",
          item_discount_percentage: it?.item_discount_percentage ?? "",
          sub_total: it?.sub_total ?? "",
          is_narcotic: it?.is_narcotic ?? it?.narcotic === "yes" ?? false,
          is_custom_price: it?.is_custom_price ?? false,
        };
      })
    : [];
  return safe;
};


export default function SaleInvoiceRetailForm({ saleId, onSuccess }) {
  // Helper to generate unique ID for rows
  const generateRowId = () => `row_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`;
  const { loading: permsLoading, has } = usePermissions();
  const canPos = !permsLoading && (has("barcode-pos.view") || has("barcode-pos.create"));

  /* -------- state -------- */
  const [customers, setCustomers] = useState([]);
  const customersRef = useRef([]);
  useEffect(() => {
    customersRef.current = customers;
  }, [customers]);

  const getDefaultCustomerId = (list = customersRef.current || customers) => {
    if (!Array.isArray(list) || list.length === 0) return "";
    const walkIn = list.find((c) => /walk[\s\-_]*in/i.test(String(c?.name || "")));
    if (walkIn?.id) return walkIn.id;
    const sorted = [...list].sort((a, b) => (a?.id ?? 0) - (b?.id ?? 0));
    return sorted[0]?.id || "";
  };

  const WALK_IN_CREDIT_ERROR =
    "Walk-In Customer bills cannot be saved with unpaid credit (Udhar)—select or create a named Customer if the bill is not paid in full.";

  const isWalkInCustomer = (cust) =>
    Boolean(cust && /walk[\s\-_]*in/i.test(String(cust.name || "").trim()));

  const [form, setForm] = useState({
    invoice_type: "debit",
    sale_type: "retail", // Hardcoded to retail
    wholesale_type: "unit",
    customer_id: "",
    posted_number: "",
    date: new Date().toISOString().split("T")[0],
    due_date: "",
    remarks: "",
    doctor_name: "",
    patient_name: "",
    discount_percentage: "",
    discount_amount: "",
    tax_percentage: "",
    tax_amount: "",
    item_discount: "",
    gross_amount: "",
    total: "",
    total_receive: "",
    cash_given: "",
    payment_method: "cash",
    account_id: null,
    items: [
      {
        id: generateRowId(),
        product_id: "",
        pack_size: "",
        batch_number: "",
        expiry: "",
        current_quantity: "",
        quantity: "",
        price: "",
        item_discount_percentage: "",
        sub_total: "",
        is_narcotic: false,
        is_custom_price: false,
      },
    ],
  });
  const invoiceErrors = useInvoiceErrors(form.items);

  // State to store product data for validation
  const [productDataCache, setProductDataCache] = useState({});
  const [receiveTouched, setReceiveTouched] = useState(false);
  const [marginPct, setMarginPct] = useState("");
  const [focusedRowIndex, setFocusedRowIndex] = useState(0);
  const [originalItems, setOriginalItems] = useState({}); // Store original items for edit mode to calculate available quantity correctly
  const [customerSearchOpen, setCustomerSearchOpen] = useState(false);
  const [drawerPrompt, setDrawerPrompt] = useState(null);
  const [customerCreditSummary, setCustomerCreditSummary] = useState(null);
  const [creditOverridePrompt, setCreditOverridePrompt] = useState(null);
  const [discountOverridePrompt, setDiscountOverridePrompt] = useState(null);
  const [expiredOverridePrompt, setExpiredOverridePrompt] = useState(null);
  const originalInvoiceMetaRef = useRef(null);
  const navigate = useNavigate();

  const handleStartBlank = () => {
    if (draftHook?.resetToNew) draftHook.resetToNew();
    const defaultCustId = getDefaultCustomerId();
    setReceiveTouched(false);
    setMarginPct("");
    setFocusedRowIndex(0);
    invoiceErrors.clear();
    setForm(normalizeFormLoaded({
      invoice_type: "debit",
      sale_type: "retail",
      wholesale_type: "unit",
      customer_id: defaultCustId,
      posted_number: "",
      date: new Date().toISOString().split("T")[0],
      due_date: "",
      remarks: "",
      doctor_name: "",
      patient_name: "",
      discount_percentage: "",
      discount_amount: "",
      tax_percentage: "",
      tax_amount: "",
      item_discount: "",
      gross_amount: "",
      total: "",
      total_receive: "",
      cash_given: "",
      payment_method: "cash",
      account_id: null,
      items: [
        {
          id: generateRowId(),
          product_id: "",
          pack_size: "",
          batch_number: "",
          expiry: "",
          current_quantity: "",
          quantity: "",
          price: "",
          item_discount_percentage: "",
          sub_total: "",
          is_narcotic: false,
          is_custom_price: false,
        },
      ],
    }));
    setTimeout(() => {
      productRefs.current[0]?.querySelector?.("input")?.focus?.();
    }, 60);
  };

  const draftHook = useInvoiceDraft({
    type: "sale_retail",
    form,
    setForm,
    enabled: !saleId,
    onStartBlank: () => handleStartBlank(),
    onDraftLoaded: async (loadedPayload, draft, responseData) => {
      if (Array.isArray(responseData?.products) && responseData.products.length > 0) {
        upsertProducts(responseData.products);
      }
      const loaded = normalizeFormLoaded(loadedPayload);
      if (!loaded.customer_id && loaded.invoice_type !== "credit") {
        loaded.customer_id = getDefaultCustomerId();
      }
      await ensureProductsForItems(loaded?.items || []);
      await ensureBatchesForItems(loaded?.items || []);
      setForm(loaded);
      focusedOnce.current = true;

      // Close product search modal if open
      if (typeof window !== "undefined") {
        window.dispatchEvent(new CustomEvent("product-search:close"));
      }

      // Focus the last row's quantity field
      const lastIdx = Math.max(0, (loaded?.items?.length || 1) - 1);
      setFocusedRowIndex(lastIdx);
      let retries = 0;
      const tryFocus = () => {
        const el = qtyRefs.current[lastIdx];
        if (el && typeof el.focus === "function") {
          el.focus();
          el.select?.();
          el.scrollIntoView?.({ block: "nearest" });
        } else if (retries < 10) {
          retries++;
          setTimeout(tryFocus, 50);
        }
      };
      setTimeout(tryFocus, 60);
    },
  });

  // Calculate margin based on sale type (retail) - use focused row
  useEffect(() => {
    const rowIndex = focusedRowIndex >= 0 && focusedRowIndex < form.items.length ? focusedRowIndex : 0;
    if (form.items.length > 0 && form.items[rowIndex].product_id) {
      const focusedItem = form.items[rowIndex];
      if (focusedItem.price) {
        // For retail, use the cached product margin
        const productData = productDataCache[focusedItem.product_id];
        if (productData?.margin) {
          setMarginPct(sanitizeNumberInput(String(productData.margin), true));
          return;
        }
      }
    }
    setMarginPct("");
  }, [form.items, productDataCache, focusedRowIndex]);

  useEffect(() => {
    setMarginPct("");
    setReceiveTouched(false);
    setOriginalItems({}); // Clear original items when creating a new invoice
  }, [saleId]);


  const [products, setProducts] = useState([]);
  const [batchesByProduct, setBatchesByProduct] = useState({});
  const byIdsSupportedRef = useRef(true);

  // refs for grid navigation
  const productRefs = useRef([]);
  const batchRefs = useRef([]);
  const qtyRefs = useRef([]);
  const priceRefs = useRef([]);
  const discRefs = useRef([]);
  const focusedOnce = useRef(false);

  // scroll container ref for the items table
  const itemsScrollRef = useRef(null);

  /* -------- effects -------- */
  useEffect(() => {
    (async () => {
      const params = new URLSearchParams(window.location.search);
      const regularCustomerId = params.get("regular_customer_id");

      await Promise.all([fetchCustomers(), fetchProducts()]);
      if (saleId) {
        await fetchSale();
      } else if (regularCustomerId) {
        focusedOnce.current = true;
        await loadRegularCustomerItems(regularCustomerId);
      }
      // focus first product on brand new form (unless resuming a draft from URL)
      setTimeout(() => {
        const hasDraftInUrl = Boolean(params.get("draft_id"));
        if (hasDraftInUrl || regularCustomerId) {
          focusedOnce.current = true;
          return;
        }
        if (!focusedOnce.current && !saleId) {
          productRefs.current[0]?.querySelector?.("input")?.focus?.();
          focusedOnce.current = true;
        }
      }, 60);
    })();
  }, [saleId]);

  // Ctrl+S / Ctrl+Enter / F9 save, Ctrl+T toggle Debit/Credit, Ctrl+C customer search, Ctrl+R toggle Retail/Wholesale, Ctrl+N add row (edit mode)
  useEffect(() => {
    const handle = (e) => {
      const isCtrl = (e.ctrlKey || e.metaKey) && !e.shiftKey && !e.altKey;
      const key = (e.key || "").toLowerCase();
      if (isCtrl && (key === "p" || e.code === "KeyP")) {
        e.preventDefault();
        handleSubmit(e, { printAfterSave: true });
        return;
      }
      if (e.defaultPrevented) return;
      if ((isCtrl && (key === "s" || e.key === "Enter")) || e.key === "F9") {
        e.preventDefault();
        handleSubmit(e);
      } else if (isCtrl && key === "t") {
        e.preventDefault();
        handleInvoiceTypeChange(form.invoice_type === "debit" ? "credit" : "debit");
      } else if (isCtrl && key === "c") {
        const sel = window.getSelection?.()?.toString?.() || "";
        const el = document.activeElement;
        const hasInputSel =
          el && typeof el.selectionStart === "number" && el.selectionStart !== el.selectionEnd;
        if (!sel && !hasInputSel) {
          e.preventDefault();
          setCustomerSearchOpen(true);
        }
      } else if (isCtrl && key === "r" && !saleId) {
        e.preventDefault();
        navigate("/sale-invoices/create/wholesale");
      } else if (isCtrl && key === "n" && saleId) {
        e.preventDefault();
        const nextIdx = form.items.length;
        addRow();
        setTimeout(() => focusCell(nextIdx, "product"), 40);
      }
    };
    document.addEventListener("keydown", handle);
    return () => document.removeEventListener("keydown", handle);
  }, [form, saleId]);

  /* -------- helpers -------- */
  const to2 = (n) => Number(parseFloat(n || 0).toFixed(2));
  const asISODate = (s) => {
    if (!s) return "";
    const d = new Date(s);
    if (!isNaN(d.getTime())) return d.toISOString().slice(0, 10);
    const m = /^(\d{2})[\/-](\d{2})[\/-](\d{4})$/.exec(String(s));
    if (m) return `${m[3]}-${m[2]}-${m[1]}`;
    return String(s);
  };
  const sanitizeNumberInput = (value, allowDecimal = false, allowNegative = false) => {
    if (value === "") return "";
    const sign = allowNegative ? "-?" : "";
    const regex = allowDecimal
      ? new RegExp(`^${sign}\\d*\\.?\\d*$`)
      : new RegExp(`^${sign}\\d*$`);
    if (regex.test(value)) return value;
    return value.slice(0, -1);
  };
  const eqId = (a, b) => String(a ?? "") === String(b ?? "");
  const zeroToEmpty = (v) => (v === 0 || v === "0" ? "" : (v ?? ""));

  // Get dark mode state and theme colors
  const { isDark, theme } = useTheme();
  const { isPharmacy } = useSaleSystem();
  const [substituteModalTarget, setSubstituteModalTarget] = useState(null);

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

  const paymentSelectStyles = useMemo(() => ({
    control: (base, state) => ({
      ...base,
      minHeight: "28px",
      height: "28px",
      borderRadius: 6,
      backgroundColor: isDark ? "#334155" : "#ffffff",
      borderColor: state.isFocused
        ? (themeColors.primary || "#3b82f6")
        : (isDark ? "#475569" : "#e2e8f0"),
      boxShadow: "none",
      fontSize: "11px",
      fontWeight: 600,
    }),
    valueContainer: (base) => ({ ...base, padding: "0 6px", height: "26px" }),
    indicatorsContainer: (base) => ({ ...base, height: "26px" }),
    dropdownIndicator: (base) => ({ ...base, padding: 1 }),
    input: (base) => ({ ...base, color: isDark ? "#f8fafc" : "#1e293b", margin: 0, padding: 0 }),
    singleValue: (base) => ({ ...base, color: isDark ? "#f8fafc" : "#1e293b", fontSize: "11px" }),
    menuPortal: (base) => ({ ...base, zIndex: 9999 }),
    menu: (base) => ({
      ...base,
      backgroundColor: isDark ? "#1e293b" : "#ffffff",
      border: isDark ? "1px solid #334155" : "1px solid #e2e8f0",
      boxShadow: "0 10px 25px -5px rgba(0, 0, 0, 0.2)",
      borderRadius: 8,
      zIndex: 9999,
    }),
    option: (base, state) => ({
      ...base,
      backgroundColor: state.isSelected
        ? (themeColors.primary || "#3b82f6")
        : state.isFocused
        ? (isDark ? "#334155" : "#f1f5f9")
        : "transparent",
      color: state.isSelected ? "#ffffff" : (isDark ? "#f8fafc" : "#1e293b"),
      fontSize: "11px",
      padding: "4px 8px",
      cursor: "pointer",
    }),
  }), [isDark, themeColors]);

  // Dynamic Button styles using theme colors
  const buttonStyle = theme?.button_style || 'modern';
  
  const getButtonClasses = useMemo(
    () => getThemeButtonClasses(buttonStyle, themeColors, isDark),
    [buttonStyle, themeColors, isDark]
  );

  const btnPrimary = getButtonClasses.primary;
  const btnSecondary = getButtonClasses.secondary;
  const btnDanger = getButtonClasses.danger;

  const { formatCurrency } = useCurrency();
  const billTotal = Math.round(Number(form.total || 0));
  const cashGivenNum = form.cash_given !== "" && form.cash_given !== undefined ? Number(form.cash_given) : null;
  const changeToReturn = form.invoice_type === "credit"
    ? (cashGivenNum !== null && Number(form.total_receive || 0) < cashGivenNum ? cashGivenNum - Number(form.total_receive || 0) : 0)
    : (cashGivenNum !== null && cashGivenNum > billTotal ? cashGivenNum - billTotal : 0);
  const remainingDue = Math.max(0, billTotal - Math.round(Number(form.total_receive || 0)));
  const excessCredit = form.invoice_type === "credit" && Math.round(Number(form.total_receive || 0)) > billTotal
    ? Math.round(Number(form.total_receive || 0)) - billTotal
    : 0;

  const handleCashGivenChange = (raw) => {
    const val = sanitizeNumberInput(raw, true, false);
    const givenNum = Number(val || 0);
    const totalNum = Math.round(Number(form.total || 0));

    setForm((prev) => {
      const next = { ...prev, cash_given: val };
      if (prev.invoice_type !== "credit") {
        next.total_receive = String(totalNum);
      } else {
        if (val === "") {
          next.total_receive = "";
        } else {
          next.total_receive = String(givenNum);
        }
        setReceiveTouched(true);
      }
      return next;
    });
  };

/* -------- data -------- */
  const fetchCustomers = async () => {
    try {
      const res = await axios.get("/api/customers/search", { params: { limit: 50 } });
      let list = Array.isArray(res.data?.data) ? res.data.data : Array.isArray(res.data) ? res.data : [];
      // pick the LOWEST ID as default
      list = list.slice().sort((a, b) => (a?.id ?? 0) - (b?.id ?? 0));
      setCustomers(list);
      customersRef.current = list;
      if (!saleId && list.length > 0) {
        setForm((prev) => {
          if (!prev.customer_id && prev.invoice_type !== "credit") {
            const defId = getDefaultCustomerId(list);
            return defId ? { ...prev, customer_id: defId } : prev;
          }
          return prev;
        });
      }
    } catch {}
  };

  const fetchProducts = async (q = "") => {
    try {
      const { data } = await axios.get("/api/products/search", { params: { q, limit: 30 } });
      setProducts(Array.isArray(data?.data) ? data.data : Array.isArray(data) ? data : []);
    } catch {}
  };

  const fetchBatches = async (productId) => {
    if (!productId) return [];
    const key = String(productId);
    if (batchesByProduct[key]) return batchesByProduct[key];
    const normalizeBatch = (b) => ({
      id: b?.id,
      batch_number: String(b?.batch_number ?? b?.batch ?? b?.number ?? "").trim(),
      expiry: b?.expiry ?? b?.expiration_date ?? b?.expiry_date ?? "",
      expiry_date: b?.expiry_date ?? b?.expiry ?? "",
      available_units: Number(b?.available_units ?? b?.available_quantity ?? b?.quantity ?? 0),
      pack_size: Number(b?.pack_size ?? 0),
      unit_sale_price: b?.unit_sale_price != null ? Number(b.unit_sale_price) : null,
      pack_sale_price: b?.pack_sale_price != null ? Number(b.pack_sale_price) : null,
      is_expired: Boolean(b?.is_expired || (b?.expiry_date && b?.expiry_date < new Date().toISOString().slice(0, 10))),
      is_fefo_recommended: Boolean(b?.is_fefo_recommended),
      is_unbatched: Boolean(b?.is_unbatched),
    });
    try {
      const res = await axios.get(`/api/products/${productId}/batches?include_unbatched=1`);
      const raw = Array.isArray(res.data) ? res.data : [];
      let list = raw
        .map(normalizeBatch)
        .filter((x) => (x.batch_number || x.is_unbatched) && x.available_units > 0);

      // Extract unbatched units from response headers if present
      const headerUnbatched = Number(res.headers?.['x-unbatched-units'] ?? 0);
      const totalHeader = Number(res.headers?.['x-total-units'] ?? 0);
      const batchedHeader = Number(res.headers?.['x-batched-units'] ?? 0);
      const calculatedUnbatched = headerUnbatched > 0 
        ? headerUnbatched 
        : (totalHeader > 0 ? Math.max(0, totalHeader - batchedHeader) : 0);

      if (calculatedUnbatched > 0 && !list.some((x) => x.is_unbatched)) {
        list.push({
          id: null,
          batch_number: "",
          expiry: "",
          expiry_date: "",
          available_units: calculatedUnbatched,
          pack_size: 0,
          is_expired: false,
          is_fefo_recommended: false,
          is_unbatched: true,
        });
      }

      setBatchesByProduct((m) => ({ ...m, [key]: list }));
      return list;
    } catch {
      setBatchesByProduct((m) => ({ ...m, [key]: [] }));
      return [];
    }
  };

  const loadRegularCustomerItems = async (regularCustomerId) => {
    try {
      const { data: customer } = await axios.get(`/api/customers/${regularCustomerId}`);
      if (!customer || !customer.id) return;

      setCustomers((prev) => {
        const exists = prev.some((c) => String(c.id) === String(customer.id));
        return exists ? prev : [customer, ...prev];
      });

      const rawItems = customer.regular_items || customer.regularItems || [];
      if (!Array.isArray(rawItems) || rawItems.length === 0) {
        setForm((prev) => ({
          ...prev,
          customer_id: customer.id,
          patient_name: customer.name || prev.patient_name || "",
        }));
        toast("Customer selected, but no regular products are attached to their profile.");
        return;
      }

      const loadedProducts = [];
      const builtRows = [];

      for (const regItem of rawItems) {
        const productId = Number(regItem.product_id || 0);
        if (!productId) continue;

        let prodData = regItem.product || null;
        try {
          const { data: freshProd } = await axios.get(`/api/products/${productId}`);
          if (freshProd?.id) {
            prodData = freshProd;
          }
        } catch {
          // fallback to regItem.product
        }

        if (prodData?.id) {
          loadedProducts.push(prodData);
          setProductDataCache((prev) => ({
            ...prev,
            [productId]: {
              pack_purchase_price: prodData?.pack_purchase_price || 0,
              unit_sale_price: prodData?.unit_sale_price || 0,
              margin:
                prodData?.margin ||
                prodData?.margin_percentage ||
                prodData?.default_margin ||
                "",
            },
          }));
        }

        const packSize = Math.max(
          1,
          Number(prodData?.pack_size ?? regItem.pack_size ?? 1)
        );
        const neededUnits =
          Number(regItem.unit_quantity || 0) > 0
            ? Number(regItem.unit_quantity)
            : Math.max(
                1,
                Math.round(Number(regItem.pack_quantity || 0) * packSize)
              );

        const baseAvailable = Number(
          prodData?.quantity ??
            prodData?.available_units ??
            regItem.on_hand_units ??
            0
        );
        const defaultUnitPrice =
          Number(prodData?.unit_sale_price || 0) ||
          (Number(prodData?.pack_sale_price || 0) > 0
            ? Number((Number(prodData.pack_sale_price) / packSize).toFixed(2))
            : 0);
        const isNarcotic = prodData?.narcotic === "yes";

        const batchList = await fetchBatches(productId);
        const assignedBatches = (batchList || []).filter(
          (b) =>
            !b.is_unbatched &&
            b.batch_number &&
            String(b.batch_number).trim() !== ""
        );
        const hasAssignedBatches = assignedBatches.length > 0;
        const hasBatches = Array.isArray(batchList) && batchList.length > 0;

        const candidateBatches = hasBatches
          ? [
              ...batchList.filter(
                (b) => !b.is_unbatched && !b.is_expired && b.available_units > 0
              ),
              ...batchList.filter(
                (b) => b.is_unbatched && b.available_units > 0
              ),
              ...batchList.filter(
                (b) => !b.is_unbatched && b.is_expired && b.available_units > 0
              ),
            ]
          : [];

        if (
          candidateBatches.length > 1 &&
          candidateBatches[0].available_units < neededUnits
        ) {
          let remaining = neededUnits;
          for (
            let bIdx = 0;
            bIdx < candidateBatches.length && remaining > 0;
            bIdx++
          ) {
            const b = candidateBatches[bIdx];
            const isLastCandidate = bIdx === candidateBatches.length - 1;
            const takeQty = isLastCandidate
              ? remaining
              : Math.min(
                  remaining,
                  Math.max(0, Number(b.available_units || 0))
                );
            if (takeQty <= 0) continue;
            remaining -= takeQty;

            const isUnbatched = Boolean(b.is_unbatched);
            const effPrice =
              !isUnbatched && Number(b.unit_sale_price) > 0
                ? Number(b.unit_sale_price)
                : defaultUnitPrice;

            builtRows.push(
              recalcItem(
                {
                  id: generateRowId(),
                  product_id: productId,
                  product_name: prodData?.name || "",
                  product: prodData,
                  pack_size: packSize,
                  price: effPrice,
                  batch_number: isUnbatched ? "" : b.batch_number || "",
                  is_unbatched: isUnbatched,
                  expiry: isUnbatched ? "" : b.expiry || b.expiry_date || "",
                  current_quantity: String(b.available_units ?? baseAvailable),
                  quantity: String(takeQty),
                  item_discount_percentage: "",
                  sub_total: "",
                  is_narcotic: isNarcotic,
                  is_custom_price: false,
                },
                "product_select"
              )
            );
          }
        } else {
          const fefoBatch =
            candidateBatches[0] || (hasBatches ? batchList[0] : null);
          const allocatedIsUnbatched = !hasAssignedBatches
            ? true
            : Boolean(fefoBatch?.is_unbatched);
          const allocatedBatchNumber =
            !hasAssignedBatches || allocatedIsUnbatched
              ? ""
              : fefoBatch?.batch_number || "";
          const allocatedExpiry =
            !hasAssignedBatches || allocatedIsUnbatched
              ? ""
              : fefoBatch?.expiry || fefoBatch?.expiry_date || "";
          const batchAvailable = fefoBatch?.available_units ?? baseAvailable;
          const effPrice =
            !allocatedIsUnbatched &&
            fefoBatch &&
            Number(fefoBatch.unit_sale_price) > 0
              ? Number(fefoBatch.unit_sale_price)
              : defaultUnitPrice;

          builtRows.push(
            recalcItem(
              {
                id: generateRowId(),
                product_id: productId,
                product_name: prodData?.name || "",
                product: prodData,
                pack_size: packSize,
                price: effPrice,
                batch_number: allocatedBatchNumber,
                is_unbatched: allocatedIsUnbatched,
                expiry: allocatedExpiry,
                current_quantity: String(batchAvailable),
                quantity: String(neededUnits),
                item_discount_percentage: "",
                sub_total: "",
                is_narcotic: isNarcotic,
                is_custom_price: false,
              },
              "product_select"
            )
          );
        }
      }

      if (loadedProducts.length > 0) {
        upsertProducts(loadedProducts);
      }

      if (builtRows.length > 0) {
        setForm((prev) => {
          const next = recalcFooter(
            {
              ...prev,
              customer_id: customer.id,
              patient_name: customer.name || prev.patient_name || "",
              remarks: customer.regular_notes || prev.remarks || "",
              items: builtRows,
            },
            "items"
          );
          if (prev.invoice_type !== "credit") {
            next.total_receive = next.total ?? "";
          }
          return next;
        });

        toast.success(
          `Shifted ${builtRows.length} regular item(s) for ${customer.name} into Retail Sale Invoice!`
        );

        const lastIdx = Math.max(0, builtRows.length - 1);
        setFocusedRowIndex(lastIdx);
        setTimeout(() => {
          const el = qtyRefs.current[lastIdx];
          if (el && typeof el.focus === "function") {
            el.focus();
            el.select?.();
          }
        }, 80);
      }
    } catch (err) {
      toast.error(
        err?.response?.data?.message || "Failed to load regular customer items"
      );
    } finally {
      if (typeof window !== "undefined") {
        window.dispatchEvent(new CustomEvent("product-search:close"));
        setTimeout(() => {
          window.__isResumingInvoiceDraft = false;
        }, 400);
      }
    }
  };

  const fetchSale = async () => {
    const res = await axios.get(`/api/sale-invoices/${saleId}`);
    originalInvoiceMetaRef.current = {
      created_at: res.data.created_at,
      date: res.data.date,
      payment_method: res.data.payment_method,
      invoice_type: res.data.invoice_type,
      total_receive: res.data.total_receive,
      total: res.data.total,
    };
    const loaded = normalizeFormLoaded(res.data);
    if (res.data?.customer?.id) {
      setCustomers((prev) => {
        const exists = prev.some((c) => String(c.id) === String(res.data.customer.id));
        return exists ? prev : [res.data.customer, ...prev];
      });
    }
    const tr = Math.round(Number(loaded?.total_receive ?? 0));
    const tt = Math.round(Number(loaded?.total ?? 0));
    const shouldSync = loaded?.invoice_type !== "credit" || loaded?.total_receive === "" || tr === tt;
    
    await ensureProductsForItems(loaded?.items || []);
    const batchMap = await ensureBatchesForItems(loaded?.items || []);
    
    // Store original items for edit mode to calculate available quantity correctly
    // When editing, current available quantity should include the quantity sold in this invoice
    const originalItemsMap = {};
    if (loaded?.items && Array.isArray(loaded.items)) {
      loaded.items = loaded.items.map((item) => {
        if (!item.product_id) return item;
        const pKey = String(item.product_id);
        const batchList = batchMap[pKey] || batchesByProduct[pKey] || [];
        
        let matchingBatch = null;
        if (item.is_unbatched) {
          matchingBatch = batchList.find((b) => b.is_unbatched);
        } else if (item.batch_number) {
          matchingBatch = batchList.find((b) => String(b.batch_number).trim() === String(item.batch_number).trim());
        }
        
        const warehouseUnits = Number(matchingBatch?.available_units ?? 0);
        const origQty = Number(item.quantity || 0);
        const effectiveAvailable = warehouseUnits + origQty;

        // Populate originalItemsMap (summed across multiple rows for the same product)
        const currentOrig = originalItemsMap[item.product_id] || { quantity: 0, batch_number: item.batch_number };
        originalItemsMap[item.product_id] = {
          quantity: currentOrig.quantity + origQty,
          batch_number: item.batch_number,
        };

        // Ensure batchesByProduct contains this batch/unassigned with the restored units for this invoice
        setBatchesByProduct((m) => {
          const list = m[pKey] || [];
          const exists = list.some((b) =>
            item.is_unbatched ? b.is_unbatched : String(b.batch_number).trim() === String(item.batch_number).trim()
          );
          if (exists) {
            return {
              ...m,
              [pKey]: list.map((b) => {
                const isMatch = item.is_unbatched
                  ? b.is_unbatched
                  : String(b.batch_number).trim() === String(item.batch_number).trim();
                return isMatch ? { ...b, available_units: Number(b.available_units || 0) + origQty } : b;
              }),
            };
          } else {
            return {
              ...m,
              [pKey]: [
                ...list,
                {
                  id: null,
                  batch_number: item.is_unbatched ? "" : item.batch_number,
                  expiry: item.expiry || "",
                  expiry_date: item.expiry || "",
                  available_units: effectiveAvailable,
                  pack_size: Number(item.pack_size || 0),
                  is_expired: false,
                  is_fefo_recommended: false,
                  is_unbatched: Boolean(item.is_unbatched),
                },
              ],
            };
          }
        });

        return {
          ...item,
          current_quantity: String(effectiveAvailable),
        };
      });
    }
    setOriginalItems(originalItemsMap);
    
    setForm(loaded);
    setReceiveTouched(!shouldSync);
  };

  /* -------- handlers -------- */
  const handleInvoiceTypeChange = (type) => {
    setForm((prev) => {
      const next = { ...prev, invoice_type: type };
      // When switching to credit, clear customer_id to force selection
      // and set total_receive to 0 (true credit sale)
      if (type === "credit") {
        next.customer_id = "";
        next.total_receive = "";
        setReceiveTouched(true); // Mark as touched so it stays at 0
      } else {
        // Debit - auto-select default customer if none selected
        if (!next.customer_id && customers.length > 0) {
          next.customer_id = getDefaultCustomerId(customers);
        }
        // For debit, always sync total_receive with total and reset receiveTouched
        setReceiveTouched(false);
        next.total_receive = next.total ?? "";
      }
      return next;
    });
  };

  const handleCustomerSelect = (customer) => {
    if (!customer?.id) return;
    if (form.invoice_type === "credit" && isWalkInCustomer(customer)) {
      invoiceErrors.showMessage(WALK_IN_CREDIT_ERROR);
      return;
    }
    setCustomers((prev) => {
      const exists = prev.some((c) => String(c.id) === String(customer.id));
      return exists ? prev : [customer, ...prev];
    });
    const creditDays = Number(customer.credit_days ?? 0);
    let autoDueDate = undefined;
    if (creditDays > 0 && form.date) {
      const d = new Date(form.date);
      if (!isNaN(d.getTime())) {
        d.setDate(d.getDate() + creditDays);
        autoDueDate = d.toISOString().split("T")[0];
      }
    }
    setForm((prev) => ({
      ...prev,
      customer_id: customer.id,
      ...(autoDueDate ? { due_date: autoDueDate } : {}),
    }));
    setCustomerSearchOpen(false);
  };

  useEffect(() => {
    if (form.invoice_type === "credit" && form.customer_id) {
      let isMounted = true;
      axios
        .get(`/api/customers/${form.customer_id}/credit-summary`)
        .then((res) => {
          if (isMounted) setCustomerCreditSummary(res.data);
        })
        .catch(() => {
          if (isMounted) setCustomerCreditSummary(null);
        });
      return () => {
        isMounted = false;
      };
    } else {
      setCustomerCreditSummary(null);
    }
  }, [form.invoice_type, form.customer_id]);

  useEffect(() => {
    if (form.invoice_type === "credit" && form.customer_id && !form.due_date && form.date) {
      const cust = (customers || []).find((c) => String(c.id) === String(form.customer_id));
      const creditDays = Number(cust?.credit_days ?? 0);
      if (creditDays > 0) {
        const d = new Date(form.date);
        if (!isNaN(d.getTime())) {
          d.setDate(d.getDate() + creditDays);
          const computedDue = d.toISOString().split("T")[0];
          setForm((prev) => ({ ...prev, due_date: computedDue }));
        }
      }
    }
  }, [form.invoice_type, form.customer_id, form.date, customers]);

  // Retail form - no sale type change handler needed (always retail)
  const handleSaleTypeChange = (type) => {
    // This form is always retail, ignore wholesale switch
    if (type === "wholesale") {
      invoiceErrors.showMessage("Please use Wholesale form for wholesale sales");
      return;
    }
  };

  const handleHeaderChange = (e) => {
    const { name, value } = e.target;
    // allow negatives for these summary fields
    const negativeFields = new Set([
      "discount_percentage",
      "discount_amount",
      "tax_percentage",
      "tax_amount",
    ]);
    const allowNegative = negativeFields.has(name);
    const decimalFields = new Set([
      "discount_percentage",
      "discount_amount",
      "tax_percentage",
      "tax_amount",
    ]);
    const v = decimalFields.has(name)
      ? sanitizeNumberInput(value, true, allowNegative)
      : value;
    const tmp = { ...form, [name]: v };
    let next = recalcFooter(tmp, name);
    next[name] = v;
    // For debit sales, always keep total_receive synced to total; for credit, keep empty if untouched
    if (form.invoice_type !== "credit") next.total_receive = next.total ?? "";
    if (!receiveTouched && form.invoice_type === "credit") next.total_receive = "";
    setForm(next);
  };

  function handleItemChange(index, field, rawValue) {
    let value = rawValue;
    const allowNegative = field === "item_discount_percentage";
    if (field === "price" || field === "item_discount_percentage") {
      value = sanitizeNumberInput(value, true, allowNegative);
      if (field === "item_discount_percentage" && (value === "-" || value === "-."))
        return setForm((prev) => {
          const items = [...prev.items];
          items[index] = { ...items[index], item_discount_percentage: value };
          return { ...prev, items };
        });
    } else if (field === "quantity" || field === "pack_size") {
      value = sanitizeNumberInput(value, false, false);
    }
    setForm((prev) => {
      const items = [...prev.items];
      let row = recalcItem({ ...items[index], [field]: value }, field);
      if (field === "item_discount_percentage") row.item_discount_percentage = value;
      items[index] = row;
      let updated = recalcFooter({ ...prev, items }, "items");
      if (prev.invoice_type !== "credit") updated.total_receive = updated.total ?? "";
      if (!receiveTouched && prev.invoice_type === "credit") updated.total_receive = "";
      return updated;
    });
  }

  const addRow = () => {
    setForm((prev) => {
      const next = {
        ...prev,
        items: [
          ...prev.items,
          {
            id: generateRowId(),
            product_id: "",
            pack_size: "",
            batch_number: "",
            expiry: "",
            current_quantity: "",
            quantity: "",
            price: "",
            item_discount_percentage: "",
            sub_total: "",
            is_narcotic: false,
            is_custom_price: false,
          },
        ],
      };
      if (prev.invoice_type !== "credit" || !receiveTouched) {
        const afterFooter = recalcFooter(next, "items");
        if (prev.invoice_type !== "credit") {
          afterFooter.total_receive = afterFooter.total ?? "";
        } else {
          afterFooter.total_receive = "";
        }
        return afterFooter;
      }

      return next;
    });
  };

  const removeRow = (i) => {
    if (form.items.length <= 1) return;
    const items = form.items.filter((_, idx) => idx !== i);
    let next = recalcFooter({ ...form, items }, "items");
    if (form.invoice_type !== "credit") next.total_receive = next.total ?? "";
    if (!receiveTouched && form.invoice_type === "credit") next.total_receive = "";
    setForm(next);
  };

  const resolveId = (val) =>
    typeof val === "object" ? val?.id ?? val?.value ?? val?.product_id : val;

  const resetRow = (rowIndex) => {
    setForm((prev) => {
      const items2 = [...prev.items];
      items2[rowIndex] = recalcItem(
        {
          product_id: "",
          pack_size: "",
          price: "",
          batch_number: "",
          expiry: "",
          current_quantity: "",
          quantity: "",
          sub_total: "",
          item_discount_percentage: "",
          is_narcotic: false,
          is_custom_price: false,
        },
        "revert_duplicate_product"
      );
      let next = recalcFooter({ ...prev, items: items2 }, "items");
      if (prev.invoice_type !== "credit") next.total_receive = next.total ?? "";
      if (!receiveTouched && prev.invoice_type === "credit") next.total_receive = "";
      return next;
    });
  };

  const handleProductSelect = async (rowIndex, productIdOrObj) => {
    const productId = resolveId(productIdOrObj);
    if (!productId && productId !== 0) return;

    const currentRowProductId = form.items[rowIndex]?.product_id;

    const selected =
      products.find((p) => eqId(p.id, productId)) ||
      (typeof productIdOrObj === "object" ? productIdOrObj : {}) ||
      {};

    // Ensure we have the narcotic field - fetch from API if not present
    let isNarcotic = selected?.narcotic === "yes";
    let freshProductData = null;
    
    if (productId) {
      try {
        const { data } = await axios.get(`/api/products/${productId}`);
        isNarcotic = data?.narcotic === "yes";
        freshProductData = data;
        
        // Cache the product data for validation
        setProductDataCache(prev => ({
          ...prev,
          [productId]: {
            pack_purchase_price: data?.pack_purchase_price || 0,
            unit_sale_price: data?.unit_sale_price || 0,
            margin: data?.margin || data?.margin_percentage || data?.default_margin || "",
          }
        }));
      } catch {
        // If API fails, use cached data
        if (selected) {
          setProductDataCache(prev => ({
            ...prev,
            [productId]: {
              pack_purchase_price: selected?.pack_purchase_price || 0,
              unit_sale_price: selected?.unit_sale_price || 0,
              margin: selected?.margin || selected?.margin_percentage || selected?.default_margin || "",
            }
          }));
        }
      }
    }

    const rawMargin = freshProductData?.margin ?? selected?.margin ?? selected?.margin_percentage ?? selected?.default_margin ?? "";
    setMarginPct(sanitizeNumberInput(String(rawMargin), true));
    const packSize = freshProductData?.pack_size ?? selected?.pack_size ?? "";
    
    // Use fresh product data if available, otherwise fall back to cached data
    const baseAvailable = freshProductData?.quantity ?? freshProductData?.available_units ?? selected?.quantity ?? selected?.available_units ?? 0;
    
    // In edit mode, add back the original quantity sold for this product
    // This ensures available quantity = current stock + quantity sold in this invoice
    const originalItem = originalItems[productId];
    const originalQty = originalItem ? originalItem.quantity : 0;
    const displayAvailable = Number(baseAvailable) + originalQty;
    
    // Retail mode: use unit_sale_price
    let price = freshProductData?.unit_sale_price ?? selected?.unit_sale_price ?? "";
    let isCustomPrice = false;

    const batchList = await fetchBatches(productId);
    const assignedBatches = (batchList || []).filter(
      (b) => !b.is_unbatched && b.batch_number && String(b.batch_number).trim() !== ""
    );
    const hasAssignedBatches = assignedBatches.length > 0;
    const hasBatches = Array.isArray(batchList) && batchList.length > 0;

    const usedOnOtherRowsPre = (form.items || [])
      .filter((r, idx) => idx !== rowIndex && eqId(r.product_id, productId))
      .map((r) => (r.batch_number ? String(r.batch_number).trim() : (r.is_unbatched ? "__unbatched__" : "")));

    if (!hasBatches && usedOnOtherRowsPre.length > 0) {
      invoiceErrors.showMessage(`"${freshProductData?.name || selected?.name || 'This product'}" has no batches and is already added on row ${form.items.findIndex((r, idx) => idx !== rowIndex && eqId(r.product_id, productId)) + 1}.`);
      resetRow(rowIndex);
      setTimeout(() => {
        productRefs.current[rowIndex]?.querySelector?.("input")?.focus?.();
      }, 40);
      return;
    }

    const availableBatchesPre = (batchList || []).filter((b) => {
      const key = b.is_unbatched ? "__unbatched__" : String(b.batch_number).trim();
      return !usedOnOtherRowsPre.includes(key);
    });

    if (hasBatches && availableBatchesPre.length === 0 && usedOnOtherRowsPre.length > 0) {
      invoiceErrors.showMessage(`All batches and unassigned stock for "${freshProductData?.name || selected?.name || 'this product'}" are already allocated on earlier rows.`);
      resetRow(rowIndex);
      setTimeout(() => {
        productRefs.current[rowIndex]?.querySelector?.("input")?.focus?.();
      }, 40);
      return;
    }

    // Preserve existing values if re-selecting the same product
    const existingBatchNumber = eqId(currentRowProductId, productId)
      ? form.items[rowIndex]?.batch_number
      : "";
    const existingExpiry = eqId(currentRowProductId, productId)
      ? form.items[rowIndex]?.expiry
      : "";
    const existingIsUnbatched = eqId(currentRowProductId, productId)
      ? Boolean(form.items[rowIndex]?.is_unbatched)
      : false;

    if (freshProductData || (selected && selected.id)) {
      upsertProducts([freshProductData || selected]);
    }

    setForm((prev) => {
      const items = [...prev.items];
      
      // If quantity is empty (new product selection), preset it to 1
      // If re-selecting same product, keep the existing quantity
      const presetQty = eqId(currentRowProductId, productId)
        ? items[rowIndex].quantity
        : (items[rowIndex]?.quantity === "" || items[rowIndex]?.quantity == null
           ? "1"
           : items[rowIndex].quantity);
      
      // When re-selecting same product, preserve batch and expiry if they exist
      const shouldPreserveBatch = eqId(currentRowProductId, productId) && (existingBatchNumber || existingIsUnbatched);
      // Batches already used on other rows for this same product
      const usedOnOtherRows = items
        .filter((r, idx) => idx !== rowIndex && eqId(r.product_id, productId))
        .map((r) => (r.batch_number ? String(r.batch_number).trim() : (r.is_unbatched ? "__unbatched__" : "")));

      const availableBatches = (batchList || []).filter((b) => {
        const key = b.is_unbatched ? "__unbatched__" : String(b.batch_number).trim();
        return !usedOnOtherRows.includes(key);
      });

      // FEFO auto-allocation: prefer earliest non-expired batch with available stock; else unbatched or first
      const fefoBatch = hasBatches
        ? (availableBatches.find((b) => !b.is_unbatched && !b.is_expired && b.available_units > 0) ||
           availableBatches.find((b) => !b.is_unbatched && b.available_units > 0) ||
           availableBatches.find((b) => b.is_unbatched && b.available_units > 0) ||
           availableBatches[0] ||
           batchList[0])
        : null;
      const allocatedBatchNumber = shouldPreserveBatch
        ? existingBatchNumber
        : (!hasAssignedBatches ? "" : (fefoBatch && !fefoBatch.is_unbatched ? fefoBatch.batch_number : ""));
      const allocatedExpiry = shouldPreserveBatch
        ? existingExpiry
        : (!hasAssignedBatches ? "" : (fefoBatch && !fefoBatch.is_unbatched ? (fefoBatch.expiry || fefoBatch.expiry_date || "") : ""));
      const allocatedIsUnbatched = shouldPreserveBatch
        ? existingIsUnbatched
        : (!hasAssignedBatches ? true : Boolean(fefoBatch?.is_unbatched));
      const batchAvailable = fefoBatch?.available_units ?? displayAvailable;
      const fefoUnitSalePrice =
        fefoBatch && Number(fefoBatch.unit_sale_price) > 0
          ? Number(fefoBatch.unit_sale_price)
          : fefoBatch && Number(fefoBatch.pack_sale_price) > 0 && Number(packSize) > 0
          ? Number((Number(fefoBatch.pack_sale_price) / Number(packSize)).toFixed(2))
          : 0;
      const effectivePrice =
        !isCustomPrice && !allocatedIsUnbatched && fefoUnitSalePrice > 0
          ? fefoUnitSalePrice
          : price;
      
      items[rowIndex] = recalcItem(
        {
          ...items[rowIndex],
          product_id: productId,
          product_name: freshProductData?.name ?? selected?.name ?? items[rowIndex]?.product_name ?? "",
          product: freshProductData ?? (selected?.id ? selected : null),
          pack_size: packSize,
          price: effectivePrice,
          batch_number: allocatedBatchNumber,
          is_unbatched: allocatedIsUnbatched,
          expiry: allocatedExpiry,
          current_quantity: batchAvailable.toString(),
          quantity: presetQty,
          item_discount_percentage: items[rowIndex]?.item_discount_percentage ?? "",
          sub_total: items[rowIndex]?.sub_total ?? "",
          is_narcotic: isNarcotic,
          is_custom_price: isCustomPrice,
        },
        "product_select"
      );
      let next = recalcFooter({ ...prev, items }, "items");
      // For credit sales, total_receive stays at 0 if untouched; for debit, always sync with total
      if (prev.invoice_type !== "credit") next.total_receive = next.total ?? "";
      if (!receiveTouched && prev.invoice_type === "credit") next.total_receive = "";
      return next;
    });

    setTimeout(() => {
      if (hasAssignedBatches) {
        batchRefs.current[rowIndex]?.querySelector?.("input")?.focus?.();
      } else {
        qtyRefs.current[rowIndex]?.focus?.();
      }
    }, 40);
  };

  const handleBatchSelect = async (rowIndex, batchNum, batchObj = null) => {
    const row0 = form.items[rowIndex];
    if (!row0?.product_id) return;

    // Check if unbatched stock is selected
    if (
      batchObj?.is_unbatched ||
      batchNum === "" ||
      batchNum === "__unbatched__" ||
      batchNum === "[Unbatched Stock]" ||
      batchNum === "[Unassigned Stock]"
    ) {
      const batches = await fetchBatches(row0.product_id);
      const unbatchedItem = batchObj || (batches || []).find((x) => x.is_unbatched);
      let unbatchedAvailable = unbatchedItem?.available_units;
      if (unbatchedAvailable == null) {
        try {
          const res = await axios.get(`/api/products/available-quantity?product_id=${row0.product_id}&batch=`);
          unbatchedAvailable = Number(res?.data?.unbatched_units ?? res?.data?.available_units ?? 0);
        } catch {
          unbatchedAvailable = 0;
        }
      }
      handleBatchSelectWithCalculatedAvailable(rowIndex, "", unbatchedAvailable, "", true, unbatchedItem?.unit_sale_price);
      return;
    }
    
    try {
      const batches = await fetchBatches(row0.product_id);
      const b = batchObj || (batches || []).find((x) => String(x.batch_number) === String(batchNum));
      
      const batchExpiry = b?.expiry || b?.expiry_date || "";
      const effectivePackSize = Number(row0.pack_size || b?.pack_size || 1);
      const batchPrice =
        b && Number(b.unit_sale_price) > 0
          ? Number(b.unit_sale_price)
          : b && Number(b.pack_sale_price) > 0 && effectivePackSize > 0
          ? Number((Number(b.pack_sale_price) / effectivePackSize).toFixed(2))
          : null;

      if (b?.is_expired) {
        toast.error(`Warning: Batch ${batchNum} is EXPIRED (${batchExpiry}). Supervisor override required.`, { id: "expired-batch-warn" });
      }

      if (b?.available_units != null && Number.isFinite(Number(b.available_units))) {
        return handleBatchSelectWithCalculatedAvailable(
          rowIndex,
          batchNum,
          Number(b.available_units),
          batchExpiry,
          false,
          batchPrice
        );
      }
      
      const baseAvailable = Number(b?.available_units ?? 0);
      const params = new URLSearchParams({
        product_id: row0.product_id || "",
        batch: batchNum || "",
      }).toString();
      
      try {
        const res = await axios.get(`/api/products/available-quantity?${params}`);
        const apiAvailable = Number(
          res?.data?.available_units ?? res?.data?.available ?? res?.data?.quantity ?? 0
        );
        if (Number.isFinite(apiAvailable)) {
          return handleBatchSelectWithCalculatedAvailable(rowIndex, batchNum, apiAvailable, batchExpiry, false, batchPrice);
        }
      } catch {}
      
      handleBatchSelectWithCalculatedAvailable(rowIndex, batchNum, baseAvailable, batchExpiry, false, batchPrice);
    } catch {}
  };

  const handleBatchSelectWithCalculatedAvailable = (rowIndex, batchNum, baseAvailable, batchExpiry = "", isUnbatched = false, batchUnitPrice = null) => {
    const available = Number(baseAvailable);
    const exp = isUnbatched ? "" : (batchExpiry || asISODate(form.items[rowIndex]?.expiry || ""));
    
    setForm((prev) => {
      const items = [...prev.items];
      const currentRow = items[rowIndex] || {};
      const nextPrice =
        !currentRow.is_custom_price && batchUnitPrice != null && Number(batchUnitPrice) > 0
          ? Number(batchUnitPrice)
          : currentRow.price;
      const updated = {
        ...currentRow,
        price: nextPrice,
        batch_number: batchNum,
        is_unbatched: isUnbatched,
        expiry: exp,
        current_quantity: String(available),
      };
      items[rowIndex] = recalcItem(updated, "batch_select");
      let next = recalcFooter({ ...prev, items }, "items");
      // For credit sales, total_receive stays at 0 if untouched; for debit, always sync with total
      if (prev.invoice_type !== "credit") next.total_receive = next.total ?? "";
      if (!receiveTouched && prev.invoice_type === "credit") next.total_receive = "";
      return next;
    });
    setTimeout(() => {
      qtyRefs.current[rowIndex]?.focus?.();
    }, 40);
  };

  const upsertProducts = (list) => {
    if (!Array.isArray(list)) return;
    setProducts((prev) => {
      const map = new Map((prev || []).map((p) => [String(p.id), p]));
      list.forEach((p) => p?.id != null && map.set(String(p.id), p));
      return Array.from(map.values());
    });
  };

  const ensureProductsForItems = async (items = []) => {
    const ids = Array.from(new Set(items.map((it) => it.product_id).filter(Boolean))).map(String);
    if (!ids.length) return;
    const have = new Set((products || []).map((p) => String(p.id)));
    const missing = ids.filter((id) => !have.has(id));
    if (!missing.length) return;

    if (byIdsSupportedRef.current) {
      try {
        const { data } = await axios.get("/api/products/by-ids", {
          params: { ids: missing.join(",") },
        });
        const list = Array.isArray(data?.data) ? data.data : Array.isArray(data) ? data : [];
        upsertProducts(list);
        return;
      } catch (err) {
        if (err?.response?.status === 404) {
          byIdsSupportedRef.current = false;
        }
      }
    }

    const fetched = await Promise.all(
      missing.map(async (id) => {
        try {
          const { data } = await axios.get(`/api/products/${id}`);
          return data;
        } catch {
          try {
            const { data } = await axios.get("/api/products/search", { params: { q: id, limit: 1 } });
            return Array.isArray(data?.data) ? data.data[0] : Array.isArray(data) ? data[0] : null;
          } catch {
            return null;
          }
        }
      })
    );
    upsertProducts(fetched.filter(Boolean));
  };

  const ensureBatchesForItems = async (items = []) => {
    const productIds = Array.from(new Set(items.map((it) => it.product_id).filter(Boolean)));
    const batchMap = {};
    for (const pid of productIds) {
      try {
        batchMap[String(pid)] = await fetchBatches(pid);
      } catch {}
    }
    return batchMap;
  };

  const handleSubmit = async (e, submitOptions = {}) => {
    if (e?.preventDefault) e.preventDefault();
    const shouldPrintAfterSave = Boolean(submitOptions?.printAfterSave);
    invoiceErrors.clear();

    // Safety fallback: ensure customer_id is populated for debit sales
    let effectiveCustomerId = form.customer_id;
    if (!effectiveCustomerId && form.invoice_type !== "credit") {
      effectiveCustomerId = getDefaultCustomerId();
      if (effectiveCustomerId) {
        setForm((prev) => ({ ...prev, customer_id: effectiveCustomerId }));
      }
    }

    // Validate customer selection
    if (!effectiveCustomerId) {
      return invoiceErrors.showMessage(
        form.invoice_type === "credit"
          ? "Please select a customer for credit sale"
          : "Please select a customer"
      );
    }

    // Check if any item has a narcotic product
    const hasNarcoticProduct = form.items.some(item => item.is_narcotic === true);

    // If any item is narcotic, require doctor and patient names (pharmacy shops only)
    if (isPharmacy && hasNarcoticProduct) {
      if (!form.doctor_name || form.doctor_name.trim() === "") {
        return invoiceErrors.showMessage("Doctor name is required for narcotic products");
      }
      if (!form.patient_name || form.patient_name.trim() === "") {
        return invoiceErrors.showMessage("Patient name is required for narcotic products");
      }
    }

    for (let i = 0; i < form.items.length; i++) {
      const it = form.items[i];
      if (!it.product_id) return invoiceErrors.showMessage(`Row ${i + 1}: select a product`);
      const list = batchesByProduct[String(it.product_id)];
      const hasBatches = Array.isArray(list) && list.some((b) => !b.is_unbatched && b.batch_number);
      if (hasBatches && !it.batch_number && !it.is_unbatched) return invoiceErrors.showMessage(`Row ${i + 1}: select a batch or unbatched stock`);
      if (it.quantity === "" || it.quantity == null || Number(it.quantity) <= 0)
        return invoiceErrors.showMessage(`Row ${i + 1}: enter quantity`);
      const available = Number(it.current_quantity || 0);
      if (Number(it.quantity || 0) > available) {
        return invoiceErrors.showMessage(`Row ${i + 1}: quantity exceeds available (${available})`);
      }
    }

    // Unique product batch & unassigned validation:
    // Multiple rows with the same product are allowed only if batches are different and unassigned only once
    {
      const seenProductBatches = new Set();
      for (let i = 0; i < form.items.length; i++) {
        const it = form.items[i];
        if (!it.product_id) continue;
        const pId = String(it.product_id);
        const pName = it.product_name || `Product #${pId}`;
        const batchKey = it.batch_number ? `batch:${it.batch_number.trim()}` : "unbatched";
        const uniqueKey = `${pId}::${batchKey}`;

        if (seenProductBatches.has(uniqueKey)) {
          if (batchKey === "unbatched") {
            return invoiceErrors.showMessage(`Row ${i + 1}: Unassigned stock for "${pName}" can only be added once per invoice.`);
          } else {
            return invoiceErrors.showMessage(`Row ${i + 1}: Duplicate batch "${it.batch_number}" for "${pName}". Each batch can only be selected once.`);
          }
        }
        seenProductBatches.add(uniqueKey);
      }
    }

    // total_receive & Walk-In Customer unpaid credit (Udhar) validation
    const totalNum = Math.round(Number(form.total || 0));
    const recvNum =
      form.invoice_type !== "credit"
        ? totalNum
        : Math.round(Number(form.total_receive || 0));
    {
      if (recvNum < 0) return invoiceErrors.showMessage("Total Receive cannot be negative");
      if (form.invoice_type !== "credit" && recvNum > totalNum) {
        return invoiceErrors.showMessage("Total Receive cannot exceed Total");
      }

      const resolvedCustomer = (customersRef.current || customers || []).find(
        (c) => String(c.id) === String(effectiveCustomerId)
      );

      if (
        isWalkInCustomer(resolvedCustomer) &&
        (form.invoice_type === "credit" || recvNum < totalNum)
      ) {
        setCustomerSearchOpen(true);
        return invoiceErrors.showMessage(WALK_IN_CREDIT_ERROR);
      }
    }

    // Always set sale_type to retail for this form
    const payload = {
      ...form,
      customer_id: effectiveCustomerId,
      sale_type: "retail",
      invoice_type: form.invoice_type ?? "debit",
      total_receive: form.invoice_type !== "credit" ? String(totalNum) : form.total_receive,
      due_date: form.due_date || undefined,
      discount_percentage:
        form.discount_percentage === "-" || form.discount_percentage === "-."
          ? "-0"
          : form.discount_percentage,
      items: form.items.map((it) => {
        // For new items (string IDs starting with 'row_'), exclude the id field
        // For existing items (numeric IDs), convert id to integer
        const isNewItem = String(it.id).startsWith('row_') || !it.id;
        const { id, ...itemWithoutId } = it;
        return {
          ...itemWithoutId,
          ...(isNewItem ? {} : { id: parseInt(it.id, 10) }),
          quantity: it.quantity,
          item_discount_percentage:
            it.item_discount_percentage === "-" || it.item_discount_percentage === "-."
              ? "-0"
              : it.item_discount_percentage,
        };
      }),
    };
    delete payload.cash_given;

    const triggerDirectPrintForSavedId = async (savedId) => {
      if (!shouldPrintAfterSave || !savedId) return;
      try {
        const { data } = await axios.get(`/api/sale-invoices/${savedId}/print-url`);
        if (data?.url) {
          await printSlipUrl(data.url);
        }
      } catch (printErr) {
        toast.error(printErr?.response?.data?.message || "Saved invoice, but failed to print slip.");
      }
    };

    const executeSave = async (dataPayload, updateDrawer = null) => {
      try {
        if (saleId) {
          if (updateDrawer !== null) {
            dataPayload.update_drawer = updateDrawer;
          }
          const res = await axios.put(`/api/sale-invoices/${saleId}`, dataPayload);
          const id = res?.data?.id ?? saleId;
          window.dispatchEvent(new CustomEvent("cash-drawer-changed"));
          window.dispatchEvent(new CustomEvent("accounts-changed"));
          try { localStorage.setItem("cash_drawer_sync", String(Date.now())); } catch {}
          try { localStorage.setItem("accounts_sync", String(Date.now())); } catch {}
          toast.success("Sale invoice updated");
          await triggerDirectPrintForSavedId(id);
          navigate(`/sale-invoices/${id}`);
        } else {
          if (draftHook.activeDraftId) {
            dataPayload.draft_id = draftHook.activeDraftId;
          }
          const res = await axios.post("/api/sale-invoices", dataPayload);
          const id = res?.data?.id;
          window.dispatchEvent(new CustomEvent("cash-drawer-changed"));
          window.dispatchEvent(new CustomEvent("accounts-changed"));
          try { localStorage.setItem("cash_drawer_sync", String(Date.now())); } catch {}
          try { localStorage.setItem("accounts_sync", String(Date.now())); } catch {}
          draftHook.resetToNew();
          toast.success("Sale invoice created");
          if (id) {
            await triggerDirectPrintForSavedId(id);
            navigate(`/sale-invoices/${id}`);
          }
          else invoiceErrors.showMessage("Missing invoice ID from server response.");
        }
      } catch (err) {
        if (err?.response?.status === 422 && err?.response?.data?.requires_override) {
          setCreditOverridePrompt({
            isOpen: true,
            message: err.response.data.message,
            excessAmount: err.response.data.excess_amount,
            creditLimit: err.response.data.credit_limit,
            currentBalance: err.response.data.current_balance,
            projectedBalance: err.response.data.projected_balance,
            isHold: err.response.data.credit_status === "on_hold",
            execute: (overrideCreds = {}) => executeSave({ ...dataPayload, ...(overrideCreds || {}), credit_override: true }, updateDrawer),
          });
          return;
        }
        if (err?.response?.status === 422 && err?.response?.data?.requires_discount_override) {
          setDiscountOverridePrompt({
            isOpen: true,
            message: err.response.data.message,
            productName: err.response.data.product_name,
            maxDiscount: err.response.data.max_discount,
            requestedDiscount: err.response.data.requested_discount,
            execute: (overrideCreds = {}) => executeSave({ ...dataPayload, ...(overrideCreds || {}), discount_override: true }, updateDrawer),
          });
          return;
        }
        if (err?.response?.status === 422 && err?.response?.data?.requires_expired_override) {
          setExpiredOverridePrompt({
            isOpen: true,
            data: err.response.data,
            execute: (overrideCreds = {}) => executeSave({ ...dataPayload, ...(overrideCreds || {}), expired_override: true }, updateDrawer),
          });
          return;
        }
        invoiceErrors.showError(err);
      }
    };

    if (saleId) {
      // Calculate cash difference
      const orig = originalInvoiceMetaRef.current || {};
      const oldPayMethod = orig.payment_method || "cash";
      const oldInvType = orig.invoice_type || "debit";
      let oldReceived = Number(orig.total_receive ?? 0);
      if (oldInvType === "debit" && oldReceived <= 0) {
        oldReceived = Number(orig.total ?? 0);
      }
      const oldCash = oldPayMethod === "cash" ? oldReceived : 0;

      const newPayMethod = payload.payment_method || "cash";
      const newInvType = payload.invoice_type || "debit";
      let newReceived = Number(payload.total_receive ?? 0);
      if (newInvType === "debit" && newReceived <= 0) {
        newReceived = Number(payload.total ?? 0);
      }
      const newCash = newPayMethod === "cash" ? newReceived : 0;
      const cashDelta = Math.round((newCash - oldCash) * 100) / 100;

      if (Math.abs(cashDelta) > 0.001) {
        try {
          const drawerRes = await axios.get("/api/cash-drawer/current");
          if (drawerRes.data?.is_open && drawerRes.data?.session) {
            const invoiceTime = new Date(orig.created_at || orig.date).getTime();
            const shiftTime = new Date(drawerRes.data.session.opened_at).getTime();

            if (invoiceTime < shiftTime) {
              setDrawerPrompt({
                isOpen: true,
                oldCash,
                newCash,
                cashDelta,
                invoiceCreatedAt: orig.created_at || orig.date,
                shiftOpenedAt: drawerRes.data.session.opened_at,
                payload,
                execute: (upd) => executeSave(payload, upd),
              });
              return;
            }
          }
        } catch {}
      }

      await executeSave(payload, true);
    } else {
      await executeSave(payload);
    }
  };

  // --- scroll helpers (unchanged logic) ---
  const scrollTargetIntoItemsView = (node) => {
    const container = itemsScrollRef.current;
    if (!container || !node) return;

    const target = node.closest?.("tr") || node;

    const head = container.querySelector("thead");
    const headH = head ? head.getBoundingClientRect().height : 0;

    const targetTop = target.offsetTop;
    const targetBottom = targetTop + target.offsetHeight;

    const viewTop = container.scrollTop;
    const viewBottom = viewTop + container.clientHeight;

    if (targetTop < viewTop + headH + 4) {
      container.scrollTop = Math.max(targetTop - headH - 4, 0);
    } else if (targetBottom > viewBottom - 4) {
      container.scrollTop = targetBottom - container.clientHeight + 4;
    }
  };

  // --- keyboard nav (Retail: product -> batch -> quantity -> disc) ---
  const COLS = ["product", "batch", "quantity", "disc"];
  const focusCell = (row, col) => {
    const map = { product: productRefs, batch: batchRefs, quantity: qtyRefs, price: priceRefs, disc: discRefs };
    const ref = map[col]?.current?.[row];
    if (!ref) return;
    const input = ref.querySelector?.("input") || ref;
    if (input?.focus) {
      input.focus();
      input.select?.();
    } else if (ref?.focus) {
      ref.focus();
    }
    requestAnimationFrame(() => {
      scrollTargetIntoItemsView(input || ref);
    });
  };
  const moveSameCol = (row, col, dir) => {
    const lastIdx = form.items.length - 1;
    if (dir === 1) {
      if (row === lastIdx) {
        addRow();
        setTimeout(() => focusCell(row + 1, col === "quantity" || col === "disc" ? "product" : col), 40);
      } else {
        focusCell(row + 1, col);
      }
    } else if (row > 0) {
      focusCell(row - 1, col);
    }
  };
  const moveNextCol = (row, col) => {
    const i = COLS.indexOf(col);
    if (i < 0) return;
    if (i < COLS.length - 1) focusCell(row, COLS[i + 1]);
    else {
      const lastIdx = form.items.length - 1;
      if (row === lastIdx) {
        addRow();
        setTimeout(() => focusCell(row + 1, COLS[0]), 40);
      } else focusCell(row + 1, COLS[0]);
    }
  };
  const onKeyNav = (e, row, col) => {
  // Handle Ctrl + Tab for reverse navigation
  if (e.shiftKey && e.key === "Tab") {
    e.preventDefault();

    const i = COLS.indexOf(col);
    if (i > 0) {
      // Go to previous editable field
      focusCell(row, COLS[i - 1]);
    } else if (i === 0 && row > 0) {
      // If first column, go to previous row's last editable col
      focusCell(row - 1, COLS[COLS.length - 1]);
    }
    return;
  }

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


  /* ===================== R E N D E R ===================== */
  const selectedCustomer = (customers || []).find(
    (c) => String(c.id) === String(form.customer_id)
  );

  return (
    <>
      <form
        className={`sale-entry sale-entry-form flex flex-col flex-1 h-auto lg:h-[calc(100dvh-130px)] min-h-0 overflow-y-auto lg:overflow-hidden ${isDark ? "bg-slate-900" : "bg-white"}`}
        autoComplete="off" autoCapitalize="off" autoCorrect="off" spellCheck={false}
        onSubmit={(e) => {
          e.preventDefault();
          handleSubmit(e);
        }}
      >
      <InvoiceErrorSummary errors={invoiceErrors} />
      {/* Header */}
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
              {/* Sale / receipt icon */}
              <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="#ffffff" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round">
                <path d="M4 2v20l2-1 2 1 2-1 2 1 2-1 2 1 2-1 2 1V2l-2 1-2-1-2 1-2-1-2 1-2-1-2 1z" />
                <line x1="8" y1="7" x2="16" y2="7" />
                <line x1="8" y1="11" x2="16" y2="11" />
                <line x1="8" y1="15" x2="13" y2="15" />
              </svg>
            </div>
            <div>
              <div className="flex items-center gap-2">
                <h2 className="text-base sm:text-lg font-extrabold tracking-wide text-white leading-none">Sale Invoice</h2>
                <span
                  className="px-2 py-0.5 rounded-md text-[9px] font-bold tracking-widest text-white"
                  style={{ backgroundColor: "rgba(255,255,255,0.22)", backdropFilter: "blur(4px)" }}
                >
                  RETAIL
                </span>
                <span
                  className={`px-2 py-0.5 rounded-md text-[9px] font-bold tracking-widest text-white ${
                    saleId ? "bg-amber-400/90" : "bg-emerald-400/90"
                  }`}
                  style={{ color: "#1e293b" }}
                >
                  {saleId ? "EDIT" : "CREATE"}
                </span>
              </div>
              <p className="text-[10px] text-white/80 mt-0.5 hidden sm:block">
                Ctrl+S save · Ctrl+T toggle · Enter=next · ↑/↓ rows
              </p>
            </div>
          </div>

          <div className="flex flex-wrap items-center ml-auto gap-2">
            {!saleId && (
              <InvoiceDraftIndicator
                saveStatus={draftHook.saveStatus}
                lastSavedAt={draftHook.lastSavedAt}
                saveError={draftHook.saveError}
                draftsCount={draftHook.draftsList.length}
                activeDraftTitle={draftHook.activeDraft?.title}
                onOpenDrafts={() => draftHook.setIsDraftsModalOpen(true)}
                onSaveDraft={() => draftHook.holdAndNew()}
              />
            )}
            {/* Invoice Type Segmented Control */}
            <div
              className="sale-type-toggle flex items-center"
            >
              {["debit", "credit"].map((type) => {
                const active = form.invoice_type === type;
                return (
                  <button
                    key={type}
                    type="button"
                    onClick={() => handleInvoiceTypeChange(type)}
                    className={`sale-type-option text-xs font-semibold ${active ? "is-active theme-btn-primary shadow-sm" : "opacity-75 hover:opacity-100 hover:bg-black/5 dark:hover:bg-white/5"}`}
                    aria-pressed={active}
                  >
                    {active && <CheckIcon aria-hidden="true" />}
                    <span>{type === "debit" ? "Debit" : "Credit"}</span>
                  </button>
                );
              })}
            </div>

            {canPos && (
              <Link
                to="/sale-invoices/pos"
                title="Switch to High-Speed Hands-Free Barcode POS Mode"
                className="px-3 py-1.5 text-[11px] font-bold rounded-lg border border-emerald-500/30 bg-emerald-500/10 hover:bg-emerald-500/20 text-emerald-600 dark:text-emerald-400 flex items-center gap-1.5 transition-colors"
              >
                <QrCodeIcon className="w-4 h-4" />
                <span>Barcode POS</span>
              </Link>
            )}

            <button
              type="button"
              onClick={handleSubmit}
              className={`px-4 py-2 text-[11px] font-bold transition-all duration-200 ${btnPrimary.className}`}
              style={btnPrimary.style}
            >
              {saleId ? "Edit (Ctrl+S)" : "Create (Ctrl+S)"}
            </button>
          </div>
        </div>
      </div>

      {/* Main workspace: Left (Compact Top Fields + Items) and Right (Squeezed Summary) */}
      <div className={`sale-entry-workspace flex-1 min-h-0 flex flex-col lg:grid lg:grid-cols-[minmax(0,1fr)_230px] gap-2 p-2 overflow-visible lg:overflow-hidden ${isDark ? "bg-slate-900" : "bg-slate-50/50"}`}>
        {/* LEFT COLUMN: Top Banner Fields + Items Table */}
        <div className="flex flex-col min-h-0 flex-1 gap-1.5 overflow-hidden">
          {/* Top Banner Details Card (Compact) */}
          <div className={`sale-entry-details px-3 py-2 rounded-xl border shrink-0 ${isDark ? "bg-slate-800/80 border-slate-700" : "bg-white border-gray-200 shadow-2xs"}`}>
            <div className="grid grid-cols-2 sm:grid-cols-6 lg:grid-cols-12 gap-2 items-end">
              <div className="col-span-1 sm:col-span-2 lg:col-span-2">
                <label className="flex items-center justify-between text-[9.5px] font-semibold uppercase tracking-wider text-gray-500 dark:text-gray-400 mb-0.5">
                  <span>Posted #</span>
                  <span className="text-[8.5px] font-medium lowercase opacity-75">auto</span>
                </label>
                <input
                  type="text"
                  readOnly
                  tabIndex={-1}
                  value={form.posted_number || ""}
                  placeholder={saleId ? "" : "Auto on Save"}
                  autoComplete="off"
                  className="sale-readonly-field w-full h-7 rounded-md px-2 text-xs font-mono"
                />
              </div>

              <div className="col-span-1 sm:col-span-2 lg:col-span-2">
                <label className="block text-[9.5px] font-semibold uppercase tracking-wider text-gray-500 dark:text-gray-400 mb-0.5">Date</label>
                <input
                  type="date"
                  name="date"
                  value={form.date ?? ""}
                  onChange={handleHeaderChange}
                  autoComplete="off"
                  className="w-full h-7 border border-gray-300 dark:border-slate-600 rounded-md px-2 text-xs bg-white dark:bg-slate-700 text-gray-900 dark:text-slate-100"
                />
              </div>

              <div className={`col-span-2 sm:col-span-2 ${isPharmacy ? "lg:col-span-4" : "lg:col-span-8"}`}>
                <label className="block text-[9.5px] font-semibold uppercase tracking-wider text-gray-500 dark:text-gray-400 mb-0.5">Customer *</label>
                <button
                  type="button"
                  onClick={() => setCustomerSearchOpen(true)}
                  className={`w-full h-7 px-2.5 rounded-md border text-left text-xs flex items-center justify-between transition-all ${
                    selectedCustomer
                      ? "border-blue-500 bg-blue-50/80 dark:bg-blue-900/30 text-blue-700 dark:text-blue-200"
                      : "border-gray-300 dark:border-slate-600 bg-white dark:bg-slate-700 text-gray-700 dark:text-gray-300 hover:border-blue-400"
                  }`}
                  title={selectedCustomer?.name || (form.customer_id ? `Customer #${form.customer_id}` : "Select customer...")}
                >
                  <span className="truncate font-medium flex items-center gap-1.5">
                    <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" className="shrink-0 text-blue-500">
                      <path d="M20 21v-2a4 4 0 0 0-4-4H8a4 4 0 0 0-4 4v2" />
                      <circle cx="12" cy="7" r="4" />
                    </svg>
                    <span className="truncate">{selectedCustomer?.name || (form.customer_id ? `Customer #${form.customer_id}` : "Select customer...")}</span>
                  </span>
                  <span className="text-[10px] text-gray-400 dark:text-slate-400 shrink-0 font-normal">Search</span>
                </button>
              </div>

              {isPharmacy && (
                <div className="col-span-1 sm:col-span-3 lg:col-span-2">
                  <label className="block text-[9.5px] font-semibold uppercase tracking-wider text-gray-500 dark:text-gray-400 mb-0.5">Doctor</label>
                  <input
                    type="text"
                    name="doctor_name"
                    value={form.doctor_name ?? ""}
                    placeholder="Doctor"
                    onChange={handleHeaderChange}
                    autoComplete="off"
                    className="w-full h-7 border border-gray-300 dark:border-slate-600 rounded-md px-2 text-xs bg-white dark:bg-slate-700 text-gray-900 dark:text-slate-100"
                  />
                </div>
              )}

              {isPharmacy && (
                <div className="col-span-1 sm:col-span-3 lg:col-span-2">
                  <label className="block text-[9.5px] font-semibold uppercase tracking-wider text-gray-500 dark:text-gray-400 mb-0.5">Patient</label>
                  <input
                    type="text"
                    name="patient_name"
                    value={form.patient_name ?? ""}
                    placeholder="Patient"
                    onChange={handleHeaderChange}
                    autoComplete="off"
                    className="w-full h-7 border border-gray-300 dark:border-slate-600 rounded-md px-2 text-xs bg-white dark:bg-slate-700 text-gray-900 dark:text-slate-100"
                  />
                </div>
              )}

              {form.invoice_type === "credit" && (
                <div className="col-span-full py-1.5 px-3 rounded-md bg-amber-50/90 dark:bg-amber-950/40 border border-amber-200 dark:border-amber-800 flex flex-wrap items-center justify-between gap-2 text-xs">
                  <div className="flex items-center gap-3 flex-wrap">
                    <span className="font-semibold text-amber-900 dark:text-amber-200 flex items-center gap-1.5">
                      <span>Credit Status:</span>
                      <span className={`px-1.5 py-0.5 rounded text-[10px] font-bold uppercase ${
                        selectedCustomer?.credit_status === 'blocked'
                          ? 'bg-red-100 text-red-700 dark:bg-red-900/60 dark:text-red-300'
                          : selectedCustomer?.credit_status === 'on_hold'
                          ? 'bg-yellow-100 text-yellow-800 dark:bg-yellow-900/60 dark:text-yellow-300'
                          : 'bg-emerald-100 text-emerald-800 dark:bg-emerald-900/60 dark:text-emerald-300'
                      }`}>
                        {selectedCustomer?.credit_status || 'active'}
                      </span>
                    </span>
                    <span className="text-gray-600 dark:text-gray-300">
                      Terms: <strong>{selectedCustomer?.credit_days ? `${selectedCustomer.credit_days} days` : 'Immediate'}</strong>
                    </span>
                    <span className="text-gray-600 dark:text-gray-300">
                      Credit Limit: <strong>{Number(selectedCustomer?.credit_limit) > 0 ? `Rs. ${Number(selectedCustomer.credit_limit).toLocaleString()}` : 'Unlimited'}</strong>
                    </span>
                    {customerCreditSummary && (
                      <>
                        <span className="text-gray-600 dark:text-gray-300">
                          Ledger Balance: <strong>Rs. {Number(customerCreditSummary.current_balance || 0).toLocaleString()}</strong>
                        </span>
                        {Number(selectedCustomer?.credit_limit) > 0 && (
                          <span className={`font-semibold ${customerCreditSummary.available_credit <= 0 ? 'text-red-600 dark:text-red-400' : 'text-emerald-600 dark:text-emerald-400'}`}>
                            Available Credit: Rs. {Number(customerCreditSummary.available_credit || 0).toLocaleString()}
                          </span>
                        )}
                      </>
                    )}
                  </div>
                  <div className="flex items-center gap-2">
                    <label className="text-[10px] font-bold text-gray-600 dark:text-gray-300 uppercase tracking-wider">Due Date:</label>
                    <input
                      type="date"
                      name="due_date"
                      value={form.due_date || ""}
                      onChange={handleHeaderChange}
                      className="h-6 px-1.5 text-xs rounded border border-amber-300 dark:border-amber-700 bg-white dark:bg-slate-800 text-gray-900 dark:text-gray-100 font-mono"
                    />
                  </div>
                </div>
              )}

              {/* Row 2: Remarks + Items */}
              <div className="col-span-2 sm:col-span-5 lg:col-span-10">
                <label className="block text-[9.5px] font-semibold uppercase tracking-wider text-gray-500 dark:text-gray-400 mb-0.5">Remarks</label>
                <input
                  type="text"
                  name="remarks"
                  value={form.remarks ?? ""}
                  placeholder="Invoice remarks / customer notes..."
                  onChange={handleHeaderChange}
                  autoComplete="off"
                  className="w-full h-7 border border-gray-300 dark:border-slate-600 rounded-md px-2 text-xs bg-white dark:bg-slate-700 text-gray-900 dark:text-slate-100"
                />
              </div>

              <div className="col-span-1 sm:col-span-1 lg:col-span-2">
                <label className="flex items-center justify-between text-[9.5px] font-semibold uppercase tracking-wider text-gray-500 dark:text-gray-400 mb-0.5">
                  <span>Items</span>
                  <span className="text-[8.5px] font-medium lowercase opacity-75">count</span>
                </label>
                <div
                  className="sale-readonly-field w-full h-7 rounded-md px-2 text-xs font-bold flex items-center justify-center"
                >
                  {form.items.length} {form.items.length === 1 ? "item" : "items"}
                </div>
              </div>
            </div>
          </div>

          {/* Items Table Card */}
          <div className="flex flex-col min-h-0 flex-1">
            <div className="flex items-center justify-between mb-1 px-0.5">
              <div className={`text-[11px] font-bold tracking-wide uppercase ${isDark ? "text-slate-300" : "text-gray-700"}`}>
                Line Items
              </div>
              <div className="flex items-center gap-3 text-[10px]">
                <span className="inline-flex items-center gap-1.5 font-medium text-gray-600 dark:text-slate-300">
                  <span className="w-2.5 h-2.5 rounded-xs border border-blue-500 bg-white dark:bg-slate-700 inline-block" />
                  <span>Editable Field</span>
                </span>
                <span className="inline-flex items-center gap-1.5 font-medium text-gray-400 dark:text-slate-400">
                  <span className="w-2.5 h-2.5 rounded-xs border border-dashed border-gray-400 dark:border-slate-500 bg-gray-100 dark:bg-slate-800/80 inline-block" />
                  <span>Auto / Read-only</span>
                </span>
              </div>
            </div>
            <div ref={itemsScrollRef} className={`sale-entry-items flex-1 overflow-auto relative ${isDark ? "border-slate-700 bg-slate-800" : "border-gray-200 bg-white"}`}>
              <table className="invoice-repeater-table w-full min-w-[780px] text-[11px] lg:table-fixed border-collapse" autoComplete="off">
              <thead className={`sticky top-0 z-20 ${isDark ? "bg-slate-800/95 backdrop-blur-xs border-slate-700" : "bg-white/95 backdrop-blur-xs border-gray-200"} border-b`}>
                <tr className="[&>th]:text-left">
                  <th className={`w-7 text-center ${isDark ? "text-rose-400" : "text-red-600"}`}>DEL</th>
                  <th className="w-6 text-center sale-th-readonly">#</th>
                  <th className="min-w-[240px] w-[34%] sale-th-editable">Product *</th>
                  <th className="w-12 text-center sale-th-readonly" title="Pack Size (Auto)">PSize</th>
                  <th className="w-20 sale-th-editable">Batch</th>
                  <th className="w-[80px] text-center sale-th-readonly" title="Expiry Date (Auto)">Expiry</th>
                  <th className="w-14 text-center sale-th-readonly" title="Available Units (Auto)">Avail</th>
                  <th className="w-16 text-center sale-th-editable">Qty *</th>
                  <th className="w-18 text-center sale-th-readonly" title="Unit Sale Price (Auto)">Price</th>
                  <th className="w-14 text-center sale-th-editable">Disc %</th>
                  <th className="w-22 text-center sale-th-readonly" title="Row Sub Total (Auto)">Sub Total</th>
                  <th className="w-7 text-center">+</th>
                </tr>
              </thead>
              <tbody className="[&>tr>td]:py-1.5 [&>tr>td]:px-1">
                {form.items.map((it, i) => (
                  <tr key={it.id} id={invoiceErrors.rowId(i)} aria-invalid={invoiceErrors.rowMessages(i).length > 0 || undefined} className={`invoice-repeater-row ${invoiceErrors.rowMessages(i).length ? "invoice-row-invalid" : ""} border-b ${isDark ? "border-slate-700/80" : "border-gray-100"}`}>
                    <td className="invoice-cell-del text-center">
                      <button
                        type="button"
                        tabIndex={-1}
                        onClick={() => removeRow(i)}
                        aria-label="Remove item" title="Remove item"
                        className="sale-item-action sale-item-remove"
                      >
                        <TrashIcon aria-hidden="true" />
                      </button>
                    </td>
                    <td data-label="Item #" className={`invoice-cell-index text-center font-semibold text-[11px] ${isDark ? "text-slate-400" : "text-gray-500"}`}>{i + 1}</td>

                    <td data-label="Product *" className="invoice-cell-product">
                      <InvoiceRowError messages={invoiceErrors.rowMessages(i)} />
                      <div
                        ref={(el) => (productRefs.current[i] = el)}
                        onFocus={() => setFocusedRowIndex(i)}
                        className="flex items-center gap-1"
                      >
                        <div className="flex-1 min-w-0">
                          <ProductSearchInput
                            value={products.find((p) => eqId(p.id, it.product_id)) || it.product || (it.product_name ? { id: it.product_id, name: it.product_name } : it.product_id)}
                            onChange={(val) => handleProductSelect(i, val)}
                            onKeyDown={(e) => onKeyNav(e, i, "product")}
                            products={products}
                            onRefreshProducts={fetchProducts}
                            inputProps={{ autoComplete: "off", autoCapitalize: "off", autoCorrect: "off", spellCheck: false }}
                          />
                        </div>
                        {it.product_id && (
                          <button
                            type="button"
                            onClick={() =>
                              setSubstituteModalTarget({
                                rowIndex: i,
                                id: it.product_id,
                                name: it.product_name || it.product?.name,
                                formulation: it.product?.formulation,
                                price: it.price,
                                quantity: it.current_quantity,
                              })
                            }
                            className={`h-7 px-1.5 rounded-md border text-[10px] font-bold flex items-center gap-0.5 shrink-0 transition ${
                              Number(it.current_quantity) <= 0
                                ? "bg-amber-500 text-white border-amber-600 animate-pulse"
                                : "bg-emerald-500/10 text-emerald-600 dark:text-emerald-400 border-emerald-500/30 hover:bg-emerald-500/20"
                            }`}
                            title="Find Generic / Salt Formulation Substitutes"
                          >
                            <ArrowsRightLeftIcon className="w-3.5 h-3.5" />
                          </button>
                        )}
                      </div>
                    </td>

                    <td data-label="Pack Size" className="text-center">
                      <input
                        type="text"
                        readOnly
                        tabIndex={-1}
                        value={it.pack_size ?? ""}
                        placeholder="—"
                        autoComplete="off"
                        className="sale-readonly-field w-full h-7 rounded-md px-1.5 text-center"
                      />
                    </td>

                    <td data-label="Batch">
                      <div ref={(el) => (batchRefs.current[i] = el)} onFocus={() => setFocusedRowIndex(i)}>
                        <BatchSearchInput
                          value={it.batch_number ? it.batch_number : (it.is_unbatched ? "[Unbatched Stock]" : "")}
                          onChange={(val, batchObj) => handleBatchSelect(i, val, batchObj)}
                          batches={(batchesByProduct[it.product_id] || [])
                            .filter((b) => (b.available_units ?? 0) > 0)
                            .map((b) => ({
                              ...b,
                              batch_number: b.batch_number || b.batch,
                            }))}
                          usedBatches={form.items
                            .filter((row, idx) => idx !== i && eqId(row.product_id, it.product_id))
                            .map((row) => (row.batch_number ? String(row.batch_number).trim() : (row.is_unbatched ? "__unbatched__" : "")))
                            .filter(Boolean)}
                          onKeyDown={(e) => onKeyNav(e, i, "batch")}
                          inputProps={{ autoComplete: "off", autoCapitalize: "off", autoCorrect: "off", spellCheck: false }}
                        />
                      </div>
                    </td>

                    <td data-label="Expiry" className="text-center">
                      <input
                        type="text"
                        value={it.expiry ? String(it.expiry).trim().slice(0, 10).replace(/^(\d{4})-(\d{2})(?:-\d{2})?$/, "$2/$1") : ""}
                        title={it.expiry ? String(it.expiry).trim().slice(0, 10) : undefined}
                        readOnly
                        size={1}
                        tabIndex={-1}
                        placeholder="—"
                        autoComplete="off"
                        className="sale-readonly-field w-full min-w-0 h-7 rounded-md px-0.5 text-center font-mono text-[10.5px]"
                      />
                    </td>

                    <td data-label="Available" className="text-center">
                      <input
                        type="text"
                        readOnly
                        tabIndex={-1}
                        value={it.current_quantity ?? ""}
                        placeholder="—"
                        autoComplete="off"
                        className="sale-readonly-field w-full h-7 rounded-md px-1.5 text-center font-mono"
                      />
                    </td>

                    <td data-label="Qty *" className="text-center">
                      <input
                        ref={(el) => (qtyRefs.current[i] = el)}
                        type="text"
                        name="quantity"
                        inputMode="numeric"
                        placeholder="0"
                        value={zeroToEmpty(it.quantity)}
                        onChange={(e) => handleItemChange(i, "quantity", e.target.value)}
                        autoComplete="off"
                        className={
                          `w-full h-7 border rounded-md px-1.5 text-center font-bold ${
                            isDark 
                              ? "bg-slate-700 border-slate-500 text-slate-100" 
                              : "bg-white border-gray-300 text-gray-900"
                          } ` +
                          (Number(it.quantity || 0) > Number(it.current_quantity || 0)
                            ? "!border-red-500 ring-1 ring-red-400"
                            : "")
                        }
                        onKeyDown={(e) => onKeyNav(e, i, "quantity")}
                        onFocus={(e) => {
                          setFocusedRowIndex(i);
                          e.target.select();
                        }}
                      />
                    </td>

                    <td data-label="Unit Price" className="text-center">
                      <input
                        ref={(el) => (priceRefs.current[i] = el)}
                        type="text"
                        value={to2(it.price ?? "")}
                        readOnly
                        tabIndex={-1}
                        placeholder="—"
                        autoComplete="off"
                        className="sale-readonly-field w-full h-7 rounded-md px-1.5 text-right font-mono"
                      />
                    </td>

                    <td data-label="Disc %" className="text-center">
                      <input
                        ref={(el) => (discRefs.current[i] = el)}
                        type="text"
                        inputMode="decimal"
                        placeholder="0"
                        value={zeroToEmpty(it.item_discount_percentage)}
                        onChange={(e) => handleItemChange(i, "item_discount_percentage", e.target.value)}
                        onBlur={(e) => {
                          const v = e.target.value;
                          if (v !== "" && v !== "-" && v !== "-.") {
                            const num = Number(v);
                            if (Number.isFinite(num)) {
                              handleItemChange(i, "item_discount_percentage", num.toFixed(2));
                            }
                          }
                        }}
                        autoComplete="off"
                        className={`w-full h-7 border rounded-md px-1.5 text-center ${
                          isDark 
                            ? "bg-slate-700 border-slate-500 text-slate-100" 
                            : "bg-white border-gray-300 text-gray-900"
                        }`}
                        onKeyDown={(e) => onKeyNav(e, i, "disc")}
                        onFocus={(e) => {
                          setFocusedRowIndex(i);
                          e.target.select();
                        }}
                      />
                    </td>

                    <td data-label="Sub Total" className="invoice-cell-subtotal text-center">
                      <input
                        type="text"
                        readOnly
                        tabIndex={-1}
                        value={it.sub_total ?? ""}
                        placeholder="0.00"
                        autoComplete="off"
                        className="sale-readonly-field sale-subtotal-field w-full h-7 rounded-md px-2 text-right font-mono"
                      />
                    </td>

                    <td className="invoice-cell-add text-center">
                      <button
                        type="button"
                        onClick={addRow}
                        aria-label="Add item" title="Add item"
                        className="sale-item-action sale-item-add"
                      >
                        <PlusIcon aria-hidden="true" />
                      </button>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      </div>

      {/* RIGHT: Squeezed Summary - compact width giving max room to items */}
      <div className="min-h-0 w-full shrink-0 flex flex-col h-auto lg:h-full lg:w-[230px]">
        <div className={`sale-entry-summary h-full min-h-0 flex flex-col rounded-xl overflow-hidden border ${isDark ? "bg-slate-800 border-slate-700" : "bg-white border-gray-200 shadow-sm"}`}>
            {/* Panel Header */}
            <div
              className="sale-entry-summary-heading px-2.5 py-1.5 flex items-center justify-between shrink-0"
              style={{ background: `linear-gradient(135deg, ${themeColors.primary}, ${themeColors.primaryHover})` }}
            >
              <span className="text-white font-bold text-xs tracking-wide">Summary</span>
              <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="#ffffff" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                <line x1="18" y1="20" x2="18" y2="10" />
                <line x1="12" y1="20" x2="12" y2="4" />
                <line x1="6" y1="20" x2="6" y2="14" />
              </svg>
            </div>

            {/* Scrollable content on small heights */}
            <div className="sale-summary-body flex-1 flex flex-col min-h-0 px-2.5 py-1.5 text-[11px] overflow-y-auto">
              <div className="space-y-1">
                {/* Margin % */}
                <div className="flex items-center justify-between gap-1.5">
                  <label className={`font-semibold text-xs shrink-0 ${isDark ? "text-slate-400" : "text-gray-500"}`}>Margin %</label>
                  <input
                    type="text"
                    name="margin_percentage"
                    readOnly
                    tabIndex={-1}
                    value={marginPct}
                    onChange={(e) => setMarginPct(sanitizeNumberInput(e.target.value, true))}
                    autoComplete="off"
                    className="sale-readonly-field w-24 h-6.5 rounded-md px-2 text-center font-extrabold text-xs"
                  />
                </div>

                {/* Tax % */}
                <div className="flex items-center justify-between gap-1.5">
                  <label className={`font-semibold text-xs shrink-0 ${isDark ? "text-slate-400" : "text-gray-500"}`}>Tax %</label>
                  <input
                    type="text"
                    name="tax_percentage"
                    value={form.tax_percentage ?? ""}
                    onChange={handleHeaderChange}
                    autoComplete="off"
                    className={`w-24 h-6.5 border rounded-md px-2 text-center text-xs ${
                      isDark 
                        ? "border-slate-600 bg-slate-700 text-slate-200" 
                        : "border-gray-200 text-gray-800"
                    }`}
                  />
                </div>

                {/* Tax Amt */}
                <div className={`flex items-center justify-between gap-1.5 border-t border-dashed pt-0.5 ${isDark ? "border-slate-700" : "border-gray-200"}`}>
                  <label className={`font-semibold text-xs shrink-0 ${isDark ? "text-slate-400" : "text-gray-500"}`}>Tax Amt</label>
                  <input
                    type="text"
                    name="tax_amount"
                    value={form.tax_amount ?? ""}
                    onChange={handleHeaderChange}
                    autoComplete="off"
                    className={`w-24 h-6.5 border rounded-md px-2 text-right font-semibold text-xs ${
                      isDark 
                        ? "border-slate-600 bg-slate-700 text-slate-200" 
                        : "border-gray-200 text-gray-800"
                    }`}
                  />
                </div>

                {/* Disc % */}
                <div className="flex items-center justify-between gap-1.5">
                  <label className={`font-semibold text-xs shrink-0 ${isDark ? "text-slate-400" : "text-gray-500"}`}>Disc %</label>
                  <input
                    type="text"
                    name="discount_percentage"
                    value={form.discount_percentage ?? ""}
                    onChange={handleHeaderChange}
                    onBlur={(e) => {
                      const v = e.target.value;
                      if (v !== "" && v !== "-" && v !== "-.") {
                        const num = Number(v);
                        if (Number.isFinite(num)) {
                          handleHeaderChange({ target: { name: "discount_percentage", value: num.toFixed(2) } });
                        }
                      }
                    }}
                    autoComplete="off"
                    className={`w-24 h-6.5 border rounded-md px-2 text-center text-xs ${
                      isDark 
                        ? "border-slate-600 bg-slate-700 text-slate-200" 
                        : "border-gray-200 text-gray-800"
                    }`}
                  />
                </div>

                {/* Disc Amt */}
                <div className={`flex items-center justify-between gap-1.5 border-t border-dashed pt-0.5 ${isDark ? "border-slate-700" : "border-gray-200"}`}>
                  <label className={`font-semibold text-xs shrink-0 ${isDark ? "text-slate-400" : "text-gray-500"}`}>Disc Amt</label>
                  <input
                    type="text"
                    name="discount_amount"
                    value={form.discount_amount ?? ""}
                    onChange={handleHeaderChange}
                    autoComplete="off"
                    className={`w-24 h-6.5 border rounded-md px-2 text-right font-semibold text-xs ${
                      isDark 
                        ? "border-slate-600 bg-slate-700 text-slate-200" 
                        : "border-gray-200 text-gray-800"
                    }`}
                  />
                </div>
              </div>

              {/* Totals Banner */}
              <div
                className="my-1 px-2.5 py-1.5 rounded-lg shrink-0"
                style={{ background: `linear-gradient(135deg, ${themeColors.primary}18, ${themeColors.primaryHover}26)` }}
              >
                <div className="flex items-center justify-between">
                  <span className={`text-[9.5px] font-medium uppercase tracking-wide ${isDark ? "text-slate-400" : "text-gray-500"}`}>Gross</span>
                  <span className={`text-[11px] font-bold ${isDark ? "text-slate-200" : "text-gray-800"}`}>{form.gross_amount ?? 0}</span>
                </div>
                <div className="flex items-center justify-between border-t border-dashed pt-0.5 mt-0.5" style={{ borderColor: `${themeColors.primary}33` }}>
                  <span className={`text-xs font-bold ${isDark ? "text-slate-200" : "text-gray-800"}`}>Total</span>
                  <span className="text-lg font-black leading-none" style={{ color: themeColors.primary }}>
                    {form.total ?? 0}
                  </span>
                </div>
              </div>

              {/* Payment Method & Account Live Balance */}
              <div className="space-y-1">
                <PaymentAccountSelector
                  paymentMethod={form.payment_method || "cash"}
                  accountId={form.account_id || null}
                  onChange={({ payment_method, account_id }) => {
                    setForm((prev) => ({
                      ...prev,
                      payment_method,
                      account_id,
                    }));
                  }}
                  layout="compact"
                  showBalance={true}
                />

                {/* Cash Tendered / Given */}
                <div className="pt-1 border-t border-dashed" style={{ borderColor: isDark ? "#334155" : "#e2e8f0" }}>
                  <div className="flex items-center justify-between gap-1.5">
                    <label className={`font-bold text-xs shrink-0 ${isDark ? "text-slate-200" : "text-gray-700"}`}>
                      Cash Given
                    </label>
                    <input
                      type="text"
                      inputMode="numeric"
                      placeholder={form.invoice_type === "debit" ? String(billTotal) : "0"}
                      value={form.cash_given ?? ""}
                      onChange={(e) => handleCashGivenChange(e.target.value)}
                      onKeyDown={(e) => {
                        if (e.key === "Enter") {
                          e.preventDefault();
                          handleSubmit(e);
                        }
                      }}
                      autoComplete="off"
                      className={`w-24 h-6.5 border-2 rounded-md px-2 text-right font-extrabold text-xs transition-all ${
                        isDark 
                          ? "border-blue-500/60 bg-slate-700 text-blue-300 focus:border-blue-400" 
                          : "border-blue-400 bg-blue-50/50 text-blue-900 focus:border-blue-600 focus:bg-white"
                      }`}
                    />
                  </div>

                  {/* Quick suggestion chips */}
                  <div className="flex items-center gap-1 mt-1 justify-end flex-wrap">
                    <button
                      type="button"
                      onClick={() => handleCashGivenChange(String(billTotal))}
                      className="px-1.5 py-0.5 rounded text-[9.5px] font-semibold bg-gray-100 hover:bg-gray-200 dark:bg-slate-700 dark:hover:bg-slate-600 text-gray-700 dark:text-gray-200 transition-colors"
                      title="Exact bill amount"
                    >
                      Exact
                    </button>
                    {[500, 1000, 5000].map((note) => (
                      <button
                        key={note}
                        type="button"
                        onClick={() => handleCashGivenChange(String(note))}
                        className="px-1.5 py-0.5 rounded text-[9.5px] font-semibold bg-gray-100 hover:bg-gray-200 dark:bg-slate-700 dark:hover:bg-slate-600 text-gray-700 dark:text-gray-200 transition-colors"
                      >
                        {note}
                      </button>
                    ))}
                    {form.cash_given !== "" && form.cash_given !== undefined && (
                      <button
                        type="button"
                        onClick={() => handleCashGivenChange("")}
                        className="px-1 py-0.5 rounded text-[9.5px] text-red-500 hover:bg-red-50 dark:hover:bg-red-950/30 transition-colors font-bold"
                        title="Clear cash given"
                      >
                        ✕
                      </button>
                    )}
                  </div>
                </div>

                {/* Return to Customer (Change to hand over) */}
                {cashGivenNum !== null && cashGivenNum > 0 && (
                  <div
                    className={`p-1.5 rounded-lg border flex items-center justify-between transition-all ${
                      changeToReturn > 0
                        ? "bg-emerald-500/15 border-emerald-500/40 text-emerald-700 dark:text-emerald-300 shadow-xs"
                        : (isDark ? "bg-slate-700/40 border-slate-600 text-slate-300" : "bg-gray-50 border-gray-200 text-gray-700")
                    }`}
                  >
                    <div>
                      <div className="text-[9.5px] font-extrabold uppercase tracking-wider">
                        Return
                      </div>
                      <div className="text-[8.5px] opacity-80">
                        {changeToReturn > 0 ? "Change to hand over" : "Exact amount paid"}
                      </div>
                    </div>
                    <div className="text-base font-black tracking-tight">
                      {formatCurrency ? formatCurrency(changeToReturn) : changeToReturn}
                    </div>
                  </div>
                )}

                <div className="flex items-center justify-between pt-0.5">
                  <label className={`font-semibold text-xs shrink-0 ${isDark ? "text-slate-400" : "text-gray-500"}`}>Received</label>
                  <input
                    type="text"
                    name="total_receive"
                    inputMode="numeric"
                    readOnly={form.invoice_type === "debit"}
                    value={form.total_receive ?? ""}
                    onChange={(e) => {
                      if (form.invoice_type === "debit") return;
                      const v = sanitizeNumberInput(e.target.value, true, false);
                      setReceiveTouched(true);
                      setForm((prev) => ({ ...prev, total_receive: v }));
                    }}
                    onBlur={() => {
                      if (form.invoice_type === "debit") return;
                      setForm((prev) => ({
                        ...prev,
                        total_receive: String(Math.round(Number(prev.total_receive || 0))),
                      }));
                    }}
                    autoComplete="off"
                    className={`w-24 h-6.5 border rounded-md px-2 text-right font-semibold text-xs ${
                      isDark 
                        ? "border-slate-600 bg-slate-700 text-slate-200" 
                        : "border-gray-200 text-gray-800"
                    } ${form.invoice_type === "debit" ? (isDark ? "cursor-not-allowed bg-slate-800" : "bg-gray-100 cursor-not-allowed") : ""}`}
                  />
                </div>

                <div className="flex items-center justify-between">
                  <label className={`font-semibold text-xs shrink-0 ${isDark ? "text-slate-400" : "text-gray-500"}`}>Remaining Due</label>
                  <span
                    className={`text-base font-extrabold ${
                      remainingDue > 0
                        ? "text-amber-500"
                        : (isDark ? "text-emerald-400" : "text-emerald-600")
                    }`}
                  >
                    {remainingDue}
                  </span>
                </div>

                {form.invoice_type === "credit" && excessCredit > 0 && (
                  <div className="flex items-center justify-between pt-0.5">
                    <label className={`font-semibold text-xs shrink-0 ${isDark ? "text-emerald-400" : "text-emerald-600"}`}>Ledger Credit</label>
                    <span className={`text-sm font-extrabold ${isDark ? "text-emerald-400" : "text-emerald-600"}`}>
                      +{excessCredit}
                    </span>
                  </div>
                )}
              </div>
            </div>

            <div className="px-2.5 py-1.5 shrink-0 border-t" style={{ borderColor: isDark ? "rgba(71,85,105,0.5)" : "rgba(229,231,235,0.8)" }}>
              <button
                type="button"
                onClick={handleSubmit}
                className={`w-full h-8 text-xs font-bold transition-all duration-200 ${btnPrimary.className}`}
                style={btnPrimary.style}
              >
                {saleId ? "Edit Sale" : "Create Sale"}
              </button>
            </div>
          </div>
        </div>
      </div>

      </form>

      {/* Customer Search Modal */}
      <CustomerSearch
        isOpen={customerSearchOpen}
        onClose={() => setCustomerSearchOpen(false)}
        onSelect={handleCustomerSelect}
        onCreate={handleCustomerSelect}
      />

      <Suspense fallback={null}>
        {/* Held Drafts Modal */}
        {draftHook.isDraftsModalOpen && (
          <InvoiceDraftsModal
            isOpen={draftHook.isDraftsModalOpen}
            onClose={() => draftHook.setIsDraftsModalOpen(false)}
            drafts={draftHook.draftsList}
            activeDraftId={draftHook.activeDraftId}
            onResumeDraft={(id) => draftHook.loadDraft(id)}
            onDiscardDraft={(id) => draftHook.discardDraft(id)}
            onStartBlank={handleStartBlank}
            type="sale_retail"
          />
        )}

        {/* Pre-Shift Edit Cash Drawer Prompt */}
        {!!drawerPrompt?.isOpen && (
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
            invoiceCreatedAt={drawerPrompt?.invoiceCreatedAt}
            shiftOpenedAt={drawerPrompt?.shiftOpenedAt}
          />
        )}

        {/* Credit Limit / Status Approval Override Modal */}
        {!!creditOverridePrompt?.isOpen && (
          <CreditOverrideModal
            isOpen={!!creditOverridePrompt?.isOpen}
            onClose={() => setCreditOverridePrompt(null)}
            onConfirm={(overrideCreds) => {
              const fn = creditOverridePrompt?.execute;
              setCreditOverridePrompt(null);
              if (fn) fn(overrideCreds);
            }}
            message={creditOverridePrompt?.message}
            creditLimit={creditOverridePrompt?.creditLimit}
            currentBalance={creditOverridePrompt?.currentBalance}
            excessAmount={creditOverridePrompt?.excessAmount}
            isHold={creditOverridePrompt?.isHold}
          />
        )}

        {/* Discount Limit Approval Override Modal */}
        {!!discountOverridePrompt?.isOpen && (
          <DiscountOverrideModal
            isOpen={!!discountOverridePrompt?.isOpen}
            onClose={() => setDiscountOverridePrompt(null)}
            onConfirm={(overrideCreds) => {
              const fn = discountOverridePrompt?.execute;
              setDiscountOverridePrompt(null);
              if (fn) fn(overrideCreds);
            }}
            message={discountOverridePrompt?.message}
            productName={discountOverridePrompt?.productName}
            maxDiscount={discountOverridePrompt?.maxDiscount}
            requestedDiscount={discountOverridePrompt?.requestedDiscount}
          />
        )}

        {/* Expired Stock Approval Override Modal */}
        {!!expiredOverridePrompt?.isOpen && (
          <ExpiredStockOverrideModal
            open={!!expiredOverridePrompt?.isOpen}
            onClose={() => setExpiredOverridePrompt(null)}
            data={expiredOverridePrompt?.data}
            onConfirmOverride={(overrideCreds) => {
              const fn = expiredOverridePrompt?.execute;
              setExpiredOverridePrompt(null);
              if (fn) fn(overrideCreds);
            }}
          />
        )}

        {Boolean(substituteModalTarget) && (
          <SubstituteProductsModal
            open={Boolean(substituteModalTarget)}
            product={substituteModalTarget}
            onClose={() => setSubstituteModalTarget(null)}
            allowSwap={true}
            onSelectSubstitute={async (sub, mode) => {
              const targetIdx = substituteModalTarget?.rowIndex;
              setSubstituteModalTarget(null);
              upsertProducts([sub]);
              if (mode === "swap" && targetIdx != null) {
                await handleProductSelect(targetIdx, sub);
                toast.success(`Swapped row ${targetIdx + 1} with ${sub.name}`);
              } else {
                const newIdx = form.items.length;
                addRow();
                setTimeout(() => {
                  handleProductSelect(newIdx, sub);
                }, 30);
                toast.success(`Added substitute ${sub.name}`);
              }
            }}
          />
        )}
      </Suspense>
    </>
  );
}

