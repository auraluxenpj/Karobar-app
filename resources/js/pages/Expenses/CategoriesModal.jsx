import { useState, useMemo } from "react";
import axios from "axios";
import toast from "react-hot-toast";
import { useTheme } from "@/context/ThemeContext";
import { getThemeButtonClasses } from "@/utils/buttonStyles";
import {
  XMarkIcon,
  PlusIcon,
  TagIcon,
  PencilSquareIcon,
  TrashIcon,
  CheckIcon,
} from "@heroicons/react/24/outline";

export default function CategoriesModal({ isOpen, onClose, categories, onRefresh }) {
  const { isDark, theme } = useTheme();

  // 🎨 Dynamic Button styles using theme colors (matching ThemeSetting.jsx)
  const themeColors = useMemo(() => ({
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
    success: theme?.success_color || "#10b981",
    successHover: "#059669",
  }), [theme]);

  const buttonStyle = theme?.button_style || "modern";
  const getButtonClasses = useMemo(
    () => getThemeButtonClasses(buttonStyle, themeColors, isDark),
    [buttonStyle, themeColors, isDark]
  );

  const btnPrimary = getButtonClasses.primary;
  const btnSecondary = getButtonClasses.secondary;
  const btnSuccess = getButtonClasses.success;

  const [form, setForm] = useState({ name: "", code: "", description: "" });
  const [editingId, setEditingId] = useState(null);
  const [editForm, setEditForm] = useState({ name: "", code: "", description: "", is_active: true });
  const [saving, setSaving] = useState(false);

  if (!isOpen) return null;

  async function handleCreate(e) {
    e.preventDefault();
    if (!form.name.trim()) return toast.error("Category name is required.");

    setSaving(true);
    try {
      await axios.post("/api/expense-categories", form);
      toast.success("Expense category created successfully.");
      setForm({ name: "", code: "", description: "" });
      onRefresh();
    } catch (err) {
      toast.error(err?.response?.data?.message || "Failed to create category.");
    } finally {
      setSaving(false);
    }
  }

  function startEdit(cat) {
    setEditingId(cat.id);
    setEditForm({
      name: cat.name,
      code: cat.code || "",
      description: cat.description || "",
      is_active: Boolean(cat.is_active),
    });
  }

  async function handleUpdate(e) {
    e.preventDefault();
    if (!editForm.name.trim()) return toast.error("Category name is required.");

    setSaving(true);
    try {
      await axios.put(`/api/expense-categories/${editingId}`, editForm);
      toast.success("Category updated successfully.");
      setEditingId(null);
      onRefresh();
    } catch (err) {
      toast.error(err?.response?.data?.message || "Failed to update category.");
    } finally {
      setSaving(false);
    }
  }

  async function handleDelete(cat) {
    if (!confirm(`Are you sure you want to delete category "${cat.name}"?`)) return;

    try {
      await axios.delete(`/api/expense-categories/${cat.id}`);
      toast.success("Category deleted.");
      onRefresh();
    } catch (err) {
      toast.error(err?.response?.data?.message || "Failed to delete category.");
    }
  }

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/50 backdrop-blur-sm animate-fadeIn">
      <div className="relative w-full max-w-2xl max-h-[90dvh] overflow-y-auto p-4 sm:p-6 rounded-2xl bg-white/95 dark:bg-slate-900/95 border border-white/20 dark:border-slate-800 shadow-2xl backdrop-blur-xl">
        {/* Header */}
        <div className="flex items-center justify-between pb-4 border-b border-gray-100 dark:border-slate-800/80">
          <div className="flex items-center gap-3">
            <div className="flex items-center justify-center w-10 h-10 rounded-xl bg-blue-500/10 text-blue-600 dark:text-blue-400">
              <TagIcon className="w-5 h-5" />
            </div>
            <div>
              <h2 className="text-lg font-bold text-gray-900 dark:text-white">Expense Categories</h2>
              <p className="text-xs text-gray-500 dark:text-slate-400">Manage categories to organize operational expenses</p>
            </div>
          </div>
          <button
            onClick={onClose}
            className="p-1.5 text-gray-400 hover:text-gray-600 dark:hover:text-slate-200 rounded-lg transition"
          >
            <XMarkIcon className="w-5 h-5" />
          </button>
        </div>

        {/* Body */}
        <div className="py-4 space-y-6">
          {/* Add Category Form */}
          <form onSubmit={handleCreate} className="p-4 rounded-xl bg-gray-50/70 dark:bg-slate-800/40 border border-gray-200/60 dark:border-slate-700/60 space-y-3">
            <div className="text-xs font-semibold uppercase tracking-wider text-gray-600 dark:text-slate-300">
              Create New Category
            </div>
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
              <div>
                <label className="block text-xs font-medium text-gray-700 dark:text-slate-300 mb-1">
                  Category Name *
                </label>
                <input
                  type="text"
                  required
                  placeholder="e.g. Courier & Logistics"
                  value={form.name}
                  onChange={(e) => setForm({ ...form, name: e.target.value })}
                  className="w-full px-3 py-1.5 text-sm rounded-lg border border-gray-200 dark:border-slate-700 bg-white dark:bg-slate-900 text-gray-900 dark:text-white focus:outline-none focus:ring-2 focus:ring-blue-500"
                />
              </div>
              <div>
                <label className="block text-xs font-medium text-gray-700 dark:text-slate-300 mb-1">
                  Code / Short Slug (optional)
                </label>
                <input
                  type="text"
                  placeholder="e.g. logistics"
                  value={form.code}
                  onChange={(e) => setForm({ ...form, code: e.target.value })}
                  className="w-full px-3 py-1.5 text-sm rounded-lg border border-gray-200 dark:border-slate-700 bg-white dark:bg-slate-900 text-gray-900 dark:text-white focus:outline-none focus:ring-2 focus:ring-blue-500"
                />
              </div>
            </div>
            <div>
              <label className="block text-xs font-medium text-gray-700 dark:text-slate-300 mb-1">
                Description (optional)
              </label>
              <input
                type="text"
                placeholder="Description of expenses that belong to this category"
                value={form.description}
                onChange={(e) => setForm({ ...form, description: e.target.value })}
                className="w-full px-3 py-1.5 text-sm rounded-lg border border-gray-200 dark:border-slate-700 bg-white dark:bg-slate-900 text-gray-900 dark:text-white focus:outline-none focus:ring-2 focus:ring-blue-500"
              />
            </div>
            <div className="flex justify-end">
              <button
                type="submit"
                disabled={saving}
                className={`flex items-center gap-1.5 px-4 py-1.5 text-xs font-semibold theme-btn-primary ${btnPrimary.className} disabled:opacity-50`}
                style={btnPrimary.style}
              >
                <PlusIcon className="w-4 h-4" />
                Add Category
              </button>
            </div>
          </form>

          {/* Existing Categories List */}
          <div>
            <div className="text-xs font-semibold uppercase tracking-wider text-gray-500 dark:text-slate-400 mb-3">
              Existing Categories ({categories.length})
            </div>
            <div className="divide-y divide-gray-100 dark:divide-slate-800 rounded-xl border border-gray-200/60 dark:border-slate-800/80 overflow-hidden bg-white/50 dark:bg-slate-900/40">
              {categories.map((cat) => (
                <div key={cat.id} className="p-3 flex items-center justify-between gap-3 hover:bg-gray-50/50 dark:hover:bg-slate-800/30 transition">
                  {editingId === cat.id ? (
                    <form onSubmit={handleUpdate} className="flex-1 flex flex-wrap items-center gap-2">
                      <input
                        type="text"
                        required
                        value={editForm.name}
                        onChange={(e) => setEditForm({ ...editForm, name: e.target.value })}
                        className="px-2.5 py-1 text-xs rounded border border-blue-400 bg-white dark:bg-slate-800 text-gray-900 dark:text-white flex-1 min-w-[140px]"
                      />
                      <input
                        type="text"
                        placeholder="Code"
                        value={editForm.code}
                        onChange={(e) => setEditForm({ ...editForm, code: e.target.value })}
                        className="px-2.5 py-1 text-xs rounded border border-gray-300 dark:border-slate-700 bg-white dark:bg-slate-800 text-gray-900 dark:text-white w-28"
                      />
                      <button
                        type="submit"
                        disabled={saving}
                        className={`p-1.5 text-xs theme-btn-success ${btnSuccess.className}`}
                        style={btnSuccess.style}
                      >
                        <CheckIcon className="w-4 h-4" />
                      </button>
                      <button
                        type="button"
                        onClick={() => setEditingId(null)}
                        className={`p-1.5 text-xs theme-btn-secondary ${btnSecondary.className}`}
                        style={btnSecondary.style}
                      >
                        <XMarkIcon className="w-4 h-4" />
                      </button>
                    </form>
                  ) : (
                    <>
                      <div className="flex-1 min-w-0">
                        <div className="flex flex-wrap items-center gap-2">
                          <span className="font-semibold text-sm text-gray-900 dark:text-white truncate">
                            {cat.name}
                          </span>
                          {cat.code && (
                            <span className="text-[10px] font-mono px-1.5 py-0.5 rounded bg-gray-100 dark:bg-slate-800 text-gray-600 dark:text-slate-300">
                              {cat.code}
                            </span>
                          )}
                          <span className="text-[11px] text-gray-400 dark:text-slate-500">
                            ({cat.expenses_count ?? 0} expenses)
                          </span>
                        </div>
                        {cat.description && (
                          <div className="text-xs text-gray-500 dark:text-slate-400 truncate mt-0.5">
                            {cat.description}
                          </div>
                        )}
                      </div>
                      <div className="flex items-center gap-1">
                        <button
                          onClick={() => startEdit(cat)}
                          className="p-1.5 text-gray-400 hover:text-blue-600 dark:hover:text-blue-400 rounded-lg hover:bg-blue-50 dark:hover:bg-blue-950/30 transition"
                          title="Edit"
                        >
                          <PencilSquareIcon className="w-4 h-4" />
                        </button>
                        <button
                          onClick={() => handleDelete(cat)}
                          className="p-1.5 text-gray-400 hover:text-rose-600 dark:hover:text-rose-400 rounded-lg hover:bg-rose-50 dark:hover:bg-rose-950/30 transition"
                          title="Delete"
                        >
                          <TrashIcon className="w-4 h-4" />
                        </button>
                      </div>
                    </>
                  )}
                </div>
              ))}
            </div>
          </div>
        </div>

        {/* Footer */}
        <div className="px-6 py-3 border-t border-gray-100 dark:border-slate-800 bg-gray-50/50 dark:bg-slate-900/50 flex justify-end">
          <button
            onClick={onClose}
            className={`px-4 py-1.5 text-xs font-medium theme-btn-secondary ${btnSecondary.className}`}
            style={btnSecondary.style}
          >
            Close
          </button>
        </div>
      </div>
    </div>
  );
}

