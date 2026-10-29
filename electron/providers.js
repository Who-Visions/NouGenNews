// API providers: every outside news or media API the app uses sits behind this one registry. A provider is
//   { id, env, ttlMs, cap: { period: "day" | "month", max }, run({ key, get }) -> items[] }
// and always returns the same item shape ({ title, link, source, thumbnail, timestamp, desc }), so a new API is one
// entry here plus one line in core/feeds.js. What this module adds for all of them:
//   - the key comes from the main process's environment only and is never returned to the page;
//   - results are kept on disk for the provider's TTL, so restarts and refreshes spend nothing;
//   - each request counts against a daily or monthly cap that stops short of the plan's own limit;
//   - on any failure (no key, cap reached, offline, bad answer) the last good copy is served, or null.
const fs = require("node:fs");
const { fetchSafe } = require("./safe");

const isHttp = (u) => /^https?:\/\//i.test(String(u || ""));
const clean = (s) => String(s || "").replace(/\s+/g, " ").trim();

// ---- providers -----------------------------------------------------------------------------------------------

// TheNewsAPI: top stories by category. The free plan returns 3 articles per request, so one request per category.
const CATEGORIES = ["general", "business", "tech", "entertainment"];
const thenewsapi = {
  id: "thenewsapi",
  env: "THENEWSAPI_TOKEN",
  ttlMs: 4 * 3600 * 1000,
  cap: { period: "day", max: 80 }, // the free plan allows 100 requests a day
  async run({ key, get }) {
    const items = [];
    const seen = new Set();
    for (const c of CATEGORIES) {
      const d = await get(`https://api.thenewsapi.com/v1/news/top?${new URLSearchParams({ api_token: key, locale: "us", language: "en", categories: c, limit: "3" })}`);
      for (const a of (d && d.data) || []) {
        if (!a.title || !isHttp(a.url) || seen.has(a.url)) continue;
        seen.add(a.url);
        items.push({
          title: clean(a.title), link: a.url, source: clean(a.source), desc: clean(a.description || a.snippet),
          thumbnail: isHttp(a.image_url) ? a.image_url : "", timestamp: Date.parse(a.published_at) || 0,
        });
      }
    }
    return items;
  },
};

// TMDB: what is trending this week across film and TV (posters, summaries). Free; the read token is the key.
const tmdb = {
  id: "tmdb",
  env: "TMDB_READ_ACCESS_TOKEN",
  ttlMs: 6 * 3600 * 1000,
  cap: { period: "day", max: 40 },
  async run({ key, get, now }) {
    const d = await get("https://api.themoviedb.org/3/trending/all/week", { Authorization: `Bearer ${key}` });
    const items = [];
    (d && d.results || []).slice(0, 20).forEach((r, i) => {
      const title = clean(r.title || r.name);
      if (!title || !r.id || (r.media_type !== "movie" && r.media_type !== "tv")) return;
      const art = r.backdrop_path || r.poster_path;
      items.push({
        title: `${title}${r.media_type === "tv" ? " (TV)" : ""}`,
        link: `https://www.themoviedb.org/${r.media_type}/${r.id}`,
        source: "TMDB Trending", desc: clean(r.overview),
        thumbnail: art ? `https://image.tmdb.org/t/p/w780${art}` : "",
        // Trending has no date of its own: stamp it "now", a minute apart in rank order, so the ranking is kept.
        timestamp: now() - i * 60000,
      });
    });
    return items;
  },
};

// NASA's picture of the day, through an api.data.gov key. One item a day.
const nasa = {
  id: "nasa",
  env: "DATA_GOV_API_KEY",
  ttlMs: 12 * 3600 * 1000,
  cap: { period: "day", max: 20 },
  async run({ key, get }) {
    const d = await get(`https://api.nasa.gov/planetary/apod?${new URLSearchParams({ api_key: key, thumbs: "true" })}`);
    if (!d || !d.title) return [];
    const yymmdd = String(d.date || "").replace(/^\d\d(\d\d)-(\d\d)-(\d\d)$/, "$1$2$3");
    const pic = d.media_type === "image" ? d.url : d.thumbnail_url;
    return [{
      title: clean(d.title), link: /^\d{6}$/.test(yymmdd) ? `https://apod.nasa.gov/apod/ap${yymmdd}.html` : "https://apod.nasa.gov/apod/",
      source: "NASA Picture of the Day", desc: clean(d.explanation), thumbnail: isHttp(pic) ? pic : "",
      timestamp: Date.parse(`${d.date}T12:00:00Z`) || 0,
    }];
  },
};

// Webz.io: a wide crawl of news sites. Asked for English posts from news sites with a decent performance score, newest
// first, so the world wire is not made of the long tail. The free plan is metered per call, so the cap is monthly.
const webz = {
  id: "webz",
  env: "WEBZ_API_KEY",
  ttlMs: 3 * 3600 * 1000,
  cap: { period: "month", max: 600 }, // the free plan allows 1,000 calls a month
  async run({ key, get }) {
    const q = "language:english site_type:news performance_score:>5 thread.country:US";
    const d = await get(`https://api.webz.io/api/news?${new URLSearchParams({ token: key, q, sort: "published", format: "json", size: "30" })}`);
    const items = [];
    const seen = new Set();
    for (const p of (d && d.posts) || []) {
      const th = p.thread || {};
      const title = clean(p.title || th.title);
      if (!title || !isHttp(p.url) || seen.has(p.url) || p.language !== "english") continue;
      seen.add(p.url);
      items.push({
        title, link: p.url, source: clean(th.site_full || th.site), desc: clean(p.text).slice(0, 320),
        thumbnail: isHttp(th.main_image) ? th.main_image : "", timestamp: Date.parse(p.published || p.crawled) || 0,
        breaking: p.breaking === true,
      });
    }
    return items;
  },
};

// NewsAPI.org: mainstream US headlines. The free plan delays articles by about a day, so this is a background layer
// of well-known outlets, not a source of breaking news (its stories are too old to raise an alert).
const newsapi = {
  id: "newsapi",
  env: "NEWSAPI_KEY",
  ttlMs: 6 * 3600 * 1000,
  cap: { period: "day", max: 30 }, // the free plan allows 100 requests a day
  async run({ key, get }) {
    const d = await get(`https://newsapi.org/v2/top-headlines?${new URLSearchParams({ country: "us", pageSize: "40", apiKey: key })}`);
    const items = [];
    for (const a of (d && d.articles) || []) {
      const source = clean(a.source && a.source.name);
      let title = clean(a.title);
      if (source && title.endsWith(` - ${source}`)) title = title.slice(0, -(source.length + 3)).trim();
      if (!title || title === "[Removed]" || !isHttp(a.url)) continue;
      items.push({ title, link: a.url, source, desc: clean(a.description), thumbnail: isHttp(a.urlToImage) ? a.urlToImage : "", timestamp: Date.parse(a.publishedAt) || 0 });
    }
    return items;
  },
};

const REGISTRY = { thenewsapi, tmdb, nasa, webz, newsapi };

// ---- shared cache, caps and the fetch wrapper ------------------------------------------------------------------

const periodKey = (period, t) => (period === "month" ? new Date(t).toISOString().slice(0, 7) : new Date(t).toISOString().slice(0, 10));

function load(file) {
  try { return JSON.parse(fs.readFileSync(file, "utf8")); } catch { return { entries: {}, usage: {} }; }
}
function save(file, data) {
  try { fs.writeFileSync(file, JSON.stringify(data)); } catch { /* a cache that cannot be written only costs a request */ }
}

// { items, cached, stale } or null. Never throws; never returns the key.
async function fetchProvider({ id, env = process.env, file, http = fetchSafe, now = Date.now, registry = REGISTRY }) {
  const p = registry[id];
  if (!p) return null;
  const t = now();
  const data = load(file);
  data.entries = data.entries || {};
  data.usage = data.usage || {};
  const hit = data.entries[id];
  const stale = hit ? { items: hit.items, cached: true, stale: true } : null;
  if (hit && t - hit.at < p.ttlMs) return { items: hit.items, cached: true };
  const key = env[p.env] || "";
  if (!key) return stale;

  const pk = periodKey(p.cap.period, t);
  const use = data.usage[id] && data.usage[id].period === pk ? data.usage[id] : { period: pk, used: 0 };
  data.usage[id] = use;
  if (use.used >= p.cap.max) return stale;

  // Every request goes through here: it is counted before it is sent, and stops at the cap.
  const get = async (url, headers = {}) => {
    if (use.used >= p.cap.max) throw new Error("cap reached");
    use.used += 1;
    const res = await http(url, { headers: { Accept: "application/json", ...headers } }, { retries: false, timeoutMs: 15000 });
    if (!res.ok) throw new Error(`HTTP ${res.status}`);
    return res.json();
  };
  try {
    const items = (await p.run({ key, get, now })).slice(0, 60);
    if (!items.length) { save(file, data); return stale; }
    data.entries[id] = { at: t, items };
    save(file, data);
    return { items, cached: false };
  } catch {
    save(file, data); // the requests that were made still count
    return stale;
  }
}

module.exports = { fetchProvider, REGISTRY, CATEGORIES };
