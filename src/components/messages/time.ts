import type { TFunction } from "@/i18n/translate";
import { fmtDate, fmtTime, localDateKey, relativeDayWord } from "@/lib/format";

const DAY = 86_400_000;

/** Day separator in a thread: "Today", "Yesterday", "Monday", "Sep 12" or "Sep 12, 2025" — in the reader's language. */
export function dayLabel(iso: string | Date, tz: string, now: number, intl = "en-US") {
  const word = relativeDayWord(iso, tz, intl, new Date(now));
  if (word) return word;
  const age = now - new Date(iso).getTime();
  if (age < 6 * DAY) return fmtDate(iso, tz, { weekday: "long" }, intl);
  const sameYear = fmtDate(iso, tz, { year: "numeric" }) === fmtDate(new Date(now), tz, { year: "numeric" });
  return fmtDate(iso, tz, sameYear ? { weekday: "short", month: "short", day: "numeric" } : { month: "short", day: "numeric", year: "numeric" }, intl);
}

/** Compact time for conversation lists: "2:14 PM", "Yesterday", "Mon", "Sep 12". */
export function listTime(iso: string | Date, tz: string, now: number, intl = "en-US") {
  const key = localDateKey(iso, tz);
  if (key === localDateKey(new Date(now), tz)) return fmtTime(iso, tz, intl);
  if (key === localDateKey(new Date(now - DAY), tz)) return relativeDayWord(iso, tz, intl, new Date(now)) ?? fmtDate(iso, tz, { weekday: "short" }, intl);
  if (now - new Date(iso).getTime() < 6 * DAY) return fmtDate(iso, tz, { weekday: "short" }, intl);
  return fmtDate(iso, tz, { month: "short", day: "numeric" }, intl);
}

/** Appointment reference line: "Signature cut · Fri, Oct 3 at 10:00 AM". `t` is the messages translator. */
export function apptLine(a: { serviceName: string; startsAt: string | Date; timezone: string }, t: TFunction, intl = "en-US") {
  return t("apptLine", { service: a.serviceName, date: fmtDate(a.startsAt, a.timezone, undefined, intl), time: fmtTime(a.startsAt, a.timezone, intl) });
}
