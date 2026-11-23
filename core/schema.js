// One shape for a news story, whatever wire, feed, API or page it came from. Version 2 adds credit and image detail to
// the version 1 fields every reader already uses (article_id, title, link, pubDate, source_id, source_name, creator,
// image_url, ...). Nothing in v1 is removed or renamed, so an old reader keeps working on a v2 item and a v1 item is
// read as v2 by `toNewsItem`. The full contract is docs/SCHEMA.md and schema/news-item.v2.json.

import { cleanAuthors, creditLine, domainOf, publisherFor } from "./credits.js";

export const NEWS_SCHEMA_VERSION = 2;

const iso = (v) => {
  if (v === undefined || v === null || v === "") return "";
  const t = typeof v === "number" ? v : Date.parse(String(v));
  return Number.isFinite(t) ? new Date(t).toISOString() : "";
};
const str = (v) => (typeof v === "string" ? v.trim() : v === undefined || v === null ? "" : String(v).trim());
const httpUrl = (v) => { const s = str(v); return /^https?:\/\//i.test(s) ? s : ""; };

// Readable category: "/us/politics/elections" -> "Elections"; "world-news" -> "World News".
export function humanizeCategory(c) {
  const s = str(c).replace(/^https?:\/\/[^/]+/i, "");
  const last = s.split(/[/>|]+/).map((x) => x.trim()).filter(Boolean).pop() || "";
  const words = last.replace(/[-_]+/g, " ").replace(/\s+/g, " ").trim();
  if (!words || words.length > 40) return "";
  return words.replace(/\b\p{L}/gu, (ch) => ch.toUpperCase());
}

function normAuthors(raw, brands) {
  const list = [].concat(raw || []).map((a) => (typeof a === "string" ? { name: a } : a && typeof a === "object" ? a : null)).filter(Boolean);
  const names = cleanAuthors(list.map((a) => a.name), { brands });
  return names.map((name) => {
    const hit = list.find((a) => cleanAuthors([a.name], { brands })[0] === name);
    const out = { name };
    if (hit && httpUrl(hit.url)) out.url = httpUrl(hit.url);
    if (hit && str(hit.role)) out.role = str(hit.role);
    return out;
  });
}

function normImage(img, fallbackCredit) {
  if (!img) return null;
  const o = typeof img === "string" ? { url: img } : img;
  const url = httpUrl(o.url);
  const origin = httpUrl(o.origin_url) || url;
  if (!url && !origin) return null;
  const kind = ["source", "generated", "mirror"].includes(o.kind) ? o.kind : url && origin && url !== origin ? "mirror" : "source";
  const out = { url: url || origin, origin_url: origin, kind };
  const w = parseInt(o.width ?? o.w, 10); if (w > 0) out.width = w;
  const h = parseInt(o.height ?? o.h, 10); if (h > 0) out.height = h;
  const credit = str(o.credit) || (kind === "generated" ? "" : fallbackCredit);
  if (credit) out.credit = credit;
  if (str(o.caption)) out.caption = str(o.caption);
  if (str(o.alt)) out.alt = str(o.alt);
  if (kind === "generated" && str(o.generator)) out.generator = str(o.generator);
  return out;
}

/**
 * Any story-shaped object -> a v2 news item. Reads v1 fields, v2 fields and the common wire/API spellings
 * (url, headline, outlet, author/authors, published_at, image/urlToImage). Returns null without a title and a link.
 *
 * Credit rules: authors are only the names the source gave (never the outlet, never invented); the publisher is the
 * outlet the story's own address belongs to unless the source names it; an aggregator that only led us to the story
 * goes in `via`. v1 fields stay filled: source_name = publisher.name, creator = author names.
 */
/**
 * @param {Record<string, any> | null | undefined} raw
 * @param {{ feedName?: string, via?: { name: string, url?: string } | null, now?: number }} [opts]
 * @returns {Record<string, any> | null}
 */
export function toNewsItem(raw, { feedName = "", via = null, now = Date.now() } = {}) {
  if (!raw || typeof raw !== "object") return null;
  const title = str(raw.title || raw.headline);
  const link = httpUrl(raw.canonical_url) || httpUrl(raw.link) || httpUrl(raw.url);
  if (!title || !link) return null;

  const pubIn = raw.publisher && typeof raw.publisher === "object" ? raw.publisher : null;
  const legacyNougen = str(raw.source_id) === "nougen" || /^nougen\b/i.test(str(raw.source_name));
  const named = str(pubIn && pubIn.name) || (legacyNougen ? "" : str(raw.source_name || raw.outlet || (typeof raw.publisher === "string" ? raw.publisher : "")));
  const base = publisherFor({ url: link, feedName: named || feedName, siteName: str(raw.site_name) });
  const publisher = { name: base.name, domain: str(pubIn && pubIn.domain) || base.domain, url: httpUrl(pubIn && pubIn.url) || httpUrl(raw.source_url) || base.url };
  const logo = httpUrl(pubIn && pubIn.logo) || httpUrl(raw.source_icon);
  if (logo) publisher.logo = logo;
  const pid = str(pubIn && pubIn.id) || (legacyNougen ? "" : str(raw.source_id));
  if (pid) publisher.id = pid;

  const authorsIn = raw.authors !== undefined ? raw.authors : raw.creator !== undefined ? raw.creator : raw.author;
  const authors = normAuthors(authorsIn, [publisher.name, publisher.domain, "NouGen News", "NouGen"]);

  const viaIn = raw.via && typeof raw.via === "object" ? raw.via : via;
  const viaOut = viaIn && str(viaIn.name) && str(viaIn.name).toLowerCase() !== publisher.name.toLowerCase()
    ? { name: str(viaIn.name), ...(httpUrl(viaIn.url) ? { url: httpUrl(viaIn.url) } : {}) } : null;

  const imgCredit = str(raw.image_credit);
  const imagesIn = Array.isArray(raw.images) && raw.images.length ? raw.images
    : [raw.image_url || raw.image || raw.urlToImage ? { url: raw.image_url || raw.image || raw.urlToImage, origin_url: raw.image_origin_url, credit: imgCredit, kind: raw.image_kind } : null];
  const images = imagesIn.map((i) => normImage(i, imgCredit || publisher.name)).filter(Boolean);
  const lead = images[0] || null;

  const published = iso(raw.published_at || raw.pubDate || raw.publishedAt || raw.date);
  const fetched = iso(raw.fetched_at) || iso(now);
  const updated = iso(raw.updated_at || raw.modified_at || raw.dateModified);

  const categories = [...new Set([].concat(raw.category || raw.categories || []).map(humanizeCategory).filter(Boolean))].slice(0, 6);
  const id = str(raw.article_id || raw.story_id || raw.id) || `n2-${hash(link)}`;

  return {
    // v1 fields, kept as every reader expects them
    article_id: id,
    title,
    description: str(raw.description || raw.summary),
    content: str(raw.content),
    link,
    pubDate: published,
    source_id: pid || publisher.domain,
    source_name: publisher.name,
    source_url: publisher.url,
    source_icon: publisher.logo || "",
    creator: authors.map((a) => a.name),
    image_url: lead ? lead.url : null,
    category: categories,
    language: str(raw.language || raw.lang) || undefined,
    // v2 fields
    schema_version: NEWS_SCHEMA_VERSION,
    canonical_url: link,
    publisher,
    authors,
    via: viaOut,
    credit_line: creditLine({ authors, publisher }),
    images,
    image_credit: lead ? lead.credit || "" : "",
    image_origin_url: lead ? lead.origin_url : "",
    published_at: published,
    fetched_at: fetched,
    updated_at: updated || undefined,
    rights: { attribution_required: true, ...(str(raw.license || (raw.rights && raw.rights.license)) ? { license: str(raw.license || raw.rights.license) } : {}) },
  };
}

// Small stable hash for ids built from a link (FNV-1a, hex).
function hash(s) {
  let h = 0x811c9dc5;
  for (const ch of String(s)) { h ^= ch.codePointAt(0); h = Math.imul(h, 0x01000193) >>> 0; }
  return h.toString(16).padStart(8, "0");
}

export { domainOf };
