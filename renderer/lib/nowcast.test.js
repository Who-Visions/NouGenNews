import { test } from "node:test";
import assert from "node:assert/strict";
import { nowcastText } from "./nowcast.js";

const steps = (vals) => vals.map((v, i) => ({ time: `2026-10-30T14:${String(i * 15).padStart(2, "0")}`.replace("T14:60", "T15:00").replace("T14:75", "T15:15"), precip_in: v }));

test("dry, starting, stopping and continuing rain each read correctly", () => {
  assert.equal(nowcastText(steps([0, 0, 0, 0])), "No rain expected for the next 1 hour.");
  assert.equal(nowcastText(steps([0, 0, 0.02, 0.02])), "Rain likely in about 30 minutes.");
  assert.equal(nowcastText(steps([0.02, 0.02, 0, 0])), "Raining now, easing in about 30 minutes.");
  assert.equal(nowcastText(steps([0.02, 0.02, 0.02, 0.02])), "Raining, and it should continue for at least 1 hour.");
});

test("no data says nothing rather than claiming dry, and noise is not rain", () => {
  assert.equal(nowcastText([]), "");
  assert.equal(nowcastText(undefined), "");
  assert.equal(nowcastText(steps([null, null, null])), "");
  assert.match(nowcastText(steps([0.001, 0.001, 0, 0])), /^No rain/);
});
