// NouGenNews's own database: every story the app sees is kept in a NouGen Shards Light store (one local SQLite file), so
// the wire has a history, the archive can be searched, and the assistant can answer about stories that have scrolled off.
// The store comes from the nougen-shards-lite package, shared by every NouGen product.
const path = require("node:path");

const PRODUCT = "NouGenNews";
const TEXT_LIMIT = 6000;

// A wire story as a shard-shaped record, or null when it has no address to key it on.
function storyToRecord(s) {
  const link = String((s && s.link) || "").trim();
  const title = String((s && s.title) || "").trim();
  if (!/^https?:\/\//i.test(link) || !title) return null;
  const source = String(s.source || "").trim();
  const body = String(s.text || s.desc || "").replace(/\s+/g, " ").trim().slice(0, TEXT_LIMIT);
  const tags = [source, s.badge, s.lang, ...(Array.isArray(s.categories) ? s.categories.slice(0, 3) : [])].map((t) => String(t || "").trim()).filter(Boolean);
  return {
    key: link,
    event_type: "NEWS_STORY",
    title,
    content: body || `${source ? `${source}: ` : ""}${title}`,
    tags,
    domain_key: `nougennews/${String(s.feedId || "wire").replace(/[^a-z0-9_-]/gi, "").slice(0, 40) || "wire"}`,
    source_uri: link,
    event_time: Number(s.timestamp) > 0 ? Number(s.timestamp) : null,
  };
}

function createArchive({ file, light = require("nougen-shards-lite"), product = PRODUCT } = {}) {
  let store = null;
  const get = () => (store = store || light.open(file, { product }));
  return {
    ingest(stories) {
      const recs = (Array.isArray(stories) ? stories : []).slice(0, 2000).map(storyToRecord).filter(Boolean);
      if (!recs.length) return { captured: 0, updated: 0, unchanged: 0, duplicate: 0, rejected: 0, received: 0 };
      return { ...get().captureMany(recs), received: recs.length };
    },
    // Hits newest-relevant first; `days` narrows to stories from the last N days.
    search({ query, limit = 10, days = 0 } = {}) {
      const since = Number(days) > 0 ? Date.now() - Number(days) * 86400000 : null;
      return get().recall(String(query || "").slice(0, 300), { limit, since });
    },
    stats: () => get().stats(),
    exportTo: (dir) => get().exportBundle(dir, { product }),
    upgradeInfo: (opts) => light.upgradeInfo({ product, ...opts }),
    close() { if (store) { store.close(); store = null; } },
  };
}

let shared = null;

// The app's archive: shards-light.db inside the app's data folder.
function appArchive(app) {
  if (!shared) shared = createArchive({ file: path.join(app.getPath("userData"), "shards-light.db") });
  return shared;
}

module.exports = { createArchive, appArchive, storyToRecord, PRODUCT };
