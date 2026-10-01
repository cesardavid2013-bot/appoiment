import type { Metadata } from "next";
import { AppearanceSettings } from "@/components/pro/appearance-settings";
import { SettingsShell } from "@/components/pro/settings-shell";
import { getT } from "@/i18n/server";
import { proPage } from "@/server/pro-page";
import { getPublicBusiness } from "@/server/services/catalog";
import { notFound } from "next/navigation";

export async function generateMetadata(): Promise<Metadata> {
  const t = await getT("proSettings");
  return { title: t("appearance.title") };
}

export default async function AppearancePage() {
  const { viewer, m } = await proPage("business.manage");
  const [b, t] = await Promise.all([getPublicBusiness(m.businessSlug, { allowDraftFor: viewer.id }), getT("proSettings")]);
  if (!b) notFound();
  return (
    <SettingsShell title={t("appearance.title")} description={t("appearance.description")} perms={[...m.permissions]}>
      <AppearanceSettings initial={b.theme} businessName={b.name} />
    </SettingsShell>
  );
}
