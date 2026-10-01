import { ArrowLeft, ChevronRight, Mail, MessageCircle, Phone } from "lucide-react";
import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import { BookClientButton, ClientNotes, ClientTags, EditClientButton, type ClientData } from "@/components/pro/client-profile";
import { ButtonLink } from "@/components/ui/button";
import { Badge } from "@/components/ui/misc";
import { STATUS_LABELS, STATUS_TONE, UPCOMING_STATUSES } from "@/domain/appointment-state";
import { AppError } from "@/domain/errors";
import { formatMoney } from "@/domain/money";
import { cn } from "@/lib/cn";
import { fmtDate, fmtTime } from "@/lib/format";
import { requestNow } from "@/server/clock";
import { customerDetail, customerListMeta, listTeam, servicesForCalendar } from "@/server/services/pro";
import { proPage } from "@/server/pro-page";

export const metadata: Metadata = { title: "Client" };

type HistoryRow = Awaited<ReturnType<typeof customerDetail>>["history"][number];

function AppointmentList({ rows, showStaff, thisYear }: { rows: HistoryRow[]; showStaff: boolean; thisYear: string }) {
  return (
    <ul className="divide-y divide-line border-y border-line">
      {rows.map((a) => (
        <li key={a.id}>
          <Link href={`/pro/appointments/${a.id}`} className="-mx-2 flex items-center gap-3 rounded-md px-2 py-3 transition-colors hover:bg-surface-2 sm:gap-4">
            <span className="w-[4.5rem] shrink-0 sm:w-24">
              <span className="block text-sm font-medium text-ink tabular">
                {fmtDate(a.startsAt, a.timezone, fmtDate(a.startsAt, a.timezone, { year: "numeric" }) === thisYear ? { month: "short", day: "numeric" } : { month: "short", day: "numeric", year: "numeric" })}
              </span>
              <span className="block whitespace-nowrap text-[12px] text-ink-3 tabular">
                {fmtDate(a.startsAt, a.timezone, { weekday: "short" })} {fmtTime(a.startsAt, a.timezone)}
              </span>
            </span>
            <span className="min-w-0 flex-1">
              <span className="block truncate text-[15px] text-ink">{a.serviceName}</span>
              {showStaff && a.memberName && <span className="block truncate text-[12px] text-ink-3">with {a.memberName}</span>}
            </span>
            <span className="hidden shrink-0 text-end text-sm text-ink-2 tabular sm:block">{formatMoney(a.totalCents, a.currency)}</span>
            <Badge tone={STATUS_TONE[a.status]} className="shrink-0">
              {STATUS_LABELS[a.status]}
            </Badge>
            <ChevronRight className="hidden size-4 shrink-0 text-ink-3 sm:block" aria-hidden />
          </Link>
        </li>
      ))}
    </ul>
  );
}

export default async function ClientPage({ params }: PageProps<"/pro/clients/[id]">) {
  const { id } = await params;
  const { viewer, m } = await proPage("customers.view");
  if (!/^[0-9a-f-]{36}$/i.test(id)) notFound();
  let d;
  try {
    d = await customerDetail(m, id);
  } catch (err) {
    if (err instanceof AppError && err.code === "not_found") notFound();
    throw err;
  }
  const canManage = m.permissions.has("customers.manage");
  const canBook = m.permissions.has("appointments.manage_all") || m.permissions.has("appointments.manage_own");
  const canMessage = m.permissions.has("messages.manage") && Boolean(d.customer.userId);
  const [services, team, meta] = await Promise.all([
    canBook ? servicesForCalendar(m.businessId) : Promise.resolve([]),
    listTeam(m.businessId),
    canManage ? customerListMeta(m) : Promise.resolve(null),
  ]);
  const activeServices = services.filter((s) => s.status === "active");
  const c = d.customer;
  const now = requestNow();
  const tz = m.timezone;
  const thisYear = fmtDate(new Date(now), tz, { year: "numeric" });
  const upcoming = d.history.filter((a) => new Date(a.startsAt).getTime() >= now && (UPCOMING_STATUSES as readonly string[]).includes(a.status)).reverse();
  const past = d.history.filter((a) => !upcoming.includes(a));
  const client: ClientData = { id: c.id, name: c.name, email: c.email, phone: c.phone, tags: c.tags, preferences: c.preferences, hasAccount: Boolean(c.userId), completedCount: c.completedCount };
  const scopedToOwn = !(m.permissions.has("appointments.view_all") || m.permissions.has("appointments.manage_all"));

  const stats: [string, string, string?][] = [
    ["Visits", String(c.completedCount)],
    ...(d.canSeeSpend && c.totalSpentCents != null ? ([["Spent", formatMoney(c.totalSpentCents, m.currency)]] as [string, string][]) : []),
    ["No-shows", String(c.noShowCount), c.noShowCount > 0 ? "text-danger" : undefined],
    ["Cancellations", String(c.cancelledCount)],
    ["Last visit", c.lastVisitAt ? fmtDate(c.lastVisitAt, tz, { month: "short", day: "numeric", year: "numeric" }) : "Never"],
    ["Next visit", upcoming[0] ? `${fmtDate(upcoming[0].startsAt, upcoming[0].timezone, { month: "short", day: "numeric" })}, ${fmtTime(upcoming[0].startsAt, upcoming[0].timezone)}` : "Not booked"],
  ];

  return (
    <div className="mx-auto max-w-5xl px-4 pb-16 pt-6 sm:px-6 lg:px-10 lg:pt-8">
      <Link href="/pro/clients" className="inline-flex h-10 items-center gap-1.5 text-sm font-medium text-ink-3 hover:text-ink">
        <ArrowLeft className="size-4" aria-hidden /> Clients
      </Link>

      <header className="mt-3 flex flex-col gap-5 border-b border-line pb-6 sm:flex-row sm:items-end sm:justify-between">
        <div className="min-w-0">
          <h1 className="font-display text-[34px] leading-[1.05] text-ink sm:text-[40px]">{c.name}</h1>
          <div className="mt-2 flex flex-wrap items-center gap-x-4 gap-y-1 text-[15px]">
            {c.phone && (
              <a href={`tel:${c.phone}`} className="inline-flex min-h-10 items-center gap-1.5 text-ink-2 hover:text-ink sm:min-h-0">
                <Phone className="size-4 text-ink-3" aria-hidden />
                {c.phone}
              </a>
            )}
            {c.email && (
              <a href={`mailto:${c.email}`} className="inline-flex min-h-10 min-w-0 max-w-full items-center gap-1.5 text-ink-2 hover:text-ink sm:min-h-0">
                <Mail className="size-4 shrink-0 text-ink-3" aria-hidden />
                <span className="truncate">{c.email}</span>
              </a>
            )}
            {!c.phone && !c.email && <span className="text-ink-3">No contact details</span>}
          </div>
          <p className="mt-1.5 text-[13px] text-ink-3">
            {c.userId ? "Books on Kept" : "Added by your team"} · client since {fmtDate(c.firstVisitAt ?? c.createdAt, tz, { month: "long", year: "numeric" })}
          </p>
        </div>
        <div className="flex flex-wrap items-center gap-2">
          {canMessage && (
            <ButtonLink href={d.conversationId ? `/pro/messages/${d.conversationId}` : `/pro/messages/new?customer=${c.id}`} variant="secondary" icon={<MessageCircle className="size-4" />}>
              Message
            </ButtonLink>
          )}
          {canManage && <EditClientButton client={client} />}
          {canBook && activeServices.length > 0 ? (
            <BookClientButton client={client} services={activeServices} team={team.map((t) => ({ id: t.id, name: t.name }))} timezone={tz} canAssignOthers={m.permissions.has("appointments.manage_all")} selfMemberId={m.memberId} />
          ) : canBook ? (
            <ButtonLink href="/pro/services/new">Add a service to book</ButtonLink>
          ) : null}
        </div>
      </header>

      <dl className={cn("mt-6 grid grid-cols-2 gap-px overflow-hidden rounded-xl border border-line bg-line sm:grid-cols-3", stats.length === 6 ? "lg:grid-cols-6" : "lg:grid-cols-5")}>
        {stats.map(([k, v, tone], i) => (
          <div key={k} className={cn("min-w-0 bg-surface px-4 py-3", stats.length === 5 && i === 4 && "col-span-2 lg:col-span-1")}>
            <dt className="text-[12px] text-ink-3">{k}</dt>
            <dd className={cn("mt-0.5 truncate text-[17px] font-semibold text-ink tabular", tone)}>{v}</dd>
          </div>
        ))}
      </dl>

      <div className="mt-10 grid gap-10 lg:grid-cols-[minmax(0,1fr)_320px]">
        <div className="min-w-0 space-y-10">
          <section aria-labelledby="up-h">
            <h2 id="up-h" className="mb-3 text-[15px] font-semibold text-ink">
              Upcoming
            </h2>
            {upcoming.length ? <AppointmentList rows={upcoming} showStaff={team.length > 1} thisYear={thisYear} /> : <p className="text-sm text-ink-3">Nothing booked{canBook ? " — use “Book appointment” to add their next visit." : "."}</p>}
          </section>
          <section aria-labelledby="hist-h">
            <h2 id="hist-h" className="mb-3 text-[15px] font-semibold text-ink">
              History {past.length > 0 && <span className="font-normal text-ink-3 tabular">· {past.length}</span>}
            </h2>
            {scopedToOwn && <p className="-mt-1 mb-3 text-[12px] text-ink-3">Showing appointments with you.</p>}
            {past.length ? <AppointmentList rows={past} showStaff={team.length > 1} thisYear={thisYear} /> : <p className="text-sm text-ink-3">No past appointments.</p>}
          </section>
        </div>

        <aside className="space-y-10">
          {(c.preferences || canManage) && (
            <section aria-labelledby="pref-h">
              <h2 id="pref-h" className="text-[15px] font-semibold text-ink">
                Preferences
              </h2>
              <p className={cn("mt-2 whitespace-pre-line text-sm leading-relaxed", c.preferences ? "text-ink-2" : "text-ink-3")}>{c.preferences || "Nothing saved. Use Edit to note allergies, favourite products or who they like to see."}</p>
            </section>
          )}
          <section aria-labelledby="tags-h">
            <h2 id="tags-h" className="mb-2.5 text-[15px] font-semibold text-ink">
              Tags
            </h2>
            <ClientTags client={client} canEdit={canManage} suggestions={meta?.tags.map((t) => t.tag) ?? []} />
          </section>
          <ClientNotes
            clientId={c.id}
            notes={d.notes.map((n) => ({ ...n, createdAt: n.createdAt.toISOString() }))}
            canAdd={canManage}
            canDeleteAll={canManage}
            viewerId={viewer.id}
            serverNow={now}
          />
        </aside>
      </div>
    </div>
  );
}
