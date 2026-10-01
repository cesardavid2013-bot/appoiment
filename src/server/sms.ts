import "server-only";
import { db } from "./db/client";
import { deliveryLog } from "./db/schema";
import { env, features } from "./env";
import { maskPhone } from "./logger";

/** SMS is only used when Twilio is configured; callers must check `features.sms`. */
export async function sendSms(to: string, body: string, template: string, userId?: string | null) {
  if (!features.sms) return;
  const auth = Buffer.from(`${env.TWILIO_ACCOUNT_SID}:${env.TWILIO_AUTH_TOKEN}`).toString("base64");
  const res = await fetch(`https://api.twilio.com/2010-04-01/Accounts/${env.TWILIO_ACCOUNT_SID}/Messages.json`, {
    method: "POST",
    headers: { authorization: `Basic ${auth}`, "content-type": "application/x-www-form-urlencoded" },
    body: new URLSearchParams({ To: to, From: env.TWILIO_FROM_NUMBER!, Body: body.slice(0, 600) }),
    signal: AbortSignal.timeout(15_000),
  });
  const json = (await res.json().catch(() => ({}))) as { sid?: string; message?: string };
  await db.insert(deliveryLog).values({
    channel: "sms",
    template,
    userId: userId ?? null,
    recipientHint: maskPhone(to),
    status: res.ok ? "sent" : "failed",
    providerMessageId: json.sid ?? null,
    error: res.ok ? null : (json.message ?? `HTTP ${res.status}`),
  });
  if (!res.ok && res.status >= 500) throw new Error(`SMS provider error ${res.status}`);
}
