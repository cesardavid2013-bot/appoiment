import { ArrowUpRight } from "lucide-react";
import Link from "next/link";
import { formatPriceLabel } from "@/domain/money";
import { priceWords } from "@/i18n/helpers";
import { getI18n, getT } from "@/i18n/server";
import { fmtDate, fmtTime, relativeDayWord } from "@/lib/format";
import { requestNow } from "@/server/clock";
import type { CardBusiness } from "@/components/business/business-card";

/** A live departures-style board of real openings across professionals. */
export async function OpeningsBoard({ items }: { items: CardBusiness[] }) {
  const rows = items
    .filter((b) => b.nextSlots?.length && b.nextServiceId)
    .map((b) => ({ b, start: b.nextSlots![0], service: b.topServices?.find((s) => s.id === b.nextServiceId) ?? b.topServices?.[0] }))
    .sort((x, y) => new Date(x.start).getTime() - new Date(y.start).getTime())
    .slice(0, 5);
  if (!rows.length) return null;
  const [t, tr, { intl }] = await Promise.all([getT("home"), getT(), getI18n()]);
  const now = new Date(requestNow());
  const words = priceWords(tr);
  const when = (iso: string, tz: string) => relativeDayWord(iso, tz, intl, now) ?? fmtDate(iso, tz, { weekday: "short" }, intl);
  return (
    <section aria-labelledby="openings" className="overflow-hidden rounded-xl border border-line bg-surface shadow-lg">
      <div className="flex items-center justify-between gap-3 border-b border-line px-5 py-3.5">
        <h2 id="openings" className="eyebrow flex items-center gap-2 !text-ink">
          <span className="relative flex size-2">
            <span className="absolute inline-flex size-full animate-ping rounded-full bg-accent opacity-50 motion-reduce:hidden" />
            <span className="relative inline-flex size-2 rounded-full bg-accent" />
          </span>
          {t("openings.title")}
        </h2>
        <span className="text-end text-[12px] text-ink-3">{t("openings.live")}</span>
      </div>
      <ul className="divide-y divide-line">
        {rows.map(({ b, start, service }) => (
          <li key={b.id}>
            <Link href={`/${b.slug}/book?service=${b.nextServiceId}&start=${encodeURIComponent(start)}`} className="group grid grid-cols-[96px_1fr_auto] items-center gap-4 px-5 py-3.5 transition-colors hover:bg-surface-2/70">
              <div className="leading-tight">
                <div className="truncate text-[10px] font-semibold uppercase tracking-[0.16em] text-gold-text">{when(start, b.timezone)}</div>
                <div className="mt-0.5 whitespace-nowrap font-display text-[24px] leading-none text-ink">{fmtTime(start, b.timezone, intl)}</div>
              </div>
              <div className="min-w-0">
                <div className="truncate text-sm font-medium text-ink">{service?.name ?? t("openings.appointment")}</div>
                <div className="truncate text-[13px] text-ink-3">
                  {b.name}
                  {b.city ? ` · ${b.city}` : ""}
                </div>
              </div>
              <div className="flex items-center gap-2 text-sm font-medium text-ink tabular">
                {service && formatPriceLabel(service, b.currency, { intl, words })}
                <ArrowUpRight className="size-4 text-ink-3 transition-transform group-hover:-translate-y-0.5 group-hover:translate-x-0.5 group-hover:text-ink rtl:group-hover:-translate-x-0.5" />
              </div>
            </Link>
          </li>
        ))}
      </ul>
    </section>
  );
}
