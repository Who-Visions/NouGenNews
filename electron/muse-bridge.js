// Shared bridge & state sync between NouGenNews Electron and NouGenMuse (app_bridge + MCP adapters).
// Keeps live stories, briefs, and saved stories synced via an atomic JSON snapshot at
// ~/.nougen/muse/news_sync.json (overridable via NOUGEN_MUSE_SYNC_FILE) and optionally
// notifies a live NouGenMuse app_bridge endpoint when NOUGEN_MUSE_BRIDGE_URL is set.
const fs = require("node:fs");
const os = require("node:os");
const path = require("node:path");

const DEFAULT_STATE_FILE = path.join(os.homedir(), ".nougen", "muse", "news_sync.json");

function resolveStateFile(stateFile) {
  return stateFile || process.env.NOUGEN_MUSE_SYNC_FILE || DEFAULT_STATE_FILE;
}

function normalizeStory(s) {
  if (!s || typeof s !== "object") return null;
  const id = String(s.id || s.link || "").trim();
  const title = String(s.title || "").trim();
  if (!id && !title) return null;
  return {
    id: id || title,
    title: title.slice(0, 300),
    link: String(s.link || "").slice(0, 1000),
    source: String(s.source || "").slice(0, 120),
    timestamp: Number(s.timestamp) || 0,
    alertLevel: String(s.alertLevel || ""),
  };
}

function normalizeBrief(b) {
  if (!b || typeof b !== "object") return null;
  const title = String(b.title || b.topic || "").trim();
  const body = String(b.body || b.summary || "").trim();
  if (!title && !body) return null;
  return {
    id: String(b.id || title).slice(0, 120),
    title: title.slice(0, 240),
    body: body.slice(0, 4000),
    updatedAt: Number(b.updatedAt) || Date.now(),
  };
}

function dedupeById(list) {
  const seen = new Set();
  const out = [];
  for (const item of list) {
    if (!item) continue;
    const key = item.id || item.link || item.title;
    if (!key || seen.has(key)) continue;
    seen.add(key);
    out.push(item);
  }
  return out;
}

function readSnapshot(opts = {}) {
  const file = resolveStateFile(opts.stateFile);
  try {
    const raw = fs.readFileSync(file, "utf8");
    const parsed = JSON.parse(raw);
    return {
      version: Number(parsed.version) || 1,
      source: String(parsed.source || "unknown"),
      updatedAt: Number(parsed.updatedAt) || 0,
      stories: Array.isArray(parsed.stories) ? parsed.stories : [],
      briefs: Array.isArray(parsed.briefs) ? parsed.briefs : [],
      savedStories: Array.isArray(parsed.savedStories) ? parsed.savedStories : [],
    };
  } catch (_) {
    return {
      version: 1,
      source: "nougennews-electron",
      updatedAt: 0,
      stories: [],
      briefs: [],
      savedStories: [],
    };
  }
}

function writeAtomic(file, payload) {
  fs.mkdirSync(path.dirname(file), { recursive: true });
  const tmp = `${file}.${process.pid}.${Date.now()}.tmp`;
  fs.writeFileSync(tmp, JSON.stringify(payload, null, 2), "utf8");
  fs.renameSync(tmp, file);
}

async function notifyBridge(payload, opts = {}) {
  const url = opts.bridgeUrl || process.env.NOUGEN_MUSE_BRIDGE_URL || "";
  if (!url) return { notified: false, reason: "no_bridge_url" };
  try {
    const res = await fetch(url, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ event: "nougennews_sync", payload }),
      signal: AbortSignal.timeout(2000),
    });
    return { notified: res.ok, status: res.status };
  } catch (err) {
    return { notified: false, reason: String(err && err.message ? err.message : err) };
  }
}

async function publishSnapshot(args = {}, opts = {}) {
  const file = resolveStateFile(opts.stateFile);
  const prev = readSnapshot({ stateFile: file });
  const stories = Array.isArray(args.stories)
    ? dedupeById(args.stories.map(normalizeStory)).slice(0, 100)
    : prev.stories;
  const briefs = Array.isArray(args.briefs)
    ? dedupeById(args.briefs.map(normalizeBrief)).slice(0, 20)
    : prev.briefs;
  const savedStories = Array.isArray(args.savedStories)
    ? dedupeById(args.savedStories.map(normalizeStory)).slice(0, 100)
    : prev.savedStories;

  const payload = {
    version: 1,
    source: String(args.source || "nougennews-electron"),
    updatedAt: Date.now(),
    counts: {
      stories: stories.length,
      briefs: briefs.length,
      savedStories: savedStories.length,
    },
    stories,
    briefs,
    savedStories,
  };
  writeAtomic(file, payload);
  const bridge = await notifyBridge(payload, opts);
  return { ok: true, file, counts: payload.counts, updatedAt: payload.updatedAt, bridge };
}

async function mergeSavedStories(args = {}, opts = {}) {
  const file = resolveStateFile(opts.stateFile);
  const prev = readSnapshot({ stateFile: file });
  const incoming = Array.isArray(args.savedStories) ? args.savedStories.map(normalizeStory) : [];
  const merged = dedupeById([...incoming, ...prev.savedStories]).slice(0, 100);
  return publishSnapshot(
    {
      stories: prev.stories,
      briefs: prev.briefs,
      savedStories: merged,
      source: args.source || "nougennews-electron",
    },
    opts,
  );
}

module.exports = {
  DEFAULT_STATE_FILE,
  resolveStateFile,
  readSnapshot,
  publishSnapshot,
  mergeSavedStories,
};
