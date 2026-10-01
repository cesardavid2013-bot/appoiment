import "server-only";
import { eq } from "drizzle-orm";
import { NOTIFICATION_TOPICS, wantsChannel, type NotificationTopic } from "@/domain/notifications";
import { db, type Executor } from "./db/client";
import { notifications, users } from "./db/schema";
import { renderEmail, type EmailContent } from "./email-template";
import { DEFAULT_LOCALE, isLocale, localeInfo, type Locale } from "@/i18n/locales";
import type { TFunction } from "@/i18n/translate";
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

/** Everything a message needs to speak the recipient's language. */
export type Lang = {
  locale: Locale;
  intl: string;
  /** Root translator: `t("email.booked.title", { business })`. */
  t: TFunction;
  /** "Thu, Oct 2, 3:30 PM EDT" in the recipient's language, in the appointment's zone. */
  when: (date: Date, timeZone: string) => string;
  money: (cents: number, currency: string) => string;
};
export type NotifyBuilder = (l: Lang) => NotifyInput;

export async function langFor(locale: string | null | undefined): Promise<Lang> {
  const code: Locale = isLocale(locale) ? locale : DEFAULT_LOCALE;
  const { intl } = localeInfo(code);
  const { getTFor } = await import("@/i18n/server");
  const { formatWhen } = await import("./format");
  const { formatMoney } = await import("@/domain/money");
  return { locale: code, intl, t: await getTFor(code), when: (d, tz) => formatWhen(d, tz, intl), money: (c, cur) => formatMoney(c, cur, { intl }) };
}

/** Email chrome (footer line, text direction) in the recipient's language. */
function emailChrome(l: Lang) {
  return { lang: l.intl, dir: localeInfo(l.locale).dir, footer: l.t("email.footer") };
}

/**
 * Delivers a notification across channels, respecting the user's preferences.
 * In-app entries are written in the caller's transaction; email/SMS go through
 * the durable job queue so a provider outage never breaks a booking. Pass a
 * builder to write the message in the recipient's own language.
 */
export async function notify(userId: string, input: NotifyInput | NotifyBuilder, tx: Executor = db) {
  const [user] = await tx
    .select({ email: users.email, phone: users.phone, prefs: users.notificationPrefs, status: users.status, locale: users.locale })
    .from(users)
    .where(eq(users.id, userId))
    .limit(1);
  if (!user || user.status !== "active") return;
  const l = await langFor(user.locale);
  const n = typeof input === "function" ? input(l) : input;

  if (n.inApp !== false) {
    await tx.insert(notifications).values({ userId, type: n.type, title: n.title, body: n.body ?? null, href: n.href ?? null });
  }
  const transactional = NOTIFICATION_TOPICS[n.topic].transactional;
  if (n.email && user.email && (transactional || wantsChannel(user.prefs, n.topic, "email"))) {
    const rendered = renderEmail({ ...emailChrome(l), ...n.email });
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
export async function sendSystemEmail(
  to: string,
  content: EmailContent | ((l: Lang) => EmailContent),
  template: string,
  userId?: string | null,
  tx: Executor = db,
  locale?: string | null,
) {
  const l = await langFor(locale);
  const c = typeof content === "function" ? content(l) : content;
  await enqueue("email.send", { to, userId: userId ?? null, template, ...renderEmail({ ...emailChrome(l), ...c }) }, { tx });
}
