import React, { useState, useEffect, useRef, useMemo } from "react";
import axios from "axios";
import toast from "react-hot-toast";
import Select from "react-select";
import {
  CheckCircleIcon,
  ArrowPathIcon,
  PlusIcon,
  TrashIcon,
  BellAlertIcon,
  CubeIcon,
} from "@heroicons/react/24/solid";
import { GlassCard, GlassInput, GlassBtn } from "@/components/Glass.jsx";
import { getReactSelectStyles } from "@/components/ExpiryReturnPolicyFields.jsx";
import ProductSearchInput from "@/components/ProductSearchInput.jsx";
import { useTheme } from "@/context/ThemeContext";

const TAX_STATUS_OPTIONS = [
  { value: "unregistered", label: "Unregistered" },
  { value: "registered", label: "Tax Registered" },
  { value: "exempt", label: "Tax Exempt" },
];

const CREDIT_STATUS_OPTIONS = [
  { value: "active", label: "Active (Credit permitted)" },
  { value: "on_hold", label: "On Hold (Requires override)" },
  { value: "blocked", label: "Blocked (Credit blocked)" },
];

const REFILL_CYCLE_OPTIONS = [
  { value: "weekly", label: "Weekly (Every 7 Days)", days: 7 },
  { value: "biweekly", label: "Bi-Weekly (Every 14 Days)", days: 14 },
  { value: "monthly", label: "Monthly (Every 30 Days)", days: 30 },
  { value: "custom", label: "Custom Interval (Days)", days: null },
];

function computeDefaultNextDate(cycle, customDays = 30) {
  const d = new Date();
  if (cycle === "weekly") {
    d.setDate(d.getDate() + 7);
  } else if (cycle === "biweekly") {
    d.setDate(d.getDate() + 14);
  } else if (cycle === "custom") {
    d.setDate(d.getDate() + Math.max(1, Number(customDays || 30)));
  } else {
    d.setMonth(d.getMonth() + 1);
  }
  return d.toISOString().slice(0, 10);
}

let rowCounter = 1;
function generateRowId() {
  return `reg_row_${Date.now()}_${rowCounter++}`;
}

function createEmptyRegularRow() {
  return {
    id: generateRowId(),
    product_id: "",
    product: null,
    pack_size: "",
    current_quantity: "",
    pack_quantity: "",
    unit_quantity: "",
    dosage_notes: "",
  };
}

function formatPackFromUnits(units, packSize) {
  const u = Number(units);
  const ps = Math.max(1, Number(packSize || 1));
  if (!Number.isFinite(u) || u <= 0) return "";
  const packs = u / ps;
  return Number.isInteger(packs)
    ? String(packs)
    : String(Number(packs.toFixed(2)));
}

function mapInitialRegularItems(items) {
  if (!Array.isArray(items) || items.length === 0) {
    return [createEmptyRegularRow()];
  }
  return items.map((item) => {
    const prod = item.product || null;
    const packSize = Math.max(
      1,
      Number(prod?.pack_size ?? item.pack_size ?? 1)
    );
    const rawUnit = Number(item.unit_quantity || 0);
    const rawPack = Number(item.pack_quantity || 0);

    let unitQtyStr = "";
    let packQtyStr = "";

    if (rawUnit > 0) {
      unitQtyStr = String(rawUnit);
      packQtyStr = formatPackFromUnits(rawUnit, packSize);
    } else if (rawPack > 0) {
      const computedUnits = Math.max(1, Math.round(rawPack * packSize));
      unitQtyStr = String(computedUnits);
      packQtyStr = String(rawPack);
    }

    return {
      id: generateRowId(),
      product_id: item.product_id ? Number(item.product_id) : "",
      product: prod,
      pack_size: prod?.pack_size ?? item.pack_size ?? "",
      current_quantity: prod?.quantity ?? item.on_hand_units ?? "",
      pack_quantity: packQtyStr,
      unit_quantity: unitQtyStr,
      dosage_notes: item.dosage_notes || "",
    };
  });
}

export default function CustomerForm({
  initialData = null,
  onSubmit,
  saving = false,
  isEdit = false,
  submitLabel = "Save Customer",
}) {
  const { isDark, theme } = useTheme();
  const primaryColor = theme?.primary_color || "#3b82f6";

  const [form, setForm] = useState({
    name: initialData?.name || "",
    phone: initialData?.phone || "",
    email: initialData?.email || "",
    address: initialData?.address || "",
    tax_status: initialData?.tax_status || "unregistered",
    tax_number: initialData?.tax_number || "",
    credit_limit: initialData?.credit_limit ?? "",
    credit_days: initialData?.credit_days ?? 30,
    credit_status: initialData?.credit_status || "active",
    opening_balance: "",
    is_regular: Boolean(initialData?.is_regular),
    refill_cycle: initialData?.refill_cycle || "monthly",
    refill_custom_days: initialData?.refill_custom_days ?? 15,
    reminder_lead_days: initialData?.reminder_lead_days ?? 2,
    next_refill_date:
      initialData?.next_refill_date || computeDefaultNextDate("monthly"),
    reminder_language: initialData?.reminder_language || "english",
    regular_notes: initialData?.regular_notes || "",
  });

  const [regularItems, setRegularItems] = useState(() =>
    mapInitialRegularItems(
      initialData?.regular_items || initialData?.regularItems || []
    )
  );

  // Products catalog for ProductSearchInput repeater
  const [productsCatalog, setProductsCatalog] = useState([]);

  // Repeater cell refs (same flow as SaleInvoiceRetailForm)
  const itemsScrollRef = useRef(null);
  const productRefs = useRef([]);
  const packQtyRefs = useRef([]);
  const unitQtyRefs = useRef([]);
  const dosageRefs = useRef([]);

  const nameRef = useRef(null);
  const phoneRef = useRef(null);
  const emailRef = useRef(null);
  const addressRef = useRef(null);
  const taxStatusSelectRef = useRef(null);
  const taxNumberRef = useRef(null);
  const creditLimitRef = useRef(null);
  const creditDaysRef = useRef(null);
  const openingBalanceRef = useRef(null);

  const selectStyles = useMemo(
    () => getReactSelectStyles(isDark, primaryColor),
    [isDark, primaryColor]
  );

  const focusNext = (e, nextRef) => {
    if (e.key === "Enter") {
      e.preventDefault();
      nextRef?.current?.focus?.();
    }
  };

  useEffect(() => {
    nameRef.current?.focus();
  }, []);

  // Fetch products dynamically for ProductSearchInput
  const fetchProductsCatalog = async (q = "") => {
    try {
      const res = await axios.get("/api/products/search", {
        params: { q: q || "", limit: 200 },
      });
      const list = Array.isArray(res.data?.data)
        ? res.data.data
        : Array.isArray(res.data)
        ? res.data
        : [];
      setProductsCatalog(list);
    } catch {
      // ignore
    }
  };

  useEffect(() => {
    if (!form.is_regular || productsCatalog.length > 0) return;
    fetchProductsCatalog("");
  }, [form.is_regular, productsCatalog.length]);

  useEffect(() => {
    if (initialData) {
      setForm({
        name: initialData.name || "",
        phone: initialData.phone || "",
        email: initialData.email || "",
        address: initialData.address || "",
        tax_status: initialData.tax_status || "unregistered",
        tax_number: initialData.tax_number || "",
        credit_limit: initialData.credit_limit ?? "",
        credit_days: initialData.credit_days ?? 30,
        credit_status: initialData.credit_status || "active",
        opening_balance: "",
        is_regular: Boolean(initialData.is_regular),
        refill_cycle: initialData.refill_cycle || "monthly",
        refill_custom_days: initialData.refill_custom_days ?? 15,
        reminder_lead_days: initialData.reminder_lead_days ?? 2,
        next_refill_date:
          (initialData.next_refill_date || "").slice(0, 10) ||
          computeDefaultNextDate(initialData.refill_cycle || "monthly"),
        reminder_language: initialData.reminder_language || "english",
        regular_notes: initialData.regular_notes || "",
      });

      setRegularItems(
        mapInitialRegularItems(
          initialData.regular_items || initialData.regularItems || []
        )
      );
    }
  }, [initialData]);

  // Ctrl+S shortcut
  useEffect(() => {
    const onKeyDown = (e) => {
      if ((e.ctrlKey || e.metaKey) && !e.altKey && !e.shiftKey && (e.key || "").toLowerCase() === "s") {
        e.preventDefault();
        handleSubmit(e);
      }
    };
    window.addEventListener("keydown", onKeyDown);
    return () => window.removeEventListener("keydown", onKeyDown);
  });

  // =====================================================================
  // SALE INVOICE STYLE REPEATER HANDLERS & KEYBOARD NAVIGATION
  // =====================================================================
  const COLS = ["product", "pack_quantity", "unit_quantity", "dosage_notes"];

  const focusCell = (row, col) => {
    const map = {
      product: productRefs,
      pack_quantity: packQtyRefs,
      unit_quantity: unitQtyRefs,
      dosage_notes: dosageRefs,
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
  };

  const addRow = () => {
    setRegularItems((prev) => [...prev, createEmptyRegularRow()]);
  };

  const removeRow = (i) => {
    setRegularItems((prev) => {
      if (prev.length <= 1) {
        return [createEmptyRegularRow()];
      }
      return prev.filter((_, idx) => idx !== i);
    });
  };

  const handleProductSelect = (rowIndex, val) => {
    const prodObj =
      typeof val === "object" && val !== null
        ? val
        : productsCatalog.find((p) => String(p.id) === String(val)) || null;

    if (!prodObj || !prodObj.id) {
      setRegularItems((prev) => {
        const next = [...prev];
        next[rowIndex] = createEmptyRegularRow();
        return next;
      });
      return;
    }

    // Check if already selected in another row
    const duplicateIdx = regularItems.findIndex(
      (r, idx) =>
        idx !== rowIndex && String(r.product_id) === String(prodObj.id)
    );
    if (duplicateIdx >= 0) {
      toast.error(
        `"${prodObj.name}" is already in Row ${duplicateIdx + 1}.`,
        { id: "dup-reg-prod" }
      );
      setTimeout(() => focusCell(duplicateIdx, "unit_quantity"), 40);
      return;
    }

    // Ensure product is in local catalog state so ProductSearchInput displays its name
    setProductsCatalog((prev) => {
      if (prev.some((p) => String(p.id) === String(prodObj.id))) return prev;
      return [prodObj, ...prev];
    });

    setRegularItems((prev) => {
      const next = [...prev];
      const current = next[rowIndex] || createEmptyRegularRow();
      const packSize = Math.max(1, Number(prodObj.pack_size ?? 1));

      let nextPackQty = current.pack_quantity ?? "";
      let nextUnitQty = current.unit_quantity ?? "";

      if (Number(nextPackQty) > 0) {
        nextUnitQty = String(
          Math.max(1, Math.round(Number(nextPackQty) * packSize))
        );
      } else if (Number(nextUnitQty) > 0) {
        nextPackQty = formatPackFromUnits(nextUnitQty, packSize);
      } else {
        nextPackQty = "1";
        nextUnitQty = String(packSize);
      }

      next[rowIndex] = {
        ...current,
        product_id: Number(prodObj.id),
        product: prodObj,
        pack_size: prodObj.pack_size ?? "",
        current_quantity: prodObj.quantity ?? 0,
        pack_quantity: nextPackQty,
        unit_quantity: nextUnitQty,
      };
      return next;
    });

    setTimeout(() => {
      focusCell(rowIndex, "pack_quantity");
    }, 40);
  };

  const handleRowFieldChange = (rowIndex, field, rawValue) => {
    setRegularItems((prev) => {
      const next = [...prev];
      const row = { ...next[rowIndex] };
      const prod =
        productsCatalog.find((p) => String(p.id) === String(row.product_id)) ||
        row.product ||
        null;
      const packSize = Math.max(
        1,
        Number(prod?.pack_size ?? row.pack_size ?? 1)
      );

      if (field === "pack_quantity") {
        const str = String(rawValue ?? "");
        if (str !== "" && !/^\d*\.?\d*$/.test(str)) {
          return prev;
        }
        row.pack_quantity = str;
        if (str === "" || str === ".") {
          row.unit_quantity = "";
        } else {
          const packNum = Number(str);
          row.unit_quantity =
            packNum > 0 ? String(Math.round(packNum * packSize)) : "0";
        }
      } else if (field === "unit_quantity") {
        const str = String(rawValue ?? "").replace(/[^\d]/g, "");
        row.unit_quantity = str;
        if (str === "") {
          row.pack_quantity = "";
        } else {
          const unitNum = Number(str);
          row.pack_quantity =
            unitNum > 0 ? formatPackFromUnits(unitNum, packSize) : "0";
        }
      } else {
        row[field] = rawValue;
      }

      next[rowIndex] = row;
      return next;
    });
  };

  const moveSameCol = (row, col, dir) => {
    const lastIdx = regularItems.length - 1;
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
    if (i < COLS.length - 1) {
      focusCell(row, COLS[i + 1]);
    } else {
      const lastIdx = regularItems.length - 1;
      if (row === lastIdx) {
        addRow();
        setTimeout(() => focusCell(row + 1, COLS[0]), 40);
      } else {
        focusCell(row + 1, COLS[0]);
      }
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

  const validRegularItemsCount = useMemo(
    () => regularItems.filter((r) => Boolean(r.product_id)).length,
    [regularItems]
  );

  const handleSubmit = (e) => {
    if (e?.preventDefault) e.preventDefault();
    if (saving) return;

    const filledItems = regularItems
      .filter((r) => Boolean(r.product_id))
      .map((r) => {
        const prod =
          productsCatalog.find(
            (p) => String(p.id) === String(r.product_id)
          ) ||
          r.product ||
          null;
        const packSize = Math.max(
          1,
          Number(prod?.pack_size ?? r.pack_size ?? 1)
        );
        const rawPack = Math.max(0, parseFloat(r.pack_quantity) || 0);
        const rawUnit = Math.max(0, parseInt(r.unit_quantity, 10) || 0);
        const resolvedUnitQty =
          rawUnit > 0
            ? rawUnit
            : rawPack > 0
            ? Math.max(1, Math.round(rawPack * packSize))
            : packSize;
        const resolvedPackQty = Math.floor(resolvedUnitQty / packSize);

        return {
          product_id: Number(r.product_id),
          pack_quantity: resolvedPackQty,
          unit_quantity: resolvedUnitQty,
          dosage_notes: (r.dosage_notes || "").trim() || null,
        };
      });

    const payload = {
      ...form,
      credit_limit:
        form.credit_limit === "" || form.credit_limit === null
          ? null
          : Number(form.credit_limit),
      credit_days:
        form.credit_days === "" || form.credit_days === null
          ? 30
          : Number(form.credit_days),
      is_regular: Boolean(form.is_regular),
      refill_cycle: form.is_regular ? form.refill_cycle || "monthly" : null,
      refill_custom_days:
        form.is_regular && form.refill_cycle === "custom"
          ? Math.max(1, Number(form.refill_custom_days || 15))
          : null,
      reminder_lead_days: form.is_regular
        ? Math.max(0, Number(form.reminder_lead_days ?? 2))
        : 2,
      next_refill_date: form.is_regular ? form.next_refill_date || null : null,
      reminder_language: form.reminder_language || "english",
      regular_notes: form.regular_notes || null,
      regular_items: form.is_regular ? filledItems : [],
    };

    onSubmit?.(payload);
  };

  return (
    <GlassCard className="p-5">
      <form id="customer-form" onSubmit={handleSubmit} className="space-y-6">
        {/* =============================================================== */}
        {/* SECTION 1: BASIC CUSTOMER & CREDIT INFORMATION                  */}
        {/* =============================================================== */}
        <fieldset className="space-y-4">
          <legend className="text-sm font-bold text-slate-800 dark:text-slate-100 border-b border-slate-200/70 dark:border-slate-700/70 pb-2 w-full">
            Customer Profile & Credit Terms
          </legend>

          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
            <div>
              <label
                htmlFor="customer-name"
                className="block text-xs font-semibold text-slate-700 dark:text-slate-200 mb-1"
              >
                Customer Name *
              </label>
              <GlassInput
                id="customer-name"
                name="name"
                ref={nameRef}
                type="text"
                autoComplete="name"
                placeholder="e.g. Muhammad Tariq / Al-Shifa Clinic"
                value={form.name}
                onChange={(e) =>
                  setForm((p) => ({ ...p, name: e.target.value }))
                }
                onKeyDown={(e) => focusNext(e, phoneRef)}
                className="w-full h-[38px]"
                required
              />
            </div>

            <div>
              <label
                htmlFor="customer-phone"
                className="block text-xs font-semibold text-slate-700 dark:text-slate-200 mb-1"
              >
                WhatsApp / Phone Number
              </label>
              <GlassInput
                id="customer-phone"
                name="phone"
                ref={phoneRef}
                type="tel"
                autoComplete="tel"
                autoCorrect="off"
                autoCapitalize="off"
                spellCheck={false}
                placeholder="e.g. 0300-1234567"
                value={form.phone}
                onChange={(e) =>
                  setForm((p) => ({ ...p, phone: e.target.value }))
                }
                onKeyDown={(e) => focusNext(e, emailRef)}
                className="w-full h-[38px]"
              />
            </div>

            <div>
              <label
                htmlFor="customer-email"
                className="block text-xs font-semibold text-slate-700 dark:text-slate-200 mb-1"
              >
                Email (Optional)
              </label>
              <GlassInput
                id="customer-email"
                name="email"
                ref={emailRef}
                type="email"
                autoComplete="email"
                autoCorrect="off"
                autoCapitalize="off"
                spellCheck={false}
                placeholder="customer@example.com"
                value={form.email}
                onChange={(e) =>
                  setForm((p) => ({ ...p, email: e.target.value }))
                }
                onKeyDown={(e) => focusNext(e, addressRef)}
                className="w-full h-[38px]"
              />
            </div>

            <div className="md:col-span-2 lg:col-span-3">
              <label
                htmlFor="customer-address"
                className="block text-xs font-semibold text-slate-700 dark:text-slate-200 mb-1"
              >
                Address
              </label>
              <GlassInput
                id="customer-address"
                name="address"
                ref={addressRef}
                type="text"
                autoComplete="street-address"
                placeholder="House / Street / Clinic / Area Address"
                value={form.address}
                onChange={(e) =>
                  setForm((p) => ({ ...p, address: e.target.value }))
                }
                onKeyDown={(e) => focusNext(e, taxStatusSelectRef)}
                className="w-full h-[38px]"
              />
            </div>

            <div>
              <label
                htmlFor="customer-tax-status"
                className="block text-xs font-semibold text-slate-700 dark:text-slate-200 mb-1"
              >
                Tax Status
              </label>
              <Select
                inputId="customer-tax-status"
                ref={taxStatusSelectRef}
                options={TAX_STATUS_OPTIONS}
                value={
                  TAX_STATUS_OPTIONS.find(
                    (o) => o.value === (form.tax_status || "unregistered")
                  ) || TAX_STATUS_OPTIONS[0]
                }
                onChange={(opt) => {
                  setForm((p) => ({
                    ...p,
                    tax_status: opt?.value || "unregistered",
                  }));
                  setTimeout(() => taxNumberRef.current?.focus(), 20);
                }}
                isSearchable={false}
                styles={selectStyles}
                menuPortalTarget={
                  typeof document !== "undefined" ? document.body : null
                }
              />
            </div>

            <div>
              <label
                htmlFor="customer-tax-number"
                className="block text-xs font-semibold text-slate-700 dark:text-slate-200 mb-1"
              >
                NTN / STRN / CNIC Tax ID
              </label>
              <GlassInput
                id="customer-tax-number"
                name="tax_number"
                ref={taxNumberRef}
                type="text"
                autoCorrect="off"
                autoCapitalize="off"
                spellCheck={false}
                placeholder="Optional Tax Number"
                value={form.tax_number}
                onChange={(e) =>
                  setForm((p) => ({ ...p, tax_number: e.target.value }))
                }
                onKeyDown={(e) => focusNext(e, creditLimitRef)}
                className="w-full h-[38px]"
              />
            </div>

            <div>
              <label
                htmlFor="customer-credit-status"
                className="block text-xs font-semibold text-slate-700 dark:text-slate-200 mb-1"
              >
                Credit Status
              </label>
              <Select
                inputId="customer-credit-status"
                options={CREDIT_STATUS_OPTIONS}
                value={
                  CREDIT_STATUS_OPTIONS.find(
                    (o) => o.value === (form.credit_status || "active")
                  ) || CREDIT_STATUS_OPTIONS[0]
                }
                onChange={(opt) =>
                  setForm((p) => ({
                    ...p,
                    credit_status: opt?.value || "active",
                  }))
                }
                isSearchable={false}
                styles={selectStyles}
                menuPortalTarget={
                  typeof document !== "undefined" ? document.body : null
                }
              />
            </div>

            <div>
              <label
                htmlFor="customer-credit-limit"
                className="block text-xs font-semibold text-slate-700 dark:text-slate-200 mb-1"
              >
                Credit Limit (Rs.)
              </label>
              <GlassInput
                id="customer-credit-limit"
                name="credit_limit"
                ref={creditLimitRef}
                type="number"
                min="0"
                step="any"
                placeholder="e.g. 50000 (empty or 0 = unlimited)"
                value={form.credit_limit}
                onChange={(e) =>
                  setForm((p) => ({ ...p, credit_limit: e.target.value }))
                }
                onKeyDown={(e) => focusNext(e, creditDaysRef)}
                className="w-full h-[38px]"
              />
            </div>

            <div>
              <label
                htmlFor="customer-credit-days"
                className="block text-xs font-semibold text-slate-700 dark:text-slate-200 mb-1"
              >
                Credit Days
              </label>
              <GlassInput
                id="customer-credit-days"
                name="credit_days"
                ref={creditDaysRef}
                type="number"
                min="0"
                max="365"
                placeholder="e.g. 30"
                value={form.credit_days}
                onChange={(e) =>
                  setForm((p) => ({ ...p, credit_days: e.target.value }))
                }
                onKeyDown={(e) =>
                  !isEdit ? focusNext(e, openingBalanceRef) : undefined
                }
                className="w-full h-[38px]"
              />
            </div>

            {!isEdit && (
              <div>
                <label
                  htmlFor="customer-opening-balance"
                  className="block text-xs font-semibold text-slate-700 dark:text-slate-200 mb-1"
                >
                  Opening Balance Receivable (Rs.)
                </label>
                <GlassInput
                  id="customer-opening-balance"
                  name="opening_balance"
                  ref={openingBalanceRef}
                  type="number"
                  min="0"
                  step="0.01"
                  placeholder="0.00 (Optional initial receivable)"
                  value={form.opening_balance}
                  onChange={(e) =>
                    setForm((p) => ({ ...p, opening_balance: e.target.value }))
                  }
                  className="w-full h-[38px]"
                />
              </div>
            )}
          </div>
        </fieldset>

        {/* =============================================================== */}
        {/* SECTION 2: REGULAR CUSTOMER & WHATSAPP MEDICINE REFILL REMINDER */}
        {/* =============================================================== */}
        <fieldset className="rounded-2xl border-2 border-emerald-500/30 dark:border-emerald-500/40 bg-gradient-to-br from-emerald-50/40 via-white to-teal-50/30 dark:from-slate-800/90 dark:via-slate-800 dark:to-emerald-950/20 p-5 space-y-5">
          <div className="flex flex-wrap items-center justify-between gap-4">
            <div className="flex items-start gap-3">
              <div className="p-2.5 rounded-xl bg-emerald-600 text-white shadow-sm shrink-0">
                <BellAlertIcon className="w-5 h-5" />
              </div>
              <div>
                <legend className="text-sm font-bold text-slate-900 dark:text-slate-100">
                  Regular Customer & Recurring Medicine / Product Reminder
                </legend>
                <p className="text-xs text-slate-500 dark:text-slate-400 mt-0.5">
                  Enable this for monthly/weekly medicine patients or regular buyers to send prior WhatsApp collection reminders when their products are ready.
                </p>
              </div>
            </div>

            <label
              htmlFor="customer-is-regular"
              className="inline-flex items-center gap-2.5 cursor-pointer select-none px-3.5 py-2 rounded-xl bg-white dark:bg-slate-900 border border-emerald-200 dark:border-emerald-800 shadow-2xs"
            >
              <input
                id="customer-is-regular"
                name="is_regular"
                type="checkbox"
                checked={Boolean(form.is_regular)}
                onChange={(e) => {
                  const checked = e.target.checked;
                  setForm((p) => ({
                    ...p,
                    is_regular: checked,
                    next_refill_date:
                      p.next_refill_date ||
                      computeDefaultNextDate(
                        p.refill_cycle || "monthly",
                        p.refill_custom_days
                      ),
                  }));
                }}
                className="w-4 h-4 rounded text-emerald-600 focus:ring-emerald-500"
              />
              <span className="text-xs font-bold text-emerald-800 dark:text-emerald-300">
                {form.is_regular
                  ? "Regular Customer Active"
                  : "Save as Regular Customer"}
              </span>
            </label>
          </div>

          {form.is_regular && (
            <div className="space-y-5 pt-2 border-t border-emerald-200/60 dark:border-slate-700">
              {/* Refill Frequency Radio Buttons (< 6 options -> visible radio group) */}
              <div>
                <span className="block text-xs font-semibold text-slate-700 dark:text-slate-200 mb-2">
                  Refill / Collection Frequency *
                </span>
                <div
                  role="radiogroup"
                  aria-label="Refill Frequency"
                  className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-2.5"
                >
                  {REFILL_CYCLE_OPTIONS.map((opt) => {
                    const active = form.refill_cycle === opt.value;
                    return (
                      <label
                        key={opt.value}
                        className={`flex items-center gap-2.5 p-3 rounded-xl border text-xs font-semibold cursor-pointer transition-all ${
                          active
                            ? "border-emerald-500 bg-emerald-50/90 text-emerald-900 dark:bg-emerald-900/30 dark:text-emerald-200 dark:border-emerald-500 shadow-2xs"
                            : "border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-900 text-slate-700 dark:text-slate-300 hover:border-emerald-300"
                        }`}
                      >
                        <input
                          type="radio"
                          name="refill_cycle"
                          value={opt.value}
                          checked={active}
                          onChange={() => {
                            setForm((p) => ({
                              ...p,
                              refill_cycle: opt.value,
                              next_refill_date: computeDefaultNextDate(
                                opt.value,
                                p.refill_custom_days
                              ),
                            }));
                          }}
                          className="text-emerald-600 focus:ring-emerald-500"
                        />
                        <span>{opt.label}</span>
                      </label>
                    );
                  })}
                </div>
              </div>

              {/* Schedule Dates & Language */}
              <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4">
                {form.refill_cycle === "custom" && (
                  <div>
                    <label
                      htmlFor="customer-refill-custom-days"
                      className="block text-xs font-semibold text-slate-700 dark:text-slate-200 mb-1"
                    >
                      Custom Interval (Days) *
                    </label>
                    <GlassInput
                      id="customer-refill-custom-days"
                      name="refill_custom_days"
                      type="number"
                      min="1"
                      max="365"
                      value={form.refill_custom_days}
                      onChange={(e) => {
                        const val = e.target.value;
                        setForm((p) => ({
                          ...p,
                          refill_custom_days: val,
                          next_refill_date: computeDefaultNextDate("custom", val),
                        }));
                      }}
                      className="w-full h-[38px]"
                    />
                  </div>
                )}

                <div>
                  <label
                    htmlFor="customer-next-refill-date"
                    className="block text-xs font-semibold text-slate-700 dark:text-slate-200 mb-1"
                  >
                    Next Collection / Refill Date *
                  </label>
                  <GlassInput
                    id="customer-next-refill-date"
                    name="next_refill_date"
                    type="date"
                    value={form.next_refill_date || ""}
                    onChange={(e) =>
                      setForm((p) => ({
                        ...p,
                        next_refill_date: e.target.value,
                      }))
                    }
                    className="w-full h-[38px]"
                  />
                </div>

                <div>
                  <label
                    htmlFor="customer-reminder-lead-days"
                    className="block text-xs font-semibold text-slate-700 dark:text-slate-200 mb-1"
                  >
                    Remind Prior (Days Before Due)
                  </label>
                  <GlassInput
                    id="customer-reminder-lead-days"
                    name="reminder_lead_days"
                    type="number"
                    min="0"
                    max="60"
                    value={form.reminder_lead_days}
                    onChange={(e) =>
                      setForm((p) => ({
                        ...p,
                        reminder_lead_days: e.target.value,
                      }))
                    }
                    className="w-full h-[38px]"
                  />
                  <span className="block text-[11px] text-slate-500 dark:text-slate-400 mt-1">
                    e.g. 2 = alerts you 2 days before due date
                  </span>
                </div>

                <div>
                  <span className="block text-xs font-semibold text-slate-700 dark:text-slate-200 mb-1">
                    Preferred WhatsApp Format
                  </span>
                  <div
                    role="radiogroup"
                    aria-label="Preferred WhatsApp Format"
                    className="grid grid-cols-2 gap-2 h-[38px]"
                  >
                    {[
                      { value: "english", label: "English" },
                      { value: "urdu", label: "اردو (Urdu)" },
                    ].map((langOpt) => {
                      const active = form.reminder_language === langOpt.value;
                      return (
                        <label
                          key={langOpt.value}
                          className={`flex items-center justify-center gap-1.5 rounded-lg border text-xs font-semibold cursor-pointer transition-all ${
                            active
                              ? "border-emerald-500 bg-emerald-600 text-white"
                              : "border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-900 text-slate-700 dark:text-slate-300"
                          }`}
                        >
                          <input
                            type="radio"
                            name="reminder_language"
                            value={langOpt.value}
                            checked={active}
                            onChange={() =>
                              setForm((p) => ({
                                ...p,
                                reminder_language: langOpt.value,
                              }))
                            }
                            className="sr-only"
                          />
                          <span>{langOpt.label}</span>
                        </label>
                      );
                    })}
                  </div>
                </div>

                <div className="md:col-span-2 lg:col-span-4">
                  <label
                    htmlFor="customer-regular-notes"
                    className="block text-xs font-semibold text-slate-700 dark:text-slate-200 mb-1"
                  >
                    Special Instructions / Prescription Notes (Optional)
                  </label>
                  <GlassInput
                    id="customer-regular-notes"
                    name="regular_notes"
                    type="text"
                    placeholder="e.g. Monthly cardiac & diabetes medicines — keep ready on the 1st of every month"
                    value={form.regular_notes}
                    onChange={(e) =>
                      setForm((p) => ({ ...p, regular_notes: e.target.value }))
                    }
                    className="w-full h-[38px]"
                  />
                </div>
              </div>

              {/* =========================================================== */}
              {/* SALE INVOICE STYLE REPEATER FOR REGULAR MEDICINES / PRODUCTS */}
              {/* =========================================================== */}
              <div
                className={`rounded-xl overflow-hidden border ${
                  isDark
                    ? "border-slate-700 bg-slate-800"
                    : "border-gray-200 bg-white shadow-xs"
                }`}
              >
                {/* Repeater Header Bar (Same style as Sale Invoice) */}
                <div
                  className={`px-3.5 py-2 border-b flex flex-wrap items-center justify-between gap-2 ${
                    isDark
                      ? "bg-slate-800/90 border-slate-700"
                      : "bg-slate-50/90 border-gray-200"
                  }`}
                >
                  <div className="flex items-center gap-2">
                    <CubeIcon className="w-4 h-4 text-emerald-600 dark:text-emerald-400" />
                    <h4 className="text-xs font-bold uppercase tracking-wider text-slate-800 dark:text-slate-200">
                      Customer&apos;s Regular Medicines / Products ({validRegularItemsCount})
                    </h4>
                  </div>

                  <div className="flex items-center gap-3 text-[11px] text-slate-500 dark:text-slate-400">
                    <span className="inline-flex items-center gap-1">
                      <span className="w-2 h-2 rounded-full bg-blue-500" />
                      <span>Editable (Enter / Arrows to navigate)</span>
                    </span>
                    <span className="inline-flex items-center gap-1">
                      <span className="w-2 h-2 rounded-full bg-slate-400" />
                      <span>Auto / Read-only</span>
                    </span>
                  </div>
                </div>

                {/* Repeater Table */}
                <div
                  ref={itemsScrollRef}
                  className="sale-entry-items overflow-x-auto relative"
                >
                  <table
                    className="invoice-repeater-table w-full min-w-[680px] text-[11px] lg:table-fixed border-collapse"
                    autoComplete="off"
                  >
                    <thead
                      className={`sticky top-0 z-10 ${
                        isDark
                          ? "bg-slate-800/95 border-slate-700"
                          : "bg-white/95 border-gray-200"
                      } border-b`}
                    >
                      <tr className="[&>th]:text-left">
                        <th
                          className={`w-8 text-center ${
                            isDark ? "text-rose-400" : "text-red-600"
                          }`}
                        >
                          DEL
                        </th>
                        <th className="w-8 text-center sale-th-readonly">#</th>
                        <th className="min-w-[260px] w-[40%] sale-th-editable">
                          Product *
                        </th>
                        <th
                          className="w-16 text-center sale-th-readonly"
                          title="Pack Size (Auto)"
                        >
                          PSize
                        </th>
                        <th
                          className="w-20 text-center sale-th-readonly"
                          title="Available Units in Stock (Auto)"
                        >
                          Avail
                        </th>
                        <th className="w-20 text-center sale-th-editable">
                          Pack Qty
                        </th>
                        <th className="w-20 text-center sale-th-editable">
                          Unit Qty *
                        </th>
                        <th className="min-w-[160px] sale-th-editable">
                          Dosage / Note
                        </th>
                        <th className="w-8 text-center">+</th>
                      </tr>
                    </thead>

                    <tbody className="[&>tr>td]:py-1.5 [&>tr>td]:px-1.5">
                      {regularItems.map((it, i) => {
                        const prod =
                          productsCatalog.find(
                            (p) => String(p.id) === String(it.product_id)
                          ) ||
                          it.product ||
                          null;
                        const packSize = Math.max(
                          1,
                          Number(prod?.pack_size ?? it.pack_size ?? 1)
                        );
                        const availUnits =
                          prod?.quantity ?? it.current_quantity ?? "";
                        const reqUnits =
                          Number(it.unit_quantity || 0) > 0
                            ? Number(it.unit_quantity)
                            : Math.round(
                                Number(it.pack_quantity || 0) * packSize
                              );
                        const isOverStock =
                          it.product_id &&
                          availUnits !== "" &&
                          reqUnits > Number(availUnits);

                        return (
                          <tr
                            key={it.id}
                            className={`invoice-repeater-row border-b ${
                              isDark ? "border-slate-700/80" : "border-gray-100"
                            }`}
                          >
                            {/* DEL */}
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

                            {/* # */}
                            <td
                              data-label="Item #"
                              className={`invoice-cell-index text-center font-semibold text-[11px] ${
                                isDark ? "text-slate-400" : "text-gray-500"
                              }`}
                            >
                              {i + 1}
                            </td>

                            {/* Product * */}
                            <td
                              data-label="Product *"
                              className="invoice-cell-product"
                            >
                              <div
                                ref={(el) => (productRefs.current[i] = el)}
                                className="flex items-center gap-1"
                              >
                                <div className="flex-1 min-w-0">
                                  <ProductSearchInput
                                    value={
                                      prod ||
                                      (it.product_id ? it.product_id : null)
                                    }
                                    onChange={(val) =>
                                      handleProductSelect(i, val)
                                    }
                                    onKeyDown={(e) => onKeyNav(e, i, "product")}
                                    products={productsCatalog}
                                    onRefreshProducts={fetchProductsCatalog}
                                  />
                                </div>
                              </div>
                            </td>

                            {/* PSize (Read-only) */}
                            <td data-label="Pack Size" className="text-center">
                              <input
                                type="text"
                                readOnly
                                tabIndex={-1}
                                value={
                                  prod?.pack_size ?? it.pack_size ?? ""
                                }
                                placeholder="—"
                                autoComplete="off"
                                className="sale-readonly-field w-full h-7 rounded-md px-1.5 text-center"
                              />
                            </td>

                            {/* Avail (Read-only) */}
                            <td data-label="Available" className="text-center">
                              <input
                                type="text"
                                readOnly
                                tabIndex={-1}
                                value={availUnits !== "" ? availUnits : ""}
                                placeholder="—"
                                autoComplete="off"
                                className={`sale-readonly-field w-full h-7 rounded-md px-1.5 text-center font-mono ${
                                  isOverStock
                                    ? "!text-amber-600 dark:!text-amber-400 font-bold"
                                    : ""
                                }`}
                              />
                            </td>

                            {/* Pack Qty */}
                            <td data-label="Pack Qty" className="text-center">
                              <input
                                ref={(el) => (packQtyRefs.current[i] = el)}
                                type="text"
                                inputMode="decimal"
                                placeholder="0"
                                aria-label={`Row ${i + 1} Pack Quantity`}
                                value={it.pack_quantity ?? ""}
                                onChange={(e) =>
                                  handleRowFieldChange(
                                    i,
                                    "pack_quantity",
                                    e.target.value
                                  )
                                }
                                onKeyDown={(e) =>
                                  onKeyNav(e, i, "pack_quantity")
                                }
                                onFocus={(e) => e.target.select()}
                                autoComplete="off"
                                className={`w-full h-7 border rounded-md px-1.5 text-center font-bold ${
                                  isDark
                                    ? "bg-slate-700 border-slate-500 text-slate-100"
                                    : "bg-white border-gray-300 text-gray-900"
                                }`}
                              />
                            </td>

                            {/* Unit Qty * */}
                            <td data-label="Unit Qty *" className="text-center">
                              <input
                                ref={(el) => (unitQtyRefs.current[i] = el)}
                                type="text"
                                inputMode="numeric"
                                placeholder="0"
                                aria-label={`Row ${i + 1} Unit Quantity`}
                                value={it.unit_quantity ?? ""}
                                onChange={(e) =>
                                  handleRowFieldChange(
                                    i,
                                    "unit_quantity",
                                    e.target.value
                                  )
                                }
                                onKeyDown={(e) =>
                                  onKeyNav(e, i, "unit_quantity")
                                }
                                onFocus={(e) => e.target.select()}
                                autoComplete="off"
                                className={
                                  `w-full h-7 border rounded-md px-1.5 text-center font-bold ${
                                    isDark
                                      ? "bg-slate-700 border-slate-500 text-slate-100"
                                      : "bg-white border-gray-300 text-gray-900"
                                  } ` +
                                  (isOverStock
                                    ? "!border-amber-500 ring-1 ring-amber-400"
                                    : "")
                                }
                              />
                            </td>

                            {/* Dosage / Note */}
                            <td data-label="Dosage / Note">
                              <input
                                ref={(el) => (dosageRefs.current[i] = el)}
                                type="text"
                                placeholder="e.g. 1+0+1 / After meal"
                                aria-label={`Row ${i + 1} Dosage or Note`}
                                value={it.dosage_notes ?? ""}
                                onChange={(e) =>
                                  handleRowFieldChange(
                                    i,
                                    "dosage_notes",
                                    e.target.value
                                  )
                                }
                                onKeyDown={(e) =>
                                  onKeyNav(e, i, "dosage_notes")
                                }
                                onFocus={(e) => e.target.select()}
                                autoComplete="off"
                                className={`w-full h-7 border rounded-md px-2 text-xs ${
                                  isDark
                                    ? "bg-slate-700 border-slate-500 text-slate-100"
                                    : "bg-white border-gray-300 text-gray-900"
                                }`}
                              />
                            </td>

                            {/* + Add Row */}
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
          )}
        </fieldset>

        <div className="flex items-center justify-end gap-3 pt-2 border-t border-slate-200/70 dark:border-slate-700/70">
          <span className="text-xs text-slate-400">
            Shortcut: Ctrl + S to Save
          </span>
          <GlassBtn
            type="submit"
            variant="primary"
            disabled={saving}
            className="h-10 px-5 theme-btn-primary"
          >
            {saving ? (
              <ArrowPathIcon className="w-4 h-4 animate-spin" />
            ) : (
              <CheckCircleIcon className="w-4 h-4" />
            )}
            <span>{saving ? "Saving..." : submitLabel}</span>
          </GlassBtn>
        </div>
      </form>
    </GlassCard>
  );
}
