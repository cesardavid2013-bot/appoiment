"use client";

import { Plus, X } from "lucide-react";
import { ChoiceCard, Switch } from "@/components/ui/controls";
import { Field, FormError, Input, Select, Textarea } from "@/components/ui/field";
import { describeCancellationPolicy } from "@/domain/policies";
import { formatDuration } from "@/domain/money";
import { SettingsCard } from "./settings-shell";
import { SaveBar, useSettingsForm } from "./settings-form";

const NOTICE = [
  [0, "No minimum — book right up to the start"],
  [30, "30 minutes"],
  [60, "1 hour"],
  [120, "2 hours"],
  [240, "4 hours"],
  [720, "12 hours"],
  [1440, "1 day"],
  [2880, "2 days"],
  [10080, "1 week"],
] as const;
const ADVANCE = [7, 14, 21, 30, 60, 90, 180, 365];
const INTERVALS = [5, 10, 15, 20, 30, 45, 60];
const REMINDER_CHOICES = [30, 60, 120, 240, 720, 1440, 2880, 10080];

function reminderLabel(m: number) {
  if (m % 1440 === 0) return m === 1440 ? "1 day before" : `${m / 1440} days before`;
  if (m % 60 === 0) return m === 60 ? "1 hour before" : `${m / 60} hours before`;
  return `${m} minutes before`;
}

type Rules = {
  bookingMode: "instant" | "request";
  minNoticeMinutes: number;
  maxAdvanceDays: number;
  slotIntervalMinutes: number;
  allowAnyStaff: boolean;
  reminderOffsetsMinutes: number[];
};

export function BookingRulesSettings({ initial, teamBusiness, smsEnabled }: { initial: Rules; teamBusiness: boolean; smsEnabled: boolean }) {
  const f = useSettingsForm(initial, "/api/pro/business/booking-rules", "Booking rules updated");
  const v = f.values;
  const unusedReminders = REMINDER_CHOICES.filter((c) => !v.reminderOffsetsMinutes.includes(c));
  return (
    <div className="space-y-6 pb-24">
      <FormError message={f.error} />
      <SettingsCard id="mode-h" title="Confirmation" description="You can still require approval for specific services in the service editor.">
        <div className="grid gap-2" role="radiogroup" aria-labelledby="mode-h">
          <ChoiceCard selected={v.bookingMode === "instant"} onClick={() => f.set("bookingMode", "instant")} title="Instant booking" description="Clients pick a free time and they're booked. Best for most businesses — it's what clients expect." />
          <ChoiceCard selected={v.bookingMode === "request"} onClick={() => f.set("bookingMode", "request")} title="Approve each request" description="Clients send a request; you accept or decline. Unanswered requests expire automatically so nobody waits forever." />
        </div>
      </SettingsCard>

      <SettingsCard id="window-h" title="When clients can book">
        <div className="grid gap-4 sm:grid-cols-2">
          <Field label="Minimum notice" hint="The latest a client can book before a start time.">
            {(p) => (
              <Select {...p} value={v.minNoticeMinutes} onChange={(e) => f.set("minNoticeMinutes", Number(e.target.value))}>
                {[...NOTICE, ...(NOTICE.some(([m]) => m === v.minNoticeMinutes) ? [] : [[v.minNoticeMinutes, formatDuration(v.minNoticeMinutes)] as const])]
                  .sort((a, b) => a[0] - b[0])
                  .map(([m, l]) => (
                    <option key={m} value={m}>
                      {l}
                    </option>
                  ))}
              </Select>
            )}
          </Field>
          <Field label="Book up to" hint="How far ahead your calendar opens.">
            {(p) => (
              <Select {...p} value={v.maxAdvanceDays} onChange={(e) => f.set("maxAdvanceDays", Number(e.target.value))}>
                {[...new Set([...ADVANCE, v.maxAdvanceDays])]
                  .sort((a, b) => a - b)
                  .map((d) => (
                    <option key={d} value={d}>
                      {d === 365 ? "1 year ahead" : `${d} days ahead`}
                    </option>
                  ))}
              </Select>
            )}
          </Field>
        </div>
        <Field label="Start times every" hint="Shorter intervals give clients more choice; longer ones keep your day tidy.">
          {(p) => (
            <Select {...p} value={v.slotIntervalMinutes} onChange={(e) => f.set("slotIntervalMinutes", Number(e.target.value))} className="sm:w-56">
              {INTERVALS.map((i) => (
                <option key={i} value={i}>
                  {i} minutes
                </option>
              ))}
            </Select>
          )}
        </Field>
        {teamBusiness && (
          <Switch
            checked={v.allowAnyStaff}
            onCheckedChange={(on) => f.set("allowAnyStaff", on)}
            label="Offer “Any available professional”"
            description="Shows the most open times and spreads bookings across your team. Turn off if clients must choose a person."
          />
        )}
      </SettingsCard>

      <SettingsCard
        id="rem-h"
        title="Reminders"
        description={`Sent by email${smsEnabled ? " and text message (if the client allows texts)" : ""} before each appointment. Clients who book closer than a reminder's time don't get that one.`}
      >
        {v.reminderOffsetsMinutes.length === 0 ? (
          <p className="text-sm text-ink-3">No reminders. Clients only get their booking confirmation.</p>
        ) : (
          <ul className="divide-y divide-line rounded-lg border border-line">
            {[...v.reminderOffsetsMinutes]
              .sort((a, b) => b - a)
              .map((m) => (
                <li key={m} className="flex items-center justify-between px-4 py-2.5 text-sm text-ink">
                  {reminderLabel(m)}
                  <button type="button" onClick={() => f.set("reminderOffsetsMinutes", v.reminderOffsetsMinutes.filter((x) => x !== m))} className="flex size-9 items-center justify-center rounded-md text-ink-3 hover:bg-surface-2 hover:text-ink" aria-label={`Remove the reminder ${reminderLabel(m)}`}>
                    <X className="size-4" />
                  </button>
                </li>
              ))}
          </ul>
        )}
        {v.reminderOffsetsMinutes.length < 3 && unusedReminders.length > 0 && (
          <label className="flex items-center gap-2 text-sm text-ink-2">
            <Plus className="size-4 text-ink-3" aria-hidden />
            <span className="sr-only">Add a reminder</span>
            <Select value="" onChange={(e) => e.target.value && f.set("reminderOffsetsMinutes", [...v.reminderOffsetsMinutes, Number(e.target.value)])} className="w-52">
              <option value="">Add a reminder…</option>
              {unusedReminders.map((m) => (
                <option key={m} value={m}>
                  {reminderLabel(m)}
                </option>
              ))}
            </Select>
            <span className="text-[13px] text-ink-3">Up to 3</span>
          </label>
        )}
      </SettingsCard>
      <SaveBar dirty={f.dirty} saving={f.saving} onSave={() => f.save()} onDiscard={f.discard} />
    </div>
  );
}

type Policies = {
  cancellationWindowHours: number;
  rescheduleWindowHours: number;
  lateCancelFeePercent: number;
  noShowFeePercent: number;
  depositRefundable: boolean;
  latePolicy: string;
  bookingInstructions: string;
  taxRatePercent: string;
  taxLabel: string;
};

const WINDOWS = [0, 2, 4, 6, 12, 24, 48, 72, 168];
const windowLabel = (h: number) => (h === 0 ? "Any time before" : h % 24 === 0 ? (h === 24 ? "24 hours (1 day) before" : `${h / 24} days before`) : `${h} hours before`);

export function PoliciesSettings({ initial, paymentsEnabled }: { initial: Policies; paymentsEnabled: boolean; currency: string }) {
  const f = useSettingsForm(initial, "/api/pro/business/policies", "Policies updated");
  const v = f.values;
  const taxValid = /^\d{0,2}(\.\d{1,2})?$/.test(v.taxRatePercent.trim() || "0") && Number(v.taxRatePercent || 0) <= 30;
  const preview = describeCancellationPolicy({ cancellationWindowHours: v.cancellationWindowHours, rescheduleWindowHours: v.rescheduleWindowHours, lateCancelFeePercent: v.lateCancelFeePercent, depositRefundable: v.depositRefundable });

  function save() {
    if (!taxValid) return;
    f.save((c) => {
      const body: Record<string, unknown> = { ...c };
      if ("taxRatePercent" in body) {
        body.taxRateBps = Math.round(Number(v.taxRatePercent || 0) * 100);
        delete body.taxRatePercent;
      }
      for (const k of ["latePolicy", "bookingInstructions", "taxLabel"] as const) if (k in body) body[k] = (body[k] as string).trim() || null;
      return body;
    });
  }

  return (
    <div className="space-y-6 pb-24">
      <FormError message={f.error} />
      <SettingsCard id="cancel-h" title="Cancelling and rescheduling">
        <div className="grid gap-4 sm:grid-cols-2">
          <Field label="Free cancellation until">
            {(p) => (
              <Select {...p} value={v.cancellationWindowHours} onChange={(e) => f.set("cancellationWindowHours", Number(e.target.value))}>
                {[...new Set([...WINDOWS, v.cancellationWindowHours])].sort((a, b) => a - b).map((h) => (
                  <option key={h} value={h}>
                    {windowLabel(h)}
                  </option>
                ))}
              </Select>
            )}
          </Field>
          <Field label="Online rescheduling until">
            {(p) => (
              <Select {...p} value={v.rescheduleWindowHours} onChange={(e) => f.set("rescheduleWindowHours", Number(e.target.value))}>
                {[...new Set([...WINDOWS, v.rescheduleWindowHours])].sort((a, b) => a - b).map((h) => (
                  <option key={h} value={h}>
                    {windowLabel(h)}
                  </option>
                ))}
              </Select>
            )}
          </Field>
        </div>
        {v.cancellationWindowHours > 0 && (
          <Field label="Late cancellation fee" hint={paymentsEnabled ? "Kept from what the client paid online. We never charge more than they've paid." : "Only applies to money paid online. Connect payments and take deposits to enforce it."}>
            {(p) => (
              <div className="flex items-center gap-2">
                <Select {...p} value={v.lateCancelFeePercent} onChange={(e) => f.set("lateCancelFeePercent", Number(e.target.value))} className="w-32">
                  {[...new Set([0, 10, 25, 50, 75, 100, v.lateCancelFeePercent])].sort((a, b) => a - b).map((n) => (
                    <option key={n} value={n}>
                      {n === 0 ? "None" : `${n}%`}
                    </option>
                  ))}
                </Select>
                <span className="text-sm text-ink-3">of the total</span>
              </div>
            )}
          </Field>
        )}
        <Field label="No-show fee" hint="Part of your policy so clients know up front. When you mark a no-show, anything they paid online stays with you; a fee collected in person can be recorded on the appointment.">
          {(p) => (
            <div className="flex items-center gap-2">
              <Select {...p} value={v.noShowFeePercent} onChange={(e) => f.set("noShowFeePercent", Number(e.target.value))} className="w-32">
                {[...new Set([0, 25, 50, 75, 100, v.noShowFeePercent])].sort((a, b) => a - b).map((n) => (
                  <option key={n} value={n}>
                    {n === 0 ? "None" : `${n}%`}
                  </option>
                ))}
              </Select>
              <span className="text-sm text-ink-3">of the total</span>
            </div>
          )}
        </Field>
        <Switch checked={v.depositRefundable} onCheckedChange={(on) => f.set("depositRefundable", on)} label="Refund deposits for on-time cancellations" description="Off means deposits are kept whenever a client cancels." />
      </SettingsCard>

      <SettingsCard id="words-h" title="In your own words" description="Optional notes shown with your policy.">
        <Field label="Running late" optional hint="e.g. “After 15 minutes late we may need to shorten or rebook your service.”">
          {(p) => <Textarea {...p} rows={2} value={v.latePolicy} onChange={(e) => f.set("latePolicy", e.target.value)} maxLength={1000} />}
        </Field>
        <Field label="Before your visit" optional hint="Shown to every client before they confirm — directions, what to bring, how to prepare.">
          {(p) => <Textarea {...p} rows={3} value={v.bookingInstructions} onChange={(e) => f.set("bookingInstructions", e.target.value)} maxLength={2000} />}
        </Field>
      </SettingsCard>

      <SettingsCard id="tax-h" title="Sales tax" description="Added on top of your prices at checkout and shown as its own line. Leave at 0 if your prices already include tax.">
        <div className="grid gap-4 sm:grid-cols-2">
          <Field label="Rate" error={!taxValid ? "Enter a rate between 0 and 30%" : f.errors.taxRateBps}>
            {(p) => (
              <div className="flex items-center gap-2">
                <Input {...p} inputMode="decimal" value={v.taxRatePercent} onChange={(e) => f.set("taxRatePercent", e.target.value)} className="w-28" />
                <span className="text-sm text-ink-3">%</span>
              </div>
            )}
          </Field>
          <Field label="Label" optional>
            {(p) => <Input {...p} value={v.taxLabel} onChange={(e) => f.set("taxLabel", e.target.value)} maxLength={40} placeholder="Sales tax" />}
          </Field>
        </div>
      </SettingsCard>

      <section aria-labelledby="preview-h" className="rounded-xl bg-surface-2 px-5 py-4 sm:px-6">
        <h2 id="preview-h" className="text-[12px] font-semibold uppercase tracking-[0.06em] text-ink-3">
          What clients see before booking
        </h2>
        <ul className="mt-2 space-y-1 text-sm leading-relaxed text-ink-2">
          {preview.map((l) => (
            <li key={l}>{l}</li>
          ))}
          {v.noShowFeePercent > 0 && <li>Missed appointments may be charged {v.noShowFeePercent}% of the total.</li>}
          {v.latePolicy.trim() && <li>{v.latePolicy.trim()}</li>}
        </ul>
      </section>
      <SaveBar dirty={f.dirty} saving={f.saving} onSave={save} onDiscard={f.discard} />
    </div>
  );
}
