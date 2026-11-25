#!/usr/bin/env node
// Edition template driver: edition object in, desk artifacts out.
//
//   node scripts/edition-template.mjs <edition.json|edition.mjs> <outdir>
//
// The input is one structured edition object (see core/edition-template.js
// for the shape; core/test/fixtures/night-2026-11-24.js is a worked example —
// pass that .js file directly to reproduce the corrected Night Edition).
// Outputs in <outdir>: <id>-brief.md, <id>-spoken.txt, <id>-marked.txt,
// chunks/<id>-chunk-N.txt (the TTS render inputs), and <id>-manifest.json
// (the audio merge plan + mirror manifest). The render refuses to write
// chunks when the spoken script carries a locked banned phrase.
import { mkdir, writeFile } from "node:fs/promises";
import { join, resolve } from "node:path";
import { pathToFileURL } from "node:url";
import { renderEdition } from "../core/edition-template.js";

const [input, outdir] = process.argv.slice(2);
if (!input || !outdir) {
  console.error("usage: node scripts/edition-template.mjs <edition.json|edition.mjs> <outdir>");
  process.exit(2);
}

const inputPath = resolve(input);
let edition;
if (inputPath.endsWith(".json")) {
  const { readFile } = await import("node:fs/promises");
  edition = JSON.parse(await readFile(inputPath, "utf8"));
} else {
  const mod = await import(pathToFileURL(inputPath).href);
  const looksLikeEdition = (v) => v && typeof v === "object" && typeof v.id === "string" && Array.isArray(v.blocks);
  edition = [mod.edition, mod.default, ...Object.values(mod)].find(looksLikeEdition);
}
if (!edition || !edition.id) {
  console.error("input did not yield an edition object with an id");
  process.exit(2);
}

let out;
try {
  out = renderEdition(edition);
} catch (err) {
  // The ban gate failing is a desk decision point, not a crash: say what hit
  // and stop before any chunk file exists.
  console.error(err.message);
  process.exit(1);
}

await mkdir(join(outdir, "chunks"), { recursive: true });
await writeFile(join(outdir, `${edition.id}-brief.md`), out.brief);
await writeFile(join(outdir, `${edition.id}-spoken.txt`), out.spoken + "\n");
await writeFile(join(outdir, `${edition.id}-marked.txt`), out.marked);
for (let i = 0; i < out.chunks.length; i++) {
  await writeFile(join(outdir, "chunks", `${edition.id}-chunk-${i + 1}.txt`), out.chunks[i] + "\n");
}
const manifest = { ...out.manifest, merge: out.merge, warnings: out.warnings };
await writeFile(join(outdir, `${edition.id}-manifest.json`), JSON.stringify(manifest, null, 2) + "\n");

console.log(`${edition.id}: brief, spoken, marked, ${out.chunks.length} chunk(s), manifest → ${outdir}`);
for (const w of out.warnings) console.log(`warning (not a gate failure): ${w.label} — "${w.match}"`);
