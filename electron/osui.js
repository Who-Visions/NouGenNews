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
  return /^https:\/\/[^\s]+$/i.test(s) && s.length <= 2000 ? s : null;
}

// The story picture as a notification icon, or undefined. http: fetch-like; nativeImage: Electron's module.
async function notificationIcon(url, { http, nativeImage, maxBytes = MAX_ICON_BYTES } = {}) {
  const u = notifyImageUrl(url);
  if (!u || !http || !nativeImage) return undefined;
  try {
    const res = await http(u, { method: "GET" }, { timeoutMs: 6000 });
    if (!res || !res.ok) return undefined;
    const type = String((res.headers && res.headers.get && res.headers.get("content-type")) || "");
    if (!/^image\/(png|jpe?g|webp|gif|bmp)/i.test(type)) return undefined;
    const buf = Buffer.from(await res.arrayBuffer());
    if (!buf.length || buf.length > maxBytes) return undefined;
    let img = nativeImage.createFromBuffer(buf);
    if (!img || img.isEmpty()) return undefined;
    if (img.getSize().width > ICON_WIDTH) img = img.resize({ width: ICON_WIDTH, quality: "good" });
    return img;
  } catch (_) {
    return undefined;
  }
}

module.exports = { accentHex, readableOnDark, notifyImageUrl, notificationIcon, luminance };
