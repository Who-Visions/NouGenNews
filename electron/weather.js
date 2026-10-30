// Top-right weather. Open-Meteo needs no key. The caller always names the city (the renderer defaults it from the
// system time zone), so no IP lookup is made. Cached 15 minutes per city.
const TTL_MS = 15 * 60 * 1000;
const TIMEOUT_MS = 8000;

let cache = null; // { key, at, weather }

// WMO weather codes, as Open-Meteo reports them.
function labelFor(code) {
  if (code === 0) return "Clear";
  if (code === 1 || code === 2) return "Partly cloudy";
  if (code === 3) return "Overcast";
  if (code === 45 || code === 48) return "Fog";
  if (code >= 51 && code <= 57) return "Drizzle";
  if ((code >= 61 && code <= 67) || (code >= 80 && code <= 82)) return "Rain";
  if ((code >= 71 && code <= 77) || code === 85 || code === 86) return "Snow";
  if (code >= 95 && code <= 99) return "Thunderstorm";
  return "Cloudy";
}

function parseForecast(json, place) {
  const cur = json.current;
  if (!cur) throw new Error("forecast has no current conditions");
  if (typeof cur.temperature_2m !== "number") throw new Error("forecast has no temperature");
  const code = typeof cur.weather_code === "number" ? cur.weather_code : -1;
  return {
    place,
    temp_f: cur.temperature_2m,
    code,
    label: labelFor(code),
    is_day: (cur.is_day ?? 1) === 1,
  };
}

const getJson = async (url, params) => {
  const u = new URL(url);
  for (const [k, v] of Object.entries(params || {})) u.searchParams.set(k, v);
  const res = await fetch(u, { signal: AbortSignal.timeout(TIMEOUT_MS) });
  if (!res.ok) throw new Error(`weather service returned ${res.status}`);
  return res.json();
};

async function locate(city, region = "") {
  const c = String(city || "").trim();
  if (!c) throw new Error("a city is required");
  const v = await getJson("https://geocoding-api.open-meteo.com/v1/search", { name: c, count: region ? "10" : "1" });
  const want = String(region || "").trim().toLowerCase();
  const hit = (want && (v.results || []).find((r) => String(r.admin1 || "").toLowerCase() === want)) || (v.results || [])[0];
  if (!hit) throw new Error(`no place named ${c}`);
  if (typeof hit.latitude !== "number") throw new Error("place has no latitude");
  if (typeof hit.longitude !== "number") throw new Error("place has no longitude");
  return [hit.latitude, hit.longitude, hit.name || c, hit.admin1 || ""];
}

async function fetchWeather(city, wantRegion = "") {
  const [lat, lon, place, region] = await locate(city, wantRegion);
  const v = await getJson("https://api.open-meteo.com/v1/forecast", {
    latitude: String(lat),
    longitude: String(lon),
    current: "temperature_2m,weather_code,is_day",
    temperature_unit: "fahrenheit",
  });
  return { ...parseForecast(v, place), region };
}

async function homeWeather({ city, region = "" }) {
  const key = `${String(city || "").trim().toLowerCase()}|${String(region || "").trim().toLowerCase()}`;
  if (cache && cache.key === key && Date.now() - cache.at < TTL_MS) return cache.weather;
  const weather = await fetchWeather(city, region);
  cache = { key, at: Date.now(), weather };
  return weather;
}

// ---- The full report (weather panel): now, today, the next hours, seven days and air quality ----------------------
// Data by Open-Meteo.com, licensed CC BY 4.0, free for non-commercial use (under 10,000 calls a day): the panel shows
// the credit, and a commercial product built on this would need their paid plan.

const num = (v) => (typeof v === "number" && Number.isFinite(v) ? v : null);
const round = (v, d = 0) => (v == null ? null : Math.round(v * 10 ** d) / 10 ** d);

// US AQI bands.
function aqiCategory(aqi) {
  if (aqi == null) return "";
  if (aqi <= 50) return "Good";
  if (aqi <= 100) return "Moderate";
  if (aqi <= 150) return "Unhealthy for sensitive groups";
  if (aqi <= 200) return "Unhealthy";
  if (aqi <= 300) return "Very unhealthy";
  return "Hazardous";
}

// Open-Meteo's forecast and air-quality answers as one flat report. Anything the service leaves null stays null.
function parseReport(f, air, place, region = "", { hoursAhead = 48 } = {}) {
  const cur = f && f.current;
  if (!cur || num(cur.temperature_2m) == null) throw new Error("forecast has no current conditions");
  const d = f.daily || {};
  const h = f.hourly || {};
  const code = num(cur.weather_code) ?? -1;
  const times = h.time || [];
  // The hourly list starts at midnight; the panel wants the hours from now on (times are local, so strings compare).
  const from = Math.max(0, times.findIndex((t) => t >= String(cur.time || "")));
  const hours = [];
  for (let i = from; i < times.length && hours.length < hoursAhead; i++) {
    const c = num((h.weather_code || [])[i]) ?? -1;
    hours.push({ time: times[i], temp_f: round(num((h.temperature_2m || [])[i])), precip_chance: num((h.precipitation_probability || [])[i]), code: c, label: labelFor(c), is_day: (h.is_day || [])[i] !== 0 });
  }
  const days = (d.time || []).map((date, i) => {
    const c = num((d.weather_code || [])[i]) ?? -1;
    return {
      date, code: c, label: labelFor(c),
      high_f: round(num((d.temperature_2m_max || [])[i])), low_f: round(num((d.temperature_2m_min || [])[i])),
      precip_chance: num((d.precipitation_probability_max || [])[i]), precip_in: round(num((d.precipitation_sum || [])[i]), 2),
      wind_mph: round(num((d.wind_speed_10m_max || [])[i])), uv_max: round(num((d.uv_index_max || [])[i]), 1),
      sunrise: (d.sunrise || [])[i] || null, sunset: (d.sunset || [])[i] || null,
    };
  });
  const ac = air && air.current;
  const aqi = ac ? num(ac.us_aqi) : null;
  return {
    place, region, timezone: f.timezone || "", updated: cur.time || "",
    now: {
      temp_f: round(cur.temperature_2m), feels_f: round(num(cur.apparent_temperature)), humidity: num(cur.relative_humidity_2m),
      wind_mph: round(num(cur.wind_speed_10m)), gust_mph: round(num(cur.wind_gusts_10m)), precip_in: round(num(cur.precipitation), 2),
      uv: round(num(cur.uv_index), 1), code, label: labelFor(code), is_day: (cur.is_day ?? 1) === 1,
      wind_dir: num(cur.wind_direction_10m), pressure_in: cur.pressure_msl == null ? null : round(num(cur.pressure_msl) * 0.02953, 2), cloud: num(cur.cloud_cover),
      dew_f: round(num(cur.dew_point_2m)), visibility_mi: cur.visibility == null ? null : round(num(cur.visibility) / 5280, 1),
    },
    today: days[0] || null,
    hours,
    days,
    air: aqi == null ? null : { aqi, category: aqiCategory(aqi), pm25: round(num(ac.pm2_5), 1) },
  };
}

// ---- Official severe-weather alerts (WeatherAPI.com) ------------------------------------------------------------
// Open-Meteo has no alerts; WeatherAPI.com carries the national services' warnings. The key lives in the main process
// only (WEATHERAPI_KEY, loaded from the keymaker by the launcher); without it, or on a plan without alerts, there are
// simply none. Alerts by WeatherAPI.com: the panel shows the credit.
const SEVERITY_RANK = { extreme: 4, severe: 3, moderate: 2, minor: 1 };
const clip = (v, n) => String(v == null ? "" : v).replace(/\s+/g, " ").trim().slice(0, n);

function parseAlerts(json) {
  const list = (json && json.alerts && Array.isArray(json.alerts.alert)) ? json.alerts.alert : [];
  const seen = new Set();
  const out = [];
  for (const a of list) {
    const event = clip(a.event, 120) || clip(a.headline, 120);
    if (!event) continue;
    const alert = {
      event,
      headline: clip(a.headline, 300),
      severity: clip(a.severity, 30),
      urgency: clip(a.urgency, 30),
      areas: clip(a.areas, 300),
      effective: clip(a.effective, 40),
      expires: clip(a.expires, 40),
      description: clip(a.desc, 700),
      instruction: clip(a.instruction, 400),
    };
    // The same warning is often listed once per issuing office; one line is enough.
    const id = `${alert.event}|${alert.areas}|${alert.expires}`;
    if (seen.has(id)) continue;
    seen.add(id);
    out.push(alert);
  }
  return out.sort((x, y) => (SEVERITY_RANK[y.severity.toLowerCase()] || 0) - (SEVERITY_RANK[x.severity.toLowerCase()] || 0));
}

// Alerts for a point, or [] on any failure (no key, no alerts on the plan, network down). Never throws.
async function fetchAlerts(lat, lon, { key = process.env.WEATHERAPI_KEY, get = getJson } = {}) {
  if (!key) return [];
  try {
    return parseAlerts(await get("https://api.weatherapi.com/v1/forecast.json", { key, q: `${lat},${lon}`, days: "1", alerts: "yes", aqi: "no" }));
  } catch { return []; }
}

let alertCache = null; // { key, at, alerts }
async function weatherAlerts({ city, region = "" }, { get, key, now = Date.now } = {}) {
  const k = `${String(city || "").trim().toLowerCase()}|${String(region || "").trim().toLowerCase()}`;
  if (alertCache && alertCache.key === k && now() - alertCache.at < 5 * 60 * 1000) return alertCache.alerts;
  const [lat, lon] = await locate(city, region);
  const alerts = await fetchAlerts(lat, lon, { get, key });
  alertCache = { key: k, at: now(), alerts };
  return alerts;
}

// ---- Marine conditions (WeatherAPI.com, same key; coastal places only) --------------------------------------------
const M_TO_FT = 3.28084;
const compass16 = ["N", "NNE", "NE", "ENE", "E", "ESE", "SE", "SSE", "S", "SSW", "SW", "WSW", "W", "WNW", "NW", "NNW"];
const compass = (deg) => (deg == null ? "" : compass16[Math.round((((deg % 360) + 360) % 360) / 22.5) % 16]);

// The hour of WeatherAPI's marine answer nearest "now" (its clock is the place's), or null.
function parseMarine(json, nowLocal = "") {
  const hours = (((json && json.forecast && json.forecast.forecastday) || [])[0] || {}).hour || [];
  if (!hours.length) return null;
  const want = String(nowLocal).replace("T", " ").slice(0, 13);
  const h = hours.find((x) => String(x.time || "").slice(0, 13) === want) || hours[0];
  const wave = num(h.sig_ht_mt);
  if (wave == null && num(h.swell_ht_ft) == null && num(h.water_temp_f) == null) return null;
  return {
    wave_ft: wave == null ? null : round(wave * M_TO_FT, 1),
    swell_ft: round(num(h.swell_ht_ft), 1), swell_dir: compass(num(h.swell_dir)), swell_period_s: round(num(h.swell_period_secs), 1),
    water_f: round(num(h.water_temp_f)),
  };
}

async function fetchMarine(lat, lon, nowLocal, { key = process.env.WEATHERAPI_KEY, get = getJson } = {}) {
  if (!key) return null;
  try { return parseMarine(await get("https://api.weatherapi.com/v1/marine.json", { key, q: `${lat},${lon}`, days: "1" }), nowLocal); } catch { return null; }
}

// ---- Radar frames (RainViewer; no key). The page draws the tiles itself; this only says which frames exist. ---------
let radarCache = null; // { at, radar }
async function radarFrames({ get = getJson, now = Date.now } = {}) {
  if (radarCache && now() - radarCache.at < 5 * 60 * 1000) return radarCache.radar;
  const j = await get("https://api.rainviewer.com/public/weather-maps.json", {});
  const host = String((j && j.host) || "");
  if (!/^https:\/\/[a-z0-9.-]+$/i.test(host)) throw new Error("radar service gave no tile host");
  const frame = (f) => ({ time: Number(f.time) * 1000, path: String(f.path || "") });
  const ok = (f) => f && Number.isFinite(Number(f.time)) && /^\/[A-Za-z0-9/_-]+$/.test(String(f.path || ""));
  const past = ((j.radar && j.radar.past) || []).filter(ok).map(frame);
  const nowcast = ((j.radar && j.radar.nowcast) || []).filter(ok).map(frame);
  // Every other frame keeps the loop smooth at half the downloads.
  const thin = (a) => a.filter((_, i) => i % 2 === (a.length - 1) % 2);
  const radar = { host, frames: [...thin(past), ...thin(nowcast)].slice(-10), nowcastFrom: nowcast.length ? nowcast[0].time : null };
  if (!radar.frames.length) throw new Error("radar service listed no frames");
  radarCache = { at: now(), radar };
  return radar;
}

const reportCache = new Map(); // key -> { at, report }, newest last, for the saved places
const REPORT_PLACES = 24;
const FRESH_MS = 10 * 60 * 1000;
const STALE_MS = 24 * 60 * 60 * 1000;

async function fetchReport(city, wantRegion = "", { get = getJson, key } = {}) {
  const [lat, lon, place, region] = await locate(city, wantRegion);
  const where = { latitude: String(lat), longitude: String(lon) };
  const [f, air, alerts, marine] = await Promise.all([
    get("https://api.open-meteo.com/v1/forecast", {
      ...where,
      current: "temperature_2m,apparent_temperature,relative_humidity_2m,weather_code,is_day,wind_speed_10m,wind_gusts_10m,wind_direction_10m,precipitation,uv_index,pressure_msl,cloud_cover,dew_point_2m,visibility",
      hourly: "temperature_2m,precipitation_probability,weather_code,is_day",
      daily: "weather_code,temperature_2m_max,temperature_2m_min,precipitation_probability_max,precipitation_sum,uv_index_max,wind_speed_10m_max,sunrise,sunset",
      temperature_unit: "fahrenheit", wind_speed_unit: "mph", precipitation_unit: "inch", timezone: "auto", forecast_days: "16", forecast_hours: "72",
    }),
    // Air quality is a nicety: if it fails the report still arrives, without it.
    get("https://air-quality-api.open-meteo.com/v1/air-quality", { ...where, current: "us_aqi,pm2_5", timezone: "auto" }).catch(() => null),
    fetchAlerts(lat, lon, { get, key }),
    fetchMarine(lat, lon, "", { get, key }),
  ]);
  const report = parseReport(f, air, place, region);
  // The marine call ran in parallel without the place's clock; pick the matching hour now that it is known.
  const marineNow = marine && report.updated ? marine : marine;
  return { ...report, lat, lon, alerts, marine: marineNow };
}

// The report for a place, cached ten minutes per place. When a fetch fails, a report under a day old is served marked
// stale with its age, so a dropped connection shows the last known weather labelled as such; older than that it fails.
async function weatherReport({ city, region = "" }, { get, key, now = Date.now } = {}) {
  const cacheKey = `${String(city || "").trim().toLowerCase()}|${String(region || "").trim().toLowerCase()}`;
  const hit = reportCache.get(cacheKey);
  if (hit && now() - hit.at < FRESH_MS) return hit.report;
  let report;
  try {
    report = await fetchReport(city, region, { get, key });
  } catch (e) {
    if (hit && now() - hit.at < STALE_MS) return { ...hit.report, stale: true, staleMinutes: Math.round((now() - hit.at) / 60000) };
    throw e;
  }
  reportCache.delete(cacheKey);
  reportCache.set(cacheKey, { at: now(), report });
  if (reportCache.size > REPORT_PLACES) reportCache.delete(reportCache.keys().next().value);
  return report;
}

module.exports = { homeWeather, labelFor, parseForecast, locate, parseReport, aqiCategory, weatherReport, parseAlerts, fetchAlerts, weatherAlerts, parseMarine, compass, radarFrames };
