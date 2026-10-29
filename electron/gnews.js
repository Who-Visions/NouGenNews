// Google News feed links are redirect pages ("news.google.com/rss/articles/CBMi..."): opened as they are they
// stop at a "verifying" screen. The article's real address is on the article page itself as a signed request
// that Google's own page makes, so the same two requests are made here: read the signature and timestamp
// from the article page, then ask the batch endpoint for the address. Public pages, no key, no login.
// Results are kept for the session.
const { fetchSafe } = require("./safe");

const ID = /^https:\/\/news\.google\.com\/(?:rss\/)?articles\/([A-Za-z0-9_-]+)/;
const UA = "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120 Safari/537.36";
const cache = new Map();

const articleId = (url) => { const m = ID.exec(String(url || "")); return m ? m[1] : null; };

// { sg, ts } from the article page, or null.
function parseSignature(html) {
  const sg = /data-n-a-sg="([^"]+)"/.exec(html);
  const ts = /data-n-a-ts="([^"]+)"/.exec(html);
  return sg && ts ? { sg: sg[1], ts: ts[1] } : null;
}

// The publisher address in the batch endpoint's answer, or null. Only http(s) addresses on another host count.
function parseResolved(out) {
  const k = String(out || "").indexOf("garturlres");
  if (k < 0) return null;
  const tail = out.slice(k, k + 600).split("\\").join("");
  const m = /(https?:[^"]+)/.exec(tail);
  if (!m) return null;
  try {
    const u = new URL(m[1]);
    return /^https?:$/.test(u.protocol) && u.hostname !== "news.google.com" ? u.toString() : null;
  } catch { return null; }
}

function batchBody(id, { sg, ts }) {
  const inner = `["garturlreq",[["X","X",["X","X"],null,null,1,1,"US:en",null,1,null,null,null,null,null,0,1],"X","X",1,[1,1,1],1,1,null,0,0,null,0],"${id}",${ts},"${sg}"]`;
  return new URLSearchParams({ "f.req": JSON.stringify([[["Fbv4je", inner, null, "generic"]]]) }).toString();
}

// The real address for a Google News link; any other link comes back unchanged. Never throws: when it cannot
// be resolved the original link is returned so the caller can still open something.
async function resolveStoryUrl(url, http = fetchSafe) {
  const id = articleId(url);
  if (!id) return String(url || "");
  if (cache.has(id)) return cache.get(id);
  try {
    const page = await http(`https://news.google.com/articles/${id}?hl=en-US&gl=US&ceid=US:en`, { headers: { "User-Agent": UA } });
    if (!page.ok) return String(url);
    const sig = parseSignature(await page.text());
    if (!sig) return String(url);
    const res = await http("https://news.google.com/_/DotsSplashUi/data/batchexecute", {
      method: "POST",
      headers: { "User-Agent": UA, "Content-Type": "application/x-www-form-urlencoded;charset=UTF-8" },
      body: batchBody(id, sig),
    });
    if (!res.ok) return String(url);
    const real = parseResolved(await res.text());
    if (real) cache.set(id, real);
    return real || String(url);
  } catch {
    return String(url);
  }
}

module.exports = { resolveStoryUrl, articleId, parseSignature, parseResolved, batchBody };
