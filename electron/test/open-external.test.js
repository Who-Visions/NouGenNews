const test = require("node:test");
const assert = require("node:assert/strict");
const { openExternalSafe } = require("../open-external");

const shell = (fail) => ({ opened: [], openExternal(u) { this.opened.push(u); return fail ? Promise.reject(new Error("no browser")) : Promise.resolve(); } });

test("a successful launch answers true", async () => {
  const s = shell(false);
  assert.equal(await openExternalSafe("https://open-meteo.com/", s), true);
  assert.deepEqual(s.opened, ["https://open-meteo.com/"]);
});

test("a failed launch answers false instead of an unhandled rejection", async () => {
  const s = shell(true);
  assert.equal(await openExternalSafe("https://open-meteo.com/", s), false);
});

test("only https, never a page-shaped or oversized address", async () => {
  const s = shell(false);
  for (const u of ["http://x.com", "file:///C:/Windows/System32/calc.exe", "javascript:alert(1)", "ms-settings:", "https://a b.com", "", null,
                   "https://x.com/" + "a".repeat(2100)])
    assert.equal(await openExternalSafe(u, s), false, String(u).slice(0, 40));
  assert.deepEqual(s.opened, []);
});

test("the weather credit command still only opens its fixed sites", async () => {
  const { handlers } = require("../handlers");
  assert.equal(await handlers.weather_open_credit({ which: "https://evil.example/" }), false);
});
