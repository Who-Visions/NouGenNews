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

const { parseReport, aqiCategory, weatherReport } = require("../weather");

const FORECAST = {
  timezone: "America/New_York",
  current: { time: "2026-10-30T04:00", temperature_2m: 77.2, apparent_temperature: 80.6, relative_humidity_2m: 81, weather_code: 3, is_day: 0, wind_speed_10m: 9.4, wind_gusts_10m: 17.2, precipitation: 0, uv_index: 0 },
  hourly: {
    time: ["2026-10-30T02:00", "2026-10-30T03:00", "2026-10-30T04:00", "2026-10-30T05:00", "2026-10-30T06:00", "2026-10-30T07:00"],
    temperature_2m: [78, 77.6, 77.2, 77, 77.4, 78.9], precipitation_probability: [10, 10, 20, 30, null, 60], weather_code: [3, 3, 3, 61, 61, 0], is_day: [0, 0, 0, 0, 1, 1],
  },
  daily: {
    time: ["2026-10-30", "2026-10-31"], weather_code: [61, 0], temperature_2m_max: [84.4, 86], temperature_2m_min: [74.1, 73],
    precipitation_probability_max: [60, 5], precipitation_sum: [0.214, 0], uv_index_max: [7.46, 8], wind_speed_10m_max: [15.2, 12],
    sunrise: ["2026-10-30T07:07", "2026-10-31T07:08"], sunset: ["2026-10-30T18:08", "2026-10-31T18:07"],
  },
};
const AIR = { current: { us_aqi: 42, pm2_5: 8.31 } };

test("a report has now, today, hours from now on, days, and air quality, in rounded US units", () => {
  const r = parseReport(FORECAST, AIR, "West Palm Beach", "Florida");
  assert.deepEqual([r.place, r.region, r.timezone], ["West Palm Beach", "Florida", "America/New_York"]);
  assert.deepEqual([r.now.temp_f, r.now.feels_f, r.now.humidity, r.now.wind_mph, r.now.gust_mph, r.now.label, r.now.is_day], [77, 81, 81, 9, 17, "Overcast", false]);
  assert.equal(r.hours[0].time, "2026-10-30T04:00"); // the hours before now are dropped
  assert.equal(r.hours.length, 4);
  assert.deepEqual([r.hours[1].label, r.hours[1].precip_chance, r.hours[2].precip_chance], ["Rain", 30, null]);
  assert.deepEqual([r.today.high_f, r.today.low_f, r.today.precip_chance, r.today.precip_in, r.today.uv_max, r.today.label], [84, 74, 60, 0.21, 7.5, "Rain"]);
  assert.equal(r.days.length, 2);
  assert.deepEqual([r.air.aqi, r.air.category, r.air.pm25], [42, "Good", 8.3]);
});

test("missing air quality or null readings leave nulls, not errors; no current conditions is an error", () => {
  const r = parseReport({ ...FORECAST, current: { ...FORECAST.current, apparent_temperature: null, wind_gusts_10m: null } }, null, "X");
  assert.equal(r.air, null);
  assert.deepEqual([r.now.feels_f, r.now.gust_mph], [null, null]);
  assert.throws(() => parseReport({}, null, "X"), /no current conditions/);
  assert.throws(() => parseReport({ current: { temperature_2m: "warm" } }, null, "X"), /no current conditions/);
});

test("AQI bands follow the US scale", () => {
  assert.deepEqual([0, 50, 51, 100, 101, 150, 151, 200, 201, 300, 301].map(aqiCategory), ["Good", "Good", "Moderate", "Moderate", "Unhealthy for sensitive groups", "Unhealthy for sensitive groups", "Unhealthy", "Unhealthy", "Very unhealthy", "Very unhealthy", "Hazardous"]);
  assert.equal(aqiCategory(null), "");
});

test("weatherReport asks for US units, tolerates a failed air-quality call, and caches ten minutes per place", async () => {
  const calls = [];
  const get = async (url, params) => {
    calls.push(url);
    if (url.includes("geocoding")) return { results: [{ latitude: 26.7, longitude: -80.05, name: "West Palm Beach", admin1: "Florida" }] };
    if (url.includes("air-quality")) throw new Error("air quality down");
    assert.equal(params.temperature_unit, "fahrenheit");
    assert.equal(params.wind_speed_unit, "mph");
    assert.equal(params.precipitation_unit, "inch");
    assert.equal(params.timezone, "auto");
    return FORECAST;
  };
  // locate() uses the module's own fetch for geocoding, so stand it in through the same injected getter
  const real = globalThis.fetch;
  globalThis.fetch = async (u) => ({ ok: true, json: async () => ({ results: [{ latitude: 26.7, longitude: -80.05, name: "West Palm Beach", admin1: "Florida" }] }), url: String(u) });
  try {
    let t = 1000;
    const a = await weatherReport({ city: "Cache Test City", region: "" }, { get, now: () => t });
    assert.equal(a.air, null);
    const n = calls.length;
    t += 5 * 60 * 1000;
    await weatherReport({ city: "Cache Test City", region: "" }, { get, now: () => t });
    assert.equal(calls.length, n); // served from the cache
    t += 6 * 60 * 1000;
    await weatherReport({ city: "Cache Test City", region: "" }, { get, now: () => t });
    assert.ok(calls.length > n); // expired
  } finally { globalThis.fetch = real; }
});

const { parseAlerts, fetchAlerts, weatherAlerts } = require("../weather");

const ALERTS = { alerts: { alert: [
  { headline: "Flood Watch issued by NWS Miami", severity: "Moderate", urgency: "Future", areas: "Palm Beach; Broward", event: "Flood Watch", effective: "2026-10-30T04:00:00-04:00", expires: "2026-10-31T06:00:00-04:00", desc: "Heavy rain   may cause\nflooding.", instruction: "Move to higher ground." },
  { headline: "Tornado Warning issued", severity: "Extreme", urgency: "Immediate", areas: "Palm Beach", event: "Tornado Warning", expires: "2026-10-30T05:00:00-04:00", desc: "Take cover now." },
  { headline: "Flood Watch issued by NWS Miami", severity: "Moderate", areas: "Palm Beach; Broward", event: "Flood Watch", expires: "2026-10-31T06:00:00-04:00", desc: "duplicate listing" },
  { headline: "", event: "" },
] } };

test("alerts are cleaned, deduplicated, and listed most severe first", () => {
  const a = parseAlerts(ALERTS);
  assert.deepEqual(a.map((x) => x.event), ["Tornado Warning", "Flood Watch"]);
  assert.equal(a[1].description, "Heavy rain may cause flooding.");
  assert.equal(a[1].instruction, "Move to higher ground.");
  assert.deepEqual(parseAlerts({}), []);
  assert.deepEqual(parseAlerts({ alerts: { alert: "nope" } }), []);
});

test("without a key there is no request at all, and any failure gives no alerts instead of an error", async () => {
  let calls = 0;
  assert.deepEqual(await fetchAlerts(26.7, -80, { key: "", get: async () => { calls += 1; return ALERTS; } }), []);
  assert.equal(calls, 0);
  assert.deepEqual(await fetchAlerts(26.7, -80, { key: "k", get: async () => { throw new Error("plan has no alerts"); } }), []);
  let seen = null;
  const got = await fetchAlerts(26.7, -80.05, { key: "k", get: async (url, p) => { seen = { url, p }; return ALERTS; } });
  assert.equal(got.length, 2);
  assert.equal(seen.url, "https://api.weatherapi.com/v1/forecast.json");
  assert.deepEqual([seen.p.q, seen.p.alerts, seen.p.days], ["26.7,-80.05", "yes", "1"]);
});

test("alerts for a place are cached five minutes", async () => {
  const real = globalThis.fetch;
  globalThis.fetch = async () => ({ ok: true, json: async () => ({ results: [{ latitude: 1, longitude: 2, name: "Alert City", admin1: "X" }] }) });
  let calls = 0;
  const get = async () => { calls += 1; return ALERTS; };
  try {
    let t = 5000;
    await weatherAlerts({ city: "Alert City" }, { get, key: "k", now: () => t });
    t += 4 * 60 * 1000;
    await weatherAlerts({ city: "Alert City" }, { get, key: "k", now: () => t });
    assert.equal(calls, 1);
    t += 2 * 60 * 1000;
    await weatherAlerts({ city: "Alert City" }, { get, key: "k", now: () => t });
    assert.equal(calls, 2);
  } finally { globalThis.fetch = real; }
});

const { parseMarine, compass, radarFrames } = require("../weather");

test("compass points", () => {
  assert.deepEqual([0, 22, 45, 90, 180, 270, 337, 360, -10, null].map(compass), ["N", "NNE", "NE", "E", "S", "W", "NNW", "N", "N", ""]);
});

test("marine takes the hour nearest now, converts to feet, and is null when the service has nothing", () => {
  const hour = (h, wave) => ({ time: `2026-10-30 ${h}:00`, sig_ht_mt: wave, swell_ht_ft: 4.3, swell_dir: 36, swell_period_secs: 8.6, water_temp_f: 78.2 });
  const m = parseMarine({ forecast: { forecastday: [{ hour: [hour("03", 0.3), hour("04", 0.4), hour("05", 0.5)] }] } }, "2026-10-30T04:00");
  assert.deepEqual(m, { wave_ft: 1.3, swell_ft: 4.3, swell_dir: "NE", swell_period_s: 8.6, water_f: 78 });
  assert.equal(parseMarine({ forecast: { forecastday: [{ hour: [{ time: "2026-10-30 04:00" }] }] } }), null);
  assert.equal(parseMarine({}), null);
});

test("radar frames: only safe hosts and paths, thinned, newest last, cached five minutes", async () => {
  const frames = (n, t0) => Array.from({ length: n }, (_, i) => ({ time: t0 + i * 600, path: `/v2/radar/frame${i}` }));
  let calls = 0;
  const get = async () => { calls += 1; return { host: "https://tilecache.rainviewer.com", radar: { past: [...frames(12, 1000), { time: "x", path: "/bad" }, { time: 5, path: "javascript:alert(1)" }], nowcast: frames(3, 9000) } }; };
  let t = 1;
  const r = await radarFrames({ get, now: () => t });
  assert.equal(r.host, "https://tilecache.rainviewer.com");
  assert.ok(r.frames.length >= 6 && r.frames.length <= 10);
  assert.ok(r.frames.every((f) => /^\/[A-Za-z0-9/_-]+$/.test(f.path) && Number.isFinite(f.time)));
  assert.deepEqual(r.frames.map((f) => f.time), [...r.frames.map((f) => f.time)].sort((a, b) => a - b));
  assert.equal(r.nowcastFrom, 9000 * 1000);
  t += 4 * 60 * 1000; await radarFrames({ get, now: () => t }); assert.equal(calls, 1);
  t += 2 * 60 * 1000; await radarFrames({ get, now: () => t }); assert.equal(calls, 2);
  await assert.rejects(radarFrames({ get: async () => ({ host: "http://evil.test", radar: { past: frames(2, 1) } }), now: () => t + 99999999 }), /no tile host/);
});

test("a failed fetch serves a recent report labelled stale, and fails once it is over a day old", async () => {
  const real = globalThis.fetch;
  globalThis.fetch = async (u) => ({ ok: true, json: async () => ({ results: [{ latitude: 1, longitude: 2, name: "Offline Town", admin1: "" }] }), url: String(u) });
  const good = async (url) => { if (url.includes("air-quality")) throw new Error("no air"); return FORECAST; };
  const bad = async () => { throw new Error("network down"); };
  try {
    const t0 = 5e12;
    const first = await weatherReport({ city: "Offline Town" }, { get: good, now: () => t0 });
    assert.ok(first.now);
    assert.equal(first.stale, undefined);
    const s = await weatherReport({ city: "Offline Town" }, { get: bad, now: () => t0 + 30 * 60000 });
    assert.equal(s.stale, true);
    assert.equal(s.staleMinutes, 30);
    await assert.rejects(weatherReport({ city: "Offline Town" }, { get: bad, now: () => t0 + 25 * 3600000 }), /network down/);
  } finally { globalThis.fetch = real; }
});

test("minutely steps start at the current quarter hour, and a forecast without them gives none", () => {
  const { parseMinutely } = require("../weather");
  const f = { current: { time: "2026-10-30T14:37" }, minutely_15: { time: ["2026-10-30T14:15", "2026-10-30T14:30", "2026-10-30T14:45"], precipitation: [0.1, 0, null] } };
  assert.deepEqual(parseMinutely(f), [{ time: "2026-10-30T14:30", precip_in: 0 }, { time: "2026-10-30T14:45", precip_in: null }]);
  assert.deepEqual(parseMinutely({}), []);
});

test("pollen is null where the service has none, and sorted where it does", () => {
  const { parsePollen } = require("../weather");
  assert.equal(parsePollen({ current: { grass_pollen: null } }), null);
  assert.equal(parsePollen(null), null);
  assert.deepEqual(parsePollen({ current: { grass_pollen: 2.4, birch_pollen: 9 } }), [{ name: "birch", value: 9 }, { name: "grass", value: 2 }]);
});

test("the usual high averages past years, needs at least three, and asks for the same date", async () => {
  const { fetchNormal } = require("../weather");
  const seen = [];
  const get = async (u, p) => { seen.push(p.start_date); return { daily: { temperature_2m_max: [80] } }; };
  assert.deepEqual(await fetchNormal(11, 22, "2026-10-30", { get }), { high_f: 80, years: 5 });
  assert.deepEqual(seen.slice(0, 2), ["2025-10-30", "2024-10-30"]);
  let n = 0;
  const flaky = async () => { n += 1; if (n > 2) throw new Error("down"); return { daily: { temperature_2m_max: [70] } }; };
  assert.equal(await fetchNormal(3, 4, "2026-10-30", { get: flaky }), null);
  assert.equal(await fetchNormal(3, 4, "bad", { get }), null);
});
