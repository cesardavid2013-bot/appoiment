import { cookies } from "next/headers";
import { NextResponse, type NextRequest } from "next/server";
import { generateCodeVerifier, generateState, googleClient } from "@/server/auth/google";
import { safeNext } from "@/server/auth/redirect";
import { env, secureCookies } from "@/server/env";

export async function GET(req: NextRequest) {
  const google = googleClient();
  if (!google) return NextResponse.redirect(new URL("/login?error=google_unavailable", env.APP_URL));
  const state = generateState();
  const verifier = generateCodeVerifier();
  const url = google.createAuthorizationURL(state, verifier, ["openid", "profile", "email"]);
  const jar = await cookies();
  const opts = { httpOnly: true, secure: secureCookies, sameSite: "lax" as const, path: "/", maxAge: 600 };
  jar.set("kept_oauth_state", state, opts);
  jar.set("kept_oauth_verifier", verifier, opts);
  jar.set("kept_oauth_next", safeNext(req.nextUrl.searchParams.get("next")), opts);
  return NextResponse.redirect(url);
}
