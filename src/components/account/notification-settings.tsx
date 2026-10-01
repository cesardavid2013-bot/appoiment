"use client";

import Link from "next/link";
import { useState } from "react";
import { toast } from "sonner";
import { Switch } from "@/components/ui/controls";
import { NOTIFICATION_TOPICS, type NotificationPrefs, type NotificationTopic } from "@/domain/notifications";
import { rich } from "@/i18n/rich";
import { useT } from "@/i18n/client";
import { api, ApiError } from "@/lib/api";
import { SettingsCard } from "./settings-card";

export function NotificationSettings({ initial, smsEnabled, hasPhone, showBusiness }: { initial: NotificationPrefs; smsEnabled: boolean; hasPhone: boolean; showBusiness: boolean }) {
  const t = useT("account");
  const [prefs, setPrefs] = useState(initial);
  const [saving, setSaving] = useState<string | null>(null);
  const topics = (Object.keys(NOTIFICATION_TOPICS) as NotificationTopic[]).filter((k) => k !== "business" || showBusiness);

  async function set(topic: NotificationTopic, channel: "email" | "sms", value: boolean) {
    const prev = prefs;
    setPrefs({ ...prefs, [topic]: { ...prefs[topic], [channel]: value } });
    setSaving(`${topic}.${channel}`);
    try {
      const res = await api<{ prefs: NotificationPrefs }>("/api/me/notification-prefs", { method: "PUT", body: { prefs: { [topic]: { [channel]: value } } } });
      setPrefs(res.prefs);
      toast.success(t("notifications.saved"), { id: "prefs-saved", duration: 1500 });
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
        title={smsEnabled ? t("notifications.emailAndText") : t("notifications.emailOnly")}
        description={t("notifications.inboxNote")}
      >
        {smsEnabled && !hasPhone && (
          <p className="mb-4 rounded-md bg-surface-2 px-3.5 py-3 text-[13px] leading-relaxed text-ink-2">
            {rich(t("notifications.addPhone"), {
              link: (text) => (
                <Link href="/account/profile" className="font-medium text-ink underline underline-offset-4">
                  {text}
                </Link>
              ),
            })}
          </p>
        )}
        <ul className="-my-1 divide-y divide-line">
          {topics.map((topic) => {
            const locked = NOTIFICATION_TOPICS[topic].transactional;
            const label = t(`notifications.topics.${topic}.label`);
            const description = t(`notifications.topics.${topic}.description`);
            const lockedNote = topic === "bookings" || topic === "business" ? t(`notifications.alwaysOn.${topic}`) : undefined;
            if (!smsEnabled) {
              return (
                <li key={topic} className="py-3.5">
                  <Switch
                    label={label}
                    description={
                      <>
                        {description}
                        {locked && lockedNote && <span className="mt-1 block text-ink-3">{lockedNote}</span>}
                      </>
                    }
                    checked={locked ? true : prefs[topic].email}
                    disabled={locked || saving === `${topic}.email`}
                    onCheckedChange={(v) => set(topic, "email", v)}
                  />
                </li>
              );
            }
            return (
              <li key={topic} className="py-3.5">
                <p className="text-sm font-medium text-ink">{label}</p>
                <p className="mt-0.5 text-[13px] leading-snug text-ink-3">{description}</p>
                <div className="mt-2.5 space-y-1 border-s-2 border-line ps-3.5">
                  <Switch
                    label={
                      <>
                        {t("notifications.email")}
                        <span className="sr-only"> {t("notifications.forTopic", { topic: label })}</span>
                      </>
                    }
                    description={locked ? lockedNote : undefined}
                    checked={locked ? true : prefs[topic].email}
                    disabled={locked || saving === `${topic}.email`}
                    onCheckedChange={(v) => set(topic, "email", v)}
                  />
                  <Switch
                    label={
                      <>
                        {t("notifications.sms")}
                        <span className="sr-only"> {t("notifications.forTopic", { topic: label })}</span>
                      </>
                    }
                    checked={prefs[topic].sms}
                    disabled={!hasPhone || saving === `${topic}.sms`}
                    onCheckedChange={(v) => set(topic, "sms", v)}
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
