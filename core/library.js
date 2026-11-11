// Library terms: the titles a person owns (NouGenFlix library, or an exported titles file) turned into
// search terms, so news about them can be found and lifted. Pure functions, no I/O: each app reads its own
// library and hands the raw titles in.

// Release-name noise that never belongs in a search term.
const NOISE = /\b(?:2160p|1080p|720p|480p|4k|uhd|hdr10?|dv|x26[45]|h\.?26[45]|hevc|avc|aac|ac3|dts|atmos|ddp?5?\.?1|web-?dl|web-?rip|blu-?ray|bd-?rip|dvd-?rip|remux|proper|repack|extended|unrated|multi|dual|subbed|dubbed|complete|batch)\b/gi;
const SEASON_EP = /\b(?:s\d{1,2}(?:e\d{1,3})?|season\s*\d+|e\d{2,3}|ep(?:isode)?\s*\d+)\b/gi;
const GROUP = /[\[(][^\])]*[\])]/g;
const YEAR = /\b(?:19|20)\d{2}\b/g;

// "Dune.Part.Two.2024.1080p.WEB-DL.x265-GROUP" -> "Dune Part Two"
export function normalizeTitle(raw) {
  return String(raw || "")
    .replace(GROUP, " ")
    .replace(/[._]+/g, " ")
    .replace(NOISE, " ")
    .replace(SEASON_EP, " ")
    .replace(YEAR, " ")
    .replace(/-\s*[A-Za-z0-9]+$/, " ")
    .replace(/\s+/g, " ")
    .trim();
}

// Folder and category names a library carries that are not titles ("Anime", "Home Movies"): never a search term.
const STOP = new Set(["the", "a", "an", "of", "and", "part", "movie", "movies", "film", "films", "show", "shows", "series", "anime", "tv", "tv shows", "cartoons", "cartoon", "kids", "documentary", "documentaries", "specials", "special", "collection", "related", "home", "home movies", "misc", "other", "new", "unknown", "season", "seasons", "super", "stand up"]);
const MAX_WORDS = 6;
// Chart names and numbered folders ("Anime Related 1", "The Greatest TV Shows of ...") are not titles.
const JUNK = /related \d|^the (?:best|greatest|top)\b/i;

// The distinct, searchable terms from a list of raw library titles. A term this short or this common
// would match half the wire, so it is dropped.
export function extractTerms(rawTitles, { minLength = 4 } = {}) {
  const seen = new Map();
  for (const raw of rawTitles || []) {
    const t = normalizeTitle(raw);
    const key = t.toLowerCase();
    if (t.length < minLength || STOP.has(key) || t.split(" ").length > MAX_WORDS || JUNK.test(t) || seen.has(key)) continue;
    seen.set(key, t);
  }
  return [...seen.values()];
}

const escapeRe = (s) => s.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");

// The library terms a story mentions (headline, summary, tags). Whole-word, case-insensitive.
export function matchStory(story, terms) {
  const hay = `${story?.title || ""} ${story?.desc || ""} ${(story?.categories || []).join(" ")}`;
  return (terms || []).filter((t) => new RegExp(`(^|[^\\p{L}\\p{N}])${escapeRe(t)}($|[^\\p{L}\\p{N}])`, "iu").test(hay));
}

// A Google News RSS search for one term: gives a title its own live feed beyond the fixed sources.
export function termFeedUrl(term) {
  return `https://news.google.com/rss/search?q=${encodeURIComponent(`"${term}"`)}&hl=en-US&gl=US&ceid=US:en`;
}

// Drops terms that match too much of the wire to mean anything (a title that is also a common word).
// A term may hit at most maxShare of the stories, and never fewer than minAllowed of them.
export function pruneTerms(stories, terms, { maxShare = 0.04, minAllowed = 4 } = {}) {
  const limit = Math.max(minAllowed, Math.floor((stories || []).length * maxShare));
  const counts = new Map(terms.map((t) => [t, 0]));
  for (const s of stories || []) for (const t of matchStory(s, terms)) counts.set(t, counts.get(t) + 1);
  return terms.filter((t) => counts.get(t) <= limit);
}
