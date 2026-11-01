import React, { useState, useEffect, useMemo, useCallback, useRef } from "react";
import axios from "axios";
import Select from "react-select";
import {
  XMarkIcon,
  BanknotesIcon,
  BuildingLibraryIcon,
  CreditCardIcon,
  DevicePhoneMobileIcon,
  ArrowsRightLeftIcon,
  ArrowDownLeftIcon,
  ArrowUpRightIcon,
  PlusCircleIcon,
  DocumentTextIcon,
  ArrowPathIcon,
  CheckCircleIcon,
  ExclamationTriangleIcon,
  MagnifyingGlassIcon,
  SparklesIcon,
} from "@heroicons/react/24/solid";
import { useCurrency } from "@/context/CurrencyContext.jsx";
import { useTheme } from "@/context/ThemeContext.jsx";
import AccountIcon from "./AccountIcon.jsx";

const DEFAULT_PAKISTAN_PRESETS = [
  // Major Banks
  { group: "Pakistani Banks", code: "meezan", name: "Meezan Bank", bank_name: "Meezan Bank Limited (Islamic)", type: "bank", icon: "meezan", color: "#005b41" },
  { group: "Pakistani Banks", code: "hbl", name: "HBL (Habib Bank)", bank_name: "Habib Bank Limited", type: "bank", icon: "hbl", color: "#00835f" },
  { group: "Pakistani Banks", code: "ubl", name: "UBL (United Bank)", bank_name: "United Bank Limited", type: "bank", icon: "ubl", color: "#00539f" },
  { group: "Pakistani Banks", code: "mcb", name: "MCB Bank", bank_name: "Muslim Commercial Bank Limited", type: "bank", icon: "mcb", color: "#eb6909" },
  { group: "Pakistani Banks", code: "alfalah", name: "Bank Alfalah", bank_name: "Bank Alfalah Limited", type: "bank", icon: "alfalah", color: "#dc2626" },
  { group: "Pakistani Banks", code: "abl", name: "Allied Bank (ABL)", bank_name: "Allied Bank Limited", type: "bank", icon: "abl", color: "#004b87" },
  { group: "Pakistani Banks", code: "faysal", name: "Faysal Bank", bank_name: "Faysal Bank Limited (Islamic)", type: "bank", icon: "faysal", color: "#1a365d" },
  { group: "Pakistani Banks", code: "bop", name: "Bank of Punjab (BOP)", bank_name: "The Bank of Punjab", type: "bank", icon: "bop", color: "#b91c1c" },
  { group: "Pakistani Banks", code: "askari", name: "Askari Bank", bank_name: "Askari Bank Limited", type: "bank", icon: "askari", color: "#065f46" },
  { group: "Pakistani Banks", code: "scb", name: "Standard Chartered", bank_name: "Standard Chartered Bank (Pakistan)", type: "bank", icon: "scb", color: "#0284c7" },
  { group: "Pakistani Banks", code: "nbp", name: "National Bank (NBP)", bank_name: "National Bank of Pakistan", type: "bank", icon: "nbp", color: "#047857" },
  { group: "Pakistani Banks", code: "habibmetro", name: "Habib Metro", bank_name: "Habib Metropolitan Bank", type: "bank", icon: "habibmetro", color: "#1e40af" },
  { group: "Pakistani Banks", code: "soneri", name: "Soneri Bank", bank_name: "Soneri Bank Limited", type: "bank", icon: "soneri", color: "#ca8a04" },
  { group: "Pakistani Banks", code: "bankislami", name: "BankIslami", bank_name: "BankIslami Pakistan Limited", type: "bank", icon: "bankislami", color: "#0d9488" },
  { group: "Pakistani Banks", code: "dib", name: "Dubai Islamic Bank (DIB)", bank_name: "Dubai Islamic Bank Pakistan", type: "bank", icon: "dib", color: "#854d0e" },
  { group: "Pakistani Banks", code: "albaraka", name: "Al Baraka Bank", bank_name: "Al Baraka Bank (Pakistan)", type: "bank", icon: "albaraka", color: "#0284c7" },
  { group: "Pakistani Banks", code: "js", name: "JS Bank", bank_name: "JS Bank Limited", type: "bank", icon: "js", color: "#0369a1" },
  { group: "Pakistani Banks", code: "bok", name: "Bank of Khyber (BOK)", bank_name: "The Bank of Khyber", type: "bank", icon: "bok", color: "#059669" },
  { group: "Pakistani Banks", code: "sindh", name: "Sindh Bank", bank_name: "Sindh Bank Limited", type: "bank", icon: "sindh", color: "#4338ca" },
  { group: "Pakistani Banks", code: "ztbl", name: "ZTBL", bank_name: "Zarai Taraqiati Bank Limited", type: "bank", icon: "ztbl", color: "#15803d" },

  // Mobile Wallets & Fintechs
  { group: "Pakistani Mobile Wallets", code: "jazzcash", name: "JazzCash", bank_name: "JazzCash (Mobilink Microfinance Bank)", type: "mobile_wallet", icon: "jazzcash", color: "#dc2626" },
  { group: "Pakistani Mobile Wallets", code: "easypaisa", name: "Easypaisa", bank_name: "Easypaisa (Telenor Microfinance Bank)", type: "mobile_wallet", icon: "easypaisa", color: "#16a34a" },
  { group: "Pakistani Mobile Wallets", code: "sadapay", name: "SadaPay", bank_name: "SadaPay Digital Account", type: "mobile_wallet", icon: "sadapay", color: "#0d9488" },
  { group: "Pakistani Mobile Wallets", code: "nayapay", name: "NayaPay", bank_name: "NayaPay Arc / Digital Wallet", type: "mobile_wallet", icon: "nayapay", color: "#ea580c" },
  { group: "Pakistani Mobile Wallets", code: "upaisa", name: "UPaisa", bank_name: "UPaisa (U Microfinance Bank)", type: "mobile_wallet", icon: "upaisa", color: "#f97316" },
  { group: "Pakistani Mobile Wallets", code: "zindigi", name: "Zindigi", bank_name: "Zindigi by JS Bank", type: "mobile_wallet", icon: "zindigi", color: "#7c3aed" },
  { group: "Pakistani Mobile Wallets", code: "raast", name: "Raast P2M", bank_name: "State Bank of Pakistan Raast", type: "mobile_wallet", icon: "raast", color: "#059669" },

  // Cards & Cash
  { group: "Cash & Terminals", code: "cash_drawer", name: "Cash in Hand (Drawer)", bank_name: "Physical Cash Counter", type: "cash", icon: "drawer", color: "#10b981" },
  { group: "Cash & Terminals", code: "card_pos", name: "Card / POS Terminal", bank_name: "POS Merchant Swipe Terminal", type: "card", icon: "card", color: "#8b5cf6" },
];

export default function AccountsModal({ isOpen, onClose, onAccountUpdated, onOpenCashDrawer }) {
  const { formatCurrency } = useCurrency();
  const { isDark, theme } = useTheme();

  const [activeTab, setActiveTab] = useState("overview"); // 'overview' | 'transfer' | 'statement' | 'adjust' | 'create'
  const [loading, setLoading] = useState(false);
  const [submitting, setSubmitting] = useState(false);

  // Accounts list and summary
  const [accounts, setAccounts] = useState([]);
  const [summary, setSummary] = useState({ total_balance: 0, by_type: {}, count: 0 });

  // Selected account for statement view
  const [selectedAccountId, setSelectedAccountId] = useState(null);
  const [transactions, setTransactions] = useState([]);
  const [loadingTransactions, setLoadingTransactions] = useState(false);
  const [txnSearch, setTxnSearch] = useState("");

  // Transfer form
  const [transferFrom, setTransferFrom] = useState(null);
  const [transferTo, setTransferTo] = useState(null);
  const [transferAmount, setTransferAmount] = useState("");
  const [transferNotes, setTransferNotes] = useState("");

  // Adjustment form
  const [adjustAccount, setAdjustAccount] = useState(null);
  const [adjustType, setAdjustType] = useState("deposit"); // 'deposit' | 'withdrawal'
  const [adjustAmount, setAdjustAmount] = useState("");
  const [adjustReason, setAdjustReason] = useState("");
  const [adjustReference, setAdjustReference] = useState("");

  // Create account form
  const [selectedPreset, setSelectedPreset] = useState(null);
  const [newAccName, setNewAccName] = useState("");
  const [newAccType, setNewAccType] = useState("bank");
  const [newAccCode, setNewAccCode] = useState("");
  const [newAccIcon, setNewAccIcon] = useState("");
  const [newAccColor, setNewAccColor] = useState("");
  const [newAccBankName, setNewAccBankName] = useState("");
  const [newAccNumber, setNewAccNumber] = useState("");
  const [newAccOpening, setNewAccOpening] = useState("0");
  const [newAccNotes, setNewAccNotes] = useState("");
  const [newAccIsDefault, setNewAccIsDefault] = useState(false);

  const [errorMsg, setErrorMsg] = useState("");
  const [successMsg, setSuccessMsg] = useState("");
  const mouseDownRef = useRef(null);

  // Close on Escape key
  useEffect(() => {
    if (!isOpen) return;
    const onKey = (e) => {
      if (e.key === "Escape") {
        e.preventDefault();
        onClose && onClose();
      }
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [isOpen, onClose]);

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

  const fetchAccounts = useCallback(async () => {
    setLoading(true);
    setErrorMsg("");
    try {
      const res = await axios.get("/api/accounts");
      const accList = res.data?.accounts || [];
      setAccounts(accList);
      setSummary({
        total_balance: Number(res.data?.total_balance || 0),
        by_type: res.data?.by_type || {},
        count: accList.length,
      });

      if (!selectedAccountId && accList.length > 0) {
        setSelectedAccountId(accList[0].id);
      }
      if (!transferFrom && accList.length > 0) {
        setTransferFrom(accList[0]);
      }
      if (!transferTo && accList.length > 1) {
        setTransferTo(accList[1]);
      }
      if (!adjustAccount && accList.length > 0) {
        setAdjustAccount(accList[0]);
      }
    } catch (err) {
      setErrorMsg(err.response?.data?.message || "Failed to load financial accounts.");
    } finally {
      setLoading(false);
    }
  }, [selectedAccountId, transferFrom, transferTo, adjustAccount]);

  useEffect(() => {
    if (isOpen) {
      fetchAccounts();
    }
  }, [isOpen, fetchAccounts]);

  const fetchTransactions = useCallback(async (accId) => {
    if (!accId) return;
    setLoadingTransactions(true);
    try {
      const res = await axios.get(`/api/accounts/${accId}/transactions`, {
        params: { per_page: 50 },
      });
      setTransactions(res.data?.data || []);
    } catch {
      setTransactions([]);
    } finally {
      setLoadingTransactions(false);
    }
  }, []);

  useEffect(() => {
    if (selectedAccountId && (activeTab === "statement" || activeTab === "overview")) {
      fetchTransactions(selectedAccountId);
    }
  }, [selectedAccountId, activeTab, fetchTransactions]);

  const notifyChange = () => {
    window.dispatchEvent(new CustomEvent("accounts-changed"));
    window.dispatchEvent(new CustomEvent("cash-drawer-changed"));
    if (onAccountUpdated) onAccountUpdated();
  };

  // Seed popular default accounts
  const handleSeedDefaults = async () => {
    setSubmitting(true);
    setErrorMsg("");
    setSuccessMsg("");
    try {
      const res = await axios.post("/api/accounts/seed-defaults");
      setSuccessMsg(res.data?.message || "Standard Pakistani accounts loaded!");
      await fetchAccounts();
      notifyChange();
    } catch (err) {
      setErrorMsg(err.response?.data?.message || "Failed to load standard accounts.");
    } finally {
      setSubmitting(false);
    }
  };

  // Preset selected handler
  const handleSelectPreset = (preset) => {
    setSelectedPreset(preset);
    if (!preset) return;
    setNewAccName(preset.name);
    setNewAccType(preset.type);
    setNewAccBankName(preset.bank_name || preset.name);
    setNewAccCode(preset.code);
    setNewAccIcon(preset.icon);
    setNewAccColor(preset.color);
  };

  // Handle Transfer
  const handleTransfer = async (e) => {
    e.preventDefault();
    setErrorMsg("");
    setSuccessMsg("");

    if (!transferFrom || !transferTo) {
      setErrorMsg("Please select both source and destination accounts.");
      return;
    }
    if (transferFrom.id === transferTo.id) {
      setErrorMsg("Source and destination accounts must be different.");
      return;
    }
    const amt = parseFloat(transferAmount);
    if (isNaN(amt) || amt <= 0) {
      setErrorMsg("Please enter a valid transfer amount greater than 0.");
      return;
    }
    if (amt > Number(transferFrom.current_balance)) {
      setErrorMsg(`Insufficient funds in ${transferFrom.name}. Current balance: ${formatCurrency(transferFrom.current_balance)}`);
      return;
    }

    setSubmitting(true);
    try {
      const res = await axios.post("/api/accounts/transfer", {
        from_account_id: transferFrom.id,
        to_account_id: transferTo.id,
        amount: amt,
        notes: transferNotes.trim() || null,
      });

      setSuccessMsg(res.data?.message || "Transfer completed successfully!");
      setTransferAmount("");
      setTransferNotes("");
      await fetchAccounts();
      notifyChange();
      setTimeout(() => setActiveTab("overview"), 1200);
    } catch (err) {
      setErrorMsg(err.response?.data?.message || "Transfer failed. Please try again.");
    } finally {
      setSubmitting(false);
    }
  };

  // Handle Adjustment
  const handleAdjust = async (e) => {
    e.preventDefault();
    setErrorMsg("");
    setSuccessMsg("");

    if (!adjustAccount) {
      setErrorMsg("Please select an account to adjust.");
      return;
    }
    const amt = parseFloat(adjustAmount);
    if (isNaN(amt) || amt <= 0) {
      setErrorMsg("Please enter a valid amount greater than 0.");
      return;
    }
    if (adjustType === "withdrawal" && amt > Number(adjustAccount.current_balance)) {
      setErrorMsg(`Insufficient funds. Account balance is ${formatCurrency(adjustAccount.current_balance)}.`);
      return;
    }

    setSubmitting(true);
    try {
      const res = await axios.post(`/api/accounts/${adjustAccount.id}/adjust`, {
        type: adjustType,
        amount: amt,
        reason: adjustReason.trim() || (adjustType === "deposit" ? "Direct Deposit" : "Manual Withdrawal / Expense"),
        reference: adjustReference.trim() || null,
      });

      setSuccessMsg(res.data?.message || "Adjustment recorded successfully!");
      setAdjustAmount("");
      setAdjustReason("");
      setAdjustReference("");
      await fetchAccounts();
      notifyChange();
      setTimeout(() => setActiveTab("overview"), 1200);
    } catch (err) {
      setErrorMsg(err.response?.data?.message || "Adjustment failed.");
    } finally {
      setSubmitting(false);
    }
  };

  // Handle Create Account
  const handleCreateAccount = async (e) => {
    e.preventDefault();
    setErrorMsg("");
    setSuccessMsg("");

    if (!newAccName.trim()) {
      setErrorMsg("Account name is required.");
      return;
    }

    setSubmitting(true);
    try {
      const res = await axios.post("/api/accounts", {
        name: newAccName.trim(),
        type: newAccType,
        code: newAccCode.trim() || null,
        icon: newAccIcon.trim() || null,
        color: newAccColor.trim() || null,
        bank_name: newAccBankName.trim() || null,
        account_number: newAccNumber.trim() || null,
        opening_balance: parseFloat(newAccOpening) || 0,
        is_default: newAccIsDefault,
        notes: newAccNotes.trim() || null,
      });

      setSuccessMsg(`Account "${res.data?.account?.name}" created successfully!`);
      setSelectedPreset(null);
      setNewAccName("");
      setNewAccBankName("");
      setNewAccNumber("");
      setNewAccCode("");
      setNewAccIcon("");
      setNewAccColor("");
      setNewAccOpening("0");
      setNewAccNotes("");
      setNewAccIsDefault(false);
      await fetchAccounts();
      notifyChange();
      setTimeout(() => setActiveTab("overview"), 1200);
    } catch (err) {
      setErrorMsg(err.response?.data?.message || "Failed to create account.");
    } finally {
      setSubmitting(false);
    }
  };

  if (!isOpen) return null;

  const filteredTxns = transactions.filter((t) => {
    if (!txnSearch.trim()) return true;
    const q = txnSearch.toLowerCase();
    return (
      (t.description || "").toLowerCase().includes(q) ||
      (t.reference_type || "").toLowerCase().includes(q) ||
      (t.type || "").toLowerCase().includes(q)
    );
  });

  const accountOptions = accounts.map((acc) => ({
    value: acc.id,
    label: `${acc.name} (${formatCurrency(acc.current_balance)})`,
    data: acc,
  }));

  const presetOptions = [
    {
      label: "🇵🇰 Pakistani Banks",
      options: DEFAULT_PAKISTAN_PRESETS.filter((p) => p.group === "Pakistani Banks").map((p) => ({
        value: p.code,
        label: p.name,
        data: p,
      })),
    },
    {
      label: "📱 Pakistani Mobile Wallets",
      options: DEFAULT_PAKISTAN_PRESETS.filter((p) => p.group === "Pakistani Mobile Wallets").map((p) => ({
        value: p.code,
        label: p.name,
        data: p,
      })),
    },
    {
      label: "💳 Cash & Card Terminals",
      options: DEFAULT_PAKISTAN_PRESETS.filter((p) => p.group === "Cash & Terminals").map((p) => ({
        value: p.code,
        label: p.name,
        data: p,
      })),
    },
  ];

  return (
    <div
      onMouseDown={(e) => {
        mouseDownRef.current = e.target;
      }}
      onClick={(e) => {
        if (e.target === e.currentTarget && mouseDownRef.current === e.currentTarget && !submitting) {
          onClose && onClose();
        }
      }}
      className="fixed inset-0 z-50 flex items-center justify-center p-3 sm:p-4 bg-black/60 backdrop-blur-xs animate-in fade-in duration-200 cursor-default"
      role="dialog"
      aria-modal="true"
    >
      <div
        onClick={(e) => e.stopPropagation()}
        className={`w-full max-w-4xl max-h-[92dvh] flex flex-col rounded-2xl shadow-2xl border transition-all duration-200 overflow-hidden ${
          isDark
            ? "bg-slate-900/95 border-slate-700/80 text-slate-100"
            : "bg-white/95 border-slate-200 text-slate-900"
        }`}
      >
        {/* Header */}
        <div
          className={`flex items-center justify-between px-4 sm:px-6 py-3.5 sm:py-4 border-b shrink-0 ${
            isDark ? "border-slate-800 bg-slate-900" : "border-slate-100 bg-slate-50/50"
          }`}
        >
          <div className="flex items-center gap-3">
            <div
              className="p-2.5 rounded-xl text-white shadow-md"
              style={{
                backgroundColor: theme?.primary_color || "#3b82f6",
              }}
            >
              <BuildingLibraryIcon className="w-5 h-5" />
            </div>
            <div>
              <div className="flex items-center gap-2">
                <h2 className="text-lg font-bold">Financial Accounts Register</h2>
                <span className="text-xs px-2 py-0.5 rounded-full font-medium bg-blue-500/10 text-blue-500 border border-blue-500/20">
                  {accounts.length} Active Accounts
                </span>
              </div>
              <p className={`text-xs ${isDark ? "text-slate-400" : "text-slate-500"}`}>
                Real-time balances across Cash Drawer, Bank Accounts, and Wallets
              </p>
            </div>
          </div>

          <button
            onClick={onClose}
            className={`p-2 rounded-xl text-slate-400 hover:text-slate-600 dark:hover:text-slate-200 hover:bg-slate-100 dark:hover:bg-slate-800 transition-colors`}
          >
            <XMarkIcon className="w-5 h-5" />
          </button>
        </div>

        {/* Global Total Balance Bar */}
        <div
          className={`px-6 py-3.5 border-b flex flex-wrap items-center justify-between gap-4 ${
            isDark ? "border-slate-800 bg-slate-800/40" : "border-slate-100 bg-blue-50/30"
          }`}
        >
          <div>
            <div className={`text-[11px] font-semibold uppercase tracking-wider ${isDark ? "text-slate-400" : "text-slate-500"}`}>
              Total Liquid Funds Available
            </div>
            <div
              className="text-2xl font-black tracking-tight"
              style={{ color: theme?.primary_color || "#3b82f6" }}
            >
              {formatCurrency(summary.total_balance)}
            </div>
          </div>

          <div className="flex items-center gap-2 flex-wrap">
            <button
              onClick={() => {
                onClose();
                if (onOpenCashDrawer) onOpenCashDrawer();
              }}
              className="inline-flex items-center gap-1.5 px-3 py-1.5 text-xs font-semibold rounded-lg bg-emerald-500/10 text-emerald-600 dark:text-emerald-400 border border-emerald-500/20 hover:bg-emerald-500/20 transition-colors"
              title="Open Cash Drawer Shift Register"
            >
              <BanknotesIcon className="w-3.5 h-3.5" />
              Cash Drawer Register
            </button>
            <button
              onClick={fetchAccounts}
              disabled={loading}
              className={`p-1.5 rounded-lg border transition-colors ${
                isDark ? "border-slate-700 hover:bg-slate-800 text-slate-300" : "border-slate-200 hover:bg-slate-100 text-slate-600"
              }`}
              title="Refresh Balances"
            >
              <ArrowPathIcon className={`w-4 h-4 ${loading ? "animate-spin" : ""}`} />
            </button>
          </div>
        </div>

        {/* Navigation Tabs */}
        <div
          className={`flex items-center gap-1 px-6 border-b shrink-0 overflow-x-auto ${
            isDark ? "border-slate-800 bg-slate-900" : "border-slate-100 bg-white"
          }`}
        >
          {[
            { id: "overview", label: "Accounts & Balances", icon: BuildingLibraryIcon },
            { id: "transfer", label: "Transfer Funds", icon: ArrowsRightLeftIcon },
            { id: "statement", label: "Account Statement", icon: DocumentTextIcon },
            { id: "adjust", label: "Deposit / Expense", icon: ArrowDownLeftIcon },
            { id: "create", label: "+ Add Account", icon: PlusCircleIcon },
          ].map((tab) => {
            const Icon = tab.icon;
            const isActive = activeTab === tab.id;
            return (
              <button
                key={tab.id}
                onClick={() => {
                  setActiveTab(tab.id);
                  setErrorMsg("");
                  setSuccessMsg("");
                }}
                className={`flex items-center gap-2 px-3.5 py-3 text-xs font-bold border-b-2 transition-all whitespace-nowrap ${
                  isActive
                    ? "border-blue-500 text-blue-600 dark:text-blue-400"
                    : "border-transparent text-slate-500 hover:text-slate-800 dark:hover:text-slate-300"
                }`}
                style={isActive ? { borderColor: theme?.primary_color || "#3b82f6", color: theme?.primary_color || "#3b82f6" } : {}}
              >
                <Icon className="w-4 h-4" />
                {tab.label}
              </button>
            );
          })}
        </div>

        {/* Notifications */}
        {(errorMsg || successMsg) && (
          <div className="px-6 pt-3 shrink-0">
            {errorMsg && (
              <div className="flex items-center gap-2 px-4 py-2.5 rounded-xl bg-red-500/10 border border-red-500/20 text-red-600 dark:text-red-400 text-xs font-medium">
                <ExclamationTriangleIcon className="w-4 h-4 shrink-0" />
                <span>{errorMsg}</span>
              </div>
            )}
            {successMsg && (
              <div className="flex items-center gap-2 px-4 py-2.5 rounded-xl bg-emerald-500/10 border border-emerald-500/20 text-emerald-600 dark:text-emerald-400 text-xs font-medium">
                <CheckCircleIcon className="w-4 h-4 shrink-0" />
                <span>{successMsg}</span>
              </div>
            )}
          </div>
        )}

        {/* Tab Body */}
        <div className="flex-1 overflow-y-auto p-4 sm:p-6 space-y-4">
          {/* OVERVIEW TAB */}
          {activeTab === "overview" && (
            <div className="space-y-4">
              <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-3.5">
                {accounts.map((acc) => {
                  const isPositive = Number(acc.current_balance) >= 0;
                  const isCash = acc.type === "cash";

                  return (
                    <div
                      key={acc.id}
                      className={`relative rounded-xl p-4 border transition-all duration-150 hover:shadow-md flex flex-col justify-between ${
                        isDark ? "bg-slate-800/50 border-slate-700/60" : "bg-white border-slate-200"
                      }`}
                    >
                      <div>
                        <div className="flex items-start justify-between gap-3 mb-2.5">
                          <div className="flex items-center gap-2.5">
                            <div className="w-9 h-9 shrink-0 flex items-center justify-center">
                              <AccountIcon
                                icon={acc.icon}
                                code={acc.code || acc.name}
                                type={acc.type}
                                className="w-9 h-9 rounded-lg"
                              />
                            </div>
                            <div>
                              <div className="font-bold text-sm leading-tight flex items-center gap-1.5">
                                {acc.name}
                                {acc.is_default && (
                                  <span className="text-[10px] px-1.5 py-0.2 rounded font-semibold bg-blue-500/10 text-blue-500">
                                    Default
                                  </span>
                                )}
                              </div>
                              <div className={`text-[11px] font-medium ${isDark ? "text-slate-400" : "text-slate-500"}`}>
                                {acc.bank_name || (acc.type === "cash" ? "Physical Cash" : acc.type.replace(/_/g, " "))}
                              </div>
                            </div>
                          </div>
                        </div>

                        {/* Account specifics */}
                        {acc.account_number && (
                          <div className={`text-xs mb-3 px-2.5 py-1.5 rounded-lg font-mono ${isDark ? "bg-slate-900/60 text-slate-300" : "bg-slate-50 text-slate-700"}`}>
                            A/C: {acc.account_number}
                          </div>
                        )}

                        {/* If cash in hand, show drawer status */}
                        {isCash && (
                          <div className="mb-2 flex items-center gap-1.5 text-[11px] text-emerald-600 dark:text-emerald-400 font-medium">
                            <span className="w-1.5 h-1.5 rounded-full bg-emerald-500 animate-pulse" />
                            <span>Auto-synced with Cash Drawer Shift</span>
                          </div>
                        )}
                      </div>

                      {/* Current Balance */}
                      <div className="pt-2 border-t border-dashed border-slate-200 dark:border-slate-700/60 flex items-end justify-between">
                        <div>
                          <span className={`text-[10px] font-semibold uppercase tracking-wider ${isDark ? "text-slate-400" : "text-slate-500"}`}>
                            Live Balance
                          </span>
                          <div className={`text-lg font-black ${isPositive ? (isDark ? "text-emerald-400" : "text-emerald-600") : "text-red-500"}`}>
                            {formatCurrency(acc.current_balance)}
                          </div>
                        </div>

                        {/* Quick Statement button */}
                        <button
                          onClick={() => {
                            setSelectedAccountId(acc.id);
                            setActiveTab("statement");
                          }}
                          className={`text-xs font-semibold px-2.5 py-1 rounded-lg border transition-colors ${
                            isDark
                              ? "border-slate-700 text-slate-300 hover:bg-slate-700"
                              : "border-slate-200 text-slate-600 hover:bg-slate-100"
                          }`}
                        >
                          Statement
                        </button>
                      </div>
                    </div>
                  );
                })}
              </div>

              {/* Quick Actions Footer */}
              <div
                className={`p-4 rounded-xl border flex flex-wrap items-center justify-between gap-3 ${
                  isDark ? "bg-slate-800/30 border-slate-800" : "bg-slate-50 border-slate-200"
                }`}
              >
                <div className="flex items-center gap-2">
                  <SparklesIcon className="w-4 h-4 text-amber-500 shrink-0" />
                  <span className={`text-xs ${isDark ? "text-slate-400" : "text-slate-600"}`}>
                    Need standard Pakistani bank accounts and digital wallets?
                  </span>
                  <button
                    onClick={handleSeedDefaults}
                    disabled={submitting}
                    className="text-xs font-bold text-blue-500 hover:underline inline-flex items-center gap-1"
                  >
                    Load Standard PK Accounts (Meezan, HBL, JazzCash, Easypaisa)
                  </button>
                </div>
                <div className="flex items-center gap-2">
                  <button
                    onClick={() => setActiveTab("transfer")}
                    className="px-3 py-1.5 text-xs font-bold rounded-lg bg-blue-500 text-white hover:bg-blue-600 transition-colors shadow-xs"
                  >
                    Transfer Funds
                  </button>
                  <button
                    onClick={() => setActiveTab("create")}
                    className="px-3 py-1.5 text-xs font-bold rounded-lg bg-emerald-600 text-white hover:bg-emerald-700 transition-colors shadow-xs"
                  >
                    + Add New Account
                  </button>
                </div>
              </div>
            </div>
          )}

          {/* TRANSFER FUNDS TAB */}
          {activeTab === "transfer" && (
            <form onSubmit={handleTransfer} className="max-w-xl mx-auto space-y-4">
              <div className={`p-4 rounded-xl border ${isDark ? "bg-slate-800/40 border-slate-700" : "bg-blue-50/50 border-blue-100"}`}>
                <h3 className="font-bold text-sm mb-1">Transfer Money Between Accounts</h3>
                <p className={`text-xs ${isDark ? "text-slate-400" : "text-slate-600"}`}>
                  Moving money between Cash Drawer and Bank accounts or between banks automatically records dual ledger entries.
                </p>
              </div>

              <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                <div>
                  <label className={`block text-xs font-bold mb-1.5 ${isDark ? "text-slate-300" : "text-slate-700"}`}>
                    From Account (Source)
                  </label>
                  <Select
                    options={accountOptions}
                    value={accountOptions.find((o) => o.value === transferFrom?.id) || null}
                    onChange={(opt) => setTransferFrom(opt?.data || null)}
                    styles={selectStyles}
                    isSearchable={false}
                  />
                  {transferFrom && (
                    <div className="mt-1 text-xs text-slate-500 dark:text-slate-400">
                      Available: <span className="font-bold text-emerald-600 dark:text-emerald-400">{formatCurrency(transferFrom.current_balance)}</span>
                    </div>
                  )}
                </div>

                <div>
                  <label className={`block text-xs font-bold mb-1.5 ${isDark ? "text-slate-300" : "text-slate-700"}`}>
                    To Account (Destination)
                  </label>
                  <Select
                    options={accountOptions.filter((o) => o.value !== transferFrom?.id)}
                    value={accountOptions.find((o) => o.value === transferTo?.id) || null}
                    onChange={(opt) => setTransferTo(opt?.data || null)}
                    styles={selectStyles}
                    isSearchable={false}
                  />
                  {transferTo && (
                    <div className="mt-1 text-xs text-slate-500 dark:text-slate-400">
                      Current: <span className="font-bold">{formatCurrency(transferTo.current_balance)}</span>
                    </div>
                  )}
                </div>
              </div>

              <div>
                <label className={`block text-xs font-bold mb-1.5 ${isDark ? "text-slate-300" : "text-slate-700"}`}>
                  Transfer Amount
                </label>
                <div className="relative">
                  <input
                    type="number"
                    step="0.01"
                    min="0.01"
                    required
                    placeholder="0.00"
                    value={transferAmount}
                    onChange={(e) => setTransferAmount(e.target.value)}
                    className={`w-full h-10 px-3 rounded-xl border text-sm font-bold ${
                      isDark ? "bg-slate-800 border-slate-700 text-white" : "bg-white border-slate-300 text-slate-900"
                    }`}
                  />
                </div>
              </div>

              <div>
                <label className={`block text-xs font-bold mb-1.5 ${isDark ? "text-slate-300" : "text-slate-700"}`}>
                  Description / Reference Notes
                </label>
                <input
                  type="text"
                  placeholder="e.g. Daily cash deposit to Meezan Bank, ATM deposit, etc."
                  value={transferNotes}
                  onChange={(e) => setTransferNotes(e.target.value)}
                  className={`w-full h-10 px-3 rounded-xl border text-xs ${
                    isDark ? "bg-slate-800 border-slate-700 text-white" : "bg-white border-slate-300 text-slate-900"
                  }`}
                />
              </div>

              <div className="pt-2 flex items-center justify-end gap-2">
                <button
                  type="button"
                  onClick={() => setActiveTab("overview")}
                  className={`px-4 py-2 text-xs font-bold rounded-xl border ${
                    isDark ? "border-slate-700 hover:bg-slate-800" : "border-slate-200 hover:bg-slate-100"
                  }`}
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  disabled={submitting}
                  className="px-5 py-2 text-xs font-bold rounded-xl bg-blue-500 text-white hover:bg-blue-600 disabled:opacity-50 transition-colors shadow-md flex items-center gap-1.5"
                >
                  <ArrowsRightLeftIcon className="w-4 h-4" />
                  {submitting ? "Processing..." : "Complete Transfer"}
                </button>
              </div>
            </form>
          )}

          {/* STATEMENT TAB */}
          {activeTab === "statement" && (
            <div className="space-y-4">
              <div className="flex flex-wrap items-center justify-between gap-3">
                <div className="w-full sm:w-64">
                  <Select
                    options={accountOptions}
                    value={accountOptions.find((o) => o.value === selectedAccountId) || null}
                    onChange={(opt) => setSelectedAccountId(opt?.value || null)}
                    styles={selectStyles}
                    isSearchable={false}
                  />
                </div>

                <div className="relative w-full sm:w-64">
                  <MagnifyingGlassIcon className="w-4 h-4 absolute left-3 top-1/2 -translate-y-1/2 text-slate-400" />
                  <input
                    type="text"
                    placeholder="Search transactions..."
                    value={txnSearch}
                    onChange={(e) => setTxnSearch(e.target.value)}
                    className={`w-full h-9 pl-9 pr-3 rounded-xl border text-xs ${
                      isDark ? "bg-slate-800 border-slate-700 text-white" : "bg-white border-slate-200 text-slate-900"
                    }`}
                  />
                </div>
              </div>

              {loadingTransactions ? (
                <div className="py-12 text-center text-xs text-slate-400 flex items-center justify-center gap-2">
                  <ArrowPathIcon className="w-4 h-4 animate-spin" />
                  Loading transactions...
                </div>
              ) : filteredTxns.length === 0 ? (
                <div className="py-12 text-center text-xs text-slate-400 border rounded-xl border-dashed">
                  No transactions recorded for this account yet.
                </div>
              ) : (
                <div className="overflow-x-auto rounded-xl border border-slate-200 dark:border-slate-800">
                  <table className="w-full text-xs text-left">
                    <thead className={`font-semibold border-b ${isDark ? "bg-slate-800/60 border-slate-800 text-slate-300" : "bg-slate-50 border-slate-200 text-slate-600"}`}>
                      <tr>
                        <th className="px-4 py-2.5">Date & Time</th>
                        <th className="px-4 py-2.5">Type</th>
                        <th className="px-4 py-2.5">Description</th>
                        <th className="px-4 py-2.5 text-right">Inflow (+)</th>
                        <th className="px-4 py-2.5 text-right">Outflow (-)</th>
                        <th className="px-4 py-2.5 text-right">Running Balance</th>
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-slate-100 dark:divide-slate-800">
                      {filteredTxns.map((t) => {
                        const isInflow = [
                          "opening_balance",
                          "sale_deposit",
                          "customer_payment",
                          "transfer_in",
                          "manual_deposit",
                          "purchase_return_recovery",
                          "reversal_restore",
                        ].includes(t.type);

                        return (
                          <tr key={t.id} className={isDark ? "hover:bg-slate-800/40" : "hover:bg-slate-50"}>
                            <td className="px-4 py-2.5 font-mono text-[11px] text-slate-500">
                              {new Date(t.transaction_date || t.created_at).toLocaleString([], {
                                month: "short",
                                day: "numeric",
                                hour: "2-digit",
                                minute: "2-digit",
                              })}
                            </td>
                            <td className="px-4 py-2.5">
                              <span className={`px-2 py-0.5 rounded text-[10px] font-bold uppercase ${
                                isInflow
                                  ? "bg-emerald-500/10 text-emerald-600 dark:text-emerald-400"
                                  : "bg-red-500/10 text-red-600 dark:text-red-400"
                              }`}>
                                {t.type.replace(/_/g, " ")}
                              </span>
                            </td>
                            <td className="px-4 py-2.5 text-slate-700 dark:text-slate-300">
                              {t.description || "—"}
                            </td>
                            <td className="px-4 py-2.5 text-right font-bold text-emerald-600 dark:text-emerald-400">
                              {isInflow ? `+${formatCurrency(t.amount)}` : "—"}
                            </td>
                            <td className="px-4 py-2.5 text-right font-bold text-red-600 dark:text-red-400">
                              {!isInflow ? `-${formatCurrency(t.amount)}` : "—"}
                            </td>
                            <td className="px-4 py-2.5 text-right font-black">
                              {formatCurrency(t.balance_after)}
                            </td>
                          </tr>
                        );
                      })}
                    </tbody>
                  </table>
                </div>
              )}
            </div>
          )}

          {/* ADJUSTMENT (DEPOSIT / EXPENSE) TAB */}
          {activeTab === "adjust" && (
            <form onSubmit={handleAdjust} className="max-w-xl mx-auto space-y-4">
              <div className={`p-4 rounded-xl border ${isDark ? "bg-slate-800/40 border-slate-700" : "bg-amber-50/50 border-amber-100"}`}>
                <h3 className="font-bold text-sm mb-1">Manual Deposit / Expense Adjustment</h3>
                <p className={`text-xs ${isDark ? "text-slate-400" : "text-slate-600"}`}>
                  Record non-invoice deposits (e.g. partner investment) or direct withdrawals/expenses (e.g. utility bills, rent).
                </p>
              </div>

              <div>
                <label className={`block text-xs font-bold mb-1.5 ${isDark ? "text-slate-300" : "text-slate-700"}`}>
                  Target Account
                </label>
                <Select
                  options={accountOptions}
                  value={accountOptions.find((o) => o.value === adjustAccount?.id) || null}
                  onChange={(opt) => setAdjustAccount(opt?.data || null)}
                  styles={selectStyles}
                  isSearchable={false}
                />
                {adjustAccount && (
                  <div className="mt-1 text-xs text-slate-500">
                    Current balance: <span className="font-bold">{formatCurrency(adjustAccount.current_balance)}</span>
                  </div>
                )}
              </div>

              <div className="grid grid-cols-2 gap-3">
                <button
                  type="button"
                  onClick={() => setAdjustType("deposit")}
                  className={`py-2.5 rounded-xl border text-xs font-bold flex items-center justify-center gap-1.5 transition-all ${
                    adjustType === "deposit"
                      ? "bg-emerald-500 text-white border-emerald-600 shadow-md"
                      : isDark ? "border-slate-700 text-slate-300 hover:bg-slate-800" : "border-slate-200 text-slate-700 hover:bg-slate-100"
                  }`}
                >
                  <ArrowDownLeftIcon className="w-4 h-4" />
                  Deposit (+ Inflow)
                </button>
                <button
                  type="button"
                  onClick={() => setAdjustType("withdrawal")}
                  className={`py-2.5 rounded-xl border text-xs font-bold flex items-center justify-center gap-1.5 transition-all ${
                    adjustType === "withdrawal"
                      ? "bg-red-500 text-white border-red-600 shadow-md"
                      : isDark ? "border-slate-700 text-slate-300 hover:bg-slate-800" : "border-slate-200 text-slate-700 hover:bg-slate-100"
                  }`}
                >
                  <ArrowUpRightIcon className="w-4 h-4" />
                  Expense (- Outflow)
                </button>
              </div>

              <div>
                <label className={`block text-xs font-bold mb-1.5 ${isDark ? "text-slate-300" : "text-slate-700"}`}>
                  Amount
                </label>
                <input
                  type="number"
                  step="0.01"
                  min="0.01"
                  required
                  placeholder="0.00"
                  value={adjustAmount}
                  onChange={(e) => setAdjustAmount(e.target.value)}
                  className={`w-full h-10 px-3 rounded-xl border text-sm font-bold ${
                    isDark ? "bg-slate-800 border-slate-700 text-white" : "bg-white border-slate-300 text-slate-900"
                  }`}
                />
              </div>

              <div>
                <label className={`block text-xs font-bold mb-1.5 ${isDark ? "text-slate-300" : "text-slate-700"}`}>
                  Reason / Description
                </label>
                <input
                  type="text"
                  required
                  placeholder="e.g. Shop electricity bill, Partner capital injection"
                  value={adjustReason}
                  onChange={(e) => setAdjustReason(e.target.value)}
                  className={`w-full h-10 px-3 rounded-xl border text-xs ${
                    isDark ? "bg-slate-800 border-slate-700 text-white" : "bg-white border-slate-300 text-slate-900"
                  }`}
                />
              </div>

              <div>
                <label className={`block text-xs font-bold mb-1.5 ${isDark ? "text-slate-300" : "text-slate-700"}`}>
                  Reference / Receipt # (Optional)
                </label>
                <input
                  type="text"
                  placeholder="e.g. BILL-9921, CHQ-4402"
                  value={adjustReference}
                  onChange={(e) => setAdjustReference(e.target.value)}
                  className={`w-full h-10 px-3 rounded-xl border text-xs ${
                    isDark ? "bg-slate-800 border-slate-700 text-white" : "bg-white border-slate-300 text-slate-900"
                  }`}
                />
              </div>

              <div className="pt-2 flex items-center justify-end gap-2">
                <button
                  type="button"
                  onClick={() => setActiveTab("overview")}
                  className={`px-4 py-2 text-xs font-bold rounded-xl border ${
                    isDark ? "border-slate-700 hover:bg-slate-800" : "border-slate-200 hover:bg-slate-100"
                  }`}
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  disabled={submitting}
                  className={`px-5 py-2 text-xs font-bold rounded-xl text-white disabled:opacity-50 transition-colors shadow-md ${
                    adjustType === "deposit" ? "bg-emerald-600 hover:bg-emerald-700" : "bg-red-600 hover:bg-red-700"
                  }`}
                >
                  {submitting ? "Saving..." : `Record ${adjustType === "deposit" ? "Deposit" : "Expense"}`}
                </button>
              </div>
            </form>
          )}

          {/* CREATE ACCOUNT TAB */}
          {activeTab === "create" && (
            <form onSubmit={handleCreateAccount} className="max-w-xl mx-auto space-y-4">
              <div className={`p-4 rounded-xl border ${isDark ? "bg-slate-800/40 border-slate-700" : "bg-blue-50/50 border-blue-100"}`}>
                <h3 className="font-bold text-sm mb-1 flex items-center gap-1.5">
                  <SparklesIcon className="w-4 h-4 text-blue-500" />
                  Add New Pakistani Bank or Digital Wallet
                </h3>
                <p className={`text-xs ${isDark ? "text-slate-400" : "text-slate-600"}`}>
                  Pick from the preset directory of all Pakistani banks and mobile wallets, or create a custom account.
                </p>
              </div>

              {/* Quick Preset Selector */}
              <div>
                <label className={`block text-xs font-bold mb-1.5 ${isDark ? "text-slate-300" : "text-slate-700"}`}>
                  🇵🇰 Select Bank / Wallet Preset (Quick Fill)
                </label>
                <Select
                  options={presetOptions}
                  value={presetOptions.flatMap((g) => g.options).find((o) => o.value === selectedPreset?.code) || null}
                  onChange={(opt) => handleSelectPreset(opt?.data || null)}
                  styles={selectStyles}
                  placeholder="Search Pakistan bank or wallet (e.g. Meezan, HBL, JazzCash, Easypaisa)..."
                  isSearchable
                  isClearable
                />
              </div>

              {/* Live Preview if preset chosen */}
              {newAccName && (
                <div className={`p-3 rounded-xl border flex items-center justify-between gap-3 ${isDark ? "bg-slate-800/60 border-slate-700" : "bg-slate-50 border-slate-200"}`}>
                  <div className="flex items-center gap-3">
                    <AccountIcon
                      icon={newAccIcon}
                      code={newAccCode || newAccName}
                      type={newAccType}
                      className="w-10 h-10 rounded-lg shrink-0"
                    />
                    <div>
                      <div className="font-bold text-sm leading-tight">{newAccName}</div>
                      <div className="text-xs text-slate-500 dark:text-slate-400">
                        {newAccBankName || newAccType}
                      </div>
                    </div>
                  </div>
                  <span className="text-[11px] font-semibold px-2 py-0.5 rounded-full bg-blue-500/10 text-blue-500 border border-blue-500/20">
                    {newAccType === "bank" ? "Bank Account" : newAccType === "mobile_wallet" ? "Mobile Wallet" : newAccType}
                  </span>
                </div>
              )}

              <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                <div>
                  <label className={`block text-xs font-bold mb-1.5 ${isDark ? "text-slate-300" : "text-slate-700"}`}>
                    Account Display Name *
                  </label>
                  <input
                    type="text"
                    required
                    placeholder="e.g. Meezan Bank Main, JazzCash Shop"
                    value={newAccName}
                    onChange={(e) => setNewAccName(e.target.value)}
                    className={`w-full h-10 px-3 rounded-xl border text-xs ${
                      isDark ? "bg-slate-800 border-slate-700 text-white" : "bg-white border-slate-300 text-slate-900"
                    }`}
                  />
                </div>

                <div>
                  <label className={`block text-xs font-bold mb-1.5 ${isDark ? "text-slate-300" : "text-slate-700"}`}>
                    Account Type *
                  </label>
                  <select
                    value={newAccType}
                    onChange={(e) => setNewAccType(e.target.value)}
                    className={`w-full h-10 px-3 rounded-xl border text-xs ${
                      isDark ? "bg-slate-800 border-slate-700 text-white" : "bg-white border-slate-300 text-slate-900"
                    }`}
                  >
                    <option value="bank">Bank Account</option>
                    <option value="mobile_wallet">Mobile Wallet</option>
                    <option value="card">Card / POS</option>
                    <option value="cash">Cash / Petty Till</option>
                    <option value="other">Other</option>
                  </select>
                </div>
              </div>

              <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                <div>
                  <label className={`block text-xs font-bold mb-1.5 ${isDark ? "text-slate-300" : "text-slate-700"}`}>
                    Bank / Service Provider Name
                  </label>
                  <input
                    type="text"
                    placeholder="e.g. Meezan Bank Limited, JazzCash, HBL"
                    value={newAccBankName}
                    onChange={(e) => setNewAccBankName(e.target.value)}
                    className={`w-full h-10 px-3 rounded-xl border text-xs ${
                      isDark ? "bg-slate-800 border-slate-700 text-white" : "bg-white border-slate-300 text-slate-900"
                    }`}
                  />
                </div>

                <div>
                  <label className={`block text-xs font-bold mb-1.5 ${isDark ? "text-slate-300" : "text-slate-700"}`}>
                    Account / IBAN / Mobile #
                  </label>
                  <input
                    type="text"
                    placeholder="e.g. PK00MEZN01020304 or 03001234567"
                    value={newAccNumber}
                    onChange={(e) => setNewAccNumber(e.target.value)}
                    className={`w-full h-10 px-3 rounded-xl border text-xs font-mono ${
                      isDark ? "bg-slate-800 border-slate-700 text-white" : "bg-white border-slate-300 text-slate-900"
                    }`}
                  />
                </div>
              </div>

              <div>
                <label className={`block text-xs font-bold mb-1.5 ${isDark ? "text-slate-300" : "text-slate-700"}`}>
                  Opening Balance
                </label>
                <input
                  type="number"
                  step="0.01"
                  min="0"
                  placeholder="0.00"
                  value={newAccOpening}
                  onChange={(e) => setNewAccOpening(e.target.value)}
                  className={`w-full h-10 px-3 rounded-xl border text-sm font-bold ${
                    isDark ? "bg-slate-800 border-slate-700 text-white" : "bg-white border-slate-300 text-slate-900"
                  }`}
                />
              </div>

              <div>
                <label className={`block text-xs font-bold mb-1.5 ${isDark ? "text-slate-300" : "text-slate-700"}`}>
                  Notes (Optional)
                </label>
                <input
                  type="text"
                  placeholder="e.g. Primary business account for digital transfers"
                  value={newAccNotes}
                  onChange={(e) => setNewAccNotes(e.target.value)}
                  className={`w-full h-10 px-3 rounded-xl border text-xs ${
                    isDark ? "bg-slate-800 border-slate-700 text-white" : "bg-white border-slate-300 text-slate-900"
                  }`}
                />
              </div>

              <div className="flex items-center gap-2">
                <input
                  type="checkbox"
                  id="acc_default"
                  checked={newAccIsDefault}
                  onChange={(e) => setNewAccIsDefault(e.target.checked)}
                  className="rounded border-slate-300 text-blue-600 focus:ring-blue-500"
                />
                <label htmlFor="acc_default" className={`text-xs font-medium cursor-pointer ${isDark ? "text-slate-300" : "text-slate-700"}`}>
                  Set as default account for this payment type
                </label>
              </div>

              <div className="pt-2 flex items-center justify-end gap-2">
                <button
                  type="button"
                  onClick={() => setActiveTab("overview")}
                  className={`px-4 py-2 text-xs font-bold rounded-xl border ${
                    isDark ? "border-slate-700 hover:bg-slate-800" : "border-slate-200 hover:bg-slate-100"
                  }`}
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  disabled={submitting}
                  className="px-5 py-2 text-xs font-bold rounded-xl bg-blue-500 text-white hover:bg-blue-600 disabled:opacity-50 transition-colors shadow-md"
                >
                  {submitting ? "Saving..." : "Create Account"}
                </button>
              </div>
            </form>
          )}
        </div>
      </div>
    </div>
  );
}
