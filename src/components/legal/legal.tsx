"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { useT } from "@/i18n/client";
import { cn } from "@/lib/cn";

const DOCS = [
  { href: "/legal/terms", key: "terms" },
  { href: "/legal/privacy", key: "privacy" },
];

export function LegalNav() {
  const t = useT("legal");
  const pathname = usePathname();
  return (
    <nav aria-label={t("nav.label")} className="flex gap-6 border-b border-line">
      {DOCS.map((d) => (
        <Link
          key={d.href}
          href={d.href}
          aria-current={pathname === d.href ? "page" : undefined}
          className={cn("-mb-px flex h-11 items-center border-b-2 text-sm font-medium", pathname === d.href ? "border-ink text-ink" : "border-transparent text-ink-3 hover:text-ink")}
        >
          {t(`nav.${d.key}`)}
        </Link>
      ))}
    </nav>
  );
}
