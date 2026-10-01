import "server-only";
import { and, asc, eq, sql } from "drizzle-orm";
import { z } from "zod";
import { AppError, forbidden, notFound } from "@/domain/errors";
import { embedShape, isValidEmbed, MAX_EMBEDS, parseEmbedUrl, type EmbedKind, type EmbedProvider } from "@/domain/social";
import { db } from "../db/client";
import { isUniqueViolation } from "../db/errors";
import { services, socialEmbeds } from "../db/schema";
import type { Membership } from "../authz";
import { audit } from "../audit";

const zCaption = z
  .string()
  .trim()
  .max(200, "Keep captions under 200 characters")
  .nullable()
  .optional()
  .transform((v) => (v ? v : null));

export const socialEmbedSchema = z.object({
  url: z.string().trim().min(1, "Paste a link").max(500, "That link is too long."),
  caption: zCaption,
  serviceId: z.string().uuid().nullable().optional(),
});

export const socialEmbedUpdateSchema = z.object({
  caption: zCaption,
  serviceId: z.string().uuid().nullable().optional(),
});

function check(m: Membership) {
  if (!m.permissions.has("portfolio.manage")) throw forbidden();
}

async function assertService(m: Membership, serviceId: string | null | undefined) {
  if (!serviceId) return;
  const [s] = await db.select({ id: services.id }).from(services).where(and(eq(services.id, serviceId), eq(services.businessId, m.businessId), sql`${services.status} <> 'archived'`));
  if (!s) throw notFound("That service");
}

export async function addSocialEmbed(m: Membership, actorUserId: string, input: z.infer<typeof socialEmbedSchema>) {
  check(m);
  const parsed = parseEmbedUrl(input.url);
  if (!parsed.ok) throw new AppError("validation", parsed.error, { fields: { url: parsed.error } });
  await assertService(m, input.serviceId);
  const e = parsed.embed;
  try {
    const row = await db.transaction(async (tx) => {
      // Serialize adds per business so the cap holds under concurrent requests.
      await tx.execute(sql`select pg_advisory_xact_lock(hashtextextended(${`social_embeds:${m.businessId}`}, 0))`);
      const [{ n, min }] = await tx
        .select({ n: sql<number>`count(*)::int`, min: sql<number>`coalesce(min(${socialEmbeds.sortOrder}), 0)::int` })
        .from(socialEmbeds)
        .where(eq(socialEmbeds.businessId, m.businessId));
      if (n >= MAX_EMBEDS) throw new AppError("validation", `You can feature up to ${MAX_EMBEDS} posts. Remove one to add another.`, { fields: { url: `Up to ${MAX_EMBEDS} posts.` } });
      const [created] = await tx
        .insert(socialEmbeds)
        .values({ businessId: m.businessId, provider: e.provider, kind: e.kind, providerId: e.providerId, url: e.url, caption: input.caption ?? null, serviceId: input.serviceId ?? null, sortOrder: min - 1 })
        .returning();
      return created;
    });
    await audit({ actorUserId, actorType: "business", businessId: m.businessId, action: "social_embed.added", targetType: "social_embed", targetId: row.id, metadata: { provider: e.provider } });
    return row;
  } catch (err) {
    if (isUniqueViolation(err)) throw new AppError("conflict", "That post is already on your profile.", { fields: { url: "Already added." } });
    throw err;
  }
}

async function getEmbed(m: Membership, id: string) {
  const [row] = await db.select().from(socialEmbeds).where(and(eq(socialEmbeds.id, id), eq(socialEmbeds.businessId, m.businessId)));
  if (!row) throw notFound("That post");
  return row;
}

export async function updateSocialEmbed(m: Membership, actorUserId: string, id: string, input: z.infer<typeof socialEmbedUpdateSchema>) {
  check(m);
  await getEmbed(m, id);
  await assertService(m, input.serviceId);
  const set: Partial<typeof socialEmbeds.$inferInsert> = {};
  if (input.caption !== undefined) set.caption = input.caption;
  if (input.serviceId !== undefined) set.serviceId = input.serviceId;
  if (!Object.keys(set).length) return;
  await db.update(socialEmbeds).set(set).where(and(eq(socialEmbeds.id, id), eq(socialEmbeds.businessId, m.businessId)));
  await audit({ actorUserId, actorType: "business", businessId: m.businessId, action: "social_embed.updated", targetType: "social_embed", targetId: id });
}

export async function removeSocialEmbed(m: Membership, actorUserId: string, id: string) {
  check(m);
  await getEmbed(m, id);
  await db.delete(socialEmbeds).where(and(eq(socialEmbeds.id, id), eq(socialEmbeds.businessId, m.businessId)));
  await audit({ actorUserId, actorType: "business", businessId: m.businessId, action: "social_embed.removed", targetType: "social_embed", targetId: id });
}

/** Persists a full manual order. Ids must be exactly the business's current posts. */
export async function reorderSocialEmbeds(m: Membership, ids: string[]) {
  check(m);
  const current = await db.select({ id: socialEmbeds.id }).from(socialEmbeds).where(eq(socialEmbeds.businessId, m.businessId));
  const known = new Set(current.map((r) => r.id));
  if (ids.length !== known.size || new Set(ids).size !== ids.length || ids.some((i) => !known.has(i))) {
    throw new AppError("conflict", "Your posts changed in another tab. Refresh and try again.");
  }
  await db.transaction(async (tx) => {
    for (const [i, id] of ids.entries()) await tx.update(socialEmbeds).set({ sortOrder: i }).where(and(eq(socialEmbeds.id, id), eq(socialEmbeds.businessId, m.businessId)));
  });
}

export type SocialEmbedItem = {
  id: string;
  provider: EmbedProvider;
  kind: EmbedKind;
  providerId: string;
  url: string;
  caption: string | null;
  serviceId: string | null;
  serviceName: string | null;
  /** Customers only see "Book this" for services that are live. */
  serviceBookable: boolean;
  shape: ReturnType<typeof embedShape>;
};

/** A business's featured posts in display order. Rows that no longer validate are skipped, never rendered. */
export async function listSocialEmbeds(businessId: string): Promise<SocialEmbedItem[]> {
  const rows = await db
    .select({ e: socialEmbeds, serviceName: services.name, serviceStatus: services.status })
    .from(socialEmbeds)
    .leftJoin(services, eq(services.id, socialEmbeds.serviceId))
    .where(eq(socialEmbeds.businessId, businessId))
    .orderBy(asc(socialEmbeds.sortOrder), asc(socialEmbeds.createdAt))
    .limit(MAX_EMBEDS);
  return rows
    .filter(({ e }) => isValidEmbed(e.provider, e.kind, e.providerId))
    .map(({ e, serviceName, serviceStatus }) => ({
      id: e.id,
      provider: e.provider as EmbedProvider,
      kind: e.kind as EmbedKind,
      providerId: e.providerId,
      url: e.url,
      caption: e.caption,
      serviceId: e.serviceId,
      serviceName,
      serviceBookable: serviceStatus === "active",
      shape: embedShape(e.provider, e.kind),
    }));
}
