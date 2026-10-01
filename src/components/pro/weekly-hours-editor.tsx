"use client";

import { Copy, Plus, X } from "lucide-react";
import { Switch as S } from "radix-ui";
import { WEEKDAYS } from "@/domain/time";
import { useLocale, useT } from "@/i18n/client";
import { cn } from "@/lib/cn";

export type DayHours = { weekday: number; windows: { start: number; end: number }[] };

const TIMES = Array.from({ length: 97 }, (_, i) => i * 15);

/**
 * Minutes after midnight as a clock time in the viewer's language ("9:00 AM", "09:00").
 * `compact` drops ":00" on the hour where the language uses a 12-hour clock ("9 AM").
 * Pass `midnight` for the end-of-day value 1440.
 */
export function minutesLabel(m: number, intl: string, opts: { compact?: boolean; midnight?: string } = {}) {
  if (m === 1440 && opts.midnight) return opts.midnight;
  const at = new Date(Date.UTC(2024, 0, 1, 0, m % 1440));
  const twelve = new Intl.DateTimeFormat(intl, { hour: "numeric" }).resolvedOptions().hour12;
  const dropMinutes = opts.compact && twelve && at.getUTCMinutes() === 0;
  return new Intl.DateTimeFormat(intl, { hour: "numeric", minute: dropMinutes ? undefined : "2-digit", timeZone: "UTC" }).format(at);
}

/** Weekday name in the viewer's language, capitalised to stand alone as a label; 1 = Monday … 7 = Sunday. */
export function weekdayLabel(wd: number, intl: string, width: "long" | "short" = "long") {
  const s = new Intl.DateTimeFormat(intl, { weekday: width, timeZone: "UTC" }).format(new Date(Date.UTC(2024, 0, wd)));
  return s.charAt(0).toLocaleUpperCase(intl) + s.slice(1);
}

function TimeSelect({ value, onChange, min, max, ariaLabel }: { value: number; onChange: (v: number) => void; min: number; max: number; ariaLabel: string }) {
  const t = useT("proSetup");
  const { intl } = useLocale();
  const label = (m: number) => minutesLabel(m, intl, { midnight: t("hours.midnight") });
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
  const t = useT("proSetup");
  const { intl } = useLocale();
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
        const dayName = weekdayLabel(d.weekday, intl);
        return (
          <li key={d.weekday} className="flex flex-col gap-3 px-4 py-3.5 sm:flex-row sm:items-start">
            <div className="flex w-full shrink-0 items-center gap-3 pt-1.5 sm:w-36">
              <S.Root
                checked={open}
                onCheckedChange={(v) => setDay(d.weekday, v ? [{ start: 540, end: 1020 }] : [])}
                aria-label={t("hours.openOn", { day: dayName })}
                className="relative inline-flex h-6 w-10 shrink-0 items-center rounded-full bg-line-strong transition-colors data-[state=checked]:bg-accent"
              >
                <S.Thumb className="block size-5 translate-x-0.5 rounded-full bg-white shadow-sm transition-transform duration-200 data-[state=checked]:translate-x-[18px]" />
              </S.Root>
              <span className={cn("text-sm font-medium", open ? "text-ink" : "text-ink-3")}>{dayName}</span>
              {!open && <span className="ms-auto text-sm text-ink-3 sm:hidden">{t("hours.closed")}</span>}
            </div>
            <div className={cn("min-w-0 flex-1", !open && "hidden sm:block")}>
              {!open ? (
                <p className="hidden pt-2 text-sm text-ink-3 sm:block">{t("hours.closed")}</p>
              ) : (
                <div className="space-y-2">
                  {d.windows.map((w, i) => {
                    const prevEnd = i > 0 ? d.windows[i - 1].end : 0;
                    const invalid = w.end <= w.start || w.start < prevEnd;
                    return (
                      <div key={i} className="flex flex-wrap items-center gap-2">
                        <TimeSelect ariaLabel={t("hours.startLabel", { day: dayName, n: i + 1 })} value={w.start} min={prevEnd} max={1425} onChange={(v) => setDay(d.weekday, d.windows.map((x, j) => (j === i ? { start: v, end: Math.max(x.end, v + 15) } : x)))} />
                        <span className="text-sm text-ink-3">{t("hours.to")}</span>
                        <TimeSelect ariaLabel={t("hours.endLabel", { day: dayName, n: i + 1 })} value={w.end} min={w.start + 15} max={1440} onChange={(v) => setDay(d.weekday, d.windows.map((x, j) => (j === i ? { ...x, end: v } : x)))} />
                        {d.windows.length > 1 && (
                          <button type="button" onClick={() => setDay(d.weekday, d.windows.filter((_, j) => j !== i))} className="flex size-8 items-center justify-center rounded-md text-ink-3 hover:bg-surface-2 hover:text-ink" aria-label={t("hours.removeRange")}>
                            <X className="size-4" />
                          </button>
                        )}
                        {invalid && <span className="text-[12px] text-danger">{t("hours.checkTimes")}</span>}
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
                        <Plus className="size-3.5" /> {t("hours.addAfterBreak")}
                      </button>
                    )}
                    <button type="button" onClick={() => copyToAll(d)} className="inline-flex items-center gap-1 text-[13px] font-medium text-ink-2 hover:text-ink">
                      <Copy className="size-3.5" /> {t("hours.copyToOpenDays")}
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
