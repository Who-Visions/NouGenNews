import test from "node:test";
import assert from "node:assert/strict";
import { officialAlert, warningLevel, isWeatherStory } from "../weatheralert.js";

const now = Date.parse("2026-11-01T20:00:00Z");
const flood = { event: "Flash Flood Warning", severity: "Severe", areas: "Palm Beach, FL", expires: "2026-11-01T23:00:00Z", source: "National Weather Service" };

test("life-threatening warnings are red, lesser warnings amber, advisories nothing", () => {
  assert.equal(warningLevel(flood), "red");
  assert.equal(warningLevel({ event: "Coastal Flood Warning", severity: "Severe" }), "amber");
  assert.equal(warningLevel({ event: "Wind Advisory", severity: "Moderate" }), null);
});

test("an expired warning raises nothing", () => {
  assert.equal(officialAlert([{ ...flood, expires: "2026-11-01T19:00:00Z" }], [], { now }), null);
});

test("local coverage leads, video first, and a warning stands alone without coverage", () => {
  const stories = [
    { id: "a", feedId: "local", title: "Flooding closes Palm Beach ramps", imageUrl: "x", timestamp: now - 1000 },
    { id: "b", feedId: "local", title: "Flash flood video from Palm Beach", videos: [{}], timestamp: now - 2000 },
    { id: "c", feedId: "tv", title: "Flood season premiere" },
    { id: "e", feedId: "local", title: "Flash flood warning in Miami-Dade", timestamp: now - 1000 },
    { id: "f", feedId: "local", title: "Palm Beach flooding yesterday", timestamp: now - 14 * 3600e3 },
    { id: "d", feedId: "local", title: "Council meets" },
  ];
  const a = officialAlert([flood], stories, { now });
  assert.equal(a.level, "red");
  assert.deepEqual(a.stories.map((s) => s.id), ["b", "a"]);
  assert.equal(officialAlert([flood], [], { now }).story, null);
  assert.equal(isWeatherStory({ title: "Council meets" }), false);
});
