import "server-only";
import { headers } from "next/headers";
import { hmac } from "./crypto";

export async function clientIp(): Promise<string> {
  const h = await headers();
  const forwarded = h.get("x-forwarded-for");
  if (forwarded) return forwarded.split(",")[0].trim();
  return h.get("x-real-ip") ?? "0.0.0.0";
}

export async function ipHash(): Promise<string> {
  return hmac(await clientIp());
}

export async function userAgent(): Promise<string | null> {
  return (await headers()).get("user-agent")?.slice(0, 300) ?? null;
}
