import { useEffect, useRef, useState } from "react";
import { invoke } from "../lib/bridge.js";
import { hiResUrl } from "../lib/articleHtml.js";
import "./TailCarousel.css";

// A short brief for a promo, from the first paragraphs of its page. Fetched once on hover and kept.
const briefs = new Map();
async function loadBrief(url) {
  if (briefs.has(url)) return briefs.get(url);
  const p = invoke("article_fetch", { url })
    .then((r) => {
      const doc = new DOMParser().parseFromString(r?.html || "", "text/html");
      const text = [...doc.querySelectorAll("p")].map((n) => n.textContent.trim()).filter((t) => t.length > 40).slice(0, 3).join(" ");
      return { text: text.slice(0, 300) + (text.length > 300 ? "\u2026" : "") };
    })
    .catch(() => ({ text: "" }));
  briefs.set(url, p);
  return p;
}
// A promo picture at the sharpest size its host can give; if that fails, the original src.
function Pic({ src, width, className }) {
  const [url, setUrl] = useState(() => hiResUrl(src, width));
  useEffect(() => { setUrl(hiResUrl(src, width)); }, [src, width]);
  return <img className={className} src={url} alt="" loading="lazy" decoding="async" referrerPolicy="no-referrer" onError={() => { if (url !== src) setUrl(src); }} />;
}
const host = (u) => { try { return new URL(u).hostname.replace(/^www\./, ""); } catch { return ""; } };

// The promos a page carried after its story ("Next Article", "More Anime", ...), shown one at a time in the
// reader bar: they still load and still link out, but take a single line instead of a column of the story.
// Hovering the item opens a preview card: larger picture, title and a short brief.
export function TailCarousel({ items, onOpen, intervalMs = 6500 }) {
  const [i, setI] = useState(0);
  const [paused, setPaused] = useState(false);
  const [card, setCard] = useState(null);
  const timer = useRef(null);
  const count = items.length;
  const reduced = typeof window !== "undefined" && window.matchMedia?.("(prefers-reduced-motion: reduce)").matches;

  useEffect(() => { setI(0); setCard(null); }, [items]);
  useEffect(() => {
    if (count < 2 || paused || reduced) return undefined;
    const t = setInterval(() => setI((n) => (n + 1) % count), intervalMs);
    return () => clearInterval(t);
  }, [count, paused, reduced, intervalMs]);
  useEffect(() => () => clearTimeout(timer.current), []);

  if (!count) return null;
  const it = items[i % count];
  const step = (d) => setI((n) => (n + d + count) % count);
  const showCard = () => {
    clearTimeout(timer.current);
    timer.current = setTimeout(async () => {
      setCard({ href: it.href, loading: true });
      const b = await loadBrief(it.href);
      setCard((c) => (c && c.href === it.href ? { href: it.href, ...b } : c));
    }, 280);
  };
  const hideCard = () => { clearTimeout(timer.current); setCard(null); };
  const open = card && card.href === it.href ? card : null;

  return (
    <div className="tail" onMouseEnter={() => setPaused(true)} onMouseLeave={() => { setPaused(false); hideCard(); }} onFocus={() => setPaused(true)} onBlur={() => setPaused(false)} aria-label="More from this site" role="group">
      {count > 1 && <button type="button" className="tail__step" onClick={() => step(-1)} aria-label="Previous">&#8249;</button>}
      <div className="tail__slot" onMouseEnter={showCard} onMouseLeave={hideCard}>
        <button type="button" key={it.href} className="tail__item" onClick={() => onOpen(it.href)} title={it.title} aria-describedby={open ? "tail-card" : undefined}>
          {it.img ? <Pic src={it.img} width={56} /> : null}
          <span className="tail__title">{it.title}</span>
        </button>
        {open && (
          <div className="tail__card" id="tail-card" role="tooltip">
            {it.img ? <Pic className="tail__cardimg" src={it.img} width={340} /> : null}
            <div className="tail__cardbody">
              <b>{it.title}</b>
              <p>{open.loading ? "Loading a preview\u2026" : open.text || "No preview available. Click to open it."}</p>
              <span className="mono">{host(it.href)}</span>
            </div>
          </div>
        )}
      </div>
      {count > 1 && <button type="button" className="tail__step" onClick={() => step(1)} aria-label="Next">&#8250;</button>}
      {count > 1 && <span className="tail__count mono">{(i % count) + 1}/{count}</span>}
    </div>
  );
}
