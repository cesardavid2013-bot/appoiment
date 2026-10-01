import type { Metadata } from "next";
import { AccountShell } from "@/components/account/account-shell";
import { NotificationSettings } from "@/components/account/notification-settings";
import { getT } from "@/i18n/server";
import { listMemberships } from "@/server/authz";
import { features } from "@/server/env";
import { getAccount } from "@/server/services/account";
import { requireViewerPage } from "@/server/viewer";

export async function generateMetadata(): Promise<Metadata> {
  const t = await getT("account");
  return { title: t("sections.notifications.label"), robots: { index: false } };
}

export default async function NotificationSettingsPage() {
  const viewer = await requireViewerPage("/account/notifications");
  const [a, memberships, t] = await Promise.all([getAccount(viewer.id), listMemberships(viewer.id), getT("account")]);
  return (
    <AccountShell title={t("sections.notifications.label")} description={t("notifications.description")}>
      <NotificationSettings initial={a.prefs} smsEnabled={features.sms} hasPhone={Boolean(a.phone)} showBusiness={memberships.length > 0} />
    </AccountShell>
  );
}
