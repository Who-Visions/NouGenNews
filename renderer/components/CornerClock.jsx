import { useEffect, useState } from "react";
import { invoke } from "../lib/bridge.js";
import "./CornerClock.css";

const CITY_KEY = "nn.city";
const REGION_KEY = "nn.region";
const METRO_KEY = "nn.metro";
const SCOPE_KEY = "nn.newsScope";

// "America/New_York" -> "New York": the default place when none was chosen, with no network call.
export function defaultCity() {
  try {
    const tz = Intl.DateTimeFormat().resolvedOptions().timeZone || "";
    return tz.split("/").pop().replace(/_/g, " ");
  } catch { return ""; }
}
export function loadCity() {
  try { return localStorage.getItem(CITY_KEY) || defaultCity(); } catch { return defaultCity(); }
}
export function loadRegion() {
  try { return localStorage.getItem(REGION_KEY) || ""; } catch { return ""; }
}
// True once a city was chosen or detected; until then the city is only a guess from the time zone.
export function hasChosenCity() {
  try { return !!localStorage.getItem(CITY_KEY); } catch { return false; }
}
export function loadMetro() {
  try { return localStorage.getItem(METRO_KEY) || ""; } catch { return ""; }
}
// "metro" (the wider area, the default) or "city" (only the city itself) for the Near you news.
export function loadScope() {
  try { return localStorage.getItem(SCOPE_KEY) === "city" ? "city" : "metro"; } catch { return "metro"; }
}
export function saveScope(scope) {
  try { localStorage.setItem(SCOPE_KEY, scope === "city" ? "city" : "metro"); } catch { /* storage unavailable */ }
  window.dispatchEvent(new CustomEvent("nn:city"));
}
export function saveCity(city, region = "", metro = "") {
  try {
    city ? localStorage.setItem(CITY_KEY, city) : localStorage.removeItem(CITY_KEY);
    region ? localStorage.setItem(REGION_KEY, region) : localStorage.removeItem(REGION_KEY);
    metro ? localStorage.setItem(METRO_KEY, metro) : localStorage.removeItem(METRO_KEY);
  } catch { /* storage unavailable */ }
  window.dispatchEvent(new CustomEvent("nn:city"));
}

const ICON = { Clear: "\u2600", "Partly cloudy": "\u26C5", Overcast: "\u2601", Cloudy: "\u2601", Fog: "\u2601", Drizzle: "\u2602", Rain: "\u2602", Snow: "\u2744", Thunderstorm: "\u26A1" };

// Time (with zone), date, city and current weather, in the menu bar's top-right corner.
export function CornerClock() {
  const [now, setNow] = useState(() => new Date());
  const [city, setCity] = useState(loadCity);
  const [wx, setWx] = useState(null);
  const [chosen, setChosen] = useState(hasChosenCity);
  const [locating, setLocating] = useState(false);
  const useMyLocation = async () => {
    setLocating(true);
    const r = await invoke("locate_me").catch(() => null);
    setLocating(false);
    if (r && r.ok) { saveCity(r.city, r.region, r.metro); setChosen(true); }
    else window.dispatchEvent(new CustomEvent("nn:menu-note", { detail: r?.reason || "Could not find your location. Type your city in Settings." }));
  };

  // First launch: find the place without being asked. Windows' own location setting is the gate (if it is off,
  // nothing is found and the chip stays); the attempt is made once, so a refusal is never repeated at every start.
  useEffect(() => {
    let tried = false;
    try { tried = localStorage.getItem("nn.locTried") === "1"; localStorage.setItem("nn.locTried", "1"); } catch { /* storage unavailable */ }
    if (!hasChosenCity() && !tried) useMyLocation();
  }, []);

  useEffect(() => {
    const t = setInterval(() => setNow(new Date()), 15000);
    const onCity = () => { setCity(loadCity()); setChosen(hasChosenCity()); };
    window.addEventListener("nn:city", onCity);
    return () => { clearInterval(t); window.removeEventListener("nn:city", onCity); };
  }, []);

  useEffect(() => {
    let live = true;
    const pull = () => invoke("weather", { city, region: loadRegion() }).then((w) => live && setWx(w)).catch(() => live && setWx(null));
    pull();
    const t = setInterval(pull, 15 * 60 * 1000);
    return () => { live = false; clearInterval(t); };
  }, [city]);

  const time = now.toLocaleTimeString("en-US", { hour: "numeric", minute: "2-digit", timeZoneName: "short" });
  const date = now.toLocaleDateString("en-US", { weekday: "short", month: "short", day: "numeric" });
  return (
    <div className="cc" title={wx ? `${wx.label} in ${wx.place}` : city}>
      <span className="cc__time">{time}</span>
      <span className="cc__sep">·</span>
      <span>{date}</span>
      <span className="cc__sep">·</span>
      <span>{wx?.place || city}</span>
      {!chosen ? <button type="button" className="cc__locate" onClick={useMyLocation} disabled={locating} title="The city above is a guess from your time zone. Ask Windows for your actual location (sent once to a place-name lookup).">{locating ? "Locating\u2026" : "Use my location"}</button> : null}
      {wx ? <span className="cc__wx"><i aria-hidden="true">{ICON[wx.label] || "\u2601"}</i>{Math.round(wx.temp_f)}°F</span> : null}
    </div>
  );
}
