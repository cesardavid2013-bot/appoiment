import "server-only";
import { sql } from "drizzle-orm";
import { AppError } from "@/domain/errors";
import { db } from "./db/client";
import { rateLimits } from "./db/schema";

export type RateRule = { limit: number; windowSeconds: number };

export const RATE_RULES = {
  // Per-IP limits allow for carrier NAT, where many people share one address.
  login: { limit: 40, windowSeconds: 15 * 60 },
  // Per-account: enough for genuine retries, low enough to stop guessing one password.
  loginAccount: { limit: 15, windowSeconds: 15 * 60 },
  passwordCheck: { limit: 10, windowSeconds: 60 * 60 },
  promo: { limit: 30, windowSeconds: 10 * 60 },
  assistant: { limit: 40, windowSeconds: 10 * 60 },
  signup: { limit: 20, windowSeconds: 60 * 60 },
  passwordReset: { limit: 5, windowSeconds: 60 * 60 },
  booking: { limit: 20, windowSeconds: 60 * 60 },
  message: { limit: 60, windowSeconds: 10 * 60 },
  upload: { limit: 60, windowSeconds: 60 * 60 },
  review: { limit: 10, windowSeconds: 60 * 60 },
  report: { limit: 20, windowSeconds: 24 * 60 * 60 },
  search: { limit: 240, windowSeconds: 60 },
  slots: { limit: 240, windowSeconds: 60 },
  support: { limit: 10, windowSeconds: 60 * 60 },
  invite: { limit: 30, windowSeconds: 60 * 60 },
  geocode: { limit: 60, windowSeconds: 60 },
} satisfies Record<string, RateRule>;

/**
 * Fixed-window counter in Postgres (atomic upsert). Good enough for abuse
 * protection on a single region; swap for Redis if traffic demands it.
 */
export async function rateLimit(bucket: keyof typeof RATE_RULES, key: string): Promise<void> {
  const rule = RATE_RULES[bucket];
  const windowMs = rule.windowSeconds * 1000;
  const windowStart = new Date(Math.floor(Date.now() / windowMs) * windowMs);
  const fullKey = `${bucket}:${key}`;
  const [row] = await db
    .insert(rateLimits)
    .values({ key: fullKey, windowStart, count: 1 })
    .onConflictDoUpdate({ target: [rateLimits.key, rateLimits.windowStart], set: { count: sql`${rateLimits.count} + 1` } })
    .returning({ count: rateLimits.count });
  if (row.count > rule.limit) {
    throw new AppError("rate_limited", "You're doing that a little too often. Please wait a moment and try again.");
  }
}

export async function pruneRateLimits() {
  await db.execute(sql`delete from rate_limits where window_start < now() - interval '2 days'`);
}
