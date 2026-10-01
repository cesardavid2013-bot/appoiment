import type { Metadata } from "next";
import Link from "next/link";
import { eq } from "drizzle-orm";
import { ConnectStripeButton } from "@/components/pro/payments-connect";
import { SettingsCard, SettingsShell } from "@/components/pro/settings-shell";
import { Badge } from "@/components/ui/misc";
import { entitlements } from "@/domain/plans";
import { db } from "@/server/db/client";
import { businesses } from "@/server/db/schema";
import { features } from "@/server/env";
import { log } from "@/server/logger";
import { proPage } from "@/server/pro-page";
import { syncConnectAccount } from "@/server/services/payments";

export const metadata: Metadata = { title: "Payments" };

const pct = (bps: number) => `${(bps / 100).toFixed(bps % 100 ? 1 : 0)}%`;

export default async function PaymentsSettingsPage({ searchParams }: PageProps<"/pro/settings/payments">) {
  const { m } = await proPage("business.manage");
  const sp = await searchParams;
  let [b] = await db.select({ stripeAccountId: businesses.stripeAccountId, paymentsEnabled: businesses.paymentsEnabled }).from(businesses).where(eq(businesses.id, m.businessId));
  // Coming back from Stripe onboarding: refresh status now rather than waiting for the webhook.
  if (features.stripe && b.stripeAccountId && (sp.return || sp.refresh)) {
    await syncConnectAccount(b.stripeAccountId).catch((err) => log.warn("payments.sync_failed", { err }));
    [b] = await db.select({ stripeAccountId: businesses.stripeAccountId, paymentsEnabled: businesses.paymentsEnabled }).from(businesses).where(eq(businesses.id, m.businessId));
  }
  const fee = entitlements(m.plan).applicationFeeBps;
  const state = !features.stripe ? "unavailable" : b.paymentsEnabled ? "connected" : b.stripeAccountId ? "incomplete" : "none";

  return (
    <SettingsShell title="Payments" description="Take deposits or full payment when clients book. Paying in person always works too." perms={[...m.permissions]}>
      <SettingsCard
        id="status-h"
        title="Online payments"
        description={
          state === "unavailable"
            ? undefined
            : "Payments are processed by Stripe and paid out to your bank account. Kept never sees card numbers."
        }
      >
        {state === "unavailable" && (
          <div className="space-y-2 text-sm leading-relaxed text-ink-2">
            <p>
              <Badge>Not available yet</Badge>
            </p>
            <p>Card payments aren&rsquo;t switched on for Kept yet. Until they are, clients pay you at the appointment, and you can record each payment — cash, card reader or transfer — from the appointment page so your records and Insights stay accurate.</p>
            <p className="text-ink-3">Nothing to do here for now. Deposits and policies you set will start applying once online payments open.</p>
          </div>
        )}
        {state === "none" && (
          <div className="space-y-4">
            <ul className="space-y-1.5 text-sm text-ink-2">
              <li>· Require a deposit or full payment per service</li>
              <li>· Keep late-cancellation fees from deposits automatically</li>
              <li>· Let clients add a tip after the visit</li>
            </ul>
            <ConnectStripeButton label="Set up payments with Stripe" />
            <p className="text-[13px] text-ink-3">Takes about 5 minutes. You&rsquo;ll need your bank details and an ID.</p>
          </div>
        )}
        {state === "incomplete" && (
          <div className="space-y-4">
            <p className="flex items-center gap-2 text-sm text-ink-2">
              <Badge tone="attention">Setup not finished</Badge> Stripe still needs a few details before you can take payments.
            </p>
            <ConnectStripeButton label="Continue setup" />
          </div>
        )}
        {state === "connected" && (
          <div className="space-y-2 text-sm text-ink-2">
            <p className="flex items-center gap-2">
              <Badge tone="positive">Connected</Badge> You can take deposits and payments online.
            </p>
            <p className="text-ink-3">
              Choose what to collect for each service in{" "}
              <Link href="/pro/services" className="font-medium text-ink underline underline-offset-2">
                Services
              </Link>
              .
            </p>
          </div>
        )}
      </SettingsCard>

      <SettingsCard id="fees-h" title="Fees">
        <dl className="divide-y divide-line text-sm">
          <div className="flex justify-between gap-4 py-2.5">
            <dt className="text-ink-3">Kept fee on online payments</dt>
            <dd className="font-medium text-ink tabular">{pct(fee)}</dd>
          </div>
          <div className="flex justify-between gap-4 py-2.5">
            <dt className="text-ink-3">Payments taken in person</dt>
            <dd className="font-medium text-ink">No Kept fee</dd>
          </div>
          <div className="flex justify-between gap-4 py-2.5">
            <dt className="text-ink-3">Card processing</dt>
            <dd className="text-right font-medium text-ink">Stripe&rsquo;s standard rate</dd>
          </div>
        </dl>
      </SettingsCard>
    </SettingsShell>
  );
}
