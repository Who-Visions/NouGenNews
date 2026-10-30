// Feeds come as RSS (<item>) or Atom (<entry>). The wire parser reads RSS-shaped items, so an Atom feed is turned into
// the same shape here: title, link, guid, pubDate, description, content:encoded, dc:creator, category, enclosure, and
// the media:* tags untouched. One function in, strings out; nothing here touches the page.

const attr = (tag, name) => {
  const m = new RegExp(`\\b${name}\\s*=\\s*(?:"([^"]*)"|'([^']*)')`, "i").exec(tag);
  return m ? (m[1] !== undefined ? m[1] : m[2]) : "";
};

const inner = (xml, name) => {
  const m = new RegExp(`<${name}\\b[^>]*>([\\s\\S]*?)</${name}>`, "i").exec(xml);
  return m ? m[1] : "";
};

const unescapeHtml = (s) => s.replace(/&lt;/g, "<").replace(/&gt;/g, ">").replace(/&quot;/g, '"').replace(/&#0?39;|&apos;/g, "'").replace(/&amp;/g, "&");

const cdata = (s) => `<![CDATA[${String(s).replace(/\]\]>/g, "]]]]><![CDATA[>")}]]>`;

// Atom text constructs: type="html" holds escaped HTML, type="xhtml" holds real markup, "text" holds plain text.
function textOf(xml, name) {
  const m = new RegExp(`<${name}\\b([^>]*)>([\\s\\S]*?)</${name}>`, "i").exec(xml);
  if (!m) return "";
  const type = attr(m[1], "type").toLowerCase();
  let body = m[2].trim();
  const cd = /^<!\[CDATA\[([\s\S]*?)\]\]>$/.exec(body);
  if (cd) return cd[1];
  if (type === "xhtml") return body.replace(/^<div\b[^>]*>/i, "").replace(/<\/div>\s*$/i, "");
  if (type === "html") return unescapeHtml(body);
  return body;
}

// The story's own address: the alternate link, else a link with no rel, never self/replies/edit.
function linkOf(entry) {
  let fallback = "";
  for (const m of entry.matchAll(/<link\b[^>]*\/?>/gi)) {
    const rel = attr(m[0], "rel").toLowerCase();
    const href = attr(m[0], "href");
    if (!href) continue;
    if (rel === "alternate") return href;
    if (!rel && !fallback) fallback = href;
  }
  return fallback;
}

function entryToItem(entry) {
  const title = textOf(entry, "title");
  const link = linkOf(entry);
  const id = inner(entry, "id").trim();
  const when = inner(entry, "published").trim() || inner(entry, "updated").trim();
  const summary = textOf(entry, "summary");
  const content = textOf(entry, "content");
  const author = inner(inner(entry, "author"), "name").trim();
  const out = ["<item>"];
  out.push(`<title>${cdata(title)}</title>`);
  out.push(`<link>${link}</link>`);
  out.push(`<guid>${id || link}</guid>`);
  if (when) out.push(`<pubDate>${when}</pubDate>`);
  if (summary || content) out.push(`<description>${cdata(summary || content)}</description>`);
  if (content) out.push(`<content:encoded>${cdata(content)}</content:encoded>`);
  if (author) out.push(`<dc:creator>${author}</dc:creator>`);
  for (const m of entry.matchAll(/<category\b[^>]*>/gi)) {
    const term = attr(m[0], "label") || attr(m[0], "term");
    if (term) out.push(`<category>${term}</category>`);
  }
  for (const m of entry.matchAll(/<link\b[^>]*rel\s*=\s*["']enclosure["'][^>]*\/?>/gi)) {
    const href = attr(m[0], "href");
    if (href) out.push(`<enclosure url="${href}" type="${attr(m[0], "type")}" />`);
  }
  // Pictures and videos the entry carries in media: tags stay readable by the image and video readers.
  for (const m of entry.matchAll(/<media:[a-z]+\b[^>]*?(?:\/>|>[\s\S]*?<\/media:[a-z]+>)/gi)) out.push(m[0]);
  out.push("</item>");
  return out.join("");
}

// The items of a feed, RSS-shaped. RSS items (with or without attributes, as in RSS 1.0 rdf:about) pass through as they
// are; an Atom feed's entries are converted. Anything else gives an empty list.
export function feedItems(xml) {
  const s = String(xml || "");
  const rss = s.match(/<item\b[^>]*>[\s\S]*?<\/item>/gi);
  if (rss && rss.length) return rss;
  const entries = s.match(/<entry\b[^>]*>[\s\S]*?<\/entry>/gi);
  return entries ? entries.map(entryToItem) : [];
}
