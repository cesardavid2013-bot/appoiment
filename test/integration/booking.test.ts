import { and, eq, sql } from "drizzle-orm";
import { beforeEach, describe, expect, it } from "vitest";
import { AppError } from "@/domain/errors";
import { db } from "@/server/db/client";
import { appointments, businesses, jobs, notifications, occupancies, payments, promotions, timeBlocks } from "@/server/db/schema";
import { getSlots } from "@/server/services/availability";
import { businessCancel, businessTransition, createBooking, customerCancel, expireRequest, getQuote, reschedule } from "@/server/services/booking";
import { markPaymentSucceeded } from "@/server/services/payments";
import { makeBusiness, makeUser, nyTime, resetDb } from "../support/factory";

const key = () => `k-${Math.random().toString(36).slice(2)}-${Date.now()}`;
const base = (f: Awaited<ReturnType<typeof makeBusiness>>, start: string, extra: Record<string, unknown> = {}) => ({
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
  ...extra,
});

async function errorCode(p: Promise<unknown>): Promise<string> {
  try {
    await p;
    return "ok";
  } catch (e) {
    if (e instanceof AppError) return e.code;
    throw e;
  }
}

beforeEach(async () => {
  await resetDb();
});

describe("createBooking", () => {
  it("confirms an available slot, reserves time and notifies both sides", async () => {
    const f = await makeBusiness();
    const customer = await makeUser();
    const res = await createBooking(customer, base(f, nyTime(10, "10:00")));
    expect(res.status).toBe("confirmed");
    const [a] = await db.select().from(appointments).where(eq(appointments.id, res.appointmentId));
    expect(a.totalCents).toBe(5000);
    expect(a.paymentStatus).toBe("pay_in_person");
    expect(a.memberId).toBe(f.members[0].id);
    const occ = await db.select().from(occupancies).where(eq(occupancies.appointmentId, a.id));
    expect(occ).toHaveLength(1);
    const notes = await db.select().from(notifications);
    expect(notes.map((n) => n.userId).sort()).toEqual([customer.id, f.owner.id].sort());
    const emailJobs = await db.select().from(jobs).where(eq(jobs.type, "email.send"));
    expect(emailJobs.length).toBeGreaterThanOrEqual(2);
    const reminders = await db.select().from(jobs).where(eq(jobs.type, "appointment.reminder"));
    expect(reminders).toHaveLength(2); // 24h and 2h before
  });

  it("is idempotent for retried submissions", async () => {
    const f = await makeBusiness();
    const customer = await makeUser();
    const input = base(f, nyTime(10, "11:00"));
    const [a, b] = await Promise.all([createBooking(customer, input), createBooking(customer, input)]);
    expect(a.appointmentId).toBe(b.appointmentId);
    const rows = await db.select().from(appointments);
    expect(rows).toHaveLength(1);
  });

  it("never double-books under concurrent requests for the same professional", async () => {
    const f = await makeBusiness();
    const customers = await Promise.all(Array.from({ length: 10 }, () => makeUser()));
    const start = nyTime(12, "14:00");
    const results = await Promise.all(customers.map((c) => errorCode(createBooking(c, base(f, start, { memberId: f.members[0].id })))));
    expect(results.filter((r) => r === "ok")).toHaveLength(1);
    expect(results.filter((r) => r === "slot_unavailable")).toHaveLength(9);
    const [{ n }] = await db.select({ n: sql<number>`count(*)::int` }).from(occupancies);
    expect(n).toBe(1);
  });

  it("spreads 'any available' bookings across staff without overlap", async () => {
    const f = await makeBusiness({ staff: 2 });
    const customers = await Promise.all(Array.from({ length: 6 }, () => makeUser()));
    const start = nyTime(12, "15:00");
    const results = await Promise.all(customers.map((c) => errorCode(createBooking(c, base(f, start)))));
    expect(results.filter((r) => r === "ok")).toHaveLength(2);
    const rows = await db.select({ memberId: appointments.memberId }).from(appointments).where(eq(appointments.status, "confirmed"));
    expect(new Set(rows.map((r) => r.memberId)).size).toBe(2);
  });

  it("rejects times outside hours, misaligned, blocked or too soon", async () => {
    const f = await makeBusiness({ minNotice: 120 });
    const c = await makeUser();
    expect(await errorCode(createBooking(c, base(f, nyTime(10, "16:30"))))).toBe("slot_unavailable"); // ends after close
    expect(await errorCode(createBooking(c, base(f, nyTime(10, "10:07"))))).toBe("slot_unavailable"); // not on the grid
    expect(await errorCode(createBooking(c, base(f, new Date(Date.now() + 30 * 60_000).toISOString())))).toBe("slot_unavailable");
    await db.insert(timeBlocks).values({ businessId: f.biz.id, memberId: f.members[0].id, startsAt: new Date(nyTime(11, "12:00")), endsAt: new Date(nyTime(11, "13:00")), reason: "break" });
    expect(await errorCode(createBooking(c, base(f, nyTime(11, "11:30"))))).toBe("slot_unavailable");
    expect(await errorCode(createBooking(c, base(f, nyTime(11, "13:00"))))).toBe("ok");
  });

  it("honours cleanup buffers between appointments", async () => {
    const f = await makeBusiness({ bufferAfter: 15 });
    const [c1, c2] = [await makeUser(), await makeUser()];
    await createBooking(c1, base(f, nyTime(10, "10:00")));
    expect(await errorCode(createBooking(c2, base(f, nyTime(10, "11:00"))))).toBe("slot_unavailable");
    expect(await errorCode(createBooking(c2, base(f, nyTime(10, "11:15"))))).toBe("ok");
  });

  it("refuses to let owners book their own business as a customer", async () => {
    const f = await makeBusiness();
    expect(await errorCode(createBooking(f.owner, base(f, nyTime(10, "10:00"))))).toBe("validation");
  });

  it("limits upcoming bookings for unverified emails", async () => {
    const f = await makeBusiness();
    const c = await makeUser({ emailVerifiedAt: null });
    for (const t of ["09:00", "10:00", "11:00"]) expect(await errorCode(createBooking(c, base(f, nyTime(10, t))))).toBe("ok");
    expect(await errorCode(createBooking(c, base(f, nyTime(10, "12:00"))))).toBe("forbidden");
  });
});

describe("slots", () => {
  it("removes booked times from availability", async () => {
    const f = await makeBusiness();
    const c = await makeUser();
    const start = nyTime(9, "13:00");
    const date = start.slice(0, 10);
    const before = await getSlots({ serviceId: f.svc.id, memberId: "any", locationId: f.loc.id, fromDate: date, toDate: date, optionIds: [] });
    expect(before.days[0].slots.some((s) => s.start === new Date(start).toISOString())).toBe(true);
    await createBooking(c, base(f, start));
    const after = await getSlots({ serviceId: f.svc.id, memberId: "any", locationId: f.loc.id, fromDate: date, toDate: date, optionIds: [] });
    expect(after.days[0].slots.some((s) => s.start === new Date(start).toISOString())).toBe(false);
    expect(after.days[0].slots.some((s) => s.start === new Date(nyTime(9, "12:30")).toISOString())).toBe(false); // would overlap
  });
});

describe("cancellation & rescheduling", () => {
  it("customer cancellation releases the slot for someone else", async () => {
    const f = await makeBusiness();
    const [c1, c2] = [await makeUser(), await makeUser()];
    const start = nyTime(10, "10:00");
    const r = await createBooking(c1, base(f, start));
    expect(await errorCode(createBooking(c2, base(f, start)))).toBe("slot_unavailable");
    await customerCancel(c1, r.appointmentId, "Plans changed");
    expect(await errorCode(createBooking(c2, base(f, start)))).toBe("ok");
    const waitlistJobs = await db.select().from(jobs).where(eq(jobs.type, "waitlist.check"));
    expect(waitlistJobs).toHaveLength(1);
  });

  it("customers can't cancel other people's appointments", async () => {
    const f = await makeBusiness();
    const [c1, intruder] = [await makeUser(), await makeUser()];
    const r = await createBooking(c1, base(f, nyTime(10, "10:00")));
    expect(await errorCode(customerCancel(intruder, r.appointmentId, null))).toBe("not_found");
  });

  it("reschedules into free time and refuses occupied time", async () => {
    const f = await makeBusiness();
    const [c1, c2] = [await makeUser(), await makeUser()];
    const r1 = await createBooking(c1, base(f, nyTime(10, "10:00")));
    await createBooking(c2, base(f, nyTime(10, "12:00")));
    expect(await errorCode(reschedule({ type: "customer", userId: c1.id }, r1.appointmentId, { start: nyTime(10, "11:30"), memberId: "same" }))).toBe("slot_unavailable");
    const moved = await reschedule({ type: "customer", userId: c1.id }, r1.appointmentId, { start: nyTime(10, "14:00"), memberId: "same" });
    expect(moved.moved).toBe(true);
    // Old time is free again.
    const c3 = await makeUser();
    expect(await errorCode(createBooking(c3, base(f, nyTime(10, "10:00"))))).toBe("ok");
    const [a] = await db.select().from(appointments).where(eq(appointments.id, r1.appointmentId));
    expect(a.rescheduleCount).toBe(1);
  });

  it("a reschedule racing a new booking for the same time yields exactly one winner", async () => {
    const f = await makeBusiness();
    const [c1, c2] = [await makeUser(), await makeUser()];
    const r1 = await createBooking(c1, base(f, nyTime(10, "09:00")));
    const target = nyTime(10, "15:00");
    const outcomes = await Promise.all([
      errorCode(reschedule({ type: "customer", userId: c1.id }, r1.appointmentId, { start: target, memberId: "same" })),
      errorCode(createBooking(c2, base(f, target))),
    ]);
    expect(outcomes.filter((o) => o === "ok")).toHaveLength(1);
    const [{ n }] = await db
      .select({ n: sql<number>`count(*)::int` })
      .from(appointments)
      .where(and(eq(appointments.startsAt, new Date(target)), eq(appointments.status, "confirmed")));
    expect(n).toBe(1);
  });

  it("business cancellation of another business's appointment is rejected", async () => {
    const f1 = await makeBusiness();
    const f2 = await makeBusiness();
    const c = await makeUser();
    const r = await createBooking(c, base(f1, nyTime(10, "10:00")));
    expect(await errorCode(businessCancel(f2.owner.id, r.appointmentId, f2.biz.id, null))).toBe("not_found");
    expect(await errorCode(businessTransition(f2.owner.id, f2.biz.id, r.appointmentId, "check_in"))).toBe("not_found");
  });
});

describe("request mode", () => {
  it("holds the slot while pending, then approves", async () => {
    const f = await makeBusiness({ bookingMode: "request" });
    const [c1, c2] = [await makeUser(), await makeUser()];
    const start = nyTime(10, "10:00");
    const r = await createBooking(c1, base(f, start));
    expect(r.status).toBe("requested");
    expect(await errorCode(createBooking(c2, base(f, start)))).toBe("slot_unavailable");
    const approved = await businessTransition(f.owner.id, f.biz.id, r.appointmentId, "approve");
    expect(approved.status).toBe("confirmed");
  });

  it("unanswered requests expire and free the slot", async () => {
    const f = await makeBusiness({ bookingMode: "request" });
    const [c1, c2] = [await makeUser(), await makeUser()];
    const start = nyTime(10, "10:00");
    const r = await createBooking(c1, base(f, start));
    expect(await expireRequest(r.appointmentId)).toBe("expired");
    expect(await expireRequest(r.appointmentId)).toBe("noop");
    expect(await errorCode(createBooking(c2, base(f, start)))).toBe("ok");
  });
});

describe("group sessions", () => {
  it("fills capacity exactly under concurrency", async () => {
    const f = await makeBusiness({ capacity: 3 });
    const customers = await Promise.all(Array.from({ length: 6 }, () => makeUser()));
    const start = nyTime(10, "10:00");
    const results = await Promise.all(customers.map((c) => errorCode(createBooking(c, base(f, start)))));
    expect(results.filter((r) => r === "ok")).toHaveLength(3);
    const [{ n }] = await db.select({ n: sql<number>`count(*)::int` }).from(occupancies);
    expect(n).toBe(1); // one staff reservation shared by the class
  });
});

describe("promotions", () => {
  it("applies server-side discounts and enforces redemption limits under concurrency", async () => {
    const f = await makeBusiness({ staff: 3 });
    await db.insert(promotions).values({ businessId: f.biz.id, code: "WELCOME", name: "Welcome", kind: "percent", value: 2000, maxRedemptions: 1 });
    const q = await getQuote(null, { serviceId: f.svc.id, memberId: "any", locationId: f.loc.id, optionIds: [], promoCode: "welcome" });
    expect(q.quote.discountCents).toBe(1000);
    const customers = await Promise.all(Array.from({ length: 3 }, () => makeUser()));
    const results = await Promise.all(customers.map((c) => errorCode(createBooking(c, base(f, nyTime(10, "10:00"), { promoCode: "WELCOME" })))));
    expect(results.filter((r) => r === "ok")).toHaveLength(1);
    const [p] = await db.select().from(promotions);
    expect(p.redemptionCount).toBe(1);
  });

  it("returns the redemption when the booking is cancelled", async () => {
    const f = await makeBusiness();
    await db.insert(promotions).values({ businessId: f.biz.id, code: "ONCE", name: "Once", kind: "fixed", value: 500, maxRedemptions: 1 });
    const c = await makeUser();
    const r = await createBooking(c, base(f, nyTime(10, "10:00"), { promoCode: "ONCE" }));
    const [a] = await db.select().from(appointments).where(eq(appointments.id, r.appointmentId));
    expect(a.totalCents).toBe(4500);
    await customerCancel(c, r.appointmentId, null);
    const [p] = await db.select().from(promotions);
    expect(p.redemptionCount).toBe(0);
  });
});

describe("payment confirmation", () => {
  it("applies a webhook exactly once and confirms the hold", async () => {
    const f = await makeBusiness();
    const c = await makeUser();
    const r = await createBooking(c, base(f, nyTime(10, "10:00")));
    // Simulate a booking that required a deposit.
    await db.update(appointments).set({ status: "pending_payment", depositDueCents: 2000, paymentStatus: "unpaid", holdExpiresAt: new Date(Date.now() + 600_000) }).where(eq(appointments.id, r.appointmentId));
    await db.insert(payments).values({ appointmentId: r.appointmentId, businessId: f.biz.id, customerUserId: c.id, kind: "deposit", provider: "stripe", providerPaymentId: "pi_test_1", amountCents: 2000, currency: "USD", status: "requires_payment" });
    await Promise.all([markPaymentSucceeded("pi_test_1", 2000), markPaymentSucceeded("pi_test_1", 2000)]);
    await markPaymentSucceeded("pi_test_1", 2000);
    const [a] = await db.select().from(appointments).where(eq(appointments.id, r.appointmentId));
    expect(a.status).toBe("confirmed");
    expect(a.amountPaidCents).toBe(2000);
    expect(a.paymentStatus).toBe("deposit_paid");
  });

  it("reinstates an expired hold when payment lands late and the slot is still free", async () => {
    const f = await makeBusiness();
    const c = await makeUser();
    const r = await createBooking(c, base(f, nyTime(10, "10:00")));
    await db.update(appointments).set({ status: "expired", depositDueCents: 2000 }).where(eq(appointments.id, r.appointmentId));
    await db.delete(occupancies).where(eq(occupancies.appointmentId, r.appointmentId));
    await db.insert(payments).values({ appointmentId: r.appointmentId, businessId: f.biz.id, customerUserId: c.id, kind: "deposit", provider: "stripe", providerPaymentId: "pi_test_2", amountCents: 2000, currency: "USD", status: "requires_payment" });
    await markPaymentSucceeded("pi_test_2", 2000);
    const [a] = await db.select().from(appointments).where(eq(appointments.id, r.appointmentId));
    expect(a.status).toBe("confirmed");
    expect(await db.select().from(occupancies).where(eq(occupancies.appointmentId, a.id))).toHaveLength(1);
  });
});

describe("business lifecycle", () => {
  it("completes appointments and updates CRM aggregates; blocks premature completion", async () => {
    const f = await makeBusiness();
    const c = await makeUser();
    const r = await createBooking(c, base(f, nyTime(10, "10:00")));
    expect(await errorCode(businessTransition(f.owner.id, f.biz.id, r.appointmentId, "complete"))).toBe("conflict");
    const past = { startsAt: new Date(Date.now() - 3600_000), endsAt: new Date(Date.now() - 60_000) };
    await db.update(appointments).set({ ...past, blockStartsAt: past.startsAt, blockEndsAt: past.endsAt }).where(eq(appointments.id, r.appointmentId));
    const done = await businessTransition(f.owner.id, f.biz.id, r.appointmentId, "complete");
    expect(done.status).toBe("completed");
    expect(await errorCode(businessTransition(f.owner.id, f.biz.id, r.appointmentId, "check_in"))).toBe("conflict");
    const reviewJobs = await db.select().from(jobs).where(eq(jobs.type, "appointment.review_request"));
    expect(reviewJobs).toHaveLength(1);
  });

  it("rejects stale edits via optimistic versioning", async () => {
    const f = await makeBusiness();
    const c = await makeUser();
    const r = await createBooking(c, base(f, nyTime(10, "10:00")));
    expect(await errorCode(businessTransition(f.owner.id, f.biz.id, r.appointmentId, "check_in", 99))).toBe("conflict");
  });

  it("suspended businesses are not bookable", async () => {
    const f = await makeBusiness();
    await db.update(businesses).set({ status: "suspended" }).where(eq(businesses.id, f.biz.id));
    expect(await errorCode(createBooking(await makeUser(), base(f, nyTime(10, "10:00"))))).toBe("not_found");
  });
});
