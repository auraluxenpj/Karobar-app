import React, { useState, useEffect, useMemo, useCallback, useRef } from "react";
import axios from "axios";
import Select from "react-select";
import {
  BanknotesIcon,
  BuildingLibraryIcon,
  CreditCardIcon,
  DevicePhoneMobileIcon,
  ArrowTopRightOnSquareIcon,
  ArrowPathIcon,
} from "@heroicons/react/24/solid";
import { useCurrency } from "@/context/CurrencyContext.jsx";
import { useTheme } from "@/context/ThemeContext.jsx";
import AccountsModal from "./AccountsModal.jsx";
import AccountIcon from "./AccountIcon.jsx";

export const PAYMENT_METHOD_OPTIONS = [
  { value: "cash", label: "Cash" },
  { value: "bank_transfer", label: "Bank Transfer" },
  { value: "card", label: "Card / POS" },
  { value: "mobile_wallet", label: "Mobile Wallet" },
  { value: "cheque", label: "Cheque" },
];

export default function PaymentAccountSelector({
  paymentMethod = "cash",
  accountId = null,
  onChange,
  layout = "compact", // "compact" (retail sidebar) | "row" (wholesale/purchase forms)
  showBalance = true,
  disabled = false,
}) {
  const { formatCurrency } = useCurrency();
  const { isDark, theme } = useTheme();

  const [accounts, setAccounts] = useState([]);
  const [loading, setLoading] = useState(false);
  const [accountsModalOpen, setAccountsModalOpen] = useState(false);
  const methodSelectRef = useRef(null);

  // Ctrl+M focuses the Payment Method selector
  useEffect(() => {
    if (disabled) return;
    const onKeyDown = (e) => {
      if (e.defaultPrevented) return;
      if ((e.ctrlKey || e.metaKey) && !e.shiftKey && !e.altKey && (e.key || "").toLowerCase() === "m") {
        e.preventDefault();
        methodSelectRef.current?.focus?.();
      }
    };
    window.addEventListener("keydown", onKeyDown);
    return () => window.removeEventListener("keydown", onKeyDown);
  }, [disabled]);

  const fetchAccounts = useCallback(async () => {
    try {
      setLoading(true);
      const res = await axios.get("/api/accounts");
      setAccounts(res.data?.accounts || []);
    } catch {
      setAccounts([]);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    fetchAccounts();
    const onChanged = () => fetchAccounts();
    window.addEventListener("accounts-changed", onChanged);
    window.addEventListener("cash-drawer-changed", onChanged);
    return () => {
      window.removeEventListener("accounts-changed", onChanged);
      window.removeEventListener("cash-drawer-changed", onChanged);
    };
  }, [fetchAccounts]);

  // Map method to account type
  const methodToType = useMemo(
    () => ({
      cash: "cash",
      bank_transfer: "bank",
      card: "card",
      mobile_wallet: "mobile_wallet",
      cheque: "bank",
    }),
    []
  );

  // Accounts matching the current payment method
  const matchingAccounts = useMemo(() => {
    const targetType = methodToType[paymentMethod] || "cash";
    return accounts.filter((a) => a.type === targetType && a.is_active);
  }, [accounts, paymentMethod, methodToType]);

  // Selected account object
  const selectedAccount = useMemo(() => {
    if (accountId) {
      const found = accounts.find((a) => a.id === Number(accountId));
      if (found) return found;
    }
    // Fallback: first matching account or default
    if (matchingAccounts.length > 0) {
      return matchingAccounts[0];
    }
    return accounts.find((a) => a.is_default) || accounts[0] || null;
  }, [accountId, accounts, matchingAccounts]);

  // Auto-bind account_id when accounts load or method changes if not already set or invalid
  useEffect(() => {
    if (matchingAccounts.length > 0) {
      const currentValid = matchingAccounts.some((a) => a.id === Number(accountId));
      if (!currentValid && onChange) {
        onChange({
          payment_method: paymentMethod,
          account_id: matchingAccounts[0].id,
        });
      }
    }
  }, [paymentMethod, matchingAccounts, accountId, onChange]);

  const isSmall = layout === "compact" || layout === "inline";

  const selectStyles = useMemo(
    () => ({
      control: (base, state) => ({
        ...base,
        minHeight: isSmall ? "28px" : "36px",
        height: isSmall ? "28px" : "36px",
        borderRadius: 6,
        backgroundColor: isDark ? "rgba(30, 41, 59, 0.9)" : "#ffffff",
        borderColor: state.isFocused
          ? (theme?.primary_color || "#3b82f6")
          : isDark ? "rgba(71, 85, 105, 0.7)" : "rgba(209, 213, 219, 0.8)",
        boxShadow: state.isFocused
          ? `0 0 0 2px ${theme?.primary_color || "#3b82f6"}33`
          : "none",
        fontSize: isSmall ? "11px" : "13px",
        color: isDark ? "#f8fafc" : "#1e293b",
        padding: 0,
      }),
      valueContainer: (base) => ({
        ...base,
        padding: isSmall ? "0 6px" : "2px 8px",
      }),
      input: (base) => ({
        ...base,
        color: isDark ? "#f8fafc" : "#1e293b",
        margin: 0,
        padding: 0,
      }),
      singleValue: (base) => ({
        ...base,
        color: isDark ? "#f8fafc" : "#1e293b",
        fontSize: isSmall ? "11px" : "13px",
      }),
      indicatorsContainer: (base) => ({
        ...base,
        height: isSmall ? "28px" : "36px",
      }),
      dropdownIndicator: (base) => ({
        ...base,
        padding: isSmall ? "2px" : "6px",
      }),
      menuPortal: (base) => ({ ...base, zIndex: 9999 }),
      menu: (base) => ({
        ...base,
        backgroundColor: isDark ? "#1e293b" : "#ffffff",
        border: isDark ? "1px solid #334155" : "1px solid #e2e8f0",
        boxShadow: "0 10px 25px -5px rgba(0, 0, 0, 0.2)",
        borderRadius: 8,
        overflow: "hidden",
      }),
      option: (base, state) => ({
        ...base,
        backgroundColor: state.isSelected
          ? (theme?.primary_color || "#3b82f6")
          : state.isFocused
          ? isDark ? "#334155" : "#f1f5f9"
          : "transparent",
        color: state.isSelected ? "#ffffff" : isDark ? "#f8fafc" : "#1e293b",
        fontSize: "12px",
        cursor: "pointer",
        padding: "6px 10px",
      }),
    }),
    [isDark, theme, isSmall]
  );

  const handleMethodChange = (opt) => {
    const newMethod = opt?.value || "cash";
    const targetType = methodToType[newMethod] || "cash";
    const matched = accounts.filter((a) => a.type === targetType && a.is_active);
    const newAccountId = matched.length > 0 ? matched[0].id : null;

    if (onChange) {
      onChange({
        payment_method: newMethod,
        account_id: newAccountId,
      });
    }
  };

  const handleAccountChange = (opt) => {
    const acc = opt?.data;
    if (!acc) return;

    let derivedMethod = paymentMethod;
    if (acc.type === "cash") derivedMethod = "cash";
    else if (acc.type === "bank") derivedMethod = "bank_transfer";
    else if (acc.type === "card") derivedMethod = "card";
    else if (acc.type === "mobile_wallet") derivedMethod = "mobile_wallet";

    if (onChange) {
      onChange({
        payment_method: derivedMethod,
        account_id: acc.id,
      });
    }
  };

  const accountOptions = matchingAccounts.map((a) => ({
    value: a.id,
    label: `${a.name} (${formatCurrency(a.current_balance)})`,
    data: a,
  }));

  const formatAccountOptionLabel = (option) => {
    const acc = option.data;
    if (!acc) return option.label;
    return (
      <div className="flex items-center gap-1.5 w-full">
        <AccountIcon
          icon={acc.icon}
          code={acc.code || acc.name}
          type={acc.type}
          className="w-3.5 h-3.5 rounded shrink-0"
        />
        <span className="truncate flex-1">{acc.name}</span>
        <span className="font-mono text-[10px] text-emerald-600 dark:text-emerald-400 font-bold shrink-0">
          {formatCurrency(acc.current_balance)}
        </span>
      </div>
    );
  };

  return (
    <div className={layout === "inline" ? "flex items-center gap-2.5 flex-wrap" : "space-y-1.5"}>
      {layout === "inline" ? (
        // INLINE SINGLE-ROW LAYOUT WITH TITLE NEXT TO FIELD (FOR COMPACT PURCHASE INVOICE FOOTER)
        <>
          <div className="flex items-center gap-1.5 shrink-0">
            <label className={`text-[10px] font-semibold uppercase tracking-wide whitespace-nowrap ${isDark ? "text-slate-400" : "text-gray-500"}`}>
              Method
            </label>
            <div className="w-28">
              <Select
                ref={methodSelectRef}
                openMenuOnFocus={true}
                options={PAYMENT_METHOD_OPTIONS}
                value={
                  PAYMENT_METHOD_OPTIONS.find((o) => o.value === paymentMethod) ||
                  PAYMENT_METHOD_OPTIONS[0]
                }
                onChange={handleMethodChange}
                styles={selectStyles}
                isSearchable={false}
                isDisabled={disabled}
                menuPlacement="top"
              />
            </div>
          </div>

          {matchingAccounts.length > 1 && (
            <div className="flex items-center gap-1.5 shrink-0">
              <label className={`text-[10px] font-semibold uppercase tracking-wide whitespace-nowrap ${isDark ? "text-slate-400" : "text-gray-500"}`}>
                Account
              </label>
              <div className="w-32">
                <Select
                  options={accountOptions}
                  value={accountOptions.find((o) => o.value === selectedAccount?.id) || null}
                  onChange={handleAccountChange}
                  formatOptionLabel={formatAccountOptionLabel}
                  styles={selectStyles}
                  isSearchable={false}
                  isDisabled={disabled}
                  menuPlacement="top"
                />
              </div>
            </div>
          )}

          {showBalance && selectedAccount && (
            <div className="flex items-center gap-1.5 shrink-0">
              <label className={`text-[10px] font-semibold uppercase tracking-wide whitespace-nowrap ${isDark ? "text-slate-400" : "text-gray-500"}`}>
                Balance
              </label>
              <div
                className={`h-7 flex items-center gap-1.5 px-2 rounded-md text-[11px] border transition-colors ${
                  isDark ? "bg-slate-800/60 border-slate-700/60" : "bg-blue-50/60 border-blue-100"
                }`}
              >
                <AccountIcon
                  icon={selectedAccount.icon}
                  code={selectedAccount.code || selectedAccount.name}
                  type={selectedAccount.type}
                  className="w-3.5 h-3.5 rounded shrink-0"
                />
                <span className="truncate max-w-[90px] font-medium text-slate-700 dark:text-slate-300">
                  {selectedAccount.name}
                </span>
                <span className="font-extrabold font-mono text-emerald-600 dark:text-emerald-400 shrink-0">
                  {formatCurrency(selectedAccount.current_balance)}
                </span>
                <button
                  type="button"
                  onClick={() => setAccountsModalOpen(true)}
                  title="View all accounts register"
                  className="text-slate-400 hover:text-blue-500 transition-colors shrink-0"
                >
                  <ArrowTopRightOnSquareIcon className="w-3 h-3" />
                </button>
              </div>
            </div>
          )}
        </>
      ) : layout === "compact" ? (
        // COMPACT LAYOUT (FOR POS / RETAIL SIDEBAR)
        <div className="space-y-1">
          <div className="flex items-center justify-between gap-1">
            <label className={`font-semibold shrink-0 text-xs ${isDark ? "text-slate-400" : "text-gray-500"}`}>
              Method
            </label>
            <div className="w-28">
              <Select
                ref={methodSelectRef}
                openMenuOnFocus={true}
                options={PAYMENT_METHOD_OPTIONS}
                value={
                  PAYMENT_METHOD_OPTIONS.find((o) => o.value === paymentMethod) ||
                  PAYMENT_METHOD_OPTIONS[0]
                }
                onChange={handleMethodChange}
                styles={selectStyles}
                isSearchable={false}
                isDisabled={disabled}
                menuPlacement="auto"
              />
            </div>
          </div>

          {/* If there are multiple accounts for this method, show specific account picker */}
          {matchingAccounts.length > 1 && (
            <div className="flex items-center justify-between gap-1">
              <label className={`font-semibold shrink-0 text-[11px] ${isDark ? "text-slate-400" : "text-gray-500"}`}>
                Account
              </label>
              <div className="w-36">
                <Select
                  options={accountOptions}
                  value={accountOptions.find((o) => o.value === selectedAccount?.id) || null}
                  onChange={handleAccountChange}
                  formatOptionLabel={formatAccountOptionLabel}
                  styles={selectStyles}
                  isSearchable={false}
                  isDisabled={disabled}
                  menuPlacement="auto"
                />
              </div>
            </div>
          )}

          {/* Live Balance Indicator */}
          {showBalance && selectedAccount && (
            <div
              className={`flex items-center justify-between px-2 py-1 rounded-md text-[11px] border transition-colors ${
                isDark ? "bg-slate-800/60 border-slate-700/60" : "bg-blue-50/60 border-blue-100"
              }`}
            >
              <div className="flex items-center gap-1.5 truncate">
                <AccountIcon
                  icon={selectedAccount.icon}
                  code={selectedAccount.code || selectedAccount.name}
                  type={selectedAccount.type}
                  className="w-3.5 h-3.5 rounded shrink-0"
                />
                <span className="truncate font-medium text-slate-700 dark:text-slate-300">
                  {selectedAccount.name}
                </span>
              </div>
              <div className="flex items-center gap-1.5 shrink-0">
                <span className="font-extrabold text-emerald-600 dark:text-emerald-400">
                  {formatCurrency(selectedAccount.current_balance)}
                </span>
                <button
                  type="button"
                  onClick={() => setAccountsModalOpen(true)}
                  title="View all accounts register"
                  className="text-slate-400 hover:text-blue-500 transition-colors"
                >
                  <ArrowTopRightOnSquareIcon className="w-3 h-3" />
                </button>
              </div>
            </div>
          )}
        </div>
      ) : (
        // ROW / EXPANDED LAYOUT (FOR WHOLESALE & PURCHASE INVOICES)
        <div className="space-y-1.5">
          <div className="flex items-center justify-between gap-2">
            <label className={`font-semibold shrink-0 text-xs ${isDark ? "text-slate-400" : "text-gray-500"}`}>
              Payment Method & Account
            </label>
            <button
              type="button"
              onClick={() => setAccountsModalOpen(true)}
              className="inline-flex items-center gap-1 text-[11px] font-semibold text-blue-500 hover:underline"
            >
              <BuildingLibraryIcon className="w-3 h-3" />
              <span>Accounts</span>
            </button>
          </div>

          <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
            <div>
              <Select
                ref={methodSelectRef}
                openMenuOnFocus={true}
                options={PAYMENT_METHOD_OPTIONS}
                value={
                  PAYMENT_METHOD_OPTIONS.find((o) => o.value === paymentMethod) ||
                  PAYMENT_METHOD_OPTIONS[0]
                }
                onChange={handleMethodChange}
                styles={selectStyles}
                isSearchable={false}
                isDisabled={disabled}
                menuPlacement="auto"
              />
            </div>

            <div>
              <Select
                options={accountOptions.length > 0 ? accountOptions : [
                  { value: selectedAccount?.id || 1, label: selectedAccount?.name || "Default Account" }
                ]}
                value={accountOptions.find((o) => o.value === selectedAccount?.id) || null}
                onChange={handleAccountChange}
                formatOptionLabel={formatAccountOptionLabel}
                styles={selectStyles}
                isSearchable={false}
                isDisabled={disabled || accountOptions.length <= 1}
                menuPlacement="auto"
              />
            </div>
          </div>

          {/* Live Balance Badge */}
          {showBalance && selectedAccount && (
            <div
              className={`flex items-center justify-between px-2.5 py-1.5 rounded-lg text-xs border ${
                isDark ? "bg-slate-800/70 border-slate-700" : "bg-blue-50/70 border-blue-100"
              }`}
            >
              <div className="flex items-center gap-2">
                <AccountIcon
                  icon={selectedAccount.icon}
                  code={selectedAccount.code || selectedAccount.name}
                  type={selectedAccount.type}
                  className="w-4 h-4 rounded shrink-0"
                />
                <span className="font-semibold text-slate-700 dark:text-slate-300">
                  {selectedAccount.name}
                  {selectedAccount.account_number && ` (${selectedAccount.account_number})`}
                </span>
              </div>
              <div className="flex items-center gap-2">
                <span className={`text-[10px] uppercase font-bold ${isDark ? "text-slate-400" : "text-slate-500"}`}>
                  Live Balance:
                </span>
                <span className="font-black text-emerald-600 dark:text-emerald-400">
                  {formatCurrency(selectedAccount.current_balance)}
                </span>
              </div>
            </div>
          )}
        </div>
      )}

      {/* Embedded Accounts Modal */}
      <AccountsModal
        isOpen={accountsModalOpen}
        onClose={() => setAccountsModalOpen(false)}
        onAccountUpdated={fetchAccounts}
      />
    </div>
  );
}

