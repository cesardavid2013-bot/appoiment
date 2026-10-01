"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { cn } from "@/lib/cn";
import { SETTINGS_SECTIONS } from "./settings-nav";

export function SettingsNav({ perms }: { perms: string[] }) {
  const path = usePathname();
  return (
    <nav aria-label="Settings">
      <ul className="space-y-0.5">
        {SETTINGS_SECTIONS.filter((s) => perms.includes(s.permission)).map((s) => {
          const active = path === s.href || path.startsWith(`${s.href}/`);
          return (
            <li key={s.href}>
              <Link href={s.href} aria-current={active ? "page" : undefined} className={cn("block rounded-md px-2.5 py-1.5 text-sm", active ? "bg-surface-2 font-medium text-ink" : "text-ink-2 hover:bg-surface-2 hover:text-ink")}>
                {s.label}
              </Link>
            </li>
          );
        })}
      </ul>
    </nav>
  );
}
