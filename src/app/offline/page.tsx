import type { Metadata } from "next";
import { getT } from "@/i18n/server";

export const metadata: Metadata = { robots: { index: false } };

/** Shown by the service worker when there is no connection. Static on purpose: it is cached once. */
export default async function OfflinePage() {
  const t = await getT("common.offline");
  return (
    <main className="theme-noir flex min-h-dvh flex-col justify-center bg-bg px-6 text-ink sm:px-10">
      <p className="eyebrow !text-gold-text">{t("eyebrow")}</p>
      <h1 className="mt-5 max-w-2xl font-display text-[44px] leading-[1] tracking-[-0.02em] text-balance sm:text-6xl">{t("title")}</h1>
      <p className="mt-5 max-w-md text-[16px] leading-relaxed text-ink-2">{t("body")}</p>
    </main>
  );
}
