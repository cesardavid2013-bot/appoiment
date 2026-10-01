import type { Metadata } from "next";
import Link from "next/link";
import { AdminHeader, FilterForm, flatParams, humanize, Pager, pageParam, Panel, Table, TableEmpty, TBody, Td, Th, THead, Tr } from "@/components/admin/ui";
import { Badge } from "@/components/ui/misc";
import { STATUS_LABELS, STATUS_TONE } from "@/domain/appointment-state";
import { formatMoney } from "@/domain/money";
import { fmtDate, fmtTime, tzAbbr } from "@/lib/format";
import { requireAdminPage } from "@/server/admin-guard";
import { APPOINTMENT_STATUSES, listAppointments } from "@/server/services/admin";

export const metadata: Metadata = { title: "Appointments" };

const PATH = "/admin/appointments";

export default async function AdminAppointmentsPage({ searchParams }: PageProps<"/admin/appointments">) {
  await requireAdminPage("support");
  const params = flatParams(await searchParams);
  const res = await listAppointments({ q: params.q, status: params.status, page: pageParam(params.page) });

  return (
    <>
      <AdminHeader title="Appointments" description="Every booking on the platform, newest appointment time first. Times are shown in each appointment's own time zone." />
      <div className="mb-4">
        <FilterForm
          path={PATH}
          params={params}
          q={{ label: "Search appointments" }}
          placeholder="Reference, business or customer email"
          selects={[{ name: "status", label: "Status", options: [{ value: "", label: "Any status" }, ...APPOINTMENT_STATUSES.map((s) => ({ value: s, label: STATUS_LABELS[s] }))] }]}
        />
      </div>
      <Panel>
        {res.items.length === 0 ? (
          <TableEmpty title="No appointments match" description="Search by booking reference (e.g. K7Q-4M2), business name or customer email." />
        ) : (
          <Table label="Appointments" className="[&_table]:min-w-[880px]">
            <THead>
              <Th>Reference</Th>
              <Th>Service</Th>
              <Th>Customer</Th>
              <Th>When</Th>
              <Th>Status</Th>
              <Th>Payment</Th>
              <Th align="right">Total</Th>
            </THead>
            <TBody>
              {res.items.map((a) => (
                <Tr key={a.id}>
                  <Td>
                    <Link href={`${PATH}/${a.id}`} className="font-mono text-[13px] font-medium hover:underline">
                      {a.reference}
                    </Link>
                  </Td>
                  <Td>
                    <div className="max-w-[220px] truncate">{a.serviceName}</div>
                    <Link href={`/admin/businesses/${a.businessId}`} className="text-[13px] text-ink-3 hover:text-ink hover:underline">
                      {a.businessName}
                    </Link>
                  </Td>
                  <Td>
                    {a.customerName}
                    <div className="max-w-[200px] truncate text-[13px] text-ink-3">{a.customerEmail ?? "No email"}</div>
                  </Td>
                  <Td className="whitespace-nowrap text-ink-2">
                    {fmtDate(a.startsAt, a.timezone, { month: "short", day: "numeric", year: "numeric" })}
                    <div className="text-[13px] text-ink-3">
                      {fmtTime(a.startsAt, a.timezone)} {tzAbbr(a.startsAt, a.timezone)}
                    </div>
                  </Td>
                  <Td>
                    <Badge tone={STATUS_TONE[a.status]}>{STATUS_LABELS[a.status]}</Badge>
                  </Td>
                  <Td className="whitespace-nowrap text-[13px] text-ink-2">{humanize(a.paymentStatus)}</Td>
                  <Td align="right">{formatMoney(a.totalCents, a.currency)}</Td>
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
