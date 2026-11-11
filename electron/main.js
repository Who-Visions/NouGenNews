const { app, BrowserWindow, ipcMain, safeStorage, screen } = require("electron");
const { fitWindowSize } = require("./window-size");
const path = require("node:path");
const { handlers } = require("./handlers");
const { showSplash, attachSplash } = require("./splash");
const { initAutoUpdater } = require("./updater");
const { systemPreferences } = require("electron");

// Windows/macOS accent color for the renderer theme: window.<bridge>.cmd("system_accent").
handlers.system_accent = () => {
  try {
    const hex = systemPreferences.getAccentColor(); // "RRGGBBAA"
    return hex ? `#${hex.slice(0, 6)}` : null;
  } catch {
    return null; // not available on this platform
  }
};

const DEV_URL = process.env.NOUGENNEWS_DEV_URL;

function isAppFrame(frame) {
  if (!frame || frame.parent) return false;
  return DEV_URL ? frame.url.startsWith(DEV_URL) : frame.url.startsWith("file:");
}

// Size from fitWindowSize (window-size.js), placed centered on the display under the cursor.
function boundsOnCursorDisplay() {
  const area = screen.getDisplayNearestPoint(screen.getCursorScreenPoint()).workArea;
  const size = fitWindowSize(area);
  return {
    ...size,
    x: Math.round(area.x + Math.max(0, area.width - size.width) / 2),
    y: Math.round(area.y + Math.max(0, area.height - size.height) / 2),
  };
}

function createWindow(splash) {
  const win = new BrowserWindow({
    ...boundsOnCursorDisplay(),
    show: false,
    backgroundColor: "#000000",
    autoHideMenuBar: true,
    webPreferences: {
      preload: path.join(__dirname, "preload.js"),
      contextIsolation: true,
      sandbox: true,
      nodeIntegration: false,
      webviewTag: true,
    },
  });
  // If the window's display is unplugged or rescaled away, bring it back onto a visible display.
  const keepOnScreen = () => {
    if (win.isDestroyed()) return;
    const b = win.getBounds();
    const visible = screen.getAllDisplays().some(({ workArea: a }) =>
      b.x < a.x + a.width && b.x + b.width > a.x && b.y < a.y + a.height && b.y + b.height > a.y);
    if (!visible) win.setBounds(boundsOnCursorDisplay());
  };
  screen.on("display-removed", keepOnScreen);
  screen.on("display-metrics-changed", keepOnScreen);
  win.on("closed", () => {
    screen.removeListener("display-removed", keepOnScreen);
    screen.removeListener("display-metrics-changed", keepOnScreen);
  });
  // No pop-ups, ever: links open in the in-app sidebar.
  win.webContents.setWindowOpenHandler(() => ({ action: "deny" }));
  win.webContents.on("will-navigate", (e, url) => {
    if (!DEV_URL || !url.startsWith(DEV_URL)) e.preventDefault();
  });
  attachSplash(win, splash);
  if (DEV_URL) win.loadURL(DEV_URL);
  else win.loadFile(path.join(__dirname, "..", "dist", "index.html"));
}

// Guest pages in the sidebar get no preload, no Node, and only http(s).
app.on("web-contents-created", (_e, contents) => {
  contents.on("will-attach-webview", (event, webPreferences, params) => {
    delete webPreferences.preload;
    webPreferences.nodeIntegration = false;
    webPreferences.contextIsolation = true;
    webPreferences.sandbox = true;
    if (!/^https?:\/\//i.test(String(params.src || ""))) event.preventDefault();
  });
  // The attach check above runs once. Without this, a guest could navigate itself to file: or other non-web URLs
  // after it attaches. Applies to guest pages only; the app's own page is not a webview.
  contents.on("will-navigate", (event, url) => {
    if (contents.getType() === "webview" && !/^https?:\/\//i.test(String(url || ""))) event.preventDefault();
  });
  if (contents.getType() === "webview") {
    // A guest asking for a new window is denied; the link opens in place instead.
    contents.setWindowOpenHandler(({ url }) => {
      if (/^https?:\/\//i.test(url)) setImmediate(() => contents.loadURL(url));
      return { action: "deny" };
    });
  }
});

app.whenReady().then(() => {
  const splash = showSplash();
  require("./keys").applySaved({ userDir: app.getPath("userData"), crypt: safeStorage });
  ipcMain.handle("cmd", (e, cmd, args) => {
    // Key commands answer only the app's own top-level page.
    const appOnly = String(cmd).startsWith("keys_") || cmd === "open_external" || cmd === "archive_reveal";
    if (appOnly && !isAppFrame(e.senderFrame)) throw new Error("Not allowed");
    const fn = Object.prototype.hasOwnProperty.call(handlers, cmd) ? handlers[cmd] : null;
    if (!fn) throw new Error(`Unknown command: ${cmd}`);
    return fn(args);
  });
  createWindow(splash);
  initAutoUpdater();
  require("./ttsport").attachTtsPort({
    ipcMain,
    isAppFrame,
    synth: (args) => require("./kokoro").kokoroSynthFast(args),
  });
  app.on("activate", () => { if (!BrowserWindow.getAllWindows().length) createWindow(); });
});

app.on("window-all-closed", () => { if (process.platform !== "darwin") app.quit(); });
