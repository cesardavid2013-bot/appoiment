import "server-only";
import { notFound } from "next/navigation";
import { getViewer, type Viewer } from "./auth/session";

export type AdminLevel = "support" | "admin";

export function hasAdminLevel(role: Viewer["platformRole"] | undefined, level: AdminLevel): boolean {
  if (level === "support") return role === "admin" || role === "support";
  return role === "admin";
}

/**
 * Server-side gate for every /admin page and layout. Anyone without the
 * required platform role (including signed-out visitors) gets a plain 404 so
 * the console's existence is never advertised.
 */
export async function requireAdminPage(level: AdminLevel = "admin"): Promise<Viewer> {
  const viewer = await getViewer();
  if (!viewer || !hasAdminLevel(viewer.platformRole, level)) notFound();
  return viewer;
}
