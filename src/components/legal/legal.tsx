"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { cn } from "@/lib/cn";

const DOCS = [
  { href: "/legal/terms", label: "Terms of service" },
  { href: "/legal/privacy", label: "Privacy policy" },
];

export function LegalNav() {
  const pathname = usePathname();
  return (
    <nav aria-label="Legal documents" className="flex gap-6 border-b border-line">
      {DOCS.map((d) => (
        <Link
          key={d.href}
          href={d.href}
          aria-current={pathname === d.href ? "page" : undefined}
          className={cn("-mb-px flex h-11 items-center border-b-2 text-sm font-medium", pathname === d.href ? "border-ink text-ink" : "border-transparent text-ink-3 hover:text-ink")}
        >
          {d.label}
        </Link>
      ))}
    </nav>
  );
}
