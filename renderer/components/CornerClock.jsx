import { useEffect, useState } from "react";
import { invoke } from "../lib/bridge.js";
import "./CornerClock.css";

const CITY_KEY = "nn.city";

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
export function saveCity(city) {
  try { city ? localStorage.setItem(CITY_KEY, city) : localStorage.removeItem(CITY_KEY); } catch { /* storage unavailable */ }
  window.dispatchEvent(new CustomEvent("nn:city"));
}

const ICON = { Clear: "\u2600", "Partly cloudy": "\u26C5", Overcast: "\u2601", Cloudy: "\u2601", Fog: "\u2601", Drizzle: "\u2602", Rain: "\u2602", Snow: "\u2744", Thunderstorm: "\u26A1" };

// Time (with zone), date, city and current weather, in the menu bar's top-right corner.
export function CornerClock() {
  const [now, setNow] = useState(() => new Date());
  const [city, setCity] = useState(loadCity);
  const [wx, setWx] = useState(null);

  useEffect(() => {
    const t = setInterval(() => setNow(new Date()), 15000);
    const onCity = () => setCity(loadCity());
    window.addEventListener("nn:city", onCity);
    return () => { clearInterval(t); window.removeEventListener("nn:city", onCity); };
  }, []);

  useEffect(() => {
    let live = true;
    const pull = () => invoke("weather", { city }).then((w) => live && setWx(w)).catch(() => live && setWx(null));
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
      {wx ? <span className="cc__wx"><i aria-hidden="true">{ICON[wx.label] || "\u2601"}</i>{Math.round(wx.temp_f)}°F</span> : null}
    </div>
  );
}
