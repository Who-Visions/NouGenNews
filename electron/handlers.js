// Commands the renderer can invoke (see preload.js). Each takes the args object and returns a value.
const { fetchSafe } = require("./safe");
const embed = require("./embed");
const { app } = require("electron");
const path = require("node:path");

// The assistant's Ollama Cloud keys, read from the keymaker on first use and kept in this process only.
let assistantKeys = null;

const handlers = {
  // The loopback page that carries the YouTube player (electron/embed.js).
  embed_port: () => embed.start(),
  quit: () => { app.quit(); },
  // A desktop notification for a red alert. Skipped when the window is already in front (the banner is visible).
  notify: (args = {}) => {
    const { Notification, BrowserWindow } = require("electron");
    const w = BrowserWindow.getAllWindows()[0];
    if (!Notification.isSupported() || (w && w.isFocused())) return false;
    new Notification({ title: String(args.title || "").slice(0, 80), body: String(args.body || "").slice(0, 200), urgency: "critical" }).show();
    return true;
  },
  // Any registered API provider (electron/providers.js): cached on disk, capped, keyed from the environment.
  // YouTube channels (core/feeds.js "@youtube"): the latest videos of every channel in the list; no key needed.
  youtube_feed: () => require("./youtube").fetchYoutube({ userDir: app.getPath("userData") }).then((r) => ({ items: r.items, channels: r.channels })),
  // Read-aloud with a Kokoro neural voice (scripts/kokoro_sidecar.py); the WAV comes back as base64.
  tts_kokoro_synth: (args = {}) => require("./kokoro").kokoroSynthFast({ text: String(args.text || "").slice(0, 60000), voice: String(args.voice || "") }),
  // A video written up as a news article by NouGen (transcript via nougentube, local Ollama writer, the video's source links).
  tube_article: (args = {}) => require("./tubenews").tubeArticle({
    id: String(args.id || ""), title: String(args.title || "").slice(0, 300), desc: String(args.desc || "").slice(0, 6000), channel: String(args.channel || "").slice(0, 100),
    userDir: app.getPath("userData"), nougenDir: process.env.NOUGEN_DIR || path.resolve(__dirname, "..", "..", "NouGen"),
  }),
  youtube_add: (args = {}) => ({ channels: require("./youtube").addChannel(app.getPath("userData"), String(args.ref || "").slice(0, 200)) }),
  provider_feed: (args = {}) => require("./providers").fetchProvider({
    id: String(args.id || "").slice(0, 30),
    force: args.force === true,
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
  // The whole report for the weather panel: now, today, the next hours, seven days, air quality (Open-Meteo, CC BY 4.0).
  weather_report: (args = {}) => require("./weather").weatherReport({ city: String(args.city || "").slice(0, 80), region: String(args.region || "").slice(0, 80) }),
  // Official severe-weather alerts for the corner place (WeatherAPI.com, key from the keymaker in this process only); [] without one.
  weather_alerts: (args = {}) => require("./weather").weatherAlerts({ city: String(args.city || "").slice(0, 80), region: String(args.region || "").slice(0, 80) }),
  // The credit link in the weather panel: opens Open-Meteo's own site, a fixed address, nothing the page supplies.
  // Radar frames (RainViewer): the page draws the tiles; this lists which exist. Cached five minutes.
  weather_radar: () => require("./weather").radarFrames(),
  // What the 3D globe needs: a Cesium ion token (assets:read, geocode) from the keymaker via the launcher. Cesium ion tokens
  // are made for client-side use; this one reaches the page only when the Weather tab opens, and is never written to disk here.
  weather_globe_config: () => ({ token: process.env.CESIUM_ION_TOKEN_20261030 || process.env.CESIUM_ION_TOKEN || "" }),
  weather_open_credit: (args = {}) => {
    const url = { "open-meteo": "https://open-meteo.com/", weatherapi: "https://www.weatherapi.com/", rainviewer: "https://www.rainviewer.com/", cesium: "https://cesium.com/" }[String(args.which || "open-meteo")];
    if (!url) return false;
    require("electron").shell.openExternal(url);
    return true;
  },
  weather: (args = {}) => require("./weather").homeWeather({ city: String(args.city || "").slice(0, 80), region: String(args.region || "").slice(0, 80) }),
  // The reader's own place from Windows' location service, only when they ask (electron/geo.js).
  locate_me: () => require("./geo").locateMe(),
  // Titles the reader owns (NouGenFlix library), for lifting related stories. Read-only.
  library_titles: () => require("./library").libraryTitles(app),
  restart: () => { app.relaunch(); app.exit(0); },
  // The archive (electron/archive.js): NouGen Shards Light, one local SQLite file. Every story the app sees is kept once.
  archive_ingest: (args = {}) => require("./archive").appArchive(app).ingest(args.stories),
  archive_search: (args = {}) => require("./archive").appArchive(app).search({ query: String(args.query || ""), limit: Math.min(Number(args.limit) || 10, 50), days: Number(args.days) || 0 }),
  archive_stats: () => require("./archive").appArchive(app).stats(),
  archive_opened: (args = {}) => require("./archive").appArchive(app).opened(String(args.link || "").slice(0, 1000)),
  // Whether full NouGen Shards is on this machine (its vault folder, its local node on :4444).
  archive_detect_full: () => require("./archive").appArchive(app).detectFull(),
  // Copies the whole archive into the full NouGen Shards vault on this machine. Only when the reader presses Promote.
  archive_promote: () => {
    const archive = require("./archive");
    const { nougenDir, pickPython } = require("../scripts/resolve-key.cjs");
    return archive.appArchive(app).promote({
      dir: path.join(app.getPath("documents"), "NouGenNews Archive"),
      runImporter: archive.pythonImporter({ nougenDir: nougenDir(), pickPython }),
    });
  },
  archive_upgrade_info: () => require("./archive").appArchive(app).upgradeInfo(),
  // Writes the whole archive as a bundle full NouGen Shards imports, into Documents\NouGenNews Archive.
  archive_export: () => {
    const out = require("./archive").appArchive(app).exportTo(path.join(app.getPath("documents"), "NouGenNews Archive"));
    return { file: out.file, count: out.count };
  },
  // Opens the NouGen Shards page in the reader's browser: only the address upgradeInfo names, nothing the page supplies.
  archive_open_upgrade: () => {
    const { shell } = require("electron");
    const url = require("./archive").appArchive(app).upgradeInfo().url;
    if (!/^https:\/\//i.test(url)) return false;
    shell.openExternal(url);
    return true;
  },
  // The assistant (electron/assistant.js): gemma4:31b on Ollama Cloud with the keymaker's keys, local model as fallback.
  // The renderer sends the wire it is showing; keys are read here once and never go back to the page.
  assistant_ask: async (args = {}) => {
    const assistant = require("./assistant");
    if (!assistantKeys) {
      const found = require("../scripts/resolve-key.cjs").readSecrets(assistant.KEY_NAMES);
      assistantKeys = assistant.KEY_NAMES.map((n) => found[n]).filter(Boolean);
    }
    const wire = (Array.isArray(args.wire) ? args.wire : []).slice(0, 400).map((s) => ({
      id: String(s.id || "").slice(0, 80), title: String(s.title || "").slice(0, 300), source: String(s.source || "").slice(0, 80),
      age: String(s.age || "").slice(0, 30), desc: String(s.desc || "").slice(0, 400), url: String(s.url || "").slice(0, 600),
      coverage: Math.min(Math.max(Number(s.coverage) || 1, 1), 100000), ts: Number(s.ts) || 0,
    }));
    return assistant.ask({
      question: String(args.question || ""),
      wire,
      current: args.current && typeof args.current === "object" ? { title: String(args.current.title || "").slice(0, 300), source: String(args.current.source || "").slice(0, 80), text: String(args.current.text || "").slice(0, 3000) } : null,
      history: Array.isArray(args.history) ? args.history.slice(-8) : [],
      keys: assistantKeys,
      readArticle: (url) => require("./article").articleFetch(url),
      recall: (query) => require("./recall").recallShards(query),
      archive: (query, days) => require("./archive").appArchive(app).search({ query, limit: 6, days }),
      // A cited briefing: curated from this wire and the archive, written by the same model chain, checked sentence by sentence.
      brief: async (topic) => {
        const b = require("./brief");
        const r = await b.brief({
          topic, wire, keys: assistantKeys,
          archive: (query, days) => require("./archive").appArchive(app).search({ query, limit: 10, days }),
          readArticle: (url) => require("./article").articleFetch(url),
        });
        return b.briefText(r);
      },
      // The reader's home place (sent by the page) unless the model names another city.
      weather: (place) => require("./weather").weatherReport(place ? { city: place, region: "" } : { city: String((args.home && args.home.city) || "").slice(0, 80), region: String((args.home && args.home.region) || "").slice(0, 80) }),
    });
  },
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
