const { contextBridge, ipcRenderer } = require("electron");

contextBridge.exposeInMainWorld("karobarDesktop", {
  isDesktop: true,
  platform: process.platform,
  getAppInfo: () => ipcRenderer.invoke("karobar:app-info"),
  getPrinters: () => ipcRenderer.invoke("karobar:get-printers"),
  silentPrint: (options = {}) => ipcRenderer.invoke("karobar:silent-print", options),
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
