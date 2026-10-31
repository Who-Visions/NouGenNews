import React, { useEffect, useState } from "react";
import "./Splash.css";

// First paint of the app: the name on the app's own background, held briefly, then gone. Flat on purpose: no glass,
// no glow, no motion for anyone who asked for reduced motion. It never blocks the app and never reappears in the session.
export function Splash({ ms = 900 }) {
  const [phase, setPhase] = useState("in");
  useEffect(() => {
    const fade = setTimeout(() => setPhase("out"), ms);
    const gone = setTimeout(() => setPhase("gone"), ms + 260);
    return () => { clearTimeout(fade); clearTimeout(gone); };
  }, [ms]);
  if (phase === "gone") return null;
  return (
    <div className={`splash splash--${phase}`} aria-hidden="true">
      <span className="splash__name">NouGenNews</span>
    </div>
  );
}
