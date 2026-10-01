import "server-only";
import { and, eq, isNotNull, sql } from "drizzle-orm";
import { entitlements } from "@/domain/plans";
import type { Membership } from "../authz";
import { db } from "../db/client";
import { businesses, services } from "../db/schema";
import { listCategories } from "./catalog";
import { listForms } from "./forms-admin";
import { listLocations } from "./locations";
import { getMediaMap } from "./media";
import { listTeam } from "./pro";

/** Everything the service editor needs besides the service itself. */
export async function serviceEditorContext(m: Membership) {
  const [team, locs, categories, forms, sections, [biz]] = await Promise.all([
    listTeam(m.businessId),
    listLocations(m.businessId),
    listCategories(),
    entitlements(m.plan).intakeForms ? listForms(m.businessId) : Promise.resolve([]),
    db
      .selectDistinct({ s: services.menuSection })
      .from(services)
      .where(and(eq(services.businessId, m.businessId), isNotNull(services.menuSection), sql`${services.status} <> 'archived'`)),
    db.select({ bookingMode: businesses.bookingMode, paymentsEnabled: businesses.paymentsEnabled, primaryCategoryId: businesses.primaryCategoryId }).from(businesses).where(eq(businesses.id, m.businessId)),
  ]);
  return {
    businessId: m.businessId,
    currency: m.currency,
    paymentsEnabled: biz.paymentsEnabled,
    businessBookingMode: biz.bookingMode,
    primaryCategoryId: biz.primaryCategoryId,
    team: team.filter((t) => t.isBookable).map((t) => ({ id: t.id, name: t.name })),
    locations: locs.map((l) => ({ id: l.id, name: l.name, kind: l.kind })),
    categories: categories.map((c) => ({ id: c.id, slug: c.slug, name: c.name, children: c.children.map((x) => ({ id: x.id, slug: x.slug, name: x.name })) })),
    forms: forms.map((f) => ({ id: f.id, name: f.name })),
    sections: sections.map((s) => s.s!).filter(Boolean).sort(),
    plan: { intakeForms: entitlements(m.plan).intakeForms },
  };
}

export async function coverFor(mediaId: string | null) {
  if (!mediaId) return null;
  return (await getMediaMap([mediaId])).get(mediaId) ?? null;
}
