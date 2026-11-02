// Repairs a story picture that fails to load: first the feed's original address, then the best picture on the
// article's own page. When neither loads the picture is removed, so the card never shows a broken-image box.
import { invoke } from "./bridge.js";

const pagePictures = new Map();

export function pagePicture(link, fetchArticle = (url) => invoke("article_fetch", { url })) {
  if (!link) return Promise.resolve("");
  if (!pagePictures.has(link)) {
    if (pagePictures.size > 300) pagePictures.delete(pagePictures.keys().next().value);
    pagePictures.set(link, Promise.resolve().then(() => fetchArticle(link)).then((a) => a?.image || "").catch(() => ""));
  }
  return pagePictures.get(link);
}

// Returns the next address to try, or "" when there is none left. tried holds every address that already failed.
export async function nextPicture({ raw, link, tried }, fetchArticle) {
  if (raw && !tried.has(raw)) return raw;
  const found = await pagePicture(link, fetchArticle);
  return found && !tried.has(found) ? found : "";
}

const attempts = new WeakMap();

export function healImage(event, { raw, link, onGiveUp } = {}) {
  const img = event.currentTarget;
  const tried = attempts.get(img) || new Set();
  attempts.set(img, tried);
  tried.add(img.currentSrc || img.src);
  tried.add(img.getAttribute("src"));
  nextPicture({ raw, link, tried }).then((next) => {
    if (next) { img.src = next; return; }
    img.style.display = "none";
    onGiveUp?.(img);
  });
}
