import React, { useState } from "react";
import {
  SwatchIcon,
  ChatBubbleLeftRightIcon,
  EnvelopeIcon,
  EyeIcon,
  CheckCircleIcon,
  DocumentTextIcon,
  SparklesIcon,
} from "@heroicons/react/24/outline";
import { GlassCard } from "@/components/Glass.jsx";
import { useTheme } from "@/context/ThemeContext";
import WhatsAppSetting from "./WhatsAppSetting.jsx";
import SmtpSetting from "./SmtpSetting.jsx";

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

export default function DocumentSharingSetting({
  form,
  setForm,
  handleChange,
  disableInputs = false,
  initialSubTab = "pdf_design",
}) {
  const { isDark } = useTheme();
  const [subTab, setSubTab] = useState(initialSubTab || "pdf_design");
  const [previewTemplate, setPreviewTemplate] = useState(null);

  const selectedTemplate = form.a4_template || "standard";
  const storeName = form.store_name || "Your Business Name";
  const storeAddress = form.address || "SHOP #3 FAROOQ E AZAM CHOCK";
  const storePhone = form.phone_number || "0300-1234567";
  const rawNote = (form.note || "").trim();
  const hasUrduInNote = /[\u0600-\u06FF]/.test(rawNote);

  const defaultEnglishNote =
    "Refrigerated, loose, used, or cut-strip medicines are non-returnable.\nReturn or exchange is accepted within 7 days along with the original bill.\nThank you for your cooperation.";
  const defaultUrduNote =
    "فریج میڈیسن، کھلی میڈیسن، استعمال شدہ میڈیسن اور کٹی ہوئی میڈیسن ناقابلِ واپسی ہے۔\nواپسی یا تبدیلی 7 دن کے اندر اصل بل کے ہمراہ ہوگی۔\nآپ کے تعاون کا شکریہ۔";

  const englishNotePreview = !hasUrduInNote && rawNote ? rawNote : defaultEnglishNote;
  const urduNotePreview = hasUrduInNote && rawNote ? rawNote : defaultUrduNote;

  const todayFormatted = new Date().toLocaleDateString("en-GB", {
    day: "2-digit",
    month: "short",
    year: "numeric",
  });

  const handleSelectDesign = (templateId) => {
    if (disableInputs) return;
    setForm((prev) => ({ ...prev, a4_template: templateId }));
  };

  const sampleEnglishInvoiceText = `*${storeName}*
${storeAddress}
Tel: ${storePhone}
────────────────────
*SALE INVOICE*
Invoice No: *SI-2026-0001*
Date: ${todayFormatted}
Customer: Allied Medical Store
Items: 4 (18 units)

*Billing Summary*
Invoice Total: *Rs. 14,500.00*
Amount Received: Rs. 10,000.00
Balance Due (This Invoice): Rs. 4,500.00
Total Account Balance Due: *Rs. 12,000.00*

*Terms & Return Policy:*
${englishNotePreview}

Please find the official invoice PDF attached for your records.`;

  const sampleUrduInvoiceText = `*${storeName}*
${storeAddress}
فون نمبر: ${storePhone}
────────────────────
*سیل انوائس / بل کی تفصیل*
بل نمبر: *SI-2026-0001*
تاریخ: ${todayFormatted}
محترم کسٹمر: Allied Medical Store
آئٹمز کی تعداد: 4 (18 یونٹس)

*بل کا خلاصہ:*
کل بل: *Rs. 14,500.00*
وصول شدہ رقم: Rs. 10,000.00
بقایا رقم (موجودہ بل): Rs. 4,500.00
کل کھاتہ بقایا: *Rs. 12,000.00*

*ضروری ہدایات و شرائط:*
${urduNotePreview}

مکمل بل پی ڈی ایف (PDF) فائل کی صورت میں منسلک ہے۔`;

  const subTabs = [
    {
      id: "pdf_design",
      label: "PDF Design & Message Format",
      desc: "Select shared PDF layout & closing note",
      icon: SwatchIcon,
      badge: SHARED_PDF_DESIGNS.find((d) => d.id === selectedTemplate)?.name || "Standard",
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
                    Shared PDF Document Design
                  </h2>
                  <p className="text-xs text-gray-500 dark:text-slate-400 mt-1 max-w-2xl">
                    Select the default A4 PDF design used when generating and sharing Sale Invoices, Purchase Orders, Quotations, Ledgers, and Payment Vouchers via WhatsApp or Email. You can also switch designs on the fly inside the Share window.
                  </p>
                </div>
              </div>
            </div>

            {/* 6 Visual PDF Design Cards */}
            <div className="mt-6 grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
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
                      {/* Mini Visual Schematic of the PDF Template */}
                      <div className="rounded-lg border border-gray-200 dark:border-slate-700 bg-white p-3 mb-3 shadow-inner">
                        <div
                          className="rounded px-2.5 py-1.5 flex items-center justify-between mb-2"
                          style={{
                            backgroundColor: tpl.headerBg,
                            color: tpl.headerText,
                            border:
                              tpl.id === "minimal"
                                ? "1px solid #cbd5e1"
                                : `1px solid ${tpl.accent}`,
                          }}
                        >
                          <div className="font-bold text-[10px] truncate">
                            {storeName}
                          </div>
                          <div
                            className="text-[8px] font-bold uppercase px-1.5 py-0.5 rounded"
                            style={{
                              backgroundColor:
                                tpl.id === "minimal" ? "#f1f5f9" : "rgba(255,255,255,0.18)",
                              color: tpl.id === "minimal" ? "#0f172a" : "#ffffff",
                            }}
                          >
                            INVOICE
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
                        {isSelected ? "Selected Default Design" : "Click to Select"}
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
          </GlassCard>

          {/* Professional Message Formatting & Footer Note */}
          <GlassCard className="p-6 space-y-6">
            <div className="space-y-4">
              <div className="flex flex-wrap items-center justify-between gap-3">
                <div className="flex items-center gap-2.5">
                  <DocumentTextIcon className="w-5 h-5 text-blue-600 dark:text-blue-400" />
                  <div>
                    <h3 className="text-base font-bold text-gray-900 dark:text-slate-100">
                      PDF Invoice Closing Note &amp; Return Policy
                    </h3>
                    <p className="text-xs text-gray-500 dark:text-slate-400">
                      Printed at the bottom of your A4 PDF invoices (supports connected Urdu script &amp; English) and included in outbound WhatsApp &amp; Email messages.
                    </p>
                  </div>
                </div>

                {!disableInputs && (
                  <div className="flex flex-wrap items-center gap-1.5">
                    <button
                      type="button"
                      onClick={() =>
                        setForm((prev) => ({ ...prev, note: defaultEnglishNote }))
                      }
                      className="px-2.5 py-1 rounded-lg text-xs font-semibold border border-blue-200 dark:border-blue-800 bg-blue-50 dark:bg-blue-950/40 text-blue-700 dark:text-blue-300 hover:bg-blue-100"
                    >
                      Use English Note
                    </button>
                    <button
                      type="button"
                      onClick={() =>
                        setForm((prev) => ({ ...prev, note: defaultUrduNote }))
                      }
                      className="px-2.5 py-1 rounded-lg text-xs font-semibold border border-emerald-200 dark:border-emerald-800 bg-emerald-50 dark:bg-emerald-950/40 text-emerald-700 dark:text-emerald-300 hover:bg-emerald-100"
                    >
                      Use Urdu Note (اردو نوٹ)
                    </button>
                  </div>
                )}
              </div>

              <div>
                <textarea
                  name="note"
                  rows={4}
                  disabled={disableInputs}
                  dir={hasUrduInNote ? "rtl" : "ltr"}
                  value={form.note || ""}
                  onChange={(e) =>
                    setForm((prev) => ({ ...prev, note: e.target.value }))
                  }
                  placeholder="Thank you for your business."
                  className={`w-full rounded-xl border p-3 text-sm transition-colors focus:outline-none focus:ring-2 ${
                    hasUrduInNote ? "text-right" : "text-left"
                  } ${
                    isDark
                      ? "bg-slate-900 border-slate-700 text-slate-100 focus:border-blue-500 focus:ring-blue-500/20"
                      : "bg-white border-gray-300 text-gray-900 focus:border-blue-500 focus:ring-blue-500/20"
                  }`}
                />
              </div>
            </div>

            {/* Two Prepared Invoice Text Formats: English & Urdu Side-by-Side */}
            <div className="pt-4 border-t border-gray-200 dark:border-slate-700">
              <div className="flex flex-wrap items-center justify-between gap-2 mb-3">
                <span className="text-xs font-semibold uppercase tracking-wider text-gray-700 dark:text-slate-300 flex items-center gap-1.5">
                  <SparklesIcon className="w-4 h-4 text-emerald-500" />
                  <span>Prepared Outbound Invoice Texts (Selectable in Share Modal)</span>
                </span>
                <span className="text-[11px] text-gray-500 dark:text-slate-400">
                  Switch between English &amp; Urdu with 1 click when sharing any invoice
                </span>
              </div>

              <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
                {/* Format 1: English Invoice Text */}
                <div className="space-y-1.5">
                  <div className="flex items-center justify-between">
                    <span className="text-xs font-bold text-blue-600 dark:text-blue-400">
                      1. Proper English Invoice Format
                    </span>
                    <span className="text-[10px] px-2 py-0.5 rounded-full bg-blue-100 dark:bg-blue-900/40 text-blue-700 dark:text-blue-300 font-semibold">
                      LTR • English
                    </span>
                  </div>
                  <div
                    dir="ltr"
                    className={`rounded-xl border p-4 font-mono text-xs whitespace-pre-wrap leading-relaxed text-left ${
                      isDark
                        ? "bg-slate-900/90 border-slate-700 text-slate-200"
                        : "bg-gray-50 border-gray-200 text-gray-800"
                    }`}
                  >
                    {sampleEnglishInvoiceText}
                  </div>
                </div>

                {/* Format 2: Urdu Invoice Text */}
                <div className="space-y-1.5">
                  <div className="flex items-center justify-between">
                    <span className="text-xs font-bold text-emerald-600 dark:text-emerald-400">
                      2. Proper Urdu Invoice Format (اردو انوائس فارمیٹ)
                    </span>
                    <span className="text-[10px] px-2 py-0.5 rounded-full bg-emerald-100 dark:bg-emerald-900/40 text-emerald-700 dark:text-emerald-300 font-semibold">
                      RTL • اردو
                    </span>
                  </div>
                  <div
                    dir="rtl"
                    className={`rounded-xl border p-4 text-xs whitespace-pre-wrap leading-relaxed text-right ${
                      isDark
                        ? "bg-slate-900/90 border-slate-700 text-slate-200"
                        : "bg-gray-50 border-gray-200 text-gray-800"
                    }`}
                  >
                    {sampleUrduInvoiceText}
                  </div>
                </div>
              </div>
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
                  {SHARED_PDF_DESIGNS.find((d) => d.id === previewTemplate)?.name}
                </h3>
                <p className="text-xs text-gray-500 dark:text-slate-400">
                  Live A4 invoice layout preview
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
                src={`/print/a4-preview/${previewTemplate}`}
                title="A4 Template Preview"
                className="w-full h-full rounded-xl bg-white border border-gray-200 dark:border-slate-700"
              />
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
