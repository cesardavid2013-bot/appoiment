"use client";

import { ArrowUpRight } from "lucide-react";
import Link from "next/link";
import { PROVIDER_LABEL, safeEmbedLink, type EmbedShape } from "@/domain/social";
import { useT } from "@/i18n/client";
import { cn } from "@/lib/cn";
import type { SocialEmbedItem } from "@/server/services/social-embeds";
import { EmbedPlayer } from "./social-embed";

/**
 * Widths are chosen so vertical and landscape players share one height in
 * the reel (180×320 and 569×320 on larger screens), so mixed formats read
 * as a deliberate film strip rather than ragged rows.
 */
const WIDTH: Record<Exclude<EmbedShape, "audio">, string> = {
  portrait: "w-[158px] sm:w-[180px]",
  landscape: "w-[min(82vw,500px)] sm:w-[569px]",
};

/**
 * Featured posts from the business's socials. Video sits in a horizontal
 * reel in the pro's order; audio (tracks, albums, podcasts) is listed below
 * as full-width rows.
 */
export function SocialShowcase({ items, slug }: { items: SocialEmbedItem[]; slug: string }) {
  const t = useT("profile.featured");
  const visual = items.filter((it) => it.shape !== "audio");
  const audio = items.filter((it) => it.shape === "audio");

  const meta = (it: SocialEmbedItem) => {
    const link = safeEmbedLink(it.provider, it.url);
    const book = it.serviceId && it.serviceBookable && it.serviceName;
    if (!link && !book) return null;
    return (
      <p className="flex flex-wrap items-center gap-x-4 gap-y-1 text-[13px]">
        {book && (
          <Link href={`/${slug}/book?service=${it.serviceId}`} className="font-medium text-accent-text hover:underline">
            {t("bookThis", { service: it.serviceName! })}
          </Link>
        )}
        {link && (
          <a href={link} target="_blank" rel="noopener noreferrer nofollow" className="inline-flex items-center gap-0.5 text-ink-3 hover:text-ink hover:underline">
            {PROVIDER_LABEL[it.provider]}
            <ArrowUpRight className="size-3.5" aria-hidden />
            <span className="sr-only"> {t("newTab")}</span>
          </a>
        )}
      </p>
    );
  };

  return (
    <div className="space-y-6">
      {visual.length > 0 && (
        <ul className="-mx-4 flex snap-x snap-mandatory scroll-px-4 items-start gap-3 overflow-x-auto px-4 pb-2 scrollbar-none sm:mx-0 sm:scroll-px-0 sm:gap-4 sm:px-0">
          {visual.map((it) => (
            <li key={it.id} className={cn("shrink-0 snap-start", WIDTH[it.shape as Exclude<EmbedShape, "audio">])}>
              <EmbedPlayer item={it} showCaption={false} />
              {(it.caption || meta(it)) && (
                <div className="mt-2.5 min-w-0 space-y-1">
                  {it.caption && <p className="line-clamp-2 text-[14px] leading-snug text-ink-2 text-pretty">{it.caption}</p>}
                  {meta(it)}
                </div>
              )}
            </li>
          ))}
        </ul>
      )}
      {audio.length > 0 && (
        <ul className="grid gap-3">
          {audio.map((it) => (
            <li key={it.id} className="min-w-0">
              <EmbedPlayer item={it} />
              {meta(it) && <div className="mt-1.5">{meta(it)}</div>}
            </li>
          ))}
        </ul>
      )}
      <p className="text-[12px] text-ink-3">{t("footnote")}</p>
    </div>
  );
}
