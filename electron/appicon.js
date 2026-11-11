// App icon as an Electron nativeImage (https://www.electronjs.org/docs/latest/api/native-image).
// Windows loads the multi-size .ico (16-256 px, every size the doc lists for small and large icons); other platforms
// load icon.png, and nativeImage picks up icon@2x.png beside it for high-DPI screens on its own. createFromPath never
// throws on a missing or broken file, it returns an empty image, so callers get undefined instead and Electron falls
// back to its default icon rather than showing a blank one.
const path = require("node:path");

function iconPath(platform, dir = path.join(__dirname, "assets")) {
  return path.join(dir, platform === "win32" ? "icon.ico" : "icon.png");
}

function loadAppIcon({ nativeImage, platform, dir }) {
  const img = nativeImage.createFromPath(iconPath(platform, dir));
  return img && !img.isEmpty() ? img : undefined;
}

module.exports = { iconPath, loadAppIcon };
