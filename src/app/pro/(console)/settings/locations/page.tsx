import type { Metadata } from "next";
import { LocationsManager, type ManagedLocation } from "@/components/pro/locations-manager";
import { SettingsCard, SettingsShell } from "@/components/pro/settings-shell";
import { entitlements } from "@/domain/plans";
import { features } from "@/server/env";
import { proPage } from "@/server/pro-page";
import { listLocations, locationUsage } from "@/server/services/locations";

export const metadata: Metadata = { title: "Locations" };

export default async function LocationsSettingsPage() {
  const { m } = await proPage("locations.manage");
  const [rows, usage] = await Promise.all([listLocations(m.businessId), locationUsage(m.businessId)]);
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
    <SettingsShell title="Locations" description="Where clients book you: your shop, the area you travel to, or online. Each service and team member can be limited to some of them." perms={[...m.permissions]}>
      <LocationsManager locations={locations} businessTimezone={m.timezone} maxLocations={plan.maxLocations} planLabel={plan.label} geocoding={features.geocoding} />
      <SettingsCard id="privacy" title="What clients can see">
        <dl className="space-y-3 text-sm leading-relaxed">
          <div>
            <dt className="font-medium text-ink">At your place</dt>
            <dd className="text-ink-3">The full address and a map, so clients can find you.</dd>
          </div>
          <div>
            <dt className="font-medium text-ink">Travelling to clients</dt>
            <dd className="text-ink-3">
              Only your city and how far you travel. If you work from home, your home address and exact pin are never shown — search places you within about 5 km. Clients give you their address when they book.
            </dd>
          </div>
          <div>
            <dt className="font-medium text-ink">Online</dt>
            <dd className="text-ink-3">No address at all, just that sessions happen online.</dd>
          </div>
        </dl>
      </SettingsCard>
    </SettingsShell>
  );
}
