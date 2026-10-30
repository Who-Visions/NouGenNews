import React, { useCallback, useEffect, useMemo, useState } from "react";
import { invoke } from "../lib/bridge.js";
import { ageLabel } from "../lib/age.js";
import { moonPhase } from "../lib/moon.js";
import { loadCity, loadRegion } from "./CornerClock.jsx";
import { WeatherGlobe } from "./WeatherGlobe.jsx";
import "./WeatherPage.css";

const ICON = { Clear: "☀", "Partly cloudy": "⛅", Overcast: "☁", Cloudy: "☁", Fog: "☁", Drizzle: "☂", Rain: "☂", Snow: "❄", Thunderstorm: "⚡" };
const icon = (label, isDay = true) => (label === "Clear" && !isDay ? "☾" : ICON[label] || "☁");
const POINTS = ["N", "NNE", "NE", "ENE", "E", "ESE", "SE", "SSE", "S", "SSW", "SW", "WSW", "W", "WNW", "NW", "NNW"];
const compass = (d) => (d == null ? "" : POINTS[Math.round((((d % 360) + 360) % 360) / 22.5) % 16]);

// Times are the place's own clock ("2026-10-30T05:00"); they are read as text so this computer's zone cannot shift them.
const hourOf = (t) => Number(String(t).slice(11, 13));
const hourLabel = (t) => { const h = hourOf(t); return `${h % 12 || 12}${h < 12 ? "a" : "p"}`; };
const clockLabel = (t) => { if (!t) return "—"; const h = hourOf(t); return `${h % 12 || 12}:${String(t).slice(14, 16)} ${h < 12 ? "AM" : "PM"}`; };
const minutesOf = (t) => hourOf(t) * 60 + Number(String(t).slice(14, 16));
const dayName = (date, i) => (i === 0 ? "Today" : new Date(`${date}T12:00:00`).toLocaleDateString(undefined, { weekday: "short", month: "short", day: "numeric" }));
const deg = (n) => (n == null ? "—" : `${n}°`);
const pct = (n) => (n == null ? "—" : `${n}%`);

// Temperature line with rain-chance bars, 48 hours, night shaded. Every point carries its own tooltip.
function HourlyChart({ hours }) {
  const W = 960, H = 210, L = 38, R = 12, T = 14, B = 34, BAR = 46;
  const temps = hours.map((h) => h.temp_f).filter((v) => v != null);
  if (hours.length < 2 || !temps.length) return null;
  const lo = Math.floor(Math.min(...temps) - 2), hi = Math.ceil(Math.max(...temps) + 2);
  const x = (i) => L + (i / (hours.length - 1)) * (W - L - R);
  const y = (v) => T + (1 - (v - lo) / Math.max(1, hi - lo)) * (H - T - B - 4);
  const pts = hours.map((h, i) => (h.temp_f == null ? null : [x(i), y(h.temp_f)]));
  const line = pts.filter(Boolean).map(([px, py], i) => `${i ? "L" : "M"}${px.toFixed(1)},${py.toFixed(1)}`).join(" ");
  const area = `${line} L${x(hours.length - 1).toFixed(1)},${H - B} L${x(0).toFixed(1)},${H - B} Z`;
  const night = [];
  hours.forEach((h, i) => { if (!h.is_day) night.push(<rect key={h.time} x={x(i) - (W - L - R) / (hours.length - 1) / 2} y={T} width={(W - L - R) / (hours.length - 1)} height={H - T - B} className="wp-night" />); });
  return (
    <svg className="wp-chart" viewBox={`0 0 ${W} ${H}`} role="img" aria-label="Temperature and chance of rain for the next 48 hours">
      {night}
      {[lo, Math.round((lo + hi) / 2), hi].map((v) => <g key={v}><line x1={L} x2={W - R} y1={y(v)} y2={y(v)} className="wp-grid" /><text x={L - 6} y={y(v) + 4} textAnchor="end" className="wp-axis">{v}°</text></g>)}
      {hours.map((h, i) => (h.precip_chance ? <rect key={`p${h.time}`} x={x(i) - 3.5} y={H - B - (h.precip_chance / 100) * BAR} width="7" height={(h.precip_chance / 100) * BAR} className="wp-pbar"><title>{`${hourLabel(h.time)}: ${h.precip_chance}% chance of rain`}</title></rect> : null))}
      <path d={area} className="wp-area" />
      <path d={line} className="wp-line" />
      {hours.map((h, i) => (pts[i] ? <circle key={`c${h.time}`} cx={pts[i][0]} cy={pts[i][1]} r="3.4" className="wp-dot"><title>{`${hourLabel(h.time)}: ${h.temp_f}°F, ${h.label}`}</title></circle> : null))}
      {hours.map((h, i) => (i % 6 === 0 ? <text key={`x${h.time}`} x={x(i)} y={H - 10} textAnchor="middle" className="wp-axis">{i === 0 ? "Now" : hourLabel(h.time)}</text> : null))}
    </svg>
  );
}

const Tile = ({ label, children, sub }) => (
  <div className="wp-tile"><div className="wp-tile__k">{label}</div><div className="wp-tile__v">{children}</div>{sub ? <div className="wp-tile__s">{sub}</div> : null}</div>
);

// The Weather tab: the globe and radar, then now, alerts, the next 48 hours, 16 days, sun and moon, air, sea and the
// weather stories this app has kept. Data by Open-Meteo.com (CC BY 4.0); alerts and marine by WeatherAPI.com; radar by RainViewer.
export function WeatherPage({ onBack }) {
  const [place, setPlace] = useState({ city: loadCity(), region: loadRegion() });
  const [r, setR] = useState(null);
  const [err, setErr] = useState("");
  const [busy, setBusy] = useState(false);
  const [news, setNews] = useState(null);

  const load = useCallback(() => {
    setBusy(true);
    setErr("");
    return invoke("weather_report", { city: place.city, region: place.region })
      .then((x) => { setR(x); })
      .catch((e) => setErr(String((e && e.message) || e).replace(/^Error invoking remote method 'cmd': (Error: )?/, "")))
      .finally(() => setBusy(false));
  }, [place.city, place.region]);

  useEffect(() => { load(); const t = setInterval(load, 10 * 60 * 1000); return () => clearInterval(t); }, [load]);
  useEffect(() => {
    const on = () => setPlace({ city: loadCity(), region: loadRegion() });
    window.addEventListener("nn:city", on);
    return () => window.removeEventListener("nn:city", on);
  }, []);
  useEffect(() => {
    const onKey = (e) => {
      if (e.ctrlKey || e.metaKey || e.altKey || ["INPUT", "TEXTAREA", "SELECT"].includes(document.activeElement?.tagName)) return;
      if (e.key === "Escape" || e.key === "w" || e.key === "W" || e.key === "n" || e.key === "N") { e.preventDefault(); onBack(); }
      if (e.key === "r" || e.key === "R") { e.preventDefault(); load(); }
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [onBack, load]);

  // The weather stories the archive holds (Shards Light): the last two days, best match first.
  useEffect(() => {
    let live = true;
    invoke("archive_search", { query: "hurricane storm tornado flood weather rain heat freeze tropical wildfire", days: 2, limit: 8 })
      .then((h) => live && setNews(Array.isArray(h) ? h : []))
      .catch(() => live && setNews([]));
    return () => { live = false; };
  }, [r && r.updated]);

  const moon = useMemo(() => moonPhase(new Date()), [r && r.updated]);
  const lows = r ? r.days.map((d) => d.low_f).filter((v) => v != null) : [];
  const highs = r ? r.days.map((d) => d.high_f).filter((v) => v != null) : [];
  const lo = lows.length ? Math.min(...lows) : 0;
  const span = Math.max(1, (highs.length ? Math.max(...highs) : 1) - lo);
  const t = r && r.today;
  const daylight = t && t.sunrise && t.sunset ? minutesOf(t.sunset) - minutesOf(t.sunrise) : null;

  return (
    <section className="wp" aria-label="Weather">
      <header className="wp-head">
        <div>
          <h1 className="wp-title">{r ? `${r.place}${r.region ? `, ${r.region}` : ""}` : place.city || "Weather"}</h1>
          <div className="wp-sub mono">{r ? `Updated ${clockLabel(r.updated)} · ${r.timezone}` : busy ? "Reading the forecast…" : ""}</div>
        </div>
        <div className="wp-actions">
          <button type="button" onClick={load} disabled={busy} className="wp-btn">{busy ? "Refreshing…" : "Refresh"} <kbd>R</kbd></button>
          <button type="button" onClick={onBack} className="wp-btn">Back to news <kbd>Esc</kbd></button>
        </div>
      </header>

      {err ? <p className="wp-err" role="alert">Could not load the weather: {err}</p> : null}

      {r && r.alerts && r.alerts.length ? (
        <ul className="wp-alerts" aria-label="Weather alerts">
          {r.alerts.map((a, i) => (
            <li key={`${a.event}-${i}`} className={`wp-alert wp-alert--${(a.severity || "").toLowerCase() || "unknown"}`}>
              <div className="wp-alert__top"><strong>{"⚠ "}{a.event}</strong>{a.severity ? <span className="mono">{a.severity}{a.urgency ? ` · ${a.urgency}` : ""}</span> : null}</div>
              {a.areas ? <div className="wp-alert__areas">{a.areas}</div> : null}
              {a.expires ? <div className="wp-alert__areas">Until {new Date(a.expires).toLocaleString(undefined, { weekday: "short", hour: "numeric", minute: "2-digit" })}</div> : null}
              {a.instruction || a.description ? <p className="wp-alert__text">{a.instruction || a.description}</p> : null}
            </li>
          ))}
        </ul>
      ) : null}

      <div className="wp-hero">
        {r && r.lat != null ? <WeatherGlobe lat={r.lat} lon={r.lon} place={r.place} /> : <div className="wg wg--empty">{err ? "" : "Loading the map…"}</div>}
        {r ? (
          <div className="wp-now">
            <div className="wp-now__big"><span aria-hidden="true">{icon(r.now.label, r.now.is_day)}</span> {r.now.temp_f}°F</div>
            <div className="wp-now__label">{r.now.label}{r.now.feels_f != null && r.now.feels_f !== r.now.temp_f ? ` · feels like ${r.now.feels_f}°` : ""}</div>
            <div className="wp-now__hl">{t ? `High ${deg(t.high_f)} · Low ${deg(t.low_f)}` : ""}{t && t.precip_chance != null ? ` · ${t.precip_chance}% rain` : ""}</div>
            <div className="wp-tiles">
              <Tile label="Humidity" sub={r.now.dew_f != null ? `Dew point ${r.now.dew_f}°` : ""}>{pct(r.now.humidity)}</Tile>
              <Tile label="Wind" sub={r.now.gust_mph != null ? `Gusts ${r.now.gust_mph} mph` : ""}>{r.now.wind_mph == null ? "—" : `${r.now.wind_mph} mph ${compass(r.now.wind_dir)}`}</Tile>
              <Tile label="UV index" sub="Peak today">{t && t.uv_max != null ? t.uv_max : "—"}</Tile>
              <Tile label="Air quality" sub={r.air ? `PM2.5 ${r.air.pm25 ?? "—"} µg/m³` : ""}>{r.air ? `${r.air.aqi} · ${r.air.category}` : "—"}</Tile>
              <Tile label="Pressure" sub="Sea level">{r.now.pressure_in == null ? "—" : `${r.now.pressure_in} inHg`}</Tile>
              <Tile label="Visibility" sub={r.now.cloud != null ? `Cloud cover ${r.now.cloud}%` : ""}>{r.now.visibility_mi == null ? "—" : `${r.now.visibility_mi} mi`}</Tile>
            </div>
          </div>
        ) : null}
      </div>

      {r ? (
        <>
          <section className="wp-card"><h2 className="wp-h">Next 48 hours</h2><HourlyChart hours={r.hours} /><p className="wp-legend mono">Line: temperature · bars: chance of rain · shaded: night</p></section>

          <div className="wp-cols">
            <section className="wp-card">
              <h2 className="wp-h">Next {r.days.length} days</h2>
              <ol className="wp-days">
                {r.days.map((d, i) => (
                  <li key={d.date}>
                    <span className="wp-dn">{dayName(d.date, i)}</span>
                    <span className="wp-ic" aria-hidden="true" title={d.label}>{icon(d.label)}</span>
                    <span className="wp-rain mono" title="Chance of rain">{d.precip_chance == null ? "" : `${d.precip_chance}%`}</span>
                    <span className="wp-lo">{deg(d.low_f)}</span>
                    <span className="wp-bar" aria-hidden="true"><i style={{ left: `${(((d.low_f ?? lo) - lo) / span) * 100}%`, width: `${Math.max(5, (((d.high_f ?? lo) - (d.low_f ?? lo)) / span) * 100)}%` }} /></span>
                    <span className="wp-hi">{deg(d.high_f)}</span>
                  </li>
                ))}
              </ol>
            </section>

            <div className="wp-stack">
              <section className="wp-card">
                <h2 className="wp-h">Sun and moon</h2>
                <div className="wp-tiles wp-tiles--2">
                  <Tile label="Sunrise">{t ? clockLabel(t.sunrise) : "—"}</Tile>
                  <Tile label="Sunset" sub={daylight != null ? `${Math.floor(daylight / 60)} h ${daylight % 60} min of daylight` : ""}>{t ? clockLabel(t.sunset) : "—"}</Tile>
                  <Tile label="Moon" sub={`${moon.illumination}% lit`}>{moon.name}</Tile>
                  <Tile label={moon.waxing ? "Full moon in" : "New moon in"} sub="Estimated">{`${moon.waxing ? moon.daysToFull : moon.daysToNew} days`}</Tile>
                </div>
              </section>
              {r.marine ? (
                <section className="wp-card">
                  <h2 className="wp-h">Sea conditions</h2>
                  <div className="wp-tiles wp-tiles--2">
                    <Tile label="Waves">{r.marine.wave_ft == null ? "—" : `${r.marine.wave_ft} ft`}</Tile>
                    <Tile label="Swell" sub={r.marine.swell_period_s != null ? `Every ${r.marine.swell_period_s} s` : ""}>{r.marine.swell_ft == null ? "—" : `${r.marine.swell_ft} ft ${r.marine.swell_dir}`}</Tile>
                    <Tile label="Water">{r.marine.water_f == null ? "—" : `${r.marine.water_f}°F`}</Tile>
                  </div>
                </section>
              ) : null}
            </div>
          </div>

          <section className="wp-card">
            <h2 className="wp-h">Weather in the news</h2>
            {news === null ? <p className="wp-muted">Searching the archive…</p> : news.length ? (
              <ul className="wp-news">
                {news.map((h) => (
                  <li key={h.id}>
                    <div className="wp-news__t">{h.title}</div>
                    <div className="wp-news__m mono">{(Array.isArray(h.tags) && h.tags[0]) || ""} · {h.event_time ? ageLabel(Date.parse(h.event_time)) : ""}</div>
                  </li>
                ))}
              </ul>
            ) : <p className="wp-muted">No weather stories in the archive from the last two days.</p>}
          </section>
        </>
      ) : null}

      <p className="wp-credit">
        Weather by <button type="button" onClick={() => invoke("weather_open_credit", { which: "open-meteo" }).catch(() => {})}>Open-Meteo.com</button> (CC BY 4.0)
        {" · "}Radar by <button type="button" onClick={() => invoke("weather_open_credit", { which: "rainviewer" }).catch(() => {})}>RainViewer</button>
        {" · "}3D globe by <button type="button" onClick={() => invoke("weather_open_credit", { which: "cesium" }).catch(() => {})}>Cesium</button>
        {r && ((r.alerts && r.alerts.length) || r.marine) ? <>{" · "}Alerts and sea by <button type="button" onClick={() => invoke("weather_open_credit", { which: "weatherapi" }).catch(() => {})}>WeatherAPI.com</button></> : null}
      </p>
    </section>
  );
}
