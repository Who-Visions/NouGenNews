import React, { useEffect, useRef } from "react";
import { parseRules, learnedSignals } from "../lib/knowhow.js";
import "./KnowhowPanel.css";

// The reader's rules for the wire, and what their votes have taught it. Changes apply as they are typed.
export function KnowhowPanel({ text, on, learned, stats, onText, onToggle, onForget, onClose }) {
  const ref = useRef(null);
  useEffect(() => { ref.current?.focus(); }, []);
  const { errors } = parseRules(text);
  const signals = learnedSignals(learned);
  return (
    <aside className="kh" role="dialog" aria-label="Know-how" onKeyDown={(e) => { e.stopPropagation(); if (e.key === "Escape") onClose(); }}>
      <header className="kh__head">
        <h2>Know-how</h2>
        <label className="kh__on"><input type="checkbox" checked={on} onChange={(e) => onToggle(e.target.checked)} /> On</label>
        <button type="button" className="kh__x" onClick={onClose} aria-label="Close Know-how">×</button>
      </header>
      <p className="kh__hint">Tell the wire what matters to you, one rule per line: boost, mute, flag, trust, demote, cap.</p>
      <textarea ref={ref} className="kh__text mono" value={text} spellCheck={false} aria-label="Rules" onChange={(e) => onText(e.target.value)} />
      {errors.map((e) => <p key={e.line} className="kh__err">Line {e.line}: {e.why}</p>)}
      <p className="kh__stats mono">
        {on ? `${stats.raised} raised · ${stats.lowered} lowered · ${stats.muted} muted · ${stats.capped} capped · ${stats.flagged} flagged` : "Off: the wire is in its normal order"}
      </p>
      <h3>Learned from your votes</h3>
      {signals.length ? (
        <ul className="kh__list">
          {signals.map((s) => (
            <li key={`${s.kind}:${s.key}`}>
              <span>{s.key}</span>
              <span className="mono">{s.weight > 0 ? `+${s.weight}` : s.weight}</span>
              <button type="button" onClick={() => onForget(s.kind, s.key)} aria-label={`Forget ${s.key}`}>Forget</button>
            </li>
          ))}
        </ul>
      ) : <p className="kh__hint">Nothing yet. Rate stories with 👍 or 👎; a signal counts once it repeats.</p>}
    </aside>
  );
}
