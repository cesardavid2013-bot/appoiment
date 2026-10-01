import { Bell, KeyRound, MapPin, ShieldCheck, UserRound, type LucideIcon } from "lucide-react";

/** Settings sections; labels live in the account namespace under `sections.<key>`. */
export type AccountSection = { href: string; key: "profile" | "security" | "notifications" | "addresses" | "privacy"; icon: LucideIcon };

export const ACCOUNT_SECTIONS: AccountSection[] = [
  { href: "/account/profile", key: "profile", icon: UserRound },
  { href: "/account/security", key: "security", icon: KeyRound },
  { href: "/account/notifications", key: "notifications", icon: Bell },
  { href: "/account/addresses", key: "addresses", icon: MapPin },
  { href: "/account/privacy", key: "privacy", icon: ShieldCheck },
];
