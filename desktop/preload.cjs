const { contextBridge, ipcRenderer, webFrame } = require("electron");

const isOffscreenPrintWorker =
  Array.isArray(process.argv) && process.argv.includes("--karobar-offscreen-print=1");

contextBridge.exposeInMainWorld("karobarDesktop", {
  isDesktop: true,
  isOffscreenPrintWorker,
  platform: process.platform,
  getAppInfo: () => ipcRenderer.invoke("karobar:app-info"),
  getPrinters: () => ipcRenderer.invoke("karobar:get-printers"),
  getPreferredPrinter: () => ipcRenderer.invoke("karobar:get-preferred-printer"),
  setPreferredPrinter: (deviceName) =>
    ipcRenderer.invoke("karobar:set-preferred-printer", { deviceName }),
  silentPrint: (options = {}) => ipcRenderer.invoke("karobar:silent-print", options),
  printUrl: (url, options = {}) => ipcRenderer.invoke("karobar:print-url", { url, ...options }),
  printHtml: (html, options = {}) => ipcRenderer.invoke("karobar:print-html", { html, ...options }),
  selectDirectory: () => ipcRenderer.invoke("karobar:select-directory"),
  runBackupNow: () => ipcRenderer.invoke("karobar:run-backup-now"),
  checkForUpdates: (force = false) => ipcRenderer.invoke("karobar:check-for-updates", { force }),
  downloadAndInstallUpdate: (payload = {}) => ipcRenderer.invoke("karobar:download-and-install-update", payload),
  openExternalUrl: (url) => ipcRenderer.invoke("karobar:open-external-url", url),
  onNavigate: (callback) => {
    const handler = (_event, payload) => callback(payload);
    ipcRenderer.on("karobar:navigate", handler);
    return () => ipcRenderer.removeListener("karobar:navigate", handler);
  },
  onOpenSubWindow: (callback) => {
    const handler = (_event, payload) => callback(payload);
    ipcRenderer.on("karobar:open-subwindow", handler);
    return () => ipcRenderer.removeListener("karobar:open-subwindow", handler);
  },
  onWindowCommand: (callback) => {
    const handler = (_event, payload) => callback(payload);
    ipcRenderer.on("karobar:window-command", handler);
    return () => ipcRenderer.removeListener("karobar:window-command", handler);
  },
  onUpdateProgress: (callback) => {
    const handler = (_event, payload) => callback(payload);
    ipcRenderer.on("karobar:update-progress", handler);
    return () => ipcRenderer.removeListener("karobar:update-progress", handler);
  },
  onTriggerUpdateCheck: (callback) => {
    const handler = (_event, payload) => callback(payload);
    ipcRenderer.on("karobar:trigger-update-check", handler);
    return () => ipcRenderer.removeListener("karobar:trigger-update-check", handler);
  },
});

// Intercept window.print() in the page's main world before any DOM onload handlers execute
// so native OS print dialogs or popup print dialogs are never shown.
try {
  if (isOffscreenPrintWorker) {
    webFrame
      .executeJavaScript(
        `
        window.__karobarSilentPrintWorker = true;
        window.print = function () {};
        window.close = function () {};
        `,
        false
      )
      .catch(() => {});
  } else {
    webFrame
      .executeJavaScript(
        `
        (function () {
          if (window.__karobarWindowPrintPatched) return;
          window.__karobarWindowPrintPatched = true;
          window.print = function () {
            try {
              if (window.karobarDesktop && typeof window.karobarDesktop.silentPrint === "function") {
                var preferred = "";
                try {
                  preferred = String(window.localStorage.getItem("karobar_preferred_printer") || "").trim();
                } catch (e) {}
                var deviceName =
                  preferred && preferred !== "default" && preferred !== "system_default"
                    ? preferred
                    : undefined;
                window.karobarDesktop.silentPrint({ silent: true, deviceName: deviceName });
              }
            } catch (e) {}
          };
        })();
        `,
        false
      )
      .catch(() => {});
  }
} catch {
  // ignore
}
