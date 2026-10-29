import { NewsView } from "./components/NewsView.jsx";
import { MenuBar } from "./components/MenuBar.jsx";
import { BrowserSidebar } from "./components/BrowserSidebar.jsx";

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
  return (
    <div className="app-frame">
      <LiquidDefs />
      <MenuBar />
      <div className="app-shell">
        <main className="app-main"><NewsView /></main>
        <BrowserSidebar />
      </div>
    </div>
  );
}
