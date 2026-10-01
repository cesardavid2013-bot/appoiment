import type { Metadata } from "next";
import { ForgotForm } from "@/components/auth/auth-forms";
import { getT } from "@/i18n/server";

export async function generateMetadata(): Promise<Metadata> {
  const t = await getT("auth");
  return { title: t("meta.forgot"), robots: { index: false } };
}

export default function ForgotPage() {
  return <ForgotForm />;
}
