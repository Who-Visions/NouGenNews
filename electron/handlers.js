// Commands the renderer can invoke (see preload.js). Each takes the args object and returns a value.
const { fetchSafe } = require("./safe");
const embed = require("./embed");
const { app } = require("electron");
const path = require("node:path");

const handlers = {
  // The loopback page that carries the YouTube player (electron/embed.js).
  embed_port: () => embed.start(),
  quit: () => { app.quit(); },
  // Any registered API provider (electron/providers.js): cached on disk, capped, keyed from the environment.
  provider_feed: (args = {}) => require("./providers").fetchProvider({
    id: String(args.id || "").slice(0, 30),
    file: path.join(app.getPath("userData"), "provider-cache.json"),
  }).then((r) => (r ? { items: r.items, cached: !!r.cached, stale: !!r.stale } : null)),
  // Near you from SerpApi when a key is present (publisher links, pictures); null means use the free feed.
  // The key stays in this process: only the stories go back to the page.
  local_news: (args = {}) => require("./serp").searchLocalNews({
    query: String(args.query || ""),
    apiKey: process.env.SERPAPI_API_KEY || "",
    file: path.join(app.getPath("userData"), "serp-cache.json"),
  }).then((r) => (r ? { items: r.items, cached: !!r.cached, stale: !!r.stale } : null)),
  // The real article address behind a Google News link, so the side browser opens the publisher's page.
  resolve_story_url: (args = {}) => require("./gnews").resolveStoryUrl(String(args.url || "")),
  // Opens the Windows cast flyout so the whole window can be mirrored to a TV (electron/cast.js).
  cast_screen: () => require("./cast").castScreen(),
  weather: (args = {}) => require("./weather").homeWeather({ city: String(args.city || "").slice(0, 80), region: String(args.region || "").slice(0, 80) }),
  // The reader's own place from Windows' location service, only when they ask (electron/geo.js).
  locate_me: () => require("./geo").locateMe(),
  // Titles the reader owns (NouGenFlix library), for lifting related stories. Read-only.
  library_titles: () => require("./library").libraryTitles(app),
  restart: () => { app.relaunch(); app.exit(0); },
  // The whole story behind a headline, with the videos the page carries (electron/article.js).
  article_fetch: (args = {}) => require("./article").articleFetch(args.url || ""),
  // Feeds are fetched here because a page cannot read another site's feed (CORS). Public https only.
  rss_raw_fetch: async (args = {}) => {
    const raw = String(args.feedUrl || args.feed_url || "").trim();
    let u;
    try { u = new URL(raw); } catch { throw new Error("Feed error: bad URL"); }
    if (u.protocol !== "https:" || /^(localhost|\[|\d+\.\d+\.\d+\.\d+$)|\.(local|lan|internal)$/i.test(u.hostname)) throw new Error("Feed error: public https feeds only");
    const res = await fetchSafe(u.toString(), { headers: { Accept: "application/rss+xml, application/xml, text/xml", "User-Agent": "Mozilla/5.0 NouGenNews" } });
    if (!res.ok) throw new Error(`Feed error: HTTP ${res.status}`);
    return (await res.text()).slice(0, 4 * 1024 * 1024);
  },
};

module.exports = { handlers };
