// resources/js/pages/CashDrawer/index.jsx
// Full dedicated Cash Drawer page — session ledger, running balance, history, and drawer management.
import React, { useCallback, useEffect, useMemo, useRef, useState } from "react";
import axios from "axios";
import toast from "react-hot-toast";
import Select from "react-select";
import {
  BanknotesIcon,
  ArrowUpCircleIcon,
  ArrowDownCircleIcon,
  ArrowPathIcon,
  PlusCircleIcon,
  MinusCircleIcon,
  LockClosedIcon,
  LockOpenIcon,
  ChevronDownIcon,
  ChevronUpIcon,
  XMarkIcon,
  CheckCircleIcon,
  ExclamationTriangleIcon,
  ClockIcon,
  UserIcon,
  DocumentTextIcon,
  CurrencyDollarIcon,
  InformationCircleIcon,
  PrinterIcon,
  ShareIcon,
} from "@heroicons/react/24/solid";
import { useTheme } from "@/context/ThemeContext";
import { useCurrency } from "@/context/CurrencyContext";
import { getThemeButtonClasses } from "@/utils/buttonStyles";
import { GlassCard, GlassSectionHeader, GlassInput } from "@/components";
import { usePermissions } from "@/api/usePermissions.js";
import ShareDocumentModal from "@/components/ShareDocumentModal.jsx";
import { Link } from "react-router-dom";

// ─── Constants ────────────────────────────────────────────────────────────────

const CASH_IN_TYPES = ["cash_sale", "customer_payment", "purchase_return", "cash_in"];

const PKR_DENOMINATIONS = [
  { key: "5000", label: "Rs. 5,000", multiplier: 5000 },
  { key: "1000", label: "Rs. 1,000", multiplier: 1000 },
  { key: "500", label: "Rs. 500", multiplier: 500 },
  { key: "100", label: "Rs. 100", multiplier: 100 },
  { key: "50", label: "Rs. 50", multiplier: 50 },
  { key: "20", label: "Rs. 20", multiplier: 20 },
  { key: "10", label: "Rs. 10", multiplier: 10 },
  { key: "coins", label: "Coins (Rs. 1/2/5)", multiplier: 1 },
];

const TYPE_LABELS = {
  cash_sale: "Sale Invoice (Cash)",
  customer_payment: "Customer Udhar Receipt",
  purchase_return: "Supplier Return Refund",
  cash_in: "Manual Cash In",
  cash_purchase: "Purchase Invoice (Cash)",
  cash_return: "Sale Return Refund",
  supplier_payment: "Supplier Ledger Payment",
  cash_out: "Manual Cash Out",
  expense: "Operating Shop Expense",
};

const TYPE_ICONS = {
  cash_sale: ArrowUpCircleIcon,
  customer_payment: ArrowUpCircleIcon,
  purchase_return: ArrowUpCircleIcon,
  cash_in: PlusCircleIcon,
  cash_purchase: ArrowDownCircleIcon,
  cash_return: ArrowDownCircleIcon,
  supplier_payment: ArrowDownCircleIcon,
  cash_out: MinusCircleIcon,
  expense: MinusCircleIcon,
};

const MANUAL_TXN_OPTIONS = [
  { value: "cash_in", label: "Manual Cash In (Add to Drawer)" },
  { value: "cash_out", label: "Manual Cash Out (Remove from Drawer)" },
];

/** Format fallback reference label if backend enrichment is not present */
function resolveTxnReference(txn) {
  if (txn.reference_label) {
    return {
      label: txn.reference_label,
      party: txn.party_name || null,
      url: txn.reference_url || null,
      category: txn.category_label || null,
    };
  }
  const rt = String(txn.reference_type || "");
  const id = txn.reference_id;
  if (!rt || rt === "manual") {
    return { label: "Manual Entry", party: txn.user?.name ? `By ${txn.user.name}` : null, url: null, category: null };
  }
  if (rt === "sale_invoice" || rt.endsWith("SaleInvoice")) {
    return { label: `SI-#${id}`, party: "Sale Invoice", url: id ? `/sale-invoices/${id}` : null, category: null };
  }
  if (rt === "purchase_invoice" || rt.endsWith("PurchaseInvoice")) {
    return { label: `PI-#${id}`, party: "Purchase Invoice", url: id ? `/purchase-invoices/${id}` : null, category: null };
  }
  if (rt === "sale_return" || rt.endsWith("SaleReturn")) {
    return { label: `SR-#${id}`, party: "Sale Return", url: id ? `/sale-returns/${id}` : null, category: null };
  }
  if (rt === "purchase_return" || rt.endsWith("PurchaseReturn")) {
    return { label: `PR-#${id}`, party: "Purchase Return", url: id ? `/purchase-returns/${id}` : null, category: null };
  }
  if (rt === "payment" || rt.endsWith("Payment")) {
    return { label: `PMT-#${id}`, party: "Ledger Payment", url: txn.type === "customer_payment" ? "/customer-ledger" : "/supplier-ledger", category: null };
  }
  if (rt === "expense" || rt.endsWith("Expense")) {
    return { label: `EXP-#${id}`, party: "Shop Expense", url: "/expenses", category: null };
  }
  if (rt === "employee_advance" || rt.endsWith("EmployeeAdvance")) {
    return { label: `ADV-#${id}`, party: "Staff Advance", url: "/hr-payroll?tab=advances", category: null };
  }
  if (rt === "account_transfer") {
    return { label: id ? `TRF-#${id}` : "Transfer", party: "Treasury Transfer", url: "/accounts", category: null };
  }
  const shortType = rt.includes("\\") ? rt.split("\\").pop() : rt;
  return { label: id ? `${shortType} #${id}` : shortType, party: null, url: null, category: null };
}

// ─── Helpers ──────────────────────────────────────────────────────────────────

function fmtDateTime(dt) {
  if (!dt) return "—";
  return new Date(dt).toLocaleString("en-PK", {
    day: "2-digit",
    month: "short",
    year: "numeric",
    hour: "2-digit",
    minute: "2-digit",
    hour12: true,
  });
}

function fmtDate(dt) {
  if (!dt) return "—";
  return new Date(dt).toLocaleDateString("en-PK", {
    day: "2-digit",
    month: "short",
    year: "numeric",
  });
}

/** Sort transactions strictly in chronological order (created_at ASC, id ASC) and attach running `balance_after`. */
function attachRunningBalance(transactions, openingBalance) {
  const sorted = [...(transactions || [])].sort((a, b) => {
    const tA = a.created_at ? new Date(a.created_at).getTime() : 0;
    const tB = b.created_at ? new Date(b.created_at).getTime() : 0;
    if (tA !== tB) return tA - tB;
    return (Number(a.id) || 0) - (Number(b.id) || 0);
  });
  let running = parseFloat(openingBalance) || 0;
  return sorted.map((txn) => {
    const amt = parseFloat(txn.amount) || 0;
    if (CASH_IN_TYPES.includes(txn.type)) {
      running += amt;
    } else {
      running -= amt;
    }
    return { ...txn, balance_after: running };
  });
}

// ─── Sub-components ───────────────────────────────────────────────────────────

/** KPI card used in the 4-grid summary row. */
function KpiCard({ label, value, sub, color = "text-slate-700 dark:text-slate-200", icon: Icon }) {
  return (
    <GlassCard className="p-4 flex flex-col gap-1 min-w-0">
      <div className="flex items-center gap-2 text-xs font-medium text-slate-500 dark:text-slate-400 uppercase tracking-wide">
        {Icon && <Icon className="w-4 h-4 shrink-0" />}
        <span className="truncate">{label}</span>
      </div>
      <div className={`text-lg sm:text-2xl font-bold truncate ${color}`}>{value}</div>
      {sub && <div className="text-xs text-slate-400 truncate">{sub}</div>}
    </GlassCard>
  );
}

/** A single transaction row in the ledger table. */
function TxnRow({ txn, index, formatCurrency, isDark }) {
  const isCashIn = CASH_IN_TYPES.includes(txn.type);
  const Icon = TYPE_ICONS[txn.type] || DocumentTextIcon;
  const label = TYPE_LABELS[txn.type] || txn.type;
  const refInfo = resolveTxnReference(txn);

  return (
    <tr className={`border-b transition-colors ${isDark ? "border-slate-700 hover:bg-slate-700/40" : "border-slate-100 hover:bg-slate-50"}`}>
      <td className="px-4 py-3 text-xs text-slate-500 text-center">{index}</td>
      <td className="px-4 py-3 text-xs text-slate-500 whitespace-nowrap">{fmtDateTime(txn.created_at)}</td>
      <td className="px-4 py-3">
        <div className="flex flex-col gap-0.5">
          <div className="flex items-center gap-2">
            <Icon className={`w-4 h-4 flex-shrink-0 ${isCashIn ? "text-emerald-500" : "text-red-500"}`} />
            <span className={`text-sm font-medium ${isCashIn ? "text-emerald-600 dark:text-emerald-400" : "text-red-600 dark:text-red-400"}`}>
              {label}
            </span>
          </div>
          {refInfo.category && (
            <span className="text-[11px] text-slate-400 dark:text-slate-500 pl-6">
              {refInfo.category}
            </span>
          )}
        </div>
      </td>
      <td className="px-4 py-3 text-sm text-slate-600 dark:text-slate-300">
        {txn.notes || refInfo.category || "—"}
      </td>
      <td className="px-4 py-3 text-xs">
        <div className="flex flex-col items-start gap-0.5">
          {refInfo.url ? (
            <Link
              to={refInfo.url}
              className="inline-flex items-center gap-1 px-2 py-0.5 rounded-md font-semibold bg-blue-50 text-blue-700 hover:bg-blue-100 dark:bg-blue-900/30 dark:text-blue-300 dark:hover:bg-blue-900/50 transition-colors"
              title={`Open ${refInfo.label}`}
            >
              {refInfo.label} ↗
            </Link>
          ) : (
            <span className="px-2 py-0.5 rounded-md font-medium bg-slate-100 dark:bg-slate-700 text-slate-600 dark:text-slate-300">
              {refInfo.label}
            </span>
          )}
          {refInfo.party && (
            <span className="text-[11px] font-medium text-slate-500 dark:text-slate-400 truncate max-w-[160px]" title={refInfo.party}>
              {refInfo.party}
            </span>
          )}
        </div>
      </td>
      <td className="px-4 py-3 text-right font-semibold text-emerald-600 dark:text-emerald-400">
        {isCashIn ? `+${formatCurrency(txn.amount)}` : ""}
      </td>
      <td className="px-4 py-3 text-right font-semibold text-red-600 dark:text-red-400">
        {!isCashIn ? `−${formatCurrency(txn.amount)}` : ""}
      </td>
      <td className="px-4 py-3 text-right font-bold text-slate-700 dark:text-slate-200">
        {formatCurrency(txn.balance_after)}
      </td>
      <td className="px-4 py-3 text-xs text-slate-400">
        {txn.user?.name || "—"}
      </td>
    </tr>
  );
}

/** Inline ledger panel for a single session (used both in current and history). */
function SessionLedger({ session, summary, transactions, formatCurrency, isDark, activeCategoryFilter = null }) {
  if (!session) return null;

  const enriched = useMemo(
    () => attachRunningBalance(transactions || [], session.opening_balance),
    [transactions, session.opening_balance]
  );

  const visibleTxns = useMemo(() => {
    if (!activeCategoryFilter) return enriched;
    return enriched.filter((t) => {
      const rt = String(t.reference_type || "");
      const isExpense = t.type === "expense" || (t.type === "cash_out" && (rt.endsWith("Expense") || rt === "expense"));
      const isAdvance = t.type === "cash_out" && (rt.endsWith("EmployeeAdvance") || rt === "employee_advance");
      if (activeCategoryFilter === "expense") return isExpense;
      if (activeCategoryFilter === "staff_advance") return isAdvance;
      if (activeCategoryFilter === "cash_out") return t.type === "cash_out" && !isExpense && !isAdvance;
      return t.type === activeCategoryFilter;
    });
  }, [enriched, activeCategoryFilter]);

  const isClosed = session.status === "closed";
  const diff = isClosed
    ? parseFloat(session.closing_balance_actual) - parseFloat(session.closing_balance_expected)
    : null;

  return (
    <div className="overflow-x-auto">
      <table className="w-full text-sm min-w-[900px]">
        <thead>
          <tr className={`text-xs uppercase tracking-wide ${isDark ? "bg-slate-800 text-slate-400" : "bg-slate-50 text-slate-500"}`}>
            <th className="px-4 py-3 text-center w-10">#</th>
            <th className="px-4 py-3 text-left">Time</th>
            <th className="px-4 py-3 text-left">Type & Category</th>
            <th className="px-4 py-3 text-left">Notes / Description</th>
            <th className="px-4 py-3 text-left">Document & Party</th>
            <th className="px-4 py-3 text-right">Cash In (+)</th>
            <th className="px-4 py-3 text-right">Cash Out (−)</th>
            <th className="px-4 py-3 text-right">Drawer Balance</th>
            <th className="px-4 py-3 text-left">By</th>
          </tr>
        </thead>
        <tbody>
          {/* Opening row */}
          <tr className={`border-b font-semibold ${isDark ? "border-slate-700 bg-slate-800/50 text-slate-300" : "border-slate-200 bg-blue-50 text-slate-700"}`}>
            <td className="px-4 py-3 text-center text-xs text-slate-400">—</td>
            <td className="px-4 py-3 text-xs">{fmtDateTime(session.opened_at)}</td>
            <td className="px-4 py-3" colSpan={3}>
              <div className="flex items-center gap-2">
                <LockOpenIcon className="w-4 h-4 text-blue-500" />
                <span className="text-blue-600 dark:text-blue-400">Drawer Opened (Initial Float)</span>
                {session.notes && (
                  <span className="text-xs font-normal text-slate-500 dark:text-slate-400">— {session.notes}</span>
                )}
              </div>
            </td>
            <td className="px-4 py-3" />
            <td className="px-4 py-3" />
            <td className="px-4 py-3 text-right font-bold">{formatCurrency(session.opening_balance)}</td>
            <td className="px-4 py-3 text-xs text-slate-400">{session.user?.name || session.opened_by?.name || "—"}</td>
          </tr>

          {/* Transaction rows */}
          {visibleTxns.length === 0 ? (
            <tr>
              <td colSpan={9} className="px-4 py-8 text-center text-slate-400 text-sm">
                {activeCategoryFilter
                  ? "No transactions match the selected category filter in this shift."
                  : "No transactions recorded in this session yet."}
              </td>
            </tr>
          ) : (
            visibleTxns.map((txn, i) => (
              <TxnRow
                key={txn.id}
                txn={txn}
                index={i + 1}
                formatCurrency={formatCurrency}
                isDark={isDark}
              />
            ))
          )}

          {/* Closing row (only for closed sessions) */}
          {isClosed && (
            <tr className={`border-t-2 font-bold ${isDark ? "border-slate-600 bg-slate-800/60 text-slate-200" : "border-slate-300 bg-amber-50 text-slate-800"}`}>
              <td className="px-4 py-3 text-center text-xs text-slate-400">—</td>
              <td className="px-4 py-3 text-xs">{fmtDateTime(session.closed_at)}</td>
              <td className="px-4 py-3" colSpan={3}>
                <div className="flex items-center gap-2">
                  <LockClosedIcon className="w-4 h-4 text-amber-500" />
                  <span className="text-amber-600 dark:text-amber-400">Drawer Closed</span>
                  {diff !== null && (
                    <span className={`ml-2 text-xs px-2 py-0.5 rounded-full ${diff < 0 ? "bg-red-100 text-red-700 dark:bg-red-900/40 dark:text-red-300" : diff > 0 ? "bg-emerald-100 text-emerald-700 dark:bg-emerald-900/40 dark:text-emerald-300" : "bg-slate-100 text-slate-600 dark:bg-slate-700 dark:text-slate-400"}`}>
                      {diff === 0 ? "Balanced" : diff > 0 ? `Surplus ${formatCurrency(Math.abs(diff))}` : `Short ${formatCurrency(Math.abs(diff))}`}
                    </span>
                  )}
                </div>
              </td>
              <td className="px-4 py-3 text-right text-xs">
                <div className="flex flex-col items-end gap-0.5">
                  <span className="text-slate-500">Expected:</span>
                  <span className="text-slate-500">Actual:</span>
                  <span className="text-slate-500">Diff:</span>
                </div>
              </td>
              <td className="px-4 py-3" />
              <td className="px-4 py-3 text-right">
                <div className="flex flex-col gap-0.5">
                  <span>{formatCurrency(session.closing_balance_expected)}</span>
                  <span className={isClosed ? (diff >= 0 ? "text-emerald-600 dark:text-emerald-400" : "text-red-600 dark:text-red-400") : ""}>
                    {formatCurrency(session.closing_balance_actual)}
                  </span>
                  <span className={diff < 0 ? "text-red-500" : diff > 0 ? "text-emerald-500" : "text-slate-400"}>
                    {diff !== null ? (diff >= 0 ? `+${formatCurrency(diff)}` : `−${formatCurrency(Math.abs(diff))}`) : "—"}
                  </span>
                </div>
              </td>
              <td className="px-4 py-3 text-xs text-slate-400">{session.closed_by?.name || session.user?.name || "—"}</td>
            </tr>
          )}
        </tbody>
      </table>
    </div>
  );
}

/** Collapsible PKR Denomination Note & Coin Calculator */
function DenominationCalculator({ onApplyTotal, formatCurrency, isDark }) {
  const [open, setOpen] = useState(false);
  const [counts, setCounts] = useState({});

  const totalCounted = useMemo(() => {
    return PKR_DENOMINATIONS.reduce((sum, d) => {
      const qty = Math.max(parseFloat(counts[d.key]) || 0, 0);
      return sum + qty * d.multiplier;
    }, 0);
  }, [counts]);

  function handleChange(key, val) {
    const next = { ...counts, [key]: val };
    setCounts(next);
    const nextTotal = PKR_DENOMINATIONS.reduce((sum, d) => {
      const qty = Math.max(parseFloat(next[d.key]) || 0, 0);
      return sum + qty * d.multiplier;
    }, 0);
    onApplyTotal(String(nextTotal));
  }

  return (
    <div className={`rounded-xl border ${isDark ? "border-slate-700 bg-slate-800/50" : "border-slate-200 bg-slate-50/70"}`}>
      <button
        type="button"
        onClick={() => setOpen((v) => !v)}
        className="w-full flex items-center justify-between px-3.5 py-2.5 text-xs font-semibold text-blue-600 dark:text-blue-400 hover:opacity-90"
      >
        <span className="flex items-center gap-1.5">
          <BanknotesIcon className="w-4 h-4" />
          PKR Note & Coin Denomination Calculator {totalCounted > 0 ? `(${formatCurrency(totalCounted)})` : ""}
        </span>
        {open ? <ChevronUpIcon className="w-4 h-4" /> : <ChevronDownIcon className="w-4 h-4" />}
      </button>
      {open && (
        <div className="px-3.5 pb-3.5 pt-1 border-t border-slate-200 dark:border-slate-700 space-y-2">
          <p className="text-[11px] text-slate-500 dark:text-slate-400">
            Enter note counts below to automatically calculate your physical cash total:
          </p>
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
            {PKR_DENOMINATIONS.map((d) => {
              const qty = Math.max(parseFloat(counts[d.key]) || 0, 0);
              const sub = qty * d.multiplier;
              return (
                <div key={d.key} className={`flex items-center justify-between gap-1.5 px-2.5 py-1.5 rounded-lg border ${isDark ? "border-slate-700 bg-slate-900/60" : "border-slate-200 bg-white"}`}>
                  <span className="text-xs font-semibold text-slate-700 dark:text-slate-200 whitespace-nowrap">{d.label}</span>
                  <div className="flex items-center gap-1">
                    <span className="text-[10px] text-slate-400">×</span>
                    <input
                      type="number"
                      min="0"
                      step="1"
                      placeholder="0"
                      value={counts[d.key] || ""}
                      onChange={(e) => handleChange(d.key, e.target.value)}
                      className={`w-14 px-1.5 py-0.5 text-right text-xs rounded border focus:outline-none focus:ring-1 focus:ring-blue-400 ${
                        isDark ? "bg-slate-800 border-slate-600 text-white" : "bg-slate-50 border-slate-300 text-slate-900"
                      }`}
                    />
                  </div>
                  {sub > 0 && (
                    <span className="text-[10px] font-mono font-semibold text-emerald-600 dark:text-emerald-400">
                      {sub.toLocaleString()}
                    </span>
                  )}
                </div>
              );
            })}
          </div>
          <div className="flex items-center justify-between pt-1 text-xs font-bold">
            <span className="text-slate-500">Counted Total:</span>
            <div className="flex items-center gap-2">
              <span className="text-emerald-600 dark:text-emerald-400">{formatCurrency(totalCounted)}</span>
              {totalCounted > 0 && (
                <button
                  type="button"
                  onClick={() => {
                    setCounts({});
                    onApplyTotal("0");
                  }}
                  className="text-[11px] font-medium text-red-500 hover:underline"
                >
                  Reset
                </button>
              )}
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

// ─── Modal: Open Drawer ────────────────────────────────────────────────────────

function OpenDrawerModal({ onClose, onSuccess, isDark, btnPrimary, btnSecondary, formatCurrency, suggestedFloat = null }) {
  const [openingBalance, setOpeningBalance] = useState(
    suggestedFloat !== null && suggestedFloat !== undefined ? String(suggestedFloat) : ""
  );
  const [notes, setNotes] = useState("");
  const [saving, setSaving] = useState(false);

  async function handleSubmit(e) {
    e.preventDefault();
    setSaving(true);
    try {
      await axios.post("/api/cash-drawer/open", {
        opening_balance: parseFloat(openingBalance) || 0,
        notes,
      });
      toast.success("Drawer opened successfully.");
      onSuccess();
    } catch (err) {
      toast.error(err?.response?.data?.message || "Failed to open drawer.");
    } finally {
      setSaving(false);
    }
  }

  return (
    <ModalBackdrop onClose={onClose}>
      <form onSubmit={handleSubmit} className="flex flex-col gap-4">
        <div className="flex items-center justify-between">
          <h2 className={`text-lg font-bold ${isDark ? "text-white" : "text-slate-800"}`}>
            Open Cash Drawer Shift
          </h2>
          <button type="button" onClick={onClose} className="text-slate-400 hover:text-slate-600">
            <XMarkIcon className="w-5 h-5" />
          </button>
        </div>
        <p className="text-sm text-slate-500 dark:text-slate-400">
          Enter the physical opening cash float in the counter drawer. All cash sales, customer receipts, refunds, and expenses during this shift will add to or deduct from this float.
        </p>
        {suggestedFloat !== null && suggestedFloat !== undefined && (
          <div className={`flex items-center justify-between px-3 py-2 rounded-lg border text-xs ${isDark ? "border-blue-800/60 bg-blue-950/30 text-blue-300" : "border-blue-200 bg-blue-50 text-blue-800"}`}>
            <span>Last closed shift actual cash: <strong>{formatCurrency(suggestedFloat)}</strong></span>
            <button
              type="button"
              onClick={() => setOpeningBalance(String(suggestedFloat))}
              className="px-2 py-1 rounded font-semibold bg-blue-600 text-white hover:bg-blue-500 transition-colors"
            >
              Use {formatCurrency(suggestedFloat)}
            </button>
          </div>
        )}
        <div>
          <label className="block text-sm font-medium text-slate-600 dark:text-slate-300 mb-1">
            Opening Float Amount (PKR)
          </label>
          <GlassInput
            type="number"
            min="0"
            step="0.01"
            placeholder="0.00"
            value={openingBalance}
            onChange={(e) => setOpeningBalance(e.target.value)}
            autoFocus
          />
        </div>
        <DenominationCalculator
          onApplyTotal={(val) => setOpeningBalance(val)}
          formatCurrency={formatCurrency}
          isDark={isDark}
        />
        <div>
          <label className="block text-sm font-medium text-slate-600 dark:text-slate-300 mb-1">
            Shift Notes (optional)
          </label>
          <textarea
            rows={2}
            placeholder="E.g. Morning float, shift handover..."
            value={notes}
            onChange={(e) => setNotes(e.target.value)}
            className={`w-full px-3 py-2 rounded-lg border text-sm resize-none focus:outline-none focus:ring-2 focus:ring-blue-400 ${
              isDark
                ? "bg-slate-800 border-slate-600 text-white placeholder-slate-500"
                : "bg-white border-slate-300 text-slate-800 placeholder-slate-400"
            }`}
          />
        </div>
        <div className="flex justify-end gap-2 pt-2">
          <button type="button" onClick={onClose} className={`px-4 py-2.5 text-sm font-medium ${btnSecondary.className}`} style={btnSecondary.style}>
            Cancel
          </button>
          <button type="submit" disabled={saving} className={`px-4 py-2.5 text-sm font-semibold disabled:opacity-60 ${btnPrimary.className}`} style={btnPrimary.style}>
            {saving ? "Opening…" : "Open Drawer"}
          </button>
        </div>
      </form>
    </ModalBackdrop>
  );
}

// ─── Modal: Cash In / Out ─────────────────────────────────────────────────────

function TransactionModal({ onClose, onSuccess, isDark, btnSecondary, btnDanger, btnPrimary, selectStyles, defaultType = "cash_in" }) {
  const defaultOption = MANUAL_TXN_OPTIONS.find(o => o.value === defaultType) || MANUAL_TXN_OPTIONS[0];
  const [txnType, setTxnType] = useState(defaultOption);
  const [amount, setAmount] = useState("");
  const [notes, setNotes] = useState("");
  const [saving, setSaving] = useState(false);

  async function handleSubmit(e) {
    e.preventDefault();
    if (!amount || parseFloat(amount) <= 0) {
      toast.error("Please enter a valid amount.");
      return;
    }
    if (!notes.trim()) {
      toast.error("Notes are required for manual transactions.");
      return;
    }
    setSaving(true);
    try {
      await axios.post("/api/cash-drawer/transaction", {
        type: txnType.value,
        amount: parseFloat(amount),
        notes,
      });
      toast.success(`${txnType.label} recorded.`);
      onSuccess();
    } catch (err) {
      toast.error(err?.response?.data?.message || "Transaction failed.");
    } finally {
      setSaving(false);
    }
  }

  const isCashIn = txnType?.value === "cash_in";
  const submitBtn = isCashIn ? btnPrimary : btnDanger;
  const SubmitIcon = isCashIn ? ArrowUpCircleIcon : ArrowDownCircleIcon;

  return (
    <ModalBackdrop onClose={onClose}>
      <form onSubmit={handleSubmit} className="flex flex-col gap-4">
        {/* Header strip */}
        <div className={`flex items-center justify-between -mx-4 sm:-mx-6 -mt-4 sm:-mt-6 px-4 sm:px-6 py-4 rounded-t-2xl ${isCashIn ? "bg-emerald-500" : "bg-red-500"}`}>
          <div className="flex items-center gap-3">
            {isCashIn
              ? <ArrowUpCircleIcon className="w-6 h-6 text-white" />
              : <ArrowDownCircleIcon className="w-6 h-6 text-white" />
            }
            <h2 className="text-base font-bold text-white">
              {isCashIn ? "Cash In" : "Cash Out"}
            </h2>
          </div>
          <button type="button" onClick={onClose} className="text-white/70 hover:text-white transition-colors">
            <XMarkIcon className="w-5 h-5" />
          </button>
        </div>

        <div>
          <label className="block text-sm font-medium text-slate-600 dark:text-slate-300 mb-1">
            Transaction Type
          </label>
          <Select
            options={MANUAL_TXN_OPTIONS}
            value={txnType}
            onChange={setTxnType}
            styles={selectStyles}
            isSearchable={false}
          />
        </div>

        <div>
          <label className="block text-sm font-medium text-slate-600 dark:text-slate-300 mb-1">
            Amount
          </label>
          <GlassInput
            type="number"
            min="0.01"
            step="0.01"
            placeholder="0.00"
            value={amount}
            onChange={(e) => setAmount(e.target.value)}
            autoFocus
          />
        </div>

        <div>
          <label className="block text-sm font-medium text-slate-600 dark:text-slate-300 mb-1">
            Notes / Reason <span className="text-red-500">*</span>
          </label>
          <textarea
            rows={3}
            required
            placeholder={isCashIn ? "E.g. Adding float for afternoon shift..." : "E.g. Petty cash for tea, stationery purchase..."}
            value={notes}
            onChange={(e) => setNotes(e.target.value)}
            className={`w-full px-3 py-2 rounded-lg border text-sm resize-none focus:outline-none focus:ring-2 ${isCashIn ? "focus:ring-emerald-400" : "focus:ring-red-400"} ${
              isDark
                ? "bg-slate-800 border-slate-600 text-white placeholder-slate-500"
                : "bg-white border-slate-300 text-slate-800 placeholder-slate-400"
            }`}
          />
        </div>

        <div className="flex justify-end gap-2 pt-1">
          <button type="button" onClick={onClose} className={`px-4 py-2.5 text-sm font-medium ${btnSecondary.className}`} style={btnSecondary.style}>
            Cancel
          </button>
          <button
            type="submit"
            disabled={saving}
            className={`flex items-center gap-2 px-4 py-2.5 text-sm font-semibold disabled:opacity-60 ${submitBtn.className}`}
            style={submitBtn.style}
          >
            <SubmitIcon className="w-4 h-4" />
            {saving ? "Saving…" : isCashIn ? "Confirm Cash In" : "Confirm Cash Out"}
          </button>
        </div>
      </form>
    </ModalBackdrop>
  );
}

// ─── Modal: Close Drawer ───────────────────────────────────────────────────────

function CloseDrawerModal({ expectedBalance, onClose, onSuccess, isDark, btnPrimary, btnSecondary, btnDanger, formatCurrency }) {
  const [actualBalance, setActualBalance] = useState("");
  const [notes, setNotes] = useState("");
  const [saving, setSaving] = useState(false);

  const diff = actualBalance !== ""
    ? parseFloat(actualBalance) - parseFloat(expectedBalance || 0)
    : null;

  async function handleSubmit(e) {
    e.preventDefault();
    setSaving(true);
    try {
      await axios.post("/api/cash-drawer/close", {
        closing_balance_actual: parseFloat(actualBalance) || 0,
        notes,
      });
      toast.success("Drawer closed and reconciled.");
      onSuccess();
    } catch (err) {
      toast.error(err?.response?.data?.message || "Failed to close drawer.");
    } finally {
      setSaving(false);
    }
  }

  return (
    <ModalBackdrop onClose={onClose}>
      <form onSubmit={handleSubmit} className="flex flex-col gap-4">
        <div className="flex items-center justify-between">
          <h2 className={`text-lg font-bold ${isDark ? "text-white" : "text-slate-800"}`}>
            Close & Reconcile Drawer
          </h2>
          <button type="button" onClick={onClose} className="text-slate-400 hover:text-slate-600">
            <XMarkIcon className="w-5 h-5" />
          </button>
        </div>

        {/* Expected summary */}
        <div className={`p-4 rounded-lg ${isDark ? "bg-slate-800" : "bg-slate-50"}`}>
          <div className="flex items-center justify-between mb-1">
            <span className="text-xs font-semibold uppercase tracking-wide text-slate-500">System Expected Cash in Drawer</span>
            <button
              type="button"
              onClick={() => setActualBalance(String(expectedBalance || 0))}
              className="text-xs font-semibold text-blue-600 dark:text-blue-400 hover:underline"
            >
              Match Expected
            </button>
          </div>
          <div className="text-3xl font-bold text-blue-600 dark:text-blue-400">{formatCurrency(expectedBalance)}</div>
          <div className="text-xs text-slate-400 mt-1">Formula: Opening Float + Cash Inflows − Cash Outflows</div>
        </div>

        <div>
          <label className="block text-sm font-medium text-slate-600 dark:text-slate-300 mb-1">
            Actual Physical Cash Count (PKR)
          </label>
          <GlassInput
            type="number"
            min="0"
            step="0.01"
            placeholder="Count physical cash in drawer..."
            value={actualBalance}
            onChange={(e) => setActualBalance(e.target.value)}
            autoFocus
          />
        </div>

        <DenominationCalculator
          onApplyTotal={(val) => setActualBalance(val)}
          formatCurrency={formatCurrency}
          isDark={isDark}
        />

        {/* Live difference indicator */}
        {diff !== null && (
          <div className={`flex items-center gap-2 p-3 rounded-lg text-sm font-semibold ${
            diff === 0
              ? "bg-emerald-50 dark:bg-emerald-900/20 text-emerald-700 dark:text-emerald-300"
              : diff > 0
                ? "bg-blue-50 dark:bg-blue-900/20 text-blue-700 dark:text-blue-300"
                : "bg-red-50 dark:bg-red-900/20 text-red-700 dark:text-red-300"
          }`}>
            {diff === 0 ? (
              <><CheckCircleIcon className="w-5 h-5" /> Exact Match — physical count matches system expected balance</>
            ) : diff > 0 ? (
              <><ExclamationTriangleIcon className="w-5 h-5" /> Cash Surplus of +{formatCurrency(Math.abs(diff))} (more physical cash than expected)</>
            ) : (
              <><ExclamationTriangleIcon className="w-5 h-5" /> Cash Shortage of −{formatCurrency(Math.abs(diff))} (less physical cash than expected)</>
            )}
          </div>
        )}

        <div>
          <label className="block text-sm font-medium text-slate-600 dark:text-slate-300 mb-1">
            Closing / Handover Notes (optional)
          </label>
          <textarea
            rows={2}
            placeholder="E.g. End of day, cash dropped to safe, shift handover..."
            value={notes}
            onChange={(e) => setNotes(e.target.value)}
            className={`w-full px-3 py-2 rounded-lg border text-sm resize-none focus:outline-none focus:ring-2 focus:ring-blue-400 ${
              isDark
                ? "bg-slate-800 border-slate-600 text-white placeholder-slate-500"
                : "bg-white border-slate-300 text-slate-800 placeholder-slate-400"
            }`}
          />
        </div>

        <div className="flex justify-end gap-2 pt-2">
          <button type="button" onClick={onClose} className={`px-4 py-2.5 text-sm font-medium ${btnSecondary.className}`} style={btnSecondary.style}>
            Cancel
          </button>
          <button
            type="submit"
            disabled={saving || actualBalance === ""}
            className={`flex items-center gap-2 px-4 py-2.5 text-sm font-semibold disabled:opacity-60 ${btnDanger.className}`}
            style={btnDanger.style}
          >
            <LockClosedIcon className="w-4 h-4" />
            {saving ? "Closing…" : "Close Drawer"}
          </button>
        </div>
      </form>
    </ModalBackdrop>
  );
}

// ─── Shared modal backdrop ─────────────────────────────────────────────────────

function ModalBackdrop({ onClose, children }) {
  // Close on Escape
  useEffect(() => {
    function onKey(e) { if (e.key === "Escape") onClose(); }
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [onClose]);

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 backdrop-blur-sm px-4"
      onClick={(e) => { if (e.target === e.currentTarget) onClose(); }}
    >
      <div className="bg-white dark:bg-slate-900 rounded-2xl shadow-2xl max-h-[90dvh] overflow-y-auto p-4 sm:p-6 w-full max-w-md">
        {children}
      </div>
    </div>
  );
}

// ─── History Row (expandable) ─────────────────────────────────────────────────

function HistoryRow({ session, formatCurrency, isDark, selectStyles, onOpenZReport }) {
  const [expanded, setExpanded] = useState(false);
  const [detail, setDetail] = useState(null);
  const [loading, setLoading] = useState(false);

  async function toggleExpand() {
    if (!expanded && !detail) {
      setLoading(true);
      try {
        const { data } = await axios.get(`/api/cash-drawer/session/${session.id}`);
        setDetail(data);
      } catch {
        toast.error("Failed to load session detail.");
      } finally {
        setLoading(false);
      }
    }
    setExpanded((v) => !v);
  }

  const isClosed = session.status === "closed";
  const diff = isClosed
    ? parseFloat(session.closing_balance_actual) - parseFloat(session.closing_balance_expected)
    : null;

  return (
    <>
      <tr
        className={`border-b cursor-pointer transition-colors ${isDark ? "border-slate-700 hover:bg-slate-700/40" : "border-slate-100 hover:bg-slate-50"} ${expanded ? (isDark ? "bg-slate-700/30" : "bg-blue-50/50") : ""}`}
        onClick={toggleExpand}
      >
        <td className="px-4 py-3 text-xs text-slate-400 font-mono">#{session.id}</td>
        <td className="px-4 py-3 text-sm text-slate-600 dark:text-slate-300">{fmtDate(session.opened_at)}</td>
        <td className="px-4 py-3 text-xs text-slate-500">{session.user?.name || session.opened_by?.name || "—"}</td>
        <td className="px-4 py-3 text-right text-sm font-medium text-slate-700 dark:text-slate-200">
          {formatCurrency(session.opening_balance)}
        </td>
        <td className="px-4 py-3 text-right text-sm font-semibold text-emerald-600 dark:text-emerald-400">
          {formatCurrency(session.total_cash_in ?? 0)}
        </td>
        <td className="px-4 py-3 text-right text-sm font-semibold text-red-600 dark:text-red-400">
          {formatCurrency(session.total_cash_out ?? 0)}
        </td>
        <td className="px-4 py-3 text-right text-sm font-medium text-slate-700 dark:text-slate-200">
          {formatCurrency(session.closing_balance_expected ?? 0)}
        </td>
        <td className="px-4 py-3 text-right text-sm font-medium text-slate-700 dark:text-slate-200">
          {isClosed ? formatCurrency(session.closing_balance_actual) : "—"}
        </td>
        <td className="px-4 py-3 text-right text-sm font-semibold">
          {diff !== null ? (
            <span className={diff < 0 ? "text-red-500" : diff > 0 ? "text-emerald-500" : "text-slate-400"}>
              {diff >= 0 ? `+${formatCurrency(diff)}` : `−${formatCurrency(Math.abs(diff))}`}
            </span>
          ) : (
            <span className="text-slate-400">—</span>
          )}
        </td>
        <td className="px-4 py-3">
          <span className={`inline-flex items-center px-2 py-0.5 rounded-full text-xs font-semibold ${isClosed ? "bg-slate-100 text-slate-600 dark:bg-slate-700 dark:text-slate-300" : "bg-emerald-100 text-emerald-700 dark:bg-emerald-900/30 dark:text-emerald-300"}`}>
            {isClosed ? "Closed" : "Open"}
          </span>
        </td>
        <td className="px-4 py-3 text-center">
          <div className="flex items-center justify-center gap-2">
            {onOpenZReport && (
              <button
                type="button"
                onClick={(e) => {
                  e.stopPropagation();
                  onOpenZReport(session.id);
                }}
                className="inline-flex items-center gap-1 px-2 py-1 rounded-lg text-xs font-semibold bg-blue-50 text-blue-700 hover:bg-blue-100 dark:bg-blue-900/30 dark:text-blue-300 dark:hover:bg-blue-900/50 transition-colors"
                title="View / Print Shift Z-Report PDF"
              >
                <PrinterIcon className="w-3.5 h-3.5" />
                Z-Report
              </button>
            )}
            {expanded ? <ChevronUpIcon className="w-4 h-4 text-blue-500" /> : <ChevronDownIcon className="w-4 h-4 text-slate-400" />}
          </div>
        </td>
      </tr>
      {expanded && (
        <tr className={isDark ? "bg-slate-800/60" : "bg-blue-50/30"}>
          <td colSpan={11} className="p-0">
            <div className="border-t border-blue-200 dark:border-slate-700">
              {loading ? (
                <div className="flex items-center justify-center py-8 gap-2 text-slate-400 text-sm">
                  <ArrowPathIcon className="w-4 h-4 animate-spin" /> Loading session ledger…
                </div>
              ) : detail ? (
                <SessionLedger
                  session={detail.session}
                  summary={detail.summary}
                  transactions={detail.transactions}
                  formatCurrency={formatCurrency}
                  isDark={isDark}
                />
              ) : null}
            </div>
          </td>
        </tr>
      )}
    </>
  );
}

// ─── Main Page Component ───────────────────────────────────────────────────────

export default function CashDrawerPage() {
  const { isDark, theme } = useTheme();
  const { formatCurrency } = useCurrency();
  const { has } = usePermissions();
  const canOpenShift = has("cash-drawer.open");
  const canCloseShift = has("cash-drawer.close");
  const canRecordTxn = has("cash-drawer.transaction");

  // ── Theme setup ────────────────────────────────────────────────────────────
  const themeColors = useMemo(() => ({
    primary: theme?.primary_color || "#3b82f6",
    primaryHover: theme?.primary_hover || "#2563eb",
    secondary: theme?.secondary_color || "#8b5cf6",
    secondaryHover: theme?.secondary_hover || "#7c3aed",
    tertiary: theme?.tertiary_color || "#06b6d4",
    tertiaryHover: theme?.tertiary_hover || "#0891b2",
    danger: theme?.danger_color || "#ef4444",
    dangerHover: "#dc2626",
  }), [theme]);

  const getButtonClasses = useMemo(
    () => getThemeButtonClasses(theme?.button_style || "modern", themeColors, isDark),
    [theme, themeColors, isDark]
  );
  const btnPrimary = getButtonClasses.primary;
  const btnSecondary = getButtonClasses.secondary;
  const btnDanger = getButtonClasses.danger;

  const selectStyles = useMemo(() => ({
    control: (base) => ({
      ...base,
      backgroundColor: isDark ? "#1e293b" : "#ffffff",
      borderColor: isDark ? "#475569" : "#d1d5db",
      color: isDark ? "#e2e8f0" : "#111827",
      minHeight: "36px",
      boxShadow: "none",
    }),
    singleValue: (base) => ({ ...base, color: isDark ? "#e2e8f0" : "#111827" }),
    menu: (base) => ({ ...base, backgroundColor: isDark ? "#1e293b" : "#ffffff", zIndex: 50 }),
    option: (base, state) => ({
      ...base,
      backgroundColor: state.isFocused ? (isDark ? "#334155" : "#f1f5f9") : "transparent",
      color: isDark ? "#e2e8f0" : "#111827",
    }),
    placeholder: (base) => ({ ...base, color: isDark ? "#94a3b8" : "#9ca3af" }),
    input: (base) => ({ ...base, color: isDark ? "#e2e8f0" : "#111827" }),
  }), [isDark]);

  // ── State ──────────────────────────────────────────────────────────────────
  const [currentData, setCurrentData] = useState(null); // { is_open, session, summary }
  const [history, setHistory] = useState([]);
  const [historyMeta, setHistoryMeta] = useState(null);
  const [historyPage, setHistoryPage] = useState(1);
  const [loadingCurrent, setLoadingCurrent] = useState(true);
  const [loadingHistory, setLoadingHistory] = useState(false);

  const [showOpenModal, setShowOpenModal] = useState(false);
  const [showTxnModal, setShowTxnModal] = useState(null); // null | "cash_in" | "cash_out"
  const [showCloseModal, setShowCloseModal] = useState(false);
  const [zReportSessionId, setZReportSessionId] = useState(null);
  const [activeCategoryFilter, setActiveCategoryFilter] = useState(null);
  const [showHowItWorks, setShowHowItWorks] = useState(false);

  // ── Data fetching ──────────────────────────────────────────────────────────
  const fetchCurrent = useCallback(async () => {
    setLoadingCurrent(true);
    try {
      const { data } = await axios.get("/api/cash-drawer/current");
      setCurrentData(data);
    } catch (err) {
      if (err?.response?.status !== 404) {
        toast.error("Failed to load cash drawer status.");
      }
      setCurrentData({ is_open: false, session: null, summary: null });
    } finally {
      setLoadingCurrent(false);
    }
  }, []);

  const fetchHistory = useCallback(async (page = 1) => {
    setLoadingHistory(true);
    try {
      const { data } = await axios.get(`/api/cash-drawer/history?per_page=10&page=${page}`);
      setHistory(data.data || []);
      setHistoryMeta(data.meta || data);
      setHistoryPage(page);
    } catch {
      toast.error("Failed to load session history.");
    } finally {
      setLoadingHistory(false);
    }
  }, []);

  useEffect(() => {
    fetchCurrent();
    fetchHistory(1);
    const onDrawerChange = () => {
      fetchCurrent();
      fetchHistory(1);
    };
    window.addEventListener("cash-drawer-changed", onDrawerChange);
    return () => window.removeEventListener("cash-drawer-changed", onDrawerChange);
  }, [fetchCurrent, fetchHistory]);

  function handleActionSuccess() {
    setShowOpenModal(false);
    setShowTxnModal(null);
    setShowCloseModal(false);
    fetchCurrent();
    fetchHistory(1);
    window.dispatchEvent(new CustomEvent("cash-drawer-changed"));
    window.dispatchEvent(new CustomEvent("accounts-changed"));
    try { localStorage.setItem("cash_drawer_sync", String(Date.now())); } catch {}
    try { localStorage.setItem("accounts_sync", String(Date.now())); } catch {}
  }

  // ── Derived state ──────────────────────────────────────────────────────────
  const isOpen = currentData?.is_open;
  const session = currentData?.session;
  const summary = currentData?.summary;
  const lastClosedSession = currentData?.last_closed_session;
  const lastClosedSummary = currentData?.last_closed_summary;
  const transactions = session?.transactions || [];

  const enrichedTxns = useMemo(
    () => attachRunningBalance(transactions, session?.opening_balance),
    [transactions, session?.opening_balance]
  );

  // ── Render ─────────────────────────────────────────────────────────────────
  return (
    <div className="space-y-6 pb-10">
      {/* ── Page Header ────────────────────────────────────────────────────── */}
      <GlassSectionHeader
        title="Cash Drawer"
        right={
          <div className="flex flex-wrap items-center gap-2">
            <button
              type="button"
              onClick={() => setShowHowItWorks((v) => !v)}
              className={`flex items-center gap-1.5 px-3.5 py-2.5 text-xs font-semibold rounded-xl border transition-colors ${
                showHowItWorks
                  ? "bg-blue-600 text-white border-blue-600"
                  : isDark
                    ? "bg-slate-800/80 text-blue-300 border-slate-700 hover:bg-slate-700"
                    : "bg-blue-50 text-blue-700 border-blue-200 hover:bg-blue-100"
              }`}
            >
              <InformationCircleIcon className="w-4 h-4" />
              {showHowItWorks ? "Hide Formula & Guide" : "How Cash Drawer Works"}
            </button>
            <button
              onClick={() => { fetchCurrent(); fetchHistory(historyPage); }}
              className={`flex items-center gap-1.5 px-4 py-2.5 text-sm font-medium ${btnSecondary.className}`}
              style={btnSecondary.style}
            >
              <ArrowPathIcon className="w-4 h-4" />
              Refresh
            </button>
            {isOpen && (
              <>
                {canRecordTxn && (
                  <>
                    <button
                      onClick={() => setShowTxnModal("cash_in")}
                      className={`flex items-center gap-1.5 px-4 py-2.5 text-sm font-semibold ${btnPrimary.className}`}
                      style={btnPrimary.style}
                    >
                      <ArrowUpCircleIcon className="w-4 h-4" />
                      Cash In
                    </button>
                    <button
                      onClick={() => setShowTxnModal("cash_out")}
                      className={`flex items-center gap-1.5 px-4 py-2.5 text-sm font-semibold ${btnDanger.className}`}
                      style={btnDanger.style}
                    >
                      <ArrowDownCircleIcon className="w-4 h-4" />
                      Cash Out
                    </button>
                  </>
                )}
                {canCloseShift && (
                  <button
                    onClick={() => setShowCloseModal(true)}
                    className={`flex items-center gap-1.5 px-4 py-2.5 text-sm font-medium ${btnSecondary.className}`}
                    style={btnSecondary.style}
                  >
                    <LockClosedIcon className="w-4 h-4" />
                    Close Drawer
                  </button>
                )}
              </>
            )}
            {!isOpen && !loadingCurrent && canOpenShift && (
              <button
                onClick={() => setShowOpenModal(true)}
                className={`flex items-center gap-1.5 px-4 py-2.5 text-sm font-semibold ${btnPrimary.className}`}
                style={btnPrimary.style}
              >
                <LockOpenIcon className="w-4 h-4" />
                Open Drawer
              </button>
            )}
          </div>
        }
      />

      {/* ── How Cash Drawer Works & Formula Explanation Panel ───────────────── */}
      {showHowItWorks && (
        <GlassCard className={`p-5 border-l-4 border-l-blue-500 ${isDark ? "bg-slate-800/80" : "bg-blue-50/40"}`}>
          <div className="flex flex-col gap-3">
            <div className="flex items-center justify-between">
              <h3 className={`text-sm font-bold flex items-center gap-2 ${isDark ? "text-white" : "text-slate-800"}`}>
                <InformationCircleIcon className="w-5 h-5 text-blue-500" />
                How the Cash Drawer & Treasury Account Sync Work
              </h3>
              <button
                type="button"
                onClick={() => setShowHowItWorks(false)}
                className="text-xs text-slate-400 hover:text-slate-600"
              >
                Close
              </button>
            </div>
            <div className={`p-3 rounded-xl border text-xs font-mono font-semibold flex flex-wrap items-center gap-2 ${
              isDark ? "bg-slate-900/70 border-slate-700 text-slate-200" : "bg-white border-blue-200 text-slate-800"
            }`}>
              <span className="px-2 py-1 rounded bg-blue-100 text-blue-800 dark:bg-blue-900/40 dark:text-blue-300">Opening Float</span>
              <span>+</span>
              <span className="px-2 py-1 rounded bg-emerald-100 text-emerald-800 dark:bg-emerald-900/40 dark:text-emerald-300">Cash Inflows (Sales + Udhar Receipts + Refunds + Manual In)</span>
              <span>−</span>
              <span className="px-2 py-1 rounded bg-red-100 text-red-800 dark:bg-red-900/40 dark:text-red-300">Cash Outflows (Purchases + Sale Returns + Supplier Paid + Expenses + Advances + Manual Out)</span>
              <span>=</span>
              <span className="px-2 py-1 rounded bg-indigo-100 text-indigo-800 dark:bg-indigo-900/40 dark:text-indigo-300 font-bold">Expected Physical Cash in Drawer</span>
            </div>
            <div className="grid grid-cols-1 md:grid-cols-3 gap-3 text-xs text-slate-600 dark:text-slate-300">
              <div className={`p-3 rounded-lg border ${isDark ? "border-slate-700 bg-slate-900/40" : "border-slate-200 bg-white"}`}>
                <div className="font-bold text-emerald-600 dark:text-emerald-400 mb-1">1. Automatic Cash In / Out</div>
                Whenever you save a <strong>Cash Sale Invoice</strong>, collect <strong>Customer Udhar in Cash</strong>, pay a <strong>Supplier in Cash</strong>, or record a <strong>Cash Expense / Staff Advance</strong> while a shift is open, it is automatically logged here.
              </div>
              <div className={`p-3 rounded-lg border ${isDark ? "border-slate-700 bg-slate-900/40" : "border-slate-200 bg-white"}`}>
                <div className="font-bold text-blue-600 dark:text-blue-400 mb-1">2. Treasury Account Sync</div>
                Your active drawer balance is synchronized in real time with the <strong>Cash in Hand (Drawer)</strong> account under <Link to="/accounts" className="text-blue-600 dark:text-blue-400 underline">Financial Accounts</Link>. Bank/Wallet payments go directly to those accounts without touching physical drawer cash.
              </div>
              <div className={`p-3 rounded-lg border ${isDark ? "border-slate-700 bg-slate-900/40" : "border-slate-200 bg-white"}`}>
                <div className="font-bold text-amber-600 dark:text-amber-400 mb-1">3. Shift Closure & Z-Report</div>
                At shift end, click <strong>Close Drawer</strong>, use the <strong>PKR Denomination Counter</strong> to count physical notes, verify any <strong>Surplus (+)</strong> or <strong>Shortage (−)</strong>, and print or share the official <strong>Shift Z-Report PDF</strong>.
              </div>
            </div>
          </div>
        </GlassCard>
      )}

      {/* ── Loading skeleton ────────────────────────────────────────────────── */}
      {loadingCurrent && (
        <div className="flex items-center justify-center py-16 text-slate-400 gap-2">
          <ArrowPathIcon className="w-5 h-5 animate-spin" />
          <span className="text-sm">Loading drawer status…</span>
        </div>
      )}

      {/* ── Status banner ───────────────────────────────────────────────────── */}
      {!loadingCurrent && (
        <div className={`flex flex-wrap items-center justify-between gap-3 px-5 py-4 rounded-xl border text-sm font-medium ${
          isOpen
            ? "bg-emerald-50 dark:bg-emerald-900/20 border-emerald-200 dark:border-emerald-800 text-emerald-800 dark:text-emerald-300"
            : "bg-amber-50 dark:bg-amber-900/20 border-amber-200 dark:border-amber-800 text-amber-800 dark:text-amber-300"
        }`}>
          <div className="flex items-center gap-3">
            {isOpen ? (
              <>
                <span className="w-2.5 h-2.5 rounded-full bg-emerald-500 animate-pulse flex-shrink-0" />
                <span className="font-bold text-base">OPEN (SHIFT #{session?.id})</span>
                <span className="text-slate-500 dark:text-slate-400 font-normal">
                  — Opened {fmtDateTime(session?.opened_at)}
                  {(session?.user?.name || session?.opened_by?.name) ? ` by ${session.user?.name || session.opened_by?.name}` : ""}
                </span>
              </>
            ) : (
              <>
                <span className="w-2.5 h-2.5 rounded-full bg-amber-500 flex-shrink-0" />
                <span className="font-bold text-base">CLOSED</span>
                <span className="text-slate-500 dark:text-slate-400 font-normal">
                  — No active cash drawer shift is open. Open a shift before billing cash transactions so every rupee is tracked.
                </span>
              </>
            )}
          </div>
          {isOpen && summary && (
            <div className="text-xs font-mono px-3 py-1.5 rounded-lg bg-white/80 dark:bg-slate-900/60 border border-emerald-200 dark:border-emerald-800/60 text-slate-700 dark:text-slate-200">
              {formatCurrency(session.opening_balance)} (Float) + <span className="text-emerald-600 dark:text-emerald-400">{formatCurrency(summary.total_cash_in ?? 0)}</span> (In) − <span className="text-red-600 dark:text-red-400">{formatCurrency(summary.total_cash_out ?? 0)}</span> (Out) = <strong className="text-blue-600 dark:text-blue-400">{formatCurrency(summary.expected_balance ?? 0)}</strong>
            </div>
          )}
        </div>
      )}

      {/* ── Closed State: Last Closed Shift Summary Card ────────────────────── */}
      {!loadingCurrent && !isOpen && lastClosedSession && (
        <GlassCard className="p-5">
          <div className="flex flex-wrap items-center justify-between gap-3 mb-4">
            <div>
              <div className="flex items-center gap-2">
                <span className="px-2 py-0.5 rounded-md text-xs font-bold bg-slate-200 dark:bg-slate-700 text-slate-700 dark:text-slate-200">
                  Last Closed Shift #{lastClosedSession.id}
                </span>
                <span className="text-xs text-slate-500 dark:text-slate-400">
                  Closed {fmtDateTime(lastClosedSession.closed_at)} by {lastClosedSession.user?.name || "Cashier"}
                </span>
              </div>
              <p className="text-xs text-slate-400 mt-1">
                Review the previous shift's closing figures below, or carry over its actual closing cash ({formatCurrency(lastClosedSession.closing_balance_actual ?? 0)}) into your new shift.
              </p>
            </div>
            <div className="flex items-center gap-2">
              <button
                type="button"
                onClick={() => setZReportSessionId(lastClosedSession.id)}
                className={`inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-semibold ${btnSecondary.className}`}
                style={btnSecondary.style}
              >
                <PrinterIcon className="w-4 h-4" />
                Last Shift Z-Report
              </button>
              {canOpenShift && (
                <button
                  type="button"
                  onClick={() => setShowOpenModal(true)}
                  className={`inline-flex items-center gap-1.5 px-3.5 py-1.5 rounded-lg text-xs font-semibold ${btnPrimary.className}`}
                  style={btnPrimary.style}
                >
                  <LockOpenIcon className="w-4 h-4" />
                  Open Shift with {formatCurrency(lastClosedSession.closing_balance_actual ?? 0)}
                </button>
              )}
            </div>
          </div>
          <div className="grid grid-cols-2 md:grid-cols-5 gap-3">
            <div className={`p-3 rounded-xl border ${isDark ? "border-slate-700 bg-slate-800/50" : "border-slate-200 bg-slate-50"}`}>
              <div className="text-[11px] uppercase text-slate-400 font-semibold">Opening Float</div>
              <div className="text-base font-bold text-slate-700 dark:text-slate-200 mt-0.5">{formatCurrency(lastClosedSession.opening_balance ?? 0)}</div>
            </div>
            <div className={`p-3 rounded-xl border ${isDark ? "border-slate-700 bg-slate-800/50" : "border-slate-200 bg-slate-50"}`}>
              <div className="text-[11px] uppercase text-slate-400 font-semibold">Total Cash In</div>
              <div className="text-base font-bold text-emerald-600 dark:text-emerald-400 mt-0.5">+{formatCurrency(lastClosedSummary?.total_cash_in ?? 0)}</div>
            </div>
            <div className={`p-3 rounded-xl border ${isDark ? "border-slate-700 bg-slate-800/50" : "border-slate-200 bg-slate-50"}`}>
              <div className="text-[11px] uppercase text-slate-400 font-semibold">Total Cash Out</div>
              <div className="text-base font-bold text-red-600 dark:text-red-400 mt-0.5">−{formatCurrency(lastClosedSummary?.total_cash_out ?? 0)}</div>
            </div>
            <div className={`p-3 rounded-xl border ${isDark ? "border-slate-700 bg-slate-800/50" : "border-slate-200 bg-slate-50"}`}>
              <div className="text-[11px] uppercase text-slate-400 font-semibold">Expected Closing</div>
              <div className="text-base font-bold text-blue-600 dark:text-blue-400 mt-0.5">{formatCurrency(lastClosedSession.closing_balance_expected ?? 0)}</div>
            </div>
            <div className={`p-3 rounded-xl border ${isDark ? "border-slate-700 bg-slate-800/50" : "border-slate-200 bg-slate-50"}`}>
              <div className="text-[11px] uppercase text-slate-400 font-semibold">Actual Counted (Variance)</div>
              <div className="text-base font-bold text-slate-800 dark:text-white mt-0.5">
                {formatCurrency(lastClosedSession.closing_balance_actual ?? 0)}{" "}
                <span className={`text-xs font-semibold ${
                  (parseFloat(lastClosedSession.difference) || 0) < 0
                    ? "text-red-500"
                    : (parseFloat(lastClosedSession.difference) || 0) > 0
                      ? "text-emerald-500"
                      : "text-slate-400"
                }`}>
                  ({(parseFloat(lastClosedSession.difference) || 0) === 0
                    ? "Balanced"
                    : (parseFloat(lastClosedSession.difference) || 0) > 0
                      ? `+${formatCurrency(lastClosedSession.difference)}`
                      : `−${formatCurrency(Math.abs(lastClosedSession.difference))}`})
                </span>
              </div>
            </div>
          </div>
        </GlassCard>
      )}

      {/* ── KPI Cards ───────────────────────────────────────────────────────── */}
      {!loadingCurrent && session && (
        <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
          <KpiCard
            label="Opening Float"
            value={formatCurrency(session.opening_balance)}
            sub={`Session started ${fmtDate(session.opened_at)}`}
            icon={BanknotesIcon}
          />
          <KpiCard
            label="Total Cash In (+)"
            value={formatCurrency(summary?.total_cash_in ?? 0)}
            sub={`${enrichedTxns.filter(t => CASH_IN_TYPES.includes(t.type)).length} inflow transactions`}
            color="text-emerald-600 dark:text-emerald-400"
            icon={ArrowUpCircleIcon}
          />
          <KpiCard
            label="Total Cash Out (−)"
            value={formatCurrency(summary?.total_cash_out ?? 0)}
            sub={`${enrichedTxns.filter(t => !CASH_IN_TYPES.includes(t.type)).length} outflow transactions`}
            color="text-red-600 dark:text-red-400"
            icon={ArrowDownCircleIcon}
          />
          <KpiCard
            label="Expected Drawer Cash"
            value={formatCurrency(summary?.expected_balance ?? summary?.expected_closing_balance ?? (parseFloat(session.opening_balance) + (summary?.total_cash_in ?? 0) - (summary?.total_cash_out ?? 0)))}
            sub={isOpen ? "Opening Float + Cash In − Cash Out" : `Actual: ${formatCurrency(session.closing_balance_actual)}`}
            color="text-blue-600 dark:text-blue-400"
            icon={CurrencyDollarIcon}
          />
        </div>
      )}

      {/* ── Category Breakdown Matrix (Cash Inflows vs. Cash Outflows) ──────── */}
      {!loadingCurrent && session && summary && (
        <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
          {/* Cash Inflows Card */}
          <GlassCard className="p-4">
            <div className="flex items-center justify-between pb-2.5 mb-2.5 border-b border-slate-200 dark:border-slate-700">
              <div className="flex items-center gap-2">
                <ArrowUpCircleIcon className="w-5 h-5 text-emerald-500" />
                <div>
                  <h4 className={`text-sm font-bold ${isDark ? "text-white" : "text-slate-800"}`}>
                    Cash Inflows Breakdown (+)
                  </h4>
                  <p className="text-[11px] text-slate-400">Click any category to filter the ledger below</p>
                </div>
              </div>
              <span className="text-sm font-bold text-emerald-600 dark:text-emerald-400">
                +{formatCurrency(summary.total_cash_in ?? 0)}
              </span>
            </div>
            <div className="space-y-1.5 text-xs">
              {[
                { key: "cash_sale", label: "Cash Sales (POS & Retail Invoices)", desc: "Cash collected on sale bills", val: summary.cash_sales ?? 0 },
                { key: "customer_payment", label: "Customer Udhar Receipts", desc: "Cash recovered from customer ledgers", val: summary.customer_payments ?? 0 },
                { key: "purchase_return", label: "Supplier Return Refunds", desc: "Cash refunded by suppliers on returns", val: summary.purchase_returns ?? 0 },
                { key: "cash_in", label: "Manual Cash In / Bank Withdrawals", desc: "Added float or cash brought from bank/safe", val: summary.manual_cash_in ?? 0 },
              ].map((item) => {
                const isSelected = activeCategoryFilter === item.key;
                return (
                  <button
                    key={item.key}
                    type="button"
                    onClick={() => setActiveCategoryFilter(isSelected ? null : item.key)}
                    className={`w-full flex items-center justify-between px-3 py-2 rounded-lg border text-left transition-colors ${
                      isSelected
                        ? "border-emerald-500 bg-emerald-50 dark:bg-emerald-900/30"
                        : isDark
                          ? "border-slate-700/70 hover:bg-slate-800"
                          : "border-slate-100 hover:bg-slate-50"
                    }`}
                  >
                    <div>
                      <div className={`font-semibold ${isDark ? "text-slate-200" : "text-slate-700"}`}>{item.label}</div>
                      <div className="text-[11px] text-slate-400">{item.desc}</div>
                    </div>
                    <span className="font-mono font-bold text-emerald-600 dark:text-emerald-400">
                      +{formatCurrency(item.val)}
                    </span>
                  </button>
                );
              })}
            </div>
          </GlassCard>

          {/* Cash Outflows Card */}
          <GlassCard className="p-4">
            <div className="flex items-center justify-between pb-2.5 mb-2.5 border-b border-slate-200 dark:border-slate-700">
              <div className="flex items-center gap-2">
                <ArrowDownCircleIcon className="w-5 h-5 text-red-500" />
                <div>
                  <h4 className={`text-sm font-bold ${isDark ? "text-white" : "text-slate-800"}`}>
                    Cash Outflows Breakdown (−)
                  </h4>
                  <p className="text-[11px] text-slate-400">Click any category to filter the ledger below</p>
                </div>
              </div>
              <span className="text-sm font-bold text-red-600 dark:text-red-400">
                −{formatCurrency(summary.total_cash_out ?? 0)}
              </span>
            </div>
            <div className="space-y-1.5 text-xs">
              {[
                { key: "cash_purchase", label: "Cash Purchases (GRN)", desc: "Cash paid immediately on purchase bills", val: summary.cash_purchases ?? 0 },
                { key: "cash_return", label: "Customer Cash Sale Returns", desc: "Cash refunded to customers for returned items", val: summary.cash_returns ?? 0 },
                { key: "supplier_payment", label: "Supplier Ledger Payments", desc: "Cash paid against supplier payables", val: summary.supplier_payments ?? 0 },
                { key: "expense", label: "Operating Shop Expenses", desc: "Bills, rent, refreshments & daily expenses", val: summary.expenses ?? 0 },
                { key: "staff_advance", label: "Staff Salary Advances", desc: "Cash advances issued to employees", val: summary.staff_advances ?? 0 },
                { key: "cash_out", label: "Manual Cash Out / Safe Drops", desc: "Cash removed or deposited to bank/safe", val: summary.manual_cash_out ?? 0 },
              ].map((item) => {
                const isSelected = activeCategoryFilter === item.key;
                return (
                  <button
                    key={item.key}
                    type="button"
                    onClick={() => setActiveCategoryFilter(isSelected ? null : item.key)}
                    className={`w-full flex items-center justify-between px-3 py-1.5 rounded-lg border text-left transition-colors ${
                      isSelected
                        ? "border-red-500 bg-red-50 dark:bg-red-900/30"
                        : isDark
                          ? "border-slate-700/70 hover:bg-slate-800"
                          : "border-slate-100 hover:bg-slate-50"
                    }`}
                  >
                    <div>
                      <div className={`font-semibold ${isDark ? "text-slate-200" : "text-slate-700"}`}>{item.label}</div>
                      <div className="text-[11px] text-slate-400">{item.desc}</div>
                    </div>
                    <span className="font-mono font-bold text-red-600 dark:text-red-400">
                      −{formatCurrency(item.val)}
                    </span>
                  </button>
                );
              })}
            </div>
          </GlassCard>
        </div>
      )}

      {/* ── Current Session Ledger ───────────────────────────────────────────── */}
      {!loadingCurrent && session && (
        <GlassCard className="p-0 overflow-hidden">
          <div className={`px-5 py-4 border-b flex flex-wrap items-center justify-between gap-2 ${isDark ? "border-slate-700" : "border-slate-100"}`}>
            <div>
              <div className="flex items-center gap-2">
                <h3 className={`font-semibold ${isDark ? "text-white" : "text-slate-800"}`}>
                  {isOpen ? "Current Session — Transaction Ledger" : `Session #${session.id} — Transaction Ledger`}
                </h3>
                {activeCategoryFilter && (
                  <button
                    type="button"
                    onClick={() => setActiveCategoryFilter(null)}
                    className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-xs font-semibold bg-blue-100 text-blue-700 dark:bg-blue-900/40 dark:text-blue-300"
                  >
                    Filtered: {TYPE_LABELS[activeCategoryFilter] || activeCategoryFilter} ✕
                  </button>
                )}
              </div>
              <p className="text-xs text-slate-400 mt-0.5">
                {enrichedTxns.length} transactions · Opening balance {formatCurrency(session.opening_balance)} · Click any blue document badge to view the original invoice or voucher
              </p>
            </div>
            <div className="flex items-center gap-2">
              <button
                type="button"
                onClick={() => setZReportSessionId(session.id)}
                className={`inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-semibold ${btnSecondary.className}`}
                style={btnSecondary.style}
              >
                <ShareIcon className="w-4 h-4" />
                Shift Z-Report (PDF)
              </button>
              <DocumentTextIcon className="w-5 h-5 text-slate-300 dark:text-slate-600" />
            </div>
          </div>
          <SessionLedger
            session={session}
            summary={summary}
            transactions={transactions}
            formatCurrency={formatCurrency}
            isDark={isDark}
            activeCategoryFilter={activeCategoryFilter}
          />
        </GlassCard>
      )}

      {/* ── Past Sessions History ────────────────────────────────────────────── */}
      <GlassCard className="p-0 overflow-hidden">
        <div className={`px-5 py-4 border-b flex items-center justify-between ${isDark ? "border-slate-700" : "border-slate-100"}`}>
          <div>
            <h3 className={`font-semibold ${isDark ? "text-white" : "text-slate-800"}`}>Session History</h3>
            <p className="text-xs text-slate-400 mt-0.5">All past drawer sessions — click a row to expand the full ledger</p>
          </div>
          <ClockIcon className="w-5 h-5 text-slate-300 dark:text-slate-600" />
        </div>

        {loadingHistory ? (
          <div className="flex items-center justify-center py-12 gap-2 text-slate-400 text-sm">
            <ArrowPathIcon className="w-4 h-4 animate-spin" /> Loading history…
          </div>
        ) : history.length === 0 ? (
          <div className="flex flex-col items-center justify-center py-16 gap-2 text-slate-400">
            <BanknotesIcon className="w-10 h-10 opacity-20" />
            <p className="text-sm">No past sessions found.</p>
          </div>
        ) : (
          <>
            <div className="overflow-x-auto">
              <table className="w-full text-sm min-w-[900px]">
                <thead>
                  <tr className={`text-xs uppercase tracking-wide ${isDark ? "bg-slate-800 text-slate-400" : "bg-slate-50 text-slate-500"}`}>
                    <th className="px-4 py-3 text-left">Session</th>
                    <th className="px-4 py-3 text-left">Date</th>
                    <th className="px-4 py-3 text-left">Opened By</th>
                    <th className="px-4 py-3 text-right">Opening</th>
                    <th className="px-4 py-3 text-right">Cash In</th>
                    <th className="px-4 py-3 text-right">Cash Out</th>
                    <th className="px-4 py-3 text-right">Expected</th>
                    <th className="px-4 py-3 text-right">Actual</th>
                    <th className="px-4 py-3 text-right">Diff</th>
                    <th className="px-4 py-3 text-center">Status</th>
                    <th className="px-4 py-3 text-center w-10"></th>
                  </tr>
                </thead>
                <tbody>
                  {history.map((s) => (
                    <HistoryRow
                      key={s.id}
                      session={s}
                      formatCurrency={formatCurrency}
                      isDark={isDark}
                      selectStyles={selectStyles}
                      onOpenZReport={(id) => setZReportSessionId(id)}
                    />
                  ))}
                </tbody>
              </table>
            </div>

            {/* Pagination */}
            {historyMeta && historyMeta.last_page > 1 && (
              <div className={`px-5 py-3 border-t flex items-center justify-between text-sm ${isDark ? "border-slate-700" : "border-slate-100"}`}>
                <span className="text-slate-400">
                  Page {historyMeta.current_page} of {historyMeta.last_page}
                </span>
                <div className="flex gap-2">
                  <button
                    disabled={historyMeta.current_page <= 1}
                    onClick={() => fetchHistory(historyMeta.current_page - 1)}
                    className={`px-4 py-2.5 text-sm font-medium disabled:opacity-40 ${btnSecondary.className}`}
                    style={btnSecondary.style}
                  >
                    Previous
                  </button>
                  <button
                    disabled={historyMeta.current_page >= historyMeta.last_page}
                    onClick={() => fetchHistory(historyMeta.current_page + 1)}
                    className={`px-4 py-2.5 text-sm font-medium disabled:opacity-40 ${btnPrimary.className}`}
                    style={btnPrimary.style}
                  >
                    Next
                  </button>
                </div>
              </div>
            )}
          </>
        )}
      </GlassCard>

      {/* ── Modals ─────────────────────────────────────────────────────────── */}
      {showOpenModal && (
        <OpenDrawerModal
          isDark={isDark}
          btnPrimary={btnPrimary}
          btnSecondary={btnSecondary}
          formatCurrency={formatCurrency}
          suggestedFloat={lastClosedSession?.closing_balance_actual ?? null}
          onClose={() => setShowOpenModal(false)}
          onSuccess={handleActionSuccess}
        />
      )}
      {showTxnModal && (
        <TransactionModal
          isDark={isDark}
          btnSecondary={btnSecondary}
          btnDanger={btnDanger}
          btnPrimary={btnPrimary}
          selectStyles={selectStyles}
          defaultType={showTxnModal}
          onClose={() => setShowTxnModal(null)}
          onSuccess={handleActionSuccess}
        />
      )}
      {showCloseModal && (
        <CloseDrawerModal
          isDark={isDark}
          btnPrimary={btnPrimary}
          btnSecondary={btnSecondary}
          btnDanger={btnDanger}
          formatCurrency={formatCurrency}
          expectedBalance={summary?.expected_balance ?? summary?.expected_closing_balance ?? 0}
          onClose={() => setShowCloseModal(false)}
          onSuccess={handleActionSuccess}
        />
      )}
      <ShareDocumentModal
        isOpen={Boolean(zReportSessionId)}
        onClose={() => setZReportSessionId(null)}
        documentType="cash_drawer_session"
        documentId={zReportSessionId}
      />
    </div>
  );
}

