import type { Metadata } from "next";
import { VerifyEmail } from "@/components/auth/auth-forms";

export const metadata: Metadata = { title: "Confirm email", robots: { index: false } };

export default async function VerifyPage({ searchParams }: PageProps<"/verify-email">) {
  const { token } = await searchParams;
  return <VerifyEmail token={typeof token === "string" ? token : null} />;
}
