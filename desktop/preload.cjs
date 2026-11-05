const { contextBridge, ipcRenderer } = require("electron");

contextBridge.exposeInMainWorld("karobarDesktop", {
  isDesktop: true,
  platform: process.platform,
  getAppInfo: () => ipcRenderer.invoke("karobar:app-info"),
  getPrinters: () => ipcRenderer.invoke("karobar:get-printers"),
  silentPrint: (options = {}) => ipcRenderer.invoke("karobar:silent-print", options),
  selectDirectory: () => ipcRenderer.invoke("karobar:select-directory"),
  runBackupNow: () => ipcRenderer.invoke("karobar:run-backup-now"),
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
});


