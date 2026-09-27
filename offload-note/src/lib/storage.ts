import "server-only";
import { promises as fs } from "node:fs";
import path from "node:path";
import { S3Client, PutObjectCommand, GetObjectCommand } from "@aws-sdk/client-s3";
import { getSignedUrl } from "@aws-sdk/s3-request-presigner";

// Private object storage for PDFs, signatures and photos.
// Any S3-compatible bucket works: Supabase Storage (S3 endpoint), Cloudflare
// R2 or AWS S3 in eu-west-2. The bucket must be private. Files are only ever
// reached through short-lived signed URLs handed out after a login check.
// Without S3_BUCKET in development, files go under .data/files.

let client: S3Client | null = null;
function s3(): S3Client | null {
  if (!process.env.S3_BUCKET) return null;
  if (!client) {
    client = new S3Client({
      region: process.env.S3_REGION || "eu-west-2",
      endpoint: process.env.S3_ENDPOINT || undefined,
      forcePathStyle: !!process.env.S3_ENDPOINT,
      credentials: {
        accessKeyId: process.env.S3_ACCESS_KEY_ID || "",
        secretAccessKey: process.env.S3_SECRET_ACCESS_KEY || "",
      },
    });
  }
  return client;
}

function localPath(key: string): string {
  if (key.includes("..")) throw new Error("Bad key");
  return path.join(/* turbopackIgnore: true */ process.cwd(), process.env.LOCAL_FILES_DIR || ".data/files", key);
}

function assertStorageConfigured() {
  if (!s3() && process.env.NODE_ENV === "production" && !process.env.ALLOW_LOCAL_FILES) {
    throw new Error("S3_BUCKET is not set.");
  }
}

export async function putObject(key: string, body: Buffer | Uint8Array, contentType: string): Promise<void> {
  assertStorageConfigured();
  const c = s3();
  if (c) {
    await c.send(new PutObjectCommand({ Bucket: process.env.S3_BUCKET, Key: key, Body: body, ContentType: contentType }));
    return;
  }
  const p = localPath(key);
  await fs.mkdir(path.dirname(p), { recursive: true });
  await fs.writeFile(p, body);
}

export async function getObject(key: string): Promise<Buffer> {
  assertStorageConfigured();
  const c = s3();
  if (c) {
    const r = await c.send(new GetObjectCommand({ Bucket: process.env.S3_BUCKET, Key: key }));
    return Buffer.from(await r.Body!.transformToByteArray());
  }
  return fs.readFile(localPath(key));
}

/** A signed URL valid for a few minutes, or null when using local files. */
export async function signedUrl(key: string, filename?: string, seconds = 300): Promise<string | null> {
  const c = s3();
  if (!c) return null;
  return getSignedUrl(
    c,
    new GetObjectCommand({
      Bucket: process.env.S3_BUCKET,
      Key: key,
      ResponseContentDisposition: filename ? `inline; filename="${filename}"` : undefined,
    }),
    { expiresIn: seconds },
  );
}
