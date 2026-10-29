// A YouTube video written up as a news article, NouGen as the guest writer. The transcript comes through NouGen's own
// nougentube tiers (recall first: a video the grid already holds is not captured twice), the writing is done by a local
// Ollama model at zero cost, and the video's own source links are fetched for extra pictures and facts. Nothing here is
// about one channel or one story: the sources are whatever links the video's description carries, the style guidance is
// recalled from the shards, and the model is whichever local one is installed.
const fs = require("node:fs");
const path = require("node:path");
const { spawn } = require("node:child_process");
const { fetchSafe } = require("./safe");

const esc = (s) => String(s || "").replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;");
const isHttps = (u) => /^https:\/\//i.test(String(u || ""));
const META = (html, prop) => {
  const m = html.match(new RegExp(`<meta[^>]+(?:property|name)=["']${prop}["'][^>]*content=["']([^"']+)`, "i"))
    || html.match(new RegExp(`<meta[^>]+content=["']([^"']+)["'][^>]*(?:property|name)=["']${prop}["']`, "i"));
  return m ? m[1].replace(/&amp;/g, "&").replace(/&#39;|&apos;/g, "'").replace(/&quot;/g, '"') : "";
};

// Links in the description, in order, without duplicates. A line that ends in a dash or a colon is a label, not a link.
// Lines that sell or recruit (a sponsor, a community, a newsletter, a discount) are the creator's promotion, not the
// story's sources, so their links are left out.
const PROMO_LINE = /sponsor|affiliate|discount|coupon|promo code|subscribe|newsletter|community|join (?:me|us|my)|follow me|patreon|merch|business inquir|checkout today/i;
function linksIn(desc) {
  const seen = new Set();
  const out = [];
  for (const line of String(desc || "").split(/\r?\n/)) {
    if (PROMO_LINE.test(line)) continue;
    for (const m of line.matchAll(/https?:\/\/[^\s<>"')\]]+/g)) {
      const u = m[0].replace(/[.,;:!?]+$/, "");
      if (!seen.has(u)) { seen.add(u); out.push(u); }
    }
  }
  return out;
}

// Whether a fetched page is a story worth citing rather than a profile, store or sign-up page: it says it is an
// article, or it carries a headline, a picture and a body of real text.
function sourceFromPage(html, url) {
  const title = META(html, "og:title") || (html.match(/<title>([^<]*)/i) || [])[1] || "";
  const image = META(html, "og:image");
  const type = META(html, "og:type");
  const text = html.replace(/<script[\s\S]*?<\/script>|<style[\s\S]*?<\/style>|<nav[\s\S]*?<\/nav>|<footer[\s\S]*?<\/footer>/gi, " ").replace(/<[^>]+>/g, " ").replace(/\s+/g, " ").trim();
  const paragraphs = [...html.matchAll(/<p\b[^>]*>([\s\S]*?)<\/p>/gi)].map((m) => m[1].replace(/<[^>]+>/g, " ").replace(/\s+/g, " ").trim()).filter((p) => p.length > 80);
  const wordy = paragraphs.join(" ").length;
  if (!title || !(/article|news/i.test(type) || (image && wordy > 600))) return null;
  return { url, title: title.trim().slice(0, 200), site: META(html, "og:site_name") || new URL(url).hostname.replace(/^www\./, ""), image: isHttps(image) ? image : "", excerpt: (paragraphs.join(" ") || text).slice(0, 1800) };
}

async function fetchSources(desc, http = fetchSafe, max = 6) {
  const links = linksIn(desc).filter(isHttps).slice(0, 14);
  const got = await Promise.all(links.map(async (u) => {
    try {
      const res = await http(u, { headers: { Accept: "text/html", "User-Agent": "Mozilla/5.0 NouGenNews" } }, { retries: false, timeoutMs: 10000 });
      if (!res.ok) return null;
      return sourceFromPage((await res.text()).slice(0, 600000), res.url || u);
    } catch { return null; }
  }));
  const seen = new Set();
  return got.filter((s) => s && !seen.has(s.url) && seen.add(s.url)).slice(0, max);
}

// nougentube through the NouGen checkout's Python (recall-first, tiered transcript, style shards). Never throws.
function runBridge({ nougenDir, id, capture = false, spawnFn = spawn, exists = fs.existsSync, bridge = path.join(__dirname, "..", "scripts", "tube_bridge.py") }) {
  return new Promise((resolve) => {
    const py = [".venv/Scripts/python.exe", "venv/Scripts/python.exe", ".venv/bin/python"].map((p) => path.join(nougenDir, p)).find(exists);
    if (!py || !exists(bridge)) return resolve(null);
    let out = "";
    const child = spawnFn(py, ["-I", bridge, nougenDir, id, ...(capture ? ["--capture"] : [])], { windowsHide: true, env: { ...process.env, PYTHONIOENCODING: "utf-8" } });
    const timer = setTimeout(() => { try { child.kill(); } catch { /* already gone */ } }, capture ? 240000 : 90000);
    child.stdout.on("data", (d) => { out += d; });
    child.on("error", () => { clearTimeout(timer); resolve(null); });
    child.on("close", () => { clearTimeout(timer); try { resolve(JSON.parse(out)); } catch { resolve(null); } });
  });
}

const stripStamps = (t) => String(t || "").replace(/\[\d{2}:\d{2}\]\s*/g, "").replace(/\s+/g, " ").trim();

function buildPrompt({ title, channel, transcript, sources, style }) {
  const src = sources.map((s, i) => `[S${i + 1}] ${s.site}: ${s.title}\n${s.excerpt}`).join("\n\n");
  return [
    "You are a news writer. Turn the video transcript below into a straight news article for a news app.",
    `The video is titled "${title}" from the channel "${channel}".`,
    "Rules: use only facts that appear in the transcript or the numbered sources. Never invent numbers, quotes or names.",
    "Lead with the single most newsworthy fact (inverted pyramid), then the details, then context.",
    `Attribute the creator's opinions and predictions to ${channel || "the video"} ("according to", "says"); report confirmed facts plainly.`,
    "Leave out sponsor reads, subscribe pleas, giveaways and filler. Third person, past tense, no first person, no hype words.",
    "Write 6 to 9 short paragraphs. The headline is plain and factual, under 110 characters.",
    style ? `House style notes recalled from the newsroom's memory:\n${style.slice(0, 1800)}` : "",
    src ? `SOURCES\n${src}` : "",
    `TRANSCRIPT\n${stripStamps(transcript).slice(0, 26000)}`,
  ].filter(Boolean).join("\n\n");
}

const SCHEMA = { type: "object", properties: { headline: { type: "string" }, dek: { type: "string" }, paragraphs: { type: "array", items: { type: "string" } } }, required: ["headline", "paragraphs"] };

// The first installed local model that is not a cloud route; the resident small model is preferred when present.
async function pickModel(http, base) {
  try {
    const res = await http(`${base}/api/tags`, {}, { retries: false, timeoutMs: 5000 });
    const names = ((await res.json()).models || []).map((m) => m.name);
    const prefer = ["gemma4:e2b-qat", "Yukiai:e2b", "hauhau-gemma4-e2b:iq3_m"];
    return prefer.find((n) => names.includes(n)) || names.find((n) => !/cloud|31b/i.test(n)) || "";
  } catch { return ""; }
}

async function writeArticle(prompt, { http = fetchSafe, base = "http://localhost:11434" } = {}) {
  const model = await pickModel(http, base);
  if (!model) return null;
  const res = await http(`${base}/api/chat`, {
    method: "POST", headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ model, stream: false, format: SCHEMA, think: false, messages: [{ role: "user", content: prompt }], options: { num_ctx: 16384, num_predict: 2600, temperature: 0.3 } }),
  }, { retries: false, timeoutMs: 300000 });
  if (!res.ok) return null;
  const data = await res.json();
  try {
    const j = JSON.parse((data.message && data.message.content) || "{}");
    const paragraphs = (j.paragraphs || []).map((p) => String(p).trim()).filter((p) => p.length > 20);
    return paragraphs.length >= 3 ? { model, headline: String(j.headline || "").trim(), dek: String(j.dek || "").trim(), paragraphs } : null;
  } catch { return null; }
}

// Paragraphs, with each source's picture after the paragraphs that come near it, then the list of sources.
function toHtml({ article, sources, channel, id }) {
  const out = [`<p><em>Written by NouGen from a video by ${esc(channel || "the channel")}. <a href="https://www.youtube.com/watch?v=${esc(id)}">Watch the original</a>.</em></p>`];
  const pics = sources.filter((s) => s.image);
  const every = Math.max(2, Math.floor(article.paragraphs.length / (pics.length + 1)));
  article.paragraphs.forEach((p, i) => {
    out.push(`<p>${esc(p)}</p>`);
    const pic = pics[Math.floor((i + 1) / every) - 1];
    if (pic && (i + 1) % every === 0 && !pic.used) { pic.used = true; out.push(`<figure><img src="${esc(pic.image)}" alt="${esc(pic.title)}"><figcaption>${esc(pic.site)}: ${esc(pic.title)}</figcaption></figure>`); }
  });
  if (sources.length) out.push(`<h3>Sources</h3><ul>${sources.map((s) => `<li><a href="${esc(s.url)}">${esc(s.site)}: ${esc(s.title)}</a></li>`).join("")}</ul>`);
  return out.join("");
}

// { headline, dek, html, model, sources } or { error }. Cached per video; never throws.
async function tubeArticle({ id, title = "", desc = "", channel = "", userDir, nougenDir, http = fetchSafe, bridge = runBridge, write = writeArticle }) {
  if (!/^[A-Za-z0-9_-]{11}$/.test(String(id || ""))) return { error: "bad video id" };
  const file = path.join(userDir, "tube", `${id}.json`);
  try { const hit = JSON.parse(fs.readFileSync(file, "utf8")); if (hit && hit.html) return hit; } catch { /* not written yet */ }
  try {
    const [b, sources] = await Promise.all([bridge({ nougenDir, id }), fetchSources(desc, http)]);
    if (!b || !b.transcript) return { error: "no transcript available for this video" };
    const ch = channel || (b.meta && b.meta.channel) || "";
    const article = await write(buildPrompt({ title: title || (b.meta && b.meta.title) || "", channel: ch, transcript: b.transcript, sources, style: b.style }), { http });
    if (!article) return { error: "the local writer is not available" };
    const result = { headline: article.headline, dek: article.dek, html: toHtml({ article, sources: sources.map((s) => ({ ...s })), channel: ch, id }), model: article.model, sources: sources.map((s) => ({ url: s.url, site: s.site, title: s.title, image: s.image })), at: Date.now() };
    try { fs.mkdirSync(path.dirname(file), { recursive: true }); fs.writeFileSync(file, JSON.stringify(result)); } catch { /* an unwritable cache only costs a rewrite */ }
    // The verbatim, era-stamped capture the rest of the fleet recalls; skipped when the grid already holds it.
    if (!b.known) bridge({ nougenDir, id, capture: true });
    return result;
  } catch (e) {
    return { error: String((e && e.message) || e).slice(0, 200) };
  }
}

module.exports = { tubeArticle, linksIn, sourceFromPage, fetchSources, buildPrompt, toHtml, runBridge, pickModel };
