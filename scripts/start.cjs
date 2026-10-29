// npm start: launches Electron with the optional keys the app can use (SerpApi for Near you) already in its
// environment. A key that is already set in the environment wins; one that cannot be found is simply absent.
const { spawn } = require("node:child_process");
const path = require("node:path");
const { readSecret } = require("./resolve-key.cjs");

const OPTIONAL = ["SERPAPI_API_KEY", "THENEWSAPI_TOKEN", "TMDB_READ_ACCESS_TOKEN", "DATA_GOV_API_KEY", "WEBZ_API_KEY", "NEWSAPI_KEY", "NEWSDATA_API_KEY", "EVENTREGISTRY_API_KEY", "MASSIVE_API_KEY"];
const env = { ...process.env };
for (const name of OPTIONAL) {
  if (!env[name]) {
    const v = readSecret(name);
    if (v) env[name] = v;
  }
}

const electron = require("electron");
const child = spawn(electron, [path.resolve(__dirname, "..")], { stdio: "inherit", env, windowsHide: false });
child.on("exit", (code) => process.exit(code ?? 0));
