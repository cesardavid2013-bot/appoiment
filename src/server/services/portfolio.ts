import "server-only";
import { and, desc, eq, isNull } from "drizzle-orm";
import { z } from "zod";
import { AppError, notFound } from "@/domain/errors";
import { db } from "../db/client";
import { portfolioItems, services, businessMembers } from "../db/schema";
import type { Membership } from "../authz";
import { audit } from "../audit";
import { assertMediaOwned, getMediaMap } from "./media";

export const portfolioSchema = z.object({
  mediaId: z.string().uuid(),
  beforeMediaId: z.string().uuid().nullable().default(null),
  caption: z.string().trim().max(300).nullable().default(null),
  serviceId: z.string().uuid().nullable().default(null),
  memberId: z.string().uuid().nullable().default(null),
  isFeatured: z.boolean().default(false),
});

async function assertRefs(m: Membership, input: z.infer<typeof portfolioSchema>) {
  const main = await assertMediaOwned(input.mediaId, { businessId: m.businessId });
  if (input.beforeMediaId) {
    const before = await assertMediaOwned(input.beforeMediaId, { businessId: m.businessId });
    if (before.kind !== "image" || main.kind !== "image") throw new AppError("validation", "Before/after posts need two photos.");
  }
  if (input.serviceId) {
    const [s] = await db.select({ id: services.id }).from(services).where(and(eq(services.id, input.serviceId), eq(services.businessId, m.businessId)));
    if (!s) throw notFound("That service");
  }
  if (input.memberId) {
    const [mm] = await db.select({ id: businessMembers.id }).from(businessMembers).where(and(eq(businessMembers.id, input.memberId), eq(businessMembers.businessId, m.businessId)));
    if (!mm) throw notFound("That team member");
  }
  return main;
}

export async function addPortfolioItem(m: Membership, actorUserId: string, input: z.infer<typeof portfolioSchema>) {
  const main = await assertRefs(m, input);
  const [item] = await db
    .insert(portfolioItems)
    .values({ businessId: m.businessId, ...input, kind: input.beforeMediaId ? "before_after" : main.kind === "video" ? "video" : "image" })
    .returning();
  await audit({ actorUserId, actorType: "business", businessId: m.businessId, action: "portfolio.added", targetType: "portfolio", targetId: item.id });
  return item;
}

export async function updatePortfolioItem(m: Membership, id: string, input: Pick<z.infer<typeof portfolioSchema>, "caption" | "serviceId" | "memberId" | "isFeatured">) {
  await assertRefs(m, { ...input, mediaId: (await getItem(m, id)).mediaId, beforeMediaId: null });
  await db.update(portfolioItems).set(input).where(eq(portfolioItems.id, id));
}

async function getItem(m: Membership, id: string) {
  const [it] = await db.select().from(portfolioItems).where(and(eq(portfolioItems.id, id), eq(portfolioItems.businessId, m.businessId), isNull(portfolioItems.deletedAt)));
  if (!it) throw notFound("That item");
  return it;
}

export async function removePortfolioItem(m: Membership, actorUserId: string, id: string) {
  await getItem(m, id);
  await db.update(portfolioItems).set({ deletedAt: new Date() }).where(eq(portfolioItems.id, id));
  await audit({ actorUserId, actorType: "business", businessId: m.businessId, action: "portfolio.removed", targetType: "portfolio", targetId: id });
}

export async function listPortfolio(businessId: string) {
  const rows = await db
    .select()
    .from(portfolioItems)
    .where(and(eq(portfolioItems.businessId, businessId), isNull(portfolioItems.deletedAt)))
    .orderBy(desc(portfolioItems.isFeatured), desc(portfolioItems.createdAt))
    .limit(200);
  const media = await getMediaMap(rows.flatMap((r) => [r.mediaId, r.beforeMediaId]));
  const { media: mediaTable } = await import("../db/schema");
  const { inArray } = await import("drizzle-orm");
  const statuses = rows.length ? await db.select({ id: mediaTable.id, status: mediaTable.status }).from(mediaTable).where(inArray(mediaTable.id, rows.map((r) => r.mediaId))) : [];
  return rows.map((r) => ({
    ...r,
    media: media.get(r.mediaId) ?? null,
    before: r.beforeMediaId ? (media.get(r.beforeMediaId) ?? null) : null,
    mediaStatus: statuses.find((s) => s.id === r.mediaId)?.status ?? "processing",
  }));
}
