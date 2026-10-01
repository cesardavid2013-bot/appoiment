"use client";

import { CheckCircle2, Send } from "lucide-react";
import { useRouter } from "next/navigation";
import { useState, type FormEvent } from "react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { ConfirmDialog } from "@/components/ui/dialog";
import { Field, FormError, Textarea } from "@/components/ui/field";
import { MAX_TICKET_ATTACHMENTS, type TicketStatus } from "@/domain/support";
import { useT } from "@/i18n/client";
import { api, ApiError } from "@/lib/api";
import { AttachmentPicker, type Attachment } from "./attachment-picker";

export function TicketReply({ ticketId, status }: { ticketId: string; status: TicketStatus }) {
  const router = useRouter();
  const t = useT("support");
  const [body, setBody] = useState("");
  const [files, setFiles] = useState<Attachment[]>([]);
  const [sending, setSending] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const uploading = files.some((f) => !f.id);

  async function onSubmit(e: FormEvent) {
    e.preventDefault();
    if (!body.trim()) return setError(t("reply.writeFirst"));
    setSending(true);
    setError(null);
    try {
      await api(`/api/support/${ticketId}/messages`, { body: { body, mediaIds: files.map((f) => f.id).filter(Boolean) } });
      setBody("");
      setFiles([]);
      toast.success(t("reply.sent"));
      router.refresh();
    } catch (err) {
      setError((err as ApiError).message);
    } finally {
      setSending(false);
    }
  }

  return (
    <form onSubmit={onSubmit} noValidate className="rounded-xl border border-line bg-surface p-4 sm:p-5">
      <div className="space-y-4">
        <FormError message={error} />
        <Field label={t("reply.label")} hint={status === "resolved" ? t("reply.reopens") : undefined}>
          {(p) => <Textarea {...p} rows={4} value={body} onChange={(e) => setBody(e.target.value)} maxLength={5000} placeholder={t("reply.placeholder")} />}
        </Field>
        <AttachmentPicker value={files} onChange={setFiles} max={MAX_TICKET_ATTACHMENTS} disabled={sending} />
        <div className="flex justify-end">
          <Button type="submit" loading={sending} disabled={uploading || !body.trim()} icon={<Send className="size-4" />} className="h-11 w-full sm:h-10 sm:w-auto">
            {t("reply.send")}
          </Button>
        </div>
      </div>
    </form>
  );
}

export function ResolveTicketButton({ ticketId }: { ticketId: string }) {
  const router = useRouter();
  const t = useT("support");
  const [open, setOpen] = useState(false);
  const [loading, setLoading] = useState(false);

  async function resolve() {
    setLoading(true);
    try {
      await api(`/api/support/${ticketId}`, { method: "PATCH", body: { status: "resolved" } });
      setOpen(false);
      toast.success(t("resolve.done"), { description: t("resolve.doneBody") });
      router.refresh();
    } catch (err) {
      toast.error((err as ApiError).message);
    } finally {
      setLoading(false);
    }
  }

  return (
    <>
      <Button variant="secondary" className="h-11 sm:h-10" onClick={() => setOpen(true)} icon={<CheckCircle2 className="size-4" />}>
        {t("resolve.button")}
      </Button>
      <ConfirmDialog
        open={open}
        onOpenChange={setOpen}
        title={t("resolve.confirmTitle")}
        description={t("resolve.confirmBody")}
        confirmLabel={t("resolve.button")}
        onConfirm={resolve}
        loading={loading}
        tone="primary"
      />
    </>
  );
}
