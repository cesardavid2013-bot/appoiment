"use client";

import { useRouter } from "next/navigation";
import { useState, type FormEvent } from "react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Field, FormError, Input, Select, Textarea } from "@/components/ui/field";
import { MAX_TICKET_ATTACHMENTS, SUPPORT_CATEGORY_KEYS, type SupportCategory } from "@/domain/support";
import { useLocale, useT } from "@/i18n/client";
import { api, ApiError } from "@/lib/api";
import { fmtDate, fmtTime } from "@/lib/format";
import { AttachmentPicker, type Attachment } from "./attachment-picker";

export type AttachableAppointment = { id: string; reference: string; startsAt: string; timezone: string; serviceName: string; businessName: string };

export function TicketForm({ appointments, initialAppointmentId, initialCategory }: { appointments: AttachableAppointment[]; initialAppointmentId: string | null; initialCategory: SupportCategory | null }) {
  const router = useRouter();
  const t = useT("support");
  const { intl } = useLocale();
  const [category, setCategory] = useState<SupportCategory | "">(initialCategory ?? (initialAppointmentId ? "booking" : ""));
  const [appointmentId, setAppointmentId] = useState(initialAppointmentId ?? "");
  const [subject, setSubject] = useState("");
  const [body, setBody] = useState("");
  const [files, setFiles] = useState<Attachment[]>([]);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [fields, setFields] = useState<Record<string, string>>({});
  const uploading = files.some((f) => !f.id);

  async function onSubmit(e: FormEvent) {
    e.preventDefault();
    const local: Record<string, string> = {};
    if (!category) local.category = t("form.chooseTopic");
    if (subject.trim().length < 4) local.subject = t("form.addSubject");
    if (body.trim().length < 10) local.body = t("form.moreDetail");
    setFields(local);
    setError(null);
    if (Object.keys(local).length) return;
    setSaving(true);
    try {
      const res = await api<{ id: string }>("/api/support", {
        body: { category, subject, body, appointmentId: appointmentId || null, mediaIds: files.map((f) => f.id).filter(Boolean) },
      });
      toast.success(t("form.sent"), { description: t("ticket.willReply") });
      router.push(`/support/${res.id}`);
    } catch (err) {
      const e2 = err as ApiError;
      setFields(e2.fields ?? {});
      setError(e2.fields ? t("form.checkFields") : e2.message);
      setSaving(false);
    }
  }

  const selected = appointments.find((a) => a.id === appointmentId);

  return (
    <form onSubmit={onSubmit} noValidate className="space-y-5">
      <FormError message={error} />
      <Field label={t("form.topic")} error={fields.category} hint={category ? t(`categories.${category}.hint`) : undefined}>
        {(p) => (
          <Select {...p} value={category} onChange={(e) => setCategory(e.target.value as SupportCategory)} required>
            <option value="" disabled>
              {t("form.chooseTopic")}
            </option>
            {SUPPORT_CATEGORY_KEYS.map((k) => (
              <option key={k} value={k}>
                {t(`categories.${k}.label`)}
              </option>
            ))}
          </Select>
        )}
      </Field>

      {appointments.length > 0 && (
        <Field label={t("form.related")} optional error={fields.appointmentId} hint={selected ? t("form.refHint", { reference: selected.reference, business: selected.businessName }) : t("form.linkHint")}>
          {(p) => (
            <Select {...p} value={appointmentId} onChange={(e) => setAppointmentId(e.target.value)}>
              <option value="">{t("form.none")}</option>
              {appointments.map((a) => (
                <option key={a.id} value={a.id}>
                  {t("form.appointmentOption", { date: fmtDate(a.startsAt, a.timezone, { month: "short", day: "numeric" }, intl), time: fmtTime(a.startsAt, a.timezone, intl), service: a.serviceName, business: a.businessName })}
                </option>
              ))}
            </Select>
          )}
        </Field>
      )}

      <Field label={t("form.subject")} error={fields.subject}>
        {(p) => <Input {...p} value={subject} onChange={(e) => setSubject(e.target.value)} maxLength={140} placeholder={t("form.subjectPlaceholder")} required />}
      </Field>

      <Field label={t("form.details")} error={fields.body} hint={t("form.detailsHint")}>
        {(p) => <Textarea {...p} rows={6} value={body} onChange={(e) => setBody(e.target.value)} maxLength={5000} required />}
      </Field>

      <div className="space-y-1.5">
        <p className="flex items-baseline justify-between text-sm font-medium text-ink">
          {t("form.images")} <span className="text-xs font-normal text-ink-3">{t("form.optional")}</span>
        </p>
        <AttachmentPicker value={files} onChange={setFiles} max={MAX_TICKET_ATTACHMENTS} disabled={saving} />
        {fields.mediaIds && <p className="text-[13px] text-danger">{fields.mediaIds}</p>}
      </div>

      <div className="flex flex-col-reverse gap-2 border-t border-line pt-5 sm:flex-row sm:justify-end">
        <Button variant="ghost" className="h-11 sm:h-10" onClick={() => router.back()} disabled={saving}>
          {t("form.cancel")}
        </Button>
        <Button type="submit" className="h-11 sm:h-10" loading={saving} disabled={uploading}>
          {uploading ? t("form.uploadingImages") : t("form.send")}
        </Button>
      </div>
    </form>
  );
}
