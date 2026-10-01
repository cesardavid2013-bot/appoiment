import type { Metadata } from "next";
import { PromoCodes } from "@/components/pro/promo-codes";
import { SpotlightPanel } from "@/components/pro/spotlight-panel";
import { Badge, PageHeader } from "@/components/ui/misc";
import { getT } from "@/i18n/server";
import { requestNow } from "@/server/clock";
import { proPage } from "@/server/pro-page";
import { listPromotions, promotableServices } from "@/server/services/promotions-admin";
import { getSpotlight, MAX_PROMOTED_PER_SEARCH } from "@/server/services/spotlight";

export async function generateMetadata(): Promise<Metadata> {
  const t = await getT("pro");
  return { title: t("nav.promote") };
}

export default async function PromotePage() {
  const { m } = await proPage("promotions.manage");
  const t = await getT("pro");
  const now = requestNow();
  const [spotlight, promos, services] = await Promise.all([getSpotlight(m), listPromotions(m, new Date(now)), promotableServices(m.businessId)]);
  // The service explains in English why Spotlight is unavailable; the reason only depends on the business status.
  const blockedReason = spotlight.blockedReason ? t(m.businessStatus === "draft" ? "promote.blocked.draft" : m.businessStatus === "suspended" ? "promote.blocked.suspended" : "promote.blocked.closed") : null;

  return (
    <div className="mx-auto max-w-4xl px-4 pb-16 pt-8 sm:px-6 lg:px-10 lg:pt-10">
      <PageHeader title={t("nav.promote")} description={t("promote.description")} />

      <section aria-labelledby="spotlight-h" className="mt-10">
        <div className="mb-1 flex flex-wrap items-center gap-2">
          <h2 id="spotlight-h" className="text-lg font-semibold tracking-[-0.01em] text-ink">
            {t("promote.spotlight")}
          </h2>
          {spotlight.priceCentsPerDay === 0 && <Badge tone="accent">{t("promote.freeLaunch")}</Badge>}
        </div>
        <p className="mb-4 max-w-2xl text-sm text-ink-3">{t("promote.spotlightBody")}</p>

        <div className="grid gap-8 lg:grid-cols-[minmax(0,1fr)_260px]">
          <SpotlightPanel
            current={spotlight.current}
            past={spotlight.past}
            categories={spotlight.categories}
            blockedReason={blockedReason}
            timezone={m.timezone}
            now={now}
            canPublish={m.permissions.has("business.manage")}
          />
          <aside aria-labelledby="how-h" className="text-[13px] leading-relaxed text-ink-3">
            <h3 id="how-h" className="mb-2 text-[13px] font-semibold text-ink-2">
              {t("promote.how.title")}
            </h3>
            <dl className="space-y-3">
              {(["where", "labelled", "rotation", "cost"] as const).map((k) => (
                <div key={k}>
                  <dt className="font-medium text-ink-2">{t(`promote.how.${k}.title`)}</dt>
                  <dd>{t(`promote.how.${k}.body`, { max: MAX_PROMOTED_PER_SEARCH })}</dd>
                </div>
              ))}
            </dl>
          </aside>
        </div>
      </section>

      <section aria-labelledby="codes-h" className="mt-14">
        <PromoCodes items={promos} services={services} currency={m.currency} />
      </section>
    </div>
  );
}
