"use client";

import { ChevronLeft } from "lucide-react";
import Link from "next/link";
import { usePathname } from "next/navigation";
import { useT } from "@/i18n/client";
import { cn } from "@/lib/cn";
import { SETTINGS_SECTIONS } from "./settings-nav";

export function SettingsNav({ perms }: { perms: string[] }) {
  const path = usePathname();
  const t = useT("proSettings");
  return (
    <>
      <p className="mb-3 px-2.5 text-[12px] font-semibold uppercase tracking-[0.06em] text-ink-3">{t("title")}</p>
      <nav aria-label={t("nav.label")}>
        <ul className="space-y-0.5">
          {SETTINGS_SECTIONS.filter((s) => perms.includes(s.permission)).map((s) => {
            const active = path === s.href || path.startsWith(`${s.href}/`);
            return (
              <li key={s.href}>
                <Link href={s.href} aria-current={active ? "page" : undefined} className={cn("block rounded-md px-2.5 py-1.5 text-sm", active ? "bg-surface-2 font-medium text-ink" : "text-ink-2 hover:bg-surface-2 hover:text-ink")}>
                  {t(`nav.sections.${s.key}.label`)}
                </Link>
              </li>
            );
          })}
        </ul>
      </nav>
    </>
  );
}

/** Back link to the settings list, shown on phones above each settings page. */
export function SettingsBackLink() {
  const t = useT("proSettings");
  return (
    <Link href="/pro/settings" className="-ms-1 mb-4 inline-flex h-10 items-center gap-1 pe-2 text-sm font-medium text-ink-3 hover:text-ink lg:hidden">
      <ChevronLeft className="size-4" aria-hidden />
      {t("nav.back")}
    </Link>
  );
}
