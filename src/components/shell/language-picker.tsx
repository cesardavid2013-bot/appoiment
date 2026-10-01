"use client";

import { Globe } from "lucide-react";
import { useRouter } from "next/navigation";
import { useTransition } from "react";
import { useLocale, useT } from "@/i18n/client";
import { LOCALE_COOKIE, LOCALES, type Locale } from "@/i18n/locales";
import { cn } from "@/lib/cn";

/** Choose the interface language. Remembered for a year on this device. */
export function LanguagePicker({ className }: { className?: string }) {
  const { locale } = useLocale();
  const t = useT("common");
  const router = useRouter();
  const [pending, start] = useTransition();
  return (
    <label className={cn("relative inline-flex h-10 items-center gap-2 rounded-md border border-line-strong bg-surface pe-8 ps-3 text-sm text-ink focus-within:ring-3 focus-within:ring-accent/15", pending && "opacity-60", className)}>
      <Globe className="size-4 text-ink-3" aria-hidden />
      <span className="sr-only">{t("language")}</span>
      <select
        value={locale}
        onChange={(e) => {
          const next = e.target.value as Locale;
          document.cookie = `${LOCALE_COOKIE}=${next}; path=/; max-age=${60 * 60 * 24 * 365}; samesite=lax`;
          start(() => router.refresh());
        }}
        className="absolute inset-0 cursor-pointer appearance-none opacity-0"
        aria-label={t("language")}
      >
        {LOCALES.map((l) => (
          <option key={l.code} value={l.code} lang={l.intl}>
            {l.name}
            {l.name !== l.english ? ` — ${l.english}` : ""}
          </option>
        ))}
      </select>
      <span aria-hidden>{LOCALES.find((l) => l.code === locale)?.name}</span>
      <svg className="pointer-events-none absolute end-2.5 top-1/2 size-4 -translate-y-1/2 text-ink-3" viewBox="0 0 16 16" fill="none" aria-hidden>
        <path d="M4 6l4 4 4-4" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" />
      </svg>
    </label>
  );
}
