import React, { useEffect, useMemo, useRef, useState } from "react";
import { useNavigate } from "react-router-dom";
import axios from "axios";
import toast from "react-hot-toast";

import { registerPlugin } from "react-filepond";
import FilePondPluginImagePreview from "filepond-plugin-image-preview";
import FilePondPluginFileValidateType from "filepond-plugin-file-validate-type";
import "filepond/dist/filepond.min.css";
import "filepond-plugin-image-preview/dist/filepond-plugin-image-preview.css";

import { useAuth } from "@/context/AuthContext.jsx";
import { useTheme } from "@/context/ThemeContext.jsx";
import { useSaleSystem } from "@/context/SaleSystemContext.jsx";
import PageSkeleton from "@/components/PageSkeleton.jsx";

import GeneralSetting from "@/components/settings/GeneralSetting.jsx";
import SaleSystemSetting from "@/components/settings/SaleSystemSetting.jsx";
import ThemeSetting from "@/components/settings/ThemeSetting.jsx";
import PrinterSetting from "@/components/settings/PrinterSetting.jsx";
import DocumentSharingSetting, {
  DEFAULT_CLOSING_NOTE_EN,
  DEFAULT_CLOSING_NOTE_UR,
  DEFAULT_WHATSAPP_MESSAGE_EN,
  DEFAULT_WHATSAPP_MESSAGE_UR,
} from "@/components/settings/DocumentSharingSetting.jsx";
import CubeAiSetting from "@/components/settings/CubeAiSetting.jsx";

import {
  SparklesIcon,
  BuildingStorefrontIcon,
  ShoppingCartIcon,
  SwatchIcon,
  PrinterIcon,
  ShareIcon,
  ShieldCheckIcon,
  RocketLaunchIcon,
  CheckCircleIcon,
  ArrowRightIcon,
  ArrowLeftIcon,
  ServerStackIcon,
} from "@heroicons/react/24/solid";

registerPlugin(FilePondPluginImagePreview, FilePondPluginFileValidateType);

const getContrastText = (hexColor) => {
  hexColor = (hexColor || "#3b82f6").replace("#", "");
  const r = parseInt(hexColor.substring(0, 2), 16) || 0;
  const g = parseInt(hexColor.substring(2, 4), 16) || 0;
  const b = parseInt(hexColor.substring(4, 6), 16) || 0;
  const luminance = (0.299 * r + 0.587 * g + 0.114 * b) / 255;
  return luminance > 0.5 ? "#1f2937" : "#ffffff";
};

const GENIE_STEPS = [
  {
    id: "store",
    stepNumber: 1,
    title: "Store Identity & Profile",
    subtitle: "Store name, contact details, trade license & brand logo",
    icon: BuildingStorefrontIcon,
  },
  {
    id: "sale",
    stepNumber: 2,
    title: "Industry, Sales & Currency",
    subtitle: "Pharmacy vs General Store, Retail/Wholesale & currency format",
    icon: ShoppingCartIcon,
  },
  {
    id: "appearance",
    stepNumber: 3,
    title: "Appearance & Layout",
    subtitle: "Sidebar vs Topbar navigation, theme colors & dark mode",
    icon: SwatchIcon,
  },
  {
    id: "printer",
    stepNumber: 4,
    title: "Printer & Receipt Design",
    subtitle: "Thermal POS (58mm/80mm) vs A4 templates & invoice footer",
    icon: PrinterIcon,
  },
  {
    id: "sharing",
    stepNumber: 5,
    title: "WhatsApp, Email & PDF Sharing",
    subtitle: "Built-in WhatsApp QR link, SMTP email & shared PDF layout",
    icon: ShareIcon,
  },
  {
    id: "intelligence",
    stepNumber: 6,
    title: "Cube AI & Automated Backups",
    subtitle: "AI Co-Pilot keys, daily backup folder & default ERP accounts",
    icon: SparklesIcon,
  },
  {
    id: "launch",
    stepNumber: 7,
    title: "Review & Launch Workspace",
    subtitle: "Verify your store configuration and launch Karobar ERP",
    icon: RocketLaunchIcon,
  },
];

export default function SetupWizard() {
  const navigate = useNavigate();
  const { user } = useAuth();
  const { isDark, theme } = useTheme();
  const { refreshSaleSystem } = useSaleSystem();

  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [stepIndex, setStepIndex] = useState(0);
  const [sharingSubTab, setSharingSubTab] = useState("pdf_design");

  const [licenseInfo, setLicenseInfo] = useState(null);
  const [cubeUsageSummary, setCubeUsageSummary] = useState(null);
  const [files, setFiles] = useState([]);

  const storeNameRef = useRef(null);
  const phoneRef = useRef(null);
  const addressRef = useRef(null);
  const licenseRef = useRef(null);

  const [form, setForm] = useState({
    store_name: "",
    phone_number: "",
    address: "",
    license_number: "",
    note: "Thank you for your business!",
    note_en: DEFAULT_CLOSING_NOTE_EN,
    note_ur: DEFAULT_CLOSING_NOTE_UR,
    whatsapp_message_en: DEFAULT_WHATSAPP_MESSAGE_EN,
    whatsapp_message_ur: DEFAULT_WHATSAPP_MESSAGE_UR,
    printer_type: "thermal",
    thermal_template: "standard",
    a4_template: "standard",
    share_paper_size: "a4",
    share_show_logo: true,
    logo_url: null,
    remove_logo: false,
    navigation_style: "sidebar",
    sale_system: "retail_wholesale",
    shop_type: "pharmacy",
    currency_code: "PKR",
    currency_symbol: "Rs.",
    currency_position: "before",
    currency_decimal_places: 2,
    expiry_warning_days: 90,
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
    // Setup Wizard specific bootstrap options
    backup_is_automated: true,
    backup_frequency: "daily",
    backup_time_of_day: "02:00",
    custom_backup_path: "",
    seed_default_accounts: true,
    seed_default_locations: true,
  });

  const themeColors = useMemo(() => {
    if (!theme) {
      return {
        primary: "#2563eb",
        primaryHover: "#1d4ed8",
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
      primary: theme.primary_color || "#2563eb",
      primaryHover: theme.primary_hover || "#1d4ed8",
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
    fetchWizardState();
  }, []);

  const fetchWizardState = async () => {
    try {
      setLoading(true);
      const { data } = await axios.get("/api/setup/state");
      const s = data?.setting || {};
      const lic = data?.license || {};
      const bkp = data?.backup_schedule || {};

      setLicenseInfo(lic);

      const licensedName = lic?.payload?.name || "";
      const initialStoreName =
        s.store_name && s.store_name !== "Karobar App"
          ? s.store_name
          : licensedName;

      setForm((prev) => ({
        ...prev,
        store_name: initialStoreName || "",
        phone_number: s.phone_number || "",
        address: s.address || "",
        license_number: s.license_number || lic?.payload?.lid || "",
        note: s.note ?? "Thank you for your business!",
        note_en: s.note_en ?? DEFAULT_CLOSING_NOTE_EN,
        note_ur: s.note_ur ?? DEFAULT_CLOSING_NOTE_UR,
        whatsapp_message_en: s.whatsapp_message_en ?? DEFAULT_WHATSAPP_MESSAGE_EN,
        whatsapp_message_ur: s.whatsapp_message_ur ?? DEFAULT_WHATSAPP_MESSAGE_UR,
        printer_type: s.printer_type || "thermal",
        thermal_template: s.thermal_template || "standard",
        a4_template: s.a4_template || "standard",
        share_paper_size: s.share_paper_size || "a4",
        share_show_logo:
          s.share_show_logo !== undefined && s.share_show_logo !== null
            ? Boolean(s.share_show_logo)
            : true,
        logo_url: s.logo_url || null,
        remove_logo: false,
        navigation_style: s.navigation_style || "sidebar",
        sale_system: s.sale_system || "retail_wholesale",
        shop_type: s.shop_type || "pharmacy",
        currency_code: s.currency_code || "PKR",
        currency_symbol: s.currency_symbol || "Rs.",
        currency_position: s.currency_position || "before",
        currency_decimal_places:
          s.currency_decimal_places !== undefined
            ? Number(s.currency_decimal_places)
            : 2,
        expiry_warning_days:
          s.expiry_warning_days !== undefined ? Number(s.expiry_warning_days) : 90,
        smtp_enabled: Boolean(s.smtp_enabled),
        smtp_host: s.smtp_host || "",
        smtp_port: s.smtp_port ? Number(s.smtp_port) : 587,
        smtp_username: s.smtp_username || "",
        smtp_password: s.smtp_password || "",
        smtp_encryption: s.smtp_encryption || "tls",
        smtp_from_address: s.smtp_from_address || "",
        smtp_from_name: s.smtp_from_name || "",
        whatsapp_enabled: Boolean(s.whatsapp_enabled),
        whatsapp_provider: s.whatsapp_provider || "local_agent",
        whatsapp_access_token: s.whatsapp_access_token || "",
        whatsapp_phone_number_id: s.whatsapp_phone_number_id || "",
        whatsapp_business_account_id: s.whatsapp_business_account_id || "",
        whatsapp_api_version: s.whatsapp_api_version || "v21.0",
        whatsapp_api_url: s.whatsapp_api_url || "",
        whatsapp_default_country_code: s.whatsapp_default_country_code || "92",
        whatsapp_template_name: s.whatsapp_template_name || "",
        whatsapp_template_language: s.whatsapp_template_language || "en_US",
        whatsapp_auto_fallback:
          s.whatsapp_auto_fallback !== undefined
            ? Boolean(s.whatsapp_auto_fallback)
            : true,
        cube_ai_enabled:
          s.cube_ai_enabled !== undefined ? Boolean(s.cube_ai_enabled) : true,
        cube_groq_enabled:
          s.cube_groq_enabled !== undefined ? Boolean(s.cube_groq_enabled) : true,
        cube_groq_api_key: s.cube_groq_api_key || "",
        cube_groq_model: s.cube_groq_model || "llama-3.3-70b-versatile",
        cube_groq_daily_limit: s.cube_groq_daily_limit ?? 250,
        cube_gemini_enabled:
          s.cube_gemini_enabled !== undefined
            ? Boolean(s.cube_gemini_enabled)
            : true,
        cube_gemini_api_key: s.cube_gemini_api_key || "",
        cube_gemini_model: s.cube_gemini_model || "gemini-3.8-flash",
        cube_gemini_daily_limit: s.cube_gemini_daily_limit ?? 250,
        backup_is_automated:
          bkp.is_automated !== undefined ? Boolean(bkp.is_automated) : true,
        backup_frequency: bkp.frequency || "daily",
        backup_time_of_day: bkp.time_of_day || "02:00",
        custom_backup_path: bkp.custom_backup_path || "",
      }));

      if (s.cube_usage_summary) {
        setCubeUsageSummary(s.cube_usage_summary);
      }

      if (s.logo_url) {
        setFiles([{ source: s.logo_url, options: { type: "remote" } }]);
      }
    } catch (err) {
      toast.error("Could not load initial setup state.");
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

  const buildFormData = (markCompleted = false) => {
    const fd = new FormData();
    fd.append("store_name", (form.store_name || "").trim() || "My Karobar Store");
    fd.append("phone_number", form.phone_number || "");
    fd.append("address", form.address || "");
    fd.append("license_number", form.license_number || "");
    fd.append("note", form.note ?? "");
    fd.append("note_en", form.note_en ?? "");
    fd.append("note_ur", form.note_ur ?? "");
    fd.append("whatsapp_message_en", form.whatsapp_message_en ?? "");
    fd.append("whatsapp_message_ur", form.whatsapp_message_ur ?? "");
    fd.append("printer_type", form.printer_type || "thermal");
    fd.append("thermal_template", form.thermal_template || "standard");
    fd.append("a4_template", form.a4_template || "standard");
    fd.append("share_paper_size", form.share_paper_size || "a4");
    fd.append("share_show_logo", form.share_show_logo !== false ? "1" : "0");
    fd.append("navigation_style", form.navigation_style || "sidebar");
    fd.append("sale_system", form.sale_system || "retail_wholesale");
    fd.append("shop_type", form.shop_type || "pharmacy");
    fd.append("currency_code", form.currency_code || "PKR");
    fd.append("currency_symbol", form.currency_symbol || "Rs.");
    fd.append("currency_position", form.currency_position || "before");
    fd.append("currency_decimal_places", String(form.currency_decimal_places ?? 2));
    fd.append("expiry_warning_days", String(form.expiry_warning_days ?? 90));
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
    fd.append("whatsapp_business_account_id", form.whatsapp_business_account_id || "");
    fd.append("whatsapp_api_version", form.whatsapp_api_version || "v21.0");
    fd.append("whatsapp_api_url", form.whatsapp_api_url || "");
    fd.append("whatsapp_default_country_code", form.whatsapp_default_country_code || "92");
    fd.append("whatsapp_template_name", form.whatsapp_template_name || "");
    fd.append("whatsapp_template_language", form.whatsapp_template_language || "en_US");
    fd.append("whatsapp_auto_fallback", form.whatsapp_auto_fallback !== false ? "1" : "0");
    fd.append("cube_ai_enabled", form.cube_ai_enabled ? "1" : "0");
    fd.append("cube_groq_enabled", form.cube_groq_enabled ? "1" : "0");
    fd.append("cube_groq_api_key", form.cube_groq_api_key || "");
    fd.append("cube_groq_model", form.cube_groq_model || "llama-3.3-70b-versatile");
    fd.append("cube_groq_daily_limit", String(form.cube_groq_daily_limit ?? 250));
    fd.append("cube_gemini_enabled", form.cube_gemini_enabled ? "1" : "0");
    fd.append("cube_gemini_api_key", form.cube_gemini_api_key || "");
    fd.append("cube_gemini_model", form.cube_gemini_model || "gemini-3.8-flash");
    fd.append("cube_gemini_daily_limit", String(form.cube_gemini_daily_limit ?? 250));

    fd.append("backup_is_automated", form.backup_is_automated ? "1" : "0");
    fd.append("backup_frequency", form.backup_frequency || "daily");
    fd.append("backup_time_of_day", form.backup_time_of_day || "02:00");
    fd.append("custom_backup_path", form.custom_backup_path || "");
    fd.append("seed_default_accounts", form.seed_default_accounts ? "1" : "0");
    fd.append("seed_default_locations", form.seed_default_locations ? "1" : "0");
    fd.append("is_setup_completed", markCompleted ? "1" : "0");

    if (files.length > 0 && files[0].file) {
      fd.append("logo", files[0].file);
    } else if (form.remove_logo) {
      fd.append("remove_logo", "1");
    }

    return fd;
  };

  const handleSaveDraft = async () => {
    try {
      setSaving(true);
      const fd = buildFormData(false);
      await axios.post("/api/settings", fd, {
        headers: { "Content-Type": "multipart/form-data" },
      });
      toast.success("Progress saved");
    } catch (error) {
      toast.error(error?.response?.data?.message || "Could not save progress");
    } finally {
      setSaving(false);
    }
  };

  const handleNextStep = () => {
    if (stepIndex === 0 && (!form.store_name || form.store_name.trim().length < 2)) {
      toast.error("Please enter your Store / Business Name to continue.");
      storeNameRef.current?.focus();
      return;
    }
    if (stepIndex < GENIE_STEPS.length - 1) {
      setStepIndex((i) => i + 1);
      window.scrollTo({ top: 0, behavior: "smooth" });
    }
  };

  const handlePrevStep = () => {
    if (stepIndex > 0) {
      setStepIndex((i) => i - 1);
      window.scrollTo({ top: 0, behavior: "smooth" });
    }
  };

  const handleCompleteSetup = async () => {
    if (!form.store_name || form.store_name.trim().length < 2) {
      toast.error("Please enter your Store Name in Step 1 before finishing.");
      setStepIndex(0);
      return;
    }

    try {
      setSaving(true);
      const fd = buildFormData(true);
      await axios.post("/api/setup/complete", fd, {
        headers: { "Content-Type": "multipart/form-data" },
      });

      toast.success("Welcome to Karobar ERP! Your store is ready.");
      window.dispatchEvent(new CustomEvent("settingsChanged"));
      await refreshSaleSystem();
      navigate("/dashboard", { replace: true });
    } catch (error) {
      const msg =
        error?.response?.data?.message ||
        "Failed to finalize store setup. Please check your inputs.";
      toast.error(msg);
    } finally {
      setSaving(false);
    }
  };

  if (loading) {
    return <PageSkeleton fullScreen />;
  }

  const currentStep = GENIE_STEPS[stepIndex] || GENIE_STEPS[0];
  const CurrentStepIcon = currentStep.icon;

  return (
    <div
      className={`min-h-screen flex flex-col ${
        isDark ? "bg-slate-950 text-slate-100" : "bg-slate-50 text-gray-900"
      }`}
    >
      {/* Top Genie Header Bar */}
      <header
        className={`sticky top-0 z-30 border-b backdrop-blur-md px-4 sm:px-8 py-4 ${
          isDark
            ? "bg-slate-900/90 border-slate-800"
            : "bg-white/90 border-gray-200"
        }`}
      >
        <div className="max-w-7xl mx-auto flex flex-wrap items-center justify-between gap-4">
          <div className="flex items-center gap-3.5">
            <div
              className="w-11 h-11 rounded-2xl flex items-center justify-center shadow-md"
              style={{
                backgroundColor: themeColors.primary,
                color: primaryTextColor,
              }}
            >
              <SparklesIcon className="w-6 h-6" />
            </div>
            <div>
              <div className="flex items-center gap-2">
                <h1 className="text-lg sm:text-xl font-bold tracking-tight">
                  Karobar Setup Genie
                </h1>
                <span className="text-[11px] font-semibold uppercase tracking-wider px-2.5 py-0.5 rounded-full bg-emerald-500/15 text-emerald-600 dark:text-emerald-400 border border-emerald-500/30">
                  First-Time Setup
                </span>
              </div>
              <p className="text-xs text-gray-500 dark:text-slate-400">
                Step {stepIndex + 1} of {GENIE_STEPS.length}: {currentStep.title}
              </p>
            </div>
          </div>

          {/* Hardware-Bound License & Admin Badge */}
          <div className="flex flex-wrap items-center gap-2.5 text-xs">
            {licenseInfo?.machine_id && (
              <div
                className={`flex items-center gap-1.5 px-3 py-1.5 rounded-xl border ${
                  isDark
                    ? "bg-slate-800/80 border-slate-700 text-slate-300"
                    : "bg-gray-100 border-gray-200 text-gray-700"
                }`}
              >
                <ShieldCheckIcon className="w-4 h-4 text-emerald-500 shrink-0" />
                <span>
                  Machine Locked:{" "}
                  <strong className="font-mono">{licenseInfo.machine_id}</strong>
                </span>
              </div>
            )}
            {user?.email && (
              <div
                className={`px-3 py-1.5 rounded-xl border ${
                  isDark
                    ? "bg-slate-800/80 border-slate-700 text-slate-300"
                    : "bg-gray-100 border-gray-200 text-gray-700"
                }`}
              >
                Admin: <strong>{user.email}</strong>
              </div>
            )}
          </div>
        </div>

        {/* Step Progress Strip */}
        <div className="max-w-7xl mx-auto mt-4 grid grid-cols-2 sm:grid-cols-4 lg:grid-cols-7 gap-2">
          {GENIE_STEPS.map((s, idx) => {
            const Icon = s.icon;
            const isCurrent = idx === stepIndex;
            const isDone = idx < stepIndex;
            return (
              <button
                key={s.id}
                type="button"
                onClick={() => {
                  if (idx > 0 && (!form.store_name || form.store_name.trim().length < 2)) {
                    toast.error("Please enter your Store Name in Step 1 first.");
                    setStepIndex(0);
                    return;
                  }
                  setStepIndex(idx);
                }}
                className={`flex items-center gap-2 px-3 py-2 rounded-xl text-left text-xs font-medium border transition-all cursor-pointer ${
                  isCurrent
                    ? "shadow-sm"
                    : isDone
                    ? isDark
                      ? "bg-emerald-950/30 border-emerald-800/60 text-emerald-300"
                      : "bg-emerald-50 border-emerald-200 text-emerald-800"
                    : isDark
                    ? "bg-slate-800/50 border-slate-800 text-slate-400 hover:bg-slate-800"
                    : "bg-gray-50 border-gray-200/80 text-gray-600 hover:bg-gray-100"
                }`}
                style={
                  isCurrent
                    ? {
                        backgroundColor: themeColors.primary,
                        borderColor: themeColors.primary,
                        color: primaryTextColor,
                      }
                    : undefined
                }
              >
                {isDone ? (
                  <CheckCircleIcon className="w-4 h-4 text-emerald-500 shrink-0" />
                ) : (
                  <Icon className="w-4 h-4 shrink-0" />
                )}
                <span className="truncate">
                  {s.stepNumber}. {s.title.split("&")[0].trim()}
                </span>
              </button>
            );
          })}
        </div>
      </header>

      {/* Main Step Workspace */}
      <main className="flex-1 max-w-6xl w-full mx-auto px-4 sm:px-8 py-6 space-y-6">
        {/* Step Banner */}
        <div
          className={`p-5 rounded-2xl border flex flex-wrap items-center justify-between gap-4 ${
            isDark
              ? "bg-slate-900/90 border-slate-800"
              : "bg-white border-gray-200 shadow-xs"
          }`}
        >
          <div className="flex items-center gap-3.5">
            <div
              className="p-3 rounded-2xl"
              style={{
                backgroundColor: isDark
                  ? "rgba(37,99,235,0.18)"
                  : themeColors.primaryLight,
                color: themeColors.primary,
              }}
            >
              <CurrentStepIcon className="w-6 h-6" />
            </div>
            <div>
              <h2 className="text-base sm:text-lg font-bold">
                Step {currentStep.stepNumber}: {currentStep.title}
              </h2>
              <p className="text-xs sm:text-sm text-gray-500 dark:text-slate-400">
                {currentStep.subtitle}
              </p>
            </div>
          </div>

          <div className="flex items-center gap-2">
            {stepIndex > 0 && (
              <button
                type="button"
                onClick={handlePrevStep}
                disabled={saving}
                className="px-3.5 py-2 rounded-xl text-xs font-semibold border border-gray-300 dark:border-slate-700 hover:bg-gray-100 dark:hover:bg-slate-800 flex items-center gap-1.5 cursor-pointer"
              >
                <ArrowLeftIcon className="w-4 h-4" />
                <span>Previous</span>
              </button>
            )}
            {stepIndex < GENIE_STEPS.length - 1 ? (
              <button
                type="button"
                onClick={handleNextStep}
                disabled={saving}
                className="px-4 py-2 rounded-xl text-xs font-semibold flex items-center gap-1.5 shadow-xs cursor-pointer"
                style={{
                  backgroundColor: themeColors.primary,
                  color: primaryTextColor,
                }}
              >
                <span>Continue</span>
                <ArrowRightIcon className="w-4 h-4" />
              </button>
            ) : (
              <button
                type="button"
                onClick={handleCompleteSetup}
                disabled={saving}
                className="px-5 py-2.5 rounded-xl text-xs font-bold flex items-center gap-2 shadow-md cursor-pointer"
                style={{
                  backgroundColor: themeColors.emerald,
                  color: emeraldTextColor,
                }}
              >
                <RocketLaunchIcon className="w-4 h-4" />
                <span>{saving ? "Launching Workspace…" : "Complete Setup & Launch"}</span>
              </button>
            )}
          </div>
        </div>

        {/* Step 1: Store Profile */}
        {currentStep.id === "store" && (
          <GeneralSetting
            form={form}
            setForm={setForm}
            handleChange={handleChange}
            disableInputs={saving}
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

        {/* Step 2: Industry, Sale Mode & Currency */}
        {currentStep.id === "sale" && (
          <SaleSystemSetting
            form={form}
            handleSaleSystemChange={handleSaleSystemChange}
            handleShopTypeChange={handleShopTypeChange}
            disableInputs={saving}
            themeColors={themeColors}
          />
        )}

        {/* Step 3: Appearance & Navigation */}
        {currentStep.id === "appearance" && (
          <ThemeSetting
            form={form}
            setForm={setForm}
            disableInputs={saving}
          />
        )}

        {/* Step 4: Printer & Receipt Templates */}
        {currentStep.id === "printer" && (
          <PrinterSetting
            form={form}
            handleChange={handleChange}
            disableInputs={saving}
            saving={saving}
            handleSave={handleSaveDraft}
            themeColors={themeColors}
            emeraldTextColor={emeraldTextColor}
          />
        )}

        {/* Step 5: Document Sharing, WhatsApp & Email */}
        {currentStep.id === "sharing" && (
          <DocumentSharingSetting
            key={sharingSubTab}
            form={form}
            setForm={setForm}
            handleChange={handleChange}
            handleSave={handleSaveDraft}
            saving={saving}
            disableInputs={saving}
            initialSubTab={sharingSubTab}
            files={files}
            setFiles={setFiles}
          />
        )}

        {/* Step 6: Cube AI Co-Pilot, Automated Backups & Default Seeding */}
        {currentStep.id === "intelligence" && (
          <div className="space-y-6">
            <CubeAiSetting
              form={form}
              setForm={setForm}
              handleChange={handleChange}
              disableInputs={saving}
              usageSummary={cubeUsageSummary}
            />

            {/* Automated Backups & ERP Bootstrap Card */}
            <div
              className={`p-5 rounded-2xl border space-y-4 ${
                isDark
                  ? "bg-slate-900/90 border-slate-800"
                  : "bg-white border-gray-200"
              }`}
            >
              <div className="flex items-center gap-3">
                <ServerStackIcon className="w-5 h-5 text-blue-500" />
                <div>
                  <h3 className="text-sm font-bold">
                    Automated Daily Backups &amp; Workspace Bootstrap
                  </h3>
                  <p className="text-xs text-gray-500 dark:text-slate-400">
                    Protect your local SQLite database automatically and initialize default accounts &amp; storage locations.
                  </p>
                </div>
              </div>

              <div className="grid grid-cols-1 md:grid-cols-2 gap-4 pt-2">
                <label className="flex items-start gap-3 p-3.5 rounded-xl border border-gray-200 dark:border-slate-800 cursor-pointer">
                  <input
                    type="checkbox"
                    checked={form.backup_is_automated}
                    onChange={(e) =>
                      setForm((s) => ({ ...s, backup_is_automated: e.target.checked }))
                    }
                    className="mt-1 rounded"
                  />
                  <div className="text-xs">
                    <div className="font-semibold">Enable Automated Daily Backups</div>
                    <div className="text-gray-500 dark:text-slate-400 mt-0.5">
                      Automatically snapshots your database and uploads every day at {form.backup_time_of_day}.
                    </div>
                  </div>
                </label>

                <div>
                  <label className="block text-xs font-semibold mb-1">
                    Custom Backup Mirror Folder (Optional — e.g. D:\KarobarBackups)
                  </label>
                  <div className="flex gap-2">
                    <input
                      type="text"
                      name="custom_backup_path"
                      value={form.custom_backup_path}
                      onChange={handleChange}
                      placeholder="Leave blank for default storage/app/backups"
                      className="flex-1 rounded-xl border border-gray-300 dark:border-slate-700 bg-transparent px-3 py-2 text-xs"
                    />
                  </div>
                </div>

                <label className="flex items-start gap-3 p-3.5 rounded-xl border border-gray-200 dark:border-slate-800 cursor-pointer">
                  <input
                    type="checkbox"
                    checked={form.seed_default_accounts}
                    onChange={(e) =>
                      setForm((s) => ({ ...s, seed_default_accounts: e.target.checked }))
                    }
                    className="mt-1 rounded"
                  />
                  <div className="text-xs">
                    <div className="font-semibold">
                      Initialize Default Cash Drawer &amp; Financial Account
                    </div>
                    <div className="text-gray-500 dark:text-slate-400 mt-0.5">
                      Creates the primary &ldquo;Cash in Hand (Drawer)&rdquo; account ready for POS sales.
                    </div>
                  </div>
                </label>

                <label className="flex items-start gap-3 p-3.5 rounded-xl border border-gray-200 dark:border-slate-800 cursor-pointer">
                  <input
                    type="checkbox"
                    checked={form.seed_default_locations}
                    onChange={(e) =>
                      setForm((s) => ({ ...s, seed_default_locations: e.target.checked }))
                    }
                    className="mt-1 rounded"
                  />
                  <div className="text-xs">
                    <div className="font-semibold">
                      Initialize Default Storage Locations
                    </div>
                    <div className="text-gray-500 dark:text-slate-400 mt-0.5">
                      Seeds &ldquo;Shop Counter&rdquo;, &ldquo;Main Godown&rdquo;, and &ldquo;Cold Fridge&rdquo; locations.
                    </div>
                  </div>
                </label>
              </div>
            </div>
          </div>
        )}

        {/* Step 7: Final Review & Launch */}
        {currentStep.id === "launch" && (
          <div
            className={`p-6 sm:p-8 rounded-2xl border space-y-6 ${
              isDark
                ? "bg-slate-900/90 border-slate-800"
                : "bg-white border-gray-200"
            }`}
          >
            <div className="flex items-center gap-4">
              <div
                className="w-12 h-12 rounded-2xl flex items-center justify-center"
                style={{
                  backgroundColor: themeColors.emerald,
                  color: emeraldTextColor,
                }}
              >
                <RocketLaunchIcon className="w-6 h-6" />
              </div>
              <div>
                <h3 className="text-lg font-bold">
                  Your Karobar ERP Workspace is Ready to Launch!
                </h3>
                <p className="text-xs sm:text-sm text-gray-500 dark:text-slate-400">
                  Review your store configuration below. You can modify any of these anytime in System Settings.
                </p>
              </div>
            </div>

            <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4 text-xs">
              <div className="p-4 rounded-xl border border-gray-200 dark:border-slate-800 space-y-1.5">
                <div className="font-bold text-gray-400 uppercase tracking-wider text-[10px]">
                  Store Profile
                </div>
                <div className="text-sm font-bold">{form.store_name || "—"}</div>
                <div>Phone: {form.phone_number || "Not set"}</div>
                <div>License #: {form.license_number || "Not set"}</div>
                <div className="truncate">Address: {form.address || "Not set"}</div>
              </div>

              <div className="p-4 rounded-xl border border-gray-200 dark:border-slate-800 space-y-1.5">
                <div className="font-bold text-gray-400 uppercase tracking-wider text-[10px]">
                  Industry &amp; Currency
                </div>
                <div className="text-sm font-bold capitalize">
                  {form.shop_type === "pharmacy" ? "Pharmacy / Medical Store" : "General Store / Retail"}
                </div>
                <div>
                  Sale Mode:{" "}
                  <strong>
                    {form.sale_system === "retail" ? "Retail Only" : "Retail + Wholesale"}
                  </strong>
                </div>
                <div>
                  Currency: <strong>{form.currency_code} ({form.currency_symbol})</strong>
                </div>
              </div>

              <div className="p-4 rounded-xl border border-gray-200 dark:border-slate-800 space-y-1.5">
                <div className="font-bold text-gray-400 uppercase tracking-wider text-[10px]">
                  Printing &amp; Layout
                </div>
                <div className="text-sm font-bold uppercase">
                  {form.printer_type} Printer ({form.printer_type === "thermal" ? form.thermal_template : form.a4_template})
                </div>
                <div className="capitalize">Navigation: {form.navigation_style}</div>
                <div>
                  Automated Backups:{" "}
                  <strong>{form.backup_is_automated ? `Daily (${form.backup_time_of_day})` : "Manual"}</strong>
                </div>
              </div>
            </div>

            <div className="pt-2 flex flex-wrap items-center justify-between gap-4 border-t border-gray-200 dark:border-slate-800">
              <div className="text-xs text-gray-500 dark:text-slate-400">
                By launching, your store settings, default financial accounts, and storage locations will be initialized.
              </div>
              <button
                type="button"
                onClick={handleCompleteSetup}
                disabled={saving}
                className="px-6 py-3 rounded-xl text-sm font-bold flex items-center gap-2 shadow-lg cursor-pointer"
                style={{
                  backgroundColor: themeColors.emerald,
                  color: emeraldTextColor,
                }}
              >
                <RocketLaunchIcon className="w-5 h-5" />
                <span>
                  {saving ? "Initializing Workspace…" : "Complete Setup & Launch Karobar ERP"}
                </span>
              </button>
            </div>
          </div>
        )}
      </main>

      {/* Bottom Sticky Wizard Footer */}
      <footer
        className={`border-t px-4 sm:px-8 py-4 ${
          isDark
            ? "bg-slate-900/90 border-slate-800"
            : "bg-white border-gray-200"
        }`}
      >
        <div className="max-w-6xl mx-auto flex items-center justify-between gap-4">
          <button
            type="button"
            onClick={handlePrevStep}
            disabled={stepIndex === 0 || saving}
            className={`px-4 py-2 rounded-xl text-xs font-semibold border border-gray-300 dark:border-slate-700 flex items-center gap-1.5 ${
              stepIndex === 0
                ? "opacity-40 cursor-not-allowed"
                : "hover:bg-gray-100 dark:hover:bg-slate-800 cursor-pointer"
            }`}
          >
            <ArrowLeftIcon className="w-4 h-4" />
            <span>Back</span>
          </button>

          <div className="text-xs text-gray-500 dark:text-slate-400 hidden sm:block">
            Step {stepIndex + 1} of {GENIE_STEPS.length}
          </div>

          {stepIndex < GENIE_STEPS.length - 1 ? (
            <button
              type="button"
              onClick={handleNextStep}
              disabled={saving}
              className="px-5 py-2.5 rounded-xl text-xs font-bold flex items-center gap-2 shadow-sm cursor-pointer"
              style={{
                backgroundColor: themeColors.primary,
                color: primaryTextColor,
              }}
            >
              <span>Next Step</span>
              <ArrowRightIcon className="w-4 h-4" />
            </button>
          ) : (
            <button
              type="button"
              onClick={handleCompleteSetup}
              disabled={saving}
              className="px-5 py-2.5 rounded-xl text-xs font-bold flex items-center gap-2 shadow-md cursor-pointer"
              style={{
                backgroundColor: themeColors.emerald,
                color: emeraldTextColor,
              }}
            >
              <RocketLaunchIcon className="w-4 h-4" />
              <span>{saving ? "Launching…" : "Complete Setup & Launch"}</span>
            </button>
          )}
        </div>
      </footer>
    </div>
  );
}
