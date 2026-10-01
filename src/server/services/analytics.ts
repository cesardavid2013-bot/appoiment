import "server-only";
import { DateTime } from "luxon";
import { sql, type SQL } from "drizzle-orm";
import { forbidden } from "@/domain/errors";
import { addDaysIso, todayIn } from "@/domain/time";
import { db } from "../db/client";
import { appointmentScope, type Membership } from "../authz";

export const ANALYTICS_RANGES = [7, 30, 90] as const;
export type AnalyticsRange = (typeof ANALYTICS_RANGES)[number];

/** Statuses that represent a real booking (not an abandoned hold or lapsed request). */
const BOOKED = sql`('requested','confirmed','checked_in','in_progress','completed','no_show')`;
/** Booked appointments that should have been closed out once their end time passes. */
const DUE = sql`('confirmed','checked_in','in_progress','completed','no_show')`;

/** Timestamps are bound as ISO strings so the driver never guesses a type. */
const at = (d: Date) => sql`${d.toISOString()}::timestamptz`;

function localMidnight(isoDate: string, tz: string): Date {
  // startOf('day') copes with zones where midnight itself is skipped by DST.
  return DateTime.fromISO(isoDate, { zone: tz }).startOf("day").toJSDate();
}

/**
 * Whole local days in the business time zone: the last `days` days including
 * today, and the same number of days immediately before for comparison.
 */
export function analyticsWindow(tz: string, days: number, now: Date) {
  const lastDay = todayIn(tz, now);
  const firstDay = addDaysIso(lastDay, -(days - 1));
  const prevFirstDay = addDaysIso(firstDay, -days);
  return {
    firstDay,
    lastDay,
    prevFirstDay,
    start: localMidnight(firstDay, tz),
    end: localMidnight(addDaysIso(lastDay, 1), tz),
    prevStart: localMidnight(prevFirstDay, tz),
  };
}

type PeriodRow = {
  bookings: number;
  completed: number;
  no_shows: number;
  cancelled: number;
  due: number;
  earned: number;
  avg_ticket: number | null;
  clients: number;
  returning_clients: number;
  online: number;
};

async function periodStats(businessId: string, memberFilter: SQL, start: Date, end: Date, asOf: Date) {
  const [row] = await db.execute<PeriodRow>(sql`
    with a as (
      select a.status, a.ends_at, a.source, a.subtotal_cents - a.discount_cents as net_cents, a.business_customer_id,
        exists (select 1 from appointments p where p.business_customer_id = a.business_customer_id and p.status = 'completed' and p.starts_at < ${at(start)}) as had_prior
      from appointments a
      where a.business_id = ${businessId} and ${memberFilter} and a.starts_at >= ${at(start)} and a.starts_at < ${at(end)}
    )
    select
      count(*) filter (where status in ${BOOKED})::int as bookings,
      count(*) filter (where status = 'completed')::int as completed,
      count(*) filter (where status = 'no_show')::int as no_shows,
      count(*) filter (where status in ('cancelled','declined'))::int as cancelled,
      count(*) filter (where status in ${DUE} and ends_at <= ${at(asOf)})::int as due,
      coalesce(sum(net_cents) filter (where status = 'completed'), 0)::int as earned,
      round(avg(net_cents) filter (where status = 'completed'))::int as avg_ticket,
      count(distinct business_customer_id) filter (where status in ${BOOKED})::int as clients,
      count(distinct business_customer_id) filter (where status in ${BOOKED} and had_prior)::int as returning_clients,
      count(*) filter (where status in ${BOOKED} and source in ('marketplace','direct_link'))::int as online
    from a`);

  const [money] = await db.execute<{ paid: number; refunded: number }>(sql`
    select
      (select coalesce(sum(p.amount_cents), 0) from payments p join appointments a on a.id = p.appointment_id
        where p.business_id = ${businessId} and ${memberFilter} and p.status = 'succeeded'
          and coalesce(p.succeeded_at, p.created_at) >= ${at(start)} and coalesce(p.succeeded_at, p.created_at) < ${at(end)})::int as paid,
      (select coalesce(sum(r.amount_cents), 0) from refunds r join appointments a on a.id = r.appointment_id
        where a.business_id = ${businessId} and ${memberFilter} and r.status = 'succeeded'
          and r.created_at >= ${at(start)} and r.created_at < ${at(end)})::int as refunded`);

  const s = row;
  const newClients = s.clients - s.returning_clients;
  return {
    bookings: s.bookings,
    completed: s.completed,
    noShows: s.no_shows,
    cancelled: s.cancelled,
    /** Booked appointments whose end time has passed (the denominator for rates). */
    due: s.due,
    /** Past appointments still waiting to be marked completed or no-show. */
    unresolved: Math.max(0, s.due - s.completed - s.no_shows),
    completionRate: s.due ? s.completed / s.due : null,
    noShowRate: s.due ? s.no_shows / s.due : null,
    /** Value of completed appointments after discounts, before tax and fees. */
    earnedCents: s.earned,
    avgTicketCents: s.avg_ticket,
    /** Payments received (online + recorded in person) minus refunds. */
    collectedCents: money.paid - money.refunded,
    clients: s.clients,
    newClients,
    returningClients: s.returning_clients,
    onlineBookings: s.online,
  };
}

export type PeriodStats = Awaited<ReturnType<typeof periodStats>>;

/**
 * Business analytics computed with SQL aggregates (never by loading
 * appointment history into memory). Periods are whole days in the business
 * time zone; appointments count toward the day they take place on.
 */
export async function businessAnalytics(m: Membership, days: number, now: Date = new Date()) {
  if (!m.permissions.has("analytics.view")) throw forbidden();
  const scope = appointmentScope(m);
  const memberFilter = scope.all ? sql`true` : sql`a.member_id = ${scope.memberId}`;
  const tz = m.timezone;
  const w = analyticsWindow(tz, days, now);
  const asOf = now < w.end ? now : w.end;

  const [current, previous] = await Promise.all([
    periodStats(m.businessId, memberFilter, w.start, w.end, asOf),
    periodStats(m.businessId, memberFilter, w.prevStart, w.start, w.start),
  ]);

  const [series, byService, heat, staff] = await Promise.all([
    db.execute<{ day: string; bookings: number; collected: number }>(sql`
      with d as (select generate_series(${w.firstDay}::date, ${w.lastDay}::date, interval '1 day')::date as day),
      b as (
        select (a.starts_at at time zone ${tz})::date as day, count(*)::int as n
        from appointments a
        where a.business_id = ${m.businessId} and ${memberFilter} and a.starts_at >= ${at(w.start)} and a.starts_at < ${at(w.end)} and a.status in ${BOOKED}
        group by 1
      ),
      p as (
        select (coalesce(p.succeeded_at, p.created_at) at time zone ${tz})::date as day, sum(p.amount_cents)::int as cents
        from payments p join appointments a on a.id = p.appointment_id
        where p.business_id = ${m.businessId} and ${memberFilter} and p.status = 'succeeded'
          and coalesce(p.succeeded_at, p.created_at) >= ${at(w.start)} and coalesce(p.succeeded_at, p.created_at) < ${at(w.end)}
        group by 1
      ),
      r as (
        select (r.created_at at time zone ${tz})::date as day, sum(r.amount_cents)::int as cents
        from refunds r join appointments a on a.id = r.appointment_id
        where a.business_id = ${m.businessId} and ${memberFilter} and r.status = 'succeeded' and r.created_at >= ${at(w.start)} and r.created_at < ${at(w.end)}
        group by 1
      )
      select to_char(d.day, 'YYYY-MM-DD') as day, coalesce(b.n, 0)::int as bookings, (coalesce(p.cents, 0) - coalesce(r.cents, 0))::int as collected
      from d left join b on b.day = d.day left join p on p.day = d.day left join r on r.day = d.day
      order by d.day`),

    db.execute<{ name: string; bookings: number; completed: number; earned: number }>(sql`
      select coalesce(s.name, max(a.snapshot->>'serviceName')) as name,
        count(*)::int as bookings,
        count(*) filter (where a.status = 'completed')::int as completed,
        coalesce(sum(a.subtotal_cents - a.discount_cents) filter (where a.status = 'completed'), 0)::int as earned
      from appointments a left join services s on s.id = a.service_id
      where a.business_id = ${m.businessId} and ${memberFilter} and a.starts_at >= ${at(w.start)} and a.starts_at < ${at(w.end)} and a.status in ${BOOKED}
      group by a.service_id, s.name
      order by bookings desc, earned desc
      limit 8`),

    db.execute<{ dow: number; hour: number; n: number }>(sql`
      select extract(isodow from a.starts_at at time zone ${tz})::int as dow, extract(hour from a.starts_at at time zone ${tz})::int as hour, count(*)::int as n
      from appointments a
      where a.business_id = ${m.businessId} and ${memberFilter} and a.starts_at >= ${at(w.start)} and a.starts_at < ${at(w.end)} and a.status in ${BOOKED}
      group by 1, 2`),

    scope.all
      ? db.execute<{ id: string; name: string; bookings: number; completed: number; no_shows: number; due: number; earned: number; minutes: number }>(sql`
          with agg as (
            select a.member_id,
              count(*) filter (where a.status in ${BOOKED})::int as bookings,
              count(*) filter (where a.status = 'completed')::int as completed,
              count(*) filter (where a.status = 'no_show')::int as no_shows,
              count(*) filter (where a.status in ${DUE} and a.ends_at <= ${at(asOf)})::int as due,
              coalesce(sum(a.subtotal_cents - a.discount_cents) filter (where a.status = 'completed'), 0)::int as earned,
              coalesce(sum(extract(epoch from (a.ends_at - a.starts_at)) / 60) filter (where a.status in ${BOOKED} and a.status <> 'no_show'), 0)::int as minutes
            from appointments a
            where a.business_id = ${m.businessId} and a.starts_at >= ${at(w.start)} and a.starts_at < ${at(w.end)} and a.member_id is not null
            group by a.member_id
          )
          select bm.id, bm.display_name as name, coalesce(agg.bookings, 0)::int as bookings, coalesce(agg.completed, 0)::int as completed,
            coalesce(agg.no_shows, 0)::int as no_shows, coalesce(agg.due, 0)::int as due, coalesce(agg.earned, 0)::int as earned, coalesce(agg.minutes, 0)::int as minutes
          from business_members bm left join agg on agg.member_id = bm.id
          where bm.business_id = ${m.businessId} and ((bm.status = 'active' and bm.is_bookable) or agg.bookings > 0)
          order by bookings desc, bm.sort_order, bm.display_name`)
      : Promise.resolve([]),
  ]);

  return {
    days,
    window: { firstDay: w.firstDay, lastDay: w.lastDay, prevFirstDay: w.prevFirstDay },
    current,
    previous,
    series: [...series],
    byService: [...byService],
    byStaff: [...staff].map((s) => ({ id: s.id, name: s.name, bookings: s.bookings, completed: s.completed, noShows: s.no_shows, due: s.due, earnedCents: s.earned, bookedMinutes: s.minutes })),
    heat: [...heat],
    scopedToSelf: !scope.all,
  };
}

export type BusinessAnalytics = Awaited<ReturnType<typeof businessAnalytics>>;
