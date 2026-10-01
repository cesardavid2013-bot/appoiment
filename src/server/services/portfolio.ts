import "server-only";
import { and, asc, desc, eq, inArray, isNull, sql } from "drizzle-orm";
import { z } from "zod";
import { AppError, forbidden, notFound } from "@/domain/errors";
import { db } from "../db/client";
import { businessMembers, media, portfolioItems, services } from "../db/schema";
import type { Membership } from "../authz";
import { audit } from "../audit";
import { assertMediaOwned, getMediaMap } from "./media";

export const portfolioSchema = z.object({
  mediaId: z.string().uuid(),
  beforeMediaId: z.string().uuid().nullable().default(null),
  caption: z.string().trim().max(300, "Keep captions under 300 characters").nullable().default(null),
  serviceId: z.string().uuid().nullable().default(null),
  memberId: z.string().uuid().nullable().default(null),
  isFeatured: z.boolean().default(false),
});

export const portfolioUpdateSchema = portfolioSchema.pick({ caption: true, serviceId: true, memberId: true, isFeatured: true }).partial();

/** Same order customers see on the public profile (catalog.getPublicBusiness). */
const publicOrder = [desc(portfolioItems.isFeatured), asc(portfolioItems.sortOrder), desc(portfolioItems.createdAt)] as const;

function check(m: Membership) {
  if (!m.permissions.has("portfolio.manage")) throw forbidden();
}

async function assertRefs(m: Membership, input: { serviceId?: string | null; memberId?: string | null }) {
  if (input.serviceId) {
    const [s] = await db.select({ id: services.id }).from(services).where(and(eq(services.id, input.serviceId), eq(services.businessId, m.businessId)));
    if (!s) throw notFound("That service");
  }
  if (input.memberId) {
    const [mm] = await db.select({ id: businessMembers.id }).from(businessMembers).where(and(eq(businessMembers.id, input.memberId), eq(businessMembers.businessId, m.businessId)));
    if (!mm) throw notFound("That team member");
  }
}

export async function addPortfolioItem(m: Membership, actorUserId: string, input: z.infer<typeof portfolioSchema>) {
  check(m);
  const main = await assertMediaOwned(input.mediaId, { businessId: m.businessId });
  if (input.beforeMediaId) {
    if (input.beforeMediaId === input.mediaId) throw new AppError("validation", "Choose two different photos for before and after.");
    const before = await assertMediaOwned(input.beforeMediaId, { businessId: m.businessId });
    if (before.kind !== "image" || main.kind !== "image") throw new AppError("validation", "Before/after posts need two photos.");
  }
  await assertRefs(m, input);
  // New work goes to the top of its group.
  const [{ min }] = await db
    .select({ min: sql<number>`coalesce(min(${portfolioItems.sortOrder}), 0)::int` })
    .from(portfolioItems)
    .where(and(eq(portfolioItems.businessId, m.businessId), isNull(portfolioItems.deletedAt)));
  const [item] = await db
    .insert(portfolioItems)
    .values({ businessId: m.businessId, ...input, sortOrder: min - 1, kind: input.beforeMediaId ? "before_after" : main.kind === "video" ? "video" : "image" })
    .returning();
  await audit({ actorUserId, actorType: "business", businessId: m.businessId, action: "portfolio.added", targetType: "portfolio", targetId: item.id });
  return item;
}

async function getItem(m: Membership, id: string) {
  const [it] = await db.select().from(portfolioItems).where(and(eq(portfolioItems.id, id), eq(portfolioItems.businessId, m.businessId), isNull(portfolioItems.deletedAt)));
  if (!it) throw notFound("That item");
  return it;
}

export async function updatePortfolioItem(m: Membership, actorUserId: string, id: string, input: z.infer<typeof portfolioUpdateSchema>) {
  check(m);
  await getItem(m, id);
  await assertRefs(m, input);
  if (Object.values(input).every((v) => v === undefined)) return null;
  const [row] = await db.update(portfolioItems).set(input).where(and(eq(portfolioItems.id, id), eq(portfolioItems.businessId, m.businessId))).returning();
  await audit({ actorUserId, actorType: "business", businessId: m.businessId, action: "portfolio.updated", targetType: "portfolio", targetId: id });
  return row;
}

export async function removePortfolioItem(m: Membership, actorUserId: string, id: string) {
  check(m);
  await getItem(m, id);
  await db.update(portfolioItems).set({ deletedAt: new Date() }).where(and(eq(portfolioItems.id, id), eq(portfolioItems.businessId, m.businessId)));
  await audit({ actorUserId, actorType: "business", businessId: m.businessId, action: "portfolio.removed", targetType: "portfolio", targetId: id });
}

/** Persists a full manual order. Ids must be exactly the business's current items. */
export async function reorderPortfolio(m: Membership, ids: string[]) {
  check(m);
  const current = await db
    .select({ id: portfolioItems.id })
    .from(portfolioItems)
    .where(and(eq(portfolioItems.businessId, m.businessId), isNull(portfolioItems.deletedAt)));
  const known = new Set(current.map((r) => r.id));
  if (ids.length !== known.size || new Set(ids).size !== ids.length || ids.some((i) => !known.has(i))) {
    throw new AppError("conflict", "Your portfolio changed in another tab. Refresh and try again.");
  }
  await db.transaction(async (tx) => {
    for (const [i, id] of ids.entries()) await tx.update(portfolioItems).set({ sortOrder: i }).where(and(eq(portfolioItems.id, id), eq(portfolioItems.businessId, m.businessId)));
  });
}

export async function listPortfolio(businessId: string) {
  const rows = await db
    .select({
      item: portfolioItems,
      serviceName: services.name,
      serviceStatus: services.status,
      memberName: businessMembers.displayName,
    })
    .from(portfolioItems)
    .leftJoin(services, eq(services.id, portfolioItems.serviceId))
    .leftJoin(businessMembers, eq(businessMembers.id, portfolioItems.memberId))
    .where(and(eq(portfolioItems.businessId, businessId), isNull(portfolioItems.deletedAt)))
    .orderBy(...publicOrder)
    .limit(200);
  const ids = rows.flatMap((r) => [r.item.mediaId, r.item.beforeMediaId]).filter((x): x is string => Boolean(x));
  const [mediaMap, statuses] = await Promise.all([
    getMediaMap(ids),
    ids.length ? db.select({ id: media.id, status: media.status }).from(media).where(inArray(media.id, ids)) : Promise.resolve([]),
  ]);
  const statusOf = new Map(statuses.map((s) => [s.id, s.status]));
  return rows.map(({ item: r, serviceName, serviceStatus, memberName }) => {
    const main = statusOf.get(r.mediaId) ?? "failed";
    const before = r.beforeMediaId ? (statusOf.get(r.beforeMediaId) ?? "failed") : "ready";
    return {
      id: r.id,
      kind: r.kind,
      caption: r.caption,
      serviceId: r.serviceId,
      serviceName,
      /** Customers only see "Book this" for services that are live. */
      serviceBookable: serviceStatus === "active",
      memberId: r.memberId,
      memberName,
      isFeatured: r.isFeatured,
      sortOrder: r.sortOrder,
      createdAt: r.createdAt.toISOString(),
      media: mediaMap.get(r.mediaId) ?? null,
      before: r.beforeMediaId ? (mediaMap.get(r.beforeMediaId) ?? null) : null,
      mediaStatus: main === "failed" || before === "failed" ? ("failed" as const) : main === "processing" || before === "processing" ? ("processing" as const) : ("ready" as const),
    };
  });
}

export type PortfolioListItem = Awaited<ReturnType<typeof listPortfolio>>[number];
