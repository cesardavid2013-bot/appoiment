import Link from "next/link";
import { Logo } from "@/components/shell/logo";

export default function AuthLayout({ children }: LayoutProps<"/">) {
  return (
    <div className="grid min-h-dvh lg:grid-cols-[minmax(0,1fr)_minmax(0,1.05fr)]">
      <aside className="theme-noir relative hidden flex-col justify-between overflow-hidden p-12 lg:flex xl:p-16" aria-hidden>
        <div className="pointer-events-none absolute inset-0 [background:radial-gradient(900px_420px_at_0%_0%,rgb(201_168_101/0.12),transparent_60%)]" />
        <div className="pointer-events-none absolute inset-6 border border-gold/20" />
        <div className="relative">
          <Logo />
        </div>
        <div className="relative max-w-md">
          <p className="eyebrow !text-gold-text">The appointment, kept</p>
          <p className="mt-6 font-display text-[56px] leading-[1.02] text-ink xl:text-[64px]">
            The people who make your week <em className="italic text-gold-text">better</em>, one tap away.
          </p>
          <ul className="mt-10 space-y-3 text-[15px] text-ink-2">
            {["Real openings, confirmed instantly", "Prices you see before you book", "Reviews only from verified visits"].map((t) => (
              <li key={t} className="flex items-center gap-3">
                <span className="h-px w-6 bg-gold" />
                {t}
              </li>
            ))}
          </ul>
        </div>
        <p className="relative text-[12px] text-ink-3">© {new Date().getFullYear()} Kept</p>
      </aside>
      <div className="flex min-h-dvh flex-col">
        <header className="flex h-16 items-center justify-between px-5 sm:px-8">
          <span className="lg:invisible">
            <Logo />
          </span>
          <Link href="/explore" className="text-sm font-medium text-ink-3 hover:text-ink">
            Browse without an account
          </Link>
        </header>
        <main id="main" className="flex flex-1 items-start justify-center px-5 pb-16 pt-6 sm:items-center sm:pt-0">
          <div className="w-full max-w-[420px] animate-rise">{children}</div>
        </main>
      </div>
    </div>
  );
}
