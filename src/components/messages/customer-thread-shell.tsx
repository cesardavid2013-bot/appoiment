import { ChevronLeft } from "lucide-react";
import Link from "next/link";
import type { ReactNode } from "react";
import { ButtonLink } from "@/components/ui/button";
import { Avatar, type MediaLike } from "@/components/ui/media";
import { ScrollLock } from "./scroll-lock";

/**
 * Full-height messenger frame for the customer site: pinned between the site
 * header and the phone tab bar, so the composer always sits at the bottom.
 */
export function CustomerThreadShell({ business, children }: { business: { name: string; slug: string; logo: MediaLike | null }; children: ReactNode }) {
  return (
    <div className="fixed inset-x-0 bottom-0 top-[calc(4rem+env(safe-area-inset-top))] z-30 flex flex-col bg-bg pb-[calc(58px+env(safe-area-inset-bottom))] md:pb-0">
      <ScrollLock />
      <header className="shrink-0 border-b border-line">
        <div className="mx-auto flex h-16 max-w-3xl items-center gap-2 px-2 sm:px-6">
          <Link href="/messages" className="flex size-11 shrink-0 items-center justify-center rounded-md text-ink-2 hover:bg-surface-2 hover:text-ink sm:-ms-3" aria-label="All messages">
            <ChevronLeft className="size-5" />
          </Link>
          <Link href={`/${business.slug}`} className="flex min-w-0 flex-1 items-center gap-3 rounded-md py-1 pe-2 hover:opacity-80">
            <Avatar name={business.name} media={business.logo} size={38} />
            <span className="min-w-0">
              <span className="block truncate text-[15px] font-semibold text-ink">{business.name}</span>
              <span className="block truncate text-[12px] text-ink-3">View profile</span>
            </span>
          </Link>
          <ButtonLink href={`/${business.slug}/book`} variant="secondary" size="sm" className="shrink-0">
            Book
          </ButtonLink>
        </div>
      </header>
      {children}
    </div>
  );
}
