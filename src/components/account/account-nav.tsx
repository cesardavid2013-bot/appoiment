"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { cn } from "@/lib/cn";
import { ACCOUNT_SECTIONS } from "./sections";

/** Desktop side navigation for account settings. */
export function AccountNav() {
  const pathname = usePathname();
  return (
    <nav aria-label="Account settings" className="sticky top-24">
      <Link href="/account" className="mb-3 block px-3 text-[13px] font-medium text-ink-3 hover:text-ink">
        Account
      </Link>
      <ul className="space-y-0.5">
        {ACCOUNT_SECTIONS.map((s) => {
          const active = pathname === s.href;
          const Icon = s.icon;
          return (
            <li key={s.href}>
              <Link
                href={s.href}
                aria-current={active ? "page" : undefined}
                className={cn(
                  "flex h-10 items-center gap-2.5 rounded-md px-3 text-sm transition-colors",
                  active ? "bg-surface-2 font-medium text-ink" : "text-ink-2 hover:bg-surface-2/60 hover:text-ink",
                )}
              >
                <Icon className={cn("size-4", active ? "text-ink" : "text-ink-3")} aria-hidden />
                {s.label}
              </Link>
            </li>
          );
        })}
      </ul>
    </nav>
  );
}
