import "server-only";
import { db } from "./db/client";
import { deliveryLog } from "./db/schema";
import { env, features } from "./env";
import { log, maskEmail } from "./logger";

export type EmailMessage = { to: string; subject: string; html: string; text: string; template: string; userId?: string | null };

/**
 * Sends one email. Throws on transient failure so the job queue retries.
 * Without a provider configured (local development) the message is logged.
 */
export async function sendEmail(msg: EmailMessage): Promise<void> {
  const hint = maskEmail(msg.to);
  if (!features.email) {
    if (env.NODE_ENV !== "test") log.info("email.dev_outbox", { to: hint, subject: msg.subject, text: msg.text });
    await db.insert(deliveryLog).values({ channel: "email", template: msg.template, userId: msg.userId ?? null, recipientHint: hint, status: "logged" });
    return;
  }
  const res = await fetch("https://api.resend.com/emails", {
    method: "POST",
    headers: { authorization: `Bearer ${env.RESEND_API_KEY}`, "content-type": "application/json" },
    body: JSON.stringify({ from: env.EMAIL_FROM, to: [msg.to], subject: msg.subject, html: msg.html, text: msg.text }),
    signal: AbortSignal.timeout(15_000),
  });
  const body = (await res.json().catch(() => ({}))) as { id?: string; message?: string };
  await db.insert(deliveryLog).values({
    channel: "email",
    template: msg.template,
    userId: msg.userId ?? null,
    recipientHint: hint,
    status: res.ok ? "sent" : "failed",
    providerMessageId: body.id ?? null,
    error: res.ok ? null : (body.message ?? `HTTP ${res.status}`),
  });
  // 4xx (bad address etc.) won't succeed on retry; 5xx/429 will be retried by the queue.
  if (!res.ok && (res.status >= 500 || res.status === 429)) throw new Error(`Email provider error ${res.status}`);
}
