import React, { useState, useEffect, useRef, useMemo } from "react";
import Select from "react-select";
import { CheckCircleIcon, ArrowPathIcon } from "@heroicons/react/24/solid";
import { GlassCard, GlassInput, GlassBtn } from "@/components/Glass.jsx";
import {
  ExpiryReturnPolicyFields,
  getReactSelectStyles,
} from "@/components/ExpiryReturnPolicyFields.jsx";
import { useTheme } from "@/context/ThemeContext";

const TAX_STATUS_OPTIONS = [
  { value: "unregistered", label: "Unregistered" },
  { value: "registered", label: "Tax Registered" },
  { value: "exempt", label: "Tax Exempt" },
];

export default function SupplierForm({
  initialData = null,
  onSubmit,
  saving = false,
  isEdit = false,
  submitLabel = "Save Supplier",
}) {
  const { isDark, theme } = useTheme();
  const primaryColor = theme?.primary_color || "#3b82f6";

  const [form, setForm] = useState({
    name: initialData?.name || "",
    address: initialData?.address || "",
    phone: initialData?.phone || "",
    email: initialData?.email || "",
    tax_number: initialData?.tax_number || "",
    tax_status: initialData?.tax_status || "unregistered",
    credit_limit: initialData?.credit_limit ?? "",
    credit_days: initialData?.credit_days ?? "",
    opening_balance: "",
    expiry_return_policy: initialData?.expiry_return_policy || "before_expiry",
    expiry_return_months: initialData?.expiry_return_months ?? 3,
    expiry_return_days: initialData?.expiry_return_days ?? 90,
    expiry_return_notes: initialData?.expiry_return_notes || "",
  });

  const nameRef = useRef(null);
  const phoneRef = useRef(null);
  const emailRef = useRef(null);
  const addressRef = useRef(null);
  const taxStatusSelectRef = useRef(null);
  const taxNumberRef = useRef(null);
  const creditLimitRef = useRef(null);
  const creditDaysRef = useRef(null);
  const openingBalanceRef = useRef(null);
  const policySelectRef = useRef(null);
  const notesInputRef = useRef(null);

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

  useEffect(() => {
    if (initialData) {
      setForm({
        name: initialData.name || "",
        address: initialData.address || "",
        phone: initialData.phone || "",
        email: initialData.email || "",
        tax_number: initialData.tax_number || "",
        tax_status: initialData.tax_status || "unregistered",
        credit_limit: initialData.credit_limit ?? "",
        credit_days: initialData.credit_days ?? "",
        opening_balance: "",
        expiry_return_policy: initialData.expiry_return_policy || "before_expiry",
        expiry_return_months: initialData.expiry_return_months ?? 3,
        expiry_return_days: initialData.expiry_return_days ?? 90,
        expiry_return_notes: initialData.expiry_return_notes || "",
      });
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

  const handleSubmit = (e) => {
    if (e?.preventDefault) e.preventDefault();
    if (saving) return;
    onSubmit?.(form);
  };

  return (
    <GlassCard className="p-5">
      <form id="supplier-form" onSubmit={handleSubmit} className="space-y-5">
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
          <div>
            <label className="block text-xs font-semibold text-slate-700 dark:text-slate-200 mb-1">
              Supplier Name *
            </label>
            <GlassInput
              ref={nameRef}
              type="text"
              placeholder="e.g. Premier Distributors"
              value={form.name}
              onChange={(e) => setForm((p) => ({ ...p, name: e.target.value }))}
              onKeyDown={(e) => focusNext(e, phoneRef)}
              className="w-full h-[38px]"
              required
            />
          </div>

          <div>
            <label className="block text-xs font-semibold text-slate-700 dark:text-slate-200 mb-1">
              Phone Number
            </label>
            <GlassInput
              ref={phoneRef}
              type="text"
              placeholder="e.g. 0300-1234567"
              value={form.phone}
              onChange={(e) => setForm((p) => ({ ...p, phone: e.target.value }))}
              onKeyDown={(e) => focusNext(e, emailRef)}
              className="w-full h-[38px]"
            />
          </div>

          <div>
            <label className="block text-xs font-semibold text-slate-700 dark:text-slate-200 mb-1">
              Email (Optional)
            </label>
            <GlassInput
              ref={emailRef}
              type="email"
              placeholder="supplier@example.com"
              value={form.email}
              onChange={(e) => setForm((p) => ({ ...p, email: e.target.value }))}
              onKeyDown={(e) => focusNext(e, addressRef)}
              className="w-full h-[38px]"
            />
          </div>

          <div className="md:col-span-2 lg:col-span-3">
            <label className="block text-xs font-semibold text-slate-700 dark:text-slate-200 mb-1">
              Address
            </label>
            <GlassInput
              ref={addressRef}
              type="text"
              placeholder="Office / Warehouse Address"
              value={form.address}
              onChange={(e) => setForm((p) => ({ ...p, address: e.target.value }))}
              onKeyDown={(e) => focusNext(e, taxStatusSelectRef)}
              className="w-full h-[38px]"
            />
          </div>

          <div>
            <label className="block text-xs font-semibold text-slate-700 dark:text-slate-200 mb-1">
              Tax Status
            </label>
            <Select
              ref={taxStatusSelectRef}
              options={TAX_STATUS_OPTIONS}
              value={
                TAX_STATUS_OPTIONS.find(
                  (o) => o.value === (form.tax_status || "unregistered")
                ) || TAX_STATUS_OPTIONS[0]
              }
              onChange={(opt) => {
                setForm((p) => ({ ...p, tax_status: opt?.value || "unregistered" }));
                setTimeout(() => taxNumberRef.current?.focus(), 20);
              }}
              onKeyDown={(e) => {
                if (e.key === "Enter" && !e.defaultPrevented) {
                  setTimeout(() => taxNumberRef.current?.focus(), 20);
                }
              }}
              isSearchable={false}
              styles={selectStyles}
              menuPortalTarget={
                typeof document !== "undefined" ? document.body : null
              }
            />
          </div>

          <div>
            <label className="block text-xs font-semibold text-slate-700 dark:text-slate-200 mb-1">
              NTN / STRN / Tax ID
            </label>
            <GlassInput
              ref={taxNumberRef}
              type="text"
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
            <label className="block text-xs font-semibold text-slate-700 dark:text-slate-200 mb-1">
              Credit Limit (Rs.)
            </label>
            <GlassInput
              ref={creditLimitRef}
              type="number"
              min="0"
              step="any"
              placeholder="e.g. 100000"
              value={form.credit_limit}
              onChange={(e) =>
                setForm((p) => ({ ...p, credit_limit: e.target.value }))
              }
              onKeyDown={(e) => focusNext(e, creditDaysRef)}
              className="w-full h-[38px]"
            />
          </div>

          <div>
            <label className="block text-xs font-semibold text-slate-700 dark:text-slate-200 mb-1">
              Credit Days
            </label>
            <GlassInput
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
                focusNext(e, !isEdit ? openingBalanceRef : policySelectRef)
              }
              className="w-full h-[38px]"
            />
          </div>

          {!isEdit && (
            <div>
              <label className="block text-xs font-semibold text-slate-700 dark:text-slate-200 mb-1">
                Opening Balance Payable (Rs.)
              </label>
              <GlassInput
                ref={openingBalanceRef}
                type="number"
                min="0"
                step="0.01"
                placeholder="0.00 (Optional initial payable)"
                value={form.opening_balance}
                onChange={(e) =>
                  setForm((p) => ({ ...p, opening_balance: e.target.value }))
                }
                onKeyDown={(e) => focusNext(e, policySelectRef)}
                className="w-full h-[38px]"
              />
            </div>
          )}
        </div>

        {/* Expiry Return Policy (Product Intimation) */}
        <ExpiryReturnPolicyFields
          value={form}
          onChange={(updated) => setForm((prev) => ({ ...prev, ...updated }))}
          isDark={isDark}
          primaryColor={primaryColor}
          disabled={saving}
          policySelectRef={policySelectRef}
          notesInputRef={notesInputRef}
          onEnterLastField={handleSubmit}
        />

        <div className="flex items-center justify-end gap-3 pt-2 border-t border-slate-200/70 dark:border-slate-700/70">
          <span className="text-xs text-slate-400">Shortcut: Ctrl + S to Save</span>
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

