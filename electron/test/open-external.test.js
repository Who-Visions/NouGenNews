// open_external must only hand http(s) URLs of sane length to the OS shell.
const test = require("node:test");
const assert = require("node:assert");
const Module = require("node:module");

const opened = [];
const fakeElectron = {
  app: { getPath: () => require("node:os").tmpdir(), isPackaged: false },
  shell: { openExternal: (u) => { opened.push(u); return Promise.resolve(); }, openPath: () => Promise.resolve("") },
  safeStorage: {},
};
const realLoad = Module._load;
Module._load = function (request, ...rest) {
  if (request === "electron") return fakeElectron;
  return realLoad.call(this, request, ...rest);
};
const { handlers } = require("../handlers");
// handlers.js requires "electron" lazily inside each command, so the stub stays until the file ends.
test.after(() => { Module._load = realLoad; });

test("open_external opens http and https URLs", () => {
  opened.length = 0;
  assert.strictEqual(handlers.open_external({ url: "https://example.com/a?b=1" }), true);
  assert.strictEqual(handlers.open_external({ url: "http://example.com/" }), true);
  assert.deepStrictEqual(opened, ["https://example.com/a?b=1", "http://example.com/"]);
});

test("open_external rejects other schemes, junk and over-long URLs", () => {
  opened.length = 0;
  for (const url of [
    "file:///C:/Windows/System32/calc.exe",
    "javascript:alert(1)",
    "ms-settings:",
    "\\\\server\\share\\x.exe",
    "",
    undefined,
    "https://example.com/" + "a".repeat(2100),
  ]) {
    assert.strictEqual(handlers.open_external({ url }), false, String(url).slice(0, 40));
  }
  assert.strictEqual(handlers.open_external(), false);
  assert.deepStrictEqual(opened, []);
});
