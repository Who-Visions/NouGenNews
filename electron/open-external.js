// Opening a link in the reader's browser, per the Electron shell docs and security checklist #15.
// shell.openExternal returns a Promise: a failed launch (no default browser, a policy block) used to become an
// unhandled rejection while the command still answered true. This awaits it and reports the real outcome. Only
// https addresses are ever opened; callers pass fixed or app-owned URLs, never anything a page supplied.
async function openExternalSafe(url, shell = require("electron").shell) {
  if (typeof url !== "string" || !/^https:\/\/[^\s]+$/i.test(url) || url.length > 2081) return false;   // 2081: Windows limit
  try { await shell.openExternal(url); return true; }
  catch { return false; }
}

module.exports = { openExternalSafe };
