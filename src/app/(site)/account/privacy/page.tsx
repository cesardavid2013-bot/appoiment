import type { Metadata } from "next";
import Link from "next/link";
import { AccountShell } from "@/components/account/account-shell";
import { DeleteAccountCard, ExportCard } from "@/components/account/privacy-settings";
import { eq, sql } from "drizzle-orm";
import { rich } from "@/i18n/rich";
import { getT } from "@/i18n/server";
import { db } from "@/server/db/client";
import { users } from "@/server/db/schema";
import { deletionCheck } from "@/server/services/account";
import { requireViewerPage } from "@/server/viewer";

export async function generateMetadata(): Promise<Metadata> {
  const t = await getT("account");
  return { title: t("sections.privacy.label"), robots: { index: false } };
}

export default async function PrivacyPage() {
  const viewer = await requireViewerPage("/account/privacy");
  const [t, check, [cred]] = await Promise.all([getT("account"), deletionCheck(viewer.id), db.select({ hasPassword: sql<boolean>`${users.passwordHash} is not null` }).from(users).where(eq(users.id, viewer.id))]);
  return (
    <AccountShell
      title={t("sections.privacy.label")}
      description={rich(t("privacy.description"), {
        link: (text) => (
          <Link href="/legal/privacy" className="font-medium text-ink underline underline-offset-4">
            {text}
          </Link>
        ),
      })}
    >
      <div className="space-y-6">
        <ExportCard />
        <DeleteAccountCard blockingBusinesses={check.blockingBusinesses} upcomingCount={check.upcomingCount} hasPassword={Boolean(cred?.hasPassword)} />
      </div>
    </AccountShell>
  );
}
