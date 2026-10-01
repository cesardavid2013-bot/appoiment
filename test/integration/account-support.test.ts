import { and, eq } from "drizzle-orm";
import { beforeEach, describe, expect, it } from "vitest";
import { AppError } from "@/domain/errors";
import { db } from "@/server/db/client";
import { appointments, auditLogs, businesses, favorites, notifications, sessions, supportTickets, userAddresses, users } from "@/server/db/schema";
import { addAddress, deleteAccount, deleteAddress, deletionCheck, exportMyData, updateNotificationPrefs, updateProfile } from "@/server/services/account";
import { createBooking } from "@/server/services/booking";
import { createTicket, getMyTicket, listAllTickets, replyToTicket, resolveMyTicket, setTicketStatus, staffReply } from "@/server/services/support";
import { hashPassword } from "@/server/auth/password";
import { makeBusiness, makeUser, nyTime, resetDb } from "../support/factory";

async function errorCode(p: Promise<unknown>): Promise<string> {
  try {
    await p;
    return "ok";
  } catch (e) {
    if (e instanceof AppError) return e.code;
    throw e;
  }
}

const book = (f: Awaited<ReturnType<typeof makeBusiness>>, customer: Awaited<ReturnType<typeof makeUser>>, days: number) =>
  createBooking(customer, {
    serviceId: f.svc.id,
    memberId: "any",
    locationId: f.loc.id,
    start: nyTime(days, "10:00"),
    optionIds: [],
    intake: {},
    idempotencyKey: `k-${Math.random()}`,
    source: "marketplace",
    customerNote: null,
    serviceAddress: null,
  });

beforeEach(async () => {
  await resetDb();
});

describe("account", () => {
  it("updates only the profile fields provided and rejects duplicate phones", async () => {
    const a = await makeUser({ name: "Ana" });
    const b = await makeUser();
    await updateProfile(a, { phone: "+15550001111", timezone: "America/Chicago" });
    const [row] = await db.select().from(users).where(eq(users.id, a.id));
    expect(row.name).toBe("Ana");
    expect(row.phone).toBe("+15550001111");
    expect(row.timezone).toBe("America/Chicago");
    expect(await errorCode(updateProfile(b, { phone: "+15550001111", timezone: undefined }))).toBe("conflict");
  });

  it("forces transactional email on when saving preferences", async () => {
    const u = await makeUser();
    const prefs = await updateNotificationPrefs(u, { prefs: { bookings: { email: false }, marketing: { email: true } } });
    expect(prefs.bookings.email).toBe(true);
    expect(prefs.marketing.email).toBe(true);
  });

  it("scopes saved addresses to their owner", async () => {
    const u = await makeUser();
    const other = await makeUser();
    const addr = await addAddress(u, { label: "Home", line1: "1 Main St", line2: null, city: "Brooklyn", region: "NY", postalCode: "11201", country: "US" });
    expect(await errorCode(deleteAddress(other, addr.id))).toBe("not_found");
    await deleteAddress(u, addr.id);
    expect(await db.select().from(userAddresses)).toHaveLength(0);
  });

  it("exports the user's own data", async () => {
    const f = await makeBusiness();
    const u = await makeUser();
    await book(f, u, 5);
    await db.insert(favorites).values({ userId: u.id, businessId: f.biz.id });
    const data = await exportMyData(u);
    expect(data.profile.id).toBe(u.id);
    expect(data.appointments).toHaveLength(1);
    expect(data.favorites[0].business).toBe(f.biz.name);
  });

  it("refuses to delete an account that owns an active business", async () => {
    const f = await makeBusiness();
    expect((await deletionCheck(f.owner.id)).blockingBusinesses).toHaveLength(1);
    expect(await errorCode(deleteAccount(f.owner, { confirm: "DELETE", password: "" }))).toBe("conflict");
    await db.update(businesses).set({ status: "closed" }).where(eq(businesses.id, f.biz.id));
    expect(await errorCode(deleteAccount(f.owner, { confirm: "DELETE", password: "" }))).toBe("ok");
  });

  it("requires typing DELETE", async () => {
    const u = await makeUser();
    expect(await errorCode(deleteAccount(u, { confirm: "delete", password: "" }))).toBe("validation");
  });

  it("requires the current password when the account has one", async () => {
    const u = await makeUser({ passwordHash: await hashPassword("correct horse battery") });
    expect(await errorCode(deleteAccount(u, { confirm: "DELETE", password: "wrong" }))).toBe("validation");
    expect(await errorCode(deleteAccount(u, { confirm: "DELETE", password: "correct horse battery" }))).toBe("ok");
  });

  it("anonymises the user, cancels future bookings and keeps history", async () => {
    const f = await makeBusiness();
    const u = await makeUser({ phone: "+15550002222" });
    const booking = await book(f, u, 7);
    await db.insert(sessions).values({ id: `s-${u.id}`, userId: u.id, expiresAt: new Date(Date.now() + 86_400_000) });
    await db.insert(favorites).values({ userId: u.id, businessId: f.biz.id });
    await addAddress(u, { label: "Home", line1: "1 Main St", line2: null, city: "Brooklyn", region: null, postalCode: null, country: "US" });

    const res = await deleteAccount(u, { confirm: "DELETE", password: "" });
    expect(res.cancelledAppointments).toBe(1);

    const [row] = await db.select().from(users).where(eq(users.id, u.id));
    expect(row).toMatchObject({ status: "deleted", name: "Deleted user", email: null, phone: null, passwordHash: null });
    expect(row.deletedAt).not.toBeNull();
    const [appt] = await db.select().from(appointments).where(eq(appointments.id, booking.appointmentId));
    expect(appt.status).toBe("cancelled");
    expect(appt.customerUserId).toBe(u.id); // history is kept, just anonymised
    expect(await db.select().from(sessions).where(eq(sessions.userId, u.id))).toHaveLength(0);
    expect(await db.select().from(favorites).where(eq(favorites.userId, u.id))).toHaveLength(0);
    expect(await db.select().from(userAddresses).where(eq(userAddresses.userId, u.id))).toHaveLength(0);
    const logs = await db.select().from(auditLogs).where(and(eq(auditLogs.action, "user.deleted"), eq(auditLogs.targetId, u.id)));
    expect(logs).toHaveLength(1);
  });
});

describe("support", () => {
  const input = { category: "booking" as const, subject: "Wrong time on my booking", body: "The confirmation shows a different time than I picked.", mediaIds: [] };

  it("only lets users attach their own appointments", async () => {
    const f = await makeBusiness();
    const u = await makeUser();
    const stranger = await makeUser();
    const b = await book(f, u, 3);
    expect(await errorCode(createTicket(stranger, { ...input, appointmentId: b.appointmentId }))).toBe("validation");
    const t = await createTicket(u, { ...input, appointmentId: b.appointmentId });
    const [row] = await db.select().from(supportTickets).where(eq(supportTickets.id, t.id));
    expect(row.businessId).toBe(f.biz.id);
    // The business's own staff can reference it too.
    expect(await errorCode(createTicket(f.owner, { ...input, appointmentId: b.appointmentId }))).toBe("ok");
  });

  it("keeps tickets private to their owner", async () => {
    const u = await makeUser();
    const other = await makeUser();
    const t = await createTicket(u, input);
    expect(await getMyTicket(other.id, t.id)).toBeNull();
    expect(await errorCode(replyToTicket(other, t.id, { body: "hi", mediaIds: [] }))).toBe("not_found");
    const mine = await getMyTicket(u.id, t.id);
    expect(mine?.messages).toHaveLength(1);
  });

  it("runs the staff loop: reply notifies the user, customer reply reopens, statuses are audited", async () => {
    const u = await makeUser();
    const admin = await makeUser({ platformRole: "support" });
    const t = await createTicket(u, input);

    expect(await errorCode(staffReply(u.id, t.id, "I'm not staff"))).toBe("forbidden");
    await staffReply(admin.id, t.id, "Thanks — we've fixed the time.");
    let [row] = await db.select().from(supportTickets).where(eq(supportTickets.id, t.id));
    expect(row.status).toBe("awaiting_customer");
    const notes = await db.select().from(notifications).where(eq(notifications.userId, u.id));
    expect(notes.map((n) => n.type)).toContain("support.reply");
    const thread = await getMyTicket(u.id, t.id);
    expect(thread?.messages[1]).toMatchObject({ isStaff: true, authorName: "Kept Support" });

    await replyToTicket(u, t.id, { body: "Still wrong for me.", mediaIds: [] });
    [row] = await db.select().from(supportTickets).where(eq(supportTickets.id, t.id));
    expect(row.status).toBe("open");

    await resolveMyTicket(u, t.id);
    await setTicketStatus(admin.id, t.id, "closed");
    expect(await errorCode(replyToTicket(u, t.id, { body: "One more thing", mediaIds: [] }))).toBe("conflict");

    const list = await listAllTickets(admin.id, { status: "closed" });
    expect(list.items.map((i) => i.id)).toEqual([t.id]);
    expect((await listAllTickets(admin.id, { status: "active" })).items).toHaveLength(0);
    expect(await db.select().from(auditLogs).where(eq(auditLogs.targetId, t.id))).not.toHaveLength(0);
  });

  it("paginates the staff queue", async () => {
    const u = await makeUser();
    const admin = await makeUser({ platformRole: "admin" });
    for (let i = 0; i < 3; i++) {
      const t = await createTicket(u, { ...input, subject: `Ticket number ${i}` });
      await db.update(supportTickets).set({ lastActivityAt: new Date(Date.now() - i * 60_000) }).where(eq(supportTickets.id, t.id));
    }
    const first = await listAllTickets(admin.id, { limit: 2 });
    expect(first.items).toHaveLength(2);
    expect(first.nextCursor).not.toBeNull();
    const second = await listAllTickets(admin.id, { limit: 2, before: new Date(first.nextCursor!) });
    expect(second.items).toHaveLength(1);
    expect(second.nextCursor).toBeNull();
  });
});
