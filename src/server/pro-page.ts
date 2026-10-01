import "server-only";
import { notFound, redirect } from "next/navigation";
import type { Permission } from "@/domain/permissions";
import { getActiveMembership, type Membership } from "./authz";
import { getViewer, type Viewer } from "./auth/session";

/** For console pages: the viewer + active membership, enforcing a permission server-side. */
export async function proPage(permission?: Permission | Permission[]): Promise<{ viewer: Viewer; m: Membership }> {
  const viewer = await getViewer();
  if (!viewer) redirect("/login?next=/pro");
  const m = await getActiveMembership(viewer);
  if (!m) redirect("/pro/onboarding");
  if (permission) {
    const need = Array.isArray(permission) ? permission : [permission];
    if (!need.some((p) => m.permissions.has(p))) notFound();
  }
  return { viewer, m };
}
