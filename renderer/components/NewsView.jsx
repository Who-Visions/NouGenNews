import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { invoke } from "../lib/bridge.js";
import { optimizeLowCacheUrl, sanitizeArticleHtml, splitTail } from "../lib/articleHtml.js";
import { TailCarousel } from "./TailCarousel.jsx";
import { BreakingTicker } from "./BreakingTicker.jsx";
import { FrontSections } from "./FrontSections.jsx";
import { Masthead } from "./Masthead.jsx";
import { NewsHero } from "./NewsHero.jsx";
import { NewsTree, loadAutoplay } from "./NewsTree.jsx";
import { FEEDS } from "../../core/feeds.js";
import { extractTerms, matchStory, pruneTerms } from "../../core/library.js";
import { scoreStory } from "../../core/edition.js";
import "./NewsView.css";
import {
  articleLang,
  createSpeechController,
  detectTextLang,
  loadSpeechPrefs,
  probeOllamaModels,
  saveSpeechPrefs,
} from "../lib/speech.js";

import {
  TRANSLATE_LANGS,
  resolveArticleTranslation,
  resolveWireHeadlinesTranslation,
} from "../lib/translate.js";

const IDLE_SPEECH = {
  status: "idle",
  mode: null,
  articleId: null,
  title: "",
  index: 0,
  total: 0,
  voiceName: "",
  lang: "fr",
  notice: null,
  truncated: false,
};

// ─── NOUGEN DESIGN TOKENS (nougen-core/DESIGN.md) ────────────────────────────
const TOKENS = {
  surfaceBase: "#000000",
  surfaceElevated: "rgba(255, 255, 255, 0.05)",
  surfaceInteractive: "rgba(255, 255, 255, 0.06)",
  surfaceHover: "rgba(255, 255, 255, 0.12)",
  surfaceSelected: "rgba(255, 255, 255, 0.09)",
  borderSubtle: "rgba(255, 255, 255, 0.12)",
  borderFocus: "#e8b86d",
  accentPrimary: "#e8b86d",
  accentMuted: "rgba(232, 184, 109, 0.18)",
  textPrimary: "#f2eee6",
  textSecondary: "#bdb8ad",
  textMuted: "#8f8a80",
  radiusSm: "4px",
  radiusMd: "4px",
  radiusLg: "4px",
  transitionFast: "120ms ease-out",
};

// Videos a story carries: YouTube embeds or links, and direct .mp4/.webm files. Mirrors electron/article.js.
const YT_RE = /(?:youtube(?:-nocookie)?\.com\/(?:embed\/|watch\?(?:[^"'\s&]*&)?v=|shorts\/)|youtu\.be\/)([A-Za-z0-9_-]{11})/g;
const VIDEO_FILE_RE = /https?:\/\/[^\s"'<>]+?\.(?:mp4|webm|m4v)(?:\?[^\s"'<>]*)?/gi;
function findVideos(text) {
  const s = String(text || "");
  const out = [];
  const seen = new Set();
  for (const m of s.matchAll(YT_RE)) if (!seen.has(m[1])) { seen.add(m[1]); out.push({ kind: "youtube", id: m[1] }); }
  for (const m of s.matchAll(VIDEO_FILE_RE)) {
    const url = m[0].replace(/&amp;/g, "&");
    if (!seen.has(url)) { seen.add(url); out.push({ kind: "file", url }); }
  }
  return out;
}

// The story's videos, played in the app: YouTube through the loopback embed page (electron/embed.js), files directly.
function ArticleVideos({ videos, embedPort, autoplay = false }) {
  if (!videos || !videos.length) return null;
  return (
    <div className="article-videos" style={{ display: "grid", gap: 12, marginBottom: 18 }}>
      {videos.slice(0, 3).map((v) => (
        <div key={v.id || v.url} style={{ position: "relative", aspectRatio: "16 / 9", background: "#000", borderRadius: TOKENS.radiusLg, overflow: "hidden" }}>
          {v.kind === "youtube" ? (
            <iframe
              title="Video"
              src={embedPort && embedPort !== "web" ? `http://localhost:${embedPort}/embed?id=${v.id}${autoplay ? "&autoplay=1" : ""}` : `https://www.youtube.com/embed/${v.id}?playsinline=1${autoplay ? "&autoplay=1" : ""}`}
              style={{ position: "absolute", inset: 0, width: "100%", height: "100%", border: 0 }}
              allow="accelerometer; autoplay; clipboard-write; encrypted-media; gyroscope; picture-in-picture"
              allowFullScreen
            />
          ) : (
            <video src={v.url} controls preload="metadata" playsInline style={{ position: "absolute", inset: 0, width: "100%", height: "100%" }} />
          )}
        </div>
      ))}
    </div>
  );
}

// Links open in the app's own browser sidebar, never an outside window.
const openInApp = (url) => {
  if (/^https?:\/\//i.test(String(url || ""))) window.dispatchEvent(new CustomEvent("nn:browse", { detail: { url } }));
};


// ─── LOW-CACHE BOUNDED LRU IMAGE STORE (MAX 60 KEYS, ZERO DISK BLOAT) ────────
class LowCacheImageLRU {
  constructor(limit = 60) {
    this.limit = limit;
    this.cache = new Map();
    this.inflight = new Map();
  }

  get(key) {
    if (!this.cache.has(key)) return undefined;
    const val = this.cache.get(key);
    this.cache.delete(key);
    this.cache.set(key, val);
    return val;
  }

  set(key, val) {
    if (this.cache.has(key)) this.cache.delete(key);
    else if (this.cache.size >= this.limit) {
      const oldestKey = this.cache.keys().next().value;
      this.cache.delete(oldestKey);
    }
    this.cache.set(key, val);
  }
}

const imageLRU = new LowCacheImageLRU(60);

async function resolveOgImageLowCache(articleUrl, parentSignal) {
  if (!articleUrl) return null;
  const cached = imageLRU.get(articleUrl);
  if (cached !== undefined) return cached;
  if (imageLRU.inflight.has(articleUrl)) return imageLRU.inflight.get(articleUrl);

  const promise = (async () => {
    const ctrl = new AbortController();
    const onParentAbort = () => ctrl.abort();
    if (parentSignal) parentSignal.addEventListener("abort", onParentAbort, { once: true });
    const timer = setTimeout(() => ctrl.abort(), 3800);

    try {
      const res = await fetch(articleUrl, {
        signal: ctrl.signal,
        headers: {
          Accept: "text/html",
          Range: "bytes=0-16384",
        },
        cache: "no-store",
      });

      if (!res.ok || !res.body) {
        imageLRU.set(articleUrl, null);
        return null;
      }

      const reader = res.body.getReader();
      const decoder = new TextDecoder("utf-8");
      let headChunk = "";
      let bytesRead = 0;

      while (bytesRead < 20480) {
        const { done, value } = await reader.read();
        if (done) break;
        bytesRead += value.byteLength;
        headChunk += decoder.decode(value, { stream: true });

        const ogMatch =
          headChunk.match(/<meta[^>]+property=["']og:image["'][^>]+content=["']([^"']+)["']/i) ||
          headChunk.match(/<meta[^>]+content=["']([^"']+)["'][^>]+property=["']og:image["']/i) ||
          headChunk.match(/<meta[^>]+name=["']twitter:image["'][^>]+content=["']([^"']+)["']/i);

        if (ogMatch && ogMatch[1]) {
          ctrl.abort();
          const optimized = optimizeLowCacheUrl(ogMatch[1], 640);
          imageLRU.set(articleUrl, optimized);
          return optimized;
        }

        if (headChunk.includes("</head>")) break;
      }

      ctrl.abort();
      imageLRU.set(articleUrl, null);
      return null;
    } catch {
      imageLRU.set(articleUrl, null);
      return null;
    } finally {
      clearTimeout(timer);
      if (parentSignal) parentSignal.removeEventListener("abort", onParentAbort);
      imageLRU.inflight.delete(articleUrl);
    }
  })();

  imageLRU.inflight.set(articleUrl, promise);
  return promise;
}

// ─── SANITIZERS & PARSERS ────────────────────────────────────────────────────
const HTML_ENTITIES = {
  "&amp;": "&",
  "&lt;": "<",
  "&gt;": ">",
  "&quot;": '"',
  "&#039;": "'",
  "&apos;": "'",
  "&#8217;": "’",
  "&#8216;": "‘",
  "&#8220;": "“",
  "&#8221;": "”",
  "&#8211;": "–",
  "&#8212;": "—",
  "&#8230;": "…",
  "&rsquo;": "’",
  "&lsquo;": "‘",
  "&rdquo;": "”",
  "&ldquo;": "“",
  "&nbsp;": " ",
};

function decodeEntities(str, pass = 0) {
  if (!str) return "";
  const out = decodeOnce(str);
  return pass < 1 && /&#?[a-zA-Z0-9]+;/.test(out) && out !== str ? decodeEntities(out, pass + 1) : out;
}

function decodeOnce(str) {
  return str
    .replace(/<!\[CDATA\[([\s\S]*?)\]\]>/gi, "$1")
    .replace(/&[#a-zA-Z0-9]+;/g, (match) => HTML_ENTITIES[match] || numericEntity(match));
}

// Any numeric entity (&#39; &#038; &#x2019;) the table does not list; feeds use them freely.
function numericEntity(match) {
  const m = /^&#(x?)([0-9a-fA-F]+);$/.exec(match);
  if (!m) return match;
  const code = parseInt(m[2], m[1] ? 16 : 10);
  try { return code > 0 && code <= 0x10ffff ? String.fromCodePoint(code) : match; } catch { return match; }
}

function cleanPlainText(str) {
  if (!str) return "";
  return decodeEntities(str)
    .replace(/<[^>]*>/g, " ")
    .replace(/\s+/g, " ")
    .trim();
}

function extractXmlImage(itemXml) {
  const mediaMatch = itemXml.match(/<media:(?:content|thumbnail)[^>]+url=["']([^"']+)["']/i);
  if (mediaMatch) return optimizeLowCacheUrl(mediaMatch[1], 640);

  const encMatch = itemXml.match(/<enclosure[^>]+url=["']([^"']+)["'][^>]+type=["']image\/[^"']+["']/i) ||
                   itemXml.match(/<enclosure[^>]+url=["']([^"']+\.(?:jpg|jpeg|png|webp))["']/i);
  if (encMatch) return optimizeLowCacheUrl(encMatch[1], 640);

  const imgMatch = itemXml.match(/<img[^>]+src=["']([^"']+)["']/i);
  if (imgMatch && !imgMatch[1].includes("1x1") && !imgMatch[1].includes("pixel")) {
    return optimizeLowCacheUrl(imgMatch[1], 640);
  }
  return null;
}

function estimateReadingMinutes(htmlOrText) {
  const words = cleanPlainText(htmlOrText).split(/\s+/).filter(Boolean).length;
  return Math.max(1, Math.round(words / 200));
}

function parseFeedXml(xml, feedMeta) {
  const items = [];
  const itemMatches = xml.match(/<item>[\s\S]*?<\/item>/gi) || [];

  for (const item of itemMatches) {
    const title = cleanPlainText((item.match(/<title>([\s\S]*?)<\/title>/i) || [])[1] || "");
    const link = cleanPlainText((item.match(/<link>([\s\S]*?)<\/link>/i) || [])[1] || "");
    const guid = cleanPlainText((item.match(/<guid[^>]*>([\s\S]*?)<\/guid>/i) || [])[1] || link);
    const dateRaw = cleanPlainText((item.match(/<pubDate>([\s\S]*?)<\/pubDate>/i) || [])[1] || "");
    const descRaw = (item.match(/<description>([\s\S]*?)<\/description>/i) || [])[1] || "";
    const encodedRaw = (item.match(/<content:encoded>([\s\S]*?)<\/content:encoded>/i) || [])[1] || "";
    const creator = cleanPlainText((item.match(/<dc:creator>([\s\S]*?)<\/dc:creator>/i) || [])[1] || "");

    const categories = [];
    const catMatches = item.matchAll(/<category[^>]*>([\s\S]*?)<\/category>/gi);
    for (const m of catMatches) {
      const c = cleanPlainText(m[1]);
      if (c && categories.length < 3) categories.push(c);
    }

    const descPlain = cleanPlainText(descRaw).replace(/The post .* first appeared on .*/i, "");
    const videos = findVideos(item);
    const contentHtml = sanitizeArticleHtml(encodedRaw || descRaw);
    const initialImage = extractXmlImage(item);
    if (initialImage && link) imageLRU.set(link, initialImage);

    let timestamp = 0;
    let timeFormatted = dateRaw;
    if (dateRaw) {
      const parsed = Date.parse(dateRaw);
      if (!Number.isNaN(parsed)) {
        timestamp = parsed;
        const diffMins = Math.floor((Date.now() - parsed) / 60000);
        if (diffMins >= 0 && diffMins < 60) {
          timeFormatted = `${diffMins}m ago`;
        } else if (diffMins >= 60 && diffMins < 1440) {
          timeFormatted = `${Math.floor(diffMins / 60)}h ago`;
        } else {
          timeFormatted = new Date(parsed).toLocaleDateString(undefined, {
            month: "short",
            day: "numeric",
          });
        }
      }
    }

      if (title && link) {
      const detectedLang = feedMeta.lang || detectTextLang(`${title} ${descPlain}`, feedMeta.name);
      items.push({
        id: `${feedMeta.id}::${guid || link}`,
        feedId: feedMeta.id,
        title,
        link,
        timeFormatted,
        timestamp,
        desc: descPlain,
        videos,
        creator,
        categories,
        source: feedMeta.name,
        badge: feedMeta.badge,
        accent: feedMeta.accent,
        imageUrl: initialImage,
        contentHtml,
        readMins: estimateReadingMinutes(encodedRaw || descRaw),
        lang: detectedLang,
        originalLang: detectedLang,
      });
    }
  }
  return items;
}

// ─── LAZY LOW-CACHE THUMBNAIL COMPONENT ──────────────────────────────────────
function LowCacheThumb({ article, size = "sm", priority = false }) {
  const [imgUrl, setImgUrl] = useState(() => article.imageUrl || imageLRU.get(article.link) || null);
  const [failed, setFailed] = useState(false);
  const hostRef = useRef(null);

  useEffect(() => {
    setFailed(false);
    const known = article.imageUrl || imageLRU.get(article.link);
    if (known !== undefined) {
      setImgUrl(known);
      return;
    }

    const ctrl = new AbortController();
    if (priority) {
      resolveOgImageLowCache(article.link, ctrl.signal).then((url) => {
        if (url) setImgUrl(url);
      });
      return () => ctrl.abort();
    }

    const el = hostRef.current;
    if (!el || typeof IntersectionObserver === "undefined") return;

    const obs = new IntersectionObserver(
      (entries) => {
        if (entries[0]?.isIntersecting) {
          obs.disconnect();
          resolveOgImageLowCache(article.link, ctrl.signal).then((url) => {
            if (url) setImgUrl(url);
          });
        }
      },
      { rootMargin: "120px" }
    );
    obs.observe(el);

    return () => {
      obs.disconnect();
      ctrl.abort();
    };
  }, [article.id, article.link, article.imageUrl, priority]);

  const isBanner = size === "lg";

  if (!imgUrl || failed) {
    if (isBanner) return null;
    return (
      <div
        ref={hostRef}
        aria-hidden="true"
        style={{
          width: 64,
          height: 64,
          borderRadius: TOKENS.radiusSm,
          background: `linear-gradient(135deg, ${article.accent}22, rgba(255,255,255,0.02))`,
          border: `1px solid ${article.accent}44`,
          display: "flex",
          alignItems: "center",
          justifyContent: "center",
          flexShrink: 0,
          color: article.accent,
          fontSize: 11,
          fontWeight: 800,
          letterSpacing: "0.5px",
        }}
      >
        {article.source.slice(0, 3).toUpperCase()}
      </div>
    );
  }

  return (
    <div
      ref={hostRef}
      style={
        isBanner
          ? {
              width: "100%",
              maxHeight: 360,
              borderRadius: TOKENS.radiusMd,
              overflow: "hidden",
              marginBottom: 22,
              background: "#08080c",
              border: `1px solid ${TOKENS.borderSubtle}`,
            }
          : {
              width: 64,
              height: 64,
              borderRadius: TOKENS.radiusSm,
              overflow: "hidden",
              flexShrink: 0,
              background: "#08080c",
              border: `1px solid ${TOKENS.borderSubtle}`,
            }
      }
    >
      <img
        src={optimizeLowCacheUrl(imgUrl, isBanner ? 920 : 160)}
        alt=""
        loading={priority ? "eager" : "lazy"}
        decoding="async"
        referrerPolicy="no-referrer"
        onError={() => setFailed(true)}
        style={{
          width: "100%",
          height: "100%",
          objectFit: "cover",
          display: "block",
        }}
      />
    </div>
  );
}

// ─── MAIN ELEVATED COMPONENT ─────────────────────────────────────────────────
export function NewsView() {
  const [activeFeed, setActiveFeed] = useState("all");
  const [menuOpen, setMenuOpen] = useState(false);
  // Titles the reader owns (NouGenFlix library) lift related stories; none found means no boost.
  const [rawTerms, setRawTerms] = useState([]);
  useEffect(() => {
    invoke("library_titles").then((r) => setRawTerms(extractTerms(r?.titles))).catch(() => {});
  }, []);
  useEffect(() => {
    const open = () => { if (currentArticleRef.current?.link) openInApp(currentArticleRef.current.link); };
    window.addEventListener("nn:browse-current", open);
    return () => window.removeEventListener("nn:browse-current", open);
  }, []);
  const currentArticleRef = useRef(null);
  const [articles, setArticles] = useState([]);
  const [feedHealth, setFeedHealth] = useState({});
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState("");

  const [lastUpdated, setLastUpdated] = useState(null);
  const [selectedArticleId, setSelectedArticleId] = useState(null);
  const [mobileReading, setMobileReading] = useState(false);
  const [speech, setSpeech] = useState(IDLE_SPEECH);
  const [prefs, setPrefs] = useState(() => loadSpeechPrefs());
  const [ollamaInfo, setOllamaInfo] = useState({ online: false, models: [], best: null });
  const [wireLang, setWireLang] = useState("orig");
  const [articleLangOverride, setArticleLangOverride] = useState(null);
  const [wireTranslatedMap, setWireTranslatedMap] = useState({});
  const [articleTranslation, setArticleTranslation] = useState(null);
  const [translatingWire, setTranslatingWire] = useState(false);
  const [translatingArticle, setTranslatingArticle] = useState(false);

  const abortRef = useRef(null);
  const canvasRef = useRef(null);
  const heroRef = useRef(null);
  const searchRef = useRef(null);
  const wireRef = useRef(null);
  const [helpOpen, setHelpOpen] = useState(false);
  const speechRef = useRef(null);
  const wireTransAbortRef = useRef(null);
  const artTransAbortRef = useRef(null);

  if (!speechRef.current) {
    speechRef.current = createSpeechController({ onChange: (st) => setSpeech(st) });
  }

  useEffect(() => () => speechRef.current?.stop(), []);

  useEffect(() => {
    let active = true;
    probeOllamaModels().then((info) => {
      if (!active) return;
      setOllamaInfo(info);
      if (info.online && info.best) {
        setPrefs((prev) => {
          const validModel = info.models.includes(prev.ollamaModel) ? prev.ollamaModel : info.best;
          if (prev.ollamaModel === validModel) return prev;
          const next = { ...prev, ollamaModel: validModel };
          saveSpeechPrefs(next);
          return next;
        });
      }
    });
    return () => {
      active = false;
    };
  }, []);

  const updatePrefs = useCallback((patch) => {
    setPrefs((prev) => {
      const next = { ...prev, ...patch };
      saveSpeechPrefs(next);
      return next;
    });
  }, []);

  const speaking = speech.status !== "idle";

  const fetchAllFeeds = useCallback(async () => {
    if (abortRef.current) abortRef.current.abort();
    const ctrl = new AbortController();
    abortRef.current = ctrl;

    setLoading(true);
    const activeTargets = FEEDS.filter((f) => f.url);
    const healthMap = {};

    try {
      const results = await Promise.allSettled(
        activeTargets.map(async (f) => {
          const t0 = performance.now();
          let xml = "";
          try {
            const proxied = await invoke("rss_raw_fetch", { feedUrl: f.url });
            if (typeof proxied === "string" && proxied.trim()) {
              xml = proxied;
            } else if (proxied && proxied.xml) {
              xml = proxied.xml;
            }
          } catch {
            // Fallback to direct fetch when running in standalone dev mode
          }
          if (!xml) {
            const res = await fetch(f.url, {
              signal: ctrl.signal,
              headers: { Accept: "application/rss+xml, application/xml, text/xml" },
            });
            if (!res.ok) throw new Error(`HTTP ${res.status}`);
            xml = await res.text();
          }
          const parsed = parseFeedXml(xml, f);
          healthMap[f.id] = { ok: true, count: parsed.length, ms: Math.round(performance.now() - t0) };
          return parsed;
        })
      );

      let aggregated = [];
      results.forEach((r, idx) => {
        const feedId = activeTargets[idx].id;
        if (r.status === "fulfilled") {
          aggregated = aggregated.concat(r.value);
        } else {
          healthMap[feedId] = { ok: false, error: r.reason?.message || "Failed" };
        }
      });

      // Stories the app can play come first, then newest first.
      aggregated.sort((a, b) => ((b.videos?.length ? 1 : 0) - (a.videos?.length ? 1 : 0)) || (b.timestamp || 0) - (a.timestamp || 0));
      setFeedHealth(healthMap);
      setArticles(aggregated);
      setSelectedArticleId((prev) => prev || aggregated[0]?.id || null);
      setLastUpdated(
        new Date().toLocaleTimeString([], { hour: "2-digit", minute: "2-digit", second: "2-digit" })
      );
    } catch (e) {
      if (e.name !== "AbortError") console.warn("Feed sync interrupted:", e);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    fetchAllFeeds();
    return () => abortRef.current?.abort();
  }, [fetchAllFeeds]);

  // Keep a stable list of articles matching the current feed + search query
  // A title that is also a common word would match half the wire: those terms are dropped against what is loaded.
  const libraryTerms = useMemo(() => pruneTerms(articles, rawTerms), [articles, rawTerms]);
  const withLibrary = useMemo(
    () => (libraryTerms.length ? articles.map((a) => ({ ...a, libraryHits: matchStory(a, libraryTerms) })) : articles),
    [articles, libraryTerms]
  );
  const searchFiltered = useMemo(() => {
    const q = search.trim().toLowerCase();
    const kept = withLibrary.filter((a) => {
      if (activeFeed === "library") return !!a.libraryHits?.length;
      if (activeFeed.startsWith("section:")) return FEEDS.find((f) => f.id === a.feedId)?.section === activeFeed.slice(8);
      if (activeFeed !== "all" && a.feedId !== activeFeed) return false;
      if (!q) return true;
      return (
        a.title.toLowerCase().includes(q) ||
        a.desc.toLowerCase().includes(q) ||
        a.creator.toLowerCase().includes(q) ||
        a.categories.some((c) => c.toLowerCase().includes(q))
      );
    });
    if (!libraryTerms.length || (activeFeed !== "all" && activeFeed !== "library" && !activeFeed.startsWith("section:"))) return kept;
    const now = Date.now();
    return kept.map((a) => [a, scoreStory(a, { now, terms: libraryTerms })]).sort((x, y) => y[1] - x[1]).map((x) => x[0]);
  }, [withLibrary, libraryTerms, activeFeed, search]);

  // Dynamically resolve wire headlines when wireLang is "ht", "en", or "es"
  useEffect(() => {
    wireTransAbortRef.current?.abort();
    if (wireLang === "orig" || !searchFiltered.length) {
      setTranslatingWire(false);
      return;
    }
    const ctrl = new AbortController();
    wireTransAbortRef.current = ctrl;
    setTranslatingWire(true);

    resolveWireHeadlinesTranslation(searchFiltered, wireLang, {
      ollamaModel: prefs.ollamaModel || ollamaInfo.best || "gemma4:e2b",
      signal: ctrl.signal,
      onBatch: (batchMap) => {
        if (ctrl.signal.aborted) return;
        setWireTranslatedMap((prev) => ({ ...prev, ...batchMap }));
      },
    }).finally(() => {
      if (!ctrl.signal.aborted) setTranslatingWire(false);
    });

    return () => ctrl.abort();
  }, [wireLang, searchFiltered, prefs.ollamaModel, ollamaInfo.best]);

  const filtered = useMemo(() => {
    if (wireLang === "orig") return searchFiltered;
    return searchFiltered.map((a) => wireTranslatedMap[`${a.id}::${wireLang}`] || a);
  }, [searchFiltered, wireLang, wireTranslatedMap]);

  const sectionCounts = useMemo(() => {
    const c = {};
    for (const a of withLibrary) {
      const sec = FEEDS.find((f) => f.id === a.feedId)?.section;
      if (sec) c[sec] = (c[sec] || 0) + 1;
    }
    return c;
  }, [withLibrary]);

  const rawCurrentArticle = useMemo(
    () => searchFiltered.find((a) => a.id === selectedArticleId) || searchFiltered[0] || null,
    [searchFiltered, selectedArticleId]
  );

  const effectiveArticleLang = articleLangOverride || wireLang;

  // The loopback page that carries YouTube players (the web shell embeds youtube.com directly).
  const [embedPort, setEmbedPort] = useState(null);
  useEffect(() => {
    invoke("embed_port").then(setEmbedPort).catch(() => setEmbedPort("web"));
  }, []);

  // The whole story, not the feed's summary. Fetched once per article; the article in the list is
  // replaced so translation, read-aloud and the video order all see the full text.
  const [fetchingFull, setFetchingFull] = useState(false);
  useEffect(() => {
    const a = rawCurrentArticle;
    if (!a || a.full || !a.link) return undefined;
    let live = true;
    setFetchingFull(true);
    invoke("article_fetch", { url: a.link })
      .then((got) => {
        if (!live) return;
        const html = got && got.html ? sanitizeArticleHtml(got.html) : "";
        const seen = new Set((a.videos || []).map((v) => v.id || v.url));
        const videos = [...(a.videos || []), ...((got && got.videos) || []).filter((v) => !seen.has(v.id || v.url))];
        setArticles((prev) => prev.map((x) => (x.id === a.id ? { ...x, full: true, videos, ...(html ? { contentHtml: html, readMins: estimateReadingMinutes(html) } : {}) } : x)));
      })
      .catch(() => { if (live) setArticles((prev) => prev.map((x) => (x.id === a.id ? { ...x, full: true } : x))); })
      .finally(() => { if (live) setFetchingFull(false); });
    return () => { live = false; };
  }, [rawCurrentArticle?.id, rawCurrentArticle?.full]);

  // Dynamically resolve full article translation (title, desc, body paragraphs)
  useEffect(() => {
    artTransAbortRef.current?.abort();
    if (!rawCurrentArticle || effectiveArticleLang === "orig") {
      setArticleTranslation(null);
      setTranslatingArticle(false);
      return;
    }
    const ctrl = new AbortController();
    artTransAbortRef.current = ctrl;
    setTranslatingArticle(true);

    resolveArticleTranslation(rawCurrentArticle, effectiveArticleLang, {
      ollamaModel: prefs.ollamaModel || ollamaInfo.best || "gemma4:e2b",
      signal: ctrl.signal,
    })
      .then((translated) => {
        if (ctrl.signal.aborted) return;
        setArticleTranslation(translated);
        setWireTranslatedMap((prev) => ({
          ...prev,
          [`${rawCurrentArticle.id}::${effectiveArticleLang}`]: translated,
        }));
      })
      .catch(() => {
        if (!ctrl.signal.aborted) setArticleTranslation(null);
      })
      .finally(() => {
        if (!ctrl.signal.aborted) setTranslatingArticle(false);
      });

    return () => ctrl.abort();
  }, [rawCurrentArticle?.id, effectiveArticleLang, prefs.ollamaModel, ollamaInfo.best]);

  const currentArticle = useMemo(() => {
    if (!rawCurrentArticle) return null;
    if (effectiveArticleLang === "orig") return rawCurrentArticle;
    if (articleTranslation && articleTranslation.id === rawCurrentArticle.id && articleTranslation.lang === effectiveArticleLang) {
      return articleTranslation;
    }
    return wireTranslatedMap[`${rawCurrentArticle.id}::${effectiveArticleLang}`] || rawCurrentArticle;
  }, [rawCurrentArticle, effectiveArticleLang, articleTranslation, wireTranslatedMap]);
  currentArticleRef.current = currentArticle;
  // Site furniture after the story becomes the footer carousel instead of part of the page.
  const tail = useMemo(() => splitTail(currentArticle?.contentHtml || ""), [currentArticle?.contentHtml]);

  useEffect(() => {
    if (canvasRef.current) canvasRef.current.scrollTop = 0;
  }, [rawCurrentArticle?.id]);

  // Keyboard: J/K or arrows step the wire, Enter opens the story, / searches, 1-9 pick a topic, Space and
  // Left/Right drive the hero, L listens, T cycles translation, R syncs, ? shows this list, Esc backs out.
  const readStory = useCallback((a) => {
    if (!a) return;
    speechRef.current?.stop();
    setArticleLangOverride(null);
    setSelectedArticleId(a.id);
    setMobileReading(true);
    wireRef.current?.scrollIntoView({ behavior: "smooth", block: "start" });
  }, []);
  const listenTo = useCallback((a) => {
    if (!a) return;
    const st = speechRef.current?.getState();
    if (st && st.mode === "single" && st.articleId === a.id && st.status !== "idle") speechRef.current.stop();
    else { setSelectedArticleId(a.id); speechRef.current?.speakArticle(a, prefs); }
  }, [prefs]);
  useEffect(() => {
    const onKey = (e) => {
      if (e.key === "Escape") {
        if (helpOpen) { e.preventDefault(); setHelpOpen(false); return; }
        if (speechRef.current?.getState().status !== "idle") { e.preventDefault(); speechRef.current.stop(); return; }
        if (document.activeElement?.tagName === "INPUT") { document.activeElement.blur(); return; }
        if (mobileReading) { e.preventDefault(); setMobileReading(false); }
        return;
      }
      if (["INPUT", "TEXTAREA", "SELECT"].includes(document.activeElement?.tagName)) return;
      if (e.ctrlKey || e.metaKey || e.altKey) return;
      if (e.key === "/") { e.preventDefault(); searchRef.current?.focus(); searchRef.current?.select(); return; }
      if (e.key === "m" || e.key === "M") { e.preventDefault(); setMenuOpen((o) => !o); return; }
      if (e.key === "?") { e.preventDefault(); setHelpOpen((o) => !o); return; }
      if (e.key === "r" || e.key === "R") { e.preventDefault(); fetchAllFeeds(); return; }
      if (/^[1-9]$/.test(e.key)) {
        const f = FEEDS[Number(e.key) - 1];
        if (f) { e.preventDefault(); setActiveFeed(f.id); }
        return;
      }
      if (e.key === "ArrowLeft") { e.preventDefault(); heroRef.current?.prev(); return; }
      if (e.key === "ArrowRight") { e.preventDefault(); heroRef.current?.next(); return; }
      if (e.key === " ") { e.preventDefault(); heroRef.current?.togglePlay(); return; }
      if (e.key === "t" || e.key === "T") {
        e.preventDefault();
        const i = TRANSLATE_LANGS.findIndex((l) => l.code === wireLang);
        setArticleLangOverride(null);
        setWireLang(TRANSLATE_LANGS[(i + 1) % TRANSLATE_LANGS.length].code);
        return;
      }
      if (!filtered.length) return;
      const idx = filtered.findIndex((a) => a.id === currentArticle?.id);
      if (e.key === "Enter") { e.preventDefault(); readStory(currentArticle || filtered[0]); return; }
      if (e.key === "l" || e.key === "L") { e.preventDefault(); listenTo(currentArticle || filtered[0]); return; }
      if (e.key === "ArrowDown" || e.key === "j" || e.key === "J") {
        e.preventDefault();
        const next = filtered[Math.min(filtered.length - 1, idx + 1)];
        if (next) { speechRef.current?.stop(); setSelectedArticleId(next.id); }
      } else if (e.key === "ArrowUp" || e.key === "k" || e.key === "K") {
        e.preventDefault();
        const prev = filtered[Math.max(0, idx - 1)];
        if (prev) { speechRef.current?.stop(); setSelectedArticleId(prev.id); }
      }
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [filtered, currentArticle?.id, helpOpen, mobileReading, wireLang, fetchAllFeeds, readStory, listenTo]);

  // The stories the hero can play: the ones with a video, newest first.
  const playable = useMemo(() => filtered.filter((a) => a.videos && a.videos.length).slice(0, 6), [filtered]);

  return (
    <div
      className={`news-view-container ${mobileReading ? "mobile-reading-active" : ""}`}
      style={{
        padding: "0 28px 12px",
        height: "100%",
        display: "flex",
        flexDirection: "column",
        color: TOKENS.textPrimary,
        boxSizing: "border-box",
        userSelect: "none",
        overflowY: "auto",
        position: "relative",
      }}
    >
      <NewsTree
        open={menuOpen}
        onClose={() => setMenuOpen(false)}
        feeds={FEEDS}
        counts={{ ...Object.fromEntries(FEEDS.map((f) => [f.id, f.id === "all" ? articles.length : articles.filter((a) => a.feedId === f.id).length])), library: withLibrary.filter((a) => a.libraryHits?.length).length }}
        activeFeed={activeFeed}
        onPick={setActiveFeed}
        wireLang={wireLang}
        langs={TRANSLATE_LANGS}
        onLang={(c) => { setArticleLangOverride(null); setWireLang(c); }}
      />
      {helpOpen && (
        <div className="news-help" role="dialog" aria-label="Keyboard shortcuts" onClick={() => setHelpOpen(false)}>
          <div className="news-help-panel" onClick={(e) => e.stopPropagation()}>
            <h3>Keyboard</h3>
            <dl>
              <dt>J / K, ↓ / ↑</dt><dd>Next / previous story in the wire</dd>
              <dt>Enter</dt><dd>Open the selected story</dd>
              <dt>← / →</dt><dd>Previous / next lead story</dd>
              <dt>Space</dt><dd>Play or stop the lead story's video</dd>
              <dt>L</dt><dd>Listen to the selected story (again to stop)</dd>
              <dt>T</dt><dd>Cycle translation: original, Kreyòl, English, Español</dd>
              <dt>1 – 9</dt><dd>Pick a topic</dd>
              <dt>M</dt><dd>Sources and settings menu</dd>
              <dt>/</dt><dd>Search the wire</dd>
              <dt>R</dt><dd>Sync feeds</dd>
              <dt>?</dt><dd>This list</dd>
              <dt>Esc</dt><dd>Stop reading aloud, leave the search box, or back out</dd>
            </dl>
            <p>Press Esc or click outside to close.</p>
          </div>
        </div>
      )}
      {speaking && (
        <div
          data-testid="speech-banner"
          style={{
            display: "flex",
            alignItems: "center",
            justifyContent: "space-between",
            gap: 12,
            background: "rgba(225,29,72,0.14)",
            border: "1px solid rgba(244,63,94,0.65)",
            borderRadius: 10,
            padding: "8px 14px",
            marginBottom: 12,
            fontSize: 12,
            flexShrink: 0,
          }}
        >
          <span style={{ minWidth: 0, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>
            <strong style={{ color: "#f43f5e" }}>
              {speech.status === "summarizing"
                ? `SUMMARIZING ${speech.index} OF ${speech.total}`
                : speech.mode === "briefing"
                  ? `BRIEFING ${speech.index} OF ${speech.total}`
                  : "READING"}
            </strong>{" "}
            {speech.title}{" "}
            {speech.voiceName && (
              <span style={{ color: "#9ca3af" }}>
                [{speech.voiceName} • {speech.lang?.toUpperCase()}]
              </span>
            )}
            {speech.notice && <span style={{ color: "#fbbf24" }}> ⚠ {speech.notice}</span>}
          </span>
          <span style={{ display: "flex", gap: 8, flexShrink: 0 }}>
            <button
              type="button"
              data-testid="speech-pause-btn"
              onClick={() => speechRef.current.togglePause()}
              style={{
                background: "rgba(255,255,255,0.1)",
                border: "none",
                color: "#fff",
                borderRadius: 4,
                padding: "3px 10px",
                fontSize: 11,
                cursor: "pointer",
              }}
            >
              {speech.status === "paused" ? "▶ Resume" : "⏸ Pause"}
            </button>
            <button
              type="button"
              data-testid="speech-stop-btn"
              onClick={() => speechRef.current.stop()}
              style={{
                background: "#f43f5e",
                border: "none",
                color: "#fff",
                borderRadius: 4,
                padding: "3px 10px",
                fontSize: 11,
                fontWeight: 600,
                cursor: "pointer",
              }}
            >
              ⏹ Stop (Esc)
            </button>
          </span>
        </div>
      )}

      {/* ─── TOP TELEMETRY & FILTER BAR ─── */}
      {!mobileReading && <Masthead storyCount={articles.length} libraryCount={withLibrary.filter((a) => a.libraryHits?.length).length} />}
      <div
        className="news-toolbar"
        style={{
          display: "flex",
          justifyContent: "space-between",
          alignItems: "center",
          gap: 14,
          marginBottom: 14,
          paddingBottom: 12,
          borderBottom: `1px solid ${TOKENS.borderSubtle}`,
          flexWrap: "wrap",
          flexShrink: 0,
        }}
      >
        <div className="news-filter-strip" style={{ display: "flex", alignItems: "center", gap: 8, flexWrap: "wrap" }}>
          <button type="button" className="nh-btn news-burger" aria-label="Sources and settings menu" aria-expanded={menuOpen} onClick={() => setMenuOpen(true)}>☰<kbd>M</kbd></button>
          <div style={{ display: "flex", alignItems: "center", gap: 8, marginRight: 4 }}>
            <span
              style={{
                width: 8,
                height: 8,
                borderRadius: "50%",
                background: loading ? "#f59e0b" : "#10b981",
                boxShadow: loading ? "0 0 8px #f59e0b" : "0 0 8px #10b981",
              }}
            />
            <h1 style={{ fontSize: 16, fontWeight: 700, margin: 0, letterSpacing: "-0.3px" }}>
              News Wire
            </h1>
          </div>

          <button
            type="button"
            data-testid="brief-me-btn"
            onClick={() => {
              if (speech.mode === "briefing" && speaking) speechRef.current.stop();
              else speechRef.current.startBriefing(filtered, prefs, (a) => setSelectedArticleId(a.id));
            }}
            style={{
              background: "rgba(16,185,129,0.16)",
              border: "1px solid rgba(16,185,129,0.45)",
              color: "#fff",
              borderRadius: TOKENS.radiusSm,
              padding: "5px 11px",
              fontSize: 12,
              fontWeight: 600,
              cursor: "pointer",
            }}
          >
            {speech.mode === "briefing" && speaking
              ? `⏹ Stop brief (${speech.index}/${speech.total})`
              : "🎙️ Brief me"}
          </button>

          {ollamaInfo.online && (
            <button
              type="button"
              data-testid="brief-mode-btn"
              title={
                prefs.briefMode === "ollama"
                  ? `Local Ollama radio summary (${prefs.ollamaModel || ollamaInfo.best})`
                  : "Quick 2-sentence lead brief (click to switch to local Ollama summary)"
              }
              onClick={() =>
                updatePrefs({
                  briefMode: prefs.briefMode === "ollama" ? "sentences" : "ollama",
                  ollamaModel: prefs.ollamaModel || ollamaInfo.best || "",
                })
              }
              style={{
                background:
                  prefs.briefMode === "ollama"
                    ? "rgba(168,85,247,0.22)"
                    : TOKENS.surfaceInteractive,
                border:
                  prefs.briefMode === "ollama"
                    ? "1px solid rgba(168,85,247,0.6)"
                    : `1px solid ${TOKENS.borderSubtle}`,
                color: prefs.briefMode === "ollama" ? "#e9d5ff" : TOKENS.textSecondary,
                borderRadius: TOKENS.radiusSm,
                padding: "5px 9px",
                fontSize: 11,
                fontWeight: 600,
                cursor: "pointer",
              }}
            >
              {prefs.briefMode === "ollama"
                ? `🧠 Local AI (${prefs.ollamaModel || ollamaInfo.best})`
                : "⚡ Quick Brief"}
            </button>
          )}


          <div className="news-chips">
          {FEEDS.map((f) => {
            const active = activeFeed === f.id;
            const health = feedHealth[f.id];
            const count =
              f.id === "all"
                ? articles.length
                : articles.filter((a) => a.feedId === f.id).length;

            return (
              <button
                key={f.id}
                type="button"
                onClick={() => {
                  speechRef.current?.stop();
                  setActiveFeed(f.id);
                  const first = articles.find((a) => f.id === "all" || a.feedId === f.id);
                  if (first) setSelectedArticleId(first.id);
                }}
                style={{
                  background: active ? TOKENS.accentMuted : TOKENS.surfaceInteractive,
                  color: active ? "#fff" : TOKENS.textSecondary,
                  border: active
                    ? `1px solid ${TOKENS.borderFocus}`
                    : `1px solid ${TOKENS.borderSubtle}`,
                  borderRadius: TOKENS.radiusSm,
                  padding: "5px 11px",
                  fontSize: 12,
                  fontWeight: active ? 600 : 500,
                  cursor: "pointer",
                  display: "flex",
                  alignItems: "center",
                  gap: 6,
                  transition: `all ${TOKENS.transitionFast}`,
                }}
              >
                <span>{f.icon}</span>
                <span>{f.name}</span>
                <span
                  style={{
                    fontSize: 10,
                    padding: "1px 5px",
                    borderRadius: 4,
                    background: active ? "rgba(244,63,94,0.25)" : "rgba(255,255,255,0.06)",
                    color: health?.ok === false ? "#f87171" : TOKENS.textSecondary,
                  }}
                >
                  {health?.ok === false ? "ERR" : count}
                </span>
              </button>
            );
          })}
          </div>
        </div>

        <BreakingTicker stories={withLibrary} terms={libraryTerms} onOpen={(a) => readStory(a)} />

        {/* Search, Dynamic Translate & Action Controls */}
        <div className="news-search-actions" style={{ display: "flex", gap: 8, alignItems: "center", flexWrap: "wrap" }}>
          <div
            data-testid="wire-translate-group"
            title="Dynamically translate all wire headlines & dispatches (Kreyòl ↔ English ↔ Español)"
            style={{
              display: "flex",
              alignItems: "center",
              gap: 3,
              background: "rgba(255,255,255,0.03)",
              border: `1px solid ${TOKENS.borderSubtle}`,
              borderRadius: TOKENS.radiusSm,
              padding: "2px 4px",
            }}
          >
            <span style={{ fontSize: 10, color: TOKENS.textMuted, padding: "0 4px", fontWeight: 700 }}>
              {translatingWire ? "⟳" : "🌐"}
            </span>
            {TRANSLATE_LANGS.map((l) => {
              const active = wireLang === l.code;
              return (
                <button
                  key={l.code}
                  type="button"
                  data-testid={`wire-lang-${l.code}`}
                  onClick={() => {
                    speechRef.current?.stop();
                    setArticleLangOverride(null);
                    setWireLang(l.code);
                  }}
                  style={{
                    background: active ? TOKENS.accentMuted : "transparent",
                    color: active ? "#fff" : TOKENS.textSecondary,
                    border: active ? `1px solid ${TOKENS.borderFocus}` : "1px solid transparent",
                    borderRadius: 4,
                    padding: "3px 7px",
                    fontSize: 11,
                    fontWeight: active ? 700 : 500,
                    cursor: "pointer",
                    display: "flex",
                    alignItems: "center",
                    gap: 4,
                  }}
                >
                  <span>{l.flag}</span>
                  <span>{l.label}</span>
                </button>
              );
            })}
          </div>

          <div className="news-search-box" style={{ position: "relative", width: 200 }}>
            <input
              ref={searchRef}
              type="text"
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              aria-label="Search the wire"
              placeholder="Search the wire  /"
              style={{
                width: "100%",
                background: "rgba(0,0,0,0.45)",
                border: `1px solid ${TOKENS.borderSubtle}`,
                borderRadius: TOKENS.radiusSm,
                padding: "6px 26px 6px 10px",
                fontSize: 12,
                color: TOKENS.textPrimary,
                outline: "none",
                boxSizing: "border-box",
              }}
            />
            {search && (
              <button
                type="button"
                onClick={() => setSearch("")}
                aria-label="Clear search"
                style={{
                  position: "absolute",
                  right: 6,
                  top: "50%",
                  transform: "translateY(-50%)",
                  background: "none",
                  border: "none",
                  color: TOKENS.textSecondary,
                  cursor: "pointer",
                  fontSize: 11,
                }}
              >
                ✕
              </button>
            )}
          </div>

          {lastUpdated && (
            <span style={{ fontSize: 11, color: TOKENS.textMuted, fontVariantNumeric: "tabular-nums" }}>
              {lastUpdated}
            </span>
          )}

          <button
            type="button"
            onClick={fetchAllFeeds}
            disabled={loading}
            title="Sync live RSS feeds"
            style={{
              background: TOKENS.surfaceInteractive,
              border: `1px solid ${TOKENS.borderSubtle}`,
              color: TOKENS.textPrimary,
              borderRadius: TOKENS.radiusSm,
              padding: "5px 10px",
              cursor: loading ? "wait" : "pointer",
              fontSize: 12,
            }}
          >
            {loading ? "Syncing…" : "↻ Sync"}
          </button>
        </div>
      </div>

      {playable.length > 0 && !mobileReading && (
        <NewsHero
          ref={heroRef}
          items={playable}
          embedPort={embedPort}
          listening={speaking && speech.mode === "single" && playable.some((a) => a.id === speech.articleId)}
          onRead={readStory}
          onListen={listenTo}
          onSource={openInApp}
        />
      )}

      {activeFeed === "all" && !search.trim() && !mobileReading && (
        <FrontSections
          stories={withLibrary}
          terms={libraryTerms}
          counts={sectionCounts}
          onRead={(s) => readStory(s)}
          onPickSection={(name) => setActiveFeed(`section:${name}`)}
        />
      )}

      {/* ─── MASTER-DETAIL SPLIT PANE (NON-POPUP) ─── */}
      <div
        ref={wireRef}
        className="news-split-pane"
        style={{
          flex: "0 0 auto",
          height: "calc(100% - 74px)",
          display: "grid",
          gridTemplateColumns: "400px 1fr",
          gap: 18,
          minHeight: 420,
          scrollMarginTop: 56,
        }}
      >
        {/* LEFT PANE: SCOPED DISPATCH STREAM */}
        <div
          className="news-feed-list"
          role="listbox"
          aria-label="News Dispatches"
          style={{
            overflowY: "auto",
            paddingRight: 6,
            display: "flex",
            flexDirection: "column",
            gap: 8,
          }}
        >
          {loading && articles.length === 0 ? (
            <div style={{ padding: 36, textAlign: "center", color: TOKENS.textSecondary, fontSize: 13 }}>
              Synchronizing live dispatches…
            </div>
          ) : filtered.length === 0 ? (
            <div style={{ padding: 36, textAlign: "center", color: TOKENS.textMuted, fontSize: 13 }}>
              No dispatches match filter criteria.
            </div>
          ) : (
            filtered.map((item) => {
              const isSelected = currentArticle?.id === item.id;
              return (
                <div
                  key={item.id}
                  role="option"
                  aria-selected={isSelected}
                  onClick={() => {
                    speechRef.current?.stop();
                    setArticleLangOverride(null);
                    setSelectedArticleId(item.id);
                    setMobileReading(true);
                  }}
                  style={{
                    background: isSelected ? TOKENS.surfaceSelected : TOKENS.surfaceInteractive,
                    border: isSelected
                      ? `1px solid ${TOKENS.borderFocus}`
                      : `1px solid ${TOKENS.borderSubtle}`,
                    borderRadius: TOKENS.radiusMd,
                    padding: "10px 12px",
                    cursor: "pointer",
                    display: "flex",
                    gap: 12,
                    alignItems: "flex-start",
                    transition: `background ${TOKENS.transitionFast}, border-color ${TOKENS.transitionFast}`,
                  }}
                >
                  <LowCacheThumb article={item} size="sm" />

                  <div style={{ flex: 1, minWidth: 0 }}>
                    <div
                      style={{
                        display: "flex",
                        justifyContent: "space-between",
                        alignItems: "center",
                        marginBottom: 4,
                        gap: 6,
                      }}
                    >
                      <span
                        style={{
                          fontSize: 10,
                          fontWeight: 700,
                          color: isSelected ? TOKENS.accentPrimary : item.accent,
                          textTransform: "uppercase",
                          letterSpacing: "0.4px",
                          whiteSpace: "nowrap",
                          overflow: "hidden",
                          textOverflow: "ellipsis",
                        }}
                      >
                        {item.source}
                      </span>
                      <span
                        style={{
                          fontSize: 11,
                          color: TOKENS.textMuted,
                          flexShrink: 0,
                          fontVariantNumeric: "tabular-nums",
                        }}
                      >
                        {item.timeFormatted}
                      </span>
                    </div>

                    <h4
                      style={{
                        fontSize: 13.5,
                        fontWeight: 600,
                        margin: "0 0 4px",
                        lineHeight: 1.32,
                        color: isSelected ? "#ffffff" : TOKENS.textPrimary,
                        display: "-webkit-box",
                        WebkitLineClamp: 2,
                        WebkitBoxOrient: "vertical",
                        overflow: "hidden",
                      }}
                    >
                      {item.title}
                    </h4>

                    <div style={{ display: "flex", alignItems: "center", gap: 8, fontSize: 11, color: TOKENS.textMuted }}>
                      {item.videos?.length ? <span style={{ color: item.accent, fontWeight: 700 }}>▶ Video</span> : null}
                      {item.libraryHits?.length ? <span title={item.libraryHits.join(", ")} style={{ color: TOKENS.accentPrimary, fontWeight: 700 }}>♥ In your library</span> : null}
                      <span>{item.readMins} min read</span>
                      {item.categories[0] && (
                        <>
                          <span>•</span>
                          <span style={{ color: TOKENS.textSecondary }}>{item.categories[0]}</span>
                        </>
                      )}
                    </div>
                  </div>
                </div>
              );
            })
          )}
        </div>

        {/* RIGHT PANE: INLINE EDITORIAL READING CANVAS */}
        <div
          ref={canvasRef}
          className="news-article-canvas"
          style={{
            background: TOKENS.surfaceElevated,
            border: `1px solid ${TOKENS.borderSubtle}`,
            borderRadius: TOKENS.radiusLg,
            overflowY: "auto",
            padding: "28px 40px",
            userSelect: "text",
          }}
        >
          {currentArticle ? (
            <article style={{ maxWidth: 740, margin: "0 auto" }}>
              <button
                type="button"
                className="news-mobile-back"
                onClick={() => setMobileReading(false)}
              >
                ← Back to Wire
              </button>
              {/* Article Metadata Header */}
              <div
                style={{
                  display: "flex",
                  justifyContent: "space-between",
                  alignItems: "center",
                  marginBottom: 14,
                  flexWrap: "wrap",
                  gap: 10,
                }}
              >
                <div style={{ display: "flex", alignItems: "center", gap: 8, flexWrap: "wrap" }}>
                  <span
                    style={{
                      background: `${currentArticle.accent}22`,
                      color: currentArticle.accent,
                      border: `1px solid ${currentArticle.accent}55`,
                      borderRadius: TOKENS.radiusSm,
                      padding: "3px 8px",
                      fontSize: 11,
                      fontWeight: 700,
                      textTransform: "uppercase",
                    }}
                  >
                    {currentArticle.source}
                  </span>
                  {currentArticle.isTranslated && (
                    <span
                      data-testid="translated-badge"
                      style={{
                        background: "rgba(16, 185, 129, 0.16)",
                        color: "#34d399",
                        border: "1px solid rgba(16, 185, 129, 0.45)",
                        borderRadius: TOKENS.radiusSm,
                        padding: "2px 7px",
                        fontSize: 10.5,
                        fontWeight: 700,
                        letterSpacing: "0.3px",
                      }}
                    >
                      {(currentArticle.translatedFrom || currentArticle.originalLang || "AUTO").toUpperCase()} →{" "}
                      {effectiveArticleLang.toUpperCase()}
                    </span>
                  )}
                  {translatingArticle && (
                    <span
                      data-testid="translating-indicator"
                      style={{ fontSize: 11, color: "#fbbf24", fontWeight: 600 }}
                    >
                      ⟳ Translating…
                    </span>
                  )}
                  <span style={{ fontSize: 12, color: TOKENS.textSecondary }}>
                    {currentArticle.timeFormatted}
                  </span>
                  <span style={{ fontSize: 12, color: TOKENS.textMuted }}>
                    • {currentArticle.readMins} min read
                  </span>
                </div>

                <div style={{ display: "flex", alignItems: "center", gap: 8, flexWrap: "wrap" }}>
                  <div
                    data-testid="article-translate-group"
                    title="Translate this article between Kreyòl, English, and Español"
                    style={{
                      display: "flex",
                      alignItems: "center",
                      gap: 2,
                      background: "rgba(255,255,255,0.03)",
                      border: `1px solid ${TOKENS.borderSubtle}`,
                      borderRadius: TOKENS.radiusSm,
                      padding: "2px 3px",
                    }}
                  >
                    {TRANSLATE_LANGS.map((l) => {
                      const active = effectiveArticleLang === l.code;
                      return (
                        <button
                          key={l.code}
                          type="button"
                          data-testid={`article-lang-${l.code}`}
                          onClick={() => {
                            speechRef.current?.stop();
                            setArticleLangOverride(l.code);
                          }}
                          style={{
                            background: active ? TOKENS.accentMuted : "transparent",
                            color: active ? "#fff" : TOKENS.textSecondary,
                            border: active ? `1px solid ${TOKENS.borderFocus}` : "1px solid transparent",
                            borderRadius: 4,
                            padding: "2px 6px",
                            fontSize: 11,
                            fontWeight: active ? 700 : 500,
                            cursor: "pointer",
                          }}
                        >
                          {l.flag} {l.short}
                        </button>
                      );
                    })}
                  </div>

                  <button
                    type="button"
                    data-testid="listen-article-btn"
                    onClick={() => {
                      if (speech.mode === "single" && speech.articleId === currentArticle.id && speaking) {
                        speechRef.current.stop();
                      } else {
                        speechRef.current.speakArticle(currentArticle, prefs);
                      }
                    }}
                    style={{
                      background: "rgba(244,63,94,0.16)",
                      border: "1px solid rgba(244,63,94,0.45)",
                      color: "#fff",
                      borderRadius: TOKENS.radiusSm,
                      padding: "4px 10px",
                      fontSize: 12,
                      fontWeight: 600,
                      cursor: "pointer",
                    }}
                  >
                    {speech.mode === "single" && speech.articleId === currentArticle.id && speaking
                      ? "⏹ Stop"
                      : `🔊 Listen (${articleLang(currentArticle).toUpperCase()})`}
                  </button>

                  <a
                    href={currentArticle.link}
                    onClick={(e) => { e.preventDefault(); openInApp(currentArticle.link); }}
                    style={{
                      color: TOKENS.textSecondary,
                      fontSize: 12,
                      textDecoration: "none",
                      padding: "4px 10px",
                      borderRadius: TOKENS.radiusSm,
                      border: `1px solid ${TOKENS.borderSubtle}`,
                      background: TOKENS.surfaceInteractive,
                    }}
                  >
                    Read full article
                  </a>
                </div>
              </div>

              {/* Headline */}
              <h1
                style={{
                  fontSize: 26,
                  fontWeight: 700,
                  lineHeight: 1.28,
                  margin: "0 0 12px",
                  color: "#ffffff",
                  letterSpacing: "-0.4px",
                }}
              >
                {currentArticle.title}
              </h1>

              {/* Author & Tags */}
              {(currentArticle.creator || currentArticle.categories.length > 0) && (
                <div
                  style={{
                    display: "flex",
                    alignItems: "center",
                    gap: 10,
                    fontSize: 13,
                    color: TOKENS.textSecondary,
                    marginBottom: 20,
                    flexWrap: "wrap",
                  }}
                >
                  {currentArticle.creator && (
                    <span>
                      By <strong style={{ color: TOKENS.textPrimary }}>{currentArticle.creator}</strong>
                    </span>
                  )}
                  {currentArticle.categories.map((cat) => (
                    <span
                      key={cat}
                      style={{
                        fontSize: 11,
                        padding: "2px 7px",
                        borderRadius: 4,
                        background: "rgba(255,255,255,0.05)",
                        color: TOKENS.textSecondary,
                      }}
                    >
                      #{cat}
                    </span>
                  ))}
                </div>
              )}

              {currentArticle.videos?.length ? (
                <ArticleVideos videos={currentArticle.videos} embedPort={embedPort} autoplay={loadAutoplay()} />
              ) : (
                /* Priority Hero Image (Low-Cache Edge Resized or Head-Range Scraped) */
                <LowCacheThumb article={currentArticle} size="lg" priority={true} />
              )}
              {fetchingFull && !currentArticle.full ? (
                <p style={{ fontSize: 12, color: TOKENS.textMuted, margin: "0 0 10px" }}>Loading the full story…</p>
              ) : null}

              {/* Sanitized Full Native Body */}
              <div
                className="article-native-content"
                style={{
                  fontSize: 15.5,
                  lineHeight: 1.78,
                  color: "#d1d5db",
                }}
                onClick={(e) => {
                  const a = e.target.closest && e.target.closest("a[href]");
                  if (!a) return;
                  e.preventDefault();
                  openInApp(a.getAttribute("href"));
                }}
                dangerouslySetInnerHTML={{ __html: tail.body }}
              />
              <div className="news-reader-bar">
                <button type="button" className="nh-btn" onClick={() => listenTo(currentArticle)}>
                  {speaking && speech.mode === "single" && speech.articleId === currentArticle.id ? "Stop listening" : "Listen"} <kbd>L</kbd>
                </button>
                <button type="button" className="nh-btn" onClick={() => {
                  const i = TRANSLATE_LANGS.findIndex((l) => l.code === effectiveArticleLang);
                  setArticleLangOverride(TRANSLATE_LANGS[(i + 1) % TRANSLATE_LANGS.length].code);
                }}>Translate <kbd>T</kbd></button>
                <button type="button" className="nh-btn" onClick={() => openInApp(currentArticle.link)}>Open source in app</button>
                <span className="spacer" />
                {tail.items.length ? <TailCarousel items={tail.items} onOpen={openInApp} /> : <span className="mono">J next · K prev · Esc back</span>}
              </div>
            </article>
          ) : (
            <div
              style={{
                height: "100%",
                display: "flex",
                alignItems: "center",
                justifyContent: "center",
                color: TOKENS.textMuted,
                fontSize: 14,
              }}
            >
              Select a dispatch from the left wire to read inline.
            </div>
          )}
        </div>
      </div>

      <div className="news-keys" aria-label="Keyboard shortcuts">
        <span><b>J/K</b> next/prev</span>
        <span><b>Enter</b> open</span>
        <span><b>←/→</b> lead story</span>
        <span><b>Space</b> play</span>
        <span><b>L</b> listen</span>
        <span><b>T</b> translate</span>
        <span><b>1–9</b> topic</span>
        <span><b>/</b> search</span>
        <span><b>R</b> sync</span>
        <span className="spacer" />
        <button type="button" onClick={() => setHelpOpen(true)}>? help</button>
      </div>
    </div>
  );
}
