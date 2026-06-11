// Preload bridge (CommonJS so it loads under the sandboxed, context-isolated
// renderer). Exposes a minimal, explicit API — just a native folder/file picker
// for attaching read-only file context to a deck. No general IPC surface.
const { contextBridge, ipcRenderer } = require("electron");

contextBridge.exposeInMainWorld("substrate", {
  pickPath: (opts) => ipcRenderer.invoke("substrate:pickPath", opts),
});
