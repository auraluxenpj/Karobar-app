import React, { useState, useEffect, useMemo, useCallback } from "react";
import { Link, useNavigate } from "react-router-dom";
import axios from "axios";
import toast from "react-hot-toast";
import Select from "react-select";
import {
  MagnifyingGlassIcon,
  PencilSquareIcon,
  TrashIcon,
  ArrowUpTrayIcon,
  ArrowDownTrayIcon,
  ArrowPathIcon,
  PlusCircleIcon,
  BuildingStorefrontIcon,
  XMarkIcon,
  BanknotesIcon,
  ExclamationTriangleIcon,
  CheckCircleIcon,
} from "@heroicons/react/24/solid";
import SupplierImportModal from "@/components/SupplierImportModal.jsx";
import {
  ExpiryPolicyBadge,
  EXPIRY_POLICY_FILTER_OPTIONS,
  getReactSelectStyles,
} from "@/components/ExpiryReturnPolicyFields.jsx";
import { usePermissions, Guard } from "@/api/usePermissions.js";
import { useTheme } from "@/context/ThemeContext";
import { GlassCard, GlassInput } from "@/components/Glass.jsx";

const PAGE_SIZE_OPTIONS = [
  { value: 10, label: "10 per page" },
  { value: 25, label: "25 per page" },
  { value: 50, label: "50 per page" },
  { value: 100, label: "100 per page" },
];

export default function SuppliersIndex() {
  const navigate = useNavigate();
  const { isDark, theme } = useTheme();
  const primaryColor = theme?.primary_color || "#3b82f6";

  const [suppliers, setSuppliers] = useState([]);
  const [loading, setLoading] = useState(false);
  const [importOpen, setImportOpen] = useState(false);
  const [exporting, setExporting] = useState(false);

  const [creditModalSupplier, setCreditModalSupplier] = useState(null);
  const [creditSummary, setCreditSummary] = useState(null);
  const [loadingCreditSummary, setLoadingCreditSummary] = useState(false);

  const [qName, setQName] = useState("");
  const [policyFilter, setPolicyFilter] = useState("all");
  const [page, setPage] = useState(1);
  const [pageSize, setPageSize] = useState(25);

  const { loading: permsLoading, canFor } = usePermissions();
  const can = useMemo(
    () =>
      (typeof canFor === "function" ? canFor("supplier") : null) ?? {
        view: false,
        create: false,
        update: false,
        delete: false,
        import: false,
        export: false,
      },
    [canFor]
  );

  const selectStyles = useMemo(
    () => getReactSelectStyles(isDark, primaryColor),
    [isDark, primaryColor]
  );

  useEffect(() => {
    document.title = "Suppliers - Karobar App";
  }, []);

  // Alt + N -> Open Create Supplier page
  useEffect(() => {
    const onKeyDown = (e) => {
      if (e.altKey && (e.key || "").toLowerCase() === "n") {
        if (!can.create) return;
        e.preventDefault();
        navigate("/suppliers/create");
      }
    };
    window.addEventListener("keydown", onKeyDown);
    return () => window.removeEventListener("keydown", onKeyDown);
  }, [can.create, navigate]);

  const fetchSuppliers = useCallback(async () => {
    try {
      setLoading(true);
      const res = await axios.get("/api/suppliers");
      setSuppliers(Array.isArray(res.data) ? res.data : []);
    } catch (err) {
      const status = err?.response?.status;
      if (status === 403)
        toast.error("You don't have permission to view suppliers.");
      else toast.error("Failed to fetch suppliers");
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    if (!permsLoading && can.view) fetchSuppliers();
  }, [permsLoading, can.view, fetchSuppliers]);

  const openCreditSummary = async (supplier) => {
    setCreditModalSupplier(supplier);
    setCreditSummary(null);
    setLoadingCreditSummary(true);
    try {
      const { data } = await axios.get(
        `/api/suppliers/${supplier.id}/credit-summary`
      );
      setCreditSummary(data);
    } catch (err) {
      toast.error(
        err?.response?.data?.message || "Failed to load supplier credit summary"
      );
    } finally {
      setLoadingCreditSummary(false);
    }
  };

  const handleDelete = async (s) => {
    if (!can.delete)
      return toast.error("You don't have permission to delete suppliers.");
    if (!window.confirm(`Delete supplier "${s.name}"?`)) return;
    try {
      await axios.delete(`/api/suppliers/${s.id}`);
      setSuppliers((prev) =>
        prev.filter((x) => Number(x.id) !== Number(s.id))
      );
      toast.success("Supplier deleted");
    } catch (err) {
      toast.error(err?.response?.data?.message || "Delete failed");
    }
  };

  const handleExport = async () => {
    if (!can.export)
      return toast.error("You don't have permission to export suppliers.");
    try {
      setExporting(true);
      const res = await axios.get("/api/suppliers/export", {
        responseType: "blob",
      });
      const stamp = new Date()
        .toISOString()
        .slice(0, 19)
        .replace(/[:T]/g, "-");
      const filename = `suppliers_${stamp}.csv`;
      const blob = new Blob([res.data], { type: "text/csv;charset=utf-8" });
      const url = window.URL.createObjectURL(blob);
      const a = document.createElement("a");
      a.href = url;
      a.download = filename;
      document.body.appendChild(a);
      a.click();
      a.remove();
      window.URL.revokeObjectURL(url);
    } catch {
      toast.error("Export failed");
    } finally {
      setExporting(false);
    }
  };

  const filtered = useMemo(() => {
    const needle = (qName || "").toLowerCase().trim();
    return suppliers.filter((s) => {
      if (needle && !(s.name || "").toLowerCase().includes(needle)) {
        return false;
      }
      if (policyFilter !== "all") {
        const p = s.expiry_return_policy || "before_expiry";
        const m = Number(s.expiry_return_months ?? 3);
        if (
          ["before_expiry", "accepts_expired", "non_returnable"].includes(
            policyFilter
          )
        ) {
          if (p !== policyFilter) return false;
        } else if (policyFilter.startsWith("before_")) {
          const targetMonths = Number(policyFilter.replace("before_", ""));
          if (p !== "before_expiry" || m !== targetMonths) return false;
        }
      }
      return true;
    });
  }, [suppliers, qName, policyFilter]);

  const pageCount = Math.max(1, Math.ceil(filtered.length / pageSize));
  const currentPage = Math.min(page, pageCount);
  const start = (currentPage - 1) * pageSize;
  const paged = filtered.slice(start, start + pageSize);

  if (permsLoading) return <div className="p-6">Loading…</div>;
  if (!can.view)
    return (
      <div className="p-6 text-sm text-gray-700">
        You don&apos;t have permission to view suppliers.
      </div>
    );

  return (
    <div className="directory-page space-y-4">
      <div className="products-panel directory-overview">
        <div className="products-heading">
          <div className="flex items-center gap-4">
            <div className="products-identity-icon">
              <BuildingStorefrontIcon className="w-6 h-6" />
            </div>
            <div>
              <h1 className="products-title">
                Suppliers & Expiry Return Policies
              </h1>
              <p className="products-subtitle">
                <BuildingStorefrontIcon className="w-3.5 h-3.5" />
                <span>{suppliers.length} suppliers configured</span>
              </p>
            </div>
          </div>

          <div className="flex items-center gap-2.5 flex-wrap">
            <Guard when={can.create}>
              <Link
                to="/suppliers/create"
                title="Add Supplier (Alt+N)"
                className="products-action products-action-primary theme-btn-primary"
              >
                <PlusCircleIcon className="w-4 h-4" />
                <span>Add Supplier (Alt+N)</span>
              </Link>
            </Guard>
            <Guard when={can.import}>
              <button
                onClick={() => setImportOpen(true)}
                className="products-action theme-btn-secondary"
              >
                <ArrowUpTrayIcon className="w-3.5 h-3.5" />
                <span>Import</span>
              </button>
            </Guard>
            <Guard when={can.export}>
              <button
                onClick={handleExport}
                disabled={exporting}
                className="products-action theme-btn-secondary"
              >
                <ArrowDownTrayIcon
                  className={`w-3.5 h-3.5 ${exporting ? "animate-spin" : ""}`}
                />
                <span>{exporting ? "..." : "Export"}</span>
              </button>
            </Guard>
            <button
              onClick={fetchSuppliers}
              title="Refresh"
              className="products-action theme-btn-tertiary"
            >
              <ArrowPathIcon className="w-3.5 h-3.5" />
              <span>Refresh</span>
            </button>
          </div>
        </div>

        {/* Search & React Select Filter Bar */}
        <div className="mt-3 px-4 pb-4 sm:px-6 sm:pb-5 grid grid-cols-1 md:grid-cols-12 gap-3 items-center">
          <div className="md:col-span-6 relative">
            <MagnifyingGlassIcon className="w-4 h-4 text-slate-400 absolute left-3.5 top-1/2 -translate-y-1/2 pointer-events-none" />
            <GlassInput
              value={qName}
              onChange={(e) => {
                setQName(e.target.value);
                setPage(1);
              }}
              aria-label="Search suppliers"
              placeholder="Search suppliers by name..."
              className="w-full pl-9 h-[38px]"
            />
          </div>

          <div className="md:col-span-4">
            <Select
              options={EXPIRY_POLICY_FILTER_OPTIONS}
              value={
                EXPIRY_POLICY_FILTER_OPTIONS.find(
                  (o) => o.value === policyFilter
                ) || EXPIRY_POLICY_FILTER_OPTIONS[0]
              }
              onChange={(opt) => {
                setPolicyFilter(opt?.value || "all");
                setPage(1);
              }}
              styles={selectStyles}
              menuPortalTarget={
                typeof document !== "undefined" ? document.body : null
              }
              placeholder="Filter by Expiry Policy..."
            />
          </div>

          <div className="md:col-span-2">
            <Select
              options={PAGE_SIZE_OPTIONS}
              value={
                PAGE_SIZE_OPTIONS.find((o) => o.value === pageSize) ||
                PAGE_SIZE_OPTIONS[1]
              }
              onChange={(opt) => {
                setPageSize(Number(opt?.value || 25));
                setPage(1);
              }}
              styles={selectStyles}
              isSearchable={false}
              menuPortalTarget={
                typeof document !== "undefined" ? document.body : null
              }
            />
          </div>
        </div>
      </div>

      {/* Suppliers Table Card */}
      <GlassCard className="directory-panel directory-list">
        <div className="p-3">
          <div className="directory-table-scroll">
            <table className="w-full text-sm">
              <thead className="bg-white/80 dark:bg-slate-700/80 sticky top-0">
                <tr className="border-b border-gray-200/70 dark:border-slate-600/70 text-left">
                  <th className="px-3.5 py-2.5 font-semibold text-gray-600 dark:text-gray-300 text-xs uppercase">
                    Supplier
                  </th>
                  <th className="px-3.5 py-2.5 font-semibold text-gray-600 dark:text-gray-300 text-xs uppercase">
                    Contact
                  </th>
                  <th className="px-3.5 py-2.5 font-semibold text-gray-600 dark:text-gray-300 text-xs uppercase">
                    Expiry Return Policy
                  </th>
                  <th className="px-3.5 py-2.5 font-semibold text-gray-600 dark:text-gray-300 text-xs uppercase">
                    Intimation Status
                  </th>
                  <th className="px-3.5 py-2.5 font-semibold text-gray-600 dark:text-gray-300 text-xs uppercase">
                    Credit Summary
                  </th>
                  {(can.view || can.update || can.delete) && (
                    <th className="px-3.5 py-2.5 font-semibold text-gray-600 dark:text-gray-300 text-xs uppercase text-center w-32">
                      Actions
                    </th>
                  )}
                </tr>
              </thead>
              <tbody>
                {paged.length === 0 && !loading && (
                  <tr>
                    <td
                      className="px-3 py-10 text-center text-gray-500 dark:text-gray-400"
                      colSpan={6}
                    >
                      <div className="flex flex-col items-center gap-2">
                        <BuildingStorefrontIcon className="w-8 h-8 text-gray-400" />
                        <p className="text-sm">No suppliers found</p>
                      </div>
                    </td>
                  </tr>
                )}

                {paged.map((s) => {
                  const used = Number(s.products_count || 0) > 0;
                  const dueCount = Number(s.intimation_due_count || 0);
                  const dueUnits = Number(s.intimation_due_units || 0);

                  return (
                    <tr
                      key={s.id}
                      className="odd:bg-white/90 even:bg-white/70 dark:odd:bg-slate-700/60 dark:even:bg-slate-800/60 hover:bg-blue-50/70 dark:hover:bg-slate-600/50 transition-colors"
                    >
                      <td className="px-3.5 py-2.5">
                        <div className="font-semibold text-gray-900 dark:text-gray-100">
                          {s.name}
                        </div>
                        {s.address && (
                          <div className="text-xs text-gray-500 dark:text-gray-400">
                            {s.address}
                          </div>
                        )}
                      </td>

                      <td className="px-3.5 py-2.5 text-xs text-gray-600 dark:text-gray-300">
                        <div>{s.phone || "—"}</div>
                        {s.email && (
                          <div className="text-[11px] text-gray-400">
                            {s.email}
                          </div>
                        )}
                      </td>

                      <td className="px-3.5 py-2.5">
                        <ExpiryPolicyBadge
                          policy={s.expiry_return_policy}
                          months={s.expiry_return_months}
                          days={s.expiry_return_days}
                          label={s.expiry_policy_label}
                        />
                        {s.expiry_return_notes && (
                          <div className="text-[11px] text-gray-500 dark:text-gray-400 mt-0.5">
                            {s.expiry_return_notes}
                          </div>
                        )}
                      </td>

                      <td className="px-3.5 py-2.5">
                        {dueCount > 0 ? (
                          <button
                            type="button"
                            onClick={() => navigate(`/suppliers/${s.id}/edit`)}
                            className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full text-xs font-bold bg-amber-500/15 text-amber-700 dark:text-amber-300 border border-amber-500/30 hover:bg-amber-500/25 cursor-pointer"
                            title="Click to inspect batches requiring return intimation"
                          >
                            <ExclamationTriangleIcon className="w-3.5 h-3.5" />
                            <span>
                              {dueCount} {dueCount === 1 ? "Batch" : "Batches"} Due ({dueUnits} units)
                            </span>
                          </button>
                        ) : (
                          <span className="inline-flex items-center gap-1 text-xs text-emerald-600 dark:text-emerald-400 font-medium">
                            <CheckCircleIcon className="w-4 h-4" />
                            <span>No return intimations due</span>
                          </span>
                        )}
                      </td>

                      <td className="px-3.5 py-2.5 text-xs">
                        <button
                          type="button"
                          onClick={() => openCreditSummary(s)}
                          className="text-left group cursor-pointer"
                          title="Click to view full credit summary"
                        >
                          <div
                            className={`font-mono font-bold ${
                              Number(s.current_payable || 0) > 0
                                ? Number(s.credit_limit) > 0 &&
                                  Number(s.current_payable || 0) > Number(s.credit_limit)
                                  ? "text-rose-600 dark:text-rose-400"
                                  : "text-amber-600 dark:text-amber-400"
                                : "text-emerald-600 dark:text-emerald-400"
                            } group-hover:underline`}
                          >
                            Payable: Rs. {Number(s.current_payable || 0).toLocaleString()}
                          </div>
                          <div className="font-mono text-gray-700 dark:text-gray-300">
                            {Number(s.credit_limit) > 0
                              ? `Limit: Rs. ${Number(s.credit_limit).toLocaleString()}`
                              : "Limit: Unlimited"}
                          </div>
                          <div className="text-gray-500 dark:text-gray-400">
                            {Number(s.credit_days) > 0
                              ? `${s.credit_days} days`
                              : "Immediate"}
                          </div>
                        </button>
                      </td>

                      {(can.view || can.update || can.delete) && (
                        <td className="px-3.5 py-2.5">
                          <div className="flex items-center justify-center gap-1.5">
                            <Guard when={can.view}>
                              <button
                                type="button"
                                onClick={() => openCreditSummary(s)}
                                className="products-row-action"
                                aria-label={`Credit Summary for ${s.name}`}
                                title="View Credit Summary"
                              >
                                <BanknotesIcon className="w-4 h-4 text-emerald-600 dark:text-emerald-400" />
                              </button>
                            </Guard>
                            <Guard when={can.update}>
                              <Link
                                to={`/suppliers/${s.id}/edit`}
                                className="products-row-action"
                                aria-label={`Edit ${s.name}`}
                                title="Edit Supplier & Expiry Return Policy"
                              >
                                <PencilSquareIcon className="w-4 h-4" />
                              </Link>
                            </Guard>
                            <Guard when={can.delete}>
                              <button
                                onClick={() =>
                                  used
                                    ? toast.error(
                                        "Cannot delete: supplier is used by products."
                                      )
                                    : handleDelete(s)
                                }
                                disabled={used}
                                className="products-row-action products-row-delete"
                                aria-label={`Delete ${s.name}`}
                                title={
                                  used
                                    ? "Cannot delete: supplier is used by products."
                                    : "Delete"
                                }
                              >
                                <TrashIcon className="w-4 h-4" />
                              </button>
                            </Guard>
                          </div>
                        </td>
                      )}
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>

          <div className="mt-3 flex items-center justify-between text-xs">
            <span className="text-gray-500 dark:text-gray-400">
              Page {currentPage} of {pageCount}
            </span>
            <div className="flex items-center gap-1">
              <button
                onClick={() => setPage(1)}
                disabled={currentPage === 1}
                className={`p-1.5 rounded-sm hover:bg-gray-200 dark:hover:bg-slate-700 ${
                  currentPage === 1 ? "opacity-40" : ""
                }`}
              >
                ⏮
              </button>
              <button
                onClick={() => setPage((p) => Math.max(1, p - 1))}
                disabled={currentPage === 1}
                className={`p-1.5 rounded-sm hover:bg-gray-200 dark:hover:bg-slate-700 ${
                  currentPage === 1 ? "opacity-40" : ""
                }`}
              >
                ◀
              </button>
              <span className="mx-1 px-2 py-0.5 rounded-sm bg-gray-100 dark:bg-slate-700 font-medium">
                {currentPage}
              </span>
              <button
                onClick={() => setPage((p) => Math.min(pageCount, p + 1))}
                disabled={currentPage === pageCount}
                className={`p-1.5 rounded-sm hover:bg-gray-200 dark:hover:bg-slate-700 ${
                  currentPage === pageCount ? "opacity-40" : ""
                }`}
              >
                ▶
              </button>
              <button
                onClick={() => setPage(pageCount)}
                disabled={currentPage === pageCount}
                className={`p-1.5 rounded-sm hover:bg-gray-200 dark:hover:bg-slate-700 ${
                  currentPage === pageCount ? "opacity-40" : ""
                }`}
              >
                ⏭
              </button>
            </div>
          </div>
        </div>
      </GlassCard>

      <SupplierImportModal
        open={importOpen}
        onClose={() => setImportOpen(false)}
        onImported={fetchSuppliers}
      />

      {creditModalSupplier && (
        <div
          className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 backdrop-blur-xs p-4"
          onClick={() => setCreditModalSupplier(null)}
        >
          <div
            className="bg-white dark:bg-slate-800 rounded-2xl shadow-2xl border border-gray-200 dark:border-slate-700 w-full max-w-lg overflow-hidden"
            onClick={(e) => e.stopPropagation()}
          >
            <div className="flex items-center justify-between px-5 py-4 border-b border-gray-200 dark:border-slate-700 bg-gray-50 dark:bg-slate-800/80">
              <div className="flex items-center gap-2.5">
                <div className="p-2 rounded-xl bg-emerald-500/10 text-emerald-600 dark:text-emerald-400">
                  <BanknotesIcon className="w-5 h-5" />
                </div>
                <div>
                  <h3 className="text-sm font-bold text-gray-900 dark:text-gray-100">
                    Supplier Credit Summary — {creditModalSupplier.name}
                  </h3>
                  <p className="text-xs text-gray-500 dark:text-gray-400">
                    Payables exposure, credit limit &amp; overdue bills
                  </p>
                </div>
              </div>
              <button
                type="button"
                onClick={() => setCreditModalSupplier(null)}
                className="p-1.5 rounded-lg text-gray-400 hover:text-gray-600 hover:bg-gray-100 dark:hover:bg-slate-700"
              >
                <XMarkIcon className="w-5 h-5" />
              </button>
            </div>

            <div className="p-5 space-y-4">
              {loadingCreditSummary ? (
                <div className="py-10 text-center text-xs text-gray-500">
                  <ArrowPathIcon className="w-6 h-6 mx-auto animate-spin mb-2 text-emerald-500" />
                  Loading credit exposure summary…
                </div>
              ) : creditSummary ? (
                <>
                  {creditSummary.is_limit_exceeded && (
                    <div className="flex items-start gap-2.5 p-3 rounded-xl bg-rose-50 dark:bg-rose-950/30 border border-rose-200 dark:border-rose-800/50 text-xs text-rose-700 dark:text-rose-300">
                      <ExclamationTriangleIcon className="w-5 h-5 shrink-0 text-rose-600 dark:text-rose-400" />
                      <div>
                        <span className="font-bold block">Credit Limit Exceeded</span>
                        Payable balance exceeds the configured supplier credit limit.
                      </div>
                    </div>
                  )}

                  <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 text-xs">
                    <div className="p-3 rounded-xl border border-gray-200 dark:border-slate-700 bg-gray-50/70 dark:bg-slate-900/40">
                      <span className="text-[10px] uppercase tracking-wider text-gray-400 block">
                        Current Payable
                      </span>
                      <span className="text-base font-bold font-mono text-gray-900 dark:text-gray-100">
                        Rs.{" "}
                        {Number(
                          creditSummary.current_balance ??
                            creditSummary.net_balance ??
                            creditModalSupplier?.current_payable ??
                            0
                        ).toLocaleString()}
                      </span>
                    </div>
                    <div className="p-3 rounded-xl border border-gray-200 dark:border-slate-700 bg-gray-50/70 dark:bg-slate-900/40">
                      <span className="text-[10px] uppercase tracking-wider text-gray-400 block">
                        Credit Limit
                      </span>
                      <span className="text-base font-bold font-mono text-gray-900 dark:text-gray-100">
                        {Number(creditSummary.credit_limit) > 0
                          ? `Rs. ${Number(creditSummary.credit_limit).toLocaleString()}`
                          : "Unlimited"}
                      </span>
                    </div>
                    <div className="p-3 rounded-xl border border-gray-200 dark:border-slate-700 bg-gray-50/70 dark:bg-slate-900/40">
                      <span className="text-[10px] uppercase tracking-wider text-gray-400 block">
                        Available Credit
                      </span>
                      <span className="text-base font-bold font-mono text-emerald-600 dark:text-emerald-400">
                        {creditSummary.available_credit !== null &&
                        creditSummary.available_credit !== undefined
                          ? `Rs. ${Number(creditSummary.available_credit).toLocaleString()}`
                          : "Unlimited"}
                      </span>
                    </div>
                    <div className="p-3 rounded-xl border border-gray-200 dark:border-slate-700 bg-gray-50/70 dark:bg-slate-900/40">
                      <span className="text-[10px] uppercase tracking-wider text-gray-400 block">
                        Credit Terms
                      </span>
                      <span className="text-base font-bold text-gray-900 dark:text-gray-100">
                        {Number(creditSummary.credit_days) > 0
                          ? `${creditSummary.credit_days} Days`
                          : "Immediate"}
                      </span>
                    </div>
                  </div>

                  <div className="p-3.5 rounded-xl border border-amber-200/80 dark:border-amber-800/50 bg-amber-50/60 dark:bg-amber-950/20 flex items-center justify-between text-xs">
                    <div>
                      <span className="text-[10px] uppercase tracking-wider font-semibold text-amber-700 dark:text-amber-400 block">
                        Overdue Payable Amount (
                        {creditSummary.overdue_invoices_count || 0} bill
                        {creditSummary.overdue_invoices_count === 1 ? "" : "s"})
                      </span>
                      <span className="text-sm font-bold font-mono text-amber-900 dark:text-amber-200">
                        Rs. {Number(creditSummary.total_overdue || 0).toLocaleString()}
                      </span>
                    </div>
                    {creditSummary.oldest_due_date && (
                      <div className="text-right">
                        <span className="text-[10px] uppercase tracking-wider text-amber-600 dark:text-amber-400 block">
                          Oldest Due Date
                        </span>
                        <span className="font-mono font-semibold text-amber-900 dark:text-amber-200">
                          {creditSummary.oldest_due_date}
                        </span>
                      </div>
                    )}
                  </div>
                </>
              ) : (
                <div className="py-6 text-center text-xs text-gray-400">
                  No credit summary available.
                </div>
              )}
            </div>

            <div className="px-5 py-3 border-t border-gray-200 dark:border-slate-700 bg-gray-50 dark:bg-slate-800/50 flex justify-end">
              <button
                type="button"
                onClick={() => setCreditModalSupplier(null)}
                className="px-4 py-1.5 rounded-lg text-xs font-semibold bg-gray-200 dark:bg-slate-700 text-gray-700 dark:text-gray-200 hover:bg-gray-300 dark:hover:bg-slate-600"
              >
                Close
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

