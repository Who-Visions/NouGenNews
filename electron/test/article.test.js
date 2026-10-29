const { test } = require("node:test");
const assert = require("node:assert/strict");
const { extractArticle, findVideos, articleFetch } = require("../article");

const para = (t, n = 10) => Array.from({ length: n }, (_, i) => `<p>${t} paragraph ${i} with enough words to count as story text here.</p>`).join("");

test("YouTube embeds, watch links, shorts and direct video files are found once each", () => {
  const v = findVideos('<iframe src="https://www.youtube.com/embed/dQw4w9WgXcQ"></iframe> https://youtu.be/dQw4w9WgXcQ <a href="https://www.youtube.com/watch?v=aBcDeFgHiJk">x</a> ' +
    '<video src="https://cdn.test/clip.mp4?x=1"></video> <source src="https://cdn.test/clip.mp4?x=1">');
  assert.deepEqual(v, [{ kind: "youtube", id: "dQw4w9WgXcQ" }, { kind: "youtube", id: "aBcDeFgHiJk" }, { kind: "file", url: "https://cdn.test/clip.mp4?x=1" }]);
  assert.deepEqual(findVideos("nothing here"), []);
});

test("the <article> body is kept; navigation, scripts, share bars and comments are not", () => {
  const html = `<html><head><title>T</title><meta property="og:title" content="The Story"></head><body><nav><p>${"menu ".repeat(80)}</p></nav>
    <article><h2>Head</h2>${para("story")}<div class="share-tools"><p>Share this</p></div><img data-src="/pics/a.jpg" class="lazy"></article>
    <script>evil()</script><footer><p>${"foot ".repeat(80)}</p></footer></body></html>`;
  const out = extractArticle(html, "https://news.test/a/b");
  assert.equal(out.title, "The Story");
  assert.match(out.html, /story paragraph 9/);
  assert.match(out.html, /src="https:\/\/news\.test\/pics\/a\.jpg"/);
  assert.ok(!/menu|evil|Share this|foot /.test(out.html), out.html);
});

test("without <article>, the block with the most paragraph text wins", () => {
  const html = `<div class="sidebar">${para("side", 3)}</div><div class="content">${para("main", 12)}</div><div>${para("other", 2)}</div>`;
  const out = extractArticle(html);
  assert.match(out.html, /main paragraph 11/);
  assert.ok(!/side paragraph/.test(out.html));
});

test("a page with no real text gives an empty body, never junk", () => {
  assert.equal(extractArticle("<html><body><div><p>hi</p></div></body></html>").html, "");
});

test("only public https pages are fetched", async () => {
  for (const bad of ["http://news.test/a", "https://localhost/a", "https://10.0.0.5/a", "https://box.lan/a", "nope"]) {
    await assert.rejects(articleFetch(bad, async () => { throw new Error("must not fetch"); }), /Article error/);
  }
  const out = await articleFetch("https://news.test/a", async () => ({ ok: true, text: async () => `<article>${para("x")}</article>` }));
  assert.match(out.html, /x paragraph 0/);
});
