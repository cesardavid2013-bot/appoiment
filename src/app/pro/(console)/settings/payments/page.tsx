import type { Metadata } from "next";
import Link from "next/link";
import { eq } from "drizzle-orm";
import { ConnectStripeButton } from "@/components/pro/payments-connect";
import { SettingsCard, SettingsShell } from "@/components/pro/settings-shell";
import { Badge } from "@/components/ui/misc";
import { entitlements } from "@/domain/plans";
import { rich } from "@/i18n/rich";
import { getI18n, getT } from "@/i18n/server";
import { db } from "@/server/db/client";
import { businesses } from "@/server/db/schema";
import { features } from "@/server/env";
import { log } from "@/server/logger";
import { proPage } from "@/server/pro-page";
import { syncConnectAccount } from "@/server/services/payments";

export async function generateMetadata(): Promise<Metadata> {
  const t = await getT("proSettings");
  return { title: t("payments.title") };
}

const pct = (bps: number, intl: string) => new Intl.NumberFormat(intl, { style: "percent", maximumFractionDigits: 1 }).format(bps / 10000);

export default async function PaymentsSettingsPage({ searchParams }: PageProps<"/pro/settings/payments">) {
  const { m } = await proPage("business.manage");
  const [sp, t, { intl }] = await Promise.all([searchParams, getT("proSettings"), getI18n()]);
  let [b] = await db.select({ stripeAccountId: businesses.stripeAccountId, paymentsEnabled: businesses.paymentsEnabled }).from(businesses).where(eq(businesses.id, m.businessId));
  // Coming back from Stripe onboarding: refresh status now rather than waiting for the webhook.
  if (features.stripe && b.stripeAccountId && (sp.return || sp.refresh)) {
    await syncConnectAccount(b.stripeAccountId).catch((err) => log.warn("payments.sync_failed", { err }));
    [b] = await db.select({ stripeAccountId: businesses.stripeAccountId, paymentsEnabled: businesses.paymentsEnabled }).from(businesses).where(eq(businesses.id, m.businessId));
  }
  const fee = entitlements(m.plan).applicationFeeBps;
  const state = !features.stripe ? "unavailable" : b.paymentsEnabled ? "connected" : b.stripeAccountId ? "incomplete" : "none";

  return (
    <SettingsShell title={t("payments.title")} description={t("payments.description")} perms={[...m.permissions]}>
      <SettingsCard id="status-h" title={t("payments.online.title")} description={state === "unavailable" ? undefined : t("payments.online.description")}>
        {state === "unavailable" && (
          <div className="space-y-2 text-sm leading-relaxed text-ink-2">
            <p>
              <Badge>{t("payments.unavailable.badge")}</Badge>
            </p>
            <p>{t("payments.unavailable.body")}</p>
            <p className="text-ink-3">{t("payments.unavailable.note")}</p>
          </div>
        )}
        {state === "none" && (
          <div className="space-y-4">
            <ul className="space-y-1.5 text-sm text-ink-2">
              <li>· {t("payments.none.deposits")}</li>
              <li>· {t("payments.none.fees")}</li>
              <li>· {t("payments.none.tips")}</li>
            </ul>
            <ConnectStripeButton label={t("payments.none.connect")} />
            <p className="text-[13px] text-ink-3">{t("payments.none.time")}</p>
          </div>
        )}
        {state === "incomplete" && (
          <div className="space-y-4">
            <p className="flex items-center gap-2 text-sm text-ink-2">
              <Badge tone="attention">{t("payments.incomplete.badge")}</Badge> {t("payments.incomplete.body")}
            </p>
            <ConnectStripeButton label={t("payments.incomplete.continue")} />
          </div>
        )}
        {state === "connected" && (
          <div className="space-y-2 text-sm text-ink-2">
            <p className="flex items-center gap-2">
              <Badge tone="positive">{t("payments.connected.badge")}</Badge> {t("payments.connected.body")}
            </p>
            <p className="text-ink-3">
              {rich(t("payments.connected.services"), {
                link: (c) => (
                  <Link href="/pro/services" className="font-medium text-ink underline underline-offset-2">
                    {c}
                  </Link>
                ),
              })}
            </p>
          </div>
        )}
      </SettingsCard>

      <SettingsCard id="fees-h" title={t("payments.fees.title")}>
        <dl className="divide-y divide-line text-sm">
          <div className="flex justify-between gap-4 py-2.5">
            <dt className="text-ink-3">{t("payments.fees.kept")}</dt>
            <dd className="font-medium text-ink tabular">{pct(fee, intl)}</dd>
          </div>
          <div className="flex justify-between gap-4 py-2.5">
            <dt className="text-ink-3">{t("payments.fees.inPerson")}</dt>
            <dd className="font-medium text-ink">{t("payments.fees.noFee")}</dd>
          </div>
          <div className="flex justify-between gap-4 py-2.5">
            <dt className="text-ink-3">{t("payments.fees.processing")}</dt>
            <dd className="text-end font-medium text-ink">{t("payments.fees.stripeRate")}</dd>
          </div>
        </dl>
      </SettingsCard>
    </SettingsShell>
  );
}
