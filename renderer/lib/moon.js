// The moon's phase from the date alone: no service, no key. It counts days since a known new moon (2000-01-06 18:14 UTC)
// in mean lunar months of 29.530588853 days. The real moon runs up to about half a day ahead or behind its mean, which
// is plenty for a phase name, an illumination percentage and "full moon in N days".
const SYNODIC = 29.530588853;
const NEW_MOON_2000 = Date.UTC(2000, 0, 6, 18, 14);
const DAY = 86400000;

const NAMES = [
  [0.03, "New Moon"], [0.22, "Waxing Crescent"], [0.28, "First Quarter"], [0.47, "Waxing Gibbous"], [0.53, "Full Moon"],
  [0.72, "Waning Gibbous"], [0.78, "Last Quarter"], [0.97, "Waning Crescent"], [1.01, "New Moon"],
];

export function moonPhase(date = new Date()) {
  const t = date instanceof Date ? date.getTime() : Number(date);
  const raw = ((t - NEW_MOON_2000) / DAY) % SYNODIC;
  const age = raw < 0 ? raw + SYNODIC : raw;
  const frac = age / SYNODIC;
  const illumination = Math.round(((1 - Math.cos(2 * Math.PI * frac)) / 2) * 100);
  const name = NAMES.find(([upTo]) => frac < upTo)[1];
  const toFull = ((SYNODIC / 2 - age) % SYNODIC + SYNODIC) % SYNODIC;
  const toNew = ((SYNODIC - age) % SYNODIC + SYNODIC) % SYNODIC;
  return { age: Math.round(age * 10) / 10, illumination, name, waxing: frac < 0.5, daysToFull: Math.round(toFull), daysToNew: Math.round(toNew) };
}
