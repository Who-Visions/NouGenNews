// Breaking-news alerts. A headline alone never raises one: a death hoax or a loose headline would. A story becomes
// an alert only when several independent outlets report the same event within the last hours. Two levels:
//   red   - a notable death, or a major event, reported by several national outlets
//   amber - the same kind of story but local only (a city's own outlets), or with fewer sources
// Pure functions: stories in, alerts out. The app decides how to show them.

const HOUR = 3600 * 1000;
const WINDOW_MS = 12 * HOUR;

// Verbs and phrases that report a death; a bare "dead" or "death" is not enough ("The Walking Dead", "Death Stranding").
const DEATH = /\b(dies|died|has died|passes away|passed away|dead at|death of|found dead|dies at|killed in|slain)\b/i;
// Events that are news the moment several outlets carry them.
const EVENT = /\b(earthquake|tsunami|hurricane|tornado|explosion|terror(?:ist)? attack|mass shooting|shooting|plane crash|crash kills|state of emergency|declares war|invasion|missile strike|assassinat\w+|evacuat\w+|nuclear)\b/i;

const STOP = new Set(["the", "and", "for", "with", "from", "that", "this", "after", "over", "into", "amid", "says", "said", "will", "have", "has", "was", "were", "been", "about", "his", "her", "their", "its", "new", "live", "update", "updates", "report", "reports", "breaking", "dies", "died", "death", "passes", "away", "aged", "age", "star", "actor", "actress", "legend", "veteran", "icon"]);

// "Headline - Publisher" -> "Headline".
const stripPublisher = (t) => String(t || "").replace(/\s+[-–—|]\s+[^-–—|]{2,40}$/, "").trim();

// Significant words of a headline, and the proper nouns among them (capitalised inside the sentence).
function tokens(title) {
  const words = stripPublisher(title).replace(/[^\p{L}\p{N}'\s.-]/gu, " ").split(/\s+/).filter(Boolean);
  const all = new Set();
  const proper = new Set();
  words.forEach((w, i) => {
    const lw = w.toLowerCase().replace(/^[.'-]+|[.'-]+$/g, "");
    if (lw.length < 4 || STOP.has(lw) || /^\d+$/.test(lw)) return;
    all.add(lw);
    if (i > 0 && /^\p{Lu}/u.test(w)) proper.add(lw);
    if (i === 0 && /^\p{Lu}/u.test(w) && w.length > 1 && words.length > 3) proper.add(lw); // a name that opens the headline
  });
  return { all, proper };
}

const sourceKey = (s) => String(s.source || "").toLowerCase().replace(/^www\./, "").replace(/[^a-z0-9.]/g, "");
const isLocal = (s) => s.feedId === "local";

function kindOf(title) {
  if (DEATH.test(title)) return "death";
  if (EVENT.test(title)) return "event";
  return null;
}

// Two candidates are the same story when they are the same kind and share at least two significant words,
// at least one of them a proper noun in both ("Patrick Stewart"; "Hurricane Milton").
function same(a, b) {
  if (a.kind !== b.kind) return false;
  let shared = 0;
  let properShared = 0;
  for (const w of a.tok.all) {
    if (b.tok.all.has(w)) {
      shared += 1;
      if (a.tok.proper.has(w) && b.tok.proper.has(w)) properShared += 1;
    }
  }
  return shared >= 2 && properShared >= 1;
}

// alerts: [{ key, level, kind, headline, story, stories, sourceCount, timestamp }], most urgent first.
export function findAlerts(stories, { now = Date.now(), windowMs = WINDOW_MS } = {}) {
  const cands = [];
  for (const s of stories || []) {
    if (!s || !s.title || !s.timestamp || now - s.timestamp > windowMs || s.timestamp - now > HOUR) continue;
    const kind = kindOf(s.title);
    if (!kind) continue;
    cands.push({ s, kind, tok: tokens(s.title) });
  }
  // Union-find over the few candidates.
  const parent = cands.map((_, i) => i);
  const find = (i) => (parent[i] === i ? i : (parent[i] = find(parent[i])));
  for (let i = 0; i < cands.length; i++) for (let j = i + 1; j < cands.length; j++) if (same(cands[i], cands[j])) parent[find(j)] = find(i);
  const groups = new Map();
  cands.forEach((c, i) => { const r = find(i); if (!groups.has(r)) groups.set(r, []); groups.get(r).push(c); });

  const alerts = [];
  for (const g of groups.values()) {
    const sources = new Set(g.map((c) => sourceKey(c.s)).filter(Boolean));
    const n = sources.size;
    const kind = g[0].kind;
    const national = g.filter((c) => !isLocal(c.s));
    const flagged = g.some((c) => c.s.breaking);
    // Death hoaxes spread through one or two outlets; three independent ones is the bar. Events need four.
    const need = kind === "death" ? 3 : 4;
    let level = null;
    if (national.length && (n >= need || (flagged && n >= 2))) level = "red";
    else if (n >= 3) level = "amber";
    if (!level) continue;
    const pool = (national.length ? national : g).slice().sort((a, b) => (b.s.imageUrl ? 1 : 0) - (a.s.imageUrl ? 1 : 0) || b.s.timestamp - a.s.timestamp);
    const lead = pool[0].s;
    const topWords = [...g[0].tok.proper].slice(0, 3);
    const key = `${kind}:${(topWords.length ? topWords : [...g[0].tok.all].slice(0, 3)).sort().join("-")}`;
    alerts.push({
      key, level, kind, headline: stripPublisher(lead.title), story: lead, stories: g.map((c) => c.s),
      sourceCount: n, timestamp: Math.max(...g.map((c) => c.s.timestamp)),
    });
  }
  return alerts.sort((a, b) => (a.level === b.level ? 0 : a.level === "red" ? -1 : 1) || b.sourceCount - a.sourceCount || b.timestamp - a.timestamp);
}

export const ALERT_WINDOW_MS = WINDOW_MS;
