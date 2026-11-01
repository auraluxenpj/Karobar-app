import React, { useEffect, useMemo, useState, useCallback } from "react";
import { Link, useNavigate, useParams } from "react-router-dom";
import axios from "axios";
import toast from "react-hot-toast";
import {
  ArrowLeftIcon,
  PencilSquareIcon,
  UsersIcon,
  BellAlertIcon,
  CalendarDaysIcon,
  ShoppingCartIcon,
  CheckCircleIcon,
  ExclamationTriangleIcon,
  BanknotesIcon,
  PhoneIcon,
  EnvelopeIcon,
  MapPinIcon,
  IdentificationIcon,
  CubeIcon,
  DocumentTextIcon,
} from "@heroicons/react/24/solid";
import { GlassCard } from "@/components/Glass.jsx";
import RegularRefillReminderModal from "@/components/RegularRefillReminderModal.jsx";
import { usePermissions, Guard } from "@/api/usePermissions.js";
import PageSkeleton from "@/components/PageSkeleton.jsx";

export default function ShowCustomer() {
  const { id } = useParams();
  const navigate = useNavigate();

  const [customer, setCustomer] = useState(null);
  const [creditSummary, setCreditSummary] = useState(null);
  const [loading, setLoading] = useState(true);
  const [fetchErr, setFetchErr] = useState(null);
  const [reminderOpen, setReminderOpen] = useState(false);
  const [advancing, setAdvancing] = useState(false);

  const { loading: permsLoading, canFor } = usePermissions();
  const can = useMemo(
    () =>
      (typeof canFor === "function" ? canFor("customer") : null) ?? {
        view: false,
        create: false,
        update: false,
        delete: false,
      },
    [canFor]
  );

  const canSaleCreate = useMemo(
    () =>
      typeof canFor === "function"
        ? Boolean(canFor("sale-invoice")?.create)
        : true,
    [canFor]
  );

  const fetchCustomerDetails = useCallback(async () => {
    try {
      setLoading(true);
      const [custRes, creditRes] = await Promise.all([
        axios.get(`/api/customers/${id}`),
        axios.get(`/api/customers/${id}/credit-summary`).catch(() => ({ data: null })),
      ]);
      setCustomer(custRes.data);
      setCreditSummary(creditRes?.data || null);
      setFetchErr(null);
    } catch (err) {
      if (err?.response?.status === 404) {
        setFetchErr("Customer not found.");
      } else {
        setFetchErr("Failed to load customer details.");
      }
    } finally {
      setLoading(false);
    }
  }, [id]);

  useEffect(() => {
    document.title = customer?.name
      ? `${customer.name} - Customer Details - Karobar App`
      : "Customer Details - Karobar App";
  }, [customer?.name]);

  useEffect(() => {
    if (permsLoading || !can.view) return;
    fetchCustomerDetails();
  }, [permsLoading, can.view, fetchCustomerDetails]);

  const handleAdvanceCycle = async () => {
    if (!can.update || !customer) return;
    setAdvancing(true);
    try {
      const { data } = await axios.post(
        `/api/customers/${customer.id}/advance-refill-cycle`
      );
      toast.success(data.message || "Next refill collection date advanced!");
      if (data.customer) {
        setCustomer(data.customer);
      } else {
        fetchCustomerDetails();
      }
    } catch (err) {
      toast.error(
        err?.response?.data?.message || "Failed to advance refill cycle"
      );
    } finally {
      setAdvancing(false);
    }
  };

  const regularItems = useMemo(
    () => customer?.regular_items || customer?.regularItems || [],
    [customer]
  );

  const handleShiftToRetailInvoice = () => {
    if (!regularItems.length) {
      toast.error("This customer has no regular medicines/products to shift.");
      return;
    }
    navigate(`/sale-invoices/create/retail?regular_customer_id=${customer.id}`);
  };

  const estimatedTotalValue = useMemo(() => {
    return regularItems.reduce((sum, it) => {
      const prod = it.product || {};
      const packSize = Math.max(1, Number(prod.pack_size || 1));
      const totalUnits =
        Number(it.unit_quantity || 0) > 0
          ? Number(it.unit_quantity)
          : Math.max(1, Math.round(Number(it.pack_quantity || 0) * packSize));
      const unitPrice =
        Number(prod.unit_sale_price || 0) ||
        (Number(prod.pack_sale_price || 0) > 0
          ? Number(prod.pack_sale_price) / packSize
          : 0);
      return sum + totalUnits * unitPrice;
    }, 0);
  }, [regularItems]);

  if (permsLoading || loading) return <PageSkeleton />;
  if (!can.view) {
    return (
      <div className="p-6 text-sm text-gray-700">
        You don&apos;t have permission to view customers.
      </div>
    );
  }
  if (fetchErr) return <div className="p-6 text-red-600">{fetchErr}</div>;
  if (!customer) return null;

  const status = customer.credit_status || "active";
  const statusBadge =
    status === "blocked"
      ? "bg-rose-100 text-rose-700 dark:bg-rose-900/40 dark:text-rose-300 border-rose-200"
      : status === "on_hold"
      ? "bg-amber-100 text-amber-700 dark:bg-amber-900/40 dark:text-amber-300 border-amber-200"
      : "bg-emerald-100 text-emerald-700 dark:bg-emerald-900/40 dark:text-emerald-300 border-emerald-200";

  const cycleLabel =
    customer.refill_cycle === "weekly"
      ? "Weekly (Every 7 Days)"
      : customer.refill_cycle === "biweekly"
      ? "Bi-Weekly (Every 14 Days)"
      : customer.refill_cycle === "custom"
      ? `Custom (Every ${customer.refill_custom_days || 15} Days)`
      : "Monthly (Every 30 Days)";

  const daysLeft = customer.days_until_refill;

  return (
    <div className="product-form-page space-y-4">
      {/* Header Panel */}
      <div className="products-panel">
        <div className="products-heading">
          <div className="flex items-center gap-3 min-w-0">
            <div className="products-identity-icon">
              <UsersIcon className="w-6 h-6" />
            </div>
            <div className="min-w-0">
              <div className="flex items-center gap-2.5 flex-wrap">
                <h1 className="products-title">{customer.name}</h1>
                <span
                  className={`inline-block px-2.5 py-0.5 text-[11px] font-bold rounded-full border ${statusBadge}`}
                >
                  {status === "on_hold" ? "ON HOLD" : status.toUpperCase()}
                </span>
                {customer.is_regular && (
                  <span className="inline-flex items-center gap-1 px-2.5 py-0.5 rounded-full text-[11px] font-bold bg-emerald-100 text-emerald-800 dark:bg-emerald-900/50 dark:text-emerald-300 border border-emerald-200 dark:border-emerald-700">
                    <BellAlertIcon className="w-3.5 h-3.5" />
                    <span>Regular Customer</span>
                  </span>
                )}
              </div>
              <p className="products-subtitle">
                Customer Profile, Credit Standing & Regular Medicine / Product Refill Schedule
              </p>
            </div>
          </div>

          <div className="flex flex-wrap items-center gap-2">
            <Link to="/customers" className="products-action theme-btn-secondary">
              <ArrowLeftIcon className="w-3.5 h-3.5" />
              <span>Back to Customers</span>
            </Link>

            {regularItems.length > 0 && canSaleCreate && (
              <button
                type="button"
                onClick={handleShiftToRetailInvoice}
                className="products-action bg-indigo-600 hover:bg-indigo-700 text-white border-indigo-600 shadow-xs cursor-pointer"
                title="Open Retail Sale Invoice pre-filled with all regular medicines/products for this customer"
              >
                <ShoppingCartIcon className="w-4 h-4" />
                <span>Shift to Retail Sale Invoice ({regularItems.length})</span>
              </button>
            )}

            {customer.is_regular && (
              <>
                <button
                  type="button"
                  onClick={() => setReminderOpen(true)}
                  className="products-action bg-emerald-600 hover:bg-emerald-700 text-white border-emerald-600 cursor-pointer"
                >
                  <BellAlertIcon className="w-4 h-4" />
                  <span>Send WhatsApp Reminder</span>
                </button>

                <Guard when={can.update}>
                  <button
                    type="button"
                    disabled={advancing}
                    onClick={handleAdvanceCycle}
                    className="products-action bg-teal-600 hover:bg-teal-700 text-white border-teal-600 cursor-pointer disabled:opacity-50"
                    title="Mark medicines collected and advance next due date by 1 cycle"
                  >
                    <CalendarDaysIcon className="w-4 h-4" />
                    <span>
                      {advancing ? "Advancing..." : "Mark Collected & Advance"}
                    </span>
                  </button>
                </Guard>
              </>
            )}

            <Guard when={can.update}>
              <Link
                to={`/customers/${customer.id}/edit`}
                className="products-action products-action-primary theme-btn-primary"
              >
                <PencilSquareIcon className="w-4 h-4" />
                <span>Edit Customer</span>
              </Link>
            </Guard>
          </div>
        </div>
      </div>

      {/* Summary Cards Grid */}
      <div className="grid grid-cols-1 lg:grid-cols-3 gap-4">
        {/* Card 1: Contact & Tax Info */}
        <GlassCard className="p-5 space-y-3">
          <div className="flex items-center justify-between border-b border-slate-200/70 dark:border-slate-700 pb-2.5">
            <h2 className="text-xs font-bold uppercase tracking-wider text-slate-600 dark:text-slate-300 flex items-center gap-1.5">
              <IdentificationIcon className="w-4 h-4 text-blue-500" />
              <span>Contact & Tax Information</span>
            </h2>
            <span className="text-[11px] text-slate-400">ID #{customer.id}</span>
          </div>

          <dl className="space-y-2.5 text-xs">
            <div className="flex items-start justify-between gap-2">
              <dt className="text-slate-500 dark:text-slate-400 flex items-center gap-1.5">
                <PhoneIcon className="w-3.5 h-3.5 text-slate-400" />
                <span>Phone / WhatsApp</span>
              </dt>
              <dd className="font-semibold text-slate-900 dark:text-slate-100">
                {customer.phone || "—"}
              </dd>
            </div>

            <div className="flex items-start justify-between gap-2">
              <dt className="text-slate-500 dark:text-slate-400 flex items-center gap-1.5">
                <EnvelopeIcon className="w-3.5 h-3.5 text-slate-400" />
                <span>Email</span>
              </dt>
              <dd className="font-medium text-slate-800 dark:text-slate-200">
                {customer.email || "—"}
              </dd>
            </div>

            <div className="flex items-start justify-between gap-2">
              <dt className="text-slate-500 dark:text-slate-400 flex items-center gap-1.5 shrink-0">
                <MapPinIcon className="w-3.5 h-3.5 text-slate-400" />
                <span>Address</span>
              </dt>
              <dd className="font-medium text-slate-800 dark:text-slate-200 text-right">
                {customer.address || "—"}
              </dd>
            </div>

            <div className="flex items-center justify-between gap-2 pt-2 border-t border-slate-100 dark:border-slate-700/60">
              <dt className="text-slate-500 dark:text-slate-400">Tax Status</dt>
              <dd className="font-semibold uppercase text-slate-800 dark:text-slate-200">
                {customer.tax_status || "unregistered"}
              </dd>
            </div>

            <div className="flex items-center justify-between gap-2">
              <dt className="text-slate-500 dark:text-slate-400">
                NTN / STRN / CNIC
              </dt>
              <dd className="font-medium text-slate-800 dark:text-slate-200">
                {customer.tax_number || "—"}
              </dd>
            </div>
          </dl>
        </GlassCard>

        {/* Card 2: Credit & Ledger Standing */}
        <GlassCard className="p-5 space-y-3">
          <div className="flex items-center justify-between border-b border-slate-200/70 dark:border-slate-700 pb-2.5">
            <h2 className="text-xs font-bold uppercase tracking-wider text-slate-600 dark:text-slate-300 flex items-center gap-1.5">
              <BanknotesIcon className="w-4 h-4 text-emerald-500" />
              <span>Credit & Ledger Standing</span>
            </h2>
            <Link
              to={`/customer-ledger?customer_id=${customer.id}`}
              className="text-[11px] font-semibold text-blue-600 dark:text-blue-400 hover:underline flex items-center gap-1"
            >
              <DocumentTextIcon className="w-3.5 h-3.5" />
              <span>Open Ledger</span>
            </Link>
          </div>

          <dl className="space-y-2.5 text-xs">
            <div className="flex items-center justify-between">
              <dt className="text-slate-500 dark:text-slate-400">
                Net Receivable Balance
              </dt>
              <dd className="text-sm font-bold text-slate-900 dark:text-white">
                Rs.{" "}
                {Number(creditSummary?.net_balance ?? 0).toLocaleString()}
              </dd>
            </div>

            <div className="flex items-center justify-between">
              <dt className="text-slate-500 dark:text-slate-400">Credit Limit</dt>
              <dd className="font-semibold text-slate-800 dark:text-slate-200">
                {customer.credit_limit && Number(customer.credit_limit) > 0
                  ? `Rs. ${Number(customer.credit_limit).toLocaleString()}`
                  : "Unlimited"}
              </dd>
            </div>

            <div className="flex items-center justify-between">
              <dt className="text-slate-500 dark:text-slate-400">
                Available Credit
              </dt>
              <dd className="font-semibold text-emerald-600 dark:text-emerald-400">
                {creditSummary?.available_credit !== null &&
                creditSummary?.available_credit !== undefined
                  ? `Rs. ${Number(creditSummary.available_credit).toLocaleString()}`
                  : "Unlimited"}
              </dd>
            </div>

            <div className="flex items-center justify-between pt-2 border-t border-slate-100 dark:border-slate-700/60">
              <dt className="text-slate-500 dark:text-slate-400">Credit Days</dt>
              <dd className="font-semibold text-slate-800 dark:text-slate-200">
                {customer.credit_days ?? 30} Days
              </dd>
            </div>

            <div className="flex items-center justify-between">
              <dt className="text-slate-500 dark:text-slate-400">
                Overdue Amount
              </dt>
              <dd
                className={`font-semibold ${
                  Number(creditSummary?.total_overdue || 0) > 0
                    ? "text-rose-600 dark:text-rose-400"
                    : "text-slate-600 dark:text-slate-400"
                }`}
              >
                Rs. {Number(creditSummary?.total_overdue || 0).toLocaleString()}{" "}
                ({creditSummary?.overdue_invoices_count || 0} invoices)
              </dd>
            </div>
          </dl>
        </GlassCard>

        {/* Card 3: Regular Refill Reminder Schedule */}
        <GlassCard className="p-5 space-y-3">
          <div className="flex items-center justify-between border-b border-slate-200/70 dark:border-slate-700 pb-2.5">
            <h2 className="text-xs font-bold uppercase tracking-wider text-slate-600 dark:text-slate-300 flex items-center gap-1.5">
              <BellAlertIcon className="w-4 h-4 text-emerald-600" />
              <span>Regular Refill Schedule</span>
            </h2>
            {customer.is_regular ? (
              <span className="px-2 py-0.5 rounded-full text-[10px] font-bold bg-emerald-100 text-emerald-800 dark:bg-emerald-900/40 dark:text-emerald-300">
                ACTIVE
              </span>
            ) : (
              <span className="px-2 py-0.5 rounded-full text-[10px] font-semibold bg-slate-100 text-slate-600 dark:bg-slate-700 dark:text-slate-300">
                STANDARD
              </span>
            )}
          </div>

          {customer.is_regular ? (
            <dl className="space-y-2.5 text-xs">
              <div className="flex items-center justify-between">
                <dt className="text-slate-500 dark:text-slate-400">
                  Refill Cycle
                </dt>
                <dd className="font-semibold text-slate-900 dark:text-slate-100">
                  {cycleLabel}
                </dd>
              </div>

              <div className="flex items-center justify-between">
                <dt className="text-slate-500 dark:text-slate-400">
                  Next Collection Date
                </dt>
                <dd className="font-bold text-slate-900 dark:text-white flex items-center gap-1.5">
                  <span>
                    {customer.next_refill_date
                      ? String(customer.next_refill_date).slice(0, 10)
                      : "Not set"}
                  </span>
                  {daysLeft !== null && daysLeft !== undefined && (
                    <span
                      className={`px-2 py-0.5 rounded-full text-[10px] font-semibold ${
                        daysLeft < 0
                          ? "bg-rose-100 text-rose-700 dark:bg-rose-900/40 dark:text-rose-300"
                          : customer.is_due_for_reminder
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
                </dd>
              </div>

              <div className="flex items-center justify-between">
                <dt className="text-slate-500 dark:text-slate-400">
                  Prior Reminder Lead
                </dt>
                <dd className="font-medium text-slate-800 dark:text-slate-200">
                  {customer.reminder_lead_days ?? 2} Days Before Due Date
                </dd>
              </div>

              <div className="flex items-center justify-between">
                <dt className="text-slate-500 dark:text-slate-400">
                  WhatsApp Language
                </dt>
                <dd className="font-semibold uppercase text-slate-800 dark:text-slate-200">
                  {customer.reminder_language === "urdu"
                    ? "اردو (Urdu)"
                    : "English"}
                </dd>
              </div>

              <div className="flex items-center justify-between pt-2 border-t border-slate-100 dark:border-slate-700/60">
                <dt className="text-slate-500 dark:text-slate-400">
                  Last Reminded
                </dt>
                <dd className="font-medium text-slate-700 dark:text-slate-300">
                  {customer.last_refill_reminded_at
                    ? String(customer.last_refill_reminded_at).slice(0, 10)
                    : "Never"}
                </dd>
              </div>

              {customer.regular_notes && (
                <div className="pt-2 border-t border-slate-100 dark:border-slate-700/60">
                  <dt className="text-slate-500 dark:text-slate-400 mb-1">
                    Notes / Instructions
                  </dt>
                  <dd className="text-slate-800 dark:text-slate-200 bg-slate-50 dark:bg-slate-800/70 rounded-lg p-2 text-[11px]">
                    {customer.regular_notes}
                  </dd>
                </div>
              )}
            </dl>
          ) : (
            <div className="py-6 text-center space-y-2">
              <p className="text-xs text-slate-500 dark:text-slate-400">
                This customer is currently saved as a Standard Customer without a recurring medicine/product reminder schedule.
              </p>
              <Guard when={can.update}>
                <Link
                  to={`/customers/${customer.id}/edit`}
                  className="inline-flex items-center gap-1.5 text-xs font-semibold text-emerald-600 dark:text-emerald-400 hover:underline"
                >
                  <PencilSquareIcon className="w-3.5 h-3.5" />
                  <span>Enable Regular Customer Schedule</span>
                </Link>
              </Guard>
            </div>
          )}
        </GlassCard>
      </div>

      {/* Regular Medicines / Products Table Card */}
      <GlassCard className="p-5 space-y-4">
        <div className="flex flex-wrap items-center justify-between gap-3 border-b border-slate-200/70 dark:border-slate-700 pb-3">
          <div className="flex items-center gap-2.5">
            <div className="p-2 rounded-xl bg-emerald-600 text-white">
              <CubeIcon className="w-4 h-4" />
            </div>
            <div>
              <div className="flex items-center gap-2 flex-wrap">
                <h2 className="text-sm font-bold text-slate-900 dark:text-slate-100">
                  Customer&apos;s Regular Medicines / Products ({regularItems.length})
                </h2>
                {regularItems.length > 0 && (
                  <span
                    className={`inline-flex items-center gap-1 px-2.5 py-0.5 rounded-full text-[11px] font-semibold ${
                      customer.stock_ready !== false
                        ? "bg-emerald-100 text-emerald-800 dark:bg-emerald-900/40 dark:text-emerald-300"
                        : "bg-amber-100 text-amber-800 dark:bg-amber-900/40 dark:text-amber-300"
                    }`}
                  >
                    {customer.stock_ready !== false ? (
                      <>
                        <CheckCircleIcon className="w-3.5 h-3.5" />
                        <span>All Items In Stock</span>
                      </>
                    ) : (
                      <>
                        <ExclamationTriangleIcon className="w-3.5 h-3.5" />
                        <span>
                          {customer.out_of_stock_count} of {regularItems.length}{" "}
                          Low Stock
                        </span>
                      </>
                    )}
                  </span>
                )}
              </div>
              <p className="text-xs text-slate-500 dark:text-slate-400">
                Recurring medicines or products attached to this customer&apos;s profile
              </p>
            </div>
          </div>

          <div className="flex flex-wrap items-center gap-2">
            {regularItems.length > 0 && canSaleCreate && (
              <button
                type="button"
                onClick={handleShiftToRetailInvoice}
                className="h-9 px-4 rounded-xl text-xs font-semibold bg-indigo-600 hover:bg-indigo-700 text-white flex items-center gap-1.5 shadow-2xs cursor-pointer"
              >
                <ShoppingCartIcon className="w-4 h-4" />
                <span>Shift All Products to Retail Sale Invoice</span>
              </button>
            )}

            <Guard when={can.update}>
              <Link
                to={`/customers/${customer.id}/edit`}
                className="h-9 px-3.5 rounded-xl text-xs font-semibold border border-slate-200 dark:border-slate-700 text-slate-700 dark:text-slate-200 hover:bg-slate-100 dark:hover:bg-slate-800 flex items-center gap-1.5"
              >
                <PencilSquareIcon className="w-3.5 h-3.5" />
                <span>Manage Regular Products</span>
              </Link>
            </Guard>
          </div>
        </div>

        {regularItems.length === 0 ? (
          <div className="py-10 text-center text-xs text-slate-500 dark:text-slate-400">
            No regular medicines or products are currently listed for this customer.
          </div>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-xs border-collapse">
              <thead>
                <tr className="border-b border-slate-200 dark:border-slate-700 text-left uppercase text-[11px] text-slate-500 dark:text-slate-400 bg-slate-50/80 dark:bg-slate-800/60">
                  <th className="py-2.5 px-3 w-10 text-center">#</th>
                  <th className="py-2.5 px-3">Product</th>
                  <th className="py-2.5 px-3 text-center">Pack Size</th>
                  <th className="py-2.5 px-3 text-center">Pack Qty</th>
                  <th className="py-2.5 px-3 text-center">Unit Qty</th>
                  <th className="py-2.5 px-3 text-center">Available Stock</th>
                  <th className="py-2.5 px-3 text-center">Readiness</th>
                  <th className="py-2.5 px-3 text-right">Est. Retail Value</th>
                  <th className="py-2.5 px-3">Dosage / Note</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-200/60 dark:divide-slate-700/60">
                {regularItems.map((it, idx) => {
                  const prod = it.product || {};
                  const packSize = Math.max(1, Number(prod.pack_size || 1));
                  const totalUnits =
                    Number(it.unit_quantity || 0) > 0
                      ? Number(it.unit_quantity)
                      : Math.max(
                          1,
                          Math.round(Number(it.pack_quantity || 0) * packSize)
                        );
                  const packsCalc = Number((totalUnits / packSize).toFixed(2));
                  const onHand = Number(
                    it.on_hand_units ?? prod.quantity ?? 0
                  );
                  const inStock = onHand >= totalUnits;
                  const unitPrice =
                    Number(prod.unit_sale_price || 0) ||
                    (Number(prod.pack_sale_price || 0) > 0
                      ? Number(prod.pack_sale_price) / packSize
                      : 0);
                  const rowTotal = totalUnits * unitPrice;

                  return (
                    <tr
                      key={it.id || idx}
                      className="hover:bg-slate-50/80 dark:hover:bg-slate-800/40"
                    >
                      <td className="py-2.5 px-3 text-center font-semibold text-slate-400">
                        {idx + 1}
                      </td>
                      <td className="py-2.5 px-3">
                        <div className="font-semibold text-slate-900 dark:text-slate-100">
                          {prod.name || `Product #${it.product_id}`}
                        </div>
                        {prod.product_code && (
                          <div className="text-[11px] text-slate-400">
                            Code: {prod.product_code}
                          </div>
                        )}
                      </td>
                      <td className="py-2.5 px-3 text-center text-slate-600 dark:text-slate-300">
                        {packSize}
                      </td>
                      <td className="py-2.5 px-3 text-center font-bold text-slate-800 dark:text-slate-200">
                        {packsCalc}
                      </td>
                      <td className="py-2.5 px-3 text-center font-bold text-blue-600 dark:text-blue-400">
                        {totalUnits}
                      </td>
                      <td className="py-2.5 px-3 text-center font-mono text-slate-700 dark:text-slate-300">
                        {onHand}
                      </td>
                      <td className="py-2.5 px-3 text-center">
                        <span
                          className={`inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-[10px] font-semibold ${
                            inStock
                              ? "bg-emerald-100 text-emerald-800 dark:bg-emerald-900/40 dark:text-emerald-300"
                              : "bg-rose-100 text-rose-800 dark:bg-rose-900/40 dark:text-rose-300"
                          }`}
                        >
                          {inStock ? "Ready" : `Short by ${totalUnits - onHand}`}
                        </span>
                      </td>
                      <td className="py-2.5 px-3 text-right font-semibold text-slate-800 dark:text-slate-200">
                        Rs. {Math.round(rowTotal).toLocaleString()}
                      </td>
                      <td className="py-2.5 px-3 text-slate-600 dark:text-slate-300">
                        {it.dosage_notes || "—"}
                      </td>
                    </tr>
                  );
                })}
              </tbody>
              <tfoot>
                <tr className="border-t-2 border-slate-200 dark:border-slate-700 bg-slate-50/90 dark:bg-slate-800/80 font-bold text-slate-900 dark:text-white">
                  <td colSpan={7} className="py-2.5 px-3 text-right">
                    Estimated Total Retail Value:
                  </td>
                  <td className="py-2.5 px-3 text-right text-emerald-700 dark:text-emerald-400">
                    Rs. {Math.round(estimatedTotalValue).toLocaleString()}
                  </td>
                  <td />
                </tr>
              </tfoot>
            </table>
          </div>
        )}
      </GlassCard>

      <RegularRefillReminderModal
        open={reminderOpen}
        customer={customer}
        onClose={() => setReminderOpen(false)}
        onSent={(updatedCustomer) => {
          if (updatedCustomer) {
            setCustomer(updatedCustomer);
          } else {
            fetchCustomerDetails();
          }
        }}
      />
    </div>
  );
}

