import { redirect } from "next/navigation";
import { ProShell } from "@/components/pro/pro-shell";
import { SuspendedNotice } from "@/components/pro/suspended-notice";
import { getActiveMembership, listMemberships } from "@/server/authz";
import { getViewer } from "@/server/auth/session";

export default async function ConsoleLayout({ children }: LayoutProps<"/pro">) {
  const viewer = (await getViewer())!;
  const m = await getActiveMembership(viewer);
  if (!m) redirect("/pro/onboarding");
  const all = await listMemberships(viewer.id);
  if (m.businessStatus === "suspended") {
    const others = all.filter((x) => x.businessId !== m.businessId && x.businessStatus !== "suspended");
    return <SuspendedNotice name={m.businessName} others={others.map((o) => ({ id: o.businessId, name: o.businessName }))} />;
  }
  return (
    <ProShell
      business={{ id: m.businessId, name: m.businessName, slug: m.businessSlug, status: m.businessStatus, role: m.role }}
      businesses={all.map((x) => ({ id: x.businessId, name: x.businessName, slug: x.businessSlug, status: x.businessStatus, role: x.role }))}
      perms={[...m.permissions]}
      user={{ name: viewer.name, email: viewer.email }}
    >
      {children}
    </ProShell>
  );
}
