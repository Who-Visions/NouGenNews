import { test } from "node:test";
import assert from "node:assert/strict";
import {
  computeWeatherSummary,
  computeWhatMattersToday,
  computeSunArc,
  compass,
  hourOf,
  hourLabel,
  clockLabel,
  minutesOf,
} from "./weatherSummary.js";

const SAMPLE_REPORT = {
  place: "West Palm Beach",
  region: "Florida",
  timezone: "America/New_York",
  updated: "2026-10-30T10:00",
  now: {
    temp_f: 77,
    feels_f: 81,
    humidity: 81,
    wind_mph: 9,
    gust_mph: 17,
    wind_dir: 135,
    pressure_in: 30.05,
    cloud: 75,
    dew_f: 71,
    visibility_mi: 10,
    uv: 4,
    precip_in: 0,
    code: 3,
    label: "Overcast",
    is_day: true,
  },
  today: {
    date: "2026-10-30",
    code: 61,
    label: "Rain",
    high_f: 84,
    low_f: 74,
    precip_chance: 60,
    precip_in: 0.21,
    wind_mph: 15,
    uv_max: 8.0,
    sunrise: "2026-10-30T07:07",
    sunset: "2026-10-30T18:08",
  },
  hours: [
    { time: "2026-10-30T10:00", temp_f: 77, precip_chance: 10, code: 3, label: "Overcast", is_day: true },
    { time: "2026-10-30T11:00", temp_f: 79, precip_chance: 15, code: 3, label: "Overcast", is_day: true },
    { time: "2026-10-30T12:00", temp_f: 81, precip_chance: 20, code: 3, label: "Partly cloudy", is_day: true },
    { time: "2026-10-30T13:00", temp_f: 83, precip_chance: 25, code: 3, label: "Partly cloudy", is_day: true },
    { time: "2026-10-30T14:00", temp_f: 84, precip_chance: 60, code: 61, label: "Rain", is_day: true },
    { time: "2026-10-30T15:00", temp_f: 84, precip_chance: 65, code: 61, label: "Rain", is_day: true },
    { time: "2026-10-30T16:00", temp_f: 82, precip_chance: 50, code: 61, label: "Rain", is_day: true },
    { time: "2026-10-30T17:00", temp_f: 80, precip_chance: 30, code: 3, label: "Overcast", is_day: true },
    { time: "2026-10-30T18:00", temp_f: 78, precip_chance: 10, code: 3, label: "Overcast", is_day: true },
  ],
  days: [],
  air: { aqi: 42, category: "Good", pm25: 8.3 },
  alerts: [],
  marine: null,
};

test("computeWeatherSummary produces the expected deterministic sentences", () => {
  const summary = computeWeatherSummary(SAMPLE_REPORT);
  assert.match(summary, /Warm and humid, 77°F now\./);
  assert.match(summary, /Rain likely after 2 PM \(60%\)\./);
  assert.match(summary, /High of 84 around 2 PM\./);
  assert.match(summary, /UV peaks at 8\./);
});

test("computeWeatherSummary handles dry conditions and missing optional values cleanly", () => {
  const dryReport = {
    now: { temp_f: 65, humidity: 40, label: "Clear" },
    today: { high_f: 70, uv_max: 4.0 },
    hours: [
      { time: "2026-10-30T12:00", temp_f: 65, precip_chance: 0 },
      { time: "2026-10-30T14:00", temp_f: 70, precip_chance: 5 },
    ],
  };
  const summary = computeWeatherSummary(dryReport);
  assert.match(summary, /Mild, 65°F now\./);
  assert.match(summary, /Dry conditions expected\./);
  assert.match(summary, /High of 70 around 2 PM\./);
});

test("computeWeatherSummary returns empty string when now is missing", () => {
  assert.equal(computeWeatherSummary(null), "");
  assert.equal(computeWeatherSummary({}), "");
});

test("computeWhatMattersToday yields all four essential daily telemetry cards", () => {
  const matters = computeWhatMattersToday(SAMPLE_REPORT);
  assert.ok(matters);
  assert.equal(matters.nextRain.title, "Next rain");
  assert.match(matters.nextRain.value, /2 PM \(60%\)/);
  assert.equal(matters.bestOutdoor.title, "Best hours outside");
  assert.equal(matters.peakUv.title, "Peak UV window");
  assert.match(matters.peakUv.detail, /UV 8 · Very High/);
  assert.equal(matters.peakWind.title, "Wind peak");
});

test("best hours outside is one daylight run, never a near-24h window across the night", () => {
  const hours = [];
  for (let i = 0; i < 24; i++) {
    const hh = String(i).padStart(2, "0");
    hours.push({ time: `2026-10-30T${hh}:00`, temp_f: 72, precip_chance: 5, is_day: i >= 7 && i < 19 });
  }
  const r = { ...SAMPLE_REPORT, hours };
  const { bestOutdoor } = computeWhatMattersToday(r);
  assert.match(bestOutdoor.value, /7 AM – 6 PM/);
});

test("computeSunArc accurately computes solar progress and daylight text", () => {
  const arcMidday = computeSunArc(SAMPLE_REPORT.today, "2026-10-30T12:37");
  assert.equal(arcMidday.isDay, true);
  assert.ok(arcMidday.progress > 0.45 && arcMidday.progress < 0.55);
  assert.match(arcMidday.daylightText, /11h 1m daylight/);
  assert.match(arcMidday.remainingText, /left/);

  const arcNight = computeSunArc(SAMPLE_REPORT.today, "2026-10-30T22:00");
  assert.equal(arcNight.isDay, false);
  assert.equal(arcNight.progress, 1);
  assert.match(arcNight.remainingText, /Sunset was/);

  const arcMorningPreDawn = computeSunArc(SAMPLE_REPORT.today, "2026-10-30T05:00");
  assert.equal(arcMorningPreDawn.isDay, false);
  assert.equal(arcMorningPreDawn.progress, 0);
  assert.match(arcMorningPreDawn.remainingText, /Sunrise in/);
});

test("time and compass helpers handle boundary cases", () => {
  assert.equal(compass(0), "N");
  assert.equal(compass(90), "E");
  assert.equal(compass(180), "S");
  assert.equal(compass(270), "W");
  assert.equal(compass(null), "");

  assert.equal(hourOf("2026-10-30T04:15"), 4);
  assert.equal(hourLabel("2026-10-30T04:15"), "4 AM");
  assert.equal(hourLabel("2026-10-30T16:15"), "4 PM");
  assert.equal(hourLabel("2026-10-30T00:15"), "12 AM");
  assert.equal(hourLabel("2026-10-30T12:15"), "12 PM");

  assert.equal(clockLabel("2026-10-30T04:15"), "4:15 AM");
  assert.equal(minutesOf("2026-10-30T04:15"), 4 * 60 + 15);
  assert.equal(minutesOf(null), 0);
});
