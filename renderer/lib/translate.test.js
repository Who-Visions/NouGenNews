import { test } from "node:test";
import assert from "node:assert/strict";
import {
  extractParagraphsFromHtml,
  rebuildHtmlFromParagraphs,
  translateSegmentsGtx,
  translateSegmentsOllama,
  resolveArticleTranslation,
  resolveWireHeadlinesTranslation,
  translationLRU,
} from "./translate.js";
import { detectTextLang, selectBestVoice } from "./speech.js";

test("detects Kreyòl Ayisyen, English, Spanish, and French accurately", () => {
  assert.equal(
    detectTextLang("Kat sòlda salvadoryen nan FRG disparèt nan zòn Santo, Fòs sekirite yo ap mennen operasyon"),
    "ht"
  );
  assert.equal(detectTextLang("In Harlem, Haitians and Dominicans confront prejudice", "The Haitian Times"), "en");
  assert.equal(detectTextLang("Cuatro soldados salvadoreños desaparecieron en el área de Santo"), "es");
  assert.equal(detectTextLang("La Banque centrale appelle au renforcement de la sécurité"), "fr");
});

test("selectBestVoice picks Spanish voice for ES and falls back cleanly for HT", () => {
  const voices = [
    { name: "Thomas", lang: "fr-FR", localService: true, voiceURI: "t" },
    { name: "Paulina", lang: "es-MX", localService: true, voiceURI: "p" },
    { name: "Samantha", lang: "en-US", localService: true, voiceURI: "s", default: true },
  ];
  assert.equal(selectBestVoice(voices, "es").voice.name, "Paulina");
  assert.equal(selectBestVoice(voices, "ht").voice.name, "Thomas");
});

test("extracts and rebuilds sanitized paragraphs without losing tags", () => {
  const blocks = extractParagraphsFromHtml("<h2>Tit</h2><p>Premye fraz.</p><p>Dezyèm fraz.</p>");
  assert.deepEqual(blocks, [
    { tag: "h2", text: "Tit" },
    { tag: "p", text: "Premye fraz." },
    { tag: "p", text: "Dezyèm fraz." },
  ]);
  const html = rebuildHtmlFromParagraphs(blocks);
  assert.equal(html, "<h2>Tit</h2><p>Premye fraz.</p><p>Dezyèm fraz.</p>");
});

test("GTX batch segment translation translates Kreyòl ↔ English/Spanish and preserves segment count", async () => {
  const fakeFetch = async () => ({
    ok: true,
    json: async () => [
      [
        ["Four soldiers disappeared\n⟪NF_SEG⟫\n", "Kat sòlda disparèt\n⟪NF_SEG⟫\n"],
        ["Security forces are searching", "Fòs sekirite yo ap chèche"],
      ],
      null,
      "ht",
    ],
  });
  const res = await translateSegmentsGtx(["Kat sòlda disparèt", "Fòs sekirite yo ap chèche"], "en", { fetchImpl: fakeFetch });
  assert.equal(res.detectedSource, "ht");
  assert.deepEqual(res.segments, ["Four soldiers disappeared", "Security forces are searching"]);
});

test("Ollama fallback refuses cloud models and parses numbered translations from local models", async () => {
  await assert.rejects(
    () => translateSegmentsOllama(["Bonjou"], "en", { model: "gemma4:31b-cloud" }),
    /Refusing cloud/
  );
  const fakeFetch = async () => ({
    ok: true,
    json: async () => ({ response: "[1] Hola\n[2] Buenos días" }),
  });
  const res = await translateSegmentsOllama(["Bonjou", "Bon maten"], "es", {
    model: "gemma4:e2b",
    fetchImpl: fakeFetch,
  });
  assert.deepEqual(res.segments, ["Hola", "Buenos días"]);
});

test("resolveArticleTranslation and resolveWireHeadlinesTranslation translate and cache bidirectional HT/EN/ES", async () => {
  translationLRU.cache.clear();
  let calls = 0;
  const fakeFetch = async () => {
    calls += 1;
    return {
      ok: true,
      json: async () => [
        [
          ["Headline in Spanish\n⟪NF_SEG⟫\n", "x"],
          ["Lead in Spanish\n⟪NF_SEG⟫\n", "y"],
          ["Paragraph 1 in Spanish", "z"],
        ],
        null,
        "ht",
      ],
    };
  };
  const article = {
    id: "art-1",
    title: "Kat sòlda salvadoryen nan FRG disparèt nan zòn Santo",
    desc: "Fòs sekirite yo ap mennen operasyon pou jwenn yo.",
    contentHtml: "<p>Fòs sekirite yo ap mennen operasyon pou jwenn yo.</p>",
    source: "Le Quotidien 509",
  };
  const esArt = await resolveArticleTranslation(article, "es", { fetchImpl: fakeFetch });
  assert.equal(esArt.title, "Headline in Spanish");
  assert.equal(esArt.lang, "es");
  assert.equal(esArt.translatedFrom, "ht");
  assert.equal(esArt.isTranslated, true);
  assert.match(esArt.contentHtml, /Paragraph 1 in Spanish/);

  // Second call hits LRU cache without fetching again
  const esArtCached = await resolveArticleTranslation(article, "es", { fetchImpl: fakeFetch });
  assert.equal(calls, 1);
  assert.equal(esArtCached.title, "Headline in Spanish");

  // Wire headlines use cached full article when available
  const wire = await resolveWireHeadlinesTranslation([article], "es", { fetchImpl: fakeFetch });
  assert.equal(wire[0].title, "Headline in Spanish");
  assert.equal(calls, 1);
});
