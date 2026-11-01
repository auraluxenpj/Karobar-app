// resources/js/pages/stocktake/Review.jsx
// Variance review and finalization page for a stocktake session.
import React, { useCallback, useEffect, useMemo, useState } from "react";
import { useNavigate, useParams, Link } from "react-router-dom";
import axios from "axios";
import toast from "react-hot-toast";
import {
  ClipboardDocumentListIcon,
  ArrowLeftIcon,
  CheckCircleIcon,
  ArrowPathIcon,
  ExclamationTriangleIcon,
  ArrowTrendingUpIcon,
  ArrowTrendingDownIcon,
  InformationCircleIcon,
  PrinterIcon,
} from "@heroicons/react/24/solid";
import { useTheme } from "@/context/ThemeContext";
import { getThemeButtonClasses } from "@/utils/buttonStyles";
import { GlassCard, GlassSectionHeader } from "@/components";
import ShareDocumentModal from "@/components/ShareDocumentModal.jsx";

const getContrastText = (hex) => {
  hex = (hex || "#3b82f6").replace("#", "");
  const r = parseInt(hex.substring(0, 2), 16);
  const g = parseInt(hex.substring(2, 4), 16);
  const b = parseInt(hex.substring(4, 6), 16);
  return (0.299 * r + 0.587 * g + 0.114 * b) / 255 > 0.5 ? "#1f2937" : "#ffffff";
};

const REASON_OPTIONS = [
  { value: "", label: "Select reason…" },
  { value: "Data Entry Error", label: "Data Entry Error" },
  { value: "Damaged / Written Off", label: "Damaged / Written Off" },
  { value: "Theft / Shrinkage", label: "Theft / Shrinkage" },
  { value: "Misplacement / Found", label: "Misplacement / Found" },
  { value: "Supplier Shortage", label: "Supplier Shortage" },
  { value: "Expired / Disposed", label: "Expired / Disposed" },
  { value: "Counting Error", label: "Counting Error" },
  { value: "System Error", label: "System Error" },
  { value: "Other", label: "Other" },
];

export default function StocktakeReview() {
  const { id } = useParams();
  const navigate = useNavigate();
  const { isDark, theme } = useTheme();

  const [session, setSession] = useState(null);
  const [items, setItems] = useState([]);
  const [loading, setLoading] = useState(true);
  const [finalizing, setFinalizing] = useState(false);
  const [shareOpen, setShareOpen] = useState(false);

  // Per-item reason state: { [itemId]: string }
  const [reasons, setReasons] = useState({});

  const themeColors = useMemo(() => ({
    primary: theme?.primary_color || "#3b82f6",
    primaryHover: theme?.primary_hover || "#2563eb",
    primaryLight: theme?.primary_light || "#dbeafe",
    secondary: theme?.secondary_color || "#8b5cf6",
    secondaryHover: theme?.secondary_hover || "#7c3aed",
    danger: theme?.danger_color || "#ef4444",
    dangerHover: "#dc2626",
  }), [theme]);

  const primaryTextColor = useMemo(
    () => getContrastText(themeColors.primaryHover || themeColors.primary),
    [themeColors]
  );
  const buttonStyle = theme?.button_style || "modern";
  const getButtonClasses = useMemo(
    () => getThemeButtonClasses(buttonStyle, themeColors, isDark),
    [buttonStyle, themeColors, isDark]
  );
  const btnPrimary = getButtonClasses.primary;

  // Load data (items are always shown with system_qty in review mode)
  const loadData = useCallback(async () => {
    setLoading(true);
    try {
      const [sessRes, itemsRes] = await Promise.all([
        axios.get(`/api/stocktake-sessions/${id}`),
        // Pass a flag to get system_qty even in blind mode (review always shows truth)
        axios.get(`/api/stocktake-sessions/${id}/items`, { params: { reveal: 1 } }),
      ]);
      setSession(sessRes.data);
      const list = Array.isArray(itemsRes.data?.data) ? itemsRes.data.data : (Array.isArray(itemsRes.data) ? itemsRes.data : []);
      setItems(list);

      // Init reasons from existing data
      const initReasons = {};
      list.forEach((it) => { initReasons[it.id] = it.discrepancy_reason || ""; });
      setReasons(initReasons);
    } catch {
      toast.error("Failed to load review data");
    } finally {
      setLoading(false);
    }
  }, [id]);

  useEffect(() => { loadData(); }, [loadData]);

  // Split items
  const { matchedItems, discrepancyItems, summary } = useMemo(() => {
    const matched = items.filter((it) => parseFloat(it.variance_qty) === 0);
    const discrepancy = items.filter((it) => parseFloat(it.variance_qty) !== 0);

    let surplusUnits = 0, shortageUnits = 0, surplusValue = 0, shortageValue = 0;
    discrepancy.forEach((it) => {
      const v = parseFloat(it.variance_qty);
      const val = parseFloat(it.variance_value);
      if (v > 0) { surplusUnits += v; surplusValue += Math.abs(val); }
      else { shortageUnits += Math.abs(v); shortageValue += Math.abs(val); }
    });

    return {
      matchedItems: matched,
      discrepancyItems: discrepancy,
      summary: {
        total: items.length,
        matched: matched.length,
        discrepancies: discrepancy.length,
        surplusUnits, shortageUnits,
        surplusValue, shortageValue,
        netValue: surplusValue - shortageValue,
      },
    };
  }, [items]);

  // Save a discrepancy reason
  const handleSaveReason = async (item) => {
    const reason = reasons[item.id] || "";
    try {
      await axios.patch(`/api/stocktake-items/${item.id}`, {
        counted_qty: item.counted_qty,
        discrepancy_reason: reason || null,
      });
      toast.success("Reason saved");
    } catch {
      toast.error("Failed to save reason");
    }
  };

  // Finalize
  const handleFinalize = async () => {
    // Warn if discrepancy items missing reasons
    const missingReasons = discrepancyItems.filter((it) => !reasons[it.id]);
    if (missingReasons.length > 0) {
      const ok = confirm(
        `${missingReasons.length} discrepancy item(s) have no reason set. Finalize anyway?`
      );
      if (!ok) return;
    }

    if (!confirm("Finalize this stocktake? Stock quantities will be adjusted and this cannot be undone.")) return;

    setFinalizing(true);
    try {
      const { data } = await axios.post(`/api/stocktake-sessions/${id}/finalize`);
      toast.success(`✅ Session finalized — Stock adjustment ${data.stock_adjustment?.posted_number || ""} posted`);
      navigate("/stocktake-sessions");
    } catch (err) {
      toast.error(err?.response?.data?.message || "Finalization failed");
    } finally {
      setFinalizing(false);
    }
  };

  // Input/label helpers
  const inputCls = `rounded-lg border px-2.5 py-1.5 text-sm focus:outline-none focus:ring-2 transition-colors ${
    isDark
      ? "bg-slate-800 border-slate-600 text-slate-100 focus:ring-blue-500/40"
      : "bg-white border-slate-300 text-slate-900 focus:ring-blue-500/40"
  }`;

  if (loading) {
    return (
      <div className="flex items-center justify-center h-64">
        <ArrowPathIcon className="w-8 h-8 animate-spin text-slate-400" />
      </div>
    );
  }

  if (!session) return null;

  const isReadonly = session.status === "finalized" || session.status === "cancelled";

  return (
    <div className="space-y-5 px-1">
      {/* Header */}
      <div className="flex flex-wrap items-center gap-3">
        <Link
          to={`/stocktake-sessions/${id}`}
          className={`p-2 rounded-lg transition-colors ${
            isDark ? "hover:bg-slate-700 text-slate-400" : "hover:bg-slate-100 text-slate-500"
          }`}
        >
          <ArrowLeftIcon className="w-5 h-5" />
        </Link>
        <GlassSectionHeader
          title={`Review — ${session.reference_no}`}
          right={
            <span className={`text-xs ${isDark ? "text-slate-400" : "text-slate-500"}`}>
              Variance summary &amp; finalization
            </span>
          }
        />
        <div className="ml-auto flex items-center gap-2">
          <button
            type="button"
            onClick={() => setShareOpen(true)}
            className={`flex items-center gap-2 px-4 py-2.5 rounded-xl text-sm font-semibold border transition-colors ${
              isDark
                ? "bg-slate-800 border-slate-600 text-slate-200 hover:bg-slate-700"
                : "bg-white border-slate-300 text-slate-700 hover:bg-slate-50"
            }`}
          >
            <PrinterIcon className="w-4 h-4 text-blue-500" />
            Variance PDF / Print
          </button>
          {!isReadonly && (
            <button
              onClick={handleFinalize}
              disabled={finalizing}
              className={`flex items-center gap-2 px-5 py-2.5 rounded-xl text-sm font-bold transition-colors disabled:opacity-60 ${btnPrimary.className}`}
              style={btnPrimary.style}
            >
              <CheckCircleIcon className="w-5 h-5" />
              {finalizing ? "Finalizing…" : "Finalize & Post Adjustments"}
            </button>
          )}
        </div>
      </div>

      {/* Summary Cards */}
      <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
        {/* Total Items */}
        <GlassCard className="p-4 text-center">
          <p className={`text-xs uppercase tracking-wide mb-1 ${isDark ? "text-slate-400" : "text-slate-500"}`}>Total Items</p>
          <p className={`text-3xl font-bold ${isDark ? "text-slate-100" : "text-slate-800"}`}>{summary.total}</p>
        </GlassCard>

        {/* Matched */}
        <GlassCard className="p-4 text-center">
          <p className="text-xs uppercase tracking-wide mb-1 text-emerald-600 dark:text-emerald-400">Matched</p>
          <p className="text-3xl font-bold text-emerald-600 dark:text-emerald-400">{summary.matched}</p>
        </GlassCard>

        {/* Discrepancies */}
        <GlassCard className="p-4 text-center">
          <p className="text-xs uppercase tracking-wide mb-1 text-amber-600 dark:text-amber-400">Discrepancies</p>
          <p className="text-3xl font-bold text-amber-600 dark:text-amber-400">{summary.discrepancies}</p>
        </GlassCard>

        {/* Net Value Impact */}
        <GlassCard className="p-4 text-center">
          <p className={`text-xs uppercase tracking-wide mb-1 ${isDark ? "text-slate-400" : "text-slate-500"}`}>Net Value Impact</p>
          <p className={`text-2xl font-bold font-mono ${
            summary.netValue >= 0 ? "text-emerald-600 dark:text-emerald-400" : "text-red-600 dark:text-red-400"
          }`}>
            {summary.netValue >= 0 ? "+" : ""}Rs.{Math.abs(summary.netValue).toFixed(2)}
          </p>
        </GlassCard>
      </div>

      {/* Surplus / Shortage breakdown */}
      <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
        <GlassCard className={`p-4 border-l-4 border-emerald-500`}>
          <div className="flex items-center gap-2 mb-1">
            <ArrowTrendingUpIcon className="w-4 h-4 text-emerald-500" />
            <p className="text-sm font-semibold text-emerald-600 dark:text-emerald-400">Surplus (Gain)</p>
          </div>
          <p className="text-xl font-bold text-emerald-600 dark:text-emerald-400 font-mono">
            +{summary.surplusUnits.toFixed(2)} units
          </p>
          <p className="text-xs text-emerald-500 mt-0.5">≈ Rs.{summary.surplusValue.toFixed(2)}</p>
        </GlassCard>

        <GlassCard className={`p-4 border-l-4 border-red-500`}>
          <div className="flex items-center gap-2 mb-1">
            <ArrowTrendingDownIcon className="w-4 h-4 text-red-500" />
            <p className="text-sm font-semibold text-red-600 dark:text-red-400">Shortage (Loss)</p>
          </div>
          <p className="text-xl font-bold text-red-600 dark:text-red-400 font-mono">
            -{summary.shortageUnits.toFixed(2)} units
          </p>
          <p className="text-xs text-red-500 mt-0.5">≈ Rs.{summary.shortageValue.toFixed(2)}</p>
        </GlassCard>
      </div>

      {/* Discrepancies Table */}
      {discrepancyItems.length > 0 && (
        <div>
          <h2 className={`text-base font-bold mb-3 flex items-center gap-2 ${isDark ? "text-slate-200" : "text-slate-700"}`}>
            <ExclamationTriangleIcon className="w-5 h-5 text-amber-500" />
            Discrepancies ({discrepancyItems.length})
          </h2>
          <GlassCard className="overflow-hidden">
            <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr className={`border-b text-xs font-semibold uppercase tracking-wide ${
                  isDark ? "border-slate-700 bg-slate-800/60 text-slate-400" : "border-slate-200 bg-slate-50 text-slate-500"
                }`}>
                  <th className="py-3 px-4 text-left">Product</th>
                  <th className="py-3 px-4 text-left">Batch</th>
                  <th className="py-3 px-4 text-right">System Qty</th>
                  <th className="py-3 px-4 text-right">Counted</th>
                  <th className="py-3 px-4 text-right">Variance</th>
                  <th className="py-3 px-4 text-right">Value Impact</th>
                  <th className="py-3 px-4 text-left">Reason</th>
                  {!isReadonly && <th className="py-3 px-4 text-center">Save</th>}
                </tr>
              </thead>
              <tbody className={`divide-y ${isDark ? "divide-slate-800" : "divide-slate-100"}`}>
                {discrepancyItems.map((item) => {
                  const variance = parseFloat(item.variance_qty);
                  const isSurplus = variance > 0;
                  const valImpact = parseFloat(item.variance_value);
                  return (
                    <tr key={item.id} className={`transition-colors ${
                      isDark ? "hover:bg-slate-800/40" : "hover:bg-slate-50/70"
                    }`}>
                      {/* Product */}
                      <td className="py-3 px-4">
                        <div className={`font-medium ${isDark ? "text-slate-200" : "text-slate-800"}`}>
                          {item.product?.name || "—"}
                        </div>
                        {item.product?.rack && (
                          <div className={`text-xs ${isDark ? "text-slate-500" : "text-slate-400"}`}>
                            Rack: {item.product.rack}
                          </div>
                        )}
                      </td>

                      {/* Batch */}
                      <td className={`py-3 px-4 text-xs font-mono ${isDark ? "text-slate-400" : "text-slate-500"}`}>
                        {item.batch_number || "—"}
                        {item.expiry_date && (
                          <div className="mt-0.5">Exp: {new Date(item.expiry_date).toLocaleDateString()}</div>
                        )}
                      </td>

                      {/* System Qty */}
                      <td className={`py-3 px-4 text-right font-mono text-sm ${isDark ? "text-slate-300" : "text-slate-600"}`}>
                        {Number(item.system_qty).toFixed(2)}
                      </td>

                      {/* Counted */}
                      <td className={`py-3 px-4 text-right font-mono text-sm font-bold ${isDark ? "text-slate-100" : "text-slate-800"}`}>
                        {Number(item.counted_qty).toFixed(2)}
                      </td>

                      {/* Variance */}
                      <td className="py-3 px-4 text-right">
                        <span className={`font-bold font-mono text-sm ${
                          isSurplus
                            ? "text-emerald-600 dark:text-emerald-400"
                            : "text-red-600 dark:text-red-400"
                        }`}>
                          {isSurplus ? "+" : ""}{variance.toFixed(2)}
                        </span>
                      </td>

                      {/* Value Impact */}
                      <td className="py-3 px-4 text-right">
                        <span className={`text-xs font-mono ${
                          isSurplus
                            ? "text-emerald-600 dark:text-emerald-400"
                            : "text-red-600 dark:text-red-400"
                        }`}>
                          {isSurplus ? "+" : "-"}Rs.{Math.abs(valImpact).toFixed(2)}
                        </span>
                      </td>

                      {/* Reason */}
                      <td className="py-3 px-4">
                        {isReadonly ? (
                          <span className={`text-xs ${isDark ? "text-slate-400" : "text-slate-500"}`}>
                            {item.discrepancy_reason || "—"}
                          </span>
                        ) : (
                          <select
                            value={reasons[item.id] || ""}
                            onChange={(e) => setReasons((prev) => ({ ...prev, [item.id]: e.target.value }))}
                            className={`${inputCls} text-xs min-w-[160px]`}
                          >
                            {REASON_OPTIONS.map((o) => (
                              <option key={o.value} value={o.value}>{o.label}</option>
                            ))}
                          </select>
                        )}
                      </td>

                      {/* Save reason */}
                      {!isReadonly && (
                        <td className="py-3 px-4 text-center">
                          <button
                            onClick={() => handleSaveReason(item)}
                            disabled={!reasons[item.id]}
                            className={`px-3 py-1 rounded-lg text-xs font-semibold transition-colors disabled:opacity-40 ${btnPrimary.className}`}
                            style={btnPrimary.style}
                          >
                            Save
                          </button>
                        </td>
                      )}
                    </tr>
                  );
                })}
              </tbody>
            </table>
            </div>
          </GlassCard>
        </div>
      )}

      {/* Matched Items (collapsed summary) */}
      {matchedItems.length > 0 && (
        <GlassCard className="p-4">
          <div className="flex items-center gap-2">
            <CheckCircleIcon className="w-5 h-5 text-emerald-500" />
            <p className={`font-semibold text-sm ${isDark ? "text-slate-200" : "text-slate-700"}`}>
              {matchedItems.length} items matched (no variance) — no adjustment needed
            </p>
          </div>
        </GlassCard>
      )}

      {/* Finalized notice */}
      {session.status === "finalized" && (
        <GlassCard className={`p-5 border-l-4 border-emerald-500`}>
          <div className="flex items-start gap-3">
            <CheckCircleIcon className="w-6 h-6 text-emerald-500 mt-0.5 flex-shrink-0" />
            <div>
              <p className="font-bold text-emerald-600 dark:text-emerald-400">Session Finalized</p>
              <p className={`text-sm mt-1 ${isDark ? "text-slate-400" : "text-slate-500"}`}>
                Stock adjustments have been posted. View the linked stock adjustment for the full ledger entry.
              </p>
              {session.stock_adjustment_id && (
                <Link
                  to={`/stock-adjustments/${session.stock_adjustment_id}`}
                  className="mt-2 inline-flex items-center gap-1 text-sm font-medium"
                  style={{ color: themeColors.primary }}
                >
                  View Stock Adjustment →
                </Link>
              )}
            </div>
          </div>
        </GlassCard>
      )}

      {/* Bottom finalize CTA */}
      {!isReadonly && (
        <div className={`sticky bottom-4 flex flex-col sm:flex-row items-stretch sm:items-center justify-between gap-4 px-5 py-4 rounded-2xl shadow-xl ${
          isDark ? "bg-slate-800 border border-slate-700" : "bg-white border border-slate-200"
        }`}>
          <div className={`text-sm ${isDark ? "text-slate-300" : "text-slate-600"}`}>
            <span className="font-semibold">{summary.discrepancies}</span> discrepancies will adjust stock.{" "}
            <span className="font-semibold">{summary.matched}</span> items need no changes.
          </div>
          <button
            onClick={handleFinalize}
            disabled={finalizing}
            className={`flex items-center gap-2 px-6 py-3 rounded-xl text-sm font-bold transition-colors disabled:opacity-60 shadow-lg ${btnPrimary.className}`}
            style={btnPrimary.style}
          >
            <CheckCircleIcon className="w-5 h-5" />
            {finalizing ? "Posting adjustments…" : "Finalize & Post Adjustments"}
          </button>
        </div>
      )}

      <ShareDocumentModal
        isOpen={shareOpen && Boolean(session?.id)}
        onClose={() => setShareOpen(false)}
        documentType="stocktake_session"
        documentId={session?.id}
      />
    </div>
  );
}

