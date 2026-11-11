import { useState, useEffect, useMemo, useCallback } from "react";
import { useNavigate } from "react-router-dom";
import axios from "axios";
import toast from "react-hot-toast";
import { usePermissions } from "@/api/usePermissions.js";
import { useTheme } from "@/context/ThemeContext.jsx";
import PageSkeleton from "@/components/PageSkeleton.jsx";
import SqliteImportSetting from "@/components/settings/SqliteImportSetting.jsx";
import {
  CircleStackIcon,
  ArrowLeftIcon,
  ServerIcon,
  ShieldCheckIcon,
  LockClosedIcon,
  LockOpenIcon,
  KeyIcon,
  ExclamationTriangleIcon,
  EyeIcon,
  EyeSlashIcon,
} from "@heroicons/react/24/solid";

const SW_ADMIN_TOKEN_STORAGE_KEY = "karobar_sw_admin_sqlite_token";

export default function SqliteImportPage() {
  const navigate = useNavigate();
  const { isDark, theme } = useTheme();
  const { loading: permsLoading, roles } = usePermissions();

  const [unlockToken, setUnlockToken] = useState(() => {
    try {
      return sessionStorage.getItem(SW_ADMIN_TOKEN_STORAGE_KEY) || "";
    } catch {
      return "";
    }
  });
  const [masterPassword, setMasterPassword] = useState("");
  const [showPassword, setShowPassword] = useState(false);
  const [unlocking, setUnlocking] = useState(false);
  const [unlockError, setUnlockError] = useState("");

  const isApplicationAdmin = useMemo(
    () =>
      !permsLoading &&
      Boolean(
        roles?.has("Admin") ||
          roles?.has("Super Admin") ||
          roles?.has("admin") ||
          roles?.has("super-admin")
      ),
    [permsLoading, roles]
  );

  useEffect(() => {
    if (unlockToken) {
      axios.defaults.headers.common["X-Software-Admin-Token"] = unlockToken;
    } else {
      delete axios.defaults.headers.common["X-Software-Admin-Token"];
    }
  }, [unlockToken]);

  const handleLockSoftwareAdmin = useCallback(
    (reasonMessage = null) => {
      try {
        sessionStorage.removeItem(SW_ADMIN_TOKEN_STORAGE_KEY);
      } catch {
        /* ignore storage errors */
      }
      delete axios.defaults.headers.common["X-Software-Admin-Token"];
      setUnlockToken("");
      setMasterPassword("");
      setUnlockError(
        typeof reasonMessage === "string" && reasonMessage ? reasonMessage : ""
      );
      window.dispatchEvent(new CustomEvent("karobar:sw-admin-unlock-changed"));
      if (typeof reasonMessage !== "string") {
        toast.success("Software Admin session locked.");
      }
    },
    []
  );

  const handleUnlockSubmit = async (e) => {
    e.preventDefault();
    if (!masterPassword) {
      setUnlockError("Please enter the Software Admin password.");
      return;
    }

    setUnlocking(true);
    setUnlockError("");
    try {
      const { data } = await axios.post("/api/settings/sqlite-import/unlock", {
        password: masterPassword,
      });

      const token = data?.unlock_token || "";
      if (!token) {
        throw new Error("Failed to issue Software Admin unlock token.");
      }

      try {
        sessionStorage.setItem(SW_ADMIN_TOKEN_STORAGE_KEY, token);
      } catch {
        /* ignore storage errors */
      }
      axios.defaults.headers.common["X-Software-Admin-Token"] = token;
      setUnlockToken(token);
      setMasterPassword("");
      window.dispatchEvent(new CustomEvent("karobar:sw-admin-unlock-changed"));
      toast.success(data.message || "Software Admin access unlocked.");
    } catch (err) {
      const msg =
        err?.response?.data?.message ||
        err?.response?.data?.errors?.password?.[0] ||
        "Invalid Software Admin password.";
      setUnlockError(msg);
      toast.error(msg);
    } finally {
      setUnlocking(false);
    }
  };

  const themeColors = useMemo(() => {
    if (!theme) {
      return {
        primary: "#2563eb",
        primaryHover: "#1d4ed8",
        primaryLight: "#dbeafe",
      };
    }
    return {
      primary: theme.primary_color || "#2563eb",
      primaryHover: theme.primary_hover || "#1d4ed8",
      primaryLight: theme.primary_light || "#dbeafe",
    };
  }, [theme]);

  if (permsLoading) {
    return <PageSkeleton />;
  }

  // Non-Admin users cannot even see the lock screen
  if (!isApplicationAdmin) {
    return (
      <div className="w-full max-w-2xl mx-auto py-14 px-4">
        <div
          className={`rounded-2xl border p-8 text-center space-y-4 ${
            isDark
              ? "bg-slate-800/90 border-slate-700 text-slate-100"
              : "bg-white border-gray-200 text-gray-900 shadow-sm"
          }`}
        >
          <div className="w-14 h-14 rounded-2xl mx-auto flex items-center justify-center bg-rose-500/15 text-rose-500 border border-rose-500/25">
            <ExclamationTriangleIcon className="w-7 h-7" />
          </div>
          <h2 className="text-lg font-extrabold tracking-tight">
            Access Restricted to Software Administrator
          </h2>
          <p className="text-xs sm:text-sm text-gray-500 dark:text-slate-400 max-w-md mx-auto">
            This utility is not available to standard user accounts. Only an Application Administrator with Software Administrator credentials can access the SQLite Database Import Studio.
          </p>
          <div className="pt-2">
            <button
              type="button"
              onClick={() => navigate("/dashboard")}
              className="inline-flex items-center gap-2 px-4 py-2 rounded-xl text-xs font-bold text-white transition cursor-pointer"
              style={{ backgroundColor: themeColors.primary }}
            >
              <ArrowLeftIcon className="w-4 h-4" />
              <span>Return to Dashboard</span>
            </button>
          </div>
        </div>
      </div>
    );
  }

  const isUnlocked = Boolean(unlockToken);

  return (
    <div className="w-full max-w-none space-y-5">
      {/* ===== Full-Width Top Page Header ===== */}
      <div
        className={`rounded-2xl border p-4 sm:p-5 flex flex-col md:flex-row md:items-center justify-between gap-4 ${
          isDark
            ? "bg-slate-800/80 border-slate-700/80 text-slate-100"
            : "bg-white/95 border-gray-200/80 text-gray-900"
        }`}
      >
        <div className="flex items-start sm:items-center gap-3.5 min-w-0">
          <div
            className="w-11 h-11 rounded-2xl flex items-center justify-center shrink-0"
            style={{
              backgroundColor: isDark
                ? "rgba(59, 130, 246, 0.16)"
                : themeColors.primaryLight,
              color: themeColors.primary,
            }}
          >
            <CircleStackIcon className="w-6 h-6" />
          </div>

          <div className="min-w-0">
            <div className="flex flex-wrap items-center gap-2">
              <h1 className="text-lg sm:text-xl font-extrabold tracking-tight truncate">
                SQLite Database Import &amp; Migration Studio
              </h1>
              {isUnlocked ? (
                <span className="inline-flex items-center gap-1 px-2.5 py-0.5 rounded-full text-[11px] font-semibold bg-emerald-500/15 text-emerald-600 dark:text-emerald-400 border border-emerald-500/25">
                  <LockOpenIcon className="w-3.5 h-3.5" />
                  Software Admin Unlocked
                </span>
              ) : (
                <span className="inline-flex items-center gap-1 px-2.5 py-0.5 rounded-full text-[11px] font-semibold bg-amber-500/15 text-amber-600 dark:text-amber-400 border border-amber-500/25">
                  <LockClosedIcon className="w-3.5 h-3.5" />
                  Locked — Software Admin Only
                </span>
              )}
            </div>
            <p className="text-xs sm:text-sm text-gray-500 dark:text-slate-400 mt-0.5">
              Import legacy or external SQLite databases with interactive table &amp; column mapping while keeping{" "}
              <code className="font-mono">users</code> and{" "}
              <code className="font-mono">licenses</code> strictly protected.
            </p>
          </div>
        </div>

        <div className="flex flex-wrap items-center gap-2.5 shrink-0">
          {isUnlocked && (
            <button
              type="button"
              onClick={() => handleLockSoftwareAdmin()}
              className="inline-flex items-center gap-2 px-3.5 py-2 rounded-xl text-xs font-bold border border-amber-500/40 bg-amber-500/10 text-amber-600 dark:text-amber-300 hover:bg-amber-500/20 transition cursor-pointer"
              title="Re-lock Software Admin session"
            >
              <LockClosedIcon className="w-4 h-4" />
              <span>Lock Software Admin</span>
            </button>
          )}

          <button
            type="button"
            onClick={() => navigate("/backups")}
            className={`inline-flex items-center gap-2 px-3.5 py-2 rounded-xl text-xs font-semibold border transition cursor-pointer ${
              isDark
                ? "bg-slate-700/70 border-slate-600 text-slate-200 hover:bg-slate-700"
                : "bg-gray-50 border-gray-200 text-gray-700 hover:bg-gray-100"
            }`}
          >
            <ServerIcon className="w-4 h-4" />
            <span>Backups &amp; Storage</span>
          </button>

          <button
            type="button"
            onClick={() => navigate("/settings")}
            className={`inline-flex items-center gap-2 px-4 py-2 rounded-xl text-xs font-semibold border transition cursor-pointer ${
              isDark
                ? "bg-slate-700/90 border-slate-600 text-slate-100 hover:bg-slate-600"
                : "bg-white border-gray-300 text-gray-800 hover:bg-gray-50"
            }`}
          >
            <ArrowLeftIcon className="w-4 h-4" />
            <span>Back to Settings</span>
          </button>
        </div>
      </div>

      {/* ===== Software Admin Security Gate OR Unlocked Importer ===== */}
      {!isUnlocked ? (
        <div className="w-full max-w-xl mx-auto py-8">
          <div
            className={`rounded-2xl border p-6 sm:p-8 shadow-lg ${
              isDark
                ? "bg-slate-800/90 border-slate-700/90 text-slate-100"
                : "bg-white border-gray-200/90 text-gray-900"
            }`}
          >
            <div className="flex flex-col items-center text-center">
              <div className="w-16 h-16 rounded-2xl flex items-center justify-center bg-amber-500/15 text-amber-500 border border-amber-500/30 mb-4 shadow-inner">
                <LockClosedIcon className="w-8 h-8" />
              </div>

              <span className="inline-flex items-center gap-1.5 px-3 py-1 rounded-full text-[11px] font-bold uppercase tracking-wider bg-amber-500/15 text-amber-600 dark:text-amber-400 border border-amber-500/25 mb-2.5">
                <ShieldCheckIcon className="w-3.5 h-3.5" />
                Software Admin Security Gate
              </span>

              <h2 className="text-lg sm:text-xl font-extrabold tracking-tight">
                Software Administrator Authorization Required
              </h2>

              <p className="text-xs sm:text-sm text-gray-500 dark:text-slate-400 mt-2 max-w-md leading-relaxed">
                This database migration utility is visible to Application Administrators in the sidebar but is locked for{" "}
                <strong className="text-gray-800 dark:text-slate-200">
                  Software Administrator
                </strong>{" "}
                use only. Enter the Software Admin password to unlock.
              </p>
            </div>

            <form onSubmit={handleUnlockSubmit} className="mt-6 space-y-4">
              <div>
                <label className="block text-xs font-bold uppercase tracking-wider text-gray-600 dark:text-slate-300 mb-1.5">
                  Software Admin Password
                </label>
                <div className="relative">
                  <div className="pointer-events-none absolute inset-y-0 left-0 flex items-center pl-3.5 text-gray-400">
                    <KeyIcon className="w-4 h-4" />
                  </div>
                  <input
                    type={showPassword ? "text" : "password"}
                    value={masterPassword}
                    onChange={(e) => {
                      setMasterPassword(e.target.value);
                      if (unlockError) setUnlockError("");
                    }}
                    placeholder="Enter Software Admin password..."
                    autoComplete="off"
                    autoFocus
                    className={`w-full rounded-xl border pl-10 pr-10 py-2.5 text-sm font-medium outline-none transition ${
                      isDark
                        ? "bg-slate-900/90 border-slate-700 text-slate-100 focus:border-amber-500"
                        : "bg-gray-50 border-gray-300 text-gray-900 focus:bg-white focus:border-amber-500"
                    }`}
                  />
                  <button
                    type="button"
                    onClick={() => setShowPassword((prev) => !prev)}
                    tabIndex={-1}
                    className="absolute inset-y-0 right-0 flex items-center pr-3 text-gray-400 hover:text-gray-600 dark:hover:text-slate-200 cursor-pointer"
                    title={showPassword ? "Hide password" : "Show password"}
                  >
                    {showPassword ? (
                      <EyeSlashIcon className="w-4 h-4" />
                    ) : (
                      <EyeIcon className="w-4 h-4" />
                    )}
                  </button>
                </div>

                {unlockError && (
                  <p className="mt-2 text-xs font-semibold text-rose-500 flex items-center gap-1.5">
                    <ExclamationTriangleIcon className="w-4 h-4 shrink-0" />
                    <span>{unlockError}</span>
                  </p>
                )}
              </div>

              <div className="flex items-center justify-end gap-2.5 pt-2">
                <button
                  type="button"
                  onClick={() => navigate("/dashboard")}
                  className={`px-4 py-2.5 rounded-xl text-xs font-semibold border transition cursor-pointer ${
                    isDark
                      ? "bg-slate-700 border-slate-600 text-slate-200 hover:bg-slate-600"
                      : "bg-gray-100 border-gray-200 text-gray-700 hover:bg-gray-200"
                  }`}
                >
                  Cancel
                </button>

                <button
                  type="submit"
                  disabled={unlocking}
                  className="inline-flex items-center gap-2 px-5 py-2.5 rounded-xl text-xs font-bold text-white shadow-sm transition cursor-pointer disabled:opacity-50"
                  style={{ backgroundColor: themeColors.primary }}
                >
                  <LockOpenIcon className="w-4 h-4" />
                  <span>
                    {unlocking
                      ? "Verifying..."
                      : "Unlock SQLite Import Studio"}
                  </span>
                </button>
              </div>
            </form>
          </div>
        </div>
      ) : (
        <SqliteImportSetting
          themeColors={themeColors}
          unlockToken={unlockToken}
          onSoftwareAdminLocked={handleLockSoftwareAdmin}
        />
      )}
    </div>
  );
}
