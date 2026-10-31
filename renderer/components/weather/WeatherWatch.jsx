import React, { useEffect, useState } from "react";
import { invoke } from "../../lib/bridge.js";
import { addPlace, hasPlace, loadWatchlist, movePlace, removePlace, saveWatchlist } from "../../lib/watchlist.js";

const keyOf = (p) => `${p.city}|${p.region || ""}`;

// Saved places: each chip shows its live temperature and opens that place; the arrows reorder, the cross removes.
export function WeatherWatch({ place, onPick }) {
  const [list, setList] = useState(loadWatchlist);
  const [temps, setTemps] = useState({});
  useEffect(() => { saveWatchlist(list); }, [list]);
  useEffect(() => {
    let live = true;
    for (const p of list) {
      invoke("weather_report", { city: p.city, region: p.region })
        .then((r) => { if (live) setTemps((t) => ({ ...t, [keyOf(p)]: r && r.now ? Math.round(r.now.temp_f) : null })); })
        .catch(() => { if (live) setTemps((t) => ({ ...t, [keyOf(p)]: null })); });
    }
    return () => { live = false; };
  }, [list]);
  const saved = hasPlace(list, place);
  return (
    <nav className="ww" aria-label="Saved places">
      {list.map((p) => {
        const t = temps[keyOf(p)];
        const active = hasPlace([p], place);
        return (
          <span key={keyOf(p)} className={`ww__chip${active ? " is-active" : ""}`}>
            <button type="button" aria-label={`Move ${p.city} left`} onClick={() => setList((l) => movePlace(l, p, -1))}>‹</button>
            <button type="button" className="ww__go" aria-current={active || undefined} onClick={() => onPick(p)}>
              {p.city} <span className="mono">{t == null ? "–" : `${t}°`}</span>
            </button>
            <button type="button" aria-label={`Move ${p.city} right`} onClick={() => setList((l) => movePlace(l, p, 1))}>›</button>
            <button type="button" aria-label={`Remove ${p.city}`} onClick={() => setList((l) => removePlace(l, p))}>×</button>
          </span>
        );
      })}
      {!saved && place.city ? <button type="button" className="ww__add" onClick={() => setList((l) => addPlace(l, place))}>+ Save {place.city}</button> : null}
    </nav>
  );
}
