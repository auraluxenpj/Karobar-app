// resources/js/components/settings/GeneralSetting.jsx
import React, { useMemo } from "react";
import toast from "react-hot-toast";
import Select from "react-select";
import { FilePond, registerPlugin } from "react-filepond";
import FilePondPluginImagePreview from "filepond-plugin-image-preview";
import FilePondPluginFileValidateType from "filepond-plugin-file-validate-type";
import "filepond/dist/filepond.min.css";
import "filepond-plugin-image-preview/dist/filepond-plugin-image-preview.css";
import { GlassInput } from "@/components/Glass.jsx";
import { BuildingStorefrontIcon, BanknotesIcon, SparklesIcon } from "@heroicons/react/24/solid";
import { useTheme } from "@/context/ThemeContext";
import {
  GuideBotAvatar,
  useBottomMascotEnabledState,
} from "@/components/GuideBotTrigger.jsx";

registerPlugin(FilePondPluginImagePreview, FilePondPluginFileValidateType);

const PRESET_CURRENCIES = [
  { code: "PKR", symbol: "Rs.", label: "Pakistani Rupee (PKR - Rs.)" },
  { code: "USD", symbol: "$", label: "US Dollar (USD - $)" },
  { code: "EUR", symbol: "€", label: "Euro (EUR - €)" },
  { code: "GBP", symbol: "£", label: "British Pound (GBP - £)" },
  { code: "SAR", symbol: "SR", label: "Saudi Riyal (SAR - SR)" },
  { code: "AED", symbol: "AED", label: "UAE Dirham (AED)" },
  { code: "INR", symbol: "₹", label: "Indian Rupee (INR - ₹)" },
  { code: "CAD", symbol: "CA$", label: "Canadian Dollar (CAD - CA$)" },
  { code: "AUD", symbol: "AU$", label: "Australian Dollar (AUD - AU$)" },
  { code: "CUSTOM", symbol: "", label: "Custom Currency" },
];

export default function GeneralSetting({
  form,
  setForm,
  handleChange,
  disableInputs,
  files,
  setFiles,
  storeNameRef,
  phoneRef,
  addressRef,
  licenseRef,
}) {
  const { isDark, theme } = useTheme();
  const [bottomMascotEnabled, setBottomMascotEnabled] = useBottomMascotEnabledState();

  const handleToggleBottomMascot = (nextChecked) => {
    setBottomMascotEnabled(nextChecked);
    toast.success(
      nextChecked
        ? "Bottom roaming mascot enabled"
        : "Bottom roaming mascot hidden (Topbar Guide Bot stays active)"
    );
  };

  const selectStyles = useMemo(() => ({
    control: (base, state) => ({
      ...base,
      minHeight: "38px",
      borderRadius: 12,
      backgroundColor: isDark ? "rgba(30, 41, 59, 0.85)" : "#ffffff",
      borderColor: state.isFocused
        ? (theme?.primary_color || "#3b82f6")
        : (isDark ? "rgba(71, 85, 105, 0.7)" : "rgba(209, 213, 219, 0.8)"),
      boxShadow: state.isFocused
        ? `0 0 0 2px ${theme?.primary_color || "#3b82f6"}33`
        : "none",
      fontSize: "14px",
      color: isDark ? "#f8fafc" : "#1e293b",
      "&:hover": {
        borderColor: theme?.primary_color || "#3b82f6",
      },
    }),
    valueContainer: (base) => ({
      ...base,
      padding: "2px 10px",
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
      fontSize: "14px",
    }),
    placeholder: (base) => ({
      ...base,
      color: isDark ? "#94a3b8" : "#64748b",
      fontSize: "14px",
    }),
    menuPortal: (base) => ({
      ...base,
      zIndex: 9999,
    }),
    menu: (base) => ({
      ...base,
      backgroundColor: isDark ? "#1e293b" : "#ffffff",
      borderRadius: 12,
      border: isDark ? "1px solid rgba(71, 85, 105, 0.7)" : "1px solid rgba(229, 231, 235, 1)",
      boxShadow: "0 10px 25px -5px rgba(0, 0, 0, 0.25), 0 8px 10px -6px rgba(0, 0, 0, 0.25)",
      overflow: "hidden",
      zIndex: 9999,
    }),
    option: (base, state) => ({
      ...base,
      minHeight: 38,
      backgroundColor: state.isSelected
        ? (theme?.primary_color || "#3b82f6")
        : state.isFocused
        ? (isDark ? "rgba(51, 65, 85, 0.8)" : "rgba(239, 246, 255, 1)")
        : "transparent",
      color: state.isSelected
        ? "#ffffff"
        : isDark
        ? "#f8fafc"
        : "#1e293b",
      cursor: "pointer",
      fontSize: "14px",
      "&:active": {
        backgroundColor: theme?.primary_color || "#3b82f6",
        color: "#ffffff",
      },
    }),
  }), [isDark, theme]);

  const handleCurrencyPresetChange = (selectedOption) => {
    const selectedCode = selectedOption?.value;
    if (selectedCode === "CUSTOM") {
      setForm?.((prev) => ({
        ...prev,
        currency_code: "",
      }));
      return;
    }
    const preset = PRESET_CURRENCIES.find((c) => c.code === selectedCode);
    if (preset) {
      setForm?.((prev) => ({
        ...prev,
        currency_code: preset.code,
        currency_symbol: preset.symbol,
      }));
    }
  };

  // Compute live preview formatting
  const previewAmount = 12500.5;
  const decimals = Number(form.currency_decimal_places ?? 2);
  const formattedNumber = previewAmount.toLocaleString(undefined, {
    minimumFractionDigits: decimals,
    maximumFractionDigits: decimals,
  });
  const symbol = form.currency_symbol || "";
  const position = form.currency_position || "before";
  const livePreview =
    position === "after" ? `${formattedNumber} ${symbol}` : `${symbol} ${formattedNumber}`;

  const currentPreset = PRESET_CURRENCIES.some((c) => c.code === form.currency_code)
    ? form.currency_code
    : "CUSTOM";

  return (
    <div className="space-y-6">
      {/* Block 1: Store Identity & Contact */}
      <div className="settings-block">
        <div className="settings-block-heading">
          <div className="flex items-center gap-3 min-w-0">
            <div className="settings-block-icon">
              <BuildingStorefrontIcon />
            </div>
            <div className="min-w-0">
              <h2 className="settings-block-title">Store Identity &amp; Contact</h2>
              <p className="settings-block-note">Basic information and logo</p>
            </div>
          </div>
        </div>

        <div className="settings-body">
          <div className="flex flex-col gap-5 md:flex-row md:items-start">
            {/* Logo */}
            <div className="w-full shrink-0 md:w-40">
              <label className="settings-label">Logo</label>
              <div className="mt-2">
                <FilePond
                  files={files}
                  onupdatefiles={(fl) => {
                    if (!disableInputs) {
                      setFiles(fl);
                    } else {
                      toast.error("No permission to update settings.");
                    }
                  }}
                  allowMultiple={false}
                  acceptedFileTypes={['image/png', 'image/jpeg', 'image/jpg', 'image/webp']}
                  disabled={disableInputs}
                  labelIdle='Drop logo or <span class="filepond--label-action">browse</span>'
                  credits={false}
                  stylePanelLayout="compact"
                />
              </div>
              <p className="settings-hint mt-2">PNG, JPG or WebP</p>
            </div>

            {/* Store details */}
            <div className="settings-fields flex-1">
              <div className="settings-field">
                <label className="settings-label" htmlFor="setting-store-name">Store Name</label>
                <GlassInput
                  id="setting-store-name"
                  ref={storeNameRef}
                  type="text"
                  name="store_name"
                  value={form.store_name}
                  onChange={handleChange}
                  disabled={disableInputs}
                  onKeyDown={(e) => {
                    if (e.key === "Enter") { e.preventDefault(); phoneRef.current?.focus(); }
                  }}
                  placeholder="e.g., My Pharmacy"
                  className="w-full"
                />
              </div>

              <div className="settings-field">
                <label className="settings-label" htmlFor="setting-phone">Phone Number</label>
                <GlassInput
                  id="setting-phone"
                  ref={phoneRef}
                  type="text"
                  name="phone_number"
                  value={form.phone_number}
                  onChange={handleChange}
                  disabled={disableInputs}
                  onKeyDown={(e) => {
                    if (e.key === "Enter") { e.preventDefault(); addressRef.current?.focus(); }
                  }}
                  placeholder="+92 xx xxxxxxx"
                  className="w-full"
                />
              </div>

              <div className="settings-field settings-field-wide">
                <label className="settings-label" htmlFor="setting-address">Address</label>
                <GlassInput
                  id="setting-address"
                  ref={addressRef}
                  type="text"
                  name="address"
                  value={form.address}
                  onChange={handleChange}
                  disabled={disableInputs}
                  placeholder="Street, City"
                  className="w-full"
                />
              </div>

              <div className="settings-field settings-field-wide">
                <label className="settings-label" htmlFor="setting-licence">Licence Number</label>
                <GlassInput
                  id="setting-licence"
                  ref={licenseRef}
                  type="text"
                  name="license_number"
                  value={form.license_number}
                  onChange={handleChange}
                  disabled={disableInputs}
                  placeholder="e.g., ABC-12345"
                  className="w-full"
                />
              </div>
            </div>
          </div>
        </div>
      </div>

      {/* Block 2: Currency & Financial Formatting */}
      <div className="settings-block">
        <div className="settings-block-heading">
          <div className="flex items-center gap-3 min-w-0">
            <div className={`settings-block-icon ${
              isDark
                ? "text-emerald-400 bg-emerald-500/10 border border-emerald-500/20"
                : "text-emerald-600 bg-emerald-50 border border-emerald-200"
            }`}>
              <BanknotesIcon className="w-5 h-5" />
            </div>
            <div className="min-w-0">
              <h2 className="settings-block-title">Currency &amp; Price Formatting</h2>
              <p className="settings-block-note">Set store currency, symbol, placement, and decimal rounding</p>
            </div>
          </div>
        </div>

        <div className="settings-body space-y-5">
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            {/* Currency Preset Selector */}
            <div className="settings-field">
              <label className="settings-label" htmlFor="setting-currency-preset">
                Currency Selection
              </label>
              <Select
                inputId="setting-currency-preset"
                value={PRESET_CURRENCIES.map((c) => ({ value: c.code, label: c.label })).find((o) => o.value === currentPreset)}
                onChange={handleCurrencyPresetChange}
                options={PRESET_CURRENCIES.map((c) => ({ value: c.code, label: c.label }))}
                isDisabled={disableInputs}
                styles={selectStyles}
                menuPortalTarget={typeof document !== "undefined" ? document.body : null}
                menuPosition="fixed"
                className="text-sm"
                isSearchable
              />
              <p className="settings-hint mt-1">Select a standard currency or configure a custom one.</p>
            </div>

            {/* Currency Symbol */}
            <div className="settings-field">
              <label className="settings-label" htmlFor="setting-currency-symbol">
                Currency Symbol
              </label>
              <GlassInput
                id="setting-currency-symbol"
                type="text"
                name="currency_symbol"
                value={form.currency_symbol ?? ""}
                onChange={handleChange}
                disabled={disableInputs}
                placeholder="e.g. Rs., $, €, £"
                className="w-full"
              />
              <p className="settings-hint mt-1">Displayed on receipts, invoices, and reports.</p>
            </div>

            {/* Currency Code */}
            <div className="settings-field">
              <label className="settings-label" htmlFor="setting-currency-code">
                ISO Code
              </label>
              <GlassInput
                id="setting-currency-code"
                type="text"
                name="currency_code"
                value={form.currency_code ?? ""}
                onChange={handleChange}
                disabled={disableInputs}
                placeholder="e.g. PKR, USD, EUR"
                className="w-full uppercase"
              />
            </div>

            {/* Symbol Position */}
            <div className="settings-field">
              <label className="settings-label" htmlFor="setting-currency-pos">
                Symbol Position
              </label>
              <Select
                inputId="setting-currency-pos"
                value={[
                  { value: "before", label: `Before Amount (e.g. ${form.currency_symbol || "Rs."} 1,250)` },
                  { value: "after", label: `After Amount (e.g. 1,250 ${form.currency_symbol || "Rs."})` },
                ].find((o) => o.value === (form.currency_position || "before"))}
                onChange={(opt) => handleChange({ target: { name: "currency_position", value: opt?.value || "before" } })}
                options={[
                  { value: "before", label: `Before Amount (e.g. ${form.currency_symbol || "Rs."} 1,250)` },
                  { value: "after", label: `After Amount (e.g. 1,250 ${form.currency_symbol || "Rs."})` },
                ]}
                isDisabled={disableInputs}
                styles={selectStyles}
                menuPortalTarget={typeof document !== "undefined" ? document.body : null}
                menuPosition="fixed"
                className="text-sm"
                isSearchable={false}
              />
            </div>

            {/* Decimal Places */}
            <div className="settings-field">
              <label className="settings-label" htmlFor="setting-currency-decimals">
                Decimal Places
              </label>
              <Select
                inputId="setting-currency-decimals"
                value={[
                  { value: 0, label: "0 Decimals (e.g. 12,500)" },
                  { value: 2, label: "2 Decimals (e.g. 12,500.50)" },
                ].find((o) => o.value === Number(form.currency_decimal_places ?? 2))}
                onChange={(opt) => handleChange({ target: { name: "currency_decimal_places", value: opt?.value ?? 2 } })}
                options={[
                  { value: 0, label: "0 Decimals (e.g. 12,500)" },
                  { value: 2, label: "2 Decimals (e.g. 12,500.50)" },
                ]}
                isDisabled={disableInputs}
                styles={selectStyles}
                menuPortalTarget={typeof document !== "undefined" ? document.body : null}
                menuPosition="fixed"
                className="text-sm"
                isSearchable={false}
              />
            </div>

            {/* Live Visual Preview Box */}
            <div className={`p-4 rounded-xl border flex flex-col justify-center transition-colors ${
              isDark
                ? "bg-slate-800/50 border-slate-700/60"
                : "bg-emerald-50/70 border-emerald-200/90 shadow-xs"
            }`}>
              <span className={`text-xs uppercase tracking-wider font-semibold ${
                isDark ? "text-slate-400" : "text-emerald-800"
              }`}>
                Invoice Live Preview
              </span>
              <div className="mt-1 flex items-baseline gap-2">
                <span className={`text-2xl font-bold font-mono ${
                  isDark ? "text-emerald-400" : "text-emerald-600"
                }`}>
                  {livePreview}
                </span>
                <span className={`text-xs ${
                  isDark ? "text-slate-400" : "text-emerald-700/80"
                }`}>
                  (for {previewAmount.toLocaleString()} units)
                </span>
              </div>
            </div>
          </div>
        </div>
      </div>

      {/* ===== Bottom Roaming Mascot (Cube Companion) ===== */}
      <div className="settings-block">
        <div className="settings-block-heading">
          <div className="flex items-center gap-3 min-w-0">
            <div className="settings-block-icon">
              <SparklesIcon />
            </div>
            <div className="min-w-0">
              <h2 className="settings-block-title">Bottom Roaming Mascot</h2>
              <p className="settings-block-note">
                Show or hide the animated Cube mascot at the bottom of the screen. The top navigation bar Guide Bot button remains active.
              </p>
            </div>
          </div>
          <span
            className="settings-chip"
            style={{
              "--settings-chip": bottomMascotEnabled ? "#10b981" : "#64748b",
            }}
          >
            {bottomMascotEnabled ? "ON" : "OFF"}
          </span>
        </div>

        <div className="settings-body">
          <div
            className={`p-4 rounded-xl border flex flex-col sm:flex-row sm:items-center justify-between gap-4 transition-colors ${
              isDark
                ? "bg-slate-800/50 border-slate-700/60"
                : "bg-slate-50/80 border-slate-200/90"
            }`}
          >
            <div className="flex items-center gap-4 min-w-0">
              <div
                className={`w-16 h-16 rounded-2xl border flex items-center justify-center shrink-0 transition-opacity ${
                  isDark
                    ? "bg-slate-900/90 border-slate-700"
                    : "bg-white border-slate-200 shadow-2xs"
                } ${bottomMascotEnabled ? "opacity-100" : "opacity-45 grayscale"}`}
              >
                <GuideBotAvatar
                  className="w-12 h-14"
                  fullBody={true}
                  interactive={false}
                  waving={bottomMascotEnabled}
                />
              </div>
              <div className="min-w-0">
                <label
                  htmlFor="setting-bottom-mascot-switch"
                  className={`text-sm font-bold cursor-pointer block ${
                    isDark ? "text-slate-100" : "text-slate-900"
                  }`}
                >
                  Show Bottom Roaming Cube Mascot
                </label>
                <p className="settings-hint mt-0.5">
                  When turned off, only the bottom roaming character is hidden. You can still open Guide Bot anytime from the top bar or with <kbd className="px-1.5 py-0.5 text-[11px] font-mono rounded bg-slate-200/80 dark:bg-slate-700">Ctrl+G</kbd>.
                </p>
              </div>
            </div>

            <label
              htmlFor="setting-bottom-mascot-switch"
              className="inline-flex items-center gap-3 cursor-pointer shrink-0 select-none"
            >
              <input
                id="setting-bottom-mascot-switch"
                type="checkbox"
                {...{ switch: "" }}
                checked={bottomMascotEnabled}
                onChange={(e) => handleToggleBottomMascot(e.target.checked)}
                className="sr-only peer"
              />
              <span
                aria-hidden="true"
                className={`relative inline-flex h-7 w-12 shrink-0 items-center rounded-full transition-colors duration-200 ${
                  bottomMascotEnabled
                    ? "bg-emerald-500"
                    : isDark
                    ? "bg-slate-700"
                    : "bg-slate-300"
                }`}
              >
                <span
                  className={`inline-block h-5 w-5 transform rounded-full bg-white shadow-md transition-transform duration-200 ${
                    bottomMascotEnabled ? "translate-x-6" : "translate-x-1"
                  }`}
                />
              </span>
              <span
                className={`text-xs font-extrabold uppercase tracking-wider w-8 ${
                  bottomMascotEnabled
                    ? "text-emerald-600 dark:text-emerald-400"
                    : "text-slate-500 dark:text-slate-400"
                }`}
              >
                {bottomMascotEnabled ? "On" : "Off"}
              </span>
            </label>
          </div>
        </div>
      </div>
    </div>
  );
}
