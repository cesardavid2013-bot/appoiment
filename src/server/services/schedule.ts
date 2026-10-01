import "server-only";
import { and, asc, eq, gt, inArray, isNull, lt, sql } from "drizzle-orm";
import { z } from "zod";
import { AppError, forbidden, notFound } from "@/domain/errors";
import { normalizeWindows } from "@/domain/time";
import { db } from "../db/client";
import { appointments, availabilityRules, businessMembers, locations, scheduleOverrides, timeBlocks } from "../db/schema";
import type { Membership } from "../authz";
import { audit } from "../audit";
import { zIsoDate, zOptText } from "../http";

const windowSchema = z.object({ start: z.number().int().min(0).max(1440), end: z.number().int().min(0).max(1440) }).refine((w) => w.start < w.end, "End must be after start");

export const weeklyHoursSchema = z.object({
  memberId: z.string().uuid().nullable(), // null + locationId = location opening hours
  locationId: z.string().uuid().nullable().default(null),
  days: z
    .array(z.object({ weekday: z.number().int().min(1).max(7), windows: z.array(windowSchema).max(6), locationId: z.string().uuid().nullable().optional() }))
    .max(7),
});

/** Who may edit whose schedule: everyone their own (if allowed), managers everyone. */
async function assertScheduleAccess(m: Membership, memberId: string | null) {
  if (memberId == null || memberId !== m.memberId) {
    if (!m.permissions.has("schedule.manage_all")) throw forbidden("You can only change your own schedule.");
  } else if (!m.permissions.has("schedule.manage_own") && !m.permissions.has("schedule.manage_all")) throw forbidden();
  if (memberId) {
    const [mem] = await db.select({ id: businessMembers.id }).from(businessMembers).where(and(eq(businessMembers.id, memberId), eq(businessMembers.businessId, m.businessId)));
    if (!mem) throw notFound("That team member");
  }
}

async function assertLocation(m: Membership, locationId: string | null | undefined) {
  if (!locationId) return;
  const [l] = await db.select({ id: locations.id }).from(locations).where(and(eq(locations.id, locationId), eq(locations.businessId, m.businessId)));
  if (!l) throw notFound("That location");
}

export async function setWeeklyHours(m: Membership, actorUserId: string, input: z.infer<typeof weeklyHoursSchema>) {
  await assertScheduleAccess(m, input.memberId);
  if (input.memberId == null && !input.locationId) throw new AppError("validation", "Choose a team member or a location.");
  await assertLocation(m, input.locationId);
  for (const d of input.days) await assertLocation(m, d.locationId);
  await db.transaction(async (tx) => {
    const scope = input.memberId
      ? eq(availabilityRules.memberId, input.memberId)
      : and(isNull(availabilityRules.memberId), eq(availabilityRules.locationId, input.locationId!));
    await tx.delete(availabilityRules).where(and(eq(availabilityRules.businessId, m.businessId), scope));
    const rows = input.days.flatMap((d) =>
      normalizeWindows(d.windows).map((w) => ({
        businessId: m.businessId,
        memberId: input.memberId,
        locationId: input.memberId ? (d.locationId ?? null) : input.locationId,
        weekday: d.weekday,
        startMinute: w.start,
        endMinute: w.end,
      })),
    );
    if (rows.length) await tx.insert(availabilityRules).values(rows);
    await audit({ actorUserId, actorType: "business", businessId: m.businessId, action: "schedule.weekly_updated", targetType: input.memberId ? "member" : "location", targetId: input.memberId ?? input.locationId ?? undefined }, tx);
  });
}

export async function getWeeklyHours(businessId: string, memberId: string | null, locationId: string | null) {
  const rows = await db
    .select()
    .from(availabilityRules)
    .where(
      and(
        eq(availabilityRules.businessId, businessId),
        memberId ? eq(availabilityRules.memberId, memberId) : and(isNull(availabilityRules.memberId), locationId ? eq(availabilityRules.locationId, locationId) : sql`false`),
      ),
    )
    .orderBy(asc(availabilityRules.weekday), asc(availabilityRules.startMinute));
  return [1, 2, 3, 4, 5, 6, 7].map((weekday) => ({
    weekday,
    windows: rows.filter((r) => r.weekday === weekday).map((r) => ({ start: r.startMinute, end: r.endMinute, locationId: r.locationId })),
  }));
}

export const overrideSchema = z.object({
  memberId: z.string().uuid().nullable(),
  locationId: z.string().uuid().nullable().default(null),
  date: zIsoDate,
  windows: z.array(windowSchema).max(6),
  note: zOptText(200),
});

export async function setOverride(m: Membership, actorUserId: string, input: z.infer<typeof overrideSchema>) {
  await assertScheduleAccess(m, input.memberId);
  await assertLocation(m, input.locationId);
  const intervals = normalizeWindows(input.windows);
  await db.transaction(async (tx) => {
    await tx
      .delete(scheduleOverrides)
      .where(
        and(
          eq(scheduleOverrides.businessId, m.businessId),
          eq(scheduleOverrides.date, input.date),
          input.memberId ? eq(scheduleOverrides.memberId, input.memberId) : isNull(scheduleOverrides.memberId),
          input.locationId ? eq(scheduleOverrides.locationId, input.locationId) : isNull(scheduleOverrides.locationId),
        ),
      );
    await tx.insert(scheduleOverrides).values({ businessId: m.businessId, memberId: input.memberId, locationId: input.locationId, date: input.date, intervals, note: input.note });
    await audit({ actorUserId, actorType: "business", businessId: m.businessId, action: "schedule.override_set", metadata: { date: input.date, memberId: input.memberId } }, tx);
  });
}

export async function deleteOverride(m: Membership, actorUserId: string, overrideId: string) {
  const [o] = await db.select().from(scheduleOverrides).where(and(eq(scheduleOverrides.id, overrideId), eq(scheduleOverrides.businessId, m.businessId)));
  if (!o) throw notFound("That schedule change");
  await assertScheduleAccess(m, o.memberId);
  await db.delete(scheduleOverrides).where(eq(scheduleOverrides.id, overrideId));
  await audit({ actorUserId, actorType: "business", businessId: m.businessId, action: "schedule.override_removed", metadata: { date: o.date } });
}

export async function listOverrides(businessId: string, fromDate: string, memberIds?: string[]) {
  return db
    .select()
    .from(scheduleOverrides)
    .where(
      and(
        eq(scheduleOverrides.businessId, businessId),
        sql`${scheduleOverrides.date} >= ${fromDate}`,
        memberIds ? sql`(${scheduleOverrides.memberId} is null or ${inArray(scheduleOverrides.memberId, memberIds)})` : sql`true`,
      ),
    )
    .orderBy(asc(scheduleOverrides.date))
    .limit(200);
}

export const blockSchema = z
  .object({
    memberId: z.string().uuid().nullable(),
    startsAt: z.string().datetime({ offset: true }),
    endsAt: z.string().datetime({ offset: true }),
    reason: z.enum(["break", "personal", "vacation", "sick", "holiday", "other"]).default("other"),
    note: zOptText(200),
  })
  .refine((b) => new Date(b.startsAt) < new Date(b.endsAt), { message: "End must be after start", path: ["endsAt"] })
  .refine((b) => new Date(b.endsAt).getTime() - new Date(b.startsAt).getTime() <= 366 * 86_400_000, { message: "Blocks can't exceed a year", path: ["endsAt"] });

/**
 * Blocks time. Existing appointments inside the block are not cancelled —
 * the provider sees them listed so they can decide what to do.
 */
export async function createBlock(m: Membership, actorUserId: string, input: z.infer<typeof blockSchema>) {
  await assertScheduleAccess(m, input.memberId);
  const startsAt = new Date(input.startsAt);
  const endsAt = new Date(input.endsAt);
  const [block] = await db
    .insert(timeBlocks)
    .values({ businessId: m.businessId, memberId: input.memberId, startsAt, endsAt, reason: input.reason, note: input.note, createdByUserId: actorUserId })
    .returning();
  const conflicts = await db
    .select({ id: appointments.id, startsAt: appointments.startsAt, reference: appointments.reference, serviceName: sql<string>`${appointments.snapshot}->>'serviceName'` })
    .from(appointments)
    .where(
      and(
        eq(appointments.businessId, m.businessId),
        input.memberId ? eq(appointments.memberId, input.memberId) : sql`true`,
        lt(appointments.startsAt, endsAt),
        gt(appointments.endsAt, startsAt),
        inArray(appointments.status, ["requested", "confirmed", "pending_payment", "checked_in"]),
      ),
    )
    .orderBy(asc(appointments.startsAt))
    .limit(50);
  await audit({ actorUserId, actorType: "business", businessId: m.businessId, action: "schedule.block_created", targetType: "time_block", targetId: block.id, metadata: { reason: input.reason } });
  return { block, conflicts };
}

export async function deleteBlock(m: Membership, actorUserId: string, blockId: string) {
  const [b] = await db.select().from(timeBlocks).where(and(eq(timeBlocks.id, blockId), eq(timeBlocks.businessId, m.businessId)));
  if (!b) throw notFound("That blocked time");
  await assertScheduleAccess(m, b.memberId);
  await db.delete(timeBlocks).where(eq(timeBlocks.id, blockId));
  await audit({ actorUserId, actorType: "business", businessId: m.businessId, action: "schedule.block_removed", targetType: "time_block", targetId: blockId });
}
