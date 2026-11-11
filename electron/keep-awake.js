// Keeps the PC from sleeping while a long job runs (Electron powerSaveBlocker,
// https://www.electronjs.org/docs/latest/api/power-save-blocker). "prevent-app-suspension" keeps the system awake but
// lets the display turn off, which is all a background job needs. The blocker is always released in finally, so a
// failed or thrown job never leaves the PC pinned awake.
async function whileAwake(powerSaveBlocker, job, type = "prevent-app-suspension") {
  let id = -1;
  try { id = powerSaveBlocker.start(type); } catch { id = -1; }      // never let the blocker stop the job itself
  try { return await job(); }
  finally { if (id >= 0 && powerSaveBlocker.isStarted(id)) powerSaveBlocker.stop(id); }
}

module.exports = { whileAwake };
