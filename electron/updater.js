// Auto-update for the installed Windows app (Squirrel.Windows, per https://www.electronjs.org/docs/latest/api/auto-updater).
//
// Updates come from this repo's own GitHub Releases: Squirrel only needs a folder URL that serves RELEASES and the
// .nupkg files, and https://github.com/<owner>/<repo>/releases/latest/download/<file> is exactly that. No update
// server, no third-party service. NOUGENNEWS_UPDATE_FEED overrides the feed (a test feed, a mirror).
//
// Rules from the Electron docs, each enforced here:
//  - only an installed (packaged) Windows build updates; macOS needs a signed build, Linux is not supported;
//  - never check on the first run after install (--squirrel-firstrun): Squirrel holds a file lock for a few seconds;
//  - one check at a time: checkForUpdates() twice downloads the update twice;
//  - quitAndInstall() only after update-downloaded; cleanup goes in before-quit-for-update (before-quit does not fire).

const path = require("node:path");

const DEFAULT_FEED = "https://github.com/Who-Visions/NouGenNews/releases/latest/download";
const FIRST_CHECK_MS = 30 * 1000;            // let the app settle before the first check
const EVERY_MS = 4 * 60 * 60 * 1000;         // then every four hours

// Squirrel.Windows runs the app with one of these on install/update/uninstall. Make or remove the shortcuts, then
// quit: the app must not open a window during these events. Returns true when the caller should quit now.
function handleSquirrelEvent({ argv, platform, execPath, spawn, quit }) {
  if (platform !== "win32") return false;
  const cmd = argv[1];
  if (!cmd || !cmd.startsWith("--squirrel-")) return false;
  const updateExe = path.resolve(path.dirname(execPath), "..", "Update.exe");
  const exeName = path.basename(execPath);
  const run = (args) => { try { spawn(updateExe, args, { detached: true }).on("close", quit); } catch { quit(); } };
  if (cmd === "--squirrel-install" || cmd === "--squirrel-updated") { run(["--createShortcut", exeName]); return true; }
  if (cmd === "--squirrel-uninstall") { run(["--removeShortcut", exeName]); return true; }
  if (cmd === "--squirrel-obsolete") { quit(); return true; }
  return false;                                // --squirrel-firstrun: carry on starting normally
}

function createUpdater({ autoUpdater, app, platform, argv, env = {}, setTimeout: later = setTimeout,
                         setInterval: every = setInterval, log = () => {}, onReady = () => {}, onBeforeQuit = () => {} }) {
  const state = { phase: "idle", error: "", releaseName: "", feed: env.NOUGENNEWS_UPDATE_FEED || DEFAULT_FEED, checks: 0 };
  let busy = false;

  function status() { return { ...state }; }

  if (!app.isPackaged) { state.phase = "dev"; return { status, check: () => false, restart: () => false, start: () => false }; }
  if (platform !== "win32") { state.phase = "unsupported"; return { status, check: () => false, restart: () => false, start: () => false }; }

  autoUpdater.on("checking-for-update", () => { state.phase = "checking"; });
  autoUpdater.on("update-available", () => { state.phase = "downloading"; });   // Squirrel downloads on its own
  autoUpdater.on("update-not-available", () => { state.phase = "current"; busy = false; });
  autoUpdater.on("update-downloaded", (_e, _notes, releaseName) => {
    state.phase = "ready"; state.releaseName = releaseName || ""; busy = false;
    log(`update ${state.releaseName || "(unnamed)"} downloaded; applies on restart`);
    onReady(state.releaseName);
  });
  autoUpdater.on("error", (err) => {
    state.phase = "error"; state.error = String((err && err.message) || err); busy = false;
    log(`update check failed: ${state.error}`);
  });
  autoUpdater.on("before-quit-for-update", () => onBeforeQuit());

  function check() {
    if (busy || state.phase === "ready") return false;     // in flight, or already waiting for a restart
    busy = true; state.checks += 1;
    try { autoUpdater.checkForUpdates(); return true; }
    catch (err) { state.phase = "error"; state.error = String((err && err.message) || err); busy = false; return false; }
  }

  function restart() {
    if (state.phase !== "ready") return false;
    autoUpdater.quitAndInstall();
    return true;
  }

  function start() {
    try { autoUpdater.setFeedURL({ url: state.feed }); }
    catch (err) { state.phase = "error"; state.error = String((err && err.message) || err); return false; }
    if (argv.includes("--squirrel-firstrun")) { state.phase = "first-run"; log("first run after install: skipping the update check"); }
    else later(check, FIRST_CHECK_MS);
    every(check, EVERY_MS);
    return true;
  }

  return { status, check, restart, start };
}

module.exports = { handleSquirrelEvent, createUpdater, DEFAULT_FEED, FIRST_CHECK_MS, EVERY_MS };
