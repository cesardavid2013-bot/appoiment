/**
 * Kept — database schema.
 *
 * Conventions
 * - All timestamps are `timestamptz` (UTC instants). Wall-clock schedule data
 *   (weekly hours, date overrides) is stored as local minutes-from-midnight and
 *   interpreted in the owning location/business IANA time zone.
 * - Money is stored as integer minor units (cents) plus an ISO currency code.
 * - Business-critical records (appointments, payments, reviews, members) are
 *   never hard-deleted by application code; they move through statuses.
 * - Constraints that Drizzle cannot express (exclusion constraints, trigram
 *   indexes, extensions) live in hand-written SQL migrations under /drizzle.
 */
import { sql } from "drizzle-orm";
import {
  bigserial,
  boolean,
  check,
  customType,
  date,
  doublePrecision,
  index,
  integer,
  jsonb,
  pgEnum,
  pgTable,
  primaryKey,
  smallint,
  text,
  timestamp,
  uniqueIndex,
  uuid,
} from "drizzle-orm/pg-core";

const citext = customType<{ data: string }>({
  dataType() {
    return "citext";
  },
});

const ts = (name: string) => timestamp(name, { withTimezone: true, mode: "date" });
const createdAt = () => ts("created_at").notNull().defaultNow();
const updatedAt = () =>
  ts("updated_at")
    .notNull()
    .defaultNow()
    .$onUpdate(() => new Date());
const id = () => uuid("id").primaryKey().defaultRandom();

/* ────────────────────────────── Enums ────────────────────────────── */

export const platformRole = pgEnum("platform_role", ["user", "support", "admin"]);
export const userStatus = pgEnum("user_status", ["active", "suspended", "deleted"]);
export const tokenKind = pgEnum("token_kind", ["email_verify", "password_reset"]);

export const businessKind = pgEnum("business_kind", ["individual", "business"]);
export const businessStatus = pgEnum("business_status", ["draft", "active", "suspended", "closed"]);
export const verificationStatus = pgEnum("verification_status", [
  "not_submitted",
  "pending",
  "verified",
  "rejected",
  "needs_info",
]);
export const bookingMode = pgEnum("booking_mode", ["instant", "request"]);
export const planTier = pgEnum("plan_tier", ["free", "pro", "business"]);

export const memberRole = pgEnum("member_role", ["owner", "manager", "receptionist", "provider", "custom"]);
export const memberStatus = pgEnum("member_status", ["invited", "active", "disabled"]);

export const locationKind = pgEnum("location_kind", ["physical", "mobile", "virtual"]);

export const priceType = pgEnum("price_type", ["fixed", "starting_at", "range", "free", "quote"]);
export const paymentPolicy = pgEnum("payment_policy", ["pay_later", "deposit", "full"]);
export const depositType = pgEnum("deposit_type", ["fixed", "percent"]);
export const serviceStatus = pgEnum("service_status", ["active", "hidden", "archived"]);
export const optionSelection = pgEnum("option_selection", ["single", "multiple"]);

export const blockReason = pgEnum("block_reason", ["break", "personal", "vacation", "sick", "holiday", "other"]);

export const appointmentStatus = pgEnum("appointment_status", [
  "pending_payment", // slot held while the customer completes checkout
  "requested", // awaiting provider approval (request-mode businesses)
  "confirmed",
  "checked_in",
  "in_progress",
  "completed",
  "cancelled",
  "declined",
  "no_show",
  "expired", // hold or request lapsed without completion
]);
export const appointmentSource = pgEnum("appointment_source", ["marketplace", "direct_link", "manual", "walk_in"]);
export const actorType = pgEnum("actor_type", ["customer", "business", "system", "admin"]);
export const paymentStatus = pgEnum("appointment_payment_status", [
  "not_required",
  "unpaid",
  "pay_in_person",
  "deposit_paid",
  "paid",
  "partially_refunded",
  "refunded",
]);

export const paymentKind = pgEnum("payment_kind", ["deposit", "full", "balance", "tip", "cancellation_fee", "no_show_fee"]);
export const paymentProvider = pgEnum("payment_provider", ["stripe", "manual"]);
export const paymentRecordStatus = pgEnum("payment_record_status", [
  "requires_payment",
  "processing",
  "succeeded",
  "failed",
  "cancelled",
]);
export const refundStatus = pgEnum("refund_status", ["pending", "succeeded", "failed"]);

export const reviewStatus = pgEnum("review_status", ["published", "hidden", "removed"]);
export const reportStatus = pgEnum("report_status", ["open", "resolved", "dismissed"]);
export const senderRole = pgEnum("sender_role", ["customer", "business", "system"]);
export const mediaKind = pgEnum("media_kind", ["image", "video"]);
export const mediaStatus = pgEnum("media_status", ["processing", "ready", "failed"]);
export const portfolioKind = pgEnum("portfolio_kind", ["image", "video", "before_after"]);
export const jobStatus = pgEnum("job_status", ["pending", "running", "done", "failed", "cancelled"]);
export const promoKind = pgEnum("promo_kind", ["percent", "fixed"]);
export const waitlistStatus = pgEnum("waitlist_status", ["active", "notified", "booked", "cancelled", "expired"]);
export const ticketStatus = pgEnum("ticket_status", ["open", "awaiting_customer", "resolved", "closed"]);

/* ───────────────────────────── Identity ──────────────────────────── */

export const users = pgTable(
  "users",
  {
    id: id(),
    email: citext("email"),
    emailVerifiedAt: ts("email_verified_at"),
    phone: text("phone"),
    phoneVerifiedAt: ts("phone_verified_at"),
    passwordHash: text("password_hash"),
    name: text("name").notNull(),
    avatarMediaId: uuid("avatar_media_id"),
    platformRole: platformRole("platform_role").notNull().default("user"),
    status: userStatus("status").notNull().default("active"),
    timezone: text("timezone"),
    /** Preferred language for emails and notifications (one of src/i18n/locales.ts). */
    locale: text("locale"),
    /** Per-channel/per-topic notification preferences, validated by domain/notifications.ts */
    notificationPrefs: jsonb("notification_prefs").$type<Record<string, unknown>>().notNull().default({}),
    lastLoginAt: ts("last_login_at"),
    deletedAt: ts("deleted_at"),
    createdAt: createdAt(),
    updatedAt: updatedAt(),
  },
  (t) => [
    uniqueIndex("users_email_uq").on(t.email).where(sql`${t.email} is not null`),
    uniqueIndex("users_phone_uq").on(t.phone).where(sql`${t.phone} is not null`),
  ],
);

export const oauthAccounts = pgTable(
  "oauth_accounts",
  {
    id: id(),
    userId: uuid("user_id")
      .notNull()
      .references(() => users.id, { onDelete: "cascade" }),
    provider: text("provider").notNull(),
    providerAccountId: text("provider_account_id").notNull(),
    createdAt: createdAt(),
  },
  (t) => [uniqueIndex("oauth_provider_account_uq").on(t.provider, t.providerAccountId), index().on(t.userId)],
);

/** Server-side sessions. `id` is the SHA-256 of the random cookie token; the raw token is never stored. */
export const sessions = pgTable(
  "sessions",
  {
    id: text("id").primaryKey(),
    userId: uuid("user_id")
      .notNull()
      .references(() => users.id, { onDelete: "cascade" }),
    expiresAt: ts("expires_at").notNull(),
    lastSeenAt: ts("last_seen_at").notNull().defaultNow(),
    userAgent: text("user_agent"),
    ipHash: text("ip_hash"),
    createdAt: createdAt(),
  },
  (t) => [index().on(t.userId), index().on(t.expiresAt)],
);

export const authTokens = pgTable(
  "auth_tokens",
  {
    id: id(),
    userId: uuid("user_id")
      .notNull()
      .references(() => users.id, { onDelete: "cascade" }),
    kind: tokenKind("kind").notNull(),
    tokenHash: text("token_hash").notNull(),
    expiresAt: ts("expires_at").notNull(),
    usedAt: ts("used_at"),
    createdAt: createdAt(),
  },
  (t) => [uniqueIndex("auth_tokens_hash_uq").on(t.tokenHash), index().on(t.userId, t.kind)],
);

export const userAddresses = pgTable(
  "user_addresses",
  {
    id: id(),
    userId: uuid("user_id")
      .notNull()
      .references(() => users.id, { onDelete: "cascade" }),
    label: text("label").notNull(),
    line1: text("line1").notNull(),
    line2: text("line2"),
    city: text("city").notNull(),
    region: text("region"),
    postalCode: text("postal_code"),
    country: text("country").notNull().default("US"),
    lat: doublePrecision("lat"),
    lng: doublePrecision("lng"),
    createdAt: createdAt(),
  },
  (t) => [index().on(t.userId)],
);

/* ──────────────────────────── Taxonomy ───────────────────────────── */

export const categories = pgTable(
  "categories",
  {
    id: id(),
    parentId: uuid("parent_id"),
    slug: text("slug").notNull(),
    name: text("name").notNull(),
    description: text("description"),
    /** Search synonyms, e.g. "fade", "taper" for Barber. */
    keywords: text("keywords").array().notNull().default(sql`'{}'::text[]`),
    sortOrder: integer("sort_order").notNull().default(0),
    isActive: boolean("is_active").notNull().default(true),
    createdAt: createdAt(),
  },
  (t) => [uniqueIndex("categories_slug_uq").on(t.slug), index().on(t.parentId)],
);

/* ──────────────────────────── Businesses ─────────────────────────── */

export const businesses = pgTable(
  "businesses",
  {
    id: id(),
    slug: citext("slug").notNull(),
    name: text("name").notNull(),
    kind: businessKind("kind").notNull(),
    ownerUserId: uuid("owner_user_id")
      .notNull()
      .references(() => users.id),
    primaryCategoryId: uuid("primary_category_id").references(() => categories.id),
    tagline: text("tagline"),
    about: text("about"),
    logoMediaId: uuid("logo_media_id"),
    coverMediaId: uuid("cover_media_id"),
    timezone: text("timezone").notNull(),
    currency: text("currency").notNull().default("USD"),
    contactEmail: text("contact_email"),
    contactPhone: text("contact_phone"),
    website: text("website"),
    socialLinks: jsonb("social_links").$type<Record<string, string>>().notNull().default({}),
    languages: text("languages").array().notNull().default(sql`'{}'::text[]`),
    amenities: text("amenities").array().notNull().default(sql`'{}'::text[]`),
    yearsExperience: smallint("years_experience"),
    status: businessStatus("status").notNull().default("draft"),
    verificationStatus: verificationStatus("verification_status").notNull().default("not_submitted"),
    plan: planTier("plan").notNull().default("free"),

    // Booking rules (business defaults; services may override some)
    bookingMode: bookingMode("booking_mode").notNull().default("instant"),
    minNoticeMinutes: integer("min_notice_minutes").notNull().default(60),
    maxAdvanceDays: integer("max_advance_days").notNull().default(60),
    slotIntervalMinutes: integer("slot_interval_minutes").notNull().default(15),
    allowAnyStaff: boolean("allow_any_staff").notNull().default(true),
    // Policies
    cancellationWindowHours: integer("cancellation_window_hours").notNull().default(24),
    rescheduleWindowHours: integer("reschedule_window_hours").notNull().default(24),
    lateCancelFeePercent: smallint("late_cancel_fee_percent").notNull().default(0),
    noShowFeePercent: smallint("no_show_fee_percent").notNull().default(0),
    depositRefundable: boolean("deposit_refundable").notNull().default(true),
    latePolicy: text("late_policy"),
    bookingInstructions: text("booking_instructions"),
    taxRateBps: integer("tax_rate_bps").notNull().default(0),
    taxLabel: text("tax_label"),
    reminderOffsetsMinutes: integer("reminder_offsets_minutes").array().notNull().default(sql`'{1440,120}'::int[]`),

    // Payments
    stripeAccountId: text("stripe_account_id"),
    paymentsEnabled: boolean("payments_enabled").notNull().default(false),

    // Denormalised, maintained by services/search.ts & services/reviews.ts
    ratingAvg: doublePrecision("rating_avg"),
    ratingCount: integer("rating_count").notNull().default(0),
    priceMinCents: integer("price_min_cents"),
    priceMaxCents: integer("price_max_cents"),
    searchText: text("search_text").notNull().default(""),
    offersMobile: boolean("offers_mobile").notNull().default(false),
    offersVirtual: boolean("offers_virtual").notNull().default(false),
    lat: doublePrecision("lat"),
    lng: doublePrecision("lng"),
    city: text("city"),

    onboarding: jsonb("onboarding").$type<{ completed?: string[]; skipped?: string[] }>().notNull().default({}),
    publishedAt: ts("published_at"),
    createdAt: createdAt(),
    updatedAt: updatedAt(),
  },
  (t) => [
    uniqueIndex("businesses_slug_uq").on(t.slug),
    index().on(t.ownerUserId),
    index().on(t.status, t.primaryCategoryId),
    index("businesses_geo_idx").on(t.lat, t.lng),
    check("businesses_slot_interval_ck", sql`${t.slotIntervalMinutes} between 5 and 240`),
    check("businesses_fee_pct_ck", sql`${t.lateCancelFeePercent} between 0 and 100 and ${t.noShowFeePercent} between 0 and 100`),
    check("businesses_currency_ck", sql`${t.currency} ~ '^[A-Z]{3}$'`),
  ],
);

/** Staff & roles. An individual provider is simply the owner member of an `individual` business. */
export const businessMembers = pgTable(
  "business_members",
  {
    id: id(),
    businessId: uuid("business_id")
      .notNull()
      .references(() => businesses.id),
    userId: uuid("user_id").references(() => users.id),
    inviteEmail: citext("invite_email"),
    inviteTokenHash: text("invite_token_hash"),
    inviteExpiresAt: ts("invite_expires_at"),
    role: memberRole("role").notNull(),
    /** Only used when role = 'custom'. Preset roles derive permissions from domain/permissions.ts */
    customPermissions: text("custom_permissions").array().notNull().default(sql`'{}'::text[]`),
    displayName: text("display_name").notNull(),
    title: text("title"),
    bio: text("bio"),
    avatarMediaId: uuid("avatar_media_id"),
    isBookable: boolean("is_bookable").notNull().default(true),
    status: memberStatus("status").notNull().default("active"),
    commissionBps: integer("commission_bps"),
    color: text("color"),
    sortOrder: integer("sort_order").notNull().default(0),
    joinedAt: ts("joined_at"),
    disabledAt: ts("disabled_at"),
    createdAt: createdAt(),
    updatedAt: updatedAt(),
  },
  (t) => [
    uniqueIndex("members_business_user_uq").on(t.businessId, t.userId).where(sql`${t.userId} is not null`),
    uniqueIndex("members_invite_hash_uq").on(t.inviteTokenHash).where(sql`${t.inviteTokenHash} is not null`),
    index().on(t.userId),
  ],
);

export const locations = pgTable(
  "locations",
  {
    id: id(),
    businessId: uuid("business_id")
      .notNull()
      .references(() => businesses.id),
    name: text("name").notNull(),
    kind: locationKind("kind").notNull(),
    line1: text("line1"),
    line2: text("line2"),
    city: text("city"),
    region: text("region"),
    postalCode: text("postal_code"),
    country: text("country"),
    lat: doublePrecision("lat"),
    lng: doublePrecision("lng"),
    /** For mobile services: how far the provider travels. */
    serviceRadiusKm: integer("service_radius_km"),
    timezone: text("timezone").notNull(),
    phone: text("phone"),
    instructions: text("instructions"),
    isPrimary: boolean("is_primary").notNull().default(false),
    isActive: boolean("is_active").notNull().default(true),
    createdAt: createdAt(),
    updatedAt: updatedAt(),
  },
  (t) => [index().on(t.businessId)],
);

export const memberLocations = pgTable(
  "member_locations",
  {
    memberId: uuid("member_id")
      .notNull()
      .references(() => businessMembers.id, { onDelete: "cascade" }),
    locationId: uuid("location_id")
      .notNull()
      .references(() => locations.id, { onDelete: "cascade" }),
  },
  (t) => [primaryKey({ columns: [t.memberId, t.locationId] })],
);

/** Reservable resources (chairs, rooms, stations, courts). */
export const resources = pgTable(
  "resources",
  {
    id: id(),
    businessId: uuid("business_id")
      .notNull()
      .references(() => businesses.id),
    locationId: uuid("location_id").references(() => locations.id),
    name: text("name").notNull(),
    kind: text("kind").notNull(),
    isActive: boolean("is_active").notNull().default(true),
    createdAt: createdAt(),
  },
  (t) => [index().on(t.businessId)],
);

/* ───────────────────────────── Services ──────────────────────────── */

export type WeeklyIntervals = { weekday: number; start: number; end: number }[];

export const intakeForms = pgTable(
  "intake_forms",
  {
    id: id(),
    businessId: uuid("business_id")
      .notNull()
      .references(() => businesses.id),
    name: text("name").notNull(),
    /** Array of FormField, validated by domain/forms.ts */
    fields: jsonb("fields").$type<unknown[]>().notNull().default([]),
    archivedAt: ts("archived_at"),
    createdAt: createdAt(),
    updatedAt: updatedAt(),
  },
  (t) => [index().on(t.businessId)],
);

export const services = pgTable(
  "services",
  {
    id: id(),
    businessId: uuid("business_id")
      .notNull()
      .references(() => businesses.id),
    categoryId: uuid("category_id").references(() => categories.id),
    /** Provider-defined menu section, e.g. "Cuts", "Colour", "Packages". */
    menuSection: text("menu_section"),
    name: text("name").notNull(),
    slug: text("slug").notNull(),
    description: text("description"),
    durationMinutes: integer("duration_minutes").notNull(),
    bufferBeforeMinutes: integer("buffer_before_minutes").notNull().default(0),
    bufferAfterMinutes: integer("buffer_after_minutes").notNull().default(0),
    priceType: priceType("price_type").notNull().default("fixed"),
    priceCents: integer("price_cents").notNull().default(0),
    salePriceCents: integer("sale_price_cents"),
    priceMaxCents: integer("price_max_cents"),
    paymentPolicy: paymentPolicy("payment_policy").notNull().default("pay_later"),
    depositType: depositType("deposit_type"),
    depositValue: integer("deposit_value"),
    capacity: integer("capacity").notNull().default(1),
    minAttendees: integer("min_attendees").notNull().default(1),
    minNoticeMinutes: integer("min_notice_minutes"),
    maxAdvanceDays: integer("max_advance_days"),
    /** null = inherit business booking mode */
    requiresApproval: boolean("requires_approval"),
    /** Optional weekly windows further restricting when this service can be booked. */
    serviceHours: jsonb("service_hours").$type<WeeklyIntervals>(),
    intakeFormId: uuid("intake_form_id").references(() => intakeForms.id),
    consentText: text("consent_text"),
    minAge: smallint("min_age"),
    bookingInstructions: text("booking_instructions"),
    coverMediaId: uuid("cover_media_id"),
    status: serviceStatus("status").notNull().default("active"),
    sortOrder: integer("sort_order").notNull().default(0),
    archivedAt: ts("archived_at"),
    createdAt: createdAt(),
    updatedAt: updatedAt(),
  },
  (t) => [
    index().on(t.businessId, t.status),
    uniqueIndex("services_business_slug_uq").on(t.businessId, t.slug),
    check("services_duration_ck", sql`${t.durationMinutes} between 5 and 1440`),
    check("services_price_ck", sql`${t.priceCents} >= 0`),
    check("services_capacity_ck", sql`${t.capacity} >= 1 and ${t.minAttendees} >= 1 and ${t.minAttendees} <= ${t.capacity}`),
    check("services_buffers_ck", sql`${t.bufferBeforeMinutes} >= 0 and ${t.bufferAfterMinutes} >= 0`),
  ],
);

/** Generic modifiers: variants ("Length"), upgrades and add-ons are all option groups. */
export const serviceOptionGroups = pgTable(
  "service_option_groups",
  {
    id: id(),
    serviceId: uuid("service_id")
      .notNull()
      .references(() => services.id, { onDelete: "cascade" }),
    name: text("name").notNull(),
    description: text("description"),
    selection: optionSelection("selection").notNull().default("single"),
    required: boolean("required").notNull().default(false),
    maxSelect: integer("max_select"),
    sortOrder: integer("sort_order").notNull().default(0),
  },
  (t) => [index().on(t.serviceId)],
);

export const serviceOptions = pgTable(
  "service_options",
  {
    id: id(),
    groupId: uuid("group_id")
      .notNull()
      .references(() => serviceOptionGroups.id, { onDelete: "cascade" }),
    name: text("name").notNull(),
    description: text("description"),
    priceDeltaCents: integer("price_delta_cents").notNull().default(0),
    durationDeltaMinutes: integer("duration_delta_minutes").notNull().default(0),
    /** null = every staff member offering the service can perform this option. */
    eligibleMemberIds: uuid("eligible_member_ids").array(),
    isDefault: boolean("is_default").notNull().default(false),
    isActive: boolean("is_active").notNull().default(true),
    sortOrder: integer("sort_order").notNull().default(0),
  },
  (t) => [index().on(t.groupId)],
);

/** Which staff perform a service, optionally at a different price/duration (e.g. senior stylist). */
export const serviceStaff = pgTable(
  "service_staff",
  {
    serviceId: uuid("service_id")
      .notNull()
      .references(() => services.id, { onDelete: "cascade" }),
    memberId: uuid("member_id")
      .notNull()
      .references(() => businessMembers.id, { onDelete: "cascade" }),
    priceCentsOverride: integer("price_cents_override"),
    durationMinutesOverride: integer("duration_minutes_override"),
  },
  (t) => [primaryKey({ columns: [t.serviceId, t.memberId] }), index().on(t.memberId)],
);

export const serviceLocations = pgTable(
  "service_locations",
  {
    serviceId: uuid("service_id")
      .notNull()
      .references(() => services.id, { onDelete: "cascade" }),
    locationId: uuid("location_id")
      .notNull()
      .references(() => locations.id, { onDelete: "cascade" }),
  },
  (t) => [primaryKey({ columns: [t.serviceId, t.locationId] }), index().on(t.locationId)],
);

export const serviceResources = pgTable(
  "service_resources",
  {
    serviceId: uuid("service_id")
      .notNull()
      .references(() => services.id, { onDelete: "cascade" }),
    resourceId: uuid("resource_id")
      .notNull()
      .references(() => resources.id, { onDelete: "cascade" }),
  },
  (t) => [primaryKey({ columns: [t.serviceId, t.resourceId] })],
);

/* ───────────────────────────── Schedules ─────────────────────────── */

/**
 * Recurring weekly hours. `memberId` null + `locationId` set = location opening hours.
 * Minutes are local to the location (or business) time zone. Split shifts are
 * simply multiple rows for the same weekday; gaps between them are breaks.
 */
export const availabilityRules = pgTable(
  "availability_rules",
  {
    id: id(),
    businessId: uuid("business_id")
      .notNull()
      .references(() => businesses.id),
    memberId: uuid("member_id").references(() => businessMembers.id, { onDelete: "cascade" }),
    locationId: uuid("location_id").references(() => locations.id, { onDelete: "cascade" }),
    weekday: smallint("weekday").notNull(), // 1 = Monday … 7 = Sunday (ISO)
    startMinute: integer("start_minute").notNull(),
    endMinute: integer("end_minute").notNull(),
    createdAt: createdAt(),
  },
  (t) => [
    index().on(t.businessId, t.memberId),
    check("rules_weekday_ck", sql`${t.weekday} between 1 and 7`),
    check("rules_minutes_ck", sql`${t.startMinute} >= 0 and ${t.endMinute} <= 1440 and ${t.startMinute} < ${t.endMinute}`),
  ],
);

/** Replaces the weekly schedule for one local date. Empty intervals = closed/day off. */
export const scheduleOverrides = pgTable(
  "schedule_overrides",
  {
    id: id(),
    businessId: uuid("business_id")
      .notNull()
      .references(() => businesses.id),
    memberId: uuid("member_id").references(() => businessMembers.id, { onDelete: "cascade" }),
    locationId: uuid("location_id").references(() => locations.id, { onDelete: "cascade" }),
    date: date("date", { mode: "string" }).notNull(),
    intervals: jsonb("intervals").$type<{ start: number; end: number }[]>().notNull().default([]),
    note: text("note"),
    createdAt: createdAt(),
  },
  (t) => [
    uniqueIndex("overrides_scope_date_uq")
      .on(t.businessId, sql`coalesce(${t.memberId}, '00000000-0000-0000-0000-000000000000'::uuid)`, sql`coalesce(${t.locationId}, '00000000-0000-0000-0000-000000000000'::uuid)`, t.date),
  ],
);

/** Blocked time: breaks, vacations, sick days, holidays. `memberId` null = whole business. */
export const timeBlocks = pgTable(
  "time_blocks",
  {
    id: id(),
    businessId: uuid("business_id")
      .notNull()
      .references(() => businesses.id),
    memberId: uuid("member_id").references(() => businessMembers.id, { onDelete: "cascade" }),
    startsAt: ts("starts_at").notNull(),
    endsAt: ts("ends_at").notNull(),
    reason: blockReason("reason").notNull().default("other"),
    note: text("note"),
    createdByUserId: uuid("created_by_user_id").references(() => users.id),
    createdAt: createdAt(),
  },
  (t) => [
    index().on(t.businessId, t.startsAt),
    check("blocks_range_ck", sql`${t.startsAt} < ${t.endsAt}`),
  ],
);

/* ─────────────────────────── Customers (CRM) ─────────────────────── */

export const businessCustomers = pgTable(
  "business_customers",
  {
    id: id(),
    businessId: uuid("business_id")
      .notNull()
      .references(() => businesses.id),
    userId: uuid("user_id").references(() => users.id),
    name: text("name").notNull(),
    email: citext("email"),
    phone: text("phone"),
    tags: text("tags").array().notNull().default(sql`'{}'::text[]`),
    preferences: text("preferences"),
    marketingConsentAt: ts("marketing_consent_at"),
    // Aggregates maintained transactionally by booking lifecycle
    appointmentCount: integer("appointment_count").notNull().default(0),
    completedCount: integer("completed_count").notNull().default(0),
    cancelledCount: integer("cancelled_count").notNull().default(0),
    noShowCount: integer("no_show_count").notNull().default(0),
    totalSpentCents: integer("total_spent_cents").notNull().default(0),
    firstVisitAt: ts("first_visit_at"),
    lastVisitAt: ts("last_visit_at"),
    createdAt: createdAt(),
    updatedAt: updatedAt(),
  },
  (t) => [
    uniqueIndex("bcustomers_business_user_uq").on(t.businessId, t.userId).where(sql`${t.userId} is not null`),
    index().on(t.businessId, t.lastVisitAt),
  ],
);

/** Internal notes. Never exposed to customers. */
export const customerNotes = pgTable(
  "customer_notes",
  {
    id: id(),
    businessId: uuid("business_id")
      .notNull()
      .references(() => businesses.id),
    businessCustomerId: uuid("business_customer_id")
      .notNull()
      .references(() => businessCustomers.id),
    authorUserId: uuid("author_user_id")
      .notNull()
      .references(() => users.id),
    body: text("body").notNull(),
    deletedAt: ts("deleted_at"),
    createdAt: createdAt(),
  },
  (t) => [index().on(t.businessCustomerId)],
);

/* ────────────────────────── Promotions ───────────────────────────── */

export const promotions = pgTable(
  "promotions",
  {
    id: id(),
    businessId: uuid("business_id")
      .notNull()
      .references(() => businesses.id),
    code: citext("code").notNull(),
    name: text("name").notNull(),
    kind: promoKind("kind").notNull(),
    /** percent: basis points of subtotal (1000 = 10%); fixed: cents */
    value: integer("value").notNull(),
    minSubtotalCents: integer("min_subtotal_cents").notNull().default(0),
    serviceIds: uuid("service_ids").array(),
    newCustomersOnly: boolean("new_customers_only").notNull().default(false),
    startsAt: ts("starts_at"),
    endsAt: ts("ends_at"),
    maxRedemptions: integer("max_redemptions"),
    redemptionCount: integer("redemption_count").notNull().default(0),
    perCustomerLimit: integer("per_customer_limit").notNull().default(1),
    isActive: boolean("is_active").notNull().default(true),
    createdAt: createdAt(),
  },
  (t) => [uniqueIndex("promotions_business_code_uq").on(t.businessId, t.code)],
);

/* ─────────────────────────── Appointments ────────────────────────── */

/** Group sessions: one staff occupancy shared by several attendee appointments. */
export const groupSessions = pgTable(
  "group_sessions",
  {
    id: id(),
    businessId: uuid("business_id")
      .notNull()
      .references(() => businesses.id),
    serviceId: uuid("service_id")
      .notNull()
      .references(() => services.id),
    memberId: uuid("member_id")
      .notNull()
      .references(() => businessMembers.id),
    locationId: uuid("location_id").references(() => locations.id),
    startsAt: ts("starts_at").notNull(),
    endsAt: ts("ends_at").notNull(),
    capacity: integer("capacity").notNull(),
    bookedCount: integer("booked_count").notNull().default(0),
    createdAt: createdAt(),
  },
  (t) => [
    uniqueIndex("group_sessions_slot_uq").on(t.serviceId, t.memberId, t.startsAt),
    check("group_sessions_capacity_ck", sql`${t.bookedCount} >= 0 and ${t.bookedCount} <= ${t.capacity}`),
  ],
);

export type AppointmentSnapshot = {
  serviceName: string;
  durationMinutes: number;
  priceType: string;
  options: { groupName: string; name: string; priceDeltaCents: number; durationDeltaMinutes: number }[];
  memberName: string | null;
  locationName: string | null;
  locationKind: string | null;
  address: string | null;
  cancellationWindowHours: number;
  rescheduleWindowHours: number;
  depositRefundable: boolean;
  lateCancelFeePercent: number;
  noShowFeePercent: number;
  lines: { label: string; amountCents: number; kind: string }[];
};

export const appointments = pgTable(
  "appointments",
  {
    id: id(),
    /** Short human reference shown to customers, e.g. "K7Q-4M2". */
    reference: text("reference").notNull(),
    businessId: uuid("business_id")
      .notNull()
      .references(() => businesses.id),
    locationId: uuid("location_id").references(() => locations.id),
    serviceId: uuid("service_id")
      .notNull()
      .references(() => services.id),
    memberId: uuid("member_id").references(() => businessMembers.id),
    resourceId: uuid("resource_id").references(() => resources.id),
    groupSessionId: uuid("group_session_id").references(() => groupSessions.id),
    customerUserId: uuid("customer_user_id").references(() => users.id),
    businessCustomerId: uuid("business_customer_id")
      .notNull()
      .references(() => businessCustomers.id),
    status: appointmentStatus("status").notNull(),
    source: appointmentSource("source").notNull().default("marketplace"),
    startsAt: ts("starts_at").notNull(),
    endsAt: ts("ends_at").notNull(),
    /** Occupied range including prep/cleanup buffers. */
    blockStartsAt: ts("block_starts_at").notNull(),
    blockEndsAt: ts("block_ends_at").notNull(),
    timezone: text("timezone").notNull(),
    selectedOptionIds: uuid("selected_option_ids").array().notNull().default(sql`'{}'::uuid[]`),
    snapshot: jsonb("snapshot").$type<AppointmentSnapshot>().notNull(),
    intakeAnswers: jsonb("intake_answers").$type<{ fieldId: string; label: string; answer: unknown }[]>(),
    consentAcceptedAt: ts("consent_accepted_at"),
    customerNote: text("customer_note"),
    serviceAddress: text("service_address"),

    // Money (all server-computed by domain/pricing.ts)
    currency: text("currency").notNull(),
    subtotalCents: integer("subtotal_cents").notNull(),
    discountCents: integer("discount_cents").notNull().default(0),
    taxCents: integer("tax_cents").notNull().default(0),
    feeCents: integer("fee_cents").notNull().default(0),
    totalCents: integer("total_cents").notNull(),
    isEstimate: boolean("is_estimate").notNull().default(false),
    depositDueCents: integer("deposit_due_cents").notNull().default(0),
    amountPaidCents: integer("amount_paid_cents").notNull().default(0),
    amountRefundedCents: integer("amount_refunded_cents").notNull().default(0),
    tipCents: integer("tip_cents").notNull().default(0),
    paymentStatus: paymentStatus("payment_status").notNull(),
    promotionId: uuid("promotion_id").references(() => promotions.id),

    holdExpiresAt: ts("hold_expires_at"),
    idempotencyKey: text("idempotency_key"),
    rescheduledFromId: uuid("rescheduled_from_id"),
    rescheduleCount: integer("reschedule_count").notNull().default(0),
    cancelledAt: ts("cancelled_at"),
    cancelledBy: actorType("cancelled_by"),
    cancellationReason: text("cancellation_reason"),
    confirmedAt: ts("confirmed_at"),
    checkedInAt: ts("checked_in_at"),
    startedAt: ts("started_at"),
    completedAt: ts("completed_at"),
    noShowAt: ts("no_show_at"),
    /** Opaque token for future QR / front-desk check-in. */
    checkInCode: text("check_in_code").notNull(),
    createdByUserId: uuid("created_by_user_id").references(() => users.id),
    /** Optimistic concurrency guard for provider-side edits. */
    version: integer("version").notNull().default(1),
    createdAt: createdAt(),
    updatedAt: updatedAt(),
  },
  (t) => [
    uniqueIndex("appointments_reference_uq").on(t.reference),
    uniqueIndex("appointments_idempotency_uq")
      .on(t.customerUserId, t.idempotencyKey)
      .where(sql`${t.idempotencyKey} is not null`),
    index("appointments_business_time_idx").on(t.businessId, t.startsAt),
    index("appointments_member_time_idx").on(t.memberId, t.startsAt),
    index("appointments_customer_time_idx").on(t.customerUserId, t.startsAt),
    index().on(t.businessCustomerId),
    index("appointments_hold_idx").on(t.holdExpiresAt).where(sql`${t.status} = 'pending_payment'`),
    check("appointments_range_ck", sql`${t.startsAt} < ${t.endsAt} and ${t.blockStartsAt} <= ${t.startsAt} and ${t.blockEndsAt} >= ${t.endsAt}`),
    check("appointments_money_ck", sql`${t.totalCents} >= 0 and ${t.amountPaidCents} >= 0 and ${t.amountRefundedCents} >= 0 and ${t.tipCents} >= 0`),
  ],
);

/**
 * Time a staff member / resource is actually occupied. The exclusion
 * constraints on this table (see migration 0001) make overlapping
 * reservations physically impossible, regardless of application bugs or
 * concurrent requests. Rows are removed when an appointment is cancelled,
 * declined or expires; the appointment row itself is kept.
 */
export const occupancies = pgTable(
  "occupancies",
  {
    id: id(),
    businessId: uuid("business_id")
      .notNull()
      .references(() => businesses.id),
    memberId: uuid("member_id").references(() => businessMembers.id),
    resourceId: uuid("resource_id").references(() => resources.id),
    appointmentId: uuid("appointment_id").references(() => appointments.id),
    groupSessionId: uuid("group_session_id").references(() => groupSessions.id),
    startsAt: ts("starts_at").notNull(),
    endsAt: ts("ends_at").notNull(),
    createdAt: createdAt(),
  },
  (t) => [
    uniqueIndex("occupancies_appointment_uq").on(t.appointmentId).where(sql`${t.appointmentId} is not null`),
    uniqueIndex("occupancies_session_uq").on(t.groupSessionId).where(sql`${t.groupSessionId} is not null`),
    index().on(t.businessId, t.startsAt),
    check("occupancies_range_ck", sql`${t.startsAt} < ${t.endsAt}`),
  ],
);

/** Immutable history of appointment changes (status, time, staff). */
export const appointmentEvents = pgTable(
  "appointment_events",
  {
    id: bigserial("id", { mode: "number" }).primaryKey(),
    appointmentId: uuid("appointment_id")
      .notNull()
      .references(() => appointments.id),
    actorType: actorType("actor_type").notNull(),
    actorUserId: uuid("actor_user_id").references(() => users.id),
    type: text("type").notNull(),
    fromStatus: appointmentStatus("from_status"),
    toStatus: appointmentStatus("to_status"),
    data: jsonb("data").$type<Record<string, unknown>>(),
    createdAt: createdAt(),
  },
  (t) => [index().on(t.appointmentId, t.createdAt)],
);

export const promotionRedemptions = pgTable(
  "promotion_redemptions",
  {
    id: id(),
    promotionId: uuid("promotion_id")
      .notNull()
      .references(() => promotions.id),
    appointmentId: uuid("appointment_id")
      .notNull()
      .references(() => appointments.id),
    customerUserId: uuid("customer_user_id").references(() => users.id),
    discountCents: integer("discount_cents").notNull(),
    voidedAt: ts("voided_at"),
    createdAt: createdAt(),
  },
  (t) => [uniqueIndex("redemptions_appointment_uq").on(t.appointmentId), index().on(t.promotionId, t.customerUserId)],
);

/* ───────────────────────────── Payments ──────────────────────────── */

export const payments = pgTable(
  "payments",
  {
    id: id(),
    appointmentId: uuid("appointment_id")
      .notNull()
      .references(() => appointments.id),
    businessId: uuid("business_id")
      .notNull()
      .references(() => businesses.id),
    customerUserId: uuid("customer_user_id").references(() => users.id),
    kind: paymentKind("kind").notNull(),
    provider: paymentProvider("provider").notNull(),
    providerPaymentId: text("provider_payment_id"),
    method: text("method"),
    amountCents: integer("amount_cents").notNull(),
    applicationFeeCents: integer("application_fee_cents").notNull().default(0),
    currency: text("currency").notNull(),
    status: paymentRecordStatus("status").notNull(),
    failureMessage: text("failure_message"),
    recordedByUserId: uuid("recorded_by_user_id").references(() => users.id),
    succeededAt: ts("succeeded_at"),
    createdAt: createdAt(),
    updatedAt: updatedAt(),
  },
  (t) => [
    uniqueIndex("payments_provider_id_uq").on(t.providerPaymentId).where(sql`${t.providerPaymentId} is not null`),
    index().on(t.appointmentId),
    index().on(t.businessId, t.createdAt),
    check("payments_amount_ck", sql`${t.amountCents} > 0`),
  ],
);

export const refunds = pgTable(
  "refunds",
  {
    id: id(),
    paymentId: uuid("payment_id")
      .notNull()
      .references(() => payments.id),
    appointmentId: uuid("appointment_id")
      .notNull()
      .references(() => appointments.id),
    amountCents: integer("amount_cents").notNull(),
    reason: text("reason"),
    status: refundStatus("status").notNull(),
    providerRefundId: text("provider_refund_id"),
    createdByUserId: uuid("created_by_user_id").references(() => users.id),
    createdAt: createdAt(),
  },
  (t) => [
    uniqueIndex("refunds_provider_id_uq").on(t.providerRefundId).where(sql`${t.providerRefundId} is not null`),
    index().on(t.appointmentId),
    check("refunds_amount_ck", sql`${t.amountCents} > 0`),
  ],
);

/** Every inbound webhook, keyed by provider event id for idempotency. */
export const webhookEvents = pgTable("webhook_events", {
  id: text("id").primaryKey(),
  provider: text("provider").notNull(),
  type: text("type").notNull(),
  payload: jsonb("payload").notNull(),
  processedAt: ts("processed_at"),
  error: text("error"),
  attempts: integer("attempts").notNull().default(0),
  receivedAt: ts("received_at").notNull().defaultNow(),
});

/* ───────────────────────────── Reviews ───────────────────────────── */

export const reviews = pgTable(
  "reviews",
  {
    id: id(),
    appointmentId: uuid("appointment_id")
      .notNull()
      .references(() => appointments.id),
    businessId: uuid("business_id")
      .notNull()
      .references(() => businesses.id),
    memberId: uuid("member_id").references(() => businessMembers.id),
    serviceId: uuid("service_id").references(() => services.id),
    customerUserId: uuid("customer_user_id")
      .notNull()
      .references(() => users.id),
    rating: smallint("rating").notNull(),
    body: text("body"),
    status: reviewStatus("status").notNull().default("published"),
    responseBody: text("response_body"),
    respondedAt: ts("responded_at"),
    respondedByUserId: uuid("responded_by_user_id").references(() => users.id),
    createdAt: createdAt(),
    updatedAt: updatedAt(),
  },
  (t) => [
    uniqueIndex("reviews_appointment_uq").on(t.appointmentId),
    index().on(t.businessId, t.status, t.createdAt),
    check("reviews_rating_ck", sql`${t.rating} between 1 and 5`),
  ],
);

export const reports = pgTable(
  "reports",
  {
    id: id(),
    reporterUserId: uuid("reporter_user_id")
      .notNull()
      .references(() => users.id),
    targetType: text("target_type").notNull(), // review | business | message | media | user
    targetId: uuid("target_id").notNull(),
    reason: text("reason").notNull(),
    details: text("details"),
    status: reportStatus("status").notNull().default("open"),
    resolvedByUserId: uuid("resolved_by_user_id").references(() => users.id),
    resolution: text("resolution"),
    resolvedAt: ts("resolved_at"),
    createdAt: createdAt(),
  },
  (t) => [
    index().on(t.status, t.createdAt),
    uniqueIndex("reports_once_uq").on(t.reporterUserId, t.targetType, t.targetId),
  ],
);

/* ───────────────────────────── Engagement ────────────────────────── */

export const favorites = pgTable(
  "favorites",
  {
    userId: uuid("user_id")
      .notNull()
      .references(() => users.id, { onDelete: "cascade" }),
    businessId: uuid("business_id")
      .notNull()
      .references(() => businesses.id),
    createdAt: createdAt(),
  },
  (t) => [primaryKey({ columns: [t.userId, t.businessId] })],
);

export const recentViews = pgTable(
  "recent_views",
  {
    userId: uuid("user_id")
      .notNull()
      .references(() => users.id, { onDelete: "cascade" }),
    businessId: uuid("business_id")
      .notNull()
      .references(() => businesses.id),
    viewedAt: ts("viewed_at").notNull().defaultNow(),
  },
  (t) => [primaryKey({ columns: [t.userId, t.businessId] }), index().on(t.userId, t.viewedAt)],
);

export const waitlistEntries = pgTable(
  "waitlist_entries",
  {
    id: id(),
    businessId: uuid("business_id")
      .notNull()
      .references(() => businesses.id),
    serviceId: uuid("service_id")
      .notNull()
      .references(() => services.id),
    memberId: uuid("member_id").references(() => businessMembers.id),
    customerUserId: uuid("customer_user_id")
      .notNull()
      .references(() => users.id),
    date: date("date", { mode: "string" }).notNull(),
    earliestMinute: integer("earliest_minute").notNull().default(0),
    latestMinute: integer("latest_minute").notNull().default(1440),
    status: waitlistStatus("status").notNull().default("active"),
    notifiedAt: ts("notified_at"),
    createdAt: createdAt(),
  },
  (t) => [
    index().on(t.businessId, t.date, t.status),
    uniqueIndex("waitlist_once_uq")
      .on(t.customerUserId, t.serviceId, t.date)
      .where(sql`${t.status} in ('active','notified')`),
  ],
);

/* ───────────────────────────── Messaging ─────────────────────────── */

export const conversations = pgTable(
  "conversations",
  {
    id: id(),
    businessId: uuid("business_id")
      .notNull()
      .references(() => businesses.id),
    customerUserId: uuid("customer_user_id")
      .notNull()
      .references(() => users.id),
    lastMessageAt: ts("last_message_at").notNull().defaultNow(),
    lastMessagePreview: text("last_message_preview"),
    customerLastReadAt: ts("customer_last_read_at"),
    businessLastReadAt: ts("business_last_read_at"),
    createdAt: createdAt(),
  },
  (t) => [
    uniqueIndex("conversations_pair_uq").on(t.businessId, t.customerUserId),
    index().on(t.customerUserId, t.lastMessageAt),
    index().on(t.businessId, t.lastMessageAt),
  ],
);

export const messages = pgTable(
  "messages",
  {
    id: id(),
    conversationId: uuid("conversation_id")
      .notNull()
      .references(() => conversations.id),
    senderUserId: uuid("sender_user_id").references(() => users.id),
    senderRole: senderRole("sender_role").notNull(),
    body: text("body").notNull(),
    appointmentId: uuid("appointment_id").references(() => appointments.id),
    mediaId: uuid("media_id"),
    deletedAt: ts("deleted_at"),
    createdAt: createdAt(),
  },
  (t) => [index().on(t.conversationId, t.createdAt)],
);

/* ─────────────────────────── Notifications ───────────────────────── */

export const notifications = pgTable(
  "notifications",
  {
    id: id(),
    userId: uuid("user_id")
      .notNull()
      .references(() => users.id, { onDelete: "cascade" }),
    type: text("type").notNull(),
    title: text("title").notNull(),
    body: text("body"),
    href: text("href"),
    readAt: ts("read_at"),
    createdAt: createdAt(),
  },
  (t) => [index().on(t.userId, t.createdAt)],
);

/** Durable background work: emails, SMS, reminders, hold expiry, media processing. */
export const jobs = pgTable(
  "jobs",
  {
    id: bigserial("id", { mode: "number" }).primaryKey(),
    type: text("type").notNull(),
    payload: jsonb("payload").$type<Record<string, unknown>>().notNull(),
    runAt: ts("run_at").notNull().defaultNow(),
    status: jobStatus("status").notNull().default("pending"),
    attempts: integer("attempts").notNull().default(0),
    maxAttempts: integer("max_attempts").notNull().default(5),
    lockedAt: ts("locked_at"),
    lastError: text("last_error"),
    dedupeKey: text("dedupe_key"),
    createdAt: createdAt(),
    completedAt: ts("completed_at"),
  },
  (t) => [
    index("jobs_ready_idx").on(t.runAt).where(sql`${t.status} = 'pending'`),
    uniqueIndex("jobs_dedupe_uq").on(t.dedupeKey).where(sql`${t.dedupeKey} is not null`),
  ],
);

export const deliveryLog = pgTable(
  "delivery_log",
  {
    id: bigserial("id", { mode: "number" }).primaryKey(),
    channel: text("channel").notNull(), // email | sms
    template: text("template").notNull(),
    userId: uuid("user_id"),
    /** Redacted recipient (e.g. j***@example.com) — never the full address. */
    recipientHint: text("recipient_hint"),
    status: text("status").notNull(),
    providerMessageId: text("provider_message_id"),
    error: text("error"),
    createdAt: createdAt(),
  },
  (t) => [index().on(t.createdAt)],
);

/* ─────────────────────────────── Media ───────────────────────────── */

export type MediaVariants = Record<string, { key: string; width: number; height: number; mime: string }>;

export const media = pgTable(
  "media",
  {
    id: id(),
    ownerUserId: uuid("owner_user_id")
      .notNull()
      .references(() => users.id),
    businessId: uuid("business_id").references(() => businesses.id),
    kind: mediaKind("kind").notNull(),
    status: mediaStatus("status").notNull().default("processing"),
    originalKey: text("original_key").notNull(),
    mime: text("mime").notNull(),
    bytes: integer("bytes").notNull(),
    width: integer("width"),
    height: integer("height"),
    durationSeconds: doublePrecision("duration_seconds"),
    variants: jsonb("variants").$type<MediaVariants>().notNull().default({}),
    /** Tiny base64 placeholder for blur-up loading. */
    placeholder: text("placeholder"),
    alt: text("alt"),
    /** Private files (support, message, verification attachments) are only served to people allowed to see them. */
    visibility: text("visibility", { enum: ["public", "private"] }).notNull().default("public"),
    deletedAt: ts("deleted_at"),
    createdAt: createdAt(),
  },
  (t) => [index().on(t.businessId), index().on(t.ownerUserId), check("media_visibility_ck", sql`${t.visibility} in ('public', 'private')`)],
);

export const portfolioItems = pgTable(
  "portfolio_items",
  {
    id: id(),
    businessId: uuid("business_id")
      .notNull()
      .references(() => businesses.id),
    memberId: uuid("member_id").references(() => businessMembers.id),
    serviceId: uuid("service_id").references(() => services.id),
    kind: portfolioKind("kind").notNull(),
    mediaId: uuid("media_id")
      .notNull()
      .references(() => media.id),
    beforeMediaId: uuid("before_media_id").references(() => media.id),
    caption: text("caption"),
    isFeatured: boolean("is_featured").notNull().default(false),
    sortOrder: integer("sort_order").notNull().default(0),
    deletedAt: ts("deleted_at"),
    createdAt: createdAt(),
  },
  (t) => [index().on(t.businessId, t.createdAt), index().on(t.serviceId)],
);

/* ─────────────────────────── Trust & support ─────────────────────── */

export const verificationRequests = pgTable(
  "verification_requests",
  {
    id: id(),
    businessId: uuid("business_id")
      .notNull()
      .references(() => businesses.id),
    submittedByUserId: uuid("submitted_by_user_id")
      .notNull()
      .references(() => users.id),
    details: text("details"),
    documentMediaIds: uuid("document_media_ids").array().notNull().default(sql`'{}'::uuid[]`),
    status: verificationStatus("status").notNull().default("pending"),
    reviewedByUserId: uuid("reviewed_by_user_id").references(() => users.id),
    decisionNote: text("decision_note"),
    reviewedAt: ts("reviewed_at"),
    createdAt: createdAt(),
  },
  (t) => [index().on(t.status, t.createdAt), index().on(t.businessId)],
);

export const supportTickets = pgTable(
  "support_tickets",
  {
    id: id(),
    userId: uuid("user_id")
      .notNull()
      .references(() => users.id),
    businessId: uuid("business_id").references(() => businesses.id),
    appointmentId: uuid("appointment_id").references(() => appointments.id),
    category: text("category").notNull(),
    subject: text("subject").notNull(),
    status: ticketStatus("status").notNull().default("open"),
    lastActivityAt: ts("last_activity_at").notNull().defaultNow(),
    createdAt: createdAt(),
  },
  (t) => [index().on(t.userId, t.createdAt), index().on(t.status, t.lastActivityAt)],
);

export const supportMessages = pgTable(
  "support_messages",
  {
    id: id(),
    ticketId: uuid("ticket_id")
      .notNull()
      .references(() => supportTickets.id),
    authorUserId: uuid("author_user_id")
      .notNull()
      .references(() => users.id),
    isStaff: boolean("is_staff").notNull().default(false),
    body: text("body").notNull(),
    mediaIds: uuid("media_ids").array().notNull().default(sql`'{}'::uuid[]`),
    createdAt: createdAt(),
  },
  (t) => [index().on(t.ticketId, t.createdAt)],
);

export const auditLogs = pgTable(
  "audit_logs",
  {
    id: bigserial("id", { mode: "number" }).primaryKey(),
    actorUserId: uuid("actor_user_id").references(() => users.id),
    actorType: actorType("actor_type").notNull(),
    businessId: uuid("business_id").references(() => businesses.id),
    action: text("action").notNull(),
    targetType: text("target_type"),
    targetId: text("target_id"),
    metadata: jsonb("metadata").$type<Record<string, unknown>>(),
    ipHash: text("ip_hash"),
    createdAt: createdAt(),
  },
  (t) => [index().on(t.businessId, t.createdAt), index().on(t.actorUserId, t.createdAt), index().on(t.createdAt)],
);

/** Fixed-window counters for rate limiting without extra infrastructure. */
export const rateLimits = pgTable(
  "rate_limits",
  {
    key: text("key").notNull(),
    windowStart: ts("window_start").notNull(),
    count: integer("count").notNull().default(0),
  },
  (t) => [primaryKey({ columns: [t.key, t.windowStart] })],
);

/* ───────────────────────────── Spotlight ─────────────────────────── */

export const promotionStatus = pgEnum("spotlight_status", ["active", "paused", "ended"]);

/**
 * Promoted placement in search ("Spotlight"). Always labelled "Promoted" to
 * customers. Free during launch (priceCents = 0); the billing fields exist so
 * paid campaigns can be enabled without a schema change.
 */
export const spotlightCampaigns = pgTable(
  "spotlight_campaigns",
  {
    id: id(),
    businessId: uuid("business_id")
      .notNull()
      .references(() => businesses.id),
    /** null = shown for any search the business matches */
    categoryId: uuid("category_id").references(() => categories.id),
    status: promotionStatus("status").notNull().default("active"),
    startsAt: ts("starts_at").notNull().defaultNow(),
    endsAt: ts("ends_at").notNull(),
    priceCents: integer("price_cents").notNull().default(0),
    currency: text("currency").notNull().default("USD"),
    impressions: integer("impressions").notNull().default(0),
    clicks: integer("clicks").notNull().default(0),
    createdByUserId: uuid("created_by_user_id").references(() => users.id),
    createdAt: createdAt(),
  },
  (t) => [
    index("spotlight_active_idx").on(t.status, t.endsAt),
    uniqueIndex("spotlight_one_active_uq").on(t.businessId).where(sql`${t.status} = 'active'`),
  ],
);
