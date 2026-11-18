import { Suspense, lazy, useCallback, useEffect, useState } from "react";
import { NewsView } from "./components/NewsView.jsx";
import { MenuBar } from "./components/MenuBar.jsx";
import { BrowserSidebar } from "./components/BrowserSidebar.jsx";
import { applyOsAccent } from "./lib/bridge.js";

// The Weather tab loads on first use: the page, and the 3D globe behind it, cost nothing until it is opened.
const WeatherPage = lazy(() => import("./components/WeatherPage.jsx").then((m) => ({ default: m.WeatherPage })));
const SettingsPage = lazy(() => import("./components/SettingsPage.jsx").then((m) => ({ default: m.SettingsPage })));

// Refraction for the glass surfaces (technique from liquid-glass-react, written here as one SVG filter):
// a low-frequency noise map bends whatever sits behind a panel, so edges and video seem to flow through it.
const LiquidDefs = () => (
  <svg width="0" height="0" aria-hidden="true" focusable="false" style={{ position: "absolute" }}>
    <filter id="nn-liquid" x="-5%" y="-5%" width="110%" height="110%" colorInterpolationFilters="sRGB">
      <feTurbulence type="fractalNoise" baseFrequency="0.006 0.009" numOctaves="2" seed="7" result="noise" />
      <feGaussianBlur in="noise" stdDeviation="3" result="map" />
      <feDisplacementMap in="SourceGraphic" in2="map" scale="46" xChannelSelector="R" yChannelSelector="G" />
    </filter>
  </svg>
);

export function App() {
  const [view, setView] = useState("news");
  const goNews = useCallback(() => setView("news"), []);
  // The tabs, the corner weather chip and the W key all ask through one event.
  useEffect(() => {
    const on = (e) => setView((v) => { const want = e.detail && e.detail.view; return want === "news" || want === "weather" || want === "settings" ? want : v === "weather" ? "news" : "weather"; });
    window.addEventListener("nn:view", on);
    window.addEventListener("nn:weather", on);
    return () => { window.removeEventListener("nn:view", on); window.removeEventListener("nn:weather", on); };
  }, []);
  // Settings > Use the Windows accent color.
  useEffect(() => {
    const read = () => { let on = false; try { on = localStorage.getItem("nn.osAccent") === "1"; } catch { /* storage unavailable */ } applyOsAccent(on); };
    read();
    window.addEventListener("nn:os-accent", read);
    return () => { window.removeEventListener("nn:os-accent", read); applyOsAccent(false); };
  }, []);
  // The news view stays mounted (its feeds, archive and speech keep running) but ignores keys while another tab is in front.
  useEffect(() => {
    document.body.dataset.view = view;
    window.dispatchEvent(new CustomEvent("nn:view-state", { detail: { view } }));
  }, [view]);
  return (
    <div className="app-frame">
      <LiquidDefs />
      <MenuBar />
      <div className="app-shell">
        <main className="app-main" hidden={view !== "news"}><NewsView /></main>
        {view === "weather" ? <main className="app-main app-main--page"><Suspense fallback={<p style={{ padding: 28 }}>Opening the weather…</p>}><WeatherPage onBack={goNews} /></Suspense></main> : null}
        {view === "settings" ? <main className="app-main app-main--page"><Suspense fallback={<p style={{ padding: 28 }}>Opening settings…</p>}><SettingsPage /></Suspense></main> : null}
        <BrowserSidebar />
      </div>
    </div>
  );
}
