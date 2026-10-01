import { ChevronLeft } from "lucide-react";
import Link from "next/link";
import type { ReactNode } from "react";
import { getT } from "@/i18n/server";
import { AccountNav } from "./account-nav";

/** Frame for an account settings section: side nav on desktop, back link on phones. */
export async function AccountShell({ title, description, children }: { title: string; description?: ReactNode; children: ReactNode }) {
  const t = await getT("account");
  return (
    <div className="mx-auto max-w-5xl px-4 pt-6 sm:px-6 lg:grid lg:grid-cols-[220px_minmax(0,1fr)] lg:gap-12 lg:px-8 lg:pt-12">
      <aside className="hidden lg:block">
        <AccountNav />
      </aside>
      <div className="min-w-0 max-w-2xl">
        <Link href="/account" className="-ms-1 mb-4 inline-flex h-10 items-center gap-1 pe-2 text-sm font-medium text-ink-3 hover:text-ink lg:hidden">
          <ChevronLeft className="size-4 rtl:-scale-x-100" aria-hidden />
          {t("nav.account")}
        </Link>
        <h1 className="font-display text-[32px] leading-[1.1] tracking-[-0.01em] text-ink sm:text-[38px]">{title}</h1>
        {description && <p className="mt-2 text-[15px] leading-relaxed text-ink-3 text-pretty">{description}</p>}
        <div className="mt-8">{children}</div>
      </div>
    </div>
  );
}
