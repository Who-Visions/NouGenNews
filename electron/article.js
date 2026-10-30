// The full story behind a News tab headline. Most feeds carry only a summary, so the article page is
// fetched here (a page cannot read another site, CORS) and reduced to its body: the <article> element,
// or else the block with the most paragraph text, minus navigation, scripts, comments and share bars.
// Videos the page carries (YouTube embeds and direct .mp4/.webm files) are listed so the reader can play
// them in the app. The renderer still sanitizes what comes back; this only chooses what to keep.
const { fetchSafe } = require("./safe");
const { extractMeta, keywords, summarize, linkDensity, squash } = require("./articlemeta");

const MAX_BYTES = 3 * 1024 * 1024;
const YT = /(?:youtube(?:-nocookie)?\.com\/(?:embed\/|watch\?(?:[^"'\s&]*&)?v=|shorts\/)|youtu\.be\/)([A-Za-z0-9_-]{11})/g;
const FILE = /https?:\/\/[^\s"'<>]+?\.(?:mp4|webm|m4v)(?:\?[^\s"'<>]*)?/gi;
const DROP = /<(script|style|noscript|nav|header|footer|aside|form|svg|iframe|template|button)\b[\s\S]*?<\/\1>/gi;
const JUNK_CLASS = /\b(share|social|related|recommend|newsletter|comments?|sidebar|promo|advert|ad-|cookie|subscribe|footer|nav|menu|breadcrumb)\b/i;

// Every playable video named in a piece of HTML or XML, YouTube first, each once.
function findVideos(text) {
  const s = String(text || "");
  const out = [];
  const seen = new Set();
  for (const m of s.matchAll(YT)) if (!seen.has(m[1])) { seen.add(m[1]); out.push({ kind: "youtube", id: m[1] }); }
  for (const m of s.matchAll(FILE)) {
    const url = m[0].replace(/&amp;/g, "&");
    if (!seen.has(url)) { seen.add(url); out.push({ kind: "file", url }); }
  }
  return out;
}

const textLen = (html) => String(html).replace(/<[^>]*>/g, " ").replace(/\s+/g, " ").trim().length;
const paragraphText = (html) => [...String(html).matchAll(/<p\b[^>]*>([\s\S]*?)<\/p>/gi)].reduce((n, m) => n + textLen(m[1]), 0);

// Strips the parts of a page that are not the story, then keeps the richest block.
function extractArticle(html, url = "") {
  let s = String(html || "").replace(/<!--[\s\S]*?-->/g, "");
  const title = squash((s.match(/<meta[^>]+property=["']og:title["'][^>]+content=["']([^"']+)/i) || s.match(/<title>([^<]*)/i) || [])[1] || "").trim();
  const videos = findVideos(s);
  s = s.replace(DROP, "");
  let body = (s.match(/<article\b[^>]*>([\s\S]*?)<\/article>/i) || [])[1] || "";
  if (paragraphText(body) < 400) {
    // No usable <article>: the <div> or <section> whose own paragraphs hold the most text.
    let best = "";
    let bestLen = 0;
    for (const m of s.matchAll(/<(div|section|main)\b([^>]*)>([\s\S]*?)<\/\1>/gi)) {
      if (JUNK_CLASS.test(m[2])) continue;
      // A block that is mostly links is a menu or a related-stories rail, however much text it holds.
      const len = paragraphText(m[3]) * (1 - Math.min(0.9, linkDensity(m[3])));
      if (len > bestLen) { bestLen = len; best = m[3]; }
    }
    if (bestLen > paragraphText(body)) body = best;
  }
  body = body.replace(/<(div|section|aside|ul)\b[^>]*class=["'][^"']*\b(share|social|related|newsletter|comments?)\b[^"']*["'][^>]*>[\s\S]*?<\/\1>/gi, "");
  // The page's own headline (the app shows the title itself) and its breadcrumb trail are furniture, not story.
  body = body.replace(/<h1\b[^>]*>[^]*?<[/]h1>/gi, "").replace(/<(ul|ol|nav)\b[^>]*breadcrumb[^>]*>[^]*?<[/]\1>/gi, "");
  // Lazy-loaded images carry the real picture in data-src.
  body = body.replace(/<img\b([^>]*?)\bdata-(?:src|lazy-src|original)=(["'][^"']+["'])([^>]*)>/gi, (all, a, src, b) => (/\bsrc=/.test(a + b) ? all.replace(/\bsrc=["'][^"']*["']/, `src=${src}`) : `<img${a} src=${src}${b}>`));
  // Relative links and pictures resolve against the page.
  if (url) body = body.replace(/\b(href|src)=(["'])(\/[^"']*)\2/gi, (all, k, q, p) => { try { return `${k}=${q}${new URL(p, url)}${q}`; } catch { return all; } });
  return { html: textLen(body) >= 200 ? body.trim() : "", videos, title };
}

const isPublicHost = (h) => !/^(localhost|\[|\d+\.\d+\.\d+\.\d+$)|\.(local|lan|internal)$/i.test(h);

async function articleFetch(raw, http = fetchSafe) {
  let u;
  try { u = new URL(String(raw || "").trim()); } catch { throw new Error("Article error: bad URL"); }
  if (u.protocol !== "https:" || !isPublicHost(u.hostname)) throw new Error("Article error: public https pages only");
  const res = await http(u.toString(), { headers: { Accept: "text/html", "User-Agent": "Mozilla/5.0 NouGenNews" } });
  if (!res.ok) throw new Error(`Article error: HTTP ${res.status}`);
  const html = (await res.text()).slice(0, MAX_BYTES);
  const out = extractArticle(html, u.toString());
  // Who wrote it, when, and the gist: from the page's own tags and the body we kept, no model involved.
  const meta = extractMeta(html, u.toString());
  const text = squash(out.html.replace(/<h\d\b[^>]*>[\s\S]*?<\/h\d>/gi, " ").replace(/<\/(p|li|blockquote)>/gi, ". ").replace(/\.(\s*\.)+/g, "."));
  const kw = keywords(text, out.title, 8);
  Object.assign(out, meta, { keywords: kw.length ? kw : meta.keywordsMeta, summary: text ? summarize(text, out.title, 4) : [] });
  delete out.keywordsMeta;
  // The page's best picture however it names it (Open Graph, Twitter, JSON-LD, its own images); the same reader as feeds use.
  try {
    const { imagesFromHtml, bestImage } = await import("../core/images.js");
    const found = imagesFromHtml(html, u.toString());
    out.image = bestImage(found);
    out.images = found.slice(0, 12).map((c) => c.url);
  } catch { out.image = ""; out.images = []; }
  return out;
}

module.exports = { articleFetch, extractArticle, findVideos };
