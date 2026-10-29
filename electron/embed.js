// Port of src-tauri/src/embed.rs: a loopback page that carries the YouTube player.
// YouTube refuses embeds from a file page (error 153) and from 127.0.0.1 ("video unavailable"),
// but plays from http://localhost. So one fixed page is served there, and the only input,
// an 11-character video ID, is checked before it goes into the page.
const http = require("node:http");

const HEADERS = {
  "Content-Type": "text/html; charset=utf-8",
  "Cache-Control": "no-store",
  "X-Content-Type-Options": "nosniff",
  "Content-Security-Policy": "default-src 'none'; style-src 'unsafe-inline'; frame-src https://www.youtube.com https://www.youtube-nocookie.com",
  Connection: "close",
};

const validId = (id) => typeof id === "string" && /^[A-Za-z0-9_-]{11}$/.test(id);

// The video ID for GET /embed?id=..., or null for anything else.
function route(method, url) {
  if (method !== "GET") return null;
  const [path, query = ""] = String(url).split("?", 2);
  if (path !== "/embed") return null;
  const pair = query.split("&").find((p) => p.startsWith("id="));
  const id = pair ? pair.slice(3) : null;
  return validId(id) ? id : null;
}

function page(id) {
  return `<!doctype html><html lang="en"><head><meta charset="utf-8"><title>YouTube</title>` +
    `<style>html,body{margin:0;height:100%;background:#000;overflow:hidden}` +
    `iframe{position:absolute;inset:0;width:100%;height:100%;border:0}</style></head>` +
    `<body><iframe src="https://www.youtube.com/embed/${id}?autoplay=1&amp;playsinline=1&amp;enablejsapi=1&amp;origin=http://localhost&amp;widget_referrer=http://localhost&amp;color=white" ` +
    `title="YouTube video player" ` +
    `allow="accelerometer; autoplay; clipboard-write; encrypted-media; gyroscope; picture-in-picture" ` +
    `allowfullscreen referrerpolicy="strict-origin-when-cross-origin"></iframe></body></html>`;
}

function handler(req, res) {
  const id = route(req.method, req.url);
  const body = id ? page(id) : "Not found";
  res.writeHead(id ? 200 : 404, { ...HEADERS, "Content-Length": Buffer.byteLength(body) });
  res.end(body);
}

let starting = null;

// Starts once on 127.0.0.1 (and ::1 on the same port, since localhost may resolve there first)
// and returns the port. Later calls return the same port.
function start() {
  if (starting) return starting;
  starting = new Promise((resolve, reject) => {
    const v4 = http.createServer(handler);
    v4.once("error", (e) => { starting = null; reject(e); });
    v4.listen(0, "127.0.0.1", () => {
      const { port } = v4.address();
      const v6 = http.createServer(handler);
      v6.once("error", () => {}); // no IPv6 here: v4 alone is fine
      v6.listen(port, "::1");
      v4.unref();
      v6.unref();
      resolve(port);
    });
  });
  return starting;
}

module.exports = { start, route, page, validId };
