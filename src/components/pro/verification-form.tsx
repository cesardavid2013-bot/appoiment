"use client";

import { FileImage, Plus, X } from "lucide-react";
import { useRouter } from "next/navigation";
import { useRef, useState } from "react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Field, FormError, Textarea } from "@/components/ui/field";
import { MediaImage, type MediaLike } from "@/components/ui/media";
import { useT } from "@/i18n/client";
import { api, ApiError } from "@/lib/api";
import { uploadMedia } from "@/lib/upload";

const MAX_DOCS = 10;
const ACCEPT = "image/jpeg,image/png,image/webp";

type Doc = { key: string; name: string; status: "uploading" | "ready" | "failed"; pct: number; id?: string; media?: MediaLike | null; error?: string; previous?: boolean };

/** Details + document uploads for a verification request. Documents are private: only managers of this business and Kept's reviewers can open them. */
export function VerificationForm({ businessId, initialDetails, initialDocs, mode }: { businessId: string; initialDetails: string; initialDocs: MediaLike[]; mode: "first" | "resubmit" | "reply" }) {
  const router = useRouter();
  const t = useT("proSettings");
  const [details, setDetails] = useState(initialDetails);
  const [docs, setDocs] = useState<Doc[]>(() => initialDocs.map((m, i) => ({ key: m.id, name: t("verification.form.documentN", { n: i + 1 }), status: "ready", pct: 100, id: m.id, media: m, previous: true })));
  const [error, setError] = useState<string | null>(null);
  const [fieldError, setFieldError] = useState<string | null>(null);
  const [submitting, setSubmitting] = useState(false);
  const inputRef = useRef<HTMLInputElement>(null);
  const uploading = docs.some((d) => d.status === "uploading");
  const ready = docs.filter((d) => d.status === "ready");

  const patch = (key: string, p: Partial<Doc>) => setDocs((ds) => ds.map((d) => (d.key === key ? { ...d, ...p } : d)));

  function addFiles(files: FileList | null) {
    if (!files?.length) return;
    const room = MAX_DOCS - docs.filter((d) => d.status !== "failed").length;
    const picked = Array.from(files).slice(0, Math.max(0, room));
    if (files.length > picked.length) toast.error(t("verification.form.tooMany", { count: MAX_DOCS }));
    for (const file of picked) {
      const key = `${file.name}-${crypto.randomUUID()}`;
      setDocs((ds) => [...ds, { key, name: file.name, status: "uploading", pct: 0 }]);
      uploadMedia(file, { purpose: "verification", businessId, onProgress: (pct) => patch(key, { pct }) })
        .then((res) => patch(key, { status: "ready", pct: 100, id: res.id, media: res.media }))
        .catch((err: Error) => patch(key, { status: "failed", error: err.message }));
    }
    if (inputRef.current) inputRef.current.value = "";
  }

  async function submit() {
    setError(null);
    setFieldError(null);
    if (!details.trim() && ready.length === 0) {
      setFieldError(t("verification.form.needSomething"));
      return;
    }
    setSubmitting(true);
    try {
      await api("/api/pro/verification", { body: { details: details.trim() || null, documentMediaIds: ready.map((d) => d.id!) } });
      toast.success(mode === "reply" ? t("verification.form.sentReply") : t("verification.form.submitted"));
      router.refresh();
    } catch (err) {
      const e = err as ApiError;
      if (e.fields?.details) setFieldError(e.fields.details);
      else setError(e.message);
      setSubmitting(false);
    }
  }

  return (
    <div className="space-y-5">
      <FormError message={error} />
      <Field
        label={mode === "reply" ? t("verification.form.replyLabel") : t("verification.form.aboutLabel")}
        hint={t("verification.form.hint")}
        error={fieldError}
      >
        {(p) => <Textarea {...p} rows={5} value={details} onChange={(e) => setDetails(e.target.value)} maxLength={2000} placeholder={t("verification.form.placeholder")} />}
      </Field>

      <fieldset>
        <legend className="text-sm font-medium text-ink">{t("verification.form.documents")}</legend>
        <p className="mt-0.5 text-[13px] leading-snug text-ink-3">{t("verification.form.documentsHint", { max: MAX_DOCS })}</p>
        {docs.length > 0 && (
          <ul className="mt-3 divide-y divide-line rounded-lg border border-line" aria-label={t("verification.form.attachedList")}>
            {docs.map((d, i) => (
              <li key={d.key} className="flex items-center gap-3 px-3 py-2.5">
                {d.media ? (
                  <a href={d.media.sources.at(-1)?.url} target="_blank" rel="noopener noreferrer" className="block shrink-0 overflow-hidden rounded-md border border-line" aria-label={t("verification.form.open", { n: i + 1 })}>
                    <MediaImage media={d.media} alt="" sizes="48px" className="size-12" />
                  </a>
                ) : (
                  <span className="flex size-12 shrink-0 items-center justify-center rounded-md bg-surface-2 text-ink-3">
                    <FileImage className="size-5" aria-hidden />
                  </span>
                )}
                <div className="min-w-0 flex-1">
                  <p className="truncate text-sm text-ink">{d.name}</p>
                  {d.status === "uploading" && (
                    <div className="mt-1.5 flex items-center gap-2">
                      <div className="h-1 flex-1 overflow-hidden rounded-full bg-surface-3" role="progressbar" aria-valuenow={d.pct} aria-valuemin={0} aria-valuemax={100} aria-label={t("verification.form.uploading", { name: d.name })}>
                        <div className="h-full bg-ink transition-[width]" style={{ width: `${d.pct}%` }} />
                      </div>
                      <span className="text-[12px] text-ink-3 tabular">{d.pct}%</span>
                    </div>
                  )}
                  {d.status === "ready" && <p className="text-[13px] text-ink-3">{d.previous ? t("verification.form.fromLast") : t("verification.form.attached")}</p>}
                  {d.status === "failed" && <p className="text-[13px] text-danger">{d.error}</p>}
                </div>
                <button
                  type="button"
                  onClick={() => setDocs((ds) => ds.filter((x) => x.key !== d.key))}
                  disabled={d.status === "uploading"}
                  aria-label={t("verification.form.remove", { name: d.name })}
                  className="flex size-10 shrink-0 items-center justify-center rounded-md text-ink-3 hover:bg-surface-2 hover:text-ink disabled:opacity-40"
                >
                  <X className="size-4" />
                </button>
              </li>
            ))}
          </ul>
        )}
        <input ref={inputRef} type="file" accept={ACCEPT} multiple className="sr-only" id="verification-files" onChange={(e) => addFiles(e.target.files)} tabIndex={-1} />
        <Button variant="secondary" className="mt-3" icon={<Plus className="size-4" />} onClick={() => inputRef.current?.click()} disabled={docs.filter((d) => d.status !== "failed").length >= MAX_DOCS}>
          {docs.length ? t("verification.form.addAnother") : t("verification.form.add")}
        </Button>
        <p className="sr-only" aria-live="polite">
          {uploading ? t("verification.form.uploadingAll") : t("verification.form.attachedCount", { count: ready.length })}
        </p>
      </fieldset>

      <div className="flex flex-col-reverse gap-3 border-t border-line pt-4 sm:flex-row sm:items-center sm:justify-between">
        <p className="text-[13px] leading-snug text-ink-3">{t("verification.form.privacy")}</p>
        <Button onClick={submit} loading={submitting} disabled={uploading} className="shrink-0">
          {uploading ? t("verification.form.waiting") : mode === "reply" ? t("verification.form.sendReply") : mode === "resubmit" ? t("verification.form.submitAgain") : t("verification.form.submit")}
        </Button>
      </div>
    </div>
  );
}
