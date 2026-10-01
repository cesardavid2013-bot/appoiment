import "server-only";
import { and, eq, isNull, sql } from "drizzle-orm";
import { z } from "zod";
import { computeSlots, pickMember } from "@/domain/availability";
import { canTransition, type AppointmentStatus } from "@/domain/appointment-state";
import { AppError, notFound } from "@/domain/errors";
import { formFieldsSchema, validateAnswers, type IntakeAnswer } from "@/domain/forms";
import { checkPromotion, computeQuote, type PromotionInput, type Quote, type SelectedOption } from "@/domain/pricing";
import { businessCancellation, customerCancellation, customerReschedule, describeCancellationPolicy } from "@/domain/policies";
import { instantToLocal } from "@/domain/time";
import { db, type Executor, type Tx } from "../db/client";
import { isTimeConflict, isUniqueViolation } from "../db/errors";
import {
  appointmentEvents,
  appointments,
  businessCustomers,
  groupSessions,
  intakeForms,
  occupancies,
  promotionRedemptions,
  promotions,
  users,
  type AppointmentSnapshot,
} from "../db/schema";
import type { Viewer } from "../auth/session";
import { bookingReference, randomToken } from "../crypto";
import { env, features } from "../env";
import { enqueue } from "../jobs";
import { log } from "../logger";
import { rateLimit } from "../rate-limit";
import { zId, zOptText } from "../http";
import {
  buildSlotQueries,
  candidateMembers,
  loadBookableService,
  resolveLocation,
  selectOptions,
  type BookableService,
} from "./availability";
import { onApprovedNeedsPayment, onBooked, onCancelled, onCompleted, onRescheduled } from "./appointment-notify";

export const HOLD_MINUTES = 15;
const REQUEST_TTL_HOURS = 48;
const UNVERIFIED_UPCOMING_LIMIT = 3;

/* ───────────────────────────── Inputs ───────────────────────────── */

export const quoteSchema = z.object({
  serviceId: zId,
  memberId: z.union([zId, z.literal("any")]).default("any"),
  locationId: zId.nullable().optional(),
  optionIds: z.array(zId).max(40).default([]),
  promoCode: z.string().trim().max(40).nullable().optional(),
});

export const createBookingSchema = quoteSchema.extend({
  start: z.string().datetime({ offset: true }),
  intake: z.record(z.string(), z.unknown()).default({}),
  consent: z.boolean().optional(),
  ageConfirmed: z.boolean().optional(),
  customerNote: zOptText(1000),
  serviceAddress: zOptText(300),
  idempotencyKey: z.string().min(8).max(80),
  source: z.enum(["marketplace", "direct_link"]).default("marketplace"),
});

/* ───────────────────────────── Shared ───────────────────────────── */

type PromoRow = typeof promotions.$inferSelect;

async function findPromotion(exec: Executor, businessId: string, code: string | null | undefined) {
  if (!code) return null;
  const [p] = await exec
    .select()
    .from(promotions)
    .where(and(eq(promotions.businessId, businessId), eq(promotions.code, code.trim())))
    .limit(1);
  return p ?? null;
}

async function customerHistory(exec: Executor, businessId: string, userId: string | null, promoId?: string) {
  if (!userId) return { priorVisits: 0, redemptions: 0 };
  const [bc] = await exec
    .select({ appointments: businessCustomers.appointmentCount, cancelled: businessCustomers.cancelledCount })
    .from(businessCustomers)
    .where(and(eq(businessCustomers.businessId, businessId), eq(businessCustomers.userId, userId)));
  let redemptions = 0;
  if (promoId) {
    const [r] = await exec
      .select({ n: sql<number>`count(*)::int` })
      .from(promotionRedemptions)
      .where(and(eq(promotionRedemptions.promotionId, promoId), eq(promotionRedemptions.customerUserId, userId), isNull(promotionRedemptions.voidedAt)));
    redemptions = r?.n ?? 0;
  }
  return { priorVisits: bc ? bc.appointments - bc.cancelled : 0, redemptions };
}

export function quoteFor(svc: BookableService, selected: SelectedOption[], memberId: string | null, promo: PromotionInput | null): Quote {
  const staff = memberId ? svc.staff.find((s) => s.memberId === memberId) : null;
  return computeQuote({
    currency: svc.business.currency,
    serviceName: svc.service.name,
    service: svc.service,
    staffOverride: staff ? { priceCents: staff.priceCentsOverride, durationMinutes: staff.durationMinutesOverride } : null,
    selected,
    promotion: promo,
    taxRateBps: svc.business.taxRateBps,
    taxLabel: svc.business.taxLabel,
    customerFeeBps: env.PLATFORM_CUSTOMER_FEE_BPS,
    paymentsEnabled: svc.business.paymentsEnabled && features.stripe && Boolean(svc.business.stripeAccountId),
  });
}

function promoInput(p: PromoRow): PromotionInput {
  return { id: p.id, code: p.code, name: p.name, kind: p.kind, value: p.value };
}

function policyOf(svc: BookableService) {
  return {
    cancellationWindowHours: svc.business.cancellationWindowHours,
    rescheduleWindowHours: svc.business.rescheduleWindowHours,
    lateCancelFeePercent: svc.business.lateCancelFeePercent,
    depositRefundable: svc.business.depositRefundable,
  };
}

function needsApproval(svc: BookableService) {
  return svc.service.requiresApproval ?? svc.business.bookingMode === "request";
}

/* ───────────────────────────── Quote ────────────────────────────── */

/**
 * Prices a prospective booking. Used to render the review step; the booking
 * call recomputes everything server-side and never trusts this response.
 */
export async function getQuote(viewer: Viewer | null, input: z.infer<typeof quoteSchema>) {
  const svc = await loadBookableService(input.serviceId);
  const selected = selectOptions(svc, input.optionIds);
  const memberId = input.memberId === "any" ? null : input.memberId;
  let promo: PromotionInput | null = null;
  let promoError: string | null = null;
  if (input.promoCode) {
    const p = await findPromotion(db, svc.business.id, input.promoCode);
    if (!p) promoError = "We couldn't find that code.";
    else {
      const base = quoteFor(svc, selected, memberId, null);
      const hist = await customerHistory(db, svc.business.id, viewer?.id ?? null, p.id);
      const check = checkPromotion(p, {
        now: new Date(),
        serviceId: svc.service.id,
        subtotalCents: base.subtotalCents,
        customerRedemptions: hist.redemptions,
        customerPriorVisits: hist.priorVisits,
      });
      if (check.ok) promo = promoInput(p);
      else promoError = check.reason;
    }
  }
  const quote = quoteFor(svc, selected, memberId, promo);
  return {
    quote,
    promoError,
    requiresApproval: needsApproval(svc),
    policies: describeCancellationPolicy(policyOf(svc)),
    /** Raw rules behind `policies`, so clients can word them in the viewer's language. */
    policy: policyOf(svc),
    latePolicy: svc.business.latePolicy,
    bookingInstructions: svc.service.bookingInstructions ?? svc.business.bookingInstructions,
  };
}

/* ──────────────────────────── Create ────────────────────────────── */

export type BookingResult = {
  appointmentId: string;
  reference: string;
  status: AppointmentStatus;
  dueNowCents: number;
  /** Present when online payment is required to confirm. */
  checkout: { clientSecret: string; publishableKey: string; expiresAt: string } | null;
};

async function loadIntake(svc: BookableService, raw: Record<string, unknown>): Promise<IntakeAnswer[] | null> {
  if (!svc.service.intakeFormId) return null;
  const [form] = await db.select().from(intakeForms).where(eq(intakeForms.id, svc.service.intakeFormId));
  if (!form || form.archivedAt) return null;
  const fields = formFieldsSchema.parse(form.fields);
  const res = validateAnswers(fields, raw);
  if (!res.ok) throw new AppError("validation", "Please answer the required questions.", { fields: Object.fromEntries(Object.entries(res.errors).map(([k, v]) => [`intake.${k}`, v])) });
  return res.answers;
}

export function buildSnapshot(svc: BookableService, selected: SelectedOption[], memberId: string, loc: BookableService["locations"][number] | null, quote: Quote, durationMinutes: number): AppointmentSnapshot {
  const member = svc.staff.find((s) => s.memberId === memberId);
  const address =
    loc && loc.kind === "physical"
      ? [loc.line1, loc.line2, [loc.city, loc.region].filter(Boolean).join(", "), loc.postalCode].filter(Boolean).join(", ")
      : null;
  return {
    serviceName: svc.service.name,
    durationMinutes,
    priceType: svc.service.priceType,
    options: selected.map((o) => ({ groupName: o.groupName, name: o.name, priceDeltaCents: o.priceDeltaCents, durationDeltaMinutes: o.durationDeltaMinutes })),
    memberName: svc.business.kind === "individual" ? null : (member?.displayName ?? null),
    locationName: loc?.name ?? null,
    locationKind: loc?.kind ?? null,
    address,
    ...policyOf(svc),
    noShowFeePercent: svc.business.noShowFeePercent,
    lines: quote.lines,
  };
}

async function upsertBusinessCustomer(tx: Tx, businessId: string, user: { id: string; name: string; email: string | null; phone: string | null }) {
  await tx
    .insert(businessCustomers)
    .values({ businessId, userId: user.id, name: user.name, email: user.email, phone: user.phone })
    .onConflictDoNothing();
  // Row lock serialises concurrent bookings by the same customer at this business (promo limits, aggregates).
  const [bc] = await tx
    .select()
    .from(businessCustomers)
    .where(and(eq(businessCustomers.businessId, businessId), eq(businessCustomers.userId, user.id)))
    .for("update");
  return bc;
}

/** Reserves staff time. Throws slot_unavailable when the exclusion constraint fires. */
async function reserve(
  tx: Tx,
  svc: BookableService,
  args: { appointmentId: string; memberId: string; locationId: string | null; start: Date; end: Date; blockStart: Date; blockEnd: Date },
): Promise<{ groupSessionId: string | null }> {
  if (svc.service.capacity > 1) {
    // Group service: join or create the session, holding a row lock on it.
    await tx
      .insert(groupSessions)
      .values({
        businessId: svc.business.id,
        serviceId: svc.service.id,
        memberId: args.memberId,
        locationId: args.locationId,
        startsAt: args.start,
        endsAt: args.end,
        capacity: svc.service.capacity,
      })
      .onConflictDoNothing();
    const [session] = await tx
      .select()
      .from(groupSessions)
      .where(and(eq(groupSessions.serviceId, svc.service.id), eq(groupSessions.memberId, args.memberId), eq(groupSessions.startsAt, args.start)))
      .for("update");
    if (session.bookedCount >= session.capacity) throw new AppError("slot_unavailable", "That class just filled up. Please choose another time.");
    if (session.bookedCount === 0) {
      await tx
        .insert(occupancies)
        // No ON CONFLICT here: it would also swallow exclusion violations (staff already busy).
        .values({ businessId: svc.business.id, memberId: args.memberId, groupSessionId: session.id, startsAt: args.blockStart, endsAt: args.blockEnd });
    }
    await tx.update(groupSessions).set({ bookedCount: sql`${groupSessions.bookedCount} + 1` }).where(eq(groupSessions.id, session.id));
    return { groupSessionId: session.id };
  }
  await tx.insert(occupancies).values({
    businessId: svc.business.id,
    memberId: args.memberId,
    appointmentId: args.appointmentId,
    startsAt: args.blockStart,
    endsAt: args.blockEnd,
  });
  return { groupSessionId: null };
}

/** Frees staff time for a cancelled/declined/expired appointment. */
async function release(tx: Tx, a: { id: string; groupSessionId: string | null }) {
  if (a.groupSessionId) {
    const [s] = await tx
      .update(groupSessions)
      .set({ bookedCount: sql`greatest(${groupSessions.bookedCount} - 1, 0)` })
      .where(eq(groupSessions.id, a.groupSessionId))
      .returning();
    if (s && s.bookedCount === 0) await tx.delete(occupancies).where(eq(occupancies.groupSessionId, s.id));
  } else {
    await tx.delete(occupancies).where(eq(occupancies.appointmentId, a.id));
  }
}

export async function createBooking(viewer: Viewer, input: z.infer<typeof createBookingSchema>): Promise<BookingResult> {
  // Idempotency: a retried submit returns the original booking instead of a duplicate.
  const [existing] = await db
    .select()
    .from(appointments)
    .where(and(eq(appointments.customerUserId, viewer.id), eq(appointments.idempotencyKey, input.idempotencyKey)));
  if (existing) return resultFor(existing);

  await rateLimit("booking", viewer.id);
  const start = new Date(input.start);
  if (Number.isNaN(start.getTime())) throw new AppError("validation", "Choose a valid time.");

  const svc = await loadBookableService(input.serviceId);
  if (svc.business.ownerUserId === viewer.id) throw new AppError("validation", "You can't book your own business as a customer. Use “New appointment” in your calendar instead.");
  const selected = selectOptions(svc, input.optionIds);
  const loc = resolveLocation(svc, input.locationId);
  if (loc?.kind === "mobile" && !input.serviceAddress)
    throw new AppError("validation", "Add the address where the service should take place.", { fields: { serviceAddress: "Address required" } });
  if (svc.service.consentText && input.consent !== true)
    throw new AppError("validation", "Please accept the terms to continue.", { fields: { consent: "Required" } });
  if (svc.service.minAge && input.ageConfirmed !== true)
    throw new AppError("validation", `Please confirm you are at least ${svc.service.minAge}.`, { fields: { ageConfirmed: "Required" } });
  const intakeAnswers = await loadIntake(svc, input.intake);

  if (!viewer.emailVerified) {
    const [r] = await db
      .select({ n: sql<number>`count(*)::int` })
      .from(appointments)
      .where(
        and(
          eq(appointments.customerUserId, viewer.id),
          sql`${appointments.status} in ('pending_payment','requested','confirmed')`,
          sql`${appointments.startsAt} > now()`,
        ),
      );
    if ((r?.n ?? 0) >= UNVERIFIED_UPCOMING_LIMIT)
      throw new AppError("forbidden", "Please confirm your email address to make more bookings. Check your inbox for the link.");
  }

  const candidates = candidateMembers(svc, selected, loc?.id ?? null, input.memberId);
  if (candidates.length === 0) throw new AppError("slot_unavailable", "No one is available for this service right now.");

  const [userRow] = await db.select({ id: users.id, name: users.name, email: users.email, phone: users.phone }).from(users).where(eq(users.id, viewer.id));
  const tz = loc?.timezone ?? svc.business.timezone;
  const localDate = instantToLocal(start.getTime(), tz).date;

  let created: typeof appointments.$inferSelect;
  try {
    created = await db.transaction(async (tx) => {
      // 1. Re-validate the requested time against fresh data.
      const queries = await buildSlotQueries(
        { svc, selected, locationId: loc?.id ?? null, memberIds: candidates.map((c) => c.memberId), fromDate: localDate, toDate: localDate },
        tx,
      );
      const free = new Set<string>();
      const load = new Map<string, number>();
      for (const q of queries) {
        const day = computeSlots(q)[0];
        for (const m of q.members) load.set(m.memberId, m.busy.length);
        const slot = day?.slots.find((s) => s.start === start.getTime());
        slot?.memberIds.forEach((m) => free.add(m));
      }
      let order = candidates.map((c) => c.memberId).filter((m) => free.has(m));
      if (order.length === 0) throw new AppError("slot_unavailable", "Sorry — that time was just taken. Please pick another.");
      if (input.memberId === "any") {
        const first = pickMember(order, load)!;
        order = [first, ...order.filter((m) => m !== first)];
      }

      // 2. Customer record (locked) and promotion.
      const bc = await upsertBusinessCustomer(tx, svc.business.id, userRow);
      let promo: PromoRow | null = null;
      if (input.promoCode) {
        promo = await findPromotion(tx, svc.business.id, input.promoCode);
        if (!promo) throw new AppError("validation", "We couldn't find that code.", { fields: { promoCode: "Invalid code" } });
        // Lock order is always: customer row → promotion row → staff time. Taking the
        // promotion before any occupancy means a booking never holds staff time while
        // waiting for the code, which is what let two promo bookings deadlock.
        [promo] = await tx.select().from(promotions).where(eq(promotions.id, promo.id)).for("update");
      }

      // 3. Try candidates in order; the exclusion constraint is the final arbiter.
      for (const memberId of order) {
        const quoteBase = quoteFor(svc, selected, memberId, null);
        let promoForQuote: PromotionInput | null = null;
        if (promo) {
          const hist = await customerHistory(tx, svc.business.id, viewer.id, promo.id);
          const check = checkPromotion(promo, {
            now: new Date(),
            serviceId: svc.service.id,
            subtotalCents: quoteBase.subtotalCents,
            customerRedemptions: hist.redemptions,
            customerPriorVisits: hist.priorVisits,
          });
          if (!check.ok) throw new AppError("validation", check.reason, { fields: { promoCode: check.reason } });
          promoForQuote = promoInput(promo);
        }
        const quote = quoteFor(svc, selected, memberId, promoForQuote);
        const end = new Date(start.getTime() + quote.durationMinutes * 60_000);
        const blockStart = new Date(start.getTime() - svc.service.bufferBeforeMinutes * 60_000);
        const blockEnd = new Date(end.getTime() + svc.service.bufferAfterMinutes * 60_000);

        const approval = needsApproval(svc);
        const status: AppointmentStatus = approval ? "requested" : quote.dueNowCents > 0 ? "pending_payment" : "confirmed";
        const paymentStatus = quote.totalCents === 0 && !quote.isEstimate ? "not_required" : quote.dueNowCents > 0 ? "unpaid" : "pay_in_person";

        try {
          return await tx.transaction(async (sp) => {
            const [appt] = await sp
              .insert(appointments)
              .values({
                reference: bookingReference(),
                businessId: svc.business.id,
                locationId: loc?.id ?? null,
                serviceId: svc.service.id,
                memberId,
                customerUserId: viewer.id,
                businessCustomerId: bc.id,
                status,
                source: input.source,
                startsAt: start,
                endsAt: end,
                blockStartsAt: blockStart,
                blockEndsAt: blockEnd,
                timezone: tz,
                selectedOptionIds: selected.map((o) => o.id),
                snapshot: buildSnapshot(svc, selected, memberId, loc, quote, quote.durationMinutes),
                intakeAnswers,
                consentAcceptedAt: svc.service.consentText ? new Date() : null,
                customerNote: input.customerNote,
                serviceAddress: loc?.kind === "mobile" ? input.serviceAddress : null,
                currency: quote.currency,
                subtotalCents: quote.subtotalCents,
                discountCents: quote.discountCents,
                taxCents: quote.taxCents,
                feeCents: quote.feeCents,
                totalCents: quote.totalCents,
                isEstimate: quote.isEstimate,
                depositDueCents: quote.dueNowCents,
                paymentStatus,
                promotionId: quote.promotion?.id ?? null,
                holdExpiresAt: status === "pending_payment" ? new Date(Date.now() + HOLD_MINUTES * 60_000) : null,
                idempotencyKey: input.idempotencyKey,
                confirmedAt: status === "confirmed" ? new Date() : null,
                checkInCode: randomToken(12),
                createdByUserId: viewer.id,
              })
              .returning();
            const { groupSessionId } = await reserve(sp, svc, { appointmentId: appt.id, memberId, locationId: loc?.id ?? null, start, end, blockStart, blockEnd });
            if (groupSessionId) await sp.update(appointments).set({ groupSessionId }).where(eq(appointments.id, appt.id));

            if (quote.promotion) {
              const bumped = await sp
                .update(promotions)
                .set({ redemptionCount: sql`${promotions.redemptionCount} + 1` })
                .where(and(eq(promotions.id, quote.promotion.id), sql`(${promotions.maxRedemptions} is null or ${promotions.redemptionCount} < ${promotions.maxRedemptions})`))
                .returning({ id: promotions.id });
              if (!bumped.length) throw new AppError("validation", "This code has just reached its limit.", { fields: { promoCode: "Limit reached" } });
              await sp.insert(promotionRedemptions).values({ promotionId: quote.promotion.id, appointmentId: appt.id, customerUserId: viewer.id, discountCents: quote.discountCents });
            }
            await sp
              .update(businessCustomers)
              .set({ appointmentCount: sql`${businessCustomers.appointmentCount} + 1`, name: userRow.name, email: userRow.email })
              .where(eq(businessCustomers.id, bc.id));
            await sp.insert(appointmentEvents).values({ appointmentId: appt.id, actorType: "customer", actorUserId: viewer.id, type: "created", toStatus: status });

            if (status === "pending_payment") {
              await enqueue("appointment.expire_hold", { appointmentId: appt.id }, { tx: sp, runAt: new Date(appt.holdExpiresAt!.getTime() + 30_000), dedupeKey: `hold:${appt.id}:1` });
            } else {
              if (status === "requested") {
                const expiry = new Date(Math.min(Date.now() + REQUEST_TTL_HOURS * 3600_000, start.getTime()));
                await enqueue("appointment.expire_request", { appointmentId: appt.id }, { tx: sp, runAt: expiry, dedupeKey: `request:${appt.id}` });
              }
              await onBooked(sp, appt.id);
            }
            return { ...appt, groupSessionId };
          });
        } catch (err) {
          if (isTimeConflict(err)) {
            log.info("booking.member_conflict", { memberId, start: start.toISOString() });
            continue; // savepoint rolled back; try the next available professional
          }
          throw err;
        }
      }
      throw new AppError("slot_unavailable", "Sorry — that time was just taken. Please pick another.");
    });
  } catch (err) {
    if (isUniqueViolation(err)) {
      // Lost an idempotency race against our own duplicate submit.
      const [dup] = await db
        .select()
        .from(appointments)
        .where(and(eq(appointments.customerUserId, viewer.id), eq(appointments.idempotencyKey, input.idempotencyKey)));
      if (dup) return resultFor(dup);
    }
    throw err;
  }

  return resultFor(created);
}

async function resultFor(a: typeof appointments.$inferSelect): Promise<BookingResult> {
  let checkout: BookingResult["checkout"] = null;
  if (a.status === "pending_payment" && a.depositDueCents > a.amountPaidCents) {
    const { startCheckout } = await import("./payments");
    checkout = await startCheckout(a.id);
  }
  return { appointmentId: a.id, reference: a.reference, status: a.status, dueNowCents: a.depositDueCents, checkout };
}

/* ─────────────────────────── Lifecycle ──────────────────────────── */

type Appt = typeof appointments.$inferSelect;

async function lockAppointment(tx: Tx, id: string): Promise<Appt> {
  const [a] = await tx.select().from(appointments).where(eq(appointments.id, id)).for("update");
  if (!a) throw notFound("That appointment");
  return a;
}

async function setStatus(
  tx: Tx,
  a: Appt,
  to: AppointmentStatus,
  actor: { type: "customer" | "business" | "system" | "admin"; userId: string | null },
  patch: Partial<typeof appointments.$inferInsert> = {},
  data?: Record<string, unknown>,
) {
  if (!canTransition(a.status, to)) {
    throw new AppError("conflict", `This appointment is already ${a.status.replace("_", " ")} and can't be changed that way.`);
  }
  const [updated] = await tx
    .update(appointments)
    .set({ status: to, version: sql`${appointments.version} + 1`, ...patch })
    .where(eq(appointments.id, a.id))
    .returning();
  await tx.insert(appointmentEvents).values({ appointmentId: a.id, actorType: actor.type, actorUserId: actor.userId, type: "status", fromStatus: a.status, toStatus: to, data });
  if (to === "cancelled" || to === "declined" || to === "expired") {
    await release(tx, a);
    if (a.promotionId) {
      const voided = await tx
        .update(promotionRedemptions)
        .set({ voidedAt: new Date() })
        .where(and(eq(promotionRedemptions.appointmentId, a.id), isNull(promotionRedemptions.voidedAt)))
        .returning({ id: promotionRedemptions.id });
      if (voided.length) await tx.update(promotions).set({ redemptionCount: sql`greatest(${promotions.redemptionCount} - 1, 0)` }).where(eq(promotions.id, a.promotionId));
    }
    if (to === "cancelled" || to === "declined") {
      await tx.update(businessCustomers).set({ cancelledCount: sql`${businessCustomers.cancelledCount} + 1` }).where(eq(businessCustomers.id, a.businessCustomerId));
    } else {
      // Expired holds never became real appointments for CRM purposes.
      await tx.update(businessCustomers).set({ appointmentCount: sql`greatest(${businessCustomers.appointmentCount} - 1, 0)` }).where(eq(businessCustomers.id, a.businessCustomerId));
    }
    const local = instantToLocal(a.startsAt.getTime(), a.timezone);
    await enqueue("waitlist.check", { businessId: a.businessId, serviceId: a.serviceId, date: local.date }, { tx, runAt: new Date(Date.now() + 5_000) });
  }
  return updated;
}

export async function getCustomerAppointment(viewer: Viewer, id: string) {
  const [a] = await db.select().from(appointments).where(and(eq(appointments.id, id), eq(appointments.customerUserId, viewer.id)));
  if (!a) throw notFound("That appointment");
  return a;
}

export function cancellationPreview(a: Appt, now = new Date()) {
  return customerCancellation(
    {
      status: a.status,
      startsAt: a.startsAt,
      totalCents: a.totalCents,
      depositDueCents: a.depositDueCents,
      amountPaidCents: a.amountPaidCents,
      amountRefundedCents: a.amountRefundedCents,
      rescheduleCount: a.rescheduleCount,
      policy: {
        cancellationWindowHours: a.snapshot.cancellationWindowHours,
        rescheduleWindowHours: a.snapshot.rescheduleWindowHours,
        lateCancelFeePercent: a.snapshot.lateCancelFeePercent,
        depositRefundable: a.snapshot.depositRefundable,
      },
    },
    now,
  );
}

export function reschedulePreview(a: Appt, now = new Date()) {
  return customerReschedule(
    {
      status: a.status,
      startsAt: a.startsAt,
      totalCents: a.totalCents,
      depositDueCents: a.depositDueCents,
      amountPaidCents: a.amountPaidCents,
      amountRefundedCents: a.amountRefundedCents,
      rescheduleCount: a.rescheduleCount,
      policy: {
        cancellationWindowHours: a.snapshot.cancellationWindowHours,
        rescheduleWindowHours: a.snapshot.rescheduleWindowHours,
        lateCancelFeePercent: a.snapshot.lateCancelFeePercent,
        depositRefundable: a.snapshot.depositRefundable,
      },
    },
    now,
  );
}

export async function customerCancel(viewer: Viewer, id: string, reason: string | null) {
  const { refundCents } = await db.transaction(async (tx) => {
    const a = await lockAppointment(tx, id);
    if (a.customerUserId !== viewer.id) throw notFound("That appointment");
    const outcome = cancellationPreview(a);
    if (!outcome.allowed) throw new AppError("conflict", outcome.reason);
    await setStatus(tx, a, "cancelled", { type: "customer", userId: viewer.id }, { cancelledAt: new Date(), cancelledBy: "customer", cancellationReason: reason, holdExpiresAt: null }, {
      isLate: outcome.isLate,
      keptCents: outcome.keptCents,
      refundCents: outcome.refundCents,
    });
    await onCancelled(tx, a.id, "customer", outcome.refundCents);
    return { refundCents: outcome.refundCents };
  });
  if (refundCents > 0) {
    const { refundAppointment } = await import("./payments");
    await refundAppointment(id, refundCents, { reason: "Customer cancellation", actorUserId: viewer.id });
  }
  return { refundCents };
}

export async function businessCancel(actorUserId: string, id: string, businessId: string, reason: string | null, asStatus: "cancelled" | "declined" = "cancelled") {
  const { refundCents } = await db.transaction(async (tx) => {
    const a = await lockAppointment(tx, id);
    if (a.businessId !== businessId) throw notFound("That appointment");
    const { refundCents } = businessCancellation(a);
    await setStatus(tx, a, asStatus, { type: "business", userId: actorUserId }, { cancelledAt: new Date(), cancelledBy: "business", cancellationReason: reason, holdExpiresAt: null });
    await onCancelled(tx, a.id, "business", refundCents);
    return { refundCents };
  });
  if (refundCents > 0) {
    const { refundAppointment } = await import("./payments");
    await refundAppointment(id, refundCents, { reason: asStatus === "declined" ? "Request declined" : "Cancelled by business", actorUserId });
  }
  return { refundCents };
}

export const rescheduleSchema = z.object({
  start: z.string().datetime({ offset: true }),
  memberId: z.union([zId, z.literal("any"), z.literal("same")]).default("same"),
});

/**
 * Moves an appointment. Validates the new time with the appointment's own
 * reservation ignored, then moves the occupancy row — the exclusion constraint
 * still guards against concurrent bookings of the new time.
 */
export async function reschedule(
  actor: { type: "customer" | "business"; userId: string },
  id: string,
  input: z.infer<typeof rescheduleSchema>,
  opts: { businessId?: string; force?: boolean } = {},
) {
  const start = new Date(input.start);
  const result = await db.transaction(async (tx) => {
    const a = await lockAppointment(tx, id);
    if (actor.type === "customer") {
      if (a.customerUserId !== actor.userId) throw notFound("That appointment");
      const ok = reschedulePreview(a);
      if (!ok.allowed) throw new AppError("conflict", ok.reason);
    } else {
      if (a.businessId !== opts.businessId) throw notFound("That appointment");
      if (!["requested", "confirmed", "pending_payment"].includes(a.status)) throw new AppError("conflict", "Only upcoming appointments can be moved.");
    }
    if (a.groupSessionId) throw new AppError("conflict", "Class bookings can't be moved. Cancel and book another session instead.");
    if (start.getTime() === a.startsAt.getTime() && (input.memberId === "same" || input.memberId === a.memberId)) return { a, moved: false };

    const svc = await loadBookableService(a.serviceId, tx, { includeHidden: actor.type === "business" });
    const selected = selectOptions(svc, a.selectedOptionIds);
    const preferred = input.memberId === "same" ? a.memberId! : input.memberId;
    let candidates = candidateMembers(svc, selected, a.locationId, preferred === "any" ? "any" : preferred);
    if (actor.type === "customer") {
      // The booking was priced for its professional. A customer may only move to
      // someone whose price and duration for this selection are identical —
      // otherwise rescheduling would be a way around per-staff pricing.
      const durationMin = Math.round((a.endsAt.getTime() - a.startsAt.getTime()) / 60_000);
      const samePrice = candidates.filter((c) => {
        if (c.memberId === a.memberId) return true;
        const q = quoteFor(svc, selected, c.memberId, null);
        return q.subtotalCents === a.subtotalCents && q.durationMinutes === durationMin;
      });
      if (preferred !== "any" && preferred !== a.memberId && samePrice.length === 0)
        throw new AppError("conflict", "That professional has a different price for this service. Cancel and book with them instead.");
      candidates = samePrice;
    }
    const tz = a.timezone;
    const localDate = instantToLocal(start.getTime(), tz).date;
    const durationMs = a.endsAt.getTime() - a.startsAt.getTime();

    let memberId: string | null = null;
    if (opts.force) {
      memberId = candidates[0]?.memberId ?? null;
    } else {
      const queries = await buildSlotQueries(
        { svc, selected, locationId: a.locationId, memberIds: candidates.map((c) => c.memberId), fromDate: localDate, toDate: localDate, ignoreAppointmentId: a.id, ignoreBookingWindow: actor.type === "business" },
        tx,
      );
      for (const q of queries) {
        q.durationMinutes = Math.round(durationMs / 60_000); // keep the booked duration
        const slot = computeSlots(q)[0]?.slots.find((s) => s.start === start.getTime());
        if (slot) {
          memberId = candidates.map((c) => c.memberId).find((m) => slot.memberIds.includes(m)) ?? null;
          if (memberId) break;
        }
      }
    }
    if (!memberId) throw new AppError("slot_unavailable", "That time isn't available. Please choose another.");

    const end = new Date(start.getTime() + durationMs);
    const blockStart = new Date(start.getTime() - (a.startsAt.getTime() - a.blockStartsAt.getTime()));
    const blockEnd = new Date(end.getTime() + (a.blockEndsAt.getTime() - a.endsAt.getTime()));
    try {
      await tx.transaction(async (sp) => {
        await sp.update(occupancies).set({ startsAt: blockStart, endsAt: blockEnd, memberId }).where(eq(occupancies.appointmentId, a.id));
      });
    } catch (err) {
      if (isTimeConflict(err)) throw new AppError("slot_unavailable", "Sorry — that time was just taken. Please pick another.");
      throw err;
    }
    const memberName = svc.business.kind === "individual" ? null : (svc.staff.find((s) => s.memberId === memberId)?.displayName ?? a.snapshot.memberName);
    const [updated] = await tx
      .update(appointments)
      .set({
        startsAt: start,
        endsAt: end,
        blockStartsAt: blockStart,
        blockEndsAt: blockEnd,
        memberId,
        snapshot: { ...a.snapshot, memberName },
        rescheduleCount: actor.type === "customer" ? a.rescheduleCount + 1 : a.rescheduleCount,
        version: sql`${appointments.version} + 1`,
      })
      .where(eq(appointments.id, a.id))
      .returning();
    await tx.insert(appointmentEvents).values({
      appointmentId: a.id,
      actorType: actor.type,
      actorUserId: actor.userId,
      type: "rescheduled",
      data: { from: a.startsAt.toISOString(), to: start.toISOString(), fromMember: a.memberId, toMember: memberId, forced: Boolean(opts.force) },
    });
    await onRescheduled(tx, a.id, actor.type, a.startsAt);
    const oldLocal = instantToLocal(a.startsAt.getTime(), tz);
    await enqueue("waitlist.check", { businessId: a.businessId, serviceId: a.serviceId, date: oldLocal.date }, { tx, runAt: new Date(Date.now() + 5_000) });
    return { a: updated, moved: true };
  });
  return { appointmentId: result.a.id, startsAt: result.a.startsAt.toISOString(), moved: result.moved };
}

/* ──────────────────── Business status transitions ───────────────── */

export type BusinessAction = "approve" | "check_in" | "start" | "complete" | "no_show" | "undo_no_show";

export async function businessTransition(actorUserId: string, businessId: string, id: string, action: BusinessAction, expectedVersion?: number) {
  return db.transaction(async (tx) => {
    const a = await lockAppointment(tx, id);
    if (a.businessId !== businessId) throw notFound("That appointment");
    if (expectedVersion != null && a.version !== expectedVersion)
      throw new AppError("conflict", "This appointment was just changed by someone else. Refresh to see the latest.");
    const actor = { type: "business" as const, userId: actorUserId };
    const now = new Date();
    switch (action) {
      case "approve": {
        if (a.status !== "requested") throw new AppError("conflict", "Only pending requests can be approved.");
        const needsPayment = a.depositDueCents > a.amountPaidCents;
        if (needsPayment) {
          const holdUntil = new Date(Math.min(now.getTime() + 24 * 3600_000, a.startsAt.getTime()));
          const u = await setStatus(tx, a, "pending_payment", actor, { holdExpiresAt: holdUntil });
          await enqueue("appointment.expire_hold", { appointmentId: a.id }, { tx, runAt: new Date(holdUntil.getTime() + 30_000), dedupeKey: `hold:${a.id}:approved` });
          await onApprovedNeedsPayment(tx, a.id);
          return u;
        }
        const u = await setStatus(tx, a, "confirmed", actor, { confirmedAt: now });
        await onBooked(tx, a.id);
        return u;
      }
      case "check_in":
        return setStatus(tx, a, "checked_in", actor, { checkedInAt: now });
      case "start":
        return setStatus(tx, a, "in_progress", actor, { startedAt: now, checkedInAt: a.checkedInAt ?? now });
      case "complete": {
        if (a.startsAt.getTime() > now.getTime() + 60 * 60_000) throw new AppError("conflict", "You can mark this complete once the appointment has started.");
        const u = await setStatus(tx, a, "completed", actor, { completedAt: now });
        await tx
          .update(businessCustomers)
          .set({
            completedCount: sql`${businessCustomers.completedCount} + 1`,
            totalSpentCents: sql`${businessCustomers.totalSpentCents} + ${a.totalCents}`,
            lastVisitAt: a.startsAt,
            firstVisitAt: sql`coalesce(${businessCustomers.firstVisitAt}, ${a.startsAt.toISOString()}::timestamptz)`,
          })
          .where(eq(businessCustomers.id, a.businessCustomerId));
        await onCompleted(tx, a.id);
        return u;
      }
      case "no_show": {
        if (a.startsAt.getTime() > now.getTime()) throw new AppError("conflict", "You can mark a no-show once the start time has passed.");
        const u = await setStatus(tx, a, "no_show", actor, { noShowAt: now });
        await tx.update(businessCustomers).set({ noShowCount: sql`${businessCustomers.noShowCount} + 1` }).where(eq(businessCustomers.id, a.businessCustomerId));
        return u;
      }
      case "undo_no_show": {
        const u = await setStatus(tx, a, "completed", actor, { completedAt: now, noShowAt: null });
        await tx
          .update(businessCustomers)
          .set({
            noShowCount: sql`greatest(${businessCustomers.noShowCount} - 1, 0)`,
            completedCount: sql`${businessCustomers.completedCount} + 1`,
            totalSpentCents: sql`${businessCustomers.totalSpentCents} + ${a.totalCents}`,
            lastVisitAt: a.startsAt,
            firstVisitAt: sql`coalesce(${businessCustomers.firstVisitAt}, ${a.startsAt.toISOString()}::timestamptz)`,
          })
          .where(eq(businessCustomers.id, a.businessCustomerId));
        return u;
      }
    }
  });
}

/* ───────────────────────── System expiry ────────────────────────── */

/** Releases an unpaid checkout hold. Called by the job queue; safe to run repeatedly. */
export async function expireHold(appointmentId: string, opts: { paymentCheck?: (a: Appt) => Promise<"paid" | "processing" | "unpaid"> } = {}) {
  const [peek] = await db.select().from(appointments).where(eq(appointments.id, appointmentId));
  if (!peek || peek.status !== "pending_payment") return "noop";
  if (peek.holdExpiresAt && peek.holdExpiresAt.getTime() > Date.now()) return "not_due";
  // Never release a slot whose payment actually went through but whose webhook is late.
  if (opts.paymentCheck) {
    const state = await opts.paymentCheck(peek);
    if (state !== "unpaid") return state;
  }
  return db.transaction(async (tx) => {
    const a = await lockAppointment(tx, appointmentId);
    if (a.status !== "pending_payment" || a.amountPaidCents >= a.depositDueCents) return "noop";
    await setStatus(tx, a, "expired", { type: "system", userId: null }, { holdExpiresAt: null });
    // Only notify if the hold followed an approval — abandoned checkouts are silent.
    const [approved] = await tx
      .select({ id: appointmentEvents.id })
      .from(appointmentEvents)
      .where(and(eq(appointmentEvents.appointmentId, a.id), eq(appointmentEvents.toStatus, "pending_payment"), eq(appointmentEvents.fromStatus, "requested")))
      .limit(1);
    if (approved) await onCancelled(tx, a.id, "system", 0);
    return "expired";
  });
}

export async function expireRequest(appointmentId: string) {
  return db.transaction(async (tx) => {
    const a = await lockAppointment(tx, appointmentId);
    if (a.status !== "requested") return "noop";
    await setStatus(tx, a, "expired", { type: "system", userId: null }, { cancellationReason: "The business didn't respond in time." });
    await onCancelled(tx, a.id, "system", 0);
    return "expired";
  });
}

export { release as releaseReservation, reserve as reserveForAppointment, setStatus as setAppointmentStatus, lockAppointment };
