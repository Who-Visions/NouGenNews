<!-- nougen-readme-compiler: v1 | persona: fleet-operator (agent-fleet-operators) [4447bbb01c1222f1] -->

# 🚀 NouGenNews — Elite News Intelligence Pipeline

Elite RSS ingestion, article image scraping, Google Drive storage, and real-time news feed, engineered for maximum throughput and minimal operational overhead.

## 📚 Contents
- [📋 Table of Contents](#table-of-contents)
- [⚙️ Installation and Deployment Doctrine](#installation-and-deployment-doctrine)
- [🏗️ Core Architecture: The Throughput Engine](#core-architecture-the-throughput-engine)
- [⚡ Performance Metrics: Quantifying Leverage](#performance-metrics-quantifying-leverage)
- [🔑 Key Operational Techniques (Doctrine)](#key-operational-techniques-doctrine)
- [🔗 Integration Points and Data Persistence](#integration-points-and-data-persistence)

## 📋 📋 Table of Contents

A high-level overview of the operational doctrine for this pipeline.

## ⚙️ ⚙️ Installation and Deployment Doctrine

Establish the operational baseline by cloning the repository and provisioning the necessary runtime environment. This sequence ensures all dependencies are correctly mapped before initiating the feed ingestion phase.

## 🏗️ 🏗️ Core Architecture: The Throughput Engine

The system operates on a parallel, staged execution model designed for maximum leverage. We utilize parallel XML fetching, an 8-lane scrape pool employing head-only streaming (16KB reads) to minimize bandwidth expenditure, and a 6-lane Drive pool for concurrent storage. All persistent writes are consolidated into a single batched SQLite transaction, maximizing I/O efficiency.

## ⚡ ⚡ Performance Metrics: Quantifying Leverage

The pipeline demonstrates significant operational gains. Key metrics include an 8x speedup in scrape concurrency, a ~50x acceleration in DB writes via batched transactions, and reduced bandwidth usage by ~12x through early-abort streaming. This architecture prioritizes speed and resource efficiency over brute-force processing.

## 🔑 🔑 Key Operational Techniques (Doctrine)

The system relies on several core techniques that define its operational advantage: Zero-Dep Concurrency Semaphores to manage resource contention, Early-Abort Streaming Scrapers to terminate connections immediately upon finding necessary data, and DNS Pre-Warming to eliminate cold lookups from the critical path. These techniques ensure predictable, high-velocity execution.

## 🔗 🔗 Integration Points and Data Persistence

Data persistence leverages a single batched SQLite transaction for atomic writes, ensuring data integrity without the overhead of numerous individual fsync operations. Image assets are managed via Domain-Wide Delegation with Google Drive, utilizing a proxy endpoint (`/api/media/[fileId]`) for zero API cost storage.

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

<!-- nougen:fleet-role:begin (generated from NouGenRelay fleet/manifest.json; edit the manifest, not this block) -->
## Fleet role

| | |
|---|---|
| Role | news intelligence pipeline |
| Kind | satellite |
| Status | canonical |
| Canonical for | news |
| Visibility | public |

<!-- nougen:fleet-role:end -->

## 🔗 Links

- [Source Repository](<https://github.com/Who-Visions/NouGenNews>)
