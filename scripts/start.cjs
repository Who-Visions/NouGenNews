// npm start: launches Electron with the optional keys the app can use (SerpApi for Near you) already in its
// environment. A key that is already set in the environment wins; one that cannot be found is simply absent.
const { spawn } = require("node:child_process");
const path = require("node:path");
const { readSecrets } = require("./resolve-key.cjs");

const OPTIONAL = ["OPENWEATHER_API_KEY", "SERPAPI_API_KEY", "THENEWSAPI_TOKEN", "TMDB_READ_ACCESS_TOKEN", "DATA_GOV_API_KEY", "WEBZ_API_KEY", "NEWSAPI_KEY", "NEWSDATA_API_KEY", "EVENTREGISTRY_API_KEY", "MASSIVE_API_KEY", "WEATHERAPI_KEY", "CESIUM_ION_TOKEN_20261030", "CESIUM_ION_TOKEN"];
const env = { ...process.env };
// One Python start for every missing key (each start costs seconds).
const missing = OPTIONAL.filter((name) => !env[name]);
const found = readSecrets(missing);
for (const name of missing) if (found[name]) env[name] = found[name];

// A built page with its script or stylesheet missing opens as a black window with no error (two builds writing into
// dist at once, or one cut short). Rebuild once before opening rather than show that.
const { missingFiles } = require("./dist-check.cjs");
const dist = path.resolve(__dirname, "..", "dist");
if (missingFiles(dist).length) {
  console.log("dist is incomplete (" + missingFiles(dist).join(", ") + "); rebuilding before launch...");
  require("node:child_process").spawnSync(process.execPath, [path.resolve(__dirname, "..", "node_modules", "vite", "bin", "vite.js"), "build"], { cwd: path.resolve(__dirname, ".."), stdio: "inherit" });
  const still = missingFiles(dist);
  if (still.length) console.error("dist is still incomplete after a rebuild (" + still.join(", ") + "): the window will be blank. Is another build running in this folder?");
}

// Anything after `npm start --` goes to Electron (for example --remote-debugging-port=9333 --user-data-dir=...).
const electron = require("electron");
const child = spawn(electron, [path.resolve(__dirname, ".."), ...process.argv.slice(2)], { stdio: "inherit", env, windowsHide: false });
child.on("exit", (code) => process.exit(code ?? 0));
