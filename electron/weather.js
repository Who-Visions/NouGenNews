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

async function locate(city) {
  const c = String(city || "").trim();
  if (!c) throw new Error("a city is required");
  const v = await getJson("https://geocoding-api.open-meteo.com/v1/search", { name: c, count: "1" });
  const hit = (v.results || [])[0];
  if (!hit) throw new Error(`no place named ${c}`);
  if (typeof hit.latitude !== "number") throw new Error("place has no latitude");
  if (typeof hit.longitude !== "number") throw new Error("place has no longitude");
  return [hit.latitude, hit.longitude, hit.name || c, hit.admin1 || ""];
}

async function fetchWeather(city) {
  const [lat, lon, place, region] = await locate(city);
  const v = await getJson("https://api.open-meteo.com/v1/forecast", {
    latitude: String(lat),
    longitude: String(lon),
    current: "temperature_2m,weather_code,is_day",
    temperature_unit: "fahrenheit",
  });
  return { ...parseForecast(v, place), region };
}

async function homeWeather({ city }) {
  const key = String(city || "").trim().toLowerCase();
  if (cache && cache.key === key && Date.now() - cache.at < TTL_MS) return cache.weather;
  const weather = await fetchWeather(city);
  cache = { key, at: Date.now(), weather };
  return weather;
}

module.exports = { homeWeather, labelFor, parseForecast, locate };
