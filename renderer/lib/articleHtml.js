// Feed article bodies are third-party HTML. They are cleaned here before the reader renders
// them: an allowlist of text tags, http(s) links and images only, and no event handlers,
// styles or script URLs. Used by NewsView.jsx for every article.
import DOMPurify from "dompurify";

const ALLOWED_TAGS = [
  "p", "br", "a", "em", "strong", "b", "i", "u", "span",
  "ul", "ol", "li", "blockquote", "h2", "h3", "h4",
  "img", "figure", "figcaption", "video", "source",
];
const ALLOWED_ATTR = ["href", "src", "alt", "title", "target", "rel", "controls", "poster", "preload", "type"];

// Only web links and images are allowed; anything else (javascript:, data:, file:) is dropped.
const SAFE_URL = /^https?:\/\//i;

export function optimizeLowCacheUrl(rawUrl, width = 760) {
  if (!rawUrl) return "";
  try {
    const clean = String(rawUrl).replace(/&amp;/g, "&").trim();
    const u = new URL(clean);
    if (u.hostname.endsWith("wp.com") || u.pathname.includes("/wp-content/uploads/")) {
      u.searchParams.set("w", String(width));
      u.searchParams.set("strip", "all");
      u.searchParams.set("quality", "75");
      return u.toString();
    }
    return clean;
  } catch {
    return String(rawUrl);
  }
}

export function makeSanitizer(win) {
  const purify = DOMPurify(win);
  purify.addHook("afterSanitizeAttributes", (node) => {
    if (node.hasAttribute("href") && !SAFE_URL.test(node.getAttribute("href"))) {
      node.removeAttribute("href");
    }
    // An image without a safe http(s) source is removed entirely, not left as an empty tag.
    if (node.tagName === "IMG") {
      const src = node.getAttribute("src") || "";
      if (!SAFE_URL.test(src)) {
        node.remove();
        return;
      }
      node.setAttribute("src", optimizeLowCacheUrl(src, 760));
      node.setAttribute("loading", "lazy");
      node.setAttribute("decoding", "async");
      node.setAttribute("referrerpolicy", "no-referrer");
    }
    // A video plays in the reader itself; one without a safe https source is removed.
    if (node.tagName === "VIDEO" || node.tagName === "SOURCE") {
      const src = node.getAttribute("src") || "";
      const hasSource = node.tagName === "VIDEO" && [...node.querySelectorAll("source")].some((c) => SAFE_URL.test(c.getAttribute("src") || ""));
      if (!SAFE_URL.test(src) && !hasSource) { node.remove(); return; }
      if (node.tagName === "VIDEO") {
        node.setAttribute("controls", "");
        node.setAttribute("preload", "metadata");
        const poster = node.getAttribute("poster") || "";
        if (poster && !SAFE_URL.test(poster)) node.removeAttribute("poster");
      }
    }
    if (node.tagName === "A") {
      node.setAttribute("target", "_blank");
      node.setAttribute("rel", "noopener noreferrer");
    }
  });
  return (html) => {
    const raw = String(html || "")
      .replace(/<!\[CDATA\[([\s\S]*?)\]\]>/gi, "$1")
      .replace(/<p[^>]*>\s*(The post|L’article|Cet article)[\s\S]*?(first appeared on|est apparu en premier sur)[\s\S]*?<\/p>/gi, "");
    return purify.sanitize(raw, {
      ALLOWED_TAGS,
      ALLOWED_ATTR: [...ALLOWED_ATTR, "loading", "decoding", "referrerpolicy"],
      ALLOW_DATA_ATTR: false,
      FORBID_TAGS: ["style", "script", "iframe", "object", "embed", "form", "svg", "math"],
      FORBID_ATTR: ["style"],
    });
  };
}

let cached = null;
export function sanitizeArticleHtml(html) {
  if (!cached) cached = makeSanitizer(window);
  return cached(html);
}

// Scraped pages end with site furniture: "Next Article", "More Anime", "Related", "Trending", with
// links, thumbnails and promos under each. None of it is the story. splitTail cuts the body at the first
// such heading and returns what was after it as small items (link, title, picture) for the footer
// carousel, so the story ends where the story ends and the promos still show without taking space.
const TAIL_HEAD = /^\s*(next article|previous article|read next|up next|more\b.{0,40}|related\b.{0,40}|recommended\b.{0,40}|trending\b.{0,40}|you (?:may|might) also like|popular\b.{0,40}|latest\b.{0,40}|don'?t miss|more from\b.{0,40}|sponsored\b.{0,40})\s*:?\s*$/i;

export function splitTail(html, doc = typeof document !== "undefined" ? document : null) {
  const source = String(html || "");
  if (!doc || !source) return { body: source, items: [] };
  const host = doc.createElement("div");
  host.innerHTML = source;
  const kids = [...host.childNodes];
  const at = kids.findIndex((n) => n.nodeType === 1 && /^(H[1-6]|P|STRONG|B)$/.test(n.tagName) && n.textContent.length < 60 && TAIL_HEAD.test(n.textContent));
  // A heading with nothing before it is the story's own first line, not a tail.
  if (at <= 0) return { body: source, items: [] };

  const tail = kids.slice(at);
  const items = [];
  const seen = new Set();
  const holder = doc.createElement("div");
  tail.forEach((n) => holder.appendChild(n.cloneNode(true)));
  for (const a of holder.querySelectorAll("a[href]")) {
    const href = a.getAttribute("href") || "";
    if (!/^https?:\/\//i.test(href) || seen.has(href)) continue;
    const img = a.querySelector("img") || a.closest("figure")?.querySelector("img") || a.previousElementSibling?.querySelector?.("img") || null;
    const title = (a.textContent || "").trim() || img?.getAttribute("alt") || a.getAttribute("title") || "";
    if (!title) continue;
    seen.add(href);
    items.push({ href, title: title.slice(0, 140), img: img ? img.getAttribute("src") || "" : "" });
  }
  // Pictures that carry no link of their own are not promos we can open; they are dropped with the tail.
  const body = kids.slice(0, at).map((n) => (n.nodeType === 1 ? n.outerHTML : n.textContent)).join("");
  return { body, items };
}
