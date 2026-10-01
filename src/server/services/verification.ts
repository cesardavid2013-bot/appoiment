import "server-only";
import { and, desc, eq, inArray } from "drizzle-orm";
import { z } from "zod";
import { AppError } from "@/domain/errors";
import { db } from "../db/client";
import { businesses, verificationRequests } from "../db/schema";
import type { Membership } from "../authz";
import { audit } from "../audit";
import { assertMediaOwned } from "./media";

/**
 * Business-side identity/licence verification. A business submits details and
 * documents; Kept staff decide in the admin console (services/admin.ts).
 */

export const MAX_VERIFICATION_DOCUMENTS = 10;

export const submitVerificationSchema = z
  .object({
    details: z
      .string()
      .trim()
      .max(2000, "Keep it under 2,000 characters")
      .optional()
      .nullable()
      .transform((v) => (v ? v : null)),
    documentMediaIds: z
      .array(z.string().uuid("Invalid document"))
      .max(MAX_VERIFICATION_DOCUMENTS, `Attach at most ${MAX_VERIFICATION_DOCUMENTS} documents`)
      .default([])
      .transform((ids) => [...new Set(ids)]),
  })
  .refine((v) => v.details || v.documentMediaIds.length > 0, { message: "Add a short description or at least one document.", path: ["details"] });

export type SubmitVerificationInput = z.infer<typeof submitVerificationSchema>;

/** Current verification status plus the most recent request, for the business's settings UI. */
export async function getVerificationState(businessId: string) {
  const [[b], [latest]] = await Promise.all([
    db.select({ status: businesses.verificationStatus }).from(businesses).where(eq(businesses.id, businessId)),
    db
      .select({
        id: verificationRequests.id,
        status: verificationRequests.status,
        details: verificationRequests.details,
        documentMediaIds: verificationRequests.documentMediaIds,
        decisionNote: verificationRequests.decisionNote,
        createdAt: verificationRequests.createdAt,
        reviewedAt: verificationRequests.reviewedAt,
      })
      .from(verificationRequests)
      .where(eq(verificationRequests.businessId, businessId))
      .orderBy(desc(verificationRequests.createdAt))
      .limit(1),
  ]);
  return { status: b?.status ?? "not_submitted", latest: latest ?? null };
}

export async function submitVerification(membership: Membership, actorUserId: string, input: SubmitVerificationInput) {
  const data = submitVerificationSchema.parse(input);
  // Documents must have been uploaded for this business.
  for (const id of data.documentMediaIds) await assertMediaOwned(id, { businessId: membership.businessId });

  return db.transaction(async (tx) => {
    const [b] = await tx
      .select({ id: businesses.id, verificationStatus: businesses.verificationStatus })
      .from(businesses)
      .where(eq(businesses.id, membership.businessId))
      .for("update");
    if (!b) throw new AppError("not_found", "That business couldn't be found.");
    if (b.verificationStatus === "verified") throw new AppError("conflict", "Your business is already verified.");
    const [pending] = await tx
      .select({ id: verificationRequests.id })
      .from(verificationRequests)
      .where(and(eq(verificationRequests.businessId, b.id), inArray(verificationRequests.status, ["pending"])))
      .limit(1);
    if (pending) throw new AppError("conflict", "Your verification is already being reviewed. We'll let you know as soon as it's done.");

    const [request] = await tx
      .insert(verificationRequests)
      .values({ businessId: b.id, submittedByUserId: actorUserId, details: data.details, documentMediaIds: data.documentMediaIds, status: "pending" })
      .returning();
    await tx.update(businesses).set({ verificationStatus: "pending" }).where(eq(businesses.id, b.id));
    await audit(
      {
        actorUserId,
        actorType: "business",
        businessId: b.id,
        action: "verification.submitted",
        targetType: "verification_request",
        targetId: request.id,
        metadata: { documents: data.documentMediaIds.length, previous: b.verificationStatus },
      },
      tx,
    );
    return request;
  });
}
