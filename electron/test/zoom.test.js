const test = require("node:test");
const assert = require("node:assert/strict");
const { attachZoom, zoomLevelFor, zoomActionFor, MIN_LEVEL, MAX_LEVEL } = require("../zoom");

test("zoom levels step by one and clamp to the range", () => {
  assert.equal(zoomLevelFor(0, "in"), 1);
  assert.equal(zoomLevelFor(0, "out"), -1);
  assert.equal(zoomLevelFor(MAX_LEVEL, "in"), MAX_LEVEL);
  assert.equal(zoomLevelFor(MIN_LEVEL, "out"), MIN_LEVEL);
  assert.equal(zoomLevelFor(4, "reset"), 0);
  assert.equal(zoomLevelFor(2, "bogus"), 2);
  assert.equal(zoomLevelFor(undefined, "in"), 1);
});

test("Ctrl/Cmd with = or + zooms in; - zooms out; 0 resets", () => {
  assert.equal(zoomActionFor({ type: "keyDown", key: "=", control: true }), "in");
  assert.equal(zoomActionFor({ type: "keyDown", key: "+", meta: true }), "in");
  assert.equal(zoomActionFor({ type: "keyDown", key: "-", control: true }), "out");
  assert.equal(zoomActionFor({ type: "keyDown", key: "0", control: true }), "reset");
});

test("keys without the modifier, key-up events, and Alt combos are not zoom", () => {
  assert.equal(zoomActionFor({ type: "keyDown", key: "=" }), null);
  assert.equal(zoomActionFor({ type: "keyUp", key: "=", control: true }), null);
  assert.equal(zoomActionFor({ type: "keyDown", key: "=", control: true, alt: true }), null);
  assert.equal(zoomActionFor({ type: "keyDown", key: "a", control: true }), null);
  assert.equal(zoomActionFor(null), null);
});

test("attachZoom handles the key, prevents the default, and sets the clamped level", () => {
  const listeners = {};
  let level = 0;
  const win = {
    webContents: {
      on: (name, fn) => { listeners[name] = fn; },
      getZoomLevel: () => level,
      setZoomLevel: (l) => { level = l; },
    },
  };
  attachZoom(win);
  let prevented = 0;
  const ev = { preventDefault: () => { prevented++; } };
  listeners["before-input-event"](ev, { type: "keyDown", key: "=", control: true });
  assert.equal(level, 1);
  listeners["before-input-event"](ev, { type: "keyDown", key: "-", control: true });
  listeners["before-input-event"](ev, { type: "keyDown", key: "-", control: true });
  assert.equal(level, -1);
  assert.equal(prevented, 3);
  // A non-zoom key is left alone.
  listeners["before-input-event"](ev, { type: "keyDown", key: "a", control: true });
  assert.equal(prevented, 3);
});
