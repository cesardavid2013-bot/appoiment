import { eq } from "drizzle-orm";
import { beforeEach, describe, expect, it } from "vitest";
import { permissionsFor, type MemberRole } from "@/domain/permissions";
import { AppError } from "@/domain/errors";
import { db } from "@/server/db/client";
import { appointments, businessCustomers, conversations, customerNotes, messages } from "@/server/db/schema";
import type { Membership } from "@/server/authz";
import { createBooking } from "@/server/services/booking";
import {
  businessSend,
  businessStart,
  conversationForClient,
  customerSend,
  getThread,
  listBusinessConversations,
  listCustomerConversations,
  threadContext,
  unreadMessageCount,
} from "@/server/services/messaging";
import { addCustomerNote, customerDetail, customerListMeta, deleteCustomerNote, listCustomers, searchCustomers, updateCustomer } from "@/server/services/pro";
import { makeBusiness, makeUser, nyTime, resetDb, type Fixture } from "../support/factory";

async function errorCode(p: Promise<unknown>): Promise<string> {
  try {
    await p;
    return "ok";
  } catch (e) {
    if (e instanceof AppError) return e.code;
    throw e;
  }
}

const book = async (f: Fixture, customer: Awaited<ReturnType<typeof makeUser>>, days: number, memberId: string | "any" = "any", time = "10:00") => {
  const res = await createBooking(customer, {
    serviceId: f.svc.id,
    memberId,
    locationId: f.loc.id,
    start: nyTime(days, time),
    optionIds: [],
    intake: {},
    idempotencyKey: `k-${Math.random()}`,
    source: "marketplace",
    customerNote: null,
    serviceAddress: null,
  });
  return res.appointmentId;
};

/** A membership for staff member `i` of the fixture with the given role. */
function membershipFor(f: Fixture, i: number, role: MemberRole, custom: string[] = []): Membership {
  return { ...f.ownerMembership, memberId: f.members[i].id, role, permissions: permissionsFor(role, custom), displayName: f.members[i].displayName };
}

const clientIdOf = async (f: Fixture, userId: string) => (await db.select().from(businessCustomers).where(eq(businessCustomers.userId, userId))).find((c) => c.businessId === f.biz.id)!.id;

beforeEach(async () => {
  await resetDb();
});

describe("messaging authorization", () => {
  it("only lets a customer read and write their own threads", async () => {
    const f = await makeBusiness();
    const a = await makeUser({ name: "Ana" });
    const b = await makeUser({ name: "Ben" });
    const { conversationId } = await customerSend(a, f.biz.id, { body: "Do you do beard trims?" });
    const t = await getThread({ conversationId, viewer: a, as: "customer" });
    expect(t.messages.map((m) => m.body)).toEqual(["Do you do beard trims?"]);
    expect(t.messages[0].mine).toBe(true);
    expect(await errorCode(getThread({ conversationId, viewer: b, as: "customer" }))).toBe("not_found");
    // A customer can't read a thread from the business side without a membership either.
    expect(await errorCode(getThread({ conversationId, viewer: b, as: "business", membership: null }))).toBe("not_found");
    expect(await listCustomerConversations(b)).toHaveLength(0);
  });

  it("keeps one business's staff out of another business's threads and clients", async () => {
    const x = await makeBusiness();
    const y = await makeBusiness();
    const customer = await makeUser();
    await book(y, customer, 3);
    const { conversationId } = await customerSend(customer, y.biz.id, { body: "Running 5 min late" });
    expect(await errorCode(getThread({ conversationId, viewer: x.owner, membership: x.ownerMembership, as: "business" }))).toBe("not_found");
    expect(await errorCode(businessSend(x.ownerMembership, x.owner.id, conversationId, { body: "hi" }))).toBe("not_found");
    expect(await errorCode(threadContext(x.ownerMembership, conversationId))).toBe("not_found");
    expect(await listBusinessConversations(x.ownerMembership)).toHaveLength(0);

    const clientY = await clientIdOf(y, customer.id);
    expect(await errorCode(customerDetail(x.ownerMembership, clientY))).toBe("not_found");
    expect(await errorCode(updateCustomer(x.ownerMembership, x.owner.id, clientY, { name: "Hacked", tags: [] }))).toBe("not_found");
    expect(await errorCode(addCustomerNote(x.ownerMembership, x.owner.id, clientY, "note"))).toBe("not_found");
    expect(await errorCode(businessStart(x.ownerMembership, x.owner.id, clientY, { body: "hello" }))).toBe("not_found");
    expect((await listCustomers(x.ownerMembership, { sort: "recent", page: 1 })).customers).toHaveLength(0);

    // The right business can.
    const t = await getThread({ conversationId, viewer: y.owner, membership: y.ownerMembership, as: "business" });
    // The booking confirmation is logged in the thread as a system line.
    expect(t.messages.map((m) => m.senderRole)).toEqual(["system", "customer"]);
    expect(t.messages[1].mine).toBe(false);
  });

  it("requires messages.manage to read the business side", async () => {
    const f = await makeBusiness({ staff: 2 });
    const customer = await makeUser();
    const { conversationId } = await customerSend(customer, f.biz.id, { body: "Hi" });
    const provider = membershipFor(f, 1, "provider");
    expect(await errorCode(getThread({ conversationId, viewer: f.owner, membership: provider, as: "business" }))).toBe("not_found");
    expect(await errorCode(businessSend(provider, f.owner.id, conversationId, { body: "x" }))).toBe("forbidden");
    expect(await errorCode(listBusinessConversations(provider))).toBe("forbidden");
    const desk = membershipFor(f, 1, "receptionist");
    expect((await getThread({ conversationId, viewer: f.owner, membership: desk, as: "business" })).messages).toHaveLength(1);
  });

  it("rejects links to someone else's appointment and empty messages", async () => {
    const f = await makeBusiness();
    const a = await makeUser();
    const b = await makeUser();
    const apptB = await book(f, b, 4);
    const apptA = await book(f, a, 5);
    expect(await errorCode(customerSend(a, f.biz.id, { body: "About this", appointmentId: apptB }))).toBe("not_found");
    expect(await errorCode(customerSend(a, f.biz.id, { body: "" }))).toBe("validation");
    const { conversationId } = await customerSend(a, f.biz.id, { body: "About my booking", appointmentId: apptA });
    expect(await errorCode(businessSend(f.ownerMembership, f.owner.id, conversationId, { body: "Re", appointmentId: apptB }))).toBe("not_found");
    const t = await getThread({ conversationId, viewer: a, as: "customer" });
    expect(t.messages[0].appointment?.id).toBe(apptA);
  });

  it("lets a business start a thread only with clients who booked with a Kept account", async () => {
    const f = await makeBusiness();
    const customer = await makeUser();
    await book(f, customer, 2);
    const clientId = await clientIdOf(f, customer.id);
    const [walkIn] = await db.insert(businessCustomers).values({ businessId: f.biz.id, name: "Walk In", phone: "+15550009999" }).returning();
    expect(await errorCode(businessStart(f.ownerMembership, f.owner.id, walkIn.id, { body: "Hi" }))).toBe("validation");
    expect(await conversationForClient(f.ownerMembership, walkIn.id)).toMatchObject({ conversationId: null });
    // Booking already opened a thread (with a system line), so "Message" lands there.
    const existing = (await conversationForClient(f.ownerMembership, clientId)).conversationId;
    expect(existing).not.toBeNull();
    const started = await businessStart(f.ownerMembership, f.owner.id, clientId, { body: "Your cut is ready to rebook" });
    expect(started.conversationId).toBe(existing);
    // Starting again reuses the same thread.
    const again = await businessStart(f.ownerMembership, f.owner.id, clientId, { body: "Following up" });
    expect(again.conversationId).toBe(started.conversationId);
    expect(await unreadMessageCount(customer, null)).toBe(1);
  });
});

describe("thread polling and read state", () => {
  it("returns only newer messages after a cursor and clears unread counts", async () => {
    const f = await makeBusiness();
    const customer = await makeUser();
    const { conversationId } = await customerSend(customer, f.biz.id, { body: "one" });
    expect(await unreadMessageCount(f.owner, f.ownerMembership)).toBe(1);
    const first = await getThread({ conversationId, viewer: f.owner, membership: f.ownerMembership, as: "business" });
    expect(first.markedRead).toBe(true);
    expect(await unreadMessageCount(f.owner, f.ownerMembership)).toBe(0);
    const cursor = first.messages.at(-1)!.cursor;
    expect(cursor).toMatch(/\.\d{6}Z$/);

    const empty = await getThread({ conversationId, viewer: f.owner, membership: f.ownerMembership, as: "business", after: cursor });
    expect(empty.messages).toHaveLength(0);
    expect(empty.markedRead).toBe(false);

    await customerSend(customer, f.biz.id, { body: "two" });
    await customerSend(customer, f.biz.id, { body: "three" });
    const next = await getThread({ conversationId, viewer: f.owner, membership: f.ownerMembership, as: "business", after: cursor });
    expect(next.messages.map((m) => m.body)).toEqual(["two", "three"]);

    await businessSend(f.ownerMembership, f.owner.id, conversationId, { body: "Yes we do" });
    expect(await unreadMessageCount(customer, null)).toBe(1);
    const mine = await getThread({ conversationId, viewer: customer, as: "customer" });
    expect(mine.messages.at(-1)).toMatchObject({ body: "Yes we do", mine: false, senderName: f.biz.name });
    expect(await unreadMessageCount(customer, null)).toBe(0);
  });

  it("pages older messages with a before cursor", async () => {
    const f = await makeBusiness();
    const customer = await makeUser();
    const { conversationId } = await customerSend(customer, f.biz.id, { body: "m0" });
    const base = Date.now() - 3_600_000;
    await db.insert(messages).values(Array.from({ length: 60 }, (_, i) => ({ conversationId, senderUserId: customer.id, senderRole: "customer" as const, body: `old${i}`, createdAt: new Date(base + i * 1000) })));
    const page1 = await getThread({ conversationId, viewer: customer, as: "customer" });
    expect(page1.messages).toHaveLength(50);
    expect(page1.hasMore).toBe(true);
    expect(page1.messages.at(-1)!.body).toBe("m0");
    const page2 = await getThread({ conversationId, viewer: customer, as: "customer", before: page1.messages[0].cursor });
    expect(page2.messages).toHaveLength(11);
    expect(page2.hasMore).toBe(false);
    expect(page2.messages[0].body).toBe("old0");
  });
});

describe("clients CRM", () => {
  it("limits own-only staff to clients they have served", async () => {
    const f = await makeBusiness({ staff: 2 });
    const mine = await makeUser({ name: "Mina" });
    const theirs = await makeUser({ name: "Theo" });
    await book(f, mine, 3, f.members[1].id);
    await book(f, theirs, 3, f.members[0].id, "12:00");
    await book(f, mine, 4, f.members[0].id, "12:00");
    const provider = membershipFor(f, 1, "provider");
    const mineId = await clientIdOf(f, mine.id);
    const theirsId = await clientIdOf(f, theirs.id);

    const list = await listCustomers(provider, { sort: "name", page: 1 });
    expect(list.customers.map((c) => c.name)).toEqual(["Mina"]);
    expect(list.total).toBe(1);
    expect(list.customers[0].totalSpentCents).toBeNull(); // providers can't see revenue
    expect(await errorCode(customerDetail(provider, theirsId))).toBe("not_found");
    const d = await customerDetail(provider, mineId);
    expect(d.history).toHaveLength(1); // only their own appointment with Mina
    expect((await searchCustomers(provider, "Theo")).length).toBe(0);
    expect((await customerListMeta(provider)).counts.all).toBe(1);

    // Owners see everyone and everything.
    expect((await listCustomers(f.ownerMembership, { sort: "name", page: 1 })).total).toBe(2);
    expect((await customerDetail(f.ownerMembership, mineId)).history).toHaveLength(2);
    // Custom role that can manage customers but only its own appointments still can't touch others.
    const custom = membershipFor(f, 1, "custom", ["customers.view", "customers.manage", "appointments.manage_own"]);
    expect(await errorCode(addCustomerNote(custom, f.owner.id, theirsId, "x"))).toBe("not_found");
    expect(await errorCode(updateCustomer(custom, f.owner.id, theirsId, { name: "x", tags: [] }))).toBe("not_found");
  });

  it("computes segments, tags, search and notes from real data", async () => {
    const f = await makeBusiness();
    const a = await makeUser({ name: "Alice Lapsed" });
    const b = await makeUser({ name: "Bob Booked" });
    const apptA = await book(f, a, 1);
    await book(f, b, 2);
    const aId = await clientIdOf(f, a.id);
    const bId = await clientIdOf(f, b.id);
    // Alice: last visit 90 days ago, one no-show, no upcoming booking.
    await db.update(appointments).set({ status: "cancelled" }).where(eq(appointments.id, apptA));
    await db.update(businessCustomers).set({ lastVisitAt: new Date(Date.now() - 90 * 86_400_000), noShowCount: 1, createdAt: new Date(Date.now() - 400 * 86_400_000) }).where(eq(businessCustomers.id, aId));
    await updateCustomer(f.ownerMembership, f.owner.id, bId, { name: "ignored for account holders", tags: ["VIP", "beard"] });

    const meta = await customerListMeta(f.ownerMembership);
    expect(meta.counts).toMatchObject({ all: 2, lapsed: 1, no_shows: 1, upcoming: 1, new: 1 });
    expect(meta.tags.map((t) => t.tag).sort()).toEqual(["beard", "vip"]);

    expect((await listCustomers(f.ownerMembership, { sort: "recent", page: 1, segment: "lapsed" })).customers.map((c) => c.id)).toEqual([aId]);
    expect((await listCustomers(f.ownerMembership, { sort: "recent", page: 1, tag: "vip" })).customers.map((c) => c.id)).toEqual([bId]);
    expect((await listCustomers(f.ownerMembership, { sort: "recent", page: 1, q: "bob" })).customers.map((c) => c.id)).toEqual([bId]);
    const booked = await listCustomers(f.ownerMembership, { sort: "recent", page: 1, segment: "upcoming" });
    expect(booked.customers[0].nextVisit).not.toBeNull();
    // Account holders keep their own name.
    expect((await customerDetail(f.ownerMembership, bId)).customer.name).toBe("Bob Booked");

    const note = await addCustomerNote(f.ownerMembership, f.owner.id, bId, "Prefers a #2 on the sides");
    expect((await customerDetail(f.ownerMembership, bId)).notes).toHaveLength(1);
    await deleteCustomerNote(f.ownerMembership, f.owner.id, note.id);
    expect((await customerDetail(f.ownerMembership, bId)).notes).toHaveLength(0);
    const [row] = await db.select().from(customerNotes).where(eq(customerNotes.id, note.id));
    expect(row.deletedAt).not.toBeNull();
  });

  it("gives the inbox side panel the client's appointments", async () => {
    const f = await makeBusiness();
    const customer = await makeUser();
    await book(f, customer, 2);
    const { conversationId } = await customerSend(customer, f.biz.id, { body: "Can I bring my son?" });
    const ctx = await threadContext(f.ownerMembership, conversationId);
    expect(ctx.client?.id).toBe(await clientIdOf(f, customer.id));
    expect(ctx.upcoming).toHaveLength(1);
    expect(ctx.past).toHaveLength(0);
    const [conv] = await db.select().from(conversations).where(eq(conversations.id, conversationId));
    expect(conv.businessId).toBe(f.biz.id);
  });
});
