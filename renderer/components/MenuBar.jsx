import { useEffect, useRef, useState } from "react";
import { invoke } from "../lib/bridge.js";
import { CornerClock } from "./CornerClock.jsx";
import { CastButton } from "./CastButton.jsx";
import "./MenuBar.css";

// Each item presses the key the news view already listens for, so menu and keyboard never drift apart.
const press = (key) => () => window.dispatchEvent(new KeyboardEvent("keydown", { key, bubbles: true }));
const browse = () => window.dispatchEvent(new CustomEvent("nn:browse-current"));

const MENUS = [
  { name: "File", items: [
    { label: "Open story", keys: "Enter", run: press("Enter") },
    { label: "Open source in app", keys: "", run: browse },
    { label: "Sync feeds", keys: "R", run: press("r") },
    { sep: true },
    { label: "Cast screen to a TV\u2026", keys: "", run: () => window.dispatchEvent(new CustomEvent("nn:cast")) },
    { label: "Restart app", keys: "", run: () => invoke("restart") },
    { label: "Exit", keys: "", run: () => invoke("quit").catch(() => window.close()) },
  ] },
  { name: "View", items: [
    { label: "Sources and settings", keys: "M", run: press("m") },
    { label: "Next story", keys: "J", run: press("j") },
    { label: "Previous story", keys: "K", run: press("k") },
    { label: "Play lead video", keys: "Space", run: press(" ") },
    { label: "Listen", keys: "L", run: press("l") },
  ] },
  { name: "Configuration", items: [
    { label: "Settings…", keys: "M", run: press("m") },
    { label: "Cycle translation", keys: "T", run: press("t") },
    { sep: true },
  ] },
  { name: "Help", items: [
    { label: "Keyboard help", keys: "?", run: press("?") },
    { label: "Show or hide menu bar", keys: "Ctrl+M", run: () => window.dispatchEvent(new CustomEvent("nn:toggle-menubar")) },
  ] },
];

export function MenuBar() {
  const [open, setOpen] = useState(null);
  const ref = useRef(null);
  const [shown, setShown] = useState(true);

  // Ctrl+M hides the bar for reading; Alt opens the first menu.
  useEffect(() => {
    const toggle = () => { setShown((v) => !v); setOpen(null); };
    const onKey = (e) => {
      if (e.ctrlKey && (e.key === "m" || e.key === "M")) { e.preventDefault(); toggle(); }
      else if (e.key === "Alt" && !e.repeat) { e.preventDefault(); setShown(true); setOpen((o) => (o === null ? 0 : null)); }
    };
    window.addEventListener("keydown", onKey);
    window.addEventListener("nn:toggle-menubar", toggle);
    return () => { window.removeEventListener("keydown", onKey); window.removeEventListener("nn:toggle-menubar", toggle); };
  }, []);

  useEffect(() => {
    if (open === null) return undefined;
    const away = (e) => { if (ref.current && !ref.current.contains(e.target)) setOpen(null); };
    const esc = (e) => { if (e.key === "Escape") { e.stopImmediatePropagation(); setOpen(null); } };
    window.addEventListener("mousedown", away);
    window.addEventListener("keydown", esc, true);
    return () => { window.removeEventListener("mousedown", away); window.removeEventListener("keydown", esc, true); };
  }, [open]);

  if (!shown) return null;
  return (
    <div className="menubar" role="menubar" ref={ref}>
      {MENUS.map((m, i) => (
        <div key={m.name} className="menubar__menu">
          <button type="button" role="menuitem" aria-haspopup="true" aria-expanded={open === i}
            className={open === i ? "is-open" : ""}
            onClick={() => setOpen(open === i ? null : i)}
            onMouseEnter={() => open !== null && setOpen(i)}>{m.name}</button>
          {open === i && (
            <ul className="menubar__list" role="menu">
              {m.items.map((it, j) => it.sep
                ? <li key={j} className="menubar__sep" role="separator" />
                : (
                  <li key={it.label} role="none">
                    <button type="button" role="menuitem" onClick={() => { setOpen(null); it.run(); }}>
                      <span>{it.label}</span><kbd>{it.keys}</kbd>
                    </button>
                  </li>
                ))}
            </ul>
          )}
        </div>
      ))}
      <CornerClock />
      <CastButton />
      <button type="button" className="menubar__restart" title="Restart the app" onClick={() => invoke("restart")}>&#8635; Restart</button>
    </div>
  );
}
