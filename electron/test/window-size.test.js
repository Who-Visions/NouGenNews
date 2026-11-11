const test = require("node:test");
const assert = require("node:assert/strict");
const { fitWindowSize, PREFERRED, FLOOR } = require("../window-size");

test("a large display gets the preferred size", () => {
  assert.deepEqual(fitWindowSize({ width: 1920, height: 1040 }), PREFERRED);
});

test("a tablet-sized work area shrinks the window to fit", () => {
  assert.deepEqual(fitWindowSize({ width: 1024, height: 768 }), { width: 1024, height: 768 });
  assert.deepEqual(fitWindowSize({ width: 1280, height: 800 }), { width: 1280, height: 800 });
});

test("the window never drops below the floor", () => {
  assert.deepEqual(fitWindowSize({ width: 400, height: 300 }), FLOOR);
});

test("a missing work area falls back to the preferred size", () => {
  assert.deepEqual(fitWindowSize(undefined), PREFERRED);
  assert.deepEqual(fitWindowSize({}), PREFERRED);
});
