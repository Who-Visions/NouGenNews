import React, { useEffect, useLayoutEffect, useRef, useState } from "react";
import { hiResUrl, imageKey } from "../lib/articleHtml.js";
import "./Lightbox.css";

// A picture opened large. It grows out of the thumbnail it was clicked from (the animation runs between the two
// rectangles), steps through the story's other pictures with the arrow keys or buttons, and closes on Esc, a click on
// the backdrop or the close button. Reduced motion skips the animation.
export function Lightbox({ photos, index, origin, onClose }) {
  const [at, setAt] = useState(index);
  const [shown, setShown] = useState(false);
  const imgRef = useRef(null);
  const list = photos.length ? photos : [];
  const cur = list[Math.min(at, list.length - 1)];

  useLayoutEffect(() => {
    const el = imgRef.current;
    if (!el || shown || !origin || (typeof window.matchMedia === "function" && window.matchMedia("(prefers-reduced-motion: reduce)").matches)) { setShown(true); return; }
    const run = () => {
      const to = el.getBoundingClientRect();
      if (!to.width || !to.height) return;
      const dx = origin.left + origin.width / 2 - (to.left + to.width / 2);
      const dy = origin.top + origin.height / 2 - (to.top + to.height / 2);
      el.animate(
        [{ transform: `translate(${dx}px, ${dy}px) scale(${origin.width / to.width}, ${origin.height / to.height})`, opacity: 0.6 }, { transform: "none", opacity: 1 }],
        { duration: 280, easing: "cubic-bezier(0.2, 0.8, 0.2, 1)" },
      );
    };
    if (el.complete && el.naturalWidth) run(); else el.addEventListener("load", run, { once: true });
    setShown(true);
  }, [origin, shown]);

  useEffect(() => {
    const go = (d) => setAt((i) => (i + d + list.length) % list.length);
    const onKey = (e) => {
      e.stopPropagation(); // the story behind does not react while a picture is open
      if (e.key === "Escape") { e.preventDefault(); e.stopPropagation(); onClose(); }
      else if (e.key === "ArrowRight" && list.length > 1) { e.preventDefault(); e.stopPropagation(); go(1); }
      else if (e.key === "ArrowLeft" && list.length > 1) { e.preventDefault(); e.stopPropagation(); go(-1); }
    };
    window.addEventListener("keydown", onKey, true);
    return () => window.removeEventListener("keydown", onKey, true);
  }, [list.length, onClose]);

  if (!cur) return null;
  const step = (d) => setAt((i) => (i + d + list.length) % list.length);
  return (
    <div className="lbx" role="dialog" aria-modal="true" aria-label="Picture" onClick={onClose}>
      <button type="button" className="lbx__close" aria-label="Close" onClick={onClose}>×</button>
      {list.length > 1 ? <button type="button" className="lbx__step lbx__step--prev" aria-label="Previous picture" onClick={(e) => { e.stopPropagation(); step(-1); }}>‹</button> : null}
      <figure className="lbx__fig" onClick={(e) => e.stopPropagation()}>
        <img key={cur.src} ref={imgRef} className="lbx__img" src={hiResUrl(cur.src, 1800)} alt={cur.alt} referrerPolicy="no-referrer" onError={(e) => { if (e.currentTarget.src !== cur.src) e.currentTarget.src = cur.src; }} />
        <figcaption className="lbx__cap"><span>{cur.alt}</span>{list.length > 1 ? <span className="lbx__count">{Math.min(at, list.length - 1) + 1} / {list.length}</span> : null}</figcaption>
      </figure>
      {list.length > 1 ? <button type="button" className="lbx__step lbx__step--next" aria-label="Next picture" onClick={(e) => { e.stopPropagation(); step(1); }}>›</button> : null}
    </div>
  );
}

// The index in `photos` of the clicked picture (matched by its identity, not its exact address), or -1.
export function photoIndex(photos, src) {
  const k = imageKey(src);
  return photos.findIndex((p) => imageKey(p.src) === k);
}
