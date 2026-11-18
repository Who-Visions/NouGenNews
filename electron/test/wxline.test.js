const test = require("node:test");
const assert = require("node:assert/strict");
const { renderLine } = require("../wxline");

const R = { place: "Miami", now: { temp_f: 76.6, feels_f: 80, humidity: 70, wind_mph: 9.4, wind_dir: 0, code: 0, is_day: 1, label: "Clear", pressure_in: 29.9 }, today: { precip_chance: 20, uv_max: 6, sunrise: "2026-10-30T07:28", sunset: "2026-10-30T18:38" }, air: { aqi: 30 }, alerts: [{}] };

test("presets match the one-line shapes", () => {
  assert.equal(renderLine(R, "1"), "☀️ 77°F");
  assert.equal(renderLine(R, "3"), "Miami: ☀️ 77°F");
  assert.equal(renderLine(R, "4"), "Miami: ☀️ 77°F ↓9 mph");
});

test("custom formats fill every token and leave unknown ones alone", () => {
  assert.equal(renderLine(R, "%C %f %h %p %P %u %S-%s %a %A 100%% %z"), "Clear 80°F 70% 20% 29.9 in 6 7:28 AM-6:38 PM 30 1 100% %z");
});

test("missing values print ? and night clear sky is a moon", () => {
  assert.equal(renderLine({ now: {} }, "%l %t %w %c %a"), "? ? ? ? ?");
  assert.equal(renderLine({ now: { code: 0, is_day: false } }, "%c"), "🌙");
  assert.equal(renderLine(null, "%t"), "?");
});
