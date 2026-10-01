import type { Metadata } from "next";
import { AccountShell } from "@/components/account/account-shell";
import { DevicesCard, EmailStatus, PasswordForm } from "@/components/account/security-settings";
import { getT } from "@/i18n/server";
import { getAccount, otherSessionCount } from "@/server/services/account";
import { requireViewerPage } from "@/server/viewer";

export async function generateMetadata(): Promise<Metadata> {
  const t = await getT("account");
  return { title: t("sections.security.label"), robots: { index: false } };
}

export default async function SecurityPage() {
  const viewer = await requireViewerPage("/account/security");
  const [a, others, t] = await Promise.all([getAccount(viewer.id), otherSessionCount(viewer), getT("account")]);
  return (
    <AccountShell title={t("sections.security.label")} description={t("security.description")}>
      <div className="space-y-6">
        <EmailStatus email={a.email} verified={a.emailVerifiedAt != null} />
        <PasswordForm hasPassword={a.hasPassword} />
        <DevicesCard others={others} />
      </div>
    </AccountShell>
  );
}
