const test = require("node:test");
const assert = require("node:assert/strict");
const { whileAwake } = require("../keep-awake");

function blocker() {
  const b = { live: new Set(), next: 1, types: [] };
  b.start = (t) => { b.types.push(t); const id = b.next++; b.live.add(id); return id; };
  b.isStarted = (id) => b.live.has(id);
  b.stop = (id) => b.live.delete(id);
  return b;
}

test("holds prevent-app-suspension while the job runs and releases after", async () => {
  const b = blocker(); let during = false;
  const out = await whileAwake(b, async () => { during = b.live.size === 1; return 42; });
  assert.equal(out, 42); assert.equal(during, true);
  assert.deepEqual(b.types, ["prevent-app-suspension"]); assert.equal(b.live.size, 0);
});

test("a failing job still releases the blocker and rethrows", async () => {
  const b = blocker();
  await assert.rejects(whileAwake(b, async () => { throw new Error("import failed"); }), /import failed/);
  assert.equal(b.live.size, 0);
});

test("if the blocker itself fails the job still runs", async () => {
  const bad = { start: () => { throw new Error("no power api"); }, isStarted: () => false, stop: () => assert.fail("nothing to stop") };
  assert.equal(await whileAwake(bad, async () => "ok"), "ok");
});
