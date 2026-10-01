import { Megaphone } from "lucide-react";
import type { Metadata } from "next";
import Link from "next/link";
import { EndCampaignButton } from "@/components/admin/end-campaign-button";
import { AdminHeader, FilterTabs, flatParams, fmtDay, fmtInt, Metric, Pager, pageParam, Panel, pct, StatusBadge, Table, TBody, Td, Th, THead, Tr } from "@/components/admin/ui";
import { EmptyState } from "@/components/ui/misc";
import { requireAdminPage } from "@/server/admin-guard";
import { listSpotlightCampaigns } from "@/server/services/admin";

export const metadata: Metadata = { title: "Spotlight" };

const PATH = "/admin/spotlight";

export default async function AdminSpotlightPage({ searchParams }: PageProps<"/admin/spotlight">) {
  await requireAdminPage("admin");
  const params = flatParams(await searchParams);
  const res = await listSpotlightCampaigns({ tab: params.tab, page: pageParam(params.page) });
  const t = res.totals;

  return (
    <>
      <AdminHeader title="Spotlight" description="Promoted placements in search. Customers always see these labelled “Promoted”." />
      <div className="mb-6 grid grid-cols-2 gap-3 lg:grid-cols-4">
        <Metric label="Live campaigns" value={fmtInt(t.live)} sub={`${fmtInt(t.active)} running · ${fmtInt(t.live - t.active)} paused`} />
        <Metric label="Impressions" value={fmtInt(t.impressions)} sub="Across live campaigns" />
        <Metric label="Clicks" value={fmtInt(t.clicks)} sub="Across live campaigns" />
        <Metric label="Click-through rate" value={pct(t.clicks, t.impressions)} sub="Clicks ÷ impressions" />
      </div>
      <div className="mb-4">
        <FilterTabs
          path={PATH}
          params={params}
          name="tab"
          value={res.tab}
          label="Campaign state"
          options={[
            { value: "live", label: "Active & paused" },
            { value: "ended", label: "Ended" },
          ]}
        />
      </div>
      <Panel>
        {res.items.length === 0 ? (
          <EmptyState icon={<Megaphone />} title={res.tab === "live" ? "No live campaigns" : "No ended campaigns"} description={res.tab === "live" ? "Businesses start Spotlight campaigns from their dashboard." : undefined} />
        ) : (
          <Table label="Spotlight campaigns" className="[&_table]:min-w-[860px]">
            <THead>
              <Th>Business</Th>
              <Th>Status</Th>
              <Th>Targeting</Th>
              <Th>Runs</Th>
              <Th align="right">Impressions</Th>
              <Th align="right">Clicks</Th>
              <Th align="right">CTR</Th>
              <Th />
            </THead>
            <TBody>
              {res.items.map((c) => (
                <Tr key={c.id}>
                  <Td>
                    <Link href={`/admin/businesses/${c.businessId}`} className="font-medium hover:underline">
                      {c.businessName}
                    </Link>
                    <div className="font-mono text-[12px] text-ink-3">/{c.businessSlug}</div>
                  </Td>
                  <Td>{c.expired ? <StatusBadge value="ended" label="Expired" /> : <StatusBadge value={c.status} />}</Td>
                  <Td className="text-ink-2">{c.categoryName ?? "All searches"}</Td>
                  <Td className="whitespace-nowrap text-ink-2">
                    {fmtDay(c.startsAt)} – {fmtDay(c.endsAt)}
                  </Td>
                  <Td align="right">{fmtInt(c.impressions)}</Td>
                  <Td align="right">{fmtInt(c.clicks)}</Td>
                  <Td align="right">{pct(c.clicks, c.impressions)}</Td>
                  <Td align="right">{res.tab === "live" && <EndCampaignButton id={c.id} businessName={c.businessName} />}</Td>
                </Tr>
              ))}
            </TBody>
          </Table>
        )}
        <Pager path={PATH} params={params} page={res.page} hasMore={res.hasMore} />
      </Panel>
    </>
  );
}
