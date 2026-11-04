const test = require("node:test");
const assert = require("node:assert/strict");
const fs = require("node:fs");
const os = require("node:os");
const path = require("node:path");
const { tubeArticle, linksIn, sourceFromPage, toHtml } = require("../tubenews");

const PAGE = `<html><head><meta property="og:title" content="Google unveils Carbon"><meta property="og:type" content="article"><meta property="og:image" content="https://img.example/carbon.jpg"><meta property="og:site_name" content="Example News"></head><body><p>${"Carbon is a new model. ".repeat(20)}</p></body></html>`;
const PROMO = `<html><head><title>Join my community</title></head><body><p>Sign up</p></body></html>`;

test("links come out of a description in order, without duplicates or trailing punctuation", () => {
  assert.deepEqual(linksIn("see https://a.example/x, and https://b.example/y. again https://a.example/x"), ["https://a.example/x", "https://b.example/y"]);
});

test("promotion lines (sponsor, community, newsletter) are not sources", () => {
  assert.deepEqual(linksIn("Checkout todays sponsor https://s.example/a\nLearn AI with me - https://c.example/community\nSources: https://news.example/story"), ["https://news.example/story"]);
});

test("a story page is a source; a sign-up page is not", () => {
  const s = sourceFromPage(PAGE, "https://example.com/carbon");
  assert.equal(s.site, "Example News");
  assert.equal(s.image, "https://img.example/carbon.jpg");
  assert.equal(sourceFromPage(PROMO, "https://example.com/join"), null);
});

test("a video becomes an article with the creator credited, source pictures and a source list, and is cached", async () => {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), "tn-"));
  const http = async (u) => ({ ok: true, url: u, text: async () => (u.includes("promo") ? PROMO : PAGE) });
  let bridged = 0;
  const bridge = async ({ capture }) => { if (!capture) bridged += 1; return { transcript: "[00:00] Google announced Carbon today. ".repeat(30), known: true, meta: { channel: "The AI Grid" }, style: "lead with the news" }; };
  let prompt = "";
  const write = async (p) => { prompt = p; return { model: "m", headline: "Google unveils Carbon", dek: "A new model", paragraphs: ["Google announced Carbon on Thursday.", "The model ranks first on a leaderboard.", "Details were shared in a video.", "More to come."] }; };
  const args = { id: "yNI84SU9x4I", title: "t", desc: "https://example.com/carbon https://example.com/promo", userDir: dir, nougenDir: dir, http, bridge, write };
  const r = await tubeArticle(args);
  assert.match(r.html, /Written by NouGen from a video by The AI Grid/);
  assert.match(r.html, /<figure><img src="https:\/\/img\.example\/carbon\.jpg"/);
  assert.match(r.html, /<h3>Sources<\/h3>/);
  assert.doesNotMatch(r.html, /Join my community/);
  assert.match(prompt, /SOURCES/);
  assert.doesNotMatch(prompt, /\[00:00\]/);
  await tubeArticle(args);
  assert.equal(bridged, 1);
});

test("no transcript or no writer is a clear error, not a crash", async () => {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), "tn-"));
  const base = { id: "yNI84SU9x4I", userDir: dir, nougenDir: dir, http: async () => ({ ok: false }) };
  assert.match((await tubeArticle({ ...base, bridge: async () => ({ transcript: "" }) })).error, /transcript/);
  assert.match((await tubeArticle({ ...base, bridge: async () => ({ transcript: "x ".repeat(50) }), write: async () => null })).error, /writer/);
  assert.match((await tubeArticle({ ...base, id: "bad" })).error, /video id/);
});
