import { ChevronRight } from "lucide-react";
import type { Metadata } from "next";
import Link from "next/link";
import { SETTINGS_SECTIONS } from "@/components/pro/settings-nav";
import { PageHeader } from "@/components/ui/misc";
import { getT } from "@/i18n/server";
import { proPage } from "@/server/pro-page";

export async function generateMetadata(): Promise<Metadata> {
  const t = await getT("proSettings");
  return { title: t("title") };
}

export default async function SettingsHome() {
  const [{ m }, t] = await Promise.all([proPage(["business.manage", "locations.manage", "services.manage"]), getT("proSettings")]);
  const sections = SETTINGS_SECTIONS.filter((s) => m.permissions.has(s.permission));
  return (
    <div className="mx-auto max-w-3xl px-4 pb-16 pt-8 sm:px-6 lg:px-10 lg:pt-10">
      <PageHeader title={t("title")} description={t("home.description", { name: m.businessName })} />
      <ul className="mt-8 divide-y divide-line rounded-lg border border-line bg-surface">
        {sections.map((s) => (
          <li key={s.href}>
            <Link href={s.href} className="flex items-center gap-4 px-4 py-3.5 hover:bg-surface-2/60 sm:px-5">
              <span className="min-w-0 flex-1">
                <span className="block text-[15px] font-medium text-ink">{t(`nav.sections.${s.key}.label`)}</span>
                <span className="block text-[13px] text-ink-3">{t(`nav.sections.${s.key}.description`)}</span>
              </span>
              <ChevronRight className="size-4 shrink-0 text-ink-3" aria-hidden />
            </Link>
          </li>
        ))}
      </ul>
    </div>
  );
}
