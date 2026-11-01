import React, { useEffect, useMemo, useState } from "react";
import { useNavigate, useSearchParams } from "react-router-dom";
import axios from "axios";
import toast from "react-hot-toast";
import Select from "react-select";
import {
  ShieldExclamationIcon,
  PlusIcon,
  TrashIcon,
  ClockIcon,
  FireIcon,
  ArrowLeftIcon,
  CheckCircleIcon,
  ExclamationTriangleIcon,
} from "@heroicons/react/24/solid";
import { useTheme } from "@/context/ThemeContext";
import { useCurrency } from "@/context/CurrencyContext";
import { getThemeButtonClasses } from "@/utils/buttonStyles";
import { GlassCard, GlassSectionHeader, GlassInput } from "@/components";
import ProductSearchInput from "@/components/ProductSearchInput.jsx";

const CAUSE_OPTIONS = [
  { value: "shelf_expiry", label: "Shelf Expiry (Expired Batch)" },
  { value: "breakage_damage", label: "Physical Breakage / Packaging Damage" },
  { value: "temperature_spoilage", label: "Cold-Chain / Temperature Spoilage" },
  { value: "customer_return_defect", label: "Defective Customer Return" },
  { value: "manufacturer_recall", label: "Manufacturer / Regulatory Recall" },
  { value: "water_pest_damage", label: "Moisture / Pest Contamination" },
  { value: "theft_shrinkage", label: "Unrecoverable Shrinkage / Pilferage" },
  { value: "other", label: "Other Cause" },
];

const METHOD_OPTIONS = [
  { value: "quarantine_holding", label: "In Quarantine Bay (Pending Destruction)" },
  { value: "incineration", label: "High-Temperature Incineration" },
  { value: "chemical_neutralization", label: "Chemical Neutralization / Encapsulation" },
  { value: "municipal_waste", label: "Authorized Bio-Hazard / Municipal Waste" },
  { value: "supplier_destruction", label: "Handed to Supplier (No Credit)" },
  { value: "drain_flush", label: "Authorized Dilution & Drain Flush" },
  { value: "other", label: "Other Method" },
];

export default function CreateStockDisposal() {
  const navigate = useNavigate();
  const [searchParams] = useSearchParams();
  const { isDark, theme } = useTheme();
  const { formatCurrency } = useCurrency();

  const buttonStyle = theme?.button_style || "modern";
  const themeColors = useMemo(() => ({
    primary: theme?.primary_color || "#3b82f6",
    primaryHover: theme?.primary_hover || "#2563eb",
    secondary: theme?.secondary_color || "#8b5cf6",
    secondaryHover: theme?.secondary_hover || "#7c3aed",
    tertiary: theme?.tertiary_color || "#06b6d4",
    tertiaryHover: theme?.tertiary_hover || "#0891b2",
    emerald: theme?.success_color || "#10b981",
    emeraldHover: "#059669",
    danger: theme?.danger_color || "#ef4444",
    dangerHover: "#dc2626",
  }), [theme]);

  const buttonClasses = useMemo(
    () => getThemeButtonClasses(buttonStyle, themeColors, isDark),
    [buttonStyle, themeColors, isDark]
  );
  const btnPrimary = buttonClasses.primary;
  const btnSecondary = buttonClasses.secondary;
  const btnDanger = buttonClasses.danger;

  const selectStyles = useMemo(() => ({
    control: (base, state) => ({
      ...base,
      minHeight: "38px",
      borderRadius: "0.75rem",
      backgroundColor: isDark ? "#1e293b" : "#ffffff",
      borderColor: state.isFocused
        ? (theme?.primary_color || "#3b82f6")
        : (isDark ? "#475569" : "#d1d5db"),
      boxShadow: "none",
      fontSize: "0.8125rem",
    }),
    singleValue: (base) => ({
      ...base,
      color: isDark ? "#f8fafc" : "#111827",
      fontSize: "0.8125rem",
    }),
    menuPortal: (base) => ({ ...base, zIndex: 9999 }),
    menu: (base) => ({
      ...base,
      backgroundColor: isDark ? "#1e293b" : "#ffffff",
      border: isDark ? "1px solid #334155" : "1px solid #e5e7eb",
      borderRadius: "0.75rem",
      zIndex: 9999,
    }),
    option: (base, state) => ({
      ...base,
      backgroundColor: state.isSelected
        ? (theme?.primary_color || "#3b82f6")
        : state.isFocused
        ? (isDark ? "#334155" : "#f1f5f9")
        : "transparent",
      color: state.isSelected ? "#ffffff" : (isDark ? "#f8fafc" : "#111827"),
      fontSize: "0.8125rem",
      cursor: "pointer",
    }),
  }), [isDark, theme]);

  const [products, setProducts] = useState([]);
  const [batchesByProduct, setBatchesByProduct] = useState({});
  const [submitting, setSubmitting] = useState(false);

  const [form, setForm] = useState(() => {
    const initialMode = searchParams.get("mode") === "disposed" ? "disposed" : "quarantined";
    const initialCause = searchParams.get("cause") || "shelf_expiry";
    return {
      disposal_number: "",
      disposal_date: new Date().toISOString().slice(0, 10),
      status: initialMode,
      cause: initialCause,
      disposal_method: initialMode === "quarantined" ? "quarantine_holding" : "incineration",
      reference_no: "",
      witness_name: "",
      witness_designation: "",
      notes: "",
      record_expense: true,
      items: [
        {
          product_id: "",
          batch_id: "",
          batch_number: "",
          expiry_date: "",
          pack_size: 1,
          available_qty: 0,
          dispose_qty: "",
          unit_purchase_price: "",
          item_note: "",
        },
      ],
    };
  });

  const mergeProducts = (list) => {
    if (!Array.isArray(list) || list.length === 0) return;
    setProducts((prev) => {
      const map = new Map((prev || []).map((p) => [String(p.id), p]));
      for (const p of list) {
        if (p && p.id != null) map.set(String(p.id), p);
      }
      return Array.from(map.values());
    });
  };

  const fetchProducts = async (q = "") => {
    try {
      const { data } = await axios.get("/api/products/search", { params: { q, limit: 30 } });
      const list = Array.isArray(data?.data) ? data.data : Array.isArray(data) ? data : [];
      mergeProducts(list);
    } catch {}
  };

  const fetchBatches = async (productId) => {
    const key = String(productId || "");
    if (!key) return [];
    if (Array.isArray(batchesByProduct[key])) return batchesByProduct[key];
    try {
      const { data } = await axios.get(`/api/products/${productId}/batches`);
      const list = Array.isArray(data?.data) ? data.data : Array.isArray(data) ? data : [];
      setBatchesByProduct((prev) => ({ ...prev, [key]: list }));
      return list;
    } catch {
      setBatchesByProduct((prev) => ({ ...prev, [key]: [] }));
      return [];
    }
  };

  // Load new code & optional query-string preselected batch/product
  useEffect(() => {
    (async () => {
      fetchProducts("");
      try {
        const { data } = await axios.get("/api/stock-disposals/new-code");
        if (data?.disposal_number) {
          setForm((prev) => ({ ...prev, disposal_number: data.disposal_number }));
        }
      } catch {}

      const qProductId = searchParams.get("product_id");
      const qBatchId = searchParams.get("batch_id");
      const qBatchNumber = searchParams.get("batch_number");
      const qExpiry = searchParams.get("expiry_date");
      const qQty = searchParams.get("qty");
      const qUnitCost = searchParams.get("unit_cost");

      if (qProductId) {
        try {
          const [prodRes, batchList] = await Promise.all([
            axios.get(`/api/products/${qProductId}`),
            fetchBatches(qProductId),
          ]);
          const prod = prodRes.data?.data ?? prodRes.data;
          if (prod && prod.id) {
            mergeProducts([prod]);
            const matchedBatch =
              batchList.find((b) => String(b.id) === String(qBatchId)) ||
              batchList.find((b) => String(b.batch_number) === String(qBatchNumber));

            const availQty = matchedBatch
              ? Number(matchedBatch.quantity ?? matchedBatch.available_units ?? 0)
              : Number(prod.quantity ?? prod.available_units ?? 0);

            const unitCost =
              qUnitCost ||
              prod.unit_purchase_price ||
              prod.avg_price ||
              (prod.pack_purchase_price && prod.pack_size
                ? (Number(prod.pack_purchase_price) / Number(prod.pack_size)).toFixed(2)
                : 0);

            setForm((prev) => ({
              ...prev,
              items: [
                {
                  product_id: prod.id,
                  batch_id: matchedBatch?.id || qBatchId || "",
                  batch_number: matchedBatch?.batch_number || qBatchNumber || "",
                  expiry_date:
                    (matchedBatch?.expiry_date || matchedBatch?.expiry || qExpiry || "").slice(0, 10),
                  pack_size: prod.pack_size || 1,
                  available_qty: availQty,
                  dispose_qty: qQty || String(availQty || 1),
                  unit_purchase_price: String(unitCost || 0),
                  item_note: "Expired / non-returnable batch from Expiry Tracker",
                },
              ],
            }));
          }
        } catch {}
      }
    })();
  }, []);

  const productMap = useMemo(() => {
    const map = new Map();
    for (const p of products) {
      map.set(String(p.id), p);
    }
    return map;
  }, [products]);

  const hasNarcotics = useMemo(() => {
    return form.items.some((it) => {
      const p = productMap.get(String(it.product_id));
      return p && String(p.narcotic || "").toLowerCase() === "yes";
    });
  }, [form.items, productMap]);

  const totals = useMemo(() => {
    let totalUnits = 0;
    let totalCost = 0;
    for (const it of form.items) {
      const q = parseFloat(it.dispose_qty || 0) || 0;
      const c = parseFloat(it.unit_purchase_price || 0) || 0;
      if (q > 0) {
        totalUnits += q;
        totalCost += q * c;
      }
    }
    return {
      totalUnits: Math.round(totalUnits * 100) / 100,
      totalCost: Math.round(totalCost * 100) / 100,
    };
  }, [form.items]);

  const handleProductSelect = async (rowIndex, productOrId) => {
    const prod =
      typeof productOrId === "object" && productOrId !== null
        ? productOrId
        : productMap.get(String(productOrId));

    const pid = prod ? prod.id : productOrId;
    if (!pid) return;

    let resolvedProd = prod;
    if (!resolvedProd) {
      try {
        const { data } = await axios.get(`/api/products/${pid}`);
        resolvedProd = data?.data ?? data;
        if (resolvedProd) mergeProducts([resolvedProd]);
      } catch {}
    } else {
      mergeProducts([resolvedProd]);
    }

    const batchList = await fetchBatches(pid);
    const activeBatches = batchList.filter((b) => Number(b.quantity ?? b.available_units ?? 0) > 0);
    // Pick earliest expiring batch by default if available
    const defaultBatch = activeBatches.sort((a, b) =>
      String(a.expiry_date || a.expiry || "9999").localeCompare(String(b.expiry_date || b.expiry || "9999"))
    )[0];

    const unitCost =
      resolvedProd?.unit_purchase_price ||
      resolvedProd?.avg_price ||
      (resolvedProd?.pack_purchase_price && resolvedProd?.pack_size
        ? (Number(resolvedProd.pack_purchase_price) / Number(resolvedProd.pack_size)).toFixed(2)
        : 0);

    const avail = defaultBatch
      ? Number(defaultBatch.quantity ?? defaultBatch.available_units ?? 0)
      : Number(resolvedProd?.quantity ?? resolvedProd?.available_units ?? 0);

    setForm((prev) => {
      const nextItems = [...prev.items];
      nextItems[rowIndex] = {
        ...nextItems[rowIndex],
        product_id: pid,
        batch_id: defaultBatch?.id || "",
        batch_number: defaultBatch?.batch_number || "",
        expiry_date: String(defaultBatch?.expiry_date || defaultBatch?.expiry || "").slice(0, 10),
        pack_size: resolvedProd?.pack_size || 1,
        available_qty: avail,
        dispose_qty: nextItems[rowIndex].dispose_qty || (avail > 0 ? "1" : ""),
        unit_purchase_price: String(unitCost || 0),
      };
      return { ...prev, items: nextItems };
    });
  };

  const handleBatchSelect = (rowIndex, batchNumber) => {
    setForm((prev) => {
      const nextItems = [...prev.items];
      const row = nextItems[rowIndex];
      const pBatches = batchesByProduct[String(row.product_id)] || [];
      const found = pBatches.find((b) => String(b.batch_number) === String(batchNumber));
      const prod = productMap.get(String(row.product_id));

      const avail = found
        ? Number(found.quantity ?? found.available_units ?? 0)
        : Number(prod?.quantity ?? prod?.available_units ?? 0);

      nextItems[rowIndex] = {
        ...row,
        batch_id: found?.id || "",
        batch_number: found ? found.batch_number : "",
        expiry_date: found ? String(found.expiry_date || found.expiry || "").slice(0, 10) : "",
        available_qty: avail,
      };
      return { ...prev, items: nextItems };
    });
  };

  const updateItemField = (rowIndex, field, value) => {
    setForm((prev) => {
      const nextItems = [...prev.items];
      nextItems[rowIndex] = { ...nextItems[rowIndex], [field]: value };
      return { ...prev, items: nextItems };
    });
  };

  const addRow = () => {
    setForm((prev) => ({
      ...prev,
      items: [
        ...prev.items,
        {
          product_id: "",
          batch_id: "",
          batch_number: "",
          expiry_date: "",
          pack_size: 1,
          available_qty: 0,
          dispose_qty: "",
          unit_purchase_price: "",
          item_note: "",
        },
      ],
    }));
  };

  const removeRow = (rowIndex) => {
    setForm((prev) => {
      if (prev.items.length <= 1) return prev;
      return {
        ...prev,
        items: prev.items.filter((_, idx) => idx !== rowIndex),
      };
    });
  };

  const handleSubmit = async (e) => {
    e.preventDefault();
    const validItems = form.items.filter((it) => it.product_id && parseFloat(it.dispose_qty || 0) > 0);
    if (validItems.length === 0) {
      toast.error("Please select at least one product and enter a disposal quantity greater than zero.");
      return;
    }

    if (form.status === "disposed" && hasNarcotics && !form.witness_name.trim()) {
      toast.error("Witness name is mandatory when disposing controlled / narcotic products.");
      return;
    }

    try {
      setSubmitting(true);
      const payload = {
        ...form,
        items: validItems.map((it) => ({
          product_id: Number(it.product_id),
          batch_id: it.batch_id ? Number(it.batch_id) : null,
          batch_number: it.batch_number || null,
          expiry_date: it.expiry_date || null,
          pack_size: Number(it.pack_size || 1),
          dispose_qty: parseFloat(it.dispose_qty),
          unit_purchase_price: parseFloat(it.unit_purchase_price || 0),
          item_note: it.item_note || null,
        })),
      };

      const { data } = await axios.post("/api/stock-disposals", payload);
      toast.success(data?.message || "Saved successfully");
      navigate("/stock-disposals");
    } catch (err) {
      const msg =
        err?.response?.data?.message ||
        Object.values(err?.response?.data?.errors || {})?.[0]?.[0] ||
        "Failed to save quarantine / disposal voucher";
      toast.error(msg);
    } finally {
      setSubmitting(false);
    }
  };

  const inputCls = `rounded-xl border px-3 py-2 text-xs focus:outline-none focus:ring-2 transition-colors ${
    isDark
      ? "bg-slate-800 border-slate-600 text-slate-100 focus:ring-blue-500/40 placeholder-slate-500"
      : "bg-white border-gray-300 text-gray-900 focus:ring-blue-500/40 placeholder-gray-400"
  }`;

  return (
    <div className="space-y-5 px-1">
      <GlassSectionHeader
        title="New Quarantine / Stock Disposal Voucher"
        right={
          <button
            type="button"
            onClick={() => navigate("/stock-disposals")}
            className={`inline-flex items-center gap-2 px-4 py-2.5 text-sm font-semibold ${btnSecondary.className}`}
            style={btnSecondary.style}
          >
            <ArrowLeftIcon className="w-4 h-4" />
            <span>Back to Register</span>
          </button>
        }
      />

      <form onSubmit={handleSubmit} className="space-y-5">
        {/* Step 1: Action Mode Selector */}
        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
          <button
            type="button"
            onClick={() =>
              setForm((prev) => ({
                ...prev,
                status: "quarantined",
                disposal_method: "quarantine_holding",
              }))
            }
            className={`p-4 rounded-2xl border text-left transition-all flex items-start gap-3.5 ${
              form.status === "quarantined"
                ? isDark
                  ? "bg-amber-950/30 border-amber-500 ring-2 ring-amber-500/30"
                  : "bg-amber-50 border-amber-500 ring-2 ring-amber-500/20"
                : isDark
                ? "bg-slate-900/60 border-slate-700 hover:bg-slate-800/60"
                : "bg-white border-gray-200 hover:bg-gray-50"
            }`}
          >
            <div className="p-2.5 rounded-xl bg-amber-500/20 text-amber-500 border border-amber-500/30 shrink-0">
              <ClockIcon className="w-6 h-6" />
            </div>
            <div>
              <div className="flex items-center gap-2">
                <span className={`font-bold text-sm ${isDark ? "text-white" : "text-gray-900"}`}>
                  Stage 1: Isolate in Quarantine Bay
                </span>
                {form.status === "quarantined" && (
                  <CheckCircleIcon className="w-4 h-4 text-amber-500" />
                )}
              </div>
              <p className={`text-xs mt-1 ${isDark ? "text-slate-400" : "text-gray-600"}`}>
                Immediately deducts units from sellable POS/Invoice stock so cashiers cannot sell them. Can later be either permanently destroyed or restored to shelf.
              </p>
            </div>
          </button>

          <button
            type="button"
            onClick={() =>
              setForm((prev) => ({
                ...prev,
                status: "disposed",
                disposal_method:
                  prev.disposal_method === "quarantine_holding"
                    ? "incineration"
                    : prev.disposal_method,
              }))
            }
            className={`p-4 rounded-2xl border text-left transition-all flex items-start gap-3.5 ${
              form.status === "disposed"
                ? isDark
                  ? "bg-rose-950/30 border-rose-500 ring-2 ring-rose-500/30"
                  : "bg-rose-50 border-rose-500 ring-2 ring-rose-500/20"
                : isDark
                ? "bg-slate-900/60 border-slate-700 hover:bg-slate-800/60"
                : "bg-white border-gray-200 hover:bg-gray-50"
            }`}
          >
            <div className="p-2.5 rounded-xl bg-rose-500/20 text-rose-500 border border-rose-500/30 shrink-0">
              <FireIcon className="w-6 h-6" />
            </div>
            <div>
              <div className="flex items-center gap-2">
                <span className={`font-bold text-sm ${isDark ? "text-white" : "text-gray-900"}`}>
                  Immediate Destruction & P&L Write-Off
                </span>
                {form.status === "disposed" && (
                  <CheckCircleIcon className="w-4 h-4 text-rose-500" />
                )}
              </div>
              <p className={`text-xs mt-1 ${isDark ? "text-slate-400" : "text-gray-600"}`}>
                Permanently deducts stock, records witness & destruction method, and writes off the inventory cost to the Net Profit (P&L) statement.
              </p>
            </div>
          </button>
        </div>

        {/* Narcotic Compliance Banner */}
        {hasNarcotics && (
          <div
            className={`p-4 rounded-2xl border flex items-start gap-3 text-xs ${
              isDark
                ? "bg-purple-950/40 border-purple-700 text-purple-200"
                : "bg-purple-50 border-purple-200 text-purple-900"
            }`}
          >
            <ExclamationTriangleIcon className="w-5 h-5 text-purple-500 shrink-0 mt-0.5" />
            <div>
              <span className="font-bold text-sm block">
                Controlled / Narcotic Drug Regulatory Notice
              </span>
              One or more selected products are classified as Controlled / Narcotic substances. Drug Regulatory Authority rules require recording the <strong>Witness Name</strong> and <strong>Designation</strong> (e.g., Registered Pharmacist or Drug Inspector) before finalizing disposal.
            </div>
          </div>
        )}

        {/* Voucher Metadata Card */}
        <GlassCard className="p-5 space-y-4">
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
            <div>
              <label className={`block text-xs font-semibold mb-1 ${isDark ? "text-slate-300" : "text-gray-700"}`}>
                Voucher Number
              </label>
              <GlassInput
                type="text"
                value={form.disposal_number}
                readOnly
                className="w-full text-xs h-[38px] font-mono font-bold opacity-80"
              />
            </div>

            <div>
              <label className={`block text-xs font-semibold mb-1 ${isDark ? "text-slate-300" : "text-gray-700"}`}>
                Date *
              </label>
              <GlassInput
                type="date"
                value={form.disposal_date}
                onChange={(e) => setForm((prev) => ({ ...prev, disposal_date: e.target.value }))}
                required
                className="w-full text-xs h-[38px]"
              />
            </div>

            <div>
              <label className={`block text-xs font-semibold mb-1 ${isDark ? "text-slate-300" : "text-gray-700"}`}>
                Cause of Loss / Quarantine *
              </label>
              <Select
                options={CAUSE_OPTIONS}
                value={CAUSE_OPTIONS.find((o) => o.value === form.cause) || CAUSE_OPTIONS[0]}
                onChange={(opt) => setForm((prev) => ({ ...prev, cause: opt?.value || "shelf_expiry" }))}
                styles={selectStyles}
                menuPortalTarget={typeof document !== "undefined" ? document.body : null}
                menuPosition="fixed"
                isSearchable={false}
              />
            </div>

            <div>
              <label className={`block text-xs font-semibold mb-1 ${isDark ? "text-slate-300" : "text-gray-700"}`}>
                Disposal / Handling Method *
              </label>
              <Select
                options={METHOD_OPTIONS}
                value={METHOD_OPTIONS.find((o) => o.value === form.disposal_method) || METHOD_OPTIONS[0]}
                onChange={(opt) =>
                  setForm((prev) => ({ ...prev, disposal_method: opt?.value || "incineration" }))
                }
                styles={selectStyles}
                menuPortalTarget={typeof document !== "undefined" ? document.body : null}
                menuPosition="fixed"
                isSearchable={false}
              />
            </div>
          </div>

          <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
            <div>
              <label className={`block text-xs font-semibold mb-1 ${isDark ? "text-slate-300" : "text-gray-700"}`}>
                Witness Name {form.status === "disposed" && hasNarcotics ? "*" : "(Pharmacist / Supervisor)"}
              </label>
              <GlassInput
                type="text"
                value={form.witness_name}
                onChange={(e) => setForm((prev) => ({ ...prev, witness_name: e.target.value }))}
                placeholder="e.g. Dr. Usman Ali"
                required={form.status === "disposed" && hasNarcotics}
                className="w-full text-xs h-[38px]"
              />
            </div>

            <div>
              <label className={`block text-xs font-semibold mb-1 ${isDark ? "text-slate-300" : "text-gray-700"}`}>
                Witness Designation
              </label>
              <GlassInput
                type="text"
                value={form.witness_designation}
                onChange={(e) =>
                  setForm((prev) => ({ ...prev, witness_designation: e.target.value }))
                }
                placeholder="e.g. Chief Pharmacist / Store Manager"
                className="w-full text-xs h-[38px]"
              />
            </div>

            <div>
              <label className={`block text-xs font-semibold mb-1 ${isDark ? "text-slate-300" : "text-gray-700"}`}>
                External Ref / Recall Notice #
              </label>
              <GlassInput
                type="text"
                value={form.reference_no}
                onChange={(e) => setForm((prev) => ({ ...prev, reference_no: e.target.value }))}
                placeholder="Optional DRAP recall or inspection ref"
                className="w-full text-xs h-[38px]"
              />
            </div>
          </div>

          <div>
            <label className={`block text-xs font-semibold mb-1 ${isDark ? "text-slate-300" : "text-gray-700"}`}>
              General Remarks / Explanation
            </label>
            <input
              type="text"
              value={form.notes}
              onChange={(e) => setForm((prev) => ({ ...prev, notes: e.target.value }))}
              placeholder="Explain the circumstances of damage, spoilage, or non-returnable expiry..."
              className={`${inputCls} w-full h-[38px]`}
            />
          </div>
        </GlassCard>

        {/* Line Items Table */}
        <GlassCard className="overflow-hidden">
          <div
            className={`flex flex-wrap items-center justify-between gap-2 px-5 py-3.5 border-b ${
              isDark ? "border-slate-700 bg-slate-800/40" : "border-gray-200 bg-gray-50"
            }`}
          >
            <div>
              <h3 className={`text-sm font-bold ${isDark ? "text-white" : "text-gray-900"}`}>
                Affected Products & Batches
              </h3>
              <p className={`text-xs ${isDark ? "text-slate-400" : "text-gray-500"}`}>
                Select each product and batch to isolate or dispose of.
              </p>
            </div>
            <button
              type="button"
              onClick={addRow}
              className={`inline-flex items-center gap-1.5 px-4 py-2.5 text-sm font-semibold ${btnSecondary.className}`}
              style={btnSecondary.style}
            >
              <PlusIcon className="w-4 h-4" />
              <span>Add Item Row</span>
            </button>
          </div>

          <div className="overflow-x-auto">
            <table className="w-full text-left text-xs">
              <thead>
                <tr
                  className={`border-b uppercase tracking-wider font-semibold ${
                    isDark
                      ? "bg-slate-800/70 text-slate-400 border-slate-700"
                      : "bg-gray-50 text-gray-600 border-gray-200"
                  }`}
                >
                  <th className="py-3 px-3 w-10">#</th>
                  <th className="py-3 px-3 min-w-[240px]">Product</th>
                  <th className="py-3 px-3 min-w-[200px]">Batch & Expiry</th>
                  <th className="py-3 px-3 text-center w-28">On-Hand Qty</th>
                  <th className="py-3 px-3 text-right w-36">Dispose Qty *</th>
                  <th className="py-3 px-3 text-right w-32">Unit Cost</th>
                  <th className="py-3 px-3 text-right w-36">Cost Write-Off</th>
                  <th className="py-3 px-3 min-w-[160px]">Line Note</th>
                  <th className="py-3 px-3 text-center w-14"></th>
                </tr>
              </thead>
              <tbody className={`divide-y ${isDark ? "divide-slate-800" : "divide-gray-100"}`}>
                {form.items.map((row, idx) => {
                  const pBatches = batchesByProduct[String(row.product_id)] || [];
                  const lineQty = parseFloat(row.dispose_qty || 0) || 0;
                  const lineCost = parseFloat(row.unit_purchase_price || 0) || 0;
                  const lineWriteOff = Math.round(lineQty * lineCost * 100) / 100;
                  const prod = productMap.get(String(row.product_id));
                  const isNarcotic = prod && String(prod.narcotic || "").toLowerCase() === "yes";

                  return (
                    <tr key={idx} className={isDark ? "hover:bg-slate-800/30" : "hover:bg-gray-50/70"}>
                      <td className="py-3 px-3 font-mono text-slate-400">{idx + 1}</td>

                      <td className="py-3 px-3">
                        <ProductSearchInput
                          value={row.product_id}
                          onChange={(val) => handleProductSelect(idx, val)}
                          products={products}
                          onRefreshProducts={() => fetchProducts("")}
                        />
                        {isNarcotic && (
                          <span className="mt-1 inline-flex items-center gap-1 px-2 py-0.5 rounded text-[10px] font-bold uppercase bg-purple-100 text-purple-800 dark:bg-purple-900/40 dark:text-purple-300">
                            <ShieldExclamationIcon className="w-3 h-3" />
                            Controlled / Narcotic
                          </span>
                        )}
                      </td>

                      <td className="py-3 px-3">
                        {pBatches.length > 0 ? (
                          <select
                            value={row.batch_number || ""}
                            onChange={(e) => handleBatchSelect(idx, e.target.value)}
                            className={`${inputCls} w-full h-9 font-mono`}
                          >
                            <option value="">-- Unbatched / Product Level --</option>
                            {pBatches.map((b) => {
                              const bQty = Number(b.quantity ?? b.available_units ?? 0);
                              const bExp = String(b.expiry_date || b.expiry || "").slice(0, 10);
                              return (
                                <option key={b.id || b.batch_number} value={b.batch_number}>
                                  {b.batch_number} (Qty: {bQty}{bExp ? ` • Exp: ${bExp}` : ""})
                                </option>
                              );
                            })}
                          </select>
                        ) : (
                          <span className={`text-xs italic ${isDark ? "text-slate-500" : "text-gray-400"}`}>
                            {row.product_id ? "No batches (Product-level stock)" : "Select product first"}
                          </span>
                        )}
                      </td>

                      <td className="py-3 px-3 text-center font-mono font-bold">
                        {Number(row.available_qty || 0).toLocaleString()}
                      </td>

                      <td className="py-3 px-3 text-right">
                        <div className="flex items-center gap-1">
                          <GlassInput
                            type="number"
                            step="1"
                            min="1"
                            max={row.available_qty || undefined}
                            value={row.dispose_qty}
                            onChange={(e) => updateItemField(idx, "dispose_qty", e.target.value)}
                            placeholder="0"
                            className="w-full text-right font-mono font-bold text-xs h-9"
                          />
                          {row.available_qty > 0 && (
                            <button
                              type="button"
                              onClick={() =>
                                updateItemField(idx, "dispose_qty", String(row.available_qty))
                              }
                              className={`px-2 py-1 rounded text-[10px] font-bold border ${
                                isDark
                                  ? "bg-slate-800 border-slate-600 text-slate-300 hover:bg-slate-700"
                                  : "bg-gray-100 border-gray-300 text-gray-700 hover:bg-gray-200"
                              }`}
                              title="Fill full available batch quantity"
                            >
                              All
                            </button>
                          )}
                        </div>
                      </td>

                      <td className="py-3 px-3 text-right">
                        <GlassInput
                          type="number"
                          step="0.01"
                          min="0"
                          value={row.unit_purchase_price}
                          onChange={(e) =>
                            updateItemField(idx, "unit_purchase_price", e.target.value)
                          }
                          placeholder="0.00"
                          className="w-full text-right font-mono text-xs h-9"
                        />
                      </td>

                      <td className="py-3 px-3 text-right font-mono font-bold text-rose-500">
                        {formatCurrency(lineWriteOff)}
                      </td>

                      <td className="py-3 px-3">
                        <GlassInput
                          type="text"
                          value={row.item_note}
                          onChange={(e) => updateItemField(idx, "item_note", e.target.value)}
                          placeholder="e.g. Crushed bottle"
                          className="w-full text-xs h-9"
                        />
                      </td>

                      <td className="py-3 px-3 text-center">
                        <button
                          type="button"
                          disabled={form.items.length <= 1}
                          onClick={() => removeRow(idx)}
                          className="p-1.5 rounded-lg text-slate-400 hover:text-rose-500 disabled:opacity-30"
                          title="Remove row"
                        >
                          <TrashIcon className="w-4 h-4" />
                        </button>
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>

          {/* Summary Footer */}
          <div
            className={`p-5 border-t flex flex-wrap items-center justify-between gap-4 ${
              isDark ? "border-slate-700 bg-slate-800/40" : "border-gray-200 bg-gray-50"
            }`}
          >
            <div className="flex flex-wrap items-center gap-6">
              <div>
                <span className={`text-[11px] uppercase tracking-wider block font-semibold ${isDark ? "text-slate-400" : "text-gray-500"}`}>
                  Total Units to {form.status === "quarantined" ? "Quarantine" : "Dispose"}
                </span>
                <span className={`text-lg font-bold font-mono ${isDark ? "text-white" : "text-gray-900"}`}>
                  {totals.totalUnits.toLocaleString()} Units
                </span>
              </div>

              <div>
                <span className={`text-[11px] uppercase tracking-wider block font-semibold ${isDark ? "text-slate-400" : "text-gray-500"}`}>
                  Total Cost Write-Off Value
                </span>
                <span className="text-lg font-bold font-mono text-rose-500">
                  {formatCurrency(totals.totalCost)}
                </span>
              </div>

              <label className="flex items-center gap-2 cursor-pointer text-xs">
                <input
                  type="checkbox"
                  checked={form.record_expense}
                  onChange={(e) =>
                    setForm((prev) => ({ ...prev, record_expense: e.target.checked }))
                  }
                  className="rounded text-blue-600 focus:ring-blue-500"
                />
                <span className={`font-medium ${isDark ? "text-slate-300" : "text-gray-700"}`}>
                  Post Non-Cash P&L Write-Off Expense upon Disposal
                </span>
              </label>
            </div>

            <div className="flex flex-col-reverse sm:flex-row items-stretch sm:items-center gap-3 w-full sm:w-auto">
              <button
                type="button"
                onClick={() => navigate("/stock-disposals")}
                disabled={submitting}
                className={`px-4 py-2.5 text-sm font-semibold ${btnSecondary.className}`}
                style={btnSecondary.style}
              >
                Cancel
              </button>
              <button
                type="submit"
                disabled={submitting || totals.totalUnits <= 0}
                className={`inline-flex items-center gap-2 px-4 py-2.5 text-sm font-semibold disabled:opacity-50 ${
                  form.status === "disposed" ? btnDanger.className : btnPrimary.className
                }`}
                style={form.status === "disposed" ? btnDanger.style : btnPrimary.style}
              >
                {form.status === "disposed" ? (
                  <FireIcon className="w-4 h-4" />
                ) : (
                  <ClockIcon className="w-4 h-4" />
                )}
                <span>
                  {submitting
                    ? "Saving..."
                    : form.status === "disposed"
                    ? "Confirm Destruction & P&L Write-Off"
                    : "Isolate Stock in Quarantine"}
                </span>
              </button>
            </div>
          </div>
        </GlassCard>
      </form>
    </div>
  );
}

