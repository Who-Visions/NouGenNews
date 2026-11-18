const test = require("node:test");
const assert = require("node:assert/strict");

// package.json links nougen-shards-lite as file:../NouGenShardsLite. A checkout without that sibling still opens the
// window, then every archive command fails with MODULE_NOT_FOUND. This turns that into a loud failure at test time.
test("the nougen-shards-lite sibling is installed and resolves", () => {
  try {
    assert.ok(require.resolve("nougen-shards-lite"));
  } catch (e) {
    assert.fail(
      `nougen-shards-lite does not resolve (${e.code}). Clone Who-Visions/NouGenShardsLite next to this repo and run npm install; ` +
        "the nougennews launcher does both.",
    );
  }
});

test("it exposes the API the archive depends on", () => {
  const light = require("nougen-shards-lite");
  for (const fn of ["open", "upgradeInfo", "detectFull"]) assert.equal(typeof light[fn], "function", `light.${fn}`);
});
