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
import { useLocale, useT } from "@/i18n/client";
import { api, ApiError } from "@/lib/api";
import { fmtDateLong, fmtTime } from "@/lib/format";

export function RescheduleButton({ a, timezone, team, canAll }: { a: { id: string; startsAt: string; serviceId: string; memberId: string | null; locationId: string | null; optionIds: string[] }; timezone: string; team: { id: string; name: string }[]; canAll: boolean }) {
  const router = useRouter();
  const t = useT("pro");
  const { intl } = useLocale();
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
        if (ms == null) throw new ApiError(t("newAppt.errorInvalidTime"), "validation", 422);
        iso = new Date(ms).toISOString();
      }
      await api(`/api/pro/appointments/${a.id}/reschedule`, { body: { start: iso, memberId: memberId === a.memberId ? "same" : memberId, force: mode === "custom" && force } });
      toast.success(t("reschedule.done"), { description: t("controls.notified") });
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
        {t("reschedule.button")}
      </Button>
      <Dialog
        open={open}
        onOpenChange={setOpen}
        title={t("reschedule.title")}
        description={t("reschedule.current", { date: fmtDateLong(a.startsAt, timezone, intl), time: fmtTime(a.startsAt, timezone, intl) })}
        locked={saving}
        footer={
          <>
            <Button variant="ghost" onClick={() => setOpen(false)}>
              {t("dialogs.cancel")}
            </Button>
            <Button onClick={save} loading={saving} disabled={mode === "open" && !start}>
              {t("reschedule.title")}
            </Button>
          </>
        }
      >
        <div className="space-y-5">
          <FormError message={error} />
          {canAll && team.length > 1 && (
            <Field label={t("newAppt.with")}>
              {(p) => (
                <Select {...p} value={memberId} onChange={(e) => { setMemberId(e.target.value); setStart(null); }}>
                  {team.map((tm) => (
                    <option key={tm.id} value={tm.id}>
                      {tm.name}
                    </option>
                  ))}
                </Select>
              )}
            </Field>
          )}
          <Segmented label={t("newAppt.timeMode")} size="sm" value={mode} onChange={setMode} options={[{ value: "open", label: t("newAppt.openTimes") }, { value: "custom", label: t("newAppt.custom") }]} />
          {mode === "open" ? (
            <SlotPicker serviceId={a.serviceId} memberId={memberId} locationId={a.locationId} optionIds={a.optionIds} timezone={timezone} value={start} onChange={setStart} exclude={a.startsAt} endpoint="/api/pro/slots" />
          ) : (
            <div className="space-y-3">
              <div className="grid grid-cols-2 gap-3">
                <Field label={t("dialogs.date")}>{(p) => <Input {...p} type="date" value={date} onChange={(e) => setDate(e.target.value)} />}</Field>
                <Field label={t("reschedule.time")}>{(p) => <Input {...p} type="time" step={300} value={time} onChange={(e) => setTime(e.target.value)} />}</Field>
              </div>
              <Checkbox checked={force} onCheckedChange={setForce} label={t("reschedule.ignoreHours")} description={t("newAppt.outsideHoursHint")} />
            </div>
          )}
        </div>
      </Dialog>
    </>
  );
}

export function RecordPaymentButton({ appointmentId, currency, suggestedCents }: { appointmentId: string; currency: string; suggestedCents: number }) {
  const router = useRouter();
  const t = useT("pro");
  const { intl } = useLocale();
  const [open, setOpen] = useState(false);
  const [amount, setAmount] = useState(suggestedCents > 0 ? (suggestedCents / 100).toFixed(2) : "");
  const [method, setMethod] = useState("card_terminal");
  const [kind, setKind] = useState("balance");
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  async function save() {
    const cents = parseMoneyInput(amount);
    if (!cents) {
      setError(t("payments.errorAmount"));
      return;
    }
    setSaving(true);
    setError(null);
    try {
      await api(`/api/pro/appointments/${appointmentId}/payments`, { body: { amountCents: cents, method, kind } });
      toast.success(t("payments.recorded", { amount: formatMoney(cents, currency, { intl }) }));
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
        {t("payments.record")}
      </Button>
      <Dialog
        open={open}
        onOpenChange={setOpen}
        title={t("payments.title")}
        description={t("payments.description")}
        size="sm"
        locked={saving}
        footer={
          <>
            <Button variant="ghost" onClick={() => setOpen(false)}>
              {t("dialogs.cancel")}
            </Button>
            <Button onClick={save} loading={saving}>
              {t("payments.record")}
            </Button>
          </>
        }
      >
        <div className="space-y-4">
          <FormError message={error} />
          <Field label={t("payments.amount", { currency })}>{(p) => <Input {...p} inputMode="decimal" value={amount} onChange={(e) => setAmount(e.target.value)} autoFocus />}</Field>
          <div className="grid grid-cols-2 gap-3">
            <Field label={t("payments.method")}>
              {(p) => (
                <Select {...p} value={method} onChange={(e) => setMethod(e.target.value)}>
                  {(["card_terminal", "cash", "bank_transfer", "other"] as const).map((v) => (
                    <option key={v} value={v}>
                      {t(`payments.methods.${v}`)}
                    </option>
                  ))}
                </Select>
              )}
            </Field>
            <Field label={t("payments.for")}>
              {(p) => (
                <Select {...p} value={kind} onChange={(e) => setKind(e.target.value)}>
                  {(["balance", "tip", "no_show_fee", "cancellation_fee"] as const).map((v) => (
                    <option key={v} value={v}>
                      {t(`payments.kinds.${v}`)}
                    </option>
                  ))}
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
  const t = useT("pro");
  const [body, setBody] = useState("");
  const [saving, setSaving] = useState(false);
  async function save() {
    if (!body.trim()) return;
    setSaving(true);
    try {
      await api(`/api/pro/customers/${customerId}/notes`, { body: { body } });
      setBody("");
      toast.success(t("notes.saved"));
      router.refresh();
    } catch (err) {
      toast.error((err as ApiError).message);
    } finally {
      setSaving(false);
    }
  }
  return (
    <div className="flex items-end gap-2">
      <Textarea rows={2} value={body} onChange={(e) => setBody(e.target.value)} placeholder={t("notes.placeholder")} aria-label={t("notes.add")} maxLength={2000} className="min-h-11" />
      <Button size="icon" variant="secondary" onClick={save} loading={saving} disabled={!body.trim()} aria-label={t("notes.save")}>
        {!saving && <Send className="size-4" />}
      </Button>
    </div>
  );
}
