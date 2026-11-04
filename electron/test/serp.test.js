const { test } = require("node:test");
const assert = require("node:assert/strict");
const fs = require("node:fs");
const os = require("node:os");
const path = require("node:path");
const { searchLocalNews, normalize, parseSerpDate, MONTHLY_CAP, TTL_MS } = require("../serp");

const tmpFile = () => path.join(fs.mkdtempSync(path.join(os.tmpdir(), "nn-serp-")), "cache.json");
const NOW = Date.UTC(2026, 9, 29, 18, 0);
const payload = {
  news_results: [
    { title: " Story one ", link: "https://pub.test/a", source: { name: "Pub" }, thumbnail: "https://img.test/a.jpg", date: "10/29/2026, 04:03 PM, +0000 UTC" },
    { stories: [{ title: "Clustered", link: "https://pub.test/b", source: { name: "Other" }, date: "10/29/2026, 12:05 AM, +0000 UTC" }] },
    { title: "Duplicate link", link: "https://pub.test/a" },
    { title: "Bad link", link: "javascript:alert(1)" },
    { title: "No link" },
  ],
};
const ok = (body) => async () => ({ ok: true, json: async () => body });

test("parseSerpDate reads SerpApi's UTC date strings", () => {
  assert.equal(parseSerpDate("10/29/2026, 04:03 PM, +0000 UTC"), Date.UTC(2026, 9, 29, 16, 3));
  assert.equal(parseSerpDate("10/29/2026, 12:05 AM, +0000 UTC"), Date.UTC(2026, 9, 29, 0, 5));
  assert.equal(parseSerpDate("10/29/2026, 12:30 PM, +0000 UTC"), Date.UTC(2026, 9, 29, 12, 30));
  assert.equal(parseSerpDate("garbage"), 0);
});

test("normalize keeps web links only, flattens clusters and drops duplicates", () => {
  const items = normalize(payload);
  assert.deepEqual(items.map((i) => i.link), ["https://pub.test/a", "https://pub.test/b"]);
  assert.equal(items[0].title, "Story one");
  assert.equal(items[0].source, "Pub");
  assert.equal(items[0].thumbnail, "https://img.test/a.jpg");
  assert.equal(items[1].thumbnail, "");
});

test("a search is made once, then served from the cache until it expires", async () => {
  const file = tmpFile();
  let calls = 0;
  const http = async (...a) => { calls += 1; return ok(payload)(...a); };
  const first = await searchLocalNews({ query: "New York", apiKey: "k", file, http, now: () => NOW });
  assert.equal(first.cached, false);
  assert.equal(first.items.length, 2);
  const second = await searchLocalNews({ query: "new york", apiKey: "k", file, http, now: () => NOW + 60_000 });
  assert.equal(second.cached, true);
  assert.equal(calls, 1);
  const later = await searchLocalNews({ query: "New York", apiKey: "k", file, http, now: () => NOW + TTL_MS + 1 });
  assert.equal(later.cached, false);
  assert.equal(calls, 2);
});

test("the key is sent to SerpApi only, and never returned", async () => {
  let seen = "";
  const http = async (url) => { seen = url; return { ok: true, json: async () => payload }; };
  const r = await searchLocalNews({ query: "Austin, Texas", apiKey: "SECRETKEY", file: tmpFile(), http, now: () => NOW });
  assert.match(seen, /^https:\/\/serpapi\.com\/search\.json\?/);
  assert.match(seen, /api_key=SECRETKEY/);
  assert.equal(JSON.stringify(r).includes("SECRETKEY"), false);
});

test("without a key, or past the monthly cap, it returns null (or the stale copy) and makes no request", async () => {
  const file = tmpFile();
  let calls = 0;
  const http = async () => { calls += 1; return ok(payload)(); };
  assert.equal(await searchLocalNews({ query: "x", apiKey: "", file, http, now: () => NOW }), null);
  fs.writeFileSync(file, JSON.stringify({ month: "2026-10", used: MONTHLY_CAP, entries: {} }));
  assert.equal(await searchLocalNews({ query: "x", apiKey: "k", file, http, now: () => NOW }), null);
  assert.equal(calls, 0);
  fs.writeFileSync(file, JSON.stringify({ month: "2026-10", used: MONTHLY_CAP, entries: { x: { at: NOW - TTL_MS - 5, items: [{ title: "old", link: "https://pub.test/o" }] } } }));
  const stale = await searchLocalNews({ query: "x", apiKey: "k", file, http, now: () => NOW });
  assert.equal(stale.stale, true);
  assert.equal(calls, 0);
});

test("a new month resets the count", async () => {
  const file = tmpFile();
  fs.writeFileSync(file, JSON.stringify({ month: "2026-09", used: MONTHLY_CAP, entries: {} }));
  const r = await searchLocalNews({ query: "x", apiKey: "k", file, http: ok(payload), now: () => NOW });
  assert.equal(r.cached, false);
  assert.equal(r.used, 1);
});

test("an HTTP error or a thrown error falls back to null", async () => {
  assert.equal(await searchLocalNews({ query: "x", apiKey: "k", file: tmpFile(), http: async () => ({ ok: false, status: 401 }), now: () => NOW }), null);
  assert.equal(await searchLocalNews({ query: "x", apiKey: "k", file: tmpFile(), http: async () => { throw new Error("offline"); }, now: () => NOW }), null);
});
