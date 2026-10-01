"use client";

import { useRouter } from "next/navigation";
import { useState, type FormEvent } from "react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Field, FormError, Input, Select, Textarea } from "@/components/ui/field";
import { MAX_TICKET_ATTACHMENTS, SUPPORT_CATEGORIES, SUPPORT_CATEGORY_KEYS, type SupportCategory } from "@/domain/support";
import { api, ApiError } from "@/lib/api";
import { fmtDate, fmtTime } from "@/lib/format";
import { AttachmentPicker, type Attachment } from "./attachment-picker";

export type AttachableAppointment = { id: string; reference: string; startsAt: string; timezone: string; serviceName: string; businessName: string };

export function TicketForm({ appointments, initialAppointmentId, initialCategory }: { appointments: AttachableAppointment[]; initialAppointmentId: string | null; initialCategory: SupportCategory | null }) {
  const router = useRouter();
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
    if (!category) local.category = "Choose a topic";
    if (subject.trim().length < 4) local.subject = "Add a short subject";
    if (body.trim().length < 10) local.body = "Tell us a little more — at least a sentence helps us help you";
    setFields(local);
    setError(null);
    if (Object.keys(local).length) return;
    setSaving(true);
    try {
      const res = await api<{ id: string }>("/api/support", {
        body: { category, subject, body, appointmentId: appointmentId || null, mediaIds: files.map((f) => f.id).filter(Boolean) },
      });
      toast.success("Request sent", { description: "We'll reply here and let you know when we do." });
      router.push(`/support/${res.id}`);
    } catch (err) {
      const e2 = err as ApiError;
      setFields(e2.fields ?? {});
      setError(e2.fields ? "Please check the highlighted fields." : e2.message);
      setSaving(false);
    }
  }

  const selected = appointments.find((a) => a.id === appointmentId);

  return (
    <form onSubmit={onSubmit} noValidate className="space-y-5">
      <FormError message={error} />
      <Field label="What do you need help with?" error={fields.category} hint={category ? SUPPORT_CATEGORIES[category].hint : undefined}>
        {(p) => (
          <Select {...p} value={category} onChange={(e) => setCategory(e.target.value as SupportCategory)} required>
            <option value="" disabled>
              Choose a topic
            </option>
            {SUPPORT_CATEGORY_KEYS.map((k) => (
              <option key={k} value={k}>
                {SUPPORT_CATEGORIES[k].label}
              </option>
            ))}
          </Select>
        )}
      </Field>

      {appointments.length > 0 && (
        <Field label="Related appointment" optional error={fields.appointmentId} hint={selected ? `Ref ${selected.reference} · ${selected.businessName}` : "Linking a booking lets us look into it straight away."}>
          {(p) => (
            <Select {...p} value={appointmentId} onChange={(e) => setAppointmentId(e.target.value)}>
              <option value="">None</option>
              {appointments.map((a) => (
                <option key={a.id} value={a.id}>
                  {fmtDate(a.startsAt, a.timezone, { month: "short", day: "numeric" })}, {fmtTime(a.startsAt, a.timezone)} — {a.serviceName} · {a.businessName}
                </option>
              ))}
            </Select>
          )}
        </Field>
      )}

      <Field label="Subject" error={fields.subject}>
        {(p) => <Input {...p} value={subject} onChange={(e) => setSubject(e.target.value)} maxLength={140} placeholder="e.g. I was charged twice for my deposit" required />}
      </Field>

      <Field label="Details" error={fields.body} hint="What happened, when, and what you'd like us to do. Please don't include card numbers or passwords.">
        {(p) => <Textarea {...p} rows={6} value={body} onChange={(e) => setBody(e.target.value)} maxLength={5000} required />}
      </Field>

      <div className="space-y-1.5">
        <p className="flex items-baseline justify-between text-sm font-medium text-ink">
          Images <span className="text-xs font-normal text-ink-3">Optional</span>
        </p>
        <AttachmentPicker value={files} onChange={setFiles} max={MAX_TICKET_ATTACHMENTS} disabled={saving} />
        {fields.mediaIds && <p className="text-[13px] text-danger">{fields.mediaIds}</p>}
      </div>

      <div className="flex flex-col-reverse gap-2 border-t border-line pt-5 sm:flex-row sm:justify-end">
        <Button variant="ghost" className="h-11 sm:h-10" onClick={() => router.back()} disabled={saving}>
          Cancel
        </Button>
        <Button type="submit" className="h-11 sm:h-10" loading={saving} disabled={uploading}>
          {uploading ? "Uploading images…" : "Send request"}
        </Button>
      </div>
    </form>
  );
}
