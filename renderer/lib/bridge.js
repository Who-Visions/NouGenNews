// The renderer's only door to the main process: the preload exposes `window.nougennews`.
export const invoke = (cmd, args) => window.nougennews.invoke(cmd, args);

// Kokoro speech as WAV bytes. Uses the MessagePort channel when the preload has it; otherwise falls back to the
// base64 invoke command, so an older preload still plays.
export async function synthSpeech(text, voice) {
  if (typeof window.nougennews?.ttsSynth === "function") return window.nougennews.ttsSynth(text, voice);
  const b64 = await invoke("tts_kokoro_synth", { text, voice });
  return Uint8Array.from(atob(b64), (c) => c.charCodeAt(0)).buffer;
}

// The assistant, streamed: onEvent hears { type: "thinking" | "tool" | "tool_done" | "answer" | "error" | "cancelled" }.
// Returns a function that stops the question. Falls back to the one-shot invoke when the preload has no port.
export function askAssistant(args, onEvent) {
  if (typeof window.nougennews?.askStream === "function") return window.nougennews.askStream(args, onEvent);
  let stopped = false;
  invoke("assistant_ask", args)
    .then((r) => { if (!stopped) onEvent({ type: "answer", answer: r.answer, model: r.model }); })
    .catch((err) => { if (!stopped) onEvent({ type: "error", message: String((err && err.message) || err) }); });
  return () => { stopped = true; onEvent({ type: "cancelled" }); };
}
