import { useEffect, useRef, useState, useMemo } from "react";
import axios from "axios";
import toast from "react-hot-toast";

// FilePond
import { registerPlugin } from "react-filepond";
import FilePondPluginImagePreview from "filepond-plugin-image-preview";
import FilePondPluginFileValidateType from "filepond-plugin-file-validate-type";
import "filepond/dist/filepond.min.css";
import "filepond-plugin-image-preview/dist/filepond-plugin-image-preview.css";

import { usePermissions } from "@/api/usePermissions.js";
import { useTheme } from "@/context/ThemeContext.jsx";
import PageSkeleton from "@/components/PageSkeleton.jsx";
import { GlassCard } from "@/components/Glass.jsx";

import {
  ArrowDownOnSquareIcon,
  CogIcon,
  PrinterIcon,
  DocumentTextIcon,
  Bars3Icon,
  ShoppingCartIcon,
  SparklesIcon,
  ShareIcon,
} from "@heroicons/react/24/solid";

// Setting Components
import GeneralSetting from "@/components/settings/GeneralSetting.jsx";
import SaleSystemSetting from "@/components/settings/SaleSystemSetting.jsx";
import ThemeSetting from "@/components/settings/ThemeSetting.jsx";
import PrinterSetting from "@/components/settings/PrinterSetting.jsx";
import DocumentSharingSetting from "@/components/settings/DocumentSharingSetting.jsx";
import CubeAiSetting from "@/components/settings/CubeAiSetting.jsx";
import LicenseSetting from "@/components/settings/LicenseSetting.jsx";

registerPlugin(FilePondPluginImagePreview, FilePondPluginFileValidateType);

// Helper to determine text color based on background brightness
const getContrastText = (hexColor) => {
  hexColor = (hexColor || "#3b82f6").replace("#", "");
  const r = parseInt(hexColor.substring(0, 2), 16) || 0;
  const g = parseInt(hexColor.substring(2, 4), 16) || 0;
  const b = parseInt(hexColor.substring(4, 6), 16) || 0;
  const luminance = (0.299 * r + 0.587 * g + 0.114 * b) / 255;
  return luminance > 0.5 ? "#1f2937" : "#ffffff";
};

const SETTING_GROUPS = [
  {
    groupLabel: "Store & Operations",
    items: [
      {
        id: "general",
        label: "Store Profile",
        subtitle: "Business identity, contact & logo",
        icon: CogIcon,
      },
      {
        id: "sale",
        label: "Sales & Currency",
        subtitle: "Sale mode, industry & currency",
        icon: ShoppingCartIcon,
      },
      {
        id: "navigation",
        label: "Appearance & Theme",
        subtitle: "Navigation layout, colors & mode",
        icon: Bars3Icon,
      },
    ],
  },
  {
    groupLabel: "Documents & Communication",
    items: [
      {
        id: "sharing",
        label: "Document Sharing",
        subtitle: "Shared PDF design, WhatsApp & Email",
        icon: ShareIcon,
      },
      {
        id: "printer",
        label: "Print & Receipt Layouts",
        subtitle: "Thermal receipts & A4 print templates",
        icon: PrinterIcon,
      },
    ],
  },
  {
    groupLabel: "Intelligence & System",
    items: [
      {
        id: "cube",
        label: "Cube AI Assistant",
        subtitle: "AI Co-Pilot & provider configuration",
        icon: SparklesIcon,
      },
      {
        id: "license",
        label: "Software License",
        subtitle: "Activation & machine binding",
        icon: DocumentTextIcon,
      },
    ],
  },
];

const ALL_TABS = SETTING_GROUPS.flatMap((g) => g.items);

function resolveHashDestination(rawHash) {
  const hash = String(rawHash || "")
    .replace("#", "")
    .trim()
    .toLowerCase();
  if (hash === "whatsapp") {
    return { tab: "sharing", subTab: "whatsapp" };
  }
  if (hash === "smtp" || hash === "email") {
    return { tab: "sharing", subTab: "smtp" };
  }
  if (hash === "sharing" || hash === "pdf") {
    return { tab: "sharing", subTab: "pdf_design" };
  }
  if (ALL_TABS.some((t) => t.id === hash)) {
    return { tab: hash, subTab: "pdf_design" };
  }
  return null;
}

export default function Setting() {
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const { isDark, theme } = useTheme();

  const initialDest = resolveHashDestination(
    typeof window !== "undefined" ? window.location.hash : ""
  ) || { tab: "general", subTab: "pdf_design" };

  const [activeTab, setActiveTab] = useState(initialDest.tab);
  const [sharingSubTab, setSharingSubTab] = useState(initialDest.subTab);

  const [form, setForm] = useState({
    store_name: "",
    phone_number: "",
    address: "",
    license_number: "",
    note: "",
    printer_type: "thermal",
    thermal_template: "standard",
    a4_template: "standard",
    navigation_style: "sidebar",
    sale_system: "retail_wholesale",
    shop_type: "pharmacy",
    currency_code: "PKR",
    currency_symbol: "Rs.",
    currency_position: "before",
    currency_decimal_places: 2,
    smtp_enabled: false,
    smtp_host: "",
    smtp_port: 587,
    smtp_username: "",
    smtp_password: "",
    smtp_encryption: "tls",
    smtp_from_address: "",
    smtp_from_name: "",
    whatsapp_enabled: false,
    whatsapp_provider: "local_agent",
    whatsapp_access_token: "",
    whatsapp_phone_number_id: "",
    whatsapp_business_account_id: "",
    whatsapp_api_version: "v21.0",
    whatsapp_api_url: "",
    whatsapp_default_country_code: "92",
    whatsapp_template_name: "",
    whatsapp_template_language: "en_US",
    whatsapp_auto_fallback: true,
    cube_ai_enabled: true,
    cube_groq_enabled: true,
    cube_groq_api_key: "",
    cube_groq_model: "llama-3.3-70b-versatile",
    cube_groq_daily_limit: 250,
    cube_gemini_enabled: true,
    cube_gemini_api_key: "",
    cube_gemini_model: "gemini-3.8-flash",
    cube_gemini_daily_limit: 250,
  });

  const [cubeUsageSummary, setCubeUsageSummary] = useState(null);
  const [files, setFiles] = useState([]);

  // Check for hash changes in URL
  useEffect(() => {
    const syncFromHash = () => {
      const dest = resolveHashDestination(window.location.hash);
      if (dest) {
        setActiveTab(dest.tab);
        setSharingSubTab(dest.subTab);
      }
    };
    syncFromHash();
    window.addEventListener("hashchange", syncFromHash);
    return () => window.removeEventListener("hashchange", syncFromHash);
  }, []);

  // License management state
  const [licenseStatus, setLicenseStatus] = useState(null);
  const [licenseLoading, setLicenseLoading] = useState(false);

  // Refs for focus & enter navigation
  const storeNameRef = useRef(null);
  const phoneRef = useRef(null);
  const addressRef = useRef(null);
  const licenseRef = useRef(null);
  const saveBtnRef = useRef(null);

  const { loading: permsLoading, canFor } = usePermissions();
  const can = useMemo(
    () =>
      typeof canFor === "function"
        ? canFor("settings")
        : {
            view: false,
            create: false,
            update: false,
            delete: false,
            import: false,
            export: false,
          },
    [canFor]
  );

  const themeColors = useMemo(() => {
    if (!theme) {
      return {
        primary: "#3b82f6",
        primaryHover: "#2563eb",
        primaryLight: "#dbeafe",
        secondary: "#8b5cf6",
        secondaryHover: "#7c3aed",
        secondaryLight: "#ede9fe",
        emerald: "#10b981",
        emeraldHover: "#059669",
        emeraldLight: "#d1fae5",
      };
    }
    return {
      primary: theme.primary_color || "#3b82f6",
      primaryHover: theme.primary_hover || "#2563eb",
      primaryLight: theme.primary_light || "#dbeafe",
      secondary: theme.secondary_color || "#8b5cf6",
      secondaryHover: theme.secondary_hover || "#7c3aed",
      secondaryLight: theme.secondary_light || "#ede9fe",
      emerald: theme.success_color || "#10b981",
      emeraldHover: "#059669",
      emeraldLight: "#d1fae5",
    };
  }, [theme]);

  const primaryTextColor = useMemo(
    () => getContrastText(themeColors.primaryHover || themeColors.primary),
    [themeColors.primary, themeColors.primaryHover]
  );

  const emeraldTextColor = useMemo(
    () => getContrastText(themeColors.emeraldHover || themeColors.emerald),
    [themeColors.emerald, themeColors.emeraldHover]
  );

  useEffect(() => {
    if (permsLoading) return;
    if (!can.view) {
      setLoading(false);
      return;
    }
    fetchSettings();
    fetchLicenseStatus();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [permsLoading, can.view]);

  useEffect(() => {
    if (!loading && can.view && activeTab === "general") {
      const t = setTimeout(() => storeNameRef.current?.focus(), 120);
      return () => clearTimeout(t);
    }
  }, [loading, can.view, activeTab]);

  // Alt+S to save
  useEffect(() => {
    const handleShortcut = (e) => {
      if (e.altKey && (e.key || "").toLowerCase() === "s") {
        e.preventDefault();
        if (can.update) handleSave();
        else toast.error("You do not have permission to update settings.");
      }
    };
    window.addEventListener("keydown", handleShortcut);
    return () => window.removeEventListener("keydown", handleShortcut);
  }, [form, files, can.update]);

  const fetchSettings = async () => {
    try {
      setLoading(true);
      const { data } = await axios.get("/api/settings");
      setForm({
        store_name: data.store_name || "",
        phone_number: data.phone_number || "",
        address: data.address || "",
        license_number: data.license_number || "",
        note: data.note || "",
        printer_type: data.printer_type || "thermal",
        thermal_template: data.thermal_template || "standard",
        a4_template: data.a4_template || "standard",
        navigation_style: data.navigation_style || "sidebar",
        sale_system: data.sale_system || "retail_wholesale",
        shop_type: data.shop_type || "pharmacy",
        currency_code: data.currency_code || "PKR",
        currency_symbol: data.currency_symbol || "Rs.",
        currency_position: data.currency_position || "before",
        currency_decimal_places:
          data.currency_decimal_places !== undefined
            ? Number(data.currency_decimal_places)
            : 2,
        smtp_enabled: Boolean(data.smtp_enabled),
        smtp_host: data.smtp_host || "",
        smtp_port:
          data.smtp_port !== undefined && data.smtp_port !== null
            ? Number(data.smtp_port)
            : 587,
        smtp_username: data.smtp_username || "",
        smtp_password: data.smtp_password || "",
        smtp_encryption: data.smtp_encryption || "tls",
        smtp_from_address: data.smtp_from_address || "",
        smtp_from_name: data.smtp_from_name || "",
        whatsapp_enabled: Boolean(data.whatsapp_enabled),
        whatsapp_provider: data.whatsapp_provider || "local_agent",
        whatsapp_access_token: data.whatsapp_access_token || "",
        whatsapp_phone_number_id: data.whatsapp_phone_number_id || "",
        whatsapp_business_account_id: data.whatsapp_business_account_id || "",
        whatsapp_api_version: data.whatsapp_api_version || "v21.0",
        whatsapp_api_url: data.whatsapp_api_url || "",
        whatsapp_default_country_code: data.whatsapp_default_country_code || "92",
        whatsapp_template_name: data.whatsapp_template_name || "",
        whatsapp_template_language: data.whatsapp_template_language || "en_US",
        whatsapp_auto_fallback:
          data.whatsapp_auto_fallback !== undefined
            ? Boolean(data.whatsapp_auto_fallback)
            : true,
        cube_ai_enabled:
          data.cube_ai_enabled !== undefined ? Boolean(data.cube_ai_enabled) : true,
        cube_groq_enabled:
          data.cube_groq_enabled !== undefined ? Boolean(data.cube_groq_enabled) : true,
        cube_groq_api_key: data.cube_groq_api_key || "",
        cube_groq_model: data.cube_groq_model || "llama-3.3-70b-versatile",
        cube_groq_daily_limit:
          data.cube_groq_daily_limit !== undefined && data.cube_groq_daily_limit !== null
            ? Number(data.cube_groq_daily_limit)
            : 250,
        cube_gemini_enabled:
          data.cube_gemini_enabled !== undefined
            ? Boolean(data.cube_gemini_enabled)
            : true,
        cube_gemini_api_key: data.cube_gemini_api_key || "",
        cube_gemini_model: data.cube_gemini_model || "gemini-3.8-flash",
        cube_gemini_daily_limit:
          data.cube_gemini_daily_limit !== undefined &&
          data.cube_gemini_daily_limit !== null
            ? Number(data.cube_gemini_daily_limit)
            : 250,
      });

      if (data.cube_usage_summary) {
        setCubeUsageSummary(data.cube_usage_summary);
      }

      if (data.logo_url) {
        setFiles([{ source: data.logo_url, options: { type: "remote" } }]);
      } else {
        setFiles([]);
      }
    } catch (err) {
      const status = err?.response?.status;
      if (status === 403)
        toast.error("You do not have permission to view settings.");
      else toast.error("Failed to load settings");
    } finally {
      setLoading(false);
    }
  };

  const handleChange = (e) => {
    const { name, value } = e.target;
    setForm((s) => ({ ...s, [name]: value }));
  };

  const handleSaleSystemChange = (e) => {
    const { value } = e.target;
    setForm((s) => ({ ...s, sale_system: value }));
  };

  const handleShopTypeChange = (e) => {
    const { value } = e.target;
    setForm((s) => ({ ...s, shop_type: value }));
  };

  const handleSave = async () => {
    if (!can.update) {
      toast.error("You do not have permission to update settings.");
      return;
    }
    try {
      setSaving(true);
      const fd = new FormData();
      fd.append("store_name", form.store_name || "");
      fd.append("phone_number", form.phone_number || "");
      fd.append("address", form.address || "");
      fd.append("license_number", form.license_number || "");
      fd.append("note", form.note || "");
      fd.append("printer_type", form.printer_type || "a4");
      fd.append("thermal_template", form.thermal_template || "standard");
      fd.append("a4_template", form.a4_template || "standard");
      fd.append("navigation_style", form.navigation_style || "sidebar");
      fd.append("sale_system", form.sale_system || "retail_wholesale");
      fd.append("shop_type", form.shop_type || "pharmacy");
      fd.append("currency_code", form.currency_code || "PKR");
      fd.append("currency_symbol", form.currency_symbol || "Rs.");
      fd.append("currency_position", form.currency_position || "before");
      fd.append("currency_decimal_places", String(form.currency_decimal_places ?? 2));
      fd.append("smtp_enabled", form.smtp_enabled ? "1" : "0");
      fd.append("smtp_host", form.smtp_host || "");
      fd.append("smtp_port", String(form.smtp_port || 587));
      fd.append("smtp_username", form.smtp_username || "");
      fd.append("smtp_password", form.smtp_password || "");
      fd.append("smtp_encryption", form.smtp_encryption || "tls");
      fd.append("smtp_from_address", form.smtp_from_address || "");
      fd.append("smtp_from_name", form.smtp_from_name || "");
      fd.append("whatsapp_enabled", form.whatsapp_enabled ? "1" : "0");
      fd.append("whatsapp_provider", form.whatsapp_provider || "local_agent");
      fd.append("whatsapp_access_token", form.whatsapp_access_token || "");
      fd.append("whatsapp_phone_number_id", form.whatsapp_phone_number_id || "");
      fd.append(
        "whatsapp_business_account_id",
        form.whatsapp_business_account_id || ""
      );
      fd.append("whatsapp_api_version", form.whatsapp_api_version || "v21.0");
      fd.append("whatsapp_api_url", form.whatsapp_api_url || "");
      fd.append(
        "whatsapp_default_country_code",
        form.whatsapp_default_country_code || "92"
      );
      fd.append("whatsapp_template_name", form.whatsapp_template_name || "");
      fd.append(
        "whatsapp_template_language",
        form.whatsapp_template_language || "en_US"
      );
      fd.append(
        "whatsapp_auto_fallback",
        form.whatsapp_auto_fallback !== false ? "1" : "0"
      );
      fd.append("cube_ai_enabled", form.cube_ai_enabled ? "1" : "0");
      fd.append("cube_groq_enabled", form.cube_groq_enabled ? "1" : "0");
      fd.append("cube_groq_api_key", form.cube_groq_api_key || "");
      fd.append("cube_groq_model", form.cube_groq_model || "llama-3.3-70b-versatile");
      fd.append("cube_groq_daily_limit", String(form.cube_groq_daily_limit ?? 250));
      fd.append("cube_gemini_enabled", form.cube_gemini_enabled ? "1" : "0");
      fd.append("cube_gemini_api_key", form.cube_gemini_api_key || "");
      fd.append("cube_gemini_model", form.cube_gemini_model || "gemini-3.8-flash");
      fd.append("cube_gemini_daily_limit", String(form.cube_gemini_daily_limit ?? 250));

      if (files.length > 0 && files[0].file) {
        fd.append("logo", files[0].file);
      }

      const { data } = await axios.post("/api/settings", fd, {
        headers: { "Content-Type": "multipart/form-data" },
      });

      if (data?.cube_usage_summary) {
        setCubeUsageSummary(data.cube_usage_summary);
      }

      toast.success("Settings saved successfully");

      window.dispatchEvent(new CustomEvent("settingsChanged"));

      if (data.logo_url) {
        setFiles([{ source: data.logo_url, options: { type: "remote" } }]);
      } else {
        setFiles([]);
      }
    } catch (error) {
      if (error.response?.status === 422) {
        const errors = error.response.data.errors;
        Object.values(errors).forEach((messages) =>
          messages.forEach((msg) => toast.error(msg))
        );
      } else {
        const msg =
          error?.response?.data?.message ||
          error?.response?.data?.error ||
          "Failed to save settings";
        toast.error(msg);
      }
    } finally {
      setSaving(false);
    }
  };

  const fetchLicenseStatus = async () => {
    try {
      setLicenseLoading(true);
      const { data } = await axios.get("/api/license/status");
      setLicenseStatus(data);
    } catch {
      toast.error("Failed to load license status");
      setLicenseStatus({ valid: false, reason: "Unable to fetch status" });
    } finally {
      setLicenseLoading(false);
    }
  };

  const saveDisabled = !can.update || saving;

  if (permsLoading || loading) {
    return <PageSkeleton />;
  }
  if (!can.view) {
    return (
      <div className="settings-page">
        <p className="settings-hint">You do not have permission to view settings.</p>
      </div>
    );
  }

  const disableInputs = !can.update || saving;
  const activeTabMeta =
    ALL_TABS.find((t) => t.id === activeTab) || ALL_TABS[0];
  const ActiveSectionIcon = activeTabMeta.icon;

  return (
    <div className="settings-page">
      {/* ===== Top Workspace Header ===== */}
      <div className="settings-panel">
        <div className="settings-heading">
          <div className="flex items-center gap-3.5 sm:gap-4 min-w-0">
            <div className="settings-identity-icon">
              <CogIcon className="w-6 h-6" />
            </div>
            <div className="min-w-0">
              <h1 className="settings-title">System Settings &amp; Preferences</h1>
              <p className="settings-subtitle">
                <CogIcon className="w-3.5 h-3.5 shrink-0" />
                <span>
                  Manage store identity, sales operations, shared PDF designs, WhatsApp &amp; Email delivery, printing, and licensing.
                </span>
              </p>
            </div>
          </div>

          <div className="flex flex-wrap items-center gap-2.5">
            <button
              ref={saveBtnRef}
              type="button"
              onClick={handleSave}
              disabled={saveDisabled}
              className="products-action products-action-primary theme-btn-primary"
              title={can.update ? "Save (Alt+S)" : "You lack update permission"}
            >
              <ArrowDownOnSquareIcon className="w-4 h-4" />
              <span>
                {saving ? "Saving…" : can.update ? "Save Settings" : "Save Disabled"}
              </span>
            </button>
          </div>
        </div>
      </div>

      {/* ===== Mobile & Tablet Horizontal Category Bar (< lg) ===== */}
      <div className="settings-panel lg:hidden">
        <div
          className="settings-tabs"
          role="tablist"
          aria-label="Settings categories"
        >
          {ALL_TABS.map((item) => {
            const Icon = item.icon;
            const isActive = activeTab === item.id;
            return (
              <button
                key={item.id}
                type="button"
                role="tab"
                id={`settings-mobile-tab-${item.id}`}
                aria-selected={isActive}
                aria-controls={`settings-panel-${item.id}`}
                onClick={(e) => {
                  setActiveTab(item.id);
                  if (typeof window !== "undefined") {
                    window.history.replaceState(null, "", `#${item.id}`);
                  }
                  e.currentTarget.scrollIntoView({
                    behavior: "smooth",
                    inline: "center",
                    block: "nearest",
                  });
                }}
                className="settings-tab cursor-pointer"
                style={
                  isActive
                    ? {
                        backgroundColor: themeColors.primary,
                        color: primaryTextColor,
                        boxShadow: "none",
                      }
                    : undefined
                }
              >
                <Icon className="w-4 h-4 shrink-0" />
                <span>{item.label}</span>
              </button>
            );
          })}
        </div>
      </div>

      {/* ===== Two-Column Categorized Settings Workspace ===== */}
      <div className="grid grid-cols-1 lg:grid-cols-12 gap-5 lg:gap-6 items-start min-w-0">
        {/* Left Categorized Navigation Sidebar (Desktop lg+) */}
        <div
          className="hidden lg:block lg:col-span-4 xl:col-span-3 lg:sticky lg:top-4 min-w-0"
          role="tablist"
          aria-orientation="vertical"
          aria-label="Settings categories"
        >
          <div className="settings-panel p-3 space-y-4">
            {SETTING_GROUPS.map((group) => (
              <div key={group.groupLabel} className="space-y-1">
                <div className="px-3 py-1 text-[11px] font-bold uppercase tracking-wider text-gray-400 dark:text-slate-500">
                  {group.groupLabel}
                </div>
                {group.items.map((item) => {
                  const Icon = item.icon;
                  const isActive = activeTab === item.id;
                  return (
                    <button
                      key={item.id}
                      type="button"
                      role="tab"
                      id={`settings-tab-${item.id}`}
                      aria-selected={isActive}
                      aria-controls={`settings-panel-${item.id}`}
                      onClick={() => {
                        setActiveTab(item.id);
                        if (typeof window !== "undefined") {
                          window.history.replaceState(null, "", `#${item.id}`);
                        }
                      }}
                      className={`w-full flex items-start gap-3 px-3 py-2.5 rounded-xl text-left transition-all cursor-pointer ${
                        isActive
                          ? "shadow-sm"
                          : isDark
                          ? "hover:bg-slate-800/70 text-slate-300"
                          : "hover:bg-gray-100/80 text-gray-700"
                      }`}
                      style={
                        isActive
                          ? {
                              backgroundColor: themeColors.primary,
                              color: primaryTextColor,
                            }
                          : undefined
                      }
                    >
                      <Icon
                        className={`w-5 h-5 mt-0.5 shrink-0 ${
                          isActive
                            ? ""
                            : isDark
                            ? "text-slate-400"
                            : "text-gray-500"
                        }`}
                      />
                      <div className="min-w-0 flex-1">
                        <div className="text-sm font-semibold leading-tight truncate">
                          {item.label}
                        </div>
                        <div
                          className={`text-[11px] mt-0.5 truncate ${
                            isActive
                              ? "opacity-85"
                              : isDark
                              ? "text-slate-400"
                              : "text-gray-500"
                          }`}
                        >
                          {item.subtitle}
                        </div>
                      </div>
                    </button>
                  );
                })}
              </div>
            ))}
          </div>
        </div>

        {/* Right Content Workspace */}
        <div
          id={`settings-panel-${activeTab}`}
          role="tabpanel"
          aria-labelledby={`settings-tab-${activeTab}`}
          className="lg:col-span-8 xl:col-span-9 settings-main-col space-y-5"
        >
          {/* Active Section Header Bar */}
          <div
            className={`px-4 sm:px-5 py-3.5 rounded-2xl border flex items-center justify-between gap-3 sm:gap-4 min-w-0 ${
              isDark
                ? "bg-slate-800/70 border-slate-700/80 text-slate-100"
                : "bg-white/90 border-gray-200/80 text-gray-900"
            }`}
          >
            <div className="flex items-center gap-3 min-w-0">
              <div
                className="p-2 rounded-xl shrink-0"
                style={{
                  backgroundColor: isDark
                    ? "rgba(59,130,246,0.16)"
                    : themeColors.primaryLight,
                  color: themeColors.primary,
                }}
              >
                <ActiveSectionIcon className="w-5 h-5 shrink-0" />
              </div>
              <div className="min-w-0">
                <h2 className="text-sm sm:text-base font-bold leading-tight truncate">
                  {activeTabMeta.label}
                </h2>
                <p className="text-xs text-gray-500 dark:text-slate-400 line-clamp-2 sm:truncate">
                  {activeTabMeta.subtitle}
                </p>
              </div>
            </div>
          </div>

          {activeTab === "general" && (
            <GeneralSetting
              form={form}
              setForm={setForm}
              handleChange={handleChange}
              disableInputs={disableInputs}
              files={files}
              setFiles={setFiles}
              storeNameRef={storeNameRef}
              phoneRef={phoneRef}
              addressRef={addressRef}
              licenseRef={licenseRef}
              themeColors={themeColors}
              primaryTextColor={primaryTextColor}
            />
          )}

          {activeTab === "sale" && (
            <SaleSystemSetting
              form={form}
              handleSaleSystemChange={handleSaleSystemChange}
              handleShopTypeChange={handleShopTypeChange}
              disableInputs={disableInputs}
              themeColors={themeColors}
            />
          )}

          {activeTab === "navigation" && (
            <ThemeSetting
              form={form}
              setForm={setForm}
              disableInputs={disableInputs}
            />
          )}

          {activeTab === "sharing" && (
            <DocumentSharingSetting
              key={sharingSubTab}
              form={form}
              setForm={setForm}
              handleChange={handleChange}
              disableInputs={disableInputs}
              initialSubTab={sharingSubTab}
            />
          )}

          {activeTab === "printer" && (
            <PrinterSetting
              form={form}
              handleChange={handleChange}
              disableInputs={disableInputs}
              saving={saving}
              handleSave={handleSave}
              themeColors={themeColors}
              emeraldTextColor={emeraldTextColor}
            />
          )}

          {activeTab === "cube" && (
            <CubeAiSetting
              form={form}
              setForm={setForm}
              handleChange={handleChange}
              disableInputs={disableInputs}
              usageSummary={cubeUsageSummary}
            />
          )}

          {activeTab === "license" && (
            <LicenseSetting
              licenseStatus={licenseStatus}
              licenseLoading={licenseLoading}
              fetchLicenseStatus={fetchLicenseStatus}
              themeColors={themeColors}
              primaryTextColor={primaryTextColor}
            />
          )}

          {/* Bottom Save Bar */}
          {activeTab !== "license" && (
            <div className="settings-panel">
              <div className="settings-body">
                <div className="settings-actions settings-actions-between">
                  <span className="settings-hint">
                    Keyboard shortcut: <span className="people-shortcut">Alt+S</span> to save settings
                  </span>
                  <button
                    type="button"
                    onClick={handleSave}
                    disabled={saveDisabled}
                    className="products-action products-action-primary theme-btn-primary"
                    title={can.update ? "Save (Alt+S)" : "You lack update permission"}
                  >
                    <ArrowDownOnSquareIcon className="w-4 h-4" />
                    <span>{saving ? "Saving…" : "Save Settings"}</span>
                  </button>
                </div>
              </div>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
