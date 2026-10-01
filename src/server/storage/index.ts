import "server-only";
import { createReadStream } from "node:fs";
import { mkdir, readFile, rm, stat, writeFile } from "node:fs/promises";
import path from "node:path";
import { Readable } from "node:stream";
import { env } from "../env";

/**
 * Object storage. Files are always served through /media/[...key] so access
 * rules (private attachments, deleted media) apply whatever the backend:
 * - local: disk under STORAGE_DIR (a single server or a persistent volume)
 * - s3: any S3-compatible bucket (AWS S3, Cloudflare R2, Backblaze B2, MinIO)
 */
export interface Storage {
  put(key: string, data: Buffer, contentType: string): Promise<void>;
  get(key: string): Promise<Buffer | null>;
  remove(key: string): Promise<void>;
  stat(key: string): Promise<{ size: number } | null>;
  /** A web stream of the object (optionally a byte range, inclusive). */
  stream(key: string, range?: { start: number; end: number }): Promise<ReadableStream>;
  publicUrl(key: string): string;
}

export function safeKey(key: string): string {
  if (!/^[a-z0-9/_.-]+$/i.test(key) || key.includes("..") || key.startsWith("/")) throw new Error("invalid storage key");
  return key;
}

function localStorage(): Storage {
  const root = path.resolve(env.STORAGE_DIR);
  const file = (key: string) => path.join(root, safeKey(key));
  return {
    async put(key, data) {
      await mkdir(path.dirname(file(key)), { recursive: true });
      await writeFile(file(key), data);
    },
    async get(key) {
      try {
        return await readFile(file(key));
      } catch {
        return null;
      }
    },
    async remove(key) {
      await rm(file(key), { force: true });
    },
    async stat(key) {
      try {
        const s = await stat(file(key));
        return s.isFile() ? { size: s.size } : null;
      } catch {
        return null;
      }
    },
    async stream(key, range) {
      return Readable.toWeb(createReadStream(file(key), range)) as ReadableStream;
    },
    publicUrl(key) {
      return `/media/${key}`;
    },
  };
}

function s3Storage(): Storage {
  // Loaded lazily so local development doesn't pay for the SDK.
  const sdk = import("@aws-sdk/client-s3");
  const clientP = sdk.then(
    ({ S3Client }) =>
      new S3Client({
        region: env.S3_REGION,
        endpoint: env.S3_ENDPOINT,
        forcePathStyle: Boolean(env.S3_ENDPOINT),
        credentials: { accessKeyId: env.S3_ACCESS_KEY_ID!, secretAccessKey: env.S3_SECRET_ACCESS_KEY! },
      }),
  );
  const Bucket = env.S3_BUCKET!;
  const isMissing = (err: unknown) => {
    const e = err as { name?: string; $metadata?: { httpStatusCode?: number } };
    return e.name === "NoSuchKey" || e.name === "NotFound" || e.$metadata?.httpStatusCode === 404;
  };
  return {
    async put(key, data, contentType) {
      const { PutObjectCommand } = await sdk;
      await (await clientP).send(new PutObjectCommand({ Bucket, Key: safeKey(key), Body: data, ContentType: contentType, CacheControl: "private, max-age=31536000, immutable" }));
    },
    async get(key) {
      const { GetObjectCommand } = await sdk;
      try {
        const res = await (await clientP).send(new GetObjectCommand({ Bucket, Key: safeKey(key) }));
        return Buffer.from(await res.Body!.transformToByteArray());
      } catch (err) {
        if (isMissing(err)) return null;
        throw err;
      }
    },
    async remove(key) {
      const { DeleteObjectCommand } = await sdk;
      await (await clientP).send(new DeleteObjectCommand({ Bucket, Key: safeKey(key) }));
    },
    async stat(key) {
      const { HeadObjectCommand } = await sdk;
      try {
        const res = await (await clientP).send(new HeadObjectCommand({ Bucket, Key: safeKey(key) }));
        return { size: Number(res.ContentLength ?? 0) };
      } catch (err) {
        if (isMissing(err)) return null;
        throw err;
      }
    },
    async stream(key, range) {
      const { GetObjectCommand } = await sdk;
      const res = await (await clientP).send(new GetObjectCommand({ Bucket, Key: safeKey(key), Range: range ? `bytes=${range.start}-${range.end}` : undefined }));
      return res.Body!.transformToWebStream();
    },
    publicUrl(key) {
      return `/media/${key}`;
    },
  };
}

export const storage: Storage = env.STORAGE_DRIVER === "s3" ? s3Storage() : localStorage();
