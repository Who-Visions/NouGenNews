import { useEffect, useRef, useState } from "react";
import "./LangMenu.css";

// Headline language as one dropdown instead of four buttons: the current choice on the button,
// the options (flag, name) in a list. T still cycles it from the keyboard.
export function LangMenu({ langs, value, busy, onPick }) {
  const [open, setOpen] = useState(false);
  const ref = useRef(null);
  const cur = langs.find((l) => l.code === value) || langs[0];

  useEffect(() => {
    if (!open) return undefined;
    const away = (e) => { if (ref.current && !ref.current.contains(e.target)) setOpen(false); };
    const esc = (e) => { if (e.key === "Escape") { e.stopImmediatePropagation(); setOpen(false); } };
    window.addEventListener("mousedown", away);
    window.addEventListener("keydown", esc, true);
    return () => { window.removeEventListener("mousedown", away); window.removeEventListener("keydown", esc, true); };
  }, [open]);

  return (
    <div className="lm" ref={ref} data-testid="wire-translate-group" title="Translate all wire headlines and dispatches (T cycles)">
      <button type="button" className="lm__btn" aria-haspopup="listbox" aria-expanded={open} onClick={() => setOpen((o) => !o)}>
        <span aria-hidden="true">{busy ? "⟳" : cur.flag}</span>
        <span>{cur.label}</span>
        <span className="lm__caret" aria-hidden="true">&#9662;</span>
      </button>
      {open && (
        <ul className="lm__list" role="listbox" aria-label="Headline language">
          {langs.map((l) => (
            <li key={l.code} role="option" aria-selected={l.code === value}>
              <button type="button" data-testid={`wire-lang-${l.code}`} className={l.code === value ? "is-active" : ""} onClick={() => { onPick(l.code); setOpen(false); }}>
                <span aria-hidden="true">{l.flag}</span>
                <span className="lm__name">{l.label}</span>
                {l.code === value ? <span className="lm__tick" aria-hidden="true">&#10003;</span> : null}
              </button>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}
