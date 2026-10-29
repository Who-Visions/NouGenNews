// Finds a secret for the app at launch without keeping it in the repo or on the command line. The NouGen keymaker
// is read through whichever Python the NouGen checkout provides (its .venv, a venv, then the system Python); the
// value goes to the app's environment only. Everything here fails quietly: no NouGen checkout, no venv or no secret
// just means the app starts without that key and uses its free sources.
const fs = require("node:fs");
const os = require("node:os");
const path = require("node:path");
const { spawnSync } = require("node:child_process");

// The NouGen checkout: NOUGEN_DIR, else a sibling folder of this repo's parent (Outpost\NouGen next to Outpost\NouGenNews).
function nougenDir(env = process.env, repoRoot = path.resolve(__dirname, "..")) {
  return env.NOUGEN_DIR || path.resolve(repoRoot, "..", "NouGen");
}

// The first interpreter that exists: the checkout's own venvs, then whatever python is on the PATH.
function pickPython(dir, exists = fs.existsSync, platform = process.platform) {
  const candidates = platform === "win32"
    ? [".venv/Scripts/python.exe", "venv/Scripts/python.exe"]
    : [".venv/bin/python", "venv/bin/python"];
  for (const c of candidates) {
    const p = path.join(dir, c);
    if (exists(p)) return p;
  }
  return platform === "win32" ? "python" : "python3";
}

const SNIPPET = [
  "import sys",
  "sys.path.insert(0, 'src')",
  "import nougen_shards.keymaker as k",
  "v = k.get_secret(sys.argv[1])",
  "sys.stdout.write(v or '')",
].join("\n");

// The secret's value, or "" when it cannot be read. Never throws.
function readSecret(name, { env = process.env, run = spawnSync, exists = fs.existsSync } = {}) {
  if (!/^[A-Z0-9_]{3,64}$/.test(name)) return "";
  const dir = nougenDir(env);
  if (!exists(dir)) return "";
  try {
    const r = run(pickPython(dir, exists), ["-I", "-c", SNIPPET, name], {
      cwd: dir,
      encoding: "utf8",
      timeout: 20000,
      windowsHide: true,
      env: {
        ...env,
        PYTHONPATH: "src",
        NOUGEN_SECRETS_VAULT_DIR: env.NOUGEN_SECRETS_VAULT_DIR || path.join(os.homedir(), ".nougen", "secrets"),
        NOUGEN_VAULT_DIR: env.NOUGEN_VAULT_DIR || path.join(os.homedir(), ".nougen", "shards"),
      },
    });
    return r && r.status === 0 ? String(r.stdout || "").trim() : "";
  } catch {
    return "";
  }
}

module.exports = { nougenDir, pickPython, readSecret };
