"use client";

import { useNow, useTimeZone } from "@/lib/use-client-time";
import { listTime } from "./time";

/** "2:14 PM" / "Yesterday" / "Mon" / "Sep 12" in the reader's own zone (hydration-safe). */
export function ListTime({ iso, fallbackZone, serverNow, className }: { iso: string; fallbackZone: string; serverNow: number; className?: string }) {
  const tz = useTimeZone(fallbackZone);
  const now = useNow(serverNow);
  return (
    <time dateTime={iso} className={className}>
      {listTime(iso, tz, now)}
    </time>
  );
}
