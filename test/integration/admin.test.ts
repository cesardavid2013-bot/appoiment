import { and, eq } from "drizzle-orm";
import { beforeEach, describe, expect, it } from "vitest";
import { AppError } from "@/domain/errors";
import { db } from "@/server/db/client";
import { auditLogs, businesses, categories, jobs, notifications, reports, reviews, sessions, supportMessages, supportTickets, users, verificationRequests } from "@/server/db/schema";
import { setTicketStatus, staffReply } from "@/server/services/admin-support";
import {
  adminOverview,
  decideVerification,
  deleteCategory,
  resolveReport,
  retryJob,
  setBusinessStatus,
  setBusinessVerification,
  setUserRole,
  setUserStatus,
} from "@/server/services/admin";
import { submitVerification } from "@/server/services/verification";
import { makeBusiness, makeUser, resetDb } from "../support/factory";

async function errorCode(p: Promise<unknown>): Promise<string> {
  try {
    await p;
    return "ok";
  } catch (e) {
    if (e instanceof AppError) return e.code;
    throw e;
  }
}

const makeAdmin = () => makeUser({ name: "Admin", platformRole: "admin" });
const auditFor = (action: string) => db.select().from(auditLogs).where(eq(auditLogs.action, action));

async function addSessions(userId: string, n: number) {
  for (let i = 0; i < n; i++) await db.insert(sessions).values({ id: `s-${userId}-${i}`, userId, expiresAt: new Date(Date.now() + 86_400_000) });
}

beforeEach(async () => {
  await resetDb();
});

describe("authorization", () => {
  it("rejects non-admins with not_found and changes nothing", async () => {
    const customer = await makeUser();
    const target = await makeUser();
    await addSessions(target.id, 2);
    expect(await errorCode(setUserStatus(customer, target.id, { status: "suspended", reason: "spam account" }))).toBe("not_found");
    const [u] = await db.select().from(users).where(eq(users.id, target.id));
    expect(u.status).toBe("active");
    expect(await db.select().from(sessions).where(eq(sessions.userId, target.id))).toHaveLength(2);
    expect(await db.select().from(auditLogs)).toHaveLength(0);
  });

  it("lets support agents answer tickets but not run admin-only actions", async () => {
    const support = await makeUser({ platformRole: "support" });
    const target = await makeUser();
    expect(await errorCode(setUserStatus(support, target.id, { status: "suspended", reason: "testing support" }))).toBe("not_found");
    const [t] = await db.insert(supportTickets).values({ userId: target.id, category: "account", subject: "Can't log in" }).returning();
    await staffReply(support, t.id, { body: "Try resetting your password.", status: "awaiting_customer" });
    const [after] = await db.select().from(supportTickets).where(eq(supportTickets.id, t.id));
    expect(after.status).toBe("awaiting_customer");
  });

  it("refuses to let admins suspend or demote themselves", async () => {
    const admin = await makeAdmin();
    expect(await errorCode(setUserStatus(admin, admin.id, { status: "suspended", reason: "oops" }))).toBe("conflict");
    expect(await errorCode(setUserRole(admin, admin.id, { role: "user", reason: "oops" }))).toBe("conflict");
  });
});

describe("users", () => {
  it("suspending a user destroys every session and is audited", async () => {
    const admin = await makeAdmin();
    const target = await makeUser();
    await addSessions(target.id, 3);
    await setUserStatus(admin, target.id, { status: "suspended", reason: "Fraudulent bookings" });
    const [u] = await db.select().from(users).where(eq(users.id, target.id));
    expect(u.status).toBe("suspended");
    expect(await db.select().from(sessions).where(eq(sessions.userId, target.id))).toHaveLength(0);
    const [entry] = await auditFor("admin.user.suspended");
    expect(entry).toMatchObject({ actorUserId: admin.id, actorType: "admin", targetType: "user", targetId: target.id });
    expect(entry.metadata).toMatchObject({ from: "active", to: "suspended", reason: "Fraudulent bookings" });

    expect(await errorCode(setUserStatus(admin, target.id, { status: "suspended", reason: "again" }))).toBe("conflict");
    await setUserStatus(admin, target.id, { status: "active", reason: "Appeal accepted" });
    expect((await db.select().from(users).where(eq(users.id, target.id)))[0].status).toBe("active");
    expect(await auditFor("admin.user.reactivated")).toHaveLength(1);
  });

  it("changes platform roles with an audit trail", async () => {
    const admin = await makeAdmin();
    const target = await makeUser();
    await setUserRole(admin, target.id, { role: "support", reason: "Joined the support team" });
    expect((await db.select().from(users).where(eq(users.id, target.id)))[0].platformRole).toBe("support");
    const [entry] = await auditFor("admin.user.role_changed");
    expect(entry.metadata).toMatchObject({ from: "user", to: "support" });
  });
});

describe("verification", () => {
  it("a business submission goes pending, and an admin decision updates request and business", async () => {
    const admin = await makeAdmin();
    const f = await makeBusiness();
    const req = await submitVerification(f.ownerMembership, f.owner.id, { details: "State license #123", documentMediaIds: [] });
    expect((await db.select().from(businesses).where(eq(businesses.id, f.biz.id)))[0].verificationStatus).toBe("pending");
    expect(await errorCode(submitVerification(f.ownerMembership, f.owner.id, { details: "again", documentMediaIds: [] }))).toBe("conflict");

    // Rejecting or asking for info needs a note for the owner.
    expect(await errorCode(decideVerification(admin, req.id, { status: "needs_info", note: null }))).toBe("validation");

    await decideVerification(admin, req.id, { status: "verified", note: null });
    const [b] = await db.select().from(businesses).where(eq(businesses.id, f.biz.id));
    expect(b.verificationStatus).toBe("verified");
    const [r] = await db.select().from(verificationRequests).where(eq(verificationRequests.id, req.id));
    expect(r).toMatchObject({ status: "verified", reviewedByUserId: admin.id });
    expect(r.reviewedAt).not.toBeNull();
    expect(await auditFor("admin.verification.verified")).toHaveLength(1);
    const notes = await db.select().from(notifications).where(eq(notifications.userId, f.owner.id));
    expect(notes.map((n) => n.type)).toContain("verification.verified");

    expect(await errorCode(decideVerification(admin, req.id, { status: "rejected", note: "late" }))).toBe("conflict");
    expect(await errorCode(submitVerification(f.ownerMembership, f.owner.id, { details: "x", documentMediaIds: [] }))).toBe("conflict");
  });

  it("setting status from the business page closes the open request", async () => {
    const admin = await makeAdmin();
    const f = await makeBusiness();
    const req = await submitVerification(f.ownerMembership, f.owner.id, { details: "Please verify", documentMediaIds: [] });
    await setBusinessVerification(admin, f.biz.id, { status: "needs_info", note: "Upload your license" });
    const [r] = await db.select().from(verificationRequests).where(eq(verificationRequests.id, req.id));
    expect(r.status).toBe("needs_info");
    expect(r.decisionNote).toBe("Upload your license");
  });
});

describe("businesses", () => {
  it("suspends and reinstates a business, notifying the owner", async () => {
    const admin = await makeAdmin();
    const f = await makeBusiness();
    await db.update(businesses).set({ publishedAt: new Date() }).where(eq(businesses.id, f.biz.id));
    await setBusinessStatus(admin, f.biz.id, { action: "suspend", reason: "Off-platform payments" });
    expect((await db.select().from(businesses).where(eq(businesses.id, f.biz.id)))[0].status).toBe("suspended");
    const notes = await db.select().from(notifications).where(eq(notifications.userId, f.owner.id));
    expect(notes.map((n) => n.type)).toContain("business.suspended");
    const [entry] = await auditFor("admin.business.suspended");
    expect(entry).toMatchObject({ businessId: f.biz.id, actorType: "admin" });

    await setBusinessStatus(admin, f.biz.id, { action: "unsuspend", reason: "Resolved" });
    expect((await db.select().from(businesses).where(eq(businesses.id, f.biz.id)))[0].status).toBe("active");
  });
});

describe("moderation & system", () => {
  it("resolving a review report hides the review and closes every open report on it", async () => {
    const admin = await makeAdmin();
    const f = await makeBusiness();
    const customer = await makeUser();
    const [r1, r2] = [await makeUser(), await makeUser()];
    const { appointments, businessCustomers } = await import("@/server/db/schema");
    const [bc] = await db.insert(businessCustomers).values({ businessId: f.biz.id, userId: customer.id, name: customer.name }).returning();
    const start = new Date(Date.now() - 3 * 86_400_000);
    const end = new Date(start.getTime() + 3_600_000);
    const [appt] = await db
      .insert(appointments)
      .values({
        reference: "TST-001",
        businessId: f.biz.id,
        serviceId: f.svc.id,
        memberId: f.members[0].id,
        customerUserId: customer.id,
        businessCustomerId: bc.id,
        status: "completed",
        startsAt: start,
        endsAt: end,
        blockStartsAt: start,
        blockEndsAt: end,
        timezone: "America/New_York",
        snapshot: { serviceName: "Cut", durationMinutes: 60, priceType: "fixed", options: [], memberName: null, locationName: null, locationKind: null, address: null, cancellationWindowHours: 24, rescheduleWindowHours: 24, depositRefundable: true, lateCancelFeePercent: 0, noShowFeePercent: 0, lines: [] },
        currency: "USD",
        subtotalCents: 5000,
        totalCents: 5000,
        paymentStatus: "pay_in_person",
        checkInCode: "x",
      })
      .returning();
    const [review] = await db.insert(reviews).values({ appointmentId: appt.id, businessId: f.biz.id, customerUserId: customer.id, rating: 1, body: "bad" }).returning();
    const [rep1] = await db.insert(reports).values({ reporterUserId: r1.id, targetType: "review", targetId: review.id, reason: "fake" }).returning();
    await db.insert(reports).values({ reporterUserId: r2.id, targetType: "review", targetId: review.id, reason: "spam" });

    const res = await resolveReport(admin, rep1.id, { status: "resolved", resolution: "Not a real visit", reviewAction: "hidden" });
    expect(res.closed).toBe(2);
    expect((await db.select().from(reviews).where(eq(reviews.id, review.id)))[0].status).toBe("hidden");
    expect(await db.select().from(reports).where(eq(reports.status, "open"))).toHaveLength(0);
    expect(await auditFor("admin.report.resolved")).toHaveLength(1);
    expect(await auditFor("review.hidden")).toHaveLength(1);
  });

  it("retries a failed job and counts it on the overview", async () => {
    const admin = await makeAdmin();
    const [job] = await db.insert(jobs).values({ type: "email.send", payload: {}, status: "failed", attempts: 5, lastError: "boom" }).returning();
    expect((await adminOverview()).failedJobs).toBe(1);
    await retryJob(admin, job.id);
    const [after] = await db.select().from(jobs).where(eq(jobs.id, job.id));
    expect(after).toMatchObject({ status: "pending", attempts: 0 });
    expect(await errorCode(retryJob(admin, job.id))).toBe("conflict");
    expect(await auditFor("admin.job.retried")).toHaveLength(1);
  });

  it("won't delete a category that is in use", async () => {
    const admin = await makeAdmin();
    const f = await makeBusiness();
    expect(await errorCode(deleteCategory(admin, f.cat.id))).toBe("conflict");
    const [unused] = await db.insert(categories).values({ slug: "unused-cat", name: "Unused" }).returning();
    await deleteCategory(admin, unused.id);
    expect(await db.select().from(categories).where(eq(categories.id, unused.id))).toHaveLength(0);
  });

  it("staff replies notify the requester and status changes are audited", async () => {
    const admin = await makeAdmin();
    const user = await makeUser();
    const [t] = await db.insert(supportTickets).values({ userId: user.id, category: "payments", subject: "Double charge" }).returning();
    await staffReply(admin, t.id, { body: "We've refunded the duplicate.", status: "resolved" });
    const msgs = await db.select().from(supportMessages).where(and(eq(supportMessages.ticketId, t.id), eq(supportMessages.isStaff, true)));
    expect(msgs).toHaveLength(1);
    const notes = await db.select().from(notifications).where(eq(notifications.userId, user.id));
    expect(notes[0]).toMatchObject({ type: "support.reply", href: `/support/${t.id}` });
    await setTicketStatus(admin, t.id, "closed");
    expect(await auditFor("admin.support.status_changed")).toHaveLength(1);
  });
});
