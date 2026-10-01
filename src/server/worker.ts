import "server-only";
import { and, eq, inArray, sql } from "drizzle-orm";
import { formatMoney } from "@/domain/money";
import { localMinuteToInstant } from "@/domain/time";
import { db } from "./db/client";
import { appointments, businesses, jobs, notifications, reviews, waitlistEntries, webhookEvents } from "./db/schema";
import { sendEmail } from "./email";
import { formatWhen, formatTimeOnly } from "./format";
import { claimJobs, completeJob, failJob, type JobType } from "./jobs";
import { log } from "./logger";
import { notify } from "./notify";
import { pruneRateLimits } from "./rate-limit";
import { pruneExpiredSessions } from "./auth/session";
import { sendSms } from "./sms";
import { expireHold, expireRequest } from "./services/booking";
import { getSlots } from "./services/availability";

type Handler = (payload: Record<string, unknown>) => Promise<void>;

const handlers: Record<JobType, Handler> = {
  "email.send": async (p) => {
    await sendEmail({ to: String(p.to), subject: String(p.subject), html: String(p.html), text: String(p.text), template: String(p.template), userId: (p.userId as string) ?? null });
  },
  "sms.send": async (p) => {
    await sendSms(String(p.to), String(p.body), String(p.template), (p.userId as string) ?? null);
  },
  "appointment.expire_hold": async (p) => {
    const { paymentStateForHold } = await import("./services/payments");
    const res = await expireHold(String(p.appointmentId), { paymentCheck: paymentStateForHold });
    if (res === "processing" || res === "not_due") throw new Error(`hold ${res}; retry later`);
  },
  "appointment.expire_request": async (p) => {
    await expireRequest(String(p.appointmentId));
  },
  "appointment.reminder": async (p) => {
    const [row] = await db
      .select({ a: appointments, businessName: businesses.name })
      .from(appointments)
      .innerJoin(businesses, eq(businesses.id, appointments.businessId))
      .where(eq(appointments.id, String(p.appointmentId)));
    // Stale reminders (rescheduled or cancelled appointments) are dropped.
    if (!row || row.a.status !== "confirmed" || row.a.startsAt.toISOString() !== p.startsAt || !row.a.customerUserId) return;
    const a = row.a;
    const minutes = Number(p.offsetMinutes);
    const lead = minutes >= 1440 ? "tomorrow" : minutes >= 60 ? `in ${Math.round(minutes / 60)} hour${minutes >= 120 ? "s" : ""}` : `in ${minutes} minutes`;
    await notify(a.customerUserId!, {
      topic: "reminders",
      type: "appointment.reminder",
      title: `Reminder: ${a.snapshot.serviceName} ${lead}`,
      body: `${formatWhen(a.startsAt, a.timezone)} with ${row.businessName}`,
      href: `/bookings/${a.id}`,
      email: {
        subject: `Reminder: ${a.snapshot.serviceName} ${lead} at ${formatTimeOnly(a.startsAt, a.timezone)}`,
        heading: `See you ${lead}`,
        details: [
          ["Service", a.snapshot.serviceName],
          ["When", formatWhen(a.startsAt, a.timezone)],
          ["With", row.businessName],
          ...(a.snapshot.address ? ([["Where", a.snapshot.address]] as [string, string][]) : []),
          ...(a.totalCents - a.amountPaidCents > 0 && !a.isEstimate ? ([["Balance due", formatMoney(a.totalCents - a.amountPaidCents, a.currency)]] as [string, string][]) : []),
        ],
        cta: { label: "View appointment", url: `/bookings/${a.id}` },
        footnote: "Running late or can't make it? Let the business know from the appointment page.",
      },
      sms: `Reminder: ${a.snapshot.serviceName} with ${row.businessName} ${formatWhen(a.startsAt, a.timezone)}.`,
      dedupeKey: `reminder:${a.id}:${minutes}:${a.startsAt.getTime()}`,
    });
  },
  "appointment.review_request": async (p) => {
    const [row] = await db
      .select({ a: appointments, businessName: businesses.name })
      .from(appointments)
      .innerJoin(businesses, eq(businesses.id, appointments.businessId))
      .where(eq(appointments.id, String(p.appointmentId)));
    if (!row || row.a.status !== "completed" || !row.a.customerUserId) return;
    const [existing] = await db.select({ id: reviews.id }).from(reviews).where(eq(reviews.appointmentId, row.a.id));
    if (existing) return;
    await notify(row.a.customerUserId, {
      topic: "reviews",
      type: "review.request",
      title: `How was ${row.a.snapshot.serviceName}?`,
      body: `Share a quick review of ${row.businessName}.`,
      href: `/bookings/${row.a.id}?review=1`,
      email: {
        subject: `How was your visit to ${row.businessName}?`,
        heading: "How did it go?",
        paragraphs: [`Your review helps ${row.businessName} and others choosing a professional. It takes less than a minute.`],
        cta: { label: "Leave a review", url: `/bookings/${row.a.id}?review=1` },
      },
      dedupeKey: `review-request:${row.a.id}`,
    });
  },
  "waitlist.check": async (p) => {
    const businessId = String(p.businessId);
    const serviceId = String(p.serviceId);
    const date = String(p.date);
    const entries = await db
      .select()
      .from(waitlistEntries)
      .where(and(eq(waitlistEntries.serviceId, serviceId), eq(waitlistEntries.date, date), eq(waitlistEntries.status, "active")))
      .orderBy(waitlistEntries.createdAt)
      .limit(50);
    if (!entries.length) return;
    const [biz] = await db.select({ name: businesses.name, slug: businesses.slug }).from(businesses).where(eq(businesses.id, businessId));
    // Group by preferred member to minimise slot queries.
    const cache = new Map<string, Awaited<ReturnType<typeof getSlots>>>();
    for (const e of entries) {
      const key = e.memberId ?? "any";
      if (!cache.has(key)) {
        try {
          cache.set(key, await getSlots({ serviceId, memberId: key, fromDate: date, toDate: date, optionIds: [] }));
        } catch {
          continue;
        }
      }
      const res = cache.get(key)!;
      const dayStart = localMinuteToInstant(date, e.earliestMinute, res.timezone)!;
      const dayEnd = localMinuteToInstant(date, Math.min(e.latestMinute, 1440), res.timezone)!;
      const match = res.days[0]?.slots.find((s) => {
        const t = new Date(s.start).getTime();
        return t >= dayStart && t <= dayEnd;
      });
      if (!match) continue;
      // Mark first so a parallel worker can't notify twice.
      const claimed = await db
        .update(waitlistEntries)
        .set({ status: "notified", notifiedAt: new Date() })
        .where(and(eq(waitlistEntries.id, e.id), eq(waitlistEntries.status, "active")))
        .returning({ id: waitlistEntries.id });
      if (!claimed.length) continue;
      const when = formatWhen(new Date(match.start), res.timezone);
      const href = `/${biz.slug}/book?service=${serviceId}&date=${date}`;
      await notify(e.customerUserId, {
        topic: "waitlist",
        type: "waitlist.opening",
        title: `A spot opened at ${biz.name}`,
        body: `${when} is now available. Book quickly — first come, first served.`,
        href,
        email: {
          subject: `A time opened up at ${biz.name}`,
          heading: "Good news — a time opened up",
          paragraphs: [`${when} just became available. Spots are first come, first served, so book soon if it works for you.`],
          cta: { label: "Book this time", url: href },
        },
        dedupeKey: `waitlist:${e.id}`,
      });
    }
  },
  "media.process_video": async (p) => {
    const { processVideo } = await import("./services/media");
    await processVideo(String(p.mediaId));
  },
  "maintenance.prune": async () => {
    await pruneExpiredSessions();
    await pruneRateLimits();
    await db.delete(jobs).where(and(inArray(jobs.status, ["done", "cancelled"]), sql`${jobs.createdAt} < now() - interval '14 days'`));
    await db.delete(notifications).where(sql`${notifications.createdAt} < now() - interval '180 days'`);
    await db.delete(webhookEvents).where(sql`${webhookEvents.processedAt} < now() - interval '90 days'`);
    await db
      .update(waitlistEntries)
      .set({ status: "expired" })
      .where(and(inArray(waitlistEntries.status, ["active", "notified"]), sql`${waitlistEntries.date} < (now() at time zone 'utc')::date - 1`));
  },
};

/** Processes one batch of ready jobs. Returns the number handled. */
export async function runJobsOnce(limit = 20): Promise<number> {
  const batch = await claimJobs(limit);
  for (const job of batch) {
    const handler = handlers[job.type];
    try {
      if (!handler) throw new Error(`No handler for ${job.type}`);
      await handler(job.payload);
      await completeJob(job.id);
    } catch (err) {
      await failJob(job, err);
    }
  }
  return batch.length;
}

export async function runUntilEmpty(maxRounds = 50) {
  let total = 0;
  for (let i = 0; i < maxRounds; i++) {
    const n = await runJobsOnce();
    total += n;
    if (n === 0) break;
  }
  return total;
}

export { log };
