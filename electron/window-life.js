// Window lifecycle on Windows (Electron BrowserWindow / app docs):
//  - identity: app.setAppUserModelId must equal the installer's appId or Windows shows notifications (the update
//    prompt included) under the wrong name or drops them; read from package.json "build.appId" so it cannot drift;
//  - one instance: the Start menu, the desktop shortcut and the post-update relaunch must not open a second app;
//    the second launch focuses the first window instead;
//  - crash recovery: a renderer that dies ("render-process-gone", not a clean exit) reloads, at most 3 times a minute
//    so a page that crashes on load does not loop forever; a hung page ("unresponsive" for 10 s) asks Wait/Reload;
//  - taskbar progress: long jobs show an indeterminate taskbar bar until they finish, success or failure.

const CRASH_LIMIT = 3, CRASH_WINDOW_MS = 60_000, HANG_ASK_MS = 10_000;

function appIdFromPackage(pkg) {
  return (pkg && pkg.build && pkg.build.appId) || "com.nougenai.nougennews";
}

function setIdentity(app, pkg) {
  if (process.platform === "win32" || app.__forceIdentity) app.setAppUserModelId(appIdFromPackage(pkg));
  return appIdFromPackage(pkg);
}

// Returns false when another instance already runs (the caller should quit). getWindow() returns the main window.
function singleInstance(app, getWindow) {
  if (!app.requestSingleInstanceLock()) return false;
  app.on("second-instance", () => {
    const w = getWindow();
    if (!w || w.isDestroyed()) return;
    if (w.isMinimized()) w.restore();
    w.show(); w.focus();
  });
  return true;
}

function guardRenderer(win, { dialog, log = () => {}, now = Date.now, setTimeout: later = setTimeout, clearTimeout: cancel = clearTimeout }) {
  const crashes = [];
  let hangTimer = null, asking = false;
  win.webContents.on("render-process-gone", (_e, details) => {
    const reason = (details && details.reason) || "unknown";
    log(`renderer gone: ${reason}`);
    if (reason === "clean-exit" || win.isDestroyed()) return;
    const t = now();
    while (crashes.length && t - crashes[0] > CRASH_WINDOW_MS) crashes.shift();
    crashes.push(t);
    if (crashes.length > CRASH_LIMIT) {
      log("renderer keeps crashing; not reloading again");
      dialog.showMessageBox(win, { type: "error", title: "NouGenNews", buttons: ["OK"],
        message: "The page keeps crashing.", detail: `Reason: ${reason}. Restart the app; if it keeps happening, report it.` });
      return;
    }
    win.webContents.reload();
  });
  win.on("unresponsive", () => {
    if (hangTimer || asking) return;
    hangTimer = later(async () => {
      hangTimer = null;
      if (win.isDestroyed()) return;
      asking = true;
      const { response } = await dialog.showMessageBox(win, { type: "warning", title: "NouGenNews", buttons: ["Wait", "Reload"],
        defaultId: 0, cancelId: 0, message: "The page is not responding.", detail: "Wait for it, or reload the page." });
      asking = false;
      if (response === 1 && !win.isDestroyed()) win.webContents.reload();
    }, HANG_ASK_MS);
  });
  win.on("responsive", () => { if (hangTimer) { cancel(hangTimer); hangTimer = null; } });
  return { crashes };
}

// Runs job() with an indeterminate taskbar progress bar on win; always clears it.
async function withTaskbarProgress(win, job) {
  const set = (v, mode) => { try { if (win && !win.isDestroyed()) win.setProgressBar(v, mode ? { mode } : undefined); } catch { /* window gone */ } };
  set(2, "indeterminate");
  try { return await job(); }
  finally { set(-1); }
}

module.exports = { appIdFromPackage, setIdentity, singleInstance, guardRenderer, withTaskbarProgress, CRASH_LIMIT, CRASH_WINDOW_MS, HANG_ASK_MS };
