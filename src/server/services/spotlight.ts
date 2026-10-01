import "server-only";
import { and, desc, eq, inArray, or, sql } from "drizzle-orm";
import { z } from "zod";
import { AppError, forbidden, notFound } from "@/domain/errors";
import { db } from "../db/client";
import { isUniqueViolation } from "../db/errors";
import { businesses, categories, services, spotlightCampaigns } from "../db/schema";
import type { Membership } from "../authz";
import { audit } from "../audit";

/** Launch pricing: Spotlight is free. Change here (and wire billing) to charge. */
export const SPOTLIGHT_PRICE_PER_DAY_CENTS = 0;
export const SPOTLIGHT_DURATIONS = [7, 14, 30] as const;
export const MAX_PROMOTED_PER_SEARCH = 2;

export const startSpotlightSchema = z.object({
  days: z.union([z.literal(7), z.literal(14), z.literal(30)], { error: "Choose 7, 14 or 30 days" }),
  categoryId: z.string().uuid().nullable().default(null),
});

export const spotlightActionSchema = z.object({ action: z.enum(["pause", "resume", "end"]) });
export type SpotlightAction = z.infer<typeof spotlightActionSchema>["action"];

type Campaign = typeof spotlightCampaigns.$inferSelect;

/** Campaigns whose end date passed (running or paused) are closed out. */
async function expireOld(businessId?: string) {
  await db
    .update(spotlightCampaigns)
    .set({ status: "ended" })
    .where(and(inArray(spotlightCampaigns.status, ["active", "paused"]), sql`${spotlightCampaigns.endsAt} <= now()`, businessId ? eq(spotlightCampaigns.businessId, businessId) : undefined));
}

function check(m: Membership) {
  if (!m.permissions.has("promotions.manage")) throw forbidden();
}

/** Categories a business can target: its primary category plus those of its live services. */
export async function spotlightCategories(businessId: string) {
  return db
    .selectDistinct({ id: categories.id, name: categories.name })
    .from(categories)
    .where(
      or(
        sql`${categories.id} = (select primary_category_id from businesses where id = ${businessId})`,
        sql`${categories.id} in (select s.category_id from ${services} s where s.business_id = ${businessId} and s.status = 'active' and s.category_id is not null)`,
      ),
    )
    .orderBy(categories.name);
}

/** Why a business can't run Spotlight right now (null = it can). */
function ineligibleReason(status: string | undefined): string | null {
  if (status === "active") return null;
  if (status === "draft") return "Your profile isn't published yet. Publish it so customers can find and book you, then come back to promote it.";
  if (status === "suspended") return "Your business is suspended, so it can't appear in search. Contact support to resolve this.";
  return "Your business is closed, so it can't appear in search.";
}

export async function getSpotlight(m: Membership) {
  check(m);
  await expireOld(m.businessId);
  const [rows, [b], cats] = await Promise.all([
    db
      .select({ c: spotlightCampaigns, categoryName: categories.name })
      .from(spotlightCampaigns)
      .leftJoin(categories, eq(categories.id, spotlightCampaigns.categoryId))
      .where(eq(spotlightCampaigns.businessId, m.businessId))
      .orderBy(desc(spotlightCampaigns.createdAt))
      .limit(20),
    db.select({ status: businesses.status }).from(businesses).where(eq(businesses.id, m.businessId)),
    spotlightCategories(m.businessId),
  ]);
  const campaigns = rows.map(({ c, categoryName }) => ({
    id: c.id,
    status: c.status,
    categoryId: c.categoryId,
    categoryName,
    startsAt: c.startsAt.toISOString(),
    endsAt: c.endsAt.toISOString(),
    impressions: c.impressions,
    clicks: c.clicks,
    priceCents: c.priceCents,
    currency: c.currency,
  }));
  return {
    current: campaigns.find((c) => c.status === "active" || c.status === "paused") ?? null,
    past: campaigns.filter((c) => c.status === "ended"),
    categories: cats,
    blockedReason: ineligibleReason(b?.status),
    priceCentsPerDay: SPOTLIGHT_PRICE_PER_DAY_CENTS,
  };
}

export async function startSpotlight(m: Membership, actorUserId: string, input: z.infer<typeof startSpotlightSchema>, now = new Date()) {
  check(m);
  await expireOld(m.businessId);
  const [b] = await db.select({ status: businesses.status }).from(businesses).where(eq(businesses.id, m.businessId));
  const blocked = ineligibleReason(b?.status);
  if (blocked) throw new AppError("validation", blocked);
  if (input.categoryId) {
    const allowed = await spotlightCategories(m.businessId);
    if (!allowed.some((c) => c.id === input.categoryId)) throw notFound("That category");
  }
  const priceCents = SPOTLIGHT_PRICE_PER_DAY_CENTS * input.days;
  if (priceCents > 0) throw new AppError("unavailable", "Paid promotion isn't available yet.");

  return db.transaction(async (tx) => {
    // Serialise starts per business; the partial unique index only covers 'active', so a paused campaign is checked here.
    await tx.execute(sql`select id from businesses where id = ${m.businessId} for update`);
    const [open] = await tx
      .select({ id: spotlightCampaigns.id, status: spotlightCampaigns.status })
      .from(spotlightCampaigns)
      .where(and(eq(spotlightCampaigns.businessId, m.businessId), inArray(spotlightCampaigns.status, ["active", "paused"])));
    if (open) throw new AppError("conflict", open.status === "paused" ? "You have a paused campaign. Resume or end it before starting a new one." : "You already have a campaign running.");
    try {
      const [row] = await tx
        .insert(spotlightCampaigns)
        .values({ businessId: m.businessId, categoryId: input.categoryId, startsAt: now, endsAt: new Date(now.getTime() + input.days * 86_400_000), priceCents, currency: m.currency, createdByUserId: actorUserId })
        .returning();
      await audit({ actorUserId, actorType: "business", businessId: m.businessId, action: "spotlight.started", targetType: "spotlight", targetId: row.id, metadata: { days: input.days, categoryId: input.categoryId } }, tx);
      return row;
    } catch (err) {
      if (isUniqueViolation(err)) throw new AppError("conflict", "You already have a campaign running.");
      throw err;
    }
  });
}

/**
 * State machine: active ⇄ paused, either → ended. Pausing doesn't extend the
 * end date; resuming after the end date closes the campaign instead. Ending
 * early records the actual end time so history shows the real run.
 */
export async function setSpotlightStatus(m: Membership, actorUserId: string, id: string, action: SpotlightAction, now = new Date()) {
  check(m);
  const [c] = await db.select().from(spotlightCampaigns).where(and(eq(spotlightCampaigns.id, id), eq(spotlightCampaigns.businessId, m.businessId)));
  if (!c) throw notFound("That campaign");
  if (c.status === "ended") throw new AppError("conflict", "This campaign has already ended.");

  let patch: Partial<Campaign>;
  if (action === "pause") {
    if (c.status !== "active") throw new AppError("conflict", "This campaign is already paused.");
    patch = { status: "paused" };
  } else if (action === "resume") {
    if (c.status !== "paused") throw new AppError("conflict", "This campaign is already running.");
    if (c.endsAt <= now) {
      await db.update(spotlightCampaigns).set({ status: "ended" }).where(eq(spotlightCampaigns.id, id));
      throw new AppError("conflict", "This campaign reached its end date while paused. Start a new one instead.");
    }
    const [b] = await db.select({ status: businesses.status }).from(businesses).where(eq(businesses.id, m.businessId));
    const blocked = ineligibleReason(b?.status);
    if (blocked) throw new AppError("validation", blocked);
    patch = { status: "active" };
  } else {
    patch = { status: "ended", endsAt: c.endsAt < now ? c.endsAt : now };
  }
  const [row] = await db
    .update(spotlightCampaigns)
    .set(patch)
    .where(and(eq(spotlightCampaigns.id, id), eq(spotlightCampaigns.status, c.status)))
    .returning();
  if (!row) throw new AppError("conflict", "This campaign just changed. Refresh and try again.");
  await audit({ actorUserId, actorType: "business", businessId: m.businessId, action: `spotlight.${action}`, targetType: "spotlight", targetId: id });
  return row;
}

/** Business ids with a live campaign matching the search category (or any). */
export function activeSpotlightCondition(categoryIds: string[] | null) {
  return sql`exists (select 1 from spotlight_campaigns sc where sc.business_id = businesses.id and sc.status = 'active' and sc.starts_at <= now() and sc.ends_at > now() and (sc.category_id is null ${
    categoryIds && categoryIds.length ? sql`or ${inArray(sql`sc.category_id`, categoryIds)}` : sql``
  }))`;
}

const live = and(eq(spotlightCampaigns.status, "active"), sql`${spotlightCampaigns.startsAt} <= now()`, sql`${spotlightCampaigns.endsAt} > now()`);

export async function recordImpressions(businessIds: string[]) {
  if (!businessIds.length) return;
  await db
    .update(spotlightCampaigns)
    .set({ impressions: sql`${spotlightCampaigns.impressions} + 1` })
    .where(and(inArray(spotlightCampaigns.businessId, businessIds), live));
}

export async function recordClick(businessId: string) {
  await db
    .update(spotlightCampaigns)
    .set({ clicks: sql`${spotlightCampaigns.clicks} + 1` })
    .where(and(eq(spotlightCampaigns.businessId, businessId), live));
}
