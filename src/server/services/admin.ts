import "server-only";
import { and, asc, desc, eq, gt, ilike, inArray, isNotNull, isNull, lt, ne, or, sql, type SQL } from "drizzle-orm";
import { alias } from "drizzle-orm/pg-core";
import { z } from "zod";
import { canTransition, type AppointmentStatus } from "@/domain/appointment-state";
import { AppError, notFound } from "@/domain/errors";
import { formatMoney } from "@/domain/money";
import { PLANS, type PlanTier } from "@/domain/plans";
import { db } from "../db/client";
import { isUniqueViolation } from "../db/errors";
import {
  appointmentEvents,
  appointments,
  auditLogs,
  businessCustomers,
  businessMembers,
  businesses,
  categories,
  jobs,
  locations,
  media,
  messages,
  payments,
  refunds,
  reports,
  reviews,
  services,
  sessions,
  spotlightCampaigns,
  users,
  verificationRequests,
  webhookEvents,
} from "../db/schema";
import { destroyAllSessions, type Viewer } from "../auth/session";
import { requireAdmin } from "../authz";
import { audit } from "../audit";
import { notify } from "../notify";
import { getMediaMap } from "./media";

/* ───────────────────────────── Shared ────────────────────────────── */

export const ADMIN_PAGE_SIZE = 25;
export const ADMIN_MAX_PAGE_SIZE = 50;

export type Paged<T> = { items: T[]; page: number; pageSize: number; hasMore: boolean };

function paging(page: number | undefined, size = ADMIN_PAGE_SIZE) {
  const pageSize = Math.min(Math.max(1, size), ADMIN_MAX_PAGE_SIZE);
  const p = Number.isFinite(page) && page! >= 1 ? Math.min(Math.floor(page!), 10_000) : 1;
  return { page: p, pageSize, limit: pageSize + 1, offset: (p - 1) * pageSize };
}

function paged<T>(rows: T[], p: ReturnType<typeof paging>): Paged<T> {
  return { items: rows.slice(0, p.pageSize), page: p.page, pageSize: p.pageSize, hasMore: rows.length > p.pageSize };
}

/** `%term%` with LIKE wildcards in user input escaped. */
function likeTerm(q: string) {
  return `%${q.replace(/[\\%_]/g, (c) => `\\${c}`)}%`;
}

const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
export const isUuid = (s: string | null | undefined): s is string => Boolean(s && UUID_RE.test(s));

const zReason = z.string().trim().min(3, "Add a short reason (at least 3 characters)").max(500, "Keep it under 500 characters");
const zNote = z
  .string()
  .trim()
  .max(1000, "Keep it under 1,000 characters")
  .optional()
  .nullable()
  .transform((v) => (v ? v : null));

const one = async <T>(p: Promise<T[]>) => (await p)[0];

/* ───────────────────────────── Overview ──────────────────────────── */

export type AdminOverview = {
  usersTotal: number;
  usersNew7d: number;
  businessesActive: number;
  businessesNew7d: number;
  bookingsToday: number;
  bookings7d: number;
  completed30d: number;
  openReports: number;
  pendingVerifications: number;
  openTickets: number;
  failedJobs: number;
  webhookErrors: number;
  gmv30d: { currency: string; cents: number; count: number }[];
};

/** One round-trip of scalar aggregates; every number is computed in Postgres. */
export async function adminOverview(): Promise<AdminOverview> {
  const [row] = await db.execute<Omit<AdminOverview, "gmv30d">>(sql`
    select
      (select count(*) from users where status <> 'deleted')::int as "usersTotal",
      (select count(*) from users where status <> 'deleted' and created_at >= now() - interval '7 days')::int as "usersNew7d",
      (select count(*) from businesses where status = 'active')::int as "businessesActive",
      (select count(*) from businesses where created_at >= now() - interval '7 days')::int as "businessesNew7d",
      (select count(*) from appointments where created_at >= date_trunc('day', now()) and status not in ('pending_payment', 'expired'))::int as "bookingsToday",
      (select count(*) from appointments where created_at >= now() - interval '7 days' and status not in ('pending_payment', 'expired'))::int as "bookings7d",
      (select count(*) from appointments where status = 'completed' and completed_at >= now() - interval '30 days')::int as "completed30d",
      (select count(*) from reports where status = 'open')::int as "openReports",
      (select count(*) from verification_requests where status = 'pending')::int as "pendingVerifications",
      (select count(*) from support_tickets where status = 'open')::int as "openTickets",
      (select count(*) from jobs where status = 'failed')::int as "failedJobs",
      (select count(*) from webhook_events where processed_at is null and error is not null)::int as "webhookErrors"
  `);
  const gmv = await db
    .select({
      currency: payments.currency,
      cents: sql<number>`coalesce(sum(${payments.amountCents}), 0)::float8`,
      count: sql<number>`count(*)::int`,
    })
    .from(payments)
    .where(and(eq(payments.status, "succeeded"), eq(payments.provider, "stripe"), gt(payments.succeededAt, sql`now() - interval '30 days'`)))
    .groupBy(payments.currency)
    .orderBy(desc(sql`2`));
  return { ...row, gmv30d: gmv.map((g) => ({ currency: g.currency, cents: Number(g.cents), count: g.count })) };
}

/** Badge counts for the sidebar. */
export async function adminQueueCounts() {
  const [row] = await db.execute<{ reports: number; verifications: number; tickets: number; jobs: number }>(sql`
    select
      (select count(*) from reports where status = 'open')::int as reports,
      (select count(*) from verification_requests where status = 'pending')::int as verifications,
      (select count(*) from support_tickets where status = 'open')::int as tickets,
      (select count(*) from jobs where status = 'failed')::int as jobs
  `);
  return row;
}

/* ────────────────────────────── Users ────────────────────────────── */

export const USER_ROLES = ["user", "support", "admin"] as const;
export const USER_STATUSES = ["active", "suspended", "deleted"] as const;

export async function listUsers(f: { q?: string; role?: string; status?: string; page?: number }) {
  const p = paging(f.page);
  const conds: SQL[] = [];
  const q = f.q?.trim();
  if (q) {
    const term = likeTerm(q);
    conds.push(isUuid(q) ? eq(users.id, q) : or(ilike(users.name, term), ilike(sql`${users.email}::text`, term))!);
  }
  if (f.role && (USER_ROLES as readonly string[]).includes(f.role)) conds.push(eq(users.platformRole, f.role as (typeof USER_ROLES)[number]));
  if (f.status && (USER_STATUSES as readonly string[]).includes(f.status)) conds.push(eq(users.status, f.status as (typeof USER_STATUSES)[number]));
  const rows = await db
    .select({
      id: users.id,
      name: users.name,
      email: users.email,
      emailVerifiedAt: users.emailVerifiedAt,
      platformRole: users.platformRole,
      status: users.status,
      createdAt: users.createdAt,
      lastLoginAt: users.lastLoginAt,
      // Explicitly qualified: drizzle renders bare column names for single-table selects.
      businesses: sql<number>`(select count(*) from business_members bm where bm.user_id = "users"."id" and bm.status = 'active')::int`,
    })
    .from(users)
    .where(conds.length ? and(...conds) : undefined)
    .orderBy(desc(users.createdAt), desc(users.id))
    .limit(p.limit)
    .offset(p.offset);
  return paged(rows, p);
}

export async function getUserDetail(id: string) {
  if (!isUuid(id)) return null;
  const user = await one(
    db
      .select({
        id: users.id,
        name: users.name,
        email: users.email,
        emailVerifiedAt: users.emailVerifiedAt,
        phone: users.phone,
        phoneVerifiedAt: users.phoneVerifiedAt,
        platformRole: users.platformRole,
        status: users.status,
        timezone: users.timezone,
        lastLoginAt: users.lastLoginAt,
        deletedAt: users.deletedAt,
        createdAt: users.createdAt,
        hasPassword: sql<boolean>`${users.passwordHash} is not null`,
      })
      .from(users)
      .where(eq(users.id, id)),
  );
  if (!user) return null;
  const [memberships, recent, sessionStats, counts, history] = await Promise.all([
    db
      .select({
        memberId: businessMembers.id,
        role: businessMembers.role,
        status: businessMembers.status,
        businessId: businesses.id,
        businessName: businesses.name,
        businessSlug: businesses.slug,
        businessStatus: businesses.status,
        isOwner: sql<boolean>`${businesses.ownerUserId} = ${id}`,
      })
      .from(businessMembers)
      .innerJoin(businesses, eq(businesses.id, businessMembers.businessId))
      .where(eq(businessMembers.userId, id))
      .orderBy(asc(businessMembers.createdAt))
      .limit(50),
    db
      .select({
        id: appointments.id,
        reference: appointments.reference,
        status: appointments.status,
        startsAt: appointments.startsAt,
        timezone: appointments.timezone,
        totalCents: appointments.totalCents,
        currency: appointments.currency,
        serviceName: sql<string>`${appointments.snapshot}->>'serviceName'`,
        businessName: businesses.name,
      })
      .from(appointments)
      .innerJoin(businesses, eq(businesses.id, appointments.businessId))
      .where(eq(appointments.customerUserId, id))
      .orderBy(desc(appointments.startsAt))
      .limit(10),
    one(
      db
        .select({ active: sql<number>`count(*)::int`, lastSeenAt: sql<Date | null>`max(${sessions.lastSeenAt})`.mapWith(sessions.lastSeenAt) })
        .from(sessions)
        .where(and(eq(sessions.userId, id), gt(sessions.expiresAt, sql`now()`))),
    ),
    db.execute<{ appointments: number; completed: number; cancelled: number; reviews: number; reportsFiled: number; reportsAgainst: number }>(sql`
      select
        (select count(*) from appointments where customer_user_id = ${id})::int as appointments,
        (select count(*) from appointments where customer_user_id = ${id} and status = 'completed')::int as completed,
        (select count(*) from appointments where customer_user_id = ${id} and status = 'cancelled' and cancelled_by = 'customer')::int as cancelled,
        (select count(*) from reviews where customer_user_id = ${id})::int as reviews,
        (select count(*) from reports where reporter_user_id = ${id})::int as "reportsFiled",
        (select count(*) from reports where target_type = 'user' and target_id = ${id})::int as "reportsAgainst"
    `),
    adminHistory("user", id),
  ]);
  return { user, memberships, recent, sessions: sessionStats ?? { active: 0, lastSeenAt: null }, counts: [...counts][0], history };
}

export const userStatusSchema = z.object({ status: z.enum(["active", "suspended"]), reason: zReason });
export const userRoleSchema = z.object({ role: z.enum(USER_ROLES), reason: zReason });

/** Suspending signs the user out everywhere; their sessions are rejected immediately. */
export async function setUserStatus(actor: Viewer, userId: string, input: z.infer<typeof userStatusSchema>) {
  requireAdmin(actor);
  if (userId === actor.id) throw new AppError("conflict", "You can't change the status of your own account.");
  const result = await db.transaction(async (tx) => {
    const [u] = await tx.select({ id: users.id, status: users.status, email: users.email }).from(users).where(eq(users.id, userId)).for("update");
    if (!u) throw notFound("That user");
    if (u.status === "deleted") throw new AppError("conflict", "This account has been deleted and can't be changed.");
    if (u.status === input.status) throw new AppError("conflict", input.status === "suspended" ? "This account is already suspended." : "This account is already active.");
    await tx.update(users).set({ status: input.status }).where(eq(users.id, userId));
    await audit(
      { actorUserId: actor.id, actorType: "admin", action: input.status === "suspended" ? "admin.user.suspended" : "admin.user.reactivated", targetType: "user", targetId: userId, metadata: { from: u.status, to: input.status, reason: input.reason } },
      tx,
    );
    return { status: input.status };
  });
  if (input.status === "suspended") await destroyAllSessions(userId);
  return result;
}

export async function setUserRole(actor: Viewer, userId: string, input: z.infer<typeof userRoleSchema>) {
  requireAdmin(actor);
  if (userId === actor.id) throw new AppError("conflict", "You can't change your own platform role. Ask another admin.");
  return db.transaction(async (tx) => {
    const [u] = await tx.select({ id: users.id, role: users.platformRole, status: users.status }).from(users).where(eq(users.id, userId)).for("update");
    if (!u) throw notFound("That user");
    if (u.status === "deleted") throw new AppError("conflict", "This account has been deleted and can't be changed.");
    if (u.role === input.role) throw new AppError("conflict", "That's already this user's role.");
    await tx.update(users).set({ platformRole: input.role }).where(eq(users.id, userId));
    await audit({ actorUserId: actor.id, actorType: "admin", action: "admin.user.role_changed", targetType: "user", targetId: userId, metadata: { from: u.role, to: input.role, reason: input.reason } }, tx);
    return { role: input.role };
  });
}

/* ──────────────────────────── Businesses ─────────────────────────── */

export const BUSINESS_STATUSES = ["draft", "active", "suspended", "closed"] as const;
export const VERIFICATION_STATUSES = ["not_submitted", "pending", "verified", "rejected", "needs_info"] as const;
export const PLAN_TIERS = Object.keys(PLANS) as PlanTier[];

export async function listBusinesses(f: { q?: string; status?: string; verification?: string; plan?: string; page?: number }) {
  const p = paging(f.page);
  const conds: SQL[] = [];
  const q = f.q?.trim();
  if (q) {
    const term = likeTerm(q);
    conds.push(isUuid(q) ? eq(businesses.id, q) : or(ilike(businesses.name, term), ilike(sql`${businesses.slug}::text`, term), ilike(sql`${users.email}::text`, term))!);
  }
  if (f.status && (BUSINESS_STATUSES as readonly string[]).includes(f.status)) conds.push(eq(businesses.status, f.status as (typeof BUSINESS_STATUSES)[number]));
  if (f.verification && (VERIFICATION_STATUSES as readonly string[]).includes(f.verification))
    conds.push(eq(businesses.verificationStatus, f.verification as (typeof VERIFICATION_STATUSES)[number]));
  if (f.plan && (PLAN_TIERS as string[]).includes(f.plan)) conds.push(eq(businesses.plan, f.plan as PlanTier));
  const rows = await db
    .select({
      id: businesses.id,
      name: businesses.name,
      slug: businesses.slug,
      kind: businesses.kind,
      status: businesses.status,
      verificationStatus: businesses.verificationStatus,
      plan: businesses.plan,
      city: businesses.city,
      ratingAvg: businesses.ratingAvg,
      ratingCount: businesses.ratingCount,
      createdAt: businesses.createdAt,
      ownerId: users.id,
      ownerName: users.name,
      ownerEmail: users.email,
    })
    .from(businesses)
    .innerJoin(users, eq(users.id, businesses.ownerUserId))
    .where(conds.length ? and(...conds) : undefined)
    .orderBy(desc(businesses.createdAt), desc(businesses.id))
    .limit(p.limit)
    .offset(p.offset);
  return paged(rows, p);
}

export async function getBusinessDetail(id: string) {
  if (!isUuid(id)) return null;
  const owner = alias(users, "owner");
  const biz = await one(
    db
      .select({
        b: businesses,
        ownerName: owner.name,
        ownerEmail: owner.email,
        ownerStatus: owner.status,
        categoryName: categories.name,
      })
      .from(businesses)
      .innerJoin(owner, eq(owner.id, businesses.ownerUserId))
      .leftJoin(categories, eq(categories.id, businesses.primaryCategoryId))
      .where(eq(businesses.id, id)),
  );
  if (!biz) return null;
  const [team, serviceCounts, locs, recent, verifications, campaigns, stats, history] = await Promise.all([
    db
      .select({
        id: businessMembers.id,
        displayName: businessMembers.displayName,
        role: businessMembers.role,
        status: businessMembers.status,
        isBookable: businessMembers.isBookable,
        userId: users.id,
        email: sql<string | null>`coalesce(${users.email}::text, ${businessMembers.inviteEmail}::text)`,
      })
      .from(businessMembers)
      .leftJoin(users, eq(users.id, businessMembers.userId))
      .where(eq(businessMembers.businessId, id))
      .orderBy(asc(businessMembers.sortOrder), asc(businessMembers.createdAt))
      .limit(50),
    db
      .select({ status: services.status, n: sql<number>`count(*)::int` })
      .from(services)
      .where(eq(services.businessId, id))
      .groupBy(services.status),
    db
      .select({ id: locations.id, name: locations.name, kind: locations.kind, city: locations.city, region: locations.region, isActive: locations.isActive, isPrimary: locations.isPrimary })
      .from(locations)
      .where(eq(locations.businessId, id))
      .orderBy(desc(locations.isPrimary), asc(locations.createdAt))
      .limit(20),
    db
      .select({
        id: appointments.id,
        reference: appointments.reference,
        status: appointments.status,
        startsAt: appointments.startsAt,
        timezone: appointments.timezone,
        totalCents: appointments.totalCents,
        currency: appointments.currency,
        serviceName: sql<string>`${appointments.snapshot}->>'serviceName'`,
        customerName: businessCustomers.name,
      })
      .from(appointments)
      .innerJoin(businessCustomers, eq(businessCustomers.id, appointments.businessCustomerId))
      .where(eq(appointments.businessId, id))
      .orderBy(desc(appointments.startsAt))
      .limit(10),
    db
      .select({
        id: verificationRequests.id,
        status: verificationRequests.status,
        details: verificationRequests.details,
        decisionNote: verificationRequests.decisionNote,
        createdAt: verificationRequests.createdAt,
        reviewedAt: verificationRequests.reviewedAt,
        documents: sql<number>`cardinality(${verificationRequests.documentMediaIds})::int`,
      })
      .from(verificationRequests)
      .where(eq(verificationRequests.businessId, id))
      .orderBy(desc(verificationRequests.createdAt))
      .limit(5),
    db
      .select({
        id: spotlightCampaigns.id,
        status: spotlightCampaigns.status,
        startsAt: spotlightCampaigns.startsAt,
        endsAt: spotlightCampaigns.endsAt,
        impressions: spotlightCampaigns.impressions,
        clicks: spotlightCampaigns.clicks,
        categoryName: categories.name,
        live: sql<boolean>`${spotlightCampaigns.status} <> 'ended' and ${spotlightCampaigns.endsAt} > now()`,
      })
      .from(spotlightCampaigns)
      .leftJoin(categories, eq(categories.id, spotlightCampaigns.categoryId))
      .where(eq(spotlightCampaigns.businessId, id))
      .orderBy(desc(spotlightCampaigns.createdAt))
      .limit(10),
    db.execute<{ appointments: number; completed30d: number; upcoming: number; reviewsPublished: number; reviewsHidden: number; openReports: number }>(sql`
      select
        (select count(*) from appointments where business_id = ${id})::int as appointments,
        (select count(*) from appointments where business_id = ${id} and status = 'completed' and completed_at >= now() - interval '30 days')::int as "completed30d",
        (select count(*) from appointments where business_id = ${id} and status in ('requested', 'confirmed', 'checked_in') and starts_at > now())::int as upcoming,
        (select count(*) from reviews where business_id = ${id} and status = 'published')::int as "reviewsPublished",
        (select count(*) from reviews where business_id = ${id} and status <> 'published')::int as "reviewsHidden",
        (select count(*) from reports where status = 'open' and target_type = 'business' and target_id = ${id})::int as "openReports"
    `),
    adminHistory("business", id),
  ]);
  return {
    business: biz.b,
    owner: { id: biz.b.ownerUserId, name: biz.ownerName, email: biz.ownerEmail, status: biz.ownerStatus },
    categoryName: biz.categoryName,
    team,
    services: Object.fromEntries(serviceCounts.map((s) => [s.status, s.n])) as Partial<Record<"active" | "hidden" | "archived", number>>,
    locations: locs,
    recent,
    verifications,
    campaigns,
    stats: [...stats][0],
    history,
  };
}

export const businessStatusSchema = z.object({ action: z.enum(["suspend", "unsuspend"]), reason: zReason });
export const businessPlanSchema = z.object({ plan: z.enum(["free", "pro", "business"]), reason: zReason });
export const verificationDecisionSchema = z.object({
  status: z.enum(["verified", "rejected", "needs_info"]),
  note: zNote,
});
export const businessVerificationSchema = z.object({
  status: z.enum(["verified", "rejected", "needs_info", "not_submitted"]),
  note: zNote,
});

export async function setBusinessStatus(actor: Viewer, businessId: string, input: z.infer<typeof businessStatusSchema>) {
  requireAdmin(actor);
  const { refreshSearchIndex } = await import("./business");
  return db.transaction(async (tx) => {
    const [b] = await tx
      .select({ id: businesses.id, name: businesses.name, status: businesses.status, publishedAt: businesses.publishedAt, ownerUserId: businesses.ownerUserId })
      .from(businesses)
      .where(eq(businesses.id, businessId))
      .for("update");
    if (!b) throw notFound("That business");
    let next: (typeof BUSINESS_STATUSES)[number];
    if (input.action === "suspend") {
      if (b.status === "suspended") throw new AppError("conflict", "This business is already suspended.");
      if (b.status === "closed") throw new AppError("conflict", "This business is closed and can't be suspended.");
      next = "suspended";
    } else {
      if (b.status !== "suspended") throw new AppError("conflict", "This business isn't suspended.");
      // Restore to where it was: live if it had been published, otherwise back to draft.
      next = b.publishedAt ? "active" : "draft";
    }
    await tx.update(businesses).set({ status: next }).where(eq(businesses.id, businessId));
    await refreshSearchIndex(businessId, tx);
    await audit(
      {
        actorUserId: actor.id,
        actorType: "admin",
        businessId,
        action: input.action === "suspend" ? "admin.business.suspended" : "admin.business.unsuspended",
        targetType: "business",
        targetId: businessId,
        metadata: { from: b.status, to: next, reason: input.reason },
      },
      tx,
    );
    if (input.action === "suspend") {
      await notify(
        b.ownerUserId,
        {
          topic: "business",
          type: "business.suspended",
          title: `${b.name} has been suspended`,
          body: `Your profile is hidden and new bookings are paused. Reason: ${input.reason}`,
          href: "/support",
          email: {
            subject: `${b.name} has been suspended on Kept`,
            heading: "Your business has been suspended",
            paragraphs: [
              `We've suspended ${b.name}. Your profile is hidden from search and customers can't book new appointments.`,
              `Reason: ${input.reason}`,
              "If you think this is a mistake, reply through Help & support and our team will review it.",
            ],
            cta: { label: "Contact support", url: "/support" },
          },
        },
        tx,
      );
    } else {
      await notify(
        b.ownerUserId,
        {
          topic: "business",
          type: "business.reinstated",
          title: `${b.name} has been reinstated`,
          body: next === "active" ? "Your profile is visible again and customers can book." : "Your business is back in draft. Publish it when you're ready.",
          href: "/pro",
          email: {
            subject: `${b.name} has been reinstated on Kept`,
            heading: "Your business has been reinstated",
            paragraphs: [next === "active" ? "Your profile is visible again and customers can book you." : "Your business is back in draft. Publish it whenever you're ready."],
            cta: { label: "Open your dashboard", url: "/pro" },
          },
        },
        tx,
      );
    }
    return { status: next };
  });
}

export async function setBusinessPlan(actor: Viewer, businessId: string, input: z.infer<typeof businessPlanSchema>) {
  requireAdmin(actor);
  return db.transaction(async (tx) => {
    const [b] = await tx.select({ plan: businesses.plan }).from(businesses).where(eq(businesses.id, businessId)).for("update");
    if (!b) throw notFound("That business");
    if (b.plan === input.plan) throw new AppError("conflict", `This business is already on the ${PLANS[input.plan].label} plan.`);
    await tx.update(businesses).set({ plan: input.plan }).where(eq(businesses.id, businessId));
    await audit(
      { actorUserId: actor.id, actorType: "admin", businessId, action: "admin.business.plan_changed", targetType: "business", targetId: businessId, metadata: { from: b.plan, to: input.plan, reason: input.reason } },
      tx,
    );
    return { plan: input.plan };
  });
}

type Tx = Parameters<Parameters<typeof db.transaction>[0]>[0];

async function notifyVerificationDecision(tx: Tx, b: { ownerUserId: string; name: string }, status: "verified" | "rejected" | "needs_info" | "not_submitted", note: string | null) {
  if (status === "not_submitted") return;
  const copy = {
    verified: {
      title: `${b.name} is verified`,
      body: "A verified badge now appears on your profile.",
      heading: "You're verified",
      paragraphs: [`Good news — ${b.name} is now verified. Customers will see a verified badge on your profile.`],
    },
    rejected: {
      title: "Verification wasn't approved",
      body: note ?? "We couldn't verify your business with the information provided.",
      heading: "We couldn't verify your business",
      paragraphs: [`We weren't able to verify ${b.name} with the information provided.`],
    },
    needs_info: {
      title: "We need a bit more information",
      body: note ?? "Please add more detail to your verification request.",
      heading: "A little more information, please",
      paragraphs: [`To finish verifying ${b.name}, we need a bit more information from you.`],
    },
  }[status];
  await notify(
    b.ownerUserId,
    {
      topic: "business",
      type: `verification.${status}`,
      title: copy.title,
      body: copy.body,
      href: "/pro/settings/verification",
      email: {
        subject: copy.title,
        heading: copy.heading,
        paragraphs: [...copy.paragraphs, ...(note ? [`Note from our team: ${note}`] : [])],
        cta: { label: status === "verified" ? "Open your dashboard" : "Update your verification", url: status === "verified" ? "/pro" : "/pro/settings/verification" },
      },
    },
    tx,
  );
}

/**
 * Decides a verification request: updates the request and the business's
 * verification status together, then tells the owner.
 */
export async function decideVerification(actor: Viewer, requestId: string, input: z.infer<typeof verificationDecisionSchema>) {
  requireAdmin(actor);
  if (input.status !== "verified" && !input.note) throw new AppError("validation", "Add a note so the business knows what to do next.", { fields: { note: "Required for this decision" } });
  return db.transaction(async (tx) => {
    const [r] = await tx.select().from(verificationRequests).where(eq(verificationRequests.id, requestId)).for("update");
    if (!r) throw notFound("That verification request");
    if (r.status !== "pending" && r.status !== "needs_info") throw new AppError("conflict", "This request has already been decided.");
    const [b] = await tx.select({ id: businesses.id, name: businesses.name, ownerUserId: businesses.ownerUserId, status: businesses.verificationStatus }).from(businesses).where(eq(businesses.id, r.businessId)).for("update");
    await tx
      .update(verificationRequests)
      .set({ status: input.status, decisionNote: input.note, reviewedByUserId: actor.id, reviewedAt: new Date() })
      .where(eq(verificationRequests.id, requestId));
    await tx.update(businesses).set({ verificationStatus: input.status }).where(eq(businesses.id, r.businessId));
    await audit(
      {
        actorUserId: actor.id,
        actorType: "admin",
        businessId: r.businessId,
        action: `admin.verification.${input.status}`,
        targetType: "verification_request",
        targetId: requestId,
        metadata: { from: b.status, to: input.status, note: input.note },
      },
      tx,
    );
    await notifyVerificationDecision(tx, b, input.status, input.note);
    return { status: input.status };
  });
}

/** Sets a business's verification status directly (e.g. revoking a badge); also closes any open request. */
export async function setBusinessVerification(actor: Viewer, businessId: string, input: z.infer<typeof businessVerificationSchema>) {
  requireAdmin(actor);
  if ((input.status === "rejected" || input.status === "needs_info") && !input.note)
    throw new AppError("validation", "Add a note so the business knows what to do next.", { fields: { note: "Required for this decision" } });
  return db.transaction(async (tx) => {
    const [b] = await tx.select({ id: businesses.id, name: businesses.name, ownerUserId: businesses.ownerUserId, status: businesses.verificationStatus }).from(businesses).where(eq(businesses.id, businessId)).for("update");
    if (!b) throw notFound("That business");
    if (b.status === input.status) throw new AppError("conflict", "That's already the verification status.");
    await tx.update(businesses).set({ verificationStatus: input.status }).where(eq(businesses.id, businessId));
    let requestId: string | null = null;
    if (input.status !== "not_submitted") {
      const [open] = await tx
        .update(verificationRequests)
        .set({ status: input.status, decisionNote: input.note, reviewedByUserId: actor.id, reviewedAt: new Date() })
        .where(and(eq(verificationRequests.businessId, businessId), inArray(verificationRequests.status, ["pending", "needs_info"])))
        .returning({ id: verificationRequests.id });
      requestId = open?.id ?? null;
    }
    await audit(
      {
        actorUserId: actor.id,
        actorType: "admin",
        businessId,
        action: `admin.verification.${input.status}`,
        targetType: "business",
        targetId: businessId,
        metadata: { from: b.status, to: input.status, note: input.note, requestId },
      },
      tx,
    );
    await notifyVerificationDecision(tx, b, input.status, input.note);
    return { status: input.status };
  });
}

/* ─────────────────────────── Verifications ───────────────────────── */

export const VERIFICATION_QUEUE_TABS = ["pending", "needs_info", "verified", "rejected", "all"] as const;

export async function listVerificationRequests(f: { status?: string; page?: number }) {
  const p = paging(f.page);
  const status = (VERIFICATION_QUEUE_TABS as readonly string[]).includes(f.status ?? "") ? f.status! : "pending";
  const conds: SQL[] = [];
  if (status !== "all") conds.push(eq(verificationRequests.status, status as "pending"));
  // A business that answered a "needs info" request has a newer pending one; only show the latest.
  if (status === "needs_info")
    conds.push(sql`not exists (select 1 from verification_requests v2 where v2.business_id = "verification_requests"."business_id" and v2.created_at > "verification_requests"."created_at")`);
  const submitter = alias(users, "submitter");
  const reviewer = alias(users, "reviewer");
  const rows = await db
    .select({
      id: verificationRequests.id,
      status: verificationRequests.status,
      details: verificationRequests.details,
      documentMediaIds: verificationRequests.documentMediaIds,
      decisionNote: verificationRequests.decisionNote,
      createdAt: verificationRequests.createdAt,
      reviewedAt: verificationRequests.reviewedAt,
      businessId: businesses.id,
      businessName: businesses.name,
      businessSlug: businesses.slug,
      businessStatus: businesses.status,
      businessVerification: businesses.verificationStatus,
      submitterName: submitter.name,
      submitterEmail: submitter.email,
      reviewerName: reviewer.name,
    })
    .from(verificationRequests)
    .innerJoin(businesses, eq(businesses.id, verificationRequests.businessId))
    .innerJoin(submitter, eq(submitter.id, verificationRequests.submittedByUserId))
    .leftJoin(reviewer, eq(reviewer.id, verificationRequests.reviewedByUserId))
    .where(conds.length ? and(...conds) : undefined)
    // Pending queue is first-in, first-out; history is newest first.
    .orderBy(status === "pending" ? asc(verificationRequests.createdAt) : desc(verificationRequests.createdAt), asc(verificationRequests.id))
    .limit(p.limit)
    .offset(p.offset);
  const page = paged(rows, p);
  const docs = await documentLinks(page.items.flatMap((r) => r.documentMediaIds));
  return { ...page, status, items: page.items.map((r) => ({ ...r, documents: r.documentMediaIds.map((id) => docs.get(id) ?? { id, url: null, thumb: null, mime: null }) })) };
}

/** Viewable links for uploaded verification documents (images only are processed into variants). */
async function documentLinks(ids: string[]) {
  const out = new Map<string, { id: string; url: string | null; thumb: string | null; mime: string | null }>();
  if (!ids.length) return out;
  const [publicMap, rows] = await Promise.all([getMediaMap(ids), db.select({ id: media.id, mime: media.mime }).from(media).where(inArray(media.id, [...new Set(ids)]))]);
  for (const r of rows) {
    const pm = publicMap.get(r.id);
    out.set(r.id, { id: r.id, url: pm?.sources.at(-1)?.url ?? pm?.videoUrl ?? null, thumb: pm?.sources[0]?.url ?? null, mime: r.mime });
  }
  return out;
}

/* ──────────────────────────── Moderation ─────────────────────────── */

export const REPORT_TABS = ["open", "resolved", "dismissed"] as const;
export const REPORT_TARGETS = ["review", "business", "message", "media", "user"] as const;

export type ReportTarget =
  | { kind: "review"; id: string; rating: number; body: string | null; status: "published" | "hidden" | "removed"; businessId: string; businessName: string }
  | { kind: "business"; id: string; name: string; slug: string; status: string }
  | { kind: "user"; id: string; name: string; email: string | null; status: string }
  | { kind: "message"; id: string; body: string; deleted: boolean }
  | { kind: "media"; id: string; url: string | null; thumb: string | null }
  | { kind: "missing"; id: string };

async function loadReportTargets(items: { targetType: string; targetId: string }[]) {
  const ids = (t: string) => [...new Set(items.filter((i) => i.targetType === t).map((i) => i.targetId))];
  const [rv, bz, us, ms, md] = await Promise.all([
    ids("review").length
      ? db
          .select({ id: reviews.id, rating: reviews.rating, body: reviews.body, status: reviews.status, businessId: businesses.id, businessName: businesses.name })
          .from(reviews)
          .innerJoin(businesses, eq(businesses.id, reviews.businessId))
          .where(inArray(reviews.id, ids("review")))
      : [],
    ids("business").length ? db.select({ id: businesses.id, name: businesses.name, slug: businesses.slug, status: businesses.status }).from(businesses).where(inArray(businesses.id, ids("business"))) : [],
    ids("user").length ? db.select({ id: users.id, name: users.name, email: users.email, status: users.status }).from(users).where(inArray(users.id, ids("user"))) : [],
    ids("message").length ? db.select({ id: messages.id, body: messages.body, deletedAt: messages.deletedAt }).from(messages).where(inArray(messages.id, ids("message"))) : [],
    documentLinks(ids("media")),
  ]);
  const map = new Map<string, ReportTarget>();
  for (const r of rv) map.set(`review:${r.id}`, { kind: "review", ...r });
  for (const b of bz) map.set(`business:${b.id}`, { kind: "business", ...b });
  for (const u of us) map.set(`user:${u.id}`, { kind: "user", ...u });
  for (const m of ms) map.set(`message:${m.id}`, { kind: "message", id: m.id, body: m.body.slice(0, 400), deleted: m.deletedAt != null });
  for (const [id, d] of md) map.set(`media:${id}`, { kind: "media", id, url: d.url, thumb: d.thumb });
  return (t: string, id: string): ReportTarget => map.get(`${t}:${id}`) ?? { kind: "missing", id };
}

export async function listReports(f: { status?: string; target?: string; page?: number }) {
  const p = paging(f.page);
  const status = ((REPORT_TABS as readonly string[]).includes(f.status ?? "") ? f.status : "open") as (typeof REPORT_TABS)[number];
  const conds: SQL[] = [eq(reports.status, status)];
  if (f.target && (REPORT_TARGETS as readonly string[]).includes(f.target)) conds.push(eq(reports.targetType, f.target));
  const reporter = alias(users, "reporter");
  const resolver = alias(users, "resolver");
  const rows = await db
    .select({
      id: reports.id,
      targetType: reports.targetType,
      targetId: reports.targetId,
      reason: reports.reason,
      details: reports.details,
      status: reports.status,
      resolution: reports.resolution,
      createdAt: reports.createdAt,
      resolvedAt: reports.resolvedAt,
      reporterId: reporter.id,
      reporterName: reporter.name,
      reporterEmail: reporter.email,
      resolverName: resolver.name,
      openOnTarget: sql<number>`(select count(*) from reports r2 where r2.target_type = "reports"."target_type" and r2.target_id = "reports"."target_id" and r2.status = 'open')::int`,
    })
    .from(reports)
    .innerJoin(reporter, eq(reporter.id, reports.reporterUserId))
    .leftJoin(resolver, eq(resolver.id, reports.resolvedByUserId))
    .where(and(...conds))
    .orderBy(status === "open" ? asc(reports.createdAt) : desc(reports.resolvedAt), asc(reports.id))
    .limit(p.limit)
    .offset(p.offset);
  const page = paged(rows, p);
  const target = await loadReportTargets(page.items);
  return { ...page, status, items: page.items.map((r) => ({ ...r, target: target(r.targetType, r.targetId) })) };
}

export const resolveReportSchema = z
  .object({
    status: z.enum(["resolved", "dismissed"]),
    resolution: z.string().trim().min(3, "Add a short resolution note").max(1000),
    reviewAction: z
      .enum(["hidden", "removed", "published", "keep"])
      .nullable()
      .default(null)
      .transform((v) => (v === "keep" ? null : v)),
  })
  .refine((v) => !(v.reviewAction && v.status === "dismissed"), { message: "Dismissing a report can't change the review.", path: ["reviewAction"] });

/** Resolves (or dismisses) a report and every other open report on the same target. */
export async function resolveReport(actor: Viewer, reportId: string, input: z.infer<typeof resolveReportSchema>) {
  requireAdmin(actor);
  const [r] = await db.select().from(reports).where(eq(reports.id, reportId));
  if (!r) throw notFound("That report");
  if (r.status !== "open") throw new AppError("conflict", "This report has already been handled.");
  if (input.reviewAction) {
    if (r.targetType !== "review") throw new AppError("validation", "Only review reports can change a review.");
    const { setReviewStatus } = await import("./engagement");
    await setReviewStatus(actor.id, r.targetId, input.reviewAction, input.resolution);
  }
  return db.transaction(async (tx) => {
    const closed = await tx
      .update(reports)
      .set({ status: input.status, resolution: input.resolution, resolvedByUserId: actor.id, resolvedAt: new Date() })
      .where(and(eq(reports.targetType, r.targetType), eq(reports.targetId, r.targetId), eq(reports.status, "open")))
      .returning({ id: reports.id });
    await audit(
      {
        actorUserId: actor.id,
        actorType: "admin",
        action: `admin.report.${input.status}`,
        targetType: "report",
        targetId: reportId,
        metadata: { reportTarget: `${r.targetType}:${r.targetId}`, closed: closed.length, reviewAction: input.reviewAction, resolution: input.resolution },
      },
      tx,
    );
    return { closed: closed.length };
  });
}

export const REVIEW_TABS = ["all", "published", "hidden", "removed", "reported"] as const;

export async function listReviews(f: { status?: string; q?: string; rating?: number; page?: number }) {
  const p = paging(f.page);
  const status = ((REVIEW_TABS as readonly string[]).includes(f.status ?? "") ? f.status : "all") as (typeof REVIEW_TABS)[number];
  const conds: SQL[] = [];
  if (status === "reported") conds.push(sql`exists (select 1 from reports r where r.target_type = 'review' and r.target_id = "reviews"."id" and r.status = 'open')`);
  else if (status !== "all") conds.push(eq(reviews.status, status));
  if (f.rating && f.rating >= 1 && f.rating <= 5) conds.push(eq(reviews.rating, f.rating));
  const q = f.q?.trim();
  if (q) {
    const term = likeTerm(q);
    conds.push(or(ilike(businesses.name, term), ilike(sql`${users.email}::text`, term), ilike(reviews.body, term))!);
  }
  const rows = await db
    .select({
      id: reviews.id,
      rating: reviews.rating,
      body: reviews.body,
      status: reviews.status,
      responseBody: reviews.responseBody,
      createdAt: reviews.createdAt,
      businessId: businesses.id,
      businessName: businesses.name,
      customerId: users.id,
      customerName: users.name,
      customerEmail: users.email,
      appointmentId: reviews.appointmentId,
      openReports: sql<number>`(select count(*) from reports r where r.target_type = 'review' and r.target_id = "reviews"."id" and r.status = 'open')::int`,
    })
    .from(reviews)
    .innerJoin(businesses, eq(businesses.id, reviews.businessId))
    .innerJoin(users, eq(users.id, reviews.customerUserId))
    .where(conds.length ? and(...conds) : undefined)
    .orderBy(desc(reviews.createdAt), desc(reviews.id))
    .limit(p.limit)
    .offset(p.offset);
  return { ...paged(rows, p), status };
}

export const reviewStatusSchema = z.object({ status: z.enum(["published", "hidden", "removed"]), note: zNote });

/** Changes a review's visibility; hiding/removing also closes open reports on it. */
export async function moderateReview(actor: Viewer, reviewId: string, input: z.infer<typeof reviewStatusSchema>) {
  requireAdmin(actor);
  const [r] = await db.select({ status: reviews.status }).from(reviews).where(eq(reviews.id, reviewId));
  if (!r) throw notFound("That review");
  if (r.status === input.status) throw new AppError("conflict", `This review is already ${input.status}.`);
  const { setReviewStatus } = await import("./engagement");
  await setReviewStatus(actor.id, reviewId, input.status, input.note);
  let closed = 0;
  if (input.status !== "published") {
    const rows = await db
      .update(reports)
      .set({ status: "resolved", resolution: input.note ?? `Review ${input.status}`, resolvedByUserId: actor.id, resolvedAt: new Date() })
      .where(and(eq(reports.targetType, "review"), eq(reports.targetId, reviewId), eq(reports.status, "open")))
      .returning({ id: reports.id });
    closed = rows.length;
    if (closed)
      await audit({ actorUserId: actor.id, actorType: "admin", action: "admin.report.resolved", targetType: "review", targetId: reviewId, metadata: { closed, reviewAction: input.status, resolution: input.note } });
  }
  return { status: input.status, closedReports: closed };
}

/* ──────────────────────────── Appointments ───────────────────────── */

export const APPOINTMENT_STATUSES = ["pending_payment", "requested", "confirmed", "checked_in", "in_progress", "completed", "cancelled", "declined", "no_show", "expired"] as const;

export async function listAppointments(f: { q?: string; status?: string; page?: number }) {
  const p = paging(f.page);
  const conds: SQL[] = [];
  const q = f.q?.trim();
  if (q) {
    const term = likeTerm(q);
    const ref = q.toUpperCase().replace(/\s+/g, "");
    conds.push(
      isUuid(q)
        ? or(eq(appointments.id, q), eq(appointments.businessId, q), eq(appointments.customerUserId, q))!
        : or(ilike(appointments.reference, `${ref.replace(/[\\%_]/g, (c) => `\\${c}`)}%`), ilike(businesses.name, term), ilike(sql`${businessCustomers.email}::text`, term), ilike(sql`${users.email}::text`, term))!,
    );
  }
  if (f.status && (APPOINTMENT_STATUSES as readonly string[]).includes(f.status)) conds.push(eq(appointments.status, f.status as AppointmentStatus));
  const rows = await db
    .select({
      id: appointments.id,
      reference: appointments.reference,
      status: appointments.status,
      paymentStatus: appointments.paymentStatus,
      startsAt: appointments.startsAt,
      timezone: appointments.timezone,
      totalCents: appointments.totalCents,
      currency: appointments.currency,
      serviceName: sql<string>`${appointments.snapshot}->>'serviceName'`,
      businessId: businesses.id,
      businessName: businesses.name,
      customerName: businessCustomers.name,
      customerEmail: sql<string | null>`coalesce(${users.email}::text, ${businessCustomers.email}::text)`,
    })
    .from(appointments)
    .innerJoin(businesses, eq(businesses.id, appointments.businessId))
    .innerJoin(businessCustomers, eq(businessCustomers.id, appointments.businessCustomerId))
    .leftJoin(users, eq(users.id, appointments.customerUserId))
    .where(conds.length ? and(...conds) : undefined)
    .orderBy(desc(appointments.startsAt), desc(appointments.id))
    .limit(p.limit)
    .offset(p.offset);
  return paged(rows, p);
}

async function refundableCents(appointmentId: string) {
  const [row] = await db.execute<{ paid: number; refunded: number }>(sql`
    select
      coalesce((select sum(amount_cents) from payments where appointment_id = ${appointmentId} and status = 'succeeded' and provider = 'stripe' and kind <> 'tip'), 0)::float8 as paid,
      coalesce((select sum(rf.amount_cents) from refunds rf join payments p on p.id = rf.payment_id
        where rf.appointment_id = ${appointmentId} and rf.status <> 'failed' and p.provider = 'stripe' and p.kind <> 'tip'), 0)::float8 as refunded
  `);
  return Math.max(0, Number(row.paid) - Number(row.refunded));
}

export async function getAppointmentDetail(id: string) {
  if (!isUuid(id)) return null;
  const row = await one(
    db
      .select({
        a: appointments,
        businessName: businesses.name,
        businessSlug: businesses.slug,
        businessStatus: businesses.status,
        customerName: businessCustomers.name,
        customerEmail: sql<string | null>`coalesce(${users.email}::text, ${businessCustomers.email}::text)`,
        customerPhone: businessCustomers.phone,
      })
      .from(appointments)
      .innerJoin(businesses, eq(businesses.id, appointments.businessId))
      .innerJoin(businessCustomers, eq(businessCustomers.id, appointments.businessCustomerId))
      .leftJoin(users, eq(users.id, appointments.customerUserId))
      .where(eq(appointments.id, id)),
  );
  if (!row) return null;
  const [events, pays, refs, refundable] = await Promise.all([
    db
      .select({
        id: appointmentEvents.id,
        type: appointmentEvents.type,
        actorType: appointmentEvents.actorType,
        actorName: users.name,
        fromStatus: appointmentEvents.fromStatus,
        toStatus: appointmentEvents.toStatus,
        data: appointmentEvents.data,
        createdAt: appointmentEvents.createdAt,
      })
      .from(appointmentEvents)
      .leftJoin(users, eq(users.id, appointmentEvents.actorUserId))
      .where(eq(appointmentEvents.appointmentId, id))
      .orderBy(asc(appointmentEvents.createdAt), asc(appointmentEvents.id))
      .limit(200),
    db.select().from(payments).where(eq(payments.appointmentId, id)).orderBy(asc(payments.createdAt)).limit(50),
    db
      .select({ r: refunds, byName: users.name })
      .from(refunds)
      .leftJoin(users, eq(users.id, refunds.createdByUserId))
      .where(eq(refunds.appointmentId, id))
      .orderBy(asc(refunds.createdAt))
      .limit(50),
    refundableCents(id),
  ]);
  return {
    appointment: row.a,
    business: { id: row.a.businessId, name: row.businessName, slug: row.businessSlug, status: row.businessStatus },
    customer: { userId: row.a.customerUserId, name: row.customerName, email: row.customerEmail, phone: row.customerPhone },
    events,
    payments: pays,
    refunds: refs.map((x) => ({ ...x.r, byName: x.byName })),
    refundableCents: refundable,
    canCancel: canTransition(row.a.status, "cancelled"),
  };
}

export const adminCancelSchema = z.object({ reason: zReason });
export const adminRefundSchema = z.object({ amountCents: z.number().int().min(1, "Enter an amount").max(10_000_000), reason: zReason });

/** Cancels on the business's behalf — the customer gets everything they paid back. */
export async function adminCancelAppointment(actor: Viewer, id: string, input: z.infer<typeof adminCancelSchema>) {
  requireAdmin(actor);
  const [a] = await db.select({ status: appointments.status, businessId: appointments.businessId, reference: appointments.reference }).from(appointments).where(eq(appointments.id, id));
  if (!a) throw notFound("That appointment");
  if (!canTransition(a.status, "cancelled")) throw new AppError("conflict", "This appointment can no longer be cancelled.");
  const { businessCancel } = await import("./booking");
  const res = await businessCancel(actor.id, id, a.businessId, `${input.reason} (cancelled by Kept support)`);
  await audit({
    actorUserId: actor.id,
    actorType: "admin",
    businessId: a.businessId,
    action: "admin.appointment.cancelled",
    targetType: "appointment",
    targetId: id,
    metadata: { reference: a.reference, from: a.status, reason: input.reason, refundCents: res.refundCents },
  });
  return res;
}

export async function adminRefundAppointment(actor: Viewer, id: string, input: z.infer<typeof adminRefundSchema>) {
  requireAdmin(actor);
  const [a] = await db.select({ businessId: appointments.businessId, currency: appointments.currency, reference: appointments.reference }).from(appointments).where(eq(appointments.id, id));
  if (!a) throw notFound("That appointment");
  const available = await refundableCents(id);
  if (available <= 0) throw new AppError("conflict", "There are no online payments left to refund on this appointment.");
  if (input.amountCents > available)
    throw new AppError("validation", `You can refund at most ${formatMoney(available, a.currency)}.`, { fields: { amountCents: `At most ${formatMoney(available, a.currency)}` } });
  const { refundAppointment } = await import("./payments");
  await refundAppointment(id, input.amountCents, { reason: `Kept support: ${input.reason}`, actorUserId: actor.id });
  const refunded = available - (await refundableCents(id));
  await audit({
    actorUserId: actor.id,
    actorType: "admin",
    businessId: a.businessId,
    action: "admin.appointment.refunded",
    targetType: "appointment",
    targetId: id,
    metadata: { reference: a.reference, requestedCents: input.amountCents, refundedCents: refunded, reason: input.reason },
  });
  return { requestedCents: input.amountCents, refundedCents: refunded, currency: a.currency };
}

/* ──────────────────────────── Categories ─────────────────────────── */

export async function listCategoriesAdmin() {
  // Taxonomy is small and admin-curated; the cap is a guard, not a page size.
  const [rows, bizCounts, svcCounts, campaignCounts] = await Promise.all([
    db.select().from(categories).orderBy(asc(categories.sortOrder), asc(categories.name)).limit(500),
    db.select({ id: businesses.primaryCategoryId, n: sql<number>`count(*)::int` }).from(businesses).where(isNotNull(businesses.primaryCategoryId)).groupBy(businesses.primaryCategoryId),
    db.select({ id: services.categoryId, n: sql<number>`count(*)::int` }).from(services).where(isNotNull(services.categoryId)).groupBy(services.categoryId),
    db.select({ id: spotlightCampaigns.categoryId, n: sql<number>`count(*)::int` }).from(spotlightCampaigns).where(isNotNull(spotlightCampaigns.categoryId)).groupBy(spotlightCampaigns.categoryId),
  ]);
  const m = (list: { id: string | null; n: number }[]) => new Map(list.map((x) => [x.id!, x.n]));
  const [b, s, c] = [m(bizCounts), m(svcCounts), m(campaignCounts)];
  const withUsage = rows.map((r) => ({
    ...r,
    usage: { businesses: b.get(r.id) ?? 0, services: s.get(r.id) ?? 0, campaigns: c.get(r.id) ?? 0, children: rows.filter((x) => x.parentId === r.id).length },
  }));
  const top = withUsage.filter((r) => !r.parentId);
  const orphans = withUsage.filter((r) => r.parentId && !rows.some((x) => x.id === r.parentId));
  return [...top, ...orphans].map((t) => ({ ...t, children: withUsage.filter((x) => x.parentId === t.id) }));
}

const SLUG_RE = /^[a-z0-9]+(?:-[a-z0-9]+)*$/;

export const categoryInputSchema = z.object({
  name: z.string().trim().min(2, "Use at least 2 characters").max(60, "Keep it under 60 characters"),
  slug: z
    .string()
    .trim()
    .toLowerCase()
    .min(2, "Use at least 2 characters")
    .max(50, "Keep it under 50 characters")
    .regex(SLUG_RE, "Use lowercase letters, numbers and single hyphens"),
  description: zNote.pipe(z.string().max(300, "Keep it under 300 characters").nullable()),
  keywords: z
    .array(z.string().trim().toLowerCase().min(1).max(40, "Keywords must be under 40 characters"))
    .max(40, "Use at most 40 keywords")
    .default([])
    .transform((k) => [...new Set(k.filter(Boolean))]),
  parentId: z.string().uuid().nullable().default(null),
  isActive: z.boolean().default(true),
});
export type CategoryInput = z.infer<typeof categoryInputSchema>;

async function validateParent(tx: Tx, parentId: string | null, selfId?: string) {
  if (!parentId) return;
  if (parentId === selfId) throw new AppError("validation", "A category can't be its own parent.", { fields: { parentId: "Choose a different parent" } });
  const [parent] = await tx.select({ id: categories.id, parentId: categories.parentId }).from(categories).where(eq(categories.id, parentId));
  if (!parent) throw new AppError("validation", "That parent category doesn't exist.", { fields: { parentId: "Choose a parent" } });
  if (parent.parentId) throw new AppError("validation", "Categories can only be nested one level deep.", { fields: { parentId: "Choose a top-level category" } });
  if (selfId) {
    const [child] = await tx.select({ id: categories.id }).from(categories).where(eq(categories.parentId, selfId)).limit(1);
    if (child) throw new AppError("validation", "This category has subcategories, so it must stay top-level.", { fields: { parentId: "Must be top-level" } });
  }
}

function slugTaken(err: unknown): never {
  if (isUniqueViolation(err)) throw new AppError("conflict", "That slug is already used by another category.", { fields: { slug: "Already in use" } });
  throw err;
}

/** Rebuilds search text for businesses tied to a category (names/keywords feed search). */
async function reindexCategory(categoryId: string) {
  const { refreshSearchIndex } = await import("./business");
  const rows = await db.execute<{ id: string }>(sql`
    select distinct b.id from businesses b
    where b.status <> 'closed' and (
      b.primary_category_id in (select id from categories where id = ${categoryId} or parent_id = ${categoryId})
      or exists (select 1 from services s where s.business_id = b.id and s.category_id in (select id from categories where id = ${categoryId} or parent_id = ${categoryId}))
    )`);
  for (const r of rows) await refreshSearchIndex(r.id);
  return rows.length;
}

export async function createCategory(actor: Viewer, input: CategoryInput) {
  requireAdmin(actor);
  const created = await db
    .transaction(async (tx) => {
      await validateParent(tx, input.parentId);
      const [{ next }] = await tx
        .select({ next: sql<number>`coalesce(max(${categories.sortOrder}) + 1, 0)::int` })
        .from(categories)
        .where(input.parentId ? eq(categories.parentId, input.parentId) : isNull(categories.parentId));
      const [row] = await tx.insert(categories).values({ ...input, sortOrder: next }).returning();
      await audit({ actorUserId: actor.id, actorType: "admin", action: "admin.category.created", targetType: "category", targetId: row.id, metadata: { slug: row.slug, name: row.name, parentId: row.parentId } }, tx);
      return row;
    })
    .catch(slugTaken);
  return created;
}

export async function updateCategory(actor: Viewer, id: string, input: CategoryInput) {
  requireAdmin(actor);
  const { before, after } = await db
    .transaction(async (tx) => {
      const [before] = await tx.select().from(categories).where(eq(categories.id, id)).for("update");
      if (!before) throw notFound("That category");
      await validateParent(tx, input.parentId, id);
      const parentChanged = before.parentId !== input.parentId;
      let sortOrder = before.sortOrder;
      if (parentChanged) {
        const [{ next }] = await tx
          .select({ next: sql<number>`coalesce(max(${categories.sortOrder}) + 1, 0)::int` })
          .from(categories)
          .where(input.parentId ? eq(categories.parentId, input.parentId) : isNull(categories.parentId));
        sortOrder = next;
      }
      const [after] = await tx
        .update(categories)
        .set({ ...input, sortOrder })
        .where(eq(categories.id, id))
        .returning();
      const changes: Record<string, { from: unknown; to: unknown }> = {};
      for (const k of ["name", "slug", "description", "keywords", "parentId", "isActive"] as const) {
        if (JSON.stringify(before[k]) !== JSON.stringify(after[k])) changes[k] = { from: before[k], to: after[k] };
      }
      await audit({ actorUserId: actor.id, actorType: "admin", action: "admin.category.updated", targetType: "category", targetId: id, metadata: { slug: after.slug, changes } }, tx);
      return { before, after };
    })
    .catch(slugTaken);
  if (before.name !== after.name || JSON.stringify(before.keywords) !== JSON.stringify(after.keywords) || before.parentId !== after.parentId) await reindexCategory(id);
  return after;
}

export const categoryActiveSchema = z.object({ isActive: z.boolean() });

export async function setCategoryActive(actor: Viewer, id: string, isActive: boolean) {
  requireAdmin(actor);
  return db.transaction(async (tx) => {
    const [row] = await tx.update(categories).set({ isActive }).where(eq(categories.id, id)).returning();
    if (!row) throw notFound("That category");
    await audit({ actorUserId: actor.id, actorType: "admin", action: isActive ? "admin.category.activated" : "admin.category.deactivated", targetType: "category", targetId: id, metadata: { slug: row.slug } }, tx);
    return row;
  });
}

/** Hard delete is only allowed for categories nothing points at; otherwise deactivate. */
export async function deleteCategory(actor: Viewer, id: string) {
  requireAdmin(actor);
  return db.transaction(async (tx) => {
    const [row] = await tx.select().from(categories).where(eq(categories.id, id)).for("update");
    if (!row) throw notFound("That category");
    const [{ inUse }] = await tx.execute<{ inUse: boolean }>(sql`
      select (
        exists (select 1 from categories where parent_id = ${id})
        or exists (select 1 from businesses where primary_category_id = ${id})
        or exists (select 1 from services where category_id = ${id})
        or exists (select 1 from spotlight_campaigns where category_id = ${id})
      ) as "inUse"`);
    if (inUse) throw new AppError("conflict", "This category is in use. Deactivate it instead so existing listings keep working.");
    await tx.delete(categories).where(eq(categories.id, id));
    await audit({ actorUserId: actor.id, actorType: "admin", action: "admin.category.deleted", targetType: "category", targetId: id, metadata: { slug: row.slug, name: row.name } }, tx);
    return { deleted: true };
  });
}

export const categoryMoveSchema = z.object({ direction: z.enum(["up", "down"]) });

/** Swaps a category with its neighbour among siblings and renumbers the sibling list. */
export async function moveCategory(actor: Viewer, id: string, direction: "up" | "down") {
  requireAdmin(actor);
  return db.transaction(async (tx) => {
    const [row] = await tx.select().from(categories).where(eq(categories.id, id)).for("update");
    if (!row) throw notFound("That category");
    const siblings = await tx
      .select({ id: categories.id })
      .from(categories)
      .where(row.parentId ? eq(categories.parentId, row.parentId) : isNull(categories.parentId))
      .orderBy(asc(categories.sortOrder), asc(categories.name))
      .for("update");
    const ids = siblings.map((s) => s.id);
    const i = ids.indexOf(id);
    const j = direction === "up" ? i - 1 : i + 1;
    if (j < 0 || j >= ids.length) return { moved: false };
    [ids[i], ids[j]] = [ids[j], ids[i]];
    for (let k = 0; k < ids.length; k++) await tx.update(categories).set({ sortOrder: k }).where(eq(categories.id, ids[k]));
    await audit({ actorUserId: actor.id, actorType: "admin", action: "admin.category.reordered", targetType: "category", targetId: id, metadata: { slug: row.slug, direction, position: j } }, tx);
    return { moved: true };
  });
}

/* ───────────────────────────── Audit log ─────────────────────────── */

export async function listAuditLogs(f: { action?: string; businessId?: string; actor?: string; actorType?: string; before?: number }) {
  const limit = ADMIN_MAX_PAGE_SIZE;
  const conds: SQL[] = [];
  const action = f.action?.trim();
  if (action) conds.push(ilike(auditLogs.action, `${action.replace(/[\\%_]/g, (c) => `\\${c}`)}%`));
  if (isUuid(f.businessId)) conds.push(eq(auditLogs.businessId, f.businessId));
  const actor = f.actor?.trim();
  let actorNotFound = false;
  if (actor) {
    if (isUuid(actor)) conds.push(eq(auditLogs.actorUserId, actor));
    else {
      const [u] = await db.select({ id: users.id }).from(users).where(eq(users.email, actor)); // citext: case-insensitive
      if (u) conds.push(eq(auditLogs.actorUserId, u.id));
      else actorNotFound = true;
    }
  }
  if (f.actorType && ["customer", "business", "system", "admin"].includes(f.actorType)) conds.push(eq(auditLogs.actorType, f.actorType as "admin"));
  if (f.before && Number.isSafeInteger(f.before)) conds.push(lt(auditLogs.id, f.before));
  if (actorNotFound) return { items: [], nextBefore: null, actorNotFound };
  const rows = await db
    .select({
      id: auditLogs.id,
      actorType: auditLogs.actorType,
      action: auditLogs.action,
      targetType: auditLogs.targetType,
      targetId: auditLogs.targetId,
      metadata: auditLogs.metadata,
      createdAt: auditLogs.createdAt,
      actorId: users.id,
      actorName: users.name,
      actorEmail: users.email,
      businessId: businesses.id,
      businessName: businesses.name,
    })
    .from(auditLogs)
    .leftJoin(users, eq(users.id, auditLogs.actorUserId))
    .leftJoin(businesses, eq(businesses.id, auditLogs.businessId))
    .where(conds.length ? and(...conds) : undefined)
    .orderBy(desc(auditLogs.id))
    .limit(limit + 1);
  const items = rows.slice(0, limit);
  return { items, nextBefore: rows.length > limit ? items[items.length - 1].id : null, actorNotFound };
}

/** Recent admin actions on one record, for detail pages. */
async function adminHistory(targetType: string, targetId: string) {
  return db
    .select({ id: auditLogs.id, action: auditLogs.action, metadata: auditLogs.metadata, createdAt: auditLogs.createdAt, actorName: users.name })
    .from(auditLogs)
    .leftJoin(users, eq(users.id, auditLogs.actorUserId))
    .where(and(eq(auditLogs.actorType, "admin"), eq(auditLogs.targetType, targetType), eq(auditLogs.targetId, targetId)))
    .orderBy(desc(auditLogs.id))
    .limit(10);
}

/* ────────────────────────────── System ───────────────────────────── */

export async function listFailedJobs(f: { page?: number }) {
  const p = paging(f.page);
  const rows = await db
    .select({
      id: jobs.id,
      type: jobs.type,
      attempts: jobs.attempts,
      maxAttempts: jobs.maxAttempts,
      lastError: jobs.lastError,
      runAt: jobs.runAt,
      createdAt: jobs.createdAt,
    })
    .from(jobs)
    .where(eq(jobs.status, "failed"))
    .orderBy(desc(jobs.id))
    .limit(p.limit)
    .offset(p.offset);
  return paged(rows, p);
}

export async function listWebhookErrors(f: { page?: number }) {
  const p = paging(f.page);
  const rows = await db
    .select({
      id: webhookEvents.id,
      provider: webhookEvents.provider,
      type: webhookEvents.type,
      error: webhookEvents.error,
      attempts: webhookEvents.attempts,
      processedAt: webhookEvents.processedAt,
      receivedAt: webhookEvents.receivedAt,
    })
    .from(webhookEvents)
    .where(isNotNull(webhookEvents.error))
    .orderBy(desc(webhookEvents.receivedAt))
    .limit(p.limit)
    .offset(p.offset);
  return paged(rows, p);
}

export async function systemCounts() {
  const [row] = await db.execute<{ failedJobs: number; pendingJobs: number; overdueJobs: number; webhookErrors: number; webhookUnprocessed: number }>(sql`
    select
      (select count(*) from jobs where status = 'failed')::int as "failedJobs",
      (select count(*) from jobs where status = 'pending')::int as "pendingJobs",
      (select count(*) from jobs where status = 'pending' and run_at < now() - interval '5 minutes')::int as "overdueJobs",
      (select count(*) from webhook_events where error is not null)::int as "webhookErrors",
      (select count(*) from webhook_events where processed_at is null and error is not null)::int as "webhookUnprocessed"
  `);
  return row;
}

export async function retryJob(actor: Viewer, jobId: number) {
  requireAdmin(actor);
  return db.transaction(async (tx) => {
    const [row] = await tx
      .update(jobs)
      .set({ status: "pending", attempts: 0, runAt: new Date(), lockedAt: null })
      .where(and(eq(jobs.id, jobId), eq(jobs.status, "failed")))
      .returning({ id: jobs.id, type: jobs.type, lastError: jobs.lastError });
    if (!row) throw new AppError("conflict", "That job isn't in a failed state any more.");
    await audit({ actorUserId: actor.id, actorType: "admin", action: "admin.job.retried", targetType: "job", targetId: String(jobId), metadata: { type: row.type, lastError: row.lastError?.slice(0, 200) } }, tx);
    return { id: row.id };
  });
}

/* ───────────────────────────── Spotlight ─────────────────────────── */

export const SPOTLIGHT_TABS = ["live", "ended"] as const;

export async function listSpotlightCampaigns(f: { tab?: string; page?: number }) {
  const p = paging(f.page);
  const tab = ((SPOTLIGHT_TABS as readonly string[]).includes(f.tab ?? "") ? f.tab : "live") as (typeof SPOTLIGHT_TABS)[number];
  const live = and(inArray(spotlightCampaigns.status, ["active", "paused"]), gt(spotlightCampaigns.endsAt, sql`now()`))!;
  const rows = await db
    .select({
      id: spotlightCampaigns.id,
      status: spotlightCampaigns.status,
      startsAt: spotlightCampaigns.startsAt,
      endsAt: spotlightCampaigns.endsAt,
      impressions: spotlightCampaigns.impressions,
      clicks: spotlightCampaigns.clicks,
      priceCents: spotlightCampaigns.priceCents,
      currency: spotlightCampaigns.currency,
      businessId: businesses.id,
      businessName: businesses.name,
      businessSlug: businesses.slug,
      categoryName: categories.name,
      expired: sql<boolean>`${spotlightCampaigns.status} <> 'ended' and ${spotlightCampaigns.endsAt} <= now()`,
    })
    .from(spotlightCampaigns)
    .innerJoin(businesses, eq(businesses.id, spotlightCampaigns.businessId))
    .leftJoin(categories, eq(categories.id, spotlightCampaigns.categoryId))
    .where(tab === "live" ? live : sql`not (${live})`)
    .orderBy(tab === "live" ? asc(spotlightCampaigns.endsAt) : desc(spotlightCampaigns.endsAt), asc(spotlightCampaigns.id))
    .limit(p.limit)
    .offset(p.offset);
  const [totals] = await db
    .select({
      live: sql<number>`count(*)::int`,
      active: sql<number>`count(*) filter (where ${spotlightCampaigns.status} = 'active')::int`,
      impressions: sql<number>`coalesce(sum(${spotlightCampaigns.impressions}), 0)::float8`,
      clicks: sql<number>`coalesce(sum(${spotlightCampaigns.clicks}), 0)::float8`,
    })
    .from(spotlightCampaigns)
    .where(live);
  return { ...paged(rows, p), tab, totals: { ...totals, impressions: Number(totals.impressions), clicks: Number(totals.clicks) } };
}

export const endSpotlightSchema = z.object({ reason: zReason });

export async function endSpotlightCampaign(actor: Viewer, id: string, input: z.infer<typeof endSpotlightSchema>) {
  requireAdmin(actor);
  return db.transaction(async (tx) => {
    const [row] = await tx
      .update(spotlightCampaigns)
      .set({ status: "ended" })
      .where(and(eq(spotlightCampaigns.id, id), ne(spotlightCampaigns.status, "ended")))
      .returning();
    if (!row) throw new AppError("conflict", "That campaign has already ended.");
    const [b] = await tx.select({ name: businesses.name, ownerUserId: businesses.ownerUserId }).from(businesses).where(eq(businesses.id, row.businessId));
    await audit(
      { actorUserId: actor.id, actorType: "admin", businessId: row.businessId, action: "admin.spotlight.ended", targetType: "spotlight", targetId: id, metadata: { reason: input.reason, impressions: row.impressions, clicks: row.clicks } },
      tx,
    );
    await notify(
      b.ownerUserId,
      { topic: "business", type: "spotlight.ended_by_admin", title: "Your Spotlight promotion was ended", body: `Our team ended the promotion for ${b.name}. Reason: ${input.reason}`, href: "/pro" },
      tx,
    );
    return { status: "ended" as const };
  });
}
