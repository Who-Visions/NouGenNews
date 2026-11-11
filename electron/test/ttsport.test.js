const test = require("node:test");
const assert = require("node:assert/strict");
const { attachTtsPort, MAX_CHARS } = require("../ttsport");

// Minimal stand-ins for ipcMain and a MessagePortMain: enough to drive the handler without Electron.
function fakeIpc() {
  const handlers = {};
  return { handlers, on: (name, fn) => { handlers[name] = fn; } };
}
function fakePort() {
  const port = { listeners: [], posted: [], started: false };
  port.on = (name, fn) => { if (name === "message") port.listeners.push(fn); };
  port.start = () => { port.started = true; };
  port.postMessage = (data, transfer) => { port.posted.push({ data, transfer }); };
  port.emit = (data) => port.listeners.forEach((fn) => fn({ data }));
  return port;
}
const flush = () => new Promise((r) => setImmediate(r));
const appFrame = { url: "file:///app/index.html", parent: null };

test("ignores a channel request from a frame that is not the app's own top-level page", () => {
  const ipc = fakeIpc();
  attachTtsPort({ ipcMain: ipc, isAppFrame: () => false, synth: async () => "" });
  const port = fakePort();
  ipc.handlers["tts-channel"]({ senderFrame: { url: "https://evil.example" } , ports: [port] });
  assert.equal(port.started, false);
  assert.equal(port.listeners.length, 0);
});

test("ignores a channel request that carries no port", () => {
  const ipc = fakeIpc();
  attachTtsPort({ ipcMain: ipc, isAppFrame: () => true, synth: async () => "" });
  assert.doesNotThrow(() => ipc.handlers["tts-channel"]({ senderFrame: appFrame, ports: [] }));
});

test("answers a request with the WAV as a transferred ArrayBuffer, decoded once from base64", async () => {
  const ipc = fakeIpc();
  const calls = [];
  const wavBytes = Buffer.from([0x52, 0x49, 0x46, 0x46, 1, 2, 3, 4]); // "RIFF" header bytes
  attachTtsPort({
    ipcMain: ipc,
    isAppFrame: () => true,
    synth: async (args) => { calls.push(args); return wavBytes.toString("base64"); },
  });
  const port = fakePort();
  ipc.handlers["tts-channel"]({ senderFrame: appFrame, ports: [port] });
  assert.equal(port.started, true);
  port.emit({ id: 7, text: "hello", voice: "af_heart" });
  await flush();
  assert.deepEqual(calls, [{ text: "hello", voice: "af_heart" }]);
  assert.equal(port.posted.length, 1);
  const { data, transfer } = port.posted[0];
  assert.equal(data.id, 7);
  assert.equal(data.ok, true);
  assert.ok(data.wav instanceof ArrayBuffer, "wav must be an ArrayBuffer");
  assert.deepEqual(Buffer.from(data.wav), wavBytes);
  assert.deepEqual(transfer, [data.wav], "buffer is transferred, not copied");
});

test("text is capped at MAX_CHARS before it reaches the synthesizer", async () => {
  const ipc = fakeIpc();
  const seen = [];
  attachTtsPort({ ipcMain: ipc, isAppFrame: () => true, synth: async (a) => { seen.push(a.text); return ""; } });
  const port = fakePort();
  ipc.handlers["tts-channel"]({ senderFrame: appFrame, ports: [port] });
  port.emit({ id: 1, text: "x".repeat(MAX_CHARS + 500), voice: "af_heart" });
  await flush();
  assert.equal(seen[0].length, MAX_CHARS);
});

test("a synthesis failure is answered by id with the message, not thrown into the main process", async () => {
  const ipc = fakeIpc();
  attachTtsPort({ ipcMain: ipc, isAppFrame: () => true, synth: async () => { throw new Error("Unknown Kokoro voice"); } });
  const port = fakePort();
  ipc.handlers["tts-channel"]({ senderFrame: appFrame, ports: [port] });
  port.emit({ id: 3, text: "hi", voice: "bad" });
  await flush();
  assert.deepEqual(port.posted[0].data, { id: 3, ok: false, error: "Unknown Kokoro voice" });
});

test("requests on one channel are answered independently and keep their ids", async () => {
  const ipc = fakeIpc();
  attachTtsPort({
    ipcMain: ipc,
    isAppFrame: () => true,
    synth: async ({ text }) => {
      if (text === "slow") await new Promise((r) => setTimeout(r, 20));
      return Buffer.from(text).toString("base64");
    },
  });
  const port = fakePort();
  ipc.handlers["tts-channel"]({ senderFrame: appFrame, ports: [port] });
  port.emit({ id: 1, text: "slow", voice: "v" });
  port.emit({ id: 2, text: "fast", voice: "v" });
  await new Promise((r) => setTimeout(r, 60));
  const ids = port.posted.map((p) => p.data.id);
  assert.deepEqual(ids.sort(), [1, 2]);
  const byId = Object.fromEntries(port.posted.map((p) => [p.data.id, Buffer.from(p.data.wav).toString()]));
  assert.equal(byId[1], "slow");
  assert.equal(byId[2], "fast");
});
