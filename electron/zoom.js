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

function attachZoom(win) {
  win.webContents.on("before-input-event", (event, input) => {
    const action = zoomActionFor(input);
    if (!action) return;
    event.preventDefault();
    win.webContents.setZoomLevel(zoomLevelFor(win.webContents.getZoomLevel(), action));
  });
}

module.exports = { attachZoom, zoomLevelFor, zoomActionFor, MIN_LEVEL, MAX_LEVEL };
