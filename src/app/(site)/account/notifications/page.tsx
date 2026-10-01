import type { Metadata } from "next";
import { AccountShell } from "@/components/account/account-shell";
import { NotificationSettings } from "@/components/account/notification-settings";
import { listMemberships } from "@/server/authz";
import { features } from "@/server/env";
import { getAccount } from "@/server/services/account";
import { requireViewerPage } from "@/server/viewer";

export const metadata: Metadata = { title: "Notification settings", robots: { index: false } };

export default async function NotificationSettingsPage() {
  const viewer = await requireViewerPage("/account/notifications");
  const [a, memberships] = await Promise.all([getAccount(viewer.id), listMemberships(viewer.id)]);
  return (
    <AccountShell title="Notification settings" description="Choose how we keep you posted. We never send more than we need to.">
      <NotificationSettings initial={a.prefs} smsEnabled={features.sms} hasPhone={Boolean(a.phone)} showBusiness={memberships.length > 0} />
    </AccountShell>
  );
}
