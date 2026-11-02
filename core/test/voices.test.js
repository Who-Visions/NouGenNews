import test from "node:test";
import assert from "node:assert/strict";
import { isOpinion, capSources } from "../voices.js";
import { clusterStories } from "../cluster.js";

test("isOpinion reads the title prefix and the URL section", () => {
  assert.equal(isOpinion({ title: "Opinion: Why people still live there" }), true);
  assert.equal(isOpinion({ title: "Crash", link: "https://x.test/opinion/2026/crash" }), true);
  assert.equal(isOpinion({ title: "Plane crashes in West Palm Beach", link: "https://x.test/news/crash" }), false);
  assert.equal(isOpinion({ title: "Columns collapse at site", link: "not a url" }), false);
});

test("capSources demotes without deleting and keeps order", () => {
  const w = ["a", "a", "b", "a"].map((source, i) => ({ id: i, source }));
  assert.deepEqual(capSources(w, 2).map((s) => s.id), [0, 1, 2, 3]);
  assert.deepEqual(capSources(w, 1).map((s) => s.id), [0, 2, 1, 3]);
});

test("reporting leads a cluster over opinion even with a picture, and folded opinion is flagged", () => {
  const t = 1;
  const out = clusterStories([
    { id: "o", title: "Plane crash West Palm Beach nine dead", source: "A", timestamp: t, imageUrl: "x", link: "https://a.test/opinion/c" },
    { id: "r", title: "Plane crash West Palm Beach nine dead", source: "B", timestamp: t, link: "https://b.test/news/c" },
  ]);
  assert.equal(out[0].id, "r");
  assert.equal(out[0].alsoFrom[0].opinion, true);
});
