const { contextBridge, ipcRenderer } = require("electron");

contextBridge.exposeInMainWorld("mage2Runtime", {
  quit: () => ipcRenderer.send("mage2-runtime:quit")
});
