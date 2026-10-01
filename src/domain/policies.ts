/**
 * Cancellation / reschedule / refund rules (pure).
 * The customer sees the outcome of these rules *before* confirming an action.
 */
import type { TFunction } from "@/i18n/translate";
import type { AppointmentStatus } from "./appointment-state";

export type PolicyAppointment = {
  status: AppointmentStatus;
  startsAt: Date;
  totalCents: number;
  depositDueCents: number;
  amountPaidCents: number;
  amountRefundedCents: number;
  rescheduleCount: number;
  policy: {
    cancellationWindowHours: number;
    rescheduleWindowHours: number;
    lateCancelFeePercent: number;
    depositRefundable: boolean;
  };
};

export const MAX_CUSTOMER_RESCHEDULES = 3;

export type CancellationOutcome =
  | { allowed: false; reason: string }
  | {
      allowed: true;
      isLate: boolean;
      /** Amount the business keeps from what was already paid. */
      keptCents: number;
      refundCents: number;
      /** Late fee that exceeds what was paid — informational; not charged automatically. */
      unpaidFeeCents: number;
      summary: string;
    };

const CUSTOMER_CANCELLABLE: AppointmentStatus[] = ["pending_payment", "requested", "confirmed"];

export function customerCancellation(a: PolicyAppointment, now: Date): CancellationOutcome {
  if (!CUSTOMER_CANCELLABLE.includes(a.status)) return { allowed: false, reason: "This appointment can no longer be cancelled." };
  if (a.startsAt.getTime() <= now.getTime()) return { allowed: false, reason: "This appointment has already started." };

  const netPaid = Math.max(0, a.amountPaidCents - a.amountRefundedCents);
  // Requests that were never confirmed, and unpaid holds, are always free to cancel.
  if (a.status === "requested" || a.status === "pending_payment") {
    return { allowed: true, isLate: false, keptCents: 0, refundCents: netPaid, unpaidFeeCents: 0, summary: refundSummary(netPaid, 0) };
  }

  const cutoff = a.startsAt.getTime() - a.policy.cancellationWindowHours * 3_600_000;
  const isLate = now.getTime() > cutoff;
  const nonRefundableDeposit = a.policy.depositRefundable ? 0 : Math.min(a.depositDueCents, netPaid);
  const lateFee = isLate ? Math.round((a.totalCents * a.policy.lateCancelFeePercent) / 100) : 0;
  const owed = Math.max(nonRefundableDeposit, lateFee);
  const keptCents = Math.min(owed, netPaid);
  const refundCents = netPaid - keptCents;
  const unpaidFeeCents = Math.max(0, lateFee - keptCents);
  return { allowed: true, isLate, keptCents, refundCents, unpaidFeeCents, summary: refundSummary(refundCents, keptCents) };
}

function refundSummary(refund: number, kept: number): string {
  if (refund === 0 && kept === 0) return "No charge.";
  if (kept === 0) return "You'll get a full refund.";
  if (refund === 0) return "Your payment is non-refundable under this business's policy.";
  return "You'll get a partial refund under this business's policy.";
}

/** Cancellation by the business always refunds everything the customer paid. */
export function businessCancellation(a: Pick<PolicyAppointment, "amountPaidCents" | "amountRefundedCents">) {
  return { refundCents: Math.max(0, a.amountPaidCents - a.amountRefundedCents) };
}

export function customerReschedule(a: PolicyAppointment, now: Date): { allowed: true } | { allowed: false; reason: string } {
  if (!["requested", "confirmed"].includes(a.status)) return { allowed: false, reason: "This appointment can't be rescheduled." };
  if (a.rescheduleCount >= MAX_CUSTOMER_RESCHEDULES)
    return { allowed: false, reason: "This appointment has been rescheduled the maximum number of times. Please contact the business." };
  const cutoff = a.startsAt.getTime() - a.policy.rescheduleWindowHours * 3_600_000;
  if (now.getTime() > cutoff)
    return {
      allowed: false,
      reason: `Changes must be made at least ${a.policy.rescheduleWindowHours} hours before the appointment. Please contact the business.`,
    };
  return { allowed: true };
}

export function describeCancellationPolicy(p: PolicyAppointment["policy"], t?: TFunction): string[] {
  // Without a translator (tests, scripts) the English wording is used.
  const say = (key: keyof typeof POLICY_EN, vars: Record<string, number> = {}) =>
    t ? t(`common.policy.${key}`, vars) : POLICY_EN[key].replace(/\{(\w+)\}/g, (_, k: string) => String(vars[k]));
  const out: string[] = [];
  if (p.cancellationWindowHours > 0) {
    out.push(p.lateCancelFeePercent > 0 ? say("freeUntil", { hours: p.cancellationWindowHours, percent: p.lateCancelFeePercent }) : say("cancelAhead", { hours: p.cancellationWindowHours }));
  } else {
    out.push(say("freeAnyTime"));
  }
  out.push(say(p.depositRefundable ? "depositRefundable" : "depositNonRefundable"));
  if (p.rescheduleWindowHours > 0) out.push(say("reschedule", { hours: p.rescheduleWindowHours }));
  return out;
}

export const POLICY_EN = {
  freeUntil: "Free cancellation up to {hours}h before. Later cancellations are charged {percent}% of the total.",
  cancelAhead: "Please cancel at least {hours}h before your appointment.",
  freeAnyTime: "Free cancellation any time before your appointment.",
  depositRefundable: "Deposits are refundable when you cancel in time.",
  depositNonRefundable: "Deposits are non-refundable.",
  reschedule: "Reschedule online up to {hours}h before.",
};
