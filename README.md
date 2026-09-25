# NouGenNews — Elite News Intelligence Pipeline

> **Who Visions LLC** — NouGenAi News Intelligence Pipeline
> Elite RSS ingestion, article image scraping, Google Drive storage, and real-time news feed.

## 🚀 Performance

| Metric | Sequential v1 | Elite v2 | Speedup |
|---|---|---|---|
| Scrape concurrency | 1 lane | 8 lanes | **8×** |
| Drive upload concurrency | 1 lane | 6 lanes | **6×** |
| Page read per article | Full page (~200KB) | Head-only (16KB + early abort) | **~12×** less bandwidth |
| DB writes | 1 UPDATE per row | Single batched transaction | **~50×** faster I/O |
| Feed fetching | Sequential | Promise.allSettled fanout | **~6×** |
| DNS lookups | Cold, per-request | Pre-warmed in parallel | Eliminates ~100ms/host |

**Result: 58 articles with genuine images in 11.2 seconds.**

## 🏗️ Architecture

```
RSS Feeds (6 sources)
    │
    ├─ Promise.allSettled ──→ Parallel XML fetch
    │
    ▼
Extract Articles (top 8 per feed)
    │
    ├─ 8-lane Scrape Pool ──→ HEAD-only streaming (16KB)
    │                          ├─ og:image / twitter:image regex
    │                          ├─ JSON-LD image extraction
    │                          └─ AbortController.abort() on match
    │
    ├─ 6-lane Drive Pool ──→ Upload to Google Drive
    │                          └─ /api/media/{fileId} proxy URL
    │
    └─ Batch Transaction ──→ Single INSERT/UPSERT to SQLite
```

## 📡 News Sources

| Source | Category |
|---|---|
| TechCrunch | Technology |
| The Verge | Technology |
| Ars Technica | Technology |
| New York Times | Top Stories |
| BBC News | World |
| Wired | Technology |

## 🔑 Key Techniques

### Zero-Dep Concurrency Semaphore
```typescript
function createPool(maxConcurrency: number) {
    let active = 0;
    const queue: (() => void)[] = [];
    return async function <T>(fn: () => Promise<T>): Promise<T> {
        if (active >= maxConcurrency) {
            await new Promise<void>(resolve => queue.push(resolve));
        }
        active++;
        try { return await fn(); }
        finally { active--; queue.shift()?.(); }
    };
}
```

### Early-Abort Streaming Scraper
Only reads the first 16KB of each article page (the `<head>` section where `og:image` lives), then kills the TCP connection immediately.

### Batched SQLite Transactions
All DB writes happen in a single `BEGIN/COMMIT` transaction — one atomic fsync instead of N individual writes.

### DNS Pre-Warming
Resolves all unique hostnames in parallel before starting the scrape phase, eliminating cold DNS lookups from the critical path.

## 📦 Setup

```bash
# Clone
git clone https://github.com/Who-Visions/NouGenNews.git
cd NouGenNews

# Install
npm install

# Configure
cp .env.example .env.local
# Add your service-account.json for Google Drive access

# Run pipeline
npx tsx scripts/enrich_articles_with_real_images.ts

# Start server
npm run dev
```

## 🗄️ Google Drive Integration

Uses Domain-Wide Delegation with a service account to store article images in `dave@whovisions.com`'s Google Drive at zero API cost.

- **Folder**: `NouGenAi-site/news/`
- **Proxy**: `/api/media/[fileId]` returns raw image bytes
- **Auth**: JWT with `subject` delegation

## 📄 License

© 2026 Who Visions LLC. All rights reserved.
