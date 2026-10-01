import "server-only";
import { and, desc, eq, inArray, sql } from "drizzle-orm";
import { z } from "zod";
import { AppError, forbidden, notFound } from "@/domain/errors";
import { entitlements } from "@/domain/plans";
import { promotionStatus } from "@/domain/promotions";
import { instantToLocal, localMinuteToInstant, todayIn } from "@/domain/time";
import { db } from "../db/client";
import { isUniqueViolation } from "../db/errors";
import { promotionRedemptions, promotions, services } from "../db/schema";
import type { Membership } from "../authz";
import { audit } from "../audit";

const isoDate = z.string().regex(/^\d{4}-\d{2}-\d{2}$/, "Pick a date");

/**
 * Promotion codes as edited in the console. Dates are whole local days in the
 * business time zone: a code runs from 00:00 on `startsOn` through 23:59 on
 * `endsOn` (inclusive) — converted to instants server-side.
 */
export const promotionSchema = z
  .object({
    code: z
      .string()
      .trim()
      .toUpperCase()
      .min(3, "Codes need at least 3 characters")
      .max(24, "Keep codes to 24 characters or fewer")
      .regex(/^[A-Z0-9-]+$/, "Use letters, numbers and dashes only — no spaces"),
    name: z.string().trim().min(2, "Give the offer a short name customers will see").max(60, "Keep the name under 60 characters"),
    kind: z.enum(["percent", "fixed"]),
    /** percent: whole percent from the UI (converted to bps); fixed: minor units */
    value: z.number({ error: "Enter the discount" }).int("Use a whole number").min(1, "Enter a discount greater than zero"),
    minSubtotalCents: z.number().int().min(0, "The minimum can't be negative").default(0),
    serviceIds: z.array(z.string().uuid()).max(100).nullable().default(null),
    newCustomersOnly: z.boolean().default(false),
    startsOn: isoDate.nullable().default(null),
    endsOn: isoDate.nullable().default(null),
    maxRedemptions: z.number().int().min(1, "Allow at least one use, or leave it blank for no limit").nullable().default(null),
    perCustomerLimit: z.number().int().min(1, "Each client needs at least one use").max(100, "That's more than 100 uses per client").default(1),
    isActive: z.boolean().default(true),
  })
  .refine((v) => v.kind !== "percent" || v.value <= 100, { message: "A percentage discount can't be more than 100%", path: ["value"] })
  .refine((v) => !v.startsOn || !v.endsOn || v.startsOn <= v.endsOn, { message: "The last day can't be before the first day", path: ["endsOn"] });

export type PromotionInput = z.infer<typeof promotionSchema>;

function check(m: Membership) {
  if (!m.permissions.has("promotions.manage")) throw forbidden();
  if (!entitlements(m.plan).promotions) throw new AppError("forbidden", "Promotions aren't included in your plan.");
}

export async function savePromotion(m: Membership, actorUserId: string, input: PromotionInput, id?: string) {
  check(m);
  const tz = m.timezone;
  const startsAt = input.startsOn ? new Date(localMinuteToInstant(input.startsOn, 0, tz)!) : null;
  const endsAt = input.endsOn ? new Date(localMinuteToInstant(input.endsOn, 1440, tz)!) : null;

  let existing: typeof promotions.$inferSelect | undefined;
  if (id) {
    [existing] = await db.select().from(promotions).where(and(eq(promotions.id, id), eq(promotions.businessId, m.businessId)));
    if (!existing) throw notFound("That promotion");
  }
  // Only block a past end date when it's being set now — editing an old code's name shouldn't fail.
  const endChanged = !existing || (existing.endsAt?.getTime() ?? null) !== (endsAt?.getTime() ?? null);
  if (endChanged && input.endsOn && input.endsOn < todayIn(tz)) {
    throw new AppError("validation", "The last day has already passed.", { fields: { endsOn: "Pick today or a later day" } });
  }

  const serviceIds = input.serviceIds && input.serviceIds.length ? [...new Set(input.serviceIds)] : null;
  if (serviceIds) {
    const owned = await db.select({ id: services.id }).from(services).where(and(eq(services.businessId, m.businessId), inArray(services.id, serviceIds)));
    if (owned.length !== serviceIds.length) throw new AppError("validation", "One of the selected services no longer exists.", { fields: { serviceIds: "Re-select the services" } });
  }

  const values = {
    businessId: m.businessId,
    code: input.code,
    name: input.name,
    kind: input.kind,
    value: input.kind === "percent" ? input.value * 100 : input.value,
    minSubtotalCents: input.minSubtotalCents,
    serviceIds,
    newCustomersOnly: input.newCustomersOnly,
    startsAt,
    endsAt,
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
    if (isUniqueViolation(err)) throw new AppError("conflict", `You already have a code called ${input.code}.`, { fields: { code: "Choose a different code" } });
    throw err;
  }
}

/** Turn a code off (customers can no longer apply it) or back on. Codes are never deleted: past bookings reference them. */
export async function setPromotionActive(m: Membership, actorUserId: string, id: string, isActive: boolean) {
  check(m);
  const [row] = await db.update(promotions).set({ isActive }).where(and(eq(promotions.id, id), eq(promotions.businessId, m.businessId))).returning();
  if (!row) throw notFound("That promotion");
  await audit({ actorUserId, actorType: "business", businessId: m.businessId, action: isActive ? "promotion.activated" : "promotion.deactivated", targetType: "promotion", targetId: id });
  return row;
}

export async function listPromotions(m: Membership, now = new Date()) {
  check(m);
  const rows = await db
    .select({
      p: promotions,
      discountCents: sql<number>`coalesce((select sum(r.discount_cents) from ${promotionRedemptions} r where r.promotion_id = promotions.id and r.voided_at is null), 0)::int`,
    })
    .from(promotions)
    .where(eq(promotions.businessId, m.businessId))
    .orderBy(desc(promotions.createdAt))
    .limit(200);
  const tz = m.timezone;
  return rows.map(({ p, discountCents }) => ({
    id: p.id,
    code: p.code,
    name: p.name,
    kind: p.kind,
    /** Stored value (bps or minor units). */
    value: p.value,
    minSubtotalCents: p.minSubtotalCents,
    serviceIds: p.serviceIds,
    newCustomersOnly: p.newCustomersOnly,
    startsAt: p.startsAt?.toISOString() ?? null,
    endsAt: p.endsAt?.toISOString() ?? null,
    startsOn: p.startsAt ? instantToLocal(p.startsAt.getTime(), tz).date : null,
    /** endsAt is the exclusive midnight after the last day. */
    endsOn: p.endsAt ? instantToLocal(p.endsAt.getTime() - 1, tz).date : null,
    maxRedemptions: p.maxRedemptions,
    redemptionCount: p.redemptionCount,
    perCustomerLimit: p.perCustomerLimit,
    isActive: p.isActive,
    status: promotionStatus(p, now),
    discountCents,
    createdAt: p.createdAt.toISOString(),
  }));
}

export type PromotionListItem = Awaited<ReturnType<typeof listPromotions>>[number];

/** Services a code can be limited to (active and hidden; archived ones can't be booked). */
export async function promotableServices(businessId: string) {
  return db
    .select({ id: services.id, name: services.name, status: services.status })
    .from(services)
    .where(and(eq(services.businessId, businessId), sql`${services.status} <> 'archived'`))
    .orderBy(services.sortOrder, services.name);
}
