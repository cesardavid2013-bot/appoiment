import "server-only";
import { createHash, createHmac, randomBytes, timingSafeEqual } from "node:crypto";
import { env } from "./env";

export function randomToken(bytes = 32): string {
  return randomBytes(bytes).toString("base64url");
}

export function sha256(input: string): string {
  return createHash("sha256").update(input).digest("hex");
}

/** Keyed hash for values we need to correlate but must not store raw (IPs). */
export function hmac(input: string): string {
  return createHmac("sha256", env.APP_SECRET).update(input).digest("hex").slice(0, 32);
}

export function safeEqual(a: string, b: string): boolean {
  const ab = Buffer.from(a);
  const bb = Buffer.from(b);
  return ab.length === bb.length && timingSafeEqual(ab, bb);
}

const REF_ALPHABET = "ABCDEFGHJKLMNPQRSTUVWXYZ23456789"; // no 0/O/1/I

/** Human-friendly booking reference, e.g. "K7Q-4M2". */
export function bookingReference(): string {
  const bytes = randomBytes(6);
  let out = "";
  for (let i = 0; i < 6; i++) out += REF_ALPHABET[bytes[i] % REF_ALPHABET.length];
  return `${out.slice(0, 3)}-${out.slice(3)}`;
}
