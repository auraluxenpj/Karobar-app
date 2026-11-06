import React, { useState, useEffect, useCallback } from "react";
import axios from "axios";
import toast from "react-hot-toast";
import {
  ArrowPathIcon,
  CloudArrowDownIcon,
  ShieldCheckIcon,
  SparklesIcon,
  XMarkIcon,
  CheckCircleIcon,
  ArrowTopRightOnSquareIcon,
} from "@heroicons/react/24/outline";

const UPDATE_DISMISSED_UNTIL_KEY = "karobar_update_dismissed_until";
const ONE_DAY_MS = 24 * 60 * 60 * 1000;

function getDismissedUntilMs() {
  try {
    const raw = localStorage.getItem(UPDATE_DISMISSED_UNTIL_KEY);
    if (!raw) return 0;
    const parsed = Number(raw);
    return Number.isFinite(parsed) ? parsed : 0;
  } catch {
    return 0;
  }
}

function isDismissedForToday() {
  return Date.now() < getDismissedUntilMs();
}

export default function AppUpdateNotification() {
  const [updateInfo, setUpdateInfo] = useState(null);
  const [isDismissed, setIsDismissed] = useState(() => isDismissedForToday());
  const [isChecking, setIsChecking] = useState(false);
  const [isInstalling, setIsInstalling] = useState(false);
  const [progress, setProgress] = useState({
    status: "idle",
    percent: 0,
    downloadedMB: null,
    totalMB: null,
    message: "",
  });

  const dismissForOneDay = useCallback(() => {
    const until = Date.now() + ONE_DAY_MS;
    try {
      localStorage.setItem(UPDATE_DISMISSED_UNTIL_KEY, String(until));
    } catch {
      // ignore storage errors
    }
    setIsDismissed(true);
    window.dispatchEvent(new CustomEvent("karobar:update-dismissed", { detail: { until } }));
  }, []);

  const checkForUpdates = useCallback(async ({ manual = false } = {}) => {
    if (!manual && isDismissedForToday()) {
      setIsDismissed(true);
      return;
    }

    if (typeof navigator !== "undefined" && !navigator.onLine) {
      if (manual) {
        toast.error("You are currently offline. Connect to the internet to check for Karobar-App updates.");
      }
      return;
    }

    setIsChecking(true);
    try {
      let data = null;
      const desktop = typeof window !== "undefined" ? window.karobarDesktop : null;

      // 1. Try native Electron HTTPS updater first on Desktop (uses Chromium/Node CA store)
      if (desktop?.isDesktop && typeof desktop.checkForUpdates === "function") {
        try {
          const desktopRes = await desktop.checkForUpdates(manual);
          if (desktopRes?.ok) {
            data = desktopRes;
          }
        } catch {
          // Fall through to backend API
        }
      }

      // 2. Try Laravel backend /api/system/check-update
      if (!data) {
        try {
          const resp = await axios.get("/api/system/check-update", {
            params: manual ? { force: 1 } : {},
          });
          if (resp.data?.ok) {
            data = resp.data;
          }
        } catch {
          // Fall through to direct browser GitHub API check
        }
      }

      // 3. Direct browser fallback to GitHub Releases API (CORS enabled: access-control-allow-origin: *)
      if (!data) {
        try {
          const [verRes, ghRes] = await Promise.all([
            axios.get("/api/system/version").catch(() => ({ data: { version: "2.0.1", build_number: 1 } })),
            fetch("https://api.github.com/repos/shzdasim/Karobar-App/releases/latest", {
              headers: { Accept: "application/vnd.github+json" },
            }),
          ]);
          if (ghRes.ok) {
            const release = await ghRes.json();
            const localVer = String(verRes.data?.version || "2.0.1").replace(/^[vV]/, "");
            const localBuild = Number(verRes.data?.build_number || 1);
            const remoteVer = String(release.tag_name || "").replace(/^[vV]/, "");
            const buildMatch = remoteVer.match(/^2\.0\.(\d+)$/);
            const remoteBuild = buildMatch ? parseInt(buildMatch[1], 10) : 0;
            const isNewer =
              remoteBuild > 0 && localBuild > 0 && remoteBuild !== localBuild
                ? remoteBuild > localBuild
                : remoteVer > localVer;

            data = {
              ok: true,
              update_available: isNewer,
              app_name: "Karobar-App",
              current_version: localVer,
              current_build: localBuild,
              latest_version: remoteVer,
              latest_build: remoteBuild,
              release_name: release.name || `Karobar-App v${remoteVer}`,
              released_at: release.published_at || "",
              notes: release.body || "New Karobar-App release available.",
              download_url:
                "https://github.com/shzdasim/Karobar-App/releases/latest/download/Karobar-App-Setup.exe",
              bundle_url:
                "https://github.com/shzdasim/Karobar-App/releases/latest/download/Karobar-App-Setup-Bundle.zip",
              release_url: release.html_url || "https://github.com/shzdasim/Karobar-App/releases/latest",
              zero_data_loss: true,
            };
          }
        } catch {
          // Ignore
        }
      }

      if (!data || !data.ok) {
        if (manual) {
          toast.error("Could not reach GitHub Releases right now. Please check your internet connection.");
        }
        return;
      }

      if (data.update_available) {
        setUpdateInfo(data);
        if (manual) {
          try {
            localStorage.removeItem(UPDATE_DISMISSED_UNTIL_KEY);
          } catch {
            // ignore
          }
          setIsDismissed(false);
        } else {
          setIsDismissed(isDismissedForToday());
        }
      } else if (manual) {
        toast.success(
          `Karobar-App is up to date (v${data.current_version} • Build #${data.current_build || 1})`,
          { duration: 4000 }
        );
      }
    } catch {
      if (manual) {
        toast.error("Unable to check for updates right now. Please verify your internet connection.");
      }
    } finally {
      setIsChecking(false);
    }
  }, []);

  useEffect(() => {
    const syncDismissState = () => {
      setIsDismissed(isDismissedForToday());
    };
    window.addEventListener("storage", syncDismissState);
    window.addEventListener("karobar:update-dismissed", syncDismissState);
    return () => {
      window.removeEventListener("storage", syncDismissState);
      window.removeEventListener("karobar:update-dismissed", syncDismissState);
    };
  }, []);

  // Re-open automatically once the 24-hour dismissal window expires
  useEffect(() => {
    if (!isDismissed) return;
    const remainingMs = getDismissedUntilMs() - Date.now();
    if (remainingMs <= 0) {
      setIsDismissed(false);
      checkForUpdates({ manual: false });
      return;
    }
    const timer = setTimeout(() => {
      setIsDismissed(false);
      checkForUpdates({ manual: false });
    }, Math.min(remainingMs + 500, ONE_DAY_MS + 1000));
    return () => clearTimeout(timer);
  }, [isDismissed, checkForUpdates]);

  useEffect(() => {
    // Initial check shortly after startup when online
    const initialTimer = setTimeout(() => {
      if (typeof navigator === "undefined" || navigator.onLine) {
        checkForUpdates({ manual: false });
      }
    }, 3500);

    // Re-check automatically whenever the machine connects to the internet
    const handleOnline = () => {
      checkForUpdates({ manual: false });
    };
    window.addEventListener("online", handleOnline);

    // Manual trigger from custom DOM event
    const handleCustomTrigger = () => {
      checkForUpdates({ manual: true });
    };
    window.addEventListener("karobar:check-updates", handleCustomTrigger);

    // Periodic background check every 30 minutes
    const interval = setInterval(() => {
      if (typeof navigator === "undefined" || navigator.onLine) {
        checkForUpdates({ manual: false });
      }
    }, 30 * 60 * 1000);

    // Desktop IPC listeners (native Windows menu "Check for Software Updates…" & download progress)
    const desktop = typeof window !== "undefined" ? window.karobarDesktop : null;
    const unsubTrigger = desktop?.onTriggerUpdateCheck?.(() => {
      checkForUpdates({ manual: true });
    });
    const unsubProgress = desktop?.onUpdateProgress?.((payload) => {
      if (!payload) return;
      setProgress((prev) => ({
        ...prev,
        ...payload,
      }));
      if (payload.status === "error") {
        setIsInstalling(false);
        toast.error(payload.message || "Update installation failed.");
      }
    });

    return () => {
      clearTimeout(initialTimer);
      clearInterval(interval);
      window.removeEventListener("online", handleOnline);
      window.removeEventListener("karobar:check-updates", handleCustomTrigger);
      unsubTrigger?.();
      unsubProgress?.();
    };
  }, [checkForUpdates]);

  const handleInstallUpdate = async () => {
    if (!updateInfo || isInstalling) return;

    const desktop = typeof window !== "undefined" ? window.karobarDesktop : null;
    const downloadUrl =
      updateInfo.download_url ||
      "https://github.com/shzdasim/Karobar-App/releases/latest/download/Karobar-App-Setup.exe";

    if (desktop?.isDesktop && typeof desktop.downloadAndInstallUpdate === "function") {
      setIsInstalling(true);
      setProgress({
        status: "starting",
        percent: 3,
        downloadedMB: null,
        totalMB: null,
        message: "Connecting to GitHub Releases…",
      });

      const res = await desktop.downloadAndInstallUpdate({
        downloadUrl,
        version: updateInfo.latest_version,
      });

      if (!res?.ok) {
        setIsInstalling(false);
        toast.error(res?.message || "Unable to download update automatically. Opening download link…");
        if (desktop.openExternalUrl) {
          desktop.openExternalUrl(downloadUrl);
        } else {
          window.open(downloadUrl, "_blank", "noopener,noreferrer");
        }
      }
    } else {
      window.open(downloadUrl, "_blank", "noopener,noreferrer");
      toast.success("Downloading Karobar-App-Setup.exe! Run it to upgrade with zero data loss.");
    }
  };

  const handleOpenReleasePage = () => {
    const url =
      updateInfo?.release_url || "https://github.com/shzdasim/Karobar-App/releases/latest";
    const desktop = typeof window !== "undefined" ? window.karobarDesktop : null;
    if (desktop?.openExternalUrl) {
      desktop.openExternalUrl(url);
    } else {
      window.open(url, "_blank", "noopener,noreferrer");
    }
  };

  if (!updateInfo?.update_available || (isDismissed && !isInstalling)) {
    return null;
  }

  return (
    <div
      className="fixed bottom-5 right-5 z-[9990] w-[410px] max-w-[calc(100vw-2rem)] overflow-hidden rounded-2xl border border-slate-700/80 bg-slate-900/95 text-slate-100 shadow-2xl backdrop-blur-2xl print:hidden"
      style={{
        boxShadow:
          "0 24px 60px -12px rgba(2, 6, 23, 0.78), 0 0 0 1px rgba(56, 189, 248, 0.22)",
      }}
    >
      {/* Top gradient accent bar */}
      <div className="h-1.5 w-full bg-gradient-to-r from-sky-500 via-blue-500 to-emerald-400" />

      <div className="p-4 sm:p-5">
        {/* Header */}
        <div className="flex items-start justify-between gap-3">
          <div className="flex items-center gap-3">
            <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl bg-gradient-to-br from-sky-500 to-blue-600 text-white shadow-lg shadow-sky-500/25">
              <SparklesIcon className="h-5 w-5" />
            </div>
            <div>
              <div className="flex items-center gap-2">
                <span className="text-[11px] font-bold uppercase tracking-wider text-sky-400">
                  Software Update Available
                </span>
                <span className="inline-flex items-center rounded-full bg-emerald-500/15 px-2 py-0.5 text-[10px] font-semibold text-emerald-300 ring-1 ring-inset ring-emerald-500/30">
                  Official Release
                </span>
              </div>
              <h3 className="mt-0.5 text-sm font-bold text-white">
                Karobar-App v{updateInfo.latest_version}
              </h3>
            </div>
          </div>

          {!isInstalling && (
            <div className="flex items-center gap-1">
              <button
                type="button"
                onClick={dismissForOneDay}
                className="rounded-lg px-2 py-1 text-[11px] font-medium text-slate-400 transition hover:bg-slate-800 hover:text-slate-200 cursor-pointer"
                title="Remind me again in 24 hours"
              >
                Later
              </button>
              <button
                type="button"
                onClick={dismissForOneDay}
                className="rounded-lg p-1 text-slate-400 transition hover:bg-slate-800 hover:text-slate-200 cursor-pointer"
                title="Dismiss for 24 hours"
              >
                <XMarkIcon className="h-4 w-4" />
              </button>
            </div>
          )}
        </div>

        {/* Version comparison pill */}
        <div className="mt-3 flex items-center justify-between rounded-xl border border-slate-800 bg-slate-950/60 px-3 py-2 text-xs">
          <div className="flex items-center gap-2 text-slate-400">
            <span>Installed:</span>
            <span className="font-mono font-semibold text-slate-200">
              v{updateInfo.current_version}
            </span>
          </div>
          <span className="text-sky-400">→</span>
          <div className="flex items-center gap-2 text-slate-300">
            <span>New Build:</span>
            <span className="font-mono font-bold text-emerald-400">
              v{updateInfo.latest_version}
              {updateInfo.latest_build ? ` (#${updateInfo.latest_build})` : ""}
            </span>
          </div>
        </div>

        {/* Release Notes */}
        {updateInfo.notes && (
          <div className="mt-3 max-h-24 overflow-y-auto rounded-xl border border-slate-800/90 bg-slate-950/40 px-3 py-2 text-xs leading-relaxed text-slate-300">
            <div className="mb-1 text-[10px] font-semibold uppercase tracking-wider text-slate-400">
              What&apos;s New in This Release
            </div>
            <p className="whitespace-pre-line text-[11.5px] text-slate-300">
              {String(updateInfo.notes)
                .replace(/^#+\s*/gm, "")
                .slice(0, 360)}
            </p>
          </div>
        )}

        {/* Zero Data Loss Guarantee */}
        <div className="mt-3 flex items-start gap-2.5 rounded-xl border border-emerald-500/25 bg-emerald-500/10 px-3 py-2.5 text-[11.5px] text-emerald-200">
          <ShieldCheckIcon className="mt-0.5 h-4 w-4 shrink-0 text-emerald-400" />
          <div>
            <span className="font-semibold text-emerald-300">100% Zero Data Loss Upgrade:</span>{" "}
            Your SQLite database, invoices, products, ledgers, users &amp; license are preserved and automatically backed up before updating.
          </div>
        </div>

        {/* Live Download & Install Progress */}
        {isInstalling ? (
          <div className="mt-4 space-y-2">
            <div className="flex items-center justify-between text-xs">
              <span className="flex items-center gap-2 font-medium text-sky-300">
                <ArrowPathIcon className="h-4 w-4 animate-spin text-sky-400" />
                {progress.message || "Downloading & installing update…"}
              </span>
              <span className="font-mono font-bold text-white">{progress.percent || 0}%</span>
            </div>
            <div className="h-2 w-full overflow-hidden rounded-full bg-slate-800">
              <div
                className="h-full rounded-full bg-gradient-to-r from-sky-500 to-emerald-400 transition-all duration-300"
                style={{ width: `${Math.max(4, Math.min(100, progress.percent || 5))}%` }}
              />
            </div>
            <p className="text-[11px] text-slate-400">
              Karobar-App will automatically install the new update and restart in a few seconds.
            </p>
          </div>
        ) : (
          <div className="mt-4 flex items-center gap-2.5">
            <button
              type="button"
              onClick={handleInstallUpdate}
              disabled={isChecking}
              className="flex flex-1 items-center justify-center gap-2 rounded-xl bg-gradient-to-r from-sky-500 to-blue-600 px-4 py-2.5 text-xs font-bold text-white shadow-lg shadow-sky-500/25 transition hover:from-sky-400 hover:to-blue-500 active:scale-[0.99]"
            >
              <CloudArrowDownIcon className="h-4 w-4" />
              <span>Update &amp; Restart Now</span>
            </button>

            <button
              type="button"
              onClick={handleOpenReleasePage}
              className="inline-flex items-center gap-1 rounded-xl border border-slate-700 bg-slate-800/80 px-3 py-2.5 text-xs font-semibold text-slate-300 transition hover:bg-slate-800 hover:text-white"
              title="View release on GitHub"
            >
              <span>Release</span>
              <ArrowTopRightOnSquareIcon className="h-3.5 w-3.5" />
            </button>
          </div>
        )}
      </div>
    </div>
  );
}

