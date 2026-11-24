import {
  DeleteObjectCommand,
  GetObjectCommand,
  HeadObjectCommand,
  ListObjectsV2Command,
  PutObjectCommand,
  S3Client,
} from "@aws-sdk/client-s3";
import { getSignedUrl } from "@aws-sdk/s3-request-presigner";
import { env, isConfigured } from "@/lib/env";

export type BucketKind = "public" | "private";

/** Image file names contain a content hash, so a stored file never changes. */
const PUBLIC_IMAGE_CACHE = "public, max-age=31536000, immutable";

let cachedClient: S3Client | null = null;

function getS3Client(): S3Client {
  if (!isConfigured.storage) {
    throw new Error("Object storage (S3/R2) environment variables are not configured.");
  }
  if (!cachedClient) {
    cachedClient = new S3Client({
      region: env.S3_REGION || "auto",
      endpoint: env.S3_ENDPOINT,
      credentials: {
        accessKeyId: env.S3_ACCESS_KEY_ID!,
        secretAccessKey: env.S3_SECRET_ACCESS_KEY!,
      },
      forcePathStyle: true,
    });
  }
  return cachedClient;
}

export function getBucketName(kind: BucketKind): string {
  return kind === "public" ? env.S3_BUCKET_PUBLIC : env.S3_BUCKET_PRIVATE;
}

export function deriveThumbKey(fullKey: string): string {
  if (fullKey.startsWith("data:") || fullKey.startsWith("http://") || fullKey.startsWith("https://")) {
    return fullKey;
  }
  if (fullKey.endsWith(".webp")) {
    return fullKey.replace(/\.webp$/, "_thumb.webp");
  }
  return `${fullKey}_thumb.webp`;
}

export function getPublicAssetUrl(key: string | null | undefined): string | null {
  if (!key) return null;
  if (key.startsWith("data:") || key.startsWith("http://") || key.startsWith("https://")) {
    return key;
  }
  const base = (env.S3_PUBLIC_URL || "").replace(/\/+$/, "");
  if (!base) return null;
  return `${base}/${key.replace(/^\/+/, "")}`;
}

export interface PresignPutOptions {
  kind: BucketKind;
  key: string;
  contentType: string;
  contentLength: number;
  expiresInSeconds?: number;
  cacheControl?: string;
}

/**
 * Generates a presigned PUT URL with exact ContentLength & ContentType signed
 * into the request so R2/S3 rejects oversized or mismatched uploads.
 */
export async function getPresignedUploadUrl(opts: PresignPutOptions): Promise<string> {
  const client = getS3Client();
  const cmd = new PutObjectCommand({
    Bucket: getBucketName(opts.kind),
    Key: opts.key,
    ContentType: opts.contentType,
    ContentLength: opts.contentLength,
    CacheControl:
      opts.cacheControl ??
      (opts.kind === "public" ? PUBLIC_IMAGE_CACHE : "private, no-store"),
  });
  // Signing this header makes browsers keep images, which saves free R2 read requests.
  return getSignedUrl(client, cmd, {
    expiresIn: opts.expiresInSeconds ?? 300,
    signableHeaders: new Set(["cache-control", "content-type"]),
  });
}

export async function getPresignedDownloadUrl(
  kind: BucketKind,
  key: string,
  expiresInSeconds = 300
): Promise<string> {
  const client = getS3Client();
  const cmd = new GetObjectCommand({
    Bucket: getBucketName(kind),
    Key: key,
  });
  return getSignedUrl(client, cmd, { expiresIn: expiresInSeconds });
}

export async function headObject(
  kind: BucketKind,
  key: string
): Promise<{ exists: boolean; contentLength: number; contentType?: string }> {
  const client = getS3Client();
  try {
    const res = await client.send(
      new HeadObjectCommand({
        Bucket: getBucketName(kind),
        Key: key,
      })
    );
    return {
      exists: true,
      contentLength: Number(res.ContentLength ?? 0),
      contentType: res.ContentType,
    };
  } catch {
    return { exists: false, contentLength: 0 };
  }
}

export async function uploadBuffer(
  kind: BucketKind,
  key: string,
  body: Buffer | Uint8Array,
  contentType: string
): Promise<void> {
  const client = getS3Client();
  await client.send(
    new PutObjectCommand({
      Bucket: getBucketName(kind),
      Key: key,
      Body: body,
      ContentType: contentType,
      CacheControl:
        kind === "public" ? "public, max-age=31536000, immutable" : "private, no-store",
    })
  );
}

export async function deleteObject(kind: BucketKind, key: string | null | undefined): Promise<void> {
  if (!key || !isConfigured.storage) return;
  const client = getS3Client();
  await client.send(
    new DeleteObjectCommand({
      Bucket: getBucketName(kind),
      Key: key,
    })
  );
}

export async function listObjectsByPrefix(
  kind: BucketKind,
  prefix: string,
  maxKeys = 1000
): Promise<Array<{ key: string; size: number; lastModified?: Date }>> {
  const client = getS3Client();
  const res = await client.send(
    new ListObjectsV2Command({
      Bucket: getBucketName(kind),
      Prefix: prefix,
      MaxKeys: maxKeys,
    })
  );
  return (res.Contents ?? [])
    .filter((o) => Boolean(o.Key))
    .map((o) => ({
      key: o.Key!,
      size: Number(o.Size ?? 0),
      lastModified: o.LastModified,
    }));
}

export async function checkStorageHealth(): Promise<{
  ok: boolean;
  publicTotalBytes: number;
  privateTotalBytes: number;
  error?: string;
}> {
  if (!isConfigured.storage) {
    return { ok: false, publicTotalBytes: 0, privateTotalBytes: 0, error: "Storage env vars not configured" };
  }
  try {
    const [pub, priv] = await Promise.all([
      listObjectsByPrefix("public", "", 1000),
      listObjectsByPrefix("private", "", 1000),
    ]);
    return {
      ok: true,
      publicTotalBytes: pub.reduce((acc, o) => acc + o.size, 0),
      privateTotalBytes: priv.reduce((acc, o) => acc + o.size, 0),
    };
  } catch (err) {
    return {
      ok: false,
      publicTotalBytes: 0,
      privateTotalBytes: 0,
      error: err instanceof Error ? err.message : "Storage check failed",
    };
  }
}
