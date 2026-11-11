const test = require("node:test");
const assert = require("node:assert/strict");
const { EventEmitter } = require("node:events");
const { allowed, lockSession, lockAllSessions } = require("../permissions");

function fakeSession() {
  const s = { req: null, check: null, device: null };
  s.setPermissionRequestHandler = (fn) => { s.req = fn; };
  s.setPermissionCheckHandler = (fn) => { s.check = fn; };
  s.setDevicePermissionHandler = (fn) => { s.device = fn; };
  return s;
}

test("only fullscreen is allowed; camera, mic, location, notifications, devices are denied", () => {
  assert.equal(allowed("fullscreen"), true);
  for (const p of ["media", "geolocation", "notifications", "midi", "midiSysex", "clipboard-read", "clipboard-sanitized-write",
                   "display-capture", "openExternal", "pointerLock", "hid", "serial", "usb", "idle-detection", "window-management", "unknown"])
    assert.equal(allowed(p), false, p);
});

test("a locked session answers requests, checks and device pickers by the policy", () => {
  const s = fakeSession(); const denied = [];
  assert.equal(lockSession(s, (m) => denied.push(m)), true);
  const answers = [];
  s.req({ getURL: () => "https://evil.example/article" }, "media", (ok) => answers.push(ok), { requestingUrl: "https://evil.example/article" });
  s.req(null, "fullscreen", (ok) => answers.push(ok), {});
  assert.deepEqual(answers, [false, true]);
  assert.match(denied[0], /denied media for https:\/\/evil\.example\/article/);
  assert.equal(s.check(null, "geolocation"), false);
  assert.equal(s.check(null, "fullscreen"), true);
  assert.equal(s.device({ deviceType: "hid" }), false);
  assert.equal(lockSession(s), false);                                  // idempotent
});

test("the default session and every later session (webview partitions) are locked", () => {
  const app = new EventEmitter(); const def = fakeSession(); const later = fakeSession();
  lockAllSessions({ app, session: { defaultSession: def } });
  assert.ok(def.req);
  app.emit("session-created", later);
  assert.ok(later.req && later.check && later.device);
});
