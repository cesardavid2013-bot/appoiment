"use client";

import { Checkbox, ChoiceCard } from "@/components/ui/controls";
import { Field, Input, Textarea } from "@/components/ui/field";
import type { FormField } from "@/domain/forms";
import { useT } from "@/i18n/client";

/**
 * One intake question exactly as clients see it while booking. Shared by the
 * booking flow and the form builder's preview so the two can't drift apart.
 */
export function IntakeField({ field: f, value, onChange, error }: { field: FormField; value: unknown; onChange: (v: unknown) => void; error?: string }) {
  const t = useT("booking.intake");
  if (f.type === "yes_no")
    return (
      <fieldset>
        <legend className="mb-2 text-sm font-medium text-ink">
          {f.label} {!f.required && <span className="font-normal text-ink-3">{t("optional")}</span>}
        </legend>
        {f.helpText && <p className="-mt-1 mb-2 text-[13px] text-ink-3">{f.helpText}</p>}
        <div className="grid max-w-xs grid-cols-2 gap-2">
          {[true, false].map((v) => (
            <ChoiceCard key={String(v)} selected={value === v} onClick={() => onChange(v)} title={v ? t("yes") : t("no")} />
          ))}
        </div>
        {error && <p className="mt-1.5 text-[13px] text-danger">{error}</p>}
      </fieldset>
    );
  if (f.type === "single_choice" || f.type === "multi_choice") {
    const multi = f.type === "multi_choice";
    const arr = Array.isArray(value) ? (value as string[]) : [];
    return (
      <fieldset>
        <legend className="mb-2 text-sm font-medium text-ink">
          {f.label} {!f.required && <span className="font-normal text-ink-3">{t("optional")}</span>}
        </legend>
        {f.helpText && <p className="-mt-1 mb-2 text-[13px] text-ink-3">{f.helpText}</p>}
        <div className="grid gap-2 sm:grid-cols-2">
          {(f.options ?? []).map((o) => (
            <ChoiceCard
              key={o}
              role={multi ? "checkbox" : "radio"}
              selected={multi ? arr.includes(o) : value === o}
              onClick={() => onChange(multi ? (arr.includes(o) ? arr.filter((x) => x !== o) : [...arr, o]) : o)}
              title={o}
            />
          ))}
        </div>
        {error && <p className="mt-1.5 text-[13px] text-danger">{error}</p>}
      </fieldset>
    );
  }
  if (f.type === "acknowledgement")
    return (
      <div>
        <Checkbox checked={value === true} onCheckedChange={(v) => onChange(v)} label={f.label} description={f.helpText} />
        {error && <p className="mt-1 text-[13px] text-danger">{error}</p>}
      </div>
    );
  return (
    <Field label={f.label} hint={f.helpText} error={error} optional={!f.required}>
      {(p) =>
        f.type === "long_text" ? (
          <Textarea {...p} rows={4} value={(value as string) ?? ""} onChange={(e) => onChange(e.target.value)} maxLength={3000} />
        ) : (
          <Input {...p} type={f.type === "date" ? "date" : "text"} value={(value as string) ?? ""} onChange={(e) => onChange(e.target.value)} maxLength={300} />
        )
      }
    </Field>
  );
}
