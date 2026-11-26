// Auto-update with electron-updater (works with the electron-builder NSIS installer).
// Source: NOUGEN_UPDATE_FEED_URL (a static folder holding latest.yml + the installer),
// else the `publish` block in package.json (GitHub Releases). Only runs in packaged builds.
const { app, dialog } = require("electron");

const DEFAULT_CHECK_MINUTES = 60;

function initAutoUpdater() {
  if (!app.isPackaged) return;
  let autoUpdater;
  try {
    ({ autoUpdater } = require("electron-updater"));
  } catch (err) {
    console.error("[updater] electron-updater not available:", err.message);
    return;
  }
  const feed = (process.env.NOUGEN_UPDATE_FEED_URL || "").trim();
  if (feed) autoUpdater.setFeedURL({ provider: "generic", url: feed });

  autoUpdater.on("error", (err) => console.error("[updater]", err && err.message));
  autoUpdater.on("update-downloaded", async (info) => {
    const { response } = await dialog.showMessageBox({
      type: "info",
      buttons: ["Restart", "Later"],
      title: "Update ready",
      message: `NouGenNews ${info.version} is ready`,
      detail: "Restart to apply the update.",
    });
    if (response === 0) autoUpdater.quitAndInstall();
  });

  const minutes = Number(process.env.NOUGEN_UPDATE_CHECK_MINUTES) || DEFAULT_CHECK_MINUTES;
  const check = () => autoUpdater.checkForUpdates().catch((e) => console.error("[updater]", e.message));
  check();
  setInterval(check, minutes * 60_000);
}

module.exports = { initAutoUpdater };
