import "server-only";
import { and, desc, eq, isNull, lt, sql } from "drizzle-orm";
import { forbidden } from "@/domain/errors";
import { db } from "../db/client";
import { appointments, businessMembers, reports, reviews, services, users } from "../db/schema";
import type { Membership } from "../authz";

export type ReviewFilter = { needsReply?: boolean; rating?: number | null; before?: Date | null };

export const REVIEWS_PAGE_SIZE = 25;

function check(m: Membership) {
  if (!m.permissions.has("reviews.respond")) throw forbidden();
}

/** Rating summary from published reviews only — the same set customers see. */
export async function reviewSummary(m: Membership) {
  check(m);
  const rows = await db
    .select({
      rating: reviews.rating,
      n: sql<number>`count(*)::int`,
      unanswered: sql<number>`count(*) filter (where ${reviews.responseBody} is null)::int`,
    })
    .from(reviews)
    .where(and(eq(reviews.businessId, m.businessId), eq(reviews.status, "published")))
    .groupBy(reviews.rating);
  const count = rows.reduce((s, r) => s + r.n, 0);
  const sum = rows.reduce((s, r) => s + r.n * r.rating, 0);
  const needsReply = rows.reduce((s, r) => s + r.unanswered, 0);
  return {
    count,
    average: count ? sum / count : null,
    distribution: [5, 4, 3, 2, 1].map((rating) => ({ rating, count: rows.find((r) => r.rating === rating)?.n ?? 0 })),
    needsReply,
    replied: count - needsReply,
  };
}

/** Newest first. Authors are shown as on the public profile (first name + initial). */
export async function listBusinessReviews(m: Membership, viewerId: string, f: ReviewFilter = {}) {
  check(m);
  const rows = await db
    .select({
      id: reviews.id,
      rating: reviews.rating,
      body: reviews.body,
      responseBody: reviews.responseBody,
      respondedAt: reviews.respondedAt,
      createdAt: reviews.createdAt,
      appointmentId: reviews.appointmentId,
      appointmentStartsAt: appointments.startsAt,
      serviceName: sql<string | null>`coalesce(${services.name}, ${appointments.snapshot}->>'serviceName')`,
      memberName: businessMembers.displayName,
      authorName: users.name,
      responderName: sql<string | null>`(select u.name from users u where u.id = reviews.responded_by_user_id)`,
      reportedByMe: sql<boolean>`exists (select 1 from ${reports} rp where rp.target_type = 'review' and rp.target_id = reviews.id and rp.reporter_user_id = ${viewerId})`,
    })
    .from(reviews)
    .innerJoin(users, eq(users.id, reviews.customerUserId))
    .innerJoin(appointments, eq(appointments.id, reviews.appointmentId))
    .leftJoin(services, eq(services.id, reviews.serviceId))
    .leftJoin(businessMembers, eq(businessMembers.id, reviews.memberId))
    .where(
      and(
        eq(reviews.businessId, m.businessId),
        eq(reviews.status, "published"),
        f.needsReply ? isNull(reviews.responseBody) : undefined,
        f.rating ? eq(reviews.rating, f.rating) : undefined,
        f.before ? lt(reviews.createdAt, f.before) : undefined,
      ),
    )
    .orderBy(desc(reviews.createdAt))
    .limit(REVIEWS_PAGE_SIZE + 1);
  const hasMore = rows.length > REVIEWS_PAGE_SIZE;
  const page = rows.slice(0, REVIEWS_PAGE_SIZE).map((r) => {
    const parts = r.authorName.trim().split(/\s+/);
    return {
      ...r,
      authorName: parts.length > 1 ? `${parts[0]} ${parts[parts.length - 1][0]}.` : parts[0],
      createdAt: r.createdAt.toISOString(),
      respondedAt: r.respondedAt?.toISOString() ?? null,
      appointmentStartsAt: r.appointmentStartsAt.toISOString(),
    };
  });
  return { reviews: page, nextBefore: hasMore ? page.at(-1)!.createdAt : null };
}

export type BusinessReview = Awaited<ReturnType<typeof listBusinessReviews>>["reviews"][number];
