// YouTube channels as news sources. Every channel has a public Atom feed (no key, no quota), so a channel is just an id
// or an @handle in a list. Handles are resolved to channel ids once and remembered. The list is data, not code: the
// bundled youtube-channels.json plus whatever the operator adds in the user data folder.
const fs = require("node:fs");
const path = require("node:path");
const { fetchSafe } = require("./safe");

const decode = (s) => String(s || "").replace(/&lt;/g, "<").replace(/&gt;/g, ">").replace(/&quot;/g, '"').replace(/&#39;|&apos;/g, "'").replace(/&amp;/g, "&");
const tag = (xml, name) => { const m = xml.match(new RegExp(`<${name}[^>]*>([^]*?)</${name}>`, "i")); return m ? decode(m[1]).trim() : ""; };

// "@TheAiGrid", "youtube.com/@TheAiGrid", "https://www.youtube.com/channel/UC...", or a bare "UC..." id.
function parseChannelRef(ref) {
  const s = String(ref || "").trim();
  const id = s.match(/(?:^|\/channel\/)(UC[A-Za-z0-9_-]{22})(?:$|[/?#])/);
  if (id) return { id: id[1] };
  const handle = s.match(/(?:^|youtube\.com\/)@([A-Za-z0-9._-]{3,60})/i);
  if (handle) return { handle: handle[1] };
  return null;
}

// Atom feed -> stories. One story per video, to the millisecond the channel published it.
function parseAtom(xml, channelName = "") {
  const out = [];
  const name = tag(String(xml).split(/<entry>/i)[0], "name") || channelName;
  for (const e of String(xml).split(/<entry>/i).slice(1)) {
    const videoId = tag(e, "yt:videoId");
    if (!/^[A-Za-z0-9_-]{11}$/.test(videoId)) continue;
    const published = Date.parse(tag(e, "published")) || 0;
    out.push({
      title: tag(e, "title"), link: `https://www.youtube.com/watch?v=${videoId}`, source: name,
      desc: tag(e, "media:description").slice(0, 400), ytDesc: tag(e, "media:description").slice(0, 6000), ytId: videoId, thumbnail: `https://i.ytimg.com/vi/${videoId}/hqdefault.jpg`,
      timestamp: published, videos: [{ kind: "youtube", id: videoId }],
    });
  }
  return out;
}

async function resolveHandle(handle, http) {
  const res = await http(`https://www.youtube.com/@${encodeURIComponent(handle)}`, { headers: { "Accept-Language": "en" } }, { retries: false, timeoutMs: 15000 });
  if (!res.ok) return "";
  const html = await res.text();
  const m = html.match(/<link rel="canonical" href="https:[/][/]www[.]youtube[.]com[/]channel[/](UC[A-Za-z0-9_-]{22})"/) || html.match(/"channelId":"(UC[A-Za-z0-9_-]{22})"/);
  return m ? m[1] : "";
}

// When a link is wrong or gone, the channel's name still finds it: the first channel in YouTube's channel search.
async function resolveName(name, http) {
  const res = await http(`https://www.youtube.com/results?search_query=${encodeURIComponent(name)}&sp=EgIQAg%3D%3D`, { headers: { "Accept-Language": "en" } }, { retries: false, timeoutMs: 15000 });
  if (!res.ok) return "";
  const m = (await res.text()).match(/"channelId":"(UC[A-Za-z0-9_-]{22})"/);
  return m ? m[1] : "";
}

function readJson(file, fallback) { try { return JSON.parse(fs.readFileSync(file, "utf8")); } catch { return fallback; } }

// A list entry is a reference ("@handle", a link, a UC id) or { name, ref }. Returns { ref, name }.
const entry = (e) => (e && typeof e === "object" ? { ref: String(e.ref || e.url || "").trim(), name: String(e.name || "").trim() } : { ref: String(e || "").trim(), name: "" });

// Every channel's latest videos, merged. { items, channels: [{ref, id, ok}] }. Never throws.
async function fetchYoutube({ userDir, bundled = path.join(__dirname, "youtube-channels.json"), http = fetchSafe, perChannel = 6 } = {}) {
  const idsFile = path.join(userDir, "youtube-ids.json");
  const known = readJson(idsFile, {});
  const raw = [...(readJson(bundled, { channels: [] }).channels || []), ...(readJson(path.join(userDir, "youtube-channels.json"), { channels: [] }).channels || [])].map(entry).filter((e) => e.ref || e.name);
  const unique = [...new Map(raw.map((e) => [(e.ref || e.name).toLowerCase(), e])).values()];
  let dirty = false;
  const remember = (k, id) => { if (id && known[k] !== id) { known[k] = id; dirty = true; } };
  const feed = async (id) => {
    const res = await http(`https://www.youtube.com/feeds/videos.xml?channel_id=${id}`, {}, { retries: false, timeoutMs: 15000 });
    return res.ok ? parseAtom(await res.text()).slice(0, perChannel) : null;
  };
  const channels = await Promise.all(unique.map(async ({ ref, name }) => {
    const label = ref || name;
    try {
      const p = parseChannelRef(ref);
      const key = p && p.handle ? p.handle.toLowerCase() : "";
      let id = (p && p.id) || (key && known[key]) || "";
      if (!id && p && p.handle) { id = await resolveHandle(p.handle, http); remember(key, id); }
      let items = id ? await feed(id) : null;
      if (!items && name) {
        const nk = `name:${name.toLowerCase()}`;
        const byName = known[nk] || (await resolveName(name, http));
        if (byName && byName !== id) { id = byName; items = await feed(id); if (items) remember(nk, id); }
      }
      return items ? { ref: label, id, ok: true, items } : { ref: label, id, ok: false, items: [] };
    } catch { return { ref: label, ok: false, items: [] }; }
  }));
  if (dirty) { try { fs.mkdirSync(userDir, { recursive: true }); fs.writeFileSync(idsFile, JSON.stringify(known)); } catch { /* a missing cache only costs a lookup */ } }
  return { items: channels.flatMap((c) => c.items), channels: channels.map(({ ref, id, ok }) => ({ ref, id, ok })) };
}

// Adds a channel to the user's list; returns the new list.
function addChannel(userDir, ref) {
  if (!parseChannelRef(ref)) throw new Error("not a YouTube channel (use @handle, a channel link or a UC id)");
  const file = path.join(userDir, "youtube-channels.json");
  const list = readJson(file, { channels: [] }).channels || [];
  if (!list.includes(ref)) list.push(ref);
  fs.mkdirSync(userDir, { recursive: true });
  fs.writeFileSync(file, JSON.stringify({ channels: list }, null, 2));
  return list;
}

module.exports = { parseChannelRef, parseAtom, fetchYoutube, addChannel };
