import React, { useEffect, useState } from "react";
import { invoke } from "../lib/bridge.js";
import { ageLabel } from "../lib/age.js";
import "./ShardsLitePanel.css";

const fmtBytes = (n) => (n >= 1048576 ? `${(n / 1048576).toFixed(1)} MB` : `${Math.max(1, Math.round(n / 1024))} KB`);
const fmtDay = (iso) => (iso ? new Date(iso).toLocaleDateString(undefined, { month: "short", day: "numeric", year: "numeric" }) : "—");

// NouGen Shards Light: this app's own database. Shows what it holds, searches it, exports it, and says plainly what the
// full NouGen Shards adds (the comparison comes from the package itself, not from this page).
export function ShardsLitePanel({ onClose }) {
  const [stats, setStats] = useState(null);
  const [info, setInfo] = useState(null);
  const [q, setQ] = useState("");
  const [hits, setHits] = useState(null);
  const [busy, setBusy] = useState(false);
  const [note, setNote] = useState("");

  const [full, setFull] = useState(null);

  useEffect(() => {
    invoke("archive_stats").then(setStats).catch((e) => setNote(String((e && e.message) || e)));
    invoke("archive_upgrade_info").then(setInfo).catch(() => {});
    invoke("archive_detect_full").then(setFull).catch(() => setFull(null));
  }, []);

  // Copies every kept story into the full NouGen Shards on this machine, after the reader confirms.
  const promote = async () => {
    if (!window.confirm(`Copy all ${stats ? stats.count.toLocaleString() : ""} archived stories into NouGen Shards on this machine? They keep their original dates and sources.`)) return;
    setBusy(true);
    setNote("Promoting the archive into NouGen Shards…");
    try {
      const r = await invoke("archive_promote");
      setNote(r.ok ? `Promoted: ${r.imported} new, ${r.skipped} already there, out of ${r.exported}. Bundle kept at ${r.bundle}` : `Promotion did not finish: ${r.error}. The bundle is at ${r.bundle}`);
    } catch (err) { setNote(String((err && err.message) || err)); }
    finally { setBusy(false); }
  };

  const search = async (e) => {
    e.preventDefault();
    if (!q.trim() || busy) return;
    setBusy(true);
    try { setHits(await invoke("archive_search", { query: q, limit: 12 })); setNote(""); }
    catch (err) { setNote(String((err && err.message) || err)); }
    finally { setBusy(false); }
  };

  const exportNow = async () => {
    setBusy(true);
    try { const r = await invoke("archive_export"); setNote(`Saved ${r.count} stories to ${r.file}`); }
    catch (err) { setNote(String((err && err.message) || err)); }
    finally { setBusy(false); }
  };

  return (
    <aside className="sl" role="complementary" aria-label="Shards Light" onKeyDown={(e) => { if (e.key === "Escape") { e.stopPropagation(); onClose(); } }}>
      <header className="sl__head mono">
        <span>Shards Light</span>
        <button type="button" className="sl__x" onClick={onClose} aria-label="Close Shards Light">×</button>
      </header>
      <div className="sl__body">
        <section>
          <h3 className="sl__h">This app's archive</h3>
          {stats ? (
            <dl className="sl__stats">
              <div><dt>Stories kept</dt><dd>{stats.count.toLocaleString()}</dd></div>
              <div><dt>Oldest</dt><dd>{fmtDay(stats.oldest)}</dd></div>
              <div><dt>Newest</dt><dd>{fmtDay(stats.newest)}</dd></div>
              <div><dt>Size on disk</dt><dd>{fmtBytes(stats.bytes)}</dd></div>
            </dl>
          ) : <p className="sl__muted">Reading the archive…</p>}
          <form className="sl__search" onSubmit={search}>
            <input value={q} onChange={(e) => setQ(e.target.value)} placeholder="Search every story kept…" aria-label="Search the archive" autoFocus />
            <button type="submit" disabled={busy || !q.trim()}>Search</button>
          </form>
          {hits ? (
            hits.length ? (
              <ul className="sl__hits">
                {hits.map((h) => (
                  <li key={h.id}>
                    <div className="sl__title">{h.title}</div>
                    <div className="sl__meta mono">{(Array.isArray(h.tags) && h.tags[0]) || ""} · {h.event_time ? ageLabel(Date.parse(h.event_time)) : ""}{h.access_count ? ` · read ${h.access_count}×` : ""}</div>
                    {h.snippet ? <div className="sl__snip">{h.snippet}</div> : null}
                  </li>
                ))}
              </ul>
            ) : <p className="sl__muted">Nothing in the archive matches that.</p>
          ) : null}
          <button type="button" className="sl__btn" onClick={exportNow} disabled={busy || !stats || !stats.count}>Export my archive</button>
          {note ? <p className="sl__note" role="status">{note}</p> : null}
        </section>

        {info ? (
          <section className="sl__upgrade">
            <h3 className="sl__h">Upgrade to {info.name}</h3>
            <p>{info.summary}</p>
            <table className="sl__table">
              <thead><tr><th scope="col"></th><th scope="col">Shards Light (this app)</th><th scope="col">{info.name}</th></tr></thead>
              <tbody>
                {info.comparison.map((c) => (
                  <tr key={c.feature}><th scope="row">{c.feature}</th><td>{c.light}</td><td>{c.full}</td></tr>
                ))}
              </tbody>
            </table>
            <p className="sl__muted">{info.upgrade}</p>
            {full && full.detected ? (
              <>
                <p className="sl__found" role="status">{info.name} is on this machine{full.node ? " and its node is running" : " (its node is not running)"}.</p>
                <button type="button" className="sl__btn sl__btn--go" onClick={promote} disabled={busy || !stats || !stats.count}>Promote this archive into {info.name}</button>
              </>
            ) : (
              <button type="button" className="sl__btn sl__btn--go" onClick={() => invoke("archive_open_upgrade").catch(() => {})}>Learn about {info.name}</button>
            )}
          </section>
        ) : null}
      </div>
    </aside>
  );
}
