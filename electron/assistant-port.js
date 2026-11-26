// One assistant question over a MessagePort (Electron "MessagePorts" tutorial, reply-streams pattern).
//
// invoke("assistant_ask") answers once, after every model round and tool call has finished, which can take a
// minute when the assistant reads articles or writes a cited brief. Over a port the main process streams what it is
// doing as it does it, then the answer, and the page can stop the question by sending { type: "cancel" } or just
// closing its end (the panel closed). Either one aborts the model call through ask()'s signal.
//
// Messages to the page: { type: "thinking", round } | { type: "tool", tool, detail } |
// { type: "tool_done", tool, ms, error } | { type: "answer", answer, model } | { type: "error", message } |
// { type: "cancelled" }. The port is closed after the last one.
async function serveAssistantPort(port, args, { ask }) {
  const controller = new AbortController();
  let open = true;
  const send = (m) => { if (!open) return; try { port.postMessage(m); } catch (_) { open = false; } };
  const finish = () => { if (!open) return; open = false; try { port.close(); } catch (_) { /* already closed */ } };
  port.on("message", ({ data } = {}) => {
    if (data && data.type === "cancel" && !controller.signal.aborted) {
      controller.abort();
      send({ type: "cancelled" });
      finish();
    }
  });
  port.on("close", () => { open = false; controller.abort(); });
  port.start();
  try {
    const r = await ask({ ...args, signal: controller.signal, onStep: send });
    send({ type: "answer", answer: r.answer, model: r.model });
  } catch (e) {
    if (!controller.signal.aborted) send({ type: "error", message: String((e && e.message) || e) });
  } finally {
    finish();
  }
}

module.exports = { serveAssistantPort };
