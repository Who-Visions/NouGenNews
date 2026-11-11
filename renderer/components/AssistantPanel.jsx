import React, { useEffect, useRef, useState } from "react";
import { askAssistant } from "../lib/bridge.js";
import { ageLabel } from "../lib/age.js";
import { loadCity, loadRegion } from "./CornerClock.jsx";
import "./AssistantPanel.css";

// The wire as the assistant sees it: ids, headlines, sources and live ages. Capped so one question stays small.
function wireForAssistant(articles) {
  return (articles || []).slice(0, 300).map((a) => ({
    id: a.id, title: a.title, source: a.source, age: a.timestamp ? ageLabel(a.timestamp) : "", desc: a.desc || "", url: a.link || "",
    // Distinct outlets only: reportCount is that after clustering. Counting stories would let one outlet's many notices look like wide coverage.
    coverage: Math.max(a.reportCount || 0, 1), ts: a.timestamp || 0,
  }));
}

// Plain text of the open story, for grounding answers about it.
function plainText(html) {
  const el = document.createElement("div");
  el.innerHTML = String(html || "");
  return (el.textContent || "").replace(/\s+/g, " ").trim().slice(0, 3000);
}

// What the assistant is doing right now, from the steps streamed over its MessagePort.
const STEP_LABELS = {
  search_wire: "Searching the wire", read_article: "Reading the article", search_archive: "Searching the archive",
  recall_shards: "Checking the library", get_weather: "Checking the weather", brief_topic: "Writing a cited brief",
};
export function stepLabel(s) {
  if (!s) return "Reading the wire…";
  if (s.type === "thinking") return s.round > 1 ? `Thinking (round ${s.round})…` : "Reading the wire…";
  if (s.type === "tool") return `${STEP_LABELS[s.tool] || s.tool}${s.detail ? `: ${s.detail}` : ""}…`;
  if (s.type === "tool_done") return `${STEP_LABELS[s.tool] || s.tool} ${s.error ? "failed" : "done"} (${(s.ms / 1000).toFixed(1)} s)`;
  return "";
}

// A side panel that answers questions about the wire and the open story (electron/assistant.js: gemma4:31b on Ollama
// Cloud, the resident local model as fallback). It says which model answered and shows errors as they are.
export function AssistantPanel({ articles, current, onClose }) {
  const [turns, setTurns] = useState([]);
  const [text, setText] = useState("");
  const [busy, setBusy] = useState(false);
  const [step, setStep] = useState(null);
  const stopRef = useRef(null);
  const logRef = useRef(null);
  const inputRef = useRef(null);

  useEffect(() => { inputRef.current?.focus(); }, []);
  // Closing the panel mid-answer stops the question (the main process aborts the model call).
  useEffect(() => () => { if (stopRef.current) stopRef.current(); }, []);
  useEffect(() => { logRef.current?.scrollTo({ top: logRef.current.scrollHeight }); }, [turns, busy]);

  const send = async (e) => {
    e.preventDefault();
    const q = text.trim();
    if (!q || busy) return;
    setText("");
    setBusy(true);
    const history = turns.map((t) => ({ role: t.role, content: t.content }));
    setTurns((p) => [...p, { role: "user", content: q }]);
    setStep(null);
    const end = () => { stopRef.current = null; setStep(null); setBusy(false); };
    stopRef.current = askAssistant({
      question: q,
      history,
      home: { city: loadCity(), region: loadRegion() },
      wire: wireForAssistant(articles),
      current: current ? { title: current.title, source: current.source, text: plainText(current.contentHtml) } : null,
    }, (m) => {
      if (m.type === "answer") { setTurns((p) => [...p, { role: "assistant", content: m.answer || "(no answer)", model: m.model }]); end(); }
      else if (m.type === "error") { setTurns((p) => [...p, { role: "error", content: String(m.message || "").replace(/^Error invoking remote method 'cmd': (Error: )?/, "") }]); end(); }
      else if (m.type === "cancelled") { setTurns((p) => [...p, { role: "error", content: "Stopped." }]); end(); }
      else setStep(m);
    });
  };
  const stop = () => { if (stopRef.current) stopRef.current(); };

  return (
    <aside className="asst" role="complementary" aria-label="Assistant" onKeyDown={(e) => { if (e.key === "Escape") { e.stopPropagation(); onClose(); } }}>
      <header className="asst__head mono">
        <span>Assistant</span>
        <button type="button" className="asst__x" onClick={onClose} aria-label="Close assistant">×</button>
      </header>
      <div className="asst__log" ref={logRef} aria-live="polite">
        {!turns.length ? <p className="asst__hint">Ask about the wire or the open story. It reads the headlines and full articles, and cites source and age.</p> : null}
        {turns.map((t, i) => (
          <div key={i} className={`asst__turn asst__turn--${t.role}`}>
            <div className="asst__text">{t.content}</div>
            {t.model ? <div className="asst__model mono">{t.model}</div> : null}
          </div>
        ))}
        {busy ? <div className="asst__turn asst__turn--assistant"><div className="asst__text asst__busy">{stepLabel(step)}</div></div> : null}
      </div>
      <form className="asst__form" onSubmit={send}>
        <input ref={inputRef} value={text} onChange={(e) => setText(e.target.value)} placeholder="Ask the wire…" aria-label="Question" disabled={busy} />
        {busy ? <button type="button" onClick={stop}>Stop</button> : <button type="submit" disabled={!text.trim()}>Ask</button>}
      </form>
    </aside>
  );
}
