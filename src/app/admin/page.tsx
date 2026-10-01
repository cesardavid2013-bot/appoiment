import type { Metadata } from "next";
import { AdminHeader, fmtInt, Metric } from "@/components/admin/ui";
import { formatMoney } from "@/domain/money";
import { requireAdminPage } from "@/server/admin-guard";
import { adminOverview } from "@/server/services/admin";

export const metadata: Metadata = { title: "Overview" };

export default async function AdminOverviewPage() {
  const viewer = await requireAdminPage("support");
  const isAdmin = viewer.platformRole === "admin";
  const o = await adminOverview();
  const [primaryGmv, ...otherGmv] = o.gmv30d;
  const q = (href: string) => (isAdmin ? href : undefined);

  return (
    <>
      <AdminHeader title="Overview" description="Live marketplace health. Every number is computed from the database on load; times are UTC." />

      <section aria-labelledby="growth">
        <h2 id="growth" className="mb-3 text-[13px] font-semibold uppercase tracking-wider text-ink-3">
          Marketplace
        </h2>
        <div className="grid grid-cols-2 gap-3 lg:grid-cols-4">
          <Metric label="Users" value={fmtInt(o.usersTotal)} sub={`+${fmtInt(o.usersNew7d)} in the last 7 days`} href="/admin/users" />
          <Metric label="Active businesses" value={fmtInt(o.businessesActive)} sub={`+${fmtInt(o.businessesNew7d)} created in 7 days`} href="/admin/businesses?status=active" />
          <Metric label="Bookings today" value={fmtInt(o.bookingsToday)} sub={`${fmtInt(o.bookings7d)} in the last 7 days`} href="/admin/appointments" />
          <Metric label="Completed (30 days)" value={fmtInt(o.completed30d)} sub="Appointments marked completed" href="/admin/appointments?status=completed" />
        </div>
        <div className="mt-3 grid grid-cols-1 gap-3 sm:grid-cols-2 lg:grid-cols-4">
          <div className="sm:col-span-2">
            <Metric
              label="Online payments (30 days)"
              value={primaryGmv ? formatMoney(primaryGmv.cents, primaryGmv.currency) : formatMoney(0)}
              sub={
                primaryGmv
                  ? `${fmtInt(primaryGmv.count)} succeeded card payment${primaryGmv.count === 1 ? "" : "s"}${otherGmv.length ? ` · plus ${otherGmv.map((g) => formatMoney(g.cents, g.currency)).join(", ")}` : ""}`
                  : "No succeeded card payments yet"
              }
            />
          </div>
        </div>
      </section>

      <section aria-labelledby="queues" className="mt-8">
        <h2 id="queues" className="mb-3 text-[13px] font-semibold uppercase tracking-wider text-ink-3">
          Queues
        </h2>
        <div className="grid grid-cols-2 gap-3 lg:grid-cols-3">
          <Metric label="Open reports" value={fmtInt(o.openReports)} sub="Awaiting moderation" href={q("/admin/reports")} tone={o.openReports ? "attention" : "neutral"} />
          <Metric label="Pending verifications" value={fmtInt(o.pendingVerifications)} sub="Businesses waiting on a decision" href={q("/admin/verifications")} tone={o.pendingVerifications ? "attention" : "neutral"} />
          <Metric label="Open support tickets" value={fmtInt(o.openTickets)} sub="Waiting for a reply" href="/admin/support" tone={o.openTickets ? "attention" : "neutral"} />
          <Metric label="Failed jobs" value={fmtInt(o.failedJobs)} sub="Exhausted all retries" href={q("/admin/system")} tone={o.failedJobs ? "negative" : "neutral"} />
          <Metric label="Webhook errors" value={fmtInt(o.webhookErrors)} sub="Unprocessed events with an error" href={q("/admin/system?tab=webhooks")} tone={o.webhookErrors ? "negative" : "neutral"} />
        </div>
      </section>
    </>
  );
}
