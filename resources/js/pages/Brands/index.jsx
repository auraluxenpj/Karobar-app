import React, { useEffect, useMemo, useRef, useState, useCallback } from "react";
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
  TagIcon,
  ExclamationTriangleIcon,
  CheckCircleIcon,
  ChevronDoubleLeftIcon,
  ChevronLeftIcon,
  ChevronRightIcon,
  ChevronDoubleRightIcon,
} from "@heroicons/react/24/solid";
import BrandImportModal from "@/components/BrandImportModal.jsx";
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

export default function BrandsIndex() {
  const navigate = useNavigate();
  const { isDark, theme } = useTheme();
  const primaryColor = theme?.primary_color || "#3b82f6";

  const [rows, setRows] = useState([]);
  const [loading, setLoading] = useState(false);
  const [exporting, setExporting] = useState(false);
  const [importOpen, setImportOpen] = useState(false);

  const [qName, setQName] = useState("");
  const [policyFilter, setPolicyFilter] = useState("all");
  const [page, setPage] = useState(1);
  const [pageSize, setPageSize] = useState(25);
  const [total, setTotal] = useState(0);
  const [lastPage, setLastPage] = useState(1);

  const controllerRef = useRef(null);
  const debounceRef = useRef(null);

  const { loading: permsLoading, canFor } = usePermissions();
  const can =
    (typeof canFor === "function" ? canFor("brand") : null) ?? {
      view: false,
      create: false,
      update: false,
      delete: false,
      import: false,
      export: false,
    };

  const selectStyles = useMemo(
    () => getReactSelectStyles(isDark, primaryColor),
    [isDark, primaryColor]
  );

  useEffect(() => {
    document.title = "Brands - Karobar App";
  }, []);

  // Alt + N -> Open Create Brand page
  useEffect(() => {
    const onKeyDown = (e) => {
      if (e.altKey && (e.key || "").toLowerCase() === "n") {
        if (!can.create) return;
        e.preventDefault();
        navigate("/brands/create");
      }
    };
    window.addEventListener("keydown", onKeyDown);
    return () => window.removeEventListener("keydown", onKeyDown);
  }, [can.create, navigate]);

  const fetchBrands = useCallback(
    async (signal) => {
      try {
        setLoading(true);
        const { data } = await axios.get("/api/brands", {
          params: {
            page,
            per_page: pageSize,
            q_name: qName.trim(),
            policy: policyFilter !== "all" ? policyFilter : undefined,
          },
          signal,
        });

        const items = Array.isArray(data?.data)
          ? data.data
          : Array.isArray(data)
          ? data
          : [];
        setRows(items);
        setTotal(Number(data?.total ?? items.length ?? 0));
        const lp = Number(data?.last_page ?? 1);
        setLastPage(lp);
        if (page > lp) setPage(lp || 1);
      } catch (err) {
        if (axios.isCancel?.(err)) return;
        if (err?.response?.status === 403)
          toast.error("You don't have permission to view brands.");
        else toast.error("Failed to load brands");
      } finally {
        setLoading(false);
      }
    },
    [page, pageSize, qName, policyFilter]
  );

  const didMountFiltersRef = useRef(false);

  useEffect(() => {
    if (permsLoading || !can.view) return;
    if (controllerRef.current) controllerRef.current.abort();
    const ctrl = new AbortController();
    controllerRef.current = ctrl;
    fetchBrands(ctrl.signal);
    return () => ctrl.abort();
  }, [page, pageSize, policyFilter, permsLoading, can.view]);

  useEffect(() => {
    if (permsLoading || !can.view) return;
    if (!didMountFiltersRef.current) {
      didMountFiltersRef.current = true;
      return;
    }
    if (debounceRef.current) clearTimeout(debounceRef.current);
    debounceRef.current = setTimeout(() => {
      setPage(1);
      if (controllerRef.current) controllerRef.current.abort();
      const ctrl = new AbortController();
      controllerRef.current = ctrl;
      fetchBrands(ctrl.signal);
    }, 300);
    return () => clearTimeout(debounceRef.current);
  }, [qName, permsLoading, can.view]);

  const handleDelete = async (b) => {
    if (!can.delete)
      return toast.error("You don't have permission to delete brands.");
    const used = Number(b.products_count || 0) > 0;
    if (used) return toast.error("Cannot delete: brand is used by products.");
    if (!window.confirm(`Delete brand "${b.name}"?`)) return;

    try {
      await axios.delete(`/api/brands/${b.id}`);
      toast.success("Brand deleted");
      if (controllerRef.current) controllerRef.current.abort();
      const ctrl = new AbortController();
      controllerRef.current = ctrl;
      await fetchBrands(ctrl.signal);
    } catch (err) {
      toast.error(err?.response?.data?.message || "Could not delete brand.");
    }
  };

  const handleExport = async () => {
    if (!can.export)
      return toast.error("You don't have permission to export brands.");
    try {
      setExporting(true);
      const res = await axios.get("/api/brands/export", {
        responseType: "blob",
      });
      const stamp = new Date()
        .toISOString()
        .slice(0, 19)
        .replace(/[:T]/g, "-");
      const filename = `brands_${stamp}.csv`;
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

  if (permsLoading) return <div className="p-6">Loading…</div>;
  if (!can.view)
    return (
      <div className="p-6 text-sm text-gray-700">
        You don&apos;t have permission to view brands.
      </div>
    );

  const hasActions = can.update || can.delete;

  return (
    <div className="directory-page space-y-4">
      <div className="products-panel directory-overview">
        <div className="products-heading">
          <div className="flex items-center gap-4">
            <div className="products-identity-icon">
              <TagIcon className="w-6 h-6" />
            </div>
            <div>
              <h1 className="products-title">Brands & Expiry Return Policies</h1>
              <p className="products-subtitle">
                <TagIcon className="w-3.5 h-3.5" />
                <span>{total} brands configured with expiry return intimation rules</span>
              </p>
            </div>
          </div>

          <div className="flex items-center gap-2.5 flex-wrap">
            <Guard when={can.create}>
              <Link
                to="/brands/create"
                title="Add Brand (Alt+N)"
                className="products-action products-action-primary theme-btn-primary"
              >
                <PlusCircleIcon className="w-4 h-4" />
                <span>Add Brand (Alt+N)</span>
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
              onClick={() => {
                if (controllerRef.current) controllerRef.current.abort();
                const ctrl = new AbortController();
                controllerRef.current = ctrl;
                fetchBrands(ctrl.signal);
              }}
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
              onChange={(e) => setQName(e.target.value)}
              aria-label="Search brands"
              placeholder="Search brands by name..."
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

      {/* Full-Width Brands Directory Card */}
      <GlassCard className="directory-panel directory-list">
        <div className="p-3">
          <div className="directory-table-scroll">
            <table className="w-full text-sm">
              <thead className="bg-white/80 dark:bg-slate-700/80 sticky top-0">
                <tr className="border-b border-gray-200/70 dark:border-slate-600/70 text-left">
                  <th className="px-3.5 py-2.5 font-semibold text-gray-600 dark:text-gray-300 text-xs uppercase">
                    Brand
                  </th>
                  <th className="px-3.5 py-2.5 font-semibold text-gray-600 dark:text-gray-300 text-xs uppercase">
                    Expiry Return Policy
                  </th>
                  <th className="px-3.5 py-2.5 font-semibold text-gray-600 dark:text-gray-300 text-xs uppercase">
                    Products
                  </th>
                  <th className="px-3.5 py-2.5 font-semibold text-gray-600 dark:text-gray-300 text-xs uppercase">
                    Intimation Status
                  </th>
                  {hasActions && (
                    <th className="px-3.5 py-2.5 font-semibold text-gray-600 dark:text-gray-300 text-xs uppercase text-center w-32">
                      Actions
                    </th>
                  )}
                </tr>
              </thead>
              <tbody>
                {rows.length === 0 && !loading && (
                  <tr>
                    <td
                      className="px-3 py-10 text-center text-gray-500 dark:text-gray-400"
                      colSpan={hasActions ? 5 : 4}
                    >
                      <div className="flex flex-col items-center gap-2">
                        <TagIcon className="w-8 h-8 text-gray-400" />
                        <p className="text-sm">No brands found</p>
                      </div>
                    </td>
                  </tr>
                )}

                {rows.map((b) => {
                  const used = Number(b.products_count || 0) > 0;
                  const dueCount = Number(b.intimation_due_count || 0);
                  const dueUnits = Number(b.intimation_due_units || 0);

                  return (
                    <tr
                      key={b.id}
                      className="odd:bg-white/90 even:bg-white/70 dark:odd:bg-slate-700/60 dark:even:bg-slate-800/60 hover:bg-blue-50/70 dark:hover:bg-slate-600/50 transition-colors"
                    >
                      <td className="px-3.5 py-2.5">
                        <div className="flex items-center gap-3">
                          {b.image ? (
                            <img
                              src={`/storage/${b.image}`}
                              alt={b.name}
                              className="w-10 h-10 rounded-xl object-contain ring-1 ring-gray-200/70 bg-white/70 shrink-0"
                            />
                          ) : (
                            <div className="w-10 h-10 rounded-xl bg-gray-100 dark:bg-slate-700 flex items-center justify-center shrink-0">
                              <TagIcon className="w-4 h-4 text-gray-400" />
                            </div>
                          )}
                          <div>
                            <div className="font-semibold text-gray-900 dark:text-gray-100">
                              {b.name}
                            </div>
                            {b.expiry_return_notes && (
                              <div className="text-xs text-gray-500 dark:text-gray-400">
                                {b.expiry_return_notes}
                              </div>
                            )}
                          </div>
                        </div>
                      </td>

                      <td className="px-3.5 py-2.5">
                        <ExpiryPolicyBadge
                          policy={b.expiry_return_policy}
                          months={b.expiry_return_months}
                          days={b.expiry_return_days}
                          label={b.expiry_policy_label}
                        />
                      </td>

                      <td className="px-3.5 py-2.5 font-mono text-xs font-semibold text-slate-700 dark:text-slate-200">
                        {b.products_count ?? 0} Products
                      </td>

                      <td className="px-3.5 py-2.5">
                        {dueCount > 0 ? (
                          <button
                            type="button"
                            onClick={() => navigate(`/brands/${b.id}/edit`)}
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

                      {hasActions && (
                        <td className="px-3.5 py-2.5">
                          <div className="flex items-center justify-center gap-1.5">
                            <Guard when={can.update}>
                              <Link
                                to={`/brands/${b.id}/edit`}
                                className="products-row-action"
                                aria-label={`Edit ${b.name}`}
                                title="Edit Brand & Expiry Return Policy"
                              >
                                <PencilSquareIcon
                                  aria-hidden="true"
                                  className="w-4 h-4"
                                />
                              </Link>
                            </Guard>
                            <Guard when={can.delete}>
                              <button
                                onClick={() =>
                                  used
                                    ? toast.error(
                                        "Cannot delete: brand is used by products."
                                      )
                                    : handleDelete(b)
                                }
                                disabled={used}
                                className="products-row-action products-row-delete"
                                aria-label={`Delete ${b.name}`}
                                title={
                                  used
                                    ? "Cannot delete: brand is used by products."
                                    : "Delete"
                                }
                              >
                                <TrashIcon
                                  aria-hidden="true"
                                  className="w-4 h-4"
                                />
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
              Page {page} of {lastPage}
            </span>
            <div className="flex items-center gap-1">
              <button
                onClick={() => setPage(1)}
                disabled={page === 1}
                className={`p-1.5 rounded-sm hover:bg-gray-200 dark:hover:bg-slate-700 ${
                  page === 1 ? "opacity-40" : ""
                }`}
              >
                <ChevronDoubleLeftIcon className="w-3.5 h-3.5" />
              </button>
              <button
                onClick={() => setPage((p) => Math.max(1, p - 1))}
                disabled={page === 1}
                className={`p-1.5 rounded-sm hover:bg-gray-200 dark:hover:bg-slate-700 ${
                  page === 1 ? "opacity-40" : ""
                }`}
              >
                <ChevronLeftIcon className="w-3.5 h-3.5" />
              </button>
              <span className="mx-1 px-2 py-0.5 rounded-sm bg-gray-100 dark:bg-slate-700 font-medium">
                {page}
              </span>
              <button
                onClick={() => setPage((p) => Math.min(lastPage, p + 1))}
                disabled={page === lastPage}
                className={`p-1.5 rounded-sm hover:bg-gray-200 dark:hover:bg-slate-700 ${
                  page === lastPage ? "opacity-40" : ""
                }`}
              >
                <ChevronRightIcon className="w-3.5 h-3.5" />
              </button>
              <button
                onClick={() => setPage(lastPage)}
                disabled={page === lastPage}
                className={`p-1.5 rounded-sm hover:bg-gray-200 dark:hover:bg-slate-700 ${
                  page === lastPage ? "opacity-40" : ""
                }`}
              >
                <ChevronDoubleRightIcon className="w-3.5 h-3.5" />
              </button>
            </div>
          </div>
        </div>
      </GlassCard>

      <BrandImportModal
        open={importOpen}
        onClose={() => setImportOpen(false)}
        onImported={() => {
          if (controllerRef.current) controllerRef.current.abort();
          const ctrl = new AbortController();
          controllerRef.current = ctrl;
          fetchBrands(ctrl.signal);
        }}
      />
    </div>
  );
}

