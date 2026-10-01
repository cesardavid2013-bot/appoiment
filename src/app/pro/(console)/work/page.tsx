import { ExternalLink } from "lucide-react";
import type { Metadata } from "next";
import { and, asc, eq, sql } from "drizzle-orm";
import { PortfolioManager } from "@/components/pro/portfolio-manager";
import { SocialEmbedsManager } from "@/components/pro/social-embeds-manager";
import { ButtonLink } from "@/components/ui/button";
import { PageHeader } from "@/components/ui/misc";
import { db } from "@/server/db/client";
import { businessMembers, services } from "@/server/db/schema";
import { proPage } from "@/server/pro-page";
import { listPortfolio } from "@/server/services/portfolio";
import { listSocialEmbeds } from "@/server/services/social-embeds";

export const metadata: Metadata = { title: "Portfolio" };

export default async function WorkPage() {
  const { m } = await proPage("portfolio.manage");
  const [items, svc, team, embeds] = await Promise.all([
    listPortfolio(m.businessId),
    db
      .select({ id: services.id, name: services.name })
      .from(services)
      .where(and(eq(services.businessId, m.businessId), sql`${services.status} <> 'archived'`))
      .orderBy(asc(services.sortOrder), asc(services.name)),
    db
      .select({ id: businessMembers.id, name: businessMembers.displayName })
      .from(businessMembers)
      .where(and(eq(businessMembers.businessId, m.businessId), eq(businessMembers.status, "active")))
      .orderBy(asc(businessMembers.sortOrder), asc(businessMembers.displayName)),
    listSocialEmbeds(m.businessId),
  ]);

  return (
    <div className="mx-auto max-w-6xl px-4 pb-16 pt-8 sm:px-6 lg:px-10 lg:pt-10">
      <PageHeader
        title="Portfolio"
        description="Photos and videos of your work, shown in the Work section of your profile. Link a piece to a service and customers can book it in one tap."
        actions={
          m.businessStatus === "active" ? (
            <ButtonLink href={`/${m.businessSlug}#work`} target="_blank" variant="ghost" size="sm" icon={<ExternalLink className="size-4" />}>
              View on profile
            </ButtonLink>
          ) : undefined
        }
      />
      <div className="mt-8">
        <PortfolioManager items={items} businessId={m.businessId} services={svc} team={team} />
      </div>
      <div className="mt-14 border-t border-line pt-10">
        <SocialEmbedsManager items={embeds} services={svc} />
      </div>
    </div>
  );
}
