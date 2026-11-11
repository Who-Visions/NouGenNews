// Instant launch splash: a frameless BaseWindow holding an ImageView (no renderer process).
// Closed once the main window is ready to show. ImageView is experimental in Electron;
// if it is missing, the splash is skipped and the app starts normally.
const { BaseWindow, ImageView, nativeImage } = require("electron");
const path = require("node:path");

const SIZE = 256;

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
    backgroundColor: "#000000",
  });
  const view = new ImageView();
  view.setImage(image);
  view.setBounds({ x: 0, y: 0, width: SIZE, height: SIZE });
  win.contentView.addChildView(view);
  return win;
}

/** Close the splash when `mainWin` is ready, or after a safety timeout. */
function attachSplash(mainWin, splash) {
  if (!splash) {
    mainWin.show();
    return;
  }
  const close = () => {
    if (!splash.isDestroyed()) splash.close();
    if (!mainWin.isDestroyed() && !mainWin.isVisible()) mainWin.show();
  };
  mainWin.once("ready-to-show", close);
  setTimeout(close, Number(process.env.NOUGENNEWS_SPLASH_MAX_MS) || 15000);
}

module.exports = { showSplash, attachSplash };
