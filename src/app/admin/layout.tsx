import type { Metadata } from "next";
import { AdminShell } from "@/components/admin/admin-shell";
import { requireAdminPage } from "@/server/admin-guard";
import { adminQueueCounts } from "@/server/services/admin";

export const metadata: Metadata = {
  title: { default: "Admin", template: "%s · Kept Admin" },
  robots: { index: false, follow: false },
};

export default async function AdminLayout({ children }: LayoutProps<"/admin">) {
  // Layouts don't re-run on client navigation, so every page re-checks too.
  const viewer = await requireAdminPage("support");
  const counts = await adminQueueCounts();
  return (
    <AdminShell viewer={{ name: viewer.name, email: viewer.email, role: viewer.platformRole === "admin" ? "admin" : "support" }} counts={counts}>
      {children}
    </AdminShell>
  );
}
