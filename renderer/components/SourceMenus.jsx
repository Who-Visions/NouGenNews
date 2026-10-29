import { useEffect, useMemo, useRef, useState } from "react";
import "./SourceMenus.css";

// The source strip as dropdowns: All Wire and In your library, then one menu per print section holding
// its sources. Clicking a section's name shows the whole section; the caret opens the list.
export function SourceMenus({ feeds, counts, activeFeed, onPick, localLabel, localVia }) {
  const [open, setOpen] = useState(null);
  const ref = useRef(null);

  const sections = useMemo(() => {
    const map = new Map();
    for (const f of feeds) {
      if (f.id === "all" || f.id === "local" || !f.section) continue;
      if (!map.has(f.section)) map.set(f.section, []);
      map.get(f.section).push(f);
    }
    return [...map];
  }, [feeds]);

  useEffect(() => {
    if (open === null) return undefined;
    const away = (e) => { if (ref.current && !ref.current.contains(e.target)) setOpen(null); };
    const esc = (e) => { if (e.key === "Escape") { e.stopImmediatePropagation(); setOpen(null); } };
    window.addEventListener("mousedown", away);
    window.addEventListener("keydown", esc, true);
    return () => { window.removeEventListener("mousedown", away); window.removeEventListener("keydown", esc, true); };
  }, [open]);

  const pick = (id) => { onPick(id); setOpen(null); };
  const sectionCount = (items) => items.reduce((n, f) => n + (counts[f.id] || 0), 0);
  const activeIn = (name, items) => activeFeed === `section:${name}` || items.some((f) => f.id === activeFeed);

  return (
    <div className="sm" ref={ref} role="menubar" aria-label="Sources">
      <button type="button" className={`sm__btn${activeFeed === "all" ? " is-active" : ""}`} onClick={() => pick("all")}>
        All Wire <span className="sm__n mono">{counts.all ?? 0}</span>
      </button>
      {(counts.library ?? 0) > 0 && (
        <button type="button" title="Stories about titles in your library" className={`sm__btn${activeFeed === "library" ? " is-active" : ""}`} onClick={() => pick("library")}>
          <span className="sm__heart" aria-hidden="true">&#9829;</span> Library <span className="sm__n mono">{counts.library}</span>
        </button>
      )}
      {(counts.local ?? 0) > 0 && (
        <button type="button" title={`News about your city (change it in Settings)${localVia === "serpapi" ? " \u00b7 via SerpApi" : localVia ? " \u00b7 via Google News" : ""}`} className={`sm__btn${activeFeed === "local" ? " is-active" : ""}`} onClick={() => pick("local")}>
          <span aria-hidden="true">&#128205;</span> {localLabel || "Near you"} <span className="sm__n mono">{counts.local}</span>
        </button>
      )}
      {sections.map(([name, items], i) => (
        <div key={name} className="sm__menu">
          <div className={`sm__split${activeIn(name, items) ? " is-active" : ""}`}>
            <button type="button" className="sm__main" onClick={() => pick(`section:${name}`)}>
              {name} <span className="sm__n mono">{sectionCount(items)}</span>
            </button>
            <button type="button" className="sm__caret" aria-haspopup="true" aria-expanded={open === i} aria-label={`${name} sources`} onClick={() => setOpen(open === i ? null : i)}>&#9662;</button>
          </div>
          {open === i && (
            <ul className="sm__list" role="menu">
              {items.map((f) => (
                <li key={f.id} role="none">
                  <button type="button" role="menuitem" className={activeFeed === f.id ? "is-active" : ""} onClick={() => pick(f.id)}>
                    <span className="sm__icon" aria-hidden="true">{f.icon}</span>
                    <span className="sm__name">{f.name}</span>
                    <span className="sm__n mono">{counts[f.id] ?? 0}</span>
                  </button>
                </li>
              ))}
            </ul>
          )}
        </div>
      ))}
    </div>
  );
}
