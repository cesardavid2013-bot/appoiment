"use client";

import { Check, Copy, Download, MessageCircle, Share2 } from "lucide-react";
import { useRouter } from "next/navigation";
import { useState } from "react";
import { toast } from "sonner";
import { FavoriteButton } from "@/components/business/favorite-button";
import { Button } from "@/components/ui/button";
import { Dialog } from "@/components/ui/dialog";
import { Field, FormError, Textarea } from "@/components/ui/field";
import { api, ApiError } from "@/lib/api";

export function ShareButton({ url, title, qrSvg, label = "Share" }: { url: string; title: string; qrSvg: string; label?: string }) {
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
      <Button variant="secondary" onClick={share} icon={<Share2 className="size-4" />}>
        {label}
      </Button>
      <Dialog open={open} onOpenChange={setOpen} title={`Share ${title}`} description="Send the link, or scan the code to open the booking page." size="sm">
        <div className="space-y-5">
          <div className="mx-auto w-48 rounded-lg border border-line bg-white p-3 [&_svg]:h-auto [&_svg]:w-full" dangerouslySetInnerHTML={{ __html: qrSvg }} />
          <div className="flex items-center gap-2 rounded-md border border-line bg-surface-2 p-1.5 pl-3">
            <span className="min-w-0 flex-1 truncate text-sm text-ink-2">{url.replace(/^https?:\/\//, "")}</span>
            <Button size="sm" variant={copied ? "accent" : "primary"} onClick={copy} icon={copied ? <Check className="size-4" /> : <Copy className="size-4" />}>
              {copied ? "Copied" : "Copy"}
            </Button>
          </div>
          <Button variant="ghost" size="sm" className="w-full" onClick={downloadQr} icon={<Download className="size-4" />}>
            Download QR code
          </Button>
        </div>
      </Dialog>
    </>
  );
}

export function AskQuestionButton({ businessId, businessName, signedIn, className }: { businessId: string; businessName: string; signedIn: boolean; className?: string }) {
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
      toast.success("Message sent", { description: `${businessName} will reply in your inbox.` });
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
        Ask a question
      </Button>
      <Dialog
        open={open}
        onOpenChange={setOpen}
        title={`Message ${businessName}`}
        description="Ask about services, availability or anything else before you book. Your phone number and email stay private."
        locked={sending}
        footer={
          <>
            <Button variant="ghost" onClick={() => setOpen(false)} disabled={sending}>
              Cancel
            </Button>
            <Button onClick={send} loading={sending} disabled={body.trim().length < 2}>
              Send message
            </Button>
          </>
        }
      >
        <div className="space-y-3">
          <FormError message={error} />
          <Field label="Your message">
            {(p) => <Textarea {...p} rows={5} value={body} onChange={(e) => setBody(e.target.value)} placeholder="Hi! Do you have time for a skin fade this Saturday afternoon?" maxLength={2000} autoFocus />}
          </Field>
        </div>
      </Dialog>
    </>
  );
}

export { FavoriteButton };
