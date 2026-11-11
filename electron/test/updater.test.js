const test = require("node:test");
const assert = require("node:assert/strict");
const { EventEmitter } = require("node:events");
const { handleSquirrelEvent, createUpdater, DEFAULT_FEED, FIRST_CHECK_MS, EVERY_MS } = require("../updater");

function fakeUpdater() {
  const u = new EventEmitter();
  u.feeds = []; u.checks = 0; u.installs = 0;
  u.setFeedURL = (o) => u.feeds.push(o);
  u.checkForUpdates = () => { u.checks += 1; };
  u.quitAndInstall = () => { u.installs += 1; };
  return u;
}
function clock() {
  const c = { timers: [], intervals: [] };
  c.setTimeout = (fn, ms) => c.timers.push({ fn, ms });
  c.setInterval = (fn, ms) => c.intervals.push({ fn, ms });
  return c;
}
const packaged = { isPackaged: true };

test("dev runs and non-Windows builds never touch the updater", () => {
  const u = fakeUpdater();
  const dev = createUpdater({ autoUpdater: u, app: { isPackaged: false }, platform: "win32", argv: [] });
  assert.equal(dev.start(), false); assert.equal(dev.status().phase, "dev");
  const mac = createUpdater({ autoUpdater: u, app: packaged, platform: "darwin", argv: [] });
  assert.equal(mac.start(), false); assert.equal(mac.status().phase, "unsupported");
  assert.equal(u.feeds.length, 0); assert.equal(u.checks, 0);
});

test("feed is the repo's GitHub Releases unless overridden", () => {
  const u = fakeUpdater(), c = clock();
  createUpdater({ autoUpdater: u, app: packaged, platform: "win32", argv: [], ...c }).start();
  assert.deepEqual(u.feeds, [{ url: DEFAULT_FEED }]);
  assert.match(DEFAULT_FEED, /^https:\/\/github\.com\/Who-Visions\/NouGenNews\/releases\/latest\/download$/);
  const u2 = fakeUpdater();
  createUpdater({ autoUpdater: u2, app: packaged, platform: "win32", argv: [], env: { NOUGENNEWS_UPDATE_FEED: "https://mirror.test/feed" }, ...clock() }).start();
  assert.deepEqual(u2.feeds, [{ url: "https://mirror.test/feed" }]);
});

test("first check waits for the app to settle, then repeats every four hours", () => {
  const u = fakeUpdater(), c = clock();
  createUpdater({ autoUpdater: u, app: packaged, platform: "win32", argv: ["app.exe"], ...c }).start();
  assert.equal(u.checks, 0);
  assert.equal(c.timers[0].ms, FIRST_CHECK_MS); assert.equal(c.intervals[0].ms, EVERY_MS);
  c.timers[0].fn(); assert.equal(u.checks, 1);
});

test("no check on the first run after install (Squirrel holds a file lock)", () => {
  const u = fakeUpdater(), c = clock();
  const up = createUpdater({ autoUpdater: u, app: packaged, platform: "win32", argv: ["app.exe", "--squirrel-firstrun"], ...c });
  up.start();
  assert.equal(c.timers.length, 0); assert.equal(up.status().phase, "first-run");
  assert.equal(c.intervals.length, 1);                  // later periodic checks still happen
});

test("one check at a time: a second call while one is in flight does not download twice", () => {
  const u = fakeUpdater();
  const up = createUpdater({ autoUpdater: u, app: packaged, platform: "win32", argv: [], ...clock() });
  up.start();
  assert.equal(up.check(), true); u.emit("checking-for-update"); u.emit("update-available");
  assert.equal(up.check(), false); assert.equal(u.checks, 1);
  assert.equal(up.status().phase, "downloading");
  u.emit("update-not-available");                        // finished: a new check is allowed again
  assert.equal(up.check(), true); assert.equal(u.checks, 2);
  u.emit("error", new Error("offline"));
  assert.equal(up.status().phase, "error"); assert.equal(up.status().error, "offline");
  assert.equal(up.check(), true);                        // an error frees the slot too
});

test("restart only after update-downloaded; ready notifies and stops further checks", () => {
  const u = fakeUpdater(); let ready = null, quitting = 0;
  const up = createUpdater({ autoUpdater: u, app: packaged, platform: "win32", argv: [], ...clock(),
                             onReady: (n) => { ready = n; }, onBeforeQuit: () => { quitting += 1; } });
  up.start();
  assert.equal(up.restart(), false); assert.equal(u.installs, 0);
  up.check(); u.emit("update-downloaded", {}, "", "NouGenNews 0.2.0");
  assert.equal(ready, "NouGenNews 0.2.0"); assert.equal(up.status().phase, "ready");
  assert.equal(up.check(), false);                       // nothing to fetch until the restart
  assert.equal(up.restart(), true); assert.equal(u.installs, 1);
  u.emit("before-quit-for-update"); assert.equal(quitting, 1);
});

test("Squirrel install/update/uninstall make or remove shortcuts and quit; normal and first runs carry on", () => {
  const calls = []; let quits = 0;
  const spawn = (exe, args) => { calls.push({ exe, args }); const e = new EventEmitter(); setImmediate(() => e.emit("close")); return e; };
  const base = { platform: "win32", execPath: "C:\\Users\\u\\AppData\\Local\\NouGenNews\\app-0.2.0\\NouGenNews.exe", spawn, quit: () => { quits += 1; } };
  assert.equal(handleSquirrelEvent({ ...base, argv: ["x", "--squirrel-install"] }), true);
  assert.deepEqual(calls[0].args, ["--createShortcut", "NouGenNews.exe"]);
  assert.match(calls[0].exe, /NouGenNews[\\/]Update\.exe$/);
  assert.equal(handleSquirrelEvent({ ...base, argv: ["x", "--squirrel-updated"] }), true);
  assert.equal(handleSquirrelEvent({ ...base, argv: ["x", "--squirrel-uninstall"] }), true);
  assert.deepEqual(calls[2].args, ["--removeShortcut", "NouGenNews.exe"]);
  assert.equal(handleSquirrelEvent({ ...base, argv: ["x", "--squirrel-obsolete"] }), true);
  assert.equal(handleSquirrelEvent({ ...base, argv: ["x", "--squirrel-firstrun"] }), false);
  assert.equal(handleSquirrelEvent({ ...base, argv: ["x"] }), false);
  assert.equal(handleSquirrelEvent({ ...base, platform: "darwin", argv: ["x", "--squirrel-install"] }), false);
  assert.ok(quits >= 1);                                 // obsolete quits synchronously
});
