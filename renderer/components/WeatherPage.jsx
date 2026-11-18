import React, { useCallback, useEffect, useMemo, useState } from "react";
import { invoke } from "../lib/bridge.js";
import { ageLabel } from "../lib/age.js";
import { moonPhase } from "../lib/moon.js";
import {
  computeWeatherSummary,
  computeWhatMattersToday,
  clockLabel,
} from "../lib/weatherSummary.js";
import { loadCity, loadRegion } from "./CornerClock.jsx";
import { WeatherWatch } from "./weather/WeatherWatch.jsx";
import { RainNowcast } from "./weather/RainNowcast.jsx";
import { WeatherGlobe } from "./WeatherGlobe.jsx";
import { WhatMattersToday } from "./weather/WhatMattersToday.jsx";
import { HourlyOutlook } from "./weather/HourlyOutlook.jsx";
import { DailyForecast } from "./weather/DailyForecast.jsx";
import { SunAndMoon } from "./weather/SunAndMoon.jsx";
import { WindCompass } from "./weather/WindCompass.jsx";
import "./WeatherPage.css";

const ICON = {
  Clear: "☀",
  "Partly cloudy": "⛅",
  Overcast: "☁",
  Cloudy: "☁",
  Fog: "☁",
  Drizzle: "☂",
  Rain: "☂",
  Snow: "❄",
  Thunderstorm: "⚡",
};
const icon = (label, isDay = true) => (label === "Clear" && !isDay ? "☾" : ICON[label] || "☁");
const deg = (n) => (n == null ? "—" : `${n}°`);
const pct = (n) => (n == null ? "—" : `${n}%`);

const Tile = ({ label, children, sub }) => (
  <div className="wp-tile">
    <div className="wp-tile__k mono">{label}</div>
    <div className="wp-tile__v mono">{children}</div>
    {sub ? <div className="wp-tile__s mono">{sub}</div> : null}
  </div>
);

// Loading skeleton for weather view
function WeatherSkeleton() {
  return (
    <div className="wp-skeleton" aria-label="Loading weather telemetry">
      <div className="wp-sk-summary" />
      <div className="wp-sk-matters">
        <div className="wp-sk-card" />
        <div className="wp-sk-card" />
        <div className="wp-sk-card" />
        <div className="wp-sk-card" />
      </div>
      <div className="wp-sk-hero">
        <div className="wp-sk-globe" />
        <div className="wp-sk-now" />
      </div>
      <div className="wp-sk-chart" />
      <div className="wp-sk-days" />
    </div>
  );
}

// The Weather tab: elevation of the desktop weather page with matte instrument surfaces,
// plain-English deterministic summary, 48-hour keyboard-scrubbable chart, 16-day outlook grouped by week,
// sun arc SVG, wind compass, and radar controls.
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
      .then((x) => {
        setR(x);
      })
      .catch((e) =>
        setErr(String((e && e.message) || e).replace(/^Error invoking remote method 'cmd': (Error: )?/, ""))
      )
      .finally(() => setBusy(false));
  }, [place.city, place.region]);

  useEffect(() => {
    load();
    const t = setInterval(load, 10 * 60 * 1000);
    return () => clearInterval(t);
  }, [load]);

  useEffect(() => {
    const on = () => setPlace({ city: loadCity(), region: loadRegion() });
    window.addEventListener("nn:city", on);
    return () => window.removeEventListener("nn:city", on);
  }, []);

  useEffect(() => {
    const onKey = (e) => {
      if (
        e.ctrlKey ||
        e.metaKey ||
        e.altKey ||
        ["INPUT", "TEXTAREA", "SELECT"].includes(document.activeElement?.tagName)
      )
        return;
      if (e.key === "Escape" || e.key === "w" || e.key === "W" || e.key === "n" || e.key === "N") {
        e.preventDefault();
        onBack();
      }
      if (e.key === "r" || e.key === "R") {
        e.preventDefault();
        load();
      }
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [onBack, load]);

  // Weather stories in the archive (Shards Light)
  useEffect(() => {
    let live = true;
    invoke("archive_search", {
      query: "hurricane storm tornado flood weather rain heat freeze tropical wildfire",
      days: 2,
      limit: 8,
    })
      .then((h) => live && setNews(Array.isArray(h) ? h : []))
      .catch(() => live && setNews([]));
    return () => {
      live = false;
    };
  }, [r && r.updated]);

  const moon = useMemo(() => moonPhase(new Date()), [r && r.updated]);
  const summary = useMemo(() => computeWeatherSummary(r), [r]);
  const matters = useMemo(() => computeWhatMattersToday(r), [r]);
  const t = r && r.today;

  return (
    <section className="wp" aria-label="Weather Observatory">
      <header className="wp-head">
        <div>
          <h1 className="wp-title">
            {r ? `${r.place}${r.region ? `, ${r.region}` : ""}` : place.city || "Weather"}
          </h1>
          <div className="wp-sub mono">
            {r
              ? `Updated ${clockLabel(r.updated)} · ${r.timezone}`
              : busy
              ? "Reading the atmospheric sensors…"
              : "Sensor offline"}
          </div>
        </div>
        <div className="wp-actions">
          <button type="button" onClick={load} disabled={busy} className="wp-btn">
            {busy ? "Refreshing…" : "Refresh"} <kbd>R</kbd>
          </button>
          <button type="button" onClick={onBack} className="wp-btn">
            Back to news <kbd>Esc</kbd>
          </button>
        </div>
      </header>

      <WeatherWatch place={place} onPick={setPlace} />

      {r && r.stale ? (
        <p className="ww-stale" role="status">Offline: showing the last report, {r.staleMinutes} min old.</p>
      ) : null}

      {/* Error state with retry action */}
      {err ? (
        <div className="wp-err-panel" role="alert">
          <div className="wp-err-msg">
            <span className="wp-err-icon">⚠</span>
            <span>Could not load the weather: {err}</span>
          </div>
          <button type="button" onClick={load} className="wp-btn wp-btn--retry">
            Retry <kbd>R</kbd>
          </button>
        </div>
      ) : null}

      {/* Severe Weather Alerts Banner */}
      {r && r.alerts && r.alerts.length ? (
        <ul className="wp-alerts" aria-label="Severe weather alerts">
          {r.alerts.map((a, i) => {
            const sev = (a.severity || "").toLowerCase();
            const sevClass =
              sev === "extreme" || sev === "severe"
                ? "wp-alert--severe"
                : sev === "moderate" || sev === "warning" || sev === "watch"
                ? "wp-alert--moderate"
                : "wp-alert--minor";

            return (
              <li key={`${a.event}-${i}`} className={`wp-alert ${sevClass}`}>
                <div className="wp-alert__top">
                  <strong className="wp-alert__title">⚠ {a.event || a.headline || "Weather Alert"}</strong>
                  <div className="wp-alert__badges mono">
                    {a.severity ? <span className="wp-alert__badge">{a.severity}</span> : null}
                    {a.urgency ? <span className="wp-alert__badge">{a.urgency}</span> : null}
                  </div>
                </div>
                {a.areas ? <div className="wp-alert__areas mono">Affected: {a.areas}</div> : null}
                {a.expires ? (
                  <div className="wp-alert__expires mono">
                    Active until{" "}
                    {new Date(a.expires).toLocaleString(undefined, {
                      weekday: "short",
                      month: "short",
                      day: "numeric",
                      hour: "numeric",
                      minute: "2-digit",
                    })}
                  </div>
                ) : null}
                {a.instruction || a.description ? (
                  <div className="wp-alert__text">
                    {a.instruction ? <p className="wp-alert__instruction"><strong>Action:</strong> {a.instruction}</p> : null}
                    {a.description && a.description !== a.instruction ? (
                      <p className="wp-alert__desc">{a.description}</p>
                    ) : null}
                  </div>
                ) : null}
              </li>
            );
          })}
        </ul>
      ) : null}

      {/* Deterministic Plain-English Summary Line */}
      {r && summary ? (
        <div className="wp-summary" aria-label="Plain English weather summary">
          <div className="wp-summary__badge mono">SUMMARY</div>
          <p className="wp-summary__text">{summary}</p>
        </div>
      ) : null}

      {/* "What Matters Today" 4-Card Instrument Cluster */}
      {r ? <RainNowcast steps={r.minutely} /> : null}
      {r && r.today && r.normal ? (
        <p className="wn-line">{r.today.high_f === r.normal.high_f ? "Today's high is right on" : `Today's high is ${Math.abs(Math.round(r.today.high_f - r.normal.high_f))}°F ${r.today.high_f > r.normal.high_f ? "above" : "below"}`} the {r.normal.years}-year average for this date ({r.normal.high_f}°F).</p>
      ) : null}
      {r && r.pollen ? (
        <p className="wn-line">Pollen, grains/m³: {r.pollen.map((p) => `${p.name} ${p.value}`).join(" · ")}</p>
      ) : null}
      {r && matters ? <WhatMattersToday matters={matters} /> : null}

      {/* Loading Skeleton */}
      {busy && !r ? <WeatherSkeleton /> : null}

      {/* Hero: 3D Globe Map + Current Conditions Instrument */}
      {r ? (
        <div className="wp-hero">
          {r.lat != null ? (
            <WeatherGlobe lat={r.lat} lon={r.lon} place={r.place} />
          ) : (
            <div className="wg wg--empty">No geographic coordinates available</div>
          )}

          <div className="wp-now" aria-label="Current conditions">
            <div className="wp-now__top">
              <div className="wp-now__big mono">
                <span className="wp-now__glyph" aria-hidden="true">{icon(r.now.label, r.now.is_day)}</span>
                <span>{r.now.temp_f}°F</span>
              </div>
              <div className="wp-now__label">
                {r.now.label}
                {r.now.feels_f != null && r.now.feels_f !== r.now.temp_f ? (
                  <span className="mono"> · Feels like {r.now.feels_f}°</span>
                ) : null}
              </div>
              <div className="wp-now__hl mono">
                {t ? `High ${deg(t.high_f)} · Low ${deg(t.low_f)}` : ""}
                {t && t.precip_chance != null ? ` · ${t.precip_chance}% rain` : ""}
              </div>
            </div>

            {/* Wind Compass */}
            <WindCompass dir={r.now.wind_dir} speed={r.now.wind_mph} gust={r.now.gust_mph} />

            {/* Instrument Readout Tiles */}
            <div className="wp-tiles">
              <Tile label="Humidity" sub={r.now.dew_f != null ? `Dew point ${r.now.dew_f}°` : ""}>
                {pct(r.now.humidity)}
              </Tile>
              <Tile label="UV index" sub={t && t.uv_max != null ? `Peak ${t.uv_max}` : "Current"}>
                {r.now.uv != null ? r.now.uv : t && t.uv_max != null ? t.uv_max : "—"}
              </Tile>
              <Tile label="Air quality" sub={r.air ? `PM2.5 ${r.air.pm25 ?? "—"} µg/m³` : "AQI scale"}>
                {r.air ? `${r.air.aqi} · ${r.air.category}` : "—"}
              </Tile>
              <Tile label="Pressure" sub="Sea level calibrated">
                {r.now.pressure_in == null ? "—" : `${r.now.pressure_in} inHg`}
              </Tile>
              <Tile label="Visibility" sub={r.now.cloud != null ? `Cloud cover ${r.now.cloud}%` : ""}>
                {r.now.visibility_mi == null ? "—" : `${r.now.visibility_mi} mi`}
              </Tile>
              <Tile label="Rain gauge" sub="Accumulation today">
                {t && t.precip_in != null ? `${t.precip_in} in` : "0.00 in"}
              </Tile>
            </div>
          </div>
        </div>
      ) : null}

      {/* 48-Hour Interactive Chart */}
      {r && r.hours && r.hours.length ? <HourlyOutlook hours={r.hours} /> : null}

      {/* Lower Section: 16-Day Outlook + Astronomical & Marine Telemetry */}
      {r ? (
        <div className="wp-cols">
          {/* 16-Day Forecast */}
          <DailyForecast days={r.days} />

          <div className="wp-stack">
            {/* Sun Arc & Moon Phase */}
            <SunAndMoon today={r.today} updated={r.updated} moon={moon} />

            {/* Sea Conditions */}
            {r.marine ? (
              <section className="wp-card wp-marine" aria-label="Marine conditions">
                <div className="wp-marine__head">
                  <h2 className="wp-h">Sea Conditions</h2>
                  <span className="mono wp-marine__meta">OFFSHORE TELEMETRY</span>
                </div>
                <div className="wp-tiles wp-tiles--marine">
                  <Tile label="Waves" sub="Significant height">
                    {r.marine.wave_ft == null ? "—" : `${r.marine.wave_ft} ft`}
                  </Tile>
                  <Tile
                    label="Swell"
                    sub={r.marine.swell_period_s != null ? `Every ${r.marine.swell_period_s}s` : ""}
                  >
                    {r.marine.swell_ft == null ? "—" : `${r.marine.swell_ft} ft ${r.marine.swell_dir || ""}`}
                  </Tile>
                  <Tile label="Water temperature" sub="Surface buoy">
                    {r.marine.water_f == null ? "—" : `${r.marine.water_f}°F`}
                  </Tile>
                </div>
              </section>
            ) : null}

            {/* Weather in the News */}
            <section className="wp-card wp-news-card" aria-label="Weather in the news">
              <div className="wp-news-card__head">
                <h2 className="wp-h">Weather in the News</h2>
                <span className="mono wp-news-card__meta">ARCHIVE WIRE</span>
              </div>
              {news === null ? (
                <p className="wp-muted mono">Searching the archive…</p>
              ) : news.length ? (
                <ul className="wp-news">
                  {news.map((h) => (
                    <li key={h.id} className="wp-news__item">
                      <div className="wp-news__t">{h.title}</div>
                      <div className="wp-news__m mono">
                        {(Array.isArray(h.tags) && h.tags[0]) || "Wire"} ·{" "}
                        {h.event_time ? ageLabel(Date.parse(h.event_time)) : ""}
                      </div>
                    </li>
                  ))}
                </ul>
              ) : (
                <p className="wp-muted mono">No weather stories in the archive from the last two days.</p>
              )}
            </section>
          </div>
        </div>
      ) : null}

      {/* Attribution & Credits line */}
      <footer className="wp-footer">
        <p className="wp-credit mono">
          Weather by{" "}
          <button
            type="button"
            onClick={() => invoke("weather_open_credit", { which: "open-meteo" }).catch(() => {})}
          >
            Open-Meteo.com
          </button>{" "}
          (CC BY 4.0)
          {" · "}Radar by{" "}
          <button
            type="button"
            onClick={() => invoke("weather_open_credit", { which: "rainviewer" }).catch(() => {})}
          >
            RainViewer
          </button>
          {" · "}3D globe by{" "}
          <button
            type="button"
            onClick={() => invoke("weather_open_credit", { which: "cesium" }).catch(() => {})}
          >
            Cesium
          </button>
          {r && ((r.alerts && r.alerts.length) || r.marine) ? (
            <>
              {" · "}Alerts and sea by{" "}
              <button
                type="button"
                onClick={() => invoke("weather_open_credit", { which: "weatherapi" }).catch(() => {})}
              >
                WeatherAPI.com
              </button>
            </>
          ) : null}
        </p>
      </footer>
    </section>
  );
}
