import { cookies } from "next/headers";
import { NextResponse, type NextRequest } from "next/server";
import { googleClient, upsertGoogleUser } from "@/server/auth/google";
import { safeNext } from "@/server/auth/redirect";
import { createSession } from "@/server/auth/session";
import { env } from "@/server/env";
import { log } from "@/server/logger";

export async function GET(req: NextRequest) {
  const jar = await cookies();
  const state = req.nextUrl.searchParams.get("state");
  const code = req.nextUrl.searchParams.get("code");
  const storedState = jar.get("kept_oauth_state")?.value;
  const verifier = jar.get("kept_oauth_verifier")?.value;
  const next = safeNext(jar.get("kept_oauth_next")?.value);
  for (const c of ["kept_oauth_state", "kept_oauth_verifier", "kept_oauth_next"]) jar.delete(c);

  const google = googleClient();
  if (!google || !state || !code || !storedState || !verifier || state !== storedState) {
    return NextResponse.redirect(new URL("/login?error=google_failed", env.APP_URL));
  }
  try {
    const tokens = await google.validateAuthorizationCode(code, verifier);
    const userId = await upsertGoogleUser(tokens.idToken());
    await createSession(userId);
    return NextResponse.redirect(new URL(next, env.APP_URL));
  } catch (err) {
    log.warn("auth.google_failed", { err });
    return NextResponse.redirect(new URL("/login?error=google_failed", env.APP_URL));
  }
}
