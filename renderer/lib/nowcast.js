// The next few hours of rain in words, from 15-minute forecast steps. Times are the place's own clock, compared as text
// offsets from the first step, so this computer's zone never enters into it. No data means no line, never "dry".
export const WET_IN = 0.002; // below this a step counts as dry: it is forecast noise, not rain anyone would notice

const minutesAhead = (steps, i) => {
  const at = (t) => Date.parse(`${t}:00Z`);
  return Math.round((at(steps[i].time) - at(steps[0].time)) / 60000);
};
const span = (m) => (m < 60 ? `${m} minutes` : `${Math.round((m / 60) * 2) / 2} hours`.replace(/^1 hours/, "1 hour"));

export function nowcastText(steps) {
  if (!Array.isArray(steps) || steps.length < 2) return "";
  const wet = steps.map((s) => s.precip_in != null && s.precip_in >= WET_IN);
  if (steps.every((s) => s.precip_in == null)) return "";
  const horizon = minutesAhead(steps, steps.length - 1) + 15;
  if (!wet.some(Boolean)) return `No rain expected for the next ${span(horizon)}.`;
  if (wet[0]) {
    const stop = wet.indexOf(false);
    return stop < 0 ? `Raining, and it should continue for at least ${span(horizon)}.` : `Raining now, easing in about ${span(minutesAhead(steps, stop))}.`;
  }
  const start = wet.indexOf(true);
  return `Rain likely in about ${span(minutesAhead(steps, start))}.`;
}
