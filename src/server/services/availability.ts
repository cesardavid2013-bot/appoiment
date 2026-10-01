import "server-only";
import { and, eq, gt, inArray, isNull, lt, or, sql } from "drizzle-orm";
import { computeSlots, type DaySlots, type HoursSpec, type MemberAvailabilityInput, type SlotQuery } from "@/domain/availability";
import { AppError, notFound } from "@/domain/errors";
import { eligibleMembersFor, resolveSelection, type PricingOptionGroup, type SelectedOption } from "@/domain/pricing";
import { addDaysIso, localMinuteToInstant, type InstantWindow } from "@/domain/time";
import { db, type Executor } from "../db/client";
import {
  availabilityRules,
  businessMembers,
  businesses,
  groupSessions,
  locations,
  memberLocations,
  occupancies,
  scheduleOverrides,
  serviceLocations,
  serviceOptionGroups,
  serviceOptions,
  serviceStaff,
  services,
  timeBlocks,
} from "../db/schema";

export const MAX_SLOT_RANGE_DAYS = 31;

export type BookableService = Awaited<ReturnType<typeof loadBookableService>>;

/** Loads a service with everything needed to price and schedule it. */
export async function loadBookableService(serviceId: string, exec: Executor = db, opts: { includeHidden?: boolean } = {}) {
  const [row] = await exec
    .select({ service: services, business: businesses })
    .from(services)
    .innerJoin(businesses, eq(businesses.id, services.businessId))
    .where(eq(services.id, serviceId))
    .limit(1);
  if (!row) throw notFound("That service");
  const { service, business } = row;
  const visible = service.status === "active" || (opts.includeHidden && service.status === "hidden");
  if (!visible) throw new AppError("not_found", "This service is no longer offered.");
  if (!opts.includeHidden && business.status !== "active") throw new AppError("not_found", "This business isn't taking bookings right now.");

  const groups = await exec
    .select()
    .from(serviceOptionGroups)
    .where(eq(serviceOptionGroups.serviceId, serviceId))
    .orderBy(serviceOptionGroups.sortOrder, serviceOptionGroups.name);
  const options = groups.length
    ? await exec
        .select()
        .from(serviceOptions)
        .where(inArray(serviceOptions.groupId, groups.map((g) => g.id)))
        .orderBy(serviceOptions.sortOrder, serviceOptions.name)
    : [];
  const optionGroups: PricingOptionGroup[] = groups.map((g) => ({
    id: g.id,
    name: g.name,
    selection: g.selection,
    required: g.required,
    maxSelect: g.maxSelect,
    options: options
      .filter((o) => o.groupId === g.id)
      .map((o) => ({
        id: o.id,
        name: o.name,
        priceDeltaCents: o.priceDeltaCents,
        durationDeltaMinutes: o.durationDeltaMinutes,
        isActive: o.isActive,
        eligibleMemberIds: o.eligibleMemberIds,
      })),
  }));

  const staff = await exec
    .select({
      memberId: businessMembers.id,
      displayName: businessMembers.displayName,
      sortOrder: businessMembers.sortOrder,
      priceCentsOverride: serviceStaff.priceCentsOverride,
      durationMinutesOverride: serviceStaff.durationMinutesOverride,
    })
    .from(serviceStaff)
    .innerJoin(businessMembers, eq(businessMembers.id, serviceStaff.memberId))
    .where(and(eq(serviceStaff.serviceId, serviceId), eq(businessMembers.status, "active"), eq(businessMembers.isBookable, true)))
    .orderBy(businessMembers.sortOrder, businessMembers.displayName);

  const svcLocIds = (await exec.select({ id: serviceLocations.locationId }).from(serviceLocations).where(eq(serviceLocations.serviceId, serviceId))).map(
    (r) => r.id,
  );
  const locs = await exec
    .select()
    .from(locations)
    .where(
      and(
        eq(locations.businessId, business.id),
        eq(locations.isActive, true),
        svcLocIds.length ? inArray(locations.id, svcLocIds) : sql`true`,
      ),
    )
    .orderBy(sql`${locations.isPrimary} desc`, locations.name);

  const memberLocs = staff.length
    ? await exec.select().from(memberLocations).where(inArray(memberLocations.memberId, staff.map((s) => s.memberId)))
    : [];

  return { service, business, optionGroups, staff, locations: locs, memberLocations: memberLocs };
}

export function selectOptions(svc: BookableService, optionIds: string[]): SelectedOption[] {
  const sel = resolveSelection(svc.optionGroups, optionIds);
  if (!sel.ok) throw new AppError("validation", sel.errors[0].message, { details: sel.errors });
  return sel.selected;
}

export function resolveLocation(svc: BookableService, locationId: string | null | undefined) {
  if (locationId) {
    const loc = svc.locations.find((l) => l.id === locationId);
    if (!loc) throw new AppError("validation", "This service isn't offered at that location.");
    return loc;
  }
  if (svc.locations.length === 1) return svc.locations[0];
  if (svc.locations.length === 0) return null;
  throw new AppError("validation", "Choose a location for this service.", { fields: { locationId: "Choose a location" } });
}

/** Staff who can perform the service with the chosen options at the chosen location. */
export function candidateMembers(svc: BookableService, selected: SelectedOption[], locationId: string | null, memberId: string | "any") {
  const atLocation = svc.staff.filter((s) => {
    if (!locationId) return true;
    const assigned = svc.memberLocations.filter((ml) => ml.memberId === s.memberId);
    return assigned.length === 0 || assigned.some((ml) => ml.locationId === locationId);
  });
  const eligibleIds = new Set(eligibleMembersFor(atLocation.map((s) => s.memberId), selected));
  let list = atLocation.filter((s) => eligibleIds.has(s.memberId));
  if (memberId !== "any") {
    list = list.filter((s) => s.memberId === memberId);
    if (list.length === 0) throw new AppError("validation", "That professional can't take this booking. Choose someone else.");
  }
  return list;
}

export function effectiveDuration(svc: BookableService, memberId: string, selected: SelectedOption[]) {
  const staff = svc.staff.find((s) => s.memberId === memberId);
  const base = staff?.durationMinutesOverride ?? svc.service.durationMinutes;
  return Math.max(5, base + selected.reduce((s, o) => s + o.durationDeltaMinutes, 0));
}

type LoadArgs = {
  svc: BookableService;
  selected: SelectedOption[];
  locationId: string | null;
  memberIds: string[];
  fromDate: string;
  toDate: string;
  now?: Date;
  /** Exclude an appointment's own reservation (rescheduling). */
  ignoreAppointmentId?: string;
  /** Provider-side bookings may ignore notice/horizon. */
  ignoreBookingWindow?: boolean;
};

/** Reads schedules and reservations and builds per-duration slot queries. */
export async function buildSlotQueries(a: LoadArgs, exec: Executor = db): Promise<SlotQuery[]> {
  const { svc } = a;
  const loc = a.locationId ? svc.locations.find((l) => l.id === a.locationId) : null;
  const tz = loc?.timezone ?? svc.business.timezone;
  if (a.memberIds.length === 0) return [];

  const rangeStart = localMinuteToInstant(a.fromDate, 0, tz)! - 86_400_000;
  const rangeEnd = localMinuteToInstant(addDaysIso(a.toDate, 1), 0, tz)! + 86_400_000;
  const startDate = new Date(rangeStart);
  const endDate = new Date(rangeEnd);

  const [rules, overrides, busyRows, blocks, sessions] = await Promise.all([
    exec
      .select()
      .from(availabilityRules)
      .where(
        and(
          eq(availabilityRules.businessId, svc.business.id),
          or(inArray(availabilityRules.memberId, a.memberIds), and(isNull(availabilityRules.memberId), loc ? eq(availabilityRules.locationId, loc.id) : sql`false`)),
        ),
      ),
    exec
      .select()
      .from(scheduleOverrides)
      .where(
        and(
          eq(scheduleOverrides.businessId, svc.business.id),
          sql`${scheduleOverrides.date} between ${addDaysIso(a.fromDate, -1)} and ${addDaysIso(a.toDate, 1)}`,
          or(
            inArray(scheduleOverrides.memberId, a.memberIds),
            and(isNull(scheduleOverrides.memberId), isNull(scheduleOverrides.locationId)),
            loc ? and(isNull(scheduleOverrides.memberId), eq(scheduleOverrides.locationId, loc.id)) : sql`false`,
          ),
        ),
      ),
    exec
      .select({ memberId: occupancies.memberId, startsAt: occupancies.startsAt, endsAt: occupancies.endsAt, appointmentId: occupancies.appointmentId })
      .from(occupancies)
      .where(and(inArray(occupancies.memberId, a.memberIds), lt(occupancies.startsAt, endDate), gt(occupancies.endsAt, startDate))),
    exec
      .select()
      .from(timeBlocks)
      .where(
        and(
          eq(timeBlocks.businessId, svc.business.id),
          or(inArray(timeBlocks.memberId, a.memberIds), isNull(timeBlocks.memberId)),
          lt(timeBlocks.startsAt, endDate),
          gt(timeBlocks.endsAt, startDate),
        ),
      ),
    svc.service.capacity > 1
      ? exec
          .select()
          .from(groupSessions)
          .where(
            and(
              eq(groupSessions.serviceId, svc.service.id),
              inArray(groupSessions.memberId, a.memberIds),
              lt(groupSessions.startsAt, endDate),
              gt(groupSessions.endsAt, startDate),
            ),
          )
      : Promise.resolve([] as (typeof groupSessions.$inferSelect)[]),
  ]);

  // Location / business-wide hours act as an outer constraint.
  const locRules = rules.filter((r) => r.memberId == null);
  const bizOverrides = overrides.filter((o) => o.memberId == null);
  let locationHours: HoursSpec | null = null;
  if (locRules.length || bizOverrides.length) {
    const weekly = locRules.length
      ? locRules.map((r) => ({ weekday: r.weekday, start: r.startMinute, end: r.endMinute }))
      : [1, 2, 3, 4, 5, 6, 7].map((weekday) => ({ weekday, start: 0, end: 1440 }));
    const ov: Record<string, { start: number; end: number }[]> = {};
    // Location-specific overrides win over business-wide ones on the same date.
    for (const o of bizOverrides.sort((x, y) => (x.locationId ? 1 : 0) - (y.locationId ? 1 : 0))) ov[o.date] = o.intervals;
    locationHours = { weekly, overrides: ov };
  }

  const businessBlocks: InstantWindow[] = blocks.filter((b) => b.memberId == null).map((b) => ({ start: b.startsAt.getTime(), end: b.endsAt.getTime() }));

  const now = (a.now ?? new Date()).getTime();
  const byDuration = new Map<number, MemberAvailabilityInput[]>();
  for (const memberId of a.memberIds) {
    const memberOverrides: Record<string, { start: number; end: number }[]> = {};
    for (const o of overrides) if (o.memberId === memberId) memberOverrides[o.date] = o.intervals;
    const busy: InstantWindow[] = [
      ...busyRows
        .filter((b) => b.memberId === memberId && (!a.ignoreAppointmentId || b.appointmentId !== a.ignoreAppointmentId))
        .map((b) => ({ start: b.startsAt.getTime(), end: b.endsAt.getTime() })),
      ...blocks.filter((b) => b.memberId === memberId).map((b) => ({ start: b.startsAt.getTime(), end: b.endsAt.getTime() })),
      ...businessBlocks,
    ];
    const joinable = sessions
      .filter((s) => s.memberId === memberId && (!a.locationId || s.locationId === a.locationId))
      .map((s) => ({ startsAt: s.startsAt.getTime(), spotsLeft: s.capacity - s.bookedCount }));
    const input: MemberAvailabilityInput = {
      memberId,
      hours: {
        weekly: rules
          .filter((r) => r.memberId === memberId)
          .map((r) => ({ weekday: r.weekday, start: r.startMinute, end: r.endMinute, locationId: r.locationId })),
        overrides: memberOverrides,
      },
      busy,
      joinableSessions: joinable,
    };
    const d = effectiveDuration(svc, memberId, a.selected);
    byDuration.set(d, [...(byDuration.get(d) ?? []), input]);
  }

  return [...byDuration.entries()].map(([duration, members]) => ({
    timezone: tz,
    fromDate: a.fromDate,
    toDate: a.toDate,
    now,
    durationMinutes: duration,
    bufferBeforeMinutes: svc.service.bufferBeforeMinutes,
    bufferAfterMinutes: svc.service.bufferAfterMinutes,
    stepMinutes: svc.business.slotIntervalMinutes,
    minNoticeMinutes: a.ignoreBookingWindow ? -10_000_000 : (svc.service.minNoticeMinutes ?? svc.business.minNoticeMinutes),
    maxAdvanceDays: a.ignoreBookingWindow ? 3650 : (svc.service.maxAdvanceDays ?? svc.business.maxAdvanceDays),
    locationId: a.locationId,
    locationHours,
    serviceHours: svc.service.serviceHours ?? null,
    capacity: svc.service.capacity,
    members,
  }));
}

/** Merges results from several per-duration queries into one timeline. */
export function mergeDays(results: DaySlots[][], memberOrder: string[]): DaySlots[] {
  if (results.length === 1) return results[0];
  const order = new Map(memberOrder.map((m, i) => [m, i]));
  const byDate = new Map<string, Map<number, { start: number; memberIds: string[]; spotsLeft?: number }>>();
  for (const days of results)
    for (const day of days) {
      const map = byDate.get(day.date) ?? new Map();
      for (const s of day.slots) {
        const ex = map.get(s.start);
        if (ex) {
          ex.memberIds = [...new Set([...ex.memberIds, ...s.memberIds])];
          if (s.spotsLeft !== undefined) ex.spotsLeft = Math.max(ex.spotsLeft ?? 0, s.spotsLeft);
        } else map.set(s.start, { ...s, memberIds: [...s.memberIds] });
      }
      byDate.set(day.date, map);
    }
  return [...byDate.entries()]
    .sort(([a], [b]) => a.localeCompare(b))
    .map(([date, map]) => ({
      date,
      slots: [...map.values()]
        .sort((a, b) => a.start - b.start)
        .map((s) => ({ ...s, memberIds: s.memberIds.sort((x, y) => (order.get(x) ?? 0) - (order.get(y) ?? 0)) })),
    }));
}

export type SlotsRequest = {
  serviceId: string;
  memberId: string | "any";
  locationId?: string | null;
  fromDate: string;
  toDate: string;
  optionIds: string[];
};

/** Public slot listing used by the booking flow. Read-only; never authoritative on its own. */
export async function getSlots(req: SlotsRequest) {
  if (req.toDate < req.fromDate) throw new AppError("validation", "The end date must be after the start date.");
  if (addDaysIso(req.fromDate, MAX_SLOT_RANGE_DAYS) < req.toDate) throw new AppError("validation", "Choose a shorter date range.");
  const svc = await loadBookableService(req.serviceId);
  const selected = selectOptions(svc, req.optionIds);
  const loc = resolveLocation(svc, req.locationId);
  const members = candidateMembers(svc, selected, loc?.id ?? null, req.memberId);
  const queries = await buildSlotQueries({
    svc,
    selected,
    locationId: loc?.id ?? null,
    memberIds: members.map((m) => m.memberId),
    fromDate: req.fromDate,
    toDate: req.toDate,
  });
  const days = mergeDays(
    queries.map((q) => computeSlots(q)),
    members.map((m) => m.memberId),
  );
  return {
    timezone: loc?.timezone ?? svc.business.timezone,
    locationId: loc?.id ?? null,
    days: days.map((d) => ({
      date: d.date,
      slots: d.slots.map((s) => ({ start: new Date(s.start).toISOString(), memberIds: s.memberIds, spotsLeft: s.spotsLeft })),
    })),
  };
}

/** Next bookable time for listing cards ("Next: Today 3:30 PM"). Bounded look-ahead. */
export async function nextAvailable(serviceId: string, fromDate: string, days = 7): Promise<string | null> {
  try {
    const res = await getSlots({ serviceId, memberId: "any", fromDate, toDate: addDaysIso(fromDate, days - 1), optionIds: [] });
    for (const d of res.days) if (d.slots.length) return d.slots[0].start;
    return null;
  } catch {
    return null;
  }
}
