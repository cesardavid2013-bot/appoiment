import "server-only";
import { and, desc, eq, gt, isNull, lt, or, sql } from "drizzle-orm";
import { z } from "zod";
import { AppError, notFound } from "@/domain/errors";
import { db } from "../db/client";
import { businessMembers, businesses, conversations, messages, users } from "../db/schema";
import type { Viewer } from "../auth/session";
import type { Membership } from "../authz";
import { notify } from "../notify";
import { rateLimit } from "../rate-limit";
import { getMediaMap } from "./media";

export const sendMessageSchema = z.object({
  body: z.string().trim().min(1, "Write a message").max(2000, "Keep messages under 2,000 characters"),
  mediaId: z.string().uuid().nullable().optional(),
  appointmentId: z.string().uuid().nullable().optional(),
});

const PREVIEW = 140;

/** Customer-side: start or continue a thread with a business (e.g. to ask a question before booking). */
export async function customerSend(viewer: Viewer, businessId: string, input: z.infer<typeof sendMessageSchema>) {
  await rateLimit("message", viewer.id);
  const [b] = await db.select({ id: businesses.id, name: businesses.name, ownerUserId: businesses.ownerUserId, status: businesses.status }).from(businesses).where(eq(businesses.id, businessId));
  if (!b || b.status !== "active") throw notFound("That business");
  if (b.ownerUserId === viewer.id) throw new AppError("validation", "You can't message your own business.");
  if (input.mediaId) await assertAttachable(input.mediaId, viewer.id, null);
  return db.transaction(async (tx) => {
    const [conv] = await tx
      .insert(conversations)
      .values({ businessId, customerUserId: viewer.id, lastMessagePreview: input.body.slice(0, PREVIEW), customerLastReadAt: new Date() })
      .onConflictDoUpdate({
        target: [conversations.businessId, conversations.customerUserId],
        set: { lastMessageAt: new Date(), lastMessagePreview: input.body.slice(0, PREVIEW), customerLastReadAt: new Date() },
      })
      .returning();
    const [msg] = await tx
      .insert(messages)
      .values({ conversationId: conv.id, senderUserId: viewer.id, senderRole: "customer", body: input.body, mediaId: input.mediaId ?? null, appointmentId: input.appointmentId ?? null })
      .returning();
    // One email per quiet period per thread, so a burst of messages isn't a burst of emails.
    const bucket = Math.floor(Date.now() / (15 * 60_000));
    const recipients = await tx
      .select({ userId: businessMembers.userId, role: businessMembers.role, custom: businessMembers.customPermissions })
      .from(businessMembers)
      .where(and(eq(businessMembers.businessId, businessId), eq(businessMembers.status, "active")));
    for (const r of recipients) {
      if (!r.userId || !(r.role === "owner" || r.role === "manager" || r.role === "receptionist" || r.custom.includes("messages.manage"))) continue;
      await notify(
        r.userId,
        {
          topic: "messages",
          type: "message.received",
          title: `New message from ${viewer.name}`,
          body: input.body.slice(0, PREVIEW),
          href: `/pro/messages/${conv.id}`,
          email: { subject: `New message from ${viewer.name}`, heading: `${viewer.name} sent you a message`, paragraphs: [input.body.slice(0, 500)], cta: { label: "Reply", url: `/pro/messages/${conv.id}` } },
          dedupeKey: `msg:${conv.id}:${r.userId}:${bucket}`,
        },
        tx,
      );
    }
    return { conversationId: conv.id, message: msg };
  });
}

/** Business-side reply. Requires an existing conversation (businesses can't cold-message customers). */
export async function businessSend(m: Membership, actorUserId: string, conversationId: string, input: z.infer<typeof sendMessageSchema>) {
  await rateLimit("message", actorUserId);
  if (input.mediaId) await assertAttachable(input.mediaId, actorUserId, m.businessId);
  return db.transaction(async (tx) => {
    const [conv] = await tx.select().from(conversations).where(and(eq(conversations.id, conversationId), eq(conversations.businessId, m.businessId))).for("update");
    if (!conv) throw notFound("That conversation");
    const [msg] = await tx
      .insert(messages)
      .values({ conversationId, senderUserId: actorUserId, senderRole: "business", body: input.body, mediaId: input.mediaId ?? null, appointmentId: input.appointmentId ?? null })
      .returning();
    await tx
      .update(conversations)
      .set({ lastMessageAt: new Date(), lastMessagePreview: input.body.slice(0, PREVIEW), businessLastReadAt: new Date() })
      .where(eq(conversations.id, conversationId));
    const bucket = Math.floor(Date.now() / (15 * 60_000));
    await notify(
      conv.customerUserId,
      {
        topic: "messages",
        type: "message.received",
        title: `New message from ${m.businessName}`,
        body: input.body.slice(0, PREVIEW),
        href: `/messages/${conv.id}`,
        email: { subject: `${m.businessName} sent you a message`, heading: `${m.businessName} replied`, paragraphs: [input.body.slice(0, 500)], cta: { label: "Reply", url: `/messages/${conv.id}` } },
        dedupeKey: `msg:${conv.id}:${conv.customerUserId}:${bucket}`,
      },
      tx,
    );
    return { message: msg };
  });
}

async function assertAttachable(mediaId: string, userId: string, businessId: string | null) {
  const { assertMediaOwned } = await import("./media");
  await assertMediaOwned(mediaId, businessId ? { businessId } : { userId });
}

export async function listCustomerConversations(viewer: Viewer) {
  const rows = await db
    .select({
      id: conversations.id,
      lastMessageAt: conversations.lastMessageAt,
      preview: conversations.lastMessagePreview,
      unread: sql<boolean>`(${conversations.customerLastReadAt} is null or ${conversations.customerLastReadAt} < ${conversations.lastMessageAt})`,
      businessName: businesses.name,
      businessSlug: businesses.slug,
      logoMediaId: businesses.logoMediaId,
    })
    .from(conversations)
    .innerJoin(businesses, eq(businesses.id, conversations.businessId))
    .where(eq(conversations.customerUserId, viewer.id))
    .orderBy(desc(conversations.lastMessageAt))
    .limit(100);
  const media = await getMediaMap(rows.map((r) => r.logoMediaId));
  return rows.map((r) => ({ ...r, logo: r.logoMediaId ? (media.get(r.logoMediaId) ?? null) : null }));
}

export async function listBusinessConversations(m: Membership) {
  return db
    .select({
      id: conversations.id,
      lastMessageAt: conversations.lastMessageAt,
      preview: conversations.lastMessagePreview,
      unread: sql<boolean>`(${conversations.businessLastReadAt} is null or ${conversations.businessLastReadAt} < ${conversations.lastMessageAt})`,
      customerName: users.name,
      customerUserId: users.id,
    })
    .from(conversations)
    .innerJoin(users, eq(users.id, conversations.customerUserId))
    .where(eq(conversations.businessId, m.businessId))
    .orderBy(desc(conversations.lastMessageAt))
    .limit(200);
}

/**
 * Loads a thread for either side after verifying the viewer belongs to it.
 * Phone numbers and emails are never part of the payload.
 */
export async function getThread(args: { conversationId: string; viewer: Viewer; membership?: Membership | null; before?: Date; after?: Date }) {
  const [conv] = await db.select().from(conversations).where(eq(conversations.id, args.conversationId));
  if (!conv) throw notFound("That conversation");
  const side: "customer" | "business" | null =
    conv.customerUserId === args.viewer.id ? "customer" : args.membership && args.membership.businessId === conv.businessId && args.membership.permissions.has("messages.manage") ? "business" : null;
  if (!side) throw notFound("That conversation");
  const rows = await db
    .select({
      id: messages.id,
      body: messages.body,
      senderRole: messages.senderRole,
      senderUserId: messages.senderUserId,
      appointmentId: messages.appointmentId,
      mediaId: messages.mediaId,
      createdAt: messages.createdAt,
    })
    .from(messages)
    .where(
      and(
        eq(messages.conversationId, conv.id),
        isNull(messages.deletedAt),
        args.before ? lt(messages.createdAt, args.before) : sql`true`,
        args.after ? gt(messages.createdAt, args.after) : sql`true`,
      ),
    )
    .orderBy(desc(messages.createdAt))
    .limit(50);
  const media = await getMediaMap(rows.map((r) => r.mediaId));
  // Mark read for this side.
  await db
    .update(conversations)
    .set(side === "customer" ? { customerLastReadAt: new Date() } : { businessLastReadAt: new Date() })
    .where(eq(conversations.id, conv.id));
  const [biz] = await db.select({ name: businesses.name, slug: businesses.slug }).from(businesses).where(eq(businesses.id, conv.businessId));
  const [customer] = await db.select({ name: users.name }).from(users).where(eq(users.id, conv.customerUserId));
  return {
    id: conv.id,
    side,
    businessId: conv.businessId,
    businessName: biz.name,
    businessSlug: biz.slug,
    customerName: customer?.name ?? "Customer",
    customerUserId: conv.customerUserId,
    messages: rows
      .reverse()
      .map((r) => ({ ...r, mine: (side === "customer" && r.senderRole === "customer") || (side === "business" && r.senderRole === "business"), media: r.mediaId ? (media.get(r.mediaId) ?? null) : null })),
    hasMore: rows.length === 50,
  };
}

export async function unreadMessageCount(viewer: Viewer, m: Membership | null) {
  const [c] = await db
    .select({ n: sql<number>`count(*)::int` })
    .from(conversations)
    .where(
      or(
        and(eq(conversations.customerUserId, viewer.id), sql`(${conversations.customerLastReadAt} is null or ${conversations.customerLastReadAt} < ${conversations.lastMessageAt})`),
        m && m.permissions.has("messages.manage")
          ? and(eq(conversations.businessId, m.businessId), sql`(${conversations.businessLastReadAt} is null or ${conversations.businessLastReadAt} < ${conversations.lastMessageAt})`)
          : sql`false`,
      ),
    );
  return c?.n ?? 0;
}
