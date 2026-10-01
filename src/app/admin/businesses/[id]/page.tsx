import { ArrowUpRight, BadgeCheck, Ban, CreditCard, RotateCcw } from "lucide-react";
import type { Metadata } from "next";
import type { ReactNode } from "react";
import Link from "next/link";
import { notFound } from "next/navigation";
import { ActionButton } from "@/components/admin/action-button";
import { EndCampaignButton } from "@/components/admin/end-campaign-button";
import { AdminHeader, Facts, fmtDay, fmtInt, fmtStamp, HistoryPanel, humanize, Mono, Panel, pct, StatusBadge, Table, TableEmpty, TBody, Td, Th, THead, Tr, When } from "@/components/admin/ui";
import { Badge, RatingInline } from "@/components/ui/misc";
import { STATUS_LABELS, STATUS_TONE } from "@/domain/appointment-state";
import { formatMoney } from "@/domain/money";
import { PLANS } from "@/domain/plans";
import { fmtDate, fmtTime } from "@/lib/format";
import { requireAdminPage } from "@/server/admin-guard";
import { getBusinessDetail } from "@/server/services/admin";

export const metadata: Metadata = { title: "Business" };

export default async function AdminBusinessPage({ params }: PageProps<"/admin/businesses/[id]">) {
  const viewer = await requireAdminPage("support");
  const { id } = await params;
  const d = await getBusinessDetail(id);
  if (!d) notFound();
  const b = d.business;
  const isAdmin = viewer.platformRole === "admin";
  const plan = PLANS[b.plan];

  return (
    <>
      <AdminHeader
        back={{ href: "/admin/businesses", label: "Businesses" }}
        title={
          <span className="flex flex-wrap items-center gap-2">
            {b.name}
            <StatusBadge value={b.status} />
            {b.verificationStatus === "verified" && <StatusBadge value="verified" />}
          </span>
        }
        description={
          <>
            {humanize(b.kind)} · {d.categoryName ?? "No category"} · <span className="font-mono text-[13px]">/{b.slug}</span>
          </>
        }
        actions={
          <>
            {b.status === "active" && (
              <Link href={`/${b.slug}`} target="_blank" rel="noopener" className="inline-flex h-8 items-center gap-1.5 rounded-md px-3 text-[13px] font-medium text-ink-2 hover:bg-surface-2 hover:text-ink">
                View profile
                <ArrowUpRight className="size-4" aria-hidden />
              </Link>
            )}
            {isAdmin &&
              (b.status === "suspended" ? (
                <ActionButton
                  endpoint={`/api/admin/businesses/${b.id}/status`}
                  body={{ action: "unsuspend" }}
                  label="Unsuspend"
                  icon={<RotateCcw className="size-4" />}
                  title={`Unsuspend ${b.name}?`}
                  description={b.publishedAt ? "The profile becomes visible in search again and customers can book." : "The business returns to draft; the owner can publish when ready."}
                  confirmLabel="Unsuspend"
                  note={{ name: "reason", label: "Reason", required: true, hint: "Recorded in the audit log." }}
                  success="Business reinstated"
                />
              ) : b.status !== "closed" ? (
                <ActionButton
                  endpoint={`/api/admin/businesses/${b.id}/status`}
                  body={{ action: "suspend" }}
                  label="Suspend"
                  icon={<Ban className="size-4" />}
                  variant="danger"
                  title={`Suspend ${b.name}?`}
                  description="The profile is hidden from search, new bookings are blocked and the team loses access to business tools. Existing appointments are not cancelled. The owner is notified with your reason."
                  confirmLabel="Suspend business"
                  tone="danger"
                  note={{ name: "reason", label: "Reason (sent to the owner)", required: true }}
                  success="Business suspended"
                />
              ) : null)}
          </>
        }
      />

      <div className="grid grid-cols-2 gap-3 lg:grid-cols-4">
        <Stat label="Appointments" value={fmtInt(d.stats.appointments)} sub={`${fmtInt(d.stats.upcoming)} upcoming`} />
        <Stat label="Completed (30 days)" value={fmtInt(d.stats.completed30d)} />
        <Stat label="Rating" value={<RatingInline avg={b.ratingAvg} count={b.ratingCount} className="text-base" />} sub={`${d.stats.reviewsHidden} hidden/removed`} />
        <Stat label="Open reports" value={fmtInt(d.stats.openReports)} sub={d.stats.openReports ? <Link className="underline" href="/admin/reports?target=business">Review queue</Link> : "Against this profile"} />
      </div>

      <div className="mt-4 grid gap-4 lg:grid-cols-2">
        <Panel title="Profile">
          <Facts
            items={[
              ["Business ID", <Mono key="id">{b.id}</Mono>],
              ["Owner", <span key="o"><Link href={`/admin/users/${d.owner.id}`} className="font-medium hover:underline">{d.owner.name}</Link>{d.owner.status !== "active" && <> <StatusBadge value={d.owner.status} /></>}<div className="text-[13px] text-ink-3">{d.owner.email}</div></span>],
              ["Contact", [b.contactEmail, b.contactPhone].filter(Boolean).join(" · ") || null],
              ["Time zone", b.timezone],
              ["Booking mode", humanize(b.bookingMode)],
              ["Online payments", b.paymentsEnabled ? "Enabled" : "Not set up"],
              ["Services", `${d.services.active ?? 0} active · ${d.services.hidden ?? 0} hidden · ${d.services.archived ?? 0} archived`],
              ["Published", b.publishedAt ? fmtStamp(b.publishedAt) : "Never"],
              ["Created", fmtStamp(b.createdAt)],
            ]}
          />
        </Panel>
        <div className="space-y-4">
          <Panel
            title="Plan"
            action={
              isAdmin && (
                <ActionButton
                  endpoint={`/api/admin/businesses/${b.id}/plan`}
                  label="Change plan"
                  icon={<CreditCard className="size-4" />}
                  variant="ghost"
                  title="Change plan tier"
                  description="Entitlements change immediately. Billing is not affected by this change."
                  confirmLabel="Change plan"
                  choice={{
                    name: "plan",
                    label: "Plan",
                    defaultValue: b.plan,
                    options: Object.entries(PLANS).map(([value, p]) => ({
                      value,
                      label: p.label,
                      description: `Up to ${p.maxBookableMembers} bookable staff, ${p.maxLocations} location${p.maxLocations === 1 ? "" : "s"}, ${(p.applicationFeeBps / 100).toFixed(1)}% platform fee.`,
                    })),
                  }}
                  note={{ name: "reason", label: "Reason", required: true }}
                  success="Plan updated"
                />
              )
            }
          >
            <Facts
              items={[
                ["Tier", <span key="t" className="font-medium">{plan.label}</span>],
                ["Bookable staff", `Up to ${plan.maxBookableMembers}`],
                ["Locations", `Up to ${plan.maxLocations}`],
                ["Platform fee", `${(plan.applicationFeeBps / 100).toFixed(1)}%`],
              ]}
            />
          </Panel>
          <Panel
            title="Verification"
            action={
              isAdmin && (
                <ActionButton
                  endpoint={`/api/admin/businesses/${b.id}/verification`}
                  label="Set status"
                  icon={<BadgeCheck className="size-4" />}
                  variant="ghost"
                  title="Set verification status"
                  description="Updates the business and closes any open verification request. The owner is notified of decisions."
                  confirmLabel="Save"
                  choice={{
                    name: "status",
                    label: "Status",
                    defaultValue: b.verificationStatus === "verified" ? "not_submitted" : "verified",
                    options: [
                      { value: "verified", label: "Verified", description: "Shows a verified badge on the profile." },
                      { value: "needs_info", label: "Needs more information", description: "The owner is asked to add details." },
                      { value: "rejected", label: "Rejected", description: "The owner is told verification wasn't approved." },
                      { value: "not_submitted", label: "Not verified (reset)", description: "Removes the badge without notifying the owner." },
                    ],
                  }}
                  note={{ name: "note", label: "Note to the owner", requiredFor: ["needs_info", "rejected"] }}
                  success="Verification updated"
                />
              )
            }
          >
            <div className="px-4 py-3">
              <StatusBadge value={b.verificationStatus} />
            </div>
            {d.verifications.length > 0 && (
              <ul className="divide-y divide-line border-t border-line">
                {d.verifications.map((v) => (
                  <li key={v.id} className="px-4 py-2.5 text-sm">
                    <div className="flex items-center justify-between gap-3">
                      <span className="text-ink-2">
                        Submitted {fmtDay(v.createdAt)} · {v.documents} document{v.documents === 1 ? "" : "s"}
                      </span>
                      <StatusBadge value={v.status} />
                    </div>
                    {v.decisionNote && <p className="mt-1 text-[13px] text-ink-3">“{v.decisionNote}”</p>}
                  </li>
                ))}
              </ul>
            )}
          </Panel>
        </div>
      </div>

      <div className="mt-4 grid gap-4 lg:grid-cols-2">
        <Panel title="Team" description={`${d.team.length} member${d.team.length === 1 ? "" : "s"}`}>
          {d.team.length === 0 ? (
            <TableEmpty title="No team members" />
          ) : (
            <ul className="divide-y divide-line">
              {d.team.map((m) => (
                <li key={m.id} className="flex items-center justify-between gap-3 px-4 py-2.5 text-sm">
                  <div className="min-w-0">
                    {m.userId ? (
                      <Link href={`/admin/users/${m.userId}`} className="font-medium hover:underline">
                        {m.displayName}
                      </Link>
                    ) : (
                      <span className="font-medium">{m.displayName}</span>
                    )}
                    <div className="truncate text-[13px] text-ink-3">
                      {humanize(m.role)}
                      {m.email ? ` · ${m.email}` : ""}
                      {m.isBookable ? "" : " · not bookable"}
                    </div>
                  </div>
                  <StatusBadge value={m.status === "invited" ? "pending" : m.status} label={m.status === "invited" ? "Invited" : undefined} />
                </li>
              ))}
            </ul>
          )}
        </Panel>
        <Panel title="Locations">
          {d.locations.length === 0 ? (
            <TableEmpty title="No locations" />
          ) : (
            <ul className="divide-y divide-line">
              {d.locations.map((l) => (
                <li key={l.id} className="flex items-center justify-between gap-3 px-4 py-2.5 text-sm">
                  <div className="min-w-0">
                    <span className="font-medium">{l.name}</span>
                    {l.isPrimary && <span className="text-ink-3"> · primary</span>}
                    <div className="truncate text-[13px] text-ink-3">
                      {humanize(l.kind)}
                      {l.city ? ` · ${[l.city, l.region].filter(Boolean).join(", ")}` : ""}
                    </div>
                  </div>
                  {!l.isActive && <Badge>Inactive</Badge>}
                </li>
              ))}
            </ul>
          )}
        </Panel>
      </div>

      <Panel title="Spotlight campaigns" className="mt-4">
        {d.campaigns.length === 0 ? (
          <TableEmpty title="No Spotlight campaigns" />
        ) : (
          <Table label="Spotlight campaigns" className="[&_table]:min-w-[640px]">
            <THead>
              <Th>Status</Th>
              <Th>Targeting</Th>
              <Th>Runs</Th>
              <Th align="right">Impressions</Th>
              <Th align="right">Clicks</Th>
              <Th align="right">CTR</Th>
              <Th />
            </THead>
            <TBody>
              {d.campaigns.map((c) => {
                const live = c.live;
                return (
                  <Tr key={c.id}>
                    <Td>{live ? <StatusBadge value={c.status} /> : <StatusBadge value="ended" />}</Td>
                    <Td className="text-ink-2">{c.categoryName ?? "All searches"}</Td>
                    <Td className="whitespace-nowrap text-ink-2">
                      {fmtDay(c.startsAt)} – {fmtDay(c.endsAt)}
                    </Td>
                    <Td align="right">{fmtInt(c.impressions)}</Td>
                    <Td align="right">{fmtInt(c.clicks)}</Td>
                    <Td align="right">{pct(c.clicks, c.impressions)}</Td>
                    <Td align="right">
                      {isAdmin && live && <EndCampaignButton id={c.id} businessName={b.name} />}
                    </Td>
                  </Tr>
                );
              })}
            </TBody>
          </Table>
        )}
      </Panel>

      <Panel title="Recent appointments" className="mt-4" action={<Link href={`/admin/appointments?q=${b.id}`} className="text-[13px] font-medium text-ink-2 hover:text-ink hover:underline">View all</Link>}>
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
                    <div className="text-[13px] text-ink-3">{a.customerName}</div>
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
      <p className="mt-6 text-[13px] text-ink-3">
        Last updated <When at={b.updatedAt} />.
      </p>
    </>
  );
}

function Stat({ label, value, sub }: { label: string; value: ReactNode; sub?: ReactNode }) {
  return (
    <div className="rounded-lg border border-line bg-surface p-4">
      <div className="text-[13px] font-medium text-ink-3">{label}</div>
      <div className="mt-1.5 text-xl font-semibold tracking-[-0.01em] tabular text-ink">{value}</div>
      {sub && <div className="mt-1 text-[13px] text-ink-3">{sub}</div>}
    </div>
  );
}
