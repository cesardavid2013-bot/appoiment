import type { Metadata } from "next";
import QRCode from "qrcode";
import { eq } from "drizzle-orm";
import { BookingLinkSettings } from "@/components/pro/booking-link-settings";
import { SettingsShell } from "@/components/pro/settings-shell";
import { getT } from "@/i18n/server";
import { db } from "@/server/db/client";
import { businesses } from "@/server/db/schema";
import { env } from "@/server/env";
import { proPage } from "@/server/pro-page";
import { launchChecklist } from "@/server/services/business";

export async function generateMetadata(): Promise<Metadata> {
  const t = await getT("proSettings");
  return { title: t("link.title") };
}

/** Where to fix each launch checklist item from inside the console. */
const FIX: Record<string, string> = { location: "/pro/settings/locations", services: "/pro/services/new", availability: "/pro/availability" };

export default async function BookingLinkPage() {
  const { m } = await proPage("business.manage");
  const [[b], check, t] = await Promise.all([db.select({ slug: businesses.slug, status: businesses.status, name: businesses.name }).from(businesses).where(eq(businesses.id, m.businessId)), launchChecklist(m.businessId), getT("proSettings")]);
  const url = `${env.APP_URL}/${b.slug}`;
  const qr = await QRCode.toString(url, { type: "svg", margin: 1, errorCorrectionLevel: "M", color: { dark: "#1a1814", light: "#ffffff" } });
  // Checklist labels come from the service in English; translate the ones we know by key.
  const label = (key: string, fallback: string) => {
    const k = `link.checklist.${key}`;
    const v = t(k);
    return v === `proSettings.${k}` ? fallback : v;
  };
  return (
    <SettingsShell title={t("link.title")} description={t("link.description")} perms={[...m.permissions]}>
      <BookingLinkSettings
        name={b.name}
        appUrl={env.APP_URL}
        slug={b.slug}
        status={b.status}
        qrSvg={qr}
        checklist={check.items.map((i) => ({ key: i.key, label: label(i.key, i.label), done: i.done, href: FIX[i.key] ?? i.href }))}
      />
    </SettingsShell>
  );
}
