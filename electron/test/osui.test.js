const test = require("node:test");
const assert = require("node:assert/strict");
const { accentHex, readableOnDark, notifyImageUrl, notificationIcon, isPrivateHost, luminance } = require("../osui");

test("Windows accent RRGGBBAA becomes #rrggbb; junk is refused", () => {
  assert.equal(accentHex("0078D7FF"), "#0078d7");
  assert.equal(accentHex("#e8b04b"), "#e8b04b");
  assert.equal(accentHex(""), null);
  assert.equal(accentHex("blue"), null);
});

test("a dark accent is lightened until it reads on the black UI; a light one is left alone", () => {
  const dark = readableOnDark("#002050");
  assert.ok(luminance(dark) >= 0.25, dark);
  assert.equal(readableOnDark("#e8b04b"), "#e8b04b");
  assert.equal(readableOnDark("nope"), null);
});

test("notification images: public https only", () => {
  assert.equal(notifyImageUrl("https://cdn.example/a.jpg"), "https://cdn.example/a.jpg");
  for (const bad of ["http://cdn.example/a.jpg", "file:///C:/x.png", "", "https://localhost/a.png", "https://127.0.0.1/a.png",
    "https://10.0.0.5/a.png", "https://192.168.1.1/a.png", "https://172.20.0.1/a.png", "https://169.254.169.254/latest", "https://[::1]/a.png",
    "https://router.local/a.png", "https://[fd00::1]/a.png", "https://[::ffff:127.0.0.1]/a"]) {
    assert.equal(notifyImageUrl(bad), null, bad);
  }
  assert.equal(isPrivateHost("172.32.0.1"), false);
  assert.equal(isPrivateHost("8.8.8.8"), false);
});

function fakeNativeImage(width) {
  const calls = [];
  const img = (w) => ({ isEmpty: () => w === 0, getSize: () => ({ width: w, height: w }), resize: (o) => { calls.push(o); return img(o.width); } });
  return { calls, createFromBuffer: () => img(width) };
}
const headers = (h) => ({ get: (k) => h[k.toLowerCase()] ?? null });
const res = (type, bytes = 10, status = 200, extra = {}) => ({ ok: status >= 200 && status < 300, status, headers: headers({ "content-type": type, ...extra }), arrayBuffer: async () => new Uint8Array(bytes).buffer });
const publicDns = async () => [{ address: "93.184.216.34", family: 4 }];

test("the story picture becomes a 256 px notification icon, fetched without retries or redirects", async () => {
  const ni = fakeNativeImage(1200);
  let opts = null, policy = null;
  const icon = await notificationIcon("https://cdn.example/a.jpg", { lookup: publicDns, nativeImage: ni, http: async (_u, o, p) => { opts = o; policy = p; return res("image/jpeg"); } });
  assert.equal(icon.getSize().width, 256);
  assert.deepEqual(ni.calls, [{ width: 256, quality: "good" }]);
  assert.equal(opts.redirect, "manual");
  assert.equal(policy.retries, false);
});

test("no picture rather than a broken one: wrong type, too big, failed fetch, undecodable, or not https", async () => {
  const ni = fakeNativeImage(800);
  const base = { lookup: publicDns, nativeImage: ni };
  assert.equal(await notificationIcon("https://x.example/a", { ...base, http: async () => res("text/html") }), undefined);
  assert.equal(await notificationIcon("https://x.example/a", { ...base, http: async () => res("image/png", 4 * 1024 * 1024) }), undefined);
  assert.equal(await notificationIcon("https://x.example/a", { ...base, http: async () => { throw new Error("timeout"); } }), undefined);
  assert.equal(await notificationIcon("https://x.example/a", { ...base, http: async () => res("image/png", 10, 500) }), undefined);
  assert.equal(await notificationIcon("https://x.example/a", { ...base, nativeImage: fakeNativeImage(0), http: async () => res("image/png") }), undefined);
  assert.equal(await notificationIcon("http://x.example/a", { ...base, http: async () => res("image/png") }), undefined);
});

test("a public name that resolves to a private address, or a redirect into the network, is refused", async () => {
  const ni = fakeNativeImage(300);
  let fetched = 0;
  const http = async () => { fetched += 1; return res("image/png"); };
  assert.equal(await notificationIcon("https://rebind.example/a.png", { nativeImage: ni, http, lookup: async () => [{ address: "192.168.1.10" }] }), undefined);
  assert.equal(fetched, 0);
  const hops = [];
  const redirecting = async (u) => { hops.push(u); return res("", 0, 302, { location: "https://169.254.169.254/latest/meta-data" }); };
  assert.equal(await notificationIcon("https://cdn.example/a.png", { nativeImage: ni, http: redirecting, lookup: publicDns }), undefined);
  assert.deepEqual(hops, ["https://cdn.example/a.png"]);
  // A redirect to another public host is followed.
  const ok = async (u) => (u.includes("cdn2") ? res("image/png") : res("", 0, 301, { location: "https://cdn2.example/b.png" }));
  assert.ok(await notificationIcon("https://cdn.example/a.png", { nativeImage: ni, http: ok, lookup: publicDns }));
});

test("a huge body is cut off as it streams, never buffered whole", async () => {
  let pulled = 0;
  const body = new ReadableStream({ pull(c) { pulled += 1; c.enqueue(new Uint8Array(512 * 1024)); } });   // endless
  const r = { ok: true, status: 200, headers: headers({ "content-type": "image/png" }), body };
  assert.equal(await notificationIcon("https://cdn.example/a.png", { nativeImage: fakeNativeImage(300), lookup: publicDns, http: async () => r, maxBytes: 3 * 1024 * 1024 }), undefined);
  assert.ok(pulled <= 8, `read ${pulled} chunks`);
});

test("a stalled image server never holds the alert past the budget", async () => {
  const t0 = Date.now();
  const icon = await notificationIcon("https://slow.example/a.png", { nativeImage: fakeNativeImage(300), lookup: publicDns, http: () => new Promise(() => {}), budgetMs: 150 });
  assert.equal(icon, undefined);
  assert.ok(Date.now() - t0 < 1000);
});
