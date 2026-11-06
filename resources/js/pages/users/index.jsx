// src/pages/users/index.jsx
import React, { useEffect, useMemo, useRef, useState, useCallback } from "react";
import axios from "axios";
import { Link, useNavigate } from "react-router-dom";
import toast from "react-hot-toast";
import {
  TrashIcon,
  PencilSquareIcon,
  PlusCircleIcon,
  ArrowPathIcon,
  UserCircleIcon,
  EnvelopeIcon,
  ShieldCheckIcon,
  ClockIcon,
} from "@heroicons/react/24/solid";
import DocumentHistoryModal from "@/components/DocumentHistoryModal.jsx";

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

export default function UsersIndex() {
  const [rows, setRows] = useState([]);
  const [loading, setLoading] = useState(false);

  // filters
  const [qSearch, setQSearch] = useState("");

  // pagination (server-side)
  const [page, setPage] = useState(1);
  const [pageSize, setPageSize] = useState(10);
  const [total, setTotal] = useState(0);
  const [lastPage, setLastPage] = useState(1);

  // selection
  const [selectedIds, setSelectedIds] = useState(new Set());
  const [availableRoles, setAvailableRoles] = useState([]);
  const [bulkRole, setBulkRole] = useState("");
  const [bulkProcessing, setBulkProcessing] = useState(false);

  // Delete modal state
  const [deleteModalOpen, setDeleteModalOpen] = useState(false);
  const [deletingUser, setDeletingUser] = useState(null);
  const [deleting, setDeleting] = useState(false);
  const [auditLogOpen, setAuditLogOpen] = useState(false);

  const navigate = useNavigate();

  // AbortController + debounce for fetches
  const controllerRef = useRef(null);
  const debounceRef = useRef(null);

  // permissions
  const { loading: permsLoading, canFor } = usePermissions();
  const can = useMemo(
    () =>
      (typeof canFor === "function"
        ? canFor("user")
        : { view: false, create: false, update: false, delete: false }),
    [canFor]
  );

  // theme accent used for the primary action and the active page chip
  const { theme } = useTheme();
  const primaryColor = theme?.primary_color || '#3b82f6';
  const primaryTextColor = getContrastText(primaryColor);

  // === Alt+N => /users/create (only when can.create) ===
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
      navigate("/users/create");
    };
    window.addEventListener("keydown", onKeyDown);
    return () => window.removeEventListener("keydown", onKeyDown);
  }, [navigate, can.create]);

  const fetchUsers = useCallback(async (signal) => {
    try {
      setLoading(true);
      const { data } = await axios.get("/api/users", {
        params: {
          page,
          per_page: pageSize,
          search: qSearch.trim(),
        },
        signal,
      });

      // Expecting { data: [...], meta: {...} } or a raw array fallback
      const items = Array.isArray(data?.data) ? data.data : Array.isArray(data) ? data : [];
      const meta = data?.meta || data;
      setRows(items);
      setTotal(Number(meta?.total ?? items.length ?? 0));
      const lp = Number(meta?.last_page ?? 1);
      setLastPage(lp);
      if (page > lp) setPage(lp || 1);
    } catch (err) {
      if (axios.isCancel?.(err)) return;
      const status = err?.response?.status;
      if (status === 403 || status === 401) {
        toast.error("You don't have permission to view users.");
        return;
      }
      toast.error("Failed to load users");
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
    fetchUsers(ctrl.signal);
  }, [permsLoading, can.view, page, pageSize, fetchUsers]);

  // Fetch roles for bulk role assignment
  useEffect(() => {
    if (permsLoading || !can.view) return;
    axios
      .get("/api/roles", { params: { per_page: 100 } })
      .then(({ data }) => {
        const list = Array.isArray(data?.data) ? data.data : Array.isArray(data) ? data : [];
        setAvailableRoles(list);
      })
      .catch(() => {});
  }, [permsLoading, can.view]);

  const handleBulkAction = async (action) => {
    const ids = Array.from(selectedIds);
    if (ids.length === 0) return;
    if (action === "assign_role" && !bulkRole) {
      toast.error("Please select a role first");
      return;
    }
    if (action === "delete" && !window.confirm(`Delete ${ids.length} selected user(s)?`)) {
      return;
    }
    try {
      setBulkProcessing(true);
      const { data } = await axios.post("/api/users/bulk-action", {
        action,
        user_ids: ids,
        role: action === "assign_role" ? bulkRole : undefined,
      });
      toast.success(data?.message || "Bulk action completed");
      setSelectedIds(new Set());
      refresh();
    } catch (err) {
      toast.error(err?.response?.data?.message || "Bulk action failed");
    } finally {
      setBulkProcessing(false);
    }
  };

  // Debounce filter changes (qSearch)
  useEffect(() => {
    if (permsLoading || !can.view) return;
    if (debounceRef.current) clearTimeout(debounceRef.current);
    debounceRef.current = setTimeout(() => {
      setPage(1);
      if (controllerRef.current) controllerRef.current.abort();
      const ctrl = new AbortController();
      controllerRef.current = ctrl;
      fetchUsers(ctrl.signal);
    }, 300);
    return () => clearTimeout(debounceRef.current);
  }, [permsLoading, can.view, qSearch, fetchUsers]);

  const start = rows.length ? (page - 1) * pageSize + 1 : 0;
  const end = rows.length ? start + rows.length - 1 : 0;

  // selection helpers
  const pageAllChecked = rows.length > 0 && rows.every((u) => selectedIds.has(u.id));
  const pageIndeterminate = rows.some((u) => selectedIds.has(u.id)) && !pageAllChecked;

  const togglePageAll = (checked) => {
    setSelectedIds((prev) => {
      const copy = new Set(prev);
      if (checked) rows.forEach((u) => copy.add(u.id));
      else rows.forEach((u) => copy.delete(u.id));
      return copy;
    });
  };

  const toggleOne = (id, checked) => {
    setSelectedIds((prev) => {
      const copy = new Set(prev);
      if (checked) copy.add(id);
      else copy.delete(id);
      return copy;
    });
  };

  // ===== delete modal handlers =====
  const openDeleteModal = (u) => {
    if (!can.delete) return toast.error("You don't have permission to delete users.");
    setDeletingUser({ id: u.id, name: u.name, email: u.email });
    setDeleteModalOpen(true);
  };

  const closeDeleteModal = () => {
    setDeleteModalOpen(false);
    setDeletingUser(null);
  };

  const handleConfirmDelete = async (password) => {
    if (!deletingUser?.id) return;
    if (!can.delete) return toast.error("You don't have permission to delete users.");

    try {
      await axios.post("/api/auth/confirm-password", { password });
      await axios.delete(`/api/users/${deletingUser.id}`);
      toast.success("User deleted");

      setSelectedIds((prev) => {
        const copy = new Set(prev);
        copy.delete(deletingUser.id);
        return copy;
      });

      closeDeleteModal();

      if (controllerRef.current) controllerRef.current.abort();
      const ctrl = new AbortController();
      controllerRef.current = ctrl;
      fetchUsers(ctrl.signal);
    } catch (err) {
      const status = err?.response?.status;
      const apiMsg =
        err?.response?.data?.message ||
        (status === 422 ? "Incorrect password" : status === 403 ? "You don't have permission to manage users." : "Delete failed");
      toast.error(apiMsg);
    }
  };

  const refresh = () => {
    if (controllerRef.current) controllerRef.current.abort();
    const ctrl = new AbortController();
    controllerRef.current = ctrl;
    fetchUsers(ctrl.signal);
  };

  // Check if has actions
  const hasActions = can.update || can.delete;
  const columnCount = 6 + (hasActions ? 1 : 0);

  if (permsLoading) return <div className="p-6">Loading…</div>;
  if (!can.view) return <div className="p-6 text-sm text-gray-700">You don't have permission to view users.</div>;

  return (
    <div className="products-page people-page people-list-page">
      {/* ===== Overview ===== */}
      <div className="products-panel">
        <div className="products-heading">
          {/* Identity */}
          <div className="flex items-center gap-3 min-w-0">
            <div className="products-identity-icon">
              <UserCircleIcon className="w-6 h-6" />
            </div>
            <div className="min-w-0">
              <h1 className="products-title">Users</h1>
              <p className="products-subtitle">
                <ShieldCheckIcon className="w-3.5 h-3.5 shrink-0" />
                <span>{total} users in this view</span>
              </p>
            </div>
          </div>

          {/* Actions */}
          <div className="flex flex-wrap items-center gap-2">
            <button
              type="button"
              onClick={() => setAuditLogOpen(true)}
              title="System Document Audit Log"
              className="products-action theme-btn-secondary"
            >
              <ClockIcon className="w-3.5 h-3.5" />
              <span>Audit Log</span>
            </button>
            <button
              onClick={refresh}
              title="Refresh users"
              aria-label="Refresh users"
              className="products-action theme-btn-tertiary"
            >
              <ArrowPathIcon className={`w-3.5 h-3.5 ${loading ? "animate-spin" : ""}`} />
              <span>Refresh</span>
            </button>

            <Guard when={can.create}>
              <Link
                to="/users/create"
                title="Add User (Alt+N)"
                aria-keyshortcuts="Alt+N"
                className="products-action products-action-primary theme-btn-primary"
              >
                <PlusCircleIcon className="w-4 h-4" />
                <span>Add User</span>
              </Link>
            </Guard>
          </div>
        </div>

        {/* Search */}
        <div className="products-filter-panel">
          <div className="products-filters">
            <label className="products-filter">
              <span className="products-filter-label">Search users</span>
              <TextSearch
                value={qSearch}
                onChange={setQSearch}
                placeholder="Search by name or email…"
                className="w-full"
                iconClassName="products-search-icon"
                inputClassName="products-search-input"
              />
            </label>
          </div>
        </div>
      </div>

      {/* ===== User table ===== */}
      <div className="products-panel products-catalog">
        <div className="products-catalog-heading">
          <div className="flex items-center gap-3 min-w-0">
            <div className="people-section-icon">
              <UserCircleIcon />
            </div>
            <div className="min-w-0">
              <h2 className="products-section-title">User list</h2>
              <p className="products-subtitle">
                {loading ? (
                  <span className="inline-flex items-center gap-1.5">
                    <ArrowPathIcon className="h-3 w-3 animate-spin" />
                    Loading…
                  </span>
                ) : (
                  `Showing ${rows.length === 0 ? 0 : start}–${end} of ${total}`
                )}
                {selectedIds.size > 0 && (
                  <>
                    {" · "}
                    <span className="products-selection-count">{selectedIds.size} selected</span>
                  </>
                )}
              </p>
            </div>
          </div>

          {/* Page size */}
          <div className="flex items-center gap-2">
            <label htmlFor="users-page-size" className="products-filter-label">Show</label>
            <select
              id="users-page-size"
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

        {/* Bulk Actions Bar */}
        {selectedIds.size > 0 && (can.update || can.delete) && (
          <div className="mx-3 mb-3 px-4 py-2.5 rounded-xl bg-blue-50/90 dark:bg-slate-800/90 border border-blue-200 dark:border-slate-700 flex flex-wrap items-center justify-between gap-3 text-xs">
            <div className="flex items-center gap-2 font-semibold text-blue-900 dark:text-blue-200">
              <span>{selectedIds.size} user(s) selected</span>
              <button
                type="button"
                onClick={() => setSelectedIds(new Set())}
                className="underline text-gray-500 hover:text-gray-700 dark:text-slate-400 dark:hover:text-slate-200 font-normal"
              >
                Clear selection
              </button>
            </div>
            <div className="flex flex-wrap items-center gap-2">
              <Guard when={can.update}>
                <button
                  type="button"
                  disabled={bulkProcessing}
                  onClick={() => handleBulkAction("activate")}
                  className="px-2.5 py-1.5 rounded-lg bg-emerald-600 hover:bg-emerald-700 text-white font-semibold transition-colors disabled:opacity-50"
                >
                  Activate
                </button>
                <button
                  type="button"
                  disabled={bulkProcessing}
                  onClick={() => handleBulkAction("deactivate")}
                  className="px-2.5 py-1.5 rounded-lg bg-amber-600 hover:bg-amber-700 text-white font-semibold transition-colors disabled:opacity-50"
                >
                  Deactivate
                </button>
                <div className="flex items-center gap-1">
                  <select
                    value={bulkRole}
                    onChange={(e) => setBulkRole(e.target.value)}
                    className="h-7 px-2 rounded-lg border border-gray-300 dark:border-slate-600 bg-white dark:bg-slate-900 text-gray-800 dark:text-slate-100 text-xs"
                  >
                    <option value="">Assign Role…</option>
                    {availableRoles.map((r) => (
                      <option key={r.id || r.name} value={r.name}>
                        {r.name}
                      </option>
                    ))}
                  </select>
                  <button
                    type="button"
                    disabled={bulkProcessing || !bulkRole}
                    onClick={() => handleBulkAction("assign_role")}
                    className="px-2.5 py-1.5 rounded-lg bg-indigo-600 hover:bg-indigo-700 text-white font-semibold transition-colors disabled:opacity-50"
                  >
                    Apply Role
                  </button>
                </div>
              </Guard>
              <Guard when={can.delete}>
                <button
                  type="button"
                  disabled={bulkProcessing}
                  onClick={() => handleBulkAction("delete")}
                  className="px-2.5 py-1.5 rounded-lg bg-rose-600 hover:bg-rose-700 text-white font-semibold transition-colors disabled:opacity-50"
                >
                  Delete Selected
                </button>
              </Guard>
            </div>
          </div>
        )}

        <div className="products-table-scroll" tabIndex={0} role="region" aria-label="User list" aria-busy={loading}>
          <table className="products-table people-table">
            <thead>
              <tr className="text-left">
                <th scope="col" className="w-12 pb-2 pl-3">
                  <input
                    type="checkbox"
                    aria-label="Select all on this page"
                    checked={pageAllChecked}
                    ref={(el) => {
                      if (el) el.indeterminate = pageIndeterminate;
                    }}
                    onChange={(e) => togglePageAll(e.target.checked)}
                  />
                </th>
                <th scope="col" className="w-16 pb-2 pl-3">
                  <span className="products-column-label">ID</span>
                </th>
                <th scope="col" className="pb-2 pl-3">
                  <span className="products-column-label">User</span>
                </th>
                <th scope="col" className="pb-2 pl-3">
                  <span className="products-column-label">Email</span>
                </th>
                <th scope="col" className="pb-2 pl-3">
                  <span className="products-column-label">Roles</span>
                </th>
                <th scope="col" className="w-32 pb-2 pl-3">
                  <span className="products-column-label">Status</span>
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
                      <UserCircleIcon aria-hidden="true" />
                      <div>
                        <p className="people-cell-strong">No users found</p>
                        <p className="products-subtitle">Try a different search term.</p>
                      </div>
                    </div>
                  </td>
                </tr>
              )}

              {rows.map((u) => {
                const isSelected = selectedIds.has(u.id);
                const status = u.status ?? "active";
                const isActive = status === "active";

                return (
                  <tr key={u.id} className={`group align-middle ${isSelected ? "is-selected" : ""}`}>
                    <td className="rounded-l-2xl pl-3 products-cell">
                      <input
                        type="checkbox"
                        checked={isSelected}
                        onChange={(e) => toggleOne(u.id, e.target.checked)}
                        aria-label={`Select user ${u.name}`}
                      />
                    </td>
                    <td className="products-cell products-meta">
                      {u.id}
                    </td>
                    <td className="products-cell">
                      <span className="flex items-center gap-3 min-w-0">
                        <span className="people-section-icon">
                          <UserCircleIcon aria-hidden="true" />
                        </span>
                        <span className="people-cell-strong truncate">{u.name}</span>
                      </span>
                    </td>
                    <td className="products-cell products-meta">
                      <span className="flex items-center gap-2 min-w-0">
                        <EnvelopeIcon className="w-4 h-4 shrink-0" aria-hidden="true" />
                        <span className="truncate">{u.email}</span>
                      </span>
                    </td>
                    <td className="products-cell">
                      <div className="flex flex-wrap items-center gap-1">
                        {Array.isArray(u.roles) && u.roles.length > 0 ? (
                          u.roles.map((r) => (
                            <span
                              key={r.id || r.name}
                              className="inline-flex items-center px-2 py-0.5 rounded-md text-[11px] font-medium bg-indigo-50 text-indigo-700 dark:bg-indigo-900/40 dark:text-indigo-300 border border-indigo-200/70 dark:border-indigo-700/50"
                            >
                              {r.name}
                            </span>
                          ))
                        ) : (
                          <span className="text-xs text-gray-400">No role</span>
                        )}
                      </div>
                    </td>
                    <td className="products-cell">
                      <span className={`people-badge ${isActive ? "people-badge-active" : "people-badge-inactive"}`}>
                        <ShieldCheckIcon aria-hidden="true" />
                        <span className="capitalize">{status}</span>
                      </span>
                    </td>
                    {hasActions && (
                      <td className="rounded-r-2xl pr-3 products-cell">
                        <div className="flex items-center justify-end gap-1">
                          {/* Edit */}
                          <Guard when={can.update}>
                            <Link
                              to={`/users/${u.id}/edit`}
                              title="Edit"
                              aria-label={`Edit ${u.name}`}
                              className="products-row-action"
                            >
                              <PencilSquareIcon className="h-4 w-4" />
                            </Link>
                          </Guard>

                          {/* Delete */}
                          <Guard when={can.delete}>
                            <button
                              onClick={() => openDeleteModal(u)}
                              title="Delete"
                              aria-label={`Delete ${u.name}`}
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
        itemName={deletingUser?.name || "this user"}
        title="Delete user"
        isDeleting={deleting}
        setIsDeleting={setDeleting}
      />

      {/* Global System Audit Log Modal */}
      <DocumentHistoryModal
        isOpen={auditLogOpen}
        onClose={() => setAuditLogOpen(false)}
      />
    </div>
  );
}
