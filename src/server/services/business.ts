import "server-only";
import { and, count, eq, inArray, ne, sql } from "drizzle-orm";
import { z } from "zod";
import { AppError, notFound } from "@/domain/errors";
import { displayPriceRange } from "@/domain/pricing";
import { isValidSlug, normalizeSearch, slugify } from "@/domain/slugs";
import { isValidTimeZone } from "@/domain/time";
import { db, type Executor } from "../db/client";
import {
  availabilityRules,
  businessMembers,
  businesses,
  categories,
  locations,
  serviceStaff,
  services,
} from "../db/schema";
import type { Viewer } from "../auth/session";
import type { Membership } from "../authz";
import { audit } from "../audit";
import { zOptText } from "../http";

export const ONBOARDING_STEPS = ["category", "kind", "name", "branding", "location", "services", "availability", "policies", "payments", "preview"] as const;
export type OnboardingStep = (typeof ONBOARDING_STEPS)[number];

const zTz = z.string().refine(isValidTimeZone, "Choose a valid time zone");

export const createBusinessSchema = z.object({
  name: z.string().trim().min(2, "Use at least 2 characters").max(80),
  kind: z.enum(["individual", "business"]),
  categoryId: z.string().uuid().nullable().optional(),
  timezone: zTz,
  currency: z.string().length(3).default("USD"),
});

async function uniqueSlug(exec: Executor, base: string, excludeId?: string): Promise<string> {
  let root = slugify(base);
  if (root.length < 3) root = `${root || "pro"}-studio`;
  for (let i = 0; i < 50; i++) {
    const candidate = i === 0 ? root : `${root.slice(0, 44)}-${i + 1}`;
    if (!isValidSlug(candidate)) continue;
    const [taken] = await exec
      .select({ id: businesses.id })
      .from(businesses)
      .where(and(eq(businesses.slug, candidate), excludeId ? ne(businesses.id, excludeId) : sql`true`));
    if (!taken) return candidate;
  }
  return `${root.slice(0, 36)}-${Math.random().toString(36).slice(2, 8)}`;
}

/** Creates a draft business with the creator as owner and a sensible starting schedule. */
export async function createBusiness(viewer: Viewer, input: z.infer<typeof createBusinessSchema>) {
  const [{ owned }] = await db.select({ owned: count() }).from(businesses).where(eq(businesses.ownerUserId, viewer.id));
  if (owned >= 5) throw new AppError("forbidden", "You've reached the limit of businesses for one account. Contact support if you need more.");
  return db.transaction(async (tx) => {
    const slug = await uniqueSlug(tx, input.name);
    const [biz] = await tx
      .insert(businesses)
      .values({
        name: input.name,
        slug,
        kind: input.kind,
        ownerUserId: viewer.id,
        primaryCategoryId: input.categoryId ?? null,
        timezone: input.timezone,
        currency: input.currency.toUpperCase(),
        contactEmail: viewer.email,
        onboarding: { completed: ["category", "kind", "name"] },
      })
      .returning();
    const [member] = await tx
      .insert(businessMembers)
      .values({
        businessId: biz.id,
        userId: viewer.id,
        role: "owner",
        displayName: input.kind === "individual" ? input.name : viewer.name,
        isBookable: true,
        status: "active",
        joinedAt: new Date(),
      })
      .returning();
    // Start with Mon–Fri 9–5; the owner adjusts it in the availability step.
    await tx.insert(availabilityRules).values([1, 2, 3, 4, 5].map((weekday) => ({ businessId: biz.id, memberId: member.id, weekday, startMinute: 540, endMinute: 1020 })));
    await audit({ actorUserId: viewer.id, actorType: "business", businessId: biz.id, action: "business.created", targetType: "business", targetId: biz.id }, tx);
    return { id: biz.id, slug: biz.slug, memberId: member.id };
  });
}

export const profileSchema = z.object({
  name: z.string().trim().min(2).max(80),
  tagline: zOptText(140),
  about: zOptText(4000),
  primaryCategoryId: z.string().uuid().nullable().optional(),
  contactEmail: z.string().trim().email().max(254).nullable().optional().or(z.literal("").transform(() => null)),
  contactPhone: zOptText(40),
  website: z
    .string()
    .trim()
    .max(300)
    .nullable()
    .optional()
    .transform((v) => (v ? (/^https?:\/\//i.test(v) ? v : `https://${v}`) : null))
    .refine((v) => v == null || /^https?:\/\/[^\s/$.?#].[^\s]*$/i.test(v), "Enter a valid website"),
  socialLinks: z.partialRecord(z.enum(["instagram", "tiktok", "facebook", "youtube", "x", "linkedin"]), z.string().trim().max(100)).default({}),
  languages: z.array(z.string().trim().min(1).max(30)).max(10).default([]),
  amenities: z.array(z.string().trim().min(1).max(40)).max(20).default([]),
  yearsExperience: z.number().int().min(0).max(80).nullable().optional(),
  logoMediaId: z.string().uuid().nullable().optional(),
  coverMediaId: z.string().uuid().nullable().optional(),
  timezone: zTz.optional(),
});

export async function updateProfile(m: Membership, actorUserId: string, input: z.infer<typeof profileSchema>) {
  const social: Record<string, string> = {};
  for (const [k, v] of Object.entries(input.socialLinks)) if (v) social[k] = v.replace(/^@/, "").replace(/^https?:\/\/[^/]+\//, "");
  await db
    .update(businesses)
    .set({
      name: input.name,
      tagline: input.tagline,
      about: input.about,
      primaryCategoryId: input.primaryCategoryId ?? null,
      contactEmail: input.contactEmail ?? null,
      contactPhone: input.contactPhone,
      website: input.website ?? null,
      socialLinks: social,
      languages: input.languages,
      amenities: input.amenities,
      yearsExperience: input.yearsExperience ?? null,
      ...(input.logoMediaId !== undefined ? { logoMediaId: input.logoMediaId } : {}),
      ...(input.coverMediaId !== undefined ? { coverMediaId: input.coverMediaId } : {}),
      ...(input.timezone ? { timezone: input.timezone } : {}),
    })
    .where(eq(businesses.id, m.businessId));
  if (m.businessKind === "individual") {
    await db.update(businessMembers).set({ displayName: input.name }).where(eq(businessMembers.id, m.memberId));
  }
  await refreshSearchIndex(m.businessId);
  await audit({ actorUserId, actorType: "business", businessId: m.businessId, action: "business.profile_updated", targetType: "business", targetId: m.businessId });
}

export const bookingRulesSchema = z.object({
  bookingMode: z.enum(["instant", "request"]),
  minNoticeMinutes: z.number().int().min(0).max(60 * 24 * 14),
  maxAdvanceDays: z.number().int().min(1).max(365),
  slotIntervalMinutes: z.number().int().refine((v) => [5, 10, 15, 20, 30, 45, 60].includes(v), "Choose a supported interval"),
  allowAnyStaff: z.boolean(),
  reminderOffsetsMinutes: z.array(z.number().int().min(15).max(60 * 24 * 7)).max(3),
});

export const policiesSchema = z.object({
  cancellationWindowHours: z.number().int().min(0).max(24 * 14),
  rescheduleWindowHours: z.number().int().min(0).max(24 * 14),
  lateCancelFeePercent: z.number().int().min(0).max(100),
  noShowFeePercent: z.number().int().min(0).max(100),
  depositRefundable: z.boolean(),
  latePolicy: zOptText(1000),
  bookingInstructions: zOptText(2000),
  taxRateBps: z.number().int().min(0).max(3000),
  taxLabel: zOptText(40),
});

export async function updateBookingRules(m: Membership, actorUserId: string, input: z.infer<typeof bookingRulesSchema>) {
  await db
    .update(businesses)
    .set({ ...input, reminderOffsetsMinutes: [...new Set(input.reminderOffsetsMinutes)].sort((a, b) => b - a) })
    .where(eq(businesses.id, m.businessId));
  await audit({ actorUserId, actorType: "business", businessId: m.businessId, action: "business.booking_rules_updated", metadata: input });
}

export async function updatePolicies(m: Membership, actorUserId: string, input: z.infer<typeof policiesSchema>) {
  await db.update(businesses).set(input).where(eq(businesses.id, m.businessId));
  await audit({ actorUserId, actorType: "business", businessId: m.businessId, action: "business.policies_updated", metadata: input });
}

export async function changeSlug(m: Membership, actorUserId: string, raw: string) {
  const slug = raw.trim().toLowerCase();
  if (!isValidSlug(slug)) throw new AppError("validation", "Use 3–50 lowercase letters, numbers or single hyphens. Some words are reserved.", { fields: { slug: "Not available" } });
  const [taken] = await db.select({ id: businesses.id }).from(businesses).where(and(eq(businesses.slug, slug), ne(businesses.id, m.businessId)));
  if (taken) throw new AppError("conflict", "That link is already taken.", { fields: { slug: "Already taken" } });
  await db.update(businesses).set({ slug }).where(eq(businesses.id, m.businessId));
  await audit({ actorUserId, actorType: "business", businessId: m.businessId, action: "business.slug_changed", metadata: { from: m.businessSlug, to: slug } });
  return { slug };
}

export async function markOnboardingStep(businessId: string, step: OnboardingStep, kind: "completed" | "skipped" = "completed") {
  const [b] = await db.select({ onboarding: businesses.onboarding }).from(businesses).where(eq(businesses.id, businessId));
  const ob = b?.onboarding ?? {};
  const completed = new Set(ob.completed ?? []);
  const skipped = new Set(ob.skipped ?? []);
  if (kind === "completed") {
    completed.add(step);
    skipped.delete(step);
  } else if (!completed.has(step)) skipped.add(step);
  await db.update(businesses).set({ onboarding: { completed: [...completed], skipped: [...skipped] } }).where(eq(businesses.id, businessId));
}

/** What's missing before a business can take bookings. Shown in onboarding and on the dashboard. */
export async function launchChecklist(businessId: string) {
  const [[loc], [svc], [hours]] = await Promise.all([
    db.select({ n: count() }).from(locations).where(and(eq(locations.businessId, businessId), eq(locations.isActive, true))),
    db
      .select({ n: count() })
      .from(services)
      .innerJoin(serviceStaff, eq(serviceStaff.serviceId, services.id))
      .where(and(eq(services.businessId, businessId), eq(services.status, "active"))),
    db.select({ n: count() }).from(availabilityRules).where(and(eq(availabilityRules.businessId, businessId), sql`${availabilityRules.memberId} is not null`)),
  ]);
  const items = [
    { key: "location", done: loc.n > 0, label: "Add where you work", href: "/pro/onboarding?step=location" },
    { key: "services", done: svc.n > 0, label: "Create at least one service", href: "/pro/onboarding?step=services" },
    { key: "availability", done: hours.n > 0, label: "Set your working hours", href: "/pro/onboarding?step=availability" },
  ];
  return { items, ready: items.every((i) => i.done) };
}

export async function publishBusiness(m: Membership, actorUserId: string) {
  const check = await launchChecklist(m.businessId);
  if (!check.ready) {
    const missing = check.items.filter((i) => !i.done).map((i) => i.label.toLowerCase());
    throw new AppError("validation", `Almost there — ${missing.join(", ")} before going live.`);
  }
  const [b] = await db.select({ status: businesses.status }).from(businesses).where(eq(businesses.id, m.businessId));
  if (b.status === "suspended") throw new AppError("forbidden", "This business is suspended. Contact support.");
  await db
    .update(businesses)
    .set({ status: "active", publishedAt: sql`coalesce(${businesses.publishedAt}, now())` })
    .where(eq(businesses.id, m.businessId));
  await markOnboardingStep(m.businessId, "preview");
  await refreshSearchIndex(m.businessId);
  await audit({ actorUserId, actorType: "business", businessId: m.businessId, action: "business.published" });
}

export async function unpublishBusiness(m: Membership, actorUserId: string) {
  await db.update(businesses).set({ status: "draft" }).where(and(eq(businesses.id, m.businessId), eq(businesses.status, "active")));
  await audit({ actorUserId, actorType: "business", businessId: m.businessId, action: "business.unpublished" });
}

/**
 * Rebuilds denormalised search/listing fields. Called after any change that
 * affects discovery (profile, services, locations, team).
 */
export async function refreshSearchIndex(businessId: string, exec: Executor = db) {
  const [b] = await exec.select().from(businesses).where(eq(businesses.id, businessId));
  if (!b) throw notFound("That business");
  const svcs = await exec
    .select({
      name: services.name,
      menuSection: services.menuSection,
      description: services.description,
      categoryId: services.categoryId,
      priceType: services.priceType,
      priceCents: services.priceCents,
      salePriceCents: services.salePriceCents,
      priceMaxCents: services.priceMaxCents,
    })
    .from(services)
    .where(and(eq(services.businessId, businessId), eq(services.status, "active")));
  const catIds = [...new Set([b.primaryCategoryId, ...svcs.map((s) => s.categoryId)].filter((x): x is string => Boolean(x)))];
  const cats = catIds.length ? await exec.select().from(categories).where(inArray(categories.id, catIds)) : [];
  const parentIds = cats.map((c) => c.parentId).filter((x): x is string => Boolean(x));
  const parents = parentIds.length ? await exec.select().from(categories).where(inArray(categories.id, parentIds)) : [];
  const locs = await exec.select().from(locations).where(and(eq(locations.businessId, businessId), eq(locations.isActive, true)));
  const team = await exec
    .select({ name: businessMembers.displayName, title: businessMembers.title })
    .from(businessMembers)
    .where(and(eq(businessMembers.businessId, businessId), eq(businessMembers.status, "active"), eq(businessMembers.isBookable, true)));

  const prices = svcs.map((s) => displayPriceRange(s)).filter((p): p is { min: number; max: number } => p != null);
  const primary = locs.find((l) => l.kind === "physical" && l.isPrimary) ?? locs.find((l) => l.kind === "physical") ?? locs.find((l) => l.lat != null);
  const text = normalizeSearch(
    [
      b.name,
      b.slug.replace(/-/g, " "),
      b.tagline,
      ...[...cats, ...parents].flatMap((c) => [c.name, ...c.keywords]),
      ...svcs.flatMap((s) => [s.name, s.menuSection, s.description?.slice(0, 200)]),
      ...team.flatMap((t) => [t.name, t.title]),
      ...locs.flatMap((l) => [l.city, l.region]),
    ]
      .filter(Boolean)
      .join(" "),
  ).slice(0, 8000);

  await exec
    .update(businesses)
    .set({
      searchText: text,
      priceMinCents: prices.length ? Math.min(...prices.map((p) => p.min)) : null,
      priceMaxCents: prices.length ? Math.max(...prices.map((p) => p.max)) : null,
      offersMobile: locs.some((l) => l.kind === "mobile"),
      offersVirtual: locs.some((l) => l.kind === "virtual"),
      lat: primary?.lat ?? null,
      lng: primary?.lng ?? null,
      city: primary?.city ?? null,
    })
    .where(eq(businesses.id, businessId));
}
