import React, { useEffect, useRef, useState } from "react";
import { invoke } from "../lib/bridge.js";
import { ageLabel } from "../lib/age.js";
import "./AssistantPanel.css";

// The wire as the assistant sees it: ids, headlines, sources and live ages. Capped so one question stays small.
function wireForAssistant(articles) {
  return (articles || []).slice(0, 300).map((a) => ({
    id: a.id, title: a.title, source: a.source, age: a.timestamp ? ageLabel(a.timestamp) : "", desc: a.desc || "", url: a.link || "",
  }));
}

// Plain text of the open story, for grounding answers about it.
function plainText(html) {
  const el = document.createElement("div");
  el.innerHTML = String(html || "");
  return (el.textContent || "").replace(/\s+/g, " ").trim().slice(0, 3000);
}

// A side panel that answers questions about the wire and the open story (electron/assistant.js: gemma4:31b on Ollama
// Cloud, the resident local model as fallback). It says which model answered and shows errors as they are.
export function AssistantPanel({ articles, current, onClose }) {
  const [turns, setTurns] = useState([]);
  const [text, setText] = useState("");
  const [busy, setBusy] = useState(false);
  const logRef = useRef(null);
  const inputRef = useRef(null);

  useEffect(() => { inputRef.current?.focus(); }, []);
  useEffect(() => { logRef.current?.scrollTo({ top: logRef.current.scrollHeight }); }, [turns, busy]);

  const send = async (e) => {
    e.preventDefault();
    const q = text.trim();
    if (!q || busy) return;
    setText("");
    setBusy(true);
    const history = turns.map((t) => ({ role: t.role, content: t.content }));
    setTurns((p) => [...p, { role: "user", content: q }]);
    try {
      const r = await invoke("assistant_ask", {
        question: q,
        history,
        wire: wireForAssistant(articles),
        current: current ? { title: current.title, source: current.source, text: plainText(current.contentHtml) } : null,
      });
      setTurns((p) => [...p, { role: "assistant", content: r.answer || "(no answer)", model: r.model }]);
    } catch (err) {
      setTurns((p) => [...p, { role: "error", content: String((err && err.message) || err).replace(/^Error invoking remote method 'cmd': (Error: )?/, "") }]);
    } finally {
      setBusy(false);
    }
  };

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
        {busy ? <div className="asst__turn asst__turn--assistant"><div className="asst__text asst__busy">Reading the wire…</div></div> : null}
      </div>
      <form className="asst__form" onSubmit={send}>
        <input ref={inputRef} value={text} onChange={(e) => setText(e.target.value)} placeholder="Ask the wire…" aria-label="Question" disabled={busy} />
        <button type="submit" disabled={busy || !text.trim()}>Ask</button>
      </form>
    </aside>
  );
}
