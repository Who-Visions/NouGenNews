// The reader's saved places for the Weather tab. Pure list operations; storage is wrapped because it can be unavailable.
const KEY = "nn.watchlist";
export const MAX_PLACES = 12;
const same = (a, b) => a.city.trim().toLowerCase() === b.city.trim().toLowerCase() && (a.region || "").trim().toLowerCase() === (b.region || "").trim().toLowerCase();

export const hasPlace = (list, p) => list.some((x) => same(x, p));
export function addPlace(list, p) {
  if (!p || !p.city || !p.city.trim() || hasPlace(list, p) || list.length >= MAX_PLACES) return list;
  return [...list, { city: p.city.trim(), region: (p.region || "").trim() }];
}
export const removePlace = (list, p) => list.filter((x) => !same(x, p));
export function movePlace(list, p, by) {
  const i = list.findIndex((x) => same(x, p));
  const j = i + by;
  if (i < 0 || j < 0 || j >= list.length) return list;
  const next = [...list];
  [next[i], next[j]] = [next[j], next[i]];
  return next;
}
export function loadWatchlist() {
  try {
    const v = JSON.parse(localStorage.getItem(KEY) || "[]");
    return Array.isArray(v) ? v.filter((p) => p && typeof p.city === "string").slice(0, MAX_PLACES) : [];
  } catch { return []; }
}
export function saveWatchlist(list) {
  try { localStorage.setItem(KEY, JSON.stringify(list)); } catch { /* storage unavailable: this session still works */ }
}
