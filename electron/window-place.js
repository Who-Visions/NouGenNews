// Where the window opens and stays visible (Electron screen API: https://www.electronjs.org/docs/latest/api/screen).
// All rectangles are DIPs, the units screen.*.workArea and BrowserWindow bounds share.
//
//  - restore: the last position and size come back on the display they were on (getDisplayMatching), pulled inside
//    that display's work area if it changed (smaller monitor, taskbar moved, scaling changed);
//  - first launch: centred on the display under the cursor (getDisplayNearestPoint(getCursorScreenPoint())),
//    sized by window-size.js so it fits;
//  - rescue: after a monitor is unplugged or rescaled, a window that is no longer reachable moves onto the nearest
//    display instead of being stranded off-screen.
const fs = require("node:fs");
const path = require("node:path");
const { fitWindowSize, FLOOR } = require("./window-size");

const MIN_VISIBLE = 64;           // this much of the title strip must be on a work area to count as reachable

function intersect(a, b) {
  const x = Math.max(a.x, b.x), y = Math.max(a.y, b.y);
  const r = Math.min(a.x + a.width, b.x + b.width), btm = Math.min(a.y + a.height, b.y + b.height);
  return r > x && btm > y ? { x, y, width: r - x, height: btm - y } : null;
}

// Pull a rectangle fully inside a work area, shrinking it (not below FLOOR) if it is bigger than the area.
function clampInto(b, wa) {
  const width = Math.max(Math.min(FLOOR.width, wa.width), Math.min(b.width, wa.width));
  const height = Math.max(Math.min(FLOOR.height, wa.height), Math.min(b.height, wa.height));
  const x = Math.min(Math.max(b.x, wa.x), wa.x + wa.width - width);
  const y = Math.min(Math.max(b.y, wa.y), wa.y + wa.height - height);
  return { x: Math.round(x), y: Math.round(y), width: Math.round(width), height: Math.round(height) };
}

// True when the top strip of the window (where you grab it) is on some work area.
function reachable(b, displays) {
  const strip = { x: b.x, y: b.y, width: b.width, height: Math.min(32, b.height) };
  return displays.some((d) => { const i = intersect(strip, d.workArea); return i && i.width >= Math.min(MIN_VISIBLE, b.width); });
}

function validBounds(s) {
  return s && ["x", "y", "width", "height"].every((k) => Number.isFinite(s[k])) && s.width > 0 && s.height > 0;
}

// Initial bounds. screen is the Electron screen module (or a stand-in with the same four methods).
function placeWindow({ saved, screen }) {
  const displays = screen.getAllDisplays();
  if (validBounds(saved)) {
    const d = screen.getDisplayMatching(saved);
    if (d && d.workArea) return { bounds: clampInto(saved, d.workArea), maximized: !!saved.maximized, displayId: d.id };
  }
  const d = screen.getDisplayNearestPoint(screen.getCursorScreenPoint()) || screen.getPrimaryDisplay() || displays[0];
  const wa = d.workArea;
  const size = fitWindowSize({ width: wa.width, height: wa.height });
  return {
    bounds: { x: Math.round(wa.x + (wa.width - size.width) / 2), y: Math.round(wa.y + (wa.height - size.height) / 2), ...size },
    maximized: false, displayId: d.id,
  };
}

// After displays change: the bounds to move to, or null when the window is still reachable.
function rescue(bounds, screen) {
  const displays = screen.getAllDisplays();
  if (!displays.length || reachable(bounds, displays)) return null;
  const centre = { x: Math.round(bounds.x + bounds.width / 2), y: Math.round(bounds.y + bounds.height / 2) };
  const d = screen.getDisplayNearestPoint(centre) || screen.getPrimaryDisplay();
  return clampInto(bounds, d.workArea);
}

function stateFile(userDir) { return path.join(userDir, "window-state.json"); }

function loadState(userDir) {
  try { const s = JSON.parse(fs.readFileSync(stateFile(userDir), "utf8")); return validBounds(s) ? s : null; }
  catch { return null; }
}

function saveState(userDir, bounds, maximized) {
  if (!validBounds(bounds)) return false;
  try {
    fs.mkdirSync(userDir, { recursive: true });
    const tmp = stateFile(userDir) + ".tmp";
    fs.writeFileSync(tmp, JSON.stringify({ ...bounds, maximized: !!maximized }));
    fs.renameSync(tmp, stateFile(userDir));            // atomic: a crash mid-write never leaves half a file
    return true;
  } catch { return false; }
}

// Wires it all to a BrowserWindow: remembers bounds on close, rescues on display changes. Returns an unhook function.
function trackWindow({ win, screen, userDir }) {
  const save = () => { if (!win.isDestroyed()) saveState(userDir, win.getNormalBounds(), win.isMaximized()); };
  const check = () => {
    if (win.isDestroyed() || win.isMaximized() || win.isFullScreen()) return;
    const to = rescue(win.getBounds(), screen);
    if (to) win.setBounds(to);
  };
  win.on("close", save);
  screen.on("display-removed", check);
  screen.on("display-metrics-changed", check);
  return () => { screen.removeListener("display-removed", check); screen.removeListener("display-metrics-changed", check); };
}

module.exports = { intersect, clampInto, reachable, placeWindow, rescue, loadState, saveState, trackWindow, MIN_VISIBLE };
