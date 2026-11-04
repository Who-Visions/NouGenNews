// An edition: the wire laid out as a newspaper. A lead story, a few secondary stories, then a block per
// section. Placement comes from one score (freshness, video, and whether it touches the reader's library),
// so every app that builds an edition from the same stories prints the same front page.
import { isOpinion } from "./voices.js";
import { FEEDS } from "./feeds.js";
import { matchStory } from "./library.js";

const HOUR = 3600 * 1000;

// Higher is further up the page.
// Facts first: labeled opinion gives up about what a library match earns, so it cannot outrank fresh reporting.
const OPINION_PENALTY = 30;

export function scoreStory(story, { now = Date.now(), terms = [] } = {}) {
  const ageHours = Math.max(0, (now - (story.timestamp || 0)) / HOUR);
  let score = 100 / (1 + ageHours / 6); // half-life of roughly six hours
  if (story.videos && story.videos.length) score += 12;
  if (story.imageUrl) score += 4;
  const hits = matchStory(story, terms);
  if (hits.length) score += 60 + 5 * Math.min(hits.length - 1, 3);
  if (isOpinion(story)) score -= OPINION_PENALTY;
  return score;
}

const sectionOf = (story) => FEEDS.find((f) => f.id === story.feedId)?.section || "Front page";

// stories: normalized wire stories. Returns { lead, secondary, sections, libraryHits }.
export function buildEdition(stories, { now = Date.now(), terms = [], secondaryCount = 4, perSection = 6 } = {}) {
  const ranked = (stories || [])
    .map((s) => ({ story: s, hits: matchStory(s, terms) }))
    .map((r) => ({ ...r, score: scoreStory(r.story, { now, terms }) }))
    .sort((a, b) => b.score - a.score);

  const withMeta = ranked.map((r) => ({ ...r.story, libraryHits: r.hits, score: r.score }));
  const lead = withMeta[0] || null;
  const secondary = withMeta.slice(1, 1 + secondaryCount);
  const front = new Set([lead, ...secondary].filter(Boolean).map((s) => s.id));

  const bySection = new Map();
  for (const s of withMeta) {
    if (front.has(s.id)) continue;
    const name = sectionOf(s);
    if (!bySection.has(name)) bySection.set(name, []);
    const list = bySection.get(name);
    if (list.length < perSection) list.push(s);
  }
  const sections = [...bySection].map(([name, list]) => ({ name, stories: list }));
  return { lead, secondary, sections, libraryHits: withMeta.filter((s) => s.libraryHits.length).length };
}

// How big a story is right now: the number of different outlets whose headlines in the last hours share at least two
// key words with it. Exact-duplicate clustering (cluster.js) misses a night like an election, when forty outlets run
// forty different headlines about one event; shared key words catch it. Returns Map(story.id -> outlet count).
const HEAT_STOP = new Set((
  "about after again against also amid before being could from have into just like more most over said says than that " +
  "their them then there these they this those through what when where which while will with would your here first last " +
  "year years week weeks today night time back best ever every show shows season episode review trailer watch video " +
  "photos live update news report reports new"
).split(" "));
const heatWords = (title) => new Set(String(title || "").toLowerCase().replace(/[’']s\b/g, "").split(/[^a-z0-9]+/)
  .filter((w) => w.length >= 4 && !HEAT_STOP.has(w) && !/^\d+$/.test(w)));
export function topicHeat(stories, { now = Date.now(), windowHours = 12, minShared = 2 } = {}) {
  const recent = (stories || []).filter((s) => now - (s.timestamp || 0) <= windowHours * HOUR);
  const words = recent.map((s) => heatWords(s.title));
  // A word on a quarter of the wire links everything and says nothing.
  const df = new Map();
  for (const set of words) for (const w of set) df.set(w, (df.get(w) || 0) + 1);
  const cap = Math.max(12, recent.length * 0.25);
  const index = new Map();
  words.forEach((set, i) => { for (const w of set) if (df.get(w) <= cap) { if (!index.has(w)) index.set(w, []); index.get(w).push(i); } });
  const heat = new Map();
  recent.forEach((s, i) => {
    const shared = new Map();
    for (const w of words[i]) for (const k of index.get(w) || []) if (k !== i) shared.set(k, (shared.get(k) || 0) + 1);
    const outlets = new Set([String(s.source || s.id).toLowerCase()]);
    for (const [k, n] of shared) if (n >= minShared) outlets.add(String(recent[k].source || recent[k].id).toLowerCase());
    for (const f of s.alsoFrom || []) outlets.add(String(f.source || f.id).toLowerCase());
    heat.set(s.id, outlets.size);
  });
  return heat;
}

// The hero's order: importance first (outlets on the story), then freshness, with the reader's library as a lift
// that cannot outrank a story the whole press is on.
export function heroScore(story, { now = Date.now(), terms = [], heat = 1 } = {}) {
  const ageHours = Math.max(0, (now - (story.timestamp || 0)) / HOUR);
  let score = 60 / (1 + ageHours / 6);
  score += 18 * Math.min(Math.max(heat, story.reportCount || 1) - 1, 10);
  if (matchStory(story, terms).length) score += 25;
  if (story.videos && story.videos.length) score += 8;
  if (isOpinion(story)) score -= OPINION_PENALTY;
  return score;
}

// Keeps order, moving stories past the `max`-th on one topic (2+ shared key words with an earlier story) to the end,
// so one huge story leads without taking every slot.
export function capTopics(stories, max = 6, { minShared = 2 } = {}) {
  const topics = []; // { words, n }
  const kept = [];
  const over = [];
  for (const s of stories || []) {
    const w = heatWords(s.title);
    const t = topics.find((tp) => { let n = 0; for (const x of w) if (tp.words.has(x) && ++n >= minShared) return true; return false; });
    if (!t) { topics.push({ words: w, n: 1 }); kept.push(s); continue; }
    for (const x of w) t.words.add(x);
    (++t.n > max ? over : kept).push(s);
  }
  return [...kept, ...over];
}
