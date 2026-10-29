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
