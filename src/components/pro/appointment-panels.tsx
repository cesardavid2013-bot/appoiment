"use client";

import { CalendarClock, CreditCard, Send } from "lucide-react";
import { useRouter } from "next/navigation";
import { useState } from "react";
import { toast } from "sonner";
import { SlotPicker } from "@/components/booking/slot-picker";
import { Button } from "@/components/ui/button";
import { Checkbox, Segmented } from "@/components/ui/controls";
import { Dialog } from "@/components/ui/dialog";
import { Field, FormError, Input, Select, Textarea } from "@/components/ui/field";
import { formatMoney, parseMoneyInput } from "@/domain/money";
import { clockToMinutes, localMinuteToInstant } from "@/domain/time";
import { api, ApiError } from "@/lib/api";
import { fmtDateLong, fmtTime } from "@/lib/format";

export function RescheduleButton({ a, timezone, team, canAll }: { a: { id: string; startsAt: string; serviceId: string; memberId: string | null; locationId: string | null; optionIds: string[] }; timezone: string; team: { id: string; name: string }[]; canAll: boolean }) {
  const router = useRouter();
  const [open, setOpen] = useState(false);
  const [mode, setMode] = useState<"open" | "custom">("open");
  const [memberId, setMemberId] = useState(a.memberId ?? team[0]?.id ?? "");
  const [start, setStart] = useState<string | null>(null);
  const [date, setDate] = useState(new Intl.DateTimeFormat("en-CA", { timeZone: timezone }).format(new Date(a.startsAt)));
  const [time, setTime] = useState(new Intl.DateTimeFormat("en-GB", { hour: "2-digit", minute: "2-digit", hourCycle: "h23", timeZone: timezone }).format(new Date(a.startsAt)));
  const [force, setForce] = useState(false);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  async function save() {
    setSaving(true);
    setError(null);
    try {
      let iso = start;
      if (mode === "custom") {
        const ms = localMinuteToInstant(date, clockToMinutes(time) ?? -1, timezone);
        if (ms == null) throw new ApiError("Choose a valid date and time.", "validation", 422);
        iso = new Date(ms).toISOString();
      }
      await api(`/api/pro/appointments/${a.id}/reschedule`, { body: { start: iso, memberId: memberId === a.memberId ? "same" : memberId, force: mode === "custom" && force } });
      toast.success("Appointment moved", { description: "The customer has been notified." });
      setOpen(false);
      router.refresh();
    } catch (err) {
      setError((err as ApiError).message);
    } finally {
      setSaving(false);
    }
  }
  return (
    <>
      <Button variant="secondary" size="sm" onClick={() => setOpen(true)} icon={<CalendarClock className="size-4" />}>
        Reschedule
      </Button>
      <Dialog
        open={open}
        onOpenChange={setOpen}
        title="Move appointment"
        description={`Currently ${fmtDateLong(a.startsAt, timezone)} at ${fmtTime(a.startsAt, timezone)}`}
        locked={saving}
        footer={
          <>
            <Button variant="ghost" onClick={() => setOpen(false)}>
              Cancel
            </Button>
            <Button onClick={save} loading={saving} disabled={mode === "open" && !start}>
              Move appointment
            </Button>
          </>
        }
      >
        <div className="space-y-5">
          <FormError message={error} />
          {canAll && team.length > 1 && (
            <Field label="With">
              {(p) => (
                <Select {...p} value={memberId} onChange={(e) => { setMemberId(e.target.value); setStart(null); }}>
                  {team.map((t) => (
                    <option key={t.id} value={t.id}>
                      {t.name}
                    </option>
                  ))}
                </Select>
              )}
            </Field>
          )}
          <Segmented label="Time mode" size="sm" value={mode} onChange={setMode} options={[{ value: "open", label: "Open times" }, { value: "custom", label: "Custom" }]} />
          {mode === "open" ? (
            <SlotPicker serviceId={a.serviceId} memberId={memberId} locationId={a.locationId} optionIds={a.optionIds} timezone={timezone} value={start} onChange={setStart} exclude={a.startsAt} endpoint="/api/pro/slots" />
          ) : (
            <div className="space-y-3">
              <div className="grid grid-cols-2 gap-3">
                <Field label="Date">{(p) => <Input {...p} type="date" value={date} onChange={(e) => setDate(e.target.value)} />}</Field>
                <Field label="Time">{(p) => <Input {...p} type="time" step={300} value={time} onChange={(e) => setTime(e.target.value)} />}</Field>
              </div>
              <Checkbox checked={force} onCheckedChange={setForce} label="Ignore working hours" description="Still never overlaps another appointment." />
            </div>
          )}
        </div>
      </Dialog>
    </>
  );
}

export function RecordPaymentButton({ appointmentId, currency, suggestedCents }: { appointmentId: string; currency: string; suggestedCents: number }) {
  const router = useRouter();
  const [open, setOpen] = useState(false);
  const [amount, setAmount] = useState(suggestedCents > 0 ? (suggestedCents / 100).toFixed(2) : "");
  const [method, setMethod] = useState("card_terminal");
  const [kind, setKind] = useState("balance");
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  async function save() {
    const cents = parseMoneyInput(amount);
    if (!cents) {
      setError("Enter an amount.");
      return;
    }
    setSaving(true);
    setError(null);
    try {
      await api(`/api/pro/appointments/${appointmentId}/payments`, { body: { amountCents: cents, method, kind } });
      toast.success(`${formatMoney(cents, currency)} recorded`);
      setOpen(false);
      router.refresh();
    } catch (err) {
      setError((err as ApiError).message);
    } finally {
      setSaving(false);
    }
  }
  return (
    <>
      <Button variant="secondary" size="sm" onClick={() => setOpen(true)} icon={<CreditCard className="size-4" />}>
        Record payment
      </Button>
      <Dialog
        open={open}
        onOpenChange={setOpen}
        title="Record a payment"
        description="For payments taken outside Kept — cash, your card reader or a transfer."
        size="sm"
        locked={saving}
        footer={
          <>
            <Button variant="ghost" onClick={() => setOpen(false)}>
              Cancel
            </Button>
            <Button onClick={save} loading={saving}>
              Record payment
            </Button>
          </>
        }
      >
        <div className="space-y-4">
          <FormError message={error} />
          <Field label={`Amount (${currency})`}>{(p) => <Input {...p} inputMode="decimal" value={amount} onChange={(e) => setAmount(e.target.value)} autoFocus />}</Field>
          <div className="grid grid-cols-2 gap-3">
            <Field label="Method">
              {(p) => (
                <Select {...p} value={method} onChange={(e) => setMethod(e.target.value)}>
                  <option value="card_terminal">Card reader</option>
                  <option value="cash">Cash</option>
                  <option value="bank_transfer">Bank transfer</option>
                  <option value="other">Other</option>
                </Select>
              )}
            </Field>
            <Field label="For">
              {(p) => (
                <Select {...p} value={kind} onChange={(e) => setKind(e.target.value)}>
                  <option value="balance">Service</option>
                  <option value="tip">Tip</option>
                  <option value="no_show_fee">No-show fee</option>
                  <option value="cancellation_fee">Cancellation fee</option>
                </Select>
              )}
            </Field>
          </div>
        </div>
      </Dialog>
    </>
  );
}

export function QuickNote({ customerId }: { customerId: string }) {
  const router = useRouter();
  const [body, setBody] = useState("");
  const [saving, setSaving] = useState(false);
  async function save() {
    if (!body.trim()) return;
    setSaving(true);
    try {
      await api(`/api/pro/customers/${customerId}/notes`, { body: { body } });
      setBody("");
      toast.success("Note saved");
      router.refresh();
    } catch (err) {
      toast.error((err as ApiError).message);
    } finally {
      setSaving(false);
    }
  }
  return (
    <div className="flex items-end gap-2">
      <Textarea rows={2} value={body} onChange={(e) => setBody(e.target.value)} placeholder="Formulas, preferences, reminders for next time…" aria-label="Add an internal note" maxLength={2000} className="min-h-11" />
      <Button size="icon" variant="secondary" onClick={save} loading={saving} disabled={!body.trim()} aria-label="Save note">
        {!saving && <Send className="size-4" />}
      </Button>
    </div>
  );
}
