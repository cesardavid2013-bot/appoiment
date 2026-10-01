/** Message files per language live in src/i18n/messages/<locale>/<namespace>.json. */
export const NAMESPACES = ["common", "categories", "home", "search", "business", "profile", "booking", "bookings", "auth", "assistant", "account", "messages", "support", "legal", "marketing", "pro", "admin", "email"] as const;
export type Namespace = (typeof NAMESPACES)[number];
