const { app, BrowserWindow, ipcMain, safeStorage, autoUpdater, Notification } = require("electron");
const path = require("node:path");
const { handlers } = require("./handlers");
const { handleSquirrelEvent, createUpdater } = require("./updater");

// Squirrel.Windows install/update/uninstall runs: make or remove the shortcuts and quit before any window opens.
const squirrelQuitting = handleSquirrelEvent({
  argv: process.argv, platform: process.platform, execPath: process.execPath,
  spawn: require("node:child_process").spawn, quit: () => app.quit(),
});

const DEV_URL = process.env.NOUGENNEWS_DEV_URL;

function isAppFrame(frame) {
  if (!frame || frame.parent) return false;
  return DEV_URL ? frame.url.startsWith(DEV_URL) : frame.url.startsWith("file:");
}

function createWindow() {
  const win = new BrowserWindow({
    width: 1440,
    height: 900,
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
  if (contents.getType() === "webview") {
    // A guest asking for a new window is denied; the link opens in place instead.
    contents.setWindowOpenHandler(({ url }) => {
      if (/^https?:\/\//i.test(url)) setImmediate(() => contents.loadURL(url));
      return { action: "deny" };
    });
  }
});

app.whenReady().then(() => {
  if (squirrelQuitting) return;
  require("./keys").applySaved({ userDir: app.getPath("userData"), crypt: safeStorage });
  ipcMain.handle("cmd", (e, cmd, args) => {
    // Key commands answer only the app's own top-level page.
    if (/^(keys|update)_/.test(String(cmd)) && !isAppFrame(e.senderFrame)) throw new Error("Not allowed");
    const fn = Object.prototype.hasOwnProperty.call(handlers, cmd) ? handlers[cmd] : null;
    if (!fn) throw new Error(`Unknown command: ${cmd}`);
    return fn(args);
  });
  createWindow();
  // Installed Windows builds update themselves from GitHub Releases (see updater.js); dev runs and other platforms skip.
  const updater = createUpdater({
    autoUpdater, app, platform: process.platform, argv: process.argv, env: process.env,
    log: (m) => console.log(`[update] ${m}`),
    onReady: (name) => {
      if (!Notification.isSupported()) return;
      const n = new Notification({ title: "NouGenNews update ready",
        body: `${name || "A new version"} is downloaded. Click to restart now, or it installs the next time you open the app.` });
      n.on("click", () => updater.restart());
      n.show();
    },
  });
  updater.start();
  handlers.update_status = () => updater.status();
  handlers.update_check = () => updater.check();
  handlers.update_restart = () => updater.restart();
  app.on("activate", () => { if (!BrowserWindow.getAllWindows().length) createWindow(); });
});

app.on("window-all-closed", () => { if (process.platform !== "darwin") app.quit(); });
