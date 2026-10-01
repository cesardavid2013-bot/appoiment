import { ChevronLeft, ChevronRight, Users } from "lucide-react";
import type { Metadata } from "next";
import Link from "next/link";
import { ClientsToolbar } from "@/components/pro/clients-toolbar";
import { ButtonLink } from "@/components/ui/button";
import { EmptyState, PageHeader } from "@/components/ui/misc";
import { formatMoney } from "@/domain/money";
import { cn } from "@/lib/cn";
import { fmtDate, fmtTime } from "@/lib/format";
import { requestNow } from "@/server/clock";
import { CLIENT_SEGMENTS, customerListMeta, customerQuerySchema, listCustomers, type ClientSegment } from "@/server/services/pro";
import { proPage } from "@/server/pro-page";

export const metadata: Metadata = { title: "Clients" };

function lastVisit(iso: Date | string | null, tz: string, now: number) {
  if (!iso) return null;
  const sameYear = fmtDate(iso, tz, { year: "numeric" }) === fmtDate(new Date(now), tz, { year: "numeric" });
  return fmtDate(iso, tz, sameYear ? { month: "short", day: "numeric" } : { month: "short", day: "numeric", year: "numeric" });
}

export default async function ClientsPage({ searchParams }: PageProps<"/pro/clients">) {
  const { m } = await proPage("customers.view");
  const sp = await searchParams;
  const raw = Object.fromEntries(Object.entries(sp).map(([k, v]) => [k, Array.isArray(v) ? v[0] : v]).filter(([, v]) => v != null && v !== ""));
  const parsed = customerQuerySchema.safeParse(raw);
  const query = parsed.success ? parsed.data : customerQuerySchema.parse({});
  const [list, meta] = await Promise.all([listCustomers(m, query), customerListMeta(m)]);
  const tz = m.timezone;
  const now = requestNow();
  const scopedToOwn = !(m.permissions.has("appointments.view_all") || m.permissions.has("appointments.manage_all"));
  const filtered = Boolean(query.q || query.tag || query.segment);

  const href = (over: Record<string, string | number | null>) => {
    const next = new URLSearchParams();
    const merged: Record<string, string | number | null | undefined> = { q: query.q, sort: query.sort === "recent" ? null : query.sort, tag: query.tag, segment: query.segment, page: query.page > 1 ? query.page : null, ...over };
    for (const [k, v] of Object.entries(merged)) if (v != null && v !== "") next.set(k, String(v));
    const s = next.toString();
    return s ? `/pro/clients?${s}` : "/pro/clients";
  };

  const segments: { key: ClientSegment | null; label: string; count: number }[] = [
    { key: null, label: "All", count: meta.counts.all },
    ...(Object.keys(CLIENT_SEGMENTS) as ClientSegment[]).map((k) => ({ key: k, label: CLIENT_SEGMENTS[k], count: meta.counts[k] })),
  ];
  const from = (list.page - 1) * list.pageSize + 1;
  const to = from + list.customers.length - 1;
  const lapsed = meta.counts.lapsed;

  return (
    <div className="mx-auto max-w-6xl px-4 pb-16 pt-8 sm:px-6 lg:px-10 lg:pt-10">
      <PageHeader
        title="Clients"
        description={
          meta.counts.all === 0
            ? undefined
            : `${meta.counts.all.toLocaleString()} ${meta.counts.all === 1 ? "client" : "clients"}${scopedToOwn ? " you've served" : ""}${lapsed > 0 ? ` · ${lapsed} ${lapsed === 1 ? "hasn't" : "haven't"} been back in 60 days` : ""}.`
        }
      />

      {meta.counts.all === 0 ? (
        <EmptyState
          className="mt-8 rounded-xl border border-line"
          icon={<Users />}
          title={scopedToOwn ? "No clients yet" : "Your client list starts with your first booking"}
          description={
            scopedToOwn
              ? "Clients appear here once you've had an appointment with them."
              : "Everyone who books online or that you add to the calendar gets a profile here, with their visits, notes and spend."
          }
          action={<ButtonLink href="/pro/calendar">Open calendar</ButtonLink>}
        />
      ) : (
        <>
          <nav className="relative mt-6 border-b border-line" aria-label="Client segments">
            <ul className="-mb-px flex gap-6 overflow-x-auto scrollbar-none">
              {segments.map((s) => {
                const active = (query.segment ?? null) === s.key;
                return (
                  <li key={s.key ?? "all"} className="shrink-0">
                    <Link
                      href={href({ segment: s.key, page: null })}
                      aria-current={active ? "page" : undefined}
                      className={cn("flex h-11 items-center gap-1.5 border-b-2 text-sm font-medium transition-colors", active ? "border-ink text-ink" : "border-transparent text-ink-3 hover:text-ink")}
                    >
                      {s.label}
                      <span className={cn("text-[12px] tabular", active ? "text-ink-2" : "text-ink-3")}>{s.count.toLocaleString()}</span>
                    </Link>
                  </li>
                );
              })}
            </ul>
          </nav>

          <div className="mt-5">
            <ClientsToolbar tags={meta.tags} canSeeSpend={list.canSeeSpend} />
          </div>

          {list.customers.length === 0 ? (
            <div className="mt-6 rounded-xl border border-line px-6 py-12 text-center">
              <p className="text-[15px] font-semibold text-ink">No clients match</p>
              <p className="mt-1 text-sm text-ink-3">{query.q ? `Nobody matches “${query.q}”${query.tag || query.segment ? " with these filters" : ""}.` : "Nobody is in this view right now."}</p>
              {filtered && (
                <ButtonLink href="/pro/clients" variant="secondary" size="sm" className="mt-4">
                  Clear filters
                </ButtonLink>
              )}
            </div>
          ) : (
            <>
              {/* Desktop table */}
              <div className="mt-5 hidden overflow-hidden rounded-xl border border-line md:block">
                <table className="w-full text-sm">
                  <thead className="bg-surface-2/60 text-left text-[12px] font-medium text-ink-3">
                    <tr>
                      <th scope="col" className="px-4 py-2.5 font-medium">
                        Client
                      </th>
                      <th scope="col" className="px-4 py-2.5 font-medium">
                        Contact
                      </th>
                      <th scope="col" className="px-4 py-2.5 text-right font-medium">
                        Visits
                      </th>
                      <th scope="col" className="px-4 py-2.5 text-right font-medium">
                        No-shows
                      </th>
                      {list.canSeeSpend && (
                        <th scope="col" className="px-4 py-2.5 text-right font-medium">
                          Spent
                        </th>
                      )}
                      <th scope="col" className="px-4 py-2.5 font-medium">
                        Last visit
                      </th>
                      <th scope="col" className="px-4 py-2.5 font-medium">
                        Next visit
                      </th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-line">
                    {list.customers.map((c) => (
                      <tr key={c.id} className="relative transition-colors hover:bg-surface-2/60">
                        <td className="max-w-[240px] px-4 py-3">
                          <Link href={`/pro/clients/${c.id}`} className="block truncate font-medium text-ink after:absolute after:inset-0 focus-visible:outline-none focus-visible:after:outline-2 focus-visible:after:-outline-offset-2 focus-visible:after:outline-accent">
                            {c.name}
                          </Link>
                          {c.tags.length > 0 && <p className="mt-0.5 truncate text-[12px] text-ink-3">{c.tags.join(" · ")}</p>}
                        </td>
                        <td className="max-w-[220px] px-4 py-3 text-ink-2">
                          <span className="block truncate">{c.phone ?? c.email ?? <span className="text-ink-3">—</span>}</span>
                          {c.phone && c.email && <span className="block truncate text-[12px] text-ink-3">{c.email}</span>}
                        </td>
                        <td className="px-4 py-3 text-right text-ink tabular">{c.completedCount}</td>
                        <td className={cn("px-4 py-3 text-right tabular", c.noShowCount > 0 ? "font-medium text-danger" : "text-ink-3")}>{c.noShowCount}</td>
                        {list.canSeeSpend && <td className="px-4 py-3 text-right text-ink tabular">{formatMoney(c.totalSpentCents ?? 0, m.currency)}</td>}
                        <td className="whitespace-nowrap px-4 py-3 text-ink-2 tabular">{lastVisit(c.lastVisitAt, tz, now) ?? <span className="text-ink-3">Never</span>}</td>
                        <td className="whitespace-nowrap px-4 py-3 tabular">
                          {c.nextVisit ? (
                            <span className="text-ink">
                              {fmtDate(c.nextVisit, tz, { weekday: "short", month: "short", day: "numeric" })} <span className="text-ink-3">{fmtTime(c.nextVisit, tz)}</span>
                            </span>
                          ) : (
                            <span className="text-ink-3">—</span>
                          )}
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>

              {/* Phone list */}
              <ul className="mt-4 divide-y divide-line border-y border-line md:hidden">
                {list.customers.map((c) => (
                  <li key={c.id}>
                    <Link href={`/pro/clients/${c.id}`} className="flex items-center gap-3 py-3.5">
                      <span className="min-w-0 flex-1">
                        <span className="block truncate text-[15px] font-medium text-ink">{c.name}</span>
                        <span className="mt-0.5 block truncate text-[13px] text-ink-3">
                          {c.completedCount} {c.completedCount === 1 ? "visit" : "visits"}
                          {c.lastVisitAt && ` · last ${lastVisit(c.lastVisitAt, tz, now)}`}
                          {c.noShowCount > 0 && <span className="text-danger"> · {c.noShowCount} no-show{c.noShowCount === 1 ? "" : "s"}</span>}
                        </span>
                      </span>
                      <span className="shrink-0 text-right">
                        {list.canSeeSpend && <span className="block text-sm font-medium text-ink tabular">{formatMoney(c.totalSpentCents ?? 0, m.currency)}</span>}
                        {c.nextVisit && <span className="block text-[12px] text-accent-text tabular">Next {fmtDate(c.nextVisit, tz, { month: "short", day: "numeric" })}</span>}
                      </span>
                      <ChevronRight className="size-4 shrink-0 text-ink-3" aria-hidden />
                    </Link>
                  </li>
                ))}
              </ul>

              <div className="mt-4 flex items-center justify-between gap-4 text-sm">
                <p className="text-ink-3 tabular" aria-live="polite">
                  {from.toLocaleString()}–{to.toLocaleString()} of {list.total.toLocaleString()}
                </p>
                {(list.page > 1 || list.hasMore) && (
                  <nav className="flex gap-2" aria-label="Pages">
                    {list.page > 1 ? (
                      <ButtonLink href={href({ page: list.page - 1 > 1 ? list.page - 1 : null })} variant="secondary" size="sm" icon={<ChevronLeft className="size-4" />}>
                        Previous
                      </ButtonLink>
                    ) : null}
                    {list.hasMore ? (
                      <ButtonLink href={href({ page: list.page + 1 })} variant="secondary" size="sm">
                        Next <ChevronRight className="size-4" />
                      </ButtonLink>
                    ) : null}
                  </nav>
                )}
              </div>
            </>
          )}
        </>
      )}
    </div>
  );
}
