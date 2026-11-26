// Page zoom from the keyboard: Ctrl/Cmd + '=' or '+' zooms in, '-' zooms out, '0' resets.
//
// Uses WebContents zoom level, the same zoom model as webFrame.setZoomLevel in the Electron docs: each level is 20%
// larger or smaller, and the levels are clamped to the range Electron allows by default (50% to 300%).
// Zoom applies to the app's own page. Guest pages in the sidebar keep their own zoom.

const MIN_LEVEL = -3; // 1.2^-3 ~ 58% (Electron's floor is about 50%)
const MAX_LEVEL = 5;  // 1.2^5 ~ 249% (Electron's ceiling is 300%)

function zoomLevelFor(current, action) {
  const c = Number(current) || 0;
  if (action === "in") return Math.min(MAX_LEVEL, c + 1);
  if (action === "out") return Math.max(MIN_LEVEL, c - 1);
  if (action === "reset") return 0;
  return c;
}

// Maps a before-input-event key to a zoom action, or null when the key is not a zoom shortcut.
function zoomActionFor(input) {
  if (!input || input.type !== "keyDown") return null;
  if (!(input.control || input.meta)) return null;
  if (input.alt) return null;
  const key = String(input.key || "");
  if (key === "=" || key === "+") return "in";
  if (key === "-" || key === "_") return "out";
  if (key === "0" || key === ")") return "reset";
  return null;
}

// `store` is optional: { load() -> level or null, save(level) }. With it the zoom survives a restart: the saved level
// is applied when the page finishes loading, and every change is written back. A store that throws is ignored.
function attachZoom(win, store = null) {
  const wc = win.webContents;
  if (store) {
    wc.on("did-finish-load", () => {
      try {
        const saved = Number(store.load());
        if (Number.isFinite(saved) && saved !== 0) wc.setZoomLevel(Math.max(MIN_LEVEL, Math.min(MAX_LEVEL, saved)));
      } catch { /* no saved zoom */ }
    });
  }
  wc.on("before-input-event", (event, input) => {
    const action = zoomActionFor(input);
    if (!action) return;
    event.preventDefault();
    const level = zoomLevelFor(wc.getZoomLevel(), action);
    wc.setZoomLevel(level);
    if (store) { try { store.save(level); } catch { /* zoom still applies this session */ } }
  });
}

// A zoom store backed by one small JSON file (the app passes a path under userData).
function fileZoomStore(file, fs = require("node:fs")) {
  return {
    load() { try { return JSON.parse(fs.readFileSync(file, "utf8")).level; } catch { return null; } },
    save(level) { fs.writeFileSync(file, JSON.stringify({ level })); },
  };
}

module.exports = { attachZoom, fileZoomStore, zoomLevelFor, zoomActionFor, MIN_LEVEL, MAX_LEVEL };
