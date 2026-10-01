"use client";

import { fmtDate, fmtTime } from "@/lib/format";
import { useLocale } from "@/i18n/client";
import { useTimeZone } from "@/lib/use-client-time";

/**
 * A date ("October 3, 2026") or date-time ("Oct 3, 2:15 PM") in the reader's
 * own time zone; the server renders with the account's zone as a fallback.
 */
export function LocalTime({ iso, fallbackZone, className, format = "datetime" }: { iso: string; fallbackZone: string; className?: string; format?: "datetime" | "date" }) {
  const tz = useTimeZone(fallbackZone);
  const { intl } = useLocale();
  return (
    <time dateTime={iso} className={className}>
      {format === "date" ? fmtDate(iso, tz, { month: "long", day: "numeric", year: "numeric" }, intl) : `${fmtDate(iso, tz, { month: "short", day: "numeric" }, intl)}, ${fmtTime(iso, tz, intl)}`}
    </time>
  );
}
