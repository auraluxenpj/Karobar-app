const { contextBridge, ipcRenderer } = require("electron");

contextBridge.exposeInMainWorld("karobarDesktop", {
  isDesktop: true,
  platform: process.platform,
  getAppInfo: () => ipcRenderer.invoke("karobar:app-info"),
  getPrinters: () => ipcRenderer.invoke("karobar:get-printers"),
  silentPrint: (options = {}) => ipcRenderer.invoke("karobar:silent-print", options),
  selectDirectory: () => ipcRenderer.invoke("karobar:select-directory"),
  runBackupNow: () => ipcRenderer.invoke("karobar:run-backup-now"),
});

