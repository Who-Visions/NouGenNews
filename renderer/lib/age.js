// How old a story is, to the second, and its exact publication time to the millisecond. Pure so it can be tested;
// Ago.jsx re-renders it on a shared clock so labels never go stale.

// A publisher clock slightly ahead of ours must not show "in the future": it reads as "just now".
export const SKEW_MS = 5 * 60 * 1000;

export function clampTs(ts, now = Date.now()) {
  const t = Number(ts) || 0;
  return t > now + SKEW_MS ? now : t;
}

export function ageLabel(ts, now = Date.now()) {
  const t = clampTs(ts, now);
  if (!t) return "";
  const s = Math.max(0, Math.floor((now - t) / 1000));
  if (s < 5) return "just now";
  if (s < 60) return `${s}s ago`;
  const m = Math.floor(s / 60);
  if (m < 60) return `${m}m ago`;
  const h = Math.floor(m / 60);
  if (h < 24) return `${h}h ago`;
  return new Date(t).toLocaleDateString(undefined, { month: "short", day: "numeric" });
}

// "Thu Oct 29, 4:41:07.084 PM EDT" in the viewer's own zone.
export function exactTime(ts) {
  const t = Number(ts) || 0;
  if (!t) return "";
  const d = new Date(t);
  const base = d.toLocaleString(undefined, { weekday: "short", month: "short", day: "numeric", hour: "numeric", minute: "2-digit", second: "2-digit", timeZoneName: "short" });
  return base.replace(/(\d{1,2}:\d{2}:\d{2})/, `$1.${String(d.getMilliseconds()).padStart(3, "0")}`);
}
