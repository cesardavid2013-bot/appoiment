import "server-only";
import { and, asc, desc, eq, ilike, inArray, isNotNull, isNull, or, sql } from "drizzle-orm";
import { z } from "zod";
import { UPCOMING_STATUSES } from "@/domain/appointment-state";
import { AppError, notFound } from "@/domain/errors";
import { db, type Executor } from "../db/client";
import { appointments, businessCustomers, businessMembers, businesses, conversations, messages, users } from "../db/schema";
import type { Viewer } from "../auth/session";
import { appointmentScope, type Membership } from "../authz";
import { notify } from "../notify";
import { rateLimit } from "../rate-limit";
import { getMediaMap } from "./media";

/** Body may be empty only when a photo is attached (checked in `assertSendable`). */
export const sendMessageSchema = z.object({
  body: z.string().trim().max(2000, "Keep messages under 2,000 characters").default(""),
  mediaId: z.string().uuid().nullable().optional(),
  appointmentId: z.string().uuid().nullable().optional(),
});
export type SendMessageInput = z.infer<typeof sendMessageSchema>;

const PREVIEW = 140;
const PAGE = 50;
const CATCH_UP = 200;

/** Postgres timestamps carry microseconds; cursors keep them so polling never skips or repeats a message. */
const zCursor = z.string().regex(/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}(\.\d{1,6})?Z$/, "Invalid cursor");
export const threadQuerySchema = z.object({ after: zCursor.optional(), before: zCursor.optional() });

function assertSendable(input: SendMessageInput) {
  if (!input.body && !input.mediaId) throw new AppError("validation", "Write a message", { fields: { body: "Write a message" } });
}

function previewOf(input: SendMessageInput) {
  return input.body ? input.body.slice(0, PREVIEW) : "Sent a photo";
}

/** A message may only reference an appointment between the same business and customer. */
async function assertAppointmentLink(appointmentId: string, businessId: string, customerUserId: string, tx: Executor = db) {
  const [a] = await tx
    .select({ id: appointments.id })
    .from(appointments)
    .where(and(eq(appointments.id, appointmentId), eq(appointments.businessId, businessId), eq(appointments.customerUserId, customerUserId)));
  if (!a) throw new AppError("validation", "That appointment isn't part of this conversation.", { fields: { appointmentId: "Choose one of this client's appointments" } });
}

async function assertAttachable(mediaId: string, userId: string, businessId: string | null) {
  const { assertMediaOwned } = await import("./media");
  await assertMediaOwned(mediaId, businessId ? { businessId } : { userId });
}

/** One email per quiet period per thread, so a burst of messages isn't a burst of emails. */
const quietBucket = () => Math.floor(Date.now() / (15 * 60_000));

/** Customer-side: start or continue a thread with a business (e.g. to ask a question before booking). */
export async function customerSend(viewer: Viewer, businessId: string, input: SendMessageInput) {
  assertSendable(input);
  await rateLimit("message", viewer.id);
  const [b] = await db.select({ id: businesses.id, name: businesses.name, ownerUserId: businesses.ownerUserId, status: businesses.status }).from(businesses).where(eq(businesses.id, businessId));
  if (!b || b.status !== "active") throw notFound("That business");
  if (b.ownerUserId === viewer.id) throw new AppError("validation", "You can't message your own business.");
  if (input.mediaId) await assertAttachable(input.mediaId, viewer.id, null);
  if (input.appointmentId) await assertAppointmentLink(input.appointmentId, businessId, viewer.id);
  const preview = previewOf(input);
  return db.transaction(async (tx) => {
    const now = new Date();
    const [conv] = await tx
      .insert(conversations)
      .values({ businessId, customerUserId: viewer.id, lastMessageAt: now, lastMessagePreview: preview, customerLastReadAt: now })
      .onConflictDoUpdate({
        target: [conversations.businessId, conversations.customerUserId],
        set: { lastMessageAt: now, lastMessagePreview: preview, customerLastReadAt: now },
      })
      .returning();
    const [msg] = await tx
      .insert(messages)
      .values({ conversationId: conv.id, senderUserId: viewer.id, senderRole: "customer", body: input.body, mediaId: input.mediaId ?? null, appointmentId: input.appointmentId ?? null, createdAt: now })
      .returning();
    const bucket = quietBucket();
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
          body: preview,
          href: `/pro/messages/${conv.id}`,
          email: { subject: `New message from ${viewer.name}`, heading: `${viewer.name} sent you a message`, paragraphs: [input.body ? input.body.slice(0, 500) : "They sent a photo."], cta: { label: "Reply", url: `/pro/messages/${conv.id}` } },
          dedupeKey: `msg:${conv.id}:${r.userId}:${bucket}`,
        },
        tx,
      );
    }
    return { conversationId: conv.id, message: msg };
  });
}

async function insertBusinessMessage(tx: Executor, m: Membership, actorUserId: string, conv: { id: string; customerUserId: string }, input: SendMessageInput) {
  const now = new Date();
  const preview = previewOf(input);
  const [msg] = await tx
    .insert(messages)
    .values({ conversationId: conv.id, senderUserId: actorUserId, senderRole: "business", body: input.body, mediaId: input.mediaId ?? null, appointmentId: input.appointmentId ?? null, createdAt: now })
    .returning();
  await tx.update(conversations).set({ lastMessageAt: now, lastMessagePreview: preview, businessLastReadAt: now }).where(eq(conversations.id, conv.id));
  await notify(
    conv.customerUserId,
    {
      topic: "messages",
      type: "message.received",
      title: `New message from ${m.businessName}`,
      body: preview,
      href: `/messages/${conv.id}`,
      email: { subject: `${m.businessName} sent you a message`, heading: `${m.businessName} replied`, paragraphs: [input.body ? input.body.slice(0, 500) : "They sent a photo."], cta: { label: "Reply", url: `/messages/${conv.id}` } },
      dedupeKey: `msg:${conv.id}:${conv.customerUserId}:${quietBucket()}`,
    },
    tx,
  );
  return msg;
}

/** Business-side reply in an existing conversation. */
export async function businessSend(m: Membership, actorUserId: string, conversationId: string, input: SendMessageInput) {
  if (!m.permissions.has("messages.manage")) throw new AppError("forbidden", "You don't have access to customer messages.");
  assertSendable(input);
  await rateLimit("message", actorUserId);
  if (input.mediaId) await assertAttachable(input.mediaId, actorUserId, m.businessId);
  return db.transaction(async (tx) => {
    const [conv] = await tx.select().from(conversations).where(and(eq(conversations.id, conversationId), eq(conversations.businessId, m.businessId))).for("update");
    if (!conv) throw notFound("That conversation");
    if (input.appointmentId) await assertAppointmentLink(input.appointmentId, m.businessId, conv.customerUserId, tx);
    const message = await insertBusinessMessage(tx, m, actorUserId, conv, input);
    return { conversationId, message };
  });
}

/**
 * Business-side first message to a client. Businesses can't cold-message
 * strangers: the client must have a Kept account linked to this business,
 * which only happens when they booked with it themselves.
 */
export async function businessStart(m: Membership, actorUserId: string, businessCustomerId: string, input: SendMessageInput) {
  if (!m.permissions.has("messages.manage")) throw new AppError("forbidden", "You don't have access to customer messages.");
  assertSendable(input);
  const client = await messageableClient(m, businessCustomerId);
  if (!client.userId) throw new AppError("validation", `${client.name} doesn't have a Kept account, so they can't receive messages. Call or email them instead.`);
  await rateLimit("message", actorUserId);
  if (input.mediaId) await assertAttachable(input.mediaId, actorUserId, m.businessId);
  const customerUserId = client.userId;
  return db.transaction(async (tx) => {
    if (input.appointmentId) await assertAppointmentLink(input.appointmentId, m.businessId, customerUserId, tx);
    const [conv] = await tx
      .insert(conversations)
      .values({ businessId: m.businessId, customerUserId })
      .onConflictDoUpdate({ target: [conversations.businessId, conversations.customerUserId], set: { businessId: m.businessId } })
      .returning({ id: conversations.id, customerUserId: conversations.customerUserId });
    const message = await insertBusinessMessage(tx, m, actorUserId, conv, input);
    return { conversationId: conv.id, message };
  });
}

/** A client record of the active business, respecting own-only appointment scope. */
async function messageableClient(m: Membership, businessCustomerId: string) {
  const scope = appointmentScope(m);
  const [c] = await db
    .select({ id: businessCustomers.id, name: businessCustomers.name, userId: businessCustomers.userId })
    .from(businessCustomers)
    .where(
      and(
        eq(businessCustomers.id, businessCustomerId),
        eq(businessCustomers.businessId, m.businessId),
        scope.all ? sql`true` : sql`exists (select 1 from appointments a where a.business_customer_id = business_customers.id and a.member_id = ${scope.memberId})`,
      ),
    );
  if (!c) throw notFound("That client");
  return c;
}

/** For "Message" buttons: the existing thread with a client, if any. */
export async function conversationForClient(m: Membership, businessCustomerId: string) {
  const client = await messageableClient(m, businessCustomerId);
  if (!client.userId) return { client, conversationId: null };
  const [conv] = await db
    .select({ id: conversations.id })
    .from(conversations)
    .where(and(eq(conversations.businessId, m.businessId), eq(conversations.customerUserId, client.userId), isNotNull(conversations.lastMessagePreview)));
  return { client, conversationId: conv?.id ?? null };
}

/** For "Message" buttons on the customer side: the existing thread with a business, if any. */
export async function customerConversationWith(viewer: Viewer, businessId: string) {
  const [conv] = await db
    .select({ id: conversations.id })
    .from(conversations)
    .where(and(eq(conversations.businessId, businessId), eq(conversations.customerUserId, viewer.id), isNotNull(conversations.lastMessagePreview)));
  return conv?.id ?? null;
}

/**
 * Unread = a message from the other person newer than this side's last read.
 * Automatic booking lines ("Appointment confirmed…") never make a thread unread;
 * both sides already get a booking notification for those.
 */
function unreadFor(side: ThreadSide) {
  return side === "customer"
    ? sql<boolean>`exists (select 1 from messages um where um.conversation_id = conversations.id and um.deleted_at is null and um.sender_role = 'business' and um.created_at > coalesce(conversations.customer_last_read_at, '-infinity'::timestamptz))`
    : sql<boolean>`exists (select 1 from messages um where um.conversation_id = conversations.id and um.deleted_at is null and um.sender_role = 'customer' and um.created_at > coalesce(conversations.business_last_read_at, '-infinity'::timestamptz))`;
}

const lastSenderSql = sql<"customer" | "business" | "system" | null>`(select m.sender_role from messages m where m.conversation_id = conversations.id and m.deleted_at is null order by m.created_at desc limit 1)`;

export async function listCustomerConversations(viewer: Viewer) {
  const rows = await db
    .select({
      id: conversations.id,
      lastMessageAt: conversations.lastMessageAt,
      preview: conversations.lastMessagePreview,
      unread: unreadFor("customer"),
      lastSender: lastSenderSql,
      businessId: businesses.id,
      businessName: businesses.name,
      businessSlug: businesses.slug,
      timezone: businesses.timezone,
      logoMediaId: businesses.logoMediaId,
    })
    .from(conversations)
    .innerJoin(businesses, eq(businesses.id, conversations.businessId))
    .where(and(eq(conversations.customerUserId, viewer.id), isNotNull(conversations.lastMessagePreview)))
    .orderBy(desc(conversations.lastMessageAt))
    .limit(100);
  const media = await getMediaMap(rows.map((r) => r.logoMediaId));
  return rows.map(({ logoMediaId, ...r }) => ({ ...r, logo: logoMediaId ? (media.get(logoMediaId) ?? null) : null }));
}

export const inboxQuerySchema = z.object({
  q: z.string().trim().max(80).optional(),
  filter: z.enum(["all", "unread"]).default("all"),
});

export async function listBusinessConversations(m: Membership, p: z.infer<typeof inboxQuerySchema> = { filter: "all" }) {
  if (!m.permissions.has("messages.manage")) throw new AppError("forbidden", "You don't have access to customer messages.");
  const unread = unreadFor("business");
  const term = p.q ? `%${p.q.replace(/[%_\\]/g, "")}%` : null;
  const rows = await db
    .select({
      id: conversations.id,
      lastMessageAt: conversations.lastMessageAt,
      preview: conversations.lastMessagePreview,
      unread,
      lastSender: lastSenderSql,
      customerName: users.name,
      customerUserId: users.id,
      avatarMediaId: users.avatarMediaId,
      clientId: sql<string | null>`(select bc.id from business_customers bc where bc.business_id = conversations.business_id and bc.user_id = conversations.customer_user_id limit 1)`,
    })
    .from(conversations)
    .innerJoin(users, eq(users.id, conversations.customerUserId))
    .where(and(eq(conversations.businessId, m.businessId), isNotNull(conversations.lastMessagePreview), term ? ilike(users.name, term) : sql`true`, p.filter === "unread" ? unread : sql`true`))
    .orderBy(desc(conversations.lastMessageAt))
    .limit(200);
  const media = await getMediaMap(rows.map((r) => r.avatarMediaId));
  return rows.map(({ avatarMediaId, ...r }) => ({ ...r, avatar: avatarMediaId ? (media.get(avatarMediaId) ?? null) : null }));
}

export type ThreadSide = "customer" | "business";

/**
 * Loads a thread for one side after verifying the viewer belongs to it, and
 * marks it read for that side. `after` returns only newer messages (polling),
 * `before` an older page. Phone numbers and emails are never part of the payload.
 */
export async function getThread(args: { conversationId: string; viewer: Viewer; membership?: Membership | null; as: ThreadSide; before?: string; after?: string }) {
  const [conv] = await db.select().from(conversations).where(eq(conversations.id, args.conversationId));
  if (!conv) throw notFound("That conversation");
  const allowed =
    args.as === "customer"
      ? conv.customerUserId === args.viewer.id
      : Boolean(args.membership && args.membership.businessId === conv.businessId && args.membership.permissions.has("messages.manage"));
  if (!allowed) throw notFound("That conversation");
  const side = args.as;

  const select = {
    id: messages.id,
    body: messages.body,
    senderRole: messages.senderRole,
    senderUserId: messages.senderUserId,
    senderName: users.name,
    appointmentId: messages.appointmentId,
    mediaId: messages.mediaId,
    createdAt: messages.createdAt,
    cursor: sql<string>`to_char(${messages.createdAt} at time zone 'UTC', 'YYYY-MM-DD"T"HH24:MI:SS.US"Z"')`,
  };
  const base = and(eq(messages.conversationId, conv.id), isNull(messages.deletedAt));
  let rows;
  let hasMore = false;
  if (args.after) {
    rows = await db
      .select(select)
      .from(messages)
      .leftJoin(users, eq(users.id, messages.senderUserId))
      .where(and(base, sql`${messages.createdAt} > ${args.after}::timestamptz`))
      .orderBy(asc(messages.createdAt), asc(messages.id))
      .limit(CATCH_UP);
  } else {
    const page = await db
      .select(select)
      .from(messages)
      .leftJoin(users, eq(users.id, messages.senderUserId))
      .where(and(base, args.before ? sql`${messages.createdAt} < ${args.before}::timestamptz` : sql`true`))
      .orderBy(desc(messages.createdAt), desc(messages.id))
      .limit(PAGE + 1);
    hasMore = page.length > PAGE;
    rows = page.slice(0, PAGE).reverse();
  }

  const apptIds = [...new Set(rows.map((r) => r.appointmentId).filter((x): x is string => Boolean(x)))];
  const [media, appts] = await Promise.all([
    getMediaMap(rows.map((r) => r.mediaId)),
    apptIds.length
      ? db
          .select({ id: appointments.id, reference: appointments.reference, status: appointments.status, startsAt: appointments.startsAt, timezone: appointments.timezone, serviceName: sql<string>`${appointments.snapshot}->>'serviceName'` })
          .from(appointments)
          .where(and(inArray(appointments.id, apptIds), eq(appointments.businessId, conv.businessId), eq(appointments.customerUserId, conv.customerUserId)))
      : Promise.resolve([]),
  ]);
  const apptMap = new Map(appts.map((a) => [a.id, a]));

  // Mark read for this side (only writes when something was unread).
  let markedRead = false;
  if (!args.before) {
    const col = side === "customer" ? conversations.customerLastReadAt : conversations.businessLastReadAt;
    const updated = await db
      .update(conversations)
      .set(side === "customer" ? { customerLastReadAt: new Date() } : { businessLastReadAt: new Date() })
      .where(and(eq(conversations.id, conv.id), or(isNull(col), sql`${col} < ${conversations.lastMessageAt}`)))
      .returning({ id: conversations.id });
    markedRead = updated.length > 0;
  }

  const [biz] = await db.select({ name: businesses.name, slug: businesses.slug, timezone: businesses.timezone, logoMediaId: businesses.logoMediaId }).from(businesses).where(eq(businesses.id, conv.businessId));
  const [customer] = await db.select({ name: users.name, avatarMediaId: users.avatarMediaId }).from(users).where(eq(users.id, conv.customerUserId));
  const people = await getMediaMap([biz.logoMediaId, customer?.avatarMediaId]);
  return {
    id: conv.id,
    side,
    businessId: conv.businessId,
    businessName: biz.name,
    businessSlug: biz.slug,
    businessTimezone: biz.timezone,
    businessLogo: biz.logoMediaId ? (people.get(biz.logoMediaId) ?? null) : null,
    customerName: customer?.name ?? "Customer",
    customerAvatar: customer?.avatarMediaId ? (people.get(customer.avatarMediaId) ?? null) : null,
    customerUserId: conv.customerUserId,
    /** When the other side last opened the thread — drives the "Seen" label. */
    otherLastReadAt: side === "customer" ? conv.businessLastReadAt : conv.customerLastReadAt,
    markedRead,
    messages: rows.map(({ senderName, ...r }) => {
      const a = r.appointmentId ? apptMap.get(r.appointmentId) : undefined;
      return {
        ...r,
        // Staff names are shown to the team; customers just see the business.
        senderName: r.senderRole === "business" ? (side === "business" ? (senderName ?? "Your team") : biz.name) : (customer?.name ?? "Customer"),
        mine: r.senderRole === side,
        media: r.mediaId ? (media.get(r.mediaId) ?? null) : null,
        appointment: a ? { id: a.id, reference: a.reference, status: a.status, startsAt: a.startsAt, timezone: a.timezone, serviceName: a.serviceName } : null,
      };
    }),
    hasMore,
  };
}

export type Thread = Awaited<ReturnType<typeof getThread>>;

/**
 * Customer context for the business inbox side panel: who they are and their
 * appointments, with the same visibility rules as the rest of the console.
 */
export async function threadContext(m: Membership, conversationId: string) {
  const [conv] = await db.select({ customerUserId: conversations.customerUserId }).from(conversations).where(and(eq(conversations.id, conversationId), eq(conversations.businessId, m.businessId)));
  if (!conv) throw notFound("That conversation");
  const [client] = await db
    .select()
    .from(businessCustomers)
    .where(and(eq(businessCustomers.businessId, m.businessId), eq(businessCustomers.userId, conv.customerUserId)))
    .limit(1);
  const scope = appointmentScope(m);
  const canSeeAppointments = scope.all || m.permissions.has("appointments.manage_own");
  const apptSelect = {
    id: appointments.id,
    status: appointments.status,
    startsAt: appointments.startsAt,
    timezone: appointments.timezone,
    reference: appointments.reference,
    serviceName: sql<string>`${appointments.snapshot}->>'serviceName'`,
  };
  const scoped = and(eq(appointments.businessId, m.businessId), eq(appointments.customerUserId, conv.customerUserId), scope.all ? sql`true` : eq(appointments.memberId, scope.memberId));
  const [upcoming, past] = canSeeAppointments
    ? await Promise.all([
        db
          .select(apptSelect)
          .from(appointments)
          .where(and(scoped, sql`${appointments.startsAt} >= now()`, inArray(appointments.status, [...UPCOMING_STATUSES].filter((s) => s !== "pending_payment"))))
          .orderBy(asc(appointments.startsAt))
          .limit(5),
        db
          .select(apptSelect)
          .from(appointments)
          .where(and(scoped, sql`${appointments.startsAt} < now()`, sql`${appointments.status} <> 'pending_payment'`))
          .orderBy(desc(appointments.startsAt))
          .limit(5),
      ])
    : [[], []];
  const canSeeClient = m.permissions.has("customers.view");
  return {
    client: client
      ? {
          id: client.id,
          name: client.name,
          email: canSeeClient ? client.email : null,
          phone: canSeeClient ? client.phone : null,
          completedCount: client.completedCount,
          noShowCount: client.noShowCount,
          cancelledCount: client.cancelledCount,
          tags: client.tags,
          firstVisitAt: client.firstVisitAt,
          lastVisitAt: client.lastVisitAt,
        }
      : null,
    canSeeClient,
    upcoming,
    past,
  };
}

export async function unreadMessageCount(viewer: Viewer, m: Membership | null) {
  const [c] = await db
    .select({ n: sql<number>`count(*)::int` })
    .from(conversations)
    .where(
      and(
        isNotNull(conversations.lastMessagePreview),
        or(
          and(eq(conversations.customerUserId, viewer.id), unreadFor("customer")),
          m && m.permissions.has("messages.manage")
            ? and(eq(conversations.businessId, m.businessId), unreadFor("business"))
            : sql`false`,
        ),
      ),
    );
  return c?.n ?? 0;
}

/**
 * An appointment the composer may link ("About your booking …"), only if it is
 * between this business and this customer.
 */
export async function appointmentRef(businessId: string, customerUserId: string, appointmentId: string) {
  const [a] = await db
    .select({ id: appointments.id, reference: appointments.reference, status: appointments.status, startsAt: appointments.startsAt, timezone: appointments.timezone, serviceName: sql<string>`${appointments.snapshot}->>'serviceName'` })
    .from(appointments)
    .where(and(eq(appointments.id, appointmentId), eq(appointments.businessId, businessId), eq(appointments.customerUserId, customerUserId)));
  return a ? { ...a, startsAt: a.startsAt.toISOString() } : null;
}

/** Business header info for a new customer conversation. */
export async function messageableBusiness(businessId: string) {
  const [b] = await db.select({ id: businesses.id, name: businesses.name, slug: businesses.slug, status: businesses.status, timezone: businesses.timezone, logoMediaId: businesses.logoMediaId, ownerUserId: businesses.ownerUserId }).from(businesses).where(eq(businesses.id, businessId));
  if (!b || b.status !== "active") return null;
  const media = await getMediaMap([b.logoMediaId]);
  return { ...b, logo: b.logoMediaId ? (media.get(b.logoMediaId) ?? null) : null };
}
