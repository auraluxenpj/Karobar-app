import { arrangePurchaseInvoiceRows, purchaseInvoiceArrangements } from "../../utils/purchaseInvoiceArrangement";
import { useInvoiceErrors, InvoiceErrorSummary, InvoiceRowError } from "../../components/InvoiceErrors";
// /src/pages/purchases/PurchaseInvoiceForm.jsx
import { Fragment, lazy, Suspense, useState, useEffect, useRef, useMemo } from "react";
import axios from "axios";
import Select from "react-select";
import toast from "react-hot-toast";
import ProductSearchInput from "../../components/ProductSearchInput.jsx";
import BatchSearchInput from "../../components/BatchSearchInput.jsx";
import { recalcItem, recalcFooter } from "../../Formula/PurchaseInvoice.js";
import { useTheme } from "@/context/ThemeContext";
import { getThemeButtonClasses } from "@/utils/buttonStyles";
import { useSaleSystem } from "@/context/SaleSystemContext.jsx";
import SupplierSearch from "../../components/SupplierSearch.jsx";
import useRowDragAndDrop from "./useRowDragAndDrop.jsx";
import { useInvoiceDraft } from "@/hooks/useInvoiceDraft.js";
import InvoiceDraftIndicator from "@/components/InvoiceDraftIndicator.jsx";
import PaymentAccountSelector from "../../components/PaymentAccountSelector.jsx";

const ProductFormModal = lazy(() => import("../../components/ProductFormModal.jsx"));
const InvoiceDraftsModal = lazy(() => import("@/components/InvoiceDraftsModal.jsx"));
const PreShiftDrawerPromptModal = lazy(() => import("@/components/PreShiftDrawerPromptModal.jsx"));
import { BuildingStorefrontIcon, TrashIcon, PlusCircleIcon, CheckIcon } from "@heroicons/react/24/solid";

// Six-dot grip shown on drag handles
const DragGripIcon = () => (
  <svg aria-hidden="true" width="10" height="14" viewBox="0 0 10 14" fill="currentColor">
    {[2, 7, 12].flatMap(cy => [<circle key={`a${cy}`} cx="2.5" cy={cy} r="1.4" />, <circle key={`b${cy}`} cx="7.5" cy={cy} r="1.4" />])}
  </svg>
);

// Helper to determine text color based on background brightness
// Returns dark text for light backgrounds, light text for dark backgrounds
const getContrastText = (hexColor) => {
  // Remove hash if present
  hexColor = hexColor.replace('#', '');
  
  // Parse RGB values
  const r = parseInt(hexColor.substring(0, 2), 16);
  const g = parseInt(hexColor.substring(2, 4), 16);
  const b = parseInt(hexColor.substring(4, 6), 16);
  
  // Calculate relative luminance (per WCAG formula)
  const luminance = (0.299 * r + 0.587 * g + 0.114 * b) / 255;
  
  // Return dark text for light backgrounds, light text for dark backgrounds
  return luminance > 0.5 ? '#1f2937' : '#ffffff';
};

// Helper to get button text color with fallback
const getButtonTextColor = (primaryColor, primaryHoverColor) => {
  // Use hover color for text color calculation as it's slightly darker
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

// Centralized Axios error → toast mapper
function showAxiosError(err) {
  const resp = err?.response;
  if (!resp) {
    toast.error("Network error. Please check your connection.");
    return;
  }
  const { status, data } = resp;
  // Laravel validation
  if (status === 422) {
    const errs = data?.errors || {};
    const msgs = Object.values(errs).flat();
    if (msgs.length) {
      msgs.slice(0, 6).forEach((m) => toast.error(String(m)));
      return;
    }
  }
  // Conflict/duplicate
  if (status === 409) {
    toast.error(data?.message || "Conflict while saving. Please review and try again.");
    return;
  }
  // Fallback
  toast.error(data?.message || "Unable to save invoice");
}

export default function PurchaseInvoiceForm({ invoiceId, onSuccess, onSubmit, initialData }) {
  const [drawerPrompt, setDrawerPrompt] = useState(null);
  const originalInvoiceMetaRef = useRef(null);
  const nextRowKeyRef = useRef(1);
  const getRowKey = (item) => {
    if (!item || typeof item !== "object") return "pi-row-fallback";
    if (!item._rowKey) {
      item._rowKey = `pi-row-${nextRowKeyRef.current++}`;
    }
    return item._rowKey;
  };
  const [form, setForm] = useState({
    invoice_type: "debit", // "debit" = pay now, "credit" = pay later
    supplier_id: "",
    posted_number: "", // (auto on save, stays empty until saved)
    posted_date: new Date().toISOString().split("T")[0],
    due_date: "",
    remarks: "",
    invoice_number: "",
    invoice_amount: "",
    tax_percentage: "",
    tax_amount: "",
    discount_percentage: "",
    discount_amount: "",
    total_amount: "",
    total_paid: "",
    payment_method: "cash",
    account_id: null,
    items: [
      {
        _rowKey: "pi-row-0",
        product_id: "",
        batch: "",
        expiry: "",
        pack_quantity: "",
        pack_size: "",
        unit_quantity: "",
        pack_purchase_price: "",
        unit_purchase_price: "",
        pack_sale_price: "",
        unit_sale_price: "",
        whole_sale_pack_price: "",
        whole_sale_unit_price: "",
        whole_sale_margin: "",
        pack_bonus: "",
        unit_bonus: "",
        item_discount_percentage: "",
        margin: "",
        sub_total: "",
        avg_price: "",
        quantity: "",
      },
    ],
  });
  const invoiceErrors = useInvoiceErrors(form.items);

  // Track if user has manually edited total_paid
  const [paidTouched, setPaidTouched] = useState(false);
  const [saving, setSaving] = useState(false);
  const savingRef = useRef(false);

  // Product modal state
  const [showProductModal, setShowProductModal] = useState(false);

  // only allow numbers (and optionally decimals)
  // allow decimals for price/percentage fields + Pack.Q and PBonus
  const sanitizeNumberInput = (value, allowDecimal = false) => {
    if (value === "") return ""; // allow empty input

    if (allowDecimal) {
      // valid: numbers with at most one decimal point
      if (/^\d*\.?\d*$/.test(value)) {
        return value;
      }
      return value.slice(0, -1); // strip invalid char
    }

    // integer-only fields
    return value.replace(/\D/g, "");
  };
  const to2 = (n) => Number(parseFloat(n || 0).toFixed(2));

  const [suppliers, setSuppliers] = useState([]);
  const [products, setProducts] = useState([]);
  // Keep original/saved order by default so saving or editing an invoice preserves its product sorting unless explicitly re-sorted.
  const [arrangement, setArrangement] = useState('original');
  const [displayOrder, setDisplayOrder] = useState([]);
  const arrangedRows = useMemo(() => {
    const rows = arrangePurchaseInvoiceRows(form.items, products, 'original');
    const rank = new Map(displayOrder.map((index, position) => [index, position]));
    return rows.sort((a, b) => (rank.get(a.index) ?? displayOrder.length + a.index) - (rank.get(b.index) ?? displayOrder.length + b.index));
  }, [form.items, products, displayOrder]);
  const applyArrangement = value => {
    if (!value || value === 'custom') return; // manual order is kept as-is
    const nextOrder = arrangePurchaseInvoiceRows(form.items, products, value).map(row => row.index);
    setArrangement(value);
    setDisplayOrder(nextOrder);
    setForm(prev => ({ ...prev, arrangement: value, displayOrder: nextOrder }));
  };
  // Commit a manual (drag & drop) order; empty rows stay at the end. Saved as-is.
  const commitManualOrder = productIndices => {
    const empty = arrangedRows.filter(row => !row.item.product_id).map(row => row.index);
    const nextOrder = [...productIndices, ...empty];
    setArrangement('custom');
    setDisplayOrder(nextOrder);
    setForm(prev => ({ ...prev, arrangement: 'custom', displayOrder: nextOrder }));
  };
  const remembersSupplierOrder = Boolean(form.purchase_order_id || initialData?.purchase_order_id);

  const [currentField, setCurrentField] = useState("supplier");
  const [currentRowIndex, setCurrentRowIndex] = useState(0);

  // Supplier search modal state
  const [supplierSearchOpen, setSupplierSearchOpen] = useState(false);
  const [selectedSupplier, setSelectedSupplier] = useState(null);
  const [supplierCreditSummary, setSupplierCreditSummary] = useState(null);

  useEffect(() => {
    const supId = form.supplier_id || selectedSupplier?.id;
    if (!supId) {
      setSupplierCreditSummary(null);
      return;
    }
    let cancelled = false;
    axios
      .get(`/api/suppliers/${supId}/credit-summary`)
      .then((res) => {
        if (!cancelled) setSupplierCreditSummary(res.data || null);
      })
      .catch(() => {
        if (!cancelled) setSupplierCreditSummary(null);
      });
    return () => {
      cancelled = true;
    };
  }, [form.supplier_id, selectedSupplier?.id]);

  const isDraftingEnabled = !invoiceId && !form.purchase_order_id && !initialData?.purchase_order_id;

  const handleStartBlank = () => {
    draftHook.resetToNew();
    setArrangement('original');
    setDisplayOrder([]);
    setForm({
      invoice_type: "debit",
      supplier_id: "",
      posted_number: "",
      posted_date: new Date().toISOString().split("T")[0],
      due_date: "",
      remarks: "",
      invoice_number: "",
      invoice_amount: "",
      tax_percentage: "",
      tax_amount: "",
      discount_percentage: "",
      discount_amount: "",
      total_amount: "",
      total_paid: "",
      payment_method: "cash",
      account_id: null,
      items: [
        {
          product_id: "",
          batch: "",
          expiry: "",
          pack_quantity: "",
          pack_size: "",
          unit_quantity: "",
          pack_purchase_price: "",
          unit_purchase_price: "",
          pack_sale_price: "",
          unit_sale_price: "",
          whole_sale_pack_price: "",
          whole_sale_unit_price: "",
          whole_sale_margin: "",
          pack_bonus: "",
          unit_bonus: "",
          item_discount_percentage: "",
          margin: "",
          sub_total: "",
          avg_price: "",
          quantity: "",
        },
      ],
    });
    setTimeout(() => {
      supplierRef.current?.focus?.();
    }, 60);
  };

  const draftHook = useInvoiceDraft({
    type: "purchase",
    form,
    setForm,
    enabled: isDraftingEnabled,
    onStartBlank: () => handleStartBlank(),
    onDraftLoaded: async (loadedPayload, draft, responseData) => {
      if (Array.isArray(responseData?.products) && responseData.products.length > 0) {
        upsertProducts(responseData.products);
      }
      let next = recalcFooter(loadedPayload, "init");
      if (next.invoice_type === "credit") {
        next.total_paid = loadedPayload?.total_paid ?? "";
        setPaidTouched(true);
      } else if (loadedPayload?.total_paid !== undefined && loadedPayload?.total_paid !== "" && Number(loadedPayload.total_paid) !== Number(next.total_amount)) {
        next.total_paid = loadedPayload.total_paid;
        setPaidTouched(true);
      } else {
        next.total_paid = next.total_amount ?? "";
        setPaidTouched(false);
      }
      if (Array.isArray(next.items)) {
        next.items = next.items.map((it) => ({
          ...it,
          is_unbatched: Boolean(it.is_unbatched || !it?.batch || String(it.batch).trim() === ""),
        }));
      }
      setForm(next);
      setArrangement(loadedPayload?.arrangement || 'original');
      setDisplayOrder(Array.isArray(loadedPayload?.displayOrder) ? loadedPayload.displayOrder : []);
      if (next.supplier_id) {
        const sup = suppliers.find((s) => String(s.id) === String(next.supplier_id));
        if (sup) setSelectedSupplier(sup);
      }
      await ensureProductsForItems(next?.items || []);
      await ensureBatchesForItems(next?.items || []);

      setSupplierSearchOpen(false);
      // Close product search modal if open
      if (typeof window !== "undefined") {
        window.dispatchEvent(new CustomEvent("product-search:close"));
      }

      // Focus the last row's quantity field
      const lastIdx = Math.max(0, (next?.items?.length || 1) - 1);
      let retries = 0;
      const tryFocus = () => {
        const el = packQuantityRefs.current[lastIdx];
        if (el && typeof el.focus === "function") {
          el.focus();
          el.select?.();
          el.scrollIntoView?.({ block: "nearest" });
          setCurrentField("pack_quantity");
          setCurrentRowIndex(lastIdx);
        } else if (retries < 10) {
          retries++;
          setTimeout(tryFocus, 50);
        }
      };
      setTimeout(tryFocus, 60);
    },
  });

  // Refs for navigation
  const supplierRef = useRef(null);
  const invoiceNumberRef = useRef(null);
  const invoiceAmountRef = useRef(null);
  const taxPercentageRef = useRef(null);
  const discountPercentageRef = useRef(null);
  const saveButtonRef = useRef(null);

  // Scroll container for the items section
  const itemsScrollRef = useRef(null);
  // Drag & drop for product rows and whole brand groups
  const dnd = useRowDragAndDrop(arrangedRows, itemsScrollRef, commitManualOrder);

  // productSearchRefs will hold container DOM nodes (wrapping ProductSearchInput)
  const productSearchRefs = useRef([]);
  const batchRefs = useRef([]);
  const expiryRefs = useRef([]);
  const packQuantityRefs = useRef([]);
  const packPurchasePriceRefs = useRef([]);
  const itemDiscountRefs = useRef([]);
  const packBonusRefs = useRef([]);
  const packSalePriceRefs = useRef([]);
  const wholeSalePackPriceRefs = useRef([]);
  const wholeSaleUnitPriceRefs = useRef([]);

  const [batchesByProduct, setBatchesByProduct] = useState({});

  useEffect(() => {
    fetchSuppliers().catch(showAxiosError);
    if (initialData) {
      const items = initialData.items.map(item => recalcItem(item));
      const next = recalcFooter({ ...form, ...initialData, items }, "init");
      next.invoice_amount = initialData.invoice_amount ?? "";
      if (next.invoice_type === "credit") {
        next.total_paid = initialData.total_paid ?? "";
        setPaidTouched(true);
      } else {
        next.total_paid = next.total_amount;
        setPaidTouched(false);
      }
      if (Array.isArray(next.items)) {
        next.items = next.items.map((it) => ({
          ...it,
          is_unbatched: Boolean(it.is_unbatched ?? (!it?.batch || String(it.batch).trim() === "")),
        }));
      }
      setForm(next);
      setArrangement('original');
      setDisplayOrder([]);
      setSelectedSupplier(initialData.supplier);
      upsertProducts((initialData.items || []).map(item => item.product).filter(Boolean));
      fetchProducts().catch(showAxiosError);
      ensureBatchesForItems(next.items);
    } else fetchProducts().catch(showAxiosError);
    if (invoiceId) {
      fetchInvoice();
    }
    // IMPORTANT: we NO LONGER prefetch/assign a new posted_number here.
    // It is generated server-side on SAVE to avoid collisions when multiple forms are open.
  }, [invoiceId]);

  useEffect(() => {
    // On load, auto-open the supplier search modal ONLY for a new (create) form
    // so its search field is focused. In edit mode we keep the modal closed and
    // just show the existing supplier. Also skip if resuming a draft from URL.
    const params = new URLSearchParams(window.location.search);
    const hasDraftInUrl = Boolean(params.get("draft_id"));
    if (invoiceId || initialData || hasDraftInUrl) return; // skip source orders, edit mode, and draft resumption
    const t = setTimeout(() => {
      setSupplierSearchOpen(true);
    }, 150);
    return () => clearTimeout(t);
  }, [invoiceId]);

  useEffect(() => {
    // Handle shortcuts: Alt+S for save, Alt+D for Debit, Alt+C for Credit, Alt+T to toggle
    const handleKeyDown = (e) => {
      if (e.altKey && e.key.toLowerCase() === "s") {
        e.preventDefault();
        handleSubmit(e);
      } else if (e.altKey && e.key.toLowerCase() === "d") {
        e.preventDefault();
        handleInvoiceTypeChange("debit");
      } else if (e.altKey && e.key.toLowerCase() === "c") {
        e.preventDefault();
        handleInvoiceTypeChange("credit");
      } else if (e.altKey && e.key.toLowerCase() === "t") {
        e.preventDefault();
        handleInvoiceTypeChange(form.invoice_type === "debit" ? "credit" : "debit");
      }
    };
    document.addEventListener("keydown", handleKeyDown);
    return () => document.removeEventListener("keydown", handleKeyDown);
  }, [form, paidTouched, arrangement, displayOrder, products, selectedSupplier]);

  const fetchSuppliers = async () => {
    const res = await axios.get("/api/suppliers/search", { params: { limit: 100 } });
    const list = Array.isArray(res.data?.data) ? res.data.data : Array.isArray(res.data) ? res.data : [];
    setSuppliers(list);
  };

  const fetchProducts = async (q = "") => {
    const { data } = await axios.get("/api/products/search", { params: { q, limit: 30 } });
    upsertProducts(Array.isArray(data) ? data : (data?.data || []));
  };

  // Fetch all batches for a product (including unbatched units) for batch selector
  const fetchProductBatches = async (productId) => {
    if (!productId) return [];
    const key = String(productId);
    if (batchesByProduct[key]) return batchesByProduct[key];
    try {
      const { data } = await axios.get(`/api/products/${productId}/batches?include_unbatched=1`);
      const list = Array.isArray(data) ? data : [];
      setBatchesByProduct((prev) => ({ ...prev, [key]: list }));
      return list;
    } catch (err) {
      console.error('Failed to fetch batches:', err);
      return [];
    }
  };

  const ensureBatchesForItems = async (items = []) => {
    const productIds = Array.from(new Set(items.map((it) => it.product_id).filter(Boolean)));
    for (const pid of productIds) {
      try {
        await fetchProductBatches(pid);
      } catch {}
    }
  };

  const fetchInvoice = async () => {
    const res = await axios.get(`/api/purchase-invoices/${invoiceId}`);
    originalInvoiceMetaRef.current = res.data;
    let next = recalcFooter(res.data, "init");
    if (res.data?.invoice_type === "credit") {
      const existingPaid = Number(res.data?.total_paid ?? 0);
      next.total_paid = existingPaid > 0 ? existingPaid.toFixed(2) : "";
      setPaidTouched(true);
    } else if (
      res.data?.total_paid !== undefined &&
      res.data?.total_paid !== null &&
      Math.abs(Number(res.data.total_paid) - Number(next.total_amount || 0)) > 0.009
    ) {
      next.total_paid = to2(res.data.total_paid).toFixed(2);
      setPaidTouched(true);
    } else {
      next.total_paid = next.total_amount ?? "";
      setPaidTouched(false);
    }
    next.payment_method = res.data?.payment_method || "cash";
    next.account_id = res.data?.account_id || null;
    if (Array.isArray(next.items)) {
      next.items = next.items.map((it) => ({
        ...it,
        is_unbatched: Boolean(!it?.batch || String(it.batch).trim() === ""),
      }));
    }
    setForm(next);
    setArrangement('original');
    setDisplayOrder([]);
    upsertProducts((res.data?.items || []).map(item => item.product).filter(Boolean));
    // Reflect the invoice's supplier in the search button display
    if (next.supplier_id) {
      const sup = res.data?.supplier || suppliers.find((s) => String(s.id) === String(next.supplier_id));
      setSelectedSupplier(sup || { id: next.supplier_id, name: next.supplier_name || `Supplier #${next.supplier_id}` });
    }
    await ensureProductsForItems(next?.items || []);
    await ensureBatchesForItems(next?.items || []);
  };

  const handleChange = (e) => {
    const { name, value } = e.target;

    // Fields that should accept decimals as the user types
    const decimalFields = new Set([
      "invoice_amount",
      "tax_percentage",
      "tax_amount",
      "discount_percentage",
      "discount_amount",
    ]);

    const newValue = decimalFields.has(name)
      ? sanitizeNumberInput(value, true)
      : value;

    // Build a temp form with the raw typed value
    const tempForm = { ...form, [name]: newValue };

    // Recalculate totals, but DO NOT overwrite the field the user is typing
    let nextForm = recalcFooter(tempForm, name);
    nextForm[name] = newValue;

    if (!paidTouched && nextForm.invoice_type !== "credit") {
      nextForm.total_paid = nextForm.total_amount ?? "";
    }

    setForm(nextForm);
  };

  // Called when a supplier is chosen from the SupplierSearch modal
  const handleSupplierSelect = (supplier) => {
    if (!supplier?.id) return;
    setSelectedSupplier(supplier);
    const creditDays = Number(supplier.credit_days ?? 0);
    let autoDueDate = undefined;
    if (creditDays > 0 && form.posted_date) {
      const d = new Date(form.posted_date);
      if (!isNaN(d.getTime())) {
        d.setDate(d.getDate() + creditDays);
        autoDueDate = d.toISOString().split("T")[0];
      }
    }
    setForm((prev) => ({
      ...prev,
      supplier_id: supplier.id,
      ...(autoDueDate ? { due_date: autoDueDate } : {}),
    }));
    setSupplierSearchOpen(false);
    // Advance to the Invoice Number field
    navigateToNextField("supplier");
  };

  // Handle invoice type change (debit = pay now, credit = pay later)
  const handleInvoiceTypeChange = (type) => {
    setForm((prev) => {
      const next = { ...prev, invoice_type: type };
      // When switching to credit, set total_paid to empty (we owe full amount)
      if (type === "credit") {
        next.total_paid = "";
        setPaidTouched(true); // Mark as touched so it stays at 0
        if (!next.due_date && next.posted_date && selectedSupplier?.credit_days) {
          const d = new Date(next.posted_date);
          if (!isNaN(d.getTime())) {
            d.setDate(d.getDate() + Number(selectedSupplier.credit_days));
            next.due_date = d.toISOString().split("T")[0];
          }
        }
      } else {
        // Debit - reset touched and auto-fill total_paid with total amount
        setPaidTouched(false);
        next.total_paid = next.total_amount ?? "";
      }
      return next;
    });
  };

  function handleItemChange(index, field, rawValue) {
    let value = rawValue;

    // fields that can have decimals (✅ added pack_quantity and pack_bonus)
    const allowDecimalFields = [
      "pack_purchase_price",
      "unit_purchase_price",
      "pack_sale_price",
      "unit_sale_price",
      "whole_sale_pack_price",
      "whole_sale_unit_price",
      "item_discount_percentage",
      "pack_quantity",
      "pack_bonus",
    ];

    // integer-only fields
    const integerFields = [
      "unit_quantity",
      "unit_bonus",
    ];

    if (allowDecimalFields.includes(field)) {
      if (!/^\d*\.?\d*$/.test(value)) return;
    } else if (integerFields.includes(field)) {
      value = value.replace(/\D/g, "");
    }

    const newItems = [...form.items];
    // Base item with only the edited field applied
    let nextItem = { ...newItems[index], [field]: value };

    // Keep wholesale pack price in sync with the retail pack sale price so users
    // in retail mode get sensible default wholesale prices when they later switch
    // to wholesale mode. Only auto-update while the wholesale price is still
    // "linked" (blank/0, or numerically equal to the previous retail price) so a
    // deliberately different wholesale price is not clobbered.
    let syncWholesale = false;
    if (field === "pack_sale_price") {
      const oldPackSale = newItems[index].pack_sale_price;
      const oldWholeSale = newItems[index].whole_sale_pack_price;
      // recalcItem persists blank wholesale fields as the number 0, so treat
      // 0 / "0" as "empty" too.
      const isBlank = (v) =>
        v === "" || v === null || v === undefined || v === 0 || v === "0";
      const wholesaleEmpty = isBlank(oldWholeSale);
      const wholesaleLinked =
        !wholesaleEmpty &&
        !isBlank(oldPackSale) &&
        Number(oldWholeSale) === Number(oldPackSale);
      syncWholesale = wholesaleEmpty || wholesaleLinked;

      if (syncWholesale) {
        nextItem.whole_sale_pack_price = value;
        nextItem.whole_sale_unit_price = "";
      }
    }

    newItems[index] = recalcItem(nextItem, field);

    // Second pass with the wholesale side treated as the changed field so the
    // wholesale unit price & margin derive from the (possibly synced) pack price,
    // then restore the raw text of the field the user is editing.
    if (syncWholesale) {
      const rawEdited = nextItem[field];
      newItems[index] = recalcItem(newItems[index], "whole_sale_pack_price");
      newItems[index][field] = rawEdited;
    }

    let newForm = { ...form, items: newItems };
    newForm = recalcFooter(newForm, "items");

    if (!paidTouched && newForm.invoice_type !== "credit") {
      newForm.total_paid = newForm.total_amount ?? "";
    }

    setForm(newForm);
  }

  const addItem = () => {
    setForm((prev) => {
      const nextIndex = prev.items.length;
      setTimeout(() => scrollItemsTo(nextIndex), 60);
      return {
        ...prev,
        items: [
          ...prev.items,
          {
            _rowKey: `pi-row-${nextRowKeyRef.current++}`,
            product_id: "",
            batch: "",
            expiry: "",
            pack_quantity: "",
            pack_size: "",
            unit_quantity: "",
            pack_purchase_price: "",
            unit_purchase_price: "",
            pack_sale_price: "",
            unit_sale_price: "",
            whole_sale_pack_price: "",
            whole_sale_unit_price: "",
            whole_sale_margin: "",
            pack_bonus: "",
            unit_bonus: "",
            item_discount_percentage: "",
            margin: "",
            sub_total: "",
            avg_price: "",
            quantity: "",
          },
        ],
      };
    });
    setCurrentRowIndex(form.items.length);
  };

  const removeItem = (index) => {
    const scroller = itemsScrollRef.current;
    const savedScrollTop = scroller ? scroller.scrollTop : null;
    const rowEl = productSearchRefs.current[index]?.closest?.("tr");
    if (rowEl && document.activeElement && rowEl.contains(document.activeElement)) {
      document.activeElement.blur?.();
    }

    setDisplayOrder(order => order.filter(i => i !== index).map(i => i > index ? i - 1 : i));
    const blankRow = {
      _rowKey: `pi-row-${nextRowKeyRef.current++}`,
      purchase_order_item_id: null,
      product_id: "",
      batch: "",
      expiry: "",
      pack_quantity: "",
      pack_size: "",
      unit_quantity: "",
      pack_purchase_price: "",
      unit_purchase_price: "",
      pack_sale_price: "",
      unit_sale_price: "",
      whole_sale_pack_price: "",
      whole_sale_unit_price: "",
      whole_sale_margin: "",
      pack_bonus: "",
      unit_bonus: "",
      item_discount_percentage: "",
      margin: "",
      sub_total: "",
      avg_price: "",
      quantity: "",
    };
    const newItems = form.items.length > 1
      ? form.items.filter((_, i) => i !== index)
      : [blankRow];
    let nextForm = recalcFooter({ ...form, items: newItems }, "items");
    if (!paidTouched && nextForm.invoice_type !== "credit") {
      nextForm.total_paid = nextForm.total_amount ?? "";
    }
    setForm(nextForm);
    if (currentRowIndex >= newItems.length) {
      setCurrentRowIndex(newItems.length - 1);
    }

    if (savedScrollTop !== null) {
      requestAnimationFrame(() => {
        if (itemsScrollRef.current) {
          itemsScrollRef.current.scrollTop = savedScrollTop;
        }
        requestAnimationFrame(() => {
          if (itemsScrollRef.current) {
            itemsScrollRef.current.scrollTop = savedScrollTop;
          }
        });
      });
    }
  };

  // Helper: robustly focus the ProductSearchInput inside its wrapper
  const focusProductSearch = (rowIndex = 0) => {
    scrollItemsTo(rowIndex);
    const tryFocus = () => {
      const container = productSearchRefs.current[rowIndex];
      if (!container) return false;

if (container instanceof HTMLElement) {
        const input = container.querySelector('input, button, [contenteditable="true"]');
        if (input && typeof input.focus === "function") {
          input.focus();
          if (typeof input.select === "function") input.select();
          setCurrentField("product");
          setCurrentRowIndex(rowIndex);
          return true;
        }
      }

      if (container && typeof container.focus === "function") {
        container.focus();
        setCurrentField("product");
        setCurrentRowIndex(rowIndex);
        return true;
      }

      return false;
    };

    if (tryFocus()) return;

    let attempts = 0;
    const maxAttempts = 10;
    const retry = () => {
      attempts += 1;
      if (tryFocus() || attempts >= maxAttempts) return;
      setTimeout(retry, 50);
    };
    setTimeout(retry, 30);
  };

// Scroll the items container so a specific row is visible.
  // Computes the delta between the row and the container's visible box and nudges
  // the container's scrollTop by exactly that delta — moving the scrollbar row by
  // row (both up and down) without ever scrolling the outer page.
  const scrollItemsTo = (rowIndex = null) => {
    const container = itemsScrollRef.current;
    if (!container) return;
    requestAnimationFrame(() => {
      if (rowIndex !== null && rowIndex !== undefined) {
        const el = productSearchRefs.current[rowIndex]?.closest?.("tr") || productSearchRefs.current[rowIndex];
        if (el) {
const contRect = container.getBoundingClientRect();
          const elRect = el.getBoundingClientRect();
          // Space reserved in the container's viewport (header + breathing room)
          const headerPad = 8;

          // Scroll DOWN: row is below the visible bottom → scroll just enough to show it
          if (elRect.bottom > contRect.bottom) {
            container.scrollTo({
              top: container.scrollTop + (elRect.bottom - contRect.bottom + headerPad),
              behavior: "smooth",
            });
          }
          // Scroll UP: row is above the visible top → scroll just enough to show it
          else if (elRect.top < contRect.top) {
            container.scrollTo({
              top: container.scrollTop - (contRect.top - elRect.top + headerPad),
              behavior: "smooth",
            });
          }
          // Otherwise the row is already fully visible — no scroll needed
          return;
        }
      }
      container.scrollTo({ top: container.scrollHeight, behavior: "smooth" });
    });
  };

  // Merge new products into state (by id, dedup)
  const upsertProducts = (list) => {
    if (!Array.isArray(list)) return;
    setProducts((prev) => {
      const map = new Map((prev || []).filter(Boolean).map((p) => [String(p.id), p]));
      list.forEach((p) => { if (p?.id) map.set(String(p.id), { ...map.get(String(p.id)), ...p }); });
      return Array.from(map.values());
    });
  };

  // Make sure all product_ids used in items exist in products[]
  const ensureProductsForItems = async (items = []) => {
    const ids = Array.from(new Set(items.map(it => it.product_id).filter(Boolean)));
    if (ids.length === 0) return;

    const have = new Set((products || []).map(p => p.id));
    const missing = ids.filter(id => !have.has(id));
    if (missing.length === 0) return;

    try {
      const { data } = await axios.get("/api/products/by-ids", {
        params: { ids: missing.join(",") },
      });
      upsertProducts(data);
      return;
    } catch (_) { /* fall back to per-id */ }

    const fetched = await Promise.all(
      missing.map(async (id) => {
        try {
          const { data } = await axios.get(`/api/products/${id}`);
          return data;
        } catch {
          try {
            const { data } = await axios.get("/api/products/search", { params: { q: id, limit: 1 } });
            return Array.isArray(data) ? data[0] : data?.data?.[0];
          } catch {
            return null;
          }
        }
      })
    );
    upsertProducts(fetched.filter(Boolean));
  };

  const focusOnField = (field, rowIndex) => {
    scrollItemsTo(rowIndex);
    setTimeout(() => {
      switch (field) {
        case "batch":
          if (batchRefs.current[rowIndex]) {
            focusAndSelect(batchRefs.current[rowIndex]);
            setCurrentField("batch");
            setCurrentRowIndex(rowIndex);
          }
          break;
        case "expiry":
          if (expiryRefs.current[rowIndex]) {
            focusAndSelect(expiryRefs.current[rowIndex]);
            setCurrentField("expiry");
            setCurrentRowIndex(rowIndex);
          }
          break;
        case "pack_quantity":
          if (packQuantityRefs.current[rowIndex]) {
            focusAndSelect(packQuantityRefs.current[rowIndex]);
            setCurrentField("pack_quantity");
            setCurrentRowIndex(rowIndex);
          }
          break;
        case "pack_purchase_price":
          if (packPurchasePriceRefs.current[rowIndex]) {
            focusAndSelect(packPurchasePriceRefs.current[rowIndex]);
            setCurrentField("pack_purchase_price");
            setCurrentRowIndex(rowIndex);
          }
          break;
        case "item_discount":
          if (itemDiscountRefs.current[rowIndex]) {
            focusAndSelect(itemDiscountRefs.current[rowIndex]);
            setCurrentField("item_discount");
            setCurrentRowIndex(rowIndex);
          }
          break;
        case "pack_bonus":
          if (packBonusRefs.current[rowIndex]) {
            focusAndSelect(packBonusRefs.current[rowIndex]);
            setCurrentField("pack_bonus");
            setCurrentRowIndex(rowIndex);
          }
          break;
        case "pack_sale_price":
          if (packSalePriceRefs.current[rowIndex]) {
            focusAndSelect(packSalePriceRefs.current[rowIndex]);
            setCurrentField("pack_sale_price");
            setCurrentRowIndex(rowIndex);
          }
          break;
        case "whole_sale_pack_price":
          if (wholeSalePackPriceRefs.current[rowIndex]) {
            focusAndSelect(wholeSalePackPriceRefs.current[rowIndex]);
            setCurrentField("whole_sale_pack_price");
            setCurrentRowIndex(rowIndex);
          }
          break;
        case "whole_sale_unit_price":
          if (wholeSaleUnitPriceRefs.current[rowIndex]) {
            focusAndSelect(wholeSaleUnitPriceRefs.current[rowIndex]);
            setCurrentField("whole_sale_unit_price");
            setCurrentRowIndex(rowIndex);
          }
          break;
        default:
          focusProductSearch(rowIndex);
          break;
      }
    }, 50);
  };

  const displayedPosition = index => arrangedRows.findIndex(row => row.index === index);
  const adjacentRow = (index, direction) => arrangedRows[displayedPosition(index) + direction]?.index;
  const navigateToNextField = (currentFieldName, rowIndex = 0) => {
    setTimeout(() => {
      switch (currentFieldName) {
        case "supplier":
          if (invoiceNumberRef.current) {
            focusAndSelect(invoiceNumberRef.current);
            setCurrentField("invoice_number");
          }
          break;
        case "invoice_number":
          if (invoiceAmountRef.current) {
            focusAndSelect(invoiceAmountRef.current);
            setCurrentField("invoice_amount");
          }
          break;
        case "invoice_amount":
          focusProductSearch(arrangedRows[0]?.index ?? 0);
          break;
        case "product":
          // If batch field has ref and is visible, check if we should focus it
          if (batchRefs.current[rowIndex]) {
            batchRefs.current[rowIndex].focus();
            setCurrentField("batch");
          } else if (packQuantityRefs.current[rowIndex]) {
            packQuantityRefs.current[rowIndex].focus();
            setCurrentField("pack_quantity");
          }
          break;
        case "batch":
          if (form.items[rowIndex]?.batch && !form.items[rowIndex]?.expiry && expiryRefs.current[rowIndex]) {
            focusAndSelect(expiryRefs.current[rowIndex]);
            setCurrentField("expiry");
          } else if (packQuantityRefs.current[rowIndex]) {
            packQuantityRefs.current[rowIndex].focus();
            setCurrentField("pack_quantity");
          }
          break;
        case "expiry":
          if (packQuantityRefs.current[rowIndex]) {
            packQuantityRefs.current[rowIndex].focus();
            setCurrentField("pack_quantity");
          }
          break;
        case "pack_quantity":
          if (packPurchasePriceRefs.current[rowIndex]) {
            packPurchasePriceRefs.current[rowIndex].focus();
            setCurrentField("pack_purchase_price");
          }
          break;
        case "pack_purchase_price":
          if (itemDiscountRefs.current[rowIndex]) {
            itemDiscountRefs.current[rowIndex].focus();
            setCurrentField("item_discount");
          }
          break;
        case "item_discount":
          if (packBonusRefs.current[rowIndex]) {
            packBonusRefs.current[rowIndex].focus();
            setCurrentField("pack_bonus");
          }
          break;
        case "pack_bonus":
          if (packSalePriceRefs.current[rowIndex]) {
            packSalePriceRefs.current[rowIndex].focus();
            setCurrentField("pack_sale_price");
          }
          break;
        case "pack_sale_price":
          if (wholeSalePackPriceRefs.current[rowIndex]) {
            wholeSalePackPriceRefs.current[rowIndex].focus();
            setCurrentField("whole_sale_pack_price");
          }
          break;
        case "whole_sale_pack_price":
          if (wholeSaleUnitPriceRefs.current[rowIndex]) {
            wholeSaleUnitPriceRefs.current[rowIndex].focus();
            setCurrentField("whole_sale_unit_price");
          }
          break;
        case "whole_sale_unit_price":
          if (adjacentRow(rowIndex, 1) !== undefined) {
            focusProductSearch(adjacentRow(rowIndex, 1) ?? form.items.length);
          } else {
            addItem();
            focusProductSearch(adjacentRow(rowIndex, 1) ?? form.items.length);
          }
          break;
      }
    }, 50);
  };

  const handleKeyDown = (e, field, rowIndex = 0) => {
    // In batch field, never navigate rows or add a new row on ArrowDown or ArrowUp
    if (field === "batch" && (e.key === "ArrowDown" || e.key === "ArrowUp")) {
      return;
    }

    if (e.key === "Enter") {
      e.preventDefault();
      navigateToNextField(field, rowIndex);
    } else if (e.key === "Tab" && field === "invoice_amount") {
      e.preventDefault();
      navigateToNextField(field, rowIndex);
    } else if (e.key === "ArrowDown") {
      e.preventDefault();
      if (adjacentRow(rowIndex, 1) === undefined) {
        addItem();
        setTimeout(() => {
          focusProductSearch(adjacentRow(rowIndex, 1) ?? form.items.length);
        }, 200);
      } else {
        const nextRowIndex = adjacentRow(rowIndex, 1);
        focusOnField(field, nextRowIndex);
      }
    } else if (e.key === "ArrowUp") {
      e.preventDefault();
      if (adjacentRow(rowIndex, -1) !== undefined) {
        const prevRowIndex = adjacentRow(rowIndex, -1);
        focusOnField(field, prevRowIndex);
      }
    }
  };

  const handleProductKeyDown = (e, rowIndex) => {
    if (e.key === "Enter") {
      e.preventDefault();
      navigateToNextField("product", rowIndex);
    } else if (e.key === "ArrowUp" && adjacentRow(rowIndex, -1) !== undefined) {
      e.preventDefault();
      const prevRowIndex = adjacentRow(rowIndex, -1);
      focusProductSearch(prevRowIndex);
    } else if (e.key === "ArrowDown") {
      e.preventDefault();
      if (adjacentRow(rowIndex, 1) === undefined) {
        addItem();
        setTimeout(() => {
          focusProductSearch(adjacentRow(rowIndex, 1) ?? form.items.length);
        }, 200);
      } else {
        focusProductSearch(adjacentRow(rowIndex, 1) ?? form.items.length);
      }
    }
  };

  const zeroToEmpty = (v) => (v === 0 || v === "0" ? "" : (v ?? ""));
  const focusAndSelect = (el) => {
    if (!el) return;
    el.focus();
    setTimeout(() => {
      if (typeof el.select === "function") el.select();
    }, 0);
  };

  const handleBatchSelect = (rowIndex, val, batchObj = null) => {
    const isFromBlur = Boolean(batchObj?.fromBlur);

    if (batchObj?.is_unbatched || val === "" || val === "__unbatched__") {
      setForm((prev) => {
        const currentItem = prev.items[rowIndex];
        if (!currentItem) return prev;
        const newItems = [...prev.items];
        newItems[rowIndex] = {
          ...currentItem,
          batch: "",
          expiry: "",
          is_unbatched: true,
        };
        return { ...prev, items: newItems };
      });
      if (!isFromBlur) {
        setTimeout(() => {
          if (packQuantityRefs.current[rowIndex]) {
            packQuantityRefs.current[rowIndex].focus();
            setCurrentField("pack_quantity");
            setCurrentRowIndex(rowIndex);
          }
        }, 40);
      }
      return;
    }

    if (batchObj?.is_new) {
      setForm((prev) => {
        const currentItem = prev.items[rowIndex];
        if (!currentItem) return prev;
        const newItems = [...prev.items];
        newItems[rowIndex] = {
          ...currentItem,
          batch: val,
          is_unbatched: false,
        };
        return { ...prev, items: newItems };
      });
      if (!isFromBlur) {
        setTimeout(() => {
          if (expiryRefs.current[rowIndex]) {
            expiryRefs.current[rowIndex].focus();
            setCurrentField("expiry");
            setCurrentRowIndex(rowIndex);
          }
        }, 40);
      }
      return;
    }

    // Existing batch selected
    setForm((prev) => {
      const currentItem = prev.items[rowIndex];
      if (!currentItem) return prev;
      const batchExpiry = batchObj?.expiry_date || batchObj?.expiry || currentItem.expiry || "";
      const newItems = [...prev.items];
      newItems[rowIndex] = {
        ...currentItem,
        batch: val,
        expiry: batchExpiry,
        is_unbatched: false,
      };
      return { ...prev, items: newItems };
    });
    if (!isFromBlur) {
      setTimeout(() => {
        if (packQuantityRefs.current[rowIndex]) {
          packQuantityRefs.current[rowIndex].focus();
          setCurrentField("pack_quantity");
          setCurrentRowIndex(rowIndex);
        }
      }, 40);
    }
  };

  const handleSubmit = async (e) => {
    e.preventDefault();
    invoiceErrors.clear();
    if (savingRef.current) return;

    // Validate supplier selection for credit invoices
    if (form.invoice_type === "credit" && !form.supplier_id) {
      return invoiceErrors.showMessage("Please select a supplier for credit purchase");
    }

    const isPurchaseOrderReceipt = Boolean(form.purchase_order_id || initialData?.purchase_order_id);
    const hasDeliveredRow = (item) =>
      Number(item.unit_quantity || 0) > 0 || Number(item.unit_bonus || 0) > 0;

    // 0) Block if any selected product has margin <= 0 (or not a number)
    const badItem = form.items.find((item) => {
      if (!item.product_id) return false;
      if (isPurchaseOrderReceipt && !hasDeliveredRow(item)) return false;
      const m = Number(item.margin);
      return !Number.isFinite(m) || m <= 0;
    });
    if (badItem) {
      const idx = form.items.indexOf(badItem);
      const product = products.find((p) => p.id === badItem.product_id);
      const productName = product?.name || `row ${idx + 1}`;
      invoiceErrors.showMessage(`Margin must be greater than 0 for ${productName}`, idx);
      return;
    }

    // 1) Prevent negative margin (redundant now)
    const negativeMarginItem = form.items.find((item) => {
      if (!item.product_id) return false;
      if (isPurchaseOrderReceipt && !hasDeliveredRow(item)) return false;
      return Number(item.margin) < 0;
    });
    if (negativeMarginItem) {
      const product = products.find((p) => p.id === negativeMarginItem.product_id);
      const productName = product ? product.name : negativeMarginItem.product_id;
      invoiceErrors.showMessage(`Margin cannot be negative for Product ${productName}`, form.items.indexOf(negativeMarginItem));
      return;
    }

    // 2) Validate invoice vs total
    const invoiceAmount = Number(form.invoice_amount || 0);
    const totalAmount = Number(form.total_amount || 0);
    const totalPaid = Number(form.total_paid || 0);
    if (totalPaid < 0) {
      invoiceErrors.showMessage("Total Paid cannot be negative");
      return;
    }
    if (totalPaid > totalAmount) {
      invoiceErrors.showMessage("Total Paid cannot exceed Total Amount");
      return;
    }
    if (Math.abs(invoiceAmount - totalAmount) > 5) {
      invoiceErrors.showMessage(
        `Invoice amount (${invoiceAmount}) must be equal to total amount (${totalAmount}), difference > 5`
      );
      return;
    }

    // 3) Validate batch & expiry requirements and batch uniqueness per product
    const seenProductBatches = new Set();
    for (let i = 0; i < form.items.length; i++) {
      const it = form.items[i];
      if (!it.product_id) continue;
      if (isPurchaseOrderReceipt && !hasDeliveredRow(it)) continue;
      const pId = String(it.product_id);
      const product = products.find((p) => String(p.id) === pId);
      const productName = product?.name || `Product #${pId}`;

      // If batch is entered, expiry is required
      if (it.batch && String(it.batch).trim() !== "" && (!it.expiry || String(it.expiry).trim() === "")) {
        invoiceErrors.showMessage(
          `Row ${i + 1}: Expiry date is required for batch "${it.batch}" of "${productName}".`,
          i
        );
        return;
      }

      const batchKey = it.batch && String(it.batch).trim() !== "" ? `batch:${String(it.batch).trim()}` : "unbatched";
      const uniqueKey = `${pId}::${batchKey}`;

      if (seenProductBatches.has(uniqueKey)) {
        if (batchKey === "unbatched") {
          invoiceErrors.showMessage(
            `Row ${i + 1}: Unassigned stock for "${productName}" can only be added once per invoice.`,
            i
          );
        } else {
          invoiceErrors.showMessage(
            `Row ${i + 1}: Duplicate batch "${it.batch}" for "${productName}". Each batch can only be selected once per invoice.`,
            i
          );
        }
        return;
      }
      seenProductBatches.add(uniqueKey);
    }

    savingRef.current = true;
    setSaving(true);
    let submittedRowIndices = null;
    try {
      // 4) Duplicate invoice number check per supplier
      const checkRes = await axios.get("/api/purchase-invoices/check-unique", {
        params: {
          supplier_id: form.supplier_id,
          invoice_number: form.invoice_number,
          exclude_id: invoiceId || null,
        },
      });
      if (!checkRes.data.unique) {
        invoiceErrors.showMessage(
          `Invoice number "${form.invoice_number}" already exists for this supplier`
        );
        return;
      }

      // 🔒 Final guard: keep linked if user never changed it (for debit invoices only)
      const payload = {
        ...form,
        total_paid: (paidTouched || form.invoice_type === "credit")
          ? (form.total_paid === "" || form.total_paid == null ? 0 : form.total_paid)
          : (form.total_amount ?? 0),
      };

      const sortedRows = (arrangement === 'custom' || arrangement === 'original')
        ? arrangedRows
        : arrangePurchaseInvoiceRows(payload.items, products, arrangement);
      const nonBlankRows = sortedRows.some(row => Boolean(row.item.product_id))
        ? sortedRows.filter(row => Boolean(row.item.product_id))
        : sortedRows;
      const effectiveRows = isPurchaseOrderReceipt && nonBlankRows.some(row => hasDeliveredRow(row.item))
        ? nonBlankRows.filter(row => hasDeliveredRow(row.item))
        : nonBlankRows;
      submittedRowIndices = effectiveRows.map(row => row.index);
      const sortedFormItems = effectiveRows.map(row => row.item);
      const payloadToSend = {
        ...payload,
        items: effectiveRows.map(({ item: { _rowKey, ...restItem } }) => ({
          ...restItem,
          batch: restItem.batch ? String(restItem.batch).trim() : null,
          expiry: restItem.expiry ? String(restItem.expiry).trim() : null,
        })),
      };
      if (!invoiceId) {
        // Do NOT send posted_number on CREATE; server will atomically generate it.
        delete payloadToSend.posted_number;
        if (draftHook.activeDraftId) {
          payloadToSend.draft_id = draftHook.activeDraftId;
        }
      }

      const doSave = async (dataPayload) => {
        try {
          // If onSubmit prop is provided, use it for API calls
          if (onSubmit) {
            const result = await onSubmit(dataPayload);
            setForm((prev) => ({ ...prev, items: sortedFormItems }));
            setDisplayOrder([]);
            setArrangement('original');
            window.dispatchEvent(new CustomEvent("cash-drawer-changed"));
            window.dispatchEvent(new CustomEvent("accounts-changed"));
            try { localStorage.setItem("cash_drawer_sync", String(Date.now())); } catch {}
            try { localStorage.setItem("accounts_sync", String(Date.now())); } catch {}
            draftHook.resetToNew();
            onSuccess && onSuccess();
            return result;
          }

          // Original logic when onSubmit is not provided
          if (invoiceId) {
            await axios.put(`/api/purchase-invoices/${invoiceId}`, dataPayload);
            setForm((prev) => ({ ...prev, items: sortedFormItems }));
            setDisplayOrder([]);
            setArrangement('original');
            window.dispatchEvent(new CustomEvent("cash-drawer-changed"));
            window.dispatchEvent(new CustomEvent("accounts-changed"));
            try { localStorage.setItem("cash_drawer_sync", String(Date.now())); } catch {}
            try { localStorage.setItem("accounts_sync", String(Date.now())); } catch {}
            toast.success("Invoice updated successfully");
            onSuccess && onSuccess();
          } else {
            const { data: saved } = await axios.post("/api/purchase-invoices", dataPayload);
            window.dispatchEvent(new CustomEvent("cash-drawer-changed"));
            window.dispatchEvent(new CustomEvent("accounts-changed"));
            try { localStorage.setItem("cash_drawer_sync", String(Date.now())); } catch {}
            try { localStorage.setItem("accounts_sync", String(Date.now())); } catch {}
            draftHook.resetToNew();
            // Server returns created invoice with posted_number assigned — reflect it locally.
            setForm((prev) => ({
              ...prev,
              items: sortedFormItems,
              posted_number: saved?.posted_number || prev.posted_number,
            }));
            setDisplayOrder([]);
            setArrangement('original');
            toast.success(`Invoice created: ${saved?.posted_number || "(number assigned)"}`);
            onSuccess && onSuccess();
          }
        } catch (err) {
          invoiceErrors.showError(err, submittedRowIndices);
        } finally {
          savingRef.current = false;
          setSaving(false);
        }
      };

      if (invoiceId) {
        const orig = originalInvoiceMetaRef.current || {};
        const oldPayMethod = orig.payment_method || "cash";
        const oldInvType = orig.invoice_type || "debit";
        let oldPaid = Number(orig.total_paid ?? 0);
        if (oldInvType === "debit" && oldPaid <= 0) {
          oldPaid = Number(orig.total_amount ?? 0);
        }
        const oldCash = oldPayMethod === "cash" ? oldPaid : 0;

        const newPayMethod = payloadToSend.payment_method || "cash";
        const newInvType = payloadToSend.invoice_type || "debit";
        let newPaid = Number(payloadToSend.total_paid ?? 0);
        if (newInvType === "debit" && newPaid <= 0) {
          newPaid = Number(payloadToSend.total_amount ?? 0);
        }
        const newCash = newPayMethod === "cash" ? newPaid : 0;
        const cashDelta = Math.round((newCash - oldCash) * 100) / 100;

        if (Math.abs(cashDelta) > 0.001) {
          try {
            const drawerRes = await axios.get("/api/cash-drawer/current");
            if (drawerRes.data?.is_open && drawerRes.data?.session) {
              const invoiceTime = new Date(orig.created_at || orig.posted_date || orig.date).getTime();
              const shiftTime = new Date(drawerRes.data.session.opened_at).getTime();

              if (invoiceTime < shiftTime) {
                savingRef.current = false;
                setSaving(false);
                setDrawerPrompt({
                  isOpen: true,
                  oldCash,
                  newCash,
                  cashDelta,
                  execute: (updateDrawer) => doSave({ ...payloadToSend, update_drawer: updateDrawer, update_drawer_if_pre_shift: updateDrawer }),
                });
                return;
              }
            }
          } catch (e) {
            // ignore drawer check error and proceed
          }
        }
      }

      await doSave(payloadToSend);
    } catch (err) {
      invoiceErrors.showError(err, submittedRowIndices);
      savingRef.current = false;
      setSaving(false);
    }
  };

  // Common anti-autofill props to spread on inputs
  const antiFill = {
    autoComplete: "off",
    autoCorrect: "off",
    autoCapitalize: "off",
    spellCheck: false,
  };

  // Get dark mode state and theme colors
  const { isDark, theme } = useTheme();
  
  // Get sale system setting to conditionally show wholesale fields
  const { hasWholesale, loading: saleSystemLoading } = useSaleSystem();

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

  // 🎨 Dynamic Button styles using theme colors
  const buttonStyle = theme?.button_style || 'modern';
  
  const getButtonClasses = useMemo(
    () => getThemeButtonClasses(buttonStyle, themeColors, isDark),
    [buttonStyle, themeColors, isDark]
  );

  const btnPrimary = getButtonClasses.primary;
  const btnSecondary = getButtonClasses.secondary;
  const btnDanger = getButtonClasses.danger;
  const btnGlass = getButtonClasses.glass;

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
      borderRadius: 6,
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

  return (
    <form
      className="purchase-entry flex flex-col h-auto lg:h-[calc(100dvh-130px)]"
      autoComplete="off" // disable browser suggestions globally
    >
      <InvoiceErrorSummary errors={invoiceErrors} />
      {dnd.ghost}
      {(initialData?.purchase_order || form.purchase_order) && (
        <div className="g-toolbar px-3 py-1 text-[11px] flex flex-wrap items-center gap-x-2 gap-y-0.5">
          <span>
            Generated from PO{" "}
            <a className="underline font-semibold" href={`/purchase-orders/${(initialData?.purchase_order || form.purchase_order).id}`}>
              {(initialData?.purchase_order || form.purchase_order).number}
            </a>
            . Review quantities, prices, batches and expiry before saving.
          </span>
          {!invoiceId && (
            <span className="font-medium opacity-85">
              · {(initialData?.purchase_order || form.purchase_order).previous_receipts ? `Additional delivery (${(initialData?.purchase_order || form.purchase_order).previous_receipts} prev)` : "First delivery"} · {(initialData?.purchase_order || form.purchase_order).remaining_units} paid units remaining (undelivered added to User Demands).
            </span>
          )}
        </div>
      )}
{/* ================= HEADER SECTION ================= */}
      <div className="purchase-entry-header sticky top-0 z-10 shadow-sm" autoComplete="off">
{/* ---- Compact Branded Title Banner ---- */}
        <div className="purchase-entry-banner px-3 py-1 flex items-center justify-between gap-2">
          <div className="flex items-center gap-2 min-w-0">
            <div className="purchase-entry-icon w-7 h-7 rounded-lg flex items-center justify-center shadow-inner shrink-0">
              {/* Document / invoice icon */}
              <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round">
                <path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z" />
                <polyline points="14 2 14 8 20 8" />
                <line x1="8" y1="13" x2="16" y2="13" />
                <line x1="8" y1="17" x2="13" y2="17" />
              </svg>
            </div>
            <div className="flex items-baseline gap-2 min-w-0 truncate">
              <h2 className="purchase-entry-title text-sm font-semibold leading-none">Purchase Invoice</h2>
              <span className="products-subtitle text-[10px] hidden sm:inline truncate">
                Enter to navigate · Alt+S save · Alt+T toggle
              </span>
            </div>
          </div>

          <div className="flex items-center gap-2 shrink-0">
            {isDraftingEnabled && (
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
              className="purchase-entry-type flex items-center gap-0.5 rounded-md p-0.5 shadow-inner"
              role="radiogroup"
              aria-label="Invoice type"
            >
              {["debit", "credit"].map((type) => {
                const active = form.invoice_type === type;
                return (
                  <button
                    key={type}
                    type="button"
                    role="radio"
                    aria-checked={active}
                    aria-pressed={active}
                    onClick={() => handleInvoiceTypeChange(type)}
                    className={`purchase-entry-type-button inline-flex items-center gap-1 px-2.5 py-0.5 text-[11px] font-semibold rounded transition-all duration-150 cursor-pointer ${
                      active
                        ? "is-active theme-btn-primary shadow-xs"
                        : "opacity-75 hover:opacity-100 hover:bg-black/5 dark:hover:bg-white/5"
                    }`}
                  >
                    {active && <CheckIcon className="w-3 h-3 shrink-0" aria-hidden="true" />}
                    <span>{type === "debit" ? "Debit" : "Credit"}</span>
                  </button>
                );
              })}
            </div>

            {/* Add Product Button */}
            <button
              type="button"
              onClick={() => setShowProductModal(true)}
              className="purchase-entry-add-product theme-btn-secondary px-2.5 py-1 text-[11px] font-semibold rounded-md"
            >
              <PlusCircleIcon aria-hidden="true" className="w-3.5 h-3.5" />
              <span>Add Product</span>
            </button>
          </div>
        </div>

        {/* ---- Compact Single-Row Fields Card ---- */}
        <div className="purchase-entry-details px-3 py-1 border-b">
          <div className="grid grid-cols-12 gap-1.5 items-end">
            {/* Posted Number - col 1 */}
            <div className="col-span-6 sm:col-span-3 lg:col-span-1">
              <label className="flex items-center justify-between text-[9px] font-semibold uppercase tracking-wide text-gray-500 dark:text-gray-400 mb-0.5">
                <span className="truncate">Posted #</span>
                <span className="text-[8px] font-medium lowercase opacity-75">auto</span>
              </label>
              <input
                type="text"
                name="posted_number"
                readOnly
                tabIndex={-1}
                placeholder="Auto"
                value={form.posted_number || ""}
                className="purchase-readonly-field rounded-md w-full px-1.5 h-7 text-[11px] font-mono"
                {...antiFill}
              />
            </div>

            {/* Date - col 2 */}
            <div className="col-span-6 sm:col-span-3 lg:col-span-2">
              <label className="block text-[9px] font-semibold uppercase tracking-wide text-gray-500 dark:text-gray-400 mb-0.5">Date</label>
              <input
                type="date"
                name="posted_date"
                value={form.posted_date}
                onChange={handleChange}
                className="border border-gray-300 dark:border-slate-600 rounded-md w-full px-1.5 h-7 text-[11px] bg-white dark:bg-slate-700 text-gray-900 dark:text-gray-100"
                {...antiFill}
              />
            </div>

            {/* Supplier - col 3 */}
            <div className="col-span-12 sm:col-span-6 lg:col-span-3">
              <label className="block text-[9px] font-semibold uppercase tracking-wide text-gray-500 dark:text-gray-400 mb-0.5">Supplier *</label>
              <button
                type="button"
                ref={supplierRef}
                onClick={() => setSupplierSearchOpen(true)}
                className={`w-full h-7 px-2 rounded-md border text-left text-[11px] flex items-center justify-between gap-1.5 transition-all duration-200
                  ${selectedSupplier
                    ? 'border-blue-400 bg-blue-50 dark:bg-blue-900/30 text-blue-700 dark:text-blue-200'
                    : 'border-gray-300 dark:border-slate-600 bg-white dark:bg-slate-700 text-gray-500 dark:text-gray-400 hover:border-blue-400'
                  }`}
                style={{ color: selectedSupplier ? undefined : (isDark ? "#94a3b8" : "#9ca3af") }}
                {...antiFill}
              >
                <span className="flex items-center gap-1 min-w-0 truncate">
                  <BuildingStorefrontIcon className="w-3.5 h-3.5 shrink-0 text-blue-500" />
                  {selectedSupplier ? (
                    <span className="truncate font-medium" style={{ color: isDark ? "#bfdbfe" : "#1d4ed8" }}>
                      {selectedSupplier.name}
                    </span>
                  ) : (
                    <span className="truncate">Click to search supplier...</span>
                  )}
                </span>
                <span className="text-[9px] text-gray-400 dark:text-slate-400 shrink-0 font-normal">Search</span>
              </button>
            </div>

            {/* Invoice Number - col 1 */}
            <div className="col-span-4 sm:col-span-3 lg:col-span-1">
              <label className="block text-[9px] font-semibold uppercase tracking-wide text-gray-500 dark:text-gray-400 mb-0.5">Invoice #</label>
              <input
                ref={invoiceNumberRef}
                type="text"
                name="invoice_number"
                placeholder="Bill #"
                value={form.invoice_number}
                onChange={handleChange}
                onKeyDown={(e) => handleKeyDown(e, "invoice_number")}
                onFocus={(e) => e.target.select()}
                className="border border-gray-300 dark:border-slate-600 rounded-md w-full px-1.5 h-7 text-[11px] bg-white dark:bg-slate-700 text-gray-900 dark:text-gray-100"
                {...antiFill}
              />
            </div>

            {/* Invoice Amount - col 1 */}
            <div className="col-span-4 sm:col-span-3 lg:col-span-1">
              <label className="block text-[9px] font-semibold uppercase tracking-wide text-gray-500 dark:text-gray-400 mb-0.5">Bill Amt</label>
              <input
                ref={invoiceAmountRef}
                type="text"
                inputMode="decimal"
                name="invoice_amount"
                placeholder="0.00"
                value={form.invoice_amount}
                onChange={handleChange}
                onKeyDown={(e) => handleKeyDown(e, "invoice_amount")}
                onFocus={(e) => e.target.select()}
                className="border border-gray-300 dark:border-slate-600 rounded-md w-full px-1.5 h-7 text-[11px] text-right font-mono bg-white dark:bg-slate-700 text-gray-900 dark:text-gray-100"
                {...antiFill}
              />
            </div>

            {/* Difference - col 1 */}
            <div className="col-span-4 sm:col-span-2 lg:col-span-1">
              <label className="flex items-center justify-between text-[9px] font-semibold uppercase tracking-wide text-gray-500 dark:text-gray-400 mb-0.5">
                <span className="truncate">Diff</span>
                <span className="text-[8px] font-medium lowercase opacity-75">auto</span>
              </label>
              <input
                type="text"
                readOnly
                tabIndex={-1}
                placeholder="—"
                value={
                  form.invoice_amount && form.total_amount
                    ? (Number(form.invoice_amount) - Number(form.total_amount)).toFixed(2)
                    : ""
                }
                className={`purchase-readonly-field rounded-md w-full px-1.5 h-7 text-[11px] font-bold font-mono text-center ${
                  Number(form.invoice_amount) - Number(form.total_amount) !== 0
                    ? "!text-red-600 dark:!text-red-400"
                    : ""
                }`}
                {...antiFill}
              />
            </div>

            {/* Remarks - col 3 (same row!) */}
            <div className="col-span-12 sm:col-span-4 lg:col-span-3">
              <label className="block text-[9px] font-semibold uppercase tracking-wide text-gray-500 dark:text-gray-400 mb-0.5">Remarks</label>
              <input
                type="text"
                name="remarks"
                placeholder="Remarks / delivery notes..."
                value={form.remarks}
                onChange={handleChange}
                className="border border-gray-300 dark:border-slate-600 rounded-md w-full px-2 h-7 text-[11px] bg-white dark:bg-slate-700 text-gray-900 dark:text-gray-100"
                {...antiFill}
              />
            </div>
          </div>

          {(form.invoice_type === "credit" || supplierCreditSummary?.is_limit_exceeded || Number(supplierCreditSummary?.total_overdue || 0) > 0) && (
            <div className="mt-1 py-0.5 px-2.5 rounded bg-blue-50/90 dark:bg-blue-950/40 border border-blue-200 dark:border-blue-800 flex flex-wrap items-center justify-between gap-2 text-[11px]">
              <div className="flex items-center gap-2.5 flex-wrap">
                <span className="font-semibold text-blue-900 dark:text-blue-200">
                  Credit Terms: <strong>{(supplierCreditSummary?.credit_days ?? selectedSupplier?.credit_days) ? `${supplierCreditSummary?.credit_days ?? selectedSupplier?.credit_days} days` : 'Immediate'}</strong>
                </span>
                <span className="text-gray-600 dark:text-gray-300">
                  Credit Limit: <strong>{Number(supplierCreditSummary?.credit_limit ?? selectedSupplier?.credit_limit) > 0 ? `Rs. ${Number(supplierCreditSummary?.credit_limit ?? selectedSupplier?.credit_limit).toLocaleString()}` : 'Unlimited'}</strong>
                </span>
                {supplierCreditSummary && (
                  <>
                    <span className="text-gray-600 dark:text-gray-300">
                      Current Payable: <strong className="font-mono">Rs. {Number(supplierCreditSummary.current_balance || 0).toLocaleString()}</strong>
                    </span>
                    {supplierCreditSummary.available_credit !== null && supplierCreditSummary.available_credit !== undefined && (
                      <span className="text-emerald-700 dark:text-emerald-400">
                        Available Credit: <strong className="font-mono">Rs. {Number(supplierCreditSummary.available_credit).toLocaleString()}</strong>
                      </span>
                    )}
                    {Number(supplierCreditSummary.total_overdue || 0) > 0 && (
                      <span className="px-1.5 py-0.2 rounded bg-amber-100 dark:bg-amber-900/50 text-amber-800 dark:text-amber-300 font-semibold">
                        Overdue: Rs. {Number(supplierCreditSummary.total_overdue).toLocaleString()} ({supplierCreditSummary.overdue_invoices_count} bill{supplierCreditSummary.overdue_invoices_count === 1 ? "" : "s"})
                      </span>
                    )}
                    {(supplierCreditSummary.is_limit_exceeded ||
                      (Number(supplierCreditSummary.credit_limit || 0) > 0 &&
                        Number(supplierCreditSummary.current_balance || 0) +
                          Math.max(0, Number(form.total_amount || 0) - Number(form.total_paid || 0)) >
                          Number(supplierCreditSummary.credit_limit))) && (
                      <span className="px-1.5 py-0.2 rounded bg-rose-100 dark:bg-rose-900/50 text-rose-700 dark:text-rose-300 font-bold">
                        Credit Limit Exceeded
                      </span>
                    )}
                  </>
                )}
              </div>
              {form.invoice_type === "credit" && (
                <div className="flex items-center gap-1.5">
                  <label className="text-[9px] font-bold text-gray-600 dark:text-gray-300 uppercase tracking-wider">Due Date:</label>
                  <input
                    type="date"
                    name="due_date"
                    value={form.due_date || ""}
                    onChange={handleChange}
                    className="h-5 px-1 text-[11px] rounded border border-blue-300 dark:border-blue-700 bg-white dark:bg-slate-800 text-gray-900 dark:text-gray-100 font-mono"
                  />
                </div>
              )}
            </div>
          )}
        </div>
      </div>

      {/* ---- Combined Compact Line Items & Arrangement Bar ---- */}
      <div className="flex shrink-0 flex-wrap items-center justify-between gap-2 px-3 py-1 border-b border-gray-200 dark:border-slate-600 text-[11px]">
        <div className="flex items-center gap-3 flex-wrap min-w-0">
          <span className="font-bold tracking-wide uppercase text-gray-700 dark:text-slate-300">
            Line Items
          </span>
          <span className="text-gray-500 dark:text-slate-400 truncate">
            Drag ⠿ to reorder products/brands (or focus ⠿ + ↑↓) · new items stay at end
            {remembersSupplierOrder && ` · Order remembered for ${selectedSupplier?.name || 'supplier'}`}
          </span>
          <div className="hidden lg:flex items-center gap-2.5 text-[10px]">
            <span className="inline-flex items-center gap-1 font-medium text-gray-600 dark:text-slate-300">
              <span className="w-2 h-2 rounded-xs border border-blue-500 bg-white dark:bg-slate-700 inline-block" />
              <span>Editable</span>
            </span>
            <span className="inline-flex items-center gap-1 font-medium text-gray-400 dark:text-slate-400">
              <span className="w-2 h-2 rounded-xs border border-dashed border-gray-400 dark:border-slate-500 bg-gray-100 dark:bg-slate-800/80 inline-block" />
              <span>Auto</span>
            </span>
          </div>
        </div>
        <label className="flex flex-wrap items-center gap-1.5 text-[11px] w-full sm:w-auto shrink-0">
          <span className="font-medium text-gray-600 dark:text-slate-300">Arrange products</span>
          <div className="w-full sm:w-52 text-left">
            <Select
              aria-label="Purchase invoice arrangement on save"
              options={[
                ...(arrangement === 'custom' ? [{ value: 'custom', label: 'Custom order (moved manually)' }] : []),
                ...[...new Set(purchaseInvoiceArrangements.map(option => option.group))].map(group => ({
                  label: group,
                  options: purchaseInvoiceArrangements
                    .filter(option => option.group === group)
                    .map(option => ({
                      value: option.id,
                      label: option.id === 'original' && remembersSupplierOrder ? 'Saved supplier order' : option.label,
                    })),
                }))
              ]}
              value={
                arrangement === 'custom'
                  ? { value: 'custom', label: 'Custom order (moved manually)' }
                  : purchaseInvoiceArrangements.map(o => ({
                      value: o.id,
                      label: o.id === 'original' && remembersSupplierOrder ? 'Saved supplier order' : o.label
                    })).find(o => o.value === arrangement)
              }
              onChange={opt => applyArrangement(opt?.value)}
              styles={paymentSelectStyles}
              isSearchable={false}
              menuPlacement="auto"
            />
          </div>
          <button type="button" className="g-btn-ghost theme-btn-tertiary px-2 py-0.5 text-[11px] font-semibold" onClick={() => applyArrangement(arrangement)}>Apply Sort</button>
        </label>
      </div>
      {/* ================= ITEMS SECTION ================= */}
      <div ref={itemsScrollRef} className="purchase-entry-items flex-1 min-h-0 overflow-auto pt-1 px-2 pb-4" autoComplete="off">
        <table className={`invoice-repeater-table w-full lg:table-fixed ${hasWholesale ? 'lg:min-w-[1180px]' : 'lg:min-w-[1040px]'} border-collapse text-[11px]`}>
          <colgroup>
            <col className="w-7" />
            <col className="w-auto min-w-[230px]" />
            <col className="w-10" />
            <col className="w-[74px]" />
            <col className="w-[98px]" />
            <col className="w-11" />
            <col className="w-11" />
            <col className="w-13" />
            <col className="w-13" />
            <col className="w-10" />
            <col className="w-10" />
            <col className="w-10" />
            <col className="w-13" />
            <col className="w-13" />
            <col className={!hasWholesale ? 'hidden' : 'w-13'} />
            <col className={!hasWholesale ? 'hidden' : 'w-13'} />
            <col className="w-11" />
            <col className={!hasWholesale ? 'hidden' : 'w-11'} />
            <col className="w-13" />
            <col className="w-18" />
            <col className="w-6" />
          </colgroup>
          <thead className="sticky top-0 bg-gray-100 dark:bg-slate-700 z-5">
            <tr>
              <th rowSpan={2} className="border w-7 purchase-th-readonly">#</th>
              <th rowSpan={2} colSpan={1} className="border w-[26%] min-w-[230px] purchase-th-editable">Product *</th>
              <th colSpan={3} className="border w-[212px]">Pack Size / Batch / Expiry</th>
              <th colSpan={2} className="border purchase-th-editable">Qty (Pack / Unit)</th>
              <th colSpan={2} className="border purchase-th-editable">Purchase Price (P / U)</th>
              <th colSpan={3} className="border purchase-th-editable">Disc % / Bonus (P / U)</th>
              <th colSpan={2} className="border purchase-th-editable">Sale Price (P / U)</th>
              <th colSpan={2} className={`border purchase-th-editable ${!hasWholesale ? 'hidden' : ''}`}>Wholesale Price (P / U)</th>
              <th colSpan={hasWholesale ? 4 : 3} className="border purchase-th-readonly">Margin % {hasWholesale && '/ W.S.Mrg%'} / Avg / Sub Total</th>
              <th rowSpan={2} className="border w-6">+</th>
            </tr>

            <tr>
              <th className="border w-10 purchase-th-readonly" title="Pack Size (Auto)">PSize</th>
              <th className="border w-[74px] purchase-th-editable">Batch</th>
              <th className="border w-[98px] min-w-[98px] purchase-th-editable">Exp</th>
              <th className="border w-11 purchase-th-editable">Pack.Q</th>
              <th className="border w-11 purchase-th-editable">Unit.Q</th>
              <th className="border w-13 purchase-th-editable">Pack.P</th>
              <th className="border w-13 purchase-th-editable">Unit.P</th>
              <th className="border w-10 purchase-th-editable">Disc%</th>
              <th className="border w-10 purchase-th-editable">PBonus</th>
              <th className="border w-10 purchase-th-editable">UBonus</th>
              <th className="border w-13 purchase-th-editable">Pack.S</th>
              <th className="border w-13 purchase-th-editable">Unit.S</th>
              <th className={`border w-13 purchase-th-editable ${!hasWholesale ? 'hidden' : ''}`}>W.S.Pack</th>
              <th className={`border w-13 purchase-th-editable ${!hasWholesale ? 'hidden' : ''}`}>W.S.Unit</th>
              <th className="border w-11 purchase-th-readonly" title="Retail Margin % (Auto)">Margin%</th>
              <th className={`border w-11 purchase-th-readonly ${!hasWholesale ? 'hidden' : ''}`} title="Wholesale Margin % (Auto)">W.S.Mrg%</th>
              <th className="border w-13 purchase-th-readonly" title="Average Unit Cost (Auto)">Avg</th>
              <th className="border w-18 purchase-th-readonly" title="Row Sub Total (Auto)">Sub Total</th>
            </tr>
          </thead>

          <tbody>
            {arrangedRows.map(({ item, index: i, brand_name, product_name }) => {
              const rowKey = getRowKey(item);
              return (
              <Fragment key={rowKey}>
                {dnd.groupStart.has(i) && (() => {
                  const groupPos = dnd.groupStart.get(i);
                  const brandLabel = brand_name || 'No Brand';
                  return (
                    <tr key={`brand-heading-${rowKey}`} className={`purchase-invoice-brand-heading ${dnd.headingDropClass(groupPos)} ${dnd.isDragging(i) ? 'dnd-dragging' : ''}`} data-dnd-group={groupPos}>
                      <th colSpan={21} scope="rowgroup">
                        <span className="inline-flex items-center gap-2">
                          {dnd.groups.length > 1 && (
                            <button type="button" className="invoice-drag-handle" onPointerDown={e => dnd.startGroupDrag(e, groupPos, brandLabel)} onKeyDown={e => dnd.keyMoveGroup(e, groupPos)} aria-label={`Move brand ${brandLabel}. Drag, or use arrow up and down keys.`} title="Drag to move this whole brand">
                              <DragGripIcon />
                            </button>
                          )}
                          {brandLabel}
                          <span className="font-normal opacity-60">· {dnd.groups[groupPos]?.indices.length || 0}</span>
                        </span>
                      </th>
                    </tr>
                  );
                })()}
              <tr key={rowKey} id={invoiceErrors.rowId(i)} data-dnd-row={item.product_id ? i : undefined} aria-invalid={invoiceErrors.rowMessages(i).length > 0 || undefined} className={`invoice-repeater-row text-center ${invoiceErrors.rowMessages(i).length ? "invoice-row-invalid" : ""} ${item.product_id ? dnd.rowDropClass(i) : ""} ${item.product_id && dnd.isDragging(i) ? "dnd-dragging" : ""}`}>
                {/* Drag handle / Remove */}
                <td className="invoice-cell-index-actions border">
                  <div className="flex items-center justify-between lg:justify-center gap-1.5">
                    <span className="lg:hidden text-[11px] font-bold uppercase tracking-wider text-slate-500 dark:text-slate-400">Item #{i + 1}</span>
                    <div className="flex items-center gap-1.5">
                      {item.product_id && (
                        <button type="button" className="invoice-drag-handle" onPointerDown={e => dnd.startRowDrag(e, i, product_name || `Item ${i + 1}`)} onKeyDown={e => dnd.keyMoveRow(e, i)} aria-label={`Move ${product_name || `item ${i + 1}`}. Drag, or use arrow up and down keys.`} title="Drag to reorder">
                          <DragGripIcon />
                        </button>
                      )}
                      <button
                        type="button"
                        onMouseDown={(e) => e.preventDefault()}
                        onClick={() => removeItem(i)}
                        className="products-row-action products-row-delete"
                        aria-label={`Remove item ${i + 1}`}
                        title="Remove item"
                      >
                        <TrashIcon aria-hidden="true" className="w-4 h-4" />
                      </button>
                    </div>
                  </div>
                </td>

                {/* Product Search Input */}
                <td colSpan={1} data-label="Product *" className="invoice-cell-product border text-left w-[26%] min-w-[230px]">
                  <InvoiceRowError messages={invoiceErrors.rowMessages(i)} />
                  <div ref={(el) => (productSearchRefs.current[i] = el)}>
                    <ProductSearchInput
                      value={products.find(p => String(p.id) === String(item.product_id)) || item.product || (item.product_name ? { id: item.product_id, name: item.product_name } : item.product_id)}
                      onChange={async (val) => {
                        const list = Array.isArray(products) ? products : (Array.isArray(products?.data) ? products.data : []);
                        const selectedProduct = (val && typeof val === "object") ? val : list.find((p) => p?.id === val);
                        if (!selectedProduct) return;
                        upsertProducts([selectedProduct]);

                        const get = (obj, keys, d="") => {
                          for (const k of keys) {
                            const v = obj?.[k];
                            if (v !== undefined && v !== null && v !== "") return v;
                          }
                          return d;
                        };

                        const toNum = (x) => {
                          const n = Number(x);
                          return Number.isFinite(n) ? n : null;
                        };

                        const packSize = toNum(get(selectedProduct, ["pack_size","packSize","packsize"]));
                        const packPurchase = toNum(get(selectedProduct, ["pack_purchase_price","packPurchasePrice"]));
                        const unitPurchase = toNum(get(selectedProduct, ["unit_purchase_price","unitPurchasePrice"])) ?? ((packPurchase != null && packSize) ? (packPurchase / packSize) : null);
                        const packSale = toNum(get(selectedProduct, ["pack_sale_price","packSalePrice"]));
                        const unitSale = toNum(get(selectedProduct, ["unit_sale_price","unitSalePrice"])) ?? ((packSale != null && packSize) ? (packSale / packSize) : null);
                        // Get wholesale prices from product
                        const wholeSalePack = toNum(get(selectedProduct, ["whole_sale_pack_price","wholeSalePackPrice"]));
                        const wholeSaleUnit = toNum(get(selectedProduct, ["whole_sale_unit_price","wholeSaleUnitPrice"])) ?? ((wholeSalePack != null && packSize) ? (wholeSalePack / packSize) : null);
                        const margin = get(selectedProduct, ["margin","margin_percentage","marginPercent"], "");
                        const avg = get(selectedProduct, ["avg_price","average_price","avgPrice"], "");

                        // Fetch batches for the selected product into batchesByProduct
                        let fetchedBatches = [];
                        if (selectedProduct?.id) {
                          fetchedBatches = await fetchProductBatches(selectedProduct.id);
                        }

                        const assignedBatches = (fetchedBatches || []).filter(
                          (b) => !b.is_unbatched && b.batch_number && String(b.batch_number).trim() !== ""
                        );
                        const hasAssignedBatches = assignedBatches.length > 0;

                        // Preserve if re-selecting same product; if product has no assigned batches, auto-select unassigned
                        const isSameProduct = String(form.items[i]?.product_id) === String(selectedProduct?.id);
                        const batch = isSameProduct ? form.items[i]?.batch || "" : "";
                        const expiry = isSameProduct ? form.items[i]?.expiry || "" : "";
                        const isUnbatched = isSameProduct
                          ? Boolean(form.items[i]?.is_unbatched)
                          : (!hasAssignedBatches);

                        const newItems = [...form.items];
                        const prepared = {
                          ...newItems[i],
                          purchase_order_item_id: isSameProduct ? (newItems[i]?.purchase_order_item_id ?? null) : null,
                          product_id: selectedProduct?.id || "",
                          product: selectedProduct,
                          pack_size: packSize ?? "",
                          pack_purchase_price: zeroToEmpty(packPurchase),
                          unit_purchase_price: unitPurchase ?? "",
                          pack_sale_price: zeroToEmpty(packSale),
                          unit_sale_price: unitSale ?? "",
                          whole_sale_pack_price: zeroToEmpty(wholeSalePack),
                          whole_sale_unit_price: wholeSaleUnit ?? "",
                          whole_sale_margin: "",
                          batch: batch,
                          expiry: expiry,
                          is_unbatched: isUnbatched,
                          pack_quantity: "",
                          unit_quantity: "",
                          pack_bonus: "",
                          unit_bonus: "",
                          item_discount_percentage: "",
                          margin: margin ?? "",
                          sub_total: "",
                          avg_price: avg ?? "",
                          quantity: "",
                        };

                        newItems[i] = recalcItem(prepared, "product");
                        let nextForm = { ...form, items: newItems };
                        nextForm = recalcFooter(nextForm, "items");
                        if (!paidTouched && nextForm.invoice_type !== "credit") nextForm.total_paid = nextForm.total_amount ?? "";
                        setForm(nextForm);
                        
                        // Focus on batch field if product has assigned batches, else shift directly to quantity
                        setTimeout(() => {
                          if (hasAssignedBatches) {
                            if (batchRefs.current[i]) {
                              batchRefs.current[i].focus();
                              batchRefs.current[i].openMenu?.();
                              setCurrentField("batch");
                              setCurrentRowIndex(i);
                            }
                          } else {
                            if (packQuantityRefs.current[i]) {
                              packQuantityRefs.current[i].focus();
                              setCurrentField("pack_quantity");
                              setCurrentRowIndex(i);
                            }
                          }
                        }, 50);
                      }}
                      onKeyDown={(e) => handleProductKeyDown(e, i)}
                      products={products}
                      onRefreshProducts={fetchProducts}
                    />
                  </div>
                </td>

                {/* Pack Size (Read-only) */}
                <td data-label="Pack Size" className="border w-10">
                  <input
                    type="text"
                    readOnly
                    tabIndex={-1}
                    placeholder="—"
                    value={item.pack_size ?? ""}
                    className="purchase-readonly-field w-full h-7 text-[11px] px-1 text-center font-mono"
                    {...antiFill}
                  />
                </td>

                {/* Batch */}
                <td data-label="Batch" className="border w-[74px]">
                  <BatchSearchInput
                    ref={(el) => (batchRefs.current[i] = el)}
                    mode="purchase"
                    allowNew={true}
                    value={
                      item.batch
                        ? item.batch
                        : item.is_unbatched
                        ? "[Unassigned Stock]"
                        : ""
                    }
                    batches={batchesByProduct[item.product_id] || []}
                    usedBatches={form.items
                      .filter((it, idx) => idx !== i && String(it.product_id) === String(item.product_id))
                      .map((it) => (it.batch ? String(it.batch).trim() : it.is_unbatched ? "__unbatched__" : ""))}
                    onChange={(val, batchObj) => handleBatchSelect(i, val, batchObj)}
                    onKeyDown={(e) => handleKeyDown(e, "batch", i)}
                    placeholder="Batch..."
                  />
                </td>

                {/* Expiry */}
                <td data-label="Expiry" className="border w-[98px] min-w-[98px]">
                  <input
                    ref={(el) => (expiryRefs.current[i] = el)}
                    type="date"
                    value={item.expiry ?? ""}
                    title={item.expiry || undefined}
                    onChange={(e) => handleItemChange(i, "expiry", e.target.value)}
                    onKeyDown={(e) => handleKeyDown(e, "expiry", i)}
                    className="border w-full min-w-0 h-7 text-[10.5px] px-0.5 bg-white dark:bg-slate-700 text-gray-900 dark:text-gray-100 font-mono"
                    {...antiFill}
                  />
                </td>

                {/* Pack Qty */}
                <td data-label="Pack Qty" className="border">
                  <input
                    ref={(el) => (packQuantityRefs.current[i] = el)}
                    type="text"
                    inputMode="decimal"
                    placeholder="0"
                    value={item.pack_quantity === 0 ? "" : item.pack_quantity}
                    onChange={(e) => handleItemChange(i, "pack_quantity", e.target.value)}
                    onKeyDown={(e) => handleKeyDown(e, "pack_quantity", i)}
                    onFocus={(e) => e.target.select()}
                    className="border w-full h-7 text-[11px] px-1.5 text-center font-bold bg-white dark:bg-slate-700 text-gray-900 dark:text-gray-100"
                    {...antiFill}
                  />
                </td>

                {/* Unit Qty */}
                <td data-label="Unit Qty" className="border">
                  <input
                    type="text"
                    inputMode="decimal"
                    placeholder="0"
                    value={item.unit_quantity === 0 ? "" : item.unit_quantity}
                    onChange={(e) => handleItemChange(i, "unit_quantity", e.target.value)}
                    className="border w-full h-7 text-[11px] px-1.5 text-center font-bold bg-white dark:bg-slate-700 text-gray-900 dark:text-gray-100"
                    {...antiFill}
                  />
                </td>

                {/* Pack Purchase */}
                <td data-label="Pack Cost" className="border">
                  <input
                    ref={(el) => (packPurchasePriceRefs.current[i] = el)}
                    type="text"
                    inputMode="decimal"
                    placeholder="0.00"
                    value={item.pack_purchase_price === 0 ? "" : item.pack_purchase_price}
                    onChange={(e) => handleItemChange(i, "pack_purchase_price", e.target.value)}
                    onKeyDown={(e) => handleKeyDown(e, "pack_purchase_price", i)}
                    onFocus={(e) => e.target.select()}
                    className="border w-full h-7 text-[11px] px-1.5 text-right font-mono bg-white dark:bg-slate-700 text-gray-900 dark:text-gray-100"
                    {...antiFill}
                  />
                </td>

                {/* Unit Purchase */}
                <td data-label="Unit Cost" className="border">
                  <input
                    type="text"
                    inputMode="decimal"
                    placeholder="0.00"
                    value={item.unit_purchase_price ?? ""}
                    onChange={(e) => handleItemChange(i, "unit_purchase_price", e.target.value)}
                    className="border w-full h-7 text-[11px] px-1.5 text-right font-mono bg-white dark:bg-slate-700 text-gray-900 dark:text-gray-100"
                    {...antiFill}
                  />
                </td>

                {/* Disc% */}
                <td data-label="Disc %" className="border">
                  <input
                    ref={(el) => (itemDiscountRefs.current[i] = el)}
                    type="text"
                    inputMode="decimal"
                    placeholder="0"
                    value={item.item_discount_percentage ?? ""}
                    onChange={(e) =>
                      handleItemChange(i, "item_discount_percentage", e.target.value)
                    }
                    onKeyDown={(e) => handleKeyDown(e, "item_discount", i)}
                    onFocus={(e) => e.target.select()}
                    className="border w-full h-7 text-[11px] px-1.5 text-center bg-white dark:bg-slate-700 text-gray-900 dark:text-gray-100"
                    {...antiFill}
                  />
                </td>

                {/* Pack Bonus */}
                <td data-label="Pack Bonus" className="border">
                  <input
                    ref={(el) => (packBonusRefs.current[i] = el)}
                    type="text"
                    inputMode="decimal"
                    placeholder="0"
                    value={item.pack_bonus === 0 ? "" : item.pack_bonus}
                    onChange={(e) => handleItemChange(i, "pack_bonus", e.target.value)}
                    onKeyDown={(e) => handleKeyDown(e, "pack_bonus", i)}
                    onFocus={(e) => e.target.select()}
                    className="border w-full h-7 text-[11px] px-1.5 text-center bg-white dark:bg-slate-700 text-gray-900 dark:text-gray-100"
                    {...antiFill}
                  />
                </td>

                {/* Unit Bonus */}
                <td data-label="Unit Bonus" className="border">
                  <input
                    type="text"
                    inputMode="decimal"
                    placeholder="0"
                    value={item.unit_bonus === 0 ? "" : item.unit_bonus}
                    onChange={(e) => handleItemChange(i, "unit_bonus", e.target.value)}
                    className="border w-full h-7 text-[11px] px-1.5 text-center bg-white dark:bg-slate-700 text-gray-900 dark:text-gray-100"
                    {...antiFill}
                  />
                </td>

                {/* Pack Sale */}
                <td data-label="Pack Sale" className="border">
                  <input
                    ref={(el) => (packSalePriceRefs.current[i] = el)}
                    type="text"
                    inputMode="decimal"
                    placeholder="0.00"
                    value={item.pack_sale_price === 0 ? "" : item.pack_sale_price}
                    onChange={(e) => handleItemChange(i, "pack_sale_price", e.target.value)}
                    onKeyDown={(e) => handleKeyDown(e, "pack_sale_price", i)}
                    onFocus={(e) => e.target.select()}
                    className="border w-full h-7 text-[11px] px-1.5 text-right font-mono bg-white dark:bg-slate-700 text-gray-900 dark:text-gray-100"
                    {...antiFill}
                  />
                </td>

                {/* Unit Sale */}
                <td data-label="Unit Sale" className="border">
                  <input
                    type="text"
                    inputMode="decimal"
                    placeholder="0.00"
                    value={item.unit_sale_price ?? ""}
                    onChange={(e) => handleItemChange(i, "unit_sale_price", e.target.value)}
                    className="border w-full h-7 text-[11px] px-1.5 text-right font-mono bg-white dark:bg-slate-700 text-gray-900 dark:text-gray-100"
                    {...antiFill}
                  />
                </td>

                {/* Wholesale Pack Sale */}
                <td data-label="W.S. Pack" className={`border ${!hasWholesale ? 'hidden' : ''}`}>
                  <input
                    ref={(el) => (wholeSalePackPriceRefs.current[i] = el)}
                    type="text"
                    inputMode="decimal"
                    placeholder="0.00"
                    value={item.whole_sale_pack_price === 0 ? "" : item.whole_sale_pack_price}
                    onChange={(e) => handleItemChange(i, "whole_sale_pack_price", e.target.value)}
                    onKeyDown={(e) => handleKeyDown(e, "whole_sale_pack_price", i)}
                    onFocus={(e) => e.target.select()}
                    className="border w-full h-7 text-[11px] px-1.5 text-right font-mono bg-white dark:bg-slate-700 text-gray-900 dark:text-gray-100"
                    {...antiFill}
                  />
                </td>

                {/* Wholesale Unit Sale */}
                <td data-label="W.S. Unit" className={`border ${!hasWholesale ? 'hidden' : ''}`}>
                  <input
                    ref={(el) => (wholeSaleUnitPriceRefs.current[i] = el)}
                    type="text"
                    inputMode="decimal"
                    placeholder="0.00"
                    value={item.whole_sale_unit_price ?? ""}
                    onChange={(e) => handleItemChange(i, "whole_sale_unit_price", e.target.value)}
                    onKeyDown={(e) => handleKeyDown(e, "whole_sale_unit_price", i)}
                    onFocus={(e) => e.target.select()}
                    className="border w-full h-7 text-[11px] px-1.5 text-right font-mono bg-white dark:bg-slate-700 text-gray-900 dark:text-gray-100"
                    {...antiFill}
                  />
                </td>

                {/* Margin % (Read-only) */}
                <td data-label="Margin %" className="border">
                  <input
                    type="text"
                    readOnly
                    tabIndex={-1}
                    placeholder="—"
                    value={item.margin ?? ""}
                    className="purchase-readonly-field w-full h-7 text-[11px] px-1.5 text-center font-mono"
                    {...antiFill}
                  />
                </td>

                {/* W.S. Margin % (Read-only) */}
                <td data-label="W.S. Mrg %" className={`border ${!hasWholesale ? 'hidden' : ''}`}>
                  <input
                    type="text"
                    readOnly
                    tabIndex={-1}
                    placeholder="—"
                    value={item.whole_sale_margin ?? ""}
                    className="purchase-readonly-field w-full h-7 text-[11px] px-1.5 text-center font-mono"
                    {...antiFill}
                  />
                </td>

                {/* Avg Price (Read-only) */}
                <td data-label="Avg Cost" className="border">
                  <input
                    type="text"
                    value={item.avg_price ?? ""}
                    readOnly
                    tabIndex={-1}
                    placeholder="—"
                    className="purchase-readonly-field w-full h-7 text-[11px] px-1.5 text-right font-mono"
                    {...antiFill}
                  />
                </td>

                {/* Sub Total (Read-only computed badge) */}
                <td data-label="Sub Total" className="invoice-cell-subtotal border w-20">
                  <input
                    type="text"
                    value={item.sub_total ?? ""}
                    readOnly
                    tabIndex={-1}
                    placeholder="0.00"
                    className="purchase-readonly-field purchase-subtotal-field w-full h-7 text-[11px] px-1.5 text-right font-mono"
                    {...antiFill}
                  />
                </td>

                {/* Quantity (hidden) */}
                <td className="border hidden" style={{ display: "none" }}>
                  <input
                    type="number"
                    readOnly
                    hidden
                    value={item.quantity ?? ""}
                    className="border bg-gray-100 dark:bg-slate-600 w-full h-6 text-[11px] px-1 appearance-none [&::-webkit-outer-spin-button]:appearance-none [&::-webkit-inner-spin-button]:appearance-none text-gray-900 dark:text-gray-100"
                    {...antiFill}
                  />
                </td>

                {/* Add */}
                <td className="invoice-cell-add border w-6">
                  <button
                    type="button"
                    onClick={addItem}
                    className="products-row-action products-row-add"
                    aria-label="Add item"
                    title="Add item"
                  >
                    <PlusCircleIcon aria-hidden="true" className="w-4 h-4" />
                  </button>
                </td>
              </tr>
              </Fragment>
              );
            })}
          </tbody>
        </table>
      </div>

      {/* ================= COMPACT 2-ROW FOOTER SECTION (TITLES NEXT TO FIELDS) ================= */}
      <div className="purchase-entry-footer lg:sticky lg:bottom-0 z-10 border-t shadow-[0_-4px_16px_-6px_rgba(0,0,0,0.18)]" autoComplete="off">
        <div className="px-3 py-1.5 space-y-1">
          {/* ---- Row 1: Adjustments (Disc / Tax) + Computed Totals ---- */}
          <div className="flex flex-wrap items-center justify-between gap-x-4 gap-y-1">
            <div className="flex items-center gap-3 flex-wrap">
              <div className="flex items-center gap-1.5">
                <label className="text-[10px] font-semibold uppercase tracking-wide text-gray-500 dark:text-gray-400 whitespace-nowrap">Disc %</label>
                <input
                  ref={discountPercentageRef}
                  type="text"
                  inputMode="decimal"
                  placeholder="0"
                  name="discount_percentage"
                  value={form.discount_percentage ?? ""}
                  onChange={handleChange}
                  onKeyDown={(e) => {
                    if (e.key === "Enter") {
                      e.preventDefault();
                      taxPercentageRef.current?.focus();
                    }
                  }}
                  className="border border-gray-300 dark:border-slate-600 rounded-md w-14 px-1.5 h-7 text-xs text-right bg-white dark:bg-slate-700 text-gray-900 dark:text-gray-100 focus:outline-hidden focus:ring-1 focus:ring-blue-400/40"
                  {...antiFill}
                />
              </div>
              <div className="flex items-center gap-1.5">
                <label className="text-[10px] font-semibold uppercase tracking-wide text-gray-500 dark:text-gray-400 whitespace-nowrap">Discount</label>
                <input
                  type="text"
                  inputMode="decimal"
                  placeholder="0.00"
                  name="discount_amount"
                  value={form.discount_amount ?? ""}
                  onChange={handleChange}
                  className="border border-gray-300 dark:border-slate-600 rounded-md w-20 px-1.5 h-7 text-xs text-right bg-white dark:bg-slate-700 text-gray-900 dark:text-gray-100 focus:outline-hidden focus:ring-1 focus:ring-blue-400/40"
                  {...antiFill}
                />
              </div>
              <div className="flex items-center gap-1.5">
                <label className="text-[10px] font-semibold uppercase tracking-wide text-gray-500 dark:text-gray-400 whitespace-nowrap">Tax %</label>
                <input
                  ref={taxPercentageRef}
                  type="text"
                  inputMode="decimal"
                  placeholder="0"
                  name="tax_percentage"
                  value={form.tax_percentage ?? ""}
                  onChange={handleChange}
                  onKeyDown={(e) => {
                    if (e.key === "Enter") {
                      e.preventDefault();
                      saveButtonRef.current?.focus();
                    }
                  }}
                  className="border border-gray-300 dark:border-slate-600 rounded-md w-14 px-1.5 h-7 text-xs text-right bg-white dark:bg-slate-700 text-gray-900 dark:text-gray-100 focus:outline-hidden focus:ring-1 focus:ring-blue-400/40"
                  {...antiFill}
                />
              </div>
              <div className="flex items-center gap-1.5">
                <label className="text-[10px] font-semibold uppercase tracking-wide text-gray-500 dark:text-gray-400 whitespace-nowrap">Tax</label>
                <input
                  type="text"
                  inputMode="decimal"
                  placeholder="0.00"
                  name="tax_amount"
                  value={form.tax_amount ?? ""}
                  onChange={handleChange}
                  className="border border-gray-300 dark:border-slate-600 rounded-md w-20 px-1.5 h-7 text-xs text-right bg-white dark:bg-slate-700 text-gray-900 dark:text-gray-100 focus:outline-hidden focus:ring-1 focus:ring-blue-400/40"
                  {...antiFill}
                />
              </div>
            </div>

            <div className="flex items-center gap-3 flex-wrap ml-auto">
              <div className="flex items-center gap-1.5">
                <span className="text-[10px] font-semibold uppercase tracking-wide text-gray-500 dark:text-gray-400 whitespace-nowrap">Items Total</span>
                <div className="purchase-readonly-field h-7 flex items-center px-2 rounded-md text-xs font-medium font-mono text-gray-900 dark:text-gray-100">
                  {to2(form.rows_total || 0).toFixed(2)}
                </div>
              </div>
              {Number(form.discount_amount || 0) > 0 && (
                <div className="flex items-center gap-1.5">
                  <span className="text-[10px] font-semibold uppercase tracking-wide text-gray-500 dark:text-gray-400 whitespace-nowrap">
                    Disc {form.discount_percentage ? `(${to2(form.discount_percentage)}%)` : ""}
                  </span>
                  <div className="purchase-readonly-field h-7 flex items-center px-2 rounded-md text-xs font-medium font-mono !text-red-500 dark:!text-red-400">
                    −{to2(form.discount_amount || 0).toFixed(2)}
                  </div>
                </div>
              )}
              {Number(form.tax_amount || 0) > 0 && (
                <div className="flex items-center gap-1.5">
                  <span className="text-[10px] font-semibold uppercase tracking-wide text-gray-500 dark:text-gray-400 whitespace-nowrap">
                    Tax {form.tax_percentage ? `(${to2(form.tax_percentage)}%)` : ""}
                  </span>
                  <div className="purchase-readonly-field h-7 flex items-center px-2 rounded-md text-xs font-medium font-mono text-gray-900 dark:text-gray-100">
                    +{to2(form.tax_amount || 0).toFixed(2)}
                  </div>
                </div>
              )}
              <div className="flex items-center gap-1.5">
                <span className="text-[10px] font-bold uppercase tracking-wide whitespace-nowrap" style={{ color: themeColors.primary }}>
                  Total Amount
                </span>
                <div
                  className="h-7 flex items-center px-2.5 rounded-md text-xs font-bold font-mono border"
                  style={{
                    background: `${themeColors.primary}14`,
                    color: themeColors.primary,
                    borderColor: `${themeColors.primary}40`,
                  }}
                >
                  {to2(form.total_amount || 0).toFixed(2)}
                </div>
              </div>
            </div>
          </div>

          {/* ---- Row 2: Payment Method & Account + Total Paid + Remaining + Save ---- */}
          <div className="flex flex-wrap items-center justify-between gap-x-4 gap-y-1 pt-0.5 border-t border-gray-100 dark:border-slate-700/60">
            <div className="flex items-center gap-3 flex-wrap">
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
                layout="inline"
                showBalance={true}
              />

              <div className="flex items-center gap-1.5">
                <label className="text-[10px] font-semibold uppercase tracking-wide text-gray-500 dark:text-gray-400 whitespace-nowrap">Total Paid</label>
                <div className="flex items-center gap-1">
                  <input
                    type="text"
                    inputMode="decimal"
                    placeholder="0.00"
                    name="total_paid"
                    value={form.total_paid ?? ""}
                    onChange={(e) => {
                      const v = sanitizeNumberInput(e.target.value, true);
                      setPaidTouched(true);
                      setForm((prev) => ({ ...prev, total_paid: v }));
                    }}
                    onBlur={() => {
                      setForm((prev) => {
                        const normalized = prev.total_paid === "" ? "" : to2(prev.total_paid).toFixed(2);
                        const amt = prev.total_amount === "" || prev.total_amount == null ? "" : to2(prev.total_amount).toFixed(2);
                        if (prev.invoice_type !== "credit" && normalized !== "" && normalized === amt) {
                          setPaidTouched(false);
                        }
                        return { ...prev, total_paid: normalized };
                      });
                    }}
                    className="border border-gray-300 dark:border-slate-600 rounded-md w-24 px-1.5 h-7 text-xs text-right font-mono bg-white dark:bg-slate-700 text-gray-900 dark:text-gray-100 focus:outline-hidden focus:ring-1 focus:ring-blue-400/40"
                    {...antiFill}
                  />
                  <button
                    type="button"
                    title="Relink paid to total"
                    onClick={() => {
                      setPaidTouched(false);
                      setForm((prev) => ({ ...prev, total_paid: prev.total_amount ?? "" }));
                    }}
                    className="h-7 px-1.5 text-[10px] rounded-md transition-all duration-200 shrink-0 flex items-center justify-center"
                    style={{
                      background: isDark ? 'rgba(71, 85, 105, 0.6)' : 'rgba(255, 255, 255, 0.8)',
                      backdropFilter: 'blur(4px)',
                      border: '1px solid rgba(255, 255, 255, 0.2)',
                      color: isDark ? '#94a3b8' : '#64748b'
                    }}
                  >
                    🔗
                  </button>
                </div>
              </div>

              <div className="flex items-center gap-1.5">
                <label className="text-[10px] font-semibold uppercase tracking-wide text-gray-500 dark:text-gray-400 whitespace-nowrap">Remaining</label>
                <div className={`purchase-readonly-field h-7 min-w-[84px] flex items-center justify-end px-2 rounded-md text-xs font-bold font-mono ${
                  (form.total_amount || 0) - (form.total_paid || 0) > 0
                    ? "!text-amber-600 dark:!text-amber-400"
                    : "!text-emerald-600 dark:!text-emerald-400"
                }`}>
                  {to2((form.total_amount || 0) - (form.total_paid || 0)).toFixed(2)}
                </div>
              </div>
            </div>

            <button
              ref={saveButtonRef}
              disabled={saving}
              type="button"
              onClick={handleSubmit}
              className={`h-7 px-5 rounded-md text-xs font-bold tracking-wide transition-all duration-200 shrink-0 ml-auto ${btnPrimary.className}`}
              style={btnPrimary.style}
            >
              {saving ? "Saving…" : invoiceId ? "Update Invoice" : "Save Purchase Invoice"}
            </button>
          </div>
        </div>
      </div>

      {/* Supplier Search Modal */}
      <SupplierSearch
        isOpen={supplierSearchOpen}
        onClose={() => setSupplierSearchOpen(false)}
        onSelect={handleSupplierSelect}
      />

      <Suspense fallback={null}>
        {/* Product Form Modal */}
        {showProductModal && (
          <ProductFormModal
            open={showProductModal}
            onClose={() => setShowProductModal(false)}
            onProductCreated={(newProduct) => {
              // Refresh products list
              fetchProducts();
              // Update local products state
              setProducts(prev => [...(prev || []), newProduct]);
            }}
          />
        )}

        {/* Held Drafts Modal */}
        {isDraftingEnabled && draftHook.isDraftsModalOpen && (
          <InvoiceDraftsModal
            isOpen={draftHook.isDraftsModalOpen}
            onClose={() => draftHook.setIsDraftsModalOpen(false)}
            drafts={draftHook.draftsList}
            activeDraftId={draftHook.activeDraftId}
            onResumeDraft={(id) => draftHook.loadDraft(id)}
            onDiscardDraft={(id) => draftHook.discardDraft(id)}
            onStartBlank={handleStartBlank}
            type="purchase"
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
          />
        )}
      </Suspense>
    </form>
  );
}
