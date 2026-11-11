// Read-only recall from the NouGen shards for the assistant. It runs the checkout's own retrieve() through the same
// Python the keymaker reader uses, with the vault path pinned so a stray working-directory vault can never answer.
// Fails quietly: no checkout, no Python or no hit gives an empty list, never an error the page has to handle.
const fs = require("node:fs");
const os = require("node:os");
const path = require("node:path");
const { execFile } = require("node:child_process");
const { nougenDir, pickPython } = require("../scripts/resolve-key.cjs");

const SNIPPET = [
  "import sys, json",
  "sys.path.insert(0, 'src')",
  "from nougen_shards import core",
  "hits = core.retrieve(sys.argv[1], limit=int(sys.argv[2]))",
  "out = []",
  "for h in hits or []:",
  "    if not isinstance(h, dict):",
  "        continue",
  "    body = str(h.get('content') or h.get('text') or h.get('snippet') or '')",
  "    out.append({'id': h.get('id'), 'db': h.get('_db_index') or h.get('db') or h.get('db_index'), 'title': str(h.get('title') or '')[:160], 'body': body[:400]})",
  "sys.stdout.write(json.dumps(out, default=str))",
].join("\n");

// Runs a command without blocking the app (a synchronous spawn would freeze every window for the seconds retrieval takes).
const runAsync = (cmd, args, opts) => new Promise((resolve) => {
  execFile(cmd, args, { ...opts, maxBuffer: 4 * 1024 * 1024 }, (err, stdout) => resolve({ status: err ? 1 : 0, stdout: String(stdout || "") }));
});

// [{ id, db, title, body }] for a query from the knowledge the shards hold. Resolves to [] on any failure; never rejects.
async function recallShards(query, { limit = 5, env = process.env, run = runAsync, exists = fs.existsSync } = {}) {
  const q = String(query || "").trim().slice(0, 300);
  if (q.length < 2) return [];
  const dir = nougenDir(env);
  if (!exists(dir)) return [];
  try {
    const r = await run(pickPython(dir, exists), ["-I", "-c", SNIPPET, q, String(Math.min(Math.max(limit, 1), 8))], {
      cwd: dir,
      encoding: "utf8",
      timeout: 45000,
      windowsHide: true,
      env: {
        ...env,
        PYTHONPATH: "src",
        NOUGEN_VAULT_DIR: env.NOUGEN_VAULT_DIR || path.join(os.homedir(), ".nougen", "shards"),
        NOUGEN_SECRETS_VAULT_DIR: env.NOUGEN_SECRETS_VAULT_DIR || path.join(os.homedir(), ".nougen", "secrets"),
      },
    });
    if (!r || r.status !== 0) return [];
    const list = JSON.parse(String(r.stdout || "[]"));
    return Array.isArray(list) ? list : [];
  } catch {
    return [];
  }
}

module.exports = { recallShards };
