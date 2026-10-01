import "server-only";
import { Google, decodeIdToken, generateCodeVerifier, generateState } from "arctic";
import { and, eq } from "drizzle-orm";
import { db } from "../db/client";
import { oauthAccounts, users } from "../db/schema";
import { env, features } from "../env";

export function googleClient(): Google | null {
  if (!features.google) return null;
  return new Google(env.GOOGLE_CLIENT_ID!, env.GOOGLE_CLIENT_SECRET!, `${env.APP_URL}/api/auth/google/callback`);
}

export { generateCodeVerifier, generateState };

type GoogleClaims = { sub: string; email?: string; email_verified?: boolean; name?: string };

/** Finds or creates the user for a Google identity. Links by email only when Google verified it. */
export async function upsertGoogleUser(idToken: string): Promise<string> {
  const claims = decodeIdToken(idToken) as GoogleClaims;
  const [linked] = await db
    .select({ userId: oauthAccounts.userId })
    .from(oauthAccounts)
    .where(and(eq(oauthAccounts.provider, "google"), eq(oauthAccounts.providerAccountId, claims.sub)));
  if (linked) return linked.userId;

  const email = claims.email?.toLowerCase();
  return db.transaction(async (tx) => {
    let userId: string | undefined;
    if (email && claims.email_verified) {
      const [existing] = await tx.select({ id: users.id }).from(users).where(eq(users.email, email));
      userId = existing?.id;
      if (userId) await tx.update(users).set({ emailVerifiedAt: new Date() }).where(eq(users.id, userId));
    }
    if (!userId) {
      const [created] = await tx
        .insert(users)
        .values({
          name: claims.name?.slice(0, 80) || "Kept member",
          email: email && claims.email_verified ? email : null,
          emailVerifiedAt: claims.email_verified ? new Date() : null,
        })
        .returning({ id: users.id });
      userId = created.id;
    }
    await tx.insert(oauthAccounts).values({ userId, provider: "google", providerAccountId: claims.sub }).onConflictDoNothing();
    return userId;
  });
}
