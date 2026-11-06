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
  UsersIcon,
  XMarkIcon,
  TagIcon,
  BanknotesIcon,
  BellAlertIcon,
  CalendarDaysIcon,
  CheckCircleIcon,
  ExclamationTriangleIcon,
  PaperAirplaneIcon,
  EyeIcon,
  ShoppingCartIcon,
  ChevronDoubleLeftIcon,
  ChevronLeftIcon,
  ChevronRightIcon,
  ChevronDoubleRightIcon,
} from "@heroicons/react/24/solid";
import CustomerImportModal from "@/components/CustomerImportModal.jsx";
import ProductSearchInput from "@/components/ProductSearchInput.jsx";
import RegularRefillReminderModal from "@/components/RegularRefillReminderModal.jsx";
import { getReactSelectStyles } from "@/components/ExpiryReturnPolicyFields.jsx";
import { usePermissions, Guard } from "@/api/usePermissions.js";
import { useTheme } from "@/context/ThemeContext";
import { GlassCard, GlassInput } from "@/components/Glass.jsx";

const PAGE_SIZE_OPTIONS = [
  { value: 10, label: "10 per page" },
  { value: 25, label: "25 per page" },
  { value: 50, label: "50 per page" },
  { value: 100, label: "100 per page" },
];

const CUSTOMER_FILTER_OPTIONS = [
  { value: "all", label: "All Customers" },
  { value: "regular_all", label: "Regular Customers (All)" },
  { value: "regular_due", label: "Due for WhatsApp Reminder" },
  { value: "regular_weekly", label: "Weekly Regular Customers" },
  { value: "regular_monthly", label: "Monthly Regular Customers" },
  { value: "standard", label: "Standard (Non-Regular) Customers" },
];

export default function CustomersIndex() {
  const navigate = useNavigate();
  const { isDark, theme } = useTheme();
  const primaryColor = theme?.primary_color || "#3b82f6";

  const [customers, setCustomers] = useState([]);
  const [loading, setLoading] = useState(false);
  const [importOpen, setImportOpen] = useState(false);
  const [exporting, setExporting] = useState(false);
  const [bulkSending, setBulkSending] = useState(false);

  // Reminder modal state
  const [reminderCustomer, setReminderCustomer] = useState(null);

  // Credit summary modal state
  const [creditModalCustomer, setCreditModalCustomer] = useState(null);
  const [creditSummary, setCreditSummary] = useState(null);
  const [loadingCreditSummary, setLoadingCreditSummary] = useState(false);

  // Custom Wholesale Price List Modal state
  const [priceListCustomer, setPriceListCustomer] = useState(null);
  const [customPrices, setCustomPrices] = useState([]);
  const [loadingPrices, setLoadingPrices] = useState(false);
  const [selectedPriceProduct, setSelectedPriceProduct] = useState(null);
  const [customPackPriceInput, setCustomPackPriceInput] = useState("");
  const [savingCustomPrice, setSavingCustomPrice] = useState(false);
  const [productsCatalog, setProductsCatalog] = useState([]);

  // Search & Filter state
  const [q, setQ] = useState("");
  const [customerFilter, setCustomerFilter] = useState("all");
  const [page, setPage] = useState(1);
  const [pageSize, setPageSize] = useState(25);

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

  const selectStyles = useMemo(
    () => getReactSelectStyles(isDark, primaryColor),
    [isDark, primaryColor]
  );

  useEffect(() => {
    document.title = "Customers - Karobar App";
  }, []);

  // Alt + N -> Open Create Customer page
  useEffect(() => {
    const onKeyDown = (e) => {
      if (e.altKey && (e.key || "").toLowerCase() === "n") {
        if (!can.create) return;
        e.preventDefault();
        navigate("/customers/create");
      }
    };
    window.addEventListener("keydown", onKeyDown);
    return () => window.removeEventListener("keydown", onKeyDown);
  }, [can.create, navigate]);

  const fetchCustomers = useCallback(async () => {
    try {
      setLoading(true);
      const res = await axios.get("/api/customers");
      setCustomers(Array.isArray(res.data) ? res.data : []);
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

  const handleDelete = async (c) => {
    if (!can.delete)
      return toast.error("You don't have permission to delete customers.");
    if (!window.confirm(`Delete customer "${c.name}"?`)) return;
    try {
      await axios.delete(`/api/customers/${c.id}`);
      setCustomers((prev) =>
        prev.filter((x) => Number(x.id) !== Number(c.id))
      );
      toast.success("Customer deleted");
    } catch (err) {
      if (err?.response?.status === 403)
        toast.error("You don't have permission to delete customers.");
      else toast.error(err?.response?.data?.message || "Delete failed");
    }
  };

  const handleAdvanceCycle = async (c) => {
    if (!can.update) {
      toast.error("You don't have permission to update customers.");
      return;
    }
    try {
      const { data } = await axios.post(
        `/api/customers/${c.id}/advance-refill-cycle`
      );
      toast.success(data.message || "Refill cycle advanced!");
      if (data.customer) {
        setCustomers((prev) =>
          prev.map((row) =>
            Number(row.id) === Number(c.id) ? { ...row, ...data.customer } : row
          )
        );
      } else {
        fetchCustomers();
      }
    } catch (err) {
      toast.error(
        err?.response?.data?.message || "Failed to advance refill date"
      );
    }
  };

  const handleBulkSendReminders = async (onlyStockReady = true) => {
    const dueIds = dueRegularCustomers
      .filter((c) => (onlyStockReady ? c.stock_ready !== false : true))
      .map((c) => c.id);

    if (dueIds.length === 0) {
      toast.error("No due regular customers with ready stock to remind.");
      return;
    }

    setBulkSending(true);
    try {
      const { data } = await axios.post(
        "/api/customers/send-bulk-refill-reminders",
        {
          customer_ids: dueIds,
          only_stock_ready: onlyStockReady,
        }
      );
      toast.success(data.message || "Bulk WhatsApp reminders processed!");
      // If only 1 customer and it returned a wa_me_url fallback, open it
      if (
        Array.isArray(data.results) &&
        data.results.length === 1 &&
        data.results[0]?.status === "wa_me_fallback" &&
        data.results[0]?.wa_me_url
      ) {
        window.open(data.results[0].wa_me_url, "_blank", "noopener,noreferrer");
      }
      fetchCustomers();
    } catch (err) {
      toast.error(
        err?.response?.data?.message || "Failed to send bulk WhatsApp reminders"
      );
    } finally {
      setBulkSending(false);
    }
  };

  const openCreditSummary = async (customer) => {
    setCreditModalCustomer(customer);
    setCreditSummary(null);
    setLoadingCreditSummary(true);
    try {
      const { data } = await axios.get(
        `/api/customers/${customer.id}/credit-summary`
      );
      setCreditSummary(data);
    } catch (err) {
      toast.error(
        err?.response?.data?.message || "Failed to load customer credit summary"
      );
    } finally {
      setLoadingCreditSummary(false);
    }
  };

  const fetchProductsCatalog = useCallback(async (searchQuery = "") => {
    try {
      const res = await axios.get("/api/products/search", {
        params: { q: searchQuery || "", limit: 200 },
      });
      const list = Array.isArray(res.data?.data)
        ? res.data.data
        : Array.isArray(res.data)
        ? res.data
        : [];
      setProductsCatalog(list);
    } catch {
      // ignore
    }
  }, []);

  // Custom Wholesale Price List handlers
  const openPriceListModal = async (customer) => {
    setPriceListCustomer(customer);
    setSelectedPriceProduct(null);
    setCustomPackPriceInput("");
    setLoadingPrices(true);
    try {
      const [pricesRes, prodRes] = await Promise.all([
        axios.get(`/api/customers/${customer.id}/whole-sale-prices`),
        productsCatalog.length === 0
          ? axios.get("/api/products/search", { params: { q: "", limit: 200 } })
          : Promise.resolve({ data: productsCatalog }),
      ]);
      setCustomPrices(Array.isArray(pricesRes.data) ? pricesRes.data : []);
      if (productsCatalog.length === 0 && Array.isArray(prodRes.data)) {
        setProductsCatalog(prodRes.data);
      }
    } catch (err) {
      toast.error(
        err?.response?.data?.message ||
          "Failed to load custom wholesale prices"
      );
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
      const { data } = await axios.post(
        `/api/customers/${priceListCustomer.id}/whole-sale-prices`,
        {
          product_id: selectedPriceProduct.id,
          pack_price: packPrice,
        }
      );
      setCustomPrices((prev) => {
        const exists = prev.some(
          (p) => Number(p.product_id) === Number(data.product_id)
        );
        if (exists) {
          return prev.map((p) =>
            Number(p.product_id) === Number(data.product_id) ? data : p
          );
        }
        return [data, ...prev];
      });
      setSelectedPriceProduct(null);
      setCustomPackPriceInput("");
      toast.success("Custom wholesale pack price saved");
    } catch (err) {
      toast.error(
        err?.response?.data?.message || "Failed to save custom wholesale price"
      );
    } finally {
      setSavingCustomPrice(false);
    }
  };

  const handleDeleteCustomPrice = async (priceRow) => {
    if (!priceListCustomer) return;
    try {
      await axios.delete(
        `/api/customers/${priceListCustomer.id}/whole-sale-prices/${priceRow.id}`
      );
      setCustomPrices((prev) => prev.filter((p) => p.id !== priceRow.id));
      toast.success("Custom wholesale price removed");
    } catch (err) {
      toast.error(
        err?.response?.data?.message ||
          "Failed to remove custom wholesale price"
      );
    }
  };

  const handleExport = async () => {
    if (!can.export)
      return toast.error("You don't have permission to export customers.");
    try {
      setExporting(true);
      const res = await axios.get("/api/customers/export", {
        responseType: "blob",
      });
      const stamp = new Date()
        .toISOString()
        .slice(0, 19)
        .replace(/[:T]/g, "-");
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

  const regularCustomersCount = useMemo(
    () => customers.filter((c) => Boolean(c.is_regular)).length,
    [customers]
  );

  const dueRegularCustomers = useMemo(
    () =>
      customers.filter(
        (c) => Boolean(c.is_regular) && Boolean(c.is_due_for_reminder)
      ),
    [customers]
  );

  const norm = (v) => (v ?? "").toString().toLowerCase().trim();
  const filtered = useMemo(() => {
    const needle = norm(q);
    return customers.filter((c) => {
      if (
        needle &&
        ![c.name, c.email, c.phone, c.address].some((f) =>
          norm(f).includes(needle)
        )
      ) {
        return false;
      }

      if (customerFilter === "regular_all" && !c.is_regular) return false;
      if (
        customerFilter === "regular_due" &&
        (!c.is_regular || !c.is_due_for_reminder)
      ) {
        return false;
      }
      if (
        customerFilter === "regular_weekly" &&
        (!c.is_regular || c.refill_cycle !== "weekly")
      ) {
        return false;
      }
      if (
        customerFilter === "regular_monthly" &&
        (!c.is_regular || c.refill_cycle !== "monthly")
      ) {
        return false;
      }
      if (customerFilter === "standard" && c.is_regular) return false;

      return true;
    });
  }, [customers, q, customerFilter]);

  const pageCount = Math.max(1, Math.ceil(filtered.length / pageSize));
  const currentPage = Math.min(page, pageCount);
  const start = (currentPage - 1) * pageSize;
  const paged = filtered.slice(start, start + pageSize);

  if (permsLoading) return <div className="p-6">Loading…</div>;
  if (!can.view)
    return (
      <div className="p-6 text-sm text-gray-700">
        You don&apos;t have permission to view customers.
      </div>
    );

  const hasActions = can.view || can.update || can.delete;

  return (
    <div className="directory-page space-y-4">
      <div className="products-panel directory-overview">
        <div className="products-heading">
          <div className="flex items-center gap-4">
            <div className="products-identity-icon">
              <UsersIcon className="w-6 h-6" />
            </div>
            <div>
              <h1 className="products-title">
                Customers & Regular Medicine Reminders
              </h1>
              <p className="products-subtitle">
                <UsersIcon className="w-3.5 h-3.5" />
                <span>
                  {customers.length} customers ({regularCustomersCount} regular
                  • {dueRegularCustomers.length} due for WhatsApp reminder)
                </span>
              </p>
            </div>
          </div>

          <div className="flex items-center gap-2.5 flex-wrap">
            <Guard when={can.create}>
              <Link
                to="/customers/create"
                title="Add Customer (Alt+N)"
                className="products-action products-action-primary theme-btn-primary"
              >
                <PlusCircleIcon className="w-4 h-4" />
                <span>Add Customer (Alt+N)</span>
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
              onClick={fetchCustomers}
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
              value={q}
              onChange={(e) => {
                setQ(e.target.value);
                setPage(1);
              }}
              aria-label="Search customers"
              placeholder="Search customers by name, phone, email, or address..."
              className="w-full pl-9 h-[38px]"
            />
          </div>

          <div className="md:col-span-4">
            <Select
              options={CUSTOMER_FILTER_OPTIONS}
              value={
                CUSTOMER_FILTER_OPTIONS.find(
                  (o) => o.value === customerFilter
                ) || CUSTOMER_FILTER_OPTIONS[0]
              }
              onChange={(opt) => {
                setCustomerFilter(opt?.value || "all");
                setPage(1);
              }}
              styles={selectStyles}
              isSearchable={false}
              menuPortalTarget={
                typeof document !== "undefined" ? document.body : null
              }
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
                setPageSize(opt?.value || 25);
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

      {/* Regular Customers Due for Prior WhatsApp Reminder Callout Banner */}
      {dueRegularCustomers.length > 0 && (
        <div className="rounded-2xl border border-emerald-300 dark:border-emerald-700/80 bg-gradient-to-r from-emerald-50/90 via-teal-50/60 to-white dark:from-emerald-950/40 dark:via-slate-800 dark:to-slate-800 p-4 flex flex-wrap items-center justify-between gap-4 shadow-xs">
          <div className="flex items-center gap-3">
            <div className="p-2.5 rounded-xl bg-emerald-600 text-white shadow-xs">
              <BellAlertIcon className="w-5 h-5" />
            </div>
            <div>
              <div className="text-sm font-bold text-slate-900 dark:text-slate-100">
                {dueRegularCustomers.length} Regular Customer
                {dueRegularCustomers.length === 1 ? " is" : "s are"} Due for Prior
                Medicine / Product Pickup Reminder
              </div>
              <div className="text-xs text-slate-600 dark:text-slate-300">
                Notify them on WhatsApp that their weekly or monthly medicines/products are ready so they don&apos;t forget to collect them.
              </div>
            </div>
          </div>

          <div className="flex flex-wrap items-center gap-2">
            {customerFilter !== "regular_due" ? (
              <button
                type="button"
                onClick={() => {
                  setCustomerFilter("regular_due");
                  setPage(1);
                }}
                className="h-9 px-3.5 rounded-xl text-xs font-semibold bg-white dark:bg-slate-800 text-emerald-700 dark:text-emerald-300 border border-emerald-300 dark:border-emerald-700 hover:bg-emerald-50 cursor-pointer"
              >
                Filter Due Customers ({dueRegularCustomers.length})
              </button>
            ) : (
              <button
                type="button"
                onClick={() => {
                  setCustomerFilter("all");
                  setPage(1);
                }}
                className="h-9 px-3.5 rounded-xl text-xs font-semibold bg-white dark:bg-slate-800 text-slate-700 dark:text-slate-300 border border-slate-300 dark:border-slate-700 hover:bg-slate-50 cursor-pointer"
              >
                Show All Customers
              </button>
            )}

            <button
              type="button"
              disabled={bulkSending}
              onClick={() => handleBulkSendReminders(true)}
              className="h-9 px-4 rounded-xl text-xs font-semibold bg-emerald-600 hover:bg-emerald-700 disabled:opacity-50 text-white flex items-center gap-1.5 shadow-2xs cursor-pointer"
            >
              {bulkSending ? (
                <ArrowPathIcon className="w-4 h-4 animate-spin" />
              ) : (
                <PaperAirplaneIcon className="w-4 h-4" />
              )}
              <span>
                {bulkSending
                  ? "Sending Reminders..."
                  : "WhatsApp All Due & In-Stock Customers"}
              </span>
            </button>
          </div>
        </div>
      )}

      {/* Full-Width Directory Table Card */}
      <GlassCard className="directory-panel">
        <div className="directory-panel-heading">
          <div className="flex items-center gap-2">
            <UsersIcon className="w-4 h-4 text-blue-500" />
            <span className="font-semibold text-sm">Customer Directory</span>
          </div>
          <span className="text-xs text-slate-400">
            Showing {paged.length} of {filtered.length}
          </span>
        </div>

        <div className="p-3">
          <div className="directory-table-scroll">
            <table className="w-full text-sm">
              <thead className="bg-white/90 dark:bg-slate-800/90 sticky top-0 z-10">
                <tr className="border-b border-slate-200/70 dark:border-slate-700 text-left text-xs uppercase text-slate-500 dark:text-slate-300">
                  <th className="px-3 py-2.5">Customer</th>
                  <th className="px-3 py-2.5">Contact</th>
                  <th className="px-3 py-2.5">
                    Regular Refill Schedule & Stock Readiness
                  </th>
                  <th className="px-3 py-2.5 text-right">Credit Limit</th>
                  <th className="px-3 py-2.5 text-center">Terms</th>
                  <th className="px-3 py-2.5 text-center">Status</th>
                  {hasActions && (
                    <th className="px-3 py-2.5 text-center w-44">Actions</th>
                  )}
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-200/50 dark:divide-slate-700/50">
                {paged.length === 0 && !loading && (
                  <tr>
                    <td
                      className="px-3 py-10 text-center text-slate-500"
                      colSpan={hasActions ? 7 : 6}
                    >
                      No customers found.
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

                  const cycleLabel =
                    c.refill_cycle === "weekly"
                      ? "Weekly"
                      : c.refill_cycle === "biweekly"
                      ? "Bi-Weekly"
                      : c.refill_cycle === "custom"
                      ? `Every ${c.refill_custom_days || 15}d`
                      : "Monthly";

                  const itemsCount = Number(c.regular_items_count || 0);
                  const daysLeft = c.days_until_refill;

                  return (
                    <tr
                      key={c.id}
                      className="hover:bg-blue-50/50 dark:hover:bg-slate-700/40 transition-colors"
                    >
                      <td className="px-3 py-2.5">
                        <div className="flex items-center gap-2 flex-wrap">
                          <Link
                            to={`/customers/${c.id}`}
                            className="font-semibold text-slate-900 dark:text-slate-100 hover:text-blue-600 dark:hover:text-blue-400 hover:underline"
                          >
                            {c.name}
                          </Link>
                          {c.is_regular && (
                            <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-[10px] font-bold bg-emerald-100 text-emerald-800 dark:bg-emerald-900/50 dark:text-emerald-300 border border-emerald-200 dark:border-emerald-700">
                              <BellAlertIcon className="w-3 h-3" />
                              <span>Regular • {cycleLabel}</span>
                            </span>
                          )}
                        </div>
                        {c.address && (
                          <div className="text-xs text-slate-400 truncate max-w-xs">
                            {c.address}
                          </div>
                        )}
                      </td>

                      <td className="px-3 py-2.5 text-xs text-slate-600 dark:text-slate-300">
                        <div>{c.phone || "—"}</div>
                        {c.email && (
                          <div className="text-[11px] text-slate-400">
                            {c.email}
                          </div>
                        )}
                      </td>

                      <td className="px-3 py-2.5 text-xs">
                        {c.is_regular ? (
                          <div className="space-y-1">
                            <div className="flex items-center gap-2 flex-wrap">
                              <span className="font-medium text-slate-700 dark:text-slate-200">
                                Due:{" "}
                                {c.next_refill_date
                                  ? String(c.next_refill_date).slice(0, 10)
                                  : "Not set"}
                              </span>
                              {daysLeft !== null && daysLeft !== undefined && (
                                <span
                                  className={`px-2 py-0.5 rounded-full text-[10px] font-semibold ${
                                    daysLeft < 0
                                      ? "bg-rose-100 text-rose-700 dark:bg-rose-900/40 dark:text-rose-300"
                                      : c.is_due_for_reminder
                                      ? "bg-amber-100 text-amber-800 dark:bg-amber-900/40 dark:text-amber-300"
                                      : "bg-slate-100 text-slate-600 dark:bg-slate-700 dark:text-slate-300"
                                  }`}
                                >
                                  {daysLeft < 0
                                    ? `Overdue (${Math.abs(daysLeft)}d)`
                                    : daysLeft === 0
                                    ? "Due Today"
                                    : `In ${daysLeft}d`}
                                </span>
                              )}
                            </div>

                            <div className="flex items-center gap-2 flex-wrap">
                              {itemsCount > 0 ? (
                                <>
                                  <span
                                    className={`inline-flex items-center gap-1 text-[11px] font-medium ${
                                      c.stock_ready
                                        ? "text-emerald-600 dark:text-emerald-400"
                                        : "text-amber-600 dark:text-amber-400"
                                    }`}
                                  >
                                    {c.stock_ready ? (
                                      <CheckCircleIcon className="w-3.5 h-3.5" />
                                    ) : (
                                      <ExclamationTriangleIcon className="w-3.5 h-3.5" />
                                    )}
                                    <span>
                                      {c.stock_ready
                                        ? `Ready (${itemsCount} item${itemsCount === 1 ? "" : "s"} in stock)`
                                        : `${c.out_of_stock_count} of ${itemsCount} low stock`}
                                    </span>
                                  </span>

                                  <button
                                    type="button"
                                    onClick={() =>
                                      navigate(
                                        `/sale-invoices/create/retail?regular_customer_id=${c.id}`
                                      )
                                    }
                                    className="inline-flex items-center gap-1 px-2 py-0.5 rounded-md text-[10px] font-bold bg-indigo-50 text-indigo-700 hover:bg-indigo-100 dark:bg-indigo-900/40 dark:text-indigo-300 dark:hover:bg-indigo-900/60 border border-indigo-200 dark:border-indigo-700 cursor-pointer"
                                    title="Shift all regular products into a new Retail Sale Invoice"
                                  >
                                    <ShoppingCartIcon className="w-3 h-3" />
                                    <span>Shift to Retail Invoice</span>
                                  </button>
                                </>
                              ) : (
                                <span className="text-[11px] text-slate-400">
                                  General reminder (no items attached)
                                </span>
                              )}

                              {c.last_refill_reminded_at && (
                                <span className="text-[10px] text-slate-400">
                                  • Reminded{" "}
                                  {String(c.last_refill_reminded_at).slice(
                                    0,
                                    10
                                  )}
                                </span>
                              )}
                            </div>
                          </div>
                        ) : (
                          <span className="text-slate-400 italic">
                            Standard Customer
                          </span>
                        )}
                      </td>

                      <td className="px-3 py-2.5 text-right text-xs font-medium text-slate-800 dark:text-slate-200">
                        {c.credit_limit && Number(c.credit_limit) > 0 ? (
                          `Rs. ${Number(c.credit_limit).toLocaleString()}`
                        ) : (
                          <span className="text-slate-400 italic">
                            Unlimited
                          </span>
                        )}
                      </td>

                      <td className="px-3 py-2.5 text-center text-xs text-slate-600 dark:text-slate-400">
                        {c.credit_days !== null && c.credit_days !== undefined
                          ? `${c.credit_days}d`
                          : "30d"}
                      </td>

                      <td className="px-3 py-2.5 text-center">
                        <span
                          className={`inline-block px-2 py-0.5 text-[10px] font-semibold rounded-full border ${statusBadge}`}
                        >
                          {status === "on_hold" ? "Hold" : status.toUpperCase()}
                        </span>
                      </td>

                      {hasActions && (
                        <td className="px-3 py-2.5">
                          <div className="flex items-center justify-center gap-1">
                            <Link
                              to={`/customers/${c.id}`}
                              className="products-row-action text-blue-600 dark:text-blue-400"
                              title="View Customer Details"
                              aria-label={`View ${c.name}`}
                            >
                              <EyeIcon className="w-4 h-4" />
                            </Link>

                            {c.is_regular && itemsCount > 0 && (
                              <button
                                type="button"
                                onClick={() =>
                                  navigate(
                                    `/sale-invoices/create/retail?regular_customer_id=${c.id}`
                                  )
                                }
                                className="products-row-action text-indigo-600 dark:text-indigo-400"
                                title="Shift All Regular Products to Retail Sale Invoice"
                                aria-label={`Shift regular products to retail sale invoice for ${c.name}`}
                              >
                                <ShoppingCartIcon className="w-4 h-4" />
                              </button>
                            )}

                            {c.is_regular && (
                              <>
                                <button
                                  type="button"
                                  onClick={() => setReminderCustomer(c)}
                                  className="products-row-action text-emerald-600 dark:text-emerald-400"
                                  title="Send WhatsApp Medicine / Product Readiness Reminder"
                                  aria-label={`Send WhatsApp reminder to ${c.name}`}
                                >
                                  <BellAlertIcon className="w-4 h-4" />
                                </button>
                                <Guard when={can.update}>
                                  <button
                                    type="button"
                                    onClick={() => handleAdvanceCycle(c)}
                                    className="products-row-action text-teal-600 dark:text-teal-400"
                                    title="Mark Collected & Advance to Next Cycle"
                                    aria-label={`Advance refill cycle for ${c.name}`}
                                  >
                                    <CalendarDaysIcon className="w-4 h-4" />
                                  </button>
                                </Guard>
                              </>
                            )}

                            <button
                              type="button"
                              onClick={() => openCreditSummary(c)}
                              className="products-row-action"
                              title="View Credit & Balance Summary"
                              aria-label={`Credit summary for ${c.name}`}
                            >
                              <BanknotesIcon className="w-4 h-4 text-emerald-600 dark:text-emerald-400" />
                            </button>

                            <button
                              type="button"
                              onClick={() => openPriceListModal(c)}
                              className="products-row-action"
                              aria-label={`Custom Wholesale Prices for ${c.name}`}
                              title="Negotiated Wholesale Price List"
                            >
                              <TagIcon className="w-4 h-4 text-purple-600 dark:text-purple-400" />
                            </button>

                            <Guard when={can.update}>
                              <Link
                                to={`/customers/${c.id}/edit`}
                                className="products-row-action"
                                title="Edit Customer"
                                aria-label={`Edit ${c.name}`}
                              >
                                <PencilSquareIcon className="w-4 h-4" />
                              </Link>
                            </Guard>

                            <Guard when={can.delete}>
                              <button
                                onClick={() =>
                                  inUse
                                    ? toast.error(
                                        "Cannot delete: customer has transactions."
                                      )
                                    : handleDelete(c)
                                }
                                disabled={inUse}
                                className="products-row-action products-row-delete"
                                aria-label={`Delete ${c.name}`}
                                title={
                                  inUse
                                    ? "Cannot delete: customer has transactions."
                                    : "Delete Customer"
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

          {/* Pagination */}
          <div className="mt-3 flex items-center justify-between text-xs">
            <span className="text-slate-500">
              Page {currentPage} of {pageCount}
            </span>
            <div className="flex items-center gap-1">
              <button
                onClick={() => setPage(1)}
                disabled={currentPage === 1}
                className={`p-1.5 rounded hover:bg-slate-200 dark:hover:bg-slate-700 ${
                  currentPage === 1 ? "opacity-40" : ""
                }`}
              >
                <ChevronDoubleLeftIcon className="w-3.5 h-3.5" />
              </button>
              <button
                onClick={() => setPage((p) => Math.max(1, p - 1))}
                disabled={currentPage === 1}
                className={`p-1.5 rounded hover:bg-slate-200 dark:hover:bg-slate-700 ${
                  currentPage === 1 ? "opacity-40" : ""
                }`}
              >
                <ChevronLeftIcon className="w-3.5 h-3.5" />
              </button>
              <span className="mx-1 px-2 py-0.5 rounded bg-slate-100 dark:bg-slate-700 font-medium">
                {currentPage}
              </span>
              <button
                onClick={() => setPage((p) => Math.min(pageCount, p + 1))}
                disabled={currentPage === pageCount}
                className={`p-1.5 rounded hover:bg-slate-200 dark:hover:bg-slate-700 ${
                  currentPage === pageCount ? "opacity-40" : ""
                }`}
              >
                <ChevronRightIcon className="w-3.5 h-3.5" />
              </button>
              <button
                onClick={() => setPage(pageCount)}
                disabled={currentPage === pageCount}
                className={`p-1.5 rounded hover:bg-slate-200 dark:hover:bg-slate-700 ${
                  currentPage === pageCount ? "opacity-40" : ""
                }`}
              >
                <ChevronDoubleRightIcon className="w-3.5 h-3.5" />
              </button>
            </div>
          </div>
        </div>
      </GlassCard>

      {/* Import modal */}
      <CustomerImportModal
        open={importOpen}
        onClose={() => setImportOpen(false)}
        onImported={fetchCustomers}
      />

      {/* Regular Customer Refill Reminder Modal */}
      <RegularRefillReminderModal
        open={Boolean(reminderCustomer)}
        customer={reminderCustomer}
        onClose={() => setReminderCustomer(null)}
        onSent={(updatedCustomer) => {
          if (updatedCustomer) {
            setCustomers((prev) =>
              prev.map((row) =>
                Number(row.id) === Number(updatedCustomer.id)
                  ? { ...row, ...updatedCustomer }
                  : row
              )
            );
          } else {
            fetchCustomers();
          }
        }}
      />

      {/* Credit Summary Modal */}
      {creditModalCustomer && (
        <div
          className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/60 backdrop-blur-xs"
          onClick={() => setCreditModalCustomer(null)}
        >
          <div
            className="bg-white dark:bg-slate-800 rounded-2xl shadow-2xl border border-slate-200 dark:border-slate-700 w-full max-w-lg overflow-hidden"
            onClick={(e) => e.stopPropagation()}
          >
            <div className="flex items-center justify-between px-5 py-4 border-b border-slate-200 dark:border-slate-700">
              <div className="flex items-center gap-3">
                <div className="p-2 rounded-xl bg-emerald-500/15 text-emerald-600 dark:text-emerald-400">
                  <BanknotesIcon className="w-5 h-5" />
                </div>
                <div>
                  <h3 className="text-base font-bold text-slate-900 dark:text-white">
                    Credit Summary — {creditModalCustomer.name}
                  </h3>
                  <p className="text-xs text-slate-500">
                    Receivable balance & credit terms
                  </p>
                </div>
              </div>
              <button
                onClick={() => setCreditModalCustomer(null)}
                className="p-1.5 rounded-lg text-slate-400 hover:bg-slate-100 dark:hover:bg-slate-700"
              >
                <XMarkIcon className="w-5 h-5" />
              </button>
            </div>

            <div className="p-5 space-y-4">
              {loadingCreditSummary ? (
                <div className="py-8 text-center text-slate-400">
                  <ArrowPathIcon className="w-6 h-6 animate-spin mx-auto mb-2" />
                  <p className="text-xs">Loading credit summary…</p>
                </div>
              ) : creditSummary ? (
                <div className="grid grid-cols-2 gap-3">
                  <div className="p-3 rounded-xl bg-slate-50 dark:bg-slate-700/40 border border-slate-200/70 dark:border-slate-700">
                    <div className="text-[11px] uppercase text-slate-400 font-semibold">
                      Current Receivable
                    </div>
                    <div className="text-lg font-bold font-mono text-slate-900 dark:text-white mt-0.5">
                      Rs.{" "}
                      {Number(
                        creditSummary.current_balance || 0
                      ).toLocaleString()}
                    </div>
                  </div>
                  <div className="p-3 rounded-xl bg-slate-50 dark:bg-slate-700/40 border border-slate-200/70 dark:border-slate-700">
                    <div className="text-[11px] uppercase text-slate-400 font-semibold">
                      Credit Limit
                    </div>
                    <div className="text-lg font-bold font-mono text-slate-900 dark:text-white mt-0.5">
                      {creditSummary.credit_limit
                        ? `Rs. ${Number(
                            creditSummary.credit_limit
                          ).toLocaleString()}`
                        : "Unlimited"}
                    </div>
                  </div>
                  <div className="p-3 rounded-xl bg-slate-50 dark:bg-slate-700/40 border border-slate-200/70 dark:border-slate-700">
                    <div className="text-[11px] uppercase text-slate-400 font-semibold">
                      Total Overdue
                    </div>
                    <div className="text-lg font-bold font-mono text-rose-600 dark:text-rose-400 mt-0.5">
                      Rs.{" "}
                      {Number(
                        creditSummary.total_overdue || 0
                      ).toLocaleString()}
                    </div>
                  </div>
                  <div className="p-3 rounded-xl bg-slate-50 dark:bg-slate-700/40 border border-slate-200/70 dark:border-slate-700">
                    <div className="text-[11px] uppercase text-slate-400 font-semibold">
                      Credit Terms
                    </div>
                    <div className="text-lg font-bold text-slate-900 dark:text-white mt-0.5">
                      {creditSummary.credit_days
                        ? `${creditSummary.credit_days} Days`
                        : "30 Days"}
                    </div>
                  </div>
                </div>
              ) : null}
            </div>
          </div>
        </div>
      )}

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
                          const existing = customPrices.find(
                            (cp) => Number(cp.product_id) === Number(prod.id)
                          );
                          setCustomPackPriceInput(
                            existing
                              ? String(existing.pack_price)
                              : String(
                                  prod.whole_sale_pack_price ||
                                    prod.pack_sale_price ||
                                    ""
                                )
                          );
                        }
                      }}
                      products={productsCatalog}
                      onRefreshProducts={fetchProductsCatalog}
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
                  <p className="text-sm font-medium">
                    No custom wholesale prices configured for{" "}
                    {priceListCustomer.name}
                  </p>
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
                        <th className="px-3 py-2.5 text-right">
                          Std W.S. Pack
                        </th>
                        <th className="px-3 py-2.5 text-right">
                          Custom Pack Price
                        </th>
                        <th className="px-3 py-2.5 text-right">
                          Implied Unit Price
                        </th>
                        {(can.update || can.delete) && (
                          <th className="px-3 py-2.5 text-center w-24">
                            Actions
                          </th>
                        )}
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-gray-100 dark:divide-slate-700">
                      {customPrices.map((cp) => {
                        const prod = cp.product || {};
                        const packSize = Math.max(
                          1,
                          Number(prod.pack_size || 1)
                        );
                        const customPack = Number(cp.pack_price || 0);
                        const customUnit = customPack / packSize;
                        return (
                          <tr
                            key={cp.id}
                            className="text-gray-800 dark:text-gray-200 hover:bg-gray-50 dark:hover:bg-slate-700/40"
                          >
                            <td className="px-3 py-2.5">
                              <div className="font-semibold">
                                {prod.name || `Product #${cp.product_id}`}
                              </div>
                              {prod.product_code && (
                                <div className="text-[10px] text-gray-400 font-mono">
                                  {prod.product_code}
                                </div>
                              )}
                            </td>
                            <td className="px-3 py-2.5 text-center font-mono">
                              {packSize}
                            </td>
                            <td className="px-3 py-2.5 text-right text-gray-500 font-mono">
                              {prod.whole_sale_pack_price
                                ? `Rs. ${Number(
                                    prod.whole_sale_pack_price
                                  ).toLocaleString()}`
                                : "—"}
                            </td>
                            <td className="px-3 py-2.5 text-right font-bold text-purple-600 dark:text-purple-400 font-mono">
                              Rs.{" "}
                              {customPack.toLocaleString(undefined, {
                                minimumFractionDigits: 2,
                                maximumFractionDigits: 2,
                              })}
                            </td>
                            <td className="px-3 py-2.5 text-right font-mono text-gray-600 dark:text-gray-300">
                              Rs.{" "}
                              {customUnit.toLocaleString(undefined, {
                                minimumFractionDigits: 2,
                                maximumFractionDigits: 2,
                              })}
                            </td>
                            {(can.update || can.delete) && (
                              <td className="px-3 py-2.5 text-center">
                                <div className="flex items-center justify-center gap-1.5">
                                  <button
                                    type="button"
                                    onClick={() => {
                                      setSelectedPriceProduct(
                                        prod.id
                                          ? prod
                                          : {
                                              id: cp.product_id,
                                              name: `Product #${cp.product_id}`,
                                            }
                                      );
                                      setCustomPackPriceInput(
                                        String(cp.pack_price)
                                      );
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

