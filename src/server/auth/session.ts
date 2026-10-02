import "server-only";
import { and, eq, gt, lt, ne } from "drizzle-orm";
import { cookies } from "next/headers";
import { cache } from "react";
import { db } from "../db/client";
import { sessions, users } from "../db/schema";
import { secureCookies } from "../env";
import { randomToken, sha256 } from "../crypto";
import { ipHash, userAgent } from "../request";

export const SESSION_COOKIE = secureCookies ? "__Host-kept_session" : "kept_session";
const SESSION_DAYS = 30;
const DAY = 86_400_000;

export type Viewer = {
  id: string;
  name: string;
  email: string | null;
  emailVerified: boolean;
  platformRole: "user" | "support" | "admin";
  avatarMediaId: string | null;
  timezone: string | null;
  sessionId: string;
};

export async function createSession(userId: string): Promise<void> {
  const token = randomToken(32);
  const expiresAt = new Date(Date.now() + SESSION_DAYS * DAY);
  await db.insert(sessions).values({
    id: sha256(token),
    userId,
    expiresAt,
    userAgent: await userAgent(),
    ipHash: await ipHash(),
  });
  await db.update(users).set({ lastLoginAt: new Date() }).where(eq(users.id, userId));
  const jar = await cookies();
  jar.set(SESSION_COOKIE, token, {
    httpOnly: true,
    secure: secureCookies,
    sameSite: "lax",
    path: "/",
    expires: expiresAt,
  });
}

/**
 * Resolves the signed-in user for this request (memoised per request).
 * Sessions slide forward when used, and are rejected for suspended/deleted users.
 */
export const getViewer = cache(async (): Promise<Viewer | null> => {
  const jar = await cookies();
  const token = jar.get(SESSION_COOKIE)?.value;
  if (!token || token.length > 100) return null;
  const sessionId = sha256(token);
  const [row] = await db
    .select({
      sessionId: sessions.id,
      expiresAt: sessions.expiresAt,
      lastSeenAt: sessions.lastSeenAt,
      id: users.id,
      name: users.name,
      email: users.email,
      emailVerifiedAt: users.emailVerifiedAt,
      platformRole: users.platformRole,
      avatarMediaId: users.avatarMediaId,
      timezone: users.timezone,
      status: users.status,
    })
    .from(sessions)
    .innerJoin(users, eq(users.id, sessions.userId))
    .where(and(eq(sessions.id, sessionId), gt(sessions.expiresAt, new Date())))
    .limit(1);
  if (!row || row.status !== "active") return null;

  const now = Date.now();
  if (now - row.lastSeenAt.getTime() > 60 * 60 * 1000) {
    const extend = row.expiresAt.getTime() - now < (SESSION_DAYS / 2) * DAY;
    await db
      .update(sessions)
      .set({ lastSeenAt: new Date(), ...(extend ? { expiresAt: new Date(now + SESSION_DAYS * DAY) } : {}) })
      .where(eq(sessions.id, sessionId));
  }

  return {
    id: row.id,
    name: row.name,
    email: row.email,
    emailVerified: row.emailVerifiedAt != null,
    platformRole: row.platformRole,
    avatarMediaId: row.avatarMediaId,
    timezone: row.timezone,
    sessionId: row.sessionId,
  };
});

export async function destroyCurrentSession(): Promise<void> {
  const jar = await cookies();
  const token = jar.get(SESSION_COOKIE)?.value;
  if (token) await db.delete(sessions).where(eq(sessions.id, sha256(token)));
  jar.delete(SESSION_COOKIE);
}

/** Signs a user out everywhere (password change/reset, account suspension). */
export async function destroyAllSessions(userId: string, exceptSessionId?: string): Promise<void> {
  await db
    .delete(sessions)
    .where(exceptSessionId ? and(eq(sessions.userId, userId), ne(sessions.id, exceptSessionId)) : eq(sessions.userId, userId));
}

export async function pruneExpiredSessions() {
  await db.delete(sessions).where(lt(sessions.expiresAt, new Date()));
}
