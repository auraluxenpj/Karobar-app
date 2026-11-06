import React, { useEffect, useMemo, useState } from "react";
import axios from "axios";
import toast from "react-hot-toast";
import { Link, useNavigate } from "react-router-dom";
import {
  PlusCircleIcon,
  ArrowPathIcon,
  TrashIcon,
  HandRaisedIcon,
  CheckCircleIcon,
  ShoppingCartIcon,
  XCircleIcon,
  CubeIcon,
} from "@heroicons/react/24/solid";
import { usePermissions } from "@/api/usePermissions.js";
import { useTheme } from "@/context/ThemeContext.jsx";
import { DeleteConfirmationModal } from "@/components";

const STATUS_STYLES = {
  pending: { label: "Pending" },
  ordered: { label: "Ordered" },
  fulfilled: { label: "Fulfilled" },
  cancelled: { label: "Cancelled" },
};

const STATUS_ORDER = ["pending", "ordered", "fulfilled", "cancelled"];

export default function UserDemandsIndex() {
  const { has } = usePermissions();
  const { theme } = useTheme();
  const navigate = useNavigate();

  const themeColors = useMemo(() => ({
    primary: theme?.primary_color || '#3b82f6',
    primaryHover: theme?.primary_hover || '#2563eb',
    primaryLight: theme?.primary_light || '#dbeafe',
    secondary: theme?.secondary_color || '#8b5cf6',
    secondaryHover: theme?.secondary_hover || '#7c3aed',
    secondaryLight: theme?.secondary_light || '#ede9fe',
    danger: theme?.danger_color || '#ef4444',
  }), [theme]);

  const [rows, setRows] = useState([]);
  const [loading, setLoading] = useState(false);
  const [statusFilter, setStatusFilter] = useState("pending");
  const [stats, setStats] = useState({
    count: 0,
    pending_count: 0,
    ordered_count: 0,
    fulfilled_count: 0,
    cancelled_count: 0,
  });

  const canView = has("user-demands.view");
  const canCreate = has("user-demands.create");
  const canUpdate = has("user-demands.update");
  const canDelete = has("user-demands.delete");

  const [deleteOpen, setDeleteOpen] = useState(false);
  const [deleting, setDeleting] = useState(null);
  const [deletingLoading, setDeletingLoading] = useState(false);

  const notifyTopbarCountChanged = () => {
    window.dispatchEvent(new CustomEvent("notifications-changed"));
  };

  useEffect(() => {
    const onKeyDown = (e) => {
      if (e.defaultPrevented) return;
      if (!(e.ctrlKey || e.metaKey) || e.altKey || e.shiftKey || e.repeat || (e.key || "").toLowerCase() !== "n") return;
      if (!canView || !canCreate || deleteOpen) return;
      e.preventDefault();
      navigate("/user-demands/create");
    };
    window.addEventListener("keydown", onKeyDown);
    return () => window.removeEventListener("keydown", onKeyDown);
  }, [navigate, canView, canCreate, deleteOpen]);

  const fetchDemands = async () => {
    setLoading(true);
    try {
      const { data } = await axios.get("/api/user-demands", {
        params: { status: statusFilter || undefined, limit: 200 },
      });
      setRows(Array.isArray(data?.rows) ? data.rows : []);
      setStats({
        count: data?.count || 0,
        pending_count: data?.pending_count || 0,
        ordered_count: data?.ordered_count || 0,
        fulfilled_count: data?.fulfilled_count || 0,
        cancelled_count: data?.cancelled_count || 0,
      });
    } catch (err) {
      console.error(err);
      toast.error("Failed to load user demands.");
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    if (canView) fetchDemands();
  }, [statusFilter, canView]);

  const changeStatus = async (demand, status) => {
    if (!canUpdate) return toast.error("You don't have permission to update demands.");
    try {
      await axios.put(`/api/user-demands/${demand.id}`, { status });
      toast.success(`Marked as ${STATUS_STYLES[status]?.label || status}.`);
      fetchDemands();
      notifyTopbarCountChanged();
    } catch (err) {
      toast.error(err?.response?.data?.message || "Update failed.");
    }
  };

  const openDelete = (d) => {
    if (!canDelete) return toast.error("You don't have permission to delete demands.");
    setDeleting(d);
    setDeleteOpen(true);
  };

  const confirmDelete = async (_password) => {
    if (!deleting) return;
    try {
      await axios.delete(`/api/user-demands/${deleting.id}`);
      toast.success("User demand deleted.");
      setDeleteOpen(false);
      setDeleting(null);
      fetchDemands();
      notifyTopbarCountChanged();
    } catch (err) {
      toast.error(err?.response?.data?.message || "Delete failed.");
    }
  };

  if (!canView) return <div className="p-6 text-sm text-gray-700">You don't have permission to view User Demands.</div>;

  return (
    <div className="user-demands-page space-y-4">
      {/* Hero */}
      <div
        className="user-demands-header products-panel"
      >
        <div className="relative px-6 pt-5 pb-4 flex flex-col lg:flex-row lg:items-center justify-between gap-4">
          <div className="flex items-center gap-4">
            <div className="products-identity-icon">
              <HandRaisedIcon className="w-6 h-6 text-white" />
            </div>
            <div>
              <h1 className="products-title">User Demands</h1>
              <p className="products-subtitle">
                <CubeIcon className="w-3.5 h-3.5" />
                {stats.pending_count} pending · {stats.count} total
              </p>
            </div>
          </div>

          <div className="flex items-center gap-2.5 flex-wrap">
            <button
              onClick={fetchDemands}
              disabled={loading}
              className="products-action theme-btn-tertiary"
            >
              <ArrowPathIcon className={`w-4 h-4 ${loading ? "animate-spin" : ""}`} />
              <span>{loading ? "Loading…" : "Refresh"}</span>
            </button>
            {canCreate && (
              <Link
                to="/user-demands/create"
                title="Request products (Ctrl+N)"
                aria-keyshortcuts="Control+N"
                className="products-action products-action-primary theme-btn-primary"
              >
                <PlusCircleIcon className="w-4 h-4" />
                <span>Request Products</span>
                <kbd className="text-[10px] opacity-70">Ctrl+N</kbd>
              </Link>
            )}
          </div>
        </div>

        {/* Status filter */}
        <div className="relative px-6 pt-2 pb-5">
          <div className="user-demand-status-filters" role="group" aria-label="Filter demands by status">
            {["all", ...STATUS_ORDER].map((s) => {
              const countMap = {
                all: stats.count,
                pending: stats.pending_count,
                ordered: stats.ordered_count,
                fulfilled: stats.fulfilled_count,
                cancelled: stats.cancelled_count,
              };
              const badgeCount = countMap[s];
              return (
                <button
                  key={s}
                  onClick={() => setStatusFilter(s === "all" ? "" : s)}
                  aria-pressed={statusFilter === (s === "all" ? "" : s)}
                  className={`user-demand-status-option ${statusFilter === (s === "all" ? "" : s) ? "theme-btn-secondary" : "theme-btn-tertiary"}`}
                >
                  <span>{s === "all" ? "All" : STATUS_STYLES[s]?.label}</span>
                  {typeof badgeCount === "number" && (
                    <span className="ml-1.5 text-[11px] opacity-80 font-mono">({badgeCount})</span>
                  )}
                </button>
              );
            })}
          </div>
        </div>
      </div>

      {/* Table */}
      <div className="user-demands-table products-panel overflow-hidden">
        <div className="flex items-center justify-between px-4 py-3 border-b border-gray-100 dark:border-slate-700">
          <div className="flex items-center gap-2.5">
            <div className="p-2 rounded-xl shadow-xs" style={{ backgroundColor: themeColors.secondaryLight }}>
              <HandRaisedIcon className="w-4 h-4" style={{ color: themeColors.secondary }} />
            </div>
            <div>
              <span className="text-sm font-semibold text-gray-700 dark:text-gray-200">Demand List</span>
              <p className="text-[11px] text-gray-400 dark:text-gray-500">{rows.length} item(s)</p>
            </div>
          </div>
        </div>

        <div className="max-h-[65vh] overflow-auto" role="region" aria-label="User demand list" tabIndex={0}>
          <table className="w-full text-sm">
            <thead className="sticky top-0 bg-white dark:bg-slate-800 z-10 shadow-xs">
              <tr className="text-left text-gray-600 dark:text-gray-300 text-xs uppercase tracking-wider">
                <th className="px-3 py-2 font-semibold">Product</th>
                <th className="px-3 py-2 font-semibold">Brand</th>
                <th className="px-3 py-2 font-semibold">Supplier</th>
                <th className="px-3 py-2 font-semibold text-right">Stock</th>
                <th className="px-3 py-2 font-semibold text-right">Demand Qty</th>
                <th className="px-3 py-2 font-semibold">Requested By</th>
                <th className="px-3 py-2 font-semibold">Customer</th>
                <th className="px-3 py-2 font-semibold">Notes</th>
                <th className="px-3 py-2 font-semibold">Status</th>
                <th className="px-3 py-2 font-semibold text-center">Actions</th>
              </tr>
            </thead>
            <tbody>
              {loading && rows.length === 0 && (
                <tr><td colSpan={10} className="px-3 py-12 text-center" role="status">Loading demands…</td></tr>
              )}
              {rows.length === 0 && !loading && (
                <tr>
                  <td colSpan={10} className="px-3 py-12 text-center text-gray-500 dark:text-gray-400">
                    <div className="flex flex-col items-center gap-2">
                      <HandRaisedIcon className="w-8 h-8 text-gray-400" />
                      <p>No user demands found.</p>
                      {canCreate && (
                        <Link
                          to="/user-demands/create"
                          className="products-action products-action-primary theme-btn-primary text-xs font-semibold"
                        >
                          <PlusCircleIcon className="w-3.5 h-3.5" />
                          <span>Request a product</span>
                        </Link>
                      )}
                    </div>
                  </td>
                </tr>
              )}

              {rows.map((d) => {
                const st = STATUS_STYLES[d.status] || STATUS_STYLES.pending;
                const itemName = d.requested_name || d.product?.name || "demand";
                return (
                  <tr key={d.id} className="odd:bg-white even:bg-gray-50 dark:odd:bg-slate-700/40 dark:even:bg-slate-800/40 hover:bg-blue-50 dark:hover:bg-slate-600/50 transition-colors border-b border-gray-100 dark:border-slate-700/50">
                    <td className="px-3 py-2.5">
                      <div className="font-medium text-gray-800 dark:text-gray-200">
                        {d.requested_name || d.product?.name || "—"}
                      </div>
                      {d.product?.product_code && (
                        <div className="text-xs text-gray-500 dark:text-gray-400">{d.product.product_code}</div>
                      )}
                    </td>
                    <td className="px-3 py-2.5 text-gray-700 dark:text-gray-300">{d.product_brand_name || "—"}</td>
                    <td className="px-3 py-2.5 text-gray-700 dark:text-gray-300">{d.product_supplier_name || "—"}</td>
                    <td className="px-3 py-2.5 text-right font-mono text-gray-600 dark:text-gray-300">
                      {d.product?.quantity ?? "—"}
                    </td>
                    <td className="px-3 py-2.5 text-right font-semibold text-gray-800 dark:text-gray-200">{d.requested_quantity}</td>
                    <td className="px-3 py-2.5 text-gray-700 dark:text-gray-300">
                      {d.requester?.name || "—"}
                    </td>
                    <td className="px-3 py-2.5 text-gray-700 dark:text-gray-300">{d.customer?.name || "—"}</td>
                    <td className="px-3 py-2.5 text-xs text-gray-600 dark:text-gray-300 max-w-[220px]">
                      {d.notes ? (
                        <span className="line-clamp-2" title={d.notes}>{d.notes}</span>
                      ) : (
                        <span className="text-gray-400 dark:text-gray-500">—</span>
                      )}
                    </td>
                    <td className="px-3 py-2.5">
                      <span className={`user-demand-badge user-demand-badge-${d.status || "pending"}`}>
                        {st.label}
                      </span>
                    </td>
                    <td className="px-3 py-2.5">
                      <div className="flex items-center justify-center gap-1.5">
                        {canUpdate && d.status === "pending" && (
                          <>
                            <button
                              type="button"
                              onClick={() => changeStatus(d, "ordered")}
                              title="Mark as Ordered"
                              aria-label={`Mark as Ordered: ${itemName}`}
                              className="products-row-action text-blue-600 hover:text-blue-700"
                            >
                              <ShoppingCartIcon className="w-4 h-4" />
                            </button>
                            <button
                              type="button"
                              onClick={() => changeStatus(d, "fulfilled")}
                              title="Mark as Fulfilled"
                              aria-label={`Mark as Fulfilled: ${itemName}`}
                              className="products-row-action text-emerald-600 hover:text-emerald-700"
                            >
                              <CheckCircleIcon className="w-4 h-4" />
                            </button>
                            <button
                              type="button"
                              onClick={() => changeStatus(d, "cancelled")}
                              title="Cancel demand"
                              aria-label={`Cancel demand: ${itemName}`}
                              className="products-row-action products-row-action-danger"
                            >
                              <XCircleIcon className="w-4 h-4" />
                            </button>
                          </>
                        )}

                        {canUpdate && d.status === "ordered" && (
                          <>
                            <button
                              type="button"
                              onClick={() => changeStatus(d, "fulfilled")}
                              title="Mark as Fulfilled"
                              aria-label={`Mark as Fulfilled: ${itemName}`}
                              className="products-row-action text-emerald-600 hover:text-emerald-700"
                            >
                              <CheckCircleIcon className="w-4 h-4" />
                            </button>
                            <button
                              type="button"
                              onClick={() => changeStatus(d, "pending")}
                              title="Revert to Pending"
                              aria-label={`Revert to Pending: ${itemName}`}
                              className="products-row-action text-amber-600 hover:text-amber-700"
                            >
                              <ArrowPathIcon className="w-4 h-4" />
                            </button>
                            <button
                              type="button"
                              onClick={() => changeStatus(d, "cancelled")}
                              title="Cancel demand"
                              aria-label={`Cancel demand: ${itemName}`}
                              className="products-row-action products-row-action-danger"
                            >
                              <XCircleIcon className="w-4 h-4" />
                            </button>
                          </>
                        )}

                        {canUpdate && (d.status === "fulfilled" || d.status === "cancelled") && (
                          <button
                            type="button"
                            onClick={() => changeStatus(d, "pending")}
                            title="Reopen as Pending"
                            aria-label={`Reopen as Pending: ${itemName}`}
                            className="products-row-action text-amber-600 hover:text-amber-700"
                          >
                            <ArrowPathIcon className="w-4 h-4" />
                          </button>
                        )}

                        {canDelete && (
                          <button
                            type="button"
                            onClick={() => openDelete(d)}
                            title="Delete"
                            aria-label={`Delete: ${itemName}`}
                            className="products-row-action products-row-action-danger"
                          >
                            <TrashIcon className="w-4 h-4" />
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
      </div>

      <DeleteConfirmationModal
        isOpen={deleteOpen}
        onClose={() => setDeleteOpen(false)}
        onConfirm={confirmDelete}
        itemName={deleting?.requested_name || "this demand"}
        title="Delete user demand"
        isDeleting={deletingLoading}
        setIsDeleting={setDeletingLoading}
      />
    </div>
  );
}
