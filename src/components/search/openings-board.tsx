import { ArrowUpRight } from "lucide-react";
import Link from "next/link";
import { formatPriceLabel } from "@/domain/money";
import { fmtTime, localDateKey } from "@/lib/format";
import type { CardBusiness } from "@/components/business/business-card";

function when(iso: string, tz: string) {
  const d = localDateKey(iso, tz);
  if (d === localDateKey(new Date(), tz)) return "Today";
  if (d === localDateKey(new Date(Date.now() + 86_400_000), tz)) return "Tomorrow";
  return new Intl.DateTimeFormat("en-US", { weekday: "short", timeZone: tz }).format(new Date(iso));
}

/** A live departures-style board of real openings across professionals. */
export function OpeningsBoard({ items }: { items: CardBusiness[] }) {
  const rows = items
    .filter((b) => b.nextSlots?.length && b.nextServiceId)
    .map((b) => ({ b, start: b.nextSlots![0], service: b.topServices?.find((s) => s.id === b.nextServiceId) ?? b.topServices?.[0] }))
    .sort((x, y) => new Date(x.start).getTime() - new Date(y.start).getTime())
    .slice(0, 5);
  if (!rows.length) return null;
  return (
    <section aria-labelledby="openings" className="overflow-hidden rounded-xl border border-line bg-surface shadow-md">
      <div className="flex items-center justify-between border-b border-line px-5 py-3.5">
        <h2 id="openings" className="flex items-center gap-2 text-sm font-semibold text-ink">
          <span className="relative flex size-2">
            <span className="absolute inline-flex size-full animate-ping rounded-full bg-accent opacity-50 motion-reduce:hidden" />
            <span className="relative inline-flex size-2 rounded-full bg-accent" />
          </span>
          Opening soon
        </h2>
        <span className="text-[12px] text-ink-3">Live from calendars</span>
      </div>
      <ul className="divide-y divide-line">
        {rows.map(({ b, start, service }) => (
          <li key={b.id}>
            <Link href={`/${b.slug}/book?service=${b.nextServiceId}&start=${encodeURIComponent(start)}`} className="group grid grid-cols-[84px_1fr_auto] items-center gap-4 px-5 py-3.5 transition-colors hover:bg-surface-2/70">
              <div className="leading-tight">
                <div className="text-[11px] font-medium uppercase tracking-wide text-ink-3">{when(start, b.timezone)}</div>
                <div className="whitespace-nowrap text-[17px] font-semibold text-ink tabular">{fmtTime(start, b.timezone)}</div>
              </div>
              <div className="min-w-0">
                <div className="truncate text-sm font-medium text-ink">{service?.name ?? "Appointment"}</div>
                <div className="truncate text-[13px] text-ink-3">
                  {b.name}
                  {b.city ? ` · ${b.city}` : ""}
                </div>
              </div>
              <div className="flex items-center gap-2 text-sm font-medium text-ink tabular">
                {service && formatPriceLabel(service, b.currency)}
                <ArrowUpRight className="size-4 text-ink-3 transition-transform group-hover:-translate-y-0.5 group-hover:translate-x-0.5 group-hover:text-ink" />
              </div>
            </Link>
          </li>
        ))}
      </ul>
    </section>
  );
}
