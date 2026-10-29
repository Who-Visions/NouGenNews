import { useMemo } from "react";
import { buildEdition } from "../../core/edition.js";
import "./FrontSections.css";

// The sections of the edition under the lead: one channel per section, three stories each.
export function FrontSections({ stories, terms, counts, onRead, onPickSection }) {
  const sections = useMemo(() => buildEdition(stories, { terms, secondaryCount: 5, perSection: 3 }).sections.filter((s) => s.stories.length), [stories, terms]);
  if (!sections.length) return null;
  return (
    <div className="fs">
      {sections.map((sec, n) => (
        <section key={sec.name} className="fs__sec" aria-label={sec.name}>
          <header className="fs__head">
            <span className="fs__dot" aria-hidden="true" />
            <h2>{sec.name}</h2>
            <span className="fs__chan">Wire channel {String(n + 1).padStart(2, "0")}</span>
            <button type="button" className="fs__all" onClick={() => onPickSection(sec.name)}>View all ({counts[sec.name] ?? sec.stories.length})</button>
          </header>
          <div className="fs__grid">
            {sec.stories.map((s) => (
              <button type="button" key={s.id} className="fs__card" onClick={() => onRead(s)}>
                {s.imageUrl ? <img src={s.imageUrl} alt="" loading="lazy" referrerPolicy="no-referrer" /> : <span className="fs__noimg" />}
                <span className="fs__meta">
                  <b>{s.source}</b><span>{s.readMins} min read</span>
                  {s.libraryHits?.length ? <em title={s.libraryHits.join(", ")}>&#9829; In your library</em> : null}
                </span>
                <span className="fs__title">{s.title}</span>
                <span className="fs__desc">{s.desc}</span>
                <span className="fs__more">Read dispatch &rarr;</span>
              </button>
            ))}
          </div>
        </section>
      ))}
    </div>
  );
}
