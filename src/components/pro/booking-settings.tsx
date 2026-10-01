"use client";

import { Plus, X } from "lucide-react";
import { ChoiceCard, Switch } from "@/components/ui/controls";
import { Field, FormError, Input, Select, Textarea } from "@/components/ui/field";
import { describeCancellationPolicy } from "@/domain/policies";
import { formatDuration } from "@/domain/money";
import { useLocale, useT } from "@/i18n/client";
import type { TFunction } from "@/i18n/translate";
import { SettingsCard } from "./settings-shell";
import { SaveBar, useSettingsForm } from "./settings-form";

const NOTICE = [0, 30, 60, 120, 240, 720, 1440, 2880, 10080];
const ADVANCE = [7, 14, 21, 30, 60, 90, 180, 365];
const INTERVALS = [5, 10, 15, 20, 30, 45, 60];
const REMINDER_CHOICES = [30, 60, 120, 240, 720, 1440, 2880, 10080];

/** "30 minutes", "2 hours", "1 day", "1 week" for the notice choices. */
function noticeLabel(t: TFunction, m: number) {
  if (m === 0) return t("booking.window.noMinimum");
  if (m % 10080 === 0) return t("booking.durations.weeks", { count: m / 10080 });
  if (m % 1440 === 0) return t("booking.durations.days", { count: m / 1440 });
  if (m % 60 === 0) return t("booking.durations.hours", { count: m / 60 });
  return t("booking.durations.minutes", { count: m });
}

function reminderLabel(t: TFunction, m: number) {
  if (m % 1440 === 0) return t("booking.reminders.daysBefore", { count: m / 1440 });
  if (m % 60 === 0) return t("booking.reminders.hoursBefore", { count: m / 60 });
  return t("booking.reminders.minutesBefore", { count: m });
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
  const t = useT("proSettings");
  const { intl } = useLocale();
  const f = useSettingsForm(initial, "/api/pro/business/booking-rules", t("booking.toastUpdated"));
  const v = f.values;
  const unusedReminders = REMINDER_CHOICES.filter((c) => !v.reminderOffsetsMinutes.includes(c));
  return (
    <div className="space-y-6 pb-24">
      <FormError message={f.error} />
      <SettingsCard id="mode-h" title={t("booking.mode.title")} description={t("booking.mode.description")}>
        <div className="grid gap-2" role="radiogroup" aria-labelledby="mode-h">
          <ChoiceCard selected={v.bookingMode === "instant"} onClick={() => f.set("bookingMode", "instant")} title={t("booking.mode.instantTitle")} description={t("booking.mode.instantDescription")} />
          <ChoiceCard selected={v.bookingMode === "request"} onClick={() => f.set("bookingMode", "request")} title={t("booking.mode.requestTitle")} description={t("booking.mode.requestDescription")} />
        </div>
      </SettingsCard>

      <SettingsCard id="window-h" title={t("booking.window.title")}>
        <div className="grid gap-4 sm:grid-cols-2">
          <Field label={t("booking.window.minNotice")} hint={t("booking.window.minNoticeHint")}>
            {(p) => (
              <Select {...p} value={v.minNoticeMinutes} onChange={(e) => f.set("minNoticeMinutes", Number(e.target.value))}>
                {[...NOTICE, ...(NOTICE.includes(v.minNoticeMinutes) ? [] : [v.minNoticeMinutes])]
                  .sort((a, b) => a - b)
                  .map((m) => (
                    <option key={m} value={m}>
                      {NOTICE.includes(m) ? noticeLabel(t, m) : formatDuration(m, intl)}
                    </option>
                  ))}
              </Select>
            )}
          </Field>
          <Field label={t("booking.window.advance")} hint={t("booking.window.advanceHint")}>
            {(p) => (
              <Select {...p} value={v.maxAdvanceDays} onChange={(e) => f.set("maxAdvanceDays", Number(e.target.value))}>
                {[...new Set([...ADVANCE, v.maxAdvanceDays])]
                  .sort((a, b) => a - b)
                  .map((d) => (
                    <option key={d} value={d}>
                      {d === 365 ? t("booking.window.yearAhead") : t("booking.window.daysAhead", { count: d })}
                    </option>
                  ))}
              </Select>
            )}
          </Field>
        </div>
        <Field label={t("booking.window.interval")} hint={t("booking.window.intervalHint")}>
          {(p) => (
            <Select {...p} value={v.slotIntervalMinutes} onChange={(e) => f.set("slotIntervalMinutes", Number(e.target.value))} className="sm:w-56">
              {INTERVALS.map((i) => (
                <option key={i} value={i}>
                  {t("booking.durations.minutes", { count: i })}
                </option>
              ))}
            </Select>
          )}
        </Field>
        {teamBusiness && <Switch checked={v.allowAnyStaff} onCheckedChange={(on) => f.set("allowAnyStaff", on)} label={t("booking.window.anyStaff")} description={t("booking.window.anyStaffDescription")} />}
      </SettingsCard>

      <SettingsCard id="rem-h" title={t("booking.reminders.title")} description={smsEnabled ? t("booking.reminders.descriptionSms") : t("booking.reminders.description")}>
        {v.reminderOffsetsMinutes.length === 0 ? (
          <p className="text-sm text-ink-3">{t("booking.reminders.none")}</p>
        ) : (
          <ul className="divide-y divide-line rounded-lg border border-line">
            {[...v.reminderOffsetsMinutes]
              .sort((a, b) => b - a)
              .map((m) => (
                <li key={m} className="flex items-center justify-between px-4 py-2.5 text-sm text-ink">
                  {reminderLabel(t, m)}
                  <button
                    type="button"
                    onClick={() => f.set("reminderOffsetsMinutes", v.reminderOffsetsMinutes.filter((x) => x !== m))}
                    className="flex size-9 items-center justify-center rounded-md text-ink-3 hover:bg-surface-2 hover:text-ink"
                    aria-label={t("booking.reminders.remove", { label: reminderLabel(t, m) })}
                  >
                    <X className="size-4" />
                  </button>
                </li>
              ))}
          </ul>
        )}
        {v.reminderOffsetsMinutes.length < 3 && unusedReminders.length > 0 && (
          <label className="flex items-center gap-2 text-sm text-ink-2">
            <Plus className="size-4 text-ink-3" aria-hidden />
            <span className="sr-only">{t("booking.reminders.add")}</span>
            <Select value="" onChange={(e) => e.target.value && f.set("reminderOffsetsMinutes", [...v.reminderOffsetsMinutes, Number(e.target.value)])} className="w-52">
              <option value="">{t("booking.reminders.addPlaceholder")}</option>
              {unusedReminders.map((m) => (
                <option key={m} value={m}>
                  {reminderLabel(t, m)}
                </option>
              ))}
            </Select>
            <span className="text-[13px] text-ink-3">{t("booking.reminders.upTo")}</span>
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
function windowLabel(t: TFunction, h: number) {
  if (h === 0) return t("policies.cancel.anyTime");
  if (h === 24) return t("policies.cancel.oneDay");
  return h % 24 === 0 ? t("policies.cancel.daysBefore", { count: h / 24 }) : t("policies.cancel.hoursBefore", { count: h });
}

export function PoliciesSettings({ initial, paymentsEnabled }: { initial: Policies; paymentsEnabled: boolean; currency: string }) {
  const t = useT("proSettings");
  const rootT = useT();
  const { intl } = useLocale();
  const f = useSettingsForm(initial, "/api/pro/business/policies", t("policies.toastUpdated"));
  const v = f.values;
  const taxValid = /^\d{0,2}(\.\d{1,2})?$/.test(v.taxRatePercent.trim() || "0") && Number(v.taxRatePercent || 0) <= 30;
  const preview = describeCancellationPolicy({ cancellationWindowHours: v.cancellationWindowHours, rescheduleWindowHours: v.rescheduleWindowHours, lateCancelFeePercent: v.lateCancelFeePercent, depositRefundable: v.depositRefundable }, rootT);
  const percent = (n: number) => (n === 0 ? t("policies.cancel.none") : new Intl.NumberFormat(intl, { style: "percent" }).format(n / 100));

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
      <SettingsCard id="cancel-h" title={t("policies.cancel.title")}>
        <div className="grid gap-4 sm:grid-cols-2">
          <Field label={t("policies.cancel.freeUntil")}>
            {(p) => (
              <Select {...p} value={v.cancellationWindowHours} onChange={(e) => f.set("cancellationWindowHours", Number(e.target.value))}>
                {[...new Set([...WINDOWS, v.cancellationWindowHours])]
                  .sort((a, b) => a - b)
                  .map((h) => (
                    <option key={h} value={h}>
                      {windowLabel(t, h)}
                    </option>
                  ))}
              </Select>
            )}
          </Field>
          <Field label={t("policies.cancel.rescheduleUntil")}>
            {(p) => (
              <Select {...p} value={v.rescheduleWindowHours} onChange={(e) => f.set("rescheduleWindowHours", Number(e.target.value))}>
                {[...new Set([...WINDOWS, v.rescheduleWindowHours])]
                  .sort((a, b) => a - b)
                  .map((h) => (
                    <option key={h} value={h}>
                      {windowLabel(t, h)}
                    </option>
                  ))}
              </Select>
            )}
          </Field>
        </div>
        {v.cancellationWindowHours > 0 && (
          <Field label={t("policies.cancel.lateFee")} hint={paymentsEnabled ? t("policies.cancel.lateFeeHintPaid") : t("policies.cancel.lateFeeHintUnpaid")}>
            {(p) => (
              <div className="flex items-center gap-2">
                <Select {...p} value={v.lateCancelFeePercent} onChange={(e) => f.set("lateCancelFeePercent", Number(e.target.value))} className="w-32">
                  {[...new Set([0, 10, 25, 50, 75, 100, v.lateCancelFeePercent])]
                    .sort((a, b) => a - b)
                    .map((n) => (
                      <option key={n} value={n}>
                        {percent(n)}
                      </option>
                    ))}
                </Select>
                <span className="text-sm text-ink-3">{t("policies.cancel.ofTotal")}</span>
              </div>
            )}
          </Field>
        )}
        <Field label={t("policies.cancel.noShowFee")} hint={t("policies.cancel.noShowHint")}>
          {(p) => (
            <div className="flex items-center gap-2">
              <Select {...p} value={v.noShowFeePercent} onChange={(e) => f.set("noShowFeePercent", Number(e.target.value))} className="w-32">
                {[...new Set([0, 25, 50, 75, 100, v.noShowFeePercent])]
                  .sort((a, b) => a - b)
                  .map((n) => (
                    <option key={n} value={n}>
                      {percent(n)}
                    </option>
                  ))}
              </Select>
              <span className="text-sm text-ink-3">{t("policies.cancel.ofTotal")}</span>
            </div>
          )}
        </Field>
        <Switch checked={v.depositRefundable} onCheckedChange={(on) => f.set("depositRefundable", on)} label={t("policies.cancel.refundDeposits")} description={t("policies.cancel.refundDepositsDescription")} />
      </SettingsCard>

      <SettingsCard id="words-h" title={t("policies.words.title")} description={t("policies.words.description")}>
        <Field label={t("policies.words.late")} optional hint={t("policies.words.lateHint")}>
          {(p) => <Textarea {...p} rows={2} value={v.latePolicy} onChange={(e) => f.set("latePolicy", e.target.value)} maxLength={1000} />}
        </Field>
        <Field label={t("policies.words.before")} optional hint={t("policies.words.beforeHint")}>
          {(p) => <Textarea {...p} rows={3} value={v.bookingInstructions} onChange={(e) => f.set("bookingInstructions", e.target.value)} maxLength={2000} />}
        </Field>
      </SettingsCard>

      <SettingsCard id="tax-h" title={t("policies.tax.title")} description={t("policies.tax.description")}>
        <div className="grid gap-4 sm:grid-cols-2">
          <Field label={t("policies.tax.rate")} error={!taxValid ? t("policies.tax.rateError") : f.errors.taxRateBps}>
            {(p) => (
              <div className="flex items-center gap-2">
                <Input {...p} inputMode="decimal" value={v.taxRatePercent} onChange={(e) => f.set("taxRatePercent", e.target.value)} className="w-28" />
                <span className="text-sm text-ink-3">%</span>
              </div>
            )}
          </Field>
          <Field label={t("policies.tax.label")} optional>
            {(p) => <Input {...p} value={v.taxLabel} onChange={(e) => f.set("taxLabel", e.target.value)} maxLength={40} placeholder={t("policies.tax.labelPlaceholder")} />}
          </Field>
        </div>
      </SettingsCard>

      <section aria-labelledby="preview-h" className="rounded-xl bg-surface-2 px-5 py-4 sm:px-6">
        <h2 id="preview-h" className="text-[12px] font-semibold uppercase tracking-[0.06em] text-ink-3">
          {t("policies.preview.title")}
        </h2>
        <ul className="mt-2 space-y-1 text-sm leading-relaxed text-ink-2">
          {preview.map((l) => (
            <li key={l}>{l}</li>
          ))}
          {v.noShowFeePercent > 0 && <li>{rootT("profile.about.noShow", { percent: v.noShowFeePercent })}</li>}
          {v.latePolicy.trim() && <li>{v.latePolicy.trim()}</li>}
        </ul>
      </section>
      <SaveBar dirty={f.dirty} saving={f.saving} onSave={save} onDiscard={f.discard} />
    </div>
  );
}
