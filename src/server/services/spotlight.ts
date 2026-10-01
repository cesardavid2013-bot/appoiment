import "server-only";
import { and, desc, eq, inArray, sql } from "drizzle-orm";
import { z } from "zod";
import { AppError, notFound } from "@/domain/errors";
import { db } from "../db/client";
import { businesses, categories, spotlightCampaigns } from "../db/schema";
import type { Membership } from "../authz";
import { audit } from "../audit";

/** Launch pricing: Spotlight is free. Change here (and wire billing) to charge. */
export const SPOTLIGHT_PRICE_PER_DAY_CENTS = 0;
export const SPOTLIGHT_DURATIONS = [7, 14, 30] as const;
export const MAX_PROMOTED_PER_SEARCH = 2;

export const startSpotlightSchema = z.object({
  days: z.union([z.literal(7), z.literal(14), z.literal(30)]),
  categoryId: z.string().uuid().nullable().default(null),
});

async function expireOld() {
  await db.update(spotlightCampaigns).set({ status: "ended" }).where(and(eq(spotlightCampaigns.status, "active"), sql`${spotlightCampaigns.endsAt} < now()`));
}

export async function getSpotlight(businessId: string) {
  await expireOld();
  const rows = await db.select().from(spotlightCampaigns).where(eq(spotlightCampaigns.businessId, businessId)).orderBy(desc(spotlightCampaigns.createdAt)).limit(10);
  return { active: rows.find((r) => r.status === "active" || r.status === "paused") ?? null, history: rows };
}

export async function startSpotlight(m: Membership, actorUserId: string, input: z.infer<typeof startSpotlightSchema>) {
  await expireOld();
  const [b] = await db.select({ status: businesses.status }).from(businesses).where(eq(businesses.id, m.businessId));
  if (b?.status !== "active") throw new AppError("validation", "Publish your profile before promoting it.");
  if (input.categoryId) {
    const [c] = await db.select({ id: categories.id }).from(categories).where(eq(categories.id, input.categoryId));
    if (!c) throw notFound("That category");
  }
  const priceCents = SPOTLIGHT_PRICE_PER_DAY_CENTS * input.days;
  if (priceCents > 0) throw new AppError("unavailable", "Paid promotion isn't available yet.");
  try {
    const [row] = await db
      .insert(spotlightCampaigns)
      .values({ businessId: m.businessId, categoryId: input.categoryId, endsAt: new Date(Date.now() + input.days * 86_400_000), priceCents, currency: m.currency, createdByUserId: actorUserId })
      .returning();
    await audit({ actorUserId, actorType: "business", businessId: m.businessId, action: "spotlight.started", targetType: "spotlight", targetId: row.id, metadata: { days: input.days } });
    return row;
  } catch (err) {
    const { isUniqueViolation } = await import("../db/errors");
    if (isUniqueViolation(err)) throw new AppError("conflict", "You already have an active promotion.");
    throw err;
  }
}

export async function setSpotlightStatus(m: Membership, actorUserId: string, id: string, status: "active" | "paused" | "ended") {
  const [row] = await db
    .update(spotlightCampaigns)
    .set({ status })
    .where(and(eq(spotlightCampaigns.id, id), eq(spotlightCampaigns.businessId, m.businessId), sql`${spotlightCampaigns.status} <> 'ended'`))
    .returning();
  if (!row) throw notFound("That promotion");
  await audit({ actorUserId, actorType: "business", businessId: m.businessId, action: `spotlight.${status}`, targetType: "spotlight", targetId: id });
  return row;
}

/** Business ids with a live campaign matching the search category (or any). */
export function activeSpotlightCondition(categoryIds: string[] | null) {
  return sql`exists (select 1 from spotlight_campaigns sc where sc.business_id = businesses.id and sc.status = 'active' and sc.starts_at <= now() and sc.ends_at > now() and (sc.category_id is null ${
    categoryIds && categoryIds.length ? sql`or ${inArray(sql`sc.category_id`, categoryIds)}` : sql``
  }))`;
}

export async function recordImpressions(businessIds: string[]) {
  if (!businessIds.length) return;
  await db
    .update(spotlightCampaigns)
    .set({ impressions: sql`${spotlightCampaigns.impressions} + 1` })
    .where(and(inArray(spotlightCampaigns.businessId, businessIds), eq(spotlightCampaigns.status, "active")));
}

export async function recordClick(businessId: string) {
  await db
    .update(spotlightCampaigns)
    .set({ clicks: sql`${spotlightCampaigns.clicks} + 1` })
    .where(and(eq(spotlightCampaigns.businessId, businessId), eq(spotlightCampaigns.status, "active")));
}
