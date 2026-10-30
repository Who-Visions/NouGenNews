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

module.exports = { kokoroSynth, kokoroPython };
