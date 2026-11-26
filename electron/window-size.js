// Window size that fits the primary display's work area (screen.getPrimaryDisplay().workAreaSize, in DIPs).
//
// The window used to open at a fixed 1440x900, which overflows smaller displays such as tablets. The size is capped
// at the preferred size and never drops below a floor, so the layout keeps a usable minimum on very small screens.

const PREFERRED = { width: 1440, height: 900 };
const FLOOR = { width: 640, height: 480 };

function fitWindowSize(workArea, preferred = PREFERRED) {
  const aw = Number(workArea && workArea.width) || preferred.width;
  const ah = Number(workArea && workArea.height) || preferred.height;
  const width = Math.max(FLOOR.width, Math.min(preferred.width, aw));
  const height = Math.max(FLOOR.height, Math.min(preferred.height, ah));
  return { width, height };
}

module.exports = { fitWindowSize, PREFERRED, FLOOR };
