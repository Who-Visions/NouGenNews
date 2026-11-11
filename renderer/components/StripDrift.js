import { useEffect, useRef, useState } from "react";

// A slow sideways drift for a horizontally scrollable row: the content moves right to left, and because the row holds
// two identical copies of its cards, wrapping back by exactly one copy is invisible. It is still a normal scrollable
// box (wheel, drag, scrollbar): hovering, focusing, touching or scrolling by hand stops the drift for a few seconds, and
// reduced motion turns it off. Nothing moves unless there is more content than room.
export const DRIFT_PX_PER_SEC = 22;
export const DRIFT_IDLE_PAUSE_MS = 4000;

export function useStripDrift(enabled, { pxPerSec = DRIFT_PX_PER_SEC } = {}) {
  const box = useRef(null);
  const state = useRef({ hold: false, resumeAt: 0 });

  useEffect(() => {
    const el = box.current;
    if (!el || !enabled) return undefined;
    if (window.matchMedia?.("(prefers-reduced-motion: reduce)").matches) return undefined;
    state.current.resumeAt = performance.now() + 1500;
    let raf = 0;
    let last = performance.now();
    let pos = el.scrollLeft;
    const pause = (ms = DRIFT_IDLE_PAUSE_MS) => { state.current.resumeAt = Math.max(state.current.resumeAt, performance.now() + ms); };
    const onWheel = () => pause();
    const onDown = () => { state.current.hold = true; };
    const onUp = () => { state.current.hold = false; pause(); };
    el.addEventListener("wheel", onWheel, { passive: true });
    el.addEventListener("pointerdown", onDown);
    window.addEventListener("pointerup", onUp);
    const tick = (now) => {
      // Follow the clock, not the frame rate: a window that is covered or minimized gets few animation frames, and the
      // drift should still cover the same distance per second. The cap only stops a long stall from jumping the row.
      const dt = Math.min(0.5, (now - last) / 1000);
      last = now;
      // One copy's width: from the first card to the first card of the second copy.
      const cards = el.querySelectorAll("[data-copy]");
      const half = cards.length ? [...cards].findIndex((c) => c.dataset.copy === "1") : -1;
      const copyWidth = half > 0 ? cards[half].offsetLeft - cards[0].offsetLeft : 0;
      // Wrapping by one copy is invisible only when the row overflows by at least one whole copy.
      if (copyWidth > 0 && el.scrollWidth - el.clientWidth >= copyWidth - 1 && !state.current.hold && now >= state.current.resumeAt) {
        // Follow the reader if they scrolled it themselves, then keep drifting from there.
        if (Math.abs(el.scrollLeft - pos) > 2) pos = el.scrollLeft;
        pos += pxPerSec * dt;
        if (pos >= copyWidth) pos -= copyWidth;
        el.scrollLeft = pos;
      } else {
        pos = el.scrollLeft;
      }
      raf = requestAnimationFrame(tick);
    };
    raf = requestAnimationFrame(tick);
    return () => {
      cancelAnimationFrame(raf);
      el.removeEventListener("wheel", onWheel);
      el.removeEventListener("pointerdown", onDown);
      window.removeEventListener("pointerup", onUp);
    };
  }, [enabled, pxPerSec]);

  // How many copies of the cards the row needs so that it always overflows by one whole copy (the loop point).
  const [reps, setReps] = useState(2);
  useEffect(() => {
    const el = box.current;
    if (!el || !enabled || typeof ResizeObserver === "undefined") return undefined;
    const measure = () => {
      const one = el.querySelector("[data-copy]");
      const per = Number(el.dataset.cards) || 0;
      if (!one || !per) return;
      const gap = parseFloat(getComputedStyle(el).columnGap) || 0;
      const copyWidth = per * (one.offsetWidth + gap);
      setReps(Math.min(8, Math.max(2, Math.ceil(el.clientWidth / copyWidth) + 1)));
    };
    measure();
    const ro = new ResizeObserver(measure);
    ro.observe(el);
    return () => ro.disconnect();
  }, [enabled]);

  const hold = (on) => { state.current.hold = on; if (!on) state.current.resumeAt = Math.max(state.current.resumeAt, performance.now() + DRIFT_IDLE_PAUSE_MS); };
  return { box, hold, reps };
}
