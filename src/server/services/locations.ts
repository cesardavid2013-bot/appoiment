import "server-only";
import { and, count, eq, gt, inArray } from "drizzle-orm";
import { z } from "zod";
import { AppError, notFound } from "@/domain/errors";
import { entitlements } from "@/domain/plans";
import { isValidTimeZone } from "@/domain/time";
import { db } from "../db/client";
import { appointments, locations } from "../db/schema";
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

export async function saveLocation(m: Membership, actorUserId: string, input: z.infer<typeof locationSchema>, locationId?: string) {
  const id = await db.transaction(async (tx) => {
    if (!locationId) {
      const [{ n }] = await tx.select({ n: count() }).from(locations).where(and(eq(locations.businessId, m.businessId), eq(locations.isActive, true)));
      if (n >= entitlements(m.plan).maxLocations) throw new AppError("forbidden", `Your ${entitlements(m.plan).label} plan includes ${entitlements(m.plan).maxLocations} location${entitlements(m.plan).maxLocations === 1 ? "" : "s"}.`);
    }
    const values = {
      ...input,
      country: input.country?.toUpperCase() ?? null,
      lat: input.kind === "virtual" ? null : input.lat,
      lng: input.kind === "virtual" ? null : input.lng,
      serviceRadiusKm: input.kind === "mobile" ? input.serviceRadiusKm : null,
      businessId: m.businessId,
    };
    let id = locationId;
    if (id) {
      const res = await tx.update(locations).set(values).where(and(eq(locations.id, id), eq(locations.businessId, m.businessId))).returning({ id: locations.id });
      if (!res.length) throw notFound("That location");
    } else {
      const [{ n }] = await tx.select({ n: count() }).from(locations).where(eq(locations.businessId, m.businessId));
      id = (await tx.insert(locations).values({ ...values, isPrimary: input.isPrimary || n === 0 }).returning({ id: locations.id }))[0].id;
    }
    if (input.isPrimary) {
      await tx.update(locations).set({ isPrimary: false }).where(and(eq(locations.businessId, m.businessId), eq(locations.isPrimary, true)));
      await tx.update(locations).set({ isPrimary: true }).where(eq(locations.id, id));
    }
    await audit({ actorUserId, actorType: "business", businessId: m.businessId, action: locationId ? "location.updated" : "location.created", targetType: "location", targetId: id }, tx);
    return id;
  });
  await refreshSearchIndex(m.businessId);
  return { id };
}

export async function deactivateLocation(m: Membership, actorUserId: string, locationId: string) {
  const [loc] = await db.select().from(locations).where(and(eq(locations.id, locationId), eq(locations.businessId, m.businessId)));
  if (!loc) throw notFound("That location");
  const [{ upcoming }] = await db
    .select({ upcoming: count() })
    .from(appointments)
    .where(and(eq(appointments.locationId, locationId), gt(appointments.startsAt, new Date()), inArray(appointments.status, ["requested", "confirmed", "pending_payment"])));
  if (upcoming > 0) throw new AppError("conflict", `This location has ${upcoming} upcoming appointment${upcoming === 1 ? "" : "s"}. Move or cancel them first.`);
  await db.update(locations).set({ isActive: false, isPrimary: false }).where(eq(locations.id, locationId));
  await refreshSearchIndex(m.businessId);
  await audit({ actorUserId, actorType: "business", businessId: m.businessId, action: "location.deactivated", targetType: "location", targetId: locationId });
}

export async function listLocations(businessId: string) {
  return db.select().from(locations).where(and(eq(locations.businessId, businessId), eq(locations.isActive, true))).orderBy(locations.createdAt);
}
