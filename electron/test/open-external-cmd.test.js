// The open_external command (sidebar "open in your browser") must only reach the OS shell with https URLs.
const test = require("node:test");
const assert = require("node:assert/strict");
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

test("open_external opens https URLs", async () => {
  opened.length = 0;
  assert.equal(await handlers.open_external({ url: "https://example.com/a?b=1" }), true);
  assert.deepEqual(opened, ["https://example.com/a?b=1"]);
});

test("open_external rejects http, other schemes, junk and over-long URLs", async () => {
  opened.length = 0;
  for (const url of [
    "http://example.com/",
    "file:///C:/Windows/System32/calc.exe",
    "javascript:alert(1)",
    "ms-settings:",
    "\\\\server\\share\\x.exe",
    "",
    undefined,
    "https://example.com/" + "a".repeat(2100),
  ]) {
    assert.equal(await handlers.open_external({ url }), false, String(url).slice(0, 40));
  }
  assert.equal(await handlers.open_external(), false);
  assert.deepEqual(opened, []);
});
