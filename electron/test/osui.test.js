const test = require("node:test");
const assert = require("node:assert/strict");
const { accentHex, readableOnDark, notifyImageUrl, notificationIcon, luminance } = require("../osui");

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

test("notification images: https only", () => {
  assert.equal(notifyImageUrl("https://cdn.example/a.jpg"), "https://cdn.example/a.jpg");
  assert.equal(notifyImageUrl("http://cdn.example/a.jpg"), null);
  assert.equal(notifyImageUrl("file:///C:/x.png"), null);
  assert.equal(notifyImageUrl(""), null);
});

function fakeNativeImage(width) {
  const calls = [];
  const img = (w) => ({ isEmpty: () => w === 0, getSize: () => ({ width: w, height: w }), resize: (o) => { calls.push(o); return img(o.width); } });
  return { calls, createFromBuffer: () => img(width) };
}
const res = (type, bytes = 10, ok = true) => ({ ok, headers: { get: () => type }, arrayBuffer: async () => new Uint8Array(bytes).buffer });

test("the story picture becomes a 256 px notification icon", async () => {
  const ni = fakeNativeImage(1200);
  const icon = await notificationIcon("https://cdn.example/a.jpg", { http: async () => res("image/jpeg"), nativeImage: ni });
  assert.equal(icon.getSize().width, 256);
  assert.deepEqual(ni.calls, [{ width: 256, quality: "good" }]);
});

test("no picture rather than a broken one: wrong type, too big, failed fetch, undecodable, or not https", async () => {
  const ni = fakeNativeImage(800);
  assert.equal(await notificationIcon("https://x/a", { http: async () => res("text/html"), nativeImage: ni }), undefined);
  assert.equal(await notificationIcon("https://x/a", { http: async () => res("image/png", 4 * 1024 * 1024), nativeImage: ni }), undefined);
  assert.equal(await notificationIcon("https://x/a", { http: async () => { throw new Error("timeout"); }, nativeImage: ni }), undefined);
  assert.equal(await notificationIcon("https://x/a", { http: async () => res("image/png", 10, false), nativeImage: ni }), undefined);
  assert.equal(await notificationIcon("https://x/a", { http: async () => res("image/png"), nativeImage: fakeNativeImage(0) }), undefined);
  assert.equal(await notificationIcon("http://x/a", { http: async () => res("image/png"), nativeImage: ni }), undefined);
});
