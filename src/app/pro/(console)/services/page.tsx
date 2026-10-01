import { Plus } from "lucide-react";
import type { Metadata } from "next";
import { eq, sql } from "drizzle-orm";
import { ServicesList } from "@/components/pro/services-list";
import { ButtonLink } from "@/components/ui/button";
import { PageHeader } from "@/components/ui/misc";
import { db } from "@/server/db/client";
import { appointments, serviceOptionGroups, serviceStaff, services } from "@/server/db/schema";
import { getT } from "@/i18n/server";
import { proPage } from "@/server/pro-page";

export async function generateMetadata(): Promise<Metadata> {
  const t = await getT("proSetup");
  return { title: t("services.title") };
}

export default async function ServicesPage() {
  const { m } = await proPage("services.manage");
  const t = await getT("proSetup");
  const rows = await db
    .select({
      id: services.id,
      name: services.name,
      menuSection: services.menuSection,
      durationMinutes: services.durationMinutes,
      priceType: services.priceType,
      priceCents: services.priceCents,
      salePriceCents: services.salePriceCents,
      priceMaxCents: services.priceMaxCents,
      status: services.status,
      capacity: services.capacity,
      optionCount: sql<number>`(select count(*)::int from ${serviceOptionGroups} g where g.service_id = services.id)`,
      staffCount: sql<number>`(select count(*)::int from ${serviceStaff} ss join business_members bm on bm.id = ss.member_id where ss.service_id = services.id and bm.status = 'active')`,
      bookings30: sql<number>`(select count(*)::int from ${appointments} a where a.service_id = services.id and a.starts_at >= now() - interval '30 days' and a.status not in ('cancelled','declined','expired','pending_payment'))`,
    })
    .from(services)
    .where(eq(services.businessId, m.businessId))
    .orderBy(services.sortOrder, services.name);
  return (
    <div className="mx-auto max-w-4xl px-4 pb-16 pt-8 sm:px-6 lg:px-10 lg:pt-10">
      <PageHeader
        title={t("services.title")}
        description={t("services.description")}
        actions={
          <ButtonLink href="/pro/services/new" icon={<Plus className="size-4" />}>
            {t("services.new")}
          </ButtonLink>
        }
      />
      <div className="mt-8">
        <ServicesList items={rows} currency={m.currency} />
      </div>
    </div>
  );
}
