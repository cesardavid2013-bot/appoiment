import { BadgeCheck, CircleHelp, FileText, ShieldCheck, X } from "lucide-react";
import type { Metadata } from "next";
import Link from "next/link";
import { ActionButton } from "@/components/admin/action-button";
import { AdminHeader, FilterTabs, flatParams, fmtStamp, Pager, pageParam, Panel, StatusBadge, When } from "@/components/admin/ui";
import { EmptyState } from "@/components/ui/misc";
import { requireAdminPage } from "@/server/admin-guard";
import { listVerificationRequests } from "@/server/services/admin";

export const metadata: Metadata = { title: "Verifications" };

const PATH = "/admin/verifications";

export default async function AdminVerificationsPage({ searchParams }: PageProps<"/admin/verifications">) {
  await requireAdminPage("admin");
  const params = flatParams(await searchParams);
  const res = await listVerificationRequests({ status: params.status, page: pageParam(params.page) });
  const decidable = res.status === "pending" || res.status === "needs_info";

  return (
    <>
      <AdminHeader title="Verifications" description="Businesses asking for a verified badge. Oldest requests first. Decisions update the business and notify the owner." />
      <div className="mb-4">
        <FilterTabs
          path={PATH}
          params={params}
          name="status"
          value={res.status}
          label="Request status"
          options={[
            { value: "pending", label: "Pending" },
            { value: "needs_info", label: "Needs info" },
            { value: "verified", label: "Approved" },
            { value: "rejected", label: "Rejected" },
            { value: "all", label: "All" },
          ]}
        />
      </div>

      {res.items.length === 0 ? (
        <Panel>
          <EmptyState icon={<ShieldCheck />} title={res.status === "pending" ? "No pending requests" : "Nothing here"} description={res.status === "pending" ? "New verification requests will appear here as businesses submit them." : undefined} />
        </Panel>
      ) : (
        <ul className="space-y-3">
          {res.items.map((r) => (
            <li key={r.id}>
              <Panel>
                <div className="flex flex-col gap-4 p-4 md:flex-row md:items-start md:justify-between">
                  <div className="min-w-0 flex-1">
                    <div className="flex flex-wrap items-center gap-2">
                      <Link href={`/admin/businesses/${r.businessId}`} className="text-[15px] font-semibold text-ink hover:underline">
                        {r.businessName}
                      </Link>
                      <StatusBadge value={r.status} />
                      {r.businessStatus !== "active" && <StatusBadge value={r.businessStatus} />}
                    </div>
                    <p className="mt-0.5 text-[13px] text-ink-3">
                      Submitted by {r.submitterName} ({r.submitterEmail}) · <When at={r.createdAt} />
                    </p>
                    {r.details ? (
                      <p className="mt-3 max-w-2xl whitespace-pre-line text-sm leading-relaxed text-ink-2">{r.details}</p>
                    ) : (
                      <p className="mt-3 text-sm text-ink-3">No description provided.</p>
                    )}
                    {r.documents.length > 0 && (
                      <ul className="mt-3 flex flex-wrap gap-2" aria-label="Documents">
                        {r.documents.map((doc, i) =>
                          doc.url ? (
                            <li key={doc.id}>
                              <a href={doc.url} target="_blank" rel="noopener noreferrer" className="group block size-20 overflow-hidden rounded-md border border-line bg-surface-2 text-[10px] text-ink-3 hover:border-line-strong">
                                {doc.thumb ? (
                                  // eslint-disable-next-line @next/next/no-img-element
                                  <img src={doc.thumb} alt={`Document ${i + 1}`} className="size-20 object-cover" loading="lazy" />
                                ) : (
                                  <span className="flex size-20 flex-col items-center justify-center gap-1 text-[12px] text-ink-3">
                                    <FileText className="size-5" aria-hidden />
                                    Doc {i + 1}
                                  </span>
                                )}
                              </a>
                            </li>
                          ) : (
                            <li key={doc.id} className="flex size-20 flex-col items-center justify-center gap-1 rounded-md border border-dashed border-line-strong text-center text-[11px] text-ink-3">
                              <FileText className="size-5" aria-hidden />
                              Unavailable
                            </li>
                          ),
                        )}
                      </ul>
                    )}
                    {r.decisionNote && (
                      <p className="mt-3 rounded-md bg-surface-2 px-3 py-2 text-[13px] text-ink-2">
                        <span className="font-medium text-ink">{r.reviewerName ?? "Staff"}</span> · {fmtStamp(r.reviewedAt)} — {r.decisionNote}
                      </p>
                    )}
                  </div>
                  {decidable && (
                    <div className="flex shrink-0 flex-wrap gap-2 md:flex-col md:items-stretch">
                      <ActionButton
                        endpoint={`/api/admin/verifications/${r.id}/decision`}
                        body={{ status: "verified" }}
                        label="Approve"
                        icon={<BadgeCheck className="size-4" />}
                        variant="primary"
                        title={`Verify ${r.businessName}?`}
                        description="A verified badge appears on their profile and the owner is notified."
                        confirmLabel="Approve"
                        note={{ name: "note", label: "Note to the owner" }}
                        success="Business verified"
                      />
                      <ActionButton
                        endpoint={`/api/admin/verifications/${r.id}/decision`}
                        body={{ status: "needs_info" }}
                        label="Needs info"
                        icon={<CircleHelp className="size-4" />}
                        title="Ask for more information"
                        description="The owner is notified with your note and can submit again."
                        confirmLabel="Send request"
                        note={{ name: "note", label: "What do they need to provide?", required: true }}
                        success="Owner asked for more information"
                      />
                      <ActionButton
                        endpoint={`/api/admin/verifications/${r.id}/decision`}
                        body={{ status: "rejected" }}
                        label="Reject"
                        icon={<X className="size-4" />}
                        variant="danger"
                        title={`Reject verification for ${r.businessName}?`}
                        description="The owner is notified with your note."
                        confirmLabel="Reject"
                        tone="danger"
                        note={{ name: "note", label: "Reason (sent to the owner)", required: true }}
                        success="Verification rejected"
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
