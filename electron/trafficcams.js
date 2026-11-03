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
    const stream = attr("href");
    const poster = attr("poster").replace(/&amp;/g, "&");
    // Each camera lives on its own media server (vf1, vf2, ...): its addresses come from the feed, never from its id.
    if (attr("state") !== "active" || !/^[A-Za-z0-9-]+$/.test(id) || !lat || !lon || !stream.startsWith(`${BASE}/hls/`) || !poster.startsWith("/")) continue;
    out.push({ id, name: unescape(attr("title")), lat, lon, stream, poster });
  }
  return out;
}

function distanceKm(aLat, aLon, bLat, bLon) {
  const rad = Math.PI / 180;
  const h = Math.sin(((bLat - aLat) * rad) / 2) ** 2 + Math.cos(aLat * rad) * Math.cos(bLat * rad) * Math.sin(((bLon - aLon) * rad) / 2) ** 2;
  return 6371 * 2 * Math.asin(Math.sqrt(h));
}

// Cameras the feed calls active can still have no stream; those are left off the map. A failed check keeps the camera.
async function withStream(cameras, http) {
  const kept = [];
  let next = 0;
  await Promise.all(Array.from({ length: 12 }, async () => {
    while (next < cameras.length) {
      const c = cameras[next++];
      const up = await http(c.stream, { signal: AbortSignal.timeout(TIMEOUT_MS) }).then((r) => r.status !== 404, () => true);
      if (up) kept.push(c);
    }
  }));
  return kept;
}

let listCache = null; // { at, cameras }
// The county's cameras when the place is near it, otherwise none. Never throws.
async function camerasNear(lat, lon, { http = fetch, now = Date.now } = {}) {
  if (distanceKm(lat, lon, CENTER[0], CENTER[1]) > RANGE_KM) return [];
  if (listCache && now() - listCache.at < LIST_TTL_MS) return listCache.cameras;
  try {
    const res = await http(`${BASE}/portal/feeds/loader.php`, { signal: AbortSignal.timeout(TIMEOUT_MS) });
    if (!res.ok) return [];
    const cameras = await withStream(parseStreams(await res.text()), http);
    listCache = { at: now(), cameras };
    return cameras;
  } catch { return []; }
}

const findCamera = async (id, http) => {
  const cameras = await camerasNear(CENTER[0], CENTER[1], { http });
  const camera = cameras.find((c) => c.id === id);
  if (!camera) throw new Error("unknown camera");
  return camera;
};

// One camera's current frame as a data address the page can show.
async function cameraFrame(id, { http = fetch } = {}) {
  const res = await http(BASE + (await findCamera(id, http)).poster, { signal: AbortSignal.timeout(TIMEOUT_MS) });
  const type = res.headers.get("content-type") || "";
  if (!res.ok || !type.startsWith("image/jpeg")) throw new Error("no frame");
  return `data:image/jpeg;base64,${Buffer.from(await res.arrayBuffer()).toString("base64")}`;
}

// One camera's live stream address.
const streamUrl = async (id, { http = fetch } = {}) => (await findCamera(id, http)).stream;

module.exports = { streamUrl, parseStreams, camerasNear, cameraFrame };
