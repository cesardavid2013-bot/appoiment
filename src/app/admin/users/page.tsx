import type { Metadata } from "next";
import { AdminHeader, CellLink, FilterForm, flatParams, Pager, pageParam, Panel, StatusBadge, Table, TableEmpty, TBody, Td, Th, THead, Tr, When } from "@/components/admin/ui";
import { requireAdminPage } from "@/server/admin-guard";
import { listUsers } from "@/server/services/admin";

export const metadata: Metadata = { title: "Users" };

const PATH = "/admin/users";

export default async function AdminUsersPage({ searchParams }: PageProps<"/admin/users">) {
  await requireAdminPage("support");
  const params = flatParams(await searchParams);
  const res = await listUsers({ q: params.q, role: params.role, status: params.status, page: pageParam(params.page) });

  return (
    <>
      <AdminHeader title="Users" description="Everyone with a Kept account — customers, professionals and staff." />
      <div className="mb-4">
        <FilterForm
          path={PATH}
          params={params}
          q={{ label: "Search users" }}
          placeholder="Name, email or user ID"
          selects={[
            {
              name: "status",
              label: "Status",
              options: [
                { value: "", label: "Any status" },
                { value: "active", label: "Active" },
                { value: "suspended", label: "Suspended" },
                { value: "deleted", label: "Deleted" },
              ],
            },
            {
              name: "role",
              label: "Platform role",
              options: [
                { value: "", label: "Any role" },
                { value: "user", label: "User" },
                { value: "support", label: "Support" },
                { value: "admin", label: "Admin" },
              ],
            },
          ]}
        />
      </div>
      <Panel>
        {res.items.length === 0 ? (
          <TableEmpty title="No users match" description="Try a different name or email, or clear the filters." />
        ) : (
          <Table label="Users">
            <THead>
              <Th>User</Th>
              <Th>Status</Th>
              <Th>Role</Th>
              <Th align="right">Businesses</Th>
              <Th>Joined</Th>
              <Th>Last sign-in</Th>
            </THead>
            <TBody>
              {res.items.map((u) => (
                <Tr key={u.id}>
                  <Td>
                    <CellLink href={`${PATH}/${u.id}`} title={u.name} sub={u.email ?? "No email"} />
                  </Td>
                  <Td>
                    <StatusBadge value={u.status} />
                  </Td>
                  <Td>{u.platformRole === "user" ? <span className="text-ink-3">User</span> : <StatusBadge value={u.platformRole} />}</Td>
                  <Td align="right">{u.businesses || <span className="text-ink-3">0</span>}</Td>
                  <Td className="text-ink-2">
                    <When at={u.createdAt} />
                  </Td>
                  <Td className="text-ink-2">
                    <When at={u.lastLoginAt} />
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
