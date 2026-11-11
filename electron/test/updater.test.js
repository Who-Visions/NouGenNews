const test = require("node:test");
const assert = require("node:assert/strict");
const { setupAutoUpdate, FIRST_CHECK_DELAY_MS } = require("../updater");

function fakeUpdater() {
  const u = { feeds: [], checks: 0, listeners: {} };
  u.on = (name, fn) => { u.listeners[name] = fn; };
  u.setFeedURL = (o) => u.feeds.push(o);
  u.checkForUpdates = () => { u.checks++; };
  return u;
}
const packaged = { isPackaged: true };
const timers = () => {
  const calls = [];
  return { calls, setTimer: (fn, ms) => { calls.push({ kind: "timeout", ms, fn }); return { unref() {} }; },
    setIntervalFn: (fn, ms) => { calls.push({ kind: "interval", ms, fn }); return { unref() {} }; } };
};

test("does nothing in development (not packaged)", () => {
  const u = fakeUpdater();
  const r = setupAutoUpdate({ app: { isPackaged: false }, autoUpdater: u, feedUrl: "https://x/y", platform: "win32", ...timers() });
  assert.equal(r.enabled, false);
  assert.equal(u.feeds.length, 0);
});

test("does nothing without a feed URL", () => {
  const u = fakeUpdater();
  const r = setupAutoUpdate({ app: packaged, autoUpdater: u, feedUrl: "", platform: "win32", ...timers() });
  assert.equal(r.enabled, false);
  assert.equal(u.feeds.length, 0);
});

test("does nothing on Linux, where autoUpdater is not supported", () => {
  const u = fakeUpdater();
  const r = setupAutoUpdate({ app: packaged, autoUpdater: u, feedUrl: "https://x", platform: "linux", ...timers() });
  assert.equal(r.enabled, false);
});

test("packaged with a feed: sets the feed and schedules a delayed first check and a periodic one", () => {
  const u = fakeUpdater();
  const t = timers();
  const r = setupAutoUpdate({ app: packaged, autoUpdater: u, feedUrl: "https://example.test/feed", platform: "win32", argv: ["app"], ...t });
  assert.equal(r.enabled, true);
  assert.deepEqual(u.feeds, [{ url: "https://example.test/feed" }]);
  assert.equal(t.calls[0].kind, "timeout");
  assert.equal(t.calls[0].ms, 5000);
  assert.equal(t.calls[1].kind, "interval");
  t.calls[0].fn();
  assert.equal(u.checks, 1);
});

test("Squirrel first run waits longer before the first check", () => {
  const u = fakeUpdater();
  const t = timers();
  setupAutoUpdate({ app: packaged, autoUpdater: u, feedUrl: "https://x", platform: "win32", argv: ["app", "--squirrel-firstrun"], ...t });
  assert.equal(t.calls[0].ms, FIRST_CHECK_DELAY_MS);
});

test("errors are logged, not thrown into the main process", () => {
  const u = fakeUpdater();
  const logs = [];
  setupAutoUpdate({ app: packaged, autoUpdater: u, feedUrl: "https://x", platform: "darwin", argv: ["app"], log: (m) => logs.push(m), ...timers() });
  u.listeners.error(new Error("offline"));
  assert.match(logs[0], /update error: offline/);
});
