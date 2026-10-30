// Neural read-aloud: the Kokoro voice model runs in a Python sidecar (scripts/kokoro_sidecar.py), one process per
// request, text in on stdin and a WAV out. The Python that has Kokoro installed is found, not assumed: an environment
// override, the NouGenFlix Kokoro venv, then whatever python is on the PATH. The page gets the WAV as base64.
const fs = require("node:fs");
const os = require("node:os");
const path = require("node:path");
const { spawn } = require("node:child_process");

const VOICE = /^[a-z]{2}_[a-z]+$/;

function kokoroPython(env = process.env, exists = fs.existsSync, home = os.homedir()) {
  for (const k of ["NOUGENNEWS_KOKORO_PYTHON", "NOUGENFLIX_KOKORO_PYTHON"]) if (env[k] && env[k].trim()) return env[k].trim();
  const venv = path.join(home, ".nougenflix", "kokoro-venv", "Scripts", "python.exe");
  if (exists(venv)) return venv;
  const posix = path.join(home, ".nougenflix", "kokoro-venv", "bin", "python");
  if (exists(posix)) return posix;
  return process.platform === "win32" ? "python" : "python3";
}

// Resolves with the WAV as base64; rejects with a short message the reader can show.
function kokoroSynth({ text, voice, script = path.join(__dirname, "..", "scripts", "kokoro_sidecar.py"), python = kokoroPython(), spawnFn = spawn, tmp = os.tmpdir(), timeoutMs = 240000 }) {
  return new Promise((resolve, reject) => {
    const t = String(text || "").trim();
    if (!t) return reject(new Error("No text to read"));
    if (!VOICE.test(String(voice || ""))) return reject(new Error("Unknown Kokoro voice"));
    const out = path.join(tmp, `nougennews-kokoro-${process.pid}-${Date.now()}.wav`);
    let stdout = "";
    let stderr = "";
    const child = spawnFn(python, [script, "synth", voice, out], { windowsHide: true, env: { ...process.env, PYTHONIOENCODING: "utf-8" } });
    const timer = setTimeout(() => { try { child.kill(); } catch { /* already gone */ } reject(new Error("Kokoro took too long")); }, timeoutMs);
    child.stdout.on("data", (d) => { stdout += d; });
    child.stderr.on("data", (d) => { stderr += d; });
    child.on("error", (e) => { clearTimeout(timer); reject(new Error(`Kokoro could not start (${python}): ${e.message}`)); });
    child.on("close", () => {
      clearTimeout(timer);
      let r = null;
      try { r = JSON.parse(stdout.trim().split(/\r?\n/).pop()); } catch { /* handled below */ }
      if (!r || !r.ok) return reject(new Error((r && r.error) || `Kokoro gave no result: ${stderr.slice(-200)}`));
      try {
        const b64 = fs.readFileSync(r.path || out).toString("base64");
        try { fs.unlinkSync(r.path || out); } catch { /* temp file */ }
        resolve(b64);
      } catch (e) { reject(new Error(`Kokoro audio missing: ${e.message}`)); }
    });
    child.stdin.end(t, "utf8");
  });
}

// A long-lived sidecar: the model loads once and every later piece is answered from memory (the one-shot path above
// reloads it for each piece). One JSON request per line in, one JSON answer per line out. The process is restarted
// if it dies and stopped after `idleMs` without a request, so it does not hold the model's memory all day.
class KokoroServer {
  constructor({ script = path.join(__dirname, "..", "scripts", "kokoro_sidecar.py"), python = kokoroPython(), spawnFn = spawn, tmp = os.tmpdir(), idleMs = 600000, timeoutMs = 240000 } = {}) {
    Object.assign(this, { script, python, spawnFn, tmp, idleMs, timeoutMs });
    this.child = null;
    this.ready = null;
    this.pending = new Map();
    this.nextId = 1;
    this.idle = null;
  }

  _fail(err) {
    for (const p of this.pending.values()) { clearTimeout(p.timer); p.reject(err); }
    this.pending.clear();
  }

  _start() {
    if (this.ready) return this.ready;
    this.ready = new Promise((resolve, reject) => {
      let buf = "";
      let up = false;
      const child = this.spawnFn(this.python, [this.script, "serve"], { windowsHide: true, env: { ...process.env, PYTHONIOENCODING: "utf-8" } });
      this.child = child;
      const startTimer = setTimeout(() => { if (!up) { try { child.kill(); } catch { /* gone */ } } }, 60000);
      child.stdout.on("data", (d) => {
        buf += d;
        let at;
        while ((at = buf.indexOf("\n")) >= 0) {
          const line = buf.slice(0, at).trim();
          buf = buf.slice(at + 1);
          if (!line) continue;
          let msg = null;
          try { msg = JSON.parse(line); } catch { continue; }
          if (msg.ready && !up) { up = true; clearTimeout(startTimer); resolve(); continue; }
          const p = this.pending.get(msg.id);
          if (p) { this.pending.delete(msg.id); clearTimeout(p.timer); this._touch(); p.resolve(msg); }
        }
      });
      child.stderr.on("data", () => { /* model download and library chatter; failures come back as answers */ });
      const down = (why) => {
        clearTimeout(startTimer);
        if (this.child === child) { this.child = null; this.ready = null; }
        const err = new Error(why);
        if (!up) reject(err);
        this._fail(err);
      };
      child.on("error", (e) => down(`Kokoro could not start (${this.python}): ${e.message}`));
      child.on("close", () => down("Kokoro server stopped"));
    });
    return this.ready;
  }

  _touch() {
    clearTimeout(this.idle);
    // Idle means nothing is waiting for an answer: a long first load must not be mistaken for it.
    this.idle = setTimeout(() => { if (this.pending.size) this._touch(); else this.stop(); }, this.idleMs);
    if (this.idle.unref) this.idle.unref();
  }

  _ask(req) {
    return this._start().then(() => new Promise((resolve, reject) => {
      const id = this.nextId++;
      const timer = setTimeout(() => { this.pending.delete(id); reject(new Error("Kokoro took too long")); }, this.timeoutMs);
      this.pending.set(id, { resolve, reject, timer });
      this._touch();
      try { this.child.stdin.write(`${JSON.stringify({ ...req, id })}\n`, "utf8"); } catch (e) { this.pending.delete(id); clearTimeout(timer); reject(e); }
    }));
  }

  // Loads the model for a voice ahead of the first request so the first piece does not pay for it.
  warm(voice) {
    if (!VOICE.test(String(voice || ""))) return Promise.reject(new Error("Unknown Kokoro voice"));
    return this._ask({ op: "warm", voice }).then((r) => { if (!r.ok) throw new Error(r.error || "Kokoro warm-up failed"); });
  }

  // Resolves with the WAV as base64, like kokoroSynth.
  async synth({ text, voice }) {
    const t = String(text || "").trim();
    if (!t) throw new Error("No text to read");
    if (!VOICE.test(String(voice || ""))) throw new Error("Unknown Kokoro voice");
    const out = path.join(this.tmp, `nougennews-kokoro-${process.pid}-${Date.now()}-${this.nextId}.wav`);
    const r = await this._ask({ op: "synth", voice, text: t, out });
    if (!r.ok) { const e = new Error(r.error || "Kokoro gave no result"); e.fromServer = true; throw e; }
    try {
      const b64 = fs.readFileSync(r.path || out).toString("base64");
      try { fs.unlinkSync(r.path || out); } catch { /* temp file */ }
      return b64;
    } catch (e) { throw new Error(`Kokoro audio missing: ${e.message}`); }
  }

  stop() {
    clearTimeout(this.idle);
    const c = this.child;
    this.child = null;
    this.ready = null;
    if (c) { try { c.stdin.end(); } catch { /* gone */ } try { c.kill(); } catch { /* gone */ } }
  }
}

let shared = null;

// The reader's entry point: the long-lived server first; if it cannot run (no Kokoro for that Python, process gone)
// the one-shot path tries once. A voice or text error from the server is final: the one-shot would only repeat it.
async function kokoroSynthFast(args, { server = (shared = shared || new KokoroServer()), oneShot = kokoroSynth } = {}) {
  try {
    return await server.synth(args);
  } catch (e) {
    if (e && (e.fromServer || /^(No text|Unknown Kokoro voice)/.test(e.message))) throw e;
    return oneShot(args);
  }
}

module.exports = { kokoroSynth, kokoroSynthFast, KokoroServer, kokoroPython };
