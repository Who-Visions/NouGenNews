// An edition: the wire laid out as a newspaper. A lead story, a few secondary stories, then a block per
// section. Placement comes from one score (freshness, video, and whether it touches the reader's library),
// so every app that builds an edition from the same stories prints the same front page.
import { FEEDS } from "./feeds.js";
import { matchStory } from "./library.js";

const HOUR = 3600 * 1000;

// Higher is further up the page.
export function scoreStory(story, { now = Date.now(), terms = [] } = {}) {
  const ageHours = Math.max(0, (now - (story.timestamp || 0)) / HOUR);
  let score = 100 / (1 + ageHours / 6); // half-life of roughly six hours
  if (story.videos && story.videos.length) score += 12;
  if (story.imageUrl) score += 4;
  const hits = matchStory(story, terms);
  if (hits.length) score += 60 + 5 * Math.min(hits.length - 1, 3);
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
