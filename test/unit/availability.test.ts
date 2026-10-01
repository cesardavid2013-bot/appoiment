import { DateTime } from "luxon";
import { describe, expect, it } from "vitest";
import { computeSlots, isSlotAvailable, pickMember, type SlotQuery } from "@/domain/availability";

const NY = "America/New_York";
const at = (iso: string, zone = NY) => DateTime.fromISO(iso, { zone }).toMillis();
const local = (ms: number, zone = NY) => DateTime.fromMillis(ms, { zone }).toFormat("HH:mm");

const weekdays9to5 = [1, 2, 3, 4, 5].map((weekday) => ({ weekday, start: 9 * 60, end: 17 * 60 }));

function base(overrides: Partial<SlotQuery> = {}): SlotQuery {
  return {
    timezone: NY,
    fromDate: "2026-03-02", // Monday
    toDate: "2026-03-02",
    now: at("2026-03-01T08:00"),
    durationMinutes: 60,
    bufferBeforeMinutes: 0,
    bufferAfterMinutes: 0,
    stepMinutes: 30,
    minNoticeMinutes: 0,
    maxAdvanceDays: 60,
    members: [{ memberId: "a", hours: { weekly: weekdays9to5 }, busy: [] }],
    ...overrides,
  };
}

const times = (q: SlotQuery, day = 0) => computeSlots(q)[day].slots.map((s) => local(s.start, q.timezone));

describe("computeSlots — basics", () => {
  it("generates aligned slots that end by close", () => {
    const t = times(base());
    expect(t[0]).toBe("09:00");
    expect(t.at(-1)).toBe("16:00"); // 16:00 + 60 = 17:00
    expect(t).toHaveLength(15);
  });

  it("returns nothing on days without hours", () => {
    expect(times(base({ fromDate: "2026-03-07", toDate: "2026-03-07" }))).toEqual([]); // Saturday
  });

  it("supports split shifts (breaks are gaps)", () => {
    const q = base({
      members: [
        {
          memberId: "a",
          hours: { weekly: [{ weekday: 1, start: 9 * 60, end: 12 * 60 }, { weekday: 1, start: 13 * 60, end: 18 * 60 }] },
          busy: [],
        },
      ],
    });
    const t = times(q);
    expect(t).toContain("11:00");
    expect(t).not.toContain("11:30"); // would run into the break
    expect(t).not.toContain("12:00");
    expect(t).toContain("13:00");
    expect(t.at(-1)).toBe("17:00");
  });

  it("excludes overlapping reservations and respects buffers on both sides", () => {
    const q = base({
      bufferBeforeMinutes: 15,
      bufferAfterMinutes: 15,
      stepMinutes: 15,
      members: [
        {
          memberId: "a",
          hours: { weekly: weekdays9to5 },
          busy: [{ start: at("2026-03-02T12:00"), end: at("2026-03-02T13:00") }],
        },
      ],
    });
    const t = times(q);
    expect(t[0]).toBe("09:15"); // prep buffer must fit inside working hours
    expect(t).toContain("10:45"); // block 10:30–12:00 touches but does not overlap
    expect(t).not.toContain("11:00"); // cleanup would overlap 12:00
    expect(t).not.toContain("12:30");
    expect(t).toContain("13:15"); // prep 13:00–13:15 right after the reservation
    expect(t).toContain("16:00"); // cleanup may run past close
    expect(t).not.toContain("16:15");
  });

  it("enforces minimum notice and maximum horizon", () => {
    const now = at("2026-03-02T10:10");
    expect(times(base({ now, minNoticeMinutes: 60 }))[0]).toBe("11:30");
    const far = base({ now: at("2026-01-01T09:00"), maxAdvanceDays: 30 });
    expect(times(far)).toEqual([]);
  });

  it("applies date overrides (custom hours and days off)", () => {
    const custom = base({
      members: [{ memberId: "a", hours: { weekly: weekdays9to5, overrides: { "2026-03-02": [{ start: 600, end: 720 }] } }, busy: [] }],
    });
    expect(times(custom)).toEqual(["10:00", "10:30", "11:00"]);
    const off = base({ members: [{ memberId: "a", hours: { weekly: weekdays9to5, overrides: { "2026-03-02": [] } }, busy: [] }] });
    expect(times(off)).toEqual([]);
  });

  it("intersects staff hours with location and service hours", () => {
    const q = base({
      locationHours: { weekly: [{ weekday: 1, start: 10 * 60, end: 20 * 60 }] },
      serviceHours: [{ weekday: 1, start: 8 * 60, end: 14 * 60 }],
    });
    const t = times(q);
    expect(t[0]).toBe("10:00");
    expect(t.at(-1)).toBe("13:00");
  });

  it("ignores weekly rules bound to a different location", () => {
    const q = base({
      locationId: "loc-1",
      members: [
        {
          memberId: "a",
          hours: {
            weekly: [
              { weekday: 1, start: 9 * 60, end: 12 * 60, locationId: "loc-1" },
              { weekday: 1, start: 13 * 60, end: 17 * 60, locationId: "loc-2" },
            ],
          },
          busy: [],
        },
      ],
    });
    expect(times(q).at(-1)).toBe("11:00");
  });

  it("merges members for 'any available' and keeps member order", () => {
    const q = base({
      members: [
        { memberId: "a", hours: { weekly: [{ weekday: 1, start: 540, end: 600 }] }, busy: [] },
        { memberId: "b", hours: { weekly: [{ weekday: 1, start: 540, end: 660 }] }, busy: [] },
      ],
    });
    const slots = computeSlots(q)[0].slots;
    expect(slots[0].memberIds).toEqual(["a", "b"]);
    expect(slots.at(-1)!.memberIds).toEqual(["b"]);
  });
});

describe("computeSlots — time zones & DST", () => {
  it("handles the spring-forward gap without shifting the working day", () => {
    // US DST starts Sunday 2026-03-08 at 02:00 local.
    const q = base({
      fromDate: "2026-03-08",
      toDate: "2026-03-08",
      now: at("2026-03-01T00:00"),
      members: [{ memberId: "a", hours: { weekly: [{ weekday: 7, start: 60, end: 6 * 60 }] }, busy: [] }],
    });
    const slots = computeSlots(q)[0].slots;
    const labels = slots.map((s) => local(s.start));
    expect(labels).not.toContain("02:00");
    expect(labels).not.toContain("02:30");
    expect(labels).toContain("03:00");
    // 01:30 + 60 real minutes ends at 03:30 local, still inside the window.
    expect(labels).toContain("01:30");
    // All instants are distinct and in order.
    const ms = slots.map((s) => s.start);
    expect(new Set(ms).size).toBe(ms.length);
  });

  it("keeps 9–5 wall-clock hours on both sides of DST transitions", () => {
    const q = base({ fromDate: "2026-03-06", toDate: "2026-03-09", now: at("2026-03-01T00:00") });
    const days = computeSlots(q);
    const friday = days[0].slots.map((s) => local(s.start));
    const monday = days[3].slots.map((s) => local(s.start));
    expect(friday[0]).toBe("09:00");
    expect(monday[0]).toBe("09:00");
    // Instants differ by 3 days minus one hour across the change.
    expect(days[3].slots[0].start - days[0].slots[0].start).toBe((3 * 24 - 1) * 3_600_000);
  });

  it("handles fall-back day (25-hour day)", () => {
    // US DST ends Sunday 2026-11-01.
    const q = base({
      fromDate: "2026-11-01",
      toDate: "2026-11-01",
      now: at("2026-10-01T00:00"),
      maxAdvanceDays: 90,
      members: [{ memberId: "a", hours: { weekly: [{ weekday: 7, start: 9 * 60, end: 12 * 60 }] }, busy: [] }],
    });
    expect(times(q)).toEqual(["09:00", "09:30", "10:00", "10:30", "11:00"]);
  });

  it("supports half-hour offset zones and windows ending at midnight", () => {
    const zone = "Asia/Kolkata";
    const q = base({
      timezone: zone,
      now: DateTime.fromISO("2026-03-01T00:00", { zone }).toMillis(),
      members: [{ memberId: "a", hours: { weekly: [{ weekday: 1, start: 22 * 60, end: 1440 }] }, busy: [] }],
    });
    const slots = computeSlots(q)[0].slots;
    expect(slots.map((s) => local(s.start, zone))).toEqual(["22:00", "22:30", "23:00"]);
    expect(new Date(slots[0].start).toISOString()).toBe("2026-03-02T16:30:00.000Z");
  });
});

describe("computeSlots — group sessions", () => {
  it("offers spots in an existing session even though the member is busy", () => {
    const sessionStart = at("2026-03-02T10:00");
    const q = base({
      capacity: 8,
      members: [
        {
          memberId: "a",
          hours: { weekly: weekdays9to5 },
          busy: [{ start: sessionStart, end: sessionStart + 3_600_000 }],
          joinableSessions: [{ startsAt: sessionStart, spotsLeft: 3 }],
        },
      ],
    });
    const slots = computeSlots(q)[0].slots;
    const ten = slots.find((s) => s.start === sessionStart)!;
    expect(ten.spotsLeft).toBe(3);
    expect(slots.find((s) => local(s.start) === "10:30")).toBeUndefined();
    expect(slots.find((s) => local(s.start) === "13:00")!.spotsLeft).toBe(8);
  });

  it("hides full sessions", () => {
    const sessionStart = at("2026-03-02T10:00");
    const q = base({
      capacity: 8,
      members: [
        {
          memberId: "a",
          hours: { weekly: weekdays9to5 },
          busy: [{ start: sessionStart, end: sessionStart + 3_600_000 }],
          joinableSessions: [{ startsAt: sessionStart, spotsLeft: 0 }],
        },
      ],
    });
    expect(computeSlots(q)[0].slots.find((s) => s.start === sessionStart)).toBeUndefined();
  });
});

describe("isSlotAvailable / pickMember", () => {
  it("validates an exact start for a specific member", () => {
    const q = base();
    expect(isSlotAvailable(q, "2026-03-02", at("2026-03-02T10:00"), "a")).toBe(true);
    expect(isSlotAvailable(q, "2026-03-02", at("2026-03-02T10:10"), "a")).toBe(false); // misaligned
    expect(isSlotAvailable(q, "2026-03-02", at("2026-03-02T16:30"), "a")).toBe(false); // runs past close
    expect(isSlotAvailable(q, "2026-03-02", at("2026-03-02T10:00"), "zzz")).toBe(false);
  });

  it("balances load for any-available", () => {
    expect(pickMember(["a", "b", "c"], new Map([["a", 3], ["b", 1], ["c", 1]]))).toBe("b");
    expect(pickMember([], new Map())).toBeNull();
  });
});
