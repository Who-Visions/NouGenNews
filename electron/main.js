const { app, BrowserWindow, ipcMain } = require("electron");
const path = require("node:path");
const { handlers } = require("./handlers");

const DEV_URL = process.env.NOUGENNEWS_DEV_URL;

function createWindow() {
  const win = new BrowserWindow({
    width: 1440,
    height: 900,
    backgroundColor: "#141414",
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
  ipcMain.handle("cmd", (_e, cmd, args) => {
    const fn = Object.prototype.hasOwnProperty.call(handlers, cmd) ? handlers[cmd] : null;
    if (!fn) throw new Error(`Unknown command: ${cmd}`);
    return fn(args);
  });
  createWindow();
  app.on("activate", () => { if (!BrowserWindow.getAllWindows().length) createWindow(); });
});

app.on("window-all-closed", () => { if (process.platform !== "darwin") app.quit(); });
