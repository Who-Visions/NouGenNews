import { test } from "node:test";
import assert from "node:assert/strict";
import { JSDOM } from "jsdom";
import { makeSanitizer } from "./articleHtml.js";

const clean = makeSanitizer(new JSDOM("").window);

test("event handlers, scripts and styles are removed", () => {
  const out = clean('<p onclick="x()">hi</p><script>alert(1)</script><style>p{}</style><img src="https://a.test/i.jpg" onerror="alert(2)">');
  assert.ok(!/onclick|onerror|<script|<style/i.test(out), out);
  assert.match(out, /<p>hi<\/p>/);
  assert.match(out, /src="https:\/\/a\.test\/i\.jpg"/);
});

test("javascript:, data: and file: links and images are dropped", () => {
  const out = clean('<a href="javascript:alert(1)">a</a><a href="data:text/html,x">b</a><img src="file:///etc/passwd"><img src="data:image/svg+xml,<svg/onload=alert(3)>">');
  assert.ok(!/javascript:|data:|file:/i.test(out), out);
  assert.ok(!/<img/i.test(out), out);
});

test("ordinary http(s) links open in a new window without opener", () => {
  const out = clean('<a href="https://news.test/story">read</a>');
  assert.match(out, /href="https:\/\/news\.test\/story"/);
  assert.match(out, /target="_blank"/);
  assert.match(out, /rel="noopener noreferrer"/);
});

test("iframes, forms and svg are removed; text survives", () => {
  const out = clean('<p>Keep <b>this</b></p><iframe src="https://x.test"></iframe><form action="https://y.test"><input></form><svg><circle/></svg>');
  assert.match(out, /Keep <b>this<\/b>/);
  assert.ok(!/iframe|form|svg|input/i.test(out), out);
});

test("videos with https sources play in the reader; others are dropped", () => {
  const out = clean('<video src="https://cdn.test/a.mp4" autoplay poster="javascript:x"></video><video src="file:///x.mp4"></video>');
  assert.match(out, /<video[^>]*src="https:\/\/cdn\.test\/a\.mp4"/);
  assert.match(out, /controls/);
  assert.ok(!/autoplay|poster|file:/i.test(out), out);
  assert.equal((out.match(/<video/g) || []).length, 1);
});

test("empty input is safe", () => {
  assert.equal(clean(null), "");
  assert.equal(clean(undefined), "");
});

import { splitTail } from "./articleHtml.js";
const doc = new JSDOM("").window.document;

test("splitTail cuts the body at the first tail heading and lifts its links", () => {
  const html = '<p>Story one.</p><p>Story two.</p><h2>Next Article</h2><ul><li><a href="https://s.test/a">Bleach ending</a></li></ul><p>→</p><h2>More Anime</h2><figure><a href="https://s.test/b"><img src="https://s.test/b.jpg" alt="Frieren"></a></figure>';
  const { body, items } = splitTail(html, doc);
  assert.match(body, /Story two/);
  assert.ok(!/Next Article|More Anime|Bleach/.test(body), body);
  assert.deepEqual(items.map((i) => i.href), ["https://s.test/a", "https://s.test/b"]);
  assert.equal(items[1].title, "Frieren");
  assert.equal(items[1].img, "https://s.test/b.jpg");
});

test("splitTail leaves a story alone when nothing in it is a tail heading", () => {
  const html = "<p>One.</p><h2>The ending</h2><p>Two.</p>";
  assert.deepEqual(splitTail(html, doc), { body: html, items: [] });
});

test("splitTail ignores a tail-looking heading at the very top and non-web links", () => {
  assert.equal(splitTail("<h2>Related</h2><p>x</p>", doc).items.length, 0);
  const { items } = splitTail('<p>a</p><h2>More</h2><a href="javascript:alert(1)">bad</a>', doc);
  assert.equal(items.length, 0);
});

import { hiResUrl } from "./articleHtml.js";
test("hiResUrl drops WordPress size suffixes and asks the CDN for twice the width", () => {
  const out = new URL(hiResUrl("https://i0.wp.com/site.test/wp-content/uploads/2026/10/photo-150x150.jpg?resize=150%2C150&w=760&strip=all&quality=75", 340));
  assert.equal(out.pathname, "/site.test/wp-content/uploads/2026/10/photo.jpg");
  assert.equal(out.searchParams.get("w"), "680");
  assert.equal(out.searchParams.get("quality"), "85");
  assert.equal(out.searchParams.has("resize"), false);
});
test("hiResUrl leaves other hosts and bad input alone", () => {
  assert.equal(hiResUrl("https://cdn.test/a-150x150.jpg"), "https://cdn.test/a-150x150.jpg");
  assert.equal(hiResUrl(""), "");
  assert.equal(hiResUrl("javascript:alert(1)"), "javascript:alert(1)");
});

import { imageKey, dropDuplicateImages } from "./articleHtml.js";
test("imageKey treats resized and re-encoded copies as one picture", () => {
  const a = imageKey("https://i0.wp.com/site.test/wp-content/uploads/2026/10/Photo-150x150.jpg?w=300&strip=all");
  const b = imageKey("https://site.test/wp-content/uploads/2026/10/Photo.webp");
  assert.equal(a, b);
  assert.notEqual(a, imageKey("https://site.test/wp-content/uploads/2026/10/Other.jpg"));
});
test("dropDuplicateImages removes the lead picture and later repeats, keeps the first copy, drops empty wrappers", () => {
  const html = '<p>One</p><figure><a href="https://x.test"><img src="https://s.test/a.jpg"></a></figure><p>Two</p><img src="https://s.test/b.jpg"><p>Three</p><p><img src="https://s.test/b-300x200.jpg"></p>';
  const out = dropDuplicateImages(html, "https://s.test/a-640x360.jpg", doc);
  assert.ok(!out.includes("a.jpg"), "lead picture removed from the body: " + out);
  assert.ok(!out.includes("<figure"), "its empty figure and link go with it");
  assert.equal((out.match(/<img/g) || []).length, 1, "the first copy of b stays, its repeat goes");
  assert.match(out, /<p>One<\/p>/);
  assert.match(out, /<p>Three<\/p>/);
});
test("dropDuplicateImages leaves text and unique pictures untouched", () => {
  const html = '<p>No pictures</p>';
  assert.equal(dropDuplicateImages(html, "https://s.test/a.jpg", doc), html);
  const two = '<img src="https://s.test/1.jpg"><img src="https://s.test/2.jpg">';
  assert.equal(dropDuplicateImages(two, "", doc), two);
});

import { dropTrailingImages } from "./articleHtml.js";
test("dropTrailingImages removes a captionless related-story picture at the end of the body", () => {
  const text = "<p>Patrick Stewart, an actor known for his roles, has died at the age of 86, his family announced.</p><p>He died after a brief and poignant journey, according to a statement.</p>";
  const out = dropTrailingImages(text + '<a href="https://x.test/related"><img src="https://s.test/mugshot.jpg"></a>', doc);
  assert.equal(out, text);
  const two = dropTrailingImages(text + '<p><img src="https://s.test/a.jpg"></p><figure><img src="https://s.test/b.jpg"></figure>', doc);
  assert.equal(two, text);
});
test("dropTrailingImages keeps captioned pictures, pictures inside the text, and image-only pages", () => {
  const text = "<p>A long enough paragraph of real story text that comes before the picture, easily past eighty characters in all.</p>";
  const captioned = text + '<figure><img src="https://s.test/a.jpg"><figcaption>Sir Example in 2019 at the awards ceremony</figcaption></figure>';
  assert.equal(dropTrailingImages(captioned, doc), captioned);
  const inside = '<p>' + "x".repeat(100) + '</p><img src="https://s.test/a.jpg"><p>More text after the picture.</p>';
  assert.equal(dropTrailingImages(inside, doc), inside);
  const only = '<img src="https://s.test/a.jpg">';
  assert.equal(dropTrailingImages(only, doc), only);
});

test("collectPhotos lists the lead first, then body pictures once each, skipping icons", async () => {
  const { collectPhotos } = await import("./articleHtml.js");
  const doc = new JSDOM("").window.document;
  const html = '<p>a</p><img src="https://x.test/a-300x200.jpg" alt="A"><figure><img src="https://x.test/b.jpg"><figcaption>Cap B</figcaption></figure><img src="https://x.test/a.jpg"><img src="https://x.test/icon.png" width="16" height="16"><img src="data:image/png;base64,AAAA">';
  const p = collectPhotos(html, "https://x.test/lead.jpg", doc);
  assert.deepEqual(p.map((x) => x.src), ["https://x.test/lead.jpg", "https://x.test/a-300x200.jpg", "https://x.test/b.jpg"]);
  assert.equal(p[2].alt, "Cap B");
});

test("stripImages removes pictures and the wrappers that held only them", async () => {
  const { stripImages } = await import("./articleHtml.js");
  const doc = new JSDOM("").window.document;
  const out = stripImages('<p>keep</p><figure><img src="https://x.test/a.jpg"></figure><p><a href="https://x.test"><img src="https://x.test/b.jpg"></a></p><p>also keep</p>', doc);
  assert.equal(out, "<p>keep</p><p>also keep</p>");
});

test("dropAdLabels removes blocks that hold only leftover ad labels", async () => {
  const { dropAdLabels } = await import("./articleHtml.js");
  const doc = new JSDOM("").window.document;
  const out = dropAdLabels("<p>Story text.</p><p>AdvertisementAdvertisementAdvertisement</p><div><span>Advertisement</span><span>Advertisement</span></div><p>The advertisement industry grew.</p>", doc);
  assert.equal(out, "<p>Story text.</p><p>The advertisement industry grew.</p>");
});

test("dropAdLabels also removes short page-control blocks (comment count, copied, share prompt)", async () => {
  const { dropAdLabels } = await import("./articleHtml.js");
  const doc = new JSDOM("").window.document;
  const out = dropAdLabels("<p>By Sam Published October 29, 2026 | Comments (29) | Copied!</p><p>Share this story</p><p>He said the comments (29 of them) were fair and the report ran long enough to count as a real paragraph of story text here.</p>", doc);
  assert.equal(out, "<p>He said the comments (29 of them) were fair and the report ran long enough to count as a real paragraph of story text here.</p>");
});
