import { ChevronLeft } from "lucide-react";
import Link from "next/link";
import type { ReactNode } from "react";
import { SettingsNav } from "./settings-nav-client";

/** Frame for a settings page: section nav on desktop, back link on phones. */
export function SettingsShell({ title, description, perms, children, actions }: { title: string; description?: ReactNode; perms: string[]; children: ReactNode; actions?: ReactNode }) {
  return (
    <div className="mx-auto max-w-6xl px-4 pb-16 pt-6 sm:px-6 lg:grid lg:grid-cols-[200px_minmax(0,1fr)] lg:gap-12 lg:px-10 lg:pt-10">
      <aside className="hidden lg:block">
        <p className="mb-3 px-2.5 text-[12px] font-semibold uppercase tracking-[0.06em] text-ink-3">Settings</p>
        <SettingsNav perms={perms} />
      </aside>
      <div className="min-w-0 max-w-2xl">
        <Link href="/pro/settings" className="-ml-1 mb-4 inline-flex h-10 items-center gap-1 pr-2 text-sm font-medium text-ink-3 hover:text-ink lg:hidden">
          <ChevronLeft className="size-4" aria-hidden />
          Settings
        </Link>
        <div className="flex flex-wrap items-end justify-between gap-3">
          <h1 className="font-display text-[32px] leading-[1.1] tracking-[-0.01em] text-ink sm:text-[38px]">{title}</h1>
          {actions}
        </div>
        {description && <p className="mt-2 text-[15px] leading-relaxed text-ink-3 text-pretty">{description}</p>}
        <div className="mt-8 space-y-6">{children}</div>
      </div>
    </div>
  );
}

/** A titled group of settings rendered as a quiet card with an optional footer for actions. */
export function SettingsCard({ title, description, children, footer, id }: { title: string; description?: ReactNode; children: ReactNode; footer?: ReactNode; id: string }) {
  return (
    <section aria-labelledby={id} className="rounded-xl border border-line bg-surface">
      <div className="px-5 pt-5 sm:px-6">
        <h2 id={id} className="text-base font-semibold text-ink">
          {title}
        </h2>
        {description && <p className="mt-1 text-sm leading-relaxed text-ink-3 text-pretty">{description}</p>}
      </div>
      <div className="space-y-4 px-5 pb-5 pt-4 sm:px-6">{children}</div>
      {footer && <div className="flex flex-col-reverse gap-2 border-t border-line px-5 py-3.5 sm:flex-row sm:items-center sm:justify-end sm:px-6">{footer}</div>}
    </section>
  );
}
