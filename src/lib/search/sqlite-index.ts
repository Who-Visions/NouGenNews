import type Database from 'better-sqlite3';
import path from 'path';
import fs from 'fs';
import { NewsArticle } from '../news-shared';
import { NouGenEngine } from '../nougen-engine';

const IS_SERVERLESS = !!(process.env.NET_PUBLIC_NETLIFY || process.env.NETLIFY || process.env.VERCEL);
let DB_PATH = path.join(process.cwd(), 'data', 'news.db');

try {
    const dataDir = path.join(process.cwd(), 'data');
    if (!fs.existsSync(dataDir)) {
        fs.mkdirSync(dataDir, { recursive: true });
    }
    DB_PATH = path.join(dataDir, 'news.db');
} catch (e) {
    // Read-only fallback
    DB_PATH = path.join('/tmp', 'news.db');
}

class SQLiteIndexService {
    private db?: Database.Database;
    private isHealthy: boolean = false;

    constructor() {
        let SQLiteDB;
        try {
            SQLiteDB = require('better-sqlite3');
        } catch (err) {
            console.warn('[SQLiteIndex] better-sqlite3 is not available in this environment. Falling back to default data store.');
            this.isHealthy = false;
            return;
        }

        try {
            console.log(`[SQLiteIndex] Initializing at: ${DB_PATH} (Serverless: ${IS_SERVERLESS})`);
            const db = new SQLiteDB(DB_PATH, { timeout: 5000 });
            this.db = db;
            db.pragma('journal_mode = WAL');
            db.pragma('busy_timeout = 5000');
            this.init();
            this.isHealthy = true;
        } catch (err) {
            console.error('[SQLiteIndex] Critical initialization failure:', err);
            this.isHealthy = false;
        }
    }

    private init() {
        const db = this.db;
        if (!db) return;
        
        // Create table with updated schema
        db.exec(`
            CREATE TABLE IF NOT EXISTS articles (
                id TEXT PRIMARY KEY,
                title TEXT,
                description TEXT,
                link TEXT,
                tags TEXT,
                pubDate TEXT,
                impact_score INTEGER,
                category TEXT,
                source_name TEXT,
                source_id TEXT,
                image_url TEXT,
                creator TEXT,
                embedding BLOB
            );
        `);

        // Migration: Rename or add columns to match NewsArticle type
        try {
            const info = db.pragma('table_info(articles)') as any[];

            // Check for new columns
            ['source_name', 'source_id', 'image_url', 'creator', 'embedding'].forEach(colName => {
                if (!info.some(col => col.name === colName)) {
                    console.log(`Migrating SQLite: Adding ${colName} column`);
                    db.exec(`ALTER TABLE articles ADD COLUMN ${colName} ${colName === 'embedding' ? 'BLOB' : 'TEXT'}`);
                }
            });

            // Check for old column names and rename if necessary
            const hasKeywords = info.some(col => col.name === 'keywords');
            if (hasKeywords) {
                console.log('Migrating SQLite: Renaming keywords to tags');
                db.exec('ALTER TABLE articles RENAME COLUMN keywords TO tags');
            }

            const hasStrategicImpact = info.some(col => col.name === 'strategic_impact');
            if (hasStrategicImpact) {
                console.log('Migrating SQLite: Renaming strategic_impact to impact_score');
                db.exec('ALTER TABLE articles RENAME COLUMN strategic_impact TO impact_score');
            }

            // Also ensure 'link' exists (from previous migration)
            const hasLink = info.some(col => col.name === 'link');
            if (!hasLink) {
                db.exec('ALTER TABLE articles ADD COLUMN link TEXT');
            }

            // Check if FTS table needs reconstruction (if it has old column names or missing source_name)
            try {
                const ftsInfo = db.pragma('table_info(articles_fts)') as any[];
                const ftsHasKeywords = ftsInfo.some(col => col.name === 'keywords');
                const ftsHasSource = ftsInfo.some(col => col.name === 'source_name');
                if (ftsHasKeywords || !ftsHasSource) {
                    console.log('Migrating SQLite: Reconstructing FTS table for new columns');
                    db.exec('DROP TABLE IF EXISTS articles_fts');
                }
            } catch (e) {
                // If table doesn't exist, that's fine
            }
        } catch (err) {
            console.error('Migration failed:', err);
        }

        // Re-create FTS table and triggers
        db.exec(`
            CREATE VIRTUAL TABLE IF NOT EXISTS articles_fts USING fts5(
                id UNINDEXED,
                title,
                description,
                tags,
                source_name,
                content='articles',
                content_rowid='rowid'
            );

            -- Ensure we always use the latest triggers matching current columns
            DROP TRIGGER IF EXISTS articles_ai;
            DROP TRIGGER IF EXISTS articles_ad;
            DROP TRIGGER IF EXISTS articles_au;

            -- Triggers to keep FTS index in sync
            CREATE TRIGGER articles_ai AFTER INSERT ON articles BEGIN
                INSERT INTO articles_fts(rowid, title, description, tags, source_name)
                VALUES (new.rowid, new.title, new.description, new.tags, new.source_name);
            END;

            CREATE TRIGGER articles_ad AFTER DELETE ON articles BEGIN
                INSERT INTO articles_fts(articles_fts, rowid, title, description, tags, source_name)
                VALUES('delete', old.rowid, old.title, old.description, old.tags, old.source_name);
            END;

            CREATE TRIGGER articles_au AFTER UPDATE ON articles BEGIN
                INSERT INTO articles_fts(articles_fts, rowid, title, description, tags, source_name)
                VALUES('delete', old.rowid, old.title, old.description, old.tags, old.source_name);
                INSERT INTO articles_fts(rowid, title, description, tags, source_name)
                VALUES (new.rowid, new.title, new.description, new.tags, new.source_name);
            END;
        `);
    }

    public async indexArticle(article: NewsArticle) {
        if (!this.isHealthy || !this.db || !article.article_id) return;

        // Generate Multimodal Embedding (Async) - documentation compliant prefix logic handled by NouGenEngine
        const embedding = await NouGenEngine.generateEmbeddings(
            `${article.title} ${article.description || ''} ${(article.tags || []).join(' ')}`,
            'retrieval_document'
        );

        try {
            const insert = this.db.prepare(`
                INSERT INTO articles (id, title, description, link, tags, pubDate, impact_score, category, source_name, source_id, image_url, creator, embedding)
                VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
                ON CONFLICT(id) DO UPDATE SET
                    title=excluded.title,
                    description=excluded.description,
                    link=excluded.link,
                    tags=excluded.tags,
                    pubDate=excluded.pubDate,
                    impact_score=excluded.impact_score,
                    category=excluded.category,
                    source_name=excluded.source_name,
                    source_id=excluded.source_id,
                    image_url=excluded.image_url,
                    creator=excluded.creator,
                    embedding=excluded.embedding
            `);

            insert.run(
                article.article_id,
                article.ai_title || article.title,
                article.ai_summary || article.description || '',
                article.link || '',
                (article.tags || []).join(', '),
                article.pubDate,
                article.impact_score || 0,
                Array.isArray(article.category) ? article.category.join(', ') : (article.category || ''),
                article.source_name || '',
                article.source_id || '',
                article.image_url || '',
                Array.isArray(article.creator) ? article.creator.join(', ') : (article.creator || ''),
                embedding.length > 0 ? Buffer.from(new Float32Array(embedding).buffer) : null
            );
        } catch (err) {
            console.error('[SQLiteIndex] Failed to index article:', article.article_id, err);
        }
    }

    /**
     * Semantic Search Interface (Valerion QB Lane)
     * Performs cosine similarity ranking locally on embedded vectors.
     */
    public async searchSemantic(query: string, limit: number = 10): Promise<NewsArticle[]> {
        if (!this.isHealthy || !this.db) return [];
        
        const { NouGenEngine } = await import('../nougen-engine');
        const queryVector = await NouGenEngine.generateEmbeddings(query, 'retrieval_query');
        
        if (queryVector.length === 0) return this.search(query, limit);

        const rows = this.db.prepare('SELECT id, title, description, embedding FROM articles WHERE embedding IS NOT NULL').all() as any[];
        
        const results = rows.map(row => {
            const vector = new Float32Array(new Uint8Array(row.embedding).buffer);
            // Dot Product (Vectors are already normalized via MRL-768 in NouGenEngine)
            let similarity = 0;
            for (let i = 0; i < Math.min(queryVector.length, vector.length); i++) {
                similarity += queryVector[i] * vector[i];
            }
            return { ...row, similarity };
        });

        const sorted = results
            .sort((a, b) => b.similarity - a.similarity)
            .slice(0, limit);

        return sorted.map(s => this.getArticleById(s.id)!);
    }

    public search(query: string, limit: number = 20): NewsArticle[] {
        if (!this.isHealthy || !this.db || !query || query.trim().length === 0) return [];

        let searchStmt: string;
        let params: any[] = [];

        // Check if query starts with "source:"
        if (query.toLowerCase().startsWith('source:')) {
            const sourceTerm = query.slice(7).trim();
            searchStmt = `
                SELECT 1.0 as score, *
                FROM articles
                WHERE source_name LIKE ? OR source_id LIKE ?
                ORDER BY pubDate DESC
                LIMIT ?
            `;
            params = [`%${sourceTerm}%`, `%${sourceTerm}%`, limit];
        } else {
            // Standard FTS5 search
            searchStmt = `
                SELECT bm25(articles_fts) as score, a.*
                FROM articles_fts f
                JOIN articles a ON a.rowid = f.rowid
                WHERE articles_fts MATCH ?
                ORDER BY score
                LIMIT ?
            `;
            // Sanitize search query for FTS5
            const cleanQuery = query.replace(/[*"':]/g, ' ').trim();
            const sanitizedQuery = cleanQuery.split(/\s+/).filter(q => q.length > 0).map(q => `${q}*`).join(' ');

            if (!sanitizedQuery) return [];
            params = [sanitizedQuery, limit];
        }

        try {
            const results = this.db.prepare(searchStmt).all(...params) as any[];
            return results.map(r => ({
                ...r,
                article_id: r.id,
                creator: r.creator ? r.creator.split(', ') : null,
                category: r.category ? r.category.split(', ') : [],
                tags: r.tags ? r.tags.split(', ') : []
            }));
        } catch (e) {
            console.error('[SQLiteIndex] Search Error with query:', query, e);
            return [];
        }
    }

    public getArticleById(id: string): NewsArticle | null {
        if (!this.isHealthy || !this.db) return null;
        try {
            const row = this.db.prepare('SELECT * FROM articles WHERE id = ?').get(id) as any;
            if (!row) return null;

            return {
                ...row,
                article_id: row.id,
                creator: row.creator ? row.creator.split(', ') : null,
                category: row.category ? row.category.split(', ') : [],
                tags: row.tags ? row.tags.split(', ') : []
            };
        } catch (e) {
            console.error('[SQLiteIndex] getArticleById Error:', id, e);
            return null;
        }
    }

    public getArticlesByDate(dateStr: string, limit: number = 50): NewsArticle[] {
        if (!this.isHealthy || !this.db) return [];
        try {
            // dateStr is YYYY-MM-DD
            const rows = this.db.prepare(`
                SELECT *
                FROM articles
                WHERE pubDate LIKE ?
                ORDER BY datetime(pubDate) DESC
                LIMIT ?
            `).all(`${dateStr}%`, limit) as any[];

            return rows.map(row => ({
                ...row,
                article_id: row.id,
                creator: row.creator ? row.creator.split(', ') : null,
                category: row.category ? row.category.split(', ') : [],
                tags: row.tags ? row.tags.split(', ') : []
            }));
        } catch (e) {
            console.error('[SQLiteIndex] getArticlesByDate Error:', dateStr, e);
            return [];
        }
    }

    public getLatestArticles(limit: number = 50): NewsArticle[] {
        if (!this.isHealthy || !this.db) return [];
        try {
            const rows = this.db.prepare(`
                SELECT *
                FROM articles
                ORDER BY datetime(pubDate) DESC, pubDate DESC
                LIMIT ?
            `).all(limit) as any[];

            return rows.map(row => ({
                ...row,
                article_id: row.id,
                creator: row.creator ? row.creator.split(', ') : null,
                category: row.category ? row.category.split(', ') : [],
                tags: row.tags ? row.tags.split(', ') : []
            }));
        } catch (e) {
            console.error('[SQLiteIndex] getLatestArticles Error:', e);
            return [];
        }
    }

    public getStats() {
        if (!this.isHealthy || !this.db) return { total: 0 };
        try {
            const count = this.db.prepare('SELECT COUNT(*) as total FROM articles').get() as any;
            return { total: count.total };
        } catch {
            return { total: 0 };
        }
    }
}

// Lazy singleton.
//
// This class loads better-sqlite3, a native module. Instantiating it at module
// scope meant every route importing this file paid that cost at import time --
// and a native ABI mismatch aborts the process instead of throwing, so the
// constructor's try/catch cannot contain it. That takes down the whole
// serverless function before any request handler runs.
//
// On serverless the index is also pointless: /tmp is per-invocation, so nothing
// written survives to the next request. There we hand back a permanently-empty
// stub and let Firestore be the source of truth.
class NullIndexService {
    public async indexArticle(_article: NewsArticle) { /* no-op */ }
    public async searchSemantic(_query: string, _limit?: number): Promise<NewsArticle[]> { return []; }
    public search(_query: string, _limit?: number): NewsArticle[] { return []; }
    public getArticleById(_id: string): NewsArticle | null { return null; }
    public getArticlesByDate(_dateStr: string, _limit?: number): NewsArticle[] { return []; }
    public getLatestArticles(_limit?: number): NewsArticle[] { return []; }
    public getStats() { return { total: 0 }; }
}

type IndexService = SQLiteIndexService | NullIndexService;

let _instance: IndexService | undefined;

function getIndex(): IndexService {
    if (_instance) return _instance;
    if (IS_SERVERLESS) {
        _instance = new NullIndexService();
        return _instance;
    }
    try {
        _instance = new SQLiteIndexService();
    } catch (err) {
        console.error('[SQLiteIndex] Falling back to null index:', err);
        _instance = new NullIndexService();
    }
    return _instance;
}

// Preserves the `sqliteIndex.method()` call sites while deferring construction
// to first use.
export const sqliteIndex = new Proxy({} as SQLiteIndexService, {
    get(_target, prop: string) {
        const value = (getIndex() as any)[prop];
        return typeof value === 'function' ? value.bind(getIndex()) : value;
    },
});
