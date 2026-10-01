import type { Metadata } from "next";
import Link from "next/link";
import { AccountShell } from "@/components/account/account-shell";
import { DeleteAccountCard, ExportCard } from "@/components/account/privacy-settings";
import { deletionCheck } from "@/server/services/account";
import { requireViewerPage } from "@/server/viewer";

export const metadata: Metadata = { title: "Privacy & data", robots: { index: false } };

export default async function PrivacyPage() {
  const viewer = await requireViewerPage("/account/privacy");
  const check = await deletionCheck(viewer.id);
  return (
    <AccountShell
      title="Privacy & data"
      description={
        <>
          Your data is yours. Read how we use it in our{" "}
          <Link href="/legal/privacy" className="font-medium text-ink underline underline-offset-4">
            privacy policy
          </Link>
          .
        </>
      }
    >
      <div className="space-y-6">
        <ExportCard />
        <DeleteAccountCard blockingBusinesses={check.blockingBusinesses} upcomingCount={check.upcomingCount} />
      </div>
    </AccountShell>
  );
}
