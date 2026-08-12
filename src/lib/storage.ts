import { promises as fs } from "fs";
import path from "path";
import { randomUUID } from "crypto";
import {
  S3Client,
  PutObjectCommand,
  GetObjectCommand,
  DeleteObjectCommand,
} from "@aws-sdk/client-s3";

/**
 * Private file storage abstraction (spec sections 39-41).
 *
 * Files are NEVER served from /public and NEVER given a public URL. Every
 * read goes through app/api/files/[id]/route.ts (regular Documents) or
 * app/api/branding/[...key]/route.ts (logo/stamp/signatures), which re-check
 * the caller's session before streaming bytes back.
 *
 * Two drivers:
 *  - "local": writes to LOCAL_STORAGE_PATH on disk. Only works on a
 *    long-running server with a persistent filesystem (e.g. a VPS, or
 *    `npm run dev` on your own machine). Does NOT work on Vercel or any
 *    other serverless host — their filesystem is ephemeral/read-only outside
 *    /tmp, so uploads would silently vanish between requests.
 *  - "s3": any S3-compatible provider (Cloudflare R2, AWS S3, Backblaze B2,
 *    Supabase Storage). REQUIRED before deploying to Vercel. Set
 *    STORAGE_DRIVER=s3 plus the S3_* env vars below (see .env.example).
 *    For Cloudflare R2 specifically: S3_ENDPOINT is
 *    "https://<ACCOUNT_ID>.r2.cloudflarestorage.com", S3_REGION is "auto",
 *    and S3_ACCESS_KEY_ID/S3_SECRET_ACCESS_KEY come from an R2 API token
 *    (Cloudflare dashboard -> R2 -> Manage API Tokens).
 */

export interface StoredFile {
  storageKey: string;
  fileSize: number;
}

export interface StorageDriver {
  save(buffer: Buffer, opts: { originalName: string; mimeType: string }): Promise<StoredFile>;
  read(storageKey: string): Promise<Buffer>;
  delete(storageKey: string): Promise<void>;
  /** Write to an exact, caller-chosen key instead of a randomly generated
   * one — used for branding assets (logo/stamp/signatures) where a stable,
   * predictable path matters more than collision-proofing (see
   * saveBrandingAsset below). */
  saveAt(key: string, buffer: Buffer): Promise<void>;
}

// Video was added for a concrete operational reason: SSO's field evidence for
// gearbox teardown and testing is shot on phones, and JPC has already been
// sent that footage by email. If the app cannot hold it, the authoritative
// copy of a project's evidence stays in WhatsApp — which is exactly the
// scattering this system exists to end.
const ALLOWED_EXTENSIONS = new Set([
  "pdf", "doc", "docx", "xls", "xlsx", "ppt", "pptx",
  "jpg", "jpeg", "png", "webp", "zip", "txt",
  "mp4", "mov", "webm",
]);

// Note this is the STORAGE ceiling. Uploads made through the browser are
// additionally capped by next.config.mjs's serverActions.bodySizeLimit (25MB),
// because a Server Action carries the file in the request body. Bulk imports
// run via prisma/import-documents.ts call the storage driver directly and
// never touch HTTP, so they can use the full ceiling here.
export const MAX_FILE_SIZE_BYTES = 50 * 1024 * 1024; // 50MB

export function assertFileAllowed(originalName: string, mimeType: string, size: number) {
  const ext = originalName.split(".").pop()?.toLowerCase() ?? "";
  if (!ALLOWED_EXTENSIONS.has(ext)) {
    throw new Error(`File type ".${ext}" is not allowed.`);
  }
  if (size > MAX_FILE_SIZE_BYTES) {
    throw new Error("File exceeds the 50MB upload limit.");
  }
  if (!mimeType) {
    throw new Error("Could not determine file MIME type.");
  }
}

/** Strips path separators and control characters so a filename can never be used for traversal. */
export function sanitizeFileName(name: string): string {
  return name
    .replace(/[/\\]/g, "_")
    .replace(/[^a-zA-Z0-9._-]/g, "_")
    .slice(-180);
}

function guessContentType(fileName: string): string {
  const ext = fileName.split(".").pop()?.toLowerCase();
  const map: Record<string, string> = {
    pdf: "application/pdf", png: "image/png", jpg: "image/jpeg", jpeg: "image/jpeg",
    doc: "application/msword", docx: "application/vnd.openxmlformats-officedocument.wordprocessingml.document",
    xls: "application/vnd.ms-excel", xlsx: "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
    ppt: "application/vnd.ms-powerpoint", pptx: "application/vnd.openxmlformats-officedocument.presentationml.presentation",
    zip: "application/zip", txt: "text/plain", webp: "image/webp",
    mp4: "video/mp4", mov: "video/quicktime", webm: "video/webm",
  };
  return (ext && map[ext]) || "application/octet-stream";
}

class LocalDiskDriver implements StorageDriver {
  private root: string;

  constructor() {
    this.root = path.resolve(process.env.LOCAL_STORAGE_PATH || "./private-storage");
  }

  async save(buffer: Buffer, opts: { originalName: string; mimeType: string }): Promise<StoredFile> {
    const safeName = sanitizeFileName(opts.originalName);
    const key = `${new Date().getFullYear()}/${randomUUID()}-${safeName}`;
    await this.saveAt(key, buffer);
    return { storageKey: key, fileSize: buffer.byteLength };
  }

  async saveAt(key: string, buffer: Buffer): Promise<void> {
    const fullPath = this.resolveSafe(key);
    await fs.mkdir(path.dirname(fullPath), { recursive: true });
    await fs.writeFile(fullPath, buffer);
  }

  async read(storageKey: string): Promise<Buffer> {
    const fullPath = this.resolveSafe(storageKey);
    return fs.readFile(fullPath);
  }

  async delete(storageKey: string): Promise<void> {
    const fullPath = this.resolveSafe(storageKey);
    await fs.rm(fullPath, { force: true });
  }

  /** Resolves the key against root and rejects any path that escapes it (defense in depth vs. traversal). */
  private resolveSafe(storageKey: string): string {
    const fullPath = path.resolve(this.root, storageKey);
    if (!fullPath.startsWith(this.root)) {
      throw new Error("Invalid storage key.");
    }
    return fullPath;
  }
}

/**
 * S3-compatible driver — works with Cloudflare R2, AWS S3, Backblaze B2, or
 * any other provider implementing the S3 API. R2 is the recommended default
 * for this app (free egress, generous free tier, no AWS account needed).
 */
class S3Driver implements StorageDriver {
  private client: S3Client;
  private bucket: string;

  constructor() {
    const bucket = process.env.S3_BUCKET;
    const region = process.env.S3_REGION || "auto";
    const accessKeyId = process.env.S3_ACCESS_KEY_ID;
    const secretAccessKey = process.env.S3_SECRET_ACCESS_KEY;
    const endpoint = process.env.S3_ENDPOINT; // required for R2/B2; omit for real AWS S3

    if (!bucket || !accessKeyId || !secretAccessKey) {
      throw new Error(
        "STORAGE_DRIVER=s3 but S3_BUCKET/S3_ACCESS_KEY_ID/S3_SECRET_ACCESS_KEY are not set. " +
          "For Cloudflare R2: create a bucket + API token in the Cloudflare dashboard, then set " +
          "S3_BUCKET, S3_ACCESS_KEY_ID, S3_SECRET_ACCESS_KEY, S3_ENDPOINT (https://<account-id>.r2.cloudflarestorage.com), " +
          "and S3_REGION=auto in your environment variables."
      );
    }

    this.bucket = bucket;
    this.client = new S3Client({
      region,
      endpoint,
      // R2 works with the SDK's default virtual-hosted-style addressing (per
      // Cloudflare's own aws-sdk-js-v3 example — no forcePathStyle needed).
      // Some other S3-compatible providers (e.g. MinIO) do require it, so
      // it's left as an opt-in env var rather than assumed from S3_ENDPOINT.
      forcePathStyle: process.env.S3_FORCE_PATH_STYLE === "true",
      credentials: { accessKeyId, secretAccessKey },
    });
  }

  async save(buffer: Buffer, opts: { originalName: string; mimeType: string }): Promise<StoredFile> {
    const safeName = sanitizeFileName(opts.originalName);
    const key = `${new Date().getFullYear()}/${randomUUID()}-${safeName}`;
    await this.client.send(
      new PutObjectCommand({ Bucket: this.bucket, Key: key, Body: buffer, ContentType: opts.mimeType || guessContentType(safeName) })
    );
    return { storageKey: key, fileSize: buffer.byteLength };
  }

  async saveAt(key: string, buffer: Buffer): Promise<void> {
    await this.client.send(
      new PutObjectCommand({ Bucket: this.bucket, Key: key, Body: buffer, ContentType: guessContentType(key) })
    );
  }

  async read(storageKey: string): Promise<Buffer> {
    const res = await this.client.send(new GetObjectCommand({ Bucket: this.bucket, Key: storageKey }));
    const body = res.Body;
    if (!body) throw new Error("Empty object body.");
    // res.Body is a web/Node ReadableStream depending on runtime — both expose
    // an async iterator, which is the one thing we can rely on across both.
    const chunks: Buffer[] = [];
    for await (const chunk of body as AsyncIterable<Uint8Array>) {
      chunks.push(Buffer.isBuffer(chunk) ? chunk : Buffer.from(chunk));
    }
    return Buffer.concat(chunks);
  }

  async delete(storageKey: string): Promise<void> {
    await this.client.send(new DeleteObjectCommand({ Bucket: this.bucket, Key: storageKey }));
  }
}

export function getStorageDriver(): StorageDriver {
  const driver = process.env.STORAGE_DRIVER || "local";
  if (driver === "s3") return new S3Driver();
  return new LocalDiskDriver();
}

/**
 * Branding assets (company logo, company stamp, per-user signatures) used to
 * render the Quotation PDF. These are NOT tracked as Documents — they're
 * small, few in number, and only ever read server-side while generating a
 * PDF — but they go through the exact same StorageDriver as everything else
 * (so switching STORAGE_DRIVER=s3 moves these to R2 too, with no other code
 * changes needed). DB fields (CompanySettings.logoUrl,
 * CompanySettings.stampImageUrl, User.signatureImageUrl) store a relative
 * key like "branding/logo.png" which this resolves + reads.
 */
const BRANDING_DIR = "branding";

export function brandingAssetKey(fileName: string): string {
  return `${BRANDING_DIR}/${sanitizeFileName(fileName)}`;
}

/**
 * Saves a branding asset (user signature, company logo/stamp) under
 * branding/, keyed by a stable prefix instead of a random id since there's
 * only ever one active asset per purpose (one signature per user, one
 * company stamp, one logo). Returns the relative key to store on the
 * User/CompanySettings row.
 */
export async function saveBrandingAsset(
  buffer: Buffer,
  opts: { prefix: string; originalName: string }
): Promise<string> {
  const safeName = sanitizeFileName(opts.originalName);
  const ext = safeName.includes(".") ? safeName.split(".").pop() : "png";
  const key = `${BRANDING_DIR}/${opts.prefix}-${Date.now()}.${ext}`;
  await getStorageDriver().saveAt(key, buffer);
  return key;
}

export async function readBrandingAsset(relativeKey: string | null | undefined): Promise<Buffer | null> {
  if (!relativeKey) return null;
  try {
    return await getStorageDriver().read(relativeKey);
  } catch {
    return null; // asset not uploaded yet, or not found — PDF renderer falls back to text-only
  }
}
