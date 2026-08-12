const { contextBridge, ipcRenderer } = require("electron");

contextBridge.exposeInMainWorld("mage2Runtime", {
  quit: () => ipcRenderer.send("mage2-runtime:quit"),
  getStartupMetrics: () => ipcRenderer.invoke("mage2-runtime:get-startup-metrics"),
  reportInitialSurfaceReady: () => ipcRenderer.send("mage2-runtime:initial-surface-ready")
});
