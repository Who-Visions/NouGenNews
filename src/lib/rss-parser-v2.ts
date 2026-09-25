import * as cheerio from 'cheerio';

import { NewsArticle, getArticleId, normalizeUrl } from './news-shared';

/**
 * NouGen Intelligence — RSS Enrichment Pipeline v3
 * Who Visions LLC
 *
 * Dual-pattern WordPress RSS parser with:
 *  - Full defensive input validation at every boundary
 *  - Per-item error isolation (one bad item never kills the batch)
 *  - Retry logic with exponential back-off for LLM + scraper calls
 *  - Strict TypeScript types; zero implicit any escapes
 *  - Structured internal logging (replaceable with your logger)
 *  - Content length guards against runaway regex on huge payloads
 *  - All regex instances compiled once at module level
 */

// ─── Constants ────────────────────────────────────────────────────────────────

const MAX_CONTENT_LENGTH = 2_000_000; // 2 MB — refuse to parse beyond this
const MAX_MARKDOWN_LENGTH = 16_000;   // chars; matches original cap
const MIN_VALID_IMAGE_URL_LEN = 20;
const MIN_FIGCAPTION_LEN = 5;
const THIN_CONTENT_WORD_THRESHOLD = 80;
const FULL_CONTENT_WORD_THRESHOLD = 200;
const PREFERRED_IMAGE_WIDTH = 1260;
const MAX_GALLERY_ITEMS = 20;
const MAX_IMAGE_CAPTIONS = 20;
const DEFAULT_CONCURRENCY = 3;
const MAX_LLM_RETRIES = 2;
const MAX_SCRAPER_RETRIES = 2;
const RETRY_BASE_DELAY_MS = 800;

// ─── Pre-compiled Regex ───────────────────────────────────────────────────────

const RE_STYLE_TAG = /<style[^>]*>[\s\S]*?<\/style>/gi;
const RE_SCRIPT_TAG = /<script[^>]*>[\s\S]*?<\/script>/gi;
const RE_SVG_TAG = /<svg[^>]*>[\s\S]*?<\/svg>/gi;
const RE_WP_EMBED = /<figure[^>]*class="[^"]*wp-block-embed[^"]*"[^>]*>[\s\S]*?<\/figure>/gi;
const RE_LIGHTBOX = /<button[^>]*class="lightbox-trigger"[^>]*>[\s\S]*?<\/button>/gi;
const RE_IMG_TAG = /<img[^>]+>/gi;
const RE_IFRAME_TAG = /<iframe[^>]+src="([^"]+)"[^>]*>/gi;
const RE_FIGCAPTION = /<figcaption[^>]*>([\s\S]*?)<\/figcaption>/gi;
const RE_A_TAG = /<a[^>]*>([^<]*)<\/a>/gi;
const RE_H1 = /<h1[^>]*>/gi; const RE_H2 = /<h2[^>]*>/gi;
const RE_H3 = /<h3[^>]*>/gi; const RE_H4 = /<h4[^>]*>/gi;
const RE_CLOSE_H = /<\/h[1-6]>/gi;
const RE_CLOSE_P = /<\/p>/gi; const RE_OPEN_P = /<p[^>]*>/gi;
const RE_BR = /<br\s*\/?>/gi;
const RE_OPEN_UL = /<ul[^>]*>/gi; const RE_CLOSE_UL = /<\/ul>/gi;
const RE_OPEN_OL = /<ol[^>]*>/gi; const RE_CLOSE_OL = /<\/ol>/gi;
const RE_OPEN_LI = /<li[^>]*>/gi; const RE_CLOSE_LI = /<\/li>/gi;
const RE_OPEN_BQ = /<blockquote[^>]*>/gi; const RE_CLOSE_BQ = /<\/blockquote>/gi;
const RE_STRONG = /<(strong|b)[^>]*>/gi; const RE_CLOSE_STRONG = /<\/(strong|b)>/gi;
const RE_EM = /<(em|i)[^>]*>/gi; const RE_CLOSE_EM = /<\/(em|i)>/gi;
const RE_OPEN_FC = /<figcaption[^>]*>/gi; const RE_CLOSE_FC = /<\/figcaption>/gi;
const RE_ANY_TAG = /<[^>]+>/g;
const RE_OPEN_DIV = /<\/div>/gi;
const RE_HTML_NBSP = /&nbsp;/gi;
const RE_HTML_AMP = /&amp;/gi;
const RE_HTML_LT = /&lt;/gi;
const RE_HTML_GT = /&gt;/gi;
const RE_HTML_QUOT = /&quot;/gi;
const RE_HTML_LDQUO = /&#8220;/gi;
const RE_HTML_RDQUO = /&#8221;/gi;
const RE_HTML_LSQUO = /&#8216;/gi;
const RE_HTML_RSQUO = /&#8217;/gi;
const RE_HTML_HELLIP = /&#8230;/gi;
const RE_HTML_NUMREF = /&#\d+;/g;
const RE_EXCESS_NEWLINES = /\n{3,}/g;
const RE_EXCESS_SPACES = / {2,}/g;
const RE_EXCESS_HSPACE = /[ \t]{2,}/g;
const RE_NYT_BY = /nytimes\.com\/by\//i;
const RE_YOUTUBE_EMBED = /youtube\.com\/embed\/([a-zA-Z0-9_-]+)/i;
const RE_VIMEO_EMBED = /player\.vimeo\.com\/video\/(\d+)/i;
const RE_MEDIA_AUDIO = /omny\.fm|spotify\.com|soundcloud\.com/i;
const RE_WP_VERSION = /wordpress\.org\/\?v=([\d.]+)/i;
const RE_IMG_SRCSET = /\bsrcset="([^"]+)"/i;
const RE_IMG_SRC = /\bsrc="([^"]+)"/i;
const RE_FEATURED_IMG = /<img[^>]+class="[^"]*webfeedsFeaturedVisual[^"]*"[^>]*>/i;
const RE_FIRST_IMG = /<img[^>]+>/i;
const RE_SRCSET_ATTR = /srcset="([^"]+)"/i;
const RE_SRC_ATTR = /\ssrc="([^"]+)"/i;
const RE_PERCENT_ENCODED = /%[0-9a-fA-F]{2}/;

// ─── Logger ───────────────────────────────────────────────────────────────────

type LogLevel = 'debug' | 'info' | 'warn' | 'error';

const logger = {
    debug: (msg: string, meta?: unknown) => process.env.RSS_DEBUG && console.debug(`[RSS:debug] ${msg}`, meta ?? ''),
    info: (msg: string, meta?: unknown) => console.info(`[RSS:info]  ${msg}`, meta ?? ''),
    warn: (msg: string, meta?: unknown) => console.warn(`[RSS:warn]  ${msg}`, meta ?? ''),
    error: (msg: string, meta?: unknown) => console.error(`[RSS:error] ${msg}`, meta ?? ''),
};

// ─── Types ────────────────────────────────────────────────────────────────────

export interface RawRSSItem {
    // Core fields
    title?: string;
    link?: string;
    pubDate?: string;
    modified?: string;           // dcterms:modified
    description?: string;
    contentEncoded?: string;     // content:encoded
    creator?: string;            // dc:creator
    guid?: string;
    commentsUrl?: string;
    postId?: string;             // com-wordpress:feed-additions post-id

    // Pattern A (NY Post) — media namespace
    enclosureUrl?: string;       // <enclosure url="...">
    enclosureType?: string;
    mediaContents?: Array<{
        url: string;
        medium?: string;
        type?: string;
        title?: string;
        caption?: string;
        description?: string;
        credit?: string;
        width?: string;
        height?: string;
        fileSize?: string;
        attributes?: Record<string, string>;
    }>;
    mediaThumbnails?: Array<{
        url: string;
        width?: string;
        height?: string;
        attributes?: Record<string, string>;
    }>;
    slashComments?: number;

    // Pattern B (GeekWire) — HTML-extracted fields
    categories?: string[];
    heroImageUrl?: string | null;
    contentImages?: string[];
    videoLinks?: string[];
    figcaptions?: string[];

    // Auto-detected pattern
    feedPattern?: 'A' | 'B';

    // Exhaustive: capture EVERYTHING
    additionalMetadata?: Record<string, any>;
}

export interface RawRSSChannel {
    title?: string;
    link?: string;
    description?: string;
    language?: string;
    lastBuildDate?: string;
    updatePeriod?: string;       // sy:updatePeriod
    updateFrequency?: number;    // sy:updateFrequency
    generator?: string;

    // webfeeds namespace
    webfeedsLogo?: string;
    webfeedsIcon?: string;
    webfeedsCoverImage?: string;
    webfeedsAccentColor?: string;

    items: RawRSSItem[];
}

export type ArticleCategory =
    | 'Technology' | 'Business' | 'Startups' | 'Funding' | 'AI/ML'
    | 'Science' | 'Health' | 'Politics' | 'Sports' | 'Entertainment'
    | 'Education' | 'Real Estate' | 'Finance' | 'Policy' | 'Other';

export const ALLOWED_CATEGORIES = new Set<ArticleCategory>([
    'Technology', 'Business', 'Startups', 'Funding', 'AI/ML',
    'Science', 'Health', 'Politics', 'Sports', 'Entertainment',
    'Education', 'Real Estate', 'Finance', 'Policy', 'Other',
]);

export interface EnrichedArticle {
    id: string;
    source_url: string;
    author_url?: string;
    post_id?: string;

    title: string;
    ai_title: string | null;
    ai_summary: string | null;
    ai_content: string | null;

    category: ArticleCategory[];
    feed_categories?: string[];

    hero_image: string | null;
    gallery: string[];
    video_links: string[];
    thumbnails?: string[];

    author: string[];
    pub_date: string | null;
    modified_date: string | null;
    language: string;
    feed_pattern: 'A' | 'B';
    scrape_needed: boolean;
    source_id: string;
    source_name: string;

    analysis: {
        sentiment: 'positive' | 'negative' | 'neutral' | 'mixed';
        key_points: string[];
        implications?: string;
    } | null;

    music_metadata: null;
}

export interface RawHighFidelityArticle {
    id: string;
    source_url: string;
    author_url?: string;
    post_id?: string;
    guid?: string;

    title: string;
    description: string | null;
    content: string | null;

    category: string[];
    feed_categories?: string[];

    hero_image: string | null;
    gallery: string[];
    video_links: string[];
    thumbnails?: string[];

    author: string[];
    pub_date: string | null;
    modified_date: string | null;
    language: string;
    feed_pattern: 'A' | 'B';
    scrape_needed: boolean;
    source_id: string;
    source_name: string;

    comments_url?: string;
    comments_count?: number;
    generator?: string;
    media?: NewsMedia[];
    additional_metadata?: Record<string, any>;
}

// ─── Utility: safe sleep ──────────────────────────────────────────────────────

function sleep(ms: number): Promise<void> {
    return new Promise(resolve => setTimeout(resolve, ms));
}

// ─── Utility: retry with exponential back-off ─────────────────────────────────

async function withRetry<T>(
    fn: () => Promise<T>,
    maxRetries: number,
    label: string
): Promise<T> {
    let lastError: unknown;
    for (let attempt = 0; attempt <= maxRetries; attempt++) {
        try {
            return await fn();
        } catch (err) {
            lastError = err;
            if (attempt < maxRetries) {
                const delay = RETRY_BASE_DELAY_MS * Math.pow(2, attempt);
                logger.warn(`[${label}] Attempt ${attempt + 1} failed — retrying in ${delay}ms`, err);
                await sleep(delay);
            }
        }
    }
    throw lastError;
}

// ─── RSS Parser ───────────────────────────────────────────────────────────────

/**
 * Parse a WordPress RSS XML string into a structured channel + items.
 * Handles Pattern A (NY Post / media namespace) and Pattern B (GeekWire / full HTML).
 *
 * Throws only on completely unrecoverable input (empty string, no <channel>).
 * Individual item parse failures are caught and skipped.
 */
export function parseWordPressRSS(xmlText: string): RawRSSChannel {
    if (!xmlText || typeof xmlText !== 'string') {
        throw new Error('parseWordPressRSS: xmlText must be a non-empty string');
    }
    if (xmlText.length > MAX_CONTENT_LENGTH) {
        throw new Error(`parseWordPressRSS: feed exceeds maximum size (${xmlText.length} bytes)`);
    }

    const $ = cheerio.load(xmlText, { xmlMode: true });
    const channel = $('channel');
    if (!channel.length) {
        throw new Error('parseWordPressRSS: no <channel> element found in RSS feed');
    }

    const getText = (el: cheerio.Cheerio<any>, selector: string): string | undefined => {
        const text = el.find(selector).first().text().trim();
        return text.length > 0 ? text : undefined;
    };

    const webfeedsCoverImage = channel.find('webfeeds\\:cover, cover').attr('image') ?? undefined;

    const rawChannel: RawRSSChannel = {
        title: getText(channel, 'title'),
        link: getText(channel, 'link'),
        description: getText(channel, 'description'),
        language: getText(channel, 'language'),
        lastBuildDate: getText(channel, 'lastBuildDate'),
        updatePeriod: getText(channel, 'sy\\:updatePeriod, updatePeriod')?.trim(),
        updateFrequency: parseInt(getText(channel, 'sy\\:updateFrequency, updateFrequency') ?? '1', 10) || 1,
        generator: extractGeneratorName(getText(channel, 'generator')),
        webfeedsLogo: getText(channel, 'webfeeds\\:logo, logo'),
        webfeedsIcon: getText(channel, 'webfeeds\\:icon, icon'),
        webfeedsCoverImage,
        webfeedsAccentColor: getText(channel, 'webfeeds\\:accentColor, accentColor'),
        items: [],
    };

    channel.find('item').each((index, itemEl) => {
        try {
            rawChannel.items.push(parseItem($(itemEl), $));
        } catch (err) {
            logger.warn(`parseWordPressRSS: skipping item at index ${index} due to parse error`, err);
        }
    });

    logger.info(`parseWordPressRSS: parsed ${rawChannel.items.length} items from "${rawChannel.title ?? 'unknown'}"`);
    return rawChannel;
}

function parseItem(item: cheerio.Cheerio<any>, $: cheerio.CheerioAPI): RawRSSItem {
    const getText = (selector: string): string | undefined => {
        const text = item.find(selector).first().text().trim();
        return text.length > 0 ? text : undefined;
    };

    const description = getText('description');
    const contentEncoded = item.find('content\\:encoded, encoded').text().trim() || undefined;

    // ── Pattern A: media:content ─────────────────────────────────────────────
    const mediaContents: NonNullable<RawRSSItem['mediaContents']> = [];
    item.find('media\\:content, content').each((_, el) => {
        const $el = $(el);
        const rawUrl = $el.attr('url') ?? '';
        const url = decodeNYPostUrl(rawUrl);
        if (url) {
            mediaContents.push({
                url,
                medium: $el.attr('medium') ?? undefined,
                type: $el.attr('type') ?? undefined,
                title: $el.find('media\\:title, title').text().trim() || undefined,
                caption: $el.find('media\\:caption, caption').text().trim() || undefined,
                description: $el.find('media\\:description, description').text().trim() || undefined,
                credit: $el.find('media\\:credit, credit').text().trim() || undefined,
                width: $el.attr('width') ?? undefined,
                height: $el.attr('height') ?? undefined,
                fileSize: $el.attr('fileSize') ?? undefined,
                attributes: $el.attr() as Record<string, string>
            });
        }
    });

    // ── Non-standard: <image> tag (CBS News etc.) ───────────────────────────
    const itemImage = getText('image');
    if (itemImage && !mediaContents.some(m => m.url === itemImage)) {
        mediaContents.push({ url: itemImage, medium: 'image' });
    }

    const mediaThumbnails: NonNullable<RawRSSItem['mediaThumbnails']> = [];
    item.find('media\\:thumbnail, thumbnail').each((_, el) => {
        const $el = $(el);
        const url = decodeNYPostUrl($el.attr('url') ?? '');
        if (url && isValidImageUrl(url)) {
            mediaThumbnails.push({
                url,
                width: $el.attr('width') ?? undefined,
                height: $el.attr('height') ?? undefined,
            });
        }
    });

    // ── Pattern A: enclosure ─────────────────────────────────────────────────
    const enclosureEl = item.find('enclosure');
    const enclosureUrl = enclosureEl.length
        ? decodeNYPostUrl(enclosureEl.attr('url') ?? '') || undefined
        : undefined;
    const enclosureType = enclosureEl.attr('type') ?? undefined;

    // ── Pattern B: categories ────────────────────────────────────────────────
    const categories: string[] = [];
    item.find('category').each((_, el) => {
        const cat = $(el).text().trim();
        if (cat) categories.push(cat);
    });
    // ── Auto-detect feed pattern ─────────────────────────────────────────────
    const hasMediaContent = mediaContents.length > 0;
    const contentWordCount = countWords(stripHtml(contentEncoded ?? ''));
    const isFullContent = !hasMediaContent && contentWordCount > FULL_CONTENT_WORD_THRESHOLD;
    const feedPattern: 'A' | 'B' = hasMediaContent ? 'A' : (isFullContent ? 'B' : 'A');

    // ── Pattern B: HTML extraction ───────────────────────────────────────────
    let heroImageUrl: string | null = null;
    let contentImages: string[] = [];
    let videoLinks: string[] = [];
    let figcaptions: string[] = [];

    if (feedPattern === 'B') {
        heroImageUrl = extractFeaturedImage(description ?? '');
        contentImages = extractImagesFromHtml(contentEncoded ?? '');
        videoLinks = extractVideoLinksFromHtml(contentEncoded ?? '');
        figcaptions = extractFigcaptions(contentEncoded ?? '');
    }

    const slashRaw = getText('slash\\:comments');
    const slashComments = slashRaw !== undefined ? (parseInt(slashRaw, 10) || 0) : undefined;

    // ── Exhaustive Metadata: additionalMetadata ───────────────────────────
    const additionalMetadata: Record<string, any> = {};
    item[0].children.forEach((child: any) => {
        if (child.type === 'tag') {
            const tagName = child.name;
            const knownTags = [
                'link', 'title', 'pubDate', 'description', 'content:encoded',
                'dc:creator', 'comments', 'guid', 'dcterms:modified',
                'slash:comments', 'post-id', 'category', 'enclosure',
                'media:content', 'media:thumbnail', 'content', 'thumbnail'
            ];
            if (!knownTags.includes(tagName)) {
                additionalMetadata[tagName] = item.find(tagName).first().text().trim() || item.find(tagName).first().html() || '';
                const attrs = item.find(tagName).first().attr();
                if (attrs && Object.keys(attrs).length > 0) {
                    additionalMetadata[`${tagName}_attrs`] = attrs;
                }
            }
        }
    });

    return {
        title: getText('title'),
        link: getText('link'),
        pubDate: getText('pubDate'),
        modified: getText('dcterms\\:modified, modified'),
        description,
        contentEncoded,
        creator: getText('dc\\:creator, creator'),
        guid: getText('guid'),
        commentsUrl: getText('comments'),
        postId: getText('com-wordpress\\:feed-additions post-id, post-id'),
        // Pattern A
        enclosureUrl,
        enclosureType,
        mediaContents: mediaContents.length > 0 ? mediaContents : undefined,
        mediaThumbnails: mediaThumbnails.length > 0 ? mediaThumbnails : undefined,
        slashComments,
        // Pattern B
        categories: categories.length > 0 ? categories : undefined,
        heroImageUrl,
        contentImages: contentImages.length > 0 ? contentImages : undefined,
        videoLinks: videoLinks.length > 0 ? videoLinks : undefined,
        figcaptions: figcaptions.length > 0 ? figcaptions : undefined,
        feedPattern,
        additionalMetadata: Object.keys(additionalMetadata).length > 0 ? additionalMetadata : undefined,
    };
}

// ─── High-Fidelity Extractor ──────────────────────────────────────────────────

/**
 * Deterministic high-fidelity extraction — no LLM, pure pipeline.
 * Per-item errors are caught and logged; the item is omitted from output.
 */
export async function extractRSSFeed(
    xmlText: string,
    options: { channelSource: string }
): Promise<RawHighFidelityArticle[]> {
    if (!options?.channelSource) {
        throw new Error('extractRSSFeed: options.channelSource is required');
    }

    const { channelSource } = options;
    const channel = parseWordPressRSS(xmlText);
    const results: RawHighFidelityArticle[] = [];

    for (const [index, item] of channel.items.entries()) {
        try {
            const heroImage = selectHeroImage(item);
            const gallery = buildMediaGallery(item, heroImage);
            const { isThin } = detectContentThinness(item);
            const authors = parseCreators(item.creator);
            const feedPattern = item.feedPattern ?? 'A';

            const content = (!isThin && feedPattern === 'B')
                ? htmlToMarkdown(item.contentEncoded ?? '')
                : null;

            results.push({
                id: generateArticleId(item, channelSource),
                source_url: sanitizeUrl(item.link ?? ''),
                post_id: item.postId,
                guid: item.guid,
                title: item.title ?? '(untitled)',
                description: item.description ? stripHtml(item.description) : null,
                content,
                category: item.categories ?? [],
                feed_categories: item.categories,
                hero_image: heroImage,
                gallery,
                video_links: item.videoLinks ?? [],
                thumbnails: (item.mediaThumbnails ?? []).map(t => t.url),
                author: authors,
                author_url: item.creator,
                pub_date: item.pubDate ?? null,
                modified_date: item.modified ?? null,
                language: channel.language ?? 'en-US',
                feed_pattern: feedPattern,
                scrape_needed: isThin || feedPattern === 'A',
                source_id: channelSource,
                source_name: channel.title ?? channelSource,
                comments_url: item.commentsUrl,
                comments_count: item.slashComments,
                generator: channel.generator,
                media: buildStructuredMedia(item),
                additional_metadata: item.additionalMetadata
            });
        } catch (err) {
            logger.error(`extractRSSFeed: failed to process item ${index} ("${item.title ?? 'unknown'}")`, err);
        }
    }

    logger.info(`extractRSSFeed: extracted ${results.length}/${channel.items.length} items`);
    return results;
}

// ─── Full-Content Scraper ─────────────────────────────────────────────────────

/**
 * Scrape full body text from a URL using @extractus/article-extractor.
 * Retries up to MAX_SCRAPER_RETRIES times on transient failures.
 * Never throws — returns null fields on failure.
 */
export async function extractFullContent(url: string): Promise<{
    content: string | null;
    description: string | null;
    image: string | null;
    author?: string | null;
    images?: string[];
    videos?: string[];
}> {
    const fallback = { content: null, description: null, image: null };

    if (!url || !isValidHttpUrl(url)) {
        logger.warn(`extractFullContent: skipping invalid URL "${url}"`);
        return fallback;
    }

    try {
        const article = await withRetry(
            () => extract(url) as Promise<any>,
            MAX_SCRAPER_RETRIES,
            `FullScraper(${url})`
        );

        if (!article) {
            logger.warn(`extractFullContent: extractor returned null for "${url}"`);
            return fallback;
        }

        let author = article.author ?? null;
        let deepImages: string[] = [];
        let deepVideos: string[] = [];

        // --- Bulletproof Extraction for High-Value Sources ---
        const isNYP = url.includes('pagesix.com') || url.includes('nypost.com');
        const isFox = url.includes('foxnews.com');

        // We run deep extraction not just when author is missing, but also to scrape deep media!
        if (isNYP || isFox) {
            try {
                const response = await safeFetch(url, { headers: { 'User-Agent': 'Mozilla/5.0' } });
                if (response.ok) {
                    const html = await response.text();
                    const $ = cheerio.load(html);

                    if (!author) {
                        if (isNYP) {
                            author = $('meta[name="author"]').attr('content') ||
                                $('meta[property="article:author"]').attr('content') ||
                                $('meta[name="nyp-author"]').attr('content') ||
                                $('.author-name, .byline-author, .author-card__name').first().text().trim();
                        } else if (isFox) {
                            author = $('meta[name="dc.creator"]').attr('content') ||
                                $('meta[name="author"]').attr('content') ||
                                $('.author-byline a').first().text().trim();
                        }

                        // Absolute fallback: extract from known script patterns if meta is missing
                        if (!author) {
                            const scriptMatch = html.match(/"author":"([^"]+)"/);
                            if (scriptMatch) author = scriptMatch[1];
                        }

                        // Final check: brand shield
                        const brandShield = ['pagesix', 'page six', 'nypost', 'ny post', 'new york post', '@pagesix', '@nypost', 'fox news'];
                        if (author && brandShield.some(b => author!.toLowerCase().trim() === b)) {
                            author = null;
                        }
                    }

                    // --- Deep Media Extraction ---
                    if (isFox) {
                        $('.article-content img').each((_, el) => {
                            const src = $(el).attr('src');
                            if (src && !src.includes('data:image')) deepImages.push(src);
                        });

                        $('iframe').each((_, el) => {
                            const src = $(el).attr('src');
                            if (src && (src.includes('video') || src.includes('player'))) deepVideos.push(src);
                        });
                        $('video').each((_, el) => {
                            const src = $(el).attr('src');
                            if (src) deepVideos.push(src);
                        });

                        // Extract videos from ld+json
                        const scripts = $('script[type="application/ld+json"]');
                        for (let i = 0; i < scripts.length; i++) {
                            const text = $(scripts[i]).html() || '';
                            try {
                                const data = JSON.parse(text);
                                const extractVideo = (node: any) => {
                                    if (node['@type'] === 'VideoObject' && node.contentUrl && !deepVideos.includes(node.contentUrl)) deepVideos.push(node.contentUrl);
                                    if (Array.isArray(node.video)) node.video.forEach((v: any) => v.contentUrl && !deepVideos.includes(v.contentUrl) && deepVideos.push(v.contentUrl));
                                    else if (node.video && node.video.contentUrl && !deepVideos.includes(node.video.contentUrl)) deepVideos.push(node.video.contentUrl);
                                };
                                if (data['@graph'] && Array.isArray(data['@graph'])) data['@graph'].forEach(extractVideo);
                                else extractVideo(data);
                            } catch (e) { }
                        }
                    }
                }
            } catch (e) {
                logger.warn(`extractFullContent deep fallback error for ${url}:`, e);
            }
        }

        return {
            content: article.content ? htmlToMarkdown(article.content) : null,
            description: article.description ?? null,
            image: article.image ?? null,
            author,
            images: deepImages.length > 0 ? Array.from(new Set(deepImages)) : undefined,
            videos: deepVideos.length > 0 ? Array.from(new Set(deepVideos)) : undefined,
        };
    } catch (err) {
        logger.error(`extractFullContent: all retries exhausted for "${url}"`, err);
        return fallback;
    }
}

// ─── HTML Extraction Helpers (Pattern B) ─────────────────────────────────────

/**
 * Extract the featured/hero image from description HTML.
 * Priority: webfeedsFeaturedVisual class → first <img> → null.
 */
export function extractFeaturedImage(descriptionHtml: string): string | null {
    if (!descriptionHtml) return null;

    const featuredMatch = descriptionHtml.match(RE_FEATURED_IMG);
    if (featuredMatch) {
        const srcset = featuredMatch[0].match(RE_SRCSET_ATTR)?.[1];
        if (srcset) {
            const best = pickBestSrcsetUrl(srcset);
            if (best) return best;
        }
        const src = featuredMatch[0].match(RE_SRC_ATTR)?.[1];
        if (src) return src;
    }

    const firstImgMatch = descriptionHtml.match(RE_FIRST_IMG);
    if (firstImgMatch) {
        const src = firstImgMatch[0].match(RE_SRC_ATTR)?.[1];
        if (src && isValidImageUrl(src)) return src;
    }

    return null;
}

/**
 * Extract and deduplicate all content images from HTML.
 * Prefers highest-resolution srcset variant. Filters tracking pixels / SVGs / favicons.
 */
export function extractImagesFromHtml(html: string): string[] {
    if (!html) return [];

    const seen = new Set<string>();
    const urls: string[] = [];

    // Reset lastIndex — regex is module-level and stateful
    RE_IMG_TAG.lastIndex = 0;
    let match: RegExpExecArray | null;

    while ((match = RE_IMG_TAG.exec(html)) !== null) {
        const imgTag = match[0];

        const srcset = imgTag.match(RE_IMG_SRCSET)?.[1];
        let url: string | null = srcset ? pickBestSrcsetUrl(srcset) : null;

        if (!url) {
            url = imgTag.match(RE_IMG_SRC)?.[1] ?? null;
        }

        if (url && isValidImageUrl(url) && !seen.has(url)) {
            seen.add(url);
            urls.push(url);
        }
    }

    return urls;
}

/**
 * Extract YouTube and Vimeo watch URLs from iframe embeds.
 * Converts embed paths to canonical watch URLs.
 * Preserves other media embeds (Spotify, SoundCloud, Omny) as-is.
 */
export function extractVideoLinksFromHtml(html: string): string[] {
    if (!html) return [];

    const urls: string[] = [];
    RE_IFRAME_TAG.lastIndex = 0;
    let match: RegExpExecArray | null;

    while ((match = RE_IFRAME_TAG.exec(html)) !== null) {
        const src = match[1];
        if (!src) continue;

        const ytMatch = src.match(RE_YOUTUBE_EMBED);
        if (ytMatch) {
            urls.push(`https://www.youtube.com/watch?v=${ytMatch[1]}`);
            continue;
        }

        const vimeoMatch = src.match(RE_VIMEO_EMBED);
        if (vimeoMatch) {
            urls.push(`https://vimeo.com/${vimeoMatch[1]}`);
            continue;
        }

        if (RE_MEDIA_AUDIO.test(src)) {
            urls.push(src);
        }
    }

    return urls;
}

/**
 * Parse a WordPress CDN srcset string and return the URL for the best resolution.
 * Targets PREFERRED_IMAGE_WIDTH; falls back to largest available.
 */
export function pickBestSrcsetUrl(srcset: string): string {
    if (!srcset) return '';

    const entries = srcset
        .split(',')
        .map(entry => {
            const parts = entry.trim().split(/\s+/);
            const url = parts[0] ?? '';
            const width = parts[1] ? parseInt(parts[1], 10) : 0;
            return { url, width: isNaN(width) ? 0 : width };
        })
        .filter(e => e.url.length > 0 && isValidImageUrl(e.url));

    if (entries.length === 0) return '';

    const preferred = entries.find(e => e.width === PREFERRED_IMAGE_WIDTH);
    if (preferred) return preferred.url;

    entries.sort((a, b) => b.width - a.width);
    return entries[0].url;
}

/**
 * Determine whether a URL looks like a real content image (not a tracker, SVG, or favicon).
 */
export function isValidImageUrl(url: string): boolean {
    if (!url || url.length < MIN_VALID_IMAGE_URL_LEN) return false;
    if (url.startsWith('data:')) return false;

    const lower = url.toLowerCase();
    if (lower.endsWith('.svg') || lower.endsWith('.ico')) return false;
    if (/pixel.*(?:1x1|tracking)/i.test(lower)) return false;
    if (lower.includes('beacon')) return false;
    if (lower.includes('/spacer.gif') || lower.includes('/clear.gif')) return false;
    if (lower.includes('gravatar.com')) return false;

    return true;
}

/**
 * Extract and strip figcaption text from HTML.
 */
export function extractFigcaptions(html: string): string[] {
    if (!html) return [];

    const captions: string[] = [];
    RE_FIGCAPTION.lastIndex = 0;
    let match: RegExpExecArray | null;

    while ((match = RE_FIGCAPTION.exec(html)) !== null) {
        const text = stripHtml(match[1]).trim();
        if (text.length >= MIN_FIGCAPTION_LEN) {
            captions.push(text);
        }
    }

    return captions;
}

// ─── HTML → Text / Markdown ───────────────────────────────────────────────────

/**
 * Strip all HTML tags from a string, preserving basic whitespace structure.
 * Safe for empty / null input.
 */
export function stripHtml(html: string): string {
    if (!html) return '';

    return html
        .replace(RE_STYLE_TAG, ' ')
        .replace(RE_SCRIPT_TAG, ' ')
        // Preserve structure before stripping tags
        .replace(RE_CLOSE_P, '\n\n')
        .replace(RE_BR, '\n')
        .replace(RE_OPEN_DIV, '\n')
        .replace(RE_ANY_TAG, ' ')
        .replace(RE_HTML_NBSP, ' ')
        .replace(RE_HTML_AMP, '&')
        .replace(RE_HTML_LT, '<')
        .replace(RE_HTML_GT, '>')
        .replace(RE_HTML_QUOT, '"')
        .replace(RE_HTML_NUMREF, ' ')
        .replace(RE_EXCESS_HSPACE, ' ')
        .replace(RE_EXCESS_NEWLINES, '\n\n')
        .trim();
}

/**
 * Convert article HTML (Pattern B) to readable markdown.
 * Caps output at MAX_MARKDOWN_LENGTH characters.
 */
export function htmlToMarkdown(html: string): string {
    if (!html) return '';

    let text = html
        .replace(RE_SCRIPT_TAG, '')
        .replace(RE_STYLE_TAG, '')
        .replace(RE_SVG_TAG, '')
        .replace(RE_WP_EMBED, '[VIDEO EMBED]')
        .replace(RE_LIGHTBOX, '');

    // Headings
    text = text
        .replace(RE_H1, '\n\n# ')
        .replace(RE_H2, '\n\n## ')
        .replace(RE_H3, '\n\n### ')
        .replace(RE_H4, '\n\n#### ')
        .replace(RE_CLOSE_H, '\n\n');

    // Paragraphs & line breaks
    text = text
        .replace(RE_CLOSE_P, '\n\n')
        .replace(RE_BR, '\n')
        .replace(RE_OPEN_P, '');

    // Lists
    text = text
        .replace(RE_OPEN_UL, '\n')
        .replace(RE_CLOSE_UL, '\n')
        .replace(RE_OPEN_OL, '\n')
        .replace(RE_CLOSE_OL, '\n')
        .replace(RE_OPEN_LI, '- ')
        .replace(RE_CLOSE_LI, '\n');

    // Blockquotes
    text = text
        .replace(RE_OPEN_BQ, '\n\n> ')
        .replace(RE_CLOSE_BQ, '\n\n');

    // Inline emphasis
    text = text
        .replace(RE_STRONG, '**')
        .replace(RE_CLOSE_STRONG, '**')
        .replace(RE_EM, '_')
        .replace(RE_CLOSE_EM, '_');

    // Links — keep anchor text only
    RE_A_TAG.lastIndex = 0;
    text = text.replace(RE_A_TAG, '$1');

    // Figcaptions → italic
    text = text
        .replace(RE_OPEN_FC, '\n_')
        .replace(RE_CLOSE_FC, '_\n');

    // Strip remaining tags
    text = text.replace(RE_ANY_TAG, ' ');

    // Decode HTML entities
    text = text
        .replace(RE_HTML_NBSP, ' ')
        .replace(RE_HTML_AMP, '&')
        .replace(RE_HTML_LT, '<')
        .replace(RE_HTML_GT, '>')
        .replace(RE_HTML_QUOT, '"')
        .replace(RE_HTML_LDQUO, '\u201C')
        .replace(RE_HTML_RDQUO, '\u201D')
        .replace(RE_HTML_LSQUO, '\u2018')
        .replace(RE_HTML_RSQUO, '\u2019')
        .replace(RE_HTML_HELLIP, '\u2026')
        .replace(RE_HTML_NUMREF, ' ');

    // Normalise whitespace
    text = text
        .replace(RE_EXCESS_NEWLINES, '\n\n')
        .replace(RE_EXCESS_SPACES, ' ')
        .trim();

    return text.length > MAX_MARKDOWN_LENGTH
        ? text.slice(0, MAX_MARKDOWN_LENGTH)
        : text;
}

// ─── Content Thinness Detector ────────────────────────────────────────────────

export interface ThinContentResult {
    isThin: boolean;
    reason: string;
    wordCount: number;
}

export function detectContentThinness(item: RawRSSItem): ThinContentResult {
    const rawContent = item.contentEncoded ?? '';
    const rawDesc = item.description ?? '';

    const contentText = stripHtml(rawContent);
    const descText = stripHtml(rawDesc);
    const wordCount = countWords(contentText);

    if (item.feedPattern === 'B' && wordCount > THIN_CONTENT_WORD_THRESHOLD) {
        return { isThin: false, reason: 'full_content_html', wordCount };
    }

    if (rawContent && rawDesc) {
        const normContent = normalizeForComparison(contentText);
        const normDesc = normalizeForComparison(descText);

        if (normContent === normDesc) {
            return { isThin: true, reason: 'content_duplicates_description', wordCount };
        }
        const prefixLen = Math.min(80, normDesc.length);
        if (prefixLen > 0 && normContent.startsWith(normDesc.slice(0, prefixLen))) {
            return { isThin: true, reason: 'content_starts_with_description', wordCount };
        }
    }

    if (wordCount < THIN_CONTENT_WORD_THRESHOLD) {
        return { isThin: true, reason: 'content_too_short', wordCount };
    }

    return { isThin: false, reason: 'sufficient_content', wordCount };
}

// ─── Image & Gallery Helpers ──────────────────────────────────────────────────

export function selectHeroImage(item: RawRSSItem): string | null {
    if (item.feedPattern === 'B') {
        if (item.heroImageUrl) return item.heroImageUrl;
        if (item.contentImages?.length) return item.contentImages[0];
        return null;
    }

    // Pattern A
    if (item.mediaContents?.length) {
        const individual = item.mediaContents.find(
            m => m.medium === 'image'
                && !m.url.includes('collage')
                && !m.url.includes('composite')
        );
        return individual?.url ?? item.mediaContents[0].url;
    }

    if (item.mediaThumbnails?.length) return item.mediaThumbnails[0].url;

    return item.enclosureUrl ?? null;
}

export function buildMediaGallery(item: RawRSSItem, heroUrl: string | null): string[] {
    const gallery: string[] = [];
    const seen = new Set<string>(heroUrl ? [heroUrl] : []);

    const addIfUnseen = (url: string | undefined | null) => {
        if (url && !seen.has(url) && gallery.length < MAX_GALLERY_ITEMS) {
            seen.add(url);
            gallery.push(url);
        }
    };

    if (item.feedPattern === 'B') {
        for (const url of item.contentImages ?? []) addIfUnseen(url);
    } else {
        for (const mc of item.mediaContents ?? []) addIfUnseen(mc.url);
        for (const mt of item.mediaThumbnails ?? []) addIfUnseen(mt.url);
        addIfUnseen(item.enclosureUrl);
    }

    return gallery;
}

/**
 * Builds a structured media array with captions and types.
 * Vital for high-fidelity providers like Page Six.
 */
import { NewsMedia } from './news-shared';
import { safeFetch } from './safe-fetch';

// @extractus/article-extractor pulls in sanitize-html, which require()s an
// ESM-only htmlparser2. A static import therefore throws ERR_REQUIRE_ESM at
// module load in the serverless runtime and takes down every route that
// transitively imports this file. Load it through the ESM loader, on demand,
// and degrade to null rather than crashing the module.
type ExtractFn = (input: string) => Promise<any>;
let _extractPromise: Promise<ExtractFn | null> | undefined;

function loadExtract(): Promise<ExtractFn | null> {
    if (!_extractPromise) {
        _extractPromise = import('@extractus/article-extractor')
            .then((mod) => (mod.extract ?? (mod as any).default?.extract ?? null) as ExtractFn | null)
            .catch((err) => {
                console.error('[article-extractor] unavailable:', err instanceof Error ? err.message : err);
                return null;
            });
    }
    return _extractPromise;
}

async function extract(url: string): Promise<any> {
    const fn = await loadExtract();
    if (!fn) return null;
    return fn(url);
}


export function buildStructuredMedia(item: RawRSSItem): NewsMedia[] {
    const media: NewsMedia[] = [];
    const seen = new Set<string>();

    const addMedia = (url: string, type: string, medium?: string, caption?: string, title?: string, credit?: string, description?: string, width?: number, height?: number, attributes?: Record<string, string>) => {
        if (!url || seen.has(url)) return;
        seen.add(url);
        media.push({
            url,
            type,
            medium: medium || type.split('/')[0] || 'image',
            caption: caption || title || null,
            title: title || null,
            credit: credit || null,
            description: description || null,
            width: width ? Number(width) : undefined,
            height: height ? Number(height) : undefined,
            attributes
        });
    };

    if (item.feedPattern === 'A') {
        // 1. Media Namespace content (Usually highest fidelity)
        for (const mc of item.mediaContents ?? []) {
            addMedia(
                mc.url,
                mc.type || (mc.medium === 'video' ? 'video/mp4' : 'image/jpeg'),
                mc.medium,
                mc.caption || mc.title,
                mc.title,
                mc.credit,
                mc.description,
                mc.width ? parseInt(mc.width) : undefined,
                mc.height ? parseInt(mc.height) : undefined,
                mc.attributes
            );
        }
        // 2. Enclosure (Only if not already captured)
        if (item.enclosureUrl && !seen.has(item.enclosureUrl)) {
            const type = item.enclosureType || (item.enclosureUrl.includes('.mp4') ? 'video/mp4' : 'image/jpeg');
            addMedia(item.enclosureUrl, type);
        }
        // 3. Thumbnails (Lowest priority, skip if URL matches a higher-fidelity version)
        for (const mt of item.mediaThumbnails ?? []) {
            if (!seen.has(mt.url)) {
                addMedia(mt.url, 'image/jpeg', 'image', undefined, undefined, undefined, undefined, mt.width ? parseInt(mt.width) : undefined, mt.height ? parseInt(mt.height) : undefined, mt.attributes);
            }
        }
    } else {
        // Pattern B: Content Images
        for (let i = 0; i < (item.contentImages?.length || 0); i++) {
            addMedia(item.contentImages![i], 'image/jpeg', 'image', item.figcaptions?.[i]);
        }
        for (const video of item.videoLinks ?? []) {
            addMedia(video, 'video/mp4', 'video');
        }
    }

    return media;
}

// ─── Author Parser ────────────────────────────────────────────────────────────

export function parseCreators(raw?: string): string[] {
    if (!raw || !raw.trim()) return [];

    // NYT URL-style: "https://www.nytimes.com/by/kim-barker"
    if (RE_NYT_BY.test(raw)) {
        const namePart = raw.split('/by/')[1]?.split('?')[0];
        if (namePart) {
            const formatted = namePart
                .split('-')
                .map(word => word.charAt(0).toUpperCase() + word.slice(1))
                .join(' ');
            return [formatted];
        }
    }

    // Strip "By " prefix if present (common in some fields)
    let clean = raw.trim();
    if (clean.toLowerCase().startsWith('by ')) {
        clean = clean.slice(3).trim();
    }

    // Comma-separated or "and"-separated list of title-case names
    const parts = clean.split(/,\s+|\s+and\s+/i).map(p => p.trim()).filter(Boolean);
    if (parts.length > 1 && parts.every(p => /^[A-Z]/.test(p))) return parts;

    // All-caps author: "KIM BARKER" → "Kim Barker"
    if (clean === clean.toUpperCase() && clean.length > 2) {
        return [
            clean
                .split(/\s+/)
                .map(w => w.charAt(0).toUpperCase() + w.slice(1).toLowerCase())
                .join(' '),
        ];
    }

    return [clean];
}

export function getAuthorUrl(name: string, sourceId: string): string {
    const slug = name.toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/(^-|-$)/g, '');

    if (sourceId === 'pagesix') {
        return `https://pagesix.com/author/${slug}/`;
    }
    if (sourceId === 'nypost') {
        return `https://nypost.com/author/${slug}/`;
    }
    if (sourceId === 'nytimes') {
        return `https://www.nytimes.com/by/${slug}`;
    }

    return `https://www.google.com/search?q=${encodeURIComponent(name + ' ' + sourceId)}`;
}

// ─── Article ID Generator ─────────────────────────────────────────────────────

export function generateArticleId(item: RawRSSItem, channelSource: string): string {
    const slug = (s: string) => s.replace(/[^a-z0-9]/gi, '-').slice(-40);

    if (item.postId) return `${channelSource}-post-${item.postId}`;
    if (item.guid) return `${channelSource}-guid-${slug(item.guid)}`;
    if (item.link) return `${channelSource}-url-${slug(item.link)}`;
    return `${channelSource}-ts-${Date.now()}`;
}

// ─── Pre-enrichment Normalizer ────────────────────────────────────────────────

export function normalizeForEnrichment(
    item: RawRSSItem,
    channel: RawRSSChannel
): Record<string, unknown> {
    const heroImage = selectHeroImage(item);
    const gallery = buildMediaGallery(item, heroImage);
    const { isThin } = detectContentThinness(item);
    const authors = parseCreators(item.creator);
    const feedPattern = item.feedPattern ?? 'A';

    const imageCaptions: string[] = feedPattern === 'B'
        ? (item.figcaptions ?? [])
        : (item.mediaContents ?? []).flatMap(m => m.title ? [m.title] : []);

    const content = (!isThin && feedPattern === 'B')
        ? htmlToMarkdown(item.contentEncoded ?? '')
        : null;

    return {
        url: item.link,
        post_id: item.postId,
        feed_source: channel.title,
        feed_pattern: feedPattern,
        title: item.title,
        description: stripHtml(item.description ?? '').slice(0, 500),
        content,
        is_thin: isThin,
        pub_date: item.pubDate,
        modified_date: item.modified,
        authors,
        feed_categories: item.categories ?? [],
        hero_image_url: heroImage,
        gallery_urls: gallery.slice(0, 20),
        video_links: item.videoLinks ?? [],
        video_count: (item.videoLinks ?? []).length,
        image_captions: imageCaptions.slice(0, MAX_IMAGE_CAPTIONS),
        language: channel.language ?? 'en-US',
    };
}

// ─── LLM Enrichment Prompt Builder ───────────────────────────────────────────

export function buildEnrichmentPrompt(input: Record<string, unknown>): string {
    const isPatternB = input.feed_pattern === 'B';
    const feedCategories = (input.feed_categories as string[] | undefined) ?? [];
    const videoCount = (input.video_count as number | undefined) ?? 0;

    const categoryGuidance = feedCategories.length > 0
        ? `\nThe feed tagged this article: ${feedCategories.join(', ')}. Use as strong signals but normalise to the ALLOWED CATEGORIES below.`
        : '';

    const videoGuidance = videoCount > 0
        ? `\nThis article contains ${videoCount} embedded video(s). Factor multimedia richness into your analysis.`
        : '';

    const contentSection = isPatternB
        ? `
FULL ARTICLE CONTENT (markdown):
---
${(input.content as string | null) ?? '(not available)'}
---

Generate ai_content as cleaned markdown:
- Remove advertising language, promotional asides, "Read More" links
- Preserve structure (headings, paragraphs, blockquotes)
- Keep factual details, quotes, names, numbers
- Do NOT summarise — produce a lightly cleaned version of the full text
- Cap at 4000 tokens
`
        : `
CONTENT STATUS: Thin/teaser — full text not available in feed.
Set ai_content: null.
Work from title, description, and image_captions only.
`;

    const articlePayload = JSON.stringify({
        url: input.url,
        title: input.title,
        description: input.description,
        authors: input.authors,
        pub_date: input.pub_date,
        modified_date: input.modified_date,
        image_captions: input.image_captions,
        video_links: input.video_links,
        feed_categories: input.feed_categories,
    }, null, 2);

    return `You are an expert editorial assistant enriching article metadata for a news intelligence platform.

Analyse the article data below and return a single JSON object with enriched metadata.

ARTICLE DATA:
${articlePayload}
${contentSection}${categoryGuidance}${videoGuidance}

REQUIRED OUTPUT FORMAT (return ONLY valid JSON, no markdown fences):
{
  "ai_title":    string | null,
  "ai_summary":  string,
  "ai_content":  string | null,
  "category":    string[],
  "sentiment":   "positive" | "negative" | "neutral" | "mixed",
  "key_points":  string[],
  "implications": string | null
}

ALLOWED CATEGORIES: Technology, Business, Startups, Funding, AI/ML, Science, Health, Politics, Sports, Entertainment, Education, Real Estate, Finance, Policy, Other

RULES:
- ai_title: Only improve if you can add meaningful clarity or specificity. null otherwise.
- ai_summary: Never begin with the article title. Lead with the most important fact.
- key_points: 3–5 specific factual claims — names, numbers, dates, decisions only.
- category: 1–3 from ALLOWED CATEGORIES. Use feed_categories as strong hints. Prefer specific (e.g. "Funding") over generic (e.g. "Business").
- Respond with ONLY the JSON object. No preamble, no explanation, no code fences.`;
}

// ─── Enrichment Merger ────────────────────────────────────────────────────────

export function mergeEnrichment(
    item: RawRSSItem,
    channel: RawRSSChannel,
    llmOutput: Record<string, unknown>,
    channelSource: string
): EnrichedArticle {
    const heroImage = selectHeroImage(item);
    const gallery = buildMediaGallery(item, heroImage);
    const { isThin } = detectContentThinness(item);
    const authors = parseCreators(item.creator);
    const feedPattern = item.feedPattern ?? 'A';

    const feedCats = item.categories ?? [];
    const llmCats = Array.isArray(llmOutput.category) ? (llmOutput.category as string[]) : [];
    const mergedCats = Array.from(new Set([...llmCats, ...feedCats]));
    const normalizedCats = mergedCats
        .filter((c): c is ArticleCategory => ALLOWED_CATEGORIES.has(c as ArticleCategory))
        .slice(0, 3);

    const sentimentRaw = llmOutput.sentiment as string | undefined;
    const sentiment: EnrichedArticle['analysis'] extends null ? never : NonNullable<EnrichedArticle['analysis']>['sentiment'] =
        (['positive', 'negative', 'neutral', 'mixed'] as const).includes(sentimentRaw as any)
            ? (sentimentRaw as 'positive' | 'negative' | 'neutral' | 'mixed')
            : 'neutral';

    const hasAnalysis = Array.isArray(llmOutput.key_points) && (llmOutput.key_points as unknown[]).length > 0;

    return {
        id: generateArticleId(item, channelSource),
        source_url: sanitizeUrl(item.link ?? ''),
        post_id: item.postId,
        title: item.title ?? '(untitled)',
        ai_title: typeof llmOutput.ai_title === 'string' ? llmOutput.ai_title : null,
        ai_summary: typeof llmOutput.ai_summary === 'string' ? llmOutput.ai_summary : null,
        ai_content: typeof llmOutput.ai_content === 'string' ? llmOutput.ai_content : null,
        category: normalizedCats.length > 0 ? normalizedCats : ['Other'],
        feed_categories: feedCats.length > 0 ? feedCats : undefined,
        hero_image: heroImage,
        gallery,
        video_links: item.videoLinks ?? [],
        thumbnails: (item.mediaThumbnails ?? []).map(t => t.url),
        author: authors,
        author_url: item.creator,
        pub_date: item.pubDate ?? null,
        modified_date: item.modified ?? null,
        language: channel.language ?? 'en-US',
        feed_pattern: feedPattern,
        scrape_needed: isThin && feedPattern === 'A',
        source_id: channelSource,
        source_name: channel.title ?? channelSource,
        analysis: hasAnalysis ? {
            sentiment,
            key_points: llmOutput.key_points as string[],
            implications: typeof llmOutput.implications === 'string' ? llmOutput.implications : undefined,
        } : null,
        music_metadata: null,
    };
}

// ─── Main Pipeline Orchestrator ───────────────────────────────────────────────

export interface EnrichRSSFeedOptions {
    channelSource: string;
    callLLM: (prompt: string) => Promise<string>;
    concurrency?: number;
    onProgress?: (done: number, total: number) => void;
    /** Called for each article that failed enrichment — receives the raw item + error */
    onItemError?: (item: RawRSSItem, err: unknown) => void;
}

/**
 * Full LLM-enriched pipeline.
 *
 * Guarantees:
 *  - Never throws due to a single bad item.
 *  - LLM calls are retried up to MAX_LLM_RETRIES times.
 *  - Items with unparseable LLM output are still returned with null analysis fields.
 *  - Concurrency is clamped to [1, 10] for safety.
 */
export async function enrichRSSFeed(
    xmlText: string,
    options: EnrichRSSFeedOptions
): Promise<EnrichedArticle[]> {
    if (!options?.channelSource) throw new Error('enrichRSSFeed: options.channelSource is required');
    if (typeof options.callLLM !== 'function') throw new Error('enrichRSSFeed: options.callLLM must be a function');

    const { channelSource, callLLM, onProgress, onItemError } = options;
    const concurrency = Math.min(10, Math.max(1, options.concurrency ?? DEFAULT_CONCURRENCY));

    const channel = parseWordPressRSS(xmlText);
    const results: EnrichedArticle[] = [];
    let done = 0;

    for (let i = 0; i < channel.items.length; i += concurrency) {
        const batch = channel.items.slice(i, i + concurrency);

        const batchResults = await Promise.allSettled(
            batch.map(async (item) => {
                const input = normalizeForEnrichment(item, channel);
                const prompt = buildEnrichmentPrompt(input);

                let llmOutput: Record<string, unknown> = {};
                try {
                    const raw = await withRetry(
                        () => callLLM(prompt),
                        MAX_LLM_RETRIES,
                        `LLM("${item.title ?? 'unknown'}")`
                    );
                    const json = raw.replace(/```json|```/g, '').trim();
                    llmOutput = JSON.parse(json);
                } catch (err) {
                    logger.warn(`enrichRSSFeed: LLM failed for "${item.title ?? 'unknown'}" — returning unenriched`, err);
                    onItemError?.(item, err);
                    // Still return a valid article — just without AI fields
                }

                return mergeEnrichment(item, channel, llmOutput, channelSource);
            })
        );

        for (const [idx, result] of batchResults.entries()) {
            if (result.status === 'fulfilled') {
                results.push(result.value);
            } else {
                const failedItem = batch[idx];
                logger.error(`enrichRSSFeed: item "${failedItem?.title ?? 'unknown'}" failed entirely`, result.reason);
                onItemError?.(failedItem, result.reason);
            }
        }

        done += batch.length;
        onProgress?.(done, channel.items.length);
        logger.debug(`enrichRSSFeed: progress ${done}/${channel.items.length}`);
    }

    logger.info(`enrichRSSFeed: enriched ${results.length}/${channel.items.length} items from "${channelSource}"`);
    return results;
}

// ─── NewsArticle Adapters ─────────────────────────────────────────────────────

export function toNewsArticle(raw: RawHighFidelityArticle): NewsArticle {
    return {
        article_id: raw.id,
        title: raw.title,
        description: raw.description,
        content: raw.content,
        link: raw.source_url,
        pubDate: raw.pub_date ?? new Date().toISOString(),
        source_id: raw.source_id,
        source_name: raw.source_name,
        image_url: raw.hero_image,
        creator: raw.author,
        category: raw.category,
        video_links: raw.video_links,
        media_gallery: raw.gallery,
        modified_date: raw.modified_date,
        post_id: raw.post_id,
        guid: raw.guid,
        language: raw.language,
        feed_pattern: raw.feed_pattern,
        scrape_needed: raw.scrape_needed,
        feed_categories: raw.feed_categories,
        author_url: raw.author_url,
        comments_url: raw.comments_url,
        comments_count: raw.comments_count,
        generator: raw.generator,
        media: raw.media,
        additional_metadata: raw.additional_metadata,
        is_enriched: false,
    };
}

export function enrichedToNewsArticle(enriched: EnrichedArticle): NewsArticle {
    return {
        article_id: enriched.id,
        title: enriched.ai_title ?? enriched.title,
        description: enriched.ai_summary,
        content: enriched.ai_content ?? null,
        link: enriched.source_url,
        pubDate: enriched.pub_date ?? new Date().toISOString(),
        source_id: enriched.source_id,
        source_name: enriched.source_name,
        image_url: enriched.hero_image,
        creator: enriched.author,
        category: enriched.category,
        video_links: enriched.video_links,
        media_gallery: enriched.gallery,
        modified_date: enriched.modified_date,
        post_id: enriched.post_id,
        language: enriched.language,
        feed_pattern: enriched.feed_pattern,
        scrape_needed: enriched.scrape_needed,
        feed_categories: enriched.feed_categories,
        is_enriched: true,
        analysis: enriched.analysis ? {
            sentiment: enriched.analysis.sentiment,
            key_points: enriched.analysis.key_points,
            implications: enriched.analysis.implications ?? null,
        } : null,
    };
}

// ─── Private Utilities ────────────────────────────────────────────────────────

/**
 * Decode percent-encoded NY Post CDN URLs. No-op for clean URLs.
 */
export function decodeNYPostUrl(rawUrl: string): string {
    if (!rawUrl) return '';
    if (!RE_PERCENT_ENCODED.test(rawUrl)) return rawUrl;
    try {
        return decodeURIComponent(rawUrl);
    } catch {
        logger.debug(`decodeNYPostUrl: failed to decode "${rawUrl}"`);
        return rawUrl;
    }
}

/** Extract a clean generator name from a WordPress generator URL. */
function extractGeneratorName(raw?: string): string | undefined {
    if (!raw) return undefined;
    const wpVersion = raw.match(RE_WP_VERSION);
    if (wpVersion) return `WordPress ${wpVersion[1]}`;
    return raw;
}

/** Count whitespace-delimited words in a string. */
function countWords(text: string): number {
    return text.split(/\s+/).filter(Boolean).length;
}

/** Collapse whitespace and lowercase for duplicate-detection comparisons. */
function normalizeForComparison(text: string): string {
    return text.replace(/\s+/g, ' ').toLowerCase().trim();
}

/** Verify a string is a plausible HTTP/HTTPS URL before scraping. */
function isValidHttpUrl(url: string): boolean {
    try {
        const parsed = new URL(url);
        return parsed.protocol === 'http:' || parsed.protocol === 'https:';
    } catch {
        return false;
    }
}

/** Sanitize a URL string — returns empty string if malformed. */
function sanitizeUrl(url: string): string {
    if (!url) return '';
    try {
        return new URL(url).toString();
    } catch {
        return '';
    }
}
