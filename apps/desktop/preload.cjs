// Preload bridge (CommonJS so it loads under the sandboxed, context-isolated
// renderer). Exposes a minimal, explicit API — a native folder/file picker for
// attaching read-only file context, and a native export-to-folder save (the web
// File System Access API write picker isn't available in Electron). No general IPC.
const { contextBridge, ipcRenderer } = require("electron");

contextBridge.exposeInMainWorld("substrate", {
  pickPath: (opts) => ipcRenderer.invoke("substrate:pickPath", opts),
  saveExport: (payload) => ipcRenderer.invoke("substrate:saveExport", payload),
});
