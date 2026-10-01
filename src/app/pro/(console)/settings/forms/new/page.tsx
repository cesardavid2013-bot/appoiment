import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { FormBuilder } from "@/components/pro/form-builder";
import { entitlements } from "@/domain/plans";
import { getT } from "@/i18n/server";
import { proPage } from "@/server/pro-page";
import { FormFrame } from "../form-frame";

export async function generateMetadata(): Promise<Metadata> {
  const t = await getT("proSettings");
  return { title: t("forms.newForm") };
}

export default async function NewFormPage() {
  const { m } = await proPage("services.manage");
  if (!entitlements(m.plan).intakeForms) notFound();
  return (
    <FormFrame>
      <FormBuilder initial={{ name: "", fields: [] }} usedBy={[]} />
    </FormFrame>
  );
}
