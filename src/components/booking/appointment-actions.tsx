"use client";

import { CalendarPlus, MessageCircle, Navigation, Repeat, Star, XCircle, CalendarClock, CreditCard } from "lucide-react";
import dynamic from "next/dynamic";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { useState } from "react";
import { toast } from "sonner";
import { Button, ButtonLink } from "@/components/ui/button";
import { ConfirmDialog, Dialog } from "@/components/ui/dialog";
import { Field, FormError, Textarea } from "@/components/ui/field";
import { formatMoney } from "@/domain/money";
import { api, ApiError } from "@/lib/api";
import { cn } from "@/lib/cn";
import { fmtDateLong, fmtTime } from "@/lib/format";
import { SlotPicker } from "./slot-picker";
import { useNow } from "@/lib/use-now";

const StripeCheckout = dynamic(() => import("./stripe-checkout"), { ssr: false });

export type ActionAppointment = {
  id: string;
  status: string;
  startsAt: string;
  timezone: string;
  serviceId: string;
  memberId: string | null;
  locationId: string | null;
  optionIds: string[];
  businessId: string;
  businessSlug: string;
  businessName: string;
  currency: string;
  address: string | null;
  lat: number | null;
  lng: number | null;
  needsPayment: boolean;
  amountDue: number;
};

export function AppointmentActions({
  a,
  cancel,
  reschedule,
  canReview,
  googleCalUrl,
}: {
  a: ActionAppointment;
  cancel: { allowed: boolean; reason?: string; summary?: string; refundCents?: number; keptCents?: number; isLate?: boolean };
  reschedule: { allowed: boolean; reason?: string };
  canReview: boolean;
  googleCalUrl: string;
}) {
  const router = useRouter();
  const [cancelOpen, setCancelOpen] = useState(false);
  const [reason, setReason] = useState("");
  const [cancelling, setCancelling] = useState(false);
  const [moveOpen, setMoveOpen] = useState(false);
  const [newStart, setNewStart] = useState<string | null>(null);
  const [moving, setMoving] = useState(false);
  const [moveError, setMoveError] = useState<string | null>(null);
  const [checkout, setCheckout] = useState<{ clientSecret: string; publishableKey: string } | null>(null);
  const [paying, setPaying] = useState(false);
  const now = useNow();
  const upcoming = ["confirmed", "requested", "pending_payment", "checked_in"].includes(a.status) && new Date(a.startsAt).getTime() > now - 3600_000;

  async function doCancel() {
    setCancelling(true);
    try {
      const res = await api<{ refundCents: number }>(`/api/bookings/${a.id}/cancel`, { body: { reason: reason.trim() || null } });
      toast.success("Appointment cancelled", { description: res.refundCents > 0 ? `A refund of ${formatMoney(res.refundCents, a.currency)} is on its way.` : undefined });
      setCancelOpen(false);
      router.refresh();
    } catch (err) {
      toast.error((err as ApiError).message);
    } finally {
      setCancelling(false);
    }
  }

  async function doMove() {
    if (!newStart) return;
    setMoving(true);
    setMoveError(null);
    try {
      await api(`/api/bookings/${a.id}/reschedule`, { body: { start: newStart, memberId: "same" } });
      toast.success("Rescheduled", { description: `${fmtDateLong(newStart, a.timezone)} at ${fmtTime(newStart, a.timezone)}` });
      setMoveOpen(false);
      router.refresh();
    } catch (err) {
      setMoveError((err as ApiError).message);
    } finally {
      setMoving(false);
    }
  }

  async function pay() {
    setPaying(true);
    try {
      setCheckout(await api(`/api/bookings/${a.id}/pay`, { method: "POST", body: {} }));
    } catch (err) {
      toast.error((err as ApiError).message);
    } finally {
      setPaying(false);
    }
  }

  const directions = a.lat != null ? `https://www.google.com/maps/dir/?api=1&destination=${a.lat},${a.lng}` : a.address ? `https://www.google.com/maps/dir/?api=1&destination=${encodeURIComponent(a.address)}` : null;

  return (
    <div className="space-y-6">
      {a.needsPayment && a.status === "pending_payment" && (
        <Button size="lg" className="w-full" onClick={pay} loading={paying} icon={<CreditCard className="size-4" />}>
          Pay {formatMoney(a.amountDue, a.currency)} to confirm
        </Button>
      )}
      <div className="grid grid-cols-2 gap-2 sm:grid-cols-4">
        {upcoming && (
          <>
            <ActionTile href={`/api/bookings/${a.id}/ics`} icon={<CalendarPlus />} label="Add to calendar" download />
            {directions && <ActionTile href={directions} icon={<Navigation />} label="Directions" external />}
          </>
        )}
        <ActionTile href={`/messages?business=${a.businessId}`} icon={<MessageCircle />} label="Message" onClick={() => router.push(`/messages/new?business=${a.businessId}&appointment=${a.id}`)} />
        {!upcoming && <ActionTile href={`/${a.businessSlug}/book?service=${a.serviceId}`} icon={<Repeat />} label="Book again" />}
        {upcoming && <ActionTile href={googleCalUrl} icon={<CalendarClock />} label="Google Calendar" external />}
      </div>

      {canReview && (
        <ButtonLink href={`/bookings/${a.id}?review=1`} variant="primary" size="lg" className="w-full" icon={<Star className="size-4" />}>
          Leave a review
        </ButtonLink>
      )}

      {upcoming && (
        <div className="flex flex-col gap-2 border-t border-line pt-5 sm:flex-row">
          {reschedule.allowed ? (
            <Button variant="secondary" className="flex-1" onClick={() => setMoveOpen(true)} icon={<CalendarClock className="size-4" />}>
              Reschedule
            </Button>
          ) : null}
          {cancel.allowed ? (
            <Button variant="danger" className="flex-1" onClick={() => setCancelOpen(true)} icon={<XCircle className="size-4" />}>
              Cancel appointment
            </Button>
          ) : null}
        </div>
      )}
      {upcoming && (!reschedule.allowed || !cancel.allowed) && (
        <p className="text-[13px] leading-relaxed text-ink-3">{!reschedule.allowed ? reschedule.reason : cancel.reason}</p>
      )}

      <ConfirmDialog
        open={cancelOpen}
        onOpenChange={setCancelOpen}
        title="Cancel this appointment?"
        description={cancel.isLate ? "You're inside the business's cancellation window." : undefined}
        confirmLabel="Cancel appointment"
        onConfirm={doCancel}
        loading={cancelling}
      >
        <div className="space-y-4">
          {cancel.summary && (
            <div className={cn("rounded-md px-3.5 py-3 text-sm", cancel.keptCents ? "bg-warn-soft text-warn" : "bg-surface-2 text-ink-2")}>
              {cancel.summary}
              {cancel.refundCents ? ` Refund: ${formatMoney(cancel.refundCents, a.currency)}.` : ""}
              {cancel.keptCents ? ` Kept by the business: ${formatMoney(cancel.keptCents, a.currency)}.` : ""}
            </div>
          )}
          <Field label="Reason" optional hint="Shared with the business.">
            {(p) => <Textarea {...p} rows={2} value={reason} onChange={(e) => setReason(e.target.value)} maxLength={500} />}
          </Field>
        </div>
      </ConfirmDialog>

      <Dialog
        open={moveOpen}
        onOpenChange={setMoveOpen}
        title="Choose a new time"
        description={`Currently ${fmtDateLong(a.startsAt, a.timezone)} at ${fmtTime(a.startsAt, a.timezone)}`}
        locked={moving}
        footer={
          <>
            <Button variant="ghost" onClick={() => setMoveOpen(false)} disabled={moving}>
              Keep current time
            </Button>
            <Button onClick={doMove} loading={moving} disabled={!newStart}>
              {newStart ? `Move to ${fmtTime(newStart, a.timezone)}` : "Choose a time"}
            </Button>
          </>
        }
      >
        <FormError message={moveError} />
        <div className="mt-2">
          {moveOpen && (
            <SlotPicker serviceId={a.serviceId} memberId={a.memberId ?? "any"} locationId={a.locationId} optionIds={a.optionIds} timezone={a.timezone} value={newStart} onChange={setNewStart} exclude={a.startsAt} />
          )}
        </div>
      </Dialog>

      {checkout && (
        <StripeCheckout
          clientSecret={checkout.clientSecret}
          publishableKey={checkout.publishableKey}
          amountLabel={formatMoney(a.amountDue, a.currency)}
          returnUrl={`${window.location.origin}/bookings/${a.id}?new=1`}
          onClose={() => setCheckout(null)}
        />
      )}
    </div>
  );
}

function ActionTile({ href, icon, label, external, download, onClick }: { href: string; icon: React.ReactNode; label: string; external?: boolean; download?: boolean; onClick?: () => void }) {
  const cls = "flex h-[76px] flex-col items-center justify-center gap-1.5 rounded-lg border border-line bg-surface text-[13px] font-medium text-ink transition-colors hover:border-line-strong hover:bg-surface-2 [&_svg]:size-5 [&_svg]:text-ink-2";
  if (onClick)
    return (
      <button type="button" onClick={onClick} className={cls}>
        {icon}
        {label}
      </button>
    );
  if (external || download)
    return (
      <a href={href} className={cls} {...(external ? { target: "_blank", rel: "noopener noreferrer" } : { download: true })}>
        {icon}
        {label}
      </a>
    );
  return (
    <Link href={href} className={cls}>
      {icon}
      {label}
    </Link>
  );
}

export function ReviewForm({ appointmentId, businessName }: { appointmentId: string; businessName: string }) {
  const router = useRouter();
  const [rating, setRating] = useState(0);
  const [hover, setHover] = useState(0);
  const [body, setBody] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);
  const labels = ["", "Poor", "Fair", "Good", "Great", "Excellent"];
  async function submit() {
    setSaving(true);
    setError(null);
    try {
      await api("/api/reviews", { body: { appointmentId, rating, body: body.trim() || null } });
      toast.success("Thanks for your review");
      router.replace(`/bookings/${appointmentId}`);
      router.refresh();
    } catch (err) {
      setError((err as ApiError).message);
      setSaving(false);
    }
  }
  return (
    <section className="rounded-xl border border-line bg-surface p-5" aria-labelledby="review-h">
      <h2 id="review-h" className="text-[17px] font-semibold text-ink">
        How was {businessName}?
      </h2>
      <p className="mt-1 text-sm text-ink-3">Your review is public and marked as a verified booking.</p>
      <div className="mt-4 flex items-center gap-1" role="radiogroup" aria-label="Rating" onMouseLeave={() => setHover(0)}>
        {[1, 2, 3, 4, 5].map((n) => (
          <button key={n} type="button" role="radio" aria-checked={rating === n} aria-label={`${n} star${n > 1 ? "s" : ""}`} onClick={() => setRating(n)} onMouseEnter={() => setHover(n)} className="p-1">
            <Star className={cn("size-8 transition-colors", (hover || rating) >= n ? "fill-ink text-ink" : "text-line-strong")} />
          </button>
        ))}
        <span className="ms-2 text-sm font-medium text-ink-2">{labels[hover || rating]}</span>
      </div>
      <div className="mt-4">
        <Field label="Tell others about your visit" optional>
          {(p) => <Textarea {...p} rows={4} value={body} onChange={(e) => setBody(e.target.value)} maxLength={2000} placeholder="What stood out? Would you recommend them?" />}
        </Field>
      </div>
      <FormError message={error} />
      <Button className="mt-4" onClick={submit} disabled={rating === 0} loading={saving}>
        Post review
      </Button>
    </section>
  );
}
