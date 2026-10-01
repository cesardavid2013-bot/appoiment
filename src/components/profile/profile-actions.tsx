"use client";

import { Check, Copy, Download, MessageCircle, Share2 } from "lucide-react";
import { useRouter } from "next/navigation";
import { useState } from "react";
import { toast } from "sonner";
import { FavoriteButton } from "@/components/business/favorite-button";
import { Button } from "@/components/ui/button";
import { Dialog } from "@/components/ui/dialog";
import { Field, FormError, Textarea } from "@/components/ui/field";
import { useT } from "@/i18n/client";
import { api, ApiError } from "@/lib/api";

export function ShareButton({ url, title, qrSvg, label, className }: { url: string; title: string; qrSvg: string; label?: string; className?: string }) {
  const t = useT("profile.actions");
  const [open, setOpen] = useState(false);
  const [copied, setCopied] = useState(false);

  async function share() {
    if (typeof navigator !== "undefined" && navigator.share && window.matchMedia("(pointer: coarse)").matches) {
      try {
        await navigator.share({ title, url });
        return;
      } catch {
        /* user cancelled — fall back to dialog */
      }
    }
    setOpen(true);
  }

  async function copy() {
    await navigator.clipboard.writeText(url);
    setCopied(true);
    setTimeout(() => setCopied(false), 1800);
  }

  function downloadQr() {
    const blob = new Blob([qrSvg], { type: "image/svg+xml" });
    const a = document.createElement("a");
    a.href = URL.createObjectURL(blob);
    a.download = `${title.replace(/[^a-z0-9]+/gi, "-").toLowerCase()}-qr.svg`;
    a.click();
    URL.revokeObjectURL(a.href);
  }

  return (
    <>
      <Button variant="secondary" className={className} onClick={share} icon={<Share2 className="size-4" />}>
        {label ?? t("share")}
      </Button>
      <Dialog open={open} onOpenChange={setOpen} title={t("shareTitle", { name: title })} description={t("shareBody")} size="sm">
        <div className="space-y-5">
          <div className="mx-auto w-48 rounded-lg border border-line bg-white p-3 [&_svg]:h-auto [&_svg]:w-full" dangerouslySetInnerHTML={{ __html: qrSvg }} />
          <div className="flex items-center gap-2 rounded-md border border-line bg-surface-2 p-1.5 ps-3">
            <span className="min-w-0 flex-1 truncate text-sm text-ink-2">{url.replace(/^https?:\/\//, "")}</span>
            <Button size="sm" variant={copied ? "accent" : "primary"} onClick={copy} icon={copied ? <Check className="size-4" /> : <Copy className="size-4" />}>
              {copied ? t("copied") : t("copy")}
            </Button>
          </div>
          <Button variant="ghost" size="sm" className="w-full" onClick={downloadQr} icon={<Download className="size-4" />}>
            {t("downloadQr")}
          </Button>
        </div>
      </Dialog>
    </>
  );
}

export function AskQuestionButton({ businessId, businessName, signedIn, className }: { businessId: string; businessName: string; signedIn: boolean; className?: string }) {
  const t = useT("profile.actions");
  const router = useRouter();
  const [open, setOpen] = useState(false);
  const [body, setBody] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [sending, setSending] = useState(false);

  async function send() {
    setSending(true);
    setError(null);
    try {
      const res = await api<{ conversationId: string }>("/api/messages", { body: { businessId, body } });
      toast.success(t("sent"), { description: t("sentBody", { name: businessName }) });
      router.push(`/messages/${res.conversationId}`);
    } catch (err) {
      setError((err as ApiError).message);
      setSending(false);
    }
  }

  return (
    <>
      <Button
        variant="secondary"
        className={className}
        icon={<MessageCircle className="size-4" />}
        onClick={() => (signedIn ? setOpen(true) : router.push(`/login?next=${encodeURIComponent(`/messages/new?business=${businessId}`)}`))}
      >
        {t("ask")}
      </Button>
      <Dialog
        open={open}
        onOpenChange={setOpen}
        title={t("messageTitle", { name: businessName })}
        description={t("messageBody")}
        locked={sending}
        footer={
          <>
            <Button variant="ghost" onClick={() => setOpen(false)} disabled={sending}>
              {t("cancel")}
            </Button>
            <Button onClick={send} loading={sending} disabled={body.trim().length < 2}>
              {t("send")}
            </Button>
          </>
        }
      >
        <div className="space-y-3">
          <FormError message={error} />
          <Field label={t("yourMessage")}>
            {(p) => <Textarea {...p} rows={5} value={body} onChange={(e) => setBody(e.target.value)} placeholder={t("placeholder")} maxLength={2000} autoFocus />}
          </Field>
        </div>
      </Dialog>
    </>
  );
}

export { FavoriteButton };
