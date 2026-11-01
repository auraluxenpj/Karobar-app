import React, { useState, useEffect, useCallback } from "react";
import axios from "axios";
import toast from "react-hot-toast";
import {
  ChatBubbleLeftRightIcon,
  CheckCircleIcon,
  ExclamationTriangleIcon,
  EyeIcon,
  EyeSlashIcon,
  PaperAirplaneIcon,
  ArrowPathIcon,
  ShieldCheckIcon,
  QrCodeIcon,
  DevicePhoneMobileIcon,
  PowerIcon,
  LinkSlashIcon,
  SparklesIcon,
} from "@heroicons/react/24/outline";
import { GlassCard, GlassInput, GlassBtn } from "@/components/Glass.jsx";
import { useTheme } from "@/context/ThemeContext";
import { getThemeButtonClasses } from "@/utils/buttonStyles";

const PROVIDER_META = {
  local_agent: {
    label: "Built-in Local WhatsApp Agent (Recommended)",
    badge: "Built-in Multi-Device Bridge",
    isFree: true,
    needsPhoneOrInstanceId: false,
    needsCustomUrl: false,
    tokenLabel: "Local Agent Security Key (Auto-Generated)",
    tokenPlaceholder: "karobar_wa_...",
    urlPlaceholder: "http://127.0.0.1:3001",
    helpText:
      "Runs a local WhatsApp Multi-Device bridge directly on this server. Link your device once via QR code or 8-digit pairing code to dispatch A4 PDF documents directly to recipients.",
  },
  waha: {
    label: "WAHA — WhatsApp HTTP API (Self-Hosted Docker)",
    badge: "Self-Hosted Container",
    isFree: true,
    needsPhoneOrInstanceId: true,
    phoneOrInstanceLabel: "WAHA Session Name",
    phoneOrInstancePlaceholder: "default",
    needsCustomUrl: true,
    tokenLabel: "WAHA API Key (X-Api-Key — Optional)",
    tokenPlaceholder: "Optional X-Api-Key",
    urlPlaceholder: "http://localhost:3000",
    helpText:
      "Connects to a self-hosted WAHA container (`devlikeapro/waha`) and dispatches PDF attachments via POST /api/sendFile.",
  },
  evolution_api: {
    label: "Evolution API (Self-Hosted Gateway)",
    badge: "Self-Hosted Gateway",
    isFree: true,
    needsPhoneOrInstanceId: true,
    phoneOrInstanceLabel: "Evolution Instance Name *",
    phoneOrInstancePlaceholder: "default",
    needsCustomUrl: true,
    tokenLabel: "Evolution API Key (apikey) *",
    tokenPlaceholder: "Enter Evolution API key",
    urlPlaceholder: "http://localhost:8080",
    helpText:
      "Connects to a self-hosted Evolution API instance and dispatches PDF documents via POST /message/sendMedia/{instance}.",
  },
  custom_http: {
    label: "Custom HTTP Webhook / Local Bridge",
    badge: "Custom Endpoint",
    isFree: true,
    needsPhoneOrInstanceId: false,
    needsCustomUrl: true,
    tokenLabel: "Bearer Token / API Key (Optional)",
    tokenPlaceholder: "Optional Bearer token",
    urlPlaceholder: "http://localhost:4000/api/whatsapp/send-pdf",
    helpText:
      "Dispatches a JSON payload containing `to`, `phone`, `caption`, `filename`, `pdf_base64`, and `signed_pdf_url` to your custom endpoint.",
  },
  whapi_cloud: {
    label: "Whapi.Cloud Gateway",
    badge: "Cloud API",
    isFree: false,
    needsPhoneOrInstanceId: false,
    needsCustomUrl: false,
    tokenLabel: "Whapi.Cloud Bearer Token *",
    tokenPlaceholder: "Enter Whapi.Cloud channel token",
    urlPlaceholder: "https://gate.whapi.cloud",
    helpText:
      "External cloud gateway using a Bearer API key to send PDF documents.",
  },
  wasender: {
    label: "WasenderAPI Gateway",
    badge: "Cloud API",
    isFree: false,
    needsPhoneOrInstanceId: false,
    needsCustomUrl: false,
    tokenLabel: "WasenderAPI Bearer Key *",
    tokenPlaceholder: "Enter WasenderAPI key",
    urlPlaceholder: "https://www.wasenderapi.com",
    helpText:
      "External cloud gateway using a single Bearer API key.",
  },
  ultramsg: {
    label: "UltraMsg Gateway",
    badge: "Cloud API",
    isFree: false,
    needsPhoneOrInstanceId: true,
    phoneOrInstanceLabel: "Instance ID *",
    phoneOrInstancePlaceholder: "e.g. instance115092",
    needsCustomUrl: false,
    tokenLabel: "UltraMsg Token *",
    tokenPlaceholder: "Enter UltraMsg instance token",
    urlPlaceholder: "https://api.ultramsg.com",
    helpText:
      "External cloud gateway requiring an Instance ID and Token.",
  },
  green_api: {
    label: "Green-API Gateway",
    badge: "Cloud API",
    isFree: false,
    needsPhoneOrInstanceId: true,
    phoneOrInstanceLabel: "idInstance *",
    phoneOrInstancePlaceholder: "e.g. 7103948571",
    needsCustomUrl: false,
    tokenLabel: "apiTokenInstance *",
    tokenPlaceholder: "Enter Green-API apiTokenInstance",
    urlPlaceholder: "https://api.green-api.com",
    helpText:
      "External cloud gateway requiring idInstance and apiTokenInstance.",
  },
  meta_cloud: {
    label: "Official Meta WhatsApp Cloud API (Graph API)",
    badge: "Meta Business Platform",
    isFree: false,
    needsPhoneOrInstanceId: true,
    phoneOrInstanceLabel: "Meta Phone Number ID *",
    phoneOrInstancePlaceholder: "e.g. 105928374651029",
    needsCustomUrl: false,
    tokenLabel: "Permanent System User Access Token *",
    tokenPlaceholder: "EAAGm0PX4ZCpsBA...",
    urlPlaceholder: "https://graph.facebook.com",
    helpText:
      "Official Meta Graph API with optional template fallback support.",
  },
};

export default function WhatsAppSetting({ form, setForm, canUpdate, disableInputs }) {
  const isEditable = canUpdate !== undefined ? Boolean(canUpdate) : !disableInputs;
  const { isDark, theme } = useTheme();
  const [showToken, setShowToken] = useState(false);
  const [testPhone, setTestPhone] = useState("");
  const [testing, setTesting] = useState(false);
  const [testResult, setTestResult] = useState(null);

  // Built-in Free Local Agent state
  const [agentState, setAgentState] = useState({
    loading: false,
    starting: false,
    agent_running: false,
    status: "stopped", // 'stopped' | 'starting' | 'connecting' | 'qr_ready' | 'connected' | 'disconnected' | 'error'
    qr_data_url: null,
    pairing_code: null,
    user: null,
    last_error: null,
    agent_url: "http://127.0.0.1:3001",
    api_key: "",
  });
  const [pairingPhone, setPairingPhone] = useState("");
  const [requestingPairCode, setRequestingPairCode] = useState(false);
  const [showPairingInput, setShowPairingInput] = useState(false);

  const buttonStyle = theme?.button_style || "modern";
  const themeColors = {
    primary: theme?.primary_color || "#3b82f6",
    primaryHover: theme?.primary_hover || "#2563eb",
    primaryLight: theme?.primary_light || "#dbeafe",
    secondary: theme?.secondary_color || "#8b5cf6",
    secondaryHover: theme?.secondary_hover || "#7c3aed",
    secondaryLight: theme?.secondary_light || "#ede9fe",
  };
  const btnClasses = getThemeButtonClasses(buttonStyle, themeColors, isDark);

  const activeProvider = form.whatsapp_provider || "local_agent";
  const providerConfig = PROVIDER_META[activeProvider] || PROVIDER_META.local_agent;

  const handleFieldChange = (name, value) => {
    setForm((prev) => ({ ...prev, [name]: value }));
  };

  const fetchLocalAgentStatus = useCallback(
    async (silent = true) => {
      if (!silent) {
        setAgentState((s) => ({ ...s, loading: true }));
      }
      try {
        const { data } = await axios.get("/api/settings/whatsapp-agent/status");
        setAgentState((prev) => ({
          ...prev,
          loading: false,
          starting: false,
          agent_running: Boolean(data.agent_running),
          status: data.status || (data.agent_running ? "connecting" : "stopped"),
          qr_data_url: data.qr_data_url || null,
          pairing_code: data.pairing_code || prev.pairing_code || null,
          user: data.user || null,
          last_error: data.last_error || null,
          agent_url: data.agent_url || "http://127.0.0.1:3001",
          api_key: data.api_key || prev.api_key || "",
        }));

        if (data.api_key && !form.whatsapp_access_token) {
          setForm((prev) => ({
            ...prev,
            whatsapp_access_token: data.api_key,
            whatsapp_api_url: data.agent_url || "http://127.0.0.1:3001",
          }));
        }
      } catch {
        setAgentState((prev) => ({ ...prev, loading: false, starting: false }));
      }
    },
    [form.whatsapp_access_token, setForm]
  );

  // Fetch status when local_agent is active, and poll every 3s while waiting for QR scan or connecting
  useEffect(() => {
    if (activeProvider !== "local_agent") return;
    fetchLocalAgentStatus(false);
  }, [activeProvider]);

  useEffect(() => {
    if (activeProvider !== "local_agent") return;
    const shouldPoll =
      agentState.starting ||
      (agentState.agent_running &&
        ["starting", "connecting", "qr_ready", "disconnected"].includes(agentState.status));

    if (!shouldPoll) return;

    const timer = setInterval(() => {
      fetchLocalAgentStatus(true);
    }, 3000);

    return () => clearInterval(timer);
  }, [activeProvider, agentState.starting, agentState.agent_running, agentState.status, fetchLocalAgentStatus]);

  const handleStartLocalAgent = async () => {
    setAgentState((s) => ({ ...s, starting: true, last_error: null }));
    try {
      const { data } = await axios.post("/api/settings/whatsapp-agent/start");
      setAgentState((prev) => ({
        ...prev,
        starting: false,
        agent_running: Boolean(data.agent_running),
        status: data.status || "connecting",
        qr_data_url: data.qr_data_url || null,
        pairing_code: data.pairing_code || null,
        user: data.user || null,
        last_error: data.last_error || null,
        agent_url: data.agent_url || "http://127.0.0.1:3001",
        api_key: data.api_key || prev.api_key,
      }));

      setForm((prev) => ({
        ...prev,
        whatsapp_enabled: true,
        whatsapp_provider: "local_agent",
        whatsapp_api_url: data.agent_url || "http://127.0.0.1:3001",
        whatsapp_access_token: data.api_key || prev.whatsapp_access_token,
      }));

      if (data.status === "connected") {
        toast.success("Built-in Free WhatsApp Agent is connected and ready!");
      } else if (data.agent_running) {
        toast.success("Free WhatsApp Agent started! Scan the QR code with your phone.");
      } else {
        toast.error(data.last_error || data.message || "WhatsApp Agent did not start.");
      }
    } catch (err) {
      const errMsg =
        err?.response?.data?.message ||
        err?.response?.data?.last_error ||
        err?.message ||
        "Failed to start local WhatsApp Agent";
      setAgentState((s) => ({
        ...s,
        starting: false,
        agent_running: false,
        status: "error",
        last_error: errMsg,
      }));
      toast.error(errMsg);
    }
  };

  const handleRequestPairCode = async () => {
    if (!pairingPhone.trim()) {
      toast.error("Enter your WhatsApp phone number first (e.g. 0300-1234567)");
      return;
    }
    setRequestingPairCode(true);
    try {
      const { data } = await axios.post("/api/settings/whatsapp-agent/pair-code", {
        phone: pairingPhone.trim(),
      });
      if (data.pairing_code) {
        setAgentState((prev) => ({
          ...prev,
          pairing_code: data.pairing_code,
        }));
        toast.success("8-Digit Pairing Code generated! Enter it in WhatsApp -> Linked Devices.");
      }
    } catch (err) {
      toast.error(err?.response?.data?.message || "Could not request pairing code");
    } finally {
      setRequestingPairCode(false);
    }
  };

  const handleLogoutLocalAgent = async () => {
    try {
      const { data } = await axios.post("/api/settings/whatsapp-agent/logout");
      setAgentState((prev) => ({
        ...prev,
        status: data.status || "disconnected",
        user: null,
        qr_data_url: data.qr_data_url || null,
        pairing_code: null,
      }));
      toast.success("WhatsApp account unlinked. Generating a fresh QR code...");
    } catch (err) {
      toast.error(err?.response?.data?.message || "Failed to unlink WhatsApp session");
    }
  };

  const handleStopLocalAgent = async () => {
    try {
      await axios.post("/api/settings/whatsapp-agent/stop");
      setAgentState((prev) => ({
        ...prev,
        agent_running: false,
        status: "stopped",
        qr_data_url: null,
        pairing_code: null,
      }));
      toast.success("Local WhatsApp Agent stopped");
    } catch {
      toast.error("Failed to stop agent");
    }
  };

  const handleTestWhatsApp = async () => {
    if (!testPhone.trim()) {
      toast.error("Please enter a recipient phone number to send a test PDF");
      return;
    }

    setTesting(true);
    setTestResult(null);
    try {
      const payload = {
        whatsapp_provider: activeProvider,
        whatsapp_access_token: form.whatsapp_access_token || agentState.api_key || "",
        whatsapp_phone_number_id: form.whatsapp_phone_number_id || "",
        whatsapp_business_account_id: form.whatsapp_business_account_id || "",
        whatsapp_api_version: form.whatsapp_api_version || "v21.0",
        whatsapp_api_url:
          form.whatsapp_api_url ||
          (activeProvider === "local_agent" ? agentState.agent_url : ""),
        whatsapp_default_country_code: form.whatsapp_default_country_code || "92",
        whatsapp_template_name: form.whatsapp_template_name || "",
        whatsapp_template_language: form.whatsapp_template_language || "en_US",
        test_phone: testPhone.trim(),
      };

      const { data } = await axios.post("/api/settings/test-whatsapp", payload);
      setTestResult({
        ok: true,
        message: data.message || "Test WhatsApp PDF sent successfully!",
      });
      toast.success(data.message || "Test WhatsApp PDF sent!");
    } catch (err) {
      const msg =
        err?.response?.data?.message ||
        "WhatsApp API test failed. Please verify your connection or scan the QR code.";
      setTestResult({
        ok: false,
        message: msg,
      });
      toast.error(msg);
    } finally {
      setTesting(false);
    }
  };

  return (
    <div className="space-y-6">
      <GlassCard className="p-4 sm:p-6">
        {/* Header & Enable Toggle */}
        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 pb-5 border-b border-gray-200 dark:border-slate-700">
          <div className="flex items-start gap-3.5">
            <div className="p-3 rounded-xl bg-emerald-100 dark:bg-emerald-900/30 text-emerald-600 dark:text-emerald-400">
              <ChatBubbleLeftRightIcon className="w-6 h-6" />
            </div>
            <div>
              <div className="flex items-center gap-2 flex-wrap">
                <h2 className="text-lg font-bold text-gray-900 dark:text-slate-100">
                  WhatsApp Document Delivery
                </h2>
                <span
                  className={`px-2.5 py-0.5 rounded-full text-xs font-semibold ${
                    form.whatsapp_enabled
                      ? "bg-emerald-100 text-emerald-700 dark:bg-emerald-900/40 dark:text-emerald-300"
                      : "bg-gray-100 text-gray-600 dark:bg-slate-700 dark:text-slate-300"
                  }`}
                >
                  {form.whatsapp_enabled ? "Direct API Active" : "Standard Browser Mode"}
                </span>
              </div>
              <p className="text-xs text-gray-500 dark:text-slate-400 mt-1 max-w-2xl">
                Dispatch Sale Invoices, Purchase Orders, Quotations, Account Statements, and Payment Vouchers directly as A4 PDF attachments on WhatsApp.
              </p>
            </div>
          </div>

          <label className="inline-flex items-center gap-3 cursor-pointer select-none">
            <span className="text-sm font-medium text-gray-700 dark:text-slate-200">
              Enable Direct WhatsApp Delivery
            </span>
            <input
              type="checkbox"
              checked={Boolean(form.whatsapp_enabled)}
              disabled={!isEditable}
              onChange={(e) => handleFieldChange("whatsapp_enabled", e.target.checked)}
              className="w-5 h-5 rounded border-gray-300 text-emerald-600 focus:ring-emerald-500"
            />
          </label>
        </div>

        {/* Provider Selector */}
        <div className="mt-6 space-y-5">
          <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
            <div className="md:col-span-2">
              <label className="block text-xs font-semibold uppercase tracking-wider text-gray-700 dark:text-slate-300 mb-1.5">
                WhatsApp Provider
              </label>
              <select
                name="whatsapp_provider"
                value={activeProvider}
                disabled={!isEditable}
                onChange={(e) => handleFieldChange("whatsapp_provider", e.target.value)}
                className="w-full h-10 rounded-xl border border-gray-300 dark:border-slate-600 bg-white dark:bg-slate-800 px-3 text-sm text-gray-900 dark:text-slate-100 focus:outline-none focus:ring-2 focus:ring-emerald-500/30"
              >
                <optgroup label="Self-Hosted & Built-in Providers">
                  <option value="local_agent">
                    {PROVIDER_META.local_agent.label}
                  </option>
                  <option value="waha">
                    {PROVIDER_META.waha.label}
                  </option>
                  <option value="evolution_api">
                    {PROVIDER_META.evolution_api.label}
                  </option>
                  <option value="custom_http">
                    {PROVIDER_META.custom_http.label}
                  </option>
                </optgroup>
                <optgroup label="External Cloud Gateways">
                  <option value="whapi_cloud">{PROVIDER_META.whapi_cloud.label}</option>
                  <option value="wasender">{PROVIDER_META.wasender.label}</option>
                  <option value="ultramsg">{PROVIDER_META.ultramsg.label}</option>
                  <option value="green_api">{PROVIDER_META.green_api.label}</option>
                  <option value="meta_cloud">{PROVIDER_META.meta_cloud.label}</option>
                </optgroup>
              </select>
            </div>

            <div>
              <label className="block text-xs font-semibold uppercase tracking-wider text-gray-700 dark:text-slate-300 mb-1.5">
                Default Country Code
              </label>
              <GlassInput
                name="whatsapp_default_country_code"
                value={form.whatsapp_default_country_code || "92"}
                disabled={!isEditable}
                onChange={(e) =>
                  handleFieldChange(
                    "whatsapp_default_country_code",
                    e.target.value.replace(/\D+/g, "")
                  )
                }
                autoCorrect="off"
                autoCapitalize="off"
                spellCheck={false}
                placeholder="92"
                className="w-full h-10"
              />
              <p className="text-[11px] text-gray-500 dark:text-slate-400 mt-1">
                Used to format local numbers like <code>0300...</code> → <code>+92300...</code>
              </p>
            </div>
          </div>

          {/* Provider Helper Callout */}
          <div className="p-4 rounded-xl bg-emerald-50/70 dark:bg-emerald-900/15 border border-emerald-200/80 dark:border-emerald-800/60 flex items-start gap-3">
            <ShieldCheckIcon className="w-5 h-5 text-emerald-600 dark:text-emerald-400 shrink-0 mt-0.5" />
            <div className="text-xs text-emerald-900 dark:text-emerald-200 space-y-1">
              <div className="font-semibold flex items-center gap-2 flex-wrap">
                <span>{providerConfig.label}</span>
                <span className="px-2 py-0.5 rounded bg-emerald-200/70 dark:bg-emerald-800 text-emerald-900 dark:text-emerald-100 text-[10px]">
                  {providerConfig.badge}
                </span>
              </div>
              <p className="text-emerald-800/90 dark:text-emerald-300/90 leading-relaxed">
                {providerConfig.helpText}
              </p>
            </div>
          </div>

          {/* ===================================================================== */}
          {/* BUILT-IN FREE LOCAL WHATSAPP AGENT: LIVE QR & PAIRING CONTROL PANEL   */}
          {/* ===================================================================== */}
          {activeProvider === "local_agent" && (
            <div className="rounded-2xl border-2 border-emerald-500/30 dark:border-emerald-500/40 bg-gradient-to-br from-emerald-50/40 via-white to-teal-50/30 dark:from-slate-800/90 dark:via-slate-800 dark:to-emerald-950/20 p-5 space-y-4">
              <div className="flex flex-wrap items-center justify-between gap-3">
                <div className="flex items-center gap-3">
                  <div className="p-2.5 rounded-xl bg-emerald-600 text-white shadow-sm">
                    <QrCodeIcon className="w-5 h-5" />
                  </div>
                  <div>
                    <div className="flex items-center gap-2">
                      <h3 className="text-sm font-bold text-gray-900 dark:text-slate-100">
                        Built-in Free WhatsApp Agent Control Center
                      </h3>
                      <span
                        className={`inline-flex items-center gap-1.5 px-2.5 py-0.5 rounded-full text-xs font-semibold ${
                          agentState.status === "connected"
                            ? "bg-emerald-100 text-emerald-800 dark:bg-emerald-900/50 dark:text-emerald-300"
                            : agentState.status === "qr_ready"
                            ? "bg-amber-100 text-amber-800 dark:bg-amber-900/50 dark:text-amber-300"
                            : agentState.agent_running
                            ? "bg-blue-100 text-blue-800 dark:bg-blue-900/50 dark:text-blue-300"
                            : "bg-gray-200 text-gray-700 dark:bg-slate-700 dark:text-slate-300"
                        }`}
                      >
                        <span
                          className={`w-2 h-2 rounded-full ${
                            agentState.status === "connected"
                              ? "bg-emerald-500"
                              : agentState.status === "qr_ready"
                              ? "bg-amber-500 animate-pulse"
                              : agentState.agent_running
                              ? "bg-blue-500 animate-ping"
                              : "bg-gray-400"
                          }`}
                        />
                        {agentState.status === "connected"
                          ? `Connected (+${agentState.user?.phone || "Linked"})`
                          : agentState.status === "qr_ready"
                          ? "Waiting for QR Code Scan"
                          : agentState.agent_running
                          ? "Connecting to WhatsApp..."
                          : "Agent Stopped"}
                      </span>
                    </div>
                    <p className="text-xs text-gray-500 dark:text-slate-400 mt-0.5">
                      Link your store&apos;s WhatsApp or WhatsApp Business phone once — sends unlimited PDF invoices directly for free.
                    </p>
                  </div>
                </div>

                <div className="flex flex-wrap items-center gap-2">
                  <GlassBtn
                    type="button"
                    disabled={agentState.starting || !isEditable}
                    onClick={handleStartLocalAgent}
                    className={`h-9 px-4 text-xs font-semibold flex items-center gap-1.5 ${btnClasses.primary.className}`}
                    style={btnClasses.primary.style}
                  >
                    {agentState.starting ? (
                      <ArrowPathIcon className="w-4 h-4 animate-spin" />
                    ) : (
                      <SparklesIcon className="w-4 h-4" />
                    )}
                    <span>
                      {agentState.starting
                        ? "Starting Agent..."
                        : agentState.agent_running
                        ? "Refresh QR / Reconnect"
                        : "Start & Link WhatsApp Agent"}
                    </span>
                  </GlassBtn>

                  {agentState.agent_running && (
                    <GlassBtn
                      type="button"
                      onClick={() => fetchLocalAgentStatus(false)}
                      className={`h-9 px-3 text-xs font-semibold flex items-center gap-1 ${btnClasses.secondary.className}`}
                      style={btnClasses.secondary.style}
                      title="Check status"
                    >
                      <ArrowPathIcon
                        className={`w-4 h-4 ${agentState.loading ? "animate-spin" : ""}`}
                      />
                      <span>Check Status</span>
                    </GlassBtn>
                  )}

                  {agentState.agent_running && (
                    <GlassBtn
                      type="button"
                      onClick={handleStopLocalAgent}
                      className="h-9 px-3 text-xs font-semibold flex items-center gap-1 bg-rose-50 text-rose-700 hover:bg-rose-100 dark:bg-rose-900/30 dark:text-rose-300 rounded-lg border border-rose-200 dark:border-rose-800"
                      title="Stop background agent"
                    >
                      <PowerIcon className="w-4 h-4" />
                      <span>Stop</span>
                    </GlassBtn>
                  )}
                </div>
              </div>

              {/* Connected State Banner */}
              {agentState.status === "connected" && (
                <div className="p-4 rounded-xl bg-emerald-100/80 dark:bg-emerald-900/30 border border-emerald-300 dark:border-emerald-700 flex flex-wrap items-center justify-between gap-4">
                  <div className="flex items-center gap-3">
                    <CheckCircleIcon className="w-7 h-7 text-emerald-600 dark:text-emerald-400 shrink-0" />
                    <div>
                      <div className="text-sm font-bold text-emerald-950 dark:text-emerald-100">
                        WhatsApp Linked: +{agentState.user?.phone || "Connected"}{" "}
                        {agentState.user?.name ? `(${agentState.user.name})` : ""}
                      </div>
                      <div className="text-xs text-emerald-800 dark:text-emerald-300">
                        Ready! Clicking &ldquo;Send PDF Document on WhatsApp&rdquo; on any invoice will automatically send the A4 PDF file from this number for free.
                      </div>
                    </div>
                  </div>
                  <button
                    type="button"
                    onClick={handleLogoutLocalAgent}
                    className="px-3 py-1.5 rounded-lg text-xs font-semibold bg-white dark:bg-slate-800 text-rose-600 dark:text-rose-400 border border-rose-200 dark:border-rose-800 hover:bg-rose-50 flex items-center gap-1.5"
                  >
                    <LinkSlashIcon className="w-4 h-4" />
                    <span>Unlink / Change Number</span>
                  </button>
                </div>
              )}

              {/* QR Code & 8-Digit Pairing Code Area when not yet connected */}
              {agentState.agent_running && agentState.status !== "connected" && (
                <div className="grid grid-cols-1 md:grid-cols-2 gap-5 pt-2">
                  {/* Left: QR Code */}
                  <div className="p-4 rounded-xl bg-white dark:bg-slate-900 border border-gray-200 dark:border-slate-700 flex flex-col items-center justify-center text-center">
                    {agentState.qr_data_url ? (
                      <>
                        <div className="p-2 bg-white rounded-xl border border-gray-200 shadow-sm">
                          <img
                            src={agentState.qr_data_url}
                            alt="WhatsApp Multi-Device QR Code"
                            className="w-56 h-56 object-contain"
                          />
                        </div>
                        <p className="text-xs font-semibold text-gray-800 dark:text-slate-200 mt-3">
                          Scan this QR Code with WhatsApp on your phone
                        </p>
                        <p className="text-[11px] text-gray-500 dark:text-slate-400 mt-0.5">
                          Open WhatsApp → <strong>Linked Devices</strong> → <strong>Link a Device</strong>
                        </p>
                      </>
                    ) : (
                      <div className="py-12 flex flex-col items-center gap-2">
                        <ArrowPathIcon className="w-7 h-7 text-emerald-500 animate-spin" />
                        <p className="text-xs font-medium text-gray-600 dark:text-slate-300">
                          Generating WhatsApp Multi-Device QR Code...
                        </p>
                      </div>
                    )}
                  </div>

                  {/* Right: Instructions + 8-Digit Phone Pairing Code Alternative */}
                  <div className="p-4 rounded-xl bg-white dark:bg-slate-900 border border-gray-200 dark:border-slate-700 flex flex-col justify-between space-y-4">
                    <div className="space-y-2.5">
                      <h4 className="text-xs font-bold uppercase tracking-wider text-gray-700 dark:text-slate-300 flex items-center gap-1.5">
                        <DevicePhoneMobileIcon className="w-4 h-4 text-emerald-500" />
                        <span>How to Link in 10 Seconds (Free)</span>
                      </h4>
                      <ol className="text-xs text-gray-600 dark:text-slate-300 space-y-1.5 list-decimal list-inside">
                        <li>Open <strong>WhatsApp</strong> or <strong>WhatsApp Business</strong> on your phone.</li>
                        <li>Tap <strong>Menu (⋮)</strong> or <strong>Settings</strong> → <strong>Linked Devices</strong>.</li>
                        <li>Tap <strong>Link a Device</strong> and point your camera at the QR code on the left.</li>
                        <li>Once linked, your Local API Key is active and invoices will send automatically!</li>
                      </ol>
                    </div>

                    {/* 8-Digit Pairing Code Alternative */}
                    <div className="pt-3 border-t border-gray-200 dark:border-slate-700 space-y-2.5">
                      <div className="flex items-center justify-between">
                        <span className="text-xs font-semibold text-gray-700 dark:text-slate-300">
                          Camera not working? Link with 8-Digit Code instead:
                        </span>
                        <button
                          type="button"
                          onClick={() => setShowPairingInput((v) => !v)}
                          className="text-xs font-semibold text-emerald-600 dark:text-emerald-400 hover:underline"
                        >
                          {showPairingInput ? "Hide" : "Use Phone Number"}
                        </button>
                      </div>

                      {showPairingInput && (
                        <div className="flex flex-col sm:flex-row gap-2">
                          <GlassInput
                            type="tel"
                            autoComplete="tel"
                            autoCorrect="off"
                            autoCapitalize="off"
                            spellCheck={false}
                            value={pairingPhone}
                            onChange={(e) => setPairingPhone(e.target.value)}
                            placeholder="Your WhatsApp No (e.g. 0300-1234567)"
                            className="flex-1 h-9 text-xs"
                          />
                          <GlassBtn
                            type="button"
                            disabled={requestingPairCode}
                            onClick={handleRequestPairCode}
                            className={`h-9 px-3 text-xs font-semibold shrink-0 ${btnClasses.secondary.className}`}
                            style={btnClasses.secondary.style}
                          >
                            {requestingPairCode ? "Getting Code..." : "Get 8-Digit Code"}
                          </GlassBtn>
                        </div>
                      )}

                      {agentState.pairing_code && (
                        <div className="p-3 rounded-xl bg-emerald-50 dark:bg-emerald-900/30 border border-emerald-200 dark:border-emerald-700 text-center">
                          <div className="text-[11px] uppercase tracking-wider text-emerald-700 dark:text-emerald-300 font-semibold">
                            Your 8-Digit WhatsApp Pairing Code
                          </div>
                          <div className="text-xl font-mono font-bold tracking-widest text-emerald-900 dark:text-emerald-100 mt-1">
                            {agentState.pairing_code}
                          </div>
                          <div className="text-[11px] text-emerald-700 dark:text-emerald-300 mt-1">
                            On your phone: Linked Devices → Link a Device → &ldquo;Link with phone number instead&rdquo;
                          </div>
                        </div>
                      )}
                    </div>
                  </div>
                </div>
              )}

              {agentState.last_error && agentState.status !== "connected" && (
                <div className="p-3 rounded-xl bg-amber-50 dark:bg-amber-950/40 border border-amber-200 dark:border-amber-800/70 text-xs text-amber-800 dark:text-amber-300 font-medium break-words">
                  <strong>Diagnostic Note:</strong> {agentState.last_error}
                </div>
              )}
            </div>
          )}

          {/* Credentials Grid */}
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            {/* API Key / Access Token */}
            <div className={providerConfig.needsPhoneOrInstanceId ? "" : "md:col-span-2"}>
              <label className="block text-xs font-semibold uppercase tracking-wider text-gray-700 dark:text-slate-300 mb-1.5">
                {providerConfig.tokenLabel}
              </label>
              <div className="relative">
                <GlassInput
                  type={showToken ? "text" : "password"}
                  name="whatsapp_access_token"
                  value={form.whatsapp_access_token || ""}
                  disabled={!isEditable}
                  onChange={(e) => handleFieldChange("whatsapp_access_token", e.target.value)}
                  autoComplete="off"
                  autoCorrect="off"
                  autoCapitalize="off"
                  spellCheck={false}
                  placeholder={providerConfig.tokenPlaceholder}
                  className="w-full h-10 pr-10 font-mono text-xs"
                />
                <button
                  type="button"
                  onClick={() => setShowToken((s) => !s)}
                  className="absolute right-2.5 top-1/2 -translate-y-1/2 text-gray-400 hover:text-gray-600 dark:hover:text-slate-200"
                  aria-label={showToken ? "Hide API Key" : "Show API Key"}
                >
                  {showToken ? (
                    <EyeSlashIcon className="w-4 h-4" />
                  ) : (
                    <EyeIcon className="w-4 h-4" />
                  )}
                </button>
              </div>
              {activeProvider === "local_agent" && (
                <p className="text-[11px] text-gray-500 dark:text-slate-400 mt-1">
                  Auto-generated local security key used between Karobar ERP and the local Node.js WhatsApp bridge.
                </p>
              )}
            </div>

            {/* Phone Number ID or Instance/Session Name (for WAHA / Evolution / Meta / UltraMsg / Green-API) */}
            {providerConfig.needsPhoneOrInstanceId && (
              <div>
                <label className="block text-xs font-semibold uppercase tracking-wider text-gray-700 dark:text-slate-300 mb-1.5">
                  {providerConfig.phoneOrInstanceLabel}
                </label>
                <GlassInput
                  name="whatsapp_phone_number_id"
                  value={form.whatsapp_phone_number_id || ""}
                  disabled={!isEditable}
                  onChange={(e) => handleFieldChange("whatsapp_phone_number_id", e.target.value)}
                  autoCorrect="off"
                  autoCapitalize="off"
                  spellCheck={false}
                  placeholder={providerConfig.phoneOrInstancePlaceholder}
                  className="w-full h-10 font-mono text-xs"
                />
              </div>
            )}

            {/* Endpoint URL */}
            <div className={activeProvider === "meta_cloud" ? "" : "md:col-span-2"}>
              <label className="block text-xs font-semibold uppercase tracking-wider text-gray-700 dark:text-slate-300 mb-1.5">
                {providerConfig.needsCustomUrl
                  ? "Server / Gateway Base URL *"
                  : "Agent / Gateway URL (Optional Override)"}
              </label>
              <GlassInput
                name="whatsapp_api_url"
                value={form.whatsapp_api_url || ""}
                disabled={!isEditable}
                onChange={(e) => handleFieldChange("whatsapp_api_url", e.target.value)}
                autoCorrect="off"
                autoCapitalize="off"
                spellCheck={false}
                placeholder={providerConfig.urlPlaceholder}
                className="w-full h-10 font-mono text-xs"
              />
              <p className="text-[11px] text-gray-500 dark:text-slate-400 mt-1">
                Default for {activeProvider}: <code>{providerConfig.urlPlaceholder}</code>
              </p>
            </div>

            {/* Meta Cloud API Extra Fields */}
            {activeProvider === "meta_cloud" && (
              <>
                <div>
                  <label className="block text-xs font-semibold uppercase tracking-wider text-gray-700 dark:text-slate-300 mb-1.5">
                    Graph API Version
                  </label>
                  <GlassInput
                    name="whatsapp_api_version"
                    value={form.whatsapp_api_version || "v21.0"}
                    disabled={!isEditable}
                    onChange={(e) => handleFieldChange("whatsapp_api_version", e.target.value)}
                    autoCorrect="off"
                    autoCapitalize="off"
                    spellCheck={false}
                    placeholder="v21.0"
                    className="w-full h-10 font-mono text-xs"
                  />
                </div>

                <div>
                  <label className="block text-xs font-semibold uppercase tracking-wider text-gray-700 dark:text-slate-300 mb-1.5">
                    24h Window Fallback Template Name (Optional)
                  </label>
                  <GlassInput
                    name="whatsapp_template_name"
                    value={form.whatsapp_template_name || ""}
                    disabled={!isEditable}
                    onChange={(e) => handleFieldChange("whatsapp_template_name", e.target.value)}
                    autoCorrect="off"
                    autoCapitalize="off"
                    spellCheck={false}
                    placeholder="e.g. invoice_pdf_utility"
                    className="w-full h-10 font-mono text-xs"
                  />
                </div>

                <div>
                  <label className="block text-xs font-semibold uppercase tracking-wider text-gray-700 dark:text-slate-300 mb-1.5">
                    Template Language Code
                  </label>
                  <GlassInput
                    name="whatsapp_template_language"
                    value={form.whatsapp_template_language || "en_US"}
                    disabled={!isEditable}
                    onChange={(e) =>
                      handleFieldChange("whatsapp_template_language", e.target.value)
                    }
                    autoCorrect="off"
                    autoCapitalize="off"
                    spellCheck={false}
                    placeholder="en_US"
                    className="w-full h-10 font-mono text-xs"
                  />
                </div>
              </>
            )}
          </div>

          {/* Fail-Safe Auto Fallback Toggle */}
          <div className="pt-3 border-t border-gray-200 dark:border-slate-700 flex flex-col sm:flex-row sm:items-center justify-between gap-3">
            <div>
              <div className="text-sm font-semibold text-gray-900 dark:text-slate-100">
                Automatic Browser / Desktop Fallback Protection
              </div>
              <p className="text-xs text-gray-500 dark:text-slate-400">
                If the WhatsApp Agent is temporarily disconnected or unlinked, automatically download the PDF and open the recipient&apos;s WhatsApp chat so invoice sending never fails.
              </p>
            </div>
            <label className="inline-flex items-center gap-2 cursor-pointer select-none shrink-0">
              <input
                type="checkbox"
                checked={
                  form.whatsapp_auto_fallback !== undefined
                    ? Boolean(form.whatsapp_auto_fallback)
                    : true
                }
                disabled={!isEditable}
                onChange={(e) => handleFieldChange("whatsapp_auto_fallback", e.target.checked)}
                className="w-4 h-4 rounded border-gray-300 text-emerald-600 focus:ring-emerald-500"
              />
              <span className="text-xs font-semibold text-gray-700 dark:text-slate-200">
                Auto-Fallback Enabled
              </span>
            </label>
          </div>
        </div>
      </GlassCard>

      {/* Live Test Connection Card */}
      <GlassCard className="p-6">
        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
          <div>
            <h3 className="text-base font-bold text-gray-900 dark:text-slate-100">
              Test WhatsApp PDF Invoice Delivery
            </h3>
            <p className="text-xs text-gray-500 dark:text-slate-400 mt-0.5">
              Send a sample A4 PDF document to any WhatsApp number to verify your connection right now.
            </p>
          </div>
        </div>

        <div className="mt-4 flex flex-col sm:flex-row items-stretch sm:items-center gap-3">
          <div className="flex-1">
            <GlassInput
              type="tel"
              autoComplete="tel"
              autoCorrect="off"
              autoCapitalize="off"
              spellCheck={false}
              value={testPhone}
              onChange={(e) => setTestPhone(e.target.value)}
              placeholder="Recipient WhatsApp Number (e.g. 0300-1234567 or +923001234567)"
              className="w-full h-10"
            />
          </div>
          <GlassBtn
            type="button"
            disabled={testing || !isEditable}
            onClick={handleTestWhatsApp}
            className={`h-10 px-5 font-semibold flex items-center justify-center gap-2 ${btnClasses.primary.className}`}
            style={btnClasses.primary.style}
          >
            {testing ? (
              <ArrowPathIcon className="w-4 h-4 animate-spin" />
            ) : (
              <PaperAirplaneIcon className="w-4 h-4" />
            )}
            <span>{testing ? "Sending Test PDF..." : "Send Test WhatsApp PDF"}</span>
          </GlassBtn>
        </div>

        {testResult && (
          <div
            className={`mt-4 p-3.5 rounded-xl border flex items-start gap-2.5 text-xs ${
              testResult.ok
                ? "bg-emerald-50 border-emerald-200 text-emerald-800 dark:bg-emerald-900/20 dark:border-emerald-800 dark:text-emerald-300"
                : "bg-rose-50 border-rose-200 text-rose-800 dark:bg-rose-900/20 dark:border-rose-800 dark:text-rose-300"
            }`}
          >
            {testResult.ok ? (
              <CheckCircleIcon className="w-5 h-5 text-emerald-600 dark:text-emerald-400 shrink-0" />
            ) : (
              <ExclamationTriangleIcon className="w-5 h-5 text-rose-600 dark:text-rose-400 shrink-0" />
            )}
            <div className="leading-relaxed">{testResult.message}</div>
          </div>
        )}
      </GlassCard>
    </div>
  );
}
