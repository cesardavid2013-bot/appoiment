"use client";

import { BadgeCheck, ChevronRight, Zap } from "lucide-react";
import Link from "next/link";
import { formatMoney, formatPriceLabel } from "@/domain/money";
import { RatingInline } from "@/components/ui/misc";
import { Avatar, MediaImage, type MediaLike } from "@/components/ui/media";
import { useLocale, useT } from "@/i18n/client";
import { categoryName, priceWords } from "@/i18n/helpers";
import { fmtDate, fmtTime, relativeDayWord } from "@/lib/format";
import { cn } from "@/lib/cn";
import { useNow } from "@/lib/use-now";
import { FavoriteButton } from "./favorite-button";
import { NoirCover } from "./monogram";

export type CardService = { id: string; name: string; priceType: string; priceCents: number; salePriceCents: number | null; priceMaxCents: number | null; durationMinutes: number };

export type CardBusiness = {
  id: string;
  slug: string;
  name: string;
  tagline: string | null;
  city: string | null;
  categoryName: string | null;
  /** Primary category slug, used to show the category in the viewer's language. */
  categorySlug?: string | null;
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

function dayLabel(iso: string, tz: string, intl: string, now: number) {
  return relativeDayWord(iso, tz, intl, new Date(now)) ?? fmtDate(iso, tz, { weekday: "short", month: "short", day: "numeric" }, intl);
}

/** "3 PM" rather than "3:00 PM" on 12-hour clocks; 24-hour clocks keep "15:00". */
function shortTime(iso: string, tz: string, intl: string) {
  const parts = new Intl.DateTimeFormat(intl, { hour: "numeric", minute: "2-digit", timeZone: tz }).formatToParts(new Date(iso));
  const minute = parts.find((p) => p.type === "minute")?.value;
  if (minute !== "00" || !parts.some((p) => p.type === "dayPeriod")) return parts.map((p) => p.value).join("");
  const i = parts.findIndex((p) => p.type === "minute");
  return parts
    .filter((_, j) => j !== i && !(j === i - 1 && parts[j].type === "literal"))
    .map((p) => p.value)
    .join("");
}

function distanceLabel(km: number | null, intl: string, lessThanOne: string) {
  if (km == null) return null;
  return km < 1 ? lessThanOne : new Intl.NumberFormat(intl, { style: "unit", unit: "kilometer", maximumFractionDigits: km < 10 ? 1 : 0 }).format(km);
}

/**
 * Listing card. Shows what people actually decide on — who, how well rated,
 * what it costs, and when they can go — with real openings bookable in one tap.
 */
export function BusinessCard({ b, favorite, signedIn, priority, className }: { b: CardBusiness; favorite: boolean; signedIn: boolean; priority?: boolean; className?: string }) {
  const t = useT("business");
  const tr = useT();
  const { intl } = useLocale();
  const now = useNow();
  const category = b.categoryName ? categoryName(tr, b.categorySlug, b.categoryName) : null;
  const where = b.offersVirtual && !b.city ? t("card.online") : b.offersMobile ? (b.city ? t("card.comesToYouIn", { city: b.city }) : t("card.comesToYou")) : b.city;
  const meta = [category, where, distanceLabel(b.distanceKm, intl, t("card.lessThanOneKm"))].filter(Boolean).join(" · ");
  const slots = b.nextSlots ?? (b.nextAvailable ? [b.nextAvailable] : []);
  const services = (b.topServices ?? []).slice(0, 2);
  const words = priceWords(tr);
  // Promoted cards carry ?ref=spotlight so the profile visit counts as a Spotlight click.
  const profileHref = b.promoted ? `/${b.slug}?ref=spotlight` : `/${b.slug}`;
  const bookHref = (start?: string) => `/${b.slug}/book?service=${b.nextServiceId ?? ""}${start ? `&start=${encodeURIComponent(start)}` : ""}`;

  return (
    <article className={cn("group relative flex flex-col overflow-hidden rounded-xl border border-line bg-surface transition-[box-shadow,border-color,transform] duration-300 hover:-translate-y-0.5 hover:border-line-strong hover:shadow-lg", className)}>
      <Link href={profileHref} tabIndex={-1} aria-hidden className="relative block aspect-[16/11] overflow-hidden">
        {b.cover ? (
          <MediaImage media={b.cover} alt="" sizes="(min-width: 1280px) 25vw, (min-width: 768px) 33vw, 92vw" priority={priority} className="size-full transition-transform duration-700 group-hover:scale-[1.04]" />
        ) : (
          <NoirCover name={b.name} label={category} className="size-full transition-transform duration-700 group-hover:scale-[1.02]" />
        )}
        {b.logo && b.cover && (
          <span className="absolute bottom-3 start-3 overflow-hidden rounded-full ring-2 ring-surface">
            <Avatar name={b.name} media={b.logo} size={36} />
          </span>
        )}
        {b.promoted && <span className="absolute start-3 top-3 rounded-sm bg-bg/90 px-1.5 py-0.5 text-[10px] font-semibold uppercase tracking-[0.14em] text-ink">{t("card.promoted")}</span>}
      </Link>

      <div className="flex flex-1 flex-col p-4 sm:p-5">
        <h3 className="flex items-center gap-1.5 font-display text-[23px] leading-tight text-ink">
          <Link href={profileHref} className="truncate after:absolute after:inset-0 after:content-[''] focus-visible:outline-none group-has-[a:focus-visible]:underline">
            {b.name}
          </Link>
          {b.verified && <BadgeCheck className="size-[18px] shrink-0 text-gold" aria-label={t("card.verified")} />}
        </h3>
        <p className="mt-1 truncate text-[13px] text-ink-3">{meta}</p>
        <div className="mt-1.5">
          <RatingInline avg={b.ratingAvg} count={b.ratingCount} labels={{ new: tr("common.rating.new"), summary: tr("common.rating.summary", { avg: b.ratingAvg?.toFixed(1), count: b.ratingCount }) }} />
        </div>

        {services.length > 0 && (
          <ul className="relative z-10 mt-4 space-y-1.5">
            {services.map((s) => (
              <li key={s.id}>
                <Link href={`/${b.slug}/book?service=${s.id}`} className="flex items-baseline gap-2 text-[13.5px] hover:text-ink">
                  <span className="min-w-0 truncate text-ink-2">{s.name}</span>
                  <span className="leader" aria-hidden />
                  <span className="shrink-0 font-medium text-ink tabular">{formatPriceLabel(s, b.currency, { intl, words })}</span>
                </Link>
              </li>
            ))}
          </ul>
        )}

        <div className="relative z-10 mt-auto pt-4">
          {slots.length > 0 ? (
            <div className="border-t border-line pt-3.5">
              <p className="mb-2.5 flex items-center gap-1.5 text-[10px] font-semibold uppercase tracking-[0.16em] text-ink-3">
                {b.instant && <Zap className="size-3 text-accent" aria-hidden />}
                {dayLabel(slots[0], b.timezone, intl, now)}
                <span aria-hidden>·</span>
                <span className="min-w-0 truncate">{b.instant ? t("card.instant") : t("card.request")}</span>
              </p>
              <div className="flex items-center gap-1.5">
                {slots.slice(0, 3).map((s) => (
                  <Link
                    key={s}
                    href={bookHref(s)}
                    className="flex h-9 min-w-0 flex-1 items-center justify-center rounded-md border border-accent/30 text-[13px] font-semibold text-accent-text tabular transition-colors hover:border-accent hover:bg-accent hover:text-accent-ink"
                    aria-label={t("card.bookAt", { day: dayLabel(s, b.timezone, intl, now), time: fmtTime(s, b.timezone, intl) })}
                  >
                    <span className="truncate px-1">{shortTime(s, b.timezone, intl)}</span>
                  </Link>
                ))}
                <Link href={bookHref()} className="flex h-9 w-9 shrink-0 items-center justify-center rounded-md border border-line text-ink-3 hover:border-line-strong hover:text-ink" aria-label={t("card.moreTimes")}>
                  <ChevronRight className="size-4" />
                </Link>
              </div>
            </div>
          ) : (
            <div className="flex items-center justify-between gap-3 border-t border-line pt-3.5 text-[13px]">
              <span className="min-w-0 truncate text-ink-3">{b.priceMinCents != null ? (b.priceMinCents === 0 ? t("card.freeConsultation") : words.from(formatMoney(b.priceMinCents, b.currency, { compact: true, intl }))) : t("card.priceOnRequest")}</span>
              <Link href={profileHref} className="shrink-0 font-medium text-ink hover:underline">
                {t("card.viewTimes")}
              </Link>
            </div>
          )}
        </div>
      </div>

      <div className="absolute end-3 top-3 z-20">
        <FavoriteButton businessId={b.id} initial={favorite} signedIn={signedIn} variant="overlay" />
      </div>
    </article>
  );
}

export function BusinessCardSkeleton() {
  return (
    <div className="overflow-hidden rounded-xl border border-line bg-surface">
      <div className="skeleton aspect-[16/11] w-full" />
      <div className="p-4">
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
    </div>
  );
}
