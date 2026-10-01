import { DateTime } from "luxon";
import { sql } from "drizzle-orm";
import { db } from "@/server/db/client";
import { availabilityRules, businessMembers, businesses, categories, locations, serviceStaff, services, users } from "@/server/db/schema";
import type { Viewer } from "@/server/auth/session";
import type { Membership } from "@/server/authz";
import { permissionsFor } from "@/domain/permissions";

export async function resetDb() {
  const rows = await db.execute<{ tablename: string }>(sql`select tablename from pg_tables where schemaname = 'public' and tablename <> '__drizzle_migrations'`);
  const names = [...rows].map((r) => `"${r.tablename}"`).join(", ");
  await db.execute(sql.raw(`truncate ${names} restart identity cascade`));
}

let n = 0;
export async function makeUser(over: Partial<typeof users.$inferInsert> = {}): Promise<Viewer> {
  n++;
  const [u] = await db
    .insert(users)
    .values({ name: `User ${n}`, email: `user${n}-${Date.now()}@example.com`, emailVerifiedAt: new Date(), ...over })
    .returning();
  return { id: u.id, name: u.name, email: u.email, emailVerified: u.emailVerifiedAt != null, platformRole: u.platformRole, avatarMediaId: null, timezone: null, sessionId: "test" };
}

export type Fixture = Awaited<ReturnType<typeof makeBusiness>>;

/** An active business open 09:00–17:00 every day in New York, with one 60-minute service. */
export async function makeBusiness(opts: { staff?: number; bookingMode?: "instant" | "request"; capacity?: number; bufferAfter?: number; minNotice?: number; kind?: "individual" | "business" } = {}) {
  const owner = await makeUser({ name: "Owner" });
  const slug = `biz-${Math.random().toString(36).slice(2, 10)}`;
  const [cat] = await db.insert(categories).values({ slug: `cat-${slug}`, name: "Hair", keywords: ["fade", "barber"] }).returning();
  const [biz] = await db
    .insert(businesses)
    .values({
      slug,
      name: "Fade House",
      kind: opts.kind ?? "business",
      ownerUserId: owner.id,
      primaryCategoryId: cat.id,
      timezone: "America/New_York",
      status: "active",
      bookingMode: opts.bookingMode ?? "instant",
      minNoticeMinutes: opts.minNotice ?? 0,
      maxAdvanceDays: 365,
      slotIntervalMinutes: 15,
    })
    .returning();
  const [loc] = await db
    .insert(locations)
    .values({ businessId: biz.id, name: "Main", kind: "physical", line1: "1 Main St", city: "Brooklyn", timezone: "America/New_York", isPrimary: true, lat: 40.68, lng: -73.97 })
    .returning();
  const members = [];
  for (let i = 0; i < (opts.staff ?? 1); i++) {
    const user = i === 0 ? owner : await makeUser({ name: `Pro ${i}` });
    const [m] = await db
      .insert(businessMembers)
      .values({ businessId: biz.id, userId: user.id, role: i === 0 ? "owner" : "provider", displayName: i === 0 ? "Owner" : `Pro ${i}`, sortOrder: i, joinedAt: new Date() })
      .returning();
    members.push(m);
    await db.insert(availabilityRules).values([1, 2, 3, 4, 5, 6, 7].map((weekday) => ({ businessId: biz.id, memberId: m.id, weekday, startMinute: 540, endMinute: 1020 })));
  }
  const [svc] = await db
    .insert(services)
    .values({
      businessId: biz.id,
      name: "Signature cut",
      slug: "signature-cut",
      durationMinutes: 60,
      priceType: "fixed",
      priceCents: 5000,
      capacity: opts.capacity ?? 1,
      bufferAfterMinutes: opts.bufferAfter ?? 0,
    })
    .returning();
  await db.insert(serviceStaff).values(members.map((m) => ({ serviceId: svc.id, memberId: m.id })));
  const ownerMembership: Membership = {
    memberId: members[0].id,
    businessId: biz.id,
    businessName: biz.name,
    businessSlug: biz.slug,
    businessStatus: "active",
    businessKind: biz.kind,
    timezone: biz.timezone,
    currency: biz.currency,
    plan: biz.plan,
    role: "owner",
    permissions: permissionsFor("owner"),
    displayName: "Owner",
    isBookable: true,
  };
  return { owner, biz, loc, members, svc, cat, ownerMembership };
}

/** A New York wall-clock time N days from now, as a UTC ISO instant. */
export function nyTime(daysAhead: number, hhmm: string): string {
  const [hour, minute] = hhmm.split(":").map(Number);
  return DateTime.now().setZone("America/New_York").plus({ days: daysAhead }).set({ hour, minute, second: 0, millisecond: 0 }).toUTC().toISO()!;
}
