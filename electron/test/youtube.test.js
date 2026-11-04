const test = require("node:test");
const assert = require("node:assert/strict");
const fs = require("node:fs");
const os = require("node:os");
const path = require("node:path");
const { parseChannelRef, parseAtom, fetchYoutube, addChannel } = require("../youtube");

const ATOM = `<feed><author><name>The AI Grid</name></author>
<entry><yt:videoId>yNI84SU9x4I</yt:videoId><title>Gemini &amp; more</title><published>2026-10-29T19:00:00.123+00:00</published><media:group><media:description>desc</media:description></media:group></entry>
<entry><yt:videoId>bad</yt:videoId><title>skip</title></entry></feed>`;

test("channel references of every common form parse", () => {
  assert.deepEqual(parseChannelRef("@TheAiGrid"), { handle: "TheAiGrid" });
  assert.deepEqual(parseChannelRef("https://www.youtube.com/@TheAiGrid/videos"), { handle: "TheAiGrid" });
  assert.deepEqual(parseChannelRef("https://www.youtube.com/channel/UCabcdefghijklmnopqrstuv"), { id: "UCabcdefghijklmnopqrstuv" });
  assert.equal(parseChannelRef("nonsense"), null);
});

test("an Atom feed becomes stories with a playable video and the exact publish time", () => {
  const [s, ...rest] = parseAtom(ATOM);
  assert.equal(rest.length, 0);
  assert.equal(s.title, "Gemini & more");
  assert.equal(s.source, "The AI Grid");
  assert.deepEqual(s.videos, [{ kind: "youtube", id: "yNI84SU9x4I" }]);
  assert.equal(s.timestamp, Date.parse("2026-10-29T19:00:00.123Z"));
});

test("handles resolve once, are remembered, and a failing channel does not stop the others", async () => {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), "yt-"));
  const bundled = path.join(dir, "b.json");
  fs.writeFileSync(bundled, JSON.stringify({ channels: ["@Good", "@Bad"] }));
  let pages = 0;
  const http = async (url) => {
    if (url.includes("/@Good")) { pages += 1; return { ok: true, text: async () => '"channelId":"UCgoodgoodgoodgoodgoodgo"' }; }
    if (url.includes("/@Bad")) return { ok: false };
    return { ok: true, text: async () => ATOM };
  };
  const r = await fetchYoutube({ userDir: dir, bundled, http });
  assert.equal(r.items.length, 1);
  assert.deepEqual(r.channels.map((c) => c.ok), [true, false]);
  await fetchYoutube({ userDir: dir, bundled, http });
  assert.equal(pages, 1);
});

test("addChannel keeps a list and rejects non-channels", () => {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), "yt-"));
  assert.deepEqual(addChannel(dir, "@One"), ["@One"]);
  assert.deepEqual(addChannel(dir, "@One"), ["@One"]);
  assert.throws(() => addChannel(dir, "https://example.com"));
});

test("a wrong link falls back to the channel's name, and the answer is remembered", async () => {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), "yt-"));
  const bundled = path.join(dir, "b.json");
  fs.writeFileSync(bundled, JSON.stringify({ channels: [{ name: "Real Channel", ref: "@Wrong" }, { name: "No Link" }] }));
  let searches = 0;
  const http = async (url) => {
    if (url.includes("/@Wrong")) return { ok: false };
    if (url.includes("/results?")) { searches += 1; return { ok: true, text: async () => '"channelId":"UCrealrealrealrealrealre"' }; }
    return { ok: true, text: async () => ATOM };
  };
  const r = await fetchYoutube({ userDir: dir, bundled, http });
  assert.deepEqual(r.channels.map((c) => c.ok), [true, true]);
  await fetchYoutube({ userDir: dir, bundled, http });
  assert.equal(searches, 2);
});
