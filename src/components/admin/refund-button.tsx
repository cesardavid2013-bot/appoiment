"use client";

import { Undo2 } from "lucide-react";
import { useRouter } from "next/navigation";
import { useState } from "react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Dialog } from "@/components/ui/dialog";
import { Field, FormError, Input, Textarea } from "@/components/ui/field";
import { formatMoney, parseMoneyInput } from "@/domain/money";
import { api, ApiError } from "@/lib/api";

/** Partial (or full) refund of an appointment's online payments, with a required reason. */
export function RefundButton({ appointmentId, refundableCents, currency }: { appointmentId: string; refundableCents: number; currency: string }) {
  const router = useRouter();
  const [open, setOpen] = useState(false);
  const [amount, setAmount] = useState("");
  const [reason, setReason] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [fields, setFields] = useState<Record<string, string>>({});
  const [confirming, setConfirming] = useState(false);

  const cents = parseMoneyInput(amount);

  function change(o: boolean) {
    if (busy) return;
    setOpen(o);
    if (o) {
      setAmount("");
      setReason("");
      setError(null);
      setFields({});
      setConfirming(false);
    }
  }

  function validate() {
    const f: Record<string, string> = {};
    if (cents == null || cents <= 0) f.amountCents = "Enter an amount, e.g. 25.00";
    else if (cents > refundableCents) f.amountCents = `At most ${formatMoney(refundableCents, currency)}`;
    if (reason.trim().length < 3) f.reason = "Add a short reason (at least 3 characters)";
    setFields(f);
    return Object.keys(f).length === 0;
  }

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    setError(null);
    if (!validate()) return;
    if (!confirming) {
      setConfirming(true);
      return;
    }
    setBusy(true);
    try {
      const res = await api<{ requestedCents: number; refundedCents: number; currency: string }>(`/api/admin/appointments/${appointmentId}/refund`, { body: { amountCents: cents, reason: reason.trim() } });
      if (res.refundedCents >= res.requestedCents) toast.success(`Refunded ${formatMoney(res.refundedCents, res.currency)}`);
      else if (res.refundedCents > 0) toast.warning(`Refunded ${formatMoney(res.refundedCents, res.currency)} of ${formatMoney(res.requestedCents, res.currency)}`, { description: "The rest couldn't be processed automatically; the business has been notified." });
      else toast.error("The refund couldn't be processed automatically", { description: "The business has been notified to resolve it. Check the payment provider." });
      setOpen(false);
      router.refresh();
    } catch (err) {
      const e2 = err as ApiError;
      setError(e2.message);
      setConfirming(false);
      if (e2.fields) setFields(e2.fields);
    } finally {
      setBusy(false);
    }
  }

  return (
    <>
      <Button variant="secondary" size="sm" icon={<Undo2 className="size-4" />} onClick={() => change(true)} disabled={refundableCents <= 0} title={refundableCents <= 0 ? "No online payments left to refund" : undefined}>
        Refund
      </Button>
      <Dialog
        open={open}
        onOpenChange={change}
        title="Issue a refund"
        description={`Up to ${formatMoney(refundableCents, currency)} of online payments can be refunded to the customer's card.`}
        size="sm"
        locked={busy}
        footer={
          <>
            <Button variant="ghost" onClick={() => (confirming ? setConfirming(false) : change(false))} disabled={busy}>
              {confirming ? "Back" : "Cancel"}
            </Button>
            <Button type="submit" form="admin-refund-form" loading={busy} className={confirming ? "bg-danger text-white hover:bg-danger/90" : undefined}>
              {confirming && cents ? `Refund ${formatMoney(cents, currency)}` : "Review refund"}
            </Button>
          </>
        }
      >
        <form id="admin-refund-form" onSubmit={submit} className="space-y-4 pt-1" noValidate>
          <FormError message={error} />
          {confirming && cents ? (
            <div role="status" className="rounded-md border border-line bg-surface-2 px-3.5 py-3 text-sm text-ink-2">
              You&apos;re about to refund <strong className="text-ink">{formatMoney(cents, currency)}</strong> to the customer. Refunds can&apos;t be reversed.
              <div className="mt-1 text-[13px] text-ink-3">Reason: {reason.trim()}</div>
            </div>
          ) : (
            <>
              <Field label="Amount" error={fields.amountCents} hint={`Currency: ${currency}`}>
                {(p) => <Input {...p} inputMode="decimal" autoComplete="off" placeholder="0.00" value={amount} onChange={(e) => setAmount(e.target.value)} />}
              </Field>
              <Field label="Reason" error={fields.reason} hint="Recorded on the refund and in the audit log.">
                {(p) => <Textarea {...p} rows={3} maxLength={500} value={reason} onChange={(e) => setReason(e.target.value)} />}
              </Field>
            </>
          )}
        </form>
      </Dialog>
    </>
  );
}
