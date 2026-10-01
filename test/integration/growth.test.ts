import { DateTime } from "luxon";
import { eq } from "drizzle-orm";
import { beforeEach, describe, expect, it } from "vitest";
import { AppError } from "@/domain/errors";
import { permissionsFor } from "@/domain/permissions";
import { promotionStatus } from "@/domain/promotions";
import { addDaysIso, todayIn } from "@/domain/time";
import type { Membership } from "@/server/authz";
import { db } from "@/server/db/client";
import { appointments, businessCustomers, businesses, categories, media, payments, portfolioItems, promotions, refunds, reviews, spotlightCampaigns } from "@/server/db/schema";
import { analyticsWindow, businessAnalytics } from "@/server/services/analytics";
import { createBooking, getQuote } from "@/server/services/booking";
import { createReport, respondToReview } from "@/server/services/engagement";
import { addPortfolioItem, listPortfolio, reorderPortfolio, updatePortfolioItem } from "@/server/services/portfolio";
import { listPromotions, promotionSchema, savePromotion, setPromotionActive } from "@/server/services/promotions-admin";
import { listBusinessReviews, reviewSummary } from "@/server/services/reviews-admin";
import { getSpotlight, recordClick, recordImpressions, setSpotlightStatus, startSpotlight } from "@/server/services/spotlight";
import { makeBusiness, makeUser, nyTime, resetDb, type Fixture } from "../support/factory";

const TZ = "America/New_York";

async function code(p: Promise<unknown>): Promise<string> {
  try {
    await p;
    return "ok";
  } catch (e) {
    if (e instanceof AppError) return e.code;
    throw e;
  }
}

const key = () => `k-${Math.random().toString(36).slice(2)}-${Date.now()}`;
const booking = (f: Fixture, start: string, promoCode: string | null) => ({
  serviceId: f.svc.id,
  memberId: "any" as const,
  locationId: f.loc.id,
  start,
  optionIds: [],
  intake: {},
  idempotencyKey: key(),
  source: "marketplace" as const,
  customerNote: null,
  serviceAddress: null,
  promoCode,
});
const quote = (f: Fixture, promoCode: string) => getQuote(null, { serviceId: f.svc.id, memberId: "any", locationId: f.loc.id, optionIds: [], promoCode });
const promo = (over: Record<string, unknown>) => promotionSchema.parse({ code: "SPRING", name: "Spring offer", kind: "percent", value: 20, ...over });

function membership(f: Fixture, role: "owner" | "manager" | "receptionist" | "provider", memberId = f.members[0].id): Membership {
  return { ...f.ownerMembership, role, memberId, permissions: permissionsFor(role) };
}

beforeEach(async () => {
  await resetDb();
});

/* ─────────────────────────────── Promotions ─────────────────────────────── */

describe("promotion codes", () => {
  it("stores whole local days in the business time zone and round-trips them for editing", async () => {
    const f = await makeBusiness();
    const today = todayIn(TZ);
    const row = await savePromotion(f.ownerMembership, f.owner.id, promo({ startsOn: today, endsOn: addDaysIso(today, 6) }));
    expect(row.value).toBe(2000); // 20% → bps
    expect(DateTime.fromJSDate(row.startsAt!, { zone: TZ }).toFormat("yyyy-MM-dd HH:mm")).toBe(`${today} 00:00`);
    expect(DateTime.fromJSDate(row.endsAt!, { zone: TZ }).toFormat("yyyy-MM-dd HH:mm")).toBe(`${addDaysIso(today, 7)} 00:00`);
    const [listed] = await listPromotions(f.ownerMembership);
    expect(listed.startsOn).toBe(today);
    expect(listed.endsOn).toBe(addDaysIso(today, 6));
    expect(listed.status).toBe("active");
  });

  it("agrees with checkout about scheduled, expired and turned-off codes", async () => {
    const f = await makeBusiness();
    const today = todayIn(TZ);
    await savePromotion(f.ownerMembership, f.owner.id, promo({ code: "LATER", startsOn: addDaysIso(today, 2) }));
    const live = await savePromotion(f.ownerMembership, f.owner.id, promo({ code: "TODAY", endsOn: today }));

    const later = await quote(f, "later");
    expect(later.promoError).toBe("This code isn't active yet.");
    expect((await listPromotions(f.ownerMembership)).find((p) => p.code === "LATER")!.status).toBe("scheduled");

    const ok = await quote(f, "today");
    expect(ok.promoError).toBeNull();
    expect(ok.quote.discountCents).toBe(1000);

    await setPromotionActive(f.ownerMembership, f.owner.id, live.id, false);
    expect((await quote(f, "TODAY")).promoError).toBe("This code is no longer active.");
    expect((await listPromotions(f.ownerMembership)).find((p) => p.code === "TODAY")!.status).toBe("paused");

    // An end date that has passed is reported as expired (and rejected at checkout).
    await db.update(promotions).set({ endsAt: new Date(Date.now() - 1000), isActive: true }).where(eq(promotions.id, live.id));
    expect((await quote(f, "TODAY")).promoError).toBe("This code has expired.");
    expect((await listPromotions(f.ownerMembership)).find((p) => p.code === "TODAY")!.status).toBe("expired");
  });

  it("rejects a last day in the past, duplicate codes and other businesses' services", async () => {
    const f = await makeBusiness();
    const other = await makeBusiness();
    const yesterday = addDaysIso(todayIn(TZ), -1);
    const past = await savePromotion(f.ownerMembership, f.owner.id, promo({ endsOn: yesterday })).catch((e: AppError) => e);
    expect(past).toBeInstanceOf(AppError);
    expect((past as AppError).fields?.endsOn).toBeTruthy();

    await savePromotion(f.ownerMembership, f.owner.id, promo({}));
    const dup = await savePromotion(f.ownerMembership, f.owner.id, promo({ code: "spring" })).catch((e: AppError) => e);
    expect((dup as AppError).code).toBe("conflict");
    expect((dup as AppError).fields?.code).toBeTruthy();

    expect(await code(savePromotion(f.ownerMembership, f.owner.id, promo({ code: "X-SVC", serviceIds: [other.svc.id] })))).toBe("validation");
    expect(await code(setPromotionActive(other.ownerMembership, other.owner.id, (await listPromotions(f.ownerMembership))[0].id, false))).toBe("not_found");
  });

  it("gives human validation messages", () => {
    const r = promotionSchema.safeParse({ code: "a b", name: "", kind: "percent", value: 150, startsOn: "2026-05-02", endsOn: "2026-05-01" });
    expect(r.success).toBe(false);
    const msgs = Object.fromEntries(r.error!.issues.map((i) => [i.path.join("."), i.message]));
    expect(msgs.code).toMatch(/at least 3|letters, numbers/i);
    expect(msgs.name).toMatch(/name/i);
  });

  it("enforces per-client and total limits at checkout and counts usage", async () => {
    const f = await makeBusiness({ staff: 2 });
    await savePromotion(f.ownerMembership, f.owner.id, promo({ code: "TWICE", kind: "fixed", value: 500, perCustomerLimit: 1, maxRedemptions: 2 }));
    const [a, b, c] = await Promise.all([makeUser(), makeUser(), makeUser()]);
    expect(await code(createBooking(a, booking(f, nyTime(5, "10:00"), "TWICE")))).toBe("ok");
    expect(await code(createBooking(a, booking(f, nyTime(6, "10:00"), "TWICE")))).toBe("validation"); // already used
    expect(await code(createBooking(b, booking(f, nyTime(7, "10:00"), "TWICE")))).toBe("ok");
    expect(await code(createBooking(c, booking(f, nyTime(8, "10:00"), "TWICE")))).toBe("validation"); // limit reached
    const [p] = await listPromotions(f.ownerMembership);
    expect(p.redemptionCount).toBe(2);
    expect(p.discountCents).toBe(1000);
    expect(p.status).toBe("used_up");
  });

  it("limits a code to selected services", async () => {
    const f = await makeBusiness();
    const [other] = await db.insert((await import("@/server/db/schema")).services).values({ businessId: f.biz.id, name: "Beard", slug: "beard", durationMinutes: 30, priceType: "fixed", priceCents: 2000 }).returning();
    await savePromotion(f.ownerMembership, f.owner.id, promo({ code: "BEARD", serviceIds: [other.id] }));
    expect((await quote(f, "BEARD")).promoError).toBe("This code doesn't apply to this service.");
  });

  it("status helper mirrors checkout order of checks", () => {
    const now = new Date("2026-06-01T12:00:00Z");
    const base = { isActive: true, startsAt: null, endsAt: null, maxRedemptions: null, redemptionCount: 0 };
    expect(promotionStatus(base, now)).toBe("active");
    expect(promotionStatus({ ...base, isActive: false, endsAt: new Date("2020-01-01") }, now)).toBe("paused");
    expect(promotionStatus({ ...base, startsAt: new Date("2026-06-02") }, now)).toBe("scheduled");
    expect(promotionStatus({ ...base, endsAt: new Date("2026-05-31") }, now)).toBe("expired");
    expect(promotionStatus({ ...base, maxRedemptions: 3, redemptionCount: 3 }, now)).toBe("used_up");
  });
});

/* ─────────────────────────────── Spotlight ─────────────────────────────── */

describe("spotlight campaigns", () => {
  it("requires a published profile", async () => {
    const f = await makeBusiness();
    await db.update(businesses).set({ status: "draft" }).where(eq(businesses.id, f.biz.id));
    const s = await getSpotlight(f.ownerMembership);
    expect(s.blockedReason).toMatch(/isn't published/);
    expect(await code(startSpotlight(f.ownerMembership, f.owner.id, { days: 7, categoryId: null }))).toBe("validation");
  });

  it("moves through active → paused → active → ended and keeps one open campaign", async () => {
    const f = await makeBusiness();
    const m = f.ownerMembership;
    const c = await startSpotlight(m, f.owner.id, { days: 14, categoryId: f.cat.id });
    expect(c.status).toBe("active");
    expect(Math.round((c.endsAt.getTime() - c.startsAt.getTime()) / 86_400_000)).toBe(14);
    expect(await code(startSpotlight(m, f.owner.id, { days: 7, categoryId: null }))).toBe("conflict");

    expect((await setSpotlightStatus(m, f.owner.id, c.id, "pause")).status).toBe("paused");
    expect(await code(setSpotlightStatus(m, f.owner.id, c.id, "pause"))).toBe("conflict");
    // A paused campaign still blocks starting another (the DB index only covers 'active').
    expect(await code(startSpotlight(m, f.owner.id, { days: 7, categoryId: null }))).toBe("conflict");

    // Impressions and clicks only count while running.
    await recordImpressions([f.biz.id]);
    await recordClick(f.biz.id);
    expect((await getSpotlight(m)).current).toMatchObject({ impressions: 0, clicks: 0, status: "paused" });

    expect((await setSpotlightStatus(m, f.owner.id, c.id, "resume")).status).toBe("active");
    await recordImpressions([f.biz.id]);
    await recordImpressions([f.biz.id]);
    await recordClick(f.biz.id);
    expect((await getSpotlight(m)).current).toMatchObject({ impressions: 2, clicks: 1, categoryName: "Hair" });

    const ended = await setSpotlightStatus(m, f.owner.id, c.id, "end");
    expect(ended.status).toBe("ended");
    expect(ended.endsAt.getTime()).toBeLessThanOrEqual(Date.now());
    expect(await code(setSpotlightStatus(m, f.owner.id, c.id, "resume"))).toBe("conflict");
    const after = await getSpotlight(m);
    expect(after.current).toBeNull();
    expect(after.past).toHaveLength(1);
    expect(await code(startSpotlight(m, f.owner.id, { days: 7, categoryId: null }))).toBe("ok");
  });

  it("closes campaigns that reach their end date, even while paused", async () => {
    const f = await makeBusiness();
    const c = await startSpotlight(f.ownerMembership, f.owner.id, { days: 7, categoryId: null });
    await setSpotlightStatus(f.ownerMembership, f.owner.id, c.id, "pause");
    await db.update(spotlightCampaigns).set({ endsAt: new Date(Date.now() - 60_000) }).where(eq(spotlightCampaigns.id, c.id));
    expect(await code(setSpotlightStatus(f.ownerMembership, f.owner.id, c.id, "resume"))).toBe("conflict");
    const s = await getSpotlight(f.ownerMembership);
    expect(s.current).toBeNull();
    expect(s.past[0].status).toBe("ended");
  });

  it("only targets the business's own categories and is scoped to the business", async () => {
    const f = await makeBusiness();
    const other = await makeBusiness();
    const [foreign] = await db.insert(categories).values({ slug: `nails-${Date.now()}`, name: "Nails" }).returning();
    expect(await code(startSpotlight(f.ownerMembership, f.owner.id, { days: 7, categoryId: foreign.id }))).toBe("not_found");
    const c = await startSpotlight(f.ownerMembership, f.owner.id, { days: 7, categoryId: null });
    expect(await code(setSpotlightStatus(other.ownerMembership, other.owner.id, c.id, "end"))).toBe("not_found");
    expect(await code(getSpotlight(membership(f, "provider")))).toBe("forbidden");
  });
});

/* ──────────────────────────────── Reviews ──────────────────────────────── */

async function makeReview(f: Fixture, rating: number, body: string | null, opts: { status?: "published" | "hidden"; daysAgo?: number } = {}) {
  const customer = await makeUser({ name: "Dana Whitfield" });
  const [bc] = await db.insert(businessCustomers).values({ businessId: f.biz.id, userId: customer.id, name: customer.name }).returning();
  const start = new Date(Date.now() - (opts.daysAgo ?? 3) * 86_400_000);
  const [a] = await db.insert(appointments).values(appt(f, bc.id, start, "completed", { customerUserId: customer.id })).returning();
  const [r] = await db
    .insert(reviews)
    .values({ appointmentId: a.id, businessId: f.biz.id, memberId: f.members[0].id, serviceId: f.svc.id, customerUserId: customer.id, rating, body, status: opts.status ?? "published", createdAt: start })
    .returning();
  return r;
}

describe("reviews", () => {
  it("summarises published reviews and filters by reply state and rating", async () => {
    const f = await makeBusiness();
    await makeReview(f, 5, "Great fade", { daysAgo: 1 });
    const r4 = await makeReview(f, 4, null, { daysAgo: 2 });
    await makeReview(f, 2, "Ran late", { daysAgo: 3 });
    await makeReview(f, 1, "spam", { status: "hidden" });
    await respondToReview(f.ownerMembership, f.owner.id, r4.id, "Thanks for coming in!");

    const s = await reviewSummary(f.ownerMembership);
    expect(s.count).toBe(3);
    expect(s.average).toBeCloseTo(11 / 3);
    expect(s.distribution).toEqual([
      { rating: 5, count: 1 },
      { rating: 4, count: 1 },
      { rating: 3, count: 0 },
      { rating: 2, count: 1 },
      { rating: 1, count: 0 },
    ]);
    expect(s.needsReply).toBe(2);

    const all = await listBusinessReviews(f.ownerMembership, f.owner.id);
    expect(all.reviews.map((r) => r.rating)).toEqual([5, 4, 2]); // newest first, hidden excluded
    expect(all.reviews[0]).toMatchObject({ authorName: "Dana W.", serviceName: "Signature cut", memberName: "Owner" });
    expect((await listBusinessReviews(f.ownerMembership, f.owner.id, { needsReply: true })).reviews.map((r) => r.rating)).toEqual([5, 2]);
    const four = (await listBusinessReviews(f.ownerMembership, f.owner.id, { rating: 4 })).reviews[0];
    expect(four).toMatchObject({ responseBody: "Thanks for coming in!", responderName: "Owner", reportedByMe: false });

    await createReport(f.owner, { targetType: "review", targetId: r4.id, reason: "fake", details: null });
    expect((await listBusinessReviews(f.ownerMembership, f.owner.id, { rating: 4 })).reviews[0].reportedByMe).toBe(true);
  });

  it("only lets the reviewed business reply, with permission, to published reviews", async () => {
    const f = await makeBusiness({ staff: 2 });
    const other = await makeBusiness();
    const r = await makeReview(f, 3, "Okay");
    const hidden = await makeReview(f, 1, "abuse", { status: "hidden" });
    expect(await code(respondToReview(other.ownerMembership, other.owner.id, r.id, "Not ours"))).toBe("not_found");
    expect(await code(respondToReview(membership(f, "provider", f.members[1].id), f.owner.id, r.id, "Hi"))).toBe("forbidden");
    expect(await code(respondToReview(f.ownerMembership, f.owner.id, hidden.id, "Hello there"))).toBe("not_found");
    expect(await code(respondToReview(f.ownerMembership, f.owner.id, r.id, " "))).toBe("validation");
    expect(await code(respondToReview(membership(f, "manager"), f.owner.id, r.id, "Thank you"))).toBe("ok");
    // Editing replaces the reply.
    await respondToReview(f.ownerMembership, f.owner.id, r.id, "Thanks — see you next time");
    const [row] = await db.select().from(reviews).where(eq(reviews.id, r.id));
    expect(row.responseBody).toBe("Thanks — see you next time");
  });
});

/* ─────────────────────────────── Portfolio ─────────────────────────────── */

async function makeMedia(f: Fixture, status: "ready" | "processing" = "ready", kind: "image" | "video" = "image") {
  const [row] = await db.insert(media).values({ ownerUserId: f.owner.id, businessId: f.biz.id, kind, status, originalKey: `t/${Math.random()}`, mime: "image/webp", bytes: 10 }).returning();
  return row;
}

describe("portfolio", () => {
  it("adds new work at the top, keeps featured first, and reorders like the public profile", async () => {
    const f = await makeBusiness();
    const m = f.ownerMembership;
    const a = await addPortfolioItem(m, f.owner.id, { mediaId: (await makeMedia(f)).id, beforeMediaId: null, caption: "A", serviceId: f.svc.id, memberId: f.members[0].id, isFeatured: false });
    const b = await addPortfolioItem(m, f.owner.id, { mediaId: (await makeMedia(f)).id, beforeMediaId: null, caption: "B", serviceId: null, memberId: null, isFeatured: false });
    const v = await addPortfolioItem(m, f.owner.id, { mediaId: (await makeMedia(f, "processing", "video")).id, beforeMediaId: null, caption: "V", serviceId: null, memberId: null, isFeatured: false });
    expect(v.kind).toBe("video");
    let list = await listPortfolio(f.biz.id);
    expect(list.map((i) => i.caption)).toEqual(["V", "B", "A"]);
    expect(list[0].mediaStatus).toBe("processing");
    expect(list[2]).toMatchObject({ serviceName: "Signature cut", memberName: "Owner", serviceBookable: true });

    await updatePortfolioItem(m, f.owner.id, a.id, { isFeatured: true });
    list = await listPortfolio(f.biz.id);
    expect(list[0].caption).toBe("A");

    await reorderPortfolio(m, [a.id, b.id, v.id]);
    expect((await listPortfolio(f.biz.id)).map((i) => i.caption)).toEqual(["A", "B", "V"]);
    expect(await code(reorderPortfolio(m, [a.id, b.id]))).toBe("conflict");
  });

  it("rejects other businesses' media, services and team members", async () => {
    const f = await makeBusiness();
    const other = await makeBusiness();
    const foreignMedia = await makeMedia(other);
    const base = { beforeMediaId: null, caption: null, serviceId: null, memberId: null, isFeatured: false };
    expect(await code(addPortfolioItem(f.ownerMembership, f.owner.id, { ...base, mediaId: foreignMedia.id }))).toBe("forbidden");
    const mine = await makeMedia(f);
    expect(await code(addPortfolioItem(f.ownerMembership, f.owner.id, { ...base, mediaId: mine.id, serviceId: other.svc.id }))).toBe("not_found");
    expect(await code(addPortfolioItem(f.ownerMembership, f.owner.id, { ...base, mediaId: mine.id, memberId: other.members[0].id }))).toBe("not_found");
    const item = await addPortfolioItem(f.ownerMembership, f.owner.id, { ...base, mediaId: mine.id });
    expect(await code(updatePortfolioItem(other.ownerMembership, other.owner.id, item.id, { caption: "x" }))).toBe("not_found");
    const [row] = await db.select().from(portfolioItems).where(eq(portfolioItems.id, item.id));
    expect(row.caption).toBeNull();
  });
});

/* ─────────────────────────────── Analytics ─────────────────────────────── */

function appt(f: Fixture, businessCustomerId: string, start: Date, status: string, over: Partial<typeof appointments.$inferInsert> = {}): typeof appointments.$inferInsert {
  const end = new Date(start.getTime() + 60 * 60_000);
  return {
    reference: `T${Math.random().toString(36).slice(2, 10)}`,
    businessId: f.biz.id,
    serviceId: f.svc.id,
    memberId: f.members[0].id,
    businessCustomerId,
    status: status as typeof appointments.$inferInsert.status,
    source: "marketplace",
    startsAt: start,
    endsAt: end,
    blockStartsAt: start,
    blockEndsAt: end,
    timezone: TZ,
    snapshot: { serviceName: "Signature cut" } as typeof appointments.$inferInsert.snapshot,
    currency: "USD",
    subtotalCents: 5000,
    totalCents: 5000,
    paymentStatus: "pay_in_person",
    checkInCode: Math.random().toString(36).slice(2, 14),
    ...over,
  };
}

/** A New York wall-clock instant on a local date. */
const ny = (date: string, hhmm: string) => DateTime.fromISO(`${date}T${hhmm}`, { zone: TZ }).toJSDate();

describe("businessAnalytics", () => {
  it("uses whole local days in the business time zone", () => {
    // 02:00 UTC on Mar 10 is still Mar 9 in New York.
    const w = analyticsWindow(TZ, 7, new Date("2026-03-10T02:00:00Z"));
    expect(w.lastDay).toBe("2026-03-09");
    expect(w.firstDay).toBe("2026-03-03");
    expect(w.prevFirstDay).toBe("2026-02-24");
    expect(DateTime.fromJSDate(w.start, { zone: TZ }).toFormat("yyyy-MM-dd HH:mm")).toBe("2026-03-03 00:00");
    // DST starts Mar 8 2026: the window end is still local midnight.
    expect(DateTime.fromJSDate(w.end, { zone: TZ }).toFormat("yyyy-MM-dd HH:mm")).toBe("2026-03-10 00:00");
  });

  it("aggregates a small fixture correctly, with comparison and per-day buckets", async () => {
    const f = await makeBusiness({ staff: 2 });
    // "Now" is fixed: Wed 2026-06-10 15:00 New York.
    const now = ny("2026-06-10", "15:00");
    const [regular, newbie, other] = await db
      .insert(businessCustomers)
      .values([
        { businessId: f.biz.id, name: "Regular" },
        { businessId: f.biz.id, name: "Newbie" },
        { businessId: f.biz.id, name: "Other" },
      ])
      .returning();
    // Before the comparison window: the regular's first completed visit.
    await db.insert(appointments).values(appt(f, regular.id, ny("2026-05-01", "10:00"), "completed"));
    // Previous 7-day period (May 28 – Jun 3): one completed visit, $30 collected.
    const [prevDone] = await db.insert(appointments).values(appt(f, other.id, ny("2026-06-01", "10:00"), "completed", { subtotalCents: 3000, totalCents: 3000 })).returning();
    await db.insert(payments).values({ appointmentId: prevDone.id, businessId: f.biz.id, kind: "full", provider: "manual", amountCents: 3000, currency: "USD", status: "succeeded", succeededAt: ny("2026-06-01", "11:00") });

    // Current period (Jun 4 – Jun 10):
    const [done1] = await db
      .insert(appointments)
      .values(appt(f, regular.id, ny("2026-06-04", "23:30"), "completed", { discountCents: 1000 })) // late evening: still Jun 4 locally
      .returning();
    const [done2] = await db.insert(appointments).values(appt(f, newbie.id, ny("2026-06-05", "10:00"), "completed", { memberId: f.members[1].id, source: "manual" })).returning();
    await db.insert(appointments).values(appt(f, newbie.id, ny("2026-06-06", "10:00"), "no_show"));
    await db.insert(appointments).values(appt(f, other.id, ny("2026-06-07", "10:00"), "cancelled"));
    await db.insert(appointments).values(appt(f, other.id, ny("2026-06-08", "09:00"), "confirmed")); // past but not closed out
    await db.insert(appointments).values(appt(f, other.id, ny("2026-06-10", "17:00"), "confirmed")); // later today
    await db.insert(appointments).values(appt(f, other.id, ny("2026-06-09", "12:00"), "expired")); // ignored
    await db.insert(appointments).values(appt(f, other.id, ny("2026-06-11", "12:00"), "confirmed")); // tomorrow: outside
    const [pay1] = await db
      .insert(payments)
      .values({ appointmentId: done1.id, businessId: f.biz.id, kind: "full", provider: "manual", amountCents: 4000, currency: "USD", status: "succeeded", succeededAt: ny("2026-06-04", "23:45") })
      .returning();
    await db.insert(payments).values({ appointmentId: done2.id, businessId: f.biz.id, kind: "full", provider: "stripe", amountCents: 5000, currency: "USD", status: "succeeded", succeededAt: ny("2026-06-05", "10:30") });
    await db.insert(payments).values({ appointmentId: done2.id, businessId: f.biz.id, kind: "tip", provider: "stripe", amountCents: 700, currency: "USD", status: "failed" });
    await db.insert(refunds).values({ paymentId: pay1.id, appointmentId: done1.id, amountCents: 500, status: "succeeded", createdAt: ny("2026-06-06", "09:00") });

    const r = await businessAnalytics(f.ownerMembership, 7, now);
    expect(r.window).toEqual({ firstDay: "2026-06-04", lastDay: "2026-06-10", prevFirstDay: "2026-05-28" });
    const c = r.current;
    expect(c.bookings).toBe(5); // 2 completed, 1 no-show, 2 confirmed
    expect(c.completed).toBe(2);
    expect(c.noShows).toBe(1);
    expect(c.cancelled).toBe(1);
    expect(c.due).toBe(4); // later-today booking hasn't happened yet
    expect(c.unresolved).toBe(1);
    expect(c.completionRate).toBeCloseTo(0.5);
    expect(c.noShowRate).toBeCloseTo(0.25);
    expect(c.earnedCents).toBe(4000 + 5000);
    expect(c.avgTicketCents).toBe(4500);
    expect(c.collectedCents).toBe(4000 + 5000 - 500);
    expect(c.clients).toBe(3);
    expect(c.returningClients).toBe(2); // "regular" (May 1) and "other" (Jun 1) had completed visits before Jun 4
    expect(c.newClients).toBe(1);
    expect(c.onlineBookings).toBe(4);

    expect(r.previous).toMatchObject({ bookings: 1, completed: 1, collectedCents: 3000, earnedCents: 3000 });

    expect(r.series).toHaveLength(7);
    const day = (d: string) => r.series.find((s) => s.day === d)!;
    expect(day("2026-06-04")).toEqual({ day: "2026-06-04", bookings: 1, collected: 4000 });
    expect(day("2026-06-05")).toEqual({ day: "2026-06-05", bookings: 1, collected: 5000 });
    expect(day("2026-06-06")).toEqual({ day: "2026-06-06", bookings: 1, collected: -500 });
    expect(day("2026-06-07").bookings).toBe(0);
    expect(r.series.reduce((s, x) => s + x.bookings, 0)).toBe(c.bookings);

    expect(r.byService).toEqual([{ name: "Signature cut", bookings: 5, completed: 2, earned: 9000 }]);
    expect(r.byStaff.map((s) => [s.name, s.bookings, s.completed, s.earnedCents])).toEqual([
      ["Owner", 4, 1, 4000],
      ["Pro 1", 1, 1, 5000],
    ]);
    // 23:30 on Thu Jun 4 lands in hour 23 of ISO weekday 4.
    expect(r.heat.find((h) => h.dow === 4 && h.hour === 23)?.n).toBe(1);
  });

  it("limits own-scope viewers to their own appointments", async () => {
    const f = await makeBusiness({ staff: 2 });
    const now = ny("2026-06-10", "15:00");
    const [cust] = await db.insert(businessCustomers).values({ businessId: f.biz.id, name: "C" }).returning();
    await db.insert(appointments).values(appt(f, cust.id, ny("2026-06-09", "10:00"), "completed"));
    await db.insert(appointments).values(appt(f, cust.id, ny("2026-06-09", "12:00"), "completed", { memberId: f.members[1].id }));
    const own: Membership = { ...f.ownerMembership, memberId: f.members[1].id, role: "custom", permissions: new Set(["analytics.view", "appointments.manage_own"]) };
    const r = await businessAnalytics(own, 7, now);
    expect(r.current.bookings).toBe(1);
    expect(r.byStaff).toEqual([]);
    expect(r.scopedToSelf).toBe(true);
    expect(await code(businessAnalytics(membership(f, "provider"), 7, now))).toBe("forbidden");
  });
});
