import type { Metadata } from "next";
import Link from "next/link";
import { ResetForm } from "@/components/auth/auth-forms";

export const metadata: Metadata = { title: "Choose a new password", robots: { index: false } };

export default async function ResetPage({ searchParams }: PageProps<"/reset-password">) {
  const { token } = await searchParams;
  if (typeof token !== "string" || token.length < 10)
    return (
      <div>
        <h1 className="font-display text-[34px] leading-tight text-ink">This link isn’t valid</h1>
        <p className="mt-2 text-[15px] text-ink-3">Request a new reset link and try again.</p>
        <Link href="/forgot-password" className="mt-6 inline-block text-sm font-medium text-ink underline underline-offset-4">
          Request a new link
        </Link>
      </div>
    );
  return <ResetForm token={token} />;
}
