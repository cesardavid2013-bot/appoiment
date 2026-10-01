/**
 * Client-safe date/time formatting. Times are always shown in the
 * appointment/business zone; `intl` is the viewer's language (BCP 47).
 */
const cap = (s: string) => s.charAt(0).toLocaleUpperCase() + s.slice(1);

export function fmtTime(iso: string | Date, timeZone: string, intl = "en-US") {
  return new Intl.DateTimeFormat(intl, { hour: "numeric", minute: "2-digit", timeZone }).format(new Date(iso));
}
export function fmtDate(iso: string | Date, timeZone: string, opts: Intl.DateTimeFormatOptions = { weekday: "short", month: "short", day: "numeric" }, intl = "en-US") {
  return new Intl.DateTimeFormat(intl, { ...opts, timeZone }).format(new Date(iso));
}
export function fmtDateLong(iso: string | Date, timeZone: string, intl = "en-US") {
  return new Intl.DateTimeFormat(intl, { weekday: "long", month: "long", day: "numeric", timeZone }).format(new Date(iso));
}
export function tzAbbr(iso: string | Date, timeZone: string, intl = "en-US") {
  return new Intl.DateTimeFormat(intl, { timeZone, timeZoneName: "short" }).formatToParts(new Date(iso)).find((p) => p.type === "timeZoneName")?.value ?? timeZone;
}
export function localDateKey(iso: string | Date, timeZone: string) {
  return new Intl.DateTimeFormat("en-CA", { timeZone }).format(new Date(iso));
}
/** "Today", "Tomorrow", "Yesterday" in the viewer's language, or null for other days. */
export function relativeDayWord(iso: string | Date, timeZone: string, intl = "en-US", now = new Date()): string | null {
  const day = localDateKey(iso, timeZone);
  for (const offset of [0, 1, -1]) {
    if (day === localDateKey(new Date(now.getTime() + offset * 86_400_000), timeZone)) return cap(new Intl.RelativeTimeFormat(intl, { numeric: "auto" }).format(offset, "day"));
  }
  return null;
}
/** "Today 3:30 PM", "Tomorrow 9:00 AM", "Fri 2:00 PM", "Oct 14" — localized. */
export function fmtRelativeSlot(iso: string, timeZone: string, now = new Date(), intl = "en-US") {
  const time = fmtTime(iso, timeZone, intl);
  const word = relativeDayWord(iso, timeZone, intl, now);
  if (word) return `${word} ${time}`;
  const diff = (new Date(iso).getTime() - now.getTime()) / 86_400_000;
  if (diff < 6) return `${cap(fmtDate(iso, timeZone, { weekday: "short" }, intl))} ${time}`;
  return fmtDate(iso, timeZone, { month: "short", day: "numeric" }, intl);
}
export function timeAgo(iso: string | Date, now = Date.now(), intl = "en-US") {
  const s = Math.max(0, (now - new Date(iso).getTime()) / 1000);
  const rtf = new Intl.RelativeTimeFormat(intl, { numeric: "auto", style: "short" });
  if (s < 45) return rtf.format(0, "second");
  if (s < 3600) return rtf.format(-Math.max(1, Math.floor(s / 60)), "minute");
  if (s < 86400) return rtf.format(-Math.floor(s / 3600), "hour");
  if (s < 86400 * 7) return rtf.format(-Math.floor(s / 86400), "day");
  return new Intl.DateTimeFormat(intl, { month: "short", day: "numeric" }).format(new Date(iso));
}
