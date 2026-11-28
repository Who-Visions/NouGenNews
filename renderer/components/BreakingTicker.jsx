import { useEffect, useMemo, useRef } from "react";
import { buildEdition } from "../../core/edition.js";
import { Spring } from "../lib/canvas-anim/index.ts";
import "./BreakingTicker.css";

const CRUISE_PX_PER_SEC = 36;

// The front-page ticker: the edition's top stories, library matches first, driven by an imperative
// requestAnimationFrame loop with a Spring velocity controller (canvas-anim-ts). Hover/focus glides
// velocity smoothly to 0 instead of snapping; under reduced motion it stops and scrolls by hand.
export function BreakingTicker({ stories, terms, onOpen, intro = [] }) {
  const trackRef = useRef(null);
  const rowRef = useRef(null);
  const heldRef = useRef(false);

  const items = useMemo(() => {
    const ed = buildEdition(stories, { terms, secondaryCount: 8 });
    const top = [ed.lead, ...ed.secondary].filter(Boolean);
    return top.sort((a, b) => (b.libraryHits?.length ? 1 : 0) - (a.libraryHits?.length ? 1 : 0)).slice(0, 8);
  }, [stories, terms]);

  useEffect(() => {
    const track = trackRef.current;
    const row = rowRef.current;
    if (!track || !row || !items.length) return undefined;
    if (window.matchMedia?.("(prefers-reduced-motion: reduce)").matches) {
      row.style.transform = "";
      return undefined;
    }

    const speedSpring = new Spring(CRUISE_PX_PER_SEC, { stiffness: 120, damping: 20, mass: 1 });
    let offset = 0;
    let raf = 0;
    let last = performance.now();
    let onScreen = true;

    const io = typeof IntersectionObserver !== "undefined"
      ? new IntersectionObserver((entries) => { onScreen = entries[0]?.isIntersecting ?? true; }, { threshold: 0.01 })
      : null;
    if (io) io.observe(track);

    const tick = (now) => {
      const dt = Math.min(0.05, Math.max(0, (now - last) / 1000));
      last = now;
      if (!document.hidden && onScreen) {
        speedSpring.setTarget(heldRef.current ? 0 : CRUISE_PX_PER_SEC);
        const v = speedSpring.step(dt);
        const half = row.scrollWidth / 2;
        if (half > 0 && v > 0.01) {
          offset = (offset + v * dt) % half;
          // Left-to-right drift (counters the headline), hardware-accelerated outside React render.
          row.style.transform = `translate3d(${offset - half}px, 0, 0)`;
        }
      }
      raf = requestAnimationFrame(tick);
    };
    raf = requestAnimationFrame(tick);

    return () => {
      cancelAnimationFrame(raf);
      if (io) io.disconnect();
    };
  }, [items.length]);

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
    <div
      className="bt"
      role="region"
      aria-label="Breaking stories"
      onMouseEnter={() => { heldRef.current = true; }}
      onMouseLeave={() => { heldRef.current = false; }}
      onFocus={() => { heldRef.current = true; }}
      onBlur={(e) => { if (!e.currentTarget.contains(e.relatedTarget)) heldRef.current = false; }}
    >
      <span className="bt__label"><i aria-hidden="true" />Breaking</span>
      <div className="bt__track" ref={trackRef}>
        <div className="bt__row" ref={rowRef}>{row("")}{row("-dup")}</div>
      </div>
    </div>
  );
}
