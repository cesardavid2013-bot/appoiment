import { fmtDate, fmtTime, localDateKey } from "@/lib/format";

const DAY = 86_400_000;

/** Day separator in a thread: "Today", "Yesterday", "Monday", "Sep 12" or "Sep 12, 2025". */
export function dayLabel(iso: string | Date, tz: string, now: number) {
  const key = localDateKey(iso, tz);
  if (key === localDateKey(new Date(now), tz)) return "Today";
  if (key === localDateKey(new Date(now - DAY), tz)) return "Yesterday";
  const age = now - new Date(iso).getTime();
  if (age < 6 * DAY) return fmtDate(iso, tz, { weekday: "long" });
  const sameYear = fmtDate(iso, tz, { year: "numeric" }) === fmtDate(new Date(now), tz, { year: "numeric" });
  return fmtDate(iso, tz, sameYear ? { weekday: "short", month: "short", day: "numeric" } : { month: "short", day: "numeric", year: "numeric" });
}

/** Compact time for conversation lists: "2:14 PM", "Yesterday", "Mon", "Sep 12". */
export function listTime(iso: string | Date, tz: string, now: number) {
  const key = localDateKey(iso, tz);
  if (key === localDateKey(new Date(now), tz)) return fmtTime(iso, tz);
  if (key === localDateKey(new Date(now - DAY), tz)) return "Yesterday";
  if (now - new Date(iso).getTime() < 6 * DAY) return fmtDate(iso, tz, { weekday: "short" });
  return fmtDate(iso, tz, { month: "short", day: "numeric" });
}

/** Appointment reference line: "Signature cut · Fri, Oct 3 at 10:00 AM". */
export function apptLine(a: { serviceName: string; startsAt: string | Date; timezone: string }) {
  return `${a.serviceName} · ${fmtDate(a.startsAt, a.timezone)} at ${fmtTime(a.startsAt, a.timezone)}`;
}
