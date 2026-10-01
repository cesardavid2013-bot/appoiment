import type { Metadata } from "next";
import { eq } from "drizzle-orm";
import { OnboardingWizard } from "@/components/pro/onboarding-wizard";
import { getActiveMembership } from "@/server/authz";
import { getViewer } from "@/server/auth/session";
import { db } from "@/server/db/client";
import { businesses, categories } from "@/server/db/schema";
import { features } from "@/server/env";
import { launchChecklist } from "@/server/services/business";
import { listCategories } from "@/server/services/catalog";
import { listLocations } from "@/server/services/locations";
import { getWeeklyHours } from "@/server/services/schedule";
import { listServicesForBusiness } from "@/server/services/catalog-admin";
import { getMediaMap } from "@/server/services/media";

export const metadata: Metadata = { title: "Set up your business" };

export default async function OnboardingPage({ searchParams }: PageProps<"/pro/onboarding">) {
  const sp = await searchParams;
  const viewer = (await getViewer())!;
  const cats = await listCategories();
  const m = sp.new === "1" ? null : await getActiveMembership(viewer);

  if (!m) {
    return <OnboardingWizard categories={cats} user={{ name: viewer.name }} business={null} stripe={features.stripe} initialStep={typeof sp.step === "string" ? sp.step : undefined} />;
  }
  const [b] = await db.select().from(businesses).where(eq(businesses.id, m.businessId));
  const [cat] = b.primaryCategoryId ? await db.select().from(categories).where(eq(categories.id, b.primaryCategoryId)) : [];
  const parent = cat?.parentId ? (await db.select().from(categories).where(eq(categories.id, cat.parentId)))[0] : undefined;
  const [locs, svcs, hours, checklist, media] = await Promise.all([
    listLocations(m.businessId),
    listServicesForBusiness(m.businessId),
    getWeeklyHours(m.businessId, m.memberId, null),
    launchChecklist(m.businessId),
    getMediaMap([b.logoMediaId]),
  ]);
  return (
    <OnboardingWizard
      categories={cats}
      user={{ name: viewer.name }}
      stripe={features.stripe}
      initialStep={typeof sp.step === "string" ? sp.step : undefined}
      business={{
        id: b.id,
        slug: b.slug,
        name: b.name,
        kind: b.kind,
        status: b.status,
        memberId: m.memberId,
        categorySlug: cat?.slug ?? null,
        parentCategorySlug: parent?.slug ?? null,
        tagline: b.tagline,
        about: b.about,
        logo: b.logoMediaId ? (media.get(b.logoMediaId) ?? null) : null,
        logoMediaId: b.logoMediaId,
        timezone: b.timezone,
        currency: b.currency,
        bookingMode: b.bookingMode,
        cancellationWindowHours: b.cancellationWindowHours,
        lateCancelFeePercent: b.lateCancelFeePercent,
        minNoticeMinutes: b.minNoticeMinutes,
        paymentsEnabled: b.paymentsEnabled,
        onboarding: b.onboarding,
        locations: locs.map((l) => ({ id: l.id, kind: l.kind, name: l.name, line1: l.line1, city: l.city, region: l.region, postalCode: l.postalCode })),
        services: svcs.map((s) => ({ id: s.id, name: s.name, durationMinutes: s.durationMinutes, priceCents: s.priceCents, priceType: s.priceType })),
        hours: hours.map((h) => ({ weekday: h.weekday, windows: h.windows.map((w) => ({ start: w.start, end: w.end })) })),
        checklist: checklist.items,
      }}
    />
  );
}
