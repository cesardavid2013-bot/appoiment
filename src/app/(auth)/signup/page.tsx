import type { Metadata } from "next";
import { redirect } from "next/navigation";
import { Suspense } from "react";
import { SignupForm } from "@/components/auth/auth-forms";
import { getViewer } from "@/server/auth/session";
import { safeNext } from "@/server/auth/redirect";
import { features } from "@/server/env";

export const metadata: Metadata = { title: "Create an account", robots: { index: false } };

export default async function SignupPage({ searchParams }: PageProps<"/signup">) {
  const sp = await searchParams;
  const intent = typeof sp.intent === "string" ? sp.intent : undefined;
  if (await getViewer()) redirect(intent === "pro" ? "/pro/onboarding" : safeNext(typeof sp.next === "string" ? sp.next : null));
  return (
    <Suspense>
      <SignupForm google={features.google} intent={intent} />
    </Suspense>
  );
}
