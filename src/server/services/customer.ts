import "server-only";
import { and, desc, eq, gt, inArray, lte, sql } from "drizzle-orm";
import { UPCOMING_STATUSES } from "@/domain/appointment-state";
import { db } from "../db/client";
import { appointments, businesses, favorites, recentViews, reviews } from "../db/schema";
import { getMediaMap } from "./media";
import { hydrateIds, type SearchResult } from "./search";

const apptSelect = {
  id: appointments.id,
  reference: appointments.reference,
  status: appointments.status,
  startsAt: appointments.startsAt,
  endsAt: appointments.endsAt,
  timezone: appointments.timezone,
  snapshot: appointments.snapshot,
  totalCents: appointments.totalCents,
  amountPaidCents: appointments.amountPaidCents,
  currency: appointments.currency,
  isEstimate: appointments.isEstimate,
  serviceId: appointments.serviceId,
  businessId: businesses.id,
  businessName: businesses.name,
  businessSlug: businesses.slug,
  logoMediaId: businesses.logoMediaId,
  hasReview: sql<boolean>`exists (select 1 from reviews r where r.appointment_id = ${appointments.id})`,
};

export type CustomerAppointment = Awaited<ReturnType<typeof listCustomerAppointments>>[number];

export async function listCustomerAppointments(userId: string, scope: "upcoming" | "past" | "cancelled", limit = 50) {
  const now = new Date();
  const where =
    scope === "upcoming"
      ? and(eq(appointments.customerUserId, userId), inArray(appointments.status, [...UPCOMING_STATUSES]), gt(appointments.endsAt, now))
      : scope === "past"
        ? and(eq(appointments.customerUserId, userId), sql`(${appointments.status} in ('completed','no_show') or (${appointments.status} in ('confirmed','checked_in','in_progress') and ${appointments.endsAt} <= now()))`)
        : and(eq(appointments.customerUserId, userId), inArray(appointments.status, ["cancelled", "declined", "expired"]));
  const rows = await db
    .select(apptSelect)
    .from(appointments)
    .innerJoin(businesses, eq(businesses.id, appointments.businessId))
    .where(where)
    .orderBy(scope === "upcoming" ? appointments.startsAt : desc(appointments.startsAt))
    .limit(limit);
  const media = await getMediaMap(rows.map((r) => r.logoMediaId));
  return rows.map((r) => ({ ...r, startsAt: r.startsAt.toISOString(), endsAt: r.endsAt.toISOString(), logo: r.logoMediaId ? (media.get(r.logoMediaId) ?? null) : null }));
}

/** Distinct businesses the customer completed visits with, most recent first. */
export async function bookAgain(userId: string, limit = 6) {
  const rows = await db.execute<{ business_id: string; service_id: string; service_name: string; starts_at: Date }>(sql`
    select distinct on (a.business_id) a.business_id, a.service_id, a.snapshot->>'serviceName' as service_name, a.starts_at
    from appointments a
    where a.customer_user_id = ${userId} and a.status = 'completed'
    order by a.business_id, a.starts_at desc`);
  const sorted = [...rows].sort((a, b) => new Date(b.starts_at).getTime() - new Date(a.starts_at).getTime()).slice(0, limit);
  if (!sorted.length) return [];
  const biz = await db
    .select({ id: businesses.id, slug: businesses.slug, name: businesses.name, logoMediaId: businesses.logoMediaId, status: businesses.status })
    .from(businesses)
    .where(inArray(businesses.id, sorted.map((r) => r.business_id)));
  const media = await getMediaMap(biz.map((b) => b.logoMediaId));
  return sorted
    .map((r) => {
      const b = biz.find((x) => x.id === r.business_id);
      if (!b || b.status !== "active") return null;
      return { businessId: b.id, slug: b.slug, name: b.name, logo: b.logoMediaId ? (media.get(b.logoMediaId) ?? null) : null, serviceId: r.service_id, serviceName: r.service_name, lastVisit: new Date(r.starts_at).toISOString() };
    })
    .filter((x): x is NonNullable<typeof x> => x != null);
}

export async function favoriteCards(userId: string) {
  const rows = await db.select({ id: favorites.businessId }).from(favorites).where(eq(favorites.userId, userId)).orderBy(desc(favorites.createdAt)).limit(60);
  const cards = await hydrateIds(rows.map((r) => r.id));
  return rows.map((r) => cards.find((c) => c.id === r.id)).filter((x): x is SearchResult => Boolean(x));
}

export async function recentlyViewedCards(userId: string, limit = 8) {
  const rows = await db.select({ id: recentViews.businessId }).from(recentViews).where(eq(recentViews.userId, userId)).orderBy(desc(recentViews.viewedAt)).limit(limit);
  const cards = await hydrateIds(rows.map((r) => r.id));
  return rows.map((r) => cards.find((c) => c.id === r.id)).filter((x): x is SearchResult => Boolean(x));
}

export async function pendingReviews(userId: string) {
  return db
    .select({ id: appointments.id, serviceName: sql<string>`${appointments.snapshot}->>'serviceName'`, businessName: businesses.name, startsAt: appointments.startsAt })
    .from(appointments)
    .innerJoin(businesses, eq(businesses.id, appointments.businessId))
    .leftJoin(reviews, eq(reviews.appointmentId, appointments.id))
    .where(and(eq(appointments.customerUserId, userId), eq(appointments.status, "completed"), sql`${reviews.id} is null`, lte(appointments.startsAt, new Date()), gt(appointments.startsAt, sql`now() - interval '30 days'`)))
    .orderBy(desc(appointments.startsAt))
    .limit(3);
}


/** Everything the customer's appointment page needs, scoped to the viewer. */
export async function customerAppointmentDetail(userId: string, id: string) {
  const [row] = await db
    .select({
      a: appointments,
      businessName: businesses.name,
      businessSlug: businesses.slug,
      logoMediaId: businesses.logoMediaId,
      paymentsEnabled: businesses.paymentsEnabled,
      allowTips: businesses.stripeAccountId,
    })
    .from(appointments)
    .innerJoin(businesses, eq(businesses.id, appointments.businessId))
    .where(and(eq(appointments.id, id), eq(appointments.customerUserId, userId)));
  if (!row) return null;
  const [review] = await db.select({ id: reviews.id, rating: reviews.rating, body: reviews.body }).from(reviews).where(eq(reviews.appointmentId, id));
  const media = await getMediaMap([row.logoMediaId]);
  const loc = row.a.locationId
    ? (await db.execute<{ lat: number | null; lng: number | null; kind: string; instructions: string | null }>(sql`select lat, lng, kind, instructions from locations where id = ${row.a.locationId}`))[0]
    : null;
  return { ...row, review: review ?? null, logo: row.logoMediaId ? (media.get(row.logoMediaId) ?? null) : null, location: loc ?? null };
}
