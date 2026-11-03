// Palm Beach County's traffic cameras for the weather map: the list and still frames from the county's public portal,
// fetched for this reader in the main process. Terms note: WINK's terms restrict redistribution, so a public release
// needs the county's permission.
const BASE = "https://pbctrafficstreams.pbc.gov";
const TIMEOUT_MS = 8000;
const LIST_TTL_MS = 60 * 60 * 1000;
const RANGE_KM = 120;
const CENTER = [26.65, -80.25]; // middle of the county

const unescape = (s) => s.replace(/&amp;/g, "&").replace(/&lt;/g, "<").replace(/&gt;/g, ">").replace(/&quot;/g, '"').replace(/&#0?39;/g, "'");

function parseStreams(xml) {
  const out = [];
  for (const [tag] of String(xml).matchAll(/<stream\b[^>]*>/g)) {
    const attr = (name) => (tag.match(new RegExp(`\\s${name}="([^"]*)"`)) || [])[1] || "";
    const lat = Number(attr("lat"));
    const lon = Number(attr("lng"));
    const id = attr("guid");
    if (attr("state") !== "active" || !/^[A-Za-z0-9-]+$/.test(id) || !lat || !lon) continue;
    out.push({ id, name: unescape(attr("title")), lat, lon });
  }
  return out;
}

function distanceKm(aLat, aLon, bLat, bLon) {
  const rad = Math.PI / 180;
  const h = Math.sin(((bLat - aLat) * rad) / 2) ** 2 + Math.cos(aLat * rad) * Math.cos(bLat * rad) * Math.sin(((bLon - aLon) * rad) / 2) ** 2;
  return 6371 * 2 * Math.asin(Math.sqrt(h));
}

let listCache = null; // { at, cameras }
// The county's cameras when the place is near it, otherwise none. Never throws.
async function camerasNear(lat, lon, { http = fetch, now = Date.now } = {}) {
  if (distanceKm(lat, lon, CENTER[0], CENTER[1]) > RANGE_KM) return [];
  if (listCache && now() - listCache.at < LIST_TTL_MS) return listCache.cameras;
  try {
    const res = await http(`${BASE}/portal/feeds/loader.php`, { signal: AbortSignal.timeout(TIMEOUT_MS) });
    if (!res.ok) return [];
    const cameras = parseStreams(await res.text());
    listCache = { at: now(), cameras };
    return cameras;
  } catch { return []; }
}

// One camera's current frame as a data address the page can show.
async function cameraFrame(id, { http = fetch } = {}) {
  if (!/^[A-Za-z0-9-]+$/.test(String(id))) throw new Error("bad camera id");
  const res = await http(`${BASE}/vf2/media/image.php?guid=${id}`, { signal: AbortSignal.timeout(TIMEOUT_MS) });
  const type = res.headers.get("content-type") || "";
  if (!res.ok || !type.startsWith("image/jpeg")) throw new Error("no frame");
  return `data:image/jpeg;base64,${Buffer.from(await res.arrayBuffer()).toString("base64")}`;
}

// One camera's live stream address.
const streamUrl = (id) => {
  if (!/^[A-Za-z0-9-]+$/.test(String(id))) throw new Error("bad camera id");
  return `${BASE}/hls/public/vf2/${id}_high/index.m3u8`;
};

module.exports = { streamUrl, parseStreams, camerasNear, cameraFrame };
