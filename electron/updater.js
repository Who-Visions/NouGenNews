// Auto-update wiring (Electron autoUpdater: Squirrel.Windows and Squirrel.Mac).
//
// Does nothing unless the app is packaged AND a feed URL is configured, so `electron .` in development never
// contacts an update server. The update feed is set once; checks run after a short delay, never during the
// Squirrel.Windows first-run lock (`--squirrel-firstrun`), where autoUpdater requests fail for a few seconds.
// A downloaded update is applied on the next start; this module never forces a restart.

const FIRST_CHECK_DELAY_MS = 10000;
const CHECK_EVERY_MS = 6 * 60 * 60 * 1000;

function setupAutoUpdate({
  app,
  autoUpdater,
  feedUrl = process.env.NOUGENNEWS_UPDATE_URL || "",
  log = () => {},
  setTimer = setTimeout,
  setIntervalFn = setInterval,
  argv = process.argv,
  platform = process.platform,
}) {
  if (!app || !app.isPackaged) return { enabled: false, reason: "not packaged" };
  if (!feedUrl) return { enabled: false, reason: "no feed URL" };
  if (platform !== "win32" && platform !== "darwin") return { enabled: false, reason: "unsupported platform" };

  autoUpdater.on("error", (e) => log(`update error: ${e && e.message}`));
  autoUpdater.on("update-available", () => log("update available; downloading"));
  autoUpdater.on("update-downloaded", () => log("update downloaded; applies on next start"));

  autoUpdater.setFeedURL({ url: feedUrl });

  const check = () => {
    try { autoUpdater.checkForUpdates(); } catch (e) { log(`update check failed: ${e && e.message}`); }
  };
  const firstRun = argv.some((a) => a === "--squirrel-firstrun");
  const delay = firstRun ? FIRST_CHECK_DELAY_MS : 5000;
  const first = setTimer(check, delay);
  if (first && first.unref) first.unref();
  const every = setIntervalFn(check, CHECK_EVERY_MS);
  if (every && every.unref) every.unref();
  return { enabled: true, feedUrl };
}

module.exports = { setupAutoUpdate, FIRST_CHECK_DELAY_MS, CHECK_EVERY_MS };
