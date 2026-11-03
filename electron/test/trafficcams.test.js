const test = require("node:test");
const assert = require("node:assert/strict");
const { parseStreams, camerasNear } = require("../trafficcams");

const xml = `<streams><stream guid="WF01-A" state="active" title="10th Ave N &amp; Dixie Hwy" lat="26.62" lng="-80.05"/>
<stream guid="WF01-B" state="maintenance" title="Off" lat="26.6" lng="-80.1"/></streams>`;

test("only active cameras with a place are listed", () => {
  assert.deepEqual(parseStreams(xml), [{ id: "WF01-A", name: "10th Ave N & Dixie Hwy", lat: 26.62, lon: -80.05 }]);
});

test("places far from the county get no cameras and make no request", async () => {
  assert.deepEqual(await camerasNear(40.7, -74, { http: async () => { throw new Error("called"); } }), []);
});
