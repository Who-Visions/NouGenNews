const { app, BrowserWindow, ipcMain, safeStorage, systemPreferences } = require("electron");
const path = require("node:path");
const { handlers, assistantOptions } = require("./handlers");
const { serveAssistantPort } = require("./assistant-port");

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
  require("./keys").applySaved({ userDir: app.getPath("userData"), crypt: safeStorage });
  ipcMain.handle("cmd", (e, cmd, args) => {
    // Key commands answer only the app's own top-level page.
    if (String(cmd).startsWith("keys_") && !isAppFrame(e.senderFrame)) throw new Error("Not allowed");
    const fn = Object.prototype.hasOwnProperty.call(handlers, cmd) ? handlers[cmd] : null;
    if (!fn) throw new Error(`Unknown command: ${cmd}`);
    return fn(args);
  });
  require("./ttsport").attachTtsPort({
    ipcMain,
    isAppFrame,
    synth: (args) => require("./kokoro").kokoroSynthFast(args),
  });
  // Streaming assistant: the page sends one end of a MessageChannel with its question, and the answer streams back
  // over it step by step (electron/assistant-port.js). Only the app's own page may open one.
  ipcMain.on("assistant_port", (e, args) => {
    const [port] = e.ports || [];
    if (!port) return;
    if (!isAppFrame(e.senderFrame)) { port.close(); return; }
    serveAssistantPort(port, assistantOptions(args && typeof args === "object" ? args : {}), { ask: require("./assistant").ask });
  });
  // The reader changed the Windows accent color: pages that follow it repaint (Settings > Use the Windows accent color).
  if (typeof systemPreferences.on === "function" && process.platform !== "linux") {
    systemPreferences.on("accent-color-changed", (_e, color) => {
      const osui = require("./osui");
      const hex = osui.readableOnDark(osui.accentHex(color));
      if (hex) for (const w of BrowserWindow.getAllWindows()) w.webContents.send("os-accent", hex);
    });
  }
  createWindow();
  app.on("activate", () => { if (!BrowserWindow.getAllWindows().length) createWindow(); });
});

app.on("window-all-closed", () => { if (process.platform !== "darwin") app.quit(); });
