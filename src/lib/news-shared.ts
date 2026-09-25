import * as cheerio from 'cheerio';

export type ArticleCategory =
    | 'Technology' | 'Business' | 'Startups' | 'Funding' | 'AI/ML'
    | 'Science' | 'Health' | 'Politics' | 'Sports' | 'Entertainment'
    | 'Education' | 'Real Estate' | 'Finance' | 'Policy' | 'Other';

export type NewsSectionSlug =
    | 'top-stories' | 'world' | 'us' | 'policy-power' | 'business'
    | 'technology' | 'science' | 'startups' | 'finance' | 'corporate'
    | 'legal' | 'cybersecurity' | 'elections' | 'space'
    | 'entertainment' | 'music' | 'art' | 'tv-streaming' | 'gaming'
    | 'fashion' | 'food' | 'travel' | 'lifestyle'
    | 'health' | 'climate' | 'diaspora' | 'sports' | 'education'
    | 'communities' | 'entrepreneurship' | 'careers' | 'infrastructure'
    | 'opinion' | 'investigations' | 'explainers' | 'analysis' | 'perspectives' | 'longform'
    | 'charts' | 'industry-lists' | 'market-data' | 'trends' | 'reports'
    | 'video' | 'podcasts' | 'photo-essays' | 'live-updates';

export interface NewsArticle {
    article_id: string;
    title: string;
    description: string | null;
    content: string | null;
    link: string;
    pubDate: string;
    source_id: string | null;
    source_name: string | null;
    image_url: string | null;
    creator: string[] | null;
    category: string[];
    ai_summary?: string | null;
    ai_summary_ht?: string | null;
    ai_category?: string | null;
    ai_status?: string | null;
    impact_score?: number | null;
    word_count?: number | null;
    kreyol_summary?: string | null;
    kreyol_title?: string | null;
    sentiment?: "positive" | "negative" | "neutral" | null;
    tags?: string[] | null;
    processed_at?: string | null;
    ai_content?: string | null;
    ai_title?: string | null;
    ai_title_ht?: string | null;
    video_url?: string | null;
    video_links?: string[];
    media_gallery?: string[];
    keywords?: string[];
    source_priority?: number;
    country?: string[];
    // --- High-Fidelity Intelligence & Classification ---
    concepts?: any[];                   // Entities/concepts (ER/NewsData)
    sentiment_stats?: any;              // Breakdown (pos/neg/neu)
    ai_tags?: string[];
    ai_orgs?: string[];
    ai_regions?: string[];
    relevance_score?: number | null;

    // --- Financial & Market Intelligence ---
    symbols?: string[];                 // Stock tickers
    coins?: string[];                   // Crypto symbols

    // --- Branding & Source Metadata ---
    source_icon?: string | null;
    source_url?: string | null;
    source_ranking?: any;

    // --- Social & Engagement ---
    shares?: any;                       // Social share counts

    // --- Clustering & Navigation ---
    story_token?: string | null;
    similar_articles?: any[];
    locale?: string | null;
    language?: string | null;

    is_enriched: boolean;
    // --- Structured Media ---
    media?: NewsMedia[];
    thumbnails?: string[];
    // --- Detailed Metadata (RSS/Native) ---
    comments_url?: string | null;
    modified_date?: string | null;
    post_id?: string | null;
    guid?: string | null;
    author_url?: string | null;
    generator?: string | null;
    last_build_date?: string | null;
    update_period?: string | null;
    update_frequency?: number | null;
    feed_pattern?: 'A' | 'B';
    scrape_needed?: boolean;
    feed_categories?: string[];
    additional_metadata?: Record<string, any>;
    analysis?: {
        sentiment?: "positive" | "negative" | "neutral" | "mixed" | null;
        key_points?: string[] | null;
        implications?: string | null;
        strategic_implications?: string | null;
        verdict?: string | null;
        hashtags?: string[] | null;
    } | null;
    music_metadata?: {
        track_name?: string | null;
        artist_name?: string | null;
        album_name?: string | null;
        genre?: string | string[] | null;
        label?: string | null;
        release_year?: number | string | null;
        duration?: string | number | null;
        lyrics?: string | null;
        synced_lyrics?: any;
        is_instrumental?: boolean;
    } | null;
    image_metadata?: any;
    last_processed?: string;
    last_attempted?: string;
    comments_count?: number | null;
    enrichment_error?: string;
}

export interface NewsMedia {
    url: string;
    type: string; // e.g. 'image', 'video'
    medium?: string; // e.g. 'image', 'video'
    caption?: string | null;
    credit?: string | null;
    title?: string | null;
    description?: string | null;
    width?: number;
    height?: number;
    fileSize?: number;
    isHero?: boolean;
    // Store any additional provider-specific attributes
    attributes?: Record<string, string>;
}

export interface StrategicBriefing {
    title: string;
    summary: string;
    sections: {
        title: string;
        content: string;
    }[];
}

/**
 * High-Aggression Content Scrubbing Utility
 * 1. Takes the information about the writer/author out.
 * 2. Takes the photos out (portraits/bios).
 * 3. Scrubs it out completely.
 */
export function cleanArticleContent(text: string | null | undefined): string {
    if (!text) return '';

    // Check if it's HTML or plain text
    const isHtml = /<[a-z][\s\S]*>/i.test(text);
    let cleaned = text;

    if (isHtml) {
        try {
            const $ = cheerio.load(text, null, false);

            // 1. NUKE PORTRAITS & BIO IMAGES
            // Target specific CBS hub and generic author patterns in alt/src
            $('img, figure').each((_, el) => {
                const $el = $(el);
                const html = $el.html() || '';
                const src = $el.attr('src') || '';
                const alt = $el.attr('alt') || '';

                if (
                    /avatar|headshot|profile-pic|author-portrait/i.test(src) ||
                    /avatar|headshot|profile/i.test(alt)
                ) {
                    $el.remove();
                }
            });

            // 2. NUKE BIO BLOCKS & SIGNATURES
            // Target smaller leaf elements to avoid nuking whole sections/articles
            $('p, span, li, blockquote').each((_, el) => {
                const $el = $(el);
                const content = $el.text().trim();
                const wordCount = content.split(/\s+/).length;

                // Guard: Never nuke something that looks like actual content (> 50 words)
                if (wordCount > 50) return;

                if (
                    /Read Full Bio/i.test(content) ||
                    /Justice Department Reporter/i.test(content) ||
                    /is a politics reporter for CBS News Digital/i.test(content) ||
                    /is a reporter covering the Department of Justice/i.test(content) ||
                    /Add CBS News on Google/i.test(content)
                ) {
                    $el.remove();
                    return;
                }

                // Target "By [Author Name]" standalone lines
                if (/^By\s+(?:Jacob Rosen|Jake Rosen|Melissa Quinn)/i.test(content) ||
                    /is a Times reporter/i.test(content) ||
                    /is a Times correspondent/i.test(content)
                ) {
                    $el.remove();
                }
            });

            cleaned = $.html();
        } catch (e) {
            console.error('[cleanArticleContent] Cheerio error, falling back to regex:', e);
        }
    }

    // 3. REGEX SCRUB (Redundancy for plain text or markdown)
    cleaned = cleaned
        // Nuke explicit multiline bio block mentioned by user
        .replace(/By\s*\n\s*Jacob Rosen\s*\n\s*Justice Department Reporter/gi, '')
        .replace(/By\s*Jacob Rosen\s*Justice Department Reporter/gi, '')

        // Nuke author fragments
        .replace(/Jacob Rosen is a reporter covering the Department of Justice\./gi, '')
        .replace(/Jake Rosen is a reporter covering the Department of Justice\./gi, '')
        .replace(/Melissa Quinn is a politics reporter for CBS News Digital\./gi, '')
        .replace(/Read Full Bio/gi, '')
        .replace(/Add CBS News on Google/gi, '')

        // Nuke markdown portraits
        .replace(/!\[[^\]]*?(?:jacob|jake|rosen|quinn)[^\]]*?\]\([^)]*?\)/gi, '')
        .replace(/!\[[^\]]*?\]\([^)]*?(?:jacob|jake|rosen|quinn|cbsnewsstatic)[^)]*?\)/gi, '')

        // Nuke CBS assets URLs
        .replace(/https?:\/\/assets1\.cbsnewsstatic\.com\/hub\/i\/[^"'\s\n)]+/gi, '');

    // 4. BOILERPLATE SCRUB
    cleaned = cleaned
        .replace(/You have a preview view of this article while we are checking your access\.\s*When we have confirmed access, the full article content will load\./gi, '')
        .replace(/Thank you for your patience while we verify access\./gi, '')
        .replace(/Already a subscriber\?\s*Log in\s*\./gi, '')
        .replace(/Want all of The Times\?\s*Subscribe\s*\./gi, '')
        .replace(/Download (?:The )?California Post App, follow us on social, and subscribe to our newsletters/gi, '')

        // --- NYT Specific Bio & Meta Scrubbing ---
        .replace(/(?:[^.]*?)is a (?:Times|New York Times) (?:reporter|correspondent|columnist|editor|contributor)(?:[^.]*?)\./gi, '')
        .replace(/(?:[^.]*?)covers (?:.*?) for (?:The )?New York Times(?:[^.]*?)\./gi, '')
        .replace(/(?:[^.]*?)has been a (?:.*?) for (?:The )?Times since \d{4}(?:[^.]*?)\./gi, '')
        .replace(/(?:[^.]*?)is an? (?:.*?) based in (?:[^.]*?)\./gi, '')
        .replace(/(?:[^.]*?)is a (?:business|tech|politics|science|health|style|sports) reporter.*/gi, '')
        .replace(/Reporting from (?:.*?) \. /gi, '')
        .replace(/Follow (?:.*?) on (?:Twitter|X|Instagram|LinkedIn).*/gi, '')

        // Credits & Reporting
        .replace(/(?:Reporting|Additional reporting) (?:was )?contributed by.*/gi, '')
        .replace(/.*contributed reporting\./gi, '')
        .replace(/Credit\s*\.\.\..*/gi, '')
        .replace(/A version of this article appears in print on.*/gi, '')

        // Related coverage
        .replace(/Our Coverage of (?:.*)/gi, '')
        .replace(/Read more about.*/gi, '')

        // Boilerplate & Subscription
        .replace(/Copyright\s*\d{4}\s*The New York Times Company/gi, '')
        .replace(/Give this article.*/gi, '')
        .replace(/Already a subscriber\?.*Log in\./gi, '')
        .replace(/Want all of The Times\?.*Subscribe\./gi, '')
        .replace(/The Times is (?:committed|dedicated) to publishing.*/gi, '')
        .replace(/To (?:subscribe|get the full article).*/gi, '')
        .replace(/See more at nytimes\.com.*/gi, '')
        .replace(/If you are in Reader mode please exit and log into your Times account, or subscribe for all of The Times\./gi, '')
        .replace(/View more on Instagram/gi, '')
        .replace(/Via The New York Post/gi, '')

        // --- WSVN & AP Specific Boilerplate ---
        .replace(/Join our Newsletter for the latest news right to your inbox/gi, '')
        .replace(/Copyright\s*\d{4}\s*The Associated Press\..*All rights reserved\./gi, '')
        .replace(/This material may not be published, broadcast, rewritten or redistributed\./gi, '')
        .replace(/<a[^>]*class="excerpt-read-more"[^>]*>Read More<\/a>/gi, '')
        .replace(/Read More/gi, '')

        // --- AOL Specific Boilerplate ---
        .replace(/\d+\s*\/\s*\d+\s*/g, '') // Carousel fragments like "1 / 0"
        .replace(/What do the (?:.*?) show\?\s*See photos/gi, '')
        .replace(/For more (?:.*?) news and newsletters.*/gi, '')
        .replace(/┬⌐\s*202\d\s*AOL Media LLC.*/gi, '')

        // --- CNBC Specific Boilerplate ---
        .replace(/watch now/gi, '')
        .replace(/CNBC Newsletters.*/gi, '')
        .replace(/Sign up for (?:.*) Newsletters.*/gi, '')
        .replace(/Trending Now.*/gi, '');

    // --- Fox News: Targeted junk line removal (keep closing sentences between junk) ---
    cleaned = cleaned
        // CTA buttons
        .replace(/CLICK HERE TO (?:GET|DOWNLOAD) THE FOX NEWS APP\.?/gi, '')
        .replace(/CLICK HERE TO GET THE FOX BUSINESS APP\.?/gi, '')
        .replace(/CLICK HERE FOR MORE .*(?:ON FOXNEWS\.COM|COVERAGE)\.?/gi, '')
        .replace(/GET FOX BUSINESS ON THE GO.*/gi, '')
        // CyberGuy newsletter/quiz blocks
        .replace(/Sign up for my FREE CyberGuy Report[\s\S]*?(?:newsletter|CYBERGUY\.COM)\s*(?:newsletter)?\.?/gi, '')
        .replace(/Get (?:Kurt's )?free CyberGuy (?:Report|Newsletter)[\s\S]*?(?:newsletter|CYBERGUY\.COM)\s*(?:newsletter)?\.?/gi, '')
        .replace(/Take my quiz[\s\S]*?(?:Cyberguy\.com|quiz here)[^\n]*/gi, '')
        .replace(/Got a tech question\?[^\n]*/gi, '')
        .replace(/For more of my tech tips & security alerts[^\n]*/gi, '')
        // Social follows
        .replace(/Follow Fox News Digital's?\s*\w*\s*coverage on (?:X|Twitter).*$/gim, '')
        .replace(/(?:Follow|Subscribe to) (?:the )?Fox News .*(?:newsletter|Huddle).*$/gim, '')
        // Copyright / boilerplate
        .replace(/Copyright\s*\d{4}\s*(?:CyberGuy\.com|Fox News Network)[^.]*\.?\s*All rights reserved\.?/gi, '')
        .replace(/NEW\s*You can now listen to Fox News articles!?/gi, '')
        .replace(/SIGN UP FOR .*/gi, '');

    // --- Fox News: Hard truncation points (everything after is junk) ---
    // "Related Article" section — always appears at the very end
    const relatedCutoff = cleaned.search(/\n\s*Related Articles?\s*\n/i);
    if (relatedCutoff > 200) {
        cleaned = cleaned.substring(0, relatedCutoff).trim();
    }
    // Author bio: "Name is a/an [adjective] reporter/journalist for Fox News..."
    const authorBioCutoff = cleaned.search(/[A-Z][a-z]+\s+(?:"[^"]*"\s+)?[A-Z][a-z]+\s+is (?:a |an )(?:\w+\s+)*?(?:reporter|journalist|correspondent|anchor|contributor|host)\s+(?:for |(?:covering|based|who)\s)/i);
    if (authorBioCutoff > 200) {
        cleaned = cleaned.substring(0, authorBioCutoff).trim();
    }
    // "All rights reserved" catches non-bio endings
    const foxCutoff = cleaned.search(/All rights reserved\.?/i);
    if (foxCutoff > 200) {
        cleaned = cleaned.substring(0, foxCutoff).trim();
    }
    // Award-winning journalist bio pattern
    cleaned = cleaned.replace(/[A-Z][a-z]+ (?:"[^"]*" )?[A-Z][a-z]+ is an award-winning (?:tech )?journalist[^.]*\./gi, '');

    // Cleanup horizontal whitespace and punctuation issues
    cleaned = cleaned
        .replace(/[ \t]{2,}/g, ' ')
        .replace(/\.\s+\./g, '.')
        .replace(/[ \t]+\n/g, '\n')
        .replace(/\n[ \t]+/g, '\n')
        .replace(/\n{3,}/g, '\n\n')
        .trim();

    // 5. CLEANUP
    if (isHtml) {
        // Remove empty tags
        cleaned = cleaned.replace(/<p[^>]*>\s*(?:<br\s*\/?>|&nbsp;|\\n)*\s*<\/p>/gi, '');
    } else {
        // Remove empty lines
        cleaned = cleaned.split('\n').filter(line => line.trim().length > 0).join('\n\n');
    }

    return cleaned.trim();
}

/**
 * Normalizes a URL by removing tracking parameters and trailing slashes.
 */
export function normalizeUrl(url: string): string {
    if (!url) return '';
    try {
        const parsed = new URL(url);
        const paramsToKeep = ['id', 'v', 'p', 'query'];
        const searchParams = new URLSearchParams();
        parsed.searchParams.forEach((val, key) => {
            if (paramsToKeep.includes(key) || !key.startsWith('utm_')) {
                searchParams.append(key, val);
            }
        });
        parsed.search = searchParams.toString();
        parsed.hash = '';
        return parsed.toString().toLowerCase().replace(/\/$/, "");
    } catch {
        return url.toLowerCase().trim();
    }
}

import crypto from 'crypto';

/**
 * Generates a stable ID for an article based on its URL.
 */
export function getArticleId(url: string): string {
    const normalized = normalizeUrl(url);
    return crypto.createHash('md5').update(normalized).digest('hex');
}

/** 
 * Legacy adapter for RSS v2 
 */
export function toNewsArticle(raw: any): NewsArticle {
    return {
        article_id: raw.id || getArticleId(raw.source_url || raw.link),
        title: raw.title,
        description: raw.description,
        content: raw.content,
        link: raw.source_url || raw.link,
        pubDate: raw.pub_date || raw.pubDate || new Date().toISOString(),
        source_id: raw.source_id,
        source_name: raw.source_name,
        image_url: raw.hero_image || raw.image_url,
        creator: raw.author || raw.creator,
        category: raw.category || [],
        video_links: raw.video_links,
        media_gallery: raw.gallery,
        media: raw.media,
        is_enriched: false,
    };
}

/**
 * Canonical 12-hour AM/PM Eastern Time formatters for NouGenNews.
 */
export function formatNewsTime(dateInput: string | number | Date | null | undefined): string {
    if (!dateInput) return '';
    try {
        const d = new Date(dateInput);
        if (isNaN(d.getTime())) return '';
        return new Intl.DateTimeFormat('en-US', {
            timeZone: 'America/New_York',
            hour: 'numeric',
            minute: '2-digit',
            hour12: true,
            timeZoneName: 'short'
        }).format(d);
    } catch {
        return '';
    }
}

export function formatNewsDate(dateInput: string | number | Date | null | undefined, locale = 'en-US'): string {
    if (!dateInput) return '';
    try {
        const d = new Date(dateInput);
        if (isNaN(d.getTime())) return '';
        return new Intl.DateTimeFormat(locale, {
            timeZone: 'America/New_York',
            weekday: 'short',
            month: 'short',
            day: 'numeric',
            year: 'numeric'
        }).format(d);
    } catch {
        return '';
    }
}

export function formatNewsDateTime(dateInput: string | number | Date | null | undefined, locale = 'en-US'): string {
    if (!dateInput) return '';
    try {
        const d = new Date(dateInput);
        if (isNaN(d.getTime())) return '';
        const datePart = formatNewsDate(d, locale);
        const timePart = formatNewsTime(d);
        return datePart && timePart ? `${datePart} at ${timePart}` : datePart || timePart;
    } catch {
        return '';
    }
}
