import type { Permission } from "@/domain/permissions";

export type SettingsSection = { href: string; label: string; description: string; permission: Permission };

/** Every settings page, in the order owners usually need them. */
export const SETTINGS_SECTIONS: SettingsSection[] = [
  { href: "/pro/settings/profile", label: "Business profile", description: "Name, photos, about, contact and social links.", permission: "business.manage" },
  { href: "/pro/settings/locations", label: "Locations", description: "Where you work: a shop, the client's place, or online.", permission: "locations.manage" },
  { href: "/pro/settings/booking", label: "Booking rules", description: "Instant or approved bookings, notice, reminders.", permission: "business.manage" },
  { href: "/pro/settings/policies", label: "Cancellations & fees", description: "Cancellation window, no-show fees, tax.", permission: "business.manage" },
  { href: "/pro/settings/payments", label: "Payments", description: "Take deposits and card payments online.", permission: "business.manage" },
  { href: "/pro/settings/forms", label: "Client questions", description: "Intake forms clients fill in when they book.", permission: "services.manage" },
  { href: "/pro/settings/link", label: "Booking link", description: "Your web address, QR code and going live.", permission: "business.manage" },
  { href: "/pro/settings/verification", label: "Verification", description: "Get the verified badge on your profile.", permission: "business.manage" },
];
