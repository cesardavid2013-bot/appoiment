/**
 * Role-based access control for business staff. This module is the single
 * source of truth; server code checks permissions via server/authz.ts and the
 * UI only uses it to hide controls the server would reject anyway.
 */
export const PERMISSIONS = {
  "business.manage": "Edit business profile, booking rules and policies",
  "locations.manage": "Manage locations and opening hours",
  "team.manage": "Invite, edit and remove team members",
  "services.manage": "Create and edit services",
  "schedule.manage_all": "Edit everyone's schedule and time off",
  "schedule.manage_own": "Edit own schedule and time off",
  "appointments.view_all": "See all appointments",
  "appointments.manage_all": "Create, change and cancel any appointment",
  "appointments.manage_own": "Manage own appointments",
  "customers.view": "See customer list and history",
  "customers.manage": "Edit customers, tags and internal notes",
  "payments.view": "See payments and revenue",
  "payments.refund": "Issue refunds and record payments",
  "analytics.view": "See business analytics",
  "promotions.manage": "Create and edit promotions",
  "reviews.respond": "Reply to reviews",
  "messages.manage": "Read and reply to customer messages",
  "portfolio.manage": "Upload and manage portfolio",
} as const;

export type Permission = keyof typeof PERMISSIONS;
export type MemberRole = "owner" | "manager" | "receptionist" | "provider" | "custom";

export const ALL_PERMISSIONS = Object.keys(PERMISSIONS) as Permission[];

export const ROLE_PERMISSIONS: Record<Exclude<MemberRole, "custom">, readonly Permission[]> = {
  owner: ALL_PERMISSIONS,
  manager: ALL_PERMISSIONS.filter((p) => p !== "team.manage" && p !== "business.manage"),
  receptionist: [
    "appointments.view_all",
    "appointments.manage_all",
    "customers.view",
    "customers.manage",
    "messages.manage",
    "schedule.manage_own",
    "payments.view",
  ],
  provider: ["appointments.manage_own", "schedule.manage_own", "customers.view", "portfolio.manage"],
};

export const ROLE_LABELS: Record<MemberRole, { label: string; description: string }> = {
  owner: { label: "Owner", description: "Full control, including billing and team." },
  manager: { label: "Manager", description: "Runs day-to-day operations. Can't change team or business settings." },
  receptionist: { label: "Front desk", description: "Books and manages appointments for everyone." },
  provider: { label: "Professional", description: "Sees and manages their own appointments and schedule." },
  custom: { label: "Custom", description: "Pick exactly what this person can do." },
};

export function permissionsFor(role: MemberRole, custom: readonly string[] = []): Set<Permission> {
  if (role === "custom") return new Set(custom.filter((p): p is Permission => p in PERMISSIONS));
  return new Set(ROLE_PERMISSIONS[role]);
}

export function can(role: MemberRole, custom: readonly string[], permission: Permission): boolean {
  return permissionsFor(role, custom).has(permission);
}

/** Roles a member may assign: nobody can grant a role more powerful than their own. */
export function assignableRoles(actor: MemberRole): MemberRole[] {
  if (actor === "owner") return ["manager", "receptionist", "provider", "custom"];
  return [];
}
