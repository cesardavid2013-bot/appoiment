import { SUPPORT_CATEGORY_KEYS, type SupportCategory } from "@/domain/support";

/** A ticket's category as a message key under `support.categories`; unknown values read as "other". */
export function categoryKey(category: string): SupportCategory {
  return (SUPPORT_CATEGORY_KEYS as readonly string[]).includes(category) ? (category as SupportCategory) : "other";
}
