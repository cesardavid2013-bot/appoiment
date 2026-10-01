import type { PriceWords } from "@/domain/money";
import type { TFunction } from "./translate";

/** Words used inside price labels ("From $40", "Free"), from the common namespace. */
export function priceWords(t: TFunction): PriceWords {
  return { free: t("common.price.free"), quote: t("common.price.quote"), from: (price) => t("common.price.from", { price }) };
}

/** Category names come from the database in English; translations are keyed by slug. */
export function categoryName(t: TFunction, slug: string | null | undefined, fallback: string | null | undefined): string {
  if (!slug) return fallback ?? "";
  const key = `categories.${slug}.name`;
  const v = t(key);
  return v === key ? (fallback ?? slug) : v;
}
export function categoryDescription(t: TFunction, slug: string, fallback: string | null | undefined): string {
  const key = `categories.${slug}.description`;
  const v = t(key);
  return v === key ? (fallback ?? "") : v;
}
