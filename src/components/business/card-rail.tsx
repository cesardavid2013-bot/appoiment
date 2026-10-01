import type { ReactNode } from "react";
import Link from "next/link";
import { ArrowRight } from "lucide-react";
import { getT } from "@/i18n/server";
import { BusinessCard, type CardBusiness } from "./business-card";

/** A titled row of business cards: horizontal scroll on phones, grid on larger screens. */
export async function CardRail({ id, title, subtitle, href, items, favorites, signedIn }: { id: string; title: string; subtitle?: ReactNode; href?: string; items: CardBusiness[]; favorites: Set<string>; signedIn: boolean }) {
  if (!items.length) return null;
  const t = await getT("business");
  return (
    <section className="mx-auto mt-20 max-w-7xl" aria-labelledby={`rail-${id}`}>
      <div className="mb-5 flex items-end justify-between gap-4 px-4 sm:px-6 lg:px-8">
        <div>
          <h2 id={`rail-${id}`} className="font-display text-[34px] leading-none text-ink sm:text-[40px]">
            {title}
          </h2>
          {subtitle && <p className="mt-2 text-sm text-ink-3">{subtitle}</p>}
        </div>
        {href && (
          <Link href={href} className="inline-flex shrink-0 items-center gap-1 text-sm font-medium text-ink-2 hover:text-ink">
            {t("rail.seeAll")} <ArrowRight className="size-4" />
          </Link>
        )}
      </div>
      <div className="relative flex snap-x snap-mandatory gap-4 overflow-x-auto px-4 pb-2 scrollbar-none sm:grid sm:grid-cols-2 sm:gap-6 sm:overflow-visible sm:px-6 md:grid-cols-3 lg:grid-cols-4 lg:px-8">
        {items.slice(0, 8).map((b, i) => (
          <BusinessCard key={b.id} b={b} favorite={favorites.has(b.id)} signedIn={signedIn} priority={i < 2} className="w-[78vw] max-w-[320px] shrink-0 snap-start sm:w-auto sm:max-w-none" />
        ))}
      </div>
    </section>
  );
}
