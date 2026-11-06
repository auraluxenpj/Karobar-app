import React, { useMemo, useRef, useState } from "react";
import {
  XMarkIcon,
  PrinterIcon,
  CheckCircleIcon,
  ArrowUturnLeftIcon,
  DocumentTextIcon,
  ShareIcon,
} from "@heroicons/react/24/solid";
import { GlassCard } from "@/components/Glass.jsx";
import { useCurrency } from "@/context/CurrencyContext.jsx";
import { useTheme } from "@/context/ThemeContext.jsx";
import { getThemeButtonClasses } from "@/utils/buttonStyles";
import ShareDocumentModal from "@/components/ShareDocumentModal.jsx";
import { printCurrentView } from "@/utils/printHelper.js";

export default function PaymentReceiptModal({
  isOpen,
  onClose,
  payment,
}) {
  const { formatCurrency } = useCurrency();
  const { isDark, theme } = useTheme();
  const printAreaRef = useRef(null);
  const [shareOpen, setShareOpen] = useState(false);

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

  if (!isOpen || !payment) return null;

  const handlePrint = () => {
    printCurrentView();
  };

  const isCustomer = payment.party_type === "customer";
  const party = isCustomer ? payment.customer : payment.supplier;
  const isReversed = payment.status === "reversed";
  const allocations = payment.allocations || [];

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/60 backdrop-blur-xs overflow-y-auto"
      onClick={(e) => {
        if (e.target === e.currentTarget) onClose();
      }}
    >
      <style>{`
        @media print {
          body * {
            visibility: hidden;
          }
          #payment-printable-voucher, #payment-printable-voucher * {
            visibility: visible;
          }
          #payment-printable-voucher {
            position: absolute;
            left: 0;
            top: 0;
            width: 100%;
            background: white !important;
            color: black !important;
          }
          .no-print {
            display: none !important;
          }
        }
      `}</style>

      <div className="relative w-full max-w-2xl my-8">
        <GlassCard
          className={`border shadow-2xl rounded-2xl overflow-hidden transition-colors ${
            isDark
              ? "bg-slate-900/95 border-slate-700/80 text-slate-100"
              : "bg-white border-gray-200 text-gray-900"
          }`}
        >
          {/* Modal Header */}
          <div
            className={`flex flex-wrap gap-2 items-center justify-between px-4 sm:px-6 py-4 border-b no-print ${
              isDark
                ? "border-slate-700/80 bg-slate-800/50"
                : "border-gray-200 bg-gray-50"
            }`}
          >
            <div className="flex items-center gap-2.5">
              <div
                className={`p-2 rounded-xl border ${
                  isDark
                    ? "bg-emerald-500/20 text-emerald-400 border-emerald-500/30"
                    : "bg-emerald-50 text-emerald-600 border-emerald-200"
                }`}
              >
                <DocumentTextIcon className="w-5 h-5" />
              </div>
              <span
                className={`font-bold text-base ${
                  isDark ? "text-white" : "text-gray-900"
                }`}
              >
                Payment Receipt Voucher
              </span>
            </div>
            <div className="flex flex-wrap items-center gap-2">
              <button
                type="button"
                onClick={() => setShareOpen(true)}
                className={`inline-flex items-center gap-2 px-4 py-2.5 text-sm font-semibold ${btnSecondary.className}`}
                style={btnSecondary.style}
                title="Share receipt via WhatsApp or Email PDF"
              >
                <ShareIcon className="w-4 h-4" />
                <span>Share / PDF</span>
              </button>
              <button
                type="button"
                onClick={handlePrint}
                className={`inline-flex items-center gap-2 px-4 py-2.5 text-sm font-semibold ${btnEmerald.className}`}
                style={btnEmerald.style}
              >
                <PrinterIcon className="w-4 h-4" />
                <span>Print</span>
              </button>
              <button
                type="button"
                onClick={onClose}
                className={`p-2 rounded-lg transition-colors ${
                  isDark
                    ? "text-slate-400 hover:text-white hover:bg-slate-700/60"
                    : "text-gray-500 hover:text-gray-900 hover:bg-gray-200/70"
                }`}
              >
                <XMarkIcon className="w-5 h-5" />
              </button>
            </div>
          </div>

          {/* Printable Voucher Content */}
          <div
            id="payment-printable-voucher"
            ref={printAreaRef}
            className={`p-4 sm:p-8 space-y-6 print:bg-white print:text-black ${
              isDark ? "bg-slate-900 text-slate-100" : "bg-white text-gray-900"
            }`}
          >
            {/* Store / Voucher Header */}
            <div
              className={`flex items-start justify-between border-b pb-5 print:border-gray-300 ${
                isDark ? "border-slate-700" : "border-gray-200"
              }`}
            >
              <div>
                <h2
                  className={`text-xl font-extrabold uppercase tracking-wide print:text-black ${
                    isDark ? "text-white" : "text-gray-900"
                  }`}
                >
                  {isCustomer ? "Official Receipt" : "Payment Voucher"}
                </h2>
                <p
                  className={`text-xs mt-1 print:text-gray-600 ${
                    isDark ? "text-slate-400" : "text-gray-500"
                  }`}
                >
                  Voucher #:{" "}
                  <span
                    className={`font-mono font-bold print:text-black ${
                      isDark ? "text-white" : "text-gray-900"
                    }`}
                  >
                    {payment.payment_number}
                  </span>
                </p>
                <p
                  className={`text-xs print:text-gray-600 ${
                    isDark ? "text-slate-400" : "text-gray-500"
                  }`}
                >
                  Date:{" "}
                  <span
                    className={`font-semibold print:text-black ${
                      isDark ? "text-white" : "text-gray-900"
                    }`}
                  >
                    {payment.payment_date}
                  </span>
                </p>
              </div>

              <div className="text-right">
                {isReversed ? (
                  <span
                    className={`inline-flex items-center gap-1 px-3 py-1 rounded-md text-xs font-bold uppercase border print:border-red-600 print:text-red-600 ${
                      isDark
                        ? "bg-rose-600/30 text-rose-400 border-rose-500/40"
                        : "bg-red-50 text-red-700 border-red-200"
                    }`}
                  >
                    <ArrowUturnLeftIcon className="w-3.5 h-3.5" />
                    <span>REVERSED</span>
                  </span>
                ) : (
                  <span
                    className={`inline-flex items-center gap-1 px-3 py-1 rounded-md text-xs font-bold uppercase border print:border-green-600 print:text-green-700 ${
                      isDark
                        ? "bg-emerald-600/30 text-emerald-400 border-emerald-500/40"
                        : "bg-emerald-50 text-emerald-700 border-emerald-200"
                    }`}
                  >
                    <CheckCircleIcon className="w-3.5 h-3.5" />
                    <span>POSTED</span>
                  </span>
                )}
              </div>
            </div>

            {/* Party & Payment Details Grid */}
            <div
              className={`grid grid-cols-2 gap-4 text-xs p-4 rounded-xl border print:bg-gray-50 print:border-gray-200 ${
                isDark
                  ? "bg-slate-800/40 border-slate-700/60"
                  : "bg-gray-50 border-gray-200"
              }`}
            >
              <div>
                <span
                  className={`uppercase tracking-wider block font-semibold text-[10px] print:text-gray-500 ${
                    isDark ? "text-slate-400" : "text-gray-500"
                  }`}
                >
                  {isCustomer ? "Received From" : "Paid To"}
                </span>
                <p
                  className={`text-sm font-bold mt-0.5 print:text-black ${
                    isDark ? "text-white" : "text-gray-900"
                  }`}
                >
                  {party?.name || (isCustomer ? "Walk-in Customer" : "Supplier")}
                </p>
                {party?.phone && (
                  <p
                    className={`print:text-gray-600 ${
                      isDark ? "text-slate-400" : "text-gray-600"
                    }`}
                  >
                    {party.phone}
                  </p>
                )}
                {party?.address && (
                  <p
                    className={`print:text-gray-600 ${
                      isDark ? "text-slate-400" : "text-gray-600"
                    }`}
                  >
                    {party.address}
                  </p>
                )}
              </div>

              <div>
                <span
                  className={`uppercase tracking-wider block font-semibold text-[10px] print:text-gray-500 ${
                    isDark ? "text-slate-400" : "text-gray-500"
                  }`}
                >
                  Tender / Method Details
                </span>
                <p
                  className={`text-sm font-bold mt-0.5 capitalize print:text-black ${
                    isDark ? "text-white" : "text-gray-900"
                  }`}
                >
                  {payment.payment_method?.replace(/_/g, " ")}
                </p>
                {payment.reference && (
                  <p
                    className={`print:text-gray-700 ${
                      isDark ? "text-slate-300" : "text-gray-700"
                    }`}
                  >
                    Ref: <span className="font-mono">{payment.reference}</span>
                  </p>
                )}
                {payment.notes && (
                  <p
                    className={`italic mt-0.5 print:text-gray-600 ${
                      isDark ? "text-slate-400" : "text-gray-600"
                    }`}
                  >
                    "{payment.notes}"
                  </p>
                )}
              </div>
            </div>

            {/* Allocations Table */}
            <div>
              <h4
                className={`text-xs uppercase tracking-wider font-semibold mb-2 print:text-gray-600 ${
                  isDark ? "text-slate-400" : "text-gray-500"
                }`}
              >
                Settled Invoice Allocations
              </h4>
              {allocations.length === 0 ? (
                <div
                  className={`p-3 text-xs rounded-lg text-center border print:bg-gray-50 print:text-gray-500 ${
                    isDark
                      ? "text-slate-400 bg-slate-800/30 border-slate-700/60"
                      : "text-gray-500 bg-gray-50 border-gray-200"
                  }`}
                >
                  No direct invoice allocations. 100% of payment retained as unapplied credit / advance.
                </div>
              ) : (
                <div className="overflow-x-auto">
                <table
                  className={`w-full text-xs text-left border-collapse border print:border-gray-300 ${
                    isDark ? "border-slate-700" : "border-gray-200"
                  }`}
                >
                  <thead
                    className={`print:bg-gray-100 print:text-gray-700 ${
                      isDark
                        ? "bg-slate-800/70 text-slate-300"
                        : "bg-gray-100 text-gray-700"
                    }`}
                  >
                    <tr>
                      <th
                        className={`p-2.5 border print:border-gray-300 ${
                          isDark ? "border-slate-700" : "border-gray-200"
                        }`}
                      >
                        #
                      </th>
                      <th
                        className={`p-2.5 border print:border-gray-300 ${
                          isDark ? "border-slate-700" : "border-gray-200"
                        }`}
                      >
                        Invoice Number
                      </th>
                      <th
                        className={`p-2.5 border print:border-gray-300 ${
                          isDark ? "border-slate-700" : "border-gray-200"
                        }`}
                      >
                        Invoice Date
                      </th>
                      <th
                        className={`p-2.5 border text-right print:border-gray-300 ${
                          isDark ? "border-slate-700" : "border-gray-200"
                        }`}
                      >
                        Allocated Amount
                      </th>
                    </tr>
                  </thead>
                  <tbody>
                    {allocations.map((alloc, idx) => {
                      const inv = alloc.sale_invoice || alloc.purchase_invoice;
                      const invNo = inv?.posted_number || inv?.invoice_number || `#${alloc.invoice_id}`;
                      const invDate = inv?.date || inv?.posted_date || "—";
                      return (
                        <tr key={alloc.id || idx}>
                          <td
                            className={`p-2.5 border print:border-gray-300 print:text-gray-600 ${
                              isDark
                                ? "border-slate-700 text-slate-400"
                                : "border-gray-200 text-gray-500"
                            }`}
                          >
                            {idx + 1}
                          </td>
                          <td
                            className={`p-2.5 border font-semibold print:border-gray-300 print:text-black ${
                              isDark
                                ? "border-slate-700 text-white"
                                : "border-gray-200 text-gray-900"
                            }`}
                          >
                            {invNo}
                          </td>
                          <td
                            className={`p-2.5 border print:border-gray-300 print:text-gray-600 ${
                              isDark
                                ? "border-slate-700 text-slate-400"
                                : "border-gray-200 text-gray-600"
                            }`}
                          >
                            {invDate}
                          </td>
                          <td
                            className={`p-2.5 border text-right font-mono font-bold print:border-gray-300 print:text-black ${
                              isDark
                                ? "border-slate-700 text-white"
                                : "border-gray-200 text-gray-900"
                            }`}
                          >
                            {formatCurrency(alloc.amount)}
                          </td>
                        </tr>
                      );
                    })}
                  </tbody>
                </table>
                </div>
              )}
            </div>

            {/* Totals Summary */}
            <div className="flex justify-end pt-2">
              <div className="w-64 space-y-1.5 text-xs">
                <div
                  className={`flex justify-between py-1 border-b print:border-gray-200 ${
                    isDark ? "border-slate-800" : "border-gray-200"
                  }`}
                >
                  <span
                    className={`print:text-gray-600 ${
                      isDark ? "text-slate-400" : "text-gray-600"
                    }`}
                  >
                    Total Tender:
                  </span>
                  <span
                    className={`font-bold font-mono print:text-black ${
                      isDark ? "text-white" : "text-gray-900"
                    }`}
                  >
                    {formatCurrency(payment.amount)}
                  </span>
                </div>
                <div
                  className={`flex justify-between py-1 border-b print:border-gray-200 ${
                    isDark ? "border-slate-800" : "border-gray-200"
                  }`}
                >
                  <span
                    className={`print:text-gray-600 ${
                      isDark ? "text-slate-400" : "text-gray-600"
                    }`}
                  >
                    Allocated to Invoices:
                  </span>
                  <span
                    className={`font-bold font-mono print:text-blue-700 ${
                      isDark ? "text-blue-400" : "text-blue-600"
                    }`}
                  >
                    {formatCurrency(payment.allocated_amount)}
                  </span>
                </div>
                <div
                  className={`flex justify-between py-1.5 border-b-2 font-bold print:border-gray-400 ${
                    isDark ? "border-slate-700" : "border-gray-300"
                  }`}
                >
                  <span
                    className={`print:text-gray-700 ${
                      isDark ? "text-slate-300" : "text-gray-700"
                    }`}
                  >
                    Unapplied Credit:
                  </span>
                  <span
                    className={`font-mono print:text-green-700 ${
                      isDark ? "text-emerald-400" : "text-emerald-600"
                    }`}
                  >
                    {formatCurrency(payment.unapplied_amount)}
                  </span>
                </div>
              </div>
            </div>

            {/* Reversal Banner if applicable */}
            {isReversed && (
              <div
                className={`p-3 rounded-lg border text-xs print:border-red-500 print:text-red-700 ${
                  isDark
                    ? "bg-rose-900/30 border-rose-700/60 text-rose-300"
                    : "bg-red-50 border-red-200 text-red-700"
                }`}
              >
                <span className="font-bold">Reversal Notice:</span> This payment was reversed on{" "}
                {payment.reversed_at ? new Date(payment.reversed_at).toLocaleString() : ""}.
                {payment.reversal_reason && (
                  <p className="mt-0.5 font-semibold">Reason: "{payment.reversal_reason}"</p>
                )}
              </div>
            )}
          </div>
        </GlassCard>
      </div>

      <ShareDocumentModal
        isOpen={shareOpen}
        onClose={() => setShareOpen(false)}
        documentType="payment"
        documentId={payment.id}
      />
    </div>
  );
}

