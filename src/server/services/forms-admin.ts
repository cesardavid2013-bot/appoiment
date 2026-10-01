import "server-only";
import { and, desc, eq, isNull } from "drizzle-orm";
import { z } from "zod";
import { forbidden, notFound } from "@/domain/errors";
import { formFieldsSchema } from "@/domain/forms";
import { db } from "../db/client";
import { intakeForms, services } from "../db/schema";
import type { Membership } from "../authz";
import { audit } from "../audit";

export const formSchema = z.object({ name: z.string().trim().min(2).max(80), fields: formFieldsSchema });

function check(m: Membership) {
  if (!m.permissions.has("services.manage")) throw forbidden();
}

export async function listForms(businessId: string) {
  return db.select().from(intakeForms).where(and(eq(intakeForms.businessId, businessId), isNull(intakeForms.archivedAt))).orderBy(desc(intakeForms.updatedAt));
}

export async function saveForm(m: Membership, actorUserId: string, input: z.infer<typeof formSchema>, id?: string) {
  check(m);
  let row;
  if (id) {
    [row] = await db.update(intakeForms).set({ name: input.name, fields: input.fields }).where(and(eq(intakeForms.id, id), eq(intakeForms.businessId, m.businessId))).returning();
    if (!row) throw notFound("That form");
  } else [row] = await db.insert(intakeForms).values({ businessId: m.businessId, name: input.name, fields: input.fields }).returning();
  await audit({ actorUserId, actorType: "business", businessId: m.businessId, action: id ? "form.updated" : "form.created", targetType: "form", targetId: row.id });
  return row;
}

/** Archiving keeps answers on past bookings intact (they store a snapshot of each question). */
export async function archiveForm(m: Membership, actorUserId: string, id: string) {
  check(m);
  const [row] = await db.update(intakeForms).set({ archivedAt: new Date() }).where(and(eq(intakeForms.id, id), eq(intakeForms.businessId, m.businessId))).returning();
  if (!row) throw notFound("That form");
  await db.update(services).set({ intakeFormId: null }).where(eq(services.intakeFormId, id));
  await audit({ actorUserId, actorType: "business", businessId: m.businessId, action: "form.archived", targetType: "form", targetId: id });
}
