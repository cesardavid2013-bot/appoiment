import { CalendarCheck2, ChevronLeft, Clock, Hourglass, MapPin, Users } from "lucide-react";
import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import { rich } from "@/i18n/rich";
import { AppointmentActions, ReviewForm } from "@/components/booking/appointment-actions";
import { Avatar } from "@/components/ui/media";
import { Badge, Stars } from "@/components/ui/misc";
import { STATUS_TONE } from "@/domain/appointment-state";
import { formatDuration, formatMoney } from "@/domain/money";
import type { TFunction } from "@/i18n/translate";
import { getI18n, getT } from "@/i18n/server";
import { fmtDateLong, fmtTime, tzAbbr } from "@/lib/format";
import { cancellationPreview, reschedulePreview } from "@/server/services/booking";
import { customerAppointmentDetail } from "@/server/services/customer";
import { requireViewerPage } from "@/server/viewer";
import { requestNow } from "@/server/clock";
import { LiveRefresh } from "@/components/shell/live-refresh";

export async function generateMetadata(): Promise<Metadata> {
  const t = await getT("bookings");
  return { title: t("detail.metaTitle"), robots: { index: false } };
}

const gcal = (d: Date) => d.toISOString().replace(/[-:]/g, "").replace(/\.\d{3}/, "");

/** The policy rules explain themselves in English; show the reader's language instead. */
function policyReason(t: TFunction, reason: string | undefined, rescheduleWindowHours: number) {
  if (!reason) return undefined;
  if (reason === "This appointment can no longer be cancelled.") return t("detail.policy.cannotCancel");
  if (reason === "This appointment has already started.") return t("detail.policy.alreadyStarted");
  if (reason === "This appointment can't be rescheduled.") return t("detail.policy.cannotReschedule");
  if (reason.startsWith("This appointment has been rescheduled the maximum")) return t("detail.policy.maxReschedules");
  if (reason.startsWith("Changes must be made")) return t("detail.policy.rescheduleWindow", { hours: rescheduleWindowHours });
  return reason;
}

function refundSummary(t: TFunction, refund: number, kept: number) {
  if (refund === 0 && kept === 0) return t("detail.refund.noCharge");
  if (kept === 0) return t("detail.refund.full");
  if (refund === 0) return t("detail.refund.none");
  return t("detail.refund.partial");
}

export default async function AppointmentPage({ params, searchParams }: PageProps<"/bookings/[id]">) {
  const { id } = await params;
  const sp = await searchParams;
  const viewer = await requireViewerPage(`/bookings/${id}`);
  if (!/^[0-9a-f-]{36}$/i.test(id)) notFound();
  const d = await customerAppointmentDetail(viewer.id, id);
  if (!d) notFound();
  const [t, { intl }] = await Promise.all([getT("bookings"), getI18n()]);
  const a = d.a;
  const isNew = sp.new === "1";
  const cancel = cancellationPreview(a);
  const move = reschedulePreview(a);
  const canReview = a.status === "completed" && !d.review && a.startsAt.getTime() > requestNow() - 90 * 86_400_000;
  const showReviewForm = canReview && sp.review === "1";
  const remaining = Math.max(0, a.totalCents - a.amountPaidCents + a.amountRefundedCents);
  const tz = a.timezone;
  const money = (c: number) => formatMoney(c, a.currency, { intl });
  const closed = ["cancelled", "declined", "expired"].includes(a.status);

  const hero =
    a.status === "confirmed"
      ? { icon: <CalendarCheck2 className="size-7" />, title: t("detail.hero.confirmedTitle"), body: t("detail.hero.confirmedBody") }
      : a.status === "requested"
        ? { icon: <Hourglass className="size-7" />, title: t("detail.hero.requestedTitle"), body: t("detail.hero.requestedBody", { business: d.businessName }) }
        : a.status === "pending_payment"
          ? { icon: <Hourglass className="size-7" />, title: t("detail.hero.paymentTitle"), body: t("detail.hero.paymentBody") }
          : null;

  const googleCalUrl = `https://calendar.google.com/calendar/render?action=TEMPLATE&text=${encodeURIComponent(a.snapshot.serviceName + " — " + d.businessName)}&dates=${gcal(a.startsAt)}/${gcal(a.endsAt)}&details=${encodeURIComponent(t("detail.calendarDetails", { reference: a.reference }))}${a.snapshot.address ? `&location=${encodeURIComponent(a.snapshot.address)}` : ""}`;

  const lineLabel = (l: { kind: string; label: string }) => (l.kind === "fee" ? t("detail.payment.serviceFee") : l.kind === "tax" && l.label === "Tax" ? t("detail.payment.tax") : l.label);

  const policy = a.snapshot;
  const policyText = [
    policy.cancellationWindowHours > 0 ? t("detail.policy.freeUntil", { hours: policy.cancellationWindowHours }) : t("detail.policy.freeAnytime"),
    policy.lateCancelFeePercent > 0 ? t("detail.policy.lateFee", { percent: policy.lateCancelFeePercent }) : null,
    policy.depositRefundable ? null : t("detail.policy.depositNonRefundable"),
  ]
    .filter(Boolean)
    .join(" ");

  return (
    <div className="mx-auto max-w-2xl px-4 pt-6 sm:px-6 sm:pt-8">
      <LiveRefresh kinds={["appointment"]} />
      <Link href="/bookings" className="-ms-1 inline-flex h-10 items-center gap-1 pe-2 text-sm font-medium text-ink-3 hover:text-ink">
        <ChevronLeft className="size-4 rtl:-scale-x-100" aria-hidden />
        {t("detail.allBookings")}
      </Link>

      {isNew && hero && (
        <section className="mt-4 animate-rise rounded-xl bg-ink px-6 py-8 text-bg" aria-live="polite">
          <div className="flex size-14 items-center justify-center rounded-full bg-bg/10 text-bg">{hero.icon}</div>
          <h1 className="mt-5 font-display text-[40px] leading-none">{hero.title}</h1>
          <p className="mt-3 max-w-md text-[15px] leading-relaxed text-bg/70">{hero.body}</p>
        </section>
      )}

      <section className="mt-4 overflow-hidden rounded-xl border border-line bg-surface">
        <div className="flex items-start justify-between gap-4 p-5 sm:p-6">
          <div className="min-w-0">
            {!isNew && <Badge tone={STATUS_TONE[a.status]}>{t(`status.${a.status}`)}</Badge>}
            <h2 className="mt-2 text-2xl font-semibold tracking-[-0.015em] text-ink">{a.snapshot.serviceName}</h2>
            {a.snapshot.options.length > 0 && <p className="mt-1 text-sm text-ink-3">{a.snapshot.options.map((o) => o.name).join(" · ")}</p>}
            <Link href={`/${d.businessSlug}`} className="mt-3 inline-flex items-center gap-2 text-[15px] font-medium text-ink hover:underline">
              <Avatar name={d.businessName} media={d.logo} size={28} />
              {d.businessName}
            </Link>
          </div>
          <div className="shrink-0 rounded-lg border border-line px-3 py-2 text-center">
            <p className="text-[10px] font-semibold uppercase tracking-wide text-ink-3">{t("detail.ref")}</p>
            <p className="font-mono text-sm font-semibold text-ink" dir="ltr">
              {a.reference}
            </p>
          </div>
        </div>
        <dl className="divide-y divide-line border-t border-line text-[15px]">
          <div className="flex items-start gap-3 px-5 py-4 sm:px-6">
            <Clock className="mt-0.5 size-5 shrink-0 text-ink-3" />
            <div>
              <dt className="sr-only">{t("detail.when")}</dt>
              <dd className="font-medium text-ink">{fmtDateLong(a.startsAt, tz, intl)}</dd>
              <dd className="text-sm text-ink-3">
                {fmtTime(a.startsAt, tz, intl)} – {fmtTime(a.endsAt, tz, intl)} {tzAbbr(a.startsAt, tz, intl)} · {formatDuration(a.snapshot.durationMinutes, intl)}
              </dd>
            </div>
          </div>
          {a.snapshot.memberName && (
            <div className="flex items-start gap-3 px-5 py-4 sm:px-6">
              <Users className="mt-0.5 size-5 shrink-0 text-ink-3" />
              <div>
                <dt className="sr-only">{t("detail.with")}</dt>
                <dd className="font-medium text-ink">{a.snapshot.memberName}</dd>
              </div>
            </div>
          )}
          <div className="flex items-start gap-3 px-5 py-4 sm:px-6">
            <MapPin className="mt-0.5 size-5 shrink-0 text-ink-3" />
            <div>
              <dt className="sr-only">{t("detail.where")}</dt>
              <dd className="font-medium text-ink">
                <bdi>{a.snapshot.locationKind === "mobile" ? (a.serviceAddress ?? t("detail.atYourAddress")) : a.snapshot.locationKind === "virtual" ? t("detail.online") : (a.snapshot.address ?? a.snapshot.locationName ?? d.businessName)}</bdi>
              </dd>
              {a.snapshot.locationKind === "virtual" && <dd className="text-sm text-ink-3">{t("detail.virtualLink")}</dd>}
              {d.location?.instructions && <dd className="text-sm text-ink-3">{d.location.instructions}</dd>}
            </div>
          </div>
        </dl>
      </section>

      <div className="mt-6">
        <AppointmentActions
          a={{
            id: a.id,
            status: a.status,
            startsAt: a.startsAt.toISOString(),
            timezone: tz,
            serviceId: a.serviceId,
            memberId: a.memberId,
            locationId: a.locationId,
            optionIds: a.selectedOptionIds,
            businessId: a.businessId,
            businessSlug: d.businessSlug,
            businessName: d.businessName,
            currency: a.currency,
            address: a.snapshot.address,
            lat: d.location?.lat ?? null,
            lng: d.location?.lng ?? null,
            needsPayment: a.depositDueCents > a.amountPaidCents,
            amountDue: a.depositDueCents - a.amountPaidCents,
          }}
          cancel={
            cancel.allowed
              ? { allowed: true, summary: refundSummary(t, cancel.refundCents, cancel.keptCents), refundCents: cancel.refundCents, keptCents: cancel.keptCents, isLate: cancel.isLate }
              : { allowed: false, reason: policyReason(t, cancel.reason, a.snapshot.rescheduleWindowHours) }
          }
          reschedule={move.allowed ? move : { allowed: false, reason: policyReason(t, move.reason, a.snapshot.rescheduleWindowHours) }}
          canReview={canReview && !showReviewForm}
          googleCalUrl={googleCalUrl}
        />
      </div>

      {showReviewForm && (
        <div className="mt-6">
          <ReviewForm appointmentId={a.id} businessName={d.businessName} />
        </div>
      )}
      {d.review && (
        <section className="mt-6 rounded-xl border border-line bg-surface p-5">
          <p className="text-sm font-medium text-ink">{t("detail.yourReview")}</p>
          <Stars value={d.review.rating} className="mt-2" />
          {d.review.body && <p className="mt-2 text-[15px] leading-relaxed text-ink-2">{d.review.body}</p>}
        </section>
      )}

      <section className="mt-8" aria-labelledby="pay-h">
        <h2 id="pay-h" className="mb-3 text-[15px] font-semibold text-ink">
          {t("detail.payment.title")}
        </h2>
        <dl className="space-y-2 text-[15px]">
          {a.snapshot.lines.map((l, i) => (
            <div key={i} className="flex justify-between gap-4 text-ink-2">
              <dt>{lineLabel(l)}</dt>
              <dd className="tabular">{l.amountCents < 0 ? `−${money(-l.amountCents)}` : money(l.amountCents)}</dd>
            </div>
          ))}
          <div className="flex justify-between gap-4 border-t border-line pt-2.5 font-semibold text-ink">
            <dt>{a.isEstimate ? t("detail.payment.estimatedTotal") : t("detail.payment.total")}</dt>
            <dd className="tabular">{money(a.totalCents)}</dd>
          </div>
          {a.amountPaidCents > 0 && (
            <div className="flex justify-between gap-4 text-sm text-ink-2">
              <dt>{t("detail.payment.paid")}</dt>
              <dd className="tabular">{money(a.amountPaidCents)}</dd>
            </div>
          )}
          {a.amountRefundedCents > 0 && (
            <div className="flex justify-between gap-4 text-sm text-accent-text">
              <dt>{t("detail.payment.refunded")}</dt>
              <dd className="tabular">{money(a.amountRefundedCents)}</dd>
            </div>
          )}
          {!closed && remaining > 0 && (
            <div className="flex justify-between gap-4 text-sm text-ink-3">
              <dt>{a.status === "completed" ? t("detail.payment.balance") : t("detail.payment.dueAtAppointment")}</dt>
              <dd className="tabular">{money(remaining)}</dd>
            </div>
          )}
          {a.tipCents > 0 && (
            <div className="flex justify-between gap-4 text-sm text-ink-2">
              <dt>{t("detail.payment.tip")}</dt>
              <dd className="tabular">{money(a.tipCents)}</dd>
            </div>
          )}
        </dl>
      </section>

      <section className="mt-8 rounded-lg bg-surface-2 p-4 text-sm leading-relaxed text-ink-2">
        <p className="mb-1 font-medium text-ink">{t("detail.policy.title")}</p>
        <p>{policyText}</p>
        {a.cancellationReason && closed && <p className="mt-2 text-ink-3">{t("detail.note", { reason: a.cancellationReason })}</p>}
      </section>

      <p className="mt-8 text-center text-[13px] text-ink-3">
        {rich(t("detail.problem"), {
          link: (text) => (
            <Link href={`/support?appointment=${a.id}`} className="font-medium text-ink underline underline-offset-4">
              {text}
            </Link>
          ),
        })}
      </p>
    </div>
  );
}
