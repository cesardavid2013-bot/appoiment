import "server-only";
import { and, eq, inArray } from "drizzle-orm";
import type { Executor } from "../db/client";
import { appointments, businessMembers, businesses, conversations, messages, users } from "../db/schema";
import { enqueue } from "../jobs";
import { langFor, notify, type Lang } from "../notify";

type Appt = typeof appointments.$inferSelect;

async function context(tx: Executor, appointmentId: string) {
  const [row] = await tx
    .select({ a: appointments, businessName: businesses.name, businessSlug: businesses.slug, ownerUserId: businesses.ownerUserId, reminders: businesses.reminderOffsetsMinutes })
    .from(appointments)
    .innerJoin(businesses, eq(businesses.id, appointments.businessId))
    .where(eq(appointments.id, appointmentId));
  if (!row) throw new Error(`appointment ${appointmentId} not found`);
  let memberUserId: string | null = null;
  if (row.a.memberId) {
    const [m] = await tx.select({ userId: businessMembers.userId }).from(businessMembers).where(eq(businessMembers.id, row.a.memberId));
    memberUserId = m?.userId ?? null;
  }
  return { ...row, memberUserId };
}

function details(l: Lang, a: Appt, businessName?: string): [string, string][] {
  const t = l.t;
  const out: [string, string][] = [
    [t("email.details.service"), a.snapshot.serviceName],
    [t("email.details.when"), l.when(a.startsAt, a.timezone)],
  ];
  if (businessName) out.push([t("email.details.with"), a.snapshot.memberName ? `${a.snapshot.memberName} · ${businessName}` : businessName]);
  if (a.snapshot.address) out.push([t("email.details.where"), a.snapshot.address]);
  else if (a.snapshot.locationKind === "virtual") out.push([t("email.details.where"), t("email.details.online")]);
  out.push([t("email.details.reference"), a.reference]);
  return out;
}

/** Business-side recipients: the assigned professional and the owner (deduplicated). */
function businessRecipients(c: Awaited<ReturnType<typeof context>>): string[] {
  return [...new Set([c.memberUserId, c.ownerUserId].filter((x): x is string => Boolean(x)))];
}

/** Appends a system message to the customer↔business thread, if one exists or a customer account is attached. */
export async function systemMessage(tx: Executor, a: Appt, text: string | ((l: Lang) => string)) {
  if (!a.customerUserId) return;
  let body = typeof text === "string" ? text : "";
  if (typeof text === "function") {
    // Thread lines are read by both sides; they're written in the customer's language.
    const [u] = await tx.select({ locale: users.locale }).from(users).where(eq(users.id, a.customerUserId));
    body = text(await langFor(u?.locale));
  }
  const [conv] = await tx
    .insert(conversations)
    .values({ businessId: a.businessId, customerUserId: a.customerUserId, lastMessagePreview: body.slice(0, 140) })
    .onConflictDoUpdate({
      target: [conversations.businessId, conversations.customerUserId],
      set: { lastMessageAt: new Date(), lastMessagePreview: body.slice(0, 140) },
    })
    .returning({ id: conversations.id });
  await tx.insert(messages).values({ conversationId: conv.id, senderRole: "system", body, appointmentId: a.id });
}

export async function scheduleReminders(tx: Executor, a: Appt, offsets: number[]) {
  const now = Date.now();
  for (const minutes of offsets) {
    const runAt = new Date(a.startsAt.getTime() - minutes * 60_000);
    if (runAt.getTime() <= now + 5 * 60_000) continue;
    await enqueue(
      "appointment.reminder",
      { appointmentId: a.id, startsAt: a.startsAt.toISOString(), offsetMinutes: minutes },
      { tx, runAt, dedupeKey: `reminder:${a.id}:${minutes}:${a.startsAt.getTime()}` },
    );
  }
}

export async function onBooked(tx: Executor, appointmentId: string) {
  const c = await context(tx, appointmentId);
  const a = c.a;
  const href = `/bookings/${a.id}`;
  const vars = { service: a.snapshot.serviceName, business: c.businessName };
  if (a.customerUserId) {
    if (a.status === "confirmed") {
      await notify(
        a.customerUserId,
        (l) => ({
          topic: "bookings",
          type: "appointment.confirmed",
          title: l.t("email.booked.title", vars),
          body: `${a.snapshot.serviceName} · ${l.when(a.startsAt, a.timezone)}`,
          href,
          email: {
            subject: l.t("email.booked.subject", vars),
            preheader: l.when(a.startsAt, a.timezone),
            heading: l.t("email.booked.heading"),
            details: [...details(l, a, c.businessName), ...(a.amountPaidCents > 0 ? ([[l.t("email.details.paid"), l.money(a.amountPaidCents, a.currency)]] as [string, string][]) : [])],
            cta: { label: l.t("email.cta.viewAppointment"), url: href },
            footnote: l.t("email.booked.footnote"),
          },
          sms: l.t("email.booked.sms", { ...vars, when: l.when(a.startsAt, a.timezone), reference: a.reference }),
          dedupeKey: `confirmed:${a.id}:${a.startsAt.getTime()}`,
        }),
        tx,
      );
      await scheduleReminders(tx, a, c.reminders);
      await systemMessage(tx, a, (l) => l.t("email.thread.confirmed", { service: a.snapshot.serviceName, when: l.when(a.startsAt, a.timezone) }));
    } else if (a.status === "requested") {
      await notify(
        a.customerUserId,
        (l) => ({
          topic: "bookings",
          type: "appointment.requested",
          title: l.t("email.requested.title", vars),
          body: l.t("email.requested.body"),
          href,
          email: {
            subject: l.t("email.requested.subject", vars),
            heading: l.t("email.requested.heading"),
            paragraphs: [l.t("email.requested.paragraph", vars)],
            details: details(l, a, c.businessName),
            cta: { label: l.t("email.cta.viewRequest"), url: href },
          },
          dedupeKey: `requested:${a.id}`,
        }),
        tx,
      );
    }
  }
  for (const userId of businessRecipients(c)) {
    const isRequest = a.status === "requested";
    await notify(
      userId,
      (l) => ({
        topic: "business",
        type: isRequest ? "business.request_received" : "business.new_booking",
        title: l.t(isRequest ? "email.bizBooked.requestTitle" : "email.bizBooked.title"),
        body: `${a.snapshot.serviceName} · ${l.when(a.startsAt, a.timezone)}`,
        href: `/pro/appointments/${a.id}`,
        email: {
          subject: l.t(isRequest ? "email.bizBooked.requestSubject" : "email.bizBooked.subject", vars),
          heading: l.t(isRequest ? "email.bizBooked.requestHeading" : "email.bizBooked.heading"),
          paragraphs: isRequest ? [l.t("email.bizBooked.requestParagraph")] : [],
          details: details(l, a),
          cta: { label: l.t(isRequest ? "email.cta.reviewRequest" : "email.cta.openAppointment"), url: `/pro/appointments/${a.id}` },
        },
        dedupeKey: `biz-booked:${a.id}:${userId}:${a.status}`,
      }),
      tx,
    );
  }
}

export async function onCancelled(tx: Executor, appointmentId: string, by: "customer" | "business" | "system", refundCents: number) {
  const c = await context(tx, appointmentId);
  const a = c.a;
  const vars = { service: a.snapshot.serviceName, business: c.businessName };
  const kind = a.status === "declined" ? "declined" : a.status === "expired" ? "expired" : "cancelled";
  if (a.customerUserId && by !== "customer") {
    await notify(
      a.customerUserId,
      (l) => ({
        topic: "bookings",
        type: `appointment.${kind}`,
        title: l.t(`email.cancelled.${kind}.title`, vars),
        body: `${a.snapshot.serviceName} · ${l.when(a.startsAt, a.timezone)}`,
        href: `/bookings/${a.id}`,
        email: {
          subject: l.t(`email.cancelled.${kind}.subject`, vars),
          heading: l.t(`email.cancelled.${kind}.heading`),
          paragraphs: [
            ...(a.cancellationReason ? [l.t("email.cancelled.note", { note: a.cancellationReason })] : []),
            ...(refundCents > 0 ? [l.t("email.cancelled.refund", { amount: l.money(refundCents, a.currency) })] : []),
            l.t("email.cancelled.bookAgain"),
          ],
          details: details(l, a, c.businessName),
          cta: { label: l.t("email.cta.findAnotherTime"), url: `/${c.businessSlug}` },
        },
        dedupeKey: `cancelled:${a.id}`,
      }),
      tx,
    );
  }
  if (by !== "business") {
    for (const userId of businessRecipients(c)) {
      await notify(
        userId,
        (l) => ({
          topic: "business",
          type: "business.cancelled",
          title: l.t(by === "system" ? "email.bizCancelled.expiredTitle" : "email.bizCancelled.title"),
          body: `${a.snapshot.serviceName} · ${l.when(a.startsAt, a.timezone)}`,
          href: `/pro/appointments/${a.id}`,
          email:
            by === "customer"
              ? {
                  subject: l.t("email.bizCancelled.subject", { service: a.snapshot.serviceName, when: l.when(a.startsAt, a.timezone) }),
                  heading: l.t("email.bizCancelled.heading"),
                  paragraphs: a.cancellationReason ? [l.t("email.bizCancelled.reason", { reason: a.cancellationReason })] : [],
                  details: details(l, a),
                  cta: { label: l.t("email.cta.openCalendar"), url: "/pro/calendar" },
                }
              : undefined,
          dedupeKey: `biz-cancelled:${a.id}:${userId}`,
        }),
        tx,
      );
    }
  }
  await systemMessage(tx, a, (l) => l.t(`email.thread.${kind}`, { service: a.snapshot.serviceName, when: l.when(a.startsAt, a.timezone) }));
}

export async function onRescheduled(tx: Executor, appointmentId: string, by: "customer" | "business", previousStart: Date) {
  const c = await context(tx, appointmentId);
  const a = c.a;
  const vars = { service: a.snapshot.serviceName, business: c.businessName };
  if (a.customerUserId && by === "business") {
    await notify(
      a.customerUserId,
      (l) => ({
        topic: "bookings",
        type: "appointment.rescheduled",
        title: l.t("email.rescheduled.title", vars),
        body: l.t("email.rescheduled.body", { when: l.when(a.startsAt, a.timezone) }),
        href: `/bookings/${a.id}`,
        email: {
          subject: l.t("email.rescheduled.subject", vars),
          heading: l.t("email.rescheduled.heading"),
          paragraphs: [l.t("email.rescheduled.previously", { when: l.when(previousStart, a.timezone) }), l.t("email.rescheduled.changeIt")],
          details: details(l, a, c.businessName),
          cta: { label: l.t("email.cta.viewAppointment"), url: `/bookings/${a.id}` },
        },
        dedupeKey: `rescheduled:${a.id}:${a.startsAt.getTime()}`,
      }),
      tx,
    );
  }
  if (by === "customer") {
    for (const userId of businessRecipients(c)) {
      await notify(
        userId,
        (l) => ({
          topic: "business",
          type: "business.rescheduled",
          title: l.t("email.bizRescheduled.title"),
          body: `${a.snapshot.serviceName} · ${l.when(previousStart, a.timezone)} → ${l.when(a.startsAt, a.timezone)}`,
          href: `/pro/appointments/${a.id}`,
          email: {
            subject: l.t("email.bizRescheduled.subject", vars),
            heading: l.t("email.bizRescheduled.heading"),
            paragraphs: [l.t("email.rescheduled.previously", { when: l.when(previousStart, a.timezone) })],
            details: details(l, a),
            cta: { label: l.t("email.cta.openAppointment"), url: `/pro/appointments/${a.id}` },
          },
          dedupeKey: `biz-rescheduled:${a.id}:${a.startsAt.getTime()}:${userId}`,
        }),
        tx,
      );
    }
  }
  if (a.status === "confirmed") await scheduleReminders(tx, a, c.reminders);
  await systemMessage(tx, a, (l) => l.t("email.thread.moved", { from: l.when(previousStart, a.timezone), to: l.when(a.startsAt, a.timezone) }));
}

export async function onApprovedNeedsPayment(tx: Executor, appointmentId: string) {
  const c = await context(tx, appointmentId);
  const a = c.a;
  if (!a.customerUserId) return;
  const vars = { service: a.snapshot.serviceName, business: c.businessName };
  await notify(
    a.customerUserId,
    (l) => ({
      topic: "bookings",
      type: "appointment.approved_payment_due",
      title: l.t("email.approvedPay.title", vars),
      body: l.t("email.approvedPay.body", { amount: l.money(a.depositDueCents, a.currency) }),
      href: `/bookings/${a.id}`,
      email: {
        subject: l.t("email.approvedPay.subject", vars),
        heading: l.t("email.approvedPay.heading"),
        paragraphs: [l.t("email.approvedPay.paragraph", { amount: l.money(a.depositDueCents, a.currency) })],
        details: details(l, a, c.businessName),
        cta: { label: l.t("email.cta.payDeposit"), url: `/bookings/${a.id}` },
      },
      dedupeKey: `approved-pay:${a.id}`,
    }),
    tx,
  );
}

export async function onCompleted(tx: Executor, appointmentId: string) {
  const c = await context(tx, appointmentId);
  const a = c.a;
  if (!a.customerUserId) return;
  await enqueue(
    "appointment.review_request",
    { appointmentId: a.id },
    { tx, runAt: new Date(Date.now() + 2 * 3600_000), dedupeKey: `review-request:${a.id}` },
  );
}

/** In-app + email notification of every active owner/manager — used for alerts like payment conflicts. */
export async function notifyBusinessAdmins(tx: Executor, businessId: string, n: Parameters<typeof notify>[1]) {
  const rows = await tx
    .select({ userId: businessMembers.userId })
    .from(businessMembers)
    .where(and(eq(businessMembers.businessId, businessId), eq(businessMembers.status, "active"), inArray(businessMembers.role, ["owner", "manager"])));
  for (const r of rows) if (r.userId) await notify(r.userId, n, tx);
}
