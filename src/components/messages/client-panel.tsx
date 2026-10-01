import { ArrowUpRight, Mail, Phone } from "lucide-react";
import Link from "next/link";
import { Badge } from "@/components/ui/misc";
import { STATUS_TONE } from "@/domain/appointment-state";
import { getI18n, getT } from "@/i18n/server";
import type { TFunction } from "@/i18n/translate";
import { fmtDate, fmtTime } from "@/lib/format";
import type { threadContext } from "@/server/services/messaging";

type Ctx = Awaited<ReturnType<typeof threadContext>>;
type Appt = Ctx["upcoming"][number];

function ApptRow({ a, t, intl }: { a: Appt; t: TFunction; intl: string }) {
  return (
    <li>
      <Link href={`/pro/appointments/${a.id}`} className="-mx-2 flex items-start justify-between gap-3 rounded-md px-2 py-2 hover:bg-surface-2">
        <span className="min-w-0">
          <span className="block truncate text-sm font-medium text-ink">{a.serviceName}</span>
          <span className="block text-[12px] text-ink-3 tabular">
            {fmtDate(a.startsAt, a.timezone, { weekday: "short", month: "short", day: "numeric", year: "numeric" }, intl)} · {fmtTime(a.startsAt, a.timezone, intl)}
          </span>
        </span>
        <Badge tone={STATUS_TONE[a.status]} className="mt-0.5 shrink-0">
          {t(`bookings.status.${a.status}`)}
        </Badge>
      </Link>
    </li>
  );
}

/** Who you're talking to: contact, visit history and appointments, next to the thread. */
export async function ClientPanel({ ctx, timezone }: { ctx: Ctx; timezone: string }) {
  const [t, { intl }] = await Promise.all([getT(), getI18n()]);
  const c = ctx.client;
  return (
    <div className="space-y-7 p-5">
      <section aria-labelledby="cp-client">
        <h3 id="cp-client" className="text-[12px] font-semibold uppercase tracking-[0.06em] text-ink-3">
          {t("messages.clientPanel.client")}
        </h3>
        {c ? (
          <>
            <p className="mt-2 text-[15px] font-semibold text-ink">{c.name}</p>
            {(c.phone || c.email) && (
              <ul className="mt-1.5 space-y-1 text-sm">
                {c.phone && (
                  <li>
                    <a href={`tel:${c.phone}`} className="inline-flex items-center gap-2 text-ink-2 hover:text-ink">
                      <Phone className="size-3.5 text-ink-3" aria-hidden />
                      {c.phone}
                    </a>
                  </li>
                )}
                {c.email && (
                  <li className="min-w-0">
                    <a href={`mailto:${c.email}`} className="inline-flex max-w-full items-center gap-2 text-ink-2 hover:text-ink">
                      <Mail className="size-3.5 shrink-0 text-ink-3" aria-hidden />
                      <span className="truncate">{c.email}</span>
                    </a>
                  </li>
                )}
              </ul>
            )}
            <dl className="mt-4 grid grid-cols-3 divide-x divide-line rounded-lg border border-line text-center">
              {[
                [t("messages.clientPanel.visits"), c.completedCount],
                [t("messages.clientPanel.noShows"), c.noShowCount],
                [t("messages.clientPanel.cancelled"), c.cancelledCount],
              ].map(([k, v]) => (
                <div key={k} className="py-2.5">
                  <dd className="text-[17px] font-semibold text-ink tabular">{v}</dd>
                  <dt className="text-[11px] text-ink-3">{k}</dt>
                </div>
              ))}
            </dl>
            <p className="mt-3 text-[13px] text-ink-3">
              {c.firstVisitAt ? t("messages.clientPanel.clientSince", { date: fmtDate(c.firstVisitAt, timezone, { month: "short", year: "numeric" }, intl) }) : t("messages.clientPanel.noVisits")}
              {c.lastVisitAt && ` · ${t("messages.clientPanel.lastIn", { date: fmtDate(c.lastVisitAt, timezone, { month: "short", day: "numeric" }, intl) })}`}
            </p>
            {c.tags.length > 0 && (
              <ul className="mt-3 flex flex-wrap gap-1.5" aria-label={t("messages.clientPanel.tags")}>
                {c.tags.map((t) => (
                  <li key={t} className="rounded-sm bg-surface-2 px-1.5 py-0.5 text-[12px] text-ink-2">
                    {t}
                  </li>
                ))}
              </ul>
            )}
            {ctx.canSeeClient && (
              <Link href={`/pro/clients/${c.id}`} className="mt-4 inline-flex h-9 items-center gap-1.5 rounded-md border border-line-strong px-3 text-sm font-medium text-ink hover:bg-surface-2">
                {t("messages.clientPanel.clientProfile")} <ArrowUpRight className="size-3.5 rtl:-scale-x-100" aria-hidden />
              </Link>
            )}
          </>
        ) : (
          <p className="mt-2 text-sm leading-relaxed text-ink-3">{t("messages.clientPanel.notBooked")}</p>
        )}
      </section>

      {c && (
        <>
          <section aria-labelledby="cp-up">
            <h3 id="cp-up" className="text-[12px] font-semibold uppercase tracking-[0.06em] text-ink-3">
              {t("messages.clientPanel.upcoming")}
            </h3>
            {ctx.upcoming.length ? (
              <ul className="mt-1.5">
                {ctx.upcoming.map((a) => (
                  <ApptRow key={a.id} a={a} t={t} intl={intl} />
                ))}
              </ul>
            ) : (
              <p className="mt-2 text-sm text-ink-3">{t("messages.clientPanel.nothingBooked")}</p>
            )}
          </section>
          {ctx.past.length > 0 && (
            <section aria-labelledby="cp-past">
              <h3 id="cp-past" className="text-[12px] font-semibold uppercase tracking-[0.06em] text-ink-3">
                {t("messages.clientPanel.recent")}
              </h3>
              <ul className="mt-1.5">
                {ctx.past.map((a) => (
                  <ApptRow key={a.id} a={a} t={t} intl={intl} />
                ))}
              </ul>
            </section>
          )}
        </>
      )}
    </div>
  );
}
