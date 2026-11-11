import React from "react";
import { compass } from "../../lib/weatherSummary.js";

export function WindCompass({ dir, speed, gust }) {
  const rotation = dir != null ? (dir % 360 + 360) % 360 : 0;
  const point = compass(dir);

  return (
    <div className="wp-wind-card" aria-label={`Wind: ${speed ?? 0} mph ${point}`}>
      <div className="wp-wind-compass">
        <svg viewBox="0 0 54 54" className="wp-compass-svg" aria-hidden="true">
          <circle cx="27" cy="27" r="25" className="wp-compass-dial" />
          <circle cx="27" cy="27" r="20" className="wp-compass-inner" />
          
          {/* Cardinal markers */}
          <text x="27" y="10" textAnchor="middle" className="wp-compass-cardinal">N</text>
          <text x="47" y="30" textAnchor="middle" className="wp-compass-cardinal">E</text>
          <text x="27" y="49" textAnchor="middle" className="wp-compass-cardinal">S</text>
          <text x="7" y="30" textAnchor="middle" className="wp-compass-cardinal">W</text>
          
          {/* Needle */}
          <g transform={`rotate(${rotation} 27 27)`}>
            <polygon points="27,10 32,27 27,24 22,27" className="wp-compass-arrow" />
            <polygon points="27,44 31,27 27,24 23,27" className="wp-compass-tail" />
            <circle cx="27" cy="27" r="2.5" className="wp-compass-pivot" />
          </g>
        </svg>
      </div>
      <div className="wp-wind-data">
        <div className="wp-wind-speed mono">
          {speed != null ? `${speed} mph` : "—"} <span className="wp-wind-point">{point || "—"}</span>
        </div>
        <div className="wp-wind-sub mono">
          {gust != null ? `Gusts to ${gust} mph` : "Steady breeze"}
        </div>
      </div>
    </div>
  );
}
