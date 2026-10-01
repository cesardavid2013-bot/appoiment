"use client";

import { ChevronLeft, ChevronRight, X } from "lucide-react";
import Link from "next/link";
import { useCallback, useEffect, useState } from "react";
import { Dialog as D } from "radix-ui";
import { MediaImage, MediaVideo, type MediaLike } from "@/components/ui/media";
import { useT } from "@/i18n/client";
import { cn } from "@/lib/cn";

export type PortfolioEntry = { id: string; kind: "image" | "video" | "before_after"; caption: string | null; serviceId: string | null; serviceName: string | null; media: MediaLike; before: MediaLike | null };

function BeforeAfter({ before, after, className }: { before: MediaLike; after: MediaLike; className?: string }) {
  const [pos, setPos] = useState(50);
  const t = useT("profile.portfolio");
  return (
    <div className={cn("relative select-none overflow-hidden", className)}>
      <MediaImage media={after} className="absolute inset-0 size-full" sizes="(min-width: 1024px) 60vw, 100vw" />
      <div className="absolute inset-0" style={{ clipPath: `inset(0 ${100 - pos}% 0 0)` }}>
        <MediaImage media={before} className="size-full" sizes="(min-width: 1024px) 60vw, 100vw" />
      </div>
      <div className="pointer-events-none absolute inset-y-0 w-0.5 bg-white shadow" style={{ left: `${pos}%` }} />
      <span className="pointer-events-none absolute start-3 top-3 rounded bg-black/55 px-1.5 py-0.5 text-[11px] font-medium text-white">{t("before")}</span>
      <span className="pointer-events-none absolute end-3 top-3 rounded bg-black/55 px-1.5 py-0.5 text-[11px] font-medium text-white">{t("after")}</span>
      <input type="range" min={0} max={100} value={pos} onChange={(e) => setPos(Number(e.target.value))} aria-label={t("compare")} className="absolute inset-0 size-full cursor-ew-resize opacity-0" />
    </div>
  );
}

/**
 * Portfolio grid with a lightbox. Each piece of work links straight to the
 * service it shows — discovery content that converts.
 */
export function PortfolioGrid({ items, slug }: { items: PortfolioEntry[]; slug: string }) {
  const t = useT("profile.portfolio");
  const [index, setIndex] = useState<number | null>(null);
  const current = index != null ? items[index] : null;
  const go = useCallback((d: number) => setIndex((i) => (i == null ? i : (i + d + items.length) % items.length)), [items.length]);

  useEffect(() => {
    if (index == null) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "ArrowRight") go(1);
      if (e.key === "ArrowLeft") go(-1);
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [index, go]);

  return (
    <>
      <ul className="grid grid-cols-2 gap-2 sm:grid-cols-3 sm:gap-3">
        {items.map((p, i) => (
          <li key={p.id} className={cn(i === 0 && items.length > 4 && "col-span-2 row-span-2")}>
            <button type="button" onClick={() => setIndex(i)} className="group relative block aspect-square w-full overflow-hidden rounded-lg" aria-label={p.caption ?? t("openItem", { n: i + 1 })}>
              <MediaImage media={p.media} alt={p.caption ?? ""} sizes="(min-width: 1024px) 22vw, 45vw" className="size-full transition-transform duration-500 group-hover:scale-[1.03]" />
              {p.kind === "video" && <span className="absolute bottom-2 start-2 rounded bg-black/60 px-1.5 py-0.5 text-[11px] font-medium text-white">{t("video")}</span>}
              {p.kind === "before_after" && <span className="absolute bottom-2 start-2 rounded bg-black/60 px-1.5 py-0.5 text-[11px] font-medium text-white">{t("beforeAfter")}</span>}
            </button>
          </li>
        ))}
      </ul>
      <D.Root open={index != null} onOpenChange={(o) => !o && setIndex(null)}>
        <D.Portal>
          <D.Overlay className="fixed inset-0 z-50 bg-black/90 data-[state=open]:animate-fade-in" />
          <D.Content className="fixed inset-0 z-50 flex flex-col outline-none">
            <D.Title className="sr-only">{current?.caption ?? t("portfolio")}</D.Title>
            <D.Description className="sr-only">{t("browse")}</D.Description>
            <div className="flex items-center justify-between p-3 text-white">
              <span className="text-sm text-white/70 tabular">{index != null ? `${index + 1} / ${items.length}` : ""}</span>
              <D.Close className="flex size-10 items-center justify-center rounded-full hover:bg-white/10" aria-label={t("close")}>
                <X className="size-5" />
              </D.Close>
            </div>
            <div className="relative flex min-h-0 flex-1 items-center justify-center px-2 sm:px-16">
              {current &&
                (current.kind === "video" ? (
                  <MediaVideo key={current.id} media={current.media} className="max-h-full w-full max-w-3xl rounded-lg" />
                ) : current.kind === "before_after" && current.before ? (
                  <BeforeAfter before={current.before} after={current.media} className="aspect-square max-h-full w-full max-w-2xl rounded-lg" />
                ) : (
                  <MediaImage key={current.id} media={current.media} alt={current.caption ?? ""} fit="contain" sizes="100vw" className="size-full bg-transparent" />
                ))}
              {items.length > 1 && (
                <>
                  <button type="button" onClick={() => go(-1)} className="absolute start-2 top-1/2 hidden size-11 -translate-y-1/2 items-center justify-center rounded-full bg-white/10 text-white hover:bg-white/20 sm:flex" aria-label={t("previous")}>
                    <ChevronLeft className="size-5" />
                  </button>
                  <button type="button" onClick={() => go(1)} className="absolute end-2 top-1/2 hidden size-11 -translate-y-1/2 items-center justify-center rounded-full bg-white/10 text-white hover:bg-white/20 sm:flex" aria-label={t("next")}>
                    <ChevronRight className="size-5" />
                  </button>
                </>
              )}
            </div>
            <div className="flex items-center justify-between gap-4 p-4 pb-[max(1rem,env(safe-area-inset-bottom))] text-white">
              <p className="min-w-0 text-sm text-white/80">{current?.caption}</p>
              {current?.serviceId && (
                <Link href={`/${slug}/book?service=${current.serviceId}`} className="shrink-0 rounded-md bg-white px-4 py-2.5 text-sm font-medium text-ink hover:bg-white/90">
                  {current.serviceName ? t("bookThisService", { service: current.serviceName }) : t("bookThis")}
                </Link>
              )}
            </div>
          </D.Content>
        </D.Portal>
      </D.Root>
    </>
  );
}
