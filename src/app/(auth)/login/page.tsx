import type { Metadata } from "next";
import { redirect } from "next/navigation";
import { Suspense } from "react";
import { LoginForm } from "@/components/auth/auth-forms";
import { getT } from "@/i18n/server";
import { getViewer } from "@/server/auth/session";
import { safeNext } from "@/server/auth/redirect";
import { features } from "@/server/env";

export async function generateMetadata(): Promise<Metadata> {
  const t = await getT("auth");
  return { title: t("meta.login"), robots: { index: false } };
}

export default async function LoginPage({ searchParams }: PageProps<"/login">) {
  const sp = await searchParams;
  if (await getViewer()) redirect(safeNext(typeof sp.next === "string" ? sp.next : null));
  return (
    <Suspense>
      <LoginForm google={features.google} />
    </Suspense>
  );
}
