import { ArrowDownRight, ArrowUpRight, BarChart3 } from "lucide-react";
import type { Metadata } from "next";
import Link from "next/link";
import type { ReactNode } from "react";
import { DailyChart, RangeSwitcher } from "@/components/pro/insights-charts";
import { ButtonLink } from "@/components/ui/button";
import { EmptyState, PageHeader } from "@/components/ui/misc";
import { formatMoney } from "@/domain/money";
import { cn } from "@/lib/cn";
import { requestNow } from "@/server/clock";
import { proPage } from "@/server/pro-page";
import { ANALYTICS_RANGES, businessAnalytics, type AnalyticsRange } from "@/server/services/analytics";

export const metadata: Metadata = { title: "Insights" };

const WEEKDAYS = ["Mon", "Tue", "Wed", "Thu", "Fri", "Sat", "Sun"];
const WEEKDAYS_LONG = ["Monday", "Tuesday", "Wednesday", "Thursday", "Friday", "Saturday", "Sunday"];
const HEATMAP_MIN_BOOKINGS = 10;

const dayLabel = (d: string) => new Intl.DateTimeFormat("en-US", { month: "short", day: "numeric", timeZone: "UTC" }).format(new Date(`${d}T12:00:00Z`));
const pct = (v: number | null) => (v == null ? "—" : `${Math.round(v * 100)}%`);
const hourLabel = (h: number) => (h === 0 ? "12a" : h < 12 ? `${h}a` : h === 12 ? "12p" : `${h - 12}p`);

type Delta = { text: string; good: boolean | null } | null;

/** Relative change for counts/money, point change for rates. `higherIsBetter` decides the tone. */
function change(cur: number | null, prev: number | null, kind: "relative" | "points", higherIsBetter = true): Delta {
  if (cur == null || prev == null) return null;
  if (kind === "points") {
    const d = Math.round((cur - prev) * 100);
    if (d === 0) return { text: "No change", good: null };
    return { text: `${d > 0 ? "+" : "−"}${Math.abs(d)} pts`, good: d > 0 === higherIsBetter };
  }
  if (prev === 0) return null;
  const d = Math.round(((cur - prev) / Math.abs(prev)) * 100);
  if (d === 0) return { text: "No change", good: null };
  return { text: `${d > 0 ? "+" : "−"}${Math.abs(d)}%`, good: d > 0 === higherIsBetter };
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
              {delta.text.startsWith("+") ? <ArrowUpRight className="size-3.5" aria-hidden /> : delta.text.startsWith("−") ? <ArrowDownRight className="size-3.5" aria-hidden /> : null}
              {delta.text}
            </span>
          ) : (
            <span className="text-ink-2">—</span>
          )}
          <span>vs {prevLabel}</span>
        </dd>
      )}
      {detail && <dd className="mt-1.5 text-[12px] text-ink-3">{detail}</dd>}
    </div>
  );
}

export default async function InsightsPage({ searchParams }: PageProps<"/pro/insights">) {
  const { m } = await proPage("analytics.view");
  const sp = await searchParams;
  const days: AnalyticsRange = (ANALYTICS_RANGES as readonly number[]).includes(Number(sp.days)) ? (Number(sp.days) as AnalyticsRange) : 30;
  const a = await businessAnalytics(m, days, new Date(requestNow()));
  const c = a.current;
  const p = a.previous;
  const cur = m.currency;
  const money = (v: number) => formatMoney(v, cur, { compact: true });
  const vsLabel = `previous ${days} days`;
  const hasPrev = p.bookings + p.cancelled > 0 || p.collectedCents !== 0;
  const empty = c.bookings === 0 && c.cancelled === 0 && c.collectedCents === 0;

  const heatTotal = a.heat.reduce((s, h) => s + h.n, 0);
  const heatMax = Math.max(1, ...a.heat.map((h) => h.n));
  const hours = a.heat.length
    ? Array.from({ length: Math.max(17, ...a.heat.map((h) => h.hour)) - Math.min(9, ...a.heat.map((h) => h.hour)) + 1 }, (_, i) => Math.min(9, ...a.heat.map((h) => h.hour)) + i)
    : [];
  const cell = (dow: number, hour: number) => a.heat.find((h) => h.dow === dow && h.hour === hour)?.n ?? 0;
  const busiest = [...a.heat].sort((x, y) => y.n - x.n)[0];
  const byDow = WEEKDAYS.map((_, i) => a.heat.filter((h) => h.dow === i + 1).reduce((s, h) => s + h.n, 0));
  const topDow = byDow.indexOf(Math.max(...byDow));
  const showStaff = a.byStaff.length > 1;

  return (
    <div className="mx-auto max-w-6xl px-4 pb-16 pt-8 sm:px-6 lg:px-10 lg:pt-10">
      <PageHeader
        title="Insights"
        description={
          <>
            {dayLabel(a.window.firstDay)} – {dayLabel(a.window.lastDay)}, compared with the {days} days before.
            {a.scopedToSelf && " Showing your own appointments only."}
          </>
        }
        actions={<RangeSwitcher days={days} />}
      />

      {empty ? (
        <div className="mt-8 rounded-lg border border-dashed border-line-strong">
          <EmptyState
            icon={<BarChart3 />}
            title={`No bookings in the last ${days} days`}
            description={
              p.bookings > 0
                ? `You had ${p.bookings} ${p.bookings === 1 ? "booking" : "bookings"} in the ${days} days before. Numbers appear here as soon as new appointments come in.`
                : "Numbers appear here as soon as appointments come in — bookings, money collected, no-shows and your busiest times."
            }
            action={
              days < 90 ? (
                <ButtonLink href="/pro/insights?days=90" variant="secondary">
                  Look at the last 90 days
                </ButtonLink>
              ) : m.businessStatus === "active" ? (
                <ButtonLink href="/pro/promote" variant="secondary">
                  Get found with Spotlight
                </ButtonLink>
              ) : undefined
            }
          />
        </div>
      ) : (
        <>
          <section aria-labelledby="kpi-h" className="mt-8">
            <h2 id="kpi-h" className="sr-only">
              Key numbers
            </h2>
            <dl className="grid grid-cols-2 gap-px overflow-hidden rounded-lg border border-line bg-line lg:grid-cols-3">
              <Kpi
                label="Collected"
                value={money(c.collectedCents)}
                delta={change(c.collectedCents, p.collectedCents, "relative")}
                prevLabel={vsLabel}
                compare={hasPrev}
                detail={c.collectedCents === 0 && c.completed > 0 ? "No payments recorded yet — record in-person payments on each appointment." : undefined}
              />
              <Kpi
                label="Bookings"
                value={String(c.bookings)}
                delta={change(c.bookings, p.bookings, "relative")}
                prevLabel={vsLabel}
                compare={hasPrev}
                detail={c.cancelled > 0 ? `${c.cancelled} more cancelled or declined` : undefined}
              />
              <Kpi
                label="Average ticket"
                value={c.avgTicketCents != null ? money(c.avgTicketCents) : "—"}
                delta={change(c.avgTicketCents, p.avgTicketCents, "relative")}
                prevLabel={vsLabel}
                compare={hasPrev}
                detail={c.completed > 0 ? `Across ${c.completed} completed ${c.completed === 1 ? "visit" : "visits"}` : undefined}
              />
              <Kpi
                label="Completion rate"
                value={pct(c.completionRate)}
                delta={change(c.completionRate, p.completionRate, "points")}
                prevLabel={vsLabel}
                compare={hasPrev}
                detail={c.due ? `${c.completed} of ${c.due} past appointments` : "No past appointments yet"}
              />
              <Kpi
                label="No-show rate"
                value={pct(c.noShowRate)}
                delta={change(c.noShowRate, p.noShowRate, "points", false)}
                prevLabel={vsLabel}
                compare={hasPrev}
                detail={c.noShows ? `${c.noShows} no-${c.noShows === 1 ? "show" : "shows"}` : undefined}
              />
              <Kpi
                label="Clients"
                value={String(c.clients)}
                delta={change(c.clients, p.clients, "relative")}
                prevLabel={vsLabel}
                compare={hasPrev}
                detail={c.clients ? `${c.newClients} new · ${c.returningClients} returning` : undefined}
              />
            </dl>
            {!hasPrev && <p className="mt-3 text-[13px] text-ink-3">No activity in the {days} days before this period, so there&apos;s nothing to compare with yet.</p>}
            {c.unresolved > 0 && (
              <p className="mt-3 text-[13px] text-warn">
                {c.unresolved} past {c.unresolved === 1 ? "appointment hasn't" : "appointments haven't"} been marked completed or no-show, so {c.unresolved === 1 ? "it counts" : "they count"} against
                your completion rate.{" "}
                <Link href="/pro/calendar?view=agenda" className="font-medium underline underline-offset-2">
                  Review in calendar
                </Link>
              </p>
            )}
          </section>

          <section aria-labelledby="daily-h" className="mt-10 rounded-lg border border-line bg-surface p-4 sm:p-5">
            <h2 id="daily-h" className="mb-3 text-[15px] font-semibold text-ink">
              Day by day
            </h2>
            <DailyChart series={a.series} currency={cur} />
          </section>

          <div className="mt-10 grid gap-10 lg:grid-cols-2">
            <section aria-labelledby="svc-h" className="min-w-0">
              <h2 id="svc-h" className="mb-3 text-[15px] font-semibold text-ink">
                Top services
              </h2>
              {a.byService.length === 0 ? (
                <p className="text-sm text-ink-3">No bookings in this period.</p>
              ) : (
                <table className="w-full text-sm">
                  <caption className="sr-only">Services by number of bookings</caption>
                  <thead>
                    <tr className="border-b border-line text-start text-[12px] text-ink-3">
                      <th scope="col" className="py-2 pe-3 font-medium">
                        Service
                      </th>
                      <th scope="col" className="w-20 px-3 py-2 text-end font-medium">
                        Booked
                      </th>
                      <th scope="col" className="hidden w-20 px-3 py-2 text-end font-medium sm:table-cell">
                        Done
                      </th>
                      <th scope="col" className="py-2 ps-3 text-end font-medium">
                        Earned
                      </th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-line">
                    {a.byService.map((s) => (
                      <tr key={s.name}>
                        <th scope="row" className="py-2.5 pe-3 text-start font-normal text-ink">
                          {s.name}
                        </th>
                        <td className="px-3 py-2.5 text-end text-ink tabular">{s.bookings}</td>
                        <td className="hidden px-3 py-2.5 text-end text-ink-2 tabular sm:table-cell">{s.completed}</td>
                        <td className="py-2.5 ps-3 text-end text-ink tabular">{money(s.earned)}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              )}
            </section>

            <section aria-labelledby="heat-h" className="min-w-0">
              <h2 id="heat-h" className="mb-1 text-[15px] font-semibold text-ink">
                Busiest times
              </h2>
              {heatTotal < HEATMAP_MIN_BOOKINGS ? (
                <p className="mt-2 text-sm text-ink-3">
                  Not enough bookings yet to show a pattern — this fills in after {HEATMAP_MIN_BOOKINGS} bookings in the selected period ({heatTotal} so far).
                  {days < 90 && (
                    <>
                      {" "}
                      <Link href="/pro/insights?days=90" className="font-medium text-ink-2 underline underline-offset-2">
                        Try 90 days
                      </Link>
                    </>
                  )}
                </p>
              ) : (
                <>
                  <p className="mb-3 text-[13px] text-ink-3">
                    Most bookings on {WEEKDAYS_LONG[topDow]}s; the busiest slot is {WEEKDAYS_LONG[busiest.dow - 1]} at {hourLabel(busiest.hour)}m. Times in your business time zone.
                  </p>
                  <div className="relative overflow-x-auto">
                    <table className="border-separate border-spacing-[2px] text-[11px]">
                      <caption className="sr-only">Bookings by weekday and starting hour</caption>
                      <thead>
                        <tr>
                          <td />
                          {hours.map((h) => (
                            <th key={h} scope="col" className="w-6 min-w-6 pb-1 text-center font-normal text-ink-3">
                              {h % 3 === 0 ? hourLabel(h) : <span className="sr-only">{hourLabel(h)}</span>}
                            </th>
                          ))}
                        </tr>
                      </thead>
                      <tbody>
                        {WEEKDAYS.map((w, i) => (
                          <tr key={w}>
                            <th scope="row" className="pe-2 text-start font-normal text-ink-3">
                              {w}
                            </th>
                            {hours.map((h) => {
                              const n = cell(i + 1, h);
                              return (
                                <td key={h} className="relative h-6 w-6 min-w-6 rounded-[3px] bg-surface-2" title={`${w} ${hourLabel(h)}m: ${n} ${n === 1 ? "booking" : "bookings"}`}>
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
                    Fewer
                    {[0.2, 0.47, 0.73, 1].map((o) => (
                      <span key={o} className="size-3 rounded-[2px] bg-accent" style={{ opacity: o }} />
                    ))}
                    More
                  </div>
                </>
              )}
            </section>
          </div>

          {showStaff && (
            <section aria-labelledby="staff-h" className="mt-10">
              <h2 id="staff-h" className="mb-3 text-[15px] font-semibold text-ink">
                Team
              </h2>
              <div className="relative overflow-x-auto">
                <table className="w-full min-w-[520px] text-sm">
                  <caption className="sr-only">Bookings and earnings by team member</caption>
                  <thead>
                    <tr className="border-b border-line text-start text-[12px] text-ink-3">
                      <th scope="col" className="py-2 pe-3 font-medium">
                        Name
                      </th>
                      <th scope="col" className="px-3 py-2 text-end font-medium">
                        Booked
                      </th>
                      <th scope="col" className="px-3 py-2 text-end font-medium">
                        Hours
                      </th>
                      <th scope="col" className="px-3 py-2 text-end font-medium">
                        Completed
                      </th>
                      <th scope="col" className="px-3 py-2 text-end font-medium">
                        No-shows
                      </th>
                      <th scope="col" className="py-2 ps-3 text-end font-medium">
                        Earned
                      </th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-line">
                    {a.byStaff.map((s) => (
                      <tr key={s.id}>
                        <th scope="row" className="py-2.5 pe-3 text-start font-normal text-ink">
                          {s.name}
                        </th>
                        <td className="px-3 py-2.5 text-end text-ink tabular">{s.bookings}</td>
                        <td className="px-3 py-2.5 text-end text-ink-2 tabular">{(s.bookedMinutes / 60).toFixed(s.bookedMinutes % 60 ? 1 : 0)}</td>
                        <td className="px-3 py-2.5 text-end text-ink-2 tabular">
                          {s.completed}
                          {s.due > 0 && <span className="text-ink-3"> / {s.due}</span>}
                        </td>
                        <td className={cn("px-3 py-2.5 text-end tabular", s.noShows ? "text-ink" : "text-ink-3")}>{s.noShows}</td>
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
              How these are counted
            </h2>
            <ul className="grid gap-1 sm:grid-cols-2 sm:gap-x-8">
              <li>
                <span className="text-ink-2">Collected</span> — payments taken online or recorded in person, minus refunds, on the day they were paid. Before Kept and card fees.
              </li>
              <li>
                <span className="text-ink-2">Bookings</span> — appointments taking place in the period (including later today), excluding cancellations and expired holds.
              </li>
              <li>
                <span className="text-ink-2">Average ticket &amp; earned</span> — value of completed visits after discounts, before tax.
              </li>
              <li>
                <span className="text-ink-2">Completion &amp; no-show rate</span> — share of appointments that have already ended.
              </li>
              <li>
                <span className="text-ink-2">Returning clients</span> — had a completed visit with you before this period.
              </li>
            </ul>
          </section>
        </>
      )}
    </div>
  );
}
