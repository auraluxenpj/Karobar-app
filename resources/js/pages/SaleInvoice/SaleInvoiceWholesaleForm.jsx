import { useInvoiceErrors, InvoiceErrorSummary, InvoiceRowError } from "../../components/InvoiceErrors";
// /src/pages/sales/SaleInvoiceWholesaleForm.jsx - True B2B Wholesale Sale Invoice Form
import { lazy, Suspense, useEffect, useRef, useState, useMemo } from "react";
import { useNavigate } from "react-router-dom";
import axios from "axios";
import { TrashIcon, PlusIcon, CheckIcon } from "@heroicons/react/24/outline";
import toast from "react-hot-toast";
import ProductSearchInput from "../../components/ProductSearchInput.jsx";
import BatchSearchInput from "../../components/BatchSearchInput.jsx";
import CustomerSearch from "../../components/CustomerSearch.jsx";
import { recalcWholesaleItem, recalcFooter } from "../../Formula/SaleInvoice.js";
import { useTheme } from "@/context/ThemeContext";
import { getThemeButtonClasses } from "@/utils/buttonStyles";
import { useSaleSystem } from "@/context/SaleSystemContext.jsx";
import { useInvoiceDraft } from "@/hooks/useInvoiceDraft.js";
import { useCurrency } from "@/context/CurrencyContext.jsx";
import InvoiceDraftIndicator from "@/components/InvoiceDraftIndicator.jsx";
import PaymentAccountSelector from "../../components/PaymentAccountSelector.jsx";

const InvoiceDraftsModal = lazy(() => import("@/components/InvoiceDraftsModal.jsx"));
const PreShiftDrawerPromptModal = lazy(() => import("@/components/PreShiftDrawerPromptModal.jsx"));
const CreditOverrideModal = lazy(() => import("@/components/CreditOverrideModal.jsx"));
const DiscountOverrideModal = lazy(() => import("@/components/DiscountOverrideModal.jsx"));
const ExpiredStockOverrideModal = lazy(() => import("@/components/ExpiredStockOverrideModal.jsx"));

export const PAYMENT_METHOD_OPTIONS = [
  { value: "cash", label: "Cash" },
  { value: "card", label: "Card / POS" },
  { value: "bank_transfer", label: "Bank Transfer" },
  { value: "cheque", label: "Cheque" },
  { value: "mobile_wallet", label: "Mobile Wallet" },
  { value: "other", label: "Other" },
];

/* -------- utils -------- */
const normalizeFormLoaded = (f) => {
  const safe = { ...f };
  safe.invoice_type = safe.invoice_type ?? "debit";
  safe.sale_type = "wholesale";
  safe.wholesale_type = safe.wholesale_type ?? "pack";
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
  safe.total_receive = safe.total_receive ?? "";
  safe.cash_given = safe.cash_given ?? "";
  safe.payment_method = safe.payment_method ?? "cash";
  safe.account_id = safe.account_id ?? null;
  safe.items = Array.isArray(safe.items)
    ? safe.items.map((it, idx) => {
        const isUnbatched = Boolean(it?.is_unbatched || (!it?.batch_number && it?.product_id));
        const packSize = Math.max(1, Number(it?.pack_size || it?.product?.pack_size || 1));
        const totalUnits = Math.max(0, Number(it?.quantity || 0));

        let packQty = it?.pack_quantity !== undefined && it?.pack_quantity !== null && it?.pack_quantity !== ""
          ? Number(it.pack_quantity)
          : 0;
        let unitQty = it?.unit_quantity !== undefined && it?.unit_quantity !== null && it?.unit_quantity !== ""
          ? Number(it.unit_quantity)
          : 0;

        // Decompose legacy quantity into packs + loose units if pack_quantity/unit_quantity were not stored
        if (packQty === 0 && unitQty === 0 && totalUnits > 0) {
          if (packSize > 1) {
            packQty = Math.floor(totalUnits / packSize);
            unitQty = totalUnits % packSize;
          } else {
            unitQty = totalUnits;
          }
        }

        const unitPrice = Number(it?.price || 0);
        const packPrice =
          it?.pack_price !== undefined && it?.pack_price !== null && Number(it.pack_price) > 0
            ? Number(it.pack_price)
            : Number((unitPrice * packSize).toFixed(2));
        const bonusQty = Math.max(0, Number(it?.bonus || 0));
        let packBonus =
          it?.pack_bonus !== undefined && it?.pack_bonus !== null && it?.pack_bonus !== ""
            ? Number(it.pack_bonus)
            : 0;
        let unitBonus =
          it?.unit_bonus !== undefined && it?.unit_bonus !== null && it?.unit_bonus !== ""
            ? Number(it.unit_bonus)
            : 0;
        if (packBonus === 0 && unitBonus === 0 && bonusQty > 0) {
          if (packSize > 1) {
            packBonus = Math.floor(bonusQty / packSize);
            unitBonus = bonusQty % packSize;
          } else {
            unitBonus = bonusQty;
          }
        }

        return recalcWholesaleItem({
          id: it?.id ?? `row_${Date.now()}_${idx}_${Math.random().toString(36).substr(2, 9)}`,
          product_id: it?.product_id ?? "",
          product_name: it?.product_name ?? it?.product?.name ?? "",
          product: it?.product ?? null,
          pack_size: packSize,
          batch_number: it?.batch_number ?? "",
          is_unbatched: isUnbatched,
          expiry: it?.expiry ?? "",
          current_quantity: String(it?.current_quantity ?? ""),
          pack_quantity: packQty > 0 ? String(packQty) : "",
          unit_quantity: unitQty > 0 ? String(unitQty) : "",
          quantity: totalUnits,
          pack_bonus: packBonus > 0 ? String(packBonus) : "",
          unit_bonus: unitBonus > 0 ? String(unitBonus) : "",
          bonus: bonusQty > 0 ? String(bonusQty) : "",
          pack_price: packPrice > 0 ? packPrice : "",
          price: unitPrice > 0 ? unitPrice : "",
          item_discount_percentage: it?.item_discount_percentage ?? "",
          sub_total: it?.sub_total ?? "",
          is_narcotic: it?.is_narcotic ?? it?.narcotic === "yes" ?? false,
          is_custom_price: Boolean(it?.is_custom_price),
        });
      })
    : [];
  return safe;
};

export default function SaleInvoiceWholesaleForm({ saleId, onSuccess }) {
  const generateRowId = () => `row_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`;

  const createEmptyRow = () => ({
    id: generateRowId(),
    product_id: "",
    pack_size: "",
    batch_number: "",
    expiry: "",
    current_quantity: "",
    pack_quantity: "",
    unit_quantity: "",
    quantity: "",
    pack_bonus: "",
    unit_bonus: "",
    bonus: "",
    pack_price: "",
    price: "",
    item_discount_percentage: "",
    sub_total: "",
    is_narcotic: false,
    is_custom_price: false,
  });

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
    sale_type: "wholesale",
    wholesale_type: "pack",
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
    items: [createEmptyRow()],
  });
  const invoiceErrors = useInvoiceErrors(form.items);

  const [customerWholesalePrices, setCustomerWholesalePrices] = useState({});
  const [productDataCache, setProductDataCache] = useState({});
  const [invalidPriceRows, setInvalidPriceRows] = useState({});
  const [receiveTouched, setReceiveTouched] = useState(false);
  const [marginPct, setMarginPct] = useState("");
  const [focusedRowIndex, setFocusedRowIndex] = useState(0);
  const [customerSearchOpen, setCustomerSearchOpen] = useState(false);
  const [originalInvoiceQuantities, setOriginalInvoiceQuantities] = useState({});
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
    setInvalidPriceRows({});
    invoiceErrors.clear();
    setForm(
      normalizeFormLoaded({
        invoice_type: "debit",
        sale_type: "wholesale",
        wholesale_type: "pack",
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
        items: [createEmptyRow()],
      })
    );
    setTimeout(() => {
      productRefs.current[0]?.querySelector?.("input")?.focus?.();
    }, 60);
  };

  const draftHook = useInvoiceDraft({
    type: "sale_wholesale",
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
      if (loaded.customer_id) {
        fetchCustomerWholesalePrices(loaded.customer_id);
      }
      await ensureProductsForItems(loaded?.items || []);
      await ensureBatchesForItems(loaded?.items || []);
      setForm(loaded);
      focusedOnce.current = true;

      if (typeof window !== "undefined") {
        window.dispatchEvent(new CustomEvent("product-search:close"));
      }

      const lastIdx = Math.max(0, (loaded?.items?.length || 1) - 1);
      let retries = 0;
      const tryFocus = () => {
        const el = packQtyRefs.current[lastIdx] || unitQtyRefs.current[lastIdx];
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

  // Calculate margin % for focused row (or first populated row)
  useEffect(() => {
    const activeRow =
      form.items[focusedRowIndex]?.product_id
        ? form.items[focusedRowIndex]
        : form.items.find((r) => r.product_id);

    if (activeRow && activeRow.product_id && Number(activeRow.price || 0) > 0) {
      const productData = productDataCache[activeRow.product_id] || activeRow.product || {};
      const packSize = Math.max(1, Number(activeRow.pack_size || productData?.pack_size || 1));
      const unitPurchasePrice =
        Number(productData?.unit_purchase_price || 0) ||
        (Number(productData?.pack_purchase_price || 0) > 0
          ? Number(productData.pack_purchase_price) / packSize
          : 0);
      const unitSalePrice = Number(activeRow.price) || 0;

      if (unitPurchasePrice > 0 && unitSalePrice > 0) {
        const margin = ((unitSalePrice - unitPurchasePrice) / unitSalePrice) * 100;
        setMarginPct(String(Number(margin.toFixed(2))));
        return;
      }
    }
    setMarginPct("");
  }, [form.items, focusedRowIndex, productDataCache]);

  useEffect(() => {
    setMarginPct("");
    setReceiveTouched(false);
  }, [saleId]);

  const [products, setProducts] = useState([]);
  const [batchesByProduct, setBatchesByProduct] = useState({});
  const byIdsSupportedRef = useRef(true);

  // refs for grid navigation
  const productRefs = useRef([]);
  const batchRefs = useRef([]);
  const packQtyRefs = useRef([]);
  const unitQtyRefs = useRef([]);
  const packBonusRefs = useRef([]);
  const unitBonusRefs = useRef([]);
  const packPriceRefs = useRef([]);
  const priceRefs = useRef([]);
  const discRefs = useRef([]);
  const focusedOnce = useRef(false);
  const customerSelectRef = useRef(null);
  const itemsScrollRef = useRef(null);

  /* -------- effects -------- */
  useEffect(() => {
    (async () => {
      await Promise.all([fetchCustomers(), fetchProducts()]);
      if (saleId) {
        await fetchSale();
      }
      // focus first product on brand new form (unless resuming a draft from URL)
      setTimeout(() => {
        const params = new URLSearchParams(window.location.search);
        const hasDraftInUrl = Boolean(params.get("draft_id"));
        if (hasDraftInUrl) {
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

  // Alt+S save
  useEffect(() => {
    const handle = (e) => {
      if (e.altKey && e.key.toLowerCase() === "s") {
        e.preventDefault();
        handleSubmit(e);
      }
    };
    document.addEventListener("keydown", handle);
    return () => document.removeEventListener("keydown", handle);
  }, [form]);

  /* -------- helpers -------- */
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

  const formatAvailBadge = (units, packSize) => {
    if (units === "" || units === null || units === undefined) return "—";
    const u = Number(units || 0);
    const ps = Math.max(1, Number(packSize || 1));
    if (ps > 1) {
      const p = Math.floor(u / ps);
      const rem = u % ps;
      return rem > 0 ? `${p}P+${rem}U (${u})` : `${p}P (${u})`;
    }
    return String(u);
  };

  const { isDark, theme } = useTheme();
  const { isPharmacy } = useSaleSystem();

  const themeColors = useMemo(() => {
    if (!theme) {
      return {
        primary: "#3b82f6",
        primaryHover: "#2563eb",
        secondary: "#8b5cf6",
        secondaryHover: "#7c3aed",
        danger: "#ef4444",
        dangerHover: "#dc2626",
      };
    }
    return {
      primary: theme.primary_color || "#3b82f6",
      primaryHover: theme.primary_hover || "#2563eb",
      secondary: theme.secondary_color || "#8b5cf6",
      secondaryHover: theme.secondary_hover || "#7c3aed",
      danger: theme.danger_color || "#ef4444",
      dangerHover: "#dc2626",
    };
  }, [theme]);

  const buttonStyle = theme?.button_style || "modern";
  const getButtonClasses = useMemo(
    () => getThemeButtonClasses(buttonStyle, themeColors, isDark),
    [buttonStyle, themeColors, isDark]
  );
  const btnPrimary = getButtonClasses.primary;

  const { formatCurrency } = useCurrency();
  const billTotal = Math.round(Number(form.total || 0));
  const cashGivenNum = form.cash_given !== "" && form.cash_given !== undefined ? Number(form.cash_given) : null;
  const changeToReturn =
    form.invoice_type === "credit"
      ? cashGivenNum !== null && Number(form.total_receive || 0) < cashGivenNum
        ? cashGivenNum - Number(form.total_receive || 0)
        : 0
      : cashGivenNum !== null && cashGivenNum > billTotal
      ? cashGivenNum - billTotal
      : 0;
  const remainingDue = Math.max(0, billTotal - Math.round(Number(form.total_receive || 0)));
  const excessCredit =
    form.invoice_type === "credit" && Math.round(Number(form.total_receive || 0)) > billTotal
      ? Math.round(Number(form.total_receive || 0)) - billTotal
      : 0;

  // Total packs & units summary across the invoice
  const invoiceQtySummary = useMemo(() => {
    let totalPacks = 0;
    let totalLooseUnits = 0;
    let totalBilledUnits = 0;
    let totalPackBonus = 0;
    let totalUnitBonus = 0;
    let totalBonusUnits = 0;
    for (const it of form.items) {
      if (!it.product_id) continue;
      totalPacks += Number(it.pack_quantity || 0);
      totalLooseUnits += Number(it.unit_quantity || 0);
      totalBilledUnits += Number(it.quantity || 0);
      totalPackBonus += Number(it.pack_bonus || 0);
      totalUnitBonus += Number(it.unit_bonus || 0);
      totalBonusUnits += Number(it.bonus || 0);
    }
    return {
      totalPacks,
      totalLooseUnits,
      totalBilledUnits,
      totalPackBonus,
      totalUnitBonus,
      totalBonusUnits,
    };
  }, [form.items]);

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
      whole_sale_unit_price: b?.whole_sale_unit_price != null ? Number(b.whole_sale_unit_price) : null,
      whole_sale_pack_price: b?.whole_sale_pack_price != null ? Number(b.whole_sale_pack_price) : null,
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

      const headerUnbatched = Number(res.headers?.["x-unbatched-units"] ?? 0);
      const totalHeader = Number(res.headers?.["x-total-units"] ?? 0);
      const batchedHeader = Number(res.headers?.["x-batched-units"] ?? 0);
      const calculatedUnbatched =
        headerUnbatched > 0
          ? headerUnbatched
          : totalHeader > 0
          ? Math.max(0, totalHeader - batchedHeader)
          : 0;

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
    const shouldSync = loaded?.total_receive === "" || tr === tt;

    if (loaded.customer_id) {
      fetchCustomerWholesalePrices(loaded.customer_id);
    }

    await ensureProductsForItems(loaded?.items || []);
    const batchMap = await ensureBatchesForItems(loaded?.items || []);

    if (saleId && Array.isArray(loaded?.items)) {
      const originalQtys = {};
      loaded.items = loaded.items.map((item, idx) => {
        if (!item.product_id) return item;
        const origUnits = Number(item.quantity || 0) + Number(item.bonus || 0);
        originalQtys[idx] = {
          product_id: item.product_id,
          quantity: item.quantity,
          bonus: item.bonus,
          total_units: origUnits,
          pack_size: item.pack_size,
        };

        const pKey = String(item.product_id);
        const batchList = batchMap[pKey] || batchesByProduct[pKey] || [];

        let matchingBatch = null;
        if (item.is_unbatched) {
          matchingBatch = batchList.find((b) => b.is_unbatched);
        } else if (item.batch_number) {
          matchingBatch = batchList.find(
            (b) => String(b.batch_number).trim() === String(item.batch_number).trim()
          );
        }

        const warehouseUnits = Number(matchingBatch?.available_units ?? 0);
        const effectiveAvailableUnits = warehouseUnits + origUnits;

        setBatchesByProduct((m) => {
          const list = m[pKey] || [];
          const exists = list.some((b) =>
            item.is_unbatched
              ? b.is_unbatched
              : String(b.batch_number).trim() === String(item.batch_number).trim()
          );
          if (exists) {
            return {
              ...m,
              [pKey]: list.map((b) => {
                const isMatch = item.is_unbatched
                  ? b.is_unbatched
                  : String(b.batch_number).trim() === String(item.batch_number).trim();
                return isMatch
                  ? { ...b, available_units: Number(b.available_units || 0) + origUnits }
                  : b;
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
                  available_units: effectiveAvailableUnits,
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
          current_quantity: String(effectiveAvailableUnits),
        };
      });
      setOriginalInvoiceQuantities(originalQtys);
    }

    setForm(loaded);
    setReceiveTouched(!shouldSync);
  };

  // Fetch customer-specific wholesale prices and apply to non-overridden rows
  const fetchCustomerWholesalePrices = async (customerId) => {
    if (!customerId) return;
    try {
      const res = await axios.get(`/api/customers/${customerId}/whole-sale-prices`);
      const prices = {};
      if (Array.isArray(res.data)) {
        res.data.forEach((item) => {
          prices[item.product_id] = Number(item.pack_price || 0);
        });
      }
      setCustomerWholesalePrices(prices);

      // Apply customer contracted pack prices to already-selected products on the form
      setForm((prev) => {
        if (!Array.isArray(prev.items) || prev.items.length === 0) return prev;
        let changed = false;
        const nextItems = prev.items.map((it) => {
          if (!it.product_id) return it;
          const customPackPrice = prices[it.product_id];
          if (customPackPrice && customPackPrice > 0) {
            changed = true;
            return recalcWholesaleItem(
              {
                ...it,
                pack_price: customPackPrice,
                is_custom_price: true,
              },
              "pack_price"
            );
          }
          return it;
        });
        if (!changed) return prev;
        let updated = recalcFooter({ ...prev, items: nextItems }, "items");
        if (!receiveTouched && prev.invoice_type !== "credit") updated.total_receive = updated.total ?? "";
        return updated;
      });
    } catch (error) {
      console.error("Failed to fetch customer wholesale prices:", error);
      setCustomerWholesalePrices({});
    }
  };

  /* -------- handlers -------- */
  const handleInvoiceTypeChange = (type) => {
    setForm((prev) => {
      const next = { ...prev, invoice_type: type };
      if (type === "credit") {
        const currentCust = (customersRef.current || customers || []).find(
          (c) => String(c.id) === String(prev.customer_id)
        );
        if (isWalkInCustomer(currentCust)) {
          next.customer_id = "";
        }
        next.total_receive = "";
        setReceiveTouched(true);
      } else {
        if (!next.customer_id && customers.length > 0) {
          next.customer_id = getDefaultCustomerId(customers);
        }
        if (!receiveTouched) {
          next.total_receive = next.total ?? "";
        }
      }
      return next;
    });
  };

  const handleCustomerChange = (customerId, customerObj = null) => {
    const cust = customerObj || (customers || []).find((c) => String(c.id) === String(customerId));
    if (form.invoice_type === "credit" && isWalkInCustomer(cust)) {
      invoiceErrors.showMessage(WALK_IN_CREDIT_ERROR);
      return;
    }
    if (customerObj?.id) {
      setCustomers((prev) => {
        const exists = prev.some((c) => String(c.id) === String(customerObj.id));
        return exists ? prev : [customerObj, ...prev];
      });
    }
    const creditDays = Number(cust?.credit_days ?? 0);
    let autoDueDate = undefined;
    if (creditDays > 0 && form.date) {
      const d = new Date(form.date);
      if (!isNaN(d.getTime())) {
        d.setDate(d.getDate() + creditDays);
        autoDueDate = d.toISOString().split("T")[0];
      }
    }
    setForm((prev) => {
      const next = {
        ...prev,
        customer_id: customerId,
        ...(autoDueDate ? { due_date: autoDueDate } : {}),
      };
      if (customerId) {
        fetchCustomerWholesalePrices(customerId);
        setTimeout(() => {
          if (!prev.items[0]?.product_id) {
            productRefs.current[0]?.querySelector?.("input")?.focus?.();
          }
        }, 100);
      } else {
        setCustomerWholesalePrices({});
      }
      return next;
    });
  };

  useEffect(() => {
    if (form.customer_id) {
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
  }, [form.customer_id]);

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

  const handleHeaderChange = (e) => {
    const { name, value } = e.target;
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
    if (!receiveTouched && form.invoice_type !== "credit") next.total_receive = next.total ?? "";
    if (!receiveTouched && form.invoice_type === "credit") next.total_receive = "";
    setForm(next);
  };

  function handleItemChange(index, field, rawValue) {
    let value = rawValue;
    const allowNegative = field === "item_discount_percentage";
    if (field === "price" || field === "pack_price" || field === "item_discount_percentage") {
      value = sanitizeNumberInput(value, true, allowNegative);
      if (field === "item_discount_percentage" && (value === "-" || value === "-."))
        return setForm((prev) => {
          const items = [...prev.items];
          items[index] = { ...items[index], item_discount_percentage: value };
          return { ...prev, items };
        });
    } else if (
      field === "pack_quantity" ||
      field === "unit_quantity" ||
      field === "pack_bonus" ||
      field === "unit_bonus" ||
      field === "bonus" ||
      field === "pack_size"
    ) {
      value = sanitizeNumberInput(value, false, false);
    }

    setForm((prev) => {
      const items = [...prev.items];
      const currentRow = { ...items[index], [field]: value };

      if (field === "price" || field === "pack_price") {
        currentRow.is_custom_price = true;
      }

      const row = recalcWholesaleItem(currentRow, field);

      if (field === "price" || field === "pack_price") {
        const productId = row.product_id;
        const productData = productDataCache[productId] || row.product || {};
        const packSize = Math.max(1, Number(row.pack_size || productData?.pack_size || 1));
        const minUnitPrice =
          Number(productData?.unit_purchase_price || 0) ||
          (Number(productData?.pack_purchase_price || 0) > 0
            ? Number(productData.pack_purchase_price) / packSize
            : 0);
        const currentUnitPrice = Number(row.price || 0);

        if (currentUnitPrice > 0 && minUnitPrice > 0 && currentUnitPrice < minUnitPrice - 0.005) {
          setInvalidPriceRows((p) => ({ ...p, [index]: true }));
        } else {
          setInvalidPriceRows((p) => {
            const nextState = { ...p };
            delete nextState[index];
            return nextState;
          });
        }
      }

      items[index] = row;
      let updated = recalcFooter({ ...prev, items }, "items");
      if (!receiveTouched && prev.invoice_type !== "credit") updated.total_receive = updated.total ?? "";
      if (!receiveTouched && prev.invoice_type === "credit") updated.total_receive = "";
      return updated;
    });
  }

  const addRow = () => {
    setForm((prev) => {
      const next = {
        ...prev,
        items: [...prev.items, createEmptyRow()],
      };
      if (!receiveTouched) {
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
    if (!receiveTouched && form.invoice_type !== "credit") next.total_receive = next.total ?? "";
    if (!receiveTouched && form.invoice_type === "credit") next.total_receive = "";
    setForm(next);
  };

  const resolveId = (val) =>
    typeof val === "object" ? val?.id ?? val?.value ?? val?.product_id : val;

  const resetRow = (rowIndex) => {
    setForm((prev) => {
      const items2 = [...prev.items];
      items2[rowIndex] = createEmptyRow();
      let next = recalcFooter({ ...prev, items: items2 }, "items");
      if (!receiveTouched && prev.invoice_type !== "credit") next.total_receive = next.total ?? "";
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

    let isNarcotic = selected?.narcotic === "yes";
    let freshProductData = null;

    if (productId) {
      try {
        const { data } = await axios.get(`/api/products/${productId}`);
        isNarcotic = data?.narcotic === "yes";
        freshProductData = data;

        setProductDataCache((prev) => ({
          ...prev,
          [productId]: {
            pack_purchase_price: Number(data?.pack_purchase_price || 0),
            unit_purchase_price: Number(data?.unit_purchase_price || 0),
            whole_sale_pack_price: Number(data?.whole_sale_pack_price || 0),
            whole_sale_unit_price: Number(data?.whole_sale_unit_price || 0),
            pack_sale_price: Number(data?.pack_sale_price || 0),
            unit_sale_price: Number(data?.unit_sale_price || 0),
            pack_size: Number(data?.pack_size || 1),
            margin: data?.whole_sale_margin || data?.margin || "",
          },
        }));
      } catch {
        if (selected) {
          setProductDataCache((prev) => ({
            ...prev,
            [productId]: {
              pack_purchase_price: Number(selected?.pack_purchase_price || 0),
              unit_purchase_price: Number(selected?.unit_purchase_price || 0),
              whole_sale_pack_price: Number(selected?.whole_sale_pack_price || 0),
              whole_sale_unit_price: Number(selected?.whole_sale_unit_price || 0),
              pack_sale_price: Number(selected?.pack_sale_price || 0),
              unit_sale_price: Number(selected?.unit_sale_price || 0),
              pack_size: Number(selected?.pack_size || 1),
              margin: selected?.whole_sale_margin || selected?.margin || "",
            },
          }));
        }
      }
    }

    const packSize = Math.max(1, Number(freshProductData?.pack_size ?? selected?.pack_size ?? 1));
    const baseAvailableUnits = Number(
      freshProductData?.quantity ??
        freshProductData?.available_units ??
        selected?.quantity ??
        selected?.available_units ??
        0
    );

    let currentRowExistingUnits = 0;
    if (saleId && originalInvoiceQuantities[rowIndex]) {
      currentRowExistingUnits = Number(originalInvoiceQuantities[rowIndex].total_units || 0);
    }
    const displayAvailableUnits = baseAvailableUnits + currentRowExistingUnits;

    // Resolve Pack Wholesale Price & Unit Wholesale Price (with Customer Custom Price priority + Retail fallback)
    let packPrice = 0;
    let unitPrice = 0;
    let isCustomPrice = false;

    const customCustomerPackPrice =
      form.customer_id && customerWholesalePrices[productId]
        ? Number(customerWholesalePrices[productId])
        : 0;

    const catalogWholeSalePack = Number(
      freshProductData?.whole_sale_pack_price ?? selected?.whole_sale_pack_price ?? 0
    );
    const catalogWholeSaleUnit = Number(
      freshProductData?.whole_sale_unit_price ?? selected?.whole_sale_unit_price ?? 0
    );
    const catalogRetailPack = Number(
      freshProductData?.pack_sale_price ?? selected?.pack_sale_price ?? 0
    );
    const catalogRetailUnit = Number(
      freshProductData?.unit_sale_price ?? selected?.unit_sale_price ?? 0
    );

    if (customCustomerPackPrice > 0) {
      packPrice = customCustomerPackPrice;
      unitPrice = Number((customCustomerPackPrice / packSize).toFixed(2));
      isCustomPrice = true;
    } else if (catalogWholeSalePack > 0) {
      packPrice = catalogWholeSalePack;
      unitPrice =
        catalogWholeSaleUnit > 0
          ? catalogWholeSaleUnit
          : Number((catalogWholeSalePack / packSize).toFixed(2));
    } else if (catalogWholeSaleUnit > 0) {
      unitPrice = catalogWholeSaleUnit;
      packPrice = Number((catalogWholeSaleUnit * packSize).toFixed(2));
    } else if (catalogRetailPack > 0) {
      packPrice = catalogRetailPack;
      unitPrice =
        catalogRetailUnit > 0
          ? catalogRetailUnit
          : Number((catalogRetailPack / packSize).toFixed(2));
    } else if (catalogRetailUnit > 0) {
      unitPrice = catalogRetailUnit;
      packPrice = Number((catalogRetailUnit * packSize).toFixed(2));
    }

    const batchList = await fetchBatches(productId);
    const assignedBatches = (batchList || []).filter(
      (b) => !b.is_unbatched && b.batch_number && String(b.batch_number).trim() !== ""
    );
    const hasAssignedBatches = assignedBatches.length > 0;
    const hasBatches = Array.isArray(batchList) && batchList.length > 0;

    const usedOnOtherRowsPre = (form.items || [])
      .filter((r, idx) => idx !== rowIndex && eqId(r.product_id, productId))
      .map((r) => (r.batch_number ? String(r.batch_number).trim() : r.is_unbatched ? "__unbatched__" : ""));

    if (!hasBatches && usedOnOtherRowsPre.length > 0) {
      invoiceErrors.showMessage(
        `"${
          freshProductData?.name || selected?.name || "This product"
        }" has no batches and is already added on row ${
          form.items.findIndex((r, idx) => idx !== rowIndex && eqId(r.product_id, productId)) + 1
        }.`
      );
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
      invoiceErrors.showMessage(
        `All batches and unassigned stock for "${
          freshProductData?.name || selected?.name || "this product"
        }" are already allocated on earlier rows.`
      );
      resetRow(rowIndex);
      setTimeout(() => {
        productRefs.current[rowIndex]?.querySelector?.("input")?.focus?.();
      }, 40);
      return;
    }

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
      const isSameProd = eqId(currentRowProductId, productId);
      const shouldPreserveBatch = isSameProd && (existingBatchNumber || existingIsUnbatched);

      const usedOnOtherRows = items
        .filter((r, idx) => idx !== rowIndex && eqId(r.product_id, productId))
        .map((r) => (r.batch_number ? String(r.batch_number).trim() : r.is_unbatched ? "__unbatched__" : ""));

      const availableBatches = (batchList || []).filter((b) => {
        const key = b.is_unbatched ? "__unbatched__" : String(b.batch_number).trim();
        return !usedOnOtherRows.includes(key);
      });

      const fefoBatch = hasBatches
        ? availableBatches.find((b) => !b.is_unbatched && !b.is_expired && b.available_units > 0) ||
          availableBatches.find((b) => !b.is_unbatched && b.available_units > 0) ||
          availableBatches.find((b) => b.is_unbatched && b.available_units > 0) ||
          availableBatches[0] ||
          batchList[0]
        : null;

      const allocatedBatchNumber = shouldPreserveBatch
        ? existingBatchNumber
        : !hasAssignedBatches
        ? ""
        : fefoBatch && !fefoBatch.is_unbatched
        ? fefoBatch.batch_number
        : "";
      const allocatedExpiry = shouldPreserveBatch
        ? existingExpiry
        : !hasAssignedBatches
        ? ""
        : fefoBatch && !fefoBatch.is_unbatched
        ? fefoBatch.expiry || fefoBatch.expiry_date || ""
        : "";
      const allocatedIsUnbatched = shouldPreserveBatch
        ? existingIsUnbatched
        : !hasAssignedBatches
        ? true
        : Boolean(fefoBatch?.is_unbatched);

      const batchAvailableUnits = Number(fefoBatch?.available_units ?? displayAvailableUnits);
      const effectivePackPrice =
        !isCustomPrice && !allocatedIsUnbatched && fefoBatch && Number(fefoBatch.whole_sale_pack_price) > 0
          ? Number(fefoBatch.whole_sale_pack_price)
          : packPrice;
      const effectiveUnitPrice =
        !isCustomPrice && !allocatedIsUnbatched && fefoBatch && Number(fefoBatch.whole_sale_unit_price) > 0
          ? Number(fefoBatch.whole_sale_unit_price)
          : unitPrice;

      // Default to 1 Pack if at least 1 pack is in stock and packSize > 1, otherwise 1 Unit
      const defaultPackQty = isSameProd
        ? items[rowIndex].pack_quantity
        : packSize > 1 && batchAvailableUnits >= packSize
        ? "1"
        : "";
      const defaultUnitQty = isSameProd
        ? items[rowIndex].unit_quantity
        : packSize <= 1 || batchAvailableUnits < packSize
        ? "1"
        : "";

      items[rowIndex] = recalcWholesaleItem(
        {
          ...items[rowIndex],
          product_id: productId,
          product_name:
            freshProductData?.name ?? selected?.name ?? items[rowIndex]?.product_name ?? "",
          product: freshProductData ?? (selected?.id ? selected : null),
          pack_size: packSize,
          pack_price: effectivePackPrice,
          price: effectiveUnitPrice,
          batch_number: allocatedBatchNumber,
          is_unbatched: allocatedIsUnbatched,
          expiry: allocatedExpiry,
          current_quantity: String(batchAvailableUnits),
          pack_quantity: defaultPackQty,
          unit_quantity: defaultUnitQty,
          pack_bonus: isSameProd ? items[rowIndex]?.pack_bonus ?? "" : "",
          unit_bonus: isSameProd ? items[rowIndex]?.unit_bonus ?? "" : "",
          bonus: isSameProd ? items[rowIndex]?.bonus ?? "" : "",
          item_discount_percentage: items[rowIndex]?.item_discount_percentage ?? "",
          is_narcotic: isNarcotic,
          is_custom_price: isCustomPrice,
        },
        "product_select"
      );

      let next = recalcFooter({ ...prev, items }, "items");
      if (!receiveTouched && prev.invoice_type !== "credit") next.total_receive = next.total ?? "";
      if (!receiveTouched && prev.invoice_type === "credit") next.total_receive = "";
      return next;
    });

    setTimeout(() => {
      if (hasAssignedBatches) {
        batchRefs.current[rowIndex]?.querySelector?.("input")?.focus?.();
      } else if (packSize > 1) {
        packQtyRefs.current[rowIndex]?.focus?.();
        packQtyRefs.current[rowIndex]?.select?.();
      } else {
        unitQtyRefs.current[rowIndex]?.focus?.();
        unitQtyRefs.current[rowIndex]?.select?.();
      }
    }, 40);
  };

  const handleBatchSelect = async (rowIndex, batchNum, batchObj = null) => {
    const row0 = form.items[rowIndex];
    if (!row0?.product_id) return;

    if (batchObj?.is_unbatched || batchNum === "" || batchNum === "__unbatched__") {
      const batches = await fetchBatches(row0.product_id);
      const unbatchedItem = batchObj || (batches || []).find((x) => x.is_unbatched);
      let unbatchedAvailable = unbatchedItem?.available_units;
      if (unbatchedAvailable == null) {
        try {
          const res = await axios.get(
            `/api/products/available-quantity?product_id=${row0.product_id}&batch=`
          );
          unbatchedAvailable = Number(res?.data?.unbatched_units ?? res?.data?.available_units ?? 0);
        } catch {
          unbatchedAvailable = 0;
        }
      }
      handleBatchSelectWithCalculatedAvailable(rowIndex, "", unbatchedAvailable, "", true, unbatchedItem);
      return;
    }

    try {
      const batches = await fetchBatches(row0.product_id);
      const b = batchObj || (batches || []).find((x) => String(x.batch_number) === String(batchNum));

      const baseAvailable = Number(b?.available_units ?? 0);
      const batchExpiry = b?.expiry || b?.expiry_date || "";

      if (b?.is_expired) {
        toast.error(
          `Warning: Batch ${batchNum} is EXPIRED (${batchExpiry}). Supervisor override required.`,
          { id: "expired-batch-warn-ws" }
        );
      }

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
          handleBatchSelectWithCalculatedAvailable(rowIndex, batchNum, apiAvailable, batchExpiry, false, b);
          return;
        }
      } catch {}

      handleBatchSelectWithCalculatedAvailable(rowIndex, batchNum, baseAvailable, batchExpiry, false, b);
    } catch {}
  };

  const handleBatchSelectWithCalculatedAvailable = (
    rowIndex,
    batchNum,
    baseAvailable,
    batchExpiry = "",
    isUnbatched = false,
    batchPricingObj = null
  ) => {
    const available = Number(baseAvailable || 0);
    const exp = isUnbatched ? "" : batchExpiry || asISODate(form.items[rowIndex]?.expiry || "");
    const packSize = Math.max(1, Number(form.items[rowIndex]?.pack_size || 1));

    setForm((prev) => {
      const items = [...prev.items];
      const currentRow = items[rowIndex] || {};
      const nextPackPrice =
        !currentRow.is_custom_price && batchPricingObj && Number(batchPricingObj.whole_sale_pack_price) > 0
          ? Number(batchPricingObj.whole_sale_pack_price)
          : currentRow.pack_price;
      const nextUnitPrice =
        !currentRow.is_custom_price && batchPricingObj && Number(batchPricingObj.whole_sale_unit_price) > 0
          ? Number(batchPricingObj.whole_sale_unit_price)
          : currentRow.price;
      const updated = {
        ...currentRow,
        pack_price: nextPackPrice,
        price: nextUnitPrice,
        batch_number: batchNum,
        is_unbatched: isUnbatched,
        expiry: exp,
        current_quantity: String(available),
      };
      items[rowIndex] = recalcWholesaleItem(updated, "batch_select");
      let next = recalcFooter({ ...prev, items }, "items");
      if (!receiveTouched && prev.invoice_type !== "credit") next.total_receive = next.total ?? "";
      if (!receiveTouched && prev.invoice_type === "credit") next.total_receive = "";
      return next;
    });
    setTimeout(() => {
      if (packSize > 1) {
        packQtyRefs.current[rowIndex]?.focus?.();
        packQtyRefs.current[rowIndex]?.select?.();
      } else {
        unitQtyRefs.current[rowIndex]?.focus?.();
        unitQtyRefs.current[rowIndex]?.select?.();
      }
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

  const handleSubmit = async (e) => {
    e.preventDefault();
    invoiceErrors.clear();

    let effectiveCustomerId = form.customer_id;
    if (!effectiveCustomerId && form.invoice_type !== "credit") {
      effectiveCustomerId = getDefaultCustomerId();
      if (effectiveCustomerId) {
        setForm((prev) => ({ ...prev, customer_id: effectiveCustomerId }));
      }
    }

    if (!effectiveCustomerId) {
      return invoiceErrors.showMessage(
        form.invoice_type === "credit"
          ? "Please select a customer for credit sale"
          : "Please select a customer for wholesale sale"
      );
    }

    const hasNarcoticProduct = form.items.some((item) => item.is_narcotic === true);
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
      if (!it.product_id) return invoiceErrors.showMessage(`Row ${i + 1}: select a product`, i);
      const list = batchesByProduct[String(it.product_id)];
      const hasBatches = Array.isArray(list) && list.some((b) => !b.is_unbatched && b.batch_number);
      if (hasBatches && !it.batch_number && !it.is_unbatched)
        return invoiceErrors.showMessage(`Row ${i + 1}: select a batch or unbatched stock`, i);

      const billedUnits = Number(it.quantity || 0);
      const bonusUnits = Number(it.bonus || 0);
      const totalStockNeeded = billedUnits + bonusUnits;

      if (billedUnits <= 0) {
        return invoiceErrors.showMessage(`Row ${i + 1}: enter Pack Qty or Unit Qty`, i);
      }
      const available = Number(it.current_quantity || 0);
      if (totalStockNeeded > available) {
        return invoiceErrors.showMessage(
          `Row ${i + 1}: total units (${billedUnits}${bonusUnits > 0 ? ` + ${bonusUnits} bonus` : ""}) exceeds available stock (${available} units)`,
          i
        );
      }

      // Validate minimum price against unit purchase price
      const productData = productDataCache[it.product_id] || it.product || {};
      const packSize = Math.max(1, Number(it.pack_size || productData?.pack_size || 1));
      const minUnitPrice =
        Number(productData?.unit_purchase_price || 0) ||
        (Number(productData?.pack_purchase_price || 0) > 0
          ? Number(productData.pack_purchase_price) / packSize
          : 0);

      if (Number(it.price || 0) < minUnitPrice - 0.005 && minUnitPrice > 0) {
        return invoiceErrors.showMessage(
          `Row ${i + 1}: Unit price (${Number(it.price || 0).toFixed(2)}) cannot be less than unit purchase cost (${minUnitPrice.toFixed(2)})`,
          i
        );
      }
    }

    // Unique product batch & unassigned validation
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
            return invoiceErrors.showMessage(
              `Row ${i + 1}: Unassigned stock for "${pName}" can only be added once per invoice.`,
              i
            );
          } else {
            return invoiceErrors.showMessage(
              `Row ${i + 1}: Duplicate batch "${it.batch_number}" for "${pName}". Each batch can only be selected once.`,
              i
            );
          }
        }
        seenProductBatches.add(uniqueKey);
      }
    }

    // total_receive & Walk-In Customer unpaid credit (Udhar) validation
    {
      const totalNum = Math.round(Number(form.total || 0));
      const recvNum = Math.round(Number(form.total_receive || 0));
      if (recvNum < 0) return invoiceErrors.showMessage("Total Receive cannot be negative");
      if (form.invoice_type !== "credit" && recvNum > totalNum) {
        return invoiceErrors.showMessage("Total Receive cannot exceed Total");
      }

      const resolvedCustomer = (customersRef.current || customers || []).find(
        (c) => String(c.id) === String(effectiveCustomerId)
      );
      const cashTenderedUnderpaid =
        form.cash_given !== "" &&
        form.cash_given !== undefined &&
        Number(form.cash_given) < totalNum;

      if (
        isWalkInCustomer(resolvedCustomer) &&
        (form.invoice_type === "credit" || recvNum < totalNum || cashTenderedUnderpaid)
      ) {
        setCustomerSearchOpen(true);
        return invoiceErrors.showMessage(WALK_IN_CREDIT_ERROR);
      }
    }

    const payload = {
      ...form,
      customer_id: effectiveCustomerId,
      sale_type: "wholesale",
      wholesale_type: "pack",
      invoice_type: form.invoice_type ?? "debit",
      due_date: form.due_date || undefined,
      discount_percentage:
        form.discount_percentage === "-" || form.discount_percentage === "-."
          ? "-0"
          : form.discount_percentage,
      items: form.items.map((it) => {
        const packSize = Math.max(1, Number(it.pack_size || 1));
        const packQty = Math.max(0, Math.floor(Number(it.pack_quantity || 0)));
        const unitQty = Math.max(0, Math.floor(Number(it.unit_quantity || 0)));
        const totalUnits = packQty * packSize + unitQty || Math.max(0, Math.floor(Number(it.quantity || 0)));
        const packBonus = Math.max(0, Math.floor(Number(it.pack_bonus || 0)));
        const unitBonus = Math.max(0, Math.floor(Number(it.unit_bonus || 0)));
        const bonusUnits =
          packBonus * packSize + unitBonus || Math.max(0, Math.floor(Number(it.bonus || 0)));
        const unitPrice = Number(it.price || 0);
        const packPrice =
          Number(it.pack_price || 0) > 0
            ? Number(it.pack_price)
            : Number((unitPrice * packSize).toFixed(2));

        const isNewItem = String(it.id).startsWith("row_") || !it.id;
        const { id, ...itemWithoutId } = it;
        return {
          ...itemWithoutId,
          ...(isNewItem ? {} : { id: parseInt(it.id, 10) }),
          sale_type: "wholesale",
          pack_size: packSize,
          pack_quantity: packQty,
          unit_quantity: unitQty,
          quantity: totalUnits,
          pack_bonus: packBonus,
          unit_bonus: unitBonus,
          bonus: bonusUnits,
          pack_price: packPrice,
          price: unitPrice,
          item_discount_percentage:
            it.item_discount_percentage === "-" || it.item_discount_percentage === "-."
              ? "-0"
              : it.item_discount_percentage || 0,
        };
      }),
    };
    delete payload.cash_given;

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
          try {
            localStorage.setItem("cash_drawer_sync", String(Date.now()));
          } catch {}
          try {
            localStorage.setItem("accounts_sync", String(Date.now()));
          } catch {}
          toast.success("Wholesale invoice updated");
          if (onSuccess) onSuccess(res.data);
          else navigate(`/sale-invoices/${id}`);
        } else {
          if (draftHook.activeDraftId) {
            dataPayload.draft_id = draftHook.activeDraftId;
          }
          const res = await axios.post("/api/sale-invoices", dataPayload);
          const id = res?.data?.id;
          window.dispatchEvent(new CustomEvent("cash-drawer-changed"));
          window.dispatchEvent(new CustomEvent("accounts-changed"));
          try {
            localStorage.setItem("cash_drawer_sync", String(Date.now()));
          } catch {}
          try {
            localStorage.setItem("accounts_sync", String(Date.now()));
          } catch {}
          draftHook.resetToNew();
          toast.success("Wholesale invoice created");
          if (onSuccess) onSuccess(res.data);
          else if (id) navigate(`/sale-invoices/${id}`);
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
            execute: (overrideCreds = {}) =>
              executeSave(
                { ...dataPayload, ...(overrideCreds || {}), credit_override: true },
                updateDrawer
              ),
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
            execute: (overrideCreds = {}) =>
              executeSave(
                { ...dataPayload, ...(overrideCreds || {}), discount_override: true },
                updateDrawer
              ),
          });
          return;
        }
        if (err?.response?.status === 422 && err?.response?.data?.requires_expired_override) {
          setExpiredOverridePrompt({
            isOpen: true,
            data: err.response.data,
            execute: (overrideCreds = {}) =>
              executeSave(
                { ...dataPayload, ...(overrideCreds || {}), expired_override: true },
                updateDrawer
              ),
          });
          return;
        }
        invoiceErrors.showError(err);
      }
    };

    if (saleId) {
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

  // --- scroll helpers ---
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

  // --- keyboard nav (Wholesale: product -> batch -> pack_quantity -> unit_quantity -> pack_bonus -> unit_bonus -> pack_price -> price -> disc) ---
  const COLS = [
    "product",
    "batch",
    "pack_quantity",
    "unit_quantity",
    "pack_bonus",
    "unit_bonus",
    "pack_price",
    "price",
    "disc",
  ];
  const focusCell = (row, col) => {
    const map = {
      product: productRefs,
      batch: batchRefs,
      pack_quantity: packQtyRefs,
      unit_quantity: unitQtyRefs,
      pack_bonus: packBonusRefs,
      unit_bonus: unitBonusRefs,
      pack_price: packPriceRefs,
      price: priceRefs,
      disc: discRefs,
    };
    const ref = map[col]?.current?.[row];
    if (!ref) return;
    const input = ref.querySelector?.("input") || ref;
    if (input?.focus) {
      input.focus();
      input.select?.();
    } else if (ref?.focus) {
      ref.focus();
    }
    setFocusedRowIndex(row);
    requestAnimationFrame(() => {
      scrollTargetIntoItemsView(input || ref);
    });
  };
  const moveSameCol = (row, col, dir) => {
    const lastIdx = form.items.length - 1;
    if (dir === 1) {
      if (row === lastIdx) {
        addRow();
        setTimeout(() => focusCell(row + 1, "product"), 40);
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
    if (e.shiftKey && e.key === "Tab") {
      e.preventDefault();
      const i = COLS.indexOf(col);
      if (i > 0) {
        focusCell(row, COLS[i - 1]);
      } else if (i === 0 && row > 0) {
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
        moveNextCol(row, col);
        break;
      default:
        break;
    }
  };

  /* ===================== R E N D E R ===================== */
  const selectedCustomer = (customers || []).find(
    (c) => String(c.id) === String(form.customer_id)
  );
  const customPricesCount = Object.keys(customerWholesalePrices || {}).length;

  return (
    <>
      <form
        className={`sale-entry sale-entry-form wholesale-entry-form flex flex-col flex-1 h-auto lg:h-[calc(100dvh-130px)] min-h-0 overflow-y-auto lg:overflow-hidden ${
          isDark ? "bg-slate-900" : "bg-white"
        }`}
        autoComplete="off"
        autoCapitalize="off"
        autoCorrect="off"
        spellCheck={false}
        onSubmit={(e) => {
          e.preventDefault();
          handleSubmit(e);
        }}
      >
        <InvoiceErrorSummary errors={invoiceErrors} />
        {/* Header */}
        <div
          className={`sale-entry-header shrink-0 sticky top-0 z-20 border-b ${
            isDark ? "border-slate-700" : "border-gray-200"
          }`}
        >
          {/* Branded Banner */}
          <div className="sale-entry-banner px-4 py-2.5 flex items-center justify-between gap-3 flex-wrap">
            <div className="flex items-center gap-3">
              <div
                className="w-9 h-9 rounded-xl flex items-center justify-center shadow-inner"
                style={{
                  backgroundColor: "rgba(255,255,255,0.18)",
                  backdropFilter: "blur(4px)",
                }}
              >
                <svg
                  width="20"
                  height="20"
                  viewBox="0 0 24 24"
                  fill="none"
                  stroke="#ffffff"
                  strokeWidth="1.8"
                  strokeLinecap="round"
                  strokeLinejoin="round"
                >
                  <path d="M21 16V8a2 2 0 0 0-1-1.73l-7-4a2 2 0 0 0-2 0l-7 4A2 2 0 0 0 3 8v8a2 2 0 0 0 1 1.73l7 4a2 2 0 0 0 2 0l7-4A2 2 0 0 0 21 16z" />
                  <polyline points="3.27 6.96 12 12.01 20.73 6.96" />
                  <line x1="12" y1="22.08" x2="12" y2="12" />
                </svg>
              </div>
              <div>
                <div className="flex items-center gap-2">
                  <h2 className="text-lg font-extrabold tracking-wide text-white leading-none">
                    Wholesale Invoice
                  </h2>
                  <span
                    className="px-2 py-0.5 rounded-md text-[9px] font-bold tracking-widest text-white"
                    style={{
                      backgroundColor: "rgba(255,255,255,0.22)",
                      backdropFilter: "blur(4px)",
                    }}
                  >
                    B2B PACK & UNIT
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
                <p className="text-[10px] text-white/80 mt-0.5">
                  Alt+S save · Enter=next field · ↑/↓ rows · Pack & Loose Units supported on every line
                </p>
              </div>
            </div>

            <div className="flex flex-wrap items-center gap-2">
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
              <div className="sale-type-toggle flex flex-wrap items-center gap-2" role="radiogroup" aria-label="Invoice payment type">
                {["debit", "credit"].map((type) => {
                  const active = form.invoice_type === type;
                  return (
                    <button
                      key={type}
                      type="button"
                      role="radio"
                      aria-checked={active}
                      onClick={() => handleInvoiceTypeChange(type)}
                      className={`sale-type-option text-xs font-semibold ${
                        active
                          ? "is-active theme-btn-primary shadow-sm"
                          : "opacity-75 hover:opacity-100 hover:bg-black/5 dark:hover:bg-white/5"
                      }`}
                      aria-pressed={active}
                    >
                      {active && <CheckIcon aria-hidden="true" />}
                      <span>{type === "debit" ? "Debit (Cash)" : "Credit (Ledger)"}</span>
                    </button>
                  );
                })}
              </div>

              <button
                type="submit"
                className={`px-4 py-2 text-[11px] font-bold transition-all duration-200 ${btnPrimary.className}`}
                style={btnPrimary.style}
              >
                {saleId ? "Update (Alt+S)" : "Create (Alt+S)"}
              </button>
            </div>
          </div>
        </div>

        {/* Main workspace: Full-width Top Details + Full-width Items Table + Bottom Summary Footer */}
        <div
          className={`sale-entry-workspace flex-1 min-h-0 flex flex-col gap-2 p-2 overflow-visible lg:overflow-hidden ${
            isDark ? "bg-slate-900" : "bg-slate-50/50"
          }`}
        >
          {/* FULL-WIDTH TOP + ITEMS SECTION */}
          <div className="flex flex-col min-h-0 flex-1 gap-1.5 overflow-hidden">
            {/* Top Banner Details Card */}
            <div
              className={`sale-entry-details px-3 py-2 rounded-xl border shrink-0 ${
                isDark
                  ? "bg-slate-800/80 border-slate-700"
                  : "bg-white border-gray-200 shadow-2xs"
              }`}
            >
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
                  <label className="block text-[9.5px] font-semibold uppercase tracking-wider text-gray-500 dark:text-gray-400 mb-0.5">
                    Date
                  </label>
                  <input
                    type="date"
                    name="date"
                    value={form.date ?? ""}
                    onChange={handleHeaderChange}
                    autoComplete="off"
                    className="w-full h-7 border border-gray-300 dark:border-slate-600 rounded-md px-2 text-xs bg-white dark:bg-slate-700 text-gray-900 dark:text-slate-100"
                  />
                </div>

                <div
                  className={`col-span-2 sm:col-span-2 ${
                    isPharmacy ? "lg:col-span-4" : "lg:col-span-8"
                  }`}
                >
                  <label className="flex items-center justify-between text-[9.5px] font-semibold uppercase tracking-wider text-gray-500 dark:text-gray-400 mb-0.5">
                    <span>Wholesale Customer *</span>
                    {customPricesCount > 0 && (
                      <span className="text-[9px] font-bold text-emerald-600 dark:text-emerald-400">
                        {customPricesCount} Contracted Rate{customPricesCount === 1 ? "" : "s"}
                      </span>
                    )}
                  </label>
                  <button
                    ref={customerSelectRef}
                    type="button"
                    onClick={() => setCustomerSearchOpen(true)}
                    className={`w-full h-7 px-2.5 rounded-md border text-left text-xs flex items-center justify-between transition-all ${
                      selectedCustomer
                        ? "border-blue-500 bg-blue-50/80 dark:bg-blue-900/30 text-blue-700 dark:text-blue-200"
                        : "border-gray-300 dark:border-slate-600 bg-white dark:bg-slate-700 text-gray-700 dark:text-gray-300 hover:border-blue-400"
                    }`}
                    title={
                      selectedCustomer?.name ||
                      (form.customer_id ? `Customer #${form.customer_id}` : "Select customer...")
                    }
                  >
                    <span className="truncate font-medium flex items-center gap-1.5">
                      <svg
                        width="13"
                        height="13"
                        viewBox="0 0 24 24"
                        fill="none"
                        stroke="currentColor"
                        strokeWidth="2"
                        strokeLinecap="round"
                        strokeLinejoin="round"
                        className="shrink-0 text-blue-500"
                      >
                        <path d="M20 21v-2a4 4 0 0 0-4-4H8a4 4 0 0 0-4 4v2" />
                        <circle cx="12" cy="7" r="4" />
                      </svg>
                      <span className="truncate">
                        {selectedCustomer?.name ||
                          (form.customer_id
                            ? `Customer #${form.customer_id}`
                            : "Select customer...")}
                      </span>
                    </span>
                    <span className="text-[10px] text-gray-400 dark:text-slate-400 shrink-0 font-normal">
                      Search
                    </span>
                  </button>
                </div>

                {isPharmacy && (
                  <div className="col-span-1 sm:col-span-3 lg:col-span-2">
                    <label className="block text-[9.5px] font-semibold uppercase tracking-wider text-gray-500 dark:text-gray-400 mb-0.5">
                      Doctor
                    </label>
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
                    <label className="block text-[9.5px] font-semibold uppercase tracking-wider text-gray-500 dark:text-gray-400 mb-0.5">
                      Patient
                    </label>
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

                {/* Customer Credit / Balance Strip (always visible when customer has balance or in credit mode) */}
                {(form.invoice_type === "credit" ||
                  Number(customerCreditSummary?.current_balance || 0) > 0 ||
                  selectedCustomer?.credit_status === "on_hold" ||
                  selectedCustomer?.credit_status === "blocked") && (
                  <div className="col-span-full py-1.5 px-3 rounded-md bg-amber-50/90 dark:bg-amber-950/40 border border-amber-200 dark:border-amber-800 flex flex-wrap items-center justify-between gap-2 text-xs">
                    <div className="flex items-center gap-3 flex-wrap">
                      <span className="font-semibold text-amber-900 dark:text-amber-200 flex items-center gap-1.5">
                        <span>Credit Status:</span>
                        <span
                          className={`px-1.5 py-0.5 rounded text-[10px] font-bold uppercase ${
                            selectedCustomer?.credit_status === "blocked"
                              ? "bg-red-100 text-red-700 dark:bg-red-900/60 dark:text-red-300"
                              : selectedCustomer?.credit_status === "on_hold"
                              ? "bg-yellow-100 text-yellow-800 dark:bg-yellow-900/60 dark:text-yellow-300"
                              : "bg-emerald-100 text-emerald-800 dark:bg-emerald-900/60 dark:text-emerald-300"
                          }`}
                        >
                          {selectedCustomer?.credit_status || "active"}
                        </span>
                      </span>
                      <span className="text-gray-600 dark:text-gray-300">
                        Terms:{" "}
                        <strong>
                          {selectedCustomer?.credit_days
                            ? `${selectedCustomer.credit_days} days`
                            : "Immediate"}
                        </strong>
                      </span>
                      <span className="text-gray-600 dark:text-gray-300">
                        Credit Limit:{" "}
                        <strong>
                          {Number(selectedCustomer?.credit_limit) > 0
                            ? `Rs. ${Number(selectedCustomer.credit_limit).toLocaleString()}`
                            : "Unlimited"}
                        </strong>
                      </span>
                      {customerCreditSummary && (
                        <>
                          <span className="text-gray-600 dark:text-gray-300">
                            Prev. Balance:{" "}
                            <strong className="font-mono">
                              Rs. {Number(customerCreditSummary.current_balance || 0).toLocaleString()}
                            </strong>
                          </span>
                          {Number(selectedCustomer?.credit_limit) > 0 && (
                            <span
                              className={`font-semibold ${
                                customerCreditSummary.available_credit <= 0
                                  ? "text-red-600 dark:text-red-400"
                                  : "text-emerald-600 dark:text-emerald-400"
                              }`}
                            >
                              Available Credit: Rs.{" "}
                              {Number(customerCreditSummary.available_credit || 0).toLocaleString()}
                            </span>
                          )}
                        </>
                      )}
                    </div>
                    {form.invoice_type === "credit" && (
                      <div className="flex items-center gap-2">
                        <label className="text-[10px] font-bold text-gray-600 dark:text-gray-300 uppercase tracking-wider">
                          Due Date:
                        </label>
                        <input
                          type="date"
                          name="due_date"
                          value={form.due_date || ""}
                          onChange={handleHeaderChange}
                          className="h-6 px-1.5 text-xs rounded border border-amber-300 dark:border-amber-700 bg-white dark:bg-slate-800 text-gray-900 dark:text-gray-100 font-mono"
                        />
                      </div>
                    )}
                  </div>
                )}

                {/* Row 2: Remarks + Items & Units Counter */}
                <div className="col-span-2 sm:col-span-4 lg:col-span-8">
                  <label className="block text-[9.5px] font-semibold uppercase tracking-wider text-gray-500 dark:text-gray-400 mb-0.5">
                    Remarks / Delivery Note
                  </label>
                  <input
                    type="text"
                    name="remarks"
                    value={form.remarks ?? ""}
                    placeholder="B2B wholesale remarks, bilty #, transporter, or delivery notes..."
                    onChange={handleHeaderChange}
                    autoComplete="off"
                    className="w-full h-7 border border-gray-300 dark:border-slate-600 rounded-md px-2 text-xs bg-white dark:bg-slate-700 text-gray-900 dark:text-slate-100"
                  />
                </div>

                <div className="col-span-2 sm:col-span-2 lg:col-span-4">
                  <label className="flex items-center justify-between text-[9.5px] font-semibold uppercase tracking-wider text-gray-500 dark:text-gray-400 mb-0.5">
                    <span>Order Breakdown</span>
                    <span className="text-[8.5px] font-medium lowercase opacity-75">live</span>
                  </label>
                  <div className="sale-readonly-field w-full h-7 rounded-md px-2 text-[11px] font-bold flex items-center justify-between font-mono">
                    <span>
                      {form.items.filter((r) => r.product_id).length || form.items.length}{" "}
                      {form.items.length === 1 ? "line" : "lines"}
                    </span>
                    <span className="text-blue-600 dark:text-blue-400">
                      {invoiceQtySummary.totalPacks}P + {invoiceQtySummary.totalLooseUnits}U (
                      {invoiceQtySummary.totalBilledUnits})
                      {invoiceQtySummary.totalBonusUnits > 0
                        ? ` +${
                            invoiceQtySummary.totalPackBonus > 0
                              ? `${invoiceQtySummary.totalPackBonus}PB`
                              : ""
                          }${
                            invoiceQtySummary.totalPackBonus > 0 &&
                            invoiceQtySummary.totalUnitBonus > 0
                              ? "+"
                              : ""
                          }${
                            invoiceQtySummary.totalUnitBonus > 0
                              ? `${invoiceQtySummary.totalUnitBonus}UB`
                              : ""
                          } (${invoiceQtySummary.totalBonusUnits}B)`
                        : ""}
                    </span>
                  </div>
                </div>
              </div>
            </div>

            {/* Items Table Card */}
            <div className="flex flex-col min-h-0 flex-1">
              <div className="flex items-center justify-between mb-1 px-0.5">
                <div
                  className={`text-[11px] font-bold tracking-wide uppercase ${
                    isDark ? "text-slate-300" : "text-gray-700"
                  }`}
                >
                  Wholesale Line Items (Packs + Loose Units + Bonus Scheme)
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

              <div
                ref={itemsScrollRef}
                className={`sale-entry-items flex-1 overflow-auto relative ${
                  isDark ? "border-slate-700 bg-slate-800" : "border-gray-200 bg-white"
                }`}
              >
                <table
                  className="invoice-repeater-table w-full min-w-[920px] text-[11px] lg:table-fixed border-collapse"
                  autoComplete="off"
                >
                  <thead
                    className={`sticky top-0 z-20 ${
                      isDark
                        ? "bg-slate-800/95 backdrop-blur-xs border-slate-700"
                        : "bg-white/95 backdrop-blur-xs border-gray-200"
                    } border-b`}
                  >
                    <tr className="[&>th]:text-left">
                      <th
                        className={`w-7 text-center ${
                          isDark ? "text-rose-400" : "text-red-600"
                        }`}
                      >
                        DEL
                      </th>
                      <th className="w-7 text-center sale-th-readonly">#</th>
                      <th className="min-w-[200px] w-[22%] sale-th-editable">Product *</th>
                      <th className="min-w-[76px] w-12 text-center sale-th-readonly" title="Pack Size (Auto)">
                        PSize
                      </th>
                      <th className="min-w-[130px] w-[11%] sale-th-editable">Batch</th>
                      <th className="min-w-[76px] w-21 text-center sale-th-readonly" title="Expiry Date (Auto)">
                        Expiry
                      </th>
                      <th
                        className="min-w-[76px] w-23 text-center sale-th-readonly"
                        title="Available Stock in Packs & Units (Auto)"
                      >
                        Avail (P/U)
                      </th>
                      <th
                        className="min-w-[76px] w-15 text-center sale-th-editable"
                        title="Number of Full Packs"
                      >
                        Pack.Q
                      </th>
                      <th
                        className="min-w-[76px] w-15 text-center sale-th-editable"
                        title="Number of Loose Units"
                      >
                        Unit.Q
                      </th>
                      <th
                        className="min-w-[76px] w-14 text-center sale-th-editable"
                        title="Free Bonus Packs (deducted from stock, not billed)"
                      >
                        Pack.B
                      </th>
                      <th
                        className="min-w-[76px] w-14 text-center sale-th-editable"
                        title="Free Bonus Loose Units (deducted from stock, not billed)"
                      >
                        Unit.B
                      </th>
                      <th
                        className="min-w-[76px] w-15 text-center sale-th-readonly"
                        title="Total Billed Units (Pack.Q × PSize + Unit.Q)"
                      >
                        Tot.U
                      </th>
                      <th
                        className="min-w-[76px] w-21 text-center sale-th-editable"
                        title="Wholesale Pack Price (Synced with Unit Price)"
                      >
                        Pack.P *
                      </th>
                      <th
                        className="min-w-[76px] w-20 text-center sale-th-editable"
                        title="Wholesale Unit Price (Synced with Pack Price)"
                      >
                        Unit.P *
                      </th>
                      <th className="min-w-[76px] w-15 text-center sale-th-editable">Disc %</th>
                      <th
                        className="min-w-[76px] w-24 text-center sale-th-readonly"
                        title="Row Sub Total (Auto)"
                      >
                        Sub Total
                      </th>
                      <th className="w-7 text-center">+</th>
                    </tr>
                  </thead>
                  <tbody className="[&>tr>td]:py-1.5 [&>tr>td]:px-1">
                    {form.items.map((it, i) => {
                      const totalRowStockNeeded =
                        Number(it.quantity || 0) + Number(it.bonus || 0);
                      const isOverStock =
                        it.product_id &&
                        totalRowStockNeeded > Number(it.current_quantity || 0);
                      return (
                        <tr
                          key={it.id}
                          id={invoiceErrors.rowId(i)}
                          onFocusCapture={() => setFocusedRowIndex(i)}
                          aria-invalid={invoiceErrors.rowMessages(i).length > 0 || undefined}
                          className={`invoice-repeater-row ${
                            invoiceErrors.rowMessages(i).length ? "invoice-row-invalid" : ""
                          } border-b ${isDark ? "border-slate-700/80" : "border-gray-100"}`}
                        >
                          <td className="invoice-cell-del text-center">
                            <button
                              type="button"
                              tabIndex={-1}
                              onClick={() => removeRow(i)}
                              aria-label="Remove item"
                              title="Remove item"
                              className="sale-item-action sale-item-remove"
                            >
                              <TrashIcon aria-hidden="true" />
                            </button>
                          </td>
                          <td
                            data-label="Item #"
                            className={`invoice-cell-index text-center font-semibold text-[11px] ${
                              isDark ? "text-slate-400" : "text-gray-500"
                            }`}
                          >
                            {i + 1}
                          </td>

                          {/* Product */}
                          <td data-label="Product *" className="invoice-cell-product">
                            <InvoiceRowError messages={invoiceErrors.rowMessages(i)} />
                            <div ref={(el) => (productRefs.current[i] = el)}>
                              <ProductSearchInput
                                value={
                                  products.find((p) => eqId(p.id, it.product_id)) ||
                                  it.product ||
                                  (it.product_name
                                    ? { id: it.product_id, name: it.product_name }
                                    : it.product_id)
                                }
                                onChange={(val) => handleProductSelect(i, val)}
                                onKeyDown={(e) => onKeyNav(e, i, "product")}
                                products={products}
                                onRefreshProducts={fetchProducts}
                                inputProps={{
                                  autoComplete: "off",
                                  autoCapitalize: "off",
                                  autoCorrect: "off",
                                  spellCheck: false,
                                }}
                              />
                            </div>
                          </td>

                          {/* Pack Size */}
                          <td data-label="Pack Size" className="text-center">
                            <input
                              type="text"
                              readOnly
                              tabIndex={-1}
                              value={it.pack_size ?? ""}
                              placeholder="—"
                              autoComplete="off"
                              className="sale-readonly-field w-full h-7 rounded-md px-1 text-center font-mono"
                            />
                          </td>

                          {/* Batch */}
                          <td data-label="Batch">
                            <div ref={(el) => (batchRefs.current[i] = el)}>
                              <BatchSearchInput
                                value={
                                  it.batch_number
                                    ? it.batch_number
                                    : it.is_unbatched
                                    ? "[Unbatched Stock]"
                                    : ""
                                }
                                onChange={(val, batchObj) => handleBatchSelect(i, val, batchObj)}
                                batches={(batchesByProduct[it.product_id] || [])
                                  .filter((b) => (b.available_units ?? 0) > 0)
                                  .map((b) => ({
                                    ...b,
                                    batch_number: b.batch_number || b.batch,
                                  }))}
                                usedBatches={form.items
                                  .filter((row, idx) => idx !== i && eqId(row.product_id, it.product_id))
                                  .map((row) =>
                                    row.batch_number
                                      ? String(row.batch_number).trim()
                                      : row.is_unbatched
                                      ? "__unbatched__"
                                      : ""
                                  )
                                  .filter(Boolean)}
                                onKeyDown={(e) => onKeyNav(e, i, "batch")}
                                inputProps={{
                                  autoComplete: "off",
                                  autoCapitalize: "off",
                                  autoCorrect: "off",
                                  spellCheck: false,
                                }}
                              />
                            </div>
                          </td>

                          {/* Expiry */}
                          <td data-label="Expiry" className="text-center">
                            <input
                              type="text"
                              value={it.expiry ?? ""}
                              readOnly
                              tabIndex={-1}
                              placeholder="—"
                              autoComplete="off"
                              className="sale-readonly-field w-full h-7 rounded-md px-1 text-center font-mono text-[10px]"
                            />
                          </td>

                          {/* Avail (P/U) */}
                          <td data-label="Avail (P/U)" className="text-center">
                            <input
                              type="text"
                              readOnly
                              tabIndex={-1}
                              value={formatAvailBadge(it.current_quantity, it.pack_size)}
                              title={
                                it.current_quantity
                                  ? `${it.current_quantity} total units available`
                                  : "Available stock"
                              }
                              placeholder="—"
                              autoComplete="off"
                              className="sale-readonly-field w-full h-7 rounded-md px-1 text-center font-mono text-[10px]"
                            />
                          </td>

                          {/* Pack Qty */}
                          <td data-label="Pack Qty" className="text-center">
                            <input
                              ref={(el) => (packQtyRefs.current[i] = el)}
                              type="text"
                              name="pack_quantity"
                              inputMode="numeric"
                              placeholder="0"
                              value={zeroToEmpty(it.pack_quantity)}
                              onChange={(e) =>
                                handleItemChange(i, "pack_quantity", e.target.value)
                              }
                              autoComplete="off"
                              className={`w-full h-7 border rounded-md px-1.5 text-center font-bold ${
                                isDark
                                  ? "bg-slate-700 border-slate-500 text-slate-100"
                                  : "bg-white border-gray-300 text-gray-900"
                              } ${isOverStock ? "!border-red-500 ring-1 ring-red-400" : ""}`}
                              onKeyDown={(e) => onKeyNav(e, i, "pack_quantity")}
                              onFocus={(e) => e.target.select()}
                            />
                          </td>

                          {/* Unit Qty */}
                          <td data-label="Unit Qty" className="text-center">
                            <input
                              ref={(el) => (unitQtyRefs.current[i] = el)}
                              type="text"
                              name="unit_quantity"
                              inputMode="numeric"
                              placeholder="0"
                              value={zeroToEmpty(it.unit_quantity)}
                              onChange={(e) =>
                                handleItemChange(i, "unit_quantity", e.target.value)
                              }
                              autoComplete="off"
                              className={`w-full h-7 border rounded-md px-1.5 text-center font-bold ${
                                isDark
                                  ? "bg-slate-700 border-slate-500 text-slate-100"
                                  : "bg-white border-gray-300 text-gray-900"
                              } ${isOverStock ? "!border-red-500 ring-1 ring-red-400" : ""}`}
                              onKeyDown={(e) => onKeyNav(e, i, "unit_quantity")}
                              onFocus={(e) => e.target.select()}
                            />
                          </td>

                          {/* Pack Bonus */}
                          <td data-label="Pack Bonus" className="text-center">
                            <input
                              ref={(el) => (packBonusRefs.current[i] = el)}
                              type="text"
                              name="pack_bonus"
                              inputMode="numeric"
                              placeholder="0"
                              value={zeroToEmpty(it.pack_bonus)}
                              onChange={(e) => handleItemChange(i, "pack_bonus", e.target.value)}
                              autoComplete="off"
                              className={`w-full h-7 border rounded-md px-1.5 text-center font-semibold ${
                                Number(it.pack_bonus || 0) > 0
                                  ? isDark
                                    ? "bg-emerald-950/60 border-emerald-500 text-emerald-300"
                                    : "bg-emerald-50 border-emerald-400 text-emerald-800"
                                  : isDark
                                  ? "bg-slate-700 border-slate-500 text-slate-100"
                                  : "bg-white border-gray-300 text-gray-900"
                              } ${isOverStock ? "!border-red-500 ring-1 ring-red-400" : ""}`}
                              onKeyDown={(e) => onKeyNav(e, i, "pack_bonus")}
                              onFocus={(e) => e.target.select()}
                            />
                          </td>

                          {/* Unit Bonus */}
                          <td data-label="Unit Bonus" className="text-center">
                            <input
                              ref={(el) => (unitBonusRefs.current[i] = el)}
                              type="text"
                              name="unit_bonus"
                              inputMode="numeric"
                              placeholder="0"
                              value={zeroToEmpty(it.unit_bonus)}
                              onChange={(e) => handleItemChange(i, "unit_bonus", e.target.value)}
                              autoComplete="off"
                              className={`w-full h-7 border rounded-md px-1.5 text-center font-semibold ${
                                Number(it.unit_bonus || 0) > 0
                                  ? isDark
                                    ? "bg-emerald-950/60 border-emerald-500 text-emerald-300"
                                    : "bg-emerald-50 border-emerald-400 text-emerald-800"
                                  : isDark
                                  ? "bg-slate-700 border-slate-500 text-slate-100"
                                  : "bg-white border-gray-300 text-gray-900"
                              } ${isOverStock ? "!border-red-500 ring-1 ring-red-400" : ""}`}
                              onKeyDown={(e) => onKeyNav(e, i, "unit_bonus")}
                              onFocus={(e) => e.target.select()}
                            />
                          </td>

                          {/* Total Billed Units (Read-Only) */}
                          <td data-label="Total Units" className="text-center">
                            <input
                              type="text"
                              readOnly
                              tabIndex={-1}
                              value={
                                Number(it.quantity || 0) > 0
                                  ? `${it.quantity}${
                                      Number(it.bonus || 0) > 0 ? `+${it.bonus}` : ""
                                    }`
                                  : ""
                              }
                              placeholder="0"
                              title={
                                Number(it.bonus || 0) > 0
                                  ? `${it.quantity} billed units + ${it.bonus} bonus units = ${
                                      Number(it.quantity || 0) + Number(it.bonus || 0)
                                    } total stock units`
                                  : "Total billed units"
                              }
                              className="sale-readonly-field w-full h-7 rounded-md px-1 text-center font-mono font-bold text-[10.5px]"
                            />
                          </td>

                          {/* Pack Wholesale Price (Editable) */}
                          <td data-label="Pack Price *" className="text-center">
                            <div className="relative">
                              <input
                                ref={(el) => (packPriceRefs.current[i] = el)}
                                type="text"
                                name="pack_price"
                                inputMode="decimal"
                                placeholder="0.00"
                                value={zeroToEmpty(it.pack_price)}
                                onChange={(e) =>
                                  handleItemChange(i, "pack_price", e.target.value)
                                }
                                onBlur={(e) => {
                                  const v = e.target.value;
                                  if (v !== "") {
                                    const num = Number(v);
                                    if (Number.isFinite(num)) {
                                      handleItemChange(i, "pack_price", num.toFixed(2));
                                    }
                                  }
                                }}
                                autoComplete="off"
                                title={
                                  it.is_custom_price
                                    ? "Custom Wholesale Rate (saved for this customer)"
                                    : "Wholesale Pack Price"
                                }
                                className={`w-full h-7 border rounded-md px-1.5 text-right font-mono font-semibold ${
                                  it.is_custom_price
                                    ? isDark
                                      ? "bg-amber-950/40 border-amber-500/80 text-amber-200"
                                      : "bg-amber-50/70 border-amber-400 text-amber-900"
                                    : isDark
                                    ? "bg-slate-700 border-slate-500 text-slate-100"
                                    : "bg-white border-gray-300 text-gray-900"
                                } ${
                                  invalidPriceRows[i]
                                    ? "!border-red-500 ring-1 ring-red-400"
                                    : ""
                                }`}
                                onKeyDown={(e) => onKeyNav(e, i, "pack_price")}
                                onFocus={(e) => e.target.select()}
                              />
                            </div>
                          </td>

                          {/* Unit Wholesale Price (Editable) */}
                          <td data-label="Unit Price *" className="text-center">
                            <input
                              ref={(el) => (priceRefs.current[i] = el)}
                              type="text"
                              name="price"
                              inputMode="decimal"
                              placeholder="0.00"
                              value={zeroToEmpty(it.price)}
                              onChange={(e) => handleItemChange(i, "price", e.target.value)}
                              onBlur={(e) => {
                                const v = e.target.value;
                                if (v !== "") {
                                  const num = Number(v);
                                  if (Number.isFinite(num)) {
                                    handleItemChange(i, "price", num.toFixed(2));
                                  }
                                }
                              }}
                              autoComplete="off"
                              className={`w-full h-7 border rounded-md px-1.5 text-right font-mono ${
                                isDark
                                  ? "bg-slate-700 border-slate-500 text-slate-100"
                                  : "bg-white border-gray-300 text-gray-900"
                              } ${
                                invalidPriceRows[i] ? "!border-red-500 ring-1 ring-red-400" : ""
                              }`}
                              onKeyDown={(e) => onKeyNav(e, i, "price")}
                              onFocus={(e) => e.target.select()}
                            />
                          </td>

                          {/* Disc % */}
                          <td data-label="Disc %" className="text-center">
                            <input
                              ref={(el) => (discRefs.current[i] = el)}
                              type="text"
                              inputMode="decimal"
                              placeholder="0"
                              value={zeroToEmpty(it.item_discount_percentage)}
                              onChange={(e) =>
                                handleItemChange(i, "item_discount_percentage", e.target.value)
                              }
                              onBlur={(e) => {
                                const v = e.target.value;
                                if (v !== "" && v !== "-" && v !== "-.") {
                                  const num = Number(v);
                                  if (Number.isFinite(num)) {
                                    handleItemChange(
                                      i,
                                      "item_discount_percentage",
                                      num.toFixed(2)
                                    );
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
                              onFocus={(e) => e.target.select()}
                            />
                          </td>

                          {/* Sub Total */}
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
                              aria-label="Add item"
                              title="Add item"
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
            </div>
          </div>

          {/* BOTTOM: Wholesale Summary Footer */}
          <div id="wholesale-summary-footer" className="shrink-0 lg:sticky lg:bottom-0 z-10">
            <div
              className={`sale-entry-summary rounded-xl overflow-hidden border shadow-[0_-4px_16px_-6px_rgba(0,0,0,0.14)] ${
                isDark
                  ? "bg-slate-800 border-slate-700"
                  : "bg-white border-gray-200"
              }`}
            >
              <div className="px-3 py-2 text-xs">
                <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-12 gap-3 items-center">
                  {/* Col 1 (lg:4): Adjustments & Focused Row Margin */}
                  <div className="lg:col-span-4 flex flex-col gap-1.5">
                    <div className="flex items-center justify-between">
                      <span className="text-[10px] font-bold uppercase tracking-wider text-gray-400 dark:text-slate-400">
                        Wholesale Summary & Adjustments
                      </span>
                      <div className="flex items-center gap-2">
                        <span
                          className="text-xs font-extrabold uppercase tracking-wide"
                          style={{ color: "#dc2626" }}
                        >
                          Row Margin %:
                        </span>
                        <span
                          className="px-2.5 py-0.5 rounded-md text-base sm:text-lg font-black font-mono border-2 border-red-500 bg-red-50 dark:bg-red-950/60 shadow-2xs"
                          style={{ color: isDark ? "#f87171" : "#dc2626" }}
                        >
                          {marginPct ? `${marginPct}%` : "—"}
                        </span>
                      </div>
                    </div>

                    <div className="grid grid-cols-2 sm:grid-cols-4 gap-1.5 items-end">
                      <div>
                        <label className="block text-[9px] font-semibold uppercase tracking-wide text-gray-500 dark:text-slate-400 mb-0.5">
                          Disc %
                        </label>
                        <input
                          type="text"
                          name="discount_percentage"
                          inputMode="decimal"
                          placeholder="0"
                          value={form.discount_percentage ?? ""}
                          onChange={handleHeaderChange}
                          onBlur={(e) => {
                            const v = e.target.value;
                            if (v !== "" && v !== "-" && v !== "-.") {
                              const num = Number(v);
                              if (Number.isFinite(num)) {
                                handleHeaderChange({
                                  target: { name: "discount_percentage", value: num.toFixed(2) },
                                });
                              }
                            }
                          }}
                          autoComplete="off"
                          className={`w-full h-7 border rounded-md px-1.5 text-right font-mono text-xs ${
                            isDark
                              ? "border-slate-600 bg-slate-700 text-slate-200"
                              : "border-gray-300 bg-white text-gray-800"
                          }`}
                        />
                      </div>

                      <div>
                        <label className="block text-[9px] font-semibold uppercase tracking-wide text-gray-500 dark:text-slate-400 mb-0.5">
                          Disc Amt
                        </label>
                        <input
                          type="text"
                          name="discount_amount"
                          inputMode="decimal"
                          placeholder="0.00"
                          value={form.discount_amount ?? ""}
                          onChange={handleHeaderChange}
                          autoComplete="off"
                          className={`w-full h-7 border rounded-md px-1.5 text-right font-mono font-semibold text-xs ${
                            isDark
                              ? "border-slate-600 bg-slate-700 text-slate-200"
                              : "border-gray-300 bg-white text-gray-800"
                          }`}
                        />
                      </div>

                      <div>
                        <label className="block text-[9px] font-semibold uppercase tracking-wide text-gray-500 dark:text-slate-400 mb-0.5">
                          Tax %
                        </label>
                        <input
                          type="text"
                          name="tax_percentage"
                          inputMode="decimal"
                          placeholder="0"
                          value={form.tax_percentage ?? ""}
                          onChange={handleHeaderChange}
                          autoComplete="off"
                          className={`w-full h-7 border rounded-md px-1.5 text-right font-mono text-xs ${
                            isDark
                              ? "border-slate-600 bg-slate-700 text-slate-200"
                              : "border-gray-300 bg-white text-gray-800"
                          }`}
                        />
                      </div>

                      <div>
                        <label className="block text-[9px] font-semibold uppercase tracking-wide text-gray-500 dark:text-slate-400 mb-0.5">
                          Tax Amt
                        </label>
                        <input
                          type="text"
                          name="tax_amount"
                          inputMode="decimal"
                          placeholder="0.00"
                          value={form.tax_amount ?? ""}
                          onChange={handleHeaderChange}
                          autoComplete="off"
                          className={`w-full h-7 border rounded-md px-1.5 text-right font-mono font-semibold text-xs ${
                            isDark
                              ? "border-slate-600 bg-slate-700 text-slate-200"
                              : "border-gray-300 bg-white text-gray-800"
                          }`}
                        />
                      </div>
                    </div>
                  </div>

                  {/* Col 2 (lg:3): Totals Breakdown Banner */}
                  <div className="lg:col-span-3">
                    <div
                      className="px-3 py-2 rounded-lg border"
                      style={{
                        background: `linear-gradient(135deg, ${themeColors.primary}14, ${themeColors.primaryHover}22)`,
                        borderColor: `${themeColors.primary}33`,
                      }}
                    >
                      <div className="flex items-center justify-between text-[11px]">
                        <span className={isDark ? "text-slate-400" : "text-gray-500"}>
                          Gross Amount
                        </span>
                        <span
                          className={`font-bold font-mono ${
                            isDark ? "text-slate-200" : "text-gray-800"
                          }`}
                        >
                          {form.gross_amount ?? 0}
                        </span>
                      </div>
                      {(Number(form.discount_amount || 0) > 0 ||
                        Number(form.tax_amount || 0) > 0) && (
                        <div className="flex items-center justify-between text-[10px] mt-0.5">
                          {Number(form.discount_amount || 0) > 0 && (
                            <span className="text-red-500 dark:text-red-400 font-mono">
                              Disc: −{form.discount_amount}
                            </span>
                          )}
                          {Number(form.tax_amount || 0) > 0 && (
                            <span className="text-gray-600 dark:text-slate-300 font-mono">
                              Tax: +{form.tax_amount}
                            </span>
                          )}
                        </div>
                      )}
                      <div
                        className="flex items-center justify-between border-t border-dashed pt-1 mt-1"
                        style={{ borderColor: `${themeColors.primary}33` }}
                      >
                        <span
                          className={`text-xs font-extrabold uppercase tracking-wide ${
                            isDark ? "text-slate-200" : "text-gray-800"
                          }`}
                        >
                          Net Total
                        </span>
                        <span
                          className="text-lg font-black leading-none font-mono"
                          style={{ color: themeColors.primary }}
                        >
                          {form.total ?? 0}
                        </span>
                      </div>
                    </div>
                  </div>

                  {/* Col 3 (lg:3): Payment Account & Cash Given */}
                  <div className="lg:col-span-3 flex flex-col gap-1.5">
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

                    <div className="flex items-center gap-1.5 flex-wrap">
                      <div className="flex items-center gap-1.5 flex-1 min-w-[140px]">
                        <label
                          className={`font-bold text-[10px] uppercase shrink-0 ${
                            isDark ? "text-slate-300" : "text-gray-600"
                          }`}
                        >
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
                          className={`w-full h-7 border-2 rounded-md px-2 text-right font-extrabold font-mono text-xs transition-all ${
                            isDark
                              ? "border-blue-500/60 bg-slate-700 text-blue-300 focus:border-blue-400"
                              : "border-blue-400 bg-blue-50/50 text-blue-900 focus:border-blue-600 focus:bg-white"
                          }`}
                        />
                      </div>

                      <div className="flex items-center gap-1">
                        <button
                          type="button"
                          onClick={() => handleCashGivenChange(String(billTotal))}
                          className="px-1.5 py-1 rounded text-[9.5px] font-semibold bg-gray-100 hover:bg-gray-200 dark:bg-slate-700 dark:hover:bg-slate-600 text-gray-700 dark:text-gray-200 transition-colors"
                          title="Exact bill amount"
                        >
                          Exact
                        </button>
                        {[1000, 5000, 10000].map((note) => (
                          <button
                            key={note}
                            type="button"
                            onClick={() => handleCashGivenChange(String(note))}
                            className="px-1.5 py-1 rounded text-[9.5px] font-semibold bg-gray-100 hover:bg-gray-200 dark:bg-slate-700 dark:hover:bg-slate-600 text-gray-700 dark:text-gray-200 transition-colors"
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
                  </div>

                  {/* Col 4 (lg:2): Received, Remaining Due & Submit Button */}
                  <div className="lg:col-span-2 flex flex-col gap-1.5">
                    <div className="grid grid-cols-2 gap-1.5 items-end">
                      <div>
                        <label className="block text-[9px] font-semibold uppercase tracking-wide text-gray-500 dark:text-slate-400 mb-0.5">
                          Received
                        </label>
                        <input
                          type="text"
                          name="total_receive"
                          inputMode="numeric"
                          readOnly={form.invoice_type === "debit"}
                          value={form.total_receive ?? ""}
                          onChange={(e) => {
                            const v = sanitizeNumberInput(e.target.value, true, false);
                            setReceiveTouched(true);
                            setForm((prev) => ({ ...prev, total_receive: v }));
                          }}
                          onBlur={() => {
                            setForm((prev) => ({
                              ...prev,
                              total_receive: String(Math.round(Number(prev.total_receive || 0))),
                            }));
                          }}
                          autoComplete="off"
                          className={`w-full h-7 border rounded-md px-1.5 text-right font-mono font-semibold text-xs ${
                            isDark
                              ? "border-slate-600 bg-slate-700 text-slate-200"
                              : "border-gray-300 bg-white text-gray-800"
                          } ${
                            form.invoice_type === "debit"
                              ? isDark
                                ? "cursor-not-allowed bg-slate-800"
                                : "bg-gray-100 cursor-not-allowed"
                              : ""
                          }`}
                        />
                      </div>

                      <div>
                        <label className="block text-[9px] font-semibold uppercase tracking-wide text-gray-500 dark:text-slate-400 mb-0.5">
                          {cashGivenNum !== null && cashGivenNum > 0 && changeToReturn > 0
                            ? "Change Return"
                            : form.invoice_type === "credit" && excessCredit > 0
                            ? "Ledger Credit"
                            : "Remaining Due"}
                        </label>
                        <div
                          className={`sale-readonly-field h-7 flex items-center justify-end px-2 rounded-md text-xs font-extrabold font-mono ${
                            cashGivenNum !== null && cashGivenNum > 0 && changeToReturn > 0
                              ? "!text-emerald-600 dark:!text-emerald-400"
                              : remainingDue > 0
                              ? "!text-amber-600 dark:!text-amber-400"
                              : "!text-emerald-600 dark:!text-emerald-400"
                          }`}
                        >
                          {cashGivenNum !== null && cashGivenNum > 0 && changeToReturn > 0
                            ? formatCurrency
                              ? formatCurrency(changeToReturn)
                              : changeToReturn
                            : form.invoice_type === "credit" && excessCredit > 0
                            ? `+${excessCredit}`
                            : remainingDue}
                        </div>
                      </div>
                    </div>

                    <button
                      type="submit"
                      className={`w-full h-8 text-xs font-bold rounded-lg transition-all duration-200 ${btnPrimary.className}`}
                      style={btnPrimary.style}
                    >
                      {saleId ? "Update Wholesale Sale" : "Create Wholesale Sale"}
                    </button>
                  </div>
                </div>
              </div>
            </div>
          </div>

          {/* Mobile Sticky Bottom Bar */}
          <div
            className={`lg:hidden sticky bottom-0 z-20 px-3 py-2 rounded-xl border flex items-center justify-between gap-2 shadow-lg ${
              isDark
                ? "bg-slate-800/95 border-slate-700 text-slate-100 backdrop-blur-md"
                : "bg-white/95 border-gray-200 text-gray-900 backdrop-blur-md"
            }`}
          >
            <div>
              <span className="block text-[9px] font-bold uppercase tracking-wider text-gray-400 dark:text-slate-400">
                Net Payable
              </span>
              <span
                className="text-sm font-black font-mono"
                style={{ color: themeColors.primary }}
              >
                Rs. {form.total ?? 0}
              </span>
            </div>
            <div className="flex items-center gap-1.5">
              <button
                type="button"
                onClick={() =>
                  document
                    .getElementById("wholesale-summary-footer")
                    ?.scrollIntoView({ behavior: "smooth" })
                }
                className={`px-2.5 py-1.5 rounded-lg border text-[11px] font-bold ${
                  isDark
                    ? "border-slate-600 bg-slate-700 text-slate-200"
                    : "border-gray-300 bg-gray-100 text-gray-700"
                }`}
              >
                Tender
              </button>
              <button
                type="submit"
                className={`px-3 py-1.5 text-[11px] font-bold rounded-lg transition-all duration-200 ${btnPrimary.className}`}
                style={btnPrimary.style}
              >
                {saleId ? "Update" : "Save"}
              </button>
            </div>
          </div>
        </div>
      </form>

      {/* Customer Search Modal */}
      <CustomerSearch
        isOpen={customerSearchOpen}
        onClose={() => setCustomerSearchOpen(false)}
        onSelect={(customer) => {
          handleCustomerChange(customer?.id || "", customer);
          setCustomerSearchOpen(false);
        }}
        onCreate={(customer) => {
          handleCustomerChange(customer?.id || "", customer);
          setCustomerSearchOpen(false);
        }}
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
            type="sale_wholesale"
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
      </Suspense>
    </>
  );
}
