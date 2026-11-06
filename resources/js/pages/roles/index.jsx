// src/pages/roles/index.jsx
import React, { useEffect, useMemo, useRef, useState, useCallback } from "react";
import { Link, useNavigate } from "react-router-dom";
import toast from "react-hot-toast";
import axios from "axios";
import { listRoles, deleteRole } from "@/api/roles";
import {
  PlusCircleIcon,
  PencilSquareIcon,
  TrashIcon,
  ArrowPathIcon,
  UserGroupIcon,
  ShieldCheckIcon,
} from "@heroicons/react/24/solid";

// permissions
import { usePermissions, Guard } from "@/api/usePermissions.js";

// Reusable components
import { TextSearch, DeleteConfirmationModal } from "@/components";
import { useTheme } from "@/context/ThemeContext";

// Helper to determine text color based on background brightness
const getContrastText = (hexColor) => {
  hexColor = hexColor.replace('#', '');
  const r = parseInt(hexColor.substring(0, 2), 16);
  const g = parseInt(hexColor.substring(2, 4), 16);
  const b = parseInt(hexColor.substring(4, 6), 16);
  const luminance = (0.299 * r + 0.587 * g + 0.114 * b) / 255;
  return luminance > 0.5 ? '#1f2937' : '#ffffff';
};

export default function RolesIndex() {
  const [rows, setRows] = useState([]);
  const [loading, setLoading] = useState(false);
  const [qSearch, setQSearch] = useState("");

  // pagination (server-side)
  const [page, setPage] = useState(1);
  const [pageSize, setPageSize] = useState(10);
  const [total, setTotal] = useState(0);
  const [lastPage, setLastPage] = useState(1);

  // Delete modal state
  const [deleteModalOpen, setDeleteModalOpen] = useState(false);
  const [deletingRole, setDeletingRole] = useState(null);
  const [deleting, setDeleting] = useState(false);

  const controllerRef = useRef(null);
  const debounceRef = useRef(null);
  const navigate = useNavigate();

  // permissions for 'role'
  const { loading: permsLoading, canFor } = usePermissions();
  const can = useMemo(
    () =>
      (typeof canFor === "function"
        ? canFor("role")
        : { view: false, create: false, update: false, delete: false }),
    [canFor]
  );

  // theme accent used for the primary action and the active page chip
  const { theme } = useTheme();
  const primaryColor = theme?.primary_color || '#3b82f6';
  const primaryTextColor = getContrastText(primaryColor);

  // === Alt+N => /roles/create (gated by can.create) ===
  useEffect(() => {
    const onKeyDown = (e) => {
      if (!e.altKey) return;
      const key = (e.key || "").toLowerCase();
      if (key !== "n") return;
      const tag = (e.target?.tagName || "").toLowerCase();
      const isTyping = ["input", "textarea", "select"].includes(tag) || e.target?.isContentEditable;
      if (isTyping) return;
      if (!can.create) return;
      e.preventDefault();
      navigate("/roles/create");
    };
    window.addEventListener("keydown", onKeyDown);
    return () => window.removeEventListener("keydown", onKeyDown);
  }, [navigate, can.create]);

  const fetchRoles = useCallback(async (signal) => {
    try {
      setLoading(true);
      const { data } = await listRoles({ page, per_page: pageSize, search: qSearch.trim(), signal });
      const items = Array.isArray(data?.data) ? data.data : Array.isArray(data) ? data : [];
      const meta = data?.meta || data || {};
      setRows(items);
      setTotal(Number(meta?.total ?? items.length ?? 0));
      const lp = Number(meta?.last_page ?? 1);
      setLastPage(lp);
      if (page > lp) setPage(lp || 1);
    } catch (err) {
      if (axios.isCancel?.(err)) return;
      const status = err?.response?.status;
      if (status === 403 || status === 401) {
        toast.error("You don't have permission to view roles.");
        return;
      }
      toast.error("Failed to load roles");
    } finally {
      setLoading(false);
    }
  }, [page, pageSize, qSearch]);

  // Initial + pager change (non-debounced)
  useEffect(() => {
    if (permsLoading || !can.view) return;
    if (controllerRef.current) controllerRef.current.abort();
    const ctrl = new AbortController();
    controllerRef.current = ctrl;
    fetchRoles(ctrl.signal);
  }, [permsLoading, can.view, page, pageSize, fetchRoles]);

  // Debounce search
  useEffect(() => {
    if (permsLoading || !can.view) return;
    if (debounceRef.current) clearTimeout(debounceRef.current);
    debounceRef.current = setTimeout(() => {
      setPage(1);
      if (controllerRef.current) controllerRef.current.abort();
      const ctrl = new AbortController();
      controllerRef.current = ctrl;
      fetchRoles(ctrl.signal);
    }, 300);
    return () => clearTimeout(debounceRef.current);
  }, [permsLoading, can.view, qSearch, fetchRoles]);

  const start = rows.length ? (page - 1) * pageSize + 1 : 0;
  const end = rows.length ? start + rows.length - 1 : 0;

  // ===== delete modal handlers =====
  const openDeleteModal = (role) => {
    if (!can.delete) return toast.error("You don't have permission to delete roles.");
    setDeletingRole({ id: role.id, name: role.name });
    setDeleteModalOpen(true);
  };

  const closeDeleteModal = () => {
    setDeleteModalOpen(false);
    setDeletingRole(null);
  };

  const handleConfirmDelete = async (password) => {
    if (!deletingRole?.id) return;
    if (!can.delete) return toast.error("You don't have permission to delete roles.");

    try {
      await axios.post("/api/auth/confirm-password", { password });
      await deleteRole(deletingRole.id);
      toast.success("Role deleted");
      closeDeleteModal();

      if (controllerRef.current) controllerRef.current.abort();
      const ctrl = new AbortController();
      controllerRef.current = ctrl;
      fetchRoles(ctrl.signal);
    } catch (e) {
      const status = e?.response?.status;
      const apiMsg =
        e?.response?.data?.message ||
        (status === 422 ? "Incorrect password" : status === 403 ? "You don't have permission to manage roles." : "Delete failed");
      toast.error(apiMsg);
    }
  };

  const refresh = () => {
    if (controllerRef.current) controllerRef.current.abort();
    const ctrl = new AbortController();
    controllerRef.current = ctrl;
    fetchRoles(ctrl.signal);
  };

  // Check if has actions
  const hasActions = can.update || can.delete;
  const columnCount = 3 + (hasActions ? 1 : 0);

  if (permsLoading) return <div className="p-6">Loading…</div>;
  if (!can.view) return <div className="p-6 text-sm text-gray-700">You don't have permission to view roles.</div>;

  return (
    <div className="products-page people-page people-list-page">
      {/* ===== Overview ===== */}
      <div className="products-panel">
        <div className="products-heading">
          {/* Identity */}
          <div className="flex items-center gap-3 min-w-0">
            <div className="products-identity-icon">
              <UserGroupIcon className="w-6 h-6" />
            </div>
            <div className="min-w-0">
              <h1 className="products-title">Roles</h1>
              <p className="products-subtitle">
                <ShieldCheckIcon className="w-3.5 h-3.5 shrink-0" />
                <span>{total} roles in this view</span>
              </p>
            </div>
          </div>

          {/* Actions */}
          <div className="flex flex-wrap items-center gap-2">
            <button
              onClick={refresh}
              title="Refresh roles"
              aria-label="Refresh roles"
              className="products-action theme-btn-tertiary"
            >
              <ArrowPathIcon className={`w-3.5 h-3.5 ${loading ? "animate-spin" : ""}`} />
              <span>Refresh</span>
            </button>

            <Guard when={can.create}>
              <Link
                to="/roles/create"
                title="Add Role (Alt+N)"
                aria-keyshortcuts="Alt+N"
                className="products-action products-action-primary theme-btn-primary"
              >
                <PlusCircleIcon className="w-4 h-4" />
                <span>Add Role</span>
              </Link>
            </Guard>
          </div>
        </div>

        {/* Search */}
        <div className="products-filter-panel">
          <div className="products-filters">
            <label className="products-filter">
              <span className="products-filter-label">Search roles</span>
              <TextSearch
                value={qSearch}
                onChange={setQSearch}
                placeholder="Search roles by name…"
                className="w-full"
                iconClassName="products-search-icon"
                inputClassName="products-search-input"
              />
            </label>
          </div>
        </div>
      </div>

      {/* ===== Role table ===== */}
      <div className="products-panel products-catalog">
        <div className="products-catalog-heading">
          <div className="flex items-center gap-3 min-w-0">
            <div className="people-section-icon">
              <UserGroupIcon />
            </div>
            <div className="min-w-0">
              <h2 className="products-section-title">Role list</h2>
              <p className="products-subtitle">
                {loading ? (
                  <span className="inline-flex items-center gap-1.5">
                    <ArrowPathIcon className="h-3 w-3 animate-spin" />
                    Loading…
                  </span>
                ) : (
                  `Showing ${rows.length === 0 ? 0 : start}–${end} of ${total}`
                )}
              </p>
            </div>
          </div>

          {/* Page size */}
          <div className="flex items-center gap-2">
            <label htmlFor="roles-page-size" className="products-filter-label">Show</label>
            <select
              id="roles-page-size"
              value={pageSize}
              onChange={(e) => setPageSize(Number(e.target.value))}
              className="cursor-pointer"
            >
              <option value={10}>10</option>
              <option value={25}>25</option>
              <option value={50}>50</option>
              <option value={100}>100</option>
            </select>
          </div>
        </div>

        <div className="products-table-scroll" tabIndex={0} role="region" aria-label="Role list" aria-busy={loading}>
          <table className="products-table people-table">
            <thead>
              <tr className="text-left">
                <th scope="col" className="w-16 pb-2 pl-3">
                  <span className="products-column-label">ID</span>
                </th>
                <th scope="col" className="pb-2 pl-3">
                  <span className="products-column-label">Role</span>
                </th>
                <th scope="col" className="w-48 pb-2 pl-3">
                  <span className="products-column-label">Permissions</span>
                </th>
                {hasActions && (
                  <th scope="col" className="w-28 pb-2 pr-3 text-right">
                    <span className="products-column-label">Actions</span>
                  </th>
                )}
              </tr>
            </thead>

            <tbody>
              {rows.length === 0 && !loading && (
                <tr>
                  <td colSpan={columnCount}>
                    <div className="people-empty">
                      <UserGroupIcon aria-hidden="true" />
                      <div>
                        <p className="people-cell-strong">No roles found</p>
                        <p className="products-subtitle">Try a different search term.</p>
                      </div>
                    </div>
                  </td>
                </tr>
              )}

              {rows.map((r) => {
                const permissionsCount = r.permissions_count ?? 0;

                return (
                  <tr key={r.id} className="group align-middle">
                    <td className="rounded-l-2xl pl-3 products-cell products-meta">
                      {r.id}
                    </td>
                    <td className="products-cell">
                      <span className="flex items-center gap-3 min-w-0">
                        <span className="people-section-icon">
                          <UserGroupIcon aria-hidden="true" />
                        </span>
                        <span className="people-cell-strong truncate">{r.name}</span>
                      </span>
                    </td>
                    <td className="products-cell">
                      <span className="people-badge people-badge-role">
                        <ShieldCheckIcon aria-hidden="true" />
                        {permissionsCount} permissions
                      </span>
                    </td>
                    {hasActions && (
                      <td className="rounded-r-2xl pr-3 products-cell">
                        <div className="flex items-center justify-end gap-1">
                          {/* Edit */}
                          <Guard when={can.update}>
                            <Link
                              to={`/roles/${r.id}/edit`}
                              title="Edit"
                              aria-label={`Edit ${r.name}`}
                              className="products-row-action"
                            >
                              <PencilSquareIcon className="h-4 w-4" />
                            </Link>
                          </Guard>

                          {/* Delete */}
                          <Guard when={can.delete}>
                            <button
                              onClick={() => openDeleteModal(r)}
                              title="Delete"
                              aria-label={`Delete ${r.name}`}
                              className="products-row-action products-row-delete"
                            >
                              <TrashIcon className="h-4 w-4" />
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

        {/* Pagination */}
        <div className="products-pagination">
          <span className="products-subtitle">
            Page {page} of {lastPage} · {total} total
          </span>

          <div className="flex items-center gap-1">
            <button
              onClick={() => setPage(1)}
              disabled={page === 1}
              title="First page"
              aria-label="First page"
              className="products-row-action"
            >
              <svg className="h-4 w-4" fill="none" stroke="currentColor" viewBox="0 0 24 24" aria-hidden="true">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M11 19l-7-7 7-7m8 14l-7-7 7-7" />
              </svg>
            </button>
            <button
              onClick={() => setPage((p) => Math.max(1, p - 1))}
              disabled={page === 1}
              title="Previous page"
              aria-label="Previous page"
              className="products-row-action"
            >
              <svg className="h-4 w-4" fill="none" stroke="currentColor" viewBox="0 0 24 24" aria-hidden="true">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 19l-7-7 7-7" />
              </svg>
            </button>

            {/* Page numbers */}
            <div className="mx-1 flex items-center gap-0.5">
              {Array.from({ length: Math.min(5, lastPage) }, (_, i) => {
                let pageNum;
                if (lastPage <= 5) {
                  pageNum = i + 1;
                } else if (page <= 3) {
                  pageNum = i + 1;
                } else if (page >= lastPage - 2) {
                  pageNum = lastPage - 4 + i;
                } else {
                  pageNum = page - 2 + i;
                }
                return (
                  <button
                    key={pageNum}
                    onClick={() => setPage(pageNum)}
                    aria-label={`Page ${pageNum}`}
                    aria-current={page === pageNum ? "page" : undefined}
                    style={page === pageNum ? { backgroundColor: primaryColor, color: primaryTextColor } : undefined}
                  >
                    {pageNum}
                  </button>
                );
              })}
            </div>

            <button
              onClick={() => setPage((p) => Math.min(lastPage, p + 1))}
              disabled={page === lastPage}
              title="Next page"
              aria-label="Next page"
              className="products-row-action"
            >
              <svg className="h-4 w-4" fill="none" stroke="currentColor" viewBox="0 0 24 24" aria-hidden="true">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 5l7 7-7 7" />
              </svg>
            </button>
            <button
              onClick={() => setPage(lastPage)}
              disabled={page === lastPage}
              title="Last page"
              aria-label="Last page"
              className="products-row-action"
            >
              <svg className="h-4 w-4" fill="none" stroke="currentColor" viewBox="0 0 24 24" aria-hidden="true">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M13 5l7 7-7 7M5 5l7 7-7 7" />
              </svg>
            </button>
          </div>
        </div>
      </div>

      {/* Delete Confirmation Modal */}
      <DeleteConfirmationModal
        isOpen={deleteModalOpen}
        onClose={closeDeleteModal}
        onConfirm={handleConfirmDelete}
        itemName={deletingRole?.name || "this role"}
        title="Delete role"
        isDeleting={deleting}
        setIsDeleting={setDeleting}
      />
    </div>
  );
}
