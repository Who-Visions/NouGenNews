const test = require("node:test");
const assert = require("node:assert/strict");
const { EventEmitter } = require("node:events");
const { serveAssistantPort } = require("../assistant-port");

// A stand-in for Electron's MessagePortMain: on("message", ({ data })), on("close"), postMessage, start, close.
function fakePort() {
  const p = new EventEmitter();
  p.sent = []; p.started = false; p.closed = false;
  p.start = () => { p.started = true; };
  p.postMessage = (m) => { if (p.closed) throw new Error("port closed"); p.sent.push(m); };
  p.close = () => { if (!p.closed) { p.closed = true; p.emit("close"); } };
  p.fromPage = (data) => p.emit("message", { data });
  return p;
}

test("streams each step, then the answer, then closes the port", async () => {
  const port = fakePort();
  const ask = async ({ onStep }) => {
    onStep({ type: "thinking", round: 1 });
    onStep({ type: "tool", tool: "search_wire", detail: "gunsmoke" });
    onStep({ type: "tool_done", tool: "search_wire", ms: 4, error: false });
    return { answer: "Kelley was on Gunsmoke.", model: "gemma4:31b" };
  };
  await serveAssistantPort(port, { question: "q" }, { ask });
  assert.ok(port.started);
  assert.deepEqual(port.sent.map((m) => m.type), ["thinking", "tool", "tool_done", "answer"]);
  assert.equal(port.sent[3].answer, "Kelley was on Gunsmoke.");
  assert.equal(port.sent[3].model, "gemma4:31b");
  assert.ok(port.closed);
});

test("an error is sent as an error message, not thrown", async () => {
  const port = fakePort();
  await serveAssistantPort(port, {}, { ask: async () => { throw new Error("No model answered"); } });
  assert.deepEqual(port.sent, [{ type: "error", message: "No model answered" }]);
  assert.ok(port.closed);
});

test("cancel from the page aborts the model call and sends nothing more", async () => {
  const port = fakePort();
  let aborted = false;
  const ask = ({ signal }) => new Promise((resolve, reject) => {
    signal.addEventListener("abort", () => { aborted = true; reject(new Error("aborted")); });
  });
  const done = serveAssistantPort(port, {}, { ask });
  port.fromPage({ type: "cancel" });
  await done;
  assert.ok(aborted);
  assert.deepEqual(port.sent, [{ type: "cancelled" }]);
  assert.ok(port.closed);
});

test("the page closing its end aborts too (panel closed mid-answer)", async () => {
  const port = fakePort();
  let aborted = false;
  const ask = ({ signal }) => new Promise((_, reject) => signal.addEventListener("abort", () => { aborted = true; reject(new Error("aborted")); }));
  const done = serveAssistantPort(port, {}, { ask });
  port.close();
  await done;
  assert.ok(aborted);
});
