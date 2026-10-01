import "server-only";
import { and, asc, desc, eq, inArray, lt, sql } from "drizzle-orm";
import { z } from "zod";
import { AppError, forbidden, notFound } from "@/domain/errors";
import { MAX_TICKET_ATTACHMENTS, SUPPORT_CATEGORY_KEYS, type TicketStatus } from "@/domain/support";
import { db } from "../db/client";
import { appointments, businessMembers, businesses, supportMessages, supportTickets, users } from "../db/schema";
import type { Viewer } from "../auth/session";
import { audit } from "../audit";
import { notify } from "../notify";
import { rateLimit } from "../rate-limit";
import { assertMediaOwned, getMediaMap } from "./media";

const mediaIdsSchema = z
  .array(z.string().uuid())
  .max(MAX_TICKET_ATTACHMENTS, `Attach up to ${MAX_TICKET_ATTACHMENTS} images`)
  .default([])
  .transform((ids) => [...new Set(ids)]);

export const createTicketSchema = z.object({
  category: z.enum(SUPPORT_CATEGORY_KEYS, "Choose a topic"),
  subject: z.string().trim().min(4, "Add a short subject").max(140, "Keep the subject under 140 characters"),
  body: z.string().trim().min(10, "Tell us a little more — at least a sentence helps us help you").max(5000, "Keep it under 5,000 characters"),
  appointmentId: z.string().uuid().nullable().optional(),
  mediaIds: mediaIdsSchema,
});

export const replySchema = z.object({
  body: z.string().trim().min(1, "Write a reply").max(5000, "Keep it under 5,000 characters"),
  mediaIds: mediaIdsSchema,
});

const PREVIEW = 140;

async function assertAttachments(userId: string, ids: string[]) {
  for (const id of ids) {
    const m = await assertMediaOwned(id, { userId });
    if (m.kind !== "image") throw new AppError("validation", "Attachments must be images.");
  }
}

/**
 * An appointment can be referenced if the user booked it, or works at the
 * business that holds it. Returns the business so staff see who's involved.
 */
async function resolveAppointment(userId: string, appointmentId: string) {
  const [a] = await db
    .select({ id: appointments.id, businessId: appointments.businessId, customerUserId: appointments.customerUserId })
    .from(appointments)
    .where(eq(appointments.id, appointmentId));
  if (!a) throw new AppError("validation", "We couldn't find that appointment on your account.", { fields: { appointmentId: "Not found on your account" } });
  if (a.customerUserId === userId) return a;
  const [member] = await db
    .select({ id: businessMembers.id })
    .from(businessMembers)
    .where(and(eq(businessMembers.businessId, a.businessId), eq(businessMembers.userId, userId), eq(businessMembers.status, "active")));
  if (!member) throw new AppError("validation", "We couldn't find that appointment on your account.", { fields: { appointmentId: "Not found on your account" } });
  return a;
}

const attachableSelect = {
  id: appointments.id,
  reference: appointments.reference,
  startsAt: appointments.startsAt,
  timezone: appointments.timezone,
  serviceName: sql<string>`${appointments.snapshot}->>'serviceName'`,
  businessName: businesses.name,
};

/** Appointments a user can attach to a request: their recent and upcoming bookings. */
export async function attachableAppointments(userId: string) {
  return db
    .select(attachableSelect)
    .from(appointments)
    .innerJoin(businesses, eq(businesses.id, appointments.businessId))
    .where(and(eq(appointments.customerUserId, userId), sql`${appointments.startsAt} > now() - interval '180 days'`))
    .orderBy(desc(appointments.startsAt))
    .limit(30);
}

/** Validates an `?appointment=` prefill for the current user; returns null rather than throwing. */
export async function prefillAppointment(userId: string, appointmentId: string | undefined) {
  if (!appointmentId || !z.string().uuid().safeParse(appointmentId).success) return null;
  try {
    const a = await resolveAppointment(userId, appointmentId);
    const [row] = await db.select(attachableSelect).from(appointments).innerJoin(businesses, eq(businesses.id, appointments.businessId)).where(eq(appointments.id, a.id));
    return row ?? null;
  } catch {
    return null;
  }
}

export async function createTicket(viewer: Viewer, input: z.infer<typeof createTicketSchema>) {
  await rateLimit("support", viewer.id);
  const appt = input.appointmentId ? await resolveAppointment(viewer.id, input.appointmentId) : null;
  await assertAttachments(viewer.id, input.mediaIds);
  const ticket = await db.transaction(async (tx) => {
    const [t] = await tx
      .insert(supportTickets)
      .values({ userId: viewer.id, businessId: appt?.businessId ?? null, appointmentId: appt?.id ?? null, category: input.category, subject: input.subject })
      .returning({ id: supportTickets.id });
    await tx.insert(supportMessages).values({ ticketId: t.id, authorUserId: viewer.id, isStaff: false, body: input.body, mediaIds: input.mediaIds });
    return t;
  });
  return { id: ticket.id };
}

export async function listMyTickets(userId: string) {
  return db
    .select({
      id: supportTickets.id,
      category: supportTickets.category,
      subject: supportTickets.subject,
      status: supportTickets.status,
      lastActivityAt: supportTickets.lastActivityAt,
      createdAt: supportTickets.createdAt,
      messageCount: sql<number>`(select count(*)::int from support_messages m where m.ticket_id = ${supportTickets.id})`,
    })
    .from(supportTickets)
    .where(eq(supportTickets.userId, userId))
    .orderBy(desc(supportTickets.lastActivityAt))
    .limit(100);
}

async function threadFor(ticketId: string) {
  const rows = await db
    .select({ id: supportMessages.id, isStaff: supportMessages.isStaff, body: supportMessages.body, mediaIds: supportMessages.mediaIds, createdAt: supportMessages.createdAt, authorUserId: supportMessages.authorUserId, authorName: users.name })
    .from(supportMessages)
    .innerJoin(users, eq(users.id, supportMessages.authorUserId))
    .where(eq(supportMessages.ticketId, ticketId))
    .orderBy(asc(supportMessages.createdAt));
  const mediaMap = await getMediaMap(rows.flatMap((r) => r.mediaIds));
  return rows.map((r) => ({ ...r, media: r.mediaIds.map((id) => mediaMap.get(id)).filter((m): m is NonNullable<typeof m> => Boolean(m)) }));
}

async function ticketAppointment(appointmentId: string | null) {
  if (!appointmentId) return null;
  const [a] = await db
    .select({ id: appointments.id, reference: appointments.reference, startsAt: appointments.startsAt, timezone: appointments.timezone, customerUserId: appointments.customerUserId, serviceName: sql<string>`${appointments.snapshot}->>'serviceName'`, businessName: businesses.name })
    .from(appointments)
    .innerJoin(businesses, eq(businesses.id, appointments.businessId))
    .where(eq(appointments.id, appointmentId));
  return a ?? null;
}

/** The user's own ticket with its full thread. Staff identities are never exposed to customers. */
export async function getMyTicket(userId: string, ticketId: string) {
  const [t] = await db.select().from(supportTickets).where(and(eq(supportTickets.id, ticketId), eq(supportTickets.userId, userId)));
  if (!t) return null;
  const [thread, appointment] = await Promise.all([threadFor(t.id), ticketAppointment(t.appointmentId)]);
  return {
    ticket: t,
    appointment,
    messages: thread.map((m) => ({ id: m.id, isStaff: m.isStaff, mine: !m.isStaff && m.authorUserId === userId, authorName: m.isStaff ? "Kept Support" : "You", body: m.body, media: m.media, createdAt: m.createdAt.toISOString() })),
  };
}

export async function replyToTicket(viewer: Viewer, ticketId: string, input: z.infer<typeof replySchema>) {
  await rateLimit("message", viewer.id);
  await assertAttachments(viewer.id, input.mediaIds);
  return db.transaction(async (tx) => {
    const [t] = await tx.select().from(supportTickets).where(and(eq(supportTickets.id, ticketId), eq(supportTickets.userId, viewer.id))).for("update");
    if (!t) throw notFound("That request");
    if (t.status === "closed") throw new AppError("conflict", "This request is closed. Open a new one and we'll pick it up from there.");
    const [m] = await tx.insert(supportMessages).values({ ticketId, authorUserId: viewer.id, isStaff: false, body: input.body, mediaIds: input.mediaIds }).returning({ id: supportMessages.id });
    // A customer reply always puts the ticket back in the support queue.
    await tx.update(supportTickets).set({ status: "open", lastActivityAt: new Date() }).where(eq(supportTickets.id, ticketId));
    return { id: m.id };
  });
}

/** Customers can mark their own request as solved. */
export async function resolveMyTicket(viewer: Viewer, ticketId: string) {
  const rows = await db
    .update(supportTickets)
    .set({ status: "resolved", lastActivityAt: new Date() })
    .where(and(eq(supportTickets.id, ticketId), eq(supportTickets.userId, viewer.id), inArray(supportTickets.status, ["open", "awaiting_customer"])))
    .returning({ id: supportTickets.id });
  if (!rows.length) {
    const [t] = await db.select({ status: supportTickets.status }).from(supportTickets).where(and(eq(supportTickets.id, ticketId), eq(supportTickets.userId, viewer.id)));
    if (!t) throw notFound("That request");
  }
  return { ok: true };
}

/* ─────────────────────────────── Staff ───────────────────────────── */

/** Re-reads the actor's role so a stale session can't act after being demoted. */
async function assertStaff(userId: string) {
  const [u] = await db.select({ role: users.platformRole, status: users.status }).from(users).where(eq(users.id, userId));
  if (!u || u.status !== "active" || (u.role !== "admin" && u.role !== "support")) throw forbidden();
}

export const ticketStatusSchema = z.enum(["open", "awaiting_customer", "resolved", "closed"]);

export const listTicketsQuery = z.object({
  status: z.union([ticketStatusSchema, z.literal("active")]).optional(),
  before: z.string().datetime().optional(),
  limit: z.coerce.number().int().min(1).max(100).default(50),
});

/**
 * Support queue for the admin console. `active` = needs attention (open or
 * awaiting the customer). Paginate with `nextCursor` (last activity instant).
 */
export async function listAllTickets(actorUserId: string, opts: { status?: TicketStatus | "active"; before?: Date; limit?: number } = {}) {
  await assertStaff(actorUserId);
  const limit = Math.min(opts.limit ?? 50, 100);
  const statusFilter =
    opts.status === "active" ? inArray(supportTickets.status, ["open", "awaiting_customer"]) : opts.status ? eq(supportTickets.status, opts.status) : undefined;
  const rows = await db
    .select({
      id: supportTickets.id,
      category: supportTickets.category,
      subject: supportTickets.subject,
      status: supportTickets.status,
      lastActivityAt: supportTickets.lastActivityAt,
      createdAt: supportTickets.createdAt,
      appointmentId: supportTickets.appointmentId,
      businessId: supportTickets.businessId,
      businessName: businesses.name,
      userId: users.id,
      userName: users.name,
      userEmail: users.email,
      messageCount: sql<number>`(select count(*)::int from support_messages m where m.ticket_id = ${supportTickets.id})`,
    })
    .from(supportTickets)
    .innerJoin(users, eq(users.id, supportTickets.userId))
    .leftJoin(businesses, eq(businesses.id, supportTickets.businessId))
    .where(and(statusFilter, opts.before ? lt(supportTickets.lastActivityAt, opts.before) : undefined))
    .orderBy(desc(supportTickets.lastActivityAt))
    .limit(limit + 1);
  const items = rows.slice(0, limit);
  return { items, nextCursor: rows.length > limit ? items.at(-1)!.lastActivityAt.toISOString() : null };
}

export async function ticketCounts(actorUserId: string) {
  await assertStaff(actorUserId);
  const rows = await db.select({ status: supportTickets.status, n: sql<number>`count(*)::int` }).from(supportTickets).groupBy(supportTickets.status);
  return Object.fromEntries(rows.map((r) => [r.status, r.n])) as Partial<Record<TicketStatus, number>>;
}

/** Full ticket for staff, including who the customer is and staff author names. */
export async function getTicketForStaff(actorUserId: string, ticketId: string) {
  await assertStaff(actorUserId);
  const [row] = await db
    .select({ t: supportTickets, userName: users.name, userEmail: users.email, userStatus: users.status, businessName: businesses.name, businessSlug: businesses.slug })
    .from(supportTickets)
    .innerJoin(users, eq(users.id, supportTickets.userId))
    .leftJoin(businesses, eq(businesses.id, supportTickets.businessId))
    .where(eq(supportTickets.id, ticketId));
  if (!row) throw notFound("That ticket");
  const [thread, appointment] = await Promise.all([threadFor(ticketId), ticketAppointment(row.t.appointmentId)]);
  return { ...row, appointment, messages: thread };
}

export async function staffReply(adminUserId: string, ticketId: string, body: string, mediaIds: string[] = []) {
  await assertStaff(adminUserId);
  const parsed = replySchema.parse({ body, mediaIds });
  await assertAttachments(adminUserId, parsed.mediaIds);
  return db.transaction(async (tx) => {
    const [t] = await tx.select().from(supportTickets).where(eq(supportTickets.id, ticketId)).for("update");
    if (!t) throw notFound("That ticket");
    const [m] = await tx.insert(supportMessages).values({ ticketId, authorUserId: adminUserId, isStaff: true, body: parsed.body, mediaIds: parsed.mediaIds }).returning({ id: supportMessages.id });
    await tx.update(supportTickets).set({ status: "awaiting_customer", lastActivityAt: new Date() }).where(eq(supportTickets.id, ticketId));
    await notify(
      t.userId,
      {
        topic: "messages",
        type: "support.reply",
        title: "Kept Support replied",
        body: `${t.subject} — ${parsed.body.slice(0, PREVIEW)}`,
        href: `/support/${t.id}`,
        email: {
          subject: `Re: ${t.subject}`,
          heading: "We replied to your request",
          paragraphs: [parsed.body.slice(0, 1500)],
          cta: { label: "View and reply", url: `/support/${t.id}` },
          footnote: "Reply from your Kept account so the whole conversation stays in one place.",
        },
      },
      tx,
    );
    await audit({ actorUserId: adminUserId, actorType: "admin", businessId: t.businessId, action: "support.replied", targetType: "support_ticket", targetId: t.id }, tx);
    return { id: m.id };
  });
}

export async function setTicketStatus(adminUserId: string, ticketId: string, status: TicketStatus) {
  await assertStaff(adminUserId);
  return db.transaction(async (tx) => {
    const [t] = await tx.select().from(supportTickets).where(eq(supportTickets.id, ticketId)).for("update");
    if (!t) throw notFound("That ticket");
    if (t.status === status) return { status };
    await tx.update(supportTickets).set({ status, lastActivityAt: new Date() }).where(eq(supportTickets.id, ticketId));
    if ((status === "resolved" || status === "closed") && t.status !== "resolved" && t.status !== "closed") {
      await notify(t.userId, { topic: "messages", type: "support.resolved", title: "Your support request was resolved", body: t.subject, href: `/support/${t.id}` }, tx);
    }
    await audit({ actorUserId: adminUserId, actorType: "admin", businessId: t.businessId, action: `support.${status}`, targetType: "support_ticket", targetId: t.id, metadata: { from: t.status } }, tx);
    return { status };
  });
}

