import Link from "next/link";
import { getT } from "@/i18n/server";

export default async function NotFound() {
  const t = await getT("common.notFound");
  return (
    <main className="theme-noir relative flex min-h-[70dvh] flex-col bg-bg text-ink">
      <div className="pointer-events-none absolute inset-3 border border-gold/20 sm:inset-5" aria-hidden />
      <div className="pointer-events-none absolute inset-0 [background:radial-gradient(70%_60%_at_80%_0%,rgb(201_168_101/0.12),transparent_65%)]" aria-hidden />
      <section className="relative mx-auto flex w-full max-w-7xl flex-1 flex-col justify-center px-6 py-20 sm:px-10 lg:px-14">
        <p className="eyebrow !text-gold-text">{t("eyebrow")}</p>
        <h1 className="mt-5 max-w-3xl font-display text-[44px] leading-[0.98] tracking-[-0.02em] text-balance sm:text-7xl">{t("title")}</h1>
        <p className="mt-5 max-w-md text-[16px] leading-relaxed text-ink-2">{t("body")}</p>
        <div className="mt-8 flex flex-wrap gap-2">
          <Link href="/" className="inline-flex h-11 items-center bg-ink px-5 text-sm font-medium text-bg hover:bg-ink/90">
            {t("home")}
          </Link>
          <Link href="/explore" className="inline-flex h-11 items-center border border-line-strong px-5 text-sm font-medium text-ink hover:border-gold hover:text-gold-text">
            {t("explore")}
          </Link>
        </div>
      </section>
    </main>
  );
}
