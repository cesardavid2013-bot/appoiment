/** Server-side formatting for notifications/emails, always in the appointment's own time zone. */
export function formatWhen(date: Date, timeZone: string): string {
  return new Intl.DateTimeFormat("en-US", {
    weekday: "short",
    month: "short",
    day: "numeric",
    hour: "numeric",
    minute: "2-digit",
    timeZone,
    timeZoneName: "short",
  }).format(date);
}

export function formatDateOnly(date: Date, timeZone: string): string {
  return new Intl.DateTimeFormat("en-US", { weekday: "long", month: "long", day: "numeric", timeZone }).format(date);
}

export function formatTimeOnly(date: Date, timeZone: string): string {
  return new Intl.DateTimeFormat("en-US", { hour: "numeric", minute: "2-digit", timeZone }).format(date);
}
