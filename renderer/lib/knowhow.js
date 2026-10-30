// Know-how: the reader's own rules for the wire, in plain text, plus what 👍 and 👎 teach. No model is involved, so the
// same rules always give the same wire and every change can be explained.
//   boost solar, wind power      stories naming these rise
//   mute celebrity gossip        stories naming these are hidden
//   flag recall                  stories naming these get a marker
//   trust Reuters                this outlet rises
//   demote Example Daily         this outlet sinks
//   cap Comicbook 10%            this outlet fills at most this share of the list
// Lines starting with # are notes.
const TERM_KINDS = new Set(["boost", "mute", "flag"]);
const OUTLET_KINDS = new Set(["trust", "demote"]);
const BOOST = 3;
const TRUST = 2;
const DEMOTE = -3;
const LEARN_LIMIT = 5; // no single word or outlet can gain more weight than this
const LEARN_FLOOR = 2; // one vote alone never reorders the wire: a signal must repeat
const MAX_VOTES = 500;
const STOP = new Set("about after again also been before being could from have just more most much news over said says show some than that their them then there these they this were what when where which while will with would your".split(" "));

export const EXAMPLE = "# One rule per line\n# boost solar, wind power\n# mute celebrity gossip\n# flag recall\n# trust Reuters\n# demote Example Daily\n# cap Comicbook 10%\n";

export function parseRules(text) {
  const rules = [];
  const errors = [];
  String(text || "").split(/\r?\n/).forEach((raw, i) => {
    const line = raw.trim();
    if (!line || line.startsWith("#")) return;
    const m = line.match(/^(\S+)\s*(.*)$/);
    const kind = m[1].toLowerCase();
    const rest = m[2].trim();
    const bad = (why) => errors.push({ line: i + 1, text: line, why });
    if (TERM_KINDS.has(kind)) {
      const terms = rest.split(",").map((t) => t.trim().toLowerCase()).filter(Boolean);
      if (!terms.length) return bad(`${kind} needs at least one word or phrase`);
      rules.push({ kind, terms });
    } else if (OUTLET_KINDS.has(kind)) {
      if (!rest) return bad(`${kind} needs an outlet name`);
      rules.push({ kind, outlet: rest.toLowerCase() });
    } else if (kind === "cap") {
      const c = rest.match(/^(.+?)\s+(\d{1,3})\s*%$/);
      if (!c || Number(c[2]) > 100) return bad("write it like: cap Outlet 10%");
      rules.push({ kind, outlet: c[1].toLowerCase(), share: Number(c[2]) / 100 });
    } else {
      bad(`unknown rule "${m[1]}" (use boost, mute, flag, trust, demote or cap)`);
    }
    return undefined;
  });
  return { rules, errors };
}

const escapeRe = (s) => s.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
const hasTerm = (hay, term) => new RegExp(`(?<![\\p{L}\\p{N}])${escapeRe(term)}(?![\\p{L}\\p{N}])`, "iu").test(hay);
const haystack = (s) => `${s.title || ""} ${s.desc || ""} ${(s.categories || []).join(" ")}`;
const outletOf = (s) => String(s.source || "").toLowerCase();
const named = (s, rule) => rule.terms.filter((t) => hasTerm(haystack(s), t));
const titleWords = (title) => [...new Set((String(title).toLowerCase().match(/\p{L}{4,}/gu) || []).filter((w) => !STOP.has(w)))].slice(0, 6);

export const flagsFor = (story, rules) => rules.filter((r) => r.kind === "flag").flatMap((r) => named(story, r));

function scoreOf(s, rules, learned) {
  let score = 0;
  for (const r of rules) {
    if (r.kind === "boost" && named(s, r).length) score += BOOST;
    if (r.kind === "trust" && outletOf(s).includes(r.outlet)) score += TRUST;
    if (r.kind === "demote" && outletOf(s).includes(r.outlet)) score += DEMOTE;
  }
  const o = learned.outlets[outletOf(s)] || 0;
  if (Math.abs(o) >= LEARN_FLOOR) score += o;
  for (const w of titleWords(s.title)) {
    const v = learned.words[w] || 0;
    if (Math.abs(v) >= LEARN_FLOOR) score += v;
  }
  return score;
}

// Hides, reorders and caps. `keep` holds ids that must never be hidden or capped (a breaking alert's stories).
// Ties keep the order they came in, so with no rules and no learning the list is returned untouched.
export function applyKnowhow(stories, rules, learned = emptyLearned(), keep = new Set()) {
  const stats = { muted: 0, raised: 0, lowered: 0, flagged: 0, capped: 0 };
  const shown = stories.filter((s) => {
    const hit = !keep.has(s.id) && rules.some((r) => r.kind === "mute" && named(s, r).length);
    if (hit) stats.muted += 1;
    return !hit;
  });
  const scored = shown.map((s, i) => ({ s, i, v: scoreOf(s, rules, learned) }));
  for (const x of scored) {
    if (x.v > 0) stats.raised += 1;
    if (x.v < 0) stats.lowered += 1;
    if (flagsFor(x.s, rules).length) stats.flagged += 1;
  }
  const ordered = scored.sort((a, b) => b.v - a.v || a.i - b.i).map((x) => x.s);
  const caps = rules.filter((r) => r.kind === "cap").map((r) => ({ ...r, left: Math.max(1, Math.floor(r.share * ordered.length)) }));
  const out = ordered.filter((s) => {
    if (keep.has(s.id)) return true;
    for (const c of caps) {
      if (!outletOf(s).includes(c.outlet)) continue;
      if (c.left <= 0) { stats.capped += 1; return false; }
      c.left -= 1;
    }
    return true;
  });
  return { stories: out, stats };
}

export const emptyLearned = () => ({ outlets: {}, words: {}, votes: {} });

const bump = (map, key, by) => {
  const v = Math.max(-LEARN_LIMIT, Math.min(LEARN_LIMIT, (map[key] || 0) + by));
  if (v) map[key] = v; else delete map[key];
};

// dir is 1 or -1. Voting the same way again takes the vote back; the other way replaces it.
export function vote(learned, story, dir) {
  const next = { outlets: { ...learned.outlets }, words: { ...learned.words }, votes: { ...learned.votes } };
  const had = next.votes[story.id];
  if (had) {
    bump(next.outlets, had.outlet, -had.dir);
    for (const w of had.words) bump(next.words, w, -had.dir);
    delete next.votes[story.id];
    if (had.dir === dir) return next;
  }
  const entry = { dir, outlet: outletOf(story), words: titleWords(story.title), at: Date.now() };
  bump(next.outlets, entry.outlet, dir);
  for (const w of entry.words) bump(next.words, w, dir);
  next.votes[story.id] = entry;
  const ids = Object.keys(next.votes);
  if (ids.length > MAX_VOTES) {
    ids.sort((a, b) => next.votes[a].at - next.votes[b].at).slice(0, ids.length - MAX_VOTES).forEach((id) => delete next.votes[id]);
  }
  return next;
}

export function forget(learned, kind, key) {
  const next = { outlets: { ...learned.outlets }, words: { ...learned.words }, votes: { ...learned.votes } };
  delete next[kind][key];
  return next;
}

// What has actually taken effect, strongest first, for the panel.
export function learnedSignals(learned) {
  const rows = (kind) => Object.entries(learned[kind]).filter(([, v]) => Math.abs(v) >= LEARN_FLOOR).map(([key, weight]) => ({ kind, key, weight }));
  return [...rows("outlets"), ...rows("words")].sort((a, b) => Math.abs(b.weight) - Math.abs(a.weight));
}

export function loadKnowhow() {
  let text = EXAMPLE;
  let on = true;
  let learned = emptyLearned();
  try {
    const t = localStorage.getItem("nn.knowhow");
    if (t !== null) text = t;
    on = localStorage.getItem("nn.knowhowOn") !== "0";
    const l = JSON.parse(localStorage.getItem("nn.learned") || "null");
    if (l && l.outlets && l.words && l.votes) learned = l;
  } catch { /* storage unavailable or damaged: start clean */ }
  return { text, on, learned };
}

export function saveKnowhow({ text, on, learned }) {
  try {
    localStorage.setItem("nn.knowhow", text);
    localStorage.setItem("nn.knowhowOn", on ? "1" : "0");
    localStorage.setItem("nn.learned", JSON.stringify(learned));
  } catch { /* storage unavailable: this session still works */ }
}
