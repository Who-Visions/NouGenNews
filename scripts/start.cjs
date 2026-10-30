// npm start: launches Electron with the optional keys the app can use (SerpApi for Near you) already in its
// environment. A key that is already set in the environment wins; one that cannot be found is simply absent.
const { spawn } = require("node:child_process");
const path = require("node:path");
const { readSecrets } = require("./resolve-key.cjs");

const OPTIONAL = ["SERPAPI_API_KEY", "THENEWSAPI_TOKEN", "TMDB_READ_ACCESS_TOKEN", "DATA_GOV_API_KEY", "WEBZ_API_KEY", "NEWSAPI_KEY", "NEWSDATA_API_KEY", "EVENTREGISTRY_API_KEY", "MASSIVE_API_KEY"];
const env = { ...process.env };
// One Python start for every missing key (each start costs seconds).
const missing = OPTIONAL.filter((name) => !env[name]);
const found = readSecrets(missing);
for (const name of missing) if (found[name]) env[name] = found[name];

// Anything after `npm start --` goes to Electron (for example --remote-debugging-port=9333 --user-data-dir=...).
const electron = require("electron");
const child = spawn(electron, [path.resolve(__dirname, ".."), ...process.argv.slice(2)], { stdio: "inherit", env, windowsHide: false });
child.on("exit", (code) => process.exit(code ?? 0));
