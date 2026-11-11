const test = require("node:test");
const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");
const { iconPath, loadAppIcon } = require("../appicon");
const cfg = require("../../forge.config.cjs");

const ASSETS = path.join(__dirname, "..", "assets");

test("Windows gets the multi-size .ico, other platforms the png (with @2x beside it)", () => {
  assert.match(iconPath("win32"), /assets[\\/]icon\.ico$/);
  assert.match(iconPath("darwin"), /assets[\\/]icon\.png$/);
  for (const f of ["icon.ico", "icon.png", "icon@2x.png"]) assert.ok(fs.existsSync(path.join(ASSETS, f)), f);
});

test("the .ico carries every Windows size the nativeImage docs list (16-256)", () => {
  const b = fs.readFileSync(path.join(ASSETS, "icon.ico"));
  assert.equal(b.readUInt16LE(2), 1);                       // ICO type
  const n = b.readUInt16LE(4), sizes = [];
  for (let i = 0; i < n; i++) { const w = b[6 + i * 16]; sizes.push(w === 0 ? 256 : w); }
  assert.deepEqual(sizes.sort((a, z) => a - z), [16, 20, 24, 32, 40, 48, 64, 256]);
  const png = fs.readFileSync(path.join(ASSETS, "icon@2x.png"));
  assert.equal(png.readUInt32BE(16), 512);                  // @2x really is twice the 256 px icon
});

test("a missing or broken icon gives undefined (Electron default), never an empty image", () => {
  const empty = { isEmpty: () => true }, ok = { isEmpty: () => false };
  let asked = "";
  const ni = (img) => ({ createFromPath: (p) => { asked = p; return img; } });
  assert.equal(loadAppIcon({ nativeImage: ni(empty), platform: "win32" }), undefined);
  assert.equal(loadAppIcon({ nativeImage: ni(null), platform: "win32" }), undefined);
  assert.equal(loadAppIcon({ nativeImage: ni(ok), platform: "win32" }), ok);
  assert.match(asked, /icon\.ico$/);
});

test("exe and installer use the same icon, and the installer ships it", () => {
  assert.match(cfg.packagerConfig.icon, /electron[\\/]assets[\\/]icon$/);
  const sq = cfg.makers.find((m) => m.name === "@electron-forge/maker-squirrel").config;
  assert.match(sq.setupIcon, /icon\.ico$/); assert.match(sq.iconUrl, /^https:\/\/raw\.githubusercontent\.com\//);
  assert.equal(cfg._keep("/electron/assets/icon.ico"), true);
});
