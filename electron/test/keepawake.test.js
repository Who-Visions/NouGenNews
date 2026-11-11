const test = require("node:test");
const assert = require("node:assert/strict");
const { createKeepAwake, TYPE } = require("../keepawake");

function fakeBlocker() {
  const started = new Map();
  let next = 1;
  return {
    started,
    start: (type) => { const id = next++; started.set(id, type); return id; },
    stop: (id) => started.delete(id),
    isStarted: (id) => started.has(id),
  };
}

test("uses prevent-app-suspension, the audio type from the powerSaveBlocker doc", () => {
  assert.equal(TYPE, "prevent-app-suspension");
});

test("on starts one blocker, off stops it", () => {
  const b = fakeBlocker();
  const k = createKeepAwake(b);
  assert.equal(k.set(true).active, true);
  assert.equal(b.started.size, 1);
  assert.equal(k.set(false).active, false);
  assert.equal(b.started.size, 0);
});

test("repeated on calls do not stack blockers", () => {
  const b = fakeBlocker();
  const k = createKeepAwake(b);
  k.set(true); k.set(true); k.set(true);
  assert.equal(b.started.size, 1);
});

test("off without on is a no-op", () => {
  const b = fakeBlocker();
  const k = createKeepAwake(b);
  assert.doesNotThrow(() => k.set(false));
  assert.equal(b.started.size, 0);
});

test("a blocker that was released by the system is started again on the next on", () => {
  const b = fakeBlocker();
  const k = createKeepAwake(b);
  k.set(true);
  b.started.clear(); // the system dropped it
  k.set(true);
  assert.equal(b.started.size, 1);
});
