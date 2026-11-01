// resources/js/pages/stock-adjustments/Show.jsx
import React, { useCallback, useEffect, useMemo, useState } from "react";
import { Link, useNavigate, useParams } from "react-router-dom";
import axios from "axios";
import toast from "react-hot-toast";
import {
  ArrowLeftIcon,
  ArrowPathIcon,
  CalendarIcon,
  ClipboardDocumentListIcon,
  ClockIcon,
  CubeIcon,
  CurrencyDollarIcon,
  DocumentTextIcon,
  PrinterIcon,
  ShieldExclamationIcon,
  TrashIcon,
  UserIcon,
  ArrowTrendingUpIcon,
  ArrowTrendingDownIcon,
} from "@heroicons/react/24/solid";
import { usePermissions, Guard } from "@/api/usePermissions.js";
import { useTheme } from "@/context/ThemeContext";
import { useCurrency } from "@/context/CurrencyContext";
import { getThemeButtonClasses } from "@/utils/buttonStyles";
import { GlassCard, DeleteConfirmationModal } from "@/components";
import PageSkeleton from "@/components/PageSkeleton.jsx";
import DocumentHistoryModal from "@/components/DocumentHistoryModal.jsx";

const getContrastText = (hexColor) => {
  hexColor = (hexColor || "#3b82f6").replace("#", "");
  const r = parseInt(hexColor.substring(0, 2), 16) || 0;
  const g = parseInt(hexColor.substring(2, 4), 16) || 0;
  const b = parseInt(hexColor.substring(4, 6), 16) || 0;
  const luminance = (0.299 * r + 0.587 * g + 0.114 * b) / 255;
  return luminance > 0.5 ? "#1f2937" : "#ffffff";
};

export default function ShowStockAdjustment() {
  const { id } = useParams();
  const navigate = useNavigate();
  const { isDark, theme } = useTheme();
  const { formatCurrency } = useCurrency();
  const { loading: permsLoading, canFor } = usePermissions();

  const can = useMemo(
    () =>
      typeof canFor === "function"
        ? canFor("stock-adjustment")
        : { view: false, create: false, update: false, delete: false },
    [canFor]
  );

  const [adj, setAdj] = useState(null);
  const [loading, setLoading] = useState(true);
  const [fetchErr, setFetchErr] = useState(null);

  const [historyModalOpen, setHistoryModalOpen] = useState(false);
  const [deleteModalOpen, setDeleteModalOpen] = useState(false);
  const [deleting, setDeleting] = useState(false);

  const themeColors = useMemo(
    () => ({
      primary: theme?.primary_color || "#3b82f6",
      primaryHover: theme?.primary_hover || "#2563eb",
      primaryLight: theme?.primary_light || "#dbeafe",
      secondary: theme?.secondary_color || "#8b5cf6",
      secondaryHover: theme?.secondary_hover || "#7c3aed",
      secondaryLight: theme?.secondary_light || "#ede9fe",
      tertiary: theme?.tertiary_color || "#06b6d4",
      tertiaryHover: theme?.tertiary_hover || "#0891b2",
      danger: theme?.danger_color || "#ef4444",
      dangerHover: "#dc2626",
    }),
    [theme]
  );

  const primaryTextColor = useMemo(
    () => getContrastText(themeColors.primaryHover || themeColors.primary),
    [themeColors]
  );

  const buttonStyle = theme?.button_style || "modern";
  const buttonClasses = useMemo(
    () => getThemeButtonClasses(buttonStyle, themeColors, isDark, primaryTextColor),
    [buttonStyle, themeColors, isDark, primaryTextColor]
  );

  const btnPrimary = buttonClasses.primary;
  const btnSecondary = buttonClasses.secondary;
  const btnTertiary = buttonClasses.tertiary;
  const btnDanger = buttonClasses.danger;

  const fetchAdjustment = useCallback(async () => {
    if (permsLoading || !can.view) return;
    try {
      setLoading(true);
      setFetchErr(null);
      const { data } = await axios.get(`/api/stock-adjustments/${id}`);
      setAdj(data);
    } catch (e) {
      const status = e?.response?.status;
      if (status === 403) setFetchErr("You don't have permission to view this stock adjustment.");
      else if (status === 404) setFetchErr("Stock adjustment not found.");
      else setFetchErr("Failed to load stock adjustment details.");
    } finally {
      setLoading(false);
    }
  }, [id, permsLoading, can.view]);

  useEffect(() => {
    fetchAdjustment();
  }, [fetchAdjustment]);

  const formatDate = (dateStr) => {
    if (!dateStr) return "—";
    const date = new Date(dateStr);
    if (isNaN(date.getTime())) return String(dateStr).slice(0, 10);
    return date.toLocaleDateString("en-GB", {
      day: "numeric",
      month: "short",
      year: "numeric",
    });
  };

  const metrics = useMemo(() => {
    const items = adj?.items || [];
    let overageUnits = 0;
    let overageValue = 0;
    let shortageUnits = 0;
    let shortageValue = 0;

    items.forEach((it) => {
      const diff = Number(it.diff_qty ?? Number(it.actual_qty || 0) - Number(it.previous_qty || 0));
      const unitCost = Number(it.unit_purchase_price || 0);
      const val = Math.abs(diff) * unitCost;
      if (diff > 0) {
        overageUnits += diff;
        overageValue += val;
      } else if (diff < 0) {
        shortageUnits += Math.abs(diff);
        shortageValue += val;
      }
    });

    const netSignedValue = overageValue - shortageValue;
    return {
      totalItems: items.length,
      overageUnits,
      overageValue,
      shortageUnits,
      shortageValue,
      totalWorth: Number(adj?.total_worth || overageValue + shortageValue),
      netSignedValue,
    };
  }, [adj]);

  const handleConfirmDelete = async (password) => {
    if (!adj?.id || !can.delete) return;
    try {
      setDeleting(true);
      await axios.post("/api/auth/confirm-password", { password });
      await axios.delete(`/api/stock-adjustments/${adj.id}`);
      toast.success("Stock adjustment deleted and inventory restored");
      setDeleteModalOpen(false);
      navigate("/stock-adjustments");
    } catch (err) {
      const status = err?.response?.status;
      const apiMsg =
        err?.response?.data?.message ||
        (status === 422 ? "Incorrect password" : "Failed to delete stock adjustment");
      toast.error(apiMsg);
    } finally {
      setDeleting(false);
    }
  };

  if (permsLoading || loading) {
    return <PageSkeleton />;
  }

  if (!can.view) {
    return (
      <div className="p-6 text-sm text-rose-500">
        You don&apos;t have permission to view stock adjustments.
      </div>
    );
  }

  if (fetchErr || !adj) {
    return (
      <div className="p-6 space-y-4">
        <div className="p-4 rounded-xl bg-rose-500/10 border border-rose-500/20 text-rose-500 text-sm">
          {fetchErr || "Adjustment not found."}
        </div>
        <Link
          to="/stock-adjustments"
          className="inline-flex items-center gap-2 px-4 py-2 rounded-xl text-xs font-semibold bg-slate-200 dark:bg-slate-800 text-slate-700 dark:text-slate-200"
        >
          <ArrowLeftIcon className="w-4 h-4" />
          Back to Stock Adjustments
        </Link>
      </div>
    );
  }

  const items = adj.items || [];
  const stocktakeSession = adj.stocktake_session;
  const stockDisposal = adj.stock_disposal;
  const linkedExpense = adj.expense;

  return (
    <div className="space-y-5 px-1 pb-12" id="stock-adjustment-voucher-root">
      <style>{`
        .sa-table-wrapper {
          overflow: auto;
          max-inline-size: 100%;
          max-block-size: min(650px, 75vh);
          container-type: inline-size;
        }
        .sa-table {
          border-collapse: separate;
          border-spacing: 0;
          --label-2: "Code / Barcode";
          --label-3: "Batch & Expiry";
          --label-4: "System Qty";
          --label-5: "Actual Qty";
          --label-6: "Variance Diff";
          --label-7: "Unit Cost";
          --label-8: "Worth Adjusted";
        }
        .sa-table thead {
          position: sticky;
          inset-block-start: 0;
          z-index: 2;
        }
        @container (width < 640px) {
          .sa-table, .sa-table thead, .sa-table tbody, .sa-table tbody tr, .sa-table tbody th, .sa-table tbody td, .sa-table tfoot, .sa-table tfoot tr {
            display: block;
          }
          .sa-table thead {
            display: none;
          }
          .sa-table tbody tr {
            margin-block-end: 1rem;
            border: 1px solid rgba(148, 163, 184, 0.25);
            border-radius: 0.75rem;
            overflow: hidden;
          }
          .sa-table tbody th {
            position: sticky;
            inset-block-start: 0;
            z-index: 2;
          }
          .sa-table tbody td {
            display: flex;
            justify-content: space-between;
            align-items: center;
            text-align: end;
          }
          .sa-table tbody td:nth-child(2)::before {
            content: var(--label-2) ": " / var(--label-2);
            font-weight: 600;
            opacity: 0.75;
          }
          .sa-table tbody td:nth-child(3)::before {
            content: var(--label-3) ": " / var(--label-3);
            font-weight: 600;
            opacity: 0.75;
          }
          .sa-table tbody td:nth-child(4)::before {
            content: var(--label-4) ": " / var(--label-4);
            font-weight: 600;
            opacity: 0.75;
          }
          .sa-table tbody td:nth-child(5)::before {
            content: var(--label-5) ": " / var(--label-5);
            font-weight: 600;
            opacity: 0.75;
          }
          .sa-table tbody td:nth-child(6)::before {
            content: var(--label-6) ": " / var(--label-6);
            font-weight: 600;
            opacity: 0.75;
          }
          .sa-table tbody td:nth-child(7)::before {
            content: var(--label-7) ": " / var(--label-7);
            font-weight: 600;
            opacity: 0.75;
          }
          .sa-table tbody td:nth-child(8)::before {
            content: var(--label-8) ": " / var(--label-8);
            font-weight: 600;
            opacity: 0.75;
          }
          .sa-table tfoot tr {
            display: flex;
            flex-wrap: wrap;
            justify-content: space-between;
            align-items: center;
            border-radius: 0.75rem;
          }
        }
        @media print {
          body * { visibility: hidden; }
          #stock-adjustment-voucher-root, #stock-adjustment-voucher-root * { visibility: visible; }
          #stock-adjustment-voucher-root {
            position: absolute;
            left: 0;
            top: 0;
            width: 100%;
            margin: 0;
            padding: 16px;
          }
          .no-print { display: none !important; }
          .sa-table-wrapper { max-block-size: none !important; overflow: visible !important; }
        }
      `}</style>

      {/* Top Header & Actions */}
      <div className="products-panel px-6 py-5">
        <div className="flex flex-col lg:flex-row lg:items-center justify-between gap-4">
          <div className="flex items-start sm:items-center gap-4">
            <div className="products-identity-icon shrink-0">
              <ClipboardDocumentListIcon className="w-6 h-6 text-white" />
            </div>
            <div>
              <div className="flex flex-wrap items-center gap-2.5">
                <h1 className="products-title font-mono">{adj.posted_number}</h1>
                {stocktakeSession ? (
                  <Link
                    to={`/stocktake-sessions/${stocktakeSession.id}`}
                    className="inline-flex items-center gap-1 px-2.5 py-0.5 rounded-full text-xs font-semibold bg-emerald-500/20 text-emerald-100 border border-emerald-300/30 hover:bg-emerald-500/30 transition-colors"
                  >
                    <ClipboardDocumentListIcon className="w-3.5 h-3.5" />
                    Stocktake: {stocktakeSession.reference_no}
                  </Link>
                ) : stockDisposal ? (
                  <Link
                    to="/stock-disposals"
                    className="inline-flex items-center gap-1 px-2.5 py-0.5 rounded-full text-xs font-semibold bg-rose-500/20 text-rose-100 border border-rose-300/30 hover:bg-rose-500/30 transition-colors"
                  >
                    <ShieldExclamationIcon className="w-3.5 h-3.5" />
                    Disposal: {stockDisposal.disposal_number}
                  </Link>
                ) : (
                  <span className="inline-flex items-center gap-1 px-2.5 py-0.5 rounded-full text-xs font-semibold bg-white/15 text-white border border-white/20">
                    Manual Count Adjustment
                  </span>
                )}

                {linkedExpense && (
                  <Link
                    to="/expenses"
                    className="inline-flex items-center gap-1 px-2.5 py-0.5 rounded-full text-xs font-mono font-semibold bg-amber-500/25 text-amber-100 border border-amber-300/30 hover:bg-amber-500/35 transition-colors"
                    title="Non-cash P&L Shrinkage Write-Off Expense"
                  >
                    P&amp;L Write-Off: {linkedExpense.expense_number} ({formatCurrency(linkedExpense.amount)})
                  </Link>
                )}
              </div>

              <div className="flex flex-wrap items-center gap-4 mt-1.5 text-xs text-white/85">
                <span className="inline-flex items-center gap-1.5">
                  <CalendarIcon className="w-3.5 h-3.5" />
                  Date: <strong>{formatDate(adj.posted_date)}</strong>
                </span>
                {adj.user && (
                  <span className="inline-flex items-center gap-1.5">
                    <UserIcon className="w-3.5 h-3.5" />
                    Posted by: <strong>{adj.user.name}</strong>
                  </span>
                )}
                <span className="inline-flex items-center gap-1.5">
                  <CubeIcon className="w-3.5 h-3.5" />
                  <strong>{items.length}</strong> Line Item{items.length === 1 ? "" : "s"}
                </span>
              </div>
            </div>
          </div>

          {/* Action Toolbar */}
          <div className="flex flex-wrap items-center gap-2 no-print">
            <Link
              to="/stock-adjustments"
              className="products-action theme-btn-tertiary"
              title="Back to Stock Adjustments"
            >
              <ArrowLeftIcon className="w-4 h-4" />
              <span>Back</span>
            </Link>

            <button
              type="button"
              onClick={() => setHistoryModalOpen(true)}
              className="products-action theme-btn-tertiary"
              title="View Audit History"
            >
              <ClockIcon className="w-4 h-4" />
              <span>History</span>
            </button>

            <button
              type="button"
              onClick={() => window.print()}
              className={`products-action ${btnSecondary.className}`}
              style={btnSecondary.style}
              title="Print Stock Adjustment Voucher"
            >
              <PrinterIcon className="w-4 h-4" />
              <span>Print Voucher</span>
            </button>

            <Guard when={can.delete}>
              <button
                type="button"
                onClick={() => setDeleteModalOpen(true)}
                className={`products-action ${btnDanger.className}`}
                style={btnDanger.style}
                title="Delete & Reverse Stock Adjustment"
              >
                <TrashIcon className="w-4 h-4" />
                <span>Delete</span>
              </button>
            </Guard>
          </div>
        </div>
      </div>

      {/* Summary KPI Cards */}
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
        <GlassCard className="p-4">
          <div className="flex items-center justify-between">
            <span className={`text-xs font-semibold uppercase tracking-wider ${isDark ? "text-slate-400" : "text-slate-500"}`}>
              Items Adjusted
            </span>
            <CubeIcon className="w-5 h-5 text-blue-500" />
          </div>
          <div className={`text-2xl font-bold mt-1.5 ${isDark ? "text-white" : "text-slate-900"}`}>
            {metrics.totalItems}
          </div>
          <p className={`text-xs mt-1 ${isDark ? "text-slate-400" : "text-slate-500"}`}>
             Audited product / batch lines
          </p>
        </GlassCard>

        <GlassCard className="p-4">
          <div className="flex items-center justify-between">
            <span className={`text-xs font-semibold uppercase tracking-wider ${isDark ? "text-slate-400" : "text-slate-500"}`}>
              Overages (Stock Gain)
            </span>
            <ArrowTrendingUpIcon className="w-5 h-5 text-emerald-500" />
          </div>
          <div className="text-2xl font-bold mt-1.5 text-emerald-600 dark:text-emerald-400 font-mono">
            +{metrics.overageUnits.toLocaleString()} <span className="text-xs font-sans font-medium">units</span>
          </div>
          <p className={`text-xs mt-1 font-mono ${isDark ? "text-slate-400" : "text-slate-500"}`}>
            Value: +{formatCurrency(metrics.overageValue)}
          </p>
        </GlassCard>

        <GlassCard className="p-4">
          <div className="flex items-center justify-between">
            <span className={`text-xs font-semibold uppercase tracking-wider ${isDark ? "text-slate-400" : "text-slate-500"}`}>
              Shortages (Shrinkage)
            </span>
            <ArrowTrendingDownIcon className="w-5 h-5 text-rose-500" />
          </div>
          <div className="text-2xl font-bold mt-1.5 text-rose-600 dark:text-rose-400 font-mono">
            -{metrics.shortageUnits.toLocaleString()} <span className="text-xs font-sans font-medium">units</span>
          </div>
          <p className={`text-xs mt-1 font-mono ${isDark ? "text-slate-400" : "text-slate-500"}`}>
            Value: -{formatCurrency(metrics.shortageValue)}
          </p>
        </GlassCard>

        <GlassCard className="p-4">
          <div className="flex items-center justify-between">
            <span className={`text-xs font-semibold uppercase tracking-wider ${isDark ? "text-slate-400" : "text-slate-500"}`}>
              Total Worth Adjusted
            </span>
            <CurrencyDollarIcon className="w-5 h-5 text-purple-500" />
          </div>
          <div className={`text-2xl font-bold mt-1.5 font-mono ${isDark ? "text-white" : "text-slate-900"}`}>
            {formatCurrency(metrics.totalWorth)}
          </div>
          <p
            className={`text-xs mt-1 font-mono font-semibold ${
              metrics.netSignedValue < 0
                ? "text-rose-500"
                : metrics.netSignedValue > 0
                ? "text-emerald-500"
                : isDark
                ? "text-slate-400"
                : "text-slate-500"
            }`}
          >
            Net Impact: {metrics.netSignedValue >= 0 ? "+" : "-"}
            {formatCurrency(Math.abs(metrics.netSignedValue))}
          </p>
        </GlassCard>
      </div>

      {/* Reason / Audit Note Banner */}
      <GlassCard className="p-4">
        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3">
          <div className="flex items-start gap-3">
            <DocumentTextIcon className="w-5 h-5 text-blue-500 mt-0.5 shrink-0" />
            <div>
              <div className={`text-xs font-bold uppercase tracking-wider ${isDark ? "text-slate-400" : "text-slate-500"}`}>
                Adjustment Reason &amp; Audit Note
              </div>
              <p className={`text-sm mt-1 ${isDark ? "text-slate-200" : "text-slate-800"}`}>
                {adj.note || "No note recorded."}
              </p>
            </div>
          </div>

          {stocktakeSession && (
            <Link
              to={`/stocktake-sessions/${stocktakeSession.id}/review`}
              className={`inline-flex items-center gap-1.5 px-3.5 py-2 rounded-xl text-xs font-semibold shrink-0 no-print ${btnTertiary.className}`}
              style={btnTertiary.style}
            >
              <ClipboardDocumentListIcon className="w-4 h-4" />
              <span>Open Stocktake Variance Review ({stocktakeSession.reference_no})</span>
            </Link>
          )}
        </div>
      </GlassCard>

      {/* Adjusted Line Items Table */}
      <GlassCard className="overflow-hidden">
        <div
          className={`flex items-center justify-between px-5 py-3.5 border-b ${
            isDark ? "border-slate-700 bg-slate-800/40" : "border-slate-200 bg-slate-50/70"
          }`}
        >
          <div className="flex items-center gap-2">
            <ClipboardDocumentListIcon className="w-4 h-4" style={{ color: themeColors.primary }} />
            <h2 className={`text-sm font-bold ${isDark ? "text-slate-100" : "text-slate-800"}`}>
              Stock Adjustment Line Items
            </h2>
          </div>
          <span className={`text-xs ${isDark ? "text-slate-400" : "text-slate-500"}`}>
            {items.length} item{items.length === 1 ? "" : "s"}
          </span>
        </div>

        <div className="sa-table-wrapper" role="region" aria-label="Adjusted inventory items" tabIndex={0}>
          <table className="sa-table w-full text-sm">
            <thead>
              <tr
                className={`border-b text-xs font-semibold uppercase tracking-wider ${
                  isDark
                    ? "bg-slate-800 text-slate-300 border-slate-700"
                    : "bg-slate-100 text-slate-600 border-slate-200"
                }`}
              >
                <th scope="col" className="py-3 px-4 text-left">Product</th>
                <th scope="col" className="py-3 px-4 text-left">Code / Barcode</th>
                <th scope="col" className="py-3 px-4 text-left">Batch &amp; Expiry</th>
                <th scope="col" className="py-3 px-4 text-right">Previous Qty</th>
                <th scope="col" className="py-3 px-4 text-right">Actual Qty</th>
                <th scope="col" className="py-3 px-4 text-right">Variance Diff</th>
                <th scope="col" className="py-3 px-4 text-right">Unit Cost</th>
                <th scope="col" className="py-3 px-4 text-right">Worth Adjusted</th>
              </tr>
            </thead>
            <tbody className={`divide-y ${isDark ? "divide-slate-800" : "divide-slate-100"}`}>
              {items.length === 0 ? (
                <tr>
                  <td colSpan={8} className="py-12 text-center text-slate-400 text-sm">
                    No adjustment items recorded on this voucher.
                  </td>
                </tr>
              ) : (
                items.map((item, idx) => {
                  const prevQty = Number(item.previous_qty || 0);
                  const actualQty = Number(item.actual_qty || 0);
                  const diffQty = Number(item.diff_qty ?? actualQty - prevQty);
                  const unitCost = Number(item.unit_purchase_price || 0);
                  const worth = Number(item.worth_adjusted ?? Math.abs(diffQty) * unitCost);
                  const isPositive = diffQty > 0;
                  const isNegative = diffQty < 0;

                  return (
                    <tr
                      key={item.id || idx}
                      className={`transition-colors ${
                        isDark ? "hover:bg-slate-800/40" : "hover:bg-slate-50/80"
                      }`}
                    >
                      <th
                        scope="row"
                        className={`py-3 px-4 text-left font-semibold ${
                          isDark ? "bg-slate-900/90 text-slate-100" : "bg-white text-slate-900"
                        }`}
                      >
                        <div className="flex items-center gap-2">
                          <span className={`text-xs font-mono ${isDark ? "text-slate-500" : "text-slate-400"}`}>
                            #{idx + 1}
                          </span>
                          <span>{item.product?.name || `Product #${item.product_id}`}</span>
                        </div>
                        {item.product?.rack && (
                          <div className={`text-[11px] font-normal mt-0.5 ${isDark ? "text-slate-400" : "text-slate-500"}`}>
                            Rack: {item.product.rack}
                          </div>
                        )}
                      </th>

                      <td className={`py-3 px-4 font-mono text-xs ${isDark ? "text-slate-300" : "text-slate-600"}`}>
                        <div>{item.product?.product_code || "—"}</div>
                        {item.product?.barcode && (
                          <div className={`text-[11px] ${isDark ? "text-slate-500" : "text-slate-400"}`}>
                            {item.product.barcode}
                          </div>
                        )}
                      </td>

                      <td className={`py-3 px-4 text-xs ${isDark ? "text-slate-300" : "text-slate-600"}`}>
                        {item.batch_number ? (
                          <div>
                            <span className="font-mono font-semibold">{item.batch_number}</span>
                            {item.expiry && (
                              <div className={`text-[11px] ${isDark ? "text-slate-400" : "text-slate-500"}`}>
                                Exp: {formatDate(item.expiry)}
                              </div>
                            )}
                          </div>
                        ) : (
                          <span className="italic opacity-60">Product-level</span>
                        )}
                      </td>

                      <td className={`py-3 px-4 text-right font-mono ${isDark ? "text-slate-300" : "text-slate-700"}`}>
                        {prevQty.toLocaleString()}
                      </td>

                      <td className={`py-3 px-4 text-right font-mono font-semibold ${isDark ? "text-white" : "text-slate-900"}`}>
                        {actualQty.toLocaleString()}
                      </td>

                      <td className="py-3 px-4 text-right font-mono font-bold">
                        <span
                          className={`inline-flex items-center px-2 py-0.5 rounded-full text-xs ${
                            isPositive
                              ? "bg-emerald-100 text-emerald-700 dark:bg-emerald-900/40 dark:text-emerald-300"
                              : isNegative
                              ? "bg-rose-100 text-rose-700 dark:bg-rose-900/40 dark:text-rose-300"
                              : "bg-slate-100 text-slate-600 dark:bg-slate-800 dark:text-slate-400"
                          }`}
                        >
                          {isPositive ? `+${diffQty.toLocaleString()}` : diffQty.toLocaleString()}
                        </span>
                      </td>

                      <td className={`py-3 px-4 text-right font-mono ${isDark ? "text-slate-300" : "text-slate-700"}`}>
                        {formatCurrency(unitCost)}
                      </td>

                      <td className={`py-3 px-4 text-right font-mono font-bold ${isDark ? "text-white" : "text-slate-900"}`}>
                        {formatCurrency(worth)}
                      </td>
                    </tr>
                  );
                })
              )}
            </tbody>
            {items.length > 0 && (
              <tfoot>
                <tr
                  className={`border-t font-bold text-xs uppercase ${
                    isDark
                      ? "border-slate-700 bg-slate-800/70 text-slate-200"
                      : "border-slate-200 bg-slate-50 text-slate-800"
                  }`}
                >
                  <td colSpan={5} className="py-3 px-4 text-right">
                    Total Adjustment Summary
                  </td>
                  <td className="py-3 px-4 text-right font-mono">
                    <span className="text-emerald-500 mr-2">+{metrics.overageUnits}</span>
                    <span className="text-rose-500">-{metrics.shortageUnits}</span>
                  </td>
                  <td className="py-3 px-4 text-right">—</td>
                  <td className="py-3 px-4 text-right font-mono text-sm">
                    {formatCurrency(metrics.totalWorth)}
                  </td>
                </tr>
              </tfoot>
            )}
          </table>
        </div>
      </GlassCard>

      {/* Print-only Signature Block */}
      <div className="hidden print:grid grid-cols-2 gap-16 pt-16 text-center text-xs text-gray-600">
        <div className="border-t border-gray-400 pt-2">
          Counted / Prepared By ({adj.user?.name || "Storekeeper"})
        </div>
        <div className="border-t border-gray-400 pt-2">
          Verified &amp; Approved By (Pharmacist / Store Manager)
        </div>
      </div>

      {/* Audit History Modal */}
      <DocumentHistoryModal
        isOpen={historyModalOpen}
        onClose={() => setHistoryModalOpen(false)}
        entityType="stock_adjustment"
        entityId={adj.id}
        documentNumber={adj.posted_number}
      />

      {/* Delete Confirmation Modal */}
      <DeleteConfirmationModal
        isOpen={deleteModalOpen}
        onClose={() => setDeleteModalOpen(false)}
        onConfirm={handleConfirmDelete}
        itemName={adj.posted_number}
        title="Delete stock adjustment"
        isDeleting={deleting}
        setIsDeleting={setDeleting}
        tintClasses={{
          red: btnDanger.className,
          redStyle: btnDanger.style,
        }}
      />
    </div>
  );
}

