const test = require("node:test");
const assert = require("node:assert/strict");
const { EventEmitter } = require("node:events");
const path = require("node:path");
const { appIdFromPackage, setIdentity, singleInstance, guardRenderer, withTaskbarProgress, CRASH_LIMIT, HANG_ASK_MS } = require("../window-life");

function fakeWin() {
  const w = new EventEmitter();
  w.webContents = new EventEmitter(); w.reloads = 0; w.webContents.reload = () => { w.reloads += 1; };
  w.destroyed = false; w.isDestroyed = () => w.destroyed;
  w.minimized = true; w.isMinimized = () => w.minimized; w.restore = () => { w.minimized = false; };
  w.shown = 0; w.show = () => { w.shown += 1; }; w.focused = 0; w.focus = () => { w.focused += 1; };
  w.progress = []; w.setProgressBar = (v, o) => w.progress.push([v, o && o.mode]);
  return w;
}

test("identity comes from the installer's appId so notifications are attributed to the app", () => {
  const pkg = require(path.join(__dirname, "..", "..", "package.json"));
  assert.equal(appIdFromPackage(pkg), pkg.build.appId);
  assert.equal(appIdFromPackage({}), "com.nougenai.nougennews");
  let set = null;
  const app = { __forceIdentity: true, setAppUserModelId: (id) => { set = id; } };
  assert.equal(setIdentity(app, { build: { appId: "com.example.x" } }), "com.example.x");
  assert.equal(set, "com.example.x");
});

test("one instance: a second launch restores and focuses the existing window", () => {
  const app = new EventEmitter(); app.requestSingleInstanceLock = () => true;
  const w = fakeWin();
  assert.equal(singleInstance(app, () => w), true);
  app.emit("second-instance");
  assert.equal(w.minimized, false); assert.equal(w.shown, 1); assert.equal(w.focused, 1);
  const other = new EventEmitter(); other.requestSingleInstanceLock = () => false;
  assert.equal(singleInstance(other, () => w), false);                  // the caller quits
  const gone = new EventEmitter(); gone.requestSingleInstanceLock = () => true;
  singleInstance(gone, () => null); gone.emit("second-instance");       // no window yet: nothing breaks
});

test("a crashed renderer reloads, at most CRASH_LIMIT times a minute, then says so", async () => {
  const w = fakeWin(); let t = 0; const shown = [];
  guardRenderer(w, { dialog: { showMessageBox: async (_w, o) => { shown.push(o.message); return { response: 0 }; } }, now: () => t });
  w.webContents.emit("render-process-gone", {}, { reason: "clean-exit" });
  assert.equal(w.reloads, 0);                                           // a clean exit is not a crash
  for (let i = 0; i < CRASH_LIMIT; i++) { t += 1000; w.webContents.emit("render-process-gone", {}, { reason: "crashed" }); }
  assert.equal(w.reloads, CRASH_LIMIT);
  t += 1000; w.webContents.emit("render-process-gone", {}, { reason: "oom" });
  assert.equal(w.reloads, CRASH_LIMIT); assert.equal(shown.length, 1);  // stops looping, tells the reader
  t += 120_000; w.webContents.emit("render-process-gone", {}, { reason: "crashed" });
  assert.equal(w.reloads, CRASH_LIMIT + 1);                             // a minute later it recovers again
});

test("a hung page asks Wait/Reload after the grace period; recovering in time cancels it", async () => {
  const w = fakeWin(); const timers = []; let asked = 0;
  const fake = { setTimeout: (fn, ms) => { const id = { fn, ms, live: true }; timers.push(id); return id; }, clearTimeout: (id) => { id.live = false; } };
  guardRenderer(w, { dialog: { showMessageBox: async () => { asked += 1; return { response: 1 }; } }, ...fake });
  w.emit("unresponsive"); w.emit("unresponsive");
  assert.equal(timers.length, 1); assert.equal(timers[0].ms, HANG_ASK_MS);   // one pending question, not two
  w.emit("responsive"); assert.equal(timers[0].live, false);
  w.emit("unresponsive"); await timers[1].fn();
  assert.equal(asked, 1); assert.equal(w.reloads, 1);                  // Reload chosen
});

test("taskbar progress runs for the whole job and always clears, even on failure", async () => {
  const w = fakeWin();
  assert.equal(await withTaskbarProgress(w, async () => "done"), "done");
  assert.deepEqual(w.progress, [[2, "indeterminate"], [-1, undefined]]);
  await assert.rejects(withTaskbarProgress(w, async () => { throw new Error("import failed"); }), /import failed/);
  assert.deepEqual(w.progress.at(-1), [-1, undefined]);
  assert.equal(await withTaskbarProgress(null, async () => 1), 1);       // no window: job still runs
});
