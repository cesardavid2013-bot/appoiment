"use client";

import { Copy, Plus, X } from "lucide-react";
import { Switch as S } from "radix-ui";
import { WEEKDAYS } from "@/domain/time";
import { cn } from "@/lib/cn";

export type DayHours = { weekday: number; windows: { start: number; end: number }[] };

const TIMES = Array.from({ length: 97 }, (_, i) => i * 15);
function label(m: number) {
  if (m === 1440) return "Midnight";
  const h = Math.floor(m / 60);
  const mm = m % 60;
  const hh = h % 12 || 12;
  return `${hh}:${String(mm).padStart(2, "0")} ${h < 12 ? "AM" : "PM"}`;
}

function TimeSelect({ value, onChange, min, max, ariaLabel }: { value: number; onChange: (v: number) => void; min: number; max: number; ariaLabel: string }) {
  return (
    <select
      aria-label={ariaLabel}
      value={value}
      onChange={(e) => onChange(Number(e.target.value))}
      className="h-9 w-[104px] cursor-pointer appearance-none rounded-md border border-line-strong bg-surface px-2.5 text-[14px] text-ink tabular hover:border-ink-3/50 focus:border-accent focus:outline-none focus:ring-3 focus:ring-accent/15"
    >
      {TIMES.filter((t) => t >= min && t <= max).map((t) => (
        <option key={t} value={t}>
          {label(t)}
        </option>
      ))}
    </select>
  );
}

/**
 * Weekly schedule with split shifts. Gaps between windows are breaks.
 * Validates ordering inline so invalid hours can't be submitted.
 */
export function WeeklyHoursEditor({ value, onChange }: { value: DayHours[]; onChange: (v: DayHours[]) => void }) {
  const byDay = WEEKDAYS.map((d) => value.find((v) => v.weekday === d.value) ?? { weekday: d.value, windows: [] });
  function setDay(weekday: number, windows: { start: number; end: number }[]) {
    onChange(byDay.map((d) => (d.weekday === weekday ? { weekday, windows } : d)));
  }
  function copyToAll(src: DayHours) {
    onChange(byDay.map((d) => ({ weekday: d.weekday, windows: d.weekday === src.weekday || d.windows.length ? (d.weekday === src.weekday ? d.windows : src.windows.map((w) => ({ ...w }))) : d.windows })));
  }
  return (
    <ul className="divide-y divide-line rounded-lg border border-line bg-surface">
      {byDay.map((d) => {
        const open = d.windows.length > 0;
        const meta = WEEKDAYS[d.weekday - 1];
        return (
          <li key={d.weekday} className="flex flex-col gap-3 px-4 py-3.5 sm:flex-row sm:items-start">
            <div className="flex w-36 shrink-0 items-center gap-3 pt-1.5">
              <S.Root
                checked={open}
                onCheckedChange={(v) => setDay(d.weekday, v ? [{ start: 540, end: 1020 }] : [])}
                aria-label={`Open on ${meta.long}`}
                className="relative inline-flex h-6 w-10 shrink-0 items-center rounded-full bg-line-strong transition-colors data-[state=checked]:bg-accent"
              >
                <S.Thumb className="block size-5 translate-x-0.5 rounded-full bg-white shadow-sm transition-transform duration-200 data-[state=checked]:translate-x-[18px]" />
              </S.Root>
              <span className={cn("text-sm font-medium", open ? "text-ink" : "text-ink-3")}>{meta.long}</span>
            </div>
            <div className="min-w-0 flex-1">
              {!open ? (
                <p className="pt-2 text-sm text-ink-3">Closed</p>
              ) : (
                <div className="space-y-2">
                  {d.windows.map((w, i) => {
                    const prevEnd = i > 0 ? d.windows[i - 1].end : 0;
                    const invalid = w.end <= w.start || w.start < prevEnd;
                    return (
                      <div key={i} className="flex flex-wrap items-center gap-2">
                        <TimeSelect ariaLabel={`${meta.long} start ${i + 1}`} value={w.start} min={prevEnd} max={1425} onChange={(v) => setDay(d.weekday, d.windows.map((x, j) => (j === i ? { start: v, end: Math.max(x.end, v + 15) } : x)))} />
                        <span className="text-sm text-ink-3">to</span>
                        <TimeSelect ariaLabel={`${meta.long} end ${i + 1}`} value={w.end} min={w.start + 15} max={1440} onChange={(v) => setDay(d.weekday, d.windows.map((x, j) => (j === i ? { ...x, end: v } : x)))} />
                        {d.windows.length > 1 && (
                          <button type="button" onClick={() => setDay(d.weekday, d.windows.filter((_, j) => j !== i))} className="flex size-8 items-center justify-center rounded-md text-ink-3 hover:bg-surface-2 hover:text-ink" aria-label="Remove time range">
                            <X className="size-4" />
                          </button>
                        )}
                        {invalid && <span className="text-[12px] text-danger">Check these times</span>}
                      </div>
                    );
                  })}
                  <div className="flex flex-wrap gap-x-4 gap-y-1 pt-0.5">
                    {d.windows.at(-1)!.end <= 1380 && (
                      <button
                        type="button"
                        onClick={() => {
                          const last = d.windows.at(-1)!;
                          const start = Math.min(last.end + 60, 1380);
                          setDay(d.weekday, [...d.windows, { start, end: Math.min(start + 180, 1440) }]);
                        }}
                        className="inline-flex items-center gap-1 text-[13px] font-medium text-ink-2 hover:text-ink"
                      >
                        <Plus className="size-3.5" /> Add hours after a break
                      </button>
                    )}
                    <button type="button" onClick={() => copyToAll(d)} className="inline-flex items-center gap-1 text-[13px] font-medium text-ink-2 hover:text-ink">
                      <Copy className="size-3.5" /> Copy to other open days
                    </button>
                  </div>
                </div>
              )}
            </div>
          </li>
        );
      })}
    </ul>
  );
}

export function hoursAreValid(days: DayHours[]) {
  return days.every((d) => d.windows.every((w, i) => w.end > w.start && (i === 0 || w.start >= d.windows[i - 1].end)));
}
