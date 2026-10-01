/**
 * Pricing engine (pure). The only place booking money is calculated.
 * The client never submits prices — it submits service/option/promo choices,
 * and the server derives every amount from this module.
 */

export type PriceType = "fixed" | "starting_at" | "range" | "free" | "quote";
export type PaymentPolicy = "pay_later" | "deposit" | "full";

export type PricingOption = {
  id: string;
  name: string;
  priceDeltaCents: number;
  durationDeltaMinutes: number;
  isActive: boolean;
  eligibleMemberIds: string[] | null;
};

export type PricingOptionGroup = {
  id: string;
  name: string;
  selection: "single" | "multiple";
  required: boolean;
  maxSelect: number | null;
  options: PricingOption[];
};

export type PricingService = {
  priceType: PriceType;
  priceCents: number;
  salePriceCents: number | null;
  priceMaxCents: number | null;
  durationMinutes: number;
  paymentPolicy: PaymentPolicy;
  depositType: "fixed" | "percent" | null;
  depositValue: number | null;
};

export type SelectedOption = PricingOption & { groupId: string; groupName: string };

export type SelectionResult =
  | { ok: true; selected: SelectedOption[] }
  | { ok: false; errors: { groupId?: string; message: string }[] };

/** Validates option choices against the service's option groups. */
export function resolveSelection(groups: PricingOptionGroup[], selectedIds: string[]): SelectionResult {
  const errors: { groupId?: string; message: string }[] = [];
  const unique = [...new Set(selectedIds)];
  const byId = new Map<string, SelectedOption>();
  for (const g of groups) {
    for (const o of g.options) byId.set(o.id, { ...o, groupId: g.id, groupName: g.name });
  }

  const selected: SelectedOption[] = [];
  for (const sid of unique) {
    const opt = byId.get(sid);
    if (!opt) errors.push({ message: "One of the selected options is no longer available." });
    else if (!opt.isActive) errors.push({ groupId: opt.groupId, message: `"${opt.name}" is no longer offered.` });
    else selected.push(opt);
  }

  for (const g of groups) {
    const count = selected.filter((s) => s.groupId === g.id).length;
    const activeCount = g.options.filter((o) => o.isActive).length;
    if (g.required && activeCount > 0 && count === 0) errors.push({ groupId: g.id, message: `Choose an option for "${g.name}".` });
    if (g.selection === "single" && count > 1) errors.push({ groupId: g.id, message: `Choose only one option for "${g.name}".` });
    if (g.selection === "multiple" && g.maxSelect != null && count > g.maxSelect)
      errors.push({ groupId: g.id, message: `Choose up to ${g.maxSelect} for "${g.name}".` });
  }

  if (errors.length) return { ok: false, errors };
  // Stable order: by group order, then option order.
  const order = new Map<string, number>();
  let i = 0;
  for (const g of groups) for (const o of g.options) order.set(o.id, i++);
  selected.sort((a, b) => (order.get(a.id) ?? 0) - (order.get(b.id) ?? 0));
  return { ok: true, selected };
}

/** Staff members able to perform every selected option (null eligibility = anyone). */
export function eligibleMembersFor(memberIds: string[], selected: SelectedOption[]): string[] {
  return memberIds.filter((m) => selected.every((o) => o.eligibleMemberIds == null || o.eligibleMemberIds.includes(m)));
}

export type PromotionInput = {
  id: string;
  code: string;
  name: string;
  kind: "percent" | "fixed";
  /** percent: basis points (1000 = 10%); fixed: cents */
  value: number;
};

export type QuoteLine = {
  kind: "service" | "option" | "discount" | "tax" | "fee";
  label: string;
  amountCents: number;
};

export type Quote = {
  currency: string;
  lines: QuoteLine[];
  subtotalCents: number;
  discountCents: number;
  taxCents: number;
  feeCents: number;
  totalCents: number;
  /** Amount to collect online now (0 when paying in person). */
  dueNowCents: number;
  /** Remainder to settle at/after the appointment. */
  dueLaterCents: number;
  depositCents: number;
  paymentPolicy: PaymentPolicy;
  /** True when the final price may differ (starting-at, range, quote). */
  isEstimate: boolean;
  durationMinutes: number;
  promotion: PromotionInput | null;
};

export type QuoteInput = {
  currency: string;
  serviceName: string;
  service: PricingService;
  staffOverride?: { priceCents: number | null; durationMinutes: number | null } | null;
  selected: SelectedOption[];
  promotion?: PromotionInput | null;
  taxRateBps: number;
  taxLabel?: string | null;
  customerFeeBps: number;
  /** Online payments available for this business. Without it, everything is pay-in-person. */
  paymentsEnabled: boolean;
};

const bps = (amount: number, basisPoints: number) => Math.round((amount * basisPoints) / 10_000);

export function basePriceCents(service: PricingService, staffOverride?: { priceCents: number | null } | null): number {
  if (service.priceType === "free" || service.priceType === "quote") return 0;
  if (staffOverride?.priceCents != null) return staffOverride.priceCents;
  if (service.salePriceCents != null && service.salePriceCents < service.priceCents) return service.salePriceCents;
  return service.priceCents;
}

export function computeQuote(input: QuoteInput): Quote {
  const { service, selected } = input;
  const lines: QuoteLine[] = [];
  const base = basePriceCents(service, input.staffOverride);
  lines.push({ kind: "service", label: input.serviceName, amountCents: base });
  for (const o of selected) {
    if (o.priceDeltaCents !== 0) lines.push({ kind: "option", label: o.name, amountCents: o.priceDeltaCents });
  }
  const subtotalCents = Math.max(0, base + selected.reduce((sum, o) => sum + o.priceDeltaCents, 0));

  let discountCents = 0;
  if (input.promotion && subtotalCents > 0) {
    const p = input.promotion;
    discountCents = p.kind === "percent" ? bps(subtotalCents, Math.min(p.value, 10_000)) : Math.min(p.value, subtotalCents);
    if (discountCents > 0) lines.push({ kind: "discount", label: `${p.name} (${p.code})`, amountCents: -discountCents });
  }
  const taxable = subtotalCents - discountCents;
  const taxCents = input.taxRateBps > 0 ? bps(taxable, input.taxRateBps) : 0;
  if (taxCents > 0) lines.push({ kind: "tax", label: input.taxLabel || "Tax", amountCents: taxCents });
  const feeCents = input.customerFeeBps > 0 ? bps(taxable, input.customerFeeBps) : 0;
  if (feeCents > 0) lines.push({ kind: "fee", label: "Service fee", amountCents: feeCents });

  const totalCents = taxable + taxCents + feeCents;
  const isEstimate = service.priceType === "starting_at" || service.priceType === "range" || service.priceType === "quote";

  // Payment policy: prepayment requires online payments and a known price.
  let policy: PaymentPolicy = service.paymentPolicy;
  if (!input.paymentsEnabled || service.priceType === "quote" || totalCents === 0) policy = "pay_later";
  if (policy === "full" && isEstimate) policy = "deposit";

  let depositCents = 0;
  if (policy === "deposit") {
    if (service.depositType === "percent") depositCents = bps(totalCents, Math.min(100, Math.max(0, service.depositValue ?? 0)) * 100);
    else depositCents = Math.max(0, service.depositValue ?? 0);
    depositCents = Math.min(depositCents, totalCents);
    if (depositCents === 0) policy = "pay_later";
  }
  // Stripe minimum charge is 50 minor units for most currencies.
  if (policy !== "pay_later" && (policy === "full" ? totalCents : depositCents) < 50) {
    policy = "pay_later";
    depositCents = 0;
  }
  const dueNowCents = policy === "full" ? totalCents : policy === "deposit" ? depositCents : 0;

  const durationMinutes = Math.max(
    5,
    (input.staffOverride?.durationMinutes ?? service.durationMinutes) + selected.reduce((s, o) => s + o.durationDeltaMinutes, 0),
  );

  return {
    currency: input.currency,
    lines,
    subtotalCents,
    discountCents,
    taxCents,
    feeCents,
    totalCents,
    dueNowCents,
    dueLaterCents: totalCents - dueNowCents,
    depositCents,
    paymentPolicy: policy,
    isEstimate,
    durationMinutes,
    promotion: discountCents > 0 ? (input.promotion ?? null) : null,
  };
}

/** Lowest/highest advertised prices for listing cards & search filters. */
export function displayPriceRange(service: Pick<PricingService, "priceType" | "priceCents" | "salePriceCents" | "priceMaxCents">) {
  if (service.priceType === "free") return { min: 0, max: 0 };
  if (service.priceType === "quote") return null;
  const min = service.salePriceCents != null && service.salePriceCents < service.priceCents ? service.salePriceCents : service.priceCents;
  const max = service.priceType === "range" && service.priceMaxCents != null ? service.priceMaxCents : min;
  return { min, max };
}

export type PromotionRules = {
  isActive: boolean;
  startsAt: Date | null;
  endsAt: Date | null;
  minSubtotalCents: number;
  serviceIds: string[] | null;
  newCustomersOnly: boolean;
  maxRedemptions: number | null;
  redemptionCount: number;
  perCustomerLimit: number;
};

export function checkPromotion(
  p: PromotionRules,
  ctx: { now: Date; serviceId: string; subtotalCents: number; customerRedemptions: number; customerPriorVisits: number },
): { ok: true } | { ok: false; reason: string } {
  if (!p.isActive) return { ok: false, reason: "This code is no longer active." };
  if (p.startsAt && ctx.now < p.startsAt) return { ok: false, reason: "This code isn't active yet." };
  if (p.endsAt && ctx.now > p.endsAt) return { ok: false, reason: "This code has expired." };
  if (p.serviceIds && p.serviceIds.length > 0 && !p.serviceIds.includes(ctx.serviceId))
    return { ok: false, reason: "This code doesn't apply to this service." };
  if (ctx.subtotalCents < p.minSubtotalCents) return { ok: false, reason: "Your booking doesn't meet the minimum for this code." };
  if (p.maxRedemptions != null && p.redemptionCount >= p.maxRedemptions) return { ok: false, reason: "This code has reached its limit." };
  if (ctx.customerRedemptions >= p.perCustomerLimit) return { ok: false, reason: "You've already used this code." };
  if (p.newCustomersOnly && ctx.customerPriorVisits > 0) return { ok: false, reason: "This code is for new customers only." };
  return { ok: true };
}
