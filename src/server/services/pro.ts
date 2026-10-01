import "server-only";
import { and, asc, desc, eq, gte, ilike, inArray, isNull, lt, or, sql } from "drizzle-orm";
import { z } from "zod";
import { AppError, forbidden, notFound } from "@/domain/errors";
import { db } from "../db/client";
import {
  appointmentEvents,
  appointments,
  businessCustomers,
  businessMembers,
  customerNotes,
  locations,
  payments,
  services,
  timeBlocks,
  users,
} from "../db/schema";
import { appointmentScope, type Membership } from "../authz";
import { audit } from "../audit";

const calendarSelect = {
  id: appointments.id,
  reference: appointments.reference,
  status: appointments.status,
  startsAt: appointments.startsAt,
  endsAt: appointments.endsAt,
  blockStartsAt: appointments.blockStartsAt,
  blockEndsAt: appointments.blockEndsAt,
  memberId: appointments.memberId,
  serviceId: appointments.serviceId,
  serviceName: sql<string>`${appointments.snapshot}->>'serviceName'`,
  options: sql<{ name: string }[]>`${appointments.snapshot}->'options'`,
  customerName: businessCustomers.name,
  customerId: businessCustomers.id,
  isNewCustomer: sql<boolean>`${businessCustomers.completedCount} = 0`,
  totalCents: appointments.totalCents,
  amountPaidCents: appointments.amountPaidCents,
  currency: appointments.currency,
  source: appointments.source,
  hasNote: sql<boolean>`${appointments.customerNote} is not null`,
  locationKind: sql<string | null>`${appointments.snapshot}->>'locationKind'`,
  version: appointments.version,
};

export type CalendarAppointment = Awaited<ReturnType<typeof calendarRange>>["appointments"][number];

/**
 * Appointments + blocks in [from, to) for the calendar. Staff without
 * "view all" only ever receive their own appointments.
 */
export async function calendarRange(m: Membership, from: Date, to: Date, memberFilter?: string[]) {
  if (to.getTime() - from.getTime() > 45 * 86_400_000) throw new AppError("validation", "Choose a shorter range.");
  const scope = appointmentScope(m);
  const memberIds = scope.all ? memberFilter : [scope.memberId];
  const [appts, blocks, team] = await Promise.all([
    db
      .select(calendarSelect)
      .from(appointments)
      .innerJoin(businessCustomers, eq(businessCustomers.id, appointments.businessCustomerId))
      .where(
        and(
          eq(appointments.businessId, m.businessId),
          lt(appointments.startsAt, to),
          gte(appointments.endsAt, from),
          inArray(appointments.status, ["pending_payment", "requested", "confirmed", "checked_in", "in_progress", "completed", "no_show"]),
          memberIds && memberIds.length ? inArray(appointments.memberId, memberIds) : sql`true`,
        ),
      )
      .orderBy(asc(appointments.startsAt))
      .limit(2000),
    db
      .select()
      .from(timeBlocks)
      .where(
        and(
          eq(timeBlocks.businessId, m.businessId),
          lt(timeBlocks.startsAt, to),
          gte(timeBlocks.endsAt, from),
          memberIds && memberIds.length ? or(inArray(timeBlocks.memberId, memberIds), isNull(timeBlocks.memberId)) : sql`true`,
        ),
      )
      .limit(500),
    listTeam(m.businessId),
  ]);
  return {
    appointments: appts.map((a) => ({ ...a, startsAt: a.startsAt.toISOString(), endsAt: a.endsAt.toISOString(), blockStartsAt: a.blockStartsAt.toISOString(), blockEndsAt: a.blockEndsAt.toISOString() })),
    blocks: blocks.map((b) => ({ id: b.id, memberId: b.memberId, startsAt: b.startsAt.toISOString(), endsAt: b.endsAt.toISOString(), reason: b.reason, note: b.note })),
    team: scope.all ? team : team.filter((t) => t.id === m.memberId),
  };
}

export async function listTeam(businessId: string) {
  return db
    .select({
      id: businessMembers.id,
      name: businessMembers.displayName,
      title: businessMembers.title,
      color: businessMembers.color,
      isBookable: businessMembers.isBookable,
      status: businessMembers.status,
      role: businessMembers.role,
      userId: businessMembers.userId,
      avatarMediaId: businessMembers.avatarMediaId,
    })
    .from(businessMembers)
    .where(and(eq(businessMembers.businessId, businessId), eq(businessMembers.status, "active")))
    .orderBy(asc(businessMembers.sortOrder), asc(businessMembers.displayName));
}

/** Today's dashboard: what needs attention now, from real data only. */
export async function todayOverview(m: Membership, dayStart: Date, dayEnd: Date) {
  const scope = appointmentScope(m);
  const mine = scope.all ? sql`true` : eq(appointments.memberId, scope.memberId);
  const [today, requests, weekStats, unpaid] = await Promise.all([
    calendarRange(m, dayStart, dayEnd),
    db
      .select(calendarSelect)
      .from(appointments)
      .innerJoin(businessCustomers, eq(businessCustomers.id, appointments.businessCustomerId))
      .where(and(eq(appointments.businessId, m.businessId), eq(appointments.status, "requested"), mine))
      .orderBy(asc(appointments.startsAt))
      .limit(20),
    db
      .select({
        upcoming: sql<number>`count(*) filter (where ${appointments.startsAt} >= now() and ${appointments.status} in ('confirmed','requested','pending_payment'))::int`,
        completed30: sql<number>`count(*) filter (where ${appointments.status} = 'completed' and ${appointments.startsAt} >= now() - interval '30 days')::int`,
        revenue30: sql<number>`coalesce(sum(${appointments.totalCents}) filter (where ${appointments.status} = 'completed' and ${appointments.startsAt} >= now() - interval '30 days'), 0)::int`,
        noShow30: sql<number>`count(*) filter (where ${appointments.status} = 'no_show' and ${appointments.startsAt} >= now() - interval '30 days')::int`,
      })
      .from(appointments)
      .where(and(eq(appointments.businessId, m.businessId), mine)),
    db
      .select({ n: sql<number>`count(*)::int` })
      .from(appointments)
      .where(and(eq(appointments.businessId, m.businessId), eq(appointments.status, "completed"), sql`${appointments.amountPaidCents} < ${appointments.totalCents}`, gte(appointments.startsAt, sql`now() - interval '14 days'`), mine)),
  ]);
  return {
    ...today,
    requests: requests.map((a) => ({ ...a, startsAt: a.startsAt.toISOString(), endsAt: a.endsAt.toISOString(), blockStartsAt: a.blockStartsAt.toISOString(), blockEndsAt: a.blockEndsAt.toISOString() })),
    stats: weekStats[0],
    unpaidCompleted: unpaid[0]?.n ?? 0,
  };
}

/** Full appointment for the business side, with visibility rules applied. */
export async function proAppointmentDetail(m: Membership, id: string) {
  const [row] = await db
    .select({ a: appointments, customer: businessCustomers })
    .from(appointments)
    .innerJoin(businessCustomers, eq(businessCustomers.id, appointments.businessCustomerId))
    .where(and(eq(appointments.id, id), eq(appointments.businessId, m.businessId)));
  if (!row) throw notFound("That appointment");
  const scope = appointmentScope(m);
  if (!scope.all && row.a.memberId !== scope.memberId) throw notFound("That appointment");
  const [events, pays, member, location, notes] = await Promise.all([
    db
      .select({ id: appointmentEvents.id, type: appointmentEvents.type, toStatus: appointmentEvents.toStatus, fromStatus: appointmentEvents.fromStatus, actorType: appointmentEvents.actorType, actorName: users.name, data: appointmentEvents.data, createdAt: appointmentEvents.createdAt })
      .from(appointmentEvents)
      .leftJoin(users, eq(users.id, appointmentEvents.actorUserId))
      .where(eq(appointmentEvents.appointmentId, id))
      .orderBy(desc(appointmentEvents.createdAt))
      .limit(50),
    m.permissions.has("payments.view") || m.permissions.has("payments.refund")
      ? db.select().from(payments).where(eq(payments.appointmentId, id)).orderBy(desc(payments.createdAt))
      : Promise.resolve([] as (typeof payments.$inferSelect)[]),
    row.a.memberId ? db.select({ id: businessMembers.id, name: businessMembers.displayName }).from(businessMembers).where(eq(businessMembers.id, row.a.memberId)) : Promise.resolve([]),
    row.a.locationId ? db.select().from(locations).where(eq(locations.id, row.a.locationId)) : Promise.resolve([]),
    m.permissions.has("customers.manage") || m.permissions.has("customers.view")
      ? db.select({ id: customerNotes.id, body: customerNotes.body, createdAt: customerNotes.createdAt, author: users.name }).from(customerNotes).leftJoin(users, eq(users.id, customerNotes.authorUserId)).where(and(eq(customerNotes.businessCustomerId, row.customer.id), isNull(customerNotes.deletedAt))).orderBy(desc(customerNotes.createdAt)).limit(5)
      : Promise.resolve([]),
  ]);
  const canSeeContact = m.permissions.has("customers.view") || m.permissions.has("appointments.manage_all");
  return {
    appointment: row.a,
    customer: {
      id: row.customer.id,
      name: row.customer.name,
      email: canSeeContact ? row.customer.email : null,
      phone: canSeeContact ? row.customer.phone : null,
      completedCount: row.customer.completedCount,
      noShowCount: row.customer.noShowCount,
      cancelledCount: row.customer.cancelledCount,
      tags: row.customer.tags,
      hasAccount: Boolean(row.customer.userId),
    },
    events,
    payments: pays,
    member: member[0] ?? null,
    location: location[0] ?? null,
    notes,
    canManage: m.permissions.has("appointments.manage_all") || (m.permissions.has("appointments.manage_own") && row.a.memberId === m.memberId),
    canRefund: m.permissions.has("payments.refund"),
  };
}

/* ─────────────────────────────── CRM ─────────────────────────────── */

export const customerQuerySchema = z.object({
  q: z.string().trim().max(100).optional(),
  sort: z.enum(["recent", "name", "visits", "spent"]).default("recent"),
  tag: z.string().trim().max(40).optional(),
  page: z.coerce.number().int().min(1).max(500).default(1),
});

export async function listCustomers(m: Membership, p: z.infer<typeof customerQuerySchema>) {
  if (!m.permissions.has("customers.view")) throw forbidden();
  const size = 40;
  const order =
    p.sort === "name" ? [asc(businessCustomers.name)] : p.sort === "visits" ? [desc(businessCustomers.completedCount)] : p.sort === "spent" ? [desc(businessCustomers.totalSpentCents)] : [sql`${businessCustomers.lastVisitAt} desc nulls last`, desc(businessCustomers.createdAt)];
  const term = p.q ? `%${p.q.replace(/[%_]/g, "")}%` : null;
  const rows = await db
    .select({
      id: businessCustomers.id,
      name: businessCustomers.name,
      email: businessCustomers.email,
      phone: businessCustomers.phone,
      tags: businessCustomers.tags,
      completedCount: businessCustomers.completedCount,
      noShowCount: businessCustomers.noShowCount,
      cancelledCount: businessCustomers.cancelledCount,
      totalSpentCents: businessCustomers.totalSpentCents,
      lastVisitAt: businessCustomers.lastVisitAt,
      nextVisit: sql<string | null>`(select min(starts_at) from appointments a where a.business_customer_id = business_customers.id and a.starts_at > now() and a.status in ('confirmed','requested'))`,
    })
    .from(businessCustomers)
    .where(
      and(
        eq(businessCustomers.businessId, m.businessId),
        term ? or(ilike(businessCustomers.name, term), ilike(businessCustomers.email, term), ilike(businessCustomers.phone, term)) : sql`true`,
        p.tag ? sql`${p.tag} = any(${businessCustomers.tags})` : sql`true`,
      ),
    )
    .orderBy(...order)
    .limit(size + 1)
    .offset((p.page - 1) * size);
  return { customers: rows.slice(0, size), hasMore: rows.length > size };
}

export async function customerDetail(m: Membership, id: string) {
  if (!m.permissions.has("customers.view")) throw forbidden();
  const [c] = await db.select().from(businessCustomers).where(and(eq(businessCustomers.id, id), eq(businessCustomers.businessId, m.businessId)));
  if (!c) throw notFound("That customer");
  const scope = appointmentScope(m);
  const [history, notes] = await Promise.all([
    db
      .select({
        id: appointments.id,
        status: appointments.status,
        startsAt: appointments.startsAt,
        timezone: appointments.timezone,
        serviceName: sql<string>`${appointments.snapshot}->>'serviceName'`,
        memberName: sql<string | null>`${appointments.snapshot}->>'memberName'`,
        totalCents: appointments.totalCents,
        currency: appointments.currency,
      })
      .from(appointments)
      .where(and(eq(appointments.businessCustomerId, id), scope.all ? sql`true` : eq(appointments.memberId, scope.memberId)))
      .orderBy(desc(appointments.startsAt))
      .limit(100),
    db
      .select({ id: customerNotes.id, body: customerNotes.body, createdAt: customerNotes.createdAt, author: users.name, authorUserId: customerNotes.authorUserId })
      .from(customerNotes)
      .leftJoin(users, eq(users.id, customerNotes.authorUserId))
      .where(and(eq(customerNotes.businessCustomerId, id), isNull(customerNotes.deletedAt)))
      .orderBy(desc(customerNotes.createdAt))
      .limit(100),
  ]);
  return { customer: c, history, notes };
}

export const updateCustomerSchema = z.object({
  name: z.string().trim().min(1).max(80),
  email: z.string().trim().toLowerCase().email().max(254).nullable().optional().or(z.literal("").transform(() => null)),
  phone: z.string().trim().max(40).nullable().optional(),
  tags: z.array(z.string().trim().min(1).max(30)).max(12).default([]),
  preferences: z.string().trim().max(2000).nullable().optional(),
});

export async function updateCustomer(m: Membership, actorUserId: string, id: string, input: z.infer<typeof updateCustomerSchema>) {
  if (!m.permissions.has("customers.manage")) throw forbidden();
  const [c] = await db.select({ userId: businessCustomers.userId }).from(businessCustomers).where(and(eq(businessCustomers.id, id), eq(businessCustomers.businessId, m.businessId)));
  if (!c) throw notFound("That customer");
  // Contact details of customers with their own account come from their profile.
  const contact = c.userId ? {} : { name: input.name, email: input.email ?? null, phone: input.phone ?? null };
  await db
    .update(businessCustomers)
    .set({ ...contact, tags: [...new Set(input.tags.map((t) => t.toLowerCase()))], preferences: input.preferences ?? null })
    .where(eq(businessCustomers.id, id));
  await audit({ actorUserId, actorType: "business", businessId: m.businessId, action: "customer.updated", targetType: "business_customer", targetId: id });
}

export async function addCustomerNote(m: Membership, actorUserId: string, customerId: string, body: string) {
  if (!m.permissions.has("customers.manage")) throw forbidden();
  const text = body.trim();
  if (!text || text.length > 2000) throw new AppError("validation", "Notes must be between 1 and 2,000 characters.");
  const [c] = await db.select({ id: businessCustomers.id }).from(businessCustomers).where(and(eq(businessCustomers.id, customerId), eq(businessCustomers.businessId, m.businessId)));
  if (!c) throw notFound("That customer");
  const [note] = await db.insert(customerNotes).values({ businessId: m.businessId, businessCustomerId: customerId, authorUserId: actorUserId, body: text }).returning();
  return note;
}

export async function deleteCustomerNote(m: Membership, actorUserId: string, noteId: string) {
  const [n] = await db.select().from(customerNotes).where(and(eq(customerNotes.id, noteId), eq(customerNotes.businessId, m.businessId)));
  if (!n) throw notFound("That note");
  if (n.authorUserId !== actorUserId && !m.permissions.has("customers.manage")) throw forbidden();
  await db.update(customerNotes).set({ deletedAt: new Date() }).where(eq(customerNotes.id, noteId));
}

/** Quick customer lookup for the manual booking form. */
export async function searchCustomers(m: Membership, q: string) {
  if (!m.permissions.has("customers.view") && !m.permissions.has("appointments.manage_all")) throw forbidden();
  const term = `%${q.replace(/[%_]/g, "")}%`;
  return db
    .select({ id: businessCustomers.id, name: businessCustomers.name, email: businessCustomers.email, phone: businessCustomers.phone, completedCount: businessCustomers.completedCount })
    .from(businessCustomers)
    .where(and(eq(businessCustomers.businessId, m.businessId), or(ilike(businessCustomers.name, term), ilike(businessCustomers.email, term), ilike(businessCustomers.phone, term))))
    .orderBy(sql`${businessCustomers.lastVisitAt} desc nulls last`)
    .limit(8);
}

export async function servicesForCalendar(businessId: string) {
  return db
    .select({ id: services.id, name: services.name, durationMinutes: services.durationMinutes, status: services.status })
    .from(services)
    .where(and(eq(services.businessId, businessId), sql`${services.status} <> 'archived'`))
    .orderBy(asc(services.sortOrder));
}
