// Reads news aloud with the voices installed on this machine (Chromium speechSynthesis).
// Nothing leaves the machine. The optional "radio" brief asks a LOCAL Ollama model for a
// two-sentence summary; cloud-backed Ollama models are never chosen.

export const MAX_SPEECH_CHARS = 3000;
export const DEFAULT_OLLAMA_HOST = "http://127.0.0.1:11434";
const CHUNK_CHARS = 240; // Chromium can cut off long single utterances; speak sentence by sentence

const ENTITIES = {
  "&amp;": "&", "&lt;": "<", "&gt;": ">", "&quot;": '"', "&#039;": "'", "&apos;": "'",
  "&#8217;": "’", "&#8216;": "‘", "&#8220;": "“", "&#8221;": "”", "&#8211;": "–",
  "&#8212;": "—", "&#8230;": "…", "&rsquo;": "’", "&lsquo;": "‘", "&rdquo;": "”",
  "&ldquo;": "“", "&nbsp;": " ", "&eacute;": "é", "&egrave;": "è", "&ecirc;": "ê",
  "&agrave;": "à", "&ccedil;": "ç", "&oelig;": "œ",
};

const decode = (s) => s.replace(/&[#a-zA-Z0-9]+;/g, (m) => {
  if (ENTITIES[m]) return ENTITIES[m];
  const num = /^&#(\d+);$/.exec(m);
  return num ? String.fromCodePoint(Number(num[1])) : " ";
});

/** Sanitized article HTML -> plain text for speech, capped at a sentence boundary. */
export function htmlToSpeechText(html = "", maxChars = MAX_SPEECH_CHARS) {
  const empty = { text: "", truncated: false, sentences: [] };
  if (!html || typeof html !== "string") return empty;
  let s = html
    .replace(/<!\[CDATA\[([\s\S]*?)\]\]>/gi, "$1")
    .replace(/<(figure|figcaption)[^>]*>[\s\S]*?<\/\1>/gi, " ")
    .replace(/<\/(p|h[1-6]|li|blockquote|div)>/gi, ". ")
    .replace(/<br\s*\/?>/gi, ". ")
    .replace(/<[^>]+>/g, " ");
  s = decode(s)
    .replace(/(The post|L[’']article|Cet article)\s[\s\S]*?(first appeared on|est apparu en premier sur)[\s\S]*$/i, "")
    .replace(/\s+/g, " ")
    .replace(/\s+([.,;:!?])/g, "$1")
    .replace(/([.!?…])(\s*\.)+/g, "$1")
    .trim();
  if (!s) return empty;
  let truncated = false;
  if (s.length > maxChars) {
    truncated = true;
    const slice = s.slice(0, maxChars);
    const cut = Math.max(slice.lastIndexOf(". "), slice.lastIndexOf("! "), slice.lastIndexOf("? "));
    s = cut > maxChars * 0.45 ? slice.slice(0, cut + 1) : slice.trimEnd() + "…";
  }
  return { text: s, truncated, sentences: splitIntoSentences(s) };
}

/** Text -> speakable chunks of at most `max` characters, split at sentences, then clauses. */
export function splitIntoSentences(text = "", max = CHUNK_CHARS) {
  if (!text) return [];
  const out = [];
  for (const sentence of text.split(/(?<=[.!?…])\s+/).map((p) => p.trim()).filter(Boolean)) {
    if (sentence.length <= max) { out.push(sentence); continue; }
    let acc = "";
    for (const part of sentence.split(/(?<=[,;:])\s+/)) {
      const next = acc ? `${acc} ${part}` : part;
      if (next.length <= max) { acc = next; continue; }
      if (acc) out.push(acc);
      // A clause longer than max is split on spaces rather than cut mid-word.
      let rest = part;
      while (rest.length > max) {
        const at = rest.lastIndexOf(" ", max);
        const idx = at > 0 ? at : max;
        out.push(rest.slice(0, idx).trim());
        rest = rest.slice(idx).trim();
      }
      acc = rest;
    }
    if (acc) out.push(acc);
  }
  return out;
}

/** Headline, then the first `n` sentences of the body. */
export function buildQuickBriefText(article, n = 2) {
  if (!article) return "";
  const title = String(article.title || "").trim();
  const lead = htmlToSpeechText(article.contentHtml || article.desc || "", 1200).sentences.slice(0, n).join(" ");
  if (!lead) return title;
  if (!title) return lead;
  return /[.!?…]$/.test(title) ? `${title} ${lead}` : `${title}. ${lead}`;
}

const PREFERRED = {
  fr: ["thomas", "amélie", "amelie", "audrey", "marie", "jacques"],
  en: ["ava", "samantha", "allison", "alex", "daniel"],
  es: ["paulina", "mónica", "monica", "jorge", "carlos", "diego", "marisol"],
  ht: ["thomas", "amélie", "amelie", "audrey", "marie", "jacques"],
};

/** Best installed voice for "fr" | "en" | "es" | "ht"; a saved voice wins when it matches the language. */
export function selectBestVoice(voices = [], lang = "fr", preferred = "") {
  if (!Array.isArray(voices) || voices.length === 0) {
    return { voice: null, matched: false, notice: "No voices are installed." };
  }
  const target = lang.toLowerCase();
  let matching = voices.filter((v) => (v.lang || "").toLowerCase().startsWith(target));
  let htFallback = false;
  if (matching.length === 0 && target === "ht") {
    matching = voices.filter((v) => (v.lang || "").toLowerCase().startsWith("fr"));
    htFallback = matching.length > 0;
  }
  if (preferred) {
    const chosen = matching.find((v) => v.voiceURI === preferred || v.name === preferred);
    if (chosen) return { voice: chosen, matched: true, notice: null };
  }
  if (matching.length === 0) {
    const def = voices.find((v) => v.default) || voices[0];
    return { voice: def, matched: false, notice: `No ${target.toUpperCase()} voice is installed; using ${def?.name || "the default voice"}.` };
  }
  const names = PREFERRED[target] || [];
  const score = (v) => {
    const n = (v.name || "").toLowerCase();
    let s = v.localService ? 20 : 0;
    if (/premium|enhanced|natural|siri/.test(n)) s += 40;
    const i = names.findIndex((x) => n.startsWith(x));
    if (i !== -1) s += 30 - i;
    return s;
  };
  const best = [...matching].sort((a, b) => score(b) - score(a))[0];
  return {
    voice: best,
    matched: !htFallback,
    notice: htFallback ? null : null,
  };
}

// Ollama models whose name says they run in the cloud ("gemma4:31b-cloud") or are embedding-only are never used:
// the brief must stay on this machine and use a generative model.
const isLocalModel = (name) => !/cloud/i.test(name) && !/embed/i.test(name);

export async function probeOllamaModels(host = DEFAULT_OLLAMA_HOST, fetchImpl = fetch) {
  try {
    const res = await fetchImpl(`${host}/api/tags`, { signal: AbortSignal.timeout(1800) });
    if (!res.ok) return { online: false, models: [], best: null };
    const models = ((await res.json()).models || []).map((m) => m.name).filter(isLocalModel);
    const exactResident = models.find((m) => m.toLowerCase() === "gemma4:e2b");
    const order = ["gemma4:e2b", "gemma4:e4b", "gemma4", "gemma3", "llama3", "qwen", "mistral", "phi"];
    let best = exactResident || models[0] || null;
    if (!exactResident) {
      for (const p of order) {
        const hit = models.find((m) => m.toLowerCase().includes(p));
        if (hit) { best = hit; break; }
      }
    }
    return { online: models.length > 0, models, best };
  } catch {
    return { online: false, models: [], best: null };
  }
}

/** Two-sentence radio summary from a local model; the quick brief when anything goes wrong. */
export async function summarizeWithOllama({ article, model, lang = "fr", host = DEFAULT_OLLAMA_HOST, signal, fetchImpl = fetch }) {
  const fallback = buildQuickBriefText(article, 2);
  if (!model || !isLocalModel(model) || !article) return fallback;
  const body = htmlToSpeechText(article.contentHtml || article.desc || "", 2200).text;
  if (!body) return fallback;
  const prompt =
    lang === "es"
      ? `Resume este artículo en exactamente 2 frases claras para leer en voz alta. Solo texto plano, sin introducción.\n\nTítulo: ${article.title}\nTexto: ${body}`
      : lang === "ht"
        ? `Rezime atik sa a nan egzakteman 2 fraz klè an Kreyòl Ayisyen pou li awotvwa. Tèks sèlman, san entwodiksyon.\n\nTit : ${article.title}\nTèks : ${body}`
        : lang === "fr"
          ? `Résume cet article en exactement 2 phrases claires pour une lecture à voix haute. Texte brut uniquement, sans introduction.\n\nTitre : ${article.title}\nTexte : ${body}`
          : `Summarize this article in exactly 2 clear sentences to be read aloud. Plain text only, no introduction.\n\nHeadline: ${article.title}\nArticle: ${body}`;
  try {
    const res = await fetchImpl(`${host}/api/generate`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      signal,
      body: JSON.stringify({ model, prompt, stream: false, think: false, keep_alive: "5m", options: { temperature: 0.2, num_predict: 160 } }),
    });
    if (!res.ok) return fallback;
    const text = String((await res.json()).response || "").replace(/[*#_`]/g, "").trim();
    return text ? `${article.title}. ${text}` : fallback;
  } catch {
    return fallback;
  }
}

const PREFS_KEY = "nougenflix.speech.v1";
/** Kokoro voices offered in the News read-aloud picker (ids match bin/kokoro_sidecar.py). */
export const KOKORO_VOICES = [
  { id: "af_heart", label: "American English · Heart (F)" },
  { id: "af_bella", label: "American English · Bella (F)" },
  { id: "af_nicole", label: "American English · Nicole (F)" },
  { id: "af_sarah", label: "American English · Sarah (F)" },
  { id: "am_adam", label: "American English · Adam (M)" },
  { id: "am_michael", label: "American English · Michael (M)" },
  { id: "bf_emma", label: "British English · Emma (F)" },
  { id: "bm_george", label: "British English · George (M)" },
  { id: "ff_siwis", label: "French · Siwis (F)" },
  { id: "ef_dora", label: "Spanish · Dora (F)" },
  { id: "em_alex", label: "Spanish · Alex (M)" },
];

export const DEFAULT_PREFS = {
  rate: 1.0,
  voices: { fr: "", en: "", es: "", ht: "" },
  briefMode: "sentences",
  ollamaModel: "",
  ttsEngine: "system", // "system" = installed OS voices, "kokoro" = Kokoro neural voice
  kokoroVoice: "af_heart",
};
const clampRate = (r) => Math.min(1.4, Math.max(0.8, Number(r) || 1));

export function loadSpeechPrefs(storage = globalThis.localStorage) {
  try {
    const saved = JSON.parse(storage?.getItem(PREFS_KEY) || "{}");
    return { ...DEFAULT_PREFS, ...saved, rate: clampRate(saved.rate ?? 1), voices: { ...DEFAULT_PREFS.voices, ...(saved.voices || {}) } };
  } catch {
    return { ...DEFAULT_PREFS };
  }
}

export function saveSpeechPrefs(prefs, storage = globalThis.localStorage) {
  try { storage?.setItem(PREFS_KEY, JSON.stringify(prefs)); return true; } catch { return false; }
}

/** Detect Kreyòl Ayisyen vs English vs Spanish vs French from article text/source. */
export function detectTextLang(text = "", source = "") {
  const s = ` ${String(text || "").toLowerCase()} `;
  // Strong Kreyòl Ayisyen lexical markers
  if (/\b(yo|nan|pou|ki|ak|sou|ap|te|kreyòl|ayiti|lapolis|sekirite|sòlda|gang|peyi|nouvo|kont|jwenn)\b/i.test(s) &&
      /\b(nan|pou|yo|ap|ak)\b/i.test(s)) {
    return "ht";
  }
  if (source === "The Haitian Times") return "en";
  if (/\b(the|and|with|after|from|haitian|police|soldiers)\b/i.test(s) && !/\b(les|des|dans|une|pour|au|aux|sur)\b/i.test(s)) {
    return "en";
  }
  if (/\b(el|los|las|para|con|por|del|una|sobre|gobierno|desaparecieron|cuatro|soldados)\b/i.test(s) && !/\b(les|des|dans|une|pour|au|aux|sur|du)\b/i.test(s)) {
    return "es";
  }
  return "fr";
}

/** Language of an article: honors explicit/translated lang, Kreyòl detection, or feed default. */
export const articleLang = (a) => (a?.lang || detectTextLang(`${a?.title || ""} ${a?.desc || ""}`, a?.source));

const IDLE = { status: "idle", mode: null, articleId: null, title: "", index: 0, total: 0, voiceName: "", lang: "fr", truncated: false, notice: null };

/**
 * One speaker for the News tab. Every speak call starts a new session; stop() ends the
 * current one, and anything still queued from an older session is dropped.
 */
export function createSpeechController({
  synth = globalThis.speechSynthesis,
  Utterance = globalThis.SpeechSynthesisUtterance,
  summarize = summarizeWithOllama,
  kokoro = null, // async (text, voiceId) => object URL of a WAV; null when Kokoro is unavailable
  Audio: AudioCtor = globalThis.Audio,
  onChange = () => {},
} = {}) {
  let state = { ...IDLE };
  let session = 0;
  let abort = null;
  let player = null; // HTMLAudioElement while a Kokoro article plays
  let playerStop = null; // resolves the pending Kokoro promise when stopped
  const emit = (patch) => { state = { ...state, ...patch }; onChange(state); };

  const stop = () => {
    session += 1;
    abort?.abort();
    abort = null;
    if (player) { try { player.pause(); } catch { /* ignore */ } }
    playerStop?.();
    try { synth?.cancel(); } catch { /* nothing playing */ }
    emit({ ...IDLE });
  };

  const pause = () => {
    if (state.status !== "speaking") return;
    if (player) { try { player.pause(); emit({ status: "paused" }); } catch { /* ignore */ } return; }
    try { synth.pause(); emit({ status: "paused" }); } catch { /* ignore */ }
  };
  const resume = () => {
    if (state.status !== "paused") return;
    if (player) { player.play().then(() => emit({ status: "speaking" })).catch(() => { /* ignore */ }); return; }
    try { synth.resume(); emit({ status: "speaking" }); } catch { /* ignore */ }
  };
  const togglePause = () => (state.status === "paused" ? resume() : pause());

  // Plays the whole text with a Kokoro voice. Resolves "done", "stopped", or "failed".
  const speakKokoro = async (text, { lang, prefs, mine }) => {
    const voiceId = prefs.kokoroVoice || DEFAULT_PREFS.kokoroVoice;
    const label = KOKORO_VOICES.find((v) => v.id === voiceId)?.label || voiceId;
    emit({
      status: "speaking",
      voiceName: `Kokoro · ${label}`,
      lang,
      notice: lang === "ht" ? "Kokoro has no Haitian Creole voice, so this reads with the selected voice." : null,
    });
    let url = null;
    try {
      url = await kokoro(text, voiceId);
    } catch (err) {
      emit({ notice: `Kokoro could not speak (${err?.message || err}); using the system voice.` });
      return "failed";
    }
    if (mine !== session) { try { URL.revokeObjectURL?.(url); } catch { /* ignore */ } return "stopped"; }
    return new Promise((resolve) => {
      const audio = new AudioCtor(url);
      audio.playbackRate = clampRate(prefs.rate);
      const finish = (result) => {
        if (player === audio) { player = null; playerStop = null; }
        try { URL.revokeObjectURL?.(url); } catch { /* ignore */ }
        resolve(result);
      };
      player = audio;
      playerStop = () => finish("stopped");
      audio.onended = () => finish("done");
      audio.onerror = () => finish("failed");
      audio.play().catch(() => finish("failed"));
    });
  };

  // Speaks text chunk by chunk with the installed system voices; resolves true when it ran to the end, false when stopped.
  const speakSystem = (text, { lang, prefs, mine }) => new Promise((resolve) => {
    if (!synth || !Utterance) { emit({ notice: "Speech is not available here." }); return resolve(false); }
    const chunks = splitIntoSentences(text);
    if (!chunks.length || mine !== session) return resolve(false);
    const { voice, notice } = selectBestVoice(synth.getVoices?.() || [], lang, prefs.voices?.[lang]);
    emit({ status: "speaking", voiceName: voice?.name || "default voice", lang, notice });
    let i = 0;
    const next = () => {
      if (mine !== session) return resolve(false);
      if (i >= chunks.length) return resolve(true);
      const u = new Utterance(chunks[i++]);
      u.rate = clampRate(prefs.rate);
      u.lang = voice?.lang || (lang === "es" ? "es-MX" : lang === "en" ? "en-US" : "fr-FR");
      if (voice) u.voice = voice;
      u.onend = next;
      u.onerror = (e) => (e?.error === "canceled" || e?.error === "interrupted" ? resolve(false) : next());
      try { synth.speak(u); } catch { resolve(false); }
    };
    next();
  });

  // Kokoro when chosen and available; otherwise (or if Kokoro fails) the system voices.
  const speakText = async (text, opts) => {
    if (opts.prefs?.ttsEngine === "kokoro" && kokoro) {
      const result = await speakKokoro(text, opts);
      if (result !== "failed") return result === "done";
    }
    return speakSystem(text, opts);
  };

  const speakArticle = async (article, prefs = DEFAULT_PREFS) => {
    stop();
    const mine = session;
    if (!article) return false;
    const lang = articleLang(article);
    const body = htmlToSpeechText(article.contentHtml || article.desc || "");
    const text = [String(article.title || "").trim(), body.text].filter(Boolean).join(". ");
    if (!text) { emit({ notice: "This article has no text to read." }); return false; }
    emit({ mode: "single", articleId: article.id, title: article.title, index: 1, total: 1, truncated: body.truncated });
    const done = await speakText(text, { lang, prefs, mine });
    if (mine === session) stop();
    return done;
  };

  const startBriefing = async (articles = [], prefs = DEFAULT_PREFS, onArticle = () => {}, limit = 10) => {
    stop();
    const mine = session;
    abort = new AbortController();
    const queue = articles.slice(0, limit);
    for (let i = 0; i < queue.length && mine === session; i++) {
      const a = queue[i];
      const lang = articleLang(a);
      emit({ mode: "briefing", articleId: a.id, title: a.title, index: i + 1, total: queue.length, truncated: false });
      onArticle(a);
      let text;
      if (prefs.briefMode === "full") {
        const b = htmlToSpeechText(a.contentHtml || a.desc || "");
        text = [a.title, b.text].filter(Boolean).join(". ");
      } else if (prefs.briefMode === "ollama" && prefs.ollamaModel) {
        emit({ status: "summarizing" });
        text = await summarize({ article: a, model: prefs.ollamaModel, lang, signal: abort?.signal });
      } else {
        text = buildQuickBriefText(a, 2);
      }
      if (mine !== session) break;
      if (!text) continue; // nothing readable: go on to the next story
      await speakText(text, { lang, prefs, mine });
    }
    if (mine === session) stop();
  };

  return { getState: () => state, speakArticle, startBriefing, pause, resume, togglePause, stop };
}
