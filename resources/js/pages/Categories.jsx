// src/pages/Categories.jsx
import { useEffect, useMemo, useRef, useState, useCallback } from "react";
import axios from "axios";
import toast from "react-hot-toast";
import {
  MagnifyingGlassIcon,
  CheckCircleIcon,
  PencilSquareIcon,
  TrashIcon,
  ArrowUpTrayIcon,
  ArrowDownTrayIcon,
  XMarkIcon,
  ArrowPathIcon,
  PlusIcon,
  Squares2X2Icon,
} from "@heroicons/react/24/solid";
import CategoryImportModal from "../components/CategoryImportModel.jsx";
import { usePermissions, Guard } from "@/api/usePermissions.js";
import { useTheme } from "@/context/ThemeContext";
import {
  GlassCard,
  GlassInput,
  GlassBtn,
} from "@/components/Glass.jsx";
import { getThemeButtonClasses } from "@/utils/buttonStyles";

export default function Categories() {
  const [categories, setCategories] = useState([]);
  const [form, setForm] = useState({ name: "" });
  const [editingId, setEditingId] = useState(null);
  const [loading, setLoading] = useState(false);
  const [saving, setSaving] = useState(false);

  const [qName, setQName] = useState("");
  const [page, setPage] = useState(1);
  const [pageSize, setPageSize] = useState(10);

  const [importOpen, setImportOpen] = useState(false);
  const [exporting, setExporting] = useState(false);

  const nameRef = useRef(null);
  const saveBtnRef = useRef(null);

  // 🎨 Get theme colors
  const { isDark, theme } = useTheme();

  // Memoize theme colors for performance
  const themeColors = useMemo(() => {
    if (!theme) {
      return {
        primary: '#3b82f6',
        primaryHover: '#2563eb',
        primaryLight: '#dbeafe',
        secondary: '#8b5cf6',
        secondaryHover: '#7c3aed',
        secondaryLight: '#ede9fe',
      };
    }
    return {
      primary: theme.primary_color || '#3b82f6',
      primaryHover: theme.primary_hover || '#2563eb',
      primaryLight: theme.primary_light || '#dbeafe',
      secondary: theme.secondary_color || '#8b5cf6',
      secondaryHover: theme.secondary_hover || '#7c3aed',
      secondaryLight: theme.secondary_light || '#ede9fe',
    };
  }, [theme]);

  // 🔒 permissions
  const { loading: permsLoading, canFor } = usePermissions();
  const can = useMemo(
    () =>
      (typeof canFor === "function" ? canFor("category") : null) ?? {
        view: false,
        create: false,
        update: false,
        delete: false,
        import: false,
        export: false,
      },
    [canFor]
  );

  useEffect(() => {
    document.title = "Categories - Pharmacy ERP";
  }, []);

  const fetchCategories = useCallback(async () => {
    try {
      setLoading(true);
      const res = await axios.get("/api/categories");
      setCategories(res.data || []);
    } catch (err) {
      const status = err?.response?.status;
      if (status === 403) toast.error("You don't have permission to view categories.");
      else toast.error("Failed to load categories");
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    if (permsLoading || !can.view) return;
    fetchCategories();
  }, [permsLoading, can.view, fetchCategories]);

  useEffect(() => { nameRef.current?.focus(); }, [editingId]);

  // 🔒 Alt+S save
  useEffect(() => {
    const onKeyDown = (e) => {
      if (e.altKey && (e.key || "").toLowerCase() === "s") {
        if (!can.create && !can.update) return;
        e.preventDefault();
        handleSave();
      }
    };
    window.addEventListener("keydown", onKeyDown);
    return () => window.removeEventListener("keydown", onKeyDown);
  }, [form, editingId, can.create, can.update]);

  const onEnterFocusNext = (e) => {
    if (e.key === "Enter") { e.preventDefault(); saveBtnRef.current?.focus(); }
  };

  const resetForm = () => {
    setForm({ name: "" });
    setEditingId(null);
    setTimeout(() => nameRef.current?.focus(), 0);
  };

  const handleSave = async () => {
    if (editingId ? !can.update : !can.create) {
      toast.error("You don't have permission to save categories.");
      return;
    }
    if (saving) return;
    const name = (form.name || "").trim();
    if (!name) { toast.error("Name is required"); nameRef.current?.focus(); return; }

    try {
      setSaving(true);
      if (editingId) {
        await axios.put(`/api/categories/${editingId}`, { name });
        toast.success("Category updated");
      } else {
        await axios.post("/api/categories", { name });
        toast.success("Category saved");
      }
      resetForm();
      fetchCategories();
    } catch (err) {
      const status = err?.response?.status;
      if (status === 403) toast.error("You don't have permission to save categories.");
      else {
        const msg = err?.response?.data?.message || err?.response?.data?.errors?.name?.[0] || "Save failed";
        toast.error(msg);
      }
    } finally { setSaving(false); }
  };

  const handleEdit = (c) => {
    if (!can.update) return toast.error("You don't have permission to edit categories.");
    setForm({ name: c.name || "" });
    setEditingId(c.id);
    window.scrollTo({ top: 0, behavior: "smooth" });
  };

  const handleDelete = async (c) => {
    if (!can.delete) return toast.error("You don't have permission to delete categories.");
    try {
      const used = Number(c.products_count || 0) > 0;
      if (used) return toast.error("Cannot delete: category is used by products.");
      await axios.delete(`/api/categories/${c.id}`);
      setCategories((prev) => prev.filter((x) => x.id !== c.id));
      if (editingId === c.id) resetForm();
      toast.success("Category deleted");
    } catch (err) {
      const status = err?.response?.status;
      if (status === 403) toast.error("You don't have permission to delete categories.");
      else toast.error(err?.response?.data?.message || "Could not delete category.");
    }
  };

  const handleExport = async () => {
    if (!can.export) return toast.error("You don't have permission to export categories.");
    try {
      setExporting(true);
      const res = await axios.get("/api/categories/export", { responseType: "blob" });
      const stamp = new Date().toISOString().slice(0,19).replace(/[:T]/g,"-");
      const filename = `categories_${stamp}.csv`;
      const blob = new Blob([res.data], { type: "text/csv;charset=utf-8" });
      const url = window.URL.createObjectURL(blob);
      const a = document.createElement("a");
      a.href = url; a.download = filename; document.body.appendChild(a); a.click(); a.remove();
      window.URL.revokeObjectURL(url);
    } catch (e) {
      const status = e?.response?.status;
      if (status === 403) toast.error("You don't have permission to export categories.");
      else toast.error("Export failed");
    } finally { setExporting(false); }
  };

  // search + pagination
  const norm = (v) => (v ?? "").toString().toLowerCase().trim();
  const filtered = useMemo(() => {
    const needle = norm(qName);
    if (!needle) return categories;
    return categories.filter((c) => norm(c.name).includes(needle));
  }, [categories, qName]);

  useEffect(() => { setPage(1); }, [qName, pageSize]);

  const pageCount = Math.max(1, Math.ceil(filtered.length / pageSize));
  useEffect(() => { if (page > pageCount) setPage(pageCount); }, [page, pageCount]);

  const start = (page - 1) * pageSize;
  const paged = filtered.slice(start, start + pageSize);

  // 🎨 Dynamic Button styles using theme colors
  const buttonStyle = theme?.button_style || 'modern';
  
  const getButtonClasses = useMemo(
    () => getThemeButtonClasses(buttonStyle, themeColors, isDark),
    [buttonStyle, themeColors, isDark]
  );

  const btnPrimary = getButtonClasses.primary;
  const btnSecondary = getButtonClasses.secondary;
  const btnDanger = getButtonClasses.danger;
  const btnGlass = getButtonClasses.glass;

  // ===== Section config =====
  const SECTION_CONFIG = {
    core: {
      gradient: `linear-gradient(to bottom right, ${themeColors.primary}, ${themeColors.primaryHover})`,
      bgLight: themeColors.primaryLight,
      bgDark: themeColors.primaryLight,
      iconColor: themeColors.primary,
    },
    management: {
      gradient: themeColors.secondary,
      bgLight: themeColors.secondaryLight,
      bgDark: themeColors.secondaryLight,
      iconColor: themeColors.secondary,
    },
  };

  if (permsLoading) return <div className="p-6">Loading…</div>;
  if (!can.view) return <div className="p-6 text-sm text-gray-700">You don't have permission to view categories.</div>;

  const hasActions = can.update || can.delete;
  const colSpan = 1 + (hasActions ? 1 : 0);

return (
    <div className="directory-page">
      <div className="products-panel directory-overview">
        {/* Top row */}
        <div className="products-heading">
          <div className="flex items-center gap-4">
            <div className="products-identity-icon">
              <Squares2X2Icon className="w-6 h-6" />
            </div>
            <div>
              <h1 className="products-title">Categories</h1>
              <p className="products-subtitle">
                <Squares2X2Icon className="w-3.5 h-3.5" />
                {categories.length} categories
              </p>
            </div>
          </div>

          {/* Actions */}
          <div className="flex items-center gap-2.5 flex-wrap">
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
                <ArrowDownTrayIcon className={`w-3.5 h-3.5 ${exporting ? "animate-spin" : ""}`} />
                <span>{exporting ? "..." : "Export"}</span>
              </button>
            </Guard>
            <button
              onClick={fetchCategories}
              title="Refresh"
              className="products-action theme-btn-tertiary"
            >
              <ArrowPathIcon className="w-3.5 h-3.5" />
              <span>Refresh</span>
            </button>
          </div>
        </div>

        {/* Filter bar integrated in hero */}
        <div className="directory-search">
          <div className="directory-search-field">
            <MagnifyingGlassIcon className="directory-search-icon" />
            <GlassInput
              value={qName}
              onChange={(e) => setQName(e.target.value)}
              aria-label="Search categories"
              placeholder="Search categories..."
              className="w-full"
            />
          </div>
        </div>
      </div>

      <div className="directory-grid">
        {/* Left: Form Card */}
        {(can.create || (can.update && editingId !== null)) && (
          <GlassCard className="directory-panel directory-form">
            {/* Form Header */}
            <div className="directory-panel-heading">
              <div className="flex items-center gap-3">
                <div 
                  className="directory-form-icon"
                >
                  {editingId ? (
                    <PencilSquareIcon className="w-5 h-5" />
                  ) : (
                    <PlusIcon className="w-5 h-5" />
                  )}
                </div>
                <div>
                  <h2 className="text-base font-semibold text-gray-900 dark:text-white">
                    {editingId ? "Edit Category" : "Add Category"}
                  </h2>
                  <p className="text-xs text-gray-500 dark:text-gray-400">
                    {editingId ? "Update category information" : "Enter category details"}
                  </p>
                </div>
              </div>
              {editingId && (
                <GlassBtn
                  className="h-8 px-3"
                  onClick={resetForm}
                  aria-label="Cancel editing"
                >
                  <XMarkIcon className="w-4 h-4" />
                </GlassBtn>
              )}
            </div>

            <form onSubmit={(e) => e.preventDefault()} className="p-3 space-y-3">
              <div>
                <label className="block text-xs font-medium mb-1">Name</label>
                <GlassInput
                  type="text"
                  placeholder="Category name"
                  className="w-full h-9"
                  value={form.name}
                  onChange={(e) => setForm({ name: e.target.value })}
                  onKeyDown={onEnterFocusNext}
                  ref={nameRef}
                  disabled={!can.create && !editingId}
                />
              </div>

              <div className="flex items-center gap-2">
                <GlassBtn
                  type="button"
                  onClick={resetForm}
                  className="h-9 px-3 theme-btn-tertiary"
                  disabled={saving}
                >
                  <span>Clear</span>
                </GlassBtn>
                <GlassBtn
                  type="button"
                  variant="primary"
                  onClick={handleSave}
                  ref={saveBtnRef}
                  className="glass-save-btn flex-1 h-9 theme-btn-primary"
                  disabled={saving || (!can.create && !can.update)}
                  aria-busy={saving}
                  aria-keyshortcuts="Alt+S"
                >
                  {saving ? (
                    <ArrowPathIcon aria-hidden="true" className="w-4 h-4 animate-spin motion-reduce:animate-none" />
                  ) : (
                    <CheckCircleIcon aria-hidden="true" className="w-4 h-4" />
                  )}
                  <span>
                    {editingId ? (saving ? "Updating..." : "Update") : (saving ? "Saving..." : "Save")}
                  </span>
                </GlassBtn>
              </div>

              <div className="text-[10px] text-gray-500 text-center">Alt+S to save</div>
            </form>
          </GlassCard>
        )}

        {/* Right: List Card */}
        <GlassCard className="directory-panel directory-list">
          {/* List Header */}
          <div className="directory-panel-heading">
            <div className="flex items-center gap-2">
              <div 
                className="p-1.5 rounded-sm"
                style={{ backgroundColor: SECTION_CONFIG.management.bgDark }}
              >
                <Squares2X2Icon 
                  className="w-4 h-4" 
                  style={{ color: SECTION_CONFIG.management.iconColor }} 
                />
              </div>
              <span className="font-medium text-sm">Category List</span>
            </div>
            <span className="text-xs text-gray-400">{paged.length} items</span>
          </div>

          <div className="p-3">
            <div className="directory-table-scroll">
              <table className="w-full text-sm">
                <thead className="bg-white/80 dark:bg-slate-700/80 sticky top-0">
                  <tr className="border-b border-gray-200/70 dark:border-slate-600/70 text-left">
                    <th className="px-3 py-2 font-medium text-gray-600 dark:text-gray-300 text-xs uppercase">Name</th>
                    {hasActions && (
                      <th className="px-3 py-2 font-medium text-gray-600 dark:text-gray-300 text-xs uppercase text-center w-32"> Actions</th>
                    )}
                  </tr>
                </thead>
                <tbody>
                  {paged.length === 0 && !loading && (
                    <tr>
                      <td className="px-3 py-10 text-center text-gray-500 dark:text-gray-400" colSpan={colSpan}>
                        <div className="flex flex-col items-center gap-2">
                          <Squares2X2Icon className="w-8 h-8 text-gray-400" />
                          <p className="text-sm">No categories found</p>
                        </div>
                      </td>
                    </tr>
                  )}

                  {paged.map((c) => {
                    const used = Number(c.products_count || 0) > 0;
                    return (
                      <tr key={c.id} className="odd:bg-white/90 even:bg-white/70 dark:odd:bg-slate-700/60 dark:even:bg-slate-800/60 hover:bg-blue-50/70 dark:hover:bg-slate-600/50 transition-colors">
                        <td className="px-3 py-2.5">
                          <span className="font-medium text-gray-900 dark:text-gray-100">{c.name}</span>
                        </td>
                        {hasActions && (
                          <td className="px-3 py-2.5">
                            <div className="flex items-center justify-center gap-1.5">
                              <Guard when={can.update}>
                                <button
                                  onClick={() => handleEdit(c)}
                                  className="products-row-action"
                                  aria-label={`Edit ${c.name}`}
                                  title="Edit"
                                >
                                  <PencilSquareIcon aria-hidden="true" className="w-4 h-4" />
                                </button>
                              </Guard>
                              <Guard when={can.delete}>
                                <button
                                  onClick={() => used ? toast.error("Cannot delete: category is used by products.") : handleDelete(c)}
                                  disabled={used}
                                  className="products-row-action products-row-delete"
                                  aria-label={`Delete ${c.name}`}
                                  title={used ? "Cannot delete: category is used by products." : "Delete"}
                                >
                                  <TrashIcon aria-hidden="true" className="w-4 h-4" />
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
            <div className="mt-3 flex items-center justify-between text-xs">
              <span className="text-gray-500 dark:text-gray-400">
                Page {page} of {pageCount}
              </span>
              <div className="flex items-center gap-1">
                <button
                  onClick={() => setPage(1)}
                  disabled={page === 1}
                  className={`p-1.5 rounded-sm hover:bg-gray-200 dark:hover:bg-slate-700 ${page === 1 ? 'opacity-40' : ''}`}
                >
                  ⏮
                </button>
                <button
                  onClick={() => setPage((p) => Math.max(1, p - 1))}
                  disabled={page === 1}
                  className={`p-1.5 rounded-sm hover:bg-gray-200 dark:hover:bg-slate-700 ${page === 1 ? 'opacity-40' : ''}`}
                >
                  ◀
                </button>
                <span className="mx-1 px-2 py-0.5 rounded-sm bg-gray-100 dark:bg-slate-700 font-medium">
                  {page}
                </span>
                <button
                  onClick={() => setPage((p) => Math.min(pageCount, p + 1))}
                  disabled={page === pageCount}
                  className={`p-1.5 rounded-sm hover:bg-gray-200 dark:hover:bg-slate-700 ${page === pageCount ? 'opacity-40' : ''}`}
                >
                  ▶
                </button>
                <button
                  onClick={() => setPage(pageCount)}
                  disabled={page === pageCount}
                  className={`p-1.5 rounded-sm hover:bg-gray-200 dark:hover:bg-slate-700 ${page === pageCount ? 'opacity-40' : ''}`}
                >
                  ⏭
                </button>
              </div>
            </div>
          </div>
        </GlassCard>
      </div>

      {/* Import modal */}
      <CategoryImportModal
        open={importOpen}
        onClose={() => setImportOpen(false)}
        onImported={fetchCategories}
      />
    </div>
  );
}

