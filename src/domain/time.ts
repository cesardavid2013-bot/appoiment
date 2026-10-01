import { DateTime } from "luxon";

/** A wall-clock window on some local day, in minutes from local midnight. [start, end) */
export type MinuteWindow = { start: number; end: number };
/** An absolute window in epoch milliseconds. [start, end) */
export type InstantWindow = { start: number; end: number };

export const MINUTE = 60_000;

export function isValidTimeZone(tz: string): boolean {
  if (!tz) return false;
  return DateTime.local().setZone(tz).isValid;
}

/** ISO date (yyyy-mm-dd) of "now" in a zone. */
export function todayIn(tz: string, now: Date = new Date()): string {
  return DateTime.fromJSDate(now, { zone: tz }).toISODate()!;
}

export function addDaysIso(isoDate: string, days: number): string {
  return DateTime.fromISO(isoDate, { zone: "UTC" }).plus({ days }).toISODate()!;
}

export function isoDateRange(from: string, to: string): string[] {
  const out: string[] = [];
  let cur = from;
  // Hard cap protects against accidental unbounded ranges.
  for (let i = 0; cur <= to && i < 400; i++) {
    out.push(cur);
    cur = addDaysIso(cur, 1);
  }
  return out;
}

/** ISO weekday 1 (Mon) … 7 (Sun) of a local calendar date. */
export function isoWeekday(isoDate: string): number {
  return DateTime.fromISO(isoDate, { zone: "UTC" }).weekday;
}

/**
 * Converts a local wall-clock minute on a local date to an absolute instant.
 * Returns null when that wall-clock time does not exist (DST spring-forward gap).
 * `minute` may be 1440 (= midnight at the end of the day).
 */
export function localMinuteToInstant(isoDate: string, minute: number, tz: string): number | null {
  const dayOffset = Math.floor(minute / 1440);
  const m = minute - dayOffset * 1440;
  const base = DateTime.fromISO(isoDate, { zone: tz }).plus({ days: dayOffset });
  const hour = Math.floor(m / 60);
  const min = m % 60;
  const dt = base.set({ hour, minute: min, second: 0, millisecond: 0 });
  if (!dt.isValid) return null;
  // Luxon shifts non-existent times forward; detect and reject them.
  if (dt.hour !== hour || dt.minute !== min) return null;
  return dt.toMillis();
}

/** Local date + minute-of-day for an instant in a zone. */
export function instantToLocal(ms: number, tz: string): { date: string; minute: number; weekday: number } {
  const dt = DateTime.fromMillis(ms, { zone: tz });
  return { date: dt.toISODate()!, minute: dt.hour * 60 + dt.minute, weekday: dt.weekday };
}

/** Sorts and merges overlapping/adjacent windows. */
export function normalizeWindows<T extends { start: number; end: number }>(windows: T[]): { start: number; end: number }[] {
  const sorted = windows.filter((w) => w.end > w.start).map((w) => ({ start: w.start, end: w.end })).sort((a, b) => a.start - b.start);
  const out: { start: number; end: number }[] = [];
  for (const w of sorted) {
    const last = out[out.length - 1];
    if (last && w.start <= last.end) last.end = Math.max(last.end, w.end);
    else out.push({ ...w });
  }
  return out;
}

/** Intersection of two sets of windows (both normalised internally). */
export function intersectWindows(a: { start: number; end: number }[], b: { start: number; end: number }[]) {
  const A = normalizeWindows(a);
  const B = normalizeWindows(b);
  const out: { start: number; end: number }[] = [];
  let i = 0;
  let j = 0;
  while (i < A.length && j < B.length) {
    const start = Math.max(A[i].start, B[j].start);
    const end = Math.min(A[i].end, B[j].end);
    if (start < end) out.push({ start, end });
    if (A[i].end < B[j].end) i++;
    else j++;
  }
  return out;
}

export function overlaps(a: { start: number; end: number }, b: { start: number; end: number }): boolean {
  return a.start < b.end && b.start < a.end;
}

export function minutesToClock(minute: number): string {
  const h = Math.floor(minute / 60) % 24;
  const m = minute % 60;
  return `${String(h).padStart(2, "0")}:${String(m).padStart(2, "0")}`;
}

export function clockToMinutes(clock: string): number | null {
  const match = /^(\d{1,2}):(\d{2})$/.exec(clock.trim());
  if (!match) return null;
  const h = Number(match[1]);
  const m = Number(match[2]);
  if (h > 24 || m > 59 || (h === 24 && m !== 0)) return null;
  return h * 60 + m;
}

export const WEEKDAYS = [
  { value: 1, short: "Mon", long: "Monday" },
  { value: 2, short: "Tue", long: "Tuesday" },
  { value: 3, short: "Wed", long: "Wednesday" },
  { value: 4, short: "Thu", long: "Thursday" },
  { value: 5, short: "Fri", long: "Friday" },
  { value: 6, short: "Sat", long: "Saturday" },
  { value: 7, short: "Sun", long: "Sunday" },
] as const;
