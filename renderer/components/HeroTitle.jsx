import { useEffect, useRef, useState } from "react";

// The hero headline on one line. A title that fits stays still; a longer one scrolls right to left in a
// seamless loop (two copies, one shown while the other follows). It pauses on hover and focus, and with
// reduced motion it wraps onto as many lines as it needs instead.
const PX_PER_SEC = 70;

export function HeroTitle({ title }) {
  const box = useRef(null);
  const text = useRef(null);
  const [run, setRun] = useState(null); // { seconds } when the title overflows

  useEffect(() => {
    const measure = () => {
      const b = box.current;
      const t = text.current;
      if (!b || !t) return;
      const reduced = window.matchMedia?.("(prefers-reduced-motion: reduce)").matches;
      if (reduced || t.scrollWidth <= b.clientWidth + 2) { setRun(null); return; }
      // One loop moves a copy plus its gap, at a steady pace whatever the length.
      setRun({ seconds: Math.max(8, Math.round((t.scrollWidth + 64) / PX_PER_SEC)) });
    };
    measure();
    const ro = new ResizeObserver(measure);
    if (box.current) ro.observe(box.current);
    if (document.fonts?.ready) document.fonts.ready.then(measure);
    return () => ro.disconnect();
  }, [title]);

  return (
    <h2 className={`nh-title nh-title--line${run ? " is-running" : ""}`} ref={box} aria-label={title}>
      <span className="nh-title__track" style={run ? { "--title-s": `${run.seconds}s` } : undefined}>
        <span className="nh-title__text" ref={text}>{title}</span>
        {run ? <span className="nh-title__text" aria-hidden="true">{title}</span> : null}
      </span>
    </h2>
  );
}
