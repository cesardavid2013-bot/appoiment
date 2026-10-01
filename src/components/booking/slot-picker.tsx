"use client";

import { useQuery } from "@tanstack/react-query";
import { ChevronLeft, ChevronRight } from "lucide-react";
import { useEffect, useState } from "react";
import { FormError } from "@/components/ui/field";
import { Skeleton } from "@/components/ui/misc";
import { addDaysIso, todayIn } from "@/domain/time";
import { api } from "@/lib/api";
import { cn } from "@/lib/cn";
import { fmtTime, localDateKey } from "@/lib/format";

type SlotsResponse = { timezone: string; days: { date: string; slots: { start: string; memberIds: string[] }[] }[] };

/** Compact week-by-week time picker backed by the live slots API. */
export function SlotPicker({
  serviceId,
  memberId,
  locationId,
  optionIds,
  timezone,
  value,
  onChange,
  exclude,
}: {
  serviceId: string;
  memberId: string;
  locationId: string | null;
  optionIds: string[];
  timezone: string;
  value: string | null;
  onChange: (start: string) => void;
  /** Hide this start (e.g. the appointment's current time). */
  exclude?: string;
}) {
  const today = todayIn(timezone);
  const [from, setFrom] = useState(today);
  const to = addDaysIso(from, 6);
  const [date, setDate] = useState<string | null>(null);
  const q = useQuery({
    queryKey: ["slots-picker", serviceId, memberId, locationId, optionIds.join(","), from],
    queryFn: ({ signal }) => {
      const p = new URLSearchParams({ serviceId, memberId, from, to });
      if (locationId) p.set("locationId", locationId);
      optionIds.forEach((o) => p.append("options", o));
      return api<SlotsResponse>(`/api/slots?${p}`, { signal });
    },
  });
  useEffect(() => {
    if (!q.data) return;
    if (!date || date < from || date > to) setDate(q.data.days.find((d) => d.slots.length)?.date ?? from);
  }, [q.data, date, from, to]);
  const days = Array.from({ length: 7 }, (_, i) => addDaysIso(from, i));
  const slots = (q.data?.days.find((d) => d.date === date)?.slots ?? []).filter((s) => s.start !== exclude);

  return (
    <div>
      <div className="mb-3 flex items-center justify-between">
        <span className="text-sm font-medium text-ink">{new Intl.DateTimeFormat("en-US", { month: "long", timeZone: "UTC" }).format(new Date(`${date ?? from}T12:00:00Z`))}</span>
        <div className="flex gap-1">
          <button type="button" disabled={from <= today} onClick={() => setFrom(addDaysIso(from, -7) < today ? today : addDaysIso(from, -7))} className="flex size-8 items-center justify-center rounded-md border border-line disabled:opacity-40" aria-label="Previous week">
            <ChevronLeft className="size-4" />
          </button>
          <button type="button" onClick={() => setFrom(addDaysIso(from, 7))} className="flex size-8 items-center justify-center rounded-md border border-line" aria-label="Next week">
            <ChevronRight className="size-4" />
          </button>
        </div>
      </div>
      <div className="grid grid-cols-7 gap-1">
        {days.map((d) => {
          const has = q.data?.days.find((x) => x.date === d)?.slots.some((s) => s.start !== exclude);
          const dt = new Date(`${d}T12:00:00Z`);
          return (
            <button
              key={d}
              type="button"
              onClick={() => setDate(d)}
              aria-pressed={date === d}
              className={cn("flex h-14 flex-col items-center justify-center rounded-md border text-xs", date === d ? "border-ink bg-ink text-bg" : has ? "border-line bg-surface text-ink" : "border-transparent text-ink-3")}
            >
              <span className="uppercase">{new Intl.DateTimeFormat("en-US", { weekday: "narrow", timeZone: "UTC" }).format(dt)}</span>
              <span className="text-[15px] font-semibold">{dt.getUTCDate()}</span>
            </button>
          );
        })}
      </div>
      <div className="mt-4 min-h-28">
        {q.error ? (
          <FormError message={(q.error as Error).message} />
        ) : q.isLoading ? (
          <div className="grid grid-cols-3 gap-2">
            {Array.from({ length: 6 }, (_, i) => (
              <Skeleton key={i} className="h-10" />
            ))}
          </div>
        ) : slots.length === 0 ? (
          <p className="py-6 text-center text-sm text-ink-3">No openings this day.</p>
        ) : (
          <div className="grid max-h-56 grid-cols-3 gap-2 overflow-y-auto sm:grid-cols-4">
            {slots.map((s) => (
              <button
                key={s.start}
                type="button"
                onClick={() => onChange(s.start)}
                aria-pressed={value === s.start}
                className={cn("h-10 rounded-md border text-sm font-semibold tabular", value === s.start ? "border-ink bg-ink text-bg" : "border-line-strong bg-surface text-ink hover:border-ink")}
              >
                {fmtTime(s.start, q.data!.timezone)}
              </button>
            ))}
          </div>
        )}
      </div>
      {value && localDateKey(value, timezone) && <p className="sr-only">Selected {fmtTime(value, timezone)}</p>}
    </div>
  );
}
