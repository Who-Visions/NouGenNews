// Near you from SerpApi's Google News engine: each result carries the publisher's own link, a thumbnail, the
// source name and a date, which the free Google feed lacks. It needs a key (SERPAPI_API_KEY in the environment of
// the main process; it is never sent to the page) and the free plan is metered, so results are kept on disk for
// hours and a monthly cap stops the spending before the plan's own limit. Without a key, or past the cap, or on
// any failure, the caller falls back to the free feed.
const fs = require("node:fs");
const { fetchSafe } = require("./safe");

const ENDPOINT = "https://serpapi.com/search.json";
const TTL_MS = 6 * 60 * 60 * 1000;
const MONTHLY_CAP = 200; // the free plan allows 250 searches a month
const MAX_ITEMS = 30;

// "10/29/2026, 04:03 PM, +0000 UTC" -> epoch ms (UTC), or 0.
function parseSerpDate(s) {
  const m = /^(\d{1,2})\/(\d{1,2})\/(\d{4}),\s*(\d{1,2}):(\d{2})\s*(AM|PM)/i.exec(String(s || ""));
  if (!m) return 0;
  let h = Number(m[4]) % 12;
  if (m[6].toUpperCase() === "PM") h += 12;
  return Date.UTC(Number(m[3]), Number(m[1]) - 1, Number(m[2]), h, Number(m[5]));
}

const isHttp = (u) => /^https?:\/\//i.test(String(u || ""));

// SerpApi's news_results: plain stories, and clusters ({ stories: [...] }) which are flattened.
function normalize(json, limit = MAX_ITEMS) {
  const out = [];
  const seen = new Set();
  const add = (n) => {
    if (!n || !n.title || !isHttp(n.link) || seen.has(n.link)) return;
    seen.add(n.link);
    out.push({
      title: String(n.title).trim(),
      link: n.link,
      source: (n.source && n.source.name) || "",
      thumbnail: isHttp(n.thumbnail) ? n.thumbnail : "",
      timestamp: parseSerpDate(n.date),
    });
  };
  for (const n of (json && json.news_results) || []) {
    if (n.stories) n.stories.forEach(add);
    else add(n);
  }
  return out.slice(0, limit);
}

const monthKey = (ms) => new Date(ms).toISOString().slice(0, 7);

function load(file) {
  try { return JSON.parse(fs.readFileSync(file, "utf8")); } catch { return { month: "", used: 0, entries: {} }; }
}
function save(file, data) {
  try { fs.writeFileSync(file, JSON.stringify(data)); } catch { /* a cache that cannot be written only costs a search */ }
}

// { items, cached, used } or null when SerpApi cannot serve this query (the caller uses the free feed).
async function searchLocalNews({ query, apiKey, file, http = fetchSafe, now = Date.now }) {
  const q = String(query || "").trim().slice(0, 80);
  if (!q) return null;
  const t = now();
  const data = load(file);
  if (data.month !== monthKey(t)) { data.month = monthKey(t); data.used = 0; }
  data.entries = data.entries || {};
  const hit = data.entries[q.toLowerCase()];
  if (hit && t - hit.at < TTL_MS) return { items: hit.items, cached: true, used: data.used };
  if (!apiKey || data.used >= MONTHLY_CAP) return hit ? { items: hit.items, cached: true, stale: true, used: data.used } : null;
  try {
    const url = `${ENDPOINT}?${new URLSearchParams({ engine: "google_news", q, gl: "us", hl: "en", api_key: apiKey })}`;
    const res = await http(url, { headers: { Accept: "application/json" } }, { retries: false, timeoutMs: 15000 });
    if (!res.ok) return hit ? { items: hit.items, cached: true, stale: true, used: data.used } : null;
    const items = normalize(await res.json());
    if (!items.length) return hit ? { items: hit.items, cached: true, stale: true, used: data.used } : null;
    data.used += 1;
    data.entries[q.toLowerCase()] = { at: t, items };
    save(file, data);
    return { items, cached: false, used: data.used };
  } catch {
    return hit ? { items: hit.items, cached: true, stale: true, used: data.used } : null;
  }
}

module.exports = { searchLocalNews, normalize, parseSerpDate, MONTHLY_CAP, TTL_MS };
