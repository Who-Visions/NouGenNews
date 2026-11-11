import { test } from "node:test";
import assert from "node:assert/strict";
import { imagesFromXmlItem, imagesFromHtml, bestImage, bestFromSrcset, absolutize } from "../images.js";

test("addresses are made absolute and unsafe ones dropped", () => {
  assert.equal(absolutize("//cdn.test/a.jpg"), "https://cdn.test/a.jpg");
  assert.equal(absolutize("/img/a.jpg", "https://site.test/story"), "https://site.test/img/a.jpg");
  assert.equal(absolutize("data:image/png;base64,AAAA"), "");
  assert.equal(absolutize("javascript:alert(1)"), "");
});

test("a srcset yields its widest picture", () => {
  assert.equal(bestFromSrcset("a.jpg 320w, b.jpg 1280w, c.jpg 640w", "https://x.test/").url, "https://x.test/b.jpg");
});

test("media:content is read with or without a type, inside a group, and video is skipped", () => {
  const xml = `<item><media:group><media:content url="https://v.test/clip.mp4" type="video/mp4"/><media:content url="https://i.test/lead.jpg" medium="image" width="1200" height="675"/><media:thumbnail url="https://i.test/thumb.jpg" width="150" height="84"/></media:group></item>`;
  const c = imagesFromXmlItem(xml);
  assert.ok(!c.some((x) => /clip\.mp4/.test(x.url)));
  assert.equal(bestImage(c), "https://i.test/lead.jpg");
});

test("enclosure, atom enclosure link, itunes and named tags are found", () => {
  assert.equal(imagesFromXmlItem(`<item><enclosure url="https://i.test/e.jpg" type="image/jpeg"/></item>`)[0].url, "https://i.test/e.jpg");
  assert.equal(imagesFromXmlItem(`<entry><link rel="enclosure" type="image/png" href="https://i.test/a.png"/></entry>`)[0].url, "https://i.test/a.png");
  assert.equal(imagesFromXmlItem(`<item><itunes:image href="https://i.test/it.jpg"/></item>`)[0].url, "https://i.test/it.jpg");
  assert.equal(imagesFromXmlItem(`<item><image_url><![CDATA[https://i.test/n.jpg]]></image_url></item>`)[0].url, "https://i.test/n.jpg");
});

test("pictures in escaped or CDATA summaries are found by src, data-src or srcset, and pixels and logos are ignored", () => {
  const xml = `<item><description><![CDATA[<img src="https://t.test/pixel.gif" width="1" height="1"><img src="https://t.test/logo.png"><img data-src="https://i.test/lazy.jpg"><img srcset="https://i.test/s-300.jpg 300w, https://i.test/s-900.jpg 900w">]]></description></item>`;
  const urls = imagesFromXmlItem(xml).map((x) => x.url);
  assert.ok(urls.includes("https://i.test/lazy.jpg"));
  assert.ok(urls.includes("https://i.test/s-900.jpg"));
  assert.ok(!urls.some((u) => /pixel|logo/.test(u)));
  const esc = `<item><description>&lt;img src="https://i.test/esc.jpg"&gt;</description></item>`;
  assert.equal(imagesFromXmlItem(esc)[0].url, "https://i.test/esc.jpg");
});

test("a page offers its picture through Open Graph, Twitter, JSON-LD, image_src or its own images", () => {
  const og = `<head><meta property="og:image" content="/media/lead.jpg"><meta property="og:image:width" content="1600"><meta property="og:image:height" content="900"></head>`;
  assert.equal(bestImage(imagesFromHtml(og, "https://site.test/a")), "https://site.test/media/lead.jpg");
  const tw = `<meta content="https://i.test/tw.jpg" name="twitter:image">`;
  assert.equal(imagesFromHtml(tw)[0].url, "https://i.test/tw.jpg");
  const ld = `<script type="application/ld+json">{"@graph":[{"@type":"NewsArticle","image":{"@type":"ImageObject","url":"https://i.test/ld.jpg","width":1200,"height":800}}]}</script>`;
  assert.equal(bestImage(imagesFromHtml(ld)), "https://i.test/ld.jpg");
  assert.equal(imagesFromHtml(`<link rel="image_src" href="https://i.test/src.jpg">`)[0].url, "https://i.test/src.jpg");
  const body = `<body><noscript><img src="https://i.test/ns.jpg"></noscript><img data-src="https://i.test/own.jpg" width="800" height="500"></body>`;
  const urls = imagesFromHtml(body).map((x) => x.url);
  assert.ok(urls.includes("https://i.test/ns.jpg") && urls.includes("https://i.test/own.jpg"));
});

test("a declared large picture beats an earlier small one; with no sizes the most trusted source wins", () => {
  const list = [{ url: "https://i.test/small.jpg", w: 300, h: 200, via: "media:thumbnail" }, { url: "https://i.test/big.jpg", w: 1600, h: 900, via: "img:src" }];
  assert.equal(bestImage(list), "https://i.test/big.jpg");
  const flat = [{ url: "https://i.test/body.jpg", w: 0, h: 0, via: "img:src" }, { url: "https://i.test/og.jpg", w: 0, h: 0, via: "og:image" }];
  assert.equal(bestImage(flat), "https://i.test/og.jpg");
  assert.equal(bestImage([]), "");
});
