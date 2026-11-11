// A built page whose script or stylesheet is missing opens as a black window with no error. That happens when two
// builds write into dist at once (one empties the folder while the other is writing) or a build is cut short.
// This reads dist/index.html and lists every local file it points at that is not on disk.
const fs = require("node:fs");
const path = require("node:path");

// The local files index.html needs: src="./assets/x.js", href="./assets/x.css" (and the same without ./ ).
function referencedFiles(html) {
  const out = [];
  const re = /(?:src|href)="(?:\.\/)?((?:assets\/)[^"#?]+)"/gi;
  let m;
  while ((m = re.exec(String(html || "")))) out.push(m[1]);
  return [...new Set(out)];
}

// [] when the build is complete; otherwise the missing files (or ["index.html"] when there is no page at all).
function missingFiles(distDir, { exists = fs.existsSync, read = (p) => fs.readFileSync(p, "utf8") } = {}) {
  const page = path.join(distDir, "index.html");
  if (!exists(page)) return ["index.html"];
  let html = "";
  try { html = read(page); } catch { return ["index.html"]; }
  return referencedFiles(html).filter((f) => !exists(path.join(distDir, f)));
}

module.exports = { referencedFiles, missingFiles };
