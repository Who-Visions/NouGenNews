import { useEffect, useRef } from "react";

// A hero summary in a fixed-height window that scrolls itself slowly. It is a normal scrollable box:
// the wheel, keyboard and scrollbar all work. Hovering, focusing or scrolling by hand stops the drift
// for a few seconds; reduced motion turns the drift off. Starts over (after a pause) at the bottom.
const PX_PER_SEC = 16;
const IDLE_PAUSE_MS = 4000;
const END_PAUSE_MS = 2500;

export function HeroScroller({ text, resetKey }) {
  const box = useRef(null);
  const state = useRef({ hold: false, resumeAt: 0 });

  useEffect(() => {
    const el = box.current;
    if (!el) return undefined;
    el.scrollTop = 0;
    state.current.resumeAt = performance.now() + 1800;
    if (window.matchMedia?.("(prefers-reduced-motion: reduce)").matches) return undefined;
    let raf = 0;
    let last = performance.now();
    let pos = 0;
    const tick = (now) => {
      const dt = Math.min(0.1, (now - last) / 1000);
      last = now;
      const max = el.scrollHeight - el.clientHeight;
      if (max > 4 && !state.current.hold && now >= state.current.resumeAt) {
        // Follow the reader if they scrolled it themselves, then keep drifting from there.
        if (Math.abs(el.scrollTop - pos) > 2) pos = el.scrollTop;
        pos += PX_PER_SEC * dt;
        if (pos >= max) {
          pos = max;
          el.scrollTop = max;
          state.current.resumeAt = now + END_PAUSE_MS;
          setTimeout(() => { pos = 0; el.scrollTop = 0; }, END_PAUSE_MS - 50);
        } else {
          el.scrollTop = pos;
        }
      } else {
        pos = el.scrollTop;
      }
      raf = requestAnimationFrame(tick);
    };
    raf = requestAnimationFrame(tick);
    return () => cancelAnimationFrame(raf);
  }, [resetKey]);

  const stop = (ms = 0) => { state.current.resumeAt = Math.max(state.current.resumeAt, performance.now() + ms); };
  return (
    <div
      className="nh-scroller"
      ref={box}
      tabIndex={0}
      role="region"
      aria-label="Story summary"
      onMouseEnter={() => { state.current.hold = true; }}
      onMouseLeave={() => { state.current.hold = false; stop(IDLE_PAUSE_MS); }}
      onFocus={() => { state.current.hold = true; }}
      onBlur={() => { state.current.hold = false; stop(IDLE_PAUSE_MS); }}
      onWheel={() => stop(IDLE_PAUSE_MS)}
      onTouchStart={() => stop(IDLE_PAUSE_MS)}
      onKeyDown={() => stop(IDLE_PAUSE_MS)}
    >
      {String(text).split(/\n{2,}/).map((p, i) => <p key={i}>{p}</p>)}
    </div>
  );
}
