import "server-only";
import { hash, verify } from "@node-rs/argon2";

// OWASP-recommended argon2id parameters (m=19MiB, t=2, p=1).
const OPTS = { memoryCost: 19_456, timeCost: 2, parallelism: 1, outputLen: 32 } as const;

export function hashPassword(password: string): Promise<string> {
  return hash(password, OPTS);
}

export async function verifyPassword(hashed: string, password: string): Promise<boolean> {
  try {
    return await verify(hashed, password);
  } catch {
    return false;
  }
}

// A real hash so failed lookups take the same time as wrong passwords.
let dummy: Promise<string> | null = null;
export async function burnPasswordCheck(password: string) {
  dummy ??= hashPassword("timing-equaliser-password");
  await verifyPassword(await dummy, password);
}

const COMMON = new Set(["password", "password1", "12345678", "123456789", "qwerty123", "iloveyou", "11111111", "abc12345"]);

export function passwordProblem(password: string, email?: string | null): string | null {
  if (password.length < 8) return "Use at least 8 characters.";
  if (password.length > 128) return "Use 128 characters or fewer.";
  if (COMMON.has(password.toLowerCase())) return "That password is too common. Try something less predictable.";
  if (email && password.toLowerCase().includes(email.split("@")[0].toLowerCase()) && email.split("@")[0].length >= 4)
    return "Your password shouldn't contain your email address.";
  return null;
}
