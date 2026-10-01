import "server-only";
import { execFile } from "node:child_process";
import { mkdtemp, readFile, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";
import { promisify } from "node:util";
import { and, eq, inArray, isNull, sql } from "drizzle-orm";
import { fileTypeFromBuffer } from "file-type";
import sharp from "sharp";
import { AppError, notFound } from "@/domain/errors";
import { db } from "../db/client";
import { media, type MediaVariants } from "../db/schema";
import { enqueue } from "../jobs";
import { log } from "../logger";
import { randomToken } from "../crypto";
import { storage } from "../storage";

const run = promisify(execFile);

export const IMAGE_TYPES = new Set(["image/jpeg", "image/png", "image/webp", "image/avif", "image/gif"]);
export const VIDEO_TYPES = new Set(["video/mp4", "video/quicktime", "video/webm"]);
export const MAX_IMAGE_BYTES = 15 * 1024 * 1024;
export const MAX_VIDEO_BYTES = 150 * 1024 * 1024;
export const MAX_VIDEO_SECONDS = 180;
const IMAGE_WIDTHS = [320, 640, 1080, 1600];

type MediaRow = typeof media.$inferSelect;

export type PublicMedia = {
  id: string;
  kind: "image" | "video";
  width: number | null;
  height: number | null;
  placeholder: string | null;
  alt: string | null;
  /** image: responsive sources; video: poster sources */
  sources: { url: string; width: number }[];
  videoUrl: string | null;
  durationSeconds: number | null;
};

export function toPublicMedia(m: Pick<MediaRow, "id" | "kind" | "width" | "height" | "placeholder" | "alt" | "variants" | "durationSeconds" | "status">): PublicMedia | null {
  if (m.status !== "ready") return null;
  const v = m.variants ?? {};
  const sources = Object.entries(v)
    .filter(([k]) => k.startsWith("w"))
    .map(([, x]) => ({ url: storage.publicUrl(x.key), width: x.width }))
    .sort((a, b) => a.width - b.width);
  return {
    id: m.id,
    kind: m.kind,
    width: m.width,
    height: m.height,
    placeholder: m.placeholder,
    alt: m.alt,
    sources,
    videoUrl: v.video ? storage.publicUrl(v.video.key) : null,
    durationSeconds: m.durationSeconds,
  };
}

async function imageVariants(buf: Buffer, prefix: string): Promise<{ variants: MediaVariants; width: number; height: number; placeholder: string }> {
  const base = sharp(buf, { limitInputPixels: 60_000_000, failOn: "error" }).rotate();
  const meta = await base.metadata();
  const width = meta.autoOrient?.width ?? meta.width ?? 0;
  const height = meta.autoOrient?.height ?? meta.height ?? 0;
  if (!width || !height) throw new AppError("validation", "We couldn't read that image. Try a JPG or PNG.");
  const variants: MediaVariants = {};
  const widths = IMAGE_WIDTHS.filter((w) => w < width);
  widths.push(Math.min(width, IMAGE_WIDTHS[IMAGE_WIDTHS.length - 1]));
  for (const w of [...new Set(widths)]) {
    const out = await sharp(buf, { limitInputPixels: 60_000_000 }).rotate().resize({ width: w, withoutEnlargement: true }).webp({ quality: 78 }).toBuffer({ resolveWithObject: true });
    const key = `${prefix}/w${w}.webp`;
    await storage.put(key, out.data, "image/webp");
    variants[`w${w}`] = { key, width: out.info.width, height: out.info.height, mime: "image/webp" };
  }
  const tiny = await sharp(buf, { limitInputPixels: 60_000_000 }).rotate().resize({ width: 16 }).blur(1).webp({ quality: 40 }).toBuffer();
  return { variants, width, height, placeholder: `data:image/webp;base64,${tiny.toString("base64")}` };
}

async function probeDuration(file: string): Promise<number | null> {
  try {
    const { stdout } = await run("ffprobe", ["-v", "error", "-protocol_whitelist", "file", "-show_entries", "format=duration", "-of", "default=nw=1:nk=1", file], { timeout: 20_000 });
    const d = Number(stdout.trim());
    return Number.isFinite(d) ? d : null;
  } catch {
    return null;
  }
}

export type UploadPurpose = "portfolio" | "logo" | "cover" | "avatar" | "service" | "support" | "message" | "verification";

/** Attachments that are only for the people in a conversation, ticket or review. */
const PRIVATE_PURPOSES = new Set<UploadPurpose>(["support", "message", "verification"]);

/** The media id embedded in a storage key ("b|u/<owner>/<uuid>-<rand>/<file>"). */
export function mediaIdFromKey(key: string): string | null {
  const m = /^[bu]\/[0-9a-f-]{36}\/([0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12})-/i.exec(key);
  return m?.[1] ?? null;
}

/**
 * Whether a viewer may download a stored file. Public media is anyone's; a
 * private attachment only its uploader, the other side of the conversation or
 * ticket it was sent in, platform staff, or the business it was uploaded for
 * (verification documents need business.manage).
 */
export async function canViewMedia(row: { id: string; visibility: string; ownerUserId: string; businessId: string | null; deletedAt: Date | null }, viewer: { id: string; platformRole: string } | null) {
  if (row.deletedAt) return false;
  if (row.visibility === "public") return true;
  if (!viewer) return false;
  if (viewer.id === row.ownerUserId || viewer.platformRole === "admin" || viewer.platformRole === "support") return true;
  const allowed = await db.execute<{ ok: boolean }>(sql`
    select exists (
      select 1 from messages m join conversations c on c.id = m.conversation_id
      where m.media_id = ${row.id} and m.deleted_at is null and (
        c.customer_user_id = ${viewer.id}
        or exists (select 1 from business_members bm where bm.business_id = c.business_id and bm.user_id = ${viewer.id} and bm.status = 'active')
      )
    ) or exists (
      select 1 from support_messages sm join support_tickets t on t.id = sm.ticket_id
      where ${row.id} = any(sm.media_ids) and t.user_id = ${viewer.id}
    ) as ok`);
  return Boolean([...allowed][0]?.ok);
}

/**
 * Validates and stores an upload. Type is detected from the file's bytes —
 * never the client-supplied name or MIME — and only known media is accepted.
 */
export async function ingestUpload(args: { ownerUserId: string; businessId: string | null; purpose: UploadPurpose; data: Buffer; alt?: string | null }) {
  const detected = await fileTypeFromBuffer(args.data);
  const mime = detected?.mime ?? "";
  const isImage = IMAGE_TYPES.has(mime);
  const isVideo = VIDEO_TYPES.has(mime);
  const allowVideo = args.purpose === "portfolio" || args.purpose === "service";
  const visibility = PRIVATE_PURPOSES.has(args.purpose) ? ("private" as const) : ("public" as const);
  if (!isImage && !(isVideo && allowVideo)) {
    throw new AppError("validation", allowVideo ? "Upload a JPG, PNG, WebP image or an MP4/MOV/WebM video." : "Upload a JPG, PNG or WebP image.");
  }
  if (isImage && args.data.length > MAX_IMAGE_BYTES) throw new AppError("validation", "Images must be under 15 MB.");
  if (isVideo && args.data.length > MAX_VIDEO_BYTES) throw new AppError("validation", "Videos must be under 150 MB.");

  const id = crypto.randomUUID();
  const prefix = `${args.businessId ? `b/${args.businessId}` : `u/${args.ownerUserId}`}/${id}-${randomToken(4).replace(/[^a-z0-9]/gi, "")}`;
  const originalKey = `${prefix}/original.${detected!.ext}`;

  if (isImage) {
    const processed = await imageVariants(args.data, prefix);
    // Originals of images are not kept publicly; variants are re-encoded without metadata (EXIF/GPS).
    const [row] = await db
      .insert(media)
      .values({
        id,
        ownerUserId: args.ownerUserId,
        businessId: args.businessId,
        kind: "image",
        status: "ready",
        originalKey: processed.variants[Object.keys(processed.variants).at(-1)!].key,
        mime: "image/webp",
        bytes: args.data.length,
        width: processed.width,
        height: processed.height,
        variants: processed.variants,
        placeholder: processed.placeholder,
        alt: args.alt ?? null,
        visibility,
      })
      .returning();
    return row;
  }

  // Video: validate duration now, process (poster + web-optimised encode) in the background.
  const dir = await mkdtemp(path.join(tmpdir(), "kept-up-"));
  try {
    const file = path.join(dir, `in.${detected!.ext}`);
    await writeFile(file, args.data);
    const duration = await probeDuration(file);
    if (duration == null) throw new AppError("validation", "We couldn't read that video. Try exporting it as MP4.");
    if (duration > MAX_VIDEO_SECONDS) throw new AppError("validation", `Videos can be up to ${MAX_VIDEO_SECONDS / 60} minutes long.`);
    await storage.put(originalKey, args.data, mime);
    const [row] = await db
      .insert(media)
      .values({ id, ownerUserId: args.ownerUserId, businessId: args.businessId, kind: "video", status: "processing", originalKey, mime, bytes: args.data.length, durationSeconds: duration, alt: args.alt ?? null, visibility })
      .returning();
    await enqueue("media.process_video", { mediaId: id }, { dedupeKey: `video:${id}`, maxAttempts: 3 });
    return row;
  } finally {
    await rm(dir, { recursive: true, force: true });
  }
}

/** Poster frame + 720p H.264 MP4 with fast-start for smooth progressive playback. */
export async function processVideo(mediaId: string) {
  const [m] = await db.select().from(media).where(eq(media.id, mediaId));
  if (!m || m.kind !== "video" || m.status === "ready") return;
  const dir = await mkdtemp(path.join(tmpdir(), "kept-vid-"));
  try {
    // Work on a local copy so ffmpeg can seek, whatever the storage backend.
    const original = await storage.get(m.originalKey);
    if (!original) throw new Error("original video missing from storage");
    const input = path.join(dir, `in${path.extname(m.originalKey)}`);
    await writeFile(input, original);
    const poster = path.join(dir, "poster.jpg");
    const out = path.join(dir, "web.mp4");
    const seek = Math.min(1, (m.durationSeconds ?? 2) / 3);
    await run("ffmpeg", ["-y", "-protocol_whitelist", "file", "-ss", String(seek), "-i", input, "-frames:v", "1", "-q:v", "3", poster], { timeout: 60_000 });
    await run(
      "ffmpeg",
      ["-y", "-protocol_whitelist", "file", "-i", input, "-vf", "scale='min(1280,iw)':-2", "-c:v", "libx264", "-preset", "veryfast", "-crf", "26", "-profile:v", "main", "-pix_fmt", "yuv420p", "-c:a", "aac", "-b:a", "96k", "-movflags", "+faststart", out],
      { timeout: 10 * 60_000 },
    );
    const prefix = m.originalKey.replace(/\/original\.[a-z0-9]+$/i, "");
    const posterImg = await imageVariants(await readFile(poster), `${prefix}/poster`);
    const webKey = `${prefix}/web.mp4`;
    const webBuf = await readFile(out);
    await storage.put(webKey, webBuf, "video/mp4");
    const variants: MediaVariants = { ...posterImg.variants, video: { key: webKey, width: posterImg.width, height: posterImg.height, mime: "video/mp4" } };
    await db
      .update(media)
      .set({ status: "ready", variants, width: posterImg.width, height: posterImg.height, placeholder: posterImg.placeholder })
      .where(eq(media.id, mediaId));
  } catch (err) {
    log.error("media.video_failed", { mediaId, err });
    await db.update(media).set({ status: "failed" }).where(eq(media.id, mediaId));
    throw err;
  } finally {
    await rm(dir, { recursive: true, force: true });
  }
}

/** Ensures a media id belongs to the given business (or user) before it is attached anywhere. */
export async function assertMediaOwned(mediaId: string, scope: { businessId?: string; userId?: string }) {
  const [m] = await db.select().from(media).where(and(eq(media.id, mediaId), isNull(media.deletedAt)));
  if (!m) throw notFound("That file");
  const ok = (scope.businessId && m.businessId === scope.businessId) || (scope.userId && m.ownerUserId === scope.userId && m.businessId == null);
  if (!ok) throw new AppError("forbidden", "You can't use that file here.");
  return m;
}

export async function getMediaMap(ids: (string | null | undefined)[]) {
  const unique = [...new Set(ids.filter((x): x is string => Boolean(x)))];
  if (!unique.length) return new Map<string, PublicMedia>();
  const rows = await db.select().from(media).where(and(inArray(media.id, unique), isNull(media.deletedAt)));
  const map = new Map<string, PublicMedia>();
  for (const r of rows) {
    const p = toPublicMedia(r);
    if (p) map.set(r.id, p);
  }
  return map;
}
