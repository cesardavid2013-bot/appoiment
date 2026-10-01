import Link from "next/link";
import { getT } from "@/i18n/server";
import { LanguagePicker } from "./language-picker";
import { Logo } from "./logo";

export async function SiteFooter() {
  const t = await getT("common");
  const year = new Date().getFullYear();
  const groups = [
    { title: t("footer.discover"), links: [["/explore", t("footer.explore")], ["/explore?category=hair", t("footer.hair")], ["/explore?category=wellness", t("footer.wellness")], ["/explore?category=fitness", t("footer.fitness")]] },
    { title: t("footer.forPros"), links: [["/for-business", t("footer.howItWorks")], ["/pro/onboarding", t("footer.listServices")], ["/pro", t("footer.dashboard")]] },
    { title: t("footer.help"), links: [["/support", t("footer.support")], ["/legal/terms", t("footer.terms")], ["/legal/privacy", t("footer.privacy")]] },
  ];
  return (
    <footer className="mt-24 border-t border-line bg-surface/60 pb-24 md:pb-0">
      <div className="mx-auto grid max-w-7xl gap-10 px-4 py-12 sm:px-6 md:grid-cols-4 lg:px-8">
        <div className="space-y-4">
          <Logo />
          <p className="max-w-xs text-sm leading-relaxed text-ink-3">{t("footer.tagline")}</p>
          <LanguagePicker />
        </div>
        {groups.map((g) => (
          <div key={g.title}>
            <h3 className="mb-3 text-sm font-semibold text-ink">{g.title}</h3>
            <ul className="space-y-2 text-sm text-ink-3">
              {g.links.map(([href, label]) => (
                <li key={href}>
                  <Link className="hover:text-ink" href={href}>
                    {label}
                  </Link>
                </li>
              ))}
            </ul>
          </div>
        ))}
      </div>
      <div className="border-t border-line">
        <p className="mx-auto max-w-7xl px-4 py-5 text-xs text-ink-3 sm:px-6 lg:px-8">{t("footer.copyright", { year })}</p>
      </div>
    </footer>
  );
}
