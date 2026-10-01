/**
 * Plan entitlements. Every plan check in the codebase goes through here.
 * Limits reflect real cost/complexity differences — the free plan is a
 * complete product for a solo professional.
 */
export type PlanTier = "free" | "pro" | "business";

export type Entitlements = {
  label: string;
  maxBookableMembers: number;
  maxLocations: number;
  promotions: boolean;
  intakeForms: boolean;
  customRoles: boolean;
  advancedAnalytics: boolean;
  /** Platform fee on online payments, basis points. */
  applicationFeeBps: number;
};

export const PLANS: Record<PlanTier, Entitlements> = {
  free: {
    label: "Solo",
    maxBookableMembers: 1,
    maxLocations: 1,
    promotions: true,
    intakeForms: true,
    customRoles: false,
    advancedAnalytics: false,
    applicationFeeBps: 300,
  },
  pro: {
    label: "Pro",
    maxBookableMembers: 10,
    maxLocations: 3,
    promotions: true,
    intakeForms: true,
    customRoles: true,
    advancedAnalytics: true,
    applicationFeeBps: 150,
  },
  business: {
    label: "Business",
    maxBookableMembers: 200,
    maxLocations: 50,
    promotions: true,
    intakeForms: true,
    customRoles: true,
    advancedAnalytics: true,
    applicationFeeBps: 100,
  },
};

export function entitlements(plan: PlanTier): Entitlements {
  return PLANS[plan];
}

/**
 * Plan every new business starts on. Paid plans can't be purchased yet, so
 * during launch new businesses get Pro at no charge — otherwise a shop with a
 * team couldn't add a second bookable professional at all.
 */
export const LAUNCH_PLAN: PlanTier = "pro";
