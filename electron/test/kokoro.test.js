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
