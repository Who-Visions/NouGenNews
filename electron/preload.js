const { contextBridge, ipcRenderer } = require("electron");

// Speech runs over one MessagePort per page load (see ttsport.js). The port is opened on the first request and the
// main process answers each request by id, so the page only ever sees a promise for an ArrayBuffer.
let ttsPort = null;
let ttsSeq = 0;
const ttsWaiting = new Map();

function openTtsPort() {
  if (ttsPort) return ttsPort;
  const { port1, port2 } = new MessageChannel();
  ipcRenderer.postMessage("tts-channel", null, [port2]);
  port1.onmessage = (ev) => {
    const data = ev.data || {};
    const w = ttsWaiting.get(data.id);
    if (!w) return;
    ttsWaiting.delete(data.id);
    if (data.ok) w.resolve(data.wav);
    else w.reject(new Error(data.error || "TTS failed"));
  };
  // When the other end closes, fail every waiting request and forget the dead port so the next call reopens one.
  // Without this, a pending ttsSynth promise hangs forever and the dead port is reused.
  port1.onclose = () => {
    ttsPort = null;
    for (const [id, w] of ttsWaiting) { ttsWaiting.delete(id); w.reject(new Error("TTS channel closed")); }
  };
  ttsPort = port1;
  return ttsPort;
}

// The assistant streams over its own MessagePort per question (electron/assistant-port.js): progress steps, then
// the answer. The port stays here in the preload; the page gets a callback per message and a cancel function.
function askStream(args, onEvent) {
  const { port1, port2 } = new MessageChannel();
  let done = false;
  port1.onmessage = (ev) => {
    const data = ev.data || {};
    if (["answer", "error", "cancelled"].includes(data.type)) { done = true; port1.close(); }
    try { onEvent(data); } catch (_) { /* a page error must not leave the port open */ }
  };
  // The main process closed its end without a last word (it crashed or refused the page): say so, never hang.
  port1.addEventListener("close", () => {
    if (done) return;
    done = true;
    try { onEvent({ type: "error", message: "The assistant connection closed before it answered." }); } catch (_) { /* page gone */ }
  });
  ipcRenderer.postMessage("assistant_port", args || {}, [port2]);
  // Stop: tell the main process (it aborts the model call), close our end, and tell the page it stopped.
  return () => {
    if (done) return;
    done = true;
    port1.postMessage({ type: "cancel" });
    port1.close();
    try { onEvent({ type: "cancelled" }); } catch (_) { /* page gone */ }
  };
}

contextBridge.exposeInMainWorld("nougennews", {
  askStream,
  // The Windows accent color changed; returns an unsubscribe function.
  onOsAccent: (cb) => {
    const f = (_e, hex) => { if (typeof hex === "string" && /^#[0-9a-f]{6}$/.test(hex)) cb(hex); };
    ipcRenderer.on("os-accent", f);
    return () => ipcRenderer.removeListener("os-accent", f);
  },
  invoke: (cmd, args) => ipcRenderer.invoke("cmd", cmd, args || {}),
  ttsSynth: (text, voice) => new Promise((resolve, reject) => {
    const id = ++ttsSeq;
    ttsWaiting.set(id, { resolve, reject });
    openTtsPort().postMessage({ id, text: String(text || ""), voice: String(voice || "") });
  }),
});
