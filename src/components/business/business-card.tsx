import { BadgeCheck, ChevronRight, Zap } from "lucide-react";
import Link from "next/link";
import { formatDuration, formatMoney, formatPriceLabel } from "@/domain/money";
import { RatingInline } from "@/components/ui/misc";
import { Avatar, MediaImage, type MediaLike } from "@/components/ui/media";
import { fmtTime, localDateKey } from "@/lib/format";
import { cn } from "@/lib/cn";
import { FavoriteButton } from "./favorite-button";
import { toneFor } from "./monogram";

export type CardService = { id: string; name: string; priceType: string; priceCents: number; salePriceCents: number | null; priceMaxCents: number | null; durationMinutes: number };

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
  logo?: MediaLike | null;
  nextAvailable: string | null;
  nextSlots?: string[];
  nextServiceId?: string | null;
  topServices?: CardService[];
  timezone: string;
  promoted?: boolean;
};

function dayLabel(iso: string, tz: string) {
  const d = localDateKey(iso, tz);
  const today = localDateKey(new Date(), tz);
  const tomorrow = localDateKey(new Date(Date.now() + 86_400_000), tz);
  if (d === today) return "Today";
  if (d === tomorrow) return "Tomorrow";
  return new Intl.DateTimeFormat("en-US", { weekday: "short", month: "short", day: "numeric", timeZone: tz }).format(new Date(iso));
}

function distanceLabel(km: number | null) {
  if (km == null) return null;
  return km < 1 ? "<1 km" : `${km.toFixed(km < 10 ? 1 : 0)} km`;
}

/**
 * Listing card. Shows what people actually decide on — who, how well rated,
 * what it costs, and when they can go — with real openings bookable in one tap.
 */
export function BusinessCard({ b, favorite, signedIn, priority, className }: { b: CardBusiness; favorite: boolean; signedIn: boolean; priority?: boolean; className?: string }) {
  const where = b.offersVirtual && !b.city ? "Online" : b.offersMobile ? `Comes to you${b.city ? ` · ${b.city}` : ""}` : b.city;
  const meta = [b.categoryName, where, distanceLabel(b.distanceKm)].filter(Boolean).join(" · ");
  const slots = b.nextSlots ?? (b.nextAvailable ? [b.nextAvailable] : []);
  const services = (b.topServices ?? []).slice(0, 2);
  const bookHref = (start?: string) => `/${b.slug}/book?service=${b.nextServiceId ?? ""}${start ? `&start=${encodeURIComponent(start)}` : ""}`;

  return (
    <article className={cn("group relative flex flex-col overflow-hidden rounded-xl border border-line bg-surface transition-[box-shadow,border-color] duration-200 hover:border-line-strong hover:shadow-md", className)}>
      {b.cover && (
        <Link href={`/${b.slug}`} tabIndex={-1} aria-hidden className="relative block aspect-[16/10] overflow-hidden">
          <MediaImage media={b.cover} alt="" sizes="(min-width: 1280px) 25vw, (min-width: 768px) 33vw, 92vw" priority={priority} className="size-full transition-transform duration-500 group-hover:scale-[1.02]" />
        </Link>
      )}

      <div className="flex flex-1 flex-col p-4">
        <div className="flex items-start gap-3">
          <Link href={`/${b.slug}`} className="shrink-0 rounded-full outline-offset-2" tabIndex={-1} aria-hidden>
            {b.logo ? (
              <Avatar name={b.name} media={b.logo} size={44} />
            ) : (
              <span className={cn("flex size-11 items-center justify-center rounded-full font-display text-xl", toneFor(b.name))}>
                {b.name.replace(/[^\p{L}\p{N} ]/gu, "").split(" ").filter(Boolean).slice(0, 2).map((w) => w[0]).join("").toUpperCase()}
              </span>
            )}
          </Link>
          <div className="min-w-0 flex-1">
            <h3 className="flex items-center gap-1 pr-9 text-[15px] font-semibold leading-snug text-ink">
              <Link href={`/${b.slug}`} className="truncate after:absolute after:inset-0 after:content-[''] focus-visible:outline-none group-has-[a:focus-visible]:underline">
                {b.name}
              </Link>
              {b.verified && <BadgeCheck className="size-4 shrink-0 text-accent" aria-label="Verified business" />}
            </h3>
            <p className="mt-0.5 truncate text-[13px] text-ink-3">{meta}</p>
            <div className="mt-1 flex items-center gap-2">
              <RatingInline avg={b.ratingAvg} count={b.ratingCount} />
              {b.promoted && <span className="text-[11px] font-medium uppercase tracking-wide text-ink-3">· Promoted</span>}
            </div>
          </div>
        </div>

        {services.length > 0 && (
          <ul className="relative z-10 mt-4 divide-y divide-line border-y border-line">
            {services.map((s) => (
              <li key={s.id}>
                <Link href={`/${b.slug}/book?service=${s.id}`} className="flex items-center gap-3 py-2.5 text-[13px] hover:bg-surface-2/60">
                  <span className="min-w-0 flex-1 truncate font-medium text-ink">{s.name}</span>
                  <span className="shrink-0 text-ink-3 tabular">{formatDuration(s.durationMinutes)}</span>
                  <span className="w-[72px] shrink-0 text-right font-medium text-ink tabular">{formatPriceLabel(s, b.currency)}</span>
                </Link>
              </li>
            ))}
          </ul>
        )}

        <div className="relative z-10 mt-auto pt-3.5">
          {slots.length > 0 ? (
            <div>
              <p className="mb-2 flex items-center gap-1.5 text-[12px] font-medium text-ink-3">
                {b.instant && <Zap className="size-3.5 text-accent" aria-hidden />}
                {dayLabel(slots[0], b.timezone)}
                {b.instant ? " · instant confirmation" : " · request to book"}
              </p>
              <div className="flex items-center gap-1.5">
                {slots.slice(0, 3).map((s) => (
                  <Link
                    key={s}
                    href={bookHref(s)}
                    className="flex h-8 flex-1 items-center justify-center rounded-md border border-accent/25 bg-accent-soft text-[13px] font-semibold text-accent-text tabular transition-colors hover:border-accent hover:bg-accent hover:text-accent-ink"
                    aria-label={`Book ${dayLabel(s, b.timezone)} at ${fmtTime(s, b.timezone)}`}
                  >
                    {fmtTime(s, b.timezone).replace(":00", "")}
                  </Link>
                ))}
                <Link href={bookHref()} className="flex h-8 w-9 shrink-0 items-center justify-center rounded-md border border-line text-ink-3 hover:border-line-strong hover:text-ink" aria-label="More times">
                  <ChevronRight className="size-4" />
                </Link>
              </div>
            </div>
          ) : (
            <div className="flex items-center justify-between text-[13px]">
              <span className="text-ink-3">{b.priceMinCents != null ? (b.priceMinCents === 0 ? "Free consultation available" : `From ${formatMoney(b.priceMinCents, b.currency, { compact: true })}`) : "Price on request"}</span>
              <Link href={`/${b.slug}`} className="font-medium text-ink hover:underline">
                View times
              </Link>
            </div>
          )}
        </div>
      </div>

      <div className="absolute right-3 top-3 z-20">
        <FavoriteButton businessId={b.id} initial={favorite} signedIn={signedIn} variant={b.cover ? "overlay" : "ghost"} />
      </div>
    </article>
  );
}

export function BusinessCardSkeleton() {
  return (
    <div className="rounded-xl border border-line bg-surface p-4">
      <div className="flex gap-3">
        <div className="skeleton size-11 rounded-full" />
        <div className="flex-1 space-y-2 pt-1">
          <div className="skeleton h-4 w-2/3 rounded" />
          <div className="skeleton h-3 w-1/2 rounded" />
        </div>
      </div>
      <div className="mt-4 space-y-2.5">
        <div className="skeleton h-3.5 w-full rounded" />
        <div className="skeleton h-3.5 w-5/6 rounded" />
      </div>
      <div className="mt-4 flex gap-1.5">
        <div className="skeleton h-8 flex-1 rounded-md" />
        <div className="skeleton h-8 flex-1 rounded-md" />
        <div className="skeleton h-8 flex-1 rounded-md" />
      </div>
    </div>
  );
}
