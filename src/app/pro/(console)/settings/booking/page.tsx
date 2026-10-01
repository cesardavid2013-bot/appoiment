import type { Metadata } from "next";
import { eq } from "drizzle-orm";
import { BookingRulesSettings } from "@/components/pro/booking-settings";
import { SettingsShell } from "@/components/pro/settings-shell";
import { db } from "@/server/db/client";
import { businesses } from "@/server/db/schema";
import { features } from "@/server/env";
import { proPage } from "@/server/pro-page";

export const metadata: Metadata = { title: "Booking rules" };

export default async function BookingRulesPage() {
  const { m } = await proPage("business.manage");
  const [b] = await db.select().from(businesses).where(eq(businesses.id, m.businessId));
  return (
    <SettingsShell title="Booking rules" description="How and when clients can book you. Individual services can override notice and approval." perms={[...m.permissions]}>
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
