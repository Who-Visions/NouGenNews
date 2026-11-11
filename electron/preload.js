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
  ttsPort = port1;
  return ttsPort;
}

contextBridge.exposeInMainWorld("nougennews", {
  invoke: (cmd, args) => ipcRenderer.invoke("cmd", cmd, args || {}),
  ttsSynth: (text, voice) => new Promise((resolve, reject) => {
    const id = ++ttsSeq;
    ttsWaiting.set(id, { resolve, reject });
    openTtsPort().postMessage({ id, text: String(text || ""), voice: String(voice || "") });
  }),
});
