// Who made a story, and who made its picture, read from what the source itself says. Pure functions, no network.
//
// The rule every reader of the wire follows: credit comes from the source's own metadata. A byline is a person the
// feed or page names (dc:creator, <author>, Atom <author><name>, itunes:author, media:credit role="author", JSON-LD
// author, meta author tags). The publisher is the outlet the feed belongs to, else the page's og:site_name, else the
// address's own domain. Nothing here invents a name: when a source names nobody, authors stays empty.

const decode = (s) => String(s || "")
  .replace(/<!\[CDATA\[([\s\S]*?)\]\]>/gi, "$1")
  .replace(/&#x([0-9a-f]+);/gi, (_, h) => { try { return String.fromCodePoint(parseInt(h, 16)); } catch { return ""; } })
  .replace(/&#(\d+);/g, (_, d) => { try { return String.fromCodePoint(+d); } catch { return ""; } })
  .replace(/&amp;/g, "&").replace(/&lt;/g, "<").replace(/&gt;/g, ">").replace(/&quot;/g, '"').replace(/&#0?39;|&apos;/g, "'").replace(/&nbsp;/g, " ");
const squash = (s) => decode(s).replace(/<[^>]*>/g, " ").replace(/[​-‏⁠﻿­]/g, "").replace(/\s+/g, " ").trim();

const attr = (tag, name) => {
  const m = String(tag).match(new RegExp(`\\b${name}\\s*=\\s*(?:"([^"]*)"|'([^']*)')`, "i"));
  return m ? decode(m[1] !== undefined ? m[1] : m[2]) : "";
};
const allInner = (xml, tag) => [...String(xml || "").matchAll(new RegExp(`<${tag}\\b[^>]*>([\\s\\S]*?)<\\/${tag}>`, "gi"))].map((m) => m[1]);

// Words that are a desk, a role or the outlet itself, never a person.
const NOT_A_PERSON = /^(by|and|staff|staff writer|staff reporter|reporter|correspondent|editor|editors|editorial|editorial staff|the editors|admin|administrator|team|newsroom|news desk|desk|web desk|wire|wires|guest|guest author|contributor|contributors|unknown|anonymous|none|null|undefined|n\/a)$/i;

// "jane@x.com (Jane Doe)" -> "Jane Doe"; a bare email has no name to credit.
function fromEmailForm(s) {
  const m = s.match(/^\s*[^\s@()]+@[^\s@()]+\s*\(([^)]+)\)\s*$/);
  if (m) return m[1];
  if (/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(s)) return "";
  return s;
}

// ALL CAPS bylines ("KIM BARKER") read as names, not shouting.
function titleCaseIfShouting(s) {
  if (!/[a-z]/.test(s) && /[A-Z]{2}/.test(s)) return s.toLowerCase().replace(/(^|[\s'-])(\p{L})/gu, (_, a, b) => a + b.toUpperCase());
  return s;
}

/**
 * Raw bylines -> clean, deduped names. Splits "A, B and C", strips "By"/"Written by", drops emails, links, handles,
 * desks and anything that equals a brand in `brands` (the outlet's own name is not an author).
 */
export function cleanAuthors(list, { brands = [] } = {}) {
  const brandSet = new Set([].concat(brands || []).map((b) => String(b || "").toLowerCase().replace(/^@/, "").trim()).filter(Boolean));
  const seen = new Set();
  const out = [];
  const raws = [].concat(list || []).flatMap((r) => (r && typeof r === "object" ? [r.name || ""] : [r]));
  for (const raw0 of raws) {
    const raw = fromEmailForm(squash(raw0));
    const parts = raw.replace(/^(by|written by|reporting by|story by|words by|posted by)\s*:?\s+/i, "").split(/\s*(?:,|;|\||\band\b|&|\bwith\b)\s*/i);
    for (const p0 of parts) {
      let name = fromEmailForm(p0).replace(/^(by|written by)\s+/i, "").replace(/\s*[·•—–]\s.*$/, "").replace(/\s+-\s.*$/, "").replace(/^["'“‘]|["'”’]$/g, "").trim();
      name = titleCaseIfShouting(name);
      if (!name || name.length < 3 || name.length > 60) continue;
      if (NOT_A_PERSON.test(name) || /https?:|www\.|@|\d{2,}|\.(com|net|org|io)\b|\bstaff$/i.test(name)) continue;
      if (name.split(/\s+/).length > 5) continue;
      const k = name.toLowerCase();
      if (brandSet.has(k) || brandSet.has(k.replace(/\s+/g, ""))) continue;
      if (!seen.has(k)) { seen.add(k); out.push(name); }
    }
  }
  return out.slice(0, 8);
}

/**
 * Authors an RSS/Atom item names, as [{name, url?}]. Reads every dc:creator, RSS <author> (email form or plain),
 * Atom <author><name>/<uri>, itunes:author and media:credit with role author. `brands` keeps the outlet's own name out.
 */
export function authorsFromXmlItem(xml, { brands = [] } = {}) {
  const s = String(xml || "");
  const found = []; // {name, url}
  for (const v of allInner(s, "dc:creator")) found.push({ name: v });
  for (const block of allInner(s, "author")) {
    const name = allInner(block, "name")[0];
    if (name !== undefined) found.push({ name, url: squash(allInner(block, "uri")[0] || "") });
    else found.push({ name: block });
  }
  for (const v of allInner(s, "itunes:author")) found.push({ name: v });
  for (const m of s.matchAll(/<media:credit\b([^>]*)>([\s\S]*?)<\/media:credit>/gi)) {
    if (/author/i.test(attr(m[1], "role"))) found.push({ name: m[2] });
  }
  const names = cleanAuthors(found.map((f) => f.name), { brands });
  return names.map((name) => {
    const hit = found.find((f) => f.url && cleanAuthors([f.name], { brands })[0] === name);
    return hit && /^https?:\/\//i.test(hit.url) ? { name, url: hit.url } : { name };
  });
}

/**
 * The credit line for an item's picture, as the feed states it: media:credit (any role but author), else
 * media:copyright. Empty when the feed says nothing; the caller then credits the publisher.
 */
export function imageCreditFromXmlItem(xml) {
  const s = String(xml || "");
  for (const m of s.matchAll(/<media:credit\b([^>]*)>([\s\S]*?)<\/media:credit>/gi)) {
    if (/author/i.test(attr(m[1], "role"))) continue;
    const v = squash(m[2]);
    if (v) return v.slice(0, 160);
  }
  const c = squash(allInner(s, "media:copyright")[0] || "");
  return c ? c.slice(0, 160) : "";
}

/** Caption or alt text a feed attaches to its picture (media:description / media:title inside media:content). */
export function imageCaptionFromXmlItem(xml) {
  const s = String(xml || "");
  const block = s.match(/<media:content\b[^>]*>([\s\S]*?)<\/media:content>/i);
  const within = block ? block[1] : "";
  const v = squash(allInner(within, "media:description")[0] || allInner(within, "media:title")[0] || "");
  return v ? v.slice(0, 300) : "";
}

// ---- pages ------------------------------------------------------------------------------------------------------

function meta(html, ...names) {
  for (const n of names) {
    const a = new RegExp(`<meta\\b[^>]*\\b(?:property|name|itemprop)=["']${n}["'][^>]*\\bcontent=["']([^"']*)["']`, "i");
    const b = new RegExp(`<meta\\b[^>]*\\bcontent=["']([^"']*)["'][^>]*\\b(?:property|name|itemprop)=["']${n}["']`, "i");
    const m = String(html).match(a) || String(html).match(b);
    if (m && squash(m[1])) return squash(m[1]);
  }
  return "";
}

function jsonLd(html) {
  const out = [];
  for (const m of String(html || "").matchAll(/<script\b[^>]*type=["']application\/ld\+json["'][^>]*>([\s\S]*?)<\/script>/gi)) {
    try {
      const v = JSON.parse(m[1].trim());
      for (const o of Array.isArray(v) ? v : [v]) { if (o && Array.isArray(o["@graph"])) out.push(...o["@graph"]); else if (o) out.push(o); }
    } catch { /* one bad block never hides the rest */ }
  }
  return out;
}
const isArticle = (o) => [].concat((o && o["@type"]) || []).some((t) => /Article|Posting|Report|BlogPosting/i.test(String(t)));

/**
 * What an article page says about its credit: {authors:[{name,url?}], siteName, publishedAt, modifiedAt, canonical,
 * imageCredit}. JSON-LD first (it names people and their pages), then meta tags, then rel/itemprop author links.
 */
export function creditsFromHtml(html, { brands = [] } = {}) {
  const s = String(html || "");
  const ld = jsonLd(s).find(isArticle) || {};
  const ldPeople = [].concat(ld.author || []).flatMap((p) => (typeof p === "string" ? [{ name: p }] : p && p.name ? [{ name: p.name, url: typeof p.url === "string" ? p.url : "" }] : []));
  const metaNames = [...s.matchAll(/<meta\b[^>]*\b(?:property|name)=["'](?:article:author|author|parsely-author|sailthru\.author|dc\.creator|byl)["'][^>]*\bcontent=["']([^"']*)["']/gi)]
    .map((m) => ({ name: m[1] })).filter((x) => !/^https?:/i.test(x.name));
  const relNames = [...s.matchAll(/<a\b[^>]*\brel=["']author["'][^>]*>([\s\S]{0,200}?)<\/a>/gi)].map((m) => ({ name: squash(m[1]), url: attr(m[0], "href") }));
  const siteName = meta(s, "og:site_name", "application-name") || (ld.publisher && typeof ld.publisher === "object" ? squash(ld.publisher.name || "") : "");
  const people = [...ldPeople, ...metaNames, ...relNames];
  const names = cleanAuthors(people.map((p) => p.name), { brands: [...[].concat(brands), siteName] });
  const authors = names.map((name) => {
    const hit = people.find((p) => p.url && /^https?:\/\//i.test(p.url) && cleanAuthors([p.name])[0] === name);
    return hit ? { name, url: hit.url } : { name };
  });
  const iso = (v) => { const t = Date.parse(String(v || "")); return Number.isFinite(t) ? new Date(t).toISOString() : ""; };
  const canonical = (s.match(/<link\b[^>]*\brel=["']canonical["'][^>]*>/i) || [""])[0];
  const ldImage = [].concat(ld.image || [])[0];
  return {
    authors,
    siteName,
    publishedAt: iso(ld.datePublished) || iso(meta(s, "article:published_time", "datePublished", "pubdate", "date")),
    modifiedAt: iso(ld.dateModified) || iso(meta(s, "article:modified_time", "og:updated_time", "dateModified")),
    canonical: canonical ? attr(canonical, "href") : meta(s, "og:url"),
    imageCredit: (ldImage && typeof ldImage === "object" ? squash(ldImage.creditText || ldImage.copyrightHolder?.name || ldImage.author?.name || "") : "") || meta(s, "image:credit", "og:image:credit"),
  };
}

// ---- publisher --------------------------------------------------------------------------------------------------

// Outlets whose address does not spell their name. Anything else reads its name from the domain.
const KNOWN = {
  "theverge.com": "The Verge", "arstechnica.com": "Ars Technica", "foxnews.com": "Fox News", "nytimes.com": "The New York Times",
  "nypost.com": "New York Post", "pagesix.com": "Page Six", "washingtonpost.com": "The Washington Post", "wsj.com": "The Wall Street Journal",
  "bbc.co.uk": "BBC", "bbc.com": "BBC", "cnn.com": "CNN", "reuters.com": "Reuters", "apnews.com": "Associated Press", "npr.org": "NPR",
  "theguardian.com": "The Guardian", "bloomberg.com": "Bloomberg", "techcrunch.com": "TechCrunch", "wired.com": "Wired",
  "the-decoder.com": "The Decoder", "deadline.com": "Deadline", "tvline.com": "TVLine", "slashfilm.com": "/Film", "comicbook.com": "ComicBook.com",
  "animenewsnetwork.com": "Anime News Network", "cartoonbrew.com": "Cartoon Brew", "creativebloq.com": "Creative Bloq", "gsmarena.com": "GSMArena",
  "kotaku.com": "Kotaku", "arxiv.org": "arXiv", "github.com": "GitHub", "news.ycombinator.com": "Hacker News", "csoonline.com": "CSO Online",
  "haitiantimes.org": "The Haitian Times", "cnbc.com": "CNBC", "nbcnews.com": "NBC News", "cbsnews.com": "CBS News", "abcnews.go.com": "ABC News",
  "axios.com": "Axios", "politico.com": "Politico", "engadget.com": "Engadget", "venturebeat.com": "VentureBeat", "zdnet.com": "ZDNET",
  "9to5mac.com": "9to5Mac", "9to5google.com": "9to5Google", "macrumors.com": "MacRumors", "theinformation.com": "The Information",
  "huggingface.co": "Hugging Face", "youtube.com": "YouTube", "youtu.be": "YouTube", "medium.com": "Medium", "substack.com": "Substack",
};

/** "www.theverge.com" from any address; "" when it is not one. */
export function domainOf(url) {
  try { return new URL(String(url)).hostname.toLowerCase().replace(/^www\./, ""); } catch { return ""; }
}

/** The outlet's display name for a domain: a known one, else the domain's own label made readable. */
export function publisherNameFromDomain(domain) {
  const d = String(domain || "").toLowerCase().replace(/^www\./, "");
  if (!d) return "";
  if (KNOWN[d]) return KNOWN[d];
  const parent = d.split(".").slice(-2).join(".");
  if (KNOWN[parent]) return KNOWN[parent];
  if (/\.(substack|medium|github|blogspot|wordpress)\.(com|io)$/.test(d)) return d.split(".")[0];
  const label = d.split(".").length > 2 && !/^(co|com|org|net|gov|ac)$/.test(d.split(".").slice(-2)[0]) ? d.split(".").slice(-2)[0] : d.split(".")[0];
  return label.replace(/[-_]+/g, " ").replace(/\b\p{L}/gu, (c) => c.toUpperCase());
}

/**
 * The publisher of a story: {name, domain, url}. Priority: the feed's own outlet name (it is the outlet), the page's
 * og:site_name, then the article address's domain. A discovery path (Hacker News, GDELT) is never the publisher; the
 * story's address decides that, and the path goes in `via`.
 */
export function publisherFor({ url = "", feedName = "", siteName = "", feedHome = "" } = {}) {
  const domain = domainOf(url) || domainOf(feedHome);
  const name = squash(feedName) || squash(siteName) || publisherNameFromDomain(domain);
  return { name: name || domain || "", domain, url: domain ? `https://${domain}` : "" };
}

/** "By Jane Doe and Sam Roe, The Verge" / "The Verge" / "". */
export function creditLine({ authors = [], publisher = null } = {}) {
  const names = [].concat(authors || []).map((a) => (typeof a === "string" ? a : a && a.name)).filter(Boolean);
  const pub = publisher && (typeof publisher === "string" ? publisher : publisher.name);
  const by = names.length === 0 ? "" : names.length === 1 ? names[0] : `${names.slice(0, -1).join(", ")} and ${names[names.length - 1]}`;
  if (by && pub) return `By ${by}, ${pub}`;
  if (by) return `By ${by}`;
  return pub || "";
}
