import type { Metadata } from "next";
import { eq } from "drizzle-orm";
import { PoliciesSettings } from "@/components/pro/booking-settings";
import { SettingsShell } from "@/components/pro/settings-shell";
import { db } from "@/server/db/client";
import { businesses } from "@/server/db/schema";
import { proPage } from "@/server/pro-page";

export const metadata: Metadata = { title: "Cancellations & fees" };

export default async function PoliciesPage() {
  const { m } = await proPage("business.manage");
  const [b] = await db.select().from(businesses).where(eq(businesses.id, m.businessId));
  return (
    <SettingsShell title="Cancellations & fees" description="Clients see these before they book and again before they cancel." perms={[...m.permissions]}>
      <PoliciesSettings
        paymentsEnabled={b.paymentsEnabled}
        currency={m.currency}
        initial={{
          cancellationWindowHours: b.cancellationWindowHours,
          rescheduleWindowHours: b.rescheduleWindowHours,
          lateCancelFeePercent: b.lateCancelFeePercent,
          noShowFeePercent: b.noShowFeePercent,
          depositRefundable: b.depositRefundable,
          latePolicy: b.latePolicy ?? "",
          bookingInstructions: b.bookingInstructions ?? "",
          taxRatePercent: String(b.taxRateBps / 100),
          taxLabel: b.taxLabel ?? "",
        }}
      />
    </SettingsShell>
  );
}
