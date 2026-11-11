// The same article often arrives from several sources (two APIs and a feed all carrying one CBS story). This keeps
// one copy: the one with a picture, then the longer summary, then the newer. Two stories are the same when they share
// a canonical address or an identical normalised headline; near-matches are left alone, a missed duplicate costing
// less than a lost story.

const TRACKING = /^(utm_.*|fbclid|gclid|dclid|msclkid|mc_[a-z]+|ref|ref_src|referrer|cmp|cid|ocid|taid|igshid|_ga|_gl|oly_.*|s_cid|smid|soc_src|soc_trk)$/i;

export function canonicalUrl(u) {
  try {
    const x = new URL(String(u || ""));
    if (!/^https?:$/.test(x.protocol)) return "";
    // A bare site, or a search page (where the query IS the identity), says nothing about which article it is.
    if (!x.pathname || x.pathname === "/" || /^[/]search[/]?$/.test(x.pathname)) return "";
    // Tracking parameters say nothing about the article; any other parameter may be its identity (watch?v=...).
    const keep = [...x.searchParams].filter(([k]) => !TRACKING.test(k)).map(([k, v]) => k + "=" + v).sort().join("&");
    return (x.hostname.replace(/^www\./, "") + x.pathname.replace(/\/+$/, "") + (keep ? "?" + keep : "")).toLowerCase();
  } catch {
    return "";
  }
}

export function titleKey(title) {
  return String(title || "")
    .toLowerCase()
    .replace(/\s+[-–—|]\s+[^-–—|]{2,40}$/, "")
    .replace(/[^\p{L}\p{N}]+/gu, " ")
    .trim();
}

const better = (a, b) => {
  if (!!a.imageUrl !== !!b.imageUrl) return a.imageUrl ? a : b;
  const da = (a.desc || "").length;
  const db = (b.desc || "").length;
  if (da !== db) return da > db ? a : b;
  return (a.timestamp || 0) >= (b.timestamp || 0) ? a : b;
};

export function dedupeStories(stories) {
  const byUrl = new Map();
  const byTitle = new Map();
  const out = [];
  for (const s of stories || []) {
    const uk = canonicalUrl(s.link);
    const tk = titleKey(s.title);
    // The maps hold positions in out, not the stories, so a replacement can never leave an older alias pointing at a story that is gone.
    const at = (uk ? byUrl.get(uk) : undefined) ?? (tk.length > 12 ? byTitle.get(tk) : undefined);
    if (at !== undefined) {
      out[at] = better(out[at], s);
      if (uk) byUrl.set(uk, at);
      if (tk.length > 12) byTitle.set(tk, at);
      continue;
    }
    out.push(s);
    if (uk) byUrl.set(uk, out.length - 1);
    if (tk.length > 12) byTitle.set(tk, out.length - 1);
  }
  return out;
}
