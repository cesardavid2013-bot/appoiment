import { ArrowUpRight } from "lucide-react";
import Link from "next/link";
import { PROVIDER_LABEL, safeEmbedLink, type EmbedShape } from "@/domain/social";
import { cn } from "@/lib/cn";
import type { SocialEmbedItem } from "@/server/services/social-embeds";
import { EmbedPlayer } from "./social-embed";

const GRID: Record<EmbedShape, string> = {
  portrait: "grid grid-cols-2 gap-x-3 gap-y-5 sm:grid-cols-3",
  landscape: "grid gap-x-4 gap-y-6 sm:grid-cols-2",
  audio: "grid gap-3",
};

/**
 * Featured posts from the business's socials. Items keep the pro's order but
 * are grouped by shape (vertical video, landscape video, audio) so mixed
 * aspect ratios don't leave ragged rows; groups appear in order of their first item.
 */
export function SocialShowcase({ items, slug }: { items: SocialEmbedItem[]; slug: string }) {
  const groups: { shape: EmbedShape; items: SocialEmbedItem[] }[] = [];
  for (const it of items) {
    const g = groups.find((x) => x.shape === it.shape);
    if (g) g.items.push(it);
    else groups.push({ shape: it.shape, items: [it] });
  }
  return (
    <div className="space-y-8">
      {groups.map((g) => (
        <ul key={g.shape} className={GRID[g.shape]}>
          {g.items.map((it) => {
            const link = safeEmbedLink(it.provider, it.url);
            const book = it.serviceId && it.serviceBookable && it.serviceName;
            return (
              <li key={it.id} className="min-w-0">
                <EmbedPlayer item={it} />
                {(it.caption && it.shape !== "audio") || link || book ? (
                  <div className={cn("mt-2 min-w-0", it.shape === "audio" && "flex flex-wrap items-center justify-between gap-x-4 gap-y-1")}>
                    {it.caption && it.shape !== "audio" && <p className="line-clamp-2 text-[14px] leading-snug text-ink-2 text-pretty">{it.caption}</p>}
                    <p className="mt-1 flex flex-wrap items-center gap-x-4 gap-y-1 text-[13px]">
                      {book && (
                        <Link href={`/${slug}/book?service=${it.serviceId}`} className="font-medium text-accent-text hover:underline">
                          Book this · {it.serviceName}
                        </Link>
                      )}
                      {link && (
                        <a href={link} target="_blank" rel="noopener noreferrer nofollow" className="inline-flex items-center gap-0.5 text-ink-3 hover:text-ink hover:underline">
                          {PROVIDER_LABEL[it.provider]}
                          <ArrowUpRight className="size-3.5" aria-hidden />
                          <span className="sr-only"> (opens in a new tab)</span>
                        </a>
                      )}
                    </p>
                  </div>
                ) : null}
              </li>
            );
          })}
        </ul>
      ))}
      <p className="text-[12px] text-ink-3">Players load from each platform only when you press play.</p>
    </div>
  );
}
