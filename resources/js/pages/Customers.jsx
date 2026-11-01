// src/pages/Customers.jsx
import { useEffect, useMemo, useRef, useState, useCallback } from "react";
import axios from "axios";
import toast from "react-hot-toast";
import Select from "react-select";
import {
  MagnifyingGlassIcon,
  CheckCircleIcon,
  PencilSquareIcon,
  TrashIcon,
  ArrowUpTrayIcon,
  ArrowDownTrayIcon,
  ArrowPathIcon,
  PlusIcon,
  UsersIcon,
  XMarkIcon,
  TagIcon,
} from "@heroicons/react/24/solid";
import CustomerImportModal from "../components/CustomerImportModal.jsx";
import ProductSearchInput from "../components/ProductSearchInput.jsx";
import { usePermissions, Guard } from "@/api/usePermissions.js";
import { useTheme } from "@/context/ThemeContext";

import {
  GlassCard,
  GlassInput,
  GlassBtn,
} from "@/components/Glass.jsx";
import { getThemeButtonClasses } from "@/utils/buttonStyles";

export default function Customers() {
  const [customers, setCustomers] = useState([]);
  const [form, setForm] = useState({
    name: "",
    email: "",
    phone: "",
    address: "",
    tax_number: "",
    tax_status: "unregistered",
    credit_limit: "",
    credit_days: 30,
    credit_status: "active",
    opening_balance: "",
  });
  const [editingId, setEditingId] = useState(null);

  const [loading, setLoading] = useState(false);
  const [saving, setSaving] = useState(false);
  const [importOpen, setImportOpen] = useState(false);
  const [exporting, setExporting] = useState(false);

  // Custom Wholesale Price List Modal state
  const [priceListCustomer, setPriceListCustomer] = useState(null);
  const [customPrices, setCustomPrices] = useState([]);
  const [loadingPrices, setLoadingPrices] = useState(false);
  const [selectedPriceProduct, setSelectedPriceProduct] = useState(null);
  const [customPackPriceInput, setCustomPackPriceInput] = useState("");
  const [savingCustomPrice, setSavingCustomPrice] = useState(false);
  const [productsCatalog, setProductsCatalog] = useState([]);

  // search + pagination
  const [q, setQ] = useState("");
  const [page, setPage] = useState(1);
  const [pageSize, setPageSize] = useState(10);

  // focus refs
  const nameRef = useRef(null);
  const emailRef = useRef(null);
  const phoneRef = useRef(null);
  const addressRef = useRef(null);
  const saveBtnRef = useRef(null);

  // 🔒 permissions
  const { loading: permsLoading, canFor } = usePermissions();
  const can = useMemo(
    () =>
      (typeof canFor === "function" ? canFor("customer") : null) ?? {
        view: false,
        create: false,
        update: false,
        delete: false,
        import: false,
        export: false,
      },
    [canFor]
  );

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

  useEffect(() => {
    document.title = "Customers - Pharmacy ERP";
  }, []);

  const fetchCustomers = useCallback(async () => {
    try {
      setLoading(true);
      const res = await axios.get("/api/customers");
      setCustomers(res.data || []);
    } catch (err) {
      if (err?.response?.status === 403)
        toast.error("You don't have permission to view customers.");
      else toast.error("Failed to load customers");
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    if (!permsLoading && can.view) fetchCustomers();
  }, [permsLoading, can.view, fetchCustomers]);

  useEffect(() => {
    nameRef.current?.focus();
  }, [editingId]);

  // Alt+S -> Save
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

  const onEnterFocusNext = (e, nextRef) => {
    if (e.key === "Enter") {
      e.preventDefault();
      nextRef?.current?.focus();
    }
  };

  const resetForm = () => {
    setForm({
      name: "",
      email: "",
      phone: "",
      address: "",
      tax_number: "",
      tax_status: "unregistered",
      credit_limit: "",
      credit_days: 30,
      credit_status: "active",
      opening_balance: "",
    });
    setEditingId(null);
    setTimeout(() => nameRef.current?.focus(), 0);
  };

  const handleSave = async () => {
    if (editingId ? !can.update : !can.create) {
      toast.error("You don't have permission to save customers.");
      return;
    }
    if (saving) return;

    const name = (form.name || "").trim();
    if (!name) {
      toast.error("Name is required");
      nameRef.current?.focus();
      return;
    }

    try {
      setSaving(true);
      if (editingId) {
        await axios.put(`/api/customers/${editingId}`, form);
        toast.success("Customer updated");
      } else {
        await axios.post("/api/customers", form);
        toast.success("Customer saved");
      }
      resetForm();
      fetchCustomers();
    } catch (err) {
      if (err?.response?.status === 403) {
        toast.error("You don't have permission to save customers.");
      } else {
        const msg =
          err?.response?.data?.message ||
          err?.response?.data?.errors?.name?.[0] ||
          err?.response?.data?.errors?.email?.[0] ||
          "Save failed";
        toast.error(msg);
      }
    } finally {
      setSaving(false);
    }
  };

  const handleEdit = (c) => {
    if (!can.update) return toast.error("You don't have permission to edit customers.");
    setForm({
      name: c.name || "",
      email: c.email || "",
      phone: c.phone || "",
      address: c.address || "",
      tax_number: c.tax_number || "",
      tax_status: c.tax_status || "unregistered",
      credit_limit: c.credit_limit !== null && c.credit_limit !== undefined ? c.credit_limit : "",
      credit_days: c.credit_days !== null && c.credit_days !== undefined ? c.credit_days : 30,
      credit_status: c.credit_status || "active",
    });
    setEditingId(c.id);
    window.scrollTo({ top: 0, behavior: "smooth" });
  };

  const handleDelete = async (c) => {
    if (!can.delete) return toast.error("You don't have permission to delete customers.");
    try {
      await axios.delete(`/api/customers/${c.id}`);
      setCustomers((prev) => prev.filter((x) => Number(x.id) !== Number(c.id)));
      if (Number(editingId) === Number(c.id)) resetForm();
      toast.success("Customer deleted");
    } catch (err) {
      if (err?.response?.status === 403)
        toast.error("You don't have permission to delete customers.");
      else toast.error(err?.response?.data?.message || "Delete failed");
    }
  };

  // ===== Custom Wholesale Price List handlers =====
  const openPriceListModal = async (customer) => {
    setPriceListCustomer(customer);
    setSelectedPriceProduct(null);
    setCustomPackPriceInput("");
    setLoadingPrices(true);
    try {
      const [pricesRes, prodRes] = await Promise.all([
        axios.get(`/api/customers/${customer.id}/whole-sale-prices`),
        productsCatalog.length === 0
          ? axios.get("/api/products/search", { params: { q: "", limit: 50 } })
          : Promise.resolve({ data: productsCatalog }),
      ]);
      setCustomPrices(Array.isArray(pricesRes.data) ? pricesRes.data : []);
      if (productsCatalog.length === 0 && Array.isArray(prodRes.data)) {
        setProductsCatalog(prodRes.data);
      }
    } catch (err) {
      toast.error(err?.response?.data?.message || "Failed to load custom wholesale prices");
    } finally {
      setLoadingPrices(false);
    }
  };

  const handleSaveCustomPrice = async (e) => {
    e.preventDefault();
    if (!priceListCustomer) return;
    if (!selectedPriceProduct?.id) {
      toast.error("Please select a product");
      return;
    }
    const packPrice = parseFloat(customPackPriceInput);
    if (isNaN(packPrice) || packPrice < 0) {
      toast.error("Please enter a valid pack price");
      return;
    }
    setSavingCustomPrice(true);
    try {
      const { data } = await axios.post(`/api/customers/${priceListCustomer.id}/whole-sale-prices`, {
        product_id: selectedPriceProduct.id,
        pack_price: packPrice,
      });
      setCustomPrices((prev) => {
        const exists = prev.some((p) => Number(p.product_id) === Number(data.product_id));
        if (exists) {
          return prev.map((p) => (Number(p.product_id) === Number(data.product_id) ? data : p));
        }
        return [data, ...prev];
      });
      setSelectedPriceProduct(null);
      setCustomPackPriceInput("");
      toast.success("Custom wholesale pack price saved");
    } catch (err) {
      toast.error(err?.response?.data?.message || "Failed to save custom wholesale price");
    } finally {
      setSavingCustomPrice(false);
    }
  };

  const handleDeleteCustomPrice = async (priceRow) => {
    if (!priceListCustomer) return;
    try {
      await axios.delete(`/api/customers/${priceListCustomer.id}/whole-sale-prices/${priceRow.id}`);
      setCustomPrices((prev) => prev.filter((p) => p.id !== priceRow.id));
      toast.success("Custom wholesale price removed");
    } catch (err) {
      toast.error(err?.response?.data?.message || "Failed to remove custom wholesale price");
    }
  };

  const handleExport = async () => {
    if (!can.export) return toast.error("You don't have permission to export customers.");
    try {
      setExporting(true);
      const res = await axios.get("/api/customers/export", { responseType: "blob" });
      const stamp = new Date().toISOString().slice(0, 19).replace(/[:T]/g, "-");
      const filename = `customers_${stamp}.csv`;
      const blob = new Blob([res.data], { type: "text/csv;charset=utf-8" });
      const url = window.URL.createObjectURL(blob);
      const a = document.createElement("a");
      a.href = url;
      a.download = filename;
      document.body.appendChild(a);
      a.click();
      a.remove();
      window.URL.revokeObjectURL(url);
    } catch (e) {
      if (e?.response?.status === 403)
        toast.error("You don't have permission to export customers.");
      else toast.error("Export failed");
    } finally {
      setExporting(false);
    }
  };

  // search + pagination
  const norm = (v) => (v ?? "").toString().toLowerCase().trim();
  const filtered = useMemo(() => {
    const needle = norm(q);
    if (!needle) return customers;
    return customers.filter((c) =>
      [c.name, c.email, c.phone, c.address].some((f) => norm(f).includes(needle))
    );
  }, [customers, q]);

  useEffect(() => {
    setPage(1);
  }, [q, pageSize]);

  const pageCount = Math.max(1, Math.ceil(filtered.length / pageSize));
  useEffect(() => {
    if (page > pageCount) setPage(pageCount);
  }, [page, pageCount]);

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

  if (permsLoading) return <div className="p-6">Loading…</div>;
  if (!can.view) return <div className="p-6 text-sm text-gray-700">You don't have permission to view customers.</div>;

  const hasActions = can.view || can.update || can.delete;

  // ===== Section config =====
  const SECTION_CONFIG = {
    management: {
      gradient: themeColors.secondary,
      bgLight: themeColors.secondaryLight,
      bgDark: themeColors.secondaryLight,
      iconColor: themeColors.secondary,
    },
  };

return (
    <div className="directory-page">
      <div className="products-panel directory-overview">
        {/* Top row */}
        <div className="products-heading">
          <div className="flex items-center gap-4">
            <div className="products-identity-icon">
              <UsersIcon className="w-6 h-6" />
            </div>
            <div>
              <h1 className="products-title">Customers</h1>
              <p className="products-subtitle">
                <UsersIcon className="w-3.5 h-3.5" />
                {customers.length} customers
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
              onClick={fetchCustomers}
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
              value={q}
              onChange={(e) => setQ(e.target.value)}
              aria-label="Search customers"
              placeholder="Search customers..."
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
                    {editingId ? "Edit Customer" : "Add Customer"}
                  </h2>
                  <p className="text-xs text-gray-500 dark:text-gray-400">
                    {editingId ? "Update customer information" : "Enter customer details"}
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
                <label className="block text-xs font-medium mb-1">Name *</label>
                <GlassInput
                  type="text"
                  placeholder="Customer name"
                  value={form.name}
                  onChange={(e) => setForm({ ...form, name: e.target.value })}
                  onKeyDown={(e) => onEnterFocusNext(e, emailRef)}
                  ref={nameRef}
                  disabled={!can.create && !editingId}
                  className="w-full h-9"
                />
              </div>

              <div>
                <label className="block text-xs font-medium mb-1">Email</label>
                <GlassInput
                  type="email"
                  placeholder="Email address"
                  value={form.email || ""}
                  onChange={(e) => setForm({ ...form, email: e.target.value })}
                  onKeyDown={(e) => onEnterFocusNext(e, phoneRef)}
                  ref={emailRef}
                  className="w-full h-9"
                />
              </div>

              <div>
                <label className="block text-xs font-medium mb-1">Phone</label>
                <GlassInput
                  type="text"
                  placeholder="Phone number"
                  value={form.phone || ""}
                  onChange={(e) => setForm({ ...form, phone: e.target.value })}
                  onKeyDown={(e) => onEnterFocusNext(e, addressRef)}
                  ref={phoneRef}
                  className="w-full h-9"
                />
              </div>

              <div>
                <label className="block text-xs font-medium mb-1">Address</label>
                <GlassInput
                  type="text"
                  placeholder="Address"
                  value={form.address || ""}
                  onChange={(e) => setForm({ ...form, address: e.target.value })}
                  onKeyDown={(e) => onEnterFocusNext(e, saveBtnRef)}
                  ref={addressRef}
                  className="w-full h-9"
                />
              </div>

              <div className="grid grid-cols-1 sm:grid-cols-2 gap-2.5">
                <div>
                  <label className="block text-xs font-medium mb-1">Credit Limit (Rs.)</label>
                  <GlassInput
                    type="number"
                    min="0"
                    step="any"
                    placeholder="e.g. 50000 (0 or empty = unlimited)"
                    value={form.credit_limit}
                    onChange={(e) => setForm({ ...form, credit_limit: e.target.value })}
                    className="w-full h-9"
                  />
                </div>
                <div>
                  <label className="block text-xs font-medium mb-1">Credit Days</label>
                  <GlassInput
                    type="number"
                    min="0"
                    max="365"
                    placeholder="e.g. 30"
                    value={form.credit_days}
                    onChange={(e) => setForm({ ...form, credit_days: e.target.value })}
                    className="w-full h-9"
                  />
                </div>
              </div>

              <div className="grid grid-cols-1 sm:grid-cols-2 gap-2.5">
                <div>
                  <label className="block text-xs font-medium mb-1">Tax Status</label>
                  <Select
                    value={
                      [
                        { value: "unregistered", label: "Unregistered" },
                        { value: "registered", label: "Tax Registered" },
                        { value: "exempt", label: "Tax Exempt" },
                      ].find((o) => o.value === (form.tax_status || "unregistered"))
                    }
                    onChange={(opt) => setForm({ ...form, tax_status: opt?.value || "unregistered" })}
                    options={[
                      { value: "unregistered", label: "Unregistered" },
                      { value: "registered", label: "Tax Registered" },
                      { value: "exempt", label: "Tax Exempt" },
                    ]}
                    isSearchable={false}
                    menuPortalTarget={typeof document !== "undefined" ? document.body : null}
                    menuPosition="fixed"
                    styles={{
                      control: (base) => ({
                        ...base,
                        minHeight: "36px",
                        height: "36px",
                        fontSize: "12px",
                        borderRadius: "6px",
                        backgroundColor: isDark ? "rgba(51,65,85,0.7)" : "rgba(255,255,255,0.7)",
                        borderColor: isDark ? "#475569" : "#d1d5db",
                      }),
                      singleValue: (base) => ({
                        ...base,
                        color: isDark ? "#e2e8f0" : "#1f2937",
                      }),
                      menuPortal: (base) => ({ ...base, zIndex: 9999 }),
                      menu: (base) => ({
                        ...base,
                        fontSize: "12px",
                        backgroundColor: isDark ? "#1e293b" : "#ffffff",
                      }),
                      option: (base, state) => ({
                        ...base,
                        backgroundColor: state.isSelected
                          ? "#2563eb"
                          : state.isFocused
                          ? isDark
                            ? "#334155"
                            : "#eff6ff"
                          : "transparent",
                        color: state.isSelected ? "#fff" : isDark ? "#e2e8f0" : "#1e293b",
                      }),
                    }}
                  />
                </div>
                <div>
                  <label className="block text-xs font-medium mb-1">NTN / STRN / Tax ID</label>
                  <GlassInput
                    type="text"
                    placeholder="Optional Tax Number"
                    value={form.tax_number || ""}
                    onChange={(e) => setForm({ ...form, tax_number: e.target.value })}
                    className="w-full h-9"
                  />
                </div>
              </div>

              <div>
                <label className="block text-xs font-medium mb-1">Credit Status</label>
                <Select
                  value={
                    [
                      { value: "active", label: "Active (Credit permitted)" },
                      { value: "on_hold", label: "On Hold (Requires override)" },
                      { value: "blocked", label: "Blocked (Credit blocked)" },
                    ].find((o) => o.value === (form.credit_status || "active"))
                  }
                  onChange={(opt) => setForm({ ...form, credit_status: opt?.value || "active" })}
                  options={[
                    { value: "active", label: "Active (Credit permitted)" },
                    { value: "on_hold", label: "On Hold (Requires override)" },
                    { value: "blocked", label: "Blocked (Credit blocked)" },
                  ]}
                  isSearchable={false}
                  menuPortalTarget={typeof document !== "undefined" ? document.body : null}
                  menuPosition="fixed"
                  styles={{
                    control: (base) => ({
                      ...base,
                      minHeight: "36px",
                      height: "36px",
                      fontSize: "12px",
                      borderRadius: "6px",
                      backgroundColor: isDark ? "rgba(51,65,85,0.7)" : "rgba(255,255,255,0.7)",
                      borderColor: isDark ? "#475569" : "#d1d5db",
                    }),
                    singleValue: (base) => ({
                      ...base,
                      color: isDark ? "#e2e8f0" : "#1f2937",
                    }),
                    menuPortal: (base) => ({ ...base, zIndex: 9999 }),
                    menu: (base) => ({
                      ...base,
                      fontSize: "12px",
                      backgroundColor: isDark ? "#1e293b" : "#ffffff",
                    }),
                    option: (base, state) => ({
                      ...base,
                      backgroundColor: state.isSelected
                        ? "#2563eb"
                        : state.isFocused
                        ? isDark
                          ? "#334155"
                          : "#eff6ff"
                        : "transparent",
                      color: state.isSelected ? "#fff" : isDark ? "#e2e8f0" : "#1e293b",
                    }),
                  }}
                />
              </div>

              {!editingId && (
                <div>
                  <label className="block text-xs font-medium mb-1">Opening Balance Receivable (Rs.)</label>
                  <GlassInput
                    type="number"
                    min="0"
                    step="0.01"
                    placeholder="0.00 (Optional initial ledger balance)"
                    value={form.opening_balance ?? ""}
                    onChange={(e) => setForm({ ...form, opening_balance: e.target.value })}
                    className="w-full h-9"
                  />
                </div>
              )}

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
                    {editingId ? (saving ? "Updating..." : "Update") : saving ? "Saving..." : "Save"}
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
                <UsersIcon 
                  className="w-4 h-4" 
                  style={{ color: SECTION_CONFIG.management.iconColor }} 
                />
              </div>
              <span className="font-medium text-sm">Customer List</span>
            </div>
            <span className="text-xs text-gray-400">{paged.length} items</span>
          </div>

          <div className="p-3">
            <div className="directory-table-scroll">
              <table className="w-full text-sm">
                <thead className="bg-white/80 dark:bg-slate-700/80 sticky top-0">
                  <tr className="border-b border-gray-200/70 dark:border-slate-600/70 text-left">
                    <th className="px-3 py-2 font-medium text-gray-600 dark:text-gray-300 text-xs uppercase">Name</th>
                    <th className="px-3 py-2 font-medium text-gray-600 dark:text-gray-300 text-xs uppercase">Email / Phone</th>
                    <th className="px-3 py-2 font-medium text-gray-600 dark:text-gray-300 text-xs uppercase text-right">Credit Limit</th>
                    <th className="px-3 py-2 font-medium text-gray-600 dark:text-gray-300 text-xs uppercase text-center">Terms</th>
                    <th className="px-3 py-2 font-medium text-gray-600 dark:text-gray-300 text-xs uppercase text-center">Status</th>
                    {hasActions && (
                      <th className="px-3 py-2 font-medium text-gray-600 dark:text-gray-300 text-xs uppercase text-center w-24">Actions</th>
                    )}
                  </tr>
                </thead>
                <tbody>
                  {paged.length === 0 && !loading && (
                    <tr>
                      <td className="px-3 py-10 text-center text-gray-500 dark:text-gray-400" colSpan={hasActions ? 6 : 5}>
                        <div className="flex flex-col items-center gap-2">
                          <UsersIcon className="w-8 h-8 text-gray-400" />
                          <p className="text-sm">No customers found</p>
                        </div>
                      </td>
                    </tr>
                  )}

                  {paged.map((c) => {
                    const inUse = Number(c.transactions_count || 0) > 0;
                    const status = c.credit_status || "active";
                    const statusBadge =
                      status === "blocked"
                        ? "bg-rose-100 text-rose-700 dark:bg-rose-900/40 dark:text-rose-300 border-rose-200"
                        : status === "on_hold"
                        ? "bg-amber-100 text-amber-700 dark:bg-amber-900/40 dark:text-amber-300 border-amber-200"
                        : "bg-emerald-100 text-emerald-700 dark:bg-emerald-900/40 dark:text-emerald-300 border-emerald-200";

                    return (
                      <tr key={c.id} className="odd:bg-white/90 even:bg-white/70 dark:odd:bg-slate-700/60 dark:even:bg-slate-800/60 hover:bg-blue-50/70 dark:hover:bg-slate-600/50 transition-colors">
                        <td className="px-3 py-2.5">
                          <span className="font-medium text-gray-900 dark:text-gray-100">{c.name}</span>
                          {c.address && <span className="block text-[11px] text-gray-400 truncate max-w-xs">{c.address}</span>}
                        </td>
                        <td className="px-3 py-2.5 text-xs text-gray-600 dark:text-gray-400">
                          <div>{c.phone || "—"}</div>
                          <div className="text-[11px] text-gray-400">{c.email}</div>
                        </td>
                        <td className="px-3 py-2.5 text-right font-medium text-xs text-gray-800 dark:text-gray-200">
                          {c.credit_limit && Number(c.credit_limit) > 0 ? (
                            `Rs. ${Number(c.credit_limit).toLocaleString()}`
                          ) : (
                            <span className="text-gray-400 italic">Unlimited</span>
                          )}
                        </td>
                        <td className="px-3 py-2.5 text-center text-xs text-gray-600 dark:text-gray-400">
                          {c.credit_days !== null && c.credit_days !== undefined ? `${c.credit_days}d` : "30d"}
                        </td>
                        <td className="px-3 py-2.5 text-center">
                          <span className={`inline-block px-2 py-0.5 text-[10px] font-semibold rounded-full border ${statusBadge}`}>
                            {status === "on_hold" ? "Hold" : status.toUpperCase()}
                          </span>
                        </td>
                        {hasActions && (
                          <td className="px-3 py-2.5">
                            <div className="flex items-center justify-center gap-1.5">
                              <button
                                type="button"
                                onClick={() => openPriceListModal(c)}
                                className="products-row-action"
                                aria-label={`Custom Wholesale Prices for ${c.name}`}
                                title="Negotiated Wholesale Price List"
                              >
                                <TagIcon aria-hidden="true" className="w-4 h-4 text-purple-600 dark:text-purple-400" />
                              </button>
                              <Guard when={can.update}>
                                <button 
                                  type="button"
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
                                  onClick={() => inUse ? toast.error("Cannot delete: customer has transactions.") : handleDelete(c)}
                                  disabled={inUse}
                                  className="products-row-action products-row-delete"
                                  aria-label={`Delete ${c.name}`}
                                  title={inUse ? "Cannot delete: customer has transactions." : "Delete"}
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
              <span className="text-gray-500 dark:text-gray-400">Page {page} of {pageCount}</span>
              <div className="flex items-center gap-1">
                <button onClick={() => setPage(1)} disabled={page === 1} className={`p-1.5 rounded-sm hover:bg-gray-200 dark:hover:bg-slate-700 ${page === 1 ? 'opacity-40' : ''}`}>⏮</button>
                <button onClick={() => setPage((p) => Math.max(1, p - 1))} disabled={page === 1} className={`p-1.5 rounded-sm hover:bg-gray-200 dark:hover:bg-slate-700 ${page === 1 ? 'opacity-40' : ''}`}>◀</button>
                <span className="mx-1 px-2 py-0.5 rounded-sm bg-gray-100 dark:bg-slate-700 font-medium">{page}</span>
                <button onClick={() => setPage((p) => Math.min(pageCount, p + 1))} disabled={page === pageCount} className={`p-1.5 rounded-sm hover:bg-gray-200 dark:hover:bg-slate-700 ${page === pageCount ? 'opacity-40' : ''}`}>▶</button>
                <button onClick={() => setPage(pageCount)} disabled={page === pageCount} className={`p-1.5 rounded-sm hover:bg-gray-200 dark:hover:bg-slate-700 ${page === pageCount ? 'opacity-40' : ''}`}>⏭</button>
              </div>
            </div>
          </div>
        </GlassCard>
      </div>

      {/* Import modal */}
      <CustomerImportModal
        open={importOpen}
        onClose={() => setImportOpen(false)}
        onImported={fetchCustomers}
      />

      {/* Customer Custom Wholesale Price List Modal */}
      {priceListCustomer && (
        <div
          className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/60 backdrop-blur-xs"
          onClick={() => setPriceListCustomer(null)}
        >
          <div
            className="bg-white dark:bg-slate-800 rounded-2xl shadow-2xl border border-gray-200 dark:border-slate-700 w-full max-w-3xl max-h-[88vh] flex flex-col overflow-hidden"
            onClick={(e) => e.stopPropagation()}
          >
            <div className="flex items-center justify-between px-6 py-4 border-b border-gray-200 dark:border-slate-700 bg-gray-50/80 dark:bg-slate-800/80">
              <div className="flex items-center gap-3">
                <div className="p-2 rounded-xl bg-purple-600/15 text-purple-600 dark:text-purple-400">
                  <TagIcon className="w-5 h-5" />
                </div>
                <div>
                  <h2 className="text-base font-bold text-gray-900 dark:text-white">
                    Custom Wholesale Price List — {priceListCustomer.name}
                  </h2>
                  <p className="text-xs text-gray-500 dark:text-gray-400">
                    Negotiated product pack prices automatically applied on Wholesale Sale Invoices for this customer
                  </p>
                </div>
              </div>
              <button
                type="button"
                onClick={() => setPriceListCustomer(null)}
                className="p-1.5 rounded-lg text-gray-400 hover:text-gray-600 hover:bg-gray-100 dark:hover:bg-slate-700"
                aria-label="Close price list modal"
              >
                <XMarkIcon className="w-5 h-5" />
              </button>
            </div>

            <div className="p-5 overflow-y-auto space-y-4 flex-1">
              {(can.update || can.create) && (
                <form
                  onSubmit={handleSaveCustomPrice}
                  className="p-3.5 rounded-xl bg-gray-50 dark:bg-slate-700/40 border border-gray-200 dark:border-slate-700 grid grid-cols-1 md:grid-cols-12 gap-3 items-end"
                >
                  <div className="md:col-span-6">
                    <label className="block text-xs font-semibold text-gray-700 dark:text-gray-300 mb-1">
                      Product *
                    </label>
                    <ProductSearchInput
                      value={selectedPriceProduct}
                      onChange={(prod) => {
                        setSelectedPriceProduct(prod);
                        if (prod) {
                          const existing = customPrices.find((cp) => Number(cp.product_id) === Number(prod.id));
                          setCustomPackPriceInput(
                            existing
                              ? String(existing.pack_price)
                              : String(prod.whole_sale_pack_price || prod.pack_sale_price || "")
                          );
                        }
                      }}
                      products={productsCatalog}
                    />
                  </div>
                  <div className="md:col-span-4">
                    <label className="block text-xs font-semibold text-gray-700 dark:text-gray-300 mb-1">
                      Custom Pack Price (Rs.) *
                    </label>
                    <GlassInput
                      type="number"
                      min="0"
                      step="0.01"
                      required
                      placeholder="Negotiated Pack Price"
                      value={customPackPriceInput}
                      onChange={(e) => setCustomPackPriceInput(e.target.value)}
                      className="w-full h-9"
                    />
                  </div>
                  <div className="md:col-span-2">
                    <button
                      type="submit"
                      disabled={savingCustomPrice}
                      className="w-full h-9 px-3 rounded-lg text-xs font-semibold text-white bg-purple-600 hover:bg-purple-700 disabled:opacity-50 transition-colors cursor-pointer"
                    >
                      {savingCustomPrice ? "Saving..." : "Save Price"}
                    </button>
                  </div>
                </form>
              )}

              {loadingPrices ? (
                <div className="py-10 text-center text-gray-400">
                  <ArrowPathIcon className="w-6 h-6 mx-auto animate-spin mb-2" />
                  <p className="text-xs">Loading negotiated prices…</p>
                </div>
              ) : customPrices.length === 0 ? (
                <div className="py-10 text-center text-gray-500 dark:text-gray-400 border border-dashed border-gray-200 dark:border-slate-700 rounded-xl">
                  <TagIcon className="w-8 h-8 mx-auto text-gray-300 dark:text-slate-600 mb-1.5" />
                  <p className="text-sm font-medium">No custom wholesale prices configured for {priceListCustomer.name}</p>
                  <p className="text-xs text-gray-400 mt-0.5">
                    Select a product above to set a negotiated wholesale pack price.
                  </p>
                </div>
              ) : (
                <div className="border border-gray-200 dark:border-slate-700 rounded-xl overflow-x-auto">
                  <table className="w-full text-xs">
                    <thead className="bg-gray-100 dark:bg-slate-700/70 text-gray-600 dark:text-gray-300 uppercase">
                      <tr>
                        <th className="px-3 py-2.5 text-left">Product</th>
                        <th className="px-3 py-2.5 text-center">Pack Size</th>
                        <th className="px-3 py-2.5 text-right">Std W.S. Pack</th>
                        <th className="px-3 py-2.5 text-right">Custom Pack Price</th>
                        <th className="px-3 py-2.5 text-right">Implied Unit Price</th>
                        {(can.update || can.delete) && (
                          <th className="px-3 py-2.5 text-center w-24">Actions</th>
                        )}
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-gray-100 dark:divide-slate-700">
                      {customPrices.map((cp) => {
                        const prod = cp.product || {};
                        const packSize = Math.max(1, Number(prod.pack_size || 1));
                        const customPack = Number(cp.pack_price || 0);
                        const customUnit = customPack / packSize;
                        return (
                          <tr key={cp.id} className="text-gray-800 dark:text-gray-200 hover:bg-gray-50 dark:hover:bg-slate-700/40">
                            <td className="px-3 py-2.5">
                              <div className="font-semibold">{prod.name || `Product #${cp.product_id}`}</div>
                              {prod.product_code && (
                                <div className="text-[10px] text-gray-400 font-mono">{prod.product_code}</div>
                              )}
                            </td>
                            <td className="px-3 py-2.5 text-center font-mono">{packSize}</td>
                            <td className="px-3 py-2.5 text-right text-gray-500 font-mono">
                              {prod.whole_sale_pack_price ? `Rs. ${Number(prod.whole_sale_pack_price).toLocaleString()}` : "—"}
                            </td>
                            <td className="px-3 py-2.5 text-right font-bold text-purple-600 dark:text-purple-400 font-mono">
                              Rs. {customPack.toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
                            </td>
                            <td className="px-3 py-2.5 text-right font-mono text-gray-600 dark:text-gray-300">
                              Rs. {customUnit.toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
                            </td>
                            {(can.update || can.delete) && (
                              <td className="px-3 py-2.5 text-center">
                                <div className="flex items-center justify-center gap-1.5">
                                  <button
                                    type="button"
                                    onClick={() => {
                                      setSelectedPriceProduct(prod.id ? prod : { id: cp.product_id, name: `Product #${cp.product_id}` });
                                      setCustomPackPriceInput(String(cp.pack_price));
                                    }}
                                    className="p-2 rounded hover:bg-blue-50 dark:hover:bg-slate-600 text-blue-600 dark:text-blue-400"
                                    title="Edit custom price"
                                    aria-label="Edit custom price"
                                  >
                                    <PencilSquareIcon className="w-3.5 h-3.5" />
                                  </button>
                                  <button
                                    type="button"
                                    onClick={() => handleDeleteCustomPrice(cp)}
                                    className="p-2 rounded hover:bg-rose-50 dark:hover:bg-rose-900/30 text-rose-600 dark:text-rose-400"
                                    title="Remove custom price"
                                    aria-label="Remove custom price"
                                  >
                                    <TrashIcon className="w-3.5 h-3.5" />
                                  </button>
                                </div>
                              </td>
                            )}
                          </tr>
                        );
                      })}
                    </tbody>
                  </table>
                </div>
              )}
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
