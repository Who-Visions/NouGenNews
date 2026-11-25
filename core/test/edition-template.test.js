import { test } from "node:test";
import assert from "node:assert/strict";
import {
  BannedPhraseError,
  buildBrief,
  buildMarkedCompanion,
  buildMirrorManifest,
  buildRenderChunks,
  buildSpokenScript,
  checkBannedPhrases,
  chunkSpokenText,
  renderEdition,
  spellForSpeech,
} from "../edition-template.js";
import { nightEdition2026_11_24 as fixture } from "./fixtures/night-2026-11-24.js";

// Sentences that exist ONLY inside the fixture's contributor block. If any of
// these strings shows up on a speech path, the no-render property is broken.
const CONTRIBUTOR_ONLY = [
  "CECOT mega-prison",
  "Patrick Pélissier announced three new prisons",
  "2,500 Salvadoran troops operate in Haiti",
  "Gang Suppression Force",
  "four Salvadoran technicians missing since Oct 18",
];

const miniEdition = (paragraphs, over = {}) => ({
  id: "test-edition",
  name: "Test Edition",
  dayLabel: "Monday",
  date: "2026-01-05",
  blocks: [{ id: "A", heading: "A block", items: [{ type: "story", paragraphs }] }],
  ...over,
});

// --- Golden fixture: the corrected Night Edition 2026-11-24 ---------------

test("fixture: brief reproduces the corrected night edition's written output", () => {
  const brief = buildBrief(fixture);
  assert.ok(brief.startsWith("# NouGen News — Night Edition, Tuesday 2026-11-24"));
  assert.ok(brief.includes("## A block — Jensen Huang is back at Nvidia"));
  assert.ok(brief.includes("Eleven days after resigning, Jensen Huang was reinstated as Nvidia president, CEO and director"));
  assert.ok(brief.includes("NVDA closed Monday at $165.05, up 31.5%"));
  assert.ok(brief.includes("What to watch next: the House hearing date for Huang"));
  // The contributor section runs in full in the written briefing, credited by role.
  assert.ok(brief.includes("Haiti deepens the Bukele security pact"));
  assert.ok(brief.includes("our contributor on the Haiti beat"));
  for (const marker of CONTRIBUTOR_ONLY) assert.ok(brief.includes(marker), `brief should carry contributor text: ${marker}`);
});

test("fixture: spoken script carries the desk pointer, not the contributor segment", () => {
  const spoken = buildSpokenScript(fixture);
  const pointer = "On the Haiti beat, our contributor has filed on Haiti's deepening security pact with El Salvador — the full report is in tonight's written briefing.";
  assert.ok(spoken.includes(pointer), "spoken script should carry the one-line desk pointer");
  assert.equal(spoken.split(pointer).length - 1, 1, "pointer appears exactly once");
  // Desk stories still speak in full.
  assert.ok(spoken.includes("Eleven days after resigning, Jensen Huang was reinstated"));
  assert.ok(spoken.includes("reject 80,000 AI-generated songs a day"));
});

test("SAFETY: contributor block text cannot appear in any render chunk", () => {
  const { chunks } = buildRenderChunks(fixture);
  assert.ok(chunks.length > 0);
  const joined = chunks.join("\n");
  for (const marker of CONTRIBUTOR_ONLY) {
    assert.ok(!joined.includes(marker), `render chunk leaked contributor text: ${marker}`);
  }
  // The same exclusion holds for the other speech paths the chunks derive from.
  for (const artifact of [buildSpokenScript(fixture), buildMarkedCompanion(fixture)]) {
    for (const marker of CONTRIBUTOR_ONLY) assert.ok(!artifact.includes(marker), `speech path leaked contributor text: ${marker}`);
  }
  // And the pointer — the one permitted spoken trace of the block — is present.
  assert.ok(joined.includes("the full report is in tonight's written briefing."));
});

test("SAFETY: contributor text stays out of chunks even if the block is moved or renamed", () => {
  // The property must come from the item type, not from block position or ids:
  // move the contributor item into block A under a different heading and re-check.
  const moved = structuredClone(fixture);
  const bBlock = moved.blocks.find((b) => b.id === "B");
  const idx = bBlock.items.findIndex((i) => i.type === "contributor");
  const [contrib] = bBlock.items.splice(idx, 1);
  moved.blocks.find((b) => b.id === "A").items.push(contrib);
  const { chunks } = buildRenderChunks(moved);
  const joined = chunks.join("\n");
  for (const marker of CONTRIBUTOR_ONLY) assert.ok(!joined.includes(marker), `leaked after move: ${marker}`);
});

// --- Pre-render ban gate ---------------------------------------------------

test("SAFETY: a locked banned phrase in the spoken script fails the render gate", () => {
  const dirty = miniEdition(["The new studio mode shipped today, and it is a real thing players can open."]);
  assert.throws(() => buildRenderChunks(dirty), BannedPhraseError);
  assert.throws(() => renderEdition(dirty), BannedPhraseError);
});

test("SAFETY: the 'here's what …' importance announcement fails the render gate", () => {
  const dirty = miniEdition(["Here's what matters next for the hearing schedule."]);
  assert.throws(() => buildRenderChunks(dirty), (err) => {
    assert.ok(err instanceof BannedPhraseError);
    assert.ok(err.hits.some((h) => h.locked !== false));
    return true;
  });
});

test("ban gate: starter bans and recursion candidates warn but do not fail the render", () => {
  const warnOnly = miniEdition(["At the end of the day, the count is the count. The takeaway is simple: watch the hearing date."]);
  const { chunks, warnings } = buildRenderChunks(warnOnly);
  assert.ok(chunks.length > 0, "render proceeds past warnings");
  assert.ok(warnings.some((w) => w.label.includes("at the end of the day")));
  assert.ok(warnings.some((w) => w.label.includes("takeaway")));
});

test("checkBannedPhrases sorts hits into locked vs warnings", () => {
  const { locked, warnings } = checkBannedPhrases("It's a real thing now. Let's delve into the numbers.");
  assert.equal(locked.length, 1);
  assert.ok(warnings.some((w) => w.label.includes("delve")));
});

test("fixture: the corrected night edition passes the gate with no warnings", () => {
  const { locked, warnings } = checkBannedPhrases(buildSpokenScript(fixture));
  assert.deepEqual(locked, []);
  assert.deepEqual(warnings, []);
});

// --- Derivations -----------------------------------------------------------

test("spoken script spells the host name Noo; the brief keeps Nou", () => {
  const ed = miniEdition(["Nou will keep watching the hearing date."]);
  assert.ok(buildSpokenScript(ed).includes("Noo will keep watching"));
  assert.ok(!buildSpokenScript(ed).includes("Nou will"));
  assert.equal(spellForSpeech("NouGen News with Nou"), "NouGen News with Noo");
});

test("chunks respect the word cap and rejoin to the spoken script", () => {
  const { chunks } = buildRenderChunks(fixture, { maxWords: 60 });
  assert.ok(chunks.length > 1);
  for (const c of chunks) assert.ok(c.split(/\s+/).length <= 60, "chunk over cap");
  const rejoined = chunks.join(" ").replace(/\s+/g, " ");
  const spoken = buildSpokenScript(fixture).replace(/\s+/g, " ");
  assert.equal(rejoined, spoken);
});

test("chunkSpokenText hard-splits a single sentence longer than the cap", () => {
  const long = Array.from({ length: 25 }, (_, i) => `word${i}`).join(" ") + ".";
  const chunks = chunkSpokenText(long, { maxWords: 10 });
  assert.deepEqual(chunks.map((c) => c.split(/\s+/).length), [10, 10, 5]);
});

test("renderEdition derives every artifact from the one edition object", () => {
  const out = renderEdition(fixture);
  assert.ok(out.brief.includes("Night Edition"));
  assert.ok(out.spoken.includes("Jensen Huang was reinstated"));
  assert.ok(out.marked.includes("[A]") && out.marked.includes("[B]"));
  assert.ok(out.chunks.length > 0);
  assert.equal(out.merge.output, "2026-11-24-night.mp3");
  assert.equal(out.merge.inputs.length, out.chunks.length);
  assert.equal(out.manifest.artifacts.find((a) => a.kind === "audio").file, "2026-11-24-night.mp3");
});

test("mirror manifest lists the brief for Google Docs and the audio for the NouGen Audio folder", () => {
  const manifest = buildMirrorManifest(fixture, { chunkCount: 3 });
  const brief = manifest.artifacts.find((a) => a.kind === "brief");
  assert.equal(brief.mirror.service, "google-docs");
  const audio = manifest.artifacts.find((a) => a.kind === "audio");
  assert.deepEqual(audio.mirror, { service: "google-drive", folder: "NouGen Audio" });
  assert.equal(audio.chunks.length, 3);
});

test("derivations are pure: a frozen edition object renders without mutation errors", () => {
  const deepFreeze = (o) => {
    if (o && typeof o === "object") {
      for (const v of Object.values(o)) deepFreeze(v);
      Object.freeze(o);
    }
    return o;
  };
  const frozen = deepFreeze(structuredClone(fixture));
  assert.doesNotThrow(() => renderEdition(frozen));
});
