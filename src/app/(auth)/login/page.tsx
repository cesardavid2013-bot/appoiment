import type { Metadata } from "next";
import { redirect } from "next/navigation";
import { Suspense } from "react";
import { LoginForm } from "@/components/auth/auth-forms";
import { getViewer } from "@/server/auth/session";
import { safeNext } from "@/server/auth/redirect";
import { features } from "@/server/env";

export const metadata: Metadata = { title: "Sign in", robots: { index: false } };

export default async function LoginPage({ searchParams }: PageProps<"/login">) {
  const sp = await searchParams;
  if (await getViewer()) redirect(safeNext(typeof sp.next === "string" ? sp.next : null));
  return (
    <Suspense>
      <LoginForm google={features.google} />
    </Suspense>
  );
}
