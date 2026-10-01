import "server-only";
import { and, desc, eq, sql } from "drizzle-orm";
import Stripe from "stripe";
import { z } from "zod";
import { AppError, notFound } from "@/domain/errors";
import { formatMoney } from "@/domain/money";
import { entitlements } from "@/domain/plans";
import { db, type Tx } from "../db/client";
import { isExclusionViolation } from "../db/errors";
import { appointmentEvents, appointments, businesses, occupancies, payments, refunds, webhookEvents } from "../db/schema";
import { env, features } from "../env";
import { audit } from "../audit";
import { log } from "../logger";
import { notify } from "../notify";
import { onBooked, notifyBusinessAdmins } from "./appointment-notify";
import { lockAppointment } from "./booking";

let client: Stripe | null = null;
export function stripe(): Stripe | null {
  if (!features.stripe) return null;
  client ??= new Stripe(env.STRIPE_SECRET_KEY!, { maxNetworkRetries: 2, timeout: 20_000 });
  return client;
}

type Appt = typeof appointments.$inferSelect;

function paymentStatusFor(a: Pick<Appt, "totalCents" | "amountPaidCents" | "amountRefundedCents" | "isEstimate">) {
  const net = a.amountPaidCents - a.amountRefundedCents;
  if (a.amountRefundedCents > 0 && net <= 0) return "refunded" as const;
  if (a.amountRefundedCents > 0) return "partially_refunded" as const;
  if (a.amountPaidCents >= a.totalCents && a.totalCents > 0 && !a.isEstimate) return "paid" as const;
  if (a.amountPaidCents > 0) return "deposit_paid" as const;
  return "unpaid" as const;
}

/* ─────────────────────────── Checkout ──────────────────────────── */

/**
 * Creates (or reuses) the PaymentIntent for an appointment's amount due now.
 * The amount comes from the appointment row computed at booking — never from the client.
 */
export async function startCheckout(appointmentId: string) {
  const s = stripe();
  if (!s) throw new AppError("unavailable", "Online payments aren't available right now. Your card was not charged.");
  const [row] = await db
    .select({ a: appointments, stripeAccountId: businesses.stripeAccountId, plan: businesses.plan })
    .from(appointments)
    .innerJoin(businesses, eq(businesses.id, appointments.businessId))
    .where(eq(appointments.id, appointmentId));
  if (!row) throw notFound("That appointment");
  const { a } = row;
  if (a.status !== "pending_payment") throw new AppError("conflict", "This appointment doesn't need a payment right now.");
  if (!row.stripeAccountId) throw new AppError("unavailable", "This business can't accept online payments yet. Your card was not charged.");
  const amount = a.depositDueCents - a.amountPaidCents;
  if (amount <= 0) throw new AppError("conflict", "Nothing is due for this appointment.");

  const [open] = await db
    .select()
    .from(payments)
    .where(and(eq(payments.appointmentId, a.id), eq(payments.status, "requires_payment"), eq(payments.amountCents, amount)))
    .orderBy(desc(payments.createdAt))
    .limit(1);
  let intent: Stripe.PaymentIntent;
  if (open?.providerPaymentId) {
    intent = await s.paymentIntents.retrieve(open.providerPaymentId);
  } else {
    const fee = Math.round((amount * entitlements(row.plan).applicationFeeBps) / 10_000) + a.feeCents;
    intent = await s.paymentIntents.create(
      {
        amount,
        currency: a.currency.toLowerCase(),
        automatic_payment_methods: { enabled: true },
        application_fee_amount: Math.min(fee, amount),
        transfer_data: { destination: row.stripeAccountId },
        description: `${a.snapshot.serviceName} · ${a.reference}`,
        metadata: { appointmentId: a.id, reference: a.reference, kind: a.depositDueCents >= a.totalCents ? "full" : "deposit" },
      },
      { idempotencyKey: `appt:${a.id}:due:${amount}` },
    );
    await db
      .insert(payments)
      .values({
        appointmentId: a.id,
        businessId: a.businessId,
        customerUserId: a.customerUserId,
        kind: a.depositDueCents >= a.totalCents ? "full" : "deposit",
        provider: "stripe",
        providerPaymentId: intent.id,
        amountCents: amount,
        applicationFeeCents: Math.min(fee, amount),
        currency: a.currency,
        status: "requires_payment",
      })
      .onConflictDoNothing();
  }
  return {
    clientSecret: intent.client_secret!,
    publishableKey: env.NEXT_PUBLIC_STRIPE_PUBLISHABLE_KEY!,
    expiresAt: (a.holdExpiresAt ?? new Date(Date.now() + 15 * 60_000)).toISOString(),
  };
}

/** Used by hold expiry: asks Stripe whether a late webhook is still in flight. */
export async function paymentStateForHold(a: Appt): Promise<"paid" | "processing" | "unpaid"> {
  const s = stripe();
  if (!s) return "unpaid";
  const open = await db.select().from(payments).where(and(eq(payments.appointmentId, a.id), eq(payments.provider, "stripe")));
  for (const p of open) {
    if (!p.providerPaymentId) continue;
    const pi = await s.paymentIntents.retrieve(p.providerPaymentId);
    if (pi.status === "succeeded") {
      await markPaymentSucceeded(pi.id, pi.amount_received);
      return "paid";
    }
    if (pi.status === "processing") return "processing";
    if (pi.status === "requires_payment_method" || pi.status === "requires_confirmation" || pi.status === "requires_action") {
      await s.paymentIntents.cancel(pi.id).catch(() => undefined);
      await db.update(payments).set({ status: "cancelled" }).where(eq(payments.id, p.id));
    }
  }
  return "unpaid";
}

/* ────────────────────── Payment confirmation ───────────────────── */

/**
 * Applies a successful payment exactly once. Safe to call from webhooks,
 * hold-expiry checks and retries in any order.
 */
export async function markPaymentSucceeded(providerPaymentId: string, amountReceived: number) {
  let refundNeeded = 0;
  let apptId: string | null = null;
  await db.transaction(async (tx) => {
    const [p] = await tx.select().from(payments).where(eq(payments.providerPaymentId, providerPaymentId)).for("update");
    if (!p) {
      log.warn("payments.unknown_intent", { providerPaymentId });
      return;
    }
    if (p.status === "succeeded") return; // duplicate delivery
    apptId = p.appointmentId;
    await tx.update(payments).set({ status: "succeeded", succeededAt: new Date(), amountCents: amountReceived || p.amountCents }).where(eq(payments.id, p.id));
    const a = await lockAppointment(tx, p.appointmentId);
    const paid = a.amountPaidCents + (amountReceived || p.amountCents);
    const next = { ...a, amountPaidCents: paid };

    if (p.kind === "tip") {
      await tx.update(appointments).set({ tipCents: a.tipCents + p.amountCents }).where(eq(appointments.id, a.id));
      return;
    }

    if (a.status === "pending_payment") {
      await tx
        .update(appointments)
        .set({ amountPaidCents: paid, paymentStatus: paymentStatusFor(next), status: "confirmed", confirmedAt: new Date(), holdExpiresAt: null, version: sql`${appointments.version} + 1` })
        .where(eq(appointments.id, a.id));
      await tx.insert(appointmentEvents).values({ appointmentId: a.id, actorType: "system", type: "status", fromStatus: a.status, toStatus: "confirmed", data: { payment: p.id } });
      await onBooked(tx, a.id);
      return;
    }

    if (a.status === "expired" || a.status === "cancelled") {
      // Payment landed after the hold lapsed. Try to reinstate the slot; otherwise refund.
      const reinstated = a.status === "expired" && (await tryReinstate(tx, a));
      if (reinstated) {
        await tx
          .update(appointments)
          .set({ amountPaidCents: paid, paymentStatus: paymentStatusFor(next), status: "confirmed", confirmedAt: new Date(), version: sql`${appointments.version} + 1` })
          .where(eq(appointments.id, a.id));
        await tx.insert(appointmentEvents).values({ appointmentId: a.id, actorType: "system", type: "status", fromStatus: a.status, toStatus: "confirmed", data: { reinstated: true } });
        await onBooked(tx, a.id);
      } else {
        await tx.update(appointments).set({ amountPaidCents: paid, paymentStatus: paymentStatusFor(next) }).where(eq(appointments.id, a.id));
        refundNeeded = amountReceived || p.amountCents;
        if (a.customerUserId) {
          await notify(
            a.customerUserId,
            {
              topic: "bookings",
              type: "payment.late_refund",
              title: "We're refunding your payment",
              body: "Your payment arrived after the time was released. A full refund is on its way.",
              href: `/bookings/${a.id}`,
              email: {
                subject: "Your payment is being refunded",
                heading: "Your payment is being refunded",
                paragraphs: [
                  `Your payment for ${a.snapshot.serviceName} arrived after the reserved time had been released, and the slot is no longer available.`,
                  `We've refunded ${formatMoney(refundNeeded, a.currency)} in full. It usually appears within 5–10 business days.`,
                ],
                cta: { label: "Choose another time", url: `/bookings/${a.id}` },
              },
            },
            tx,
          );
        }
      }
      return;
    }

    await tx.update(appointments).set({ amountPaidCents: paid, paymentStatus: paymentStatusFor(next) }).where(eq(appointments.id, a.id));
  });
  if (refundNeeded > 0 && apptId) await refundAppointment(apptId, refundNeeded, { reason: "Late payment — slot unavailable", actorUserId: null });
}

async function tryReinstate(tx: Tx, a: Appt): Promise<boolean> {
  if (!a.memberId || a.groupSessionId || a.startsAt.getTime() < Date.now()) return false;
  try {
    await tx.transaction(async (sp) => {
      await sp.insert(occupancies).values({ businessId: a.businessId, memberId: a.memberId, appointmentId: a.id, startsAt: a.blockStartsAt, endsAt: a.blockEndsAt });
    });
    return true;
  } catch (err) {
    if (isExclusionViolation(err)) return false;
    throw err;
  }
}

export async function markPaymentFailed(providerPaymentId: string, message: string | null) {
  await db.update(payments).set({ status: "failed", failureMessage: message?.slice(0, 300) ?? null }).where(and(eq(payments.providerPaymentId, providerPaymentId), sql`${payments.status} <> 'succeeded'`));
}

/* ──────────────────────────── Refunds ──────────────────────────── */

/**
 * Refunds up to `amountCents` across the appointment's successful card payments.
 * Manual (in-person) payments can't be refunded automatically; the business is told.
 */
export async function refundAppointment(appointmentId: string, amountCents: number, opts: { reason: string; actorUserId: string | null }) {
  const s = stripe();
  const paid = await db
    .select()
    .from(payments)
    .where(and(eq(payments.appointmentId, appointmentId), eq(payments.status, "succeeded"), sql`${payments.kind} <> 'tip'`))
    .orderBy(desc(payments.createdAt));
  let remaining = amountCents;
  for (const p of paid) {
    if (remaining <= 0) break;
    const [{ refunded }] = await db
      .select({ refunded: sql<number>`coalesce(sum(${refunds.amountCents}), 0)::int` })
      .from(refunds)
      .where(and(eq(refunds.paymentId, p.id), sql`${refunds.status} <> 'failed'`));
    const available = p.amountCents - refunded;
    const amount = Math.min(available, remaining);
    if (amount <= 0) continue;

    if (p.provider === "stripe" && s && p.providerPaymentId) {
      try {
        const r = await s.refunds.create(
          { payment_intent: p.providerPaymentId, amount, reverse_transfer: true, refund_application_fee: true, metadata: { appointmentId } },
          { idempotencyKey: `refund:${p.id}:${refunded}:${amount}` },
        );
        await db.transaction(async (tx) => {
          await tx
            .insert(refunds)
            .values({ paymentId: p.id, appointmentId, amountCents: amount, reason: opts.reason, status: r.status === "failed" ? "failed" : "succeeded", providerRefundId: r.id, createdByUserId: opts.actorUserId })
            .onConflictDoNothing();
          await applyRefundTotals(tx, appointmentId, amount);
        });
        remaining -= amount;
      } catch (err) {
        log.error("payments.refund_failed", { appointmentId, paymentId: p.id, err });
        await notifyBusinessAdmins(db, p.businessId, {
          topic: "business",
          type: "payment.refund_failed",
          title: "A refund needs your attention",
          body: `We couldn't automatically refund ${formatMoney(amount, p.currency)}. Please review it in Payments.`,
          href: `/pro/appointments/${appointmentId}`,
        });
      }
    } else {
      await notifyBusinessAdmins(db, p.businessId, {
        topic: "business",
        type: "payment.manual_refund_due",
        title: "Refund the customer in person",
        body: `${formatMoney(amount, p.currency)} was paid in person and should be returned to the customer.`,
        href: `/pro/appointments/${appointmentId}`,
      });
      remaining -= amount;
    }
  }
  await audit({ actorUserId: opts.actorUserId, actorType: opts.actorUserId ? "business" : "system", action: "payment.refund", targetType: "appointment", targetId: appointmentId, metadata: { requested: amountCents, reason: opts.reason } });
}

async function applyRefundTotals(tx: Tx, appointmentId: string, amount: number) {
  const a = await lockAppointment(tx, appointmentId);
  const next = { ...a, amountRefundedCents: a.amountRefundedCents + amount };
  await tx.update(appointments).set({ amountRefundedCents: next.amountRefundedCents, paymentStatus: paymentStatusFor(next) }).where(eq(appointments.id, a.id));
}

/* ───────────────────── Business-recorded payments ───────────────── */

export const recordPaymentSchema = z.object({
  amountCents: z.number().int().min(1).max(10_000_000),
  method: z.enum(["cash", "card_terminal", "bank_transfer", "other"]),
  kind: z.enum(["balance", "full", "deposit", "tip", "no_show_fee", "cancellation_fee"]).default("balance"),
});

export async function recordManualPayment(actorUserId: string, businessId: string, appointmentId: string, input: z.infer<typeof recordPaymentSchema>) {
  return db.transaction(async (tx) => {
    const a = await lockAppointment(tx, appointmentId);
    if (a.businessId !== businessId) throw notFound("That appointment");
    const [p] = await tx
      .insert(payments)
      .values({
        appointmentId,
        businessId,
        customerUserId: a.customerUserId,
        kind: input.kind,
        provider: "manual",
        method: input.method,
        amountCents: input.amountCents,
        currency: a.currency,
        status: "succeeded",
        succeededAt: new Date(),
        recordedByUserId: actorUserId,
      })
      .returning();
    if (input.kind === "tip") {
      await tx.update(appointments).set({ tipCents: a.tipCents + input.amountCents }).where(eq(appointments.id, a.id));
    } else {
      const next = { ...a, amountPaidCents: a.amountPaidCents + input.amountCents };
      await tx.update(appointments).set({ amountPaidCents: next.amountPaidCents, paymentStatus: paymentStatusFor(next) }).where(eq(appointments.id, a.id));
    }
    await audit({ actorUserId, actorType: "business", businessId, action: "payment.recorded", targetType: "appointment", targetId: appointmentId, metadata: { amountCents: input.amountCents, method: input.method, kind: input.kind } }, tx);
    return p;
  });
}

/* ─────────────────────────── Tips ──────────────────────────────── */

export async function startTip(customerUserId: string, appointmentId: string, amountCents: number) {
  const s = stripe();
  if (!s) throw new AppError("unavailable", "Online tipping isn't available for this business.");
  const [row] = await db
    .select({ a: appointments, stripeAccountId: businesses.stripeAccountId, paymentsEnabled: businesses.paymentsEnabled })
    .from(appointments)
    .innerJoin(businesses, eq(businesses.id, appointments.businessId))
    .where(and(eq(appointments.id, appointmentId), eq(appointments.customerUserId, customerUserId)));
  if (!row) throw notFound("That appointment");
  if (row.a.status !== "completed") throw new AppError("conflict", "You can leave a tip after your appointment is complete.");
  if (!row.stripeAccountId || !row.paymentsEnabled) throw new AppError("unavailable", "This business doesn't accept online tips yet.");
  if (amountCents < 100 || amountCents > 100_000) throw new AppError("validation", "Choose a tip between $1 and $1,000.");
  const intent = await s.paymentIntents.create(
    {
      amount: amountCents,
      currency: row.a.currency.toLowerCase(),
      automatic_payment_methods: { enabled: true },
      // Tips go to the business in full: no platform fee.
      transfer_data: { destination: row.stripeAccountId },
      description: `Tip · ${row.a.reference}`,
      metadata: { appointmentId, kind: "tip" },
    },
    { idempotencyKey: `tip:${appointmentId}:${amountCents}:${Math.floor(Date.now() / 600_000)}` },
  );
  await db
    .insert(payments)
    .values({ appointmentId, businessId: row.a.businessId, customerUserId, kind: "tip", provider: "stripe", providerPaymentId: intent.id, amountCents, currency: row.a.currency, status: "requires_payment" })
    .onConflictDoNothing();
  return { clientSecret: intent.client_secret!, publishableKey: env.NEXT_PUBLIC_STRIPE_PUBLISHABLE_KEY! };
}

/* ─────────────────────────── Connect ───────────────────────────── */

export async function createOnboardingLink(businessId: string) {
  const s = stripe();
  if (!s) throw new AppError("unavailable", "Online payments aren't configured on this platform yet.");
  const [b] = await db.select().from(businesses).where(eq(businesses.id, businessId));
  if (!b) throw notFound("That business");
  let accountId = b.stripeAccountId;
  if (!accountId) {
    const acct = await s.accounts.create(
      {
        controller: { stripe_dashboard: { type: "express" }, fees: { payer: "application" }, losses: { payments: "application" } },
        capabilities: { card_payments: { requested: true }, transfers: { requested: true } },
        business_profile: { name: b.name, url: `${env.APP_URL}/${b.slug}` },
        metadata: { businessId },
      },
      { idempotencyKey: `connect:${businessId}` },
    );
    accountId = acct.id;
    await db.update(businesses).set({ stripeAccountId: accountId }).where(eq(businesses.id, businessId));
  }
  const link = await s.accountLinks.create({
    account: accountId,
    type: "account_onboarding",
    refresh_url: `${env.APP_URL}/pro/settings/payments?refresh=1`,
    return_url: `${env.APP_URL}/pro/settings/payments?return=1`,
  });
  return { url: link.url };
}

export async function syncConnectAccount(accountId: string) {
  const s = stripe();
  if (!s) return;
  const acct = await s.accounts.retrieve(accountId);
  await db.update(businesses).set({ paymentsEnabled: Boolean(acct.charges_enabled) }).where(eq(businesses.stripeAccountId, accountId));
}

/* ─────────────────────────── Webhooks ──────────────────────────── */

/**
 * Verified, idempotent, retry-safe webhook processing. Each event id is
 * stored once; a redelivery of a processed event is acknowledged and ignored.
 * Failures are recorded and re-thrown so Stripe retries.
 */
export async function handleStripeEvent(event: Stripe.Event) {
  const inserted = await db
    .insert(webhookEvents)
    .values({ id: event.id, provider: "stripe", type: event.type, payload: event as unknown as Record<string, unknown> })
    .onConflictDoNothing()
    .returning({ id: webhookEvents.id });
  if (!inserted.length) {
    const [prev] = await db.select({ processedAt: webhookEvents.processedAt }).from(webhookEvents).where(eq(webhookEvents.id, event.id));
    if (prev?.processedAt) return { duplicate: true };
  }
  await db.update(webhookEvents).set({ attempts: sql`${webhookEvents.attempts} + 1` }).where(eq(webhookEvents.id, event.id));
  try {
    switch (event.type) {
      case "payment_intent.succeeded":
        await markPaymentSucceeded(event.data.object.id, event.data.object.amount_received);
        break;
      case "payment_intent.payment_failed":
        await markPaymentFailed(event.data.object.id, event.data.object.last_payment_error?.message ?? null);
        break;
      case "payment_intent.canceled":
        await db.update(payments).set({ status: "cancelled" }).where(and(eq(payments.providerPaymentId, event.data.object.id), sql`${payments.status} <> 'succeeded'`));
        break;
      case "account.updated":
        await syncConnectAccount(event.data.object.id);
        break;
      default:
        break;
    }
    await db.update(webhookEvents).set({ processedAt: new Date(), error: null }).where(eq(webhookEvents.id, event.id));
    return { duplicate: false };
  } catch (err) {
    await db.update(webhookEvents).set({ error: err instanceof Error ? err.message.slice(0, 500) : String(err) }).where(eq(webhookEvents.id, event.id));
    throw err;
  }
}
