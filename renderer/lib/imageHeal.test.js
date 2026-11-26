import test from "node:test";
import assert from "node:assert/strict";
import { nextPicture } from "./imageHeal.js";

test("tries the feed address, then the page picture, then gives up", async () => {
  const fetchArticle = async () => ({ image: "https://x.test/page.jpg" });
  const tried = new Set(["https://x.test/small.jpg"]);
  const args = { raw: "https://x.test/raw.jpg", link: "https://x.test/a", tried };
  assert.equal(await nextPicture(args, fetchArticle), "https://x.test/raw.jpg");
  tried.add("https://x.test/raw.jpg");
  assert.equal(await nextPicture(args, fetchArticle), "https://x.test/page.jpg");
  tried.add("https://x.test/page.jpg");
  assert.equal(await nextPicture(args, fetchArticle), "");
});

test("a failed page fetch gives up instead of throwing", async () => {
  const tried = new Set(["https://x.test/raw.jpg"]);
  const out = await nextPicture({ raw: "https://x.test/raw.jpg", link: "https://x.test/b", tried }, async () => { throw new Error("down"); });
  assert.equal(out, "");
});
