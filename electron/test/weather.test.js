const { test } = require("node:test");
const assert = require("node:assert/strict");
const { labelFor, parseForecast, locate } = require("../weather");

test("labelFor maps WMO codes", () => {
  assert.equal(labelFor(0), "Clear");
  assert.equal(labelFor(3), "Overcast");
  assert.equal(labelFor(63), "Rain");
  assert.equal(labelFor(73), "Snow");
  assert.equal(labelFor(96), "Thunderstorm");
});

test("parseForecast reads the current conditions", () => {
  const w = parseForecast({ current: { temperature_2m: 58.4, weather_code: 2, is_day: 1 } }, "New York");
  assert.deepEqual(w, { place: "New York", temp_f: 58.4, code: 2, label: "Partly cloudy", is_day: true });
});

test("parseForecast refuses a forecast with no temperature", () => {
  assert.throws(() => parseForecast({ current: {} }, "x"), /temperature/);
  assert.throws(() => parseForecast({}, "x"), /current/);
});

test("a blank city is refused instead of looked up by IP", async () => {
  await assert.rejects(() => locate(""), /city is required/);
});
