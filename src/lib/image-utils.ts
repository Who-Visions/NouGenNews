/**
 * Image Utilities for NouGenAi
 * Client-safe functions for image handling and fallbacks.
 */

// Slug-aligned fallback images — keys match NewsSectionSlug values from the pipeline
export const FALLBACK_IMAGES: Record<string, string> = {
    // ── News ──
    'top-stories': 'https://images.unsplash.com/photo-1504711434969-e33886168f5c?auto=format&fit=crop&q=80&w=1200',
    'world': 'https://images.unsplash.com/photo-1521295121783-8a321d551ad2?auto=format&fit=crop&q=80&w=1200',
    'us': 'https://images.unsplash.com/photo-1485738422979-f5c462d49f74?auto=format&fit=crop&q=80&w=1200',
    'policy-power': 'https://images.unsplash.com/photo-1529107386315-e1a2ed48a620?auto=format&fit=crop&q=80&w=1200',
    'business': 'https://images.unsplash.com/photo-1460925895917-afdab827c52f?auto=format&fit=crop&q=80&w=1200',
    'technology': 'https://images.unsplash.com/photo-1518770660439-4636190af475?auto=format&fit=crop&q=80&w=1200',
    'science': 'https://images.unsplash.com/photo-1507413245164-6160d8298b31?auto=format&fit=crop&q=80&w=1200',
    'startups': 'https://images.unsplash.com/photo-1559136555-9303baea8ebd?auto=format&fit=crop&q=80&w=1200',
    'finance': 'https://images.unsplash.com/photo-1611974714652-70144760074f?auto=format&fit=crop&q=80&w=1200',
    'corporate': 'https://images.unsplash.com/photo-1486406146926-c627a92ad1ab?auto=format&fit=crop&q=80&w=1200',
    'legal': 'https://images.unsplash.com/photo-1589829545856-d10d557cf95f?auto=format&fit=crop&q=80&w=1200',
    'cybersecurity': 'https://images.unsplash.com/photo-1550751827-4bd374c3f58b?auto=format&fit=crop&q=80&w=1200',
    'elections': 'https://images.unsplash.com/photo-1540910419892-4a36d2c3266c?auto=format&fit=crop&q=80&w=1200',
    'space': 'https://images.unsplash.com/photo-1462331940025-496dfbfc7564?auto=format&fit=crop&q=80&w=1200',
    // ── Culture ──
    'entertainment': 'https://images.unsplash.com/photo-1603190287605-e6ade32fa852?auto=format&fit=crop&q=80&w=1200',
    'music': 'https://images.unsplash.com/photo-1493225457124-a3eb161ffa5f?auto=format&fit=crop&q=80&w=1200',
    'art': 'https://images.unsplash.com/photo-1541367777708-7905fe3296c0?auto=format&fit=crop&q=80&w=1200',
    'tv-streaming': 'https://images.unsplash.com/photo-1522869635100-9f4c5e86aa37?auto=format&fit=crop&q=80&w=1200',
    'gaming': 'https://images.unsplash.com/photo-1542751371-adc38448a05e?auto=format&fit=crop&q=80&w=1200',
    'fashion': 'https://images.unsplash.com/photo-1483985988355-763728e1935b?auto=format&fit=crop&q=80&w=1200',
    'food': 'https://images.unsplash.com/photo-1504674900247-0877df9cc836?auto=format&fit=crop&q=80&w=1200',
    'travel': 'https://images.unsplash.com/photo-1476514525535-07fb3b4ae5f1?auto=format&fit=crop&q=80&w=1200',
    'lifestyle': 'https://images.unsplash.com/photo-1545205597-3d9d02c29597?auto=format&fit=crop&q=80&w=1200',
    // ── Impact ──
    'health': 'https://images.unsplash.com/photo-1505751172876-fa1923c5c528?auto=format&fit=crop&q=80&w=1200',
    'climate': 'https://images.unsplash.com/photo-1504711434969-e33886168f5c?auto=format&fit=crop&q=80&w=1200',
    'diaspora': 'https://images.unsplash.com/photo-1526470498-9ae73c665de8?auto=format&fit=crop&q=80&w=1200',
    'sports': 'https://images.unsplash.com/photo-1461896756970-f09d1b6746f3?auto=format&fit=crop&q=80&w=1200',
    'education': 'https://images.unsplash.com/photo-1503676260728-1c00da094a0b?auto=format&fit=crop&q=80&w=1200',
    'communities': 'https://images.unsplash.com/photo-1529156069898-49953e39b3ac?auto=format&fit=crop&q=80&w=1200',
    'entrepreneurship': 'https://images.unsplash.com/photo-1519389950473-47ba0277781c?auto=format&fit=crop&q=80&w=1200',
    'careers': 'https://images.unsplash.com/photo-1454165804606-c3d57bc86b40?auto=format&fit=crop&q=80&w=1200',
    'infrastructure': 'https://images.unsplash.com/photo-1477959858617-67f85cf4f1df?auto=format&fit=crop&q=80&w=1200',
    // ── Editorial ──
    'opinion': 'https://images.unsplash.com/photo-1455390582262-044cdead277a?auto=format&fit=crop&q=80&w=1200',
    'investigations': 'https://images.unsplash.com/photo-1526378800651-c32d170fe6f8?auto=format&fit=crop&q=80&w=1200',
    'explainers': 'https://images.unsplash.com/photo-1434030216411-0b793f4b6f74?auto=format&fit=crop&q=80&w=1200',
    'analysis': 'https://images.unsplash.com/photo-1551288049-bebda4e38f71?auto=format&fit=crop&q=80&w=1200',
    'perspectives': 'https://images.unsplash.com/photo-1499750310107-5fef28a66643?auto=format&fit=crop&q=80&w=1200',
    'longform': 'https://images.unsplash.com/photo-1457369804613-52c61a468e7d?auto=format&fit=crop&q=80&w=1200',
    // ── Catch-alls ──
    'general': 'https://images.unsplash.com/photo-1504711434969-e33886168f5c?auto=format&fit=crop&q=80&w=1200',
    'briefing': 'https://images.unsplash.com/photo-1451187580459-43490279c0fa?auto=format&fit=crop&q=80&w=1200',
    'default': 'https://images.unsplash.com/photo-1504711434969-e33886168f5c?auto=format&fit=crop&q=80&w=1200',
};

const GENERIC_NEWS_POOL = [
    'https://images.unsplash.com/photo-1588681664899-f142ff2dc9b1?auto=format&fit=crop&q=80&w=1200', // newspaper blurred
    'https://images.unsplash.com/photo-1504711434969-e33886168f5c?auto=format&fit=crop&q=80&w=1200', // stack of papers
    'https://images.unsplash.com/photo-1557992260-ec58e38d363c?auto=format&fit=crop&q=80&w=1200', // newsprint
    'https://images.unsplash.com/photo-1495020689067-958852a7765e?auto=format&fit=crop&q=80&w=1200', // modern building abstract
    'https://images.unsplash.com/photo-1451187580459-43490279c0fa?auto=format&fit=crop&q=80&w=1200', // earth from space
    'https://images.unsplash.com/photo-1432821596592-e2c18b78144f?auto=format&fit=crop&q=80&w=1200', // reading laptop
    'https://images.unsplash.com/photo-1512314889357-e157c22f938d?auto=format&fit=crop&q=80&w=1200', // data patterns
    'https://images.unsplash.com/photo-1503694978374-8a2fa686963a?auto=format&fit=crop&q=80&w=1200', // typing keyboard
];

const CLOUDINARY_CLOUD = process.env.NEXT_PUBLIC_CLOUDINARY_CLOUD_NAME || process.env.CLOUDINARY_CLOUD_NAME || 'drlmiouym';

export function getCloudinaryUrl(articleId: string, transforms = 'f_auto,q_auto,w_1200'): string {
    if (!CLOUDINARY_CLOUD) return '';
    return `https://res.cloudinary.com/${CLOUDINARY_CLOUD}/image/upload/${transforms}/NouGenAi/news/${articleId}`;
}

/**
 * Returns the best image for an article, with fallback to category-specific stock photos.
 */
export function getArticleImage(
    image_url?: string,
    category?: string | string[],
    article_id?: string
): string {
    // 1. Valid image URL — return it (Drive proxy, Cloudinary, or external)
    if (image_url && image_url.length > 10 && !image_url.includes('createDummy') && !image_url.includes('undefined')) {
        // Optimize Cloudinary URLs
        if (image_url.includes('cloudinary.com')) {
            return getOptimizedUrl(image_url);
        }
        // Drive proxy URLs and external URLs pass through
        return image_url;
    }

    // 2. No valid URL — use category-specific fallback
    const categories = Array.isArray(category) ? category : [category].filter(Boolean) as string[];
    for (const cat of categories) {
        const key = cat.toLowerCase().trim();
        if (key !== 'general' && key !== 'default' && FALLBACK_IMAGES[key]) {
            return FALLBACK_IMAGES[key];
        }
    }

    // 3. Final fallback — rotate through generic news pool to avoid repetition
    if (article_id) {
        const hash = article_id.split('').reduce((acc, c) => acc + c.charCodeAt(0), 0);
        return GENERIC_NEWS_POOL[hash % GENERIC_NEWS_POOL.length];
    }

    return FALLBACK_IMAGES['default'];
}

/**
 * Detects if an image URL points to a 'hero' image (primary article header)
 */
export function isHeroImage(url: string | undefined): boolean {
    if (!url) return false;
    // Check for naming conventions used in our pipeline
    return url.includes('_hero') || url.includes('/NouGenAi/news/');
}

/**
 * Gets a standard inline image URL with proper sizing
 */
export function getInlineImageUrl(url: string, width = 800): string {
    if (!url || !url.includes('cloudinary.com')) return url;
    // Replace w_1200 or insert w_800
    if (url.includes('w_1200')) {
        return url.replace('w_1200', `w_${width}`);
    }
    if (url.includes('/upload/')) {
        return url.replace('/upload/', `/upload/f_auto,q_auto,w_${width}/`);
    }
    return url;
}

/**
 * Ensures a Cloudinary URL has optimization parameters.
 */
export function getOptimizedUrl(url: string): string {
    if (!url || !url.includes('cloudinary.com')) return url;
    if (url.includes('f_auto') && url.includes('q_auto')) return url;

    // Insert after /upload/
    if (url.includes('/upload/')) {
        return url.replace('/upload/', '/upload/f_auto,q_auto/');
    }
    return url;
}
