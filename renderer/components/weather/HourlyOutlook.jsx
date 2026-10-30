import React, { useCallback, useMemo, useState } from "react";
import { shortHourLabel, hourLabel, clockLabel } from "../../lib/weatherSummary.js";

const ICON = {
  Clear: "☀",
  "Partly cloudy": "⛅",
  Overcast: "☁",
  Cloudy: "☁",
  Fog: "☁",
  Drizzle: "☂",
  Rain: "☂",
  Snow: "❄",
  Thunderstorm: "⚡",
};

const getIcon = (label, isDay = true) => (label === "Clear" && !isDay ? "☾" : ICON[label] || "☁");

export function HourlyOutlook({ hours }) {
  const [focusIdx, setFocusIdx] = useState(0);

  const safeHours = Array.isArray(hours) ? hours : [];
  const temps = safeHours.map((h) => h.temp_f).filter((v) => v != null);

  const handleKeyDown = useCallback(
    (e) => {
      if (!safeHours.length) return;
      if (e.key === "ArrowLeft") {
        e.preventDefault();
        setFocusIdx((curr) => Math.max(0, curr - 1));
      } else if (e.key === "ArrowRight") {
        e.preventDefault();
        setFocusIdx((curr) => Math.min(safeHours.length - 1, curr + 1));
      } else if (e.key === "Home") {
        e.preventDefault();
        setFocusIdx(0);
      } else if (e.key === "End") {
        e.preventDefault();
        setFocusIdx(safeHours.length - 1);
      }
    },
    [safeHours.length]
  );

  const geometry = useMemo(() => {
    if (safeHours.length < 2 || !temps.length) return null;
    const W = 960, H = 220, L = 38, R = 14, T = 24, B = 44, BAR = 42;
    const lo = Math.floor(Math.min(...temps) - 2);
    const hi = Math.ceil(Math.max(...temps) + 2);
    const x = (i) => L + (i / (safeHours.length - 1)) * (W - L - R);
    const y = (v) => T + (1 - (v - lo) / Math.max(1, hi - lo)) * (H - T - B - 6);

    const pts = safeHours.map((h, i) => (h.temp_f == null ? null : [x(i), y(h.temp_f)]));
    const line = pts
      .filter(Boolean)
      .map(([px, py], i) => `${i ? "L" : "M"}${px.toFixed(1)},${py.toFixed(1)}`)
      .join(" ");

    // Day transitions
    const dayDividers = [];
    let prevDate = safeHours[0] ? String(safeHours[0].time).slice(0, 10) : "";
    safeHours.forEach((h, i) => {
      const curDate = String(h.time).slice(0, 10);
      if (i > 0 && curDate !== prevDate) {
        dayDividers.push({
          idx: i,
          x: x(i),
          date: curDate,
        });
        prevDate = curDate;
      }
    });

    return { W, H, L, R, T, B, BAR, lo, hi, x, y, pts, line, dayDividers };
  }, [safeHours, temps]);

  if (!geometry) return null;

  const { W, H, L, R, T, B, BAR, lo, hi, x, y, pts, line, dayDividers } = geometry;
  const current = safeHours[focusIdx] || safeHours[0] || {};
  const currentPt = pts[focusIdx];

  const formatDateHeader = (timeStr) => {
    if (!timeStr) return "";
    const d = new Date(timeStr);
    return isNaN(d.getTime())
      ? timeStr
      : d.toLocaleDateString(undefined, { weekday: "short", month: "short", day: "numeric" });
  };

  return (
    <section className="wp-card wp-hourly" aria-label="Hourly forecast 48 hours">
      <div className="wp-hourly__header">
        <div>
          <h2 className="wp-h">Next 48 Hours</h2>
          <div className="wp-hourly__scrub-hint mono">
            Focused: <strong className="wp-hourly__foc-time">{hourLabel(current.time)}</strong>
            {" · "}
            <span className="wp-hourly__foc-date">{formatDateHeader(current.time)}</span>
            {" · "}
            <span className="wp-hourly__foc-cond">
              {getIcon(current.label, current.is_day)} {current.label || "Clear"}
            </span>
            {" · "}
            <span className="wp-hourly__foc-temp">{current.temp_f != null ? `${current.temp_f}°F` : "—"}</span>
            {current.precip_chance != null ? (
              <span className="wp-hourly__foc-rain"> · {current.precip_chance}% rain</span>
            ) : null}
          </div>
        </div>
        <div className="wp-hourly__keys mono" aria-hidden="true">
          <span>Scrub: Click, hover or use <kbd>←</kbd> <kbd>→</kbd></span>
        </div>
      </div>

      <div
        className="wp-chart-container"
        tabIndex={0}
        role="slider"
        aria-label="Hourly temperature scrubber"
        aria-valuemin={0}
        aria-valuemax={safeHours.length - 1}
        aria-valuenow={focusIdx}
        aria-valuetext={`${hourLabel(current.time)}, ${current.temp_f}°F, ${current.label}`}
        onKeyDown={handleKeyDown}
      >
        <svg
          className="wp-chart"
          viewBox={`0 0 ${W} ${H}`}
          role="img"
          aria-label="48-hour temperature and precipitation chart"
        >
          {/* Nighttime shaded rectangles */}
          {safeHours.map((h, i) =>
            !h.is_day ? (
              <rect
                key={`n-${h.time}`}
                x={x(i) - (W - L - R) / (safeHours.length - 1) / 2}
                y={T}
                width={(W - L - R) / (safeHours.length - 1)}
                height={H - T - B}
                className="wp-night"
              />
            ) : null
          )}

          {/* Day boundary dividers */}
          {dayDividers.map((d) => (
            <g key={`div-${d.date}`}>
              <line x1={d.x} x2={d.x} y1={T - 4} y2={H - B + 4} className="wp-day-divider" />
              <text x={d.x + 6} y={T + 10} className="wp-day-divider-text mono">
                {formatDateHeader(d.date)}
              </text>
            </g>
          ))}

          {/* Temperature Horizontal Grid lines */}
          {[lo, Math.round((lo + hi) / 2), hi].map((v) => (
            <g key={`grid-${v}`}>
              <line x1={L} x2={W - R} y1={y(v)} y2={y(v)} className="wp-grid" />
              <text x={L - 6} y={y(v) + 4} textAnchor="end" className="wp-axis mono">
                {v}°
              </text>
            </g>
          ))}

          {/* Rain chance bars */}
          {safeHours.map((h, i) =>
            h.precip_chance ? (
              <rect
                key={`p-${h.time}`}
                x={x(i) - 4}
                y={H - B - (h.precip_chance / 100) * BAR}
                width="8"
                height={(h.precip_chance / 100) * BAR}
                className="wp-pbar"
              />
            ) : null
          )}

          {/* Flat Temperature Line (no gradient) */}
          <path d={line} className="wp-line" />

          {/* Weather Icon row */}
          {safeHours.map((h, i) =>
            i % 2 === 0 ? (
              <text
                key={`ic-${h.time}`}
                x={x(i)}
                y={y(h.temp_f ?? lo) - 12}
                textAnchor="middle"
                className="wp-chart-icon"
              >
                {getIcon(h.label, h.is_day)}
              </text>
            ) : null
          )}

          {/* Temperature Points */}
          {safeHours.map((h, i) =>
            pts[i] ? (
              <circle
                key={`c-${h.time}`}
                cx={pts[i][0]}
                cy={pts[i][1]}
                r={i === focusIdx ? "5" : "2.6"}
                className={i === focusIdx ? "wp-dot wp-dot--focus" : "wp-dot"}
              />
            ) : null
          )}

          {/* Focus vertical cursor */}
          {currentPt ? (
            <line
              x1={currentPt[0]}
              x2={currentPt[0]}
              y1={T}
              y2={H - B}
              className="wp-focus-cursor"
            />
          ) : null}

          {/* X-axis time marks */}
          {safeHours.map((h, i) =>
            i % 4 === 0 ? (
              <text key={`x-${h.time}`} x={x(i)} y={H - 12} textAnchor="middle" className="wp-axis mono">
                {i === 0 ? "Now" : shortHourLabel(h.time)}
              </text>
            ) : null
          )}

          {/* Invisible interactive hover targets */}
          {safeHours.map((h, i) => {
            const stepW = (W - L - R) / (safeHours.length - 1);
            return (
              <rect
                key={`hit-${h.time}`}
                x={x(i) - stepW / 2}
                y={T}
                width={stepW}
                height={H - T}
                className="wp-hit-target"
                onMouseEnter={() => setFocusIdx(i)}
                onClick={() => setFocusIdx(i)}
              >
                <title>{`${hourLabel(h.time)}: ${h.temp_f}°F, ${h.label}${
                  h.precip_chance ? ` · ${h.precip_chance}% rain` : ""
                }`}</title>
              </rect>
            );
          })}
        </svg>
      </div>
      <div className="wp-legend mono">
        <span>Line: temperature · Bars: rain probability · Shaded: night · Solid flat color instrumentation</span>
      </div>
    </section>
  );
}
