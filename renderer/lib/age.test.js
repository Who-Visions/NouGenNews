import { test } from "node:test";
import assert from "node:assert/strict";
import { ageLabel, clampTs, exactTime } from "./age.js";

const NOW = Date.UTC(2026, 9, 29, 20, 0, 0);
test("ages count seconds, minutes and hours", () => {
  assert.equal(ageLabel(NOW - 2000, NOW), "just now");
  assert.equal(ageLabel(NOW - 42000, NOW), "42s ago");
  assert.equal(ageLabel(NOW - 5 * 60000, NOW), "5m ago");
  assert.equal(ageLabel(NOW - 3 * 3600000, NOW), "3h ago");
  assert.equal(ageLabel(0, NOW), "");
});
test("a publisher clock ahead of ours reads as just now, not the future", () => {
  assert.equal(clampTs(NOW + 60 * 60000, NOW), NOW);
  assert.equal(ageLabel(NOW + 60 * 60000, NOW), "just now");
  assert.equal(clampTs(NOW + 60000, NOW), NOW + 60000);
});
test("the exact time carries milliseconds", () => {
  assert.match(exactTime(NOW + 84), /:\d{2}\.084/);
});
