// Edition template: ONE structured edition object from which every desk artifact derives.
// brief (.md) / spoken script / marked companion / render chunks / audio merge plan / mirror manifest
// are all pure derivations of the object below — no stage hand-edits another stage's output, so the
// artifacts can never drift apart.
//
// Two safety properties are structural, not procedural:
//
// 1. Contributor blocks have NO render path. A block item of type "contributor" carries its full
//    text for the written briefing only. The spoken derivation reads exactly one field from it —
//    `pointer`, a single desk-written line — and the render chunks derive from the spoken script,
//    so contributor text cannot reach the TTS input through any code path in this module.
//    (This exists because on 2026-11-24 an expired directive got a contributor segment voiced
//    against the standing rule. A rule that lives in a prompt can expire; a missing code path
//    cannot.)
//
// 2. The pre-render ban gate. buildRenderChunks/renderEdition run the banned-phrases check over
//    the spoken script before any chunk exists. Locked bans hard-fail the render; starter bans
//    and un-locked recursion candidates warn only. The list mirrors
//    custom-skills/nou-reporter/BANNED_PHRASES.md (the desk's canonical list) — if that file
//    gains a locked ban, add its pattern here in the same change.
//
// Edition object shape:
// {
//   id: "2026-11-24-night",
//   name: "Night Edition",
//   dayLabel: "Tuesday",
//   date: "2026-11-24",
//   sourceNote: "…",                    // provenance line printed under the brief title
//   blocks: [
//     { id: "A", heading: "A block — …", items: [ item, … ] },
//     { id: "B", heading: "B block", items: [ … ] },
//     { id: "C", heading: "C block — wrap", items: [ … ] },
//     { id: "D", heading: "D block — weather", items: [ … ] },
//     { id: "E", heading: "E block", items: [ … ] },
//   ],
// }
//
// Item shapes:
//   { type: "story", heading?: "…", source?: "…", paragraphs: ["…", …] }
//   { type: "bullets", lines: ["…", …] }                       // wrap-style lists
//   { type: "contributor", credit: "our contributor on the Haiti beat",
//     heading: "…", paragraphs: ["…", …],                      // written briefing ONLY
//     pointer: "…" }                                           // the one spoken line

export class BannedPhraseError extends Error {
  constructor(hits) {
    super(`banned phrase gate: locked ban(s) in spoken script: ${hits.map((h) => `"${h.match}" (${h.label})`).join(", ")}`);
    this.name = "BannedPhraseError";
    this.hits = hits;
  }
}

// --- Banned phrases -------------------------------------------------------
// Patterns mirror BANNED_PHRASES.md. `locked: true` hard-fails the render gate;
// everything else is a warning the desk sees but may ship past.

export const BANNED_PHRASES = [
  // Locked bans (Dave).
  { label: 'locked: "a real thing"', locked: true, pattern: /\ba real thing\b/i },
  { label: 'locked: "here\'s what …" importance announcement', locked: true, pattern: /\bhere(?:'s| is) what\b/i },
  // Starter bans (warn only).
  { label: 'starter: "in today\'s fast-paced/ever-evolving world"', locked: false, pattern: /\bin today's (?:fast-paced|ever-evolving|ever-changing) (?:world|landscape)\b/i },
  { label: 'starter: "delve into" / "dive deep into"', locked: false, pattern: /\b(?:delve into|dive deep into)\b/i },
  { label: 'starter: "it\'s worth noting that" / "it\'s important to note that"', locked: false, pattern: /\bit's (?:worth noting|important to note) that\b/i },
  { label: 'starter: "at the end of the day"', locked: false, pattern: /\bat the end of the day\b/i },
  { label: 'starter: "game-changer" / "game-changing"', locked: false, pattern: /\bgame[- ]chang(?:er|ing)\b/i },
  { label: 'starter: "tapestry"', locked: false, pattern: /\btapestry\b/i },
  { label: 'starter: "landscape" as abstract filler', locked: false, pattern: /\blandscape\b/i },
  { label: 'starter: "not just X, it\'s Y" manufactured contrast', locked: false, pattern: /\bnot just\b[^.!?]*\bit's\b/i },
  { label: 'starter: "it\'s not about X, it\'s about Y"', locked: false, pattern: /\bit's not about\b[^.!?]*\bit's about\b/i },
  { label: 'starter: "the coverage itself is the tell"', locked: false, pattern: /\bthe coverage itself is the tell\b/i },
  // Recursion candidates, not locked (warn only).
  { label: 'candidate: "That is why it leads the show"', locked: false, pattern: /\bthat is why it leads the show\b/i },
  { label: 'candidate: "The takeaway is…"', locked: false, pattern: /\bthe (?:plain )?takeaway is\b/i },
];

// Check text against the ban list. Returns { locked: [hit], warnings: [hit] },
// a hit being { label, match, index }.
export function checkBannedPhrases(text) {
  const locked = [];
  const warnings = [];
  for (const rule of BANNED_PHRASES) {
    const re = new RegExp(rule.pattern.source, rule.pattern.flags.includes("g") ? rule.pattern.flags : rule.pattern.flags + "g");
    for (const m of String(text || "").matchAll(re)) {
      (rule.locked ? locked : warnings).push({ label: rule.label, match: m[0], index: m.index });
    }
  }
  return { locked, warnings };
}

// --- Derivations ----------------------------------------------------------

const BLOCK_ORDER = ["A", "B", "C", "D", "E"];

export function editionTitle(edition) {
  return `NouGen News — ${edition.name}, ${edition.dayLabel} ${edition.date}`;
}

function sortedBlocks(edition) {
  const rank = (b) => {
    const i = BLOCK_ORDER.indexOf(b.id);
    return i === -1 ? BLOCK_ORDER.length : i;
  };
  return [...(edition.blocks || [])].sort((a, b) => rank(a) - rank(b));
}

// The written briefing: every item in full, contributor sections credited.
export function buildBrief(edition) {
  const out = [`# ${editionTitle(edition)}`, ""];
  if (edition.sourceNote) out.push(edition.sourceNote, "");
  for (const block of sortedBlocks(edition)) {
    out.push(`## ${block.heading || `${block.id} block`}`, "");
    for (const item of block.items || []) {
      if (item.type === "bullets") {
        for (const line of item.lines || []) out.push(`- ${line}`);
        out.push("");
      } else {
        // story and contributor items both print in full in the written briefing;
        // a contributor item carries its credit in its heading line.
        if (item.heading) out.push(`**${item.heading}**`, "");
        for (const p of item.paragraphs || []) out.push(p, "");
      }
    }
  }
  return out.join("\n").trimEnd() + "\n";
}

// Speech spelling: the host's name is written "Nou" and pronounced "Noo".
// Applied only on the spoken path; the written briefing keeps "Nou".
export function spellForSpeech(text) {
  return String(text || "").replace(/\bNou\b/g, "Noo");
}

// One spoken line for a block item. This is the ONLY place the spoken path
// touches a contributor item, and it reads `pointer` and nothing else.
function spokenLineFor(item) {
  if (item.type === "contributor") return item.pointer || "";
  if (item.type === "bullets") return (item.lines || []).join(" ");
  return (item.paragraphs || []).join(" ");
}

// The spoken script: desk items in full; contributor items as their pointer line only.
export function buildSpokenScript(edition) {
  const parts = [];
  for (const block of sortedBlocks(edition)) {
    for (const item of block.items || []) {
      const line = spokenLineFor(item);
      if (line) parts.push(line);
    }
  }
  return spellForSpeech(parts.join("\n\n"));
}

// The marked companion: the spoken script with block markers and pause marks
// for the performance layer. Derived from the spoken script's own lines, so
// it inherits the contributor exclusion by construction.
export function buildMarkedCompanion(edition) {
  const out = [];
  for (const block of sortedBlocks(edition)) {
    const lines = [];
    for (const item of block.items || []) {
      const line = spokenLineFor(item);
      if (line) lines.push(spellForSpeech(line));
    }
    if (!lines.length) continue;
    out.push(`[${block.id}]`);
    for (const line of lines) out.push(line.replace(/([.!?])\s+/g, "$1 [pause] "));
    out.push("");
  }
  return out.join("\n").trimEnd() + "\n";
}

// Split text into sentences without breaking decimals ("$165.05" is one
// sentence-internal token, not a boundary) or quoted closers. A boundary is
// a [.!?] (plus any closing quotes/brackets) followed by whitespace or the
// end of the text.
export function splitSentences(text) {
  const s = String(text || "");
  const out = [];
  let start = 0;
  let i = 0;
  while (i < s.length) {
    const c = s[i];
    if (c === "." || c === "!" || c === "?") {
      let j = i + 1;
      while (j < s.length && "\"')\]]".includes(s[j])) j++;
      if (j >= s.length || /\s/.test(s[j])) {
        out.push(s.slice(start, j));
        start = j;
        i = j;
        continue;
      }
    }
    i++;
  }
  if (start < s.length) out.push(s.slice(start));
  return out.map((t) => t.trim()).filter(Boolean);
}

// Split spoken text into render chunks of at most maxWords words, breaking on
// sentence boundaries where possible (the desk renders ~300-word chunks).
export function chunkSpokenText(text, { maxWords = 300 } = {}) {
  const sentences = splitSentences(text);
  const chunks = [];
  let current = [];
  let count = 0;
  const flush = () => {
    if (current.length) chunks.push(current.join(" ").trim());
    current = [];
    count = 0;
  };
  for (const raw of sentences) {
    const sentence = raw.trim();
    if (!sentence) continue;
    const words = sentence.split(/\s+/).length;
    if (words > maxWords) {
      // A single sentence longer than the cap is hard-split on word boundaries.
      flush();
      const all = sentence.split(/\s+/);
      for (let i = 0; i < all.length; i += maxWords) chunks.push(all.slice(i, i + maxWords).join(" "));
      continue;
    }
    if (count + words > maxWords) flush();
    current.push(sentence);
    count += words;
  }
  flush();
  return chunks;
}

// The render chunks, behind the ban gate. Throws BannedPhraseError when the
// spoken script carries a locked ban — no chunks exist until the gate passes.
export function buildRenderChunks(edition, { maxWords = 300 } = {}) {
  const spoken = buildSpokenScript(edition);
  const { locked, warnings } = checkBannedPhrases(spoken);
  if (locked.length) throw new BannedPhraseError(locked);
  return { chunks: chunkSpokenText(spoken, { maxWords }), warnings };
}

// The audio merge plan: chunk files in order, one merged edition file out.
// Pure plan only — the actual render/merge runs on the desk's audio tooling.
export function planAudioMerge(edition, chunkCount) {
  const inputs = Array.from({ length: chunkCount }, (_, i) => `${edition.id}-chunk-${i + 1}.mp3`);
  return { inputs, output: `${edition.id}.mp3` };
}

// The mirror manifest: what gets mirrored where, once the desk renders.
// Manifest only — this build performs no uploads.
export function buildMirrorManifest(edition, { chunkCount = 0 } = {}) {
  const merge = planAudioMerge(edition, chunkCount);
  return {
    edition: edition.id,
    generatedFrom: "edition object (core/edition-template.js)",
    artifacts: [
      { kind: "brief", file: `${edition.id}-brief.md`, mirror: { service: "google-docs", title: editionTitle(edition) } },
      { kind: "spoken", file: `${edition.id}-spoken.txt`, mirror: null },
      { kind: "marked", file: `${edition.id}-marked.txt`, mirror: null },
      { kind: "audio", file: merge.output, chunks: merge.inputs, mirror: { service: "google-drive", folder: "NouGen Audio" } },
    ],
  };
}

// The whole pipeline in one call: every artifact derives from the edition
// object, the ban gate runs before chunks exist, and starter/candidate hits
// ride along as warnings.
export function renderEdition(edition, { maxWords = 300 } = {}) {
  const spoken = buildSpokenScript(edition);
  const { locked, warnings } = checkBannedPhrases(spoken);
  if (locked.length) throw new BannedPhraseError(locked);
  const chunks = chunkSpokenText(spoken, { maxWords });
  return {
    brief: buildBrief(edition),
    spoken,
    marked: buildMarkedCompanion(edition),
    chunks,
    warnings,
    merge: planAudioMerge(edition, chunks.length),
    manifest: buildMirrorManifest(edition, { chunkCount: chunks.length }),
  };
}
