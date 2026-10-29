import { useEffect, useState } from "react";
import { invoke } from "../lib/bridge.js";
import "./CastButton.css";

// Cast the app to a TV: opens the Windows cast flyout, where the TV is picked and the whole window is mirrored.
export function CastButton() {
  const [state, setState] = useState({ busy: false, note: "" });

  const cast = async () => {
    setState({ busy: true, note: "" });
    const r = await invoke("cast_screen").catch((e) => ({ ok: false, reason: String(e?.message || e) }));
    setState({ busy: false, note: r?.ok ? "Pick your TV in the cast panel" : r?.reason || "Cast is not available" });
  };

  useEffect(() => {
    const onMenu = () => cast();
    window.addEventListener("nn:cast", onMenu);
    return () => window.removeEventListener("nn:cast", onMenu);
  }, []);
  useEffect(() => {
    if (!state.note) return undefined;
    const t = setTimeout(() => setState((s) => ({ ...s, note: "" })), 6000);
    return () => clearTimeout(t);
  }, [state.note]);

  return (
    <div className="cast">
      <button type="button" className="cast__btn" onClick={cast} disabled={state.busy} title="Cast this app to a TV">
        <svg viewBox="0 0 24 24" width="14" height="14" aria-hidden="true" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
          <path d="M2 8V6a2 2 0 0 1 2-2h16a2 2 0 0 1 2 2v12a2 2 0 0 1-2 2h-6" />
          <path d="M2 12a9 9 0 0 1 8 8" /><path d="M2 16a5 5 0 0 1 4 4" /><circle cx="2.5" cy="20" r="0.8" fill="currentColor" />
        </svg>
        Cast
      </button>
      {state.note ? <span className="cast__note" role="status">{state.note}</span> : null}
    </div>
  );
}
