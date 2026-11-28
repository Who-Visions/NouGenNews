// Instant launch splash: a frameless BaseWindow holding an ImageView (no renderer process).
// Closed once the main window is ready to show. ImageView is experimental in Electron;
// if it is missing, the splash is skipped and the app starts normally.
const { BaseWindow, ImageView, nativeImage } = require("electron");
const path = require("node:path");

const SIZE = 256;
const SPLASH_BG = "#141414"; // NouGenAI obsidian token (matches renderer/styles/tokens.css)

function animateOpacity(win, from, to, durationMs, onDone) {
  if (!win || win.isDestroyed() || typeof win.setOpacity !== "function") {
    if (onDone) onDone();
    return;
  }
  const steps = Math.max(1, Math.round(durationMs / 16));
  let step = 0;
  win.setOpacity(from);
  const timer = setInterval(() => {
    if (win.isDestroyed()) {
      clearInterval(timer);
      return;
    }
    step += 1;
    const t = Math.min(1, step / steps);
    // Ease-out cubic for restrained, physical fade (matches canvas-anim-ts easeOutCubic).
    const eased = 1 - Math.pow(1 - t, 3);
    win.setOpacity(from + (to - from) * eased);
    if (t >= 1) {
      clearInterval(timer);
      if (onDone) onDone();
    }
  }, 16);
}

function showSplash() {
  if (typeof ImageView !== "function") return null;
  const image = nativeImage.createFromPath(path.join(__dirname, "assets", "splash.png"));
  if (image.isEmpty()) return null;
  // Center on the display under the cursor, where the main window will open.
  const { screen } = require("electron");
  const area = screen.getDisplayNearestPoint(screen.getCursorScreenPoint()).workArea;
  const win = new BaseWindow({
    width: SIZE,
    height: SIZE,
    x: Math.round(area.x + (area.width - SIZE) / 2),
    y: Math.round(area.y + (area.height - SIZE) / 2),
    frame: false,
    resizable: false,
    movable: false,
    skipTaskbar: true,
    alwaysOnTop: true,
    backgroundColor: SPLASH_BG,
  });
  const view = new ImageView();
  view.setImage(image);
  view.setBounds({ x: 0, y: 0, width: SIZE, height: SIZE });
  win.contentView.addChildView(view);
  animateOpacity(win, 0, 1, 180);
  return win;
}

/** Close the splash when `mainWin` is ready, or after a safety timeout. */
function attachSplash(mainWin, splash) {
  if (!splash) {
    mainWin.show();
    return;
  }
  let closed = false;
  const close = () => {
    if (closed) return;
    closed = true;
    if (!mainWin.isDestroyed() && !mainWin.isVisible()) mainWin.show();
    if (!splash.isDestroyed()) {
      animateOpacity(splash, 1, 0, 140, () => {
        if (!splash.isDestroyed()) splash.close();
      });
    }
  };
  mainWin.once("ready-to-show", close);
  setTimeout(close, Number(process.env.NOUGENNEWS_SPLASH_MAX_MS) || 15000);
}

module.exports = { showSplash, attachSplash };
