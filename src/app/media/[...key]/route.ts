import type { NextRequest } from "next/server";
import { eq } from "drizzle-orm";
import { getViewer } from "@/server/auth/session";
import { db } from "@/server/db/client";
import { media } from "@/server/db/schema";
import { canViewMedia, mediaIdFromKey } from "@/server/services/media";
import { storage } from "@/server/storage";

const TYPES: Record<string, string> = {
  webp: "image/webp",
  jpg: "image/jpeg",
  jpeg: "image/jpeg",
  png: "image/png",
  gif: "image/gif",
  avif: "image/avif",
  mp4: "video/mp4",
  mov: "video/quicktime",
  webm: "video/webm",
};

/**
 * Serves files from the local storage driver (see server/storage). Keys are
 * content-addressed with random suffixes, so responses are cached immutably.
 * Supports byte ranges so videos can seek and stream progressively.
 */
export async function GET(req: NextRequest, ctx: RouteContext<"/media/[...key]">) {
  const { key: parts } = await ctx.params;
  const key = parts.join("/");
  const type = TYPES[key.split(".").pop()?.toLowerCase() ?? ""];
  if (!type) return new Response("Not found", { status: 404 });
  // Every file belongs to a media row: deleted files stop being served and
  // private attachments are only served to people allowed to see them.
  const mediaId = mediaIdFromKey(key);
  if (!mediaId) return new Response("Not found", { status: 404 });
  const [row] = await db
    .select({ id: media.id, visibility: media.visibility, ownerUserId: media.ownerUserId, businessId: media.businessId, deletedAt: media.deletedAt })
    .from(media)
    .where(eq(media.id, mediaId));
  if (!row) return new Response("Not found", { status: 404 });
  const isPrivate = row.visibility === "private";
  if (!(await canViewMedia(row, isPrivate ? await getViewer() : null))) return new Response("Not found", { status: 404 });
  let info: { size: number } | null;
  try {
    info = await storage.stat(key);
  } catch {
    return new Response("Not found", { status: 404 });
  }
  if (!info) return new Response("Not found", { status: 404 });

  const headers: Record<string, string> = {
    "content-type": type,
    "accept-ranges": "bytes",
    "cache-control": isPrivate ? "private, no-store" : "public, max-age=31536000, immutable",
    "x-content-type-options": "nosniff",
    "content-security-policy": "default-src 'none'; media-src 'self'; img-src 'self'",
  };
  const range = /^bytes=(\d*)-(\d*)$/.exec(req.headers.get("range") ?? "");
  if (range && (range[1] || range[2])) {
    let start = range[1] ? Number(range[1]) : info.size - Number(range[2]);
    let end = range[1] && range[2] ? Number(range[2]) : info.size - 1;
    start = Math.max(0, start);
    end = Math.min(end, info.size - 1);
    if (start > end) return new Response(null, { status: 416, headers: { "content-range": `bytes */${info.size}` } });
    const body = await storage.stream(key, { start, end });
    return new Response(body, { status: 206, headers: { ...headers, "content-range": `bytes ${start}-${end}/${info.size}`, "content-length": String(end - start + 1) } });
  }
  const body = await storage.stream(key);
  return new Response(body, { headers: { ...headers, "content-length": String(info.size) } });
}
