import React, { useMemo } from "react";
import { computeSunArc } from "../../lib/weatherSummary.js";

const MOON_GLYPHS = {
  "New Moon": "🌑",
  "Waxing Crescent": "🌒",
  "First Quarter": "🌓",
  "Waxing Gibbous": "🌔",
  "Full Moon": "🌕",
  "Waning Gibbous": "🌖",
  "Last Quarter": "🌗",
  "Waning Crescent": "🌘",
};

export function SunAndMoon({ today, updated, moon }) {
  const sun = useMemo(() => computeSunArc(today, updated), [today, updated]);

  // SVG Arc geometry: arc spans from (36, 92) to (284, 92)
  const W = 320, H = 120;
  const startX = 36, endX = 284, baseY = 92;
  const rx = 124, ry = 70;

  // Calculate sun position along elliptical arc
  const theta = Math.PI * (1 - sun.progress); // from PI (left) down to 0 (right)
  const sunX = (startX + endX) / 2 - rx * Math.cos(theta);
  const sunY = baseY - ry * Math.sin(theta);

  const moonGlyph = (moon && MOON_GLYPHS[moon.name]) || "🌕";

  return (
    <section className="wp-card wp-astro" aria-label="Sun and Moon">
      <div className="wp-astro__head">
        <h2 className="wp-h">Sun & Moon</h2>
        <span className="mono wp-astro__meta">{sun.daylightText || "Astronomical cycle"}</span>
      </div>

      <div className="wp-astro__grid">
        {/* Sun arc visualizer */}
        <div className="wp-sun-box">
          <div className="wp-sun-readout">
            <span className="wp-sun-status">{sun.isDay ? "Daylight active" : "Nighttime"}</span>
            <span className="wp-sun-remain mono">{sun.remainingText}</span>
          </div>

          <svg className="wp-sun-arc" viewBox={`0 0 ${W} ${H}`} role="img" aria-label={`Sun position: ${sun.remainingText}`}>
            {/* Horizon line */}
            <line x1="20" y1={baseY} x2="300" y2={baseY} className="wp-sun-horizon" />

            {/* Inactive background arc */}
            <path
              d={`M ${startX},${baseY} A ${rx},${ry} 0 0,1 ${endX},${baseY}`}
              className="wp-sun-track"
            />

            {/* Sun position marker */}
            {sun.isDay ? (
              <g className="wp-sun-marker">
                <circle cx={sunX} cy={sunY} r="7" className="wp-sun-body" />
                <circle cx={sunX} cy={sunY} r="12" className="wp-sun-halo" />
              </g>
            ) : null}

            {/* Horizon time labels */}
            <text x={startX} y={baseY + 16} className="wp-sun-label mono" textAnchor="start">
              🌅 {sun.sunriseLabel}
            </text>
            <text x={endX} y={baseY + 16} className="wp-sun-label mono" textAnchor="end">
              🌇 {sun.sunsetLabel}
            </text>
          </svg>
        </div>

        {/* Moon phase card */}
        <div className="wp-moon-box">
          <div className="wp-moon-glyph-wrap">
            <span className="wp-moon-glyph" aria-hidden="true">{moonGlyph}</span>
          </div>
          <div className="wp-moon-data">
            <div className="wp-moon-name">{moon ? moon.name : "Moon"}</div>
            <div className="wp-moon-detail mono">
              {moon ? `${moon.illumination}% illuminated` : "—"}
            </div>
            <div className="wp-moon-next mono">
              {moon ? (moon.waxing ? `Full moon in ${moon.daysToFull}d` : `New moon in ${moon.daysToNew}d`) : "—"}
            </div>
          </div>
        </div>
      </div>
    </section>
  );
}
