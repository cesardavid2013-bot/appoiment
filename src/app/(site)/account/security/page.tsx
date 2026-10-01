import type { Metadata } from "next";
import { AccountShell } from "@/components/account/account-shell";
import { DevicesCard, EmailStatus, PasswordForm } from "@/components/account/security-settings";
import { getAccount, otherSessionCount } from "@/server/services/account";
import { requireViewerPage } from "@/server/viewer";

export const metadata: Metadata = { title: "Login & security", robots: { index: false } };

export default async function SecurityPage() {
  const viewer = await requireViewerPage("/account/security");
  const [a, others] = await Promise.all([getAccount(viewer.id), otherSessionCount(viewer)]);
  return (
    <AccountShell title="Login & security" description="Keep your account secure and in your hands.">
      <div className="space-y-6">
        <EmailStatus email={a.email} verified={a.emailVerifiedAt != null} />
        <PasswordForm hasPassword={a.hasPassword} />
        <DevicesCard others={others} />
      </div>
    </AccountShell>
  );
}
