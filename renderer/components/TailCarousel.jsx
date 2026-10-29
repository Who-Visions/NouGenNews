import { useEffect, useState } from "react";
import "./TailCarousel.css";

// The promos a page carried after its story ("Next Article", "More Anime", ...), shown one at a time in the
// reader bar: they still load and still link out, but take a single line instead of a column of the story.
export function TailCarousel({ items, onOpen, intervalMs = 6500 }) {
  const [i, setI] = useState(0);
  const [paused, setPaused] = useState(false);
  const count = items.length;
  const reduced = typeof window !== "undefined" && window.matchMedia?.("(prefers-reduced-motion: reduce)").matches;

  useEffect(() => { setI(0); }, [items]);
  useEffect(() => {
    if (count < 2 || paused || reduced) return undefined;
    const t = setInterval(() => setI((n) => (n + 1) % count), intervalMs);
    return () => clearInterval(t);
  }, [count, paused, reduced, intervalMs]);

  if (!count) return null;
  const it = items[i % count];
  const step = (d) => setI((n) => (n + d + count) % count);
  return (
    <div className="tail" onMouseEnter={() => setPaused(true)} onMouseLeave={() => setPaused(false)} onFocus={() => setPaused(true)} onBlur={() => setPaused(false)} aria-label="More from this site" role="group">
      {count > 1 && <button type="button" className="tail__step" onClick={() => step(-1)} aria-label="Previous">&#8249;</button>}
      <button type="button" key={it.href} className="tail__item" onClick={() => onOpen(it.href)} title={it.title}>
        {it.img ? <img src={it.img} alt="" loading="lazy" referrerPolicy="no-referrer" /> : null}
        <span className="tail__title">{it.title}</span>
      </button>
      {count > 1 && <button type="button" className="tail__step" onClick={() => step(1)} aria-label="Next">&#8250;</button>}
      {count > 1 && <span className="tail__count mono">{(i % count) + 1}/{count}</span>}
    </div>
  );
}
