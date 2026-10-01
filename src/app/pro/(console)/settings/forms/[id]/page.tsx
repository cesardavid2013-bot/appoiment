import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { FormBuilder } from "@/components/pro/form-builder";
import { entitlements } from "@/domain/plans";
import { getT } from "@/i18n/server";
import { proPage } from "@/server/pro-page";
import { getFormForEdit } from "@/server/services/forms-admin";
import { FormFrame } from "../form-frame";

export async function generateMetadata(): Promise<Metadata> {
  const t = await getT("proSettings");
  return { title: t("forms.editForm") };
}

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

export default async function EditFormPage({ params }: PageProps<"/pro/settings/forms/[id]">) {
  const { m } = await proPage("services.manage");
  const { id } = await params;
  if (!UUID.test(id) || !entitlements(m.plan).intakeForms) notFound();
  const form = await getFormForEdit(m.businessId, id);
  if (!form) notFound();
  return (
    <FormFrame>
      {/* Remount after a save so the builder's baseline matches what's stored. */}
      <FormBuilder key={form.updatedAt.toISOString()} formId={form.id} initial={{ name: form.name, fields: form.fields }} usedBy={form.services} />
    </FormFrame>
  );
}
