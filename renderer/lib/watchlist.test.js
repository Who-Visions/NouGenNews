import { test } from "node:test";
import assert from "node:assert/strict";
import { addPlace, removePlace, movePlace, hasPlace, MAX_PLACES } from "./watchlist.js";

const A = { city: "Miami", region: "Florida" };
const B = { city: "Denver", region: "" };

test("adding ignores blanks and duplicates, whatever the case, and stops at the limit", () => {
  let l = addPlace([], A);
  assert.equal(addPlace(l, { city: " miami ", region: "FLORIDA" }).length, 1);
  assert.equal(addPlace(l, { city: "  " }).length, 1);
  assert.ok(hasPlace(l, A));
  for (let i = 0; i < 30; i += 1) l = addPlace(l, { city: `C${i}` });
  assert.equal(l.length, MAX_PLACES);
});

test("the same city name in two regions stays two places", () => {
  assert.equal(addPlace([A], { city: "Miami", region: "Oklahoma" }).length, 2);
});

test("remove and move change only what they should; moving past an end does nothing", () => {
  const l = [A, B];
  assert.deepEqual(removePlace(l, A), [B]);
  assert.deepEqual(movePlace(l, B, -1), [B, A]);
  assert.equal(movePlace(l, A, -1), l);
  assert.equal(movePlace(l, { city: "None" }, 1), l);
});
