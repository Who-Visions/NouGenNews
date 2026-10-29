const { test } = require("node:test");
const assert = require("node:assert/strict");
const fs = require("node:fs");
const os = require("node:os");
const path = require("node:path");
const { fetchProvider, REGISTRY, CATEGORIES } = require("../providers");

const tmp = () => path.join(fs.mkdtempSync(path.join(os.tmpdir(), "nn-prov-")), "cache.json");
const NOW = Date.UTC(2026, 9, 29, 18, 0);
const reply = (body) => ({ ok: true, status: 200, json: async () => body });

// One fake network for all three providers, routed by URL, counting calls.
function net(counter = { n: 0, urls: [] }) {
  const http = async (url) => {
    counter.n += 1;
    counter.urls.push(url);
    if (url.startsWith("https://api.thenewsapi.com/")) {
      const c = new URL(url).searchParams.get("categories");
      return reply({ data: [
        { title: `${c} one`, url: `https://pub.test/${c}/1`, source: "pub.test", description: "d", image_url: "https://img.test/1.jpg", published_at: "2026-10-29T16:00:00.000000Z" },
        { title: `${c} bad`, url: "javascript:alert(1)" },
      ] });
    }
    if (url.startsWith("https://api.themoviedb.org/")) {
      return reply({ results: [
        { id: 1, media_type: "movie", title: "Dune: Part Three", overview: "o", backdrop_path: "/b.jpg" },
        { id: 2, media_type: "tv", name: "Frieren", poster_path: "/p.jpg" },
        { id: 3, media_type: "person", name: "Someone" },
      ] });
    }
    if (url.startsWith("https://api.nasa.gov/")) {
      return reply({ title: "A Nebula", date: "2026-10-29", media_type: "image", url: "https://apod.nasa.gov/x.jpg", explanation: "e" });
    }
    return { ok: false, status: 404, json: async () => ({}) };
  };
  return http;
}

test("TheNewsAPI: one request per category, web links only, key never returned", async () => {
  const c = { n: 0, urls: [] };
  const r = await fetchProvider({ id: "thenewsapi", env: { THENEWSAPI_TOKEN: "SECRET" }, file: tmp(), http: net(c), now: () => NOW });
  assert.equal(c.n, CATEGORIES.length);
  assert.equal(r.items.length, CATEGORIES.length);
  assert.equal(r.items[0].source, "pub.test");
  assert.equal(r.items[0].thumbnail, "https://img.test/1.jpg");
  assert.equal(JSON.stringify(r).includes("SECRET"), false);
  assert.ok(c.urls.every((u) => u.includes("api_token=SECRET")), "the key is sent to the provider only");
});

test("TMDB: movies and TV only, a token header, ranking kept through timestamps", async () => {
  const r = await fetchProvider({ id: "tmdb", env: { TMDB_READ_ACCESS_TOKEN: "T" }, file: tmp(), http: net(), now: () => NOW });
  assert.deepEqual(r.items.map((i) => i.title), ["Dune: Part Three", "Frieren (TV)"]);
  assert.equal(r.items[0].link, "https://www.themoviedb.org/movie/1");
  assert.match(r.items[0].thumbnail, /^https:\/\/image\.tmdb\.org\/t\/p\/w780\/b\.jpg$/);
  assert.ok(r.items[0].timestamp > r.items[1].timestamp);
});

test("NASA: the picture of the day with its archive page", async () => {
  const r = await fetchProvider({ id: "nasa", env: { DATA_GOV_API_KEY: "K" }, file: tmp(), http: net(), now: () => NOW });
  assert.equal(r.items[0].title, "A Nebula");
  assert.equal(r.items[0].link, "https://apod.nasa.gov/apod/ap261029.html");
});

test("results are served from disk until the TTL passes, then fetched again", async () => {
  const file = tmp();
  const c = { n: 0, urls: [] };
  const env = { TMDB_READ_ACCESS_TOKEN: "T" };
  await fetchProvider({ id: "tmdb", env, file, http: net(c), now: () => NOW });
  const again = await fetchProvider({ id: "tmdb", env, file, http: net(c), now: () => NOW + 60000 });
  assert.equal(again.cached, true);
  assert.equal(c.n, 1);
  const later = await fetchProvider({ id: "tmdb", env, file, http: net(c), now: () => NOW + REGISTRY.tmdb.ttlMs + 1 });
  assert.equal(later.cached, false);
  assert.equal(c.n, 2);
});

test("no key means no request, and the stale copy (or null) is served", async () => {
  const c = { n: 0, urls: [] };
  assert.equal(await fetchProvider({ id: "nasa", env: {}, file: tmp(), http: net(c), now: () => NOW }), null);
  assert.equal(c.n, 0);
  const file = tmp();
  await fetchProvider({ id: "nasa", env: { DATA_GOV_API_KEY: "K" }, file, http: net(), now: () => NOW });
  const stale = await fetchProvider({ id: "nasa", env: {}, file, http: net(c), now: () => NOW + REGISTRY.nasa.ttlMs + 1 });
  assert.equal(stale.stale, true);
  assert.equal(c.n, 0);
});

test("the daily cap stops the requests, and a new day resets it", async () => {
  const file = tmp();
  const c = { n: 0, urls: [] };
  const small = { ...REGISTRY, nasa: { ...REGISTRY.nasa, ttlMs: 1, cap: { period: "day", max: 2 } } };
  const env = { DATA_GOV_API_KEY: "K" };
  await fetchProvider({ id: "nasa", env, file, http: net(c), now: () => NOW, registry: small });
  await fetchProvider({ id: "nasa", env, file, http: net(c), now: () => NOW + 10, registry: small });
  const capped = await fetchProvider({ id: "nasa", env, file, http: net(c), now: () => NOW + 20, registry: small });
  assert.equal(c.n, 2, "third refresh made no request");
  assert.equal(capped.stale, true);
  await fetchProvider({ id: "nasa", env, file, http: net(c), now: () => NOW + 24 * 3600 * 1000, registry: small });
  assert.equal(c.n, 3, "the next day starts again");
});

test("failures and unknown providers fall back without throwing", async () => {
  assert.equal(await fetchProvider({ id: "nope", env: {}, file: tmp() }), null);
  assert.equal(await fetchProvider({ id: "tmdb", env: { TMDB_READ_ACCESS_TOKEN: "T" }, file: tmp(), http: async () => { throw new Error("offline"); }, now: () => NOW }), null);
  assert.equal(await fetchProvider({ id: "tmdb", env: { TMDB_READ_ACCESS_TOKEN: "T" }, file: tmp(), http: async () => ({ ok: false, status: 401, json: async () => ({}) }), now: () => NOW }), null);
});

test("Webz: English news-site posts only, web links, thumbnails from the thread, newest-first timestamps", async () => {
  const http = async (url) => {
    assert.match(url, /^https:\/\/api\.webz\.io\/api\/news\?/);
    assert.match(decodeURIComponent(url), /site_type:news/);
    return reply({ posts: [
      { title: "A headline", url: "https://pub.test/a", language: "english", text: "Body ".repeat(200), published: "2026-10-29T15:00:00.000+00:00", thread: { site_full: "pub.test", main_image: "https://img.test/a.jpg" } },
      { title: "Spanish one", url: "https://pub.test/b", language: "spanish", thread: {} },
      { title: "Not a web link", url: "javascript:alert(1)", language: "english", thread: {} },
      { title: "A headline", url: "https://pub.test/a", language: "english", thread: {} },
    ] });
  };
  const r = await fetchProvider({ id: "webz", env: { WEBZ_API_KEY: "W" }, file: tmp(), http, now: () => NOW });
  assert.equal(r.items.length, 1);
  assert.equal(r.items[0].source, "pub.test");
  assert.equal(r.items[0].thumbnail, "https://img.test/a.jpg");
  assert.equal(r.items[0].desc.length, 320);
  assert.equal(r.items[0].timestamp, Date.UTC(2026, 9, 29, 15, 0));
});

test("Webz is capped monthly, not daily", () => {
  assert.equal(REGISTRY.webz.cap.period, "month");
  assert.ok(REGISTRY.webz.cap.max < 1000, "stops short of the plan's 1,000 calls");
});

test("NewsAPI: mainstream headlines, the publisher suffix and removed articles dropped, a daily cap", async () => {
  const http = async (url) => {
    assert.match(url, /^https:\/\/newsapi\.org\/v2\/top-headlines\?/);
    return reply({ status: "ok", articles: [
      { title: "Fed holds rates steady - CBS News", url: "https://cbs.test/a", source: { name: "CBS News" }, description: "d", urlToImage: "https://img.test/a.jpg", publishedAt: "2026-10-28T15:00:00Z" },
      { title: "[Removed]", url: "https://removed.test/x", source: { name: "x" } },
      { title: "No web link", url: "ftp://x.test/y", source: { name: "x" } },
    ] });
  };
  const r = await fetchProvider({ id: "newsapi", env: { NEWSAPI_KEY: "N" }, file: tmp(), http, now: () => NOW });
  assert.equal(r.items.length, 1);
  assert.equal(r.items[0].title, "Fed holds rates steady");
  assert.equal(r.items[0].source, "CBS News");
  assert.equal(REGISTRY.newsapi.cap.period, "day");
  assert.ok(REGISTRY.newsapi.cap.max < 100);
});
