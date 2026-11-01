import React, { useCallback, useEffect, useMemo, useState } from "react";
import { useNavigate } from "react-router-dom";
import axios from "axios";
import toast from "react-hot-toast";
import Select from "react-select";
import {
  ShieldExclamationIcon,
  PlusCircleIcon,
  ArrowPathIcon,
  MagnifyingGlassIcon,
  EyeIcon,
  PrinterIcon,
  CheckCircleIcon,
  ClockIcon,
  ArrowUturnLeftIcon,
  TrashIcon,
  CalendarDaysIcon,
  XMarkIcon,
  FireIcon,
  ExclamationTriangleIcon,
  ChevronLeftIcon,
  ChevronRightIcon,
} from "@heroicons/react/24/solid";
import { useTheme } from "@/context/ThemeContext";
import { useCurrency } from "@/context/CurrencyContext";
import { getThemeButtonClasses } from "@/utils/buttonStyles";
import { GlassCard, GlassSectionHeader, GlassInput } from "@/components";
import { usePermissions } from "@/api/usePermissions.js";
import DisposalCertificateModal from "@/components/DisposalCertificateModal.jsx";

const CAUSE_OPTIONS = [
  { value: "all", label: "All Causes" },
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
  { value: "all", label: "All Disposal Methods" },
  { value: "incineration", label: "High-Temperature Incineration" },
  { value: "chemical_neutralization", label: "Chemical Neutralization / Encapsulation" },
  { value: "municipal_waste", label: "Authorized Bio-Hazard / Municipal Waste" },
  { value: "supplier_destruction", label: "Handed to Supplier (No Credit)" },
  { value: "drain_flush", label: "Authorized Dilution & Drain Flush" },
  { value: "quarantine_holding", label: "In Quarantine Bay (Pending Destruction)" },
  { value: "other", label: "Other Method" },
];

const FINALIZE_METHOD_OPTIONS = METHOD_OPTIONS.filter(
  (m) => m.value !== "all" && m.value !== "quarantine_holding"
);

export default function StockDisposalsIndex() {
  const navigate = useNavigate();
  const { isDark, theme } = useTheme();
  const { formatCurrency } = useCurrency();
  const { has } = usePermissions();
  const canCreateDisposal = has("stock-disposal.create");
  const canDispose = has("stock-disposal.dispose");
  const canRestore = has("stock-disposal.restore");
  const canViewExpiry = has("batch-expiry.view");

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
  const btnEmerald = buttonClasses.emerald;
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

  // State
  const [rows, setRows] = useState([]);
  const [loading, setLoading] = useState(true);
  const [page, setPage] = useState(1);
  const [lastPage, setLastPage] = useState(1);
  const [total, setTotal] = useState(0);
  const [summary, setSummary] = useState({
    quarantined_count: 0,
    quarantined_qty: 0,
    quarantined_value: 0,
    disposed_month_count: 0,
    disposed_month_qty: 0,
    disposed_month_value: 0,
    total_disposed_count: 0,
    total_writeoff_value: 0,
    narcotic_disposals_count: 0,
  });

  // Filters
  const [statusFilter, setStatusFilter] = useState("all");
  const [causeFilter, setCauseFilter] = useState("all");
  const [methodFilter, setMethodFilter] = useState("all");
  const [search, setSearch] = useState("");
  const [fromDate, setFromDate] = useState("");
  const [toDate, setToDate] = useState("");

  // Modals
  const [certificateDisposal, setCertificateDisposal] = useState(null);
  const [finalizingDisposal, setFinalizingDisposal] = useState(null);
  const [finalizeForm, setFinalizeForm] = useState({
    disposal_method: "incineration",
    witness_name: "",
    witness_designation: "",
    notes: "",
    record_expense: true,
  });
  const [submittingFinalize, setSubmittingFinalize] = useState(false);

  const [restoringDisposal, setRestoringDisposal] = useState(null);
  const [restoreReason, setRestoreReason] = useState("");
  const [submittingRestore, setSubmittingRestore] = useState(false);

  const fetchDisposals = useCallback(async () => {
    try {
      setLoading(true);
      const { data } = await axios.get("/api/stock-disposals", {
        params: {
          status: statusFilter,
          cause: causeFilter,
          disposal_method: methodFilter,
          search: search.trim() || undefined,
          from: fromDate || undefined,
          to: toDate || undefined,
          page,
          per_page: 20,
        },
      });
      const paginator = data?.disposals || {};
      setRows(Array.isArray(paginator.data) ? paginator.data : []);
      setTotal(paginator.total || 0);
      setLastPage(paginator.last_page || 1);
      if (data?.summary) {
        setSummary(data.summary);
      }
    } catch {
      toast.error("Failed to load quarantine & disposal register");
    } finally {
      setLoading(false);
    }
  }, [statusFilter, causeFilter, methodFilter, search, fromDate, toDate, page]);

  useEffect(() => {
    fetchDisposals();
  }, [fetchDisposals]);

  const handleViewCertificate = async (row) => {
    try {
      const { data } = await axios.get(`/api/stock-disposals/${row.id}`);
      setCertificateDisposal(data);
    } catch {
      toast.error("Failed to load certificate details");
    }
  };

  const openFinalizeModal = (row) => {
    setFinalizingDisposal(row);
    setFinalizeForm({
      disposal_method:
        row.disposal_method && row.disposal_method !== "quarantine_holding"
          ? row.disposal_method
          : "incineration",
      witness_name: row.witness_name || "",
      witness_designation: row.witness_designation || "Pharmacist / Store Manager",
      notes: row.notes || "",
      record_expense: row.record_expense ?? true,
    });
  };

  const handleConfirmFinalize = async (e) => {
    e.preventDefault();
    if (!finalizingDisposal) return;
    if (finalizingDisposal.has_narcotics && !finalizeForm.witness_name.trim()) {
      toast.error("Witness name is mandatory when disposing controlled / narcotic products.");
      return;
    }

    try {
      setSubmittingFinalize(true);
      const { data } = await axios.post(
        `/api/stock-disposals/${finalizingDisposal.id}/dispose`,
        finalizeForm
      );
      toast.success(data?.message || "Voucher disposed and written off to P&L");
      setFinalizingDisposal(null);
      fetchDisposals();
    } catch (err) {
      toast.error(err?.response?.data?.message || "Failed to finalize disposal");
    } finally {
      setSubmittingFinalize(false);
    }
  };

  const openRestoreModal = (row) => {
    setRestoringDisposal(row);
    setRestoreReason("");
  };

  const handleConfirmRestore = async (e) => {
    e.preventDefault();
    if (!restoringDisposal) return;

    try {
      setSubmittingRestore(true);
      const { data } = await axios.post(
        `/api/stock-disposals/${restoringDisposal.id}/restore`,
        { reason: restoreReason.trim() || "Cleared inspection / restored to shelf" }
      );
      toast.success(data?.message || "Stock restored to sellable inventory");
      setRestoringDisposal(null);
      fetchDisposals();
    } catch (err) {
      toast.error(err?.response?.data?.message || "Failed to restore stock");
    } finally {
      setSubmittingRestore(false);
    }
  };

  const inputCls = `rounded-xl border px-3 py-2 text-xs focus:outline-none focus:ring-2 transition-colors ${
    isDark
      ? "bg-slate-800 border-slate-600 text-slate-100 focus:ring-blue-500/40 placeholder-slate-500"
      : "bg-white border-gray-300 text-gray-900 focus:ring-blue-500/40 placeholder-gray-400"
  }`;

  return (
    <div className="space-y-5 px-1">
      {/* Page Header */}
      <GlassSectionHeader
        title="Quarantine & Scrap Disposal Register"
        right={
          <div className="flex flex-wrap items-center gap-2.5">
            <button
              type="button"
              onClick={fetchDisposals}
              className={`inline-flex items-center gap-2 px-4 py-2.5 text-sm font-semibold ${btnSecondary.className}`}
              style={btnSecondary.style}
            >
              <ArrowPathIcon className="w-4 h-4" />
              <span>Refresh</span>
            </button>
            {canViewExpiry && (
              <button
                type="button"
                onClick={() => navigate("/batch-expiry")}
                className={`inline-flex items-center gap-2 px-4 py-2.5 text-sm font-semibold ${btnSecondary.className}`}
                style={btnSecondary.style}
              >
                <ClockIcon className="w-4 h-4" />
                <span>Expiry Tracker</span>
              </button>
            )}
            {canCreateDisposal && (
              <button
                type="button"
                onClick={() => navigate("/stock-disposals/create")}
                className={`inline-flex items-center gap-2 px-4 py-2.5 text-sm font-semibold ${btnPrimary.className}`}
                style={btnPrimary.style}
              >
                <PlusCircleIcon className="w-4 h-4" />
                <span>New Quarantine / Disposal</span>
              </button>
            )}
          </div>
        }
      />

      {/* 4 KPI Cards */}
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-3.5">
        <GlassCard className="p-4 border-l-4 border-l-amber-500">
          <div className="flex items-center justify-between mb-1">
            <span className="text-xs font-semibold uppercase tracking-wider text-amber-600 dark:text-amber-400">
              Active in Quarantine
            </span>
            <ClockIcon className="w-5 h-5 text-amber-500" />
          </div>
          <p className="text-2xl font-bold font-mono text-amber-600 dark:text-amber-400">
            {formatCurrency(summary.quarantined_value)}
          </p>
          <p className={`text-xs mt-1 ${isDark ? "text-slate-400" : "text-gray-500"}`}>
            {summary.quarantined_count} Vouchers • {Number(summary.quarantined_qty || 0).toLocaleString()} Units isolated
          </p>
        </GlassCard>

        <GlassCard className="p-4 border-l-4 border-l-rose-500">
          <div className="flex items-center justify-between mb-1">
            <span className="text-xs font-semibold uppercase tracking-wider text-rose-600 dark:text-rose-400">
              Disposed This Month
            </span>
            <FireIcon className="w-5 h-5 text-rose-500" />
          </div>
          <p className="text-2xl font-bold font-mono text-rose-600 dark:text-rose-400">
            {formatCurrency(summary.disposed_month_value)}
          </p>
          <p className={`text-xs mt-1 ${isDark ? "text-slate-400" : "text-gray-500"}`}>
            {summary.disposed_month_count} Vouchers • {Number(summary.disposed_month_qty || 0).toLocaleString()} Units destroyed
          </p>
        </GlassCard>

        <GlassCard className="p-4 border-l-4 border-l-blue-500">
          <div className="flex items-center justify-between mb-1">
            <span className={`text-xs font-semibold uppercase tracking-wider ${isDark ? "text-blue-400" : "text-blue-600"}`}>
              Cumulative P&L Write-Off
            </span>
            <TrashIcon className="w-5 h-5 text-blue-500" />
          </div>
          <p className={`text-2xl font-bold font-mono ${isDark ? "text-slate-100" : "text-gray-900"}`}>
            {formatCurrency(summary.total_writeoff_value)}
          </p>
          <p className={`text-xs mt-1 ${isDark ? "text-slate-400" : "text-gray-500"}`}>
            {summary.total_disposed_count} Total finalized disposals
          </p>
        </GlassCard>

        <GlassCard className="p-4 border-l-4 border-l-purple-500">
          <div className="flex items-center justify-between mb-1">
            <span className="text-xs font-semibold uppercase tracking-wider text-purple-600 dark:text-purple-400">
              Controlled / Narcotics
            </span>
            <ShieldExclamationIcon className="w-5 h-5 text-purple-500" />
          </div>
          <p className="text-2xl font-bold font-mono text-purple-600 dark:text-purple-400">
            {summary.narcotic_disposals_count}
          </p>
          <p className={`text-xs mt-1 ${isDark ? "text-slate-400" : "text-gray-500"}`}>
            Witness-verified regulatory records
          </p>
        </GlassCard>
      </div>

      {/* Status Tabs + Filters Card */}
      <GlassCard className="overflow-hidden">
        {/* Status Tabs */}
        <div
          className={`flex overflow-x-auto whitespace-nowrap no-scrollbar sm:flex-wrap items-center gap-2 px-4 py-3 border-b ${
            isDark ? "border-slate-700 bg-slate-800/40" : "border-gray-200 bg-gray-50/80"
          }`}
        >
          {[
            { id: "all", label: "All Records" },
            { id: "quarantined", label: `In Quarantine (${summary.quarantined_count})` },
            { id: "disposed", label: `Disposed & Written Off (${summary.total_disposed_count})` },
            { id: "restored", label: "Restored to Shelf" },
          ].map((tab) => {
            const active = statusFilter === tab.id;
            return (
              <button
                key={tab.id}
                type="button"
                onClick={() => {
                  setStatusFilter(tab.id);
                  setPage(1);
                }}
                className={`px-3.5 py-1.5 rounded-xl text-xs font-bold transition-all ${
                  active
                    ? "bg-blue-600 text-white shadow-sm"
                    : isDark
                    ? "text-slate-300 hover:bg-slate-700/70"
                    : "text-gray-600 hover:bg-gray-200/70"
                }`}
              >
                {tab.label}
              </button>
            );
          })}
        </div>

        {/* Filter Bar */}
        <div
          className={`p-3.5 border-b grid grid-cols-1 sm:grid-cols-2 xl:grid-cols-4 gap-3 items-center ${
            isDark ? "border-slate-700 bg-slate-800/20" : "border-gray-200 bg-white"
          }`}
        >
          <div className="relative">
            <MagnifyingGlassIcon className="w-4 h-4 absolute left-3 top-2.5 text-slate-400 pointer-events-none" />
            <input
              type="text"
              value={search}
              onChange={(e) => {
                setSearch(e.target.value);
                setPage(1);
              }}
              placeholder="Search voucher#, product, batch, witness..."
              className={`${inputCls} pl-9 w-full h-[38px]`}
            />
          </div>

          <div>
            <Select
              options={CAUSE_OPTIONS}
              value={CAUSE_OPTIONS.find((o) => o.value === causeFilter) || CAUSE_OPTIONS[0]}
              onChange={(opt) => {
                setCauseFilter(opt?.value || "all");
                setPage(1);
              }}
              styles={selectStyles}
              menuPortalTarget={typeof document !== "undefined" ? document.body : null}
              menuPosition="fixed"
              isSearchable={false}
            />
          </div>

          <div>
            <Select
              options={METHOD_OPTIONS}
              value={METHOD_OPTIONS.find((o) => o.value === methodFilter) || METHOD_OPTIONS[0]}
              onChange={(opt) => {
                setMethodFilter(opt?.value || "all");
                setPage(1);
              }}
              styles={selectStyles}
              menuPortalTarget={typeof document !== "undefined" ? document.body : null}
              menuPosition="fixed"
              isSearchable={false}
            />
          </div>

          <div className="flex flex-wrap sm:flex-nowrap items-center gap-2">
            <CalendarDaysIcon className="w-4 h-4 text-slate-400 shrink-0" />
            <input
              type="date"
              value={fromDate}
              onChange={(e) => {
                setFromDate(e.target.value);
                setPage(1);
              }}
              className={`${inputCls} flex-1 h-[38px]`}
            />
            <span className="text-xs text-slate-400">to</span>
            <input
              type="date"
              value={toDate}
              onChange={(e) => {
                setToDate(e.target.value);
                setPage(1);
              }}
              className={`${inputCls} flex-1 h-[38px]`}
            />
            {(fromDate || toDate) && (
              <button
                type="button"
                onClick={() => {
                  setFromDate("");
                  setToDate("");
                  setPage(1);
                }}
                className="p-1.5 rounded-lg text-slate-400 hover:text-slate-600 dark:hover:text-slate-200"
                title="Clear dates"
              >
                <XMarkIcon className="w-4 h-4" />
              </button>
            )}
          </div>
        </div>

        {/* Table */}
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
                <th className="py-3 px-4">Voucher #</th>
                <th className="py-3 px-4">Date</th>
                <th className="py-3 px-4">Cause & Method</th>
                <th className="py-3 px-4">Items & Batches</th>
                <th className="py-3 px-4 text-center">Units</th>
                <th className="py-3 px-4 text-right">Cost Write-Off</th>
                <th className="py-3 px-4">Witness / P&L Link</th>
                <th className="py-3 px-4 text-center">Status</th>
                <th className="py-3 px-4 text-center">Actions</th>
              </tr>
            </thead>
            <tbody className={`divide-y ${isDark ? "divide-slate-800" : "divide-gray-100"}`}>
              {loading ? (
                <tr>
                  <td colSpan={9} className="py-12 text-center text-slate-400">
                    <ArrowPathIcon className="w-6 h-6 animate-spin mx-auto mb-2 text-blue-500" />
                    Loading quarantine & disposal records...
                  </td>
                </tr>
              ) : rows.length === 0 ? (
                <tr>
                  <td colSpan={9} className="py-12 text-center">
                    <ShieldExclamationIcon className="w-10 h-10 mx-auto mb-2 text-slate-400 opacity-40" />
                    <p className={`text-sm font-medium ${isDark ? "text-slate-300" : "text-gray-700"}`}>
                      No quarantine or disposal records found.
                    </p>
                    <p className={`text-xs mt-1 mb-4 ${isDark ? "text-slate-400" : "text-gray-500"}`}>
                      Isolate damaged, spoiled, or expired stock from your sellable inventory or write it off to P&L.
                    </p>
                    {canCreateDisposal && (
                      <button
                        type="button"
                        onClick={() => navigate("/stock-disposals/create")}
                        className={`inline-flex items-center gap-2 px-4 py-2.5 text-sm font-semibold ${btnPrimary.className}`}
                        style={btnPrimary.style}
                      >
                        <PlusCircleIcon className="w-4 h-4" />
                        <span>Record First Quarantine / Disposal</span>
                      </button>
                    )}
                  </td>
                </tr>
              ) : (
                rows.map((row) => {
                  const isQuarantined = row.status === "quarantined";
                  const isDisposed = row.status === "disposed";
                  const isRestored = row.status === "restored";
                  const firstItems = (row.items || []).slice(0, 2);
                  const extraCount = Math.max(0, (row.items || []).length - 2);

                  return (
                    <tr
                      key={row.id}
                      className={`transition-colors ${
                        isDark ? "hover:bg-slate-800/40" : "hover:bg-gray-50"
                      }`}
                    >
                      <td className="py-3 px-4">
                        <div className={`font-mono font-bold ${isDark ? "text-white" : "text-gray-900"}`}>
                          {row.disposal_number}
                        </div>
                        {row.has_narcotics && (
                          <span className="mt-1 inline-flex items-center gap-1 px-2 py-0.5 rounded text-[10px] font-bold uppercase bg-purple-100 text-purple-800 dark:bg-purple-900/40 dark:text-purple-300">
                            <ShieldExclamationIcon className="w-3 h-3" />
                            Narcotic
                          </span>
                        )}
                      </td>

                      <td className={`py-3 px-4 ${isDark ? "text-slate-300" : "text-gray-700"}`}>
                        {row.disposal_date}
                      </td>

                      <td className="py-3 px-4">
                        <div className={`font-semibold ${isDark ? "text-slate-200" : "text-gray-800"}`}>
                          {row.cause_label}
                        </div>
                        <div className={`text-[11px] ${isDark ? "text-slate-400" : "text-gray-500"}`}>
                          Method: {row.disposal_method_label}
                        </div>
                      </td>

                      <td className="py-3 px-4">
                        <div className="space-y-1">
                          {firstItems.map((it) => (
                            <div key={it.id} className="flex items-center gap-1.5">
                              <span className={`font-medium ${isDark ? "text-slate-200" : "text-gray-800"}`}>
                                {it.product?.name || `#${it.product_id}`}
                              </span>
                              {it.batch_number && (
                                <span className={`px-1.5 py-0.5 rounded font-mono text-[10px] ${isDark ? "bg-slate-800 text-slate-300" : "bg-gray-100 text-gray-600"}`}>
                                  {it.batch_number}
                                </span>
                              )}
                              <span className="text-rose-500 font-bold">
                                ×{Number(it.dispose_qty || 0)}
                              </span>
                            </div>
                          ))}
                          {extraCount > 0 && (
                            <span className={`text-[10px] italic ${isDark ? "text-slate-400" : "text-gray-500"}`}>
                              +{extraCount} more item(s)
                            </span>
                          )}
                        </div>
                      </td>

                      <td className="py-3 px-4 text-center font-mono font-bold">
                        <span className={isRestored ? "line-through text-slate-400" : "text-rose-500"}>
                          {Number(row.total_qty || 0).toLocaleString()}
                        </span>
                      </td>

                      <td className="py-3 px-4 text-right font-mono">
                        <div className={`font-bold text-sm ${isRestored ? "line-through text-slate-400" : isDark ? "text-white" : "text-gray-900"}`}>
                          {formatCurrency(row.total_cost_value || 0)}
                        </div>
                        <div className={`text-[10px] ${isDark ? "text-slate-400" : "text-gray-500"}`}>
                          Retail: {formatCurrency(row.total_retail_value || 0)}
                        </div>
                      </td>

                      <td className="py-3 px-4">
                        {row.witness_name ? (
                          <div className={`text-xs font-medium ${isDark ? "text-slate-200" : "text-gray-800"}`}>
                            Witness: {row.witness_name}
                          </div>
                        ) : (
                          <div className={`text-[11px] italic ${isDark ? "text-slate-500" : "text-gray-400"}`}>
                            No witness recorded
                          </div>
                        )}
                        {row.expense ? (
                          <span className="mt-0.5 inline-flex items-center gap-1 px-2 py-0.5 rounded text-[10px] font-mono font-semibold bg-emerald-100 text-emerald-800 dark:bg-emerald-900/40 dark:text-emerald-300">
                            P&L: {row.expense.expense_number}
                          </span>
                        ) : isDisposed ? (
                          <span className={`text-[10px] ${isDark ? "text-slate-500" : "text-gray-400"}`}>
                            Inventory-only adjustment
                          </span>
                        ) : null}
                      </td>

                      <td className="py-3 px-4 text-center">
                        {isQuarantined && (
                          <span className="inline-flex items-center gap-1 px-2.5 py-1 rounded-full text-[11px] font-bold bg-amber-100 text-amber-800 dark:bg-amber-900/40 dark:text-amber-300">
                            <ClockIcon className="w-3.5 h-3.5" />
                            Quarantined
                          </span>
                        )}
                        {isDisposed && (
                          <span className="inline-flex items-center gap-1 px-2.5 py-1 rounded-full text-[11px] font-bold bg-rose-100 text-rose-800 dark:bg-rose-900/40 dark:text-rose-300">
                            <CheckCircleIcon className="w-3.5 h-3.5" />
                            Disposed
                          </span>
                        )}
                        {isRestored && (
                          <span className="inline-flex items-center gap-1 px-2.5 py-1 rounded-full text-[11px] font-bold bg-emerald-100 text-emerald-800 dark:bg-emerald-900/40 dark:text-emerald-300">
                            <ArrowUturnLeftIcon className="w-3.5 h-3.5" />
                            Restored
                          </span>
                        )}
                      </td>

                      <td className="py-3 px-4 text-center">
                        <div className="flex items-center justify-center gap-1.5">
                          <button
                            type="button"
                            onClick={() => handleViewCertificate(row)}
                            className={`p-1.5 rounded-lg transition-colors ${
                              isDark
                                ? "hover:bg-slate-700 text-slate-300 hover:text-white"
                                : "hover:bg-gray-100 text-gray-600 hover:text-gray-900"
                            }`}
                            title="View / Print Certificate"
                          >
                            <PrinterIcon className="w-4 h-4" />
                          </button>

                          {isQuarantined && (
                            <>
                              {canDispose && (
                                <button
                                  type="button"
                                  onClick={() => openFinalizeModal(row)}
                                  className="px-2.5 py-1 rounded-lg text-[11px] font-bold bg-rose-600 hover:bg-rose-500 text-white transition-colors"
                                  title="Execute final disposal and P&L write-off"
                                >
                                  Dispose
                                </button>
                              )}
                              {canRestore && (
                                <button
                                  type="button"
                                  onClick={() => openRestoreModal(row)}
                                  className="px-2.5 py-1 rounded-lg text-[11px] font-bold bg-emerald-600 hover:bg-emerald-500 text-white transition-colors"
                                  title="Release from Quarantine back to sellable stock"
                                >
                                  Restore
                                </button>
                              )}
                            </>
                          )}
                        </div>
                      </td>
                    </tr>
                  );
                })
              )}
            </tbody>
          </table>
        </div>

        {/* Pagination */}
        {!loading && total > 20 && (
          <div
            className={`flex items-center justify-between px-4 py-3 border-t text-xs ${
              isDark ? "border-slate-700 text-slate-400" : "border-gray-200 text-gray-600"
            }`}
          >
            <span>
              Page {page} of {lastPage} ({total} total vouchers)
            </span>
            <div className="flex items-center gap-1.5">
              <button
                type="button"
                disabled={page <= 1}
                onClick={() => setPage((p) => Math.max(1, p - 1))}
                className="p-1.5 rounded-lg border disabled:opacity-40"
              >
                <ChevronLeftIcon className="w-4 h-4" />
              </button>
              <button
                type="button"
                disabled={page >= lastPage}
                onClick={() => setPage((p) => Math.min(lastPage, p + 1))}
                className="p-1.5 rounded-lg border disabled:opacity-40"
              >
                <ChevronRightIcon className="w-4 h-4" />
              </button>
            </div>
          </div>
        )}
      </GlassCard>

      {/* Finalize Quarantine -> Disposed Modal */}
      {finalizingDisposal && (
        <div
          className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/60 backdrop-blur-xs"
          onClick={(e) => {
            if (e.target === e.currentTarget && !submittingFinalize) {
              setFinalizingDisposal(null);
            }
          }}
        >
          <GlassCard
            className={`w-full max-w-lg border shadow-2xl rounded-2xl overflow-hidden ${
              isDark
                ? "bg-slate-900 border-slate-700 text-slate-100"
                : "bg-white border-gray-200 text-gray-900"
            }`}
          >
            <div
              className={`flex items-center justify-between px-6 py-4 border-b ${
                isDark ? "border-slate-700 bg-slate-800/50" : "border-gray-200 bg-gray-50"
              }`}
            >
              <div className="flex items-center gap-2.5">
                <FireIcon className="w-5 h-5 text-rose-500" />
                <div>
                  <h3 className={`font-bold text-base ${isDark ? "text-white" : "text-gray-900"}`}>
                    Finalize Destruction & P&L Write-Off
                  </h3>
                  <p className={`text-xs font-mono ${isDark ? "text-slate-400" : "text-gray-500"}`}>
                    {finalizingDisposal.disposal_number} • Cost Value:{" "}
                    {formatCurrency(finalizingDisposal.total_cost_value)}
                  </p>
                </div>
              </div>
              <button
                type="button"
                onClick={() => setFinalizingDisposal(null)}
                className={`p-1.5 rounded-lg ${
                  isDark ? "text-slate-400 hover:bg-slate-700" : "text-gray-500 hover:bg-gray-200"
                }`}
              >
                <XMarkIcon className="w-5 h-5" />
              </button>
            </div>

            <form onSubmit={handleConfirmFinalize} className="p-6 space-y-4">
              {finalizingDisposal.has_narcotics && (
                <div
                  className={`p-3 rounded-xl border text-xs flex items-start gap-2.5 ${
                    isDark
                      ? "bg-purple-950/40 border-purple-700 text-purple-200"
                      : "bg-purple-50 border-purple-200 text-purple-800"
                  }`}
                >
                  <ExclamationTriangleIcon className="w-5 h-5 shrink-0 text-purple-500" />
                  <div>
                    <span className="font-bold block">Controlled / Narcotic Substance Compliance</span>
                    This voucher contains narcotic products. A witness name and designation are mandatory to authorize destruction.
                  </div>
                </div>
              )}

              <div>
                <label className={`block text-xs font-semibold mb-1.5 ${isDark ? "text-slate-300" : "text-gray-700"}`}>
                  Destruction / Disposal Method *
                </label>
                <Select
                  options={FINALIZE_METHOD_OPTIONS}
                  value={
                    FINALIZE_METHOD_OPTIONS.find((o) => o.value === finalizeForm.disposal_method) ||
                    FINALIZE_METHOD_OPTIONS[0]
                  }
                  onChange={(opt) =>
                    setFinalizeForm((prev) => ({
                      ...prev,
                      disposal_method: opt?.value || "incineration",
                    }))
                  }
                  styles={selectStyles}
                  menuPortalTarget={typeof document !== "undefined" ? document.body : null}
                  menuPosition="fixed"
                  isSearchable={false}
                />
              </div>

              <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                <div>
                  <label className={`block text-xs font-semibold mb-1 ${isDark ? "text-slate-300" : "text-gray-700"}`}>
                    Witness Name {finalizingDisposal.has_narcotics ? "*" : "(Recommended)"}
                  </label>
                  <GlassInput
                    type="text"
                    value={finalizeForm.witness_name}
                    onChange={(e) =>
                      setFinalizeForm((prev) => ({ ...prev, witness_name: e.target.value }))
                    }
                    placeholder="e.g. Dr. Ahmed / Drug Inspector"
                    required={finalizingDisposal.has_narcotics}
                    className="w-full text-xs h-9"
                  />
                </div>
                <div>
                  <label className={`block text-xs font-semibold mb-1 ${isDark ? "text-slate-300" : "text-gray-700"}`}>
                    Witness Designation
                  </label>
                  <GlassInput
                    type="text"
                    value={finalizeForm.witness_designation}
                    onChange={(e) =>
                      setFinalizeForm((prev) => ({
                        ...prev,
                        witness_designation: e.target.value,
                      }))
                    }
                    placeholder="e.g. Registered Pharmacist"
                    className="w-full text-xs h-9"
                  />
                </div>
              </div>

              <div>
                <label className={`block text-xs font-semibold mb-1 ${isDark ? "text-slate-300" : "text-gray-700"}`}>
                  Destruction Notes / Certificate Remarks
                </label>
                <textarea
                  rows={2}
                  value={finalizeForm.notes}
                  onChange={(e) =>
                    setFinalizeForm((prev) => ({ ...prev, notes: e.target.value }))
                  }
                  placeholder="Optional certificate remarks..."
                  className={`${inputCls} w-full`}
                />
              </div>

              <label
                className={`flex items-start gap-2.5 p-3 rounded-xl border cursor-pointer text-xs ${
                  isDark
                    ? "bg-slate-800/60 border-slate-700 text-slate-200"
                    : "bg-gray-50 border-gray-200 text-gray-800"
                }`}
              >
                <input
                  type="checkbox"
                  checked={finalizeForm.record_expense}
                  onChange={(e) =>
                    setFinalizeForm((prev) => ({
                      ...prev,
                      record_expense: e.target.checked,
                    }))
                  }
                  className="mt-0.5 rounded text-blue-600 focus:ring-blue-500"
                />
                <div>
                  <span className="font-bold block">
                    Post Non-Cash Write-Off to P&L Statement ({formatCurrency(finalizingDisposal.total_cost_value)})
                  </span>
                  <span className={isDark ? "text-slate-400" : "text-gray-500"}>
                    Records under "Stock Expiry, Damage & Scrap Write-Off" in Net Profit (P&L) without deducting Cash Drawer or Bank balances.
                  </span>
                </div>
              </label>

              <div className="flex flex-col-reverse sm:flex-row justify-end gap-2 pt-2">
                <button
                  type="button"
                  onClick={() => setFinalizingDisposal(null)}
                  disabled={submittingFinalize}
                  className={`px-4 py-2.5 text-sm font-semibold ${btnSecondary.className}`}
                  style={btnSecondary.style}
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  disabled={submittingFinalize}
                  className={`px-4 py-2.5 text-sm font-semibold ${btnDanger.className}`}
                  style={btnDanger.style}
                >
                  {submittingFinalize ? "Finalizing..." : "Confirm Destruction & Write-Off"}
                </button>
              </div>
            </form>
          </GlassCard>
        </div>
      )}

      {/* Restore from Quarantine Modal */}
      {restoringDisposal && (
        <div
          className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/60 backdrop-blur-xs"
          onClick={(e) => {
            if (e.target === e.currentTarget && !submittingRestore) {
              setRestoringDisposal(null);
            }
          }}
        >
          <GlassCard
            className={`w-full max-w-md border shadow-2xl rounded-2xl overflow-hidden ${
              isDark
                ? "bg-slate-900 border-slate-700 text-slate-100"
                : "bg-white border-gray-200 text-gray-900"
            }`}
          >
            <div
              className={`flex items-center justify-between px-6 py-4 border-b ${
                isDark ? "border-slate-700 bg-slate-800/50" : "border-gray-200 bg-gray-50"
              }`}
            >
              <div className="flex items-center gap-2.5">
                <ArrowUturnLeftIcon className="w-5 h-5 text-emerald-500" />
                <h3 className={`font-bold text-base ${isDark ? "text-white" : "text-gray-900"}`}>
                  Restore Quarantine Stock to Shelf
                </h3>
              </div>
              <button
                type="button"
                onClick={() => setRestoringDisposal(null)}
                className={`p-1.5 rounded-lg ${
                  isDark ? "text-slate-400 hover:bg-slate-700" : "text-gray-500 hover:bg-gray-200"
                }`}
              >
                <XMarkIcon className="w-5 h-5" />
              </button>
            </div>

            <form onSubmit={handleConfirmRestore} className="p-6 space-y-4">
              <p className={`text-xs ${isDark ? "text-slate-300" : "text-gray-600"}`}>
                Restoring voucher <span className="font-mono font-bold">{restoringDisposal.disposal_number}</span> will return{" "}
                <span className="font-bold">{Number(restoringDisposal.total_qty || 0).toLocaleString()} units</span> back to sellable batch and product inventory.
              </p>

              <div>
                <label className={`block text-xs font-semibold mb-1 ${isDark ? "text-slate-300" : "text-gray-700"}`}>
                  Reason for Release / Restoration
                </label>
                <GlassInput
                  type="text"
                  value={restoreReason}
                  onChange={(e) => setRestoreReason(e.target.value)}
                  placeholder="e.g. Cleared quality inspection / Returning via Purchase Return instead"
                  className="w-full text-xs h-9"
                  autoFocus
                />
              </div>

              <div className="flex flex-col-reverse sm:flex-row justify-end gap-2 pt-2">
                <button
                  type="button"
                  onClick={() => setRestoringDisposal(null)}
                  disabled={submittingRestore}
                  className={`px-4 py-2.5 text-sm font-semibold ${btnSecondary.className}`}
                  style={btnSecondary.style}
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  disabled={submittingRestore}
                  className={`px-4 py-2.5 text-sm font-semibold ${btnEmerald.className}`}
                  style={btnEmerald.style}
                >
                  {submittingRestore ? "Restoring..." : "Restore to Sellable Stock"}
                </button>
              </div>
            </form>
          </GlassCard>
        </div>
      )}

      {/* Printable Certificate Modal */}
      <DisposalCertificateModal
        isOpen={Boolean(certificateDisposal)}
        onClose={() => setCertificateDisposal(null)}
        disposal={certificateDisposal}
      />
    </div>
  );
}

