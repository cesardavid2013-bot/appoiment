import "server-only";
import { and, asc, desc, eq, inArray, sql, type SQL } from "drizzle-orm";
import { z } from "zod";
import { normalizeSearch } from "@/domain/slugs";
import { addDaysIso, todayIn } from "@/domain/time";
import { db } from "../db/client";
import { businesses, categories, portfolioItems, services } from "../db/schema";
import { getSlots } from "./availability";
import { getMediaMap, type PublicMedia } from "./media";
import { activeSpotlightCondition, MAX_PROMOTED_PER_SEARCH, recordImpressions } from "./spotlight";

export const searchSchema = z.object({
  q: z.string().trim().max(100).optional(),
  category: z.string().trim().max(60).optional(),
  lat: z.coerce.number().min(-90).max(90).optional(),
  lng: z.coerce.number().min(-180).max(180).optional(),
  radiusKm: z.coerce.number().min(1).max(200).optional(),
  minRating: z.coerce.number().min(1).max(5).optional(),
  maxPrice: z.coerce.number().int().min(0).optional(),
  mobile: z.coerce.boolean().optional(),
  virtual: z.coerce.boolean().optional(),
  instant: z.coerce.boolean().optional(),
  availableToday: z.coerce.boolean().optional(),
  kind: z.enum(["individual", "business"]).optional(),
  sort: z.enum(["relevance", "distance", "rating", "price"]).default("relevance"),
  page: z.coerce.number().int().min(1).max(50).default(1),
});
export type SearchParams = z.infer<typeof searchSchema>;

export type SearchResult = {
  id: string;
  slug: string;
  name: string;
  kind: "individual" | "business";
  tagline: string | null;
  city: string | null;
  categoryName: string | null;
  /** Primary category slug, for showing the category name in the viewer's language. */
  categorySlug: string | null;
  ratingAvg: number | null;
  ratingCount: number;
  priceMinCents: number | null;
  priceMaxCents: number | null;
  currency: string;
  verified: boolean;
  offersMobile: boolean;
  offersVirtual: boolean;
  instant: boolean;
  lat: number | null;
  lng: number | null;
  distanceKm: number | null;
  cover: PublicMedia | null;
  logo: PublicMedia | null;
  topServices: { id: string; name: string; priceType: string; priceCents: number; salePriceCents: number | null; priceMaxCents: number | null; durationMinutes: number }[];
  nextAvailable: string | null;
  /** Real upcoming openings for `nextServiceId`, for one-tap booking from cards. */
  nextSlots: string[];
  nextServiceId: string | null;
  timezone: string;
  promoted: boolean;
};

const PAGE_SIZE = 18;

/** Converts free text into a prefix-matching tsquery: "fade hou" → 'fade:* & hou:*' */
function toTsQuery(q: string): string | null {
  const tokens = normalizeSearch(q)
    .split(" ")
    .filter((t) => t.length > 0)
    .slice(0, 8);
  if (!tokens.length) return null;
  return tokens.map((t) => `${t}:*`).join(" & ");
}

async function categoryIds(slug: string): Promise<string[]> {
  const [c] = await db.select({ id: categories.id }).from(categories).where(eq(categories.slug, slug));
  if (!c) return [];
  const kids = await db.select({ id: categories.id }).from(categories).where(eq(categories.parentId, c.id));
  return [c.id, ...kids.map((k) => k.id)];
}

// Small in-process cache for availability hints so search stays fast.
const nextCache = new Map<string, { at: number; value: string[] }>();

/** Up to `count` well-spaced openings on the first day that has any (within two weeks). */
async function nextSlotsForService(businessId: string, serviceId: string | undefined, tz: string, count = 4): Promise<string[]> {
  if (!serviceId) return [];
  const key = `${businessId}:${serviceId}`;
  const hit = nextCache.get(key);
  if (hit && Date.now() - hit.at < 90_000) return hit.value;
  let value: string[] = [];
  try {
    const from = todayIn(tz);
    const res = await getSlots({ serviceId, memberId: "any", fromDate: from, toDate: addDaysIso(from, 13), optionIds: [], autoDefaults: true });
    const day = res.days.find((d) => d.slots.length);
    if (day) {
      let last = -Infinity;
      for (const s of day.slots) {
        const t = new Date(s.start).getTime();
        if (t - last >= 30 * 60_000) {
          value.push(s.start);
          last = t;
        }
        if (value.length >= count) break;
      }
    }
  } catch {
    value = [];
  }
  if (nextCache.size > 5000) nextCache.clear();
  nextCache.set(key, { at: Date.now(), value });
  return value;
}

export async function searchBusinesses(p: SearchParams) {
  const conds: SQL[] = [eq(businesses.status, "active"), sql`exists (select 1 from services s join service_staff ss on ss.service_id = s.id where s.business_id = businesses.id and s.status = 'active')`];
  const tsq = p.q ? toTsQuery(p.q) : null;
  const norm = p.q ? normalizeSearch(p.q) : "";

  if (tsq) {
    // Full-text prefix match OR fuzzy (typo-tolerant) trigram match.
    conds.push(sql`(to_tsvector('simple', ${businesses.searchText}) @@ to_tsquery('simple', ${tsq}) or word_similarity(${norm}, ${businesses.searchText}) > 0.45)`);
  }
  let catIds: string[] | null = null;
  if (p.category) {
    const ids = await categoryIds(p.category);
    catIds = ids;
    if (ids.length)
      conds.push(sql`(${inArray(businesses.primaryCategoryId, ids)} or exists (select 1 from services s where s.business_id = businesses.id and s.status = 'active' and ${inArray(sql`s.category_id`, ids)}))`);
    else conds.push(sql`false`);
  }
  if (p.minRating) conds.push(sql`${businesses.ratingAvg} >= ${p.minRating}`);
  if (p.maxPrice != null) conds.push(sql`${businesses.priceMinCents} <= ${p.maxPrice}`);
  if (p.mobile) conds.push(eq(businesses.offersMobile, true));
  if (p.virtual) conds.push(eq(businesses.offersVirtual, true));
  if (p.instant) conds.push(eq(businesses.bookingMode, "instant"));
  if (p.kind) conds.push(eq(businesses.kind, p.kind));

  const hasGeo = p.lat != null && p.lng != null;
  const distance = hasGeo
    ? sql<number>`(6371 * acos(least(1, greatest(-1, cos(radians(${p.lat})) * cos(radians(${businesses.lat})) * cos(radians(${businesses.lng}) - radians(${p.lng})) + sin(radians(${p.lat})) * sin(radians(${businesses.lat}))))))`
    : sql<number>`null`;
  if (hasGeo && p.radiusKm) {
    const dLat = p.radiusKm / 111;
    const dLng = p.radiusKm / (111 * Math.max(0.1, Math.cos((p.lat! * Math.PI) / 180)));
    // Bounding box first (index-friendly), exact distance second. Virtual-only businesses stay visible.
    conds.push(
      sql`((${businesses.lat} between ${p.lat! - dLat} and ${p.lat! + dLat} and ${businesses.lng} between ${p.lng! - dLng} and ${p.lng! + dLng} and ${distance} <= ${p.radiusKm}) or (${businesses.lat} is null and ${businesses.offersVirtual}))`,
    );
  }

  const relevance = tsq
    ? sql<number>`(ts_rank(to_tsvector('simple', ${businesses.searchText}), to_tsquery('simple', ${tsq})) * 2 + word_similarity(${norm}, ${businesses.searchText}) + case when lower(${businesses.name}) like ${norm + "%"} then 1 else 0 end)`
    : sql<number>`0`;
  // Bayesian-ish rating so 1 review at 5★ doesn't outrank 200 at 4.9★.
  const quality = sql<number>`((coalesce(${businesses.ratingAvg}, 0) * ${businesses.ratingCount} + 4.2 * 5) / (${businesses.ratingCount} + 5))`;

  let order: SQL[];
  switch (p.sort) {
    case "distance":
      order = hasGeo ? [sql`${distance} asc nulls last`] : [desc(quality)];
      break;
    case "rating":
      order = [desc(quality), desc(businesses.ratingCount)];
      break;
    case "price":
      order = [sql`${businesses.priceMinCents} asc nulls last`];
      break;
    default:
      order = [sql`(${relevance} + ${quality} * 0.15 ${hasGeo ? sql`- least(${distance}, 50) * 0.02` : sql``}) desc`];
  }

  const selection = {
    id: businesses.id,
    slug: businesses.slug,
    name: businesses.name,
    kind: businesses.kind,
    tagline: businesses.tagline,
    city: businesses.city,
    ratingAvg: businesses.ratingAvg,
    ratingCount: businesses.ratingCount,
    priceMinCents: businesses.priceMinCents,
    priceMaxCents: businesses.priceMaxCents,
    currency: businesses.currency,
    verificationStatus: businesses.verificationStatus,
    offersMobile: businesses.offersMobile,
    offersVirtual: businesses.offersVirtual,
    bookingMode: businesses.bookingMode,
    lat: businesses.lat,
    lng: businesses.lng,
    logoMediaId: businesses.logoMediaId,
    coverMediaId: businesses.coverMediaId,
    timezone: businesses.timezone,
    categoryName: sql<string | null>`(select c.name from categories c where c.id = businesses.primary_category_id)`,
    categorySlug: sql<string | null>`(select c.slug from categories c where c.id = businesses.primary_category_id)`,
    distanceKm: distance,
  };

  // Spotlight: up to two promoted matches lead the first page, rotating fairly.
  let promoted: Awaited<ReturnType<typeof runPromoted>> = [];
  async function runPromoted() {
    return db
      .select(selection)
      .from(businesses)
      .where(and(...conds, activeSpotlightCondition(catIds)))
      .orderBy(sql`random()`)
      .limit(MAX_PROMOTED_PER_SEARCH);
  }
  if (p.page === 1 && p.sort === "relevance" && !p.availableToday) {
    promoted = await runPromoted();
    await recordImpressions(promoted.map((r) => r.id));
  }
  const promotedIds = promoted.map((r) => r.id);

  const limit = p.availableToday ? 60 : PAGE_SIZE + 1;
  const rows = await db
    .select(selection)
    .from(businesses)
    .where(and(...conds, promotedIds.length ? sql`${businesses.id} not in (${sql.join(promotedIds.map((i) => sql`${i}::uuid`), sql`, `)})` : sql`true`))
    .orderBy(...order, asc(businesses.id))
    .limit(limit)
    .offset(p.availableToday ? 0 : (p.page - 1) * PAGE_SIZE);

  const hasMore = !p.availableToday && rows.length > PAGE_SIZE;
  const organic = hasMore ? rows.slice(0, PAGE_SIZE) : rows;
  const page = [...promoted.map((r) => ({ ...r, promoted: true })), ...organic.map((r) => ({ ...r, promoted: false }))];
  return hydrate(page, { hasMore, availableToday: Boolean(p.availableToday), query: norm });
}

async function hydrate(
  rows: {
    id: string;
    slug: string;
    name: string;
    kind: "individual" | "business";
    tagline: string | null;
    city: string | null;
    ratingAvg: number | null;
    ratingCount: number;
    priceMinCents: number | null;
    priceMaxCents: number | null;
    currency: string;
    verificationStatus: string;
    offersMobile: boolean;
    offersVirtual: boolean;
    bookingMode: string;
    lat: number | null;
    lng: number | null;
    logoMediaId: string | null;
    coverMediaId: string | null;
    timezone: string;
    categoryName: string | null;
    categorySlug: string | null;
    distanceKm: number | null;
    promoted: boolean;
  }[],
  opts: { hasMore: boolean; availableToday: boolean; query: string },
): Promise<{ results: SearchResult[]; hasMore: boolean }> {
  if (!rows.length) return { results: [], hasMore: false };
  const ids = rows.map((r) => r.id);
  const svcRows = await db
    .select({
      id: services.id,
      businessId: services.businessId,
      name: services.name,
      priceType: services.priceType,
      priceCents: services.priceCents,
      salePriceCents: services.salePriceCents,
      priceMaxCents: services.priceMaxCents,
      durationMinutes: services.durationMinutes,
      sortOrder: services.sortOrder,
    })
    .from(services)
    .where(and(inArray(services.businessId, ids), eq(services.status, "active"), sql`exists (select 1 from service_staff ss where ss.service_id = services.id)`))
    .orderBy(asc(services.sortOrder));
  // Fall back to the latest portfolio image when no cover is set — real work beats a blank card.
  const fallbackCovers = await db
    .selectDistinctOn([portfolioItems.businessId], { businessId: portfolioItems.businessId, mediaId: portfolioItems.mediaId })
    .from(portfolioItems)
    .where(and(inArray(portfolioItems.businessId, ids), sql`${portfolioItems.deletedAt} is null`, sql`${portfolioItems.kind} <> 'video'`))
    .orderBy(portfolioItems.businessId, desc(portfolioItems.isFeatured), desc(portfolioItems.createdAt));
  const media = await getMediaMap([...rows.flatMap((r) => [r.logoMediaId, r.coverMediaId]), ...fallbackCovers.map((f) => f.mediaId)]);

  const results: SearchResult[] = await Promise.all(
    rows.map(async (r) => {
      const svcs = svcRows.filter((s) => s.businessId === r.id);
      // Surface the services that match the query first (e.g. "fade" → "Skin fade").
      const ranked = opts.query
        ? [...svcs].sort((a, b) => Number(normalizeSearch(b.name).includes(opts.query.split(" ")[0])) - Number(normalizeSearch(a.name).includes(opts.query.split(" ")[0])))
        : svcs;
      const nextSlots = await nextSlotsForService(r.id, ranked[0]?.id, r.timezone);
      const coverId = r.coverMediaId ?? fallbackCovers.find((f) => f.businessId === r.id)?.mediaId ?? null;
      return {
        id: r.id,
        slug: r.slug,
        name: r.name,
        kind: r.kind,
        tagline: r.tagline,
        city: r.city,
        categoryName: r.categoryName,
        categorySlug: r.categorySlug,
        ratingAvg: r.ratingAvg,
        ratingCount: r.ratingCount,
        priceMinCents: r.priceMinCents,
        priceMaxCents: r.priceMaxCents,
        currency: r.currency,
        verified: r.verificationStatus === "verified",
        offersMobile: r.offersMobile,
        offersVirtual: r.offersVirtual,
        instant: r.bookingMode === "instant",
        lat: r.lat,
        lng: r.lng,
        distanceKm: r.distanceKm != null ? Math.round(r.distanceKm * 10) / 10 : null,
        cover: coverId ? (media.get(coverId) ?? null) : null,
        logo: r.logoMediaId ? (media.get(r.logoMediaId) ?? null) : null,
        topServices: ranked.slice(0, 3).map(({ id, name, priceType, priceCents, salePriceCents, priceMaxCents, durationMinutes }) => ({ id, name, priceType, priceCents, salePriceCents, priceMaxCents, durationMinutes })),
        nextAvailable: nextSlots[0] ?? null,
        nextSlots,
        nextServiceId: ranked[0]?.id ?? null,
        timezone: r.timezone,
        promoted: r.promoted,
      };
    }),
  );

  if (opts.availableToday) {
    const filtered = results.filter((r) => r.nextAvailable && todayIn(r.timezone, new Date(r.nextAvailable)) === todayIn(r.timezone));
    return { results: filtered.slice(0, PAGE_SIZE), hasMore: false };
  }
  return { results, hasMore: opts.hasMore };
}

/** Lightweight typeahead: businesses, services and categories. */
export async function suggest(q: string) {
  const norm = normalizeSearch(q);
  if (norm.length < 2) return { businesses: [], categories: [] };
  const tsq = toTsQuery(q)!;
  const [biz, cats] = await Promise.all([
    db
      .select({ slug: businesses.slug, name: businesses.name, city: businesses.city })
      .from(businesses)
      .where(and(eq(businesses.status, "active"), sql`(to_tsvector('simple', ${businesses.searchText}) @@ to_tsquery('simple', ${tsq}) or word_similarity(${norm}, ${businesses.searchText}) > 0.5)`))
      .orderBy(sql`word_similarity(${norm}, lower(${businesses.name})) desc`, desc(businesses.ratingCount))
      .limit(5),
    db
      .select({ slug: categories.slug, name: categories.name })
      .from(categories)
      .where(and(eq(categories.isActive, true), sql`(lower(${categories.name}) like ${"%" + norm + "%"} or ${norm} = any(${categories.keywords}) or word_similarity(${norm}, lower(${categories.name})) > 0.5)`))
      .limit(5),
  ]);
  return { businesses: biz, categories: cats };
}

/** Discovery modules for the home screen, each backed by real data only and without repeats. */
export async function homeModules(opts: { lat?: number; lng?: number }) {
  const geo = opts.lat != null && opts.lng != null ? { lat: opts.lat, lng: opts.lng, radiusKm: 40 } : {};
  const [all, newest] = await Promise.all([
    searchBusinesses(searchSchema.parse({ ...geo })),
    db
      .select({ id: businesses.id })
      .from(businesses)
      .where(and(eq(businesses.status, "active"), sql`${businesses.publishedAt} > now() - interval '60 days'`))
      .orderBy(desc(businesses.publishedAt))
      .limit(12),
  ]);
  const results = all.results;
  const soonest = results
    .filter((r) => r.nextAvailable)
    .sort((a, b) => new Date(a.nextAvailable!).getTime() - new Date(b.nextAvailable!).getTime())
    .slice(0, 4);
  const used = new Set(soonest.map((r) => r.id));
  const quality = (r: SearchResult) => ((r.ratingAvg ?? 0) * r.ratingCount + 4.2 * 5) / (r.ratingCount + 5);
  const topRated = results
    .filter((r) => r.ratingCount > 0 && !used.has(r.id))
    .sort((a, b) => quality(b) - quality(a))
    .slice(0, 4);
  topRated.forEach((r) => used.add(r.id));
  const newIds = new Set(newest.map((n) => n.id));
  const newcomers = results.filter((r) => newIds.has(r.id) && !used.has(r.id)).slice(0, 4);
  return { availableSoon: soonest, topRated, newcomers, nearby: results.slice(0, 8) };
}

/** Card data for specific businesses (favorites, recently viewed). */
export async function hydrateIds(ids: string[]): Promise<SearchResult[]> {
  if (!ids.length) return [];
  const rows = await db
    .select({
      id: businesses.id,
      slug: businesses.slug,
      name: businesses.name,
      kind: businesses.kind,
      tagline: businesses.tagline,
      city: businesses.city,
      ratingAvg: businesses.ratingAvg,
      ratingCount: businesses.ratingCount,
      priceMinCents: businesses.priceMinCents,
      priceMaxCents: businesses.priceMaxCents,
      currency: businesses.currency,
      verificationStatus: businesses.verificationStatus,
      offersMobile: businesses.offersMobile,
      offersVirtual: businesses.offersVirtual,
      bookingMode: businesses.bookingMode,
      lat: businesses.lat,
      lng: businesses.lng,
      logoMediaId: businesses.logoMediaId,
      coverMediaId: businesses.coverMediaId,
      timezone: businesses.timezone,
      categoryName: sql<string | null>`(select c.name from categories c where c.id = businesses.primary_category_id)`,
      categorySlug: sql<string | null>`(select c.slug from categories c where c.id = businesses.primary_category_id)`,
      distanceKm: sql<number | null>`null`,
    })
    .from(businesses)
    .where(and(inArray(businesses.id, ids), eq(businesses.status, "active")));
  const res = await hydrate(rows.map((r) => ({ ...r, promoted: false })), { hasMore: false, availableToday: false, query: "" });
  return res.results;
}
