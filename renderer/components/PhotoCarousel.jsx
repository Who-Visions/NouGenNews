import React, { useEffect, useState } from "react";
import "./PhotoCarousel.css";

// The story's pictures in a frame of fixed height. Each picture keeps its own proportions (a tall portrait and a wide
// panorama both sit whole inside the frame, never stretched or cropped). Rotates by itself; hovering or focusing
// pauses it, and a reader who prefers reduced motion gets no rotation.
export function PhotoCarousel({ photos, interval = 5000 }) {
  const [at, setAt] = useState(0);
  const [paused, setPaused] = useState(false);
  const [bad, setBad] = useState(() => new Set());
  const list = (photos || []).filter((p) => !bad.has(p.src));
  const reduce = typeof window !== "undefined" && window.matchMedia && window.matchMedia("(prefers-reduced-motion: reduce)").matches;
  useEffect(() => { setAt(0); }, [photos]);
  useEffect(() => {
    if (paused || reduce || list.length < 2) return undefined;
    const t = setInterval(() => setAt((i) => (i + 1) % list.length), interval);
    return () => clearInterval(t);
  }, [paused, reduce, list.length, interval]);
  if (!list.length) return null;
  const i = Math.min(at, list.length - 1);
  const p = list[i];
  const go = (d) => setAt((x) => (x + d + list.length) % list.length);
  return (
    <figure className="pcar" onMouseEnter={() => setPaused(true)} onMouseLeave={() => setPaused(false)} onFocus={() => setPaused(true)} onBlur={() => setPaused(false)}>
      <div className="pcar__frame">
        <img key={p.src} className="pcar__img" src={p.src} alt={p.alt} referrerPolicy="no-referrer" onError={() => setBad((b) => new Set(b).add(p.src))} />
        {list.length > 1 ? (
          <>
            <button type="button" className="pcar__step pcar__step--prev" onClick={() => go(-1)} aria-label="Previous photo">‹</button>
            <button type="button" className="pcar__step pcar__step--next" onClick={() => go(1)} aria-label="Next photo">›</button>
          </>
        ) : null}
      </div>
      <figcaption className="pcar__bar">
        <span className="pcar__cap">{p.alt}</span>
        {list.length > 1 ? (
          <span className="pcar__dots" role="tablist">
            {list.map((x, n) => <button key={x.src} type="button" role="tab" aria-selected={n === i} aria-label={`Photo ${n + 1}`} className={n === i ? "is-on" : ""} onClick={() => setAt(n)} />)}
          </span>
        ) : null}
      </figcaption>
    </figure>
  );
}
