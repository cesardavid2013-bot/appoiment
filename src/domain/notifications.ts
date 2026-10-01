import { z } from "zod";

export const NOTIFICATION_TOPICS = {
  bookings: { label: "Booking updates", description: "Confirmations, changes and cancellations.", transactional: true },
  reminders: { label: "Reminders", description: "Before upcoming appointments.", transactional: false },
  messages: { label: "Messages", description: "When a business or customer messages you.", transactional: false },
  waitlist: { label: "Waitlist openings", description: "When a time you wanted becomes available.", transactional: false },
  reviews: { label: "Review requests", description: "A short note after a completed appointment.", transactional: false },
  business: { label: "Business activity", description: "New bookings, requests and reviews for your business.", transactional: true },
  marketing: { label: "News & offers", description: "Occasional updates from businesses you've booked with.", transactional: false },
} as const;

export type NotificationTopic = keyof typeof NOTIFICATION_TOPICS;
export type Channel = "email" | "sms";

const channelPrefs = z.object({ email: z.boolean(), sms: z.boolean() });
export const notificationPrefsSchema = z.record(z.string(), channelPrefs);
export type NotificationPrefs = Record<NotificationTopic, { email: boolean; sms: boolean }>;

export const DEFAULT_PREFS: NotificationPrefs = {
  bookings: { email: true, sms: false },
  reminders: { email: true, sms: false },
  messages: { email: true, sms: false },
  waitlist: { email: true, sms: false },
  reviews: { email: true, sms: false },
  business: { email: true, sms: false },
  marketing: { email: false, sms: false },
};

export function resolvePrefs(stored: unknown): NotificationPrefs {
  const parsed = notificationPrefsSchema.safeParse(stored);
  const out = structuredClone(DEFAULT_PREFS);
  if (!parsed.success) return out;
  for (const topic of Object.keys(out) as NotificationTopic[]) {
    const v = parsed.data[topic];
    if (v) out[topic] = v;
  }
  return out;
}

export function wantsChannel(stored: unknown, topic: NotificationTopic, channel: Channel): boolean {
  return resolvePrefs(stored)[topic][channel];
}
