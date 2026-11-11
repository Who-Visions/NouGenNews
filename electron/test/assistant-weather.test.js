const test = require("node:test");
const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");
const { makeTools, weatherText, TOOLS } = require("../assistant");

const REPORT = {
  place: "West Palm Beach", region: "Florida", updated: "2026-10-30T04:15",
  now: { temp_f: 77, label: "Partly cloudy", feels_f: 82, humidity: 84, wind_mph: 9, gust_mph: 14 },
  today: { high_f: 81, low_f: 76, precip_chance: 36, uv_max: 6 },
  hours: [{ time: "2026-10-30T05:00", temp_f: 77, label: "Rain", precip_chance: 40 }],
  days: [{}, { date: "2026-10-31", low_f: 76, high_f: 81, label: "Cloudy", precip_chance: 49 }],
  air: { aqi: 30, category: "Good" },
  alerts: [{ event: "Flood Watch", severity: "Moderate", areas: "Palm Beach", expires: "2026-10-31T06:00" }],
};

test("get_weather is a declared tool, described so the model reaches for it on any weather question", () => {
  const t = TOOLS.find((x) => x.function.name === "get_weather");
  assert.ok(t);
  assert.match(t.function.description, /ANY question about weather/);
  assert.deepEqual(t.function.parameters.required || [], []); // place is optional: no place means home
});

test("get_weather hands the model the service's numbers as plain facts, alerts included", async () => {
  const tools = makeTools({ wire: [], readArticle: async () => ({}), weather: async () => REPORT });
  const out = await tools.get_weather({});
  assert.match(out, /^Weather for West Palm Beach, Florida/);
  assert.match(out, /Now: 77F, Partly cloudy, feels like 82F, humidity 84%, wind 9 mph gusting 14/);
  assert.match(out, /Today: high 81F, low 76F, 36% chance of rain, peak UV 6/);
  assert.match(out, /Next hours: 05:00 77F Rain 40%/);
  assert.match(out, /Coming days: 2026-10-31 76-81F Cloudy 49%/);
  assert.match(out, /Air quality: US AQI 30 \(Good\)/);
  assert.match(out, /ALERTS: Flood Watch \(Moderate\) for Palm Beach until 2026-10-31T06:00/);
  assert.match(weatherText({ ...REPORT, alerts: [] }), /No active severe-weather alerts/);
});

test("a named place is passed through trimmed; a failing or absent service is reported, never invented", async () => {
  let asked = null;
  const tools = makeTools({ wire: [], readArticle: async () => ({}), weather: async (p) => { asked = p; return REPORT; } });
  await tools.get_weather({ place: "  Miami  " });
  assert.equal(asked, "Miami");
  await tools.get_weather({});
  assert.equal(asked, "");
  const down = makeTools({ wire: [], readArticle: async () => ({}), weather: async () => { throw new Error("no place named Zzzz"); } });
  assert.match(await down.get_weather({ place: "Zzzz" }), /The weather service could not answer: no place named Zzzz/);
  const none = makeTools({ wire: [], readArticle: async () => ({}) });
  assert.equal(await none.get_weather({}), "No weather data is available right now.");
});

test("the assistant's rules say weather, places and map facts never come from memory", () => {
  const src = fs.readFileSync(path.join(__dirname, "..", "assistant.js"), "utf8");
  assert.match(src, /Weather, places and map facts come ONLY from get_weather/);
});
