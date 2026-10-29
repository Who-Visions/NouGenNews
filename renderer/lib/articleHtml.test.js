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
