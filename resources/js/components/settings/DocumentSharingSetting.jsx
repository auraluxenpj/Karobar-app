import React, { useState, useRef, useEffect } from "react";
import {
  SwatchIcon,
  ChatBubbleLeftRightIcon,
  EnvelopeIcon,
  EyeIcon,
  CheckCircleIcon,
  DocumentTextIcon,
  SparklesIcon,
  TrashIcon,
  ArrowPathIcon,
  PlusIcon,
  ArrowDownOnSquareIcon,
  PhotoIcon,
  PrinterIcon,
} from "@heroicons/react/24/outline";
import { GlassCard } from "@/components/Glass.jsx";
import { useTheme } from "@/context/ThemeContext";
import WhatsAppSetting from "./WhatsAppSetting.jsx";
import SmtpSetting from "./SmtpSetting.jsx";

export const DEFAULT_CLOSING_NOTE_EN =
  "Refrigerated, loose, used, or cut-strip medicines are non-returnable.\nReturn or exchange is accepted within 7 days along with the original bill.\nThank you for your cooperation.";

export const DEFAULT_CLOSING_NOTE_UR =
  "فریج میڈیسن، کھلی میڈیسن، استعمال شدہ میڈیسن اور کٹی ہوئی میڈیسن ناقابلِ واپسی ہے۔\nواپسی یا تبدیلی 7 دن کے اندر اصل بل کے ہمراہ ہوگی۔\nآپ کے تعاون کا شکریہ۔";

export const DEFAULT_WHATSAPP_MESSAGE_EN = `*{store_name}*
{store_address}
Tel: {store_phone}
────────────────────
*SALE INVOICE*
Invoice No: *{invoice_no}*
Date: {date}
Customer: {customer_name}
Items: {items}

*Billing Summary*
Invoice Total: *{total}*
Amount Received: {received}
Balance Due (This Invoice): {balance_due}
Total Account Balance Due: *{total_balance}*

*Terms & Return Policy:*
{note}

Please find the official invoice PDF attached for your records.`;

export const DEFAULT_WHATSAPP_MESSAGE_UR = `*{store_name}*
{store_address}
فون نمبر: {store_phone}
────────────────────
*سیل انوائس / بل کی تفصیل*
بل نمبر: *{invoice_no}*
تاریخ: {date}
محترم کسٹمر: {customer_name}
آئٹمز کی تعداد: {items}

*بل کا خلاصہ:*
کل بل: *{total}*
وصول شدہ رقم: {received}
بقایا رقم (موجودہ بل): {balance_due}
کل کھاتہ بقایا: *{total_balance}*

*ضروری ہدایات و شرائط:*
{note}

مکمل بل پی ڈی ایف (PDF) فائل کی صورت میں منسلک ہے۔`;

const DYNAMIC_MESSAGE_TAGS = [
  { label: "Store Name", tag: "{store_name}" },
  { label: "Store Phone", tag: "{store_phone}" },
  { label: "Store Address", tag: "{store_address}" },
  { label: "Invoice No", tag: "{invoice_no}" },
  { label: "Date", tag: "{date}" },
  { label: "Customer", tag: "{customer_name}" },
  { label: "Items", tag: "{items}" },
  { label: "Invoice Total", tag: "{total}" },
  { label: "Received", tag: "{received}" },
  { label: "Balance Due", tag: "{balance_due}" },
  { label: "Ledger Balance", tag: "{total_balance}" },
  { label: "Closing Note", tag: "{note}" },
];

const SHARED_PDF_DESIGNS = [
  {
    id: "standard",
    name: "Standard Corporate",
    badge: "Default",
    accent: "#0f172a",
    headerBg: "#0f172a",
    headerText: "#ffffff",
    desc: "Classic navy header bar, bordered item grid, and structured summary block.",
  },
  {
    id: "minimal",
    name: "Minimal Clean",
    badge: "Ink Saver",
    accent: "#475569",
    headerBg: "#ffffff",
    headerText: "#0f172a",
    desc: "Pure white header with fine hairline borders and uncluttered typography.",
  },
  {
    id: "detailed",
    name: "Executive Detailed",
    badge: "Full Breakdown",
    accent: "#1e40af",
    headerBg: "#1e3a8a",
    headerText: "#ffffff",
    desc: "Royal blue accents with SKU/product code column and extended account balance block.",
  },
  {
    id: "compact",
    name: "Compact High-Density",
    badge: "Multi-Item",
    accent: "#334155",
    headerBg: "#334155",
    headerText: "#ffffff",
    desc: "Condensed margins and typography engineered to fit maximum line items per page.",
  },
  {
    id: "bold",
    name: "Bold Modern",
    badge: "High Contrast",
    accent: "#047857",
    headerBg: "#064e3b",
    headerText: "#ffffff",
    desc: "Full-bleed emerald header banner with high-contrast totals callout.",
  },
  {
    id: "barcode",
    name: "Barcode & Reference",
    badge: "SKU + Ref",
    accent: "#27272a",
    headerBg: "#27272a",
    headerText: "#ffffff",
    desc: "Includes SKU/barcode column and monospaced document verification reference strip.",
  },
];

function renderPreviewMessage(template, vars) {
  const raw = String(template ?? "");
  if (!raw.trim()) return "";

  const noteVal = (vars.note || "").trim();
  let text = raw;

  if (!noteVal) {
    text = text.replace(
      /(?:^|\n)\s*(?:\*Terms\s*&\s*Return\s*Policy:\*|Terms\s*&\s*Return\s*Policy:|\*ضروری\s*ہدایات\s*و\s*شرائط:\*|ضروری\s*ہدایات\s*و\s*شرائط:)\s*\n\s*\{\{?(?:note|closing_note|return_policy)\}?\}/giu,
      ""
    );
  }

  const lines = text.split("\n").filter((line) => {
    const trimmed = line.trim();
    if (!noteVal && /^\{\{?(?:note|closing_note|return_policy)\}?\}\s*$/iu.test(trimmed)) {
      return false;
    }
    return true;
  });

  const replacements = {
    "{store_name}": vars.store_name,
    "{{store_name}}": vars.store_name,
    "{store_address}": vars.store_address,
    "{address}": vars.store_address,
    "{{store_address}}": vars.store_address,
    "{store_phone}": vars.store_phone,
    "{phone}": vars.store_phone,
    "{{store_phone}}": vars.store_phone,
    "{invoice_no}": vars.invoice_no,
    "{document_no}": vars.invoice_no,
    "{bill_no}": vars.invoice_no,
    "{{invoice_no}}": vars.invoice_no,
    "{date}": vars.date,
    "{invoice_date}": vars.date,
    "{{date}}": vars.date,
    "{customer_name}": vars.customer_name,
    "{customer}": vars.customer_name,
    "{recipient_name}": vars.customer_name,
    "{{customer_name}}": vars.customer_name,
    "{items}": vars.items,
    "{items_summary}": vars.items,
    "{{items}}": vars.items,
    "{items_count}": "4",
    "{total_units}": "18",
    "{units}": "18",
    "{total}": vars.total,
    "{invoice_total}": vars.total,
    "{{total}}": vars.total,
    "{received}": vars.received,
    "{amount_received}": vars.received,
    "{{received}}": vars.received,
    "{balance_due}": vars.balance_due,
    "{remaining}": vars.balance_due,
    "{{balance_due}}": vars.balance_due,
    "{total_balance}": vars.total_balance,
    "{account_balance}": vars.total_balance,
    "{ledger_balance}": vars.total_balance,
    "{{total_balance}}": vars.total_balance,
    "{note}": noteVal,
    "{closing_note}": noteVal,
    "{return_policy}": noteVal,
    "{{note}}": noteVal,
  };

  let joined = lines.join("\n");
  Object.entries(replacements).forEach(([key, val]) => {
    joined = joined.split(key).join(val);
  });

  return joined.replace(/\n{3,}/g, "\n\n").trim();
}

export default function DocumentSharingSetting({
  form,
  setForm,
  handleChange,
  handleSave,
  saving = false,
  disableInputs = false,
  initialSubTab = "pdf_design",
  files = [],
  setFiles,
}) {
  const { isDark } = useTheme();
  const [subTab, setSubTab] = useState(initialSubTab || "pdf_design");
  const [previewTemplate, setPreviewTemplate] = useState(null);
  const [activeMessageField, setActiveMessageField] = useState("whatsapp_message_en");
  const [showLivePreview, setShowLivePreview] = useState(false);
  const [localLogoPreview, setLocalLogoPreview] = useState(null);
  const logoInputRef = useRef(null);
  const [noteLang, setNoteLang] = useState(() =>
    /[\u0600-\u06FF]/.test(form.note || "") ? "ur" : "en"
  );
  const hasUserSwitchedNoteLang = useRef(false);

  const enTextareaRef = useRef(null);
  const urTextareaRef = useRef(null);

  useEffect(() => {
    if (files && files.length > 0 && files[0].file instanceof File) {
      const objUrl = URL.createObjectURL(files[0].file);
      setLocalLogoPreview(objUrl);
      return () => URL.revokeObjectURL(objUrl);
    }
    setLocalLogoPreview(null);
  }, [files]);

  useEffect(() => {
    if (!hasUserSwitchedNoteLang.current && form.note) {
      setNoteLang(/[\u0600-\u06FF]/.test(form.note) ? "ur" : "en");
    }
  }, [form.note]);

  const activePaperSize = form.share_paper_size === "thermal" ? "thermal" : "a4";
  const selectedTemplate =
    activePaperSize === "thermal"
      ? form.thermal_template || "standard"
      : form.a4_template || "standard";
  const showLogo = form.share_show_logo !== false;
  const effectiveLogoUrl =
    localLogoPreview ||
    (!form.remove_logo &&
      (form.logo_url ||
        (files && files.length > 0 && typeof files[0].source === "string"
          ? files[0].source
          : null))) ||
    null;

  const storeName = form.store_name || "Your Business Name";
  const storeAddress = form.address || "SHOP #3 FAROOQ E AZAM CHOCK";
  const storePhone = form.phone_number || "0300-1234567";
  const activeNoteValue =
    noteLang === "ur"
      ? form.note_ur !== undefined
        ? form.note_ur
        : form.note ?? ""
      : form.note_en !== undefined
      ? form.note_en
      : form.note ?? "";
  const hasUrduInNote = noteLang === "ur" || /[\u0600-\u06FF]/.test(activeNoteValue);

  const todayFormatted = new Date().toLocaleDateString("en-GB", {
    day: "2-digit",
    month: "short",
    year: "numeric",
  });

  const handleSelectPaperSize = (size) => {
    if (disableInputs) return;
    setForm((prev) => ({
      ...prev,
      share_paper_size: size === "thermal" ? "thermal" : "a4",
    }));
  };

  const handleSelectDesign = (templateId) => {
    if (disableInputs) return;
    setForm((prev) =>
      (prev.share_paper_size || "a4") === "thermal"
        ? { ...prev, thermal_template: templateId }
        : { ...prev, a4_template: templateId }
    );
  };

  const handleToggleShowLogo = (checked) => {
    if (disableInputs) return;
    setForm((prev) => ({ ...prev, share_show_logo: Boolean(checked) }));
  };

  const handleLogoFileSelect = (e) => {
    if (disableInputs) return;
    const file = e.target.files?.[0];
    if (!file) return;
    if (typeof setFiles === "function") {
      setFiles([{ file }]);
    }
    setForm((prev) => ({
      ...prev,
      remove_logo: false,
      share_show_logo: true,
    }));
    e.target.value = "";
  };

  const handleRemoveLogo = () => {
    if (disableInputs) return;
    if (typeof setFiles === "function") {
      setFiles([]);
    }
    setForm((prev) => ({
      ...prev,
      logo_url: null,
      remove_logo: true,
    }));
  };

  const handleSwitchNoteLang = (lang) => {
    if (disableInputs) return;
    hasUserSwitchedNoteLang.current = true;
    setNoteLang(lang);
    setForm((prev) => {
      const nextNote =
        lang === "ur"
          ? prev.note_ur !== undefined
            ? prev.note_ur
            : prev.note ?? ""
          : prev.note_en !== undefined
          ? prev.note_en
          : prev.note ?? "";
      return {
        ...prev,
        note: nextNote,
      };
    });
  };

  const handleNoteChange = (e) => {
    const val = e.target.value;
    setForm((prev) => ({
      ...prev,
      note: val,
      ...(noteLang === "ur" ? { note_ur: val } : { note_en: val }),
    }));
  };

  const handleClearActiveNote = () => {
    if (disableInputs) return;
    setForm((prev) => ({
      ...prev,
      note: "",
      ...(noteLang === "ur" ? { note_ur: "" } : { note_en: "" }),
    }));
  };

  const handleResetActiveNoteDefault = () => {
    if (disableInputs) return;
    const defText =
      noteLang === "ur" ? DEFAULT_CLOSING_NOTE_UR : DEFAULT_CLOSING_NOTE_EN;
    setForm((prev) => ({
      ...prev,
      note: defText,
      ...(noteLang === "ur" ? { note_ur: defText } : { note_en: defText }),
    }));
  };

  const handleKeyDownSave = (e) => {
    if (e.key === "Enter" && (e.ctrlKey || e.metaKey)) {
      e.preventDefault();
      if (!disableInputs && typeof handleSave === "function") {
        handleSave();
      }
    }
  };

  const handleInsertTag = (tag, targetField = activeMessageField) => {
    if (disableInputs) return;
    const field = targetField === "whatsapp_message_ur" ? "whatsapp_message_ur" : "whatsapp_message_en";
    const ref = field === "whatsapp_message_ur" ? urTextareaRef.current : enTextareaRef.current;
    const currentVal = String(form[field] ?? "");

    if (ref && typeof ref.selectionStart === "number") {
      const start = ref.selectionStart;
      const end = ref.selectionEnd ?? start;
      const nextVal = currentVal.slice(0, start) + tag + currentVal.slice(end);
      setForm((prev) => ({ ...prev, [field]: nextVal }));
      setTimeout(() => {
        ref.focus();
        const cursor = start + tag.length;
        ref.setSelectionRange(cursor, cursor);
      }, 0);
    } else {
      const sep = currentVal && !currentVal.endsWith(" ") && !currentVal.endsWith("\n") ? " " : "";
      setForm((prev) => ({ ...prev, [field]: currentVal + sep + tag }));
    }
  };

  const previewNoteEn = (form.note_en !== undefined ? form.note_en : form.note || "").trim();
  const previewNoteUr = (form.note_ur !== undefined ? form.note_ur : form.note || "").trim();

  const previewVarsEn = {
    store_name: storeName,
    store_address: storeAddress,
    store_phone: storePhone,
    invoice_no: "SI-2026-0001",
    date: todayFormatted,
    customer_name: "Allied Medical Store",
    items: "4 (18 units)",
    total: "Rs. 14,500.00",
    received: "Rs. 10,000.00",
    balance_due: "Rs. 4,500.00",
    total_balance: "Rs. 12,000.00",
    note: previewNoteEn,
  };

  const previewVarsUr = {
    ...previewVarsEn,
    items: "4 (18 یونٹس)",
    note: previewNoteUr,
  };

  const resolvedEnglishPreview = renderPreviewMessage(
    form.whatsapp_message_en ?? "",
    previewVarsEn
  );
  const resolvedUrduPreview = renderPreviewMessage(
    form.whatsapp_message_ur ?? "",
    previewVarsUr
  );

  const subTabs = [
    {
      id: "pdf_design",
      label: "PDF Design & Message Format",
      desc: "Select shared PDF size, layout, logo & closing note",
      icon: SwatchIcon,
      badge: `${activePaperSize === "thermal" ? "Thermal (58mm × 80mm)" : "A4"} • ${
        SHARED_PDF_DESIGNS.find((d) => d.id === selectedTemplate)?.name || "Standard"
      }`,
    },
    {
      id: "whatsapp",
      label: "WhatsApp Integration",
      desc: "Direct PDF attachment delivery",
      icon: ChatBubbleLeftRightIcon,
      badge: form.whatsapp_enabled ? "Active" : "Browser Mode",
      badgePositive: Boolean(form.whatsapp_enabled),
    },
    {
      id: "smtp",
      label: "Email Server (SMTP)",
      desc: "Outbound email PDF delivery",
      icon: EnvelopeIcon,
      badge: form.smtp_enabled ? "Active" : "Default Mailer",
      badgePositive: Boolean(form.smtp_enabled),
    },
  ];

  return (
    <div className="space-y-6">
      {/* Sub-navigation bar for Document Sharing */}
      <div
        className={`grid grid-cols-1 md:grid-cols-3 gap-3 p-2 rounded-2xl border ${
          isDark
            ? "bg-slate-900/70 border-slate-700/80"
            : "bg-gray-100/80 border-gray-200/80"
        }`}
      >
        {subTabs.map((item) => {
          const Icon = item.icon;
          const isActive = subTab === item.id;
          return (
            <button
              key={item.id}
              type="button"
              onClick={() => setSubTab(item.id)}
              className={`flex items-start gap-3 p-3.5 rounded-xl text-left transition-all border ${
                isActive
                  ? isDark
                    ? "bg-slate-800 border-blue-500/60 shadow-md text-slate-100"
                    : "bg-white border-blue-500/40 shadow-sm text-gray-900"
                  : isDark
                  ? "border-transparent hover:bg-slate-800/50 text-slate-400"
                  : "border-transparent hover:bg-white/60 text-gray-600"
              }`}
            >
              <div
                className={`p-2 rounded-lg shrink-0 ${
                  isActive
                    ? "bg-blue-600 text-white"
                    : isDark
                    ? "bg-slate-700 text-slate-300"
                    : "bg-gray-200 text-gray-700"
                }`}
              >
                <Icon className="w-5 h-5" />
              </div>
              <div className="min-w-0 flex-1">
                <div className="flex items-center justify-between gap-2 flex-wrap">
                  <span className="text-sm font-bold leading-snug">{item.label}</span>
                  {item.badge && (
                    <span
                      className={`px-2 py-0.5 rounded-full text-[10px] font-semibold shrink-0 ${
                        item.badgePositive
                          ? "bg-emerald-100 text-emerald-700 dark:bg-emerald-900/40 dark:text-emerald-300"
                          : isDark
                          ? "bg-slate-700 text-slate-300"
                          : "bg-gray-200 text-gray-700"
                      }`}
                    >
                      {item.badge}
                    </span>
                  )}
                </div>
                <p
                  className={`text-xs mt-0.5 line-clamp-2 ${
                    isDark ? "text-slate-400" : "text-gray-500"
                  }`}
                >
                  {item.desc}
                </p>
              </div>
            </button>
          );
        })}
      </div>

      {/* Sub-tab 1: PDF Design & Message Format */}
      {subTab === "pdf_design" && (
        <div className="space-y-6">
          <GlassCard className="p-4 sm:p-6">
            <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 pb-5 border-b border-gray-200 dark:border-slate-700">
              <div className="flex items-start gap-3.5">
                <div className="p-3 rounded-xl bg-blue-100 dark:bg-blue-900/30 text-blue-600 dark:text-blue-400">
                  <SwatchIcon className="w-6 h-6" />
                </div>
                <div>
                  <h2 className="text-lg font-bold text-gray-900 dark:text-slate-100">
                    Shared PDF Document Size, Logo &amp; Template
                  </h2>
                  <p className="text-xs text-gray-500 dark:text-slate-400 mt-1 max-w-2xl">
                    Choose whether shared PDF documents use <strong>A4 Full Page</strong> or <strong>Thermal Receipt</strong> size, optionally include your store logo, and select your default template. All shared documents (WhatsApp, Email, and PDF download) will automatically use your selected size and template.
                  </p>
                </div>
              </div>
              {!disableInputs && typeof handleSave === "function" && (
                <button
                  type="button"
                  onClick={handleSave}
                  disabled={saving}
                  className="px-4 py-2 rounded-xl text-xs font-semibold bg-blue-600 text-white hover:bg-blue-700 disabled:opacity-60 flex items-center gap-1.5 shadow-sm shrink-0 self-start sm:self-center"
                >
                  <ArrowDownOnSquareIcon className="w-4 h-4" />
                  <span>{saving ? "Saving…" : "Save Design Settings"}</span>
                </button>
              )}
            </div>

            {/* 1. Store Logo Inclusion & Upload Control */}
            <div
              className={`mt-5 rounded-xl border p-4 flex flex-col md:flex-row md:items-center justify-between gap-4 ${
                isDark
                  ? "bg-slate-900/60 border-slate-700/80"
                  : "bg-slate-50/80 border-gray-200"
              }`}
            >
              <div className="flex items-start gap-3.5">
                <div
                  className={`w-14 h-14 rounded-xl border flex items-center justify-center overflow-hidden shrink-0 ${
                    isDark
                      ? "bg-slate-800 border-slate-700"
                      : "bg-white border-gray-200"
                  }`}
                >
                  {effectiveLogoUrl ? (
                    <img
                      src={effectiveLogoUrl}
                      alt="Store Logo"
                      className="max-w-full max-h-full object-contain p-1"
                    />
                  ) : (
                    <PhotoIcon className="w-6 h-6 text-gray-400 dark:text-slate-500" />
                  )}
                </div>
                <div className="space-y-1">
                  <div className="flex items-center gap-2.5 flex-wrap">
                    <label
                      htmlFor="setting-share-show-logo"
                      className="text-sm font-bold text-gray-900 dark:text-slate-100 cursor-pointer"
                    >
                      Include Store Logo on Shared Documents
                    </label>
                    <span
                      className={`px-2 py-0.5 rounded-full text-[10px] font-semibold ${
                        showLogo && effectiveLogoUrl
                          ? "bg-emerald-100 text-emerald-700 dark:bg-emerald-900/40 dark:text-emerald-300"
                          : showLogo && !effectiveLogoUrl
                          ? "bg-amber-100 text-amber-700 dark:bg-amber-900/40 dark:text-amber-300"
                          : isDark
                          ? "bg-slate-700 text-slate-300"
                          : "bg-gray-200 text-gray-700"
                      }`}
                    >
                      {showLogo
                        ? effectiveLogoUrl
                          ? "Logo Active"
                          : "Enabled (Upload Logo)"
                        : "Logo Hidden"}
                    </span>
                  </div>
                  <p className="text-xs text-gray-500 dark:text-slate-400">
                    When enabled, your store logo is automatically placed in the header of shared PDF documents in both A4 and Thermal sizes.
                  </p>
                </div>
              </div>

              <div className="flex flex-wrap items-center gap-3 shrink-0">
                <input
                  ref={logoInputRef}
                  type="file"
                  accept="image/png,image/jpeg,image/jpg,image/webp"
                  onChange={handleLogoFileSelect}
                  className="hidden"
                />
                {!disableInputs && (
                  <>
                    <button
                      type="button"
                      onClick={() => logoInputRef.current?.click()}
                      className={`px-3 py-1.5 rounded-lg border text-xs font-semibold flex items-center gap-1.5 transition-colors ${
                        isDark
                          ? "bg-slate-800 border-slate-600 text-slate-200 hover:bg-slate-700"
                          : "bg-white border-gray-300 text-gray-700 hover:bg-gray-100"
                      }`}
                    >
                      <PhotoIcon className="w-4 h-4 text-blue-600 dark:text-blue-400" />
                      <span>{effectiveLogoUrl ? "Change Logo" : "Upload Logo"}</span>
                    </button>
                    {effectiveLogoUrl && (
                      <button
                        type="button"
                        onClick={handleRemoveLogo}
                        className="px-2.5 py-1.5 rounded-lg border border-red-200 dark:border-red-900/50 text-xs font-semibold text-red-600 dark:text-red-400 hover:bg-red-50 dark:hover:bg-red-950/30 flex items-center gap-1"
                      >
                        <TrashIcon className="w-3.5 h-3.5" />
                        <span>Remove</span>
                      </button>
                    )}
                  </>
                )}

                <label
                  htmlFor="setting-share-show-logo"
                  className={`inline-flex items-center gap-2 px-3 py-1.5 rounded-lg border cursor-pointer select-none text-xs font-semibold ${
                    showLogo
                      ? "border-blue-500/50 bg-blue-50/70 text-blue-700 dark:bg-blue-950/40 dark:text-blue-300 dark:border-blue-500/40"
                      : isDark
                      ? "border-slate-700 bg-slate-800 text-slate-300"
                      : "border-gray-300 bg-white text-gray-700"
                  }`}
                >
                  <input
                    id="setting-share-show-logo"
                    type="checkbox"
                    checked={showLogo}
                    disabled={disableInputs}
                    onChange={(e) => handleToggleShowLogo(e.target.checked)}
                    className="h-4 w-4 rounded border-gray-300 text-blue-600 focus:ring-blue-500"
                  />
                  <span>{showLogo ? "Show Logo on PDF" : "Hide Logo"}</span>
                </label>
              </div>
            </div>

            {/* 2. Document Sharing Size Selector (A4 Size vs Thermal Size 58mm × 80mm) */}
            <div className="mt-6">
              <div className="flex items-center justify-between mb-2.5">
                <span className="text-xs font-bold uppercase tracking-wider text-gray-600 dark:text-slate-300">
                  1. Select Shared Document Size
                </span>
                <span className="text-xs text-gray-500 dark:text-slate-400">
                  Active:{" "}
                  <strong className="text-gray-900 dark:text-slate-100">
                    {activePaperSize === "thermal"
                      ? "Thermal Size (58mm × 80mm)"
                      : "A4 Size (Full Page)"}
                  </strong>
                </span>
              </div>

              <div className="grid grid-cols-1 sm:grid-cols-2 gap-3.5">
                {[
                  {
                    id: "a4",
                    title: "A4 Size (Full Page Document)",
                    subtitle:
                      "Standard 210mm × 297mm portrait layout for corporate invoices, purchase orders & ledgers.",
                    badge: `Template: ${
                      SHARED_PDF_DESIGNS.find(
                        (d) => d.id === (form.a4_template || "standard")
                      )?.name || "Standard"
                    }`,
                  },
                  {
                    id: "thermal",
                    title: "Thermal Size (58mm × 80mm)",
                    subtitle:
                      "Compact 58mm × 80mm thermal receipt layout ideal for fast mobile viewing on WhatsApp & retail counters.",
                    badge: `Template: ${
                      SHARED_PDF_DESIGNS.find(
                        (d) => d.id === (form.thermal_template || "standard")
                      )?.name || "Standard"
                    }`,
                  },
                ].map((sizeOpt) => {
                  const isSizeSelected = activePaperSize === sizeOpt.id;
                  const radioId = `share-paper-size-${sizeOpt.id}`;
                  return (
                    <label
                      key={sizeOpt.id}
                      htmlFor={radioId}
                      className={`cursor-pointer rounded-xl border-2 p-4 transition-all flex items-start gap-3.5 ${
                        isSizeSelected
                          ? "border-blue-600 bg-blue-50/40 dark:bg-blue-950/25 shadow-sm"
                          : isDark
                          ? "border-slate-700 bg-slate-800/40 hover:border-slate-500"
                          : "border-gray-200 bg-white hover:border-gray-300"
                      }`}
                    >
                      <input
                        id={radioId}
                        type="radio"
                        name="share_paper_size"
                        value={sizeOpt.id}
                        checked={isSizeSelected}
                        disabled={disableInputs}
                        onChange={() => handleSelectPaperSize(sizeOpt.id)}
                        className="mt-1 h-4 w-4 text-blue-600 border-gray-300 focus:ring-blue-500"
                      />
                      <div className="min-w-0 flex-1">
                        <div className="flex items-center justify-between gap-2 flex-wrap">
                          <span className="text-sm font-bold text-gray-900 dark:text-slate-100 flex items-center gap-1.5">
                            <PrinterIcon className="w-4 h-4 text-blue-600 dark:text-blue-400 shrink-0" />
                            <span>{sizeOpt.title}</span>
                          </span>
                          <span
                            className={`text-[10px] font-semibold px-2 py-0.5 rounded-full ${
                              isSizeSelected
                                ? "bg-blue-600 text-white"
                                : isDark
                                ? "bg-slate-700 text-slate-300"
                                : "bg-gray-100 text-gray-600"
                            }`}
                          >
                            {sizeOpt.badge}
                          </span>
                        </div>
                        <p className="text-xs text-gray-500 dark:text-slate-400 mt-1 leading-relaxed">
                          {sizeOpt.subtitle}
                        </p>
                      </div>
                    </label>
                  );
                })}
              </div>
            </div>

            {/* 3. 6 Visual PDF Design Cards for the Selected Size */}
            <div className="mt-6">
              <div className="flex items-center justify-between mb-2.5">
                <span className="text-xs font-bold uppercase tracking-wider text-gray-600 dark:text-slate-300">
                  2. Select{" "}
                  {activePaperSize === "thermal" ? "Thermal Receipt" : "A4 Page"}{" "}
                  Template Design
                </span>
                <span className="text-xs text-gray-500 dark:text-slate-400">
                  Selected:{" "}
                  <strong className="text-blue-600 dark:text-blue-400">
                    {SHARED_PDF_DESIGNS.find((d) => d.id === selectedTemplate)?.name}
                  </strong>
                </span>
              </div>

              <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
                {SHARED_PDF_DESIGNS.map((tpl) => {
                  const isSelected = selectedTemplate === tpl.id;
                  return (
                    <div
                      key={tpl.id}
                      onClick={() => handleSelectDesign(tpl.id)}
                      className={`group cursor-pointer rounded-xl border-2 p-4 transition-all flex flex-col justify-between ${
                        isSelected
                          ? "border-blue-600 bg-blue-50/40 dark:bg-blue-950/20 shadow-sm"
                          : isDark
                          ? "border-slate-700 bg-slate-800/50 hover:border-slate-500"
                          : "border-gray-200 bg-white hover:border-gray-300"
                      }`}
                    >
                      <div>
                        {/* Mini Visual Schematic of the PDF Template (adapts to A4 vs Thermal & Logo) */}
                        <div className="rounded-lg border border-gray-200 dark:border-slate-700 bg-slate-50 dark:bg-slate-900/60 p-2.5 mb-3 shadow-inner flex justify-center">
                          <div
                            className={`rounded border border-gray-200 bg-white p-2.5 shadow-sm transition-all ${
                              activePaperSize === "thermal"
                                ? "w-44 border-dashed"
                                : "w-full"
                            }`}
                          >
                            <div
                              className={`rounded px-2 py-1.5 flex ${
                                activePaperSize === "thermal"
                                  ? "flex-col items-center text-center gap-0.5"
                                  : "items-center justify-between"
                              } mb-2`}
                              style={{
                                backgroundColor: tpl.headerBg,
                                color: tpl.headerText,
                                border:
                                  tpl.id === "minimal"
                                    ? "1px solid #cbd5e1"
                                    : `1px solid ${tpl.accent}`,
                              }}
                            >
                              <div className="flex items-center gap-1.5 min-w-0 max-w-full">
                                {showLogo && (
                                  <span
                                    className="w-3.5 h-3.5 rounded-sm shrink-0 flex items-center justify-center overflow-hidden"
                                    style={{
                                      backgroundColor:
                                        tpl.id === "minimal"
                                          ? "#e2e8f0"
                                          : "rgba(255,255,255,0.9)",
                                    }}
                                  >
                                    {effectiveLogoUrl ? (
                                      <img
                                        src={effectiveLogoUrl}
                                        alt=""
                                        className="w-full h-full object-contain"
                                      />
                                    ) : (
                                      <span
                                        className="w-2 h-2 rounded-full"
                                        style={{ backgroundColor: tpl.accent }}
                                      />
                                    )}
                                  </span>
                                )}
                                <span className="font-bold text-[10px] truncate">
                                  {storeName}
                                </span>
                              </div>
                              <div
                                className="text-[7.5px] font-bold uppercase px-1.5 py-0.5 rounded shrink-0"
                                style={{
                                  backgroundColor:
                                    tpl.id === "minimal"
                                      ? "#f1f5f9"
                                      : "rgba(255,255,255,0.18)",
                                  color:
                                    tpl.id === "minimal" ? "#0f172a" : "#ffffff",
                                }}
                              >
                                {activePaperSize === "thermal" ? "RECEIPT" : "INVOICE"}
                              </div>
                            </div>
                            <div className="space-y-1">
                              <div
                                className="h-2 rounded-sm"
                                style={{ backgroundColor: tpl.accent, opacity: 0.85 }}
                              />
                              <div className="h-1.5 bg-gray-200 rounded-sm" />
                              <div className="h-1.5 bg-gray-100 rounded-sm" />
                              <div className="flex justify-end pt-1">
                                <div
                                  className="h-2.5 w-16 rounded-sm"
                                  style={{ backgroundColor: tpl.accent }}
                                />
                              </div>
                            </div>
                          </div>
                        </div>

                        <div className="flex items-center justify-between gap-2">
                          <div className="font-bold text-sm text-gray-900 dark:text-slate-100 flex items-center gap-1.5">
                            <span>{tpl.name}</span>
                            {isSelected && (
                              <CheckCircleIcon className="w-4 h-4 text-blue-600 dark:text-blue-400" />
                            )}
                          </div>
                          <span
                            className={`text-[10px] font-semibold px-2 py-0.5 rounded-full ${
                              isSelected
                                ? "bg-blue-600 text-white"
                                : isDark
                                ? "bg-slate-700 text-slate-300"
                                : "bg-gray-100 text-gray-600"
                            }`}
                          >
                            {tpl.badge}
                          </span>
                        </div>

                        <p className="text-xs text-gray-500 dark:text-slate-400 mt-1.5 leading-relaxed">
                          {tpl.desc}
                        </p>
                      </div>

                      <div className="mt-4 pt-3 border-t border-gray-100 dark:border-slate-700/70 flex items-center justify-between">
                        <span
                          className={`text-xs font-semibold ${
                            isSelected
                              ? "text-blue-600 dark:text-blue-400"
                              : "text-gray-500 dark:text-slate-400"
                          }`}
                        >
                          {isSelected
                            ? `Active ${
                                activePaperSize === "thermal" ? "Thermal" : "A4"
                              } Template`
                            : "Click to Select"}
                        </span>
                        <button
                          type="button"
                          onClick={(e) => {
                            e.stopPropagation();
                            setPreviewTemplate(tpl.id);
                          }}
                          className="text-xs font-semibold text-blue-600 dark:text-blue-400 hover:underline flex items-center gap-1"
                        >
                          <EyeIcon className="w-3.5 h-3.5" />
                          <span>Preview</span>
                        </button>
                      </div>
                    </div>
                  );
                })}
              </div>
            </div>
          </GlassCard>

          {/* Editable Closing Note & Fully Editable Outbound WhatsApp Messages */}
          <GlassCard className="p-4 sm:p-6 space-y-6">
            {/* Section 1: PDF Invoice Closing Note & Return Policy */}
            <div className="space-y-4">
              <div className="flex flex-wrap items-center justify-between gap-3">
                <div className="flex items-center gap-2.5">
                  <DocumentTextIcon className="w-5 h-5 text-blue-600 dark:text-blue-400 shrink-0" />
                  <div>
                    <label
                      htmlFor="setting-pdf-closing-note"
                      className="block text-base font-bold text-gray-900 dark:text-slate-100 cursor-pointer"
                    >
                      PDF Invoice Closing Note &amp; Return Policy
                    </label>
                    <p className="text-xs text-gray-500 dark:text-slate-400">
                      Customize both your English and Urdu closing notes. Switching between English and Urdu keeps your saved changes for each language and sets the active PDF invoice note.
                    </p>
                  </div>
                </div>

                {!disableInputs && (
                  <div className="flex flex-wrap items-center gap-2">
                    {/* Language Switcher (Preserves custom English & Urdu notes) */}
                    <div
                      className={`inline-flex rounded-lg p-0.5 border ${
                        isDark
                          ? "bg-slate-900 border-slate-700"
                          : "bg-gray-100 border-gray-300"
                      }`}
                    >
                      <button
                        type="button"
                        onClick={() => handleSwitchNoteLang("en")}
                        className={`px-2.5 py-1 rounded-md text-xs font-semibold transition-all ${
                          noteLang === "en"
                            ? "bg-blue-600 text-white shadow-sm"
                            : isDark
                            ? "text-slate-300 hover:text-white"
                            : "text-gray-700 hover:text-gray-900"
                        }`}
                      >
                        English Note
                      </button>
                      <button
                        type="button"
                        onClick={() => handleSwitchNoteLang("ur")}
                        className={`px-2.5 py-1 rounded-md text-xs font-semibold transition-all ${
                          noteLang === "ur"
                            ? "bg-emerald-600 text-white shadow-sm"
                            : isDark
                            ? "text-slate-300 hover:text-white"
                            : "text-gray-700 hover:text-gray-900"
                        }`}
                      >
                        Urdu Note (اردو نوٹ)
                      </button>
                    </div>

                    <button
                      type="button"
                      onClick={handleClearActiveNote}
                      className="px-2.5 py-1 rounded-lg text-xs font-semibold border border-gray-200 dark:border-slate-700 bg-gray-50 dark:bg-slate-800 text-gray-700 dark:text-slate-300 hover:bg-gray-100 dark:hover:bg-slate-700 flex items-center gap-1"
                      title="Clear current note"
                    >
                      <TrashIcon className="w-3.5 h-3.5" />
                      <span>Clear Note</span>
                    </button>

                    <button
                      type="button"
                      onClick={handleResetActiveNoteDefault}
                      className="px-2.5 py-1 rounded-lg text-xs font-semibold border border-gray-200 dark:border-slate-700 bg-gray-50 dark:bg-slate-800 text-gray-700 dark:text-slate-300 hover:bg-gray-100 dark:hover:bg-slate-700 flex items-center gap-1"
                      title="Restore sample return policy for this language"
                    >
                      <ArrowPathIcon className="w-3.5 h-3.5" />
                      <span>Default Sample</span>
                    </button>

                    {typeof handleSave === "function" && (
                      <button
                        type="button"
                        onClick={handleSave}
                        disabled={saving}
                        className="px-3 py-1 rounded-lg text-xs font-semibold bg-blue-600 text-white hover:bg-blue-700 disabled:opacity-60 flex items-center gap-1.5 shadow-sm"
                      >
                        <ArrowDownOnSquareIcon className="w-3.5 h-3.5" />
                        <span>{saving ? "Saving…" : "Save Note"}</span>
                      </button>
                    )}
                  </div>
                )}
              </div>

              <div>
                <textarea
                  id="setting-pdf-closing-note"
                  name="note"
                  rows={4}
                  disabled={disableInputs}
                  dir={hasUrduInNote ? "rtl" : "ltr"}
                  value={activeNoteValue}
                  onChange={handleNoteChange}
                  onKeyDown={handleKeyDownSave}
                  placeholder={
                    noteLang === "ur"
                      ? "اپنا کسٹم پی ڈی ایف انوائس نوٹ یا واپسی کی شرائط یہاں لکھیں..."
                      : "Write your custom PDF invoice closing note or return policy here (or leave blank for no closing note)..."
                  }
                  className={`w-full rounded-xl border p-3 text-sm transition-colors focus:outline-none focus:ring-2 ${
                    hasUrduInNote ? "text-right" : "text-left"
                  } ${
                    isDark
                      ? "bg-slate-900 border-slate-700 text-slate-100 focus:border-blue-500 focus:ring-blue-500/20"
                      : "bg-white border-gray-300 text-gray-900 focus:border-blue-500 focus:ring-blue-500/20"
                  }`}
                />
                <p className="mt-1 text-[11px] text-gray-500 dark:text-slate-400">
                  Editing:{" "}
                  <strong className="text-gray-700 dark:text-slate-200">
                    {noteLang === "ur" ? "Urdu Closing Note (اردو نوٹ)" : "English Closing Note"}
                  </strong>{" "}
                  — Switching between English and Urdu keeps both notes saved. Click{" "}
                  <strong>Save Note</strong> (or press Ctrl/⌘ + Enter) to save.
                </p>
              </div>
            </div>

            {/* Section 2: Fully Editable WhatsApp Outbound Messages */}
            <div className="pt-5 border-t border-gray-200 dark:border-slate-700 space-y-4">
              <div className="flex flex-wrap items-start justify-between gap-3">
                <div>
                  <span className="text-xs font-semibold uppercase tracking-wider text-gray-700 dark:text-slate-300 flex items-center gap-1.5">
                    <SparklesIcon className="w-4 h-4 text-emerald-500" />
                    <span>Outbound WhatsApp Message Format (Fully Editable)</span>
                  </span>
                  <p className="text-xs text-gray-500 dark:text-slate-400 mt-1">
                    Write your own custom WhatsApp message or edit the template below. You can add any information you want (such as payment accounts, delivery numbers, or custom notes), remove lines you don&apos;t need, or click a tag below to insert dynamic invoice details.
                  </p>
                </div>

                <button
                  type="button"
                  onClick={() => setShowLivePreview((v) => !v)}
                  className="px-2.5 py-1 rounded-lg text-xs font-semibold border border-gray-200 dark:border-slate-700 bg-gray-50 dark:bg-slate-800 text-gray-700 dark:text-slate-300 hover:bg-gray-100 dark:hover:bg-slate-700 flex items-center gap-1"
                >
                  <EyeIcon className="w-3.5 h-3.5" />
                  <span>{showLivePreview ? "Hide Resolved Preview" : "Show Resolved Preview"}</span>
                </button>
              </div>

              {/* Quick-Insert Dynamic Tag Chips */}
              {!disableInputs && (
                <div
                  className={`p-3 rounded-xl border ${
                    isDark
                      ? "bg-slate-900/60 border-slate-700/80"
                      : "bg-gray-50/90 border-gray-200"
                  }`}
                >
                  <div className="flex items-center justify-between gap-2 mb-2 flex-wrap">
                    <span className="text-[11px] font-semibold text-gray-600 dark:text-slate-300">
                      Click to insert dynamic info into{" "}
                      <strong className="text-blue-600 dark:text-blue-400">
                        {activeMessageField === "whatsapp_message_ur"
                          ? "Urdu Message (اردو فارمیٹ)"
                          : "English Message"}
                      </strong>
                      :
                    </span>
                    <span className="text-[11px] text-gray-400 dark:text-slate-500">
                      Optional — or just type plain text
                    </span>
                  </div>
                  <div className="flex flex-wrap gap-1.5">
                    {DYNAMIC_MESSAGE_TAGS.map((item) => (
                      <button
                        key={item.tag}
                        type="button"
                        onClick={() => handleInsertTag(item.tag)}
                        className={`px-2 py-1 rounded-md text-[11px] font-medium border transition-colors flex items-center gap-1 ${
                          isDark
                            ? "bg-slate-800 border-slate-700 text-slate-200 hover:border-blue-500 hover:text-blue-300"
                            : "bg-white border-gray-300 text-gray-700 hover:border-blue-500 hover:text-blue-600"
                        }`}
                        title={`Insert ${item.tag}`}
                      >
                        <PlusIcon className="w-3 h-3" />
                        <span>{item.label}</span>
                        <code className="text-[10px] opacity-70">{item.tag}</code>
                      </button>
                    ))}
                  </div>
                </div>
              )}

              <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
                {/* Format 1: Editable English WhatsApp Message */}
                <div className="space-y-2">
                  <div className="flex flex-wrap items-center justify-between gap-2">
                    <label
                      htmlFor="setting-whatsapp-message-en"
                      className="text-xs font-bold text-blue-600 dark:text-blue-400 cursor-pointer flex items-center gap-1.5"
                    >
                      <span>1. English WhatsApp Message</span>
                      <span className="text-[10px] px-2 py-0.5 rounded-full bg-blue-100 dark:bg-blue-900/40 text-blue-700 dark:text-blue-300 font-semibold">
                        Editable • LTR
                      </span>
                    </label>

                    {!disableInputs && (
                      <div className="flex items-center gap-1.5">
                        <button
                          type="button"
                          onClick={() =>
                            setForm((prev) => ({ ...prev, whatsapp_message_en: "" }))
                          }
                          className="px-2 py-0.5 rounded text-[11px] font-semibold border border-gray-200 dark:border-slate-700 text-gray-600 dark:text-slate-300 hover:bg-gray-100 dark:hover:bg-slate-800 flex items-center gap-1"
                          title="Clear to write your own custom message from scratch"
                        >
                          <TrashIcon className="w-3 h-3" />
                          <span>Clear</span>
                        </button>
                        <button
                          type="button"
                          onClick={() =>
                            setForm((prev) => ({
                              ...prev,
                              whatsapp_message_en: DEFAULT_WHATSAPP_MESSAGE_EN,
                            }))
                          }
                          className="px-2 py-0.5 rounded text-[11px] font-semibold border border-blue-200 dark:border-blue-800 text-blue-600 dark:text-blue-400 hover:bg-blue-50 dark:hover:bg-blue-950/40 flex items-center gap-1"
                          title="Restore standard template with dynamic placeholders"
                        >
                          <ArrowPathIcon className="w-3 h-3" />
                          <span>Default Template</span>
                        </button>
                      </div>
                    )}
                  </div>

                  <textarea
                    ref={enTextareaRef}
                    id="setting-whatsapp-message-en"
                    name="whatsapp_message_en"
                    rows={12}
                    disabled={disableInputs}
                    dir="ltr"
                    value={form.whatsapp_message_en ?? ""}
                    onFocus={() => setActiveMessageField("whatsapp_message_en")}
                    onChange={(e) =>
                      setForm((prev) => ({
                        ...prev,
                        whatsapp_message_en: e.target.value,
                      }))
                    }
                    onKeyDown={handleKeyDownSave}
                    placeholder="Write your custom English WhatsApp message here... You can add any info you want or insert dynamic tags above."
                    className={`w-full rounded-xl border p-3.5 font-mono text-xs leading-relaxed text-left transition-colors focus:outline-none focus:ring-2 ${
                      isDark
                        ? "bg-slate-900 border-slate-700 text-slate-100 focus:border-blue-500 focus:ring-blue-500/20"
                        : "bg-white border-gray-300 text-gray-900 focus:border-blue-500 focus:ring-blue-500/20"
                    }`}
                  />

                  {showLivePreview && (
                    <div
                      dir="ltr"
                      className={`rounded-xl border p-3.5 font-mono text-xs whitespace-pre-wrap leading-relaxed text-left ${
                        isDark
                          ? "bg-slate-900/70 border-slate-700/80 text-slate-300"
                          : "bg-gray-50 border-gray-200 text-gray-700"
                      }`}
                    >
                      <div className="text-[10px] font-sans font-bold uppercase tracking-wider text-blue-600 dark:text-blue-400 mb-1.5">
                        Live Preview (English):
                      </div>
                      {resolvedEnglishPreview || (
                        <span className="italic opacity-60">
                          Empty message — you can type a custom message above or when sharing.
                        </span>
                      )}
                    </div>
                  )}
                </div>

                {/* Format 2: Editable Urdu WhatsApp Message */}
                <div className="space-y-2">
                  <div className="flex flex-wrap items-center justify-between gap-2">
                    <label
                      htmlFor="setting-whatsapp-message-ur"
                      className="text-xs font-bold text-emerald-600 dark:text-emerald-400 cursor-pointer flex items-center gap-1.5"
                    >
                      <span>2. Urdu WhatsApp Message (اردو واٹس ایپ میسج)</span>
                      <span className="text-[10px] px-2 py-0.5 rounded-full bg-emerald-100 dark:bg-emerald-900/40 text-emerald-700 dark:text-emerald-300 font-semibold">
                        Editable • RTL
                      </span>
                    </label>

                    {!disableInputs && (
                      <div className="flex items-center gap-1.5">
                        <button
                          type="button"
                          onClick={() =>
                            setForm((prev) => ({ ...prev, whatsapp_message_ur: "" }))
                          }
                          className="px-2 py-0.5 rounded text-[11px] font-semibold border border-gray-200 dark:border-slate-700 text-gray-600 dark:text-slate-300 hover:bg-gray-100 dark:hover:bg-slate-800 flex items-center gap-1"
                          title="Clear to write your own custom Urdu message from scratch"
                        >
                          <TrashIcon className="w-3 h-3" />
                          <span>Clear</span>
                        </button>
                        <button
                          type="button"
                          onClick={() =>
                            setForm((prev) => ({
                              ...prev,
                              whatsapp_message_ur: DEFAULT_WHATSAPP_MESSAGE_UR,
                            }))
                          }
                          className="px-2 py-0.5 rounded text-[11px] font-semibold border border-emerald-200 dark:border-emerald-800 text-emerald-600 dark:text-emerald-400 hover:bg-emerald-50 dark:hover:bg-emerald-950/40 flex items-center gap-1"
                          title="Restore standard Urdu template with dynamic placeholders"
                        >
                          <ArrowPathIcon className="w-3 h-3" />
                          <span>Default Template</span>
                        </button>
                      </div>
                    )}
                  </div>

                  <textarea
                    ref={urTextareaRef}
                    id="setting-whatsapp-message-ur"
                    name="whatsapp_message_ur"
                    rows={12}
                    disabled={disableInputs}
                    dir="rtl"
                    value={form.whatsapp_message_ur ?? ""}
                    onFocus={() => setActiveMessageField("whatsapp_message_ur")}
                    onChange={(e) =>
                      setForm((prev) => ({
                        ...prev,
                        whatsapp_message_ur: e.target.value,
                      }))
                    }
                    onKeyDown={handleKeyDownSave}
                    placeholder="اپنا کسٹم واٹس ایپ میسج یہاں لکھیں... آپ اپنی مرضی کی کوئی بھی معلومات شامل کر سکتے ہیں۔"
                    className={`w-full rounded-xl border p-3.5 text-xs leading-relaxed text-right transition-colors focus:outline-none focus:ring-2 ${
                      isDark
                        ? "bg-slate-900 border-slate-700 text-slate-100 focus:border-emerald-500 focus:ring-emerald-500/20"
                        : "bg-white border-gray-300 text-gray-900 focus:border-emerald-500 focus:ring-emerald-500/20"
                    }`}
                  />

                  {showLivePreview && (
                    <div
                      dir="rtl"
                      className={`rounded-xl border p-3.5 text-xs whitespace-pre-wrap leading-relaxed text-right ${
                        isDark
                          ? "bg-slate-900/70 border-slate-700/80 text-slate-300"
                          : "bg-gray-50 border-gray-200 text-gray-700"
                      }`}
                    >
                      <div className="text-[10px] font-bold uppercase tracking-wider text-emerald-600 dark:text-emerald-400 mb-1.5">
                        لائیو پریویو (اردو):
                      </div>
                      {resolvedUrduPreview || (
                        <span className="italic opacity-60">
                          خالی میسج — آپ اوپر یا شیئر کرتے وقت اپنی مرضی کا میسج لکھ سکتے ہیں۔
                        </span>
                      )}
                    </div>
                  )}
                </div>
              </div>

              {!disableInputs && typeof handleSave === "function" && (
                <div className="pt-3 flex items-center justify-end gap-3 border-t border-gray-100 dark:border-slate-800">
                  <span className="text-xs text-gray-500 dark:text-slate-400">
                    Saves your PDF design, closing note, and custom WhatsApp message formats.
                  </span>
                  <button
                    type="button"
                    onClick={handleSave}
                    disabled={saving}
                    className="px-4 py-2 rounded-xl text-xs font-semibold bg-blue-600 text-white hover:bg-blue-700 disabled:opacity-60 flex items-center gap-1.5 shadow-sm"
                  >
                    <ArrowDownOnSquareIcon className="w-4 h-4" />
                    <span>
                      {saving ? "Saving…" : "Save Closing Note & WhatsApp Message"}
                    </span>
                  </button>
                </div>
              )}
            </div>
          </GlassCard>
        </div>
      )}

      {/* Sub-tab 2: WhatsApp Integration */}
      {subTab === "whatsapp" && (
        <WhatsAppSetting
          form={form}
          setForm={setForm}
          disableInputs={disableInputs}
          canUpdate={!disableInputs}
        />
      )}

      {/* Sub-tab 3: Email / SMTP */}
      {subTab === "smtp" && (
        <SmtpSetting
          form={form}
          setForm={setForm}
          handleChange={handleChange}
          disableInputs={disableInputs}
        />
      )}

      {/* Template Preview Modal */}
      {previewTemplate && (
        <div
          className="fixed inset-0 z-50 bg-black/60 backdrop-blur-sm flex items-center justify-center p-2 sm:p-4"
          onClick={() => setPreviewTemplate(null)}
        >
          <div
            className={`w-full max-w-4xl h-[88dvh] sm:h-[85vh] rounded-2xl border shadow-2xl overflow-hidden flex flex-col ${
              isDark
                ? "bg-slate-800 border-slate-700 text-slate-100"
                : "bg-white border-gray-200 text-gray-900"
            }`}
            onClick={(e) => e.stopPropagation()}
          >
            <div className="px-4 sm:px-6 py-3 sm:py-4 border-b border-gray-200 dark:border-slate-700 flex flex-wrap items-center justify-between gap-2">
              <div className="min-w-0">
                <h3 className="text-sm sm:text-base font-bold truncate">
                  Template Preview —{" "}
                  {SHARED_PDF_DESIGNS.find((d) => d.id === previewTemplate)?.name} (
                  {activePaperSize === "thermal" ? "Thermal Size 58mm × 80mm" : "A4 Size"})
                </h3>
                <p className="text-xs text-gray-500 dark:text-slate-400">
                  Exact shared PDF layout preview ({showLogo ? "Store Logo Enabled" : "Store Logo Hidden"})
                </p>
              </div>
              <div className="flex items-center gap-2 shrink-0">
                {!disableInputs && selectedTemplate !== previewTemplate && (
                  <button
                    type="button"
                    onClick={() => {
                      handleSelectDesign(previewTemplate);
                      setPreviewTemplate(null);
                    }}
                    className="px-3.5 py-1.5 rounded-lg bg-blue-600 text-white text-xs font-semibold hover:bg-blue-700"
                  >
                    Use This Design
                  </button>
                )}
                <button
                  type="button"
                  onClick={() => setPreviewTemplate(null)}
                  className="px-3 py-1.5 rounded-lg border border-gray-300 dark:border-slate-600 text-xs font-semibold"
                >
                  Close
                </button>
              </div>
            </div>
            <div className="flex-1 bg-gray-100 dark:bg-slate-900 p-2 sm:p-4 min-h-0">
              <iframe
                src={`/print/share-preview/${activePaperSize}/${previewTemplate}?show_logo=${
                  showLogo ? 1 : 0
                }&note=${encodeURIComponent(form.note ?? "")}`}
                title="Shared PDF Template Preview"
                className="w-full h-full rounded-xl bg-white border border-gray-200 dark:border-slate-700"
              />
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
