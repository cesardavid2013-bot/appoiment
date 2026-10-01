import "server-only";
import { redirect } from "next/navigation";
import { getViewer, type Viewer } from "./auth/session";
import { listMemberships } from "./authz";

/** Shell data for layouts — never includes anything beyond what the header shows. */
export async function shellViewer() {
  const v = await getViewer();
  if (!v) return null;
  const memberships = await listMemberships(v.id);
  return { id: v.id, name: v.name, email: v.email, hasBusiness: memberships.length > 0, isAdmin: v.platformRole === "admin" || v.platformRole === "support" };
}

/** For pages that require sign-in: redirects to login and comes back afterwards. */
export async function requireViewerPage(next: string): Promise<Viewer> {
  const v = await getViewer();
  if (!v) redirect(`/login?next=${encodeURIComponent(next)}`);
  return v;
}
