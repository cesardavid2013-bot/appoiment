"use client";

import Link from "next/link";
import { useState } from "react";
import { toast } from "sonner";
import { Switch } from "@/components/ui/controls";
import { NOTIFICATION_TOPICS, type NotificationPrefs, type NotificationTopic } from "@/domain/notifications";
import { api, ApiError } from "@/lib/api";
import { SettingsCard } from "./account-shell";

const ALWAYS_ON: Partial<Record<NotificationTopic, string>> = {
  bookings: "Email is always on, so we can reach you if a booking changes.",
  business: "Email is always on, so you never miss a new booking or request.",
};

export function NotificationSettings({ initial, smsEnabled, hasPhone, showBusiness }: { initial: NotificationPrefs; smsEnabled: boolean; hasPhone: boolean; showBusiness: boolean }) {
  const [prefs, setPrefs] = useState(initial);
  const [saving, setSaving] = useState<string | null>(null);
  const topics = (Object.keys(NOTIFICATION_TOPICS) as NotificationTopic[]).filter((t) => t !== "business" || showBusiness);

  async function set(topic: NotificationTopic, channel: "email" | "sms", value: boolean) {
    const prev = prefs;
    setPrefs({ ...prefs, [topic]: { ...prefs[topic], [channel]: value } });
    setSaving(`${topic}.${channel}`);
    try {
      const res = await api<{ prefs: NotificationPrefs }>("/api/me/notification-prefs", { method: "PUT", body: { prefs: { [topic]: { [channel]: value } } } });
      setPrefs(res.prefs);
      toast.success("Saved", { id: "prefs-saved", duration: 1500 });
    } catch (err) {
      setPrefs(prev);
      toast.error((err as ApiError).message);
    } finally {
      setSaving(null);
    }
  }

  return (
    <div className="space-y-6">
      <SettingsCard
        id="alerts-h"
        title={smsEnabled ? "Email and text alerts" : "Email alerts"}
        description="Everything also appears in your Notifications inbox on Kept, whatever you choose here."
      >
        {smsEnabled && !hasPhone && (
          <p className="mb-4 rounded-md bg-surface-2 px-3.5 py-3 text-[13px] leading-relaxed text-ink-2">
            Add a phone number in your{" "}
            <Link href="/account/profile" className="font-medium text-ink underline underline-offset-4">
              profile
            </Link>{" "}
            to receive text messages.
          </p>
        )}
        <ul className="-my-1 divide-y divide-line">
          {topics.map((t) => {
            const meta = NOTIFICATION_TOPICS[t];
            const lockedNote = ALWAYS_ON[t];
            const locked = meta.transactional;
            if (!smsEnabled) {
              return (
                <li key={t} className="py-3.5">
                  <Switch
                    label={meta.label}
                    description={
                      <>
                        {meta.description}
                        {locked && lockedNote && <span className="mt-1 block text-ink-3">{lockedNote}</span>}
                      </>
                    }
                    checked={locked ? true : prefs[t].email}
                    disabled={locked || saving === `${t}.email`}
                    onCheckedChange={(v) => set(t, "email", v)}
                  />
                </li>
              );
            }
            return (
              <li key={t} className="py-3.5">
                <p className="text-sm font-medium text-ink">{meta.label}</p>
                <p className="mt-0.5 text-[13px] leading-snug text-ink-3">{meta.description}</p>
                <div className="mt-2.5 space-y-1 border-s-2 border-line ps-3.5">
                  <Switch
                    label={
                      <>
                        Email<span className="sr-only"> for {meta.label}</span>
                      </>
                    }
                    description={locked ? lockedNote : undefined}
                    checked={locked ? true : prefs[t].email}
                    disabled={locked || saving === `${t}.email`}
                    onCheckedChange={(v) => set(t, "email", v)}
                  />
                  <Switch
                    label={
                      <>
                        Text message<span className="sr-only"> for {meta.label}</span>
                      </>
                    }
                    checked={prefs[t].sms}
                    disabled={!hasPhone || saving === `${t}.sms`}
                    onCheckedChange={(v) => set(t, "sms", v)}
                  />
                </div>
              </li>
            );
          })}
        </ul>
      </SettingsCard>
    </div>
  );
}
