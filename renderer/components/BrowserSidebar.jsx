import { useEffect, useRef, useState } from "react";
import "./BrowserSidebar.css";

// Links open here, beside the news, never in an outside window. News code asks with
// window.dispatchEvent(new CustomEvent("nn:browse", { detail: { url } })).
export function BrowserSidebar() {
  const [url, setUrl] = useState(null);
  const viewRef = useRef(null);

  useEffect(() => {
    const onBrowse = (e) => {
      const next = String(e.detail?.url || "");
      if (/^https?:\/\//i.test(next)) setUrl(next);
    };
    window.addEventListener("nn:browse", onBrowse);
    return () => window.removeEventListener("nn:browse", onBrowse);
  }, []);

  // Esc closes the sidebar before the news view sees the key.
  useEffect(() => {
    if (!url) return undefined;
    const onKey = (e) => {
      if (e.key !== "Escape") return;
      e.preventDefault();
      e.stopImmediatePropagation();
      setUrl(null);
    };
    window.addEventListener("keydown", onKey, true);
    return () => window.removeEventListener("keydown", onKey, true);
  }, [url]);

  if (!url) return null;
  return (
    <aside className="browser-sidebar" aria-label="In-app browser">
      <header className="browser-sidebar__bar">
        <button type="button" onClick={() => viewRef.current?.goBack?.()} aria-label="Back">&#8592;</button>
        <span className="browser-sidebar__url" title={url}>{url}</span>
        <button type="button" onClick={() => setUrl(null)} aria-label="Close browser">Close<kbd>Esc</kbd></button>
      </header>
      <webview ref={viewRef} className="browser-sidebar__view" src={url} partition="persist:nn-browse" />
    </aside>
  );
}
