import "server-only";
import { createReadStream } from "node:fs";
import { mkdir, rm, stat, writeFile } from "node:fs/promises";
import path from "node:path";
import { env } from "../env";

/**
 * Object storage abstraction. The local driver writes to disk and is served by
 * /media/[...key]. An S3/R2 driver can implement the same interface for production.
 */
export interface Storage {
  put(key: string, data: Buffer, contentType: string): Promise<void>;
  remove(key: string): Promise<void>;
  absolutePath(key: string): string | null;
  stat(key: string): Promise<{ size: number } | null>;
  stream(key: string, range?: { start: number; end: number }): NodeJS.ReadableStream;
  publicUrl(key: string): string;
}

const root = path.resolve(env.STORAGE_DIR);

function safeKey(key: string): string {
  if (!/^[a-z0-9/_.-]+$/i.test(key) || key.includes("..") || key.startsWith("/")) throw new Error("invalid storage key");
  return key;
}

const local: Storage = {
  async put(key, data) {
    const file = path.join(root, safeKey(key));
    await mkdir(path.dirname(file), { recursive: true });
    await writeFile(file, data);
  },
  async remove(key) {
    await rm(path.join(root, safeKey(key)), { force: true });
  },
  absolutePath(key) {
    return path.join(root, safeKey(key));
  },
  async stat(key) {
    try {
      const s = await stat(path.join(root, safeKey(key)));
      return s.isFile() ? { size: s.size } : null;
    } catch {
      return null;
    }
  },
  stream(key, range) {
    return createReadStream(path.join(root, safeKey(key)), range);
  },
  publicUrl(key) {
    return `/media/${key}`;
  },
};

export const storage: Storage = local;
