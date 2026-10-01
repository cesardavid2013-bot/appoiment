/** Only same-site relative paths are allowed as post-auth destinations (prevents open redirects). */
export function safeNext(next: string | null | undefined, fallback = "/"): string {
  if (!next || typeof next !== "string") return fallback;
  if (!next.startsWith("/") || next.startsWith("//") || next.startsWith("/\\") || next.includes("\n")) return fallback;
  if (next.startsWith("/api/")) return fallback;
  return next.slice(0, 500);
}
