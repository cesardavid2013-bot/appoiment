import "server-only";
import { and, desc, eq, inArray, isNull, ne } from "drizzle-orm";
import { z } from "zod";
import { AppError, forbidden, notFound } from "@/domain/errors";
import { formFieldsSchema, type FormField } from "@/domain/forms";
import { entitlements } from "@/domain/plans";
import { db } from "../db/client";
import { intakeForms, services } from "../db/schema";
import type { Membership } from "../authz";
import { audit } from "../audit";

export const formSchema = z.object({ name: z.string().trim().min(2, "Give the form a name").max(80), fields: formFieldsSchema });

function check(m: Membership) {
  if (!m.permissions.has("services.manage")) throw forbidden();
}

export async function listForms(businessId: string) {
  return db.select().from(intakeForms).where(and(eq(intakeForms.businessId, businessId), isNull(intakeForms.archivedAt))).orderBy(desc(intakeForms.updatedAt));
}

export type FormUsage = { id: string; name: string; status: string };
export type FormWithUsage = { id: string; name: string; fields: FormField[]; updatedAt: Date; createdAt: Date; services: FormUsage[] };

/** Active forms with the (non-archived) services that ask them, for the settings list. */
export async function listFormsWithUsage(businessId: string): Promise<FormWithUsage[]> {
  const forms = await listForms(businessId);
  const used = forms.length
    ? await db
        .select({ id: services.id, name: services.name, status: services.status, formId: services.intakeFormId })
        .from(services)
        .where(
          and(
            eq(services.businessId, businessId),
            ne(services.status, "archived"),
            inArray(
              services.intakeFormId,
              forms.map((f) => f.id),
            ),
          ),
        )
        .orderBy(services.sortOrder, services.name)
    : [];
  return forms.map((f) => ({
    id: f.id,
    name: f.name,
    // Stored fields were validated on save; parse defensively so one bad row can't break the page.
    fields: formFieldsSchema.safeParse(f.fields).data ?? [],
    updatedAt: f.updatedAt,
    createdAt: f.createdAt,
    services: used.filter((s) => s.formId === f.id).map(({ id, name, status }) => ({ id, name, status })),
  }));
}

export async function getFormForEdit(businessId: string, id: string): Promise<FormWithUsage | null> {
  return (await listFormsWithUsage(businessId)).find((f) => f.id === id) ?? null;
}

export async function saveForm(m: Membership, actorUserId: string, input: z.infer<typeof formSchema>, id?: string) {
  check(m);
  if (!entitlements(m.plan).intakeForms) throw new AppError("forbidden", "Client questions aren't included in your plan.");
  let row;
  if (id) {
    // Archived forms are read-only: past bookings keep their own snapshot of each answer.
    [row] = await db
      .update(intakeForms)
      .set({ name: input.name, fields: input.fields })
      .where(and(eq(intakeForms.id, id), eq(intakeForms.businessId, m.businessId), isNull(intakeForms.archivedAt)))
      .returning();
    if (!row) throw notFound("That form");
  } else [row] = await db.insert(intakeForms).values({ businessId: m.businessId, name: input.name, fields: input.fields }).returning();
  await audit({ actorUserId, actorType: "business", businessId: m.businessId, action: id ? "form.updated" : "form.created", targetType: "form", targetId: row.id });
  return row;
}

/**
 * Archiving keeps answers on past bookings intact (they store a snapshot of
 * each question). Services that asked it stop asking — their new bookings have
 * no questions until another form is chosen. Returns those services.
 */
export async function archiveForm(m: Membership, actorUserId: string, id: string) {
  check(m);
  return db.transaction(async (tx) => {
    const [row] = await tx
      .update(intakeForms)
      .set({ archivedAt: new Date() })
      .where(and(eq(intakeForms.id, id), eq(intakeForms.businessId, m.businessId), isNull(intakeForms.archivedAt)))
      .returning();
    if (!row) throw notFound("That form");
    const detached = await tx
      .update(services)
      .set({ intakeFormId: null })
      .where(and(eq(services.intakeFormId, id), eq(services.businessId, m.businessId)))
      .returning({ id: services.id, name: services.name });
    await audit(
      { actorUserId, actorType: "business", businessId: m.businessId, action: "form.archived", targetType: "form", targetId: id, metadata: { detachedServices: detached.map((s) => s.id) } },
      tx,
    );
    return { services: detached };
  });
}
