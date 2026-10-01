import type { Metadata } from "next";
import Link from "next/link";
import { ResetForm } from "@/components/auth/auth-forms";
import { getT } from "@/i18n/server";

export async function generateMetadata(): Promise<Metadata> {
  const t = await getT("auth");
  return { title: t("meta.reset"), robots: { index: false } };
}

export default async function ResetPage({ searchParams }: PageProps<"/reset-password">) {
  const { token } = await searchParams;
  if (typeof token !== "string" || token.length < 10) {
    const t = await getT("auth");
    return (
      <div>
        <h1 className="font-display text-[34px] leading-tight text-ink">{t("reset.invalidTitle")}</h1>
        <p className="mt-2 text-[15px] text-ink-3">{t("reset.invalidBody")}</p>
        <Link href="/forgot-password" className="mt-6 inline-block text-sm font-medium text-ink underline underline-offset-4">
          {t("reset.requestNew")}
        </Link>
      </div>
    );
  }
  return <ResetForm token={token} />;
}
