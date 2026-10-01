import { ArrowLeft, Lock, MessageCircle } from "lucide-react";
import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import { AppointmentControls } from "@/components/pro/appointment-controls";
import { QuickNote, RecordPaymentButton, RescheduleButton } from "@/components/pro/appointment-panels";
import { Badge } from "@/components/ui/misc";
import { STATUS_TONE } from "@/domain/appointment-state";
import { AppError } from "@/domain/errors";
import { formatDuration, formatMoney } from "@/domain/money";
import { getI18n, getT } from "@/i18n/server";
import { fmtDate, fmtDateLong, fmtTime, timeAgo, tzAbbr } from "@/lib/format";
import { listTeam, proAppointmentDetail } from "@/server/services/pro";
import { proPage } from "@/server/pro-page";

export async function generateMetadata(): Promise<Metadata> {
  const t = await getT("pro");
  return { title: t("appointment.title") };
}

export default async function ProAppointmentPage({ params }: PageProps<"/pro/appointments/[id]">) {
  const { id } = await params;
  const { m } = await proPage();
  const [t, tRoot, { intl }] = await Promise.all([getT("pro"), getT(), getI18n()]);
  /** A translated label for a stored value, or the fallback when there's no translation for it. */
  const label = (key: string, fallback: string) => {
    const v = t(key);
    return v === `pro.${key}` ? fallback : v;
  };
  if (!/^[0-9a-f-]{36}$/i.test(id)) notFound();
  let d;
  try {
    d = await proAppointmentDetail(m, id);
  } catch (err) {
    if (err instanceof AppError && err.code === "not_found") notFound();
    throw err;
  }
  const a = d.appointment;
  const tz = a.timezone;
  const team = await listTeam(m.businessId);
  const balance = Math.max(0, a.totalCents - a.amountPaidCents + a.amountRefundedCents);
  const active = ["requested", "confirmed", "checked_in", "in_progress", "pending_payment"].includes(a.status);
  const canAll = m.permissions.has("appointments.manage_all");

  return (
    <div className="mx-auto max-w-5xl px-4 pb-16 pt-6 sm:px-6 lg:px-10 lg:pt-8">
      <Link href="/pro/calendar" className="inline-flex items-center gap-1.5 text-sm font-medium text-ink-3 hover:text-ink">
        <ArrowLeft className="size-4" /> {t("nav.calendar")}
      </Link>

      <header className="mt-5 flex flex-col gap-5 border-b border-line pb-6 sm:flex-row sm:items-end sm:justify-between">
        <div className="min-w-0">
          <div className="flex items-center gap-2">
            <Badge tone={STATUS_TONE[a.status]}>{tRoot(`common.appointmentStatus.${a.status}`)}</Badge>
            <span className="font-mono text-[12px] text-ink-3">{a.reference}</span>
          </div>
          <h1 className="mt-3 font-display text-[34px] leading-[1.05] text-ink sm:text-[40px]">{d.customer.name}</h1>
          <p className="mt-1.5 text-[15px] text-ink-2">
            {a.snapshot.serviceName}
            {a.snapshot.options.length > 0 && <span className="text-ink-3"> · {a.snapshot.options.map((o) => o.name).join(", ")}</span>}
          </p>
          <p className="mt-1 text-[15px] text-ink-2 tabular">
            {fmtDateLong(a.startsAt, tz, intl)} · {fmtTime(a.startsAt, tz, intl)} – {fmtTime(a.endsAt, tz, intl)} <span className="text-ink-3">{tzAbbr(a.startsAt, tz, intl)}</span>
          </p>
        </div>
        {d.canManage && (
          <div className="flex flex-wrap items-center gap-2">
            {active && !a.groupSessionId && <RescheduleButton a={{ id: a.id, startsAt: a.startsAt.toISOString(), serviceId: a.serviceId, memberId: a.memberId, locationId: a.locationId, optionIds: a.selectedOptionIds }} timezone={tz} team={team.map((t) => ({ id: t.id, name: t.name }))} canAll={canAll} />}
            <AppointmentControls a={{ id: a.id, status: a.status, startsAt: a.startsAt.toISOString(), version: a.version }} size="md" />
          </div>
        )}
      </header>

      <div className="mt-8 grid gap-10 lg:grid-cols-[minmax(0,1fr)_300px]">
        <div className="min-w-0 space-y-10">
          <section aria-labelledby="details-h">
            <h2 id="details-h" className="mb-3 text-[15px] font-semibold text-ink">
              {t("appointment.details")}
            </h2>
            <dl className="divide-y divide-line border-y border-line text-[15px]">
              {[
                [t("appointment.duration"), formatDuration(a.snapshot.durationMinutes, intl)],
                ...(team.length > 1 ? [[t("calendar.with"), d.member?.name ?? "—"]] : []),
                [t("appointment.where"), a.snapshot.locationKind === "mobile" ? (a.serviceAddress ?? t("appointment.customerAddress")) : a.snapshot.locationKind === "virtual" ? t("calendar.source.online") : (a.snapshot.address ?? d.location?.name ?? "—")],
                [t("calendar.booked"), `${a.source === "manual" ? t("calendar.source.manual") : a.source === "walk_in" ? t("calendar.source.walkIn") : t("calendar.source.online")} · ${timeAgo(a.createdAt, undefined, intl)}`],
              ].map(([k, v]) => (
                <div key={k} className="flex justify-between gap-6 py-3">
                  <dt className="text-ink-3">{k}</dt>
                  <dd className="text-end text-ink">{v}</dd>
                </div>
              ))}
            </dl>
          </section>

          {(a.customerNote || (a.intakeAnswers && a.intakeAnswers.length > 0)) && (
            <section aria-labelledby="answers-h">
              <h2 id="answers-h" className="mb-3 text-[15px] font-semibold text-ink">
                {t("appointment.fromCustomer")}
              </h2>
              {a.customerNote && <blockquote className="mb-4 border-s-2 border-line-strong ps-3.5 text-[15px] leading-relaxed text-ink-2">{a.customerNote}</blockquote>}
              {a.intakeAnswers && a.intakeAnswers.length > 0 && (
                <dl className="space-y-3">
                  {a.intakeAnswers.map((q) => (
                    <div key={q.fieldId}>
                      <dt className="text-[13px] text-ink-3">{q.label}</dt>
                      <dd className="mt-0.5 text-[15px] text-ink">{typeof q.answer === "boolean" ? (q.answer ? t("appointment.yes") : t("appointment.no")) : Array.isArray(q.answer) ? q.answer.join(", ") : String(q.answer)}</dd>
                    </div>
                  ))}
                </dl>
              )}
              {a.consentAcceptedAt && <p className="mt-3 text-[13px] text-ink-3">{t("appointment.consentAccepted", { date: fmtDateLong(a.consentAcceptedAt, tz, intl) })}</p>}
            </section>
          )}

          {(m.permissions.has("payments.view") || m.permissions.has("payments.refund")) && (
            <section aria-labelledby="pay-h">
              <div className="mb-3 flex items-center justify-between">
                <h2 id="pay-h" className="text-[15px] font-semibold text-ink">
                  {t("appointment.payment")}
                </h2>
                {d.canRefund && !["cancelled", "declined", "expired"].includes(a.status) && <RecordPaymentButton appointmentId={a.id} currency={a.currency} suggestedCents={balance} />}
              </div>
              <dl className="space-y-1.5 text-[15px]">
                {a.snapshot.lines.map((l, i) => (
                  <div key={i} className="flex justify-between text-ink-2">
                    <dt>{l.kind === "fee" ? t("appointment.serviceFee") : l.kind === "tax" && l.label === "Tax" ? t("appointment.tax") : l.label}</dt>
                    <dd className="tabular">{l.amountCents < 0 ? `−${formatMoney(-l.amountCents, a.currency, { intl })}` : formatMoney(l.amountCents, a.currency, { intl })}</dd>
                  </div>
                ))}
                <div className="flex justify-between border-t border-line pt-2 font-semibold text-ink">
                  <dt>{a.isEstimate ? t("appointment.estimatedTotal") : t("appointment.total")}</dt>
                  <dd className="tabular">{formatMoney(a.totalCents, a.currency, { intl })}</dd>
                </div>
                <div className="flex justify-between text-sm text-ink-3">
                  <dt>{t("appointment.paid")}</dt>
                  <dd className="tabular">{formatMoney(a.amountPaidCents, a.currency, { intl })}</dd>
                </div>
                {a.amountRefundedCents > 0 && (
                  <div className="flex justify-between text-sm text-ink-3">
                    <dt>{t("appointment.refunded")}</dt>
                    <dd className="tabular">{formatMoney(a.amountRefundedCents, a.currency, { intl })}</dd>
                  </div>
                )}
                {a.tipCents > 0 && (
                  <div className="flex justify-between text-sm text-ink-3">
                    <dt>{t("appointment.tips")}</dt>
                    <dd className="tabular">{formatMoney(a.tipCents, a.currency, { intl })}</dd>
                  </div>
                )}
                {balance > 0 && !["cancelled", "declined", "expired"].includes(a.status) && (
                  <div className="flex justify-between text-sm font-medium text-ink">
                    <dt>{t("appointment.balance")}</dt>
                    <dd className="tabular">{formatMoney(balance, a.currency, { intl })}</dd>
                  </div>
                )}
              </dl>
              {d.payments.length > 0 && (
                <ul className="mt-4 divide-y divide-line rounded-lg border border-line text-sm">
                  {d.payments.map((p) => (
                    <li key={p.id} className="flex items-center justify-between gap-4 px-3.5 py-2.5">
                      <span className="text-ink-2">
                        {p.kind === "tip" ? t("appointment.paymentKind.tip") : p.kind === "deposit" ? t("appointment.paymentKind.deposit") : t("appointment.paymentKind.payment")} ·{" "}
                        {p.provider === "stripe" ? t("calendar.source.online") : p.method ? label(`payments.methods.${p.method}`, p.method.replace("_", " ")) : ""}
                      </span>
                      <span className="tabular text-ink">
                        {formatMoney(p.amountCents, p.currency, { intl })} <span className="text-ink-3">· {label(`appointment.paymentStatus.${p.status}`, p.status.replace("_", " "))}</span>
                      </span>
                    </li>
                  ))}
                </ul>
              )}
            </section>
          )}

          <section aria-labelledby="hist-h">
            <h2 id="hist-h" className="mb-3 text-[15px] font-semibold text-ink">
              {t("appointment.history")}
            </h2>
            <ol className="space-y-3 border-s border-line ps-4">
              {d.events.map((e) => (
                <li key={e.id} className="relative text-sm">
                  <span className="absolute -start-[21px] top-1.5 size-2 rounded-full bg-line-strong" aria-hidden />
                  <span className="text-ink">
                    {e.type === "status" && e.toStatus
                      ? tRoot(`common.appointmentStatus.${e.toStatus}`)
                      : e.type === "rescheduled" && e.data && typeof e.data.from === "string"
                        ? t("appointment.events.movedFrom", { when: fmtDate(e.data.from, tz, { weekday: "long", month: "long", day: "numeric", hour: "numeric", minute: "2-digit" }, intl) })
                        : label(`appointment.events.${e.type}`, e.type)}
                  </span>
                  <span className="text-ink-3">
                    {" · "}
                    {e.actorType === "system" ? t("appointment.actor.system") : e.actorType === "customer" ? t("appointment.actor.customer") : e.actorName ? t("appointment.actor.named", { name: e.actorName }) : t("appointment.actor.team")} · {timeAgo(e.createdAt, undefined, intl)}
                  </span>
                </li>
              ))}
            </ol>
          </section>
        </div>

        <aside className="space-y-8">
          <section aria-labelledby="client-h" className="rounded-xl border border-line bg-surface p-5">
            <div className="flex items-start justify-between gap-3">
              <h2 id="client-h" className="text-[15px] font-semibold text-ink">
                {t("appointment.client")}
              </h2>
              {m.permissions.has("customers.view") && (
                <Link href={`/pro/clients/${d.customer.id}`} className="text-[13px] font-medium text-ink-2 hover:text-ink">
                  {t("appointment.profile")}
                </Link>
              )}
            </div>
            <p className="mt-2 text-[15px] font-medium text-ink">{d.customer.name}</p>
            {(d.customer.phone || d.customer.email) && (
              <p className="mt-0.5 space-x-2 text-sm text-ink-3">
                {d.customer.phone && (
                  <a href={`tel:${d.customer.phone}`} className="hover:text-ink">
                    {d.customer.phone}
                  </a>
                )}
                {d.customer.email && (
                  <a href={`mailto:${d.customer.email}`} className="hover:text-ink">
                    {d.customer.email}
                  </a>
                )}
              </p>
            )}
            <dl className="mt-4 grid grid-cols-3 gap-2 text-center">
              {[
                [t("appointment.visits"), d.customer.completedCount.toLocaleString(intl)],
                [t("today.stats.noShows"), d.customer.noShowCount.toLocaleString(intl)],
                [t("appointment.cancelled"), d.customer.cancelledCount.toLocaleString(intl)],
              ].map(([k, v]) => (
                <div key={k} className="rounded-md bg-surface-2 py-2">
                  <dd className="text-lg font-semibold text-ink tabular">{v}</dd>
                  <dt className="text-[11px] text-ink-3">{k}</dt>
                </div>
              ))}
            </dl>
            {d.customer.tags.length > 0 && <p className="mt-3 text-[13px] text-ink-3">{d.customer.tags.join(" · ")}</p>}
            {d.customer.hasAccount && m.permissions.has("messages.manage") && (
              <Link href={`/pro/messages?customer=${d.customer.id}`} className="mt-4 inline-flex h-9 items-center gap-1.5 rounded-md border border-line-strong px-3 text-sm font-medium text-ink hover:bg-surface-2">
                <MessageCircle className="size-4" /> {t("appointment.message")}
              </Link>
            )}
          </section>

          {m.permissions.has("customers.manage") && (
            <section aria-labelledby="notes-h">
              <h2 id="notes-h" className="mb-1 flex items-center gap-1.5 text-[15px] font-semibold text-ink">
                {t("appointment.privateNotes")} <Lock className="size-3.5 text-ink-3" />
              </h2>
              <p className="mb-3 text-[12px] text-ink-3">{t("appointment.privateNotesHint")}</p>
              <QuickNote customerId={d.customer.id} />
              <ul className="mt-4 space-y-3">
                {d.notes.map((n) => (
                  <li key={n.id} className="text-sm">
                    <p className="whitespace-pre-line text-ink-2">{n.body}</p>
                    <p className="mt-0.5 text-[12px] text-ink-3">
                      {n.author} · {timeAgo(n.createdAt, undefined, intl)}
                    </p>
                  </li>
                ))}
              </ul>
            </section>
          )}
        </aside>
      </div>
    </div>
  );
}
