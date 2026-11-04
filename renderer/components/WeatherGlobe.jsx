import React, { useCallback, useEffect, useRef, useState } from "react";
import { invoke } from "../lib/bridge.js";

const clockOf = (ms) => new Date(ms).toLocaleTimeString([], { hour: "numeric", minute: "2-digit" });

// A 3D globe (or flat map, by the mode button) centred on the place, with the latest radar draped over it as a loop of
// frames. CesiumJS runs in its own page inside a frame (public/globe.html): it needs a looser security policy than the app,
// so it gets one of its own and no access to the app's bridge. The two talk by messages: the app sends the place, the
// token and the radar frames; the globe says when it is ready or has failed. The globe only ever shows data: satellite
// imagery from Cesium ion, rain from RainViewer, a marker at the place's coordinates. Nothing on it is drawn from a model.
export function WeatherGlobe({ lat, lon, place }) {
  const frameEl = useRef(null);
  const [phase, setPhase] = useState("loading"); // loading | ready | error
  const [error, setError] = useState("");
  const [radarOn, setRadarOn] = useState(true);
  const [playing, setPlaying] = useState(true);
  const [frame, setFrame] = useState(0);
  const [radar, setRadar] = useState(null);

  const post = useCallback((m) => {
    const w = frameEl.current && frameEl.current.contentWindow;
    if (w) w.postMessage(m, "*");
  }, []);

  useEffect(() => {
    let dead = false;
    const onMessage = async (e) => {
      if (!frameEl.current || e.source !== frameEl.current.contentWindow) return;
      const m = e.data || {};
      if (m.type === "ready") {
        const [cfg, rv] = await Promise.all([
          invoke("weather_globe_config").catch(() => ({ token: "" })),
          invoke("weather_radar").catch(() => null),
        ]);
        if (dead) return;
        setRadar(rv && rv.frames && rv.frames.length ? rv : null);
        if (rv && rv.frames && rv.frames.length) {
          const past = rv.frames.filter((f) => !rv.nowcastFrom || f.time < rv.nowcastFrom).length;
          setFrame(Math.max(0, past - 1)); // start on the newest observed frame, not on a forecast one
        }
        post({
          type: "init",
          lat,
          lon,
          place,
          token: (cfg && cfg.token) || "",
          radar: rv && rv.frames ? { host: rv.host, frames: rv.frames } : null,
        });
      } else if (m.type === "started") {
        setPhase("ready");
      } else if (m.type === "error") {
        setError(String(m.message || "The globe stopped"));
        setPhase((p) => (p === "ready" ? p : "error"));
      }
    };
    window.addEventListener("message", onMessage);
    return () => {
      dead = true;
      window.removeEventListener("message", onMessage);
    };
  }, [lat, lon, place, post]);

  // One radar frame at a time; the rest stay loaded but invisible so the loop does not stutter.
  useEffect(() => {
    if (phase === "ready") post({ type: "frame", index: frame, on: radarOn });
  }, [frame, radarOn, phase, post]);

  const count = radar ? radar.frames.length : 0;
  useEffect(() => {
    if (!playing || !radarOn || count < 2 || window.matchMedia?.("(prefers-reduced-motion: reduce)").matches)
      return undefined;
    const t = setInterval(() => setFrame((f) => (f + 1) % count), 800);
    return () => clearInterval(t);
  }, [playing, radarOn, count]);

  const f = radar ? radar.frames[frame] : null;
  const ahead = f && radar.nowcastFrom && f.time >= radar.nowcastFrom;

  return (
    <div className="wg" aria-label={`3D Weather Globe for ${place}`}>
      <iframe ref={frameEl} className="wg__map" src="./globe.html" title={`Globe centred on ${place}`} />

      {phase === "loading" ? (
        <div className="wg__note mono">Loading instrument map…</div>
      ) : null}

      {phase === "error" ? (
        <div className="wg__note wg__note--err mono" role="alert">
          Offline: the 3D globe is unavailable. Weather report remains active.
          {error ? ` (${error})` : ""}
        </div>
      ) : null}

      {phase === "ready" ? (
        <div className="wg__bar">
          <div className="wg__controls">
            <button type="button" className="wg__btn" onClick={() => post({ type: "home" })}>
              Home
            </button>
            <button
              type="button"
              className={`wg__btn ${radarOn ? "on" : ""}`}
              onClick={() => setRadarOn((v) => !v)}
              aria-pressed={radarOn}
              disabled={!count}
            >
              Radar
            </button>
            {count > 1 ? (
              <button
                type="button"
                className="wg__btn"
                onClick={() => setPlaying((p) => !p)}
                disabled={!radarOn}
              >
                {playing ? "Pause" : "Play"}
              </button>
            ) : null}
            {count > 1 ? (
              <input
                type="range"
                className="wg__scrubber"
                min="0"
                max={count - 1}
                value={frame}
                disabled={!radarOn}
                onChange={(e) => {
                  setPlaying(false);
                  setFrame(Number(e.target.value));
                }}
                aria-label="Radar time scrubber"
              />
            ) : null}
          </div>

          <div className="wg__meta">
            {count > 0 && radarOn && f ? (
              <div className="wg__frame-readout mono">
                <span className={`wg__badge ${ahead ? "wg__badge--forecast" : "wg__badge--live"}`}>
                  {ahead ? "FORECAST" : "OBSERVED"}
                </span>
                <span className="wg__time">{clockOf(f.time)}</span>
              </div>
            ) : (
              <span className="wg__time mono">{!count ? "No radar frames" : "Radar paused"}</span>
            )}

            {/* Radar Intensity Legend */}
            <div className="wg__legend mono" aria-label="Precipitation intensity legend">
              <span className="wg__legend-item"><i className="wg__swatch wg__swatch--light" />Light</span>
              <span className="wg__legend-item"><i className="wg__swatch wg__swatch--mod" />Mod</span>
              <span className="wg__legend-item"><i className="wg__swatch wg__swatch--heavy" />Heavy</span>
              <span className="wg__legend-item"><i className="wg__swatch wg__swatch--severe" />Severe</span>
            </div>
          </div>
        </div>
      ) : null}
    </div>
  );
}
