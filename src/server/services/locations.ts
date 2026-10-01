import "server-only";
import { and, asc, count, eq, gt, inArray, ne, sql } from "drizzle-orm";
import { z } from "zod";
import { AppError, notFound } from "@/domain/errors";
import { entitlements } from "@/domain/plans";
import { isValidTimeZone } from "@/domain/time";
import { db } from "../db/client";
import { appointments, locations, memberLocations, serviceLocations, services } from "../db/schema";
import type { Membership } from "../authz";
import { audit } from "../audit";
import { zOptText } from "../http";
import { refreshSearchIndex } from "./business";

export const locationSchema = z
  .object({
    name: z.string().trim().min(1, "Name this location").max(80),
    kind: z.enum(["physical", "mobile", "virtual"]),
    line1: zOptText(200),
    line2: zOptText(200),
    city: zOptText(100),
    region: zOptText(100),
    postalCode: zOptText(20),
    country: zOptText(2),
    lat: z.number().min(-90).max(90).nullable().default(null),
    lng: z.number().min(-180).max(180).nullable().default(null),
    serviceRadiusKm: z.number().int().min(1).max(500).nullable().default(null),
    timezone: z.string().refine(isValidTimeZone, "Choose a valid time zone"),
    phone: zOptText(40),
    instructions: zOptText(1000),
    isPrimary: z.boolean().default(false),
  })
  .superRefine((v, ctx) => {
    if (v.kind === "physical" && (!v.line1 || !v.city)) ctx.addIssue({ code: "custom", path: ["line1"], message: "Add a street address and city" });
    if (v.kind === "mobile" && !v.city) ctx.addIssue({ code: "custom", path: ["city"], message: "Add the city you're based in" });
    if (v.kind === "mobile" && !v.serviceRadiusKm) ctx.addIssue({ code: "custom", path: ["serviceRadiusKm"], message: "How far do you travel?" });
  });

/** Appointment states that still need the location to exist. */
const LIVE_STATUSES = ["pending_payment", "requested", "confirmed", "checked_in", "in_progress"] as const;

export async function saveLocation(m: Membership, actorUserId: string, input: z.infer<typeof locationSchema>, locationId?: string) {
  const id = await db.transaction(async (tx) => {
    if (!locationId) {
      const [{ n }] = await tx.select({ n: count() }).from(locations).where(and(eq(locations.businessId, m.businessId), eq(locations.isActive, true)));
      if (n >= entitlements(m.plan).maxLocations) throw new AppError("forbidden", `Your ${entitlements(m.plan).label} plan includes ${entitlements(m.plan).maxLocations} location${entitlements(m.plan).maxLocations === 1 ? "" : "s"}.`);
    }
    const { isPrimary: _isPrimary, ...rest } = input;
    const values = {
      ...rest,
      // Address parts that don't apply to the kind are cleared so nothing stale leaks onto the profile.
      line1: input.kind === "physical" ? input.line1 : null,
      line2: input.kind === "physical" ? input.line2 : null,
      postalCode: input.kind === "physical" ? input.postalCode : null,
      city: input.kind === "virtual" ? null : input.city,
      region: input.kind === "virtual" ? null : input.region,
      country: input.kind === "virtual" ? null : (input.country?.toUpperCase() ?? null),
      lat: input.kind === "virtual" ? null : input.lat,
      lng: input.kind === "virtual" ? null : input.lng,
      serviceRadiusKm: input.kind === "mobile" ? input.serviceRadiusKm : null,
      businessId: m.businessId,
    };
    let id = locationId;
    if (id) {
      // The primary flag only moves by making another location primary, never by unticking it.
      const res = await tx
        .update(locations)
        .set(values)
        .where(and(eq(locations.id, id), eq(locations.businessId, m.businessId), eq(locations.isActive, true)))
        .returning({ id: locations.id });
      if (!res.length) throw notFound("That location");
    } else {
      const [{ n }] = await tx.select({ n: count() }).from(locations).where(and(eq(locations.businessId, m.businessId), eq(locations.isActive, true)));
      id = (await tx.insert(locations).values({ ...values, isPrimary: input.isPrimary || n === 0 }).returning({ id: locations.id }))[0].id;
    }
    if (input.isPrimary) {
      await tx.update(locations).set({ isPrimary: false }).where(and(eq(locations.businessId, m.businessId), eq(locations.isPrimary, true), ne(locations.id, id)));
      await tx.update(locations).set({ isPrimary: true }).where(eq(locations.id, id));
    }
    await audit({ actorUserId, actorType: "business", businessId: m.businessId, action: locationId ? "location.updated" : "location.created", targetType: "location", targetId: id }, tx);
    return id;
  });
  await refreshSearchIndex(m.businessId);
  return { id };
}

/** Active services that are offered at this location and nowhere else that's still open. */
async function servicesOnlyAt(exec: Pick<typeof db, "select">, businessId: string, locationId: string) {
  return exec
    .select({ id: services.id, name: services.name })
    .from(services)
    .innerJoin(serviceLocations, eq(serviceLocations.serviceId, services.id))
    .where(
      and(
        eq(services.businessId, businessId),
        eq(services.status, "active"),
        eq(serviceLocations.locationId, locationId),
        sql`not exists (select 1 from ${serviceLocations} sl2 join ${locations} l2 on l2.id = sl2.location_id where sl2.service_id = ${services.id} and l2.id <> ${locationId} and l2.is_active)`,
      ),
    )
    .orderBy(services.name);
}

/**
 * Removes a location from the business. Refused while it's the only active
 * location, has appointments still to come, or is the only place an active
 * service is offered. Team members assigned to it lose that assignment; if it
 * was primary, the oldest remaining location becomes primary.
 */
export async function deactivateLocation(m: Membership, actorUserId: string, locationId: string, now = new Date()) {
  await db.transaction(async (tx) => {
    // Lock the business's locations so two removals can't both pass the "last one" check.
    const all = await tx
      .select()
      .from(locations)
      .where(and(eq(locations.businessId, m.businessId), eq(locations.isActive, true)))
      .orderBy(asc(locations.createdAt))
      .for("update");
    const loc = all.find((l) => l.id === locationId);
    if (!loc) throw notFound("That location");
    if (all.length === 1) throw new AppError("conflict", "This is your only location. Add another one before removing it, so clients still have somewhere to book.");
    const [{ upcoming }] = await tx
      .select({ upcoming: count() })
      .from(appointments)
      .where(and(eq(appointments.businessId, m.businessId), eq(appointments.locationId, locationId), gt(appointments.endsAt, now), inArray(appointments.status, [...LIVE_STATUSES])));
    if (upcoming > 0) throw new AppError("conflict", `This location has ${upcoming} upcoming appointment${upcoming === 1 ? "" : "s"}. Move or cancel ${upcoming === 1 ? "it" : "them"} first.`);
    const exclusive = await servicesOnlyAt(tx, m.businessId, locationId);
    if (exclusive.length) {
      const names = exclusive.map((s) => `“${s.name}”`);
      const list = names.length > 3 ? `${names.slice(0, 3).join(", ")} and ${names.length - 3} more` : names.join(names.length === 2 ? " and " : ", ");
      throw new AppError("conflict", `${list} ${exclusive.length === 1 ? "is" : "are"} only offered here. Offer ${exclusive.length === 1 ? "it" : "them"} at another location or hide ${exclusive.length === 1 ? "it" : "them"} first.`);
    }
    await tx.update(locations).set({ isActive: false, isPrimary: false }).where(eq(locations.id, locationId));
    await tx.delete(serviceLocations).where(eq(serviceLocations.locationId, locationId));
    await tx.delete(memberLocations).where(eq(memberLocations.locationId, locationId));
    if (loc.isPrimary) {
      const next = all.find((l) => l.id !== locationId)!;
      await tx.update(locations).set({ isPrimary: true }).where(eq(locations.id, next.id));
    }
    await audit({ actorUserId, actorType: "business", businessId: m.businessId, action: "location.deactivated", targetType: "location", targetId: locationId }, tx);
  });
  await refreshSearchIndex(m.businessId);
}

export async function listLocations(businessId: string) {
  return db.select().from(locations).where(and(eq(locations.businessId, businessId), eq(locations.isActive, true))).orderBy(locations.createdAt);
}

export type LocationUsage = { upcoming: number; members: number; services: number; exclusiveServices: string[] };

/** What depends on each active location, so the settings page can explain a removal before it's attempted. */
export async function locationUsage(businessId: string, now = new Date()): Promise<Map<string, LocationUsage>> {
  const locs = await listLocations(businessId);
  const ids = locs.map((l) => l.id);
  const out = new Map<string, LocationUsage>(ids.map((id) => [id, { upcoming: 0, members: 0, services: 0, exclusiveServices: [] }]));
  if (!ids.length) return out;
  const [upcoming, members, svcs] = await Promise.all([
    db
      .select({ id: appointments.locationId, n: count() })
      .from(appointments)
      .where(and(eq(appointments.businessId, businessId), inArray(appointments.locationId, ids), gt(appointments.endsAt, now), inArray(appointments.status, [...LIVE_STATUSES])))
      .groupBy(appointments.locationId),
    db.select({ id: memberLocations.locationId, n: count() }).from(memberLocations).where(inArray(memberLocations.locationId, ids)).groupBy(memberLocations.locationId),
    db
      .select({ id: serviceLocations.locationId, n: count() })
      .from(serviceLocations)
      .innerJoin(services, eq(services.id, serviceLocations.serviceId))
      .where(and(inArray(serviceLocations.locationId, ids), eq(services.status, "active")))
      .groupBy(serviceLocations.locationId),
  ]);
  for (const r of upcoming) if (r.id) out.get(r.id)!.upcoming = r.n;
  for (const r of members) out.get(r.id)!.members = r.n;
  for (const r of svcs) out.get(r.id)!.services = r.n;
  for (const id of ids) {
    if (out.get(id)!.services) out.get(id)!.exclusiveServices = (await servicesOnlyAt(db, businessId, id)).map((s) => s.name);
  }
  return out;
}
