// "Near you": stories about the reader's own place. The place is the city setting, made exact with the state or
// region the weather lookup resolved ("Springfield, Illinois", not just "Springfield"). The feed is Google News'
// public location feed, which needs no key; its items carry the publisher in <source> and put the same name at
// the end of the headline, which is dropped here.

export const LOCAL_ID = "local";

// "City" or "City, Region": the one string the feed is asked for.
export function localQuery(place, region) {
  const p = String(place || "").trim();
  const r = String(region || "").trim();
  if (!p) return "";
  return r && !p.toLowerCase().includes(r.toLowerCase()) ? `${p}, ${r}` : p;
}

export function localFeedUrl(query) {
  return `https://news.google.com/rss/headlines/section/geo/${encodeURIComponent(String(query || "").trim())}?hl=en-US&gl=US&ceid=US:en`;
}

// "Headline - Publisher" -> "Headline", when the trailing name is the publisher.
export function stripPublisher(title, publisher) {
  const t = String(title || "").trim();
  const p = String(publisher || "").trim();
  if (!p) return t;
  const tail = ` - ${p}`;
  return t.endsWith(tail) ? t.slice(0, -tail.length).trim() : t;
}
