import "server-only";
import { headers } from "next/headers";
import { hmac } from "./crypto";
import { env } from "./env";

/**
 * The caller's IP for rate limiting. Never trust the left side of
 * X-Forwarded-For — clients can put anything there. Use a header the edge
 * overwrites, or the entry appended by our own outermost trusted proxy.
 */
export async function clientIp(): Promise<string> {
  const h = await headers();
  if (env.CLIENT_IP_HEADER) {
    const v = h.get(env.CLIENT_IP_HEADER)?.split(",")[0]?.trim();
    if (v) return v.slice(0, 64);
  }
  const chain = (h.get("x-forwarded-for") ?? "")
    .split(",")
    .map((s) => s.trim())
    .filter(Boolean);
  if (chain.length && env.TRUSTED_PROXY_HOPS > 0) return chain[Math.max(0, chain.length - env.TRUSTED_PROXY_HOPS)].slice(0, 64);
  return "0.0.0.0";
}

export async function ipHash(): Promise<string> {
  return hmac(await clientIp());
}

export async function userAgent(): Promise<string | null> {
  return (await headers()).get("user-agent")?.slice(0, 300) ?? null;
}
