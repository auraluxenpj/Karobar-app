import React, { useState, useEffect, useCallback, useMemo } from "react";
import axios from "axios";
import toast from "react-hot-toast";
import {
  XMarkIcon,
  PrinterIcon,
  ArrowUturnLeftIcon,
  ArrowPathIcon,
  BanknotesIcon,
} from "@heroicons/react/24/solid";
import { GlassCard, GlassInput } from "@/components/Glass.jsx";
import { useCurrency } from "@/context/CurrencyContext.jsx";
import { useTheme } from "@/context/ThemeContext.jsx";
import { getThemeButtonClasses } from "@/utils/buttonStyles";
import PaymentReceiptModal from "@/components/PaymentReceiptModal.jsx";

export default function PaymentHistoryModal({
  isOpen,
  onClose,
  partyType = "customer",
  partyId,
  partyName = "",
  onPaymentReversed,
}) {
  const { formatCurrency } = useCurrency();
  const { isDark, theme } = useTheme();
  const [payments, setPayments] = useState([]);
  const [loading, setLoading] = useState(false);

  // Selected payment for receipt viewing/printing
  const [activeReceipt, setActiveReceipt] = useState(null);

  // Reversal dialog state
  const [reversingPayment, setReversingPayment] = useState(null);
  const [reversalReason, setReversalReason] = useState("");
  const [isReversing, setIsReversing] = useState(false);

  const buttonStyle = theme?.button_style || "modern";
  const themeColors = useMemo(() => ({
    primary: theme?.primary_color || "#3b82f6",
    primaryHover: theme?.primary_hover || "#2563eb",
    secondary: theme?.secondary_color || "#8b5cf6",
    secondaryHover: theme?.secondary_hover || "#7c3aed",
    tertiary: theme?.tertiary_color || "#06b6d4",
    tertiaryHover: theme?.tertiary_hover || "#0891b2",
    danger: theme?.danger_color || "#ef4444",
    dangerHover: "#dc2626",
  }), [theme]);

  const buttonClasses = useMemo(
    () => getThemeButtonClasses(buttonStyle, themeColors, isDark),
    [buttonStyle, themeColors, isDark]
  );
  const btnSecondary = buttonClasses.secondary;
  const btnDanger = buttonClasses.danger;

  const fetchPayments = useCallback(async () => {
    if (!partyId) return;
    try {
      setLoading(true);
      const res = await axios.get("/api/payments", {
        params: {
          party_type: partyType,
          party_id: partyId,
          per_page: 50,
        },
      });
      setPayments(res.data?.data || []);
    } catch {
      toast.error("Failed to load payments history");
    } finally {
      setLoading(false);
    }
  }, [partyId, partyType]);

  useEffect(() => {
    if (isOpen && partyId) {
      fetchPayments();
    }
  }, [isOpen, partyId, fetchPayments]);

  const handleOpenReverse = (payment) => {
    setReversingPayment(payment);
    setReversalReason("");
  };

  const handleConfirmReverse = async () => {
    if (!reversingPayment) return;
    if (reversalReason.trim().length < 3) {
      toast.error("Please provide a reason with at least 3 characters");
      return;
    }

    try {
      setIsReversing(true);
      await axios.post(`/api/payments/${reversingPayment.id}/reverse`, {
        reason: reversalReason.trim(),
      });
      toast.success(`Payment ${reversingPayment.payment_number} reversed successfully`);
      window.dispatchEvent(new CustomEvent("cash-drawer-changed"));
      window.dispatchEvent(new CustomEvent("accounts-changed"));
      try { localStorage.setItem("cash_drawer_sync", String(Date.now())); } catch {}
      try { localStorage.setItem("accounts_sync", String(Date.now())); } catch {}
      setReversingPayment(null);
      setReversalReason("");
      fetchPayments();
      onPaymentReversed && onPaymentReversed();
    } catch (err) {
      toast.error(err?.response?.data?.message || "Failed to reverse payment");
    } finally {
      setIsReversing(false);
    }
  };

  if (!isOpen) return null;

  return (
    <>
      <div
        className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/60 backdrop-blur-xs overflow-y-auto"
        onClick={(e) => {
          if (e.target === e.currentTarget) onClose();
        }}
      >
        <div className="relative w-full max-w-4xl my-8">
          <GlassCard
            className={`border shadow-2xl rounded-2xl overflow-hidden transition-colors ${
              isDark
                ? "bg-slate-900/95 border-slate-700/80 text-slate-100"
                : "bg-white border-gray-200 text-gray-900"
            }`}
          >
            {/* Header */}
            <div
              className={`flex items-center justify-between px-6 py-4 border-b ${
                isDark
                  ? "border-slate-700/80 bg-slate-800/50"
                  : "border-gray-200 bg-gray-50"
              }`}
            >
              <div className="flex items-center gap-3">
                <div
                  className={`p-2 rounded-xl border ${
                    isDark
                      ? "bg-blue-500/20 text-blue-400 border-blue-500/30"
                      : "bg-blue-50 text-blue-600 border-blue-200"
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
                    {partyType === "customer" ? "Customer Payment Vouchers" : "Supplier Payment Vouchers"}
                  </h3>
                  <p className={`text-xs ${isDark ? "text-slate-400" : "text-gray-500"}`}>
                    History for:{" "}
                    <span className={`font-semibold ${isDark ? "text-slate-200" : "text-gray-800"}`}>
                      {partyName || `#${partyId}`}
                    </span>
                  </p>
                </div>
              </div>
              <button
                type="button"
                onClick={onClose}
                className={`p-1.5 rounded-lg transition-colors ${
                  isDark
                    ? "text-slate-400 hover:text-white hover:bg-slate-700/60"
                    : "text-gray-500 hover:text-gray-900 hover:bg-gray-200/70"
                }`}
              >
                <XMarkIcon className="w-5 h-5" />
              </button>
            </div>

            {/* Content Table */}
            <div className="p-6">
              {loading ? (
                <div className={`flex flex-col items-center justify-center py-12 gap-2 ${isDark ? "text-slate-400" : "text-gray-500"}`}>
                  <ArrowPathIcon className="w-6 h-6 animate-spin" />
                  <span className="text-xs">Loading payment vouchers...</span>
                </div>
              ) : payments.length === 0 ? (
                <div className={`py-12 text-center text-xs ${isDark ? "text-slate-400" : "text-gray-500"}`}>
                  No payment vouchers recorded yet for this {partyType}.
                </div>
              ) : (
                <div className={`rounded-xl border overflow-x-auto ${isDark ? "border-slate-700" : "border-gray-200"}`}>
                  <table className="w-full text-left text-xs">
                    <thead className={`border-b ${isDark ? "bg-slate-800 text-slate-300 border-slate-700" : "bg-gray-50 text-gray-600 border-gray-200"}`}>
                      <tr>
                        <th className="px-3 py-2.5 font-semibold">Voucher #</th>
                        <th className="px-3 py-2.5 font-semibold">Date</th>
                        <th className="px-3 py-2.5 font-semibold">Method</th>
                        <th className="px-3 py-2.5 font-semibold text-right">Total</th>
                        <th className="px-3 py-2.5 font-semibold text-right">Allocated</th>
                        <th className="px-3 py-2.5 font-semibold text-right">Unapplied</th>
                        <th className="px-3 py-2.5 font-semibold text-center">Status</th>
                        <th className="px-3 py-2.5 font-semibold text-center w-28">Actions</th>
                      </tr>
                    </thead>
                    <tbody className={`divide-y ${isDark ? "divide-slate-700/50" : "divide-gray-100"}`}>
                      {payments.map((p) => {
                        const isRev = p.status === "reversed";
                        return (
                          <tr key={p.id} className={`transition-colors ${isDark ? "hover:bg-slate-800/40" : "hover:bg-gray-50"}`}>
                            <td className={`px-3 py-3 font-mono font-bold ${isDark ? "text-white" : "text-gray-900"}`}>
                              {p.payment_number}
                              {p.reference && (
                                <span className={`block font-sans text-[10px] font-normal ${isDark ? "text-slate-400" : "text-gray-500"}`}>
                                  Ref: {p.reference}
                                </span>
                              )}
                            </td>
                            <td className={`px-3 py-3 ${isDark ? "text-slate-300" : "text-gray-700"}`}>
                              {p.payment_date}
                            </td>
                            <td className={`px-3 py-3 capitalize ${isDark ? "text-slate-300" : "text-gray-700"}`}>
                              {p.payment_method?.replace(/_/g, " ")}
                            </td>
                            <td className={`px-3 py-3 text-right font-mono font-bold ${isDark ? "text-white" : "text-gray-900"}`}>
                              <span className={isRev ? "line-through text-slate-400" : ""}>
                                {formatCurrency(p.amount)}
                              </span>
                            </td>
                            <td className={`px-3 py-3 text-right font-mono ${isDark ? "text-blue-400" : "text-blue-600"}`}>
                              <span className={isRev ? "line-through text-slate-400" : ""}>
                                {formatCurrency(p.allocated_amount)}
                              </span>
                            </td>
                            <td className={`px-3 py-3 text-right font-mono ${isDark ? "text-emerald-400" : "text-emerald-600"}`}>
                              <span className={isRev ? "line-through text-slate-400" : ""}>
                                {formatCurrency(p.unapplied_amount)}
                              </span>
                            </td>
                            <td className="px-3 py-3 text-center">
                              {isRev ? (
                                <span className={`px-2 py-0.5 rounded text-[10px] font-bold uppercase border ${isDark ? "bg-rose-900/40 text-rose-400 border-rose-800" : "bg-red-50 text-red-700 border-red-200"}`}>
                                  Reversed
                                </span>
                              ) : (
                                <span className={`px-2 py-0.5 rounded text-[10px] font-bold uppercase border ${isDark ? "bg-emerald-900/40 text-emerald-400 border-emerald-800" : "bg-emerald-50 text-emerald-700 border-emerald-200"}`}>
                                  Posted
                                </span>
                              )}
                            </td>
                            <td className="px-3 py-3 text-center">
                              <div className="flex items-center justify-center gap-1.5">
                                <button
                                  type="button"
                                  onClick={() => setActiveReceipt(p)}
                                  className={`p-1.5 rounded-md transition-colors ${isDark ? "text-slate-300 hover:text-white hover:bg-slate-700/60" : "text-gray-600 hover:text-gray-900 hover:bg-gray-100"}`}
                                  title="View / Print Voucher"
                                >
                                  <PrinterIcon className="w-4 h-4" />
                                </button>
                                {!isRev && (
                                  <button
                                    type="button"
                                    onClick={() => handleOpenReverse(p)}
                                    className={`p-1.5 rounded-md transition-colors ${isDark ? "text-amber-400 hover:text-amber-300 hover:bg-amber-900/30" : "text-amber-600 hover:text-amber-700 hover:bg-amber-50"}`}
                                    title="Void / Reverse Payment"
                                  >
                                    <ArrowUturnLeftIcon className="w-4 h-4" />
                                  </button>
                                )}
                              </div>
                            </td>
                          </tr>
                        );
                      })}
                    </tbody>
                  </table>
                </div>
              )}
            </div>
          </GlassCard>
        </div>
      </div>

      {/* Reversal Confirmation Modal */}
      {reversingPayment && (
        <div
          className="fixed inset-0 z-60 flex items-center justify-center p-4 bg-black/70 backdrop-blur-xs"
          onClick={(e) => {
            if (e.target === e.currentTarget && !isReversing) setReversingPayment(null);
          }}
        >
          <div className="relative w-full max-w-md">
            <GlassCard
              className={`border shadow-2xl rounded-2xl overflow-hidden p-6 space-y-4 ${
                isDark
                  ? "bg-slate-900 border-rose-500/40 text-slate-100"
                  : "bg-white border-red-200 text-gray-900"
              }`}
            >
              <div className="flex items-center gap-3">
                <div
                  className={`p-2 rounded-xl border ${
                    isDark
                      ? "bg-rose-500/20 text-rose-400 border-rose-500/30"
                      : "bg-red-50 text-red-600 border-red-200"
                  }`}
                >
                  <ArrowUturnLeftIcon className="w-6 h-6" />
                </div>
                <div>
                  <h4 className={`text-base font-bold ${isDark ? "text-white" : "text-gray-900"}`}>
                    Reverse Payment Voucher
                  </h4>
                  <p className={`text-xs font-mono ${isDark ? "text-slate-400" : "text-gray-500"}`}>
                    {reversingPayment.payment_number} ({formatCurrency(reversingPayment.amount)})
                  </p>
                </div>
              </div>

              <p className={`text-xs ${isDark ? "text-slate-300" : "text-gray-600"}`}>
                Reversing this payment will restore the due balances on all allocated invoices and unwind the party ledger credit.
              </p>

              <div>
                <label className={`block text-xs font-semibold mb-1 ${isDark ? "text-slate-300" : "text-gray-700"}`}>
                  Reason for Reversal *
                </label>
                <GlassInput
                  type="text"
                  value={reversalReason}
                  onChange={(e) => setReversalReason(e.target.value)}
                  placeholder="e.g. Cheque returned / Wrong entry"
                  disabled={isReversing}
                  className="w-full text-xs h-9"
                  autoFocus
                />
              </div>

              <div className="flex justify-end gap-2.5 pt-2">
                <button
                  type="button"
                  onClick={() => setReversingPayment(null)}
                  disabled={isReversing}
                  className={`px-4 py-2.5 text-sm font-semibold ${btnSecondary.className}`}
                  style={btnSecondary.style}
                >
                  Cancel
                </button>
                <button
                  type="button"
                  onClick={handleConfirmReverse}
                  disabled={isReversing || reversalReason.trim().length < 3}
                  className={`px-4 py-2.5 text-sm font-semibold disabled:opacity-50 ${btnDanger.className}`}
                  style={btnDanger.style}
                >
                  {isReversing ? "Reversing..." : "Confirm Reversal"}
                </button>
              </div>
            </GlassCard>
          </div>
        </div>
      )}

      {/* Receipt Modal */}
      {activeReceipt && (
        <PaymentReceiptModal
          isOpen={Boolean(activeReceipt)}
          onClose={() => setActiveReceipt(null)}
          payment={activeReceipt}
        />
      )}
    </>
  );
}

