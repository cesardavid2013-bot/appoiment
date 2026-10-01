"use client";

import { Check, CircleDashed, Download, ExternalLink } from "lucide-react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { useState } from "react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { ConfirmDialog } from "@/components/ui/dialog";
import { Field, Input } from "@/components/ui/field";
import { Badge } from "@/components/ui/misc";
import { api, ApiError } from "@/lib/api";
import { ShareLink } from "./share-link";
import { SettingsCard } from "./settings-shell";

type Props = {
  name: string;
  appUrl: string;
  slug: string;
  status: "draft" | "active" | "suspended" | "closed";
  qrSvg: string;
  checklist: { key: string; label: string; done: boolean; href: string }[];
};

export function BookingLinkSettings({ name, appUrl, slug, status, qrSvg, checklist }: Props) {
  const router = useRouter();
  const live = status === "active";
  const url = `${appUrl}/${slug}`;
  const host = appUrl.replace(/^https?:\/\//, "");
  const [draftSlug, setDraftSlug] = useState(slug);
  const [slugError, setSlugError] = useState<string | null>(null);
  const [savingSlug, setSavingSlug] = useState(false);
  const [publishing, setPublishing] = useState(false);
  const [confirmHide, setConfirmHide] = useState(false);
  const ready = checklist.every((c) => c.done);

  async function setLive(next: boolean) {
    setPublishing(true);
    try {
      await api("/api/pro/business/publish", { body: { live: next } });
      toast.success(next ? "You're live — clients can find and book you" : "Your page is hidden", { description: next ? undefined : "Existing appointments aren't affected." });
      setConfirmHide(false);
      router.refresh();
    } catch (err) {
      toast.error((err as ApiError).message);
    } finally {
      setPublishing(false);
    }
  }

  async function saveSlug() {
    setSlugError(null);
    setSavingSlug(true);
    try {
      await api("/api/pro/business/slug", { method: "PUT", body: { slug: draftSlug } });
      toast.success("Address updated", { description: "Your old link no longer works — update it wherever you've shared it." });
      router.refresh();
    } catch (err) {
      setSlugError((err as ApiError).message);
    } finally {
      setSavingSlug(false);
    }
  }

  function downloadSvg() {
    const blob = new Blob([qrSvg], { type: "image/svg+xml" });
    trigger(URL.createObjectURL(blob), `${slug}-qr.svg`);
  }

  async function downloadPng() {
    const img = new Image();
    const src = URL.createObjectURL(new Blob([qrSvg], { type: "image/svg+xml" }));
    await new Promise((r, j) => {
      img.onload = r;
      img.onerror = j;
      img.src = src;
    });
    const size = 1200;
    const canvas = document.createElement("canvas");
    canvas.width = canvas.height = size;
    const ctx = canvas.getContext("2d")!;
    ctx.fillStyle = "#fff";
    ctx.fillRect(0, 0, size, size);
    ctx.drawImage(img, 0, 0, size, size);
    URL.revokeObjectURL(src);
    canvas.toBlob((b) => b && trigger(URL.createObjectURL(b), `${slug}-qr.png`), "image/png");
  }

  return (
    <>
      <SettingsCard id="status-h" title={live ? "Your page is live" : "Your page isn't live yet"} description={live ? "Clients can find you in search and book online." : "Only you can see it. Go live when the checklist is done."}>
        {!live && (
          <ul className="space-y-2">
            {checklist.map((c) => (
              <li key={c.key} className="flex items-center gap-2.5 text-sm">
                {c.done ? <Check className="size-4 text-accent" aria-label="Done" /> : <CircleDashed className="size-4 text-ink-3" aria-label="To do" />}
                {c.done ? (
                  <span className="text-ink-3 line-through decoration-line-strong">{c.label}</span>
                ) : (
                  <Link href={c.href} className="font-medium text-ink underline underline-offset-2">
                    {c.label}
                  </Link>
                )}
              </li>
            ))}
          </ul>
        )}
        <div className="flex flex-wrap items-center gap-2">
          {live ? (
            <>
              <Badge tone="positive" dot>
                Live
              </Badge>
              <Button variant="ghost" size="sm" onClick={() => setConfirmHide(true)}>
                Hide my page
              </Button>
            </>
          ) : (
            <Button onClick={() => setLive(true)} loading={publishing} disabled={!ready || status === "suspended"}>
              Go live
            </Button>
          )}
          <Link href={`/${slug}`} target="_blank" className="ms-auto inline-flex items-center gap-1 text-sm font-medium text-ink-2 hover:text-ink">
            {live ? "View page" : "Preview"} <ExternalLink className="size-3.5" />
          </Link>
        </div>
      </SettingsCard>

      <SettingsCard id="share-h" title="Share">
        <ShareLink url={url} />
        <div className="flex flex-col gap-5 sm:flex-row sm:items-start">
          <div className="w-40 shrink-0 rounded-lg border border-line bg-white p-2.5" role="img" aria-label={`QR code for ${host}/${slug}`} dangerouslySetInnerHTML={{ __html: qrSvg }} />
          <div className="space-y-3">
            <p className="text-sm leading-relaxed text-ink-2">Print it at the front desk, on business cards or your mirror. Scanning opens your booking page directly.</p>
            <div className="flex flex-wrap gap-2">
              <Button variant="secondary" size="sm" onClick={downloadPng} icon={<Download className="size-4" />}>
                PNG for print
              </Button>
              <Button variant="secondary" size="sm" onClick={downloadSvg} icon={<Download className="size-4" />}>
                SVG
              </Button>
            </div>
          </div>
        </div>
        <details className="group">
          <summary className="cursor-pointer text-sm font-medium text-ink-2 hover:text-ink">Add a “Book now” button to your website</summary>
          <p className="mt-2 text-[13px] text-ink-3">Paste this where you want the button.</p>
          <pre className="relative mt-2 overflow-x-auto rounded-md bg-surface-2 p-3 text-[12px] leading-relaxed text-ink-2">
            <code>{snippet(url, name)}</code>
          </pre>
          <Button
            variant="ghost"
            size="sm"
            className="mt-1"
            onClick={async () => {
              await navigator.clipboard.writeText(snippet(url, name));
              toast.success("Copied");
            }}
          >
            Copy code
          </Button>
        </details>
      </SettingsCard>

      <SettingsCard
        id="slug-h"
        title="Web address"
        description="Lowercase letters, numbers and hyphens. Changing it breaks links you've already shared."
        footer={
          <Button onClick={saveSlug} loading={savingSlug} disabled={draftSlug.trim() === slug || draftSlug.trim().length < 3}>
            Change address
          </Button>
        }
      >
        <Field label="Address" error={slugError}>
          {(p) => (
            <div className="flex h-11 items-center overflow-hidden rounded-md border border-line-strong bg-surface focus-within:border-accent focus-within:ring-3 focus-within:ring-accent/15 md:h-10">
              <span className="hidden shrink-0 border-e border-line bg-surface-2 px-3 text-sm leading-[2.5rem] text-ink-3 sm:block">{host}/</span>
              <Input
                {...p}
                value={draftSlug}
                onChange={(e) => setDraftSlug(e.target.value.toLowerCase().replace(/[^a-z0-9-]/g, "").slice(0, 50))}
                className="h-full rounded-none border-0 focus:ring-0"
                autoCapitalize="none"
                spellCheck={false}
              />
            </div>
          )}
        </Field>
      </SettingsCard>

      <ConfirmDialog
        open={confirmHide}
        onOpenChange={setConfirmHide}
        title="Hide your page?"
        description="You'll disappear from search and nobody can book online. Existing appointments stay as they are. You can go live again any time."
        confirmLabel="Hide page"
        onConfirm={() => setLive(false)}
        loading={publishing}
      />
    </>
  );
}

function snippet(url: string, name: string) {
  const safe = name.replace(/[<>&"]/g, "");
  return `<a href="${url}" target="_blank" rel="noopener"\n   style="display:inline-block;padding:12px 20px;border-radius:8px;background:#1a1814;color:#fff;font:600 15px/1 system-ui,sans-serif;text-decoration:none">\n  Book with ${safe}\n</a>`;
}

function trigger(href: string, filename: string) {
  const a = document.createElement("a");
  a.href = href;
  a.download = filename;
  a.click();
  setTimeout(() => URL.revokeObjectURL(href), 1000);
}
