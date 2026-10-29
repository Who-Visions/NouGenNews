import React, { useEffect, useState } from "react";
import { PhotoCarousel } from "./PhotoCarousel.jsx";
import "./VideoDock.css";

// A story's videos, docked beside the article instead of in the middle of it: one player that stays in view while the
// text scrolls, and a strip to pick another video. YouTube plays through the app's loopback embed page, files directly.
export function VideoDock({ videos, photos = [], embedPort, autoplay = false, label = "", large = false }) {
  const [at, setAt] = useState(0);
  const [failed, setFailed] = useState(() => new Set());
  useEffect(() => { setAt(0); }, [videos]);
  const list = (videos || []).slice(0, 8).filter((v) => !failed.has(v.id || v.url));
  if (!list.length) return photos.length > 1 ? <aside className={`vdock${large ? " vdock--large" : ""}`} aria-label="Photos"><PhotoCarousel photos={photos} /></aside> : null;
  const v = list[Math.min(at, list.length - 1)];
  const src = v.kind === "youtube"
    ? (embedPort && embedPort !== "web" ? `http://localhost:${embedPort}/embed?id=${v.id}${autoplay ? "&autoplay=1" : ""}` : `https://www.youtube.com/embed/${v.id}?playsinline=1${autoplay ? "&autoplay=1" : ""}`)
    : "";
  return (
    <aside className={`vdock${large ? " vdock--large" : ""}`} aria-label="Videos">
      <div className="vdock__head mono"><span>Video</span>{list.length > 1 ? <span>{Math.min(at, list.length - 1) + 1} / {list.length}</span> : null}</div>
      <div className="vdock__player">
        {v.kind === "youtube" ? (
          <iframe key={v.id} title={label || "Video"} src={src} allow="accelerometer; autoplay; clipboard-write; encrypted-media; gyroscope; picture-in-picture" allowFullScreen />
        ) : (
          <video key={v.url} src={v.url} controls preload="metadata" playsInline onError={() => setFailed((p) => new Set(p).add(v.id || v.url))} />
        )}
      </div>
      {list.length > 1 ? (
        <div className="vdock__strip">
          {list.map((x, i) => (
            <button key={x.id || x.url} type="button" className={`vdock__thumb${i === at ? " is-on" : ""}`} onClick={() => setAt(i)} aria-label={`Video ${i + 1}`}>
              {x.kind === "youtube" ? <img src={`https://i.ytimg.com/vi/${x.id}/mqdefault.jpg`} alt="" loading="lazy" referrerPolicy="no-referrer" /> : <span>{i + 1}</span>}
            </button>
          ))}
        </div>
      ) : null}
      {photos.length > 1 ? <PhotoCarousel photos={photos} /> : null}
    </aside>
  );
}

// True while the window is at least `px` wide: the dock needs room beside the article.
export function useWide(px) {
  const q = `(min-width: ${px}px)`;
  const [wide, setWide] = useState(() => typeof window !== "undefined" && window.matchMedia(q).matches);
  useEffect(() => {
    const m = window.matchMedia(q);
    const on = () => setWide(m.matches);
    m.addEventListener("change", on);
    on();
    return () => m.removeEventListener("change", on);
  }, [q]);
  return wide;
}
