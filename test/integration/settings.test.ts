import { eq } from "drizzle-orm";
import { beforeEach, describe, expect, it } from "vitest";
import { AppError } from "@/domain/errors";
import { permissionsFor } from "@/domain/permissions";
import { db } from "@/server/db/client";
import { auditLogs, businessMembers, businesses, intakeForms, locations, media, memberLocations, serviceLocations, services, verificationRequests } from "@/server/db/schema";
import type { Membership } from "@/server/authz";
import { decideVerification } from "@/server/services/admin";
import { createBooking } from "@/server/services/booking";
import { saveService, serviceInputSchema } from "@/server/services/catalog-admin";
import { archiveForm, listFormsWithUsage, saveForm } from "@/server/services/forms-admin";
import { deactivateLocation, locationSchema, locationUsage, saveLocation } from "@/server/services/locations";
import { canViewMedia } from "@/server/services/media";
import { getVerificationState, submitVerification } from "@/server/services/verification";
import { makeBusiness, makeUser, nyTime, resetDb, type Fixture } from "../support/factory";

async function errorCode(p: Promise<unknown>): Promise<string> {
  try {
    await p;
    return "ok";
  } catch (e) {
    if (e instanceof AppError) return e.code;
    throw e;
  }
}

async function errorMessage(p: Promise<unknown>): Promise<string> {
  try {
    await p;
    return "";
  } catch (e) {
    return (e as Error).message;
  }
}

beforeEach(async () => {
  await resetDb();
});

const fields = [
  { id: "q1", type: "short_text" as const, label: "Any allergies?", required: true },
  { id: "q2", type: "single_choice" as const, label: "Hair length", required: false, options: ["Short", "Long"] },
];

describe("intake forms", () => {
  it("lists forms with the services that ask them", async () => {
    const f = await makeBusiness();
    const form = await saveForm(f.ownerMembership, f.owner.id, { name: "New clients", fields });
    await db.update(services).set({ intakeFormId: form.id }).where(eq(services.id, f.svc.id));
    const list = await listFormsWithUsage(f.biz.id);
    expect(list).toHaveLength(1);
    expect(list[0].fields).toHaveLength(2);
    expect(list[0].services.map((s) => s.name)).toEqual(["Signature cut"]);
  });

  it("archiving detaches it from services, and archived forms can't be edited or attached again", async () => {
    const f = await makeBusiness();
    const other = await makeBusiness();
    const form = await saveForm(f.ownerMembership, f.owner.id, { name: "New clients", fields });
    await db.update(services).set({ intakeFormId: form.id }).where(eq(services.id, f.svc.id));

    // Another business can't archive it.
    expect(await errorCode(archiveForm(other.ownerMembership, other.owner.id, form.id))).toBe("not_found");

    const res = await archiveForm(f.ownerMembership, f.owner.id, form.id);
    expect(res.services.map((s) => s.id)).toEqual([f.svc.id]);
    const [svc] = await db.select().from(services).where(eq(services.id, f.svc.id));
    expect(svc.intakeFormId).toBeNull();
    expect(await listFormsWithUsage(f.biz.id)).toHaveLength(0);
    const [audit] = await db.select().from(auditLogs).where(eq(auditLogs.action, "form.archived"));
    expect(audit.metadata).toEqual({ detachedServices: [f.svc.id] });

    expect(await errorCode(saveForm(f.ownerMembership, f.owner.id, { name: "Edited", fields }, form.id))).toBe("not_found");
    expect(await errorCode(archiveForm(f.ownerMembership, f.owner.id, form.id))).toBe("not_found");
    const [row] = await db.select().from(intakeForms).where(eq(intakeForms.id, form.id));
    expect(row.name).toBe("New clients");

    const input = serviceInputSchema.parse({ name: "Trim", durationMinutes: 30, priceType: "fixed", priceCents: 2000, memberIds: [f.members[0].id], intakeFormId: form.id });
    expect(await errorCode(saveService(f.ownerMembership, f.owner.id, input))).toBe("validation");
  });

  it("requires services.manage", async () => {
    const f = await makeBusiness();
    const frontDesk: Membership = { ...f.ownerMembership, role: "receptionist", permissions: permissionsFor("receptionist") };
    expect(await errorCode(saveForm(frontDesk, f.owner.id, { name: "Nope", fields }))).toBe("forbidden");
  });
});

const place = (over: Partial<Record<string, unknown>> = {}) =>
  locationSchema.parse({ name: "Second chair", kind: "physical", line1: "9 Side St", city: "Brooklyn", timezone: "America/New_York", ...over });

/** A business on the Pro plan (3 locations). */
async function proBusiness() {
  const f = await makeBusiness();
  await db.update(businesses).set({ plan: "pro" }).where(eq(businesses.id, f.biz.id));
  return { ...f, ownerMembership: { ...f.ownerMembership, plan: "pro" as const } };
}

describe("locations", () => {
  async function withTwo() {
    const f = await proBusiness();
    const { id } = await saveLocation(f.ownerMembership, f.owner.id, place());
    return { f, secondId: id };
  }

  it("refuses to remove the only active location", async () => {
    const f = await makeBusiness();
    expect(await errorMessage(deactivateLocation(f.ownerMembership, f.owner.id, f.loc.id))).toMatch(/only location/);
    const [loc] = await db.select().from(locations).where(eq(locations.id, f.loc.id));
    expect(loc.isActive).toBe(true);
  });

  it("refuses while appointments are still to come there", async () => {
    const { f } = await withTwo();
    const customer = await makeUser();
    await createBooking(customer, {
      serviceId: f.svc.id,
      memberId: "any",
      locationId: f.loc.id,
      start: nyTime(5, "10:00"),
      optionIds: [],
      intake: {},
      idempotencyKey: `k-${Math.random()}`,
      source: "marketplace",
      customerNote: null,
      serviceAddress: null,
    });
    expect((await locationUsage(f.biz.id)).get(f.loc.id)!.upcoming).toBe(1);
    expect(await errorMessage(deactivateLocation(f.ownerMembership, f.owner.id, f.loc.id))).toMatch(/1 upcoming appointment\b/);
  });

  it("refuses when an active service is only offered there", async () => {
    const { f, secondId } = await withTwo();
    await db.insert(serviceLocations).values({ serviceId: f.svc.id, locationId: secondId });
    expect((await locationUsage(f.biz.id)).get(secondId)!.exclusiveServices).toEqual(["Signature cut"]);
    expect(await errorMessage(deactivateLocation(f.ownerMembership, f.owner.id, secondId))).toMatch(/“Signature cut” is only offered here/);
    // Hidden services don't block; their link is removed.
    await db.update(services).set({ status: "hidden" }).where(eq(services.id, f.svc.id));
    await deactivateLocation(f.ownerMembership, f.owner.id, secondId);
    expect(await db.select().from(serviceLocations).where(eq(serviceLocations.locationId, secondId))).toHaveLength(0);
  });

  it("promotes another location when the primary is removed and drops team assignments", async () => {
    const { f, secondId } = await withTwo();
    await db.insert(memberLocations).values({ memberId: f.members[0].id, locationId: f.loc.id });
    await deactivateLocation(f.ownerMembership, f.owner.id, f.loc.id);
    const rows = await db.select().from(locations).where(eq(locations.businessId, f.biz.id));
    expect(rows.find((l) => l.id === f.loc.id)).toMatchObject({ isActive: false, isPrimary: false });
    expect(rows.find((l) => l.id === secondId)).toMatchObject({ isActive: true, isPrimary: true });
    expect(await db.select().from(memberLocations).where(eq(memberLocations.locationId, f.loc.id))).toHaveLength(0);
    // Removed locations can't be edited or removed again.
    expect(await errorCode(saveLocation(f.ownerMembership, f.owner.id, place(), f.loc.id))).toBe("not_found");
    expect(await errorCode(deactivateLocation(f.ownerMembership, f.owner.id, f.loc.id))).toBe("not_found");
  });

  it("moves the primary flag only by choosing a new primary", async () => {
    const { f, secondId } = await withTwo();
    // Saving the primary with isPrimary=false leaves it primary.
    await saveLocation(f.ownerMembership, f.owner.id, place({ name: "Main", line1: "1 Main St", isPrimary: false }), f.loc.id);
    let rows = await db.select().from(locations).where(eq(locations.businessId, f.biz.id));
    expect(rows.filter((l) => l.isPrimary).map((l) => l.id)).toEqual([f.loc.id]);
    await saveLocation(f.ownerMembership, f.owner.id, place({ isPrimary: true }), secondId);
    rows = await db.select().from(locations).where(eq(locations.businessId, f.biz.id));
    expect(rows.filter((l) => l.isPrimary).map((l) => l.id)).toEqual([secondId]);
  });

  it("clears address parts that don't apply and refreshes the search listing", async () => {
    const f = await proBusiness();
    const { id } = await saveLocation(
      f.ownerMembership,
      f.owner.id,
      place({ name: "House calls", kind: "mobile", line1: "22 Home Rd", postalCode: "11211", city: "Brooklyn", serviceRadiusKm: 15, lat: 40.71234, lng: -73.95678 }),
    );
    const [loc] = await db.select().from(locations).where(eq(locations.id, id));
    expect(loc).toMatchObject({ line1: null, postalCode: null, city: "Brooklyn", serviceRadiusKm: 15 });
    const [b] = await db.select().from(businesses).where(eq(businesses.id, f.biz.id));
    expect(b.offersMobile).toBe(true);
    await deactivateLocation(f.ownerMembership, f.owner.id, id);
    const [after] = await db.select().from(businesses).where(eq(businesses.id, f.biz.id));
    expect(after.offersMobile).toBe(false);
  });

  it("enforces the plan's location limit on active locations", async () => {
    const f = await makeBusiness();
    const solo: Membership = { ...f.ownerMembership, plan: "free" };
    expect(await errorMessage(saveLocation(solo, f.owner.id, place()))).toMatch(/Solo plan includes 1 location\./);
  });
});

describe("verification resubmission", () => {
  async function doc(f: Fixture, ownerUserId = f.owner.id) {
    const [m] = await db
      .insert(media)
      .values({ ownerUserId, businessId: f.biz.id, kind: "image", status: "ready", originalKey: `b/${f.biz.id}/x/original.webp`, mime: "image/webp", bytes: 10, visibility: "private" })
      .returning();
    return m;
  }

  it("starts a new request after a rejection", async () => {
    const f = await makeBusiness();
    const admin = await makeUser({ platformRole: "admin" });
    const first = await submitVerification(f.ownerMembership, f.owner.id, { details: "Licence 1", documentMediaIds: [] });
    await decideVerification(admin, first.id, { status: "rejected", note: "That licence number doesn't match the state register." });
    const state = await getVerificationState(f.biz.id);
    expect(state.status).toBe("rejected");
    expect(state.latest?.decisionNote).toMatch(/state register/);

    const d = await doc(f);
    const second = await submitVerification(f.ownerMembership, f.owner.id, { details: "Licence 2", documentMediaIds: [d.id] });
    expect(second.id).not.toBe(first.id);
    const reqs = await db.select().from(verificationRequests).where(eq(verificationRequests.businessId, f.biz.id));
    expect(reqs.map((r) => r.status).sort()).toEqual(["pending", "rejected"]);
    const after = await getVerificationState(f.biz.id);
    expect(after.status).toBe("pending");
    expect(after.latest?.id).toBe(second.id);
  });

  it("reopens the same request when more information was asked for", async () => {
    const f = await makeBusiness();
    const admin = await makeUser({ platformRole: "admin" });
    const first = await submitVerification(f.ownerMembership, f.owner.id, { details: "Please verify", documentMediaIds: [] });
    await decideVerification(admin, first.id, { status: "needs_info", note: "Upload a photo of your licence." });
    const d = await doc(f);
    const again = await submitVerification(f.ownerMembership, f.owner.id, { details: "Licence attached", documentMediaIds: [d.id] });
    expect(again.id).toBe(first.id);
    const reqs = await db.select().from(verificationRequests).where(eq(verificationRequests.businessId, f.biz.id));
    expect(reqs).toHaveLength(1);
    expect(reqs[0]).toMatchObject({ status: "pending", details: "Licence attached", documentMediaIds: [d.id], decisionNote: "Upload a photo of your licence." });
    const [b] = await db.select().from(businesses).where(eq(businesses.id, f.biz.id));
    expect(b.verificationStatus).toBe("pending");
    // The reviewer can decide it again.
    await decideVerification(admin, first.id, { status: "verified", note: null });
    expect((await getVerificationState(f.biz.id)).status).toBe("verified");
  });

  it("lets other people who manage the business see submitted documents, but not other staff", async () => {
    const f = await makeBusiness();
    const d = await doc(f);
    await submitVerification(f.ownerMembership, f.owner.id, { details: null, documentMediaIds: [d.id] });
    const coOwner = await makeUser();
    await db.insert(businessMembers).values({ businessId: f.biz.id, userId: coOwner.id, role: "custom", customPermissions: ["business.manage"], displayName: "Co-owner", joinedAt: new Date() });
    const desk = await makeUser();
    await db.insert(businessMembers).values({ businessId: f.biz.id, userId: desk.id, role: "receptionist", displayName: "Desk", joinedAt: new Date() });
    const stranger = await makeUser();
    expect(await canViewMedia(d, coOwner)).toBe(true);
    expect(await canViewMedia(d, desk)).toBe(false);
    expect(await canViewMedia(d, stranger)).toBe(false);
  });
});
