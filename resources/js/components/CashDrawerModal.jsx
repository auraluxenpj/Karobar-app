import React, { useState, useEffect, useMemo, useCallback, useRef } from "react";
import axios from "axios";
import Select from "react-select";
import {
  XMarkIcon,
  BanknotesIcon,
  ArrowDownLeftIcon,
  ArrowUpRightIcon,
  LockClosedIcon,
  ClockIcon,
  CheckCircleIcon,
  ExclamationTriangleIcon,
  ArrowPathIcon,
  PrinterIcon,
  DocumentTextIcon,
  MagnifyingGlassIcon,
} from "@heroicons/react/24/solid";
import { useCurrency } from "@/context/CurrencyContext.jsx";
import { useTheme } from "@/context/ThemeContext.jsx";
import { usePermissions } from "@/api/usePermissions.js";

const TRANSACTION_TYPE_OPTIONS = [
  { value: "cash_in", label: "Cash In (Add Money / Float)" },
  { value: "cash_out", label: "Cash Out (Petty Cash / Expense / Withdrawal)" },
];

const CASH_IN_TYPES = ["cash_sale", "customer_payment", "purchase_return", "cash_in"];

function sortAndAttachRunningBalance(transactions, openingBalance = 0) {
  const sorted = [...(transactions || [])].sort((a, b) => {
    const tA = a.created_at ? new Date(a.created_at).getTime() : 0;
    const tB = b.created_at ? new Date(b.created_at).getTime() : 0;
    if (tA !== tB) return tA - tB;
    return (Number(a.id) || 0) - (Number(b.id) || 0);
  });
  let running = Number(openingBalance) || 0;
  return sorted.map((tx, idx) => {
    const amt = Number(tx.amount) || 0;
    const isPlus = CASH_IN_TYPES.includes(tx.type);
    running += isPlus ? amt : -amt;
    return { ...tx, seq: idx + 1, balance_after: running };
  });
}

export default function CashDrawerModal({ isOpen, onClose, onSessionUpdated }) {
  const { formatCurrency } = useCurrency();
  const { isDark, theme } = useTheme();
  const { has } = usePermissions();
  const canOpenShift = has("cash-drawer.open");
  const canCloseShift = has("cash-drawer.close");
  const canRecordTxn = has("cash-drawer.transaction");
  const canOperateDrawer = canOpenShift || canCloseShift || canRecordTxn;

  const [loading, setLoading] = useState(false);
  const [submitting, setSubmitting] = useState(false);
  const [sessionData, setSessionData] = useState(null); // { is_open, session, summary }
  const [activeTab, setActiveTab] = useState("overview"); // 'overview' | 'actions' | 'close' | 'history'

  // Open shift form
  const [openingBalance, setOpeningBalance] = useState("0");
  const [openingNotes, setOpeningNotes] = useState("");

  // Cash in / cash out form
  const [selectedTxnType, setSelectedTxnType] = useState(TRANSACTION_TYPE_OPTIONS[0]);
  const [txnAmount, setTxnAmount] = useState("");
  const [txnNotes, setTxnNotes] = useState("");

  // Close shift form
  const [actualClosingBalance, setActualClosingBalance] = useState("");
  const [closingNotes, setClosingNotes] = useState("");

  // History state
  const [historyList, setHistoryList] = useState([]);
  const [loadingHistory, setLoadingHistory] = useState(false);

  // Detailed report state
  const [reportSessionId, setReportSessionId] = useState(null);
  const [detailedReport, setDetailedReport] = useState(null);
  const [loadingReport, setLoadingReport] = useState(false);
  const [reportTxnFilter, setReportTxnFilter] = useState("");

  const [errorMsg, setErrorMsg] = useState("");
  const [successMsg, setSuccessMsg] = useState("");

  const selectStyles = useMemo(() => ({
    control: (base, state) => ({
      ...base,
      minHeight: "38px",
      borderRadius: 10,
      backgroundColor: isDark ? "rgba(30, 41, 59, 0.9)" : "#ffffff",
      borderColor: state.isFocused
        ? (theme?.primary_color || "#3b82f6")
        : (isDark ? "rgba(71, 85, 105, 0.7)" : "rgba(209, 213, 219, 0.8)"),
      boxShadow: state.isFocused
        ? `0 0 0 2px ${theme?.primary_color || "#3b82f6"}33`
        : "none",
      fontSize: "13px",
      color: isDark ? "#f8fafc" : "#1e293b",
    }),
    valueContainer: (base) => ({ ...base, padding: "2px 10px" }),
    input: (base) => ({ ...base, color: isDark ? "#f8fafc" : "#1e293b", margin: 0, padding: 0 }),
    singleValue: (base) => ({ ...base, color: isDark ? "#f8fafc" : "#1e293b", fontSize: "13px" }),
    menuPortal: (base) => ({ ...base, zIndex: 9999 }),
    menu: (base) => ({
      ...base,
      backgroundColor: isDark ? "#1e293b" : "#ffffff",
      border: isDark ? "1px solid #334155" : "1px solid #e2e8f0",
      boxShadow: "0 10px 25px -5px rgba(0, 0, 0, 0.2)",
      borderRadius: 10,
      overflow: "hidden",
    }),
    option: (base, state) => ({
      ...base,
      backgroundColor: state.isSelected
        ? (theme?.primary_color || "#3b82f6")
        : state.isFocused
        ? (isDark ? "#334155" : "#f1f5f9")
        : "transparent",
      color: state.isSelected ? "#ffffff" : (isDark ? "#f8fafc" : "#1e293b"),
      fontSize: "13px",
      cursor: "pointer",
    }),
  }), [isDark, theme]);

  const fetchCurrentDrawer = useCallback(async () => {
    setLoading(true);
    setErrorMsg("");
    try {
      const res = await axios.get("/api/cash-drawer/current");
      setSessionData(res.data);
      if (res.data?.is_open && res.data?.summary) {
        setActualClosingBalance(String(res.data.summary.expected_balance || 0));
      }
    } catch (err) {
      setErrorMsg(err.response?.data?.message || "Failed to load cash drawer status.");
    } finally {
      setLoading(false);
    }
  }, []);

  const fetchHistory = useCallback(async () => {
    setLoadingHistory(true);
    try {
      const res = await axios.get("/api/cash-drawer/history");
      setHistoryList(res.data?.data || []);
    } catch {
      // silent
    } finally {
      setLoadingHistory(false);
    }
  }, []);

  const fetchDetailedReport = useCallback(async (sessionId) => {
    setLoadingReport(true);
    setErrorMsg("");
    try {
      let targetId = sessionId;
      if (!targetId && sessionData?.session?.id) {
        targetId = sessionData.session.id;
      }
      if (!targetId) {
        const histRes = await axios.get("/api/cash-drawer/history", { params: { per_page: 1 } });
        targetId = histRes.data?.data?.[0]?.id;
      }
      if (targetId) {
        const res = await axios.get(`/api/cash-drawer/session/${targetId}`);
        setDetailedReport(res.data);
        setReportSessionId(targetId);
      } else {
        setDetailedReport(null);
      }
    } catch (err) {
      setErrorMsg(err.response?.data?.message || "Failed to load detailed report.");
    } finally {
      setLoadingReport(false);
    }
  }, [sessionData]);

  const handlePrintDetailedReport = () => {
    if (!detailedReport?.session || !detailedReport?.summary) return;
    const { session, summary, transactions } = detailedReport;
    const isClosed = session.status === "closed";
    const diff = Number(session.difference || 0);

    const win = window.open("", "_blank", "width=800,height=900");
    if (!win) {
      alert("Please allow popups to print shift report.");
      return;
    }

    const orderedTxns = sortAndAttachRunningBalance(transactions || [], session.opening_balance);
    const rowsHtml = orderedTxns.map((tx, idx) => {
      const isPlus = CASH_IN_TYPES.includes(tx.type);
      const timeStr = new Date(tx.created_at).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });
      const refText = tx.reference_label
        ? `${tx.reference_label}${tx.party_name ? ` (${tx.party_name})` : ''}`
        : (tx.reference_type ? tx.reference_type.split('\\').pop() + ' #' + (tx.reference_id || '') : '-');
      const descText = tx.notes ? `${refText !== '-' ? refText + ' — ' : ''}${tx.notes}` : refText;
      return `
        <tr>
          <td style="padding: 6px 8px; border-bottom: 1px solid #e2e8f0; font-size: 11px;">#${idx + 1}</td>
          <td style="padding: 6px 8px; border-bottom: 1px solid #e2e8f0; font-size: 11px;">${timeStr}</td>
          <td style="padding: 6px 8px; border-bottom: 1px solid #e2e8f0; font-size: 11px; text-transform: capitalize; font-weight: 600;">${(tx.type || '').replace('_', ' ')}</td>
          <td style="padding: 6px 8px; border-bottom: 1px solid #e2e8f0; font-size: 11px;">${descText}</td>
          <td style="padding: 6px 8px; border-bottom: 1px solid #e2e8f0; font-size: 11px; text-align: right; color: ${isPlus ? '#10b981' : '#f43f5e'}; font-weight: bold;">
            ${isPlus ? '+' : '-'}${formatCurrency(tx.amount)}
          </td>
          <td style="padding: 6px 8px; border-bottom: 1px solid #e2e8f0; font-size: 11px; text-align: right; font-weight: 700;">
            ${formatCurrency(tx.balance_after)}
          </td>
        </tr>
      `;
    }).join("");

    const htmlContent = `
      <!DOCTYPE html>
      <html>
      <head>
        <title>Cash Drawer Shift Report #${session.id}</title>
        <style>
          body { font-family: -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, sans-serif; margin: 24px; color: #1e293b; line-height: 1.4; }
          .header { text-align: center; border-bottom: 2px dashed #94a3b8; padding-bottom: 14px; margin-bottom: 16px; }
          .title { font-size: 18px; font-weight: 800; text-transform: uppercase; margin: 0; }
          .subtitle { font-size: 12px; color: #64748b; margin-top: 4px; }
          .meta-grid { display: grid; grid-template-columns: 1fr 1fr; gap: 6px 16px; font-size: 12px; margin-bottom: 16px; background: #f8fafc; padding: 12px; border-radius: 8px; }
          .section-title { font-size: 12px; font-weight: 800; text-transform: uppercase; border-bottom: 1px solid #cbd5e1; padding-bottom: 4px; margin: 16px 0 8px 0; letter-spacing: 0.5px; }
          .summary-table { width: 100%; border-collapse: collapse; font-size: 12px; margin-bottom: 14px; }
          .summary-table td { padding: 4px 0; }
          .summary-table .bold { font-weight: 700; }
          .summary-table .total-row { border-top: 1px solid #cbd5e1; border-bottom: 1px solid #cbd5e1; font-weight: 800; font-size: 13px; }
          .tx-table { width: 100%; border-collapse: collapse; margin-top: 8px; }
          .tx-table th { background: #f1f5f9; text-align: left; padding: 6px 8px; font-size: 11px; text-transform: uppercase; border-bottom: 1px solid #cbd5e1; }
          .signatures { margin-top: 40px; display: grid; grid-template-columns: 1fr 1fr; gap: 40px; font-size: 11px; text-align: center; }
          .sig-line { border-top: 1px solid #94a3b8; margin-top: 40px; padding-top: 4px; }
          @media print { body { margin: 0; } }
        </style>
      </head>
      <body>
        <div class="header">
          <h1 class="title">Cash Register Shift Report</h1>
          <div class="subtitle">Shift #${session.id} • ${session.status.toUpperCase()}</div>
        </div>

        <div class="meta-grid">
          <div><strong>Cashier:</strong> ${session.user?.name || 'N/A'}</div>
          <div><strong>Status:</strong> ${session.status.toUpperCase()}</div>
          <div><strong>Opened:</strong> ${new Date(session.opened_at).toLocaleString()}</div>
          <div><strong>Closed:</strong> ${session.closed_at ? new Date(session.closed_at).toLocaleString() : 'Active (In Progress)'}</div>
          <div><strong>Duration:</strong> ${summary.duration || '-'}</div>
          <div><strong>Transactions:</strong> ${summary.transactions_count || 0}</div>
        </div>

        <div class="section-title">Cash Flow Summary</div>
        <table class="summary-table">
          <tr><td>Starting Cash Float:</td><td style="text-align: right; font-weight: 600;">${formatCurrency(summary.opening_balance)}</td></tr>
          <tr><td style="color: #10b981;">+ Cash Sales:</td><td style="text-align: right;">+${formatCurrency(summary.cash_sales)}</td></tr>
          <tr><td style="color: #10b981;">+ Customer Debt Payments:</td><td style="text-align: right;">+${formatCurrency(summary.customer_payments)}</td></tr>
          <tr><td style="color: #10b981;">+ Supplier Returns / Refunds:</td><td style="text-align: right;">+${formatCurrency(summary.purchase_returns || 0)}</td></tr>
          <tr><td style="color: #10b981;">+ Float Additions / Cash In:</td><td style="text-align: right;">+${formatCurrency(summary.manual_cash_in)}</td></tr>
          <tr class="bold" style="color: #10b981;"><td>Total Cash Inflow:</td><td style="text-align: right;">+${formatCurrency(summary.total_cash_in)}</td></tr>
          <tr><td style="color: #f43f5e;">- Cash Purchases:</td><td style="text-align: right;">-${formatCurrency(summary.cash_purchases)}</td></tr>
          <tr><td style="color: #f43f5e;">- Cash Returns:</td><td style="text-align: right;">-${formatCurrency(summary.cash_returns)}</td></tr>
          <tr><td style="color: #f43f5e;">- Supplier Payments:</td><td style="text-align: right;">-${formatCurrency(summary.supplier_payments)}</td></tr>
          <tr><td style="color: #f43f5e;">- Operating Shop Expenses:</td><td style="text-align: right;">-${formatCurrency(summary.expenses || 0)}</td></tr>
          <tr><td style="color: #f43f5e;">- Staff Salary Advances:</td><td style="text-align: right;">-${formatCurrency(summary.staff_advances || 0)}</td></tr>
          <tr><td style="color: #f43f5e;">- Manual Cash Out / Safe Drops:</td><td style="text-align: right;">-${formatCurrency(summary.manual_cash_out)}</td></tr>
          <tr class="bold" style="color: #f43f5e;"><td>Total Cash Outflow:</td><td style="text-align: right;">-${formatCurrency(summary.total_cash_out)}</td></tr>
          <tr class="total-row"><td style="padding: 6px 0;">Expected Cash in Drawer:</td><td style="text-align: right; padding: 6px 0;">${formatCurrency(summary.expected_balance)}</td></tr>
          ${isClosed ? `
            <tr><td style="padding-top: 6px;"><strong>Actual Cash Counted:</strong></td><td style="text-align: right; padding-top: 6px; font-weight: bold;">${formatCurrency(session.closing_balance_actual)}</td></tr>
            <tr style="font-weight: bold; color: ${diff === 0 ? '#10b981' : diff > 0 ? '#3b82f6' : '#f43f5e'};">
              <td>Reconciliation Discrepancy:</td>
              <td style="text-align: right;">${diff === 0 ? 'Balanced (0.00)' : (diff > 0 ? '+' : '') + formatCurrency(diff)}</td>
            </tr>
          ` : ''}
        </table>

        ${session.notes ? `<div style="font-size: 11px; margin: 8px 0; background: #f8fafc; padding: 6px; border-radius: 4px;"><strong>Notes:</strong> ${session.notes}</div>` : ''}

        <div class="section-title">Itemized Shift Transactions (${orderedTxns.length})</div>
        <table class="tx-table">
          <thead>
            <tr>
              <th style="width: 30px;">#</th>
              <th style="width: 70px;">Time</th>
              <th style="width: 120px;">Type</th>
              <th>Description / Reference</th>
              <th style="width: 90px; text-align: right;">Amount</th>
              <th style="width: 95px; text-align: right;">Balance</th>
            </tr>
          </thead>
          <tbody>
            ${rowsHtml || '<tr><td colspan="6" style="text-align:center; padding: 12px; color: #94a3b8;">No transactions in this shift</td></tr>'}
          </tbody>
        </table>

        <div class="signatures">
          <div><div class="sig-line">Cashier Signature</div></div>
          <div><div class="sig-line">Manager / Supervisor Signature</div></div>
        </div>

        <script>
          window.onload = function() { window.print(); };
        </script>
      </body>
      </html>
    `;

    win.document.open();
    win.document.write(htmlContent);
    win.document.close();
  };

  useEffect(() => {
    if (isOpen) {
      fetchCurrentDrawer();
      setActiveTab("overview");
      setSuccessMsg("");
      setErrorMsg("");
    }
  }, [isOpen, fetchCurrentDrawer]);

  useEffect(() => {
    if (isOpen && activeTab === "history") {
      fetchHistory();
    }
  }, [isOpen, activeTab, fetchHistory]);

  useEffect(() => {
    if (isOpen && activeTab === "report") {
      fetchDetailedReport(reportSessionId);
    }
  }, [isOpen, activeTab, reportSessionId, fetchDetailedReport]);

  // Close on Escape key
  useEffect(() => {
    if (!isOpen) return;

    const handleKeyDown = (e) => {
      if (e.key === "Escape") {
        e.preventDefault();
        onClose();
      }
    };

    window.addEventListener("keydown", handleKeyDown);
    return () => window.removeEventListener("keydown", handleKeyDown);
  }, [isOpen, onClose]);

  const mouseDownTargetRef = useRef(null);

  const handleMouseDown = (e) => {
    mouseDownTargetRef.current = e.target;
  };

  const handleBackdropClick = (e) => {
    if (e.target === e.currentTarget && mouseDownTargetRef.current === e.currentTarget && !submitting) {
      onClose();
    }
  };

  const handleOpenDrawer = async (e) => {
    e.preventDefault();
    setSubmitting(true);
    setErrorMsg("");
    setSuccessMsg("");
    try {
      const res = await axios.post("/api/cash-drawer/open", {
        opening_balance: Number(openingBalance) || 0,
        notes: openingNotes,
      });
      setSuccessMsg("Cash drawer register opened successfully.");
      setOpeningBalance("0");
      setOpeningNotes("");
      await fetchCurrentDrawer();
      setActiveTab("overview");
      window.dispatchEvent(new CustomEvent("cash-drawer-changed"));
      window.dispatchEvent(new CustomEvent("accounts-changed"));
      try { localStorage.setItem("cash_drawer_sync", String(Date.now())); } catch {}
      try { localStorage.setItem("accounts_sync", String(Date.now())); } catch {}
      if (onSessionUpdated) onSessionUpdated(res.data?.session);
    } catch (err) {
      setErrorMsg(err.response?.data?.message || err.response?.data?.errors?.session?.[0] || "Could not open drawer.");
    } finally {
      setSubmitting(false);
    }
  };

  const handleRecordTxn = async (e) => {
    e.preventDefault();
    if (!txnAmount || Number(txnAmount) <= 0) {
      setErrorMsg("Please enter a valid positive amount.");
      return;
    }
    if (!txnNotes.trim()) {
      setErrorMsg("Please provide a reason/note for this cash adjustment.");
      return;
    }
    setSubmitting(true);
    setErrorMsg("");
    setSuccessMsg("");
    try {
      await axios.post("/api/cash-drawer/transaction", {
        type: selectedTxnType.value,
        amount: Number(txnAmount),
        notes: txnNotes.trim(),
      });
      setSuccessMsg(`${selectedTxnType.label} recorded successfully.`);
      setTxnAmount("");
      setTxnNotes("");
      await fetchCurrentDrawer();
      setActiveTab("overview");
      window.dispatchEvent(new CustomEvent("cash-drawer-changed"));
      window.dispatchEvent(new CustomEvent("accounts-changed"));
      try { localStorage.setItem("cash_drawer_sync", String(Date.now())); } catch {}
      try { localStorage.setItem("accounts_sync", String(Date.now())); } catch {}
    } catch (err) {
      setErrorMsg(err.response?.data?.message || "Failed to record cash transaction.");
    } finally {
      setSubmitting(false);
    }
  };

  const handleCloseDrawer = async (e) => {
    e.preventDefault();
    if (actualClosingBalance === "" || isNaN(Number(actualClosingBalance))) {
      setErrorMsg("Please enter the actual counted cash in drawer.");
      return;
    }
    setSubmitting(true);
    setErrorMsg("");
    setSuccessMsg("");
    try {
      const res = await axios.post("/api/cash-drawer/close", {
        closing_balance_actual: Number(actualClosingBalance),
        notes: closingNotes.trim(),
      });
      const diff = Number(res.data?.session?.difference || 0);
      const diffLabel = diff === 0 ? "Perfect balance" : diff > 0 ? `Over by ${formatCurrency(diff)}` : `Short by ${formatCurrency(Math.abs(diff))}`;
      setSuccessMsg(`Register shift closed successfully (${diffLabel}).`);
      setClosingNotes("");
      await fetchCurrentDrawer();
      setActiveTab("overview");
      window.dispatchEvent(new CustomEvent("cash-drawer-changed"));
      window.dispatchEvent(new CustomEvent("accounts-changed"));
      try { localStorage.setItem("cash_drawer_sync", String(Date.now())); } catch {}
      try { localStorage.setItem("accounts_sync", String(Date.now())); } catch {}
      if (onSessionUpdated) onSessionUpdated(null);
    } catch (err) {
      setErrorMsg(err.response?.data?.message || err.response?.data?.errors?.session?.[0] || "Failed to close drawer.");
    } finally {
      setSubmitting(false);
    }
  };

  if (!isOpen || !canOperateDrawer) return null;

  const isOpenShift = !!sessionData?.is_open;
  const summary = sessionData?.summary;
  const session = sessionData?.session;

  const expectedClosing = summary?.expected_balance ?? 0;
  const counted = Number(actualClosingBalance || 0);
  const liveDiff = counted - expectedClosing;

  return (
    <div
      onMouseDown={handleMouseDown}
      onClick={handleBackdropClick}
      className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/60 backdrop-blur-xs transition-opacity animate-in fade-in duration-200 cursor-default"
      role="dialog"
      aria-modal="true"
    >
      <div
        onClick={(e) => e.stopPropagation()}
        className={`w-full ${activeTab === "report" ? "max-w-4xl" : "max-w-2xl"} rounded-2xl shadow-2xl overflow-hidden border flex flex-col max-h-[92dvh] transition-all ${
          isDark ? "bg-slate-900 border-slate-700 text-slate-100" : "bg-white border-gray-200 text-gray-900"
        }`}
      >
        {/* Header */}
        <div
          className={`flex items-center justify-between px-6 py-4 border-b ${
            isDark ? "border-slate-800 bg-slate-800/60" : "border-gray-100 bg-gray-50/80"
          }`}
        >
          <div className="flex items-center gap-3">
            <div
              className="p-2 rounded-xl text-white shadow-sm"
              style={{ background: theme?.primary_color || "#3b82f6" }}
            >
              <BanknotesIcon className="w-5 h-5" />
            </div>
            <div>
              <div className="flex items-center gap-2">
                <h2 className="text-base font-bold">Cash Drawer & Register</h2>
                <span
                  className={`text-[11px] font-semibold px-2 py-0.5 rounded-full inline-flex items-center gap-1 ${
                    isOpenShift
                      ? "bg-emerald-500/10 text-emerald-500 border border-emerald-500/30"
                      : "bg-amber-500/10 text-amber-500 border border-amber-500/30"
                  }`}
                >
                  <span className={`w-1.5 h-1.5 rounded-full ${isOpenShift ? "bg-emerald-500" : "bg-amber-500"}`} />
                  {isOpenShift ? "Shift Open" : "Register Closed"}
                </span>
              </div>
              <p className={`text-xs ${isDark ? "text-slate-400" : "text-gray-500"}`}>
                {isOpenShift && session
                  ? `Shift started ${new Date(session.opened_at).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })} by ${session.user?.name || "Cashier"}`
                  : "Start a new register shift with an opening cash float"}
              </p>
            </div>
          </div>
          <div className="flex items-center gap-1">
            <button
              onClick={fetchCurrentDrawer}
              disabled={loading}
              title="Refresh register stats"
              className={`p-2 rounded-lg transition-colors ${
                isDark ? "hover:bg-slate-800 text-slate-400 hover:text-slate-200" : "hover:bg-gray-100 text-gray-500 hover:text-gray-800"
              }`}
            >
              <ArrowPathIcon className={`w-4 h-4 ${loading ? "animate-spin" : ""}`} />
            </button>
            <button
              onClick={onClose}
              className={`p-2 rounded-lg transition-colors ${
                isDark ? "hover:bg-slate-800 text-slate-400 hover:text-slate-200" : "hover:bg-gray-100 text-gray-500 hover:text-gray-800"
              }`}
            >
              <XMarkIcon className="w-5 h-5" />
            </button>
          </div>
        </div>

        {/* Tab Navigation */}
        <div
          className={`flex items-center gap-1 px-6 pt-2 border-b text-xs font-semibold overflow-x-auto ${
            isDark ? "border-slate-800 bg-slate-900" : "border-gray-100 bg-white"
          }`}
        >
          {(isOpenShift
            ? [
                { id: "overview", label: "Overview & Balance" },
                ...(canRecordTxn ? [{ id: "actions", label: "Cash In / Cash Out" }] : []),
                ...(canCloseShift ? [{ id: "close", label: "Close Register" }] : []),
                { id: "report", label: "Detailed Report" },
                { id: "history", label: "Shift History" },
              ]
            : [
                { id: "overview", label: canOpenShift ? "Open Register" : "Register Status" },
                { id: "report", label: "Detailed Report" },
                { id: "history", label: "Shift History" },
              ]
          ).map((tab) => (
            <button
              key={tab.id}
              onClick={() => {
                setActiveTab(tab.id);
                setErrorMsg("");
                setSuccessMsg("");
              }}
              className={`px-3 py-2 border-b-2 transition-all whitespace-nowrap ${
                activeTab === tab.id
                  ? "border-blue-500 text-blue-500 font-bold"
                  : "border-transparent text-gray-500 hover:text-gray-700 dark:text-slate-400 dark:hover:text-slate-200"
              }`}
            >
              {tab.label}
            </button>
          ))}
        </div>

        {/* Alerts */}
        {errorMsg && (
          <div className="mx-6 mt-4 p-3 rounded-xl bg-rose-500/10 border border-rose-500/20 text-rose-500 text-xs flex items-center gap-2">
            <ExclamationTriangleIcon className="w-4 h-4 shrink-0" />
            <span>{errorMsg}</span>
          </div>
        )}
        {successMsg && (
          <div className="mx-6 mt-4 p-3 rounded-xl bg-emerald-500/10 border border-emerald-500/20 text-emerald-500 text-xs flex items-center gap-2">
            <CheckCircleIcon className="w-4 h-4 shrink-0" />
            <span>{successMsg}</span>
          </div>
        )}

        {/* Body */}
        <div className="p-4 sm:p-6 overflow-y-auto space-y-4 flex-1">
          {/* View 1: When drawer is CLOSED -> Open Shift Form */}
          {!isOpenShift && activeTab === "overview" && (
            canOpenShift ? (
            <form onSubmit={handleOpenDrawer} className="space-y-4">
              <div
                className={`p-4 rounded-xl border flex items-start gap-3 ${
                  isDark ? "bg-slate-800/40 border-slate-700" : "bg-blue-50/50 border-blue-100"
                }`}
              >
                <BanknotesIcon className="w-6 h-6 text-blue-500 shrink-0 mt-0.5" />
                <div className="text-xs space-y-1">
                  <p className="font-semibold text-sm">Register is currently closed</p>
                  <p className={isDark ? "text-slate-400" : "text-gray-600"}>
                    Count the physical cash in the drawer (opening float / change) and record it below to begin recording cash transactions for this shift.
                  </p>
                </div>
              </div>

              {sessionData?.last_closed_session && (
                <div className={`p-3 rounded-xl border flex items-center justify-between text-xs ${
                  isDark ? "bg-slate-800/60 border-slate-700 text-slate-200" : "bg-emerald-50/60 border-emerald-200 text-slate-800"
                }`}>
                  <div>
                    <div className="font-bold">Last Shift (#{sessionData.last_closed_session.id}) Actual Closing Cash</div>
                    <div className="text-[11px] opacity-80">
                      Counted: <strong>{formatCurrency(sessionData.last_closed_session.closing_balance_actual ?? 0)}</strong>
                    </div>
                  </div>
                  <button
                    type="button"
                    onClick={() => setOpeningBalance(String(sessionData.last_closed_session.closing_balance_actual ?? 0))}
                    className="px-2.5 py-1.5 rounded-lg font-bold bg-emerald-600 text-white hover:bg-emerald-500 transition-colors"
                  >
                    Use {formatCurrency(sessionData.last_closed_session.closing_balance_actual ?? 0)}
                  </button>
                </div>
              )}

              <div>
                <label className="block text-xs font-semibold uppercase tracking-wider mb-1">
                  Opening Cash Float Amount
                </label>
                <div className="relative">
                  <input
                    type="number"
                    step="any"
                    min="0"
                    required
                    value={openingBalance}
                    onChange={(e) => setOpeningBalance(e.target.value)}
                    placeholder="0.00"
                    className={`w-full px-3 py-2.5 rounded-xl border text-base font-bold text-right transition-colors ${
                      isDark
                        ? "bg-slate-800 border-slate-700 text-slate-100 focus:border-blue-500"
                        : "bg-white border-gray-300 text-gray-900 focus:border-blue-500"
                    } focus:outline-hidden`}
                  />
                  <span className="absolute left-3 top-3 text-xs font-semibold text-gray-400">
                    Float
                  </span>
                </div>
              </div>

              <div>
                <label className="block text-xs font-semibold uppercase tracking-wider mb-1">
                  Shift Notes (Optional)
                </label>
                <textarea
                  rows={2}
                  value={openingNotes}
                  onChange={(e) => setOpeningNotes(e.target.value)}
                  placeholder="e.g. Started morning shift with change"
                  className={`w-full px-3 py-2 rounded-xl border text-xs transition-colors ${
                    isDark
                      ? "bg-slate-800 border-slate-700 text-slate-100 focus:border-blue-500"
                      : "bg-white border-gray-300 text-gray-900 focus:border-blue-500"
                  } focus:outline-hidden`}
                />
              </div>

              <button
                type="submit"
                disabled={submitting}
                className="w-full py-3 rounded-xl font-bold text-sm text-white shadow-md transition-all active:scale-[0.99] flex items-center justify-center gap-2"
                style={{ background: theme?.primary_color || "#3b82f6" }}
              >
                {submitting ? "Opening Register…" : "Open Cash Register Shift"}
              </button>
            </form>
            ) : (
              <div
                className={`p-4 rounded-xl border flex items-start gap-3 ${
                  isDark ? "bg-slate-800/40 border-slate-700" : "bg-amber-50/50 border-amber-100"
                }`}
              >
                <BanknotesIcon className="w-6 h-6 text-amber-500 shrink-0 mt-0.5" />
                <div className="text-xs space-y-1">
                  <p className="font-semibold text-sm">Register is currently closed</p>
                  <p className={isDark ? "text-slate-400" : "text-gray-600"}>
                    You do not have permission to open a new cash register shift.
                  </p>
                </div>
              </div>
            )
          )}

          {/* View 2: When drawer is OPEN -> Overview Tab */}
          {isOpenShift && activeTab === "overview" && summary && (
            <div className="space-y-4">
              {/* Expected cash in drawer banner */}
              <div
                className="p-5 rounded-2xl border text-center relative overflow-hidden"
                style={{
                  background: isDark
                    ? "linear-gradient(135deg, rgba(30, 41, 59, 0.9), rgba(15, 23, 42, 0.95))"
                    : "linear-gradient(135deg, rgba(239, 246, 255, 0.9), rgba(240, 253, 244, 0.95))",
                  borderColor: isDark ? "rgba(51, 65, 85, 0.6)" : "rgba(191, 219, 254, 0.8)",
                }}
              >
                <p className={`text-xs font-semibold uppercase tracking-wider ${isDark ? "text-slate-400" : "text-gray-500"}`}>
                  Expected Cash in Drawer
                </p>
                <h3 className="text-3xl font-black mt-1 text-emerald-500">
                  {formatCurrency(summary.expected_balance)}
                </h3>
                <p className={`text-xs mt-1 ${isDark ? "text-slate-400" : "text-gray-500"}`}>
                  Formula: <span className="font-semibold">{formatCurrency(summary.opening_balance)}</span> (Float) + <span className="text-emerald-500 font-semibold">{formatCurrency(summary.total_cash_in)}</span> (In) − <span className="text-rose-500 font-semibold">{formatCurrency(summary.total_cash_out)}</span> (Out) • {summary.transactions_count} txns
                </p>
              </div>

              {/* Inflow vs Outflow grid */}
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 text-xs">
                {/* Cash Inflow */}
                <div className={`p-3.5 rounded-xl border ${isDark ? "bg-slate-800/40 border-slate-700/60" : "bg-emerald-50/40 border-emerald-100"}`}>
                  <div className="flex items-center justify-between font-bold text-emerald-500 mb-2">
                    <span className="flex items-center gap-1">
                      <ArrowDownLeftIcon className="w-3.5 h-3.5" /> Total Cash In
                    </span>
                    <span>+{formatCurrency(summary.total_cash_in)}</span>
                  </div>
                  <div className="space-y-1.5 text-[11px] opacity-90">
                    <div className="flex justify-between">
                      <span className={isDark ? "text-slate-400" : "text-gray-600"}>Cash Sales:</span>
                      <span className="font-semibold">+{formatCurrency(summary.cash_sales)}</span>
                    </div>
                    <div className="flex justify-between">
                      <span className={isDark ? "text-slate-400" : "text-gray-600"}>Customer Receipts:</span>
                      <span className="font-semibold">+{formatCurrency(summary.customer_payments)}</span>
                    </div>
                    <div className="flex justify-between">
                      <span className={isDark ? "text-slate-400" : "text-gray-600"}>Supplier Returns:</span>
                      <span className="font-semibold">+{formatCurrency(summary.purchase_returns || 0)}</span>
                    </div>
                    <div className="flex justify-between">
                      <span className={isDark ? "text-slate-400" : "text-gray-600"}>Manual Cash In:</span>
                      <span className="font-semibold">+{formatCurrency(summary.manual_cash_in)}</span>
                    </div>
                  </div>
                </div>

                {/* Cash Outflow */}
                <div className={`p-3.5 rounded-xl border ${isDark ? "bg-slate-800/40 border-slate-700/60" : "bg-rose-50/40 border-rose-100"}`}>
                  <div className="flex items-center justify-between font-bold text-rose-500 mb-2">
                    <span className="flex items-center gap-1">
                      <ArrowUpRightIcon className="w-3.5 h-3.5" /> Total Cash Out
                    </span>
                    <span>-{formatCurrency(summary.total_cash_out)}</span>
                  </div>
                  <div className="space-y-1.5 text-[11px] opacity-90">
                    <div className="flex justify-between">
                      <span className={isDark ? "text-slate-400" : "text-gray-600"}>Cash Purchases:</span>
                      <span className="font-semibold">-{formatCurrency(summary.cash_purchases)}</span>
                    </div>
                    <div className="flex justify-between">
                      <span className={isDark ? "text-slate-400" : "text-gray-600"}>Sale Returns / Refunds:</span>
                      <span className="font-semibold">-{formatCurrency(summary.cash_returns || 0)}</span>
                    </div>
                    <div className="flex justify-between">
                      <span className={isDark ? "text-slate-400" : "text-gray-600"}>Supplier Payments:</span>
                      <span className="font-semibold">-{formatCurrency(summary.supplier_payments)}</span>
                    </div>
                    <div className="flex justify-between">
                      <span className={isDark ? "text-slate-400" : "text-gray-600"}>Shop Expenses:</span>
                      <span className="font-semibold">-{formatCurrency(summary.expenses || 0)}</span>
                    </div>
                    <div className="flex justify-between">
                      <span className={isDark ? "text-slate-400" : "text-gray-600"}>Staff Advances:</span>
                      <span className="font-semibold">-{formatCurrency(summary.staff_advances || 0)}</span>
                    </div>
                    <div className="flex justify-between">
                      <span className={isDark ? "text-slate-400" : "text-gray-600"}>Manual Cash Out:</span>
                      <span className="font-semibold">-{formatCurrency(summary.manual_cash_out)}</span>
                    </div>
                  </div>
                </div>
              </div>

              {/* Action shortcuts */}
              {(canRecordTxn || canCloseShift) && (
                <div className="flex flex-wrap items-center gap-2 pt-2">
                  {canRecordTxn && (
                    <>
                      <button
                        type="button"
                        onClick={() => {
                          setSelectedTxnType(TRANSACTION_TYPE_OPTIONS[0]);
                          setActiveTab("actions");
                        }}
                        className={`flex-1 py-2.5 px-3 rounded-xl border text-xs font-bold transition-all flex items-center justify-center gap-1.5 ${
                          isDark ? "border-slate-700 hover:bg-slate-800 text-emerald-400" : "border-emerald-200 hover:bg-emerald-50 text-emerald-700"
                        }`}
                      >
                        <ArrowDownLeftIcon className="w-4 h-4" /> Add Cash In
                      </button>
                      <button
                        type="button"
                        onClick={() => {
                          setSelectedTxnType(TRANSACTION_TYPE_OPTIONS[1]);
                          setActiveTab("actions");
                        }}
                        className={`flex-1 py-2.5 px-3 rounded-xl border text-xs font-bold transition-all flex items-center justify-center gap-1.5 ${
                          isDark ? "border-slate-700 hover:bg-slate-800 text-rose-400" : "border-rose-200 hover:bg-rose-50 text-rose-700"
                        }`}
                      >
                        <ArrowUpRightIcon className="w-4 h-4" /> Cash Out / Expense
                      </button>
                    </>
                  )}
                  {canCloseShift && (
                    <button
                      type="button"
                      onClick={() => setActiveTab("close")}
                      className={`flex-1 py-2.5 px-3 rounded-xl border text-xs font-bold transition-all flex items-center justify-center gap-1.5 ${
                        isDark ? "border-slate-700 hover:bg-slate-800 text-amber-400" : "border-amber-200 hover:bg-amber-50 text-amber-700"
                      }`}
                    >
                      <LockClosedIcon className="w-4 h-4" /> Close Shift
                    </button>
                  )}
                </div>
              )}

              {/* Recent transactions in this shift */}
              <div className="pt-2">
                <h4 className="text-xs font-bold uppercase tracking-wider mb-2">
                  Shift Transactions ({session?.transactions?.length || 0})
                </h4>
                {session?.transactions?.length > 0 ? (
                  <div className="space-y-1.5 max-h-48 overflow-y-auto pr-1">
                    {sortAndAttachRunningBalance(session.transactions, session.opening_balance).map((tx) => {
                      const isPlus = CASH_IN_TYPES.includes(tx.type);
                      return (
                        <div
                          key={tx.id}
                          className={`p-2.5 rounded-lg border flex items-center justify-between text-xs ${
                            isDark ? "bg-slate-800/30 border-slate-700/50" : "bg-gray-50 border-gray-100"
                          }`}
                        >
                          <div>
                            <span className={`mr-1.5 font-mono text-[10px] ${isDark ? "text-slate-400" : "text-gray-400"}`}>
                              #{tx.seq}
                            </span>
                            <span className="font-semibold capitalize">
                              {tx.type.replace("_", " ")}
                            </span>
                            {tx.reference_label && (
                              <span className="ml-1.5 px-1.5 py-0.5 rounded text-[10px] font-semibold bg-blue-500/10 text-blue-500">
                                {tx.reference_label}{tx.party_name ? ` • ${tx.party_name}` : ""}
                              </span>
                            )}
                            {tx.notes && (
                              <span className={`ml-2 text-[11px] ${isDark ? "text-slate-400" : "text-gray-500"}`}>
                                • {tx.notes}
                              </span>
                            )}
                            <div className={`text-[10px] ${isDark ? "text-slate-500" : "text-gray-400"}`}>
                              {new Date(tx.created_at).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}
                            </div>
                          </div>
                          <div className="text-right">
                            <div className={`font-bold ${isPlus ? "text-emerald-500" : "text-rose-500"}`}>
                              {isPlus ? "+" : "-"}{formatCurrency(tx.amount)}
                            </div>
                            <div className={`text-[10px] font-medium ${isDark ? "text-slate-400" : "text-gray-500"}`}>
                              Bal: {formatCurrency(tx.balance_after)}
                            </div>
                          </div>
                        </div>
                      );
                    })}
                  </div>
                ) : (
                  <p className={`text-xs italic ${isDark ? "text-slate-500" : "text-gray-400"}`}>
                    No transactions recorded in this shift yet.
                  </p>
                )}
              </div>

              {/* View Full Detailed Report Button */}
              <div className="pt-1">
                <button
                  type="button"
                  onClick={() => {
                    setReportSessionId(session?.id);
                    setActiveTab("report");
                  }}
                  className={`w-full py-2.5 px-3 rounded-xl border text-xs font-bold transition-all flex items-center justify-center gap-1.5 ${
                    isDark ? "border-slate-700 hover:bg-slate-800 text-blue-400" : "border-blue-200 hover:bg-blue-50 text-blue-700"
                  }`}
                >
                  <DocumentTextIcon className="w-4 h-4" /> View Detailed Shift Report & Audit Ledger
                </button>
              </div>
            </div>
          )}

          {/* View 3: Actions Tab (Cash In / Out) */}
          {isOpenShift && activeTab === "actions" && (
            <form onSubmit={handleRecordTxn} className="space-y-4">
              <div>
                <label className="block text-xs font-semibold uppercase tracking-wider mb-1">
                  Transaction Type
                </label>
                <Select
                  options={TRANSACTION_TYPE_OPTIONS}
                  value={selectedTxnType}
                  onChange={(opt) => setSelectedTxnType(opt)}
                  styles={selectStyles}
                  isSearchable={false}
                />
              </div>

              <div>
                <label className="block text-xs font-semibold uppercase tracking-wider mb-1">
                  Amount
                </label>
                <input
                  type="number"
                  step="any"
                  min="0.01"
                  required
                  value={txnAmount}
                  onChange={(e) => setTxnAmount(e.target.value)}
                  placeholder="0.00"
                  className={`w-full px-3 py-2.5 rounded-xl border text-sm font-bold text-right transition-colors ${
                    isDark
                      ? "bg-slate-800 border-slate-700 text-slate-100 focus:border-blue-500"
                      : "bg-white border-gray-300 text-gray-900 focus:border-blue-500"
                  } focus:outline-hidden`}
                />
              </div>

              <div>
                <label className="block text-xs font-semibold uppercase tracking-wider mb-1">
                  Reason / Purpose (Required)
                </label>
                <input
                  type="text"
                  required
                  value={txnNotes}
                  onChange={(e) => setTxnNotes(e.target.value)}
                  placeholder="e.g. Office tea expense, Petty cash top up, Owner draw"
                  className={`w-full px-3 py-2 rounded-xl border text-xs transition-colors ${
                    isDark
                      ? "bg-slate-800 border-slate-700 text-slate-100 focus:border-blue-500"
                      : "bg-white border-gray-300 text-gray-900 focus:border-blue-500"
                  } focus:outline-hidden`}
                />
              </div>

              <div className="flex gap-2 pt-2">
                <button
                  type="button"
                  onClick={() => setActiveTab("overview")}
                  className={`flex-1 py-2.5 rounded-xl border text-xs font-semibold transition-colors ${
                    isDark ? "border-slate-700 hover:bg-slate-800" : "border-gray-300 hover:bg-gray-100"
                  }`}
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  disabled={submitting}
                  className="flex-1 py-2.5 rounded-xl font-bold text-xs text-white shadow-sm transition-all"
                  style={{
                    background: selectedTxnType.value === "cash_in" ? "#10b981" : "#f43f5e",
                  }}
                >
                  {submitting ? "Saving…" : `Confirm ${selectedTxnType.label.split(" ")[0]}`}
                </button>
              </div>
            </form>
          )}

          {/* View 4: Close Tab */}
          {isOpenShift && activeTab === "close" && (
            <form onSubmit={handleCloseDrawer} className="space-y-4">
              <div
                className={`p-4 rounded-xl border ${
                  isDark ? "bg-slate-800/40 border-slate-700" : "bg-amber-50/50 border-amber-100"
                }`}
              >
                <div className="flex justify-between items-center text-xs">
                  <span className="font-semibold text-gray-500 dark:text-slate-400">System Expected Cash:</span>
                  <span className="font-bold text-base text-emerald-500">{formatCurrency(expectedClosing)}</span>
                </div>
              </div>

              <div>
                <label className="block text-xs font-semibold uppercase tracking-wider mb-1">
                  Actual Cash Counted in Hand
                </label>
                <input
                  type="number"
                  step="any"
                  min="0"
                  required
                  value={actualClosingBalance}
                  onChange={(e) => setActualClosingBalance(e.target.value)}
                  placeholder="0.00"
                  className={`w-full px-3 py-2.5 rounded-xl border text-base font-bold text-right transition-colors ${
                    isDark
                      ? "bg-slate-800 border-slate-700 text-slate-100 focus:border-blue-500"
                      : "bg-white border-gray-300 text-gray-900 focus:border-blue-500"
                  } focus:outline-hidden`}
                />
              </div>

              {/* Over / Short indicator */}
              <div
                className={`p-3 rounded-xl border flex items-center justify-between text-xs font-bold ${
                  liveDiff === 0
                    ? "bg-emerald-500/10 border-emerald-500/20 text-emerald-500"
                    : liveDiff > 0
                    ? "bg-blue-500/10 border-blue-500/20 text-blue-500"
                    : "bg-rose-500/10 border-rose-500/20 text-rose-500"
                }`}
              >
                <span>Reconciliation Difference:</span>
                <span>
                  {liveDiff === 0
                    ? "Perfect Match (0.00)"
                    : liveDiff > 0
                    ? `Over by +${formatCurrency(liveDiff)}`
                    : `Short by -${formatCurrency(Math.abs(liveDiff))}`}
                </span>
              </div>

              <div>
                <label className="block text-xs font-semibold uppercase tracking-wider mb-1">
                  Closing Notes (Optional)
                </label>
                <textarea
                  rows={2}
                  value={closingNotes}
                  onChange={(e) => setClosingNotes(e.target.value)}
                  placeholder="e.g. Count matched evening tally"
                  className={`w-full px-3 py-2 rounded-xl border text-xs transition-colors ${
                    isDark
                      ? "bg-slate-800 border-slate-700 text-slate-100 focus:border-blue-500"
                      : "bg-white border-gray-300 text-gray-900 focus:border-blue-500"
                  } focus:outline-hidden`}
                />
              </div>

              <div className="flex gap-2 pt-2">
                <button
                  type="button"
                  onClick={() => setActiveTab("overview")}
                  className={`flex-1 py-2.5 rounded-xl border text-xs font-semibold transition-colors ${
                    isDark ? "border-slate-700 hover:bg-slate-800" : "border-gray-300 hover:bg-gray-100"
                  }`}
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  disabled={submitting}
                  className="flex-1 py-2.5 rounded-xl font-bold text-xs text-white bg-rose-600 hover:bg-rose-700 shadow-sm transition-all"
                >
                  {submitting ? "Closing Shift…" : "Confirm & Close Shift"}
                </button>
              </div>
            </form>
          )}

          {/* View 6: Detailed Report Tab */}
          {activeTab === "report" && (
            <div className="space-y-4">
              {loadingReport ? (
                <div className="py-12 text-center text-xs text-gray-500 flex flex-col items-center justify-center gap-2">
                  <ArrowPathIcon className="w-6 h-6 animate-spin text-blue-500" />
                  <span>Loading detailed shift report…</span>
                </div>
              ) : !detailedReport ? (
                <div className="py-12 text-center text-xs text-gray-500 italic">
                  No shift data found. Please select a shift from Shift History.
                </div>
              ) : (
                (() => {
                  const repSession = detailedReport.session;
                  const repSummary = detailedReport.summary;
                  const repTxns = sortAndAttachRunningBalance(detailedReport.transactions || [], repSession.opening_balance);
                  const isClosed = repSession.status === "closed";
                  const repDiff = Number(repSession.difference || 0);

                  const filteredTxns = repTxns.filter((tx) => {
                    if (!reportTxnFilter.trim()) return true;
                    const q = reportTxnFilter.toLowerCase();
                    return (
                      (tx.type || "").toLowerCase().includes(q) ||
                      (tx.notes || "").toLowerCase().includes(q) ||
                      (tx.reference_type || "").toLowerCase().includes(q) ||
                      String(tx.amount).includes(q) ||
                      String(tx.reference_id || "").includes(q)
                    );
                  });

                  return (
                    <div className="space-y-4">
                      {/* Top Action & Meta Bar */}
                      <div
                        className={`p-4 rounded-xl border flex flex-wrap items-center justify-between gap-3 ${
                          isDark ? "bg-slate-800/40 border-slate-700" : "bg-slate-50 border-slate-200"
                        }`}
                      >
                        <div>
                          <div className="flex items-center gap-2">
                            <h4 className="text-sm font-extrabold">
                              Shift #{repSession.id} Detailed Report
                            </h4>
                            <span
                              className={`text-[10px] font-bold px-2 py-0.5 rounded-full ${
                                repSession.status === "open"
                                  ? "bg-emerald-500/10 text-emerald-500 border border-emerald-500/20"
                                  : "bg-slate-500/10 text-slate-400 border border-slate-500/20"
                              }`}
                            >
                              {repSession.status === "open" ? "Active Shift" : "Closed Shift"}
                            </span>
                          </div>
                          <p className={`text-xs mt-0.5 ${isDark ? "text-slate-400" : "text-gray-500"}`}>
                            Cashier: <strong className="font-semibold">{repSession.user?.name || "N/A"}</strong> • Opened:{" "}
                            {new Date(repSession.opened_at).toLocaleDateString()} {new Date(repSession.opened_at).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}
                            {repSession.closed_at ? ` • Closed: ${new Date(repSession.closed_at).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}` : ""}
                            {repSummary.duration && ` • Duration: ${repSummary.duration}`}
                          </p>
                        </div>

                        <div className="flex items-center gap-2">
                          <button
                            type="button"
                            onClick={() => fetchDetailedReport(reportSessionId)}
                            className={`p-2 rounded-lg border text-xs font-semibold transition-colors flex items-center gap-1 ${
                              isDark ? "border-slate-700 hover:bg-slate-800 text-slate-300" : "border-gray-200 hover:bg-white text-gray-700"
                            }`}
                            title="Refresh report data"
                          >
                            <ArrowPathIcon className="w-3.5 h-3.5" />
                          </button>
                          <button
                            type="button"
                            onClick={handlePrintDetailedReport}
                            className="px-3 py-2 rounded-xl text-xs font-bold text-white bg-blue-600 hover:bg-blue-700 shadow-sm flex items-center gap-1.5 transition-all"
                          >
                            <PrinterIcon className="w-4 h-4" />
                            <span>Print Shift Report</span>
                          </button>
                        </div>
                      </div>

                      {/* Summary Cards Grid */}
                      <div className="grid grid-cols-2 md:grid-cols-4 gap-2.5 text-xs">
                        {/* Float & Count */}
                        <div className={`p-3 rounded-xl border ${isDark ? "bg-slate-800/30 border-slate-700" : "bg-white border-gray-200"}`}>
                          <span className={isDark ? "text-slate-400" : "text-gray-500"}>Opening Float</span>
                          <div className="text-base font-bold mt-0.5">{formatCurrency(repSummary.opening_balance)}</div>
                          <span className="text-[10px] text-gray-400">Initial register cash</span>
                        </div>

                        {/* Inflows */}
                        <div className={`p-3 rounded-xl border ${isDark ? "bg-emerald-950/20 border-emerald-800/40" : "bg-emerald-50/50 border-emerald-200"}`}>
                          <span className="text-emerald-600 font-semibold flex items-center gap-1">
                            <ArrowDownLeftIcon className="w-3.5 h-3.5" /> Total Cash In
                          </span>
                          <div className="text-base font-bold text-emerald-600 mt-0.5">+{formatCurrency(repSummary.total_cash_in)}</div>
                          <span className="text-[10px] text-emerald-500/80">Sales & receipts</span>
                        </div>

                        {/* Outflows */}
                        <div className={`p-3 rounded-xl border ${isDark ? "bg-rose-950/20 border-rose-800/40" : "bg-rose-50/50 border-rose-200"}`}>
                          <span className="text-rose-600 font-semibold flex items-center gap-1">
                            <ArrowUpRightIcon className="w-3.5 h-3.5" /> Total Cash Out
                          </span>
                          <div className="text-base font-bold text-rose-600 mt-0.5">-{formatCurrency(repSummary.total_cash_out)}</div>
                          <span className="text-[10px] text-rose-500/80">Purchases & payouts</span>
                        </div>

                        {/* Net Expected */}
                        <div className={`p-3 rounded-xl border ${isDark ? "bg-blue-950/20 border-blue-800/40" : "bg-blue-50/50 border-blue-200"}`}>
                          <span className="text-blue-600 font-semibold">Expected Balance</span>
                          <div className="text-base font-black text-blue-600 mt-0.5">{formatCurrency(repSummary.expected_balance)}</div>
                          {isClosed ? (
                            <span className={`text-[10px] font-bold ${repDiff === 0 ? "text-emerald-500" : repDiff > 0 ? "text-blue-500" : "text-rose-500"}`}>
                              {repDiff === 0 ? "Count matched" : repDiff > 0 ? `Over +${formatCurrency(repDiff)}` : `Short -${formatCurrency(Math.abs(repDiff))}`}
                            </span>
                          ) : (
                            <span className="text-[10px] text-blue-400">Shift in progress</span>
                          )}
                        </div>
                      </div>

                      {/* Detailed Flow Breakdown Matrix */}
                      <div className="grid grid-cols-1 md:grid-cols-2 gap-3 text-xs">
                        {/* Inflow categories */}
                        <div className={`p-3.5 rounded-xl border ${isDark ? "bg-slate-800/20 border-slate-700/60" : "bg-gray-50 border-gray-200"}`}>
                          <div className="font-bold text-emerald-500 mb-2 flex justify-between">
                            <span>Cash Inflow Breakdown</span>
                            <span>+{formatCurrency(repSummary.total_cash_in)}</span>
                          </div>
                          <div className="space-y-1.5 text-[11px]">
                            <div className="flex justify-between">
                              <span className={isDark ? "text-slate-400" : "text-gray-600"}>Cash Sales:</span>
                              <span className="font-semibold">+{formatCurrency(repSummary.cash_sales)}</span>
                            </div>
                            <div className="flex justify-between">
                              <span className={isDark ? "text-slate-400" : "text-gray-600"}>Customer Debt Receipts:</span>
                              <span className="font-semibold">+{formatCurrency(repSummary.customer_payments)}</span>
                            </div>
                            <div className="flex justify-between">
                              <span className={isDark ? "text-slate-400" : "text-gray-600"}>Supplier Returns:</span>
                              <span className="font-semibold">+{formatCurrency(repSummary.purchase_returns || 0)}</span>
                            </div>
                            <div className="flex justify-between">
                              <span className={isDark ? "text-slate-400" : "text-gray-600"}>Manual Float In:</span>
                              <span className="font-semibold">+{formatCurrency(repSummary.manual_cash_in)}</span>
                            </div>
                          </div>
                        </div>

                        {/* Outflow categories */}
                        <div className={`p-3.5 rounded-xl border ${isDark ? "bg-slate-800/20 border-slate-700/60" : "bg-gray-50 border-gray-200"}`}>
                          <div className="font-bold text-rose-500 mb-2 flex justify-between">
                            <span>Cash Outflow Breakdown</span>
                            <span>-{formatCurrency(repSummary.total_cash_out)}</span>
                          </div>
                          <div className="space-y-1.5 text-[11px]">
                            <div className="flex justify-between">
                              <span className={isDark ? "text-slate-400" : "text-gray-600"}>Cash Purchases:</span>
                              <span className="font-semibold">-{formatCurrency(repSummary.cash_purchases)}</span>
                            </div>
                            <div className="flex justify-between">
                              <span className={isDark ? "text-slate-400" : "text-gray-600"}>Cash Returns / Refunds:</span>
                              <span className="font-semibold">-{formatCurrency(repSummary.cash_returns)}</span>
                            </div>
                            <div className="flex justify-between">
                              <span className={isDark ? "text-slate-400" : "text-gray-600"}>Supplier Payments:</span>
                              <span className="font-semibold">-{formatCurrency(repSummary.supplier_payments)}</span>
                            </div>
                            <div className="flex justify-between">
                              <span className={isDark ? "text-slate-400" : "text-gray-600"}>Shop Expenses:</span>
                              <span className="font-semibold">-{formatCurrency(repSummary.expenses || 0)}</span>
                            </div>
                            <div className="flex justify-between">
                              <span className={isDark ? "text-slate-400" : "text-gray-600"}>Staff Advances:</span>
                              <span className="font-semibold">-{formatCurrency(repSummary.staff_advances || 0)}</span>
                            </div>
                            <div className="flex justify-between">
                              <span className={isDark ? "text-slate-400" : "text-gray-600"}>Manual Cash Out:</span>
                              <span className="font-semibold">-{formatCurrency(repSummary.manual_cash_out)}</span>
                            </div>
                          </div>
                        </div>
                      </div>

                      {/* Transaction Audit Ledger */}
                      <div className="space-y-2 pt-1">
                        <div className="flex flex-wrap items-center justify-between gap-2">
                          <h4 className="text-xs font-bold uppercase tracking-wider">
                            Transaction Audit Trail ({filteredTxns.length}{filteredTxns.length !== repTxns.length ? ` of ${repTxns.length}` : ""})
                          </h4>
                          <div className="relative">
                            <input
                              type="text"
                              value={reportTxnFilter}
                              onChange={(e) => setReportTxnFilter(e.target.value)}
                              placeholder="Filter transactions…"
                              className={`w-48 pl-7 pr-3 py-1.5 rounded-lg border text-xs transition-colors ${
                                isDark
                                  ? "bg-slate-800 border-slate-700 text-slate-100 placeholder-slate-500"
                                  : "bg-white border-gray-300 text-gray-900 placeholder-gray-400"
                              } focus:outline-hidden focus:border-blue-500`}
                            />
                            <MagnifyingGlassIcon className="w-3.5 h-3.5 text-gray-400 absolute left-2 top-2" />
                          </div>
                        </div>

                        <div className="overflow-x-auto rounded-xl border border-gray-200 dark:border-slate-700 max-h-64 overflow-y-auto">
                          <table className="w-full text-left text-xs">
                            <thead className={`sticky top-0 z-10 border-b text-[11px] uppercase tracking-wider font-semibold ${
                              isDark ? "bg-slate-800 border-slate-700 text-slate-300" : "bg-gray-100 border-gray-200 text-gray-600"
                            }`}>
                              <tr>
                                <th className="p-2.5 pl-3">#</th>
                                <th className="p-2.5">Time</th>
                                <th className="p-2.5">Type</th>
                                <th className="p-2.5">Reference & Party / Notes</th>
                                <th className="p-2.5">Cashier</th>
                                <th className="p-2.5 text-right">Amount</th>
                                <th className="p-2.5 pr-3 text-right">Balance</th>
                              </tr>
                            </thead>
                            <tbody className="divide-y divide-gray-100 dark:divide-slate-800 text-[11px]">
                              {filteredTxns.length > 0 ? (
                                filteredTxns.map((tx, idx) => {
                                  const isPlus = CASH_IN_TYPES.includes(tx.type);
                                  return (
                                    <tr key={tx.id} className={isDark ? "hover:bg-slate-800/40" : "hover:bg-gray-50/80"}>
                                      <td className="p-2.5 pl-3 font-mono text-gray-400">#{tx.seq ?? idx + 1}</td>
                                      <td className="p-2.5 whitespace-nowrap text-gray-500 dark:text-slate-400">
                                        {new Date(tx.created_at).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}
                                      </td>
                                      <td className="p-2.5 whitespace-nowrap">
                                        <span className={`px-2 py-0.5 rounded-full font-semibold capitalize ${
                                          isPlus
                                            ? "bg-emerald-500/10 text-emerald-500"
                                            : "bg-rose-500/10 text-rose-500"
                                        }`}>
                                          {(tx.type || "").replace("_", " ")}
                                        </span>
                                      </td>
                                      <td className="p-2.5 max-w-xs truncate">
                                        <div className="flex flex-col">
                                          {tx.reference_label && (
                                            <span className="font-semibold text-blue-600 dark:text-blue-400">
                                              {tx.reference_label}{tx.party_name ? ` • ${tx.party_name}` : ""}
                                            </span>
                                          )}
                                          <span className="font-medium text-gray-700 dark:text-slate-200 truncate">
                                            {tx.notes || tx.category_label || (!tx.reference_label && tx.reference_type ? `${tx.reference_type.split("\\").pop()} #${tx.reference_id || ""}` : "—")}
                                          </span>
                                        </div>
                                      </td>
                                      <td className="p-2.5 text-gray-500 dark:text-slate-400 whitespace-nowrap">
                                        {tx.user?.name || "Cashier"}
                                      </td>
                                      <td className={`p-2.5 text-right font-bold whitespace-nowrap ${
                                        isPlus ? "text-emerald-500" : "text-rose-500"
                                      }`}>
                                        {isPlus ? "+" : "-"}{formatCurrency(tx.amount)}
                                      </td>
                                      <td className="p-2.5 pr-3 text-right font-bold whitespace-nowrap text-gray-700 dark:text-slate-200">
                                        {formatCurrency(tx.balance_after)}
                                      </td>
                                    </tr>
                                  );
                                })
                              ) : (
                                <tr>
                                  <td colSpan={7} className="p-6 text-center text-gray-400 italic">
                                    No transactions match the criteria.
                                  </td>
                                </tr>
                              )}
                            </tbody>
                          </table>
                        </div>
                      </div>
                    </div>
                  );
                })()
              )}
            </div>
          )}

          {/* View 5: History Tab */}
          {activeTab === "history" && (
            <div className="space-y-3">
              <div className="flex items-center justify-between text-xs">
                <h4 className="font-bold uppercase tracking-wider">Past Register Shifts</h4>
                <button
                  onClick={fetchHistory}
                  className="text-blue-500 hover:underline inline-flex items-center gap-1 font-semibold"
                >
                  <ArrowPathIcon className={`w-3.5 h-3.5 ${loadingHistory ? "animate-spin" : ""}`} /> Refresh
                </button>
              </div>

              {loadingHistory ? (
                <div className="py-8 text-center text-xs text-gray-500">Loading history…</div>
              ) : historyList.length === 0 ? (
                <div className="py-8 text-center text-xs text-gray-500 italic">No past shifts recorded yet.</div>
              ) : (
                <div className="space-y-2 max-h-72 overflow-y-auto pr-1">
                  {historyList.map((h) => {
                    const diff = Number(h.difference || 0);
                    return (
                      <div
                        key={h.id}
                        className={`p-3 rounded-xl border text-xs flex items-center justify-between ${
                          isDark ? "bg-slate-800/40 border-slate-700" : "bg-gray-50 border-gray-200"
                        }`}
                      >
                        <div>
                          <div className="flex items-center gap-2">
                            <span className="font-bold">Shift #{h.id}</span>
                            <span
                              className={`text-[10px] px-1.5 py-0.2 rounded ${
                                h.status === "open"
                                  ? "bg-emerald-500/10 text-emerald-500"
                                  : "bg-slate-500/10 text-slate-400"
                              }`}
                            >
                              {h.status}
                            </span>
                          </div>
                          <p className={`text-[11px] mt-0.5 ${isDark ? "text-slate-400" : "text-gray-500"}`}>
                            {new Date(h.opened_at).toLocaleDateString()} {new Date(h.opened_at).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}
                            {h.closed_at ? ` - ${new Date(h.closed_at).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}` : " (Active)"}
                            {h.user?.name && ` • ${h.user.name}`}
                          </p>
                          {h.notes && (
                            <p className="text-[10px] italic text-gray-400 mt-0.5 line-clamp-1">{h.notes}</p>
                          )}
                        </div>

                        <div className="flex items-center gap-3">
                          <button
                            type="button"
                            onClick={() => {
                              setReportSessionId(h.id);
                              setActiveTab("report");
                            }}
                            className={`px-2.5 py-1.5 rounded-lg border text-[11px] font-semibold transition-colors flex items-center gap-1 shrink-0 ${
                              isDark ? "border-slate-700 hover:bg-slate-700 text-blue-400" : "border-gray-200 hover:bg-white text-blue-600 shadow-2xs"
                            }`}
                            title="View detailed report for this shift"
                          >
                            <DocumentTextIcon className="w-3.5 h-3.5" />
                            <span>Report</span>
                          </button>
                          <div className="text-right">
                            <div className="font-bold">
                              {formatCurrency(h.closing_balance_actual ?? h.closing_balance_expected)}
                            </div>
                            {h.status === "closed" && (
                              <span
                                className={`text-[10px] font-semibold ${
                                  diff === 0
                                    ? "text-emerald-500"
                                    : diff > 0
                                    ? "text-blue-500"
                                    : "text-rose-500"
                                }`}
                              >
                                {diff === 0
                                  ? "Balanced"
                                  : diff > 0
                                  ? `+${formatCurrency(diff)}`
                                  : `-${formatCurrency(Math.abs(diff))}`}
                              </span>
                            )}
                          </div>
                        </div>
                      </div>
                    );
                  })}
                </div>
              )}
            </div>
          )}
        </div>
      </div>
    </div>
  );
}

