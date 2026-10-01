import { ArrowRight, CalendarDays } from "lucide-react";
import type { Metadata } from "next";
import Link from "next/link";
import { AppointmentControls } from "@/components/pro/appointment-controls";
import { DayList } from "@/components/pro/day-list";
import { ShareLink } from "@/components/pro/share-link";
import { TodayActions } from "@/components/pro/today-actions";
import { formatDuration, formatMoney } from "@/domain/money";
import { addDaysIso, localMinuteToInstant, todayIn } from "@/domain/time";
import { fmtDateLong, fmtTime } from "@/lib/format";
import { env } from "@/server/env";
import { launchChecklist } from "@/server/services/business";
import { servicesForCalendar, todayOverview } from "@/server/services/pro";
import { proPage } from "@/server/pro-page";
import { requestNow } from "@/server/clock";

export const metadata: Metadata = { title: "Today" };

function greeting(tz: string) {
  const h = Number(new Intl.DateTimeFormat("en-US", { hour: "numeric", hourCycle: "h23", timeZone: tz }).format(new Date()));
  return h < 12 ? "Good morning" : h < 18 ? "Good afternoon" : "Good evening";
}

export default async function TodayPage() {
  const { viewer, m } = await proPage();
  const tz = m.timezone;
  const today = todayIn(tz);
  const dayStart = new Date(localMinuteToInstant(today, 0, tz)!);
  const dayEnd = new Date(localMinuteToInstant(addDaysIso(today, 1), 0, tz)!);
  const [data, services, checklist] = await Promise.all([todayOverview(m, dayStart, dayEnd), servicesForCalendar(m.businessId), m.businessStatus !== "active" ? launchChecklist(m.businessId) : Promise.resolve(null)]);

  const items = data.appointments.filter((a) => a.status !== "pending_payment");
  const now = requestNow();
  const next = items.find((a) => new Date(a.endsAt).getTime() > now && ["confirmed", "checked_in", "in_progress"].includes(a.status));
  const remaining = items.filter((a) => new Date(a.startsAt).getTime() > now && a.status === "confirmed").length;
  const canManage = m.permissions.has("appointments.manage_all") || m.permissions.has("appointments.manage_own");
  const memberNames = data.team.length > 1 ? new Map(data.team.map((t) => [t.id, t.name])) : undefined;
  const shareUrl = `${env.APP_URL}/${m.businessSlug}`;

  return (
    <div className="mx-auto max-w-6xl px-4 pb-16 pt-8 sm:px-6 lg:px-10 lg:pt-10">
      <div className="flex flex-col gap-5 sm:flex-row sm:items-end sm:justify-between">
        <div>
          <p className="text-sm font-medium text-ink-3">{fmtDateLong(new Date(), tz)}</p>
          <h1 className="mt-1 font-display text-[36px] leading-[1.05] tracking-[-0.01em] text-ink sm:text-[42px]">
            {greeting(tz)}, {viewer.name.split(" ")[0]}
          </h1>
          <p className="mt-2 text-[15px] text-ink-3">
            {items.length === 0 ? "Nothing booked today." : remaining > 0 ? `${remaining} more ${remaining === 1 ? "appointment" : "appointments"} today.` : "That's everything for today."}
            {data.requests.length > 0 && ` ${data.requests.length} ${data.requests.length === 1 ? "request needs" : "requests need"} a reply.`}
          </p>
        </div>
        <div className="flex flex-wrap gap-2">
          <TodayActions
            services={services.filter((s) => s.status === "active")}
            team={data.team.map((t) => ({ id: t.id, name: t.name }))}
            timezone={tz}
            canAll={m.permissions.has("appointments.manage_all")}
            canBook={canManage}
            canBlock={m.permissions.has("schedule.manage_own") || m.permissions.has("schedule.manage_all")}
            selfMemberId={m.memberId}
          />
        </div>
      </div>

      {checklist && (
        <section className="mt-8 rounded-xl border border-line bg-surface p-5 sm:flex sm:items-center sm:justify-between sm:gap-6">
          <div>
            <p className="text-[15px] font-semibold text-ink">{checklist.ready ? "Your page is ready to go live" : "Finish setting up to take bookings"}</p>
            <p className="mt-1 text-sm text-ink-3">
              {checklist.items.filter((i) => i.done).length} of {checklist.items.length} done
              {!checklist.ready && ` — next: ${checklist.items.find((i) => !i.done)?.label.toLowerCase()}`}
            </p>
            <div className="mt-3 flex gap-1" aria-hidden>
              {checklist.items.map((i) => (
                <span key={i.key} className={`h-1 w-10 rounded-full ${i.done ? "bg-accent" : "bg-line-strong"}`} />
              ))}
            </div>
          </div>
          <Link href="/pro/onboarding" className="mt-4 inline-flex h-10 items-center gap-1.5 rounded-md bg-ink px-4 text-sm font-medium text-bg sm:mt-0">
            {checklist.ready ? "Go live" : "Continue setup"} <ArrowRight className="size-4" />
          </Link>
        </section>
      )}

      <div className="mt-10 grid gap-10 lg:grid-cols-[minmax(0,1fr)_320px]">
        <div className="min-w-0 space-y-10">
          {next && (
            <section aria-labelledby="next-h" className="rounded-xl bg-ink p-5 text-bg sm:p-6">
              <p id="next-h" className="text-[13px] font-medium text-bg/60">
                {new Date(next.startsAt).getTime() <= now ? "Happening now" : "Next up"}
              </p>
              <div className="mt-3 flex flex-col gap-5 sm:flex-row sm:items-end sm:justify-between">
                <Link href={`/pro/appointments/${next.id}`} className="min-w-0">
                  <p className="font-display text-[44px] leading-none tabular">{fmtTime(next.startsAt, tz)}</p>
                  <p className="mt-3 truncate text-lg font-semibold">{next.customerName}</p>
                  <p className="truncate text-sm text-bg/70">
                    {next.serviceName} · {formatDuration(Math.round((new Date(next.endsAt).getTime() - new Date(next.startsAt).getTime()) / 60_000))}
                  </p>
                </Link>
                {canManage && (
                  <AppointmentControls a={next} size="md" inverse />
                )}
              </div>
            </section>
          )}

          <section aria-labelledby="schedule-h">
            <div className="mb-2 flex items-end justify-between">
              <h2 id="schedule-h" className="text-lg font-semibold tracking-[-0.01em] text-ink">
                Schedule
              </h2>
              <Link href="/pro/calendar" className="inline-flex items-center gap-1 text-sm font-medium text-ink-2 hover:text-ink">
                Calendar <ArrowRight className="size-4" />
              </Link>
            </div>
            {items.length === 0 ? (
              <div className="rounded-xl border border-dashed border-line-strong px-6 py-12 text-center">
                <CalendarDays className="mx-auto size-6 text-ink-3" />
                <p className="mt-3 font-medium text-ink">No appointments today</p>
                <p className="mt-1 text-sm text-ink-3">{m.businessStatus === "active" ? "Share your link — new bookings show up here instantly." : "Once you're live, bookings show up here instantly."}</p>
              </div>
            ) : (
              <DayList now={now} items={items} timezone={tz} memberNames={memberNames} canManage={canManage} />
            )}
          </section>
        </div>

        <aside className="space-y-8">
          {data.requests.length > 0 && (
            <section aria-labelledby="req-h">
              <h2 id="req-h" className="mb-3 text-[15px] font-semibold text-ink">
                Waiting for you
              </h2>
              <ul className="space-y-3">
                {data.requests.map((r) => (
                  <li key={r.id} className="rounded-lg border border-line bg-surface p-4">
                    <Link href={`/pro/appointments/${r.id}`} className="block">
                      <p className="text-[15px] font-semibold text-ink">{r.customerName}</p>
                      <p className="text-[13px] text-ink-3">
                        {r.serviceName} · {fmtDateLong(r.startsAt, tz).split(",").slice(0, 2).join(",")} {fmtTime(r.startsAt, tz)}
                      </p>
                    </Link>
                    {canManage && (
                      <div className="mt-3">
                        <AppointmentControls a={r} />
                      </div>
                    )}
                  </li>
                ))}
              </ul>
            </section>
          )}

          {m.permissions.has("analytics.view") && (
            <section aria-labelledby="month-h">
              <div className="mb-3 flex items-end justify-between">
                <h2 id="month-h" className="text-[15px] font-semibold text-ink">
                  Last 30 days
                </h2>
                <Link href="/pro/insights" className="text-[13px] font-medium text-ink-2 hover:text-ink">
                  Insights
                </Link>
              </div>
              <dl className="grid grid-cols-2 gap-px overflow-hidden rounded-lg border border-line bg-line">
                {[
                  ["Completed", String(data.stats.completed30)],
                  ["Revenue", formatMoney(data.stats.revenue30, m.currency, { compact: true })],
                  ["Upcoming", String(data.stats.upcoming)],
                  ["No-shows", String(data.stats.noShow30)],
                ].map(([k, v]) => (
                  <div key={k} className="bg-surface p-4">
                    <dt className="text-[12px] text-ink-3">{k}</dt>
                    <dd className="mt-1 text-xl font-semibold text-ink tabular">{v}</dd>
                  </div>
                ))}
              </dl>
              {data.unpaidCompleted > 0 && (
                <p className="mt-3 text-[13px] text-warn">
                  {data.unpaidCompleted} completed {data.unpaidCompleted === 1 ? "visit has" : "visits have"} an unrecorded balance.
                </p>
              )}
            </section>
          )}

          {m.businessStatus === "active" && (
            <section aria-labelledby="share-h">
              <h2 id="share-h" className="mb-1 text-[15px] font-semibold text-ink">
                Your booking link
              </h2>
              <p className="mb-3 text-[13px] text-ink-3">Add it to your Instagram bio, Google profile or texts.</p>
              <ShareLink url={shareUrl} />
            </section>
          )}
        </aside>
      </div>
    </div>
  );
}
