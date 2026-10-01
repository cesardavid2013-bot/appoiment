import type { Metadata } from "next";
import QRCode from "qrcode";
import { eq } from "drizzle-orm";
import { BookingLinkSettings } from "@/components/pro/booking-link-settings";
import { SettingsShell } from "@/components/pro/settings-shell";
import { db } from "@/server/db/client";
import { businesses } from "@/server/db/schema";
import { env } from "@/server/env";
import { proPage } from "@/server/pro-page";
import { launchChecklist } from "@/server/services/business";

export const metadata: Metadata = { title: "Booking link" };

/** Where to fix each launch checklist item from inside the console. */
const FIX: Record<string, string> = { location: "/pro/settings/locations", services: "/pro/services/new", availability: "/pro/availability" };

export default async function BookingLinkPage() {
  const { m } = await proPage("business.manage");
  const [[b], check] = await Promise.all([db.select({ slug: businesses.slug, status: businesses.status, name: businesses.name }).from(businesses).where(eq(businesses.id, m.businessId)), launchChecklist(m.businessId)]);
  const url = `${env.APP_URL}/${b.slug}`;
  const qr = await QRCode.toString(url, { type: "svg", margin: 1, errorCorrectionLevel: "M", color: { dark: "#1a1814", light: "#ffffff" } });
  return (
    <SettingsShell title="Booking link" description="Your page on Kept. Put it in your bio, on your card, on the mirror." perms={[...m.permissions]}>
      <BookingLinkSettings
        name={b.name}
        appUrl={env.APP_URL}
        slug={b.slug}
        status={b.status}
        qrSvg={qr}
        checklist={check.items.map((i) => ({ key: i.key, label: i.label, done: i.done, href: FIX[i.key] ?? i.href }))}
      />
    </SettingsShell>
  );
}
