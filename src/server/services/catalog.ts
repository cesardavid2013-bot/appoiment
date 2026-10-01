import "server-only";
import { and, asc, desc, eq, inArray, isNull, sql } from "drizzle-orm";
import { cache } from "react";
import { formFieldsSchema, type FormField } from "@/domain/forms";
import { describeCancellationPolicy } from "@/domain/policies";
import { displayPriceRange, type PaymentPolicy, type PriceType } from "@/domain/pricing";
import { db } from "../db/client";
import {
  availabilityRules,
  businessMembers,
  businesses,
  categories,
  intakeForms,
  locations,
  memberLocations,
  portfolioItems,
  reviews,
  serviceLocations,
  serviceOptionGroups,
  serviceOptions,
  serviceStaff,
  services,
  users,
} from "../db/schema";
import { getMediaMap, type PublicMedia } from "./media";

export type PublicLocation = {
  id: string;
  name: string;
  kind: "physical" | "mobile" | "virtual";
  address: string | null;
  city: string | null;
  region: string | null;
  lat: number | null;
  lng: number | null;
  serviceRadiusKm: number | null;
  timezone: string;
  instructions: string | null;
  phone: string | null;
  isPrimary: boolean;
};

function formatAddress(l: typeof locations.$inferSelect) {
  if (l.kind !== "physical") return null;
  return [l.line1, l.line2, [l.city, l.region].filter(Boolean).join(", "), l.postalCode].filter(Boolean).join(", ");
}

export function toPublicLocation(l: typeof locations.$inferSelect): PublicLocation {
  return {
    id: l.id,
    name: l.name,
    kind: l.kind,
    address: formatAddress(l),
    city: l.city,
    region: l.region,
    lat: l.kind === "physical" ? l.lat : null,
    lng: l.kind === "physical" ? l.lng : null,
    serviceRadiusKm: l.serviceRadiusKm,
    timezone: l.timezone,
    instructions: l.instructions,
    phone: l.phone,
    isPrimary: l.isPrimary,
  };
}

export type PublicService = {
  id: string;
  slug: string;
  name: string;
  description: string | null;
  menuSection: string | null;
  durationMinutes: number;
  priceType: PriceType;
  priceCents: number;
  salePriceCents: number | null;
  priceMaxCents: number | null;
  paymentPolicy: PaymentPolicy;
  capacity: number;
  hasOptions: boolean;
  requiresApproval: boolean;
  cover: PublicMedia | null;
  memberIds: string[];
  locationIds: string[];
};

export type PublicMember = { id: string; name: string; title: string | null; bio: string | null; avatar: PublicMedia | null };

/**
 * Everything a public profile page needs, in a handful of queries.
 * Private data (contact details of staff, internal notes, owner identity) is never selected.
 */
export const getPublicBusiness = cache(async (slug: string, opts: { allowDraftFor?: string } = {}) => {
  const [b] = await db.select().from(businesses).where(eq(businesses.slug, slug.toLowerCase())).limit(1);
  if (!b) return null;
  const visible = b.status === "active" || (opts.allowDraftFor && b.status === "draft" && opts.allowDraftFor === b.ownerUserId);
  if (!visible) return null;

  const [locs, svcRows, team, portfolio, catRows] = await Promise.all([
    db.select().from(locations).where(and(eq(locations.businessId, b.id), eq(locations.isActive, true))).orderBy(desc(locations.isPrimary), asc(locations.name)),
    db.select().from(services).where(and(eq(services.businessId, b.id), eq(services.status, "active"))).orderBy(asc(services.sortOrder), asc(services.name)),
    db
      .select({ id: businessMembers.id, name: businessMembers.displayName, title: businessMembers.title, bio: businessMembers.bio, avatarMediaId: businessMembers.avatarMediaId, userAvatar: users.avatarMediaId })
      .from(businessMembers)
      .leftJoin(users, eq(users.id, businessMembers.userId))
      .where(and(eq(businessMembers.businessId, b.id), eq(businessMembers.status, "active"), eq(businessMembers.isBookable, true)))
      .orderBy(asc(businessMembers.sortOrder), asc(businessMembers.displayName)),
    db
      .select()
      .from(portfolioItems)
      .where(and(eq(portfolioItems.businessId, b.id), isNull(portfolioItems.deletedAt)))
      .orderBy(desc(portfolioItems.isFeatured), asc(portfolioItems.sortOrder), desc(portfolioItems.createdAt))
      .limit(60),
    b.primaryCategoryId ? db.select().from(categories).where(eq(categories.id, b.primaryCategoryId)) : Promise.resolve([]),
  ]);

  const svcIds = svcRows.map((s) => s.id);
  const [staffLinks, locLinks, groupCounts, hours] = await Promise.all([
    svcIds.length ? db.select({ serviceId: serviceStaff.serviceId, memberId: serviceStaff.memberId }).from(serviceStaff).where(inArray(serviceStaff.serviceId, svcIds)) : [],
    svcIds.length ? db.select().from(serviceLocations).where(inArray(serviceLocations.serviceId, svcIds)) : [],
    svcIds.length
      ? db.select({ serviceId: serviceOptionGroups.serviceId, n: sql<number>`count(*)::int` }).from(serviceOptionGroups).where(inArray(serviceOptionGroups.serviceId, svcIds)).groupBy(serviceOptionGroups.serviceId)
      : [],
    db.select().from(availabilityRules).where(eq(availabilityRules.businessId, b.id)),
  ]);

  const teamIds = new Set(team.map((t) => t.id));
  const bookableServices = svcRows.filter((s) => staffLinks.some((l) => l.serviceId === s.id && teamIds.has(l.memberId)));

  const mediaMap = await getMediaMap([
    b.logoMediaId,
    b.coverMediaId,
    ...bookableServices.map((s) => s.coverMediaId),
    ...team.map((t) => t.avatarMediaId ?? t.userAvatar),
    ...portfolio.flatMap((p) => [p.mediaId, p.beforeMediaId]),
  ]);

  const publicServices: PublicService[] = bookableServices.map((s) => ({
    id: s.id,
    slug: s.slug,
    name: s.name,
    description: s.description,
    menuSection: s.menuSection,
    durationMinutes: s.durationMinutes,
    priceType: s.priceType,
    priceCents: s.priceCents,
    salePriceCents: s.salePriceCents,
    priceMaxCents: s.priceMaxCents,
    paymentPolicy: s.paymentPolicy,
    capacity: s.capacity,
    hasOptions: groupCounts.some((g) => g.serviceId === s.id && g.n > 0),
    requiresApproval: s.requiresApproval ?? b.bookingMode === "request",
    cover: s.coverMediaId ? (mediaMap.get(s.coverMediaId) ?? null) : null,
    memberIds: staffLinks.filter((l) => l.serviceId === s.id && teamIds.has(l.memberId)).map((l) => l.memberId),
    locationIds: locLinks.filter((l) => l.serviceId === s.id).map((l) => l.locationId),
  }));

  // Business hours shown publicly: location hours if defined, else the union of staff hours.
  const locRules = hours.filter((h) => h.memberId == null);
  const source = locRules.length ? locRules : hours.filter((h) => h.memberId && teamIds.has(h.memberId));
  const weeklyHours = [1, 2, 3, 4, 5, 6, 7].map((weekday) => {
    const ws = source.filter((r) => r.weekday === weekday).map((r) => ({ start: r.startMinute, end: r.endMinute }));
    ws.sort((x, y) => x.start - y.start);
    const merged: { start: number; end: number }[] = [];
    for (const w of ws) {
      const last = merged.at(-1);
      if (last && w.start <= last.end) last.end = Math.max(last.end, w.end);
      else merged.push({ ...w });
    }
    return { weekday, windows: merged };
  });

  const prices = publicServices.map((s) => displayPriceRange(s)).filter((p): p is { min: number; max: number } => p != null);

  return {
    id: b.id,
    slug: b.slug,
    name: b.name,
    kind: b.kind,
    status: b.status,
    tagline: b.tagline,
    about: b.about,
    timezone: b.timezone,
    currency: b.currency,
    website: b.website,
    socialLinks: b.socialLinks,
    contactPhone: b.contactPhone,
    languages: b.languages,
    amenities: b.amenities,
    yearsExperience: b.yearsExperience,
    verified: b.verificationStatus === "verified",
    ratingAvg: b.ratingAvg,
    ratingCount: b.ratingCount,
    bookingMode: b.bookingMode,
    allowAnyStaff: b.allowAnyStaff,
    paymentsEnabled: b.paymentsEnabled,
    policies: describeCancellationPolicy({
      cancellationWindowHours: b.cancellationWindowHours,
      rescheduleWindowHours: b.rescheduleWindowHours,
      lateCancelFeePercent: b.lateCancelFeePercent,
      depositRefundable: b.depositRefundable,
    }),
    latePolicy: b.latePolicy,
    noShowFeePercent: b.noShowFeePercent,
    category: catRows[0] ? { id: catRows[0].id, slug: catRows[0].slug, name: catRows[0].name } : null,
    logo: b.logoMediaId ? (mediaMap.get(b.logoMediaId) ?? null) : null,
    cover: b.coverMediaId ? (mediaMap.get(b.coverMediaId) ?? null) : null,
    locations: locs.map(toPublicLocation),
    services: publicServices,
    team: team.map((t) => ({ id: t.id, name: t.name, title: t.title, bio: t.bio, avatar: mediaMap.get(t.avatarMediaId ?? t.userAvatar ?? "") ?? null })),
    portfolio: portfolio
      .map((p) => ({
        id: p.id,
        kind: p.kind,
        caption: p.caption,
        serviceId: p.serviceId && publicServices.some((s) => s.id === p.serviceId) ? p.serviceId : null,
        memberId: p.memberId,
        isFeatured: p.isFeatured,
        media: mediaMap.get(p.mediaId) ?? null,
        before: p.beforeMediaId ? (mediaMap.get(p.beforeMediaId) ?? null) : null,
      }))
      .filter((p) => p.media != null),
    weeklyHours,
    priceMinCents: prices.length ? Math.min(...prices.map((p) => p.min)) : null,
    priceMaxCents: prices.length ? Math.max(...prices.map((p) => p.max)) : null,
    publishedAt: b.publishedAt,
  };
});

export type PublicBusiness = NonNullable<Awaited<ReturnType<typeof getPublicBusiness>>>;

export type BookingServiceDetail = {
  id: string;
  name: string;
  description: string | null;
  durationMinutes: number;
  bufferAfterMinutes: number;
  priceType: string;
  priceCents: number;
  salePriceCents: number | null;
  priceMaxCents: number | null;
  capacity: number;
  consentText: string | null;
  minAge: number | null;
  bookingInstructions: string | null;
  optionGroups: {
    id: string;
    name: string;
    description: string | null;
    selection: "single" | "multiple";
    required: boolean;
    maxSelect: number | null;
    options: { id: string; name: string; description: string | null; priceDeltaCents: number; durationDeltaMinutes: number; isDefault: boolean; eligibleMemberIds: string[] | null }[];
  }[];
  staff: { memberId: string; priceCentsOverride: number | null; durationMinutesOverride: number | null; locationIds: string[] }[];
  intakeFields: FormField[];
};

/** Detail needed by the booking flow for one service (options, staff overrides, intake form). */
export async function getBookingServiceDetail(businessId: string, serviceId: string): Promise<BookingServiceDetail | null> {
  const [s] = await db.select().from(services).where(and(eq(services.id, serviceId), eq(services.businessId, businessId), eq(services.status, "active")));
  if (!s) return null;
  const [groups, staff, form] = await Promise.all([
    db.select().from(serviceOptionGroups).where(eq(serviceOptionGroups.serviceId, s.id)).orderBy(asc(serviceOptionGroups.sortOrder)),
    db
      .select({ memberId: serviceStaff.memberId, priceCentsOverride: serviceStaff.priceCentsOverride, durationMinutesOverride: serviceStaff.durationMinutesOverride })
      .from(serviceStaff)
      .innerJoin(businessMembers, eq(businessMembers.id, serviceStaff.memberId))
      .where(and(eq(serviceStaff.serviceId, s.id), eq(businessMembers.status, "active"), eq(businessMembers.isBookable, true))),
    s.intakeFormId ? db.select().from(intakeForms).where(and(eq(intakeForms.id, s.intakeFormId), isNull(intakeForms.archivedAt))) : Promise.resolve([]),
  ]);
  const opts = groups.length
    ? await db
        .select()
        .from(serviceOptions)
        .where(and(inArray(serviceOptions.groupId, groups.map((g) => g.id)), eq(serviceOptions.isActive, true)))
        .orderBy(asc(serviceOptions.sortOrder))
    : [];
  const mLocs = staff.length ? await db.select().from(memberLocations).where(inArray(memberLocations.memberId, staff.map((x) => x.memberId))) : [];
  const parsedForm = form[0] ? formFieldsSchema.safeParse(form[0].fields) : null;
  return {
    id: s.id,
    name: s.name,
    description: s.description,
    durationMinutes: s.durationMinutes,
    bufferAfterMinutes: s.bufferAfterMinutes,
    priceType: s.priceType,
    priceCents: s.priceCents,
    salePriceCents: s.salePriceCents,
    priceMaxCents: s.priceMaxCents,
    capacity: s.capacity,
    consentText: s.consentText,
    minAge: s.minAge,
    bookingInstructions: s.bookingInstructions,
    optionGroups: groups
      .map((g) => ({
        id: g.id,
        name: g.name,
        description: g.description,
        selection: g.selection,
        required: g.required,
        maxSelect: g.maxSelect,
        options: opts
          .filter((o) => o.groupId === g.id)
          .map((o) => ({ id: o.id, name: o.name, description: o.description, priceDeltaCents: o.priceDeltaCents, durationDeltaMinutes: o.durationDeltaMinutes, isDefault: o.isDefault, eligibleMemberIds: o.eligibleMemberIds })),
      }))
      .filter((g) => g.options.length > 0),
    staff: staff.map((x) => ({ ...x, locationIds: mLocs.filter((l) => l.memberId === x.memberId).map((l) => l.locationId) })),
    intakeFields: parsedForm?.success ? parsedForm.data : [],
  };
}

export async function listReviews(businessId: string, opts: { limit?: number; before?: Date } = {}) {
  const rows = await db
    .select({
      id: reviews.id,
      rating: reviews.rating,
      body: reviews.body,
      responseBody: reviews.responseBody,
      respondedAt: reviews.respondedAt,
      createdAt: reviews.createdAt,
      serviceName: sql<string | null>`(select name from services where services.id = ${reviews.serviceId})`,
      authorName: users.name,
    })
    .from(reviews)
    .innerJoin(users, eq(users.id, reviews.customerUserId))
    .where(and(eq(reviews.businessId, businessId), eq(reviews.status, "published"), opts.before ? sql`${reviews.createdAt} < ${opts.before.toISOString()}::timestamptz` : sql`true`))
    .orderBy(desc(reviews.createdAt))
    .limit(Math.min(opts.limit ?? 10, 50));
  // Only first name + initial: reviews are public.
  return rows.map((r) => {
    const parts = r.authorName.trim().split(/\s+/);
    return { ...r, authorName: parts.length > 1 ? `${parts[0]} ${parts[parts.length - 1][0]}.` : parts[0] };
  });
}

export async function ratingBreakdown(businessId: string) {
  const rows = await db
    .select({ rating: reviews.rating, n: sql<number>`count(*)::int` })
    .from(reviews)
    .where(and(eq(reviews.businessId, businessId), eq(reviews.status, "published")))
    .groupBy(reviews.rating);
  return [5, 4, 3, 2, 1].map((r) => ({ rating: r, count: rows.find((x) => x.rating === r)?.n ?? 0 }));
}

export const listCategories = cache(async () => {
  const rows = await db.select().from(categories).where(eq(categories.isActive, true)).orderBy(asc(categories.sortOrder), asc(categories.name));
  const top = rows.filter((c) => !c.parentId);
  return top.map((c) => ({ id: c.id, slug: c.slug, name: c.name, description: c.description, children: rows.filter((x) => x.parentId === c.id).map((x) => ({ id: x.id, slug: x.slug, name: x.name })) }));
});
