// Official weather warnings as news alerts. A warning from a weather service needs no outlets to confirm it, so it
// outranks every other alert while it is in force. Pure functions: warnings and stories in, one alert out.

const RED = /\b(flash flood|tornado|hurricane|tsunami|storm surge|extreme wind|severe thunderstorm|blizzard|ice storm) warning\b/i;
const AMBER = /\b(warning|emergency)\b/i;
const WEATHER_WORDS = /\b(flash flood|flood(?:ed|ing|s)?|hurricane|tropical storm|tornado|storm surge|severe storm|thunderstorms?|heavy rain|downpour|rainfall|waterspout|wildfire|heat wave|blizzard|weather)\b/i;

export const isWeatherStory = (story) => WEATHER_WORDS.test(String(story?.title || ""));

export function warningLevel(warning) {
  const event = String(warning?.event || "");
  if (RED.test(event) || /^extreme$/i.test(warning?.severity || "")) return "red";
  if (AMBER.test(event) && /^severe$/i.test(warning?.severity || "")) return "amber";
  return null;
}

const COVERAGE_MS = 6 * 3600 * 1000;

// Place names a story must mention to count as coverage: the warned counties and the reader's own city.
const placeNames = (areas, city) => [...String(areas || "").split(/[;,]/), city || ""]
  .map((p) => p.replace(/\b[A-Z]{2}\b/g, "").replace(/\b(county|inland|coastal|metro|western|eastern|northern|southern)\b/gi, "").trim().toLowerCase())
  .filter((p) => p.length > 3);

const untilTime = (iso) => {
  const t = Date.parse(iso || "");
  return Number.isNaN(t) ? "" : new Date(t).toLocaleTimeString([], { hour: "numeric", minute: "2-digit" });
};

// The most urgent warning in force, shaped like a news alert, led by local coverage when there is some.
export function officialAlert(warnings, stories, { now = Date.now(), city = "" } = {}) {
  const live = (warnings || [])
    .map((w) => ({ w, level: warningLevel(w) }))
    .filter(({ w, level }) => level && !(Date.parse(w.expires || "") <= now));
  if (!live.length) return null;
  const { w, level } = live.find((x) => x.level === "red") || live[0];
  const places = placeNames(w.areas, city);
  const namesPlace = (s) => { const text = `${s.title} ${s.desc || ""}`.toLowerCase(); return places.some((p) => text.includes(p)); };
  const coverage = (stories || []).filter((s) => s.feedId === "local" && isWeatherStory(s) && now - (s.timestamp || 0) <= COVERAGE_MS && namesPlace(s))
    .sort((a, b) => Number(!!b.videos?.length) - Number(!!a.videos?.length) || Number(!!b.imageUrl) - Number(!!a.imageUrl) || (b.timestamp || 0) - (a.timestamp || 0));
  const until = untilTime(w.expires);
  return {
    key: `wx|${w.event}|${w.areas}|${w.expires}`,
    kind: "weather",
    level,
    label: w.event,
    headline: w.headline || `${w.event}: ${w.areas}`,
    meta: `${w.source || "Weather service"}${until ? ` · until ${until}` : ""}`,
    story: coverage[0] || null,
    stories: coverage,
    sourceCount: 1,
    timestamp: Date.parse(w.effective || "") || now,
  };
}
