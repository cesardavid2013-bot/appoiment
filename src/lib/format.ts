/** Client-safe date/time formatting. Times are always shown in the appointment/business zone. */
export function fmtTime(iso: string | Date, timeZone: string) {
  return new Intl.DateTimeFormat("en-US", { hour: "numeric", minute: "2-digit", timeZone }).format(new Date(iso));
}
export function fmtDate(iso: string | Date, timeZone: string, opts: Intl.DateTimeFormatOptions = { weekday: "short", month: "short", day: "numeric" }) {
  return new Intl.DateTimeFormat("en-US", { ...opts, timeZone }).format(new Date(iso));
}
export function fmtDateLong(iso: string | Date, timeZone: string) {
  return new Intl.DateTimeFormat("en-US", { weekday: "long", month: "long", day: "numeric", timeZone }).format(new Date(iso));
}
export function tzAbbr(iso: string | Date, timeZone: string) {
  return new Intl.DateTimeFormat("en-US", { timeZone, timeZoneName: "short" }).formatToParts(new Date(iso)).find((p) => p.type === "timeZoneName")?.value ?? timeZone;
}
export function localDateKey(iso: string | Date, timeZone: string) {
  return new Intl.DateTimeFormat("en-CA", { timeZone }).format(new Date(iso));
}
/** "Today 3:30 PM", "Tomorrow 9:00 AM", "Fri 2:00 PM", "Oct 14" */
export function fmtRelativeSlot(iso: string, timeZone: string, now = new Date()) {
  const day = localDateKey(iso, timeZone);
  const today = localDateKey(now, timeZone);
  const tomorrow = localDateKey(new Date(now.getTime() + 86_400_000), timeZone);
  const time = fmtTime(iso, timeZone);
  if (day === today) return `Today ${time}`;
  if (day === tomorrow) return `Tomorrow ${time}`;
  const diff = (new Date(iso).getTime() - now.getTime()) / 86_400_000;
  if (diff < 6) return `${fmtDate(iso, timeZone, { weekday: "short" })} ${time}`;
  return fmtDate(iso, timeZone, { month: "short", day: "numeric" });
}
export function timeAgo(iso: string | Date, now = Date.now()) {
  const s = Math.max(0, (now - new Date(iso).getTime()) / 1000);
  if (s < 60) return "just now";
  if (s < 3600) return `${Math.floor(s / 60)}m ago`;
  if (s < 86400) return `${Math.floor(s / 3600)}h ago`;
  if (s < 86400 * 7) return `${Math.floor(s / 86400)}d ago`;
  return new Intl.DateTimeFormat("en-US", { month: "short", day: "numeric" }).format(new Date(iso));
}
