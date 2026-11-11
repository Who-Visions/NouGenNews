const test = require("node:test");
const assert = require("node:assert/strict");
const cfg = require("../../forge.config.cjs");

test("installer allowlist ships the desktop app and its runtime modules only", () => {
  const keep = cfg._keep;
  for (const p of ["", "/package.json", "/electron", "/electron/main.js", "/electron/updater.js", "/dist/index.html",
                   "/node_modules", "/node_modules/sql.js/dist/sql-wasm.js", "/node_modules/nougen-shards-lite/index.js"])
    assert.equal(keep(p), true, p);
  for (const p of ["/electron/test/updater.test.js", "/node_modules/next/package.json", "/node_modules/@playwright/test",
                   "/node_modules/firebase-admin", "/src/app/page.tsx", "/renderer/main.tsx", "/scripts/start.cjs",
                   "/scripts/resolve-key.cjs", "/.env", "/docs/x.md"])
    assert.equal(keep(p), false, p);
});

test("Squirrel maker builds the setup and the GitHub publisher only makes drafts", () => {
  const maker = cfg.makers.find((m) => m.name === "@electron-forge/maker-squirrel");
  assert.ok(maker); assert.equal(maker.config.setupExe, "NouGenNewsSetup.exe");
  assert.ok(maker.config.authors && maker.config.description);   // Squirrel refuses to build without both
  const pub = cfg.publishers.find((p) => p.name === "@electron-forge/publisher-github");
  assert.deepEqual(pub.config.repository, { owner: "Who-Visions", name: "NouGenNews" });
  assert.equal(pub.config.draft, true);                         // a person publishes; no automatic release to users
});
