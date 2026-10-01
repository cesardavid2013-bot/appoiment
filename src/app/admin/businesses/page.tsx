import type { Metadata } from "next";
import Link from "next/link";
import { AdminHeader, CellLink, FilterForm, flatParams, Pager, pageParam, Panel, StatusBadge, Table, TableEmpty, TBody, Td, Th, THead, Tr, When } from "@/components/admin/ui";
import { RatingInline } from "@/components/ui/misc";
import { PLANS } from "@/domain/plans";
import { requireAdminPage } from "@/server/admin-guard";
import { listBusinesses } from "@/server/services/admin";

export const metadata: Metadata = { title: "Businesses" };

const PATH = "/admin/businesses";

export default async function AdminBusinessesPage({ searchParams }: PageProps<"/admin/businesses">) {
  await requireAdminPage("support");
  const params = flatParams(await searchParams);
  const res = await listBusinesses({ q: params.q, status: params.status, verification: params.verification, plan: params.plan, page: pageParam(params.page) });

  return (
    <>
      <AdminHeader title="Businesses" description="Every professional and business profile, live or not." />
      <div className="mb-4">
        <FilterForm
          path={PATH}
          params={params}
          q={{ label: "Search businesses" }}
          placeholder="Name, handle or owner email"
          selects={[
            {
              name: "status",
              label: "Status",
              options: [
                { value: "", label: "Any status" },
                { value: "active", label: "Active" },
                { value: "draft", label: "Draft" },
                { value: "suspended", label: "Suspended" },
                { value: "closed", label: "Closed" },
              ],
            },
            {
              name: "verification",
              label: "Verification",
              options: [
                { value: "", label: "Any verification" },
                { value: "verified", label: "Verified" },
                { value: "pending", label: "Pending" },
                { value: "needs_info", label: "Needs info" },
                { value: "rejected", label: "Rejected" },
                { value: "not_submitted", label: "Not submitted" },
              ],
            },
            {
              name: "plan",
              label: "Plan",
              options: [{ value: "", label: "Any plan" }, ...Object.entries(PLANS).map(([value, p]) => ({ value, label: p.label }))],
            },
          ]}
        />
      </div>
      <Panel>
        {res.items.length === 0 ? (
          <TableEmpty title="No businesses match" description="Try a different search or clear the filters." />
        ) : (
          <Table label="Businesses">
            <THead>
              <Th>Business</Th>
              <Th>Status</Th>
              <Th>Verification</Th>
              <Th>Plan</Th>
              <Th>Owner</Th>
              <Th>Rating</Th>
              <Th>Created</Th>
            </THead>
            <TBody>
              {res.items.map((b) => (
                <Tr key={b.id}>
                  <Td>
                    <CellLink href={`${PATH}/${b.id}`} title={b.name} sub={[`/${b.slug}`, b.city].filter(Boolean).join(" · ")} />
                  </Td>
                  <Td>
                    <StatusBadge value={b.status} />
                  </Td>
                  <Td>
                    <StatusBadge value={b.verificationStatus} />
                  </Td>
                  <Td className="text-ink-2">{PLANS[b.plan].label}</Td>
                  <Td>
                    <Link href={`/admin/users/${b.ownerId}`} className="hover:underline">
                      {b.ownerName}
                    </Link>
                    <div className="max-w-[220px] truncate text-[13px] text-ink-3">{b.ownerEmail}</div>
                  </Td>
                  <Td>
                    <RatingInline avg={b.ratingAvg} count={b.ratingCount} />
                  </Td>
                  <Td className="text-ink-2">
                    <When at={b.createdAt} />
                  </Td>
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
