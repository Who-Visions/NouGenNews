import React, { useMemo } from "react";

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

const getIcon = (label) => ICON[label] || "☁";
const deg = (n) => (n == null ? "—" : `${n}°`);

export function DailyForecast({ days }) {
  const safeDays = Array.isArray(days) ? days : [];

  const { lo, span, groups } = useMemo(() => {
    const lows = safeDays.map((d) => d.low_f).filter((v) => v != null);
    const highs = safeDays.map((d) => d.high_f).filter((v) => v != null);
    const minLo = lows.length ? Math.min(...lows) : 0;
    const maxHi = highs.length ? Math.max(...highs) : 100;
    const totalSpan = Math.max(1, maxHi - minLo);

    const week1 = safeDays.slice(0, 7);
    const week2 = safeDays.slice(7, 14);
    const week3 = safeDays.slice(14);

    const grps = [
      { id: "w1", title: "This Week", items: week1, startIdx: 0 },
      { id: "w2", title: "Next Week", items: week2, startIdx: 7 },
      { id: "w3", title: "Extended Outlook", items: week3, startIdx: 14 },
    ].filter((g) => g.items.length > 0);

    return { lo: minLo, span: totalSpan, groups: grps };
  }, [safeDays]);

  const formatDayName = (dateStr, idx) => {
    if (idx === 0) return "Today";
    const d = new Date(`${dateStr}T12:00:00`);
    return isNaN(d.getTime())
      ? dateStr
      : d.toLocaleDateString(undefined, { weekday: "short", month: "short", day: "numeric" });
  };

  return (
    <section className="wp-card wp-daily" aria-label="16-day extended forecast">
      <div className="wp-daily__head">
        <h2 className="wp-h">Next {safeDays.length} Days Outlook</h2>
        <span className="mono wp-daily__legend">Grouped by week · Flat high/low temperature ranges</span>
      </div>

      <div className="wp-daily__groups">
        {groups.map((group) => (
          <div key={group.id} className="wp-daily__week">
            <div className="wp-daily__week-title mono">{group.title}</div>
            <ol className="wp-days">
              {group.items.map((d, localIdx) => {
                const globalIdx = group.startIdx + localIdx;
                const isToday = globalIdx === 0;
                const low = d.low_f ?? lo;
                const high = d.high_f ?? lo;
                const barLeft = (((low - lo) / span) * 100).toFixed(1);
                const barWidth = Math.max(4, (((high - low) / span) * 100)).toFixed(1);

                return (
                  <li key={d.date} className={`wp-day-row ${isToday ? "wp-day-row--today" : ""}`}>
                    <div className="wp-dn-wrap">
                      <span className="wp-dn">{formatDayName(d.date, globalIdx)}</span>
                      {isToday ? <span className="wp-today-badge mono">TODAY</span> : null}
                    </div>

                    <div className="wp-ic" aria-hidden="true" title={d.label}>
                      {getIcon(d.label)}
                    </div>

                    <div className="wp-cond-label">{d.label}</div>

                    <div className="wp-rain mono" title="Rain probability and volume">
                      {d.precip_chance != null && d.precip_chance > 0 ? (
                        <>
                          <span className="wp-rain-pct">{d.precip_chance}%</span>
                          {d.precip_in != null && d.precip_in > 0 ? (
                            <span className="wp-rain-vol">{d.precip_in}"</span>
                          ) : null}
                        </>
                      ) : (
                        <span className="wp-rain-none">—</span>
                      )}
                    </div>

                    <span className="wp-lo mono">{deg(d.low_f)}</span>

                    <span className="wp-bar" aria-hidden="true">
                      <i style={{ left: `${barLeft}%`, width: `${barWidth}%` }} />
                    </span>

                    <span className="wp-hi mono">{deg(d.high_f)}</span>
                  </li>
                );
              })}
            </ol>
          </div>
        ))}
      </div>
    </section>
  );
}
