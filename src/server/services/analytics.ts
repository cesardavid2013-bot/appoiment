import "server-only";
import { sql } from "drizzle-orm";
import { forbidden } from "@/domain/errors";
import { db } from "../db/client";
import { appointmentScope, type Membership } from "../authz";

/**
 * Business analytics computed with SQL aggregates (never by loading
 * appointment history into memory). All buckets use the business time zone.
 */
export async function businessAnalytics(m: Membership, days: number) {
  if (!m.permissions.has("analytics.view")) throw forbidden();
  const scope = appointmentScope(m);
  const memberFilter = scope.all ? sql`true` : sql`a.member_id = ${scope.memberId}`;
  const tz = m.timezone;
  const since = sql`now() - make_interval(days => ${days})`;
  const prevSince = sql`now() - make_interval(days => ${days * 2})`;

  const [summary] = await db.execute<{
    bookings: number;
    completed: number;
    cancelled: number;
    no_show: number;
    revenue: number;
    avg_value: number;
    new_customers: number;
    returning_customers: number;
    prev_bookings: number;
    prev_revenue: number;
    avg_lead_hours: number | null;
    online_share: number;
  }>(sql`
    with cur as (
      select a.* from appointments a
      where a.business_id = ${m.businessId} and ${memberFilter} and a.starts_at >= ${since} and a.starts_at < now() + interval '1 day'
        and a.status not in ('expired','pending_payment')
    ), prev as (
      select a.* from appointments a
      where a.business_id = ${m.businessId} and ${memberFilter} and a.starts_at >= ${prevSince} and a.starts_at < ${since}
        and a.status not in ('expired','pending_payment')
    )
    select
      (select count(*) from cur)::int as bookings,
      (select count(*) from cur where status = 'completed')::int as completed,
      (select count(*) from cur where status in ('cancelled','declined'))::int as cancelled,
      (select count(*) from cur where status = 'no_show')::int as no_show,
      (select coalesce(sum(total_cents),0) from cur where status = 'completed')::int as revenue,
      (select coalesce(avg(total_cents),0) from cur where status = 'completed')::int as avg_value,
      (select count(distinct business_customer_id) from cur c where not exists (select 1 from appointments p where p.business_customer_id = c.business_customer_id and p.starts_at < c.starts_at and p.status = 'completed'))::int as new_customers,
      (select count(distinct business_customer_id) from cur c where exists (select 1 from appointments p where p.business_customer_id = c.business_customer_id and p.starts_at < c.starts_at and p.status = 'completed'))::int as returning_customers,
      (select count(*) from prev)::int as prev_bookings,
      (select coalesce(sum(total_cents),0) from prev where status = 'completed')::int as prev_revenue,
      (select avg(extract(epoch from (starts_at - created_at)) / 3600) from cur where source in ('marketplace','direct_link'))::float as avg_lead_hours,
      (select coalesce(avg(case when source in ('marketplace','direct_link') then 1.0 else 0 end),0) from cur)::float as online_share
  `);

  const series = await db.execute<{ day: string; bookings: number; revenue: number }>(sql`
    with d as (select generate_series((now() at time zone ${tz})::date - (${days} - 1), (now() at time zone ${tz})::date, interval '1 day')::date as day)
    select to_char(d.day, 'YYYY-MM-DD') as day,
      count(a.id) filter (where a.status not in ('expired','pending_payment','cancelled','declined'))::int as bookings,
      coalesce(sum(a.total_cents) filter (where a.status = 'completed'), 0)::int as revenue
    from d left join appointments a
      on (a.starts_at at time zone ${tz})::date = d.day and a.business_id = ${m.businessId} and ${memberFilter}
    group by d.day order by d.day`);

  const byService = await db.execute<{ name: string; bookings: number; revenue: number }>(sql`
    select a.snapshot->>'serviceName' as name, count(*)::int as bookings, coalesce(sum(a.total_cents) filter (where a.status = 'completed'),0)::int as revenue
    from appointments a
    where a.business_id = ${m.businessId} and ${memberFilter} and a.starts_at >= ${since} and a.status not in ('expired','pending_payment','cancelled','declined')
    group by 1 order by bookings desc limit 8`);

  const byStaff = scope.all
    ? await db.execute<{ name: string; bookings: number; revenue: number; minutes: number }>(sql`
        select m.display_name as name, count(a.id)::int as bookings,
          coalesce(sum(a.total_cents) filter (where a.status = 'completed'),0)::int as revenue,
          coalesce(sum(extract(epoch from (a.ends_at - a.starts_at)) / 60) filter (where a.status in ('completed','confirmed','checked_in','in_progress')),0)::int as minutes
        from business_members m
        left join appointments a on a.member_id = m.id and a.starts_at >= ${since} and a.status not in ('expired','pending_payment','cancelled','declined')
        where m.business_id = ${m.businessId} and m.status = 'active' and m.is_bookable
        group by m.id, m.display_name order by bookings desc`)
    : [];

  const heat = await db.execute<{ dow: number; hour: number; n: number }>(sql`
    select extract(isodow from a.starts_at at time zone ${tz})::int as dow, extract(hour from a.starts_at at time zone ${tz})::int as hour, count(*)::int as n
    from appointments a
    where a.business_id = ${m.businessId} and ${memberFilter} and a.starts_at >= now() - interval '90 days' and a.status not in ('expired','pending_payment','cancelled','declined')
    group by 1, 2`);

  const s = summary;
  const decided = s.completed + s.no_show + s.cancelled;
  return {
    days,
    summary: {
      ...s,
      cancellationRate: s.bookings ? s.cancelled / s.bookings : 0,
      noShowRate: s.completed + s.no_show ? s.no_show / (s.completed + s.no_show) : 0,
      repeatRate: s.new_customers + s.returning_customers ? s.returning_customers / (s.new_customers + s.returning_customers) : 0,
      decided,
    },
    series: [...series],
    byService: [...byService],
    byStaff: [...byStaff],
    heat: [...heat],
  };
}
