// Reporting versus opinion, and how much of the feed one outlet may hold. Labels and demotes; never deletes a story.

const OPINION_URL = /\/(opinions?|commentary|editorials?|op-?eds?|columns?|columnists?|perspectives?)(\/|$)/i;
const OPINION_TITLE = /^\s*(opinion|commentary|editorial|op-?ed|column|perspective|hot take)\s*[:|–—-]/i;

export function isOpinion(story) {
  if (OPINION_TITLE.test(String(story?.title || ""))) return true;
  try { return OPINION_URL.test(new URL(story?.link || "").pathname); } catch { return false; }
}

const DEFAULT_MAX_PER_SOURCE = 3;

// Keeps order, moving each outlet's stories past `max` to the end so one loud outlet cannot fill the top of the feed.
export function capSources(stories, max = DEFAULT_MAX_PER_SOURCE) {
  const seen = new Map();
  const kept = [];
  const over = [];
  for (const s of Array.isArray(stories) ? stories : []) {
    const key = String(s.source || s.id).toLowerCase();
    const n = (seen.get(key) || 0) + 1;
    seen.set(key, n);
    (n > max ? over : kept).push(s);
  }
  return [...kept, ...over];
}
