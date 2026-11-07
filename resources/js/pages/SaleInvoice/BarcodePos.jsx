// resources/js/pages/SaleInvoice/BarcodePos.jsx
import React, { Suspense, lazy, useState, useEffect, useRef, useMemo, useCallback } from "react";
import { useNavigate, Link } from "react-router-dom";
import axios from "axios";
import toast from "react-hot-toast";
import Select from "react-select";
import {
  QrCodeIcon,
  MagnifyingGlassIcon,
  TrashIcon,
  PlusIcon,
  MinusIcon,
  CheckCircleIcon,
  SpeakerWaveIcon,
  SpeakerXMarkIcon,
  ArrowPathIcon,
  UserIcon,
  BanknotesIcon,
  CreditCardIcon,
  PrinterIcon,
  DevicePhoneMobileIcon,
  PauseIcon,
  PlayIcon,
  Squares2X2Icon,
  XMarkIcon,
  ShareIcon,
  ArrowsRightLeftIcon,
  ScaleIcon,
} from "@heroicons/react/24/solid";
import { useTheme } from "@/context/ThemeContext";
import { useCurrency } from "@/context/CurrencyContext";
import { usePermissions } from "@/api/usePermissions";
import { posSound, useBarcodeScanner } from "@/utils/posScanner";
import CustomerSearch from "@/components/CustomerSearch";
import ProductSearchInput from "@/components/ProductSearchInput";
import ShareDocumentModal from "@/components/ShareDocumentModal.jsx";
import SubstituteProductsModal from "@/components/SubstituteProductsModal.jsx";
import { printSlipUrl } from "@/utils/printHelper.js";
import {
  GuideBotTopbarButton,
  useGuideBotOpenState,
} from "@/components/GuideBotTrigger.jsx";

const FeatureGuideBot = lazy(() => import("@/components/FeatureGuideBot.jsx"));

export default function BarcodePos() {
  const navigate = useNavigate();
  const { theme, isDark } = useTheme();
  const { formatCurrency, currencySymbol } = useCurrency();
  const { loading: permsLoading, has } = usePermissions();
  const canCreatePosSale = !permsLoading && has("barcode-pos.create");
  const canCreateStandardSale = !permsLoading && has("sale-invoice.create");
  const [guideBotOpen, setGuideBotOpen] = useGuideBotOpenState();

  // Scanner & Audio state
  const [isScannerActive, setIsScannerActive] = useState(true);
  const [isAudioEnabled, setIsAudioEnabled] = useState(true);
  const [manualCode, setManualCode] = useState("");
  const [isSearching, setIsSearching] = useState(false);
  const [lastScanned, setLastScanned] = useState(null); // { name, barcode, price, qty, action: 'added'|'incremented' }
  const [scanPulse, setScanPulse] = useState(false);
  const manualInputRef = useRef(null);
  const productSearchRef = useRef(null);

  // Products for search by name
  const [products, setProducts] = useState([]);

  // Cart & Line Items state
  const [items, setItems] = useState([]);
  const [flashedRowId, setFlashedRowId] = useState(null);
  const [substituteTargetRow, setSubstituteTargetRow] = useState(null);

  // Customer search & selection
  const [selectedCustomerId, setSelectedCustomerId] = useState("");
  const [selectedCustomer, setSelectedCustomer] = useState(null);
  const [customerSearchOpen, setCustomerSearchOpen] = useState(false);

  // Payment method & Accounts state (using react-select)
  const [accounts, setAccounts] = useState([]);
  const [paymentMethod, setPaymentMethod] = useState("cash"); // 'cash' | 'card' | 'mobile_wallet' | 'split'
  const [selectedAccountId, setSelectedAccountId] = useState(null);
  const [paymentRef, setPaymentRef] = useState(""); // Card Slip # or Wallet TID
  const [cashGiven, setCashGiven] = useState("");
  const [discountAmount, setDiscountAmount] = useState(0);
  const [remarks, setRemarks] = useState("");
  const [isSubmitting, setIsSubmitting] = useState(false);

  // Split-Tender & Customer Credit Redemption state
  const [splitCashAmount, setSplitCashAmount] = useState("");
  const [splitCardAmount, setSplitCardAmount] = useState("");
  const [splitSecondaryMethod, setSplitSecondaryMethod] = useState("card"); // 'card' | 'mobile_wallet'
  const [splitSecondaryAccountId, setSplitSecondaryAccountId] = useState(null);
  const [availableCreditTotal, setAvailableCreditTotal] = useState(0);
  const [applyCreditAmount, setApplyCreditAmount] = useState("");

  // Parked Carts state (Multi-customer queueing + server-synced /api/invoice-drafts)
  const [parkedCarts, setParkedCarts] = useState([]);
  const [showParkedModal, setShowParkedModal] = useState(false);
  const [shareQuoteDraftId, setShareQuoteDraftId] = useState(null);

  // Post-checkout success modal
  const [completedSale, setCompletedSale] = useState(null);
  const [shareSaleId, setShareSaleId] = useState(null);

  // Load initial Walk-in customer on mount
  useEffect(() => {
    (async () => {
      try {
        const { data } = await axios.get("/api/customers/search", { params: { limit: 50 } });
        const list = Array.isArray(data) ? data : data.data || [];

        // Auto-select Walk-in customer as default
        const walkIn = list.find((c) => (c.name || "").toUpperCase().includes("WALK-IN"));
        if (walkIn) {
          setSelectedCustomerId(walkIn.id);
          setSelectedCustomer(walkIn);
        } else if (list.length > 0) {
          setSelectedCustomerId(list[0].id);
          setSelectedCustomer(list[0]);
        }
      } catch (_) {}
    })();
  }, []);

  // Fetch accounts on mount
  const fetchAccounts = useCallback(async () => {
    try {
      const res = await axios.get("/api/accounts", { params: { active_only: 1 } });
      const list = res.data?.accounts || [];
      setAccounts(list);
    } catch {
      setAccounts([]);
    }
  }, []);

  useEffect(() => {
    fetchAccounts();
  }, [fetchAccounts]);

  // Load products using dedicated /api/products/search for ProductSearchInput
  const fetchProducts = useCallback(async (q = "") => {
    try {
      const res = await axios.get("/api/products/search", {
        params: { q, limit: 50 },
      });
      const list = Array.isArray(res.data?.data) ? res.data.data : Array.isArray(res.data) ? res.data : [];
      setProducts(list);
      return list;
    } catch {
      return [];
    }
  }, []);

  useEffect(() => {
    fetchProducts();
  }, [fetchProducts]);

  // Sync default account when payment method changes
  useEffect(() => {
    if (accounts.length === 0) return;

    if (paymentMethod === "cash") {
      const cashAcc = accounts.find((a) => a.type === "cash" && a.is_active && a.is_default) ||
                      accounts.find((a) => a.type === "cash" && a.is_active) ||
                      accounts[0];
      if (cashAcc) setSelectedAccountId(cashAcc.id);
    } else if (paymentMethod === "card") {
      const cardAcc = accounts.find((a) => (a.type === "card" || a.type === "bank") && a.is_active && a.is_default) ||
                      accounts.find((a) => (a.type === "card" || a.type === "bank") && a.is_active) ||
                      accounts[0];
      if (cardAcc) setSelectedAccountId(cardAcc.id);
    } else if (paymentMethod === "mobile_wallet") {
      const walletAcc = accounts.find((a) => a.type === "mobile_wallet" && a.is_active && a.is_default) ||
                        accounts.find((a) => a.type === "mobile_wallet" && a.is_active) ||
                        accounts[0];
      if (walletAcc) setSelectedAccountId(walletAcc.id);
    } else if (paymentMethod === "split") {
      const cashAcc = accounts.find((a) => a.type === "cash" && a.is_active && a.is_default) ||
                      accounts.find((a) => a.type === "cash" && a.is_active) ||
                      accounts[0];
      if (cashAcc) setSelectedAccountId(cashAcc.id);
      const secAcc = splitSecondaryMethod === "mobile_wallet"
        ? (accounts.find((a) => a.type === "mobile_wallet" && a.is_active && a.is_default) || accounts.find((a) => a.type === "mobile_wallet" && a.is_active))
        : (accounts.find((a) => (a.type === "card" || a.type === "bank") && a.is_active && a.is_default) || accounts.find((a) => (a.type === "card" || a.type === "bank") && a.is_active));
      if (secAcc) setSplitSecondaryAccountId(secAcc.id);
    }
  }, [paymentMethod, splitSecondaryMethod, accounts]);

  // Fetch available customer unapplied credits / return credit notes when customer changes
  useEffect(() => {
    const isWalkIn = !selectedCustomerId || (selectedCustomer?.name || "").toUpperCase().includes("WALK-IN");
    if (isWalkIn) {
      setAvailableCreditTotal(0);
      setApplyCreditAmount("");
      return;
    }
    (async () => {
      try {
        const { data } = await axios.get("/api/payments/available-credits", {
          params: { party_type: "customer", party_id: selectedCustomerId },
        });
        setAvailableCreditTotal(Number(data?.total_available || 0));
      } catch {
        setAvailableCreditTotal(0);
      }
    })();
  }, [selectedCustomerId, selectedCustomer]);

  // Load server-synced parked carts (/api/invoice-drafts) on mount
  const fetchServerParkedCarts = useCallback(async () => {
    try {
      const { data } = await axios.get("/api/invoice-drafts", { params: { type: "sale_retail" } });
      const list = Array.isArray(data) ? data : data?.data || [];
      const mapped = list
        .filter((d) => Array.isArray(d.payload?.items) && d.payload.items.length > 0)
        .map((d) => ({
          id: `draft_${d.id}`,
          draftId: d.id,
          time: d.updated_at ? new Date(d.updated_at).toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" }) : "Saved",
          customer: d.payload?.customer || { id: d.party_id, name: d.party_name || "Walk-in Customer" },
          customerId: d.party_id || d.payload?.customer_id,
          items: d.payload.items,
          discountAmount: Number(d.payload?.discount_amount || 0),
          totals: {
            totalUnits: d.payload.items.reduce((s, it) => s + (Number(it.quantity) || 0), 0),
            grandTotal: Number(d.total || d.payload?.total || 0),
          },
        }));
      setParkedCarts(mapped);
    } catch {
      // Ignore if offline or unauthorized
    }
  }, []);

  useEffect(() => {
    fetchServerParkedCarts();
  }, [fetchServerParkedCarts]);

  // Selected account object
  const activeAccount = useMemo(() => {
    if (!selectedAccountId) return null;
    return accounts.find((a) => a.id === Number(selectedAccountId)) || null;
  }, [selectedAccountId, accounts]);

  // Matching accounts for current method
  const availableAccountsForMethod = useMemo(() => {
    if (paymentMethod === "card" || (paymentMethod === "split" && splitSecondaryMethod === "card")) {
      return accounts.filter((a) => (a.type === "card" || a.type === "bank") && a.is_active);
    }
    if (paymentMethod === "mobile_wallet" || (paymentMethod === "split" && splitSecondaryMethod === "mobile_wallet")) {
      return accounts.filter((a) => a.type === "mobile_wallet" && a.is_active);
    }
    return accounts.filter((a) => a.type === "cash" && a.is_active);
  }, [paymentMethod, splitSecondaryMethod, accounts]);

  // Sync sound engine enabled state
  useEffect(() => {
    posSound.toggleSound(isAudioEnabled);
  }, [isAudioEnabled]);

  // Compute live footer totals
  const totals = useMemo(() => {
    const gross = items.reduce((sum, it) => sum + (Number(it.quantity) || 0) * (Number(it.price) || 0), 0);
    const itemDiscount = items.reduce((sum, it) => {
      const g = (Number(it.quantity) || 0) * (Number(it.price) || 0);
      return sum + (g * (Number(it.item_discount_percentage) || 0)) / 100;
    }, 0);

    const overallDiscount = Math.min(gross, Number(discountAmount) || 0);
    const grandTotal = Math.max(0, Math.round(gross - itemDiscount - overallDiscount));
    const totalUnits = items.reduce((sum, it) => sum + (Number(it.quantity) || 0), 0);

    const creditApplied = Math.min(grandTotal, availableCreditTotal, Math.max(0, Number(applyCreditAmount) || 0));
    const netPayableAfterCredit = Math.max(0, grandTotal - creditApplied);

    const cashNum = Number(cashGiven) || 0;
    const changeDue = Math.max(0, cashNum - netPayableAfterCredit);

    return {
      gross,
      itemDiscount,
      overallDiscount,
      grandTotal,
      creditApplied,
      netPayableAfterCredit,
      totalUnits,
      totalItems: items.length,
      changeDue,
    };
  }, [items, discountAmount, cashGiven, availableCreditTotal, applyCreditAmount]);

  // Trigger visual scan pulse
  const triggerPulse = (item, action) => {
    setLastScanned({ ...item, action, timestamp: Date.now() });
    setScanPulse(true);
    setTimeout(() => setScanPulse(false), 800);
  };

  // Add or increment item in cart
  const handleProductResolved = useCallback((product, replaceUid = null) => {
    if (!product || !product.id) return;

    const addQty =
      product.is_weight_barcode && Number(product.parsed_quantity) > 0
        ? Number(product.parsed_quantity)
        : 1;

    if ((Number(product.quantity) || 0) <= 0) {
      toast.error(`"${product.name}" has 0 stock — click Substitutes on the row to swap with an in-stock alternative`, {
        duration: 4000,
      });
    }

    setItems((prevItems) => {
      if (!replaceUid) {
        const existingIndex = prevItems.findIndex((it) => it.product_id === product.id);

        if (existingIndex > -1) {
          // Item already in cart -> increment quantity
          const updated = [...prevItems];
          const current = updated[existingIndex];
          const newQty = Math.round(((Number(current.quantity) || 0) + addQty) * 1000) / 1000;
          const subTotal = (Number(current.price) || 0) * newQty * (1 - (Number(current.item_discount_percentage) || 0) / 100);

          updated[existingIndex] = {
            ...current,
            quantity: newQty,
            is_weight_barcode: Boolean(current.is_weight_barcode || product.is_weight_barcode),
            sub_total: Math.round(subTotal * 100) / 100,
          };

          posSound.playIncrement();
          triggerPulse(product, "incremented");
          setFlashedRowId(current.uid);
          setTimeout(() => setFlashedRowId(null), 700);
          return updated;
        }
      }

      // New item -> add to cart (or replace existing row on swap)
      const bestBatch = product.selected_batch || (product.batches && product.batches[0]) || null;
      const baseUnitPrice = Number(product.product_unit_sale_price ?? product.unit_sale_price) || 0;
      const unitPrice =
        bestBatch && Number(bestBatch.unit_sale_price) > 0
          ? Number(bestBatch.unit_sale_price)
          : Number(product.unit_sale_price) || 0;
      const rowUid = replaceUid || `pos_${Date.now()}_${Math.random().toString(36).slice(2, 6)}`;

      const newItem = {
        uid: rowUid,
        product_id: product.id,
        product_name: product.name,
        formulation: product.formulation || "",
        rack: product.rack || "",
        total_stock: Number(product.quantity ?? 0),
        barcode: product.barcode || product.product_code || "",
        product_code: product.product_code || "",
        brand_name: product.brand?.name || "—",
        pack_size: Number(product.pack_size) || 1,
        price: unitPrice,
        product_unit_sale_price: baseUnitPrice,
        quantity: addQty,
        is_weight_barcode: Boolean(product.is_weight_barcode),
        weight_grams: product.weight_grams || null,
        item_discount_percentage: 0,
        sub_total: Math.round(unitPrice * addQty * 100) / 100,
        batch_number: bestBatch ? bestBatch.batch_number : "",
        expiry_date: bestBatch ? bestBatch.expiry_date : "",
        selected_batch_id: bestBatch ? bestBatch.id : null,
        batches: product.batches || [],
        unassigned_quantity: product.unassigned_quantity ?? product.quantity ?? 0,
        is_fefo: bestBatch?.is_fefo ?? false,
      };

      posSound.playSuccess();
      triggerPulse(product, "added");
      setFlashedRowId(rowUid);
      setTimeout(() => setFlashedRowId(null), 700);
      if (replaceUid) {
        return prevItems.map((it) => (it.uid === replaceUid ? newItem : it));
      }
      return [newItem, ...prevItems];
    });
  }, []);

  // Scan handler called by hardware barcode scanner
  const handleBarcodeScan = useCallback(
    async (code) => {
      const cleanCode = (code || "").trim();
      if (!cleanCode) return;

      try {
        setIsSearching(true);
        const { data } = await axios.get("/api/barcodes/scan", {
          params: { barcode: cleanCode },
        });

        if (data.found && data.product) {
          handleProductResolved(data.product);
        } else {
          posSound.playError();
          toast.error(`Barcode not found: ${cleanCode}`);
        }
      } catch (err) {
        posSound.playError();
        const msg = err?.response?.data?.message || `Not found: ${cleanCode}`;
        toast.error(msg);
      } finally {
        setIsSearching(false);
      }
    },
    [handleProductResolved]
  );

  // Product selected by name from ProductSearchInput component
  const handleProductByNameSelect = useCallback(
    async (product) => {
      if (!product || !product.id) return;
      try {
        setIsSearching(true);
        const { data } = await axios.get("/api/barcodes/scan", {
          params: { product_id: product.id },
        });
        if (data.found && data.product) {
          handleProductResolved(data.product);
        } else {
          posSound.playError();
          toast.error(`Stock not found for ${product.name}`);
        }
      } catch (err) {
        posSound.playError();
        const msg = err?.response?.data?.message || `Could not load ${product.name}`;
        toast.error(msg);
      } finally {
        setIsSearching(false);
      }
    },
    [handleProductResolved]
  );

  // Hook into hardware wedge barcode scanner
  useBarcodeScanner({
    onScan: handleBarcodeScan,
    enabled: isScannerActive,
    minChars: 3,
    maxIntervalMs: 45,
  });

  // Manual code input submission
  const handleManualScanSubmit = (e) => {
    e.preventDefault();
    if (!manualCode.trim()) return;
    handleBarcodeScan(manualCode.trim());
    setManualCode("");
  };

  // Cart item modifications
  const handleUpdateQuantity = (uid, newQty) => {
    const qty = Math.max(0.001, Math.round((Number(newQty) || 1) * 1000) / 1000);
    setItems((prev) =>
      prev.map((it) => {
        if (it.uid !== uid) return it;
        const subTotal = (Number(it.price) || 0) * qty * (1 - (Number(it.item_discount_percentage) || 0) / 100);
        return { ...it, quantity: qty, sub_total: Math.round(subTotal * 100) / 100 };
      })
    );
  };

  const handleUpdatePrice = (uid, newPrice) => {
    const price = Math.max(0, Number(newPrice) || 0);
    setItems((prev) =>
      prev.map((it) => {
        if (it.uid !== uid) return it;
        const subTotal = price * (Number(it.quantity) || 1) * (1 - (Number(it.item_discount_percentage) || 0) / 100);
        return { ...it, price, sub_total: Math.round(subTotal * 100) / 100 };
      })
    );
  };

  const handleUpdateItemDiscount = (uid, newDiscPct) => {
    const discPct = Math.min(100, Math.max(0, Number(newDiscPct) || 0));
    setItems((prev) =>
      prev.map((it) => {
        if (it.uid !== uid) return it;
        const subTotal = (Number(it.price) || 0) * (Number(it.quantity) || 1) * (1 - discPct / 100);
        return { ...it, item_discount_percentage: discPct, sub_total: Math.round(subTotal * 100) / 100 };
      })
    );
  };

  const handleRemoveItem = (uid) => {
    setItems((prev) => prev.filter((it) => it.uid !== uid));
    toast("Item removed");
  };

  const handleClearCart = () => {
    if (items.length === 0) return;
    if (window.confirm("Are you sure you want to clear this entire cart?")) {
      setItems([]);
      setCashGiven("");
      setSplitCashAmount("");
      setSplitCardAmount("");
      setApplyCreditAmount("");
      setDiscountAmount(0);
      setRemarks("");
      setLastScanned(null);
      toast("Cart cleared");
    }
  };

  // Batch selection change for a row (react-select)
  const handleBatchChange = (uid, batchId, itemBatches) => {
    setItems((prev) =>
      prev.map((it) => {
        if (it.uid !== uid) return it;
        if (batchId === "unassigned") {
          const basePrice =
            Number(it.product_unit_sale_price) > 0
              ? Number(it.product_unit_sale_price)
              : Number(it.price) || 0;
          const subTotal =
            basePrice * (Number(it.quantity) || 1) * (1 - (Number(it.item_discount_percentage) || 0) / 100);
          return {
            ...it,
            selected_batch_id: null,
            batch_number: "",
            expiry_date: "",
            is_fefo: false,
            price: basePrice,
            sub_total: Math.round(subTotal * 100) / 100,
          };
        }
        const found = itemBatches.find((b) => b.id === Number(batchId));
        const nextPrice =
          found && Number(found.unit_sale_price) > 0
            ? Number(found.unit_sale_price)
            : Number(it.price) || 0;
        const subTotal =
          nextPrice * (Number(it.quantity) || 1) * (1 - (Number(it.item_discount_percentage) || 0) / 100);
        return {
          ...it,
          selected_batch_id: found ? found.id : null,
          batch_number: found ? found.batch_number : "",
          expiry_date: found ? found.expiry_date : "",
          is_fefo: false,
          price: nextPrice,
          sub_total: Math.round(subTotal * 100) / 100,
        };
      })
    );
  };

  // Swap or add a substitute product from SubstituteProductsModal
  const handleSelectSubstitute = useCallback(
    async (subProduct, mode = "swap") => {
      if (!subProduct?.id) return;
      const targetUid = mode === "swap" ? substituteTargetRow?.uid : null;
      setSubstituteTargetRow(null);
      try {
        setIsSearching(true);
        const { data } = await axios.get("/api/barcodes/scan", {
          params: { product_id: subProduct.id },
        });
        if (data.found && data.product) {
          handleProductResolved(data.product, targetUid);
          toast.success(
            mode === "swap"
              ? `Swapped with substitute: ${data.product.name}`
              : `Added substitute: ${data.product.name}`
          );
        }
      } catch {
        toast.error("Failed to load substitute product");
      } finally {
        setIsSearching(false);
      }
    },
    [substituteTargetRow, handleProductResolved]
  );

  // Quick Cash Tender buttons
  const handleQuickCash = (amount) => {
    if (amount === "exact") {
      setCashGiven(String(totals.netPayableAfterCredit));
    } else {
      setCashGiven(String(amount));
    }
  };

  // Park current cart (syncs with /api/invoice-drafts so it persists across refreshes/terminals)
  const handleParkCart = async () => {
    if (items.length === 0) {
      toast.error("Cart is empty");
      return;
    }
    let savedDraftId = null;
    try {
      const { data } = await axios.post("/api/invoice-drafts", {
        type: "sale_retail",
        party_id: selectedCustomerId || null,
        party_name: selectedCustomer?.name || "Walk-in Customer",
        total: totals.grandTotal,
        payload: {
          customer_id: selectedCustomerId,
          customer: selectedCustomer,
          discount_amount: discountAmount,
          gross_amount: totals.gross,
          total: totals.grandTotal,
          items: [...items],
        },
      });
      savedDraftId = data?.id || data?.draft?.id || null;
    } catch {
      // Fallback to local state if draft save fails
    }

    const parkedObj = {
      id: savedDraftId ? `draft_${savedDraftId}` : `park_${Date.now()}`,
      draftId: savedDraftId,
      time: new Date().toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" }),
      customer: selectedCustomer,
      customerId: selectedCustomerId,
      items: [...items],
      discountAmount,
      totals,
    };
    setParkedCarts((prev) => [parkedObj, ...prev]);
    setItems([]);
    setCashGiven("");
    setSplitCashAmount("");
    setSplitCardAmount("");
    setApplyCreditAmount("");
    setDiscountAmount(0);
    setRemarks("");
    setLastScanned(null);
    toast.success("Cart parked & synced to server drafts! Waiting for next customer.");
  };

  // Resume parked cart
  const handleResumeParkedCart = async (parkId) => {
    const found = parkedCarts.find((p) => p.id === parkId);
    if (!found) return;

    if (items.length > 0) {
      if (!window.confirm("Current cart will be replaced by the parked cart. Continue?")) {
        return;
      }
    }

    if (found.draftId) {
      try {
        await axios.delete(`/api/invoice-drafts/${found.draftId}`);
      } catch {}
    }

    setItems(found.items);
    setSelectedCustomer(found.customer);
    setSelectedCustomerId(found.customerId);
    setDiscountAmount(found.discountAmount || 0);
    setParkedCarts((prev) => prev.filter((p) => p.id !== parkId));
    setShowParkedModal(false);
    toast.success("Parked cart restored!");
  };

  // Delete parked cart
  const handleDeleteParkedCart = async (p) => {
    if (p.draftId) {
      try {
        await axios.delete(`/api/invoice-drafts/${p.draftId}`);
      } catch {}
    }
    setParkedCarts((prev) => prev.filter((it) => it.id !== p.id));
  };

  // Direct silent print for POS receipt slip
  const handlePrintPosReceipt = async (invoiceId) => {
    if (!invoiceId) return;
    try {
      const { data } = await axios.get(`/api/sale-invoices/${invoiceId}/print-url`);
      if (data?.url || data?.html) {
        await printSlipUrl(data);
      } else {
        toast.error("Failed to generate receipt print link.");
      }
    } catch (err) {
      toast.error(err?.response?.data?.message || "Failed to print receipt.");
    }
  };

  // Final Checkout & Sale Submission
  const handleCompleteSale = async ({ autoPrint = false } = {}) => {
    if (items.length === 0) {
      toast.error("Cart is empty. Scan products first.");
      posSound.playError();
      return;
    }

    if (!selectedCustomerId) {
      toast.error("Please select a customer");
      return;
    }

    const isWalkIn = /walk[\s\-_]*in/i.test(String(selectedCustomer?.name || ""));
    const creditToApply = totals.creditApplied;
    const netAfterCredit = totals.netPayableAfterCredit;
    const walkInCreditError =
      "Walk-In Customer bills cannot be saved with unpaid credit (Udhar)—select or create a named Customer if the bill is not paid in full.";

    let splitPaymentsPayload = undefined;
    let totalReceive = totals.grandTotal;
    let invoiceType = "debit";

    if (paymentMethod === "split") {
      const cashLeg = Math.max(0, Number(splitCashAmount) || 0);
      const cardLeg = Math.max(0, Number(splitCardAmount) || 0);
      const totalSplitPaid = cashLeg + cardLeg;

      if (totalSplitPaid + creditToApply < totals.grandTotal && isWalkIn) {
        toast.error(walkInCreditError);
        return;
      }

      const cashAcc = accounts.find((a) => a.type === "cash" && a.is_active && a.is_default) ||
                      accounts.find((a) => a.type === "cash" && a.is_active);
      splitPaymentsPayload = [];
      if (cashLeg > 0) {
        splitPaymentsPayload.push({
          payment_method: "cash",
          account_id: cashAcc?.id || selectedAccountId || null,
          amount: cashLeg,
        });
      }
      if (cardLeg > 0) {
        splitPaymentsPayload.push({
          payment_method: splitSecondaryMethod,
          account_id: splitSecondaryAccountId || selectedAccountId || null,
          amount: cardLeg,
        });
      }
      totalReceive = Math.min(netAfterCredit, totalSplitPaid);
      if (totalReceive + creditToApply < totals.grandTotal) {
        invoiceType = "credit";
      }
    } else {
      const hasExplicitCashGiven =
        paymentMethod === "cash" && cashGiven !== "" && cashGiven !== null && cashGiven !== undefined;
      if (hasExplicitCashGiven && Number(cashGiven) < netAfterCredit) {
        if (isWalkIn) {
          toast.error(walkInCreditError);
          return;
        }
        totalReceive = Math.max(0, Number(cashGiven));
        invoiceType = "credit";
      } else {
        totalReceive = netAfterCredit;
      }
    }

    try {
      setIsSubmitting(true);
      const payload = {
        sale_type: "retail",
        invoice_type: invoiceType,
        customer_id: selectedCustomerId,
        date: new Date().toISOString().split("T")[0],
        payment_method: paymentMethod === "split" ? "cash" : paymentMethod,
        account_id: selectedAccountId || undefined,
        split_payments: splitPaymentsPayload,
        apply_credit_amount: creditToApply > 0 ? creditToApply : undefined,
        discount_amount: totals.overallDiscount,
        gross_amount: totals.gross,
        total: totals.grandTotal,
        total_receive: totalReceive,
        cash_given: paymentMethod === "cash" ? (Number(cashGiven) || netAfterCredit) : totalReceive,
        change_due: paymentMethod === "cash" ? totals.changeDue : 0,
        remarks: paymentRef
          ? `[${paymentMethod === "card" ? "CARD" : "WALLET"}: ${paymentRef}] ${remarks || ""}`.trim()
          : (remarks || "High-Speed Barcode POS Checkout"),
        card_number: paymentMethod === "card" ? paymentRef : undefined,
        items: items.map((it) => ({
          product_id: it.product_id,
          quantity: it.quantity,
          price: it.price,
          pack_size: it.pack_size || 1,
          batch_number: it.batch_number || "",
          expiry: it.expiry_date || "",
          item_discount_percentage: it.item_discount_percentage || 0,
          sub_total: it.sub_total,
        })),
      };

      const { data } = await axios.post("/api/sale-invoices", payload);
      const saleId = data?.id;

      posSound.playSuccess();
      toast.success("Sale completed successfully!");

      if (autoPrint && saleId) {
        handlePrintPosReceipt(saleId);
      }

      // Set completed sale modal
      setCompletedSale({
        invoice_id: saleId,
        posted_number: data?.posted_number || `INV-${saleId}`,
        total: totals.grandTotal,
        cash_given: paymentMethod === "cash" ? (Number(cashGiven) || netAfterCredit) : totalReceive + creditToApply,
        change_due: paymentMethod === "cash" ? totals.changeDue : 0,
        payment_method: paymentMethod,
      });

      // Clear current cart
      setItems([]);
      setCashGiven("");
      setSplitCashAmount("");
      setSplitCardAmount("");
      setApplyCreditAmount("");
      setPaymentRef("");
      setDiscountAmount(0);
      setRemarks("");
      setLastScanned(null);
      if (creditToApply > 0) {
        setAvailableCreditTotal((prev) => Math.max(0, prev - creditToApply));
      }
    } catch (err) {
      posSound.playError();
      const msg = err?.response?.data?.message || "Failed to complete sale";
      toast.error(msg);
    } finally {
      setIsSubmitting(false);
    }
  };

  // Hotkey shortcuts listener: F4 / Ctrl+S / Ctrl+Enter / F9 for checkout, Ctrl+C for exact cash, F2 for manual barcode, F3 for product search, F8 / Ctrl+H for park cart
  useEffect(() => {
    const handlePosHotkeys = (e) => {
      const isCtrl = (e.ctrlKey || e.metaKey) && !e.shiftKey && !e.altKey;
      const key = (e.key || "").toLowerCase();

      // Complete Sale: F4, F9, Ctrl+S, or Ctrl+Enter
      if (e.key === "F4" || e.key === "F9" || (isCtrl && (key === "s" || e.key === "Enter"))) {
        e.preventDefault();
        handleCompleteSale();
      }
      // Direct Print Slip (or Complete Sale & Direct Print): Ctrl+P
      if (isCtrl && key === "p") {
        e.preventDefault();
        if (completedSale?.invoice_id) {
          handlePrintPosReceipt(completedSale.invoice_id);
        } else {
          handleCompleteSale({ autoPrint: true });
        }
      }
      // Exact Cash: Ctrl+C (only when no text is selected so native Copy still works)
      if (isCtrl && key === "c") {
        const hasSelection = Boolean(window.getSelection?.()?.toString());
        if (!hasSelection) {
          e.preventDefault();
          handleQuickCash("exact");
        }
      }
      // Focus manual barcode scan: F2
      if (e.key === "F2") {
        e.preventDefault();
        manualInputRef.current?.focus();
      }
      // Open product search component: F3
      if (e.key === "F3") {
        e.preventDefault();
        productSearchRef.current?.openMenu();
      }
      // Park cart: F8 or Ctrl+H
      if (e.key === "F8" || (isCtrl && key === "h")) {
        e.preventDefault();
        handleParkCart();
      }
    };

    window.addEventListener("keydown", handlePosHotkeys);
    return () => window.removeEventListener("keydown", handlePosHotkeys);
  }, [items, selectedCustomerId, paymentMethod, totals, cashGiven, paymentRef, completedSale]);

  // Unified React-Select styles matching day / night theme
  const selectStyles = useMemo(
    () => ({
      control: (base, state) => ({
        ...base,
        minHeight: "30px",
        height: "30px",
        borderRadius: 8,
        backgroundColor: isDark ? "#1e293b" : "#ffffff",
        borderColor: state.isFocused
          ? (theme?.primary_color || "#3b82f6")
          : isDark ? "#475569" : "#cbd5e1",
        boxShadow: state.isFocused ? `0 0 0 1px ${theme?.primary_color || "#3b82f6"}` : "none",
        fontSize: "11px",
        fontWeight: 600,
        color: isDark ? "#f8fafc" : "#1e293b",
        padding: 0,
        cursor: "pointer",
      }),
      valueContainer: (base) => ({ ...base, padding: "0 8px", height: "28px" }),
      input: (base) => ({ ...base, color: isDark ? "#f8fafc" : "#1e293b", margin: 0, padding: 0 }),
      singleValue: (base) => ({ ...base, color: isDark ? "#f8fafc" : "#1e293b", fontSize: "11px" }),
      placeholder: (base) => ({ ...base, color: isDark ? "#94a3b8" : "#94a3b8", fontSize: "11px" }),
      indicatorsContainer: (base) => ({ ...base, height: "28px" }),
      dropdownIndicator: (base) => ({ ...base, padding: "2px 4px" }),
      menuPortal: (base) => ({ ...base, zIndex: 9999 }),
      menu: (base) => ({
        ...base,
        backgroundColor: isDark ? "#1e293b" : "#ffffff",
        border: isDark ? "1px solid #334155" : "1px solid #e2e8f0",
        boxShadow: "0 10px 25px -5px rgba(0, 0, 0, 0.25)",
        borderRadius: 8,
        overflow: "hidden",
        zIndex: 9999,
      }),
      option: (base, state) => ({
        ...base,
        backgroundColor: state.isSelected
          ? (theme?.primary_color || "#3b82f6")
          : state.isFocused
          ? isDark ? "#334155" : "#f1f5f9"
          : "transparent",
        color: state.isSelected ? "#ffffff" : isDark ? "#f8fafc" : "#1e293b",
        fontSize: "11px",
        cursor: "pointer",
        padding: "6px 10px",
      }),
    }),
    [isDark, theme]
  );

  // React Select account options for Card
  const cardAccountOptions = useMemo(() => {
    return availableAccountsForMethod.map((acc) => ({
      value: acc.id,
      label: `${acc.name} — Rs. ${Number(acc.current_balance || 0).toLocaleString()}`,
      data: acc,
    }));
  }, [availableAccountsForMethod]);

  // React Select account options for Mobile Wallet
  const walletAccountOptions = useMemo(() => {
    return availableAccountsForMethod.map((acc) => ({
      value: acc.id,
      label: `${acc.name} — Rs. ${Number(acc.current_balance || 0).toLocaleString()}`,
      data: acc,
    }));
  }, [availableAccountsForMethod]);

  return (
    <div
      className={`min-h-[calc(100dvh-4rem)] lg:h-[calc(100dvh-4rem)] flex flex-col lg:overflow-hidden font-sans select-none transition-colors duration-150 ${
        isDark ? "bg-slate-950 text-slate-100" : "bg-slate-100 text-slate-800"
      }`}
    >
      {/* ======================================================== */}
      {/* TOP POS HEADER BAR                                       */}
      {/* ======================================================== */}
      <header
        className={`px-3 sm:px-4 py-2 flex flex-wrap items-center justify-between gap-2 shrink-0 border-b shadow-xs transition-colors duration-150 ${
          isDark ? "bg-slate-900 border-slate-800" : "bg-white border-slate-200"
        }`}
      >
        <div className="flex items-center gap-3">
          <div className="p-2 rounded-xl bg-gradient-to-tr from-blue-600 to-indigo-600 text-white shadow-md shadow-blue-500/25">
            <QrCodeIcon className="w-5 h-5" />
          </div>
          <div>
            <div className="flex items-center gap-2">
              <h1 className={`text-sm font-black tracking-wider uppercase ${isDark ? "text-white" : "text-slate-900"}`}>
                High-Speed Barcode POS
              </h1>
              <span className="px-2 py-0.5 rounded-full text-[10px] font-bold bg-emerald-500/20 text-emerald-500 dark:text-emerald-400 border border-emerald-500/30 flex items-center gap-1.5 animate-pulse">
                <span className="w-2 h-2 rounded-full bg-emerald-500" />
                Hands-Free Active
              </span>
            </div>
            <p className={`hidden md:block text-[11px] ${isDark ? "text-slate-400" : "text-slate-500"}`}>
              Zero-click hardware barcode scanner active. Swipe items across your scanner beam.
            </p>
          </div>
        </div>

        {/* Center / Right Quick Bar */}
        <div className="flex flex-wrap items-center gap-1.5 sm:gap-2">
          {/* Screen-Aware Bilingual Guide Bot (English & اردو) */}
          <GuideBotTopbarButton
            onClick={() => setGuideBotOpen(true)}
            isOpen={guideBotOpen}
            pageTitle="POS Terminal"
          />

          {/* Parked Carts Button */}
          <button
            type="button"
            onClick={() => setShowParkedModal(true)}
            className={`px-3 py-1.5 rounded-xl border text-xs font-semibold flex items-center gap-2 transition-colors relative ${
              isDark
                ? "border-slate-700 bg-slate-800 hover:bg-slate-700 text-slate-200"
                : "border-slate-300 bg-slate-50 hover:bg-slate-100 text-slate-700"
            }`}
            title="View or resume held carts (F8 to park current)"
          >
            <PauseIcon className="w-4 h-4 text-amber-500" />
            <span>Parked Carts</span>
            {parkedCarts.length > 0 && (
              <span className="px-1.5 py-0.2 rounded-full text-[10px] font-bold bg-amber-500 text-white">
                {parkedCarts.length}
              </span>
            )}
          </button>

          {/* Sound Toggle */}
          <button
            type="button"
            onClick={() => setIsAudioEnabled((prev) => !prev)}
            title={isAudioEnabled ? "Mute scanner sound" : "Enable scanner sound"}
            className={`p-2 rounded-xl border text-xs font-semibold transition-colors ${
              isAudioEnabled
                ? "border-emerald-500/30 bg-emerald-500/10 text-emerald-600 dark:text-emerald-400 hover:bg-emerald-500/20"
                : isDark
                ? "border-slate-700 bg-slate-800 text-slate-400 hover:bg-slate-700"
                : "border-slate-300 bg-slate-50 text-slate-500 hover:bg-slate-100"
            }`}
          >
            {isAudioEnabled ? <SpeakerWaveIcon className="w-4 h-4" /> : <SpeakerXMarkIcon className="w-4 h-4" />}
          </button>

          {/* Switch to Standard Retail Invoice View */}
          {canCreateStandardSale && (
            <Link
              to="/sale-invoices/create/retail"
              className={`px-3 py-1.5 rounded-xl border text-xs font-semibold flex items-center gap-1.5 transition-colors ${
                isDark
                  ? "border-slate-700 bg-slate-800 hover:bg-slate-700 text-slate-200"
                  : "border-slate-300 bg-slate-50 hover:bg-slate-100 text-slate-700"
              }`}
              title="Switch to detailed standard sale invoice form"
            >
              <Squares2X2Icon className="w-4 h-4" />
              <span>Standard Form</span>
            </Link>
          )}
        </div>
      </header>

      {/* ======================================================== */}
      {/* MAIN DUAL-PANE POS WORKSPACE                             */}
      {/* ======================================================== */}
      <div className="flex-1 p-3 grid grid-cols-1 lg:grid-cols-12 gap-3 min-h-0 lg:overflow-hidden">
        {/* ====================================================== */}
        {/* LEFT COLUMN: SCAN HUD & CART ITEMS (8 COLS)           */}
        {/* ====================================================== */}
        <div className="lg:col-span-8 flex flex-col min-h-0 gap-2.5">
          {/* Dual Search & Scan Banner HUD */}
          <div
            className={`p-3 rounded-2xl border transition-all duration-300 flex flex-col sm:flex-row items-center justify-between gap-3 shadow-xs ${
              scanPulse
                ? isDark
                  ? "border-emerald-500 bg-emerald-950/60 shadow-emerald-500/20 ring-2 ring-emerald-500/50"
                  : "border-emerald-500 bg-emerald-50 ring-2 ring-emerald-400"
                : isDark
                ? "border-slate-800 bg-slate-900/90 shadow-md"
                : "border-slate-200 bg-white shadow-xs"
            }`}
          >
            {/* Last Scanned Status Indicator */}
            {lastScanned ? (
              <div className="flex items-center gap-3 min-w-0 flex-1">
                <div
                  className={`p-2.5 rounded-xl shrink-0 ${
                    lastScanned.action === "incremented" ? "bg-amber-500 text-white" : "bg-emerald-500 text-white"
                  }`}
                >
                  <CheckCircleIcon className="w-5 h-5" />
                </div>
                <div className="min-w-0">
                  <div className="flex items-center gap-2 truncate">
                    <span className={`font-bold text-sm truncate ${isDark ? "text-white" : "text-slate-900"}`}>
                      {lastScanned.name}
                    </span>
                    <span
                      className={`px-2 py-0.2 rounded-full text-[10px] font-bold shrink-0 ${
                        lastScanned.action === "incremented"
                          ? "bg-amber-400/20 text-amber-600 dark:text-amber-300"
                          : "bg-emerald-400/20 text-emerald-600 dark:text-emerald-300"
                      }`}
                    >
                      {lastScanned.action === "incremented" ? "Qty +1" : "Added to Cart"}
                    </span>
                  </div>
                  <div className={`text-[11px] flex items-center gap-2 mt-0.5 font-mono ${isDark ? "text-slate-400" : "text-slate-500"}`}>
                    <span>Barcode: {lastScanned.barcode || "N/A"}</span>
                    <span>•</span>
                    <span>Price: Rs. {Number(lastScanned.unit_sale_price || lastScanned.price || 0).toFixed(2)}</span>
                  </div>
                </div>
              </div>
            ) : (
              <div className="flex items-center gap-3 min-w-0 flex-1">
                <div className={`p-2.5 rounded-xl shrink-0 ${isDark ? "bg-slate-800 text-slate-400" : "bg-slate-100 text-slate-500"}`}>
                  <QrCodeIcon className="w-5 h-5 animate-pulse" />
                </div>
                <div>
                  <div className={`font-semibold text-xs ${isDark ? "text-slate-200" : "text-slate-800"}`}>
                    Scanner Ready
                  </div>
                  <div className={`text-[11px] ${isDark ? "text-slate-500" : "text-slate-400"}`}>
                    Aim barcode beam, search by name with ProductSearchInput (F3), or enter SKU (F2).
                  </div>
                </div>
              </div>
            )}

            {/* Product Search & Manual Barcode Input Controls */}
            <div className="flex flex-wrap sm:flex-nowrap items-center gap-2 shrink-0 w-full sm:w-auto">
              {/* ProductSearchInput Component Integration */}
              <div className="w-full sm:w-64" title="Search product by name or SKU using ProductSearchInput (F3)">
                <ProductSearchInput
                  ref={productSearchRef}
                  value={null}
                  onChange={handleProductByNameSelect}
                  products={products}
                  onRefreshProducts={fetchProducts}
                  className={`h-8 text-xs rounded-xl shadow-xs transition-colors ${
                    isDark ? "bg-slate-800 border-slate-700 text-white placeholder-slate-400" : "bg-slate-50 border-slate-300 text-slate-900 placeholder-slate-500"
                  }`}
                />
              </div>

              {/* Manual Barcode / SKU Entry */}
              <form onSubmit={handleManualScanSubmit} className="flex flex-1 sm:flex-initial items-center gap-1.5 shrink-0">
                <div className="relative flex-1 sm:flex-initial">
                  <MagnifyingGlassIcon className={`w-3.5 h-3.5 absolute left-2.5 top-1/2 -translate-y-1/2 ${isDark ? "text-slate-500" : "text-slate-400"}`} />
                  <input
                    ref={manualInputRef}
                    type="text"
                    placeholder="Barcode/SKU (F2)…"
                    value={manualCode}
                    onChange={(e) => setManualCode(e.target.value)}
                    className={`scanner-target w-full sm:w-36 pl-8 pr-2.5 py-1.5 text-xs rounded-xl border focus:outline-hidden focus:ring-2 focus:ring-blue-500 transition-colors ${
                      isDark
                        ? "border-slate-700 bg-slate-800 text-white placeholder-slate-500"
                        : "border-slate-300 bg-slate-50 text-slate-900 placeholder-slate-400"
                    }`}
                  />
                </div>
                <button
                  type="submit"
                  disabled={isSearching || !manualCode.trim()}
                  className="px-3 py-1.5 rounded-xl text-xs font-bold bg-blue-600 hover:bg-blue-500 text-white disabled:opacity-40 transition-colors shadow-xs"
                >
                  {isSearching ? <ArrowPathIcon className="w-4 h-4 animate-spin" /> : "Scan"}
                </button>
              </form>
            </div>
          </div>

          {/* Cart Table Card */}
          <div
            className={`flex-1 min-h-[280px] lg:min-h-0 rounded-2xl border flex flex-col overflow-hidden shadow-xs transition-colors duration-150 ${
              isDark ? "bg-slate-900/90 border-slate-800" : "bg-white border-slate-200"
            }`}
          >
            {/* Cart Header */}
            <div
              className={`px-4 py-2.5 border-b flex items-center justify-between shrink-0 ${
                isDark ? "bg-slate-900 border-slate-800 text-slate-300" : "bg-slate-50/80 border-slate-200 text-slate-700"
              }`}
            >
              <div className="flex items-center gap-2">
                <h3 className="text-xs font-bold uppercase tracking-wider">
                  Cart Items
                </h3>
                <span className="px-2 py-0.5 rounded-full text-[10px] font-bold bg-blue-500/20 text-blue-600 dark:text-blue-400">
                  {items.length} Product{items.length === 1 ? "" : "s"} ({totals.totalUnits} Units)
                </span>
              </div>

              <div className="flex items-center gap-2">
                <button
                  type="button"
                  onClick={handleParkCart}
                  disabled={items.length === 0}
                  className={`px-2.5 py-1 text-xs font-semibold rounded-lg border transition-colors disabled:opacity-40 flex items-center gap-1 ${
                    isDark
                      ? "border-slate-700 bg-slate-800 text-slate-300 hover:bg-slate-700"
                      : "border-slate-300 bg-white text-slate-700 hover:bg-slate-100"
                  }`}
                  title="Park this cart to serve another customer (F8)"
                >
                  <PauseIcon className="w-3.5 h-3.5 text-amber-500" />
                  <span>Park (F8)</span>
                </button>
                <button
                  type="button"
                  onClick={handleClearCart}
                  disabled={items.length === 0}
                  className="px-2.5 py-1 text-xs font-semibold rounded-lg text-rose-500 hover:text-rose-600 hover:bg-rose-500/10 transition-colors disabled:opacity-40 flex items-center gap-1"
                  title="Clear all cart lines"
                >
                  <TrashIcon className="w-3.5 h-3.5" />
                  <span>Clear</span>
                </button>
              </div>
            </div>

            {/* Cart Table Rows */}
            <div className="barcode-pos-items flex-1 overflow-auto min-h-0">
              <table className="invoice-repeater-table w-full text-left text-xs border-collapse">
                <thead
                  className={`sticky top-0 z-10 text-[11px] font-bold uppercase tracking-wider border-b ${
                    isDark
                      ? "bg-slate-800/90 backdrop-blur-xs text-slate-400 border-slate-700"
                      : "bg-slate-100/90 backdrop-blur-xs text-slate-600 border-slate-200"
                  }`}
                >
                  <tr>
                    <th className="py-2.5 px-3 w-8 text-center">#</th>
                    <th className="py-2.5 px-3 min-w-[220px]">Product Name</th>
                    <th className="py-2.5 px-2 w-28">Batch (FEFO)</th>
                    <th className="py-2.5 px-2 w-24 text-center">Quantity</th>
                    <th className="py-2.5 px-2 w-20 text-right">Unit Price</th>
                    <th className="py-2.5 px-2 w-16 text-right">Disc %</th>
                    <th className="py-2.5 px-3 w-24 text-right">Subtotal</th>
                    <th className="py-2.5 px-2 w-10 text-center">Del</th>
                  </tr>
                </thead>
                <tbody className={`divide-y ${isDark ? "divide-slate-800" : "divide-slate-100"}`}>
                  {items.length === 0 ? (
                    <tr className="barcode-pos-empty-row">
                      <td colSpan={8} className="py-16 text-center">
                        <div className="flex flex-col items-center justify-center gap-3">
                          <div className={`p-4 rounded-3xl ${isDark ? "bg-slate-800/60 text-slate-500" : "bg-slate-100 text-slate-400"}`}>
                            <QrCodeIcon className="w-10 h-10" />
                          </div>
                          <div className="space-y-1">
                            <p className={`text-sm font-bold ${isDark ? "text-slate-300" : "text-slate-700"}`}>
                              Cart is completely empty
                            </p>
                            <p className={`text-xs max-w-sm ${isDark ? "text-slate-500" : "text-slate-400"}`}>
                              Point hardware barcode scanner at product labels, or click Search Product to browse by name.
                            </p>
                          </div>
                        </div>
                      </td>
                    </tr>
                  ) : (
                    items.map((it, idx) => {
                      const isFlashed = flashedRowId === it.uid;
                      const batchOptions = [
                        ...(it.batches || []).map((b) => {
                          const mrpPart =
                            Number(b.unit_sale_price) > 0
                              ? ` • MRP: ${Number(b.unit_sale_price).toFixed(2)}`
                              : "";
                          return {
                            value: String(b.id),
                            label: `${b.batch_number} (${b.quantity}u, exp: ${b.expiry_date || "N/A"}${mrpPart})`,
                          };
                        }),
                        ...(it.unassigned_quantity > 0 || !(it.batches && it.batches.length)
                          ? [
                              {
                                value: "unassigned",
                                label: `Unassigned (${it.unassigned_quantity}u)`,
                              },
                            ]
                          : []),
                      ];

                      return (
                        <tr
                          key={it.uid}
                          className={`invoice-repeater-row transition-colors duration-200 ${
                            isFlashed
                              ? isDark
                                ? "bg-emerald-950/40 ring-1 ring-inset ring-emerald-500"
                                : "bg-emerald-50 ring-1 ring-inset ring-emerald-400"
                              : isDark
                              ? "hover:bg-slate-800/40"
                              : "hover:bg-slate-50/80"
                          }`}
                        >
                          <td data-label="Item #" className={`invoice-cell-index py-2 px-3 text-center font-mono ${isDark ? "text-slate-500" : "text-slate-400"}`}>
                            {idx + 1}
                          </td>

                          {/* Product Info */}
                          <td data-label="Product" className="invoice-cell-product py-2 px-3">
                            <div className="flex items-center gap-1.5 flex-wrap">
                              <span className={`font-bold text-xs ${isDark ? "text-white" : "text-slate-900"}`}>
                                {it.product_name}
                              </span>
                              {it.is_fefo && (
                                <span className="px-1.5 py-0.2 rounded text-[9px] font-black bg-blue-500/20 text-blue-600 dark:text-blue-400 tracking-wide uppercase">
                                  FEFO
                                </span>
                              )}
                              {it.is_weight_barcode && (
                                <span className="inline-flex items-center gap-1 px-1.5 py-0.2 rounded text-[9px] font-black bg-amber-500/20 text-amber-600 dark:text-amber-400 tracking-wide">
                                  <ScaleIcon className="w-3 h-3 shrink-0" />
                                  <span>Scale Weight</span>
                                </span>
                              )}
                              <button
                                type="button"
                                onClick={() =>
                                  setSubstituteTargetRow({
                                    uid: it.uid,
                                    id: it.product_id,
                                    name: it.product_name,
                                    formulation: it.formulation,
                                    price: it.price,
                                    quantity: it.total_stock,
                                  })
                                }
                                className={`inline-flex items-center gap-0.5 px-1.5 py-0.5 rounded text-[9px] font-bold transition ${
                                  Number(it.total_stock) <= 0
                                    ? "bg-amber-500 text-white hover:bg-amber-600 animate-pulse"
                                    : "bg-emerald-500/15 text-emerald-600 dark:text-emerald-400 hover:bg-emerald-500/25"
                                }`}
                                title="Find Generic / Salt Substitutes"
                              >
                                <ArrowsRightLeftIcon className="w-2.5 h-2.5" />
                                <span>Substitutes</span>
                              </button>
                            </div>
                            <div className={`text-[10px] font-mono flex items-center gap-1.5 flex-wrap ${isDark ? "text-slate-400" : "text-slate-500"}`}>
                              <span>SKU: {it.product_code || "—"}</span>
                              {it.brand_name && (
                                <>
                                  <span>•</span>
                                  <span>{it.brand_name}</span>
                                </>
                              )}
                              {it.formulation && (
                                <>
                                  <span>•</span>
                                  <span className="text-emerald-600 dark:text-emerald-400 font-sans font-medium">
                                    {it.formulation}
                                  </span>
                                </>
                              )}
                              {it.rack && (
                                <>
                                  <span>•</span>
                                  <span>Rack: {it.rack}</span>
                                </>
                              )}
                              {it.pack_size > 1 && (
                                <>
                                  <span>•</span>
                                  <span>Pack: {it.pack_size}</span>
                                </>
                              )}
                            </div>
                          </td>

                          {/* React Select Batch Picker */}
                          <td data-label="Batch (FEFO)" className="py-2 px-2">
                            <div className="w-full lg:w-28">
                              <Select
                                options={batchOptions}
                                value={
                                  it.selected_batch_id
                                    ? batchOptions.find((o) => o.value === String(it.selected_batch_id))
                                    : batchOptions.find((o) => o.value === "unassigned") || batchOptions[0]
                                }
                                onChange={(opt) => handleBatchChange(it.uid, opt.value, it.batches)}
                                styles={selectStyles}
                                isSearchable={false}
                                menuPortalTarget={document.body}
                              />
                            </div>
                          </td>

                          {/* Quantity Controls */}
                          <td data-label="Quantity" className="py-2 px-3 text-center">
                            <div className="inline-flex items-center rounded-lg border border-slate-300 dark:border-slate-700 overflow-hidden shadow-2xs">
                              <button
                                type="button"
                                onClick={() => handleUpdateQuantity(it.uid, it.quantity - 1)}
                                className={`p-1.5 transition-colors ${
                                  isDark
                                    ? "bg-slate-800 hover:bg-slate-700 text-slate-300"
                                    : "bg-slate-100 hover:bg-slate-200 text-slate-700"
                                }`}
                              >
                                <MinusIcon className="w-3 h-3" />
                              </button>
                              <input
                                type="number"
                                min="1"
                                value={it.quantity}
                                onChange={(e) => handleUpdateQuantity(it.uid, e.target.value)}
                                className={`w-12 text-center text-xs font-bold font-mono py-1 focus:outline-hidden ${
                                  isDark ? "bg-slate-900 text-white" : "bg-white text-slate-900"
                                }`}
                              />
                              <button
                                type="button"
                                onClick={() => handleUpdateQuantity(it.uid, it.quantity + 1)}
                                className={`p-1.5 transition-colors ${
                                  isDark
                                    ? "bg-slate-800 hover:bg-slate-700 text-slate-300"
                                    : "bg-slate-100 hover:bg-slate-200 text-slate-700"
                                }`}
                              >
                                <PlusIcon className="w-3 h-3" />
                              </button>
                            </div>
                          </td>

                          {/* Unit Price (Editable Override) */}
                          <td data-label="Unit Price" className="py-2 px-3 text-right">
                            <input
                              type="number"
                              min="0"
                              step="0.01"
                              value={it.price}
                              onChange={(e) => handleUpdatePrice(it.uid, e.target.value)}
                              className={`w-full lg:w-20 text-right px-1.5 py-1 text-xs font-mono font-bold rounded border focus:outline-hidden ${
                                isDark ? "bg-slate-900 border-slate-700 text-white" : "bg-white border-slate-300 text-slate-900"
                              }`}
                            />
                          </td>

                          {/* Line-Item Discount % */}
                          <td data-label="Disc %" className="py-2 px-3 text-right">
                            <input
                              type="number"
                              min="0"
                              max="100"
                              step="0.5"
                              value={it.item_discount_percentage || ""}
                              placeholder="0"
                              onChange={(e) => handleUpdateItemDiscount(it.uid, e.target.value)}
                              className={`w-full lg:w-16 text-right px-1.5 py-1 text-xs font-mono font-bold rounded border focus:outline-hidden ${
                                isDark ? "bg-slate-900 border-slate-700 text-white" : "bg-white border-slate-300 text-slate-900"
                              }`}
                            />
                          </td>

                          {/* Subtotal */}
                          <td data-label="Sub Total" className="invoice-cell-subtotal py-2 px-3 text-right font-bold font-mono text-emerald-600 dark:text-emerald-400">
                            Rs. {it.sub_total.toFixed(2)}
                          </td>

                          {/* Delete Item */}
                          <td className="invoice-cell-del py-2 px-2 text-center">
                            <button
                              type="button"
                              onClick={() => handleRemoveItem(it.uid)}
                              className="p-1 rounded-md text-rose-500 hover:text-rose-600 hover:bg-rose-500/10 transition-colors"
                              title="Delete row"
                            >
                              <TrashIcon className="w-4 h-4" />
                            </button>
                          </td>
                        </tr>
                      );
                    })
                  )}
                </tbody>
              </table>
            </div>

            {/* Bottom Hotkey Bar in Cart Card */}
            <div
              className={`px-4 py-2 border-t hidden lg:flex items-center justify-between text-[11px] shrink-0 ${
                isDark ? "bg-slate-900 border-slate-800 text-slate-400" : "bg-slate-50 border-slate-200 text-slate-600"
              }`}
            >
              <div className="flex items-center gap-3">
                <span>
                  <kbd className={`px-1.5 py-0.5 rounded border text-[10px] font-mono ${isDark ? "border-slate-700 bg-slate-800 text-slate-300" : "border-slate-300 bg-white text-slate-700"}`}>F2</kbd> Barcode Input
                </span>
                <span>
                  <kbd className={`px-1.5 py-0.5 rounded border text-[10px] font-mono ${isDark ? "border-slate-700 bg-slate-800 text-slate-300" : "border-slate-300 bg-white text-slate-700"}`}>F3</kbd> Product Search
                </span>
                <span>
                  <kbd className={`px-1.5 py-0.5 rounded border text-[10px] font-mono ${isDark ? "border-slate-700 bg-slate-800 text-slate-300" : "border-slate-300 bg-white text-slate-700"}`}>F4</kbd> Complete Sale
                </span>
                <span>
                  <kbd className={`px-1.5 py-0.5 rounded border text-[10px] font-mono ${isDark ? "border-slate-700 bg-slate-800 text-slate-300" : "border-slate-300 bg-white text-slate-700"}`}>F8</kbd> Park Cart
                </span>
              </div>
              <div className="font-semibold">
                Auto-Accumulating Quantities Enabled
              </div>
            </div>
          </div>
        </div>

        {/* ====================================================== */}
        {/* RIGHT COLUMN: TOTALS, CUSTOMER & TENDER (4 COLS)       */}
        {/* ====================================================== */}
        <div id="pos-tender-panel" className="lg:col-span-4 flex flex-col min-h-0">
          <div
            className={`flex-1 rounded-2xl border p-4 flex flex-col justify-between overflow-y-auto shadow-xs transition-colors duration-150 ${
              isDark ? "bg-slate-900/90 border-slate-800" : "bg-white border-slate-200"
            }`}
          >
            <div className="space-y-3.5">
              {/* Customer Selector Using CustomerSearch Component */}
              <div className="space-y-1">
                <div className="flex items-center justify-between">
                  <label className={`text-[10px] font-bold uppercase tracking-wider ${isDark ? "text-slate-400" : "text-slate-500"}`}>
                    Customer * (Walk-in Default)
                  </label>
                  <button
                    type="button"
                    onClick={() => setCustomerSearchOpen(true)}
                    className="text-[10px] text-blue-500 dark:text-blue-400 hover:underline font-bold"
                  >
                    Search Directory (Click)
                  </button>
                </div>
                <button
                  type="button"
                  onClick={() => setCustomerSearchOpen(true)}
                  className={`w-full h-8 px-2.5 rounded-xl border text-left text-xs flex items-center justify-between transition-all cursor-pointer ${
                    selectedCustomer
                      ? isDark
                        ? "border-blue-500/50 bg-blue-900/20 text-blue-200"
                        : "border-blue-400 bg-blue-50 text-blue-800"
                      : isDark
                      ? "border-slate-700 bg-slate-800 text-slate-300 hover:border-slate-600"
                      : "border-slate-300 bg-slate-50 text-slate-700 hover:border-slate-400"
                  }`}
                  title={selectedCustomer?.name || "Click to search customer"}
                >
                  <span className="truncate font-bold flex items-center gap-2">
                    <UserIcon className="w-3.5 h-3.5 text-blue-500 shrink-0" />
                    <span className="truncate">{selectedCustomer ? selectedCustomer.name : "Walk-in Customer"}</span>
                  </span>
                  <span className={`text-[10px] shrink-0 font-mono ${isDark ? "text-slate-400" : "text-slate-500"}`}>
                    {selectedCustomer?.phone || "Retail"}
                  </span>
                </button>
              </div>

              {/* Giant Numeric Total Display */}
              <div
                className={`p-4 rounded-2xl border bg-gradient-to-br transition-all duration-150 ${
                  isDark
                    ? "from-blue-950/60 via-indigo-950/40 to-slate-900 border-blue-900/50"
                    : "from-blue-50 via-indigo-50/50 to-white border-blue-200"
                }`}
              >
                <div className="flex items-center justify-between mb-1">
                  <span className={`text-xs font-bold uppercase tracking-wider ${isDark ? "text-blue-300" : "text-blue-700"}`}>
                    Total Payable
                  </span>
                  <span className="px-2 py-0.5 rounded-full text-[10px] font-black bg-blue-500 text-white">
                    {totals.totalItems} Items
                  </span>
                </div>
                <div className="text-3xl sm:text-4xl font-black font-mono tracking-tight text-blue-600 dark:text-blue-400">
                  Rs. {totals.grandTotal.toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
                </div>

                {/* Sub-breakdown: Gross & Discounts */}
                <div className={`mt-3 pt-2.5 border-t border-dashed space-y-1 text-xs ${isDark ? "border-slate-700/80" : "border-slate-200"}`}>
                  <div className={`flex justify-between ${isDark ? "text-slate-400" : "text-slate-600"}`}>
                    <span>Gross Amount:</span>
                    <span className={`font-mono font-bold ${isDark ? "text-slate-200" : "text-slate-800"}`}>
                      Rs. {totals.gross.toFixed(2)}
                    </span>
                  </div>
                  {totals.itemDiscount > 0 && (
                    <div className="flex justify-between text-rose-500 font-semibold">
                      <span>Item Discounts:</span>
                      <span className="font-mono">- Rs. {totals.itemDiscount.toFixed(2)}</span>
                    </div>
                  )}
                  <div className={`flex items-center justify-between ${isDark ? "text-slate-400" : "text-slate-600"}`}>
                    <span>Extra Bill Discount:</span>
                    <div className="flex items-center gap-1">
                      <span className="text-[10px]">Rs.</span>
                      <input
                        type="number"
                        min="0"
                        value={discountAmount || ""}
                        onChange={(e) => setDiscountAmount(Number(e.target.value) || 0)}
                        placeholder="0"
                        className={`w-16 text-right px-1.5 py-0.5 text-xs font-mono font-bold rounded border focus:outline-hidden ${
                          isDark ? "bg-slate-800 border-slate-700 text-white" : "bg-slate-50 border-slate-300 text-slate-900"
                        }`}
                      />
                    </div>
                  </div>
                  {availableCreditTotal > 0 && (
                    <div className="flex items-center justify-between text-emerald-600 dark:text-emerald-400 pt-1">
                      <span className="font-semibold">
                        Redeem Credit (Avail: Rs. {availableCreditTotal.toFixed(0)}):
                      </span>
                      <div className="flex items-center gap-1">
                        <button
                          type="button"
                          onClick={() => setApplyCreditAmount(String(Math.min(availableCreditTotal, totals.grandTotal)))}
                          className="text-[9px] px-1.5 py-0.5 rounded bg-emerald-500/20 font-bold hover:bg-emerald-500/30"
                        >
                          Max
                        </button>
                        <input
                          type="number"
                          min="0"
                          max={Math.min(availableCreditTotal, totals.grandTotal)}
                          value={applyCreditAmount}
                          onChange={(e) => setApplyCreditAmount(e.target.value)}
                          placeholder="0"
                          className={`w-16 text-right px-1.5 py-0.5 text-xs font-mono font-bold rounded border focus:outline-hidden ${
                            isDark ? "bg-slate-800 border-emerald-700 text-emerald-300" : "bg-emerald-50 border-emerald-300 text-emerald-900"
                          }`}
                        />
                      </div>
                    </div>
                  )}
                  {totals.creditApplied > 0 && (
                    <div className="flex justify-between font-bold text-blue-600 dark:text-blue-300 pt-1 border-t border-dashed border-slate-300 dark:border-slate-700">
                      <span>Net Payable After Credit:</span>
                      <span className="font-mono">Rs. {totals.netPayableAfterCredit.toFixed(2)}</span>
                    </div>
                  )}
                </div>
              </div>

              {/* Payment Method Selector */}
              <div className="space-y-1.5">
                <label className={`text-[10px] font-bold uppercase tracking-wider ${isDark ? "text-slate-400" : "text-slate-500"}`}>
                  Payment Method
                </label>
                <div className="grid grid-cols-4 gap-1.5">
                  {[
                    { id: "cash", label: "Cash", icon: BanknotesIcon },
                    { id: "card", label: "Card / POS", icon: CreditCardIcon },
                    { id: "mobile_wallet", label: "Wallet", icon: DevicePhoneMobileIcon },
                    { id: "split", label: "Split / Credit", icon: Squares2X2Icon },
                  ].map((m) => {
                    const Icon = m.icon;
                    const isSelected = paymentMethod === m.id;
                    return (
                      <button
                        key={m.id}
                        type="button"
                        onClick={() => setPaymentMethod(m.id)}
                        className={`p-2 rounded-xl text-xs font-bold flex flex-col items-center gap-1 transition-all ${
                          isSelected
                            ? "bg-blue-600 text-white shadow-md shadow-blue-500/25 ring-2 ring-blue-400/40"
                            : isDark
                            ? "bg-slate-800 text-slate-400 hover:bg-slate-700 hover:text-white"
                            : "bg-slate-100 text-slate-600 hover:bg-slate-200 hover:text-slate-900"
                        }`}
                      >
                        <Icon className="w-4 h-4" />
                        <span>{m.label}</span>
                      </button>
                    );
                  })}
                </div>
              </div>

              {/* CASH PAYMENT SECTION */}
              {paymentMethod === "cash" && (
                <div className="space-y-2.5 animate-in fade-in duration-150">
                  <div className="space-y-1">
                    <div className="flex items-center justify-between text-xs">
                      <label className={`text-[10px] font-bold uppercase tracking-wider ${isDark ? "text-slate-400" : "text-slate-500"}`}>
                        Cash Given by Customer
                      </label>
                      <button
                        type="button"
                        onClick={() => handleQuickCash("exact")}
                        className="text-[10px] text-blue-500 dark:text-blue-400 hover:underline font-bold"
                      >
                        Exact Total (Ctrl+C)
                      </button>
                    </div>

                    <div className="relative">
                      <span className={`absolute left-3 top-1/2 -translate-y-1/2 text-sm font-bold ${isDark ? "text-slate-400" : "text-slate-500"}`}>
                        Rs.
                      </span>
                      <input
                        type="number"
                        placeholder="0.00"
                        value={cashGiven}
                        onChange={(e) => setCashGiven(e.target.value)}
                        className={`w-full pl-10 pr-3 py-2 text-lg font-black font-mono rounded-xl border focus:outline-hidden focus:ring-2 focus:ring-blue-500 ${
                          isDark
                            ? "border-slate-700 bg-slate-800 text-white placeholder-slate-500"
                            : "border-slate-300 bg-slate-50 text-slate-900 placeholder-slate-400"
                        }`}
                      />
                    </div>
                  </div>

                  {/* Quick Cash Currency Buttons */}
                  <div className="grid grid-cols-4 gap-1.5 text-xs">
                    {[500, 1000, 2000, 5000].map((amt) => (
                      <button
                        key={amt}
                        type="button"
                        onClick={() => handleQuickCash(amt)}
                        className={`py-1.5 rounded-lg border font-bold font-mono transition-colors ${
                          isDark
                            ? "border-slate-700 bg-slate-800 hover:bg-slate-700 text-slate-200"
                            : "border-slate-200 bg-slate-100 hover:bg-slate-200 text-slate-800"
                        }`}
                      >
                        {amt}
                      </button>
                    ))}
                  </div>

                  {/* Change Due Box */}
                  <div
                    className={`p-3 rounded-xl border flex items-center justify-between transition-colors ${
                      totals.changeDue > 0
                        ? isDark
                          ? "border-emerald-500/40 bg-emerald-950/40 text-emerald-300"
                          : "border-emerald-300 bg-emerald-50 text-emerald-800"
                        : isDark
                        ? "border-slate-800 bg-slate-800/40 text-slate-400"
                        : "border-slate-200 bg-slate-50 text-slate-500"
                    }`}
                  >
                    <span className="text-xs font-bold uppercase tracking-wider">Change Due:</span>
                    <span className="text-xl font-black font-mono">
                      Rs. {totals.changeDue.toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
                    </span>
                  </div>
                </div>
              )}

              {/* CARD / POS PAYMENT SECTION (REACT SELECT) */}
              {paymentMethod === "card" && (
                <div className="space-y-2.5 animate-in fade-in duration-150">
                  {/* React Select Account Selector */}
                  <div className="space-y-1">
                    <label className={`text-[10px] font-bold uppercase tracking-wider ${isDark ? "text-slate-400" : "text-slate-500"}`}>
                      Card POS Terminal / Bank Account
                    </label>
                    <Select
                      options={cardAccountOptions}
                      value={cardAccountOptions.find((o) => o.value === selectedAccountId) || cardAccountOptions[0] || null}
                      onChange={(opt) => setSelectedAccountId(opt ? opt.value : null)}
                      styles={selectStyles}
                      isSearchable={false}
                      placeholder="Select Card Account…"
                      menuPortalTarget={document.body}
                    />
                  </div>

                  {/* Live Account Balance Indicator */}
                  {activeAccount && (
                    <div
                      className={`px-3 py-1.5 rounded-xl border text-xs flex items-center justify-between ${
                        isDark ? "bg-slate-800/60 border-slate-700/80" : "bg-blue-50/60 border-blue-100"
                      }`}
                    >
                      <span className={`text-[11px] font-medium ${isDark ? "text-slate-400" : "text-slate-600"}`}>
                        Account Balance:
                      </span>
                      <span className="font-black font-mono text-emerald-600 dark:text-emerald-400">
                        Rs. {Number(activeAccount.current_balance || 0).toLocaleString()}
                      </span>
                    </div>
                  )}

                  {/* Card Slip Ref / TID */}
                  <div className="space-y-1">
                    <label className={`text-[10px] font-bold uppercase tracking-wider ${isDark ? "text-slate-400" : "text-slate-500"}`}>
                      Slip # / Auth Code / Last 4 Digits
                    </label>
                    <input
                      type="text"
                      placeholder="e.g. SLIP-8842 or 4242"
                      value={paymentRef}
                      onChange={(e) => setPaymentRef(e.target.value)}
                      className={`w-full px-3 py-1.5 text-xs font-mono rounded-xl border focus:outline-hidden focus:ring-2 focus:ring-blue-500 ${
                        isDark ? "bg-slate-800 border-slate-700 text-white" : "bg-slate-50 border-slate-300 text-slate-900"
                      }`}
                    />
                  </div>

                  {/* Total to be Charged */}
                  <div
                    className={`p-2.5 rounded-xl border flex items-center justify-between ${
                      isDark ? "bg-blue-950/30 border-blue-800/40 text-blue-300" : "bg-blue-50 border-blue-200 text-blue-800"
                    }`}
                  >
                    <span className="text-[11px] font-bold">Charge to Card Terminal:</span>
                    <span className="text-base font-black font-mono">
                      Rs. {totals.grandTotal.toFixed(2)}
                    </span>
                  </div>
                </div>
              )}

              {/* MOBILE WALLET PAYMENT SECTION (REACT SELECT) */}
              {paymentMethod === "mobile_wallet" && (
                <div className="space-y-2.5 animate-in fade-in duration-150">
                  {/* React Select Account Selector */}
                  <div className="space-y-1">
                    <label className={`text-[10px] font-bold uppercase tracking-wider ${isDark ? "text-slate-400" : "text-slate-500"}`}>
                      Mobile Wallet Account (EasyPaisa / JazzCash)
                    </label>
                    <Select
                      options={walletAccountOptions}
                      value={walletAccountOptions.find((o) => o.value === selectedAccountId) || walletAccountOptions[0] || null}
                      onChange={(opt) => setSelectedAccountId(opt ? opt.value : null)}
                      styles={selectStyles}
                      isSearchable={false}
                      placeholder="Select Wallet Account…"
                      menuPortalTarget={document.body}
                    />
                  </div>

                  {/* Live Account Balance Indicator */}
                  {activeAccount && (
                    <div
                      className={`px-3 py-1.5 rounded-xl border text-xs flex items-center justify-between ${
                        isDark ? "bg-slate-800/60 border-slate-700/80" : "bg-blue-50/60 border-blue-100"
                      }`}
                    >
                      <span className={`text-[11px] font-medium ${isDark ? "text-slate-400" : "text-slate-600"}`}>
                        Wallet Balance:
                      </span>
                      <span className="font-black font-mono text-emerald-600 dark:text-emerald-400">
                        Rs. {Number(activeAccount.current_balance || 0).toLocaleString()}
                      </span>
                    </div>
                  )}

                  {/* TID / Sender Phone */}
                  <div className="space-y-1">
                    <label className={`text-[10px] font-bold uppercase tracking-wider ${isDark ? "text-slate-400" : "text-slate-500"}`}>
                      Transaction ID (TID) / Customer Mobile #
                    </label>
                    <input
                      type="text"
                      placeholder="e.g. TID-982348 or 0300-1234567"
                      value={paymentRef}
                      onChange={(e) => setPaymentRef(e.target.value)}
                      className={`w-full px-3 py-1.5 text-xs font-mono rounded-xl border focus:outline-hidden focus:ring-2 focus:ring-blue-500 ${
                        isDark ? "bg-slate-800 border-slate-700 text-white" : "bg-slate-50 border-slate-300 text-slate-900"
                      }`}
                    />
                  </div>

                  {/* Total to be Charged */}
                  <div
                    className={`p-2.5 rounded-xl border flex items-center justify-between ${
                      isDark ? "bg-emerald-950/30 border-emerald-800/40 text-emerald-300" : "bg-emerald-50 border-emerald-200 text-emerald-800"
                    }`}
                  >
                    <span className="text-[11px] font-bold">Transfer to Wallet:</span>
                    <span className="text-base font-black font-mono">
                      Rs. {totals.netPayableAfterCredit.toFixed(2)}
                    </span>
                  </div>
                </div>
              )}

              {/* SPLIT-TENDER / MULTI-PAYMENT & PARTIAL CREDIT SECTION */}
              {paymentMethod === "split" && (
                <div className="space-y-2.5 animate-in fade-in duration-150">
                  <div className="grid grid-cols-2 gap-2">
                    <div className="space-y-1">
                      <label className={`text-[10px] font-bold uppercase tracking-wider ${isDark ? "text-slate-400" : "text-slate-500"}`}>
                        Cash Portion (Rs.)
                      </label>
                      <input
                        type="number"
                        min="0"
                        placeholder="0.00"
                        value={splitCashAmount}
                        onChange={(e) => {
                          const v = e.target.value;
                          setSplitCashAmount(v);
                          const rem = Math.max(0, totals.netPayableAfterCredit - (Number(v) || 0));
                          setSplitCardAmount(rem > 0 ? String(rem) : "");
                        }}
                        className={`w-full px-2.5 py-1.5 text-xs font-mono font-bold rounded-xl border focus:outline-hidden ${
                          isDark ? "bg-slate-800 border-slate-700 text-white" : "bg-slate-50 border-slate-300 text-slate-900"
                        }`}
                      />
                    </div>
                    <div className="space-y-1">
                      <div className="flex items-center justify-between">
                        <label className={`text-[10px] font-bold uppercase tracking-wider ${isDark ? "text-slate-400" : "text-slate-500"}`}>
                          {splitSecondaryMethod === "card" ? "Card / Bank" : "Wallet"} (Rs.)
                        </label>
                        <button
                          type="button"
                          onClick={() => setSplitSecondaryMethod((m) => (m === "card" ? "mobile_wallet" : "card"))}
                          className="text-[9px] text-blue-500 hover:underline font-bold"
                        >
                          Switch to {splitSecondaryMethod === "card" ? "Wallet" : "Card"}
                        </button>
                      </div>
                      <input
                        type="number"
                        min="0"
                        placeholder="0.00"
                        value={splitCardAmount}
                        onChange={(e) => setSplitCardAmount(e.target.value)}
                        className={`w-full px-2.5 py-1.5 text-xs font-mono font-bold rounded-xl border focus:outline-hidden ${
                          isDark ? "bg-slate-800 border-slate-700 text-white" : "bg-slate-50 border-slate-300 text-slate-900"
                        }`}
                      />
                    </div>
                  </div>

                  {/* Secondary Account Selector */}
                  <div className="space-y-1">
                    <label className={`text-[10px] font-bold uppercase tracking-wider ${isDark ? "text-slate-400" : "text-slate-500"}`}>
                      {splitSecondaryMethod === "card" ? "Card / Bank Account" : "Mobile Wallet Account"}
                    </label>
                    <Select
                      options={cardAccountOptions}
                      value={cardAccountOptions.find((o) => o.value === splitSecondaryAccountId) || cardAccountOptions[0] || null}
                      onChange={(opt) => setSplitSecondaryAccountId(opt ? opt.value : null)}
                      styles={selectStyles}
                      isSearchable={false}
                      placeholder="Select Account…"
                      menuPortalTarget={document.body}
                    />
                  </div>

                  {/* Remaining Balance on Customer Credit */}
                  {(() => {
                    const paid = (Number(splitCashAmount) || 0) + (Number(splitCardAmount) || 0);
                    const unpaidCredit = Math.max(0, totals.netPayableAfterCredit - paid);
                    return (
                      <div
                        className={`p-2.5 rounded-xl border flex items-center justify-between text-xs ${
                          unpaidCredit > 0
                            ? isDark
                              ? "bg-amber-950/30 border-amber-800/40 text-amber-300"
                              : "bg-amber-50 border-amber-200 text-amber-800"
                            : isDark
                            ? "bg-emerald-950/30 border-emerald-800/40 text-emerald-300"
                            : "bg-emerald-50 border-emerald-200 text-emerald-800"
                        }`}
                      >
                        <span className="font-bold">
                          {unpaidCredit > 0 ? "Remaining on Customer Credit:" : "Split Tender Balanced:"}
                        </span>
                        <span className="font-black font-mono">
                          Rs. {unpaidCredit > 0 ? unpaidCredit.toFixed(2) : paid.toFixed(2)}
                        </span>
                      </div>
                    );
                  })()}
                </div>
              )}
            </div>

            {/* Complete Sale Action Button */}
            <div className={`space-y-2 pt-3 border-t mt-3 ${isDark ? "border-slate-800" : "border-slate-200"}`}>
              <button
                type="button"
                onClick={handleCompleteSale}
                disabled={!canCreatePosSale || isSubmitting || items.length === 0}
                className="w-full py-3.5 px-4 rounded-xl font-black text-sm text-white bg-gradient-to-r from-emerald-600 via-teal-600 to-emerald-600 hover:from-emerald-500 hover:to-teal-500 shadow-lg shadow-emerald-600/25 transition-all duration-150 flex items-center justify-center gap-2 disabled:opacity-40 cursor-pointer active:scale-[0.99]"
              >
                {isSubmitting ? (
                  <>
                    <ArrowPathIcon className="w-5 h-5 animate-spin" />
                    <span>Processing Sale…</span>
                  </>
                ) : (
                  <>
                    <CheckCircleIcon className="w-5 h-5" />
                    <span>Complete Sale (Ctrl+S / F4)</span>
                  </>
                )}
              </button>
            </div>
          </div>
        </div>
      </div>

      {/* ======================================================== */}
      {/* MOBILE STICKY BOTTOM SUMMARY & CHECKOUT BAR              */}
      {/* ======================================================== */}
      <div
        className={`lg:hidden sticky bottom-0 z-30 px-3 py-2.5 border-t flex items-center justify-between gap-2 shadow-lg ${
          isDark ? "bg-slate-900/95 border-slate-800 text-white backdrop-blur-md" : "bg-white/95 border-slate-200 text-slate-900 backdrop-blur-md"
        }`}
      >
        <div className="flex items-center gap-3 min-w-0">
          <div className="text-xs">
            <span className={`block text-[10px] font-bold uppercase ${isDark ? "text-slate-400" : "text-slate-500"}`}>
              Items
            </span>
            <span className="font-black font-mono">
              {totals.totalItems} ({totals.totalUnits}u)
            </span>
          </div>
          <div className={`h-6 w-px ${isDark ? "bg-slate-800" : "bg-slate-200"}`} />
          <div className="min-w-0">
            <span className={`block text-[10px] font-bold uppercase ${isDark ? "text-slate-400" : "text-slate-500"}`}>
              Net Total
            </span>
            <span className="text-sm font-black font-mono text-blue-600 dark:text-blue-400 truncate block">
              Rs. {totals.netPayableAfterCredit.toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
            </span>
          </div>
        </div>
        <div className="flex items-center gap-1.5 shrink-0">
          <button
            type="button"
            onClick={() => document.getElementById("pos-tender-panel")?.scrollIntoView({ behavior: "smooth" })}
            className={`px-3 py-2 rounded-xl border text-xs font-bold transition-colors ${
              isDark
                ? "border-slate-700 bg-slate-800 text-slate-200 hover:bg-slate-700"
                : "border-slate-300 bg-slate-100 text-slate-700 hover:bg-slate-200"
            }`}
          >
            Tender
          </button>
          <button
            type="button"
            onClick={handleCompleteSale}
            disabled={!canCreatePosSale || isSubmitting || items.length === 0}
            className="px-3.5 py-2 rounded-xl text-xs font-black text-white bg-gradient-to-r from-emerald-600 to-teal-600 shadow-sm disabled:opacity-40 flex items-center gap-1"
          >
            <CheckCircleIcon className="w-4 h-4" />
            <span>Complete Sale</span>
          </button>
        </div>
      </div>

      {/* ======================================================== */}
      {/* COMPLETED SALE SUMMARY MODAL (RECEIPT PROMPT)             */}
      {/* ======================================================== */}
      {completedSale && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/70 backdrop-blur-xs p-4 animate-in fade-in duration-150">
          <div
            className={`rounded-3xl p-6 max-w-md w-full shadow-2xl space-y-5 text-center border ${
              isDark ? "bg-slate-900 border-slate-700 text-white" : "bg-white border-slate-200 text-slate-900"
            }`}
          >
            <div className="w-16 h-16 rounded-full bg-emerald-500/20 text-emerald-500 mx-auto flex items-center justify-center ring-8 ring-emerald-500/10">
              <CheckCircleIcon className="w-10 h-10" />
            </div>

            <div className="space-y-1">
              <h3 className="text-lg font-black">Sale Successfully Completed!</h3>
              <p className={`text-xs font-mono ${isDark ? "text-slate-400" : "text-slate-500"}`}>
                Invoice Reference: {completedSale.posted_number}
              </p>
            </div>

            {/* Total & Change Breakdown */}
            <div
              className={`p-4 rounded-2xl border space-y-2 text-left ${
                isDark ? "bg-slate-800/80 border-slate-700" : "bg-slate-50 border-slate-200"
              }`}
            >
              <div className={`flex justify-between text-xs ${isDark ? "text-slate-400" : "text-slate-500"}`}>
                <span>Invoice Total:</span>
                <span className={`font-bold font-mono ${isDark ? "text-white" : "text-slate-900"}`}>
                  Rs. {completedSale.total.toFixed(2)}
                </span>
              </div>
              <div className={`flex justify-between text-xs ${isDark ? "text-slate-400" : "text-slate-500"}`}>
                <span>Tendered / Received:</span>
                <span className={`font-bold font-mono ${isDark ? "text-white" : "text-slate-900"}`}>
                  Rs. {completedSale.cash_given.toFixed(2)}
                </span>
              </div>
              {completedSale.payment_method === "cash" && (
                <div className={`pt-2 border-t flex justify-between items-baseline ${isDark ? "border-slate-700" : "border-slate-200"}`}>
                  <span className="text-xs font-bold text-emerald-600 dark:text-emerald-400 uppercase tracking-wider">
                    Change to Return:
                  </span>
                  <span className="text-2xl font-black text-emerald-600 dark:text-emerald-300 font-mono">
                    Rs. {completedSale.change_due.toFixed(2)}
                  </span>
                </div>
              )}
            </div>

            {/* Action Buttons */}
            <div className="grid grid-cols-1 sm:grid-cols-3 gap-2 pt-2">
              <button
                type="button"
                onClick={() => handlePrintPosReceipt(completedSale.invoice_id)}
                title="Direct Print Receipt (Ctrl+P)"
                className={`py-2.5 px-3 rounded-xl border text-xs font-bold flex items-center justify-center gap-1.5 transition-colors cursor-pointer ${
                  isDark
                    ? "border-slate-700 bg-slate-800 hover:bg-slate-700 text-white"
                    : "border-slate-300 bg-slate-100 hover:bg-slate-200 text-slate-800"
                }`}
              >
                <PrinterIcon className="w-4 h-4" />
                <span>Print (Ctrl+P)</span>
              </button>

              <button
                type="button"
                onClick={() => setShareSaleId(completedSale.invoice_id)}
                className={`py-2.5 px-3 rounded-xl border text-xs font-bold flex items-center justify-center gap-1.5 transition-colors cursor-pointer ${
                  isDark
                    ? "border-emerald-700 bg-emerald-900/40 hover:bg-emerald-900/60 text-emerald-300"
                    : "border-emerald-300 bg-emerald-50 hover:bg-emerald-100 text-emerald-800"
                }`}
              >
                <ShareIcon className="w-4 h-4" />
                <span>Share / PDF</span>
              </button>

              <button
                type="button"
                onClick={() => setCompletedSale(null)}
                className="py-2.5 px-3 rounded-xl bg-blue-600 hover:bg-blue-500 text-xs font-bold text-white flex items-center justify-center gap-1.5 shadow-md shadow-blue-500/25 transition-colors cursor-pointer"
              >
                <span>Next Customer</span>
              </button>
            </div>
          </div>
        </div>
      )}

      {/* ======================================================== */}
      {/* PARKED CARTS DRAWER MODAL                                */}
      {/* ======================================================== */}
      {showParkedModal && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/70 backdrop-blur-xs p-4">
          <div
            className={`rounded-3xl p-5 max-w-lg w-full shadow-2xl space-y-4 border ${
              isDark ? "bg-slate-900 border-slate-700 text-white" : "bg-white border-slate-200 text-slate-900"
            }`}
          >
            <div className={`flex items-center justify-between border-b pb-3 ${isDark ? "border-slate-800" : "border-slate-200"}`}>
              <div className="flex items-center gap-2">
                <PauseIcon className="w-5 h-5 text-amber-500" />
                <h3 className="font-bold text-sm">Parked Customer Carts</h3>
              </div>
              <button
                type="button"
                onClick={() => setShowParkedModal(false)}
                className={isDark ? "text-slate-400 hover:text-white" : "text-slate-400 hover:text-slate-800"}
              >
                <XMarkIcon className="w-5 h-5" />
              </button>
            </div>

            {parkedCarts.length === 0 ? (
              <div className={`py-8 text-center text-xs ${isDark ? "text-slate-500" : "text-slate-400"}`}>
                No parked carts currently waiting.
              </div>
            ) : (
              <div className="max-h-80 overflow-y-auto space-y-2.5">
                {parkedCarts.map((p) => (
                  <div
                    key={p.id}
                    className={`p-3 rounded-2xl border flex flex-wrap items-center justify-between gap-2 ${
                      isDark ? "bg-slate-800 border-slate-700" : "bg-slate-50 border-slate-200"
                    }`}
                  >
                    <div>
                      <div className="font-bold text-xs">
                        {p.customer?.name || "Walk-in Customer"}
                      </div>
                      <div className={`text-[11px] flex items-center gap-2 mt-0.5 font-mono ${isDark ? "text-slate-400" : "text-slate-500"}`}>
                        <span>Time: {p.time}</span>
                        <span>•</span>
                        <span>{p.items.length} items ({p.totals?.totalUnits ?? p.totalUnits ?? 0} units)</span>
                      </div>
                      <div className="text-xs font-black text-emerald-600 dark:text-emerald-400 mt-1 font-mono">
                        Rs. {Number(p.totals?.grandTotal ?? p.grandTotal ?? 0).toFixed(2)}
                      </div>
                    </div>

                    <div className="flex items-center gap-2">
                      {p.draftId && (
                        <button
                          type="button"
                          onClick={() => setShareQuoteDraftId(p.draftId)}
                          className="px-2.5 py-1.5 rounded-xl bg-amber-600 hover:bg-amber-500 text-xs font-bold text-white flex items-center gap-1 shadow-xs"
                          title="Print or share Quotation / Estimate PDF"
                        >
                          <ShareIcon className="w-3.5 h-3.5" />
                          <span>Quote PDF</span>
                        </button>
                      )}
                      <button
                        type="button"
                        onClick={() => handleResumeParkedCart(p.id)}
                        className="px-3 py-1.5 rounded-xl bg-blue-600 hover:bg-blue-500 text-xs font-bold text-white flex items-center gap-1 shadow-xs"
                      >
                        <PlayIcon className="w-3.5 h-3.5" />
                        <span>Resume</span>
                      </button>
                      <button
                        type="button"
                        onClick={() => handleDeleteParkedCart(p)}
                        className="p-1.5 rounded-xl text-rose-500 hover:bg-rose-500/10"
                      >
                        <TrashIcon className="w-4 h-4" />
                      </button>
                    </div>
                  </div>
                ))}
              </div>
            )}
          </div>
        </div>
      )}

      {/* CustomerSearch Modal Component */}
      <CustomerSearch
        isOpen={customerSearchOpen}
        onClose={() => setCustomerSearchOpen(false)}
        onSelect={(cust) => {
          setSelectedCustomer(cust);
          setSelectedCustomerId(cust.id);
          setCustomerSearchOpen(false);
        }}
        onCreate={(cust) => {
          setSelectedCustomer(cust);
          setSelectedCustomerId(cust.id);
          setCustomerSearchOpen(false);
        }}
      />

      <ShareDocumentModal
        isOpen={Boolean(shareSaleId)}
        onClose={() => setShareSaleId(null)}
        documentType="sale_invoice"
        documentId={shareSaleId}
      />

      <ShareDocumentModal
        isOpen={Boolean(shareQuoteDraftId)}
        onClose={() => setShareQuoteDraftId(null)}
        documentType="quotation"
        documentId={shareQuoteDraftId}
      />

      <SubstituteProductsModal
        open={Boolean(substituteTargetRow)}
        product={substituteTargetRow}
        onClose={() => setSubstituteTargetRow(null)}
        onSelectSubstitute={handleSelectSubstitute}
        allowSwap={true}
      />

      <Suspense fallback={null}>
        <FeatureGuideBot
          isOpen={guideBotOpen}
          onClose={() => setGuideBotOpen(false)}
        />
      </Suspense>
    </div>
  );
}
