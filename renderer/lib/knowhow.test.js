import { test } from "node:test";
import assert from "node:assert/strict";
import { parseRules, applyKnowhow, vote, forget, learnedSignals, flagsFor, emptyLearned } from "./knowhow.js";

const S = (id, title, source = "Wire", desc = "") => ({ id, title, source, desc, categories: [] });
const LIST = [S("1", "City budget passes"), S("2", "Solar farm opens", "Daily"), S("3", "Celebrity gossip roundup", "Comicbook"), S("4", "New comic film", "Comicbook"), S("5", "Comic sales rise", "Comicbook"), S("6", "Road repairs start", "Daily")];
const rules = (t) => parseRules(t).rules;

test("rules parse, notes are ignored, and bad lines are reported with their number and a reason", () => {
  const { rules: r, errors } = parseRules("# note\n\nboost Solar, wind power\nmute gossip\ncap Comicbook 10%\nfrobnicate x\nboost\ncap Comicbook lots");
  assert.deepEqual(r.map((x) => x.kind), ["boost", "mute", "cap"]);
  assert.deepEqual(r[0].terms, ["solar", "wind power"]);
  assert.equal(r[2].share, 0.1);
  assert.deepEqual(errors.map((e) => e.line), [6, 7, 8]);
  assert.match(errors[0].why, /unknown rule/);
});

test("no rules and no learning leave the list exactly as it came", () => {
  const { stories, stats } = applyKnowhow(LIST, []);
  assert.deepEqual(stories, LIST);
  assert.equal(stats.muted + stats.raised + stats.lowered + stats.capped, 0);
});

test("boost raises, mute hides, trust and demote move an outlet, and terms match whole words only", () => {
  const { stories, stats } = applyKnowhow(LIST, rules("boost solar\nmute gossip\ndemote Comicbook"));
  assert.equal(stories[0].id, "2");
  assert.ok(!stories.some((s) => s.id === "3"));
  assert.deepEqual(stories.slice(-2).map((s) => s.id), ["4", "5"]);
  assert.equal(stats.muted, 1);
  assert.equal(applyKnowhow([S("a", "Solaris review")], rules("mute solar")).stories.length, 1);
});

test("cap limits an outlet's share but always leaves it one story", () => {
  const { stories, stats } = applyKnowhow(LIST, rules("cap Comicbook 20%"));
  assert.equal(stories.filter((s) => s.source === "Comicbook").length, 1);
  assert.equal(stats.capped, 2);
});

test("a breaking alert's story is never hidden or capped", () => {
  const { stories } = applyKnowhow(LIST, rules("mute gossip\ncap Comicbook 1%"), emptyLearned(), new Set(["3", "4", "5"]));
  assert.equal(stories.length, 6);
});

test("flags name the words that matched", () => {
  assert.deepEqual(flagsFor(S("x", "Car recall widens"), rules("flag recall, strike")), ["recall"]);
});

test("one vote changes nothing; a repeated signal does; voting again takes it back", () => {
  let l = vote(emptyLearned(), S("a", "Quantum chip record", "Lab Post"), 1);
  const list = [S("o", "Other story"), S("n", "Quantum chip again")];
  assert.equal(applyKnowhow(list, [], l).stories[0].id, "o");
  l = vote(l, S("b", "Quantum chip update", "Lab Post"), 1);
  assert.equal(applyKnowhow(list, [], l).stories[0].id, "n");
  assert.ok(learnedSignals(l).some((x) => x.key === "quantum" && x.weight === 2));
  l = vote(l, S("b", "Quantum chip update", "Lab Post"), 1);
  assert.equal(l.words.quantum, 1);
  assert.equal(l.votes.b, undefined);
});

test("switching a vote replaces it, and forgetting removes a signal", () => {
  const story = S("a", "Quantum chip record", "Lab Post");
  const up = vote(emptyLearned(), story, 1);
  const down = vote(up, story, -1);
  assert.equal(down.words.quantum, -1);
  assert.equal(forget(down, "words", "quantum").words.quantum, undefined);
});

test("learning is bounded: no word passes the limit however often it is liked", () => {
  let l = emptyLearned();
  for (let i = 0; i < 20; i += 1) l = vote(l, S(`s${i}`, "Quantum story"), 1);
  assert.equal(l.words.quantum, 5);
});
