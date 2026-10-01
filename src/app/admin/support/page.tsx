import { LifeBuoy } from "lucide-react";
import type { Metadata } from "next";
import { AdminHeader, CellLink, FilterForm, FilterTabs, flatParams, humanize, Pager, pageParam, Panel, StatusBadge, Table, TBody, Td, Th, THead, Tr, When } from "@/components/admin/ui";
import { Badge, EmptyState } from "@/components/ui/misc";
import { requireAdminPage } from "@/server/admin-guard";
import { listTickets } from "@/server/services/admin-support";

export const metadata: Metadata = { title: "Support inbox" };

const PATH = "/admin/support";

export default async function AdminSupportPage({ searchParams }: PageProps<"/admin/support">) {
  await requireAdminPage("support");
  const params = flatParams(await searchParams);
  const res = await listTickets({ status: params.status, q: params.q, page: pageParam(params.page) });

  return (
    <>
      <AdminHeader title="Support inbox" description="Requests from customers and professionals. Open tickets are sorted longest-waiting first." />
      <div className="mb-4 space-y-3">
        <FilterTabs
          path={PATH}
          params={params}
          name="status"
          value={res.status}
          label="Ticket status"
          options={[
            { value: "open", label: "Open" },
            { value: "awaiting_customer", label: "Awaiting customer" },
            { value: "resolved", label: "Resolved" },
            { value: "closed", label: "Closed" },
            { value: "all", label: "All" },
          ]}
        />
        <FilterForm path={PATH} params={params} keep={["status"]} q={{ label: "Search tickets" }} placeholder="Subject, name or email" />
      </div>
      <Panel>
        {res.items.length === 0 ? (
          <EmptyState icon={<LifeBuoy />} title={res.status === "open" ? "Inbox zero" : "No tickets here"} description={res.status === "open" ? "No one is waiting on a reply." : undefined} />
        ) : (
          <Table label="Support tickets">
            <THead>
              <Th className="w-[38%]">Subject</Th>
              <Th>From</Th>
              <Th>Category</Th>
              <Th>Status</Th>
              <Th>Last activity</Th>
            </THead>
            <TBody>
              {res.items.map((t) => (
                <Tr key={t.id}>
                  <Td>
                    <CellLink
                      href={`${PATH}/${t.id}`}
                      title={t.subject}
                      sub={
                        <>
                          {t.messageCount} message{t.messageCount === 1 ? "" : "s"}
                          {t.businessName ? ` · ${t.businessName}` : ""}
                        </>
                      }
                    />
                  </Td>
                  <Td>
                    {t.userName}
                    <div className="max-w-[200px] truncate text-[13px] text-ink-3">{t.userEmail}</div>
                  </Td>
                  <Td className="text-ink-2">{humanize(t.category)}</Td>
                  <Td>
                    <div className="flex flex-col items-start gap-1">
                      <StatusBadge value={t.status} />
                      {t.lastFromStaff === false && t.status !== "closed" && <Badge tone="attention">Needs reply</Badge>}
                    </div>
                  </Td>
                  <Td className="text-ink-2">
                    <When at={t.lastActivityAt} />
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
