"use client";

import { usePathname, useRouter } from "next/navigation";
import { useState, useTransition } from "react";
import { Segmented } from "@/components/ui/controls";
import { formatMoney } from "@/domain/money";
import { useLocale, useT } from "@/i18n/client";
import { cn } from "@/lib/cn";

/** Range switcher: lives in the URL so the server computes the numbers. */
export function RangeSwitcher({ days }: { days: 7 | 30 | 90 }) {
  const router = useRouter();
  const pathname = usePathname();
  const [pending, start] = useTransition();
  const t = useT("pro");
  return (
    <div className={cn("transition-opacity", pending && "opacity-60")} aria-busy={pending || undefined}>
      <Segmented
        label={t("insights.range")}
        value={String(days) as "7" | "30" | "90"}
        onChange={(v) => start(() => router.push(`${pathname}?days=${v}`, { scroll: false }))}
        options={[
          { value: "7", label: t("insights.days", { count: 7 }) },
          { value: "30", label: t("insights.days", { count: 30 }) },
          { value: "90", label: t("insights.days", { count: 90 }) },
        ]}
      />
    </div>
  );
}

type Point = { day: string; bookings: number; collected: number };

const dayLabel = (d: string, intl: string, opts: Intl.DateTimeFormatOptions = { month: "short", day: "numeric" }) =>
  new Intl.DateTimeFormat(intl, { ...opts, timeZone: "UTC" }).format(new Date(`${d}T12:00:00Z`));

/** A "nice" axis maximum: 1, 2, 2.5 or 5 × 10ⁿ at or above the data max. */
function niceMax(v: number) {
  if (v <= 0) return 1;
  const p = 10 ** Math.floor(Math.log10(v));
  for (const m of [1, 2, 2.5, 5, 10]) if (m * p >= v) return m * p;
  return 10 * p;
}

/**
 * Daily bar chart, one measure at a time (bookings and money never share an
 * axis). Hover or tap a bar for its value; the same data is in a table below.
 */
export function DailyChart({ series, currency }: { series: Point[]; currency: string }) {
  const t = useT("pro");
  const { intl } = useLocale();
  const [metric, setMetric] = useState<"bookings" | "collected">("bookings");
  const [active, setActive] = useState<number | null>(null);
  const values = series.map((p) => (metric === "bookings" ? p.bookings : p.collected));
  const isMoney = metric === "collected";
  const top = isMoney ? niceMax(Math.max(...values) / 100) * 100 : Math.max(4, niceMax(Math.max(...values)));
  const fmt = (v: number) => (isMoney ? formatMoney(v, currency, { compact: true, intl }) : v.toLocaleString(intl));
  const total = values.reduce((s, v) => s + v, 0);
  const dense = series.length > 31;
  const ticks = [top, top / 2, 0];
  const labelIdx = [0, Math.floor((series.length - 1) / 2), series.length - 1];
  const a = active != null ? series[active] : null;

  return (
    <div>
      <div className="flex flex-wrap items-center justify-between gap-3">
        <Segmented
          size="sm"
          label={t("insights.chart.measure")}
          value={metric}
          onChange={(v) => {
            setMetric(v);
            setActive(null);
          }}
          options={[
            { value: "bookings", label: t("insights.kpi.bookings") },
            { value: "collected", label: t("insights.kpi.collected") },
          ]}
        />
        <p className="text-[13px] text-ink-3" aria-live="polite">
          {isMoney ? t("insights.chart.totalCollected", { amount: formatMoney(total, currency, { intl }) }) : t("insights.chart.totalBookings", { count: total })}
        </p>
      </div>

      <div className="mt-4 grid grid-cols-[auto_minmax(0,1fr)] gap-x-2">
        <div className="relative h-44 w-10 text-end text-[11px] text-ink-3 tabular" aria-hidden>
          {ticks.map((tick, i) => (
            <span key={i} className="absolute end-0 -translate-y-1/2" style={{ top: `${(i / (ticks.length - 1)) * 100}%` }}>
              {isMoney ? formatMoney(tick, currency, { compact: true, intl }) : tick.toLocaleString(intl)}
            </span>
          ))}
        </div>
        <div className="relative h-44" onMouseLeave={() => setActive(null)}>
          {ticks.map((_, i) => (
            <div key={i} className="absolute inset-x-0 border-t border-line" style={{ top: `${(i / (ticks.length - 1)) * 100}%` }} aria-hidden />
          ))}
          <div
            className={cn("absolute inset-0 flex items-end", dense ? "gap-px" : "gap-[2px]")}
            role="img"
            aria-label={t(isMoney ? "insights.chart.ariaCollected" : "insights.chart.ariaBookings", { from: dayLabel(series[0].day, intl), to: dayLabel(series.at(-1)!.day, intl), total: fmt(total) })}
          >
            {series.map((p, i) => {
              const v = values[i];
              const h = v > 0 ? Math.max(2, (v / top) * 100) : 0;
              return (
                <div key={p.day} className="flex h-full min-w-0 flex-1 items-end justify-center" onMouseEnter={() => setActive(i)} onClick={() => setActive(i)}>
                  <div className={cn("w-full max-w-10 rounded-t-[3px] transition-colors", active === i ? "bg-ink" : "bg-accent", active != null && active !== i && "opacity-70")} style={{ height: `${h}%` }} />
                </div>
              );
            })}
          </div>
          {a && (
            <div
              className="pointer-events-none absolute -top-2 z-10 -translate-x-1/2 -translate-y-full whitespace-nowrap rounded-md border border-line bg-surface px-2.5 py-1.5 text-[12px] shadow-md"
              style={{ left: `${Math.min(88, Math.max(12, ((active! + 0.5) / series.length) * 100))}%` }}
            >
              <p className="font-medium text-ink">{dayLabel(a.day, intl, { weekday: "short", month: "short", day: "numeric" })}</p>
              <p className="text-ink-2 tabular">{t("insights.chart.tooltip", { count: a.bookings, amount: formatMoney(a.collected, currency, { intl }) })}</p>
            </div>
          )}
        </div>
        <div />
        <div className="relative mt-1.5 h-4 text-[11px] text-ink-3" aria-hidden>
          {labelIdx.map((i, k) => (
            <span
              key={k}
              className={cn("absolute top-0", k === 0 ? "start-0" : k === 2 ? "end-0" : "-translate-x-1/2")}
              style={k === 1 ? { left: `${((i + 0.5) / series.length) * 100}%` } : undefined}
            >
              {dayLabel(series[i].day, intl)}
            </span>
          ))}
        </div>
      </div>

      <details className="mt-4 group">
        <summary className="inline-flex h-9 cursor-pointer list-none items-center rounded-md text-[13px] font-medium text-ink-2 hover:text-ink">
          <span className="group-open:hidden">{t("insights.chart.showTable")}</span>
          <span className="hidden group-open:inline">{t("insights.chart.hideTable")}</span>
        </summary>
        <div className="relative mt-2 max-h-72 overflow-y-auto rounded-md border border-line">
          <table className="w-full text-sm">
            <caption className="sr-only">{t("insights.chart.tableCaption")}</caption>
            <thead className="sticky top-0 bg-surface">
              <tr className="border-b border-line text-start text-[12px] text-ink-3">
                <th scope="col" className="px-3 py-2 font-medium">
                  {t("insights.chart.day")}
                </th>
                <th scope="col" className="px-3 py-2 text-end font-medium">
                  {t("insights.kpi.bookings")}
                </th>
                <th scope="col" className="px-3 py-2 text-end font-medium">
                  {t("insights.kpi.collected")}
                </th>
              </tr>
            </thead>
            <tbody className="divide-y divide-line">
              {[...series].reverse().map((p) => (
                <tr key={p.day}>
                  <th scope="row" className="px-3 py-1.5 text-start font-normal text-ink-2">
                    {dayLabel(p.day, intl, { weekday: "short", month: "short", day: "numeric" })}
                  </th>
                  <td className="px-3 py-1.5 text-end text-ink tabular">{p.bookings.toLocaleString(intl)}</td>
                  <td className="px-3 py-1.5 text-end text-ink tabular">{formatMoney(p.collected, currency, { intl })}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </details>
    </div>
  );
}
