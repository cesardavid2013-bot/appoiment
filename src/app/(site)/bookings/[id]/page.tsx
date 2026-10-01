import { CalendarCheck2, Clock, Hourglass, MapPin, Users } from "lucide-react";
import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import { AppointmentActions, ReviewForm } from "@/components/booking/appointment-actions";
import { Avatar } from "@/components/ui/media";
import { Badge, Stars } from "@/components/ui/misc";
import { STATUS_LABELS, STATUS_TONE } from "@/domain/appointment-state";
import { formatDuration, formatMoney } from "@/domain/money";
import { fmtDateLong, fmtTime, tzAbbr } from "@/lib/format";
import { cancellationPreview, reschedulePreview } from "@/server/services/booking";
import { customerAppointmentDetail } from "@/server/services/customer";
import { requireViewerPage } from "@/server/viewer";

export const metadata: Metadata = { title: "Appointment", robots: { index: false } };

const gcal = (d: Date) => d.toISOString().replace(/[-:]/g, "").replace(/\.\d{3}/, "");

export default async function AppointmentPage({ params, searchParams }: PageProps<"/bookings/[id]">) {
  const { id } = await params;
  const sp = await searchParams;
  const viewer = await requireViewerPage(`/bookings/${id}`);
  if (!/^[0-9a-f-]{36}$/i.test(id)) notFound();
  const d = await customerAppointmentDetail(viewer.id, id);
  if (!d) notFound();
  const a = d.a;
  const isNew = sp.new === "1";
  const cancel = cancellationPreview(a);
  const move = reschedulePreview(a);
  const canReview = a.status === "completed" && !d.review && a.startsAt.getTime() > Date.now() - 90 * 86_400_000;
  const showReviewForm = canReview && sp.review === "1";
  const remaining = Math.max(0, a.totalCents - a.amountPaidCents + a.amountRefundedCents);
  const tz = a.timezone;

  const hero =
    a.status === "confirmed"
      ? { icon: <CalendarCheck2 className="size-7" />, title: "You're booked", body: "We've sent a confirmation and will remind you before your appointment." }
      : a.status === "requested"
        ? { icon: <Hourglass className="size-7" />, title: "Request sent", body: `${d.businessName} will review your request. We'll notify you as soon as they respond — your time is held meanwhile.` }
        : a.status === "pending_payment"
          ? { icon: <Hourglass className="size-7" />, title: "Finishing up your payment", body: "If you've just paid, this updates automatically in a few seconds. Your time is held while payment completes." }
          : null;

  const googleCalUrl = `https://calendar.google.com/calendar/render?action=TEMPLATE&text=${encodeURIComponent(a.snapshot.serviceName + " — " + d.businessName)}&dates=${gcal(a.startsAt)}/${gcal(a.endsAt)}&details=${encodeURIComponent(`Reference ${a.reference}`)}${a.snapshot.address ? `&location=${encodeURIComponent(a.snapshot.address)}` : ""}`;

  return (
    <div className="mx-auto max-w-2xl px-4 pt-8 sm:px-6">
      <Link href="/bookings" className="text-sm font-medium text-ink-3 hover:text-ink">
        ← All bookings
      </Link>

      {isNew && hero && (
        <section className="mt-6 animate-rise rounded-xl bg-ink px-6 py-8 text-bg" aria-live="polite">
          <div className="flex size-14 items-center justify-center rounded-full bg-bg/10 text-bg">{hero.icon}</div>
          <h1 className="mt-5 font-display text-[40px] leading-none">{hero.title}</h1>
          <p className="mt-3 max-w-md text-[15px] leading-relaxed text-bg/70">{hero.body}</p>
        </section>
      )}

      <section className="mt-6 overflow-hidden rounded-xl border border-line bg-surface">
        <div className="flex items-start justify-between gap-4 p-5 sm:p-6">
          <div className="min-w-0">
            {!isNew && <Badge tone={STATUS_TONE[a.status]}>{STATUS_LABELS[a.status]}</Badge>}
            <h2 className="mt-2 text-2xl font-semibold tracking-[-0.015em] text-ink">{a.snapshot.serviceName}</h2>
            {a.snapshot.options.length > 0 && <p className="mt-1 text-sm text-ink-3">{a.snapshot.options.map((o) => o.name).join(" · ")}</p>}
            <Link href={`/${d.businessSlug}`} className="mt-3 inline-flex items-center gap-2 text-[15px] font-medium text-ink hover:underline">
              <Avatar name={d.businessName} media={d.logo} size={28} />
              {d.businessName}
            </Link>
          </div>
          <div className="shrink-0 rounded-lg border border-line px-3 py-2 text-center">
            <p className="text-[10px] font-semibold uppercase tracking-wide text-ink-3">Ref</p>
            <p className="font-mono text-sm font-semibold text-ink">{a.reference}</p>
          </div>
        </div>
        <dl className="divide-y divide-line border-t border-line text-[15px]">
          <div className="flex items-start gap-3 px-5 py-4 sm:px-6">
            <Clock className="mt-0.5 size-5 shrink-0 text-ink-3" />
            <div>
              <dt className="sr-only">When</dt>
              <dd className="font-medium text-ink">{fmtDateLong(a.startsAt, tz)}</dd>
              <dd className="text-sm text-ink-3">
                {fmtTime(a.startsAt, tz)} – {fmtTime(a.endsAt, tz)} {tzAbbr(a.startsAt, tz)} · {formatDuration(a.snapshot.durationMinutes)}
              </dd>
            </div>
          </div>
          {a.snapshot.memberName && (
            <div className="flex items-start gap-3 px-5 py-4 sm:px-6">
              <Users className="mt-0.5 size-5 shrink-0 text-ink-3" />
              <div>
                <dt className="sr-only">With</dt>
                <dd className="font-medium text-ink">{a.snapshot.memberName}</dd>
              </div>
            </div>
          )}
          <div className="flex items-start gap-3 px-5 py-4 sm:px-6">
            <MapPin className="mt-0.5 size-5 shrink-0 text-ink-3" />
            <div>
              <dt className="sr-only">Where</dt>
              <dd className="font-medium text-ink">{a.snapshot.locationKind === "mobile" ? (a.serviceAddress ?? "At your address") : a.snapshot.locationKind === "virtual" ? "Online" : (a.snapshot.address ?? a.snapshot.locationName ?? d.businessName)}</dd>
              {a.snapshot.locationKind === "virtual" && <dd className="text-sm text-ink-3">The business will send the link before your session.</dd>}
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
          cancel={cancel.allowed ? { allowed: true, summary: cancel.summary, refundCents: cancel.refundCents, keptCents: cancel.keptCents, isLate: cancel.isLate } : { allowed: false, reason: cancel.reason }}
          reschedule={move}
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
          <p className="text-sm font-medium text-ink">Your review</p>
          <Stars value={d.review.rating} className="mt-2" />
          {d.review.body && <p className="mt-2 text-[15px] leading-relaxed text-ink-2">{d.review.body}</p>}
        </section>
      )}

      <section className="mt-8" aria-labelledby="pay-h">
        <h2 id="pay-h" className="mb-3 text-[15px] font-semibold text-ink">
          Payment
        </h2>
        <dl className="space-y-2 text-[15px]">
          {a.snapshot.lines.map((l, i) => (
            <div key={i} className="flex justify-between gap-4 text-ink-2">
              <dt>{l.label}</dt>
              <dd className="tabular">{l.amountCents < 0 ? `−${formatMoney(-l.amountCents, a.currency)}` : formatMoney(l.amountCents, a.currency)}</dd>
            </div>
          ))}
          <div className="flex justify-between gap-4 border-t border-line pt-2.5 font-semibold text-ink">
            <dt>{a.isEstimate ? "Estimated total" : "Total"}</dt>
            <dd className="tabular">{formatMoney(a.totalCents, a.currency)}</dd>
          </div>
          {a.amountPaidCents > 0 && (
            <div className="flex justify-between gap-4 text-sm text-ink-2">
              <dt>Paid</dt>
              <dd className="tabular">{formatMoney(a.amountPaidCents, a.currency)}</dd>
            </div>
          )}
          {a.amountRefundedCents > 0 && (
            <div className="flex justify-between gap-4 text-sm text-accent-text">
              <dt>Refunded</dt>
              <dd className="tabular">{formatMoney(a.amountRefundedCents, a.currency)}</dd>
            </div>
          )}
          {!["cancelled", "declined", "expired"].includes(a.status) && remaining > 0 && (
            <div className="flex justify-between gap-4 text-sm text-ink-3">
              <dt>{a.status === "completed" ? "Balance" : "Due at appointment"}</dt>
              <dd className="tabular">{formatMoney(remaining, a.currency)}</dd>
            </div>
          )}
          {a.tipCents > 0 && (
            <div className="flex justify-between gap-4 text-sm text-ink-2">
              <dt>Tip</dt>
              <dd className="tabular">{formatMoney(a.tipCents, a.currency)}</dd>
            </div>
          )}
        </dl>
      </section>

      <section className="mt-8 rounded-lg bg-surface-2 p-4 text-sm leading-relaxed text-ink-2">
        <p className="mb-1 font-medium text-ink">Cancellation policy</p>
        <p>
          {a.snapshot.cancellationWindowHours > 0 ? `Free cancellation up to ${a.snapshot.cancellationWindowHours} hours before.` : "Free cancellation any time before the appointment."}{" "}
          {a.snapshot.lateCancelFeePercent > 0 && `Later cancellations: ${a.snapshot.lateCancelFeePercent}% of the total.`}{" "}
          {a.snapshot.depositRefundable ? "" : "Deposits are non-refundable."}
        </p>
        {a.cancellationReason && ["cancelled", "declined", "expired"].includes(a.status) && <p className="mt-2 text-ink-3">Note: {a.cancellationReason}</p>}
      </section>

      <p className="mt-8 text-center text-[13px] text-ink-3">
        Problem with this booking?{" "}
        <Link href={`/support?appointment=${a.id}`} className="font-medium text-ink underline underline-offset-4">
          Contact support
        </Link>
      </p>
    </div>
  );
}
