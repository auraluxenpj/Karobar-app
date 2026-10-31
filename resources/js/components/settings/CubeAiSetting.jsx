// resources/js/components/settings/CubeAiSetting.jsx
import React, { useState } from "react";
import axios from "axios";
import toast from "react-hot-toast";
import {
  SparklesIcon,
  EyeIcon,
  EyeSlashIcon,
  ShieldCheckIcon,
  BoltIcon,
  CpuChipIcon,
  CheckCircleIcon,
  ArrowTopRightOnSquareIcon,
  KeyIcon,
} from "@heroicons/react/24/solid";
import { useTheme } from "@/context/ThemeContext";

const GROQ_API_KEYS_URL = "https://console.groq.com/keys";
const GEMINI_API_KEYS_URL = "https://aistudio.google.com/apikey";

const GROQ_FREE_MODELS = [
  {
    value: "openai/gpt-oss-120b",
    label: "OpenAI GPT-OSS 120B (Recommended — Production Free Tier)",
  },
  {
    value: "openai/gpt-oss-20b",
    label: "OpenAI GPT-OSS 20B (Ultra-Fast Production Free Tier)",
  },
  {
    value: "qwen/qwen3.8-27b",
    label: "Qwen 3.8 27B (Multilingual & Reasoning Free Tier)",
  },
  {
    value: "groq/compound-mini",
    label: "Groq Compound Mini (Fast Agentic Free Tier)",
  },
  {
    value: "groq/compound",
    label: "Groq Compound (Production Agentic Free Tier)",
  },
  {
    value: "moonshotai/kimi-k2-instruct-0905",
    label: "Kimi K2 Instruct (High-Capacity Free Tier)",
  },
  {
    value: "meta-llama/llama-4-maverick-17b-128e-instruct",
    label: "Llama 4 Maverick 17B Instruct (Free Tier)",
  },
  {
    value: "meta-llama/llama-4-scout-17b-16e-instruct",
    label: "Llama 4 Scout 17B Instruct (Free Tier)",
  },
  {
    value: "llama-3.3-70b-versatile",
    label: "Llama 3.3 70B Versatile (Free Tier)",
  },
  {
    value: "llama-3.1-8b-instant",
    label: "Llama 3.1 8B Instant (Free Tier)",
  },
];

const GEMINI_FREE_MODELS = [
  {
    value: "gemini-3.8-flash",
    label: "Gemini 3.8 Flash (Recommended — Official Free Tier)",
  },
  {
    value: "gemini-2.5-flash",
    label: "Gemini 2.5 Flash (Standard Free Tier)",
  },
  {
    value: "gemini-3.5-flash-lite",
    label: "Gemini 3.5 Flash-Lite (High-Throughput Free Tier)",
  },
  {
    value: "gemini-2.5-flash-lite",
    label: "Gemini 2.5 Flash-Lite (Fast Free Tier)",
  },
  {
    value: "gemini-3.1-flash-lite",
    label: "Gemini 3.1 Flash-Lite (Free Tier)",
  },
  {
    value: "gemma-4-31b-it",
    label: "Gemma 4 31B IT (Open Model Free Tier)",
  },
  {
    value: "gemma-4-26b-a4b-it",
    label: "Gemma 4 26B A4B IT (MoE Free Tier)",
  },
];

function SettingSwitch({ id, checked, onChange, disabled, labelOn, labelOff, isDark }) {
  return (
    <label
      htmlFor={id}
      className={`inline-flex items-center gap-2.5 select-none shrink-0 ${
        disabled ? "opacity-60 cursor-not-allowed" : "cursor-pointer"
      }`}
    >
      <input
        id={id}
        type="checkbox"
        checked={Boolean(checked)}
        disabled={disabled}
        onChange={(e) => onChange(e.target.checked)}
        className="sr-only peer"
      />
      <span
        aria-hidden="true"
        className={`relative inline-flex h-6 w-11 shrink-0 items-center rounded-full transition-colors duration-200 ${
          checked
            ? "bg-emerald-500"
            : isDark
            ? "bg-slate-700"
            : "bg-slate-300"
        }`}
      >
        <span
          className={`inline-block h-4 w-4 transform rounded-full bg-white shadow-xs transition-transform duration-200 ${
            checked ? "translate-x-6" : "translate-x-1"
          }`}
        />
      </span>
      <span
        className={`text-xs font-semibold uppercase tracking-wider ${
          checked
            ? isDark
              ? "text-emerald-400"
              : "text-emerald-700"
            : isDark
            ? "text-slate-400"
            : "text-slate-600"
        }`}
      >
        {checked ? labelOn : labelOff}
      </span>
    </label>
  );
}

export default function CubeAiSetting({
  form,
  setForm,
  handleChange,
  disableInputs,
  usageSummary,
}) {
  const { isDark } = useTheme();
  const [showGroqKey, setShowGroqKey] = useState(false);
  const [showGeminiKey, setShowGeminiKey] = useState(false);
  const [testingGroq, setTestingGroq] = useState(false);
  const [testingGemini, setTestingGemini] = useState(false);
  const [discoveredGroqModels, setDiscoveredGroqModels] = useState([]);
  const [discoveredGeminiModels, setDiscoveredGeminiModels] = useState([]);

  const groqModelOptions = React.useMemo(() => {
    const map = new Map();
    discoveredGroqModels.forEach((id) => {
      const existing = GROQ_FREE_MODELS.find((m) => m.value === id);
      map.set(id, {
        value: id,
        label: existing ? `${existing.label} ✓` : `${id} (Available on your key ✓)`,
      });
    });
    GROQ_FREE_MODELS.forEach((m) => {
      if (!map.has(m.value)) {
        map.set(m.value, m);
      }
    });
    if (form.cube_groq_model && !map.has(form.cube_groq_model)) {
      map.set(form.cube_groq_model, {
        value: form.cube_groq_model,
        label: `${form.cube_groq_model} (Active)`,
      });
    }
    return Array.from(map.values());
  }, [discoveredGroqModels, form.cube_groq_model]);

  const geminiModelOptions = React.useMemo(() => {
    const map = new Map();
    discoveredGeminiModels.forEach((id) => {
      const existing = GEMINI_FREE_MODELS.find((m) => m.value === id);
      map.set(id, {
        value: id,
        label: existing ? `${existing.label} ✓` : `${id} (Available on your key ✓)`,
      });
    });
    GEMINI_FREE_MODELS.forEach((m) => {
      if (!map.has(m.value)) {
        map.set(m.value, m);
      }
    });
    if (form.cube_gemini_model && !map.has(form.cube_gemini_model)) {
      map.set(form.cube_gemini_model, {
        value: form.cube_gemini_model,
        label: `${form.cube_gemini_model} (Active)`,
      });
    }
    return Array.from(map.values());
  }, [discoveredGeminiModels, form.cube_gemini_model]);

  const setBooleanField = (fieldName, nextValue) => {
    if (disableInputs) return;
    setForm?.((prev) => ({
      ...prev,
      [fieldName]: Boolean(nextValue),
    }));
  };

  const handleTestProvider = async (provider) => {
    const isGroq = provider === "groq";
    const apiKey = (
      isGroq ? form.cube_groq_api_key : form.cube_gemini_api_key
    )?.trim();
    const model = isGroq
      ? form.cube_groq_model || "openai/gpt-oss-120b"
      : form.cube_gemini_model || "gemini-3.8-flash";

    if (!apiKey) {
      toast.error(
        `Please enter your ${isGroq ? "Groq" : "Google Gemini"} API Key first.`
      );
      return;
    }

    try {
      if (isGroq) setTestingGroq(true);
      else setTestingGemini(true);

      const { data } = await axios.post("/api/settings/test-cube-ai", {
        provider,
        api_key: apiKey,
        model,
      });

      if (Array.isArray(data?.available_models) && data.available_models.length > 0) {
        if (isGroq) setDiscoveredGroqModels(data.available_models);
        else setDiscoveredGeminiModels(data.available_models);
      }

      if (data?.model) {
        setForm?.((prev) => ({
          ...prev,
          [isGroq ? "cube_groq_model" : "cube_gemini_model"]: data.model,
        }));
      }

      toast.success(
        data?.message ||
          `${isGroq ? "Groq" : "Gemini"} API connection verified!`
      );
    } catch (error) {
      const errModels = error?.response?.data?.available_models;
      if (Array.isArray(errModels) && errModels.length > 0) {
        if (isGroq) setDiscoveredGroqModels(errModels);
        else setDiscoveredGeminiModels(errModels);
      }
      const msg =
        error?.response?.data?.message ||
        error?.response?.data?.error ||
        `${isGroq ? "Groq" : "Gemini"} connection test failed. Check your API key and model.`;
      toast.error(msg);
    } finally {
      if (isGroq) setTestingGroq(false);
      else setTestingGemini(false);
    }
  };

  const groqStats = usageSummary?.groq || {
    request_count: 0,
    success_count: 0,
    status: "ready",
    has_env_key: false,
  };
  const geminiStats = usageSummary?.gemini || {
    request_count: 0,
    success_count: 0,
    status: "ready",
    has_env_key: false,
  };

  return (
    <>
      {/* ===== Block 1: Hybrid AI Master Control & Architecture Overview ===== */}
      <div className="settings-block">
        <div className="settings-block-heading">
          <div className="flex items-center gap-3 min-w-0">
            <div className="settings-block-icon">
              <SparklesIcon />
            </div>
            <div className="min-w-0">
              <h2 className="settings-block-title">
                Cube Hybrid AI Assistant (Free-Quota Engine)
              </h2>
              <p className="settings-block-note">
                Configure your free Groq (Primary) and Google Gemini (Backup) API keys for Cube&apos;s 4-layer bilingual ERP training assistant.
              </p>
            </div>
          </div>

          <div className="flex flex-wrap items-center gap-3">
            <span
              className="settings-chip"
              style={{
                "--settings-chip": form.cube_ai_enabled ? "#10b981" : "#64748b",
              }}
            >
              <ShieldCheckIcon aria-hidden="true" />
              {form.cube_ai_enabled ? "Hybrid AI Active" : "Local-Only Mode"}
            </span>

            <SettingSwitch
              id="setting-cube-ai-master-switch"
              checked={form.cube_ai_enabled}
              disabled={disableInputs}
              onChange={(val) => setBooleanField("cube_ai_enabled", val)}
              labelOn="Enabled"
              labelOff="Disabled"
              isDark={isDark}
            />
          </div>
        </div>

        <div className="settings-body">
          <div className="settings-stats">
            <div className="settings-stat">
              <div className="settings-stat-label">Layer 1 • Local Engine</div>
              <div className="settings-stat-value">Always Active</div>
              <p className="settings-hint mt-1">
                Instant FAQs, screen guides &amp; interactive walkthroughs (0 API calls)
              </p>
            </div>

            <div className="settings-stat">
              <div className="settings-stat-label">Layer 2 • Groq Primary Usage Today</div>
              <div className="settings-stat-value">
                {groqStats.request_count} / {form.cube_groq_daily_limit ?? 250} reqs
              </div>
              <p className="settings-hint mt-1">
                Status: <strong className="uppercase">{groqStats.status}</strong>
              </p>
            </div>

            <div className="settings-stat">
              <div className="settings-stat-label">Layer 3 • Gemini Backup Usage Today</div>
              <div className="settings-stat-value">
                {geminiStats.request_count} / {form.cube_gemini_daily_limit ?? 250} reqs
              </div>
              <p className="settings-hint mt-1">
                Status: <strong className="uppercase">{geminiStats.status}</strong>
              </p>
            </div>
          </div>

          <div className="settings-note">
            <ShieldCheckIcon aria-hidden="true" />
            <div>
              <span className="settings-note-title">
                How Cube&apos;s 4-Layer Free-Only Architecture Works
              </span>
              <strong>Layer 1 (Local Intelligence)</strong> answers known workflows, FAQs, shortcuts, and interactive walkthrough demos instantly without consuming any API quota.{" "}
              <strong>Layer 2 (Groq Primary)</strong> handles detailed comparisons and follow-up questions.{" "}
              <strong>Layer 3 (Gemini Backup)</strong> automatically takes over if Groq is rate-limited or reaches its daily cap.{" "}
              <strong>Layer 4 (Local Fallback)</strong> ensures Cube never goes offline even if both cloud providers are unavailable.
            </div>
          </div>
        </div>
      </div>

      {/* ===== Block 2: Layer 2 — Groq Primary AI Configuration ===== */}
      <div className="settings-block">
        <div className="settings-block-heading">
          <div className="flex items-center gap-3 min-w-0">
            <div className="settings-block-icon">
              <BoltIcon />
            </div>
            <div className="min-w-0">
              <h2 className="settings-block-title">
                Layer 2: Groq Primary AI (OpenAI-Compatible Free Tier)
              </h2>
              <p className="settings-block-note">
                Primary generative AI provider for fast bilingual English, Urdu, and Roman Urdu explanations.
              </p>
            </div>
          </div>

          <div className="flex flex-wrap items-center gap-3">
            <span
              className="settings-chip"
              style={{
                "--settings-chip": form.cube_groq_enabled ? "#10b981" : "#64748b",
              }}
            >
              {groqStats.request_count} / {form.cube_groq_daily_limit ?? 250} today
            </span>

            <SettingSwitch
              id="setting-cube-groq-switch"
              checked={form.cube_groq_enabled}
              disabled={disableInputs}
              onChange={(val) => setBooleanField("cube_groq_enabled", val)}
              labelOn="Groq On"
              labelOff="Groq Off"
              isDark={isDark}
            />
          </div>
        </div>

        <div className="settings-body">
          <div className="settings-fields">
            {/* Groq API Key (Full Width) */}
            <div className="settings-field settings-field-wide">
              <div className="flex flex-wrap items-center justify-between gap-2">
                <label className="settings-label" htmlFor="setting-cube-groq-key">
                  Groq API Key
                </label>
                <a
                  href={GROQ_API_KEYS_URL}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="inline-flex items-center gap-1.5 text-xs font-semibold hover:underline"
                  style={{ color: "var(--workspace-accent)" }}
                >
                  <KeyIcon className="w-3.5 h-3.5 shrink-0" />
                  <span>Get Free Groq API Key at console.groq.com/keys</span>
                  <ArrowTopRightOnSquareIcon className="w-3.5 h-3.5 shrink-0" />
                </a>
              </div>

              <div className="flex flex-wrap sm:flex-nowrap items-center gap-2 min-w-0">
                <input
                  id="setting-cube-groq-key"
                  type={showGroqKey ? "text" : "password"}
                  name="cube_groq_api_key"
                  value={form.cube_groq_api_key ?? ""}
                  onChange={handleChange}
                  disabled={disableInputs}
                  autoComplete="off"
                  autoCorrect="off"
                  autoCapitalize="off"
                  spellCheck={false}
                  placeholder={
                    groqStats.has_env_key
                      ? "Configured via .env (enter a key here to override from UI)"
                      : "Paste your free Groq API Key (starts with gsk_...)"
                  }
                  className="g-input flex-1 min-w-[200px] font-mono"
                />
                <button
                  type="button"
                  onClick={() => setShowGroqKey((prev) => !prev)}
                  className="products-action theme-btn-tertiary shrink-0"
                  aria-label={showGroqKey ? "Hide Groq API key" : "Show Groq API key"}
                  title={showGroqKey ? "Hide API key" : "Show API key"}
                >
                  {showGroqKey ? (
                    <EyeSlashIcon className="w-4 h-4" />
                  ) : (
                    <EyeIcon className="w-4 h-4" />
                  )}
                  <span>{showGroqKey ? "Hide" : "Show"}</span>
                </button>
              </div>

              <p className="settings-hint">
                Stored securely on the server and never exposed to browser scripts or logs.
              </p>
            </div>

            {/* Groq Model */}
            <div className="settings-field">
              <label className="settings-label" htmlFor="setting-cube-groq-model">
                Verified Groq Free-Tier Model
              </label>
              <select
                id="setting-cube-groq-model"
                name="cube_groq_model"
                value={form.cube_groq_model || "openai/gpt-oss-120b"}
                onChange={handleChange}
                disabled={disableInputs}
              >
                {groqModelOptions.map((m) => (
                  <option key={m.value} value={m.value}>
                    {m.label}
                  </option>
                ))}
              </select>
              <p className="settings-hint">
                Clicking <strong>Test Groq Key</strong> auto-detects models enabled on your Groq key.
              </p>
            </div>

            {/* Groq Daily Limit */}
            <div className="settings-field">
              <label className="settings-label" htmlFor="setting-cube-groq-limit">
                Daily Free Request Limit (Max 1000)
              </label>
              <input
                id="setting-cube-groq-limit"
                type="text"
                inputMode="numeric"
                pattern="[0-9]*"
                name="cube_groq_daily_limit"
                value={form.cube_groq_daily_limit ?? 250}
                onChange={handleChange}
                disabled={disableInputs}
                placeholder="250"
                className="g-input font-mono"
              />
              <p className="settings-hint">
                Setting this to 0 disables Groq. Recommended daily cap: 250 requests/day.
              </p>
            </div>
          </div>

          <div className="settings-actions settings-actions-between">
            <a
              href={GROQ_API_KEYS_URL}
              target="_blank"
              rel="noopener noreferrer"
              className="products-action theme-btn-secondary"
            >
              <KeyIcon className="w-4 h-4" />
              <span>Open Groq API Keys Page</span>
              <ArrowTopRightOnSquareIcon className="w-4 h-4" />
            </a>

            <button
              type="button"
              onClick={() => handleTestProvider("groq")}
              disabled={disableInputs || testingGroq}
              className="products-action products-action-primary theme-btn-primary"
            >
              <CheckCircleIcon className="w-4 h-4" />
              <span>{testingGroq ? "Testing Groq…" : "Test Groq Key"}</span>
            </button>
          </div>
        </div>
      </div>

      {/* ===== Block 3: Layer 3 — Google Gemini Backup AI Configuration ===== */}
      <div className="settings-block">
        <div className="settings-block-heading">
          <div className="flex items-center gap-3 min-w-0">
            <div className="settings-block-icon">
              <CpuChipIcon />
            </div>
            <div className="min-w-0">
              <h2 className="settings-block-title">
                Layer 3: Google Gemini Backup AI (Official Free Tier)
              </h2>
              <p className="settings-block-note">
                Automatic failover provider when Groq is rate-limited, unavailable, or reaches its daily cap.
              </p>
            </div>
          </div>

          <div className="flex flex-wrap items-center gap-3">
            <span
              className="settings-chip"
              style={{
                "--settings-chip": form.cube_gemini_enabled ? "#10b981" : "#64748b",
              }}
            >
              {geminiStats.request_count} / {form.cube_gemini_daily_limit ?? 250} today
            </span>

            <SettingSwitch
              id="setting-cube-gemini-switch"
              checked={form.cube_gemini_enabled}
              disabled={disableInputs}
              onChange={(val) => setBooleanField("cube_gemini_enabled", val)}
              labelOn="Gemini On"
              labelOff="Gemini Off"
              isDark={isDark}
            />
          </div>
        </div>

        <div className="settings-body">
          <div className="settings-fields">
            {/* Gemini API Key (Full Width) */}
            <div className="settings-field settings-field-wide">
              <div className="flex flex-wrap items-center justify-between gap-2">
                <label className="settings-label" htmlFor="setting-cube-gemini-key">
                  Google Gemini API Key
                </label>
                <a
                  href={GEMINI_API_KEYS_URL}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="inline-flex items-center gap-1.5 text-xs font-semibold hover:underline"
                  style={{ color: "var(--workspace-accent)" }}
                >
                  <KeyIcon className="w-3.5 h-3.5 shrink-0" />
                  <span>Get Free Gemini API Key at aistudio.google.com/apikey</span>
                  <ArrowTopRightOnSquareIcon className="w-3.5 h-3.5 shrink-0" />
                </a>
              </div>

              <div className="flex flex-wrap sm:flex-nowrap items-center gap-2 min-w-0">
                <input
                  id="setting-cube-gemini-key"
                  type={showGeminiKey ? "text" : "password"}
                  name="cube_gemini_api_key"
                  value={form.cube_gemini_api_key ?? ""}
                  onChange={handleChange}
                  disabled={disableInputs}
                  autoComplete="off"
                  autoCorrect="off"
                  autoCapitalize="off"
                  spellCheck={false}
                  placeholder={
                    geminiStats.has_env_key
                      ? "Configured via .env (enter a key here to override from UI)"
                      : "Paste your free Google Gemini API Key (starts with AIza...)"
                  }
                  className="g-input flex-1 min-w-[200px] font-mono"
                />
                <button
                  type="button"
                  onClick={() => setShowGeminiKey((prev) => !prev)}
                  className="products-action theme-btn-tertiary shrink-0"
                  aria-label={
                    showGeminiKey ? "Hide Gemini API key" : "Show Gemini API key"
                  }
                  title={showGeminiKey ? "Hide API key" : "Show API key"}
                >
                  {showGeminiKey ? (
                    <EyeSlashIcon className="w-4 h-4" />
                  ) : (
                    <EyeIcon className="w-4 h-4" />
                  )}
                  <span>{showGeminiKey ? "Hide" : "Show"}</span>
                </button>
              </div>

              <p className="settings-hint">
                Used automatically when Groq is unavailable, rate-limited, or reaches its daily quota.
              </p>
            </div>

            {/* Gemini Model */}
            <div className="settings-field">
              <label className="settings-label" htmlFor="setting-cube-gemini-model">
                Verified Gemini Free-Tier Model
              </label>
              <select
                id="setting-cube-gemini-model"
                name="cube_gemini_model"
                value={form.cube_gemini_model || "gemini-3.8-flash"}
                onChange={handleChange}
                disabled={disableInputs}
              >
                {geminiModelOptions.map((m) => (
                  <option key={m.value} value={m.value}>
                    {m.label}
                  </option>
                ))}
              </select>
              <p className="settings-hint">
                Clicking <strong>Test Gemini Key</strong> auto-detects models enabled on your key.
              </p>
            </div>

            {/* Gemini Daily Limit */}
            <div className="settings-field">
              <label className="settings-label" htmlFor="setting-cube-gemini-limit">
                Daily Free Request Limit (Max 1000)
              </label>
              <input
                id="setting-cube-gemini-limit"
                type="text"
                inputMode="numeric"
                pattern="[0-9]*"
                name="cube_gemini_daily_limit"
                value={form.cube_gemini_daily_limit ?? 250}
                onChange={handleChange}
                disabled={disableInputs}
                placeholder="250"
                className="g-input font-mono"
              />
              <p className="settings-hint">
                Setting this to 0 disables Gemini. Remember to click <strong>Save settings</strong> after testing!
              </p>
            </div>
          </div>

          <div className="settings-actions settings-actions-between">
            <a
              href={GEMINI_API_KEYS_URL}
              target="_blank"
              rel="noopener noreferrer"
              className="products-action theme-btn-secondary"
            >
              <KeyIcon className="w-4 h-4" />
              <span>Open Google AI Studio API Keys Page</span>
              <ArrowTopRightOnSquareIcon className="w-4 h-4" />
            </a>

            <button
              type="button"
              onClick={() => handleTestProvider("gemini")}
              disabled={disableInputs || testingGemini}
              className="products-action products-action-primary theme-btn-primary"
            >
              <CheckCircleIcon className="w-4 h-4" />
              <span>{testingGemini ? "Testing Gemini…" : "Test Gemini Key"}</span>
            </button>
          </div>
        </div>
      </div>
    </>
  );
}
