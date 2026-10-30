import React from "react";
import { nowcastText } from "../../lib/nowcast.js";

// The next three hours of rain, a sentence and one flat bar per 15 minutes. The scale starts at a real shower (0.1 in/h).
export function RainNowcast({ steps }) {
  const text = nowcastText(steps);
  if (!text) return null;
  const top = Math.max(0.025, ...steps.map((s) => s.precip_in || 0));
  return (
    <section className="wn" aria-label="Rain in the next three hours">
      <p className="wn__text">{text}</p>
      <div className="wn__bars" aria-hidden="true">
        {steps.map((s) => <span key={s.time} style={{ height: `${Math.max(2, ((s.precip_in || 0) / top) * 100)}%` }} />)}
      </div>
      <p className="wn__note">Forecast model, 15-minute steps. Sharpest in the US and Europe; elsewhere it is estimated from hourly data.</p>
    </section>
  );
}
