const test = require("node:test");
const assert = require("node:assert/strict");
const { fetchSafe } = require("../safe");

// A server that never answers: the request settles only when its signal aborts.
function hangingFetch() {
  return (url, opts = {}) => new Promise((_, reject) => {
    if (opts.signal) opts.signal.addEventListener("abort", () => reject(opts.signal.reason || new Error("aborted")));
  });
}

test("a caller's signal does not switch off the timeout (a hung model must still fail)", async () => {
  const real = globalThis.fetch;
  globalThis.fetch = hangingFetch();
  try {
    const caller = new AbortController();                       // the streaming assistant passes one to cancel with
    const t0 = Date.now();
    await assert.rejects(fetchSafe("https://example.test/api/chat", { method: "POST", signal: caller.signal }, { timeoutMs: 80, retries: false }));
    assert.ok(Date.now() - t0 < 2000, "timed out promptly");
  } finally { globalThis.fetch = real; }
});

test("the caller's signal still cancels before the timeout", async () => {
  const real = globalThis.fetch;
  globalThis.fetch = hangingFetch();
  try {
    const caller = new AbortController();
    const p = fetchSafe("https://example.test/api/chat", { method: "POST", signal: caller.signal }, { timeoutMs: 60000, retries: false });
    setTimeout(() => caller.abort(), 30);
    const t0 = Date.now();
    await assert.rejects(p);
    assert.ok(Date.now() - t0 < 2000, "cancelled promptly");
  } finally { globalThis.fetch = real; }
});
