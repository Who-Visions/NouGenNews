import { test } from "node:test";
import assert from "node:assert/strict";
import {
  htmlToSpeechText, splitIntoSentences, buildQuickBriefText, selectBestVoice,
  probeOllamaModels, summarizeWithOllama, loadSpeechPrefs, saveSpeechPrefs,
  createSpeechController, articleLang,
} from "./speech.js";

// A speechSynthesis stand-in: each utterance "finishes" on the next tick unless paused.
function fakeSynth(voices = [{ name: "Thomas", lang: "fr-FR", localService: true, voiceURI: "thomas" }]) {
  const s = {
    spoken: [], paused: false, pending: null,
    getVoices: () => voices,
    speak(u) {
      s.spoken.push(u);
      const finish = () => (s.paused ? (s.pending = finish) : u.onend?.());
      setImmediate(finish);
    },
    pause() { s.paused = true; },
    resume() { s.paused = false; const f = s.pending; s.pending = null; f && setImmediate(f); },
    cancel() { const f = s.pending; s.pending = null; s.paused = false; if (f) s.spoken.at(-1)?.onerror?.({ error: "canceled" }); },
  };
  return s;
}
class FakeUtterance { constructor(text) { this.text = text; } }
const tick = () => new Promise((r) => setImmediate(r));

test("html becomes clean speech text: entities decoded, footer dropped, paragraphs end in one period", () => {
  const r = htmlToSpeechText("<p>Port-au-Prince, 20 octobre.</p><p>La BRH n&rsquo;est pas autoris&eacute;e.</p><p>The post <a href='x'>BRH</a> first appeared on Le Quotidien 509.</p>");
  assert.equal(r.text, "Port-au-Prince, 20 octobre. La BRH n’est pas autorisée.");
  assert.equal(r.truncated, false);
});

test("long text is cut at a sentence boundary under the cap", () => {
  const r = htmlToSpeechText(`<p>${"Une phrase complète pour le test. ".repeat(120)}</p>`, 3000);
  assert.equal(r.truncated, true);
  assert.ok(r.text.length <= 3000 && r.text.endsWith("."), r.text.slice(-20));
});

test("long sentences are split into chunks without cutting words", () => {
  const long = "mot ".repeat(200).trim() + ".";
  const chunks = splitIntoSentences(long, 50);
  assert.ok(chunks.every((c) => c.length <= 50));
  assert.equal(chunks.join(" "), long);
});

test("quick brief joins headline and lead with a space, without doubling the period", () => {
  const html = "<p>Première phrase. Deuxième phrase. Troisième.</p>";
  assert.equal(buildQuickBriefText({ title: "Alerte BRH", contentHtml: html }), "Alerte BRH. Première phrase. Deuxième phrase.");
  assert.equal(buildQuickBriefText({ title: "Alerte?", contentHtml: html }), "Alerte? Première phrase. Deuxième phrase.");
});

test("voice choice: saved voice wins, then quality, and a notice when the language is missing", () => {
  const voices = [
    { name: "Grandma (French (France))", lang: "fr-FR", localService: true, voiceURI: "g" },
    { name: "Thomas", lang: "fr-FR", localService: true, voiceURI: "t" },
    { name: "Samantha", lang: "en-US", localService: true, voiceURI: "s", default: true },
  ];
  assert.equal(selectBestVoice(voices, "fr").voice.name, "Thomas");
  assert.equal(selectBestVoice(voices, "fr", "g").voice.name, "Grandma (French (France))");
  const es = selectBestVoice(voices, "es");
  assert.equal(es.matched, false);
  assert.match(es.notice, /No ES voice is installed; using Samantha\./);
});

test("cloud Ollama models are never picked or used", async () => {
  const tags = { models: [{ name: "gemma4:31b-cloud" }, { name: "gemma4:e2b-it-qat" }, { name: "nomic-embed-text" }] };
  const info = await probeOllamaModels("http://x", async () => ({ ok: true, json: async () => tags }));
  assert.deepEqual(info.models, ["gemma4:e2b-it-qat"]);
  assert.equal(info.best, "gemma4:e2b-it-qat");
  let called = false;
  const out = await summarizeWithOllama({ article: { title: "T", contentHtml: "<p>Un. Deux.</p>" }, model: "gemma4:31b-cloud", fetchImpl: async () => { called = true; } });
  assert.equal(called, false);
  assert.equal(out, "T. Un. Deux.");
});

test("prefs survive a round trip and bad storage falls back to defaults", () => {
  const mem = new Map();
  const store = { getItem: (k) => mem.get(k) ?? null, setItem: (k, v) => mem.set(k, v) };
  saveSpeechPrefs({ rate: 9, voices: { fr: "t" }, briefMode: "full" }, store);
  const p = loadSpeechPrefs(store);
  assert.equal(p.rate, 1.4);
  assert.equal(p.voices.fr, "t");
  assert.equal(p.briefMode, "full");
  assert.equal(loadSpeechPrefs({ getItem() { throw new Error("blocked"); } }).briefMode, "sentences");
});

test("an article is read headline first, in its language, and ends idle", async () => {
  const synth = fakeSynth([{ name: "Samantha", lang: "en-US", localService: true, voiceURI: "s" }]);
  const c = createSpeechController({ synth, Utterance: FakeUtterance });
  assert.equal(articleLang({ source: "The Haitian Times" }), "en");
  const done = await c.speakArticle({ id: "a", source: "The Haitian Times", title: "Hello", contentHtml: "<p>One. Two.</p>" });
  assert.equal(done, true);
  assert.deepEqual(synth.spoken.map((u) => u.text), ["Hello.", "One.", "Two."]);
  assert.equal(synth.spoken[0].voice.name, "Samantha");
  assert.equal(c.getState().status, "idle");
});

test("Kokoro voice plays the article through Audio; a Kokoro failure falls back to the system voice", async () => {
  const plays = [];
  class FakeAudio {
    constructor(url) { this.url = url; this.playbackRate = 1; plays.push(this); }
    play() { setImmediate(() => this.onended?.()); return Promise.resolve(); }
    pause() {}
  }
  const synth = fakeSynth([{ name: "Samantha", lang: "en-US", localService: true, voiceURI: "s" }]);
  const seen = [];
  const kokoro = async (text, voice) => { seen.push([text, voice]); return "blob:kokoro-ok"; };
  const c = createSpeechController({ synth, Utterance: FakeUtterance, Audio: FakeAudio, kokoro });
  const prefs = { rate: 1, voices: {}, briefMode: "sentences", ttsEngine: "kokoro", kokoroVoice: "bf_emma" };
  const done = await c.speakArticle({ id: "k", source: "The Haitian Times", title: "Hello", contentHtml: "<p>One.</p>" }, prefs);
  assert.equal(done, true);
  assert.deepEqual(seen, [["Hello. One.", "bf_emma"]]);
  assert.equal(plays.length, 1);
  assert.equal(synth.spoken.length, 0, "system voice must not speak when Kokoro succeeds");
  assert.equal(c.getState().status, "idle");

  const broken = async () => { throw new Error("runtime missing"); };
  const c2 = createSpeechController({ synth, Utterance: FakeUtterance, Audio: FakeAudio, kokoro: broken });
  const done2 = await c2.speakArticle({ id: "f", source: "The Haitian Times", title: "Hi", contentHtml: "<p>Two.</p>" }, prefs);
  assert.equal(done2, true);
  assert.ok(synth.spoken.some((u) => u.text === "Hi."), "system voice reads when Kokoro fails");
});

test("pause holds the reading and resume finishes it", async () => {
  const synth = fakeSynth();
  const c = createSpeechController({ synth, Utterance: FakeUtterance });
  const p = c.speakArticle({ id: "a", title: "Titre", contentHtml: "<p>Un. Deux. Trois.</p>" });
  c.pause();
  assert.equal(c.getState().status, "paused");
  await tick(); await tick();
  assert.equal(synth.spoken.length, 1, "nothing more is queued while paused");
  c.resume();
  assert.equal(await p, true);
  assert.equal(synth.spoken.length, 4, "title plus three sentences");
});

test("stop ends an article mid-way and nothing else is spoken", async () => {
  const synth = fakeSynth();
  const c = createSpeechController({ synth, Utterance: FakeUtterance });
  const p = c.speakArticle({ id: "a", title: "Titre", contentHtml: "<p>Un. Deux. Trois. Quatre.</p>" });
  c.stop();
  assert.equal(await p, false);
  await tick(); await tick();
  assert.equal(synth.spoken.length, 1);
  assert.equal(c.getState().status, "idle");
});

test("the briefing reads each story's quick brief, skips empty ones, and reports progress", async () => {
  const synth = fakeSynth();
  const seen = [];
  const c = createSpeechController({ synth, Utterance: FakeUtterance, onChange: (s) => s.mode === "briefing" && seen.push(`${s.index}/${s.total}`) });
  const picked = [];
  await c.startBriefing([
    { id: "1", title: "Un", contentHtml: "<p>A. B. C.</p>" },
    { id: "2", title: "", contentHtml: "" },
    { id: "3", title: "Trois", contentHtml: "<p>X.</p>" },
  ], { rate: 1, voices: {}, briefMode: "sentences" }, (a) => picked.push(a.id));
  assert.deepEqual(synth.spoken.map((u) => u.text), ["Un.", "A.", "B.", "Trois.", "X."]);
  assert.deepEqual(picked, ["1", "2", "3"]);
  assert.ok(seen.includes("3/3"));
  assert.equal(c.getState().status, "idle");
});

test("the radio brief uses the summarizer for each story", async () => {
  const synth = fakeSynth();
  const c = createSpeechController({ synth, Utterance: FakeUtterance, summarize: async ({ article }) => `${article.title}. Résumé.` });
  await c.startBriefing([{ id: "1", title: "Un", contentHtml: "<p>A.</p>" }], { rate: 1, voices: {}, briefMode: "ollama", ollamaModel: "gemma4:e2b-it-qat" });
  assert.deepEqual(synth.spoken.map((u) => u.text), ["Un.", "Résumé."]);
});
