import test from "node:test";
import assert from "node:assert/strict";
import { loadSince, stampVisit, newSince, catchupLabel, MIN_GAP_MS } from "./catchup.js";

const mem = () => { const m = new Map(); return { getItem: (k) => (m.has(k) ? m.get(k) : null), setItem: (k, v) => m.set(k, v) }; };
const NOW = Date.UTC(2026, 10, 3, 18, 0, 0);
const H = 3600 * 1000;

test("a first run has no last visit and nothing is new", () => {
  assert.equal(loadSince(mem()), 0);
  assert.deepEqual(newSince([{ id: "a", timestamp: NOW - 1000 }], 0, NOW), []);
});

test("stamp and load round-trip; broken storage never throws", () => {
  const s = mem();
  stampVisit(NOW, s);
  assert.equal(loadSince(s), NOW);
  assert.equal(loadSince({ getItem() { throw new Error("blocked"); } }), 0);
  assert.doesNotThrow(() => stampVisit(NOW, { setItem() { throw new Error("blocked"); } }));
});

test("a short absence is not a return", () => {
  assert.deepEqual(newSince([{ id: "a", timestamp: NOW - 60000 }], NOW - MIN_GAP_MS + 1000, NOW), []);
});

test("returns only stories after the last visit, newest first", () => {
  const since = NOW - 5 * H;
  const got = newSince([
    { id: "old", timestamp: NOW - 9 * H },
    { id: "mid", timestamp: NOW - 3 * H },
    { id: "new", timestamp: NOW - 1 * H },
    { id: "none" },
  ], since, NOW);
  assert.deepEqual(got.map((s) => s.id), ["new", "mid"]);
});

test("a publisher clock ahead of ours reads as just now, so it is new", () => {
  assert.deepEqual(newSince([{ id: "f", timestamp: NOW + 2 * H }], NOW - 5 * H, NOW).map((s) => s.id), ["f"]);
});

test("label counts, caps and says nothing when there is nothing", () => {
  assert.equal(catchupLabel(0, NOW - H, NOW), "");
  assert.match(catchupLabel(9, NOW - H, NOW), /^9 new since /);
  assert.match(catchupLabel(250, NOW - H, NOW), /^99\+ new since /);
});

import { topNew } from "./catchup.js";
test("topNew leads with the highest score, keeps newest-first on ties, and caps", () => {
  const f = [{ id: "a", v: 1 }, { id: "b", v: 5 }, { id: "c", v: 5 }, { id: "d", v: 0 }];
  assert.deepEqual(topNew(f, (s) => s.v, 3).map((s) => s.id), ["b", "c", "a"]);
  assert.deepEqual(topNew(null, () => 0), []);
  assert.deepEqual(topNew([{ id: "x" }], () => NaN).map((s) => s.id), ["x"]);
});
