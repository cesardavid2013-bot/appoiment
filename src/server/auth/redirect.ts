import { safeRelativePath } from "@/domain/safe-path";

/** Only same-site relative paths are allowed as post-auth destinations (prevents open redirects). */
export function safeNext(next: string | null | undefined, fallback = "/"): string {
  return safeRelativePath(next, fallback);
}
