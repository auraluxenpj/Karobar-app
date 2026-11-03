import React, { useState, useEffect, useMemo } from "react";
import axios from "axios";
import toast from "react-hot-toast";
import {
  ShareIcon,
  EnvelopeIcon,
  ChatBubbleLeftRightIcon,
  DocumentArrowDownIcon,
  DocumentTextIcon,
  EyeIcon,
  ClipboardDocumentCheckIcon,
  XMarkIcon,
  PaperAirplaneIcon,
  ArrowPathIcon,
  CheckCircleIcon,
  QrCodeIcon,
  SwatchIcon,
} from "@heroicons/react/24/outline";
import { useTheme } from "@/context/ThemeContext";
import { getThemeButtonClasses } from "@/utils/buttonStyles";

const PDF_DESIGN_OPTIONS = [
  { id: "standard", name: "Standard Corporate", short: "Standard" },
  { id: "minimal", name: "Minimal Clean", short: "Minimal" },
  { id: "detailed", name: "Executive Detailed", short: "Detailed" },
  { id: "compact", name: "Compact High-Density", short: "Compact" },
  { id: "bold", name: "Bold Modern", short: "Bold" },
  { id: "barcode", name: "Barcode & SKU", short: "Barcode" },
];

/**
 * Normalize a phone number on the client side for wa.me links (mirrors DocumentShareService::normalizePhone).
 */
function normalizeWhatsAppPhone(rawPhone, defaultCountryCode = "92") {
  if (!rawPhone) return "";
  let digits = String(rawPhone).replace(/\D+/g, "");
  if (!digits) return "";
  if (digits.startsWith("00")) {
    digits = digits.slice(2);
  }
  if (digits.length === 11 && digits.startsWith("03")) {
    return defaultCountryCode + digits.slice(1);
  }
  if (digits.length === 10 && digits.startsWith("3")) {
    return defaultCountryCode + digits;
  }
  if (digits.startsWith("0") && digits.length >= 10 && digits.length <= 11) {
    return defaultCountryCode + digits.slice(1);
  }
  return digits;
}

function base64ToPdfFile(base64, filename) {
  const byteCharacters = atob(base64);
  const byteNumbers = new Array(byteCharacters.length);
  for (let i = 0; i < byteCharacters.length; i++) {
    byteNumbers[i] = byteCharacters.charCodeAt(i);
  }
  const byteArray = new Uint8Array(byteNumbers);
  const blob = new Blob([byteArray], { type: "application/pdf" });
  const file = new File([blob], filename, { type: "application/pdf" });
  return { blob, file };
}

export default function ShareDocumentModal({
  isOpen,
  onClose,
  documentType, // 'sale_invoice' | 'customer_ledger' | 'supplier_ledger' | 'payment' | 'purchase_order' | 'purchase_invoice'
  documentId = null,
  queryParams = {}, // e.g. { customer_id, supplier_id, from, to }
  initialTab = "whatsapp", // 'whatsapp' | 'email'
}) {
  const { isDark, theme } = useTheme();

  const themeColors = useMemo(() => {
    if (!theme) {
      return {
        primary: "#3b82f6",
        primaryHover: "#2563eb",
        primaryLight: "#dbeafe",
        secondary: "#8b5cf6",
        secondaryHover: "#7c3aed",
        secondaryLight: "#ede9fe",
      };
    }
    return {
      primary: theme.primary_color || "#3b82f6",
      primaryHover: theme.primary_hover || "#2563eb",
      primaryLight: theme.primary_light || "#dbeafe",
      secondary: theme.secondary_color || "#8b5cf6",
      secondaryHover: theme.secondary_hover || "#7c3aed",
      secondaryLight: theme.secondary_light || "#ede9fe",
    };
  }, [theme]);

  const buttonStyle = theme?.button_style || "modern";
  const btnClasses = useMemo(
    () => getThemeButtonClasses(buttonStyle, themeColors, isDark),
    [buttonStyle, themeColors, isDark]
  );
  const btnPrimary = btnClasses.primary;
  const btnSecondary = btnClasses.secondary;

  const [activeTab, setActiveTab] = useState(initialTab);
  const [loading, setLoading] = useState(false);
  const [buildingPdf, setBuildingPdf] = useState(false);
  const [meta, setMeta] = useState(null);
  const [selectedDesign, setSelectedDesign] = useState("standard");

  // Built PDF file state
  const [pdfFile, setPdfFile] = useState(null);
  const [pdfBlobUrl, setPdfBlobUrl] = useState(null);
  const [showInlinePreview, setShowInlinePreview] = useState(false);

  // WhatsApp form state
  const [messageLang, setMessageLang] = useState("en"); // 'en' | 'ur'
  const [phoneInput, setPhoneInput] = useState("");
  const [whatsappMessage, setWhatsappMessage] = useState("");
  const [savePhoneToProfile, setSavePhoneToProfile] = useState(true);
  const [sendingWhatsApp, setSendingWhatsApp] = useState(false);

  // Inline QR / Pairing Code state when Built-in Free WhatsApp Agent needs 1-time linking
  const [qrStep, setQrStep] = useState({
    open: false,
    status: "stopped",
    qr_data_url: null,
    pairing_code: null,
    pairing_phone: "",
    requesting_code: false,
  });

  // Email form state
  const [emailInput, setEmailInput] = useState("");
  const [emailSubject, setEmailSubject] = useState("");
  const [emailBody, setEmailBody] = useState("");
  const [saveEmailToProfile, setSaveEmailToProfile] = useState(true);
  const [sendingEmail, setSendingEmail] = useState(false);

  const buildRequestParams = (overrideTemplate = null) => ({
    type: documentType,
    ...(documentId ? { id: documentId } : {}),
    ...queryParams,
    template: overrideTemplate || selectedDesign || "standard",
  });

  useEffect(() => {
    if (!isOpen) return;
    const handleKeyDown = (e) => {
      if (e.key === "Escape") {
        onClose?.();
      }
    };
    window.addEventListener("keydown", handleKeyDown);
    return () => window.removeEventListener("keydown", handleKeyDown);
  }, [isOpen, onClose]);

  useEffect(() => {
    if (isOpen && documentType) {
      setActiveTab(initialTab || "whatsapp");
      setShowInlinePreview(false);
      setQrStep((s) => ({ ...s, open: false, pairing_code: null }));
      loadMetadataAndBuildPdf();
    }
    return () => {
      if (pdfBlobUrl) {
        window.URL.revokeObjectURL(pdfBlobUrl);
      }
    };
  }, [isOpen, documentType, documentId, JSON.stringify(queryParams)]);

  // Poll Built-in Free WhatsApp Agent while the inline QR code step is open;
  // as soon as the user scans the QR code on their phone (status === 'connected'),
  // automatically send the actual PDF attachment.
  useEffect(() => {
    if (!isOpen || !qrStep.open) return;

    const timer = setInterval(async () => {
      try {
        const { data } = await axios.get("/api/settings/whatsapp-agent/status");
        setQrStep((prev) => ({
          ...prev,
          status: data.status || prev.status,
          qr_data_url: data.qr_data_url || prev.qr_data_url,
          pairing_code: data.pairing_code || prev.pairing_code,
        }));

        if (data.status === "connected") {
          clearInterval(timer);
          setQrStep((prev) => ({ ...prev, open: false }));
          toast.success("WhatsApp linked. Dispatching PDF attachment...");
          handleSendWhatsAppPdf();
        }
      } catch {
        // ignore polling error
      }
    }, 2500);

    return () => clearInterval(timer);
  }, [isOpen, qrStep.open]);

  const loadMetadataAndBuildPdf = async () => {
    setLoading(true);
    setBuildingPdf(true);
    try {
      const baseParams = {
        type: documentType,
        ...(documentId ? { id: documentId } : {}),
        ...queryParams,
      };
      const metaRes = await axios.get("/api/share/metadata", { params: baseParams });
      const data = metaRes.data;
      const defaultDesign = data.pdf_template || "standard";

      setMeta(data);
      setSelectedDesign(defaultDesign);
      setMessageLang("en");
      setPhoneInput(data.recipient_phone || data.normalized_phone || "");
      setWhatsappMessage(data.whatsapp_text_en || data.whatsapp_text || "");
      setEmailInput(data.recipient_email || "");
      setEmailSubject(data.email_subject_en || data.email_subject || "");
      setEmailBody(data.email_body_en || data.email_body || "");

      const pdfRes = await axios.get("/api/share/pdf", {
        params: { ...baseParams, template: defaultDesign },
        responseType: "blob",
      });

      const filename = data.filename || `${documentType}_document.pdf`;
      const blob = new Blob([pdfRes.data], { type: "application/pdf" });
      const file = new File([blob], filename, { type: "application/pdf" });

      if (pdfBlobUrl) {
        window.URL.revokeObjectURL(pdfBlobUrl);
      }
      const nextUrl = window.URL.createObjectURL(blob);
      setPdfFile(file);
      setPdfBlobUrl(nextUrl);
    } catch (err) {
      toast.error(
        err?.response?.data?.message || "Failed to generate PDF document for sharing"
      );
    } finally {
      setLoading(false);
      setBuildingPdf(false);
    }
  };

  /**
   * Switch between the English and Urdu formatted invoice/document messages.
   */
  const handleSwitchMessageLang = (lang) => {
    setMessageLang(lang);
    if (!meta) return;
    if (lang === "ur") {
      setWhatsappMessage(meta.whatsapp_text_ur || meta.whatsapp_text || "");
      setEmailSubject(meta.email_subject_ur || meta.email_subject || "");
      setEmailBody(meta.email_body_ur || meta.email_body || "");
    } else {
      setWhatsappMessage(meta.whatsapp_text_en || meta.whatsapp_text || "");
      setEmailSubject(meta.email_subject_en || meta.email_subject || "");
      setEmailBody(meta.email_body_en || meta.email_body || "");
    }
  };

  /**
   * Rebuild the PDF file whenever the user switches the PDF Design template in the modal.
   */
  const handleSelectDesign = async (designId) => {
    if (designId === selectedDesign && pdfFile) return;
    setSelectedDesign(designId);
    setBuildingPdf(true);
    try {
      const params = buildRequestParams(designId);
      const pdfRes = await axios.get("/api/share/pdf", {
        params,
        responseType: "blob",
      });
      const filename = meta?.filename || `${documentType}_document.pdf`;
      const blob = new Blob([pdfRes.data], { type: "application/pdf" });
      const file = new File([blob], filename, { type: "application/pdf" });

      if (pdfBlobUrl) {
        window.URL.revokeObjectURL(pdfBlobUrl);
      }
      const nextUrl = window.URL.createObjectURL(blob);
      setPdfFile(file);
      setPdfBlobUrl(nextUrl);
    } catch {
      toast.error("Could not rebuild PDF with the selected design template");
    } finally {
      setBuildingPdf(false);
    }
  };

  if (!isOpen) return null;

  const defaultCountryCode = meta?.whatsapp_default_country_code || "92";
  const normalizedPhone = normalizeWhatsAppPhone(phoneInput, defaultCountryCode);
  const canUseNativeFileShare =
    typeof navigator !== "undefined" &&
    typeof navigator.canShare === "function" &&
    pdfFile &&
    navigator.canShare({ files: [pdfFile] });

  const triggerBrowserDownload = (fileOrBlob, filename) => {
    const url = window.URL.createObjectURL(fileOrBlob);
    const a = document.createElement("a");
    a.href = url;
    a.download = filename;
    document.body.appendChild(a);
    a.click();
    a.remove();
    setTimeout(() => window.URL.revokeObjectURL(url), 5000);
  };

  /**
   * Build the actual PDF file via backend and send it on WhatsApp as a real PDF attachment.
   */
  const handleSendWhatsAppPdf = async () => {
    if (!phoneInput.trim()) {
      toast.error("Please enter a recipient WhatsApp phone number");
      return;
    }

    setSendingWhatsApp(true);
    try {
      if (!meta?.whatsapp_api_configured) {
        try {
          await axios.post("/api/settings/whatsapp-agent/start");
          setMeta((prev) =>
            prev
              ? {
                  ...prev,
                  whatsapp_api_configured: true,
                  whatsapp_provider: "local_agent",
                }
              : prev
          );
        } catch {
          // continue
        }
      }

      const payload = {
        ...buildRequestParams(selectedDesign),
        phone: phoneInput.trim(),
        message: whatsappMessage.trim() || meta?.document_title || "Attached PDF Document",
        save_phone: Boolean(savePhoneToProfile),
      };

      const { data } = await axios.post("/api/share/whatsapp", payload);

      if (data.mode === "cloud_api") {
        toast.success(data.message || "PDF document sent directly to WhatsApp");
        onClose?.();
        return;
      }

      if (data.mode === "qr_required" || data.status === "qr_required") {
        setQrStep((prev) => ({
          ...prev,
          open: true,
          status: data.agent_status || "qr_ready",
          qr_data_url: data.qr_data_url || prev.qr_data_url,
        }));
        toast("Scan the WhatsApp QR code below once to link your device and send the PDF automatically.", {
          duration: 5000,
        });
        return;
      }

      let currentFile = pdfFile;
      const filename = data.filename || meta?.filename || `${documentType}.pdf`;
      if (data.pdf_base64) {
        const built = base64ToPdfFile(data.pdf_base64, filename);
        currentFile = built.file;
        setPdfFile(built.file);
      }

      if (currentFile) {
        triggerBrowserDownload(currentFile, filename);
      }

      const targetPhone = data.normalized_phone || normalizedPhone;
      const encodedCaption = encodeURIComponent(whatsappMessage.trim());
      const waUrl = targetPhone
        ? `https://wa.me/${targetPhone}?text=${encodedCaption}`
        : `https://wa.me/?text=${encodedCaption}`;

      window.open(waUrl, "_blank", "noopener,noreferrer");
      if (data.status === "api_fallback") {
        toast(data.message || `Direct API unavailable — downloaded ${filename} and opened WhatsApp chat.`, {
          duration: 6000,
        });
      } else {
        toast.success(`Prepared ${filename} — attach the downloaded PDF in WhatsApp`);
      }
    } catch (err) {
      toast.error(
        err?.response?.data?.message || "Failed to generate and send PDF via WhatsApp"
      );
    } finally {
      setSendingWhatsApp(false);
    }
  };

  const handleRequestInlinePairCode = async () => {
    if (!qrStep.pairing_phone.trim()) {
      toast.error("Enter your own WhatsApp number to request an 8-digit pairing code");
      return;
    }
    setQrStep((s) => ({ ...s, requesting_code: true }));
    try {
      const { data } = await axios.post("/api/settings/whatsapp-agent/pair-code", {
        phone: qrStep.pairing_phone.trim(),
      });
      setQrStep((s) => ({
        ...s,
        requesting_code: false,
        pairing_code: data.pairing_code || null,
      }));
      toast.success("Enter the 8-digit code in WhatsApp > Linked Devices");
    } catch (err) {
      setQrStep((s) => ({ ...s, requesting_code: false }));
      toast.error(err?.response?.data?.message || "Could not generate pairing code");
    }
  };

  const handleManualDownloadAndOpenWhatsApp = () => {
    const filename = pdfFile?.name || meta?.filename || `${documentType}.pdf`;
    if (pdfFile) {
      triggerBrowserDownload(pdfFile, filename);
    }
    const encodedCaption = encodeURIComponent(whatsappMessage.trim());
    const waUrl = normalizedPhone
      ? `https://wa.me/${normalizedPhone}?text=${encodedCaption}`
      : `https://wa.me/?text=${encodedCaption}`;
    window.open(waUrl, "_blank", "noopener,noreferrer");
    toast.success(`Downloaded ${filename} and opened WhatsApp`);
  };

  const handleNativeOsFileShare = async () => {
    if (!pdfFile) return;
    try {
      await navigator.share({
        files: [pdfFile],
        title: meta?.document_title || pdfFile.name,
        text: whatsappMessage.trim(),
      });
      toast.success("Shared PDF document");
    } catch (err) {
      if (err?.name !== "AbortError") {
        toast.error("Could not invoke native file share");
      }
    }
  };

  const handleCopyWhatsAppMessage = async () => {
    try {
      await navigator.clipboard.writeText(whatsappMessage);
      toast.success("Message copied to clipboard");
    } catch {
      toast.error("Could not copy message");
    }
  };

  const handleSendEmail = async (e) => {
    e.preventDefault();
    if (!emailInput.trim()) {
      toast.error("Please enter a recipient email address");
      return;
    }
    if (!emailSubject.trim()) {
      toast.error("Please enter an email subject");
      return;
    }

    setSendingEmail(true);
    try {
      const payload = {
        ...buildRequestParams(selectedDesign),
        email: emailInput.trim(),
        subject: emailSubject.trim(),
        message: emailBody,
        save_email: Boolean(saveEmailToProfile),
      };
      const { data } = await axios.post("/api/share/email", payload);
      if (data.delivery_mode === "log_fallback") {
        const filename = data.filename || meta?.filename || `${documentType}.pdf`;
        if (data.pdf_base64) {
          const built = base64ToPdfFile(data.pdf_base64, filename);
          triggerBrowserDownload(built.file, filename);
        } else if (pdfFile) {
          triggerBrowserDownload(pdfFile, filename);
        }
      }
      toast.success(data.message || "Email sent with PDF attachment");
      onClose?.();
    } catch (err) {
      toast.error(
        err?.response?.data?.message || "Failed to send email. Please verify your SMTP configuration."
      );
    } finally {
      setSendingEmail(false);
    }
  };

  const handleDownloadBuiltPdf = () => {
    if (!pdfFile) return;
    triggerBrowserDownload(pdfFile, pdfFile.name);
    toast.success(`Downloaded ${pdfFile.name}`);
  };

  const inputClass = `w-full rounded-lg border px-3.5 py-2 text-sm transition-colors focus:outline-none focus:ring-2 ${
    isDark
      ? "bg-slate-900 border-slate-700 text-slate-100 placeholder-slate-500 focus:border-blue-500 focus:ring-blue-500/20"
      : "bg-white border-gray-300 text-gray-900 placeholder-gray-400 focus:border-blue-500 focus:ring-blue-500/20"
  }`;

  const pdfSizeKb = pdfFile ? (pdfFile.size / 1024).toFixed(1) : null;
  const designOptions = meta?.available_pdf_templates?.length
    ? meta.available_pdf_templates
    : PDF_DESIGN_OPTIONS;

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 backdrop-blur-sm p-3 sm:p-4"
      onClick={onClose}
    >
      <div
        onClick={(e) => e.stopPropagation()}
        className={`w-full max-w-4xl max-h-[92dvh] flex flex-col rounded-2xl border shadow-2xl overflow-hidden transition-all ${
          isDark
            ? "bg-slate-800 border-slate-700 text-slate-100"
            : "bg-white border-gray-200 text-gray-900"
        }`}
      >
        {/* Compact Modal Header with Inline WhatsApp / Email Mode Switcher */}
        <div
          className={`flex flex-wrap items-center justify-between gap-3 px-4 sm:px-6 py-3 border-b shrink-0 ${
            isDark ? "border-slate-700 bg-slate-900/50" : "border-gray-200 bg-gray-50"
          }`}
        >
          <div className="flex items-center gap-2.5 min-w-0">
            <div
              className="p-2 rounded-xl shrink-0"
              style={{
                backgroundColor: isDark ? "rgba(59,130,246,0.15)" : themeColors.primaryLight,
                color: themeColors.primary,
              }}
            >
              <ShareIcon className="w-5 h-5" />
            </div>
            <div className="min-w-0">
              <h2 className="text-base font-bold truncate">
                {meta?.document_title ? `Share Document — ${meta.document_title}` : "Share PDF Document"}
              </h2>
              <p className={`text-xs truncate ${isDark ? "text-slate-400" : "text-gray-500"}`}>
                {meta?.recipient_name
                  ? `Recipient: ${meta.recipient_name}`
                  : "Dispatch A4 PDF via WhatsApp or Email"}
              </p>
            </div>
          </div>

          <div className="flex items-center gap-2">
            <div className="inline-flex items-center gap-1.5">
              <button
                type="button"
                onClick={() => setActiveTab("whatsapp")}
                className={`px-3.5 py-1.5 text-xs font-semibold flex items-center gap-1.5 ${
                  activeTab === "whatsapp" ? btnPrimary.className : btnSecondary.className
                }`}
                style={activeTab === "whatsapp" ? btnPrimary.style : btnSecondary.style}
              >
                <ChatBubbleLeftRightIcon className="w-4 h-4" />
                <span>WhatsApp</span>
              </button>

              <button
                type="button"
                onClick={() => setActiveTab("email")}
                className={`px-3.5 py-1.5 text-xs font-semibold flex items-center gap-1.5 ${
                  activeTab === "email" ? btnPrimary.className : btnSecondary.className
                }`}
                style={activeTab === "email" ? btnPrimary.style : btnSecondary.style}
              >
                <EnvelopeIcon className="w-4 h-4" />
                <span>Email</span>
              </button>
            </div>

            <button
              type="button"
              onClick={onClose}
              className={`p-1.5 rounded-lg transition-colors ${
                isDark
                  ? "text-slate-400 hover:text-slate-200 hover:bg-slate-700"
                  : "text-gray-500 hover:text-gray-800 hover:bg-gray-200"
              }`}
              aria-label="Close modal"
            >
              <XMarkIcon className="w-5 h-5" />
            </button>
          </div>
        </div>

        {/* Compact Built PDF Status & PDF Design Selector Bar */}
        <div
          className={`px-5 py-2.5 border-b flex flex-wrap items-center justify-between gap-2 ${
            isDark ? "bg-slate-900/80 border-slate-700" : "bg-slate-50 border-gray-200"
          }`}
        >
          <div className="flex items-center gap-2">
            <SwatchIcon className="w-4 h-4 text-blue-500 shrink-0" />
            <span className="text-xs font-semibold text-gray-600 dark:text-slate-300">
              PDF Design:
            </span>
            <div className="flex flex-wrap items-center gap-1">
              {designOptions.map((tpl) => {
                const isSelected = selectedDesign === tpl.id;
                return (
                  <button
                    key={tpl.id}
                    type="button"
                    disabled={buildingPdf}
                    onClick={() => handleSelectDesign(tpl.id)}
                    title={tpl.desc || tpl.name}
                    className={`px-2 py-0.5 rounded-md text-xs font-medium transition-all border ${
                      isSelected
                        ? "bg-blue-600 text-white border-blue-600 shadow-sm"
                        : isDark
                        ? "bg-slate-800 text-slate-300 border-slate-700 hover:border-slate-500"
                        : "bg-white text-gray-700 border-gray-300 hover:border-gray-400"
                    }`}
                  >
                    {tpl.name}
                  </button>
                );
              })}
            </div>
          </div>

          <div className="flex items-center gap-3 text-xs">
            <div className="flex items-center gap-1.5">
              {buildingPdf ? (
                <ArrowPathIcon className="w-3.5 h-3.5 text-blue-500 animate-spin" />
              ) : (
                <CheckCircleIcon className="w-3.5 h-3.5 text-emerald-500" />
              )}
              <span className="font-semibold">
                {buildingPdf ? "Rendering..." : pdfFile ? pdfFile.name : "PDF Ready"}
              </span>
              {pdfSizeKb && !buildingPdf && (
                <span className={isDark ? "text-slate-400" : "text-gray-500"}>
                  ({pdfSizeKb} KB)
                </span>
              )}
            </div>

            {pdfBlobUrl && !buildingPdf && (
              <button
                type="button"
                onClick={() => setShowInlinePreview((v) => !v)}
                className="font-semibold text-blue-600 dark:text-blue-400 hover:underline flex items-center gap-1"
              >
                <EyeIcon className="w-3.5 h-3.5" />
                <span>{showInlinePreview ? "Hide Preview" : "Preview"}</span>
              </button>
            )}
            <a
              href="/settings#sharing"
              className={`font-medium hover:underline ${
                isDark ? "text-slate-400 hover:text-slate-200" : "text-gray-500 hover:text-gray-800"
              }`}
            >
              Settings
            </a>
          </div>
        </div>

        {/* Optional Inline PDF Viewer */}
        {showInlinePreview && pdfBlobUrl && (
          <div className="px-5 pt-3">
            <iframe
              src={pdfBlobUrl}
              title="PDF Document Preview"
              className="w-full h-56 rounded-lg border border-gray-300 dark:border-slate-700 bg-white"
            />
          </div>
        )}

        {/* Body Content (2-Column Wide & Short Layout) */}
        <div className="flex-1 min-h-0 px-4 sm:px-6 py-4 max-h-[68dvh] overflow-y-auto">
          {loading ? (
            <div className="py-8 flex flex-col items-center justify-center gap-2.5">
              <ArrowPathIcon className="w-6 h-6 animate-spin text-blue-500" />
              <p className={`text-sm ${isDark ? "text-slate-400" : "text-gray-500"}`}>
                Preparing PDF document...
              </p>
            </div>
          ) : activeTab === "whatsapp" ? (
            <div className="space-y-3">
              <div className="grid grid-cols-1 md:grid-cols-12 gap-4 items-start">
                {/* Left Column: Recipient Number & Delivery Status */}
                <div className="md:col-span-5 space-y-3">
                  <div>
                    <div className="flex items-center justify-between mb-1">
                      <label className="text-xs font-semibold uppercase tracking-wider">
                        Recipient WhatsApp Number {meta?.whatsapp_api_configured ? "*" : ""}
                      </label>
                      {normalizedPhone && (
                        <span className="text-xs font-mono text-emerald-600 dark:text-emerald-400">
                          +{normalizedPhone}
                        </span>
                      )}
                    </div>
                    <input
                      type="tel"
                      autoComplete="tel"
                      autoCorrect="off"
                      autoCapitalize="off"
                      spellCheck={false}
                      value={phoneInput}
                      onChange={(e) => setPhoneInput(e.target.value)}
                      placeholder="e.g. 0300-1234567 or +923001234567"
                      className={inputClass}
                    />
                    <p className={`mt-1 text-[11px] ${isDark ? "text-slate-400" : "text-gray-500"}`}>
                      Auto-formatted with country code <code>+{defaultCountryCode}</code>.
                    </p>
                    {meta?.party_id && (
                      <label className="mt-1.5 inline-flex items-center gap-2 text-xs cursor-pointer select-none">
                        <input
                          type="checkbox"
                          checked={savePhoneToProfile}
                          onChange={(e) => setSavePhoneToProfile(e.target.checked)}
                          className="rounded border-gray-300 text-blue-600 focus:ring-blue-500"
                        />
                        <span className={isDark ? "text-slate-300" : "text-gray-600"}>
                          Save phone to {meta.recipient_name}&apos;s profile
                        </span>
                      </label>
                    )}
                  </div>

                  {/* Compact WhatsApp Delivery Mode Status Card */}
                  <div
                    className={`p-3 rounded-xl border text-xs space-y-1.5 ${
                      meta?.whatsapp_api_configured
                        ? isDark
                          ? "bg-emerald-900/20 border-emerald-700/60 text-emerald-300"
                          : "bg-emerald-50 border-emerald-200 text-emerald-800"
                        : isDark
                        ? "bg-slate-900/60 border-slate-700 text-slate-300"
                        : "bg-gray-50 border-gray-200 text-gray-700"
                    }`}
                  >
                    <div className="flex items-center justify-between gap-2">
                      <div className="flex items-center gap-1.5 font-semibold">
                        <span
                          className={`w-2 h-2 rounded-full shrink-0 ${
                            meta?.whatsapp_api_configured ? "bg-emerald-500" : "bg-amber-500"
                          }`}
                        />
                        <span>
                          {meta?.whatsapp_api_configured
                            ? `Direct WhatsApp (${meta.whatsapp_provider || "local_agent"})`
                            : "Browser WhatsApp Mode"}
                        </span>
                      </div>
                      <a
                        href="/settings#whatsapp"
                        className="font-semibold text-blue-600 dark:text-blue-400 hover:underline"
                      >
                        Configure
                      </a>
                    </div>
                    <p className={`text-[11px] leading-snug ${isDark ? "text-slate-400" : "text-gray-600"}`}>
                      {meta?.whatsapp_api_configured
                        ? "Sends the A4 PDF file directly as a WhatsApp attachment."
                        : "Downloads the PDF file and opens the recipient WhatsApp chat."}
                    </p>
                  </div>
                </div>

                {/* Right Column: Format Toggle (English / Urdu) + Accompanying Message */}
                <div className="md:col-span-7">
                  <div className="flex flex-wrap items-center justify-between gap-2 mb-1.5">
                    <div className="flex items-center gap-2">
                      <label
                        htmlFor="share-whatsapp-message"
                        className="text-xs font-semibold uppercase tracking-wider"
                      >
                        WhatsApp Message:
                      </label>
                      <div
                        className={`inline-flex rounded-lg p-0.5 border ${
                          isDark ? "bg-slate-900 border-slate-700" : "bg-gray-100 border-gray-300"
                        }`}
                      >
                        <button
                          type="button"
                          onClick={() => handleSwitchMessageLang("en")}
                          className={`px-2.5 py-0.5 rounded-md text-xs font-semibold transition-all ${
                            messageLang === "en"
                              ? "bg-blue-600 text-white shadow-sm"
                              : isDark
                              ? "text-slate-300 hover:text-white"
                              : "text-gray-700 hover:text-gray-900"
                          }`}
                        >
                          English Format
                        </button>
                        <button
                          type="button"
                          onClick={() => handleSwitchMessageLang("ur")}
                          className={`px-2.5 py-0.5 rounded-md text-xs font-semibold transition-all ${
                            messageLang === "ur"
                              ? "bg-emerald-600 text-white shadow-sm"
                              : isDark
                              ? "text-slate-300 hover:text-white"
                              : "text-gray-700 hover:text-gray-900"
                          }`}
                        >
                          Urdu Format (اردو فارمیٹ)
                        </button>
                      </div>
                    </div>
                    <div className="flex items-center gap-3">
                      <button
                        type="button"
                        onClick={() => setWhatsappMessage("")}
                        className="text-xs font-semibold text-gray-500 dark:text-slate-400 hover:text-red-600 dark:hover:text-red-400 flex items-center gap-1"
                        title="Clear message to type your own custom text"
                      >
                        <XMarkIcon className="w-3.5 h-3.5" />
                        Clear
                      </button>
                      <button
                        type="button"
                        onClick={handleCopyWhatsAppMessage}
                        className="text-xs font-semibold text-blue-600 dark:text-blue-400 hover:underline flex items-center gap-1"
                      >
                        <ClipboardDocumentCheckIcon className="w-4 h-4" />
                        Copy Text
                      </button>
                    </div>
                  </div>
                  <textarea
                    id="share-whatsapp-message"
                    name="whatsapp_message"
                    rows={6}
                    dir={messageLang === "ur" ? "rtl" : "ltr"}
                    value={whatsappMessage}
                    onChange={(e) => setWhatsappMessage(e.target.value)}
                    placeholder="Type any custom WhatsApp message you want to send..."
                    className={`${inputClass} text-xs leading-relaxed ${
                      messageLang === "ur" ? "text-right" : "text-left"
                    }`}
                  />
                </div>
              </div>

              {/* Inline 1-Time WhatsApp QR / Pairing Code Box when Built-in Free Agent needs linking */}
              {qrStep.open && (
                <div className="p-3.5 rounded-xl border-2 border-emerald-500/60 bg-emerald-50/60 dark:bg-emerald-950/30 space-y-2.5">
                  <div className="flex items-center justify-between gap-2">
                    <div className="flex items-center gap-2">
                      <QrCodeIcon className="w-5 h-5 text-emerald-600 dark:text-emerald-400" />
                      <span className="text-xs font-bold text-emerald-950 dark:text-emerald-100">
                        Link WhatsApp Device to Dispatch PDF Attachment
                      </span>
                    </div>
                    <button
                      type="button"
                      onClick={() => setQrStep((s) => ({ ...s, open: false }))}
                      className="text-xs text-gray-500 hover:text-gray-800 dark:text-slate-400"
                    >
                      Close
                    </button>
                  </div>

                  <div className="grid grid-cols-1 sm:grid-cols-2 gap-4 items-center">
                    <div className="flex flex-col items-center justify-center bg-white p-2.5 rounded-xl border border-emerald-200">
                      {qrStep.qr_data_url ? (
                        <img
                          src={qrStep.qr_data_url}
                          alt="WhatsApp QR Code"
                          className="w-36 h-36 object-contain"
                        />
                      ) : (
                        <div className="h-36 flex flex-col items-center justify-center gap-2 text-center px-3">
                          <ArrowPathIcon className="w-6 h-6 text-emerald-600 animate-spin" />
                          <span className="text-xs text-gray-600">
                            Generating QR Code...
                          </span>
                        </div>
                      )}
                    </div>

                    <div className="space-y-2 text-xs">
                      <ol className="list-decimal list-inside space-y-1 text-gray-700 dark:text-slate-200">
                        <li>Open <strong>WhatsApp</strong> on your phone.</li>
                        <li>Select <strong>Linked Devices &gt; Link a Device</strong>.</li>
                        <li>Scan this code. The PDF will be sent automatically once linked.</li>
                      </ol>

                      <div className="pt-2 border-t border-emerald-200/70 dark:border-emerald-800/60 space-y-1.5">
                        <div className="font-semibold text-gray-700 dark:text-slate-300">
                          Or link using an 8-digit pairing code:
                        </div>
                        <div className="flex gap-1.5">
                          <input
                            type="tel"
                            autoComplete="tel"
                            autoCorrect="off"
                            autoCapitalize="off"
                            spellCheck={false}
                            value={qrStep.pairing_phone}
                            onChange={(e) =>
                              setQrStep((s) => ({ ...s, pairing_phone: e.target.value }))
                            }
                            placeholder="Your WhatsApp No (0300...)"
                            className="flex-1 rounded-lg border border-gray-300 dark:border-slate-600 bg-white dark:bg-slate-900 px-2.5 py-1.5 text-xs"
                          />
                          <button
                            type="button"
                            disabled={qrStep.requesting_code}
                            onClick={handleRequestInlinePairCode}
                            className="px-2.5 py-1.5 rounded-lg bg-emerald-600 text-white font-semibold text-xs hover:bg-emerald-700"
                          >
                            {qrStep.requesting_code ? "..." : "Get Code"}
                          </button>
                        </div>
                        {qrStep.pairing_code && (
                          <div className="p-1.5 rounded-lg bg-white dark:bg-slate-900 border border-emerald-300 text-center font-mono font-bold text-sm tracking-widest text-emerald-700 dark:text-emerald-300">
                            {qrStep.pairing_code}
                          </div>
                        )}
                      </div>
                    </div>
                  </div>
                </div>
              )}
            </div>
          ) : (
            <form id="share-email-form" onSubmit={handleSendEmail}>
              <div className="grid grid-cols-1 md:grid-cols-12 gap-4 items-start">
                {/* Left Column: Recipient Email & Subject */}
                <div className="md:col-span-5 space-y-3">
                  <div>
                    <label className="block text-xs font-semibold uppercase tracking-wider mb-1">
                      Recipient Email Address *
                    </label>
                    <input
                      type="email"
                      required
                      autoComplete="email"
                      autoCorrect="off"
                      autoCapitalize="off"
                      spellCheck={false}
                      value={emailInput}
                      onChange={(e) => setEmailInput(e.target.value)}
                      placeholder="customer@example.com"
                      className={inputClass}
                    />
                    {meta?.party_id && (
                      <label className="mt-1.5 inline-flex items-center gap-2 text-xs cursor-pointer select-none">
                        <input
                          type="checkbox"
                          checked={saveEmailToProfile}
                          onChange={(e) => setSaveEmailToProfile(e.target.checked)}
                          className="rounded border-gray-300 text-blue-600 focus:ring-blue-500"
                        />
                        <span className={isDark ? "text-slate-300" : "text-gray-600"}>
                          Save email to {meta.recipient_name}&apos;s profile
                        </span>
                      </label>
                    )}
                  </div>

                  <div>
                    <label className="block text-xs font-semibold uppercase tracking-wider mb-1">
                      Subject *
                    </label>
                    <input
                      type="text"
                      required
                      dir={messageLang === "ur" ? "rtl" : "ltr"}
                      value={emailSubject}
                      onChange={(e) => setEmailSubject(e.target.value)}
                      className={inputClass}
                    />
                  </div>
                </div>

                {/* Right Column: Language Format Toggle & Email Message */}
                <div className="md:col-span-7">
                  <div className="flex flex-wrap items-center justify-between gap-2 mb-1.5">
                    <label className="block text-xs font-semibold uppercase tracking-wider">
                      Email Message *
                    </label>
                    <div
                      className={`inline-flex rounded-lg p-0.5 border ${
                        isDark ? "bg-slate-900 border-slate-700" : "bg-gray-100 border-gray-300"
                      }`}
                    >
                      <button
                        type="button"
                        onClick={() => handleSwitchMessageLang("en")}
                        className={`px-2.5 py-0.5 rounded-md text-xs font-semibold transition-all ${
                          messageLang === "en"
                            ? "bg-blue-600 text-white shadow-sm"
                            : isDark
                            ? "text-slate-300 hover:text-white"
                            : "text-gray-700 hover:text-gray-900"
                        }`}
                      >
                        English Format
                      </button>
                      <button
                        type="button"
                        onClick={() => handleSwitchMessageLang("ur")}
                        className={`px-2.5 py-0.5 rounded-md text-xs font-semibold transition-all ${
                          messageLang === "ur"
                            ? "bg-emerald-600 text-white shadow-sm"
                            : isDark
                            ? "text-slate-300 hover:text-white"
                            : "text-gray-700 hover:text-gray-900"
                        }`}
                      >
                        Urdu Format (اردو فارمیٹ)
                      </button>
                    </div>
                  </div>
                  <textarea
                    rows={5}
                    required
                    dir={messageLang === "ur" ? "rtl" : "ltr"}
                    value={emailBody}
                    onChange={(e) => setEmailBody(e.target.value)}
                    className={`${inputClass} text-xs leading-relaxed ${
                      messageLang === "ur" ? "text-right" : "text-left"
                    }`}
                  />
                </div>
              </div>
            </form>
          )}
        </div>

        {/* Compact Unified Modal Footer */}
        <div
          className={`flex flex-wrap items-center justify-between gap-2.5 px-4 sm:px-6 py-3 border-t shrink-0 ${
            isDark ? "border-slate-700 bg-slate-900/50" : "border-gray-200 bg-gray-50"
          }`}
        >
          <div className="flex flex-wrap items-center gap-2">
            <button
              type="button"
              disabled={!pdfBlobUrl || buildingPdf}
              onClick={() => window.open(pdfBlobUrl, "_blank", "noopener,noreferrer")}
              className={`px-3.5 py-2 text-xs font-semibold flex items-center gap-1.5 ${btnSecondary.className}`}
              style={btnSecondary.style}
            >
              <EyeIcon className="w-4 h-4" />
              <span>Open PDF</span>
            </button>
            <button
              type="button"
              disabled={!pdfFile || buildingPdf}
              onClick={handleDownloadBuiltPdf}
              className={`px-3.5 py-2 text-xs font-semibold flex items-center gap-1.5 ${btnSecondary.className}`}
              style={btnSecondary.style}
            >
              <DocumentArrowDownIcon className="w-4 h-4" />
              <span>Download PDF</span>
            </button>
          </div>

          <div className="flex flex-wrap items-center gap-2">
            {activeTab === "whatsapp" ? (
              <>
                {canUseNativeFileShare && (
                  <button
                    type="button"
                    onClick={handleNativeOsFileShare}
                    className={`px-3.5 py-2 text-xs font-semibold flex items-center gap-1.5 ${btnSecondary.className}`}
                    style={btnSecondary.style}
                  >
                    <DocumentTextIcon className="w-4 h-4" />
                    <span>System Share</span>
                  </button>
                )}

                <button
                  type="button"
                  onClick={handleManualDownloadAndOpenWhatsApp}
                  className={`px-3.5 py-2 text-xs font-semibold flex items-center gap-1.5 ${btnSecondary.className}`}
                  style={btnSecondary.style}
                >
                  <DocumentArrowDownIcon className="w-4 h-4" />
                  <span>Download &amp; Open WhatsApp</span>
                </button>

                <button
                  type="button"
                  disabled={sendingWhatsApp || buildingPdf}
                  onClick={handleSendWhatsAppPdf}
                  className={`px-4 py-2 text-xs font-semibold flex items-center gap-1.5 ${btnPrimary.className}`}
                  style={btnPrimary.style}
                >
                  {sendingWhatsApp ? (
                    <ArrowPathIcon className="w-4 h-4 animate-spin" />
                  ) : (
                    <ChatBubbleLeftRightIcon className="w-4 h-4" />
                  )}
                  <span>
                    {sendingWhatsApp ? "Sending PDF..." : "Send PDF via WhatsApp"}
                  </span>
                </button>
              </>
            ) : (
              <button
                type="submit"
                form="share-email-form"
                disabled={sendingEmail || buildingPdf}
                className={`px-4 py-2 text-xs font-semibold flex items-center gap-1.5 ${btnPrimary.className}`}
                style={btnPrimary.style}
              >
                {sendingEmail ? (
                  <ArrowPathIcon className="w-4 h-4 animate-spin" />
                ) : (
                  <PaperAirplaneIcon className="w-4 h-4" />
                )}
                <span>{sendingEmail ? "Sending Email..." : "Send Email with PDF"}</span>
              </button>
            )}

            <button
              type="button"
              onClick={onClose}
              className={`px-3.5 py-2 text-xs font-semibold ${btnSecondary.className}`}
              style={btnSecondary.style}
            >
              Close
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}
