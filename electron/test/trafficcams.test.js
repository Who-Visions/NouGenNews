const test = require("node:test");
const assert = require("node:assert/strict");
const { parseStreams, camerasNear, streamUrl } = require("../trafficcams");

const stream = "https://pbctrafficstreams.pbc.gov/hls/public/vf1/WF01-A_high/index.m3u8";
const xml = `<streams><stream guid="WF01-A" state="active" title="10th Ave N &amp; Dixie Hwy" href="${stream}" poster="/vf1/media/image.php?guid=WF01-A" lat="26.62" lng="-80.05"/>
<stream guid="WF01-B" state="maintenance" title="Off" lat="26.6" lng="-80.1"/></streams>`;

test("only active cameras with a place are listed", () => {
  assert.deepEqual(parseStreams(xml), [{ id: "WF01-A", name: "10th Ave N & Dixie Hwy", lat: 26.62, lon: -80.05, stream, poster: "/vf1/media/image.php?guid=WF01-A" }]);
});

test("a camera with no stream is left off, and its own server address is used", async () => {
  const gone = stream.replace("WF01-A", "WF01-C");
  const feed = xml + `<stream guid="WF01-C" state="active" title="Gone" href="${gone}" poster="/vf1/x" lat="26.7" lng="-80.1"/>`;
  const http = async (u) => (String(u).includes("loader.php") ? { ok: true, text: async () => feed } : { status: u === gone ? 404 : 200 });
  const list = await camerasNear(26.7, -80.05, { http });
  assert.deepEqual(list.map((c) => c.id), ["WF01-A"]);
  assert.equal(await streamUrl("WF01-A", { http }), stream);
});

test("places far from the county get no cameras and make no request", async () => {
  assert.deepEqual(await camerasNear(40.7, -74, { http: async () => { throw new Error("called"); } }), []);
});
