import { XCircle } from "lucide-react";
import type { Metadata } from "next";
import type { ReactNode } from "react";
import Link from "next/link";
import { notFound } from "next/navigation";
import { ActionButton } from "@/components/admin/action-button";
import { RefundButton } from "@/components/admin/refund-button";
import { AdminHeader, Facts, fmtStamp, humanize, MetaChips, Mono, Panel, StatusBadge, Table, TableEmpty, TBody, Td, Th, THead, Tr } from "@/components/admin/ui";
import { Badge } from "@/components/ui/misc";
import { STATUS_LABELS, STATUS_TONE, type AppointmentStatus } from "@/domain/appointment-state";
import { formatDuration, formatMoney } from "@/domain/money";
import { fmtDateLong, fmtTime, tzAbbr } from "@/lib/format";
import { requireAdminPage } from "@/server/admin-guard";
import { getAppointmentDetail } from "@/server/services/admin";

export const metadata: Metadata = { title: "Appointment" };

const label = (s: AppointmentStatus | null) => (s ? STATUS_LABELS[s] : null);

export default async function AdminAppointmentPage({ params }: PageProps<"/admin/appointments/[id]">) {
  const viewer = await requireAdminPage("support");
  const { id } = await params;
  const d = await getAppointmentDetail(id);
  if (!d) notFound();
  const a = d.appointment;
  const isAdmin = viewer.platformRole === "admin";
  const money = (c: number) => formatMoney(c, a.currency);

  return (
    <>
      <AdminHeader
        back={{ href: "/admin/appointments", label: "Appointments" }}
        title={
          <span className="flex flex-wrap items-center gap-2">
            <span className="font-mono">{a.reference}</span>
            <Badge tone={STATUS_TONE[a.status]}>{STATUS_LABELS[a.status]}</Badge>
          </span>
        }
        description={`${a.snapshot.serviceName} · ${fmtDateLong(a.startsAt, a.timezone)}, ${fmtTime(a.startsAt, a.timezone)} ${tzAbbr(a.startsAt, a.timezone)}`}
        actions={
          isAdmin ? (
            <>
              <RefundButton appointmentId={a.id} refundableCents={d.refundableCents} currency={a.currency} />
              {d.canCancel && (
                <ActionButton
                  endpoint={`/api/admin/appointments/${a.id}/cancel`}
                  label="Cancel for business"
                  icon={<XCircle className="size-4" />}
                  variant="danger"
                  title="Cancel on behalf of the business?"
                  description={
                    <>
                      The slot is released and the customer is notified that the business cancelled.
                      {a.amountPaidCents - a.amountRefundedCents > 0 ? ` Everything the customer paid (${money(a.amountPaidCents - a.amountRefundedCents)}) is refunded in full.` : " No payment needs refunding."}
                    </>
                  }
                  confirmLabel="Cancel appointment"
                  tone="danger"
                  note={{ name: "reason", label: "Reason (shared with the customer and business)", required: true }}
                  success="Appointment cancelled"
                />
              )}
            </>
          ) : null
        }
      />

      <div className="grid gap-4 lg:grid-cols-2">
        <Panel title="Booking">
          <Facts
            items={[
              ["Appointment ID", <Mono key="id">{a.id}</Mono>],
              [
                "Business",
                <span key="b">
                  <Link href={`/admin/businesses/${d.business.id}`} className="font-medium hover:underline">
                    {d.business.name}
                  </Link>
                  {d.business.status !== "active" && (
                    <>
                      {" "}
                      <StatusBadge value={d.business.status} />
                    </>
                  )}
                </span>,
              ],
              [
                "Customer",
                <span key="c">
                  {d.customer.userId ? (
                    <Link href={`/admin/users/${d.customer.userId}`} className="font-medium hover:underline">
                      {d.customer.name}
                    </Link>
                  ) : (
                    <span className="font-medium">{d.customer.name}</span>
                  )}
                  <div className="text-[13px] text-ink-3">{[d.customer.email, d.customer.phone].filter(Boolean).join(" · ") || "No contact details"}</div>
                </span>,
              ],
              ["With", a.snapshot.memberName],
              ["Where", [a.snapshot.locationName, a.serviceAddress ?? a.snapshot.address].filter(Boolean).join(" — ") || null],
              ["Duration", formatDuration(a.snapshot.durationMinutes)],
              ["Source", humanize(a.source)],
              ["Booked", fmtStamp(a.createdAt)],
              ...(a.cancelledAt ? ([["Cancelled", `${fmtStamp(a.cancelledAt)} by ${a.cancelledBy ?? "unknown"}${a.cancellationReason ? ` — ${a.cancellationReason}` : ""}`]] as [string, string][]) : []),
              ...(a.customerNote ? ([["Customer note", a.customerNote]] as [string, string][]) : []),
            ]}
          />
        </Panel>
        <Panel title="Money">
          <Facts
            items={[
              ...a.snapshot.lines.map((l) => [l.label, <span key={l.label} className="tabular">{money(l.amountCents)}</span>] as [string, ReactNode]),
              ["Total", <span key="t" className="font-semibold tabular">{money(a.totalCents)}{a.isEstimate && <span className="font-normal text-ink-3"> (estimate)</span>}</span>],
              ["Payment status", <StatusBadge key="ps" value={a.paymentStatus === "paid" ? "succeeded" : a.paymentStatus} label={humanize(a.paymentStatus)} />],
              ["Paid", <span key="p" className="tabular">{money(a.amountPaidCents)}</span>],
              ["Refunded", <span key="r" className="tabular">{money(a.amountRefundedCents)}</span>],
              ["Tip", <span key="tip" className="tabular">{money(a.tipCents)}</span>],
              ["Refundable online", <span key="ro" className="tabular">{money(d.refundableCents)}</span>],
            ]}
          />
        </Panel>
      </div>

      <Panel title="Payments" className="mt-4">
        {d.payments.length === 0 ? (
          <TableEmpty title="No payments recorded" />
        ) : (
          <Table label="Payments" className="[&_table]:min-w-[640px]">
            <THead>
              <Th>Kind</Th>
              <Th>Provider</Th>
              <Th>Status</Th>
              <Th>Date</Th>
              <Th align="right">Amount</Th>
            </THead>
            <TBody>
              {d.payments.map((p) => (
                <Tr key={p.id}>
                  <Td>
                    {humanize(p.kind)}
                    {p.method && <div className="text-[13px] text-ink-3">{humanize(p.method)}</div>}
                  </Td>
                  <Td>
                    {p.provider === "stripe" ? "Card (Stripe)" : "Recorded in person"}
                    {p.providerPaymentId && <div className="font-mono text-[11.5px] text-ink-3">{p.providerPaymentId}</div>}
                  </Td>
                  <Td>
                    <StatusBadge value={p.status} />
                    {p.failureMessage && <div className="mt-1 text-[13px] text-danger">{p.failureMessage}</div>}
                  </Td>
                  <Td className="whitespace-nowrap text-ink-2">{fmtStamp(p.succeededAt ?? p.createdAt)}</Td>
                  <Td align="right">{formatMoney(p.amountCents, p.currency)}</Td>
                </Tr>
              ))}
            </TBody>
          </Table>
        )}
      </Panel>

      {d.refunds.length > 0 && (
        <Panel title="Refunds" className="mt-4">
          <Table label="Refunds" className="[&_table]:min-w-[640px]">
            <THead>
              <Th>Reason</Th>
              <Th>By</Th>
              <Th>Status</Th>
              <Th>Date</Th>
              <Th align="right">Amount</Th>
            </THead>
            <TBody>
              {d.refunds.map((r) => (
                <Tr key={r.id}>
                  <Td className="max-w-xs">{r.reason ?? "—"}</Td>
                  <Td className="text-ink-2">{r.byName ?? "System"}</Td>
                  <Td>
                    <StatusBadge value={r.status} />
                  </Td>
                  <Td className="whitespace-nowrap text-ink-2">{fmtStamp(r.createdAt)}</Td>
                  <Td align="right">{money(r.amountCents)}</Td>
                </Tr>
              ))}
            </TBody>
          </Table>
        </Panel>
      )}

      <Panel title="History" description="Every status change, oldest first" className="mt-4">
        {d.events.length === 0 ? (
          <TableEmpty title="No events recorded" />
        ) : (
          <ol className="divide-y divide-line">
            {d.events.map((e) => (
              <li key={e.id} className="flex flex-col gap-1 px-4 py-3 text-sm md:flex-row md:items-start md:gap-4">
                <span className="shrink-0 text-[13px] text-ink-3 tabular md:w-52">{fmtStamp(e.createdAt)}</span>
                <div className="min-w-0 flex-1">
                  <div className="font-medium text-ink">
                    {humanize(e.type)}
                    {e.fromStatus || e.toStatus ? (
                      <span className="font-normal text-ink-2">
                        {" "}
                        · {label(e.fromStatus) ?? "—"} → {label(e.toStatus) ?? "—"}
                      </span>
                    ) : null}
                  </div>
                  {e.data && Object.keys(e.data).length > 0 && (
                    <div className="mt-1">
                      <MetaChips meta={e.data} />
                    </div>
                  )}
                </div>
                <span className="shrink-0 text-[13px] text-ink-3">
                  {humanize(e.actorType)}
                  {e.actorName ? ` · ${e.actorName}` : ""}
                </span>
              </li>
            ))}
          </ol>
        )}
      </Panel>
    </>
  );
}
