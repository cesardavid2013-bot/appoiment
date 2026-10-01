"use client";

import { Globe } from "lucide-react";
import { useRouter } from "next/navigation";
import { useTransition } from "react";
import { useLocale, useT } from "@/i18n/client";
import { LOCALE_COOKIE, LOCALES, type Locale } from "@/i18n/locales";
import { api } from "@/lib/api";
import { cn } from "@/lib/cn";

/**
 * Choose the interface language. Remembered for a year on this device, and saved
 * to the account when signed in so emails and notifications follow it.
 * `compact` is the header version: a globe and the language code, same native list.
 */
export function LanguagePicker({ className, compact }: { className?: string; compact?: boolean }) {
  const { locale } = useLocale();
  const t = useT("common");
  const router = useRouter();
  const [pending, start] = useTransition();
  const current = LOCALES.find((l) => l.code === locale);
  return (
    <label
      title={compact ? t("language") : undefined}
      className={cn(
        "relative inline-flex items-center text-sm text-ink focus-within:ring-3 focus-within:ring-accent/15",
        compact ? "h-9 gap-1.5 rounded-md px-2.5 text-ink-2 hover:bg-surface-2 hover:text-ink" : "h-10 gap-2 rounded-md border border-line-strong bg-surface pe-8 ps-3",
        pending && "opacity-60",
        className,
      )}
    >
      <Globe className={cn("text-ink-3", compact ? "size-[17px]" : "size-4")} aria-hidden />
      <select
        value={locale}
        onChange={(e) => {
          const next = e.target.value as Locale;
          // Set it here so the switch is instant even offline; the API also saves it to the account.
          document.cookie = `${LOCALE_COOKIE}=${next}; path=/; max-age=${60 * 60 * 24 * 365}; samesite=lax`;
          start(async () => {
            await api("/api/me/locale", { body: { locale: next } }).catch(() => undefined);
            router.refresh();
          });
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
      {compact ? (
        <span aria-hidden className="text-[13px] font-medium uppercase tracking-wide tabular">
          {locale}
        </span>
      ) : (
        <>
          <span aria-hidden>{current?.name}</span>
          <svg className="pointer-events-none absolute end-2.5 top-1/2 size-4 -translate-y-1/2 text-ink-3" viewBox="0 0 16 16" fill="none" aria-hidden>
            <path d="M4 6l4 4 4-4" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" />
          </svg>
        </>
      )}
    </label>
  );
}
