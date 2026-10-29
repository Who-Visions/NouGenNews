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
      desc: tag(e, "media:description").slice(0, 400), thumbnail: `https://i.ytimg.com/vi/${videoId}/hqdefault.jpg`,
      timestamp: published, videos: [{ kind: "youtube", id: videoId }],
    });
  }
  return out;
}

async function resolveHandle(handle, http) {
  const res = await http(`https://www.youtube.com/@${encodeURIComponent(handle)}`, { headers: { "Accept-Language": "en" } }, { retries: false, timeoutMs: 15000 });
  if (!res.ok) return "";
  const html = await res.text();
  const m = html.match(/<link rel="canonical" href="https:\/\/www\.youtube\.com\/channel\/(UC[A-Za-z0-9_-]{22})"/) || html.match(/"channelId":"(UC[A-Za-z0-9_-]{22})"/);
  return m ? m[1] : "";
}

function readJson(file, fallback) { try { return JSON.parse(fs.readFileSync(file, "utf8")); } catch { return fallback; } }

// Every channel's latest videos, merged. { items, channels: [{ref, id, ok}] }. Never throws.
async function fetchYoutube({ userDir, bundled = path.join(__dirname, "youtube-channels.json"), http = fetchSafe, perChannel = 15 } = {}) {
  const idsFile = path.join(userDir, "youtube-ids.json");
  const known = readJson(idsFile, {});
  const refs = [...(readJson(bundled, { channels: [] }).channels || []), ...(readJson(path.join(userDir, "youtube-channels.json"), { channels: [] }).channels || [])];
  const unique = [...new Set(refs.map((r) => String(r).trim()).filter(Boolean))];
  let dirty = false;
  const channels = await Promise.all(unique.map(async (ref) => {
    try {
      const p = parseChannelRef(ref);
      if (!p) return { ref, ok: false, items: [] };
      let id = p.id || known[p.handle.toLowerCase()];
      if (!id) { id = await resolveHandle(p.handle, http); if (id) { known[p.handle.toLowerCase()] = id; dirty = true; } }
      if (!id) return { ref, ok: false, items: [] };
      const res = await http(`https://www.youtube.com/feeds/videos.xml?channel_id=${id}`, {}, { retries: false, timeoutMs: 15000 });
      if (!res.ok) return { ref, id, ok: false, items: [] };
      return { ref, id, ok: true, items: parseAtom(await res.text()).slice(0, perChannel) };
    } catch { return { ref, ok: false, items: [] }; }
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
