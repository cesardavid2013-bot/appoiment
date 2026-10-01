/**
 * Structured JSON logging with redaction. Never log raw credentials, tokens,
 * card data or full contact details.
 */
type Level = "debug" | "info" | "warn" | "error";
const SENSITIVE = /pass(word)?|token|secret|authorization|cookie|card|cvc|iban|session/i;

function redact(value: unknown, depth = 0): unknown {
  if (depth > 5) return "[depth]";
  if (value instanceof Error) return { name: value.name, message: value.message, stack: value.stack?.split("\n").slice(0, 6).join("\n") };
  if (Array.isArray(value)) return value.slice(0, 50).map((v) => redact(v, depth + 1));
  if (value && typeof value === "object") {
    const out: Record<string, unknown> = {};
    for (const [k, v] of Object.entries(value)) out[k] = SENSITIVE.test(k) ? "[redacted]" : redact(v, depth + 1);
    return out;
  }
  if (typeof value === "string" && value.length > 2000) return value.slice(0, 2000) + "…";
  return value;
}

function write(level: Level, msg: string, fields?: Record<string, unknown>) {
  if (level === "debug" && process.env.NODE_ENV === "production") return;
  if (process.env.NODE_ENV === "test" && level !== "error" && !process.env.LOG_IN_TESTS) return;
  const line = JSON.stringify({ t: new Date().toISOString(), level, msg, ...(fields ? (redact(fields) as object) : {}) });
  if (level === "error" || level === "warn") console.error(line);
  else console.log(line);
}

export const log = {
  debug: (msg: string, f?: Record<string, unknown>) => write("debug", msg, f),
  info: (msg: string, f?: Record<string, unknown>) => write("info", msg, f),
  warn: (msg: string, f?: Record<string, unknown>) => write("warn", msg, f),
  error: (msg: string, f?: Record<string, unknown>) => write("error", msg, f),
};

/** j***@example.com / ***-***-1234 — for delivery logs and support views. */
export function maskEmail(email: string): string {
  const [user, domain] = email.split("@");
  if (!domain) return "***";
  return `${user.slice(0, 1)}***@${domain}`;
}
export function maskPhone(phone: string): string {
  return `***${phone.replace(/\D/g, "").slice(-4)}`;
}
