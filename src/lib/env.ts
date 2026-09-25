// 🌍 Environment Loading (Node-only runtime)
if (typeof window === 'undefined' && !process.env.VERCEL) {
    try {
        const fs = require('fs');
        const path = require('path');
        const localEnv = path.resolve(process.cwd(), '.env.local');
        if (fs.existsSync(localEnv)) {
            try {
                const lines = fs.readFileSync(localEnv, 'utf8').split('\n');
                for (const line of lines) {
                    const trimmed = line.trim();
                    if (!trimmed || trimmed.startsWith('#')) continue;
                    const eqIdx = trimmed.indexOf('=');
                    if (eqIdx !== -1) {
                        const key = trimmed.slice(0, eqIdx).trim();
                        let val = trimmed.slice(eqIdx + 1).trim();
                        if ((val.startsWith('"') && val.endsWith('"')) || (val.startsWith("'") && val.endsWith("'"))) {
                            val = val.slice(1, -1);
                        }
                        process.env[key] = val;
                    }
                }
                console.log(`📡 [EnvLoader] Loaded .env.local`);
            } catch (err: any) {
                console.warn(`⚠️ [EnvLoader] Failed to read .env.local: ${err.message}`);
            }
        }

        // 🛡️ [NouGenAi Hardening] Auto-Detection for Service Account
        const saPath = path.resolve(process.cwd(), 'service-account.json');
        if (fs.existsSync(saPath)) {
            try {
                const sa = JSON.parse(fs.readFileSync(saPath, 'utf8'));
                process.env.FIREBASE_PROJECT_ID = sa.project_id || sa.projectId;
                process.env.FIREBASE_CLIENT_EMAIL = sa.client_email || sa.clientEmail;
                process.env.FIREBASE_PRIVATE_KEY = sa.private_key || sa.privateKey;
                process.env.GOOGLE_APPLICATION_CREDENTIALS = saPath;
            } catch (err) {
                const message = err instanceof Error ? err.message : String(err);
                console.warn(`⚠️ [EnvLoader] Found service-account.json but failed to parse: ${message}`);
            }
        }
    } catch (err: any) {
        console.error(`❌ [EnvLoader] Fatal Initialization Error: ${err.message}`);
    }
}



/**

 * NouGen Environment Configuration Module

 * Single source of truth for all environment variables.

 */



export const env = {

    // AI Services (CRITICAL CLOUD SENSOR) ⚛️

    gemini: {

        // Moved to environment variable (GEMINI_API_KEY) for security and 4KB limit

        apiKey: process.env.GEMINI_API_KEY || '',

    },



    // News APIs (Watchtower Only - Default Empty for Cloud) 🛰️

    news: {

        newsDataApiKey: process.env.NEWSDATA_API_KEY || '',

        theNewsApiTokens: [process.env.THENEWSAPI_API_TOKEN, process.env.THENEWSAPI_TOKEN].filter(Boolean) as string[],

        newsMeshApiKey: process.env.NEWSMESH_API_KEY || '',

        newsApiAiKey: process.env.NEWSAPI_AI_KEY || '',

        newsApiAiKey2: process.env.NEWSAPI_AI_KEY_2 || '',

        newsApiOrgKey: process.env.NEWSAPI_ORG_KEY || '',

        gNewsApiKey: process.env.GNEWS_API_KEY || '',

        worldNewsApiKey: process.env.WORLDNEWS_API_KEY || '',

        serpApiKey: process.env.SERPAPI_KEY || '',

        discogsConsumerKey: process.env.DISCOGS_CONSUMER_KEY || '',

        discogsConsumerSecret: process.env.DISCOGS_CONSUMER_SECRET || '',

        apiUrl: process.env.NEWS_API_URL || 'http://localhost:3000/api/news',

    },



    // Cloudinary (Watchtower Only - Default Empty for Cloud) 🛰️

    cloudinary: {

        cloudName: process.env.CLOUDINARY_CLOUD_NAME || '',

        apiKey: process.env.CLOUDINARY_API_KEY || '',

        apiSecret: process.env.CLOUDINARY_API_SECRET || '',

    },



    // Firebase Client (Public - Hardcoded for Zero Weight) ⚛️

    firebase: {

        apiKey: process.env.NEXT_PUBLIC_FIREBASE_API_KEY,

        authDomain: process.env.NEXT_PUBLIC_FIREBASE_AUTH_DOMAIN,

        projectId: process.env.NEXT_PUBLIC_FIREBASE_PROJECT_ID,

        storageBucket: process.env.NEXT_PUBLIC_FIREBASE_STORAGE_BUCKET,

        messagingSenderId: process.env.NEXT_PUBLIC_FIREBASE_MESSAGING_SENDER_ID,

        appId: process.env.NEXT_PUBLIC_FIREBASE_APP_ID,

        measurementId: process.env.NEXT_PUBLIC_FIREBASE_MEASUREMENT_ID,

    },



    // Firebase Admin (CRITICAL CLOUD SENSOR) ⚛️

    firebaseAdmin: {

        projectId: process.env.FIREBASE_PROJECT_ID || '',

        clientEmail: process.env.FIREBASE_CLIENT_EMAIL || '',

        privateKey: (process.env.FIREBASE_PRIVATE_KEY || '').replace(/\\n/g, '\n'),

        privateKeyB64: process.env.FIREBASE_PRIVATE_KEY_B64 || '', // 🔋 Lambda Efficiency Lane

    },



    // Vertex AI / Google Cloud

    vertex: {

        projectId: process.env.VERTEX_PROJECT_ID || process.env.FIREBASE_PROJECT_ID || '',

        location: process.env.VERTEX_LOCATION || 'us-central1',

        reasoningEngineId: process.env.NOUGEN_REASONING_ENGINE_ID || '',

        agentEngineName: process.env.VERTEX_AGENT_ENGINE_NAME || '',

        forceVertex: process.env.FORCE_VERTEX === 'true',

        fleetPool: [], // Dead Wood Purged per Dave's Directive

    },



    // Google Drive

    drive: {

        folderId: process.env.GOOGLE_DRIVE_FOLDER_ID || '',

        impersonateEmail: process.env.GOOGLE_DRIVE_EMAIL || 'dave@whovisions.com',

    },



    // Google Weather API

    weather: {

        apiKey: process.env.GOOGLE_WEATHER_API_KEY || '',

    },



    // Site Internal API

    api: {

        baseUrl: process.env.NEXT_PUBLIC_API_BASE_URL || (typeof window !== 'undefined'

            ? `http://${window.location.hostname}:8080`

            : 'http://localhost:8080'),

    },



    // Stitch MCP

    stitch: {

        url: process.env.NEXT_PUBLIC_STITCH_MCP_URL || process.env.STITCH_MCP_URL || '',
        apiKey: process.env.NEXT_PUBLIC_STITCH_MCP_KEY || process.env.STITCH_MCP_KEY || '',

    },



    // NouGenAi Connectors

    connectors: {

        discord: {

            token: process.env.DISCORD_BOT_TOKEN || '',

            applicationId: process.env.DISCORD_APPLICATION_ID || '1289549259853529139',

            publicKey: process.env.DISCORD_PUBLIC_KEY || '846f5b4f32c6cd87c6d4dfc2f359987ecff1f30b32e8d8fd46585da0bcd444d0',

        },

        whatsapp: {

            sessionPath: process.env.WHATSAPP_SESSION_PATH || './.wwebjs_auth',

        },

        telegram: {

            token: process.env.TELEGRAM_BOT_TOKEN || '',

        }

    }

};



// Validation Helper (Optional, but useful for debugging)

export function validateEnv() {



    const criticalKeys = [

        'firebase.apiKey',

        'firebase.projectId',

        'gemini.apiKey'

    ];



    criticalKeys.forEach(keyPath => {

        const value = keyPath.split('.').reduce((obj: any, key) => obj?.[key], env);

        if (!value) {

            console.warn(`[Env Validation] Missing critical env variable: ${keyPath}`);

        }

    });

}

