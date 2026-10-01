import type { Metadata } from "next";
import { eq } from "drizzle-orm";
import { PoliciesSettings } from "@/components/pro/booking-settings";
import { SettingsShell } from "@/components/pro/settings-shell";
import { getT } from "@/i18n/server";
import { db } from "@/server/db/client";
import { businesses } from "@/server/db/schema";
import { proPage } from "@/server/pro-page";

export async function generateMetadata(): Promise<Metadata> {
  const t = await getT("proSettings");
  return { title: t("policies.title") };
}

export default async function PoliciesPage() {
  const { m } = await proPage("business.manage");
  const [[b], t] = await Promise.all([db.select().from(businesses).where(eq(businesses.id, m.businessId)), getT("proSettings")]);
  return (
    <SettingsShell title={t("policies.title")} description={t("policies.description")} perms={[...m.permissions]}>
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
