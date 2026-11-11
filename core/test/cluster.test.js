import test from "node:test";
import assert from "node:assert/strict";
import { clusterStories, sameEvent, titleWords } from "../cluster.js";

const H = 3600 * 1000;
const NOW = Date.UTC(2026, 9, 29, 20, 0, 0);
const s = (id, title, extra = {}) => ({ id, title, source: extra.source || id, timestamp: NOW, desc: "", imageUrl: "", ...extra });

test("titleWords drops stop words, outlet suffixes and punctuation, and stems lightly", () => {
  assert.deepEqual([...titleWords("Shatner Reacts To The Death Of Patrick Stewart - TVLine")].sort(), ["death", "patrick", "react", "shatner", "stewart"]);
});

test("the same event from different outlets is one cluster; the best story leads and the rest fold under it", () => {
  const wire = [
    s("a", "William Shatner reacts to the death of Patrick Stewart", { source: "TVLine" }),
    s("b", "Patrick Stewart dead: William Shatner reacts", { source: "Variety", imageUrl: "https://x.test/p.jpg", desc: "A longer summary here" }),
    s("c", "SpaceX no longer needs NASA", { source: "Ars Technica" }),
  ];
  const out = clusterStories(wire);
  assert.equal(out.length, 2);
  assert.equal(out[0].id, "b"); // has the picture
  assert.equal(out[0].clusterSize, 2);
  assert.deepEqual(out[0].alsoFrom.map((x) => x.source), ["TVLine"]);
  assert.equal(out.find((x) => x.id === "c").clusterSize, undefined);
});

test("the lead carries the number of distinct outlets so red alerts still see the coverage", () => {
  const out = clusterStories([
    s("a", "Patrick Stewart dies at 86", { source: "CBS" }),
    s("b", "Patrick Stewart, Star Trek actor, dies aged 86", { source: "Guardian" }),
    s("c", "Patrick Stewart Star Trek captain dies at 86", { source: "NYT" }),
    s("d", "Patrick Stewart dies at 86", { source: "CBS" }),
  ]);
  assert.equal(out.length, 1);
  assert.equal(out[0].clusterSize, 4);
  assert.equal(out[0].reportCount, 3); // CBS twice is one outlet
});

test("different events that share a few words stay apart", () => {
  const wire = [
    s("a", "Apple unveils new iPhone with faster chip"),
    s("b", "Apple unveils new MacBook with faster chip"),
    s("c", "Fed holds rates steady as inflation cools"),
    s("d", "Fed holds meeting on bank capital rules"),
  ];
  assert.equal(clusterStories(wire).length, 4);
});

test("a story from long before is not folded under today's, even with the same words", () => {
  const a = s("a", "Hurricane nears Florida coast with major storm surge");
  const b = s("b", "Hurricane nears Florida coast with major storm surge", { timestamp: NOW - 72 * H });
  assert.equal(sameEvent(a, b), false);
  assert.equal(clusterStories([a, b]).length, 2);
});

test("short or thin headlines are never merged on one shared word", () => {
  assert.equal(clusterStories([s("a", "Trump speaks"), s("b", "Trump signs order")]).length, 2);
});

test("nothing is lost: every folded story is reachable from its lead, and order of leads is kept", () => {
  const wire = [
    s("x", "Senate passes sweeping border security funding bill", { source: "AP" }),
    s("y", "Lead story elsewhere about wildfire evacuations in California", { source: "CNN" }),
    s("z", "Senate passes border security funding bill in sweeping vote", { source: "Reuters" }),
  ];
  const out = clusterStories(wire);
  assert.deepEqual(out.map((o) => o.id), out.map((o) => o.id).sort((p, q) => wire.findIndex((w) => w.id === p) - wire.findIndex((w) => w.id === q)));
  const total = out.reduce((n, o) => n + 1 + (o.alsoFrom ? o.alsoFrom.length : 0), 0);
  assert.equal(total, wire.length);
});

test("a thousand-story wire clusters in well under a second", () => {
  const topics = ["wildfire", "election", "earnings", "storm", "merger", "verdict", "launch", "outage", "recall", "summit"];
  const wire = [];
  for (let i = 0; i < 1400; i += 1) wire.push(s(`s${i}`, `${topics[i % 10]} story number ${i} about place${i % 97} and person${i % 53}`, { source: `src${i % 40}` }));
  const t = Date.now();
  const out = clusterStories(wire);
  assert.ok(Date.now() - t < 1000, `took ${Date.now() - t}ms`);
  assert.ok(out.length > 0);
});
