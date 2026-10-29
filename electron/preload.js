const { contextBridge, ipcRenderer } = require("electron");

contextBridge.exposeInMainWorld("nougennews", {
  invoke: (cmd, args) => ipcRenderer.invoke("cmd", cmd, args || {}),
});
