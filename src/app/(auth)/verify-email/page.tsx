import type { Metadata } from "next";
import { VerifyEmail } from "@/components/auth/auth-forms";
import { getT } from "@/i18n/server";

export async function generateMetadata(): Promise<Metadata> {
  const t = await getT("auth");
  return { title: t("meta.verify"), robots: { index: false } };
}

export default async function VerifyPage({ searchParams }: PageProps<"/verify-email">) {
  const { token } = await searchParams;
  return <VerifyEmail token={typeof token === "string" ? token : null} />;
}
