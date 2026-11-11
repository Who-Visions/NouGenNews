const test = require("node:test");
const assert = require("node:assert/strict");
const fs = require("node:fs");
const os = require("node:os");
const path = require("node:path");
const { EventEmitter } = require("node:events");
const { clampInto, reachable, placeWindow, rescue, loadState, saveState, trackWindow } = require("../window-place");

// Two monitors: a 1920x1080 primary (taskbar 40 px) and a 1280x1024 to its right.
const PRIMARY = { id: 1, bounds: { x: 0, y: 0, width: 1920, height: 1080 }, workArea: { x: 0, y: 0, width: 1920, height: 1040 } };
const RIGHT = { id: 2, bounds: { x: 1920, y: 0, width: 1280, height: 1024 }, workArea: { x: 1920, y: 0, width: 1280, height: 984 } };
function fakeScreen(displays, cursor = { x: 10, y: 10 }) {
  const s = new EventEmitter();
  const centre = (d) => ({ x: d.workArea.x + d.workArea.width / 2, y: d.workArea.y + d.workArea.height / 2 });
  const dist = (p, d) => Math.hypot(p.x - centre(d).x, p.y - centre(d).y);
  const inside = (p, d) => p.x >= d.bounds.x && p.x < d.bounds.x + d.bounds.width && p.y >= d.bounds.y && p.y < d.bounds.y + d.bounds.height;
  s.displays = displays;
  s.getAllDisplays = () => s.displays;
  s.getPrimaryDisplay = () => s.displays[0];
  s.getCursorScreenPoint = () => cursor;
  s.getDisplayNearestPoint = (p) => s.displays.find((d) => inside(p, d)) || [...s.displays].sort((a, b) => dist(p, a) - dist(p, b))[0];
  s.getDisplayMatching = (r) => s.getDisplayNearestPoint({ x: r.x + r.width / 2, y: r.y + r.height / 2 });
  return s;
}

test("first launch: centred on the display under the cursor, sized to fit it", () => {
  const p = placeWindow({ saved: null, screen: fakeScreen([PRIMARY, RIGHT], { x: 2500, y: 300 }) });
  assert.equal(p.displayId, 2);
  assert.deepEqual(p.bounds, { x: 1920 + (1280 - 1280) / 2, y: Math.round((984 - 900) / 2), width: 1280, height: 900 });
  const q = placeWindow({ saved: null, screen: fakeScreen([PRIMARY, RIGHT], { x: 100, y: 100 }) });
  assert.deepEqual(q.bounds, { x: 240, y: 70, width: 1440, height: 900 });
});

test("restore: last bounds come back on the display they were on, maximized state too", () => {
  const saved = { x: 2000, y: 50, width: 1000, height: 700, maximized: true };
  const p = placeWindow({ saved, screen: fakeScreen([PRIMARY, RIGHT]) });
  assert.equal(p.displayId, 2); assert.deepEqual(p.bounds, { x: 2000, y: 50, width: 1000, height: 700 }); assert.equal(p.maximized, true);
});

test("restore after the setup changed: pulled inside the work area, shrunk if too big", () => {
  const s = fakeScreen([PRIMARY]);                                      // right monitor gone
  const p = placeWindow({ saved: { x: 2400, y: 100, width: 1200, height: 800 }, screen: s });
  assert.equal(p.displayId, 1);
  assert.ok(p.bounds.x + p.bounds.width <= 1920 && p.bounds.x >= 0);
  const big = clampInto({ x: -500, y: -50, width: 4000, height: 3000 }, PRIMARY.workArea);
  assert.deepEqual(big, { x: 0, y: 0, width: 1920, height: 1040 });
  const garbage = placeWindow({ saved: { x: "a", y: 0, width: 0, height: 10 }, screen: fakeScreen([PRIMARY]) });
  assert.equal(garbage.displayId, 1); assert.equal(garbage.maximized, false);   // bad state file -> fresh placement
});

test("rescue: a stranded window moves back; a reachable one is left alone", () => {
  const s = fakeScreen([PRIMARY, RIGHT]);
  assert.equal(rescue({ x: 2100, y: 100, width: 900, height: 600 }, s), null);
  s.displays = [PRIMARY];                                               // unplugged
  const to = rescue({ x: 2100, y: 100, width: 900, height: 600 }, s);
  assert.ok(to && to.x + to.width <= 1920 && reachable(to, s.displays));
  assert.equal(reachable({ x: 100, y: -500, width: 800, height: 520 }, [PRIMARY]), false);   // title bar above the screen
});

test("state file round-trips atomically and survives garbage", () => {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), "ngn-win-"));
  assert.equal(loadState(dir), null);
  assert.equal(saveState(dir, { x: 10, y: 20, width: 800, height: 600 }, true), true);
  assert.deepEqual(loadState(dir), { x: 10, y: 20, width: 800, height: 600, maximized: true });
  assert.equal(fs.existsSync(path.join(dir, "window-state.json.tmp")), false);
  fs.writeFileSync(path.join(dir, "window-state.json"), "{not json");
  assert.equal(loadState(dir), null);
  assert.equal(saveState(dir, { x: NaN, y: 0, width: 1, height: 1 }, false), false);
});

test("trackWindow: saves normal bounds on close and rescues on display changes", () => {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), "ngn-win-"));
  const s = fakeScreen([PRIMARY, RIGHT]);
  const win = new EventEmitter();
  let bounds = { x: 2100, y: 100, width: 900, height: 600 }, max = false;
  Object.assign(win, { isDestroyed: () => false, isMaximized: () => max, isFullScreen: () => false,
    getBounds: () => bounds, getNormalBounds: () => bounds, setBounds: (b) => { bounds = b; } });
  const off = trackWindow({ win, screen: s, userDir: dir });
  s.displays = [PRIMARY]; s.emit("display-removed");
  assert.ok(bounds.x + bounds.width <= 1920);
  win.emit("close");
  assert.deepEqual(loadState(dir), { ...bounds, maximized: false });
  off(); s.displays = []; s.emit("display-removed");                    // unhooked: no further moves
});
