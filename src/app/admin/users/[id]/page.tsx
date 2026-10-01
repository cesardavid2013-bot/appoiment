import { Ban, RotateCcw, ShieldCheck } from "lucide-react";
import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import { ActionButton } from "@/components/admin/action-button";
import { AdminHeader, Facts, fmtStamp, HistoryPanel, humanize, Mono, Panel, StatusBadge, Table, TableEmpty, TBody, Td, Th, THead, Tr, When } from "@/components/admin/ui";
import { STATUS_LABELS, STATUS_TONE } from "@/domain/appointment-state";
import { formatMoney } from "@/domain/money";
import { Badge } from "@/components/ui/misc";
import { fmtDate, fmtTime } from "@/lib/format";
import { requireAdminPage } from "@/server/admin-guard";
import { getUserDetail } from "@/server/services/admin";

export const metadata: Metadata = { title: "User" };

export default async function AdminUserPage({ params }: PageProps<"/admin/users/[id]">) {
  const viewer = await requireAdminPage("support");
  const { id } = await params;
  const d = await getUserDetail(id);
  if (!d) notFound();
  const { user: u } = d;
  const isAdmin = viewer.platformRole === "admin";
  const isSelf = viewer.id === u.id;

  return (
    <>
      <AdminHeader
        back={{ href: "/admin/users", label: "Users" }}
        title={
          <span className="flex flex-wrap items-center gap-2">
            {u.name}
            <StatusBadge value={u.status} />
            {u.platformRole !== "user" && <StatusBadge value={u.platformRole} />}
          </span>
        }
        description={u.email ?? "No email on file"}
        actions={
          isAdmin && u.status !== "deleted" ? (
            <>
              {u.status === "active" ? (
                <ActionButton
                  endpoint={`/api/admin/users/${u.id}/status`}
                  body={{ status: "suspended" }}
                  label="Suspend"
                  icon={<Ban className="size-4" />}
                  variant="danger"
                  title={`Suspend ${u.name}?`}
                  description="They'll be signed out on every device immediately and won't be able to sign in until reactivated. Their businesses are not affected."
                  confirmLabel="Suspend account"
                  tone="danger"
                  note={{ name: "reason", label: "Reason", required: true, placeholder: "Recorded in the audit log", hint: "Visible to other admins in the audit log." }}
                  success="Account suspended and signed out everywhere"
                  disabled={isSelf}
                  disabledReason="You can't suspend your own account"
                />
              ) : (
                <ActionButton
                  endpoint={`/api/admin/users/${u.id}/status`}
                  body={{ status: "active" }}
                  label="Reactivate"
                  icon={<RotateCcw className="size-4" />}
                  title={`Reactivate ${u.name}?`}
                  description="They'll be able to sign in again."
                  confirmLabel="Reactivate"
                  note={{ name: "reason", label: "Reason", required: true }}
                  success="Account reactivated"
                  disabled={isSelf}
                />
              )}
              <ActionButton
                endpoint={`/api/admin/users/${u.id}/role`}
                label="Change role"
                icon={<ShieldCheck className="size-4" />}
                title="Change platform role"
                description="Platform roles grant access to this console. Support agents can view records and answer tickets; admins can change everything."
                confirmLabel="Change role"
                choice={{
                  name: "role",
                  label: "Role",
                  defaultValue: u.platformRole,
                  options: [
                    { value: "user", label: "User", description: "No console access." },
                    { value: "support", label: "Support", description: "Read-only console access plus the support inbox." },
                    { value: "admin", label: "Admin", description: "Full console access, including suspensions, refunds and roles." },
                  ],
                }}
                note={{ name: "reason", label: "Reason", required: true }}
                success="Role updated"
                disabled={isSelf}
                disabledReason="You can't change your own role"
              />
            </>
          ) : null
        }
      />

      <div className="grid gap-4 lg:grid-cols-[minmax(0,1fr)_minmax(0,1fr)]">
        <Panel title="Profile">
          <Facts
            items={[
              ["User ID", <Mono key="id">{u.id}</Mono>],
              ["Email", u.email ? <span key="e">{u.email} {u.emailVerifiedAt ? <Badge tone="positive">Verified</Badge> : <Badge tone="attention">Unverified</Badge>}</span> : null],
              ["Phone", u.phone ? <span key="p">{u.phone} {u.phoneVerifiedAt && <Badge tone="positive">Verified</Badge>}</span> : null],
              ["Sign-in", u.hasPassword ? "Password" : "Social sign-in only"],
              ["Time zone", u.timezone],
              ["Joined", fmtStamp(u.createdAt)],
              ["Last sign-in", fmtStamp(u.lastLoginAt)],
              ...(u.deletedAt ? ([["Deleted", fmtStamp(u.deletedAt)]] as [string, string][]) : []),
            ]}
          />
        </Panel>
        <Panel title="Activity">
          <Facts
            items={[
              ["Active sessions", <span key="s" className="tabular">{d.sessions.active}{d.sessions.lastSeenAt && <span className="text-ink-3"> · last seen <When at={d.sessions.lastSeenAt} /></span>}</span>],
              ["Appointments booked", <span key="a" className="tabular">{d.counts.appointments} <span className="text-ink-3">({d.counts.completed} completed, {d.counts.cancelled} self-cancelled)</span></span>],
              ["Reviews written", d.counts.reviews],
              ["Reports filed", d.counts.reportsFiled],
              ["Reports against", d.counts.reportsAgainst ? <span key="r" className="font-medium text-danger">{d.counts.reportsAgainst}</span> : 0],
            ]}
          />
        </Panel>
      </div>

      <Panel title="Business memberships" className="mt-4">
        {d.memberships.length === 0 ? (
          <TableEmpty title="Not a member of any business" />
        ) : (
          <Table label="Business memberships" className="[&_table]:min-w-[560px]">
            <THead>
              <Th>Business</Th>
              <Th>Role</Th>
              <Th>Membership</Th>
              <Th>Business status</Th>
            </THead>
            <TBody>
              {d.memberships.map((m) => (
                <Tr key={m.memberId}>
                  <Td>
                    <Link href={`/admin/businesses/${m.businessId}`} className="font-medium hover:underline">
                      {m.businessName}
                    </Link>
                    <div className="text-[13px] text-ink-3">/{m.businessSlug}</div>
                  </Td>
                  <Td>
                    {humanize(m.role)}
                    {m.isOwner && <span className="text-ink-3"> · account owner</span>}
                  </Td>
                  <Td>
                    <StatusBadge value={m.status} />
                  </Td>
                  <Td>
                    <StatusBadge value={m.businessStatus} />
                  </Td>
                </Tr>
              ))}
            </TBody>
          </Table>
        )}
      </Panel>

      <Panel title="Recent appointments" description="As a customer, newest first" className="mt-4">
        {d.recent.length === 0 ? (
          <TableEmpty title="No appointments yet" />
        ) : (
          <Table label="Recent appointments">
            <THead>
              <Th>Reference</Th>
              <Th>Service</Th>
              <Th>When</Th>
              <Th>Status</Th>
              <Th align="right">Total</Th>
            </THead>
            <TBody>
              {d.recent.map((a) => (
                <Tr key={a.id}>
                  <Td>
                    <Link href={`/admin/appointments/${a.id}`} className="font-mono text-[13px] font-medium hover:underline">
                      {a.reference}
                    </Link>
                  </Td>
                  <Td>
                    {a.serviceName}
                    <div className="text-[13px] text-ink-3">{a.businessName}</div>
                  </Td>
                  <Td className="whitespace-nowrap text-ink-2">
                    {fmtDate(a.startsAt, a.timezone, { month: "short", day: "numeric", year: "numeric" })} · {fmtTime(a.startsAt, a.timezone)}
                  </Td>
                  <Td>
                    <Badge tone={STATUS_TONE[a.status]}>{STATUS_LABELS[a.status]}</Badge>
                  </Td>
                  <Td align="right">{formatMoney(a.totalCents, a.currency)}</Td>
                </Tr>
              ))}
            </TBody>
          </Table>
        )}
      </Panel>

      <HistoryPanel items={d.history} className="mt-4" />
    </>
  );
}
