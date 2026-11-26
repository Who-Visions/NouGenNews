// Keeps the system awake while read-aloud audio plays.
//
// Uses prevent-app-suspension, the type the powerSaveBlocker doc gives for audio playback: the system stays active
// and the screen may still turn off. A single boolean is enough because the reader runs one player at a time.
// Starting when already started, or stopping when not started, does nothing.

const TYPE = "prevent-app-suspension";

function createKeepAwake(blocker, type = TYPE) {
  let id = null;
  return {
    set(on) {
      if (on) {
        if (id === null || !blocker.isStarted(id)) id = blocker.start(type);
      } else if (id !== null) {
        blocker.stop(id);
        id = null;
      }
      return { active: id !== null };
    },
    active() { return id !== null; },
  };
}

let shared = null;
function setKeepAwake(on) {
  if (!shared) shared = createKeepAwake(require("electron").powerSaveBlocker);
  return shared.set(!!on);
}

module.exports = { createKeepAwake, setKeepAwake, TYPE };
