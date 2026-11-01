import React, { useState, useEffect } from "react";
import axios from "axios";
import toast from "react-hot-toast";
import {
  XMarkIcon,
  PaperAirplaneIcon,
  CheckCircleIcon,
  ExclamationTriangleIcon,
  ArrowPathIcon,
  BellAlertIcon,
  CalendarDaysIcon,
  LanguageIcon,
} from "@heroicons/react/24/solid";
import { GlassInput } from "@/components/Glass.jsx";

export default function RegularRefillReminderModal({
  open,
  customer,
  onClose,
  onSent,
}) {
  const [loading, setLoading] = useState(false);
  const [sending, setSending] = useState(false);
  const [previewData, setPreviewData] = useState(null);
  const [phone, setPhone] = useState("");
  const [savePhone, setSavePhone] = useState(true);
  const [language, setLanguage] = useState("english");
  const [message, setMessage] = useState("");
  const [advanceCycle, setAdvanceCycle] = useState(false);
  const [qrStep, setQrStep] = useState({
    open: false,
    status: "qr_ready",
    qr_data_url: null,
  });

  useEffect(() => {
    if (!open || !customer?.id) return;

    const onKeyDown = (e) => {
      if (e.key === "Escape") {
        onClose?.();
      }
    };
    window.addEventListener("keydown", onKeyDown);
    return () => window.removeEventListener("keydown", onKeyDown);
  }, [open, customer?.id, onClose]);

  useEffect(() => {
    if (!open || !customer?.id) return;
    let active = true;
    setLoading(true);
    setPhone(customer.phone || "");
    setAdvanceCycle(false);
    setQrStep({ open: false, status: "qr_ready", qr_data_url: null });

    axios
      .get(`/api/customers/${customer.id}/refill-reminder-preview`)
      .then(({ data }) => {
        if (!active) return;
        setPreviewData(data);
        setPhone(data.phone || customer.phone || "");
        const lang = data.templates?.language || customer.reminder_language || "english";
        setLanguage(lang);
        setMessage(
          lang === "urdu"
            ? data.templates?.urdu || ""
            : data.templates?.english || ""
        );
      })
      .catch((err) => {
        if (!active) return;
        toast.error(
          err?.response?.data?.message || "Failed to load reminder preview"
        );
      })
      .finally(() => {
        if (active) setLoading(false);
      });

    return () => {
      active = false;
    };
  }, [open, customer]);

  // Poll Built-in Free WhatsApp Agent while inline QR code step is open;
  // once connected, automatically dispatch via /api/share/whatsapp.
  useEffect(() => {
    if (!open || !qrStep.open) return;

    const timer = setInterval(async () => {
      try {
        const { data } = await axios.get("/api/settings/whatsapp-agent/status");
        setQrStep((prev) => ({
          ...prev,
          status: data.status || prev.status,
          qr_data_url: data.qr_data_url || prev.qr_data_url,
        }));

        if (data.status === "connected") {
          clearInterval(timer);
          setQrStep((prev) => ({ ...prev, open: false }));
          toast.success("WhatsApp linked! Sending reminder...");
          handleSend();
        }
      } catch {
        // ignore polling error
      }
    }, 2500);

    return () => clearInterval(timer);
  }, [open, qrStep.open]);

  if (!open || !customer) return null;

  const handleLanguageChange = (nextLang) => {
    setLanguage(nextLang);
    if (previewData?.templates) {
      setMessage(
        nextLang === "urdu"
          ? previewData.templates.urdu || ""
          : previewData.templates.english || ""
      );
    }
  };

  const handleSend = async (e) => {
    e?.preventDefault?.();
    if (!phone.trim()) {
      toast.error("Please enter the customer's WhatsApp phone number.");
      return;
    }
    if (!message.trim()) {
      toast.error("Reminder message cannot be empty.");
      return;
    }

    setSending(true);
    try {
      if (!previewData?.whatsapp_enabled) {
        try {
          await axios.post("/api/settings/whatsapp-agent/start");
          setPreviewData((prev) =>
            prev
              ? {
                  ...prev,
                  whatsapp_enabled: true,
                  whatsapp_provider: "local_agent",
                }
              : prev
          );
        } catch {
          // continue
        }
      }

      const { data } = await axios.post("/api/share/whatsapp", {
        type: "regular_refill_reminder",
        id: customer.id,
        customer_id: customer.id,
        phone: phone.trim(),
        language,
        message: message.trim(),
        save_phone: Boolean(savePhone),
        advance_cycle: Boolean(advanceCycle),
      });

      if (data.mode === "cloud_api" || data.status === "sent_via_api") {
        toast.success(
          data.message || `WhatsApp reminder sent to ${customer.name}!`
        );
        onSent?.(data.customer || null);
        onClose?.();
        return;
      }

      if (data.mode === "qr_required" || data.status === "qr_required") {
        setQrStep({
          open: true,
          status: data.agent_status || "qr_ready",
          qr_data_url: data.qr_data_url || null,
        });
        toast(
          "Scan the WhatsApp QR code below once to link your device and send the reminder automatically.",
          { duration: 5000 }
        );
        return;
      }

      const targetPhone = data.normalized_phone || phone.replace(/\D+/g, "");
      const waUrl =
        data.wa_me_url ||
        (targetPhone
          ? `https://wa.me/${targetPhone}?text=${encodeURIComponent(
              message.trim()
            )}`
          : `https://wa.me/?text=${encodeURIComponent(message.trim())}`);

      window.open(waUrl, "_blank", "noopener,noreferrer");
      toast.success("Opened WhatsApp chat with the prepared refill reminder!");

      onSent?.(data.customer || null);
      onClose?.();
    } catch (err) {
      toast.error(
        err?.response?.data?.message || "Failed to send WhatsApp reminder"
      );
    } finally {
      setSending(false);
    }
  };

  const items = previewData?.regular_items || customer?.regular_items || [];
  const stockReady = previewData?.stock_ready ?? customer?.stock_ready ?? true;

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/60 backdrop-blur-xs"
      onClick={() => onClose?.()}
    >
      <div
        role="dialog"
        aria-modal="true"
        aria-labelledby="refill-reminder-modal-title"
        className="bg-white dark:bg-slate-800 rounded-2xl shadow-2xl border border-slate-200 dark:border-slate-700 w-full max-w-4xl max-h-[90vh] flex flex-col overflow-hidden"
        onClick={(e) => e.stopPropagation()}
      >
        {/* Header */}
        <div className="flex items-center justify-between px-6 py-4 border-b border-slate-200 dark:border-slate-700 bg-gradient-to-r from-emerald-50/90 via-white to-teal-50/70 dark:from-slate-800 dark:via-slate-800 dark:to-emerald-950/30">
          <div className="flex items-center gap-3">
            <div className="p-2.5 rounded-xl bg-emerald-600 text-white shadow-xs">
              <BellAlertIcon className="w-5 h-5" />
            </div>
            <div>
              <h2
                id="refill-reminder-modal-title"
                className="text-base font-bold text-slate-900 dark:text-white"
              >
                Send WhatsApp Medicine / Product Readiness Reminder
              </h2>
              <p className="text-xs text-slate-500 dark:text-slate-400">
                Customer: <strong>{customer.name}</strong> • Cycle:{" "}
                <strong className="uppercase">
                  {customer.refill_cycle || "monthly"}
                </strong>{" "}
                {customer.next_refill_date
                  ? `• Due: ${String(customer.next_refill_date).slice(0, 10)}`
                  : ""}
              </p>
            </div>
          </div>

          <button
            type="button"
            onClick={() => onClose?.()}
            className="p-1.5 rounded-lg text-slate-400 hover:text-slate-600 hover:bg-slate-100 dark:hover:bg-slate-700"
            aria-label="Close reminder modal"
          >
            <XMarkIcon className="w-5 h-5" />
          </button>
        </div>

        {/* Body */}
        <form onSubmit={handleSend} className="p-5 overflow-y-auto flex-1">
          {loading ? (
            <div className="py-12 text-center text-slate-500">
              <ArrowPathIcon className="w-7 h-7 animate-spin mx-auto text-emerald-600 mb-2" />
              <p className="text-xs font-medium">
                Checking stock readiness & preparing WhatsApp reminder...
              </p>
            </div>
          ) : (
            <div className="grid grid-cols-1 lg:grid-cols-12 gap-5">
              {/* Left Column: Customer Info, Stock Readiness Checklist, Options */}
              <div className="lg:col-span-5 space-y-4">
                <div>
                  <label
                    htmlFor="reminder-whatsapp-phone"
                    className="block text-xs font-semibold text-slate-700 dark:text-slate-200 mb-1"
                  >
                    Customer WhatsApp Phone *
                  </label>
                  <GlassInput
                    id="reminder-whatsapp-phone"
                    type="tel"
                    autoComplete="tel"
                    autoCorrect="off"
                    autoCapitalize="off"
                    spellCheck={false}
                    placeholder="e.g. 0300-1234567"
                    value={phone}
                    onChange={(e) => setPhone(e.target.value)}
                    className="w-full h-9"
                    required
                  />
                  <label className="inline-flex items-center gap-2 mt-1.5 text-xs text-slate-600 dark:text-slate-400 cursor-pointer">
                    <input
                      type="checkbox"
                      checked={savePhone}
                      onChange={(e) => setSavePhone(e.target.checked)}
                      className="rounded text-emerald-600 focus:ring-emerald-500"
                    />
                    <span>Save phone number to customer profile</span>
                  </label>
                </div>

                {/* Stock Readiness Status Card */}
                <div
                  className={`p-3.5 rounded-xl border ${
                    stockReady
                      ? "bg-emerald-50/70 border-emerald-200 dark:bg-emerald-950/30 dark:border-emerald-800"
                      : "bg-amber-50/80 border-amber-200 dark:bg-amber-950/30 dark:border-amber-800"
                  }`}
                >
                  <div className="flex items-center gap-2 text-xs font-bold">
                    {stockReady ? (
                      <>
                        <CheckCircleIcon className="w-4 h-4 text-emerald-600 dark:text-emerald-400 shrink-0" />
                        <span className="text-emerald-900 dark:text-emerald-200">
                          All Regular Medicines / Products In Stock
                        </span>
                      </>
                    ) : (
                      <>
                        <ExclamationTriangleIcon className="w-4 h-4 text-amber-600 dark:text-amber-400 shrink-0" />
                        <span className="text-amber-900 dark:text-amber-200">
                          Warning: Some items have low stock
                        </span>
                      </>
                    )}
                  </div>

                  {items.length > 0 ? (
                    <ul className="mt-2.5 space-y-1.5 max-h-44 overflow-y-auto pr-1">
                      {items.map((it) => {
                        const prod = it.product || {};
                        const inStock = it.in_stock !== false;
                        const packSize = Math.max(1, Number(prod.pack_size || 1));
                        const totalUnits =
                          Number(it.unit_quantity || 0) > 0
                            ? Number(it.unit_quantity)
                            : Math.max(
                                1,
                                Math.round(
                                  Number(it.pack_quantity || 0) * packSize
                                )
                              );
                        const exactPacks =
                          packSize > 1 && totalUnits % packSize === 0
                            ? totalUnits / packSize
                            : null;
                        return (
                          <li
                            key={it.id || it.product_id}
                            className="flex items-center justify-between text-xs py-1 px-2 rounded-lg bg-white/80 dark:bg-slate-800/80 border border-slate-200/60 dark:border-slate-700"
                          >
                            <div className="truncate pr-2">
                              <span className="font-semibold text-slate-800 dark:text-slate-200">
                                {prod.name || `Product #${it.product_id}`}
                              </span>
                              <span className="block text-[10px] text-slate-500">
                                Req:{" "}
                                {exactPacks
                                  ? `${exactPacks} ${
                                      exactPacks === 1 ? "Pack" : "Packs"
                                    } (${totalUnits} Units)`
                                  : `${totalUnits} ${
                                      totalUnits === 1 ? "Unit" : "Units"
                                    }`}
                              </span>
                            </div>
                            <span
                              className={`px-2 py-0.5 rounded-full text-[10px] font-semibold shrink-0 ${
                                inStock
                                  ? "bg-emerald-100 text-emerald-800 dark:bg-emerald-900/40 dark:text-emerald-300"
                                  : "bg-rose-100 text-rose-800 dark:bg-rose-900/40 dark:text-rose-300"
                              }`}
                            >
                              {inStock
                                ? `Stock: ${prod.quantity ?? "OK"}`
                                : `Low (${prod.quantity ?? 0})`}
                            </span>
                          </li>
                        );
                      })}
                    </ul>
                  ) : (
                    <p className="text-[11px] text-slate-500 mt-1.5">
                      No specific products listed on profile — sending general readiness reminder.
                    </p>
                  )}
                </div>

                {/* Advance Cycle Option */}
                <label className="flex items-start gap-2.5 p-3 rounded-xl bg-slate-50 dark:bg-slate-900/70 border border-slate-200 dark:border-slate-700 cursor-pointer">
                  <input
                    type="checkbox"
                    checked={advanceCycle}
                    onChange={(e) => setAdvanceCycle(e.target.checked)}
                    className="mt-0.5 rounded text-emerald-600 focus:ring-emerald-500"
                  />
                  <div className="text-xs">
                    <span className="font-semibold text-slate-800 dark:text-slate-200 flex items-center gap-1">
                      <CalendarDaysIcon className="w-3.5 h-3.5 text-emerald-600" />
                      <span>Also advance Next Collection Date after sending</span>
                    </span>
                    <span className="block text-[11px] text-slate-500 dark:text-slate-400 mt-0.5">
                      Moves due date forward by 1{" "}
                      {customer.refill_cycle || "monthly"} cycle automatically.
                    </span>
                  </div>
                </label>
              </div>

              {/* Right Column: Language Selector & Editable Message */}
              <div className="lg:col-span-7 flex flex-col space-y-3">
                <div className="flex items-center justify-between gap-2 flex-wrap">
                  <span className="text-xs font-bold text-slate-700 dark:text-slate-200 flex items-center gap-1.5">
                    <LanguageIcon className="w-4 h-4 text-emerald-600" />
                    <span>WhatsApp Reminder Message</span>
                  </span>

                  <div
                    role="radiogroup"
                    aria-label="Reminder Message Language"
                    className="inline-flex rounded-lg p-0.5 bg-slate-100 dark:bg-slate-900 border border-slate-200 dark:border-slate-700"
                  >
                    <button
                      type="button"
                      onClick={() => handleLanguageChange("english")}
                      className={`px-3 py-1 rounded-md text-xs font-semibold transition-all cursor-pointer ${
                        language === "english"
                          ? "bg-emerald-600 text-white shadow-2xs"
                          : "text-slate-600 dark:text-slate-300 hover:text-slate-900"
                      }`}
                    >
                      English Format
                    </button>
                    <button
                      type="button"
                      onClick={() => handleLanguageChange("urdu")}
                      className={`px-3 py-1 rounded-md text-xs font-semibold transition-all cursor-pointer ${
                        language === "urdu"
                          ? "bg-emerald-600 text-white shadow-2xs"
                          : "text-slate-600 dark:text-slate-300 hover:text-slate-900"
                      }`}
                    >
                      اردو فارمیٹ (Urdu)
                    </button>
                  </div>
                </div>

                <textarea
                  id="reminder-whatsapp-message"
                  aria-label="WhatsApp Reminder Message Text"
                  dir={language === "urdu" ? "rtl" : "ltr"}
                  rows={10}
                  value={message}
                  onChange={(e) => setMessage(e.target.value)}
                  className="w-full flex-1 rounded-xl border border-slate-300 dark:border-slate-600 bg-white dark:bg-slate-900 p-3.5 text-xs leading-relaxed text-slate-800 dark:text-slate-100 focus:ring-2 focus:ring-emerald-500 focus:outline-none"
                />

                {qrStep.open && (
                  <div className="p-3.5 rounded-xl bg-amber-50 dark:bg-amber-950/30 border border-amber-200 dark:border-amber-800 flex items-center gap-3">
                    {qrStep.qr_data_url ? (
                      <img
                        src={qrStep.qr_data_url}
                        alt="WhatsApp Link QR Code"
                        className="w-24 h-24 rounded-lg border border-slate-200 bg-white p-1 shrink-0"
                      />
                    ) : (
                      <div className="w-24 h-24 rounded-lg border border-slate-200 bg-white flex items-center justify-center shrink-0">
                        <ArrowPathIcon className="w-6 h-6 animate-spin text-emerald-600" />
                      </div>
                    )}
                    <div className="text-xs text-amber-900 dark:text-amber-200">
                      <p className="font-bold">Link WhatsApp Once to Send Directly</p>
                      <p className="text-[11px] mt-1">
                        Open WhatsApp on your phone → Linked Devices → Link a Device and scan this QR code. Your reminder will be sent automatically once connected.
                      </p>
                    </div>
                  </div>
                )}
              </div>
            </div>
          )}

          {/* Footer */}
          <div className="flex items-center justify-between gap-3 pt-4 mt-4 border-t border-slate-200 dark:border-slate-700">
            <span className="text-[11px] text-slate-500 dark:text-slate-400">
              {previewData?.whatsapp_enabled
                ? `Active Provider: ${previewData.whatsapp_provider || "local_agent"} (Direct 1-Click Send)`
                : "Will open WhatsApp chat with pre-filled message"}
            </span>

            <div className="flex items-center gap-2.5">
              <button
                type="button"
                onClick={() => onClose?.()}
                className="h-9 px-4 rounded-xl text-xs font-semibold border border-slate-200 dark:border-slate-700 text-slate-700 dark:text-slate-300 hover:bg-slate-100 dark:hover:bg-slate-700 cursor-pointer"
              >
                Cancel
              </button>
              <button
                type="submit"
                disabled={sending || loading}
                className="h-9 px-5 rounded-xl text-xs font-semibold bg-emerald-600 hover:bg-emerald-700 disabled:opacity-50 text-white flex items-center gap-1.5 shadow-sm cursor-pointer"
              >
                {sending ? (
                  <ArrowPathIcon className="w-4 h-4 animate-spin" />
                ) : (
                  <PaperAirplaneIcon className="w-4 h-4" />
                )}
                <span>
                  {sending ? "Sending Reminder..." : "Send WhatsApp Reminder"}
                </span>
              </button>
            </div>
          </div>
        </form>
      </div>
    </div>
  );
}

