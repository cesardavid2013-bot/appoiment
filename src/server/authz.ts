import "server-only";
import { and, eq } from "drizzle-orm";
import { cookies } from "next/headers";
import { cache } from "react";
import { AppError, forbidden, notFound, unauthenticated } from "@/domain/errors";
import { permissionsFor, type MemberRole, type Permission } from "@/domain/permissions";
import { db } from "./db/client";
import { businessMembers, businesses } from "./db/schema";
import type { Viewer } from "./auth/session";

export const ACTIVE_BUSINESS_COOKIE = "kept_biz";

export type Membership = {
  memberId: string;
  businessId: string;
  businessName: string;
  businessSlug: string;
  businessStatus: "draft" | "active" | "suspended" | "closed";
  businessKind: "individual" | "business";
  timezone: string;
  currency: string;
  plan: "free" | "pro" | "business";
  role: MemberRole;
  permissions: Set<Permission>;
  displayName: string;
  isBookable: boolean;
};

export const listMemberships = cache(async (userId: string): Promise<Membership[]> => {
  const rows = await db
    .select({
      memberId: businessMembers.id,
      businessId: businesses.id,
      businessName: businesses.name,
      businessSlug: businesses.slug,
      businessStatus: businesses.status,
      businessKind: businesses.kind,
      timezone: businesses.timezone,
      currency: businesses.currency,
      plan: businesses.plan,
      role: businessMembers.role,
      customPermissions: businessMembers.customPermissions,
      displayName: businessMembers.displayName,
      isBookable: businessMembers.isBookable,
    })
    .from(businessMembers)
    .innerJoin(businesses, eq(businesses.id, businessMembers.businessId))
    .where(and(eq(businessMembers.userId, userId), eq(businessMembers.status, "active")))
    .orderBy(businessMembers.createdAt);
  return rows
    .filter((r) => r.businessStatus !== "closed")
    .map(({ customPermissions, ...r }) => ({ ...r, permissions: permissionsFor(r.role, customPermissions) }));
});

/** The business the viewer is currently operating (cookie-selected, validated against real memberships). */
export async function getActiveMembership(viewer: Viewer): Promise<Membership | null> {
  const memberships = await listMemberships(viewer.id);
  if (memberships.length === 0) return null;
  const jar = await cookies();
  const preferred = jar.get(ACTIVE_BUSINESS_COOKIE)?.value;
  return memberships.find((m) => m.businessId === preferred) ?? memberships[0];
}

/**
 * Loads the viewer's membership in a specific business and checks a permission.
 * Business ids from the client are never trusted on their own.
 */
export async function requireMember(viewer: Viewer | null, businessId: string, permission?: Permission | Permission[]) {
  if (!viewer) throw unauthenticated();
  const memberships = await listMemberships(viewer.id);
  const m = memberships.find((x) => x.businessId === businessId);
  if (!m) {
    if (viewer.platformRole === "admin") throw new AppError("forbidden", "Use the admin console to manage other businesses.");
    throw notFound("That business");
  }
  if (m.businessStatus === "suspended") throw forbidden("This business is suspended. Contact support for help.");
  if (permission) {
    const needed = Array.isArray(permission) ? permission : [permission];
    // Array = any of the listed permissions suffices.
    if (!needed.some((p) => m.permissions.has(p))) throw forbidden();
  }
  return m;
}

/** Resolves the active business for /pro routes and checks permission. */
export async function requireActiveMember(viewer: Viewer | null, permission?: Permission | Permission[]) {
  if (!viewer) throw unauthenticated();
  const m = await getActiveMembership(viewer);
  if (!m) throw new AppError("not_found", "You don't have a business yet.");
  return requireMember(viewer, m.businessId, permission);
}

export function requireAdmin(viewer: Viewer | null, level: "support" | "admin" = "admin") {
  if (!viewer) throw unauthenticated();
  const ok = level === "support" ? viewer.platformRole === "admin" || viewer.platformRole === "support" : viewer.platformRole === "admin";
  // 404 rather than 403: don't advertise the admin surface.
  if (!ok) throw notFound();
  return viewer;
}

/** For "own vs all" scoped permissions: which member's records may this viewer touch? */
export function appointmentScope(m: Membership): { all: boolean; memberId: string } {
  return { all: m.permissions.has("appointments.view_all") || m.permissions.has("appointments.manage_all"), memberId: m.memberId };
}
