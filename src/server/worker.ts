import "server-only";
import { and, eq, inArray, sql } from "drizzle-orm";
import { localMinuteToInstant } from "@/domain/time";
import { db } from "./db/client";
import { appointments, businesses, jobs, notifications, reviews, waitlistEntries, webhookEvents } from "./db/schema";
import { sendEmail } from "./email";
import { formatTimeOnly } from "./format";
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
    const balance = a.totalCents - a.amountPaidCents > 0 && !a.isEstimate ? a.totalCents - a.amountPaidCents : 0;
    await notify(a.customerUserId!, (l) => {
      // "tomorrow" / "in 2 hours" / "dentro de 2 horas" straight from Intl, in the recipient's language.
      const rtf = new Intl.RelativeTimeFormat(l.intl, { numeric: "auto" });
      const lead = minutes >= 1440 ? rtf.format(1, "day") : minutes >= 60 ? rtf.format(Math.round(minutes / 60), "hour") : rtf.format(minutes, "minute");
      const vars = { service: a.snapshot.serviceName, business: row.businessName, lead, when: l.when(a.startsAt, a.timezone), time: formatTimeOnly(a.startsAt, a.timezone, l.intl) };
      return {
        topic: "reminders",
        type: "appointment.reminder",
        title: l.t("email.reminder.title", vars),
        body: l.t("email.reminder.body", vars),
        href: `/bookings/${a.id}`,
        email: {
          subject: l.t("email.reminder.subject", vars),
          heading: l.t("email.reminder.heading", vars),
          details: [
            [l.t("email.details.service"), a.snapshot.serviceName],
            [l.t("email.details.when"), vars.when],
            [l.t("email.details.with"), row.businessName],
            ...(a.snapshot.address ? ([[l.t("email.details.where"), a.snapshot.address]] as [string, string][]) : []),
            ...(balance ? ([[l.t("email.details.balanceDue"), l.money(balance, a.currency)]] as [string, string][]) : []),
          ],
          cta: { label: l.t("email.cta.viewAppointment"), url: `/bookings/${a.id}` },
          footnote: l.t("email.reminder.footnote"),
        },
        sms: l.t("email.reminder.sms", vars),
        dedupeKey: `reminder:${a.id}:${minutes}:${a.startsAt.getTime()}`,
      };
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
    const vars = { service: row.a.snapshot.serviceName, business: row.businessName };
    await notify(row.a.customerUserId, (l) => ({
      topic: "reviews",
      type: "review.request",
      title: l.t("email.review.title", vars),
      body: l.t("email.review.body", vars),
      href: `/bookings/${row.a.id}?review=1`,
      email: {
        subject: l.t("email.review.subject", vars),
        heading: l.t("email.review.heading"),
        paragraphs: [l.t("email.review.paragraph", vars)],
        cta: { label: l.t("email.cta.leaveReview"), url: `/bookings/${row.a.id}?review=1` },
      },
      dedupeKey: `review-request:${row.a.id}`,
    }));
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
      const href = `/${biz.slug}/book?service=${serviceId}&date=${date}`;
      await notify(e.customerUserId, (l) => {
        const vars = { business: biz.name, when: l.when(new Date(match.start), res.timezone) };
        return {
          topic: "waitlist",
          type: "waitlist.opening",
          title: l.t("email.waitlist.title", vars),
          body: l.t("email.waitlist.body", vars),
          href,
          email: {
            subject: l.t("email.waitlist.subject", vars),
            heading: l.t("email.waitlist.heading"),
            paragraphs: [l.t("email.waitlist.paragraph", vars)],
            cta: { label: l.t("email.cta.bookThisTime"), url: href },
          },
          dedupeKey: `waitlist:${e.id}`,
        };
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
