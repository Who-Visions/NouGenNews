// One line of weather from a format string, after wttr.in's one-line output, rendered from our own report.
// %l place  %c icon  %C condition  %t temp  %f feels like  %h humidity  %w wind  %p rain today  %P pressure
// %u UV  %S sunrise  %s sunset  %a air quality  %A alert count  %%  a percent sign
// A value the service did not give prints as "?", never a guess.
const PRESETS = { 1: "%c %t", 2: "%c %t %w", 3: "%l: %c %t", 4: "%l: %c %t %w" };
const ARROWS = ["↓", "↙", "←", "↖", "↑", "↗", "→", "↘"]; // wind FROM north blows south, so north shows ↓

function icon(code, isDay) {
  if (code == null) return "?";
  if (code === 0) return isDay === false || isDay === 0 ? "🌙" : "☀️";
  if (code <= 2) return "⛅";
  if (code === 3) return "☁️";
  if (code <= 48) return "🌫️";
  if (code <= 67 || (code >= 80 && code <= 82)) return "🌧️";
  if (code <= 77 || code === 85 || code === 86) return "❄️";
  return "⛈️";
}
const num = (v, suffix = "") => (v == null || v === "" ? "?" : `${Math.round(v)}${suffix}`);
const clock = (t) => {
  const m = String(t || "").match(/T(\d\d):(\d\d)/);
  if (!m) return "?";
  const h = Number(m[1]);
  return `${h % 12 || 12}:${m[2]} ${h < 12 ? "AM" : "PM"}`;
};
function wind(now) {
  if (now.wind_mph == null) return "?";
  const arrow = now.wind_dir == null ? "" : ARROWS[Math.round(((now.wind_dir % 360) + 360) % 360 / 45) % 8];
  return `${arrow}${Math.round(now.wind_mph)} mph`;
}

function renderLine(report, format = "3") {
  const r = report || {};
  const now = r.now || {};
  const today = r.today || {};
  const f = PRESETS[format] || String(format);
  const values = {
    l: r.place || "?", c: icon(now.code, now.is_day), C: now.label || "?", t: num(now.temp_f, "°F"), f: num(now.feels_f, "°F"),
    h: num(now.humidity, "%"), w: wind(now), p: num(today.precip_chance, "%"), P: now.pressure_in == null ? "?" : `${now.pressure_in} in`,
    u: num(today.uv_max), S: clock(today.sunrise), s: clock(today.sunset), a: r.air ? num(r.air.aqi) : "?", A: String((r.alerts || []).length), "%": "%",
  };
  return f.replace(/%(.)/g, (all, k) => (Object.prototype.hasOwnProperty.call(values, k) ? values[k] : all));
}

module.exports = { renderLine, PRESETS };
