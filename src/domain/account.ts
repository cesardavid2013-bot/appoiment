/** Pure account helpers (validation and preference merging), shared by services, routes and tests. */
import { NOTIFICATION_TOPICS, resolvePrefs, type NotificationPrefs, type NotificationTopic } from "./notifications";

/** Phrase the user must type to confirm account deletion. */
export const DELETE_CONFIRMATION = "DELETE";

export const MAX_SAVED_ADDRESSES = 10;

export function isValidTimeZone(tz: string): boolean {
  if (!tz || tz.length > 64) return false;
  try {
    new Intl.DateTimeFormat("en-US", { timeZone: tz });
    return true;
  } catch {
    return false;
  }
}

/**
 * Normalises a phone number to a compact international-ish form: an optional
 * leading "+" followed by 7–15 digits. Returns null when it can't be a phone number.
 * (Real verification happens over SMS when that channel is enabled.)
 */
export function normalizePhone(input: string): string | null {
  const trimmed = input.trim();
  if (!trimmed) return null;
  if (/[^0-9+\-().\s]/.test(trimmed)) return null;
  const plus = trimmed.startsWith("+");
  const digits = trimmed.replace(/\D/g, "");
  if (digits.length < 7 || digits.length > 15) return null;
  if (trimmed.slice(1).includes("+")) return null;
  return `${plus ? "+" : ""}${digits}`;
}

export type PrefsPatch = Partial<Record<NotificationTopic, { email?: boolean; sms?: boolean }>>;

/**
 * Applies a user's changes on top of their stored preferences.
 * Transactional topics always email (we must be able to tell you a booking
 * changed), and SMS can only change when the channel is actually available.
 */
export function mergeNotificationPrefs(stored: unknown, patch: PrefsPatch, opts: { smsAvailable: boolean }): NotificationPrefs {
  const out = resolvePrefs(stored);
  for (const topic of Object.keys(NOTIFICATION_TOPICS) as NotificationTopic[]) {
    const change = patch[topic];
    if (!change) continue;
    if (typeof change.email === "boolean") out[topic].email = change.email;
    if (typeof change.sms === "boolean" && opts.smsAvailable) out[topic].sms = change.sms;
  }
  for (const topic of Object.keys(NOTIFICATION_TOPICS) as NotificationTopic[]) {
    if (NOTIFICATION_TOPICS[topic].transactional) out[topic].email = true;
  }
  return out;
}
