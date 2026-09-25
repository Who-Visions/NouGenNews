/**
 * NouGenAi Google Drive Storage Module
 * Primary media storage with intelligent folder management.
 * 
 * Folder structure (auto-created in dave@whovisions.com Drive):
 *   NouGenAi-site/
 *   ├── news/           ← Article images from RSS feeds
 *   ├── ai-gens/        ← AI-generated visuals
 *   └── thumbnails/     ← Processed thumbnails
 */

import { google, drive_v3 } from 'googleapis';
import { env } from './env';
import sharp from 'sharp';
import fs from 'fs';
import path from 'path';
import { Readable } from 'stream';

// ─── TYPES ───────────────────────────────────────────────────
type SubFolder = 'news' | 'ai-gens' | 'thumbnails';

interface DriveUploadResult {
    fileId: string;
    proxyUrl: string;
    directUrl: string;
}

// ─── SINGLETON DRIVE CLIENT ──────────────────────────────────
let driveClient: drive_v3.Drive | null = null;
let folderCache: Record<string, string> = {};  // subfolder name → folderId

function getDriveClient(): drive_v3.Drive | null {
    if (driveClient) return driveClient;

    let clientEmail = env.firebaseAdmin.clientEmail;
    let privateKey = env.firebaseAdmin.privateKey;

    if (!clientEmail || !privateKey) {
        try {
            const saPath = path.resolve(process.cwd(), 'service-account.json');
            if (fs.existsSync(saPath)) {
                const sa = JSON.parse(fs.readFileSync(saPath, 'utf8'));
                clientEmail = sa.client_email || sa.clientEmail;
                privateKey = sa.private_key || sa.privateKey;
            }
        } catch {}
    }

    if (!clientEmail || !privateKey) {
        console.warn('[Drive] Missing service account credentials. Drive storage disabled.');
        return null;
    }

    try {
        // Robust PEM sanitization (same logic as firebase-admin.ts)
        let fixedKey = privateKey;
        fixedKey = fixedKey.replace(/\\n/g, '\n');
        fixedKey = fixedKey.replace(/^["']|["']$/g, '');
        fixedKey = fixedKey.trim();

        // Aggressively reconstruct PEM format
        const pemHeaders = ['-----BEGIN PRIVATE KEY-----', '-----BEGIN RSA PRIVATE KEY-----'];
        const pemFooters = ['-----END PRIVATE KEY-----', '-----END RSA PRIVATE KEY-----'];
        const foundHeader = pemHeaders.find(h => fixedKey.includes(h));
        const foundFooter = pemFooters.find(f => fixedKey.includes(f));

        if (foundHeader && foundFooter) {
            const bodyStart = fixedKey.indexOf(foundHeader) + foundHeader.length;
            const bodyEnd = fixedKey.indexOf(foundFooter);
            const body = fixedKey.substring(bodyStart, bodyEnd).replace(/\s/g, '');
            const lines = body.match(/.{1,64}/g) || [];
            fixedKey = `${foundHeader}\n${lines.join('\n')}\n${foundFooter}\n`;
        }

        const auth = new google.auth.JWT({
            email: clientEmail,
            key: fixedKey,
            scopes: ['https://www.googleapis.com/auth/drive'],
            subject: env.drive.impersonateEmail,  // Domain-wide delegation → dave@whovisions.com
        });

        driveClient = google.drive({ version: 'v3', auth });
        console.log(`[Drive] Client initialized — impersonating ${env.drive.impersonateEmail}`);
        return driveClient;
    } catch (err: any) {
        console.error(`[Drive] Client init failed: ${err.message}`);
        return null;
    }
}

// ─── FOLDER MANAGEMENT ───────────────────────────────────────

/**
 * Find or create a folder by name under a given parent.
 */
async function ensureFolder(
    drive: drive_v3.Drive,
    folderName: string,
    parentId?: string
): Promise<string> {
    const cacheKey = `${parentId || 'root'}/${folderName}`;
    if (folderCache[cacheKey]) return folderCache[cacheKey];

    // Search for existing folder
    const query = [
        `name = '${folderName}'`,
        `mimeType = 'application/vnd.google-apps.folder'`,
        `trashed = false`,
        parentId ? `'${parentId}' in parents` : `'root' in parents`,
    ].join(' and ');

    const existing = await drive.files.list({
        q: query,
        fields: 'files(id, name)',
        spaces: 'drive',
    });

    if (existing.data.files && existing.data.files.length > 0) {
        const id = existing.data.files[0].id!;
        folderCache[cacheKey] = id;
        console.log(`[Drive] Found folder: ${folderName} (${id})`);
        return id;
    }

    // Create new folder
    const created = await drive.files.create({
        requestBody: {
            name: folderName,
            mimeType: 'application/vnd.google-apps.folder',
            parents: parentId ? [parentId] : undefined,
        },
        fields: 'id',
    });

    const id = created.data.id!;
    folderCache[cacheKey] = id;
    console.log(`[Drive] Created folder: ${folderName} (${id})`);
    return id;
}

/**
 * Ensures the full folder tree exists:
 *   NouGenAi-site/ → news/, ai-gens/, thumbnails/
 * Returns the subfolder ID for the requested type.
 */
async function getSubFolderId(drive: drive_v3.Drive, subfolder: SubFolder): Promise<string> {
    // Get or create root folder
    let rootId = env.drive.folderId;
    if (!rootId) {
        rootId = await ensureFolder(drive, 'NouGenAi-site');
    }

    // Get or create subfolder
    return ensureFolder(drive, subfolder, rootId);
}

// ─── UPLOAD FUNCTIONS ────────────────────────────────────────

/**
 * Uploads an image from a URL to Google Drive.
 * Downloads the image, optionally compresses it, uploads to Drive.
 */
export async function uploadToDrive(
    url: string,
    publicId?: string,
    subfolder: SubFolder = 'news'
): Promise<DriveUploadResult | null> {
    const drive = getDriveClient();
    if (!drive) return null;

    try {
        // Download the image
        const response = await fetch(url, {
            signal: AbortSignal.timeout(15000),
        });
        if (!response.ok) throw new Error(`Fetch failed: ${response.status}`);

        const arrayBuffer = await response.arrayBuffer();
        let buffer: Buffer = Buffer.from(arrayBuffer) as Buffer;

        // Compress if larger than 2MB
        const contentType = response.headers.get('content-type') || 'image/jpeg';
        if (buffer.length > 2 * 1024 * 1024) {
            console.log(`[Drive] Compressing ${(buffer.length / 1024 / 1024).toFixed(1)}MB image...`);
            buffer = await sharp(buffer)
                .resize(1600, 1600, { fit: 'inside', withoutEnlargement: true })
                .webp({ quality: 80 })
                .toBuffer() as Buffer;
        }

        // Get target folder
        const folderId = await getSubFolderId(drive, subfolder);

        // Generate filename
        const ext = contentType.includes('webp') ? 'webp'
            : contentType.includes('png') ? 'png'
                : 'jpg';
        const filename = publicId
            ? `${publicId}.${ext}`
            : `${Date.now()}_${Math.random().toString(36).slice(2, 8)}.${ext}`;

        // Upload to Drive
        const fileStream = new Readable();
        fileStream.push(buffer);
        fileStream.push(null);

        const uploadResult = await drive.files.create({
            requestBody: {
                name: filename,
                parents: [folderId],
            },
            media: {
                mimeType: buffer.length !== arrayBuffer.byteLength ? 'image/webp' : contentType,
                body: fileStream,
            },
            fields: 'id, webContentLink',
        });

        const fileId = uploadResult.data.id!;

        // Make file viewable by anyone with the link
        await drive.permissions.create({
            fileId,
            requestBody: { role: 'reader', type: 'anyone' },
        });

        const proxyUrl = `/api/media/${fileId}`;
        const directUrl = `https://drive.google.com/uc?id=${fileId}`;

        console.log(`[Drive] ✓ Uploaded: ${filename} → ${fileId}`);

        return { fileId, proxyUrl, directUrl };
    } catch (err: any) {
        console.error(`[Drive] Upload failed: ${err.message}`);
        return null;
    }
}

/**
 * Uploads a base64-encoded image to Google Drive.
 * Used for AI-generated visuals.
 */
export async function uploadBase64ToDrive(
    base64Data: string,
    publicId?: string,
    subfolder: SubFolder = 'ai-gens'
): Promise<DriveUploadResult | null> {
    const drive = getDriveClient();
    if (!drive) return null;

    try {
        // Parse the data URI
        const matches = base64Data.match(/^data:([^;]+);base64,(.+)$/);
        if (!matches) throw new Error('Invalid base64 data URI');

        const mimeType = matches[1];
        const buffer = Buffer.from(matches[2], 'base64');

        // Get target folder
        const folderId = await getSubFolderId(drive, subfolder);

        // Generate filename
        const ext = mimeType.includes('webp') ? 'webp'
            : mimeType.includes('png') ? 'png'
                : 'jpg';
        const filename = publicId
            ? `${publicId}.${ext}`
            : `gen_${Date.now()}.${ext}`;

        // Upload to Drive
        const fileStream = new Readable();
        fileStream.push(buffer);
        fileStream.push(null);

        const uploadResult = await drive.files.create({
            requestBody: {
                name: filename,
                parents: [folderId],
            },
            media: {
                mimeType,
                body: fileStream,
            },
            fields: 'id',
        });

        const fileId = uploadResult.data.id!;

        // Make file viewable by anyone with the link
        await drive.permissions.create({
            fileId,
            requestBody: { role: 'reader', type: 'anyone' },
        });

        const proxyUrl = `/api/media/${fileId}`;
        const directUrl = `https://drive.google.com/uc?id=${fileId}`;

        console.log(`[Drive] ✓ Uploaded AI visual: ${filename} → ${fileId}`);

        return { fileId, proxyUrl, directUrl };
    } catch (err: any) {
        console.error(`[Drive] Base64 upload failed: ${err.message}`);
        return null;
    }
}

/**
 * Streams a file from Drive by its file ID.
 * Used by the /api/media/[fileId] proxy route.
 */
export async function streamDriveFile(fileId: string): Promise<{
    stream: NodeJS.ReadableStream;
    mimeType: string;
    fileName: string;
} | null> {
    const drive = getDriveClient();
    if (!drive) return null;

    try {
        // Get file metadata first
        const meta = await drive.files.get({
            fileId,
            fields: 'name, mimeType',
        });

        // Then get the content as a stream
        const content = await drive.files.get({
            fileId,
            alt: 'media',
        }, {
            responseType: 'stream',
        });

        return {
            stream: content.data as unknown as NodeJS.ReadableStream,
            mimeType: meta.data.mimeType || 'application/octet-stream',
            fileName: meta.data.name || 'file',
        };
    } catch (err: any) {
        console.error(`[Drive] Stream failed for ${fileId}: ${err.message}`);
        return null;
    }
}

/**
 * Returns the proxy URL for a Drive file.
 * This is the URL used in article image_url fields.
 */
export function getDriveProxyUrl(fileId: string): string {
    return `/api/media/${fileId}`;
}

/**
 * Checks if a URL is a Drive proxy URL.
 */
export function isDriveUrl(url: string): boolean {
    return url.includes('/api/media/');
}
