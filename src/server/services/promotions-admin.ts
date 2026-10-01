import "server-only";
import { and, desc, eq } from "drizzle-orm";
import { z } from "zod";
import { AppError, forbidden, notFound } from "@/domain/errors";
import { entitlements } from "@/domain/plans";
import { db } from "../db/client";
import { isUniqueViolation } from "../db/errors";
import { promotions } from "../db/schema";
import type { Membership } from "../authz";
import { audit } from "../audit";

export const promotionSchema = z
  .object({
    code: z.string().trim().toUpperCase().min(3, "At least 3 characters").max(24).regex(/^[A-Z0-9-]+$/, "Letters, numbers and dashes only"),
    name: z.string().trim().min(2).max(60),
    kind: z.enum(["percent", "fixed"]),
    /** percent: whole percent from the UI (converted to bps); fixed: cents */
    value: z.number().int().min(1),
    minSubtotalCents: z.number().int().min(0).default(0),
    serviceIds: z.array(z.string().uuid()).max(100).nullable().default(null),
    newCustomersOnly: z.boolean().default(false),
    startsAt: z.string().datetime({ offset: true }).nullable().default(null),
    endsAt: z.string().datetime({ offset: true }).nullable().default(null),
    maxRedemptions: z.number().int().min(1).nullable().default(null),
    perCustomerLimit: z.number().int().min(1).max(100).default(1),
    isActive: z.boolean().default(true),
  })
  .refine((v) => v.kind !== "percent" || v.value <= 100, { message: "A percentage can't exceed 100", path: ["value"] })
  .refine((v) => !v.startsAt || !v.endsAt || new Date(v.startsAt) < new Date(v.endsAt), { message: "End must be after start", path: ["endsAt"] });

function check(m: Membership) {
  if (!m.permissions.has("promotions.manage")) throw forbidden();
  if (!entitlements(m.plan).promotions) throw new AppError("forbidden", "Promotions aren't included in your plan.");
}

export async function savePromotion(m: Membership, actorUserId: string, input: z.infer<typeof promotionSchema>, id?: string) {
  check(m);
  const values = {
    businessId: m.businessId,
    code: input.code,
    name: input.name,
    kind: input.kind,
    value: input.kind === "percent" ? input.value * 100 : input.value,
    minSubtotalCents: input.minSubtotalCents,
    serviceIds: input.serviceIds && input.serviceIds.length ? input.serviceIds : null,
    newCustomersOnly: input.newCustomersOnly,
    startsAt: input.startsAt ? new Date(input.startsAt) : null,
    endsAt: input.endsAt ? new Date(input.endsAt) : null,
    maxRedemptions: input.maxRedemptions,
    perCustomerLimit: input.perCustomerLimit,
    isActive: input.isActive,
  };
  try {
    let row;
    if (id) {
      [row] = await db.update(promotions).set(values).where(and(eq(promotions.id, id), eq(promotions.businessId, m.businessId))).returning();
      if (!row) throw notFound("That promotion");
    } else [row] = await db.insert(promotions).values(values).returning();
    await audit({ actorUserId, actorType: "business", businessId: m.businessId, action: id ? "promotion.updated" : "promotion.created", targetType: "promotion", targetId: row.id });
    return row;
  } catch (err) {
    if (isUniqueViolation(err)) throw new AppError("conflict", "You already have a promotion with that code.", { fields: { code: "Code already used" } });
    throw err;
  }
}

export async function listPromotions(m: Membership) {
  check(m);
  return db.select().from(promotions).where(eq(promotions.businessId, m.businessId)).orderBy(desc(promotions.createdAt)).limit(200);
}
