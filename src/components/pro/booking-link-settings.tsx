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
import { useT } from "@/i18n/client";
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
  const t = useT("proSettings");
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
      toast.success(next ? t("link.toasts.live") : t("link.toasts.hidden"), { description: next ? undefined : t("link.toasts.hiddenDescription") });
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
      toast.success(t("link.toasts.slugUpdated"), { description: t("link.toasts.slugUpdatedDescription") });
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
      <SettingsCard id="status-h" title={live ? t("link.status.liveTitle") : t("link.status.draftTitle")} description={live ? t("link.status.liveDescription") : t("link.status.draftDescription")}>
        {!live && (
          <ul className="space-y-2">
            {checklist.map((c) => (
              <li key={c.key} className="flex items-center gap-2.5 text-sm">
                {c.done ? <Check className="size-4 text-accent" aria-label={t("link.checklist.done")} /> : <CircleDashed className="size-4 text-ink-3" aria-label={t("link.checklist.todo")} />}
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
                {t("link.status.live")}
              </Badge>
              <Button variant="ghost" size="sm" onClick={() => setConfirmHide(true)}>
                {t("link.status.hide")}
              </Button>
            </>
          ) : (
            <Button onClick={() => setLive(true)} loading={publishing} disabled={!ready || status === "suspended"}>
              {t("link.status.goLive")}
            </Button>
          )}
          <Link href={`/${slug}`} target="_blank" className="ms-auto inline-flex items-center gap-1 text-sm font-medium text-ink-2 hover:text-ink">
            {live ? t("link.status.viewPage") : t("link.status.preview")} <ExternalLink className="size-3.5" />
          </Link>
        </div>
      </SettingsCard>

      <SettingsCard id="share-h" title={t("link.share.title")}>
        <ShareLink url={url} />
        <div className="flex flex-col gap-5 sm:flex-row sm:items-start">
          <div className="w-40 shrink-0 rounded-lg border border-line bg-white p-2.5" role="img" aria-label={t("link.share.qrLabel", { address: `${host}/${slug}` })} dangerouslySetInnerHTML={{ __html: qrSvg }} />
          <div className="space-y-3">
            <p className="text-sm leading-relaxed text-ink-2">{t("link.share.qrHint")}</p>
            <div className="flex flex-wrap gap-2">
              <Button variant="secondary" size="sm" onClick={downloadPng} icon={<Download className="size-4" />}>
                {t("link.share.png")}
              </Button>
              <Button variant="secondary" size="sm" onClick={downloadSvg} icon={<Download className="size-4" />}>
                {t("link.share.svg")}
              </Button>
            </div>
          </div>
        </div>
        <details className="group">
          <summary className="cursor-pointer text-sm font-medium text-ink-2 hover:text-ink">{t("link.share.embedSummary")}</summary>
          <p className="mt-2 text-[13px] text-ink-3">{t("link.share.embedHint")}</p>
          <pre className="relative mt-2 overflow-x-auto rounded-md bg-surface-2 p-3 text-[12px] leading-relaxed text-ink-2">
            <code dir="ltr">{snippet(url, t("link.share.buttonText", { name: safeName(name) }))}</code>
          </pre>
          <Button
            variant="ghost"
            size="sm"
            className="mt-1"
            onClick={async () => {
              await navigator.clipboard.writeText(snippet(url, t("link.share.buttonText", { name: safeName(name) })));
              toast.success(t("link.toasts.copied"));
            }}
          >
            {t("link.share.copyCode")}
          </Button>
        </details>
      </SettingsCard>

      <SettingsCard
        id="slug-h"
        title={t("link.slug.title")}
        description={t("link.slug.description")}
        footer={
          <Button onClick={saveSlug} loading={savingSlug} disabled={draftSlug.trim() === slug || draftSlug.trim().length < 3}>
            {t("link.slug.change")}
          </Button>
        }
      >
        <Field label={t("link.slug.label")} error={slugError}>
          {(p) => (
            <div dir="ltr" className="flex h-11 items-center overflow-hidden rounded-md border border-line-strong bg-surface focus-within:border-accent focus-within:ring-3 focus-within:ring-accent/15 md:h-10">
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
        title={t("link.hideDialog.title")}
        description={t("link.hideDialog.description")}
        confirmLabel={t("link.hideDialog.confirm")}
        onConfirm={() => setLive(false)}
        loading={publishing}
      />
    </>
  );
}

const safeName = (name: string) => name.replace(/[<>&"]/g, "");

function snippet(url: string, label: string) {
  return `<a href="${url}" target="_blank" rel="noopener"\n   style="display:inline-block;padding:12px 20px;border-radius:8px;background:#1a1814;color:#fff;font:600 15px/1 system-ui,sans-serif;text-decoration:none">\n  ${label.replace(/[<>&"]/g, "")}\n</a>`;
}

function trigger(href: string, filename: string) {
  const a = document.createElement("a");
  a.href = href;
  a.download = filename;
  a.click();
  setTimeout(() => URL.revokeObjectURL(href), 1000);
}
