import Link from "next/link";
import { cn } from "@/lib/cn";

/** Wordmark: a quiet serif "Kept" with a small filled mark — a kept promise (a closed loop). */
export function Logo({ className, href = "/", suffix }: { className?: string; href?: string; suffix?: string }) {
  return (
    <Link href={href} className={cn("inline-flex items-center gap-2 text-ink", className)} aria-label="Kept home">
      <svg width="22" height="22" viewBox="0 0 24 24" aria-hidden>
        <circle cx="12" cy="12" r="10" fill="none" stroke="currentColor" strokeWidth="2" />
        <path d="M7.5 12.5l3 3 6-7" fill="none" stroke="var(--accent)" strokeWidth="2.4" strokeLinecap="round" strokeLinejoin="round" />
      </svg>
      <span className="font-display text-[23px] leading-none tracking-[-0.01em]">Kept</span>
      {suffix && <span className="ml-1 rounded-sm bg-surface-2 px-1.5 py-0.5 text-[11px] font-medium uppercase tracking-wide text-ink-3">{suffix}</span>}
    </Link>
  );
}
