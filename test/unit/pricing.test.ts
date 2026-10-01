import { describe, expect, it } from "vitest";
import {
  checkPromotion,
  computeQuote,
  eligibleMembersFor,
  resolveSelection,
  type PricingOptionGroup,
  type PricingService,
  type QuoteInput,
} from "@/domain/pricing";

const opt = (id: string, price = 0, dur = 0, extra: Partial<PricingOptionGroup["options"][number]> = {}) => ({
  id,
  name: id,
  priceDeltaCents: price,
  durationDeltaMinutes: dur,
  isActive: true,
  eligibleMemberIds: null,
  ...extra,
});

// A generic nail set: nothing in the engine knows about nails.
const groups: PricingOptionGroup[] = [
  { id: "len", name: "Length", selection: "single", required: true, maxSelect: null, options: [opt("short"), opt("long", 1000, 15), opt("xl", 2000, 30, { eligibleMemberIds: ["m2"] })] },
  { id: "art", name: "Design", selection: "single", required: false, maxSelect: null, options: [opt("french", 500, 10), opt("custom", 1500, 30)] },
  { id: "add", name: "Add-ons", selection: "multiple", required: false, maxSelect: 2, options: [opt("gems", 300, 5), opt("chrome", 500, 5), opt("soak", 0, 15, { isActive: false })] },
];

const service: PricingService = {
  priceType: "fixed",
  priceCents: 5000,
  salePriceCents: null,
  priceMaxCents: null,
  durationMinutes: 60,
  paymentPolicy: "deposit",
  depositType: "percent",
  depositValue: 25,
};

function quote(over: Partial<QuoteInput> = {}) {
  const sel = resolveSelection(groups, ["long", "french", "gems"]);
  if (!sel.ok) throw new Error("selection invalid");
  return computeQuote({
    currency: "USD",
    serviceName: "Nail set",
    service,
    selected: sel.selected,
    taxRateBps: 0,
    customerFeeBps: 0,
    paymentsEnabled: true,
    ...over,
  });
}

describe("resolveSelection", () => {
  it("requires required groups and enforces single/max rules", () => {
    expect(resolveSelection(groups, []).ok).toBe(false);
    expect(resolveSelection(groups, ["short", "long"]).ok).toBe(false);
    expect(resolveSelection(groups, ["short", "gems", "chrome"]).ok).toBe(true);
    const tooMany = resolveSelection([{ ...groups[2], maxSelect: 1 }], ["gems", "chrome"]);
    expect(tooMany.ok).toBe(false);
  });

  it("rejects unknown or inactive options", () => {
    expect(resolveSelection(groups, ["short", "nope"]).ok).toBe(false);
    expect(resolveSelection(groups, ["short", "soak"]).ok).toBe(false);
  });

  it("dedupes and orders the selection deterministically", () => {
    const r = resolveSelection(groups, ["gems", "short", "gems"]);
    expect(r.ok && r.selected.map((s) => s.id)).toEqual(["short", "gems"]);
  });

  it("narrows staff by option eligibility", () => {
    const r = resolveSelection(groups, ["xl"]);
    expect(r.ok && eligibleMembersFor(["m1", "m2"], r.selected)).toEqual(["m2"]);
  });
});

describe("computeQuote", () => {
  it("sums options into price and duration", () => {
    const q = quote();
    expect(q.subtotalCents).toBe(5000 + 1000 + 500 + 300);
    expect(q.durationMinutes).toBe(60 + 15 + 10 + 5);
    expect(q.totalCents).toBe(6800);
    expect(q.depositCents).toBe(1700);
    expect(q.dueNowCents).toBe(1700);
    expect(q.dueLaterCents).toBe(5100);
  });

  it("applies discount before tax and fee, and itemises everything", () => {
    const q = quote({
      promotion: { id: "p", code: "NEW10", name: "New client", kind: "percent", value: 1000 },
      taxRateBps: 825,
      taxLabel: "Sales tax",
      customerFeeBps: 200,
    });
    expect(q.discountCents).toBe(680);
    const taxable = 6800 - 680;
    expect(q.taxCents).toBe(Math.round(taxable * 0.0825));
    expect(q.feeCents).toBe(Math.round(taxable * 0.02));
    expect(q.totalCents).toBe(taxable + q.taxCents + q.feeCents);
    expect(q.lines.map((l) => l.kind)).toEqual(["service", "option", "option", "option", "discount", "tax", "fee"]);
  });

  it("caps fixed discounts at the subtotal", () => {
    const q = quote({ promotion: { id: "p", code: "BIG", name: "Big", kind: "fixed", value: 100_000 } });
    expect(q.totalCents).toBe(0);
    expect(q.paymentPolicy).toBe("pay_later");
  });

  it("uses sale price and staff overrides", () => {
    const sale = computeQuote({ ...quoteBase(), service: { ...service, salePriceCents: 4000 } });
    expect(sale.subtotalCents).toBe(4000);
    const senior = computeQuote({ ...quoteBase(), staffOverride: { priceCents: 7000, durationMinutes: 75 } });
    expect(senior.subtotalCents).toBe(7000);
    expect(senior.durationMinutes).toBe(75);
  });

  it("falls back to pay-in-person when online payments are unavailable", () => {
    const q = quote({ paymentsEnabled: false });
    expect(q.paymentPolicy).toBe("pay_later");
    expect(q.dueNowCents).toBe(0);
    expect(q.dueLaterCents).toBe(q.totalCents);
  });

  it("never requires full prepayment of an estimate", () => {
    const q = computeQuote({ ...quoteBase(), service: { ...service, priceType: "starting_at", paymentPolicy: "full" } });
    expect(q.isEstimate).toBe(true);
    expect(q.paymentPolicy).toBe("deposit");
  });

  it("quotes are free to book and collect nothing", () => {
    const q = computeQuote({ ...quoteBase(), service: { ...service, priceType: "quote", paymentPolicy: "full" } });
    expect(q.totalCents).toBe(0);
    expect(q.dueNowCents).toBe(0);
    expect(q.isEstimate).toBe(true);
  });

  it("fixed deposits never exceed the total", () => {
    const q = computeQuote({ ...quoteBase(), service: { ...service, depositType: "fixed", depositValue: 999_999 } });
    expect(q.depositCents).toBe(q.totalCents);
  });
});

function quoteBase(): QuoteInput {
  return { currency: "USD", serviceName: "Svc", service, selected: [], taxRateBps: 0, customerFeeBps: 0, paymentsEnabled: true };
}

describe("checkPromotion", () => {
  const rules = {
    isActive: true,
    startsAt: new Date("2026-01-01"),
    endsAt: new Date("2026-12-31"),
    minSubtotalCents: 3000,
    serviceIds: ["s1"],
    newCustomersOnly: true,
    maxRedemptions: 10,
    redemptionCount: 0,
    perCustomerLimit: 1,
  };
  const ctx = { now: new Date("2026-06-01"), serviceId: "s1", subtotalCents: 5000, customerRedemptions: 0, customerPriorVisits: 0 };

  it("accepts an eligible booking", () => expect(checkPromotion(rules, ctx).ok).toBe(true));
  it.each([
    [{ ...rules, isActive: false }, ctx],
    [rules, { ...ctx, now: new Date("2027-01-02") }],
    [rules, { ...ctx, serviceId: "s2" }],
    [rules, { ...ctx, subtotalCents: 1000 }],
    [{ ...rules, redemptionCount: 10 }, ctx],
    [rules, { ...ctx, customerRedemptions: 1 }],
    [rules, { ...ctx, customerPriorVisits: 2 }],
  ])("rejects ineligible case %#", (r, c) => expect(checkPromotion(r, c).ok).toBe(false));
});
