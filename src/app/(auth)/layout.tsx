import Link from "next/link";
import { Logo } from "@/components/shell/logo";
import { rich } from "@/i18n/rich";
import { getT } from "@/i18n/server";

export default async function AuthLayout({ children }: LayoutProps<"/">) {
  const t = await getT("auth");
  return (
    <div className="grid min-h-dvh lg:grid-cols-[minmax(0,1fr)_minmax(0,1.05fr)]">
      <aside className="theme-noir relative hidden flex-col justify-between overflow-hidden p-12 lg:flex xl:p-16">
        <div aria-hidden className="pointer-events-none absolute inset-0 [background:radial-gradient(900px_420px_at_0%_0%,rgb(201_168_101/0.12),transparent_60%)] rtl:[background:radial-gradient(900px_420px_at_100%_0%,rgb(201_168_101/0.12),transparent_60%)]" />
        <div aria-hidden className="pointer-events-none absolute inset-6 border border-gold/20" />
        <div className="relative">
          <Logo />
        </div>
        <div className="relative max-w-md">
          <p className="eyebrow !text-gold-text">{t("layout.eyebrow")}</p>
          <p className="mt-6 font-display text-[56px] leading-[1.02] text-ink xl:text-[64px]">{rich(t("layout.headline"), { em: (c) => <em className="italic text-gold-text">{c}</em> })}</p>
          <ul className="mt-10 space-y-3 text-[15px] text-ink-2">
            {(["openings", "prices", "reviews"] as const).map((k) => (
              <li key={k} className="flex items-center gap-3">
                <span className="h-px w-6 shrink-0 bg-gold" />
                {t(`layout.points.${k}`)}
              </li>
            ))}
          </ul>
        </div>
        <p className="relative text-[12px] text-ink-3">{t("layout.copyright", { year: String(new Date().getFullYear()) })}</p>
      </aside>
      <div className="flex min-h-dvh flex-col">
        <header className="flex h-16 items-center justify-between gap-4 px-5 sm:px-8">
          <span className="lg:invisible">
            <Logo />
          </span>
          <Link href="/explore" className="text-end text-sm font-medium text-ink-3 hover:text-ink">
            {t("layout.browse")}
          </Link>
        </header>
        <main id="main" className="flex flex-1 items-start justify-center px-5 pb-16 pt-6 sm:items-center sm:pt-0">
          <div className="w-full max-w-[420px] animate-rise">{children}</div>
        </main>
      </div>
    </div>
  );
}
