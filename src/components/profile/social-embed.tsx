"use client";

import { Play } from "lucide-react";
import { useState } from "react";
import { embedFrame, embedThumbnail, KIND_LABEL, PROVIDER_LABEL, type EmbedKind, type EmbedProvider } from "@/domain/social";
import { cn } from "@/lib/cn";
import { SocialIcon } from "./social-icons";

export type EmbedLike = { provider: EmbedProvider; kind: EmbedKind; providerId: string; caption: string | null };

const PROVIDER_HOST: Record<EmbedProvider, string> = {
  youtube: "youtube-nocookie.com",
  tiktok: "tiktok.com",
  instagram: "instagram.com",
  vimeo: "vimeo.com",
  soundcloud: "soundcloud.com",
  spotify: "spotify.com",
};

/**
 * Click-to-load player. Until the visitor asks for it, nothing is requested
 * from the provider except (for YouTube) a static thumbnail from i.ytimg.com —
 * no third-party scripts, cookies or trackers on page load. The iframe `src`
 * is built from the validated id by domain/social.ts, never from user input.
 */
export function EmbedPlayer({ item, className, autoLoad = false }: { item: EmbedLike; className?: string; autoLoad?: boolean }) {
  const [loaded, setLoaded] = useState(autoLoad);
  const frame = embedFrame(item.provider, item.kind, item.providerId);
  if (!frame) return null;
  const thumb = embedThumbnail(item.provider, item.kind, item.providerId);
  const name = `${PROVIDER_LABEL[item.provider]} ${KIND_LABEL[item.kind].toLowerCase()}`;
  const title = item.caption ? `${name}: ${item.caption}` : name;

  if (frame.shape === "audio") {
    return (
      <div className={cn("overflow-hidden rounded-lg border border-line bg-surface", className)}>
        {loaded ? (
          <iframe
            src={frame.src}
            title={title}
            style={{ height: frame.height }}
            className="block w-full border-0"
            loading="lazy"
            allow={frame.allow}
            referrerPolicy="strict-origin-when-cross-origin"
            sandbox="allow-scripts allow-same-origin allow-popups allow-popups-to-escape-sandbox allow-presentation"
          />
        ) : (
          <button type="button" onClick={() => setLoaded(true)} className="group flex w-full items-center gap-3.5 p-3 text-left hover:bg-surface-2 focus-visible:bg-surface-2" aria-label={`Play ${title}`}>
            <span className="flex size-14 shrink-0 items-center justify-center rounded-md bg-surface-3 text-ink-2">
              <SocialIcon name={item.provider} className="size-6" />
            </span>
            <span className="min-w-0 flex-1">
              <span className="block truncate text-[15px] font-medium text-ink">{item.caption ?? `${PROVIDER_LABEL[item.provider]} ${KIND_LABEL[item.kind].toLowerCase()}`}</span>
              <span className="mt-0.5 block truncate text-[13px] text-ink-3">
                {PROVIDER_LABEL[item.provider]} · {KIND_LABEL[item.kind]} · Loads from {PROVIDER_HOST[item.provider]}
              </span>
            </span>
            <span className="flex size-11 shrink-0 items-center justify-center rounded-full bg-ink text-bg transition-transform group-hover:scale-105">
              <Play className="size-4 translate-x-px fill-current" aria-hidden />
            </span>
          </button>
        )}
      </div>
    );
  }

  return (
    <div className={cn("relative overflow-hidden rounded-lg bg-surface-2", frame.shape === "portrait" ? "aspect-[9/16]" : "aspect-video", className)}>
      {loaded ? (
        <iframe
          src={frame.src}
          title={title}
          className="absolute inset-0 size-full border-0"
          loading="lazy"
          allow={frame.allow}
          allowFullScreen
          referrerPolicy="strict-origin-when-cross-origin"
          sandbox="allow-scripts allow-same-origin allow-popups allow-popups-to-escape-sandbox allow-presentation"
        />
      ) : (
        <button type="button" onClick={() => setLoaded(true)} className="group absolute inset-0 block size-full text-left" aria-label={`Play ${title}`}>
          {thumb ? (
            // Static thumbnail from i.ytimg.com (allowed by img-src); no referrer is sent.
            // eslint-disable-next-line @next/next/no-img-element
            <img src={thumb} alt="" loading="lazy" decoding="async" referrerPolicy="no-referrer" className="absolute inset-0 size-full object-cover" />
          ) : (
            <span className="absolute inset-0 flex flex-col justify-between p-3.5 sm:p-4">
              <span className="flex items-center gap-2 text-[13px] font-medium text-ink-2">
                <SocialIcon name={item.provider} className="size-4" />
                {PROVIDER_LABEL[item.provider]} · {KIND_LABEL[item.kind]}
              </span>
              <span className="min-w-0">
                {item.caption && <span className="line-clamp-3 text-[15px] font-medium leading-snug text-ink text-pretty">{item.caption}</span>}
                <span className="mt-1 block text-[12px] text-ink-3">Loads from {PROVIDER_HOST[item.provider]}</span>
              </span>
            </span>
          )}
          <span
            className={cn(
              "absolute left-1/2 top-1/2 flex size-14 -translate-x-1/2 -translate-y-1/2 items-center justify-center rounded-full transition-transform group-hover:scale-105 group-focus-visible:ring-4 group-focus-visible:ring-accent/40",
              thumb ? "bg-black/70 text-white" : "bg-ink text-bg",
            )}
          >
            <Play className="size-5 translate-x-0.5 fill-current" aria-hidden />
          </span>
          {thumb && (
            <span className="absolute bottom-2 left-2 inline-flex items-center gap-1.5 rounded bg-black/65 px-1.5 py-0.5 text-[11px] font-medium text-white">
              <SocialIcon name={item.provider} className="size-3" />
              {KIND_LABEL[item.kind]}
            </span>
          )}
        </button>
      )}
    </div>
  );
}
