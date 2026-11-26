// Which stories the reader has opened, heard or been briefed on. Kept on this machine, newest last, capped so it
// never grows without bound. Pure and storage-injectable so it can be tested.
const KEY = "nn.readIds";
export const MAX_READ = 3000;

export function loadRead(storage = globalThis.localStorage) {
  try {
    const a = JSON.parse(storage.getItem(KEY) || "[]");
    return new Set(Array.isArray(a) ? a.filter((x) => typeof x === "string").slice(-MAX_READ) : []);
  } catch { return new Set(); }
}

/** A new Set with `id` added (a Set is replaced, never mutated, so React sees the change). Persists, oldest dropped first. */
export function markRead(set, id, storage = globalThis.localStorage) {
  if (!id || set.has(id)) return set;
  const next = new Set(set);
  next.add(id);
  const keep = [...next].slice(-MAX_READ);
  try { storage.setItem(KEY, JSON.stringify(keep)); } catch { /* storage unavailable: read marks last this session only */ }
  return keep.length === next.size ? next : new Set(keep);
}
