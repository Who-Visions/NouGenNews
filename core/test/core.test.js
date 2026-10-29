import { test } from "node:test";
import assert from "node:assert/strict";
import { normalizeTitle, extractTerms, matchStory, termFeedUrl } from "../library.js";
import { buildEdition, scoreStory } from "../edition.js";
import { FEEDS } from "../feeds.js";

test("normalizeTitle strips release noise, year, season and group tags", () => {
  assert.equal(normalizeTitle("Dune.Part.Two.2024.1080p.WEB-DL.x265-GRP"), "Dune Part Two");
  assert.equal(normalizeTitle("[SubsPlease] Frieren - S01E05 (1080p)"), "Frieren -");
  assert.equal(normalizeTitle("The_Bear_S03"), "The Bear");
});

test("extractTerms drops short, common and duplicate titles", () => {
  const t = extractTerms(["Dune.2021.1080p", "dune (2021)", "Up", "The", "Frieren S01"]);
  assert.deepEqual(t, ["Dune", "Frieren"]);
});

test("matchStory is whole-word and case-insensitive", () => {
  assert.deepEqual(matchStory({ title: "Dune 3 popcorn bucket" }, ["Dune"]), ["Dune"]);
  assert.deepEqual(matchStory({ title: "Dunes of Arrakis" }, ["Dune"]), []);
});

test("termFeedUrl quotes and encodes the term", () => {
  assert.match(termFeedUrl("The Bear"), /q=%22The%20Bear%22/);
});

test("every feed files under a section", () => {
  assert.ok(FEEDS.every((f) => typeof f.section === "string" && f.section));
});

const now = Date.UTC(2026, 9, 29, 12);
const story = (id, over = {}) => ({ id, feedId: "deadline", title: id, timestamp: now - 3600e3, ...over });

test("fresher and video stories outrank older ones", () => {
  assert.ok(scoreStory(story("a"), { now }) > scoreStory(story("b", { timestamp: now - 48 * 3600e3 }), { now }));
  assert.ok(scoreStory(story("c", { videos: [{}] }), { now }) > scoreStory(story("d"), { now }));
});

test("a library hit lifts an older story to the lead", () => {
  const ed = buildEdition([story("fresh"), story("Dune news", { timestamp: now - 10 * 3600e3 })], { now, terms: ["Dune"] });
  assert.equal(ed.lead.id, "Dune news");
  assert.equal(ed.libraryHits, 1);
});

test("an edition fills lead, secondary and section blocks without repeats", () => {
  const stories = Array.from({ length: 14 }, (_, i) => story(`s${i}`, { timestamp: now - i * 3600e3 }));
  const ed = buildEdition(stories, { now });
  const ids = [ed.lead, ...ed.secondary, ...ed.sections.flatMap((s) => s.stories)].map((s) => s.id);
  assert.equal(new Set(ids).size, ids.length);
  assert.equal(ed.secondary.length, 4);
});
