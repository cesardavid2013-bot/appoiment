import { ArrowRight, CalendarDays, MapPin, Navigation } from "lucide-react";
import type { Metadata } from "next";
import Link from "next/link";
import { ButtonLink } from "@/components/ui/button";
import { Avatar } from "@/components/ui/media";
import { Badge, EmptyState, PageHeader } from "@/components/ui/misc";
import { STATUS_TONE } from "@/domain/appointment-state";
import { getI18n, getT } from "@/i18n/server";
import { cn } from "@/lib/cn";
import { fmtDate, fmtTime, relativeDayWord } from "@/lib/format";
import {
  listCustomerAppointments,
  pendingReviews,
} from "@/server/services/customer";
import { requireViewerPage } from "@/server/viewer";
import { LiveRefresh } from "@/components/shell/live-refresh";

export async function generateMetadata(): Promise<Metadata> {
  const t = await getT("bookings");
  return { title: t("list.title"), robots: { index: false } };
}

const TABS = ["upcoming", "past", "cancelled"] as const;

export default async function BookingsPage({
  searchParams,
}: PageProps<"/bookings">) {
  const viewer = await requireViewerPage("/bookings");
  const [t, { intl }] = await Promise.all([getT("bookings"), getI18n()]);
  const sp = await searchParams;
  const tab = TABS.find((k) => k === sp.tab) ?? "upcoming";
  const now = new Date();
  const [items, toReview] = await Promise.all([
    listCustomerAppointments(viewer.id, tab),
    tab === "upcoming" ? pendingReviews(viewer.id) : Promise.resolve([]),
  ]);

  // The soonest upcoming appointment gets the stage; the rest are the list.
  const next = tab === "upcoming" ? items[0] : undefined;
  const rest = next ? items.slice(1) : items;
  const nextWord = next
    ? relativeDayWord(next.startsAt, next.timezone, intl, now)
    : null;

  return (
    <div className="mx-auto max-w-3xl px-4 pt-10 sm:px-6">
      <LiveRefresh kinds={["appointment"]} />
      <PageHeader title={t("list.title")} />
      <nav
        className="mt-6 flex gap-6 border-b border-line"
        aria-label={t("list.filters")}
      >
        {TABS.map((k) => (
          <Link
            key={k}
            href={k === "upcoming" ? "/bookings" : `/bookings?tab=${k}`}
            aria-current={tab === k ? "page" : undefined}
            className={cn(
              "-mb-px border-b-2 pb-3 text-sm font-medium",
              tab === k
                ? "border-ink text-ink"
                : "border-transparent text-ink-3 hover:text-ink",
            )}
          >
            {t(`list.tabs.${k}`)}
          </Link>
        ))}
      </nav>

      {toReview.length > 0 && (
        <div className="mt-6 rounded-xl border border-line bg-surface p-4">
          <p className="text-sm font-medium text-ink">{t("list.howDidItGo")}</p>
          <ul className="mt-2 space-y-1">
            {toReview.map((r) => (
              <li
                key={r.id}
                className="flex items-center justify-between gap-3 text-sm"
              >
                <span className="truncate text-ink-2">
                  {r.serviceName} · {r.businessName}
                </span>
                <Link
                  href={`/bookings/${r.id}?review=1`}
                  className="shrink-0 font-medium text-ink underline underline-offset-4"
                >
                  {t("list.review")}
                </Link>
              </li>
            ))}
          </ul>
        </div>
      )}

      {items.length === 0 ? (
        <EmptyState
          icon={<CalendarDays />}
          title={t(`list.empty.${tab}`)}
          description={
            tab === "upcoming" ? t("list.empty.upcomingBody") : undefined
          }
          action={
            tab === "upcoming" ? (
              <ButtonLink href="/explore">{t("list.empty.findPro")}</ButtonLink>
            ) : undefined
          }
        />
      ) : (
        <>
          {next && (
            <section
              aria-labelledby="next-h"
              className="theme-noir relative mt-6 overflow-hidden bg-bg p-6 text-ink sm:p-7"
            >
              <div
                className="pointer-events-none absolute inset-2 border border-gold/20"
                aria-hidden
              />
              <div className="relative">
                <p id="next-h" className="eyebrow !text-gold-text">
                  {nextWord
                    ? t("list.nextUp", { when: nextWord })
                    : t("list.nextUpOn", {
                        day: fmtDate(
                          next.startsAt,
                          next.timezone,
                          { weekday: "long", month: "long", day: "numeric" },
                          intl,
                        ),
                      })}
                </p>
                <p className="mt-3 font-display text-[44px] leading-none tabular sm:text-[52px]">
                  {fmtTime(next.startsAt, next.timezone, intl)}
                </p>
                <p className="mt-3 text-[17px] text-ink">
                  {next.snapshot.serviceName}
                </p>
                <p className="mt-1 text-sm text-ink-2">
                  {next.businessName}
                  {next.snapshot.memberName
                    ? ` · ${next.snapshot.memberName}`
                    : ""}
                </p>
                {next.snapshot.address && (
                  <p className="mt-1 flex items-start gap-1.5 text-sm text-ink-3">
                    <MapPin className="mt-0.5 size-3.5 shrink-0" aria-hidden />
                    <bdi>{next.snapshot.address}</bdi>
                  </p>
                )}
                <div className="mt-5 flex flex-wrap gap-2">
                  <Link
                    href={`/bookings/${next.id}`}
                    className="inline-flex h-10 items-center gap-1.5 bg-ink px-4 text-sm font-medium text-bg hover:bg-ink/90"
                  >
                    {t("list.details")}
                    <ArrowRight className="size-4" aria-hidden />
                  </Link>
                  {next.snapshot.address && (
                    <a
                      href={`https://www.google.com/maps/dir/?api=1&destination=${encodeURIComponent(next.snapshot.address)}`}
                      target="_blank"
                      rel="noopener noreferrer"
                      className="inline-flex h-10 items-center gap-1.5 border border-line-strong px-4 text-sm font-medium text-ink hover:border-gold hover:text-gold-text"
                    >
                      <Navigation className="size-4" aria-hidden />{" "}
                      {t("list.directions")}
                    </a>
                  )}
                </div>
              </div>
            </section>
          )}
          <ul className="mt-2 divide-y divide-line">
            {rest.map((a) => (
              <li key={a.id}>
                <Link
                  href={`/bookings/${a.id}`}
                  className="-mx-3 flex items-center gap-4 rounded-lg px-3 py-4 transition-colors hover:bg-surface"
                >
                  <div className="flex w-14 shrink-0 flex-col items-center rounded-lg border border-line bg-surface py-1.5 leading-tight">
                    <span className="text-[10px] font-semibold uppercase tracking-wide text-ink-3">
                      {fmtDate(
                        a.startsAt,
                        a.timezone,
                        { month: "short" },
                        intl,
                      )}
                    </span>
                    <span className="text-lg font-semibold text-ink tabular">
                      {fmtDate(
                        a.startsAt,
                        a.timezone,
                        { day: "numeric" },
                        intl,
                      )}
                    </span>
                  </div>
                  <div className="min-w-0 flex-1">
                    <p className="truncate text-[15px] font-semibold text-ink">
                      {a.snapshot.serviceName}
                    </p>
                    <p className="truncate text-sm text-ink-3">
                      {fmtDate(
                        a.startsAt,
                        a.timezone,
                        { weekday: "short" },
                        intl,
                      )}{" "}
                      {fmtTime(a.startsAt, a.timezone, intl)} · {a.businessName}
                    </p>
                  </div>
                  <div className="flex shrink-0 items-center gap-3">
                    <Badge tone={STATUS_TONE[a.status]}>
                      {t(`status.${a.status}`)}
                    </Badge>
                    <Avatar
                      name={a.businessName}
                      media={a.logo}
                      size={32}
                      className="hidden sm:inline-flex"
                    />
                  </div>
                </Link>
              </li>
            ))}
          </ul>
        </>
      )}
    </div>
  );
}
