const { app, BrowserWindow, ipcMain, safeStorage, screen, dialog } = require("electron");
const { setIdentity, singleInstance, guardRenderer, withTaskbarProgress } = require("./window-life");

// Same identity as the installer (package.json build.appId) so Windows attributes notifications to the app.
setIdentity(app, require("../package.json"));
// One app: a second launch (shortcut, post-update relaunch) focuses the first window instead.
let mainWindow = null;
const primaryInstance = singleInstance(app, () => mainWindow);
if (!primaryInstance) app.quit();
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

function createWindow(splash) {
  const size = fitWindowSize(screen.getPrimaryDisplay().workAreaSize);
  const win = new BrowserWindow({
    width: size.width,
    height: size.height,
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
  // No pop-ups, ever: links open in the in-app sidebar.
  win.webContents.setWindowOpenHandler(() => ({ action: "deny" }));
  win.webContents.on("will-navigate", (e, url) => {
    if (!DEV_URL || !url.startsWith(DEV_URL)) e.preventDefault();
  });
  mainWindow = win;
  guardRenderer(win, { dialog, log: (m) => console.log(`[window] ${m}`) });
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
  if (!primaryInstance) return;
  // Long archive jobs show taskbar progress until they finish.
  for (const cmd of ["archive_promote", "archive_export"]) {
    const run = handlers[cmd];
    if (typeof run === "function") handlers[cmd] = (args) => withTaskbarProgress(mainWindow, () => run(args));
  }
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
