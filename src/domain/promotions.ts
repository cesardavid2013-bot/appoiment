/**
 * Promotion-code display rules shared by the console and tests. Checkout
 * validity is decided by `checkPromotion` in ./pricing — this module only
 * mirrors it for the provider-facing status label so both always agree.
 */
import { formatMoney } from "./money";

export type PromotionDisplayStatus = "active" | "scheduled" | "expired" | "paused" | "used_up";

export type PromotionStatusInput = {
  isActive: boolean;
  startsAt: Date | null;
  endsAt: Date | null;
  maxRedemptions: number | null;
  redemptionCount: number;
};

/** Order matters: a paused code reads as paused even if it has also expired. */
export function promotionStatus(p: PromotionStatusInput, now: Date): PromotionDisplayStatus {
  if (!p.isActive) return "paused";
  if (p.endsAt && now > p.endsAt) return "expired";
  if (p.startsAt && now < p.startsAt) return "scheduled";
  if (p.maxRedemptions != null && p.redemptionCount >= p.maxRedemptions) return "used_up";
  return "active";
}

export const PROMOTION_STATUS_LABEL: Record<PromotionDisplayStatus, string> = {
  active: "Active",
  scheduled: "Scheduled",
  expired: "Expired",
  paused: "Turned off",
  used_up: "Limit reached",
};

/** "20% off" / "$10 off". `value` is stored as basis points (percent) or minor units (fixed). */
export function describeDiscount(kind: "percent" | "fixed", value: number, currency: string): string {
  if (kind === "percent") {
    const pct = value / 100;
    return `${Number.isInteger(pct) ? pct : pct.toFixed(1)}% off`;
  }
  return `${formatMoney(value, currency, { compact: true })} off`;
}
