// Same event, different outlets: groups wire stories whose headlines say the same thing and folds the others under
// the best one as "also from". Nothing is deleted; a folded story stays reachable through its lead's `alsoFrom`.
//
// How two stories are judged the same: their headlines' content words (stop words dropped, light stemming) overlap
// strongly (Jaccard) and in absolute terms (enough shared words), and they were published close together. Candidates
// come from an inverted index on words, so a thousand-story wire is not compared pairwise. The thresholds err on
// keeping stories apart: "Apple unveils iPhone" and "Apple unveils MacBook" must stay two stories.

const STOP = new Set((
  "a an and are as at be but by for from has have he her his how in into is it its of on or our over she that the their " +
  "them they this to up was we were what when where which who why will with you your after before about says said say " +
  "new now just more most than then there these those not no yes can could would should may might also still amid " +
  "report reports reportedly update live watch video photos photo news today"
).split(" "));

const WINDOW_MS = 36 * 60 * 60 * 1000;
const MIN_SHARED = 3;
const MIN_JACCARD = 0.5;

// Light stemming, enough that "nears", "near" and "nearing" meet; the words are only compared, never shown.
function stem(w) {
  if (w.length > 5 && w.endsWith("ing")) return w.slice(0, -3);
  if (w.length > 4 && w.endsWith("ed")) return w.slice(0, -2);
  if (w.length > 4 && w.endsWith("es")) return w.slice(0, -2);
  if (w.length > 3 && w.endsWith("s") && !w.endsWith("ss")) return w.slice(0, -1);
  return w;
}

export function titleWords(title) {
  const words = String(title || "")
    .toLowerCase()
    .replace(/\s+[-–—|]\s+[^-–—|]{2,40}$/, "")
    .replace(/[^\p{L}\p{N}]+/gu, " ")
    .split(" ")
    .filter((w) => w.length > 1 && !STOP.has(w))
    .map(stem);
  return new Set(words);
}

// Proper nouns and model names (capitalised or mixed-case tokens) of a headline, lowercased and stemmed. Two
// headlines naming different things ("iPhone" against "MacBook") are different events however many other words match.
// A headline written in Title Case capitalises everything, which makes this rule no stricter than the word overlap.
export function titleEntities(title) {
  const out = new Set();
  const clean = String(title || "").replace(/\s+[-–—|]\s+[^-–—|]{2,40}$/, "");
  for (const tok of clean.split(/[^\p{L}\p{N}']+/u)) {
    const w = tok.replace(/'s?$/i, "");
    if (w.length < 2 || STOP.has(w.toLowerCase())) continue;
    if (/^\p{Lu}/u.test(w) || /\p{Ll}\p{Lu}/u.test(w) || /\d/.test(w)) out.add(stem(w.toLowerCase()));
  }
  return out;
}

function jaccard(a, b) {
  let shared = 0;
  for (const w of a) if (b.has(w)) shared += 1;
  const union = a.size + b.size - shared;
  return { shared, j: union ? shared / union : 0 };
}

// True when two stories are about the same event by the rules above.
export function sameEvent(a, b, wa = titleWords(a.title), wb = titleWords(b.title)) {
  if (a.timestamp && b.timestamp && Math.abs(a.timestamp - b.timestamp) > WINDOW_MS) return false;
  const { shared, j } = jaccard(wa, wb);
  if (shared < MIN_SHARED || j < MIN_JACCARD) return false;
  const ea = titleEntities(a.title);
  const eb = titleEntities(b.title);
  if (ea.size >= 2 && eb.size >= 2 && jaccard(ea, eb).j < MIN_JACCARD) return false;
  return true;
}

// The story that leads its cluster: a picture, then the longer summary, then the newer.
const better = (a, b) => {
  if (!!a.imageUrl !== !!b.imageUrl) return a.imageUrl ? a : b;
  const da = (a.desc || "").length;
  const db = (b.desc || "").length;
  if (da !== db) return da > db ? a : b;
  return (a.timestamp || 0) >= (b.timestamp || 0) ? a : b;
};

// Returns the wire with each same-event cluster folded to its lead. A lead carries `alsoFrom`:
// [{ id, source, title, link, timestamp }] for the stories folded under it, and `clusterSize`. Order of leads is kept.
export function clusterStories(stories) {
  const list = Array.isArray(stories) ? stories : [];
  const words = list.map((s) => titleWords(s.title));
  const parent = list.map((_, i) => i);
  const find = (i) => { while (parent[i] !== i) { parent[i] = parent[parent[i]]; i = parent[i]; } return i; };
  const join = (i, k) => { const a = find(i); const b = find(k); if (a !== b) parent[Math.max(a, b)] = Math.min(a, b); };

  // Inverted index: only stories sharing a word are ever compared. A word on most of the wire says nothing, so it is skipped.
  const index = new Map();
  const common = Math.max(30, Math.floor(list.length * 0.08));
  const postings = new Map();
  words.forEach((set) => { for (const w of set) postings.set(w, (postings.get(w) || 0) + 1); });
  words.forEach((set, i) => {
    const seen = new Set();
    for (const w of set) {
      if (postings.get(w) > common) continue;
      for (const k of index.get(w) || []) seen.add(k);
    }
    for (const k of seen) if (sameEvent(list[k], list[i], words[k], words[i])) join(k, i);
    for (const w of set) {
      if (postings.get(w) > common) continue;
      if (!index.has(w)) index.set(w, []);
      index.get(w).push(i);
    }
  });

  const groups = new Map();
  list.forEach((s, i) => {
    const r = find(i);
    if (!groups.has(r)) groups.set(r, []);
    groups.get(r).push(s);
  });

  const lead = new Map();
  for (const members of groups.values()) {
    if (members.length === 1) continue;
    const top = members.reduce(better);
    // The same outlet twice is one voice; a cluster is worth showing only when other outlets agree.
    const others = members.filter((m) => m !== top);
    lead.set(top, others);
  }
  const folded = new Set([...lead.values()].flat());
  const out = [];
  for (const s of list) {
    if (folded.has(s)) continue;
    const others = lead.get(s);
    if (!others) { out.push(s); continue; }
    // Alert detection counts outlets per story; the stories folded away are no longer on the wire, so the lead carries their count.
    const outlets = new Set([s, ...others].map((m) => String(m.source || m.id).toLowerCase()));
    out.push({
      ...s,
      reportCount: Math.max(s.reportCount || 0, outlets.size),
      clusterSize: others.length + 1,
      alsoFrom: others.map((m) => ({ id: m.id, source: m.source || "", title: m.title, link: m.link || "", timestamp: m.timestamp || 0 })),
    });
  }
  return out;
}
