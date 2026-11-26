// API keys entered on the Settings page. Stored only as ciphertext from the operating system's keychain (safeStorage);
// values go to process.env in the main process and never back to the renderer, which sees only whether a key is set.
const fs = require("node:fs");
const path = require("node:path");

const KEYS = [
  { env: "THENEWSAPI_TOKEN", label: "TheNewsAPI", group: "News" },
  { env: "NEWSAPI_KEY", label: "NewsAPI", group: "News" },
  { env: "NEWSDATA_API_KEY", label: "NewsData.io", group: "News" },
  { env: "EVENTREGISTRY_API_KEY", label: "Event Registry", group: "News" },
  { env: "WEBZ_API_KEY", label: "Webz.io", group: "News" },
  { env: "SERPAPI_API_KEY", label: "SerpApi (Near you)", group: "News" },
  { env: "OPENWEATHER_API_KEY", label: "OpenWeather", group: "Weather" },
  { env: "WEATHERAPI_KEY", label: "WeatherAPI", group: "Weather" },
  { env: "CESIUM_ION_TOKEN", label: "Cesium ion (3D globe)", group: "Weather" },
  { env: "TMDB_READ_ACCESS_TOKEN", label: "TMDB read token", group: "Data" },
  { env: "DATA_GOV_API_KEY", label: "Data.gov", group: "Data" },
  { env: "MASSIVE_API_KEY", label: "Massive (markets)", group: "Data" },
];
const NAMES = new Set(KEYS.map((k) => k.env));
const MAX_LEN = 4096;

const fileOf = (userDir) => path.join(userDir, "api-keys.json");

function readStore(userDir) {
  let text;
  try { text = fs.readFileSync(fileOf(userDir), "utf8"); } catch { return {}; }
  try {
    const data = JSON.parse(text);
    if (data && typeof data === "object" && !Array.isArray(data)) return data;
  } catch { /* set aside below */ }
  // A damaged file is kept beside the store, so the next save cannot overwrite what might be recovered from it.
  fs.renameSync(fileOf(userDir), `${fileOf(userDir)}.damaged-${Date.now()}`);
  return {};
}

function writeStore(userDir, store) {
  const file = fileOf(userDir);
  const tmp = `${file}.tmp`;
  fs.mkdirSync(userDir, { recursive: true });
  try {
    fs.writeFileSync(tmp, JSON.stringify(store), { mode: 0o600 });
    fs.renameSync(tmp, file);
  } finally { fs.rmSync(tmp, { force: true }); }
}

// What the environment held at launch, so removing a saved key falls back to it.
const launchEnv = new Map();
// Saved keys this computer could not decrypt, shown as such rather than as working.
const unreadable = new Set();

// Saved keys win over the launch environment. One that cannot be decrypted is skipped.
function applySaved({ userDir, crypt, env = process.env }) {
  for (const k of KEYS) if (!launchEnv.has(k.env)) launchEnv.set(k.env, env[k.env] || "");
  if (!crypt.isEncryptionAvailable()) return;
  for (const [name, b64] of Object.entries(readStore(userDir))) {
    if (!NAMES.has(name)) continue;
    try { env[name] = crypt.decryptString(Buffer.from(b64, "base64")); unreadable.delete(name); }
    catch { unreadable.add(name); }
  }
}

function listKeys({ userDir, env = process.env }) {
  const store = readStore(userDir);
  return KEYS.map((k) => ({ ...k, source: unreadable.has(k.env) && store[k.env] ? "unreadable" : store[k.env] ? "saved" : env[k.env] ? "environment" : "none" }));
}

function saveKey({ userDir, crypt, name, value, env = process.env }) {
  const v = String(value ?? "").trim();
  if (!NAMES.has(name)) throw new Error("Unknown key");
  if (!v || v.length > MAX_LEN || /[\r\n]/.test(v)) throw new Error("That does not look like a key");
  if (!crypt.isEncryptionAvailable()) throw new Error("Secure storage is not available on this computer, so the key was not saved");
  writeStore(userDir, { ...readStore(userDir), [name]: crypt.encryptString(v).toString("base64") });
  env[name] = v;
  unreadable.delete(name);
  return listKeys({ userDir, env });
}

function clearKey({ userDir, name, env = process.env }) {
  if (!NAMES.has(name)) throw new Error("Unknown key");
  const { [name]: _gone, ...rest } = readStore(userDir);
  writeStore(userDir, rest);
  unreadable.delete(name);
  const before = launchEnv.get(name);
  if (before) env[name] = before; else delete env[name];
  return listKeys({ userDir, env });
}

module.exports = { KEYS, applySaved, listKeys, saveKey, clearKey };
