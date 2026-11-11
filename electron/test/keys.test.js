const { test } = require("node:test");
const assert = require("node:assert/strict");
const fs = require("node:fs");
const os = require("node:os");
const path = require("node:path");
const { applySaved, listKeys, saveKey, clearKey } = require("../keys");

const crypt = {
  isEncryptionAvailable: () => true,
  encryptString: (s) => Buffer.from(s).reverse(),
  decryptString: (b) => Buffer.from(b).reverse().toString(),
};
const dir = () => fs.mkdtempSync(path.join(os.tmpdir(), "nnkeys-"));

test("a saved key reaches the environment, is not on disk in the clear, and is never listed", () => {
  const userDir = dir(), env = {};
  const rows = saveKey({ userDir, crypt, name: "NEWSAPI_KEY", value: " abc-secret ", env });
  assert.equal(env.NEWSAPI_KEY, "abc-secret");
  assert.ok(!fs.readFileSync(path.join(userDir, "api-keys.json"), "utf8").includes("abc-secret"));
  assert.equal(rows.find((r) => r.env === "NEWSAPI_KEY").source, "saved");
  assert.ok(!JSON.stringify(rows).includes("abc-secret"));
});

test("a saved key survives a restart and beats the launch value; removing it restores that value", () => {
  const userDir = dir();
  saveKey({ userDir, crypt, name: "WEBZ_API_KEY", value: "mine", env: {} });
  const env = { WEBZ_API_KEY: "launch" };
  applySaved({ userDir, crypt, env });
  assert.equal(env.WEBZ_API_KEY, "mine");
  clearKey({ userDir, name: "WEBZ_API_KEY", env });
  assert.equal(env.WEBZ_API_KEY, "launch");
  assert.equal(listKeys({ userDir, env }).find((r) => r.env === "WEBZ_API_KEY").source, "environment");
});

test("refuses unknown names, bad values, and saving without secure storage", () => {
  const userDir = dir(), env = {};
  assert.throws(() => saveKey({ userDir, crypt, name: "PATH", value: "x", env }), /Unknown/);
  assert.throws(() => saveKey({ userDir, crypt, name: "NEWSAPI_KEY", value: "  ", env }), /look like/);
  assert.throws(() => saveKey({ userDir, crypt, name: "NEWSAPI_KEY", value: "a\nb", env }), /look like/);
  assert.throws(() => saveKey({ userDir, crypt: { isEncryptionAvailable: () => false }, name: "NEWSAPI_KEY", value: "x", env }), /not available/);
  assert.ok(!fs.existsSync(path.join(userDir, "api-keys.json")));
});

test("a damaged store is set aside, not overwritten", () => {
  const userDir = dir(), env = {};
  fs.writeFileSync(path.join(userDir, "api-keys.json"), "{broken");
  saveKey({ userDir, crypt, name: "NEWSAPI_KEY", value: "k", env });
  const names = fs.readdirSync(userDir);
  assert.ok(names.some((n) => n.startsWith("api-keys.json.damaged-")));
  assert.ok(!names.includes("api-keys.json.tmp"));
});

test("a saved key that cannot be decrypted reports unreadable until replaced", () => {
  const userDir = dir(), env = {};
  saveKey({ userDir, crypt, name: "DATA_GOV_API_KEY", value: "k", env });
  applySaved({ userDir, crypt: { ...crypt, decryptString: () => { throw new Error("no"); } }, env: {} });
  assert.equal(listKeys({ userDir, env }).find((r) => r.env === "DATA_GOV_API_KEY").source, "unreadable");
  const rows = saveKey({ userDir, crypt, name: "DATA_GOV_API_KEY", value: "k2", env });
  assert.equal(rows.find((r) => r.env === "DATA_GOV_API_KEY").source, "saved");
});
