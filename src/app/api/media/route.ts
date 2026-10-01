import { z } from "zod";
import { AppError } from "@/domain/errors";
import { requireMember } from "@/server/authz";
import { readBodyLimited, route } from "@/server/http";
import { rateLimit } from "@/server/rate-limit";
import { ingestUpload, MAX_IMAGE_BYTES, MAX_VIDEO_BYTES, toPublicMedia, type UploadPurpose } from "@/server/services/media";

const purposes = z.enum(["portfolio", "logo", "cover", "avatar", "service", "support", "message", "verification"]);

/**
 * Multipart upload. Business uploads require the matching permission; the
 * business id is verified against the viewer's real membership.
 */
export const POST = route({ auth: true }, async ({ req, viewer }) => {
  await rateLimit("upload", viewer.id);
  // The purpose is also in the URL so the size cap is known before the body is read:
  // only portfolio/service accept video; everything else is image-sized.
  const declaredPurpose = purposes.parse(req.nextUrl.searchParams.get("purpose")) as UploadPurpose;
  const allowsVideo = declaredPurpose === "portfolio" || declaredPurpose === "service";
  const cap = (allowsVideo ? MAX_VIDEO_BYTES : MAX_IMAGE_BYTES) + 64 * 1024;
  const body = await readBodyLimited(req, cap, allowsVideo ? "Videos must be under 150 MB." : "Images must be under 15 MB.");
  let form: FormData;
  try {
    form = await new Response(body, { headers: { "content-type": req.headers.get("content-type") ?? "" } }).formData();
  } catch {
    throw new AppError("bad_request", "The upload couldn't be read. Please try again.");
  }
  const file = form.get("file");
  if (!(file instanceof File) || file.size === 0) throw new AppError("validation", "Choose a file to upload.");
  const purpose = purposes.parse(form.get("purpose")) as UploadPurpose;
  if (purpose !== declaredPurpose) throw new AppError("bad_request", "The upload couldn't be read. Please try again.");
  const businessIdRaw = form.get("businessId");
  const businessId = typeof businessIdRaw === "string" && businessIdRaw ? z.string().uuid().parse(businessIdRaw) : null;
  if (businessId) {
    // Staff photos: any active member may upload (their own); attaching to someone else is checked by team.manage on save.
    const perm = purpose === "portfolio" || purpose === "service" ? (["portfolio.manage", "services.manage"] as const) : purpose === "message" ? (["messages.manage"] as const) : purpose === "avatar" ? null : (["business.manage"] as const);
    await requireMember(viewer, businessId, perm ? [...perm] : undefined);
  } else if (!["avatar", "support", "message"].includes(purpose)) {
    throw new AppError("validation", "Choose a business for this upload.");
  }
  const alt = form.get("alt");
  const row = await ingestUpload({ ownerUserId: viewer.id, businessId, purpose, data: Buffer.from(await file.arrayBuffer()), alt: typeof alt === "string" ? alt.slice(0, 200) : null });
  return { id: row.id, status: row.status, kind: row.kind, media: toPublicMedia(row) };
});
