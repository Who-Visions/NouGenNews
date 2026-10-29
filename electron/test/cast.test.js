const { test } = require("node:test");
const assert = require("node:assert/strict");
const { castScreen, WIN_K } = require("../cast");

test("off Windows there is no cast panel and nothing is run", async () => {
  let ran = false;
  const r = await castScreen("linux", () => { ran = true; });
  assert.equal(r.ok, false);
  assert.equal(ran, false);
  assert.match(r.reason, /no built-in cast panel/);
});

test("on Windows it runs one fixed PowerShell command that presses Win+K", async () => {
  let call = null;
  const r = await castScreen("win32", (cmd, args, opts, cb) => { call = { cmd, args, opts }; cb(null); });
  assert.deepEqual(r, { ok: true });
  assert.equal(call.cmd, "powershell.exe");
  assert.equal(call.args[3], WIN_K);
  assert.match(WIN_K, /keybd_event\(91, 0, 0/); // left Windows key down
  assert.match(WIN_K, /keybd_event\(75, 0, 0/); // K down
  assert.equal(call.opts.windowsHide, true);
});

test("a failing command is reported, not thrown", async () => {
  const r = await castScreen("win32", (c, a, o, cb) => cb(new Error("boom")));
  assert.equal(r.ok, false);
  assert.match(r.reason, /boom/);
});
