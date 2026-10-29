const { test } = require("node:test");
const assert = require("node:assert/strict");
const { resolveStoryUrl, articleId, parseSignature, parseResolved, batchBody } = require("../gnews");

const LINK = "https://news.google.com/rss/articles/CBMiabc123_-XYZ?oc=5";
const res = (text, ok = true) => ({ ok, text: async () => text });

test("articleId only accepts Google News article links", () => {
  assert.equal(articleId(LINK), "CBMiabc123_-XYZ");
  assert.equal(articleId("https://news.google.com/articles/CBMiabc"), "CBMiabc");
  assert.equal(articleId("https://evil.test/rss/articles/CBMiabc"), null);
  assert.equal(articleId("javascript:alert(1)"), null);
});

test("parseSignature reads the signature and timestamp from the article page", () => {
  assert.deepEqual(parseSignature('<c-wiz data-n-a-sg="SIG" data-n-a-ts="1700000000"></c-wiz>'), { sg: "SIG", ts: "1700000000" });
  assert.equal(parseSignature("<html></html>"), null);
});

test("parseResolved finds the publisher address in the batch answer and refuses Google's own", () => {
  const ok = String.raw`)]}'\n[["wrb.fr","Fbv4je","[\"garturlres\",\"https://abc7ny.com/post/story/123/\",1]"]]`;
  assert.equal(parseResolved(ok), "https://abc7ny.com/post/story/123/");
  assert.equal(parseResolved(String.raw`[\"garturlres\",\"https://news.google.com/x\"]`), null);
  assert.equal(parseResolved("nothing"), null);
});

test("batchBody carries the id, timestamp and signature", () => {
  const b = decodeURIComponent(batchBody("ID1", { sg: "SG1", ts: "99" }));
  assert.match(b, /^f\.req=/);
  assert.match(b, /ID1/);
  assert.match(b, /SG1/);
});

test("resolveStoryUrl makes the two requests, returns the real address, and remembers it", async () => {
  const calls = [];
  const http = async (url, opts = {}) => {
    calls.push(opts.method || "GET");
    if (calls.length % 2 === 1) return res('<c-wiz data-n-a-sg="SG" data-n-a-ts="5"></c-wiz>');
    return res(String.raw`[\"garturlres\",\"https://pub.test/a/1\",1]`);
  };
  assert.equal(await resolveStoryUrl(LINK, http), "https://pub.test/a/1");
  assert.deepEqual(calls, ["GET", "POST"]);
  assert.equal(await resolveStoryUrl(LINK, http), "https://pub.test/a/1");
  assert.equal(calls.length, 2, "second call is served from the cache");
});

test("any failure falls back to the original link", async () => {
  assert.equal(await resolveStoryUrl("https://news.google.com/rss/articles/CBMfail", async () => { throw new Error("offline"); }), "https://news.google.com/rss/articles/CBMfail");
  assert.equal(await resolveStoryUrl("https://example.com/x", async () => { throw new Error("never called"); }), "https://example.com/x");
});
