import { ChevronLeft } from "lucide-react";
import Link from "next/link";
import type { ReactNode } from "react";
import { Avatar, type MediaLike } from "@/components/ui/media";
import { ScrollLock } from "./scroll-lock";

/**
 * Thread pane for the business inbox. Phones: a full-screen view between the
 * console top bar and the 58px tab bar. Desktop: fills the right pane, with
 * the client panel beside it on wide screens.
 */
export function ProThreadFrame({ name, avatar, subtitle, actions, aside, children }: { name: string; avatar: MediaLike | null; subtitle?: ReactNode; actions?: ReactNode; aside?: ReactNode; children: ReactNode }) {
  return (
    <div className="fixed inset-x-0 bottom-0 top-[calc(3.5rem+env(safe-area-inset-top))] z-30 flex bg-bg pb-[calc(58px+env(safe-area-inset-bottom))] lg:static lg:z-auto lg:h-dvh lg:pb-0">
      <ScrollLock />
      <div className="flex min-w-0 flex-1 flex-col">
        <header className="flex h-16 shrink-0 items-center gap-2 border-b border-line px-2 sm:px-4 lg:h-[72px] lg:px-6">
          <Link href="/pro/messages" className="flex size-11 shrink-0 items-center justify-center rounded-md text-ink-2 hover:bg-surface-2 hover:text-ink lg:hidden" aria-label="Back to inbox">
            <ChevronLeft className="size-5" />
          </Link>
          <Avatar name={name} media={avatar} size={38} />
          <div className="min-w-0 flex-1 ps-1">
            <h2 className="truncate text-[15px] font-semibold text-ink">{name}</h2>
            {subtitle && <p className="truncate text-[12px] text-ink-3">{subtitle}</p>}
          </div>
          {actions && <div className="flex shrink-0 items-center gap-1">{actions}</div>}
        </header>
        {children}
      </div>
      {aside && <aside className="hidden w-[300px] shrink-0 overflow-y-auto border-s border-line xl:block">{aside}</aside>}
    </div>
  );
}
