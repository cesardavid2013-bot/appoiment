import { BadgeCheck, MapPin, Zap } from "lucide-react";
import Link from "next/link";
import { formatMoney } from "@/domain/money";
import { RatingInline } from "@/components/ui/misc";
import { MediaImage, type MediaLike } from "@/components/ui/media";
import { fmtRelativeSlot } from "@/lib/format";
import { cn } from "@/lib/cn";
import { FavoriteButton } from "./favorite-button";
import { MonogramCover } from "./monogram";

export type CardBusiness = {
  id: string;
  slug: string;
  name: string;
  tagline: string | null;
  city: string | null;
  categoryName: string | null;
  ratingAvg: number | null;
  ratingCount: number;
  priceMinCents: number | null;
  currency: string;
  verified: boolean;
  offersMobile: boolean;
  offersVirtual: boolean;
  instant: boolean;
  distanceKm: number | null;
  cover: MediaLike | null;
  nextAvailable: string | null;
  timezone: string;
  promoted?: boolean;
};

export function BusinessCard({ b, favorite, signedIn, priority, className, onHover }: { b: CardBusiness; favorite: boolean; signedIn: boolean; priority?: boolean; className?: string; onHover?: boolean }) {
  const meta = [b.categoryName, b.offersVirtual && !b.city ? "Online" : b.city, b.distanceKm != null ? `${b.distanceKm < 1 ? "<1" : b.distanceKm.toFixed(b.distanceKm < 10 ? 1 : 0)} km` : null].filter(Boolean);
  return (
    <article className={cn("group relative", className)} data-hover={onHover || undefined}>
      <Link href={`/${b.slug}`} className="block rounded-lg outline-offset-4">
        <div className="relative aspect-[4/3] overflow-hidden rounded-lg">
          {b.cover ? (
            <MediaImage media={b.cover} alt={`${b.name}`} sizes="(min-width: 1280px) 25vw, (min-width: 768px) 33vw, 92vw" priority={priority} className="size-full transition-transform duration-500 group-hover:scale-[1.02]" />
          ) : (
            <MonogramCover name={b.name} label={b.categoryName} className="size-full" />
          )}
          {b.promoted && <span className="absolute left-3 top-3 rounded-sm bg-surface/90 px-1.5 py-0.5 text-[11px] font-medium text-ink-2 backdrop-blur">Promoted</span>}
        </div>
        <div className="mt-3 space-y-1">
          <div className="flex items-start justify-between gap-3">
            <h3 className="flex min-w-0 items-center gap-1 text-[15px] font-semibold leading-snug text-ink">
              <span className="truncate">{b.name}</span>
              {b.verified && <BadgeCheck className="size-4 shrink-0 text-accent" aria-label="Verified business" />}
            </h3>
            <RatingInline avg={b.ratingAvg} count={b.ratingCount} className="shrink-0 pt-px" />
          </div>
          <p className="flex items-center gap-1 truncate text-[13px] text-ink-3">
            {b.city && <MapPin className="size-3.5 shrink-0" aria-hidden />}
            {meta.join(" · ")}
          </p>
          <div className="flex items-center justify-between gap-2 pt-0.5 text-[13px]">
            <span className="text-ink-2">{b.priceMinCents != null ? (b.priceMinCents === 0 ? "Free options" : `From ${formatMoney(b.priceMinCents, b.currency, { compact: true })}`) : "Price on request"}</span>
            {b.nextAvailable ? (
              <span className="inline-flex items-center gap-1 font-medium text-accent-text">
                {b.instant && <Zap className="size-3.5" aria-label="Instant booking" />}
                {fmtRelativeSlot(b.nextAvailable, b.timezone)}
              </span>
            ) : (
              <span className="text-ink-3">{b.offersMobile ? "Comes to you" : ""}</span>
            )}
          </div>
        </div>
      </Link>
      <div className="absolute right-3 top-3">
        <FavoriteButton businessId={b.id} initial={favorite} signedIn={signedIn} />
      </div>
    </article>
  );
}

export function BusinessCardSkeleton() {
  return (
    <div>
      <div className="skeleton aspect-[4/3] rounded-lg" />
      <div className="mt-3 space-y-2">
        <div className="skeleton h-4 w-2/3 rounded" />
        <div className="skeleton h-3 w-1/2 rounded" />
        <div className="skeleton h-3 w-1/3 rounded" />
      </div>
    </div>
  );
}
