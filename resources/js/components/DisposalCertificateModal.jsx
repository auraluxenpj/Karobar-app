import React, { useMemo, useRef, useState } from "react";
import {
  XMarkIcon,
  PrinterIcon,
  ShieldExclamationIcon,
  CheckCircleIcon,
  ClockIcon,
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

export default function DisposalCertificateModal({
  isOpen,
  onClose,
  disposal,
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
  const btnSecondary = buttonClasses.secondary;
  const btnEmerald = buttonClasses.emerald;

  if (!isOpen || !disposal) return null;

  const items = disposal.items || [];
  const isDisposed = disposal.status === "disposed";
  const isQuarantined = disposal.status === "quarantined";
  const isRestored = disposal.status === "restored";

  const handlePrint = () => {
    printCurrentView();
  };

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
          #disposal-printable-certificate, #disposal-printable-certificate * {
            visibility: visible;
          }
          #disposal-printable-certificate {
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

      <div className="relative w-full max-w-3xl my-8">
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
                    ? "bg-rose-500/20 text-rose-400 border-rose-500/30"
                    : "bg-rose-50 text-rose-600 border-rose-200"
                }`}
              >
                <DocumentTextIcon className="w-5 h-5" />
              </div>
              <div>
                <span
                  className={`font-bold text-base block ${
                    isDark ? "text-white" : "text-gray-900"
                  }`}
                >
                  {isDisposed
                    ? "Stock Destruction & Write-Off Certificate"
                    : isQuarantined
                    ? "Quarantine Isolation Voucher"
                    : "Restored Quarantine Voucher"}
                </span>
                <span
                  className={`text-xs font-mono ${
                    isDark ? "text-slate-400" : "text-gray-500"
                  }`}
                >
                  {disposal.disposal_number}
                </span>
              </div>
            </div>

            <div className="flex flex-wrap items-center gap-2">
              <button
                type="button"
                onClick={handlePrint}
                className={`inline-flex items-center gap-2 px-4 py-2.5 text-sm font-semibold ${btnEmerald.className}`}
                style={btnEmerald.style}
              >
                <PrinterIcon className="w-4 h-4" />
                <span>Print Certificate</span>
              </button>
              <button
                type="button"
                onClick={() => setShareOpen(true)}
                className={`inline-flex items-center gap-2 px-4 py-2.5 text-sm font-semibold ${btnSecondary.className}`}
                style={btnSecondary.style}
              >
                <ShareIcon className="w-4 h-4" />
                <span>PDF / Share</span>
              </button>
              <button
                type="button"
                onClick={onClose}
                className={`px-4 py-2.5 text-sm font-semibold ${btnSecondary.className}`}
                style={btnSecondary.style}
              >
                Close
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

          {/* Printable Certificate Content */}
          <div
            id="disposal-printable-certificate"
            ref={printAreaRef}
            className={`p-4 sm:p-8 space-y-6 print:bg-white print:text-black ${
              isDark ? "bg-slate-900 text-slate-100" : "bg-white text-gray-900"
            }`}
          >
            {/* Certificate Header */}
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
                  {isDisposed
                    ? "Certificate of Stock Destruction & Write-Off"
                    : isQuarantined
                    ? "Stock Quarantine Holding Voucher"
                    : "Quarantine Stock Release Certificate"}
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
                    {disposal.disposal_number}
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
                    {disposal.disposal_date}
                  </span>
                </p>
              </div>

              <div className="text-right space-y-1.5">
                {isDisposed && (
                  <span
                    className={`inline-flex items-center gap-1.5 px-3 py-1 rounded-md text-xs font-bold uppercase border print:border-red-600 print:text-red-700 ${
                      isDark
                        ? "bg-rose-600/30 text-rose-300 border-rose-500/40"
                        : "bg-red-50 text-red-700 border-red-200"
                    }`}
                  >
                    <CheckCircleIcon className="w-3.5 h-3.5" />
                    <span>DISPOSED & WRITTEN OFF</span>
                  </span>
                )}
                {isQuarantined && (
                  <span
                    className={`inline-flex items-center gap-1.5 px-3 py-1 rounded-md text-xs font-bold uppercase border print:border-amber-600 print:text-amber-700 ${
                      isDark
                        ? "bg-amber-500/20 text-amber-300 border-amber-500/40"
                        : "bg-amber-50 text-amber-700 border-amber-200"
                    }`}
                  >
                    <ClockIcon className="w-3.5 h-3.5" />
                    <span>IN QUARANTINE HOLD</span>
                  </span>
                )}
                {isRestored && (
                  <span
                    className={`inline-flex items-center gap-1.5 px-3 py-1 rounded-md text-xs font-bold uppercase border print:border-emerald-600 print:text-emerald-700 ${
                      isDark
                        ? "bg-emerald-500/20 text-emerald-300 border-emerald-500/40"
                        : "bg-emerald-50 text-emerald-700 border-emerald-200"
                    }`}
                  >
                    <ArrowUturnLeftIcon className="w-3.5 h-3.5" />
                    <span>RESTORED TO SHELF</span>
                  </span>
                )}

                {disposal.has_narcotics && (
                  <div>
                    <span
                      className={`inline-flex items-center gap-1 px-2.5 py-0.5 rounded text-[11px] font-bold uppercase border ${
                        isDark
                          ? "bg-purple-900/40 text-purple-300 border-purple-700"
                          : "bg-purple-50 text-purple-700 border-purple-200"
                      }`}
                    >
                      <ShieldExclamationIcon className="w-3.5 h-3.5" />
                      <span>Controlled / Narcotic Stock</span>
                    </span>
                  </div>
                )}
              </div>
            </div>

            {/* Metadata Grid */}
            <div
              className={`grid grid-cols-1 md:grid-cols-2 gap-4 text-xs p-4 rounded-xl border print:bg-gray-50 print:border-gray-200 ${
                isDark
                  ? "bg-slate-800/40 border-slate-700/60"
                  : "bg-gray-50 border-gray-200"
              }`}
            >
              <div className="space-y-1.5">
                <div>
                  <span
                    className={`uppercase tracking-wider block font-semibold text-[10px] print:text-gray-500 ${
                      isDark ? "text-slate-400" : "text-gray-500"
                    }`}
                  >
                    Primary Cause of Loss
                  </span>
                  <p
                    className={`text-sm font-bold print:text-black ${
                      isDark ? "text-white" : "text-gray-900"
                    }`}
                  >
                    {disposal.cause_label || disposal.cause}
                  </p>
                </div>

                <div>
                  <span
                    className={`uppercase tracking-wider block font-semibold text-[10px] print:text-gray-500 ${
                      isDark ? "text-slate-400" : "text-gray-500"
                    }`}
                  >
                    Disposal / Handling Method
                  </span>
                  <p
                    className={`text-sm font-bold print:text-black ${
                      isDark ? "text-white" : "text-gray-900"
                    }`}
                  >
                    {disposal.disposal_method_label || disposal.disposal_method}
                  </p>
                </div>

                {disposal.reference_no && (
                  <p className={isDark ? "text-slate-300" : "text-gray-700"}>
                    External Reference:{" "}
                    <span className="font-mono font-semibold">{disposal.reference_no}</span>
                  </p>
                )}
              </div>

              <div className="space-y-1.5">
                <div>
                  <span
                    className={`uppercase tracking-wider block font-semibold text-[10px] print:text-gray-500 ${
                      isDark ? "text-slate-400" : "text-gray-500"
                    }`}
                  >
                    Witness & Compliance Details
                  </span>
                  <p
                    className={`text-sm font-bold print:text-black ${
                      isDark ? "text-white" : "text-gray-900"
                    }`}
                  >
                    {disposal.witness_name || "—"}
                    {disposal.witness_designation ? ` (${disposal.witness_designation})` : ""}
                  </p>
                </div>

                <div className="grid grid-cols-2 gap-2 pt-1">
                  <div>
                    <span className={`block text-[10px] uppercase ${isDark ? "text-slate-400" : "text-gray-500"}`}>
                      Initiated By
                    </span>
                    <span className="font-semibold">
                      {disposal.creator?.name || "System"}
                    </span>
                  </div>
                  {disposal.disposer && (
                    <div>
                      <span className={`block text-[10px] uppercase ${isDark ? "text-slate-400" : "text-gray-500"}`}>
                        Disposed By
                      </span>
                      <span className="font-semibold">
                        {disposal.disposer.name}
                      </span>
                    </div>
                  )}
                </div>

                {disposal.expense && (
                  <div className="pt-1">
                    <span className={`block text-[10px] uppercase ${isDark ? "text-slate-400" : "text-gray-500"}`}>
                      P&L Write-Off Voucher
                    </span>
                    <span className={`font-mono font-bold ${isDark ? "text-emerald-400" : "text-emerald-700"}`}>
                      {disposal.expense.expense_number} ({formatCurrency(disposal.expense.amount)})
                    </span>
                  </div>
                )}
              </div>
            </div>

            {disposal.notes && (
              <div
                className={`p-3 rounded-lg border text-xs print:bg-gray-50 print:border-gray-200 ${
                  isDark
                    ? "bg-slate-800/30 border-slate-700/60 text-slate-300"
                    : "bg-gray-50 border-gray-200 text-gray-700"
                }`}
              >
                <span className="font-bold">Remarks / Notes: </span>
                <span className="whitespace-pre-line">{disposal.notes}</span>
              </div>
            )}

            {/* Items Table */}
            <div>
              <h4
                className={`text-xs uppercase tracking-wider font-semibold mb-2 print:text-gray-600 ${
                  isDark ? "text-slate-400" : "text-gray-500"
                }`}
              >
                Itemized Stock Schedule
              </h4>
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
                    <th className={`p-2.5 border print:border-gray-300 ${isDark ? "border-slate-700" : "border-gray-200"}`}>#</th>
                    <th className={`p-2.5 border print:border-gray-300 ${isDark ? "border-slate-700" : "border-gray-200"}`}>Product</th>
                    <th className={`p-2.5 border print:border-gray-300 ${isDark ? "border-slate-700" : "border-gray-200"}`}>Batch & Expiry</th>
                    <th className={`p-2.5 border text-right print:border-gray-300 ${isDark ? "border-slate-700" : "border-gray-200"}`}>Prev Qty</th>
                    <th className={`p-2.5 border text-right print:border-gray-300 ${isDark ? "border-slate-700" : "border-gray-200"}`}>Disposed Qty</th>
                    <th className={`p-2.5 border text-right print:border-gray-300 ${isDark ? "border-slate-700" : "border-gray-200"}`}>Unit Cost</th>
                    <th className={`p-2.5 border text-right print:border-gray-300 ${isDark ? "border-slate-700" : "border-gray-200"}`}>Cost Write-Off</th>
                  </tr>
                </thead>
                <tbody>
                  {items.map((it, idx) => (
                    <tr key={it.id || idx}>
                      <td className={`p-2.5 border print:border-gray-300 ${isDark ? "border-slate-700 text-slate-400" : "border-gray-200 text-gray-500"}`}>
                        {idx + 1}
                      </td>
                      <td className={`p-2.5 border print:border-gray-300 ${isDark ? "border-slate-700 text-white" : "border-gray-200 text-gray-900"}`}>
                        <div className="font-semibold">{it.product?.name || `Product #${it.product_id}`}</div>
                        {it.product?.product_code && (
                          <div className={`text-[10px] ${isDark ? "text-slate-400" : "text-gray-500"}`}>
                            Code: {it.product.product_code}
                            {it.product?.narcotic === "yes" ? " • [NARCOTIC]" : ""}
                          </div>
                        )}
                        {it.item_note && (
                          <div className={`text-[10px] italic mt-0.5 ${isDark ? "text-slate-400" : "text-gray-500"}`}>
                            Note: {it.item_note}
                          </div>
                        )}
                      </td>
                      <td className={`p-2.5 border font-mono print:border-gray-300 ${isDark ? "border-slate-700 text-slate-300" : "border-gray-200 text-gray-700"}`}>
                        <div>{it.batch_number || "Unbatched"}</div>
                        {it.expiry_date && (
                          <div className={`text-[10px] ${isDark ? "text-slate-400" : "text-gray-500"}`}>
                            Exp: {String(it.expiry_date).slice(0, 10)}
                          </div>
                        )}
                      </td>
                      <td className={`p-2.5 border text-right font-mono print:border-gray-300 ${isDark ? "border-slate-700 text-slate-400" : "border-gray-200 text-gray-600"}`}>
                        {Number(it.previous_qty || 0).toLocaleString()}
                      </td>
                      <td className={`p-2.5 border text-right font-mono font-bold print:border-gray-300 ${isDark ? "border-slate-700 text-rose-400" : "border-gray-200 text-red-600"}`}>
                        -{Number(it.dispose_qty || 0).toLocaleString()}
                      </td>
                      <td className={`p-2.5 border text-right font-mono print:border-gray-300 ${isDark ? "border-slate-700 text-slate-300" : "border-gray-200 text-gray-700"}`}>
                        {formatCurrency(it.unit_purchase_price || 0)}
                      </td>
                      <td className={`p-2.5 border text-right font-mono font-bold print:border-gray-300 ${isDark ? "border-slate-700 text-white" : "border-gray-200 text-gray-900"}`}>
                        {formatCurrency(it.cost_value || 0)}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
              </div>
            </div>

            {/* Totals Summary */}
            <div className="flex justify-end pt-2">
              <div className="w-72 space-y-1.5 text-xs">
                <div className={`flex justify-between py-1 border-b print:border-gray-200 ${isDark ? "border-slate-800" : "border-gray-200"}`}>
                  <span className={isDark ? "text-slate-400" : "text-gray-600"}>Total Units Isolated/Disposed:</span>
                  <span className={`font-bold font-mono ${isDark ? "text-white" : "text-gray-900"}`}>
                    {Number(disposal.total_qty || 0).toLocaleString()} Units
                  </span>
                </div>
                <div className={`flex justify-between py-1 border-b print:border-gray-200 ${isDark ? "border-slate-800" : "border-gray-200"}`}>
                  <span className={isDark ? "text-slate-400" : "text-gray-600"}>Retail Value Forgone:</span>
                  <span className={`font-mono ${isDark ? "text-slate-300" : "text-gray-700"}`}>
                    {formatCurrency(disposal.total_retail_value || 0)}
                  </span>
                </div>
                <div className={`flex justify-between py-1.5 border-b-2 font-bold print:border-gray-400 ${isDark ? "border-slate-700" : "border-gray-300"}`}>
                  <span className={isDark ? "text-slate-200" : "text-gray-800"}>Total Cost Write-Off (P&L):</span>
                  <span className={`font-mono text-sm ${isDark ? "text-rose-400" : "text-red-600"}`}>
                    {formatCurrency(disposal.total_cost_value || 0)}
                  </span>
                </div>
              </div>
            </div>

            {/* Signature Blocks for Regulatory & Audit Compliance */}
            <div className="grid grid-cols-1 sm:grid-cols-3 gap-6 pt-10 text-xs">
              <div className={`border-t pt-2 text-center ${isDark ? "border-slate-700 text-slate-400" : "border-gray-300 text-gray-600"}`}>
                <p className={`font-semibold ${isDark ? "text-slate-200" : "text-gray-800"}`}>
                  {disposal.creator?.name || "________________"}
                </p>
                <p className="text-[10px] uppercase tracking-wider mt-0.5">Prepared / Quarantined By</p>
              </div>

              <div className={`border-t pt-2 text-center ${isDark ? "border-slate-700 text-slate-400" : "border-gray-300 text-gray-600"}`}>
                <p className={`font-semibold ${isDark ? "text-slate-200" : "text-gray-800"}`}>
                  {disposal.witness_name || "________________"}
                </p>
                <p className="text-[10px] uppercase tracking-wider mt-0.5">
                  Witnessed By ({disposal.witness_designation || "Pharmacist / Inspector"})
                </p>
              </div>

              <div className={`border-t pt-2 text-center ${isDark ? "border-slate-700 text-slate-400" : "border-gray-300 text-gray-600"}`}>
                <p className={`font-semibold ${isDark ? "text-slate-200" : "text-gray-800"}`}>
                  {disposal.disposer?.name || "________________"}
                </p>
                <p className="text-[10px] uppercase tracking-wider mt-0.5">Approved & Disposed By</p>
              </div>
            </div>
          </div>
        </GlassCard>
      </div>

      <ShareDocumentModal
        isOpen={shareOpen && Boolean(disposal?.id)}
        onClose={() => setShareOpen(false)}
        documentType="stock_disposal"
        documentId={disposal?.id}
      />
    </div>
  );
}

