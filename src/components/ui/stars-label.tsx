"use client";

import { useLocale, useT } from "@/i18n/client";

/** Screen-reader text for a star rating ("4.8 out of 5 stars"), in the viewer's language. */
export function StarsLabel({ value }: { value: number }) {
  const t = useT("common.ui");
  const { intl } = useLocale();
  return <span className="sr-only">{t("stars", { value: value.toLocaleString(intl, { minimumFractionDigits: 1, maximumFractionDigits: 1 }) })}</span>;
}
