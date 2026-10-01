import { Check, Flag, X } from "lucide-react";
import type { Metadata } from "next";
import Link from "next/link";
import { ActionButton } from "@/components/admin/action-button";
import { AdminHeader, FilterForm, FilterTabs, flatParams, fmtStamp, humanize, Pager, pageParam, Panel, StatusBadge, When } from "@/components/admin/ui";
import { Badge, EmptyState, Stars } from "@/components/ui/misc";
import { requireAdminPage } from "@/server/admin-guard";
import { listReports, type ReportTarget } from "@/server/services/admin";

export const metadata: Metadata = { title: "Reports" };

const PATH = "/admin/reports";

function TargetPreview({ t }: { t: ReportTarget }) {
  switch (t.kind) {
    case "review":
      return (
        <div>
          <div className="flex flex-wrap items-center gap-2">
            <Stars value={t.rating} size={12} />
            <StatusBadge value={t.status} />
            <span className="text-[13px] text-ink-3">
              on{" "}
              <Link href={`/admin/businesses/${t.businessId}`} className="font-medium text-ink-2 hover:underline">
                {t.businessName}
              </Link>
            </span>
          </div>
          {t.body ? <p className="mt-1.5 whitespace-pre-line text-sm leading-relaxed text-ink-2">{t.body}</p> : <p className="mt-1.5 text-sm text-ink-3">Rating only, no text.</p>}
          <Link href={`/admin/reviews?q=${encodeURIComponent(t.businessName)}`} className="mt-1.5 inline-block text-[13px] font-medium text-ink-3 hover:text-ink hover:underline">
            See reviews for this business
          </Link>
        </div>
      );
    case "business":
      return (
        <div className="flex flex-wrap items-center gap-2 text-sm">
          <Link href={`/admin/businesses/${t.id}`} className="font-medium hover:underline">
            {t.name}
          </Link>
          <span className="font-mono text-[12px] text-ink-3">/{t.slug}</span>
          <StatusBadge value={t.status} />
        </div>
      );
    case "user":
      return (
        <div className="flex flex-wrap items-center gap-2 text-sm">
          <Link href={`/admin/users/${t.id}`} className="font-medium hover:underline">
            {t.name}
          </Link>
          <span className="text-ink-3">{t.email}</span>
          <StatusBadge value={t.status} />
        </div>
      );
    case "message":
      return <p className="whitespace-pre-line text-sm leading-relaxed text-ink-2">{t.deleted ? <span className="text-ink-3">Message was deleted by its sender.</span> : `“${t.body}”`}</p>;
    case "media":
      return t.url ? (
        <a href={t.url} target="_blank" rel="noopener noreferrer" className="inline-block max-w-full overflow-hidden rounded-md border border-line text-[11px] text-ink-3">
          {t.thumb ? (
            // eslint-disable-next-line @next/next/no-img-element
            <img src={t.thumb} alt="Reported media" className="h-24 w-auto object-cover" loading="lazy" />
          ) : (
            <span className="block px-3 py-2 text-sm">Open media</span>
          )}
        </a>
      ) : (
        <p className="text-sm text-ink-3">Media is no longer available.</p>
      );
    default:
      return <p className="text-sm text-ink-3">The reported item no longer exists.</p>;
  }
}

export default async function AdminReportsPage({ searchParams }: PageProps<"/admin/reports">) {
  await requireAdminPage("admin");
  const params = flatParams(await searchParams);
  const res = await listReports({ status: params.status, target: params.target, page: pageParam(params.page) });

  return (
    <>
      <AdminHeader title="Reports" description="Content and accounts flagged by the community. Acting on a report closes every open report on the same item." />
      <div className="mb-4 flex flex-col gap-3 md:flex-row md:items-center md:justify-between">
        <FilterTabs
          path={PATH}
          params={params}
          name="status"
          value={res.status}
          label="Report status"
          options={[
            { value: "open", label: "Open" },
            { value: "resolved", label: "Resolved" },
            { value: "dismissed", label: "Dismissed" },
          ]}
        />
        <FilterForm
          path={PATH}
          params={params}
          keep={["status"]}
          selects={[
            {
              name: "target",
              label: "Reported item",
              options: [
                { value: "", label: "All items" },
                { value: "review", label: "Reviews" },
                { value: "business", label: "Businesses" },
                { value: "user", label: "Users" },
                { value: "message", label: "Messages" },
                { value: "media", label: "Media" },
              ],
            },
          ]}
        />
      </div>

      {res.items.length === 0 ? (
        <Panel>
          <EmptyState icon={<Flag />} title={res.status === "open" ? "No open reports" : "Nothing here"} description={res.status === "open" ? "You're all caught up." : undefined} />
        </Panel>
      ) : (
        <ul className="space-y-3">
          {res.items.map((r) => (
            <li key={r.id}>
              <Panel>
                <div className="flex flex-col gap-4 p-4 md:flex-row md:items-start md:justify-between">
                  <div className="min-w-0 flex-1">
                    <div className="flex flex-wrap items-center gap-2">
                      <Badge tone="negative">{humanize(r.reason)}</Badge>
                      <span className="text-sm font-medium text-ink">{humanize(r.targetType)}</span>
                      {r.status === "open" && r.openOnTarget > 1 && <Badge tone="attention">{r.openOnTarget} open reports on this item</Badge>}
                      {r.status !== "open" && <StatusBadge value={r.status} />}
                    </div>
                    <p className="mt-1 text-[13px] text-ink-3">
                      Reported by{" "}
                      <Link href={`/admin/users/${r.reporterId}`} className="font-medium text-ink-2 hover:underline">
                        {r.reporterName}
                      </Link>{" "}
                      · <When at={r.createdAt} />
                    </p>
                    {r.details && <p className="mt-2 max-w-2xl text-sm text-ink-2">“{r.details}”</p>}
                    <div className="mt-3 rounded-md border border-line bg-bg px-3 py-2.5">
                      <TargetPreview t={r.target} />
                    </div>
                    {r.resolution && (
                      <p className="mt-3 text-[13px] text-ink-3">
                        <span className="font-medium text-ink-2">{r.resolverName ?? "Staff"}</span> · {fmtStamp(r.resolvedAt)} — {r.resolution}
                      </p>
                    )}
                  </div>
                  {r.status === "open" && (
                    <div className="flex shrink-0 flex-wrap gap-2 md:flex-col md:items-stretch">
                      <ActionButton
                        endpoint={`/api/admin/reports/${r.id}/resolve`}
                        body={{ status: "resolved" }}
                        label="Resolve"
                        icon={<Check className="size-4" />}
                        variant="primary"
                        title="Resolve report"
                        description={
                          r.targetType === "review"
                            ? "Choose what happens to the review. Hidden reviews stay on record; removed reviews are excluded permanently from ratings."
                            : r.targetType === "business"
                              ? "Use the business page to suspend the profile if needed, then resolve here."
                              : r.targetType === "user"
                                ? "Use the user page to suspend the account if needed, then resolve here."
                                : "Record what you did about this report."
                        }
                        confirmLabel="Resolve"
                        choice={
                          r.target.kind === "review"
                            ? {
                                name: "reviewAction",
                                label: "Review",
                                defaultValue: r.target.status === "published" ? "hidden" : "keep",
                                options: [
                                  { value: "hidden", label: "Hide the review", description: "Hidden from the profile and ratings; can be restored." },
                                  { value: "removed", label: "Remove the review", description: "Removed from the profile and ratings." },
                                  { value: "keep", label: "Leave as is", description: "The review stays as it is." },
                                  ...(r.target.status !== "published" ? [{ value: "published", label: "Restore the review", description: "Publishes it again." }] : []),
                                ],
                              }
                            : undefined
                        }
                        note={{ name: "resolution", label: "Resolution note", required: true, hint: "Internal — recorded on the report and in the audit log." }}
                        success="Report resolved"
                      />
                      <ActionButton
                        endpoint={`/api/admin/reports/${r.id}/resolve`}
                        body={{ status: "dismissed" }}
                        label="Dismiss"
                        icon={<X className="size-4" />}
                        title="Dismiss report"
                        description="Nothing about the reported item changes."
                        confirmLabel="Dismiss"
                        note={{ name: "resolution", label: "Why is no action needed?", required: true }}
                        success="Report dismissed"
                      />
                    </div>
                  )}
                </div>
              </Panel>
            </li>
          ))}
        </ul>
      )}
      <div className="mt-3 overflow-hidden rounded-lg border border-line bg-surface empty:hidden">
        <Pager path={PATH} params={params} page={res.page} hasMore={res.hasMore} />
      </div>
    </>
  );
}
