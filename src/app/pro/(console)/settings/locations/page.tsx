import type { Metadata } from "next";
import { LocationsManager, type ManagedLocation } from "@/components/pro/locations-manager";
import { SettingsCard, SettingsShell } from "@/components/pro/settings-shell";
import { entitlements } from "@/domain/plans";
import { getT } from "@/i18n/server";
import { features } from "@/server/env";
import { proPage } from "@/server/pro-page";
import { listLocations, locationUsage } from "@/server/services/locations";

export async function generateMetadata(): Promise<Metadata> {
  const t = await getT("proSettings");
  return { title: t("locations.title") };
}

export default async function LocationsSettingsPage() {
  const { m } = await proPage("locations.manage");
  const [rows, usage, t] = await Promise.all([listLocations(m.businessId), locationUsage(m.businessId), getT("proSettings")]);
  const plan = entitlements(m.plan);
  const locations: ManagedLocation[] = rows
    .sort((a, b) => Number(b.isPrimary) - Number(a.isPrimary))
    .map((l) => ({
      id: l.id,
      name: l.name,
      kind: l.kind,
      line1: l.line1,
      line2: l.line2,
      city: l.city,
      region: l.region,
      postalCode: l.postalCode,
      country: l.country,
      lat: l.lat,
      lng: l.lng,
      serviceRadiusKm: l.serviceRadiusKm,
      timezone: l.timezone,
      phone: l.phone,
      instructions: l.instructions,
      isPrimary: l.isPrimary,
      usage: usage.get(l.id) ?? { upcoming: 0, members: 0, services: 0, exclusiveServices: [] },
    }));

  return (
    <SettingsShell title={t("locations.title")} description={t("locations.description")} perms={[...m.permissions]}>
      <LocationsManager locations={locations} businessTimezone={m.timezone} maxLocations={plan.maxLocations} planLabel={plan.label} geocoding={features.geocoding} />
      <SettingsCard id="privacy" title={t("locations.privacy.title")}>
        <dl className="space-y-3 text-sm leading-relaxed">
          <div>
            <dt className="font-medium text-ink">{t("locations.privacy.atPlace")}</dt>
            <dd className="text-ink-3">{t("locations.privacy.atPlaceBody")}</dd>
          </div>
          <div>
            <dt className="font-medium text-ink">{t("locations.privacy.travel")}</dt>
            <dd className="text-ink-3">{t("locations.privacy.travelBody")}</dd>
          </div>
          <div>
            <dt className="font-medium text-ink">{t("locations.privacy.online")}</dt>
            <dd className="text-ink-3">{t("locations.privacy.onlineBody")}</dd>
          </div>
        </dl>
      </SettingsCard>
    </SettingsShell>
  );
}
