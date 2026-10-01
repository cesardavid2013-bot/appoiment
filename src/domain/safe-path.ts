/**
 * Post-auth destinations must be same-origin relative paths. Browsers strip
 * tabs/newlines and treat "\" like "/", so "/\t/evil.com" or "/\evil.com"
 * would navigate off-site — reject control characters and backslashes outright,
 * then confirm the path resolves to our own origin.
 */
export function safeRelativePath(next: string | null | undefined, fallback = "/"): string {
  if (!next || typeof next !== "string" || next.length > 500) return fallback;
  if (!next.startsWith("/") || next.startsWith("//")) return fallback;
  if (/[\u0000-\u001f\u007f\\]/.test(next)) return fallback;
  if (next.startsWith("/api/")) return fallback;
  try {
    const base = "https://origin.invalid";
    const url = new URL(next, base);
    if (url.origin !== base) return fallback;
    return url.pathname + url.search + url.hash;
  } catch {
    return fallback;
  }
}
