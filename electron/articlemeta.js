// What a page says about its story besides the body: who wrote it, when, in a sentence or two, and the words it keeps
// coming back to. Deterministic and local (no model): the same page always gives the same answer, so a card and the
// assistant can both lean on it. The ideas follow newspaper3k (keyword frequency with a title boost; extractive
// summary scored by title overlap, keyword density, sentence length and position) and Goose (link density); the code is
// our own and works on plain strings, so it is cheap to test.

const STOP = new Set(("a about above after again against all also am an and any are aren't as at be because been before being below between both but by can " +
  "can't cannot could couldn't did didn't do does doesn't doing don't down during each few for from further had hadn't has hasn't have haven't having he he'd he'll " +
  "he's her here here's hers herself him himself his how how's i i'd i'll i'm i've if in into is isn't it it's its itself just let's me more most mustn't my myself " +
  "no nor not now of off on once only or other ought our ours ourselves out over own said same say says shan't she she'd she'll she's should shouldn't so some such " +
  "than that that's the their theirs them themselves then there there's these they they'd they'll they're they've this those through to too under until up us " +
  "very was wasn't we we'd we'll we're we've were weren't what what's when when's where where's which while who who's whom why why's will with won't would " +
  "wouldn't photo photograph image images getty reuters npr advertisement copyright you you'd you'll you're you've your yours yourself yourselves according added told one two new mr mrs ms may might much many get got like").split(/\s+/));

const decode = (s) => String(s || "")
  .replace(/[​-‏⁠﻿­]/g, "") // zero-width and soft-hyphen characters some publishers embed
  .replace(/&amp;/g, "&").replace(/&lt;/g, "<").replace(/&gt;/g, ">").replace(/&quot;/g, '"').replace(/&#0?39;|&apos;/g, "'").replace(/&nbsp;/g, " ")
  .replace(/&#(\d+);/g, (_, n) => { try { return String.fromCodePoint(+n); } catch { return ""; } });
const squash = (s) => decode(s).replace(/<[^>]*>/g, " ").replace(/\s+/g, " ").trim();

// The content of a <meta> tag by its property/name, whichever order the attributes come in.
function meta(html, ...names) {
  for (const n of names) {
    const a = new RegExp(`<meta\\b[^>]*\\b(?:property|name|itemprop)=["']${n}["'][^>]*\\bcontent=["']([^"']*)["']`, "i");
    const b = new RegExp(`<meta\\b[^>]*\\bcontent=["']([^"']*)["'][^>]*\\b(?:property|name|itemprop)=["']${n}["']`, "i");
    const m = html.match(a) || html.match(b);
    if (m && squash(m[1])) return squash(m[1]);
  }
  return "";
}

// Every JSON-LD block that parses, with @graph flattened.
function jsonLd(html) {
  const out = [];
  for (const m of html.matchAll(/<script\b[^>]*type=["']application\/ld\+json["'][^>]*>([\s\S]*?)<\/script>/gi)) {
    try {
      const v = JSON.parse(m[1].trim());
      for (const o of Array.isArray(v) ? v : [v]) { if (o && Array.isArray(o["@graph"])) out.push(...o["@graph"]); else if (o) out.push(o); }
    } catch { /* a malformed block is skipped, the rest still count */ }
  }
  return out;
}

const isArticleType = (o) => [].concat(o && o["@type"] || []).some((t) => /Article|Posting|Report/i.test(String(t)));
const personNames = (v) => [].concat(v || []).flatMap((p) => (typeof p === "string" ? p.split(/\s*(?:,|\band\b|&)\s*/) : p && p.name ? [p.name] : [])).map(squash);

// "By Jane Roe and Sam Poe" -> names; rejects sentences and agency boilerplate.
function cleanAuthors(list) {
  const seen = new Set();
  const out = [];
  const split = list.flatMap((raw) => squash(raw).replace(/^(by|written by|reporting by|story by)\s+/i, "").split(/\s*(?:,|;|\band\b|&)\s*/));
  for (const raw of split) {
    const name = squash(raw).replace(/\s*[|·•—-]\s.*$/, "").trim();
    if (!name || name.length < 3 || /^(by|and|staff|reporter|correspondent)$/i.test(name) || name.length > 60 || name.split(/\s+/).length > 5 || /https?:|@|\d{2,}|staff$|^(editor|admin|the)\b/i.test(name)) continue;
    const k = name.toLowerCase();
    if (!seen.has(k)) { seen.add(k); out.push(name); }
  }
  return out.slice(0, 6);
}

function toIso(v) {
  const t = Date.parse(String(v || "").trim());
  return Number.isFinite(t) ? new Date(t).toISOString() : "";
}

// Authors, publish time, description, canonical URL, site name, language: first source that says wins.
function extractMeta(html, url = "") {
  const s = String(html || "");
  const ld = jsonLd(s).find(isArticleType) || {};
  const authors = cleanAuthors([
    ...personNames(ld.author),
    ...[...s.matchAll(/<meta\b[^>]*\b(?:property|name)=["'](?:article:author|author|parsely-author|sailthru\.author)["'][^>]*\bcontent=["']([^"']*)["']/gi)].map((m) => m[1]),
    ...[...s.matchAll(/<(?:a|span|p|div)\b[^>]*\b(?:rel=["']author["']|itemprop=["']author["']|class=["'][^"']*\b(?:byline|author)[^"']*["'])[^>]*>([\s\S]{0,200}?)<\/(?:a|span|p|div)>/gi)].map((m) => squash(m[1])),
  ]);
  const publishedAt = toIso(ld.datePublished) || toIso(meta(s, "article:published_time", "og:article:published_time", "datePublished", "date", "pubdate", "parsely-pub-date", "sailthru.date"))
    || toIso((s.match(/<time\b[^>]*\bdatetime=["']([^"']+)["']/i) || [])[1]);
  const modifiedAt = toIso(ld.dateModified) || toIso(meta(s, "article:modified_time", "og:updated_time"));
  const canonical = ((s.match(/<link\b[^>]*rel=["']canonical["'][^>]*href=["']([^"']+)["']/i) || s.match(/<link\b[^>]*href=["']([^"']+)["'][^>]*rel=["']canonical["']/i) || [])[1] || meta(s, "og:url") || "").trim();
  let abs = canonical;
  try { if (canonical && url) abs = new URL(canonical, url).toString(); } catch { abs = canonical; }
  return {
    authors,
    publishedAt,
    modifiedAt,
    description: squash(ld.description) || meta(s, "og:description", "description", "twitter:description"),
    canonical: abs,
    siteName: meta(s, "og:site_name", "application-name") || squash(ld.publisher && ld.publisher.name),
    lang: ((s.match(/<html\b[^>]*\blang=["']([a-zA-Z-]+)["']/i) || [])[1] || meta(s, "og:locale", "language") || "").slice(0, 8).toLowerCase(),
    keywordsMeta: meta(s, "news_keywords", "keywords").split(/\s*,\s*/).filter((k) => k && k.length < 40).slice(0, 12),
  };
}

const words = (t) => (String(t || "").toLowerCase().match(/[\p{L}\p{N}][\p{L}\p{N}'’-]*/gu) || []).map((w) => w.replace(/’/g, "'"));
const isKey = (w) => w.length > 2 && !STOP.has(w) && !/^\d+$/.test(w);

// Ranked keywords: how often a word recurs, with the headline's words counting double (newspaper's approach).
function keywords(text, title = "", n = 10) {
  const body = words(text).filter(isKey);
  if (body.length < 20) return [];
  const freq = new Map();
  for (const w of body) freq.set(w, (freq.get(w) || 0) + 1);
  const head = new Set(words(title).filter(isKey));
  const scored = [...freq].map(([w, c]) => [w, (c / body.length) * 1.5 * (head.has(w) ? 2 : 1) + (c > 1 ? 0 : -1)]);
  return scored.filter(([, v]) => v > 0).sort((a, b) => b[1] - a[1] || (a[0] < b[0] ? -1 : 1)).slice(0, n).map(([w]) => w);
}

// Sentences, keeping abbreviations and decimals together.
function sentences(text) {
  const t = squash(text).replace(/\b(Mr|Mrs|Ms|Dr|Prof|Sr|Jr|St|Inc|Ltd|Co|U\.S|U\.K|vs|etc|No)\./g, "$1\u0001").replace(/(\d)\.(\d)/g, "$1\u0002$2");
  return (t.match(/[^.!?]+[.!?]+["')\]]*|[^.!?]+$/g) || []).map((x) => x.replace(/\u0001/g, ".").replace(/\u0002/g, ".").trim()).filter((x) => x.split(/\s+/).length >= 5
    && /^[\p{Lu}\p{N}“"‘']/u.test(x)                                                              // a fragment that opens mid-sentence (closing quote, lowercase) is not a sentence
    && !/^(photograph|photo|image|illustration|credit|source|advertisement|getty|file photo|screenshot|video)\b[:\s]/i.test(x)); // captions are not story
}

// Extractive summary: the n best sentences, returned in reading order. Score = title overlap + keyword density (sum and
// adjacent-pair) + closeness to ~20 words + an early-position bonus, as newspaper does.
function summarize(text, title = "", n = 4) {
  const sents = sentences(text);
  if (sents.length <= n) return sents;
  const keys = keywords(text, title, 10);
  const score = new Map(keys.map((w, i) => [w, (keys.length - i) / keys.length]));
  const head = new Set(words(title).filter(isKey));
  const ranked = sents.map((s, i) => {
    const ws = words(s).filter(isKey);
    const hits = ws.map((w) => score.get(w) || 0);
    const sum = hits.reduce((a, b) => a + b, 0) / (ws.length || 1);
    // Density: keywords that sit close together count more (product over squared distance, between consecutive keyword hits).
    const at = hits.map((h, k) => [h, k]).filter(([h]) => h > 0);
    let dens = 0;
    for (let k = 1; k < at.length; k++) dens += (at[k][0] * at[k - 1][0]) / (at[k][1] - at[k - 1][1]) ** 2;
    dens /= ws.length || 1;
    const titleScore = head.size ? ws.filter((w) => head.has(w)).length / head.size : 0;
    const len = Math.max(0, 1 - Math.abs(20 - s.split(/\s+/).length) / 20);
    const pos = i < sents.length * 0.1 ? 1 : i < sents.length * 0.2 ? 0.8 : i < sents.length * 0.5 ? 0.5 : 0.3;
    return { i, s, v: ((titleScore + sum * 2 + dens * 2) / 2) * 10 + len * 3 + pos * 2 };
  });
  return ranked.sort((a, b) => b.v - a.v || a.i - b.i).slice(0, n).sort((a, b) => a.i - b.i).map((x) => x.s);
}

// Share of a block's text that sits inside links: nav lists and "related" rails are nearly all link, a story is not.
function linkDensity(html) {
  const all = squash(html).length;
  if (!all) return 1;
  let linked = 0;
  for (const m of String(html).matchAll(/<a\b[^>]*>([\s\S]*?)<\/a>/gi)) linked += squash(m[1]).length;
  return Math.min(1, linked / all);
}

module.exports = { extractMeta, keywords, summarize, sentences, linkDensity, squash, STOP };
