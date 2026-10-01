import "server-only";
import { and, eq, gt, isNull } from "drizzle-orm";
import { z } from "zod";
import { AppError } from "@/domain/errors";
import { db } from "../db/client";
import { authTokens, users } from "../db/schema";
import { burnPasswordCheck, hashPassword, passwordProblem, verifyPassword } from "../auth/password";
import { createSession, destroyAllSessions, type Viewer } from "../auth/session";
import { randomToken, sha256 } from "../crypto";
import { sendSystemEmail } from "../notify";
import { rateLimit } from "../rate-limit";
import { audit } from "../audit";
import { ipHash } from "../request";

export const signupSchema = z.object({
  name: z.string().trim().min(1, "Tell us your name").max(80),
  email: z.string().trim().toLowerCase().email("Enter a valid email address").max(254),
  password: z.string().min(1, "Choose a password").max(200),
  timezone: z.string().max(64).optional(),
});

export const loginSchema = z.object({
  email: z.string().trim().toLowerCase().email("Enter a valid email address"),
  password: z.string().min(1, "Enter your password").max(200),
});

const VERIFY_TTL_MS = 3 * 24 * 3600_000;
const RESET_TTL_MS = 60 * 60_000;

export async function signup(input: z.infer<typeof signupSchema>) {
  const ip = await ipHash();
  await rateLimit("signup", ip);
  const problem = passwordProblem(input.password, input.email);
  if (problem) throw new AppError("validation", problem, { fields: { password: problem } });

  const existing = await db.select({ id: users.id }).from(users).where(eq(users.email, input.email)).limit(1);
  if (existing.length) {
    throw new AppError("conflict", "An account with this email already exists. Try signing in instead.", {
      fields: { email: "This email is already registered." },
    });
  }
  const passwordHash = await hashPassword(input.password);
  const [user] = await db
    .insert(users)
    .values({ name: input.name, email: input.email, passwordHash, timezone: input.timezone ?? null })
    .onConflictDoNothing()
    .returning({ id: users.id, email: users.email, name: users.name });
  if (!user) throw new AppError("conflict", "An account with this email already exists. Try signing in instead.");

  await sendVerification(user.id, user.email!, user.name);
  await createSession(user.id);
  await audit({ actorUserId: user.id, actorType: "customer", action: "user.signup", targetType: "user", targetId: user.id, ipHash: ip });
  return { id: user.id };
}

export async function login(input: z.infer<typeof loginSchema>) {
  const ip = await ipHash();
  await rateLimit("login", ip);
  await rateLimit("loginAccount", input.email);
  const [user] = await db
    .select({ id: users.id, passwordHash: users.passwordHash, status: users.status })
    .from(users)
    .where(eq(users.email, input.email))
    .limit(1);
  const invalid = new AppError("unauthenticated", "That email and password don't match. Check them and try again.");
  if (!user || !user.passwordHash) {
    await burnPasswordCheck(input.password);
    throw invalid;
  }
  if (!(await verifyPassword(user.passwordHash, input.password))) {
    await audit({ actorUserId: user.id, actorType: "customer", action: "user.login_failed", targetType: "user", targetId: user.id, ipHash: ip });
    throw invalid;
  }
  if (user.status === "suspended") throw new AppError("forbidden", "This account is suspended. Contact support if you think this is a mistake.");
  if (user.status !== "active") throw invalid;
  await createSession(user.id);
  return { id: user.id };
}

export async function sendVerification(userId: string, email: string, name: string) {
  const token = randomToken(32);
  await db.insert(authTokens).values({ userId, kind: "email_verify", tokenHash: sha256(token), expiresAt: new Date(Date.now() + VERIFY_TTL_MS) });
  await sendSystemEmail(
    email,
    {
      subject: "Confirm your email",
      preheader: "One tap to confirm your email address.",
      heading: `Welcome, ${name.split(" ")[0]}`,
      paragraphs: ["Confirm your email so businesses can reach you about your appointments."],
      cta: { label: "Confirm email", url: `/verify-email?token=${token}` },
      footnote: "This link expires in 3 days. If you didn't create an account, you can ignore this email.",
    },
    "auth.verify_email",
    userId,
  );
}

export async function resendVerification(viewer: Viewer) {
  if (viewer.emailVerified || !viewer.email) return;
  await rateLimit("passwordReset", `verify:${viewer.id}`);
  await sendVerification(viewer.id, viewer.email, viewer.name);
}

async function consumeToken(kind: "email_verify" | "password_reset", token: string) {
  const [row] = await db
    .update(authTokens)
    .set({ usedAt: new Date() })
    .where(
      and(eq(authTokens.tokenHash, sha256(token)), eq(authTokens.kind, kind), isNull(authTokens.usedAt), gt(authTokens.expiresAt, new Date())),
    )
    .returning({ userId: authTokens.userId });
  return row ?? null;
}

export async function verifyEmail(token: string) {
  const row = await consumeToken("email_verify", token);
  if (!row) throw new AppError("bad_request", "This confirmation link is invalid or has expired. Request a new one from your account.");
  await db.update(users).set({ emailVerifiedAt: new Date() }).where(eq(users.id, row.userId));
  return { userId: row.userId };
}

/** Always succeeds from the caller's perspective so accounts can't be enumerated. */
export async function requestPasswordReset(email: string) {
  await rateLimit("passwordReset", await ipHash());
  await rateLimit("passwordReset", `email:${email}`);
  const [user] = await db.select({ id: users.id, status: users.status }).from(users).where(eq(users.email, email)).limit(1);
  if (!user || user.status !== "active") return;
  const token = randomToken(32);
  await db.insert(authTokens).values({ userId: user.id, kind: "password_reset", tokenHash: sha256(token), expiresAt: new Date(Date.now() + RESET_TTL_MS) });
  await sendSystemEmail(
    email,
    {
      subject: "Reset your password",
      heading: "Reset your password",
      paragraphs: ["Someone (hopefully you) asked to reset the password for your Kept account."],
      cta: { label: "Choose a new password", url: `/reset-password?token=${token}` },
      footnote: "This link expires in 1 hour. If you didn't ask for this, you can safely ignore this email — your password won't change.",
    },
    "auth.password_reset",
    user.id,
  );
}

export async function resetPassword(token: string, password: string) {
  const problem = passwordProblem(password);
  if (problem) throw new AppError("validation", problem, { fields: { password: problem } });
  const row = await consumeToken("password_reset", token);
  if (!row) throw new AppError("bad_request", "This reset link is invalid or has expired. Request a new one.");
  // Resetting via an emailed link also proves ownership of the address.
  await db
    .update(users)
    .set({ passwordHash: await hashPassword(password), emailVerifiedAt: new Date() })
    .where(eq(users.id, row.userId));
  await destroyAllSessions(row.userId);
  await audit({ actorUserId: row.userId, actorType: "customer", action: "user.password_reset", targetType: "user", targetId: row.userId, ipHash: await ipHash() });
  await createSession(row.userId);
}

export async function changePassword(viewer: Viewer, current: string, next: string) {
  const [user] = await db.select({ passwordHash: users.passwordHash, email: users.email }).from(users).where(eq(users.id, viewer.id));
  if (user?.passwordHash && !(await verifyPassword(user.passwordHash, current))) {
    throw new AppError("validation", "Your current password is incorrect.", { fields: { currentPassword: "Incorrect password" } });
  }
  const problem = passwordProblem(next, user?.email);
  if (problem) throw new AppError("validation", problem, { fields: { newPassword: problem } });
  await db.update(users).set({ passwordHash: await hashPassword(next) }).where(eq(users.id, viewer.id));
  await destroyAllSessions(viewer.id, viewer.sessionId);
  await audit({ actorUserId: viewer.id, actorType: "customer", action: "user.password_changed", targetType: "user", targetId: viewer.id, ipHash: await ipHash() });
}
