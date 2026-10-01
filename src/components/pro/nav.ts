import type { Permission } from "@/domain/permissions";

export type ProNavItem = { href: string; label: string; icon: string; any?: Permission[]; group: "main" | "business" | "growth" | "settings" };

/** Single source of truth for console navigation; items are filtered by real permissions. */
export const PRO_NAV: ProNavItem[] = [
  { href: "/pro/today", label: "Today", icon: "sun", group: "main" },
  { href: "/pro/calendar", label: "Calendar", icon: "calendar", group: "main" },
  { href: "/pro/clients", label: "Clients", icon: "users", any: ["customers.view"], group: "main" },
  { href: "/pro/messages", label: "Inbox", icon: "message", any: ["messages.manage"], group: "main" },
  { href: "/pro/services", label: "Services", icon: "scissors", any: ["services.manage"], group: "business" },
  { href: "/pro/availability", label: "Hours & time off", icon: "clock", any: ["schedule.manage_own", "schedule.manage_all"], group: "business" },
  { href: "/pro/team", label: "Team", icon: "team", any: ["team.manage"], group: "business" },
  { href: "/pro/work", label: "Portfolio", icon: "image", any: ["portfolio.manage"], group: "business" },
  { href: "/pro/reviews", label: "Reviews", icon: "star", any: ["reviews.respond"], group: "business" },
  { href: "/pro/promote", label: "Promote", icon: "megaphone", any: ["promotions.manage"], group: "growth" },
  { href: "/pro/insights", label: "Insights", icon: "chart", any: ["analytics.view"], group: "growth" },
  { href: "/pro/settings", label: "Settings", icon: "settings", any: ["business.manage", "locations.manage"], group: "settings" },
];

export const GROUP_LABELS = { main: "", business: "Your business", growth: "Grow", settings: "" } as const;

export function visibleNav(perms: string[]) {
  return PRO_NAV.filter((i) => !i.any || i.any.some((p) => perms.includes(p)));
}
