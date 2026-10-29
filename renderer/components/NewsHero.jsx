// The lead of the News tab: a hero carousel of the stories the app can play. One story fills the frame
// (poster, or the video itself once Play is pressed), the next ones wait in a strip at the side, and a
// thin progress bar runs while the carousel auto-advances. It pauses on hover, on focus, and while a
// video plays. Left/Right arrows step it; the parent owns the rest of the keyboard.
import { useEffect, useImperativeHandle, useRef, useState, forwardRef } from "react";
import { HeroScroller } from "./HeroScroller.jsx";
import { HeroTitle } from "./HeroTitle.jsx";

const DWELL_MS = 16000;

// The text the hero scroller carries: the feed's longer body when it has one (plain paragraphs, capped),
// otherwise the short summary.
function heroText(item) {
  try {
    const doc = new DOMParser().parseFromString(item.contentHtml || "", "text/html");
    const paras = [...doc.querySelectorAll("p")].map((p) => p.textContent.replace(/\s+/g, " ").trim()).filter((t) => t.length > 30 && !/pic[.]twitter[.]com|https?:[/][/]t[.]co[/]/i.test(t));
    const body = paras.join("\n\n");
    if (body.length > (item.desc || "").length + 40) return body.slice(0, 1600);
  } catch { /* fall back to the summary */ }
  return item.desc;
}

function Player({ video, embedPort }) {
  if (video.kind === "youtube") {
    const src = embedPort && embedPort !== "web"
      ? `http://localhost:${embedPort}/embed?id=${video.id}&autoplay=1`
      : `https://www.youtube.com/embed/${video.id}?autoplay=1&playsinline=1`;
    return <iframe className="nh-player" title="Video" src={src} allow="accelerometer; autoplay; clipboard-write; encrypted-media; gyroscope; picture-in-picture" allowFullScreen />;
  }
  return <video className="nh-player" src={video.url} controls autoPlay playsInline preload="metadata" />;
}

export const NewsHero = forwardRef(function NewsHero({ items, embedPort, onRead, onListen, onSource, listening }, ref) {
  const [index, setIndex] = useState(0);
  const [playing, setPlaying] = useState(false);
  const [held, setHeld] = useState(false); // hovered or focused: the clock stops
  const [tick, setTick] = useState(0); // restarts the progress animation
  const count = items.length;
  const safe = count ? Math.min(index, count - 1) : 0;
  const item = items[safe];

  const go = (n) => {
    if (!count) return;
    setIndex(((n % count) + count) % count);
    setPlaying(false);
    setTick((t) => t + 1);
  };

  useImperativeHandle(ref, () => ({
    next: () => go(safe + 1),
    prev: () => go(safe - 1),
    togglePlay: () => setPlaying((p) => !p),
    current: () => item,
  }), [safe, count, item]);

  // Auto-advance. The timer, not the CSS, decides when; the bar only shows it.
  useEffect(() => {
    if (!count || playing || held) return undefined;
    const t = setTimeout(() => go(safe + 1), DWELL_MS);
    return () => clearTimeout(t);
  }, [safe, count, playing, held, tick]);

  // The list changed under us (a sync): keep the index in range.
  useEffect(() => { if (index >= count) setIndex(0); }, [count, index]);

  if (!item) return null;
  const running = !playing && !held;
  const video = item.videos && item.videos[0];

  return (
    <section
      className="news-hero"
      aria-roledescription="carousel"
      aria-label="Playable stories"
      onMouseEnter={() => setHeld(true)}
      onMouseLeave={() => setHeld(false)}
      onFocus={() => setHeld(true)}
      onBlur={(e) => { if (!e.currentTarget.contains(e.relatedTarget)) setHeld(false); }}
    >
      <div className="nh-frame" key={item.id}>
        {playing && video ? (
          <Player video={video} embedPort={embedPort} />
        ) : (
          <button type="button" className="nh-poster" onClick={() => (video ? setPlaying(true) : onRead(item))} aria-label={video ? `Play video: ${item.title}` : `Read: ${item.title}`}>
            {item.imageUrl ? <img src={item.imageUrl} alt="" loading="eager" decoding="async" referrerPolicy="no-referrer" /> : <span className="nh-poster-blank" />}
            {video ? <span className="nh-play" aria-hidden="true">▶</span> : null}
            {item.alertLevel ? <span className={`nh-tag nh-tag--${item.alertLevel}`}>{item.alertLevel === "red" ? "Red alert" : "Breaking"}</span> : video ? <span className="nh-tag">▶ Video</span> : null}
          </button>
        )}
      </div>

      <div className="nh-copy">
        <div className="nh-meta mono">
          <span className="nh-source">{item.source}</span>
          <span aria-hidden="true">·</span>
          <span>{item.timeFormatted}</span>
          <span aria-hidden="true">·</span>
          <span>{item.readMins} min read</span>
          <span className="nh-count">{safe + 1} / {count}</span>
        </div>
        <HeroTitle title={item.title} key={item.id} />
        {item.desc ? <HeroScroller text={heroText(item)} resetKey={item.id} /> : null}
        {item.creator ? <p className="nh-byline">By {item.creator}</p> : null}
        <div className="nh-actions">
          <button type="button" className="nh-btn nh-btn-primary" onClick={() => onRead(item)}>Read <kbd>Enter</kbd></button>
          {video ? <button type="button" className="nh-btn" onClick={() => setPlaying((p) => !p)}>{playing ? "Stop" : "Play"} <kbd>Space</kbd></button> : null}
          <button type="button" className="nh-btn" onClick={() => onListen(item)}>{listening ? "Stop listening" : "Listen"} <kbd>L</kbd></button>
          <button type="button" className="nh-btn" onClick={() => onSource(item.link)}>Open source in app</button>
        </div>
        {count > 1 && <div className="nh-nav">
          <button type="button" className="nh-arrow" onClick={() => go(safe - 1)} aria-label="Previous story">‹</button>
          <button type="button" className="nh-arrow" onClick={() => go(safe + 1)} aria-label="Next story">›</button>
          <span className="nh-hint mono">← → step</span>
        </div>}
      </div>

      {count > 1 && <ol className="nh-strip" aria-label="Up next">
        {items.map((it, i) => (
          <li key={it.id}>
            <button
              type="button"
              className={`nh-thumb${i === safe ? " on" : ""}`}
              onClick={() => go(i)}
              aria-current={i === safe ? "true" : undefined}
              aria-label={`${i + 1} of ${count}: ${it.title}`}
            >
              {it.imageUrl ? <img src={it.imageUrl} alt="" loading="lazy" decoding="async" referrerPolicy="no-referrer" /> : <span className="nh-poster-blank" />}
              <span className="nh-thumb-title">{it.title}</span>
              {i === safe ? (
                <span className="nh-progress" aria-hidden="true">
                  <span key={tick} className={`nh-progress-bar${running ? " run" : ""}`} style={{ animationDuration: `${DWELL_MS}ms` }} />
                </span>
              ) : null}
            </button>
          </li>
        ))}
      </ol>}
    </section>
  );
});
