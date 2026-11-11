import React, { useSyncExternalStore } from "react";
import { ageLabel, exactTime } from "../lib/age.js";

// One shared clock for every label on the page: a second-resolution tick, started with the first label.
let now = Date.now();
let timer = null;
const subs = new Set();
function subscribe(fn) {
  subs.add(fn);
  if (!timer) timer = setInterval(() => { now = Date.now(); subs.forEach((f) => f()); }, 1000);
  return () => { subs.delete(fn); if (!subs.size && timer) { clearInterval(timer); timer = null; } };
}
const snapshot = () => now;

// "42s ago" that keeps counting; hovering shows the exact time to the millisecond.
export function Ago({ ts, fallback = "" }) {
  const t = useSyncExternalStore(subscribe, snapshot);
  const label = ts ? ageLabel(ts, Math.max(t, Date.now() - 1500)) : fallback;
  return <time dateTime={ts ? new Date(ts).toISOString() : undefined} title={ts ? exactTime(ts) : undefined}>{label}</time>;
}
