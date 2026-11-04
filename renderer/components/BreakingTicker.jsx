import { useMemo } from "react";
import { buildEdition } from "../../core/edition.js";
import "./BreakingTicker.css";

// The front-page ticker: the edition's top stories, library matches first, scrolling right to left.
// Pauses on hover and focus; under reduced motion it stops and the row scrolls by hand instead.
export function BreakingTicker({ stories, terms, onOpen, intro = [] }) {
  const items = useMemo(() => {
    const ed = buildEdition(stories, { terms, secondaryCount: 8 });
    const top = [ed.lead, ...ed.secondary].filter(Boolean);
    return top.sort((a, b) => (b.libraryHits?.length ? 1 : 0) - (a.libraryHits?.length ? 1 : 0)).slice(0, 8);
  }, [stories, terms]);
  if (!items.length) return null;
  // Twice, so the loop has no seam.
  const lead = (suffix) => intro.map((t, i) => <span key={`i${i}${suffix}`} className="bt__intro" aria-hidden={suffix ? "true" : undefined}>{t}</span>);
  const row = (suffix) => [...lead(suffix), ...items.map((s) => (
    <button type="button" key={s.id + suffix} className="bt__item" onClick={() => onOpen(s)} title={s.title} tabIndex={suffix ? -1 : 0} aria-hidden={suffix ? "true" : undefined}>
      {s.libraryHits?.length ? <span className="bt__heart" aria-label="In your library">&#9829;</span> : null}
      {s.title}
    </button>
  ))];
  return (
    <div className="bt" role="region" aria-label="Breaking stories">
      <span className="bt__label"><i aria-hidden="true" />Breaking</span>
      <div className="bt__track">
        <div className="bt__row">{row("")}{row("-dup")}</div>
      </div>
    </div>
  );
}
