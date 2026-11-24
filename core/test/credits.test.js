import { test } from "node:test";
import assert from "node:assert/strict";
import { authorsFromXmlItem, imageCreditFromXmlItem, imageCaptionFromXmlItem, cleanAuthors, creditsFromHtml, publisherFor, publisherNameFromDomain, creditLine } from "../credits.js";
import { feedItems } from "../atom.js";
import { toNewsItem, humanizeCategory, NEWS_SCHEMA_VERSION } from "../schema.js";

test("every dc:creator is read, not just the first", () => {
  const xml = `<item><dc:creator><![CDATA[Jane Doe]]></dc:creator><dc:creator>Sam Roe</dc:creator></item>`;
  assert.deepEqual(authorsFromXmlItem(xml).map((a) => a.name), ["Jane Doe", "Sam Roe"]);
});

test("one byline naming several people is split", () => {
  assert.deepEqual(cleanAuthors(["By Jane Doe, Sam Roe and Ali Khan"]), ["Jane Doe", "Sam Roe", "Ali Khan"]);
});

test("RSS email form gives the name; a bare email gives nobody", () => {
  assert.deepEqual(authorsFromXmlItem(`<item><author>jd@x.com (Jane Doe)</author></item>`).map((a) => a.name), ["Jane Doe"]);
  assert.deepEqual(authorsFromXmlItem(`<item><author>jd@x.com</author></item>`), []);
});

test("desks, staff and the outlet itself are not authors", () => {
  assert.deepEqual(cleanAuthors(["Staff", "Fox News", "Editorial Staff", "Jane Doe"], { brands: ["Fox News"] }), ["Jane Doe"]);
});

test("an all-caps byline reads as a name", () => {
  assert.deepEqual(cleanAuthors(["KIM BARKER"]), ["Kim Barker"]);
});

test("Atom entries keep every author and their pages", () => {
  const xml = `<feed><entry><title>T</title><link rel="alternate" href="https://ex.com/a"/><id>1</id>
    <author><name>Jane Doe</name><uri>https://ex.com/jane</uri></author><author><name>Sam Roe</name></author></entry></feed>`;
  const [item] = feedItems(xml);
  const authors = authorsFromXmlItem(item);
  assert.deepEqual(authors, [{ name: "Jane Doe", url: "https://ex.com/jane" }, { name: "Sam Roe" }]);
});

test("picture credit and caption come from media tags; an author credit is not a picture credit", () => {
  const xml = `<item><media:content url="https://ex.com/p.jpg" medium="image"><media:description>A cat on a roof</media:description></media:content>
    <media:credit role="author">Jane Doe</media:credit><media:credit role="photographer">Getty Images</media:credit></item>`;
  assert.equal(imageCreditFromXmlItem(xml), "Getty Images");
  assert.equal(imageCaptionFromXmlItem(xml), "A cat on a roof");
  assert.deepEqual(authorsFromXmlItem(xml).map((a) => a.name), ["Jane Doe"]);
});

test("a page's JSON-LD names its authors, site and dates", () => {
  const html = `<html><head><meta property="og:site_name" content="The Verge">
    <script type="application/ld+json">{"@type":"NewsArticle","author":[{"@type":"Person","name":"Jane Doe","url":"https://theverge.com/authors/jane"},{"@type":"Organization","name":"The Verge"}],"datePublished":"2026-11-20T15:00:00Z","image":{"url":"https://x/p.jpg","creditText":"Reuters"}}</script>
    <link rel="canonical" href="https://www.theverge.com/a/b"></head></html>`;
  const c = creditsFromHtml(html);
  assert.deepEqual(c.authors, [{ name: "Jane Doe", url: "https://theverge.com/authors/jane" }]);
  assert.equal(c.siteName, "The Verge");
  assert.equal(c.publishedAt, "2026-11-20T15:00:00.000Z");
  assert.equal(c.canonical, "https://www.theverge.com/a/b");
  assert.equal(c.imageCredit, "Reuters");
});

test("publisher comes from the story's own address, not the aggregator", () => {
  assert.equal(publisherFor({ url: "https://www.theverge.com/x" }).name, "The Verge");
  assert.equal(publisherNameFromDomain("blog.example-labs.io"), "Example Labs");
  assert.equal(publisherFor({ url: "https://deadline.com/x", feedName: "Deadline" }).name, "Deadline");
});

test("credit line reads naturally", () => {
  assert.equal(creditLine({ authors: [{ name: "A B" }, { name: "C D" }], publisher: { name: "Wired" } }), "By A B and C D, Wired");
  assert.equal(creditLine({ authors: [], publisher: { name: "Wired" } }), "Wired");
});

test("a legacy NouGen-credited row is credited to the real outlet, with no invented author", () => {
  const v1 = { article_id: "nougen-x-1", title: "T", link: "https://arstechnica.com/ai/2026/11/x/", source_id: "nougen", source_name: "NouGen News", creator: ["NouGen News"], pubDate: "2026-11-01T00:00:00Z", image_url: null };
  const v2 = toNewsItem(v1);
  assert.equal(v2.schema_version, NEWS_SCHEMA_VERSION);
  assert.equal(v2.source_name, "Ars Technica");
  assert.equal(v2.publisher.domain, "arstechnica.com");
  assert.deepEqual(v2.authors, []);
  assert.deepEqual(v2.creator, []);
  assert.equal(v2.credit_line, "Ars Technica");
  assert.equal(v2.article_id, "nougen-x-1");
});

test("v2 item keeps v1 fields filled and records the picture's origin and credit", () => {
  const v2 = toNewsItem({ title: "T", url: "https://www.foxnews.com/us/x", outlet: "Fox News", author: "By Jane Doe", published_at: "2026-11-23T12:00:00Z",
    image_url: "https://cdn.example.com/mirror.jpg", image_origin_url: "https://a57.foxnews.com/p.jpg", image_credit: "AP Photo", category: ["/us/crime/police"] }, { via: { name: "Hacker News", url: "https://news.ycombinator.com/item?id=1" } });
  assert.equal(v2.source_name, "Fox News");
  assert.deepEqual(v2.creator, ["Jane Doe"]);
  assert.equal(v2.image_url, "https://cdn.example.com/mirror.jpg");
  assert.equal(v2.images[0].origin_url, "https://a57.foxnews.com/p.jpg");
  assert.equal(v2.images[0].kind, "mirror");
  assert.equal(v2.image_credit, "AP Photo");
  assert.deepEqual(v2.category, ["Police"]);
  assert.equal(v2.via.name, "Hacker News");
  assert.equal(v2.pubDate, "2026-11-23T12:00:00.000Z");
});

test("a generated picture is labeled and never credited to the outlet", () => {
  const v2 = toNewsItem({ title: "T", link: "https://arxiv.org/abs/1", images: [{ url: "https://nougenai.com/api/news-image/abc", kind: "generated", generator: "flux-schnell" }] });
  assert.equal(v2.images[0].kind, "generated");
  assert.equal(v2.images[0].credit, undefined);
  assert.equal(v2.image_credit, "");
});

test("categories read as words", () => {
  assert.equal(humanizeCategory("/us/politics/elections"), "Elections");
  assert.equal(humanizeCategory("world-news"), "World News");
});

test("no title or no link is no item", () => {
  assert.equal(toNewsItem({ title: "T" }), null);
  assert.equal(toNewsItem({ link: "https://x.com" }), null);
});

test("author meta tags count whichever attribute comes first", () => {
  const html = `<meta content="Jane Doe" name="author"><meta property="article:author" content="Sam Lee"><meta name="author" content="https://x.com/jane">`;
  assert.deepEqual(creditsFromHtml(html).authors.map((a) => a.name), ["Jane Doe", "Sam Lee"]);
});

test("a JSON-LD Organization author is never a person, even when its name differs from the site", () => {
  const html = `<meta property="og:site_name" content="The Verge"><script type="application/ld+json">{"@type":"NewsArticle","author":[{"@type":"Person","name":"Jane Doe"},{"@type":"Organization","name":"Associated Press"},{"@type":"NewsMediaOrganization","name":"Vox Media"}]}</script>`;
  assert.deepEqual(creditsFromHtml(html).authors.map((a) => a.name), ["Jane Doe"]);
});
