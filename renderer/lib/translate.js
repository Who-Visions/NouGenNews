// Dynamic Resolve Translation Engine (Kreyòl Ayisyen ↔ English ↔ Español + Original)
// Primary: Fast batch translation via translate.googleapis.com/translate_a/single (client=gtx)
// Fallback: Local Ollama (gemma4:e2b / local generative model; cloud models strictly refused)
// Bounded LRU cache ensures zero redundant network/inference hits when toggling languages.

import { sanitizeArticleHtml } from "./articleHtml.js";
import { DEFAULT_OLLAMA_HOST, detectTextLang } from "./speech.js";

export const TRANSLATE_LANGS = [
  { code: "orig", label: "Original", short: "ORIG", flag: "📰" },
  { code: "ht", label: "Kreyòl", short: "HT", flag: "🇭🇹" },
  { code: "en", label: "English", short: "EN", flag: "🇺🇸" },
  { code: "es", label: "Español", short: "ES", flag: "🇪🇸" },
];

const LANG_NAMES = {
  ht: "Haitian Creole (Kreyòl Ayisyen)",
  en: "English",
  es: "Spanish (Español)",
  fr: "French (Français)",
};

class TranslationLRU {
  constructor(limit = 200) {
    this.limit = limit;
    this.cache = new Map();
    this.inflight = new Map();
  }

  get(key) {
    if (!this.cache.has(key)) return undefined;
    const v = this.cache.get(key);
    this.cache.delete(key);
    this.cache.set(key, v);
    return v;
  }

  set(key, val) {
    if (this.cache.has(key)) this.cache.delete(key);
    else if (this.cache.size >= this.limit) {
      const oldest = this.cache.keys().next().value;
      this.cache.delete(oldest);
    }
    this.cache.set(key, val);
  }
}

export const translationLRU = new TranslationLRU(240);

const DELIM = "\n⟪NF_SEG⟫\n";

function stripTagsToText(html = "") {
  return String(html || "")
    .replace(/<[^>]+>/g, " ")
    .replace(/&nbsp;/gi, " ")
    .replace(/&amp;/gi, "&")
    .replace(/&quot;/gi, '"')
    .replace(/&#039;|&apos;/gi, "'")
    .replace(/&#8217;|&rsquo;/gi, "’")
    .replace(/&#8220;|&ldquo;/gi, "“")
    .replace(/&#8221;|&rdquo;/gi, "”")
    .replace(/\s+/g, " ")
    .trim();
}

/** Extract readable paragraphs from sanitized article HTML for structured translation. */
export function extractParagraphsFromHtml(html = "") {
  if (!html || typeof html !== "string") return [];
  const blocks = [];
  const regex = /<(p|h[1-6]|li|blockquote)[^>]*>([\s\S]*?)<\/\1>/gi;
  let match;
  while ((match = regex.exec(html)) !== null) {
    const tag = match[1].toLowerCase();
    const text = stripTagsToText(match[2]);
    if (text) blocks.push({ tag, text });
  }
  if (blocks.length === 0) {
    const plain = stripTagsToText(html);
    if (plain) blocks.push({ tag: "p", text: plain });
  }
  return blocks;
}

function escapeHtmlText(str = "") {
  return String(str)
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;");
}

export function rebuildHtmlFromParagraphs(blocks = []) {
  const raw = blocks
    .map(({ tag, text }) => {
      const safeTag = /^(p|h[1-6]|li|blockquote)$/.test(tag) ? tag : "p";
      return `<${safeTag}>${escapeHtmlText(text)}</${safeTag}>`;
    })
    .join("");
  return typeof window !== "undefined" ? sanitizeArticleHtml(raw) : raw;
}

/** Translate an array of text segments in one fast batch request via GTX endpoint. */
export async function translateSegmentsGtx(segments = [], targetLang = "en", { sourceLang = "auto", signal, fetchImpl = fetch } = {}) {
  if (!Array.isArray(segments) || segments.length === 0) return { segments: [], detectedSource: sourceLang };
  const joined = segments.join(DELIM);
  const url =
    `https://translate.googleapis.com/translate_a/single?client=gtx` +
    `&sl=${encodeURIComponent(sourceLang || "auto")}` +
    `&tl=${encodeURIComponent(targetLang)}` +
    `&dt=t&q=${encodeURIComponent(joined)}`;

  const res = await fetchImpl(url, { signal });
  if (!res.ok) throw new Error(`GTX HTTP ${res.status}`);
  const data = await res.json();
  const fullTranslated = Array.isArray(data?.[0])
    ? data[0].map((part) => (Array.isArray(part) ? part[0] || "" : "")).join("")
    : "";
  const detectedSource = typeof data?.[2] === "string" ? data[2].toLowerCase() : sourceLang;
  const split = fullTranslated.split(/\s*⟪NF_SEG⟫\s*/);
  return {
    segments: segments.map((orig, i) => (split[i] ? split[i].trim() : orig)),
    detectedSource,
  };
}

/** Local-only Ollama translation fallback (never uses cloud models). */
export async function translateSegmentsOllama(
  segments = [],
  targetLang = "en",
  { model = "gemma4:e2b", host = DEFAULT_OLLAMA_HOST, signal, fetchImpl = fetch } = {}
) {
  if (!Array.isArray(segments) || segments.length === 0) return { segments: [], detectedSource: "auto" };
  if (!model || /cloud/i.test(model) || /embed/i.test(model)) {
    throw new Error("Refusing cloud or embedding Ollama model for translation");
  }
  const targetName = LANG_NAMES[targetLang] || targetLang;
  const numbered = segments.map((s, i) => `[${i + 1}] ${s}`).join("\n");
  const prompt =
    `Translate each numbered line below into ${targetName}. ` +
    `Preserve the exact [number] prefix for each line. Output ONLY the translated lines, nothing else.\n\n${numbered}`;

  const res = await fetchImpl(`${host}/api/generate`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    signal,
    body: JSON.stringify({
      model,
      prompt,
      stream: false,
      think: false,
      keep_alive: "5m",
      options: { temperature: 0.1, num_predict: 900 },
    }),
  });
  if (!res.ok) throw new Error(`Ollama HTTP ${res.status}`);
  const body = await res.json();
  const outText = String(body?.response || "").trim();
  const map = new Map();
  for (const line of outText.split(/\n+/)) {
    const m = /^\[(\d+)\]\s*(.+)$/.exec(line.trim());
    if (m) map.set(Number(m[1]) - 1, m[2].trim());
  }
  return {
    segments: segments.map((orig, idx) => map.get(idx) || orig),
    detectedSource: "ollama-local",
  };
}

/**
 * Dynamically resolve & translate a single article (title, desc, contentHtml) into targetLang ("ht" | "en" | "es" | "orig").
 * Returns a new article object with translated fields, `lang: targetLang`, and `translatedFrom`.
 */
export async function resolveArticleTranslation(
  article,
  targetLang = "orig",
  { ollamaModel = "gemma4:e2b", signal, fetchImpl = fetch } = {}
) {
  if (!article || !targetLang || targetLang === "orig") return article;
  const origLang = detectTextLang(`${article.title || ""} ${article.desc || ""}`, article.source);
  if (origLang === targetLang) {
    return { ...article, lang: targetLang, translatedFrom: origLang, isTranslated: false };
  }

  const cacheKey = `art::${article.id}::${targetLang}`;
  const cached = translationLRU.get(cacheKey);
  if (cached) return cached;
  if (translationLRU.inflight.has(cacheKey)) return translationLRU.inflight.get(cacheKey);

  const promise = (async () => {
    const blocks = extractParagraphsFromHtml(article.contentHtml || `<p>${article.desc || ""}</p>`).slice(0, 18);
    const inputSegments = [
      String(article.title || "").trim(),
      String(article.desc || "").trim(),
      ...blocks.map((b) => b.text),
    ];

    let result;
    try {
      result = await translateSegmentsGtx(inputSegments, targetLang, { signal, fetchImpl });
    } catch {
      result = await translateSegmentsOllama(inputSegments, targetLang, {
        model: ollamaModel || "gemma4:e2b",
        signal,
        fetchImpl,
      });
    }

    const [tTitle, tDesc, ...tParas] = result.segments;
    const translatedBlocks = blocks.map((b, i) => ({ tag: b.tag, text: tParas[i] || b.text }));
    const translatedArticle = {
      ...article,
      title: tTitle || article.title,
      desc: tDesc || article.desc,
      contentHtml: translatedBlocks.length ? rebuildHtmlFromParagraphs(translatedBlocks) : article.contentHtml,
      lang: targetLang,
      originalLang: origLang,
      translatedFrom: result.detectedSource || origLang,
      isTranslated: true,
    };

    translationLRU.set(cacheKey, translatedArticle);
    return translatedArticle;
  })().finally(() => {
    translationLRU.inflight.delete(cacheKey);
  });

  translationLRU.inflight.set(cacheKey, promise);
  return promise;
}

/**
 * Batch-resolve headlines & descriptions for the wire feed list into `targetLang` ("ht" | "en" | "es"),
 * so the left dispatch list and `Brief me` immediately reflect the chosen language.
 * Calls `onBatch(batchMap)` after each batch so the UI updates progressively in ~350ms.
 */
export async function resolveWireHeadlinesTranslation(
  articles = [],
  targetLang = "orig",
  { ollamaModel = "gemma4:e2b", signal, fetchImpl = fetch, batchSize = 8, onBatch } = {}
) {
  if (!Array.isArray(articles) || !articles.length || !targetLang || targetLang === "orig") {
    return articles;
  }

  const out = [...articles];
  const toTranslate = [];
  const initialMap = {};

  articles.forEach((a, idx) => {
    const fullCached = translationLRU.get(`art::${a.id}::${targetLang}`);
    if (fullCached) {
      out[idx] = fullCached;
      initialMap[`${a.id}::${targetLang}`] = fullCached;
      return;
    }
    const headCached = translationLRU.get(`head::${a.id}::${targetLang}`);
    if (headCached) {
      out[idx] = headCached;
      initialMap[`${a.id}::${targetLang}`] = headCached;
      return;
    }
    toTranslate.push({ article: a, idx });
  });

  if (Object.keys(initialMap).length > 0 && onBatch) {
    onBatch(initialMap);
  }

  for (let i = 0; i < toTranslate.length; i += batchSize) {
    if (signal?.aborted) break;
    const slice = toTranslate.slice(i, i + batchSize);
    const segments = [];
    slice.forEach(({ article }) => {
      segments.push(String(article.title || "").trim());
      segments.push(String(article.desc || "").trim());
    });

    try {
      let res;
      try {
        res = await translateSegmentsGtx(segments, targetLang, { signal, fetchImpl });
      } catch {
        res = await translateSegmentsOllama(segments, targetLang, {
          model: ollamaModel || "gemma4:e2b",
          signal,
          fetchImpl,
        });
      }
      if (signal?.aborted) break;
      const batchMap = {};
      slice.forEach(({ article, idx }, pos) => {
        const tTitle = res.segments[pos * 2] || article.title;
        const tDesc = res.segments[pos * 2 + 1] || article.desc;
        const origLang = detectTextLang(`${article.title || ""} ${article.desc || ""}`, article.source);
        const updated = {
          ...article,
          title: tTitle,
          desc: tDesc,
          lang: targetLang,
          originalLang: origLang,
          translatedFrom: res.detectedSource || origLang,
          isTranslated: origLang !== targetLang,
        };
        translationLRU.set(`head::${article.id}::${targetLang}`, updated);
        out[idx] = updated;
        batchMap[`${article.id}::${targetLang}`] = updated;
      });
      if (onBatch) onBatch(batchMap);
    } catch {
      // Keep original items if both primary and fallback fail
    }
  }

  return out;
}
