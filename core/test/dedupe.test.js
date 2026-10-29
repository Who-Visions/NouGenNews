import { test } from "node:test";
import assert from "node:assert/strict";
import { dedupeStories, canonicalUrl, titleKey } from "../dedupe.js";

const s = (id, title, link, over = {}) => ({ id, title, link, timestamp: 1000, ...over });

test("canonicalUrl ignores scheme, www, query, fragment and a trailing slash", () => {
  assert.equal(canonicalUrl("https://www.cbsnews.com/news/a-story/?utm_source=x#top"), "cbsnews.com/news/a-story");
  assert.equal(canonicalUrl("http://cbsnews.com/news/a-story"), "cbsnews.com/news/a-story");
  assert.equal(canonicalUrl("javascript:alert(1)"), "");
});

test("titleKey drops the publisher suffix and punctuation", () => {
  assert.equal(titleKey("Fed holds rates steady, in split vote - CBS News"), titleKey("Fed holds rates steady in split vote"));
});

test("the same article from two providers is kept once, preferring the one with a picture", () => {
  const a = s("a", "Fed holds rates steady in split vote", "https://www.cbsnews.com/news/fed/", { imageUrl: "" });
  const b = s("b", "Fed holds rates steady in split vote - CBS News", "https://cbsnews.com/news/fed?utm=1", { imageUrl: "https://img.test/x.jpg" });
  const out = dedupeStories([a, b]);
  assert.equal(out.length, 1);
  assert.equal(out[0].id, "b");
});

test("the same headline from a different address is still one story", () => {
  const out = dedupeStories([s("a", "Mass Effect 5 art director says the game is lost", "https://x.test/1"), s("b", "Mass Effect 5 art director says the game is lost", "https://y.test/2", { desc: "longer summary here" })]);
  assert.equal(out.length, 1);
  assert.equal(out[0].id, "b");
});

test("different stories and very short headlines are never merged", () => {
  const out = dedupeStories([s("a", "Fed holds", "https://x.test/1"), s("b", "Fed holds", "https://y.test/2"), s("c", "A different story entirely", "https://z.test/3")]);
  assert.equal(out.length, 3);
  assert.equal(out.filter((x) => x.title === "Fed holds").length, 2, "titles of 12 characters or fewer are not matched by headline");
});

test("order of first appearance is kept", () => {
  const out = dedupeStories([s("a", "First story about something long", "https://a.test/1"), s("b", "Second story about another thing", "https://b.test/2"), s("c", "First story about something long", "https://c.test/3")]);
  assert.deepEqual(out.map((x) => x.id), ["a", "b"]);
});
