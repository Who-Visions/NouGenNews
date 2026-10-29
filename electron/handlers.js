// Commands the renderer can invoke (see preload.js). Each takes the args object and returns a value.
const { fetchSafe } = require("./safe");
const embed = require("./embed");
const { app } = require("electron");

const handlers = {
  // The loopback page that carries the YouTube player (electron/embed.js).
  embed_port: () => embed.start(),
  quit: () => { app.quit(); },
  // Opens the Windows cast flyout so the whole window can be mirrored to a TV (electron/cast.js).
  cast_screen: () => require("./cast").castScreen(),
  weather: (args = {}) => require("./weather").homeWeather({ city: String(args.city || "").slice(0, 80) }),
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
