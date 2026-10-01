import { createServer, type Server } from "node:http";
import { afterAll, beforeAll, describe, expect, it, vi } from "vitest";

/**
 * Exercises the S3 storage driver against a minimal in-process S3 endpoint
 * (path-style PUT/GET/HEAD/DELETE with byte ranges) — the same requests R2,
 * B2, MinIO and AWS receive.
 */
const objects = new Map<string, { body: Buffer; type: string }>();
let server: Server;
let port = 0;

beforeAll(async () => {
  server = createServer(async (req, res) => {
    const url = new URL(req.url!, "http://x");
    const key = decodeURIComponent(url.pathname.replace(/^\/kept-test\//, ""));
    if (req.method === "PUT") {
      const chunks: Buffer[] = [];
      for await (const c of req) chunks.push(c as Buffer);
      objects.set(key, { body: Buffer.concat(chunks), type: String(req.headers["content-type"] ?? "") });
      res.writeHead(200, { etag: '"x"' }).end();
      return;
    }
    const obj = objects.get(key);
    if (req.method === "DELETE") {
      objects.delete(key);
      res.writeHead(204).end();
      return;
    }
    if (!obj) {
      res.writeHead(404, { "content-type": "application/xml" }).end(req.method === "HEAD" ? undefined : "<Error><Code>NoSuchKey</Code><Message>missing</Message></Error>");
      return;
    }
    const range = /^bytes=(\d+)-(\d+)$/.exec(String(req.headers.range ?? ""));
    const body = range ? obj.body.subarray(Number(range[1]), Number(range[2]) + 1) : obj.body;
    res.writeHead(range ? 206 : 200, { "content-type": obj.type, "content-length": String(body.length), ...(range ? { "content-range": `bytes ${range[1]}-${range[2]}/${obj.body.length}` } : {}) });
    res.end(req.method === "HEAD" ? undefined : body);
  });
  await new Promise<void>((r) => server.listen(0, r));
  port = (server.address() as { port: number }).port;
  Object.assign(process.env, {
    STORAGE_DRIVER: "s3",
    S3_BUCKET: "kept-test",
    S3_REGION: "us-east-1",
    S3_ENDPOINT: `http://127.0.0.1:${port}`,
    S3_ACCESS_KEY_ID: "test",
    S3_SECRET_ACCESS_KEY: "test",
  });
  vi.resetModules();
});

afterAll(async () => {
  process.env.STORAGE_DRIVER = "local";
  vi.resetModules();
  await new Promise((r) => server.close(r));
});

describe("S3 storage driver", () => {
  it("puts, stats, reads, streams ranges and removes objects", async () => {
    const { storage } = await import("@/server/storage");
    const key = "b/00000000-0000-0000-0000-000000000000/11111111-1111-1111-1111-111111111111-abcd/w640.webp";
    await storage.put(key, Buffer.from("hello kept storage"), "image/webp");
    expect(objects.get(key)?.type).toBe("image/webp");
    expect(await storage.stat(key)).toEqual({ size: 18 });
    expect((await storage.get(key))?.toString()).toBe("hello kept storage");
    const ranged = await new Response(await storage.stream(key, { start: 6, end: 9 })).text();
    expect(ranged).toBe("kept");
    await storage.remove(key);
    expect(await storage.stat(key)).toBeNull();
    expect(await storage.get(key)).toBeNull();
  });

  it("refuses unsafe keys before any request", async () => {
    const { storage } = await import("@/server/storage");
    await expect(storage.put("../etc/passwd", Buffer.from("x"), "text/plain")).rejects.toThrow("invalid storage key");
  });
});
