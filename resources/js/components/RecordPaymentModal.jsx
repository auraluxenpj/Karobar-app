import React, { useState, useEffect, useMemo, useCallback } from "react";
import axios from "axios";
import toast from "react-hot-toast";
import Select from "react-select";
import {
  XMarkIcon,
  BanknotesIcon,
  CreditCardIcon,
  BuildingLibraryIcon,
  DocumentCheckIcon,
  DevicePhoneMobileIcon,
  EllipsisHorizontalCircleIcon,
  CheckIcon,
  SparklesIcon,
} from "@heroicons/react/24/solid";
import { GlassCard, GlassInput } from "@/components/Glass.jsx";
import { useCurrency } from "@/context/CurrencyContext.jsx";
import { useTheme } from "@/context/ThemeContext.jsx";
import { getThemeButtonClasses } from "@/utils/buttonStyles";
import PaymentAccountSelector from "./PaymentAccountSelector.jsx";

const PAYMENT_METHODS = [
  { value: "cash", label: "Cash", icon: BanknotesIcon },
  { value: "bank_transfer", label: "Bank Transfer", icon: BuildingLibraryIcon },
  { value: "card", label: "Credit / Debit Card", icon: CreditCardIcon },
  { value: "cheque", label: "Cheque", icon: DocumentCheckIcon },
  { value: "mobile_wallet", label: "Mobile Wallet (EasyPaisa/JazzCash)", icon: DevicePhoneMobileIcon },
  { value: "other", label: "Other", icon: EllipsisHorizontalCircleIcon },
];

export default function RecordPaymentModal({
  isOpen,
  onClose,
  partyType = "customer", // 'customer' | 'supplier'
  partyId,
  partyName = "",
  preselectedInvoiceId = null,
  onPaymentSuccess,
}) {
  const { formatCurrency } = useCurrency();
  const { isDark, theme } = useTheme();

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
  }), [theme]);

  const buttonClasses = useMemo(
    () => getThemeButtonClasses(buttonStyle, themeColors, isDark),
    [buttonStyle, themeColors, isDark]
  );
  const btnPrimary = buttonClasses.primary;
  const btnSecondary = buttonClasses.secondary;
  const btnEmerald = buttonClasses.emerald;

  const [loading, setLoading] = useState(false);
  const [submitting, setSubmitting] = useState(false);
  const [applyingCredits, setApplyingCredits] = useState(false);
  const [openInvoices, setOpenInvoices] = useState([]);
  const [availableCredits, setAvailableCredits] = useState({ total_unapplied: 0, credits: [] });

  const [paymentDate, setPaymentDate] = useState(() => new Date().toISOString().slice(0, 10));
  const [amount, setAmount] = useState("");
  const [paymentMethod, setPaymentMethod] = useState(PAYMENT_METHODS[0]);
  const [accountId, setAccountId] = useState(null);
  const [reference, setReference] = useState("");
  const [chequeNumber, setChequeNumber] = useState("");
  const [bankName, setBankName] = useState("");
  const [chequeDate, setChequeDate] = useState(() => new Date().toISOString().slice(0, 10));
  const [chequeStatus, setChequeStatus] = useState("pending");
  const [notes, setNotes] = useState("");
  const [allocations, setAllocations] = useState({}); // { [invoiceId]: allocatedAmountString }

  const selectStyles = useMemo(() => ({
    control: (base, state) => ({
      ...base,
      minHeight: "38px",
      borderRadius: 12,
      backgroundColor: isDark ? "rgba(30, 41, 59, 0.85)" : "#ffffff",
      borderColor: state.isFocused
        ? (theme?.primary_color || "#3b82f6")
        : (isDark ? "rgba(71, 85, 105, 0.7)" : "rgba(209, 213, 219, 0.8)"),
      boxShadow: state.isFocused
        ? `0 0 0 2px ${theme?.primary_color || "#3b82f6"}33`
        : "none",
      fontSize: "14px",
      color: isDark ? "#f8fafc" : "#1e293b",
    }),
    valueContainer: (base) => ({ ...base, padding: "2px 10px" }),
    input: (base) => ({ ...base, color: isDark ? "#f8fafc" : "#1e293b", margin: 0, padding: 0 }),
    singleValue: (base) => ({ ...base, color: isDark ? "#f8fafc" : "#1e293b", fontSize: "14px" }),
    menuPortal: (base) => ({ ...base, zIndex: 9999 }),
    menu: (base) => ({
      ...base,
      backgroundColor: isDark ? "#1e293b" : "#ffffff",
      borderRadius: 12,
      border: isDark ? "1px solid rgba(71, 85, 105, 0.7)" : "1px solid rgba(229, 231, 235, 1)",
      boxShadow: "0 10px 25px -5px rgba(0, 0, 0, 0.25)",
      overflow: "hidden",
      zIndex: 9999,
    }),
    option: (base, state) => ({
      ...base,
      minHeight: 38,
      backgroundColor: state.isSelected
        ? (theme?.primary_color || "#3b82f6")
        : state.isFocused
        ? (isDark ? "rgba(51, 65, 85, 0.8)" : "rgba(239, 246, 255, 1)")
        : "transparent",
      color: state.isSelected ? "#ffffff" : (isDark ? "#f8fafc" : "#1e293b"),
      cursor: "pointer",
      fontSize: "14px",
    }),
  }), [isDark, theme]);

  const fetchOpenInvoices = useCallback(async () => {
    if (!partyId) return;
    try {
      setLoading(true);
      const [invRes, credRes] = await Promise.all([
        axios.get("/api/payments/open-invoices", {
          params: { party_type: partyType, party_id: partyId },
        }),
        axios
          .get("/api/payments/available-credits", {
            params: { party_type: partyType, party_id: partyId },
          })
          .catch(() => ({ data: { total_unapplied: 0, credits: [] } })),
      ]);
      const list = invRes.data || [];
      setOpenInvoices(list);
      setAvailableCredits({
        total_unapplied: parseFloat(credRes?.data?.total_unapplied || 0),
        credits: Array.isArray(credRes?.data?.credits) ? credRes.data.credits : [],
      });

      // If preselectedInvoiceId is passed, pre-fill its full due amount
      if (preselectedInvoiceId) {
        const target = list.find((inv) => Number(inv.id) === Number(preselectedInvoiceId));
        if (target) {
          setAmount(String(target.due));
          setAllocations({ [target.id]: String(target.due) });
        }
      }
    } catch {
      toast.error("Failed to load open invoices");
    } finally {
      setLoading(false);
    }
  }, [partyId, partyType, preselectedInvoiceId]);

  useEffect(() => {
    if (isOpen && partyId) {
      setAllocations({});
      fetchOpenInvoices();
    }
  }, [isOpen, partyId, fetchOpenInvoices]);

  const numAmount = useMemo(() => Math.max(parseFloat(amount || 0) || 0, 0), [amount]);

  const totalAllocated = useMemo(() => {
    return Object.values(allocations).reduce((sum, val) => {
      const v = parseFloat(val || 0);
      return sum + (isNaN(v) ? 0 : v);
    }, 0);
  }, [allocations]);

  const unappliedCredit = useMemo(() => {
    return Math.max(round2(numAmount - totalAllocated), 0);
  }, [numAmount, totalAllocated]);

  function round2(v) {
    return Math.round((v + Number.EPSILON) * 100) / 100;
  }

  // Handle individual invoice allocation input change
  const handleAllocationChange = (invoiceId, maxDue, inputVal) => {
    if (inputVal === "") {
      setAllocations((prev) => {
        const next = { ...prev };
        delete next[invoiceId];
        return next;
      });
      return;
    }

    let val = parseFloat(inputVal);
    if (isNaN(val)) return;
    if (val < 0) val = 0;
    if (val > maxDue) {
      val = maxDue;
      toast.error(`Cannot allocate more than remaining due (${formatCurrency(maxDue)})`);
    }

    setAllocations((prev) => ({
      ...prev,
      [invoiceId]: String(val),
    }));
  };

  // Shortcut: Allocate full amount for a single invoice
  const handlePayInFull = (invoice) => {
    setAllocations((prev) => ({
      ...prev,
      [invoice.id]: String(invoice.due),
    }));
  };

  // Shortcut: Auto-allocate payment amount to oldest invoices first
  const handleAutoAllocate = () => {
    if (numAmount <= 0) {
      toast.error("Please enter a payment amount first");
      return;
    }

    let remainingToAllocate = numAmount;
    const newAllocations = {};

    for (const inv of openInvoices) {
      if (remainingToAllocate <= 0) break;
      const alloc = Math.min(inv.due, remainingToAllocate);
      if (alloc > 0) {
        newAllocations[inv.id] = String(round2(alloc));
        remainingToAllocate = round2(remainingToAllocate - alloc);
      }
    }

    setAllocations(newAllocations);
    toast.success("Payment automatically allocated across open invoices");
  };

  // Apply existing unapplied credits / credit notes directly to open invoices
  const handleApplyAvailableCredits = async () => {
    const avail = round2(parseFloat(availableCredits.total_unapplied || 0));
    if (avail <= 0 || openInvoices.length === 0) return;

    // Use currently entered allocations if within available credit, otherwise auto-build oldest-first
    let payloadAllocations = Object.entries(allocations)
      .map(([invId, val]) => ({
        invoice_id: Number(invId),
        amount: round2(parseFloat(val || 0)),
      }))
      .filter((a) => a.amount > 0);

    const currentSum = round2(payloadAllocations.reduce((s, a) => s + a.amount, 0));

    if (payloadAllocations.length === 0 || currentSum > avail) {
      let rem = avail;
      payloadAllocations = [];
      for (const inv of openInvoices) {
        if (rem <= 0) break;
        const due = round2(parseFloat(inv.due || 0));
        const slice = round2(Math.min(due, rem));
        if (slice > 0) {
          payloadAllocations.push({ invoice_id: Number(inv.id), amount: slice });
          rem = round2(rem - slice);
        }
      }
    }

    if (payloadAllocations.length === 0) {
      toast.error("No open invoice balance to apply credit against");
      return;
    }

    try {
      setApplyingCredits(true);
      const { data } = await axios.post("/api/payments/apply-credits", {
        party_type: partyType,
        party_id: partyId,
        allocations: payloadAllocations,
      });
      toast.success(
        `Applied ${formatCurrency(data.allocated_total || 0)} of existing credit to open invoices`
      );
      setAllocations({});
      await fetchOpenInvoices();
      onPaymentSuccess?.(data.payments?.[0]);
    } catch (err) {
      toast.error(err?.response?.data?.message || "Failed to apply available credit");
    } finally {
      setApplyingCredits(false);
    }
  };

  const handleSubmit = async (e) => {
    e.preventDefault();
    if (numAmount <= 0) {
      toast.error("Please enter a valid payment amount");
      return;
    }

    if (totalAllocated > numAmount) {
      toast.error("Total allocated amount exceeds the entered payment amount");
      return;
    }

    const payloadAllocations = Object.entries(allocations)
      .map(([invId, val]) => ({
        invoice_id: Number(invId),
        amount: round2(parseFloat(val || 0)),
      }))
      .filter((a) => a.amount > 0);

    const idempotencyKey = `pay-${partyType}-${partyId}-${Date.now()}-${Math.random().toString(36).substring(2, 8)}`;

    try {
      setSubmitting(true);
      const res = await axios.post("/api/payments", {
        party_type: partyType,
        party_id: partyId,
        payment_date: paymentDate,
        amount: round2(numAmount),
        payment_method: paymentMethod.value,
        account_id: accountId,
        reference: (paymentMethod.value === "cheque" ? chequeNumber.trim() || reference.trim() : reference.trim()) || null,
        cheque_number: paymentMethod.value === "cheque" ? (chequeNumber.trim() || reference.trim() || null) : undefined,
        bank_name: paymentMethod.value === "cheque" ? (bankName.trim() || null) : undefined,
        cheque_date: paymentMethod.value === "cheque" ? (chequeDate || paymentDate) : undefined,
        cheque_status: paymentMethod.value === "cheque" ? chequeStatus : undefined,
        notes: notes.trim() || null,
        idempotency_key: idempotencyKey,
        allocations: payloadAllocations,
      });

      toast.success(
        partyType === "customer"
          ? `Customer receipt ${res.data.payment.payment_number} posted successfully`
          : `Supplier payment ${res.data.payment.payment_number} posted successfully`
      );

      window.dispatchEvent(new CustomEvent("cash-drawer-changed"));
      window.dispatchEvent(new CustomEvent("accounts-changed"));
      try { localStorage.setItem("cash_drawer_sync", String(Date.now())); } catch {}
      try { localStorage.setItem("accounts_sync", String(Date.now())); } catch {}
      onPaymentSuccess?.(res.data.payment);
      onClose();
    } catch (err) {
      toast.error(err?.response?.data?.message || "Failed to record payment");
    } finally {
      setSubmitting(false);
    }
  };

  if (!isOpen) return null;

  const isCustomer = partyType === "customer";
  const title = isCustomer ? "Record Customer Payment (Receipt)" : "Record Supplier Payment (Disbursement)";

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/60 backdrop-blur-xs overflow-y-auto"
      onClick={(e) => {
        if (e.target === e.currentTarget && !submitting) onClose();
      }}
    >
      <div className="relative w-full max-w-3xl my-4 sm:my-8">
        <GlassCard
          className={`max-h-[92dvh] flex flex-col border shadow-2xl rounded-2xl overflow-hidden transition-colors ${
            isDark
              ? "bg-slate-900/95 border-slate-700/80 text-slate-100"
              : "bg-white border-gray-200 text-gray-900"
          }`}
        >
          {/* Header */}
          <div
            className={`flex items-center justify-between px-4 sm:px-6 py-4 border-b shrink-0 ${
              isDark
                ? "border-slate-700/80 bg-slate-800/50"
                : "border-gray-200 bg-gray-50"
            }`}
          >
            <div className="flex items-center gap-3">
              <div
                className={`p-2 rounded-xl border ${
                  isDark
                    ? "bg-emerald-500/20 text-emerald-400 border-emerald-500/30"
                    : "bg-emerald-50 text-emerald-600 border-emerald-200"
                }`}
              >
                <BanknotesIcon className="w-6 h-6" />
              </div>
              <div>
                <h3
                  className={`text-base font-bold ${
                    isDark ? "text-white" : "text-gray-900"
                  }`}
                >
                  {title}
                </h3>
                <p
                  className={`text-xs ${
                    isDark ? "text-slate-400" : "text-gray-500"
                  }`}
                >
                  Party:{" "}
                  <span
                    className={`font-semibold ${
                      isDark ? "text-slate-200" : "text-gray-800"
                    }`}
                  >
                    {partyName || `#${partyId}`}
                  </span>
                </p>
              </div>
            </div>
            <button
              onClick={onClose}
              disabled={submitting}
              className={`p-1.5 rounded-lg transition-colors ${
                isDark
                  ? "text-slate-400 hover:text-white hover:bg-slate-700/60"
                  : "text-gray-500 hover:text-gray-900 hover:bg-gray-200/70"
              }`}
            >
              <XMarkIcon className="w-5 h-5" />
            </button>
          </div>

          <form onSubmit={handleSubmit} className="flex-1 min-h-0 overflow-y-auto p-4 sm:p-6 space-y-6">
            {/* Top Row: Date, Amount, Method */}
            <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
              <div>
                <label
                  className={`block text-xs font-semibold mb-1 ${
                    isDark ? "text-slate-300" : "text-gray-700"
                  }`}
                >
                  Payment Date *
                </label>
                <GlassInput
                  type="date"
                  value={paymentDate}
                  onChange={(e) => setPaymentDate(e.target.value)}
                  required
                  disabled={submitting}
                  className="w-full text-sm h-10"
                />
              </div>

              <div>
                <label
                  className={`block text-xs font-semibold mb-1 ${
                    isDark ? "text-slate-300" : "text-gray-700"
                  }`}
                >
                  Payment Amount *
                </label>
                <GlassInput
                  type="number"
                  step="0.01"
                  min="0.01"
                  value={amount}
                  onChange={(e) => setAmount(e.target.value)}
                  placeholder="0.00"
                  required
                  disabled={submitting}
                  className={`w-full text-sm h-10 font-mono font-bold ${
                    isDark ? "text-emerald-400" : "text-emerald-600"
                  }`}
                />
              </div>

              <div>
                <PaymentAccountSelector
                  paymentMethod={paymentMethod?.value || "cash"}
                  accountId={accountId}
                  onChange={({ payment_method, account_id }) => {
                    const found = PAYMENT_METHODS.find((m) => m.value === payment_method) || { value: payment_method, label: payment_method };
                    setPaymentMethod(found);
                    setAccountId(account_id);
                  }}
                  layout="compact"
                  showBalance={true}
                  disabled={submitting}
                />
              </div>
            </div>

            {/* PDC Cheque Details Row (when method === 'cheque') */}
            {paymentMethod?.value === "cheque" && (
              <div
                className={`p-3.5 rounded-xl border grid grid-cols-1 md:grid-cols-4 gap-3 ${
                  isDark ? "bg-slate-800/60 border-slate-700" : "bg-blue-50/50 border-blue-200"
                }`}
              >
                <div>
                  <label className={`block text-xs font-semibold mb-1 ${isDark ? "text-slate-300" : "text-gray-700"}`}>
                    Cheque Number *
                  </label>
                  <GlassInput
                    type="text"
                    value={chequeNumber}
                    onChange={(e) => {
                      setChequeNumber(e.target.value);
                      if (!reference) setReference(e.target.value);
                    }}
                    placeholder="e.g. CHQ-90812"
                    disabled={submitting}
                    className="w-full text-xs h-9 font-mono"
                  />
                </div>
                <div>
                  <label className={`block text-xs font-semibold mb-1 ${isDark ? "text-slate-300" : "text-gray-700"}`}>
                    Bank Name
                  </label>
                  <GlassInput
                    type="text"
                    value={bankName}
                    onChange={(e) => setBankName(e.target.value)}
                    placeholder="e.g. Meezan Bank"
                    disabled={submitting}
                    className="w-full text-xs h-9"
                  />
                </div>
                <div>
                  <label className={`block text-xs font-semibold mb-1 ${isDark ? "text-slate-300" : "text-gray-700"}`}>
                    Maturity / Cheque Date
                  </label>
                  <GlassInput
                    type="date"
                    value={chequeDate}
                    onChange={(e) => setChequeDate(e.target.value)}
                    disabled={submitting}
                    className="w-full text-xs h-9"
                  />
                </div>
                <div>
                  <label className={`block text-xs font-semibold mb-1 ${isDark ? "text-slate-300" : "text-gray-700"}`}>
                    Initial Cheque Status
                  </label>
                  <select
                    value={chequeStatus}
                    onChange={(e) => setChequeStatus(e.target.value)}
                    disabled={submitting}
                    className={`w-full h-9 px-2.5 rounded-xl border text-xs font-semibold ${
                      isDark ? "bg-slate-900 border-slate-700 text-slate-100" : "bg-white border-gray-300 text-gray-800"
                    }`}
                  >
                    <option value="pending">Pending (PDC - Hold Account)</option>
                    <option value="deposited">Deposited in Bank</option>
                    <option value="cleared">Cleared Immediately</option>
                  </select>
                </div>
              </div>
            )}

            {/* Middle Row: Reference, Notes */}
            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
              <div>
                <label
                  className={`block text-xs font-semibold mb-1 ${
                    isDark ? "text-slate-300" : "text-gray-700"
                  }`}
                >
                  Reference / Cheque #
                </label>
                <GlassInput
                  type="text"
                  value={reference}
                  onChange={(e) => setReference(e.target.value)}
                  placeholder="e.g. CHQ-10492 or Bank Slip"
                  disabled={submitting}
                  className="w-full text-sm h-10"
                />
              </div>

              <div>
                <label
                  className={`block text-xs font-semibold mb-1 ${
                    isDark ? "text-slate-300" : "text-gray-700"
                  }`}
                >
                  Notes / Remarks
                </label>
                <GlassInput
                  type="text"
                  value={notes}
                  onChange={(e) => setNotes(e.target.value)}
                  placeholder="Optional internal remarks"
                  disabled={submitting}
                  className="w-full text-sm h-10"
                />
              </div>
            </div>

            {/* Available Unapplied Credit / Credit Notes Banner */}
            {availableCredits.total_unapplied > 0 && openInvoices.length > 0 && (
              <div
                className={`p-3.5 rounded-xl border flex flex-wrap items-center justify-between gap-3 ${
                  isDark
                    ? "bg-amber-900/20 border-amber-700/60 text-amber-200"
                    : "bg-amber-50 border-amber-200 text-amber-900"
                }`}
              >
                <div className="space-y-0.5">
                  <div className="flex items-center gap-1.5 text-xs font-bold uppercase tracking-wide text-amber-600 dark:text-amber-400">
                    <SparklesIcon className="w-4 h-4" />
                    <span>
                      Available Unapplied Credit / Credit Notes:{" "}
                      <span className="font-mono text-sm">
                        {formatCurrency(availableCredits.total_unapplied)}
                      </span>
                    </span>
                  </div>
                  <p className={`text-xs ${isDark ? "text-slate-300" : "text-amber-800"}`}>
                    {availableCredits.credits.length} open credit voucher(s) (
                    {availableCredits.credits.map((c) => c.payment_number).join(", ")}) can be
                    applied directly to open invoices without recording a new payment.
                  </p>
                </div>
                <button
                  type="button"
                  onClick={handleApplyAvailableCredits}
                  disabled={applyingCredits || submitting}
                  className="inline-flex items-center gap-1.5 px-3.5 py-2 rounded-lg text-xs font-semibold bg-amber-500 hover:bg-amber-600 text-white shadow-xs transition-colors disabled:opacity-50"
                >
                  <SparklesIcon className="w-3.5 h-3.5" />
                  <span>
                    {applyingCredits ? "Applying Credit…" : "Apply Available Credit"}
                  </span>
                </button>
              </div>
            )}

            {/* Invoices Allocation Section */}
            <div className="space-y-3">
              <div className="flex items-center justify-between">
                <div>
                  <h4
                    className={`text-sm font-semibold ${
                      isDark ? "text-slate-200" : "text-gray-900"
                    }`}
                  >
                    Open Invoices Allocation
                  </h4>
                  <p
                    className={`text-xs ${
                      isDark ? "text-slate-400" : "text-gray-500"
                    }`}
                  >
                    Allocate amount to specific open invoices or leave excess as unapplied advance.
                  </p>
                </div>
                {openInvoices.length > 0 && (
                  <button
                    type="button"
                    onClick={handleAutoAllocate}
                    disabled={submitting}
                    className={`inline-flex items-center gap-2 px-4 py-2.5 text-sm font-semibold ${btnSecondary.className}`}
                    style={btnSecondary.style}
                  >
                    <SparklesIcon className="w-4 h-4" />
                    <span>Auto-Allocate (Oldest First)</span>
                  </button>
                )}
              </div>

              {loading ? (
                <div
                  className={`p-8 text-center text-sm ${
                    isDark ? "text-slate-400" : "text-gray-500"
                  }`}
                >
                  Loading open invoices...
                </div>
              ) : openInvoices.length === 0 ? (
                <div
                  className={`p-4 rounded-xl border text-center text-xs ${
                    isDark
                      ? "bg-slate-800/40 border-slate-700/60 text-slate-400"
                      : "bg-gray-50 border-gray-200 text-gray-500"
                  }`}
                >
                  No unpaid credit invoices found. Entire amount will be saved as unapplied credit / advance.
                </div>
              ) : (
                <div
                  className={`rounded-xl border overflow-x-auto max-h-56 overflow-y-auto ${
                    isDark ? "border-slate-700/80" : "border-gray-200"
                  }`}
                >
                  <table className="w-full text-left text-xs">
                    <thead
                      className={`sticky top-0 border-b ${
                        isDark
                          ? "bg-slate-800 text-slate-300 border-slate-700"
                          : "bg-gray-50 text-gray-600 border-gray-200"
                      }`}
                    >
                      <tr>
                        <th className="px-3 py-2.5 font-semibold">Invoice #</th>
                        <th className="px-3 py-2.5 font-semibold">Date</th>
                        <th className="px-3 py-2.5 font-semibold text-right">Total</th>
                        <th className="px-3 py-2.5 font-semibold text-right">Remaining Due</th>
                        <th className="px-3 py-2.5 font-semibold text-right w-36">Allocate</th>
                        <th className="px-3 py-2.5 text-center w-24">Action</th>
                      </tr>
                    </thead>
                    <tbody
                      className={`divide-y ${
                        isDark ? "divide-slate-700/50" : "divide-gray-100"
                      }`}
                    >
                      {openInvoices.map((inv) => {
                        const curAlloc = allocations[inv.id] || "";
                        return (
                          <tr
                            key={inv.id}
                            className={`transition-colors ${
                              isDark ? "hover:bg-slate-800/30" : "hover:bg-gray-50"
                            }`}
                          >
                            <td
                              className={`px-3 py-2.5 font-medium ${
                                isDark ? "text-slate-200" : "text-gray-900"
                              }`}
                            >
                              {inv.posted_number}
                            </td>
                            <td
                              className={`px-3 py-2.5 ${
                                isDark ? "text-slate-400" : "text-gray-600"
                              }`}
                            >
                              {inv.date}
                            </td>
                            <td
                              className={`px-3 py-2.5 text-right font-mono ${
                                isDark ? "text-slate-300" : "text-gray-700"
                              }`}
                            >
                              {formatCurrency(inv.total)}
                            </td>
                            <td
                              className={`px-3 py-2.5 text-right font-semibold font-mono ${
                                isDark ? "text-amber-400" : "text-amber-600"
                              }`}
                            >
                              {formatCurrency(inv.due)}
                            </td>
                            <td className="px-3 py-2 text-right">
                              <GlassInput
                                type="number"
                                step="0.01"
                                min="0"
                                max={inv.due}
                                value={curAlloc}
                                onChange={(e) => handleAllocationChange(inv.id, inv.due, e.target.value)}
                                placeholder="0.00"
                                disabled={submitting}
                                className="w-full text-right text-xs h-7 font-mono font-semibold"
                              />
                            </td>
                            <td className="px-3 py-2 text-center">
                              <button
                                type="button"
                                onClick={() => handlePayInFull(inv)}
                                disabled={submitting}
                                className={`px-2.5 py-1 rounded text-[11px] font-semibold border transition-colors ${
                                  isDark
                                    ? "bg-emerald-500/20 text-emerald-300 hover:bg-emerald-500/30 border-emerald-500/30"
                                    : "bg-emerald-50 text-emerald-700 hover:bg-emerald-100 border-emerald-200"
                                }`}
                              >
                                Full
                              </button>
                            </td>
                          </tr>
                        );
                      })}
                    </tbody>
                  </table>
                </div>
              )}
            </div>

            {/* Settlement Summary Strip */}
            <div
              className={`p-4 rounded-xl border flex flex-wrap items-center justify-between gap-4 ${
                isDark
                  ? "bg-slate-800/60 border-slate-700"
                  : "bg-gray-50 border-gray-200"
              }`}
            >
              <div className="flex flex-wrap items-center gap-6">
                <div>
                  <span
                    className={`text-[11px] uppercase tracking-wider block font-medium ${
                      isDark ? "text-slate-400" : "text-gray-500"
                    }`}
                  >
                    Payment Total
                  </span>
                  <span
                    className={`text-base font-bold font-mono ${
                      isDark ? "text-white" : "text-gray-900"
                    }`}
                  >
                    {formatCurrency(numAmount)}
                  </span>
                </div>
                <div>
                  <span
                    className={`text-[11px] uppercase tracking-wider block font-medium ${
                      isDark ? "text-slate-400" : "text-gray-500"
                    }`}
                  >
                    Allocated
                  </span>
                  <span
                    className={`text-base font-bold font-mono ${
                      isDark ? "text-blue-400" : "text-blue-600"
                    }`}
                  >
                    {formatCurrency(totalAllocated)}
                  </span>
                </div>
                <div>
                  <span
                    className={`text-[11px] uppercase tracking-wider block font-medium ${
                      isDark ? "text-slate-400" : "text-gray-500"
                    }`}
                  >
                    Unapplied Advance
                  </span>
                  <span
                    className={`text-base font-bold font-mono ${
                      unappliedCredit > 0
                        ? isDark
                          ? "text-emerald-400"
                          : "text-emerald-600"
                        : isDark
                        ? "text-slate-400"
                        : "text-gray-400"
                    }`}
                  >
                    {formatCurrency(unappliedCredit)}
                  </span>
                </div>
              </div>

              <div className="flex items-center gap-2.5">
                <button
                  type="button"
                  onClick={onClose}
                  disabled={submitting}
                  className={`px-4 py-2.5 text-sm font-semibold ${btnSecondary.className}`}
                  style={btnSecondary.style}
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  disabled={submitting || numAmount <= 0}
                  className={`inline-flex items-center gap-2 px-4 py-2.5 text-sm font-semibold disabled:opacity-50 ${btnEmerald.className}`}
                  style={btnEmerald.style}
                >
                  <CheckIcon className="w-4 h-4" />
                  <span>{submitting ? "Posting..." : "Confirm & Post Payment"}</span>
                </button>
              </div>
            </div>
          </form>
        </GlassCard>
      </div>
    </div>
  );
}

