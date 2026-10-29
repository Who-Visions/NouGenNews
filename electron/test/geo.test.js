const { test } = require("node:test");
const assert = require("node:assert/strict");
const { locateMe, parsePosition, parsePlace, POSITION } = require("../geo");

test("parsePosition reads the PowerShell answer and refuses nonsense", () => {
  assert.deepEqual(parsePosition("lat=26.746 lon=-80.094 acc=81"), { lat: 26.746, lon: -80.094, accuracy: 81 });
  assert.deepEqual(parsePosition("lat=1 lon=2 acc=NaN"), { lat: 1, lon: 2, accuracy: null });
  assert.equal(parsePosition("unknown"), null);
  assert.equal(parsePosition("lat=999 lon=0 acc=1"), null);
  assert.equal(parsePosition(""), null);
});

test("parsePlace prefers the locality over the metro-area city", () => {
  assert.deepEqual(parsePlace({ city: "Miami", locality: "West Palm Beach", principalSubdivision: "Florida" }), { city: "West Palm Beach", metro: "Miami", region: "Florida" });
  assert.deepEqual(parsePlace({ city: "Tampa", principalSubdivision: "Florida" }), { city: "Tampa", metro: "", region: "Florida" });
  assert.deepEqual(parsePlace({ city: "Tampa", locality: "Tampa", principalSubdivision: "Florida" }), { city: "Tampa", metro: "", region: "Florida" });
  assert.equal(parsePlace({}), null);
});

test("the PowerShell is one fixed script with no placeholders", () => {
  assert.match(POSITION, /GeoCoordinateWatcher/);
  assert.doesNotMatch(POSITION, /\$\{|%s|undefined/);
});

test("off Windows nothing is run and the person is told to type a city", async () => {
  let ran = false;
  const r = await locateMe({ platform: "linux", run: () => { ran = true; } });
  assert.equal(r.ok, false);
  assert.equal(ran, false);
  assert.match(r.reason, /Type your city/);
});

test("on Windows: position, then place name, together", async () => {
  const run = (cmd, args, opts, cb) => cb(null, "lat=26.746 lon=-80.094 acc=81\r\n");
  let url = "";
  const http = async (u) => { url = u; return { ok: true, json: async () => ({ city: "Miami", locality: "West Palm Beach", principalSubdivision: "Florida" }) }; };
  const r = await locateMe({ platform: "win32", run, http });
  assert.deepEqual(r, { ok: true, city: "West Palm Beach", metro: "Miami", region: "Florida", lat: 26.746, lon: -80.094, accuracy: 81 });
  assert.match(url, /latitude=26\.746&longitude=-80\.094/);
});

test("each failure gives a plain reason, never a throw", async () => {
  const noPos = await locateMe({ platform: "win32", run: (c, a, o, cb) => cb(null, "unknown") });
  assert.equal(noPos.ok, false);
  assert.match(noPos.reason, /Location in Windows Settings/);
  const run = (c, a, o, cb) => cb(null, "lat=1 lon=2 acc=3");
  const noName = await locateMe({ platform: "win32", run, http: async () => ({ ok: true, json: async () => ({}) }) });
  assert.match(noName.reason, /not a place name/);
  const offline = await locateMe({ platform: "win32", run, http: async () => { throw new Error("offline"); } });
  assert.match(offline.reason, /could not look up/);
});
