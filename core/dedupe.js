// The same article often arrives from several sources (two APIs and a feed all carrying one CBS story). This keeps
// one copy: the one with a picture, then the longer summary, then the newer. Two stories are the same when they share
// a canonical address or an identical normalised headline; near-matches are left alone, a missed duplicate costing
// less than a lost story.

export function canonicalUrl(u) {
  try {
    const x = new URL(String(u || ""));
    if (!/^https?:$/.test(x.protocol)) return "";
    return (x.hostname.replace(/^www\./, "") + x.pathname.replace(/\/+$/, "")).toLowerCase();
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
    const hit = (uk && byUrl.get(uk)) || (tk.length > 12 && byTitle.get(tk)) || null;
    if (hit) {
      const keep = better(hit, s);
      if (keep !== hit) out[out.indexOf(hit)] = keep;
      if (uk) byUrl.set(uk, keep);
      if (tk.length > 12) byTitle.set(tk, keep);
      continue;
    }
    out.push(s);
    if (uk) byUrl.set(uk, s);
    if (tk.length > 12) byTitle.set(tk, s);
  }
  return out;
}
