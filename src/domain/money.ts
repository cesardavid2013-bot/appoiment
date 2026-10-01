export function formatMoney(cents: number, currency = "USD", opts: { compact?: boolean; intl?: string } = {}): string {
  const value = cents / 100;
  const whole = Number.isInteger(value);
  try {
    return new Intl.NumberFormat(opts.intl ?? "en-US", {
      style: "currency",
      currency,
      minimumFractionDigits: opts.compact && whole ? 0 : 2,
      maximumFractionDigits: 2,
    }).format(value);
  } catch {
    // A bad currency code must never take a page down.
    return `${value.toFixed(opts.compact && whole ? 0 : 2)} ${String(currency).slice(0, 3).toUpperCase()}`;
  }
}

export type PriceWords = { free: string; quote: string; from: (price: string) => string };
const EN_PRICE_WORDS: PriceWords = { free: "Free", quote: "Price on consultation", from: (p) => `From ${p}` };

export function formatPriceLabel(
  s: { priceType: string; priceCents: number; salePriceCents?: number | null; priceMaxCents?: number | null },
  currency = "USD",
  opts: { intl?: string; words?: PriceWords } = {},
): string {
  const w = opts.words ?? EN_PRICE_WORDS;
  const m = (c: number) => formatMoney(c, currency, { compact: true, intl: opts.intl });
  const effective = s.salePriceCents != null && s.salePriceCents < s.priceCents ? s.salePriceCents : s.priceCents;
  switch (s.priceType) {
    case "free":
      return w.free;
    case "quote":
      return w.quote;
    case "starting_at":
      return w.from(m(effective));
    case "range":
      return s.priceMaxCents != null ? `${m(effective)}–${m(s.priceMaxCents)}` : w.from(m(effective));
    default:
      return m(effective);
  }
}

export function formatDuration(minutes: number, intl = "en-US"): string {
  const h = Math.floor(minutes / 60);
  const m = minutes % 60;
  if (intl.startsWith("en")) {
    if (minutes < 60) return `${minutes} min`;
    return m === 0 ? `${h} hr` : `${h} hr ${m} min`;
  }
  // Intl.DurationFormat isn't everywhere yet; unit formatting covers every language we ship.
  const unit = (v: number, u: "hour" | "minute") => new Intl.NumberFormat(intl, { style: "unit", unit: u, unitDisplay: "short" }).format(v);
  if (minutes < 60) return unit(minutes, "minute");
  return m === 0 ? unit(h, "hour") : `${unit(h, "hour")} ${unit(m, "minute")}`;
}

/** Parses "12", "12.5", "$12.50" into cents. Returns null on invalid input. */
export function parseMoneyInput(input: string): number | null {
  const cleaned = input.replace(/[$,\s]/g, "");
  if (cleaned === "") return null;
  if (!/^\d+(\.\d{1,2})?$/.test(cleaned)) return null;
  return Math.round(Number(cleaned) * 100);
}
