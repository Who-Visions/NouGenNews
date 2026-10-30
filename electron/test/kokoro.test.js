const test = require("node:test");
const assert = require("node:assert/strict");
const fs = require("node:fs");
const os = require("node:os");
const path = require("node:path");
const { EventEmitter } = require("node:events");
const { kokoroSynth, kokoroPython } = require("../kokoro");

test("the Kokoro python is an override, then the NouGenFlix venv, then the PATH", () => {
  assert.equal(kokoroPython({ NOUGENNEWS_KOKORO_PYTHON: "X:/py.exe" }, () => false, "H"), "X:/py.exe");
  assert.match(kokoroPython({}, (p) => /kokoro-venv/.test(p) && /python\.exe$/.test(p), "H"), /kokoro-venv/);
  assert.match(kokoroPython({}, () => false, "H"), /^python3?$/);
});

function fakeSpawn(wav) {
  return (python, args) => {
    const c = new EventEmitter();
    c.stdout = new EventEmitter();
    c.stderr = new EventEmitter();
    c.stdin = { end: (t) => { c.text = t; setImmediate(() => { if (wav) fs.writeFileSync(args[3], wav); c.stdout.emit("data", JSON.stringify(wav ? { ok: true, path: args[3] } : { ok: false, error: "boom" }) + "\n"); c.emit("close"); }); } };
    c.kill = () => {};
    c.args = args;
    return c;
  };
}

test("text goes in, the WAV comes back as base64, and the temp file is removed", async () => {
  const tmp = fs.mkdtempSync(path.join(os.tmpdir(), "kk-"));
  const b64 = await kokoroSynth({ text: "Hello world", voice: "af_heart", spawnFn: fakeSpawn(Buffer.from("RIFFwav")), tmp, python: "py" });
  assert.equal(Buffer.from(b64, "base64").toString(), "RIFFwav");
  assert.equal(fs.readdirSync(tmp).length, 0);
});

test("a sidecar error, an empty text and a bad voice are clear rejections", async () => {
  const tmp = fs.mkdtempSync(path.join(os.tmpdir(), "kk-"));
  await assert.rejects(kokoroSynth({ text: "x", voice: "af_heart", spawnFn: fakeSpawn(null), tmp, python: "py" }), /boom/);
  await assert.rejects(kokoroSynth({ text: " ", voice: "af_heart" }), /No text/);
  await assert.rejects(kokoroSynth({ text: "x", voice: "../evil" }), /voice/);
});

const { KokoroServer, kokoroSynthFast } = require("../kokoro");

// A fake long-lived sidecar: says ready, then answers each request line; `behave` shapes the answer.
function fakeServer(behave) {
  const spawns = [];
  const spawnFn = (python, args) => {
    const c = new EventEmitter();
    c.stdout = new EventEmitter();
    c.stderr = new EventEmitter();
    c.killed = false;
    c.kill = () => { c.killed = true; setImmediate(() => c.emit("close")); };
    c.stdin = {
      end: () => {},
      write: (line) => {
        const req = JSON.parse(line);
        c.requests = (c.requests || []).concat(req);
        setImmediate(() => c.stdout.emit("data", JSON.stringify({ id: req.id, ...behave(req) }) + "\n"));
      },
    };
    c.args = args;
    spawns.push(c);
    setImmediate(() => c.stdout.emit("data", JSON.stringify({ ok: true, ready: true }) + "\n"));
    return c;
  };
  return { spawnFn, spawns };
}

test("the Kokoro server starts once and answers every piece from the same process", async () => {
  const tmp = fs.mkdtempSync(path.join(os.tmpdir(), "nn-kokoro-"));
  const { spawnFn, spawns } = fakeServer((req) => { if (req.op === "synth") fs.writeFileSync(req.out, "WAV"); return { ok: true, path: req.out }; });
  const s = new KokoroServer({ spawnFn, tmp, python: "py", script: "s.py" });
  const a = await s.synth({ text: "one", voice: "af_heart" });
  const b = await s.synth({ text: "two", voice: "af_heart" });
  assert.equal(Buffer.from(a, "base64").toString(), "WAV");
  assert.equal(Buffer.from(b, "base64").toString(), "WAV");
  assert.equal(spawns.length, 1);
  assert.deepEqual(spawns[0].args, ["s.py", "serve"]);
  assert.equal(spawns[0].requests.length, 2);
  s.stop();
});

test("the Kokoro server is restarted after it dies, and refuses bad voices and empty text", async () => {
  const tmp = fs.mkdtempSync(path.join(os.tmpdir(), "nn-kokoro-"));
  const { spawnFn, spawns } = fakeServer((req) => { fs.writeFileSync(req.out || path.join(tmp, "x"), "WAV"); return { ok: true, path: req.out }; });
  const s = new KokoroServer({ spawnFn, tmp, python: "py", script: "s.py" });
  await s.synth({ text: "one", voice: "af_heart" });
  spawns[0].emit("close");
  await s.synth({ text: "two", voice: "af_heart" });
  assert.equal(spawns.length, 2);
  await assert.rejects(s.synth({ text: "x", voice: "bad voice" }), /Unknown Kokoro voice/);
  await assert.rejects(s.synth({ text: "  ", voice: "af_heart" }), /No text/);
  s.stop();
});

test("a request in flight when the server dies is rejected, not left hanging", async () => {
  const tmp = fs.mkdtempSync(path.join(os.tmpdir(), "nn-kokoro-"));
  const spawnFn = () => {
    const c = new EventEmitter();
    c.stdout = new EventEmitter(); c.stderr = new EventEmitter();
    c.kill = () => {};
    c.stdin = { end: () => {}, write: () => setImmediate(() => c.emit("close")) };
    setImmediate(() => c.stdout.emit("data", JSON.stringify({ ok: true, ready: true }) + "\n"));
    return c;
  };
  const s = new KokoroServer({ spawnFn, tmp, python: "py" });
  await assert.rejects(s.synth({ text: "one", voice: "af_heart" }), /Kokoro server stopped/);
});

test("kokoroSynthFast falls back to the one-shot path when the server cannot run, but not for a server's own error", async () => {
  const dead = { synth: async () => { throw new Error("Kokoro could not start (py): ENOENT"); } };
  assert.equal(await kokoroSynthFast({ text: "a", voice: "af_heart" }, { server: dead, oneShot: async () => "ONESHOT" }), "ONESHOT");
  const refusing = { synth: async () => { const e = new Error("Kokoro produced no audio"); e.fromServer = true; throw e; } };
  let called = false;
  await assert.rejects(kokoroSynthFast({ text: "a", voice: "af_heart" }, { server: refusing, oneShot: async () => { called = true; return "x"; } }), /no audio/);
  assert.equal(called, false);
});

test("the idle stop never fires while a request is still waiting for its answer", async () => {
  const tmp = fs.mkdtempSync(path.join(os.tmpdir(), "nn-kokoro-"));
  let release;
  const spawnFn = () => {
    const c = new EventEmitter();
    c.stdout = new EventEmitter(); c.stderr = new EventEmitter();
    c.killed = false;
    c.kill = () => { c.killed = true; };
    c.stdin = { end: () => {}, write: (line) => { const req = JSON.parse(line); release = () => { fs.writeFileSync(req.out, "WAV"); c.stdout.emit("data", JSON.stringify({ id: req.id, ok: true, path: req.out }) + "\n"); }; } };
    c.spawned = true;
    setImmediate(() => c.stdout.emit("data", JSON.stringify({ ok: true, ready: true }) + "\n"));
    spawnFn.last = c;
    return c;
  };
  const s = new KokoroServer({ spawnFn, tmp, python: "py", idleMs: 20 });
  const p = s.synth({ text: "slow", voice: "af_heart" });
  await new Promise((r) => setTimeout(r, 90)); // several idle periods pass while the model "loads"
  assert.equal(spawnFn.last.killed, false);
  release();
  assert.equal(Buffer.from(await p, "base64").toString(), "WAV");
  await new Promise((r) => setTimeout(r, 60)); // now it is idle and stops
  assert.equal(spawnFn.last.killed, true);
});
