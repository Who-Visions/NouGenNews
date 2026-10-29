import { test } from "node:test";
import assert from "node:assert/strict";
import { findAlerts } from "../alerts.js";

const NOW = Date.UTC(2026, 9, 29, 18, 0);
const min = (m) => NOW - m * 60000;
const s = (source, title, ago, over = {}) => ({ id: source + title, source, title, timestamp: min(ago), feedId: "top", ...over });

test("a notable death reported by three independent outlets is a red alert", () => {
  const a = findAlerts([
    s("cbsnews.com", "Sir Example Person dies at 86", 20),
    s("bbc.com", "Sir Example Person, acclaimed actor, dies aged 86 - BBC", 25),
    s("variety.com", "Example Person Dies at 86: Tributes Pour In", 30),
    s("eonline.com", "Unrelated celebrity wedding news", 10),
  ], { now: NOW });
  assert.equal(a.length, 1);
  assert.equal(a[0].level, "red");
  assert.equal(a[0].kind, "death");
  assert.equal(a[0].sourceCount, 3);
  assert.match(a[0].key, /^death:/);
  assert.ok(!a[0].headline.includes(" - BBC") || a[0].story.source !== "bbc.com");
});

test("one or two outlets are not enough for a death (a hoax travels through a few)", () => {
  assert.equal(findAlerts([s("rumor.example", "Sir Example Person dies at 86", 5)], { now: NOW }).length, 0);
  assert.equal(findAlerts([s("a.example", "Sir Example Person dies at 86", 5), s("b.example", "Example Person dies at 86 say reports", 6)], { now: NOW }).length, 0);
});

test("two outlets are enough when one carries a breaking flag", () => {
  const a = findAlerts([s("a.example", "Sir Example Person dies at 86", 5, { breaking: true }), s("b.example", "Example Person dies at 86", 6)], { now: NOW });
  assert.equal(a[0]?.level, "red");
});

test("titles that only look like deaths are ignored", () => {
  const a = findAlerts([
    s("a.example", "The Walking Dead spinoff gets a premiere date", 5),
    s("b.example", "The Walking Dead returns with a new spinoff", 6),
    s("c.example", "Death Stranding 2 review: a spinoff of ideas", 7),
    s("d.example", "Walking Dead spinoff trailer lands", 8),
  ], { now: NOW });
  assert.equal(a.length, 0);
});

test("a major event needs four outlets for red; local-only coverage is amber", () => {
  const four = ["a", "b", "c", "d"].map((x, i) => s(`${x}.example`, `Hurricane Milton makes landfall near Tampa as ${x} reports`, 10 + i));
  assert.equal(findAlerts(four, { now: NOW })[0].level, "red");
  assert.equal(findAlerts(four.slice(0, 3), { now: NOW }).length, 1);
  assert.equal(findAlerts(four.slice(0, 3), { now: NOW })[0].level, "amber");
  const local = ["wsvn", "wplg", "nbc6"].map((x, i) => s(`${x}.com`, `Explosion rocks Miami warehouse, ${x} says`, 10 + i, { feedId: "local" }));
  assert.equal(findAlerts(local, { now: NOW })[0].level, "amber");
});

test("old stories and future timestamps are not alerts", () => {
  const old = ["a", "b", "c"].map((x) => s(`${x}.example`, "Sir Example Person dies at 86", 13 * 60));
  assert.equal(findAlerts(old, { now: NOW }).length, 0);
  const future = ["a", "b", "c"].map((x) => s(`${x}.example`, "Sir Example Person dies at 86", -300));
  assert.equal(findAlerts(future, { now: NOW }).length, 0);
});

test("different people with similar headlines are separate stories", () => {
  const a = findAlerts([
    s("a.example", "Alpha Person dies at 70", 5), s("b.example", "Alpha Person dies at 70, family says", 6), s("c.example", "Alpha Person has died", 7),
    s("d.example", "Beta Figure dies at 91", 5), s("e.example", "Beta Figure dies at 91 after illness", 6),
  ], { now: NOW });
  assert.equal(a.length, 1);
  assert.match(a[0].headline, /Alpha/);
});

test("red outranks amber, then more sources, then newer", () => {
  const stories = [
    ...["a", "b", "c"].map((x, i) => s(`${x}.example`, `Explosion hits Miami warehouse, ${x} says`, 10 + i, { feedId: "local" })),
    ...["d", "e", "f"].map((x, i) => s(`${x}.example`, "Sir Example Person dies at 86", 30 + i)),
  ];
  const a = findAlerts(stories, { now: NOW });
  assert.deepEqual(a.map((x) => x.level), ["red", "amber"]);
});

test("a single story that carries its own coverage count (an event of hundreds of articles) raises a red alert", () => {
  const a = findAlerts([s("5 hundred articles", "Sir Example Person dies at 86", 20, { reportCount: 375, feedId: "events" })], { now: NOW });
  assert.equal(a.length, 1);
  assert.equal(a[0].level, "red");
  assert.equal(a[0].sourceCount, 375);
  assert.equal(findAlerts([s("small event", "Sir Example Person dies at 86", 20, { reportCount: 2, feedId: "events" })], { now: NOW }).length, 0);
});
