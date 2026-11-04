import { useEffect, useState } from "react";
import { loadCity, saveCity, defaultCity, loadMetro, loadScope, saveScope } from "./CornerClock.jsx";
import { invoke } from "../lib/bridge.js";
import "./NewsTree.css";

// Topic folders, by the badge each feed carries.
const GROUPS = [
  { name: "TV & Film", badges: ["TV & Film", "TV", "Movies"] },
  { name: "Comics & Anime", badges: ["Comics", "Anime", "Cartoons"] },
  { name: "AI", badges: ["AI Art", "AI"] },
  { name: "Tech", badges: ["Tech", "Phones"] },
  { name: "Games", badges: ["Games"] },
];

const GLASS_KEY = "nn.glass";
const AUTOPLAY_KEY = "nn.autoplay";

// Off unless the operator turns it on: stories never start playing on their own.
export function loadAutoplay() {
  try { return localStorage.getItem(AUTOPLAY_KEY) === "on"; } catch { return false; }
}

export function loadGlass() {
  try { return localStorage.getItem(GLASS_KEY) !== "off"; } catch { return true; }
}
export function applyGlass(on) {
  document.documentElement.classList.toggle("no-glass", !on);
  try { localStorage.setItem(GLASS_KEY, on ? "on" : "off"); } catch { /* storage unavailable */ }
}

// A file-explorer style drawer: the wire, then topic folders holding their sources, then Settings.
export function NewsTree({ open, onClose, feeds, counts, activeFeed, onPick, wireLang, langs, onLang, localLabel }) {
  const [closed, setClosed] = useState({});
  const [glass, setGlass] = useState(loadGlass);
  const [autoplay, setAutoplay] = useState(loadAutoplay);
  const [city, setCityText] = useState(loadCity);
  const [where, setWhere] = useState({ busy: false, note: "" });
  const [scope, setScopeState] = useState(loadScope);
  const [metro, setMetro] = useState(loadMetro);
  const locate = async () => {
    setWhere({ busy: true, note: "" });
    const r = await invoke("locate_me").catch(() => null);
    if (r && r.ok) { saveCity(r.city, r.region, r.metro); setCityText(r.city); setMetro(r.metro || ""); setWhere({ busy: false, note: `${r.city}, ${r.region}${r.metro ? ` \u00b7 metro ${r.metro}` : ""}` }); }
    else setWhere({ busy: false, note: r?.reason || "Could not find your location." });
  };
  const changeAutoplay = (on) => {
    setAutoplay(on);
    try { localStorage.setItem(AUTOPLAY_KEY, on ? "on" : "off"); } catch { /* storage unavailable */ }
  };

  useEffect(() => { applyGlass(glass); }, [glass]);
  useEffect(() => {
    if (!open) return undefined;
    const onKey = (e) => {
      if (e.key !== "Escape") return;
      e.preventDefault();
      e.stopImmediatePropagation();
      onClose();
    };
    window.addEventListener("keydown", onKey, true);
    return () => window.removeEventListener("keydown", onKey, true);
  }, [open, onClose]);

  if (!open) return null;
  const toggle = (name) => setClosed((c) => ({ ...c, [name]: !c[name] }));
  const leaf = (f) => (
    <li key={f.id}>
      <button type="button" className={`nt-leaf${activeFeed === f.id ? " is-active" : ""}`} onClick={() => { onPick(f.id); onClose(); }}>
        <span className="nt-icon" aria-hidden="true">{f.icon}</span>
        <span className="nt-name">{f.name}</span>
        <span className="nt-count mono">{counts[f.id] ?? 0}</span>
      </button>
    </li>
  );
  const all = feeds.find((f) => f.id === "all");
  const mine = { id: "library", icon: "♥", name: "In your library" };

  return (
    <div className="nt-scrim" onClick={onClose}>
      <nav className="nt-drawer" aria-label="Sources and settings" onClick={(e) => e.stopPropagation()}>
        <header className="nt-head">
          <span>Sources</span>
          <button type="button" className="nt-close" onClick={onClose} aria-label="Close menu">Close<kbd>Esc</kbd></button>
        </header>
        <ul className="nt-tree" role="tree">
          {all && leaf(all)}
          {(counts.library ?? 0) > 0 && leaf(mine)}
          {(counts.local ?? 0) > 0 && leaf({ id: "local", icon: "\uD83D\uDCCD", name: localLabel || "Near you" })}
          {GROUPS.map((g) => {
            const items = feeds.filter((f) => g.badges.includes(f.badge));
            if (!items.length) return null;
            const isClosed = !!closed[g.name];
            return (
              <li key={g.name}>
                <button type="button" className="nt-folder" aria-expanded={!isClosed} onClick={() => toggle(g.name)}>
                  <span className="nt-caret" aria-hidden="true">{isClosed ? "▸" : "▾"}</span>{g.name}
                </button>
                {!isClosed && <ul className="nt-children">{items.map(leaf)}</ul>}
              </li>
            );
          })}
          <li>
            <button type="button" className="nt-folder" aria-expanded={!closed.Settings} onClick={() => toggle("Settings")}>
              <span className="nt-caret" aria-hidden="true">{closed.Settings ? "▸" : "▾"}</span>Settings
            </button>
            {!closed.Settings && (
              <ul className="nt-children nt-settings">
                <li>
                  <label className="nt-row">
                    <input type="checkbox" checked={glass} onChange={(e) => setGlass(e.target.checked)} />
                    Glass blur
                  </label>
                  <div className="nt-row">
                    <button type="button" className="nt-chip" onClick={locate} disabled={where.busy}>{where.busy ? "Locating\u2026" : "Use my location"}</button>
                    {where.note ? <span className="nt-note" role="status">{where.note}</span> : null}
                  </div>
                </li>
                <li className="nt-row nt-langs" role="group" aria-label="Near you covers">
                  <span className="nt-note">Near you covers</span>
                  <button type="button" className={`nt-chip${scope === "metro" ? " is-active" : ""}`} onClick={() => { saveScope("metro"); setScopeState("metro"); }} title="The whole metro area: a wider net of news">Metro{metro ? ` (${metro})` : ""}</button>
                  <button type="button" className={`nt-chip${scope === "city" ? " is-active" : ""}`} onClick={() => { saveScope("city"); setScopeState("city"); }} title="Only your own city">City only</button>
                </li>
                <li>
                  <label className="nt-row">
                    <input type="checkbox" checked={autoplay} onChange={(e) => changeAutoplay(e.target.checked)} />
                    Autoplay videos in stories
                  </label>
                </li>
                <li>
                  <label className="nt-row">
                    City
                    <input className="nt-input" type="text" value={city} maxLength={60} onChange={(e) => setCityText(e.target.value)} onBlur={() => { saveCity(city.trim() === defaultCity() ? "" : city.trim(), "", ""); setMetro(""); }} onKeyDown={(e) => { if (e.key === "Enter") e.currentTarget.blur(); }} aria-label="City for the weather" />
                  </label>
                </li>
                <li className="nt-row nt-langs" role="group" aria-label="Translate headlines">
                  {langs.map((l) => (
                    <button key={l.code} type="button" className={`nt-chip${wireLang === l.code ? " is-active" : ""}`} onClick={() => onLang(l.code)}>
                      {l.label || l.code}
                    </button>
                  ))}
                </li>
              </ul>
            )}
          </li>
        </ul>
      </nav>
    </div>
  );
}
