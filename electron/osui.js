// Small bridges to the operating system's own UI (Electron nativeImage and systemPreferences).
//
// - Breaking-news notifications carry the story's picture: the image is fetched here (https only, image types only,
//   3 MB cap), decoded by nativeImage and shrunk to notification size. Anything wrong just means no picture.
// - The Windows accent color, when the reader turns it on in Settings, becomes the app's accent (--nn-accent).
//   Windows hands it over as "RRGGBBAA"; a dark accent is lightened so it stays readable on the black UI.

const MAX_ICON_BYTES = 3 * 1024 * 1024;
const ICON_WIDTH = 256;

// "RRGGBBAA" (Windows) or "RRGGBB" -> "#rrggbb"; anything else -> null.
function accentHex(raw) {
  const s = String(raw || "").trim().replace(/^#/, "");
  return /^[0-9a-f]{6}([0-9a-f]{2})?$/i.test(s) ? `#${s.slice(0, 6).toLowerCase()}` : null;
}

function luminance(hex) {
  const c = [1, 3, 5].map((i) => parseInt(hex.slice(i, i + 2), 16) / 255)
    .map((v) => (v <= 0.03928 ? v / 12.92 : ((v + 0.055) / 1.055) ** 2.4));
  return 0.2126 * c[0] + 0.7152 * c[1] + 0.0722 * c[2];
}

// Mix toward white until the color reaches minLum relative luminance (about 6:1 against black at 0.25).
function readableOnDark(hex, minLum = 0.25) {
  if (!accentHex(hex)) return null;
  let rgb = [1, 3, 5].map((i) => parseInt(hex.slice(i, i + 2), 16));
  const toHex = (a) => `#${a.map((v) => Math.round(v).toString(16).padStart(2, "0")).join("")}`;
  for (let i = 0; i < 20 && luminance(toHex(rgb)) < minLum; i += 1) rgb = rgb.map((v) => v + (255 - v) * 0.12);
  return toHex(rgb);
}

function notifyImageUrl(url) {
  const s = String(url || "").trim();
  if (!/^https:\/\/[^\s]+$/i.test(s) || s.length > 2000) return null;
  try { return isPrivateHost(new URL(s).hostname) ? null : s; } catch (_) { return null; }
}

// Loopback, private, link-local and unique-local addresses, and names that mean this machine. A story's image URL is
// written by whoever wrote the story; it must never make this app call into the reader's own network.
function isPrivateHost(host) {
  const h = String(host || "").toLowerCase().replace(/^\[|\]$/g, "");
  if (!h || h === "localhost" || h.endsWith(".localhost") || h.endsWith(".local") || h.endsWith(".internal")) return true;
  const v4 = h.match(/^(\d{1,3})\.(\d{1,3})\.(\d{1,3})\.(\d{1,3})$/);
  if (v4) {
    const [a, b] = [Number(v4[1]), Number(v4[2])];
    return a === 0 || a === 10 || a === 127 || (a === 169 && b === 254) || (a === 172 && b >= 16 && b <= 31)
      || (a === 192 && b === 168) || (a === 100 && b >= 64 && b <= 127) || a >= 224;
  }
  if (h.includes(":")) {
    if (h === "::" || h === "::1") return true;
    if (/^f[cd]/.test(h) || /^fe[89ab]/.test(h)) return true;                  // fc00::/7, fe80::/10
    const mapped = h.match(/^::ffff:(\d+\.\d+\.\d+\.\d+)$/);
    // The URL parser writes ::ffff:127.0.0.1 as ::ffff:7f00:1: turn the two hex groups back into IPv4.
    const hex = h.match(/^::ffff:([0-9a-f]{1,4}):([0-9a-f]{1,4})$/);
    if (hex) { const [x, y] = [parseInt(hex[1], 16), parseInt(hex[2], 16)]; return isPrivateHost(`${x >> 8}.${x & 255}.${y >> 8}.${y & 255}`); }
    return mapped ? isPrivateHost(mapped[1]) : false;
  }
  return false;
}

// Reads at most maxBytes; a larger body is cancelled as soon as it crosses the limit, never buffered whole.
async function readCapped(res, maxBytes) {
  const len = Number(res.headers && res.headers.get && res.headers.get("content-length"));
  if (Number.isFinite(len) && len > maxBytes) return null;
  if (!res.body || typeof res.body.getReader !== "function") {
    const buf = Buffer.from(await res.arrayBuffer());
    return buf.length > maxBytes ? null : buf;
  }
  const reader = res.body.getReader();
  const chunks = [];
  let total = 0;
  for (;;) {
    const { done, value } = await reader.read();
    if (done) break;
    total += value.byteLength;
    if (total > maxBytes) { try { await reader.cancel(); } catch (_) { /* already closed */ } return null; }
    chunks.push(Buffer.from(value));
  }
  return Buffer.concat(chunks);
}

// The story picture as a notification icon, or undefined, within a fixed time budget so the alert is never held up.
// http: fetch-like (url, opts, { timeoutMs, retries }); lookup: dns.promises.lookup-like; nativeImage: Electron's.
async function notificationIcon(url, { http, nativeImage, lookup = require("node:dns").promises.lookup, maxBytes = MAX_ICON_BYTES, budgetMs = 3000 } = {}) {
  let u = notifyImageUrl(url);
  if (!u || !http || !nativeImage) return undefined;
  const work = (async () => {
    // Follow at most 3 redirects by hand, so every hop (and what its name resolves to) passes the same check.
    let res = null;
    for (let hop = 0; hop < 4; hop += 1) {
      const host = new URL(u).hostname;
      const addrs = await lookup(host, { all: true }).catch(() => []);
      if (!addrs.length || addrs.some((a) => isPrivateHost(a.address))) return undefined;
      res = await http(u, { method: "GET", redirect: "manual" }, { timeoutMs: budgetMs, retries: false });
      if (!res || res.status < 300 || res.status >= 400) break;
      const next = res.headers && res.headers.get && res.headers.get("location");
      u = next ? notifyImageUrl(new URL(next, u).toString()) : null;
      if (!u) return undefined;
      res = null;
    }
    if (!res || !res.ok) return undefined;
    const type = String((res.headers && res.headers.get && res.headers.get("content-type")) || "");
    if (!/^image\/(png|jpe?g|webp|gif|bmp)/i.test(type)) return undefined;
    const buf = await readCapped(res, maxBytes);
    if (!buf || !buf.length) return undefined;
    let img = nativeImage.createFromBuffer(buf);
    if (!img || img.isEmpty()) return undefined;
    if (img.getSize().width > ICON_WIDTH) img = img.resize({ width: ICON_WIDTH, quality: "good" });
    return img;
  })().catch(() => undefined);
  const late = new Promise((resolve) => { const t = setTimeout(() => resolve(undefined), budgetMs); if (t.unref) t.unref(); });
  return Promise.race([work, late]);
}

module.exports = { accentHex, readableOnDark, notifyImageUrl, notificationIcon, isPrivateHost, luminance };
