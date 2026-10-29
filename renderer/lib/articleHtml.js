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

// A picture for a spot that shows it at `width` CSS pixels. WordPress hosts hand out size variants
// ("photo-150x150.jpg"); the suffix is dropped to get the full original, then the CDN is asked for twice the
// width (a crisp image on a dense screen) instead of stretching a thumbnail. Other hosts are left as given.
export function hiResUrl(rawUrl, width = 700) {
  if (!rawUrl) return "";
  try {
    const u = new URL(String(rawUrl).replace(/&amp;/g, "&").trim());
    if (!/^https?:$/.test(u.protocol)) return String(rawUrl);
    const wp = u.hostname.endsWith("wp.com") || u.pathname.includes("/wp-content/uploads/");
    if (!wp) return u.toString();
    u.pathname = u.pathname.replace(/-\d{2,4}x\d{2,4}(\.[A-Za-z0-9]+)$/, "$1");
    u.searchParams.delete("resize");
    u.searchParams.delete("fit");
    u.searchParams.set("w", String(Math.round(width * 2)));
    u.searchParams.set("strip", "all");
    u.searchParams.set("quality", "85");
    return u.toString();
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

// A picture's identity: host and path without CDN prefix, size suffix ("-150x150"), query or extension, so a
// resized or re-encoded copy of the same file counts as the same picture.
export function imageKey(src) {
  try {
    const u = new URL(String(src || "").replace(/&amp;/g, "&").trim());
    // A WordPress CDN address carries the real host as its first path segment ("i0.wp.com/site.test/...").
    const cdn = /^i\d\.wp\.com$/.test(u.hostname);
    return ((cdn ? "" : u.hostname) + (cdn ? u.pathname.replace(/^\//, "") : u.pathname)).replace(/-\d{2,4}x\d{2,4}(\.[A-Za-z0-9]+)$/, "$1").replace(/\.(?:jpe?g|png|webp|avif|gif)$/i, "").toLowerCase();
  } catch {
    return String(src || "");
  }
}

// Removes from an article body any picture that is the lead picture or already appeared earlier in the body (and
// a figure or link left empty by that). The first copy is kept.
export function dropDuplicateImages(html, leadSrc = "", doc = typeof document !== "undefined" ? document : null) {
  const source = String(html || "");
  if (!doc || !source || !/<img/i.test(source)) return source;
  const host = doc.createElement("div");
  host.innerHTML = source;
  const seen = new Set(leadSrc ? [imageKey(leadSrc)] : []);
  let removed = 0;
  for (const img of [...host.querySelectorAll("img")]) {
    const k = imageKey(img.getAttribute("src"));
    if (!k) continue;
    if (seen.has(k)) {
      let node = img;
      // Climb out of wrappers that hold nothing but this picture.
      while (node.parentElement && node.parentElement !== host && /^(A|FIGURE|P|SPAN|DIV)$/.test(node.parentElement.tagName) && !node.parentElement.textContent.trim() && node.parentElement.querySelectorAll("img").length === 1) node = node.parentElement;
      // A caption on a figure is kept with the figure only if it says something: the figure goes with its picture.
      node.remove();
      removed += 1;
    } else {
      seen.add(k);
    }
  }
  return removed ? host.innerHTML : source;
}
