import "server-only";
import { and, desc, eq, gt, isNull, lt, sql } from "drizzle-orm";
import { z } from "zod";
import { AppError, notFound } from "@/domain/errors";
import { db } from "../db/client";
import { appointments, businessMembers, businesses, favorites, notifications, recentViews, reports, reviews, serviceStaff, services, waitlistEntries } from "../db/schema";
import type { Viewer } from "../auth/session";
import type { Membership } from "../authz";
import { audit } from "../audit";
import { notify } from "../notify";
import { rateLimit } from "../rate-limit";
import { zIsoDate } from "../http";

/* ───────────────────────────── Favorites ─────────────────────────── */

export async function setFavorite(viewer: Viewer, businessId: string, on: boolean) {
  if (on) {
    const [b] = await db.select({ id: businesses.id }).from(businesses).where(and(eq(businesses.id, businessId), eq(businesses.status, "active")));
    if (!b) throw notFound("That business");
    await db.insert(favorites).values({ userId: viewer.id, businessId }).onConflictDoNothing();
  } else {
    await db.delete(favorites).where(and(eq(favorites.userId, viewer.id), eq(favorites.businessId, businessId)));
  }
  return { favorite: on };
}

export async function isFavorite(userId: string, businessId: string) {
  const [f] = await db.select({ b: favorites.businessId }).from(favorites).where(and(eq(favorites.userId, userId), eq(favorites.businessId, businessId)));
  return Boolean(f);
}

export async function favoriteIds(userId: string) {
  return (await db.select({ id: favorites.businessId }).from(favorites).where(eq(favorites.userId, userId))).map((r) => r.id);
}

export async function recordView(userId: string, businessId: string) {
  await db
    .insert(recentViews)
    .values({ userId, businessId })
    .onConflictDoUpdate({ target: [recentViews.userId, recentViews.businessId], set: { viewedAt: new Date() } });
}

/* ────────────────────────────── Reviews ──────────────────────────── */

export const reviewSchema = z.object({
  appointmentId: z.string().uuid(),
  rating: z.number().int().min(1, "Choose a rating").max(5),
  body: z
    .string()
    .trim()
    .max(2000)
    .optional()
    .nullable()
    .transform((v) => v || null),
});

async function recomputeRating(tx: typeof db | Parameters<Parameters<typeof db.transaction>[0]>[0], businessId: string) {
  await tx.execute(sql`
    update businesses set
      rating_avg = (select avg(rating)::float from reviews where business_id = ${businessId} and status = 'published'),
      rating_count = (select count(*) from reviews where business_id = ${businessId} and status = 'published')
    where id = ${businessId}`);
}

/** Verified reviews only: one per completed appointment, by the customer who attended. */
export async function createReview(viewer: Viewer, input: z.infer<typeof reviewSchema>) {
  await rateLimit("review", viewer.id);
  return db.transaction(async (tx) => {
    const [a] = await tx.select().from(appointments).where(and(eq(appointments.id, input.appointmentId), eq(appointments.customerUserId, viewer.id)));
    if (!a) throw notFound("That appointment");
    if (a.status !== "completed") throw new AppError("conflict", "You can review an appointment once it's been completed.");
    if (a.startsAt.getTime() < Date.now() - 90 * 86_400_000) throw new AppError("conflict", "Reviews can be left within 90 days of an appointment.");
    const [created] = await tx
      .insert(reviews)
      .values({ appointmentId: a.id, businessId: a.businessId, memberId: a.memberId, serviceId: a.serviceId, customerUserId: viewer.id, rating: input.rating, body: input.body })
      .onConflictDoNothing()
      .returning();
    if (!created) throw new AppError("conflict", "You've already reviewed this appointment.");
    await recomputeRating(tx, a.businessId);
    const [biz] = await tx.select({ ownerUserId: businesses.ownerUserId }).from(businesses).where(eq(businesses.id, a.businessId));
    await notify(biz.ownerUserId, { topic: "business", type: "review.received", title: `New ${input.rating}★ review`, body: input.body?.slice(0, 120) ?? undefined, href: "/pro/reviews" }, tx);
    return created;
  });
}

export async function respondToReview(m: Membership, actorUserId: string, reviewId: string, body: string) {
  const text = body.trim();
  if (text.length < 2 || text.length > 1500) throw new AppError("validation", "Responses must be between 2 and 1,500 characters.");
  const [r] = await db
    .update(reviews)
    .set({ responseBody: text, respondedAt: new Date(), respondedByUserId: actorUserId })
    .where(and(eq(reviews.id, reviewId), eq(reviews.businessId, m.businessId)))
    .returning();
  if (!r) throw notFound("That review");
  await audit({ actorUserId, actorType: "business", businessId: m.businessId, action: "review.responded", targetType: "review", targetId: reviewId });
  return r;
}

export const reportSchema = z.object({
  targetType: z.enum(["review", "business", "message", "media", "user"]),
  targetId: z.string().uuid(),
  reason: z.enum(["spam", "inappropriate", "harassment", "fake", "scam", "other"]),
  details: z
    .string()
    .trim()
    .max(1000)
    .optional()
    .nullable()
    .transform((v) => v || null),
});

export async function createReport(viewer: Viewer, input: z.infer<typeof reportSchema>) {
  await rateLimit("report", viewer.id);
  await db.insert(reports).values({ reporterUserId: viewer.id, ...input }).onConflictDoNothing();
  return { ok: true };
}

export async function setReviewStatus(actorUserId: string, reviewId: string, status: "published" | "hidden" | "removed", note: string | null) {
  await db.transaction(async (tx) => {
    const [r] = await tx.update(reviews).set({ status }).where(eq(reviews.id, reviewId)).returning();
    if (!r) throw notFound("That review");
    await recomputeRating(tx, r.businessId);
    await audit({ actorUserId, actorType: "admin", businessId: r.businessId, action: `review.${status}`, targetType: "review", targetId: reviewId, metadata: { note } }, tx);
  });
}

/* ─────────────────────────── Notifications ───────────────────────── */

export async function listNotifications(userId: string, before?: Date) {
  return db
    .select()
    .from(notifications)
    .where(and(eq(notifications.userId, userId), before ? lt(notifications.createdAt, before) : sql`true`))
    .orderBy(desc(notifications.createdAt))
    .limit(30);
}

export async function unreadNotificationCount(userId: string) {
  const [r] = await db
    .select({ n: sql<number>`count(*)::int` })
    .from(notifications)
    .where(and(eq(notifications.userId, userId), isNull(notifications.readAt), gt(notifications.createdAt, sql`now() - interval '60 days'`)));
  return r?.n ?? 0;
}

export async function markNotificationsRead(userId: string, ids?: string[]) {
  await db
    .update(notifications)
    .set({ readAt: new Date() })
    .where(and(eq(notifications.userId, userId), isNull(notifications.readAt), ids && ids.length ? sql`${notifications.id} in (${sql.join(ids.map((i) => sql`${i}::uuid`), sql`, `)})` : sql`true`));
}

/* ────────────────────────────── Waitlist ─────────────────────────── */

export const waitlistSchema = z
  .object({
    serviceId: z.string().uuid(),
    memberId: z.string().uuid().nullable().default(null),
    date: zIsoDate,
    earliestMinute: z.number().int().min(0).max(1440).default(0),
    latestMinute: z.number().int().min(0).max(1440).default(1440),
  })
  .refine((v) => v.earliestMinute < v.latestMinute, { message: "Choose a valid time window", path: ["latestMinute"] });

export async function joinWaitlist(viewer: Viewer, input: z.infer<typeof waitlistSchema>) {
  const [svc] = await db
    .select({ businessId: services.businessId, status: services.status })
    .from(services)
    .innerJoin(businesses, eq(businesses.id, services.businessId))
    .where(and(eq(services.id, input.serviceId), eq(businesses.status, "active")));
  if (!svc || svc.status !== "active") throw notFound("That service");
  if (input.memberId) {
    const [staff] = await db
      .select({ id: serviceStaff.memberId })
      .from(serviceStaff)
      .innerJoin(businessMembers, eq(businessMembers.id, serviceStaff.memberId))
      .where(and(eq(serviceStaff.serviceId, input.serviceId), eq(serviceStaff.memberId, input.memberId), eq(businessMembers.status, "active")));
    if (!staff) throw notFound("That professional");
  }
  const [{ n }] = await db
    .select({ n: sql<number>`count(*)::int` })
    .from(waitlistEntries)
    .where(and(eq(waitlistEntries.customerUserId, viewer.id), eq(waitlistEntries.status, "active")));
  if (n >= 10) throw new AppError("forbidden", "You're on 10 waitlists already. Leave one to join another.");
  const [entry] = await db
    .insert(waitlistEntries)
    .values({ businessId: svc.businessId, customerUserId: viewer.id, ...input })
    .onConflictDoUpdate({
      target: [waitlistEntries.customerUserId, waitlistEntries.serviceId, waitlistEntries.date],
      targetWhere: sql`${waitlistEntries.status} in ('active','notified')`,
      set: { earliestMinute: input.earliestMinute, latestMinute: input.latestMinute, memberId: input.memberId, status: "active" },
    })
    .returning();
  return entry;
}

export async function leaveWaitlist(viewer: Viewer, entryId: string) {
  await db
    .update(waitlistEntries)
    .set({ status: "cancelled" })
    .where(and(eq(waitlistEntries.id, entryId), eq(waitlistEntries.customerUserId, viewer.id)));
}
