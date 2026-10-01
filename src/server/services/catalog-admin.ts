import "server-only";
import { and, asc, count, eq, gt, inArray, isNull, notInArray, sql } from "drizzle-orm";
import { z } from "zod";
import { AppError, notFound } from "@/domain/errors";
import { entitlements } from "@/domain/plans";
import { slugify } from "@/domain/slugs";
import { db, type Tx } from "../db/client";
import {
  appointments,
  businessMembers,
  businesses,
  categories,
  intakeForms,
  locations,
  serviceLocations,
  serviceOptionGroups,
  serviceOptions,
  serviceStaff,
  services,
} from "../db/schema";
import type { Membership } from "../authz";
import { audit } from "../audit";
import { zOptText } from "../http";
import { refreshSearchIndex } from "./business";

const optionSchema = z.object({
  id: z.string().uuid().optional(),
  name: z.string().trim().min(1, "Name the option").max(80),
  description: zOptText(300),
  priceDeltaCents: z.number().int().min(-1_000_000).max(1_000_000).default(0),
  durationDeltaMinutes: z.number().int().min(-600).max(600).default(0),
  eligibleMemberIds: z.array(z.string().uuid()).max(200).nullable().default(null),
  isDefault: z.boolean().default(false),
  isActive: z.boolean().default(true),
});

const groupSchema = z.object({
  id: z.string().uuid().optional(),
  name: z.string().trim().min(1, "Name this group").max(80),
  description: zOptText(300),
  selection: z.enum(["single", "multiple"]),
  required: z.boolean().default(false),
  maxSelect: z.number().int().min(1).max(50).nullable().default(null),
  options: z.array(optionSchema).min(1, "Add at least one option").max(40),
});

const weeklySchema = z.array(z.object({ weekday: z.number().int().min(1).max(7), start: z.number().int().min(0).max(1440), end: z.number().int().min(0).max(1440) }).refine((w) => w.start < w.end, "End must be after start")).max(50);

export const serviceInputSchema = z
  .object({
    name: z.string().trim().min(2, "Name your service").max(100),
    description: zOptText(3000),
    categoryId: z.string().uuid().nullable().default(null),
    menuSection: zOptText(60),
    durationMinutes: z.number().int().min(5, "At least 5 minutes").max(1440),
    bufferBeforeMinutes: z.number().int().min(0).max(240).default(0),
    bufferAfterMinutes: z.number().int().min(0).max(240).default(0),
    priceType: z.enum(["fixed", "starting_at", "range", "free", "quote"]),
    priceCents: z.number().int().min(0).max(10_000_000).default(0),
    salePriceCents: z.number().int().min(0).max(10_000_000).nullable().default(null),
    priceMaxCents: z.number().int().min(0).max(10_000_000).nullable().default(null),
    paymentPolicy: z.enum(["pay_later", "deposit", "full"]).default("pay_later"),
    depositType: z.enum(["fixed", "percent"]).nullable().default(null),
    depositValue: z.number().int().min(0).max(10_000_000).nullable().default(null),
    capacity: z.number().int().min(1).max(500).default(1),
    minAttendees: z.number().int().min(1).max(500).default(1),
    minNoticeMinutes: z.number().int().min(0).max(60 * 24 * 30).nullable().default(null),
    maxAdvanceDays: z.number().int().min(1).max(365).nullable().default(null),
    requiresApproval: z.boolean().nullable().default(null),
    serviceHours: weeklySchema.nullable().default(null),
    intakeFormId: z.string().uuid().nullable().default(null),
    consentText: zOptText(3000),
    minAge: z.number().int().min(1).max(99).nullable().default(null),
    bookingInstructions: zOptText(2000),
    coverMediaId: z.string().uuid().nullable().default(null),
    status: z.enum(["active", "hidden"]).default("active"),
    memberIds: z.array(z.string().uuid()).min(1, "Choose who performs this service").max(200),
    staffOverrides: z
      .array(z.object({ memberId: z.string().uuid(), priceCents: z.number().int().min(0).nullable(), durationMinutes: z.number().int().min(5).max(1440).nullable() }))
      .max(200)
      .default([]),
    locationIds: z.array(z.string().uuid()).max(100).default([]),
    optionGroups: z.array(groupSchema).max(20).default([]),
  })
  .superRefine((v, ctx) => {
    if (v.priceType === "range" && (v.priceMaxCents == null || v.priceMaxCents <= v.priceCents))
      ctx.addIssue({ code: "custom", path: ["priceMaxCents"], message: "The maximum must be higher than the minimum" });
    if (v.salePriceCents != null && v.salePriceCents >= v.priceCents)
      ctx.addIssue({ code: "custom", path: ["salePriceCents"], message: "Sale price must be lower than the regular price" });
    if (v.paymentPolicy === "deposit" && (!v.depositType || !v.depositValue))
      ctx.addIssue({ code: "custom", path: ["depositValue"], message: "Set the deposit amount" });
    if (v.depositType === "percent" && v.depositValue != null && v.depositValue > 100)
      ctx.addIssue({ code: "custom", path: ["depositValue"], message: "A percentage can't exceed 100" });
    if (v.minAttendees > v.capacity) ctx.addIssue({ code: "custom", path: ["minAttendees"], message: "Can't exceed capacity" });
    v.optionGroups.forEach((g, i) => {
      if (g.selection === "single" && g.maxSelect != null) g.maxSelect = null;
      if (g.selection === "single" && g.options.filter((o) => o.isDefault).length > 1)
        ctx.addIssue({ code: "custom", path: ["optionGroups", i], message: "Only one default per single-choice group" });
    });
  });

export type ServiceInput = z.infer<typeof serviceInputSchema>;

async function assertOwnedIds(tx: Tx, businessId: string, input: ServiceInput) {
  const members = await tx
    .select({ id: businessMembers.id })
    .from(businessMembers)
    .where(and(eq(businessMembers.businessId, businessId), inArray(businessMembers.id, input.memberIds)));
  if (members.length !== new Set(input.memberIds).size) throw new AppError("validation", "One of the selected team members isn't part of this business.");
  const allOptionMembers = input.optionGroups.flatMap((g) => g.options.flatMap((o) => o.eligibleMemberIds ?? []));
  if (allOptionMembers.some((id) => !input.memberIds.includes(id))) throw new AppError("validation", "Option staff restrictions must use people who perform this service.");
  if (input.locationIds.length) {
    const locs = await tx.select({ id: locations.id }).from(locations).where(and(eq(locations.businessId, businessId), inArray(locations.id, input.locationIds)));
    if (locs.length !== new Set(input.locationIds).size) throw new AppError("validation", "One of the selected locations isn't part of this business.");
  }
  if (input.intakeFormId) {
    const [f] = await tx
      .select({ id: intakeForms.id })
      .from(intakeForms)
      .where(and(eq(intakeForms.id, input.intakeFormId), eq(intakeForms.businessId, businessId), isNull(intakeForms.archivedAt)));
    if (!f) throw new AppError("validation", "That intake form doesn't exist.");
  }
  if (input.coverMediaId) {
    const { assertMediaOwned } = await import("./media");
    await assertMediaOwned(input.coverMediaId, { businessId });
  }
  if (input.categoryId) {
    const [c] = await tx.select({ id: categories.id }).from(categories).where(eq(categories.id, input.categoryId));
    if (!c) throw new AppError("validation", "That category doesn't exist.");
  }
  const staffIds = new Set(input.memberIds);
  if (input.staffOverrides.some((o) => !staffIds.has(o.memberId))) throw new AppError("validation", "Price overrides must be for people who perform this service.");
}

async function uniqueServiceSlug(tx: Tx, businessId: string, name: string, excludeId?: string) {
  const base = slugify(name) || "service";
  for (let i = 0; i < 100; i++) {
    const slug = i === 0 ? base : `${base}-${i + 1}`;
    const [taken] = await tx
      .select({ id: services.id })
      .from(services)
      .where(and(eq(services.businessId, businessId), eq(services.slug, slug), excludeId ? sql`${services.id} <> ${excludeId}` : sql`true`));
    if (!taken) return slug;
  }
  return `${base}-${Date.now().toString(36)}`;
}

/** Replaces option groups/options while preserving ids, so historic selections stay meaningful. */
async function syncOptionGroups(tx: Tx, serviceId: string, groups: ServiceInput["optionGroups"]) {
  const existing = await tx.select({ id: serviceOptionGroups.id }).from(serviceOptionGroups).where(eq(serviceOptionGroups.serviceId, serviceId));
  const existingIds = new Set(existing.map((g) => g.id));
  const keepGroupIds: string[] = [];
  for (const [gi, g] of groups.entries()) {
    let groupId = g.id && existingIds.has(g.id) ? g.id : undefined;
    const values = { serviceId, name: g.name, description: g.description, selection: g.selection, required: g.required, maxSelect: g.selection === "multiple" ? g.maxSelect : null, sortOrder: gi };
    if (groupId) await tx.update(serviceOptionGroups).set(values).where(eq(serviceOptionGroups.id, groupId));
    else groupId = (await tx.insert(serviceOptionGroups).values(values).returning({ id: serviceOptionGroups.id }))[0].id;
    keepGroupIds.push(groupId);

    const existingOpts = await tx.select({ id: serviceOptions.id }).from(serviceOptions).where(eq(serviceOptions.groupId, groupId));
    const existingOptIds = new Set(existingOpts.map((o) => o.id));
    const keepOptIds: string[] = [];
    for (const [oi, o] of g.options.entries()) {
      const ov = {
        groupId,
        name: o.name,
        description: o.description,
        priceDeltaCents: o.priceDeltaCents,
        durationDeltaMinutes: o.durationDeltaMinutes,
        eligibleMemberIds: o.eligibleMemberIds && o.eligibleMemberIds.length ? o.eligibleMemberIds : null,
        isDefault: o.isDefault,
        isActive: o.isActive,
        sortOrder: oi,
      };
      if (o.id && existingOptIds.has(o.id)) {
        await tx.update(serviceOptions).set(ov).where(eq(serviceOptions.id, o.id));
        keepOptIds.push(o.id);
      } else keepOptIds.push((await tx.insert(serviceOptions).values(ov).returning({ id: serviceOptions.id }))[0].id);
    }
    await tx.delete(serviceOptions).where(and(eq(serviceOptions.groupId, groupId), keepOptIds.length ? notInArray(serviceOptions.id, keepOptIds) : sql`true`));
  }
  await tx
    .delete(serviceOptionGroups)
    .where(and(eq(serviceOptionGroups.serviceId, serviceId), keepGroupIds.length ? notInArray(serviceOptionGroups.id, keepGroupIds) : sql`true`));
}

export async function saveService(m: Membership, actorUserId: string, input: ServiceInput, serviceId?: string) {
  const id = await db.transaction(async (tx) => {
    await assertOwnedIds(tx, m.businessId, input);
    if (input.intakeFormId && !entitlements(m.plan).intakeForms) throw new AppError("forbidden", "Intake forms aren't included in your plan.");
    let sid = serviceId;
    const values = {
      businessId: m.businessId,
      name: input.name,
      description: input.description,
      categoryId: input.categoryId,
      menuSection: input.menuSection,
      durationMinutes: input.durationMinutes,
      bufferBeforeMinutes: input.bufferBeforeMinutes,
      bufferAfterMinutes: input.bufferAfterMinutes,
      priceType: input.priceType,
      priceCents: input.priceType === "free" || input.priceType === "quote" ? 0 : input.priceCents,
      salePriceCents: input.priceType === "fixed" || input.priceType === "starting_at" ? input.salePriceCents : null,
      priceMaxCents: input.priceType === "range" ? input.priceMaxCents : null,
      paymentPolicy: input.priceType === "free" || input.priceType === "quote" ? ("pay_later" as const) : input.paymentPolicy,
      depositType: input.paymentPolicy === "deposit" ? input.depositType : null,
      depositValue: input.paymentPolicy === "deposit" ? input.depositValue : null,
      capacity: input.capacity,
      minAttendees: input.minAttendees,
      minNoticeMinutes: input.minNoticeMinutes,
      maxAdvanceDays: input.maxAdvanceDays,
      requiresApproval: input.requiresApproval,
      serviceHours: input.serviceHours && input.serviceHours.length ? input.serviceHours : null,
      intakeFormId: input.intakeFormId,
      consentText: input.consentText,
      minAge: input.minAge,
      bookingInstructions: input.bookingInstructions,
      coverMediaId: input.coverMediaId,
      status: input.status,
    };
    if (sid) {
      const [existing] = await tx.select({ id: services.id, status: services.status }).from(services).where(and(eq(services.id, sid), eq(services.businessId, m.businessId)));
      if (!existing) throw notFound("That service");
      if (existing.status === "archived") throw new AppError("conflict", "Restore this service before editing it.");
      await tx.update(services).set(values).where(eq(services.id, sid));
    } else {
      const [{ n }] = await tx.select({ n: count() }).from(services).where(and(eq(services.businessId, m.businessId), sql`${services.status} <> 'archived'`));
      if (n >= 500) throw new AppError("forbidden", "You've reached the maximum number of services.");
      const slug = await uniqueServiceSlug(tx, m.businessId, input.name);
      const [created] = await tx.insert(services).values({ ...values, slug, sortOrder: n }).returning({ id: services.id });
      sid = created.id;
    }
    await tx.delete(serviceStaff).where(eq(serviceStaff.serviceId, sid));
    await tx.insert(serviceStaff).values(
      [...new Set(input.memberIds)].map((memberId) => {
        const o = input.staffOverrides.find((x) => x.memberId === memberId);
        return { serviceId: sid!, memberId, priceCentsOverride: o?.priceCents ?? null, durationMinutesOverride: o?.durationMinutes ?? null };
      }),
    );
    await tx.delete(serviceLocations).where(eq(serviceLocations.serviceId, sid));
    if (input.locationIds.length) await tx.insert(serviceLocations).values([...new Set(input.locationIds)].map((locationId) => ({ serviceId: sid!, locationId })));
    await syncOptionGroups(tx, sid, input.optionGroups);
    await audit({ actorUserId, actorType: "business", businessId: m.businessId, action: serviceId ? "service.updated" : "service.created", targetType: "service", targetId: sid }, tx);
    return sid;
  });
  await refreshSearchIndex(m.businessId);
  return { id };
}

/**
 * Archives a service. Existing bookings keep working (they carry a snapshot),
 * but no new bookings can be made. Returns how many upcoming bookings remain.
 */
export async function archiveService(m: Membership, actorUserId: string, serviceId: string) {
  const [svc] = await db.select({ id: services.id }).from(services).where(and(eq(services.id, serviceId), eq(services.businessId, m.businessId)));
  if (!svc) throw notFound("That service");
  await db.update(services).set({ status: "archived", archivedAt: new Date() }).where(eq(services.id, serviceId));
  const [{ upcoming }] = await db
    .select({ upcoming: count() })
    .from(appointments)
    .where(and(eq(appointments.serviceId, serviceId), gt(appointments.startsAt, new Date()), inArray(appointments.status, ["requested", "confirmed", "pending_payment"])));
  await refreshSearchIndex(m.businessId);
  await audit({ actorUserId, actorType: "business", businessId: m.businessId, action: "service.archived", targetType: "service", targetId: serviceId, metadata: { upcoming } });
  return { upcomingBookings: upcoming };
}

export async function restoreService(m: Membership, actorUserId: string, serviceId: string) {
  const res = await db
    .update(services)
    .set({ status: "hidden", archivedAt: null })
    .where(and(eq(services.id, serviceId), eq(services.businessId, m.businessId), eq(services.status, "archived")))
    .returning({ id: services.id });
  if (!res.length) throw notFound("That service");
  await audit({ actorUserId, actorType: "business", businessId: m.businessId, action: "service.restored", targetType: "service", targetId: serviceId });
}

export async function reorderServices(m: Membership, orderedIds: string[]) {
  await db.transaction(async (tx) => {
    for (const [i, id] of orderedIds.entries()) {
      await tx.update(services).set({ sortOrder: i }).where(and(eq(services.id, id), eq(services.businessId, m.businessId)));
    }
  });
}

export async function listServicesForBusiness(businessId: string, includeArchived = false) {
  return db
    .select()
    .from(services)
    .where(and(eq(services.businessId, businessId), includeArchived ? sql`true` : sql`${services.status} <> 'archived'`))
    .orderBy(asc(services.sortOrder), asc(services.name));
}

/** Full editable representation for the service editor. */
export async function getServiceForEdit(businessId: string, serviceId: string): Promise<ServiceInput & { id: string; slug: string; archived: boolean }> {
  const [s] = await db.select().from(services).where(and(eq(services.id, serviceId), eq(services.businessId, businessId)));
  if (!s) throw notFound("That service");
  const [staff, locs, groups] = await Promise.all([
    db.select().from(serviceStaff).where(eq(serviceStaff.serviceId, serviceId)),
    db.select().from(serviceLocations).where(eq(serviceLocations.serviceId, serviceId)),
    db.select().from(serviceOptionGroups).where(eq(serviceOptionGroups.serviceId, serviceId)).orderBy(serviceOptionGroups.sortOrder),
  ]);
  const opts = groups.length ? await db.select().from(serviceOptions).where(inArray(serviceOptions.groupId, groups.map((g) => g.id))).orderBy(serviceOptions.sortOrder) : [];
  return {
    id: s.id,
    slug: s.slug,
    archived: s.status === "archived",
    name: s.name,
    description: s.description,
    categoryId: s.categoryId,
    menuSection: s.menuSection,
    durationMinutes: s.durationMinutes,
    bufferBeforeMinutes: s.bufferBeforeMinutes,
    bufferAfterMinutes: s.bufferAfterMinutes,
    priceType: s.priceType,
    priceCents: s.priceCents,
    salePriceCents: s.salePriceCents,
    priceMaxCents: s.priceMaxCents,
    paymentPolicy: s.paymentPolicy,
    depositType: s.depositType,
    depositValue: s.depositValue,
    capacity: s.capacity,
    minAttendees: s.minAttendees,
    minNoticeMinutes: s.minNoticeMinutes,
    maxAdvanceDays: s.maxAdvanceDays,
    requiresApproval: s.requiresApproval,
    serviceHours: s.serviceHours,
    intakeFormId: s.intakeFormId,
    consentText: s.consentText,
    minAge: s.minAge,
    bookingInstructions: s.bookingInstructions,
    coverMediaId: s.coverMediaId,
    status: s.status === "archived" ? "hidden" : s.status,
    memberIds: staff.map((x) => x.memberId),
    staffOverrides: staff.filter((x) => x.priceCentsOverride != null || x.durationMinutesOverride != null).map((x) => ({ memberId: x.memberId, priceCents: x.priceCentsOverride, durationMinutes: x.durationMinutesOverride })),
    locationIds: locs.map((l) => l.locationId),
    optionGroups: groups.map((g) => ({
      id: g.id,
      name: g.name,
      description: g.description,
      selection: g.selection,
      required: g.required,
      maxSelect: g.maxSelect,
      options: opts
        .filter((o) => o.groupId === g.id)
        .map((o) => ({ id: o.id, name: o.name, description: o.description, priceDeltaCents: o.priceDeltaCents, durationDeltaMinutes: o.durationDeltaMinutes, eligibleMemberIds: o.eligibleMemberIds, isDefault: o.isDefault, isActive: o.isActive })),
    })),
  };
}

export async function businessCurrency(businessId: string) {
  const [b] = await db.select({ currency: businesses.currency }).from(businesses).where(eq(businesses.id, businessId));
  return b?.currency ?? "USD";
}
