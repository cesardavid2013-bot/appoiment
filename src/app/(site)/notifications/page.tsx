import type { Metadata } from "next";
import { connection } from "next/server";
import { NotificationList } from "@/components/account/notification-list";
import { PageHeader } from "@/components/ui/misc";
import { getT } from "@/i18n/server";
import { listNotifications } from "@/server/services/engagement";
import { requireViewerPage } from "@/server/viewer";

export async function generateMetadata(): Promise<Metadata> {
  const t = await getT("account");
  return { title: t("notificationList.title"), robots: { index: false } };
}

/** Request time, handed to the client so relative times hydrate without a mismatch. */
async function requestTime() {
  await connection();
  return Date.now();
}

export default async function NotificationsPage() {
  const viewer = await requireViewerPage("/notifications");
  const [rows, serverNow, t] = await Promise.all([listNotifications(viewer.id), requestTime(), getT("account")]);
  const items = rows.map((n) => ({ id: n.id, type: n.type, title: n.title, body: n.body, href: n.href, readAt: n.readAt?.toISOString() ?? null, createdAt: n.createdAt.toISOString() }));

  return (
    <div className="mx-auto max-w-2xl px-4 pt-10 sm:px-6">
      <PageHeader title={t("notificationList.title")} />
      <NotificationList initial={items} serverNow={serverNow} fallbackZone={viewer.timezone ?? "UTC"} />
    </div>
  );
}
