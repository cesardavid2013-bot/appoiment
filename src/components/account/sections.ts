import { Bell, KeyRound, MapPin, ShieldCheck, UserRound, type LucideIcon } from "lucide-react";

export type AccountSection = { href: string; label: string; description: string; icon: LucideIcon };

export const ACCOUNT_SECTIONS: AccountSection[] = [
  { href: "/account/profile", label: "Profile", description: "Name, photo, phone and time zone", icon: UserRound },
  { href: "/account/security", label: "Login & security", description: "Password, email confirmation and devices", icon: KeyRound },
  { href: "/account/notifications", label: "Notification settings", description: "Choose what we email or text you about", icon: Bell },
  { href: "/account/addresses", label: "Saved addresses", description: "For professionals who come to you", icon: MapPin },
  { href: "/account/privacy", label: "Privacy & data", description: "Download your data or delete your account", icon: ShieldCheck },
];
