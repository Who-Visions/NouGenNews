// Every feed and every page names its pictures differently: media:content with or without a type, a thumbnail beside
// it, an enclosure, an itunes tag, an <image> block, an <img> in the summary with src, data-src or a srcset, Open Graph
// and Twitter meta tags, JSON-LD, a preload hint. This reads all of those and returns the candidates ranked, so a story
// gets the best picture its source offers instead of the first one a single pattern happens to find. Pure functions.

const IMG_EXT = /\.(?:jpe?g|png|webp|avif|gif)(?:[?#]|$)/i;
// Pictures that are not the story's: tracking pixels, spacers, logos, icons, avatars, emoji, ad slots.
const JUNK = /(?:^|[/_.-])(?:1x1|pixel|spacer|blank|clear|transparent|tracking|beacon|logo|icon|favicon|sprite|avatar|gravatar|emoji|badge|button|placeholder|loading|ads?|banner-ad|doubleclick)(?:[/_.-]|$)|\/(?:emoji|icons?|avatars?|logos?)\//i;

export const decode = (s) => String(s || "").replace(/&amp;/g, "&").replace(/&#38;|&#x26;/gi, "&").replace(/&quot;/g, '"').replace(/&#39;|&apos;/g, "'").trim();

// An address made absolute against the page it came from; anything that is not http(s) is dropped.
export function absolutize(u, base = "") {
  const s = decode(u);
  if (!s || /^(?:data|javascript|blob|about):/i.test(s)) return "";
  try {
    const url = new URL(s.startsWith("//") ? `https:${s}` : s, base || undefined);
    return /^https?:$/.test(url.protocol) ? url.toString() : "";
  } catch {
    return "";
  }
}

// "a.jpg 320w, b.jpg 1280w" -> the widest. A density list ("a.jpg 1x, b.jpg 2x") uses the highest density.
export function bestFromSrcset(srcset, base = "") {
  let best = null;
  for (const part of String(srcset || "").split(/,\s+(?=\S)/)) {
    const bits = part.trim().split(/\s+/);
    const url = absolutize(bits[0], base);
    if (!url) continue;
    const d = bits[1] || "";
    const w = /w$/i.test(d) ? parseInt(d, 10) : /x$/i.test(d) ? Math.round(parseFloat(d) * 1000) : 0;
    if (!best || w > best.w) best = { url, w };
  }
  return best;
}

const attrs = (tag) => {
  const out = {};
  for (const m of String(tag).matchAll(/([\w:-]+)\s*=\s*(?:"([^"]*)"|'([^']*)')/g)) out[m[1].toLowerCase()] = m[2] !== undefined ? m[2] : m[3];
  return out;
};

const tooSmall = (w, h) => (w && w < 100) || (h && h < 100);
const junky = (u) => JUNK.test(u);

function add(list, url, extra = {}) {
  if (!url || list.some((c) => c.url === url)) return;
  list.push({ url, w: 0, h: 0, via: "", ...extra });
}

// Candidates from one <img> (or <source>) tag, however it carries its address.
function fromImgTag(tag, base, list, via = "img") {
  const a = attrs(tag);
  const w = parseInt(a.width, 10) || 0;
  const h = parseInt(a.height, 10) || 0;
  if (tooSmall(w, h)) return;
  const set = bestFromSrcset(a.srcset || a["data-srcset"] || a["data-lazy-srcset"], base);
  if (set && !junky(set.url)) add(list, set.url, { w: set.w, h, via: `${via}:srcset` });
  for (const k of ["src", "data-src", "data-lazy-src", "data-original", "data-full-url", "data-large-file", "data-hi-res-src"]) {
    const u = absolutize(a[k], base);
    if (u && !junky(u)) add(list, u, { w, h, via: `${via}:${k}` });
  }
}

// ---- RSS / Atom items ---------------------------------------------------------------------------------------------

export function imagesFromXmlItem(xml, base = "") {
  const s = String(xml || "");
  const list = [];

  // media:content / media:thumbnail, wherever they sit (also inside media:group). A type or medium that says it is
  // not an image (a video, audio) is skipped; one that says nothing counts when the address looks like a picture.
  for (const m of s.matchAll(/<media:(content|thumbnail)\b([^>]*)\/?>/gi)) {
    const a = attrs(m[2]);
    const url = absolutize(a.url, base);
    if (!url || junky(url)) continue;
    const kind = `${a.type || ""} ${a.medium || ""}`.toLowerCase();
    if (/video|audio/.test(kind) || (m[1].toLowerCase() === "content" && !/image/.test(kind) && !IMG_EXT.test(url))) continue;
    const w = parseInt(a.width, 10) || 0;
    const h = parseInt(a.height, 10) || 0;
    if (tooSmall(w, h)) continue;
    add(list, url, { w, h, via: `media:${m[1].toLowerCase()}` });
  }
  // enclosure (RSS) and <link rel="enclosure"> (Atom)
  for (const m of s.matchAll(/<(?:enclosure|link)\b([^>]*)\/?>/gi)) {
    const a = attrs(m[1]);
    if (m[0].toLowerCase().startsWith("<link") && a.rel !== "enclosure") continue;
    const url = absolutize(a.url || a.href, base);
    if (url && !junky(url) && (/image/i.test(a.type || "") || (!a.type && IMG_EXT.test(url)))) add(list, url, { via: "enclosure" });
  }
  // itunes:image and the feed-style <image><url>
  for (const m of s.matchAll(/<itunes:image\b([^>]*)\/?>/gi)) add(list, absolutize(attrs(m[1]).href, base), { via: "itunes" });
  for (const m of s.matchAll(/<image\b[^>]*>\s*(?:<url>\s*([^<\s]+)\s*<\/url>|(https?:[^<\s]+))/gi)) add(list, absolutize(m[1] || m[2], base), { via: "image-block" });
  for (const m of s.matchAll(/<(?:image|thumbnail|thumb|photo|picture|cover|poster|urlToImage|image_url|imageUrl|main_image|featured_image)>\s*(?:<!\[CDATA\[)?\s*(https?:[^<\]\s]+)/gi)) add(list, absolutize(m[1], base), { via: "named-tag" });
  // <img> tags inside the summary or content, escaped or not
  const html = s.replace(/<!\[CDATA\[([^]*?)\]\]>/g, "$1").replace(/&lt;/g, "<").replace(/&gt;/g, ">").replace(/&quot;/g, '"');
  for (const m of html.matchAll(/<(?:img|source)\b[^>]*>/gi)) fromImgTag(m[0], base, list);
  // a bare picture address in the text
  for (const m of html.matchAll(/https?:\/\/[^\s"'<>)]+\.(?:jpe?g|png|webp|avif)(?:\?[^\s"'<>)]*)?/gi)) {
    const u = absolutize(m[0], base);
    if (u && !junky(u)) add(list, u, { via: "bare" });
  }
  return list;
}

// ---- HTML pages ---------------------------------------------------------------------------------------------------

function jsonLdImages(html, base, list) {
  for (const m of html.matchAll(/<script[^>]+type=["']application\/ld\+json["'][^>]*>([^]*?)<\/script>/gi)) {
    let data;
    try { data = JSON.parse(m[1].trim()); } catch { continue; }
    const walk = (node, depth = 0) => {
      if (!node || depth > 6) return;
      if (Array.isArray(node)) { node.forEach((n) => walk(n, depth + 1)); return; }
      if (typeof node !== "object") return;
      for (const key of ["image", "thumbnailUrl", "primaryImageOfPage", "thumbnail"]) {
        const v = node[key];
        const take = (x) => {
          if (typeof x === "string") add(list, absolutize(x, base), { via: "jsonld" });
          else if (x && typeof x === "object") add(list, absolutize(x.url || x.contentUrl, base), { w: parseInt(x.width, 10) || 0, h: parseInt(x.height, 10) || 0, via: "jsonld" });
        };
        if (Array.isArray(v)) v.forEach(take); else if (v) take(v);
      }
      if (node["@graph"]) walk(node["@graph"], depth + 1);
      for (const k of ["mainEntity", "mainEntityOfPage", "article", "itemListElement"]) if (node[k]) walk(node[k], depth + 1);
    };
    walk(data);
  }
}

export function imagesFromHtml(html, base = "") {
  const s = String(html || "");
  const list = [];
  const meta = {};
  for (const m of s.matchAll(/<meta\b[^>]*>/gi)) {
    const a = attrs(m[0]);
    const key = (a.property || a.name || a.itemprop || "").toLowerCase();
    if (key && a.content !== undefined && !(key in meta)) meta[key] = a.content;
    const wk = key === "og:image:width" ? "w" : key === "og:image:height" ? "h" : "";
    if (wk) meta[wk] = parseInt(a.content, 10) || 0;
  }
  for (const k of ["og:image", "og:image:secure_url", "og:image:url", "twitter:image", "twitter:image:src", "image", "thumbnail", "thumbnailurl", "msapplication-tileimage"]) {
    if (k === "msapplication-tileimage") continue;
    const u = absolutize(meta[k], base);
    if (u && !junky(u)) add(list, u, { w: k.startsWith("og:") ? meta.w || 0 : 0, h: k.startsWith("og:") ? meta.h || 0 : 0, via: k });
  }
  for (const m of s.matchAll(/<link\b[^>]*>/gi)) {
    const a = attrs(m[0]);
    const rel = (a.rel || "").toLowerCase();
    if (rel === "image_src") add(list, absolutize(a.href, base), { via: "image_src" });
    if (rel === "preload" && (a.as || "").toLowerCase() === "image") {
      const set = bestFromSrcset(a.imagesrcset, base);
      add(list, set ? set.url : absolutize(a.href, base), { w: set ? set.w : 0, via: "preload" });
    }
  }
  jsonLdImages(s, base, list);
  // Last resort: the page's own pictures, widest declared first. <noscript> holds the real <img> of lazy loaders.
  const body = s.replace(/<script[^>]*>[^]*?<\/script>|<style[^>]*>[^]*?<\/style>|<head[^>]*>[^]*?<\/head>/gi, (x) => (/^<noscript/i.test(x) ? x : ""));
  const imgs = [];
  for (const m of body.matchAll(/<(?:img|source)\b[^>]*>/gi)) fromImgTag(m[0], base, imgs, "page");
  for (const c of imgs) add(list, c.url, c);
  return list;
}

// The best candidate: a declared large one wins; otherwise the earliest from the most trustworthy source.
const TRUST = ["og:image", "og:image:secure_url", "og:image:url", "twitter:image", "twitter:image:src", "jsonld", "image_src", "preload", "media:content", "media:thumbnail", "enclosure", "image-block", "named-tag", "itunes", "img", "page", "bare"];
const rank = (via) => { const i = TRUST.findIndex((t) => via === t || via.startsWith(`${t}:`)); return i < 0 ? TRUST.length : i; };

export function bestImage(list, { minWidth = 0 } = {}) {
  const ok = (list || []).filter((c) => c && c.url && (!minWidth || !c.w || c.w >= minWidth));
  if (!ok.length) return "";
  const sized = ok.filter((c) => c.w >= 600 || c.w * c.h >= 300000).sort((a, b) => b.w * (b.h || 1) - a.w * (a.h || 1) || rank(a.via) - rank(b.via));
  if (sized.length) return sized[0].url;
  return ok.slice().sort((a, b) => rank(a.via) - rank(b.via))[0].url;
}
