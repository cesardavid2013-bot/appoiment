import type { Metadata } from "next";
import { eq } from "drizzle-orm";
import { BookingRulesSettings } from "@/components/pro/booking-settings";
import { SettingsShell } from "@/components/pro/settings-shell";
import { getT } from "@/i18n/server";
import { db } from "@/server/db/client";
import { businesses } from "@/server/db/schema";
import { features } from "@/server/env";
import { proPage } from "@/server/pro-page";

export async function generateMetadata(): Promise<Metadata> {
  const t = await getT("proSettings");
  return { title: t("booking.title") };
}

export default async function BookingRulesPage() {
  const { m } = await proPage("business.manage");
  const [[b], t] = await Promise.all([db.select().from(businesses).where(eq(businesses.id, m.businessId)), getT("proSettings")]);
  return (
    <SettingsShell title={t("booking.title")} description={t("booking.description")} perms={[...m.permissions]}>
      <BookingRulesSettings
        teamBusiness={m.businessKind === "business"}
        smsEnabled={features.sms}
        initial={{
          bookingMode: b.bookingMode,
          minNoticeMinutes: b.minNoticeMinutes,
          maxAdvanceDays: b.maxAdvanceDays,
          slotIntervalMinutes: b.slotIntervalMinutes,
          allowAnyStaff: b.allowAnyStaff,
          reminderOffsetsMinutes: b.reminderOffsetsMinutes ?? [],
        }}
      />
    </SettingsShell>
  );
}
