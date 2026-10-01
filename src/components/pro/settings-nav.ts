import type { Permission } from "@/domain/permissions";

/** Labels and descriptions live in messages under `proSettings.nav.sections.<key>`. */
export type SettingsSection = { href: string; key: string; permission: Permission };

/** Every settings page, in the order owners usually need them. */
export const SETTINGS_SECTIONS: SettingsSection[] = [
  { href: "/pro/settings/profile", key: "profile", permission: "business.manage" },
  { href: "/pro/settings/appearance", key: "appearance", permission: "business.manage" },
  { href: "/pro/settings/locations", key: "locations", permission: "locations.manage" },
  { href: "/pro/settings/booking", key: "booking", permission: "business.manage" },
  { href: "/pro/settings/policies", key: "policies", permission: "business.manage" },
  { href: "/pro/settings/payments", key: "payments", permission: "business.manage" },
  { href: "/pro/settings/forms", key: "forms", permission: "services.manage" },
  { href: "/pro/settings/link", key: "link", permission: "business.manage" },
  { href: "/pro/settings/verification", key: "verification", permission: "business.manage" },
];
