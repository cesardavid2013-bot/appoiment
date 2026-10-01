import type { Metadata } from "next";
import { AdminShell } from "@/components/admin/admin-shell";
import { I18nProvider } from "@/i18n/client";
import { getClientMessages, getI18n } from "@/i18n/server";
import { requireAdminPage } from "@/server/admin-guard";
import { adminQueueCounts } from "@/server/services/admin";

export const metadata: Metadata = {
  title: { default: "Admin", template: "%s · Kept Admin" },
  robots: { index: false, follow: false },
};

export default async function AdminLayout({ children }: LayoutProps<"/admin">) {
  // Layouts don't re-run on client navigation, so every page re-checks too.
  const viewer = await requireAdminPage("support");
  const [counts, { messages: _all, ...i18n }, messages] = await Promise.all([
    adminQueueCounts(),
    getI18n(),
    getClientMessages("console"),
  ]);
  return (
    <I18nProvider value={{ ...i18n, messages }}>
      <AdminShell
        viewer={{
          name: viewer.name,
          email: viewer.email,
          role: viewer.platformRole === "admin" ? "admin" : "support",
        }}
        counts={counts}
      >
        {children}
      </AdminShell>
    </I18nProvider>
  );
}
