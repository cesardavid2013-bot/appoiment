"use client";

import { useT } from "@/i18n/client";

/** "Optional" next to a field label, in the viewer's language (works under server components too). */
export function OptionalTag() {
  const t = useT("common.ui");
  return <span className="text-xs font-normal text-ink-3">{t("optional")}</span>;
}
