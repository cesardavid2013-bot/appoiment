import { CheckCircle2, RotateCw } from "lucide-react";
import type { Metadata } from "next";
import { ActionButton } from "@/components/admin/action-button";
import { AdminHeader, FilterTabs, flatParams, fmtInt, fmtStamp, Metric, Mono, Pager, pageParam, Panel, Table, TBody, Td, Th, THead, Tr, When } from "@/components/admin/ui";
import { Badge, EmptyState } from "@/components/ui/misc";
import { requireAdminPage } from "@/server/admin-guard";
import { listFailedJobs, listWebhookErrors, systemCounts } from "@/server/services/admin";

export const metadata: Metadata = { title: "System" };

const PATH = "/admin/system";

export default async function AdminSystemPage({ searchParams }: PageProps<"/admin/system">) {
  await requireAdminPage("admin");
  const params = flatParams(await searchParams);
  const tab = params.tab === "webhooks" ? "webhooks" : "jobs";
  const page = pageParam(params.page);
  const [counts, jobsRes, hooksRes] = await Promise.all([systemCounts(), tab === "jobs" ? listFailedJobs({ page }) : null, tab === "webhooks" ? listWebhookErrors({ page }) : null]);

  return (
    <>
      <AdminHeader title="System" description="Background jobs and payment webhooks that need attention." />
      <div className="mb-6 grid grid-cols-2 gap-3 lg:grid-cols-4">
        <Metric label="Failed jobs" value={fmtInt(counts.failedJobs)} sub="Out of retries" tone={counts.failedJobs ? "negative" : "neutral"} />
        <Metric label="Queued jobs" value={fmtInt(counts.pendingJobs)} sub={counts.overdueJobs ? `${fmtInt(counts.overdueJobs)} overdue by 5+ min` : "None overdue"} tone={counts.overdueJobs ? "attention" : "neutral"} />
        <Metric label="Webhook errors" value={fmtInt(counts.webhookErrors)} sub="Events that raised an error" tone={counts.webhookErrors ? "attention" : "neutral"} />
        <Metric label="Unprocessed with error" value={fmtInt(counts.webhookUnprocessed)} sub="Never completed" tone={counts.webhookUnprocessed ? "negative" : "neutral"} />
      </div>

      <div className="mb-4">
        <FilterTabs
          path={PATH}
          params={params}
          name="tab"
          value={tab}
          label="System view"
          options={[
            { value: "jobs", label: "Failed jobs", count: counts.failedJobs },
            { value: "webhooks", label: "Webhook errors", count: counts.webhookErrors },
          ]}
        />
      </div>

      {jobsRes && (
        <Panel>
          {jobsRes.items.length === 0 ? (
            <EmptyState icon={<CheckCircle2 />} title="No failed jobs" description="Every background job has either completed or is still retrying." />
          ) : (
            <Table label="Failed jobs" className="[&_table]:min-w-[820px]">
              <THead>
                <Th>Job</Th>
                <Th>Attempts</Th>
                <Th className="w-[45%]">Last error</Th>
                <Th>Created</Th>
                <Th />
              </THead>
              <TBody>
                {jobsRes.items.map((j) => (
                  <Tr key={j.id}>
                    <Td>
                      <Mono className="text-ink">{j.type}</Mono>
                      <div className="text-[12px] text-ink-3 tabular">#{j.id}</div>
                    </Td>
                    <Td className="tabular text-ink-2">
                      {j.attempts}/{j.maxAttempts}
                    </Td>
                    <Td>
                      {j.lastError ? (
                        <pre className="max-h-24 overflow-auto whitespace-pre-wrap break-words font-mono text-[12px] leading-snug text-danger">{j.lastError}</pre>
                      ) : (
                        <span className="text-ink-3">No error recorded</span>
                      )}
                    </Td>
                    <Td className="text-ink-2">
                      <When at={j.createdAt} />
                    </Td>
                    <Td align="right">
                      <ActionButton
                        endpoint={`/api/admin/jobs/${j.id}/retry`}
                        label="Retry"
                        icon={<RotateCw className="size-3.5" />}
                        title={`Retry ${j.type} #${j.id}?`}
                        description="The job is queued to run now with a fresh set of attempts. Make sure the underlying problem is fixed first, or it will fail again."
                        confirmLabel="Retry job"
                        success="Job queued"
                      />
                    </Td>
                  </Tr>
                ))}
              </TBody>
            </Table>
          )}
          <Pager path={PATH} params={params} page={jobsRes.page} hasMore={jobsRes.hasMore} />
        </Panel>
      )}

      {hooksRes && (
        <Panel>
          {hooksRes.items.length === 0 ? (
            <EmptyState icon={<CheckCircle2 />} title="No webhook errors" description="All received webhook events were processed cleanly." />
          ) : (
            <Table label="Webhook events with errors" className="[&_table]:min-w-[820px]">
              <THead>
                <Th>Event</Th>
                <Th>State</Th>
                <Th className="w-[45%]">Error</Th>
                <Th>Received</Th>
              </THead>
              <TBody>
                {hooksRes.items.map((w) => (
                  <Tr key={w.id}>
                    <Td>
                      <Mono className="text-ink">{w.type}</Mono>
                      <div className="max-w-[220px] truncate font-mono text-[11.5px] text-ink-3" title={w.id}>
                        {w.provider} · {w.id}
                      </div>
                    </Td>
                    <Td>
                      {w.processedAt ? <Badge tone="positive">Processed {fmtStamp(w.processedAt)}</Badge> : <Badge tone="negative">Unprocessed</Badge>}
                      <div className="mt-1 text-[12px] text-ink-3 tabular">
                        {w.attempts} attempt{w.attempts === 1 ? "" : "s"}
                      </div>
                    </Td>
                    <Td>
                      <pre className="max-h-24 overflow-auto whitespace-pre-wrap break-words font-mono text-[12px] leading-snug text-danger">{w.error}</pre>
                    </Td>
                    <Td className="text-ink-2">
                      <When at={w.receivedAt} />
                    </Td>
                  </Tr>
                ))}
              </TBody>
            </Table>
          )}
          <Pager path={PATH} params={params} page={hooksRes.page} hasMore={hooksRes.hasMore} />
        </Panel>
      )}
    </>
  );
}
