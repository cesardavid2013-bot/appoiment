import "server-only";
import { eq } from "drizzle-orm";
import { NOTIFICATION_TOPICS, wantsChannel, type NotificationTopic } from "@/domain/notifications";
import { db, type Executor } from "./db/client";
import { notifications, users } from "./db/schema";
import { renderEmail, type EmailContent } from "./email-template";
import { features } from "./env";
import { enqueue } from "./jobs";

export type NotifyInput = {
  topic: NotificationTopic;
  type: string;
  title: string;
  body?: string;
  href?: string;
  email?: EmailContent;
  sms?: string;
  /** Skip the in-app entry (e.g. for auth emails). */
  inApp?: boolean;
  dedupeKey?: string;
};

/**
 * Delivers a notification across channels, respecting the user's preferences.
 * In-app entries are written in the caller's transaction; email/SMS go through
 * the durable job queue so a provider outage never breaks a booking.
 */
export async function notify(userId: string, n: NotifyInput, tx: Executor = db) {
  const [user] = await tx
    .select({ email: users.email, phone: users.phone, prefs: users.notificationPrefs, status: users.status })
    .from(users)
    .where(eq(users.id, userId))
    .limit(1);
  if (!user || user.status !== "active") return;

  if (n.inApp !== false) {
    await tx.insert(notifications).values({ userId, type: n.type, title: n.title, body: n.body ?? null, href: n.href ?? null });
  }
  const transactional = NOTIFICATION_TOPICS[n.topic].transactional;
  if (n.email && user.email && (transactional || wantsChannel(user.prefs, n.topic, "email"))) {
    const rendered = renderEmail(n.email);
    await enqueue(
      "email.send",
      { to: user.email, userId, template: n.type, ...rendered },
      { tx, dedupeKey: n.dedupeKey ? `email:${n.dedupeKey}` : undefined },
    );
  }
  if (n.sms && features.sms && user.phone && wantsChannel(user.prefs, n.topic, "sms")) {
    await enqueue("sms.send", { to: user.phone, userId, body: n.sms, template: n.type }, { tx, dedupeKey: n.dedupeKey ? `sms:${n.dedupeKey}` : undefined });
  }
}

/** Sends an email that isn't tied to preferences (verification, password reset, invites). */
export async function sendSystemEmail(to: string, content: EmailContent, template: string, userId?: string | null, tx: Executor = db) {
  await enqueue("email.send", { to, userId: userId ?? null, template, ...renderEmail(content) }, { tx });
}
