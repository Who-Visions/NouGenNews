import { test } from "node:test";
import assert from "node:assert/strict";
import { moonPhase } from "./moon.js";

test("a known full moon (2000-01-21) reads as full and nearly fully lit", () => {
  const m = moonPhase(new Date(Date.UTC(2000, 0, 21, 4, 40)));
  assert.equal(m.name, "Full Moon");
  assert.ok(m.illumination >= 97, `illumination ${m.illumination}`);
});

test("a known new moon (the 2024-04-08 eclipse) is barely lit and waxing", () => {
  const m = moonPhase(new Date(Date.UTC(2024, 3, 8, 18, 21)));
  assert.ok(m.illumination <= 6, `illumination ${m.illumination}`);
  assert.ok(["New Moon", "Waxing Crescent"].includes(m.name), m.name);
});

test("a week after new it is a first quarter, half lit, and the days to full and new are sensible", () => {
  const m = moonPhase(new Date(Date.UTC(2000, 0, 6, 18, 14) + 7.4 * 86400000));
  assert.equal(m.name, "First Quarter");
  assert.ok(Math.abs(m.illumination - 50) <= 3);
  assert.equal(m.waxing, true);
  assert.ok(m.daysToFull >= 6 && m.daysToFull <= 8);
  assert.ok(m.daysToNew >= 21 && m.daysToNew <= 23);
});

test("dates before the epoch still land inside one lunar month", () => {
  const m = moonPhase(new Date(Date.UTC(1969, 6, 20)));
  assert.ok(m.age >= 0 && m.age < 29.6);
  assert.ok(m.illumination >= 0 && m.illumination <= 100);
});
