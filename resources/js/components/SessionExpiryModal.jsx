import React, { useState, useEffect, useCallback, useRef } from "react";
import { useNavigate, useLocation } from "react-router-dom";
import axios from "axios";
import toast from "react-hot-toast";
import {
  ClockIcon,
  ArrowRightOnRectangleIcon,
  ShieldCheckIcon,
} from "@heroicons/react/24/outline";
import { useAuth } from "../context/AuthContext.jsx";
import { saveLastVisitedPath } from "../utils/lastVisitedPage.js";

const PROMPT_AT_STORAGE_KEY = "karobar_session_prompt_at";
const TEN_MINUTES_MS = 10 * 60 * 1000;

function getEffectiveExpiryMs() {
  try {
    const promptAtRaw = localStorage.getItem(PROMPT_AT_STORAGE_KEY);
    if (promptAtRaw) {
      const parsed = Number(promptAtRaw);
      if (Number.isFinite(parsed) && parsed > 0) {
        return parsed;
      }
    }
    const tokenExpRaw = localStorage.getItem("token_expires_at");
    if (tokenExpRaw) {
      const parsed = Date.parse(tokenExpRaw);
      if (Number.isFinite(parsed) && parsed > 0) {
        return parsed;
      }
    }
  } catch {
    // ignore storage errors
  }
  return 0;
}

export default function SessionExpiryModal() {
  const [isOpen, setIsOpen] = useState(false);
  const [isExtending, setIsExtending] = useState(false);
  const [isLoggingOut, setIsLoggingOut] = useState(false);
  const { logout } = useAuth();
  const navigate = useNavigate();
  const location = useLocation();
  const autoGraceProtectedRef = useRef(false);

  // Ensure backend token stays alive while the popup is visible on screen
  // so an in-progress invoice save never fails with 401 before the user clicks a button
  const ensureBackendGrace = useCallback(async () => {
    if (autoGraceProtectedRef.current) return;
    const token = localStorage.getItem("token");
    if (!token) return;
    autoGraceProtectedRef.current = true;
    try {
      await axios.post("/api/session/extend", { minutes: 10 });
    } catch {
      // ignore background grace error
    }
  }, []);

  const triggerPopup = useCallback(() => {
    const token = localStorage.getItem("token");
    if (!token) return;
    setIsOpen(true);
    ensureBackendGrace();
  }, [ensureBackendGrace]);

  useEffect(() => {
    const checkExpiry = () => {
      const token = localStorage.getItem("token");
      if (!token) {
        setIsOpen(false);
        return;
      }
      const expiryMs = getEffectiveExpiryMs();
      if (!expiryMs) return;

      // Pop up when session expiry time is reached (or within 15 seconds of expiring)
      if (Date.now() >= expiryMs - 15 * 1000) {
        triggerPopup();
      }
    };

    checkExpiry();
    const interval = setInterval(checkExpiry, 5000);

    const handleSessionExpiredEvent = () => {
      triggerPopup();
    };

    const handleStorage = (e) => {
      if (e.key === PROMPT_AT_STORAGE_KEY || e.key === "token_expires_at") {
        const expiryMs = getEffectiveExpiryMs();
        if (expiryMs > Date.now() + 15 * 1000) {
          autoGraceProtectedRef.current = false;
          setIsOpen(false);
        }
      } else if (e.key === "token" && !e.newValue) {
        setIsOpen(false);
      }
    };

    window.addEventListener("karobar:session-expired", handleSessionExpiredEvent);
    window.addEventListener("storage", handleStorage);

    return () => {
      clearInterval(interval);
      window.removeEventListener("karobar:session-expired", handleSessionExpiredEvent);
      window.removeEventListener("storage", handleStorage);
    };
  }, [triggerPopup]);

  const handleWaitTenMinutes = async () => {
    if (isExtending) return;
    setIsExtending(true);
    try {
      const nextPromptMs = Date.now() + TEN_MINUTES_MS;
      let nextIso = new Date(nextPromptMs).toISOString();

      try {
        const { data } = await axios.post("/api/session/extend", { minutes: 10 });
        if (data?.expires_at) {
          nextIso = data.expires_at;
        }
      } catch {
        // Even if offline/transient error, keep local session open for 10 minutes
      }

      try {
        localStorage.setItem("token_expires_at", nextIso);
        localStorage.setItem(PROMPT_AT_STORAGE_KEY, String(nextPromptMs));
      } catch {
        // ignore storage errors
      }

      autoGraceProtectedRef.current = false;
      setIsOpen(false);
      toast.success("Session extended for 10 minutes. We will remind you again in 10 minutes.", {
        duration: 3500,
      });
    } finally {
      setIsExtending(false);
    }
  };

  const handleLoginNow = async () => {
    if (isLoggingOut) return;
    setIsLoggingOut(true);
    try {
      saveLastVisitedPath(location);
      const token = localStorage.getItem("token");
      if (token) {
        await fetch("/api/logout", {
          method: "POST",
          headers: { Authorization: `Bearer ${token}` },
        }).catch(() => {});
      }
    } finally {
      setIsOpen(false);
      setIsLoggingOut(false);
      logout();
      navigate("/", { replace: true });
    }
  };

  if (!isOpen) return null;

  return (
    <div
      className="fixed inset-0 z-[9999] flex items-center justify-center bg-slate-950/70 p-4 backdrop-blur-sm print:hidden"
      role="dialog"
      aria-modal="true"
      aria-labelledby="session-expiry-title"
    >
      <div
        className="w-full max-w-md overflow-hidden rounded-2xl border border-slate-700/80 bg-slate-900 text-slate-100 shadow-2xl"
        style={{
          boxShadow:
            "0 25px 60px -15px rgba(2, 6, 23, 0.85), 0 0 0 1px rgba(245, 158, 11, 0.25)",
        }}
      >
        {/* Top amber accent bar */}
        <div className="h-1.5 w-full bg-gradient-to-r from-amber-500 via-orange-500 to-sky-500" />

        <div className="p-5 sm:p-6">
          <div className="flex items-start gap-3.5">
            <div className="flex h-11 w-11 shrink-0 items-center justify-center rounded-xl bg-amber-500/15 text-amber-400 ring-1 ring-inset ring-amber-500/30">
              <ClockIcon className="h-6 w-6" />
            </div>
            <div>
              <span className="text-[11px] font-bold uppercase tracking-wider text-amber-400">
                Session Timeout Notice
              </span>
              <h2 id="session-expiry-title" className="mt-0.5 text-base font-bold text-white">
                System Wants to Login Again
              </h2>
              <p className="mt-1.5 text-xs leading-relaxed text-slate-300">
                Your login session time has ended. Need more time to finish your current invoice or task? Click{" "}
                <strong className="font-semibold text-white">Wait 10 Minutes</strong> to continue working without losing any progress.
              </p>
            </div>
          </div>

          <div className="mt-4 flex items-start gap-2.5 rounded-xl border border-emerald-500/25 bg-emerald-500/10 px-3.5 py-2.5 text-xs text-emerald-200">
            <ShieldCheckIcon className="mt-0.5 h-4 w-4 shrink-0 text-emerald-400" />
            <div>
              <span className="font-semibold text-emerald-300">Your Current Work is Safe:</span>{" "}
              All open invoices and forms remain intact while you decide.
            </div>
          </div>

          <div className="mt-5 flex flex-col sm:flex-row items-stretch sm:items-center gap-2.5">
            <button
              type="button"
              onClick={handleWaitTenMinutes}
              disabled={isExtending || isLoggingOut}
              className="flex flex-1 items-center justify-center gap-2 rounded-xl bg-gradient-to-r from-sky-500 to-blue-600 px-4 py-2.5 text-xs font-bold text-white shadow-lg shadow-sky-500/25 transition hover:from-sky-400 hover:to-blue-500 cursor-pointer"
            >
              <ClockIcon className="h-4 w-4" />
              <span>{isExtending ? "Extending…" : "Wait 10 Minutes"}</span>
            </button>

            <button
              type="button"
              onClick={handleLoginNow}
              disabled={isExtending || isLoggingOut}
              className="inline-flex items-center justify-center gap-1.5 rounded-xl border border-slate-700 bg-slate-800/90 px-4 py-2.5 text-xs font-semibold text-slate-200 transition hover:bg-rose-600 hover:border-rose-500 hover:text-white cursor-pointer"
            >
              <ArrowRightOnRectangleIcon className="h-4 w-4" />
              <span>{isLoggingOut ? "Signing Out…" : "Login Now"}</span>
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}

