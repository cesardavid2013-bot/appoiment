import type { Metadata } from "next";
import { BusinessHub } from "@/components/pro/business-hub";
import { listMemberships } from "@/server/authz";
import { proPage } from "@/server/pro-page";

export const metadata: Metadata = { title: "Business" };

/** Mobile "Business" tab. On desktop the sidebar already lists all of this, but the page still works there. */
export default async function BusinessHubPage() {
  const { viewer, m } = await proPage();
  const all = await listMemberships(viewer.id);
  return (
    <BusinessHub
      business={{ id: m.businessId, name: m.businessName, slug: m.businessSlug, status: m.businessStatus, role: m.role }}
      businesses={all.map((x) => ({ id: x.businessId, name: x.businessName, slug: x.businessSlug, status: x.businessStatus, role: x.role }))}
      perms={[...m.permissions]}
      user={{ name: viewer.name, email: viewer.email }}
    />
  );
}
