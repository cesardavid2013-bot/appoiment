import type { Permission } from "@/domain/permissions";

/** `key` names the label in the pro namespace (`nav.<key>`); `label` is the English fallback. */
export type ProNavItem = { href: string; key: string; label: string; icon: string; any?: Permission[]; group: "main" | "business" | "growth" | "settings" };

/** Single source of truth for console navigation; items are filtered by real permissions. */
export const PRO_NAV: ProNavItem[] = [
  { href: "/pro/today", key: "today", label: "Today", icon: "sun", group: "main" },
  { href: "/pro/calendar", key: "calendar", label: "Calendar", icon: "calendar", group: "main" },
  { href: "/pro/clients", key: "clients", label: "Clients", icon: "users", any: ["customers.view"], group: "main" },
  { href: "/pro/messages", key: "inbox", label: "Inbox", icon: "message", any: ["messages.manage"], group: "main" },
  { href: "/pro/services", key: "services", label: "Services", icon: "scissors", any: ["services.manage"], group: "business" },
  { href: "/pro/availability", key: "availability", label: "Hours & time off", icon: "clock", any: ["schedule.manage_own", "schedule.manage_all"], group: "business" },
  { href: "/pro/team", key: "team", label: "Team", icon: "team", any: ["team.manage"], group: "business" },
  { href: "/pro/work", key: "portfolio", label: "Portfolio", icon: "image", any: ["portfolio.manage"], group: "business" },
  { href: "/pro/reviews", key: "reviews", label: "Reviews", icon: "star", any: ["reviews.respond"], group: "business" },
  { href: "/pro/promote", key: "promote", label: "Promote", icon: "megaphone", any: ["promotions.manage"], group: "growth" },
  { href: "/pro/insights", key: "insights", label: "Insights", icon: "chart", any: ["analytics.view"], group: "growth" },
  { href: "/pro/settings", key: "settings", label: "Settings", icon: "settings", any: ["business.manage", "locations.manage", "services.manage"], group: "settings" },
];

/** English fallbacks; the shell translates them as `nav.groups.<group>`. */
export const GROUP_LABELS = { main: "", business: "Your business", growth: "Grow", settings: "" } as const;

export function visibleNav(perms: string[]) {
  return PRO_NAV.filter((i) => !i.any || i.any.some((p) => perms.includes(p)));
}
