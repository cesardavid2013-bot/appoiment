import type { Metadata } from "next";
import { PromoCodes } from "@/components/pro/promo-codes";
import { SpotlightPanel } from "@/components/pro/spotlight-panel";
import { Badge, PageHeader } from "@/components/ui/misc";
import { requestNow } from "@/server/clock";
import { proPage } from "@/server/pro-page";
import { listPromotions, promotableServices } from "@/server/services/promotions-admin";
import { getSpotlight, MAX_PROMOTED_PER_SEARCH } from "@/server/services/spotlight";

export const metadata: Metadata = { title: "Promote" };

export default async function PromotePage() {
  const { m } = await proPage("promotions.manage");
  const now = requestNow();
  const [spotlight, promos, services] = await Promise.all([getSpotlight(m), listPromotions(m, new Date(now)), promotableServices(m.businessId)]);

  return (
    <div className="mx-auto max-w-4xl px-4 pb-16 pt-8 sm:px-6 lg:px-10 lg:pt-10">
      <PageHeader title="Promote" description="Get in front of more people searching on Kept, and give clients a reason to book." />

      <section aria-labelledby="spotlight-h" className="mt-10">
        <div className="mb-1 flex flex-wrap items-center gap-2">
          <h2 id="spotlight-h" className="text-lg font-semibold tracking-[-0.01em] text-ink">
            Spotlight
          </h2>
          {spotlight.priceCentsPerDay === 0 && <Badge tone="accent">Free during launch</Badge>}
        </div>
        <p className="mb-4 max-w-2xl text-sm text-ink-3">Your profile leads the results when people nearby search for what you offer.</p>

        <div className="grid gap-8 lg:grid-cols-[minmax(0,1fr)_260px]">
          <SpotlightPanel
            current={spotlight.current}
            past={spotlight.past}
            categories={spotlight.categories}
            blockedReason={spotlight.blockedReason}
            timezone={m.timezone}
            now={now}
            canPublish={m.permissions.has("business.manage")}
          />
          <aside aria-labelledby="how-h" className="text-[13px] leading-relaxed text-ink-3">
            <h3 id="how-h" className="mb-2 text-[13px] font-semibold text-ink-2">
              How it works
            </h3>
            <dl className="space-y-3">
              <div>
                <dt className="font-medium text-ink-2">Where you appear</dt>
                <dd>
                  At the top of the first page of search and category results you already match — location and filters still apply. At most {MAX_PROMOTED_PER_SEARCH} promoted
                  profiles per search.
                </dd>
              </div>
              <div>
                <dt className="font-medium text-ink-2">Always labelled</dt>
                <dd>Customers see &ldquo;Promoted&rdquo; next to your name, along with your real rating and openings.</dd>
              </div>
              <div>
                <dt className="font-medium text-ink-2">Fair rotation</dt>
                <dd>When more businesses are promoted than there are spots, they&apos;re picked in random order on each search so everyone gets a fair share.</dd>
              </div>
              <div>
                <dt className="font-medium text-ink-2">Cost</dt>
                <dd>Free while Kept is launching. If that changes we&apos;ll tell you before anything is charged — it never switches to paid on its own.</dd>
              </div>
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
