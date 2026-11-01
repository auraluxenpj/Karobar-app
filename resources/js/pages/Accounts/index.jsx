// resources/js/pages/Accounts/index.jsx
// Dedicated Financial Accounts dashboard page — bank, wallet & cash balances with statements.
import React, { useCallback, useEffect, useMemo, useRef, useState } from "react";
import axios from "axios";
import toast from "react-hot-toast";
import Select from "react-select";
import {
  BuildingLibraryIcon,
  BanknotesIcon,
  CreditCardIcon,
  DevicePhoneMobileIcon,
  ArrowsRightLeftIcon,
  ArrowDownLeftIcon,
  ArrowUpRightIcon,
  PlusCircleIcon,
  ArrowPathIcon,
  MagnifyingGlassIcon,
  ChevronLeftIcon,
  ChevronRightIcon,
  ChevronDoubleLeftIcon,
  ChevronDoubleRightIcon,
  XMarkIcon,
  CheckCircleIcon,
  SparklesIcon,
  InformationCircleIcon,
  DocumentTextIcon,
  PencilSquareIcon,
  TrashIcon,
} from "@heroicons/react/24/solid";
import { useTheme } from "@/context/ThemeContext";
import { useCurrency } from "@/context/CurrencyContext";
import { getThemeButtonClasses } from "@/utils/buttonStyles";
import { GlassCard, GlassSectionHeader, GlassInput, GlassToolbar, GlassBtn } from "@/components";
import AccountIcon from "@/components/AccountIcon.jsx";

// ─── Transaction type labels ──────────────────────────────────────────────────
const TXN_TYPE_LABELS = {
  opening_balance: "Opening Balance",
  deposit: "Deposit",
  withdrawal: "Withdrawal",
  transfer_in: "Transfer In",
  transfer_out: "Transfer Out",
  adjustment: "Adjustment",
};

const TXN_TYPE_COLORS = {
  opening_balance: "text-emerald-600 dark:text-emerald-400",
  deposit: "text-emerald-600 dark:text-emerald-400",
  withdrawal: "text-red-600 dark:text-red-400",
  transfer_in: "text-blue-600 dark:text-blue-400",
  transfer_out: "text-amber-600 dark:text-amber-400",
  adjustment: "text-indigo-600 dark:text-indigo-400",
};

const TXN_TYPE_OPTIONS = [
  { value: "", label: "All Types" },
  { value: "opening_balance", label: "Opening Balance" },
  { value: "deposit", label: "Deposits" },
  { value: "withdrawal", label: "Withdrawals" },
  { value: "transfer_in", label: "Transfers In" },
  { value: "transfer_out", label: "Transfers Out" },
  { value: "adjustment", label: "Adjustments" },
];

const ACCOUNT_TYPE_ICONS = {
  cash: BanknotesIcon,
  bank: BuildingLibraryIcon,
  card: CreditCardIcon,
  mobile_wallet: DevicePhoneMobileIcon,
  other: BuildingLibraryIcon,
};

const ACCOUNT_TYPE_OPTIONS = [
  { value: "bank", label: "Bank" },
  { value: "cash", label: "Cash" },
  { value: "card", label: "Card / POS Terminal" },
  { value: "mobile_wallet", label: "Mobile Wallet" },
  { value: "other", label: "Other" },
];

// ─── Helper ───────────────────────────────────────────────────────────────────
function fmtDate(dt) {
  if (!dt) return "—";
  return new Date(dt).toLocaleDateString("en-PK", {
    day: "2-digit", month: "short", year: "numeric",
  });
}

// ─── Main Component ───────────────────────────────────────────────────────────
export default function AccountsPage() {
  const { isDark, theme } = useTheme();
  const { formatCurrency } = useCurrency();

  // Theme-based button styles
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
    input: (base) => ({ ...base, color: isDark ? "#e2e8f0" : "#111827" }),
    placeholder: (base) => ({ ...base, color: isDark ? "#64748b" : "#9ca3af" }),
  }), [isDark]);

  // ── State: Accounts list ──────────────────────────────────────────────────
  const [accounts, setAccounts] = useState([]);
  const [summary, setSummary] = useState({ total_balance: 0, by_type: {}, count: 0 });
  const [loadingAccounts, setLoadingAccounts] = useState(true);

  // ── State: Selected account for statement ─────────────────────────────────
  const [selectedAccount, setSelectedAccount] = useState(null);
  const [transactions, setTransactions] = useState([]);
  const [loadingTxns, setLoadingTxns] = useState(false);
  const [txnPage, setTxnPage] = useState(1);
  const [txnTotal, setTxnTotal] = useState(0);
  const [txnPerPage] = useState(15);
  const [txnType, setTxnType] = useState("");
  const [txnFrom, setTxnFrom] = useState("");
  const [txnTo, setTxnTo] = useState("");

  // ── State: Modals ─────────────────────────────────────────────────────────
  const [modalMode, setModalMode] = useState(null); // 'create'|'transfer'|'adjust'|null
  const [editingAccount, setEditingAccount] = useState(null);

  // ── Create/Edit form ───────────────────────────────────────────────────────
  const [formName, setFormName] = useState("");
  const [formType, setFormType] = useState("bank");
  const [formBankName, setFormBankName] = useState("");
  const [formAccountNumber, setFormAccountNumber] = useState("");
  const [formOpeningBalance, setFormOpeningBalance] = useState("");
  const [formCode, setFormCode] = useState("");
  const [formIcon, setFormIcon] = useState("");
  const [formColor, setFormColor] = useState("");
  const [formIsActive, setFormIsActive] = useState(true);
  const [formNotes, setFormNotes] = useState("");
  const [formSaving, setFormSaving] = useState(false);
  const [seedingDefaults, setSeedingDefaults] = useState(false);
  const [presets, setPresets] = useState({ banks: [], wallets: [] });

  // ── Transfer form ──────────────────────────────────────────────────────────
  const [transferFrom, setTransferFrom] = useState(null);
  const [transferTo, setTransferTo] = useState(null);
  const [transferAmount, setTransferAmount] = useState("");
  const [transferNotes, setTransferNotes] = useState("");
  const [transferSaving, setTransferSaving] = useState(false);

  // ── Adjust form ────────────────────────────────────────────────────────────
  const [adjustAccount, setAdjustAccount] = useState(null);
  const [adjustType, setAdjustType] = useState("deposit");
  const [adjustAmount, setAdjustAmount] = useState("");
  const [adjustReason, setAdjustReason] = useState("");
  const [adjustSaving, setAdjustSaving] = useState(false);

  // ── Load accounts ──────────────────────────────────────────────────────────
  const fetchAccounts = useCallback(async () => {
    setLoadingAccounts(true);
    try {
      const { data } = await axios.get("/api/accounts");
      const list = Array.isArray(data?.accounts) ? data.accounts : (Array.isArray(data) ? data : []);
      setAccounts(list);
      if (data?.summary) setSummary(data.summary);
    } catch {
      toast.error("Failed to load accounts");
    } finally {
      setLoadingAccounts(false);
    }
  }, []);

  useEffect(() => { fetchAccounts(); }, [fetchAccounts]);

  useEffect(() => {
    axios
      .get("/api/accounts/presets")
      .then(({ data }) => {
        setPresets({
          banks: Array.isArray(data?.banks) ? data.banks : [],
          wallets: Array.isArray(data?.wallets) ? data.wallets : [],
        });
      })
      .catch(() => {});
  }, []);

  const handleSeedDefaults = async () => {
    setSeedingDefaults(true);
    try {
      const { data } = await axios.post("/api/accounts/seed-defaults");
      toast.success(data?.message || "Standard accounts seeded");
      fetchAccounts();
    } catch (err) {
      toast.error(err?.response?.data?.message || "Failed to seed default accounts");
    } finally {
      setSeedingDefaults(false);
    }
  };

  // ── Load transactions for selected account ────────────────────────────────
  const fetchTransactions = useCallback(async () => {
    if (!selectedAccount) return;
    setLoadingTxns(true);
    try {
      const { data } = await axios.get(`/api/accounts/${selectedAccount.id}/transactions`, {
        params: {
          type: txnType || undefined,
          from_date: txnFrom || undefined,
          to_date: txnTo || undefined,
          per_page: txnPerPage,
          page: txnPage,
        },
      });
      const list = Array.isArray(data?.transactions?.data)
        ? data.transactions.data
        : (Array.isArray(data?.transactions) ? data.transactions : []);
      setTransactions(list);
      setTxnTotal(data?.transactions?.total || 0);
      // Refresh account balance
      if (data?.account) {
        setSelectedAccount(data.account);
        setAccounts(prev => prev.map(a => a.id === data.account.id ? data.account : a));
      }
    } catch {
      toast.error("Failed to load transactions");
    } finally {
      setLoadingTxns(false);
    }
  }, [selectedAccount?.id, txnType, txnFrom, txnTo, txnPage, txnPerPage]);

  useEffect(() => {
    if (selectedAccount) fetchTransactions();
  }, [fetchTransactions]);

  useEffect(() => { setTxnPage(1); }, [txnType, txnFrom, txnTo, selectedAccount?.id]);

  const txnPageCount = Math.max(1, Math.ceil(txnTotal / txnPerPage));

  // ── Open create / edit modal ───────────────────────────────────────────────
  const openCreate = () => {
    setEditingAccount(null);
    setFormName(""); setFormType("bank"); setFormBankName("");
    setFormAccountNumber(""); setFormOpeningBalance("");
    setFormCode(""); setFormIcon(""); setFormColor("");
    setFormIsActive(true); setFormNotes("");
    setModalMode("create");
  };

  const openEdit = (account) => {
    setEditingAccount(account);
    setFormName(account.name || "");
    setFormType(account.type || "bank");
    setFormBankName(account.bank_name || "");
    setFormAccountNumber(account.account_number || "");
    setFormOpeningBalance(String(account.opening_balance ?? 0));
    setFormCode(account.code || "");
    setFormIcon(account.icon || "");
    setFormColor(account.color || "");
    setFormIsActive(account.is_active !== false);
    setFormNotes(account.notes || "");
    setModalMode("create");
  };

  const handleApplyPreset = (preset) => {
    if (!preset) return;
    setFormName(preset.name || "");
    setFormType(preset.type || "bank");
    setFormBankName(preset.full_name || preset.name || "");
    setFormCode(preset.code || "");
    setFormIcon(preset.icon || preset.code || "");
    setFormColor(preset.color || "");
  };

  const handleDeleteAccount = async (account) => {
    if (!window.confirm(`Delete account "${account.name}"?`)) return;
    try {
      await axios.delete(`/api/accounts/${account.id}`);
      toast.success("Account deleted");
      if (selectedAccount?.id === account.id) setSelectedAccount(null);
      fetchAccounts();
    } catch (err) {
      toast.error(err?.response?.data?.message || "Failed to delete account");
    }
  };

  // ── Submit create/edit ─────────────────────────────────────────────────────
  const handleFormSubmit = async (e) => {
    e.preventDefault();
    if (!formName.trim()) { toast.error("Account name is required"); return; }
    setFormSaving(true);
    try {
      const payload = {
        name: formName.trim(),
        type: formType,
        code: formCode.trim() || null,
        icon: formIcon.trim() || null,
        color: formColor.trim() || null,
        bank_name: formBankName.trim() || null,
        account_number: formAccountNumber.trim() || null,
        is_active: formIsActive,
        notes: formNotes.trim() || null,
      };
      if (!editingAccount) {
        payload.opening_balance = parseFloat(formOpeningBalance) || 0;
      }
      if (editingAccount) {
        await axios.put(`/api/accounts/${editingAccount.id}`, payload);
        toast.success("Account updated");
      } else {
        await axios.post("/api/accounts", payload);
        toast.success("Account created");
      }
      setModalMode(null);
      fetchAccounts();
    } catch (err) {
      toast.error(err?.response?.data?.message || "Failed to save account");
    } finally {
      setFormSaving(false);
    }
  };

  // ── Submit transfer ────────────────────────────────────────────────────────
  const handleTransfer = async (e) => {
    e.preventDefault();
    if (!transferFrom || !transferTo) { toast.error("Select both accounts"); return; }
    if (transferFrom.value === transferTo.value) { toast.error("Cannot transfer to same account"); return; }
    const amt = parseFloat(transferAmount);
    if (!amt || amt <= 0) { toast.error("Enter a valid amount"); return; }
    setTransferSaving(true);
    try {
      await axios.post("/api/accounts/transfer", {
        from_account_id: transferFrom.value,
        to_account_id: transferTo.value,
        amount: amt,
        notes: transferNotes.trim() || null,
      });
      toast.success(`Transferred ${formatCurrency(amt)} successfully`);
      setModalMode(null);
      setTransferFrom(null); setTransferTo(null);
      setTransferAmount(""); setTransferNotes("");
      fetchAccounts();
      if (selectedAccount) fetchTransactions();
    } catch (err) {
      toast.error(err?.response?.data?.message || "Transfer failed");
    } finally {
      setTransferSaving(false);
    }
  };

  // ── Submit adjust ──────────────────────────────────────────────────────────
  const handleAdjust = async (e) => {
    e.preventDefault();
    if (!adjustAccount) { toast.error("Select an account"); return; }
    const amt = parseFloat(adjustAmount);
    if (!amt || amt <= 0) { toast.error("Enter a valid amount"); return; }
    if (!adjustReason.trim()) { toast.error("Reason is required"); return; }
    setAdjustSaving(true);
    try {
      await axios.post(`/api/accounts/${adjustAccount.value}/adjust`, {
        type: adjustType,
        amount: amt,
        reason: adjustReason.trim(),
      });
      toast.success(`${adjustType === "deposit" ? "Deposit" : "Withdrawal"} recorded`);
      setModalMode(null);
      setAdjustAccount(null); setAdjustAmount(""); setAdjustReason("");
      fetchAccounts();
      if (selectedAccount?.id === adjustAccount.value) fetchTransactions();
    } catch (err) {
      toast.error(err?.response?.data?.message || "Adjustment failed");
    } finally {
      setAdjustSaving(false);
    }
  };

  // ── Account options for selects ───────────────────────────────────────────
  const accountOptions = useMemo(() =>
    accounts.map(a => ({
      value: a.id,
      label: `${a.name} (${formatCurrency(parseFloat(a.current_balance || 0))})`,
    })),
    [accounts, formatCurrency]
  );

  // ── Summary stats ─────────────────────────────────────────────────────────
  const totalBalance = useMemo(() =>
    accounts.reduce((sum, a) => sum + parseFloat(a.current_balance || 0), 0),
    [accounts]
  );

  const inputCls = `w-full rounded-lg border px-3 py-2 text-sm focus:outline-none focus:ring-2 transition-colors ${
    isDark
      ? "bg-slate-800 border-slate-600 text-slate-100 focus:ring-blue-500/40 placeholder-slate-500"
      : "bg-white border-slate-300 text-slate-900 focus:ring-blue-500/40 placeholder-slate-400"
  }`;
  const labelCls = `block text-sm font-medium mb-1.5 ${isDark ? "text-slate-300" : "text-slate-700"}`;

  // ── Render ────────────────────────────────────────────────────────────────
  return (
    <div className="space-y-5 px-1">
      {/* ── Page Header ─────────────────────────────────────────────────── */}
      <GlassSectionHeader
        title="Financial Accounts"
        right={
          <div className="flex flex-wrap items-center gap-2.5">
            <button
              type="button"
              onClick={fetchAccounts}
              className={`flex items-center gap-1.5 px-3 py-1.5 text-xs font-medium rounded-lg ${btnSecondary.className}`}
              style={btnSecondary.style}
            >
              <ArrowPathIcon className="w-3.5 h-3.5" />
              Refresh
            </button>
            <button
              type="button"
              onClick={() => { setAdjustAccount(null); setAdjustType("deposit"); setAdjustAmount(""); setAdjustReason(""); setModalMode("adjust"); }}
              className={`flex items-center gap-1.5 px-3 py-1.5 text-xs font-medium rounded-lg ${btnSecondary.className}`}
              style={btnSecondary.style}
            >
              <ArrowUpRightIcon className="w-3.5 h-3.5" />
              Adjust
            </button>
            <button
              type="button"
              onClick={() => { setTransferFrom(null); setTransferTo(null); setTransferAmount(""); setTransferNotes(""); setModalMode("transfer"); }}
              className={`flex items-center gap-1.5 px-3 py-1.5 text-xs font-medium rounded-lg ${btnSecondary.className}`}
              style={btnSecondary.style}
            >
              <ArrowsRightLeftIcon className="w-3.5 h-3.5" />
              Transfer
            </button>
            <button
              type="button"
              onClick={openCreate}
              className={`flex items-center gap-1.5 px-3 py-1.5 text-xs font-medium rounded-lg ${btnPrimary.className}`}
              style={btnPrimary.style}
            >
              <PlusCircleIcon className="w-4 h-4" />
              Add Account
            </button>
          </div>
        }
      />

      {/* ── KPI Strip ────────────────────────────────────────────────────── */}
      <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
        <GlassCard className="p-4 min-w-0">
          <p className={`text-xs uppercase tracking-wide mb-1 font-medium truncate ${isDark ? "text-slate-400" : "text-slate-500"}`}>
            Total Balance
          </p>
          <p className={`text-lg sm:text-2xl font-bold font-mono truncate ${isDark ? "text-slate-100" : "text-slate-800"}`}>
            {formatCurrency(totalBalance)}
          </p>
        </GlassCard>
        <GlassCard className="p-4 min-w-0">
          <p className="text-xs uppercase tracking-wide mb-1 font-medium truncate text-emerald-600 dark:text-emerald-400">
            Cash Accounts
          </p>
          <p className="text-lg sm:text-2xl font-bold font-mono truncate text-emerald-600 dark:text-emerald-400">
            {formatCurrency(accounts.filter(a => a.type === "cash").reduce((s, a) => s + parseFloat(a.current_balance || 0), 0))}
          </p>
        </GlassCard>
        <GlassCard className="p-4 min-w-0">
          <p className="text-xs uppercase tracking-wide mb-1 font-medium truncate text-blue-600 dark:text-blue-400">
            Bank Accounts
          </p>
          <p className="text-lg sm:text-2xl font-bold font-mono truncate text-blue-600 dark:text-blue-400">
            {formatCurrency(accounts.filter(a => a.type === "bank").reduce((s, a) => s + parseFloat(a.current_balance || 0), 0))}
          </p>
        </GlassCard>
        <GlassCard className="p-4 min-w-0">
          <p className={`text-xs uppercase tracking-wide mb-1 font-medium truncate ${isDark ? "text-slate-400" : "text-slate-500"}`}>
            Active Accounts
          </p>
          <p className={`text-lg sm:text-2xl font-bold truncate ${isDark ? "text-slate-100" : "text-slate-800"}`}>
            {accounts.filter(a => a.is_active !== false).length}
          </p>
        </GlassCard>
      </div>

      {/* ── Account Cards Grid ────────────────────────────────────────────── */}
      {loadingAccounts ? (
        <div className="flex items-center justify-center h-40">
          <ArrowPathIcon className="w-8 h-8 animate-spin text-slate-400" />
        </div>
      ) : accounts.length === 0 ? (
        <GlassCard className="p-10 text-center">
          <BuildingLibraryIcon className={`w-12 h-12 mx-auto mb-3 opacity-30 ${isDark ? "text-slate-400" : "text-slate-500"}`} />
          <p className={`font-semibold mb-1 ${isDark ? "text-slate-300" : "text-slate-600"}`}>No Accounts Yet</p>
          <p className={`text-sm mb-4 ${isDark ? "text-slate-500" : "text-slate-400"}`}>
            Add your bank accounts, cash drawer, or mobile wallets to track balances.
          </p>
          <button
            onClick={openCreate}
            className={`inline-flex items-center gap-2 px-4 py-2 text-sm font-semibold rounded-lg ${btnPrimary.className}`}
            style={btnPrimary.style}
          >
            <PlusCircleIcon className="w-4 h-4" />
            Add First Account
          </button>
        </GlassCard>
      ) : (
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-4">
          {accounts.map((account) => {
            const bal = parseFloat(account.current_balance || 0);
            const isSelected = selectedAccount?.id === account.id;
            return (
              <GlassCard
                key={account.id}
                className={`p-4 cursor-pointer transition-all duration-150 ${
                  isSelected
                    ? "ring-2 ring-offset-1 " + (isDark ? "ring-blue-500 ring-offset-slate-900" : "ring-blue-500 ring-offset-white")
                    : "hover:shadow-lg"
                }`}
                onClick={() => {
                  if (isSelected) { setSelectedAccount(null); }
                  else { setSelectedAccount(account); setTxnPage(1); }
                }}
              >
                <div className="flex items-start gap-3">
                  <AccountIcon
                    icon={account.icon}
                    code={account.code}
                    type={account.type}
                    className="w-10 h-10 flex-shrink-0"
                  />
                  <div className="flex-1 min-w-0">
                    <div className="flex items-start justify-between gap-1">
                      <p className={`font-semibold text-sm truncate ${isDark ? "text-slate-100" : "text-slate-800"}`}>
                        {account.name}
                      </p>
                      <span className={`text-xs px-1.5 py-0.5 rounded capitalize flex-shrink-0 ${
                        account.type === "bank" ? "bg-blue-100 text-blue-700 dark:bg-blue-900/40 dark:text-blue-300" :
                        account.type === "cash" ? "bg-emerald-100 text-emerald-700 dark:bg-emerald-900/40 dark:text-emerald-300" :
                        account.type === "mobile_wallet" ? "bg-amber-100 text-amber-700 dark:bg-amber-900/40 dark:text-amber-300" :
                        account.type === "card" ? "bg-purple-100 text-purple-700 dark:bg-purple-900/40 dark:text-purple-300" :
                        "bg-slate-100 text-slate-600 dark:bg-slate-700 dark:text-slate-300"
                      }`}>
                        {account.type === "mobile_wallet" ? "Wallet" : account.type}
                      </span>
                    </div>
                    {account.bank_name && (
                      <p className={`text-xs truncate mt-0.5 ${isDark ? "text-slate-500" : "text-slate-400"}`}>
                        {account.bank_name}
                      </p>
                    )}
                    {account.account_number && (
                      <p className={`text-xs font-mono truncate ${isDark ? "text-slate-500" : "text-slate-400"}`}>
                        ****{account.account_number.slice(-4)}
                      </p>
                    )}
                    <p className={`text-lg font-bold font-mono mt-2 ${
                      bal >= 0 ? "text-emerald-600 dark:text-emerald-400" : "text-red-600 dark:text-red-400"
                    }`}>
                      {formatCurrency(bal)}
                    </p>
                  </div>
                </div>

                {/* Quick action buttons */}
                <div className="flex flex-wrap items-center gap-1.5 mt-3 pt-3 border-t border-slate-200/30 dark:border-slate-700/30">
                  <button
                    onClick={(e) => {
                      e.stopPropagation();
                      setAdjustAccount({ value: account.id, label: account.name });
                      setAdjustType("deposit"); setAdjustAmount(""); setAdjustReason("");
                      setModalMode("adjust");
                    }}
                    className={`flex-1 flex items-center justify-center gap-1 px-2 py-1 text-xs rounded-md transition-colors ${
                      isDark ? "bg-slate-700/60 hover:bg-slate-700 text-slate-400 hover:text-slate-200" : "bg-slate-100 hover:bg-slate-200 text-slate-500 hover:text-slate-700"
                    }`}
                    title="Adjust balance"
                  >
                    <ArrowUpRightIcon className="w-3 h-3" />
                    Adjust
                  </button>
                  <button
                    onClick={(e) => {
                      e.stopPropagation();
                      setTransferFrom({ value: account.id, label: account.name });
                      setTransferTo(null); setTransferAmount(""); setTransferNotes("");
                      setModalMode("transfer");
                    }}
                    className={`flex-1 flex items-center justify-center gap-1 px-2 py-1 text-xs rounded-md transition-colors ${
                      isDark ? "bg-slate-700/60 hover:bg-slate-700 text-slate-400 hover:text-slate-200" : "bg-slate-100 hover:bg-slate-200 text-slate-500 hover:text-slate-700"
                    }`}
                    title="Transfer funds"
                  >
                    <ArrowsRightLeftIcon className="w-3 h-3" />
                    Transfer
                  </button>
                  <button
                    type="button"
                    onClick={(e) => {
                      e.stopPropagation();
                      if (!isSelected) { setSelectedAccount(account); setTxnPage(1); }
                    }}
                    className={`flex-1 flex items-center justify-center gap-1 px-2 py-1 text-xs rounded-md transition-colors ${
                      isSelected
                        ? "bg-blue-100 text-blue-700 dark:bg-blue-900/40 dark:text-blue-300"
                        : isDark ? "bg-slate-700/60 hover:bg-slate-700 text-slate-400 hover:text-slate-200" : "bg-slate-100 hover:bg-slate-200 text-slate-500 hover:text-slate-700"
                    }`}
                    title="View statement"
                  >
                    <DocumentTextIcon className="w-3 h-3" />
                    Statement
                  </button>
                  <button
                    type="button"
                    onClick={(e) => {
                      e.stopPropagation();
                      openEdit(account);
                    }}
                    className={`p-1.5 text-xs rounded-md transition-colors ${
                      isDark ? "bg-slate-700/60 hover:bg-slate-700 text-slate-400 hover:text-blue-400" : "bg-slate-100 hover:bg-slate-200 text-slate-500 hover:text-blue-600"
                    }`}
                    title="Edit account"
                    aria-label={`Edit ${account.name}`}
                  >
                    <PencilSquareIcon className="w-3.5 h-3.5" />
                  </button>
                  {!(account.type === "cash" && account.is_default) && account.code !== "cash_drawer" && (
                    <button
                      type="button"
                      onClick={(e) => {
                        e.stopPropagation();
                        handleDeleteAccount(account);
                      }}
                      className={`p-1.5 text-xs rounded-md transition-colors ${
                        isDark ? "bg-slate-700/60 hover:bg-rose-900/40 text-slate-400 hover:text-rose-400" : "bg-slate-100 hover:bg-rose-100 text-slate-500 hover:text-rose-600"
                      }`}
                      title="Delete account"
                      aria-label={`Delete ${account.name}`}
                    >
                      <TrashIcon className="w-3.5 h-3.5" />
                    </button>
                  )}
                </div>
              </GlassCard>
            );
          })}
        </div>
      )}

      {/* ── Account Statement ──────────────────────────────────────────────── */}
      {selectedAccount && (
        <GlassCard className="overflow-hidden">
          {/* Statement header */}
          <div className={`flex flex-wrap items-center justify-between gap-3 px-5 py-4 border-b ${isDark ? "border-slate-700 bg-slate-800/50" : "border-slate-200 bg-slate-50"}`}>
            <div className="flex items-center gap-3">
              <AccountIcon icon={selectedAccount.icon} code={selectedAccount.code} type={selectedAccount.type} className="w-8 h-8" />
              <div>
                <p className={`font-bold text-base ${isDark ? "text-slate-100" : "text-slate-800"}`}>{selectedAccount.name}</p>
                <p className={`text-xs ${isDark ? "text-slate-400" : "text-slate-500"}`}>
                  Balance: <span className="font-mono font-semibold text-emerald-600 dark:text-emerald-400">{formatCurrency(parseFloat(selectedAccount.current_balance || 0))}</span>
                </p>
              </div>
            </div>
            <div className="flex flex-wrap items-center gap-2">
              {/* Filters */}
              <div className="w-36">
                <Select
                  options={TXN_TYPE_OPTIONS}
                  value={TXN_TYPE_OPTIONS.find(o => o.value === txnType) || TXN_TYPE_OPTIONS[0]}
                  onChange={opt => setTxnType(opt?.value || "")}
                  styles={selectStyles}
                  isSearchable={false}
                  placeholder="All Types"
                />
              </div>
              <input
                type="date"
                value={txnFrom}
                onChange={e => setTxnFrom(e.target.value)}
                className={`text-xs rounded-lg border px-2 py-1.5 focus:outline-none ${isDark ? "bg-slate-800 border-slate-600 text-slate-200" : "bg-white border-slate-300 text-slate-800"}`}
              />
              <span className={`text-xs ${isDark ? "text-slate-500" : "text-slate-400"}`}>to</span>
              <input
                type="date"
                value={txnTo}
                onChange={e => setTxnTo(e.target.value)}
                className={`text-xs rounded-lg border px-2 py-1.5 focus:outline-none ${isDark ? "bg-slate-800 border-slate-600 text-slate-200" : "bg-white border-slate-300 text-slate-800"}`}
              />
              <button
                onClick={fetchTransactions}
                className={`p-1.5 rounded-lg transition-colors ${isDark ? "hover:bg-slate-700 text-slate-400" : "hover:bg-slate-200 text-slate-500"}`}
                title="Refresh"
              >
                <ArrowPathIcon className="w-4 h-4" />
              </button>
              <button
                onClick={() => setSelectedAccount(null)}
                className={`p-1.5 rounded-lg transition-colors ${isDark ? "hover:bg-slate-700 text-slate-400" : "hover:bg-slate-200 text-slate-500"}`}
                title="Close statement"
              >
                <XMarkIcon className="w-4 h-4" />
              </button>
            </div>
          </div>

          {/* Transaction table */}
          <div className="overflow-x-auto">
            <table className="w-full text-sm min-w-[640px]">
              <thead>
                <tr className={`border-b text-xs font-semibold uppercase tracking-wide ${isDark ? "border-slate-700 bg-slate-800/60 text-slate-400" : "border-slate-200 bg-slate-50 text-slate-500"}`}>
                  <th className="py-3 px-4 text-left">Date</th>
                  <th className="py-3 px-4 text-left">Description</th>
                  <th className="py-3 px-4 text-left">Type</th>
                  <th className="py-3 px-4 text-left">Reference</th>
                  <th className="py-3 px-4 text-right">Amount</th>
                  <th className="py-3 px-4 text-right">Balance After</th>
                  <th className="py-3 px-4 text-left">By</th>
                </tr>
              </thead>
              <tbody className={`divide-y ${isDark ? "divide-slate-800" : "divide-slate-100"}`}>
                {loadingTxns ? (
                  <tr>
                    <td colSpan={7} className="py-10 text-center text-slate-400">
                      <ArrowPathIcon className="w-6 h-6 mx-auto animate-spin mb-2" />
                      Loading transactions…
                    </td>
                  </tr>
                ) : transactions.length === 0 ? (
                  <tr>
                    <td colSpan={7} className="py-10 text-center text-slate-400 text-sm">
                      No transactions found for the selected filters.
                    </td>
                  </tr>
                ) : (
                  transactions.map(txn => {
                    const isCredit =
                      txn.type === "deposit" ||
                      txn.type === "transfer_in" ||
                      txn.type === "opening_balance" ||
                      (txn.type === "adjustment" && parseFloat(txn.amount) >= 0);
                    return (
                      <tr key={txn.id} className={`transition-colors ${isDark ? "hover:bg-slate-800/40" : "hover:bg-slate-50/70"}`}>
                        <td className={`py-2.5 px-4 text-xs ${isDark ? "text-slate-400" : "text-slate-500"}`}>
                          {fmtDate(txn.transaction_date)}
                        </td>
                        <td className={`py-2.5 px-4 text-xs ${isDark ? "text-slate-300" : "text-slate-700"}`}>
                          {txn.description || "—"}
                        </td>
                        <td className={`py-2.5 px-4 text-xs font-medium ${TXN_TYPE_COLORS[txn.type] || ""}`}>
                          {TXN_TYPE_LABELS[txn.type] || txn.type}
                        </td>
                        <td className={`py-2.5 px-4 text-xs font-mono ${isDark ? "text-slate-500" : "text-slate-400"}`}>
                          {txn.reference_type || "—"}
                          {txn.reference_id ? ` #${txn.reference_id}` : ""}
                        </td>
                        <td className={`py-2.5 px-4 text-right text-sm font-bold font-mono ${
                          isCredit ? "text-emerald-600 dark:text-emerald-400" : "text-red-600 dark:text-red-400"
                        }`}>
                          {isCredit ? "+" : "−"}{formatCurrency(Math.abs(parseFloat(txn.amount)))}
                        </td>
                        <td className={`py-2.5 px-4 text-right text-sm font-mono ${isDark ? "text-slate-300" : "text-slate-600"}`}>
                          {formatCurrency(parseFloat(txn.balance_after))}
                        </td>
                        <td className={`py-2.5 px-4 text-xs ${isDark ? "text-slate-500" : "text-slate-400"}`}>
                          {txn.user?.name || "System"}
                        </td>
                      </tr>
                    );
                  })
                )}
              </tbody>
            </table>
          </div>

          {/* Statement pagination */}
          {!loadingTxns && txnTotal > txnPerPage && (
            <div className={`flex flex-wrap items-center justify-between gap-2 px-4 py-3 border-t text-xs ${isDark ? "border-slate-700 text-slate-400" : "border-slate-200 text-slate-500"}`}>
              <span>Showing {(txnPage - 1) * txnPerPage + 1}–{Math.min(txnPage * txnPerPage, txnTotal)} of {txnTotal}</span>
              <div className="flex items-center gap-1">
                <button onClick={() => setTxnPage(1)} disabled={txnPage <= 1} className="p-1 rounded disabled:opacity-30 hover:bg-slate-200 dark:hover:bg-slate-700"><ChevronDoubleLeftIcon className="w-4 h-4" /></button>
                <button onClick={() => setTxnPage(p => Math.max(1, p - 1))} disabled={txnPage <= 1} className="p-1 rounded disabled:opacity-30 hover:bg-slate-200 dark:hover:bg-slate-700"><ChevronLeftIcon className="w-4 h-4" /></button>
                <span className="px-2 font-medium">{txnPage} / {txnPageCount}</span>
                <button onClick={() => setTxnPage(p => Math.min(txnPageCount, p + 1))} disabled={txnPage >= txnPageCount} className="p-1 rounded disabled:opacity-30 hover:bg-slate-200 dark:hover:bg-slate-700"><ChevronRightIcon className="w-4 h-4" /></button>
                <button onClick={() => setTxnPage(txnPageCount)} disabled={txnPage >= txnPageCount} className="p-1 rounded disabled:opacity-30 hover:bg-slate-200 dark:hover:bg-slate-700"><ChevronDoubleRightIcon className="w-4 h-4" /></button>
              </div>
            </div>
          )}
        </GlassCard>
      )}

      {/* ══════════════════════════════════════════════════════════════════ */}
      {/* ── Modals ─────────────────────────────────────────────────────── */}
      {/* ══════════════════════════════════════════════════════════════════ */}

      {/* Create/Edit Account Modal */}
      {modalMode === "create" && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/60 backdrop-blur-sm" onClick={e => { if (e.target === e.currentTarget) setModalMode(null); }}>
          <GlassCard className="w-full max-w-lg max-h-[90dvh] overflow-y-auto p-4 sm:p-6 shadow-2xl">
            <div className={`flex items-center justify-between pb-4 border-b ${isDark ? "border-slate-700" : "border-slate-200"}`}>
              <div className="flex items-center gap-2">
                <BuildingLibraryIcon className="w-5 h-5 text-blue-500" />
                <h3 className={`font-bold text-base ${isDark ? "text-slate-100" : "text-slate-800"}`}>
                  {editingAccount ? "Edit Account" : "New Account"}
                </h3>
              </div>
              <button onClick={() => setModalMode(null)} className={`p-1.5 rounded-lg transition-colors ${isDark ? "hover:bg-slate-700 text-slate-400" : "hover:bg-slate-100 text-slate-500"}`}>
                <XMarkIcon className="w-5 h-5" />
              </button>
            </div>
            <form onSubmit={handleFormSubmit} className="pt-4 space-y-4">
              {/* Quick Preset Selector */}
              {(presets.banks.length > 0 || presets.wallets.length > 0) && (
                <div>
                  <label className={labelCls}>Quick Institution Preset (Optional)</label>
                  <Select
                    options={[
                      {
                        label: "Pakistani Banks",
                        options: presets.banks.map(b => ({ value: b.code, label: `${b.name} — ${b.full_name}`, preset: b })),
                      },
                      {
                        label: "Mobile Wallets & Digital Accounts",
                        options: presets.wallets.map(w => ({ value: w.code, label: `${w.name} — ${w.full_name}`, preset: w })),
                      },
                    ]}
                    value={null}
                    onChange={opt => handleApplyPreset(opt?.preset)}
                    styles={selectStyles}
                    placeholder="Choose a bank or wallet preset to auto-fill…"
                    isClearable
                  />
                </div>
              )}
              <div>
                <label className={labelCls}>Account Name *</label>
                <input type="text" value={formName} onChange={e => setFormName(e.target.value)} placeholder="e.g. HBL Current Account" className={inputCls} required />
              </div>
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                <div>
                  <label className={labelCls}>Account Type *</label>
                  <Select
                    options={ACCOUNT_TYPE_OPTIONS}
                    value={ACCOUNT_TYPE_OPTIONS.find(o => o.value === formType)}
                    onChange={opt => setFormType(opt?.value || "bank")}
                    styles={selectStyles}
                    isSearchable={false}
                  />
                </div>
                {!editingAccount ? (
                  <div>
                    <label className={labelCls}>Opening Balance (Rs.)</label>
                    <input
                      type="number"
                      min="0"
                      step="0.01"
                      value={formOpeningBalance}
                      onChange={e => setFormOpeningBalance(e.target.value)}
                      placeholder="0.00"
                      className={inputCls}
                    />
                  </div>
                ) : (
                  <div className="flex items-end pb-1.5">
                    <label className="inline-flex items-center gap-2 cursor-pointer text-sm">
                      <input
                        type="checkbox"
                        checked={formIsActive}
                        onChange={e => setFormIsActive(e.target.checked)}
                        className="rounded border-slate-300 text-blue-600 focus:ring-blue-500"
                      />
                      <span className={isDark ? "text-slate-200" : "text-slate-700"}>Account Active</span>
                    </label>
                  </div>
                )}
              </div>
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                <div>
                  <label className={labelCls}>Bank / Institution Name</label>
                  <input type="text" value={formBankName} onChange={e => setFormBankName(e.target.value)} placeholder="e.g. Habib Bank Limited" className={inputCls} />
                </div>
                <div>
                  <label className={labelCls}>Account Number / IBAN</label>
                  <input type="text" value={formAccountNumber} onChange={e => setFormAccountNumber(e.target.value)} placeholder="IBAN or account number" className={inputCls} />
                </div>
              </div>
              <div>
                <label className={labelCls}>Notes (optional)</label>
                <textarea value={formNotes} onChange={e => setFormNotes(e.target.value)} rows={2} placeholder="Any notes…" className={inputCls} />
              </div>
              <div className="flex justify-end gap-3 pt-2">
                <button type="button" onClick={() => setModalMode(null)} className={`px-4 py-2 text-sm font-medium rounded-lg transition-colors ${isDark ? "bg-slate-700 hover:bg-slate-600 text-slate-300" : "bg-slate-100 hover:bg-slate-200 text-slate-600"}`}>
                  Cancel
                </button>
                <button type="submit" disabled={formSaving} className={`px-5 py-2 text-sm font-semibold rounded-lg disabled:opacity-60 ${btnPrimary.className}`} style={btnPrimary.style}>
                  {formSaving ? "Saving…" : editingAccount ? "Update Account" : "Create Account"}
                </button>
              </div>
            </form>
          </GlassCard>
        </div>
      )}

      {/* Transfer Modal */}
      {modalMode === "transfer" && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/60 backdrop-blur-sm" onClick={e => { if (e.target === e.currentTarget) setModalMode(null); }}>
          <GlassCard className="w-full max-w-md max-h-[90dvh] overflow-y-auto p-4 sm:p-6 shadow-2xl">
            <div className={`flex items-center justify-between pb-4 border-b ${isDark ? "border-slate-700" : "border-slate-200"}`}>
              <div className="flex items-center gap-2">
                <ArrowsRightLeftIcon className="w-5 h-5 text-blue-500" />
                <h3 className={`font-bold text-base ${isDark ? "text-slate-100" : "text-slate-800"}`}>Transfer Funds</h3>
              </div>
              <button onClick={() => setModalMode(null)} className={`p-1.5 rounded-lg transition-colors ${isDark ? "hover:bg-slate-700 text-slate-400" : "hover:bg-slate-100 text-slate-500"}`}>
                <XMarkIcon className="w-5 h-5" />
              </button>
            </div>
            <form onSubmit={handleTransfer} className="pt-4 space-y-4">
              <div>
                <label className={labelCls}>From Account *</label>
                <Select options={accountOptions} value={transferFrom} onChange={setTransferFrom} styles={selectStyles} placeholder="Select source…" isClearable />
              </div>
              <div>
                <label className={labelCls}>To Account *</label>
                <Select options={accountOptions.filter(o => o.value !== transferFrom?.value)} value={transferTo} onChange={setTransferTo} styles={selectStyles} placeholder="Select destination…" isClearable />
              </div>
              <div>
                <label className={labelCls}>Amount *</label>
                <input type="number" min="0.01" step="0.01" value={transferAmount} onChange={e => setTransferAmount(e.target.value)} placeholder="0.00" className={inputCls} required />
              </div>
              <div>
                <label className={labelCls}>Notes (optional)</label>
                <input type="text" value={transferNotes} onChange={e => setTransferNotes(e.target.value)} placeholder="Transfer reason…" className={inputCls} />
              </div>
              <div className="flex justify-end gap-3 pt-2">
                <button type="button" onClick={() => setModalMode(null)} className={`px-4 py-2 text-sm font-medium rounded-lg transition-colors ${isDark ? "bg-slate-700 hover:bg-slate-600 text-slate-300" : "bg-slate-100 hover:bg-slate-200 text-slate-600"}`}>
                  Cancel
                </button>
                <button type="submit" disabled={transferSaving} className={`px-5 py-2 text-sm font-semibold rounded-lg disabled:opacity-60 ${btnPrimary.className}`} style={btnPrimary.style}>
                  {transferSaving ? "Transferring…" : "Transfer"}
                </button>
              </div>
            </form>
          </GlassCard>
        </div>
      )}

      {/* Adjust Modal */}
      {modalMode === "adjust" && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/60 backdrop-blur-sm" onClick={e => { if (e.target === e.currentTarget) setModalMode(null); }}>
          <GlassCard className="w-full max-w-md max-h-[90dvh] overflow-y-auto p-4 sm:p-6 shadow-2xl">
            <div className={`flex items-center justify-between pb-4 border-b ${isDark ? "border-slate-700" : "border-slate-200"}`}>
              <div className="flex items-center gap-2">
                <ArrowUpRightIcon className="w-5 h-5 text-blue-500" />
                <h3 className={`font-bold text-base ${isDark ? "text-slate-100" : "text-slate-800"}`}>Manual Adjustment</h3>
              </div>
              <button onClick={() => setModalMode(null)} className={`p-1.5 rounded-lg transition-colors ${isDark ? "hover:bg-slate-700 text-slate-400" : "hover:bg-slate-100 text-slate-500"}`}>
                <XMarkIcon className="w-5 h-5" />
              </button>
            </div>
            <form onSubmit={handleAdjust} className="pt-4 space-y-4">
              <div>
                <label className={labelCls}>Account *</label>
                <Select options={accountOptions} value={adjustAccount} onChange={setAdjustAccount} styles={selectStyles} placeholder="Select account…" isClearable />
              </div>
              <div>
                <label className={labelCls}>Adjustment Type *</label>
                <div className="flex flex-wrap gap-3">
                  {[
                    { value: "deposit", label: "Deposit (Add)" },
                    { value: "withdrawal", label: "Withdrawal (Deduct)" },
                  ].map(opt => (
                    <label key={opt.value} className={`flex-1 flex items-center gap-2 px-3 py-2 rounded-lg border cursor-pointer text-sm transition-colors ${
                      adjustType === opt.value
                        ? "border-blue-500 bg-blue-50 text-blue-700 dark:bg-blue-900/30 dark:text-blue-300 dark:border-blue-600"
                        : isDark ? "border-slate-600 text-slate-300 hover:bg-slate-700" : "border-slate-300 text-slate-600 hover:bg-slate-50"
                    }`}>
                      <input type="radio" name="adjustType" value={opt.value} checked={adjustType === opt.value} onChange={() => setAdjustType(opt.value)} className="sr-only" />
                      {opt.value === "deposit" ? <ArrowDownLeftIcon className="w-4 h-4 text-emerald-500" /> : <ArrowUpRightIcon className="w-4 h-4 text-red-500" />}
                      {opt.label}
                    </label>
                  ))}
                </div>
              </div>
              <div>
                <label className={labelCls}>Amount *</label>
                <input type="number" min="0.01" step="0.01" value={adjustAmount} onChange={e => setAdjustAmount(e.target.value)} placeholder="0.00" className={inputCls} required />
              </div>
              <div>
                <label className={labelCls}>Reason *</label>
                <input type="text" value={adjustReason} onChange={e => setAdjustReason(e.target.value)} placeholder="e.g. Opening balance correction" className={inputCls} required />
              </div>
              <div className="flex justify-end gap-3 pt-2">
                <button type="button" onClick={() => setModalMode(null)} className={`px-4 py-2 text-sm font-medium rounded-lg transition-colors ${isDark ? "bg-slate-700 hover:bg-slate-600 text-slate-300" : "bg-slate-100 hover:bg-slate-200 text-slate-600"}`}>
                  Cancel
                </button>
                <button type="submit" disabled={adjustSaving} className={`px-5 py-2 text-sm font-semibold rounded-lg disabled:opacity-60 ${btnPrimary.className}`} style={btnPrimary.style}>
                  {adjustSaving ? "Saving…" : "Save Adjustment"}
                </button>
              </div>
            </form>
          </GlassCard>
        </div>
      )}
    </div>
  );
}

