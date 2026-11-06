import React, { useState, useEffect, useRef } from "react";
import { CheckCircleIcon, ArrowPathIcon, PhotoIcon } from "@heroicons/react/24/solid";
import { GlassCard, GlassInput, GlassBtn } from "@/components/Glass.jsx";
import { ExpiryReturnPolicyFields } from "@/components/ExpiryReturnPolicyFields.jsx";
import { useTheme } from "@/context/ThemeContext";

export default function BrandForm({
  initialData = null,
  onSubmit,
  saving = false,
  submitLabel = "Save Brand",
}) {
  const { isDark, theme } = useTheme();
  const primaryColor = theme?.primary_color || "#3b82f6";

  const [form, setForm] = useState({
    name: initialData?.name || "",
    image: null,
    expiry_return_policy: initialData?.expiry_return_policy || "before_expiry",
    expiry_return_months: initialData?.expiry_return_months ?? 3,
    expiry_return_days: initialData?.expiry_return_days ?? 90,
    expiry_return_notes: initialData?.expiry_return_notes || "",
  });

  const [preview, setPreview] = useState(
    initialData?.image ? `/storage/${initialData.image}` : null
  );

  const nameRef = useRef(null);
  const policySelectRef = useRef(null);
  const notesInputRef = useRef(null);

  useEffect(() => {
    nameRef.current?.focus();
  }, []);

  useEffect(() => {
    if (initialData) {
      setForm({
        name: initialData.name || "",
        image: null,
        expiry_return_policy: initialData.expiry_return_policy || "before_expiry",
        expiry_return_months: initialData.expiry_return_months ?? 3,
        expiry_return_days: initialData.expiry_return_days ?? 90,
        expiry_return_notes: initialData.expiry_return_notes || "",
      });
      setPreview(initialData.image ? `/storage/${initialData.image}` : null);
    }
  }, [initialData]);

  useEffect(() => {
    return () => {
      if (preview && typeof preview === "string" && preview.startsWith("blob:")) {
        try {
          URL.revokeObjectURL(preview);
        } catch {}
      }
    };
  }, [preview]);

  // Ctrl+S shortcut
  useEffect(() => {
    const onKeyDown = (e) => {
      if ((e.ctrlKey || e.metaKey) && !e.altKey && !e.shiftKey && (e.key || "").toLowerCase() === "s") {
        e.preventDefault();
        handleSubmit(e);
      }
    };
    window.addEventListener("keydown", onKeyDown);
    return () => window.removeEventListener("keydown", onKeyDown);
  });

  const handleFileChange = (e) => {
    const file = e.target.files?.[0] ?? null;
    if (preview && preview.startsWith("blob:")) {
      try {
        URL.revokeObjectURL(preview);
      } catch {}
    }
    setForm((prev) => ({ ...prev, image: file }));
    setPreview(
      file
        ? URL.createObjectURL(file)
        : initialData?.image
        ? `/storage/${initialData.image}`
        : null
    );
  };

  const handleSubmit = (e) => {
    if (e?.preventDefault) e.preventDefault();
    if (saving) return;

    const fd = new FormData();
    fd.append("name", (form.name || "").trim());
    fd.append("expiry_return_policy", form.expiry_return_policy || "before_expiry");
    fd.append("expiry_return_months", String(form.expiry_return_months ?? 0));
    fd.append("expiry_return_days", String(form.expiry_return_days ?? 0));
    fd.append("expiry_return_notes", form.expiry_return_notes || "");
    if (form.image) {
      fd.append("image", form.image);
    }

    onSubmit?.(fd, form);
  };

  return (
    <GlassCard className="p-5">
      <form id="brand-form" onSubmit={handleSubmit} className="space-y-5">
        <div className="grid grid-cols-1 md:grid-cols-3 gap-4 items-start">
          <div className="md:col-span-2">
            <label className="block text-xs font-semibold text-slate-700 dark:text-slate-200 mb-1">
              Brand Name *
            </label>
            <GlassInput
              ref={nameRef}
              type="text"
              name="name"
              placeholder="e.g. GSK, Abbott, Getz Pharma, Nestle"
              value={form.name}
              onChange={(e) => setForm((prev) => ({ ...prev, name: e.target.value }))}
              onKeyDown={(e) => {
                if (e.key === "Enter") {
                  e.preventDefault();
                  policySelectRef.current?.focus();
                }
              }}
              className="w-full h-10"
              required
            />
          </div>

          <div>
            <label className="block text-xs font-semibold text-slate-700 dark:text-slate-200 mb-1">
              Brand Logo / Image (Optional)
            </label>
            <div className="flex items-center gap-3">
              <input
                type="file"
                name="image"
                accept="image/*"
                onChange={handleFileChange}
                className="h-10 flex-1 rounded-xl bg-white dark:bg-slate-800 border border-slate-300 dark:border-slate-600 text-xs file:mr-2 file:px-3 file:h-full file:rounded-l-xl file:border-0 file:bg-slate-100 dark:file:bg-slate-700 file:text-slate-700 dark:file:text-slate-200"
              />
              {preview ? (
                <img
                  src={preview}
                  alt="Preview"
                  className="w-10 h-10 rounded-xl object-contain ring-1 ring-slate-200 dark:ring-slate-700 bg-white shrink-0"
                />
              ) : (
                <div className="w-10 h-10 rounded-xl bg-slate-100 dark:bg-slate-800 flex items-center justify-center shrink-0 border border-slate-200 dark:border-slate-700">
                  <PhotoIcon className="w-5 h-5 text-slate-400" />
                </div>
              )}
            </div>
          </div>
        </div>

        {/* Expiry Return Policy (Product Intimation) */}
        <ExpiryReturnPolicyFields
          value={form}
          onChange={(updated) => setForm((prev) => ({ ...prev, ...updated }))}
          isDark={isDark}
          primaryColor={primaryColor}
          disabled={saving}
          policySelectRef={policySelectRef}
          notesInputRef={notesInputRef}
          onEnterLastField={handleSubmit}
        />

        <div className="flex items-center justify-end gap-3 pt-2 border-t border-slate-200/70 dark:border-slate-700/70">
          <span className="text-xs text-slate-400">Shortcut: Ctrl + S to Save</span>
          <GlassBtn
            type="submit"
            variant="primary"
            disabled={saving}
            className="h-10 px-5 theme-btn-primary"
          >
            {saving ? (
              <ArrowPathIcon className="w-4 h-4 animate-spin" />
            ) : (
              <CheckCircleIcon className="w-4 h-4" />
            )}
            <span>{saving ? "Saving..." : submitLabel}</span>
          </GlassBtn>
        </div>
      </form>
    </GlassCard>
  );
}

