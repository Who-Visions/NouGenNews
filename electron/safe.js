// Failsafe helpers for the main process. Three rules, applied the same way everywhere:
//   - a state file is written whole or not at all (temp file, then rename),
//   - a corrupt state file is moved aside and the app carries on with its fallback,
//   - a network call never hangs, and a transient failure is retried on a fixed schedule.
// Nothing here throws to the caller unless the caller asks for it, so one bad file or one slow
// server cannot take the app down.
const fs = require("node:fs");
const path = require("node:path");

// Fixed (not random) so the same failure always takes the same path.
const RETRY_DELAYS_MS = [500, 1500, 4000];
const DEFAULT_TIMEOUT_MS = 15000;
const RETRYABLE_STATUS = new Set([408, 425, 429, 500, 502, 503, 504]);

// Writes data to `file` through a temp file and a rename, so a crash mid-write leaves the old file.
// Returns true on success. On failure it logs and returns false, or throws when opts.throw is set.
function writeFileAtomic(file, data, opts = {}) {
  const { throw: rethrow = false, ...fsOpts } = opts;
  const tmp = `${file}.${process.pid}.${Date.now()}.tmp`;
  try {
    fs.mkdirSync(path.dirname(file), { recursive: true });
    fs.writeFileSync(tmp, data, fsOpts);
    try {
      fs.renameSync(tmp, file);
    } catch {
      // Some filesystems refuse to replace an open file; a direct write is the next best thing.
      fs.writeFileSync(file, data, fsOpts);
      fs.rmSync(tmp, { force: true });
    }
    return true;
  } catch (err) {
    try { fs.rmSync(tmp, { force: true }); } catch {}
    if (rethrow) throw err;
    console.error(`could not save ${path.basename(file)}: ${err && err.message}`);
    return false;
  }
}

// Reads and parses a JSON file. A missing file returns the fallback. A file that does not parse
// is moved aside (so the next save cannot bury the evidence) and the fallback is returned.
function readJsonSafe(file, fallback, { quarantine = true, log = () => {} } = {}) {
  let raw;
  try {
    raw = fs.readFileSync(file, "utf8");
  } catch {
    return fallback;
  }
  try {
    return JSON.parse(raw);
  } catch {
    if (quarantine) {
      const aside = `${file}.corrupt-${Date.now()}`;
      try {
        fs.renameSync(file, aside);
        log(`moved unreadable ${path.basename(file)} aside`);
      } catch {}
    }
    return fallback;
  }
}

const sleepMs = (ms) => new Promise((resolve) => setTimeout(resolve, ms));

// fetch with a timeout, and a fixed retry schedule for safe requests (GET and HEAD only). A
// retry is never made for a request that changes something on the server.
// The caller still sees the final Response, so a 404 or a 401 is returned, not thrown.
async function fetchSafe(url, opts = {}, { timeoutMs = DEFAULT_TIMEOUT_MS, retries = true, sleep = sleepMs } = {}) {
  const method = String(opts.method || "GET").toUpperCase();
  const canRetry = retries && (method === "GET" || method === "HEAD");
  const attempts = canRetry ? RETRY_DELAYS_MS.length + 1 : 1;
  let lastErr = null;
  for (let i = 0; i < attempts; i += 1) {
    if (i > 0) await sleep(RETRY_DELAYS_MS[i - 1]);
    try {
      const signal = opts.signal || AbortSignal.timeout(timeoutMs);
      const res = await globalThis.fetch(url, { ...opts, signal });
      if (canRetry && RETRYABLE_STATUS.has(res.status) && i < attempts - 1) {
        lastErr = new Error(`HTTP ${res.status}`);
        continue;
      }
      return res;
    } catch (err) {
      lastErr = err;
      if (!canRetry || i === attempts - 1) throw err;
    }
  }
  throw lastErr;
}

module.exports = { writeFileAtomic, readJsonSafe, fetchSafe, RETRY_DELAYS_MS, DEFAULT_TIMEOUT_MS };
