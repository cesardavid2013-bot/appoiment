import { ArrowDownRight, ArrowUpRight, BarChart3 } from "lucide-react";
import type { Metadata } from "next";
import Link from "next/link";
import type { ReactNode } from "react";
import { DailyChart, RangeSwitcher } from "@/components/pro/insights-charts";
import { ButtonLink } from "@/components/ui/button";
import { EmptyState, PageHeader } from "@/components/ui/misc";
import { formatMoney } from "@/domain/money";
import { rich } from "@/i18n/rich";
import { getI18n, getT } from "@/i18n/server";
import type { TFunction } from "@/i18n/translate";
import { cn } from "@/lib/cn";
import { requestNow } from "@/server/clock";
import { proPage } from "@/server/pro-page";
import { ANALYTICS_RANGES, businessAnalytics, type AnalyticsRange } from "@/server/services/analytics";

export async function generateMetadata(): Promise<Metadata> {
  const t = await getT("pro");
  return { title: t("nav.insights") };
}

/** ISO weekdays 1 (Monday) … 7 (Sunday). */
const WEEKDAYS = [1, 2, 3, 4, 5, 6, 7];
const HEATMAP_MIN_BOOKINGS = 10;

const weekday = (wd: number, intl: string, style: "short" | "long") => new Intl.DateTimeFormat(intl, { weekday: style, timeZone: "UTC" }).format(new Date(Date.UTC(2024, 0, wd)));
const dayLabel = (d: string, intl: string) => new Intl.DateTimeFormat(intl, { month: "short", day: "numeric", timeZone: "UTC" }).format(new Date(`${d}T12:00:00Z`));
const pct = (v: number | null, intl: string) => (v == null ? "—" : new Intl.NumberFormat(intl, { style: "percent", maximumFractionDigits: 0 }).format(v));
/** Compact hour for the heatmap axis: "9a"/"3p" in English, the 24-hour clock elsewhere. */
const hourLabel = (h: number, intl: string) =>
  intl.startsWith("en") ? (h === 0 ? "12a" : h < 12 ? `${h}a` : h === 12 ? "12p" : `${h - 12}p`) : new Intl.DateTimeFormat(intl, { hour: "numeric", hourCycle: "h23", timeZone: "UTC" }).format(new Date(Date.UTC(2024, 0, 1, h)));
/** Full hour for sentences: "3:00 PM", "15:00". */
const hourFull = (h: number, intl: string) => new Intl.DateTimeFormat(intl, { hour: "numeric", minute: "2-digit", timeZone: "UTC" }).format(new Date(Date.UTC(2024, 0, 1, h)));

type Delta = { text: string; dir: 1 | -1 | 0; good: boolean | null } | null;

/** Relative change for counts/money, point change for rates. `higherIsBetter` decides the tone. */
function change(t: TFunction, intl: string, cur: number | null, prev: number | null, kind: "relative" | "points", higherIsBetter = true): Delta {
  if (cur == null || prev == null) return null;
  if (kind === "points") {
    const d = Math.round((cur - prev) * 100);
    if (d === 0) return { text: t("insights.noChange"), dir: 0, good: null };
    return { text: t(d > 0 ? "insights.pointsUp" : "insights.pointsDown", { count: Math.abs(d) }), dir: d > 0 ? 1 : -1, good: d > 0 === higherIsBetter };
  }
  if (prev === 0) return null;
  const d = Math.round(((cur - prev) / Math.abs(prev)) * 100);
  if (d === 0) return { text: t("insights.noChange"), dir: 0, good: null };
  const abs = new Intl.NumberFormat(intl, { style: "percent", maximumFractionDigits: 0 }).format(Math.abs(d) / 100);
  return { text: `${d > 0 ? "+" : "−"}${abs}`, dir: d > 0 ? 1 : -1, good: d > 0 === higherIsBetter };
}

function Kpi({ label, value, delta, detail, prevLabel, compare }: { label: string; value: string; delta: Delta; detail?: ReactNode; prevLabel: string; compare: boolean }) {
  return (
    <div className="bg-surface p-4">
      <dt className="text-[13px] text-ink-3">{label}</dt>
      <dd className="mt-1 text-2xl font-semibold tracking-[-0.01em] text-ink tabular">{value}</dd>
      {compare && (
        <dd className="mt-1 flex flex-wrap items-center gap-x-1.5 text-[12px] text-ink-3">
          {delta ? (
            <span className={cn("inline-flex items-center gap-0.5 font-medium tabular", delta.good === true ? "text-accent-text" : delta.good === false ? "text-danger" : "text-ink-2")}>
              {delta.dir > 0 ? <ArrowUpRight className="size-3.5" aria-hidden /> : delta.dir < 0 ? <ArrowDownRight className="size-3.5" aria-hidden /> : null}
              {delta.text}
            </span>
          ) : (
            <span className="text-ink-2">—</span>
          )}
          <span>{prevLabel}</span>
        </dd>
      )}
      {detail && <dd className="mt-1.5 text-[12px] text-ink-3">{detail}</dd>}
    </div>
  );
}

export default async function InsightsPage({ searchParams }: PageProps<"/pro/insights">) {
  const { m } = await proPage("analytics.view");
  const [t, { intl }] = await Promise.all([getT("pro"), getI18n()]);
  const num = (v: number) => v.toLocaleString(intl);
  const sp = await searchParams;
  const days: AnalyticsRange = (ANALYTICS_RANGES as readonly number[]).includes(Number(sp.days)) ? (Number(sp.days) as AnalyticsRange) : 30;
  const a = await businessAnalytics(m, days, new Date(requestNow()));
  const c = a.current;
  const p = a.previous;
  const cur = m.currency;
  const money = (v: number) => formatMoney(v, cur, { compact: true, intl });
  const vsLabel = t("insights.vsPrevious", { count: days });
  const hasPrev = p.bookings + p.cancelled > 0 || p.collectedCents !== 0;
  const empty = c.bookings === 0 && c.cancelled === 0 && c.collectedCents === 0;

  const heatTotal = a.heat.reduce((s, h) => s + h.n, 0);
  const heatMax = Math.max(1, ...a.heat.map((h) => h.n));
  const hours = a.heat.length
    ? Array.from({ length: Math.max(17, ...a.heat.map((h) => h.hour)) - Math.min(9, ...a.heat.map((h) => h.hour)) + 1 }, (_, i) => Math.min(9, ...a.heat.map((h) => h.hour)) + i)
    : [];
  const cell = (dow: number, hour: number) => a.heat.find((h) => h.dow === dow && h.hour === hour)?.n ?? 0;
  const busiest = [...a.heat].sort((x, y) => y.n - x.n)[0];
  const byDow = WEEKDAYS.map((wd) => a.heat.filter((h) => h.dow === wd).reduce((s, h) => s + h.n, 0));
  const topDow = byDow.indexOf(Math.max(...byDow));
  const showStaff = a.byStaff.length > 1;

  return (
    <div className="mx-auto max-w-6xl px-4 pb-16 pt-8 sm:px-6 lg:px-10 lg:pt-10">
      <PageHeader
        title={t("nav.insights")}
        description={
          <>
            {t("insights.period", { from: dayLabel(a.window.firstDay, intl), to: dayLabel(a.window.lastDay, intl), count: days })}
            {a.scopedToSelf && ` ${t("insights.ownOnly")}`}
          </>
        }
        actions={<RangeSwitcher days={days} />}
      />

      {empty ? (
        <div className="mt-8 rounded-lg border border-dashed border-line-strong">
          <EmptyState
            icon={<BarChart3 />}
            title={t("insights.emptyTitle", { count: days })}
            description={p.bookings > 0 ? t("insights.emptyPrev", { count: p.bookings, days }) : t("insights.emptyBody")}
            action={
              days < 90 ? (
                <ButtonLink href="/pro/insights?days=90" variant="secondary">
                  {t("insights.last90")}
                </ButtonLink>
              ) : m.businessStatus === "active" ? (
                <ButtonLink href="/pro/promote" variant="secondary">
                  {t("insights.spotlight")}
                </ButtonLink>
              ) : undefined
            }
          />
        </div>
      ) : (
        <>
          <section aria-labelledby="kpi-h" className="mt-8">
            <h2 id="kpi-h" className="sr-only">
              {t("insights.keyNumbers")}
            </h2>
            <dl className="grid grid-cols-2 gap-px overflow-hidden rounded-lg border border-line bg-line lg:grid-cols-3">
              <Kpi
                label={t("insights.kpi.collected")}
                value={money(c.collectedCents)}
                delta={change(t, intl, c.collectedCents, p.collectedCents, "relative")}
                prevLabel={vsLabel}
                compare={hasPrev}
                detail={c.collectedCents === 0 && c.completed > 0 ? t("insights.kpi.noPayments") : undefined}
              />
              <Kpi
                label={t("insights.kpi.bookings")}
                value={num(c.bookings)}
                delta={change(t, intl, c.bookings, p.bookings, "relative")}
                prevLabel={vsLabel}
                compare={hasPrev}
                detail={c.cancelled > 0 ? t("insights.kpi.cancelled", { count: c.cancelled }) : undefined}
              />
              <Kpi
                label={t("insights.kpi.avgTicket")}
                value={c.avgTicketCents != null ? money(c.avgTicketCents) : "—"}
                delta={change(t, intl, c.avgTicketCents, p.avgTicketCents, "relative")}
                prevLabel={vsLabel}
                compare={hasPrev}
                detail={c.completed > 0 ? t("insights.kpi.across", { count: c.completed }) : undefined}
              />
              <Kpi
                label={t("insights.kpi.completionRate")}
                value={pct(c.completionRate, intl)}
                delta={change(t, intl, c.completionRate, p.completionRate, "points")}
                prevLabel={vsLabel}
                compare={hasPrev}
                detail={c.due ? t("insights.kpi.completedOf", { completed: num(c.completed), count: c.due }) : t("insights.kpi.noPast")}
              />
              <Kpi
                label={t("insights.kpi.noShowRate")}
                value={pct(c.noShowRate, intl)}
                delta={change(t, intl, c.noShowRate, p.noShowRate, "points", false)}
                prevLabel={vsLabel}
                compare={hasPrev}
                detail={c.noShows ? t("clients.noShowCount", { count: c.noShows }) : undefined}
              />
              <Kpi
                label={t("nav.clients")}
                value={num(c.clients)}
                delta={change(t, intl, c.clients, p.clients, "relative")}
                prevLabel={vsLabel}
                compare={hasPrev}
                detail={c.clients ? t("insights.kpi.newReturning", { new: num(c.newClients), returning: num(c.returningClients) }) : undefined}
              />
            </dl>
            {!hasPrev && <p className="mt-3 text-[13px] text-ink-3">{t("insights.noCompare", { count: days })}</p>}
            {c.unresolved > 0 && (
              <p className="mt-3 text-[13px] text-warn">
                {rich(t("insights.unresolved", { count: c.unresolved }), {
                  link: (ch) => (
                    <Link href="/pro/calendar?view=agenda" className="font-medium underline underline-offset-2">
                      {ch}
                    </Link>
                  ),
                })}
              </p>
            )}
          </section>

          <section aria-labelledby="daily-h" className="mt-10 rounded-lg border border-line bg-surface p-4 sm:p-5">
            <h2 id="daily-h" className="mb-3 text-[15px] font-semibold text-ink">
              {t("insights.daily")}
            </h2>
            <DailyChart series={a.series} currency={cur} />
          </section>

          <div className="mt-10 grid gap-10 lg:grid-cols-2">
            <section aria-labelledby="svc-h" className="min-w-0">
              <h2 id="svc-h" className="mb-3 text-[15px] font-semibold text-ink">
                {t("insights.topServices")}
              </h2>
              {a.byService.length === 0 ? (
                <p className="text-sm text-ink-3">{t("insights.noBookingsPeriod")}</p>
              ) : (
                <table className="w-full text-sm">
                  <caption className="sr-only">{t("insights.servicesCaption")}</caption>
                  <thead>
                    <tr className="border-b border-line text-start text-[12px] text-ink-3">
                      <th scope="col" className="py-2 pe-3 font-medium">
                        {t("insights.cols.service")}
                      </th>
                      <th scope="col" className="w-20 px-3 py-2 text-end font-medium">
                        {t("insights.cols.booked")}
                      </th>
                      <th scope="col" className="hidden w-20 px-3 py-2 text-end font-medium sm:table-cell">
                        {t("insights.cols.done")}
                      </th>
                      <th scope="col" className="py-2 ps-3 text-end font-medium">
                        {t("insights.cols.earned")}
                      </th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-line">
                    {a.byService.map((s) => (
                      <tr key={s.name}>
                        <th scope="row" className="py-2.5 pe-3 text-start font-normal text-ink">
                          {s.name}
                        </th>
                        <td className="px-3 py-2.5 text-end text-ink tabular">{num(s.bookings)}</td>
                        <td className="hidden px-3 py-2.5 text-end text-ink-2 tabular sm:table-cell">{num(s.completed)}</td>
                        <td className="py-2.5 ps-3 text-end text-ink tabular">{money(s.earned)}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              )}
            </section>

            <section aria-labelledby="heat-h" className="min-w-0">
              <h2 id="heat-h" className="mb-1 text-[15px] font-semibold text-ink">
                {t("insights.busiest")}
              </h2>
              {heatTotal < HEATMAP_MIN_BOOKINGS ? (
                <p className="mt-2 text-sm text-ink-3">
                  {t("insights.notEnough", { min: HEATMAP_MIN_BOOKINGS, count: heatTotal })}
                  {days < 90 && (
                    <>
                      {" "}
                      <Link href="/pro/insights?days=90" className="font-medium text-ink-2 underline underline-offset-2">
                        {t("insights.try90")}
                      </Link>
                    </>
                  )}
                </p>
              ) : (
                <>
                  <p className="mb-3 text-[13px] text-ink-3">
                    {t("insights.pattern", { day: weekday(WEEKDAYS[topDow], intl, "long"), slotDay: weekday(busiest.dow, intl, "long"), time: hourFull(busiest.hour, intl) })}
                  </p>
                  <div className="relative overflow-x-auto">
                    <table className="border-separate border-spacing-[2px] text-[11px]">
                      <caption className="sr-only">{t("insights.heatCaption")}</caption>
                      <thead>
                        <tr>
                          <td />
                          {hours.map((h) => (
                            <th key={h} scope="col" className="w-6 min-w-6 pb-1 text-center font-normal text-ink-3">
                              {h % 3 === 0 ? hourLabel(h, intl) : <span className="sr-only">{hourLabel(h, intl)}</span>}
                            </th>
                          ))}
                        </tr>
                      </thead>
                      <tbody>
                        {WEEKDAYS.map((wd) => (
                          <tr key={wd}>
                            <th scope="row" className="pe-2 text-start font-normal text-ink-3">
                              {weekday(wd, intl, "short")}
                            </th>
                            {hours.map((h) => {
                              const n = cell(wd, h);
                              return (
                                <td key={h} className="relative h-6 w-6 min-w-6 rounded-[3px] bg-surface-2" title={t("insights.cellTitle", { day: weekday(wd, intl, "short"), time: hourFull(h, intl), count: n })}>
                                  {n > 0 && <span className="absolute inset-0 rounded-[3px] bg-accent" style={{ opacity: 0.2 + 0.8 * (n / heatMax) }} aria-hidden />}
                                  <span className="sr-only">{n}</span>
                                </td>
                              );
                            })}
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>
                  <div className="mt-2 flex items-center gap-1.5 text-[11px] text-ink-3" aria-hidden>
                    {t("insights.fewer")}
                    {[0.2, 0.47, 0.73, 1].map((o) => (
                      <span key={o} className="size-3 rounded-[2px] bg-accent" style={{ opacity: o }} />
                    ))}
                    {t("insights.more")}
                  </div>
                </>
              )}
            </section>
          </div>

          {showStaff && (
            <section aria-labelledby="staff-h" className="mt-10">
              <h2 id="staff-h" className="mb-3 text-[15px] font-semibold text-ink">
                {t("nav.team")}
              </h2>
              <div className="relative overflow-x-auto">
                <table className="w-full min-w-[520px] text-sm">
                  <caption className="sr-only">{t("insights.staffCaption")}</caption>
                  <thead>
                    <tr className="border-b border-line text-start text-[12px] text-ink-3">
                      <th scope="col" className="py-2 pe-3 font-medium">
                        {t("insights.cols.name")}
                      </th>
                      <th scope="col" className="px-3 py-2 text-end font-medium">
                        {t("insights.cols.booked")}
                      </th>
                      <th scope="col" className="px-3 py-2 text-end font-medium">
                        {t("insights.cols.hours")}
                      </th>
                      <th scope="col" className="px-3 py-2 text-end font-medium">
                        {t("insights.cols.completed")}
                      </th>
                      <th scope="col" className="px-3 py-2 text-end font-medium">
                        {t("clients.columns.noShows")}
                      </th>
                      <th scope="col" className="py-2 ps-3 text-end font-medium">
                        {t("insights.cols.earned")}
                      </th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-line">
                    {a.byStaff.map((s) => (
                      <tr key={s.id}>
                        <th scope="row" className="py-2.5 pe-3 text-start font-normal text-ink">
                          {s.name}
                        </th>
                        <td className="px-3 py-2.5 text-end text-ink tabular">{num(s.bookings)}</td>
                        <td className="px-3 py-2.5 text-end text-ink-2 tabular">{(s.bookedMinutes / 60).toLocaleString(intl, { minimumFractionDigits: s.bookedMinutes % 60 ? 1 : 0, maximumFractionDigits: s.bookedMinutes % 60 ? 1 : 0 })}</td>
                        <td className="px-3 py-2.5 text-end text-ink-2 tabular">
                          {num(s.completed)}
                          {s.due > 0 && <span className="text-ink-3"> / {num(s.due)}</span>}
                        </td>
                        <td className={cn("px-3 py-2.5 text-end tabular", s.noShows ? "text-ink" : "text-ink-3")}>{num(s.noShows)}</td>
                        <td className="py-2.5 ps-3 text-end text-ink tabular">{money(s.earnedCents)}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </section>
          )}

          <section aria-labelledby="defs-h" className="mt-12 border-t border-line pt-5 text-[12px] leading-relaxed text-ink-3">
            <h2 id="defs-h" className="mb-1.5 font-medium text-ink-2">
              {t("insights.defs.title")}
            </h2>
            <ul className="grid gap-1 sm:grid-cols-2 sm:gap-x-8">
              {(["collected", "bookings", "ticket", "rates", "returning"] as const).map((k) => (
                <li key={k}>{rich(t(`insights.defs.${k}`), { term: (ch) => <span className="text-ink-2">{ch}</span> })}</li>
              ))}
            </ul>
          </section>
        </>
      )}
    </div>
  );
}
