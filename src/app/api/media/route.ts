import { z } from "zod";
import { AppError } from "@/domain/errors";
import { requireMember } from "@/server/authz";
import { route } from "@/server/http";
import { rateLimit } from "@/server/rate-limit";
import { ingestUpload, MAX_VIDEO_BYTES, toPublicMedia, type UploadPurpose } from "@/server/services/media";

const purposes = z.enum(["portfolio", "logo", "cover", "avatar", "service", "support", "message", "verification"]);

/**
 * Multipart upload. Business uploads require the matching permission; the
 * business id is verified against the viewer's real membership.
 */
export const POST = route({ auth: true }, async ({ req, viewer }) => {
  await rateLimit("upload", viewer.id);
  const length = Number(req.headers.get("content-length") ?? 0);
  if (length > MAX_VIDEO_BYTES + 1024 * 1024) throw new AppError("validation", "That file is too large.");
  let form: FormData;
  try {
    form = await req.formData();
  } catch {
    throw new AppError("bad_request", "The upload couldn't be read. Please try again.");
  }
  const file = form.get("file");
  if (!(file instanceof File) || file.size === 0) throw new AppError("validation", "Choose a file to upload.");
  const purpose = purposes.parse(form.get("purpose")) as UploadPurpose;
  const businessIdRaw = form.get("businessId");
  const businessId = typeof businessIdRaw === "string" && businessIdRaw ? z.string().uuid().parse(businessIdRaw) : null;
  if (businessId) {
    const perm = purpose === "portfolio" || purpose === "service" ? (["portfolio.manage", "services.manage"] as const) : purpose === "message" ? (["messages.manage"] as const) : (["business.manage"] as const);
    await requireMember(viewer, businessId, [...perm]);
  } else if (!["avatar", "support", "message"].includes(purpose)) {
    throw new AppError("validation", "Choose a business for this upload.");
  }
  const alt = form.get("alt");
  const row = await ingestUpload({ ownerUserId: viewer.id, businessId, purpose, data: Buffer.from(await file.arrayBuffer()), alt: typeof alt === "string" ? alt.slice(0, 200) : null });
  return { id: row.id, status: row.status, kind: row.kind, media: toPublicMedia(row) };
});
