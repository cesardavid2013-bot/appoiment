import { ChevronRight } from "lucide-react";
import type { Metadata } from "next";
import Link from "next/link";
import { AdminHeader, flatParams, fmtClock, fmtDay, fmtStamp, hrefWith, humanize, MetaChips, Panel, Table, TableEmpty, TBody, Td, Th, THead, Tr } from "@/components/admin/ui";
import { buttonClass } from "@/components/ui/button";
import { requireAdminPage } from "@/server/admin-guard";
import { listAuditLogs } from "@/server/services/admin";

export const metadata: Metadata = { title: "Audit log" };

const PATH = "/admin/audit";
const INPUT =
  "h-10 w-full rounded-md border border-line-strong bg-surface px-3 text-ink placeholder:text-ink-3 focus:border-accent focus:outline-none focus:ring-3 focus:ring-accent/15";

function targetHref(type: string | null, id: string | null) {
  if (!type || !id) return null;
  switch (type) {
    case "user":
      return `/admin/users/${id}`;
    case "business":
      return `/admin/businesses/${id}`;
    case "appointment":
      return `/admin/appointments/${id}`;
    case "support_ticket":
      return `/admin/support/${id}`;
    default:
      return null;
  }
}

export default async function AdminAuditPage({ searchParams }: PageProps<"/admin/audit">) {
  await requireAdminPage("admin");
  const params = flatParams(await searchParams);
  const before = Number(params.before);
  const res = await listAuditLogs({
    action: params.action,
    businessId: params.business,
    actor: params.actor,
    actorType: params.actorType,
    before: Number.isSafeInteger(before) && before > 0 ? before : undefined,
  });

  return (
    <>
      <AdminHeader title="Audit log" description="Security- and money-relevant actions across the platform, newest first. Times are UTC." />
      <form action={PATH} method="get" role="search" className="mb-4 grid gap-2 sm:grid-cols-2 lg:grid-cols-[minmax(0,1.3fr)_minmax(0,1fr)_minmax(0,1fr)_auto_auto]">
        <label>
          <span className="sr-only">Action prefix</span>
          <input name="action" defaultValue={params.action ?? ""} placeholder="Action prefix, e.g. admin.user" className={INPUT} />
        </label>
        <label>
          <span className="sr-only">Actor email or user ID</span>
          <input name="actor" defaultValue={params.actor ?? ""} placeholder="Actor email or user ID" className={INPUT} />
        </label>
        <label>
          <span className="sr-only">Business ID</span>
          <input name="business" defaultValue={params.business ?? ""} placeholder="Business ID" className={INPUT} />
        </label>
        <label className="relative">
          <span className="sr-only">Actor type</span>
          <select name="actorType" defaultValue={params.actorType ?? ""} className={`${INPUT} cursor-pointer appearance-none pr-9`}>
            <option value="">Any actor</option>
            <option value="admin">Admin</option>
            <option value="business">Business</option>
            <option value="customer">Customer</option>
            <option value="system">System</option>
          </select>
          <svg className="pointer-events-none absolute right-3 top-1/2 size-4 -translate-y-1/2 text-ink-3" viewBox="0 0 16 16" fill="none" aria-hidden>
            <path d="M4 6l4 4 4-4" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" />
          </svg>
        </label>
        <div className="flex gap-2">
          <button type="submit" className={buttonClass("primary", "md", "h-10")}>
            Apply
          </button>
          {(params.action || params.actor || params.business || params.actorType) && (
            <Link href={PATH} className={buttonClass("ghost", "md", "h-10")}>
              Clear
            </Link>
          )}
        </div>
      </form>
      {res.actorNotFound && (
        <p className="-mt-2 mb-4 text-[13px] text-danger" role="alert">
          No user has that email address.
        </p>
      )}

      <Panel>
        {res.items.length === 0 ? (
          <TableEmpty title="No audit entries match" description="Try a shorter action prefix or remove a filter." />
        ) : (
          <Table label="Audit log" className="[&_table]:min-w-[960px]">
            <THead>
              <Th>When</Th>
              <Th>Action</Th>
              <Th>Actor</Th>
              <Th>Target</Th>
              <Th>Details</Th>
            </THead>
            <TBody>
              {res.items.map((e) => {
                const th = targetHref(e.targetType, e.targetId);
                return (
                  <Tr key={e.id}>
                    <Td className="whitespace-nowrap text-[13px] text-ink-2 tabular">
                      <time dateTime={new Date(e.createdAt).toISOString()} title={fmtStamp(e.createdAt)}>
                        {fmtDay(e.createdAt)}
                        <span className="block text-ink-3">{fmtClock(e.createdAt)}</span>
                      </time>
                    </Td>
                    <Td>
                      <Link href={hrefWith(PATH, { action: e.action })} className="font-mono text-[12.5px] text-ink hover:underline">
                        {e.action}
                      </Link>
                      {e.businessId && (
                        <div className="mt-0.5 text-[13px]">
                          <Link href={hrefWith(PATH, { ...params, business: e.businessId, before: undefined })} className="text-ink-3 hover:text-ink hover:underline">
                            {e.businessName}
                          </Link>
                        </div>
                      )}
                    </Td>
                    <Td>
                      <span className="text-[13px] text-ink-3">{humanize(e.actorType)}</span>
                      {e.actorId ? (
                        <div>
                          <Link href={hrefWith(PATH, { ...params, actor: e.actorId, before: undefined })} className="hover:underline">
                            {e.actorName}
                          </Link>
                        </div>
                      ) : null}
                    </Td>
                    <Td className="text-[13px]">
                      {e.targetType ? (
                        th ? (
                          <Link href={th} className="hover:underline">
                            {humanize(e.targetType)}
                          </Link>
                        ) : (
                          humanize(e.targetType)
                        )
                      ) : (
                        <span className="text-ink-3">—</span>
                      )}
                      {e.targetId && <div className="max-w-[160px] truncate font-mono text-[11.5px] text-ink-3" title={e.targetId}>{e.targetId}</div>}
                    </Td>
                    <Td>
                      <MetaChips meta={e.metadata} />
                    </Td>
                  </Tr>
                );
              })}
            </TBody>
          </Table>
        )}
        {(res.nextBefore || params.before) && (
          <nav className="flex items-center justify-between gap-3 border-t border-line px-4 py-3" aria-label="Pagination">
            {params.before ? (
              <Link href={hrefWith(PATH, { ...params, before: undefined })} className={buttonClass("ghost", "sm")}>
                Back to newest
              </Link>
            ) : (
              <span />
            )}
            {res.nextBefore ? (
              <Link href={hrefWith(PATH, { ...params, before: String(res.nextBefore) })} className={buttonClass("secondary", "sm")} rel="next">
                Older
                <ChevronRight className="size-4" aria-hidden />
              </Link>
            ) : (
              <span className="text-[13px] text-ink-3">End of log</span>
            )}
          </nav>
        )}
      </Panel>
    </>
  );
}
