import "server-only";
import { and, eq, inArray } from "drizzle-orm";
import { formatMoney } from "@/domain/money";
import type { Executor } from "../db/client";
import { appointments, businessMembers, businesses, conversations, messages } from "../db/schema";
import { formatWhen } from "../format";
import { enqueue } from "../jobs";
import { notify } from "../notify";

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

function details(a: Appt, businessName?: string): [string, string][] {
  const out: [string, string][] = [
    ["Service", a.snapshot.serviceName],
    ["When", formatWhen(a.startsAt, a.timezone)],
  ];
  if (businessName) out.push(["With", a.snapshot.memberName ? `${a.snapshot.memberName} · ${businessName}` : businessName]);
  if (a.snapshot.address) out.push(["Where", a.snapshot.address]);
  else if (a.snapshot.locationKind === "virtual") out.push(["Where", "Online — the link will be shared by the business"]);
  out.push(["Reference", a.reference]);
  return out;
}

/** Business-side recipients: the assigned professional and the owner (deduplicated). */
function businessRecipients(c: Awaited<ReturnType<typeof context>>): string[] {
  return [...new Set([c.memberUserId, c.ownerUserId].filter((x): x is string => Boolean(x)))];
}

/** Appends a system message to the customer↔business thread, if one exists or a customer account is attached. */
export async function systemMessage(tx: Executor, a: Appt, body: string) {
  if (!a.customerUserId) return;
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
  if (a.customerUserId) {
    if (a.status === "confirmed") {
      await notify(
        a.customerUserId,
        {
          topic: "bookings",
          type: "appointment.confirmed",
          title: `You're booked with ${c.businessName}`,
          body: `${a.snapshot.serviceName} · ${formatWhen(a.startsAt, a.timezone)}`,
          href,
          email: {
            subject: `Confirmed: ${a.snapshot.serviceName} with ${c.businessName}`,
            preheader: formatWhen(a.startsAt, a.timezone),
            heading: "Your appointment is confirmed",
            details: [
              ...details(a, c.businessName),
              ...(a.amountPaidCents > 0 ? ([["Paid", formatMoney(a.amountPaidCents, a.currency)]] as [string, string][]) : []),
            ],
            cta: { label: "View appointment", url: href },
            footnote: "Need to change plans? You can reschedule or cancel from the appointment page, subject to the business's policy.",
          },
          sms: `Kept: ${a.snapshot.serviceName} with ${c.businessName} is confirmed for ${formatWhen(a.startsAt, a.timezone)}. Ref ${a.reference}`,
          dedupeKey: `confirmed:${a.id}:${a.startsAt.getTime()}`,
        },
        tx,
      );
      await scheduleReminders(tx, a, c.reminders);
      await systemMessage(tx, a, `Appointment confirmed: ${a.snapshot.serviceName}, ${formatWhen(a.startsAt, a.timezone)}.`);
    } else if (a.status === "requested") {
      await notify(
        a.customerUserId,
        {
          topic: "bookings",
          type: "appointment.requested",
          title: `Request sent to ${c.businessName}`,
          body: `We'll let you know as soon as they respond.`,
          href,
          email: {
            subject: `Request sent: ${a.snapshot.serviceName} with ${c.businessName}`,
            heading: "Your request has been sent",
            paragraphs: [`${c.businessName} reviews requests before confirming. We'll email you as soon as they respond.`],
            details: details(a, c.businessName),
            cta: { label: "View request", url: href },
          },
          dedupeKey: `requested:${a.id}`,
        },
        tx,
      );
    }
  }
  for (const userId of businessRecipients(c)) {
    const isRequest = a.status === "requested";
    await notify(
      userId,
      {
        topic: "business",
        type: isRequest ? "business.request_received" : "business.new_booking",
        title: isRequest ? `New booking request` : `New booking`,
        body: `${a.snapshot.serviceName} · ${formatWhen(a.startsAt, a.timezone)}`,
        href: `/pro/appointments/${a.id}`,
        email: {
          subject: isRequest ? `New request: ${a.snapshot.serviceName}` : `New booking: ${a.snapshot.serviceName}`,
          heading: isRequest ? "You have a new booking request" : "You have a new booking",
          paragraphs: isRequest ? ["Approve or decline it from your calendar. Unanswered requests expire automatically."] : [],
          details: details(a),
          cta: { label: isRequest ? "Review request" : "Open appointment", url: `/pro/appointments/${a.id}` },
        },
        dedupeKey: `biz-booked:${a.id}:${userId}:${a.status}`,
      },
      tx,
    );
  }
}

export async function onCancelled(tx: Executor, appointmentId: string, by: "customer" | "business" | "system", refundCents: number) {
  const c = await context(tx, appointmentId);
  const a = c.a;
  const when = formatWhen(a.startsAt, a.timezone);
  if (a.customerUserId && by !== "customer") {
    const declined = a.status === "declined";
    const expired = a.status === "expired";
    await notify(
      a.customerUserId,
      {
        topic: "bookings",
        type: declined ? "appointment.declined" : expired ? "appointment.expired" : "appointment.cancelled",
        title: declined ? `${c.businessName} couldn't take your request` : expired ? "Your booking expired" : `${c.businessName} cancelled your appointment`,
        body: `${a.snapshot.serviceName} · ${when}`,
        href: `/bookings/${a.id}`,
        email: {
          subject: declined ? `Request declined: ${a.snapshot.serviceName}` : expired ? "Your booking expired" : `Cancelled: ${a.snapshot.serviceName}`,
          heading: declined ? "Your request wasn't accepted" : expired ? "Your booking expired" : "Your appointment was cancelled",
          paragraphs: [
            ...(a.cancellationReason ? [`Note from the business: “${a.cancellationReason}”`] : []),
            ...(refundCents > 0 ? [`A refund of ${formatMoney(refundCents, a.currency)} is on its way to your original payment method.`] : []),
            "You can book another time whenever you're ready.",
          ],
          details: details(a, c.businessName),
          cta: { label: "Find another time", url: `/${c.businessSlug}` },
        },
        dedupeKey: `cancelled:${a.id}`,
      },
      tx,
    );
  }
  if (by !== "business") {
    for (const userId of businessRecipients(c)) {
      await notify(
        userId,
        {
          topic: "business",
          type: "business.cancelled",
          title: by === "system" ? "A booking expired" : "A customer cancelled",
          body: `${a.snapshot.serviceName} · ${when}`,
          href: `/pro/appointments/${a.id}`,
          email:
            by === "customer"
              ? {
                  subject: `Cancelled: ${a.snapshot.serviceName} · ${when}`,
                  heading: "An appointment was cancelled",
                  paragraphs: a.cancellationReason ? [`Reason: “${a.cancellationReason}”`] : [],
                  details: details(a),
                  cta: { label: "Open calendar", url: "/pro/calendar" },
                }
              : undefined,
          dedupeKey: `biz-cancelled:${a.id}:${userId}`,
        },
        tx,
      );
    }
  }
  await systemMessage(tx, a, `Appointment ${a.status === "declined" ? "declined" : a.status === "expired" ? "expired" : "cancelled"}: ${a.snapshot.serviceName}, ${when}.`);
}

export async function onRescheduled(tx: Executor, appointmentId: string, by: "customer" | "business", previousStart: Date) {
  const c = await context(tx, appointmentId);
  const a = c.a;
  const when = formatWhen(a.startsAt, a.timezone);
  const before = formatWhen(previousStart, a.timezone);
  if (a.customerUserId && by === "business") {
    await notify(
      a.customerUserId,
      {
        topic: "bookings",
        type: "appointment.rescheduled",
        title: `${c.businessName} moved your appointment`,
        body: `Now ${when}`,
        href: `/bookings/${a.id}`,
        email: {
          subject: `New time: ${a.snapshot.serviceName} with ${c.businessName}`,
          heading: "Your appointment has a new time",
          paragraphs: [`Previously ${before}.`, "If the new time doesn't work, you can reschedule or cancel from the appointment page."],
          details: details(a, c.businessName),
          cta: { label: "View appointment", url: `/bookings/${a.id}` },
        },
        dedupeKey: `rescheduled:${a.id}:${a.startsAt.getTime()}`,
      },
      tx,
    );
  }
  if (by === "customer") {
    for (const userId of businessRecipients(c)) {
      await notify(
        userId,
        {
          topic: "business",
          type: "business.rescheduled",
          title: "A customer rescheduled",
          body: `${a.snapshot.serviceName} · ${before} → ${when}`,
          href: `/pro/appointments/${a.id}`,
          email: {
            subject: `Rescheduled: ${a.snapshot.serviceName}`,
            heading: "An appointment was rescheduled",
            paragraphs: [`Previously ${before}.`],
            details: details(a),
            cta: { label: "Open appointment", url: `/pro/appointments/${a.id}` },
          },
          dedupeKey: `biz-rescheduled:${a.id}:${a.startsAt.getTime()}:${userId}`,
        },
        tx,
      );
    }
  }
  if (a.status === "confirmed") await scheduleReminders(tx, a, c.reminders);
  await systemMessage(tx, a, `Appointment moved from ${before} to ${when}.`);
}

export async function onApprovedNeedsPayment(tx: Executor, appointmentId: string) {
  const c = await context(tx, appointmentId);
  const a = c.a;
  if (!a.customerUserId) return;
  await notify(
    a.customerUserId,
    {
      topic: "bookings",
      type: "appointment.approved_payment_due",
      title: `${c.businessName} accepted your request`,
      body: `Pay the ${formatMoney(a.depositDueCents, a.currency)} deposit to confirm.`,
      href: `/bookings/${a.id}`,
      email: {
        subject: `Accepted — confirm your ${a.snapshot.serviceName}`,
        heading: "Your request was accepted",
        paragraphs: [`Pay the ${formatMoney(a.depositDueCents, a.currency)} deposit to lock in your time. Unpaid bookings are released automatically.`],
        details: details(a, c.businessName),
        cta: { label: "Pay deposit", url: `/bookings/${a.id}` },
      },
      dedupeKey: `approved-pay:${a.id}`,
    },
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
