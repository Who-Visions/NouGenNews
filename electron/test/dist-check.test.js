const { test } = require("node:test");
const assert = require("node:assert/strict");
const path = require("node:path");
const { referencedFiles, missingFiles } = require("../../scripts/dist-check.cjs");

const HTML = '<link rel="stylesheet" href="./assets/index-ABC.css"><script type="module" src="./assets/index-XYZ.js"></script><a href="https://x.test/a.js">x</a>';

test("referencedFiles lists the local assets index.html loads, once each", () => {
  assert.deepEqual(referencedFiles(HTML), ["assets/index-ABC.css", "assets/index-XYZ.js"]);
  assert.deepEqual(referencedFiles(HTML + HTML), ["assets/index-ABC.css", "assets/index-XYZ.js"]);
  assert.deepEqual(referencedFiles(""), []);
});

test("a complete build has nothing missing", () => {
  const have = new Set(["index.html", "assets/index-ABC.css", "assets/index-XYZ.js"].map((f) => path.join("/d", f)));
  assert.deepEqual(missingFiles("/d", { exists: (p) => have.has(p), read: () => HTML }), []);
});

test("a build with its assets gone reports them (the black-window case)", () => {
  const have = new Set([path.join("/d", "index.html")]);
  assert.deepEqual(missingFiles("/d", { exists: (p) => have.has(p), read: () => HTML }), ["assets/index-ABC.css", "assets/index-XYZ.js"]);
});

test("no index.html at all is reported, and an unreadable one too", () => {
  assert.deepEqual(missingFiles("/d", { exists: () => false }), ["index.html"]);
  assert.deepEqual(missingFiles("/d", { exists: () => true, read: () => { throw new Error("locked"); } }), ["index.html"]);
});
