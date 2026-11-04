import React from "react";

export function WhatMattersToday({ matters }) {
  if (!matters) return null;
  const { nextRain, bestOutdoor, peakUv, peakWind } = matters;

  const items = [
    { key: "rain", label: nextRain.title, val: nextRain.value, sub: nextRain.detail, icon: "☂" },
    { key: "comfort", label: bestOutdoor.title, val: bestOutdoor.value, sub: bestOutdoor.detail, icon: "☀" },
    { key: "uv", label: peakUv.title, val: peakUv.value, sub: peakUv.detail, icon: "◎" },
    { key: "wind", label: peakWind.title, val: peakWind.value, sub: peakWind.detail, icon: "⚑" },
  ];

  return (
    <section className="wp-matters" aria-label="What matters today">
      <div className="wp-matters__head">
        <h2 className="wp-h">What Matters Today</h2>
        <span className="wp-matters__tag mono">TELEMETRY SUMMARY</span>
      </div>
      <div className="wp-matters__grid">
        {items.map((it) => (
          <div key={it.key} className="wp-matter-card">
            <div className="wp-matter-card__top">
              <span className="wp-matter-card__icon" aria-hidden="true">{it.icon}</span>
              <span className="wp-matter-card__label mono">{it.label}</span>
            </div>
            <div className="wp-matter-card__val">{it.val}</div>
            <div className="wp-matter-card__sub mono">{it.sub}</div>
          </div>
        ))}
      </div>
    </section>
  );
}
