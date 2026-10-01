"use client";

import { Play } from "lucide-react";
import { useEffect, useRef, useState } from "react";
import { cn } from "@/lib/cn";

export type MediaLike = {
  id: string;
  kind: "image" | "video";
  width: number | null;
  height: number | null;
  placeholder: string | null;
  alt: string | null;
  sources: { url: string; width: number }[];
  videoUrl: string | null;
  durationSeconds?: number | null;
};

/**
 * Responsive image from our pre-generated variants with a blur-up placeholder.
 * `sizes` should describe the rendered width so the browser picks the right file.
 */
export function MediaImage({ media, alt, sizes = "100vw", className, priority, fit = "cover" }: { media: MediaLike; alt?: string; sizes?: string; className?: string; priority?: boolean; fit?: "cover" | "contain" }) {
  const [loaded, setLoaded] = useState(false);
  const largest = media.sources.at(-1);
  if (!largest) return <div className={cn("bg-surface-2", className)} />;
  return (
    <div className={cn("relative overflow-hidden bg-surface-2", className)}>
      {media.placeholder && !loaded && (
        // eslint-disable-next-line @next/next/no-img-element
        <img src={media.placeholder} alt="" aria-hidden className="absolute inset-0 size-full scale-110 object-cover blur-xl" />
      )}
      {/* eslint-disable-next-line @next/next/no-img-element */}
      <img
        src={largest.url}
        srcSet={media.sources.map((s) => `${s.url} ${s.width}w`).join(", ")}
        sizes={sizes}
        alt={alt ?? media.alt ?? ""}
        width={media.width ?? undefined}
        height={media.height ?? undefined}
        loading={priority ? "eager" : "lazy"}
        fetchPriority={priority ? "high" : undefined}
        decoding="async"
        onLoad={() => setLoaded(true)}
        ref={(el) => {
          if (el?.complete && !loaded) setLoaded(true);
        }}
        className={cn("relative size-full transition-opacity duration-300", fit === "cover" ? "object-cover" : "object-contain", loaded ? "opacity-100" : "opacity-0")}
      />
    </div>
  );
}

/**
 * Bandwidth-friendly video: shows the poster until tapped (or until it scrolls
 * into view when `autoPlayInView`), never preloads the file, and pauses when
 * offscreen. Only one video plays at a time across the page.
 */
let current: HTMLVideoElement | null = null;

export function MediaVideo({ media, className, autoPlayInView = false, sizes = "100vw" }: { media: MediaLike; className?: string; autoPlayInView?: boolean; sizes?: string }) {
  const ref = useRef<HTMLVideoElement>(null);
  const [active, setActive] = useState(false);
  const saveData = typeof navigator !== "undefined" && (navigator as Navigator & { connection?: { saveData?: boolean } }).connection?.saveData;

  useEffect(() => {
    const el = ref.current;
    if (!el) return;
    const io = new IntersectionObserver(
      ([entry]) => {
        if (!entry.isIntersecting) el.pause();
        else if (autoPlayInView && !saveData && !window.matchMedia("(prefers-reduced-motion: reduce)").matches) {
          setActive(true);
        }
      },
      { threshold: 0.6 },
    );
    io.observe(el);
    return () => io.disconnect();
  }, [autoPlayInView, saveData]);

  useEffect(() => {
    const el = ref.current;
    if (!active || !el) return;
    if (current && current !== el) current.pause();
    current = el;
    el.play().catch(() => undefined);
  }, [active]);

  const poster = media.sources.find((s) => s.width >= 640) ?? media.sources.at(-1);
  if (!media.videoUrl) return null;
  return (
    <div className={cn("relative overflow-hidden bg-ink", className)}>
      <video
        ref={ref}
        src={active ? media.videoUrl : undefined}
        poster={poster?.url}
        preload="none"
        playsInline
        muted={autoPlayInView}
        loop={autoPlayInView}
        controls={active && !autoPlayInView}
        onPlay={(e) => {
          if (current && current !== e.currentTarget) current.pause();
          current = e.currentTarget;
        }}
        className="size-full object-cover"
        aria-label={media.alt ?? "Video"}
        data-sizes={sizes}
      />
      {!active && (
        <button type="button" onClick={() => setActive(true)} className="absolute inset-0 flex items-center justify-center bg-black/10 transition-colors hover:bg-black/20" aria-label="Play video">
          <span className="flex size-14 items-center justify-center rounded-full bg-white/90 text-ink shadow-md backdrop-blur">
            <Play className="ml-0.5 size-6 fill-current" />
          </span>
          {media.durationSeconds ? (
            <span className="absolute bottom-2.5 right-2.5 rounded bg-black/60 px-1.5 py-0.5 text-[11px] font-medium text-white tabular">
              {Math.floor(media.durationSeconds / 60)}:{String(Math.round(media.durationSeconds % 60)).padStart(2, "0")}
            </span>
          ) : null}
        </button>
      )}
    </div>
  );
}

export function Avatar({ name, media, size = 40, className }: { name: string; media?: MediaLike | null; size?: number; className?: string }) {
  const initials = name
    .split(/\s+/)
    .filter(Boolean)
    .slice(0, 2)
    .map((p) => p[0]!.toUpperCase())
    .join("");
  return (
    <span
      className={cn("relative inline-flex shrink-0 items-center justify-center overflow-hidden rounded-full bg-surface-3 font-medium text-ink-2", className)}
      style={{ width: size, height: size, fontSize: Math.max(11, size * 0.36) }}
      aria-hidden={!media}
    >
      {media && media.sources.length ? (
        // eslint-disable-next-line @next/next/no-img-element
        <img src={(media.sources.find((s) => s.width >= size * 2) ?? media.sources.at(-1))!.url} alt={name} className="size-full object-cover" loading="lazy" />
      ) : (
        initials
      )}
    </span>
  );
}
