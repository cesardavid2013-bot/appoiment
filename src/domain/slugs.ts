/** Public URL handles: kept.app/<slug>. Must never collide with app routes. */
export const RESERVED_SLUGS = new Set([
  "about", "account", "admin", "api", "app", "auth", "billing", "blog", "book", "booking", "bookings", "business",
  "businesses", "careers", "categories", "category", "contact", "dashboard", "explore", "favorites", "for-business",
  "forgot-password", "help", "home", "invite", "join", "kept", "legal", "login", "logout", "media", "messages",
  "new", "notifications", "onboarding", "pricing", "privacy", "pro", "profile", "reset-password", "search",
  "settings", "signin", "signup", "sitemap", "static", "status", "support", "terms", "verify-email", "www",
  "_next", "favicon", "robots", "manifest",
]);

export function slugify(input: string): string {
  return input
    .normalize("NFKD")
    .replace(/[̀-ͯ]/g, "")
    .toLowerCase()
    .replace(/&/g, " and ")
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "")
    .slice(0, 50)
    .replace(/-+$/g, "");
}

export function isValidSlug(slug: string): boolean {
  return /^[a-z0-9](?:[a-z0-9-]{1,48}[a-z0-9])$/.test(slug) && !RESERVED_SLUGS.has(slug) && !slug.includes("--");
}

/** Normalises text for search indexing/querying: lower-case, accents stripped, collapsed whitespace. */
export function normalizeSearch(input: string): string {
  return input
    .normalize("NFKD")
    .replace(/[̀-ͯ]/g, "")
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, " ")
    .trim()
    .replace(/\s+/g, " ");
}
