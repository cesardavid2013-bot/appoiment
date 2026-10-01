export function formatMoney(cents: number, currency = "USD", opts: { compact?: boolean } = {}): string {
  const value = cents / 100;
  const whole = Number.isInteger(value);
  return new Intl.NumberFormat("en-US", {
    style: "currency",
    currency,
    minimumFractionDigits: opts.compact && whole ? 0 : 2,
    maximumFractionDigits: 2,
  }).format(value);
}

export function formatPriceLabel(
  s: { priceType: string; priceCents: number; salePriceCents?: number | null; priceMaxCents?: number | null },
  currency = "USD",
): string {
  const effective = s.salePriceCents != null && s.salePriceCents < s.priceCents ? s.salePriceCents : s.priceCents;
  switch (s.priceType) {
    case "free":
      return "Free";
    case "quote":
      return "Price on consultation";
    case "starting_at":
      return `From ${formatMoney(effective, currency, { compact: true })}`;
    case "range":
      return s.priceMaxCents != null
        ? `${formatMoney(effective, currency, { compact: true })}–${formatMoney(s.priceMaxCents, currency, { compact: true })}`
        : `From ${formatMoney(effective, currency, { compact: true })}`;
    default:
      return formatMoney(effective, currency, { compact: true });
  }
}

export function formatDuration(minutes: number): string {
  if (minutes < 60) return `${minutes} min`;
  const h = Math.floor(minutes / 60);
  const m = minutes % 60;
  return m === 0 ? `${h} hr` : `${h} hr ${m} min`;
}

/** Parses "12", "12.5", "$12.50" into cents. Returns null on invalid input. */
export function parseMoneyInput(input: string): number | null {
  const cleaned = input.replace(/[$,\s]/g, "");
  if (cleaned === "") return null;
  if (!/^\d+(\.\d{1,2})?$/.test(cleaned)) return null;
  return Math.round(Number(cleaned) * 100);
}
