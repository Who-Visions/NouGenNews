// Electron Forge: Windows installer (Squirrel.Windows) and GitHub Releases publishing.
//
//   npm run make      -> out/make/squirrel.windows/x64/{NouGenNewsSetup.exe, RELEASES, *.nupkg}
//   npm run publish   -> uploads those to a DRAFT GitHub release. Nothing reaches users until a person publishes the
//                        draft; installed apps then update from releases/latest/download (electron/updater.js).
//
// The repo is the web app and the desktop app together, so the installer is an allowlist: the Electron main process,
// the built renderer (dist/) and the two modules the main process requires at runtime. Everything else (Next.js,
// Playwright, Firebase, ...) stays out of the package. No keys are ever packaged: an installed app starts keyless and
// the user adds their own in the app.
const path = require("node:path");

const RUNTIME_MODULES = ["sql.js", "nougen-shards-lite"];

function keep(p) {
  const f = p.replace(/\\/g, "/");
  if (f === "" || f === "/package.json") return true;
  if (f === "/electron" || (f.startsWith("/electron/") && !f.startsWith("/electron/test"))) return true;
  if (f === "/dist" || f.startsWith("/dist/")) return true;
  if (f === "/node_modules") return true;
  return RUNTIME_MODULES.some((m) => f === `/node_modules/${m}` || f.startsWith(`/node_modules/${m}/`));
}

module.exports = {
  packagerConfig: {
    name: "NouGenNews",
    executableName: "NouGenNews",
    asar: true,
    icon: path.join(__dirname, "electron", "assets", "icon"),   // packager adds .ico on Windows
    derefSymlinks: true,                    // nougen-shards-lite is a file: dependency (a link to a sibling folder)
    ignore: (p) => !keep(p),
    win32metadata: { CompanyName: "Who Visions", ProductName: "NouGenNews", FileDescription: "NouGenNews" },
  },
  makers: [
    {
      name: "@electron-forge/maker-squirrel",
      platforms: ["win32"],
      config: {
        name: "NouGenNews",
        authors: "Who Visions",
        description: "NouGenNews desktop app",
        setupExe: "NouGenNewsSetup.exe",
        setupIcon: path.join(__dirname, "electron", "assets", "icon.ico"),
        // Apps & Features icon: Squirrel fetches it by URL (resolves once the icon is on main).
        iconUrl: "https://raw.githubusercontent.com/Who-Visions/NouGenNews/main/electron/assets/icon.ico",
        noMsi: true,
      },
    },
  ],
  publishers: [
    {
      name: "@electron-forge/publisher-github",
      config: { repository: { owner: "Who-Visions", name: "NouGenNews" }, draft: true, prerelease: false },
    },
  ],
};

module.exports._keep = keep;               // exported for the allowlist test
module.exports._root = path.resolve(__dirname);
