// "Since you last looked": the reader is told what is new the moment they return, and can be briefed on exactly that.
// Pure and storage-injectable so it can be tested; NewsView owns the screen.
import { clampTs } from "./age.js";

const KEY = "nn.lastVisit";
export const MIN_GAP_MS = 10 * 60 * 1000; // a quick glance back is not a return
export const MAX_NEW = 99;

/** When the reader was last here, or 0 on a first run or if storage is unavailable. */
export function loadSince(storage = globalThis.localStorage) {
  try { const t = Number(storage.getItem(KEY)); return Number.isFinite(t) && t > 0 ? t : 0; } catch { return 0; }
}

export function stampVisit(now = Date.now(), storage = globalThis.localStorage) {
  try { storage.setItem(KEY, String(now)); } catch { /* storage unavailable: the banner simply won't appear next time */ }
}

/** Stories published after `since`, newest first. Nothing counts as new on a first run or after a short absence. */
export function newSince(stories, since, now = Date.now()) {
  if (!since || now - since < MIN_GAP_MS) return [];
  return (stories || [])
    .map((s) => ({ s, t: clampTs(s && s.timestamp, now) }))
    .filter((x) => x.t > since)
    .sort((a, b) => b.t - a.t)
    .map((x) => x.s);
}

/** "9 new since 9:12 AM", or "since yesterday 9:12 PM" once the gap passes a day. */
export function catchupLabel(count, since, now = Date.now()) {
  if (!count || !since) return "";
  const d = new Date(since);
  const clock = d.toLocaleTimeString(undefined, { hour: "numeric", minute: "2-digit" });
  const sameDay = new Date(now).toDateString() === d.toDateString();
  const when = sameDay ? clock : `${d.toLocaleDateString(undefined, { weekday: "short" })} ${clock}`;
  return `${count > MAX_NEW ? `${MAX_NEW}+` : count} new since ${when}`;
}
