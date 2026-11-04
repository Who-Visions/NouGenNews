const { test } = require("node:test");
const assert = require("node:assert/strict");
const path = require("node:path");
const { nougenDir, pickPython, readSecret } = require("../../scripts/resolve-key.cjs");

test("nougenDir prefers NOUGEN_DIR, else the sibling NouGen folder", () => {
  assert.equal(nougenDir({ NOUGEN_DIR: "X:/n" }, "C:/o/NouGenNews"), "X:/n");
  assert.equal(path.normalize(nougenDir({}, path.resolve("/o/NouGenNews"))), path.normalize(path.resolve("/o/NouGen")));
});

test("pickPython takes the checkout's venv first, then the system python", () => {
  const has = (set) => (p) => set.some((s) => p.replace(/\\/g, "/").endsWith("/" + s));
  assert.match(pickPython("/n", has([".venv/Scripts/python.exe"]), "win32").replace(/\\/g, "/"), /\.venv\/Scripts\/python\.exe$/);
  assert.match(pickPython("/n", has(["venv/Scripts/python.exe"]), "win32").replace(/\\/g, "/"), /\/venv\/Scripts\/python\.exe$/);
  assert.equal(pickPython("/n", () => false, "win32"), "python");
  assert.match(pickPython("/n", has([".venv/bin/python"]), "linux").replace(/\\/g, "/"), /\.venv\/bin\/python$/);
  assert.equal(pickPython("/n", () => false, "linux"), "python3");
});

test("readSecret runs the keymaker through the resolved python and trims the answer", () => {
  let call = null;
  const run = (cmd, args, opts) => { call = { cmd, args, opts }; return { status: 0, stdout: "abc123\n" }; };
  const v = readSecret("SERPAPI_API_KEY", { env: { NOUGEN_DIR: "/n" }, run, exists: () => true });
  assert.equal(v, "abc123");
  assert.equal(call.args[0], "-I");
  assert.equal(call.args.at(-1), "SERPAPI_API_KEY");
  assert.equal(call.opts.env.PYTHONPATH, "src");
});

test("readSecret fails quietly: bad name, missing checkout, failing python, thrown error", () => {
  const never = () => { throw new Error("should not run"); };
  assert.equal(readSecret("bad name; rm -rf", { env: { NOUGEN_DIR: "/n" }, run: never, exists: () => true }), "");
  assert.equal(readSecret("SERPAPI_API_KEY", { env: { NOUGEN_DIR: "/n" }, run: never, exists: () => false }), "");
  assert.equal(readSecret("SERPAPI_API_KEY", { env: { NOUGEN_DIR: "/n" }, run: () => ({ status: 1, stdout: "" }), exists: () => true }), "");
  assert.equal(readSecret("SERPAPI_API_KEY", { env: { NOUGEN_DIR: "/n" }, run: never, exists: () => true }), "");
});
