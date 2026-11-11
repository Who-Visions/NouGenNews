// Read-aloud over a MessagePort instead of a request/response IPC call.
//
// The preload opens one channel per page load (ipcRenderer.postMessage with a port) and keeps the other end. Each
// speech request is a message on that port, and the WAV comes back as a transferred ArrayBuffer, not a base64 string
// pushed through the string-only invoke path. Only the app's own top-level frame may open a channel, the same rule
// the key commands use.

const MAX_CHARS = 60000;

function attachTtsPort({ ipcMain, isAppFrame, synth }) {
  ipcMain.on("tts-channel", (event) => {
    if (!isAppFrame(event.senderFrame)) return;
    const port = event.ports && event.ports[0];
    if (!port) return;
    port.on("message", (ev) => {
      const { id, text, voice } = (ev && ev.data) || {};
      Promise.resolve()
        .then(() => synth({ text: String(text || "").slice(0, MAX_CHARS), voice: String(voice || "") }))
        .then(
          (b64) => {
            // Own copy of the bytes so the transfer does not hand over a pooled Buffer.
            const wav = new Uint8Array(Buffer.from(b64, "base64")).buffer;
            port.postMessage({ id, ok: true, wav }, [wav]);
          },
          (e) => port.postMessage({ id, ok: false, error: String((e && e.message) || e || "TTS failed") }),
        )
        .catch(() => { /* the page has gone; nothing is waiting for this answer */ });
    });
    port.start();
  });
}

module.exports = { attachTtsPort, MAX_CHARS };
