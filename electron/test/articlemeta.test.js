const test = require("node:test");
const assert = require("node:assert/strict");
const { extractMeta, keywords, summarize, sentences, linkDensity } = require("../articlemeta");

const LD = `<html lang="en-US"><head>
<script type="application/ld+json">{"@context":"https://schema.org","@graph":[{"@type":"WebSite"},{"@type":"NewsArticle","headline":"H","datePublished":"2026-10-29T14:30:00-04:00","dateModified":"2026-10-29T16:00:00Z","author":[{"@type":"Person","name":"Jane Roe"},{"@type":"Person","name":"Sam Poe"}],"description":"LD description.","publisher":{"name":"The Ledger"}}]}</script>
<link rel="canonical" href="/2026/story">
</head></html>`;

test("JSON-LD wins: authors, dates in UTC, description, site, language, canonical resolved against the page", () => {
  const m = extractMeta(LD, "https://news.test/a?utm=1");
  assert.deepEqual(m.authors, ["Jane Roe", "Sam Poe"]);
  assert.equal(m.publishedAt, "2026-10-29T18:30:00.000Z");
  assert.equal(m.modifiedAt, "2026-10-29T16:00:00.000Z");
  assert.equal(m.description, "LD description.");
  assert.equal(m.siteName, "The Ledger");
  assert.equal(m.lang, "en-us");
  assert.equal(m.canonical, "https://news.test/2026/story");
});

test("without JSON-LD it falls back to meta tags in either attribute order and to byline markup", () => {
  const html = `<meta content="2026-10-28T09:00:00Z" property="article:published_time"><meta name="author" content="By Dana Lee and Rui Cho">
    <meta property="og:description" content="Meta &amp; desc"><meta name="news_keywords" content="storm, coast ,flood"><span class="byline">Written by Pat Kim</span>`;
  const m = extractMeta(html);
  assert.equal(m.publishedAt, "2026-10-28T09:00:00.000Z");
  assert.deepEqual(m.authors, ["Dana Lee", "Rui Cho", "Pat Kim"]);
  assert.equal(m.description, "Meta & desc");
  assert.deepEqual(m.keywordsMeta, ["storm", "coast", "flood"]);
});

test("sentences, urls, boilerplate and impossible dates are rejected rather than reported as facts", () => {
  const m = extractMeta(`<meta name="author" content="Staff"><meta name="author" content="Reporting from https://x.test/a long sentence that is not a person name at all"><meta name="date" content="not a date"><meta name="author" content="Ana Ruiz">`);
  assert.deepEqual(m.authors, ["Ana Ruiz"]);
  assert.equal(m.publishedAt, "");
  assert.deepEqual(extractMeta("").authors, []);
  assert.equal(extractMeta("<script type=\"application/ld+json\">{broken</script>").publishedAt, "");
});

const STORY = "The Port Authority approved a new flood barrier for the harbor on Tuesday. The barrier will protect the harbor district from storm surge. " +
  "Engineers said the flood barrier could be finished within three years. Local shops near the harbor have asked for compensation during construction. " +
  "A spokesperson said the weather this week was mild. The barrier design includes gates that close ahead of a storm surge. " +
  "Critics argued the harbor project is too costly for the city. Funding comes from a state grant and a municipal bond. " +
  "Residents will vote on the bond in March. The flood barrier is the largest harbor project in decades.";

test("keywords rank recurring words, boost the headline's, and drop stop words and numbers", () => {
  const k = keywords(STORY, "Harbor flood barrier approved", 5);
  assert.ok(k.includes("harbor") && k.includes("barrier") && k.includes("flood"), k.join());
  assert.ok(!k.some((w) => ["the", "will", "said"].includes(w)));
  assert.deepEqual(keywords("too short to rank", "t"), []);
  assert.deepEqual(keywords(STORY, "x", 3), keywords(STORY, "x", 3)); // deterministic
});

test("sentences keep abbreviations and decimals whole and drop fragments", () => {
  const s = sentences("Dr. Smith said inflation hit 3.5 percent in the U.S. last month. Yes. The bank will meet again next week to decide.");
  assert.equal(s.length, 2);
  assert.match(s[0], /Dr\. Smith .* 3\.5 percent/);
});

test("summary returns the requested count, in reading order, only sentences the text contains", () => {
  const sum = summarize(STORY, "Harbor flood barrier approved", 3);
  assert.equal(sum.length, 3);
  const all = sentences(STORY);
  let last = -1;
  for (const s of sum) { const i = all.indexOf(s); assert.ok(i > last, "reading order"); last = i; }
  assert.ok(!sum.some((s) => /weather this week was mild/.test(s)), "the off-topic sentence is not chosen");
  assert.deepEqual(summarize("One sentence only here, and a second one follows it.", "t", 4).length, 1);
});

test("link density tells a navigation rail from a story", () => {
  assert.ok(linkDensity(`<ul><li><a href="/a">Politics today</a></li><li><a href="/b">Sports today</a></li></ul>`) > 0.9);
  assert.ok(linkDensity(`<p>${"A long paragraph of real story text. ".repeat(10)}<a href="/x">one link</a></p>`) < 0.1);
  assert.equal(linkDensity(""), 1);
});

test("found on live pages: a bare 'By' is not an author, captions and mid-sentence fragments are not summary", () => {
  assert.deepEqual(extractMeta(`<meta name="author" content="Adwoa Gyimah-Brempong, By">`).authors, ["Adwoa Gyimah-Brempong"]);
  const s = sentences("Photograph: Visit Norway A still from the tourist board film shown here. ” but added that the incident does look like a hack on the exchange. Getty Images file picture of the actor at an event. The exchange has frozen about three billion dollars of affected assets so far.");
  assert.deepEqual(s, ["The exchange has frozen about three billion dollars of affected assets so far."]);
});
