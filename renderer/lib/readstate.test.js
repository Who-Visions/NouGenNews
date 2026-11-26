import test from "node:test";
import assert from "node:assert/strict";
import { loadRead, markRead, MAX_READ } from "./readstate.js";

const mem = () => { const m = new Map(); return { getItem: (k) => (m.has(k) ? m.get(k) : null), setItem: (k, v) => m.set(k, v) }; };

test("marking returns a new set, persists, and ignores repeats and empties", () => {
  const s = mem();
  const a = new Set();
  const b = markRead(a, "x", s);
  assert.notEqual(a, b);
  assert.ok(b.has("x") && !a.has("x"));
  assert.equal(markRead(b, "x", s), b);
  assert.equal(markRead(b, "", s), b);
  assert.ok(loadRead(s).has("x"));
});

test("storage that is broken or holds junk never throws", () => {
  assert.equal(loadRead({ getItem() { throw new Error("no"); } }).size, 0);
  assert.equal(loadRead({ getItem: () => "{not json" }).size, 0);
  assert.deepEqual([...loadRead({ getItem: () => JSON.stringify(["a", 1, null, "b"]) })], ["a", "b"]);
  assert.doesNotThrow(() => markRead(new Set(), "x", { setItem() { throw new Error("no"); } }));
});

test("the oldest marks are dropped past the cap", () => {
  const s = mem();
  let set = new Set();
  for (let i = 0; i < MAX_READ + 5; i++) set = markRead(set, `id${i}`, s);
  assert.equal(set.size, MAX_READ);
  assert.ok(!set.has("id0") && set.has(`id${MAX_READ + 4}`));
});
