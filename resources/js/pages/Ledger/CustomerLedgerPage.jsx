// resources/js/pages/Ledger/CustomerLedgerPage.jsx
import React, { useEffect, useMemo, useState } from "react";
import axios from "axios";
import toast from "react-hot-toast";
import CustomerSearch from "../../components/CustomerSearch.jsx";
import RecordPaymentModal from "@/components/RecordPaymentModal.jsx";
import PaymentHistoryModal from "@/components/PaymentHistoryModal.jsx";
import ShareDocumentModal from "@/components/ShareDocumentModal.jsx";
import { usePermissions, Guard } from "@/api/usePermissions.js";
import { useTheme } from "@/context/ThemeContext.jsx";
import { getThemeButtonClasses } from "@/utils/buttonStyles";
import { printUrlViaIframe } from "@/utils/printHelper.js";

// glass primitives
import { GlassCard, GlassSectionHeader, GlassInput } from "@/components/Glass.jsx";

import {
  ArrowPathIcon,
  PrinterIcon,
  PlusCircleIcon,
  WrenchScrewdriverIcon,
  ArrowDownOnSquareIcon,
  ShieldExclamationIcon,
  XMarkIcon,
  Squares2X2Icon,
  UserIcon,
  TrashIcon,
  BanknotesIcon,
  DocumentTextIcon,
  ChevronDownIcon,
  ChevronUpDownIcon,
  CheckCircleIcon,
  ChevronLeftIcon,
  ChevronRightIcon,
  ChevronDoubleLeftIcon,
  ChevronDoubleRightIcon,
  ShareIcon,
} from "@heroicons/react/24/solid";

// Helper to determine text color based on background brightness
const getContrastText = (hexColor) => {
  hexColor = hexColor.replace('#', '');
  const r = parseInt(hexColor.substring(0, 2), 16);
  const g = parseInt(hexColor.substring(2, 4), 16);
  const b = parseInt(hexColor.substring(4, 6), 16);
  const luminance = (0.299 * r + 0.587 * g + 0.114 * b) / 255;
  return luminance > 0.5 ? '#1f2937' : '#ffffff';
};

const getButtonTextColor = (primaryColor, primaryHoverColor) => {
  return getContrastText(primaryHoverColor || primaryColor);
};

// Today's date in YYYY-MM-DD (auto-stamped on every new ledger row)
const todayISO = () => new Date().toISOString().slice(0, 10);

// A row that has not been persisted to the backend yet (no id)
const isPendingRow = (r) => r.id === undefined || r.id === null;

/* =========================
   Customer Ledger Page (Modernized)
   ========================= */
export default function CustomerLedgerPage() {
const [customers, setCustomers] = useState([]);
  const [customerId, setCustomerId] = useState("");
  const [customerSearchOpen, setCustomerSearchOpen] = useState(false);
  const [rows, setRows] = useState([]);
  const [fromDate, setFromDate] = useState("");
  const [toDate, setToDate] = useState("");
  const [newestFirst, setNewestFirst] = useState(true);
  const [sortField, setSortField] = useState("entry_date");
  // table paging
  const [page, setPage] = useState(1);
  const [perPage, setPerPage] = useState(25);
  // "mark invoice as paid" flow
  const [settleTarget, setSettleTarget] = useState(null);
  const [settling, setSettling] = useState(false);
  const [settleBusyId, setSettleBusyId] = useState(null);
  const [summary, setSummary] = useState({
    opening_balance: 0,
    total_invoiced: 0,
    received_on_invoice: 0,
    payments_credited: 0,
    net_balance: 0,
  });

  // Payment modals state
  const [recordPaymentOpen, setRecordPaymentOpen] = useState(false);
  const [paymentHistoryOpen, setPaymentHistoryOpen] = useState(false);
  const [shareModalOpen, setShareModalOpen] = useState(false);

  const selectedCustomer = useMemo(
    () => customers.find((c) => String(c.id) === String(customerId)),
    [customers, customerId]
  );

  // permissions
  const { loading: permsLoading, canFor } = usePermissions();
  const can = useMemo(
    () =>
      (typeof canFor === "function" ? canFor("customer-ledger") : {
        view:false, create:false, update:false, delete:false, import:false, export:false
      }),
    [canFor]
  );

  // theme
  const { isDark, theme } = useTheme();

  // Icon button styling used by the modals
  const tintIconBtn = useMemo(() => `
    bg-white/60 dark:bg-slate-700/60 backdrop-blur-xs ring-1 ring-gray-200/60 dark:ring-white/10
    hover:bg-white dark:hover:bg-slate-600/80 hover:shadow-md hover:scale-[1.05] active:scale-[0.95] transition-all duration-200
  `.trim().replace(/\s+/g, ' '), []);

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
        tertiary: '#06b6d4',
        tertiaryHover: '#0891b2',
        tertiaryLight: '#cffafe',
        danger: '#ef4444',
        dangerHover: '#dc2626',
        dangerLight: '#fee2e2',
        emerald: '#10b981',
        emeraldHover: '#059669',
        emeraldLight: '#d1fae5',
      };
    }
    return {
      primary: theme.primary_color || '#3b82f6',
      primaryHover: theme.primary_hover || '#2563eb',
      primaryLight: theme.primary_light || '#dbeafe',
      secondary: theme.secondary_color || '#8b5cf6',
      secondaryHover: theme.secondary_hover || '#7c3aed',
      secondaryLight: theme.secondary_light || '#ede9fe',
      tertiary: theme.tertiary_color || '#06b6d4',
      tertiaryHover: theme.tertiary_hover || '#0891b2',
      tertiaryLight: theme.tertiary_light || '#cffafe',
      danger: theme.danger_color || '#ef4444',
      dangerHover: '#dc2626',
      dangerLight: '#fee2e2',
      emerald: theme.success_color || '#10b981',
      emeraldHover: '#059669',
      emeraldLight: '#d1fae5',
    };
  }, [theme]);

  // Calculate text colors based on background brightness
  const primaryTextColor = useMemo(() => 
    getButtonTextColor(themeColors.primary, themeColors.primaryHover), 
    [themeColors.primary, themeColors.primaryHover]
  );

  // Get button style from theme
  const buttonStyle = theme?.button_style || 'modern';

  const getButtonClasses = useMemo(
    () => getThemeButtonClasses(buttonStyle, themeColors, isDark, primaryTextColor),
    [buttonStyle, themeColors, isDark, primaryTextColor]
  );

  const btnPrimary = getButtonClasses.primary;
  const btnSecondary = getButtonClasses.secondary;
  const btnTertiary = getButtonClasses.tertiary;
  const btnEmerald = getButtonClasses.emerald || getButtonClasses.success;
  const btnDanger = getButtonClasses.danger;
  const btnOutlined = getButtonClasses.outlined || getButtonClasses.glass || getButtonClasses.secondary;

  // ---------- utils ----------
  const nf = useMemo(
    () => new Intl.NumberFormat("en-US", { minimumFractionDigits: 0, maximumFractionDigits: 2 }),
    []
  );

  const fmt = (v) => {
    if (v === null || v === undefined || v === "") return "0";
    const n = Number(v);
    if (!Number.isFinite(n)) return "0";
    return nf.format(n);
  };

  // Compact, human date shown in the table (no date pickers anymore)
  const fmtDate = (d) => {
    if (!d) return "—";
    const dt = new Date(`${String(d).slice(0, 10)}T00:00:00`);
    if (Number.isNaN(dt.getTime())) return String(d).slice(0, 10);
    return dt.toLocaleDateString("en-GB", { day: "2-digit", month: "short", year: "numeric" });
  };

  // hotkeys (guarded)
  useEffect(() => {
    const onKey = (e) => {
      if (!(e.ctrlKey || e.metaKey) || e.altKey || e.shiftKey) return;
      const k = (e.key || "").toLowerCase();
      if (k === "s") {
        e.preventDefault();
        if (!can.create && !can.update) return;
        openSaveModal();
      }
      if (k === "p") {
        e.preventDefault();
        if (!can.view) return;
        handlePrint();
      }
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [can.create, can.update, can.view]);

  // Load customers
  useEffect(() => {
    if (permsLoading || !can.view) return;
    (async () => {
      try {
        const { data } = await axios.get("/api/customers", { params: { limit: 500 } });
        const list = Array.isArray(data?.data) ? data.data : Array.isArray(data) ? data : [];
        setCustomers(list);
      } catch {
        toast.error("Failed to load customers");
        setCustomers([]);
      }
    })();
  }, [permsLoading, can.view]);

  const fetchData = async (overrideFrom = fromDate, overrideTo = toDate) => {
    if (!can.view) return toast.error("You don't have permission to view customer ledger.");
    if (!customerId) return toast.error("Select a customer first");
    const effectiveFrom = typeof overrideFrom === "string" ? overrideFrom : fromDate;
    const effectiveTo = typeof overrideTo === "string" ? overrideTo : toDate;
    try {
      const { data } = await axios.get("/api/customer-ledger", {
        params: {
          customer_id: customerId,
          from: effectiveFrom || undefined,
          to: effectiveTo || undefined,
        },
      });
      const clean = (data.data || []).map((r) => {
        const c = { ...r };
        Object.keys(c).forEach((k) => k.endsWith("_input") && delete c[k]);
        return c;
      });
      setRows(clean);
      setSummary(
        data.summary || {
          opening_balance: 0,
          total_invoiced: 0,
          received_on_invoice: 0,
          payments_credited: 0,
          net_balance: 0,
        }
      );
    } catch (e) {
      toast.error(e?.response?.data?.message || "Failed to load ledger");
    }
  };

  useEffect(() => {
    if (!permsLoading && can.view && customerId) {
      fetchData(fromDate, toDate);
    } else if (!customerId) {
      setRows([]);
      setSummary({
        opening_balance: 0,
        total_invoiced: 0,
        received_on_invoice: 0,
        payments_credited: 0,
        net_balance: 0,
      });
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [customerId]);

  const rebuild = async () => {
    if (!can.update) return toast.error("You don't have permission to rebuild.");
    if (!customerId) return toast.error("Select a customer first");
    try {
      await axios.post("/api/customer-ledger/rebuild", { customer_id: customerId });
      toast.success("Rebuilt from sale invoices");
      await fetchData();
    } catch (e) {
      toast.error(e?.response?.data?.message || "Rebuild failed");
    }
  };

  // ---------- number editing helpers ----------
  const getInput = (row, field) => (row[`${field}_input`] !== undefined ? row[`${field}_input`] : (row[field] ?? "") + "");
  const setInput = (idx, field, raw) => {
    setRows((prev) => {
      const next = [...prev];
      const r = { ...next[idx] };
      r[`${field}_input`] = raw;
      next[idx] = r;
      return next;
    });
  };
  const commitNumber = (idx, field) => {
    setRows((prev) => {
      const next = [...prev];
      const r = { ...next[idx] };
      const raw = r[`${field}_input`];
      const parsed = raw === undefined || String(raw).trim() === "" ? 0 : parseFloat(String(raw).replace(/,/g, ""));
      r[field] = Number.isFinite(parsed) ? Number(parsed) : 0;
      delete r[`${field}_input`];

      if (["invoice", "manual"].includes(r.entry_type)) {
        const bal = Number(((r.invoice_total || 0) - (r.total_received || 0)).toFixed(2));
        r.balance_remaining = bal < 0 ? 0 : bal;
      }
      // For payment rows, calculate the remaining balance based on credited_amount
      if (r.entry_type === "payment") {
        // For payment rows, the balance_remaining shows 0 (it's a payment, not an invoice)
        r.balance_remaining = 0;
      }
      next[idx] = r;
      return next;
    });
  };
  const handleField = (idx, field, value) => {
    setRows((prev) => {
      const next = [...prev];
      const r = { ...next[idx], [field]: value };
      if (["invoice", "manual"].includes(r.entry_type) && (field === "invoice_total" || field === "total_received")) {
        const bal = Number(((r.invoice_total || 0) - (r.total_received || 0)).toFixed(2));
        r.balance_remaining = bal < 0 ? 0 : bal;
      }
      // For payment rows, update balance_remaining to 0
      if (r.entry_type === "payment") {
        r.balance_remaining = 0;
      }
      next[idx] = r;
      return next;
    });
  };

  // ---------- add row ----------
  // New rows are stamped with today's date and pushed to the TOP of the list.
  const addPaymentNow = () => {
    if (!can.create) return toast.error("You don't have permission to add payments.");
    if (!customerId) return toast.error("Select a customer first");
    setRows((prev) => [
      {
        id: undefined,
        customer_id: customerId,
        entry_type: "payment",
        entry_date: todayISO(),
        credited_amount: 0,
        posted_number: "",
        description: "Cash payment received",
        invoice_total: 0,
        total_received: 0,
        balance_remaining: 0,
        is_manual: true,
      },
      ...prev,
    ]);
  };
  const addManualNow = () => {
    if (!can.create) return toast.error("You don't have permission to add manual rows.");
    if (!customerId) return toast.error("Select a customer first");
    setRows((prev) => [
      {
        id: undefined,
        customer_id: customerId,
        entry_type: "manual",
        entry_date: todayISO(),
        posted_number: "",
        invoice_total: 0,
        total_received: 0,
        balance_remaining: 0,
        credited_amount: 0,
        payment_ref: "",
        description: "",
        is_manual: true,
      },
      ...prev,
    ]);
  };

  // ---------- bulk save ----------
  const doBulkSave = async () => {
    const news = rows.filter((r) => !r.id);
    const updates = rows.filter(
      (r) => r.id && (r.entry_type === "payment" || r.entry_type === "manual" || r.is_manual)
    );
    if (news.length && !can.create) return toast.error("You don't have permission to create ledger rows.");
    if (updates.length && !can.update) return toast.error("You don't have permission to update ledger rows.");

    try {
      for (const n of news) {
        const payload = {
          customer_id: customerId,
          entry_type: n.entry_type,
          is_manual: !!n.is_manual,
          entry_date: n.entry_date,
          description: n.description,
          posted_number: n.posted_number,
          invoice_total: n.invoice_total || 0,
          total_received: n.total_received || 0,
          credited_amount: n.credited_amount || 0,
          payment_ref: n.payment_ref,
          sale_invoice_id: n.sale_invoice_id || null,
        };
        await axios.post("/api/customer-ledger", payload);
      }
      if (updates.length) {
        await axios.put("/api/customer-ledger/bulk", {
          rows: updates.map((u) => ({
            id: u.id,
            entry_date: u.entry_date,
            description: u.description,
            posted_number: u.posted_number,
            invoice_total: u.invoice_total || 0,
            total_received: u.total_received || 0,
            credited_amount: u.credited_amount || 0,
            payment_ref: u.payment_ref,
          })),
        });
      }
      toast.success("Ledger saved");
      await fetchData();
    } catch (e) {
      toast.error(e?.response?.data?.message || "Save failed");
    }
  };

  // ---------- delete (secure) ----------
  const [deleteModalOpen, setDeleteModalOpen] = useState(false);
  const [deleteStep, setDeleteStep] = useState(1);
  const [deletingIdx, setDeletingIdx] = useState(null);
  const [password, setPassword] = useState("");
  const [deleting, setDeleting] = useState(false);

  const openDeleteModal = (originalIdx) => {
    if (!can.delete) return toast.error("You don't have permission to delete ledger rows.");
    const target = rows[originalIdx];
    if (target && target.entry_type === "invoice" && !target.is_manual) {
      return toast.error("Invoice rows are locked — they come from sales.");
    }
    setDeletingIdx(originalIdx);
    setPassword("");
    setDeleteStep(1);
    setDeleteModalOpen(true);
  };
  const closeDeleteModal = () => {
    if (deleting) return;
    setDeleteModalOpen(false);
    setDeletingIdx(null);
    setDeleteStep(1);
    setPassword("");
  };
  const proceedDeletePassword = () => setDeleteStep(2);

  const confirmAndDelete = async () => {
    if (deletingIdx === null) return;
    if (!can.delete) return toast.error("You don't have permission to delete ledger rows.");
    const r = rows[deletingIdx];
    try {
      setDeleting(true);
      await axios.post("/api/auth/confirm-password", { password });

      if (r.id && !r.is_manual && r.entry_type === "invoice") {
        toast.error("Cannot delete invoice row");
      } else if (r.id) {
        await axios.delete(`/api/customer-ledger/${r.id}`);
        window.dispatchEvent(new CustomEvent("cash-drawer-changed"));
        window.dispatchEvent(new CustomEvent("accounts-changed"));
        try { localStorage.setItem("cash_drawer_sync", String(Date.now())); } catch {}
        try { localStorage.setItem("accounts_sync", String(Date.now())); } catch {}
        toast.success("Row deleted");
        await fetchData();
      } else {
        setRows((prev) => prev.filter((_, i) => i !== deletingIdx));
        toast.success("Row removed");
      }
      closeDeleteModal();
    } catch (err) {
      const msg =
        err?.response?.data?.message ||
        (err?.response?.status === 422 ? "Incorrect password" : "Delete failed");
      toast.error(msg);
    } finally {
      setDeleting(false);
    }
  };

  // ---------- confirm add modals ----------
  const [addModal, setAddModal] = useState({ open: false, type: null }); // 'payment' | 'manual'
  const openAddPayment = () => setAddModal({ open: true, type: "payment" });
  const openAddManual  = () => setAddModal({ open: true, type: "manual" });
  const closeAddModal  = () => setAddModal({ open: false, type: null });
  const confirmAdd = () => {
    if (addModal.type === "payment") addPaymentNow();
    if (addModal.type === "manual")  addManualNow();
    closeAddModal();
  };

  // ---------- confirm save modal ----------
  const [saveModalOpen, setSaveModalOpen] = useState(false);
  const openSaveModal = () => setSaveModalOpen(true);
  const closeSaveModal = () => setSaveModalOpen(false);
  const confirmSave = async () => {
    setSaveModalOpen(false);
    await doBulkSave();
  };

  // ---------- derived rows: running balance + ordering ----------
  // 1) Running balance is always computed chronologically (oldest -> newest).
  // 2) Rows are then displayed newest-first by default so fresh entries land on top.
  const derivedRows = useMemo(() => {
    const indexed = rows.map((r, i) => ({ ...r, __i: i }));

    const sorted = indexed.sort((a, b) => {
      const ad = (a.entry_date || "").slice(0, 10);
      const bd = (b.entry_date || "").slice(0, 10);
      if (ad === bd) {
        const ai = a.id ?? Number.MAX_SAFE_INTEGER;
        const bi = b.id ?? Number.MAX_SAFE_INTEGER;
        return ai - bi;
      }
      return ad < bd ? -1 : 1;
    });

    // Running balance over the chronological order (starting from brought-forward opening balance)
    let runningBalance = Number(summary?.opening_balance || 0);
    const withBalance = sorted.map((r) => {
      if (r.entry_type === "invoice" || r.entry_type === "manual") {
        runningBalance += Number(r.balance_remaining || 0);
      } else if (r.entry_type === "payment") {
        runningBalance -= Number(r.credited_amount || 0);
      }
      return { ...r, running_balance: Number(runningBalance.toFixed(2)) };
    });

    // Unsaved rows always sit at the very top (newest added first),
    // the toggle only flips the ordering of the stored history.
    const pending = withBalance.filter(isPendingRow).reverse();
    const saved = withBalance.filter((r) => !isPendingRow(r));
    const ordered = [...pending, ...(newestFirst ? saved.reverse() : saved)];

    return ordered.map((r, i) => ({ ...r, __top: i + 1 }));
  }, [rows, newestFirst, summary?.opening_balance]);

  // Column totals + how many rows are waiting to be saved
  const totals = useMemo(
    () =>
      derivedRows.reduce(
        (acc, r) => {
          if (r.entry_type !== "payment") {
            acc.bill += Number(r.invoice_total || 0);
            acc.received += Number(r.total_received || 0);
            acc.balance += Number(r.balance_remaining || 0);
          } else {
            acc.payment += Number(r.credited_amount || 0);
          }
          return acc;
        },
        { bill: 0, received: 0, balance: 0, payment: 0 }
      ),
    [derivedRows]
  );

  // Latest running balance (newest chronological row) = overall due for this customer
  const overallRunning = useMemo(() => {
    let last = Number(summary?.opening_balance || 0);
    for (const r of derivedRows) {
      if (r.entry_type === "invoice" || r.entry_type === "manual") last += Number(r.balance_remaining || 0);
      else if (r.entry_type === "payment") last -= Number(r.credited_amount || 0);
    }
    return Number(last.toFixed(2));
  }, [derivedRows, summary?.opening_balance]);

  // Optional: let users sort by amount instead of date
  const sortedRows = useMemo(() => {
    if (sortField === "entry_date") return derivedRows;
    const key = sortField === "invoice_total" ? "invoice_total" : "credited_amount";
    return [...derivedRows]
      .sort((a, b) => Number(b[key] || 0) - Number(a[key] || 0))
      .map((r, i) => ({ ...r, __top: i + 1 }));
  }, [derivedRows, sortField]);

  const pendingCount = useMemo(() => rows.filter(isPendingRow).length, [rows]);

  // ---------- pagination ----------
  const pageCount = Math.max(1, Math.ceil(sortedRows.length / perPage));
  // Jump back to page 1 whenever the dataset or ordering changes
  useEffect(() => {
    setPage(1);
  }, [customerId, sortField, newestFirst, perPage]);
  useEffect(() => {
    if (page > pageCount) setPage(pageCount);
  }, [page, pageCount]);

  const pagedRows = useMemo(() => {
    const startIdx = (page - 1) * perPage;
    return sortedRows.slice(startIdx, startIdx + perPage);
  }, [sortedRows, page, perPage]);

  const rangeStart = sortedRows.length === 0 ? 0 : (page - 1) * perPage + 1;
  const rangeEnd = Math.min(page * perPage, sortedRows.length);

  // ---------- mark an invoice as paid (invoice + ledger) ----------
  const openSettle = (r) => {
    if (!can.update) return toast.error("You don't have permission to update invoices.");
    if (!r.sale_invoice_id) return toast.error("This row is not linked to a sale invoice.");
    const due = Number(r.invoice_due ?? r.balance_remaining ?? 0);
    if (due <= 0) return toast.error("This invoice is already fully paid.");
    setSettleTarget(r);
  };
  const closeSettle = () => {
    if (settling) return;
    setSettleTarget(null);
  };
  const confirmSettle = async () => {
    if (!settleTarget) return;
    const invoiceId = settleTarget.sale_invoice_id;
    try {
      setSettling(true);
      setSettleBusyId(invoiceId);
      const { data } = await axios.post("/api/customer-ledger/settle-invoice", {
        sale_invoice_id: invoiceId,
        entry_date: settleTarget.entry_date || todayISO(),
      });
      const ref = data?.posted_number || settleTarget.posted_number || "";
      const amount = Number(data?.settled || 0);
      if (amount > 0) {
        toast.success(`Invoice ${ref} marked as paid (${fmt(amount)})`);
        window.dispatchEvent(new CustomEvent("cash-drawer-changed"));
        window.dispatchEvent(new CustomEvent("accounts-changed"));
        try { localStorage.setItem("cash_drawer_sync", String(Date.now())); } catch {}
        try { localStorage.setItem("accounts_sync", String(Date.now())); } catch {}
      } else {
        toast.success("Invoice was already fully paid");
      }
      setSettleTarget(null);
      await fetchData();
    } catch (err) {
      const status = err?.response?.status;
      if (status === 403) toast.error("You don't have permission to mark invoices as paid.");
      else toast.error(err?.response?.data?.message || "Failed to mark invoice as paid");
    } finally {
      setSettling(false);
      setSettleBusyId(null);
    }
  };

  const newCount = rows.filter((r) => !r.id).length;
  const updCount = rows.filter(
    (r) => r.id && (r.entry_type === "payment" || r.entry_type === "manual" || r.is_manual)
  ).length;

  const handlePrint = async (type /* 'a4'|'thermal' optional */) => {
    if (!can.view) return toast.error("You don't have permission to print.");
    if (!customerId) return toast.error("Select a customer first");
    const w = window.open("about:blank", "_blank");
    try {
      const { data } = await axios.get("/api/customer-ledger/print-url", {
        params: {
          customer_id: customerId,
          type: type || undefined,
          from: fromDate || undefined,
          to: toDate || undefined,
        },
      });
      if (!w) {
        await printUrlViaIframe(data.url);
        return;
      }
      w.location.replace(data.url);
    } catch (err) {
      try { if (w) w.close(); } catch {}
      toast.error(err?.response?.data?.message || "Failed to generate print link.");
    }
  };

  // ---------- UI ----------
  if (permsLoading) return <div className="p-6">Loading…</div>;
  if (!can.view) return <div className="p-6 text-sm text-gray-700">You don’t have permission to view customer ledger.</div>;

return (
    <div className="ledger-page customer-ledger-page space-y-4">
      {/* ===== Premium Gradient Hero Header ===== */}
      <div
        className="ledger-header products-panel"
      >
        {/* Decorative blurred blobs */}

        {/* Hero Top */}
        <div className="ledger-heading px-5 py-5">
          <div className="flex items-center gap-3">
            <div
              className="products-identity-icon"
            >
              <UserIcon className="w-6 h-6 text-white" />
            </div>
            <div>
              <h1 className="products-title">Customer Ledger</h1>
              <p className="products-subtitle">
                {customerId ? "Managing ledger for selected customer" : "Select a customer to view ledger"}
              </p>
            </div>
          </div>

          {/* Action Buttons */}
          <div className="ledger-actions">
            {/* Customer Select (new modal search) */}
            <div
              className="ledger-party-selector"
            >
              <button
                type="button"
                onClick={() => setCustomerSearchOpen(true)}
                aria-label="Select customer"
                className="flex-1 h-full px-3 text-left text-xs flex items-center gap-2 min-w-0"
                title={customerId ? (customers.find(c => String(c.id) === String(customerId))?.name || "Selected customer") : "Click to search customer..."}
              >
                <UserIcon className="w-4 h-4 shrink-0" />
                {customerId ? (
                  <span className="truncate font-medium">
                    {customers.find(c => String(c.id) === String(customerId))?.name || "Selected customer"}
                  </span>
                ) : (
                  <span className="truncate">Search customer...</span>
                )}
              </button>
              {customerId && (
                <button
                  type="button"
                  onClick={() => setCustomerId("")}
                  className="h-full px-2 flex items-center justify-center hover:bg-black/10 dark:hover:bg-white/10 transition-colors shrink-0"
                  title="Clear customer"
                  aria-label="Clear customer"
                >
                  <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M6 18L18 6M6 6l12 12" />
                  </svg>
                </button>
              )}
            </div>


            {/* Shared action group */}
            <div
              className="ledger-workflow-actions" role="group" aria-label="Ledger actions"
            >
              <Guard when={can.update}>
                <button
                  onClick={rebuild}
                  disabled={!customerId}
                  title="Rebuild ledger from sale invoices"
                  className="products-action theme-btn-tertiary"
                >
                  <ArrowPathIcon className="w-3.5 h-3.5" />
                  <span>Rebuild</span>
                </button>
              </Guard>


              <Guard when={can.update}>
                <button
                  onClick={() => fetchData()}
                  disabled={!customerId}
                  title="Reload ledger entries"
                  className="products-action theme-btn-tertiary"
                >
                  <ArrowPathIcon className="w-3.5 h-3.5" />
                  <span>Load entries</span>
                </button>
              </Guard>


              <Guard when={can.create}>
                <button
                  onClick={() => setRecordPaymentOpen(true)}
                  disabled={!customerId}
                  title="Record an allocated customer payment with multi-tender receipt"
                  className="products-action bg-emerald-600 hover:bg-emerald-500 text-white font-semibold"
                >
                  <BanknotesIcon className="w-3.5 h-3.5" />
                  <span>Record Payment</span>
                </button>
              </Guard>

              <button
                onClick={() => setPaymentHistoryOpen(true)}
                disabled={!customerId}
                title="View customer payment vouchers and receipts"
                className="products-action theme-btn-secondary"
              >
                <DocumentTextIcon className="w-3.5 h-3.5" />
                <span>Payment Vouchers</span>
              </button>


              <Guard when={can.create}>
                <button
                  onClick={openAddManual}
                  disabled={!customerId}
                  title="Add a manual ledger row (new entries are added at the top)"
                  className="products-action theme-btn-secondary"
                >
                  <WrenchScrewdriverIcon className="w-3.5 h-3.5" />
                  <span>Add manual row</span>
                </button>
              </Guard>


              <Guard when={can.update}>
                <button
                  onClick={openSaveModal}
                  disabled={!customerId || (newCount === 0 && updCount === 0)}
                  title="Save changes (Ctrl+S)"
                  className="products-action products-action-primary theme-btn-primary"
                >
                  <ArrowDownOnSquareIcon className="w-3.5 h-3.5" />
                  <span>Save changes</span>
                  {(newCount > 0 || updCount > 0) && customerId && (
                    <span className="ml-0.5 px-1 py-0.5 rounded-sm bg-white/30 text-[10px]">
                      {newCount + updCount}
                    </span>
                  )}
                </button>
              </Guard>
            </div>

            {/* Primary Print & Share Buttons */}
            <button
              onClick={() => handlePrint()}
              disabled={!customerId}
              title="Print statement (Ctrl+P)"
              className="products-action theme-btn-secondary"
            >
              <PrinterIcon className="w-4 h-4" />
              <span>Print</span>
            </button>
            <button
              onClick={() => setShareModalOpen(true)}
              disabled={!customerId}
              title="Share statement via WhatsApp or Email PDF"
              className="products-action theme-btn-secondary"
            >
              <ShareIcon className="w-4 h-4" />
              <span>Share / PDF</span>
            </button>
          </div>
        </div>

        {/* Ledger totals strip */}
        {customerId && (
          <div className="relative px-5 pb-4">
            <div className={`grid grid-cols-2 ${fromDate || Number(summary.opening_balance) !== 0 ? "md:grid-cols-5" : "md:grid-cols-4"} gap-2`}>
              {(fromDate || Number(summary.opening_balance) !== 0) && (
                <HeroStat label="Opening Balance (B/F)" value={fmt(summary.opening_balance)} />
              )}
              <HeroStat label="Total Bills" value={fmt(summary.total_invoiced)} />
              <HeroStat label="Received on Invoice" value={fmt(summary.received_on_invoice)} />
              <HeroStat label="Payments" value={fmt(summary.payments_credited)} />
              <HeroStat
                label="Total Due"
                value={fmt(summary.net_balance)}
                tone={Number(summary.net_balance) > 0 ? "warn" : "ok"}
              />
            </div>
          </div>
        )}
      </div>

{/* ===== Ledger table ===== */}
      <div className="ledger-table-panel products-panel overflow-hidden">
        {/* Toolbar */}
        <div className="ledger-table-toolbar flex flex-wrap items-center justify-between gap-3 px-4 py-3">
          <div className="flex items-center gap-2">
            <div className="p-1 rounded-md" style={{ backgroundColor: `${themeColors.primary}1a` }}>
              <Squares2X2Icon className="w-4 h-4" style={{ color: themeColors.primary }} />
            </div>
            <span className="text-sm font-semibold text-gray-700 dark:text-gray-200">Ledger Entries</span>
            <span className="text-xs text-gray-400">
              {rows.length} {rows.length === 1 ? "entry" : "entries"}
            </span>
            {pendingCount > 0 && (
              <span className="inline-flex items-center rounded-full bg-amber-100 dark:bg-amber-500/20 px-2 py-0.5 text-[10px] font-semibold text-amber-700 dark:text-amber-300">
                {pendingCount} unsaved
              </span>
            )}
          </div>

          <div className="flex flex-wrap items-center gap-2">
            {/* Date range statement filter */}
            <div className="flex flex-wrap items-center gap-1.5 text-xs">
              <span className="text-gray-500 dark:text-gray-400 font-medium">Statement Range:</span>
              <input
                type="date"
                value={fromDate}
                onChange={(e) => setFromDate(e.target.value)}
                aria-label="Statement from date"
                className={`h-8 px-2 text-xs rounded-lg border focus:outline-hidden focus:ring-1 ${isDark ? "border-slate-600 bg-slate-700 text-slate-200" : "border-gray-200 bg-white text-gray-700"}`}
              />
              <span className="text-gray-400">to</span>
              <input
                type="date"
                value={toDate}
                onChange={(e) => setToDate(e.target.value)}
                aria-label="Statement to date"
                className={`h-8 px-2 text-xs rounded-lg border focus:outline-hidden focus:ring-1 ${isDark ? "border-slate-600 bg-slate-700 text-slate-200" : "border-gray-200 bg-white text-gray-700"}`}
              />
              <button
                type="button"
                disabled={!customerId}
                onClick={() => fetchData(fromDate, toDate)}
                className="theme-btn-tertiary inline-flex items-center h-8 px-2.5 text-xs font-medium rounded-lg"
                title="Apply statement date filter"
              >
                Apply
              </button>
              {(fromDate || toDate) && (
                <button
                  type="button"
                  onClick={() => {
                    setFromDate("");
                    setToDate("");
                    if (customerId) fetchData("", "");
                  }}
                  className="inline-flex items-center h-8 px-2 text-xs font-medium text-rose-600 dark:text-rose-400 hover:underline"
                  title="Clear statement date filter"
                >
                  Clear
                </button>
              )}
            </div>

            {/* Sort field */}
            <div className="relative">
              <select
                value={sortField}
                onChange={(e) => setSortField(e.target.value)}
                title="Sort ledger rows"
                aria-label="Sort ledger rows"
                className={`appearance-none h-8 pl-2 pr-6 text-xs rounded-lg border focus:outline-hidden focus:ring-1 ${isDark ? "border-slate-600 bg-slate-700 text-slate-200 focus:ring-slate-500" : "border-gray-200 bg-white text-gray-700 focus:ring-gray-300"}`}
              >
                <option value="entry_date">Sort: Date</option>
                <option value="invoice_total">Sort: Bill</option>
                <option value="credited_amount">Sort: Payment</option>
              </select>
              <ChevronDownIcon className="pointer-events-none absolute right-1.5 top-1/2 -translate-y-1/2 w-3.5 h-3.5 text-gray-400" />
            </div>

            {/* Newest / oldest toggle — new entries always land on top */}
            <button
              onClick={() => setNewestFirst((v) => !v)}
              title="Toggle newest / oldest first"
              className="theme-btn-tertiary inline-flex items-center gap-1.5 h-8 px-2.5 text-xs font-medium"
            >
              <ChevronUpDownIcon className="w-3.5 h-3.5" />
              <span>{newestFirst ? "Newest first" : "Oldest first"}</span>
            </button>
          </div>
        </div>

        <div className="ledger-table-scroll" role="region" aria-label="Customer ledger entries" tabIndex={0}>
          <table className="w-full text-xs tabular-nums border-collapse">
            <thead className={`sticky top-0 z-10 border-b ${isDark ? "bg-slate-700" : "bg-gray-100"}`}>
              <tr className="text-left text-[10px] uppercase tracking-wider text-gray-500 dark:text-gray-400">
                <th className="px-2 py-2 w-20 text-center font-semibold">Paid</th>
                <th className="px-2 py-2 w-9 text-center font-semibold">#</th>
                <th className="px-2 py-2 w-24 font-semibold">Type</th>
                <th className="px-2 py-2 w-24 font-semibold">Ref</th>
                <th className="px-2 py-2 font-semibold">Description</th>
                <th className="px-2 py-2 w-24 text-right font-semibold">Bill</th>
                <th className="px-2 py-2 w-24 text-right font-semibold">Received</th>
                <th className="px-2 py-2 w-24 text-right font-semibold">Payment</th>
                <th className="px-2 py-2 w-24 text-right font-semibold">Balance</th>
                <th className="px-2 py-2 w-28 text-right font-semibold">Running</th>
                <th className="px-2 py-2 w-12 text-center font-semibold">Del</th>
              </tr>

              {/* Totals row — lives in the sticky head so it never overlaps */}
              {customerId && rows.length > 0 && (
                <tr className={`border-b font-semibold ${isDark ? "border-slate-600 bg-slate-700 text-slate-100" : "border-gray-200 bg-gray-50 text-gray-800"}`}>
                  <td className="px-2 py-2 text-center font-normal text-gray-400" title="Invoice rows are billed / paid here">Σ</td>
                  <td className="px-2 py-2" />
                  <td className="px-2 py-2 text-[10px] uppercase tracking-wider" colSpan={3}>Totals</td>
                  <td className="px-2 py-2 text-right">{fmt(totals.bill)}</td>
                  <td className="px-2 py-2 text-right">{fmt(totals.received)}</td>
                  <td className="px-2 py-2 text-right" style={{ color: themeColors.emerald }}>{fmt(totals.payment)}</td>
                  <td className="px-2 py-2 text-right" style={{ color: totals.balance > 0 ? themeColors.danger : themeColors.emerald }}>
                    {fmt(totals.balance)}
                  </td>
                  <td className="px-2 py-2 text-right" style={{ color: overallRunning > 0 ? themeColors.danger : themeColors.emerald }}>
                    Due {fmt(overallRunning)}
                  </td>
                  <td className="px-2 py-2" />
                </tr>
              )}
            </thead>
            <tbody>
              {!customerId && (
                <tr>
                  <td colSpan={11} className={`px-2 py-14 text-center ${isDark ? "text-slate-400" : "text-gray-500"}`}>
                    <div className="flex flex-col items-center gap-2">
                      <UserIcon className="w-8 h-8 text-gray-400" />
                      <p className="text-sm">Select a customer to view the ledger</p>
                    </div>
                  </td>
                </tr>
              )}

              {customerId && rows.length > 0 && (
                <>
                  {pagedRows.map((r) => {
                    const isInvoice = r.entry_type === "invoice";
                    const isPayment = r.entry_type === "payment";
                    const isManual = r.entry_type === "manual";
                    const pending = isPendingRow(r);
                    const editable = !isInvoice && !isPayment;
                    // Invoice rows are generated from sales and payment rows come from Payment Vouchers
                    const locked = (isInvoice && !r.is_manual) || Boolean(r.payment_id);
                    const invoiceDue = Number(r.invoice_due ?? r.balance_remaining ?? 0);

                    const accent = isInvoice ? themeColors.primary : isPayment ? themeColors.emerald : themeColors.tertiary;
                    const accentHover = isInvoice ? themeColors.primaryHover : isPayment ? themeColors.emeraldHover : themeColors.tertiaryHover;

                    const cellInput = `w-full text-xs tabular-nums rounded-md border px-1.5 py-1 transition-colors focus:outline-hidden focus:ring-1 ${
                      isDark
                        ? "border-slate-600 bg-slate-700 text-slate-100 focus:ring-slate-500 disabled:border-transparent disabled:bg-transparent disabled:text-slate-300"
                        : "border-gray-200 bg-white text-gray-800 focus:ring-gray-300 disabled:border-transparent disabled:bg-transparent disabled:text-gray-600"
                    }`;

                    return (
                      <tr
                        key={r.id ?? `new-${r.__i}`}
                        data-pending={pending}
                        className={`border-b transition-colors ${
                          isDark ? "border-slate-700/50 hover:bg-slate-700/40" : "border-gray-100 hover:bg-blue-50/70"
                        } ${pending ? (isDark ? "bg-amber-500/10" : "bg-amber-50/70") : ""}`}
                      >
                        {/* Mark as paid (invoice-backed rows only) */}
                        <td className="px-2 py-1.5 text-center">
                          {r.sale_invoice_id ? (
                            <button
                              onClick={() => openSettle(r)}
                              disabled={settling || invoiceDue <= 0}
                              title={
                                invoiceDue <= 0
                                  ? `${r.posted_number || "Invoice"} is fully paid`
                                  : `Mark ${r.posted_number || "invoice"} as fully paid`
                              }
                              className={`products-row-action ledger-row-action inline-flex items-center justify-center w-7 h-7 rounded-lg transition-all duration-200 ${
                                invoiceDue <= 0
                                  ? "text-green-500 dark:text-green-400 bg-green-500/10 cursor-default"
                                  : isDark
                                  ? "text-slate-200 bg-slate-700 hover:bg-emerald-600 hover:text-white"
                                  : "text-gray-600 bg-gray-100 hover:bg-emerald-500 hover:text-white"
                              }`}
                            >
                              {settleBusyId === r.sale_invoice_id ? (
                                <ArrowPathIcon className="w-3.5 h-3.5 animate-spin" />
                              ) : (
                                <CheckCircleIcon className="w-4 h-4" />
                              )}
                            </button>
                          ) : (
                            <span className="text-gray-300 dark:text-slate-600">—</span>
                          )}
                        </td>

                        {/* # */}
                        <td className="px-2 py-1.5 text-center text-[10px] text-gray-400">{r.__top ?? r.__i + 1}</td>

                        {/* Type + auto date */}
                        <td className="px-2 py-1.5">
                          <div className="flex flex-col gap-0.5">
                            <span
                              className="ledger-type-badge"
                              style={{
                                "--ledger-type-accent": accent,
                              }}
                            >
                              {isPayment && <BanknotesIcon className="w-3 h-3" />}
                              {isInvoice && <DocumentTextIcon className="w-3 h-3" />}
                              {isManual && <WrenchScrewdriverIcon className="w-3 h-3" />}
                              {r.entry_type}
                            </span>
                            <span className="text-[10px] text-gray-400">{fmtDate(r.entry_date)}</span>
                            {pending && (
                              <span className="text-[10px] font-semibold text-amber-600 dark:text-amber-400">unsaved</span>
                            )}
                          </div>
                        </td>

                        {/* Ref */}
                        <td className="px-2 py-1.5">
                          {editable ? (
                            <input
                              type="text"
                              value={r.posted_number ?? ""}
                              onChange={(e) => handleField(r.__i, "posted_number", e.target.value)}
                              placeholder="Ref"
                              className={`w-full text-xs rounded-md border px-1.5 py-1 focus:outline-hidden focus:ring-1 ${
                                isDark
                                  ? "border-slate-600 bg-slate-700 text-slate-100 focus:ring-slate-500"
                                  : "border-gray-200 bg-white text-gray-800 focus:ring-gray-300"
                              }`}
                            />
                          ) : (
                            <span className="font-medium text-gray-600 dark:text-gray-300">{r.posted_number || "—"}</span>
                          )}
                        </td>
{/* Description */}
                        <td className="px-2 py-1.5">
                          {locked ? (
                            <span className="text-gray-600 dark:text-gray-300">{r.description || "—"}</span>
                          ) : (
                            <input
                              type="text"
                              value={r.description ?? ""}
                              onChange={(e) => handleField(r.__i, "description", e.target.value)}
                              placeholder="—"
                              className={`w-full text-xs rounded-md border px-1.5 py-1 focus:outline-hidden focus:ring-1 ${
                                isDark
                                  ? "border-slate-600 bg-slate-700 text-slate-100 focus:ring-slate-500"
                                  : "border-gray-200 bg-white text-gray-800 focus:ring-gray-300"
                              }`}
                            />
                          )}
                        </td>

                        {/* Bill */}
                        <td className="px-2 py-1.5 text-right">
                          {isInvoice || isManual ? (
                            <input
                              type="text"
                              inputMode="decimal"
                              value={getInput(r, "invoice_total")}
                              onChange={(e) => setInput(r.__i, "invoice_total", e.target.value)}
                              onBlur={() => commitNumber(r.__i, "invoice_total")}
                              onKeyDown={(e) => e.key === "Enter" && e.currentTarget.blur()}
                              disabled={isInvoice}
                              className={cellInput}
                            />
                          ) : (
                            <span className="text-gray-300 dark:text-slate-600">—</span>
                          )}
                        </td>

                        {/* Received */}
                        <td className="px-2 py-1.5 text-right">
                          {isInvoice || isManual ? (
                            <input
                              type="text"
                              inputMode="decimal"
                              value={getInput(r, "total_received")}
                              onChange={(e) => setInput(r.__i, "total_received", e.target.value)}
                              onBlur={() => commitNumber(r.__i, "total_received")}
                              onKeyDown={(e) => e.key === "Enter" && e.currentTarget.blur()}
                              disabled={isInvoice}
                              className={cellInput}
                            />
                          ) : (
                            <span className="text-gray-300 dark:text-slate-600">—</span>
                          )}
                        </td>

                        {/* Payment */}
                        <td className="px-2 py-1.5 text-right">
                          {isPayment ? (
                            <span className="font-semibold px-1.5 py-1 inline-block" style={{ color: themeColors.emerald }}>
                              {fmt(r.credited_amount ?? 0)}
                            </span>
                          ) : (
                            <span className="text-gray-300 dark:text-slate-600">—</span>
                          )}
                        </td>
                        {/* Balance remaining */}
                        <td className="px-2 py-1.5 text-right font-semibold">
                          {isPayment ? (
                            <span className="text-gray-300 dark:text-slate-600">—</span>
                          ) : (
                            <span style={{ color: Number(r.balance_remaining || 0) > 0 ? themeColors.danger : themeColors.emerald }}>
                              {fmt(r.balance_remaining ?? 0)}
                            </span>
                          )}
                        </td>

                        {/* Running balance */}
                        <td className="px-2 py-1.5 text-right font-bold">
                          <span style={{ color: Number(r.running_balance || 0) > 0 ? themeColors.danger : themeColors.emerald }}>
                            {fmt(r.running_balance ?? 0)}
                          </span>
                        </td>

                        {/* Delete (invoice rows are locked) */}
                        <td className="px-2 py-1.5 text-center">
                          <button
                            onClick={() => openDeleteModal(r.__i)}
                            disabled={locked}
                            title={locked ? "Locked — invoice rows come from sales" : "Delete this row"}
                            className={`products-row-action ledger-row-action inline-flex items-center justify-center w-7 h-7 rounded-lg transition-all duration-200 ${
                              locked
                                ? "text-gray-300 dark:text-slate-600 cursor-not-allowed"
                                : isDark
                                ? "text-red-300 hover:bg-red-500/20"
                                : "text-red-500 hover:bg-red-50"
                            }`}
                          >
                            <TrashIcon className="w-4 h-4" />
                          </button>
                        </td>
                      </tr>
                    );
                  })}
                </>
              )}

              {customerId && rows.length === 0 && (
                <tr>
                  <td colSpan={11} className={`px-2 py-14 text-center ${isDark ? "text-slate-400" : "text-gray-500"}`}>
                    <div className="flex flex-col items-center gap-2">
                      <UserIcon className="w-8 h-8 text-gray-400" />
                      <p className="text-sm">
                        No entries yet. Use <b className={isDark ? "text-slate-300" : "text-gray-700"}>Load entries</b> to pull
                        invoices, or use <b className={isDark ? "text-slate-300" : "text-gray-700"}>Record Payment</b> / add a Manual row.
                      </p>
                    </div>
                  </td>
                </tr>
              )}
            </tbody>
          </table>
        </div>

        {/* ===== Pagination footer ===== */}
        {customerId && sortedRows.length > 0 && (
          <div className={`flex flex-wrap items-center justify-between gap-3 px-4 py-2.5 border-t ${isDark ? "border-slate-700 bg-slate-800" : "border-gray-200 bg-gray-50"}`}>
            <div className="flex items-center gap-3 text-xs text-gray-500 dark:text-gray-400">
              <span>
                Showing <b className="text-gray-700 dark:text-gray-200">{rangeStart}</b>–
                <b className="text-gray-700 dark:text-gray-200">{rangeEnd}</b> of{" "}
                <b className="text-gray-700 dark:text-gray-200">{sortedRows.length}</b>
              </span>
              <label className="inline-flex items-center gap-1.5">
                <span className="hidden sm:inline">Rows per page</span>
                <div className="relative">
                  <select
                    value={perPage}
                    onChange={(e) => setPerPage(Number(e.target.value))}
                    className={`appearance-none h-7 pl-2 pr-6 text-xs rounded-md border focus:outline-hidden focus:ring-1 ${isDark ? "border-slate-600 bg-slate-700 text-slate-200 focus:ring-slate-500" : "border-gray-200 bg-white text-gray-700 focus:ring-gray-300"}`}
                  >
                    {[10, 25, 50, 100, 250].map((n) => (
                      <option key={n} value={n}>{n}</option>
                    ))}
                  </select>
                  <ChevronDownIcon className="pointer-events-none absolute right-1 top-1/2 -translate-y-1/2 w-3 h-3 text-gray-400" />
                </div>
              </label>
            </div>

            <div className="flex items-center gap-1">
              <PageBtn isDark={isDark} onClick={() => setPage(1)} disabled={page === 1} title="First page">
                <ChevronDoubleLeftIcon className="w-3.5 h-3.5" />
              </PageBtn>
              <PageBtn isDark={isDark} onClick={() => setPage((p) => Math.max(1, p - 1))} disabled={page === 1} title="Previous page">
                <ChevronLeftIcon className="w-3.5 h-3.5" />
              </PageBtn>
              <span className={`mx-1 px-2.5 py-1 rounded-md text-xs font-semibold ${isDark ? "bg-slate-700 text-slate-200" : "bg-white text-gray-700 ring-1 ring-gray-200"}`}>
                {page} / {pageCount}
              </span>
              <PageBtn isDark={isDark} onClick={() => setPage((p) => Math.min(pageCount, p + 1))} disabled={page === pageCount} title="Next page">
                <ChevronRightIcon className="w-3.5 h-3.5" />
              </PageBtn>
              <PageBtn isDark={isDark} onClick={() => setPage(pageCount)} disabled={page === pageCount} title="Last page">
                <ChevronDoubleRightIcon className="w-3.5 h-3.5" />
              </PageBtn>
            </div>
          </div>
        )}
      </div>

      {/* ===== Mark invoice as paid (settle) modal ===== */}
      {settleTarget && (
        <div className="ledger-modal fixed inset-0 z-50 flex items-center justify-center" onClick={(e) => { if (e.target === e.currentTarget) closeSettle(); }}>
          <div className="absolute inset-0 bg-black/40 backdrop-blur-xs" />
          <div className="relative w-full max-w-md">
            <GlassCard>
              <GlassSectionHeader
                title={<span className="inline-flex items-center gap-2">
                  <CheckCircleIcon className="w-5 h-5" style={{ color: themeColors.emerald }} />
                  <span>Mark invoice as paid?</span>
                </span>}
                right={<button aria-label="Close dialog" className={`p-1.5 rounded-lg ${tintIconBtn}`} onClick={closeSettle}><XMarkIcon className="w-5 h-5" /></button>}
              />
              <div className="px-4 py-4 space-y-3">
                <p className={`text-sm ${isDark ? "text-slate-300" : "text-gray-700"}`}>
                  The outstanding balance of invoice <b>{settleTarget.posted_number || "—"}</b> will be
                  recorded as received, making it <b>fully paid</b>. The sale invoice and this ledger row
                  are updated together.
                </p>

                <div className={`rounded-lg px-3 py-2.5 space-y-1.5 text-sm ${isDark ? "bg-slate-700/60" : "bg-gray-50 ring-1 ring-gray-200"}`}>
                  <div className="flex items-center justify-between">
                    <span className="text-xs text-gray-500 dark:text-gray-400">Bill total</span>
                    <span className="font-semibold text-gray-800 dark:text-gray-100">{fmt(settleTarget.invoice_total || 0)}</span>
                  </div>
                  <div className="flex items-center justify-between">
                    <span className="text-xs text-gray-500 dark:text-gray-400">Already received</span>
                    <span className="font-semibold text-gray-800 dark:text-gray-100">{fmt(settleTarget.invoice_settled ?? settleTarget.total_received ?? 0)}</span>
                  </div>
                  <div className={`flex items-center justify-between border-t pt-1.5 ${isDark ? "border-slate-600" : "border-gray-200"}`}>
                    <span className="text-xs font-medium text-gray-600 dark:text-gray-300">Amount to settle</span>
                    <span className="font-bold" style={{ color: themeColors.emerald }}>{fmt(settleTarget.invoice_due ?? settleTarget.balance_remaining ?? 0)}</span>
                  </div>
                </div>

                <div className="flex justify-end gap-2">
                  <button
                    className={`min-w-[100px] px-4 py-2 text-sm font-medium ${btnOutlined.className}`}
                    style={btnOutlined.style}
                    onClick={closeSettle}
                    disabled={settling}
                  >
                    Cancel
                  </button>
                  <button
                    className={`min-w-[170px] px-4 py-2 text-sm font-semibold transition-all duration-200 disabled:opacity-60 inline-flex items-center justify-center gap-1.5 ${btnEmerald.className}`}
                    style={btnEmerald.style}
                    onClick={confirmSettle}
                    disabled={settling}
                  >
                    {settling ? <ArrowPathIcon className="w-4 h-4 animate-spin" /> : <CheckCircleIcon className="w-4 h-4" />}
                    <span>{settling ? "Marking…" : "Yes, mark as paid"}</span>
                  </button>
                </div>
              </div>
            </GlassCard>
          </div>
        </div>
      )}

      {/* ===== Add Row modal ===== */}
      {addModal.open && (
        <div className="ledger-modal fixed inset-0 z-50 flex items-center justify-center" onClick={(e)=>{ if(e.target===e.currentTarget) closeAddModal(); }}>
          <div className="absolute inset-0 bg-black/40 backdrop-blur-xs" />
          <div className="relative w-full max-w-sm">
            <GlassCard>
              <GlassSectionHeader
                title={<span className="font-semibold text-lg">{addModal.type === "payment" ? "Add Payment row?" : "Add Manual row?"}</span>}
                right={<button aria-label="Close dialog" className={`p-1.5 rounded-lg ${tintIconBtn}`} onClick={closeAddModal}><XMarkIcon className="w-5 h-5" /></button>}
              />
              <div className="px-4 py-4">
                <p className={`text-sm ${isDark ? "text-slate-300" : "text-gray-700"}`}>
                  A new <b>{addModal.type}</b> row will be added at the <b>top</b> of the ledger for the selected customer.
                </p>
                <div className="mt-4 flex justify-end gap-2">
                  <button className={`min-w-[100px] px-4 py-2 text-sm font-medium ${btnOutlined.className}`} style={btnOutlined.style} onClick={closeAddModal}>Cancel</button>
                  <button 
                    className={`min-w-[120px] px-4 py-2 text-sm font-semibold transition-all duration-200 ${btnPrimary.className}`}
                    style={btnPrimary.style}
                    onClick={confirmAdd}
                  >
                    Add row
                  </button>
                </div>
              </div>
            </GlassCard>
          </div>
        </div>
      )}

      {/* ===== Save confirm modal ===== */}
      {saveModalOpen && (
        <div className="ledger-modal fixed inset-0 z-50 flex items-center justify-center" onClick={(e)=>{ if(e.target===e.currentTarget) closeSaveModal(); }}>
          <div className="absolute inset-0 bg-black/40" />
          <div className="relative w-full max-w-md">
            <GlassCard>
              <GlassSectionHeader
                title={<span className="inline-flex items-center gap-2">
                  <ArrowDownOnSquareIcon 
                    className="w-5 h-5" 
                    style={{ color: themeColors.emerald }}
                  />
                  <span>Save changes?</span>
                </span>}
                right={<button aria-label="Close dialog" className={`p-1.5 rounded-lg ${tintIconBtn}`} onClick={closeSaveModal}><XMarkIcon className="w-5 h-5" /></button>}
              />
              <div className="px-4 py-4">
                <p className="text-sm text-gray-700">
                  You’re about to save <b>{newCount}</b> new {newCount === 1 ? "row" : "rows"} and update{" "}
                  <b>{updCount}</b> existing {updCount === 1 ? "row" : "rows"} for this customer.
                </p>
                <div className="mt-4 flex justify-end gap-2">
                  <button className={`min-w-[100px] px-4 py-2 text-sm font-medium ${btnOutlined.className}`} style={btnOutlined.style} onClick={closeSaveModal}>Cancel</button>
                  <button 
                    className={`min-w-[120px] px-4 py-2 text-sm font-semibold transition-all duration-200 ${btnEmerald.className}`}
                    style={btnEmerald.style}
                    onClick={confirmSave}
                  >
                    Yes, Save
                  </button>
                </div>
              </div>
            </GlassCard>
          </div>
        </div>
      )}

      {/* ===== Delete (2-step) modal ===== */}
      {deleteModalOpen && (
        <div className="ledger-modal fixed inset-0 z-50 flex items-center justify-center" onClick={(e)=>{ if(e.target===e.currentTarget) closeDeleteModal(); }}>
          <div className="absolute inset-0 bg-black/40" />
          <div className="relative w-full max-w-md">
            <GlassCard>
              <GlassSectionHeader
                title={<span className="inline-flex items-center gap-2">
                  <ShieldExclamationIcon 
                    className="w-5 h-5" 
                    style={{ color: themeColors.danger }}
                  />
                  <span>Delete ledger row</span>
                </span>}
                right={<button aria-label="Close dialog" className={`p-1.5 rounded-lg ${tintIconBtn}`} onClick={closeDeleteModal}><XMarkIcon className="w-5 h-5" /></button>}
              />
                <div className="px-4 py-4 space-y-4">
                {deleteStep === 1 ? (
                  <>
                    <p className={`text-sm ${isDark ? "text-slate-300" : "text-gray-700"}`}>
                      Are you sure you want to delete this row? This action cannot be undone.
                    </p>
                    <div className="flex justify-end gap-2">
                      <button className={`min-w-[100px] px-4 py-2 text-sm font-medium ${btnOutlined.className}`} style={btnOutlined.style} onClick={closeDeleteModal}>Cancel</button>
                      <button 
                        className={`min-w-[140px] px-4 py-2 text-sm font-semibold transition-all duration-200 ${btnDanger.className}`}
                        style={btnDanger.style}
                        onClick={proceedDeletePassword}
                      >
                        Yes, continue
                      </button>
                    </div>
                  </>
                ) : (
                  <>
                    <p className={`text-sm ${isDark ? "text-slate-300" : "text-gray-700"}`}>
                      For security, please re-enter your password to delete this row.
                    </p>
                    <GlassInput
                      type="password"
                      autoFocus
                      value={password}
                      onChange={(e) => setPassword(e.target.value)}
                      placeholder="Your password"
                      onKeyDown={(e) => {
                        if (e.key === "Enter") confirmAndDelete();
                        if (e.key === "Escape") closeDeleteModal();
                      }}
                      className="w-full"
                    />
                    <div className="flex flex-wrap items-center justify-between gap-2">
                      <button className={`px-4 py-2 text-sm font-medium ${btnOutlined.className}`} style={btnOutlined.style} onClick={() => setDeleteStep(1)} disabled={deleting}>
                        ← Back
                      </button>
                      <div className="flex flex-wrap gap-2 flex-1 sm:flex-initial justify-end">
                        <button className={`px-4 py-2 text-sm font-medium ${btnOutlined.className}`} style={btnOutlined.style} onClick={closeDeleteModal} disabled={deleting}>
                          Cancel
                        </button>
                        <button
                          className={`flex-1 sm:flex-initial px-4 py-2 text-sm font-semibold transition-all duration-200 disabled:opacity-60 ${btnDanger.className}`}
                          style={btnDanger.style}
                          onClick={confirmAndDelete}
                          disabled={deleting || password.trim() === ""}
                        >
                          {deleting ? "Deleting…" : "Confirm & Delete"}
                        </button>
                      </div>
                    </div>
                  </>
                )}
              </div>
            </GlassCard>
          </div>
        </div>
      )}

{/* ===== Customer Search Modal (new select) ===== */}
      <CustomerSearch
        isOpen={customerSearchOpen}
        onClose={() => setCustomerSearchOpen(false)}
        onSelect={(cust) => {
          setCustomerId(cust ? String(cust.id) : "");
          setCustomerSearchOpen(false);
        }}
      />

      {/* Record Payment Modal */}
      <RecordPaymentModal
        isOpen={recordPaymentOpen}
        onClose={() => setRecordPaymentOpen(false)}
        partyType="customer"
        partyId={customerId}
        partyName={selectedCustomer?.name || ""}
        onPaymentSuccess={() => {
          fetchData();
        }}
      />

      {/* Payment Vouchers History Modal */}
      <PaymentHistoryModal
        isOpen={paymentHistoryOpen}
        onClose={() => setPaymentHistoryOpen(false)}
        partyType="customer"
        partyId={customerId}
        partyName={selectedCustomer?.name || ""}
        onPaymentReversed={() => {
          fetchData();
        }}
      />

      {/* Outbound Document Share Modal (WhatsApp / Email PDF) */}
      <ShareDocumentModal
        isOpen={shareModalOpen}
        onClose={() => setShareModalOpen(false)}
        documentType="customer_ledger"
        queryParams={{
          customer_id: customerId,
          from: fromDate || undefined,
          to: toDate || undefined,
        }}
      />

      {/* print + portal helpers */}
      <style>{`
        @media print {
          input, button, select, [role="button"] { display: none !important; }
          table { font-size: 11px; }
          thead { position: sticky; top: 0; }
        }
      `}</style>
    </div>
  );
}

/* Compact, glassy metric tile used in the hero header strip */
function HeroStat({ label, value, tone = "neutral" }) {
  return (
    <div className={`ledger-stat ledger-stat-${tone}`}>
      <div className="ledger-stat-label">{label}</div>
      <div className="ledger-stat-value">{value}</div>
    </div>
  );
}
/* Compact square button used by the ledger pagination footer */
function PageBtn({ isDark, onClick, disabled, title, children }) {
  return (
    <button
      onClick={onClick}
      disabled={disabled}
      title={title}
      aria-label={title}
      className={`ledger-page-button inline-flex items-center justify-center w-7 h-7 rounded-md border transition-all duration-200 ${
        disabled
          ? "opacity-40 cursor-not-allowed"
          : isDark
          ? "border-slate-600 bg-slate-700 text-slate-200 hover:bg-slate-600"
          : "border-gray-200 bg-white text-gray-600 hover:bg-gray-100"
      }`}
    >
      {children}
    </button>
  );
}
