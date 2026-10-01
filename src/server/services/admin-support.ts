import "server-only";
import { and, asc, desc, eq, ilike, or, sql, type SQL } from "drizzle-orm";
import { alias } from "drizzle-orm/pg-core";
import { z } from "zod";
import { AppError, notFound } from "@/domain/errors";
import { db } from "../db/client";
import { appointments, businesses, supportMessages, supportTickets, users } from "../db/schema";
import type { Viewer } from "../auth/session";
import { requireAdmin } from "../authz";
import { audit } from "../audit";
import { notify } from "../notify";
import { getMediaMap } from "./media";

/**
 * Staff side of the support inbox. Support agents and admins can read and
 * answer tickets; the customer-facing side lives in services/support.ts.
 */

export const TICKET_STATUSES = ["open", "awaiting_customer", "resolved", "closed"] as const;
export type TicketStatus = (typeof TICKET_STATUSES)[number];
export const TICKET_TABS = ["open", "awaiting_customer", "resolved", "closed", "all"] as const;

const PAGE_SIZE = 25;

export async function listTickets(f: { status?: string; q?: string; page?: number }) {
  const status = ((TICKET_TABS as readonly string[]).includes(f.status ?? "") ? f.status : "open") as (typeof TICKET_TABS)[number];
  const page = Number.isFinite(f.page) && f.page! >= 1 ? Math.min(Math.floor(f.page!), 10_000) : 1;
  const conds: SQL[] = [];
  if (status !== "all") conds.push(eq(supportTickets.status, status));
  const q = f.q?.trim();
  if (q) {
    const term = `%${q.replace(/[\\%_]/g, (c) => `\\${c}`)}%`;
    conds.push(or(ilike(supportTickets.subject, term), ilike(sql`${users.email}::text`, term), ilike(users.name, term))!);
  }
  const rows = await db
    .select({
      id: supportTickets.id,
      subject: supportTickets.subject,
      category: supportTickets.category,
      status: supportTickets.status,
      lastActivityAt: supportTickets.lastActivityAt,
      createdAt: supportTickets.createdAt,
      userId: users.id,
      userName: users.name,
      userEmail: users.email,
      businessName: businesses.name,
      messageCount: sql<number>`(select count(*) from support_messages m where m.ticket_id = "support_tickets"."id")::int`,
      lastFromStaff: sql<boolean | null>`(select m.is_staff from support_messages m where m.ticket_id = "support_tickets"."id" order by m.created_at desc limit 1)`,
    })
    .from(supportTickets)
    .innerJoin(users, eq(users.id, supportTickets.userId))
    .leftJoin(businesses, eq(businesses.id, supportTickets.businessId))
    .where(conds.length ? and(...conds) : undefined)
    // Open tickets: longest-waiting first. Everything else: most recent activity first.
    .orderBy(status === "open" ? asc(supportTickets.lastActivityAt) : desc(supportTickets.lastActivityAt), asc(supportTickets.id))
    .limit(PAGE_SIZE + 1)
    .offset((page - 1) * PAGE_SIZE);
  return { items: rows.slice(0, PAGE_SIZE), page, pageSize: PAGE_SIZE, hasMore: rows.length > PAGE_SIZE, status };
}

export async function getTicketThread(id: string) {
  if (!/^[0-9a-f-]{36}$/i.test(id)) return null;
  const [t] = await db
    .select({
      ticket: supportTickets,
      userName: users.name,
      userEmail: users.email,
      userStatus: users.status,
      businessName: businesses.name,
      appointmentReference: appointments.reference,
    })
    .from(supportTickets)
    .innerJoin(users, eq(users.id, supportTickets.userId))
    .leftJoin(businesses, eq(businesses.id, supportTickets.businessId))
    .leftJoin(appointments, eq(appointments.id, supportTickets.appointmentId))
    .where(eq(supportTickets.id, id));
  if (!t) return null;
  const author = alias(users, "author");
  const msgs = await db
    .select({
      id: supportMessages.id,
      body: supportMessages.body,
      isStaff: supportMessages.isStaff,
      mediaIds: supportMessages.mediaIds,
      createdAt: supportMessages.createdAt,
      authorId: author.id,
      authorName: author.name,
    })
    .from(supportMessages)
    .innerJoin(author, eq(author.id, supportMessages.authorUserId))
    .where(eq(supportMessages.ticketId, id))
    .orderBy(asc(supportMessages.createdAt), asc(supportMessages.id))
    .limit(500);
  const mediaMap = await getMediaMap(msgs.flatMap((m) => m.mediaIds));
  return {
    ticket: t.ticket,
    requester: { id: t.ticket.userId, name: t.userName, email: t.userEmail, status: t.userStatus },
    businessName: t.businessName,
    appointmentReference: t.appointmentReference,
    messages: msgs.map((m) => ({
      ...m,
      attachments: m.mediaIds.map((mid) => {
        const pm = mediaMap.get(mid);
        return { id: mid, url: pm?.sources.at(-1)?.url ?? pm?.videoUrl ?? null, thumb: pm?.sources[0]?.url ?? null };
      }),
    })),
  };
}

export const staffReplySchema = z.object({
  body: z.string().trim().min(1, "Write a reply").max(5000, "Keep replies under 5,000 characters"),
  status: z.enum(TICKET_STATUSES).default("awaiting_customer"),
});

/** Posts a staff reply, moves the ticket to the chosen status and lets the requester know. */
export async function staffReply(actor: Viewer, ticketId: string, input: z.infer<typeof staffReplySchema>) {
  requireAdmin(actor, "support");
  return db.transaction(async (tx) => {
    const [t] = await tx.select().from(supportTickets).where(eq(supportTickets.id, ticketId)).for("update");
    if (!t) throw notFound("That ticket");
    const now = new Date();
    const [msg] = await tx.insert(supportMessages).values({ ticketId, authorUserId: actor.id, isStaff: true, body: input.body }).returning();
    await tx.update(supportTickets).set({ status: input.status, lastActivityAt: now }).where(eq(supportTickets.id, ticketId));
    await audit(
      {
        actorUserId: actor.id,
        actorType: "admin",
        businessId: t.businessId,
        action: "admin.support.replied",
        targetType: "support_ticket",
        targetId: ticketId,
        metadata: { messageId: msg.id, from: t.status, to: input.status },
      },
      tx,
    );
    const excerpt = input.body.length > 140 ? `${input.body.slice(0, 137)}…` : input.body;
    await notify(
      t.userId,
      {
        topic: "messages",
        type: "support.reply",
        title: `Kept Support replied: ${t.subject}`,
        body: excerpt,
        href: `/support/${ticketId}`,
        email: {
          subject: `Re: ${t.subject}`,
          preheader: excerpt,
          heading: "Kept Support replied to your request",
          paragraphs: [input.body.length > 1200 ? `${input.body.slice(0, 1197)}…` : input.body],
          cta: { label: "View the conversation", url: `/support/${ticketId}` },
        },
      },
      tx,
    );
    return msg;
  });
}

export const ticketStatusSchema = z.object({ status: z.enum(TICKET_STATUSES) });

export async function setTicketStatus(actor: Viewer, ticketId: string, status: TicketStatus) {
  requireAdmin(actor, "support");
  return db.transaction(async (tx) => {
    const [t] = await tx.select({ status: supportTickets.status, businessId: supportTickets.businessId }).from(supportTickets).where(eq(supportTickets.id, ticketId)).for("update");
    if (!t) throw notFound("That ticket");
    if (t.status === status) throw new AppError("conflict", "The ticket already has that status.");
    await tx.update(supportTickets).set({ status }).where(eq(supportTickets.id, ticketId));
    await audit({ actorUserId: actor.id, actorType: "admin", businessId: t.businessId, action: "admin.support.status_changed", targetType: "support_ticket", targetId: ticketId, metadata: { from: t.status, to: status } }, tx);
    return { status };
  });
}
