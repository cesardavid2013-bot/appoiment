/**
 * Availability engine (pure).
 *
 * Given schedules, existing reservations and a service's timing rules, produce
 * bookable start times. This is used both to *display* slots and — crucially —
 * to *re-validate* a requested slot inside the booking transaction. The
 * database exclusion constraint on `occupancies` is the final guard against
 * races; this engine guarantees the slot respects schedules, notice, horizon,
 * buffers, blocks and location/service hours.
 *
 * Timing model for one booking starting at S with duration D:
 *   service window  = [S, S + D)
 *   occupied block  = [S - bufferBefore, S + D + bufferAfter)
 * Rules:
 *   - [S - bufferBefore, S + D) must lie inside one working window
 *     (prep happens during working hours; the service must end by close).
 *   - Cleanup (bufferAfter) may run past the end of a shift but must not
 *     overlap another reservation or block.
 *   - Start times align to multiples of `stepMinutes` from local midnight.
 */
import {
  MINUTE,
  intersectWindows,
  isoDateRange,
  isoWeekday,
  localMinuteToInstant,
  normalizeWindows,
  type InstantWindow,
  type MinuteWindow,
} from "./time";

export type WeeklyRule = { weekday: number; start: number; end: number; locationId?: string | null };

export type HoursSpec = {
  weekly: WeeklyRule[];
  /** Local date → windows. Presence replaces the weekly schedule for that date; [] = closed. */
  overrides?: Record<string, MinuteWindow[]>;
};

export type MemberAvailabilityInput = {
  memberId: string;
  hours: HoursSpec;
  /** Existing occupancies (already buffer-inclusive) and time blocks. */
  busy: InstantWindow[];
  /** For group services: sessions this member already runs that still have space. */
  joinableSessions?: { startsAt: number; spotsLeft: number }[];
};

export type SlotQuery = {
  timezone: string;
  fromDate: string;
  toDate: string;
  now: number;
  durationMinutes: number;
  bufferBeforeMinutes: number;
  bufferAfterMinutes: number;
  stepMinutes: number;
  minNoticeMinutes: number;
  maxAdvanceDays: number;
  /** Booking at a specific location: weekly rules bound to other locations are ignored. */
  locationId?: string | null;
  locationHours?: HoursSpec | null;
  serviceHours?: WeeklyRule[] | null;
  /** Group services: capacity of a new session. 1 = regular appointment. */
  capacity?: number;
  members: MemberAvailabilityInput[];
};

export type Slot = {
  /** Epoch ms of the service start. */
  start: number;
  memberIds: string[];
  /** For group services, the most spots available across members at this time. */
  spotsLeft?: number;
};

export type DaySlots = { date: string; slots: Slot[] };

function windowsForDate(hours: HoursSpec, date: string, weekday: number, locationId?: string | null): MinuteWindow[] {
  const override = hours.overrides?.[date];
  if (override) return normalizeWindows(override);
  return normalizeWindows(
    hours.weekly.filter(
      (r) => r.weekday === weekday && (locationId == null || r.locationId == null || r.locationId === locationId),
    ),
  );
}

/** First index in sorted `busy` whose end is after `t` (binary search). */
function firstEndingAfter(busy: InstantWindow[], t: number): number {
  let lo = 0;
  let hi = busy.length;
  while (lo < hi) {
    const mid = (lo + hi) >>> 1;
    if (busy[mid].end <= t) lo = mid + 1;
    else hi = mid;
  }
  return lo;
}

function isFree(busySorted: InstantWindow[], start: number, end: number): boolean {
  // busySorted is sorted by start and non-overlapping after normalisation.
  const i = firstEndingAfter(busySorted, start);
  return i >= busySorted.length || busySorted[i].start >= end;
}

export function computeSlots(q: SlotQuery): DaySlots[] {
  const earliest = q.now + q.minNoticeMinutes * MINUTE;
  const latest = q.now + q.maxAdvanceDays * 24 * 60 * MINUTE;
  const duration = q.durationMinutes * MINUTE;
  const before = q.bufferBeforeMinutes * MINUTE;
  const after = q.bufferAfterMinutes * MINUTE;
  const step = Math.max(5, q.stepMinutes);
  const capacity = Math.max(1, q.capacity ?? 1);

  const members = q.members.map((m) => ({
    ...m,
    busySorted: normalizeWindows(m.busy),
    joinable: new Map((m.joinableSessions ?? []).map((s) => [s.startsAt, s.spotsLeft])),
  }));

  const days: DaySlots[] = [];
  for (const date of isoDateRange(q.fromDate, q.toDate)) {
    const weekday = isoWeekday(date);
    const slotMap = new Map<number, Slot>();

    const locWindows = q.locationHours ? windowsForDate(q.locationHours, date, weekday) : null;
    const svcWindows = q.serviceHours ? normalizeWindows(q.serviceHours.filter((r) => r.weekday === weekday)) : null;

    const add = (start: number, memberId: string, spots?: number) => {
      const existing = slotMap.get(start);
      if (existing) {
        if (!existing.memberIds.includes(memberId)) existing.memberIds.push(memberId);
        if (spots !== undefined) existing.spotsLeft = Math.max(existing.spotsLeft ?? 0, spots);
      } else {
        slotMap.set(start, { start, memberIds: [memberId], ...(spots !== undefined ? { spotsLeft: spots } : {}) });
      }
    };

    for (const m of members) {
      let windows = windowsForDate(m.hours, date, weekday, q.locationId);
      if (locWindows) windows = intersectWindows(windows, locWindows);
      if (svcWindows) windows = intersectWindows(windows, svcWindows);

      for (const w of windows) {
        const windowStart = localMinuteToInstant(date, w.start, q.timezone);
        const windowEnd = localMinuteToInstant(date, w.end, q.timezone);
        if (windowStart == null || windowEnd == null) continue;

        const firstMinute = Math.ceil((w.start + q.bufferBeforeMinutes) / step) * step;
        for (let minute = firstMinute; minute < w.end; minute += step) {
          const start = localMinuteToInstant(date, minute, q.timezone);
          if (start == null) continue; // skipped by DST
          if (start < earliest || start > latest) continue;
          if (start - before < windowStart || start + duration > windowEnd) continue;

          const joinSpots = m.joinable.get(start);
          if (joinSpots !== undefined) {
            if (joinSpots > 0) add(start, m.memberId, joinSpots);
            continue;
          }
          if (!isFree(m.busySorted, start - before, start + duration + after)) continue;
          add(start, m.memberId, capacity > 1 ? capacity : undefined);
        }
      }

      // Joinable sessions may sit outside today's windows if hours changed after they were created.
      for (const [start, spots] of m.joinable) {
        if (spots <= 0 || slotMap.get(start)?.memberIds.includes(m.memberId)) continue;
        if (start < earliest || start > latest) continue;
        const startLocalDate = localMinuteToInstant(date, 0, q.timezone);
        const endLocalDate = localMinuteToInstant(date, 1440, q.timezone);
        if (startLocalDate != null && endLocalDate != null && start >= startLocalDate && start < endLocalDate) {
          add(start, m.memberId, spots);
        }
      }
    }

    const slots = [...slotMap.values()].sort((a, b) => a.start - b.start);
    const order = new Map(q.members.map((m, i) => [m.memberId, i]));
    for (const s of slots) s.memberIds.sort((a, b) => (order.get(a) ?? 0) - (order.get(b) ?? 0));
    days.push({ date, slots });
  }
  return days;
}

/** Checks one specific start time — used inside the booking transaction. */
export function isSlotAvailable(q: Omit<SlotQuery, "fromDate" | "toDate">, date: string, start: number, memberId: string): boolean {
  const days = computeSlots({ ...q, fromDate: date, toDate: date, members: q.members.filter((m) => m.memberId === memberId) });
  return days.some((d) => d.slots.some((s) => s.start === start && s.memberIds.includes(memberId)));
}

/**
 * Chooses a staff member for "any available". Prefers whoever has the fewest
 * reservations that day to spread work evenly; ties keep configured order.
 */
export function pickMember(candidates: string[], loadByMember: Map<string, number>): string | null {
  if (candidates.length === 0) return null;
  let best = candidates[0];
  for (const c of candidates) {
    if ((loadByMember.get(c) ?? 0) < (loadByMember.get(best) ?? 0)) best = c;
  }
  return best;
}
