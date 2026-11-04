// NouGenNews's own database: every story the app sees is kept in a NouGen Shards Light store (one local SQLite file), so
// the wire has a history, the archive can be searched, and the assistant can answer about stories that have scrolled off.
// The store comes from the nougen-shards-lite package, shared by every NouGen product. A story's address is its
// identity (domain_key); its feed is a tag.
const fs = require("node:fs");
const os = require("node:os");
const path = require("node:path");

const PRODUCT = "NouGenNews";
const TEXT_LIMIT = 6000;

// A wire story as a shard-shaped record, or null when it has no address to key it on.
function storyToRecord(s) {
  const link = String((s && s.link) || "").trim();
  const title = String((s && s.title) || "").trim();
  if (!/^https?:\/\//i.test(link) || !title) return null;
  const source = String(s.source || "").trim();
  const feed = String(s.feedId || "wire").replace(/[^a-z0-9_-]/gi, "").slice(0, 40) || "wire";
  const body = String(s.text || s.desc || "").replace(/\s+/g, " ").trim().slice(0, TEXT_LIMIT);
  const tags = [source, `feed:${feed}`, s.badge, s.lang, ...(Array.isArray(s.categories) ? s.categories.slice(0, 3) : [])].map((t) => String(t || "").trim()).filter(Boolean);
  return {
    domain_key: link,
    event_type: "NEWS_STORY",
    title,
    content: body || `${source ? `${source}: ` : ""}${title}`,
    tags,
    source_uri: link,
    event_time: Number(s.timestamp) > 0 ? Number(s.timestamp) : null,
  };
}

function createArchive({ file, light = require("nougen-shards-lite"), product = PRODUCT } = {}) {
  let store = null;
  const get = () => (store = store || light.open(file, { product }));
  const api = {
    ingest(stories) {
      const recs = (Array.isArray(stories) ? stories : []).slice(0, 2000).map(storyToRecord).filter(Boolean);
      if (!recs.length) return { captured: 0, updated: 0, unchanged: 0, duplicate: 0, rejected: 0, received: 0 };
      return { ...get().captureMany(recs), received: recs.length };
    },
    // A story the reader opened counts as a use: it gains utility, so it ranks higher in later searches.
    opened(link) {
      const id = get().idFor(String(link || ""));
      return id ? get().mark(id, { worked: true }) : null;
    },
    // Hits newest-relevant first; `days` narrows to stories from the last N days.
    search({ query, limit = 10, days = 0 } = {}) {
      const since = Number(days) > 0 ? Date.now() - Number(days) * 86400000 : null;
      return get().recall(String(query || "").slice(0, 300), { limit, since });
    },
    stats: () => get().stats(),
    diagnostics: () => get().diagnostics(),
    exportTo: (dir) => get().exportBundle(dir, { product }),
    upgradeInfo: (opts) => light.upgradeInfo({ product, ...opts }),
    detectFull: (opts) => light.detectFull(opts),
    // Promotes the whole archive into the full NouGen Shards on this machine: export a bundle, then run the importer
    // that ships with Shards Light against the named vault. Only on the reader's request; returns the importer's report.
    async promote({ dir, vault = path.join(os.homedir(), ".nougen", "shards"), runImporter }) {
      const out = get().exportBundle(dir, { product });
      const report = await runImporter({ bundle: out.file, vault });
      return { exported: out.count, bundle: out.file, sha256: out.manifest.sha256, ...report };
    },
    close() { if (store) { store.close(); store = null; } },
  };
  return api;
}

// Runs tools/import_into_nougen_shards.py from the nougen-shards-lite package with the NouGen checkout's Python.
function pythonImporter({ nougenDir, pickPython, execFile = require("node:child_process").execFile, exists = fs.existsSync }) {
  const tool = path.join(path.dirname(require.resolve("nougen-shards-lite/package.json")), "tools", "import_into_nougen_shards.py");
  return ({ bundle, vault }) => new Promise((resolve) => {
    if (!exists(tool) || !exists(path.join(nougenDir, "src", "nougen_shards"))) { resolve({ ok: false, error: "NouGen Shards is not installed here" }); return; }
    execFile(pickPython(nougenDir, exists), ["-I", tool, bundle, "--vault", vault, "--nougen-dir", nougenDir], { windowsHide: true, timeout: 600000, maxBuffer: 4 * 1024 * 1024 }, (err, stdout, stderr) => {
      let rep = null;
      try { rep = JSON.parse(String(stdout || "").trim().split("\n").pop()); } catch { /* not JSON */ }
      if (err || !rep || !rep.ok) resolve({ ok: false, error: String((rep && rep.error) || stderr || (err && err.message) || "import failed").slice(-400) });
      else resolve({ ok: true, imported: rep.written, skipped: rep.skipped, vault: rep.vault });
    });
  });
}

let shared = null;

// The app's archive: shards-light.db inside the app's data folder.
function appArchive(app) {
  if (!shared) shared = createArchive({ file: path.join(app.getPath("userData"), "shards-light.db") });
  return shared;
}

module.exports = { createArchive, appArchive, storyToRecord, pythonImporter, PRODUCT };
